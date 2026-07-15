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
type StructureProviderObjectType<A extends StructureProviderAction> = (typeof STRUCTURE_PROVIDER_OBJECT_TYPES)[A];
interface StructureProviderActionInputBase {
  novel: NovelProviderInputV1;
  preferences: NovelPreferencesProviderInputV1;
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
  | { action: 'direction_optimize'; source: DirectionDraftProviderInputV1; instruction?: string | null }
  | StructureProviderActionInput
  | { action: 'trial_chapter_one_generate'; novel: NovelProviderInputV1; preferences: NovelPreferencesProviderInputV1; chapters: ChapterProviderInputV1[]; chapterCount: number }
  | { action: 'trial_followup_generate'; novel: NovelProviderInputV1; selectedCandidate: TrialChapterCandidateDraftLike; chapters: ChapterProviderInputV1[] }
  | { action: 'body_batch_generate'; novel: NovelProviderInputV1; chapter: ChapterProviderInputV1; strategySnapshot: BodyStrategyProviderInputV1; previousContent: ChapterContentProviderInputV1 | null; previousMemory: LongTermMemoryProviderInputV1 | null; previousBatchNotes: string[]; enhancedReview: boolean }
  | { action: 'chapter_body_generate'; novel: NovelProviderInputV1; chapter: ChapterProviderInputV1; strategySnapshot: BodyStrategyProviderInputV1; previousContent: ChapterContentProviderInputV1 | null; previousMemory: LongTermMemoryProviderInputV1 | null; previousBatchNotes: string[]; enhancedReview: boolean }
  | { action: 'chapter_rewrite'; novel: NovelProviderInputV1; chapter: ChapterProviderInputV1; currentContent: ChapterContentProviderInputV1; instruction: string }
  | { action: 'chapter_impact_assess'; novel: NovelProviderInputV1; chapter: ChapterProviderInputV1; oldContent: ChapterContentProviderInputV1 | null; newContent: ChapterContentProviderInputV1; instruction?: string | null }
  | { action: 'chapter_adopt_impact_assess'; novel: NovelProviderInputV1; chapter: ChapterProviderInputV1; oldContent: ChapterContentProviderInputV1 | null; newContent: ChapterContentProviderInputV1; instruction?: string | null }
  | { action: 'novel_full_review'; novel: NovelProviderInputV1; chapters: ChapterProviderInputV1[]; sourceVersionRefs: FullReviewSourceVersionRefsProviderInputV1 };

export type NovelProviderActionInputFor<A extends NovelProviderAction> = Extract<NovelProviderActionInput, { action: A }>;
export const ACTION_INPUT_KEYS = {
  direction_generate: ['action', 'novel', 'preferences'],
  direction_fuse: ['action', 'reason', 'sources'],
  direction_optimize: ['action', 'instruction', 'source'],
  setting_generate: ['action', 'currentAssets', 'novel', 'objectType', 'preferences'],
  outline_generate: ['action', 'currentAssets', 'novel', 'objectType', 'preferences'],
  stage_outline_generate: ['action', 'currentAssets', 'novel', 'objectType', 'preferences'],
  chapter_plan_generate: ['action', 'currentAssets', 'novel', 'objectType', 'preferences'],
  trial_chapter_one_generate: ['action', 'chapterCount', 'chapters', 'novel', 'preferences'],
  trial_followup_generate: ['action', 'chapters', 'novel', 'selectedCandidate'],
  body_batch_generate: ['action', 'chapter', 'enhancedReview', 'novel', 'previousBatchNotes', 'previousContent', 'previousMemory', 'strategySnapshot'],
  chapter_body_generate: ['action', 'chapter', 'enhancedReview', 'novel', 'previousBatchNotes', 'previousContent', 'previousMemory', 'strategySnapshot'],
  chapter_rewrite: ['action', 'chapter', 'currentContent', 'instruction', 'novel'],
  chapter_impact_assess: ['action', 'chapter', 'instruction', 'newContent', 'novel', 'oldContent'],
  chapter_adopt_impact_assess: ['action', 'chapter', 'instruction', 'newContent', 'novel', 'oldContent'],
  novel_full_review: ['action', 'chapters', 'novel', 'sourceVersionRefs']
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

function assertProviderAction(input: { action: NovelProviderAction; objectType?: StructureAssetType; currentAssets?: unknown }, action: NovelProviderAction): asserts input is typeof input & NovelProviderActionInput {
  if (input.action !== action) {
    throw new BusinessError(ErrorCode.ConfigMissing, '生成动作与执行计划不匹配。', { action: input.action, expectedAction: action });
  }
  assertStructureActionObjectType(input);
  if (isStructureProviderAction(input.action)) projectStructureCurrentAssetsPrompt(input.action, 'currentAssets' in input ? input.currentAssets : undefined);
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
const DIRECTION_DRAFT_SHAPE = { title: '', summary: '', content: DIRECTION_CONTENT_SHAPE, score: 0, marketScore: 0, riskLevel: '', riskTags: [''], recommendedReason: '' } as const, OPTIONAL_ACTION_KEYS = { direction_fuse: ['reason'], direction_optimize: ['instruction'], chapter_impact_assess: ['instruction'], chapter_adopt_impact_assess: ['instruction'] } as const;
const PROVIDER_INPUT_SHAPES = { action: '', objectType: '', reason: ['', null], instruction: ['', null], novel: { id: '', title: '', genres: [''], chapterLimit: 0, chapterWordMin: 0, chapterWordMax: 0, policyProfileVersionId: ['', null] }, preferences: { appealPoints: [''], targetAudience: ['', null], stageCount: [0, null] }, source: DIRECTION_DRAFT_SHAPE, sources: [DIRECTION_DRAFT_SHAPE], chapter: CHAPTER_SHAPE, chapters: [CHAPTER_SHAPE], chapterCount: 0, selectedCandidate: CHAPTER_CONTENT_SHAPE, strategySnapshot: { id: '', versionNo: 0, title: ['', null], summary: ['', null], riskLevel: '', riskTags: [''], providerSafeMetadata: PROVIDER_METADATA_SHAPE }, previousContent: [CHAPTER_CONTENT_SHAPE, null], currentContent: CHAPTER_CONTENT_SHAPE, oldContent: [CHAPTER_CONTENT_SHAPE, null], newContent: CHAPTER_CONTENT_SHAPE, previousMemory: [{ previousSummary: ['', null], characterStates: [''], relationshipStates: [''], unresolvedConflicts: [''], factsCannotContradict: [''] }, null], previousBatchNotes: [''], enhancedReview: false, sourceVersionRefs: { directionVersionId: ['', null], settingVersionId: ['', null], outlineVersionId: ['', null], stageOutlineVersionId: ['', null], chapterPlanVersionId: ['', null], bodyStrategySnapshotId: ['', null], chapterContentVersionIds: [''] }, currentAssets: '' } as const satisfies Record<(typeof ACTION_INPUT_KEYS)[NovelProviderAction][number], ProviderInputShape>;
function strictProviderInput(input: { action: NovelProviderAction; objectType?: StructureAssetType; currentAssets?: unknown }, action: NovelProviderAction): NovelProviderActionInput { const optional = (OPTIONAL_ACTION_KEYS as Partial<Record<NovelProviderAction, readonly string[]>>)[action] ?? [], source = exactRecord(input, `${action} input`, ACTION_INPUT_KEYS[action], optional); assertProviderAction(source as typeof input, action); return Object.fromEntries(Object.entries(source).filter(([key, value]) => !optional.includes(key) || value !== undefined).map(([key, value]) => [key, key === 'currentAssets' ? structuredClone(value) : strictProviderValue(value, key === 'instruction' && action === 'chapter_rewrite' ? '' : PROVIDER_INPUT_SHAPES[key as keyof typeof PROVIDER_INPUT_SHAPES], `${action}.${key}`)])) as NovelProviderActionInput; }
function strictProviderValue(value: unknown, shape: ProviderInputShape, label: string): unknown { if (Array.isArray(shape)) { if (shape.length === 2) return value === null ? null : strictProviderValue(value, shape[0], label); return strictList(value, label).map((item, index) => strictProviderValue(item, shape[0], `${label}[${index}]`)); } if (typeof shape === 'object') { const fields = shape as { readonly [key: string]: ProviderInputShape }, source = exactRecord(value, label, Object.keys(fields)); return Object.fromEntries(Object.entries(fields).map(([key, child]) => [key, strictProviderValue(source[key], child, `${label}.${key}`)])); } if (typeof value !== typeof shape) throw new Error(`${label} has invalid type`); return value; }
