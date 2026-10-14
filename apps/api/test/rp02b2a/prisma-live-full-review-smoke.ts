import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TaskStatus } from '@ai-shortvideo/shared';
import { buildApp } from '../../src/app.js';
import { disconnectPrismaClient, getPrismaClient } from '../../src/infrastructure/database/prisma.js';
import { MockBodyProvider } from '../../src/modules/novels/providers/mockBodyProvider.js';
import { MockDirectionProvider } from '../../src/modules/novels/providers/mockDirectionProvider.js';
import { MockFullReviewProvider } from '../../src/modules/novels/providers/mockFullReviewProvider.js';
import { MockStructureProvider } from '../../src/modules/novels/providers/mockStructureProvider.js';
import { MockTrialProvider } from '../../src/modules/novels/providers/mockTrialProvider.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';
import { createFullReviewAcceptanceSeed } from '../../src/modules/novels/routes/novelRoutes.js';
import { createLeasedActionExecutor } from '../../src/modules/novels/services/leasedActionExecutor.js';
import { NovelService } from '../../src/modules/novels/services/novelService.js';
import { NovelTaskWorkerRuntime, createSystemNovelTaskWorkerScheduler } from '../../src/modules/novels/services/novelTaskWorkerRuntime.js';
import { sweepExpiredNovelTasks } from '../../src/modules/novels/services/recoveryScanner.js';

const url = process.env.E1_MYSQL_SMOKE_URL;
if (process.env.E1_FULL_REVIEW_SMOKE !== 'true' || !url || process.env.DATABASE_URL !== url) {
  throw new Error('Set E1_FULL_REVIEW_SMOKE=true and matching E1_MYSQL_SMOKE_URL/DATABASE_URL.');
}
if (process.env.NODE_ENV !== 'development' || process.env.AI_PROVIDER_MODE !== 'mock') {
  throw new Error('E1 full-review smoke requires development mock mode.');
}
const target = new URL(url);
if (target.protocol !== 'mysql:' || !['127.0.0.1', 'localhost'].includes(target.hostname)
  || !/^\/ai_shortvideo_e1_[a-z0-9_]+$/.test(target.pathname)
  || !target.port || target.port === '3306' || target.search || target.hash
  || !/^e1_[a-z0-9_]+$/.test(target.username) || !target.password) {
  throw new Error('E1 full-review smoke requires a dedicated loopback schema and non-default port.');
}

class IsolatedPrismaRepository extends PrismaNovelRepository {
  override async assertProviderActionSupported(taskType: string) {
    if (taskType !== 'novel_full_review') await super.assertProviderActionSupported(taskType);
  }

  override async getLeasedExecutionCapability(taskType: string) {
    return taskType === 'novel_full_review' ? 'enabled' as const
      : super.getLeasedExecutionCapability(taskType);
  }
}

const suffix = randomUUID();
const context = { tenantId: `tenant-e1-review-${suffix.slice(0, 8)}`,
  userId: `user-e1-review-${suffix.slice(0, 8)}`, requestId: `req-e1-review-${suffix}` };
const repository = new IsolatedPrismaRepository();
const prisma = getPrismaClient();
const model = new MockFullReviewProvider();
let providerCalls = 0;
const fullReviewProvider = {
  getLeasedPaidCallBudget: () => 1 as const,
  async generateFullReview(input: Parameters<MockFullReviewProvider['generateFullReview']>[0]) {
    providerCalls += 1;
    return model.generateFullReview(input);
  }
};
const app = await buildApp({
  logger: false, novelRepository: repository, enableAcceptanceSeeds: false,
  aiProviderEnv: { AI_PROVIDER_MODE: 'mock' }, fullReviewProvider,
  asyncTransportPolicy: { novelAsyncDispatchEnabled: true,
    scopeSecret: 'e1-full-review-isolated-scope-secret-32-min', apiAudience: 'e1-full-review-smoke' },
  requestContextResolver: async () => context
});
const worker = new NovelTaskWorkerRuntime({
  repository, clock: { now: () => repository.getAuthoritativeTaskTime() },
  scheduler: createSystemNovelTaskWorkerScheduler(), workerId: `e1-full-review-${suffix}`,
  policy: { workerConcurrency: 1, leaseDurationMs: 10_000, heartbeatIntervalMs: 1_000,
    pollIntervalMs: 100, shutdownGracePeriodMs: 1_000 },
  ...createLeasedActionExecutor({ repository, providers: {
    directionProvider: new MockDirectionProvider(), structureProvider: new MockStructureProvider(),
    trialProvider: new MockTrialProvider(), bodyProvider: new MockBodyProvider(), fullReviewProvider
  } })
});

try {
  await prisma.$queryRaw`SELECT 1`;
  await prisma.$transaction(async (tx) => tx.$queryRaw`SELECT 1`);
  const seed = await createFullReviewAcceptanceSeed(
    new NovelService({ repository, now: () => new Date() }),
    { title: 'E1 隔离数据库全书审稿验收' }, context
  );
  const novelId = seed.novelId;
  const detail = await app.inject({ method: 'GET', url: `/novels/${novelId}` });
  assert.equal(detail.statusCode, 200, detail.body);
  const expectedNovelVersion = detail.json().data.updatedAt as string;
  const capability = (await app.inject({ method: 'GET', url: '/novels/async-transport-capability' })).json().data;
  assert.equal(capability.enabled, true);
  const payload = { expectedNovelVersion, expectedSubmissionScopeId: capability.submissionScopeId,
    expectedCapabilityRevision: capability.capabilityRevision,
    expectedCapabilityExpiresAt: capability.expiresAt };
  const key = `e1-full-review-${suffix}`;
  const route = `/novels/${novelId}/full-review`;
  const first = await app.inject({ method: 'POST', url: route,
    headers: { 'idempotency-key': key }, payload });
  assert.equal(first.statusCode, 202, first.body);
  const taskId = first.json().data.taskId as string;
  const duplicate = await app.inject({ method: 'POST', url: route,
    headers: { 'idempotency-key': key }, payload });
  assert.equal(duplicate.statusCode, 202, duplicate.body);
  assert.equal(duplicate.json().data.taskId, taskId);
  assert.equal(providerCalls, 0);

  worker.start();
  let task = await repository.findTaskById(context.tenantId, taskId);
  const deadline = Date.now() + 60_000;
  while (task && [TaskStatus.Queued, TaskStatus.Processing].includes(task.status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    task = await repository.findTaskById(context.tenantId, taskId);
  }
  assert.equal(task?.status, TaskStatus.Completed, JSON.stringify({ status: task?.status, errorCode: task?.errorCode }));
  assert.equal(task.providerCallBudgetUsed, 1);
  assert.equal(providerCalls, 1);
  assert.ok(task.resultReceiptHash);
  const latest = await repository.findLatestFullReview(context.tenantId, novelId);
  assert.equal(latest?.reviewReport.sourceTaskId, taskId);
  assert.equal(latest?.gate.reviewReportId, latest?.reviewReport.id);
  assert.equal(latest?.gate.allowCompletion, true);
  assert.equal(await repository.findLatestCompletionDecision(context.tenantId, novelId), null);
  assert.equal((await repository.findById(context.tenantId, novelId))?.creationStage, 'completion_confirm');
  assert.equal((await repository.findById(context.tenantId, novelId))?.stageStatus, 'waiting_user');
  assert.equal(await prisma.reviewReport.count({ where: { tenantId: context.tenantId,
    novelId, sourceTaskId: taskId, reviewLevel: 'full_novel' } }), 1);
  assert.equal(await prisma.fullReviewGate.count({ where: { tenantId: context.tenantId,
    novelId, reviewReportId: latest!.reviewReport.id } }), 1);
  assert.equal((await repository.listTaskEvents(context.tenantId, taskId))
    .filter((event) => event.eventType === 'task_finalized').length, 1);

  const replayCapability = (await app.inject({ method: 'GET', url: '/novels/async-transport-capability' })).json().data;
  const replay = await app.inject({ method: 'POST', url: route, headers: { 'idempotency-key': key },
    payload: { expectedNovelVersion, expectedSubmissionScopeId: replayCapability.submissionScopeId,
      expectedCapabilityRevision: replayCapability.capabilityRevision,
      expectedCapabilityExpiresAt: replayCapability.expiresAt } });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().data.taskId, taskId);
  assert.equal(providerCalls, 1);
  assert.equal((await repository.finalizeLeasedAction({ tenantId: context.tenantId, taskId,
    leaseOwnerId: 'late-worker', leaseToken: 'late-lease', providerAttemptId: task.providerAttemptId!,
    authoritativeNow: await repository.getAuthoritativeTaskTime(), validatedResult: null })).outcome, 'fenced');
  await worker.stop();
  await app.close();
  await disconnectPrismaClient();

  const reopened = new IsolatedPrismaRepository();
  assert.equal((await reopened.findTaskById(context.tenantId, taskId))?.status, TaskStatus.Completed);
  assert.equal((await reopened.findLatestFullReview(context.tenantId, novelId))?.reviewReport.sourceTaskId, taskId);
  assert.equal(await reopened.findLatestCompletionDecision(context.tenantId, novelId), null);
  process.stdout.write(JSON.stringify({ result: 'passed', taskId, status: task.status,
    providerCallBudgetUsed: task.providerCallBudgetUsed, providerCalls,
    reviewReportCount: 1, fullReviewGateCount: 1, completionDecisionCount: 0,
    replayedSameTask: true, reopenedSameResult: true }) + '\n');

  const interruptedContext = { tenantId: `tenant-e1-interrupted-${suffix.slice(0, 8)}`,
    userId: `user-e1-interrupted-${suffix.slice(0, 8)}`, requestId: `req-e1-interrupted-${suffix}` };
  await reopened.getAuthoritativeTaskTime();
  const interruptedSeed = await createFullReviewAcceptanceSeed(
    new NovelService({ repository: reopened, now: () => new Date() }),
    { title: 'E1 隔离数据库全书审稿中断验收' }, interruptedContext
  );
  const interruptedNovel = await reopened.findById(interruptedContext.tenantId, interruptedSeed.novelId);
  assert.ok(interruptedNovel);
  let releaseProvider!: () => void;
  const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve; });
  let interruptedProviderCalls = 0;
  const interruptedProvider = {
    getLeasedPaidCallBudget: () => 1 as const,
    async generateFullReview(input: Parameters<MockFullReviewProvider['generateFullReview']>[0]) {
      interruptedProviderCalls += 1;
      await providerGate;
      return model.generateFullReview(input);
    }
  };
  const interruptedNow = await reopened.getAuthoritativeTaskTime();
  const interruptedTask = await new NovelService({ repository: reopened,
    fullReviewProvider: interruptedProvider, now: () => new Date() }).queueFullReview(
    interruptedNovel.id,
    { idempotencyKey: `e1-full-review-interrupted-${suffix}`,
      expectedNovelVersion: interruptedNovel.updatedAt.toISOString() },
    interruptedContext, interruptedNow
  );
  assert.equal(interruptedTask.task.status, TaskStatus.Queued);
  const interruptedWorker = new NovelTaskWorkerRuntime({
    repository: reopened, clock: { now: () => reopened.getAuthoritativeTaskTime() },
    scheduler: createSystemNovelTaskWorkerScheduler(), workerId: `e1-full-review-interrupted-${suffix}`,
    policy: { workerConcurrency: 1, leaseDurationMs: 1_000, heartbeatIntervalMs: 100,
      pollIntervalMs: 100, shutdownGracePeriodMs: 100 },
    ...createLeasedActionExecutor({ repository: reopened, providers: {
      directionProvider: new MockDirectionProvider(), structureProvider: new MockStructureProvider(),
      trialProvider: new MockTrialProvider(), bodyProvider: new MockBodyProvider(),
      fullReviewProvider: interruptedProvider
    } })
  });
  try {
    interruptedWorker.start();
    const dispatchDeadline = Date.now() + 10_000;
    let dispatched = false;
    while (Date.now() < dispatchDeadline) {
      const current = await reopened.findTaskById(interruptedContext.tenantId, interruptedTask.task.id);
      if (current?.providerCallBudgetUsed === 1 && interruptedProviderCalls === 1) {
        dispatched = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(dispatched, true, 'Full-review worker did not reach the provider phase.');
    await interruptedWorker.stop();
    await disconnectPrismaClient();
    await new Promise((resolve) => setTimeout(resolve, 1_200));

    const restarted = new IsolatedPrismaRepository();
    const recovered = await sweepExpiredNovelTasks(restarted, await restarted.getAuthoritativeTaskTime());
    assert.equal(recovered.recovered, 1);
    const failed = await restarted.findTaskById(interruptedContext.tenantId, interruptedTask.task.id);
    assert.equal(failed?.status, TaskStatus.Failed);
    assert.equal(failed?.errorCode, 'PROVIDER_OUTCOME_UNKNOWN');
    assert.equal(failed?.providerCallBudgetUsed, 1);
    assert.equal(interruptedProviderCalls, 1);
    releaseProvider();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(await getPrismaClient().reviewReport.count({ where: {
      tenantId: interruptedContext.tenantId, novelId: interruptedNovel.id,
      sourceTaskId: interruptedTask.task.id, reviewLevel: 'full_novel'
    } }), 0);
    assert.equal(await getPrismaClient().fullReviewGate.count({ where: {
      tenantId: interruptedContext.tenantId, novelId: interruptedNovel.id
    } }), 0);
    process.stdout.write(JSON.stringify({ result: 'recovered_unknown_without_replay',
      taskId: failed.id, providerCalls: interruptedProviderCalls,
      providerCallBudgetUsed: failed.providerCallBudgetUsed,
      reviewReportCount: 0, fullReviewGateCount: 0 }) + '\n');
  } finally {
    releaseProvider();
    await interruptedWorker.stop();
  }
} finally {
  await worker.stop();
  await app.close();
  await disconnectPrismaClient();
}
