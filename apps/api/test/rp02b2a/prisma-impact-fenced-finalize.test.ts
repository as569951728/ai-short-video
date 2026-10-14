import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createExecutionEnvelopeV1_1 } from '@ai-shortvideo/shared';
import { hashCanonicalJson } from '../../src/modules/novels/domain/executionContract.js';
import type { LeasedCreativeFinalizeInput } from '../../src/modules/novels/domain/novelDomain.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';

type Row = Record<string, any>;
const at = (seconds: number) => new Date(Date.UTC(2030, 0, 1, 0, 0, seconds));
const sha = 'b'.repeat(64);
const validImpact = {
  impactLevel: 'medium', summary: '后续章节需要核对旧线索。',
  changedFacts: ['旧线索触发方式'], affectedChapterIds: ['chapter_5'],
  affectedVideoReferenceIds: [], recommendedHandling: '先处理承接，再继续生成。',
  suggestedActions: ['检查第五章'], blocksFullReview: true
};

function fixture() {
  const tenantId = 'tenant_impact', novelId = 'novel_impact', chapterId = 'chapter_4';
  const taskId = 'task_impact', contentId = 'formal_content_1';
  const authority = { action: 'chapter_impact_assess', tenantId, novelId,
    objectId: chapterId, facts: { chapterId, currentContentVersionId: contentId } };
  const identities = [['chapter', chapterId], ['chapter_content', contentId], ['novel', novelId]]
    .map(([sourceType, sourceId]) => ({ sourceType, sourceId, revision: sha, snapshotHash: sha }));
  const envelope = createExecutionEnvelopeV1_1({
    tenantId, novelId, auditContext: { requestedByUserId: 'user_impact', requestedAt: at(0).toISOString() },
    action: 'chapter_impact_assess', objectType: 'chapter', objectId: chapterId,
    normalizedRequest: { chapterId, currentContentVersionId: contentId, reason: '核对后续线索' },
    sourceVersionRefs: { currentContentVersionId: contentId,
      sourceIdentitySchemaVersion: 1, sourceIdentities: identities,
      novelProviderInputSnapshotHash: sha, chapterProviderInputSnapshotHash: sha,
      authoritySnapshotHash: hashCanonicalJson(authority), providerInputSnapshotHash: sha },
    policyProfileVersionId: 'policy_default_v1', modelRoutingVersion: 'provider:test:v1'
  });
  const row: Row = {
    id: taskId, tenantId, novelId, taskType: 'chapter_impact_assess',
    objectType: 'chapter', objectId: chapterId, status: 'PROCESSING', statusNote: '处理中',
    progress: 70, currentStep: 'provider_result_validated', triggerSource: 'user',
    sourceVersionRefs: envelope.sourceVersionRefs, conflictScope: 'chapter', conflictKey: chapterId,
    idempotencyToken: 'impact-token', requestHash: hashCanonicalJson(envelope),
    activeClaimKey: 'impact-claim', policyProfileVersionId: envelope.policyProfileVersionId,
    modelRoutingVersion: envelope.modelRoutingVersion, promptTemplateVersionId: null,
    inputSummary: '章节影响评估', outputSummary: null, resultVersionId: null,
    resultVersionIdsJson: [], retryOfTaskId: null, failureCategory: null,
    errorCode: null, errorMessage: null, resultObjectType: null, resultObjectId: null,
    userAcceptedResult: false, cancelRequestedAt: null, cancelReason: null,
    startedAt: at(0), finishedAt: null, createdBy: 'user_impact', createdAt: at(0),
    updatedAt: at(3), metadata: {}, leaseOwnerId: 'worker_impact', leaseToken: 'lease_impact',
    leaseExpiresAt: at(60), lastHeartbeatAt: at(3), retryCount: 0, maxRetries: 0,
    executionEnvelopeJson: envelope, providerAttemptId: 'attempt_impact',
    providerAttemptPhase: 'PROVIDER_RESULT_VALIDATED', providerDispatchedAt: at(2),
    resultReceiptHash: null, rootTaskId: taskId, providerCallBudgetMax: 1,
    providerCallBudgetUsed: 1, durationDeadlineAt: at(90),
    costBudgetMicrosMax: 0n, costBudgetMicrosUsed: 0n
  };
  const chapter: Row = {
    id: chapterId, tenantId, novelId, chapterNo: 4, stageIndex: 1, title: '第四章',
    wordTarget: 1800, wordCount: 1800, mainStatus: 'completed', statusNote: null,
    impactLevel: 'NONE', currentFeatureCardVersionId: null, currentContentVersionId: contentId,
    currentReviewReportId: null, lastGenerationTaskId: null, createdAt: at(0),
    updatedAt: at(0), deletedAt: null, metadata: {}
  };
  const formal: Row = {
    id: contentId, tenantId, novelId, chapterId, versionNo: 1, status: 'CURRENT',
    staleLevel: 'NONE', sourceType: 'manual', sourceTaskId: 'prior_task',
    sourceVersionRefs: {}, rewriteReason: null, content: '甲'.repeat(1800),
    wordCount: 1800, summary: '主角找到反击证据。', reviewScore: 80,
    decisionRecordId: null, createdBy: 'user_impact', createdAt: at(0), metadata: {}
  };
  const state = { row, chapter, formal, cases: [] as Row[], events: [] as Row[], logs: [] as Row[],
    stale: false, failStage: '', taskCasLost: false };
  let pending: typeof state | null = null;
  const repository = Object.create(PrismaNovelRepository.prototype) as PrismaNovelRepository & { prisma: unknown };
  Object.defineProperty(repository, 'prisma', { value: {
    generationTask: { findFirst: async () => state.row },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => {
      pending = structuredClone(state);
      const tx = {
        $queryRaw: async () => [],
        generationTask: {
          findFirst: async () => pending!.row,
          findFirstOrThrow: async () => pending!.row,
          updateMany: async ({ where, data }: { where: Row; data: Row }) => {
            assert.equal(where.leaseOwnerId, 'worker_impact');
            assert.equal(where.leaseToken, 'lease_impact');
            assert.equal(where.providerAttemptId, 'attempt_impact');
            assert.equal(where.providerCallBudgetUsed, 1);
            assert.equal(where.cancelRequestedAt, null);
            if (state.failStage === 'task') throw new Error('injected task fault');
            if (state.taskCasLost) return { count: 0 };
            Object.assign(pending!.row, data);
            return { count: 1 };
          }
        },
        novelChapter: { findFirst: async () => pending!.chapter },
        impactCase: { create: async ({ data }: { data: Row }) => {
          const item = { id: 'impact_case_1', ...data };
          pending!.cases.push(item);
          if (state.failStage === 'asset') throw new Error('injected asset fault');
          return item;
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
  repository.findChapterContentVersionById = async () => ({
    ...pending!.formal, status: pending!.formal.status === 'CURRENT' ? 'current' : 'historical', staleLevel: 'none'
  }) as never;
  const input: LeasedCreativeFinalizeInput = {
    tenantId, taskId, leaseOwnerId: 'worker_impact', leaseToken: 'lease_impact',
    providerAttemptId: 'attempt_impact', authoritativeNow: at(4), validatedResult: validImpact
  };
  return { repository, state, input };
}

describe('Prisma chapter impact leased finalize', () => {
  it('writes an impact case without changing formal content', async () => {
    const { repository, state, input } = fixture();
    assert.equal(await repository.getLeasedExecutionCapability('chapter_impact_assess'), 'disabled');
    assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'applied');
    assert.equal(state.cases.length, 1);
    assert.equal(state.cases[0]?.impactLevel, 'MEDIUM');
    assert.equal(state.cases[0]?.status, 'waiting_decision');
    assert.deepEqual(state.cases[0]?.affectedChapterIdsJson, ['chapter_5']);
    assert.equal(state.cases[0]?.sourceOldVersionId, state.formal.id);
    assert.equal(state.cases[0]?.sourceNewVersionId, state.formal.id);
    assert.equal(state.chapter.currentContentVersionId, state.formal.id);
    assert.equal(state.formal.status, 'CURRENT');
    assert.equal(state.row.status, 'COMPLETED');
    assert.equal(state.row.providerCallBudgetUsed, 1);
    assert.match(state.row.resultReceiptHash, /^[a-f0-9]{64}$/);
    assert.equal(state.events[0]?.eventType, 'task_finalized');
    assert.equal(state.logs[0]?.action, 'generation_task_finalized');
    assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'fenced');
  });

  it('fences stale work and rejects invalid model results', async () => {
    for (const patch of [{ leaseOwnerId: 'other' }, { leaseToken: 'other' },
      { providerAttemptId: 'other' }, { authoritativeNow: at(60) }]) {
      const { repository, state, input } = fixture();
      assert.equal((await repository.finalizeLeasedAction({ ...input, ...patch })).outcome, 'fenced');
      assert.equal(state.cases.length, 0);
    }
    for (const patch of [{ cancelRequestedAt: at(3) }, { providerCallBudgetUsed: 0 }]) {
      const { repository, state, input } = fixture();
      Object.assign(state.row, patch);
      assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'fenced');
      assert.equal(state.cases.length, 0);
    }
    for (const mutate of [
      (state: ReturnType<typeof fixture>['state']) => { state.stale = true; },
      (state: ReturnType<typeof fixture>['state']) => { state.chapter.currentContentVersionId = 'other'; },
      (state: ReturnType<typeof fixture>['state']) => { state.formal.status = 'HISTORICAL'; }
    ]) {
      const { repository, state, input } = fixture();
      mutate(state);
      assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'applied');
      assert.equal(state.row.errorCode, 'SOURCE_STALE');
      assert.equal(state.cases.length, 0);
    }
    for (const validatedResult of [
      { ...validImpact, blocksFullReview: false },
      { ...validImpact, suggestedActions: [] },
      { ...validImpact, apiKey: 'forbidden' }
    ]) {
      const { repository, state, input } = fixture();
      assert.equal((await repository.finalizeLeasedAction({ ...input, validatedResult })).outcome, 'applied');
      assert.equal(state.row.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
      assert.equal(state.cases.length, 0);
    }
  });

  it('rolls back impact case, task, event and audit together', async () => {
    for (const failStage of ['asset', 'task', 'event', 'audit']) {
      const { repository, state, input } = fixture();
      state.failStage = failStage;
      await assert.rejects(repository.finalizeLeasedAction(input), /injected/);
      assert.equal(state.cases.length, 0, failStage);
      assert.equal(state.row.status, 'PROCESSING', failStage);
      assert.equal(state.events.length, 0, failStage);
      assert.equal(state.logs.length, 0, failStage);
    }
  });
});
