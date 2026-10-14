import { buildApp } from './app.js';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { resolveNovelAsyncDispatchConfig } from './config/novelAsyncDispatch.js';
import { isPlaceholderActorIdentifier } from '@ai-shortvideo/shared';
import { createInMemoryNovelRepository } from './modules/novels/repositories/inMemoryNovelRepository.js';
import { PrismaNovelRepository } from './modules/novels/repositories/prismaNovelRepository.js';
import { createNovelRecoveryLoop } from './modules/novels/services/recoveryScanner.js';
import { createLeasedActionExecutor } from './modules/novels/services/leasedActionExecutor.js';
import { createSystemNovelTaskWorkerScheduler, NovelTaskWorkerRuntime } from './modules/novels/services/novelTaskWorkerRuntime.js';
import { createLeasedNovelProvidersFromEnv } from './modules/novels/providers/providerFactory.js';
import { resolveAiProviderMode } from './modules/ai/modelRouting.js';
import { ISOLATED_E1_ACTIONS, ISOLATED_E1_TASK_TYPES,
  resolveIsolatedNovelAsyncEnabled } from './config/isolatedNovelAsyncPolicy.js';

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
const durableAsyncConfig = resolveNovelAsyncDispatchConfig({
  flag: env.NOVEL_ASYNC_DISPATCH_ENABLED,
  runtimeEnvironment: env.NODE_ENV,
  providerMode: process.env.AI_PROVIDER_MODE ?? 'mock',
  databaseUrl: env.DATABASE_URL,
  deploymentActor,
  scopeSecret: env.NOVEL_ASYNC_SCOPE_SECRET,
  apiAudience: env.NOVEL_ASYNC_API_AUDIENCE
});
const developmentAsyncEnabled = env.NOVEL_ASYNC_DISPATCH_DEV_ENABLED === 'true'
  && env.NODE_ENV === 'development' && !env.DATABASE_URL && resolveAiProviderMode() === 'mock';
const isolatedMysqlAsyncEnabled = resolveIsolatedNovelAsyncEnabled({
  flag: env.NOVEL_ASYNC_DISPATCH_E1_MYSQL_ENABLED,
  runtimeEnvironment: env.NODE_ENV,
  providerMode: resolveAiProviderMode(),
  databaseUrl: env.DATABASE_URL,
  smokeUrl: env.E1_MYSQL_SMOKE_URL
});
const developmentLeasedTaskTypes = new Set([
  'novel_direction_generate', 'novel_setting_generate', 'novel_outline_generate',
  'stage_outline_generate', 'chapter_plan_generate', 'novel_full_review'
]);
const novelRepository = env.DATABASE_URL ? new PrismaNovelRepository({
  enabledLeasedTaskTypes: durableAsyncConfig?.enabledLeasedTaskTypes
    ?? (isolatedMysqlAsyncEnabled ? ISOLATED_E1_TASK_TYPES : undefined)
}) : createInMemoryNovelRepository({
  enabledLeasedTaskTypes: developmentAsyncEnabled ? developmentLeasedTaskTypes : undefined
});
const app = await buildApp({
  novelRepository,
  requestContextResolver: async () => deploymentActor,
  asyncTransportPolicy: durableAsyncConfig?.asyncTransportPolicy ?? {
    novelAsyncDispatchEnabled: developmentAsyncEnabled || isolatedMysqlAsyncEnabled,
    enabledActions: isolatedMysqlAsyncEnabled ? ISOLATED_E1_ACTIONS : undefined,
    scopeSecret: env.NOVEL_ASYNC_SCOPE_SECRET,
    apiAudience: env.NOVEL_ASYNC_API_AUDIENCE
  }
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
    providers: createLeasedNovelProvidersFromEnv()
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
