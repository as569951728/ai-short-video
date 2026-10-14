import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { ErrorCode, NOVEL_ASYNC_TRANSPORT_ACTIONS, isPlaceholderActorIdentifier,
  type NovelAsyncTransportAction, type NovelAsyncTransportCapabilityV1 } from '@ai-shortvideo/shared';
import { BusinessError } from '../../../shared/errors.js';
import { ISOLATED_E1_ACTIONS } from '../../../config/isolatedNovelAsyncPolicy.js';
import type { RequestContextResolver } from '../domain/novelDomain.js';

export type { NovelAsyncTransportCapabilityV1 } from '@ai-shortvideo/shared';

export interface AsyncTransportPolicy {
  novelAsyncDispatchEnabled: boolean;
  // Trusted server declaration only, after validating the persistent repository and worker configuration.
  durableRuntimeConfigured?: boolean;
  policyRevision?: string;
  capabilityTtlMs?: number;
  scopeSecret?: string | Uint8Array;
  apiAudience?: string;
  enabledActions?: readonly NovelAsyncTransportAction[];
}

export type AsyncTransportPolicySource = AsyncTransportPolicy | (() => AsyncTransportPolicy);
export type CapabilityPolicySnapshotResolver = (request: FastifyRequest) => Promise<NovelAsyncTransportCapabilityV1>;

export interface ExpectedAsyncCapability {
  expectedSubmissionScopeId?: unknown;
  expectedCapabilityRevision?: unknown;
  expectedCapabilityExpiresAt?: unknown;
}

export function assertAsyncCapabilitySubmission(
  capability: NovelAsyncTransportCapabilityV1,
  expected: ExpectedAsyncCapability,
  authoritativeNow: Date
): asserts capability is Extract<NovelAsyncTransportCapabilityV1, { enabled: true }> {
  if (!capability.enabled || !Number.isFinite(authoritativeNow.getTime())) {
    throw new BusinessError(ErrorCode.GateBlocked, '当前无法确认后台任务提交范围，请重新检查。');
  }
  const actualScope = decodeScope(capability.submissionScopeId);
  const expectedScope = decodeScope(expected.expectedSubmissionScopeId);
  if (!actualScope || !expectedScope || actualScope.length !== 32 || expectedScope.length !== 32
    || !timingSafeEqual(actualScope, expectedScope)
    || expected.expectedCapabilityRevision !== capability.capabilityRevision
    || expected.expectedCapabilityExpiresAt !== capability.expiresAt
    || authoritativeNow.getTime() >= Date.parse(capability.expiresAt)) {
    throw new BusinessError(ErrorCode.GateBlocked, '任务提交凭据已变化或过期，请重新检查。');
  }
}

interface CapabilityPolicySnapshotOptions {
  policy: AsyncTransportPolicySource;
  runtimeEnvironment: string;
  providerMode: string;
  requestContextResolver?: RequestContextResolver;
  now?: () => Date;
}

const DEFAULT_CAPABILITY_TTL_MS = 5 * 60 * 1000;

export function createCapabilityPolicySnapshotResolver(
  options: CapabilityPolicySnapshotOptions
): CapabilityPolicySnapshotResolver {
  return async (request) => {
    const policy = typeof options.policy === 'function' ? options.policy() : options.policy;
    if (policy.novelAsyncDispatchEnabled !== true) return disabled('POLICY_DISABLED');
    const durableRuntime = policy.durableRuntimeConfigured === true;
    const supportedEnvironment = durableRuntime
      ? ['development', 'production'].includes(options.runtimeEnvironment)
        && ['mock', 'deepseek'].includes(options.providerMode)
      : options.runtimeEnvironment === 'development' && options.providerMode === 'mock';
    if (!supportedEnvironment) {
      return disabled('UNSUPPORTED_ENVIRONMENT');
    }

    let tenantId: string;
    let userId: string;
    try {
      const actor = await options.requestContextResolver?.(request);
      tenantId = normalizeIdentity(actor?.tenantId);
      userId = normalizeIdentity(actor?.userId);
    } catch {
      return disabled('TRUSTED_CONTEXT_MISSING');
    }
    if (isPlaceholderActorIdentifier(tenantId) || isPlaceholderActorIdentifier(userId)) {
      return disabled('TRUSTED_CONTEXT_MISSING');
    }

    const secret = secretBytes(policy.scopeSecret);
    if (!secret || secret.byteLength < 32) return disabled('SCOPE_SECRET_MISSING');
    const apiAudience = normalizeIdentity(policy.apiAudience);
    if (!apiAudience) return disabled('API_AUDIENCE_MISSING');

    const ttlMs = policy.capabilityTtlMs ?? DEFAULT_CAPABILITY_TTL_MS;
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
      throw new Error('Invalid async transport capability TTL');
    }
    const nowMs = (options.now ?? (() => new Date()))().getTime();
    if (!Number.isFinite(nowMs)) throw new Error('Invalid async transport capability clock');
    const expiryMs = (Math.floor(nowMs / ttlMs) + 1) * ttlMs;
    if (!Number.isFinite(expiryMs) || expiryMs > 8_640_000_000_000_000) {
      throw new Error('Invalid async transport capability expiry');
    }
    const expiresAt = new Date(expiryMs).toISOString();
    const enabledActions = normalizeEnabledActions(policy.enabledActions);
    if (durableRuntime) {
      if (!enabledActions?.length) return disabled('POLICY_DISABLED');
      const allowed = new Set<NovelAsyncTransportAction>(ISOLATED_E1_ACTIONS);
      if (enabledActions.some((action) => !allowed.has(action))) {
        throw new Error('Durable async transport requires an E1-only action policy');
      }
    }
    if (enabledActions?.length === 0) return disabled('POLICY_DISABLED');
    const submissionScopeId = hmacBase64Url(secret, [
      'rp02b2-scope', 'v1', apiAudience, tenantId, userId
    ]);
    const capabilityRevision = hmacBase64Url(secret, [
      'rp02b2-capability', 'v1', policy.policyRevision ?? '',
      String(ttlMs), options.runtimeEnvironment, options.providerMode,
      apiAudience, tenantId, userId, expiresAt, JSON.stringify(enabledActions ?? ['*']),
      ...(durableRuntime ? ['durable-runtime-configured'] : [])
    ]);
    return { contractVersion: 'v1', enabled: true, capabilityRevision, submissionScopeId, expiresAt,
      ...(enabledActions ? { enabledActions } : {}) };
  };
}

export function assertLegacyNovelSubmissionAllowed(
  capability: NovelAsyncTransportCapabilityV1,
  body: Record<string, unknown>
): void {
  if ((!capability.enabled && !['POLICY_DISABLED', 'UNSUPPORTED_ENVIRONMENT'].includes(capability.reasonCode))
    || ['expectedSubmissionScopeId', 'expectedCapabilityRevision', 'expectedCapabilityExpiresAt']
      .some((key) => Object.hasOwn(body, key))) {
    throw new BusinessError(ErrorCode.GateBlocked, '暂时无法确认任务提交方式，请重新检查。');
  }
}

function normalizeEnabledActions(actions: readonly NovelAsyncTransportAction[] | undefined) {
  if (actions === undefined) return undefined;
  if (!Array.isArray(actions) || new Set(actions).size !== actions.length
    || actions.some((action) => !NOVEL_ASYNC_TRANSPORT_ACTIONS.includes(action))) {
    throw new Error('Invalid async transport action policy');
  }
  const allowed = new Set(actions);
  return NOVEL_ASYNC_TRANSPORT_ACTIONS.filter((action) => allowed.has(action));
}

function disabled(reasonCode: Extract<NovelAsyncTransportCapabilityV1, { enabled: false }>['reasonCode']) {
  return { contractVersion: 'v1', enabled: false, reasonCode } as const;
}

function normalizeIdentity(value: unknown): string {
  return typeof value === 'string' ? value.trim().normalize('NFC') : '';
}

function secretBytes(value: string | Uint8Array | undefined): Buffer | null {
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  if (value instanceof Uint8Array) return Buffer.from(value);
  return null;
}

function decodeScope(value: unknown): Buffer | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
    ? Buffer.from(value, 'base64url') : null;
}

function hmacBase64Url(secret: Buffer, parts: readonly string[]): string {
  // Fixed-order JSON arrays avoid ambiguous concatenation while NFC normalizes Unicode identity strings.
  const canonicalJson = JSON.stringify(parts.map((part) => part.normalize('NFC')));
  return createHmac('sha256', secret).update(canonicalJson, 'utf8').digest('base64url');
}
