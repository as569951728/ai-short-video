import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createExecutionEnvelopeV1_1, type DirectionCandidateContentDTO } from '@ai-shortvideo/shared';
import { hashCanonicalJson } from '../../src/modules/novels/domain/executionContract.js';
import type { DirectionCandidateDraft, LeasedCreativeFinalizeInput } from '../../src/modules/novels/domain/novelDomain.js';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';

const at = (seconds: number) => new Date(Date.UTC(2030, 0, 1, 0, 0, seconds));
const candidate: DirectionCandidateDraft = {
  title: '第二条路', summary: '新的方向', score: 88, marketScore: 86,
  riskLevel: 'none', riskTags: [], recommendedReason: '主线明确',
  content: {
    title: '第二条路', logline: '主角重新开始', coreHook: '逆转旧案',
    audienceAppeal: '成长', videoPotential: '可分集', sellingPoints: ['悬念'], riskTags: [],
    recommendation: '保留悬念'
  } satisfies DirectionCandidateContentDTO
};

type Row = Record<string, any>;
async function fixture() {
  const source = createInMemoryNovelRepository();
  const context = { tenantId: 'tenant_fenced', userId: 'user_fenced', requestId: 'request_fenced' };
  const draft = await source.createDraft({ request: { title: '方向事务测试' }, context, now: at(0) });
  const novelId = draft.novel.id;
  const authorityInput = { action: 'direction_generate' as const, tenantId: context.tenantId,
    novelId, objectId: novelId, sourceVersionRefs: { currentDirectionVersionId: null }, normalizedRequest: {} };
  const authority = await source.loadGenerationAuthority(authorityInput);
  assert.ok(authority);
  const facts = authority.facts as { novel: Record<string, unknown>; preferences: Record<string, unknown> | null };
  const novelHash = hashCanonicalJson(facts.novel);
  const preferencesHash = hashCanonicalJson(facts.preferences ?? { appealPoints: [], targetAudience: null, stageCount: null });
  const envelope = createExecutionEnvelopeV1_1({
    tenantId: context.tenantId, novelId, auditContext: { requestedByUserId: context.userId, requestedAt: at(0).toISOString() },
    action: 'direction_generate', objectType: 'direction', objectId: novelId, normalizedRequest: {},
    sourceVersionRefs: {
      currentDirectionVersionId: null, sourceIdentitySchemaVersion: 1,
      sourceIdentities: [
        { sourceType: 'novel', sourceId: novelId, revision: novelHash, snapshotHash: novelHash },
        { sourceType: 'preferences', sourceId: novelId, revision: preferencesHash, snapshotHash: preferencesHash }
      ],
      novelProviderInputSnapshotHash: novelHash, preferencesSnapshotHash: preferencesHash,
      authoritySnapshotHash: hashCanonicalJson(authority), providerInputSnapshotHash: '3'.repeat(64)
    }, policyProfileVersionId: 'policy_default_v1', modelRoutingVersion: 'provider:test:v1'
  });
  const claimed = await source.claimGenerationTask({
    tenantId: context.tenantId, novelId, taskType: 'novel_direction_generate', objectType: 'direction', objectId: novelId,
    conflictScope: 'novel_direction', conflictKey: novelId, activeClaimKey: 'active-direction',
    idempotencyToken: 'direction-token', requestHash: hashCanonicalJson(envelope),
    sourceVersionRefs: envelope.sourceVersionRefs, executionEnvelopeJson: envelope,
    policyProfileVersionId: envelope.policyProfileVersionId, modelRoutingVersion: envelope.modelRoutingVersion,
    inputSummary: 'direction', authorityInput: { ...authorityInput, sourceVersionRefs: envelope.sourceVersionRefs },
    expectedAuthoritySnapshotHash: hashCanonicalJson(authority), context, now: at(0)
  });
  assert.equal(claimed.outcome, 'created');
  const row: Row = {
    ...structuredClone(claimed.task), status: 'PROCESSING', providerAttemptPhase: 'PROVIDER_RESULT_VALIDATED',
    providerAttemptId: 'attempt-1', providerDispatchedAt: at(2), providerCallBudgetUsed: 1,
    providerCallBudgetMax: 1, durationDeadlineAt: at(90), leaseOwnerId: 'worker-1',
    leaseToken: 'lease-1', leaseExpiresAt: at(60), resultVersionId: null, resultVersionIdsJson: [],
    costBudgetMicrosMax: 0n, costBudgetMicrosUsed: 0n
  };
  const input: LeasedCreativeFinalizeInput = {
    tenantId: context.tenantId, taskId: row.id, leaseOwnerId: 'worker-1', leaseToken: 'lease-1',
    authoritativeNow: at(4), providerAttemptId: 'attempt-1', validatedResult: [candidate]
  };
  const state = { row, versions: [] as Row[], events: [] as Row[], logs: [] as Row[], novelUpdates: [] as Row[],
    locks: [] as unknown[], authorityReads: 0, stale: false, loseCas: false, failStage: '' };
  const repository = Object.create(PrismaNovelRepository.prototype) as PrismaNovelRepository & { prisma: unknown };
  Object.defineProperty(repository, 'prisma', { value: {
    generationTask: { findFirst: async () => state.row },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => {
      const pending = structuredClone({ row: state.row, versions: state.versions, events: state.events,
        logs: state.logs, novelUpdates: state.novelUpdates });
      const tx = {
        $queryRaw: async (query: unknown) => { state.locks.push(query); return []; },
        generationTask: {
          findFirst: async () => pending.row,
          findFirstOrThrow: async () => pending.row,
          updateMany: async ({ where, data }: { where: Row; data: Row }) => {
            assert.equal(where.status, 'PROCESSING');
            assert.equal(where.leaseOwnerId, 'worker-1');
            assert.equal(where.leaseToken, 'lease-1');
            assert.deepEqual(where.leaseExpiresAt, { gt: input.authoritativeNow });
            assert.equal(where.providerAttemptPhase, 'PROVIDER_RESULT_VALIDATED');
            assert.equal(where.providerAttemptId, 'attempt-1');
            assert.equal(where.resultReceiptHash, null);
            if (state.failStage === 'task') throw new Error('task failed');
            if (state.loseCas) return { count: 0 };
            Object.assign(pending.row, data);
            return { count: 1 };
          }
        },
        creativeVersion: {
          findFirst: async () => pending.versions.at(-1) ?? null,
          create: async ({ data }: { data: Row }) => {
            const version = { id: state.failStage === 'receipt' ? 'v'.repeat(33) : `version-${pending.versions.length + 1}`, ...data };
            pending.versions.push(version);
            if (state.failStage === 'asset') throw new Error('asset failed');
            return version;
          }
        },
        novel: { updateMany: async ({ data }: { data: Row }) => {
          pending.novelUpdates.push(data);
          return { count: state.failStage === 'novel' ? 0 : 1 };
        } },
        generationTaskEvent: { create: async ({ data }: { data: Row }) => {
          pending.events.push(data);
          if (state.failStage === 'event') throw new Error('event failed');
          return data;
        } },
        operationLog: { create: async ({ data }: { data: Row }) => {
          pending.logs.push(data);
          if (state.failStage === 'operation_log') throw new Error('log failed');
          return data;
        } }
      };
      const result = await callback(tx);
      Object.assign(state, pending);
      return result;
    }
  } });
  repository.loadGenerationAuthority = async () => {
    assert.ok(state.locks.length > 0, 'authority must be read after locking');
    state.authorityReads += 1;
    return state.stale ? null : authority;
  };
  return { repository, state, input };
}

describe('Prisma direction_generate leased fenced finalize', () => {
  it('commits candidates, receipt, task, event and audit atomically without adoption', async () => {
    const { repository, state, input } = await fixture();
    assert.equal(await repository.getLeasedExecutionCapability('novel_direction_generate'), 'disabled');
    assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'applied');
    assert.equal(state.authorityReads, 1);
    assert.equal(state.versions.length, 1);
    assert.equal(state.versions[0].status, 'CANDIDATE');
    assert.equal(state.versions[0].sourceTaskId, input.taskId);
    assert.equal(state.row.status, 'WAITING_CONFIRMATION');
    assert.equal(state.row.resultVersionId, state.versions[0].id);
    assert.match(state.row.resultReceiptHash, /^[a-f0-9]{64}$/);
    assert.equal(state.row.leaseToken, null);
    assert.equal(state.events[0].eventType, 'task_finalized');
    assert.equal(state.logs[0].action, 'generation_task_finalized');
    assert.equal(state.novelUpdates.length, 1);
    assert.equal(state.novelUpdates[0].currentDirectionVersionId, undefined);
    assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'fenced');
    assert.equal(state.versions.length, 1);
  });

  it('fences wrong owner, attempt, expired lease, cancellation and phase without writes', async () => {
    for (const patch of [
      { leaseOwnerId: 'other' }, { providerAttemptId: 'other' }, { authoritativeNow: at(60) },
      { leaseToken: 'other' }
    ]) {
      const { repository, state, input } = await fixture();
      assert.equal((await repository.finalizeLeasedAction({ ...input, ...patch })).outcome, 'fenced');
      assert.equal(state.versions.length, 0);
      assert.equal(state.events.length, 0);
    }
    for (const patch of [{ cancelRequestedAt: at(3) }, { providerAttemptPhase: 'PROVIDER_CALL_STARTED' },
      { retryOfTaskId: 'old-task' }, { providerCallBudgetUsed: 0 }]) {
      const { repository, state, input } = await fixture();
      Object.assign(state.row, patch);
      assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'fenced');
      assert.equal(state.versions.length, 0);
    }
  });

  it('safely fails stale authority and invalid results with one failure event and audit', async () => {
    for (const invalid of [false, true]) {
      const { repository, state, input } = await fixture();
      state.stale = !invalid;
      if (invalid) input.validatedResult = [{ ...candidate, score: Number.NaN }];
      assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'applied');
      assert.equal(state.row.status, 'FAILED');
      assert.equal(state.row.errorCode, invalid ? 'WORKER_PAYLOAD_UNSUPPORTED' : 'SOURCE_STALE');
      assert.equal(state.versions.length, 0);
      assert.equal(state.events[0].eventType, 'task_failed');
      assert.equal(state.logs[0].action, 'generation_task_failed');
      assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'fenced');
    }
  });

  it('rolls back the entire bundle on asset, receipt, task, novel, event or audit failure and on lost task CAS', async () => {
    for (const stage of ['asset', 'receipt', 'task', 'novel', 'event', 'operation_log']) {
      const { repository, state, input } = await fixture();
      state.failStage = stage;
      await assert.rejects(repository.finalizeLeasedAction(input));
      assert.equal(state.row.status, 'PROCESSING');
      assert.equal(state.versions.length, 0);
      assert.equal(state.events.length, 0);
      assert.equal(state.logs.length, 0);
    }
    const { repository, state, input } = await fixture();
    state.loseCas = true;
    await assert.rejects(repository.finalizeLeasedAction(input), /lost its fenced task transition/);
    assert.equal(state.row.status, 'PROCESSING');
    assert.equal(state.versions.length, 0);
  });
});
