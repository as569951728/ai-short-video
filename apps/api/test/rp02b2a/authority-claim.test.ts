import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { ErrorCode, TaskStatus, canonicalExecutionJson, type ExecutionEnvelopeV1_1, type NovelProviderAction } from '@ai-shortvideo/shared';
import { buildApp } from '../../src/app.js';
import { BusinessError } from '../../src/shared/errors.js';
import { validateExecutionEnvelopeV1_1ForTask } from '../../src/modules/novels/domain/executionContract.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';
import { createActorScopedIdempotencyToken, executeClaimedGeneration, hashCanonicalJson } from '../../src/modules/novels/services/taskClaim.js';
import { createDefaultRequestContext } from '../../src/modules/novels/services/novelService.js';
import { ACTIONS, ManualClock, ZERO_SIDE_EFFECTS, createAuthorityFixture, createRouteAuthorityFixture, sideEffects, snapshotRouteSideEffects } from './fixtures.js';
async function executeFixture(
  fixture: Awaited<ReturnType<typeof createAuthorityFixture>>,
  input: {
    key?: string;
    context?: typeof fixture.context;
    barrier?: () => void;
    effectiveRequest?: unknown;
    sourceVersionRefs?: unknown;
    providerCalls: { value: number };
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
    provider: async () => { input.providerCalls.value += 1; return { ok: true }; },
    finalize: async () => ({ ok: true })
  });
}
describe('RP-02B2a2 authoritative claim', () => {
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
            const beforeTaskIds = new Set(fixture.repository.getGenerationTasks().map((task) => task.id));
            const response = await fixture.run(phase, mutation, actionIndex * 6 + phaseIndex * 2 + mutationIndex + 1);
            assert.equal(response.statusCode, 409, `${label}:${response.body}`);
            assert.equal(response.json().error.code, ErrorCode.VersionConflict, label);
            assert.equal(response.json().error.details.code, 'SOURCE_STALE', `${label}:source stale`);
            assert.equal(fixture.authorityReads(), phase === 'before_claim' ? 1 : phase === 'after_first_authority_read' ? 2 : 3, `${label}:loader`);
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
              if (mutation === 'changed') {
                assert.ok(snapshots[2], `${label}:post-claim snapshot`);
                assert.notEqual(hashCanonicalJson(snapshots[2]), hashCanonicalJson(snapshots[0]), `${label}:post-claim hash changed`);
              } else {
                assert.equal(snapshots[2], null, `${label}:post-claim authority missing`);
              }
              const afterEffects = await snapshotRouteSideEffects(fixture);
              assertAfterClaimFailClosed(beforeEffects, afterEffects, label);
              const claimedTasks = fixture.repository.getGenerationTasks().filter((task) => !beforeTaskIds.has(task.id));
              assert.equal(claimedTasks.length, 1, `${label}:one claimed task`);
              const [task] = claimedTasks;
              assert.ok(task, `${label}:claimed task`);
              assert.equal(task.status, TaskStatus.Failed, `${label}:task status`);
              assert.equal(task.failureCategory, 'source_stale', `${label}:failure category`);
              assert.equal(task.errorCode, 'SOURCE_STALE', `${label}:task error code`);
              assert.equal(task.activeClaimKey, null, `${label}:claim released`);
              assert.deepEqual(task.resultVersionIds, [], `${label}:no result versions`);
              assert.equal(task.resultReceiptHash, null, `${label}:no result receipt`);
              assert.equal(fixture.providerInvocations().length, 0, `${label}:provider not invoked`);
            } else {
              assertZeroDelta(beforeEffects, await snapshotRouteSideEffects(fixture), label);
            }
          });
        }
      }
      it(`${action}:http_200:authoritative_provider_projection`, async () => {
        const response = await fixture.runSuccess(`a2-success-${action}`);
        assert.equal(response.statusCode, 200, `${action}:${response.body}`);
        assert.equal(response.json().success, true, action);
        assert.equal(fixture.authorityReads(), 3, `${action}:authority reads`);
        const snapshots = fixture.authoritySnapshots();
        assert.ok(snapshots[0] && snapshots[1] && snapshots[2], `${action}:authority snapshots`);
        assert.equal(hashCanonicalJson(snapshots[1]), hashCanonicalJson(snapshots[0]), `${action}:stable authority`);
        assert.equal(hashCanonicalJson(snapshots[2]), hashCanonicalJson(snapshots[0]), `${action}:post-claim authority`);
        const invocations = fixture.providerInvocations();
        assert.ok(invocations.length > 0, `${action}:provider invoked`);
        assert.deepEqual([...new Set(invocations.map((item) => item.action))], [action], `${action}:provider action`);
        const task = fixture.repository.getGenerationTasks().findLast((item) =>
          (item.executionEnvelopeJson as { action?: unknown } | null)?.action === action
        );
        assert.ok(task, `${action}:task`);
        const envelope = validateExecutionEnvelopeV1_1ForTask(task);
        assert.equal(envelope.sourceVersionRefs.authoritySnapshotHash, hashCanonicalJson(snapshots[0]), `${action}:authority projection`);
        assert.equal(envelope.sourceVersionRefs.providerInputSnapshotHash, hashCanonicalJson(providerProjection(action, invocations)), `${action}:provider projection`);
        assertActionAuthorityRefs(action, envelope, snapshots[0]!, providerProjection(action, invocations));
        await assertRepositoryAuthorityParity(fixture, envelope);
      });
    });
  }
  for (const action of ACTIONS) {
    it(`${action}:isolated_missing_authority_has_absolute_zero_provider_task_intent_and_side_effects`, async () => {
      const fixture = await createAuthorityFixture(action);
      const calls = { value: 0 };
      fixture.authority.remove();
      assert.deepEqual(sideEffects(fixture.repository, calls.value, fixture.counters.intent), ZERO_SIDE_EFFECTS);
      await assert.rejects(
        executeFixture(fixture, { providerCalls: calls, key: `missing-authority-${action}` }),
        (error: unknown) => error instanceof BusinessError && error.code === ErrorCode.VersionConflict
      );
      assert.deepEqual(sideEffects(fixture.repository, calls.value, fixture.counters.intent), ZERO_SIDE_EFFECTS);
    });
  }
  it('new_task_missing_required_source_refs_fails_closed_with_absolute_zero_provider_task_and_intent', async () => {
    const fixture = await createAuthorityFixture('outline_generate');
    const calls = { value: 0 };
    await assert.rejects(
      executeFixture(fixture, { providerCalls: calls, key: 'missing-source-refs', sourceVersionRefs: {} }),
      (error: unknown) => error instanceof BusinessError
        && error.code === ErrorCode.VersionConflict
        && (error.details as { code?: unknown }).code === 'SOURCE_STALE'
    );
    assert.equal(fixture.authority.loadCount, 0);
    assert.deepEqual(sideEffects(fixture.repository, calls.value, fixture.counters.intent), ZERO_SIDE_EFFECTS);
  });
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
    const tenantA = await createAuthorityFixture('direction_generate', { tenantId: 'tenant_alpha', userId: 'user_shared' });
    const tenantB = await createAuthorityFixture('direction_generate', { tenantId: 'tenant_beta', userId: 'user_shared' });
    const callsA = { value: 0 }, callsB = { value: 0 };
    const claimA = await executeFixture(tenantA, { providerCalls: callsA, key });
    const claimB = await executeFixture(tenantB, { providerCalls: callsB, key });
    assert.deepEqual([claimA.task.tenantId, claimB.task.tenantId], ['tenant_alpha', 'tenant_beta']);
    assert.notEqual(claimA.task.idempotencyToken, claimB.task.idempotencyToken);
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
function assertZeroDelta(beforeEffects: Record<string, number>, afterEffects: Record<string, number>, label: string) {
  assert.deepEqual(Object.keys(afterEffects), Object.keys(beforeEffects), `${label}:effect keys`);
  for (const key of Object.keys(afterEffects)) {
    assert.equal(afterEffects[key] - beforeEffects[key], 0, `${label}:${key}:absolute zero delta`);
  }
}
function assertAfterClaimFailClosed(beforeEffects: Record<string, number>, afterEffects: Record<string, number>, label: string) {
  assert.deepEqual(Object.keys(afterEffects), Object.keys(beforeEffects), `${label}:effect keys`);
  assert.equal(afterEffects.task - beforeEffects.task, 1, `${label}:one failed task`);
  assert.equal(afterEffects.event - beforeEffects.event, 2, `${label}:claim and failure events`);
  assert.equal(afterEffects.intent - beforeEffects.intent, 1, `${label}:one claim intent`);
  for (const key of ['provider', 'asset', 'receipt', 'current', 'log', 'child']) {
    assert.equal(afterEffects[key] - beforeEffects[key], 0, `${label}:${key}:no formal side effect`);
  }
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
  const serialized = canonicalExecutionJson(refs);
  assert.equal(/(?:legacy-|objectId-|"0{64}")/.test(serialized), false, `${action}:no synthetic authority identity`);
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
