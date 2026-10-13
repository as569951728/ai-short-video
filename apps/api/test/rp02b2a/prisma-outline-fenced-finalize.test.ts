import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createExecutionEnvelopeV1_1 } from '@ai-shortvideo/shared';
import { hashCanonicalJson } from '../../src/modules/novels/domain/executionContract.js';
import type { LeasedCreativeFinalizeInput, StructureAssetDraft } from '../../src/modules/novels/domain/novelDomain.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';

type StructureType = 'outline' | 'stage_outline' | 'chapter_plan';
type Row = Record<string, any>;
const at = (seconds: number) => new Date(Date.UTC(2030, 0, 1, 0, 0, seconds));
const sha = 'a'.repeat(64);
const cases = [
  { type: 'outline', taskType: 'novel_outline_generate', stage: 'OUTLINE' },
  { type: 'stage_outline', taskType: 'stage_outline_generate', stage: 'OUTLINE' },
  { type: 'chapter_plan', taskType: 'chapter_plan_generate', stage: 'CHAPTER_PLAN' }
] as const;

function draft(type: StructureType, chapterLimit = 3): StructureAssetDraft {
  return {
    objectType: type, title: '回档人生', summary: '主角重新选择人生', score: 88,
    riskLevel: 'none', riskTags: [], recommendedReason: '结构清晰',
    content: {
      title: '回档人生', summary: '主角回到十八岁', recommendation: '保持时间规则一致', riskTags: [],
      sections: [{ title: '主线', body: '主角重建事业与亲情。', items: ['事业', '亲情'] }],
      stages: [{ stageIndex: 1, title: '起步', chapterRange: '1-3', goal: '重新开始', conflict: '旧友阻挠', payoff: '赢得信任' }],
      chapters: type === 'chapter_plan' ? Array.from({ length: chapterLimit }, (_, index) => index + 1).map((chapterNo) => ({
        chapterNo, stageIndex: 1, title: `第${chapterNo}章`, wordTarget: 2000,
        goal: '推进主线', conflict: '旧友阻挠', hook: '留下悬念'
      })) : []
    }
  };
}

function fixture(config: typeof cases[number], chapterLimit = 3) {
  const { type, taskType, stage } = config;
  const tenantId = `tenant_${type}`, novelId = `novel_${type}`, taskId = `task_${type}`;
  const refs = {
    currentDirectionVersionId: 'direction-current', currentSettingVersionId: 'setting-current',
    currentOutlineVersionId: type === 'outline' ? null : 'outline-current',
    currentStageOutlineVersionId: type === 'chapter_plan' ? 'stage-current' : null
  };
  const authority = { action: `${type}_generate`, tenantId, novelId, objectId: novelId,
    facts: { novel: { id: novelId, chapterLimit }, currentRefs: refs } };
  const sourceIdentities = [
    { sourceType: 'novel', sourceId: novelId },
    { sourceType: 'preferences', sourceId: novelId },
    ...([
      ['direction', refs.currentDirectionVersionId], ['setting', refs.currentSettingVersionId],
      ['outline', refs.currentOutlineVersionId], ['stage_outline', refs.currentStageOutlineVersionId]
    ] as const).filter((entry): entry is readonly [string, string] => entry[1] !== null)
      .map(([sourceType, sourceId]) => ({ sourceType, sourceId }))
  ].sort((left, right) => left.sourceType.localeCompare(right.sourceType))
    .map((identity) => ({ ...identity, revision: sha, snapshotHash: sha }));
  const envelope = createExecutionEnvelopeV1_1({
    tenantId, novelId, auditContext: { requestedByUserId: 'user-1', requestedAt: at(0).toISOString() },
    action: `${type}_generate`, objectType: type, objectId: novelId,
    normalizedRequest: type === 'outline' ? {
      currentDirectionVersionId: refs.currentDirectionVersionId,
      currentSettingVersionId: refs.currentSettingVersionId, optimization: null
    } : type === 'stage_outline' ? {
      currentOutlineVersionId: refs.currentOutlineVersionId, optimization: null
    } : {
      currentOutlineVersionId: refs.currentOutlineVersionId,
      currentStageOutlineVersionId: refs.currentStageOutlineVersionId, optimization: null
    },
    sourceVersionRefs: {
      ...refs, sourceVersionIds: [], objectType: type,
      sourceIdentitySchemaVersion: 1, sourceIdentities,
      novelProviderInputSnapshotHash: sha, preferencesSnapshotHash: sha,
      authoritySnapshotHash: hashCanonicalJson(authority), providerInputSnapshotHash: sha
    },
    policyProfileVersionId: 'policy_default_v1', modelRoutingVersion: 'provider:test:v1'
  });
  const row: Row = {
    id: taskId, tenantId, novelId, taskType, objectType: type, objectId: novelId,
    status: 'PROCESSING', statusNote: '处理中', progress: 70, currentStep: 'provider_result_validated',
    triggerSource: 'user', sourceVersionRefs: envelope.sourceVersionRefs,
    conflictScope: type, conflictKey: novelId, idempotencyToken: `${type}-token`,
    requestHash: hashCanonicalJson(envelope), activeClaimKey: `${type}-claim`,
    policyProfileVersionId: envelope.policyProfileVersionId, modelRoutingVersion: envelope.modelRoutingVersion,
    promptTemplateVersionId: null, inputSummary: type, outputSummary: null,
    resultVersionId: null, resultVersionIdsJson: [], retryOfTaskId: null, failureCategory: null,
    errorCode: null, errorMessage: null, resultObjectType: null, resultObjectId: null,
    userAcceptedResult: false, cancelRequestedAt: null, cancelReason: null, startedAt: at(0),
    finishedAt: null, createdBy: 'user-1', createdAt: at(0), updatedAt: at(3), metadata: {},
    leaseOwnerId: 'worker-1', leaseToken: 'lease-1', leaseExpiresAt: at(60),
    lastHeartbeatAt: at(3), retryCount: 0, maxRetries: 0, executionEnvelopeJson: envelope,
    providerAttemptId: 'attempt-1', providerAttemptPhase: 'PROVIDER_RESULT_VALIDATED',
    providerDispatchedAt: at(2), resultReceiptHash: null, rootTaskId: taskId,
    providerCallBudgetMax: 1, providerCallBudgetUsed: 1, durationDeadlineAt: at(90),
    costBudgetMicrosMax: 0n, costBudgetMicrosUsed: 0n
  };
  const input: LeasedCreativeFinalizeInput = {
    tenantId, taskId, leaseOwnerId: 'worker-1', leaseToken: 'lease-1',
    providerAttemptId: 'attempt-1', authoritativeNow: at(4), validatedResult: draft(type, chapterLimit)
  };
  const state = {
    row, novel: { id: novelId, ...refs, creationStage: stage, stageStatus: 'GENERATING' },
    versions: [] as Row[], events: [] as Row[], logs: [] as Row[], locks: [] as unknown[],
    authorityReads: 0, stale: false, failStage: '', loseTaskCas: false, loseNovelCas: false
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
            assert.equal(where.taskType, taskType);
            assert.equal(where.status, 'PROCESSING');
            assert.equal(where.leaseOwnerId, 'worker-1');
            assert.equal(where.leaseToken, 'lease-1');
            assert.equal(where.providerAttemptId, 'attempt-1');
            assert.equal(where.providerAttemptPhase, 'PROVIDER_RESULT_VALIDATED');
            assert.equal(where.providerCallBudgetUsed, 1);
            assert.deepEqual(where.durationDeadlineAt, { gt: input.authoritativeNow });
            assert.equal(where.cancelRequestedAt, null);
            if (state.failStage === 'task') throw new Error('injected task fault');
            if (state.loseTaskCas) return { count: 0 };
            Object.assign(pending.row, data);
            return { count: 1 };
          }
        },
        creativeVersion: {
          findFirst: async () => null,
          create: async ({ data }: { data: Row }) => {
            const version = { id: state.failStage === 'receipt' ? 'v'.repeat(33) : `${type}-version-1`, ...data };
            pending.versions.push(version);
            if (state.failStage === 'asset') throw new Error('injected asset fault');
            return version;
          }
        },
        novel: { updateMany: async ({ where, data }: { where: Row; data: Row }) => {
          for (const [key, value] of Object.entries(refs)) assert.equal(where[key], value, key);
          for (const key of Object.keys(refs)) assert.equal(data[key], undefined, `candidate must not adopt ${key}`);
          if (state.failStage === 'novel') throw new Error('injected novel fault');
          if (state.loseNovelCas) return { count: 0 };
          Object.assign(pending.novel, data);
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
    assert.ok(state.locks.length >= 8, 'authority must be read under row locks');
    state.authorityReads += 1;
    return state.stale ? null : authority;
  };
  return { repository, state, input, refs };
}

describe('Prisma outline structure leased fenced finalize', () => {
  for (const config of cases) {
    it(`${config.type}: writes a candidate and safe receipt atomically without adopting`, async () => {
      const { repository, state, input, refs } = fixture(config);
      assert.equal(await repository.getLeasedExecutionCapability(config.taskType), 'disabled');
      assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'applied');
      assert.equal(state.authorityReads, 1);
      assert.equal(state.versions.length, 1);
      assert.equal(state.versions[0].objectType, config.type);
      assert.equal(state.versions[0].objectId, config.type);
      assert.equal(state.versions[0].status, 'CANDIDATE');
      assert.equal(state.versions[0].sourceTaskId, input.taskId);
      assert.deepEqual(state.versions[0].sourceVersionRefs, state.row.executionEnvelopeJson.sourceVersionRefs);
      for (const [key, value] of Object.entries(refs)) assert.equal(state.novel[key as keyof typeof refs], value);
      assert.equal(state.novel.creationStage, config.stage);
      assert.equal(state.novel.stageStatus, 'WAITING_USER');
      assert.equal(state.row.status, 'WAITING_CONFIRMATION');
      assert.equal(state.row.resultVersionId, state.versions[0].id);
      assert.deepEqual(state.row.resultVersionIdsJson, [state.versions[0].id]);
      assert.match(state.row.resultReceiptHash, /^[a-f0-9]{64}$/);
      assert.equal(state.row.leaseToken, null);
      assert.equal(state.events[0].eventType, 'task_finalized');
      assert.deepEqual(state.logs[0].afterSnapshot.resultVersionIds, [state.versions[0].id]);
      assert.equal(state.logs[0].action, 'generation_task_finalized');
      assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'fenced');
      assert.equal(state.versions.length, 1);
    });

    it(`${config.type}: fences stale lease, attempt, deadline, cancel, retry and budget`, async () => {
      for (const patch of [
        { leaseOwnerId: 'other' }, { leaseToken: 'other' }, { providerAttemptId: 'other' },
        { authoritativeNow: at(60) }, { authoritativeNow: at(90) }
      ]) {
        const { repository, state, input } = fixture(config);
        assert.equal((await repository.finalizeLeasedAction({ ...input, ...patch })).outcome, 'fenced');
        assert.equal(state.versions.length, 0);
        assert.equal(state.row.status, 'PROCESSING');
      }
      for (const patch of [
        { cancelRequestedAt: at(3) }, { retryOfTaskId: 'old-task' },
        { providerAttemptPhase: 'PROVIDER_CALL_STARTED' }, { providerCallBudgetUsed: 0 },
        { providerCallBudgetUsed: 2 }, { providerCallBudgetMax: 0 }
      ]) {
        const { repository, state, input } = fixture(config);
        Object.assign(state.row, patch);
        assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'fenced');
        assert.equal(state.versions.length, 0);
      }
    });

    it(`${config.type}: fails stale source and invalid drafts with no asset or receipt`, async () => {
      const valid = draft(config.type);
      const invalid = [
        { ...valid, objectType: 'setting' },
        { ...valid, score: 101 },
        { ...valid, content: { ...valid.content, stages: [] } },
        { ...valid, content: { ...valid.content, sections: [{ title: 'broken' }] } },
        { ...valid, extra: 'unvalidated' },
        ...(config.type === 'chapter_plan' ? [
          { ...valid, content: { ...valid.content, chapters: valid.content.chapters.slice(0, 2) } },
          { ...valid, content: { ...valid.content, chapters: valid.content.chapters.map((chapter, index) =>
            index === 1 ? { ...chapter, chapterNo: 3 } : chapter) } }
        ] : [])
      ];
      for (const validatedResult of invalid) {
        const { repository, state, input } = fixture(config);
        assert.equal((await repository.finalizeLeasedAction({ ...input, validatedResult: validatedResult as StructureAssetDraft })).outcome, 'applied');
        assert.equal(state.row.status, 'FAILED');
        assert.equal(state.row.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
        assert.equal(state.row.resultReceiptHash, null);
        assert.equal(state.versions.length, 0);
        assert.equal(state.events[0].eventType, 'task_failed');
        assert.equal(state.logs[0].action, 'generation_task_failed');
      }
      const { repository, state, input } = fixture(config);
      state.stale = true;
      assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'applied');
      assert.equal(state.row.errorCode, 'SOURCE_STALE');
      assert.equal(state.versions.length, 0);
      assert.equal(state.row.resultReceiptHash, null);
    });

    it(`${config.type}: rejects damaged envelope and rolls back partial transaction writes`, async () => {
      const damaged = fixture(config);
      damaged.state.row.requestHash = '0'.repeat(64);
      assert.equal((await damaged.repository.finalizeLeasedAction(damaged.input)).outcome, 'applied');
      assert.equal(damaged.state.row.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
      assert.equal(damaged.state.versions.length, 0);
      for (const stage of ['asset', 'receipt', 'task', 'novel', 'event', 'audit']) {
        const { repository, state, input } = fixture(config);
        state.failStage = stage;
        await assert.rejects(repository.finalizeLeasedAction(input), stage);
        assert.equal(state.row.status, 'PROCESSING', stage);
        assert.equal(state.row.resultReceiptHash, null, stage);
        assert.equal(state.novel.stageStatus, 'GENERATING', stage);
        assert.equal(state.versions.length, 0, stage);
        assert.equal(state.events.length, 0, stage);
        assert.equal(state.logs.length, 0, stage);
      }
      for (const lostCas of ['loseTaskCas', 'loseNovelCas'] as const) {
        const { repository, state, input } = fixture(config);
        state[lostCas] = true;
        await assert.rejects(repository.finalizeLeasedAction(input), /lost its .* transition/);
        assert.equal(state.row.status, 'PROCESSING');
        assert.equal(state.versions.length, 0);
      }
    });
  }

  it('chapter_plan accepts a complete plan beyond 100 chapters', async () => {
    const { repository, state, input } = fixture(cases[2], 101);
    assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'applied');
    assert.equal(state.versions[0].contentJson.chapters.length, 101);
    assert.equal(state.row.status, 'WAITING_CONFIRMATION');
  });
});
