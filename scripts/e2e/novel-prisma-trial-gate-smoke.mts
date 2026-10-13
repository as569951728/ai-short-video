import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../apps/api/src/app.js';
import { disconnectPrismaClient, getPrismaClient } from '../../apps/api/src/infrastructure/database/prisma.js';
import { MockBodyProvider } from '../../apps/api/src/modules/novels/providers/mockBodyProvider.js';

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl ? new URL(databaseUrl) : null;
if (
  !database
  || !['127.0.0.1', 'localhost'].includes(database.hostname)
  || database.pathname !== '/ai_shortvideo_novel_test'
  || process.env.AI_PROVIDER_MODE !== 'mock'
  || process.env.DEEPSEEK_API_KEY
  || process.env.OPENAI_API_KEY
) {
  throw new Error('This smoke requires the local ai_shortvideo_novel_test database and mock provider only.');
}

const overlengthScenario = process.env.NOVEL_SMOKE_OVERLENGTH === 'true';
const cancelLateScenario = process.env.NOVEL_SMOKE_CANCEL_LATE === 'true';
if (overlengthScenario && cancelLateScenario) throw new Error('Choose one body smoke scenario.');
class OverlengthBodyProvider extends MockBodyProvider {
  async generateBodyChapter(input: Parameters<MockBodyProvider['generateBodyChapter']>[0]) {
    const draft = await super.generateBodyChapter(input);
    return input.chapter.chapterNo === 5
      ? { ...draft, content: '长'.repeat((input.chapter.wordTarget ?? 2000) * 2), summary: '超长原稿摘要' }
      : draft;
  }
}
class DelayedOverlengthBodyProvider extends OverlengthBodyProvider {
  private startedResolve: (() => void) | null = null;
  private releaseResolve: (() => void) | null = null;
  readonly started = new Promise<void>((resolve) => { this.startedResolve = resolve; });

  release() { this.releaseResolve?.(); }

  async generateBodyChapter(input: Parameters<MockBodyProvider['generateBodyChapter']>[0]) {
    if (input.chapter.chapterNo === 4) {
      this.startedResolve?.();
      await new Promise<void>((resolve) => { this.releaseResolve = resolve; });
      const draft = await super.generateBodyChapter(input);
      return { ...draft, content: '长'.repeat((input.chapter.wordTarget ?? 2000) * 2) };
    }
    return super.generateBodyChapter(input);
  }
}
const delayedBodyProvider = cancelLateScenario ? new DelayedOverlengthBodyProvider() : null;

const appOptions = {
  logger: false,
  bodyProvider: delayedBodyProvider ?? (overlengthScenario ? new OverlengthBodyProvider() : undefined),
  requestContextResolver: async (request) => ({
    tenantId: 'tenant_novel_prisma_smoke',
    userId: 'user_novel_prisma_smoke',
    requestId: request.id
  })
} satisfies Parameters<typeof buildApp>[0];
let app = await buildApp(appOptions);

async function post(path: string, payload: Record<string, unknown>) {
  const response = await app.inject({ method: 'POST', url: path, payload });
  const error = response.json().error;
  assert.equal(response.statusCode >= 200 && response.statusCode < 300, true,
    `${path}: HTTP ${response.statusCode}, code ${error?.code ?? 'unknown'}, message ${String(error?.message ?? '').slice(0, 160)}`);
  return response.json().data;
}

try {
  const draft = await post('/novels/drafts', {
    title: `SMOKE-都市重生-试写正式化-${randomUUID().slice(0, 8)}`,
    genres: ['都市逆袭'],
    chapterLimit: 8,
    chapterWordRange: { min: 1800, max: 2600 },
    preferences: { appealPoints: ['低谷翻盘'], targetAudience: '18-35 岁读者' }
  });
  const novelId: string = draft.id;
  const direction = await post(`/novels/${novelId}/directions/generate`, {});
  const selectedDirection = direction.candidates.find((candidate: { score: number }) => candidate.score >= 75);
  assert.ok(selectedDirection);
  await post(`/novels/${novelId}/directions/${selectedDirection.id}/adopt`, {
    currentVersionId: null,
    reason: '隔离库试写正式化 smoke',
    idempotencyKey: `smoke-direction-${novelId}`
  });

  for (const resource of ['settings', 'outlines', 'stage-outlines', 'chapter-plans']) {
    const generated = await post(`/novels/${novelId}/${resource}/generate`, {});
    await post(`/novels/${novelId}/${resource}/${generated.candidate.id}/adopt`, {
      reason: '隔离库试写正式化 smoke'
    });
  }

  const first = await post(`/novels/${novelId}/trial/generate`, {});
  const selected = first.trialRun.chapterOneCandidates.find((candidate: { isAiRecommended: boolean }) => candidate.isAiRecommended);
  assert.ok(selected);
  const followup = await post(`/novels/${novelId}/trial/generate`, {
    trialRunId: first.trialRun.id,
    selectedCandidateId: selected.id
  });
  const confirmed = await post(`/novels/${novelId}/trial/confirm`, {
    trialRunId: followup.trialRun.id,
    decision: 'confirm_pass'
  });

  const prisma = getPrismaClient();
  const trialChapters = await prisma.novelChapter.findMany({
    where: { tenantId: 'tenant_novel_prisma_smoke', novelId, chapterNo: { lte: 3 } },
    orderBy: { chapterNo: 'asc' },
    select: { chapterNo: true, mainStatus: true, currentContentVersionId: true }
  });
  assert.equal(trialChapters.length, 3);
  for (const chapter of trialChapters) {
    assert.equal(chapter.mainStatus, 'completed');
    assert.ok(chapter.currentContentVersionId);
  }

  const bodyRequest = {
    strategySnapshotId: confirmed.bodyStrategySnapshot.id,
    expectedStrategySnapshotVersion: confirmed.bodyStrategySnapshot.versionNo,
    idempotencyKey: `smoke-body-${novelId}`
  };
  if (cancelLateScenario) {
    const pending = app.inject({ method: 'POST', url: `/novels/${novelId}/chapters/batch-generate`, payload: bodyRequest });
    let startTimeout: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([delayedBodyProvider!.started, new Promise<never>((_, reject) => {
        startTimeout = setTimeout(() => reject(new Error('Body provider did not start.')), 10_000);
      })]);
      const task = await prisma.generationTask.findFirstOrThrow({ where: {
        tenantId: 'tenant_novel_prisma_smoke', novelId, taskType: 'body_batch_generate', status: 'PROCESSING'
      } });
      const during = await app.inject({ method: 'GET', url: `/tasks/${task.id}` });
      assert.equal(during.statusCode, 200, during.body);
      assert.equal(during.json().data.status, 'processing');
      await post(`/tasks/${task.id}/cancel`, { reason: '隔离库迟到结果测试' });
      delayedBodyProvider!.release();
      const late = await pending;
      assert.equal(late.statusCode, 409, late.body);
      const bodyChapters = await prisma.novelChapter.findMany({ where: { tenantId: 'tenant_novel_prisma_smoke', novelId,
        chapterNo: { gte: 4 } }, select: { id: true } });
      assert.equal(await prisma.chapterContentVersion.count({ where: { tenantId: 'tenant_novel_prisma_smoke', novelId,
        chapterId: { in: bodyChapters.map((chapter) => chapter.id) } } }), 0);
      assert.equal(await prisma.novelChapter.count({ where: { tenantId: 'tenant_novel_prisma_smoke', novelId,
        chapterNo: { gte: 4 }, currentContentVersionId: { not: null } } }), 0);
      const cancelledTask = await prisma.generationTask.findFirstOrThrow({ where: { id: task.id } });
      assert.equal(cancelledTask.status, 'CANCELLED');
      console.log(JSON.stringify({ result: 'PASS', scenario: 'prisma_cancelled_late_body_result', novelId, taskId: task.id }));
    } finally {
      if (startTimeout) clearTimeout(startTimeout);
      delayedBodyProvider!.release();
    }
  } else {
  const body = await post(`/novels/${novelId}/chapters/batch-generate`, bodyRequest);
  if (overlengthScenario) {
    assert.equal(body.batch.status, 'paused');
    assert.equal(body.task.status, 'waiting_confirmation');
    assert.deepEqual(body.batch.chapterResults.map((result: { chapterNo: number }) => result.chapterNo), [4, 5]);
    const overlongChapter = await prisma.novelChapter.findFirstOrThrow({
      where: { tenantId: 'tenant_novel_prisma_smoke', novelId, chapterNo: 5 }
    });
    assert.equal(overlongChapter.currentContentVersionId, null);
    assert.equal(overlongChapter.currentFeatureCardVersionId, null);
    assert.equal(overlongChapter.currentReviewReportId, null);
    const candidate = await prisma.chapterContentVersion.findFirstOrThrow({
      where: { tenantId: 'tenant_novel_prisma_smoke', novelId, chapterId: overlongChapter.id }
    });
    assert.equal(candidate.status, 'CANDIDATE');
    assert.equal(candidate.sourceType, 'ai_overlength_original');
    assert.equal(candidate.wordCount > (overlongChapter.wordTarget ?? 0) * 1.15, true);
    assert.equal(await prisma.novelChapter.count({ where: { tenantId: 'tenant_novel_prisma_smoke', novelId,
      chapterNo: { gte: 6 }, currentContentVersionId: { not: null } } }), 0);
    const replay = await post(`/novels/${novelId}/chapters/batch-generate`, bodyRequest);
    assert.equal(replay.batch.id, body.batch.id);
    assert.equal(await prisma.chapterContentVersion.count({ where: { tenantId: 'tenant_novel_prisma_smoke', novelId, chapterId: overlongChapter.id } }), 1);
    await app.close();
    await disconnectPrismaClient();
    app = await buildApp(appOptions);
    const reread = await app.inject({ method: 'GET', url: `/novels/${novelId}/chapters/${overlongChapter.id}` });
    assert.equal(reread.statusCode, 200, reread.body);
    assert.equal(reread.json().data.candidateVersions.find((version: { id: string }) => version.id === candidate.id).requiresContentReview, true);
    assert.equal(reread.json().data.chapter.currentContentVersionId, null);
    console.log(JSON.stringify({ result: 'PASS', scenario: 'prisma_overlength_candidate_recovery', novelId,
      retainedOriginal: candidate.id, pausedAtChapter: 5, replayedBatch: true, reopenedClient: true }));
  } else {
  assert.equal(body.batch.status, 'completed');
  assert.equal(body.batch.completedCount, 5);
  assert.deepEqual(body.batch.chapterResults.map((result: { chapterNo: number }) => result.chapterNo), [4, 5, 6, 7, 8]);
  const formalChapters = await prisma.novelChapter.findMany({
    where: { tenantId: 'tenant_novel_prisma_smoke', novelId, chapterNo: { gte: 4 } },
    orderBy: { chapterNo: 'asc' },
    select: { chapterNo: true, currentContentVersionId: true, currentFeatureCardVersionId: true, currentReviewReportId: true }
  });
  assert.equal(formalChapters.length, 5);
  for (const chapter of formalChapters) {
    assert.ok(chapter.currentContentVersionId);
    assert.ok(chapter.currentFeatureCardVersionId);
    assert.ok(chapter.currentReviewReportId);
    assert.equal(await prisma.longTermMemory.count({
      where: { tenantId: 'tenant_novel_prisma_smoke', novelId, sourceContentVersionId: chapter.currentContentVersionId, status: 'CURRENT' }
    }), 1);
  }
  const replay = await post(`/novels/${novelId}/chapters/batch-generate`, bodyRequest);
  assert.equal(replay.batch.id, body.batch.id);
  assert.equal(await prisma.generationTask.count({
    where: { tenantId: 'tenant_novel_prisma_smoke', novelId, taskType: 'body_batch_generate' }
  }), 1);
  console.log(JSON.stringify({ result: 'PASS', scenario: 'prisma_trial_and_body_persistence', novelId, trialChapters: 3, bodyChapters: 5, replayedBatch: true }));
  }
  }
} finally {
  await app.close();
  await disconnectPrismaClient();
}
