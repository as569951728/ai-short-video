import { createHmac } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { isPlaceholderActorIdentifier } from '@ai-shortvideo/shared';
import type { RequestContextResolver } from '../domain/novelDomain.js';

export type NovelAsyncTransportCapabilityV1 =
  | {
      contractVersion: 'v1';
      enabled: false;
      reasonCode:
        | 'POLICY_DISABLED'
        | 'UNSUPPORTED_ENVIRONMENT'
        | 'TRUSTED_CONTEXT_MISSING'
        | 'SCOPE_SECRET_MISSING'
        | 'API_AUDIENCE_MISSING';
    }
  | {
      contractVersion: 'v1';
      enabled: true;
      capabilityRevision: string;
      submissionScopeId: string;
      expiresAt: string;
    };

export interface AsyncTransportPolicy {
  novelAsyncDispatchEnabled: boolean;
  policyRevision?: string;
  capabilityTtlMs?: number;
  scopeSecret?: string | Uint8Array;
  apiAudience?: string;
}

export type AsyncTransportPolicySource = AsyncTransportPolicy | (() => AsyncTransportPolicy);
export type CapabilityPolicySnapshotResolver = (request: FastifyRequest) => Promise<NovelAsyncTransportCapabilityV1>;

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
    if (options.runtimeEnvironment !== 'development' || options.providerMode !== 'mock') {
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
    const submissionScopeId = hmacBase64Url(secret, [
      'rp02b2-scope', 'v1', apiAudience, tenantId, userId
    ]);
    const capabilityRevision = hmacBase64Url(secret, [
      'rp02b2-capability', 'v1', policy.policyRevision ?? '',
      String(ttlMs), options.runtimeEnvironment, options.providerMode,
      apiAudience, tenantId, userId, expiresAt
    ]);
    return { contractVersion: 'v1', enabled: true, capabilityRevision, submissionScopeId, expiresAt };
  };
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

function hmacBase64Url(secret: Buffer, parts: readonly string[]): string {
  // Fixed-order JSON arrays avoid ambiguous concatenation while NFC normalizes Unicode identity strings.
  const canonicalJson = JSON.stringify(parts.map((part) => part.normalize('NFC')));
  return createHmac('sha256', secret).update(canonicalJson, 'utf8').digest('base64url');
}
