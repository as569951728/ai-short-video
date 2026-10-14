import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import type { FastifyRequest } from 'fastify';
import { buildApp } from '../../src/app.js';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';
import { createInMemoryVideoRepository } from '../../src/modules/videos/repositories/inMemoryVideoRepository.js';
import {
  assertAsyncCapabilitySubmission,
  assertLegacyNovelSubmissionAllowed,
  createCapabilityPolicySnapshotResolver,
  type AsyncTransportPolicy,
  type NovelAsyncTransportCapabilityV1
} from '../../src/modules/novels/services/asyncTransportCapability.js';

const secret = 'scope-secret-32-bytes-minimum-0123456789';
const request = {} as FastifyRequest;
const enabledPolicy = (): AsyncTransportPolicy => ({
  novelAsyncDispatchEnabled: true,
  policyRevision: 'policy-v1',
  capabilityTtlMs: 60_000,
  scopeSecret: secret,
  apiAudience: 'novel-api'
});

function expectEnabled(value: NovelAsyncTransportCapabilityV1) {
  assert.equal(value.enabled, true);
  if (!value.enabled) throw new Error('Expected enabled capability');
  return value;
}

describe('novel async transport capability', () => {
  it('requires the exact scope, revision and live database deadline at submission', async () => {
    const capability = expectEnabled(await createCapabilityPolicySnapshotResolver({
      policy: enabledPolicy(), runtimeEnvironment: 'development', providerMode: 'mock',
      requestContextResolver: async () => ({ tenantId: 'tenant-a', userId: 'user-a' }),
      now: () => new Date('2030-01-01T00:00:00.000Z')
    })(request));
    const expected = {
      expectedSubmissionScopeId: capability.submissionScopeId,
      expectedCapabilityRevision: capability.capabilityRevision,
      expectedCapabilityExpiresAt: capability.expiresAt
    };
    assert.doesNotThrow(() => assertAsyncCapabilitySubmission(capability, expected, new Date('2030-01-01T00:00:10.000Z')));
    for (const mismatch of [
      { expectedSubmissionScopeId: 'a'.repeat(43) },
      { expectedCapabilityRevision: 'old-revision' },
      { expectedCapabilityExpiresAt: '2030-01-01T00:02:00.000Z' },
      { expectedSubmissionScopeId: undefined }
    ]) {
      assert.throws(() => assertAsyncCapabilitySubmission(capability, { ...expected, ...mismatch },
        new Date('2030-01-01T00:00:10.000Z')));
    }
    assert.throws(() => assertAsyncCapabilitySubmission(capability, expected, new Date(capability.expiresAt)));
  });
  it('is a read-only default-off endpoint and ignores client-declared identity', async () => {
    let resolverCalls = 0;
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      videoRepository: createInMemoryVideoRepository(),
      requestContextResolver: async () => {
        resolverCalls += 1;
        return { tenantId: 'tenant-secret', userId: 'user-secret' };
      }
    });
    try {
      const response = await app.inject({
        method: 'GET', url: '/novels/async-transport-capability',
        headers: { 'x-tenant-id': 'tenant-forged', 'x-user-id': 'user-forged' }
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json().data, {
        contractVersion: 'v1', enabled: false, reasonCode: 'POLICY_DISABLED'
      });
      assert.equal(resolverCalls, 0);
      assert.equal(repository.getGenerationTasks().length, 0);
      assert.equal(response.body.includes('tenant-secret'), false);
      assert.equal(response.body.includes(secret), false);
    } finally {
      await app.close();
    }
  });

  it('applies the exact failure precedence without consulting lower-priority conditions', async () => {
    let resolverCalls = 0;
    let actor: { tenantId: string; userId: string } | null = null;
    let policy: AsyncTransportPolicy = { novelAsyncDispatchEnabled: false };
    let runtimeEnvironment = 'production';
    let providerMode = 'deepseek';
    const resolve = () => createCapabilityPolicySnapshotResolver({
      policy: () => policy,
      runtimeEnvironment,
      providerMode,
      requestContextResolver: async () => {
        resolverCalls += 1;
        return actor;
      },
      now: () => new Date('2030-01-01T00:00:00.000Z')
    });
    assert.equal((await resolve()(request)).enabled, false);
    assert.equal((await resolve()(request) as { reasonCode: string }).reasonCode, 'POLICY_DISABLED');
    assert.equal(resolverCalls, 0);
    policy = { novelAsyncDispatchEnabled: true };
    assert.equal((await resolve()(request) as { reasonCode: string }).reasonCode, 'UNSUPPORTED_ENVIRONMENT');
    assert.equal(resolverCalls, 0);
    runtimeEnvironment = 'development';
    assert.equal((await resolve()(request) as { reasonCode: string }).reasonCode, 'UNSUPPORTED_ENVIRONMENT');
    providerMode = 'mock';
    assert.equal((await resolve()(request) as { reasonCode: string }).reasonCode, 'TRUSTED_CONTEXT_MISSING');
    assert.equal(resolverCalls, 1);
    actor = { tenantId: 'tenant-a', userId: 'user-a' };
    assert.equal((await resolve()(request) as { reasonCode: string }).reasonCode, 'SCOPE_SECRET_MISSING');
    policy = { ...policy, scopeSecret: 'short-secret', apiAudience: '' };
    assert.equal((await resolve()(request) as { reasonCode: string }).reasonCode, 'SCOPE_SECRET_MISSING');
    policy = { ...policy, scopeSecret: secret };
    assert.equal((await resolve()(request) as { reasonCode: string }).reasonCode, 'API_AUDIENCE_MISSING');
    policy = { ...policy, apiAudience: 'novel-api' };
    assert.equal((await resolve()(request)).enabled, true);
  });

  it('keeps reason precedence across the policy/environment/context/secret/audience matrix', async () => {
    for (let mask = 0; mask < 32; mask += 1) {
      const policyOn = Boolean(mask & 1);
      const environmentOk = Boolean(mask & 2);
      const contextOk = Boolean(mask & 4);
      const secretOk = Boolean(mask & 8);
      const audienceOk = Boolean(mask & 16);
      let resolverCalls = 0;
      const resolver = createCapabilityPolicySnapshotResolver({
        policy: {
          novelAsyncDispatchEnabled: policyOn,
          scopeSecret: secretOk ? secret : 'too-short',
          apiAudience: audienceOk ? 'novel-api' : ''
        },
        runtimeEnvironment: environmentOk ? 'development' : 'production',
        providerMode: 'mock',
        requestContextResolver: async () => {
          resolverCalls += 1;
          return contextOk ? { tenantId: 'tenant-a', userId: 'user-a' } : null;
        }
      });
      const expectedReason = !policyOn ? 'POLICY_DISABLED'
        : !environmentOk ? 'UNSUPPORTED_ENVIRONMENT'
          : !contextOk ? 'TRUSTED_CONTEXT_MISSING'
            : !secretOk ? 'SCOPE_SECRET_MISSING'
              : !audienceOk ? 'API_AUDIENCE_MISSING' : null;
      const result = await resolver(request);
      assert.equal(result.enabled ? null : result.reasonCode, expectedReason, `mask=${mask}`);
      assert.equal(resolverCalls, policyOn && environmentOk ? 1 : 0, `mask=${mask}`);
    }
  });

  it('rejects missing, throwing, or placeholder authenticated contexts without a client fallback', async () => {
    const actors = [
      null,
      { tenantId: 'tenant_default', userId: 'user-a' },
      { tenantId: 'tenant-a', userId: 'user_default' },
      { tenantId: '  ', userId: 'user-a' }
    ];
    for (const actor of actors) {
      const resolver = createCapabilityPolicySnapshotResolver({
        policy: enabledPolicy(), runtimeEnvironment: 'development', providerMode: 'mock',
        requestContextResolver: async () => actor
      });
      assert.deepEqual(await resolver(request), {
        contractVersion: 'v1', enabled: false, reasonCode: 'TRUSTED_CONTEXT_MISSING'
      });
    }
    const throwing = createCapabilityPolicySnapshotResolver({
      policy: enabledPolicy(), runtimeEnvironment: 'development', providerMode: 'mock',
      requestContextResolver: async () => { throw new Error('private auth failure'); }
    });
    assert.equal((await throwing(request) as { reasonCode: string }).reasonCode, 'TRUSTED_CONTEXT_MISSING');
    const absent = createCapabilityPolicySnapshotResolver({
      policy: enabledPolicy(), runtimeEnvironment: 'development', providerMode: 'mock'
    });
    assert.equal((await absent(request) as { reasonCode: string }).reasonCode, 'TRUSTED_CONTEXT_MISSING');
    const invalidActor = createCapabilityPolicySnapshotResolver({
      policy: enabledPolicy(), runtimeEnvironment: 'development', providerMode: 'mock',
      requestContextResolver: async () => ({
        get tenantId(): never { throw new Error('invalid actor'); },
        userId: 'user-a'
      })
    });
    assert.equal((await invalidActor(request) as { reasonCode: string }).reasonCode, 'TRUSTED_CONTEXT_MISSING');
  });

  it('uses canonical HMAC scope input, separates field boundaries, and normalizes Unicode', async () => {
    let actor = { tenantId: 'a', userId: 'bc' };
    let policy = enabledPolicy();
    const resolver = createCapabilityPolicySnapshotResolver({
      policy: () => policy, runtimeEnvironment: 'development', providerMode: 'mock',
      requestContextResolver: async () => actor,
      now: () => new Date('2030-01-01T00:00:10.000Z')
    });
    const first = expectEnabled(await resolver(request));
    const canonical = JSON.stringify(['rp02b2-scope', 'v1', 'novel-api', 'a', 'bc']);
    assert.equal(first.submissionScopeId, createHmac('sha256', secret).update(canonical, 'utf8').digest('base64url'));
    actor = { tenantId: 'ab', userId: 'c' };
    assert.notEqual(expectEnabled(await resolver(request)).submissionScopeId, first.submissionScopeId);
    actor = { tenantId: 'a', userId: 'other' };
    assert.notEqual(expectEnabled(await resolver(request)).submissionScopeId, first.submissionScopeId);
    actor = { tenantId: 'e\u0301', userId: 'user' };
    const decomposed = expectEnabled(await resolver(request));
    actor = { tenantId: '\u00e9', userId: 'user' };
    assert.equal(expectEnabled(await resolver(request)).submissionScopeId, decomposed.submissionScopeId);
    policy = { ...policy, apiAudience: 'other-api' };
    assert.notEqual(expectEnabled(await resolver(request)).submissionScopeId, decomposed.submissionScopeId);
    policy = { ...policy, apiAudience: 'novel-api', scopeSecret: `${secret}-rotated` };
    assert.notEqual(expectEnabled(await resolver(request)).submissionScopeId, decomposed.submissionScopeId);
  });

  it('keeps revision and expiry stable within a policy window and rotates them on expiry or policy change', async () => {
    let nowMs = Date.parse('2030-01-01T00:00:01.000Z');
    let policy = enabledPolicy();
    const resolver = createCapabilityPolicySnapshotResolver({
      policy: () => policy, runtimeEnvironment: 'development', providerMode: 'mock',
      requestContextResolver: async () => ({ tenantId: 'tenant-a', userId: 'user-a' }),
      now: () => new Date(nowMs)
    });
    const first = expectEnabled(await resolver(request));
    nowMs += 30_000;
    assert.deepEqual(expectEnabled(await resolver(request)), first);
    policy = { ...policy, policyRevision: 'policy-v2' };
    const revised = expectEnabled(await resolver(request));
    assert.equal(revised.submissionScopeId, first.submissionScopeId);
    assert.notEqual(revised.capabilityRevision, first.capabilityRevision);
    nowMs = Date.parse(first.expiresAt);
    const renewed = expectEnabled(await resolver(request));
    assert.notEqual(renewed.expiresAt, first.expiresAt);
    assert.notEqual(renewed.capabilityRevision, revised.capabilityRevision);
    policy = { ...policy, novelAsyncDispatchEnabled: false };
    assert.equal((await resolver(request) as { reasonCode: string }).reasonCode, 'POLICY_DISABLED');
  });

  it('binds a partial action allowlist to the capability revision and fences stale async submissions', async () => {
    let policy: AsyncTransportPolicy = { ...enabledPolicy(), enabledActions: ['direction_generate'] };
    const resolver = createCapabilityPolicySnapshotResolver({
      policy: () => policy, runtimeEnvironment: 'development', providerMode: 'mock',
      requestContextResolver: async () => ({ tenantId: 'tenant-a', userId: 'user-a' }),
      now: () => new Date('2030-01-01T00:00:10.000Z')
    });
    const first = expectEnabled(await resolver(request));
    assert.deepEqual(first.enabledActions, ['direction_generate']);
    const attestation = { expectedSubmissionScopeId: first.submissionScopeId,
      expectedCapabilityRevision: first.capabilityRevision,
      expectedCapabilityExpiresAt: first.expiresAt };
    assert.doesNotThrow(() => assertLegacyNovelSubmissionAllowed(first, {}));
    assert.throws(() => assertLegacyNovelSubmissionAllowed(first, attestation));
    policy = { ...policy, enabledActions: ['setting_generate'] };
    const second = expectEnabled(await resolver(request));
    assert.equal(second.submissionScopeId, first.submissionScopeId);
    assert.notEqual(second.capabilityRevision, first.capabilityRevision);
    assert.throws(() => assertAsyncCapabilitySubmission(second, attestation,
      new Date('2030-01-01T00:00:10.000Z')));
    policy = { ...policy, enabledActions: [] };
    assert.deepEqual(await resolver(request), { contractVersion: 'v1', enabled: false, reasonCode: 'POLICY_DISABLED' });
  });

  it('serves an enabled snapshot only with an injected trusted resolver, mock provider and valid scope config', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      videoRepository: createInMemoryVideoRepository(),
      aiProviderEnv: { AI_PROVIDER_MODE: 'mock' },
      asyncTransportPolicy: enabledPolicy(),
      requestContextResolver: async () => ({ tenantId: 'tenant-a', userId: 'user-a' }),
      now: () => new Date('2030-01-01T00:00:10.000Z')
    });
    try {
      const response = await app.inject({
        method: 'GET', url: '/novels/async-transport-capability',
        headers: { 'x-tenant-id': 'tenant-forged', 'x-user-id': 'user-forged' }
      });
      assert.equal(response.statusCode, 200);
      if (process.env.NODE_ENV && process.env.NODE_ENV !== 'development') {
        assert.deepEqual(response.json().data, {
          contractVersion: 'v1', enabled: false, reasonCode: 'UNSUPPORTED_ENVIRONMENT'
        });
        return;
      }
      const data = expectEnabled(response.json().data as NovelAsyncTransportCapabilityV1);
      assert.equal(data.expiresAt, '2030-01-01T00:01:00.000Z');
      assert.equal(repository.getGenerationTasks().length, 0);
      assert.equal(response.body.includes('tenant-a'), false);
      assert.equal(response.body.includes('user-a'), false);
      assert.equal(response.body.includes(secret), false);
      assert.equal(response.body.includes('tenant-forged'), false);
    } finally {
      await app.close();
    }
  });

  it('fails closed at the endpoint when the policy is enabled but no authenticated resolver is injected', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      videoRepository: createInMemoryVideoRepository(),
      aiProviderEnv: { AI_PROVIDER_MODE: 'mock' },
      asyncTransportPolicy: enabledPolicy()
    });
    try {
      const response = await app.inject({
        method: 'GET', url: '/novels/async-transport-capability',
        headers: { 'x-tenant-id': 'tenant-forged', 'x-user-id': 'user-forged' }
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json().data, {
        contractVersion: 'v1', enabled: false,
        reasonCode: process.env.NODE_ENV && process.env.NODE_ENV !== 'development'
          ? 'UNSUPPORTED_ENVIRONMENT' : 'TRUSTED_CONTEXT_MISSING'
      });
      assert.equal(repository.getGenerationTasks().length, 0);
    } finally {
      await app.close();
    }
  });
});
