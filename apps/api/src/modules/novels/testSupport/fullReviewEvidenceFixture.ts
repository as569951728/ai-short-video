import { hashCanonicalJson } from '../domain/executionContract.js';
import type {
  ChapterProviderInputV1,
  FullReviewEvidenceProviderInputV1,
  NovelProviderInputV1
} from '../services/actionExecutionPlan.js';

interface FullReviewEvidenceFixtureOptions {
  tenantId?: string;
  novel?: Partial<NovelProviderInputV1>;
  chapter?: Partial<ChapterProviderInputV1>;
}

export function createFullReviewEvidenceFixture(
  options: FullReviewEvidenceFixtureOptions = {}
): FullReviewEvidenceProviderInputV1 {
  const novel: NovelProviderInputV1 = {
    id: 'novel-full-review-fixture',
    title: '全书审稿证据夹具',
    genres: ['都市逆袭'],
    chapterLimit: 1,
    chapterWordMin: 1_800,
    chapterWordMax: 2_200,
    policyProfileVersionId: 'policy-full-review-v1',
    ...options.novel
  };
  const chapter: ChapterProviderInputV1 = {
    id: 'chapter-1',
    chapterNo: 1,
    title: '第1章',
    wordTarget: 2_000,
    statusNote: null,
    ...options.chapter
  };
  const contentVersionId = `content-version-${chapter.chapterNo}`;
  const contentHash = hashCanonicalJson({
    chapterId: chapter.id,
    contentVersionId,
    body: '测试正文只用于 provider ABI 夹具。'
  });
  const featureCore = {
    featureCardVersionId: `feature-version-${chapter.chapterNo}`,
    revision: 1,
    oneLineSummary: '主角在本章完成关键推进。',
    coreTask: '推进主线',
    mainConflict: '主角与对手正面冲突',
    appealPoint: '逆袭',
    emotionKeywords: ['紧张'],
    characterChanges: ['主角取得主动权'],
    relationshipChanges: [],
    keyInformation: ['关键证据出现'],
    foreshadowingOperation: '埋下后续伏笔',
    endingHook: '新的对手出现',
    factsCannotChange: ['关键证据已经公开'],
    featuresToStrengthen: []
  };
  const reviewCore = {
    reviewReportId: `review-${chapter.chapterNo}`,
    revision: contentVersionId,
    totalScore: 86,
    rating: 'A',
    summary: '单章审稿通过。',
    problems: [],
    suggestions: [],
    issues: [],
    recommendedAction: '继续',
    allowNextStep: true,
    blockingIssueCount: 0,
    resolvedStatus: 'resolved',
    policyProfileVersionId: novel.policyProfileVersionId
  };
  const chapterCore = {
    chapter,
    content: {
      contentVersionId,
      revision: 1,
      wordCount: 2_000,
      summary: '本章目标、关键事件与结尾状态。',
      excerpts: {
        opening: '开端证据片段。',
        middle: '中段证据片段。',
        ending: '结尾证据片段。'
      },
      contentHash
    },
    featureCard: { ...featureCore, featureCardHash: hashCanonicalJson(featureCore) },
    review: { ...reviewCore, reviewHash: hashCanonicalJson(reviewCore) }
  };
  const chapterEvidence = [{ ...chapterCore, evidenceHash: hashCanonicalJson(chapterCore) }];
  const memoryCore = {
    memoryId: 'memory-1',
    revision: contentVersionId,
    sourceContentVersionId: contentVersionId,
    previousSummary: '全书长期记忆摘要。',
    characterStates: ['主角取得主动权'],
    relationshipStates: [],
    locations: [],
    organizations: [],
    items: [],
    plantedForeshadowing: [],
    resolvedForeshadowing: [],
    unresolvedConflicts: [],
    newSettings: [],
    factsCannotContradict: ['关键证据已经公开']
  };
  const memory = { ...memoryCore, memoryHash: hashCanonicalJson(memoryCore) };
  const chapterPlanVersionId = 'chapter-plan-version-1';
  const manifestCore = {
    manifestVersion: 1 as const,
    tenantId: options.tenantId ?? 'tenant_test',
    novelId: novel.id,
    chapterPlanVersionId,
    policyProfileVersionId: novel.policyProfileVersionId,
    chapterCount: 1,
    coveredChapterNos: [chapter.chapterNo],
    chapters: [{
      chapterId: chapter.id,
      chapterNo: chapter.chapterNo,
      contentVersionId,
      contentRevision: 1,
      contentHash,
      featureCardVersionId: chapterEvidence[0].featureCard.featureCardVersionId,
      featureCardRevision: chapterEvidence[0].featureCard.revision,
      featureCardHash: chapterEvidence[0].featureCard.featureCardHash,
      reviewReportId: chapterEvidence[0].review.reviewReportId,
      reviewRevision: chapterEvidence[0].review.revision,
      reviewHash: chapterEvidence[0].review.reviewHash
    }],
    memory: {
      memoryId: memory.memoryId,
      memoryRevision: memory.revision,
      memoryHash: memory.memoryHash
    }
  };
  const coverageManifest = { ...manifestCore, manifestHash: hashCanonicalJson(manifestCore) };
  const inputCore = {
    action: 'novel_full_review' as const,
    novel,
    coverageManifest,
    chapterEvidence,
    memory,
    sourceVersionRefs: {
      directionVersionId: 'direction-version-1',
      settingVersionId: 'setting-version-1',
      outlineVersionId: 'outline-version-1',
      stageOutlineVersionId: 'stage-outline-version-1',
      chapterPlanVersionId,
      bodyStrategySnapshotId: 'body-strategy-version-1',
      chapterContentVersionIds: [contentVersionId]
    }
  };
  return { ...inputCore, evidenceHash: hashCanonicalJson(inputCore) };
}
