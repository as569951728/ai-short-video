import {
  ErrorCode,
  RiskLevel,
  type ChapterReviewIssueDTO,
  type ChapterSummaryCompareDTO,
  type DirectionCandidateContentDTO,
  type NovelProviderAction,
  type StructureAssetContentDTO,
  type StructureAssetType
} from '@ai-shortvideo/shared';
import { BusinessError } from '../../../shared/errors.js';
import type {
  ChapterFeatureCardRecord,
  ChapterContentVersionRecord,
  CreativeVersionRecord,
  DirectionCandidateDraft,
  FullReviewDraft,
  ImpactAssessmentDraft,
  LongTermMemoryRecord,
  NovelChapterRecord,
  NovelPreferencesRecord,
  NovelRecord,
  ReviewReportRecord,
  StructureAssetDraft,
  TrialChapterCandidateDraft,
  TrialReviewDraft
} from '../domain/novelDomain.js';
import type { BodyProvider } from '../providers/mockBodyProvider.js';
import type { DirectionProvider } from '../providers/mockDirectionProvider.js';
import type { FullReviewProvider } from '../providers/mockFullReviewProvider.js';
import type { StructureProvider } from '../providers/mockStructureProvider.js';
import type { TrialChapterCandidateDraftLike, TrialProvider } from '../providers/mockTrialProvider.js';
import { hashCanonicalJson } from '../domain/executionContract.js';

export interface NovelProviderInputV1 { id: string; title: string; genres: string[]; chapterLimit: number; chapterWordMin: number; chapterWordMax: number; policyProfileVersionId: string | null; }

export interface ChapterProviderInputV1 {
  id: string;
  chapterNo: number;
  title: string;
  wordTarget: number | null;
  statusNote: string | null;
}

export interface NovelPreferencesProviderInputV1 {
  appealPoints: string[];
  targetAudience: string | null;
  stageCount: number | null;
}

export interface BodyStrategyProviderInputV1 {
  id: string;
  versionNo: number;
  title: string | null;
  summary: string | null;
  riskLevel: RiskLevel;
  riskTags: string[];
  providerSafeMetadata: ProviderSafeMetadataV1;
}

export interface ChapterContentProviderInputV1 {
  id: string;
  content: string;
  summary: string | null;
  reviewScore: number | null;
  providerSafeMetadata: ProviderSafeMetadataV1;
}

export interface LongTermMemoryProviderInputV1 {
  previousSummary: string | null;
  characterStates: string[];
  relationshipStates: string[];
  unresolvedConflicts: string[];
  factsCannotContradict: string[];
}

export interface ProviderSafeMetadataV1 {
  scoringStrategyVersion: string | null;
  hardFailed: boolean | null;
  candidateRank: number | null;
  isMockOutput: boolean | null;
}

export interface FullReviewSourceVersionRefsProviderInputV1 {
  directionVersionId: string | null;
  settingVersionId: string | null;
  outlineVersionId: string | null;
  stageOutlineVersionId: string | null;
  chapterPlanVersionId: string | null;
  bodyStrategySnapshotId: string | null;
  chapterContentVersionIds: string[];
}

export type FullReviewEvidenceFailureCode =
  | 'coverage_incomplete'
  | 'evidence_incomplete'
  | 'memory_stale'
  | 'coverage_duplicate'
  | 'source_stale';

export class FullReviewEvidenceValidationError extends Error {
  constructor(
    readonly code: FullReviewEvidenceFailureCode,
    message: string
  ) {
    super(message);
    this.name = 'FullReviewEvidenceValidationError';
  }
}

export interface FullReviewCoverageChapterV1 {
  chapterId: string;
  chapterNo: number;
  contentVersionId: string;
  contentRevision: number;
  contentHash: string;
  featureCardVersionId: string;
  featureCardRevision: number;
  featureCardHash: string;
  reviewReportId: string;
  reviewRevision: string;
  reviewHash: string;
}

export interface FullReviewCoverageManifestV1 {
  manifestVersion: 1;
  tenantId: string;
  novelId: string;
  chapterPlanVersionId: string;
  policyProfileVersionId: string | null;
  chapterCount: number;
  coveredChapterNos: number[];
  chapters: FullReviewCoverageChapterV1[];
  memory: {
    memoryId: string;
    memoryRevision: string;
    memoryHash: string;
  };
  manifestHash: string;
}

export interface FullReviewChapterEvidenceProviderInputV1 {
  chapter: ChapterProviderInputV1;
  content: {
    contentVersionId: string;
    revision: number;
    wordCount: number;
    summary: string;
    excerpts: {
      opening: string;
      middle: string;
      ending: string;
    };
    contentHash: string;
  };
  featureCard: {
    featureCardVersionId: string;
    revision: number;
    oneLineSummary: string;
    coreTask: string | null;
    mainConflict: string;
    appealPoint: string | null;
    emotionKeywords: string[];
    characterChanges: string[];
    relationshipChanges: string[];
    keyInformation: string[];
    foreshadowingOperation: string | null;
    endingHook: string | null;
    factsCannotChange: string[];
    featuresToStrengthen: string[];
    featureCardHash: string;
  };
  review: {
    reviewReportId: string;
    revision: string;
    totalScore: number | null;
    rating: string | null;
    summary: string | null;
    problems: string[];
    suggestions: string[];
    issues: ChapterReviewIssueDTO[];
    recommendedAction: string | null;
    allowNextStep: boolean;
    blockingIssueCount: number;
    resolvedStatus: string | null;
    policyProfileVersionId: string | null;
    reviewHash: string;
  };
  continuity?: {
    stage: {
      stageIndex: number | null;
      isStageOpening: boolean;
      isStageEnding: boolean;
      previousChapterId: string | null;
      nextChapterId: string | null;
    };
    characterArc: {
      characterChanges: string[];
      relationshipChanges: string[];
    };
    timeline: {
      chapterNo: number;
      factAnchors: string[];
    };
    foreshadowing: {
      operation: string | null;
      endingHook: string | null;
    };
    excerptLocations: Array<{
      kind: 'opening' | 'middle' | 'ending';
      startChar: number;
      endChar: number;
      excerptHash: string;
    }>;
  };
  evidenceHash: string;
}

export interface FullReviewMemoryEvidenceProviderInputV1 {
  memoryId: string;
  revision: string;
  sourceContentVersionId: string;
  previousSummary: string;
  characterStates: string[];
  relationshipStates: string[];
  locations: string[];
  organizations: string[];
  items: string[];
  plantedForeshadowing: string[];
  resolvedForeshadowing: string[];
  unresolvedConflicts: string[];
  newSettings: string[];
  factsCannotContradict: string[];
  memoryHash: string;
}

export interface FullReviewEvidenceProviderInputV1 {
  action: 'novel_full_review';
  novel: NovelProviderInputV1;
  coverageManifest: FullReviewCoverageManifestV1;
  chapterEvidence: FullReviewChapterEvidenceProviderInputV1[];
  memory: FullReviewMemoryEvidenceProviderInputV1;
  sourceVersionRefs: FullReviewSourceVersionRefsProviderInputV1;
  evidenceHash: string;
}

export interface FullReviewAuthorityFactsV1 {
  tenantId: string;
  novel: NovelRecord;
  chapters: NovelChapterRecord[];
  contents: ChapterContentVersionRecord[];
  featureCards: ChapterFeatureCardRecord[];
  reviews: ReviewReportRecord[];
  memory: LongTermMemoryRecord | null;
  sourceVersionRefs: FullReviewSourceVersionRefsProviderInputV1;
}

export interface DirectionCandidateContentProviderInputV1 {
  title: string;
  logline: string;
  coreHook: string;
  audienceAppeal: string;
  videoPotential: string;
  sellingPoints: string[];
  riskTags: string[];
  recommendation: string;
}

export interface DirectionDraftProviderInputV1 {
  title: string;
  summary: string;
  content: DirectionCandidateContentProviderInputV1;
  score: number;
  marketScore: number;
  riskLevel: RiskLevel;
  riskTags: string[];
  recommendedReason: string;
}

export interface CreativeAssetProviderInputV1 {
  id: string;
  objectType: string;
  versionNo: number;
  title: string | null;
  summary: string | null;
  score: number | null;
  riskLevel: RiskLevel;
  riskTags: string[];
  content: CreativeAssetContentProviderInputV1;
}

export type CreativeAssetContentProviderInputV1 =
  | { kind: 'direction'; logline: string; coreHook: string }
  | ({ kind: 'structure' } & Pick<StructureAssetContentDTO, 'sections' | 'stages' | 'chapters'>);

const STRUCTURE_PROVIDER_OBJECT_TYPES = {
  setting_generate: 'setting',
  outline_generate: 'outline',
  stage_outline_generate: 'stage_outline',
  chapter_plan_generate: 'chapter_plan'
} as const satisfies Record<string, StructureAssetType>;
export type StructureProviderAction = keyof typeof STRUCTURE_PROVIDER_OBJECT_TYPES;
const STRUCTURE_ASSET_SLOTS = ['direction', 'setting', 'outline', 'stageOutline'] as const;
type StructureAssetSlot = (typeof STRUCTURE_ASSET_SLOTS)[number];
const STRUCTURE_ASSET_DEPENDENCIES = { setting_generate: ['direction'], outline_generate: ['direction', 'setting'], stage_outline_generate: ['direction', 'setting', 'outline'], chapter_plan_generate: STRUCTURE_ASSET_SLOTS } as const satisfies Record<StructureProviderAction, readonly StructureAssetSlot[]>;
type StructureAssetDependency<A extends StructureProviderAction> = (typeof STRUCTURE_ASSET_DEPENDENCIES)[A][number];
export type StructureCurrentAssetsProviderInputV1 = { [S in StructureAssetSlot]: CreativeAssetProviderInputV1 | null };
export type StructureCurrentAssetsProviderInputFor<A extends StructureProviderAction> = { [S in StructureAssetSlot]: S extends StructureAssetDependency<A> ? CreativeAssetProviderInputV1 : null };
export interface StructureOptimizationProviderInputV1 {
  source: CreativeAssetProviderInputV1;
  instruction: string;
}
type StructureProviderObjectType<A extends StructureProviderAction> = (typeof STRUCTURE_PROVIDER_OBJECT_TYPES)[A];
interface StructureProviderActionInputBase {
  novel: NovelProviderInputV1;
  preferences: NovelPreferencesProviderInputV1;
  optimization: StructureOptimizationProviderInputV1 | null;
}
type StructureProviderActionInput = {
  [A in StructureProviderAction]: StructureProviderActionInputBase & {
    action: A;
    objectType: StructureProviderObjectType<A>;
    currentAssets: StructureCurrentAssetsProviderInputFor<A>;
  }
}[StructureProviderAction];

export type NovelProviderActionInput =
  | { action: 'direction_generate'; novel: NovelProviderInputV1; preferences: NovelPreferencesProviderInputV1 }
  | { action: 'direction_fuse'; sources: DirectionDraftProviderInputV1[]; reason?: string | null }
  | { action: 'direction_optimize'; source: DirectionDraftProviderInputV1; instruction: string }
  | StructureProviderActionInput
  | { action: 'trial_chapter_one_generate'; novel: NovelProviderInputV1; preferences: NovelPreferencesProviderInputV1; chapters: ChapterProviderInputV1[]; chapterCount: number }
  | { action: 'trial_followup_generate'; novel: NovelProviderInputV1; selectedCandidate: TrialChapterCandidateDraftLike; chapters: ChapterProviderInputV1[] }
  | { action: 'body_batch_generate'; novel: NovelProviderInputV1; chapter: ChapterProviderInputV1; strategySnapshot: BodyStrategyProviderInputV1; previousContent: ChapterContentProviderInputV1 | null; previousMemory: LongTermMemoryProviderInputV1 | null; previousBatchNotes: string[]; enhancedReview: boolean }
  | { action: 'chapter_body_generate'; novel: NovelProviderInputV1; chapter: ChapterProviderInputV1; strategySnapshot: BodyStrategyProviderInputV1; previousContent: ChapterContentProviderInputV1 | null; previousMemory: LongTermMemoryProviderInputV1 | null; previousBatchNotes: string[]; enhancedReview: boolean }
  | { action: 'chapter_rewrite'; novel: NovelProviderInputV1; chapter: ChapterProviderInputV1; currentContent: ChapterContentProviderInputV1; instruction: string }
  | { action: 'chapter_impact_assess'; novel: NovelProviderInputV1; chapter: ChapterProviderInputV1; oldContent: ChapterContentProviderInputV1 | null; newContent: ChapterContentProviderInputV1; instruction?: string | null }
  | { action: 'chapter_adopt_impact_assess'; novel: NovelProviderInputV1; chapter: ChapterProviderInputV1; oldContent: ChapterContentProviderInputV1 | null; newContent: ChapterContentProviderInputV1; instruction?: string | null }
  | FullReviewEvidenceProviderInputV1;

export type NovelProviderActionInputFor<A extends NovelProviderAction> = Extract<NovelProviderActionInput, { action: A }>;
export const ACTION_INPUT_KEYS = {
  direction_generate: ['action', 'novel', 'preferences'],
  direction_fuse: ['action', 'reason', 'sources'],
  direction_optimize: ['action', 'instruction', 'source'],
  setting_generate: ['action', 'currentAssets', 'novel', 'objectType', 'optimization', 'preferences'],
  outline_generate: ['action', 'currentAssets', 'novel', 'objectType', 'optimization', 'preferences'],
  stage_outline_generate: ['action', 'currentAssets', 'novel', 'objectType', 'optimization', 'preferences'],
  chapter_plan_generate: ['action', 'currentAssets', 'novel', 'objectType', 'optimization', 'preferences'],
  trial_chapter_one_generate: ['action', 'chapterCount', 'chapters', 'novel', 'preferences'],
  trial_followup_generate: ['action', 'chapters', 'novel', 'selectedCandidate'],
  body_batch_generate: ['action', 'chapter', 'enhancedReview', 'novel', 'previousBatchNotes', 'previousContent', 'previousMemory', 'strategySnapshot'],
  chapter_body_generate: ['action', 'chapter', 'enhancedReview', 'novel', 'previousBatchNotes', 'previousContent', 'previousMemory', 'strategySnapshot'],
  chapter_rewrite: ['action', 'chapter', 'currentContent', 'instruction', 'novel'],
  chapter_impact_assess: ['action', 'chapter', 'instruction', 'newContent', 'novel', 'oldContent'],
  chapter_adopt_impact_assess: ['action', 'chapter', 'instruction', 'newContent', 'novel', 'oldContent'],
  novel_full_review: ['action', 'chapterEvidence', 'coverageManifest', 'evidenceHash', 'memory', 'novel', 'sourceVersionRefs']
} as const satisfies { [A in NovelProviderAction]: readonly (keyof NovelProviderActionInputFor<A>)[] };
type IsExactType<Actual, Expected> =
  (<T>() => T extends Actual ? 1 : 2) extends (<T>() => T extends Expected ? 1 : 2) ? true : false;
type AssertExactType<T extends true> = T;
type _SettingObjectTypeAbi = AssertExactType<IsExactType<NovelProviderActionInputFor<'setting_generate'>['objectType'], 'setting'>>;
type _OutlineObjectTypeAbi = AssertExactType<IsExactType<NovelProviderActionInputFor<'outline_generate'>['objectType'], 'outline'>>;
type _StageOutlineObjectTypeAbi = AssertExactType<IsExactType<NovelProviderActionInputFor<'stage_outline_generate'>['objectType'], 'stage_outline'>>;
type _ChapterPlanObjectTypeAbi = AssertExactType<IsExactType<NovelProviderActionInputFor<'chapter_plan_generate'>['objectType'], 'chapter_plan'>>;
type _SettingCurrentAssetsAbi = AssertExactType<IsExactType<NovelProviderActionInputFor<'setting_generate'>['currentAssets'], StructureCurrentAssetsProviderInputFor<'setting_generate'>>>;
type ChapterResultRefProviderOutputV1 = Pick<ChapterProviderInputV1, 'id' | 'chapterNo'>;
type ProviderMetadataV1 = Partial<{ scoringStrategyVersion: string; hardFailed: boolean; summary: string }>;
type ChapterFeatureCardProviderOutputV1 = Pick<ChapterFeatureCardRecord, 'chapterId' | 'oneLineSummary' | 'coreTask' | 'mainConflict' | 'appealPoint' | 'emotionKeywords' | 'characterChanges' | 'relationshipChanges' | 'keyInformation' | 'foreshadowingOperation' | 'endingHook' | 'factsCannotChange' | 'featuresToStrengthen'> & { metadata: ProviderMetadataV1 };
type ChapterReviewProviderOutputV1 = Pick<ReviewReportRecord, 'reviewLevel' | 'totalScore' | 'rating' | 'summary' | 'strengths' | 'problems' | 'suggestions' | 'recommendedAction' | 'allowNextStep' | 'blockingIssueCount' | 'resolvedStatus' | 'promptTemplateVersionId' | 'policyProfileVersionId'> & { subScores: Record<string, string | number>; issueCards: ChapterReviewIssueDTO[]; actionOptions: string[]; metadata: ProviderMetadataV1 };
type LongTermMemoryProviderOutputV1 = Pick<LongTermMemoryRecord, 'previousSummary' | 'characterStates' | 'relationshipStates' | 'locations' | 'organizations' | 'items' | 'plantedForeshadowing' | 'resolvedForeshadowing' | 'unresolvedConflicts' | 'newSettings' | 'factsCannotContradict'> & { metadata: ProviderMetadataV1 };
type GeneratedChapterProviderDraftV1 = Pick<TrialChapterCandidateDraft, 'content' | 'summary' | 'openingStrategy' | 'openingHighlight' | 'firstSentence' | 'first300Summary' | 'endingHook' | 'riskLevel' | 'riskTags' | 'aiRecommendedReason' | 'scoring'> & { chapter: ChapterResultRefProviderOutputV1; featureCard: ChapterFeatureCardProviderOutputV1; review: ChapterReviewProviderOutputV1; hardFailed: boolean; hardFailureReasons: string[] };
export type TrialFollowupChapterProviderDraft = GeneratedChapterProviderDraftV1;
export type BodyChapterProviderDraft = GeneratedChapterProviderDraftV1 & { memory: LongTermMemoryProviderOutputV1 };

export interface NovelProviderActionResultMap {
  direction_generate: DirectionCandidateDraft[];
  direction_fuse: DirectionCandidateDraft;
  direction_optimize: DirectionCandidateDraft;
  setting_generate: StructureAssetDraft;
  outline_generate: StructureAssetDraft;
  stage_outline_generate: StructureAssetDraft;
  chapter_plan_generate: StructureAssetDraft;
  trial_chapter_one_generate: TrialChapterCandidateDraft[];
  trial_followup_generate: { chapters: TrialFollowupChapterProviderDraft[]; review: TrialReviewDraft };
  body_batch_generate: BodyChapterProviderDraft;
  chapter_body_generate: BodyChapterProviderDraft;
  chapter_rewrite: { candidate: BodyChapterProviderDraft; summaryCompare: ChapterSummaryCompareDTO };
  chapter_impact_assess: ImpactAssessmentDraft;
  chapter_adopt_impact_assess: ImpactAssessmentDraft;
  novel_full_review: FullReviewDraft;
}

export type NovelProviderActionResult<A extends NovelProviderAction = NovelProviderAction> = NovelProviderActionResultMap[A];

export interface NovelProviderSet {
  directionProvider: DirectionProvider;
  structureProvider: StructureProvider;
  trialProvider: TrialProvider;
  bodyProvider: BodyProvider;
  fullReviewProvider: FullReviewProvider;
}

interface NovelProviderObjectTypeByAction {
  direction_generate: 'direction';
  direction_fuse: 'direction';
  direction_optimize: 'direction';
  setting_generate: 'setting';
  outline_generate: 'outline';
  stage_outline_generate: 'stage_outline';
  chapter_plan_generate: 'chapter_plan';
  trial_chapter_one_generate: 'trial_run';
  trial_followup_generate: 'trial_run';
  body_batch_generate: 'novel';
  chapter_body_generate: 'chapter';
  chapter_rewrite: 'chapter';
  chapter_impact_assess: 'chapter';
  chapter_adopt_impact_assess: 'chapter';
  novel_full_review: 'novel';
}

export interface ActionExecutionPlan<A extends NovelProviderAction = NovelProviderAction> {
  action: A;
  taskType: string;
  objectType: NovelProviderObjectTypeByAction[A];
  conflictScope: string;
  inputSummary: string;
  providerKind: 'direction' | 'structure' | 'trial' | 'body' | 'review';
  executeProvider(providers: NovelProviderSet, input: NovelProviderActionInputFor<A>): Promise<NovelProviderActionResult<A>>;
}

export type AnyActionExecutionPlan = {
  [A in NovelProviderAction]: ActionExecutionPlan<A>
}[NovelProviderAction];

export const ACTION_EXECUTION_PLANS: { [A in NovelProviderAction]: ActionExecutionPlan<A> } = {
  direction_generate: plan('direction_generate', 'novel_direction_generate', 'direction', 'novel_direction', '生成小说方向候选', 'direction', (providers, input) => providers.directionProvider.generateCandidates(input)),
  direction_fuse: plan('direction_fuse', 'novel_direction_fuse', 'direction', 'novel_direction', '融合小说方向候选', 'direction', (providers, input) => providers.directionProvider.fuseCandidates(input)),
  direction_optimize: plan('direction_optimize', 'novel_direction_optimize', 'direction', 'novel_direction', '优化小说方向候选', 'direction', (providers, input) => providers.directionProvider.optimizeCandidate(input)),
  setting_generate: plan('setting_generate', 'novel_setting_generate', 'setting', 'novel_setting', '生成小说设定候选', 'structure', (providers, input) => providers.structureProvider.generateAsset(input)),
  outline_generate: plan('outline_generate', 'novel_outline_generate', 'outline', 'novel_outline', '生成全书大纲候选', 'structure', (providers, input) => providers.structureProvider.generateAsset(input)),
  stage_outline_generate: plan('stage_outline_generate', 'stage_outline_generate', 'stage_outline', 'novel_outline', '生成阶段大纲候选', 'structure', (providers, input) => providers.structureProvider.generateAsset(input)),
  chapter_plan_generate: plan('chapter_plan_generate', 'chapter_plan_generate', 'chapter_plan', 'novel_outline', '生成章节目录候选', 'structure', (providers, input) => providers.structureProvider.generateAsset(input)),
  trial_chapter_one_generate: plan('trial_chapter_one_generate', 'trial_writing_generate', 'trial_run', 'novel_trial', '生成首章试写候选', 'trial', (providers, input) => providers.trialProvider.generateChapterOneCandidates(input)),
  trial_followup_generate: plan('trial_followup_generate', 'trial_followup_generate', 'trial_run', 'novel_trial_followup', '生成后续试写章节和总评', 'trial', (providers, input) => providers.trialProvider.generateFollowup(input)),
  body_batch_generate: plan('body_batch_generate', 'body_batch_generate', 'novel', 'novel_body', '生成批量章节正文', 'body', (providers, input) => providers.bodyProvider.generateBodyChapter(input)),
  chapter_body_generate: plan('chapter_body_generate', 'chapter_body_generate', 'chapter', 'chapter', '生成单章正文', 'body', (providers, input) => providers.bodyProvider.generateBodyChapter(input)),
  chapter_rewrite: plan('chapter_rewrite', 'chapter_body_rewrite', 'chapter', 'chapter', '生成章节重写候选', 'body', (providers, input) => providers.bodyProvider.rewriteChapter(input)),
  chapter_impact_assess: plan('chapter_impact_assess', 'chapter_impact_assess', 'chapter', 'chapter', '评估章节正文影响', 'body', (providers, input) => providers.bodyProvider.assessImpact(input)),
  chapter_adopt_impact_assess: plan('chapter_adopt_impact_assess', 'chapter_impact_assess', 'chapter', 'chapter', '采用候选前评估章节影响', 'body', (providers, input) => providers.bodyProvider.assessImpact(input)),
  novel_full_review: plan('novel_full_review', 'novel_full_review', 'novel', 'novel_body', '生成全书审稿报告', 'review', (providers, input) => providers.fullReviewProvider.generateFullReview(input))
};

type PlanInput<A extends NovelProviderAction> = Parameters<(typeof ACTION_EXECUTION_PLANS)[A]['executeProvider']>[1];
type _SettingPlanInputAbi = AssertExactType<IsExactType<PlanInput<'setting_generate'>, NovelProviderActionInputFor<'setting_generate'>>>;
type _OutlinePlanInputAbi = AssertExactType<IsExactType<PlanInput<'outline_generate'>, NovelProviderActionInputFor<'outline_generate'>>>;
type _StageOutlinePlanInputAbi = AssertExactType<IsExactType<PlanInput<'stage_outline_generate'>, NovelProviderActionInputFor<'stage_outline_generate'>>>;
type _ChapterPlanPlanInputAbi = AssertExactType<IsExactType<PlanInput<'chapter_plan_generate'>, NovelProviderActionInputFor<'chapter_plan_generate'>>>;

export function getActionExecutionPlan<A extends NovelProviderAction>(action: A): ActionExecutionPlan<A> {
  const executionPlan = ACTION_EXECUTION_PLANS[action];
  if (!executionPlan) throw new BusinessError(ErrorCode.ConfigMissing, '生成动作执行计划未配置。', { action });
  return executionPlan;
}

export function listActionExecutionPlans() {
  return Object.values(ACTION_EXECUTION_PLANS);
}

export function executeNovelProviderAction<A extends NovelProviderAction>(providers: NovelProviderSet, input: NovelProviderActionInputFor<A>): Promise<NovelProviderActionResult<A>>;
// Construction boundary only; the dispatcher validates and narrows this projection before any provider call.
export function executeNovelProviderAction<A extends StructureProviderAction>(providers: NovelProviderSet, input: Omit<NovelProviderActionInputFor<A>, 'currentAssets'> & { action: A; currentAssets: StructureCurrentAssetsProviderInputV1 }): Promise<NovelProviderActionResult<A>>;
export function executeNovelProviderAction(
  providers: NovelProviderSet,
  input: { action: NovelProviderAction; objectType?: StructureAssetType; currentAssets?: unknown }
): Promise<NovelProviderActionResult> {
  const executionPlan = getActionExecutionPlan(input.action);
  return executionPlan.executeProvider(providers, strictProviderInput(input, executionPlan.action));
}

export function projectStructureCurrentAssetsPrompt<A extends StructureProviderAction>(action: A, assets: unknown): Record<StructureAssetDependency<A>, Record<string, unknown>> {
  const source = exactRecord(assets, 'currentAssets', STRUCTURE_ASSET_SLOTS), required = STRUCTURE_ASSET_DEPENDENCIES[action] as readonly StructureAssetSlot[];
  for (const slot of STRUCTURE_ASSET_SLOTS) if (!required.includes(slot) && source[slot] !== null) throw new Error(`currentAssets.${slot} is forbidden for ${action}`);
  return Object.fromEntries(required.map((slot) => [slot, summarizeAssetValue(source[slot], slot)])) as Record<StructureAssetDependency<A>, Record<string, unknown>>;
}

export function projectNovelProviderInput(novel: NovelRecord): NovelProviderInputV1 {
  return {
    id: novel.id,
    title: novel.title,
    genres: [...novel.genres].sort(),
    chapterLimit: novel.chapterLimit,
    chapterWordMin: novel.chapterWordMin,
    chapterWordMax: novel.chapterWordMax,
    policyProfileVersionId: novel.policyProfileVersionId
  };
}

export function projectChapterProviderInput(chapter: NovelChapterRecord): ChapterProviderInputV1 {
  return {
    id: chapter.id,
    chapterNo: chapter.chapterNo,
    title: chapter.title,
    wordTarget: chapter.wordTarget,
    statusNote: chapter.statusNote
  };
}

export function projectPreferencesProviderInput(preferences: NovelPreferencesRecord): NovelPreferencesProviderInputV1 {
  return {
    appealPoints: [...preferences.appealPoints],
    targetAudience: preferences.targetAudience,
    stageCount: preferences.stageCount
  };
}

export function projectBodyStrategyProviderInput(strategy: CreativeVersionRecord): BodyStrategyProviderInputV1 {
  return {
    id: strategy.id,
    versionNo: strategy.versionNo,
    title: readCreativeAssetTitle(strategy.content),
    summary: strategy.summary,
    riskLevel: strategy.riskLevel,
    riskTags: readCreativeAssetRiskTags(strategy.content),
    providerSafeMetadata: readProviderSafeMetadata(strategy.metadata)
  };
}

export function projectChapterContentProviderInput(content: ChapterContentVersionRecord): ChapterContentProviderInputV1 {
  return {
    id: content.id,
    content: content.content,
    summary: content.summary,
    reviewScore: content.reviewScore,
    providerSafeMetadata: readProviderSafeMetadata(content.metadata)
  };
}

export function projectDirectionDraftProviderInput(input: DirectionDraftProviderInputV1): DirectionDraftProviderInputV1 {
  return {
    title: input.title,
    summary: input.summary,
    content: projectDirectionCandidateContentProviderInput(input.content),
    score: input.score,
    marketScore: input.marketScore,
    riskLevel: input.riskLevel,
    riskTags: [...input.riskTags],
    recommendedReason: input.recommendedReason
  };
}

function projectDirectionCandidateContentProviderInput(
  content: DirectionCandidateContentDTO
): DirectionCandidateContentProviderInputV1 {
  return {
    title: content.title,
    logline: content.logline,
    coreHook: content.coreHook,
    audienceAppeal: content.audienceAppeal,
    videoPotential: content.videoPotential,
    sellingPoints: [...content.sellingPoints],
    riskTags: [...content.riskTags],
    recommendation: content.recommendation
  };
}

export function projectCreativeAssetProviderInput(asset: CreativeVersionRecord | null): CreativeAssetProviderInputV1 | null {
  if (!asset) return null;
  const source = asset.content as Partial<DirectionCandidateContentDTO & StructureAssetContentDTO>;
  const content: CreativeAssetContentProviderInputV1 = asset.objectType === 'direction'
    ? { kind: 'direction', logline: clip(source.logline, 120), coreHook: clip(source.coreHook, 120) }
    : { kind: 'structure',
        sections: (source.sections ?? []).slice(0, 4).map(({ title, body, items }) => ({ title: clip(title, 80), body: clip(body, 240), items: items.slice(0, 4).map((item) => clip(item, 80)) })),
        stages: (source.stages ?? []).slice(0, 5).map(({ stageIndex, title, chapterRange, goal, conflict, payoff }) => ({ stageIndex, title: clip(title, 80), chapterRange: clip(chapterRange, 40), goal: clip(goal, 160), conflict: clip(conflict, 160), payoff: clip(payoff, 160) })),
        chapters: (source.chapters ?? []).slice(0, 8).map(({ chapterNo, stageIndex, title, wordTarget, goal, conflict, hook }) => ({ chapterNo, stageIndex, title: clip(title, 80), wordTarget, goal: clip(goal, 160), conflict: clip(conflict, 160), hook: clip(hook, 160) })) };
  return {
    id: asset.id,
    objectType: asset.objectType,
    versionNo: asset.versionNo,
    title: readCreativeAssetTitle(asset.content),
    summary: asset.summary,
    score: asset.score,
    riskLevel: asset.riskLevel,
    riskTags: readCreativeAssetRiskTags(asset.content),
    content
  };
}

export function projectLongTermMemoryProviderInput(memory: {
  previousSummary: string | null;
  characterStates?: string[] | null;
  relationshipStates?: string[] | null;
  unresolvedConflicts?: string[] | null;
  factsCannotContradict?: string[] | null;
} | null): LongTermMemoryProviderInputV1 | null {
  if (!memory) return null;
  return {
    previousSummary: memory.previousSummary,
    characterStates: Array.isArray(memory.characterStates) ? [...memory.characterStates] : [],
    relationshipStates: Array.isArray(memory.relationshipStates) ? [...memory.relationshipStates] : [],
    unresolvedConflicts: Array.isArray(memory.unresolvedConflicts) ? [...memory.unresolvedConflicts] : [],
    factsCannotContradict: Array.isArray(memory.factsCannotContradict) ? [...memory.factsCannotContradict] : []
  };
}

export function projectFullReviewSourceVersionRefsProviderInput(refs: {
  currentDirectionVersionId?: string | null;
  currentSettingVersionId?: string | null;
  currentOutlineVersionId?: string | null;
  currentStageOutlineVersionId?: string | null;
  currentChapterPlanVersionId?: string | null;
  directionVersionId?: string | null;
  settingVersionId?: string | null;
  outlineVersionId?: string | null;
  stageOutlineVersionId?: string | null;
  chapterPlanVersionId?: string | null;
  bodyStrategySnapshotId?: string | null;
  chapterContentVersionIds?: Array<string | { currentContentVersionId?: string | null }> | null;
}): FullReviewSourceVersionRefsProviderInputV1 {
  return {
    directionVersionId: refs.directionVersionId ?? refs.currentDirectionVersionId ?? null,
    settingVersionId: refs.settingVersionId ?? refs.currentSettingVersionId ?? null,
    outlineVersionId: refs.outlineVersionId ?? refs.currentOutlineVersionId ?? null,
    stageOutlineVersionId: refs.stageOutlineVersionId ?? refs.currentStageOutlineVersionId ?? null,
    chapterPlanVersionId: refs.chapterPlanVersionId ?? refs.currentChapterPlanVersionId ?? null,
    bodyStrategySnapshotId: refs.bodyStrategySnapshotId ?? null,
    chapterContentVersionIds: Array.isArray(refs.chapterContentVersionIds)
      ? refs.chapterContentVersionIds
          .map((item) => (typeof item === 'string' ? item : item.currentContentVersionId ?? null))
          .filter((item): item is string => typeof item === 'string' && item.length > 0)
      : []
  };
}

const FULL_REVIEW_EXCERPT_CHARS = 180;
const FULL_REVIEW_SUMMARY_CHARS = 240;
const FULL_REVIEW_LIST_ITEMS = 8;
const FULL_REVIEW_LIST_ITEM_CHARS = 160;

export function buildFullReviewEvidenceProviderInput(
  facts: FullReviewAuthorityFactsV1
): FullReviewEvidenceProviderInputV1 {
  const tenantId = evidenceId(facts.tenantId, 'tenantId');
  if (facts.novel.tenantId !== tenantId) evidenceFail('source_stale', '小说不属于当前租户。');
  const novel = projectNovelProviderInput(facts.novel);
  const chapters = [...facts.chapters].sort((left, right) => left.chapterNo - right.chapterNo || left.id.localeCompare(right.id));
  if (!chapters.length) evidenceFail('coverage_incomplete', '全书审稿缺少章节。');
  assertUniqueEvidence(chapters, (item) => item.id, '章节 ID');
  assertUniqueEvidence(chapters, (item) => String(item.chapterNo), '章节号');
  chapters.forEach((chapter, index) => {
    if (chapter.tenantId !== tenantId || chapter.novelId !== novel.id) evidenceFail('source_stale', '章节不属于当前小说。');
    if (chapter.chapterNo !== index + 1) evidenceFail('coverage_incomplete', '章节号必须从 1 开始连续。');
  });

  const contents = evidenceByChapter(facts.contents, chapters.length, '正文');
  const featureCards = evidenceByChapter(facts.featureCards, chapters.length, '章节特征卡');
  const reviews = evidenceByChapter(facts.reviews, chapters.length, '章节审稿', (item) => item.objectId);
  const sourceVersionRefs = projectFullReviewSourceVersionRefsProviderInput(facts.sourceVersionRefs);
  const chapterPlanVersionId = sourceVersionRefs.chapterPlanVersionId?.trim();
  if (!chapterPlanVersionId) evidenceFail('source_stale', '全书审稿缺少正式章节目录版本。');
  if (sourceVersionRefs.directionVersionId !== facts.novel.currentDirectionVersionId
    || sourceVersionRefs.settingVersionId !== facts.novel.currentSettingVersionId
    || sourceVersionRefs.outlineVersionId !== facts.novel.currentOutlineVersionId
    || sourceVersionRefs.stageOutlineVersionId !== facts.novel.currentStageOutlineVersionId
    || sourceVersionRefs.chapterPlanVersionId !== facts.novel.currentChapterPlanVersionId) {
    evidenceFail('source_stale', '全书审稿来源版本与小说当前权威指针不一致。');
  }
  if (chapters.length !== novel.chapterLimit) {
    evidenceFail('coverage_incomplete', '全书审稿章节数与小说计划章数不一致。');
  }

  const expectedContentIds = chapters.map((chapter) => evidenceId(chapter.currentContentVersionId, `第 ${chapter.chapterNo} 章正文版本`));
  assertUniqueEvidence(expectedContentIds, (item) => item, '当前正文版本引用');
  assertUniqueEvidence(
    chapters.map((chapter) => evidenceId(chapter.currentFeatureCardVersionId, `第 ${chapter.chapterNo} 章特征卡版本`)),
    (item) => item,
    '当前特征卡版本引用'
  );
  assertUniqueEvidence(
    chapters.map((chapter) => evidenceId(chapter.currentReviewReportId, `第 ${chapter.chapterNo} 章审稿版本`)),
    (item) => item,
    '当前审稿版本引用'
  );
  if (!sameOrderedValues(sourceVersionRefs.chapterContentVersionIds, expectedContentIds)) {
    evidenceFail('source_stale', '正文版本引用与当前章节不一致。');
  }

  const chapterEvidence = chapters.map((chapter, index) => {
    const content = contents.get(chapter.id)!;
    const featureCard = featureCards.get(chapter.id)!;
    const review = reviews.get(chapter.id)!;
    assertChapterEvidenceAuthority(tenantId, novel.id, chapter, content, featureCard, review);
    return projectFullReviewChapterEvidence(
      chapter,
      content,
      featureCard,
      review,
      chapters[index - 1] ?? null,
      chapters[index + 1] ?? null
    );
  });

  const memory = projectFullReviewMemoryEvidence(
    facts.memory,
    tenantId,
    novel.id,
    chapters.at(-1)!,
    expectedContentIds.at(-1)!
  );
  const manifestChapters = chapterEvidence.map<FullReviewCoverageChapterV1>((item) => ({
    chapterId: item.chapter.id,
    chapterNo: item.chapter.chapterNo,
    contentVersionId: item.content.contentVersionId,
    contentRevision: item.content.revision,
    contentHash: item.content.contentHash,
    featureCardVersionId: item.featureCard.featureCardVersionId,
    featureCardRevision: item.featureCard.revision,
    featureCardHash: item.featureCard.featureCardHash,
    reviewReportId: item.review.reviewReportId,
    reviewRevision: item.review.revision,
    reviewHash: item.review.reviewHash
  }));
  const manifestCore = {
    manifestVersion: 1 as const,
    tenantId,
    novelId: novel.id,
    chapterPlanVersionId,
    policyProfileVersionId: novel.policyProfileVersionId,
    chapterCount: chapters.length,
    coveredChapterNos: chapters.map((item) => item.chapterNo),
    chapters: manifestChapters,
    memory: {
      memoryId: memory.memoryId,
      memoryRevision: memory.revision,
      memoryHash: memory.memoryHash
    }
  };
  const coverageManifest: FullReviewCoverageManifestV1 = {
    ...manifestCore,
    manifestHash: hashCanonicalJson(manifestCore)
  };
  const inputCore = {
    action: 'novel_full_review' as const,
    novel,
    coverageManifest,
    chapterEvidence,
    memory,
    sourceVersionRefs
  };
  return validateFullReviewEvidenceProviderInput({
    ...inputCore,
    evidenceHash: hashCanonicalJson(inputCore)
  });
}

export function validateFullReviewEvidenceProviderInput(
  input: FullReviewEvidenceProviderInputV1
): FullReviewEvidenceProviderInputV1 {
  assertFullReviewEvidenceShape(input);
  const manifest = input.coverageManifest;
  const { manifestHash, ...manifestCore } = manifest;
  if (hashCanonicalJson(manifestCore) !== manifestHash) evidenceFail('source_stale', '全书审稿 coverage manifest hash 不一致。');
  if (manifest.novelId !== input.novel.id
    || manifest.policyProfileVersionId !== input.novel.policyProfileVersionId
    || manifest.chapterPlanVersionId !== input.sourceVersionRefs.chapterPlanVersionId) {
    evidenceFail('source_stale', 'coverage manifest 与小说或章节目录版本不一致。');
  }
  if (!Number.isInteger(manifest.chapterCount) || manifest.chapterCount < 1
    || manifest.chapterCount !== input.chapterEvidence.length
    || manifest.chapterCount !== input.novel.chapterLimit) {
    evidenceFail('coverage_incomplete', '全书审稿证据数量不完整。');
  }
  assertUniqueEvidence(input.chapterEvidence, (item) => item.chapter.id, '章节证据 ID');
  assertUniqueEvidence(input.chapterEvidence, (item) => item.content.contentVersionId, '章节正文版本');
  assertUniqueEvidence(input.chapterEvidence, (item) => item.featureCard.featureCardVersionId, '章节特征卡版本');
  assertUniqueEvidence(input.chapterEvidence, (item) => item.review.reviewReportId, '章节审稿版本');
  const expectedChapterNos = input.chapterEvidence.map((item, index) => {
    if (item.chapter.chapterNo !== index + 1) evidenceFail('coverage_incomplete', '章节证据顺序不连续。');
    validateEvidenceHash(item.content.contentHash, '正文');
    validateBoundedEvidenceText(item.content.summary, '正文摘要', FULL_REVIEW_SUMMARY_CHARS);
    for (const [layer, excerpt] of Object.entries(item.content.excerpts)) {
      validateBoundedEvidenceText(excerpt, `正文${layer}片段`, FULL_REVIEW_EXCERPT_CHARS);
    }
    if (item.continuity) validateFullReviewContinuityEvidence(input.chapterEvidence, index);
    const { featureCardHash, ...featureCore } = item.featureCard;
    if (hashCanonicalJson(featureCore) !== featureCardHash) evidenceFail('source_stale', '章节特征卡 hash 不一致。');
    const { reviewHash, ...reviewCore } = item.review;
    if (hashCanonicalJson(reviewCore) !== reviewHash) evidenceFail('source_stale', '章节审稿 hash 不一致。');
    const { evidenceHash, ...chapterCore } = item;
    if (hashCanonicalJson(chapterCore) !== evidenceHash) evidenceFail('source_stale', '章节证据 hash 不一致。');
    return item.chapter.chapterNo;
  });
  if (!sameOrderedValues(manifest.coveredChapterNos, expectedChapterNos)) {
    evidenceFail('coverage_incomplete', 'coverage manifest 未覆盖全部章节。');
  }
  if (manifest.chapters.length !== input.chapterEvidence.length) {
    evidenceFail('coverage_incomplete', 'coverage manifest 章节数量不完整。');
  }
  manifest.chapters.forEach((row, index) => {
    const evidence = input.chapterEvidence[index]!;
    const expected = {
      chapterId: evidence.chapter.id,
      chapterNo: evidence.chapter.chapterNo,
      contentVersionId: evidence.content.contentVersionId,
      contentRevision: evidence.content.revision,
      contentHash: evidence.content.contentHash,
      featureCardVersionId: evidence.featureCard.featureCardVersionId,
      featureCardRevision: evidence.featureCard.revision,
      featureCardHash: evidence.featureCard.featureCardHash,
      reviewReportId: evidence.review.reviewReportId,
      reviewRevision: evidence.review.revision,
      reviewHash: evidence.review.reviewHash
    };
    if (hashCanonicalJson(row) !== hashCanonicalJson(expected)) evidenceFail('source_stale', 'coverage manifest 章节证据不一致。');
  });
  if (!sameOrderedValues(
    input.sourceVersionRefs.chapterContentVersionIds,
    input.chapterEvidence.map((item) => item.content.contentVersionId)
  )) evidenceFail('source_stale', 'provider input 正文版本引用不一致。');
  if (manifest.memory.memoryId !== input.memory.memoryId
    || manifest.memory.memoryRevision !== input.memory.revision
    || manifest.memory.memoryHash !== input.memory.memoryHash) {
    evidenceFail('memory_stale', 'coverage manifest 长期记忆不一致。');
  }
  const { memoryHash, ...memoryCore } = input.memory;
  if (hashCanonicalJson(memoryCore) !== memoryHash) evidenceFail('memory_stale', '长期记忆 hash 不一致。');
  const finalContentVersionId = input.chapterEvidence.at(-1)?.content.contentVersionId;
  if (!finalContentVersionId || input.memory.sourceContentVersionId !== finalContentVersionId
    || input.memory.revision !== finalContentVersionId) {
    evidenceFail('memory_stale', '长期记忆未覆盖最终章节正文。');
  }
  const { evidenceHash, ...inputCore } = input;
  if (hashCanonicalJson(inputCore) !== evidenceHash) evidenceFail('source_stale', '全书审稿 provider input hash 不一致。');
  return structuredClone(input);
}

function validateFullReviewContinuityEvidence(
  chapterEvidence: FullReviewChapterEvidenceProviderInputV1[],
  index: number
): void {
  const item = chapterEvidence[index]!;
  const continuity = item.continuity!;
  const previous = chapterEvidence[index - 1] ?? null;
  const next = chapterEvidence[index + 1] ?? null;
  if ((continuity.stage.stageIndex !== null && !Number.isInteger(continuity.stage.stageIndex))
    || typeof continuity.stage.isStageOpening !== 'boolean'
    || typeof continuity.stage.isStageEnding !== 'boolean'
    || (continuity.stage.previousChapterId !== null && typeof continuity.stage.previousChapterId !== 'string')
      || (continuity.stage.nextChapterId !== null && typeof continuity.stage.nextChapterId !== 'string')) {
    evidenceFail('evidence_incomplete', `第 ${index + 1} 章阶段证据无效。`);
  }
  if (continuity.stage.previousChapterId !== (previous?.chapter.id ?? null)
    || continuity.stage.nextChapterId !== (next?.chapter.id ?? null)
    || continuity.stage.isStageOpening !== (previous === null || previous.continuity?.stage.stageIndex !== continuity.stage.stageIndex)
    || continuity.stage.isStageEnding !== (next === null || next.continuity?.stage.stageIndex !== continuity.stage.stageIndex)) {
    evidenceFail('source_stale', `第 ${index + 1} 章阶段边界与相邻章节不一致。`);
  }
  if (continuity.timeline.chapterNo !== item.chapter.chapterNo) {
    evidenceFail('source_stale', `第 ${index + 1} 章时间线证据与章节号不一致。`);
  }
  const expectedKinds = ['opening', 'middle', 'ending'] as const;
  if (continuity.excerptLocations.length !== expectedKinds.length) {
    evidenceFail('evidence_incomplete', `第 ${index + 1} 章摘录位置证据不完整。`);
  }
  continuity.excerptLocations.forEach((location, locationIndex) => {
    const kind = expectedKinds[locationIndex]!;
    const excerpt = item.content.excerpts[kind];
    if (location.kind !== kind
      || !Number.isInteger(location.startChar)
      || !Number.isInteger(location.endChar)
      || location.startChar < 0
      || location.endChar !== location.startChar + excerpt.length
      || location.excerptHash !== hashCanonicalJson({ kind, startChar: location.startChar, excerpt })) {
      evidenceFail('source_stale', `第 ${index + 1} 章摘录位置证据无效。`);
    }
  });
}

export function validateFullReviewDraftForPersistence(
  draft: FullReviewDraft,
  authority: FullReviewDraftPersistenceAuthority
): FullReviewDraft {
  exactRecord(draft, 'full review draft', FULL_REVIEW_DRAFT_KEYS);
  const expectedReviewPolicyVersionId = authority?.expectedReviewPolicyVersionId?.trim();
  if (!expectedReviewPolicyVersionId) throw new Error('full review expected policy is required');
  if (!Array.isArray(authority.chapterManifest) || authority.chapterManifest.length === 0) {
    throw new Error('full review authoritative chapter manifest is required');
  }
  const allowedChapterIds = new Set<string>();
  authority.chapterManifest.forEach((chapter, index) => {
    if (!chapter || typeof chapter !== 'object'
      || typeof chapter.chapterId !== 'string' || !chapter.chapterId.trim()
      || !Number.isInteger(chapter.chapterNo) || chapter.chapterNo !== index + 1
      || allowedChapterIds.has(chapter.chapterId)) {
      throw new Error('full review authoritative chapter manifest is invalid');
    }
    allowedChapterIds.add(chapter.chapterId);
  });
  if (!Number.isFinite(draft.totalScore) || draft.totalScore < 0 || draft.totalScore > 100) {
    throw new Error('full review totalScore is invalid');
  }
  const expectedRating = draft.totalScore >= 80 ? 'A' : draft.totalScore >= 70 ? 'B' : 'C';
  if (draft.rating !== expectedRating) throw new Error('full review rating is inconsistent with totalScore');
  if (!['pass', 'warning', 'blocked'].includes(draft.gateResult)) {
    throw new Error('full review provider gateResult is invalid');
  }
  for (const [label, value] of [
    ['summary', draft.summary],
    ['videoSuggestion', draft.videoSuggestion],
    ['reviewPolicyVersionId', draft.reviewPolicyVersionId]
  ] as const) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`full review ${label} is invalid`);
  }
  if (draft.reviewPolicyVersionId !== expectedReviewPolicyVersionId) {
    throw new Error('full review reviewPolicyVersionId does not match authority');
  }
  for (const [label, values] of [
    ['strengths', draft.strengths],
    ['problems', draft.problems],
    ['suggestions', draft.suggestions],
    ['platformRisks', draft.platformRisks],
    ['originalityRisks', draft.originalityRisks],
    ['aiFlavorRisks', draft.aiFlavorRisks],
    ['lowScoreContinueRisks', draft.lowScoreContinueRisks]
  ] as const) validateDraftStringList(values, label);

  if (!Array.isArray(draft.dimensionScores) || draft.dimensionScores.length === 0) {
    throw new Error('full review dimensionScores must not be empty');
  }
  const dimensionKeys = new Set<string>();
  let weightedScore = 0;
  let totalWeight = 0;
  for (const [index, dimension] of draft.dimensionScores.entries()) {
    exactRecord(dimension, `full review dimensionScores[${index}]`, FULL_REVIEW_DIMENSION_KEYS);
    if (!dimension || typeof dimension !== 'object'
      || typeof dimension.key !== 'string' || !dimension.key.trim()
      || typeof dimension.label !== 'string' || !dimension.label.trim()
      || typeof dimension.evidence !== 'string' || !dimension.evidence.trim()
      || !Number.isFinite(dimension.score) || dimension.score < 0 || dimension.score > 100
      || !Number.isFinite(dimension.weight) || dimension.weight <= 0 || dimension.weight > 1
      || !Number.isFinite(dimension.penaltyPoints) || dimension.penaltyPoints < 0 || dimension.penaltyPoints > 100) {
      throw new Error('full review dimension is invalid');
    }
    if (dimensionKeys.has(dimension.key)) throw new Error('full review dimension key must be unique');
    dimensionKeys.add(dimension.key);
    weightedScore += dimension.score * dimension.weight;
    totalWeight += dimension.weight;
  }
  if (dimensionKeys.size !== FULL_REVIEW_CANONICAL_DIMENSION_KEYS.length
    || FULL_REVIEW_CANONICAL_DIMENSION_KEYS.some((key) => !dimensionKeys.has(key))) {
    throw new Error('full review canonical dimension set is incomplete');
  }
  if (totalWeight < 0.95 || totalWeight > 1.05) throw new Error('full review dimension weights are invalid');
  if (Math.abs(weightedScore / totalWeight - draft.totalScore) > 5) {
    throw new Error('full review totalScore is inconsistent with dimensions');
  }

  if (!Array.isArray(draft.issues)) throw new Error('full review issues must be an array');
  const issueIds = new Set<string>();
  let hasBlockingIssue = false;
  for (const [index, issue] of draft.issues.entries()) {
    exactRecord(issue, `full review issues[${index}]`, FULL_REVIEW_ISSUE_KEYS);
    if (!issue || typeof issue !== 'object'
      || typeof issue.issueId !== 'string' || !issue.issueId.trim()
      || typeof issue.title !== 'string' || !issue.title.trim()
      || typeof issue.plainDescription !== 'string' || !issue.plainDescription.trim()
      || !['info', 'warning', 'blocking'].includes(issue.severity)
      || issue.scopeType !== 'chapter'
      || !Array.isArray(issue.scopeRefs) || issue.scopeRefs.length === 0
      || issue.scopeRefs.some((ref) => typeof ref !== 'string' || !ref.trim())
      || new Set(issue.scopeRefs).size !== issue.scopeRefs.length
      || issue.scopeRefs.some((ref) => !allowedChapterIds.has(ref))
      || typeof issue.dimension !== 'string' || !issue.dimension.trim()
      || typeof issue.recommendedTarget !== 'string' || !issue.recommendedTarget.trim()
      || typeof issue.recommendedAction !== 'string' || !issue.recommendedAction.trim()
      || issue.status !== 'open'
      || issue.acceptedReason !== null
      || issue.blocking !== (issue.severity === 'blocking')) {
      throw new Error('full review issue is invalid');
    }
    if (issueIds.has(issue.issueId)) throw new Error('full review issueId must be unique');
    if (!dimensionKeys.has(issue.dimension)) throw new Error('full review issue dimension is not declared');
    issueIds.add(issue.issueId);
    hasBlockingIssue ||= issue.blocking;
  }

  const expectedGate = hasBlockingIssue || draft.totalScore < 70
    ? 'blocked'
    : draft.totalScore < 80
      ? 'warning'
      : 'pass';
  if (draft.gateResult !== expectedGate) throw new Error('full review gate is inconsistent with score or issues');
  validateFirstVideoSuggestion(draft.firstVideoSuggestion);
  return structuredClone(draft);
}

export const FULL_REVIEW_CANONICAL_DIMENSION_KEYS = [
  'stage_continuity',
  'character_continuity',
  'timeline_continuity',
  'fact_consistency',
  'foreshadowing',
  'evidence_grounding'
] as const;

export interface FullReviewDraftPersistenceAuthority {
  expectedReviewPolicyVersionId: string;
  chapterManifest: readonly {
    chapterId: string;
    chapterNo: number;
  }[];
}

const FULL_REVIEW_DRAFT_KEYS = [
  'totalScore', 'rating', 'gateResult', 'summary', 'strengths', 'problems', 'suggestions',
  'dimensionScores', 'issues', 'videoSuggestion', 'firstVideoSuggestion', 'platformRisks',
  'originalityRisks', 'aiFlavorRisks', 'lowScoreContinueRisks', 'reviewPolicyVersionId'
] as const;
const FULL_REVIEW_DIMENSION_KEYS = ['key', 'label', 'score', 'weight', 'evidence', 'penaltyPoints'] as const;
const FULL_REVIEW_ISSUE_KEYS = [
  'issueId', 'title', 'plainDescription', 'severity', 'scopeType', 'scopeRefs', 'dimension',
  'blocking', 'recommendedTarget', 'recommendedAction', 'status', 'acceptedReason'
] as const;
const FULL_REVIEW_FIRST_VIDEO_KEYS = [
  'chapterRange', 'openingSlice', 'narrationHook', 'firstScreenSubtitle', 'titleHook',
  'endingSuspense', 'suggestedFormat', 'riskTips'
] as const;

function validateDraftStringList(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`full review ${label} is invalid`);
  }
}

function validateFirstVideoSuggestion(value: FullReviewDraft['firstVideoSuggestion']): void {
  exactRecord(value, 'full review firstVideoSuggestion', FULL_REVIEW_FIRST_VIDEO_KEYS);
  for (const field of ['chapterRange', 'openingSlice', 'narrationHook', 'firstScreenSubtitle', 'titleHook', 'endingSuspense', 'suggestedFormat'] as const) {
    if (typeof value[field] !== 'string' || !value[field].trim()) {
      throw new Error(`full review firstVideoSuggestion.${field} is invalid`);
    }
  }
  validateDraftStringList(value.riskTips, 'firstVideoSuggestion.riskTips');
}

const FULL_REVIEW_MANIFEST_KEYS = ['manifestVersion', 'tenantId', 'novelId', 'chapterPlanVersionId', 'policyProfileVersionId', 'chapterCount', 'coveredChapterNos', 'chapters', 'memory', 'manifestHash'] as const;
const FULL_REVIEW_MANIFEST_CHAPTER_KEYS = ['chapterId', 'chapterNo', 'contentVersionId', 'contentRevision', 'contentHash', 'featureCardVersionId', 'featureCardRevision', 'featureCardHash', 'reviewReportId', 'reviewRevision', 'reviewHash'] as const;
const FULL_REVIEW_CHAPTER_EVIDENCE_KEYS = ['chapter', 'content', 'featureCard', 'review', 'continuity', 'evidenceHash'] as const;
const FULL_REVIEW_CONTENT_KEYS = ['contentVersionId', 'revision', 'wordCount', 'summary', 'excerpts', 'contentHash'] as const;
const FULL_REVIEW_FEATURE_KEYS = ['featureCardVersionId', 'revision', 'oneLineSummary', 'coreTask', 'mainConflict', 'appealPoint', 'emotionKeywords', 'characterChanges', 'relationshipChanges', 'keyInformation', 'foreshadowingOperation', 'endingHook', 'factsCannotChange', 'featuresToStrengthen', 'featureCardHash'] as const;
const FULL_REVIEW_REVIEW_KEYS = ['reviewReportId', 'revision', 'totalScore', 'rating', 'summary', 'problems', 'suggestions', 'issues', 'recommendedAction', 'allowNextStep', 'blockingIssueCount', 'resolvedStatus', 'policyProfileVersionId', 'reviewHash'] as const;
const FULL_REVIEW_MEMORY_KEYS = ['memoryId', 'revision', 'sourceContentVersionId', 'previousSummary', 'characterStates', 'relationshipStates', 'locations', 'organizations', 'items', 'plantedForeshadowing', 'resolvedForeshadowing', 'unresolvedConflicts', 'newSettings', 'factsCannotContradict', 'memoryHash'] as const;

function assertFullReviewEvidenceShape(input: FullReviewEvidenceProviderInputV1): void {
  exactEvidenceRecord(input.novel, 'novel', ['id', 'title', 'genres', 'chapterLimit', 'chapterWordMin', 'chapterWordMax', 'policyProfileVersionId'] as const);
  const manifest = exactEvidenceRecord(input.coverageManifest, 'coverageManifest', FULL_REVIEW_MANIFEST_KEYS);
  exactEvidenceRecord(manifest.memory, 'coverageManifest.memory', ['memoryId', 'memoryRevision', 'memoryHash'] as const);
  strictEvidenceList(manifest.coveredChapterNos, 'coverageManifest.coveredChapterNos');
  for (const [index, row] of strictEvidenceList(manifest.chapters, 'coverageManifest.chapters').entries()) {
    exactEvidenceRecord(row, `coverageManifest.chapters[${index}]`, FULL_REVIEW_MANIFEST_CHAPTER_KEYS);
  }
  for (const [index, item] of strictEvidenceList(input.chapterEvidence, 'chapterEvidence').entries()) {
    const evidence = exactEvidenceRecord(item, `chapterEvidence[${index}]`, FULL_REVIEW_CHAPTER_EVIDENCE_KEYS, ['continuity']);
    exactEvidenceRecord(evidence.chapter, `chapterEvidence[${index}].chapter`, ['id', 'chapterNo', 'title', 'wordTarget', 'statusNote'] as const);
    const content = exactEvidenceRecord(evidence.content, `chapterEvidence[${index}].content`, FULL_REVIEW_CONTENT_KEYS);
    exactEvidenceRecord(content.excerpts, `chapterEvidence[${index}].content.excerpts`, ['opening', 'middle', 'ending'] as const);
    const feature = exactEvidenceRecord(evidence.featureCard, `chapterEvidence[${index}].featureCard`, FULL_REVIEW_FEATURE_KEYS);
    for (const key of ['emotionKeywords', 'characterChanges', 'relationshipChanges', 'keyInformation', 'factsCannotChange', 'featuresToStrengthen'] as const) {
      assertBoundedEvidenceList(feature[key], `chapterEvidence[${index}].featureCard.${key}`);
    }
    const review = exactEvidenceRecord(evidence.review, `chapterEvidence[${index}].review`, FULL_REVIEW_REVIEW_KEYS);
    assertBoundedEvidenceList(review.problems, `chapterEvidence[${index}].review.problems`);
    assertBoundedEvidenceList(review.suggestions, `chapterEvidence[${index}].review.suggestions`);
    for (const [issueIndex, issue] of strictEvidenceList(review.issues, `chapterEvidence[${index}].review.issues`).entries()) {
      exactEvidenceRecord(issue, `chapterEvidence[${index}].review.issues[${issueIndex}]`, ['severity', 'dimension', 'message', 'suggestion'] as const);
    }
    if (evidence.continuity !== undefined) {
      const continuity = exactEvidenceRecord(evidence.continuity, `chapterEvidence[${index}].continuity`, ['stage', 'characterArc', 'timeline', 'foreshadowing', 'excerptLocations'] as const);
      exactEvidenceRecord(continuity.stage, `chapterEvidence[${index}].continuity.stage`, ['stageIndex', 'isStageOpening', 'isStageEnding', 'previousChapterId', 'nextChapterId'] as const);
      const characterArc = exactEvidenceRecord(continuity.characterArc, `chapterEvidence[${index}].continuity.characterArc`, ['characterChanges', 'relationshipChanges'] as const);
      assertBoundedEvidenceList(characterArc.characterChanges, `chapterEvidence[${index}].continuity.characterArc.characterChanges`);
      assertBoundedEvidenceList(characterArc.relationshipChanges, `chapterEvidence[${index}].continuity.characterArc.relationshipChanges`);
      const timeline = exactEvidenceRecord(continuity.timeline, `chapterEvidence[${index}].continuity.timeline`, ['chapterNo', 'factAnchors'] as const);
      assertBoundedEvidenceList(timeline.factAnchors, `chapterEvidence[${index}].continuity.timeline.factAnchors`);
      exactEvidenceRecord(continuity.foreshadowing, `chapterEvidence[${index}].continuity.foreshadowing`, ['operation', 'endingHook'] as const);
      for (const [locationIndex, location] of strictEvidenceList(continuity.excerptLocations, `chapterEvidence[${index}].continuity.excerptLocations`).entries()) {
        exactEvidenceRecord(location, `chapterEvidence[${index}].continuity.excerptLocations[${locationIndex}]`, ['kind', 'startChar', 'endChar', 'excerptHash'] as const);
      }
    }
  }
  const memory = exactEvidenceRecord(input.memory, 'memory', FULL_REVIEW_MEMORY_KEYS);
  for (const key of ['characterStates', 'relationshipStates', 'locations', 'organizations', 'items', 'plantedForeshadowing', 'resolvedForeshadowing', 'unresolvedConflicts', 'newSettings', 'factsCannotContradict'] as const) {
    assertBoundedEvidenceList(memory[key], `memory.${key}`);
  }
  exactEvidenceRecord(input.sourceVersionRefs, 'sourceVersionRefs', ['directionVersionId', 'settingVersionId', 'outlineVersionId', 'stageOutlineVersionId', 'chapterPlanVersionId', 'bodyStrategySnapshotId', 'chapterContentVersionIds'] as const);
}

function exactEvidenceRecord<const K extends readonly string[]>(
  value: unknown,
  label: string,
  keys: K,
  optional: readonly string[] = []
): Record<K[number], unknown> {
  try {
    return exactRecord(value, label, keys, optional);
  } catch {
    evidenceFail('evidence_incomplete', `${label} 字段不符合 full-review evidence ABI。`);
  }
}

function strictEvidenceList(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) evidenceFail('evidence_incomplete', `${label} 必须是数组。`);
  return value;
}

function assertBoundedEvidenceList(value: unknown, label: string): void {
  const values = strictEvidenceList(value, label);
  if (values.length > FULL_REVIEW_LIST_ITEMS || values.some((item) => typeof item !== 'string' || !item.trim() || item.length > FULL_REVIEW_LIST_ITEM_CHARS)) {
    evidenceFail('evidence_incomplete', `${label} 超出 full-review evidence 边界。`);
  }
}

function validateBoundedEvidenceText(value: unknown, label: string, maxLength: number): void {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    evidenceFail('evidence_incomplete', `${label} 缺失或超出 evidence 边界。`);
  }
}

function validateEvidenceHash(value: unknown, label: string): void {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    evidenceFail('evidence_incomplete', `${label} hash 无效。`);
  }
}

function projectFullReviewChapterEvidence(
  chapter: NovelChapterRecord,
  content: ChapterContentVersionRecord,
  featureCard: ChapterFeatureCardRecord,
  review: ReviewReportRecord,
  previousChapter: NovelChapterRecord | null,
  nextChapter: NovelChapterRecord | null
): FullReviewChapterEvidenceProviderInputV1 {
  const normalizedContent = normalizeEvidenceText(content.content);
  if (!normalizedContent) evidenceFail('evidence_incomplete', `第 ${chapter.chapterNo} 章正文为空。`);
  if (!Number.isInteger(content.versionNo) || content.versionNo < 1 || !Number.isInteger(content.wordCount) || content.wordCount < 1) {
    evidenceFail('evidence_incomplete', `第 ${chapter.chapterNo} 章正文版本或字数无效。`);
  }
  const featureCore = {
    featureCardVersionId: featureCard.id,
    revision: featureCard.versionNo,
    oneLineSummary: requiredEvidenceText(featureCard.oneLineSummary, 'featureCard.oneLineSummary', FULL_REVIEW_SUMMARY_CHARS),
    coreTask: optionalEvidenceText(featureCard.coreTask, FULL_REVIEW_LIST_ITEM_CHARS),
    mainConflict: requiredEvidenceText(featureCard.mainConflict, 'featureCard.mainConflict', FULL_REVIEW_SUMMARY_CHARS),
    appealPoint: optionalEvidenceText(featureCard.appealPoint, FULL_REVIEW_LIST_ITEM_CHARS),
    emotionKeywords: boundedEvidenceList(featureCard.emotionKeywords),
    characterChanges: boundedEvidenceList(featureCard.characterChanges),
    relationshipChanges: boundedEvidenceList(featureCard.relationshipChanges),
    keyInformation: boundedEvidenceList(featureCard.keyInformation),
    foreshadowingOperation: optionalEvidenceText(featureCard.foreshadowingOperation, FULL_REVIEW_SUMMARY_CHARS),
    endingHook: optionalEvidenceText(featureCard.endingHook, FULL_REVIEW_SUMMARY_CHARS),
    factsCannotChange: boundedEvidenceList(featureCard.factsCannotChange),
    featuresToStrengthen: boundedEvidenceList(featureCard.featuresToStrengthen)
  };
  const reviewCore = {
    reviewReportId: review.id,
    revision: evidenceId(review.objectVersionId, 'review.objectVersionId'),
    totalScore: review.totalScore,
    rating: optionalEvidenceText(review.rating, 40),
    summary: optionalEvidenceText(review.summary, FULL_REVIEW_SUMMARY_CHARS),
    problems: boundedEvidenceList(review.problems),
    suggestions: boundedEvidenceList(review.suggestions),
    issues: projectFullReviewIssues(review.issueCards),
    recommendedAction: optionalEvidenceText(review.recommendedAction, 80),
    allowNextStep: review.allowNextStep,
    blockingIssueCount: review.blockingIssueCount,
    resolvedStatus: optionalEvidenceText(review.resolvedStatus, 40),
    policyProfileVersionId: optionalEvidenceText(review.policyProfileVersionId, 120)
  };
  const contentHash = hashCanonicalJson({
    contentVersionId: content.id,
    chapterId: content.chapterId,
    revision: content.versionNo,
    wordCount: content.wordCount,
    summary: content.summary,
    content: normalizedContent
  });
  const bodyLength = normalizedContent.length;
  const middleStart = Math.max(0, Math.floor((bodyLength - FULL_REVIEW_EXCERPT_CHARS) / 2));
  const endingStart = Math.max(0, bodyLength - FULL_REVIEW_EXCERPT_CHARS);
  const contentEvidence = {
    contentVersionId: content.id,
    revision: content.versionNo,
    wordCount: content.wordCount,
    summary: requiredEvidenceText(content.summary ?? featureCard.oneLineSummary, 'content.summary', FULL_REVIEW_SUMMARY_CHARS),
    excerpts: {
      opening: normalizedContent.slice(0, FULL_REVIEW_EXCERPT_CHARS),
      middle: normalizedContent.slice(middleStart, middleStart + FULL_REVIEW_EXCERPT_CHARS),
      ending: normalizedContent.slice(endingStart)
    },
    contentHash
  };
  const excerptLocations: NonNullable<FullReviewChapterEvidenceProviderInputV1['continuity']>['excerptLocations'] = [
    createExcerptLocation('opening', 0, contentEvidence.excerpts.opening),
    createExcerptLocation('middle', middleStart, contentEvidence.excerpts.middle),
    createExcerptLocation('ending', endingStart, contentEvidence.excerpts.ending)
  ];
  const continuity = {
    stage: {
      stageIndex: chapter.stageIndex,
      isStageOpening: previousChapter === null || previousChapter.stageIndex !== chapter.stageIndex,
      isStageEnding: nextChapter === null || nextChapter.stageIndex !== chapter.stageIndex,
      previousChapterId: previousChapter?.id ?? null,
      nextChapterId: nextChapter?.id ?? null
    },
    characterArc: {
      characterChanges: boundedEvidenceList(featureCard.characterChanges),
      relationshipChanges: boundedEvidenceList(featureCard.relationshipChanges)
    },
    timeline: {
      chapterNo: chapter.chapterNo,
      factAnchors: boundedEvidenceList([...featureCard.keyInformation, ...featureCard.factsCannotChange])
    },
    foreshadowing: {
      operation: optionalEvidenceText(featureCard.foreshadowingOperation, FULL_REVIEW_SUMMARY_CHARS),
      endingHook: optionalEvidenceText(featureCard.endingHook, FULL_REVIEW_SUMMARY_CHARS)
    },
    excerptLocations
  };
  const chapterCore = {
    chapter: projectChapterProviderInput(chapter),
    content: contentEvidence,
    featureCard: { ...featureCore, featureCardHash: hashCanonicalJson(featureCore) },
    review: { ...reviewCore, reviewHash: hashCanonicalJson(reviewCore) },
    continuity
  };
  return { ...chapterCore, evidenceHash: hashCanonicalJson(chapterCore) };
}

function createExcerptLocation(
  kind: 'opening' | 'middle' | 'ending',
  startChar: number,
  excerpt: string
): NonNullable<FullReviewChapterEvidenceProviderInputV1['continuity']>['excerptLocations'][number] {
  return {
    kind,
    startChar,
    endChar: startChar + excerpt.length,
    excerptHash: hashCanonicalJson({ kind, startChar, excerpt })
  };
}

function projectFullReviewMemoryEvidence(
  memory: LongTermMemoryRecord | null,
  tenantId: string,
  novelId: string,
  finalChapter: NovelChapterRecord,
  finalContentVersionId: string
): FullReviewMemoryEvidenceProviderInputV1 {
  if (!memory) evidenceFail('memory_stale', '全书审稿缺少长期记忆。');
  if (memory.tenantId !== tenantId || memory.novelId !== novelId
    || memory.chapterId !== finalChapter.id
    || memory.sourceContentVersionId !== finalContentVersionId
    || memory.status === 'discarded'
    || memory.staleLevel !== 'none') {
    evidenceFail('memory_stale', '长期记忆未覆盖当前最终章节正文。');
  }
  const memoryCore = {
    memoryId: evidenceId(memory.id, 'memory.id'),
    revision: evidenceId(memory.sourceContentVersionId, 'memory.sourceContentVersionId'),
    sourceContentVersionId: memory.sourceContentVersionId,
    previousSummary: requiredEvidenceText(memory.previousSummary, 'memory.previousSummary', 600),
    characterStates: boundedEvidenceList(memory.characterStates),
    relationshipStates: boundedEvidenceList(memory.relationshipStates),
    locations: boundedEvidenceList(memory.locations),
    organizations: boundedEvidenceList(memory.organizations),
    items: boundedEvidenceList(memory.items),
    plantedForeshadowing: boundedEvidenceList(memory.plantedForeshadowing),
    resolvedForeshadowing: boundedEvidenceList(memory.resolvedForeshadowing),
    unresolvedConflicts: boundedEvidenceList(memory.unresolvedConflicts),
    newSettings: boundedEvidenceList(memory.newSettings),
    factsCannotContradict: boundedEvidenceList(memory.factsCannotContradict)
  };
  return { ...memoryCore, memoryHash: hashCanonicalJson(memoryCore) };
}

function assertChapterEvidenceAuthority(
  tenantId: string,
  novelId: string,
  chapter: NovelChapterRecord,
  content: ChapterContentVersionRecord,
  featureCard: ChapterFeatureCardRecord,
  review: ReviewReportRecord
): void {
  if (content.tenantId !== tenantId || content.novelId !== novelId || content.chapterId !== chapter.id
    || content.id !== chapter.currentContentVersionId || content.status === 'discarded' || content.staleLevel !== 'none') {
    evidenceFail('source_stale', `第 ${chapter.chapterNo} 章正文不是当前权威版本。`);
  }
  if (featureCard.tenantId !== tenantId || featureCard.novelId !== novelId || featureCard.chapterId !== chapter.id
    || featureCard.id !== chapter.currentFeatureCardVersionId || featureCard.status === 'discarded' || featureCard.staleLevel !== 'none') {
    evidenceFail('source_stale', `第 ${chapter.chapterNo} 章特征卡不是当前权威版本。`);
  }
  if (review.tenantId !== tenantId || review.novelId !== novelId || review.objectType !== 'chapter'
    || review.objectId !== chapter.id || review.id !== chapter.currentReviewReportId
    || review.objectVersionId !== content.id) {
    evidenceFail('source_stale', `第 ${chapter.chapterNo} 章审稿不是当前正文的权威结果。`);
  }
}

function evidenceByChapter<T extends { id: string }>(
  rows: T[],
  expectedCount: number,
  label: string,
  chapterId: (item: T) => string = (item) => (item as T & { chapterId: string }).chapterId
): Map<string, T> {
  if (rows.length !== expectedCount) evidenceFail('evidence_incomplete', `${label}数量与章节数不一致。`);
  assertUniqueEvidence(rows, (item) => item.id, `${label} ID`);
  assertUniqueEvidence(rows, chapterId, `${label}章节映射`);
  return new Map(rows.map((item) => [chapterId(item), item]));
}

function assertUniqueEvidence<T>(rows: T[], key: (item: T) => string, label: string): void {
  const values = rows.map(key);
  if (values.some((value) => !value) || new Set(values).size !== values.length) {
    evidenceFail('coverage_duplicate', `${label}缺失或重复。`);
  }
}

function projectFullReviewIssues(value: unknown): ChapterReviewIssueDTO[] {
  if (!Array.isArray(value)) evidenceFail('evidence_incomplete', '章节审稿问题列表格式无效。');
  return value.slice(0, FULL_REVIEW_LIST_ITEMS).map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) evidenceFail('evidence_incomplete', `章节审稿问题 ${index + 1} 格式无效。`);
    const issue = item as Record<string, unknown>;
    if (issue.severity !== 'info' && issue.severity !== 'warning' && issue.severity !== 'blocking') {
      evidenceFail('evidence_incomplete', `章节审稿问题 ${index + 1} 严重级别无效。`);
    }
    return {
      severity: issue.severity,
      dimension: requiredEvidenceText(issue.dimension, 'review.issue.dimension', 80),
      message: requiredEvidenceText(issue.message, 'review.issue.message', FULL_REVIEW_LIST_ITEM_CHARS),
      suggestion: requiredEvidenceText(issue.suggestion, 'review.issue.suggestion', FULL_REVIEW_LIST_ITEM_CHARS)
    };
  });
}

function boundedEvidenceList(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    evidenceFail('evidence_incomplete', '结构化证据列表格式无效。');
  }
  return value.map((item) => item.trim()).filter(Boolean).slice(0, FULL_REVIEW_LIST_ITEMS)
    .map((item) => item.slice(0, FULL_REVIEW_LIST_ITEM_CHARS));
}

function requiredEvidenceText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) evidenceFail('evidence_incomplete', `${label} 缺失。`);
  return value.trim().slice(0, maxLength);
}

function optionalEvidenceText(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function normalizeEvidenceText(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

function evidenceId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) evidenceFail('evidence_incomplete', `${label} 缺失。`);
  return value.trim();
}

function sameOrderedValues<T>(left: T[], right: T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function evidenceFail(code: FullReviewEvidenceFailureCode, message: string): never {
  throw new FullReviewEvidenceValidationError(code, message);
}

function readCreativeAssetTitle(content: unknown): string | null {
  if (!content || typeof content !== 'object') return null;
  const value = (content as { title?: unknown }).title;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readCreativeAssetRiskTags(content: unknown): string[] {
  if (!content || typeof content !== 'object') return [];
  const value = (content as { riskTags?: unknown }).riskTags;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function readProviderSafeMetadata(metadata: unknown): ProviderSafeMetadataV1 {
  if (!metadata || typeof metadata !== 'object') {
    return { scoringStrategyVersion: null, hardFailed: null, candidateRank: null, isMockOutput: null };
  }
  const record = metadata as {
    scoringStrategyVersion?: unknown;
    hardFailed?: unknown;
    candidateRank?: unknown;
    isMockOutput?: unknown;
  };
  return {
    scoringStrategyVersion: typeof record.scoringStrategyVersion === 'string' ? record.scoringStrategyVersion : null,
    hardFailed: typeof record.hardFailed === 'boolean' ? record.hardFailed : null,
    candidateRank: typeof record.candidateRank === 'number' ? record.candidateRank : null,
    isMockOutput: typeof record.isMockOutput === 'boolean' ? record.isMockOutput : null
  };
}

function plan<A extends NovelProviderAction>(
  action: A,
  taskType: string,
  objectType: NovelProviderObjectTypeByAction[A],
  conflictScope: string,
  inputSummary: string,
  providerKind: ActionExecutionPlan['providerKind'],
  invokeProvider: (providers: NovelProviderSet, input: NovelProviderActionInputFor<A>) => Promise<NovelProviderActionResult<A>>
): ActionExecutionPlan<A> {
  return {
    action,
    taskType,
    objectType,
    conflictScope,
    inputSummary,
    providerKind,
    async executeProvider(providers, input) {
      return invokeProvider(providers, input);
    }
  };
}

function assertProviderAction(input: { action: NovelProviderAction; objectType?: StructureAssetType; currentAssets?: unknown; optimization?: unknown }, action: NovelProviderAction): asserts input is typeof input & NovelProviderActionInput {
  if (input.action !== action) {
    throw new BusinessError(ErrorCode.ConfigMissing, '生成动作与执行计划不匹配。', { action: input.action, expectedAction: action });
  }
  assertStructureActionObjectType(input);
  if (isStructureProviderAction(input.action)) {
    projectStructureCurrentAssetsPrompt(input.action, 'currentAssets' in input ? input.currentAssets : undefined);
    strictStructureOptimization(input.optimization, input.objectType!);
  }
}

function assertStructureActionObjectType(input: {
  action: NovelProviderAction;
  objectType?: StructureAssetType;
}): void {
  if (!isStructureProviderAction(input.action)) return;
  const expectedObjectType = STRUCTURE_PROVIDER_OBJECT_TYPES[input.action];
  if (input.objectType !== expectedObjectType) {
    throw new BusinessError(ErrorCode.ConfigMissing, '生成动作与结构资产类型不匹配。', {
      action: input.action,
      objectType: input.objectType ?? null,
      expectedObjectType
    });
  }
}

function isStructureProviderAction(action: NovelProviderAction): action is StructureProviderAction {
  return Object.prototype.hasOwnProperty.call(STRUCTURE_PROVIDER_OBJECT_TYPES, action);
}

const STRUCTURE_ASSET_OBJECT_TYPES: Record<StructureAssetSlot, string> = { direction: 'direction', setting: 'setting', outline: 'outline', stageOutline: 'stage_outline' };
const STRUCTURE_ASSET_KEYS = ['id', 'objectType', 'versionNo', 'title', 'summary', 'score', 'riskLevel', 'riskTags', 'content'] as const;
function summarizeAssetValue(value: unknown, slot: StructureAssetSlot): Record<string, unknown> {
  const asset = exactRecord(value, `currentAssets.${slot}`, STRUCTURE_ASSET_KEYS);
  if (asset.objectType !== STRUCTURE_ASSET_OBJECT_TYPES[slot]) throw new Error(`currentAssets.${slot}.objectType is invalid`);
  const base = { id: requiredText(asset.id, `${slot}.id`, 120), versionNo: requiredNumber(asset.versionNo, `${slot}.versionNo`), title: nullableText(asset.title, `${slot}.title`, 120), summary: nullableText(asset.summary, `${slot}.summary`, 500), score: nullableNumber(asset.score, `${slot}.score`), riskLevel: requiredText(asset.riskLevel, `${slot}.riskLevel`, 20), riskTags: stringList(asset.riskTags, `${slot}.riskTags`, 20, 80) };
  if (slot === 'direction') { const content = exactRecord(asset.content, `${slot}.content`, ['kind', 'logline', 'coreHook'] as const); if (content.kind !== 'direction') throw new Error(`currentAssets.${slot}.content.kind is invalid`); return { ...base, logline: requiredText(content.logline, `${slot}.logline`, 240), coreHook: requiredText(content.coreHook, `${slot}.coreHook`, 240) }; }
  const content = exactRecord(asset.content, `${slot}.content`, ['kind', 'sections', 'stages', 'chapters'] as const); if (content.kind !== 'structure') throw new Error(`currentAssets.${slot}.content.kind is invalid`);
  const sections = strictList(content.sections, `${slot}.sections`).slice(0, 4).map((value, index) => { const item = exactRecord(value, `${slot}.sections[${index}]`, ['title', 'body', 'items'] as const); return { title: requiredText(item.title, 'section.title', 120), body: requiredText(item.body, 'section.body', 600), items: stringList(item.items, 'section.items', 12, 160) }; });
  const stages = strictList(content.stages, `${slot}.stages`).slice(0, 5).map((value, index) => { const item = exactRecord(value, `${slot}.stages[${index}]`, ['stageIndex', 'title', 'chapterRange', 'goal', 'conflict', 'payoff'] as const); return { stageIndex: requiredNumber(item.stageIndex, 'stage.stageIndex'), title: requiredText(item.title, 'stage.title', 120), chapterRange: requiredText(item.chapterRange, 'stage.chapterRange', 80), goal: requiredText(item.goal, 'stage.goal', 300), conflict: requiredText(item.conflict, 'stage.conflict', 300), payoff: requiredText(item.payoff, 'stage.payoff', 300) }; });
  const chapters = strictList(content.chapters, `${slot}.chapters`).slice(0, 8).map((value, index) => { const item = exactRecord(value, `${slot}.chapters[${index}]`, ['chapterNo', 'stageIndex', 'title', 'wordTarget', 'goal', 'conflict', 'hook'] as const); return { chapterNo: requiredNumber(item.chapterNo, 'chapter.chapterNo'), stageIndex: requiredNumber(item.stageIndex, 'chapter.stageIndex'), title: requiredText(item.title, 'chapter.title', 120), wordTarget: requiredNumber(item.wordTarget, 'chapter.wordTarget'), goal: requiredText(item.goal, 'chapter.goal', 300), conflict: requiredText(item.conflict, 'chapter.conflict', 300), hook: requiredText(item.hook, 'chapter.hook', 300) }; });
  if ((slot === 'setting' || slot === 'outline') && !sections.length) throw new Error(`currentAssets.${slot}.sections must not be empty`); if (slot === 'stageOutline' && !stages.length) throw new Error('currentAssets.stageOutline.stages must not be empty');
  return { ...base, sections, stages, chapters };
}
function exactRecord<const K extends readonly string[]>(value: unknown, label: string, keys: K, optional: readonly string[] = []): Record<K[number], unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`); const record = value as Record<string, unknown>, actual = Object.keys(record); if (actual.some((key) => !keys.includes(key)) || keys.some((key) => !optional.includes(key) && !actual.includes(key))) throw new Error(`${label} has invalid keys`); return record as Record<K[number], unknown>; }
function requiredText(value: unknown, label: string, max: number): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`); return value.trim().slice(0, max); }
function nullableText(value: unknown, label: string, max: number): string | null { return value === null ? null : requiredText(value, label, max); }
function requiredNumber(value: unknown, label: string): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a number`); return value; }
function nullableNumber(value: unknown, label: string): number | null { return value === null ? null : requiredNumber(value, label); }
function strictList(value: unknown, label: string): unknown[] { if (!Array.isArray(value)) throw new Error(`${label} must be an array`); return value; }
function stringList(value: unknown, label: string, maxItems: number, maxText: number): string[] { return strictList(value, label).slice(0, maxItems).map((item, index) => requiredText(item, `${label}[${index}]`, maxText)); }
type ProviderInputShape = string | number | boolean | readonly [ProviderInputShape] | readonly [ProviderInputShape, null] | { readonly [key: string]: ProviderInputShape };
const PROVIDER_METADATA_SHAPE = { scoringStrategyVersion: ['', null], hardFailed: [false, null], candidateRank: [0, null], isMockOutput: [false, null] } as const, CHAPTER_SHAPE = { id: '', chapterNo: 0, title: '', wordTarget: [0, null], statusNote: ['', null] } as const;
const CHAPTER_CONTENT_SHAPE = { id: '', content: '', summary: ['', null], reviewScore: [0, null], providerSafeMetadata: PROVIDER_METADATA_SHAPE } as const, DIRECTION_CONTENT_SHAPE = { title: '', logline: '', coreHook: '', audienceAppeal: '', videoPotential: '', sellingPoints: [''], riskTags: [''], recommendation: '' } as const;
const DIRECTION_DRAFT_SHAPE = { title: '', summary: '', content: DIRECTION_CONTENT_SHAPE, score: 0, marketScore: 0, riskLevel: '', riskTags: [''], recommendedReason: '' } as const, OPTIONAL_ACTION_KEYS = { direction_fuse: ['reason'], direction_optimize: [], chapter_impact_assess: ['instruction'], chapter_adopt_impact_assess: ['instruction'] } as const;
const PROVIDER_INPUT_SHAPES = { action: '', objectType: '', reason: ['', null], instruction: ['', null], novel: { id: '', title: '', genres: [''], chapterLimit: 0, chapterWordMin: 0, chapterWordMax: 0, policyProfileVersionId: ['', null] }, preferences: { appealPoints: [''], targetAudience: ['', null], stageCount: [0, null] }, source: DIRECTION_DRAFT_SHAPE, sources: [DIRECTION_DRAFT_SHAPE], chapter: CHAPTER_SHAPE, chapters: [CHAPTER_SHAPE], chapterCount: 0, selectedCandidate: CHAPTER_CONTENT_SHAPE, strategySnapshot: { id: '', versionNo: 0, title: ['', null], summary: ['', null], riskLevel: '', riskTags: [''], providerSafeMetadata: PROVIDER_METADATA_SHAPE }, previousContent: [CHAPTER_CONTENT_SHAPE, null], currentContent: CHAPTER_CONTENT_SHAPE, oldContent: [CHAPTER_CONTENT_SHAPE, null], newContent: CHAPTER_CONTENT_SHAPE, previousMemory: [{ previousSummary: ['', null], characterStates: [''], relationshipStates: [''], unresolvedConflicts: [''], factsCannotContradict: [''] }, null], previousBatchNotes: [''], enhancedReview: false, sourceVersionRefs: { directionVersionId: ['', null], settingVersionId: ['', null], outlineVersionId: ['', null], stageOutlineVersionId: ['', null], chapterPlanVersionId: ['', null], bodyStrategySnapshotId: ['', null], chapterContentVersionIds: [''] }, currentAssets: '', optimization: '', chapterEvidence: '', coverageManifest: '', evidenceHash: '', memory: '' } as const satisfies Record<(typeof ACTION_INPUT_KEYS)[NovelProviderAction][number], ProviderInputShape>;
function strictProviderInput(input: { action: NovelProviderAction; objectType?: StructureAssetType; currentAssets?: unknown; optimization?: unknown }, action: NovelProviderAction): NovelProviderActionInput {
  const optional = (OPTIONAL_ACTION_KEYS as Partial<Record<NovelProviderAction, readonly string[]>>)[action] ?? [];
  const source = exactRecord(input, `${action} input`, ACTION_INPUT_KEYS[action], optional);
  assertProviderAction(source as typeof input, action);
  if (action === 'novel_full_review') {
    return validateFullReviewEvidenceProviderInput({
      action: 'novel_full_review',
      novel: source.novel as NovelProviderInputV1,
      coverageManifest: source.coverageManifest as FullReviewCoverageManifestV1,
      chapterEvidence: source.chapterEvidence as FullReviewChapterEvidenceProviderInputV1[],
      memory: source.memory as FullReviewMemoryEvidenceProviderInputV1,
      sourceVersionRefs: source.sourceVersionRefs as FullReviewSourceVersionRefsProviderInputV1,
      evidenceHash: source.evidenceHash as string
    });
  }
  return Object.fromEntries(Object.entries(source).filter(([key, value]) => !optional.includes(key) || value !== undefined).map(([key, value]) => [key, key === 'currentAssets' ? structuredClone(value) : key === 'optimization' ? strictStructureOptimization(value, source.objectType as StructureAssetType) : strictProviderValue(value, key === 'instruction' && action === 'chapter_rewrite' ? '' : PROVIDER_INPUT_SHAPES[key as keyof typeof PROVIDER_INPUT_SHAPES], `${action}.${key}`)])) as NovelProviderActionInput;
}
function strictStructureOptimization(value: unknown, objectType: StructureAssetType): StructureOptimizationProviderInputV1 | null {
  if (value === null) return null;
  const optimization = exactRecord(value, 'optimization', ['source', 'instruction'] as const);
  const source = exactRecord(optimization.source, 'optimization.source', STRUCTURE_ASSET_KEYS);
  if (source.objectType !== objectType) throw new Error('optimization.source.objectType is invalid');
  const content = exactRecord(source.content, 'optimization.source.content', ['kind', 'sections', 'stages', 'chapters'] as const);
  if (content.kind !== 'structure') throw new Error('optimization.source.content.kind is invalid');
  return {
    instruction: requiredText(optimization.instruction, 'optimization.instruction', 2_000),
    source: {
      id: requiredText(source.id, 'optimization.source.id', 120),
      objectType,
      versionNo: requiredNumber(source.versionNo, 'optimization.source.versionNo'),
      title: nullableText(source.title, 'optimization.source.title', 120),
      summary: nullableText(source.summary, 'optimization.source.summary', 500),
      score: nullableNumber(source.score, 'optimization.source.score'),
      riskLevel: requiredText(source.riskLevel, 'optimization.source.riskLevel', 20) as RiskLevel,
      riskTags: stringList(source.riskTags, 'optimization.source.riskTags', 20, 80),
      content: {
        kind: 'structure',
        sections: structuredClone(content.sections) as StructureAssetContentDTO['sections'],
        stages: structuredClone(content.stages) as StructureAssetContentDTO['stages'],
        chapters: structuredClone(content.chapters) as StructureAssetContentDTO['chapters']
      }
    }
  };
}
function strictProviderValue(value: unknown, shape: ProviderInputShape, label: string): unknown { if (Array.isArray(shape)) { if (shape.length === 2) return value === null ? null : strictProviderValue(value, shape[0], label); return strictList(value, label).map((item, index) => strictProviderValue(item, shape[0], `${label}[${index}]`)); } if (typeof shape === 'object') { const fields = shape as { readonly [key: string]: ProviderInputShape }, source = exactRecord(value, label, Object.keys(fields)); return Object.fromEntries(Object.entries(fields).map(([key, child]) => [key, strictProviderValue(source[key], child, `${label}.${key}`)])); } if (typeof value !== typeof shape) throw new Error(`${label} has invalid type`); return value; }
