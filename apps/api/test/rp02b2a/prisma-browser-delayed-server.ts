import { randomUUID } from 'node:crypto';
import { buildApp } from '../../src/app.js';
import { disconnectPrismaClient } from '../../src/infrastructure/database/prisma.js';
import { MockBodyProvider } from '../../src/modules/novels/providers/mockBodyProvider.js';
import { MockDirectionProvider } from '../../src/modules/novels/providers/mockDirectionProvider.js';
import { MockFullReviewProvider } from '../../src/modules/novels/providers/mockFullReviewProvider.js';
import { MockStructureProvider } from '../../src/modules/novels/providers/mockStructureProvider.js';
import { MockTrialProvider } from '../../src/modules/novels/providers/mockTrialProvider.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';
import { createLeasedActionExecutor } from '../../src/modules/novels/services/leasedActionExecutor.js';
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
  || !target.username || !target.password) {
  throw new Error('E1 browser MySQL smoke requires a dedicated loopback schema and non-default port.');
}
const delayMs = Number(process.env.E1_BROWSER_MODEL_DELAY_MS);
const port = Number(process.env.PORT);
if (!Number.isSafeInteger(delayMs) || delayMs < 120_000 || delayMs > 300_000
  || !Number.isSafeInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Set a 2-5 minute delay and an explicit unprivileged port.');
}

class IsolatedPrismaRepository extends PrismaNovelRepository {
  override async getLeasedExecutionCapability(taskType: string) {
    return taskType === 'novel_direction_generate' ? 'enabled' as const : super.getLeasedExecutionCapability(taskType);
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
const app = await buildApp({
  novelRepository: repository,
  requestContextResolver: async () => ({ tenantId: 'e1_browser_mysql_tenant', userId: 'e1_browser_mysql_user' }),
  asyncTransportPolicy: {
    novelAsyncDispatchEnabled: true,
    scopeSecret: process.env.NOVEL_ASYNC_SCOPE_SECRET,
    apiAudience: process.env.NOVEL_ASYNC_API_AUDIENCE
  }
});
const directionProvider = new MockDirectionProvider();
const generate = directionProvider.generateCandidates.bind(directionProvider);
directionProvider.generateCandidates = async (input) => {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return generate(input);
};
const worker = new NovelTaskWorkerRuntime({
  repository, clock: { now: () => repository.getAuthoritativeTaskTime() },
  scheduler: createSystemNovelTaskWorkerScheduler(), workerId: `e1-browser-mysql:${randomUUID()}`,
  policy: { workerConcurrency: 1, leaseDurationMs: 60_000, heartbeatIntervalMs: 10_000,
    pollIntervalMs: 100, shutdownGracePeriodMs: 1000 },
  ...createLeasedActionExecutor({ repository, providers: {
    directionProvider, structureProvider: new MockStructureProvider(),
    trialProvider: new MockTrialProvider(), bodyProvider: new MockBodyProvider(),
    fullReviewProvider: new MockFullReviewProvider()
  } }),
  onRuntimeError: (stage) => app.log.warn({ stage }, 'E1 browser MySQL worker operation failed.')
});
const recoveryLoop = createNovelRecoveryLoop({ repository });
app.addHook('onClose', async () => {
  await worker.stop();
  await recoveryLoop.stop();
  await disconnectPrismaClient();
});
await app.listen({ host: '127.0.0.1', port });
recoveryLoop.start();
worker.start();
