import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createExecutionEnvelopeV1_1 } from '@ai-shortvideo/shared';
import { hashCanonicalJson } from '../../src/modules/novels/domain/executionContract.js';
import type { LeasedCreativeFinalizeInput, StructureAssetDraft } from '../../src/modules/novels/domain/novelDomain.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';

const at = (seconds: number) => new Date(Date.UTC(2030, 0, 1, 0, 0, seconds));
const setting: StructureAssetDraft = {
  objectType: 'setting', title: '回档人生设定', summary: '人物与世界规则', score: 88,
  riskLevel: 'none', riskTags: [], recommendedReason: '人物动机清晰',
  content: {
    title: '回档人生设定', summary: '主角回到十八岁重新选择', recommendation: '保持时间规则一致',
    riskTags: [], sections: [{ title: '主角', body: '主角以过往失败经验重新规划人生。', items: ['不能改变已经发生的关键事实'] }],
    stages: [], chapters: []
  }
};
type Row = Record<string, any>;

function fixture() {
  const tenantId = 'tenant_setting', novelId = 'novel_setting', taskId = 'task_setting';
  const directionId = 'direction_current';
  const authority = { action: 'setting_generate' as const, tenantId, novelId, objectId: novelId,
    facts: { novel: { id: novelId, currentDirectionVersionId: directionId }, direction: { id: directionId } } };
  const sha = 'a'.repeat(64);
  const envelope = createExecutionEnvelopeV1_1({
    tenantId, novelId, auditContext: { requestedByUserId: 'user_setting', requestedAt: at(0).toISOString() },
    action: 'setting_generate', objectType: 'setting', objectId: novelId,
    normalizedRequest: { currentDirectionVersionId: directionId },
    sourceVersionRefs: {
      currentDirectionVersionId: directionId, currentSettingVersionId: null,
      currentOutlineVersionId: null, currentStageOutlineVersionId: null, objectType: 'setting',
      sourceIdentitySchemaVersion: 1, sourceIdentities: [
        { sourceType: 'direction', sourceId: directionId, revision: sha, snapshotHash: sha },
        { sourceType: 'novel', sourceId: novelId, revision: sha, snapshotHash: sha },
        { sourceType: 'preferences', sourceId: novelId, revision: sha, snapshotHash: sha }
      ],
      novelProviderInputSnapshotHash: sha, preferencesSnapshotHash: sha,
      authoritySnapshotHash: hashCanonicalJson(authority), providerInputSnapshotHash: sha
    },
    policyProfileVersionId: 'policy_default_v1', modelRoutingVersion: 'provider:test:v1'
  });
  const row: Row = {
    id: taskId, tenantId, novelId, taskType: 'novel_setting_generate', objectType: 'setting', objectId: novelId,
    status: 'PROCESSING', statusNote: '处理中', progress: 70, currentStep: 'provider_result_validated',
    triggerSource: 'user', sourceVersionRefs: envelope.sourceVersionRefs,
    conflictScope: 'novel_setting', conflictKey: novelId, idempotencyToken: 'setting-token',
    requestHash: hashCanonicalJson(envelope), activeClaimKey: 'setting-claim',
    policyProfileVersionId: envelope.policyProfileVersionId, modelRoutingVersion: envelope.modelRoutingVersion,
    promptTemplateVersionId: null, inputSummary: '设定', outputSummary: null,
    resultVersionId: null, resultVersionIdsJson: [], retryOfTaskId: null, failureCategory: null,
    errorCode: null, errorMessage: null, resultObjectType: null, resultObjectId: null,
    userAcceptedResult: false, cancelRequestedAt: null, cancelReason: null, startedAt: at(0),
    finishedAt: null, createdBy: 'user_setting', createdAt: at(0), updatedAt: at(3), metadata: {},
    leaseOwnerId: 'worker-setting', leaseToken: 'lease-setting', leaseExpiresAt: at(60),
    lastHeartbeatAt: at(3), retryCount: 0, maxRetries: 0, executionEnvelopeJson: envelope,
    providerAttemptId: 'attempt-setting', providerAttemptPhase: 'PROVIDER_RESULT_VALIDATED',
    providerDispatchedAt: at(2), resultReceiptHash: null, rootTaskId: taskId,
    providerCallBudgetMax: 1, providerCallBudgetUsed: 1, durationDeadlineAt: at(90),
    costBudgetMicrosMax: 0n, costBudgetMicrosUsed: 0n
  };
  const input: LeasedCreativeFinalizeInput = {
    tenantId, taskId, leaseOwnerId: 'worker-setting', leaseToken: 'lease-setting',
    providerAttemptId: 'attempt-setting', authoritativeNow: at(4), validatedResult: setting
  };
  const state = {
    row, novel: { id: novelId, currentDirectionVersionId: directionId, currentSettingVersionId: null as string | null,
      creationStage: 'SETTING', stageStatus: 'GENERATING' },
    versions: [] as Row[], events: [] as Row[], logs: [] as Row[], locks: [] as unknown[],
    authorityReads: 0, stale: false, failStage: '', loseCas: false
  };
  const repository = Object.create(PrismaNovelRepository.prototype) as PrismaNovelRepository & { prisma: unknown };
  Object.defineProperty(repository, 'prisma', { value: {
    generationTask: { findFirst: async () => state.row },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => {
      const pending = structuredClone({ row: state.row, novel: state.novel, versions: state.versions,
        events: state.events, logs: state.logs });
      const tx = {
        $queryRaw: async (query: unknown) => { state.locks.push(query); return []; },
        generationTask: {
          findFirst: async () => pending.row,
          findFirstOrThrow: async () => pending.row,
          updateMany: async ({ where, data }: { where: Row; data: Row }) => {
            assert.equal(where.taskType, 'novel_setting_generate');
            assert.equal(where.status, 'PROCESSING');
            assert.equal(where.leaseOwnerId, 'worker-setting');
            assert.equal(where.leaseToken, 'lease-setting');
            assert.equal(where.providerAttemptPhase, 'PROVIDER_RESULT_VALIDATED');
            assert.equal(where.providerAttemptId, 'attempt-setting');
            assert.equal(where.providerCallBudgetUsed, 1);
            assert.deepEqual(where.durationDeadlineAt, { gt: input.authoritativeNow });
            assert.equal(where.cancelRequestedAt, null);
            if (state.failStage === 'task') throw new Error('injected task fault');
            if (state.loseCas) return { count: 0 };
            Object.assign(pending.row, data);
            return { count: 1 };
          }
        },
        creativeVersion: {
          findFirst: async () => null,
          create: async ({ data }: { data: Row }) => {
            const version = { id: state.failStage === 'receipt' ? 'v'.repeat(33) : 'setting-version-1', ...data };
            pending.versions.push(version);
            if (state.failStage === 'asset') throw new Error('injected asset fault');
            return version;
          }
        },
        novel: { updateMany: async ({ where, data }: { where: Row; data: Row }) => {
          assert.equal(where.currentDirectionVersionId, directionId);
          assert.equal(where.currentSettingVersionId, null);
          assert.equal(data.currentSettingVersionId, undefined, 'candidate must not become current');
          Object.assign(pending.novel, data);
          if (state.failStage === 'novel') throw new Error('injected novel fault');
          return { count: 1 };
        } },
        generationTaskEvent: { create: async ({ data }: { data: Row }) => {
          pending.events.push(data);
          if (state.failStage === 'event') throw new Error('injected event fault');
          return data;
        } },
        operationLog: { create: async ({ data }: { data: Row }) => {
          pending.logs.push(data);
          if (state.failStage === 'audit') throw new Error('injected audit fault');
          return data;
        } }
      };
      const result = await callback(tx);
      Object.assign(state, pending);
      return result;
    }
  } });
  repository.loadGenerationAuthority = async () => {
    assert.ok(state.locks.length >= 7, 'authority must be read after row locks');
    state.authorityReads += 1;
    return state.stale ? null : authority;
  };
  return { repository, state, input };
}

describe('Prisma setting_generate leased fenced finalize', () => {
  it('atomically persists one candidate, safe receipt, terminal task, event and audit without adopting', async () => {
    const { repository, state, input } = fixture();
    assert.equal(await repository.getLeasedExecutionCapability('novel_setting_generate'), 'disabled');
    assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'applied');
    assert.equal(state.authorityReads, 1);
    assert.equal(state.versions.length, 1);
    assert.equal(state.versions[0].objectType, 'setting');
    assert.equal(state.versions[0].status, 'CANDIDATE');
    assert.equal(state.versions[0].sourceTaskId, input.taskId);
    assert.equal(state.novel.currentSettingVersionId, null);
    assert.equal(state.novel.stageStatus, 'WAITING_USER');
    assert.equal(state.row.status, 'WAITING_CONFIRMATION');
    assert.equal(state.row.resultVersionId, state.versions[0].id);
    assert.match(state.row.resultReceiptHash, /^[a-f0-9]{64}$/);
    assert.equal(state.row.leaseToken, null);
    assert.equal(state.events[0].eventType, 'task_finalized');
    assert.equal(state.logs[0].action, 'generation_task_finalized');
    assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'fenced');
    assert.equal(state.versions.length, 1);
  });

  it('fences wrong owner, attempt, expired lease, deadline, cancellation and invalid call budget', async () => {
    for (const patch of [
      { leaseOwnerId: 'other' }, { leaseToken: 'other' }, { providerAttemptId: 'other' },
      { authoritativeNow: at(60) }, { authoritativeNow: at(90) }
    ]) {
      const { repository, state, input } = fixture();
      assert.equal((await repository.finalizeLeasedAction({ ...input, ...patch })).outcome, 'fenced');
      assert.equal(state.versions.length, 0);
      assert.equal(state.row.status, 'PROCESSING');
    }
    for (const patch of [
      { cancelRequestedAt: at(3) }, { providerAttemptPhase: 'PROVIDER_CALL_STARTED' },
      { providerCallBudgetUsed: 0 }, { providerCallBudgetUsed: 2 },
      { providerCallBudgetMax: 0 }, { retryOfTaskId: 'old-task' }
    ]) {
      const { repository, state, input } = fixture();
      Object.assign(state.row, patch);
      assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'fenced');
      assert.equal(state.versions.length, 0);
    }
  });

  it('fails stale authority or invalid validated output after paid dispatch without asset or receipt', async () => {
    for (const invalid of [false, true]) {
      const { repository, state, input } = fixture();
      state.stale = !invalid;
      if (invalid) input.validatedResult = { ...setting, content: { ...setting.content, sections: [{ title: 'bad' }] } } as StructureAssetDraft;
      assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'applied');
      assert.equal(state.row.status, 'FAILED');
      assert.equal(state.row.errorCode, invalid ? 'WORKER_PAYLOAD_UNSUPPORTED' : 'SOURCE_STALE');
      assert.equal(state.row.resultReceiptHash, null);
      assert.equal(state.versions.length, 0);
      assert.equal(state.events[0].eventType, 'task_failed');
      assert.equal(state.logs[0].action, 'generation_task_failed');
    }
    for (const validatedResult of [
      { ...setting, objectType: 'outline' },
      { ...setting, score: 101 },
      { ...setting, unexpectedField: 'not part of the validated draft' }
    ]) {
      const { repository, state, input } = fixture();
      assert.equal((await repository.finalizeLeasedAction({ ...input, validatedResult: validatedResult as StructureAssetDraft })).outcome, 'applied');
      assert.equal(state.row.status, 'FAILED');
      assert.equal(state.row.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
      assert.equal(state.row.resultReceiptHash, null);
      assert.equal(state.versions.length, 0);
    }
  });

  it('rejects a damaged execution contract under the live lease', async () => {
    const { repository, state, input } = fixture();
    state.row.requestHash = '0'.repeat(64);
    assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'applied');
    assert.equal(state.row.status, 'FAILED');
    assert.equal(state.row.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
    assert.equal(state.versions.length, 0);
    assert.equal(state.row.resultReceiptHash, null);
  });

  it('rolls back asset, receipt, task, novel, event and audit failures', async () => {
    for (const stage of ['asset', 'receipt', 'task', 'novel', 'event', 'audit']) {
      const { repository, state, input } = fixture();
      state.failStage = stage;
      await assert.rejects(repository.finalizeLeasedAction(input));
      assert.equal(state.row.status, 'PROCESSING', stage);
      assert.equal(state.row.resultReceiptHash, null, stage);
      assert.equal(state.novel.currentSettingVersionId, null, stage);
      assert.equal(state.novel.stageStatus, 'GENERATING', stage);
      assert.equal(state.versions.length, 0, stage);
      assert.equal(state.events.length, 0, stage);
      assert.equal(state.logs.length, 0, stage);
    }
    const { repository, state, input } = fixture();
    state.loseCas = true;
    await assert.rejects(repository.finalizeLeasedAction(input), /lost its fenced task transition/);
    assert.equal(state.versions.length, 0);
    assert.equal(state.row.status, 'PROCESSING');
  });
});

describe('Prisma leased provider failure', () => {
  it('commits failure, event and audit together, or rolls them all back', async () => {
    for (const failAudit of [false, true]) {
      const state = { row: structuredClone(fixture().state.row), events: [] as Row[], logs: [] as Row[] };
      const repository = Object.create(PrismaNovelRepository.prototype) as PrismaNovelRepository & { prisma: unknown };
      Object.defineProperty(repository, 'prisma', { value: {
        $transaction: async (callback: (tx: any) => Promise<unknown>) => {
          const pending = structuredClone(state);
          const tx = {
            generationTask: {
              updateMany: async ({ where, data }: { where: Row; data: Row }) => {
                assert.equal(where.tenantId, state.row.tenantId);
                assert.equal(where.id, state.row.id);
                assert.equal(where.leaseOwnerId, state.row.leaseOwnerId);
                assert.equal(where.leaseToken, state.row.leaseToken);
                Object.assign(pending.row, data);
                return { count: 1 };
              },
              findFirstOrThrow: async () => pending.row
            },
            generationTaskEvent: { create: async ({ data }: { data: Row }) => {
              pending.events.push(data);
              return data;
            } },
            operationLog: { create: async ({ data }: { data: Row }) => {
              pending.logs.push(data);
              if (failAudit) throw new Error('injected audit fault');
              return data;
            } }
          };
          const result = await callback(tx);
          Object.assign(state, pending);
          return result;
        }
      } });
      const failure = { failureCategory: 'provider_error', errorCode: 'PROVIDER_ERROR',
        errorMessage: '模型服务调用失败。', statusNote: '模型服务调用失败，任务已安全结束。' };
      const commit = repository.failLeasedTask(state.row.tenantId, state.row.id,
        state.row.leaseOwnerId, state.row.leaseToken, at(4), failure);
      if (failAudit) {
        await assert.rejects(commit, /injected audit fault/);
        assert.equal(state.row.status, 'PROCESSING');
        assert.equal(state.events.length, 0);
        assert.equal(state.logs.length, 0);
      } else {
        assert.equal((await commit).outcome, 'applied');
        assert.equal(state.row.status, 'FAILED');
        assert.equal(state.events[0].eventType, 'task_failed');
        assert.equal(state.logs[0].action, 'generation_task_failed');
        assert.deepEqual(state.logs[0].afterSnapshot, {
          failureCategory: 'provider_error', errorCode: 'PROVIDER_ERROR'
        });
      }
    }
  });
});
