import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FastifyRequest, LightMyRequestResponse } from 'fastify';
import type { NovelAsyncTransportAction, NovelAsyncTransportCapabilityV1 } from '@ai-shortvideo/shared';
import { buildApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { resolveNovelAsyncDispatchConfig } from '../../src/config/novelAsyncDispatch.js';
import { ISOLATED_E1_ACTIONS } from '../../src/config/isolatedNovelAsyncPolicy.js';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';
import { createInMemoryVideoRepository } from '../../src/modules/videos/repositories/inMemoryVideoRepository.js';
import { assertAsyncCapabilitySubmission, createCapabilityPolicySnapshotResolver,
  type AsyncTransportPolicy } from '../../src/modules/novels/services/asyncTransportCapability.js';

const actor = { tenantId: 'tenant-deployment', userId: 'user-deployment' };
const secret = 'durable-scope-secret-32-bytes-minimum';
const now = () => new Date('2030-01-01T00:00:10.000Z');
const forgedRequest = { headers: {
  'x-tenant-id': 'tenant-forged', 'x-user-id': 'user-forged',
  'x-durable-runtime-configured': 'true', 'x-novel-async-dispatch-enabled': 'true'
}, body: { durableRuntimeConfigured: true, novelAsyncDispatchEnabled: true } } as unknown as FastifyRequest;
const configured = (runtimeEnvironment = 'production', providerMode = 'deepseek') => resolveNovelAsyncDispatchConfig({
  flag: 'true', runtimeEnvironment, providerMode,
  databaseUrl: 'mysql://novel_service:private-password@db.invalid/novels',
  deploymentActor: actor, scopeSecret: secret, apiAudience: 'novel-api'
})!;

function expectEnabled(capability: NovelAsyncTransportCapabilityV1) {
  assert.equal(capability.enabled, true);
  if (!capability.enabled) throw new Error('Expected enabled capability');
  return capability;
}

function resolve(policy: AsyncTransportPolicy, runtimeEnvironment = 'production', providerMode = 'deepseek',
  requestContextResolver: Parameters<typeof createCapabilityPolicySnapshotResolver>[0]['requestContextResolver'] = async () => actor) {
  return createCapabilityPolicySnapshotResolver({ policy, runtimeEnvironment, providerMode, requestContextResolver, now })(forgedRequest);
}

describe('trusted durable async capability policy', () => {
  for (const runtimeEnvironment of ['development', 'production']) {
    for (const providerMode of ['mock', 'deepseek']) {
      it(`allows ${runtimeEnvironment}/${providerMode} only with the explicit server declaration`, async () => {
        const policy = configured(runtimeEnvironment, providerMode).asyncTransportPolicy;
        const capability = expectEnabled(await resolve(policy, runtimeEnvironment, providerMode));
        assert.deepEqual(capability.enabledActions, ISOLATED_E1_ACTIONS);
        for (const durableRuntimeConfigured of [undefined, false, 'true' as unknown as boolean]) {
          const legacy = await resolve({ ...policy, durableRuntimeConfigured }, runtimeEnvironment, providerMode);
          if (runtimeEnvironment === 'development' && providerMode === 'mock') {
            assert.equal(legacy.enabled, true);
          } else {
            assert.deepEqual(legacy, { contractVersion: 'v1', enabled: false, reasonCode: 'UNSUPPORTED_ENVIRONMENT' });
          }
        }
      });
    }
  }

  it('keeps the legacy development/mock wildcard and chapter-plan behavior unchanged', async () => {
    const legacy: AsyncTransportPolicy = { novelAsyncDispatchEnabled: true, scopeSecret: secret, apiAudience: 'novel-api' };
    assert.equal(expectEnabled(await resolve(legacy, 'development', 'mock')).enabledActions, undefined);
    assert.deepEqual(expectEnabled(await resolve({ ...legacy, enabledActions: ['chapter_plan_generate'] },
      'development', 'mock')).enabledActions, ['chapter_plan_generate']);
    assert.deepEqual(await resolve({ ...legacy, enabledActions: [] }, 'development', 'mock'),
      { contractVersion: 'v1', enabled: false, reasonCode: 'POLICY_DISABLED' });
  });

  it('cannot bypass the off switch or unsupported runtimes/providers', async () => {
    const policy = configured().asyncTransportPolicy;
    assert.deepEqual(await resolve({ ...policy, novelAsyncDispatchEnabled: false }),
      { contractVersion: 'v1', enabled: false, reasonCode: 'POLICY_DISABLED' });
    for (const [runtimeEnvironment, providerMode] of [
      ['test', 'mock'], ['staging', 'deepseek'], ['production', 'openai'], ['development', ''], ['production', 'deepseak']
    ]) {
      assert.deepEqual(await resolve(policy, runtimeEnvironment, providerMode),
        { contractVersion: 'v1', enabled: false, reasonCode: 'UNSUPPORTED_ENVIRONMENT' });
    }
  });

  it('still fails closed for missing trusted actor, scope secret and API audience', async () => {
    const policy = configured().asyncTransportPolicy;
    for (const requestContextResolver of [async () => null,
      async () => ({ ...actor, tenantId: 'tenant_default' }),
      async () => ({ ...actor, userId: 'mock_actor' }),
      async () => { throw new Error('private authentication error'); }]) {
      assert.deepEqual(await resolve(policy, 'production', 'deepseek', requestContextResolver),
        { contractVersion: 'v1', enabled: false, reasonCode: 'TRUSTED_CONTEXT_MISSING' });
    }
    const absentActor = createCapabilityPolicySnapshotResolver({ policy, runtimeEnvironment: 'production', providerMode: 'deepseek', now });
    assert.deepEqual(await absentActor(forgedRequest),
      { contractVersion: 'v1', enabled: false, reasonCode: 'TRUSTED_CONTEXT_MISSING' });
    for (const scopeSecret of [undefined, '', 'a'.repeat(31), new Uint8Array(31)]) {
      assert.deepEqual(await resolve({ ...policy, scopeSecret }),
        { contractVersion: 'v1', enabled: false, reasonCode: 'SCOPE_SECRET_MISSING' });
    }
    for (const apiAudience of [undefined, '', '  ']) {
      assert.deepEqual(await resolve({ ...policy, apiAudience }),
        { contractVersion: 'v1', enabled: false, reasonCode: 'API_AUDIENCE_MISSING' });
    }
  });

  it('requires a nonempty explicit E1 allowlist and rejects E2/E3 or malformed actions', async () => {
    const policy = configured().asyncTransportPolicy;
    for (const enabledActions of [undefined, []]) {
      assert.deepEqual(await resolve({ ...policy, enabledActions }),
        { contractVersion: 'v1', enabled: false, reasonCode: 'POLICY_DISABLED' });
    }
    for (const action of ['chapter_plan_generate', 'chapter_body_generate', 'body_batch_generate', 'unknown']) {
      const enabledActions = [...ISOLATED_E1_ACTIONS, action] as NovelAsyncTransportAction[];
      await assert.rejects(resolve({ ...policy, enabledActions }), /action policy/);
    }
    await assert.rejects(resolve({ ...policy, enabledActions: ['direction_generate', 'direction_generate'] }), /action policy/);
    await assert.rejects(resolve({ ...policy, enabledActions: 'direction_generate' as unknown as NovelAsyncTransportAction[] }), /action policy/);
  });

  it('binds the durable declaration to the revision and rechecks dynamic server policy', async () => {
    let policy = configured('development', 'mock').asyncTransportPolicy;
    const resolver = createCapabilityPolicySnapshotResolver({ policy: () => policy,
      runtimeEnvironment: 'development', providerMode: 'mock', requestContextResolver: async () => actor, now });
    const first = expectEnabled(await resolver(forgedRequest));
    policy = { ...policy, durableRuntimeConfigured: false };
    const legacy = expectEnabled(await resolver(forgedRequest));
    assert.equal(legacy.submissionScopeId, first.submissionScopeId);
    assert.notEqual(legacy.capabilityRevision, first.capabilityRevision);
    assert.throws(() => assertAsyncCapabilitySubmission(legacy, {
      expectedSubmissionScopeId: first.submissionScopeId,
      expectedCapabilityRevision: first.capabilityRevision,
      expectedCapabilityExpiresAt: first.expiresAt
    }, now()));
    policy = { ...policy, novelAsyncDispatchEnabled: false };
    assert.equal((await resolver(forgedRequest)).enabled, false);
  });
});

describe('buildApp durable capability endpoint', () => {
  for (const runtimeEnvironment of ['development', 'production'] as const) {
    for (const providerMode of ['mock', 'deepseek']) {
      it(`exposes exactly E1 for ${runtimeEnvironment}/${providerMode} without network or model calls`, async () => {
        const previousRuntime = env.NODE_ENV;
        env.NODE_ENV = runtimeEnvironment;
        const config = configured(runtimeEnvironment, providerMode);
        const repository = createInMemoryNovelRepository({ enabledLeasedTaskTypes: config.enabledLeasedTaskTypes });
        let providerCalls = 0;
        let app: Awaited<ReturnType<typeof buildApp>> | undefined;
        try {
          app = await buildApp({ logger: false, novelRepository: repository,
            videoRepository: createInMemoryVideoRepository(), enableAcceptanceSeeds: false,
            aiProviderEnv: { AI_PROVIDER_MODE: providerMode },
            llmClient: { chat: async () => { providerCalls += 1; throw new Error('Unexpected model call'); } },
            requestContextResolver: async () => actor, asyncTransportPolicy: config.asyncTransportPolicy, now });
          const response = await app.inject({ method: 'GET', url: '/novels/async-transport-capability', headers: forgedRequest.headers });
          assert.equal(response.statusCode, 200);
          const capability = expectEnabled(response.json().data);
          assert.deepEqual(capability.enabledActions, ISOLATED_E1_ACTIONS);
          assert.equal(capability.enabledActions?.length, 13);
          for (const privateValue of [secret, actor.tenantId, actor.userId, 'tenant-forged', 'private-password', 'durableRuntimeConfigured']) {
            assert.equal(response.body.includes(privateValue), false);
          }
          for (const url of ['/novels/novel-a/chapter-plans/generate',
            '/novels/novel-a/chapters/chapter-a/generate', '/novels/novel-a/chapters/batch-generate']) {
            const chapterPlan = url.endsWith('/chapter-plans/generate');
            const blocked: LightMyRequestResponse = await app.inject({ method: 'POST', url,
              headers: { 'idempotency-key': 'forbidden-e2-e3-request' }, payload: chapterPlan ? {
                expectedSubmissionScopeId: capability.submissionScopeId,
                expectedCapabilityRevision: capability.capabilityRevision,
                expectedCapabilityExpiresAt: capability.expiresAt
              } : { strategySnapshotId: 'strategy-a', expectedStrategySnapshotVersion: 1 } });
            assert.ok(blocked.statusCode >= 400, blocked.body);
            assert.equal(blocked.json().error.code, chapterPlan ? 'GATE_BLOCKED' : 'CONFIG_MISSING');
          }
          assert.equal(providerCalls, 0);
          assert.equal(repository.getGenerationTasks().length, 0);
        } finally {
          await app?.close();
          env.NODE_ENV = previousRuntime;
        }
      });
    }
  }

  it('queues an E1 request in production/deepseek without executing a provider in the HTTP request', async () => {
    const previousRuntime = env.NODE_ENV;
    env.NODE_ENV = 'production';
    const config = configured();
    const repository = createInMemoryNovelRepository({ enabledLeasedTaskTypes: config.enabledLeasedTaskTypes });
    repository.getAuthoritativeTaskTime = async () => now();
    let providerCalls = 0;
    let app: Awaited<ReturnType<typeof buildApp>> | undefined;
    try {
      app = await buildApp({ logger: false, novelRepository: repository,
        videoRepository: createInMemoryVideoRepository(), enableAcceptanceSeeds: false,
        aiProviderEnv: { AI_PROVIDER_MODE: 'deepseek' },
        llmClient: { chat: async () => { providerCalls += 1; throw new Error('Unexpected model call'); } },
        requestContextResolver: async () => actor, asyncTransportPolicy: config.asyncTransportPolicy, now });
      const draft = await app.inject({ method: 'POST', url: '/novels/drafts', payload: { title: 'Durable E1 queue' } });
      assert.equal(draft.statusCode, 201);
      const capabilityResponse = await app.inject({ method: 'GET', url: '/novels/async-transport-capability' });
      const capability = expectEnabled(capabilityResponse.json().data);
      const submission = {
        method: 'POST' as const, url: `/novels/${draft.json().data.id}/directions/generate`,
        headers: { 'idempotency-key': 'durable-e1-direction-request' }, payload: {
          expectedSubmissionScopeId: capability.submissionScopeId,
          expectedCapabilityRevision: capability.capabilityRevision,
          expectedCapabilityExpiresAt: capability.expiresAt
        }
      };
      const response = await app.inject(submission);
      assert.equal(response.statusCode, 202, response.body);
      assert.equal(response.json().data.kind, 'accepted');
      assert.equal(response.json().data.action, 'direction_generate');
      const replay = await app.inject(submission);
      assert.equal(replay.statusCode, 202, replay.body);
      assert.equal(replay.json().data.taskId, response.json().data.taskId);
      assert.equal(replay.json().data.reused, true);
      assert.equal(repository.getGenerationTasks().length, 1);
      assert.equal(providerCalls, 0);
    } finally {
      await app?.close();
      env.NODE_ENV = previousRuntime;
    }
  });

  it('ignores client opt-in assertions when the trusted server policy is absent', async () => {
    const app = await buildApp({ logger: false, novelRepository: createInMemoryNovelRepository(),
      videoRepository: createInMemoryVideoRepository(), enableAcceptanceSeeds: false,
      aiProviderEnv: { AI_PROVIDER_MODE: 'mock' }, requestContextResolver: async () => actor });
    try {
      const response = await app.inject({ method: 'GET', url: '/novels/async-transport-capability', headers: forgedRequest.headers });
      assert.deepEqual(response.json().data, { contractVersion: 'v1', enabled: false, reasonCode: 'POLICY_DISABLED' });
    } finally {
      await app.close();
    }
  });
});
