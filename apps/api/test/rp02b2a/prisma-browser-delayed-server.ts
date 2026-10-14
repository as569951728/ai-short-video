import { randomUUID } from 'node:crypto';
import { buildApp } from '../../src/app.js';
import { disconnectPrismaClient } from '../../src/infrastructure/database/prisma.js';
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
const target = new URL(url);
if (target.protocol !== 'mysql:' || !['127.0.0.1', 'localhost'].includes(target.hostname)
  || !/^\/ai_shortvideo_e1_[a-z0-9_]+$/.test(target.pathname)
  || !target.port || target.port === '3306' || target.search || target.hash
  || !/^e1_[a-z0-9_]+$/.test(target.username) || !target.password) {
  throw new Error('E1 browser MySQL smoke requires a dedicated loopback schema and non-default port.');
}
const delayMs = Number(process.env.E1_BROWSER_MODEL_DELAY_MS);
const port = Number(process.env.PORT);
const browserAction = process.env.E1_BROWSER_ACTION ?? 'direction';
if (!Number.isSafeInteger(delayMs) || delayMs < 120_000 || delayMs > 300_000
  || !Number.isSafeInteger(port) || port < 1024 || port > 65535
  || !['direction', 'trial', 'fullReview'].includes(browserAction)) {
  throw new Error('Set a 2-5 minute delay and an explicit unprivileged port.');
}

class IsolatedPrismaRepository extends PrismaNovelRepository {
  override async assertProviderActionSupported(taskType: string) {
    if (browserAction !== 'fullReview' || taskType !== 'novel_full_review') {
      await super.assertProviderActionSupported(taskType);
    }
  }

  override async getLeasedExecutionCapability(taskType: string) {
    const allowed = browserAction === 'direction' ? ['novel_direction_generate']
      : browserAction === 'trial' ? ['trial_writing_generate', 'trial_followup_generate']
        : ['novel_full_review'];
    return allowed.includes(taskType) ? 'enabled' as const : super.getLeasedExecutionCapability(taskType);
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
let asyncEnabled = browserAction !== 'trial';
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
  fullReviewProvider,
  requestContextResolver: async () => ({ tenantId: 'e1_browser_mysql_tenant', userId: 'e1_browser_mysql_user' }),
  asyncTransportPolicy: () => ({
    novelAsyncDispatchEnabled: asyncEnabled,
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
const directionProvider = new MockDirectionProvider();
const generate = directionProvider.generateCandidates.bind(directionProvider);
if (browserAction === 'direction') {
  directionProvider.generateCandidates = async (input) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return generate(input);
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
    trialProvider, bodyProvider: new MockBodyProvider(),
    fullReviewProvider
  } }),
  onRuntimeError: (stage) => app.log.warn({ stage }, 'E1 browser MySQL worker operation failed.')
});
const recoveryLoop = createNovelRecoveryLoop({ repository });
await app.listen({ host: '127.0.0.1', port });
recoveryLoop.start();
worker.start();
