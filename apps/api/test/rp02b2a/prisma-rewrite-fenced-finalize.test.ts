import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createExecutionEnvelopeV1_1 } from '@ai-shortvideo/shared';
import { hashCanonicalJson } from '../../src/modules/novels/domain/executionContract.js';
import type { LeasedCreativeFinalizeInput } from '../../src/modules/novels/domain/novelDomain.js';
import { MockBodyProvider } from '../../src/modules/novels/providers/mockBodyProvider.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';

type Row = Record<string, any>;
const at = (seconds: number) => new Date(Date.UTC(2030, 0, 1, 0, 0, seconds));
const sha = 'a'.repeat(64);

async function fixture() {
  const tenantId = 'tenant_rewrite', novelId = 'novel_rewrite', chapterId = 'chapter_4';
  const taskId = 'task_rewrite', contentId = 'formal_content_1';
  const authority = { action: 'chapter_rewrite', tenantId, novelId,
    objectId: chapterId, facts: { chapterId, currentContentVersionId: contentId } };
  const identities = [
    ['chapter', chapterId], ['chapter_content', contentId], ['novel', novelId]
  ].map(([sourceType, sourceId]) => ({ sourceType, sourceId, revision: sha, snapshotHash: sha }));
  const envelope = createExecutionEnvelopeV1_1({
    tenantId, novelId, auditContext: { requestedByUserId: 'user_rewrite', requestedAt: at(0).toISOString() },
    action: 'chapter_rewrite', objectType: 'chapter', objectId: chapterId,
    normalizedRequest: { chapterId, currentContentVersionId: contentId, instruction: '强化反击证据', reason: '用户要求改稿' },
    sourceVersionRefs: { currentContentVersionId: contentId,
      sourceIdentitySchemaVersion: 1, sourceIdentities: identities,
      novelProviderInputSnapshotHash: sha, chapterProviderInputSnapshotHash: sha,
      authoritySnapshotHash: hashCanonicalJson(authority), providerInputSnapshotHash: sha },
    policyProfileVersionId: 'policy_default_v1', modelRoutingVersion: 'provider:test:v1'
  });
  const row: Row = {
    id: taskId, tenantId, novelId, taskType: 'chapter_body_rewrite',
    objectType: 'chapter', objectId: chapterId, status: 'PROCESSING', statusNote: '处理中',
    progress: 70, currentStep: 'provider_result_validated', triggerSource: 'user',
    sourceVersionRefs: envelope.sourceVersionRefs, conflictScope: 'chapter', conflictKey: chapterId,
    idempotencyToken: 'rewrite-token', requestHash: hashCanonicalJson(envelope),
    activeClaimKey: 'rewrite-claim', policyProfileVersionId: envelope.policyProfileVersionId,
    modelRoutingVersion: envelope.modelRoutingVersion, promptTemplateVersionId: null,
    inputSummary: '章节重写', outputSummary: null, resultVersionId: null,
    resultVersionIdsJson: [], retryOfTaskId: null, failureCategory: null,
    errorCode: null, errorMessage: null, resultObjectType: null, resultObjectId: null,
    userAcceptedResult: false, cancelRequestedAt: null, cancelReason: null,
    startedAt: at(0), finishedAt: null, createdBy: 'user_rewrite', createdAt: at(0),
    updatedAt: at(3), metadata: {}, leaseOwnerId: 'worker_rewrite', leaseToken: 'lease_rewrite',
    leaseExpiresAt: at(60), lastHeartbeatAt: at(3), retryCount: 0, maxRetries: 0,
    executionEnvelopeJson: envelope, providerAttemptId: 'attempt_rewrite',
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
    staleLevel: 'NONE', sourceType: 'mock_ai', sourceTaskId: 'prior_task',
    sourceVersionRefs: {}, rewriteReason: null, content: '甲'.repeat(1800),
    wordCount: 1800, summary: '主角找到反击证据。', reviewScore: 80,
    decisionRecordId: null, createdBy: 'user_rewrite', createdAt: at(0), metadata: {}
  };
  const validResult = await new MockBodyProvider().rewriteChapter({
    action: 'chapter_rewrite',
    novel: { id: novelId, title: '回档人生', genres: ['都市逆袭'], chapterLimit: 10,
      chapterWordMin: 1800, chapterWordMax: 2200, policyProfileVersionId: null },
    chapter: { id: chapterId, chapterNo: 4, title: chapter.title, wordTarget: 1800, statusNote: null },
    currentContent: { id: contentId, content: formal.content, summary: formal.summary,
      reviewScore: 80, providerSafeMetadata: { scoringStrategyVersion: null,
        hardFailed: null, candidateRank: null, isMockOutput: true } },
    instruction: '强化反击证据'
  });
  const state = { row, chapter, formal, versions: [] as Row[], events: [] as Row[], logs: [] as Row[],
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
            assert.equal(where.leaseOwnerId, 'worker_rewrite');
            assert.equal(where.leaseToken, 'lease_rewrite');
            assert.equal(where.providerAttemptId, 'attempt_rewrite');
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
          findFirst: async () => pending!.versions.at(-1) ?? pending!.formal,
          create: async ({ data }: { data: Row }) => {
            const version = { id: 'rewrite_version_1', ...data };
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
  repository.findChapterContentVersionById = async () => ({
    ...pending!.formal, status: pending!.formal.status === 'CURRENT' ? 'current' : 'historical', staleLevel: 'none'
  }) as never;
  const input: LeasedCreativeFinalizeInput = {
    tenantId, taskId, leaseOwnerId: 'worker_rewrite', leaseToken: 'lease_rewrite',
    providerAttemptId: 'attempt_rewrite', authoritativeNow: at(4), validatedResult: validResult
  };
  return { repository, state, input, validResult };
}

describe('Prisma chapter rewrite leased finalize', () => {
  it('writes a candidate and receipt without changing the formal content pointer', async () => {
    const { repository, state, input } = await fixture();
    assert.equal(await repository.getLeasedExecutionCapability('chapter_body_rewrite'), 'disabled');
    assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'applied');
    assert.equal(state.versions.length, 1);
    assert.equal(state.versions[0]?.status, 'CANDIDATE');
    assert.equal(state.versions[0]?.rewriteReason, '用户要求改稿');
    assert.equal(state.versions[0]?.metadata.summaryCompare.candidateSummary,
      state.row.outputSummary);
    assert.equal(state.chapter.currentContentVersionId, state.formal.id);
    assert.equal(state.formal.status, 'CURRENT');
    assert.equal(state.row.status, 'WAITING_CONFIRMATION');
    assert.deepEqual(state.row.resultVersionIdsJson, ['rewrite_version_1']);
    assert.match(state.row.resultReceiptHash, /^[a-f0-9]{64}$/);
    assert.equal(state.row.providerCallBudgetUsed, 1);
    assert.equal(state.events[0]?.eventType, 'task_finalized');
    assert.equal(state.logs[0]?.action, 'generation_task_finalized');
    assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'fenced');
  });

  it('fences stale work and safely fails malformed or overlength model output', async () => {
    for (const patch of [{ leaseOwnerId: 'other' }, { leaseToken: 'other' },
      { providerAttemptId: 'other' }, { authoritativeNow: at(60) }]) {
      const { repository, state, input } = await fixture();
      assert.equal((await repository.finalizeLeasedAction({ ...input, ...patch })).outcome, 'fenced');
      assert.equal(state.versions.length, 0);
    }
    for (const patch of [{ cancelRequestedAt: at(3) }, { providerCallBudgetUsed: 0 }]) {
      const { repository, state, input } = await fixture();
      Object.assign(state.row, patch);
      assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'fenced');
      assert.equal(state.versions.length, 0);
    }
    for (const mutate of [
      (state: Awaited<ReturnType<typeof fixture>>['state']) => { state.stale = true; },
      (state: Awaited<ReturnType<typeof fixture>>['state']) => { state.chapter.currentContentVersionId = 'other_content'; },
      (state: Awaited<ReturnType<typeof fixture>>['state']) => { state.formal.status = 'HISTORICAL'; }
    ]) {
      const { repository, state, input } = await fixture();
      mutate(state);
      assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'applied');
      assert.equal(state.row.errorCode, 'SOURCE_STALE');
      assert.equal(state.versions.length, 0);
    }
    const { validResult } = await fixture();
    for (const validatedResult of [
      { ...validResult, candidate: { ...validResult.candidate, content: '过短' } },
      { ...validResult, summaryCompare: { ...validResult.summaryCompare, benefit: '' } },
      { ...validResult, candidate: { ...validResult.candidate,
        chapter: { ...validResult.candidate.chapter, id: 'wrong_chapter' } } }
    ]) {
      const { repository, state, input } = await fixture();
      assert.equal((await repository.finalizeLeasedAction({ ...input, validatedResult })).outcome, 'applied');
      assert.equal(state.row.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
      assert.equal(state.row.resultReceiptHash, null);
      assert.equal(state.versions.length, 0);
    }
  });

  it('rolls back candidate, task, event and audit writes together', async () => {
    for (const failStage of ['asset', 'task', 'event', 'audit']) {
      const { repository, state, input } = await fixture();
      state.failStage = failStage;
      await assert.rejects(repository.finalizeLeasedAction(input), /injected/);
      assert.equal(state.versions.length, 0, failStage);
      assert.equal(state.row.status, 'PROCESSING', failStage);
      assert.equal(state.events.length, 0, failStage);
      assert.equal(state.logs.length, 0, failStage);
      assert.equal(state.chapter.currentContentVersionId, state.formal.id, failStage);
    }
  });
});
