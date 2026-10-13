import { buildApp } from './app.js';
import { env } from './config/env.js';
import { isPlaceholderActorIdentifier } from '@ai-shortvideo/shared';
import { createInMemoryNovelRepository } from './modules/novels/repositories/inMemoryNovelRepository.js';
import { PrismaNovelRepository } from './modules/novels/repositories/prismaNovelRepository.js';
import { createNovelRecoveryLoop } from './modules/novels/services/recoveryScanner.js';

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
app.addHook('onClose', async () => recoveryLoop.stop());

await app.listen({
  host: '0.0.0.0',
  port: env.PORT
});
recoveryLoop.start();
