import { buildApp } from './app.js';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { isPlaceholderActorIdentifier } from '@ai-shortvideo/shared';
import { createInMemoryNovelRepository } from './modules/novels/repositories/inMemoryNovelRepository.js';
import { PrismaNovelRepository } from './modules/novels/repositories/prismaNovelRepository.js';
import { createNovelRecoveryLoop } from './modules/novels/services/recoveryScanner.js';
import { createLeasedActionExecutor } from './modules/novels/services/leasedActionExecutor.js';
import { createSystemNovelTaskWorkerScheduler, NovelTaskWorkerRuntime } from './modules/novels/services/novelTaskWorkerRuntime.js';
import { MockDirectionProvider } from './modules/novels/providers/mockDirectionProvider.js';
import { MockStructureProvider } from './modules/novels/providers/mockStructureProvider.js';
import { MockTrialProvider } from './modules/novels/providers/mockTrialProvider.js';
import { MockBodyProvider } from './modules/novels/providers/mockBodyProvider.js';
import { MockFullReviewProvider } from './modules/novels/providers/mockFullReviewProvider.js';

if (
  isPlaceholderActorIdentifier(env.DEPLOYMENT_ACTOR_TENANT_ID)
  || isPlaceholderActorIdentifier(env.DEPLOYMENT_ACTOR_USER_ID)
) {
  throw new Error('DEPLOYMENT_ACTOR_TENANT_ID and DEPLOYMENT_ACTOR_USER_ID are required');
}
const deploymentActor = Object.freeze({
  tenantId: env.DEPLOYMENT_ACTOR_TENANT_ID!,
  userId: env.DEPLOYMENT_ACTOR_USER_ID!
});
const novelRepository = env.DATABASE_URL ? new PrismaNovelRepository() : createInMemoryNovelRepository();
const app = await buildApp({
  novelRepository,
  requestContextResolver: async () => deploymentActor
});
const recoveryLoop = createNovelRecoveryLoop({
  repository: novelRepository,
  onSweep: ({ recovered, failed }) => {
    if (recovered > 0) app.log.info({ recovered }, 'Expired novel tasks recovered.');
    if (failed > 0) app.log.warn({ failed }, 'Some expired novel tasks could not be recovered.');
  },
  onError: () => app.log.warn('Novel task recovery scan failed; the next scan will retry.')
});
const worker = new NovelTaskWorkerRuntime({
  repository: novelRepository,
  clock: { now: () => novelRepository.getAuthoritativeTaskTime() },
  scheduler: createSystemNovelTaskWorkerScheduler(),
  workerId: `novel-worker:${randomUUID()}`,
  policy: {
    workerConcurrency: 2,
    leaseDurationMs: 60_000,
    heartbeatIntervalMs: 10_000,
    pollIntervalMs: 5_000,
    shutdownGracePeriodMs: 5_000
  },
  ...createLeasedActionExecutor({
    repository: novelRepository,
    providers: {
      directionProvider: new MockDirectionProvider(),
      structureProvider: new MockStructureProvider(),
      trialProvider: new MockTrialProvider(),
      bodyProvider: new MockBodyProvider(),
      fullReviewProvider: new MockFullReviewProvider()
    }
  }),
  onRuntimeError: (stage) => app.log.warn({ stage }, 'Novel task worker operation failed.')
});
app.addHook('onClose', async () => {
  await worker.stop();
  await recoveryLoop.stop();
});

await app.listen({
  host: '0.0.0.0',
  port: env.PORT
});
recoveryLoop.start();
worker.start();
