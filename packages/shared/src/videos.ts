import type { PagedResult } from './api.js';

export type VideoProjectType = 'first_test' | 'chapter_range' | 'full_book_seed';
export type VideoLifecycleStatus = 'active' | 'stopped' | 'archived';
export type VideoReferenceStatus = 'normal' | 'info' | 'warning' | 'blocking' | 'resolved';
export type VideoProductionStatus = 'not_started' | 'ready_for_generation' | 'generation_locked';
export type VideoIssueLevel = 'info' | 'warning' | 'blocking';
export type VideoIssueAction = 'ignore' | 'resolve' | 'stop_project' | 'return_to_novel';
export type VideoWorkbenchStepKey =
  | 'reference_check'
  | 'narration'
  | 'tts'
  | 'subtitle'
  | 'visual_plan'
  | 'render'
  | 'preview'
  | 'export';
export type VideoWorkbenchStepStatus = 'active' | 'completed' | 'placeholder_locked' | 'blocked';
export type VideoArtifactType = 'narration_script' | 'tts_audio' | 'subtitle' | 'subtitle_style' | 'visual_plan';
export type VideoNarrationArtifactStatus = 'candidate' | 'draft' | 'confirmed' | 'rejected' | 'stale' | 'archived';
export type VideoNarrationQualityMode = 'fast' | 'standard' | 'high_quality';
export type VideoNarrationMockTaskOutcome = 'success' | 'failed' | 'cancelled';
export type VideoTtsArtifactStatus = VideoNarrationArtifactStatus;
export type VideoTtsQualityMode = VideoNarrationQualityMode;
export type VideoTtsMockTaskOutcome = 'success' | 'failed' | 'cancelled';
export type VideoTtsEmotion = 'calm' | 'suspense' | 'excited' | 'warm';
export type VideoSubtitleArtifactStatus = VideoNarrationArtifactStatus;
export type VideoSubtitleQualityMode = VideoNarrationQualityMode;
export type VideoSubtitleMockTaskOutcome = 'success' | 'failed' | 'cancelled';
export type VideoSubtitleStyle = 'compact' | 'balanced' | 'dramatic';
export type VideoVisualPlanStatus = VideoNarrationArtifactStatus;
export type VideoRenderStatus = 'candidate' | 'confirmed' | 'rejected' | 'stale' | 'archived';
export type VideoRenderPreviewStatus = 'preview_pending' | 'confirmed_exportable' | 'rejected_pending_revision';
export type VideoExportStatus = 'created' | 'failed' | 'cancelled';
export type VideoRenderMockTaskOutcome = 'success' | 'failed' | 'cancelled';
export type VideoAspectRatio = '9:16' | '16:9' | '1:1';
export type VideoResolution = '720x1280' | '1080x1920' | '1920x1080';
export type VideoSubtitlePosition = 'bottom_safe' | 'middle' | 'top_safe';
export type VideoSafeAreaPreset = 'douyin_safe' | 'kuaishou_safe' | 'wide_safe';

export const VIDEO_WORKBENCH_STEP_KEYS: readonly VideoWorkbenchStepKey[] = [
  'reference_check',
  'narration',
  'tts',
  'subtitle',
  'visual_plan',
  'render',
  'preview',
  'export'
] as const;

export const P9A_LOCKED_PRODUCTION_ACTION_LABELS = ['生成旁白', '生成配音', '生成字幕', '渲染视频', '导出文件'] as const;
export const VIDEO_NARRATION_ARTIFACT_STATUSES: readonly VideoNarrationArtifactStatus[] = [
  'candidate',
  'draft',
  'confirmed',
  'rejected',
  'stale',
  'archived'
] as const;
export const VIDEO_NARRATION_QUALITY_MODES: readonly VideoNarrationQualityMode[] = ['fast', 'standard', 'high_quality'] as const;
export const VIDEO_NARRATION_MOCK_TASK_OUTCOMES: readonly VideoNarrationMockTaskOutcome[] = ['success', 'failed', 'cancelled'] as const;
export const VIDEO_TTS_MOCK_TASK_OUTCOMES: readonly VideoTtsMockTaskOutcome[] = ['success', 'failed', 'cancelled'] as const;
export const VIDEO_TTS_EMOTIONS: readonly VideoTtsEmotion[] = ['calm', 'suspense', 'excited', 'warm'] as const;
export const VIDEO_TTS_VOICES: ReadonlyArray<{ id: string; name: string; description: string }> = [
  { id: 'mock-male-cinematic', name: '男声-剧情感', description: '适合悬念、反转和剧情推进。' },
  { id: 'mock-female-bright', name: '女声-明亮感', description: '适合轻快、清晰的短视频讲述。' },
  { id: 'mock-neutral-calm', name: '中性-冷静感', description: '适合解释型、信息密度高的旁白。' }
] as const;
export const VIDEO_RENDER_MOCK_TASK_OUTCOMES: readonly VideoRenderMockTaskOutcome[] = ['success', 'failed', 'cancelled'] as const;
export const VIDEO_VISUAL_BACKGROUND_ASSETS: ReadonlyArray<{ id: string; name: string; type: 'loop_background'; description: string }> = [
  { id: 'mock-bg-salt-field', name: '盐场风沙循环背景', type: 'loop_background', description: '适合古代、危机和工业感题材。' },
  { id: 'mock-bg-night-city', name: '夜色城市循环背景', type: 'loop_background', description: '适合悬疑、都市和反转题材。' },
  { id: 'mock-bg-ink-motion', name: '水墨流动循环背景', type: 'loop_background', description: '适合玄幻、历史和讲述型视频。' }
] as const;

export const VIDEO_FORBIDDEN_VISIBLE_KEY_PATTERN =
  /prompt|rawprompt|rawresponse|modelresponse|providerresponse|providerpayload|requestpayload|responsepayload|endpoint|apikey|api_key|token|secret|database_url|databaseurl|fullchaptertext|chapterbody|debug/i;

export const VIDEO_FORBIDDEN_VISIBLE_TEXT_PATTERN =
  /(sk-[A-Za-z0-9_-]{8,}|api[_-]?key|bearer\s+[A-Za-z0-9._-]+|database_url|mysql:\/\/|postgres:\/\/|https?:\/\/\S+|prompt\s*[:：]|raw\s+(?:response|payload)|provider\s+(?:response|payload))/i;

export type VideoTaskStatusDTO = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface VideoSafeProviderSummaryDTO {
  provider: string;
  model: string;
  isMockOutput: boolean;
  safeSummary?: string;
}

export interface VideoSafeArtifactMetadataDTO {
  isMockOutput?: boolean;
  candidateRank?: number;
  subtitleStyle?: VideoSubtitleStyle;
  lineLength?: number;
  previewKind?: string;
  baseArtifactId?: string | null;
  editReason?: string;
  voiceId?: string;
  voiceName?: string;
  speed?: number;
  emotion?: VideoTtsEmotion;
  volume?: number;
  durationSeconds?: number;
  narrationArtifactId?: string;
  ttsArtifactId?: string;
  subtitleArtifactId?: string;
  visualPlanArtifactId?: string;
  renderVersionId?: string;
  format?: 'mp4';
  visualPlanKind?: string;
  backgroundAssetId?: string;
  backgroundName?: string;
  backgroundType?: 'loop_background';
  aspectRatio?: VideoAspectRatio;
  resolution?: VideoResolution;
  subtitlePosition?: VideoSubtitlePosition;
  fontSize?: number;
  textColor?: string;
  strokeColor?: string;
  shadowEnabled?: boolean;
  safeAreaPreset?: VideoSafeAreaPreset;
  timelineSummary?: string[];
  safeSummary?: string;
}

export interface VideoVisibleTaskDTO {
  id: string;
  taskType: string;
  status: VideoTaskStatusDTO;
  currentStep: string;
  statusNote: string;
  progress: number;
  failureCategory?: string | null;
  retryOfTaskId?: string | null;
  canRetry?: boolean;
  canCancel?: boolean;
}

export function isForbiddenVideoVisibleKey(key: string): boolean {
  return VIDEO_FORBIDDEN_VISIBLE_KEY_PATTERN.test(key);
}

export function sanitizeVideoVisibleText(value: unknown, fallback = '内容已脱敏，仅保留安全摘要。'): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (VIDEO_FORBIDDEN_VISIBLE_TEXT_PATTERN.test(trimmed)) return fallback;
  return trimmed.length > 240 ? `${trimmed.slice(0, 240)}...` : trimmed;
}

export function sanitizeVideoProviderSummary(value: unknown): VideoSafeProviderSummaryDTO {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    provider: sanitizeVideoVisibleText(input.provider, 'unknown-provider'),
    model: sanitizeVideoVisibleText(input.model, 'unknown-model'),
    isMockOutput: input.isMockOutput === true,
    ...(typeof input.safeSummary === 'string'
      ? { safeSummary: sanitizeVideoVisibleText(input.safeSummary, '已保留安全模型摘要。') }
      : {})
  };
}

export function sanitizeVideoArtifactMetadata(value: unknown): VideoSafeArtifactMetadataDTO {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const output: VideoSafeArtifactMetadataDTO = {};

  for (const [key, rawValue] of Object.entries(input)) {
    if (isForbiddenVideoVisibleKey(key)) continue;

    if (key === 'isMockOutput' && typeof rawValue === 'boolean') output.isMockOutput = rawValue;
    if (key === 'candidateRank' && typeof rawValue === 'number') output.candidateRank = rawValue;
    if (key === 'lineLength' && typeof rawValue === 'number') output.lineLength = rawValue;
    if (key === 'fontSize' && typeof rawValue === 'number') output.fontSize = rawValue;
    if (key === 'speed' && typeof rawValue === 'number') output.speed = rawValue;
    if (key === 'volume' && typeof rawValue === 'number') output.volume = rawValue;
    if (key === 'durationSeconds' && typeof rawValue === 'number') output.durationSeconds = rawValue;
    if (key === 'shadowEnabled' && typeof rawValue === 'boolean') output.shadowEnabled = rawValue;
    if (key === 'baseArtifactId' && (typeof rawValue === 'string' || rawValue === null)) output.baseArtifactId = rawValue;
    if (key === 'editReason' && typeof rawValue === 'string') output.editReason = sanitizeVideoVisibleText(rawValue);
    if (key === 'previewKind' && typeof rawValue === 'string') output.previewKind = sanitizeVideoVisibleText(rawValue);
    if (key === 'voiceId' && typeof rawValue === 'string') output.voiceId = sanitizeVideoVisibleText(rawValue);
    if (key === 'voiceName' && typeof rawValue === 'string') output.voiceName = sanitizeVideoVisibleText(rawValue);
    if (key === 'narrationArtifactId' && typeof rawValue === 'string') output.narrationArtifactId = sanitizeVideoVisibleText(rawValue);
    if (key === 'ttsArtifactId' && typeof rawValue === 'string') output.ttsArtifactId = sanitizeVideoVisibleText(rawValue);
    if (key === 'subtitleArtifactId' && typeof rawValue === 'string') output.subtitleArtifactId = sanitizeVideoVisibleText(rawValue);
    if (key === 'visualPlanArtifactId' && typeof rawValue === 'string') output.visualPlanArtifactId = sanitizeVideoVisibleText(rawValue);
    if (key === 'renderVersionId' && typeof rawValue === 'string') output.renderVersionId = sanitizeVideoVisibleText(rawValue);
    if (key === 'visualPlanKind' && typeof rawValue === 'string') output.visualPlanKind = sanitizeVideoVisibleText(rawValue);
    if (key === 'backgroundAssetId' && typeof rawValue === 'string') output.backgroundAssetId = sanitizeVideoVisibleText(rawValue);
    if (key === 'backgroundName' && typeof rawValue === 'string') output.backgroundName = sanitizeVideoVisibleText(rawValue);
    if (key === 'textColor' && typeof rawValue === 'string') output.textColor = sanitizeVideoVisibleText(rawValue);
    if (key === 'strokeColor' && typeof rawValue === 'string') output.strokeColor = sanitizeVideoVisibleText(rawValue);
    if (key === 'safeSummary' && typeof rawValue === 'string') output.safeSummary = sanitizeVideoVisibleText(rawValue);
    if (key === 'emotion' && isVideoTtsEmotion(rawValue)) output.emotion = rawValue;
    if (key === 'subtitleStyle' && isVideoSubtitleStyle(rawValue)) output.subtitleStyle = rawValue;
    if (key === 'format' && rawValue === 'mp4') output.format = rawValue;
    if (key === 'backgroundType' && rawValue === 'loop_background') output.backgroundType = rawValue;
    if (key === 'aspectRatio' && isVideoAspectRatio(rawValue)) output.aspectRatio = rawValue;
    if (key === 'resolution' && isVideoResolution(rawValue)) output.resolution = rawValue;
    if (key === 'subtitlePosition' && isVideoSubtitlePosition(rawValue)) output.subtitlePosition = rawValue;
    if (key === 'safeAreaPreset' && isVideoSafeAreaPreset(rawValue)) output.safeAreaPreset = rawValue;
    if (key === 'timelineSummary' && Array.isArray(rawValue)) {
      output.timelineSummary = rawValue
        .filter((item): item is string => typeof item === 'string')
        .map((item) => sanitizeVideoVisibleText(item))
        .slice(0, 12);
    }
  }

  return output;
}

export function sanitizeVideoVisibleTask<T extends Partial<VideoVisibleTaskDTO>>(value: unknown, fallbackTaskType: string): VideoVisibleTaskDTO | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as T & Record<string, unknown>;
  const failureCategory = typeof input.failureCategory === 'string'
    ? sanitizeVideoVisibleText(input.failureCategory, 'provider_error')
    : input.failureCategory === null
      ? null
      : undefined;
  const status = isVideoTaskStatus(input.status) ? input.status : 'failed';
  const fallbackNote = status === 'failed'
    ? createSafeVideoFailureNote(failureCategory)
    : '任务状态已更新。';

  return {
    id: typeof input.id === 'string' ? sanitizeVideoVisibleText(input.id, 'video-task') : 'video-task',
    taskType: typeof input.taskType === 'string' ? sanitizeVideoVisibleText(input.taskType, fallbackTaskType) : fallbackTaskType,
    status,
    currentStep: sanitizeVideoVisibleText(input.currentStep, '等待处理'),
    statusNote: sanitizeVideoVisibleText(input.statusNote, fallbackNote),
    progress: typeof input.progress === 'number' ? Math.min(100, Math.max(0, input.progress)) : 0,
    ...(failureCategory !== undefined ? { failureCategory } : {}),
    ...(typeof input.retryOfTaskId === 'string' ? { retryOfTaskId: sanitizeVideoVisibleText(input.retryOfTaskId, 'retry-task') } : {}),
    ...(typeof input.canRetry === 'boolean' ? { canRetry: input.canRetry } : {}),
    ...(typeof input.canCancel === 'boolean' ? { canCancel: input.canCancel } : {})
  };
}

function createSafeVideoFailureNote(failureCategory?: string | null): string {
  if (failureCategory === 'timeout') return '生成超时，当前产物未受影响，可以稍后重试。';
  if (failureCategory === 'rate_limited') return '模型或本地生成服务繁忙，当前产物未受影响，可以稍后重试。';
  if (failureCategory === 'quota_insufficient') return '模型额度不足，当前产物未受影响，请检查配置后重试。';
  if (failureCategory === 'output_parse_failed') return '生成结果格式不符合要求，当前产物未受影响，可以重试。';
  if (failureCategory === 'user_cancelled') return '任务已取消，未写入当前产物。';
  return '生成服务返回异常，当前产物未受影响，可以稍后重试。';
}

function isVideoTaskStatus(value: unknown): value is VideoTaskStatusDTO {
  return value === 'queued' || value === 'processing' || value === 'completed' || value === 'failed' || value === 'cancelled';
}

function isVideoSubtitleStyle(value: unknown): value is VideoSubtitleStyle {
  return value === 'compact' || value === 'balanced' || value === 'dramatic';
}

function isVideoTtsEmotion(value: unknown): value is VideoTtsEmotion {
  return value === 'calm' || value === 'suspense' || value === 'excited' || value === 'warm';
}

function isVideoAspectRatio(value: unknown): value is VideoAspectRatio {
  return value === '9:16' || value === '16:9' || value === '1:1';
}

function isVideoResolution(value: unknown): value is VideoResolution {
  return value === '720x1280' || value === '1080x1920' || value === '1920x1080';
}

function isVideoSubtitlePosition(value: unknown): value is VideoSubtitlePosition {
  return value === 'bottom_safe' || value === 'middle' || value === 'top_safe';
}

function isVideoSafeAreaPreset(value: unknown): value is VideoSafeAreaPreset {
  return value === 'douyin_safe' || value === 'kuaishou_safe' || value === 'wide_safe';
}

export interface VideoReadySourceDTO {
  novelId: string;
  title: string;
  creationStage: 'video_ready';
  videoReadinessSnapshotId: string;
  snapshotStatus: string;
  chapterCount: number;
  totalWordCount: number;
  firstVideoSuggestion: {
    chapterRangeText: string;
    chapterIds: string[];
    title: string;
  };
  updatedAt: string;
}

export type VideoReadySourceListDTO = PagedResult<VideoReadySourceDTO>;

export interface VideoProjectDTO {
  id: string;
  title: string;
  projectType: VideoProjectType;
  novelId: string;
  novelTitle: string;
  lifecycleStatus: VideoLifecycleStatus;
  referenceStatus: VideoReferenceStatus;
  productionStatus: VideoProductionStatus;
  chapterRangeText: string;
  chapterCount: number;
  currentVideoReferenceId: string;
  defaultVideoUnitId: string;
  updatedAt: string;
}

export type VideoProjectListDTO = PagedResult<VideoProjectDTO>;

export interface CreateVideoProjectRequest {
  idempotencyToken: string;
  novelId: string;
  videoReadinessSnapshotId: string;
  title: string;
  projectType: VideoProjectType;
  chapterRange: {
    mode: 'first_recommended' | 'custom';
    chapterIds: string[];
  };
  duplicatePolicy?: 'return_existing' | 'create_distinct';
}

export interface VideoProjectActionResultDTO {
  project: VideoProjectDTO;
  reusedExisting: boolean;
  reference: VideoReferenceDetailDTO;
}

export interface VideoReferenceChapterSnapshotDTO {
  chapterId: string;
  chapterNo: number;
  chapterTitle: string;
  contentVersionId: string;
  wordCount: number;
  summary: string;
  riskLevel: string;
}

export interface VideoReferenceIssueDTO {
  id: string;
  issueLevel: VideoIssueLevel;
  issueType: string;
  issueReason: string;
  status: 'open' | 'resolved' | 'ignored';
  affectedChapterIds: string[];
  resolutionAction: VideoIssueAction | null;
  resolutionReason: string | null;
}

export interface VideoReferenceDetailDTO {
  project: VideoProjectDTO;
  referenceId: string;
  versionNo: number;
  status: VideoReferenceStatus;
  chapterRangeText: string;
  chapterCount: number;
  referenceSummary: string;
  chapters: VideoReferenceChapterSnapshotDTO[];
  issues: VideoReferenceIssueDTO[];
  nextAction: {
    label: string;
    disabled: boolean;
    disabledReason: string | null;
  };
}

export interface RecheckVideoReferenceRequest {
  idempotencyToken: string;
  expectedReferenceVersion: number;
}

export interface ResolveVideoReferenceIssueRequest {
  idempotencyToken: string;
  action: Exclude<VideoIssueAction, 'return_to_novel'>;
  reason: string;
}

export interface StopVideoProjectRequest {
  idempotencyToken: string;
  reason: string;
}

export interface VideoNarrationSourceVersionRefsDTO {
  videoReferenceId: string;
  videoReferenceVersion: number;
  videoUnitId: string;
  videoReadinessSnapshotId: string;
  chapterContentVersionIds: string[];
}

export type VideoNarrationProviderSummaryDTO = VideoSafeProviderSummaryDTO;

export interface VideoNarrationArtifactDTO {
  id: string;
  artifactType: 'narration_script';
  status: VideoNarrationArtifactStatus;
  versionNo: number;
  isCurrent: boolean;
  contentText: string;
  hook: string;
  firstScreenSubtitle: string;
  endingHook: string;
  estimatedDurationSeconds: number;
  wordCount: number;
  riskTags: string[];
  recommendationReason: string;
  score: number;
  qualitySummary: string;
  sourceVersionRefs: VideoNarrationSourceVersionRefsDTO;
  providerSummary: VideoNarrationProviderSummaryDTO;
  providerRouteId: string;
  strategyVersion: string;
  qualityMode: VideoNarrationQualityMode;
  metadata: VideoSafeArtifactMetadataDTO;
  rejectedReason: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface VideoNarrationTaskDTO {
  id: string;
  taskType: 'video_narration_generate';
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  currentStep: string;
  statusNote: string;
  progress: number;
  failureCategory?: string | null;
  retryOfTaskId?: string | null;
  canRetry?: boolean;
  canCancel?: boolean;
}

export interface VideoNarrationListDTO {
  current: VideoNarrationArtifactDTO | null;
  candidates: VideoNarrationArtifactDTO[];
  drafts: VideoNarrationArtifactDTO[];
  history: VideoNarrationArtifactDTO[];
  activeTask: VideoNarrationTaskDTO | null;
}

export interface GenerateVideoNarrationRequest {
  idempotencyToken: string;
  expectedReferenceVersion: number;
  videoUnitId: string;
  candidateCount?: number;
  qualityMode?: VideoNarrationQualityMode;
  retryOfTaskId?: string;
  mockTaskOutcome?: VideoNarrationMockTaskOutcome;
}

export interface GenerateVideoNarrationResultDTO {
  task: VideoNarrationTaskDTO;
  artifacts: VideoNarrationArtifactDTO[];
  current: VideoNarrationArtifactDTO | null;
}

export interface SaveVideoNarrationDraftRequest {
  idempotencyToken: string;
  baseArtifactId?: string;
  contentText: string;
  hook: string;
  firstScreenSubtitle: string;
  endingHook: string;
  reason: string;
}

export interface SaveVideoNarrationDraftResultDTO {
  artifact: VideoNarrationArtifactDTO;
  narrations: VideoNarrationListDTO;
}

export interface ConfirmVideoNarrationRequest {
  idempotencyToken: string;
  expectedVersionNo: number;
  riskContinueReason?: string;
}

export interface ConfirmVideoNarrationResultDTO {
  current: VideoNarrationArtifactDTO;
  narrations: VideoNarrationListDTO;
}

export interface RejectVideoNarrationRequest {
  idempotencyToken: string;
  reason: string;
}

export interface RejectVideoNarrationResultDTO {
  artifact: VideoNarrationArtifactDTO;
  narrations: VideoNarrationListDTO;
}

export interface VideoTtsSourceVersionRefsDTO extends VideoNarrationSourceVersionRefsDTO {
  narrationArtifactId: string;
  narrationVersionNo: number;
}

export interface VideoTtsArtifactDTO {
  id: string;
  artifactType: 'tts_audio';
  status: VideoTtsArtifactStatus;
  versionNo: number;
  isCurrent: boolean;
  voiceId: string;
  voiceName: string;
  speed: number;
  emotion: VideoTtsEmotion;
  volume: number;
  durationSeconds: number;
  fileKey: string;
  previewUrl: string;
  riskTags: string[];
  recommendationReason: string;
  qualitySummary: string;
  sourceVersionRefs: VideoTtsSourceVersionRefsDTO;
  providerSummary: VideoNarrationProviderSummaryDTO;
  providerRouteId: string;
  strategyVersion: string;
  qualityMode: VideoTtsQualityMode;
  metadata: VideoSafeArtifactMetadataDTO;
  rejectedReason: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface VideoTtsTaskDTO {
  id: string;
  taskType: 'video_tts_generate';
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  currentStep: string;
  statusNote: string;
  progress: number;
  failureCategory?: string | null;
  retryOfTaskId?: string | null;
  canRetry?: boolean;
  canCancel?: boolean;
}

export interface VideoTtsListDTO {
  current: VideoTtsArtifactDTO | null;
  candidates: VideoTtsArtifactDTO[];
  history: VideoTtsArtifactDTO[];
  activeTask: VideoTtsTaskDTO | null;
}

export interface GenerateVideoTtsRequest {
  idempotencyToken: string;
  expectedReferenceVersion: number;
  videoUnitId: string;
  narrationArtifactId: string;
  expectedNarrationVersionNo: number;
  voiceId: string;
  voiceName?: string;
  speed: number;
  emotion: VideoTtsEmotion;
  volume: number;
  qualityMode?: VideoTtsQualityMode;
  retryOfTaskId?: string;
  mockTaskOutcome?: VideoTtsMockTaskOutcome;
}

export interface GenerateVideoTtsResultDTO {
  task: VideoTtsTaskDTO;
  artifacts: VideoTtsArtifactDTO[];
  current: VideoTtsArtifactDTO | null;
}

export interface ConfirmVideoTtsRequest {
  idempotencyToken: string;
  expectedVersionNo: number;
}

export interface ConfirmVideoTtsResultDTO {
  current: VideoTtsArtifactDTO;
  tts: VideoTtsListDTO;
}

export interface RejectVideoTtsRequest {
  idempotencyToken: string;
  reason: string;
}

export interface RejectVideoTtsResultDTO {
  artifact: VideoTtsArtifactDTO;
  tts: VideoTtsListDTO;
}

export interface VideoSubtitleSourceVersionRefsDTO extends VideoTtsSourceVersionRefsDTO {
  ttsArtifactId: string;
  ttsVersionNo: number;
}

export interface VideoSubtitleArtifactDTO {
  id: string;
  artifactType: 'subtitle';
  status: VideoSubtitleArtifactStatus;
  versionNo: number;
  isCurrent: boolean;
  contentText: string;
  firstScreenSubtitle: string;
  timelineSummary: string[];
  estimatedDurationSeconds: number;
  lineCount: number;
  wordCount: number;
  riskTags: string[];
  recommendationReason: string;
  score: number;
  qualitySummary: string;
  sourceVersionRefs: VideoSubtitleSourceVersionRefsDTO;
  providerSummary: VideoNarrationProviderSummaryDTO;
  providerRouteId: string;
  strategyVersion: string;
  qualityMode: VideoSubtitleQualityMode;
  subtitleStyle: VideoSubtitleStyle;
  lineLength: number;
  metadata: VideoSafeArtifactMetadataDTO;
  rejectedReason: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface VideoSubtitleTaskDTO {
  id: string;
  taskType: 'video_subtitle_generate';
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  currentStep: string;
  statusNote: string;
  progress: number;
  failureCategory?: string | null;
  retryOfTaskId?: string | null;
  canRetry?: boolean;
  canCancel?: boolean;
}

export interface VideoSubtitleListDTO {
  current: VideoSubtitleArtifactDTO | null;
  candidates: VideoSubtitleArtifactDTO[];
  drafts: VideoSubtitleArtifactDTO[];
  history: VideoSubtitleArtifactDTO[];
  activeTask: VideoSubtitleTaskDTO | null;
}

export interface GenerateVideoSubtitleRequest {
  idempotencyToken: string;
  expectedReferenceVersion: number;
  videoUnitId: string;
  ttsArtifactId: string;
  expectedTtsVersionNo: number;
  subtitleStyle?: VideoSubtitleStyle;
  lineLength?: number;
  qualityMode?: VideoSubtitleQualityMode;
  retryOfTaskId?: string;
  mockTaskOutcome?: VideoSubtitleMockTaskOutcome;
}

export interface GenerateVideoSubtitleResultDTO {
  task: VideoSubtitleTaskDTO;
  artifacts: VideoSubtitleArtifactDTO[];
  current: VideoSubtitleArtifactDTO | null;
}

export interface SaveVideoSubtitleDraftRequest {
  idempotencyToken: string;
  baseArtifactId?: string;
  contentText: string;
  firstScreenSubtitle: string;
  reason: string;
}

export interface SaveVideoSubtitleDraftResultDTO {
  artifact: VideoSubtitleArtifactDTO;
  subtitles: VideoSubtitleListDTO;
}

export interface ConfirmVideoSubtitleRequest {
  idempotencyToken: string;
  expectedVersionNo: number;
}

export interface ConfirmVideoSubtitleResultDTO {
  current: VideoSubtitleArtifactDTO;
  subtitles: VideoSubtitleListDTO;
}

export interface RejectVideoSubtitleRequest {
  idempotencyToken: string;
  reason: string;
}

export interface RejectVideoSubtitleResultDTO {
  artifact: VideoSubtitleArtifactDTO;
  subtitles: VideoSubtitleListDTO;
}

export interface VideoVisualPlanSourceVersionRefsDTO extends VideoSubtitleSourceVersionRefsDTO {
  subtitleArtifactId: string;
  subtitleVersionNo: number;
}

export interface VideoVisualPlanArtifactDTO {
  id: string;
  artifactType: 'visual_plan';
  status: VideoVisualPlanStatus;
  versionNo: number;
  isCurrent: boolean;
  backgroundAssetId: string;
  backgroundName: string;
  backgroundType: 'loop_background';
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
  subtitlePosition: VideoSubtitlePosition;
  fontSize: number;
  textColor: string;
  strokeColor: string;
  shadowEnabled: boolean;
  safeAreaPreset: VideoSafeAreaPreset;
  riskTags: string[];
  recommendationReason: string;
  qualitySummary: string;
  sourceVersionRefs: VideoVisualPlanSourceVersionRefsDTO;
  providerSummary: VideoNarrationProviderSummaryDTO;
  providerRouteId: string;
  strategyVersion: string;
  qualityMode: VideoNarrationQualityMode;
  metadata: VideoSafeArtifactMetadataDTO;
  rejectedReason: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface SaveVideoVisualPlanRequest {
  idempotencyToken: string;
  expectedReferenceVersion: number;
  videoUnitId: string;
  subtitleArtifactId: string;
  expectedSubtitleVersionNo: number;
  backgroundAssetId: string;
  backgroundName?: string;
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
  subtitlePosition: VideoSubtitlePosition;
  fontSize: number;
  textColor: string;
  strokeColor: string;
  shadowEnabled: boolean;
  safeAreaPreset: VideoSafeAreaPreset;
  qualityMode?: VideoNarrationQualityMode;
}

export interface ConfirmVideoVisualPlanRequest {
  idempotencyToken: string;
  expectedVersionNo: number;
}

export interface RejectVideoVisualPlanRequest {
  idempotencyToken: string;
  reason: string;
}

export interface VideoVisualPlanListDTO {
  current: VideoVisualPlanArtifactDTO | null;
  candidates: VideoVisualPlanArtifactDTO[];
  history: VideoVisualPlanArtifactDTO[];
}

export interface SaveVideoVisualPlanResultDTO {
  artifact: VideoVisualPlanArtifactDTO;
  visualPlans: VideoVisualPlanListDTO;
}

export interface ConfirmVideoVisualPlanResultDTO {
  current: VideoVisualPlanArtifactDTO;
  visualPlans: VideoVisualPlanListDTO;
}

export interface RejectVideoVisualPlanResultDTO {
  artifact: VideoVisualPlanArtifactDTO;
  visualPlans: VideoVisualPlanListDTO;
}

export interface VideoRenderSourceVersionRefsDTO extends VideoVisualPlanSourceVersionRefsDTO {
  visualPlanArtifactId: string;
  visualPlanVersionNo: number;
}

export interface VideoRenderDTO {
  id: string;
  versionNo: number;
  status: VideoRenderStatus;
  isCurrent: boolean;
  previewStatus: VideoRenderPreviewStatus;
  previewUrl: string;
  fileKey: string;
  durationSeconds: number;
  renderMode: 'mock_loop_background';
  qualityMode: VideoNarrationQualityMode;
  qualityIssues: string[];
  safeSummary: string;
  providerSummary: VideoNarrationProviderSummaryDTO;
  providerRouteId: string;
  strategyVersion: string;
  sourceVersionRefs: VideoRenderSourceVersionRefsDTO;
  rejectedReason: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface VideoRenderTaskDTO {
  id: string;
  taskType: 'video_render_generate';
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  currentStep: string;
  statusNote: string;
  progress: number;
  failureCategory?: string | null;
  retryOfTaskId?: string | null;
  canRetry?: boolean;
  canCancel?: boolean;
}

export interface VideoRenderListDTO {
  current: VideoRenderDTO | null;
  candidates: VideoRenderDTO[];
  history: VideoRenderDTO[];
  activeTask: VideoRenderTaskDTO | null;
}

export interface GenerateVideoRenderRequest {
  idempotencyToken: string;
  expectedReferenceVersion: number;
  videoUnitId: string;
  visualPlanArtifactId: string;
  expectedVisualPlanVersionNo: number;
  qualityMode?: VideoNarrationQualityMode;
  retryOfTaskId?: string;
  mockTaskOutcome?: VideoRenderMockTaskOutcome;
}

export interface GenerateVideoRenderResultDTO {
  task: VideoRenderTaskDTO;
  renders: VideoRenderDTO[];
  current: VideoRenderDTO | null;
}

export interface ConfirmVideoRenderRequest {
  idempotencyToken: string;
  expectedVersionNo: number;
}

export interface RejectVideoRenderRequest {
  idempotencyToken: string;
  reason: string;
}

export interface ConfirmVideoRenderResultDTO {
  current: VideoRenderDTO;
  renders: VideoRenderListDTO;
}

export interface RejectVideoRenderResultDTO {
  render: VideoRenderDTO;
  renders: VideoRenderListDTO;
}

export interface VideoExportDTO {
  id: string;
  status: VideoExportStatus;
  fileKey: string;
  downloadUrl: string;
  fileName: string;
  renderVersionId: string;
  renderVersionNo: number;
  safeSummary: string;
  createdAt: string;
}

export interface VideoExportListDTO {
  current: VideoExportDTO | null;
  history: VideoExportDTO[];
}

export interface CreateVideoExportRequest {
  idempotencyToken: string;
  renderVersionId: string;
  expectedRenderVersionNo: number;
  fileName?: string;
  format?: 'mp4';
}

export interface CreateVideoExportResultDTO {
  exportRecord: VideoExportDTO;
  exports: VideoExportListDTO;
}

export interface VideoUnitDTO {
  id: string;
  unitNo: number;
  unitType: 'first_test';
  title: string;
  chapterRangeText: string;
  chapterIds: string[];
  status: 'reference_ready';
  productionStatus: VideoProductionStatus;
}

export interface VideoWorkbenchStepDTO {
  key: VideoWorkbenchStepKey;
  label: string;
  status: VideoWorkbenchStepStatus;
  description: string;
  lockedReason: string | null;
  unlockPackage?: 'P9a' | 'P9b' | 'P9c' | 'P9d' | 'P9e';
}

export interface VideoWorkbenchRecommendedActionDTO {
  label: string;
  stepKey: VideoWorkbenchStepKey;
  disabled: boolean;
  reason: string;
}

export interface VideoWorkbenchDependencyRefsDTO {
  videoReferenceId: string;
  videoReferenceVersion: number;
  videoUnitId: string;
  chapterContentVersionIds: string[];
}

export interface VideoWorkbenchRiskDTO {
  level: VideoIssueLevel;
  message: string;
  actionLabel: string;
}

export interface VideoArtifactPlaceholderDTO {
  type: VideoArtifactType;
  label: string;
  status: 'not_started' | 'locked' | 'candidate_ready' | 'confirmed' | 'stale';
  currentVersionId: string | null;
  unlockPackage: 'P9b' | 'P9c' | 'P9d' | 'P9e';
}

export interface VideoRenderPlaceholderDTO {
  status: 'locked' | 'not_started' | 'candidate_ready' | 'confirmed';
  currentRenderId: string | null;
  lockedReason: string | null;
}

export interface VideoExportPlaceholderDTO {
  status: 'locked' | 'not_started' | 'created';
  currentExportId: string | null;
  lockedReason: string | null;
}

export interface VideoWorkbenchDTO {
  project: VideoProjectDTO;
  reference: VideoReferenceDetailDTO;
  defaultUnit: VideoUnitDTO;
  recommendedAction: VideoWorkbenchRecommendedActionDTO;
  steps: VideoWorkbenchStepDTO[];
  dependencyRefs: VideoWorkbenchDependencyRefsDTO;
  risks: VideoWorkbenchRiskDTO[];
  artifacts: {
    placeholders: VideoArtifactPlaceholderDTO[];
    narration: VideoNarrationListDTO;
    tts: VideoTtsListDTO;
    subtitle: VideoSubtitleListDTO;
    visualPlan: VideoVisualPlanListDTO;
    renders: VideoRenderListDTO;
    exports: VideoExportListDTO;
    render: VideoRenderPlaceholderDTO;
    export: VideoExportPlaceholderDTO;
  };
  recentTasks: Array<{
    id: string;
    taskType: string;
    status: string;
    statusNote: string;
    currentStep?: string;
    progress?: number;
    failureCategory?: string | null;
    retryOfTaskId?: string | null;
    canRetry?: boolean;
    canCancel?: boolean;
  }>;
  operationRecords: Array<{
    id: string;
    action: string;
    reason: string | null;
    createdAt: string;
  }>;
}

export type VideoPublishPlatform =
  | 'douyin'
  | 'kuaishou'
  | 'xiaohongshu'
  | 'bilibili'
  | 'wechat_channels'
  | 'tiktok'
  | 'youtube'
  | 'other';

export type VideoPublishMethod = 'manual_record';
export type VideoPublishStatus = 'active' | 'withdrawn' | 'superseded';
export type VideoMetricWindowType = 'h24' | 'h48';
export type VideoMetricBackfillPersistentStatus = 'pending' | 'completed' | 'waived';
export type VideoMetricBackfillDisplayStatus = 'waiting' | 'due' | 'overdue' | 'completed' | 'waived';
export type VideoMetricDataSource = 'manual';
export type VideoMetricSampleSizeLevel = 'insufficient' | 'normal';
export type VideoMetricSubjectiveRating = 'good' | 'average' | 'bad' | 'insufficient';
export type VideoPublishNextDecision = 'continue' | 'optimize_title' | 'optimize_narration' | 'change_chapter' | 'redo_video' | 'pause_project';
export type VideoPublishDecisionConfidence = 'low' | 'normal';
export type VideoPublishingAggregateStatus =
  | 'exported_unpublished'
  | 'published_waiting_24h'
  | 'published_24h_overdue'
  | 'published_waiting_48h'
  | 'published_48h_overdue'
  | 'data_incomplete'
  | 'sample_insufficient'
  | 'decision_recorded'
  | 'version_stale_after_publish';
export type VideoPublishingRecommendedActionType =
  | 'register_publish'
  | 'fill_24h_metrics'
  | 'fill_48h_metrics'
  | 'view_overdue'
  | 'mark_sample_insufficient'
  | 'record_next_decision'
  | 'view_publish_records';

export const VIDEO_PUBLISH_PLATFORMS: readonly VideoPublishPlatform[] = [
  'douyin',
  'kuaishou',
  'xiaohongshu',
  'bilibili',
  'wechat_channels',
  'tiktok',
  'youtube',
  'other'
] as const;

export const VIDEO_PUBLISH_METHODS: readonly VideoPublishMethod[] = ['manual_record'] as const;
export const VIDEO_PUBLISH_STATUSES: readonly VideoPublishStatus[] = ['active', 'withdrawn', 'superseded'] as const;
export const VIDEO_METRIC_WINDOW_TYPES: readonly VideoMetricWindowType[] = ['h24', 'h48'] as const;
export const VIDEO_METRIC_BACKFILL_PERSISTENT_STATUSES: readonly VideoMetricBackfillPersistentStatus[] = ['pending', 'completed', 'waived'] as const;
export const VIDEO_METRIC_BACKFILL_DISPLAY_STATUSES: readonly VideoMetricBackfillDisplayStatus[] = [
  'waiting',
  'due',
  'overdue',
  'completed',
  'waived'
] as const;
export const VIDEO_METRIC_SAMPLE_SIZE_LEVELS: readonly VideoMetricSampleSizeLevel[] = ['insufficient', 'normal'] as const;
export const VIDEO_METRIC_SUBJECTIVE_RATINGS: readonly VideoMetricSubjectiveRating[] = ['good', 'average', 'bad', 'insufficient'] as const;
export const VIDEO_PUBLISH_NEXT_DECISIONS: readonly VideoPublishNextDecision[] = [
  'continue',
  'optimize_title',
  'optimize_narration',
  'change_chapter',
  'redo_video',
  'pause_project'
] as const;
export const VIDEO_PUBLISH_DECISION_CONFIDENCES: readonly VideoPublishDecisionConfidence[] = ['low', 'normal'] as const;
export const VIDEO_PUBLISHING_AGGREGATE_STATUSES: readonly VideoPublishingAggregateStatus[] = [
  'exported_unpublished',
  'published_waiting_24h',
  'published_24h_overdue',
  'published_waiting_48h',
  'published_48h_overdue',
  'data_incomplete',
  'sample_insufficient',
  'decision_recorded',
  'version_stale_after_publish'
] as const;
export const VIDEO_PUBLISHING_RECOMMENDED_ACTION_TYPES: readonly VideoPublishingRecommendedActionType[] = [
  'register_publish',
  'fill_24h_metrics',
  'fill_48h_metrics',
  'view_overdue',
  'mark_sample_insufficient',
  'record_next_decision',
  'view_publish_records'
] as const;

export const VIDEO_PUBLISH_TEXT_LIMITS = {
  platformAccountLabel: 120,
  platformWorkId: 160,
  platformUrl: 500,
  publishTitle: 120,
  publishCaption: 2000,
  notes: 1000,
  decisionReason: 1000,
  withdrawReason: 1000,
  correctionReason: 1000,
  safeSummary: 500
} as const;

export const VIDEO_PUBLISH_FORBIDDEN_FIELD_PATTERN =
  /credential|credentials|token|cookie|auth|authorization|apikey|api_key|secret|password|session/i;

export const VIDEO_PUBLISH_FORBIDDEN_TEXT_PATTERN =
  /(sk-[A-Za-z0-9_-]{8,}|api[_-]?key|bearer\s+[A-Za-z0-9._-]+|cookie\s*[:=]|token\s*[:=]|secret\s*[:=]|authorization\s*[:=]|database_url|mysql:\/\/|postgres:\/\/|prompt\s*[:：]|raw\s+(?:response|payload)|provider\s+(?:response|payload))/i;

export interface VideoVersionRefDTO {
  id: string;
  versionNo: number;
}

export interface VideoPublishSourceVersionRefsDTO {
  videoReference: VideoVersionRefDTO;
  videoUnit: {
    id: string;
    unitNo: number;
    versionNo: number;
  };
  export: VideoVersionRefDTO;
  render: VideoVersionRefDTO;
  narration: VideoVersionRefDTO;
  tts: VideoVersionRefDTO;
  subtitle: VideoVersionRefDTO;
  visualPlan: VideoVersionRefDTO;
  chapters: Array<{
    chapterId: string;
    chapterNo: number;
    contentVersionId: string;
    contentVersionNo: number;
  }>;
}

export interface VideoPublishFreezeSnapshotDTO {
  id: string;
  publishRecordId: string;
  exportId: string;
  renderId: string;
  narrationArtifactId: string;
  ttsArtifactId: string;
  subtitleArtifactId: string;
  visualPlanArtifactId: string;
  fileName: string;
  fileKey: string;
  titleHook: string;
  firstThreeSecondVoiceover: string;
  firstScreenSubtitle: string;
  endingSuspense: string;
  chapterRangeText: string;
  riskSummary: string;
  sourceVersionRefs: VideoPublishSourceVersionRefsDTO;
  createdAt: string;
}

export interface VideoPublishRecordDTO {
  id: string;
  versionNo: number;
  tenantId: string;
  videoProjectId: string;
  videoUnitId: string;
  videoReferenceId: string;
  exportId: string;
  renderId: string;
  freezeSnapshotId: string;
  platform: VideoPublishPlatform;
  platformAccountLabel: string;
  platformWorkId: string | null;
  platformUrl: string | null;
  platformUrlDisplay: string | null;
  publishedAt: string;
  publishTitle: string;
  publishCaption: string | null;
  notes: string | null;
  publishMethod: VideoPublishMethod;
  status: VideoPublishStatus;
  sourceVersionRefs: VideoPublishSourceVersionRefsDTO;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VideoMetricBackfillNodeDTO {
  id: string;
  versionNo: number;
  publishRecordId: string;
  windowType: VideoMetricWindowType;
  dueAt: string;
  overdueAt: string;
  persistentStatus: VideoMetricBackfillPersistentStatus;
  displayStatus: VideoMetricBackfillDisplayStatus;
  completedAt: string | null;
  waivedReason: string | null;
}

export interface PlatformMetricSnapshotDTO {
  id: string;
  publishRecordId: string;
  backfillNodeId: string;
  windowType: VideoMetricWindowType;
  versionNo: number;
  isCurrent: boolean;
  collectedAt: string;
  dataSource: VideoMetricDataSource;
  playCount: number | null;
  completionRate: number | null;
  avgWatchSeconds: number | null;
  likeCount: number | null;
  commentCount: number | null;
  favoriteCount: number | null;
  shareCount: number | null;
  followerGain: number | null;
  sampleSizeLevel: VideoMetricSampleSizeLevel;
  subjectiveRating: VideoMetricSubjectiveRating;
  notes: string | null;
  correctionReason: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface VideoPublishDecisionRecordDTO {
  id: string;
  publishRecordId: string;
  nextDecision: VideoPublishNextDecision;
  reason: string;
  confidence: VideoPublishDecisionConfidence;
  sourceMetricSnapshotIds: string[];
  createdBy: string | null;
  createdAt: string;
}

export interface VideoPublishAuditSafeSummaryDTO {
  publishStatus?: VideoPublishStatus | null;
  platform?: VideoPublishPlatform | null;
  platformAccountLabel?: string | null;
  platformWorkId?: string | null;
  platformUrlDisplay?: string | null;
  publishedAt?: string | null;
  publishTitle?: string | null;
  metricWindowType?: VideoMetricWindowType | null;
  metricPersistentStatus?: VideoMetricBackfillPersistentStatus | null;
  metricDisplayStatus?: VideoMetricBackfillDisplayStatus | null;
  sampleSizeLevel?: VideoMetricSampleSizeLevel | null;
  subjectiveRating?: VideoMetricSubjectiveRating | null;
  nextDecision?: VideoPublishNextDecision | null;
  confidence?: VideoPublishDecisionConfidence | null;
  publishRecordVersionNo?: number | null;
  backfillNodeVersionNo?: number | null;
  metricSnapshotVersionNo?: number | null;
  decisionRecordId?: string | null;
}

export interface VideoPublishAuditSummaryDTO {
  id: string;
  action:
    | 'publish_record_create'
    | 'publish_record_correct'
    | 'publish_record_withdraw'
    | 'metric_snapshot_create'
    | 'metric_snapshot_correct'
    | 'sample_insufficient_mark'
    | 'publish_decision_record';
  objectType: 'video_publish_record' | 'video_metric_backfill_node' | 'platform_metric_snapshot' | 'video_publish_decision';
  objectId: string;
  reason: string | null;
  beforeSummary: VideoPublishAuditSafeSummaryDTO;
  afterSummary: VideoPublishAuditSafeSummaryDTO;
  sourceVersionRefs: VideoPublishSourceVersionRefsDTO | null;
  createdBy: string | null;
  createdAt: string;
}

export interface VideoPublishingRecommendedActionDTO {
  type: VideoPublishingRecommendedActionType;
  label: string;
  reason: string;
  disabled: boolean;
  disabledReason: string | null;
  target: 'publish_drawer' | 'metrics_drawer' | 'decision_drawer' | 'detail' | 'disabled';
}

export interface VideoPublishingOverviewDTO {
  aggregateStatus: VideoPublishingAggregateStatus;
  aggregateStatusText: string;
  recommendedAction: VideoPublishingRecommendedActionDTO;
  publishRecords: VideoPublishRecordDTO[];
  metricNodes: VideoMetricBackfillNodeDTO[];
  latestMetricSnapshots: PlatformMetricSnapshotDTO[];
  latestDecision: VideoPublishDecisionRecordDTO | null;
}

export interface CreateVideoPublishRecordRequest {
  idempotencyToken: string;
  videoUnitId: string;
  expectedReferenceVersion: number;
  exportId: string;
  expectedExportVersionNo: number;
  renderId: string;
  expectedRenderVersionNo: number;
  platform: VideoPublishPlatform;
  platformAccountLabel: string;
  platformWorkId?: string | null;
  platformUrl?: string | null;
  publishedAt: string;
  publishTitle: string;
  publishCaption?: string | null;
  notes?: string | null;
}

export interface CreateVideoPublishRecordResultDTO {
  publishRecord: VideoPublishRecordDTO;
  freezeSnapshot: VideoPublishFreezeSnapshotDTO;
  metricNodes: VideoMetricBackfillNodeDTO[];
  reusedExisting: boolean;
}

export interface CorrectVideoPublishRecordRequest {
  idempotencyToken: string;
  expectedVersionNo: number;
  reason: string;
  platformAccountLabel?: string;
  platformWorkId?: string | null;
  platformUrl?: string | null;
  publishedAt?: string;
  publishTitle?: string;
  publishCaption?: string | null;
  notes?: string | null;
}

export interface CorrectVideoPublishRecordResultDTO {
  publishRecord: VideoPublishRecordDTO;
  audit: VideoPublishAuditSummaryDTO;
}

export interface WithdrawVideoPublishRecordRequest {
  idempotencyToken: string;
  expectedVersionNo: number;
  reason: string;
}

export interface WithdrawVideoPublishRecordResultDTO {
  publishRecord: VideoPublishRecordDTO;
  audit: VideoPublishAuditSummaryDTO;
}

export interface CreatePlatformMetricSnapshotRequest {
  idempotencyToken: string;
  backfillNodeId: string;
  expectedBackfillNodeVersionNo: number;
  windowType: VideoMetricWindowType;
  collectedAt: string;
  playCount?: number | null;
  completionRate?: number | null;
  avgWatchSeconds?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  favoriteCount?: number | null;
  shareCount?: number | null;
  followerGain?: number | null;
  sampleSizeLevel: VideoMetricSampleSizeLevel;
  subjectiveRating: VideoMetricSubjectiveRating;
  notes?: string | null;
  correctionReason?: string | null;
}

export interface CreatePlatformMetricSnapshotResultDTO {
  snapshot: PlatformMetricSnapshotDTO;
  backfillNode: VideoMetricBackfillNodeDTO;
  audit: VideoPublishAuditSummaryDTO;
}

export interface RecordVideoPublishDecisionRequest {
  idempotencyToken: string;
  nextDecision: VideoPublishNextDecision;
  reason: string;
  confidence: VideoPublishDecisionConfidence;
  sourceMetricSnapshotIds: string[];
}

export interface RecordVideoPublishDecisionResultDTO {
  decision: VideoPublishDecisionRecordDTO;
  audit: VideoPublishAuditSummaryDTO;
}

export function deriveVideoMetricBackfillDisplayStatus(input: {
  persistentStatus: VideoMetricBackfillPersistentStatus;
  dueAt: string | Date;
  overdueAt: string | Date;
  now: string | Date;
}): VideoMetricBackfillDisplayStatus {
  if (input.persistentStatus === 'completed') return 'completed';
  if (input.persistentStatus === 'waived') return 'waived';

  const dueAt = parsePublishDate(input.dueAt, 'dueAt');
  const overdueAt = parsePublishDate(input.overdueAt, 'overdueAt');
  const now = parsePublishDate(input.now, 'now');

  if (overdueAt.getTime() < dueAt.getTime()) {
    throw new RangeError('overdueAt must be greater than or equal to dueAt');
  }

  if (now.getTime() < dueAt.getTime()) return 'waiting';
  if (now.getTime() < overdueAt.getTime()) return 'due';
  return 'overdue';
}

export function sanitizeVideoPublishVisibleText(
  value: unknown,
  maxLength: number = VIDEO_PUBLISH_TEXT_LIMITS.safeSummary,
  fallback = ''
): string {
  if (typeof value !== 'string') return fallback;
  const withoutControls = value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!withoutControls) return fallback;
  if (VIDEO_PUBLISH_FORBIDDEN_TEXT_PATTERN.test(withoutControls)) return fallback;
  return withoutControls.length > maxLength ? withoutControls.slice(0, maxLength) : withoutControls;
}

export function sanitizeVideoPublishUrlForDisplay(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length > VIDEO_PUBLISH_TEXT_LIMITS.platformUrl) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

export function sanitizeVideoPublishAuditSummary(input: unknown): VideoPublishAuditSafeSummaryDTO {
  if (!input || typeof input !== 'object') return {};
  const source = input as Partial<Record<keyof VideoPublishAuditSafeSummaryDTO, unknown>>;
  const summary: VideoPublishAuditSafeSummaryDTO = {};

  assignEnum(summary, source, 'publishStatus', VIDEO_PUBLISH_STATUSES);
  assignEnum(summary, source, 'platform', VIDEO_PUBLISH_PLATFORMS);
  assignText(summary, source, 'platformAccountLabel', VIDEO_PUBLISH_TEXT_LIMITS.platformAccountLabel);
  assignText(summary, source, 'platformWorkId', VIDEO_PUBLISH_TEXT_LIMITS.platformWorkId);
  assignUrl(summary, source, 'platformUrlDisplay');
  assignText(summary, source, 'publishedAt', 64);
  assignText(summary, source, 'publishTitle', VIDEO_PUBLISH_TEXT_LIMITS.publishTitle);
  assignEnum(summary, source, 'metricWindowType', VIDEO_METRIC_WINDOW_TYPES);
  assignEnum(summary, source, 'metricPersistentStatus', VIDEO_METRIC_BACKFILL_PERSISTENT_STATUSES);
  assignEnum(summary, source, 'metricDisplayStatus', VIDEO_METRIC_BACKFILL_DISPLAY_STATUSES);
  assignEnum(summary, source, 'sampleSizeLevel', VIDEO_METRIC_SAMPLE_SIZE_LEVELS);
  assignEnum(summary, source, 'subjectiveRating', VIDEO_METRIC_SUBJECTIVE_RATINGS);
  assignEnum(summary, source, 'nextDecision', VIDEO_PUBLISH_NEXT_DECISIONS);
  assignEnum(summary, source, 'confidence', VIDEO_PUBLISH_DECISION_CONFIDENCES);
  assignNumber(summary, source, 'publishRecordVersionNo');
  assignNumber(summary, source, 'backfillNodeVersionNo');
  assignNumber(summary, source, 'metricSnapshotVersionNo');
  assignText(summary, source, 'decisionRecordId', 128);

  return summary;
}

export function isForbiddenVideoPublishField(key: string): boolean {
  return VIDEO_PUBLISH_FORBIDDEN_FIELD_PATTERN.test(key);
}

function assignEnum<T extends keyof VideoPublishAuditSafeSummaryDTO>(
  target: VideoPublishAuditSafeSummaryDTO,
  source: Partial<Record<keyof VideoPublishAuditSafeSummaryDTO, unknown>>,
  field: T,
  allowed: readonly NonNullable<VideoPublishAuditSafeSummaryDTO[T]>[]
): void {
  const value = source[field];
  if (value === null) {
    target[field] = null as VideoPublishAuditSafeSummaryDTO[T];
    return;
  }
  if (allowed.includes(value as NonNullable<VideoPublishAuditSafeSummaryDTO[T]>)) {
    target[field] = value as VideoPublishAuditSafeSummaryDTO[T];
  }
}

function assignText(
  target: VideoPublishAuditSafeSummaryDTO,
  source: Partial<Record<keyof VideoPublishAuditSafeSummaryDTO, unknown>>,
  field: keyof VideoPublishAuditSafeSummaryDTO,
  maxLength: number
): void {
  const value = source[field];
  if (value === null) {
    target[field] = null;
    return;
  }
  const sanitized = sanitizeVideoPublishVisibleText(value, maxLength, '');
  if (sanitized) {
    target[field] = sanitized as never;
  }
}

function assignUrl(
  target: VideoPublishAuditSafeSummaryDTO,
  source: Partial<Record<keyof VideoPublishAuditSafeSummaryDTO, unknown>>,
  field: keyof VideoPublishAuditSafeSummaryDTO
): void {
  const value = source[field];
  if (value === null) {
    target[field] = null;
    return;
  }
  const sanitized = sanitizeVideoPublishUrlForDisplay(value);
  if (sanitized) {
    target[field] = sanitized as never;
  }
}

function assignNumber(
  target: VideoPublishAuditSafeSummaryDTO,
  source: Partial<Record<keyof VideoPublishAuditSafeSummaryDTO, unknown>>,
  field: keyof VideoPublishAuditSafeSummaryDTO
): void {
  const value = source[field];
  if (value === null) {
    target[field] = null;
    return;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    target[field] = value as never;
  }
}

function parsePublishDate(value: string | Date, fieldName: string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`${fieldName} must be a valid date`);
  }

  return date;
}
