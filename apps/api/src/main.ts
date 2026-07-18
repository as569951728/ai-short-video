import { buildApp } from './app.js';
import { env } from './config/env.js';

if (
  !env.DEPLOYMENT_ACTOR_TENANT_ID
  || !env.DEPLOYMENT_ACTOR_USER_ID
  || env.DEPLOYMENT_ACTOR_TENANT_ID === 'tenant_default'
  || env.DEPLOYMENT_ACTOR_USER_ID === 'user_default'
) {
  throw new Error('DEPLOYMENT_ACTOR_TENANT_ID and DEPLOYMENT_ACTOR_USER_ID are required');
}

const deploymentActor = Object.freeze({
  tenantId: env.DEPLOYMENT_ACTOR_TENANT_ID,
  userId: env.DEPLOYMENT_ACTOR_USER_ID
});
const app = await buildApp({
  requestContextResolver: async () => deploymentActor
});

await app.listen({
  host: '0.0.0.0',
  port: env.PORT
});
