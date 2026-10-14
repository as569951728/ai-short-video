import { isPlaceholderActorIdentifier } from '@ai-shortvideo/shared';
import type { AsyncTransportPolicy } from '../modules/novels/services/asyncTransportCapability.js';
import { ISOLATED_E1_ACTIONS, ISOLATED_E1_TASK_TYPES } from './isolatedNovelAsyncPolicy.js';

interface NovelAsyncDispatchInput {
  flag?: string;
  runtimeEnvironment: string;
  providerMode: string;
  databaseUrl?: string;
  deploymentActor?: { tenantId?: string; userId?: string };
  scopeSecret?: string;
  apiAudience?: string;
}

interface NovelAsyncDispatchConfig {
  asyncTransportPolicy: AsyncTransportPolicy;
  enabledLeasedTaskTypes: ReadonlySet<string>;
}

export function resolveNovelAsyncDispatchConfig(input: NovelAsyncDispatchInput): NovelAsyncDispatchConfig | null {
  if (input.flag === undefined || input.flag === 'false') return null;
  if (input.flag !== 'true') throw new Error('NOVEL_ASYNC_DISPATCH_ENABLED must be true or false.');
  if (!['development', 'production'].includes(input.runtimeEnvironment)) {
    throw new Error('NOVEL_ASYNC_DISPATCH_ENABLED requires NODE_ENV development or production.');
  }
  // Validate before resolveAiProviderMode can silently turn an unknown mode into mock.
  if (!['mock', 'deepseek'].includes(input.providerMode.trim().toLowerCase())) {
    throw new Error('NOVEL_ASYNC_DISPATCH_ENABLED requires AI_PROVIDER_MODE mock or deepseek.');
  }
  assertPrismaDatabaseUrl(input.databaseUrl);
  if (isPlaceholderActorIdentifier(input.deploymentActor?.tenantId)
    || isPlaceholderActorIdentifier(input.deploymentActor?.userId)) {
    throw new Error('NOVEL_ASYNC_DISPATCH_ENABLED requires valid DEPLOYMENT_ACTOR_TENANT_ID and DEPLOYMENT_ACTOR_USER_ID.');
  }
  if (!input.scopeSecret?.trim() || Buffer.byteLength(input.scopeSecret, 'utf8') < 32) {
    throw new Error('NOVEL_ASYNC_DISPATCH_ENABLED requires NOVEL_ASYNC_SCOPE_SECRET of at least 32 UTF-8 bytes.');
  }
  const apiAudience = input.apiAudience?.trim().normalize('NFC');
  if (!apiAudience) {
    throw new Error('NOVEL_ASYNC_DISPATCH_ENABLED requires NOVEL_ASYNC_API_AUDIENCE.');
  }
  return {
    asyncTransportPolicy: {
      novelAsyncDispatchEnabled: true,
      durableRuntimeConfigured: true,
      enabledActions: [...ISOLATED_E1_ACTIONS],
      scopeSecret: input.scopeSecret,
      apiAudience
    },
    enabledLeasedTaskTypes: new Set(ISOLATED_E1_TASK_TYPES)
  };
}

function assertPrismaDatabaseUrl(value: string | undefined): void {
  try {
    const target = new URL(value ?? '');
    if (target.protocol === 'mysql:' && target.hostname && target.pathname.length > 1 && !target.hash) return;
  } catch {
    // Never include database credentials in startup errors.
  }
  throw new Error('NOVEL_ASYNC_DISPATCH_ENABLED requires a valid MySQL Prisma DATABASE_URL with a database name.');
}
