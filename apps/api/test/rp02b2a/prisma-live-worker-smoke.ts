import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TaskStatus } from '@ai-shortvideo/shared';
import { getPrismaClient, disconnectPrismaClient } from '../../src/infrastructure/database/prisma.js';
import { MockBodyProvider } from '../../src/modules/novels/providers/mockBodyProvider.js';
import { MockDirectionProvider } from '../../src/modules/novels/providers/mockDirectionProvider.js';
import { MockFullReviewProvider } from '../../src/modules/novels/providers/mockFullReviewProvider.js';
import { MockStructureProvider } from '../../src/modules/novels/providers/mockStructureProvider.js';
import { MockTrialProvider } from '../../src/modules/novels/providers/mockTrialProvider.js';
import type { NovelProviderActionInputFor } from '../../src/modules/novels/services/actionExecutionPlan.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';
import { createLeasedActionExecutor } from '../../src/modules/novels/services/leasedActionExecutor.js';
import { NovelService } from '../../src/modules/novels/services/novelService.js';
import { NovelTaskWorkerRuntime, createSystemNovelTaskWorkerScheduler } from '../../src/modules/novels/services/novelTaskWorkerRuntime.js';
import { sweepExpiredNovelTasks } from '../../src/modules/novels/services/recoveryScanner.js';
import { claimQueuedGeneration, reconstructLeasedProviderInput } from '../../src/modules/novels/services/taskClaim.js';

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
    return ['novel_direction_generate', 'novel_direction_fuse', 'novel_direction_optimize',
      'trial_writing_generate', 'trial_followup_generate'].includes(taskType)
      ? 'enabled' as const : super.getLeasedExecutionCapability(taskType);
  }
}

const repository = new IsolatedPrismaRepository();
const directionProvider = new MockDirectionProvider();
const trialProvider = new MockTrialProvider();
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
    directionProvider, structureProvider: new MockStructureProvider(), trialProvider,
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

  const plan = await prisma.creativeVersion.create({ data: {
    tenantId: context.tenantId, novelId: novel.id,
    objectType: 'chapter_plan', objectId: 'chapter_plan', versionNo: 1,
    status: 'CURRENT', contentJson: { title: '隔离试写目录', summary: '首章试写恢复验证' },
    createdBy: context.userId
  } });
  await prisma.novel.update({ where: { id: novel.id }, data: {
    currentChapterPlanVersionId: plan.id, creationStage: 'CHAPTER_PLAN', stageStatus: 'WAITING_USER'
  } });
  const chapters = [];
  for (let chapterNo = 1; chapterNo <= 3; chapterNo += 1) {
    chapters.push(await prisma.novelChapter.create({ data: {
      tenantId: context.tenantId, novelId: novel.id,
      chapterNo, title: `隔离试写第${chapterNo}章`, wordTarget: 1800
    } }));
  }
  const trialNow = await repository.getAuthoritativeTaskTime();
  const trialQueued = await claimQueuedGeneration({
    action: 'trial_chapter_one_generate', repository,
    novel: (await repository.findById(context.tenantId, novel.id))!, context,
    idempotencyKey: `e1-trial-${suffix}`, effectiveRequest: { chapterCount: 3, regenerateReason: null },
    sourceVersionRefs: { currentDirectionVersionId: versions[0]!.id,
      currentSettingVersionId: null, currentOutlineVersionId: null,
      currentStageOutlineVersionId: null, currentChapterPlanVersionId: plan.id,
      objectType: 'trial_run' }, now: () => trialNow,
    durationDeadlineAt: new Date(trialNow.getTime() + 15 * 60_000),
    providerCapability: new MockTrialProvider()
  });
  const trialTask = await waitForTerminalTask(repository, context.tenantId, trialQueued.task.id);
  assert.equal(trialTask.status, TaskStatus.WaitingConfirmation);
  assert.equal(trialTask.providerCallBudgetUsed, 1);
  assert.ok(trialTask.resultReceiptHash);
  assert.equal(trialTask.resultObjectType, 'trial_run');
  const trialRun = await prisma.trialRun.findFirstOrThrow({ where: {
    tenantId: context.tenantId, novelId: novel.id, sourceTaskId: trialTask.id
  } });
  assert.equal(trialRun.id, trialTask.resultObjectId);
  assert.equal(trialRun.status, 'waiting_chapter1_selection');
  const trialVersions = await prisma.chapterContentVersion.findMany({ where: {
    tenantId: context.tenantId, novelId: novel.id, sourceTaskId: trialTask.id
  }, orderBy: { versionNo: 'asc' } });
  assert.equal(trialVersions.length, 3);
  assert.deepEqual(trialTask.resultVersionIds, trialVersions.map((version) => version.id));
  assert.ok(trialVersions.every((version) => version.status === 'CANDIDATE'
    && version.chapterId === chapters[0]!.id
    && (version.metadata as { trialRunId: string }).trialRunId === trialRun.id));
  assert.equal(trialVersions.filter((version) =>
    (version.metadata as { isAiRecommended: boolean }).isAiRecommended).length, 1);
  assert.equal((await repository.findById(context.tenantId, novel.id))?.creationStage, 'trial');
  const persistedChapters = await prisma.novelChapter.findMany({ where: {
    tenantId: context.tenantId, novelId: novel.id
  } });
  assert.equal(persistedChapters.length, chapters.length);
  assert.ok(persistedChapters.every((chapter) => chapter.currentContentVersionId === null));
  assert.equal((await repository.listTaskEvents(context.tenantId, trialTask.id))
    .filter((event) => event.eventType === 'task_finalized').length, 1);
  const reloaded = new IsolatedPrismaRepository();
  assert.equal((await reloaded.findLatestTrialRun(context.tenantId, novel.id))?.id, trialRun.id);
  assert.equal((await reloaded.findTaskById(context.tenantId, trialTask.id))?.resultReceiptHash,
    trialTask.resultReceiptHash);
  assert.equal((await reloaded.finalizeLeasedAction({
    tenantId: context.tenantId, taskId: trialTask.id,
    leaseOwnerId: 'stale-worker', leaseToken: 'stale-lease',
    authoritativeNow: await repository.getAuthoritativeTaskTime(),
    providerAttemptId: trialTask.providerAttemptId!, validatedResult: []
  })).outcome, 'fenced');
  assert.equal(await prisma.chapterContentVersion.count({ where: {
    tenantId: context.tenantId, novelId: novel.id, sourceTaskId: trialTask.id
  } }), 3);

  const validGenerateFollowup = trialProvider.generateFollowup.bind(trialProvider);
  trialProvider.generateFollowup = async (input) => {
    const result = await validGenerateFollowup(input);
    return { ...result, review: { ...result.review, summary: undefined as unknown as string } };
  };
  const invalidFollowupNow = await repository.getAuthoritativeTaskTime();
  const invalidFollowupQueued = await claimQueuedGeneration({
    action: 'trial_followup_generate', repository,
    novel: (await repository.findById(context.tenantId, novel.id))!,
    objectId: trialRun.id, context,
    idempotencyKey: `e1-invalid-followup-${suffix}`,
    effectiveRequest: { trialRunId: trialRun.id,
      selectedCandidateId: trialVersions[0]!.id },
    sourceVersionRefs: { currentDirectionVersionId: versions[0]!.id,
      currentSettingVersionId: null, currentOutlineVersionId: null,
      currentStageOutlineVersionId: null, currentChapterPlanVersionId: plan.id,
      selectedChapterOneCandidateId: trialVersions[0]!.id, objectType: 'trial_run' },
    now: () => invalidFollowupNow,
    durationDeadlineAt: new Date(invalidFollowupNow.getTime() + 15 * 60_000),
    providerCapability: trialProvider
  });
  const invalidFollowupTask = await waitForTerminalTask(repository, context.tenantId,
    invalidFollowupQueued.task.id);
  assert.equal(invalidFollowupTask.status, TaskStatus.Failed);
  assert.equal(invalidFollowupTask.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
  assert.equal(invalidFollowupTask.providerCallBudgetUsed, 1);
  assert.equal(await prisma.trialChapterResult.count({ where: {
    tenantId: context.tenantId, trialRunId: trialRun.id
  } }), 0);
  assert.equal(await prisma.reviewReport.count({ where: {
    tenantId: context.tenantId, novelId: novel.id, sourceTaskId: invalidFollowupTask.id
  } }), 0);
  assert.equal((await repository.findTrialRunById(context.tenantId, novel.id, trialRun.id))?.status,
    'waiting_chapter1_selection');
  assert.equal((await repository.findTaskById(context.tenantId, trialTask.id))?.status,
    TaskStatus.WaitingConfirmation);
  trialProvider.generateFollowup = validGenerateFollowup;

  const followupNow = await repository.getAuthoritativeTaskTime();
  const followupQueued = await claimQueuedGeneration({
    action: 'trial_followup_generate', repository,
    novel: (await repository.findById(context.tenantId, novel.id))!,
    objectId: trialRun.id, context,
    idempotencyKey: `e1-followup-${suffix}`,
    effectiveRequest: { trialRunId: trialRun.id,
      selectedCandidateId: trialVersions[0]!.id },
    sourceVersionRefs: { currentDirectionVersionId: versions[0]!.id,
      currentSettingVersionId: null, currentOutlineVersionId: null,
      currentStageOutlineVersionId: null, currentChapterPlanVersionId: plan.id,
      selectedChapterOneCandidateId: trialVersions[0]!.id, objectType: 'trial_run' },
    now: () => followupNow,
    durationDeadlineAt: new Date(followupNow.getTime() + 15 * 60_000),
    providerCapability: new MockTrialProvider()
  });
  assert.equal(followupQueued.task.modelRoutingVersion, 'provider:MockTrialProvider:v1');
  const followupTask = await waitForTerminalTask(repository, context.tenantId, followupQueued.task.id);
  assert.equal(followupTask.status, TaskStatus.WaitingConfirmation,
    `Followup failed: ${followupTask.errorCode ?? 'none'} ${followupTask.statusNote ?? ''}; budget=${followupTask.providerCallBudgetUsed}; phase=${followupTask.providerAttemptPhase}`);
  assert.equal(followupTask.providerCallBudgetUsed, 1);
  assert.ok(followupTask.resultReceiptHash);
  assert.deepEqual(followupTask.resultVersionIds[0], trialVersions[0]!.id);
  const completedRun = await prisma.trialRun.findFirstOrThrow({ where: {
    tenantId: context.tenantId, id: trialRun.id
  } });
  assert.equal(completedRun.status, 'review_ready');
  assert.equal(completedRun.sourceTaskId, followupTask.id);
  assert.ok(completedRun.reviewReportId);
  const chapterResults = await prisma.trialChapterResult.findMany({ where: {
    tenantId: context.tenantId, trialRunId: trialRun.id
  } });
  assert.equal(chapterResults.length, 3);
  assert.equal(await prisma.chapterFeatureCard.count({ where: {
    tenantId: context.tenantId, novelId: novel.id, sourceTaskId: followupTask.id
  } }), 3);
  assert.equal(await prisma.reviewReport.count({ where: {
    tenantId: context.tenantId, novelId: novel.id, sourceTaskId: followupTask.id
  } }), 4);
  assert.equal((await repository.findTaskById(context.tenantId, trialTask.id))?.status, TaskStatus.Completed);
  const writtenChapters = await prisma.novelChapter.findMany({ where: {
    tenantId: context.tenantId, novelId: novel.id
  }, orderBy: { chapterNo: 'asc' } });
  assert.equal(writtenChapters.length, 3);
  assert.ok(writtenChapters.every((chapter) => !chapter.currentContentVersionId
    && !chapter.currentFeatureCardVersionId && !chapter.currentReviewReportId));
  const candidateContents = await prisma.chapterContentVersion.findMany({ where: {
    tenantId: context.tenantId, novelId: novel.id, id: { in: followupTask.resultVersionIds }
  } });
  assert.equal(candidateContents.length, 3);
  assert.ok(candidateContents.every((content) => content.status === 'CANDIDATE'));
  const candidateCards = await prisma.chapterFeatureCard.findMany({ where: {
    tenantId: context.tenantId, novelId: novel.id, sourceTaskId: followupTask.id
  } });
  assert.equal(candidateCards.length, 3);
  assert.ok(candidateCards.every((card) => card.status === 'CANDIDATE'));
  assert.equal((await repository.listTaskEvents(context.tenantId, followupTask.id))
    .filter((event) => event.eventType === 'task_finalized').length, 1);
  assert.equal((await new IsolatedPrismaRepository().findTrialRunById(
    context.tenantId, novel.id, trialRun.id))?.reviewReportId, completedRun.reviewReportId);

  const confirmed = await service.confirmTrial(novel.id, {
    trialRunId: trialRun.id, decision: 'confirm_pass'
  }, context);
  assert.equal(confirmed.trialRun.status, 'confirmed');
  const confirmedChapters = await prisma.novelChapter.findMany({ where: {
    tenantId: context.tenantId, novelId: novel.id
  }, orderBy: { chapterNo: 'asc' } });
  assert.deepEqual(confirmedChapters.map((chapter) => chapter.currentContentVersionId),
    followupTask.resultVersionIds);
  assert.ok(confirmedChapters.every((chapter) => chapter.currentFeatureCardVersionId
    && chapter.currentReviewReportId));
  assert.equal(await prisma.chapterContentVersion.count({ where: {
    tenantId: context.tenantId, novelId: novel.id,
    id: { in: followupTask.resultVersionIds }, status: 'CURRENT'
  } }), 3);
  assert.equal(await prisma.chapterFeatureCard.count({ where: {
    tenantId: context.tenantId, novelId: novel.id,
    sourceTaskId: followupTask.id, status: 'CURRENT'
  } }), 3);

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
  const malformedTrialNow = await repository.getAuthoritativeTaskTime();
  const malformedTrialQueued = await claimQueuedGeneration({
    action: 'trial_chapter_one_generate', repository,
    novel: (await repository.findById(context.tenantId, novel.id))!, context,
    idempotencyKey: `e1-invalid-trial-${suffix}`,
    effectiveRequest: { chapterCount: 3, regenerateReason: null },
    sourceVersionRefs: { currentDirectionVersionId: versions[0]!.id,
      currentSettingVersionId: null, currentOutlineVersionId: null,
      currentStageOutlineVersionId: null, currentChapterPlanVersionId: plan.id,
      objectType: 'trial_run' }, now: () => malformedTrialNow,
    durationDeadlineAt: new Date(malformedTrialNow.getTime() + 15 * 60_000),
    providerCapability: new MockTrialProvider()
  });
  const malformedTrialLease = {
    tenantId: context.tenantId, taskId: malformedTrialQueued.task.id,
    leaseOwnerId: `e1-invalid-trial-${suffix}`, leaseToken: randomUUID()
  };
  const trialLeased = await repository.leaseNextQueuedTask(malformedTrialLease.leaseOwnerId,
    malformedTrialLease.leaseToken, malformedTrialNow, new Date(malformedTrialNow.getTime() + 10_000));
  assert.equal(trialLeased?.id, malformedTrialQueued.task.id);
  const malformedTrialInput = (await reconstructLeasedProviderInput(repository, trialLeased!))
    .providerInput as NovelProviderActionInputFor<'trial_chapter_one_generate'>;
  const malformedTrialCandidates = await new MockTrialProvider().generateChapterOneCandidates(malformedTrialInput);
  malformedTrialCandidates[0] = { ...malformedTrialCandidates[0]!, content: '过短正文' };
  assert.equal((await repository.checkpointLeasedTask({ ...malformedTrialLease,
    authoritativeNow: await repository.getAuthoritativeTaskTime(),
    checkpoint: { expectedPhase: 'leased', nextPhase: 'prepared' }
  })).outcome, 'applied');
  const malformedTrialAttemptId = randomUUID();
  assert.equal((await repository.dispatchLeasedTask({ ...malformedTrialLease,
    authoritativeNow: await repository.getAuthoritativeTaskTime(), providerAttemptId: malformedTrialAttemptId
  })).outcome, 'applied');
  assert.equal((await repository.checkpointLeasedTask({ ...malformedTrialLease,
    authoritativeNow: await repository.getAuthoritativeTaskTime(),
    checkpoint: { expectedPhase: 'provider_call_started', nextPhase: 'provider_result_validated',
      providerAttemptId: malformedTrialAttemptId }
  })).outcome, 'applied');
  assert.equal((await repository.finalizeLeasedAction({ ...malformedTrialLease,
    authoritativeNow: await repository.getAuthoritativeTaskTime(),
    providerAttemptId: malformedTrialAttemptId, validatedResult: malformedTrialCandidates
  })).outcome, 'applied');
  const malformedTrialTask = await repository.findTaskById(context.tenantId, malformedTrialQueued.task.id);
  assert.equal(malformedTrialTask?.status, TaskStatus.Failed);
  assert.equal(malformedTrialTask?.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
  assert.equal(malformedTrialTask?.providerCallBudgetUsed, 1);
  assert.equal(await prisma.trialRun.count({ where: {
    tenantId: context.tenantId, novelId: novel.id, sourceTaskId: malformedTrialQueued.task.id
  } }), 0);
  assert.equal(await prisma.chapterContentVersion.count({ where: {
    tenantId: context.tenantId, novelId: novel.id, sourceTaskId: malformedTrialQueued.task.id
  } }), 0);
  assert.equal((await repository.listTaskEvents(context.tenantId, malformedTrialQueued.task.id))
    .filter((event) => event.eventType === 'task_failed').length, 1);
  process.stdout.write(JSON.stringify({ result: 'passed', taskId: task.id, status: task.status,
    candidateCount: versions.length, providerCallBudgetUsed: task.providerCallBudgetUsed,
    fuseTaskId: fuseTask.id, optimizeTaskId: optimizeTask.id,
    revisionCandidateCount: fusedVersions.length + optimizedVersions.length,
    trialTaskId: trialTask.id, trialCandidateCount: trialVersions.length,
    followupTaskId: followupTask.id, followupChapterCount: chapterResults.length,
    malformedFollowupStatus: invalidFollowupTask.status,
    malformedResultStatus: invalidTask?.status,
    malformedTrialResultStatus: malformedTrialTask?.status }) + '\n');
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
