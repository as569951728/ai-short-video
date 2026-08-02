import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NovelCreationStage,
  NovelLifecycleStatus,
  StageStatus,
  StaleLevel,
  VersionStatus
} from '@ai-shortvideo/shared';
import { buildApp } from '../../app.js';
import type {
  ChapterContentVersionRecord,
  ChapterFeatureCardRecord,
  LongTermMemoryRecord,
  NovelChapterRecord,
  NovelRecord,
  ReviewReportRecord,
  FullReviewDraft
} from './domain/novelDomain.js';
import { hashCanonicalJson } from './domain/executionContract.js';
import { createInMemoryNovelRepository } from './repositories/inMemoryNovelRepository.js';
import {
  buildFullReviewEvidenceProviderInput,
  FULL_REVIEW_CANONICAL_DIMENSION_KEYS,
  FullReviewEvidenceValidationError,
  validateFullReviewDraftForPersistence,
  validateFullReviewEvidenceProviderInput,
  type FullReviewAuthorityFactsV1,
  type FullReviewEvidenceFailureCode
} from './services/actionExecutionPlan.js';

const fixedDate = new Date('2026-08-02T00:00:00.000Z');

test('builds deterministic bounded full-review evidence with complete coverage', () => {
  const facts = createAuthorityFacts([1, 2]);
  const first = buildFullReviewEvidenceProviderInput(facts);
  const second = buildFullReviewEvidenceProviderInput({
    ...facts,
    chapters: [...facts.chapters].reverse(),
    contents: [...facts.contents].reverse(),
    featureCards: [...facts.featureCards].reverse(),
    reviews: [...facts.reviews].reverse()
  });

  assert.equal(first.evidenceHash, second.evidenceHash);
  assert.equal(first.coverageManifest.manifestHash, second.coverageManifest.manifestHash);
  assert.deepEqual(first.coverageManifest.coveredChapterNos, [1, 2]);
  assert.deepEqual(first.sourceVersionRefs.chapterContentVersionIds, ['content-1', 'content-2']);
  assert.equal(first.chapterEvidence.length, 2);
  assert.equal(first.chapterEvidence[0]?.content.excerpts.opening.length, 180);
  assert.equal(first.chapterEvidence[0]?.content.excerpts.middle.length, 180);
  assert.equal(first.chapterEvidence[0]?.content.excerpts.ending.length, 180);
  assert.deepEqual(first.chapterEvidence[0]?.continuity?.stage, {
    stageIndex: 1,
    isStageOpening: true,
    isStageEnding: false,
    previousChapterId: null,
    nextChapterId: 'chapter-2'
  });
  assert.deepEqual(first.chapterEvidence[1]?.continuity?.excerptLocations.map((item) => item.kind), ['opening', 'middle', 'ending']);
  assert.equal(first.chapterEvidence[1]?.continuity?.timeline.chapterNo, 2);
  assert.ok(first.chapterEvidence.every((item) => JSON.stringify(item).length < 5_000));
  assert.doesNotMatch(JSON.stringify(first), /FULL_BODY_1_[x]{600}/);
  assert.deepEqual(validateFullReviewEvidenceProviderInput(first), first);
});

test('fails closed when chapter evidence is missing', () => {
  const facts = createAuthorityFacts([1, 2]);
  assertFailure('evidence_incomplete', () => buildFullReviewEvidenceProviderInput({
    ...facts,
    featureCards: facts.featureCards.slice(0, 1)
  }));
});

test('fails closed when evidence maps more than once to a chapter', () => {
  const facts = createAuthorityFacts([1, 2]);
  assertFailure('coverage_duplicate', () => buildFullReviewEvidenceProviderInput({
    ...facts,
    featureCards: [
      facts.featureCards[0]!,
      { ...facts.featureCards[1]!, id: 'feature-duplicate', chapterId: facts.chapters[0]!.id }
    ]
  }));
});

test('fails closed when chapter numbers are not continuous', () => {
  assertFailure('coverage_incomplete', () => buildFullReviewEvidenceProviderInput(createAuthorityFacts([1, 3])));
});

test('fails closed when source version refs do not match current chapter contents', () => {
  const facts = createAuthorityFacts([1, 2]);
  assertFailure('source_stale', () => buildFullReviewEvidenceProviderInput({
    ...facts,
    sourceVersionRefs: {
      ...facts.sourceVersionRefs,
      chapterContentVersionIds: [...facts.sourceVersionRefs.chapterContentVersionIds].reverse()
    }
  }));
});

test('fails closed when upstream version refs do not match current novel pointers', () => {
  const facts = createAuthorityFacts([1, 2]);
  assertFailure('source_stale', () => buildFullReviewEvidenceProviderInput({
    ...facts,
    sourceVersionRefs: { ...facts.sourceVersionRefs, outlineVersionId: 'stale-outline' }
  }));
});

test('rejects an extra nested ABI field even when all enclosing hashes are recomputed', () => {
  const input = buildFullReviewEvidenceProviderInput(createAuthorityFacts([1, 2]));
  const first = input.chapterEvidence[0]!;
  Object.assign(first.featureCard, { rawEntityCanary: 'must-not-reach-provider' });
  const { evidenceHash: _chapterHash, ...chapterCore } = first;
  input.chapterEvidence[0] = { ...chapterCore, evidenceHash: hashCanonicalJson(chapterCore) };
  const { evidenceHash: _inputHash, ...inputCore } = input;
  input.evidenceHash = hashCanonicalJson(inputCore);

  assertFailure('evidence_incomplete', () => validateFullReviewEvidenceProviderInput(input));
});

test('fails closed when the latest memory does not cover the final chapter content', () => {
  const facts = createAuthorityFacts([1, 2]);
  assertFailure('memory_stale', () => buildFullReviewEvidenceProviderInput({
    ...facts,
    memory: { ...facts.memory!, sourceContentVersionId: 'content-1', chapterId: 'chapter-1' }
  }));
});

test('fails closed for soft, risk, and hard stale chapter or memory evidence', () => {
  for (const staleLevel of [StaleLevel.SoftStale, StaleLevel.RiskStale, StaleLevel.HardStale]) {
    for (const source of ['content', 'feature', 'memory'] as const) {
      const facts = createAuthorityFacts([1, 2]);
      if (source === 'content') facts.contents[0] = { ...facts.contents[0]!, staleLevel };
      if (source === 'feature') facts.featureCards[0] = { ...facts.featureCards[0]!, staleLevel };
      if (source === 'memory') facts.memory = { ...facts.memory!, staleLevel };
      assertFailure(source === 'memory' ? 'memory_stale' : 'source_stale', () => buildFullReviewEvidenceProviderInput(facts));
    }
  }
});

test('validates exact full-review persistence ABI against canonical dimensions and authority', () => {
  const draft = createCanonicalFullReviewDraft();
  const result = validateFullReviewDraftForPersistence(draft, persistenceAuthority());

  assert.deepEqual(result, draft);
  assert.notEqual(result, draft);
});

test('rejects extra top-level and nested full-review persistence fields', () => {
  const topLevel = createCanonicalFullReviewDraft() as FullReviewDraft & { providerExplanation?: string };
  topLevel.providerExplanation = 'not authoritative';
  assert.throws(
    () => validateFullReviewDraftForPersistence(topLevel, persistenceAuthority()),
    /full review draft has invalid keys/
  );

  const nested = createCanonicalFullReviewDraft();
  Object.assign(nested.dimensionScores[0]!, { rawEvidence: 'not allowed' });
  assert.throws(
    () => validateFullReviewDraftForPersistence(nested, persistenceAuthority()),
    /dimensionScores\[0\] has invalid keys/
  );
});

test('requires the complete canonical dimension set before persistence', () => {
  const draft = createCanonicalFullReviewDraft();
  draft.dimensionScores = draft.dimensionScores.slice(0, -1);
  draft.dimensionScores.forEach((dimension) => { dimension.weight = 0.2; });

  assert.throws(
    () => validateFullReviewDraftForPersistence(draft, persistenceAuthority()),
    /canonical dimension set is incomplete/
  );
});

test('rejects provider policy forgery and scopeRefs outside the authoritative chapter manifest', () => {
  const forgedPolicy = createCanonicalFullReviewDraft();
  forgedPolicy.reviewPolicyVersionId = 'provider-policy-alias';
  assert.throws(
    () => validateFullReviewDraftForPersistence(forgedPolicy, persistenceAuthority()),
    /reviewPolicyVersionId does not match authority/
  );

  const forgedScope = createCanonicalFullReviewDraft();
  forgedScope.issues = [{
    issueId: 'issue-unknown-chapter',
    title: '引用未知章节',
    plainDescription: '模型返回了不属于权威 manifest 的章节引用。',
    severity: 'warning',
    scopeType: 'chapter',
    scopeRefs: ['chapter-999'],
    dimension: 'fact_consistency',
    blocking: false,
    recommendedTarget: '第 1 章',
    recommendedAction: '使用权威章节 ID。',
    status: 'open',
    acceptedReason: null
  }];
  assert.throws(
    () => validateFullReviewDraftForPersistence(forgedScope, persistenceAuthority()),
    /full review issue is invalid/
  );
});

test('novel service does not mask a forged provider policy before persistence', async () => {
  const repository = createInMemoryNovelRepository();
  let providerCalls = 0;
  const app = await buildApp({
    logger: false,
    novelRepository: repository,
    enableAcceptanceSeeds: true,
    requestContextResolver: async () => ({ tenantId: 'tenant_test', userId: 'user_test' }),
    fullReviewProvider: {
      async generateFullReview() {
        providerCalls += 1;
        return {
          ...createCanonicalFullReviewDraft(),
          reviewPolicyVersionId: 'provider-forged-policy'
        };
      }
    }
  });

  try {
    const seedResponse = await app.inject({
      method: 'POST',
      url: '/dev/novels/acceptance-seeds/full-review',
      payload: { title: '持久化 policy 权威校验' }
    });
    assert.equal(seedResponse.statusCode, 201, seedResponse.body);
    const novelId = seedResponse.json().data.novelId as string;
    const detailResponse = await app.inject({ method: 'GET', url: `/novels/${novelId}` });
    assert.equal(detailResponse.statusCode, 200, detailResponse.body);

    const response = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/full-review`,
      payload: {
        idempotencyKey: 'forged-provider-policy',
        expectedNovelVersion: detailResponse.json().data.updatedAt
      }
    });

    assert.equal(response.statusCode, 500, response.body);
    assert.equal(providerCalls, 1);
    assert.equal(repository.getReviewReports().some((report) => report.novelId === novelId && report.objectType === 'novel'), false);
    assert.equal(repository.getFullReviewGates().some((gate) => gate.novelId === novelId), false);
  } finally {
    await app.close();
  }
});

function createCanonicalFullReviewDraft(): FullReviewDraft {
  return {
    totalScore: 84,
    rating: 'A',
    gateResult: 'pass',
    summary: '全书结构与事实证据完整。',
    strengths: ['主线完整'],
    problems: [],
    suggestions: [],
    dimensionScores: FULL_REVIEW_CANONICAL_DIMENSION_KEYS.map((key, index) => ({
      key,
      label: `维度 ${index + 1}`,
      score: 84,
      weight: index < 2 ? 0.16 : 0.17,
      evidence: `第 1 章 ${key} 证据。`,
      penaltyPoints: 0
    })),
    issues: [],
    videoSuggestion: '从第 1 章切入。',
    firstVideoSuggestion: {
      chapterRange: '1-1',
      openingSlice: '开场冲突',
      narrationHook: '主角开始反击',
      firstScreenSubtitle: '反击开始',
      titleHook: '主角翻盘',
      endingSuspense: '幕后人出现',
      suggestedFormat: '旁白加字幕',
      riskTips: []
    },
    platformRisks: [],
    originalityRisks: [],
    aiFlavorRisks: [],
    lowScoreContinueRisks: [],
    reviewPolicyVersionId: 'policy-1'
  };
}

function persistenceAuthority() {
  return {
    expectedReviewPolicyVersionId: 'policy-1',
    chapterManifest: [
      { chapterId: 'chapter-1', chapterNo: 1 },
      { chapterId: 'chapter-2', chapterNo: 2 }
    ]
  };
}

function createAuthorityFacts(chapterNos: number[]): FullReviewAuthorityFactsV1 {
  const novel: NovelRecord = {
    id: 'novel-1', tenantId: 'tenant-1', ownerId: 'user-1', title: '证据合同小说', channel: 'web', genres: ['都市'],
    lifecycleStatus: NovelLifecycleStatus.Active, creationStage: NovelCreationStage.FullReview, stageStatus: StageStatus.Processing,
    currentDirectionVersionId: 'direction-1', currentSettingVersionId: 'setting-1', currentOutlineVersionId: 'outline-1',
    currentStageOutlineVersionId: 'stage-outline-1', currentChapterPlanVersionId: 'chapter-plan-1', hotspotReportId: null,
    policyProfileVersionId: 'policy-1', chapterLimit: chapterNos.length, chapterWordMin: 1_500, chapterWordMax: 2_500,
    summary: null, videoReferenceStatus: null, createdBy: 'user-1', updatedBy: 'user-1', createdAt: fixedDate, updatedAt: fixedDate, deletedAt: null
  };
  const chapters = chapterNos.map(createChapter);
  const contents = chapterNos.map(createContent);
  const featureCards = chapterNos.map(createFeatureCard);
  const reviews = chapterNos.map(createReview);
  const lastChapterNo = chapterNos.at(-1)!;
  const memory: LongTermMemoryRecord = {
    id: 'memory-1', tenantId: novel.tenantId, novelId: novel.id, chapterId: `chapter-${lastChapterNo}`,
    sourceContentVersionId: `content-${lastChapterNo}`, previousSummary: '主角已经完成前序阶段目标，关键合同仍待兑现。',
    characterStates: ['主角保持清醒'], relationshipStates: ['主角与盟友互信'], locations: ['总部'], organizations: ['新公司'],
    items: ['关键合同'], plantedForeshadowing: ['合同暗藏条款'], resolvedForeshadowing: [], unresolvedConflicts: ['对手仍未退场'],
    newSettings: ['系统每日只可使用一次'], factsCannotContradict: ['关键合同金额为一百万元'], status: VersionStatus.Current,
    staleLevel: StaleLevel.None, sourceTaskId: `task-${lastChapterNo}`, createdAt: fixedDate, metadata: {}
  };
  return {
    tenantId: novel.tenantId,
    novel,
    chapters,
    contents,
    featureCards,
    reviews,
    memory,
    sourceVersionRefs: {
      directionVersionId: novel.currentDirectionVersionId,
      settingVersionId: novel.currentSettingVersionId,
      outlineVersionId: novel.currentOutlineVersionId,
      stageOutlineVersionId: novel.currentStageOutlineVersionId,
      chapterPlanVersionId: novel.currentChapterPlanVersionId,
      bodyStrategySnapshotId: 'body-strategy-1',
      chapterContentVersionIds: chapterNos.map((chapterNo) => `content-${chapterNo}`)
    }
  };
}

function createChapter(chapterNo: number): NovelChapterRecord {
  return {
    id: `chapter-${chapterNo}`, tenantId: 'tenant-1', novelId: 'novel-1', chapterNo, stageIndex: 1,
    title: `第 ${chapterNo} 章`, wordTarget: 2_000, wordCount: 1_800, mainStatus: 'completed', statusNote: null, impactLevel: 'none',
    currentFeatureCardVersionId: `feature-${chapterNo}`, currentContentVersionId: `content-${chapterNo}`,
    currentReviewReportId: `review-${chapterNo}`, lastGenerationTaskId: `task-${chapterNo}`,
    createdAt: fixedDate, updatedAt: fixedDate, deletedAt: null
  };
}

function createContent(chapterNo: number): ChapterContentVersionRecord {
  return {
    id: `content-${chapterNo}`, tenantId: 'tenant-1', novelId: 'novel-1', chapterId: `chapter-${chapterNo}`, versionNo: 1,
    status: VersionStatus.Current, staleLevel: StaleLevel.None, sourceType: 'deepseek', sourceTaskId: `task-${chapterNo}`,
    sourceVersionRefs: {}, rewriteReason: null, content: `FULL_BODY_${chapterNo}_${'x'.repeat(1_100)}_END_${chapterNo}`,
    wordCount: 1_800, summary: `第 ${chapterNo} 章摘要`, reviewScore: 90, decisionRecordId: null,
    createdBy: 'user-1', createdAt: fixedDate, metadata: {}
  };
}

function createFeatureCard(chapterNo: number): ChapterFeatureCardRecord {
  return {
    id: `feature-${chapterNo}`, tenantId: 'tenant-1', novelId: 'novel-1', chapterId: `chapter-${chapterNo}`, versionNo: 1,
    status: VersionStatus.Current, staleLevel: StaleLevel.None, oneLineSummary: `第 ${chapterNo} 章事实摘要`, coreTask: '推进合同谈判',
    mainConflict: '主角与对手争夺合同', appealPoint: '逆转局势', emotionKeywords: ['紧张'], characterChanges: ['主角更加坚定'],
    relationshipChanges: ['盟友关系加深'], keyInformation: ['合同金额为一百万元'], foreshadowingOperation: '埋入隐藏条款',
    endingHook: '对手突然出现', factsCannotChange: ['合同金额固定'], featuresToStrengthen: ['谈判节奏'],
    sourceTaskId: `task-${chapterNo}`, decisionRecordId: null, createdAt: fixedDate, metadata: {}
  };
}

function createReview(chapterNo: number): ReviewReportRecord {
  return {
    id: `review-${chapterNo}`, tenantId: 'tenant-1', novelId: 'novel-1', objectType: 'chapter', objectId: `chapter-${chapterNo}`,
    objectVersionId: `content-${chapterNo}`, reviewLevel: 'chapter', totalScore: 90, subScores: {}, rating: 'A',
    summary: '章节逻辑清晰', strengths: ['冲突明确'], problems: ['伏笔需继续跟踪'], suggestions: ['后续回收伏笔'],
    issueCards: [{ severity: 'warning', dimension: 'continuity', message: '伏笔尚未回收', suggestion: '在后续章节回收' }],
    actionOptions: ['continue'], recommendedAction: 'continue', allowNextStep: true, blockingIssueCount: 0, resolvedStatus: 'open',
    promptTemplateVersionId: 'prompt-1', policyProfileVersionId: 'policy-1', sourceTaskId: `task-${chapterNo}`,
    createdAt: fixedDate, metadata: {}
  };
}

function assertFailure(code: FullReviewEvidenceFailureCode, action: () => unknown): void {
  assert.throws(action, (error: unknown) => error instanceof FullReviewEvidenceValidationError && error.code === code);
}
