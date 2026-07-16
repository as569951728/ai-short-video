import type { PagedResult } from './api.js';
import type { ImpactLevel, NovelCreationStage, NovelLifecycleStatus, RiskLevel, StageStatus, StaleLevel, TaskStatus, VersionStatus } from './enums.js';

export interface RecommendedActionDTO {
  type: string;
  label: string;
  reasonText: string;
  target: 'detail' | 'task' | 'drawer' | 'dialog' | 'disabled';
  disabled: boolean;
  disabledReason: string | null;
  confirmRequired: boolean;
  taskType: string | null;
}

export interface NovelStatusSummaryDTO {
  lifecycleStatus: NovelLifecycleStatus;
  creationStage: NovelCreationStage;
  stageStatus: StageStatus;
  displayStatus: string;
  displayStatusText: string;
  currentStep: string;
  completedSteps: string[];
  blockingReasons: string[];
  recommendedAction: RecommendedActionDTO;
  videoPreparationStatus: string;
  videoReferenceStatus: string;
  calculatedAt: string;
  calculationVersion: string;
}

export interface NovelScoreSummaryDTO {
  qualityScore: number | null;
  marketScore: number | null;
  riskLevel: string;
}

export interface NovelChapterProgressDTO {
  plannedChapterCount: number;
  completedChapterCount: number;
  pendingChapterCount: number;
  text: string;
}

export interface NovelVideoReferenceSummaryDTO {
  status: string;
  statusText: string;
  referencedVideoCount: number;
}

export interface RecentTaskSummaryDTO {
  id: string;
  taskType: string;
  status: TaskStatus | string;
  statusText: string;
  progress: number;
  currentStep: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskTraceDTO {
  taskId: string;
  requestId: string | null;
  retryOfTaskId: string | null;
}

export interface TaskEventDTO {
  id: string;
  taskId: string;
  status: TaskStatus | string;
  statusText: string;
  eventType: string;
  eventTypeText: string;
  message: string;
  progress: number | null;
  requestId: string | null;
  createdAt: string;
}

export interface TaskDetailDTO extends RecentTaskSummaryDTO {
  novelId: string | null;
  objectType: string | null;
  objectId: string | null;
  statusNote: string | null;
  sourceVersionRefs: unknown;
  conflictScope: string | null;
  conflictKey: string | null;
  resultVersionIds: string[];
  retryOfTaskId: string | null;
  failureCategory: string | null;
  failureCategoryText: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  userFailureReason: string | null;
  retryable: boolean;
  cancellable: boolean;
  cancelReason: string | null;
  trace: TaskTraceDTO;
  nextAction: RecommendedActionDTO;
  createdAt: string;
  updatedAt: string;
  events: TaskEventDTO[];
}

export interface TaskEventListDTO {
  items: TaskEventDTO[];
}

export interface RetryTaskRequest {
  reason?: string | null;
}

export interface CancelTaskRequest {
  reason?: string | null;
}

export interface RetryTaskResultDTO {
  originalTask: TaskDetailDTO;
  newTask: TaskDetailDTO;
}

export interface CancelTaskResultDTO {
  task: TaskDetailDTO;
}

export interface DirectionCandidateContentDTO {
  title: string;
  logline: string;
  coreHook: string;
  audienceAppeal: string;
  videoPotential: string;
  sellingPoints: string[];
  riskTags: string[];
  recommendation: string;
}

export interface DirectionCandidateDTO {
  id: string;
  versionNo: number;
  status: VersionStatus;
  staleLevel: StaleLevel;
  title: string;
  summary: string;
  content: DirectionCandidateContentDTO;
  score: number;
  marketScore: number;
  riskLevel: RiskLevel;
  riskTags: string[];
  recommendedReason: string;
  createdAt: string;
}

export interface DirectionTaskDTO extends RecentTaskSummaryDTO {
  resultVersionIds: string[];
  statusNote?: string | null;
  failureCategory?: string | null;
}

export interface DirectionActionResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  task: DirectionTaskDTO;
  candidates: DirectionCandidateDTO[];
  candidate: DirectionCandidateDTO | null;
  currentDirection: DirectionCandidateDTO | null;
  affectedObjects: string[];
  nextAction: RecommendedActionDTO;
}

export type StructureAssetType = 'setting' | 'outline' | 'stage_outline' | 'chapter_plan';

export interface StructureSectionDTO {
  title: string;
  body: string;
  items: string[];
}

export interface StageOutlineItemDTO {
  stageIndex: number;
  title: string;
  chapterRange: string;
  goal: string;
  conflict: string;
  payoff: string;
}

export interface ChapterPlanItemDTO {
  chapterNo: number;
  stageIndex: number;
  title: string;
  wordTarget: number;
  goal: string;
  conflict: string;
  hook: string;
}

export interface StructureAssetContentDTO {
  title: string;
  summary: string;
  sections: StructureSectionDTO[];
  stages: StageOutlineItemDTO[];
  chapters: ChapterPlanItemDTO[];
  riskTags: string[];
  recommendation: string;
}

export interface StructureAssetDTO {
  id: string;
  objectType: StructureAssetType;
  versionNo: number;
  status: VersionStatus;
  staleLevel: StaleLevel;
  title: string;
  summary: string;
  content: StructureAssetContentDTO;
  score: number;
  riskLevel: RiskLevel;
  riskTags: string[];
  recommendedReason: string;
  createdAt: string;
}

export interface StructureTaskDTO extends RecentTaskSummaryDTO {
  resultVersionIds: string[];
}

export interface NovelChapterDTO {
  id: string;
  chapterNo: number;
  stageIndex: number | null;
  title: string;
  wordTarget: number | null;
  wordCount: number;
  mainStatus: string;
  statusNote: string | null;
  impactLevel: string;
  currentContentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StructureActionResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  task: StructureTaskDTO;
  candidates: StructureAssetDTO[];
  candidate: StructureAssetDTO | null;
  currentAssets: {
    direction: DirectionCandidateDTO | null;
    setting: StructureAssetDTO | null;
    outline: StructureAssetDTO | null;
    stageOutline: StructureAssetDTO | null;
    chapterPlan: StructureAssetDTO | null;
  };
  chapters: NovelChapterDTO[];
  affectedObjects: string[];
  nextAction: RecommendedActionDTO;
}

export interface ScoringDimensionDTO {
  key: string;
  label: string;
  score: number;
  weight: number;
  evidence: string;
  penaltyPoints: number;
}

export interface QualityScoringDTO {
  scoringStrategyVersion: string;
  totalScore: number;
  gateResult: 'pass' | 'warning' | 'hard_fail';
  gateResultText: string;
  dimensions: ScoringDimensionDTO[];
  weights: Record<string, number>;
  evidence: string[];
  penalties: string[];
  hardFailure: boolean;
  hardFailureReasons: string[];
}

export interface TrialChapterCandidateDTO {
  id: string;
  chapterId: string;
  chapterNo: number;
  title: string;
  versionNo: number;
  status: VersionStatus | 'selected_for_trial' | 'historical';
  staleLevel: StaleLevel;
  isAiRecommended: boolean;
  isSelected: boolean;
  openingStrategy: string;
  openingHighlight: string;
  firstSentence: string;
  first300Summary: string;
  endingHook: string;
  riskLevel: RiskLevel;
  riskTags: string[];
  aiRecommendedReason: string;
  wordCount: number;
  contentPreview: string;
  content: string;
  scoring: QualityScoringDTO;
  createdAt: string;
}

export interface ChapterFeatureCardDTO {
  id: string;
  chapterId: string;
  versionNo: number;
  status: VersionStatus | string;
  oneLineSummary: string;
  coreTask: string;
  mainConflict: string;
  appealPoint: string;
  emotionKeywords: string[];
  characterChanges: string[];
  relationshipChanges: string[];
  keyInformation: string[];
  foreshadowingOperation: string;
  endingHook: string;
  factsCannotChange: string[];
  featuresToStrengthen: string[];
  createdAt: string;
}

export interface ChapterReviewIssueDTO {
  severity: 'info' | 'warning' | 'blocking';
  dimension: string;
  message: string;
  suggestion: string;
}

export interface ChapterReviewReportDTO {
  id: string;
  objectVersionId: string | null;
  reviewLevel: string;
  scoringStrategyVersion: string;
  totalScore: number;
  rating: string;
  summary: string;
  strengths: string[];
  problems: string[];
  suggestions: string[];
  issues: ChapterReviewIssueDTO[];
  recommendedAction: string;
  allowNextStep: boolean;
  blockingIssueCount: number;
  createdAt: string;
}

export interface LongTermMemoryDTO {
  id: string;
  chapterId: string | null;
  sourceContentVersionId: string | null;
  summary: string;
  factsCannotContradict: string[];
  unresolvedConflicts: string[];
  status: VersionStatus | string;
  staleLevel: StaleLevel;
  createdAt: string;
}

export type ImpactCaseVisibleStatus = 'assessing' | 'waiting_decision' | 'handling' | 'resolved' | 'ignored' | 'cancelled';

export interface ImpactCaseDTO {
  id: string;
  novelId: string;
  sourceChapterId: string | null;
  sourceOldVersionId: string | null;
  sourceNewVersionId: string | null;
  impactLevel: ImpactLevel;
  impactLevelText: string;
  status: ImpactCaseVisibleStatus;
  statusText: string;
  summary: string;
  changedFacts: string[];
  affectedChapterIds: string[];
  affectedVideoReferenceIds: string[];
  recommendedHandling: string;
  suggestedActions: string[];
  blocksFullReview: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ChapterSummaryCompareDTO {
  currentSummary: string;
  candidateSummary: string;
  benefit: string;
  newRisks: string[];
  possibleImpact: string;
  aiSuggestion: string;
}

export interface TrialChapterResultDTO {
  id: string;
  chapterId: string;
  chapterNo: number;
  title: string;
  status: string;
  score: number;
  hardFailed: boolean;
  hardFailureReasons: string[];
  contentVersion: TrialChapterCandidateDTO | null;
  featureCard: ChapterFeatureCardDTO | null;
  reviewReport: ChapterReviewReportDTO | null;
}

export interface TrialReviewDTO {
  id: string;
  scoringStrategyVersion: string;
  totalScore: number;
  trialResult: 'pass' | 'pass_with_suggestions' | 'return_upstream' | 'blocked';
  trialResultText: string;
  allowNextStep: boolean;
  requiresRiskConfirmation: boolean;
  strengths: string[];
  problems: string[];
  suggestions: string[];
  chapterScores: Array<{
    chapterNo: number;
    score: number;
    hardFailed: boolean;
  }>;
  recommendedAction: string;
}

export interface BodyGenerationStrategySnapshotDTO {
  id: string;
  versionNo: number;
  status: VersionStatus | string;
  summary: string;
  sourceTrialRunId: string;
  selectedChapterOneVersionId: string;
  writingStyle: string;
  rhythm: string;
  protagonistGuidance: string;
  conflictGuidance: string;
  endingHookRule: string;
  longMemory: string[];
  acceptedRisks: string[];
  enhancedReviewRules: string[];
  createdAt: string;
}

export type BodyBatchStatus = 'completed' | 'paused' | 'cancelled';

export interface BodyBatchChapterResultDTO {
  chapterId: string;
  chapterNo: number;
  title: string;
  status: 'completed' | 'failed' | 'pending';
  statusText: string;
  contentVersionId: string | null;
  featureCardId: string | null;
  reviewReportId: string | null;
  longTermMemoryId: string | null;
  score: number | null;
  riskLevel: RiskLevel;
  hardFailed: boolean;
  statusNote: string | null;
  recommendedAction: string;
}

export interface BodyBatchSummaryDTO {
  id: string;
  batchId: string;
  conclusion: string;
  chapterResults: BodyBatchChapterResultDTO[];
  riskTrend: string;
  nextBatchNotes: string[];
  riskChapterIds: string[];
  createdAt: string;
}

export interface BodyBatchDTO {
  id: string;
  taskId: string;
  status: BodyBatchStatus;
  statusText: string;
  strategySnapshotId: string;
  strategySnapshotVersion: number;
  startChapterNo: number;
  endChapterNo: number;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  failedChapterNo: number | null;
  statusNote: string | null;
  chapterResults: BodyBatchChapterResultDTO[];
  summary: BodyBatchSummaryDTO;
  createdAt: string;
}

export interface BodyGenerationStateDTO {
  strategySnapshot: BodyGenerationStrategySnapshotDTO | null;
  latestBatch: BodyBatchDTO | null;
  openImpactCases: ImpactCaseDTO[];
  nextBatchRange: {
    startChapterNo: number | null;
    endChapterNo: number | null;
    batchSize: number;
    text: string;
  };
  chapterProgress: NovelChapterProgressDTO;
  blockingReasons: string[];
  recommendedAction: RecommendedActionDTO;
}

export interface BodyBatchActionResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  task: DirectionTaskDTO;
  batch: BodyBatchDTO | null;
  bodyGeneration: BodyGenerationStateDTO;
  chapters: NovelChapterDTO[];
  affectedObjects: string[];
  nextAction: RecommendedActionDTO;
}

export type FullReviewGateResult = 'pass' | 'warning' | 'blocked' | 'forced_pass';
export type FullReviewIssueStatus = 'open' | 'accepted_risk' | 'resolved' | 'stale';

export interface FullReviewIssueDTO {
  issueId: string;
  title: string;
  plainDescription: string;
  severity: 'info' | 'warning' | 'blocking';
  scopeType: 'novel' | 'chapter' | 'stage' | 'structure';
  scopeRefs: string[];
  dimension: string;
  blocking: boolean;
  recommendedTarget: string;
  recommendedAction: string;
  status: FullReviewIssueStatus;
  acceptedReason: string | null;
}

export interface FirstVideoSuggestionDTO {
  chapterRange: string;
  openingSlice: string;
  narrationHook: string;
  firstScreenSubtitle: string;
  titleHook: string;
  endingSuspense: string;
  suggestedFormat: string;
  riskTips: string[];
}

export interface FullReviewGateDTO {
  id: string;
  reviewReportId: string;
  gateResult: FullReviewGateResult;
  gateResultText: string;
  allowCompletion: boolean;
  allowVideoReady: boolean;
  blockingIssueCount: number;
  warningIssueCount: number;
  forcePassAllowed: boolean;
  forcePassReason: string | null;
  isStale: boolean;
  staleReason: string | null;
  createdAt: string;
}

export interface FullReviewReportDTO {
  id: string;
  version: number;
  reviewLevel: 'full_novel';
  totalScore: number;
  rating: string;
  gateResult: FullReviewGateResult;
  summary: string;
  strengths: string[];
  problems: string[];
  suggestions: string[];
  dimensionScores: ScoringDimensionDTO[];
  issues: FullReviewIssueDTO[];
  videoSuggestion: string;
  firstVideoSuggestion: FirstVideoSuggestionDTO;
  platformRisks: string[];
  originalityRisks: string[];
  aiFlavorRisks: string[];
  lowScoreContinueRisks: string[];
  reviewPolicyVersionId: string;
  sourceVersionRefs: unknown;
  gate: FullReviewGateDTO;
  createdAt: string;
}

export interface FullReviewActionResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  task: DirectionTaskDTO;
  fullReview: FullReviewReportDTO;
  affectedObjects: string[];
  nextAction: RecommendedActionDTO;
}

export interface FullReviewLatestResultDTO {
  novelId: string;
  fullReview: FullReviewReportDTO | null;
  statusSummary: NovelStatusSummaryDTO;
  nextAction: RecommendedActionDTO;
}

export interface FullReviewIssueActionResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  fullReview: FullReviewReportDTO;
  issue: FullReviewIssueDTO;
  nextAction: RecommendedActionDTO;
}

export interface CompletionDecisionDTO {
  id: string;
  reviewReportId: string;
  fullReviewGateId: string;
  decision: string;
  reason: string;
  isForced: boolean;
  score: number;
  riskSummary: string;
  chapterCount: number;
  totalWordCount: number;
  estimatedAudioMinutes: number;
  createdAt: string;
}

export interface VideoReadinessCheckItemDTO {
  key: string;
  label: string;
  passed: boolean;
  severity: 'info' | 'warning' | 'blocking';
  message: string;
  nextAction: string;
}

export interface VideoReadinessCheckDTO {
  id: string;
  version: number;
  status: 'candidate' | 'not_ready' | 'ready';
  statusText: string;
  checkItems: VideoReadinessCheckItemDTO[];
  blockingReasons: string[];
  firstVideoSuggestion: FirstVideoSuggestionDTO;
  createdAt: string;
}

export interface VideoReadinessSnapshotDTO {
  id: string;
  completionDecisionId: string;
  reviewReportId: string;
  status: 'ready';
  chapterCount: number;
  totalWordCount: number;
  estimatedAudioMinutes: number;
  riskSummary: string;
  referableChapterIds: string[];
  referableChapterVersionIds: string[];
  firstVideoSuggestion: FirstVideoSuggestionDTO;
  createdAt: string;
}

export interface VideoReadinessDTO {
  novelId: string;
  status: 'not_ready' | 'candidate' | 'ready';
  statusText: string;
  check: VideoReadinessCheckDTO | null;
  checkItems: VideoReadinessCheckItemDTO[];
  blockingReasons: string[];
  completionDecision: CompletionDecisionDTO | null;
  snapshot: VideoReadinessSnapshotDTO | null;
  firstVideoSuggestion: FirstVideoSuggestionDTO | null;
  recommendedAction: RecommendedActionDTO;
}

export interface CompletionActionResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  completionDecision: CompletionDecisionDTO;
  videoReadiness: VideoReadinessDTO;
  affectedObjects: string[];
  nextAction: RecommendedActionDTO;
}

export interface VideoReadinessActionResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  task: DirectionTaskDTO | null;
  videoReadiness: VideoReadinessDTO;
  affectedObjects: string[];
  nextAction: RecommendedActionDTO;
}

export interface ChapterRewriteResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  task: DirectionTaskDTO;
  chapter: NovelChapterDTO;
  currentContent: TrialChapterCandidateDTO | null;
  candidate: TrialChapterCandidateDTO;
  summaryCompare: ChapterSummaryCompareDTO;
  affectedObjects: string[];
  nextAction: RecommendedActionDTO;
}

export interface ChapterContentAdoptionResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  task: DirectionTaskDTO;
  chapter: NovelChapterDTO;
  previousContentVersionId: string | null;
  currentContent: TrialChapterCandidateDTO;
  impactCase: ImpactCaseDTO;
  affectedObjects: string[];
  nextAction: RecommendedActionDTO;
}

export interface ImpactAssessmentActionResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  task: DirectionTaskDTO;
  impactCase: ImpactCaseDTO;
  nextAction: RecommendedActionDTO;
}

export interface ImpactCaseResolveResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  impactCase: ImpactCaseDTO;
  nextAction: RecommendedActionDTO;
}

export interface TrialRunDTO {
  id: string;
  novelId: string;
  status: string;
  statusText: string;
  chapterCount: number;
  currentStep: string;
  selectedChapterOneCandidateId: string | null;
  blockingReason: string | null;
  chapterOneCandidates: TrialChapterCandidateDTO[];
  chapterResults: TrialChapterResultDTO[];
  trialReview: TrialReviewDTO | null;
  bodyStrategySnapshot: BodyGenerationStrategySnapshotDTO | null;
  task: RecentTaskSummaryDTO | null;
  recentTask: RecentTaskSummaryDTO | null;
}

export interface TrialActionResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  task: DirectionTaskDTO;
  trialRun: TrialRunDTO;
  bodyStrategySnapshot: BodyGenerationStrategySnapshotDTO | null;
  affectedObjects: string[];
  nextAction: RecommendedActionDTO;
}

export interface ChapterWorkbenchDTO {
  novelId: string;
  chapter: NovelChapterDTO;
  currentContent: TrialChapterCandidateDTO | null;
  featureCard: ChapterFeatureCardDTO | null;
  reviewReport: ChapterReviewReportDTO | null;
  reviewIssues: ChapterReviewIssueDTO[];
  candidateVersions: TrialChapterCandidateDTO[];
  candidateCompares: Record<string, ChapterSummaryCompareDTO>;
  longTermMemory: LongTermMemoryDTO | null;
  impactCases: ImpactCaseDTO[];
  recentTask: RecentTaskSummaryDTO | null;
  recommendedAction: RecommendedActionDTO;
}

export interface PrimaryActionDTO {
  type: string;
  label: string;
  target: 'detail';
}

export const NOVEL_CREATION_SOURCE_REQUEST_TYPES = ['system_recommendation', 'hotspot_reference', 'manual_idea'] as const;
export const NOVEL_CREATION_SOURCE_RESPONSE_TYPES = [...NOVEL_CREATION_SOURCE_REQUEST_TYPES, 'legacy_unknown'] as const;

export type NovelCreationSourceRequestType = (typeof NOVEL_CREATION_SOURCE_REQUEST_TYPES)[number];
export type NovelCreationSourceType = (typeof NOVEL_CREATION_SOURCE_RESPONSE_TYPES)[number];

export const NOVEL_CREATION_SOURCE_DB_VALUES = {
  system_recommendation: 'SYSTEM_RECOMMENDATION',
  hotspot_reference: 'HOTSPOT_REFERENCE',
  manual_idea: 'MANUAL_IDEA',
  legacy_unknown: 'LEGACY_UNKNOWN'
} as const satisfies Record<NovelCreationSourceType, string>;

export function novelCreationSourceFromDb(value: string | null | undefined): NovelCreationSourceType {
  const normalized = value?.trim().toUpperCase();

  switch (normalized) {
    case 'SYSTEM_RECOMMENDATION':
      return 'system_recommendation';
    case 'HOTSPOT_REFERENCE':
      return 'hotspot_reference';
    case 'MANUAL_IDEA':
      return 'manual_idea';
    case 'LEGACY_UNKNOWN':
    default:
      return 'legacy_unknown';
  }
}

export function novelCreationSourceToDb(value: NovelCreationSourceType): string {
  return NOVEL_CREATION_SOURCE_DB_VALUES[value];
}

export interface NovelCreationSourceSummaryDTO {
  type: NovelCreationSourceType;
  label: string;
  description: string;
  hotspotReportId: string | null;
  hotspotOpportunityId: string | null;
  hotspotTitle: string | null;
  hotspotOpportunityTitle: string | null;
  isLegacyUnknown: boolean;
  unavailableReason: string | null;
}

export interface NovelListItemDTO {
  id: string;
  title: string;
  channel: string;
  genres: string[];
  lifecycleStatus: NovelLifecycleStatus;
  creationStage: NovelCreationStage;
  stageStatus: StageStatus;
  statusSummary: NovelStatusSummaryDTO;
  scoreSummary: NovelScoreSummaryDTO;
  chapterProgress: NovelChapterProgressDTO;
  videoReferenceSummary: NovelVideoReferenceSummaryDTO;
  creationSource: NovelCreationSourceSummaryDTO;
  recentTask: RecentTaskSummaryDTO | null;
  primaryAction: PrimaryActionDTO;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNovelPreferencesDTO {
  creationSourceType: NovelCreationSourceType;
  creationSourceLabel: string;
  creationSourceDescription: string;
  hotspotReportId: string | null;
  hotspotOpportunityId: string | null;
  hotspotTitle: string | null;
  hotspotOpportunityTitle: string | null;
  appealPoints: string[];
  genres: string[];
  openingState: string | null;
  blockedElements: string[];
  targetAudience: string | null;
  chapterLimit: number;
  chapterWordMin: number;
  chapterWordMax: number;
  stageCount: number | null;
  customIdea: string | null;
  style: string | null;
  videoAdaptationPreference: string | null;
}

export interface NovelDetailDTO extends NovelListItemDTO {
  preferences: CreateNovelPreferencesDTO;
  currentAssets: {
    direction: DirectionCandidateDTO | null;
    setting: StructureAssetDTO | null;
    outline: StructureAssetDTO | null;
    stageOutline: StructureAssetDTO | null;
    chapterPlan: StructureAssetDTO | null;
  };
  directionCandidates: DirectionCandidateDTO[];
  structureCandidates: StructureAssetDTO[];
  chapters: NovelChapterDTO[];
  chapterStats: NovelChapterProgressDTO;
  latestTrialRun: TrialRunDTO | null;
  bodyStrategySnapshot: BodyGenerationStrategySnapshotDTO | null;
  bodyGeneration: BodyGenerationStateDTO | null;
  latestFullReview: FullReviewReportDTO | null;
  completionDecision: CompletionDecisionDTO | null;
  videoReadiness: VideoReadinessDTO | null;
  recentTasks: RecentTaskSummaryDTO[];
  blockingReasons: string[];
  videoSummary: NovelVideoReferenceSummaryDTO;
}

export interface NovelRowSummaryDTO {
  novelId: string;
  recentTask: RecentTaskSummaryDTO | null;
  recentReviewSummary: string | null;
  pendingChapters: number;
  riskTips: string[];
  recommendedAction: RecommendedActionDTO;
}

export interface CreateNovelDraftRequest {
  title: string;
  channel?: string;
  creationSourceType?: NovelCreationSourceRequestType;
  genres?: string[];
  hotspotReportId?: string | null;
  hotspotOpportunityId?: string | null;
  preferences?: {
    appealPoints?: string[];
    openingState?: string | null;
    blockedElements?: string[];
    targetAudience?: string | null;
    stageCount?: number | null;
    customIdea?: string | null;
    style?: string | null;
    videoAdaptationPreference?: string | null;
  };
  chapterLimit?: number;
  chapterWordRange?: {
    min: number;
    max: number;
  };
}

export interface GenerateDirectionsRequest {
  regenerateReason?: string | null;
}

export interface FuseDirectionsRequest {
  versionIds: string[];
  reason?: string | null;
}

export interface OptimizeDirectionRequest {
  instruction?: string | null;
}

export interface EditDirectionCandidateRequest {
  title: string;
  logline: string;
  coreHook: string;
  audienceAppeal: string;
  videoPotential: string;
  sellingPoints: string[];
  riskTags: string[];
  recommendation: string;
  reason: string;
}

export interface AdoptDirectionRequest {
  confirmLowScore?: boolean;
  reason?: string | null;
  pageVersionSnapshot?: unknown;
  currentVersionId?: string | null;
}

export interface GenerateStructureAssetRequest {
  regenerateReason?: string | null;
}

export interface EditStructureAssetRequest {
  title: string;
  summary: string;
  sectionTitle: string;
  sectionBody: string;
  sectionItems: string[];
  riskTags: string[];
  recommendation: string;
  reason: string;
}

export interface AdoptStructureAssetRequest {
  confirmHighRisk?: boolean;
  reason?: string | null;
  pageVersionSnapshot?: unknown;
  currentVersionId?: string | null;
}

export interface UpdateChapterWordTargetsRequest {
  updates: Array<{
    chapterNo: number;
    wordTarget: number;
  }>;
  reason?: string | null;
  currentChapterPlanVersionId?: string | null;
}

export interface GenerateTrialRequest {
  chapterCount?: number;
  trialRunId?: string | null;
  selectedCandidateId?: string | null;
  regenerateReason?: string | null;
}

export interface ConfirmTrialRequest {
  trialRunId: string;
  decision: 'confirm_pass' | 'force_pass' | 'return_upstream';
  reason?: string | null;
  confirmRisk?: boolean;
}

export interface GenerateBodyBatchRequest {
  strategySnapshotId: string;
  expectedStrategySnapshotVersion: number;
  startChapterNo?: number | null;
  endChapterNo?: number | null;
  idempotencyKey: string;
}

export interface GenerateChapterBodyRequest {
  strategySnapshotId: string;
  expectedStrategySnapshotVersion: number;
  reason?: string | null;
}

export interface StartFullReviewRequest {
  idempotencyKey: string;
  expectedNovelVersion?: string | null;
  reviewPolicyVersionId?: string | null;
}

export interface ResolveFullReviewIssueRequest {
  issueId: string;
  action: 'resolve' | 'accept_risk';
  reason?: string | null;
}

export interface ForcePassFullReviewRequest {
  idempotencyKey: string;
  fullReviewGateId: string;
  expectedReviewReportVersion?: number | null;
  reason: string;
  confirmRisk: boolean;
}

export interface ConfirmCompletionRequest {
  idempotencyKey: string;
  reviewReportId: string;
  fullReviewGateId: string;
  expectedReviewReportVersion?: number | null;
  expectedNovelVersion?: string | null;
  reason?: string | null;
  confirmRisk?: boolean;
}

export interface RecheckVideoReadinessRequest {
  idempotencyKey?: string | null;
}

export interface ConfirmVideoReadinessRequest {
  idempotencyKey: string;
  completionDecisionId: string;
  readinessCheckId: string;
  checkVersion: number;
  expectedNovelVersion?: string | null;
  reason?: string | null;
  confirmRisk?: boolean;
}

export interface RewriteChapterRequest {
  instruction?: string | null;
  reason?: string | null;
  currentContentVersionId?: string | null;
}

export interface AdoptChapterContentVersionRequest {
  reason?: string | null;
  currentContentVersionId?: string | null;
  pageVersionSnapshot?: unknown;
}

export interface CreateImpactAssessmentRequest {
  reason?: string | null;
  currentContentVersionId?: string | null;
}

export interface ResolveImpactCaseRequest {
  resolution: 'resolved' | 'ignored' | 'cancelled';
  reason?: string | null;
  handlingChoice?: 'confirm_no_impact' | 'mark_resolved' | 'cancel_case' | null;
}

export interface NovelListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  lifecycleStatus?: NovelLifecycleStatus;
  creationStage?: NovelCreationStage;
  videoReferenceStatus?: string;
}

export type NovelListResultDTO = PagedResult<NovelListItemDTO>;
