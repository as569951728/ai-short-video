import { randomUUID } from 'node:crypto';
import { buildApp } from '../../src/app.js';
import { MockBodyProvider } from '../../src/modules/novels/providers/mockBodyProvider.js';
import { MockDirectionProvider } from '../../src/modules/novels/providers/mockDirectionProvider.js';
import { MockFullReviewProvider } from '../../src/modules/novels/providers/mockFullReviewProvider.js';
import { MockStructureProvider } from '../../src/modules/novels/providers/mockStructureProvider.js';
import { MockTrialProvider } from '../../src/modules/novels/providers/mockTrialProvider.js';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';
import { createLeasedActionExecutor } from '../../src/modules/novels/services/leasedActionExecutor.js';
import { NovelTaskWorkerRuntime, createSystemNovelTaskWorkerScheduler } from '../../src/modules/novels/services/novelTaskWorkerRuntime.js';

if (process.env.NODE_ENV !== 'development' || process.env.AI_PROVIDER_MODE !== 'mock'
  || process.env.DATABASE_URL || process.env.E1_BROWSER_SMOKE !== 'true') {
  throw new Error('Delayed browser smoke is restricted to development mock without DATABASE_URL.');
}
const delayMs = Number(process.env.E1_BROWSER_MODEL_DELAY_MS);
const port = Number(process.env.PORT);
if (!Number.isSafeInteger(delayMs) || delayMs < 120_000 || delayMs > 300_000
  || !Number.isSafeInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Set a 2-5 minute delay and an explicit unprivileged port.');
}

const repository = createInMemoryNovelRepository({
  enabledLeasedTaskTypes: new Set(['novel_direction_generate'])
});
const app = await buildApp({
  novelRepository: repository,
  requestContextResolver: async () => ({ tenantId: 'e1_browser_tenant', userId: 'e1_browser_user' }),
  asyncTransportPolicy: {
    novelAsyncDispatchEnabled: true,
    scopeSecret: process.env.NOVEL_ASYNC_SCOPE_SECRET,
    apiAudience: process.env.NOVEL_ASYNC_API_AUDIENCE
  }
});
const provider = new MockDirectionProvider();
const generate = provider.generateCandidates.bind(provider);
provider.generateCandidates = async (input) => {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return generate(input);
};
const worker = new NovelTaskWorkerRuntime({
  repository, clock: { now: () => repository.getAuthoritativeTaskTime() },
  scheduler: createSystemNovelTaskWorkerScheduler(), workerId: `e1-browser:${randomUUID()}`,
  policy: { workerConcurrency: 1, leaseDurationMs: 60_000, heartbeatIntervalMs: 10_000,
    pollIntervalMs: 100, shutdownGracePeriodMs: 1000 },
  ...createLeasedActionExecutor({ repository, providers: {
    directionProvider: provider, structureProvider: new MockStructureProvider(),
    trialProvider: new MockTrialProvider(), bodyProvider: new MockBodyProvider(),
    fullReviewProvider: new MockFullReviewProvider()
  } })
});
app.addHook('onClose', async () => { await worker.stop(); });
await app.listen({ host: '127.0.0.1', port });
worker.start();
