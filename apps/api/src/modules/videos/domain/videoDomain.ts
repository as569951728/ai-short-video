import { createHash } from 'node:crypto';
import {
  ErrorCode,
  type ConfirmVideoNarrationRequest,
  type ConfirmVideoNarrationResultDTO,
  type ConfirmVideoSubtitleRequest,
  type ConfirmVideoSubtitleResultDTO,
  type ConfirmVideoTtsRequest,
  type ConfirmVideoTtsResultDTO,
  type ConfirmVideoRenderRequest,
  type ConfirmVideoRenderResultDTO,
  type ConfirmVideoVisualPlanRequest,
  type ConfirmVideoVisualPlanResultDTO,
  type CreateVideoExportRequest,
  type CreateVideoExportResultDTO,
  type CreateVideoProjectRequest,
  type GenerateVideoNarrationRequest,
  type GenerateVideoNarrationResultDTO,
  type GenerateVideoRenderRequest,
  type GenerateVideoRenderResultDTO,
  type GenerateVideoSubtitleRequest,
  type GenerateVideoSubtitleResultDTO,
  type GenerateVideoTtsRequest,
  type GenerateVideoTtsResultDTO,
  type RecheckVideoReferenceRequest,
  type RejectVideoNarrationRequest,
  type RejectVideoNarrationResultDTO,
  type RejectVideoRenderRequest,
  type RejectVideoRenderResultDTO,
  type RejectVideoSubtitleRequest,
  type RejectVideoSubtitleResultDTO,
  type RejectVideoTtsRequest,
  type RejectVideoTtsResultDTO,
  type RejectVideoVisualPlanRequest,
  type RejectVideoVisualPlanResultDTO,
  type ResolveVideoReferenceIssueRequest,
  type SaveVideoNarrationDraftRequest,
  type SaveVideoNarrationDraftResultDTO,
  type SaveVideoSubtitleDraftRequest,
  type SaveVideoSubtitleDraftResultDTO,
  type SaveVideoVisualPlanRequest,
  type SaveVideoVisualPlanResultDTO,
  type StopVideoProjectRequest,
  sanitizeVideoArtifactMetadata,
  sanitizeVideoProviderSummary,
  sanitizeVideoVisibleTask,
  sanitizeVideoVisibleText,
  type VideoArtifactType,
  type VideoExportDTO,
  type VideoExportListDTO,
  type VideoExportStatus,
  type VideoNarrationArtifactDTO,
  type VideoNarrationArtifactStatus,
  type VideoNarrationListDTO,
  type VideoNarrationQualityMode,
  type VideoNarrationTaskDTO,
  type VideoNarrationSourceVersionRefsDTO,
  type VideoRenderDTO,
  type VideoRenderListDTO,
  type VideoRenderPreviewStatus,
  type VideoRenderSourceVersionRefsDTO,
  type VideoRenderStatus,
  type VideoRenderTaskDTO,
  type VideoSubtitleArtifactDTO,
  type VideoSubtitleListDTO,
  type VideoSubtitleQualityMode,
  type VideoSubtitleSourceVersionRefsDTO,
  type VideoSubtitleTaskDTO,
  type VideoTtsArtifactDTO,
  type VideoTtsListDTO,
  type VideoTtsQualityMode,
  type VideoTtsSourceVersionRefsDTO,
  type VideoTtsTaskDTO,
  type VideoIssueAction,
  type VideoIssueLevel,
  type VideoLifecycleStatus,
  type VideoProductionStatus,
  type VideoProjectActionResultDTO,
  type VideoProjectDTO,
  type VideoProjectListDTO,
  type VideoUnitDTO,
  type VideoProjectType,
  type VideoReadySourceDTO,
  type VideoReadySourceListDTO,
  type VideoReferenceDetailDTO,
  type VideoReferenceIssueDTO,
  type VideoReferenceStatus,
  type VideoVisualPlanArtifactDTO,
  type VideoVisualPlanListDTO,
  type VideoVisualPlanSourceVersionRefsDTO
} from '@ai-shortvideo/shared';
import { BusinessError } from '../../../shared/errors.js';
import type { RequestContext } from '../../novels/domain/novelDomain.js';

export type VideoActionType =
  | 'create_video_project'
  | 'recheck_video_reference'
  | 'resolve_video_reference_issue'
  | 'stop_video_project'
  | 'generate_video_narration'
  | 'save_video_narration_draft'
  | 'confirm_video_narration'
  | 'reject_video_narration'
  | 'generate_video_tts'
  | 'confirm_video_tts'
  | 'reject_video_tts'
  | 'generate_video_subtitle'
  | 'save_video_subtitle_draft'
  | 'confirm_video_subtitle'
  | 'reject_video_subtitle'
  | 'save_video_visual_plan'
  | 'confirm_video_visual_plan'
  | 'reject_video_visual_plan'
  | 'generate_video_render'
  | 'confirm_video_render'
  | 'reject_video_render'
  | 'create_video_export';

export interface VideoSourceRecord extends VideoReadySourceDTO {
  tenantId: string;
  currentChapterVersions: VideoChapterCurrentVersionRecord[];
}

export interface VideoChapterCurrentVersionRecord {
  chapterId: string;
  chapterNo: number;
  chapterTitle: string;
  contentVersionId: string;
  wordCount: number;
  summary: string;
  riskLevel: string;
  updatedAt: Date;
}

export interface VideoProjectRecord {
  id: string;
  tenantId: string;
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
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface VideoReferenceRecord {
  id: string;
  tenantId: string;
  videoProjectId: string;
  novelId: string;
  versionNo: number;
  status: VideoReferenceStatus;
  chapterRangeText: string;
  chapterCount: number;
  referenceSummary: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoReferenceChapterSnapshotRecord {
  id: string;
  tenantId: string;
  videoReferenceId: string;
  novelId: string;
  chapterId: string;
  chapterNo: number;
  chapterTitle: string;
  contentVersionId: string;
  wordCount: number;
  summary: string;
  riskLevel: string;
  createdAt: Date;
}

export interface VideoReferenceIssueRecord extends VideoReferenceIssueDTO {
  tenantId: string;
  videoProjectId: string;
  videoReferenceId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoUnitRecord {
  id: string;
  tenantId: string;
  videoProjectId: string;
  videoReferenceId: string;
  unitNo: number;
  unitType: 'first_test';
  title: string;
  chapterRangeText: string;
  chapterIds: string[];
  status: 'reference_ready';
  productionStatus: VideoProductionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoActionReceiptRecord {
  id: string;
  tenantId: string;
  videoProjectId: string | null;
  actionType: VideoActionType;
  idempotencyToken: string;
  requestHash: string;
  resultObjectType: string;
  resultObjectId: string;
  createdBy: string | null;
  createdAt: Date;
  metadata: unknown;
}

export interface VideoOperationLogRecord {
  id: string;
  tenantId: string;
  videoProjectId: string | null;
  action: VideoActionType;
  objectType: string;
  objectId: string;
  reason: string | null;
  createdBy: string | null;
  createdAt: Date;
  metadata: unknown;
}

export interface VideoArtifactRecord {
  id: string;
  tenantId: string;
  videoProjectId: string;
  videoUnitId: string;
  videoReferenceId: string;
  artifactType: VideoArtifactType;
  status: VideoNarrationArtifactStatus;
  versionNo: number;
  isCurrent: boolean;
  sourceVersionRefs: VideoNarrationSourceVersionRefsDTO | VideoTtsSourceVersionRefsDTO | VideoSubtitleSourceVersionRefsDTO | VideoVisualPlanSourceVersionRefsDTO;
  providerSummary: VideoNarrationArtifactDTO['providerSummary'];
  providerRouteId: string;
  strategyVersion: string;
  qualityMode: VideoNarrationQualityMode | VideoTtsQualityMode | VideoSubtitleQualityMode;
  contentText: string;
  hook: string;
  firstScreenSubtitle: string;
  endingHook: string;
  estimatedDurationSeconds: number;
  durationSeconds?: number;
  fileKey?: string | null;
  previewUrl?: string | null;
  voiceId?: string | null;
  voiceName?: string | null;
  speed?: number | null;
  emotion?: string | null;
  volume?: number | null;
  wordCount: number;
  riskTags: string[];
  recommendationReason: string;
  score: number;
  qualitySummary: string;
  rejectedReason: string | null;
  confirmedBy: string | null;
  confirmedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: VideoNarrationArtifactDTO['metadata'];
}

export interface VideoRenderRecord {
  id: string;
  tenantId: string;
  videoProjectId: string;
  videoUnitId: string;
  videoReferenceId: string;
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
  providerSummary: VideoNarrationArtifactDTO['providerSummary'];
  providerRouteId: string;
  strategyVersion: string;
  sourceVersionRefs: VideoRenderSourceVersionRefsDTO;
  rejectedReason: string | null;
  confirmedBy: string | null;
  confirmedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: unknown;
}

export interface VideoExportRecord {
  id: string;
  tenantId: string;
  videoProjectId: string;
  videoUnitId: string;
  videoReferenceId: string;
  status: VideoExportStatus;
  fileKey: string;
  downloadUrl: string;
  fileName: string;
  renderVersionId: string;
  renderVersionNo: number;
  safeSummary: string;
  createdBy: string | null;
  createdAt: Date;
  metadata: unknown;
}

export interface VideoListQuery {
  tenantId: string;
  page: number;
  pageSize: number;
  keyword?: string;
  novelId?: string;
  referenceStatus?: VideoReferenceStatus;
  lifecycleStatus?: VideoLifecycleStatus;
  productionStatus?: VideoProductionStatus;
}

export interface VideoSourceListQuery {
  tenantId: string;
  page: number;
  pageSize: number;
  keyword?: string;
}

export interface VideoRepository {
  listSources(query: VideoSourceListQuery): Promise<VideoReadySourceListDTO>;
  listProjects(query: VideoListQuery): Promise<VideoProjectListDTO>;
  findSourceByNovelId(tenantId: string, novelId: string): Promise<VideoSourceRecord | null>;
  findProjectById(tenantId: string, videoId: string): Promise<VideoProjectRecord | null>;
  findDefaultUnit(tenantId: string, videoProjectId: string): Promise<VideoUnitRecord | null>;
  findActionReceipt(tenantId: string, actionType: VideoActionType, idempotencyToken: string): Promise<VideoActionReceiptRecord | null>;
  listActionReceipts(tenantId: string, videoProjectId: string, actionType: VideoActionType, limit?: number): Promise<VideoActionReceiptRecord[]>;
  createActionReceipt(input: Omit<VideoActionReceiptRecord, 'id' | 'createdAt'> & { now: Date }): Promise<VideoActionReceiptRecord>;
  createProjectWithReference(input: VideoProjectCreationInput): Promise<VideoProjectActionResultDTO>;
  getReferenceDetail(tenantId: string, videoId: string): Promise<VideoReferenceDetailDTO | null>;
  listNarrationArtifacts(tenantId: string, videoProjectId: string): Promise<VideoArtifactRecord[]>;
  getNarrationArtifact(tenantId: string, videoProjectId: string, artifactId: string): Promise<VideoArtifactRecord | null>;
  listTtsArtifacts(tenantId: string, videoProjectId: string): Promise<VideoArtifactRecord[]>;
  getTtsArtifact(tenantId: string, videoProjectId: string, artifactId: string): Promise<VideoArtifactRecord | null>;
  listSubtitleArtifacts(tenantId: string, videoProjectId: string): Promise<VideoArtifactRecord[]>;
  getSubtitleArtifact(tenantId: string, videoProjectId: string, artifactId: string): Promise<VideoArtifactRecord | null>;
  listVisualPlanArtifacts(tenantId: string, videoProjectId: string): Promise<VideoArtifactRecord[]>;
  getVisualPlanArtifact(tenantId: string, videoProjectId: string, artifactId: string): Promise<VideoArtifactRecord | null>;
  listRenders(tenantId: string, videoProjectId: string): Promise<VideoRenderRecord[]>;
  getRender(tenantId: string, videoProjectId: string, renderId: string): Promise<VideoRenderRecord | null>;
  listExports(tenantId: string, videoProjectId: string): Promise<VideoExportRecord[]>;
  createNarrationCandidates(input: VideoNarrationGenerationInput): Promise<GenerateVideoNarrationResultDTO>;
  saveNarrationDraft(input: VideoNarrationDraftInput): Promise<SaveVideoNarrationDraftResultDTO>;
  confirmNarration(input: VideoNarrationConfirmInput): Promise<ConfirmVideoNarrationResultDTO>;
  rejectNarration(input: VideoNarrationRejectInput): Promise<RejectVideoNarrationResultDTO>;
  createTtsCandidate(input: VideoTtsGenerationInput): Promise<GenerateVideoTtsResultDTO>;
  confirmTts(input: VideoTtsConfirmInput): Promise<ConfirmVideoTtsResultDTO>;
  rejectTts(input: VideoTtsRejectInput): Promise<RejectVideoTtsResultDTO>;
  createSubtitleCandidate(input: VideoSubtitleGenerationInput): Promise<GenerateVideoSubtitleResultDTO>;
  saveSubtitleDraft(input: VideoSubtitleDraftInput): Promise<SaveVideoSubtitleDraftResultDTO>;
  confirmSubtitle(input: VideoSubtitleConfirmInput): Promise<ConfirmVideoSubtitleResultDTO>;
  rejectSubtitle(input: VideoSubtitleRejectInput): Promise<RejectVideoSubtitleResultDTO>;
  saveVisualPlan(input: VideoVisualPlanSaveInput): Promise<SaveVideoVisualPlanResultDTO>;
  confirmVisualPlan(input: VideoVisualPlanConfirmInput): Promise<ConfirmVideoVisualPlanResultDTO>;
  rejectVisualPlan(input: VideoVisualPlanRejectInput): Promise<RejectVideoVisualPlanResultDTO>;
  createRender(input: VideoRenderGenerationInput): Promise<GenerateVideoRenderResultDTO>;
  confirmRender(input: VideoRenderConfirmInput): Promise<ConfirmVideoRenderResultDTO>;
  rejectRender(input: VideoRenderRejectInput): Promise<RejectVideoRenderResultDTO>;
  createExport(input: VideoExportCreateInput): Promise<CreateVideoExportResultDTO>;
  recheckReference(input: VideoReferenceRecheckInput): Promise<VideoReferenceDetailDTO>;
  resolveIssue(input: VideoReferenceIssueResolutionInput): Promise<VideoReferenceDetailDTO>;
  stopProject(input: VideoProjectStopInput): Promise<VideoProjectActionResultDTO>;
}

export interface VideoNarrationGenerationInput {
  context: RequestContext;
  project: VideoProjectRecord;
  reference: VideoReferenceDetailDTO;
  unit: VideoUnitRecord;
  request: GenerateVideoNarrationRequest;
  requestHash: string;
  sourceVersionRefs: VideoNarrationSourceVersionRefsDTO;
  now: Date;
}

export interface VideoNarrationDraftInput {
  context: RequestContext;
  project: VideoProjectRecord;
  reference: VideoReferenceDetailDTO;
  unit: VideoUnitRecord;
  request: SaveVideoNarrationDraftRequest;
  requestHash: string;
  sourceVersionRefs: VideoNarrationSourceVersionRefsDTO;
  now: Date;
}

export interface VideoNarrationConfirmInput {
  context: RequestContext;
  project: VideoProjectRecord;
  artifact: VideoArtifactRecord;
  request: ConfirmVideoNarrationRequest;
  requestHash: string;
  now: Date;
}

export interface VideoNarrationRejectInput {
  context: RequestContext;
  project: VideoProjectRecord;
  artifact: VideoArtifactRecord;
  request: RejectVideoNarrationRequest;
  requestHash: string;
  now: Date;
}

export interface VideoTtsGenerationInput {
  context: RequestContext;
  project: VideoProjectRecord;
  reference: VideoReferenceDetailDTO;
  unit: VideoUnitRecord;
  narration: VideoArtifactRecord;
  request: GenerateVideoTtsRequest;
  requestHash: string;
  sourceVersionRefs: VideoTtsSourceVersionRefsDTO;
  now: Date;
}

export interface VideoTtsConfirmInput {
  context: RequestContext;
  project: VideoProjectRecord;
  artifact: VideoArtifactRecord;
  request: ConfirmVideoTtsRequest;
  requestHash: string;
  now: Date;
}

export interface VideoTtsRejectInput {
  context: RequestContext;
  project: VideoProjectRecord;
  artifact: VideoArtifactRecord;
  request: RejectVideoTtsRequest;
  requestHash: string;
  now: Date;
}

export interface VideoSubtitleGenerationInput {
  context: RequestContext;
  project: VideoProjectRecord;
  reference: VideoReferenceDetailDTO;
  unit: VideoUnitRecord;
  narration: VideoArtifactRecord;
  tts: VideoArtifactRecord;
  request: GenerateVideoSubtitleRequest;
  requestHash: string;
  sourceVersionRefs: VideoSubtitleSourceVersionRefsDTO;
  now: Date;
}

export interface VideoSubtitleDraftInput {
  context: RequestContext;
  project: VideoProjectRecord;
  reference: VideoReferenceDetailDTO;
  unit: VideoUnitRecord;
  request: SaveVideoSubtitleDraftRequest;
  requestHash: string;
  sourceVersionRefs: VideoSubtitleSourceVersionRefsDTO;
  now: Date;
}

export interface VideoSubtitleConfirmInput {
  context: RequestContext;
  project: VideoProjectRecord;
  artifact: VideoArtifactRecord;
  request: ConfirmVideoSubtitleRequest;
  requestHash: string;
  now: Date;
}

export interface VideoSubtitleRejectInput {
  context: RequestContext;
  project: VideoProjectRecord;
  artifact: VideoArtifactRecord;
  request: RejectVideoSubtitleRequest;
  requestHash: string;
  now: Date;
}

export interface VideoVisualPlanSaveInput {
  context: RequestContext;
  project: VideoProjectRecord;
  reference: VideoReferenceDetailDTO;
  unit: VideoUnitRecord;
  subtitle: VideoArtifactRecord;
  request: SaveVideoVisualPlanRequest;
  requestHash: string;
  sourceVersionRefs: VideoVisualPlanSourceVersionRefsDTO;
  now: Date;
}

export interface VideoVisualPlanConfirmInput {
  context: RequestContext;
  project: VideoProjectRecord;
  artifact: VideoArtifactRecord;
  request: ConfirmVideoVisualPlanRequest;
  requestHash: string;
  now: Date;
}

export interface VideoVisualPlanRejectInput {
  context: RequestContext;
  project: VideoProjectRecord;
  artifact: VideoArtifactRecord;
  request: RejectVideoVisualPlanRequest;
  requestHash: string;
  now: Date;
}

export interface VideoRenderGenerationInput {
  context: RequestContext;
  project: VideoProjectRecord;
  reference: VideoReferenceDetailDTO;
  unit: VideoUnitRecord;
  visualPlan: VideoArtifactRecord;
  request: GenerateVideoRenderRequest;
  requestHash: string;
  sourceVersionRefs: VideoRenderSourceVersionRefsDTO;
  now: Date;
}

export interface VideoRenderConfirmInput {
  context: RequestContext;
  project: VideoProjectRecord;
  render: VideoRenderRecord;
  request: ConfirmVideoRenderRequest;
  requestHash: string;
  now: Date;
}

export interface VideoRenderRejectInput {
  context: RequestContext;
  project: VideoProjectRecord;
  render: VideoRenderRecord;
  request: RejectVideoRenderRequest;
  requestHash: string;
  now: Date;
}

export interface VideoExportCreateInput {
  context: RequestContext;
  project: VideoProjectRecord;
  render: VideoRenderRecord;
  request: CreateVideoExportRequest;
  requestHash: string;
  now: Date;
}

export interface VideoProjectCreationInput {
  context: RequestContext;
  request: CreateVideoProjectRequest;
  requestHash: string;
  source: VideoSourceRecord;
  chapters: VideoChapterCurrentVersionRecord[];
  now: Date;
}

export interface VideoReferenceRecheckInput {
  context: RequestContext;
  project: VideoProjectRecord;
  request: RecheckVideoReferenceRequest;
  requestHash: string;
  now: Date;
}

export interface VideoReferenceIssueResolutionInput {
  context: RequestContext;
  project: VideoProjectRecord;
  issueId: string;
  request: ResolveVideoReferenceIssueRequest;
  requestHash: string;
  now: Date;
}

export interface VideoProjectStopInput {
  context: RequestContext;
  project: VideoProjectRecord;
  request: StopVideoProjectRequest;
  requestHash: string;
  now: Date;
}

export function createVideoActionRequestHash(input: unknown): string {
  return createHash('sha256').update(stableStringify(input)).digest('hex');
}

export function assertIdempotencyToken(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 8 || value.length > 160) {
    throw new BusinessError(ErrorCode.ValidationError, 'idempotencyToken 必填，长度需在 8-160 个字符之间');
  }

  return value.trim();
}

export function assertReason(value: string, actionText: string) {
  if (typeof value !== 'string' || value.trim().length < 4) {
    throw new BusinessError(ErrorCode.ValidationError, `${actionText}必须填写原因`);
  }
}

export function assertIssueActionAllowed(level: VideoIssueLevel, action: VideoIssueAction): void {
  if (level === 'blocking' && action === 'ignore') {
    throw new BusinessError(ErrorCode.VideoReferenceBlocking, 'blocking 引用异常不能直接忽略，请回小说处理或停止项目');
  }
}

export function createVideoReferenceNextAction(status: VideoReferenceStatus): { label: string; disabled: boolean; disabledReason: string | null } {
  if (status === 'blocking') {
    return {
      label: '处理引用异常',
      disabled: false,
      disabledReason: null
    };
  }

  if (status === 'warning' || status === 'info') {
    return {
      label: '查看差异并决定处理',
      disabled: false,
      disabledReason: null
    };
  }

  if (status === 'resolved') {
    return {
      label: '查看处理记录',
      disabled: false,
      disabledReason: null
    };
  }

  return {
    label: '查看引用快照',
    disabled: false,
    disabledReason: null
  };
}

export function toProjectDTO(project: VideoProjectRecord): VideoProjectDTO {
  return {
    id: project.id,
    title: project.title,
    projectType: project.projectType,
    novelId: project.novelId,
    novelTitle: project.novelTitle,
    lifecycleStatus: project.lifecycleStatus,
    referenceStatus: project.referenceStatus,
    productionStatus: project.productionStatus,
    chapterRangeText: project.chapterRangeText,
    chapterCount: project.chapterCount,
    currentVideoReferenceId: project.currentVideoReferenceId,
    defaultVideoUnitId: project.defaultVideoUnitId,
    updatedAt: project.updatedAt.toISOString()
  };
}

export function toUnitDTO(unit: VideoUnitRecord): VideoUnitDTO {
  return {
    id: unit.id,
    unitNo: unit.unitNo,
    unitType: unit.unitType,
    title: unit.title,
    chapterRangeText: unit.chapterRangeText,
    chapterIds: [...unit.chapterIds],
    status: unit.status,
    productionStatus: unit.productionStatus
  };
}

export function toNarrationArtifactDTO(artifact: VideoArtifactRecord): VideoNarrationArtifactDTO {
  if (artifact.artifactType !== 'narration_script') {
    throw new BusinessError(ErrorCode.ValidationError, '视频产物类型不是旁白稿');
  }
  return {
    id: artifact.id,
    artifactType: artifact.artifactType,
    status: artifact.status,
    versionNo: artifact.versionNo,
    isCurrent: artifact.isCurrent,
    contentText: artifact.contentText,
    hook: artifact.hook,
    firstScreenSubtitle: artifact.firstScreenSubtitle,
    endingHook: artifact.endingHook,
    estimatedDurationSeconds: artifact.estimatedDurationSeconds,
    wordCount: artifact.wordCount,
    riskTags: [...artifact.riskTags],
    recommendationReason: artifact.recommendationReason,
    score: artifact.score,
    qualitySummary: artifact.qualitySummary,
    sourceVersionRefs: artifact.sourceVersionRefs as VideoNarrationSourceVersionRefsDTO,
    providerSummary: sanitizeVideoProviderSummary(artifact.providerSummary),
    providerRouteId: artifact.providerRouteId,
    strategyVersion: artifact.strategyVersion,
    qualityMode: artifact.qualityMode as VideoNarrationQualityMode,
    metadata: sanitizeVideoArtifactMetadata(artifact.metadata),
    rejectedReason: artifact.rejectedReason,
    confirmedAt: artifact.confirmedAt ? artifact.confirmedAt.toISOString() : null,
    createdAt: artifact.createdAt.toISOString()
  };
}

export function toNarrationListDTO(artifacts: VideoArtifactRecord[]): VideoNarrationListDTO {
  const ordered = [...artifacts].sort((left, right) => right.versionNo - left.versionNo);
  return {
    current: ordered.find((artifact) => artifact.status === 'confirmed' && artifact.isCurrent) ? toNarrationArtifactDTO(ordered.find((artifact) => artifact.status === 'confirmed' && artifact.isCurrent)!) : null,
    candidates: ordered.filter((artifact) => artifact.status === 'candidate').map(toNarrationArtifactDTO),
    drafts: ordered.filter((artifact) => artifact.status === 'draft').map(toNarrationArtifactDTO),
    history: ordered.map(toNarrationArtifactDTO),
    activeTask: null
  };
}

export function toTtsArtifactDTO(artifact: VideoArtifactRecord): VideoTtsArtifactDTO {
  if (artifact.artifactType !== 'tts_audio') {
    throw new BusinessError(ErrorCode.ValidationError, '视频产物类型不是配音音频');
  }
  return {
    id: artifact.id,
    artifactType: 'tts_audio',
    status: artifact.status,
    versionNo: artifact.versionNo,
    isCurrent: artifact.isCurrent,
    voiceId: artifact.voiceId ?? 'mock-male-cinematic',
    voiceName: artifact.voiceName ?? '男声-剧情感',
    speed: artifact.speed ?? 1,
    emotion: (artifact.emotion ?? 'suspense') as VideoTtsArtifactDTO['emotion'],
    volume: artifact.volume ?? 90,
    durationSeconds: artifact.durationSeconds || artifact.estimatedDurationSeconds,
    fileKey: artifact.fileKey ?? `mock://video-tts/${artifact.id}.mp3`,
    previewUrl: artifact.previewUrl ?? `/mock-audio/video-tts/${artifact.id}.mp3`,
    riskTags: [...artifact.riskTags],
    recommendationReason: artifact.recommendationReason,
    qualitySummary: artifact.qualitySummary,
    sourceVersionRefs: artifact.sourceVersionRefs as VideoTtsSourceVersionRefsDTO,
    providerSummary: sanitizeVideoProviderSummary(artifact.providerSummary),
    providerRouteId: artifact.providerRouteId,
    strategyVersion: artifact.strategyVersion,
    qualityMode: artifact.qualityMode as VideoTtsQualityMode,
    metadata: sanitizeVideoArtifactMetadata(artifact.metadata),
    rejectedReason: artifact.rejectedReason,
    confirmedAt: artifact.confirmedAt ? artifact.confirmedAt.toISOString() : null,
    createdAt: artifact.createdAt.toISOString()
  };
}

export function toTtsListDTO(artifacts: VideoArtifactRecord[]): VideoTtsListDTO {
  const ordered = [...artifacts].filter((artifact) => artifact.artifactType === 'tts_audio').sort((left, right) => right.versionNo - left.versionNo);
  return {
    current: ordered.find((artifact) => artifact.status === 'confirmed' && artifact.isCurrent) ? toTtsArtifactDTO(ordered.find((artifact) => artifact.status === 'confirmed' && artifact.isCurrent)!) : null,
    candidates: ordered.filter((artifact) => artifact.status === 'candidate').map(toTtsArtifactDTO),
    history: ordered.map(toTtsArtifactDTO),
    activeTask: null
  };
}

export function toSubtitleArtifactDTO(artifact: VideoArtifactRecord): VideoSubtitleArtifactDTO {
  if (artifact.artifactType !== 'subtitle') {
    throw new BusinessError(ErrorCode.ValidationError, '视频产物类型不是字幕');
  }
  const metadata = sanitizeVideoArtifactMetadata(artifact.metadata);
  return {
    id: artifact.id,
    artifactType: 'subtitle',
    status: artifact.status,
    versionNo: artifact.versionNo,
    isCurrent: artifact.isCurrent,
    contentText: artifact.contentText,
    firstScreenSubtitle: artifact.firstScreenSubtitle,
    timelineSummary: metadata.timelineSummary ?? [],
    estimatedDurationSeconds: artifact.estimatedDurationSeconds,
    lineCount: artifact.contentText.split('\n').filter((line) => line.trim()).length,
    wordCount: artifact.wordCount,
    riskTags: [...artifact.riskTags],
    recommendationReason: artifact.recommendationReason,
    score: artifact.score,
    qualitySummary: artifact.qualitySummary,
    sourceVersionRefs: artifact.sourceVersionRefs as VideoSubtitleSourceVersionRefsDTO,
    providerSummary: sanitizeVideoProviderSummary(artifact.providerSummary),
    providerRouteId: artifact.providerRouteId,
    strategyVersion: artifact.strategyVersion,
    qualityMode: artifact.qualityMode as VideoSubtitleQualityMode,
    subtitleStyle: metadata.subtitleStyle ?? 'balanced',
    lineLength: typeof metadata.lineLength === 'number' ? metadata.lineLength : 18,
    metadata,
    rejectedReason: artifact.rejectedReason,
    confirmedAt: artifact.confirmedAt ? artifact.confirmedAt.toISOString() : null,
    createdAt: artifact.createdAt.toISOString()
  };
}

export function toSubtitleListDTO(artifacts: VideoArtifactRecord[]): VideoSubtitleListDTO {
  const ordered = [...artifacts].filter((artifact) => artifact.artifactType === 'subtitle').sort((left, right) => right.versionNo - left.versionNo);
  return {
    current: ordered.find((artifact) => artifact.status === 'confirmed' && artifact.isCurrent) ? toSubtitleArtifactDTO(ordered.find((artifact) => artifact.status === 'confirmed' && artifact.isCurrent)!) : null,
    candidates: ordered.filter((artifact) => artifact.status === 'candidate').map(toSubtitleArtifactDTO),
    drafts: ordered.filter((artifact) => artifact.status === 'draft').map(toSubtitleArtifactDTO),
    history: ordered.map(toSubtitleArtifactDTO),
    activeTask: null
  };
}

export function toVisualPlanArtifactDTO(artifact: VideoArtifactRecord): VideoVisualPlanArtifactDTO {
  if (artifact.artifactType !== 'visual_plan') {
    throw new BusinessError(ErrorCode.ValidationError, '视频产物类型不是视觉方案');
  }
  const metadata = sanitizeVideoArtifactMetadata(artifact.metadata);
  return {
    id: artifact.id,
    artifactType: 'visual_plan',
    status: artifact.status,
    versionNo: artifact.versionNo,
    isCurrent: artifact.isCurrent,
    backgroundAssetId: metadata.backgroundAssetId ?? 'mock-bg-salt-field',
    backgroundName: metadata.backgroundName ?? '盐场风沙循环背景',
    backgroundType: 'loop_background',
    aspectRatio: metadata.aspectRatio ?? '9:16',
    resolution: metadata.resolution ?? '1080x1920',
    subtitlePosition: metadata.subtitlePosition ?? 'bottom_safe',
    fontSize: typeof metadata.fontSize === 'number' ? metadata.fontSize : 42,
    textColor: typeof metadata.textColor === 'string' ? metadata.textColor : '#ffffff',
    strokeColor: typeof metadata.strokeColor === 'string' ? metadata.strokeColor : '#111827',
    shadowEnabled: typeof metadata.shadowEnabled === 'boolean' ? metadata.shadowEnabled : true,
    safeAreaPreset: metadata.safeAreaPreset ?? 'douyin_safe',
    riskTags: [...artifact.riskTags],
    recommendationReason: artifact.recommendationReason,
    qualitySummary: artifact.qualitySummary,
    sourceVersionRefs: artifact.sourceVersionRefs as VideoVisualPlanSourceVersionRefsDTO,
    providerSummary: sanitizeVideoProviderSummary(artifact.providerSummary),
    providerRouteId: artifact.providerRouteId,
    strategyVersion: artifact.strategyVersion,
    qualityMode: artifact.qualityMode as VideoNarrationQualityMode,
    metadata,
    rejectedReason: artifact.rejectedReason,
    confirmedAt: artifact.confirmedAt ? artifact.confirmedAt.toISOString() : null,
    createdAt: artifact.createdAt.toISOString()
  };
}

export function toVisualPlanListDTO(artifacts: VideoArtifactRecord[]): VideoVisualPlanListDTO {
  const ordered = [...artifacts].filter((artifact) => artifact.artifactType === 'visual_plan').sort((left, right) => right.versionNo - left.versionNo);
  return {
    current: ordered.find((artifact) => artifact.status === 'confirmed' && artifact.isCurrent) ? toVisualPlanArtifactDTO(ordered.find((artifact) => artifact.status === 'confirmed' && artifact.isCurrent)!) : null,
    candidates: ordered.filter((artifact) => artifact.status === 'candidate').map(toVisualPlanArtifactDTO),
    history: ordered.map(toVisualPlanArtifactDTO)
  };
}

export function toRenderDTO(render: VideoRenderRecord): VideoRenderDTO {
  return {
    id: render.id,
    versionNo: render.versionNo,
    status: render.status,
    isCurrent: render.isCurrent,
    previewStatus: render.previewStatus,
    previewUrl: render.previewUrl,
    fileKey: render.fileKey,
    durationSeconds: render.durationSeconds,
    renderMode: render.renderMode,
    qualityMode: render.qualityMode,
    qualityIssues: [...render.qualityIssues],
    safeSummary: sanitizeVideoVisibleText(render.safeSummary, '渲染预览已生成安全摘要。'),
    providerSummary: sanitizeVideoProviderSummary(render.providerSummary),
    providerRouteId: render.providerRouteId,
    strategyVersion: render.strategyVersion,
    sourceVersionRefs: render.sourceVersionRefs,
    rejectedReason: render.rejectedReason,
    confirmedAt: render.confirmedAt ? render.confirmedAt.toISOString() : null,
    createdAt: render.createdAt.toISOString()
  };
}

export function toRenderListDTO(renders: VideoRenderRecord[], activeTask: VideoRenderTaskDTO | null = null): VideoRenderListDTO {
  const ordered = [...renders].sort((left, right) => right.versionNo - left.versionNo);
  return {
    current: ordered.find((render) => render.status === 'confirmed' && render.isCurrent) ? toRenderDTO(ordered.find((render) => render.status === 'confirmed' && render.isCurrent)!) : null,
    candidates: ordered.filter((render) => render.status === 'candidate').map(toRenderDTO),
    history: ordered.map(toRenderDTO),
    activeTask
  };
}

export function toExportDTO(exportRecord: VideoExportRecord): VideoExportDTO {
  return {
    id: exportRecord.id,
    status: exportRecord.status,
    fileKey: exportRecord.fileKey,
    downloadUrl: exportRecord.downloadUrl,
    fileName: exportRecord.fileName,
    renderVersionId: exportRecord.renderVersionId,
    renderVersionNo: exportRecord.renderVersionNo,
    safeSummary: sanitizeVideoVisibleText(exportRecord.safeSummary, '导出记录已创建。'),
    createdAt: exportRecord.createdAt.toISOString()
  };
}

export function toExportListDTO(exports: VideoExportRecord[]): VideoExportListDTO {
  const ordered = [...exports].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  return {
    current: ordered.find((item) => item.status === 'created') ? toExportDTO(ordered.find((item) => item.status === 'created')!) : null,
    history: ordered.map(toExportDTO)
  };
}

export function toTtsTaskFromReceipt(receipt: VideoActionReceiptRecord | null): VideoTtsTaskDTO | null {
  if (!receipt) return null;
  const metadata = receipt.metadata as { task?: VideoTtsTaskDTO } | null;
  return sanitizeVideoVisibleTask(metadata?.task, 'video_tts_generate') as VideoTtsTaskDTO | null;
}

export function toSubtitleTaskFromReceipt(receipt: VideoActionReceiptRecord | null): VideoSubtitleTaskDTO | null {
  if (!receipt) return null;
  const metadata = receipt.metadata as { task?: VideoSubtitleTaskDTO } | null;
  return sanitizeVideoVisibleTask(metadata?.task, 'video_subtitle_generate') as VideoSubtitleTaskDTO | null;
}

export function toNarrationTaskFromReceipt(receipt: VideoActionReceiptRecord | null): VideoNarrationTaskDTO | null {
  if (!receipt) return null;
  const metadata = receipt.metadata as { task?: VideoNarrationTaskDTO } | null;
  return sanitizeVideoVisibleTask(metadata?.task, 'video_narration_generate') as VideoNarrationTaskDTO | null;
}

export function toRenderTaskFromReceipt(receipt: VideoActionReceiptRecord | null): VideoRenderTaskDTO | null {
  if (!receipt) return null;
  const metadata = receipt.metadata as { task?: VideoRenderTaskDTO } | null;
  return sanitizeVideoVisibleTask(metadata?.task, 'video_render_generate') as VideoRenderTaskDTO | null;
}

export function assertReceiptRequestHash(receipt: VideoActionReceiptRecord, requestHash: string) {
  if (receipt.requestHash !== requestHash) {
    throw new BusinessError(ErrorCode.IdempotencyConflict, '同一幂等令牌绑定了不同请求，请刷新后重新提交');
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}
