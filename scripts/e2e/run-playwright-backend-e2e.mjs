import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PLAYWRIGHT_BINARY = join('node_modules', '.bin', process.platform === 'win32' ? 'playwright.cmd' : 'playwright');
export const FORBIDDEN_ENV_KEYS = [
  'DATABASE_URL',
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY',
  'KIMI_API_KEY',
  'TTS_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'COS_SECRET_ID',
  'COS_SECRET_KEY',
  'MEDIA_STORAGE_URL',
  'STORAGE_ENDPOINT',
  'AUTHORIZATION',
  'COOKIE'
];

export class E2eFailure extends Error {}

export function assertSafeTestProfile(env = process.env) {
  const present = FORBIDDEN_ENV_KEYS.filter((key) => Boolean(env[key]));
  if (present.length > 0) throw new E2eFailure(`Unsafe E2E environment variables present: ${present.join(', ')}`);
  if (env.E2E_PROFILE && env.E2E_PROFILE !== 'rp01a-local-inmemory') {
    throw new E2eFailure(`Unsupported E2E profile: ${env.E2E_PROFILE}`);
  }
  if (env.AI_PROVIDER_MODE && env.AI_PROVIDER_MODE !== 'mock') {
    throw new E2eFailure('RP-01A E2E only allows AI_PROVIDER_MODE=mock');
  }
}

export function sanitizeLog(text) {
  return String(text)
    .replace(/(Authorization|Cookie)\s*:\s*[^\n\r]+/gi, '$1: [REDACTED]')
    .replace(/(api[_-]?key|token|secret|password)=([^&\s]+)/gi, '$1=[REDACTED]')
    .replace(/mysql:\/\/[^\s]+/gi, 'mysql://[REDACTED]')
    .replace(/DATABASE_URL=([^\s]+)/g, 'DATABASE_URL=[REDACTED]')
    .replace(/(prompt|rawPrompt|rawResponse|modelResponse|providerResponse)["']?\s*[:=]\s*["'][\s\S]{20,}?["']/gi, '$1=[REDACTED]');
}

export async function findAvailablePort(preferredPort) {
  if (preferredPort) {
    await assertPortAvailable(preferredPort);
    return preferredPort;
  }
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

export async function assertPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new E2eFailure(`Port ${port} is already in use`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

export async function waitForHttpReady(url, { timeoutMs, label, children = [] }) {
  const startedAt = Date.now();
  let lastError = '';
  while (Date.now() - startedAt < timeoutMs) {
    const exited = children.find((child) => child.exitCode !== null);
    if (exited) throw new E2eFailure(`${label} exited before ready with code ${exited.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  throw new E2eFailure(`${label} health timeout: ${url}; last=${lastError}`);
}

export async function waitForAdminReady(url, options) {
  const startedAt = Date.now();
  let lastError = '';
  while (Date.now() - startedAt < options.timeoutMs) {
    const exited = options.children.find((child) => child.exitCode !== null);
    if (exited) throw new E2eFailure(`admin exited before ready with code ${exited.exitCode}`);
    try {
      const response = await fetch(url);
      const text = await response.text();
      if (response.ok && text.includes('<div id="app"></div>')) return;
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  throw new E2eFailure(`admin HTML timeout: ${url}; last=${lastError}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertSafeTestProfile(process.env);
  const runId = `rp01a-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const artifactDir = join('output', 'playwright', 'rp-01a', runId);
  mkdirSync(artifactDir, { recursive: true });
  const children = [];
  let blocker;
  try {
    const apiPort = await findAvailablePort(Number(process.env.E2E_API_PORT) || undefined);
    const adminPort = await findAvailablePort(Number(process.env.E2E_ADMIN_PORT) || undefined);
    if (options.failure === 'port-conflict') {
      blocker = await occupyPort(apiPort);
      await assertPortAvailable(apiPort);
    }

    const api = startChild('api', ['node_modules/.bin/tsx', 'scripts/e2e/api-e2e-server.ts'], {
      PORT: String(apiPort),
      NODE_ENV: 'test',
      E2E_PROFILE: 'rp01a-local-inmemory',
      AI_PROVIDER_MODE: 'mock',
      DOTENV_CONFIG_PATH: '/dev/null',
      E2E_FORCE_API_START_FAILURE: options.failure === 'api-start-failure' ? '1' : undefined
    }, artifactDir);
    children.push(api);
    const admin = startChild('admin', ['npm', 'run', 'dev', '-w', 'apps/admin-web', '--', '--host', '127.0.0.1', '--port', String(adminPort), '--strictPort'], {
      VITE_DATA_SOURCE: 'backend',
      VITE_API_BASE_URL: `http://127.0.0.1:${apiPort}`
    }, artifactDir);
    children.push(admin);

    const timeoutMs = options.timeoutMs ?? (options.failure === 'health-timeout' ? 1_000 : 20_000);
    const healthUrl = options.failure === 'health-timeout' ? `http://127.0.0.1:${apiPort}/__never_ready` : `http://127.0.0.1:${apiPort}/health`;
    await waitForHttpReady(healthUrl, { timeoutMs, label: 'api', children });
    await waitForAdminReady(`http://127.0.0.1:${adminPort}`, { timeoutMs: 20_000, children });

    const playwright = startChild('playwright', [PLAYWRIGHT_BINARY, 'test', '--config', 'playwright.config.mjs', 'tests/e2e/novel-backend.spec.mjs'], {
      PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${adminPort}`,
      E2E_ARTIFACT_DIR: join(artifactDir, 'playwright-artifacts'),
      E2E_RUN_ID: runId,
      E2E_FORCE_BROWSER_ASSERTION_FAILURE: options.failure === 'browser-failure' ? '1' : undefined
    }, artifactDir);
    const code = await waitForExit(playwright);
    if (code !== 0) throw new E2eFailure(`browser assertion failed; see ${artifactDir}/playwright.log`);
    writeFileSync(join(artifactDir, 'summary.txt'), sanitizeLog(`RP-01A E2E passed\nrunId=${runId}\napiPort=${apiPort}\nadminPort=${adminPort}\n`));
    console.log(`RP-01A E2E passed; artifacts=${artifactDir}`);
  } finally {
    if (blocker) await new Promise((resolve) => blocker.close(resolve));
    await stopChildren(children);
  }
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--failure') options.failure = args[++index];
    else if (args[index] === '--timeout-ms') options.timeoutMs = Number(args[++index]);
    else throw new E2eFailure(`Unknown argument: ${args[index]}`);
  }
  return options;
}

function startChild(name, command, extraEnv, artifactDir) {
  const [bin, ...args] = command;
  const child = spawn(bin, args, {
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: createChildEnv(extraEnv)
  });
  const logPath = join(artifactDir, `${name}.log`);
  const append = (chunk) => {
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(logPath, sanitizeLog(chunk.toString()), { flag: 'a' });
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  return child;
}

function createChildEnv(extraEnv) {
  const safe = { ...process.env, ...extraEnv };
  for (const key of FORBIDDEN_ENV_KEYS) delete safe[key];
  for (const [key, value] of Object.entries(safe)) {
    if (value === undefined) delete safe[key];
  }
  safe.E2E_PROFILE = 'rp01a-local-inmemory';
  safe.AI_PROVIDER_MODE = 'mock';
  return safe;
}

async function stopChildren(children) {
  await Promise.all(children.map((child) => stopChild(child)));
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  await Promise.race([waitForExit(child), delay(2_000)]);
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

function waitForExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) resolve(child.exitCode);
    else child.once('exit', (code) => resolve(code ?? 1));
  });
}

function occupyPort(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    if (error instanceof E2eFailure || error instanceof Error) {
      console.error(sanitizeLog(error.message));
      process.exitCode = 1;
    } else {
      throw error;
    }
  });
}
