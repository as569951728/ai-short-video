import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createExecutionEnvelopeV1_1 } from '@ai-shortvideo/shared';
import { evaluateChapterLength } from '../../src/modules/novels/domain/chapterLengthPolicy.js';
import { hashCanonicalJson } from '../../src/modules/novels/domain/executionContract.js';
import type { LeasedCreativeFinalizeInput } from '../../src/modules/novels/domain/novelDomain.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';

type Row = Record<string, any>;
const at = (seconds: number) => new Date(Date.UTC(2030, 0, 1, 0, 0, seconds));
const sha = 'a'.repeat(64);
const originalContent = '甲'.repeat(1160);
const revisedContent = '甲'.repeat(1100);

function fixture() {
  const tenantId = 'tenant_revise', novelId = 'novel_revise', chapterId = 'chapter_4';
  const taskId = 'task_revise', originalId = 'candidate_1', planId = 'chapter_plan_1';
  const refs = { currentChapterPlanVersionId: planId, candidateVersionId: originalId,
    currentContentVersionId: null };
  const authority = { action: 'chapter_overlength_revise', tenantId, novelId,
    objectId: chapterId, facts: { chapterId, candidateVersionId: originalId } };
  const identities = [
    ['chapter', chapterId], ['chapter_content', originalId], ['chapter_plan', planId], ['novel', novelId]
  ].map(([sourceType, sourceId]) => ({ sourceType, sourceId, revision: sha, snapshotHash: sha }));
  const envelope = createExecutionEnvelopeV1_1({
    tenantId, novelId, auditContext: { requestedByUserId: 'user_revise', requestedAt: at(0).toISOString() },
    action: 'chapter_overlength_revise', objectType: 'chapter', objectId: chapterId,
    normalizedRequest: { chapterId, candidateVersionId: originalId },
    sourceVersionRefs: { ...refs, sourceIdentitySchemaVersion: 1, sourceIdentities: identities,
      novelProviderInputSnapshotHash: sha, chapterProviderInputSnapshotHash: sha,
      authoritySnapshotHash: hashCanonicalJson(authority),
      providerInputSnapshotHash: sha },
    policyProfileVersionId: 'policy_default_v1', modelRoutingVersion: 'provider:test:v1'
  });
  const row: Row = {
    id: taskId, tenantId, novelId, taskType: 'chapter_overlength_revise',
    objectType: 'chapter', objectId: chapterId, status: 'PROCESSING', statusNote: '处理中',
    progress: 70, currentStep: 'provider_result_validated', triggerSource: 'user',
    sourceVersionRefs: envelope.sourceVersionRefs, conflictScope: 'chapter', conflictKey: chapterId,
    idempotencyToken: 'revise-token', requestHash: hashCanonicalJson(envelope),
    activeClaimKey: 'revise-claim', policyProfileVersionId: envelope.policyProfileVersionId,
    modelRoutingVersion: envelope.modelRoutingVersion, promptTemplateVersionId: null,
    inputSummary: '超长正文精简', outputSummary: null, resultVersionId: null,
    resultVersionIdsJson: [], retryOfTaskId: null, failureCategory: null,
    errorCode: null, errorMessage: null, resultObjectType: null, resultObjectId: null,
    userAcceptedResult: false, cancelRequestedAt: null, cancelReason: null,
    startedAt: at(0), finishedAt: null, createdBy: 'user_revise', createdAt: at(0),
    updatedAt: at(3), metadata: {}, leaseOwnerId: 'worker_revise', leaseToken: 'lease_revise',
    leaseExpiresAt: at(60), lastHeartbeatAt: at(3), retryCount: 0, maxRetries: 0,
    executionEnvelopeJson: envelope, providerAttemptId: 'attempt_revise',
    providerAttemptPhase: 'PROVIDER_RESULT_VALIDATED', providerDispatchedAt: at(2),
    resultReceiptHash: null, rootTaskId: taskId, providerCallBudgetMax: 1,
    providerCallBudgetUsed: 1, durationDeadlineAt: at(90),
    costBudgetMicrosMax: 0n, costBudgetMicrosUsed: 0n
  };
  const chapter: Row = {
    id: chapterId, tenantId, novelId, chapterNo: 4, stageIndex: 1, title: '第四章',
    wordTarget: 1000, wordCount: 0, mainStatus: 'pending', statusNote: null,
    impactLevel: 'NONE', currentFeatureCardVersionId: null, currentContentVersionId: null,
    currentReviewReportId: null, lastGenerationTaskId: null, createdAt: at(0),
    updatedAt: at(0), deletedAt: null, metadata: {}
  };
  const original: Row = {
    id: originalId, tenantId, novelId, chapterId, versionNo: 1, status: 'CANDIDATE',
    staleLevel: 'NONE', sourceType: 'ai_overlength_original', sourceTaskId: 'prior_task',
    sourceVersionRefs: refs, rewriteReason: null, content: originalContent,
    wordCount: originalContent.length, summary: null, reviewScore: null,
    decisionRecordId: null, createdBy: 'user_revise', createdAt: at(0),
    metadata: { lengthGate: evaluateChapterLength(originalContent, 1000) }
  };
  const state = { row, novel: { id: novelId, creationStage: 'body',
      currentChapterPlanVersionId: planId }, chapter, original,
    versions: [] as Row[], events: [] as Row[], logs: [] as Row[],
    failStage: '', stale: false, taskCasLost: false, priorRevision: false };
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
            assert.equal(where.leaseOwnerId, 'worker_revise');
            assert.equal(where.leaseToken, 'lease_revise');
            assert.equal(where.providerAttemptId, 'attempt_revise');
            assert.equal(where.providerCallBudgetUsed, 1);
            assert.equal(where.cancelRequestedAt, null);
            if (state.failStage === 'task') throw new Error('injected task fault');
            if (state.taskCasLost) return { count: 0 };
            Object.assign(pending!.row, data);
            return { count: 1 };
          }
        },
        novelChapter: { findFirst: async () => pending!.chapter },
        chapterContentVersion: {
          findFirst: async ({ where }: { where: Row }) => where.sourceType === 'ai_overlength_revision'
            ? (state.priorRevision ? { id: 'prior_revision' } : null)
            : pending!.versions.at(-1) ?? pending!.original,
          create: async ({ data }: { data: Row }) => {
            const version = { id: 'revision_1', ...data };
            pending!.versions.push(version);
            if (state.failStage === 'asset') throw new Error('injected asset fault');
            return version;
          }
        },
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
  repository.findChapterContentVersionById = async () => ({
    ...pending!.original, status: 'candidate', staleLevel: 'none'
  }) as never;
  const input: LeasedCreativeFinalizeInput = {
    tenantId, taskId, leaseOwnerId: 'worker_revise', leaseToken: 'lease_revise',
    providerAttemptId: 'attempt_revise', authoritativeNow: at(4), validatedResult: revisedContent
  };
  return { repository, state, input };
}

describe('Prisma overlength revision leased finalize', () => {
  it('saves only one bounded candidate and a safe receipt, leaving formal content untouched', async () => {
    const { repository, state, input } = fixture();
    assert.equal(await repository.getLeasedExecutionCapability('chapter_overlength_revise'), 'disabled');
    assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'applied');
    assert.equal(state.versions.length, 1);
    assert.equal(state.versions[0]?.status, 'CANDIDATE');
    assert.equal(state.versions[0]?.sourceType, 'ai_overlength_revision');
    assert.equal(state.versions[0]?.metadata.reviewRequired, true);
    assert.equal(state.versions[0]?.metadata.revisionOfCandidateId, state.original.id);
    assert.equal(state.chapter.currentContentVersionId, null);
    assert.equal(state.row.status, 'WAITING_CONFIRMATION');
    assert.deepEqual(state.row.resultVersionIdsJson, ['revision_1']);
    assert.match(state.row.resultReceiptHash, /^[a-f0-9]{64}$/);
    assert.equal(state.row.providerCallBudgetUsed, 1);
    assert.equal(state.row.leaseToken, null);
    assert.equal(state.events[0]?.eventType, 'task_finalized');
    assert.equal(state.logs[0]?.action, 'generation_task_finalized');
    assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'fenced');
    assert.equal(state.versions.length, 1);
  });

  it('fences a lost lease, cancelled task, stale source, prior revision and invalid output', async () => {
    for (const patch of [{ leaseToken: 'other' }, { leaseOwnerId: 'other' },
      { providerAttemptId: 'other' }, { authoritativeNow: at(60) }]) {
      const { repository, state, input } = fixture();
      assert.equal((await repository.finalizeLeasedAction({ ...input, ...patch })).outcome, 'fenced');
      assert.equal(state.versions.length, 0);
    }
    for (const patch of [{ cancelRequestedAt: at(3) }, { providerCallBudgetUsed: 0 }]) {
      const { repository, state, input } = fixture();
      Object.assign(state.row, patch);
      assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'fenced');
      assert.equal(state.versions.length, 0);
    }
    for (const mutate of [
      (state: ReturnType<typeof fixture>['state']) => { state.stale = true; },
      (state: ReturnType<typeof fixture>['state']) => { state.priorRevision = true; },
      (state: ReturnType<typeof fixture>['state']) => {
        state.original.sourceVersionRefs = { currentChapterPlanVersionId: 'old_plan' };
      },
      (state: ReturnType<typeof fixture>['state']) => { state.chapter.currentContentVersionId = 'formal_1'; }
    ]) {
      const { repository, state, input } = fixture();
      mutate(state);
      assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'applied');
      assert.equal(state.row.errorCode, 'SOURCE_STALE');
      assert.equal(state.versions.length, 0);
    }
    for (const validatedResult of ['乙'.repeat(1100), '甲'.repeat(800), '甲'.repeat(1155), 123]) {
      const { repository, state, input } = fixture();
      assert.equal((await repository.finalizeLeasedAction({ ...input, validatedResult })).outcome, 'applied');
      assert.equal(state.row.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
      assert.equal(state.versions.length, 0);
      assert.equal(state.row.resultReceiptHash, null);
    }
  });

  it('rolls back the candidate, task, event and audit when any write fails', async () => {
    for (const failStage of ['asset', 'task', 'event', 'audit']) {
      const { repository, state, input } = fixture();
      state.failStage = failStage;
      await assert.rejects(repository.finalizeLeasedAction(input), /injected/);
      assert.equal(state.versions.length, 0, failStage);
      assert.equal(state.row.status, 'PROCESSING', failStage);
      assert.equal(state.events.length, 0, failStage);
      assert.equal(state.logs.length, 0, failStage);
    }
  });
});
