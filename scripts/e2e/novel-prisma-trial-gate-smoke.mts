import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../apps/api/src/app.js';
import { disconnectPrismaClient, getPrismaClient } from '../../apps/api/src/infrastructure/database/prisma.js';

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

const app = await buildApp({
  logger: false,
  requestContextResolver: async (request) => ({
    tenantId: 'tenant_novel_prisma_smoke',
    userId: 'user_novel_prisma_smoke',
    requestId: request.id
  })
});

async function post(path: string, payload: Record<string, unknown>) {
  const response = await app.inject({ method: 'POST', url: path, payload });
  assert.equal(response.statusCode >= 200 && response.statusCode < 300, true, `${path}: ${response.body}`);
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

  const body = await app.inject({
    method: 'POST',
    url: `/novels/${novelId}/chapters/batch-generate`,
    payload: {
      strategySnapshotId: confirmed.bodyStrategySnapshot.id,
      expectedStrategySnapshotVersion: confirmed.bodyStrategySnapshot.versionNo,
      idempotencyKey: `smoke-body-${novelId}`
    }
  });
  assert.equal(body.statusCode, 500);
  assert.equal(body.json().error?.code, 'CONFIG_MISSING');
  assert.equal(await prisma.generationTask.count({
    where: { tenantId: 'tenant_novel_prisma_smoke', novelId, taskType: 'body_batch_generate' }
  }), 0);
  console.log(JSON.stringify({ result: 'PASS', scenario: 'prisma_trial_promotion_and_body_capability_gate', novelId, trialChapters: 3, bodyGate: 'CONFIG_MISSING', bodyTasksCreated: 0 }));
} finally {
  await app.close();
  await disconnectPrismaClient();
}
