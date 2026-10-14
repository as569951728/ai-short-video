import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, expect, type Browser, type Page } from '@playwright/test';
import type { PrismaClient as DatabaseClient } from '../../apps/api/src/generated/prisma/client.js';

// Run explicitly with: node --import tsx scripts/e2e/novel-prisma-overlength-browser-smoke.mts --run
// Requires installed dependencies, local Docker and cached mysql:8.4.
// Never accepts an existing database URL. Every run owns its container, schema and accounts.
// Runtime sources and shared build are pinned to HEAD (or E1_BROWSER_REVISION), not concurrent edits.
const mysqlOnly = process.argv[2] === '--mysql-only';
if (!mysqlOnly && process.argv[2] !== '--run') {
  console.log('Usage: node --import tsx scripts/e2e/novel-prisma-overlength-browser-smoke.mts --run | --mysql-only');
  console.log('Runs a 135-second mock call, refreshes during execution (65s and 120s), then verifies DB/API/UI readback.');
  console.log('Creates and removes a disposable loopback MySQL 8.4 container; no model credentials or .env files are loaded.');
  console.log('Pins runtime sources to HEAD; set E1_BROWSER_REVISION to verify a specific commit.');
  console.log('For the three-action flow: E1_BROWSER_ACTION=chapterActions E1_BROWSER_REVISION=working-tree');
  console.log('--mysql-only creates a separate migrated test DB and a 0600 mysql-only.env; Ctrl+C removes both.');
  process.exit(0);
}

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let root = workspace;
const scenario = process.env.E1_BROWSER_ACTION ?? 'overlength';
assert.ok(['overlength', 'chapterActions'].includes(scenario), 'Only overlength and chapterActions are supported.');
const scenarioSlug = scenario === 'chapterActions' ? 'chapter-actions' : 'overlength';
const runId = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}_${randomBytes(3).toString('hex')}`;
const artifactDir = resolve(root, `output/playwright/e1-${scenarioSlug}`, runId);
const container = `aisv-e1-${scenarioSlug}-${runId.replace('_', '-')}`;
const schema = `ai_shortvideo_e1_${scenario.toLowerCase()}_${runId}`;
const account = `e1_browser_${randomBytes(4).toString('hex')}`;
const databasePassword = randomBytes(24).toString('hex');
const rootPassword = randomBytes(24).toString('hex');
const scopeSecret = randomBytes(32).toString('hex');
const delayMs = scenario === 'chapterActions' ? 120_000 : 135_000;
const baseEnv: NodeJS.ProcessEnv = {};
for (const key of ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL']) {
  if (process.env[key]) baseEnv[key] = process.env[key];
}
const mockEnv = { ...baseEnv, NODE_ENV: 'development', AI_PROVIDER_MODE: 'mock', DOTENV_CONFIG_PATH: '/dev/null' };
const children: { name: string; child: ChildProcess; output: string }[] = [];
const evidence: Record<string, any> = { runId, scenario, result: 'RUNNING', startedAt: new Date().toISOString(),
  mode: mysqlOnly ? 'isolated_mysql_environment_only' : 'browser_acceptance',
  environment: 'disposable loopback MySQL 8.4 + real Chromium + mock-only provider', delayMs,
  notProven: ['paid-provider billing', 'process-kill recovery for these actions', 'production enablement',
    ...(scenario === 'chapterActions'
      ? ['segmented body generation recovery (E2)', 'segmented chapter-plan recovery (E3)', 'non-MINOR impact resolution branches']
      : ['other chapter actions'])] };
let browser: Browser | undefined;
let page: Page | undefined;
let prisma: Awaited<ReturnType<typeof openDatabase>> | undefined;
let containerId: string | undefined;
let mysqlEnvFile: string | undefined;
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { interrupted = true; });

function redact(value: string) {
  for (const secret of [databasePassword, rootPassword, scopeSecret]) value = value.replaceAll(secret, '[REDACTED]');
  return value.replace(/mysql:\/\/[^\s"']+/g, '[REDACTED_DATABASE_URL]');
}

async function save(name: string, data: unknown) {
  await writeFile(resolve(artifactDir, name), redact(typeof data === 'string' ? data : JSON.stringify(data, null, 2)));
}

function hash(value: unknown) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

async function command(executable: string, args: string[], env = baseEnv, cwd = root, timeout = 120_000) {
  return new Promise<string>((resolveCommand, reject) => {
    const child = spawn(executable, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { output += data; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolveCommand(output.trim());
      else reject(new Error(`${executable.split('/').at(-1)} failed (${code}): ${redact(output).slice(-3000)}`));
    });
  });
}

function start(name: string, executable: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(executable, args, { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const entry = { name, child, output: '' };
  children.push(entry);
  child.stdout!.on('data', (data) => { entry.output += data; });
  child.stderr!.on('data', (data) => { entry.output += data; });
  child.once('error', (error) => { entry.output += error.name; });
  return entry;
}

async function until(label: string, condition: () => Promise<boolean> | boolean, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  do {
    if (interrupted) throw new Error('Interrupted; cleaning up owned resources.');
    if (await condition()) return;
    await sleep(250);
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${label}`);
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('No available loopback port.'));
      server.close(() => resolvePort(address.port));
    });
  });
}

async function openDatabase(url: string): Promise<DatabaseClient> {
  const { PrismaClient } = await import(pathToFileURL(resolve(root, 'apps/api/src/generated/prisma/client.ts')).href);
  const { PrismaMariaDb } = await import('@prisma/adapter-mariadb');
  return new PrismaClient({ adapter: new PrismaMariaDb(url) });
}

async function screenshot(name: string) {
  await page!.screenshot({ path: resolve(artifactDir, `${name}.png`), fullPage: true });
  await save(`${name}.aria.txt`, await page!.locator('body').ariaSnapshot());
}

async function formalSnapshot(novelId: string) {
  const chapters = await prisma!.novelChapter.findMany({ where: { novelId }, orderBy: { chapterNo: 'asc' },
    select: { id: true, chapterNo: true, currentContentVersionId: true,
      currentFeatureCardVersionId: true, currentReviewReportId: true, wordCount: true, mainStatus: true } });
  const versions = await prisma!.chapterContentVersion.findMany({ where: { novelId, status: 'CURRENT' }, orderBy: { id: 'asc' } });
  return { chapters, versions: versions.map(({ content, ...row }) => ({ ...row, contentHash: hash(content) })) };
}

try {
  await mkdir(artifactDir, { recursive: true });
  evidence.headBefore = await command('git', ['rev-parse', 'HEAD']);
  evidence.worktreeBefore = await command('git', ['status', '--short']);
  const revision = process.env.E1_BROWSER_REVISION ?? evidence.headBefore;
  assert.ok(revision === 'working-tree' || /^[a-f0-9]{7,40}$/.test(revision), 'E1_BROWSER_REVISION must be a commit hash or working-tree.');
  evidence.runtimeRevision = revision === 'working-tree' ? 'working-tree'
    : await command('git', ['rev-parse', '--verify', `${revision}^{commit}`]);
  evidence.runtimeBaseCommit = evidence.headBefore;
  const snapshot = resolve(artifactDir, 'source');
  await mkdir(snapshot);
  const sourcePaths = ['apps/api/src', 'apps/api/prisma', 'apps/api/prisma.config.ts', 'apps/api/package.json',
    'apps/admin-web', 'packages/shared', 'package.json', 'package-lock.json'];
  await command('git', ['archive', '--format=tar', `--output=${resolve(artifactDir, 'source.tar')}`,
    revision === 'working-tree' ? evidence.headBefore : evidence.runtimeRevision, ...sourcePaths]);
  await command('tar', ['-xf', resolve(artifactDir, 'source.tar'), '-C', snapshot]);
  if (revision === 'working-tree') {
    const patch = await command('git', ['diff', '--binary', 'HEAD', '--', ...sourcePaths]);
    await save('runtime.patch', patch);
    const files = (await command('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...sourcePaths])).split('\n');
    const manifest: Record<string, string> = {};
    for (const file of files) {
      const target = resolve(snapshot, file);
      assert.ok(target.startsWith(`${snapshot}/`));
      try {
        const content = await readFile(resolve(workspace, file));
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content);
        manifest[file] = createHash('sha256').update(content).digest('hex');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        await rm(target, { force: true });
      }
    }
    assert.equal(await command('git', ['diff', '--binary', 'HEAD', '--', ...sourcePaths]), patch,
      'Runtime sources changed during snapshot capture; rerun to freeze a stable input.');
    await save('runtime-source-hashes.json', manifest);
    evidence.runtimeSourceManifestHash = hash(manifest);
  }
  // Dependency links share installed tools only; @ai-shortvideo/shared is built from the pinned sources.
  await mkdir(resolve(snapshot, 'node_modules/@ai-shortvideo'), { recursive: true });
  for (const name of await readdir(resolve(workspace, 'node_modules'))) {
    if (name !== '@ai-shortvideo') await symlink(resolve(workspace, 'node_modules', name), resolve(snapshot, 'node_modules', name));
  }
  await symlink(resolve(snapshot, 'packages/shared'), resolve(snapshot, 'node_modules/@ai-shortvideo/shared'));
  const serverPath = 'apps/api/test/rp02b2a/prisma-browser-delayed-server.ts';
  await mkdir(dirname(resolve(snapshot, serverPath)), { recursive: true });
  await copyFile(resolve(workspace, serverPath), resolve(snapshot, serverPath));
  await copyFile(fileURLToPath(import.meta.url), resolve(artifactDir, 'runner.mts'));
  if (scenario === 'chapterActions') await copyFile(resolve(workspace, 'scripts/e2e/novel-prisma-chapter-actions-browser-scenario.mts'),
    resolve(artifactDir, 'chapter-actions-scenario.mts'));
  root = snapshot;
  await save('shared-build.log', await command(resolve(root, 'node_modules/.bin/tsc'), ['-p', 'packages/shared/tsconfig.json'], mockEnv));
  const dockerEndpoint = await command('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
  assert.match(dockerEndpoint, /^unix:\/\//, 'Only a local Docker socket is allowed.');
  evidence.mysqlImage = await command('docker', ['image', 'inspect', 'mysql:8.4', '--format', '{{.Id}}']);
  console.log(`E1_BROWSER_EVIDENCE=${artifactDir}`);
  containerId = await command('docker', ['run', '--detach', '--rm', '--pull=never', '--name', container,
    '--label', `ai-shortvideo.e1-smoke=${scenarioSlug}`, '--tmpfs', '/var/lib/mysql',
    '--publish', '127.0.0.1::3306', '--env', 'MYSQL_ROOT_PASSWORD', '--env', 'MYSQL_DATABASE',
    '--env', 'MYSQL_USER', '--env', 'MYSQL_PASSWORD', 'mysql:8.4'],
  { ...baseEnv, MYSQL_ROOT_PASSWORD: rootPassword, MYSQL_DATABASE: schema,
    MYSQL_USER: account, MYSQL_PASSWORD: databasePassword });
  assert.match(containerId, /^[a-f0-9]{64}$/);
  const bindings = JSON.parse(await command('docker', ['inspect', '--format', '{{json .NetworkSettings.Ports}}', containerId]));
  const binding = bindings['3306/tcp'];
  assert.equal(binding.length, 1);
  assert.equal(binding[0].HostIp, '127.0.0.1');
  assert.notEqual(binding[0].HostPort, '3306');
  const databaseUrl = `mysql://${account}:${databasePassword}@127.0.0.1:${binding[0].HostPort}/${schema}`;
  evidence.database = { container, schema, account, host: '127.0.0.1', port: binding[0].HostPort };
  // Check the final TCP listener, not the initialization-only Unix socket server.
  await until('disposable MySQL startup', async () => {
    try {
      return await command('docker', ['exec', containerId!, 'sh', '-c',
        'MYSQL_PWD="$MYSQL_PASSWORD" mysql --protocol=TCP -h127.0.0.1 -u"$MYSQL_USER" "$MYSQL_DATABASE" --batch --skip-column-names -e "SELECT 1"'], baseEnv, root, 5000) === '1';
    } catch { return false; }
  }, 90_000);
  const apiEnv = { ...mockEnv, DATABASE_URL: databaseUrl, E1_MYSQL_SMOKE_URL: databaseUrl,
    E1_BROWSER_SMOKE: 'true', E1_BROWSER_ACTION: scenario, E1_BROWSER_MODEL_DELAY_MS: String(delayMs),
    NOVEL_ASYNC_SCOPE_SECRET: scopeSecret, NOVEL_ASYNC_API_AUDIENCE: 'e1-overlength-browser' };
  await save('prisma-generate.log', await command(resolve(root, 'node_modules/.bin/prisma'), ['generate'], apiEnv, resolve(root, 'apps/api')));
  await save('migration.log', await command(resolve(root, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], apiEnv, resolve(root, 'apps/api')));
  prisma = await openDatabase(databaseUrl);
  assert.deepEqual(await prisma.$queryRawUnsafe('SELECT DATABASE() AS name'), [{ name: schema }]);
  await save('database-grants.json', await prisma.$queryRawUnsafe('SHOW GRANTS FOR CURRENT_USER'));
  if (mysqlOnly) {
    mysqlEnvFile = resolve(artifactDir, 'mysql-only.env');
    await writeFile(mysqlEnvFile, `export DATABASE_URL='${databaseUrl}'\nexport E1_MYSQL_SMOKE_URL='${databaseUrl}'\n`, { mode: 0o600 });
    evidence.environmentFile = mysqlEnvFile;
    console.log(JSON.stringify({ event: 'E1_MYSQL_READY', envFile: mysqlEnvFile, ...evidence.database,
      ownerPid: process.pid, stop: 'Stop dependent processes first, then SIGINT/SIGTERM this owner PID.' }));
    while (!interrupted) await sleep(250);
  } else {
  const apiPort = await freePort();
  const adminPort = await freePort();
  const api = start('api', resolve(root, 'node_modules/.bin/tsx'), ['apps/api/test/rp02b2a/prisma-browser-delayed-server.ts'],
    { ...apiEnv, PORT: String(apiPort) });
  await until('fixture server ready', () => {
    if (api.child.exitCode !== null) throw new Error(`Fixture server exited: ${redact(api.output).slice(-3000)}`);
    return api.output.includes('E1_BROWSER_READY=');
  }, 60_000);
  const fixturePrefix = scenario === 'chapterActions' ? 'E1_CHAPTER_ACTIONS_BROWSER_FIXTURE=' : 'E1_OVERLENGTH_BROWSER_FIXTURE=';
  const fixtureLine = api.output.split('\n').find((line) => line.startsWith(fixturePrefix));
  assert.ok(fixtureLine, 'Missing fixture IDs.');
  const fixture = JSON.parse(fixtureLine.slice(fixtureLine.indexOf('=') + 1));
  evidence.fixture = fixture;
  const originalBefore = scenario === 'overlength'
    ? await prisma.chapterContentVersion.findUniqueOrThrow({ where: { id: fixture.originalId } }) : null;
  const formalBefore = await formalSnapshot(fixture.novelId);
  assert.equal(formalBefore.versions.length, 1, 'Must have a nonempty formal-body control.');
  await save('formal-before.json', formalBefore);
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const adminUrl = `http://127.0.0.1:${adminPort}`;
  const admin = start('admin', resolve(root, 'node_modules/.bin/vite'),
    ['apps/admin-web', '--config', 'apps/admin-web/vite.config.ts', '--host', '127.0.0.1', '--port', String(adminPort), '--strictPort'],
    { ...mockEnv, VITE_DATA_SOURCE: 'backend', VITE_API_BASE_URL: apiUrl });
  await until('Vite ready', async () => {
    if (admin.child.exitCode !== null) throw new Error('Vite exited before becoming ready.');
    try { return (await fetch(adminUrl)).ok; } catch { return false; }
  });
  browser = await chromium.launch({ headless: true });
  evidence.browserVersion = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const network: { method: string; path: string; status: number }[] = [];
  const browserErrors: string[] = [];
  const externalRequests: string[] = [];
  await context.route('**/*', (route) => {
    const target = new URL(route.request().url());
    if (![apiUrl, adminUrl].includes(target.origin)) {
      externalRequests.push(target.origin);
      return route.abort();
    }
    return route.continue();
  });
  page = await context.newPage();
  page.on('pageerror', (error) => { browserErrors.push(error.message); });
  page.on('response', (response) => {
    if (response.url().startsWith(apiUrl)) network.push({ method: response.request().method(),
      path: new URL(response.url()).pathname, status: response.status() });
  });
  if (scenario === 'chapterActions') {
    const { runChapterActionsScenario } = await import('./novel-prisma-chapter-actions-browser-scenario.mjs');
    await runChapterActionsScenario({ page, context, prisma, fixture, apiUrl, adminUrl,
      output: () => api.output, evidence, save, screenshot, until });
    await save('network.json', network);
    assert.deepEqual(browserErrors, []);
    assert.deepEqual(externalRequests, []);
  } else {
  assert.ok(originalBefore);
  const chapterPath = `/novels/${fixture.novelId}/chapters/${fixture.chapterId}`;
  const revisionPath = `${chapterPath}/overlength-revisions`;
  await page.goto(`${adminUrl}${chapterPath}`, { waitUntil: 'networkidle' });
  await expect(page.getByText('超长原稿已保留在候选池。字数合格的修订稿也需先完成逐版本复核，当前不能采用。')).toBeVisible();
  await screenshot('01-before-submit');
  await expect(page.getByRole('button', { name: '精简一次', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '精简一次', exact: true }).click();
  await expect(page.getByText('精简超字数正文', { exact: true })).toBeVisible();
  await screenshot('02-confirmation');
  const responsePromise = page.waitForResponse((response) => response.url() === `${apiUrl}${revisionPath}`
    && response.request().method() === 'POST', { timeout: 20_000 });
  const submitAt = Date.now();
  await page.getByRole('button', { name: '开始精简', exact: true }).click();
  const accepted = await responsePromise;
  assert.equal(accepted.status(), 202, 'Public route must return an asynchronous acceptance.');
  const dispatch = (await accepted.json()).data;
  const requestBody = accepted.request().postDataJSON();
  const idempotencyKey = accepted.request().headers()['idempotency-key'];
  const taskId = dispatch.taskId as string;
  assert.equal(dispatch.action, 'chapter_overlength_revise');
  assert.equal(dispatch.objectId, fixture.chapterId);
  assert.equal(dispatch.pollUrl, `/tasks/${taskId}`);
  const acceptanceMs = Date.now() - submitAt;
  assert.ok(acceptanceMs < 10_000, 'HTTP acceptance must not wait for the model.');
  evidence.acceptance = { httpStatus: 202, acceptanceMs, ...dispatch };
  const readTask = () => prisma!.generationTask.findUniqueOrThrow({ where: { id: taskId },
    select: { id: true, status: true, taskType: true, providerCallBudgetUsed: true, providerCallBudgetMax: true,
      providerDispatchedAt: true, lastHeartbeatAt: true, leaseExpiresAt: true, resultReceiptHash: true,
      resultVersionId: true, errorCode: true, createdAt: true, finishedAt: true } });
  const mockCalls = () => api.output.split('\n').filter((line) => line.startsWith('E1_OVERLENGTH_MOCK_STARTED=')).length;
  await until('provider dispatch recorded', async () => (await readTask()).providerCallBudgetUsed === 1 && mockCalls() === 1);
  const mockLine = api.output.split('\n').find((line) => line.startsWith('E1_OVERLENGTH_MOCK_STARTED='))!;
  const modelStartedAt = Date.parse(JSON.parse(mockLine.slice(mockLine.indexOf('=') + 1)).at);
  await expect(page.getByText('正在调用模型生成内容，可能需要 2-5 分钟；若等待过久，请刷新查看任务状态')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: '精简一次', exact: true })).toBeDisabled();
  await screenshot('03-processing');
  const replay = async (expectedStatus: number) => {
    const capabilityResponse = await context.request.get(`${apiUrl}/novels/async-transport-capability`);
    assert.equal(capabilityResponse.status(), 200);
    const capability = (await capabilityResponse.json()).data;
    assert.equal(capability.enabled, true);
    assert.equal(capability.submissionScopeId, requestBody.expectedSubmissionScopeId);
    const response = await context.request.post(`${apiUrl}${revisionPath}`, { data: { ...requestBody,
      expectedCapabilityRevision: capability.capabilityRevision,
      expectedCapabilityExpiresAt: capability.expiresAt },
      headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {} });
    assert.equal(response.status(), expectedStatus, 'Same-request replay returned an unexpected HTTP status.');
    const data = (await response.json()).data;
    assert.equal(data.taskId, taskId, 'Replay must not create another task.');
    assert.equal(data.reused, true);
    return { httpStatus: response.status(), ...data };
  };
  evidence.runningReplay = await replay(202);
  const checkpoints: unknown[] = [];
  for (const offset of [65_000, 120_000]) {
    let nextProgressAt = Date.now();
    await until(`wait until ${offset / 1000}s of real model delay`, async () => {
      if (Date.now() >= nextProgressAt) {
        const task = await readTask();
        assert.equal(task.status, 'PROCESSING');
        assert.equal(task.providerCallBudgetUsed, 1);
        console.log(`E1_OVERLENGTH_WAIT=${Math.floor((Date.now() - modelStartedAt) / 1000)}s budget=1`);
        nextProgressAt = Date.now() + 30_000;
      }
      return Date.now() - modelStartedAt >= offset;
    }, offset + 5000);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: '精简一次', exact: true })).toBeDisabled();
    await expect(page.getByText('正在调用模型生成内容，可能需要 2-5 分钟；若等待过久，请刷新查看任务状态')).toBeVisible();
    const workbenchResponse = await context.request.get(`${apiUrl}${chapterPath}`);
    assert.equal(workbenchResponse.status(), 200);
    const workbench = (await workbenchResponse.json()).data;
    assert.equal(workbench.recentTask.id, taskId);
    assert.equal(workbench.recentTask.status, 'processing');
    assert.equal(workbench.currentContent, null);
    const task = await readTask();
    assert.equal(task.status, 'PROCESSING');
    assert.equal(task.providerCallBudgetUsed, 1);
    assert.ok(task.leaseExpiresAt && task.leaseExpiresAt.getTime() > Date.now(), 'Heartbeat must renew the original 60s lease.');
    assert.ok(task.lastHeartbeatAt && task.lastHeartbeatAt.getTime() > modelStartedAt);
    assert.equal(mockCalls(), 1);
    await page.getByRole('button', { name: '查看详情', exact: true }).click();
    await expect(page.getByText(taskId, { exact: true })).toBeVisible();
    await screenshot(`04-refresh-${offset / 1000}s`);
    checkpoints.push({ elapsedMs: Date.now() - modelStartedAt, restoredTaskId: workbench.recentTask.id, ...task });
    await page.keyboard.press('Escape');
  }
  evidence.waitCheckpoints = checkpoints;
  await until('candidate finalized', async () => {
    const task = await readTask();
    assert.ok(['PROCESSING', 'WAITING_CONFIRMATION'].includes(task.status), `Unexpected terminal status: ${task.status}/${task.errorCode}`);
    return task.status === 'WAITING_CONFIRMATION';
  }, 60_000);
  await expect(page.getByText('精简候选已保留，待内容复核后才能采用。')).toBeVisible({ timeout: 15_000 });
  await screenshot('05-candidate');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByText('精简候选已保留，待内容复核后才能采用。')).toBeVisible();
  await expect(page.getByRole('button', { name: '精简一次', exact: true })).toBeDisabled();
  await expect(page.locator('#chapter-candidates article')).toHaveCount(2);
  for (const button of await page.getByRole('button', { name: '采用候选', exact: true }).all()) {
    await expect(button).toBeDisabled();
  }
  const revisionCard = page.locator('#chapter-candidates article').filter({ hasText: '精简候选已保留' });
  await revisionCard.getByRole('button', { name: '看全文', exact: true }).click();
  await expect(page.locator('.el-drawer:visible .novel-text').first()).toBeVisible();
  const drawerContent = (await page.locator('.el-drawer:visible .novel-text').allTextContents()).join('\n\n');
  await screenshot('06-candidate-readback');
  await page.keyboard.press('Escape');
  evidence.terminalReplay = await replay(200);
  const readbackResponse = await context.request.get(`${apiUrl}${chapterPath}`);
  assert.equal(readbackResponse.status(), 200);
  const readback = (await readbackResponse.json()).data;
  assert.equal(readback.recentTask.id, taskId);
  assert.equal(readback.currentContent, null);
  const candidate = await prisma.chapterContentVersion.findMany({ where: { novelId: fixture.novelId, sourceTaskId: taskId } });
  assert.equal(candidate.length, 1);
  assert.equal(candidate[0].status, 'CANDIDATE');
  assert.equal(candidate[0].sourceType, 'ai_overlength_revision');
  assert.equal(hash(drawerContent), hash(candidate[0].content), 'Browser full-text drawer must match the persisted candidate.');
  const { evaluateChapterLength } = await import(pathToFileURL(resolve(root, 'apps/api/src/modules/novels/domain/chapterLengthPolicy.ts')).href);
  assert.equal(evaluateChapterLength(candidate[0].content, 1000).status, 'pass');
  assert.ok(readback.candidateVersions.some((version: { id: string; content: string }) =>
    version.id === candidate[0].id && hash(version.content) === hash(candidate[0].content)));
  assert.ok(readback.candidateVersions.some((version: { id: string; content: string }) =>
    version.id === fixture.originalId && hash(version.content) === hash(originalBefore.content)));
  assert.equal(hash(await prisma.chapterContentVersion.findUniqueOrThrow({ where: { id: fixture.originalId } })), hash(originalBefore));
  const formalAfter = await formalSnapshot(fixture.novelId);
  assert.deepEqual(formalAfter, formalBefore, 'Formal body rows and chapter pointers must not change.');
  await save('formal-after.json', formalAfter);
  assert.equal(await prisma.generationTask.count({ where: { novelId: fixture.novelId, taskType: 'chapter_overlength_revise' } }), 1);
  const task = await readTask();
  assert.equal(task.providerCallBudgetUsed, 1);
  assert.equal(task.providerCallBudgetMax, 1);
  assert.ok(task.resultReceiptHash);
  assert.equal(mockCalls(), 1);
  const events = await prisma.generationTaskEvent.findMany({ where: { taskId }, orderBy: { createdAt: 'asc' },
    select: { eventType: true, status: true, createdAt: true } });
  await save('events.json', events);
  await save('network.json', network);
  assert.equal(events.filter((event) => event.eventType === 'task_finalized').length, 1);
  assert.equal(events.filter((event) => event.eventType === 'calling_model').length, 1);
  const mockFinishedLine = api.output.split('\n').find((line) => line.startsWith('E1_OVERLENGTH_MOCK_FINISHED='))!;
  const mockFinishedAt = Date.parse(JSON.parse(mockFinishedLine.slice(mockFinishedLine.indexOf('=') + 1)).at);
  assert.ok(mockFinishedAt - modelStartedAt >= delayMs);
  assert.equal(network.filter((item) => item.method === 'POST' && item.path === revisionPath).length, 1,
    'Page reloads must not submit a new generation request.');
  assert.deepEqual(browserErrors, []);
  assert.deepEqual(externalRequests, []);
  // A fresh DB client and an empty browser profile must recover from persisted state, not local storage.
  await prisma.$disconnect();
  prisma = await openDatabase(databaseUrl);
  assert.equal((await readTask()).id, taskId);
  assert.deepEqual(await formalSnapshot(fixture.novelId), formalBefore);
  const freshContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const freshPage = await freshContext.newPage();
  await freshPage.goto(`${adminUrl}${chapterPath}`, { waitUntil: 'networkidle' });
  await expect(freshPage.getByText('精简候选已保留，待内容复核后才能采用。')).toBeVisible();
  await expect(freshPage.locator('#chapter-candidates article')).toHaveCount(2);
  await freshPage.getByRole('button', { name: '查看详情', exact: true }).click();
  await expect(freshPage.getByText(taskId, { exact: true })).toBeVisible();
  await freshPage.screenshot({ path: resolve(artifactDir, '07-fresh-profile.png'), fullPage: true });
  await freshContext.close();
  assert.equal((await readTask()).providerCallBudgetUsed, 1);
  assert.equal(mockCalls(), 1);
  assert.equal(await prisma.generationTask.count({ where: { novelId: fixture.novelId, taskType: 'chapter_overlength_revise' } }), 1);
  await save('network.json', network);
  await save('events.json', events);
  evidence.task = task;
  evidence.mockProviderCalls = mockCalls();
  evidence.actualMockDurationMs = mockFinishedAt - modelStartedAt;
  evidence.original = { id: originalBefore.id, contentHash: hash(originalBefore.content), wordCount: originalBefore.wordCount, unchanged: true };
  evidence.candidate = { id: candidate[0].id, contentHash: hash(candidate[0].content), wordCount: candidate[0].wordCount,
    status: candidate[0].status, sourceType: candidate[0].sourceType, lengthGate: evaluateChapterLength(candidate[0].content, 1000) };
  evidence.formalBodyUnchanged = true;
  evidence.freshProfileReadback = true;
  }
  }
  evidence.result = 'PASS';
} catch (error) {
  evidence.result = 'FAIL';
  evidence.error = redact(error instanceof Error ? error.stack ?? error.message : String(error));
  if (page && !page.isClosed()) await screenshot('failure').catch(() => undefined);
  process.exitCode = 1;
} finally {
  const cleanup: Record<string, unknown> = {};
  try { await browser?.close(); cleanup.browserClosed = true; } catch { cleanup.browserClosed = false; }
  try { await prisma?.$disconnect(); cleanup.databaseDisconnected = true; } catch { cleanup.databaseDisconnected = false; }
  for (const entry of children.reverse()) {
    if (entry.child.pid) {
      try { process.kill(-entry.child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
      const deadline = Date.now() + 10_000;
      while (entry.child.exitCode === null && entry.child.signalCode === null && Date.now() < deadline) await sleep(100);
      try { process.kill(-entry.child.pid, 'SIGKILL'); } catch { /* No process group remains. */ }
      await sleep(100);
      try { process.kill(-entry.child.pid, 0); cleanup[`${entry.name}Stopped`] = false; }
      catch { cleanup[`${entry.name}Stopped`] = true; }
    }
    await save(`${entry.name}.log`, entry.output);
  }
  if (mysqlEnvFile) {
    try { await rm(mysqlEnvFile, { force: true }); cleanup.temporaryEnvironmentFileRemoved = true; }
    catch { cleanup.temporaryEnvironmentFileRemoved = false; }
  }
  if (containerId) {
    try {
      await command('docker', ['rm', '--force', containerId]);
      cleanup.containerAndTemporaryAccountsRemoved = !(await command('docker', ['ps', '--all', '--quiet', '--filter', `id=${containerId}`]));
    } catch (error) { cleanup.containerAndTemporaryAccountsRemoved = false; cleanup.error = redact(String(error)); }
  }
  evidence.cleanup = cleanup;
  if (Object.values(cleanup).includes(false)) { evidence.result = 'FAIL'; process.exitCode = 1; }
  evidence.finishedAt = new Date().toISOString();
  evidence.headAfter = await command('git', ['rev-parse', 'HEAD'], baseEnv, workspace).catch(() => 'unavailable');
  if (evidence.headAfter !== evidence.headBefore) evidence.sourceRevisionChangedDuringRun = true;
  await save('evidence.json', evidence);
  console.log(JSON.stringify({ result: evidence.result, evidence: resolve(artifactDir, 'evidence.json'), cleanup }));
}
