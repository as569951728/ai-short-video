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
import { NovelService } from '../../src/modules/novels/services/novelService.js';
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
    return ['novel_direction_generate', 'novel_direction_fuse', 'novel_direction_optimize'].includes(taskType)
      ? 'enabled' as const : super.getLeasedExecutionCapability(taskType);
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

  const sourceVersionIds = versions.slice(0, 2).map((version) => version.id);
  const fuseNow = await repository.getAuthoritativeTaskTime();
  const fuseQueued = await claimQueuedGeneration({
    action: 'direction_fuse', repository, novel: (await repository.findById(context.tenantId, novel.id))!, context,
    idempotencyKey: `e1-fuse-${suffix}`,
    effectiveRequest: { versionIds: [...sourceVersionIds].sort(), reason: '保留两条方向的钩子' },
    sourceVersionRefs: { sourceVersionIds }, now: () => fuseNow,
    durationDeadlineAt: new Date(fuseNow.getTime() + 15 * 60_000), providerCapability: directionProvider
  });
  const fuseTask = await waitForTerminalTask(repository, context.tenantId, fuseQueued.task.id);
  assert.equal(fuseTask.status, TaskStatus.WaitingConfirmation);
  assert.equal(fuseTask.providerCallBudgetUsed, 1);
  assert.ok(fuseTask.resultReceiptHash);
  const fusedVersions = await prisma.creativeVersion.findMany({
    where: { tenantId: context.tenantId, novelId: novel.id, sourceTaskId: fuseTask.id }
  });
  assert.equal(fusedVersions.length, 1);
  assert.equal(fuseTask.resultVersionIds[0], fusedVersions[0]?.id);
  assert.deepEqual((fusedVersions[0]?.sourceVersionRefs as { sourceVersionIds: string[] }).sourceVersionIds,
    sourceVersionIds);
  assert.equal(fusedVersions[0]?.changeReason, '保留两条方向的钩子');
  assert.equal((await repository.listTaskEvents(context.tenantId, fuseTask.id))
    .filter((event) => event.eventType === 'task_finalized').length, 1);
  assert.equal((await repository.findById(context.tenantId, novel.id))?.currentDirectionVersionId, null);

  const service = new NovelService({ repository });
  await service.adoptDirection(novel.id, versions[0]!.id, {
    currentVersionId: null, idempotencyKey: `e1-adopt-${suffix}`, reason: '确认正式创作方向'
  }, context);
  const adopted = await repository.findById(context.tenantId, novel.id);
  assert.equal(adopted?.currentDirectionVersionId, versions[0]!.id);
  const optimizeNow = await repository.getAuthoritativeTaskTime();
  const optimizeQueued = await claimQueuedGeneration({
    action: 'direction_optimize', repository, novel: adopted!, objectId: versions[0]!.id, context,
    idempotencyKey: `e1-optimize-${suffix}`,
    effectiveRequest: { versionId: versions[0]!.id, instruction: '强化人物动机' },
    sourceVersionRefs: { sourceVersionIds: [versions[0]!.id] }, now: () => optimizeNow,
    durationDeadlineAt: new Date(optimizeNow.getTime() + 15 * 60_000), providerCapability: directionProvider
  });
  const optimizeTask = await waitForTerminalTask(repository, context.tenantId, optimizeQueued.task.id);
  assert.equal(optimizeTask.status, TaskStatus.WaitingConfirmation);
  assert.equal(optimizeTask.providerCallBudgetUsed, 1);
  assert.ok(optimizeTask.resultReceiptHash);
  const optimizedVersions = await prisma.creativeVersion.findMany({
    where: { tenantId: context.tenantId, novelId: novel.id, sourceTaskId: optimizeTask.id }
  });
  assert.equal(optimizedVersions.length, 1);
  assert.equal(optimizeTask.resultVersionIds[0], optimizedVersions[0]?.id);
  assert.deepEqual((optimizedVersions[0]?.sourceVersionRefs as { sourceVersionIds: string[] }).sourceVersionIds,
    [versions[0]!.id]);
  assert.equal(optimizedVersions[0]?.changeReason, '强化人物动机');
  assert.equal((await repository.listTaskEvents(context.tenantId, optimizeTask.id))
    .filter((event) => event.eventType === 'task_finalized').length, 1);
  const afterOptimize = await repository.findById(context.tenantId, novel.id);
  assert.equal(afterOptimize?.currentDirectionVersionId, versions[0]!.id);
  assert.equal(afterOptimize?.creationStage, adopted?.creationStage);
  assert.equal((await repository.finalizeLeasedAction({
    tenantId: context.tenantId, taskId: optimizeTask.id,
    leaseOwnerId: 'stale-worker', leaseToken: 'stale-lease',
    authoritativeNow: await repository.getAuthoritativeTaskTime(),
    providerAttemptId: optimizeTask.providerAttemptId!, validatedResult: {}
  })).outcome, 'fenced');
  assert.equal(await prisma.creativeVersion.count({
    where: { tenantId: context.tenantId, novelId: novel.id, sourceTaskId: optimizeTask.id }
  }), 1);

  await worker.stop();
  const invalidNow = await repository.getAuthoritativeTaskTime();
  const invalidQueued = await claimQueuedGeneration({
    action: 'direction_optimize', repository, novel: afterOptimize!, objectId: versions[0]!.id, context,
    idempotencyKey: `e1-invalid-optimize-${suffix}`,
    effectiveRequest: { versionId: versions[0]!.id, instruction: '校验异常结果' },
    sourceVersionRefs: { sourceVersionIds: [versions[0]!.id] }, now: () => invalidNow,
    durationDeadlineAt: new Date(invalidNow.getTime() + 15 * 60_000), providerCapability: directionProvider
  });
  const invalidLease = {
    tenantId: context.tenantId, taskId: invalidQueued.task.id,
    leaseOwnerId: `e1-invalid-${suffix}`, leaseToken: randomUUID()
  };
  const leased = await repository.leaseNextQueuedTask(invalidLease.leaseOwnerId, invalidLease.leaseToken,
    invalidNow, new Date(invalidNow.getTime() + 10_000));
  assert.equal(leased?.id, invalidQueued.task.id);
  assert.equal((await repository.checkpointLeasedTask({ ...invalidLease,
    authoritativeNow: await repository.getAuthoritativeTaskTime(),
    checkpoint: { expectedPhase: 'leased', nextPhase: 'prepared' }
  })).outcome, 'applied');
  const invalidAttemptId = randomUUID();
  assert.equal((await repository.dispatchLeasedTask({ ...invalidLease,
    authoritativeNow: await repository.getAuthoritativeTaskTime(), providerAttemptId: invalidAttemptId
  })).outcome, 'applied');
  assert.equal((await repository.checkpointLeasedTask({ ...invalidLease,
    authoritativeNow: await repository.getAuthoritativeTaskTime(),
    checkpoint: { expectedPhase: 'provider_call_started', nextPhase: 'provider_result_validated',
      providerAttemptId: invalidAttemptId }
  })).outcome, 'applied');
  assert.equal((await repository.finalizeLeasedAction({ ...invalidLease,
    authoritativeNow: await repository.getAuthoritativeTaskTime(),
    providerAttemptId: invalidAttemptId, validatedResult: []
  })).outcome, 'applied');
  const invalidTask = await repository.findTaskById(context.tenantId, invalidQueued.task.id);
  assert.equal(invalidTask?.status, TaskStatus.Failed);
  assert.equal(invalidTask?.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
  assert.equal(invalidTask?.providerCallBudgetUsed, 1);
  assert.equal(await prisma.creativeVersion.count({
    where: { tenantId: context.tenantId, novelId: novel.id, sourceTaskId: invalidQueued.task.id }
  }), 0);
  assert.equal((await repository.listTaskEvents(context.tenantId, invalidQueued.task.id))
    .filter((event) => event.eventType === 'task_failed').length, 1);
  process.stdout.write(JSON.stringify({ result: 'passed', taskId: task.id, status: task.status,
    candidateCount: versions.length, providerCallBudgetUsed: task.providerCallBudgetUsed,
    fuseTaskId: fuseTask.id, optimizeTaskId: optimizeTask.id,
    revisionCandidateCount: fusedVersions.length + optimizedVersions.length,
    malformedResultStatus: invalidTask?.status }) + '\n');
} finally {
  await worker.stop();
  await disconnectPrismaClient();
}

async function waitForTerminalTask(repository: PrismaNovelRepository, tenantId: string, taskId: string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const task = await repository.findTaskById(tenantId, taskId);
    if (!task) throw new Error('Queued revision task disappeared.');
    if (![TaskStatus.Queued, TaskStatus.Processing].includes(task.status)) return task;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Queued revision task did not finish.');
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
