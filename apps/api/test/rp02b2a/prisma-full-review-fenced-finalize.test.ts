import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createExecutionEnvelopeV1_1 } from '@ai-shortvideo/shared';
import { FULL_REVIEW_CANONICAL_DIMENSION_KEYS } from '../../src/modules/novels/services/actionExecutionPlan.js';
import { hashCanonicalJson } from '../../src/modules/novels/domain/executionContract.js';
import type { FullReviewDraft, LeasedCreativeFinalizeInput } from '../../src/modules/novels/domain/novelDomain.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';

type Row = Record<string, any>;
const at = (seconds: number) => new Date(Date.UTC(2030, 0, 1, 0, 0, seconds));
const sha = 'c'.repeat(64);

function draft(): FullReviewDraft {
  return {
    totalScore: 84, rating: 'A', gateResult: 'pass', summary: '全书结构与事实证据完整。',
    strengths: ['主线完整'], problems: [], suggestions: [],
    dimensionScores: FULL_REVIEW_CANONICAL_DIMENSION_KEYS.map((key, index) => ({
      key, label: `维度 ${index + 1}`, score: 84, weight: index < 2 ? 0.16 : 0.17,
      evidence: '第 1 章有对应证据。', penaltyPoints: 0
    })),
    issues: [], videoSuggestion: '从第 1 章切入。',
    firstVideoSuggestion: {
      chapterRange: '1-1', openingSlice: '开场冲突', narrationHook: '主角开始反击',
      firstScreenSubtitle: '反击开始', titleHook: '主角翻盘', endingSuspense: '幕后人出现',
      suggestedFormat: '旁白加字幕', riskTips: []
    },
    platformRisks: [], originalityRisks: [], aiFlavorRisks: [], lowScoreContinueRisks: [],
    reviewPolicyVersionId: 'policy-1'
  };
}

function fixture() {
  const tenantId = 'tenant_review', novelId = 'novel_review', taskId = 'task_review';
  const chapterId = 'chapter-1';
  const authority = { action: 'novel_full_review', tenantId, novelId, objectId: novelId,
    facts: { chapterContentVersionIds: ['content-1'] } };
  const identities = [
    ['novel', novelId], ['direction', 'direction-1'], ['setting', 'setting-1'],
    ['outline', 'outline-1'], ['stage_outline', 'stage-outline-1'], ['chapter_plan', 'chapter-plan-1'],
    ['chapter', chapterId], ['chapter_content', 'content-1'],
    ['chapter_feature_card', 'feature-1'], ['chapter_review_report', 'chapter-review-1'],
    ['long_term_memory', 'memory-1']
  ].map(([sourceType, sourceId]) => ({ sourceType, sourceId, revision: sha, snapshotHash: sha }))
    .sort((left, right) => {
      const leftKey = `${left.sourceType}\u0000${left.sourceId}`;
      const rightKey = `${right.sourceType}\u0000${right.sourceId}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
  const envelope = createExecutionEnvelopeV1_1({
    tenantId, novelId, auditContext: { requestedByUserId: 'user_review', requestedAt: at(0).toISOString() },
    action: 'novel_full_review', objectType: 'novel', objectId: novelId,
    normalizedRequest: { policyProfileVersionId: 'policy-1', expectedNovelVersion: at(0).toISOString() },
    sourceVersionRefs: {
      currentDirectionVersionId: 'direction-1', currentSettingVersionId: 'setting-1',
      currentOutlineVersionId: 'outline-1', currentStageOutlineVersionId: 'stage-outline-1',
      currentChapterPlanVersionId: 'chapter-plan-1',
      chapterContentVersionIds: [{ chapterId, chapterNo: 1, currentContentVersionId: 'content-1',
        currentFeatureCardVersionId: 'feature-1', currentReviewReportId: 'chapter-review-1' }],
      sourceIdentitySchemaVersion: 1,
      sourceIdentities: identities,
      novelProviderInputSnapshotHash: sha, chapterProviderInputSnapshotHash: sha,
      longTermMemoryIdentity: { id: 'memory-1', sourceContentVersionId: 'content-1', snapshotHash: sha },
      evidenceManifestHash: sha, authoritySnapshotHash: hashCanonicalJson(authority),
      providerInputSnapshotHash: sha
    },
    policyProfileVersionId: 'policy-1', modelRoutingVersion: 'provider:test:v1'
  });
  const row: Row = {
    id: taskId, tenantId, novelId, taskType: 'novel_full_review', objectType: 'novel', objectId: novelId,
    status: 'PROCESSING', statusNote: '处理中', progress: 70, currentStep: 'provider_result_validated',
    triggerSource: 'user', sourceVersionRefs: envelope.sourceVersionRefs,
    conflictScope: 'novel', conflictKey: novelId, idempotencyToken: 'review-token',
    requestHash: hashCanonicalJson(envelope), activeClaimKey: 'review-claim',
    policyProfileVersionId: 'policy-1', modelRoutingVersion: envelope.modelRoutingVersion,
    promptTemplateVersionId: null, inputSummary: '全书审稿', outputSummary: null,
    resultVersionId: null, resultVersionIdsJson: [], retryOfTaskId: null,
    failureCategory: null, errorCode: null, errorMessage: null,
    resultObjectType: null, resultObjectId: null, userAcceptedResult: false,
    cancelRequestedAt: null, cancelReason: null, startedAt: at(0), finishedAt: null,
    createdBy: 'user_review', createdAt: at(0), updatedAt: at(3), metadata: {},
    leaseOwnerId: 'worker_review', leaseToken: 'lease_review', leaseExpiresAt: at(60),
    lastHeartbeatAt: at(3), retryCount: 0, maxRetries: 0, executionEnvelopeJson: envelope,
    providerAttemptId: 'attempt_review', providerAttemptPhase: 'PROVIDER_RESULT_VALIDATED',
    providerDispatchedAt: at(2), resultReceiptHash: null, rootTaskId: taskId,
    providerCallBudgetMax: 1, providerCallBudgetUsed: 1, durationDeadlineAt: at(90),
    costBudgetMicrosMax: 0n, costBudgetMicrosUsed: 0n
  };
  const novel: Row = { id: novelId, tenantId, creationStage: 'body', stageStatus: 'completed' };
  const chapter: Row = {
    id: chapterId, tenantId, novelId, chapterNo: 1, mainStatus: 'completed',
    currentContentVersionId: 'content-1', currentFeatureCardVersionId: 'feature-1',
    currentReviewReportId: 'chapter-review-1', deletedAt: null
  };
  const state = {
    row, novel, chapters: [chapter], reports: [] as Row[], gates: [] as Row[],
    events: [] as Row[], logs: [] as Row[], stale: false, failStage: '', taskCasLost: false
  };
  let pending: typeof state | null = null;
  const repository = Object.create(PrismaNovelRepository.prototype) as PrismaNovelRepository & { prisma: unknown };
  Object.defineProperty(repository, 'prisma', { value: {
    generationTask: { findFirst: async ({ where }: { where: Row }) =>
      state.row.tenantId === where.tenantId && state.row.id === (where.id ?? state.row.id)
        && state.row.novelId === (where.novelId ?? state.row.novelId)
        && state.row.idempotencyToken === (where.idempotencyToken ?? state.row.idempotencyToken)
        ? state.row : null },
    reviewReport: { findFirst: async ({ where }: { where: Row }) =>
      state.reports.find((item) => item.tenantId === where.tenantId && item.novelId === where.novelId
        && item.id === (where.id ?? item.id) && item.reviewLevel === where.reviewLevel
        && item.sourceTaskId === (where.sourceTaskId ?? item.sourceTaskId)) ?? null },
    fullReviewGate: { findFirst: async ({ where }: { where: Row }) =>
      state.gates.find((item) => item.tenantId === where.tenantId && item.novelId === where.novelId
        && item.id === (where.id ?? item.id) && item.reviewReportId === (where.reviewReportId ?? item.reviewReportId)) ?? null },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => {
      pending = structuredClone(state);
      const tx = {
        $queryRaw: async () => [],
        generationTask: {
          findFirst: async () => pending!.row,
          findFirstOrThrow: async () => pending!.row,
          updateMany: async ({ where, data }: { where: Row; data: Row }) => {
            assert.equal(where.leaseOwnerId, 'worker_review');
            assert.equal(where.leaseToken, 'lease_review');
            assert.equal(where.providerAttemptId, 'attempt_review');
            assert.equal(where.providerCallBudgetUsed, 1);
            if (state.failStage === 'task') throw new Error('injected task fault');
            if (state.taskCasLost) return { count: 0 };
            Object.assign(pending!.row, data);
            return { count: 1 };
          }
        },
        novelChapter: { findMany: async () => pending!.chapters },
        reviewReport: {
          findFirst: async () => pending!.reports.find((item) => item.sourceTaskId === taskId) ?? null,
          create: async ({ data }: { data: Row }) => {
            pending!.reports.push(data);
            if (state.failStage === 'report') throw new Error('injected report fault');
            return data;
          }
        },
        fullReviewGate: { create: async ({ data }: { data: Row }) => {
          const gate = { id: 'gate-1', ...data };
          pending!.gates.push(gate);
          if (state.failStage === 'gate') throw new Error('injected gate fault');
          return gate;
        } },
        novel: { update: async ({ data }: { data: Row }) => {
          Object.assign(pending!.novel, { creationStage: data.creationStage === 'COMPLETION_CONFIRM' ? 'completion_confirm' : 'full_review',
            stageStatus: data.stageStatus === 'WAITING_USER' ? 'waiting_user' : 'blocked' });
          if (state.failStage === 'novel') throw new Error('injected novel fault');
          return pending!.novel;
        } },
        generationTaskEvent: { create: async ({ data }: { data: Row }) => {
          pending!.events.push(data);
          if (state.failStage === 'event') throw new Error('injected event fault');
          return data;
        } },
        operationLog: { create: async ({ data }: { data: Row }) => {
          pending!.logs.push(data);
          if (state.failStage === 'audit') throw new Error('injected audit fault');
          return data;
        } }
      };
      try {
        const result = await callback(tx);
        Object.assign(state, pending);
        return result;
      } finally {
        pending = null;
      }
    }
  } });
  repository.loadGenerationAuthority = async () => state.stale ? null : authority;
  repository.findById = async () => pending!.novel as never;
  const input: LeasedCreativeFinalizeInput = {
    tenantId, taskId, leaseOwnerId: 'worker_review', leaseToken: 'lease_review',
    providerAttemptId: 'attempt_review', authoritativeNow: at(4), validatedResult: draft()
  };
  return { repository, state, input };
}

describe('Prisma full-review leased finalize', () => {
  it('atomically writes review, gate, receipt and audit without confirming completion', async () => {
    const { repository, state, input } = fixture();
    assert.equal(await repository.getLeasedExecutionCapability('novel_full_review'), 'disabled');
    assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'applied');
    assert.equal(state.reports.length, 1);
    assert.equal(state.reports[0]?.reviewLevel, 'full_novel');
    assert.equal(state.reports[0]?.sourceTaskId, state.row.id);
    assert.deepEqual(state.reports[0]?.metadata.requestFingerprint, {
      taskType: 'novel_full_review', reviewPolicyVersionId: 'policy-1',
      expectedNovelVersion: at(0).toISOString(),
      sourceVersionRefs: {
        currentDirectionVersionId: 'direction-1', currentSettingVersionId: 'setting-1',
        currentOutlineVersionId: 'outline-1', currentStageOutlineVersionId: 'stage-outline-1',
        currentChapterPlanVersionId: 'chapter-plan-1',
        chapterContentVersionIds: [{ chapterId: 'chapter-1', chapterNo: 1,
          currentContentVersionId: 'content-1', currentFeatureCardVersionId: 'feature-1',
          currentReviewReportId: 'chapter-review-1' }]
      }
    });
    assert.equal(state.gates.length, 1);
    assert.equal(state.gates[0]?.allowCompletion, true);
    assert.equal(state.novel.creationStage, 'completion_confirm');
    assert.equal(state.novel.stageStatus, 'waiting_user');
    assert.equal(state.row.status, 'COMPLETED');
    assert.equal(state.row.providerCallBudgetUsed, 1);
    assert.match(state.row.resultReceiptHash, /^[a-f0-9]{64}$/);
    assert.equal(state.events[0]?.eventType, 'task_finalized');
    assert.equal(state.logs[0]?.action, 'generation_task_finalized');
    const latest = await repository.findLatestFullReview(state.row.tenantId, state.row.novelId);
    assert.equal(latest?.reviewReport.id, state.row.resultObjectId);
    assert.equal(latest?.gate.reviewReportId, latest?.reviewReport.id);
    assert.equal(latest?.gate.allowCompletion, true);
    assert.equal((await repository.findFullReviewGateById(state.row.tenantId, state.row.novelId, latest!.gate.id))?.id, latest?.gate.id);
    assert.equal((await repository.findFullReviewByIdempotencyKey(
      state.row.tenantId, state.row.novelId, state.row.idempotencyToken
    ))?.task.id, state.row.id);
    assert.equal(await repository.findLatestFullReview('other-tenant', state.row.novelId), null);
    assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'fenced');
  });

  it('fails closed for stale authority, invalid policy, malformed review and lost lease', async () => {
    for (const patch of [{ leaseOwnerId: 'other' }, { leaseToken: 'other' },
      { providerAttemptId: 'other' }, { authoritativeNow: at(60) }]) {
      const { repository, state, input } = fixture();
      assert.equal((await repository.finalizeLeasedAction({ ...input, ...patch })).outcome, 'fenced');
      assert.equal(state.reports.length, 0);
    }
    for (const mutate of [
      (state: ReturnType<typeof fixture>['state']) => { state.stale = true; },
      (state: ReturnType<typeof fixture>['state']) => { state.chapters[0]!.currentContentVersionId = null; },
      (state: ReturnType<typeof fixture>['state']) => { state.novel.stageStatus = 'blocked'; }
    ]) {
      const { repository, state, input } = fixture();
      mutate(state);
      assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'applied');
      assert.equal(state.row.errorCode, 'SOURCE_STALE');
      assert.equal(state.reports.length, 0);
    }
    for (const validatedResult of [
      { ...draft(), reviewPolicyVersionId: 'other-policy' },
      { ...draft(), totalScore: 101 },
      { ...draft(), apiKey: 'forbidden' }
    ]) {
      const { repository, state, input } = fixture();
      assert.equal((await repository.finalizeLeasedAction({ ...input, validatedResult })).outcome, 'applied');
      assert.equal(state.row.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
      assert.equal(state.reports.length, 0);
    }
  });

  it('keeps a low-score review blocked and leaves forced passage to a separate user decision', async () => {
    const { repository, state, input } = fixture();
    const blocked = draft();
    blocked.totalScore = 65;
    blocked.rating = 'C';
    blocked.gateResult = 'blocked';
    blocked.dimensionScores = blocked.dimensionScores.map((dimension) => ({ ...dimension, score: 65 }));
    assert.equal((await repository.finalizeLeasedAction({ ...input, validatedResult: blocked })).outcome, 'applied');
    assert.equal(state.reports[0]?.allowNextStep, false);
    assert.equal(state.gates[0]?.allowCompletion, false);
    assert.equal(state.gates[0]?.metadata.forcePassAllowed, true);
    assert.equal(state.novel.creationStage, 'full_review');
    assert.equal(state.novel.stageStatus, 'blocked');
    assert.equal(state.row.userAcceptedResult, false);
  });

  it('rolls back the report, gate, novel, task, event and audit together', async () => {
    for (const failStage of ['report', 'gate', 'novel', 'task', 'event', 'audit']) {
      const { repository, state, input } = fixture();
      state.failStage = failStage;
      await assert.rejects(repository.finalizeLeasedAction(input), /injected|lost its fenced/);
      assert.equal(state.reports.length, 0, failStage);
      assert.equal(state.gates.length, 0, failStage);
      assert.equal(state.novel.creationStage, 'body', failStage);
      assert.equal(state.row.status, 'PROCESSING', failStage);
      assert.equal(state.events.length, 0, failStage);
      assert.equal(state.logs.length, 0, failStage);
    }
    const { repository, state, input } = fixture();
    state.taskCasLost = true;
    await assert.rejects(repository.finalizeLeasedAction(input), /lost its fenced task transition/);
    assert.equal(state.reports.length, 0);
    assert.equal(state.gates.length, 0);
    assert.equal(state.novel.creationStage, 'body');
  });
});
