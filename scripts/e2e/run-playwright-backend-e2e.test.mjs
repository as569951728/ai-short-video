import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  E2eFailure,
  assertPortAvailable,
  assertSafeTestProfile,
  prepareSanitizedUpload,
  sanitizeLog,
  waitForHttpReady
} from './run-playwright-backend-e2e.mjs';

describe('RP-01A Playwright backend E2E runner guards', () => {
  it('rejects real database and provider environment variables', () => {
    assert.throws(() => assertSafeTestProfile({ DATABASE_URL: 'mysql://user:pass@localhost/prod' }), E2eFailure);
    assert.throws(() => assertSafeTestProfile({ DEEPSEEK_API_KEY: 'sk-real' }), E2eFailure);
    assert.throws(() => assertSafeTestProfile({ AI_PROVIDER_MODE: 'deepseek' }), E2eFailure);
    assert.doesNotThrow(() => assertSafeTestProfile({ E2E_PROFILE: 'rp01a-local-inmemory', AI_PROVIDER_MODE: 'mock' }));
  });

  it('redacts credentials and provider raw fields from logs', () => {
    const redacted = sanitizeLog(
      'Authorization: Bearer secret\nCookie: sid=secret\nDATABASE_URL=mysql://u:p@localhost/db prompt="long sensitive prompt body"'
    );
    assert.equal(redacted.includes('Bearer secret'), false);
    assert.equal(redacted.includes('sid=secret'), false);
    assert.equal(redacted.includes('mysql://u:p@localhost/db'), false);
    assert.equal(redacted.includes('long sensitive prompt body'), false);
  });

  it('redacts quoted JSON secret fields without removing safe text', () => {
    const redacted = sanitizeLog(
      JSON.stringify({
        authorization: 'Bearer value-to-redact',
        cookie: 'sid=value-to-redact',
        database_url: 'mysql://u:p@localhost/db',
        rawResponse: { body: 'value-to-redact' },
        providerPayload: 'value-to-redact',
        safeSummary: 'kept summary'
      })
    );
    assert.equal(redacted.includes('value-to-redact'), false);
    assert.equal(redacted.includes('mysql://u:p@localhost/db'), false);
    assert.equal(redacted.includes('kept summary'), true);
  });

  it('detects occupied ports before startup', async () => {
    const server = await occupyRandomPort();
    const address = server.address();
    await assert.rejects(() => assertPortAvailable(address.port), E2eFailure);
    await new Promise((resolve) => server.close(resolve));
  });

  it('fails readiness checks with a timeout when health never responds', async () => {
    await assert.rejects(
      () => waitForHttpReady('http://127.0.0.1:9/health', { timeoutMs: 100, label: 'api', children: [] }),
      E2eFailure
    );
  });

  it('aborts stalled readiness requests instead of waiting for the workflow timeout', async () => {
    const server = await createStallServer();
    const address = server.address();
    const startedAt = Date.now();
    await assert.rejects(
      () => waitForHttpReady(`http://127.0.0.1:${address.port}/health`, { timeoutMs: 200, label: 'api', children: [] }),
      E2eFailure
    );
    assert.equal(Date.now() - startedAt < 1_500, true);
    await new Promise((resolve) => server.close(resolve));
  });

  it('copies only sanitized text artifacts into the CI upload directory', () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'rp01a-artifacts-'));
    mkdirSync(join(artifactDir, 'playwright-artifacts'), { recursive: true });
    writeFileSync(join(artifactDir, 'api.log'), 'Authorization: Bearer value-to-redact\nsafe api line');
    writeFileSync(join(artifactDir, 'playwright.log'), '{"rawResponse":"value-to-redact","safeSummary":"kept"}');
    writeFileSync(join(artifactDir, 'playwright-artifacts', 'trace.zip'), 'raw trace bytes');
    const uploadDir = prepareSanitizedUpload(artifactDir);
    assert.equal(readFileSync(join(uploadDir, 'api.log'), 'utf8').includes('value-to-redact'), false);
    assert.equal(readFileSync(join(uploadDir, 'playwright.log'), 'utf8').includes('kept'), true);
    assert.equal(existsSync(join(uploadDir, 'trace.zip')), false);
  });

  it('uses the repository-local Playwright binary instead of npx package resolution', () => {
    const runnerSource = readFileSync(new URL('./run-playwright-backend-e2e.mjs', import.meta.url), 'utf8');
    assert.match(runnerSource, /PLAYWRIGHT_BINARY/);
    assert.doesNotMatch(runnerSource, /npx|--package/);
  });

  it('keeps the root E2E command self-contained for clean clones', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    assert.equal(
      packageJson.scripts['e2e:rp01a'],
      'npm run build -w @ai-shortvideo/shared && npm run prisma:generate -w @ai-shortvideo/api && node scripts/e2e/run-playwright-backend-e2e.mjs'
    );
  });

  it('runs on API, admin and shared source changes in CI', () => {
    const workflowSource = readFileSync(new URL('../../.github/workflows/rp01a-e2e.yml', import.meta.url), 'utf8');
    for (const requiredPath of ['apps/api/src/**', 'apps/admin-web/src/**', 'packages/shared/src/**']) {
      assert.match(workflowSource, new RegExp(requiredPath.replaceAll('*', '\\*')));
    }
    assert.equal(workflowSource.includes('./node_modules/.bin/playwright install chromium'), true);
    assert.doesNotMatch(workflowSource, /npx playwright install chromium/);
    assert.equal(workflowSource.includes('  push:'), true);
    assert.equal(workflowSource.includes('npm run e2e:rp01a'), true);
    assert.equal(workflowSource.includes('npm run build -w @ai-shortvideo/shared'), false);
    assert.equal(workflowSource.includes('sanitized-upload/*.log'), true);
    assert.equal(workflowSource.includes('sanitized-upload/summary.txt'), true);
    assert.equal(workflowSource.split('\n').some((line) => line.trim() === 'path: output/playwright/rp-01a/**'), false);
    assert.equal(workflowSource.split('\n').some((line) => line.trim() === 'output/playwright/rp-01a/**'), false);
  });
});

function occupyRandomPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function createStallServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => {
      socket.on('data', () => {});
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}
