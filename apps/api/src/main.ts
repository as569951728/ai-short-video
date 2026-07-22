import { buildApp } from './app.js';
import { env } from './config/env.js';
import { isPlaceholderActorIdentifier } from '@ai-shortvideo/shared';

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
const app = await buildApp({
  requestContextResolver: async () => deploymentActor
});

await app.listen({
  host: '0.0.0.0',
  port: env.PORT
});
