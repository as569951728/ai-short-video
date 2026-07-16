import {
  NovelCreationStage,
  NovelLifecycleStatus,
  RiskLevel,
  StaleLevel,
  StageStatus,
  TaskStatus,
  VersionStatus,
  type BodyBatchChapterResultDTO,
  type BodyBatchStatus,
  type ChapterSummaryCompareDTO,
  type FirstVideoSuggestionDTO,
  type FullReviewGateResult,
  type FullReviewIssueDTO,
  type VideoReadinessCheckItemDTO,
  type DirectionCandidateContentDTO,
  type ImpactCaseVisibleStatus,
  type QualityScoringDTO,
  type StructureAssetContentDTO,
  type StructureAssetType,
  type CreateNovelDraftRequest,
  type NovelCreationSourceType,
  type ExecutionEnvelopeV1
} from '@ai-shortvideo/shared';

export const DEFAULT_TENANT_ID = 'tenant_default';
export const DEFAULT_USER_ID = 'user_default';
export const DEFAULT_POLICY_PROFILE_VERSION_ID = 'policy_default_v1';

export interface RequestContext {
  tenantId: string;
  userId: string;
  requestId: string;
  ip?: string;
  userAgent?: string;
}

export interface NovelRecord {
  id: string;
  tenantId: string;
  ownerId: string;
  title: string;
  channel: string;
  genres: string[];
  lifecycleStatus: NovelLifecycleStatus;
  creationStage: NovelCreationStage;
  stageStatus: StageStatus;
  currentDirectionVersionId: string | null;
  currentSettingVersionId: string | null;
  currentOutlineVersionId: string | null;
  currentStageOutlineVersionId: string | null;
  currentChapterPlanVersionId: string | null;
  hotspotReportId: string | null;
  policyProfileVersionId: string | null;
  chapterLimit: number;
  chapterWordMin: number;
  chapterWordMax: number;
  summary: string | null;
  videoReferenceStatus: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface DirectionCandidateDraft {
  title: string;
  summary: string;
  content: DirectionCandidateContentDTO;
  score: number;
  marketScore: number;
  riskLevel: RiskLevel;
  riskTags: string[];
  recommendedReason: string;
}

export interface StructureAssetDraft {
  objectType: StructureAssetType;
  title: string;
  summary: string;
  content: StructureAssetContentDTO;
  score: number;
  riskLevel: RiskLevel;
  riskTags: string[];
  recommendedReason: string;
}

export interface CreativeVersionRecord {
  id: string;
  tenantId: string;
  novelId: string;
  objectType: string;
  objectId: string;
  versionNo: number;
  status: VersionStatus;
  staleLevel: StaleLevel;
  sourceType: string | null;
  sourceTaskId: string | null;
  sourceVersionRefs: unknown;
  changeReason: string | null;
  content: unknown;
  summary: string | null;
  score: number | null;
  riskLevel: RiskLevel;
  decisionRecordId: string | null;
  createdBy: string | null;
  createdAt: Date;
  metadata: unknown;
}

export interface NovelChapterRecord {
  id: string;
  tenantId: string;
  novelId: string;
  chapterNo: number;
  stageIndex: number | null;
  title: string;
  wordTarget: number | null;
  wordCount: number;
  mainStatus: string;
  statusNote: string | null;
  impactLevel: string;
  currentFeatureCardVersionId: string | null;
  currentContentVersionId: string | null;
  currentReviewReportId: string | null;
  lastGenerationTaskId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  metadata?: unknown;
}

export interface ChapterContentVersionRecord {
  id: string;
  tenantId: string;
  novelId: string;
  chapterId: string;
  versionNo: number;
  status: VersionStatus | 'selected_for_trial' | 'historical';
  staleLevel: StaleLevel;
  sourceType: string | null;
  sourceTaskId: string | null;
  sourceVersionRefs: unknown;
  rewriteReason: string | null;
  content: string;
  wordCount: number;
  summary: string | null;
  reviewScore: number | null;
  decisionRecordId: string | null;
  createdBy: string | null;
  createdAt: Date;
  metadata: unknown;
}

export interface ChapterFeatureCardRecord {
  id: string;
  tenantId: string;
  novelId: string;
  chapterId: string;
  versionNo: number;
  status: VersionStatus | string;
  staleLevel: StaleLevel;
  oneLineSummary: string | null;
  coreTask: string | null;
  mainConflict: string | null;
  appealPoint: string | null;
  emotionKeywords: string[];
  characterChanges: string[];
  relationshipChanges: string[];
  keyInformation: string[];
  foreshadowingOperation: string | null;
  endingHook: string | null;
  factsCannotChange: string[];
  featuresToStrengthen: string[];
  sourceTaskId: string | null;
  decisionRecordId: string | null;
  createdAt: Date;
  metadata: unknown;
}

export interface ReviewReportRecord {
  id: string;
  tenantId: string;
  novelId: string;
  objectType: string;
  objectId: string;
  objectVersionId: string | null;
  reviewLevel: string;
  totalScore: number | null;
  subScores: unknown;
  rating: string | null;
  summary: string | null;
  strengths: string[];
  problems: string[];
  suggestions: string[];
  issueCards: unknown;
  actionOptions: unknown;
  recommendedAction: string | null;
  allowNextStep: boolean;
  blockingIssueCount: number;
  resolvedStatus: string | null;
  promptTemplateVersionId: string | null;
  policyProfileVersionId: string | null;
  sourceTaskId: string | null;
  createdAt: Date;
  metadata: unknown;
}

export interface FullReviewGateRecord {
  id: string;
  tenantId: string;
  novelId: string;
  reviewReportId: string;
  gateResult: FullReviewGateResult;
  allowCompletion: boolean;
  allowVideoReady: boolean;
  blockingIssueCount: number;
  warningIssueCount: number;
  forcePassAllowed: boolean;
  forcePassReason: string | null;
  isStale: boolean;
  staleReason: string | null;
  sourceVersionRefs: unknown;
  policyProfileVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: unknown;
}

export interface CompletionDecisionRecord {
  id: string;
  tenantId: string;
  novelId: string;
  reviewReportId: string;
  fullReviewGateId: string;
  decision: string;
  decisionReason: string;
  isForced: boolean;
  score: number;
  riskSummary: string;
  sourceVersionRefs: unknown;
  chapterCount: number;
  totalWordCount: number;
  estimatedAudioMinutes: number;
  idempotencyKey: string;
  createdBy: string | null;
  createdAt: Date;
  metadata: unknown;
}

export interface VideoReadinessCheckRecord {
  id: string;
  tenantId: string;
  novelId: string;
  taskId: string | null;
  completionDecisionId: string | null;
  reviewReportId: string | null;
  version: number;
  status: 'candidate' | 'not_ready' | 'ready';
  checkItems: VideoReadinessCheckItemDTO[];
  blockingReasons: string[];
  firstVideoSuggestion: FirstVideoSuggestionDTO;
  sourceVersionRefs: unknown;
  createdAt: Date;
  metadata: unknown;
}

export interface VideoReadinessSnapshotRecord {
  id: string;
  tenantId: string;
  novelId: string;
  fullReviewGateId: string;
  completionDecisionId: string;
  reviewReportId: string;
  status: 'ready';
  checkItems: VideoReadinessCheckItemDTO[];
  chapterCount: number;
  totalWordCount: number;
  estimatedAudioMinutes: number;
  riskSummary: string;
  referableChapterIds: string[];
  referableChapterVersionIds: string[];
  firstVideoSuggestion: FirstVideoSuggestionDTO;
  sourceVersionRefs: unknown;
  idempotencyKey: string;
  createdBy: string | null;
  createdAt: Date;
  metadata: unknown;
}

export interface LongTermMemoryRecord {
  id: string;
  tenantId: string;
  novelId: string;
  chapterId: string | null;
  sourceContentVersionId: string | null;
  previousSummary: string | null;
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
  status: VersionStatus | string;
  staleLevel: StaleLevel;
  sourceTaskId: string | null;
  createdAt: Date;
  metadata: unknown;
}

export interface ImpactCaseRecord {
  id: string;
  tenantId: string;
  novelId: string;
  sourceObjectType: string;
  sourceObjectId: string;
  sourceOldVersionId: string | null;
  sourceNewVersionId: string | null;
  impactLevel: 'none' | 'minor' | 'medium' | 'severe';
  status: string;
  affectedChapterIds: string[];
  affectedVideoReferenceIds: string[];
  summary: string | null;
  suggestedActions: string[];
  decisionRecordId: string | null;
  sourceTaskId: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  metadata: unknown;
}

export interface TrialRunRecord {
  id: string;
  tenantId: string;
  novelId: string;
  chapterPlanVersionId: string | null;
  trialChapterCount: number;
  status: string;
  totalScore: number | null;
  trialResult: string | null;
  reviewReportId: string | null;
  policyProfileVersionId: string | null;
  sourceTaskId: string | null;
  confirmedAt: Date | null;
  confirmedBy: string | null;
  forceReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: unknown;
}

export interface TrialChapterResultRecord {
  id: string;
  tenantId: string;
  trialRunId: string;
  chapterId: string;
  contentVersionId: string | null;
  featureCardVersionId: string | null;
  reviewReportId: string | null;
  score: number | null;
  status: string;
  createdAt: Date;
  metadata: unknown;
}

export interface TrialChapterCandidateDraft {
  chapterId: string;
  chapterNo: number;
  title: string;
  content: string;
  summary: string;
  openingStrategy: string;
  openingHighlight: string;
  firstSentence: string;
  first300Summary: string;
  endingHook: string;
  riskLevel: RiskLevel;
  riskTags: string[];
  aiRecommendedReason: string;
  isAiRecommended: boolean;
  scoring: QualityScoringDTO;
}

export interface TrialFollowupChapterDraft {
  chapter: NovelChapterRecord;
  content: string;
  summary: string;
  openingStrategy: string;
  openingHighlight: string;
  firstSentence: string;
  first300Summary: string;
  endingHook: string;
  riskLevel: RiskLevel;
  riskTags: string[];
  aiRecommendedReason: string;
  scoring: QualityScoringDTO;
  featureCard: Omit<ChapterFeatureCardRecord, 'id' | 'tenantId' | 'novelId' | 'versionNo' | 'status' | 'staleLevel' | 'sourceTaskId' | 'decisionRecordId' | 'createdAt'>;
  review: Omit<ReviewReportRecord, 'id' | 'tenantId' | 'novelId' | 'objectType' | 'objectId' | 'objectVersionId' | 'sourceTaskId' | 'createdAt'>;
  hardFailed: boolean;
  hardFailureReasons: string[];
}

export interface TrialReviewDraft {
  totalScore: number;
  trialResult: 'pass' | 'pass_with_suggestions' | 'return_upstream' | 'blocked';
  summary: string;
  strengths: string[];
  problems: string[];
  suggestions: string[];
  recommendedAction: string;
  allowNextStep: boolean;
  requiresRiskConfirmation: boolean;
  chapterScores: Array<{
    chapterNo: number;
    score: number;
    hardFailed: boolean;
  }>;
}

export interface BodyChapterDraft {
  chapter: NovelChapterRecord;
  content: string;
  summary: string;
  openingStrategy: string;
  openingHighlight: string;
  firstSentence: string;
  first300Summary: string;
  endingHook: string;
  riskLevel: RiskLevel;
  riskTags: string[];
  aiRecommendedReason: string;
  scoring: QualityScoringDTO;
  featureCard: Omit<ChapterFeatureCardRecord, 'id' | 'tenantId' | 'novelId' | 'versionNo' | 'status' | 'staleLevel' | 'sourceTaskId' | 'decisionRecordId' | 'createdAt'>;
  review: Omit<ReviewReportRecord, 'id' | 'tenantId' | 'novelId' | 'objectType' | 'objectId' | 'objectVersionId' | 'sourceTaskId' | 'createdAt'>;
  memory: Omit<LongTermMemoryRecord, 'id' | 'tenantId' | 'novelId' | 'chapterId' | 'sourceContentVersionId' | 'status' | 'staleLevel' | 'sourceTaskId' | 'createdAt'>;
  hardFailed: boolean;
  hardFailureReasons: string[];
}

export interface BodyBatchSummaryRecord {
  id: string;
  batchId: string;
  conclusion: string;
  chapterResults: BodyBatchChapterResultDTO[];
  riskTrend: string;
  nextBatchNotes: string[];
  riskChapterIds: string[];
  createdAt: Date;
}

export interface BodyBatchRecord {
  id: string;
  tenantId: string;
  novelId: string;
  taskId: string;
  idempotencyKey: string;
  requestFingerprint: unknown;
  strategySnapshotId: string;
  strategySnapshotVersion: number;
  sourceVersionRefs: unknown;
  startChapterNo: number;
  endChapterNo: number;
  status: BodyBatchStatus;
  statusNote: string | null;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  failedChapterNo: number | null;
  chapterResults: BodyBatchChapterResultDTO[];
  summary: BodyBatchSummaryRecord;
  createdAt: Date;
  metadata: unknown;
}

export interface ImpactAssessmentDraft {
  impactLevel: 'none' | 'minor' | 'medium' | 'severe';
  summary: string;
  changedFacts: string[];
  affectedChapterIds: string[];
  affectedVideoReferenceIds: string[];
  recommendedHandling: string;
  suggestedActions: string[];
  blocksFullReview: boolean;
}

export interface GenerationTaskRecord {
  id: string;
  tenantId: string;
  novelId: string | null;
  taskType: string;
  objectType: string | null;
  objectId: string | null;
  status: TaskStatus;
  statusNote: string | null;
  progress: number;
  currentStep: string | null;
  triggerSource: string | null;
  sourceVersionRefs: unknown;
  conflictScope: string | null;
  conflictKey: string | null;
  idempotencyToken: string | null;
  requestHash: string | null;
  activeClaimKey: string | null;
  policyProfileVersionId?: string | null;
  modelRoutingVersion?: string | null;
  inputSummary: string | null;
  outputSummary: string | null;
  resultVersionIds: string[];
  retryOfTaskId: string | null;
  failureCategory: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  resultObjectType: string | null;
  resultObjectId: string | null;
  userAcceptedResult: boolean;
  cancelRequestedAt: Date | null;
  cancelReason: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: unknown;
  leaseOwnerId?: string | null;
  leaseToken?: string | null;
  leaseExpiresAt?: Date | null;
  lastHeartbeatAt?: Date | null;
  retryCount?: number;
  maxRetries?: number;
  executionEnvelopeJson?: ExecutionEnvelopeV1 | null;
  providerAttemptId?: string | null;
  providerAttemptPhase?: ProviderAttemptPhase | null;
  providerDispatchedAt?: Date | null;
  resultReceiptHash?: string | null;
  rootTaskId?: string;
  providerCallBudgetMax?: number;
  providerCallBudgetUsed?: number;
  durationDeadlineAt?: Date;
  costBudgetMicrosMax?: bigint | number;
  costBudgetMicrosUsed?: bigint | number;
}

export type ProviderAttemptPhase = 'leased' | 'prepared' | 'provider_call_started' | 'provider_result_validated' | 'finalizing';

export interface ClaimGenerationTaskInput {
  tenantId: string;
  novelId: string;
  taskType: string;
  objectType: string;
  objectId: string;
  conflictScope: string;
  conflictKey: string;
  activeClaimKey: string;
  idempotencyToken: string;
  requestHash: string;
  sourceVersionRefs: unknown;
  executionEnvelopeJson: ExecutionEnvelopeV1;
  policyProfileVersionId: string | null;
  modelRoutingVersion: string;
  inputSummary: string;
  context: RequestContext;
  now: Date;
}

export type ClaimGenerationTaskResult =
  | { outcome: 'created'; task: GenerationTaskRecord }
  | { outcome: 'reused'; task: GenerationTaskRecord }
  | { outcome: 'idempotency_conflict'; task: GenerationTaskRecord }
  | { outcome: 'active_conflict'; task: GenerationTaskRecord };

export interface ObservedTaskLease {
  tenantId: string;
  taskId: string;
  leaseOwnerId: string;
  leaseToken: string;
  leaseExpiresAt: Date;
}

export interface SafeResultReceiptV1 {
  schemaVersion: 1;
  taskId: string;
  attemptId: string;
  status: 'waiting_confirmation' | 'completed';
  outcome: 'candidate_created' | 'review_created' | 'completed';
  resultObjectType: string | null;
  resultObjectId: string | null;
  resultVersionIds: string[];
  safeSummary: { schemaVersion: 1; resultCount: number };
}

export interface HashedSafeResultReceipt {
  receipt: SafeResultReceiptV1;
  hash: string;
}

export interface LeasedTaskFailure {
  failureCategory: string;
  errorCode: string;
  errorMessage: string;
  statusNote: string;
}

export type LeasedTaskMutationResult =
  | { outcome: 'applied'; task: GenerationTaskRecord }
  | { outcome: 'fenced'; task: null };

export type RecoverExpiredTaskResult =
  | { outcome: 'recovered'; task: GenerationTaskRecord }
  | { outcome: 'not_recovered'; task: null };

export interface GenerationTaskEventRecord {
  id: string;
  tenantId: string;
  taskId: string;
  status: TaskStatus;
  eventType: string;
  message: string | null;
  progress: number | null;
  payload: unknown;
  createdAt: Date;
}

export interface AssetDecisionRecord {
  id: string;
  tenantId: string;
  novelId: string;
  actionType: string;
  objectType: string;
  objectId: string;
  candidateVersionId: string | null;
  currentVersionIdBefore: string | null;
  currentVersionIdAfter: string | null;
  decisionReason: string | null;
  isForced: boolean;
  riskSummary: string | null;
  impactSummary: string | null;
  pageVersionSnapshot: unknown;
  sourceTaskId: string | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface NovelPreferencesRecord {
  id: string;
  tenantId: string;
  novelId: string;
  creationSourceType: NovelCreationSourceType;
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
  createdBy: string | null;
  createdAt: Date;
}

export interface OperationLogRecord {
  id: string;
  tenantId: string;
  userId: string | null;
  novelId: string | null;
  action: string;
  objectType: string | null;
  objectId: string | null;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  reason: string | null;
  impactSummary: string | null;
  sourceTaskId: string | null;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface DraftCreationInput {
  request: CreateNovelDraftRequest;
  context: RequestContext;
  now: Date;
  creationSourceContext?: {
    hotspotTitle: string | null;
    hotspotOpportunityTitle: string | null;
  };
}

export interface CreatedDraftRecord {
  novel: NovelRecord;
  preferences: NovelPreferencesRecord;
  operationLog: OperationLogRecord;
}

export interface DirectionCreationInput {
  novel: NovelRecord;
  task: GenerationTaskRecord;
  candidates: DirectionCandidateDraft[];
  taskType: string;
  changeReason: string;
  context: RequestContext;
  now: Date;
}

export interface CreatedDirectionCandidatesRecord {
  novel: NovelRecord;
  task: GenerationTaskRecord;
  versions: CreativeVersionRecord[];
}

export interface DirectionRevisionInput {
  novel: NovelRecord;
  task?: GenerationTaskRecord;
  candidate: DirectionCandidateDraft;
  taskType: string;
  changeReason: string;
  sourceVersionIds: string[];
  context: RequestContext;
  now: Date;
}

export interface CreatedDirectionRevisionRecord {
  novel: NovelRecord;
  task: GenerationTaskRecord;
  version: CreativeVersionRecord;
}

export interface DirectionAdoptionInput {
  novel: NovelRecord;
  candidate: CreativeVersionRecord;
  reason: string;
  isForced: boolean;
  pageVersionSnapshot?: unknown;
  context: RequestContext;
  now: Date;
}

export interface AdoptedDirectionRecord {
  novel: NovelRecord;
  currentDirection: CreativeVersionRecord;
  versions: CreativeVersionRecord[];
  decisionRecord: AssetDecisionRecord;
  operationLog: OperationLogRecord;
}

export interface StructureCreationInput {
  novel: NovelRecord;
  task?: GenerationTaskRecord;
  asset: StructureAssetDraft;
  taskType: string;
  changeReason: string;
  sourceVersionRefs: unknown;
  context: RequestContext;
  now: Date;
}

export interface StructureGenerationTaskCreationInput {
  novel: NovelRecord;
  objectType: StructureAssetType;
  taskType: string;
  changeReason: string;
  sourceVersionRefs: unknown;
  context: RequestContext;
  now: Date;
}

export interface TaskFailureInput {
  task: GenerationTaskRecord;
  errorCode: string;
  errorMessage: string;
  failureCategory?: string;
  statusNote?: string;
  context: RequestContext;
  now: Date;
}

export interface CreatedStructureAssetRecord {
  novel: NovelRecord;
  task: GenerationTaskRecord;
  version: CreativeVersionRecord;
}

export interface StructureAdoptionInput {
  novel: NovelRecord;
  candidate: CreativeVersionRecord;
  objectType: StructureAssetType;
  reason: string;
  isForced: boolean;
  pageVersionSnapshot?: unknown;
  context: RequestContext;
  now: Date;
}

export interface AdoptedStructureAssetRecord {
  novel: NovelRecord;
  currentAsset: CreativeVersionRecord;
  versions: CreativeVersionRecord[];
  chapters: NovelChapterRecord[];
  decisionRecord: AssetDecisionRecord;
  operationLog: OperationLogRecord;
}

export interface TaskRetryInput {
  task: GenerationTaskRecord;
  reason: string;
  context: RequestContext;
  now: Date;
}

export interface RetriedTaskRecord {
  originalTask: GenerationTaskRecord;
  newTask: GenerationTaskRecord;
  event: GenerationTaskEventRecord;
  operationLog: OperationLogRecord;
}

export interface TaskCancelInput {
  task: GenerationTaskRecord;
  reason: string;
  context: RequestContext;
  now: Date;
}

export interface CancelledTaskRecord {
  task: GenerationTaskRecord;
  event: GenerationTaskEventRecord;
  operationLog: OperationLogRecord;
}

export interface TrialCandidateCreationInput {
  novel: NovelRecord;
  task: GenerationTaskRecord;
  chapters: NovelChapterRecord[];
  candidates: TrialChapterCandidateDraft[];
  chapterCount: number;
  changeReason: string;
  sourceVersionRefs: unknown;
  context: RequestContext;
  now: Date;
}

export interface CreatedTrialCandidatesRecord {
  novel: NovelRecord;
  task: GenerationTaskRecord;
  trialRun: TrialRunRecord;
  chapterOneCandidates: ChapterContentVersionRecord[];
}

export interface TrialFollowupTaskCreationInput {
  novel: NovelRecord;
  trialRun: TrialRunRecord;
  task: GenerationTaskRecord;
  selectedCandidate: ChapterContentVersionRecord;
  context: RequestContext;
  now: Date;
}

export interface CreatedTrialFollowupTaskRecord {
  novel: NovelRecord;
  trialRun: TrialRunRecord;
  task: GenerationTaskRecord;
}

export interface TrialFollowupGenerationInput {
  novel: NovelRecord;
  trialRun: TrialRunRecord;
  task: GenerationTaskRecord;
  selectedCandidate: ChapterContentVersionRecord;
  chapters: TrialFollowupChapterDraft[];
  review: TrialReviewDraft;
  context: RequestContext;
  now: Date;
}

export interface GeneratedTrialFollowupRecord {
  novel: NovelRecord;
  trialRun: TrialRunRecord;
  task: GenerationTaskRecord;
  chapterResults: TrialChapterResultRecord[];
  contentVersions: ChapterContentVersionRecord[];
  featureCards: ChapterFeatureCardRecord[];
  reviewReports: ReviewReportRecord[];
}

export interface TrialConfirmationInput {
  novel: NovelRecord;
  trialRun: TrialRunRecord;
  selectedCandidate: ChapterContentVersionRecord;
  decision: 'confirm_pass' | 'force_pass' | 'return_upstream';
  reason: string;
  isForced: boolean;
  snapshotContent: unknown;
  context: RequestContext;
  now: Date;
}

export interface ConfirmedTrialRecord {
  novel: NovelRecord;
  trialRun: TrialRunRecord;
  bodyStrategySnapshot: CreativeVersionRecord | null;
  decisionRecord: AssetDecisionRecord;
  operationLog: OperationLogRecord;
}

export interface BodyBatchTaskCreationInput {
  novel: NovelRecord;
  task: GenerationTaskRecord;
  strategySnapshot: CreativeVersionRecord;
  idempotencyKey: string;
  requestFingerprint: unknown;
  startChapterNo: number;
  endChapterNo: number;
  sourceVersionRefs: unknown;
  context: RequestContext;
  now: Date;
}

export interface CreatedBodyBatchTaskRecord {
  novel: NovelRecord;
  task: GenerationTaskRecord;
  reused: boolean;
}

export interface BodyBatchGenerationInput {
  novel: NovelRecord;
  strategySnapshot: CreativeVersionRecord;
  task: GenerationTaskRecord;
  chapters: BodyChapterDraft[];
  idempotencyKey: string;
  requestFingerprint: unknown;
  startChapterNo: number;
  endChapterNo: number;
  sourceVersionRefs: unknown;
  previousBatchSummary: BodyBatchSummaryRecord | null;
  context: RequestContext;
  now: Date;
}

export interface FullReviewDraft {
  totalScore: number;
  rating: string;
  gateResult: FullReviewGateResult;
  summary: string;
  strengths: string[];
  problems: string[];
  suggestions: string[];
  dimensionScores: QualityScoringDTO['dimensions'];
  issues: FullReviewIssueDTO[];
  videoSuggestion: string;
  firstVideoSuggestion: FirstVideoSuggestionDTO;
  platformRisks: string[];
  originalityRisks: string[];
  aiFlavorRisks: string[];
  lowScoreContinueRisks: string[];
  reviewPolicyVersionId: string;
}

export interface FullReviewCreationInput {
  novel: NovelRecord;
  task: GenerationTaskRecord;
  chapters: NovelChapterRecord[];
  draft: FullReviewDraft;
  idempotencyKey: string;
  requestFingerprint: unknown;
  sourceVersionRefs: unknown;
  context: RequestContext;
  now: Date;
}

export interface CreatedFullReviewRecord {
  novel: NovelRecord;
  task: GenerationTaskRecord;
  reviewReport: ReviewReportRecord;
  gate: FullReviewGateRecord;
}

export interface FullReviewForcePassInput {
  novel: NovelRecord;
  reviewReport: ReviewReportRecord;
  gate: FullReviewGateRecord;
  reason: string;
  idempotencyKey: string;
  context: RequestContext;
  now: Date;
}

export interface ForcedFullReviewRecord {
  novel: NovelRecord;
  reviewReport: ReviewReportRecord;
  gate: FullReviewGateRecord;
  decisionRecord: AssetDecisionRecord;
  operationLog: OperationLogRecord;
}

export interface FullReviewIssueResolutionInput {
  novel: NovelRecord;
  reviewReport: ReviewReportRecord;
  gate: FullReviewGateRecord;
  issueId: string;
  action: 'resolve' | 'accept_risk';
  reason: string;
  context: RequestContext;
  now: Date;
}

export interface ResolvedFullReviewIssueRecord {
  novel: NovelRecord;
  reviewReport: ReviewReportRecord;
  gate: FullReviewGateRecord;
}

export interface CompletionConfirmationInput {
  novel: NovelRecord;
  reviewReport: ReviewReportRecord;
  gate: FullReviewGateRecord;
  chapters: NovelChapterRecord[];
  idempotencyKey: string;
  reason: string;
  confirmRisk: boolean;
  sourceVersionRefs: unknown;
  context: RequestContext;
  now: Date;
}

export interface ConfirmedCompletionRecord {
  novel: NovelRecord;
  completionDecision: CompletionDecisionRecord;
  readinessCheck: VideoReadinessCheckRecord;
  task: GenerationTaskRecord;
  operationLog: OperationLogRecord;
}

export interface VideoReadinessCheckInput {
  novel: NovelRecord;
  completionDecision: CompletionDecisionRecord | null;
  reviewReport: ReviewReportRecord | null;
  gate: FullReviewGateRecord | null;
  chapters: NovelChapterRecord[];
  sourceVersionRefs: unknown;
  context: RequestContext;
  now: Date;
}

export interface CreatedVideoReadinessCheckRecord {
  novel: NovelRecord;
  task: GenerationTaskRecord;
  check: VideoReadinessCheckRecord;
}

export interface VideoReadinessConfirmationInput {
  novel: NovelRecord;
  completionDecision: CompletionDecisionRecord;
  reviewReport: ReviewReportRecord;
  gate: FullReviewGateRecord;
  check: VideoReadinessCheckRecord;
  chapters: NovelChapterRecord[];
  idempotencyKey: string;
  requestFingerprint: unknown;
  reason: string;
  sourceVersionRefs: unknown;
  context: RequestContext;
  now: Date;
}

export interface ConfirmedVideoReadinessRecord {
  novel: NovelRecord;
  snapshot: VideoReadinessSnapshotRecord;
  operationLog: OperationLogRecord;
}

export interface GeneratedBodyBatchRecord {
  novel: NovelRecord;
  task: GenerationTaskRecord;
  batch: BodyBatchRecord;
  chapters: NovelChapterRecord[];
}

export interface ChapterRewriteInput {
  novel: NovelRecord;
  task: GenerationTaskRecord;
  chapter: NovelChapterRecord;
  currentContent: ChapterContentVersionRecord;
  candidate: BodyChapterDraft;
  instruction: string;
  reason: string;
  summaryCompare: ChapterSummaryCompareDTO;
  context: RequestContext;
  now: Date;
}

export interface RewrittenChapterRecord {
  novel: NovelRecord;
  task: GenerationTaskRecord;
  chapter: NovelChapterRecord;
  currentContent: ChapterContentVersionRecord;
  candidate: ChapterContentVersionRecord;
  summaryCompare: ChapterSummaryCompareDTO;
}

export interface ChapterContentAdoptionInput {
  novel: NovelRecord;
  task: GenerationTaskRecord;
  chapter: NovelChapterRecord;
  currentContent: ChapterContentVersionRecord | null;
  candidate: ChapterContentVersionRecord;
  reason: string;
  summaryCompare: ChapterSummaryCompareDTO;
  impact: ImpactAssessmentDraft;
  pageVersionSnapshot?: unknown;
  context: RequestContext;
  now: Date;
}

export interface AdoptedChapterContentRecord {
  novel: NovelRecord;
  task: GenerationTaskRecord;
  chapter: NovelChapterRecord;
  previousContentVersionId: string | null;
  currentContent: ChapterContentVersionRecord;
  impactCase: ImpactCaseRecord;
  decisionRecord: AssetDecisionRecord;
  operationLog: OperationLogRecord;
}

export interface ImpactAssessmentInput {
  novel: NovelRecord;
  task: GenerationTaskRecord;
  chapter: NovelChapterRecord;
  currentContent: ChapterContentVersionRecord;
  impact: ImpactAssessmentDraft;
  reason: string;
  context: RequestContext;
  now: Date;
}

export interface CreatedImpactAssessmentRecord {
  novel: NovelRecord;
  task: GenerationTaskRecord;
  impactCase: ImpactCaseRecord;
}

export interface ImpactCaseResolveInput {
  novel: NovelRecord;
  impactCase: ImpactCaseRecord;
  resolution: ImpactCaseVisibleStatus;
  reason: string;
  context: RequestContext;
  now: Date;
}

export interface ResolvedImpactCaseRecord {
  novel: NovelRecord;
  impactCase: ImpactCaseRecord;
  operationLog: OperationLogRecord;
}

export interface ChapterWorkbenchRecord {
  chapter: NovelChapterRecord;
  currentContent: ChapterContentVersionRecord | null;
  featureCard: ChapterFeatureCardRecord | null;
  reviewReport: ReviewReportRecord | null;
  candidateVersions: ChapterContentVersionRecord[];
  longTermMemory: LongTermMemoryRecord | null;
  impactCases: ImpactCaseRecord[];
  recentTask: GenerationTaskRecord | null;
}

export interface ChapterWordTargetUpdateInput {
  novel: NovelRecord;
  updates: Array<{
    chapterNo: number;
    wordTarget: number;
  }>;
  reason: string;
  context: RequestContext;
  now: Date;
}

export interface UpdatedChapterWordTargetsRecord {
  novel: NovelRecord;
  currentAsset: CreativeVersionRecord;
  versions: CreativeVersionRecord[];
  chapters: NovelChapterRecord[];
}

export interface ListNovelRecordsQuery {
  tenantId: string;
  page: number;
  pageSize: number;
  keyword?: string;
  lifecycleStatus?: NovelLifecycleStatus;
  creationStage?: NovelCreationStage;
  videoReferenceStatus?: string;
}

export interface ListedNovelRecords {
  items: NovelRecord[];
  total: number;
}

export interface NovelRepository {
  createDraft(input: DraftCreationInput): Promise<CreatedDraftRecord>;
  list(query: ListNovelRecordsQuery): Promise<ListedNovelRecords>;
  findById(tenantId: string, novelId: string): Promise<NovelRecord | null>;
  findPreferencesByNovelId(tenantId: string, novelId: string): Promise<NovelPreferencesRecord | null>;
  findActiveDirectionGenerationTask(tenantId: string, novelId: string): Promise<GenerationTaskRecord | null>;
  listDirectionVersions(tenantId: string, novelId: string): Promise<CreativeVersionRecord[]>;
  listStructureVersions(tenantId: string, novelId: string): Promise<CreativeVersionRecord[]>;
  listStructureVersionsByType(tenantId: string, novelId: string, objectType: StructureAssetType): Promise<CreativeVersionRecord[]>;
  listNovelChapters(tenantId: string, novelId: string): Promise<NovelChapterRecord[]>;
  findTaskById(tenantId: string, taskId: string): Promise<GenerationTaskRecord | null>;
  findTaskByIdempotencyToken(tenantId: string, taskType: string, idempotencyToken: string): Promise<GenerationTaskRecord | null>;
  listTaskEvents(tenantId: string, taskId: string): Promise<GenerationTaskEventRecord[]>;
  listRecentTasksForNovel(tenantId: string, novelId: string, limit: number): Promise<GenerationTaskRecord[]>;
  assertProviderActionSupported(taskType: string): Promise<void>;
  claimGenerationTask(input: ClaimGenerationTaskInput): Promise<ClaimGenerationTaskResult>;
  leaseNextQueuedTask(workerId: string, leaseToken: string, now: Date, leaseUntil: Date): Promise<GenerationTaskRecord | null>;
  heartbeatTask(tenantId: string, taskId: string, leaseOwnerId: string, leaseToken: string, now: Date, leaseUntil: Date): Promise<boolean>;
  finalizeLeasedTask(tenantId: string, taskId: string, leaseOwnerId: string, leaseToken: string, authoritativeNow: Date, result: HashedSafeResultReceipt): Promise<LeasedTaskMutationResult>;
  failLeasedTask(tenantId: string, taskId: string, leaseOwnerId: string, leaseToken: string, authoritativeNow: Date, failure: LeasedTaskFailure): Promise<LeasedTaskMutationResult>;
  recoverExpiredTask(observedTaskLease: ObservedTaskLease, authoritativeNow: Date): Promise<RecoverExpiredTaskResult>;
  findActiveTaskByConflict(tenantId: string, conflictScope: string, conflictKey: string): Promise<GenerationTaskRecord | null>;
  createDirectionCandidates(input: DirectionCreationInput): Promise<CreatedDirectionCandidatesRecord>;
  createDirectionRevision(input: DirectionRevisionInput): Promise<CreatedDirectionRevisionRecord>;
  findDirectionVersionById(tenantId: string, novelId: string, versionId: string): Promise<CreativeVersionRecord | null>;
  adoptDirection(input: DirectionAdoptionInput): Promise<AdoptedDirectionRecord>;
  createStructureGenerationTask(input: StructureGenerationTaskCreationInput): Promise<GenerationTaskRecord>;
  createStructureCandidate(input: StructureCreationInput): Promise<CreatedStructureAssetRecord>;
  failTask(input: TaskFailureInput): Promise<GenerationTaskRecord>;
  findStructureVersionById(
    tenantId: string,
    novelId: string,
    objectType: StructureAssetType,
    versionId: string
  ): Promise<CreativeVersionRecord | null>;
  adoptStructureAsset(input: StructureAdoptionInput): Promise<AdoptedStructureAssetRecord>;
  updateChapterWordTargets(input: ChapterWordTargetUpdateInput): Promise<UpdatedChapterWordTargetsRecord>;
  retryTask(input: TaskRetryInput): Promise<RetriedTaskRecord>;
  cancelTask(input: TaskCancelInput): Promise<CancelledTaskRecord>;
  findLatestTrialRun(tenantId: string, novelId: string): Promise<TrialRunRecord | null>;
  findTrialRunById(tenantId: string, novelId: string, trialRunId: string): Promise<TrialRunRecord | null>;
  listTrialChapterResults(tenantId: string, trialRunId: string): Promise<TrialChapterResultRecord[]>;
  listChapterContentVersions(tenantId: string, novelId: string, chapterId: string): Promise<ChapterContentVersionRecord[]>;
  findChapterContentVersionById(tenantId: string, novelId: string, versionId: string): Promise<ChapterContentVersionRecord | null>;
  findChapterById(tenantId: string, novelId: string, chapterId: string): Promise<NovelChapterRecord | null>;
  findFeatureCardById(tenantId: string, featureCardId: string): Promise<ChapterFeatureCardRecord | null>;
  findReviewReportById(tenantId: string, reviewReportId: string): Promise<ReviewReportRecord | null>;
  findLatestFullReview(tenantId: string, novelId: string): Promise<{ reviewReport: ReviewReportRecord; gate: FullReviewGateRecord } | null>;
  findFullReviewGateById(tenantId: string, novelId: string, gateId: string): Promise<FullReviewGateRecord | null>;
  findFullReviewByIdempotencyKey(tenantId: string, novelId: string, idempotencyKey: string): Promise<{ task: GenerationTaskRecord; reviewReport: ReviewReportRecord; gate: FullReviewGateRecord } | null>;
  findCompletionDecisionById(tenantId: string, novelId: string, decisionId: string): Promise<CompletionDecisionRecord | null>;
  findLatestCompletionDecision(tenantId: string, novelId: string): Promise<CompletionDecisionRecord | null>;
  findCompletionDecisionByIdempotencyKey(tenantId: string, novelId: string, idempotencyKey: string): Promise<CompletionDecisionRecord | null>;
  findLatestVideoReadinessCheck(tenantId: string, novelId: string): Promise<VideoReadinessCheckRecord | null>;
  findVideoReadinessCheckById(tenantId: string, novelId: string, checkId: string): Promise<VideoReadinessCheckRecord | null>;
  findLatestVideoReadinessSnapshot(tenantId: string, novelId: string): Promise<VideoReadinessSnapshotRecord | null>;
  findVideoReadinessSnapshotByIdempotencyKey(tenantId: string, novelId: string, idempotencyKey: string): Promise<VideoReadinessSnapshotRecord | null>;
  findBodyStrategySnapshot(tenantId: string, novelId: string): Promise<CreativeVersionRecord | null>;
  createTrialChapterOneCandidates(input: TrialCandidateCreationInput): Promise<CreatedTrialCandidatesRecord>;
  createTrialFollowupTask(input: TrialFollowupTaskCreationInput): Promise<CreatedTrialFollowupTaskRecord>;
  selectTrialChapterOneAndGenerateFollowup(input: TrialFollowupGenerationInput): Promise<GeneratedTrialFollowupRecord>;
  confirmTrial(input: TrialConfirmationInput): Promise<ConfirmedTrialRecord>;
  getChapterWorkbench(tenantId: string, novelId: string, chapterId: string): Promise<ChapterWorkbenchRecord | null>;
  findLatestBodyBatch(tenantId: string, novelId: string): Promise<BodyBatchRecord | null>;
  findBodyBatchByIdempotencyKey(tenantId: string, novelId: string, idempotencyKey: string): Promise<BodyBatchRecord | null>;
  listOpenBlockingImpactCases(tenantId: string, novelId: string): Promise<ImpactCaseRecord[]>;
  listImpactCasesForChapter(tenantId: string, novelId: string, chapterId: string): Promise<ImpactCaseRecord[]>;
  findImpactCaseById(tenantId: string, novelId: string, impactCaseId: string): Promise<ImpactCaseRecord | null>;
  findLatestLongTermMemory(tenantId: string, novelId: string, chapterId?: string | null): Promise<LongTermMemoryRecord | null>;
  createBodyBatchTask(input: BodyBatchTaskCreationInput): Promise<CreatedBodyBatchTaskRecord>;
  createFullReview(input: FullReviewCreationInput): Promise<CreatedFullReviewRecord>;
  forcePassFullReview(input: FullReviewForcePassInput): Promise<ForcedFullReviewRecord>;
  resolveFullReviewIssue(input: FullReviewIssueResolutionInput): Promise<ResolvedFullReviewIssueRecord>;
  confirmCompletion(input: CompletionConfirmationInput): Promise<ConfirmedCompletionRecord>;
  createVideoReadinessCheck(input: VideoReadinessCheckInput): Promise<CreatedVideoReadinessCheckRecord>;
  confirmVideoReadiness(input: VideoReadinessConfirmationInput): Promise<ConfirmedVideoReadinessRecord>;
  generateBodyBatch(input: BodyBatchGenerationInput): Promise<GeneratedBodyBatchRecord>;
  rewriteChapter(input: ChapterRewriteInput): Promise<RewrittenChapterRecord>;
  adoptChapterContent(input: ChapterContentAdoptionInput): Promise<AdoptedChapterContentRecord>;
  createImpactAssessment(input: ImpactAssessmentInput): Promise<CreatedImpactAssessmentRecord>;
  resolveImpactCase(input: ImpactCaseResolveInput): Promise<ResolvedImpactCaseRecord>;
}

export function normalizeDraftRequest(request: CreateNovelDraftRequest) {
  const chapterWordMin = request.chapterWordRange?.min ?? 1800;
  const chapterWordMax = request.chapterWordRange?.max ?? 2600;
  const chapterLimit = request.chapterLimit ?? 80;
  const genres = request.genres ?? [];
  const preferences = request.preferences ?? {};
  const creationSourceType = request.creationSourceType ?? 'system_recommendation';

  return {
    title: request.title.trim(),
    channel: request.channel?.trim() || 'novel',
    creationSourceType,
    genres,
    hotspotReportId: request.hotspotReportId?.trim() || null,
    hotspotOpportunityId: request.hotspotOpportunityId?.trim() || null,
    hotspotTitle: null as string | null,
    hotspotOpportunityTitle: null as string | null,
    appealPoints: preferences.appealPoints ?? [],
    openingState: preferences.openingState ?? null,
    blockedElements: preferences.blockedElements ?? [],
    targetAudience: preferences.targetAudience ?? null,
    chapterLimit,
    chapterWordMin,
    chapterWordMax,
    stageCount: preferences.stageCount ?? null,
    customIdea: preferences.customIdea?.trim() || null,
    style: preferences.style ?? null,
    videoAdaptationPreference: preferences.videoAdaptationPreference ?? null
  };
}
