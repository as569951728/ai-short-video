import assert from 'node:assert/strict';
import { disconnectPrismaClient, getPrismaClient } from '../../apps/api/src/infrastructure/database/prisma.js';

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl ? new URL(databaseUrl) : null;
const novelId = process.env.NOVEL_SMOKE_NOVEL_ID;
if (!database || !['127.0.0.1', 'localhost'].includes(database.hostname)
  || database.pathname !== '/ai_shortvideo_novel_test'
  || process.env.AI_PROVIDER_MODE !== 'mock'
  || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY
  || !novelId || !/^[a-zA-Z0-9_-]{8,80}$/.test(novelId)) {
  throw new Error('Readback requires a local isolated novel test database, mock provider, and sample novel ID.');
}

const prisma = getPrismaClient();
try {
  const tenantId = 'tenant_novel_prisma_smoke';
  const chapter = await prisma.novelChapter.findFirstOrThrow({ where: { tenantId, novelId, chapterNo: 5 } });
  const candidates = await prisma.chapterContentVersion.findMany({
    where: { tenantId, novelId, chapterId: chapter.id }, orderBy: { versionNo: 'asc' }
  });
  const task = await prisma.generationTask.findFirstOrThrow({
    where: { tenantId, novelId, taskType: 'body_batch_generate', resultObjectType: 'body_batch' }
  });
  assert.equal(task.status, 'WAITING_CONFIRMATION');
  assert.equal(chapter.currentContentVersionId, null);
  assert.equal(chapter.currentFeatureCardVersionId, null);
  assert.equal(chapter.currentReviewReportId, null);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].status, 'CANDIDATE');
  assert.equal(candidates[0].sourceType, 'ai_overlength_original');
  assert.equal(candidates[0].sourceTaskId, task.id);
  assert.equal(candidates[0].wordCount > (chapter.wordTarget ?? 0) * 1.15, true);
  assert.equal(await prisma.novelChapter.count({ where: { tenantId, novelId,
    chapterNo: { gte: 6 }, currentContentVersionId: { not: null } } }), 0);
  console.log(JSON.stringify({ result: 'PASS', scenario: 'prisma_overlength_independent_process_readback',
    novelId, candidateId: candidates[0].id, taskStatus: 'waiting_confirmation' }));
} finally {
  await disconnectPrismaClient();
}
