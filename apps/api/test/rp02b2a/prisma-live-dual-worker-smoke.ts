import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TaskStatus } from '@ai-shortvideo/shared';
import { disconnectPrismaClient, getPrismaClient } from '../../src/infrastructure/database/prisma.js';
import { MockBodyProvider } from '../../src/modules/novels/providers/mockBodyProvider.js';
import { MockDirectionProvider } from '../../src/modules/novels/providers/mockDirectionProvider.js';
import { MockFullReviewProvider } from '../../src/modules/novels/providers/mockFullReviewProvider.js';
import { MockStructureProvider } from '../../src/modules/novels/providers/mockStructureProvider.js';
import { MockTrialProvider } from '../../src/modules/novels/providers/mockTrialProvider.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';
import { createLeasedActionExecutor } from '../../src/modules/novels/services/leasedActionExecutor.js';
import { NovelTaskWorkerRuntime, createSystemNovelTaskWorkerScheduler } from '../../src/modules/novels/services/novelTaskWorkerRuntime.js';
import { claimQueuedGeneration } from '../../src/modules/novels/services/taskClaim.js';

const url = process.env.E1_MYSQL_SMOKE_URL;
if (!url || process.env.DATABASE_URL !== url) throw new Error('Set matching E1_MYSQL_SMOKE_URL and DATABASE_URL.');
const target = new URL(url);
if (target.protocol !== 'mysql:' || !['127.0.0.1', 'localhost'].includes(target.hostname)
  || !/^\/ai_shortvideo_e1_[a-z0-9_]+$/.test(target.pathname)
  || !target.port || target.port === '3306' || target.search || target.hash
  || !target.username || !target.password) {
  throw new Error('E1 dual-worker smoke requires a dedicated loopback test schema and non-default port.');
}

class IsolatedPrismaRepository extends PrismaNovelRepository {
  override async getLeasedExecutionCapability(taskType: string) {
    return taskType === 'novel_direction_generate' ? 'enabled' as const : super.getLeasedExecutionCapability(taskType);
  }
}

async function workerChild() {
  const taskId = process.env.E1_DUAL_TASK_ID;
  const tenantId = process.env.E1_DUAL_TENANT_ID;
  if (!taskId || !tenantId) throw new Error('Missing target task identity.');
  const repository = new IsolatedPrismaRepository();
  const provider = new MockDirectionProvider();
  const generate = provider.generateCandidates.bind(provider);
  let calls = 0;
  provider.generateCandidates = async (input) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 300));
    return generate(input);
  };
  const worker = new NovelTaskWorkerRuntime({
    repository, clock: { now: () => repository.getAuthoritativeTaskTime() },
    scheduler: createSystemNovelTaskWorkerScheduler(), workerId: `e1-dual-${randomUUID()}`,
    policy: { workerConcurrency: 1, leaseDurationMs: 2000, heartbeatIntervalMs: 300,
      pollIntervalMs: 100, shutdownGracePeriodMs: 200 },
    ...createLeasedActionExecutor({ repository, providers: {
      directionProvider: provider, structureProvider: new MockStructureProvider(),
      trialProvider: new MockTrialProvider(), bodyProvider: new MockBodyProvider(),
      fullReviewProvider: new MockFullReviewProvider()
    } })
  });
  try {
    worker.start();
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const task = await repository.findTaskById(tenantId, taskId);
      if (task && ![TaskStatus.Queued, TaskStatus.Processing].includes(task.status)) {
        assert.equal(task.status, TaskStatus.WaitingConfirmation);
        process.stdout.write(JSON.stringify({ result: 'worker_finished', calls }) + '\n');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Worker did not observe the terminal task.');
  } finally {
    await worker.stop();
    await disconnectPrismaClient();
  }
}

function runWorkerChild(taskId: string, tenantId: string): Promise<{ result: string; calls: number }> {
  const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), 'worker'], {
    env: { ...process.env, E1_DUAL_TASK_ID: taskId, E1_DUAL_TENANT_ID: tenantId },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => child.kill('SIGKILL'), 20_000);
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-2000); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Worker child exited ${code}: ${stderr}`));
        return;
      }
      try { resolve(JSON.parse(stdout.trim())); } catch (error) { reject(error); }
    });
  });
}

async function parentRun() {
  const repository = new IsolatedPrismaRepository();
  try {
    const suffix = randomUUID();
    const context = { tenantId: `tenant-e1-${suffix.slice(0, 8)}`,
      userId: `user-e1-${suffix.slice(0, 8)}`, requestId: `req-e1-${suffix}` };
    const { novel } = await repository.createDraft({
      request: { title: 'E1 dual-worker MySQL smoke' }, context, now: new Date()
    });
    const now = await repository.getAuthoritativeTaskTime();
    const queued = await claimQueuedGeneration({
      action: 'direction_generate', repository, novel, context,
      idempotencyKey: `e1-dual-${suffix}`, effectiveRequest: { regenerateReason: null },
      sourceVersionRefs: { currentDirectionVersionId: null }, now: () => now,
      durationDeadlineAt: new Date(now.getTime() + 15 * 60_000),
      providerCapability: new MockDirectionProvider()
    });
    assert.equal(queued.task.status, TaskStatus.Queued);
    const [first, second] = await Promise.all([
      runWorkerChild(queued.task.id, context.tenantId),
      runWorkerChild(queued.task.id, context.tenantId)
    ]);
    assert.equal(first.result, 'worker_finished');
    assert.equal(second.result, 'worker_finished');
    assert.equal(first.calls + second.calls, 1);
    const task = await repository.findTaskById(context.tenantId, queued.task.id);
    assert.equal(task?.status, TaskStatus.WaitingConfirmation);
    assert.equal(task?.providerCallBudgetUsed, 1);
    assert.ok(task.resultReceiptHash);
    const events = await repository.listTaskEvents(context.tenantId, task.id);
    assert.equal(events.filter((event) => event.eventType === 'task_leased').length, 1);
    assert.equal(events.filter((event) => event.eventType === 'task_finalized').length, 1);
    const versions = await getPrismaClient().creativeVersion.findMany({
      where: { tenantId: context.tenantId, novelId: novel.id, sourceTaskId: task.id }
    });
    assert.equal(versions.length, 4);
    assert.ok(versions.every((version) => version.status === 'CANDIDATE'));
    const persistedNovel = await getPrismaClient().novel.findFirstOrThrow({
      where: { tenantId: context.tenantId, id: novel.id }
    });
    assert.equal(persistedNovel.currentDirectionVersionId, null);
    process.stdout.write(JSON.stringify({ result: 'passed', taskId: task.id,
      providerCalls: first.calls + second.calls, leasedEvents: 1, candidateCount: versions.length }) + '\n');
  } finally {
    await disconnectPrismaClient();
  }
}

if (process.argv[2] === 'worker') await workerChild();
else await parentRun();
