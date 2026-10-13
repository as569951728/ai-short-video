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
import { sweepExpiredNovelTasks } from '../../src/modules/novels/services/recoveryScanner.js';
import { claimQueuedGeneration } from '../../src/modules/novels/services/taskClaim.js';

const url = process.env.E1_MYSQL_SMOKE_URL;
if (!url || process.env.DATABASE_URL !== url) throw new Error('Set matching E1_MYSQL_SMOKE_URL and DATABASE_URL.');
const target = new URL(url);
if (target.protocol !== 'mysql:' || !['127.0.0.1', 'localhost'].includes(target.hostname)
  || !/^\/ai_shortvideo_e1_[a-z0-9_]+$/.test(target.pathname)
  || !target.port || target.port === '3306' || target.search || target.hash
  || !target.username || !target.password) {
  throw new Error('E1 process smoke requires a dedicated loopback test schema and non-default port.');
}

class IsolatedPrismaRepository extends PrismaNovelRepository {
  override async getLeasedExecutionCapability(taskType: string) {
    return taskType === 'novel_direction_generate' ? 'enabled' as const : super.getLeasedExecutionCapability(taskType);
  }
}

function createWorker(repository: IsolatedPrismaRepository, provider: MockDirectionProvider) {
  return new NovelTaskWorkerRuntime({
    repository, clock: { now: () => repository.getAuthoritativeTaskTime() },
    scheduler: createSystemNovelTaskWorkerScheduler(), workerId: `e1-process-${randomUUID()}`,
    policy: { workerConcurrency: 1, leaseDurationMs: 1500, heartbeatIntervalMs: 200,
      pollIntervalMs: 100, shutdownGracePeriodMs: 100 },
    ...createLeasedActionExecutor({ repository, providers: {
      directionProvider: provider, structureProvider: new MockStructureProvider(),
      trialProvider: new MockTrialProvider(), bodyProvider: new MockBodyProvider(),
      fullReviewProvider: new MockFullReviewProvider()
    } })
  });
}

async function childRun() {
  const repository = new IsolatedPrismaRepository();
  const suffix = randomUUID();
  const context = { tenantId: `tenant-e1-${suffix.slice(0, 8)}`,
    userId: `user-e1-${suffix.slice(0, 8)}`, requestId: `req-e1-${suffix}` };
  const { novel } = await repository.createDraft({
    request: { title: 'E1 killed process smoke' }, context, now: new Date()
  });
  const provider = new MockDirectionProvider();
  let calls = 0;
  provider.generateCandidates = async () => {
    calls += 1;
    return new Promise<never>(() => {});
  };
  const now = await repository.getAuthoritativeTaskTime();
  const queued = await claimQueuedGeneration({
    action: 'direction_generate', repository, novel, context,
    idempotencyKey: `e1-killed-${suffix}`, effectiveRequest: { regenerateReason: null },
    sourceVersionRefs: { currentDirectionVersionId: null }, now: () => now,
    durationDeadlineAt: new Date(now.getTime() + 15 * 60_000), providerCapability: provider
  });
  const worker = createWorker(repository, provider);
  worker.start();
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const task = await repository.findTaskById(context.tenantId, queued.task.id);
    if (task?.providerCallBudgetUsed === 1 && calls === 1) {
      process.stdout.write(JSON.stringify({ phase: 'dispatched', tenantId: context.tenantId,
        novelId: novel.id, taskId: task.id }) + '\n');
      setInterval(() => {}, 60_000);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Child did not dispatch the provider call.');
}

async function parentRun() {
  const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), 'child'], {
    env: process.env, stdio: ['ignore', 'pipe', 'pipe']
  });
  const childExit = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-2000); });
  let marker: { phase: string; tenantId: string; novelId: string; taskId: string };
  try {
    marker = await new Promise((resolve, reject) => {
      let stdout = '';
      const timeout = setTimeout(() => reject(new Error('Child dispatch timed out.')), 15_000);
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
        const line = stdout.split('\n')[0];
        if (!line || !stdout.includes('\n')) return;
        clearTimeout(timeout);
        try { resolve(JSON.parse(line)); } catch (error) { reject(error); }
      });
      child.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Child exited before dispatch: ${code}; ${stderr}`));
      });
    });
    assert.equal(marker.phase, 'dispatched');
    child.kill('SIGKILL');
    await childExit;
    await new Promise((resolve) => setTimeout(resolve, 1700));

    const repository = new IsolatedPrismaRepository();
    const recovery = await sweepExpiredNovelTasks(repository, await repository.getAuthoritativeTaskTime());
    assert.equal(recovery.recovered, 1);
    const task = await repository.findTaskById(marker.tenantId, marker.taskId);
    assert.equal(task?.status, TaskStatus.Failed);
    assert.equal(task?.errorCode, 'PROVIDER_OUTCOME_UNKNOWN');
    assert.equal(task?.providerCallBudgetUsed, 1);
    assert.equal(await getPrismaClient().creativeVersion.count({
      where: { tenantId: marker.tenantId, novelId: marker.novelId, sourceTaskId: marker.taskId }
    }), 0);

    const restartedProvider = new MockDirectionProvider();
    let replayCalls = 0;
    restartedProvider.generateCandidates = async (input) => {
      replayCalls += 1;
      return new MockDirectionProvider().generateCandidates(input);
    };
    const restartedWorker = createWorker(repository, restartedProvider);
    try {
      restartedWorker.start();
      await new Promise((resolve) => setTimeout(resolve, 400));
      assert.equal(replayCalls, 0);
    } finally {
      await restartedWorker.stop();
    }
    process.stdout.write(JSON.stringify({ result: 'passed', taskId: marker.taskId,
      status: task.status, errorCode: task.errorCode, providerCallBudgetUsed: task.providerCallBudgetUsed,
      replayCalls }) + '\n');
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await childExit;
    await disconnectPrismaClient();
  }
}

if (process.argv[2] === 'child') await childRun();
else await parentRun();
