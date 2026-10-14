import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { PrismaClient as DatabaseClient } from '../../apps/api/src/generated/prisma/client.js';

// No execution by default. Requires installed dependencies and a cached local mysql:8.4 image.
// --run: mock only. --run --real --env-file PATH: at most two new paid direction intents.
// Neither mode loads the workspace .env implicitly or accepts an existing database URL.
// Put `--` BEFORE the script path so Node cannot consume the script's --env-file option.
const EXPECTED_ACTIONS = [
  'direction_generate', 'direction_fuse', 'direction_optimize', 'setting_generate',
  'outline_generate', 'stage_outline_generate',
  'trial_chapter_one_generate', 'trial_followup_generate', 'chapter_overlength_revise',
  'chapter_rewrite', 'chapter_impact_assess', 'chapter_adopt_impact_assess', 'novel_full_review',
].sort();
const DEEPSEEK_FIELDS = ['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL', 'DEEPSEEK_TIMEOUT_MS'] as const;
const MOCK_HOLD_MARKER = 'E1_RUNTIME_MOCK_SECOND_RETURN_HELD';
const EXTRA_OBSERVATION_MS = 20_000; // main: worker poll 5s, recovery sweep 15s.
const SCRIPT_PATH = 'scripts/e2e/novel-e1-runtime-smoke.mts';

class SmokeFailure extends Error {}
function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw new SmokeFailure(code);
}
function record(value: unknown): Record<string, unknown> {
  check(value && typeof value === 'object' && !Array.isArray(value), 'invalid_object');
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  check(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value), 'invalid_identifier');
  return value;
}
function hash(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function options(args: string[]) {
  let run = false, real = false, help = false;
  let envFile: string | undefined;
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    check(!seen.has(arg), 'duplicate_option');
    seen.add(arg);
    if (arg === '--run') run = true;
    else if (arg === '--real') real = true;
    else if (arg === '--help') help = true;
    else if (arg === '--env-file') {
      envFile = args[++i];
      check(envFile && !envFile.startsWith('--'), 'env_file_path_required');
    } else throw new SmokeFailure('unknown_option');
  }
  check(real === Boolean(envFile), 'real_and_env_file_must_be_explicit_together');
  check(!real || run, 'real_requires_run');
  return { run: run && !help, real, envFile };
}

// The same script can be preloaded by the MOCK child, never the real-provider child.
// Keep main/routes/queue/finalize unchanged; only hold the second mock return in flight.
async function installMockCrashWindow() {
  check(process.env.AI_PROVIDER_MODE === 'mock'
    && process.env.NOVEL_ASYNC_DISPATCH_ENABLED === 'true'
    && process.argv[1]?.endsWith('/apps/api/src/main.ts'), 'mock_preload_guard');
  const { MockDirectionProvider } = await import(new URL(
    '../../apps/api/src/modules/novels/providers/mockDirectionProvider.ts', import.meta.url).href);
  const original = MockDirectionProvider.prototype.generateCandidates;
  let calls = 0;
  MockDirectionProvider.prototype.generateCandidates = async function (this: unknown, ...args: unknown[]) {
    calls++;
    check(calls <= 2, 'unexpected_mock_provider_call');
    const result = await original.apply(this, args);
    if (calls === 2) {
      process.stdout.write(`${MOCK_HOLD_MARKER}\n`);
      await new Promise<never>(() => {});
    }
    return result;
  };
}

async function runSmoke(config: ReturnType<typeof options>) {
  const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const runId = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}_${randomBytes(4).toString('hex')}`;
  const artifactDir = resolve(workspace, 'output/e1-runtime', runId);
  const root = resolve(artifactDir, 'runtime');
  const container = `aisv-e1-runtime-${runId.replace('_', '-')}`;
  const schema = `e1_runtime_${runId}`;
  const account = `e1_${randomBytes(6).toString('hex')}`;
  const databasePassword = randomBytes(24).toString('hex');
  const rootPassword = randomBytes(24).toString('hex');
  const scopeSecret = randomBytes(32).toString('hex');
  const tenantId = `e1tenant_${randomBytes(8).toString('hex')}`;
  const userId = `e1user_${randomBytes(8).toString('hex')}`;
  const secrets = [databasePassword, rootPassword, scopeSecret];
  const baseEnv: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL']) {
    if (process.env[key]) baseEnv[key] = process.env[key];
  }
  const buildEnv = { ...baseEnv, NODE_ENV: 'production', AI_PROVIDER_MODE: 'mock', DOTENV_CONFIG_PATH: '/dev/null' };
  const children: { name: string; child: ChildProcess; done: boolean; bytes: number; held: boolean }[] = [];
  type RunningChild = typeof children[number];
  let prisma: DatabaseClient | undefined;
  let containerAttempted = false;
  let interrupted = false;
  const abort = new AbortController();
  let stage = 'preflight';
  const evidence: Record<string, unknown> = {
    runId, startedAt: new Date().toISOString(), result: 'RUNNING', provider: config.real ? 'deepseek' : 'mock',
    entrypoint: 'apps/api/src/main.ts', dispatchFlag: 'NOVEL_ASYNC_DISPATCH_ENABLED=true',
    oldDispatchFlags: false, uniqueGenerationLimit: 2, automaticGenerationRetries: false,
    mockFaultInjection: !config.real ? 'hold second mock provider return using script preload' : null,
    notProven: ['provider invoice or actual charge', 'actions other than direction_generate', 'browser behavior'],
  };
  const httpEvidence: { method: string; path: string; status: number; elapsedMs: number }[] = [];
  let uniqueSubmissions = 0;
  let replaySubmissions = 0;
  const intents = new Map<string, { novelId: string; taskId: string | null }>();

  function signalGroup(entry: RunningChild, signal: NodeJS.Signals) {
    if (entry.child.pid) {
      try { process.kill(-entry.child.pid, signal); } catch { /* Already exited. */ }
    }
  }
  const interrupt = () => {
    interrupted = true;
    abort.abort();
    for (const entry of children) if (!entry.done) signalGroup(entry, 'SIGTERM');
  };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);

  function start(name: string, executable: string, args: string[], env: NodeJS.ProcessEnv, cwd = root) {
    const child = spawn(executable, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const entry: RunningChild = { name, child, done: false, bytes: 0, held: false };
    children.push(entry);
    let markerTail = '';
    child.stdout!.on('data', (data: Buffer) => {
      entry.bytes += data.length;
      const scan = markerTail + data.toString();
      if (scan.includes(MOCK_HOLD_MARKER)) entry.held = true;
      markerTail = scan.slice(-MOCK_HOLD_MARKER.length);
    });
    child.stderr!.on('data', (data: Buffer) => { entry.bytes += data.length; });
    child.once('error', () => { entry.done = true; });
    child.once('close', () => { entry.done = true; });
    return entry;
  }

  async function command(executable: string, args: string[], env: NodeJS.ProcessEnv = buildEnv, cwd = root, timeout = 120_000) {
    const entry = start('command', executable, args, env, cwd);
    return new Promise<string>((resolveCommand, reject) => {
      let output = '';
      let overflow = false;
      entry.child.stdout!.on('data', (data: Buffer) => {
        if (output.length + data.length > 4_000_000) {
          overflow = true;
          signalGroup(entry, 'SIGKILL');
        } else output += data.toString();
      });
      const timer = setTimeout(() => signalGroup(entry, 'SIGKILL'), timeout);
      entry.child.once('error', () => { clearTimeout(timer); reject(new SmokeFailure('command_start_failed')); });
      entry.child.once('close', (code) => {
        clearTimeout(timer);
        if (code === 0 && !overflow) resolveCommand(output.trim());
        else reject(new SmokeFailure('command_failed'));
      });
    });
  }

  async function stop(entry: RunningChild, force = false) {
    if (!entry.done) signalGroup(entry, force ? 'SIGKILL' : 'SIGTERM');
    const deadline = Date.now() + 5000;
    while (!entry.done && Date.now() < deadline) await sleep(50);
    signalGroup(entry, 'SIGKILL');
    const killDeadline = Date.now() + 5000;
    while (!entry.done && Date.now() < killDeadline) await sleep(50);
    check(entry.done, 'child_did_not_exit');
  }

  async function until(code: string, condition: () => Promise<boolean>, timeout = 30_000, interval = 100) {
    const deadline = Date.now() + timeout;
    do {
      check(!interrupted, 'interrupted');
      if (await condition()) return;
      await sleep(interval);
    } while (Date.now() < deadline);
    throw new SmokeFailure(code);
  }

  async function save() {
    // Evidence is constructed from explicit safe fields, never child output or API/model bodies.
    evidence.stage = stage;
    evidence.http = httpEvidence;
    evidence.uniqueGenerationSubmissions = uniqueSubmissions;
    evidence.sameKeyReplays = replaySubmissions;
    let text = JSON.stringify(evidence, null, 2);
    for (const secret of secrets) if (secret) text = text.replaceAll(secret, '[REDACTED]');
    text = text.replace(/mysql:\/\/[^\s"']+/g, '[REDACTED_DATABASE_URL]');
    await writeFile(resolve(artifactDir, 'evidence.json'), `${text}\n`, { mode: 0o600 });
  }

  try {
    await mkdir(root, { recursive: true, mode: 0o700 });
    console.log(`E1_RUNTIME_EVIDENCE=${resolve(artifactDir, 'evidence.json')}`);
    let providerEnv: NodeJS.ProcessEnv = {};
    let providerTimeoutMs = 360_000;
    if (config.real) {
      // parse() does not mutate process.env; DATABASE_URL/actor/flags are never imported.
      const { parse } = await import('dotenv');
      const parsed = parse(await readFile(resolve(config.envFile!), 'utf8'));
      providerEnv = Object.fromEntries(DEEPSEEK_FIELDS.filter((key) => parsed[key] !== undefined)
        .map((key) => [key, parsed[key]]));
      check(providerEnv.DEEPSEEK_API_KEY?.trim(), 'deepseek_key_missing');
      secrets.push(providerEnv.DEEPSEEK_API_KEY!);
      if (providerEnv.DEEPSEEK_BASE_URL) {
        const url = new URL(providerEnv.DEEPSEEK_BASE_URL);
        check(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash,
          'deepseek_endpoint_requires_credential_free_https');
      }
      if (providerEnv.DEEPSEEK_TIMEOUT_MS) providerTimeoutMs = Number(providerEnv.DEEPSEEK_TIMEOUT_MS);
      check(Number.isSafeInteger(providerTimeoutMs) && providerTimeoutMs >= 1000 && providerTimeoutMs <= 600_000,
        'deepseek_timeout_out_of_bounds');
      providerEnv.DEEPSEEK_TIMEOUT_MS = String(providerTimeoutMs);
      providerEnv.DEEPSEEK_MAX_RETRIES = '0';
    }

    stage = 'freeze_working_tree_sources';
    evidence.baseCommit = await command('git', ['rev-parse', 'HEAD'], buildEnv, workspace);
    const paths = ['apps/api/src', 'apps/api/prisma', 'apps/api/prisma.config.ts', 'apps/api/package.json',
      'packages/shared', 'package.json', SCRIPT_PATH];
    const files = (await command('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...paths],
      buildEnv, workspace)).split('\n').filter((file) => file && !file.split('/').some((part) =>
      part === 'node_modules' || part === 'dist' || part === 'generated' || part.startsWith('.env')));
    const manifest: Record<string, string> = {};
    for (const file of files) {
      const content = await readFile(resolve(workspace, file));
      const target = resolve(root, file);
      check(target.startsWith(`${root}/`), 'source_path_outside_snapshot');
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
      manifest[file] = hash(content);
    }
    for (const file of files) check(hash(await readFile(resolve(workspace, file))) === manifest[file], 'sources_changed_during_capture');
    evidence.sourceManifestHash = hash(JSON.stringify(manifest));
    await writeFile(resolve(artifactDir, 'source-hashes.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    await mkdir(resolve(root, 'node_modules/@ai-shortvideo'), { recursive: true });
    for (const name of await readdir(resolve(workspace, 'node_modules'))) {
      if (name !== '@ai-shortvideo') await symlink(resolve(workspace, 'node_modules', name), resolve(root, 'node_modules', name));
    }
    await symlink(resolve(root, 'packages/shared'), resolve(root, 'node_modules/@ai-shortvideo/shared'));
    await command(process.execPath, [resolve(workspace, 'node_modules/typescript/bin/tsc'), '-p', 'packages/shared/tsconfig.json']);

    stage = 'disposable_mysql';
    const endpoint = await command('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
    check(endpoint.startsWith('unix://'), 'docker_must_be_local');
    evidence.mysqlImage = await command('docker', ['image', 'inspect', 'mysql:8.4', '--format', '{{.Id}}']);
    containerAttempted = true; // Clean by unique name even if docker run's response is lost.
    await command('docker', ['run', '--detach', '--rm', '--pull=never', '--name', container,
      '--label', `ai-shortvideo.e1-runtime=${runId}`, '--tmpfs', '/var/lib/mysql',
      '--publish', '127.0.0.1::3306', '--env', 'MYSQL_ROOT_PASSWORD', '--env', 'MYSQL_DATABASE',
      '--env', 'MYSQL_USER', '--env', 'MYSQL_PASSWORD', 'mysql:8.4'],
    { ...baseEnv, MYSQL_ROOT_PASSWORD: rootPassword, MYSQL_DATABASE: schema, MYSQL_USER: account, MYSQL_PASSWORD: databasePassword });
    const bindings = JSON.parse(await command('docker', ['inspect', '--format', '{{json .NetworkSettings.Ports}}', container]));
    const binding = bindings['3306/tcp'];
    check(Array.isArray(binding) && binding.length === 1 && binding[0].HostIp === '127.0.0.1', 'mysql_not_loopback_only');
    const port = Number(binding[0].HostPort);
    check(Number.isInteger(port) && port > 0 && port !== 3306, 'mysql_port_not_ephemeral');
    const databaseUrl = `mysql://${account}:${databasePassword}@127.0.0.1:${port}/${schema}`;
    secrets.push(databaseUrl);
    evidence.database = { container, schema, account, host: '127.0.0.1', port };
    await until('mysql_startup_timeout', async () => {
      try {
        return await command('docker', ['exec', container, 'sh', '-c',
          'MYSQL_PWD="$MYSQL_PASSWORD" mysql --protocol=TCP -h127.0.0.1 -u"$MYSQL_USER" "$MYSQL_DATABASE" --batch --skip-column-names -e "SELECT 1"'],
        baseEnv, root, 5000) === '1';
      } catch { return false; }
    }, 90_000, 500);

    stage = 'existing_migrations';
    const dbEnv = { ...buildEnv, DATABASE_URL: databaseUrl };
    const prismaCli = resolve(workspace, 'node_modules/prisma/build/index.js');
    await command(process.execPath, [prismaCli, 'generate'], dbEnv, resolve(root, 'apps/api'));
    await command(process.execPath, [prismaCli, 'migrate', 'deploy'], dbEnv, resolve(root, 'apps/api'));
    const { PrismaClient } = await import(pathToFileURL(resolve(root, 'apps/api/src/generated/prisma/client.ts')).href);
    const { PrismaMariaDb } = await import('@prisma/adapter-mariadb');
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) }) as DatabaseClient;
    const database = await prisma.$queryRawUnsafe<{ name: string }[]>('SELECT DATABASE() AS name');
    check(database.length === 1 && database[0].name === schema, 'database_identity_mismatch');
    evidence.migrations = await prisma.$queryRawUnsafe(
      'SELECT migration_name, finished_at FROM _prisma_migrations WHERE rolled_back_at IS NULL ORDER BY migration_name');
    const apiPort = await freePort();
    const apiUrl = `http://127.0.0.1:${apiPort}`;
    const apiEnv = { ...dbEnv, ...providerEnv, AI_PROVIDER_MODE: config.real ? 'deepseek' : 'mock',
      PORT: String(apiPort), NOVEL_ASYNC_DISPATCH_ENABLED: 'true', NOVEL_ASYNC_DISPATCH_DEV_ENABLED: 'false',
      NOVEL_ASYNC_DISPATCH_E1_MYSQL_ENABLED: 'false', NOVEL_ASYNC_SCOPE_SECRET: scopeSecret,
      NOVEL_ASYNC_API_AUDIENCE: `e1-runtime-${runId}`, DEPLOYMENT_ACTOR_TENANT_ID: tenantId,
      DEPLOYMENT_ACTOR_USER_ID: userId };

    async function api(path: string, method = 'GET', body?: unknown, key?: string, timeout = 5000) {
      const began = Date.now();
      const response = await fetch(`${apiUrl}${path}`, { method, redirect: 'error',
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(timeout)]),
        headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const payload = record(await response.json());
      httpEvidence.push({ method, path, status: response.status, elapsedMs: Date.now() - began });
      check(response.ok && payload.success === true, 'api_request_rejected');
      return { status: response.status, data: record(payload.data), elapsedMs: Date.now() - began };
    }

    let stableScope: string | undefined;
    async function capability() {
      const response = await api('/novels/async-transport-capability');
      const cap = response.data;
      check(response.status === 200 && cap.contractVersion === 'v1' && cap.enabled === true, 'runtime_capability_not_enabled');
      check(Array.isArray(cap.enabledActions)
        && JSON.stringify([...cap.enabledActions].sort()) === JSON.stringify(EXPECTED_ACTIONS), 'capability_must_admit_exactly_13_actions');
      check(typeof cap.submissionScopeId === 'string' && /^[A-Za-z0-9_-]{43}$/.test(cap.submissionScopeId), 'invalid_submission_scope');
      check(typeof cap.capabilityRevision === 'string' && /^[A-Za-z0-9_-]{43}$/.test(cap.capabilityRevision), 'invalid_capability_revision');
      check(typeof cap.expiresAt === 'string' && Date.parse(cap.expiresAt) > Date.now(), 'expired_capability');
      if (stableScope) check(stableScope === cap.submissionScopeId, 'submission_scope_changed_on_restart');
      stableScope = cap.submissionScopeId;
      evidence.capability = { enabled: true, actions: cap.enabledActions, count: cap.enabledActions.length };
      return { expectedSubmissionScopeId: cap.submissionScopeId,
        expectedCapabilityRevision: cap.capabilityRevision, expectedCapabilityExpiresAt: cap.expiresAt };
    }

    async function startMain(restarted: boolean) {
      const preload = !config.real && !restarted;
      const args = ['--import', 'tsx', ...(preload ? ['--import', pathToFileURL(resolve(root, SCRIPT_PATH)).href] : []),
        resolve(root, 'apps/api/src/main.ts')];
      const entry = start(restarted ? 'main-restarted' : 'main', process.execPath, args,
        { ...apiEnv, ...(preload ? { E1_RUNTIME_SMOKE_CHILD_ROLE: 'mock-crash-preload' } : {}) });
      await until('main_startup_timeout', async () => {
        check(!entry.done, 'main_exited_before_ready');
        try { await api('/novels/async-transport-capability'); return true; }
        catch { return false; }
      }, 30_000, 250);
      await capability();
      return entry;
    }

    async function createDraft(label: string) {
      const response = await api('/novels/drafts', 'POST', { title: `E1 runtime ${runId} ${label}`,
        creationSourceType: 'system_recommendation', genres: ['urban adventure'], chapterLimit: 10,
        chapterWordRange: { min: 1000, max: 2000 }, preferences: { appealPoints: ['discovery'], targetAudience: 'adult fiction readers' } });
      check(response.status === 201, 'draft_not_created');
      return identifier(response.data.id);
    }

    async function submit(novelId: string, key: string, replay = false) {
      const previous = intents.get(key);
      if (replay) {
        check(previous?.novelId === novelId && previous.taskId, 'replay_requires_confirmed_original_task');
        replaySubmissions++;
      } else {
        check(!previous && uniqueSubmissions < 2, 'unique_generation_limit_exceeded');
        uniqueSubmissions++;
        intents.set(key, { novelId, taskId: null });
      }
      const body = await capability();
      // Exactly one POST per intent; unknown/failed responses abort the run, never retry generation.
      const response = await api(`/novels/${novelId}/directions/generate`, 'POST', body, key);
      const taskId = identifier(response.data.taskId);
      check(response.elapsedMs < 5000, 'dispatch_not_fast');
      check(response.data.action === 'direction_generate' && response.data.objectId === novelId
        && response.data.pollUrl === `/tasks/${taskId}`, 'dispatch_contract_mismatch');
      if (replay) {
        check(response.status === 200 && response.data.kind === 'existing' && response.data.reused === true
          && taskId === previous!.taskId, 'terminal_replay_created_or_changed_task');
      } else {
        check(response.status === 202 && response.data.kind === 'accepted' && response.data.reused === false
          && ['queued', 'processing'].includes(String(response.data.status)), 'initial_dispatch_not_202');
        intents.get(key)!.taskId = taskId;
      }
      return { taskId, httpStatus: response.status, elapsedMs: response.elapsedMs };
    }

    const readTask = (id: string) => prisma!.generationTask.findFirstOrThrow({ where: { id, tenantId }, select: {
      id: true, novelId: true, taskType: true, status: true, rootTaskId: true, retryOfTaskId: true, retryCount: true,
      providerAttemptId: true, providerAttemptPhase: true, providerDispatchedAt: true,
      providerCallBudgetUsed: true, providerCallBudgetMax: true, leaseExpiresAt: true,
      failureCategory: true, errorCode: true, resultReceiptHash: true, resultVersionIdsJson: true,
      createdAt: true, finishedAt: true,
    } });
    const events = (taskId: string) => prisma!.generationTaskEvent.findMany({ where: { tenantId, taskId },
      orderBy: { createdAt: 'asc' }, select: { eventType: true, status: true, createdAt: true } });
    async function pointersEmpty(novelId: string) {
      const novel = await prisma!.novel.findFirstOrThrow({ where: { id: novelId, tenantId }, select: {
        currentDirectionVersionId: true, currentSettingVersionId: true, currentOutlineVersionId: true,
        currentStageOutlineVersionId: true, currentChapterPlanVersionId: true,
      } });
      check(Object.values(novel).every((value) => value === null), 'formal_pointer_changed');
      return novel;
    }
    function budgetOne(task: Awaited<ReturnType<typeof readTask>>) {
      check(task.providerCallBudgetMax === 1 && task.providerCallBudgetUsed === 1
        && task.providerAttemptId && task.providerDispatchedAt && task.rootTaskId === task.id
        && task.retryOfTaskId === null && task.retryCount === 0, 'provider_budget_or_attempt_contract_failed');
    }

    stage = 'ordinary_main_success';
    let main = await startMain(false);
    const firstNovel = await createDraft('success');
    const firstKey = `e1-success-${runId}`;
    const first = await submit(firstNovel, firstKey);
    evidence.firstDispatch = first;
    await save();
    await until('first_task_timeout', async () => {
      check(!main.done, 'main_exited_during_first_task');
      const task = await readTask(first.taskId);
      evidence.lastObservedTask = task;
      check(!['FAILED', 'CANCELLED'].includes(task.status), 'first_task_failed_no_retry');
      return ['COMPLETED', 'WAITING_CONFIRMATION'].includes(task.status);
    }, config.real ? providerTimeoutMs + 30_000 : 30_000, 250);
    const firstTask = await readTask(first.taskId);
    budgetOne(firstTask);
    check(firstTask.taskType === 'novel_direction_generate' && firstTask.resultReceiptHash, 'first_task_missing_durable_receipt');
    const candidates = await prisma.creativeVersion.findMany({ where: { tenantId, novelId: firstNovel, sourceTaskId: first.taskId },
      orderBy: { id: 'asc' }, select: { id: true, objectType: true, status: true, sourceTaskId: true } });
    check(candidates.length > 0 && candidates.every((candidate) => candidate.objectType === 'direction'
      && candidate.status === 'CANDIDATE'), 'direction_candidates_missing');
    const firstEvents = await events(first.taskId);
    check(firstEvents.filter((event) => event.eventType === 'calling_model').length === 1, 'first_task_multiple_dispatches');
    const apiTask = await api(`/tasks/${first.taskId}`);
    check(apiTask.data.id === first.taskId && ['completed', 'waiting_confirmation'].includes(String(apiTask.data.status)), 'task_api_db_mismatch');
    evidence.success = { task: firstTask, candidates, events: firstEvents, pointers: await pointersEmpty(firstNovel) };
    evidence.terminalReplay = await submit(firstNovel, firstKey, true);
    check(await prisma.generationTask.count({ where: { tenantId } }) === 1, 'replay_created_task');
    check(JSON.stringify(await readTask(first.taskId)) === JSON.stringify(firstTask), 'replay_changed_task');
    check(JSON.stringify(await events(first.taskId)) === JSON.stringify(firstEvents), 'replay_changed_events');
    check(await prisma.creativeVersion.count({ where: { tenantId, novelId: firstNovel } }) === candidates.length, 'replay_created_candidate');
    await pointersEmpty(firstNovel);
    await save();

    stage = 'kill_after_durable_dispatch';
    const crashNovel = await createDraft('crash');
    const crash = await submit(crashNovel, `e1-crash-${runId}`);
    evidence.crashDispatch = crash;
    await until('crash_dispatch_window_missed', async () => {
      check(!main.done, 'main_exited_before_injected_crash');
      const task = await readTask(crash.taskId);
      evidence.lastObservedTask = task;
      check(!['FAILED', 'CANCELLED', 'COMPLETED', 'WAITING_CONFIRMATION'].includes(task.status), 'crash_task_settled_before_kill_no_retry');
      return task.status === 'PROCESSING' && task.providerAttemptPhase === 'PROVIDER_CALL_STARTED'
        && task.providerCallBudgetUsed === 1 && Boolean(task.providerAttemptId && task.providerDispatchedAt)
        && (config.real || main.held);
    }, 30_000, 10);
    // No file write or extra network request between the dispatch observation and SIGKILL.
    signalGroup(main, 'SIGKILL');
    await stop(main, true);
    const killed = await readTask(crash.taskId);
    budgetOne(killed);
    check(killed.status === 'PROCESSING' && killed.providerAttemptPhase === 'PROVIDER_CALL_STARTED'
      && killed.leaseExpiresAt, 'crash_window_not_preserved');
    evidence.killed = { task: killed, signal: 'SIGKILL', mockReturnHeld: main.held, at: new Date().toISOString() };
    await save();

    stage = 'restart_and_natural_lease_recovery';
    // Reopen the DB client too; recovery must use persisted state, never in-process state.
    await prisma.$disconnect();
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) }) as DatabaseClient;
    main = await startMain(true);
    await until('natural_recovery_timeout', async () => {
      check(!main.done, 'restarted_main_exited');
      const task = await readTask(crash.taskId);
      evidence.lastObservedTask = task;
      budgetOne(task);
      check(task.providerAttemptId === killed.providerAttemptId, 'second_provider_attempt_detected');
      if (task.status === 'FAILED') {
        check(task.failureCategory === 'provider_outcome_unknown' && task.errorCode === 'PROVIDER_OUTCOME_UNKNOWN', 'wrong_recovery_failure');
        return true;
      }
      check(task.status === 'PROCESSING', 'unexpected_recovery_state');
      return false;
    }, 120_000, 250);
    const recovered = await readTask(crash.taskId);
    const recoveredEvents = await events(crash.taskId);
    check(recoveredEvents.filter((event) => event.eventType === 'task_recovered').length === 1, 'recovery_scan_not_observed');
    check(recoveredEvents.filter((event) => event.eventType === 'calling_model').length === 1, 'recovery_dispatched_again');
    const observationStart = Date.now();
    let observations = 0;
    stage = 'extra_worker_poll_observation';
    do {
      check(!interrupted && !main.done, 'extra_observation_interrupted');
      check(JSON.stringify(await readTask(crash.taskId)) === JSON.stringify(recovered), 'recovered_task_changed');
      check(await prisma.generationTask.count({ where: { tenantId } }) === 2, 'unexpected_new_attempt_task');
      check(await prisma.creativeVersion.count({ where: { tenantId, novelId: crashNovel } }) === 0, 'crash_task_saved_candidate');
      observations++;
      await sleep(500);
    } while (Date.now() - observationStart < EXTRA_OBSERVATION_MS);
    check(JSON.stringify(await events(crash.taskId)) === JSON.stringify(recoveredEvents), 'extra_poll_added_task_event');
    const failureApi = await api(`/tasks/${crash.taskId}`);
    check(failureApi.data.status === 'failed' && failureApi.data.failureCategory === 'provider_outcome_unknown', 'recovery_api_db_mismatch');
    evidence.recovery = { task: recovered, events: recoveredEvents, pointers: await pointersEmpty(crashNovel),
      candidateCount: 0, extraObservationMs: Date.now() - observationStart, observations, noSecondAttempt: true };
    budgetOne(await readTask(first.taskId));
    await pointersEmpty(firstNovel);
    evidence.result = 'PASS';
    stage = 'complete';
  } catch (error) {
    evidence.result = 'FAIL';
    // Raw exceptions can embed provider responses or credentials; never serialize them.
    evidence.failure = error instanceof SmokeFailure ? error.message : 'unexpected_error_details_suppressed';
    process.exitCode = 1;
  } finally {
    const cleanup: Record<string, boolean> = {};
    for (const entry of [...children].reverse()) {
      if (!entry.done) {
        try { await stop(entry); } catch { cleanup.processesStopped = false; }
      }
    }
    cleanup.processesStopped ??= children.every((entry) => entry.done);
    try { await prisma?.$disconnect(); cleanup.databaseDisconnected = true; }
    catch { cleanup.databaseDisconnected = false; }
    if (containerAttempted) {
      try {
        await command('docker', ['rm', '--force', container], baseEnv, workspace, 30_000).catch(() => undefined);
        const remaining = await command('docker', ['ps', '--all', '--quiet', '--filter', `name=^/${container}$`], baseEnv, workspace, 15_000);
        cleanup.containerRemoved = remaining === '';
      } catch { cleanup.containerRemoved = false; }
    }
    try { await rm(root, { recursive: true, force: true }); cleanup.runtimeSnapshotRemoved = true; }
    catch { cleanup.runtimeSnapshotRemoved = false; }
    evidence.processes = children.filter((entry) => entry.name !== 'command').map((entry) => ({
      name: entry.name, stopped: entry.done, exitCode: entry.child.exitCode,
      signal: entry.child.signalCode, discardedOutputBytes: entry.bytes,
    }));
    evidence.cleanup = cleanup;
    evidence.finishedAt = new Date().toISOString();
    if (Object.values(cleanup).includes(false)) { evidence.result = 'FAIL'; process.exitCode = 1; }
    await save();
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    console.log(JSON.stringify({ result: evidence.result, stage, cleanup, evidence: resolve(artifactDir, 'evidence.json') }));
  }
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new SmokeFailure('no_free_port')); return; }
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

if (process.env.E1_RUNTIME_SMOKE_CHILD_ROLE === 'mock-crash-preload') {
  await installMockCrashWindow();
} else {
  try {
    check(!process.execArgv.some((arg) => arg.startsWith('--env-file')), 'node_env_file_forbidden_use_separator');
    const config = options(process.argv.slice(2));
    if (config.run) await runSmoke(config);
    else {
      console.log('Usage: node --import tsx -- scripts/e2e/novel-e1-runtime-smoke.mts --run [--real --env-file PATH]');
      console.log('Default is mock. Real mode allows two new direction intents, one same-key replay, and no failed-generation retries.');
      console.log('Uses disposable local mysql:8.4 (--pull=never), ordinary main, natural lease expiry, and sanitized JSON evidence.');
    }
  } catch {
    console.error('E1 runtime smoke rejected invalid arguments or could not finish cleanup/evidence; details suppressed.');
    process.exitCode = 1;
  }
}
