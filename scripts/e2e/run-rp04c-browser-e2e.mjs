import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FORBIDDEN_ENV_KEYS = [
  'DATABASE_URL',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BASE_URL',
  'DEEPSEEK_MODEL',
  'DEEPSEEK_STRUCTURE_MODEL',
  'DEEPSEEK_REASONER_MODEL',
  'OPENAI_API_KEY',
  'KIMI_API_KEY',
  'TTS_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'COS_SECRET_ID',
  'COS_SECRET_KEY'
];

const children = [];
let stopping = false;

await main().finally(() => stopChildren());

async function main() {
  assertSafeEnvironment();
  const runId = `rp04c-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const runDir = join('output', 'playwright', 'rp-04c', runId);
  const evidencePath = join(runDir, 'safe-evidence.json');
  const playwrightOutputDir = resolve(process.cwd(), runDir, 'playwright-no-trace');
  mkdirSync(runDir, { recursive: true });

  const apiPort = await findAvailablePort();
  const adminPort = await findAvailablePort();
  const api = startChild('./node_modules/.bin/tsx', ['scripts/e2e/rp04c-api-e2e-server.ts'], {
    PORT: String(apiPort),
    NODE_ENV: 'test',
    E2E_PROFILE: 'rp04c-local-inmemory',
    AI_PROVIDER_MODE: 'mock',
    DOTENV_CONFIG_PATH: '/dev/null'
  });
  children.push(api);
  const admin = startChild('npm', ['run', 'dev', '-w', 'apps/admin-web', '--', '--host', '127.0.0.1', '--port', String(adminPort), '--strictPort'], {
    VITE_DATA_SOURCE: 'backend',
    VITE_API_BASE_URL: `http://127.0.0.1:${apiPort}`
  });
  children.push(admin);

  await waitForReady(`http://127.0.0.1:${apiPort}/health`, 'API');
  await waitForReady(`http://127.0.0.1:${adminPort}`, 'admin');

  const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const gitTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
  const worktreeDirty = Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim());
  const executableScopeHash = hashExecutableScope([
    'package.json',
    'scripts/e2e/rp04c-api-e2e-server.ts',
    'scripts/e2e/playwright-rp04c.config.mjs',
    'scripts/e2e/run-rp04c-browser-e2e.mjs',
    'tests/e2e/rp04c-full-review.spec.mjs'
  ]);
  const playwright = startChild('./node_modules/.bin/playwright', [
    'test',
    '--config',
    'scripts/e2e/playwright-rp04c.config.mjs',
    'tests/e2e/rp04c-full-review.spec.mjs'
  ], {
    PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${adminPort}`,
    RP04C_API_ORIGIN: `http://127.0.0.1:${apiPort}`,
    RP04C_RUN_ID: runId,
    RP04C_GIT_SHA: gitSha,
    RP04C_GIT_TREE: gitTree,
    RP04C_WORKTREE_DIRTY: String(worktreeDirty),
    RP04C_EXECUTABLE_SCOPE_HASH: executableScopeHash,
    RP04C_EVIDENCE_PATH: evidencePath,
    RP04C_PLAYWRIGHT_OUTPUT_DIR: playwrightOutputDir
  });
  children.push(playwright);
  const exitCode = await waitForExit(playwright);
  rmSync(playwrightOutputDir, { recursive: true, force: true });
  if (!existsSync(evidencePath)) throw new Error('RP-04C safe evidence summary was not generated');

  const evidenceText = readFileSync(evidencePath, 'utf8');
  assertSafeEvidence(evidenceText);
  const evidence = JSON.parse(evidenceText);
  if (exitCode !== 0) {
    console.error(JSON.stringify({
      result: 'FAILED',
      conclusion: evidence.conclusion,
      evidencePath,
      evidenceHash: evidence.evidenceHash,
      failures: evidence.failures
    }, null, 2));
    throw new Error(`RP-04C browser acceptance failed with exit code ${exitCode}`);
  }
  if (evidence.browserConclusion !== 'candidate_for_independent_review') {
    throw new Error(`RP-04C browser conclusion is ${evidence.browserConclusion}`);
  }
  console.log(`RP-04C browser acceptance passed: ${evidencePath}`);
  console.log(`evidenceHash=${evidence.evidenceHash}`);
}

function assertSafeEnvironment() {
  const present = FORBIDDEN_ENV_KEYS.filter((key) => process.env[key]);
  if (present.length) throw new Error(`RP-04C refuses real environment variables: ${present.join(', ')}`);
  if (process.env.E2E_PROFILE !== 'rp04c-local-inmemory') throw new Error('E2E_PROFILE must be rp04c-local-inmemory');
  if (process.env.AI_PROVIDER_MODE !== 'mock') throw new Error('AI_PROVIDER_MODE must be mock');
  if (process.env.DOTENV_CONFIG_PATH !== '/dev/null') throw new Error('DOTENV_CONFIG_PATH must be /dev/null');
}

function childEnvironment(extra) {
  const env = { ...process.env, ...extra };
  for (const key of FORBIDDEN_ENV_KEYS) delete env[key];
  return env;
}

function startChild(command, args, extraEnv) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    detached: true,
    stdio: 'inherit',
    env: childEnvironment(extraEnv)
  });
  return child;
}

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForReady(url, label) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const exited = children.find((child) => child.exitCode !== null);
    if (exited) throw new Error(`${label} dependency exited before readiness`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Expected while the local process is starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} readiness timed out`);
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve) => child.once('exit', (code) => resolve(code ?? 1)));
}

async function stopChildren() {
  if (stopping) return;
  stopping = true;
  for (const child of children.reverse()) {
    if (!child.pid || child.exitCode !== null) continue;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Process already exited.
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
}

function assertSafeEvidence(text) {
  const forbidden = [
    /DEEPSEEK_API_KEY/i,
    /Bearer\s+[A-Za-z0-9._-]+/i,
    /mysql:\/\//i,
    /"(?:rawResponse|providerResponse|providerBody|prompt|messages)"\s*:/i,
    /chapterText|fullChapterBody|rawContent/i
  ];
  if (forbidden.some((pattern) => pattern.test(text))) throw new Error('RP-04C evidence summary contains forbidden material');
}

function hashExecutableScope(paths) {
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(path);
    hash.update('\0');
    hash.update(readFileSync(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}
