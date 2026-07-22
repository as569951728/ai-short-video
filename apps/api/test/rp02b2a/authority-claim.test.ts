import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, before, describe, it } from 'node:test';
import {
  ErrorCode,
  NovelCreationStage,
  NovelLifecycleStatus,
  StageStatus,
  TaskStatus,
  canonicalExecutionJson,
  isPlaceholderActorIdentifier,
  isPlaceholderAuthorityIdentifier,
  type AuthoritySourceIdentityV1,
  type ExecutionEnvelopeV1_1,
  type NovelProviderAction
} from '@ai-shortvideo/shared';
import { buildApp } from '../../src/app.js';
import { BusinessError } from '../../src/shared/errors.js';
import { validateExecutionEnvelopeV1_1ForTask } from '../../src/modules/novels/domain/executionContract.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';
import { createActorScopedIdempotencyToken, executeClaimedGeneration, hashCanonicalJson } from '../../src/modules/novels/services/taskClaim.js';
import { createDefaultRequestContext } from '../../src/modules/novels/services/novelService.js';
import { ACTIONS, ManualClock, ZERO_SIDE_EFFECTS, actionSpec, createAuthorityFixture, createRouteAuthorityFixture, sideEffects, snapshotAuthorityFixtureState, snapshotRouteSideEffects } from './fixtures.js';
async function executeFixture(
  fixture: Awaited<ReturnType<typeof createAuthorityFixture>>,
  input: {
    key?: string;
    context?: typeof fixture.context;
    barrier?: () => void;
    effectiveRequest?: unknown;
    sourceVersionRefs?: unknown;
    providerCalls: { value: number };
    prepare?: (task: Parameters<NonNullable<Parameters<typeof executeClaimedGeneration>[0]['prepare']>>[0]) => Promise<void>;
  }
) {
  return executeClaimedGeneration({
    action: fixture.action,
    repository: fixture.repository,
    novel: fixture.novel,
    objectId: fixture.objectId,
    idempotencyKey: input.key ?? 'authority-key-0001',
    effectiveRequest: input.effectiveRequest ?? fixture.effectiveRequest,
    sourceVersionRefs: input.sourceVersionRefs ?? fixture.sourceVersionRefs,
    context: input.context ?? fixture.context,
    now: fixture.clock?.now ?? (() => new Date('2026-07-15T00:00:00.000Z')),
    authorityBarrier: input.barrier,
    prepare: input.prepare,
    provider: async () => { input.providerCalls.value += 1; return { ok: true }; },
    finalize: async () => ({ ok: true })
  });
}
describe('RP-02B2a2 authoritative claim', () => {
  it('fails startup before listen for placeholder deployment actors', () => {
    const entrypoint = new URL('../../src/main.ts', import.meta.url).href;
    for (const userId of ['policy_default_v1', 'user_default', 'legacy_worker', 'synthetic_actor', 'mock_actor', 'placeholder_actor', '']) {
      const result = spawnSync(process.execPath, ['--import', 'tsx', '--eval', `import(${JSON.stringify(entrypoint)})`], {
        env: { ...process.env, DEPLOYMENT_ACTOR_TENANT_ID: 'tenant_real', DEPLOYMENT_ACTOR_USER_ID: userId }, encoding: 'utf8'
      });
      assert.notEqual(result.status, 0, userId); assert.match(result.stderr, userId ? /DEPLOYMENT_ACTOR_TENANT_ID and DEPLOYMENT_ACTOR_USER_ID are required/ : /DEPLOYMENT_ACTOR_USER_ID/, userId);
    }
  });
  for (const [actionIndex, action] of ACTIONS.entries()) {
    describe(`authority matrix: ${action}`, () => {
      let fixture: Awaited<ReturnType<typeof createRouteAuthorityFixture>>;
      before(async () => { fixture = await createRouteAuthorityFixture(action); });
      after(async () => { await fixture.app.close(); });
      for (const [phaseIndex, phase] of (['before_claim', 'after_first_authority_read', 'after_claim'] as const).entries()) {
        for (const [mutationIndex, mutation] of (['missing', 'changed'] as const).entries()) {
          it(`${action}:${phase}:${mutation}:authority`, async () => {
            const label = `${action}:${phase}:${mutation}`;
            const beforeEffects = await snapshotRouteSideEffects(fixture);
            const beforeBusinessState = await snapshotNovelBusinessState(fixture);
            const beforeTaskIds = new Set(fixture.repository.getGenerationTasks().map((task) => task.id));
            const response = await fixture.run(phase, mutation, actionIndex * 6 + phaseIndex * 2 + mutationIndex + 1);
            assert.equal(response.statusCode, 409, `${label}:${response.body}`);
            assert.equal(response.json().error.code, ErrorCode.VersionConflict, label);
            assert.equal(response.json().error.details.code, 'SOURCE_STALE', `${label}:source stale`);
            assert.equal(fixture.authorityReads(), phase === 'before_claim' ? 1 : 2, `${label}:loader`);
            const snapshots = fixture.authoritySnapshots();
            for (const snapshot of snapshots.filter((item) => item !== null)) {
              assert.deepEqual(
                [snapshot.action, snapshot.tenantId, snapshot.novelId, snapshot.objectId],
                [action, 'tenant_test', fixture.novelId, fixture.authorityObjectId],
                `${label}:authority identity`
              );
            }
            if (phase === 'after_first_authority_read' && mutation === 'changed') {
              assert.ok(snapshots[0] && snapshots[1], `${label}:non-null snapshots`);
              assert.notEqual(hashCanonicalJson(snapshots[1]), hashCanonicalJson(snapshots[0]), `${label}:snapshot hash changed`);
            }
            if (phase === 'after_first_authority_read' && mutation === 'missing') {
              assert.ok(snapshots[0], `${label}:T0 snapshot`);
              assert.equal(snapshots[1], null, `${label}:missing snapshot`);
            }
            if (phase === 'after_claim') {
              assert.ok(snapshots[0] && snapshots[1], `${label}:pre-claim snapshots`);
              assert.equal(hashCanonicalJson(snapshots[1]), hashCanonicalJson(snapshots[0]), `${label}:authority stable through claim`);
              const afterEffects = await snapshotRouteSideEffects(fixture);
              assertZeroDelta(beforeEffects, afterEffects, label);
              const claimedTasks = fixture.repository.getGenerationTasks().filter((task) => !beforeTaskIds.has(task.id));
              assert.equal(claimedTasks.length, 0, `${label}:no visible claimed task`);
              assert.equal(fixture.providerInvocations().length, 0, `${label}:provider not invoked`);
            } else {
              assertZeroDelta(beforeEffects, await snapshotRouteSideEffects(fixture), label);
            }
            assert.deepEqual(await snapshotNovelBusinessState(fixture), beforeBusinessState, `${label}:business state unchanged`);
          });
        }
      }
      it(`${action}:http_200:authoritative_provider_projection`, async () => {
        const response = await fixture.runSuccess(`a2-success-${action}`);
        assert.equal(response.statusCode, 200, `${action}:${response.body}`);
        assert.equal(response.json().success, true, action);
        assert.equal(fixture.authorityReads(), 2, `${action}:authority reads`);
        const snapshots = fixture.authoritySnapshots();
        assert.ok(snapshots[0] && snapshots[1], `${action}:authority snapshots`);
        assert.equal(hashCanonicalJson(snapshots[1]), hashCanonicalJson(snapshots[0]), `${action}:stable authority`);
        const invocations = fixture.providerInvocations();
        assert.ok(invocations.length > 0, `${action}:provider invoked`);
        assert.deepEqual([...new Set(invocations.map((item) => item.action))], [action], `${action}:provider action`);
        for (const invocation of invocations) {
          assert.equal(hasNestedKey(invocation.input, 'sourceIdentities'), false, `${action}:authority refs stay outside provider DTO`);
          for (const rawEntityKey of ['tenantId', 'createdAt', 'updatedAt', 'deletedAt', 'sourceTaskId', 'metadata']) {
            assert.equal(hasNestedKey(invocation.input, rawEntityKey), false, `${action}:no raw repository ${rawEntityKey}`);
          }
        }
        const task = fixture.repository.getGenerationTasks().findLast((item) =>
          (item.executionEnvelopeJson as { action?: unknown } | null)?.action === action
        );
        assert.ok(task, `${action}:task`);
        const envelope = validateExecutionEnvelopeV1_1ForTask(task);
        assert.deepEqual([task.tenantId, task.createdBy, envelope.tenantId, envelope.auditContext.requestedByUserId], ['tenant_test', 'user_test', 'tenant_test', 'user_test'], `${action}:non-placeholder actor`);
        assert.equal(envelope.sourceVersionRefs.authoritySnapshotHash, hashCanonicalJson(snapshots[0]), `${action}:authority projection`);
        assert.equal(envelope.sourceVersionRefs.providerInputSnapshotHash, hashCanonicalJson(providerProjection(action, invocations)), `${action}:provider projection`);
        assertActionAuthorityRefs(action, envelope, snapshots[0]!, providerProjection(action, invocations));
        await assertRepositoryAuthorityParity(fixture, envelope);
        await assertMalformedLegacyReplayMatrix(fixture, task, envelope, `a2-success-${action}`);
        await assertStaleLegacyReplay(fixture, task, envelope, `a2-success-${action}`);
      });
    });
  }
  for (const action of ACTIONS) {
    it(`${action}:isolated_missing_authority_has_absolute_zero_provider_task_intent_and_side_effects`, async () => {
      const fixture = await createAuthorityFixture(action);
      const calls = { value: 0 };
      fixture.authority.remove();
      const before = await snapshotAuthorityFixtureState(fixture, calls.value);
      await assert.rejects(
        executeFixture(fixture, { providerCalls: calls, key: `missing-authority-${action}` }),
        (error: unknown) => error instanceof BusinessError && error.code === ErrorCode.VersionConflict
      );
      assert.deepEqual(await snapshotAuthorityFixtureState(fixture, calls.value), before);
    });
  }
  it('does not record provider dispatch when prepare fails', async () => {
    const fixture = await createAuthorityFixture('direction_generate');
    const calls = { value: 0 };
    await assert.rejects(executeFixture(fixture, {
      providerCalls: calls,
      key: 'prepare-failure',
      prepare: async () => { throw new Error('prepare failed'); }
    }), /prepare failed/);
    const task = fixture.repository.getGenerationTasks().at(-1);
    assert.ok(task);
    assert.deepEqual([calls.value, task.status, task.failureCategory], [0, TaskStatus.Failed, 'save_failed']);
    assert.deepEqual([task.providerAttemptPhase, task.providerDispatchedAt], [null, null]);
  });
  describe('post-claim authority fences', () => {
    let fixture: Awaited<ReturnType<typeof createRouteAuthorityFixture>>;
    before(async () => { fixture = await createRouteAuthorityFixture('outline_generate'); });
    after(async () => { await fixture.app.close(); });
    it('rechecks authority before provider dispatch with provider=0 and candidate=0', async () => {
      const entered = deferred(), release = deferred();
      const originalFence = fixture.repository.fenceGenerationAuthority.bind(fixture.repository);
      fixture.repository.fenceGenerationAuthority = async (input) => {
        if (input.phase === 'prepare') { entered.resolve(); await release.promise; }
        return originalFence(input);
      };
      const beforeCandidates = fixture.repository.getCreativeVersions().length;
      const novel = await fixture.repository.findById('tenant_test', fixture.novelId);
      assert.ok(novel);
      const previousTitle = novel.title;
      try {
        const responsePromise = fixture.runSuccess('dispatch-fence-stale');
        await entered.promise;
        novel.title = `${previousTitle} changed before dispatch`;
        release.resolve();
        const response = await responsePromise;
        assertSourceStaleResponse(response.statusCode, response.json());
        assert.equal(fixture.providerInvocations().length, 0);
        assert.equal(fixture.repository.getCreativeVersions().length, beforeCandidates);
        assertSourceStaleTerminalTask(fixture.repository.getGenerationTasks());
      } finally {
        novel.title = previousTitle;
        release.resolve();
        fixture.repository.fenceGenerationAuthority = originalFence;
      }
    });
    it('fences body-batch authority before prepare can mutate task, novel, or batch state', async () => {
      const bodyFixture = await createRouteAuthorityFixture('body_batch_generate');
      const entered = deferred();
      const release = deferred();
      const originalFence = bodyFixture.repository.fenceGenerationAuthority.bind(bodyFixture.repository);
      bodyFixture.repository.fenceGenerationAuthority = async (input) => {
        if (input.phase === 'prepare') {
          entered.resolve();
          await release.promise;
        }
        return originalFence(input);
      };
      const novel = await bodyFixture.repository.findById('tenant_test', bodyFixture.novelId);
      assert.ok(novel);
      const previousTitle = novel.title;
      const beforeNovel = await snapshotNovelBusinessState(bodyFixture);
      const beforeBatches = structuredClone(bodyFixture.repository.getBodyBatches());
      try {
        const responsePromise = bodyFixture.runSuccess('body-batch-dispatch-fence-stale');
        await entered.promise;
        novel.title = `${previousTitle} changed before body prepare`;
        release.resolve();
        const response = await responsePromise;
        assertSourceStaleResponse(response.statusCode, response.json());
        assert.equal(bodyFixture.providerInvocations().length, 0);
        const staleTask = bodyFixture.repository.getGenerationTasks().findLast((task) => task.failureCategory === 'source_stale');
        assert.ok(staleTask);
        assert.deepEqual({ progress: staleTask.progress, resultObjectType: staleTask.resultObjectType }, { progress: 0, resultObjectType: null });
        assert.deepEqual(bodyFixture.repository.getBodyBatches(), beforeBatches);
      } finally {
        novel.title = previousTitle; release.resolve();
        bodyFixture.repository.fenceGenerationAuthority = originalFence;
        assert.deepEqual(await snapshotNovelBusinessState(bodyFixture), beforeNovel);
        await bodyFixture.app.close();
      }
    });
    it('rechecks authority after provider return with provider=1 and candidate=0', async () => {
      const entered = deferred();
      const release = deferred();
      const originalFence = fixture.repository.fenceGenerationAuthority.bind(fixture.repository);
      fixture.repository.fenceGenerationAuthority = async (input) => {
        if (input.phase === 'result_finalize') {
          entered.resolve();
          await release.promise;
        }
        return originalFence(input);
      };
      const beforeCandidates = fixture.repository.getCreativeVersions().length;
      const novel = await fixture.repository.findById('tenant_test', fixture.novelId);
      assert.ok(novel);
      const previousTitle = novel.title;
      try {
        const responsePromise = fixture.runSuccess('finalize-fence-stale');
        await entered.promise;
        assert.equal(fixture.providerInvocations().length, 1);
        novel.title = `${previousTitle} changed after provider`;
        release.resolve();
        const response = await responsePromise;
        assertSourceStaleResponse(response.statusCode, response.json());
        assert.equal(fixture.providerInvocations().length, 1);
        assert.equal(fixture.repository.getCreativeVersions().length, beforeCandidates);
        assertSourceStaleTerminalTask(fixture.repository.getGenerationTasks());
      } finally {
        novel.title = previousTitle;
        release.resolve();
        fixture.repository.fenceGenerationAuthority = originalFence;
      }
    });
  });
  it('blocks authority adoption after the finalize fence passes but before candidate persistence', async () => {
    const fixture = await createRouteAuthorityFixture('direction_generate');
    try {
      const initial = await fixture.runSuccess('adoption-guard-seed');
      assert.equal(initial.statusCode, 200, initial.body);
      const candidate = fixture.repository.getCreativeVersions().find((version) =>
        version.novelId === fixture.novelId && version.objectType === 'direction' && version.status === 'candidate'
      );
      assert.ok(candidate);
      const entered = deferred();
      const release = deferred();
      const originalFinalize = fixture.repository.createDirectionCandidates.bind(fixture.repository);
      fixture.repository.createDirectionCandidates = async (input) => {
        entered.resolve();
        await release.promise;
        return originalFinalize(input);
      };
      try {
        const generationPromise = fixture.runSuccess('adoption-guard-active');
        await entered.promise;
        const adoption = await fixture.app.inject({
          method: 'POST',
          url: `/novels/${fixture.novelId}/directions/${candidate.id}/adopt`,
          payload: { reason: '验证 active claim 与采用操作互斥。' }
        });
        assert.equal(adoption.statusCode, 409, adoption.body);
        assert.equal(adoption.json().error.code, ErrorCode.ConflictTaskExists);
        const novel = await fixture.repository.findById('tenant_test', fixture.novelId);
        assert.equal(novel?.currentDirectionVersionId, null);
        release.resolve();
        assert.equal((await generationPromise).statusCode, 200);
      } finally {
        release.resolve();
        fixture.repository.createDirectionCandidates = originalFinalize;
      }
    } finally {
      await fixture.app.close();
    }
  });
  for (const action of ACTIONS) {
    for (const missingKey of Object.keys(actionSpec(action, 'novel').sourceVersionRefs)) {
      it(`${action}:missing_${missingKey}_fails_before_authority_provider_claim_or_any_repository_write`, async () => {
        const fixture = await createAuthorityFixture(action);
        const calls = { value: 0 };
        const refs = structuredClone(fixture.sourceVersionRefs) as Record<string, unknown>;
        delete refs[missingKey];
        const before = await snapshotAuthorityFixtureState(fixture, calls.value);
        await assert.rejects(
          executeFixture(fixture, { providerCalls: calls, key: `missing-${missingKey}-${action}`, sourceVersionRefs: refs }),
          (error: unknown) => error instanceof BusinessError
            && error.code === ErrorCode.VersionConflict
            && (error.details as { code?: unknown }).code === 'SOURCE_STALE'
        );
        assert.equal(fixture.authority.loadCount, 0);
        assert.deepEqual(await snapshotAuthorityFixtureState(fixture, calls.value), before);
      });
    }
  }
  it('stale_replay_revalidates_persisted_T0_authority_and_fails_without_provider_task_or_intent_delta', async () => {
    const fixture = await createAuthorityFixture('direction_generate');
    const clock = new ManualClock(new Date('2026-07-15T00:00:00.000Z'));
    const calls = { value: 0 };
    const first = await executeFixture({ ...fixture, action: 'direction_generate', clock }, { providerCalls: calls, key: 'persisted-time-key' });
    const envelope = validateExecutionEnvelopeV1_1ForTask(first.task);
    const bytes = canonicalExecutionJson(envelope);
    Object.assign(first.task, { status: TaskStatus.WaitingConfirmation, activeClaimKey: null });
    fixture.authority.invalidateSource();
    const before = sideEffects(fixture.repository, calls.value, fixture.counters.intent);
    const authorityLoads = fixture.authority.loadCount;
    clock.set('2026-07-15T00:05:00.000Z');
    await assert.rejects(
      executeFixture({ ...fixture, action: 'direction_generate', clock }, { providerCalls: calls, key: 'persisted-time-key' }),
      (error: unknown) => error instanceof BusinessError && error.code === ErrorCode.VersionConflict
    );
    assert.equal((first.task.executionEnvelopeJson as ExecutionEnvelopeV1_1).auditContext.requestedAt, '2026-07-15T00:00:00.000Z');
    assert.equal(canonicalExecutionJson(first.task.executionEnvelopeJson), bytes);
    assert.equal(fixture.authority.loadCount, authorityLoads + 1);
    assert.deepEqual(sideEffects(fixture.repository, calls.value, fixture.counters.intent), before);
  });
  it('different_request_wins_over_mutable_authority_and_has_zero_delta', async () => {
    const fixture = await createAuthorityFixture('direction_generate');
    const calls = { value: 0 };
    await executeFixture({ ...fixture, action: 'direction_generate' }, { providerCalls: calls, key: 'request-priority-key' });
    const before = sideEffects(fixture.repository, calls.value, fixture.counters.intent);
    const authorityLoads = fixture.authority.loadCount;
    fixture.authority.remove();
    await assert.rejects(
      executeFixture({ ...fixture, action: 'direction_generate' }, {
        providerCalls: calls,
        key: 'request-priority-key',
        effectiveRequest: { regenerateReason: '使用不同请求验证冲突优先级' }
      }),
      (error: unknown) => error instanceof BusinessError && error.code === ErrorCode.IdempotencyConflict
    );
    assert.equal(fixture.authority.loadCount, authorityLoads);
    assert.deepEqual(sideEffects(fixture.repository, calls.value, fixture.counters.intent), before);
  });
  it('trusted_actor_is_identical_across_claim_and_envelope_no_raw_key_or_default_fallback', async () => {
    const fixture = await createAuthorityFixture('direction_generate');
    const calls = { value: 0 };
    const rawKey = 'actor-scope-key-0001';
    const result = await executeFixture({ ...fixture, action: 'direction_generate' }, { providerCalls: calls, key: rawKey });
    const envelope = validateExecutionEnvelopeV1_1ForTask(result.task);
    assert.equal(result.task.tenantId, fixture.context.tenantId);
    assert.equal(result.task.createdBy, fixture.context.userId);
    assert.equal(envelope.tenantId, fixture.context.tenantId);
    assert.equal(envelope.auditContext.requestedByUserId, fixture.context.userId);
    assert.notEqual(result.task.idempotencyToken, rawKey);
    assert.equal(result.task.idempotencyToken, createActorScopedIdempotencyToken({
      tenantId: fixture.context.tenantId,
      userId: fixture.context.userId,
      action: 'direction_generate',
      objectId: fixture.novel.id,
      rawIdempotencyKey: rawKey
    }));
    await assert.rejects(
      executeFixture({ ...fixture, action: 'direction_generate' }, {
        providerCalls: calls,
        context: createDefaultRequestContext('default-request'),
        key: 'default-context-key'
      }),
      (error: unknown) => error instanceof BusinessError && error.code === ErrorCode.Unauthorized
    );
  });
  it('same_key_is_isolated_by_user_and_by_two_real_tenant_claims', async () => {
    const fixture = await createAuthorityFixture('direction_generate');
    const calls = { value: 0 };
    const key = 'identity-isolation-key';
    const first = await executeFixture({ ...fixture, action: 'direction_generate' }, { providerCalls: calls, key });
    Object.assign(first.task, { status: 'completed', activeClaimKey: null });
    const userB = { ...fixture.context, userId: 'user_b', requestId: 'request_b' };
    const second = await executeFixture({ ...fixture, action: 'direction_generate' }, { providerCalls: calls, key, context: userB });
    assert.notEqual(second.task.id, first.task.id);
    assert.notEqual(second.task.idempotencyToken, first.task.idempotencyToken);
    const sharedRepository = createInMemoryNovelRepository();
    const contexts = ['alpha', 'beta'].map((tenant) => ({
      tenantId: `tenant_${tenant}`, userId: 'user_shared', requestId: `request_tenant_${tenant}`
    }));
    const drafts = await Promise.all(contexts.map((context, index) => sharedRepository.createDraft({
      request: { title: `shared tenant ${index + 1}` }, context, now: new Date('2026-07-15T00:00:00.000Z')
    })));
    drafts.forEach(({ novel }) => Object.assign(novel, {
      lifecycleStatus: NovelLifecycleStatus.Active, creationStage: NovelCreationStage.Body, stageStatus: StageStatus.Processing
    }));
    const claimForTenant = (index: number) => executeClaimedGeneration({
      action: 'direction_generate', repository: sharedRepository, novel: drafts[index]!.novel,
      objectId: drafts[index]!.novel.id, idempotencyKey: key, effectiveRequest: {},
      sourceVersionRefs: { currentDirectionVersionId: null },
      context: contexts[index]!, now: () => new Date('2026-07-15T00:00:00.000Z'),
      provider: async () => ({ ok: true }), finalize: async () => ({ ok: true })
    });
    const claimA = await claimForTenant(0);
    const claimB = await claimForTenant(1);
    assert.deepEqual([claimA.task.tenantId, claimB.task.tenantId], ['tenant_alpha', 'tenant_beta']);
    assert.notEqual(claimA.task.idempotencyToken, claimB.task.idempotencyToken);
    assert.deepEqual(sharedRepository.getGenerationTasks()
      .filter((task) => [claimA.task.id, claimB.task.id].includes(task.id)).map((task) => task.tenantId).sort(), ['tenant_alpha', 'tenant_beta']);
    assert.deepEqual(
      [validateExecutionEnvelopeV1_1ForTask(claimA.task).tenantId, validateExecutionEnvelopeV1_1ForTask(claimB.task).tenantId],
      ['tenant_alpha', 'tenant_beta']
    );
  });
  it('resolver_missing_null_blank_and_throw_map_to_401_or_503_and_forged_headers_do_not_override', async () => {
    for (const [resolver, status, code] of [
      [null, 401, ErrorCode.Unauthorized],
      [async () => null, 401, ErrorCode.Unauthorized],
      [async () => ({ tenantId: ' ', userId: ' ' }), 401, ErrorCode.Unauthorized],
      [async () => { throw new Error('resolver down'); }, 503, ErrorCode.DependencyUnavailable]
    ] as const) {
      const app = await buildApp({ logger: false, requestContextResolver: resolver });
      const response = await app.inject({ method: 'POST', url: '/novels/drafts', payload: { title: 'actor test' } });
      assert.equal(response.statusCode, status);
      assert.equal(response.json().error.code, code);
      const taskResponse = await app.inject({ method: 'GET', url: '/tasks/task_missing' });
      assert.equal(taskResponse.statusCode, status);
      assert.equal(taskResponse.json().error.code, code);
      await app.close();
    }
    const fixture = await createAuthorityFixture('direction_generate');
    const app = await buildApp({
      logger: false,
      novelRepository: fixture.repository,
      requestContextResolver: async () => ({ tenantId: 'tenant_server', userId: 'user_server' })
    });
    const response = await app.inject({
      method: 'POST',
      url: '/novels/drafts',
      headers: { 'x-tenant-id': 'tenant_forged', 'x-user-id': 'user_forged', cookie: 'tenantId=tenant_cookie' },
      payload: { title: 'trusted resolver wins', tenantId: 'tenant_body', userId: 'user_body' }
    });
    assert.equal(response.statusCode, 201);
    const novel = fixture.repository.getGenerationTasks();
    assert.equal(novel.length, 0);
    const created = await fixture.repository.list({ tenantId: 'tenant_server', page: 1, pageSize: 10 });
    assert.equal(created.items[0]?.ownerId, 'user_server');
    await app.close();
  });
  it('placeholder_detection_rejects_synthetic_tokens_without_blocking_stable_ids', async () => {
    for (const value of [
      'legacy-source', 'objectId-source', 'placeholder-source', 'synthetic-source', 'user_default',
      'null', 'empty', 'unknown-source', 'dummy-source', '0'
    ]) assert.equal(isPlaceholderAuthorityIdentifier(value), true, value);
    for (const value of ['novel_000001', 'direction_v20260718', 'tenant_defaulting_v2', 'policy_default_v1']) {
      assert.equal(isPlaceholderAuthorityIdentifier(value), false, value);
    }
    assert.equal(isPlaceholderActorIdentifier('policy_default_v1'), true);
    for (const actor of [
      { tenantId: 'tenant_legacy', userId: 'user_real' },
      { tenantId: 'tenant_real', userId: 'user_placeholder' },
      { tenantId: 'synthetic', userId: 'user_real' },
      { tenantId: 'tenant_real', userId: 'empty' },
      { tenantId: 'tenant_real', userId: 'policy_default_v1' }
    ]) {
      const app = await buildApp({ logger: false, requestContextResolver: async () => actor });
      const response = await app.inject({ method: 'GET', url: '/tasks/task_missing' });
      assert.equal(response.statusCode, 401, JSON.stringify(actor));
      assert.equal(response.json().error.code, ErrorCode.Unauthorized, JSON.stringify(actor));
      await app.close();
    }
    const app = await buildApp({
      logger: false,
      requestContextResolver: async () => ({ tenantId: 'tenant_defaulting_v2', userId: 'user_stable_v8' })
    });
    const response = await app.inject({ method: 'GET', url: '/tasks/task_missing' });
    assert.equal(response.statusCode, 404);
    await app.close();
  });
  it('same_actor_legacy_raw_token_replay_is_supported_without_new_authority_provider_or_intent', async () => {
    const fixture = await createAuthorityFixture('direction_generate');
    const calls = { value: 0 };
    const rawKey = 'legacy-raw-token-key';
    const first = await executeFixture(fixture, { providerCalls: calls, key: rawKey });
    Object.assign(first.task, { idempotencyToken: rawKey, status: TaskStatus.WaitingConfirmation, activeClaimKey: null });
    const beforeEffects = sideEffects(fixture.repository, calls.value, fixture.counters.intent);
    const authorityLoads = fixture.authority.loadCount;
    const replay = await executeFixture(fixture, { providerCalls: calls, key: rawKey });
    assert.equal(replay.reused, true);
    assert.equal(replay.task.id, first.task.id);
    assert.equal(fixture.authority.loadCount, authorityLoads + 1);
    assert.deepEqual(sideEffects(fixture.repository, calls.value, fixture.counters.intent), beforeEffects);
  });
  it('legacy_or_unknown_envelopes_fail_closed_on_real_replay_without_new_provider_or_intent', async () => {
    const mutations = [
      () => null,
      () => ({ schemaVersion: 1 }),
      (envelope: object) => ({ ...envelope, schemaVersion: '9.9' }),
      (envelope: object) => ({ ...envelope, tenantId: 'tenant_other' }),
      (envelope: object) => ({ ...envelope, auditContext: { requestedByUserId: ' ', requestedAt: '2026-07-15T00:00:00.000Z' } })
    ];
    for (const [index, mutate] of mutations.entries()) {
      const fixture = await createAuthorityFixture('direction_generate');
      const calls = { value: 0 };
      const rawKey = `legacy-invalid-${index}`;
      const first = await executeFixture(fixture, { providerCalls: calls, key: rawKey });
      Object.assign(first.task, {
        idempotencyToken: rawKey,
        activeClaimKey: null,
        executionEnvelopeJson: mutate(first.task.executionEnvelopeJson as object)
      });
      const beforeEffects = sideEffects(fixture.repository, calls.value, fixture.counters.intent);
      await assert.rejects(
        executeFixture(fixture, { providerCalls: calls, key: rawKey }),
        (error: unknown) => error instanceof BusinessError && error.code === ErrorCode.IdempotencyConflict
      );
      assert.deepEqual(sideEffects(fixture.repository, calls.value, fixture.counters.intent), beforeEffects, `legacy:${index}`);
    }
  });
});
function assertZeroDelta(
  beforeEffects: Record<string, number | string>,
  afterEffects: Record<string, number | string>,
  label: string
) {
  assert.deepEqual(Object.keys(afterEffects), Object.keys(beforeEffects), `${label}:effect keys`);
  for (const key of Object.keys(afterEffects)) {
    assert.equal(afterEffects[key], beforeEffects[key], `${label}:${key}:absolute zero mutation`);
  }
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
function assertSourceStaleResponse(statusCode: number, body: { error?: { code?: unknown; details?: { code?: unknown } } }) {
  assert.equal(statusCode, 409);
  assert.equal(body.error?.code, ErrorCode.VersionConflict);
  assert.equal(body.error?.details?.code, 'SOURCE_STALE');
}
function assertSourceStaleTerminalTask(tasks: Array<{ status: unknown; failureCategory: unknown; errorCode: unknown; activeClaimKey: unknown }>) {
  const task = tasks.findLast((item) => item.failureCategory === 'source_stale');
  assert.ok(task);
  assert.equal(task.status, TaskStatus.Failed);
  assert.equal(task.errorCode, 'SOURCE_STALE');
  assert.equal(task.activeClaimKey, null);
}
async function snapshotNovelBusinessState(fixture: Awaited<ReturnType<typeof createRouteAuthorityFixture>>) {
  const novel = await fixture.repository.findById('tenant_test', fixture.novelId);
  assert.ok(novel, `${fixture.action}:novel`);
  return {
    creationStage: novel.creationStage,
    stageStatus: novel.stageStatus,
    updatedBy: novel.updatedBy,
    updatedAt: novel.updatedAt.toISOString()
  };
}
function providerProjection(action: NovelProviderAction, invocations: Array<{ action: NovelProviderAction; input: unknown }>) {
  if (action === 'chapter_impact_assess') {
    const input = invocations[0]?.input as Record<string, unknown> | undefined;
    assert.ok(input, `${action}:provider input`);
    return { ...input, instruction: input.instruction };
  }
  if (action !== 'body_batch_generate' && action !== 'chapter_body_generate') return invocations[0]?.input;
  const inputs = invocations.map((item) => item.input as Record<string, unknown>);
  const first = inputs[0];
  assert.ok(first, `${action}:first provider input`);
  return {
    action,
    novel: first.novel,
    targetChapters: inputs.map((input) => input.chapter),
    strategySnapshot: first.strategySnapshot,
    previousContent: first.previousContent,
    previousMemory: first.previousMemory,
    previousBatchNotes: first.previousBatchNotes,
    enhancedReview: first.enhancedReview
  };
}
function assertActionAuthorityRefs(
  action: NovelProviderAction,
  envelope: ExecutionEnvelopeV1_1,
  authority: NonNullable<Awaited<ReturnType<Awaited<ReturnType<typeof createRouteAuthorityFixture>>['repository']['loadGenerationAuthority']>>>,
  providerInput: unknown
) {
  const refs = envelope.sourceVersionRefs as unknown as Record<string, unknown>;
  const facts = authority.facts as Record<string, unknown>;
  const provider = providerInput as Record<string, unknown>;
  assert.equal(refs.sourceIdentitySchemaVersion, 1, `${action}:identity schema`);
  const identities = refs.sourceIdentities as AuthoritySourceIdentityV1[];
  assert.ok(Array.isArray(identities) && identities.length > 0, `${action}:source identities`);
  assert.deepEqual(
    identities.map((identity) => `${identity.sourceType}\u0000${identity.sourceId}`),
    [...identities].map((identity) => `${identity.sourceType}\u0000${identity.sourceId}`).sort(),
    `${action}:canonical source identity order`
  );
  assert.equal(new Set(identities.map((identity) => `${identity.sourceType}\u0000${identity.sourceId}`)).size, identities.length, `${action}:unique source identities`);
  for (const identity of identities) {
    assert.equal(isPlaceholderAuthorityIdentifier(identity.sourceId), false, `${action}:${identity.sourceType}:real source id`);
    assert.equal(typeof identity.revision === 'number' ? identity.revision > 0 : !isPlaceholderAuthorityIdentifier(identity.revision), true, `${action}:${identity.sourceType}:real revision`);
    assert.match(identity.snapshotHash, /^[a-f0-9]{64}$/, `${action}:${identity.sourceType}:source hash`);
  }
  assert.ok(identities.some((identity) => identity.sourceType === 'novel' && identity.sourceId === envelope.novelId), `${action}:novel identity tuple`);
  for (const version of facts.versions as Array<{ id: string; objectType: AuthoritySourceIdentityV1['sourceType']; versionNo: number }>) {
    assert.ok(identities.some((identity) => identity.sourceType === version.objectType && identity.sourceId === version.id && identity.revision === version.versionNo), `${action}:${version.objectType}:${version.id}:version identity`);
  }
  assert.equal(refs.novelProviderInputSnapshotHash, hashCanonicalJson(facts.novel), `${action}:novel identity`);
  const preferenceActions: NovelProviderAction[] = [
    'direction_generate', 'direction_fuse', 'direction_optimize', 'setting_generate', 'outline_generate',
    'stage_outline_generate', 'chapter_plan_generate', 'trial_chapter_one_generate', 'trial_followup_generate'
  ];
  if (preferenceActions.includes(action)) {
    assert.equal(refs.preferencesSnapshotHash, hashCanonicalJson(facts.preferences ?? { appealPoints: [], targetAudience: null, stageCount: null }), `${action}:preferences identity`);
  } else assert.equal('preferencesSnapshotHash' in refs, false, `${action}:no unused preferences identity`);
  const chapterInputs = action === 'body_batch_generate' || action === 'chapter_body_generate'
    ? provider.targetChapters
    : ['trial_chapter_one_generate', 'trial_followup_generate', 'novel_full_review'].includes(action)
      ? provider.chapters
      : ['chapter_rewrite', 'chapter_impact_assess', 'chapter_adopt_impact_assess'].includes(action)
        ? [provider.chapter]
        : null;
  if (chapterInputs) assert.equal(refs.chapterProviderInputSnapshotHash, hashCanonicalJson(chapterInputs), `${action}:chapter provider identity`);
  if (action === 'trial_chapter_one_generate' || action === 'trial_followup_generate') {
    const chapters = facts.chapters as Array<{ id: string; chapterNo: number; currentContentVersionId: string | null }>;
    const expected = chapters.map((chapter) => ({
      chapterId: chapter.id,
      chapterNo: chapter.chapterNo,
      planVersionId: envelope.sourceVersionRefs.currentChapterPlanVersionId,
      currentContentVersionId: chapter.currentContentVersionId
    }));
    assert.deepEqual(refs.chapterRefs, expected, `${action}:ordered chapter refs`);
    assert.equal(refs.chapterInputSnapshotHash, hashCanonicalJson({ chapterRefs: expected, providerInputs: chapterInputs }), `${action}:chapter input identity`);
  }
  if (action === 'body_batch_generate' || action === 'chapter_body_generate') {
    const authorityChapters = action === 'body_batch_generate'
      ? (facts.chapters as Array<{ id: string; chapterNo: number; currentContentVersionId: string | null }>).filter((chapter) => {
          const request = envelope.normalizedRequest as { startChapter: number; endChapter: number };
          return chapter.chapterNo >= request.startChapter && chapter.chapterNo <= request.endChapter;
        })
      : [facts.chapter as { id: string; chapterNo: number; currentContentVersionId: string | null }];
    const expectedTargets = authorityChapters.map((chapter, index) => ({
      chapterId: chapter.id,
      chapterNo: chapter.chapterNo,
      planVersionId: envelope.sourceVersionRefs.currentChapterPlanVersionId,
      currentContentVersionId: chapter.currentContentVersionId,
      providerInputSnapshotHash: hashCanonicalJson((chapterInputs as unknown[])[index])
    }));
    assert.deepEqual(refs.targetChapterRefs, expectedTargets, `${action}:target refs`);
    const previousContent = facts.bodyPreviousContent as { id?: unknown } | null;
    assert.equal(refs.previousContentVersionId, previousContent?.id ?? null, `${action}:previous content identity`);
    const memory = facts.bodyPreviousMemory as { id: string; sourceContentVersionId: string } | null;
    assert.deepEqual(refs.longTermMemoryIdentity, memory ? {
      id: memory.id,
      sourceContentVersionId: memory.sourceContentVersionId,
      snapshotHash: hashCanonicalJson(provider.previousMemory)
    } : null, `${action}:memory identity`);
    const batch = facts.bodyPreviousBatch as { id: string; summary: unknown } | null;
    assert.deepEqual(refs.previousBatchIdentity, batch ? { id: batch.id, summaryHash: hashCanonicalJson(batch.summary) } : null, `${action}:batch identity`);
    assert.equal(refs.strategyProviderInputSnapshotHash, hashCanonicalJson(provider.strategySnapshot), `${action}:strategy identity`);
  }
  if (action === 'novel_full_review') {
    for (const row of refs.chapterContentVersionIds as Array<{ currentContentVersionId: string }>) {
      const content = (facts.fullReviewContents as Array<{ id: string; versionNo: number }>).find((item) => item.id === row.currentContentVersionId);
      assert.ok(content, `${action}:${row.currentContentVersionId}:loaded content`);
      assert.ok(identities.some((identity) =>
        identity.sourceType === 'chapter_content' && identity.sourceId === content.id && identity.revision === content.versionNo
      ), `${action}:${row.currentContentVersionId}:content identity`);
    }
  }
  const serialized = canonicalExecutionJson(refs);
  assert.equal(/(?:legacy-|objectId-|placeholder|synthetic|"0{64}")/i.test(serialized), false, `${action}:no synthetic authority identity`);
}
const AUTHORITY_EXTENSION_KEYS = new Set([
  'authoritySnapshotHash', 'providerInputSnapshotHash', 'sourceIdentitySchemaVersion', 'sourceIdentities',
  'novelProviderInputSnapshotHash', 'preferencesSnapshotHash', 'chapterProviderInputSnapshotHash',
  'chapterRefs', 'chapterInputSnapshotHash', 'targetChapterRefs', 'previousContentVersionId',
  'longTermMemoryIdentity', 'previousBatchIdentity', 'strategyProviderInputSnapshotHash'
]);
async function assertMalformedLegacyReplayMatrix(
  fixture: Awaited<ReturnType<typeof createRouteAuthorityFixture>>,
  task: ReturnType<typeof fixture.repository.getGenerationTasks>[number],
  originalEnvelope: ExecutionEnvelopeV1_1,
  rawKey: string
) {
  const originalTask = {
    idempotencyToken: task.idempotencyToken,
    requestHash: task.requestHash,
    sourceVersionRefs: task.sourceVersionRefs,
    executionEnvelopeJson: task.executionEnvelopeJson
  };
  const mutations: Array<[string, (envelope: ExecutionEnvelopeV1_1) => unknown]> = [
    ['legacy', (envelope) => ({ ...envelope, schemaVersion: 1 })],
    ['missing-identities', (envelope) => ({ ...envelope, sourceVersionRefs: omitKey(envelope.sourceVersionRefs, 'sourceIdentities') })],
    ['null-identities', (envelope) => ({ ...envelope, sourceVersionRefs: { ...envelope.sourceVersionRefs, sourceIdentities: null } })],
    ['empty-identities', (envelope) => ({ ...envelope, sourceVersionRefs: { ...envelope.sourceVersionRefs, sourceIdentities: [] } })],
    ['legacy-raw-source-ref', (envelope) => replaceActionSourceRef(envelope, 'legacy-source')],
    ['extra-stable-identity', (envelope) => addExtraIdentity(envelope)],
    ...['legacy-source', 'objectId-source', 'placeholder-source', 'synthetic-source', 'default', 'null', 'empty'].map((label) => [
      `placeholder-${label}`,
      (envelope: ExecutionEnvelopeV1_1) => replaceFirstIdentity(envelope, { sourceId: label })
    ] as [string, (envelope: ExecutionEnvelopeV1_1) => unknown]),
    ['placeholder-revision', (envelope) => replaceFirstIdentity(envelope, { revision: 'placeholder' })],
    ['zero-hash', (envelope) => replaceFirstIdentity(envelope, { snapshotHash: '0'.repeat(64) })],
    ['malformed-hash', (envelope) => replaceFirstIdentity(envelope, { snapshotHash: 'not-a-hash' })]
  ];
  task.idempotencyToken = rawKey;
  try {
    for (const [label, mutate] of mutations) {
      const malformed = mutate(structuredClone(originalEnvelope)) as ExecutionEnvelopeV1_1;
      task.executionEnvelopeJson = malformed;
      task.sourceVersionRefs = malformed.sourceVersionRefs;
      task.requestHash = hashCanonicalJson(malformed);
      const beforeEffects = await snapshotRouteSideEffects(fixture);
      const providerCalls = { value: 0 };
      await assert.rejects(
        replayPersistedTask(fixture, task, originalEnvelope, rawKey, providerCalls),
        (error: unknown) => error instanceof BusinessError && error.code === ErrorCode.IdempotencyConflict,
        `${fixture.action}:${label}`
      );
      assert.equal(providerCalls.value, 0, `${fixture.action}:${label}:provider=0`);
      assertZeroDelta(beforeEffects, await snapshotRouteSideEffects(fixture), `${fixture.action}:${label}`);
    }
  } finally {
    Object.assign(task, originalTask);
  }
}
async function assertStaleLegacyReplay(
  fixture: Awaited<ReturnType<typeof createRouteAuthorityFixture>>,
  task: ReturnType<typeof fixture.repository.getGenerationTasks>[number],
  envelope: ExecutionEnvelopeV1_1,
  rawKey: string
) {
  const novel = await fixture.repository.findById('tenant_test', fixture.novelId);
  assert.ok(novel, `${fixture.action}:stale replay novel`);
  const originalTitle = novel.title;
  const originalToken = task.idempotencyToken;
  task.idempotencyToken = rawKey;
  novel.title = `${originalTitle} stale replay`;
  const beforeEffects = await snapshotRouteSideEffects(fixture);
  const providerCalls = { value: 0 };
  try {
    await assert.rejects(
      replayPersistedTask(fixture, task, envelope, rawKey, providerCalls),
      (error: unknown) => error instanceof BusinessError
        && error.code === ErrorCode.VersionConflict
        && (error.details as { code?: unknown }).code === 'SOURCE_STALE',
      `${fixture.action}:stale legacy replay`
    );
    assert.equal(providerCalls.value, 0, `${fixture.action}:stale legacy replay:provider=0`);
    assertZeroDelta(beforeEffects, await snapshotRouteSideEffects(fixture), `${fixture.action}:stale legacy replay`);
  } finally {
    task.idempotencyToken = originalToken;
    novel.title = originalTitle;
  }
}
async function replayPersistedTask(
  fixture: Awaited<ReturnType<typeof createRouteAuthorityFixture>>,
  task: ReturnType<typeof fixture.repository.getGenerationTasks>[number],
  envelope: ExecutionEnvelopeV1_1,
  rawKey: string,
  providerCalls: { value: number }
) {
  const novel = await fixture.repository.findById('tenant_test', fixture.novelId);
  assert.ok(novel, `${fixture.action}:replay novel`);
  return executeClaimedGeneration({
    action: fixture.action,
    repository: fixture.repository,
    novel,
    objectId: fixture.authorityObjectId,
    idempotencyKey: rawKey,
    effectiveRequest: fixture.action === 'body_batch_generate'
      ? {
          ...fixture.requestPayload,
          startChapterNo: (envelope.normalizedRequest as { startChapter: number }).startChapter,
          endChapterNo: (envelope.normalizedRequest as { endChapter: number }).endChapter
        }
      : fixture.requestPayload,
    sourceVersionRefs: Object.fromEntries(Object.entries(envelope.sourceVersionRefs).filter(([key]) => !AUTHORITY_EXTENSION_KEYS.has(key))),
    context: { tenantId: 'tenant_test', userId: 'user_test', requestId: `replay-${fixture.action}` },
    now: () => new Date('2026-07-17T00:05:00.000Z'),
    providerCapability: { getModelRoutingVersion: () => envelope.modelRoutingVersion },
    provider: async () => { providerCalls.value += 1; return { ok: true }; },
    finalize: async () => ({ ok: true })
  });
}
function replaceFirstIdentity(envelope: ExecutionEnvelopeV1_1, patch: Partial<AuthoritySourceIdentityV1>): ExecutionEnvelopeV1_1 {
  const identities = envelope.sourceVersionRefs.sourceIdentities;
  return {
    ...envelope,
    sourceVersionRefs: {
      ...envelope.sourceVersionRefs,
      sourceIdentities: [{ ...identities[0]!, ...patch }, ...identities.slice(1)]
    }
  };
}
function replaceActionSourceRef(envelope: ExecutionEnvelopeV1_1, value: string): ExecutionEnvelopeV1_1 {
  const refs = structuredClone(envelope.sourceVersionRefs) as unknown as Record<string, unknown>;
  if (envelope.action === 'direction_generate') refs.currentDirectionVersionId = value;
  else if (envelope.action === 'direction_fuse' || envelope.action === 'direction_optimize') refs.sourceVersionIds = [value];
  else if (envelope.action === 'setting_generate') refs.currentDirectionVersionId = value;
  else if (envelope.action === 'outline_generate') refs.currentSettingVersionId = value;
  else if (envelope.action === 'stage_outline_generate') refs.currentOutlineVersionId = value;
  else if (envelope.action === 'chapter_plan_generate') refs.currentStageOutlineVersionId = value;
  else if (envelope.action === 'trial_chapter_one_generate') refs.currentChapterPlanVersionId = value;
  else if (envelope.action === 'trial_followup_generate') refs.selectedChapterOneCandidateId = value;
  else if (envelope.action === 'body_batch_generate' || envelope.action === 'chapter_body_generate') refs.strategySnapshotId = value;
  else if (envelope.action === 'chapter_rewrite' || envelope.action === 'chapter_impact_assess') refs.currentContentVersionId = value;
  else if (envelope.action === 'chapter_adopt_impact_assess') refs.candidateVersionId = value;
  else {
    const chapters = refs.chapterContentVersionIds as Array<Record<string, unknown>>;
    chapters[0]!.currentContentVersionId = value;
  }
  return { ...envelope, sourceVersionRefs: refs } as ExecutionEnvelopeV1_1;
}
function addExtraIdentity(envelope: ExecutionEnvelopeV1_1): ExecutionEnvelopeV1_1 {
  const extra: AuthoritySourceIdentityV1 = {
    sourceType: 'novel',
    sourceId: 'novel_extra_stable_v1',
    revision: 1,
    snapshotHash: 'a'.repeat(64)
  };
  const sourceIdentities = [...envelope.sourceVersionRefs.sourceIdentities, extra].sort((left, right) => {
    const leftKey = `${left.sourceType}\u0000${left.sourceId}`;
    const rightKey = `${right.sourceType}\u0000${right.sourceId}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  return { ...envelope, sourceVersionRefs: { ...envelope.sourceVersionRefs, sourceIdentities } };
}
function omitKey(value: object, key: string) {
  return Object.fromEntries(Object.entries(value).filter(([field]) => field !== key));
}
function hasNestedKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((item) => hasNestedKey(item, key));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(([field, child]) => field === key || hasNestedKey(child, key));
}
async function assertRepositoryAuthorityParity(
  fixture: Awaited<ReturnType<typeof createRouteAuthorityFixture>>,
  envelope: ExecutionEnvelopeV1_1
) {
  const authorityInput = {
    action: fixture.action,
    tenantId: 'tenant_test',
    novelId: fixture.novelId,
    objectId: fixture.authorityObjectId,
    sourceVersionRefs: envelope.sourceVersionRefs,
    normalizedRequest: envelope.normalizedRequest
  };
  const inMemoryNormal = await fixture.repository.loadGenerationAuthority(authorityInput);
  const prismaNormal = await loadPrismaAuthorityThroughInMemoryData(fixture.repository, authorityInput);
  assert.deepEqual(prismaNormal, inMemoryNormal, `${fixture.action}:normal repository parity`);
  const legacyRefs = Object.fromEntries(Object.entries(envelope.sourceVersionRefs).filter(([key]) => ![
    'authoritySnapshotHash', 'providerInputSnapshotHash', 'sourceIdentitySchemaVersion', 'novelProviderInputSnapshotHash',
    'preferencesSnapshotHash', 'chapterProviderInputSnapshotHash', 'chapterRefs', 'chapterInputSnapshotHash',
    'targetChapterRefs', 'previousContentVersionId', 'longTermMemoryIdentity', 'previousBatchIdentity',
    'strategyProviderInputSnapshotHash'
  ].includes(key)));
  const legacyInput = { ...authorityInput, sourceVersionRefs: legacyRefs };
  assert.deepEqual(
    await loadPrismaAuthorityThroughInMemoryData(fixture.repository, legacyInput),
    await fixture.repository.loadGenerationAuthority(legacyInput),
    `${fixture.action}:legacy repository parity`
  );
  const novel = await fixture.repository.findById('tenant_test', fixture.novelId);
  assert.ok(novel, `${fixture.action}:novel for stale parity`);
  const title = novel.title;
  novel.title = `${title} stale`;
  try {
    const inMemoryStale = await fixture.repository.loadGenerationAuthority(authorityInput);
    const prismaStale = await loadPrismaAuthorityThroughInMemoryData(fixture.repository, authorityInput);
    assert.deepEqual(prismaStale, inMemoryStale, `${fixture.action}:stale repository parity`);
    if (inMemoryNormal && inMemoryStale) {
      assert.notEqual(hashCanonicalJson(inMemoryStale), hashCanonicalJson(inMemoryNormal), `${fixture.action}:stale projection changes`);
    }
  } finally {
    novel.title = title;
  }
}
async function loadPrismaAuthorityThroughInMemoryData(
  repository: Awaited<ReturnType<typeof createRouteAuthorityFixture>>['repository'],
  input: Parameters<typeof repository.loadGenerationAuthority>[0]
) {
  const facade = Object.create(PrismaNovelRepository.prototype) as PrismaNovelRepository & Record<string, unknown>;
  for (const method of [
    'findById', 'findPreferencesByNovelId', 'listDirectionVersions', 'listStructureVersions', 'listNovelChapters',
    'findChapterContentVersionById', 'findTrialRunById', 'findStructureVersionById', 'findLatestLongTermMemory', 'findLatestBodyBatch'
  ]) {
    (facade as Record<string, unknown>)[method] = (...args: unknown[]) => (repository as unknown as Record<string, (...values: unknown[]) => unknown>)[method]!(...args);
  }
  return PrismaNovelRepository.prototype.loadGenerationAuthority.call(facade, input, {} as never);
}
