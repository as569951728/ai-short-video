import { randomUUID } from 'node:crypto';
import { resolveIsolatedNovelAsyncEnabled } from '../../src/config/isolatedNovelAsyncPolicy.js';
import { buildApp } from '../../src/app.js';
import { disconnectPrismaClient, getPrismaClient } from '../../src/infrastructure/database/prisma.js';
import { evaluateChapterLength } from '../../src/modules/novels/domain/chapterLengthPolicy.js';
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
import { createNovelRecoveryLoop } from '../../src/modules/novels/services/recoveryScanner.js';

const url = process.env.E1_MYSQL_SMOKE_URL;
if (!url || process.env.DATABASE_URL !== url || process.env.NODE_ENV !== 'development'
  || process.env.AI_PROVIDER_MODE !== 'mock' || process.env.E1_BROWSER_SMOKE !== 'true') {
  throw new Error('E1 browser MySQL smoke requires explicit development/mock test configuration.');
}
resolveIsolatedNovelAsyncEnabled({ flag: 'true', runtimeEnvironment: process.env.NODE_ENV,
  providerMode: process.env.AI_PROVIDER_MODE, databaseUrl: process.env.DATABASE_URL, smokeUrl: url });
const delayMs = Number(process.env.E1_BROWSER_MODEL_DELAY_MS);
const port = Number(process.env.PORT);
const browserAction = process.env.E1_BROWSER_ACTION ?? 'direction';
if (!Number.isSafeInteger(delayMs) || delayMs < 120_000 || delayMs > 300_000
  || !Number.isSafeInteger(port) || port < 1024 || port > 65535
  || !['direction', 'directionEdit', 'trial', 'fullReview', 'overlength', 'chapterActions'].includes(browserAction)) {
  throw new Error('Set a 2-5 minute delay and an explicit unprivileged port.');
}

class IsolatedPrismaRepository extends PrismaNovelRepository {
  constructor() {
    super({ enabledLeasedTaskTypes: new Set(browserAction === 'direction' ? ['novel_direction_generate']
      : browserAction === 'directionEdit' ? ['novel_direction_fuse', 'novel_direction_optimize']
      : browserAction === 'trial' ? ['trial_writing_generate', 'trial_followup_generate']
      : browserAction === 'overlength' ? ['chapter_overlength_revise']
      : browserAction === 'chapterActions' ? ['chapter_body_rewrite', 'chapter_impact_assess']
        : ['novel_full_review']) });
  }

  override async getAuthoritativeTaskTime() {
    try {
      return await super.getAuthoritativeTaskTime();
    } catch (error) {
      process.stderr.write(`E1 browser MySQL clock failed: ${errorCode(error)}\n`);
      throw error;
    }
  }

  override async leaseNextQueuedTask(workerId: string, leaseToken: string, now: Date, leaseUntil: Date) {
    try {
      return await super.leaseNextQueuedTask(workerId, leaseToken, now, leaseUntil);
    } catch (error) {
      process.stderr.write(`E1 browser MySQL lease failed: ${errorCode(error)}\n`);
      throw error;
    }
  }
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code;
  return error instanceof Error ? error.name : 'UNKNOWN';
}

const repository = new IsolatedPrismaRepository();
let asyncEnabled = !['trial', 'directionEdit'].includes(browserAction);
const enabledActions = browserAction === 'direction' ? ['direction_generate'] as const
  : browserAction === 'directionEdit' ? ['direction_fuse', 'direction_optimize'] as const
  : browserAction === 'trial' ? ['trial_chapter_one_generate', 'trial_followup_generate'] as const
  : browserAction === 'overlength' ? ['chapter_overlength_revise'] as const
  : browserAction === 'chapterActions' ? ['chapter_rewrite', 'chapter_impact_assess', 'chapter_adopt_impact_assess'] as const
    : ['novel_full_review'] as const;
const bodyProvider = new MockBodyProvider();
if (browserAction === 'chapterActions') {
  const calls = new Map<string, number>();
  const delayed = async <T>(action: string, generate: () => Promise<T>): Promise<T> => {
    const call = (calls.get(action) ?? 0) + 1;
    calls.set(action, call);
    process.stdout.write(`E1_CHAPTER_MOCK_STARTED=${JSON.stringify({ action, call, at: new Date().toISOString() })}\n`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    const result = await generate();
    process.stdout.write(`E1_CHAPTER_MOCK_FINISHED=${JSON.stringify({ action, call, at: new Date().toISOString() })}\n`);
    return result;
  };
  const rewrite = bodyProvider.rewriteChapter.bind(bodyProvider);
  bodyProvider.rewriteChapter = (input) => delayed(input.action, () => rewrite(input));
  const assess = bodyProvider.assessImpact.bind(bodyProvider);
  bodyProvider.assessImpact = (input) => delayed(input.action, () => assess(input));
}
if (browserAction === 'chapterActions') {
  await repository.getAuthoritativeTaskTime();
  const prisma = getPrismaClient();
  const actor = { tenantId: 'e1_browser_mysql_tenant', userId: 'e1_browser_mysql_user',
    requestId: `e1-browser-chapter-actions-${randomUUID()}` };
  const { novel } = await repository.createDraft({ request: { title: 'E1 章节重写评估采用贯通验收' },
    context: actor, now: new Date() });
  const scope = { tenantId: actor.tenantId, novelId: novel.id };
  const chapter = await prisma.novelChapter.create({ data: { ...scope,
    chapterNo: 4, title: '正式正文与重写候选', wordTarget: 1800, mainStatus: 'completed', wordCount: 1800
  } });
  await prisma.novel.update({ where: { id: novel.id }, data: { creationStage: 'BODY', stageStatus: 'NOT_STARTED' } });
  const formal = await prisma.chapterContentVersion.create({ data: { ...scope,
    chapterId: chapter.id, versionNo: 1, status: 'CURRENT', sourceType: 'manual', sourceVersionRefs: {},
    content: '甲'.repeat(1800), wordCount: 1800, summary: '主角保存证据并确认事实。',
    reviewScore: 80, createdBy: actor.userId
  } });
  const candidate = await prisma.chapterContentVersion.create({ data: { ...scope,
    chapterId: chapter.id, versionNo: 2, status: 'CANDIDATE', sourceType: 'mock_ai',
    sourceVersionRefs: { currentContentVersionId: formal.id }, rewriteReason: '仅优化表达',
    content: '乙'.repeat(1800), wordCount: 1800, summary: '主角更清晰地呈现已有证据。',
    reviewScore: 85, createdBy: actor.userId,
    metadata: { summaryCompare: { currentSummary: formal.summary, candidateSummary: '主角更清晰地呈现已有证据。',
      benefit: '表达更清晰', newRisks: [], possibleImpact: '仅调整本章表达', aiSuggestion: '核对后采用' } }
  } });
  await prisma.novelChapter.update({ where: { id: chapter.id }, data: { currentContentVersionId: formal.id } });
  process.stdout.write(`E1_CHAPTER_ACTIONS_BROWSER_FIXTURE=${JSON.stringify({ ...scope,
    chapterId: chapter.id, formalVersionId: formal.id, seedCandidateId: candidate.id })}\n`);
}
if (browserAction === 'overlength') {
  const revise = bodyProvider.reviseOverlengthChapter.bind(bodyProvider);
  let calls = 0;
  bodyProvider.reviseOverlengthChapter = async (input) => {
    const call = ++calls;
    process.stdout.write(`E1_OVERLENGTH_MOCK_STARTED=${JSON.stringify({ call, at: new Date().toISOString() })}\n`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    const result = await revise(input);
    process.stdout.write(`E1_OVERLENGTH_MOCK_FINISHED=${JSON.stringify({ call, at: new Date().toISOString() })}\n`);
    return result;
  };
}
const fullReviewProvider = new MockFullReviewProvider();
if (browserAction === 'fullReview') {
  const generateFullReview = fullReviewProvider.generateFullReview.bind(fullReviewProvider);
  fullReviewProvider.generateFullReview = async (input) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return generateFullReview(input);
  };
}
const app = await buildApp({
  logger: false,
  novelRepository: repository,
  bodyProvider,
  fullReviewProvider,
  requestContextResolver: async () => ({ tenantId: 'e1_browser_mysql_tenant', userId: 'e1_browser_mysql_user' }),
  asyncTransportPolicy: () => ({
    novelAsyncDispatchEnabled: asyncEnabled,
    enabledActions,
    scopeSecret: process.env.NOVEL_ASYNC_SCOPE_SECRET,
    apiAudience: process.env.NOVEL_ASYNC_API_AUDIENCE
  })
});
app.addHook('onClose', async () => {
  await worker.stop();
  await recoveryLoop.stop();
  await disconnectPrismaClient();
});
if (browserAction === 'trial') {
  const post = async (path: string, body: Record<string, unknown> = {}) => {
    const response = await app.inject({ method: 'POST', url: path, payload: body });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Trial browser fixture setup failed: ${path} ${response.statusCode}`);
    }
    return response.json().data as Record<string, any>;
  };
  const novel = await post('/novels/drafts', { title: '都市重生：旧案与第一次反击' });
  const novelId = String(novel.id);
  const direction = await post(`/novels/${novelId}/directions/generate`);
  const directionCandidate = direction.candidates.find((candidate: { score: number }) => candidate.score >= 75);
  if (!directionCandidate) throw new Error('Trial browser fixture has no adoptable direction.');
  await post(`/novels/${novelId}/directions/${directionCandidate.id}/adopt`, {
    currentVersionId: null, idempotencyKey: `e1-trial-browser-direction-${novelId}`, reason: '确认试写测试方向'
  });
  for (const path of ['settings', 'outlines', 'stage-outlines', 'chapter-plans']) {
    const generated = await post(`/novels/${novelId}/${path}/generate`);
    await post(`/novels/${novelId}/${path}/${generated.candidate.id}/adopt`, { reason: '确认试写测试资产' });
  }
  asyncEnabled = true;
  process.stdout.write(`E1_TRIAL_BROWSER_NOVEL_ID=${novelId}\n`);
}
if (browserAction === 'directionEdit') {
  const post = async (path: string, body: Record<string, unknown> = {}) => {
    const response = await app.inject({ method: 'POST', url: path, payload: body });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Direction edit browser fixture setup failed: ${path} ${response.statusCode}`);
    }
    return response.json().data as Record<string, any>;
  };
  const novel = await post('/novels/drafts', { title: 'E1 都市重生方向融合与优化验收' });
  const novelId = String(novel.id);
  const direction = await post(`/novels/${novelId}/directions/generate`);
  if (!Array.isArray(direction.candidates) || direction.candidates.length < 2) {
    throw new Error('Direction edit browser fixture has fewer than two candidates.');
  }
  asyncEnabled = true;
  process.stdout.write(`E1_DIRECTION_EDIT_BROWSER_NOVEL_ID=${novelId}\n`);
}
if (browserAction === 'fullReview') {
  await repository.getAuthoritativeTaskTime();
  const actor = { tenantId: 'e1_browser_mysql_tenant', userId: 'e1_browser_mysql_user',
    requestId: `e1-browser-full-review-${randomUUID()}` };
  const seed = await createFullReviewAcceptanceSeed(
    new NovelService({ repository, now: () => new Date() }),
    { title: 'E1 都市重生全书审稿长等待验收' }, actor
  );
  process.stdout.write(`E1_FULL_REVIEW_BROWSER_NOVEL_ID=${seed.novelId}\n`);
}
if (browserAction === 'overlength') {
  await repository.getAuthoritativeTaskTime();
  const prisma = getPrismaClient();
  const actor = { tenantId: 'e1_browser_mysql_tenant', userId: 'e1_browser_mysql_user',
    requestId: `e1-browser-overlength-${randomUUID()}` };
  const { novel } = await repository.createDraft({ request: { title: 'E1 超长正文精简长等待验收' },
    context: actor, now: new Date() });
  const scope = { tenantId: actor.tenantId, novelId: novel.id };
  const plan = await prisma.creativeVersion.create({ data: { ...scope,
    objectType: 'chapter_plan', objectId: 'chapter_plan', versionNo: 1, status: 'CURRENT',
    contentJson: { title: '隔离章节目录', summary: '第 3 章正式正文保留，第 4 章原稿待精简' },
    createdBy: actor.userId
  } });
  const formalChapter = await prisma.novelChapter.create({ data: { ...scope,
    chapterNo: 3, title: '已确认的前章', wordTarget: 1000, mainStatus: 'completed'
  } });
  const formalContent = '本章正式内容已经确认，主角保留证据。'.repeat(50);
  const formalVersion = await prisma.chapterContentVersion.create({ data: { ...scope,
    chapterId: formalChapter.id, versionNo: 1, status: 'CURRENT', sourceType: 'manual',
    content: formalContent, wordCount: evaluateChapterLength(formalContent, 1000).actual,
    createdBy: actor.userId
  } });
  await prisma.novelChapter.update({ where: { id: formalChapter.id }, data: {
    currentContentVersionId: formalVersion.id, wordCount: formalVersion.wordCount
  } });
  const chapter = await prisma.novelChapter.create({ data: { ...scope,
    chapterNo: 4, title: '保留原稿等待精简', wordTarget: 1000, statusNote: '超长原稿待处理'
  } });
  await prisma.novel.update({ where: { id: novel.id }, data: {
    currentChapterPlanVersionId: plan.id, creationStage: 'BODY', stageStatus: 'BLOCKED'
  } });
  const content = '甲'.repeat(1110) + '这是一句可以删除的冗余描写。'.repeat(4);
  const lengthGate = evaluateChapterLength(content, 1000);
  if (lengthGate.status !== 'too_long') throw new Error('Overlength fixture must fail the length gate.');
  const original = await prisma.chapterContentVersion.create({ data: { ...scope,
    chapterId: chapter.id, versionNo: 1, status: 'CANDIDATE', sourceType: 'ai_overlength_original',
    sourceVersionRefs: { currentChapterPlanVersionId: plan.id }, content,
    wordCount: lengthGate.actual, createdBy: actor.userId, summary: '隔离测试超长原稿，尚未复核。',
    metadata: { chapterNo: chapter.chapterNo, title: chapter.title, lengthRecovery: 'original',
      lengthGate: { ...lengthGate }, reviewRequired: true, riskLevel: 'medium' }
  } });
  process.stdout.write(`E1_OVERLENGTH_BROWSER_FIXTURE=${JSON.stringify({ ...scope,
    chapterId: chapter.id, originalId: original.id, formalChapterId: formalChapter.id,
    formalVersionId: formalVersion.id, chapterPlanVersionId: plan.id })}\n`);
}
const directionProvider = new MockDirectionProvider();
const generate = directionProvider.generateCandidates.bind(directionProvider);
if (browserAction === 'direction') {
  directionProvider.generateCandidates = async (input) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return generate(input);
  };
}
if (browserAction === 'directionEdit') {
  const fuse = directionProvider.fuseCandidates.bind(directionProvider);
  directionProvider.fuseCandidates = async (input) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return fuse(input);
  };
  const optimize = directionProvider.optimizeCandidate.bind(directionProvider);
  directionProvider.optimizeCandidate = async (input) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return optimize(input);
  };
}
const trialProvider = new MockTrialProvider();
if (browserAction === 'trial') {
  const generateChapterOne = trialProvider.generateChapterOneCandidates.bind(trialProvider);
  trialProvider.generateChapterOneCandidates = async (input) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return generateChapterOne(input);
  };
  const generateFollowup = trialProvider.generateFollowup.bind(trialProvider);
  trialProvider.generateFollowup = async (input) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return generateFollowup(input);
  };
}
const worker = new NovelTaskWorkerRuntime({
  repository, clock: { now: () => repository.getAuthoritativeTaskTime() },
  scheduler: createSystemNovelTaskWorkerScheduler(), workerId: `e1-browser-mysql:${randomUUID()}`,
  policy: { workerConcurrency: 1, leaseDurationMs: 60_000, heartbeatIntervalMs: 10_000,
    pollIntervalMs: 100, shutdownGracePeriodMs: 1000 },
  ...createLeasedActionExecutor({ repository, providers: {
    directionProvider, structureProvider: new MockStructureProvider(),
    trialProvider, bodyProvider,
    fullReviewProvider
  } }),
  onRuntimeError: (stage) => app.log.warn({ stage }, 'E1 browser MySQL worker operation failed.')
});
const recoveryLoop = createNovelRecoveryLoop({ repository });
await app.listen({ host: '127.0.0.1', port });
recoveryLoop.start();
worker.start();
process.stdout.write(`E1_BROWSER_READY=${port}\n`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close().catch(() => { process.exitCode = 1; }); });
}
