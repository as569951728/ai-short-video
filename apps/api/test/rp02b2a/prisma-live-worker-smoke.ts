import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TaskStatus } from '@ai-shortvideo/shared';
import { getPrismaClient, disconnectPrismaClient } from '../../src/infrastructure/database/prisma.js';
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
  throw new Error('E1 MySQL smoke requires a dedicated loopback test schema and non-default port.');
}

class IsolatedPrismaRepository extends PrismaNovelRepository {
  override async getLeasedExecutionCapability(taskType: string) {
    return taskType === 'novel_direction_generate' ? 'enabled' as const : super.getLeasedExecutionCapability(taskType);
  }
}

const repository = new IsolatedPrismaRepository();
const directionProvider = new MockDirectionProvider();
const suffix = randomUUID();
const context = { tenantId: `tenant-e1-${suffix.slice(0, 8)}`, userId: `user-e1-${suffix.slice(0, 8)}`,
  requestId: `req-e1-${suffix}` };
const { novel } = await repository.createDraft({ request: { title: 'E1 MySQL worker smoke' }, context, now: new Date() });
const now = await repository.getAuthoritativeTaskTime();
const queued = await claimQueuedGeneration({
  action: 'direction_generate', repository, novel, context,
  idempotencyKey: `e1-submit-${suffix}`, effectiveRequest: { regenerateReason: null },
  sourceVersionRefs: { currentDirectionVersionId: null }, now: () => now,
  durationDeadlineAt: new Date(now.getTime() + 15 * 60_000), providerCapability: directionProvider
});
assert.equal(queued.task.status, TaskStatus.Queued);

const worker = new NovelTaskWorkerRuntime({
  repository, clock: { now: () => repository.getAuthoritativeTaskTime() },
  scheduler: createSystemNovelTaskWorkerScheduler(), workerId: `e1-worker-${suffix}`,
  policy: { workerConcurrency: 1, leaseDurationMs: 10_000, heartbeatIntervalMs: 1000,
    pollIntervalMs: 200, shutdownGracePeriodMs: 1000 },
  ...createLeasedActionExecutor({ repository, providers: {
    directionProvider, structureProvider: new MockStructureProvider(), trialProvider: new MockTrialProvider(),
    bodyProvider: new MockBodyProvider(), fullReviewProvider: new MockFullReviewProvider()
  } }),
  onRuntimeError: (stage) => { process.stderr.write(`E1 worker ${stage} failed\n`); }
});

try {
  worker.start();
  let task = queued.task;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const current = await repository.findTaskById(context.tenantId, queued.task.id);
    if (!current) throw new Error('Queued task disappeared.');
    task = current;
    if (![TaskStatus.Queued, TaskStatus.Processing].includes(task.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(task.status, TaskStatus.WaitingConfirmation, `Unexpected task status: ${task.status}`);
  assert.equal(task.providerCallBudgetUsed, 1);
  assert.ok(task.resultReceiptHash);
  const prisma = getPrismaClient();
  const versions = await prisma.creativeVersion.findMany({
    where: { tenantId: context.tenantId, novelId: novel.id, sourceTaskId: task.id }
  });
  assert.equal(versions.length, 4);
  assert.ok(versions.every((version) => version.status === 'CANDIDATE'));
  const persistedNovel = await prisma.novel.findFirstOrThrow({ where: { tenantId: context.tenantId, id: novel.id } });
  assert.equal(persistedNovel.currentDirectionVersionId, null);
  const events = await repository.listTaskEvents(context.tenantId, task.id);
  assert.equal(events.filter((event) => event.eventType === 'task_finalized').length, 1);
  process.stdout.write(JSON.stringify({ result: 'passed', taskId: task.id, status: task.status,
    candidateCount: versions.length, providerCallBudgetUsed: task.providerCallBudgetUsed }) + '\n');
} finally {
  await worker.stop();
  await disconnectPrismaClient();
}

const interruptedRepository = new IsolatedPrismaRepository();
const interruptedContext = { tenantId: `tenant-e1-${randomUUID().slice(0, 8)}`,
  userId: `user-e1-${randomUUID().slice(0, 8)}`, requestId: `req-e1-${randomUUID()}` };
const interruptedDraft = await interruptedRepository.createDraft({
  request: { title: 'E1 MySQL interrupted call smoke' }, context: interruptedContext, now: new Date()
});
const interruptedNow = await interruptedRepository.getAuthoritativeTaskTime();
const interruptedTask = await claimQueuedGeneration({
  action: 'direction_generate', repository: interruptedRepository, novel: interruptedDraft.novel,
  context: interruptedContext, idempotencyKey: `e1-interrupted-${randomUUID()}`,
  effectiveRequest: { regenerateReason: null }, sourceVersionRefs: { currentDirectionVersionId: null },
  now: () => interruptedNow, durationDeadlineAt: new Date(interruptedNow.getTime() + 15 * 60_000),
  providerCapability: directionProvider
});
let releaseProvider!: () => void;
const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve; });
const interruptedProvider = new MockDirectionProvider();
const generate = interruptedProvider.generateCandidates.bind(interruptedProvider);
let providerCalls = 0;
interruptedProvider.generateCandidates = async (input) => {
  providerCalls += 1;
  await providerGate;
  return generate(input);
};
const interruptedWorker = new NovelTaskWorkerRuntime({
  repository: interruptedRepository,
  clock: { now: () => interruptedRepository.getAuthoritativeTaskTime() },
  scheduler: createSystemNovelTaskWorkerScheduler(), workerId: `e1-interrupted-${randomUUID()}`,
  policy: { workerConcurrency: 1, leaseDurationMs: 1000, heartbeatIntervalMs: 100,
    pollIntervalMs: 100, shutdownGracePeriodMs: 100 },
  ...createLeasedActionExecutor({ repository: interruptedRepository, providers: {
    directionProvider: interruptedProvider, structureProvider: new MockStructureProvider(),
    trialProvider: new MockTrialProvider(), bodyProvider: new MockBodyProvider(),
    fullReviewProvider: new MockFullReviewProvider()
  } })
});
try {
  interruptedWorker.start();
  const deadline = Date.now() + 10_000;
  let dispatched = false;
  while (Date.now() < deadline) {
    const current = await interruptedRepository.findTaskById(interruptedContext.tenantId, interruptedTask.task.id);
    if (current?.providerCallBudgetUsed === 1 && providerCalls === 1) {
      dispatched = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(dispatched, true, 'Worker did not reach the paid provider phase.');
  await interruptedWorker.stop();
  await disconnectPrismaClient();
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const restartedRepository = new IsolatedPrismaRepository();
  const recovered = await sweepExpiredNovelTasks(restartedRepository,
    await restartedRepository.getAuthoritativeTaskTime());
  assert.equal(recovered.recovered, 1);
  const failed = await restartedRepository.findTaskById(interruptedContext.tenantId, interruptedTask.task.id);
  assert.equal(failed?.status, TaskStatus.Failed);
  assert.equal(failed?.errorCode, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(failed?.providerCallBudgetUsed, 1);
  assert.equal(providerCalls, 1);
  releaseProvider();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const versions = await getPrismaClient().creativeVersion.count({
    where: { tenantId: interruptedContext.tenantId, sourceTaskId: interruptedTask.task.id }
  });
  assert.equal(versions, 0);
  process.stdout.write(JSON.stringify({ result: 'recovered_unknown_without_replay', taskId: failed.id,
    providerCalls, candidateCount: versions, providerCallBudgetUsed: failed.providerCallBudgetUsed }) + '\n');
} finally {
  releaseProvider();
  await interruptedWorker.stop();
  await disconnectPrismaClient();
}
