import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
if (!url || process.env.DATABASE_URL !== url || process.env.AI_PROVIDER_MODE !== 'mock') {
  throw new Error('Set matching E1_MYSQL_SMOKE_URL and DATABASE_URL with AI_PROVIDER_MODE=mock.');
}
const target = new URL(url);
if (target.protocol !== 'mysql:' || !['127.0.0.1', 'localhost'].includes(target.hostname)
  || !/^\/ai_shortvideo_e1_[a-z0-9_]+$/.test(target.pathname)
  || !target.port || target.port === '3306' || target.search || target.hash
  || !target.username || !target.password) {
  throw new Error('E1 adoption smoke requires a dedicated loopback schema and non-default port.');
}

class IsolatedPrismaRepository extends PrismaNovelRepository {
  override async getLeasedExecutionCapability(taskType: string) {
    return taskType === 'chapter_impact_assess' ? 'enabled' as const
      : super.getLeasedExecutionCapability(taskType);
  }
}

const repository = new IsolatedPrismaRepository();
const prisma = getPrismaClient();
const suffix = randomUUID();
const context = { tenantId: `tenant-e1-${suffix.slice(0, 8)}`,
  userId: `user-e1-${suffix.slice(0, 8)}`, requestId: `req-e1-${suffix}` };

try {
  const { novel } = await repository.createDraft({
    request: { title: 'E1 adopt impact smoke' }, context, now: new Date()
  });
  const chapter = await prisma.novelChapter.create({ data: {
    tenantId: context.tenantId, novelId: novel.id, chapterNo: 4,
    title: '隔离章节', wordTarget: 1800, mainStatus: 'completed', wordCount: 1800
  } });
  await prisma.novel.update({ where: { id: novel.id }, data: {
    creationStage: 'BODY', stageStatus: 'NOT_STARTED'
  } });
  const formal = await prisma.chapterContentVersion.create({ data: {
    tenantId: context.tenantId, novelId: novel.id, chapterId: chapter.id,
    versionNo: 1, status: 'CURRENT', sourceType: 'manual', sourceVersionRefs: {},
    content: '甲'.repeat(1800), wordCount: 1800,
    summary: '主角找到旧码头线索。', reviewScore: 80, createdBy: context.userId
  } });
  const candidate = await prisma.chapterContentVersion.create({ data: {
    tenantId: context.tenantId, novelId: novel.id, chapterId: chapter.id,
    versionNo: 2, status: 'CANDIDATE', sourceType: 'manual', sourceVersionRefs: {},
    rewriteReason: '旧码头线索影响后续章节',
    content: '乙'.repeat(1800), wordCount: 1800,
    summary: '主角利用新线索反击。', reviewScore: 85, createdBy: context.userId,
    metadata: { summaryCompare: {
      currentSummary: '主角找到旧码头线索。', candidateSummary: '主角利用新线索反击。',
      benefit: '冲突更清晰', newRisks: ['后续线索可能不一致'],
      possibleImpact: '第五章需核对', aiSuggestion: '先核对后续承接'
    } }
  } });
  await prisma.novelChapter.update({ where: { id: chapter.id }, data: {
    currentContentVersionId: formal.id
  } });
  const now = await repository.getAuthoritativeTaskTime();
  const queued = await claimQueuedGeneration({
    action: 'chapter_adopt_impact_assess', repository,
    novel: (await repository.findById(context.tenantId, novel.id))!, objectId: chapter.id,
    context, idempotencyKey: `adopt:${candidate.id}`,
    effectiveRequest: { currentContentVersionId: formal.id, candidateVersionId: candidate.id,
      reason: '旧码头线索调整会影响后续章节',
      pageVersionSnapshot: { currentContentVersionId: formal.id, seenCandidateVersionId: candidate.id } },
    sourceVersionRefs: { currentContentVersionId: formal.id, candidateVersionId: candidate.id },
    now: () => now, durationDeadlineAt: new Date(now.getTime() + 15 * 60_000),
    providerCapability: new MockBodyProvider()
  });
  assert.equal(queued.task.status, TaskStatus.Queued);
  const worker = new NovelTaskWorkerRuntime({
    repository, clock: { now: () => repository.getAuthoritativeTaskTime() },
    scheduler: createSystemNovelTaskWorkerScheduler(), workerId: `e1-adopt-${suffix}`,
    policy: { workerConcurrency: 1, leaseDurationMs: 10_000, heartbeatIntervalMs: 1000,
      pollIntervalMs: 100, shutdownGracePeriodMs: 1000 },
    ...createLeasedActionExecutor({ repository, providers: {
      directionProvider: new MockDirectionProvider(), structureProvider: new MockStructureProvider(),
      trialProvider: new MockTrialProvider(), bodyProvider: new MockBodyProvider(),
      fullReviewProvider: new MockFullReviewProvider()
    } })
  });
  try {
    worker.start();
    let task = queued.task;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const current = await repository.findTaskById(context.tenantId, task.id);
      if (!current) throw new Error('Queued task disappeared.');
      task = current;
      if (![TaskStatus.Queued, TaskStatus.Processing].includes(task.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(task.status, TaskStatus.Completed);
    assert.equal(task.providerCallBudgetUsed, 1);
    assert.ok(task.resultReceiptHash);
    assert.deepEqual(task.resultVersionIds, [candidate.id]);
    const decisions = await prisma.assetDecisionRecord.findMany({ where: {
      tenantId: context.tenantId, novelId: novel.id, sourceTaskId: task.id
    } });
    const cases = await prisma.impactCase.findMany({ where: {
      tenantId: context.tenantId, novelId: novel.id, sourceTaskId: task.id
    } });
    assert.equal(decisions.length, 1);
    assert.equal(cases.length, 1);
    assert.equal(decisions[0]?.candidateVersionId, candidate.id);
    assert.equal(cases[0]?.decisionRecordId, decisions[0]?.id);
    assert.equal(cases[0]?.sourceOldVersionId, formal.id);
    assert.equal(cases[0]?.sourceNewVersionId, candidate.id);
    assert.equal(cases[0]?.status, 'waiting_decision');
    assert.equal((await prisma.novelChapter.findUniqueOrThrow({ where: { id: chapter.id } })).currentContentVersionId, candidate.id);
    assert.equal((await prisma.chapterContentVersion.findUniqueOrThrow({ where: { id: formal.id } })).status, 'HISTORICAL');
    assert.equal((await prisma.chapterContentVersion.findUniqueOrThrow({ where: { id: candidate.id } })).status, 'CURRENT');
    assert.equal((await prisma.novel.findUniqueOrThrow({ where: { id: novel.id } })).stageStatus, 'BLOCKED');
    assert.equal((await repository.listTaskEvents(context.tenantId, task.id))
      .filter((event) => event.eventType === 'task_finalized').length, 1);
    assert.equal((await prisma.operationLog.findMany({ where: {
      tenantId: context.tenantId, novelId: novel.id, sourceTaskId: task.id
    } })).filter((log) => ['adopt_chapter_content', 'generation_task_finalized'].includes(log.action)).length, 2);
    assert.equal((await repository.finalizeLeasedAction({
      tenantId: context.tenantId, taskId: task.id, leaseOwnerId: 'late-worker',
      leaseToken: 'late-lease', providerAttemptId: task.providerAttemptId!,
      authoritativeNow: await repository.getAuthoritativeTaskTime(), validatedResult: null
    })).outcome, 'fenced');
    assert.equal(await prisma.impactCase.count({ where: {
      tenantId: context.tenantId, novelId: novel.id, sourceTaskId: task.id
    } }), 1);
    process.stdout.write(JSON.stringify({ result: 'passed', taskId: task.id, status: task.status,
      providerCallBudgetUsed: task.providerCallBudgetUsed, decisionCount: decisions.length,
      impactCaseCount: cases.length, currentVersionId: candidate.id }) + '\n');
  } finally {
    await worker.stop();
  }
} finally {
  await disconnectPrismaClient();
}
