import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createExecutionEnvelopeV1_1 } from '@ai-shortvideo/shared';
import { hashCanonicalJson } from '../../src/modules/novels/domain/executionContract.js';
import type { LeasedCreativeFinalizeInput } from '../../src/modules/novels/domain/novelDomain.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';

type Row = Record<string, any>;
const at = (seconds: number) => new Date(Date.UTC(2030, 0, 1, 0, 0, seconds));
const sha = 'c'.repeat(64);
const impact = {
  impactLevel: 'medium', summary: '第五章旧线索需要重新核对。',
  changedFacts: ['线索触发方式'], affectedChapterIds: ['chapter_5'],
  affectedVideoReferenceIds: [], recommendedHandling: '先核对第五章承接。',
  suggestedActions: ['检查第五章'], blocksFullReview: true
};

function fixture() {
  const tenantId = 'tenant_adopt', novelId = 'novel_adopt', chapterId = 'chapter_4';
  const currentId = 'formal_content_1', candidateId = 'candidate_content_2', taskId = 'task_adopt';
  const authority = { action: 'chapter_adopt_impact_assess', tenantId, novelId,
    objectId: chapterId, facts: { currentId, candidateId } };
  const identities = [['chapter', chapterId], ['chapter_content', currentId],
    ['chapter_content', candidateId], ['novel', novelId]]
    .map(([sourceType, sourceId]) => ({ sourceType, sourceId, revision: sha, snapshotHash: sha }))
    .sort((left, right) => `${left.sourceType}\0${left.sourceId}` < `${right.sourceType}\0${right.sourceId}` ? -1 : 1);
  const envelope = createExecutionEnvelopeV1_1({
    tenantId, novelId, auditContext: { requestedByUserId: 'user_adopt', requestedAt: at(0).toISOString() },
    action: 'chapter_adopt_impact_assess', objectType: 'chapter', objectId: chapterId,
    normalizedRequest: { chapterId, currentContentVersionId: currentId, candidateVersionId: candidateId,
      reason: '旧线索调整会影响第五章', pageVersionSnapshot: {
        currentContentVersionId: currentId, seenCandidateVersionId: candidateId
      } },
    sourceVersionRefs: { currentContentVersionId: currentId, candidateVersionId: candidateId,
      sourceIdentitySchemaVersion: 1, sourceIdentities: identities,
      novelProviderInputSnapshotHash: sha, chapterProviderInputSnapshotHash: sha,
      authoritySnapshotHash: hashCanonicalJson(authority), providerInputSnapshotHash: sha },
    policyProfileVersionId: 'policy_default_v1', modelRoutingVersion: 'provider:test:v1'
  });
  const row: Row = {
    id: taskId, tenantId, novelId, taskType: 'chapter_impact_assess', objectType: 'chapter',
    objectId: chapterId, status: 'PROCESSING', statusNote: '处理中', progress: 70,
    currentStep: 'provider_result_validated', triggerSource: 'user',
    sourceVersionRefs: envelope.sourceVersionRefs, conflictScope: 'chapter', conflictKey: chapterId,
    idempotencyToken: 'adopt-token', requestHash: hashCanonicalJson(envelope),
    activeClaimKey: 'adopt-claim', policyProfileVersionId: envelope.policyProfileVersionId,
    modelRoutingVersion: envelope.modelRoutingVersion, promptTemplateVersionId: null,
    inputSummary: '采用影响评估', outputSummary: null, resultVersionId: null,
    resultVersionIdsJson: [], retryOfTaskId: null, failureCategory: null,
    errorCode: null, errorMessage: null, resultObjectType: null, resultObjectId: null,
    userAcceptedResult: false, cancelRequestedAt: null, cancelReason: null,
    startedAt: at(0), finishedAt: null, createdBy: 'user_adopt', createdAt: at(0),
    updatedAt: at(3), metadata: {}, leaseOwnerId: 'worker_adopt', leaseToken: 'lease_adopt',
    leaseExpiresAt: at(60), lastHeartbeatAt: at(3), retryCount: 0, maxRetries: 0,
    executionEnvelopeJson: envelope, providerAttemptId: 'attempt_adopt',
    providerAttemptPhase: 'PROVIDER_RESULT_VALIDATED', providerDispatchedAt: at(2),
    resultReceiptHash: null, rootTaskId: taskId, providerCallBudgetMax: 1,
    providerCallBudgetUsed: 1, durationDeadlineAt: at(90),
    costBudgetMicrosMax: 0n, costBudgetMicrosUsed: 0n
  };
  const novel: Row = {
    id: novelId, tenantId, lifecycleStatus: 'ACTIVE', creationStage: 'BODY',
    stageStatus: 'NOT_STARTED', currentDirectionVersionId: null,
    currentSettingVersionId: null, currentOutlineVersionId: null,
    currentStageOutlineVersionId: null, currentChapterPlanVersionId: null,
    deletedAt: null, updatedAt: at(0)
  };
  const chapter: Row = {
    id: chapterId, tenantId, novelId, chapterNo: 4, stageIndex: 1, title: '第四章',
    wordTarget: 1800, wordCount: 1800, mainStatus: 'completed', statusNote: null,
    impactLevel: 'NONE', currentFeatureCardVersionId: null,
    currentContentVersionId: currentId, currentReviewReportId: null,
    lastGenerationTaskId: null, createdAt: at(0), updatedAt: at(0), deletedAt: null, metadata: {}
  };
  const formal: Row = {
    id: currentId, tenantId, novelId, chapterId, versionNo: 1, status: 'CURRENT',
    staleLevel: 'NONE', sourceType: 'manual', sourceTaskId: 'prior_task',
    sourceVersionRefs: {}, rewriteReason: null, content: '甲'.repeat(1800),
    wordCount: 1800, summary: '主角找到反击证据。', reviewScore: 80,
    decisionRecordId: null, createdBy: 'user_adopt', createdAt: at(0), metadata: {}
  };
  const candidate: Row = {
    ...formal, id: candidateId, versionNo: 2, status: 'CANDIDATE',
    sourceTaskId: 'rewrite_task', content: '乙'.repeat(1800),
    summary: '主角利用新证据反击。', metadata: { summaryCompare: {
      currentSummary: '主角找到反击证据。', candidateSummary: '主角利用新证据反击。',
      benefit: '冲突更清晰', newRisks: ['后续线索可能不一致'],
      possibleImpact: '第五章需核对', aiSuggestion: '先核对后续承接'
    } }
  };
  const state = { row, novel, chapter, formal, candidate, decisions: [] as Row[],
    cases: [] as Row[], events: [] as Row[], logs: [] as Row[], stale: false,
    failStage: '', casLostAt: '' };
  let pending: typeof state | null = null;
  const repository = Object.create(PrismaNovelRepository.prototype) as PrismaNovelRepository & { prisma: unknown };
  const write = (stage: string, data: Row, target: Row) => {
    if (state.failStage === stage) throw new Error(`injected ${stage} fault`);
    if (state.casLostAt === stage) return { count: 0 };
    Object.assign(target, data);
    return { count: 1 };
  };
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
            assert.equal(where.leaseOwnerId, 'worker_adopt');
            assert.equal(where.leaseToken, 'lease_adopt');
            assert.equal(where.providerAttemptId, 'attempt_adopt');
            assert.equal(where.providerCallBudgetUsed, 1);
            assert.equal(where.cancelRequestedAt, null);
            return write('task', data, pending!.row);
          }
        },
        novelChapter: {
          findFirst: async () => pending!.chapter,
          updateMany: async ({ where, data }: { where: Row; data: Row }) => {
            assert.equal(where.currentContentVersionId, currentId);
            return write('chapter', data, pending!.chapter);
          }
        },
        chapterContentVersion: { updateMany: async ({ where, data }: { where: Row; data: Row }) => {
          const stage = where.id === currentId ? 'oldVersion' : 'newVersion';
          assert.equal(where.status, where.id === currentId ? 'CURRENT' : 'CANDIDATE');
          return write(stage, data, where.id === currentId ? pending!.formal : pending!.candidate);
        } },
        assetDecisionRecord: { create: async ({ data }: { data: Row }) => {
          if (state.failStage === 'decision') throw new Error('injected decision fault');
          const created = { id: 'decision_1', ...data };
          pending!.decisions.push(created);
          return created;
        } },
        impactCase: { create: async ({ data }: { data: Row }) => {
          if (state.failStage === 'impact') throw new Error('injected impact fault');
          const created = { id: 'impact_case_1', ...data };
          pending!.cases.push(created);
          return created;
        } },
        novel: { updateMany: async ({ where, data }: { where: Row; data: Row }) => {
          assert.equal(where.lifecycleStatus, 'ACTIVE');
          return write('novel', data, pending!.novel);
        } },
        generationTaskEvent: { create: async ({ data }: { data: Row }) => {
          if (state.failStage === 'event') throw new Error('injected event fault');
          pending!.events.push(data);
          return data;
        } },
        operationLog: { create: async ({ data }: { data: Row }) => {
          const stage = data.action === 'adopt_chapter_content' ? 'adoptionLog' : 'auditLog';
          if (state.failStage === stage) throw new Error(`injected ${stage} fault`);
          pending!.logs.push(data);
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
  repository.findById = async () => ({ ...pending!.novel, lifecycleStatus: 'active',
    creationStage: 'body', stageStatus: 'not_started' }) as never;
  repository.findChapterContentVersionById = async (_tenantId, _novelId, versionId) => {
    const version = versionId === currentId ? pending!.formal : versionId === candidateId ? pending!.candidate : null;
    return version ? { ...version, status: version.status.toLowerCase(),
      staleLevel: version.staleLevel.toLowerCase() } as never : null;
  };
  const input: LeasedCreativeFinalizeInput = {
    tenantId, taskId, leaseOwnerId: 'worker_adopt', leaseToken: 'lease_adopt',
    providerAttemptId: 'attempt_adopt', authoritativeNow: at(4), validatedResult: impact
  };
  return { repository, state, input, currentId, candidateId };
}

describe('Prisma chapter adopt impact leased finalize', () => {
  it('atomically switches formal versions and records decision, impact, receipt and audit', async () => {
    const { repository, state, input, currentId, candidateId } = fixture();
    assert.equal(await repository.getLeasedExecutionCapability('chapter_impact_assess'), 'disabled');
    await assert.rejects(repository.assertProviderActionSupported('chapter_impact_assess'));
    assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'applied');
    assert.equal(state.formal.status, 'HISTORICAL');
    assert.equal(state.candidate.status, 'CURRENT');
    assert.equal(state.chapter.currentContentVersionId, candidateId);
    assert.equal(state.chapter.mainStatus, 'pending');
    assert.equal(state.chapter.impactLevel, 'MEDIUM');
    assert.equal(state.novel.stageStatus, 'BLOCKED');
    assert.equal(state.decisions.length, 1);
    assert.equal(state.decisions[0]?.currentVersionIdBefore, currentId);
    assert.equal(state.decisions[0]?.currentVersionIdAfter, candidateId);
    assert.equal(state.decisions[0]?.isForced, true);
    assert.equal(state.candidate.decisionRecordId, state.decisions[0]?.id);
    assert.equal(state.cases.length, 1);
    assert.equal(state.cases[0]?.decisionRecordId, state.decisions[0]?.id);
    assert.equal(state.cases[0]?.status, 'waiting_decision');
    assert.equal(state.row.status, 'COMPLETED');
    assert.equal(state.row.providerCallBudgetUsed, 1);
    assert.deepEqual(state.row.resultVersionIdsJson, [candidateId]);
    assert.match(state.row.resultReceiptHash, /^[a-f0-9]{64}$/);
    assert.equal(state.events[0]?.eventType, 'task_finalized');
    assert.deepEqual(state.logs.map((log) => log.action), ['adopt_chapter_content', 'generation_task_finalized']);
    assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'fenced');
    assert.equal(state.cases.length, 1);
  });

  it('fences invalid leases and fails stale versions, length and page snapshots closed', async () => {
    for (const patch of [{ leaseOwnerId: 'other' }, { leaseToken: 'other' },
      { providerAttemptId: 'other' }, { authoritativeNow: at(60) }]) {
      const { repository, state, input } = fixture();
      assert.equal((await repository.finalizeLeasedAction({ ...input, ...patch })).outcome, 'fenced');
      assert.equal(state.decisions.length, 0);
    }
    for (const patch of [{ cancelRequestedAt: at(3) }, { providerCallBudgetUsed: 0 }]) {
      const { repository, state, input } = fixture();
      Object.assign(state.row, patch);
      assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'fenced');
      assert.equal(state.cases.length, 0);
    }
    for (const mutate of [
      (state: ReturnType<typeof fixture>['state']) => { state.stale = true; },
      (state: ReturnType<typeof fixture>['state']) => { state.chapter.currentContentVersionId = 'newer'; },
      (state: ReturnType<typeof fixture>['state']) => { state.formal.status = 'HISTORICAL'; },
      (state: ReturnType<typeof fixture>['state']) => { state.candidate.status = 'DISCARDED'; },
      (state: ReturnType<typeof fixture>['state']) => { state.candidate.staleLevel = 'HARD_STALE'; },
      (state: ReturnType<typeof fixture>['state']) => {
        state.candidate.sourceVersionRefs = { currentContentVersionId: 'older' };
      },
      (state: ReturnType<typeof fixture>['state']) => { state.candidate.content = '短'; },
      (state: ReturnType<typeof fixture>['state']) => { state.candidate.wordCount = 1700; },
      (state: ReturnType<typeof fixture>['state']) => { state.candidate.metadata.reviewRequired = true; },
      (state: ReturnType<typeof fixture>['state']) => { state.candidate.sourceType = 'ai_overlength_revision'; },
      (state: ReturnType<typeof fixture>['state']) => {
        state.row.executionEnvelopeJson.normalizedRequest.pageVersionSnapshot.seenCandidateVersionId = 'older';
        state.row.requestHash = hashCanonicalJson(state.row.executionEnvelopeJson);
      }
    ]) {
      const { repository, state, input } = fixture();
      mutate(state);
      assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'applied');
      assert.equal(state.row.errorCode, 'SOURCE_STALE');
      assert.equal(state.cases.length, 0);
      assert.equal(state.decisions.length, 0);
      assert.equal(state.candidate.status === 'CURRENT', false);
    }
  });

  it('requires explicit risk reason and rejects malformed or sensitive model results', async () => {
    for (const validatedResult of [
      { ...impact, impactLevel: 'severe', blocksFullReview: false },
      { ...impact, suggestedActions: [] },
      { ...impact, apiKey: 'forbidden' }
    ]) {
      const { repository, state, input } = fixture();
      assert.equal((await repository.finalizeLeasedAction({ ...input, validatedResult })).outcome, 'applied');
      assert.equal(state.row.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
      assert.equal(state.decisions.length, 0);
    }
    const { repository, state, input } = fixture();
    state.row.executionEnvelopeJson.normalizedRequest.reason = '采用候选前影响评估';
    state.row.requestHash = hashCanonicalJson(state.row.executionEnvelopeJson);
    assert.equal((await repository.finalizeLeasedAction(input)).outcome, 'applied');
    assert.equal(state.row.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
    assert.equal(state.chapter.currentContentVersionId, 'formal_content_1');
  });

  it('rolls back every persisted artifact and state transition on injected faults', async () => {
    for (const failStage of ['decision', 'impact', 'oldVersion', 'newVersion', 'chapter',
      'novel', 'task', 'event', 'adoptionLog', 'auditLog']) {
      const { repository, state, input } = fixture();
      state.failStage = failStage;
      const before = structuredClone(state);
      await assert.rejects(repository.finalizeLeasedAction(input), /injected/);
      assert.deepEqual(state, before, failStage);
    }
    for (const casLostAt of ['oldVersion', 'newVersion', 'chapter', 'novel', 'task']) {
      const { repository, state, input } = fixture();
      state.casLostAt = casLostAt;
      const before = structuredClone(state);
      await assert.rejects(repository.finalizeLeasedAction(input), /lost its/);
      assert.deepEqual(state, before, casLostAt);
    }
  });
});
