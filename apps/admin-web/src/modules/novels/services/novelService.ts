import {
  NovelCreationStage,
  NovelLifecycleStatus,
  ImpactLevel,
  StageStatus,
  RiskLevel,
  StaleLevel,
  TaskStatus,
  VersionStatus,
  type AdoptDirectionRequest,
  type AdoptChapterContentVersionRequest,
  type AdoptStructureAssetRequest,
  type BodyBatchActionResultDTO,
  type ChapterWorkbenchDTO,
  type CompletionActionResultDTO,
  type ConfirmCompletionRequest,
  type ConfirmVideoReadinessRequest,
  type ConfirmTrialRequest,
  type CreateImpactAssessmentRequest,
  type CreateNovelDraftRequest,
  type DirectionActionResultDTO,
  type DirectionCandidateDTO,
  type EditDirectionCandidateRequest,
  type EditStructureAssetRequest,
  type ForcePassFullReviewRequest,
  type FullReviewActionResultDTO,
  type FullReviewIssueActionResultDTO,
  type FullReviewLatestResultDTO,
  type FuseDirectionsRequest,
  type GenerateBodyBatchRequest,
  type GenerateChapterBodyRequest,
  type GenerateDirectionsRequest,
  type GenerateStructureAssetRequest,
  type GenerateTrialRequest,
  type ImpactAssessmentActionResultDTO,
  type ImpactCaseDTO,
  type ImpactCaseResolveResultDTO,
  type NovelChapterDTO,
  type NovelDetailDTO,
  type NovelListItemDTO,
  type NovelListResultDTO,
  type OptimizeDirectionRequest,
  type RecheckVideoReadinessRequest,
  type ResolveFullReviewIssueRequest,
  type ResolveImpactCaseRequest,
  type RewriteChapterRequest,
  type StartFullReviewRequest,
  type UpdateChapterWordTargetsRequest,
  type ChapterContentAdoptionResultDTO,
  type ChapterRewriteResultDTO,
  type StructureActionResultDTO,
  type StructureAssetDTO,
  type StructureAssetType,
  type TrialActionResultDTO,
  type TrialChapterCandidateDTO,
  type TrialChapterResultDTO,
  type VideoReadinessActionResultDTO,
  type VideoReadinessDTO,
} from '@ai-shortvideo/shared'
import { novels } from '../../../mock/prototypeData.js'
import { getApiMode, type ApiMode } from '../../../shared/services/apiMode.js'
import { apiRequest } from '../../../shared/services/http.js'
import type { Novel } from '../../../types/prototype'
import type { DirectionCandidateRow, NovelChapterPlanRow, NovelListQuery, NovelListResult, NovelListRow, StructureAssetRow, TrialCandidateRow, TrialChapterResultRow } from '../model/novelTypes.js'

const mockDetailOverrides = new Map<string, Partial<NovelDetailDTO>>()

export async function listNovels(query: NovelListQuery = {}, mode: ApiMode = getApiMode()): Promise<NovelListResult> {
  if (mode === 'mock') {
    return listMockNovels(query)
  }

  const result = await apiRequest<NovelListResultDTO>('/novels', {
    query: {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      keyword: query.keyword,
      lifecycleStatus: query.lifecycleStatus,
      creationStage: query.creationStage,
      videoReferenceStatus: query.videoReferenceStatus,
    },
  })

  return {
    ...result,
    items: result.items.map(toNovelListRow),
  }
}

export async function createNovelDraft(request: CreateNovelDraftRequest, mode: ApiMode = getApiMode()): Promise<NovelDetailDTO> {
  if (mode === 'mock') {
    return createMockDraft(request)
  }

  return apiRequest<NovelDetailDTO>('/novels/drafts', {
    method: 'POST',
    body: request,
  })
}

export async function getNovelDetail(novelId: string, mode: ApiMode = getApiMode()): Promise<NovelDetailDTO> {
  if (mode === 'mock') {
    return createMockDetail(novelId)
  }

  return apiRequest<NovelDetailDTO>(`/novels/${novelId}`)
}

export async function generateDirections(
  novelId: string,
  request: GenerateDirectionsRequest = {},
  mode: ApiMode = getApiMode(),
): Promise<DirectionActionResultDTO> {
  if (mode === 'mock') {
    const result = createMockDirectionActionResult(novelId)
    applyMockDetailActionResult(novelId, {
      creationStage: result.statusSummary.creationStage,
      stageStatus: result.statusSummary.stageStatus,
      statusSummary: result.statusSummary,
      directionCandidates: result.candidates,
      recentTask: result.task,
      recentTasks: [result.task],
      updatedAt: new Date().toISOString(),
    })
    return result
  }

  return apiRequest<DirectionActionResultDTO>(`/novels/${novelId}/directions/generate`, {
    method: 'POST',
    body: request,
  })
}

export async function fuseDirections(
  novelId: string,
  request: FuseDirectionsRequest,
  mode: ApiMode = getApiMode(),
): Promise<DirectionActionResultDTO> {
  if (mode === 'mock') {
    const result = createMockDirectionActionResult(
      novelId,
      createMockDirectionCandidate({
        id: createMockDirectionCandidateId('fuse'),
        title: '融合方向候选',
        summary: request.reason || '融合所选方向的核心爽点和视频化钩子。',
      }),
      null,
      'novel_direction_fuse',
    )
    applyMockDirectionRevisionActionResult(novelId, result)
    return result
  }

  return apiRequest<DirectionActionResultDTO>(`/novels/${novelId}/directions/fuse`, {
    method: 'POST',
    body: request,
  })
}

export async function optimizeDirection(
  novelId: string,
  versionId: string,
  request: OptimizeDirectionRequest = {},
  mode: ApiMode = getApiMode(),
): Promise<DirectionActionResultDTO> {
  if (mode === 'mock') {
    const result = createMockDirectionActionResult(
      novelId,
      createMockDirectionCandidate({
        id: createMockDirectionCandidateId('optimize'),
        title: '优化方向候选',
        summary: request.instruction || '按用户要求优化方向表达。',
      }),
      null,
      'novel_direction_optimize',
    )
    applyMockDirectionRevisionActionResult(novelId, result)
    return result
  }

  return apiRequest<DirectionActionResultDTO>(`/novels/${novelId}/directions/${versionId}/optimize`, {
    method: 'POST',
    body: request,
  })
}

export async function editDirectionCandidate(
  novelId: string,
  versionId: string,
  request: EditDirectionCandidateRequest,
  mode: ApiMode = getApiMode(),
): Promise<DirectionActionResultDTO> {
  if (mode === 'mock') {
    const result = createMockDirectionActionResult(
      novelId,
      createMockDirectionCandidate({
        id: createMockDirectionCandidateId('manual-edit'),
        title: request.title,
        summary: request.logline,
        content: {
          title: request.title,
          logline: request.logline,
          coreHook: request.coreHook,
          audienceAppeal: request.audienceAppeal,
          videoPotential: request.videoPotential,
          sellingPoints: request.sellingPoints,
          riskTags: request.riskTags,
          recommendation: request.recommendation,
        },
        riskTags: request.riskTags,
        recommendedReason: request.recommendation,
      }),
      null,
      'novel_direction_manual_edit',
    )
    applyMockDirectionRevisionActionResult(novelId, result)
    return result
  }

  return apiRequest<DirectionActionResultDTO>(`/novels/${novelId}/directions/${versionId}/edit`, {
    method: 'POST',
    body: request,
  })
}

export async function adoptDirection(
  novelId: string,
  versionId: string,
  request: AdoptDirectionRequest,
  mode: ApiMode = getApiMode(),
): Promise<DirectionActionResultDTO> {
  if (mode === 'mock') {
    const currentDirection = createMockDirectionCandidate({ id: versionId, status: VersionStatus.Current })
    return createMockDirectionActionResult(novelId, currentDirection, currentDirection)
  }

  return apiRequest<DirectionActionResultDTO>(`/novels/${novelId}/directions/${versionId}/adopt`, {
    method: 'POST',
    body: request,
  })
}

export async function generateSetting(
  novelId: string,
  request: GenerateStructureAssetRequest = {},
  mode: ApiMode = getApiMode(),
): Promise<StructureActionResultDTO> {
  if (mode === 'mock') return createMockStructureActionResult(novelId, 'setting')

  return apiRequest<StructureActionResultDTO>(`/novels/${novelId}/settings/generate`, {
    method: 'POST',
    body: request,
  })
}

export async function adoptSetting(
  novelId: string,
  versionId: string,
  request: AdoptStructureAssetRequest,
  mode: ApiMode = getApiMode(),
): Promise<StructureActionResultDTO> {
  if (mode === 'mock') return createMockStructureActionResult(novelId, 'setting', createMockStructureAsset({ id: versionId, objectType: 'setting', status: VersionStatus.Current }))

  return apiRequest<StructureActionResultDTO>(`/novels/${novelId}/settings/${versionId}/adopt`, {
    method: 'POST',
    body: request,
  })
}

export async function editStructureAsset(
  novelId: string,
  objectType: StructureAssetType,
  versionId: string,
  request: EditStructureAssetRequest,
  mode: ApiMode = getApiMode(),
): Promise<StructureActionResultDTO> {
  if (mode === 'mock') {
    const result = createMockStructureActionResult(
      novelId,
      objectType,
      createMockStructureAsset({
        id: `mock-${objectType}-manual-edit-${Date.now()}`,
        objectType,
        title: request.title,
        summary: request.summary,
        riskTags: request.riskTags,
        recommendedReason: request.recommendation,
        content: {
          title: request.title,
          summary: request.summary,
          sections: [
            {
              title: request.sectionTitle,
              body: request.sectionBody,
              items: request.sectionItems,
            },
          ],
          stages: [],
          chapters: [],
          riskTags: request.riskTags,
          recommendation: request.recommendation,
        },
      }),
    )
    applyMockStructureActionResult(novelId, result)
    return result
  }

  return apiRequest<StructureActionResultDTO>(`/novels/${novelId}/${getStructureAssetResource(objectType)}/${versionId}/edit`, {
    method: 'POST',
    body: request,
  })
}

export async function generateOutline(
  novelId: string,
  request: GenerateStructureAssetRequest = {},
  mode: ApiMode = getApiMode(),
): Promise<StructureActionResultDTO> {
  if (mode === 'mock') return createMockStructureActionResult(novelId, 'outline')

  return apiRequest<StructureActionResultDTO>(`/novels/${novelId}/outlines/generate`, {
    method: 'POST',
    body: request,
  })
}

export async function adoptOutline(
  novelId: string,
  versionId: string,
  request: AdoptStructureAssetRequest,
  mode: ApiMode = getApiMode(),
): Promise<StructureActionResultDTO> {
  if (mode === 'mock') return createMockStructureActionResult(novelId, 'outline', createMockStructureAsset({ id: versionId, objectType: 'outline', status: VersionStatus.Current }))

  return apiRequest<StructureActionResultDTO>(`/novels/${novelId}/outlines/${versionId}/adopt`, {
    method: 'POST',
    body: request,
  })
}

export async function generateStageOutline(
  novelId: string,
  request: GenerateStructureAssetRequest = {},
  mode: ApiMode = getApiMode(),
): Promise<StructureActionResultDTO> {
  if (mode === 'mock') return createMockStructureActionResult(novelId, 'stage_outline')

  return apiRequest<StructureActionResultDTO>(`/novels/${novelId}/stage-outlines/generate`, {
    method: 'POST',
    body: request,
  })
}

export async function adoptStageOutline(
  novelId: string,
  versionId: string,
  request: AdoptStructureAssetRequest,
  mode: ApiMode = getApiMode(),
): Promise<StructureActionResultDTO> {
  if (mode === 'mock') return createMockStructureActionResult(novelId, 'stage_outline', createMockStructureAsset({ id: versionId, objectType: 'stage_outline', status: VersionStatus.Current }))

  return apiRequest<StructureActionResultDTO>(`/novels/${novelId}/stage-outlines/${versionId}/adopt`, {
    method: 'POST',
    body: request,
  })
}

export async function generateChapterPlan(
  novelId: string,
  request: GenerateStructureAssetRequest = {},
  mode: ApiMode = getApiMode(),
): Promise<StructureActionResultDTO> {
  if (mode === 'mock') return createMockStructureActionResult(novelId, 'chapter_plan')

  return apiRequest<StructureActionResultDTO>(`/novels/${novelId}/chapter-plans/generate`, {
    method: 'POST',
    body: request,
  })
}

export async function adoptChapterPlan(
  novelId: string,
  versionId: string,
  request: AdoptStructureAssetRequest,
  mode: ApiMode = getApiMode(),
): Promise<StructureActionResultDTO> {
  if (mode === 'mock') return createMockStructureActionResult(novelId, 'chapter_plan', createMockStructureAsset({ id: versionId, objectType: 'chapter_plan', status: VersionStatus.Current }))

  return apiRequest<StructureActionResultDTO>(`/novels/${novelId}/chapter-plans/${versionId}/adopt`, {
    method: 'POST',
    body: request,
  })
}

export async function updateChapterWordTargets(
  novelId: string,
  request: UpdateChapterWordTargetsRequest,
  mode: ApiMode = getApiMode(),
): Promise<StructureActionResultDTO> {
  if (mode === 'mock') return createMockStructureActionResult(novelId, 'chapter_plan')

  return apiRequest<StructureActionResultDTO>(`/novels/${novelId}/chapter-plans/word-targets`, {
    method: 'PATCH',
    body: request,
  })
}

export async function generateTrial(
  novelId: string,
  request: GenerateTrialRequest = {},
  mode: ApiMode = getApiMode(),
): Promise<TrialActionResultDTO> {
  if (mode === 'mock') return createMockTrialActionResult(novelId, request)

  return apiRequest<TrialActionResultDTO>(`/novels/${novelId}/trial/generate`, {
    method: 'POST',
    body: request,
  })
}

export async function confirmTrial(
  novelId: string,
  request: ConfirmTrialRequest,
  mode: ApiMode = getApiMode(),
): Promise<TrialActionResultDTO> {
  if (mode === 'mock') return createMockTrialActionResult(novelId, { trialRunId: request.trialRunId })

  return apiRequest<TrialActionResultDTO>(`/novels/${novelId}/trial/confirm`, {
    method: 'POST',
    body: request,
  })
}

export async function getChapterWorkbench(
  novelId: string,
  chapterId: string,
  mode: ApiMode = getApiMode(),
): Promise<ChapterWorkbenchDTO> {
  if (mode === 'mock') return createMockChapterWorkbench(novelId, chapterId)

  return apiRequest<ChapterWorkbenchDTO>(`/novels/${novelId}/chapters/${chapterId}`)
}

export async function generateBodyBatch(
  novelId: string,
  request: GenerateBodyBatchRequest,
  mode: ApiMode = getApiMode(),
): Promise<BodyBatchActionResultDTO> {
  if (mode === 'mock') return createMockBodyBatchActionResult(novelId, request)

  return apiRequest<BodyBatchActionResultDTO>(`/novels/${novelId}/chapters/batch-generate`, {
    method: 'POST',
    body: request,
  })
}

export async function generateChapterBody(
  novelId: string,
  chapterId: string,
  request: GenerateChapterBodyRequest,
  mode: ApiMode = getApiMode(),
): Promise<BodyBatchActionResultDTO> {
  if (mode === 'mock') return createMockBodyBatchActionResult(novelId, request)

  return apiRequest<BodyBatchActionResultDTO>(`/novels/${novelId}/chapters/${chapterId}/generate`, {
    method: 'POST',
    body: request,
  })
}

export async function rewriteChapter(
  novelId: string,
  chapterId: string,
  request: RewriteChapterRequest = {},
  mode: ApiMode = getApiMode(),
): Promise<ChapterRewriteResultDTO> {
  if (mode === 'mock') return createMockChapterRewriteResult(novelId, chapterId)

  return apiRequest<ChapterRewriteResultDTO>(`/novels/${novelId}/chapters/${chapterId}/rewrite`, {
    method: 'POST',
    body: request,
  })
}

export async function adoptChapterContentVersion(
  novelId: string,
  chapterId: string,
  versionId: string,
  request: AdoptChapterContentVersionRequest = {},
  mode: ApiMode = getApiMode(),
): Promise<ChapterContentAdoptionResultDTO> {
  if (mode === 'mock') return createMockChapterAdoptionResult(novelId, chapterId, versionId)

  return apiRequest<ChapterContentAdoptionResultDTO>(`/novels/${novelId}/chapters/${chapterId}/content-versions/${versionId}/adopt`, {
    method: 'POST',
    body: request,
  })
}

export async function createImpactAssessment(
  novelId: string,
  chapterId: string,
  request: CreateImpactAssessmentRequest = {},
  mode: ApiMode = getApiMode(),
): Promise<ImpactAssessmentActionResultDTO> {
  if (mode === 'mock') return createMockImpactAssessmentResult(novelId, chapterId)

  return apiRequest<ImpactAssessmentActionResultDTO>(`/novels/${novelId}/chapters/${chapterId}/impact-assessments`, {
    method: 'POST',
    body: request,
  })
}

export async function getImpactCase(
  novelId: string,
  impactCaseId: string,
  mode: ApiMode = getApiMode(),
): Promise<ImpactCaseDTO> {
  if (mode === 'mock') return createMockImpactCase(novelId, impactCaseId)

  return apiRequest<ImpactCaseDTO>(`/novels/${novelId}/impact-cases/${impactCaseId}`)
}

export async function resolveImpactCase(
  novelId: string,
  impactCaseId: string,
  request: ResolveImpactCaseRequest,
  mode: ApiMode = getApiMode(),
): Promise<ImpactCaseResolveResultDTO> {
  if (mode === 'mock') {
    return {
      novelId,
      statusSummary: createMockStatusSummary(NovelCreationStage.Body, StageStatus.NotStarted, '正文生成'),
      impactCase: createMockImpactCase(novelId, impactCaseId, request.resolution),
      nextAction: createMockStatusSummary(NovelCreationStage.Body, StageStatus.NotStarted, '正文生成').recommendedAction,
    }
  }

  return apiRequest<ImpactCaseResolveResultDTO>(`/novels/${novelId}/impact-cases/${impactCaseId}/resolve`, {
    method: 'POST',
    body: request,
  })
}

export async function startFullReview(
  novelId: string,
  request: StartFullReviewRequest,
  mode: ApiMode = getApiMode(),
): Promise<FullReviewActionResultDTO> {
  if (mode === 'mock') return createMockFullReviewActionResult(novelId)

  return apiRequest<FullReviewActionResultDTO>(`/novels/${novelId}/full-review`, {
    method: 'POST',
    body: request,
  })
}

export async function getLatestFullReview(
  novelId: string,
  mode: ApiMode = getApiMode(),
): Promise<FullReviewLatestResultDTO> {
  if (mode === 'mock') {
    const result = createMockFullReviewActionResult(novelId)
    return {
      novelId,
      fullReview: result.fullReview,
      statusSummary: result.statusSummary,
      nextAction: result.nextAction,
    }
  }

  return apiRequest<FullReviewLatestResultDTO>(`/novels/${novelId}/full-review/latest`)
}

export async function resolveFullReviewIssue(
  novelId: string,
  reviewId: string,
  request: ResolveFullReviewIssueRequest,
  mode: ApiMode = getApiMode(),
): Promise<FullReviewIssueActionResultDTO> {
  if (mode === 'mock') {
    const result = createMockFullReviewActionResult(novelId)
    return {
      novelId,
      statusSummary: result.statusSummary,
      fullReview: result.fullReview,
      issue: result.fullReview.issues[0],
      nextAction: result.nextAction,
    }
  }

  return apiRequest<FullReviewIssueActionResultDTO>(`/novels/${novelId}/full-review/${reviewId}/resolve-issue`, {
    method: 'POST',
    body: request,
  })
}

export async function forcePassFullReview(
  novelId: string,
  reviewId: string,
  request: ForcePassFullReviewRequest,
  mode: ApiMode = getApiMode(),
): Promise<FullReviewActionResultDTO> {
  if (mode === 'mock') return createMockFullReviewActionResult(novelId)

  return apiRequest<FullReviewActionResultDTO>(`/novels/${novelId}/full-review/${reviewId}/force-pass`, {
    method: 'POST',
    body: request,
  })
}

export async function confirmCompletion(
  novelId: string,
  request: ConfirmCompletionRequest,
  mode: ApiMode = getApiMode(),
): Promise<CompletionActionResultDTO> {
  if (mode === 'mock') return createMockCompletionActionResult(novelId)

  return apiRequest<CompletionActionResultDTO>(`/novels/${novelId}/completion/confirm`, {
    method: 'POST',
    body: request,
  })
}

export async function getVideoReadiness(
  novelId: string,
  mode: ApiMode = getApiMode(),
): Promise<VideoReadinessDTO> {
  if (mode === 'mock') return createMockCompletionActionResult(novelId).videoReadiness

  return apiRequest<VideoReadinessDTO>(`/novels/${novelId}/video-readiness`)
}

export async function recheckVideoReadiness(
  novelId: string,
  request: RecheckVideoReadinessRequest = {},
  mode: ApiMode = getApiMode(),
): Promise<VideoReadinessActionResultDTO> {
  if (mode === 'mock') return createMockVideoReadinessActionResult(novelId)

  return apiRequest<VideoReadinessActionResultDTO>(`/novels/${novelId}/video-readiness/recheck`, {
    method: 'POST',
    body: request,
  })
}

export async function confirmVideoReadiness(
  novelId: string,
  request: ConfirmVideoReadinessRequest,
  mode: ApiMode = getApiMode(),
): Promise<VideoReadinessActionResultDTO> {
  if (mode === 'mock') return createMockVideoReadinessActionResult(novelId)

  return apiRequest<VideoReadinessActionResultDTO>(`/novels/${novelId}/video-readiness/confirm`, {
    method: 'POST',
    body: request,
  })
}

export async function requestUnifiedErrorForSmoke() {
  return apiRequest<NovelListResultDTO>('/novels', {
    query: {
      page: 0,
      pageSize: 20,
    },
  })
}

export function toNovelListRow(item: NovelListItemDTO): NovelListRow {
  const videoReferenceText = getVideoReferenceText(item)

  return {
    id: item.id,
    title: item.title,
    genre: item.genres.join('、') || '未选择题材',
    hotspot: item.creationSource.label,
    creationSourceType: item.creationSource.type,
    creationSourceText: getCreationSourceText(item),
    stage: item.statusSummary.displayStatusText,
    status: item.statusSummary.displayStatusText,
    creationStage: item.creationStage,
    lifecycleStatus: item.lifecycleStatus,
    stageStatus: item.stageStatus,
    chapterProgress: item.chapterProgress.text,
    pendingChapters: item.chapterProgress.pendingChapterCount,
    qualityScore: item.scoreSummary.qualityScore === null ? '暂无' : String(item.scoreSummary.qualityScore),
    marketScore: item.scoreSummary.marketScore === null ? '暂无' : String(item.scoreSummary.marketScore),
    videoReferenceStatus: item.videoReferenceSummary.status,
    videoStatus: videoReferenceText,
    taskStatus: item.recentTask?.statusText ?? '无运行任务',
    recentTaskId: item.recentTask?.id ?? null,
    recentTaskProgress: item.recentTask?.progress ?? null,
    updatedAt: formatDateTime(item.updatedAt),
    action: {
      label: item.statusSummary.recommendedAction.label,
      reason: item.statusSummary.recommendedAction.reasonText,
      intent: item.statusSummary.blockingReasons.length > 0 ? 'warning' : 'info',
      target: 'page',
    },
    primaryAction: {
      label: item.primaryAction.label,
      target: item.primaryAction.target,
    },
    topIssues:
      item.statusSummary.blockingReasons.length > 0
        ? item.statusSummary.blockingReasons
        : [item.statusSummary.recommendedAction.reasonText],
  }
}

function getCreationSourceText(item: NovelListItemDTO) {
  if (item.creationSource.type === 'hotspot_reference') {
    return item.creationSource.hotspotTitle ? `引用热点：${item.creationSource.hotspotTitle}` : '引用热点';
  }

  return item.creationSource.label;
}

function getVideoReferenceText(item: NovelListItemDTO) {
  if (item.creationStage === NovelCreationStage.VideoReady || item.videoReferenceSummary.status === 'ready') {
    return '可被视频引用'
  }

  return item.videoReferenceSummary.statusText
}

export function toDirectionCandidateRow(candidate: DirectionCandidateDTO): DirectionCandidateRow {
  return {
    id: candidate.id,
    title: candidate.title,
    versionLabel: `v${candidate.versionNo}`,
    statusKey: candidate.status,
    status: getVersionStatusText(candidate.status),
    scoreText: String(candidate.score),
    marketScoreText: String(candidate.marketScore),
    riskLevelText: getRiskLevelText(candidate.riskLevel),
    riskTags: candidate.riskTags,
    logline: candidate.content.logline,
    coreHook: candidate.content.coreHook,
    audienceAppeal: candidate.content.audienceAppeal,
    videoPotential: candidate.content.videoPotential,
    sellingPoints: candidate.content.sellingPoints,
    primaryReason: candidate.recommendedReason,
    lowScoreRequiresConfirm: candidate.score < 70,
    canAdopt: candidate.status === VersionStatus.Candidate && candidate.staleLevel !== StaleLevel.HardStale,
  }
}

export function toStructureAssetRow(asset: StructureAssetDTO): StructureAssetRow {
  return {
    id: asset.id,
    objectType: asset.objectType,
    typeText: getStructureAssetTypeText(asset.objectType),
    title: asset.title,
    versionLabel: `v${asset.versionNo}`,
    statusKey: asset.status,
    status: getVersionStatusText(asset.status),
    scoreText: String(asset.score),
    riskLevelText: getRiskLevelText(asset.riskLevel),
    riskTags: asset.riskTags,
    summary: asset.summary,
    sections: asset.content.sections,
    stages: asset.content.stages,
    chapterCount: asset.content.chapters.length,
    primaryReason: asset.recommendedReason,
    canAdopt: asset.status === VersionStatus.Candidate && asset.staleLevel !== StaleLevel.HardStale,
    highRiskRequiresConfirm: asset.riskLevel === RiskLevel.High || asset.riskLevel === RiskLevel.Blocking,
  }
}

export function toNovelChapterPlanRow(chapter: NovelChapterDTO): NovelChapterPlanRow {
  return {
    id: chapter.id,
    chapterNo: chapter.chapterNo,
    stageIndex: chapter.stageIndex,
    title: chapter.title,
    wordTarget: chapter.wordTarget === null ? '-' : String(chapter.wordTarget),
    wordCount: String(chapter.wordCount),
    statusText: getChapterStatusText(chapter.mainStatus),
    statusNote: chapter.statusNote ?? '正文尚未生成',
    impactLevelText: getImpactLevelText(chapter.impactLevel),
    hasCurrentContent: Boolean(chapter.currentContentVersionId),
  }
}

export function toTrialCandidateRow(candidate: TrialChapterCandidateDTO): TrialCandidateRow {
  const score = candidate.scoring.totalScore

  return {
    id: candidate.id,
    chapterId: candidate.chapterId,
    title: candidate.title,
    versionLabel: `v${candidate.versionNo}`,
    statusText: getVersionStatusText(candidate.status),
    scoreText: String(score),
    gateText: candidate.scoring.gateResultText,
    riskLevelText: getRiskLevelText(candidate.riskLevel),
    riskTags: candidate.riskTags,
    openingStrategy: candidate.openingStrategy,
    openingHighlight: candidate.openingHighlight,
    firstSentence: candidate.firstSentence,
    first300Summary: candidate.first300Summary,
    endingHook: candidate.endingHook,
    aiRecommendedReason: candidate.aiRecommendedReason,
    isAiRecommended: candidate.isAiRecommended,
    isSelected: candidate.isSelected,
    canSelect: candidate.status === VersionStatus.Candidate,
    requiresRiskConfirm: score < 75 || candidate.scoring.gateResult !== 'pass',
    evidence: candidate.scoring.evidence,
    penalties: candidate.scoring.penalties,
    content: candidate.content,
  }
}

export function toTrialChapterResultRow(result: TrialChapterResultDTO): TrialChapterResultRow {
  return {
    id: result.id,
    chapterId: result.chapterId,
    chapterNo: result.chapterNo,
    title: result.title,
    statusText: result.hardFailed ? '硬失败暂停' : result.status === 'completed' ? '已生成' : result.status,
    scoreText: String(result.score),
    hardFailed: result.hardFailed,
    hardFailureReasons: result.hardFailureReasons,
    summary: result.contentVersion?.first300Summary ?? result.reviewReport?.summary ?? '暂无摘要',
    issueCount: result.reviewReport?.issues.length ?? 0,
  }
}

function listMockNovels(query: NovelListQuery): NovelListResult {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  const matched = novels.filter((novel) => matchesKeyword(novel, query.keyword)).map(toMockNovelListRow)
  const start = (page - 1) * pageSize

  return {
    items: matched.slice(start, start + pageSize),
    page,
    pageSize,
    total: matched.length,
  }
}

function matchesKeyword(novel: Novel, keyword?: string) {
  if (!keyword) {
    return true
  }

  return novel.title.includes(keyword) || novel.genre.includes(keyword) || novel.hotspot.includes(keyword)
}

function toMockNovelListRow(novel: Novel): NovelListRow {
  return {
    ...novel,
    hotspot: '系统推荐',
    creationSourceType: 'system_recommendation',
    creationSourceText: `系统推荐 / ${novel.hotspot}`,
    creationStage: inferCreationStage(novel.stage),
    lifecycleStatus: NovelLifecycleStatus.Active,
    stageStatus: novel.status.includes('生成中') ? StageStatus.Processing : novel.status.includes('需') ? StageStatus.Blocked : StageStatus.NotStarted,
    qualityScore: String(novel.qualityScore),
    marketScore: String(novel.marketScore),
    videoReferenceStatus: inferVideoReferenceStatus(novel.videoStatus),
    recentTaskId: null,
    recentTaskProgress: null,
    primaryAction: {
      label: '详情',
      target: 'detail',
    },
  }
}

function inferCreationStage(stage: string) {
  if (stage.includes('待视频化')) return NovelCreationStage.VideoReady
  if (stage.includes('正文')) return NovelCreationStage.Body
  if (stage.includes('试写')) return NovelCreationStage.Trial
  return NovelCreationStage.Draft
}

function inferVideoReferenceStatus(statusText: string) {
  if (statusText.includes('可被视频引用')) return 'ready'
  if (statusText.includes('可被引用')) return 'ready'
  if (statusText.includes('已引用')) return 'referenced'
  if (statusText.includes('异常')) return 'exception'
  return 'not_referenced'
}

function createMockDraft(request: CreateNovelDraftRequest): NovelDetailDTO {
  const now = new Date().toISOString()
  const title = request.title.trim()
  const genres = request.genres ?? []
  const chapterLimit = request.chapterLimit ?? 80
  const chapterWordMin = request.chapterWordRange?.min ?? 1800
  const chapterWordMax = request.chapterWordRange?.max ?? 2600
  const creationSource = createMockCreationSourceSummary(request)

  return {
    id: `mock-${Date.now()}`,
    title,
    channel: request.channel ?? 'novel',
    genres,
    lifecycleStatus: NovelLifecycleStatus.Active,
    creationStage: NovelCreationStage.Draft,
    stageStatus: StageStatus.NotStarted,
    statusSummary: {
      lifecycleStatus: NovelLifecycleStatus.Active,
      creationStage: NovelCreationStage.Draft,
      stageStatus: StageStatus.NotStarted,
      displayStatus: 'draft_created',
      displayStatusText: '草稿已创建',
      currentStep: '准备生成小说方向',
      completedSteps: ['创建草稿'],
      blockingReasons: [],
      recommendedAction: {
        type: 'view_detail',
        label: '进入详情',
        reasonText: '暂无 AI 结果，下一步需要进入详情后生成小说方向。',
        target: 'detail',
        disabled: false,
        disabledReason: null,
        confirmRequired: false,
        taskType: 'novel_direction_generate',
      },
      videoPreparationStatus: 'not_ready',
      videoReferenceStatus: 'not_referenced',
      calculatedAt: now,
      calculationVersion: 'novel-status-v1',
    },
    scoreSummary: { qualityScore: null, marketScore: null, riskLevel: 'none' },
    chapterProgress: {
      plannedChapterCount: chapterLimit,
      completedChapterCount: 0,
      pendingChapterCount: 0,
      text: `0/${chapterLimit}`,
    },
    videoReferenceSummary: {
      status: 'not_referenced',
      statusText: '未准备',
      referencedVideoCount: 0,
    },
    creationSource,
    recentTask: null,
    primaryAction: {
      type: 'view_detail',
      label: '详情',
      target: 'detail',
    },
    createdAt: now,
    updatedAt: now,
    preferences: {
      creationSourceType: creationSource.type,
      creationSourceLabel: creationSource.label,
      creationSourceDescription: creationSource.description,
      hotspotReportId: request.hotspotReportId ?? null,
      hotspotOpportunityId: request.hotspotOpportunityId ?? null,
      hotspotTitle: creationSource.hotspotTitle,
      hotspotOpportunityTitle: creationSource.hotspotOpportunityTitle,
      appealPoints: request.preferences?.appealPoints ?? [],
      genres,
      openingState: request.preferences?.openingState ?? null,
      blockedElements: request.preferences?.blockedElements ?? [],
      targetAudience: request.preferences?.targetAudience ?? null,
      chapterLimit,
      chapterWordMin,
      chapterWordMax,
      stageCount: request.preferences?.stageCount ?? null,
      customIdea: request.preferences?.customIdea ?? null,
      style: request.preferences?.style ?? null,
      videoAdaptationPreference: request.preferences?.videoAdaptationPreference ?? null,
    },
    currentAssets: { direction: null, setting: null, outline: null, stageOutline: null, chapterPlan: null },
    directionCandidates: [],
    structureCandidates: [],
    chapters: [],
    chapterStats: {
      plannedChapterCount: chapterLimit,
      completedChapterCount: 0,
      pendingChapterCount: 0,
      text: `0/${chapterLimit}`,
    },
    latestTrialRun: null,
    bodyStrategySnapshot: null,
    bodyGeneration: null,
    latestFullReview: null,
    completionDecision: null,
    videoReadiness: null,
    recentTasks: [],
    blockingReasons: [],
    videoSummary: {
      status: 'not_referenced',
      statusText: '未准备',
      referencedVideoCount: 0,
    },
  }
}

function createMockCreationSourceSummary(request: CreateNovelDraftRequest): NovelDetailDTO['creationSource'] {
  const sourceType = request.creationSourceType ?? 'system_recommendation'

  if (sourceType === 'hotspot_reference') {
    return {
      type: 'hotspot_reference',
      label: '引用热点',
      description: '基于已验证的热点报告或机会点作为方向生成参考。',
      hotspotReportId: request.hotspotReportId ?? null,
      hotspotOpportunityId: request.hotspotOpportunityId ?? null,
      hotspotTitle: request.hotspotReportId ? '测试热点报告' : null,
      hotspotOpportunityTitle: request.hotspotOpportunityId ? '测试热点机会点' : null,
      isLegacyUnknown: false,
      unavailableReason: null,
    }
  }

  if (sourceType === 'manual_idea') {
    return {
      type: 'manual_idea',
      label: '手动想法',
      description: '围绕用户填写的核心想法扩展方向。',
      hotspotReportId: null,
      hotspotOpportunityId: null,
      hotspotTitle: null,
      hotspotOpportunityTitle: null,
      isLegacyUnknown: false,
      unavailableReason: null,
    }
  }

  return {
    type: 'system_recommendation',
    label: '系统推荐',
    description: '按题材、爽点和默认策略作为方向生成参考。',
    hotspotReportId: null,
    hotspotOpportunityId: null,
    hotspotTitle: null,
    hotspotOpportunityTitle: null,
    isLegacyUnknown: false,
    unavailableReason: null,
  }
}

function createMockDetail(novelId: string): NovelDetailDTO {
  const novel = novels.find((item) => item.id === novelId)
  const detail = createMockDraft({
    title: novel?.title ?? '重生后我靠系统逆袭',
    genres: novel?.genre ? [novel.genre] : ['都市逆袭'],
    preferences: {
      appealPoints: ['低谷翻盘'],
      targetAudience: '18-35 岁爽文用户',
    },
  })

  detail.id = novelId

  applyHighRiskConfirmationFixture(detail, novelId)

  if (novel?.stage.includes('待视频化')) {
    const fullReview = createMockFullReviewActionResult(novelId)
    const completion = createMockCompletionActionResult(novelId)
    const readiness = createMockVideoReadinessActionResult(novelId)
    const statusSummary = createMockStatusSummary(NovelCreationStage.VideoReady, StageStatus.Completed, '待视频化')
    statusSummary.currentStep = '小说已进入待视频化'
    statusSummary.completedSteps = ['创建草稿', '确认方向', '确认设定', '确认大纲', '确认章节目录', '试写通过', '正文完成', '全书审稿通过', '待视频化确认']
    statusSummary.recommendedAction = readiness.videoReadiness.recommendedAction
    statusSummary.videoPreparationStatus = 'ready'
    statusSummary.videoReferenceStatus = 'ready'

    detail.creationStage = NovelCreationStage.VideoReady
    detail.stageStatus = StageStatus.Completed
    detail.statusSummary = statusSummary
    detail.chapterProgress = {
      plannedChapterCount: 48,
      completedChapterCount: 48,
      pendingChapterCount: 0,
      text: '48/48',
    }
    detail.chapterStats = detail.chapterProgress
    detail.scoreSummary = {
      qualityScore: novel.qualityScore,
      marketScore: novel.marketScore,
      riskLevel: 'low',
    }
    detail.videoReferenceSummary = {
      status: 'ready',
      statusText: '可被视频引用',
      referencedVideoCount: 0,
    }
    detail.videoSummary = detail.videoReferenceSummary
    detail.latestFullReview = fullReview.fullReview
    detail.completionDecision = completion.completionDecision
    detail.videoReadiness = readiness.videoReadiness
  }

  return {
    ...detail,
    ...mockDetailOverrides.get(novelId),
  }
}

function applyHighRiskConfirmationFixture(detail: NovelDetailDTO, novelId: string) {
  if (!novelId.startsWith('qa-')) return

  const now = new Date().toISOString()
  const direction = createMockDirectionCandidate({
    id: 'qa-current-direction',
    status: VersionStatus.Current,
  })
  const setting = createMockStructureAsset({
    id: 'qa-current-setting',
    objectType: 'setting',
    status: VersionStatus.Current,
  })
  const outline = createMockStructureAsset({
    id: 'qa-current-outline',
    objectType: 'outline',
    status: VersionStatus.Current,
  })
  const stageOutline = createMockStructureAsset({
    id: 'qa-current-stage-outline',
    objectType: 'stage_outline',
    status: VersionStatus.Current,
  })
  const chapterPlan = createMockStructureAsset({
    id: 'qa-current-chapter-plan',
    objectType: 'chapter_plan',
    status: VersionStatus.Current,
  })
  const plannedChapters = createMockChaptersFromPlan(chapterPlan)

  detail.title = getHighRiskFixtureTitle(novelId)
  detail.currentAssets = {
    direction,
    setting,
    outline,
    stageOutline,
    chapterPlan,
  }
  detail.directionCandidates = [direction]
  detail.structureCandidates = [setting, outline, stageOutline, chapterPlan]
  detail.chapters = plannedChapters
  detail.chapterStats = {
    plannedChapterCount: plannedChapters.length,
    completedChapterCount: 0,
    pendingChapterCount: 0,
    text: `0/${plannedChapters.length}`,
  }
  detail.chapterProgress = detail.chapterStats
  detail.updatedAt = now
  detail.statusSummary.completedSteps = ['创建草稿', '确认方向', '确认设定', '确认大纲', '确认章节目录']

  if (novelId === 'qa-risk-trial') {
    const trialResult = createMockTrialActionResult(novelId, {})
    detail.creationStage = NovelCreationStage.Trial
    detail.stageStatus = StageStatus.WaitingUser
    detail.statusSummary = {
      ...trialResult.statusSummary,
      displayStatusText: '风险试写候选待选择',
    }
    detail.latestTrialRun = trialResult.trialRun
    detail.recentTask = trialResult.task
    detail.recentTasks = [trialResult.task]
    detail.scoreSummary = {
      qualityScore: 68,
      marketScore: 82,
      riskLevel: 'medium',
    }
    return
  }

  if (novelId === 'qa-body-batch') {
    const bodyGeneration = createMockBodyGenerationState('qa-body-strategy-001', 3)
    detail.creationStage = NovelCreationStage.Body
    detail.stageStatus = StageStatus.NotStarted
    detail.statusSummary = createMockStatusSummary(NovelCreationStage.Body, StageStatus.NotStarted, '正文待生成')
    detail.statusSummary.completedSteps = [...detail.statusSummary.completedSteps, '试写通过']
    detail.bodyStrategySnapshot = bodyGeneration.strategySnapshot
    detail.bodyGeneration = bodyGeneration
    detail.chapterProgress = bodyGeneration.chapterProgress
    detail.chapterStats = bodyGeneration.chapterProgress
    detail.chapters = plannedChapters.map((chapter) => ({
      ...chapter,
      wordCount: chapter.chapterNo <= 3 ? 2200 : 0,
      mainStatus: chapter.chapterNo <= 3 ? 'completed' : 'pending',
      statusNote: chapter.chapterNo <= 3 ? '试写版本已确认进入正式正文。' : '等待批量正文生成。',
      currentContentVersionId: chapter.chapterNo <= 3 ? `qa-trial-content-${chapter.chapterNo}` : null,
    }))
    detail.scoreSummary = {
      qualityScore: 83,
      marketScore: 86,
      riskLevel: 'low',
    }
    return
  }

  if (novelId === 'qa-full-review') {
    const fullReview = createMockFullReviewActionResult(novelId)
    detail.creationStage = NovelCreationStage.CompletionConfirm
    detail.stageStatus = StageStatus.WaitingUser
    detail.statusSummary = fullReview.statusSummary
    detail.latestFullReview = fullReview.fullReview
    detail.recentTask = fullReview.task
    detail.recentTasks = [fullReview.task]
    detail.chapterProgress = {
      plannedChapterCount: 12,
      completedChapterCount: 12,
      pendingChapterCount: 0,
      text: '12/12',
    }
    detail.chapterStats = detail.chapterProgress
    detail.chapters = createCompletedMockChapters(12)
    detail.scoreSummary = {
      qualityScore: fullReview.fullReview.totalScore,
      marketScore: 88,
      riskLevel: 'low',
    }
    return
  }

  if (novelId === 'qa-video-readiness') {
    const fullReview = createMockFullReviewActionResult(novelId)
    const completion = createMockCompletionActionResult(novelId)
    detail.creationStage = NovelCreationStage.CompletionConfirm
    detail.stageStatus = StageStatus.Completed
    detail.statusSummary = completion.statusSummary
    detail.latestFullReview = fullReview.fullReview
    detail.completionDecision = completion.completionDecision
    detail.videoReadiness = completion.videoReadiness
    detail.chapterProgress = {
      plannedChapterCount: 12,
      completedChapterCount: 12,
      pendingChapterCount: 0,
      text: '12/12',
    }
    detail.chapterStats = detail.chapterProgress
    detail.chapters = createCompletedMockChapters(12)
    detail.scoreSummary = {
      qualityScore: completion.completionDecision.score,
      marketScore: 88,
      riskLevel: 'low',
    }
  }
}

function getHighRiskFixtureTitle(novelId: string) {
  if (novelId === 'qa-risk-trial') return 'QA 风险试写确认夹具'
  if (novelId === 'qa-body-batch') return 'QA 批量正文确认夹具'
  if (novelId === 'qa-full-review') return 'QA 全书审稿确认夹具'
  if (novelId === 'qa-video-readiness') return 'QA 待视频化确认夹具'
  return 'QA 高风险确认夹具'
}

function createMockChaptersFromPlan(chapterPlan: StructureAssetDTO) {
  return chapterPlan.content.chapters.map((chapter) => ({
    id: `qa-chapter-${chapter.chapterNo}`,
    chapterNo: chapter.chapterNo,
    stageIndex: chapter.stageIndex,
    title: chapter.title,
    wordTarget: chapter.wordTarget,
    wordCount: 0,
    mainStatus: 'pending',
    statusNote: '章节目录已确认，正文尚未生成。',
    impactLevel: 'none',
    currentContentVersionId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }))
}

function createCompletedMockChapters(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const chapterNo = index + 1
    return {
      id: `qa-chapter-${chapterNo}`,
      chapterNo,
      stageIndex: Math.floor(index / 3) + 1,
      title: `第${chapterNo}章 完成章节`,
      wordTarget: 2200,
      wordCount: 2200 + chapterNo * 12,
      mainStatus: 'completed',
      statusNote: '正式正文已确认，可用于全书审稿和待视频化检查。',
      impactLevel: 'none',
      currentContentVersionId: `qa-content-${chapterNo}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  })
}

function applyMockDetailActionResult(novelId: string, override: Partial<NovelDetailDTO>) {
  mockDetailOverrides.set(novelId, {
    ...mockDetailOverrides.get(novelId),
    ...override,
  })
}

function applyMockDirectionRevisionActionResult(novelId: string, result: DirectionActionResultDTO) {
  const detail = createMockDetail(novelId)
  const candidateIds = new Set(result.candidates.map((candidate) => candidate.id))
  applyMockDetailActionResult(novelId, {
    creationStage: result.statusSummary.creationStage,
    stageStatus: result.statusSummary.stageStatus,
    statusSummary: result.statusSummary,
    directionCandidates: [
      ...result.candidates,
      ...detail.directionCandidates.filter((candidate) => !candidateIds.has(candidate.id)),
    ],
    recentTask: result.task,
    recentTasks: [result.task, ...detail.recentTasks.filter((task) => task.id !== result.task.id)],
    updatedAt: new Date().toISOString(),
  })
}

function applyMockStructureActionResult(novelId: string, result: StructureActionResultDTO) {
  const detail = createMockDetail(novelId)
  const candidateIds = new Set(result.candidates.map((candidate) => candidate.id))
  applyMockDetailActionResult(novelId, {
    creationStage: result.statusSummary.creationStage,
    stageStatus: result.statusSummary.stageStatus,
    statusSummary: result.statusSummary,
    structureCandidates: [
      ...result.candidates,
      ...detail.structureCandidates.filter((candidate) => !candidateIds.has(candidate.id)),
    ],
    recentTask: result.task,
    recentTasks: [result.task, ...detail.recentTasks.filter((task) => task.id !== result.task.id)],
    updatedAt: new Date().toISOString(),
  })
}

function getStructureAssetResource(objectType: StructureAssetType) {
  if (objectType === 'setting') return 'settings'
  if (objectType === 'outline') return 'outlines'
  if (objectType === 'stage_outline') return 'stage-outlines'
  return 'chapter-plans'
}

function createMockDirectionActionResult(
  novelId: string,
  changedCandidate: DirectionCandidateDTO | null = null,
  currentDirection: DirectionCandidateDTO | null = null,
  taskType = 'novel_direction_generate',
): DirectionActionResultDTO {
  const candidates = changedCandidate ? [changedCandidate] : [createMockDirectionCandidate()]

  return {
    novelId,
    statusSummary: {
      lifecycleStatus: NovelLifecycleStatus.Active,
      creationStage: currentDirection ? NovelCreationStage.Setting : NovelCreationStage.Direction,
      stageStatus: currentDirection ? StageStatus.NotStarted : StageStatus.WaitingUser,
      displayStatus: currentDirection ? 'setting_not_started' : 'direction_waiting_user',
      displayStatusText: currentDirection ? '待生成设定' : '待选择方向',
      currentStep: currentDirection ? '准备生成小说设定' : '比较并采用小说方向',
      completedSteps: currentDirection ? ['创建草稿', '确认方向'] : ['创建草稿'],
      blockingReasons: [],
      recommendedAction: {
        type: currentDirection ? 'generate_setting' : 'adopt_direction',
        label: currentDirection ? '生成设定' : '选择方向',
        reasonText: currentDirection ? '方向已采用，下一步进入设定生成。' : '已生成方向候选，采用一个方向后进入设定阶段。',
        target: 'detail',
        disabled: false,
        disabledReason: null,
        confirmRequired: false,
        taskType: currentDirection ? 'novel_setting_generate' : 'novel_direction_adopt',
      },
      videoPreparationStatus: 'not_ready',
      videoReferenceStatus: 'not_referenced',
      calculatedAt: new Date().toISOString(),
      calculationVersion: 'novel-status-v1',
    },
    task: {
      id: `mock-task-${Date.now()}`,
      taskType: currentDirection ? 'novel_direction_adopt' : taskType,
      status: currentDirection ? TaskStatus.Completed : TaskStatus.WaitingConfirmation,
      statusText: currentDirection ? '已完成' : '待确认结果',
      progress: 100,
      currentStep: currentDirection ? '方向已采用，进入设定阶段' : getMockDirectionTaskStep(taskType),
      resultVersionIds: candidates.map((candidate) => candidate.id),
    },
    candidates,
    candidate: changedCandidate,
    currentDirection,
    affectedObjects: currentDirection ? ['direction', 'setting_stage'] : ['direction'],
    nextAction: {
      type: currentDirection ? 'generate_setting' : 'adopt_direction',
      label: currentDirection ? '生成设定' : '选择方向',
      reasonText: currentDirection ? '方向已采用，下一步进入设定生成。' : '已生成方向候选，采用一个方向后进入设定阶段。',
      target: 'detail',
      disabled: false,
      disabledReason: null,
      confirmRequired: false,
      taskType: currentDirection ? 'novel_setting_generate' : 'novel_direction_adopt',
    },
  }
}

function getMockDirectionTaskStep(taskType: string) {
  if (taskType === 'novel_direction_fuse') return '融合方向候选已生成，等待选择'
  if (taskType === 'novel_direction_optimize') return '优化方向候选已生成，等待选择'
  if (taskType === 'novel_direction_manual_edit') return '手动编辑方向候选已保存，等待选择'
  return '方向候选已生成，等待选择'
}

function createMockDirectionCandidateId(action: 'fuse' | 'optimize' | 'manual-edit') {
  const randomValue = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `mock-${action}-${randomValue}`
}

function createMockDirectionCandidate(overrides: Partial<DirectionCandidateDTO> = {}): DirectionCandidateDTO {
  return {
    id: 'mock-direction-001',
    versionNo: 1,
    status: VersionStatus.Candidate,
    staleLevel: StaleLevel.None,
    title: '低谷系统翻盘线',
    summary: '主角在最低谷获得成长系统，逐步完成反击。',
    content: {
      title: '低谷系统翻盘线',
      logline: '主角在最低谷获得成长系统，逐步完成反击。',
      coreHook: '前三章先给强压迫，再给公开反击。',
      audienceAppeal: '18-35 岁爽文用户',
      videoPotential: '适合拆成口播短视频。',
      sellingPoints: ['反击节奏明确', '短视频钩子清晰'],
      riskTags: ['系统设定需避免万能'],
      recommendation: '优先推荐，适合作为设定阶段输入。',
    },
    score: 86,
    marketScore: 88,
    riskLevel: RiskLevel.Low,
    riskTags: ['系统设定需避免万能'],
    recommendedReason: '题材、爽点和视频化表达都比较稳。',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function createMockStructureActionResult(
  novelId: string,
  objectType: StructureAssetType,
  currentAsset: StructureAssetDTO | null = null,
): StructureActionResultDTO {
  const candidate = currentAsset ?? createMockStructureAsset({ objectType })
  const isAdopted = currentAsset?.status === VersionStatus.Current

  return {
    novelId,
    statusSummary: {
      lifecycleStatus: NovelLifecycleStatus.Active,
      creationStage: getMockNextStage(objectType, isAdopted),
      stageStatus: isAdopted ? StageStatus.NotStarted : StageStatus.WaitingUser,
      displayStatus: isAdopted ? 'structure_adopted' : 'structure_waiting_user',
      displayStatusText: isAdopted ? getMockNextDisplayText(objectType) : `待确认${getStructureAssetTypeText(objectType)}`,
      currentStep: isAdopted ? '查看下一步结构任务' : `确认${getStructureAssetTypeText(objectType)}`,
      completedSteps: ['创建草稿', '确认方向'],
      blockingReasons: [],
      recommendedAction: {
        type: isAdopted ? 'view_detail' : `adopt_${objectType}`,
        label: isAdopted ? '查看下一步' : `采用${getStructureAssetTypeText(objectType)}`,
        reasonText: isAdopted ? '结构资产已采用，下一步会按状态摘要继续推进。' : '候选已生成，采用后才会成为正式资产。',
        target: 'detail',
        disabled: false,
        disabledReason: null,
        confirmRequired: false,
        taskType: isAdopted ? null : `adopt_${objectType}`,
      },
      videoPreparationStatus: 'not_ready',
      videoReferenceStatus: 'not_referenced',
      calculatedAt: new Date().toISOString(),
      calculationVersion: 'novel-status-v1',
    },
    task: {
      id: `mock-task-${Date.now()}`,
      taskType: isAdopted ? `adopt_${objectType}` : getMockStructureTaskType(objectType),
      status: isAdopted ? TaskStatus.Completed : TaskStatus.WaitingConfirmation,
      statusText: isAdopted ? '已完成' : '待确认结果',
      progress: 100,
      currentStep: isAdopted ? `${getStructureAssetTypeText(objectType)}已采用` : `${getStructureAssetTypeText(objectType)}候选已生成`,
      resultVersionIds: [candidate.id],
    },
    candidates: [candidate],
    candidate,
    currentAssets: {
      direction: null,
      setting: objectType === 'setting' && isAdopted ? candidate : null,
      outline: objectType === 'outline' && isAdopted ? candidate : null,
      stageOutline: objectType === 'stage_outline' && isAdopted ? candidate : null,
      chapterPlan: objectType === 'chapter_plan' && isAdopted ? candidate : null,
    },
    chapters: objectType === 'chapter_plan' && isAdopted
      ? candidate.content.chapters.map((chapter) => ({
          id: `mock-chapter-${chapter.chapterNo}`,
          chapterNo: chapter.chapterNo,
          stageIndex: chapter.stageIndex,
          title: chapter.title,
          wordTarget: chapter.wordTarget,
          wordCount: 0,
          mainStatus: 'pending',
          statusNote: '章节目录已确认，正文尚未生成。',
          impactLevel: 'none',
          currentContentVersionId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }))
      : [],
    affectedObjects: [objectType],
    nextAction: {
      type: isAdopted ? 'view_detail' : `adopt_${objectType}`,
      label: isAdopted ? '查看下一步' : `采用${getStructureAssetTypeText(objectType)}`,
      reasonText: isAdopted ? '结构资产已采用，下一步会按状态摘要继续推进。' : '候选已生成，采用后才会成为正式资产。',
      target: 'detail',
      disabled: false,
      disabledReason: null,
      confirmRequired: false,
      taskType: isAdopted ? null : `adopt_${objectType}`,
    },
  }
}

function createMockStructureAsset(overrides: Partial<StructureAssetDTO> = {}): StructureAssetDTO {
  const objectType = overrides.objectType ?? 'setting'
  const title = `${getStructureAssetTypeText(objectType)}候选`
  const chapters = Array.from({ length: objectType === 'chapter_plan' ? 8 : 0 }, (_, index) => ({
    chapterNo: index + 1,
    stageIndex: Math.floor(index / 2) + 1,
    title: `第${index + 1}章 结构节点`,
    wordTarget: 2200,
    goal: '推进主线目标',
    conflict: '制造阶段冲突',
    hook: '留下下一章钩子',
  }))

  return {
    id: `mock-${objectType}-${Date.now()}`,
    objectType,
    versionNo: 1,
    status: VersionStatus.Candidate,
    staleLevel: StaleLevel.None,
    title,
    summary: `${title}摘要，采用后才会成为正式资产。`,
    content: {
      title,
      summary: `${title}摘要，采用后才会成为正式资产。`,
      sections: [
        {
          title: '核心结构',
          body: '保留主角目标、冲突升级和阶段性爽点。',
          items: ['目标明确', '冲突可视化', '钩子清楚'],
        },
      ],
      stages: objectType === 'stage_outline' || objectType === 'chapter_plan'
        ? [
            {
              stageIndex: 1,
              title: '第一阶段：低谷破局',
              chapterRange: '1-20章',
              goal: '建立压迫和第一次反击',
              conflict: '主角缺少信任与资源',
              payoff: '完成公开反击',
            },
          ]
        : [],
      chapters,
      riskTags: ['需在后续试写中验证节奏'],
      recommendation: '可作为结构链路 mock 候选。',
    },
    score: 82,
    riskLevel: RiskLevel.Low,
    riskTags: ['需在后续试写中验证节奏'],
    recommendedReason: '字段完整，适合继续推进结构链路。',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function createMockTrialActionResult(novelId: string, request: GenerateTrialRequest): TrialActionResultDTO {
  const now = new Date().toISOString()
  const candidates = [88, 74, 82].map((score, index) => createMockTrialCandidate(score, index + 1, request.selectedCandidateId))
  const selected = request.selectedCandidateId
  const reviewReady = Boolean(request.trialRunId && selected)
  const chapterResults = reviewReady
    ? [
        createMockTrialChapterResult(1, candidates.find((candidate) => candidate.id === selected) ?? candidates[0]),
        createMockTrialChapterResult(2),
        createMockTrialChapterResult(3),
      ]
    : []

  return {
    novelId,
    statusSummary: {
      lifecycleStatus: NovelLifecycleStatus.Active,
      creationStage: NovelCreationStage.Trial,
      stageStatus: StageStatus.WaitingUser,
      displayStatus: 'trial_waiting_user',
      displayStatusText: reviewReady ? '试写总评待确认' : '待选择第1章候选',
      currentStep: reviewReady ? '确认试写总评并生成正文策略快照' : '选择第1章候选',
      completedSteps: ['创建草稿', '确认方向', '确认设定', '确认大纲', '确认章节目录'],
      blockingReasons: [],
      recommendedAction: {
        type: reviewReady ? 'confirm_trial_review' : 'select_trial_chapter_one',
        label: reviewReady ? '确认试写总评' : '选择第1章候选',
        reasonText: reviewReady ? '前三章试写总评已生成，请确认试写并生成策略快照。' : '候选不会自动选择，请先人工选择第1章版本。',
        target: 'detail',
        disabled: false,
        disabledReason: null,
        confirmRequired: false,
        taskType: 'trial_writing_generate',
      },
      videoPreparationStatus: 'not_ready',
      videoReferenceStatus: 'not_referenced',
      calculatedAt: now,
      calculationVersion: 'novel-status-v1',
    },
    task: {
      id: `mock-trial-task-${Date.now()}`,
      taskType: reviewReady ? 'trial_followup_generate' : 'trial_writing_generate',
      status: TaskStatus.WaitingConfirmation,
      statusText: '待确认结果',
      progress: 100,
      currentStep: reviewReady ? '前三章试写总评已生成' : '第1章候选已生成',
      resultVersionIds: candidates.map((candidate) => candidate.id),
    },
    trialRun: {
      id: request.trialRunId ?? 'mock-trial-run-001',
      novelId,
      status: reviewReady ? 'review_ready' : 'waiting_chapter1_selection',
      statusText: reviewReady ? '试写总评待确认' : '待选择第1章候选',
      chapterCount: 3,
      currentStep: reviewReady ? '确认试写总评并生成正文策略快照' : '选择第1章候选后继续生成第2-3章',
      selectedChapterOneCandidateId: selected ?? null,
      blockingReason: null,
      chapterOneCandidates: candidates,
      chapterResults,
      trialReview: reviewReady
        ? {
            id: 'mock-trial-review-001',
            scoringStrategyVersion: 'trial-summary-score-v1',
            totalScore: 83,
            trialResult: 'pass',
            trialResultText: '试写通过',
            allowNextStep: true,
            requiresRiskConfirmation: false,
            strengths: ['开篇压迫足', '连续性清楚'],
            problems: ['后续需要避免反派压迫重复'],
            suggestions: ['批量正文阶段加强人物一致性复审'],
            chapterScores: [
              { chapterNo: 1, score: 88, hardFailed: false },
              { chapterNo: 2, score: 82, hardFailed: false },
              { chapterNo: 3, score: 80, hardFailed: false },
            ],
            recommendedAction: '生成正文策略快照',
          }
        : null,
      bodyStrategySnapshot: null,
      task: null,
      recentTask: null,
    },
    bodyStrategySnapshot: null,
    affectedObjects: ['trial_run'],
    nextAction: {
      type: reviewReady ? 'confirm_trial_review' : 'select_trial_chapter_one',
      label: reviewReady ? '确认试写总评' : '选择第1章候选',
      reasonText: reviewReady ? '前三章试写总评已生成，请确认试写并生成策略快照。' : '候选不会自动选择，请先人工选择第1章版本。',
      target: 'detail',
      disabled: false,
      disabledReason: null,
      confirmRequired: false,
      taskType: 'trial_writing_generate',
    },
  }
}

function createMockTrialCandidate(score: number, index: number, selectedId?: string | null): TrialChapterCandidateDTO {
  const id = `mock-trial-candidate-${index}`
  const selected = selectedId === id
  const content = [
    '会议室的灯白得刺眼，所有人都在等她低头签字。',
    '她把母亲留下的旧文件夹按在掌心，第一次没有躲开那些轻蔑眼神。',
    '授权书拍在桌面上的瞬间，前夫阵营的笑声停了。',
    '手机跳出陌生短信：今晚八点，旧码头仓库，一个人来。',
  ].join('\n\n')

  return {
    id,
    chapterId: 'mock-chapter-1',
    chapterNo: 1,
    title: '第1章 背锅开局',
    versionNo: index,
    status: selected ? 'selected_for_trial' : VersionStatus.Candidate,
    staleLevel: StaleLevel.None,
    isAiRecommended: index === 1,
    isSelected: selected,
    openingStrategy: index === 1 ? '强压迫开场' : '悬念开场',
    openingHighlight: '第一屏展示压迫和反击线索。',
    firstSentence: '会议室的灯白得刺眼。',
    first300Summary: content.slice(0, 300),
    endingHook: '陌生短信指向旧码头仓库。',
    riskLevel: score < 75 ? RiskLevel.Medium : RiskLevel.Low,
    riskTags: score < 75 ? ['节奏风险'] : ['节奏稳定'],
    aiRecommendedReason: index === 1 ? '综合分最高，压迫和钩子更均衡。' : '可作为备选版本。',
    wordCount: content.replace(/\s/g, '').length,
    contentPreview: content.slice(0, 180),
    content,
    scoring: {
      scoringStrategyVersion: 'trial-opening-score-v1',
      totalScore: score,
      gateResult: score < 75 ? 'warning' : 'pass',
      gateResultText: score < 75 ? '有风险，需确认' : '通过',
      dimensions: [
        { key: 'opening_hook', label: '开篇钩子', score, weight: 0.3, evidence: '首屏有压迫和短信钩子。', penaltyPoints: score < 75 ? 5 : 0 },
      ],
      weights: { opening_hook: 0.3 },
      evidence: ['首屏有压迫和短信钩子。'],
      penalties: score < 75 ? ['人物代入略弱'] : [],
      hardFailure: false,
      hardFailureReasons: [],
    },
    createdAt: new Date().toISOString(),
  }
}

function createMockTrialChapterResult(chapterNo: number, candidate?: TrialChapterCandidateDTO): TrialChapterResultDTO {
  return {
    id: `mock-trial-result-${chapterNo}`,
    chapterId: `mock-chapter-${chapterNo}`,
    chapterNo,
    title: `第${chapterNo}章 试写章节`,
    status: 'completed',
    score: candidate?.scoring.totalScore ?? 82,
    hardFailed: false,
    hardFailureReasons: [],
    contentVersion: candidate ?? createMockTrialCandidate(82, chapterNo),
    featureCard: {
      id: `mock-feature-${chapterNo}`,
      chapterId: `mock-chapter-${chapterNo}`,
      versionNo: 1,
      status: VersionStatus.Current,
      oneLineSummary: '压迫后反击，保留旧码头线索。',
      coreTask: '推进主线目标',
      mainConflict: '主角与对手正面交锋',
      appealPoint: '压迫后反击',
      emotionKeywords: ['压迫', '反击'],
      characterChanges: ['主角从被动承受到主动验证线索'],
      relationshipChanges: ['潜在盟友建立信任'],
      keyInformation: ['旧码头线索'],
      foreshadowingOperation: '保留旧码头仓库钩子',
      endingHook: '幕后人露出尾巴',
      factsCannotChange: ['主角不能万能'],
      featuresToStrengthen: ['结尾钩子'],
      createdAt: new Date().toISOString(),
    },
    reviewReport: {
      id: `mock-review-${chapterNo}`,
      objectVersionId: candidate?.id ?? null,
      reviewLevel: 'chapter',
      scoringStrategyVersion: 'trial-chapter-score-v1',
      totalScore: candidate?.scoring.totalScore ?? 82,
      rating: 'pass',
      summary: '章节连续性基本达标。',
      strengths: ['目标明确'],
      problems: ['局部表达可打磨'],
      suggestions: ['加强人物一致性复审'],
      issues: [{ severity: 'info', dimension: 'rhythm', message: '节奏可继续优化。', suggestion: '后续保持每章钩子。' }],
      recommendedAction: '纳入试写总评',
      allowNextStep: true,
      blockingIssueCount: 0,
      createdAt: new Date().toISOString(),
    },
  }
}

function createMockChapterWorkbench(novelId: string, chapterId: string): ChapterWorkbenchDTO {
  const candidate = createMockTrialCandidate(86, 1, 'mock-trial-candidate-1')
  const result = createMockTrialChapterResult(1, candidate)

  return {
    novelId,
    chapter: {
      id: chapterId,
      chapterNo: 1,
      stageIndex: 1,
      title: '第1章 背锅开局',
      wordTarget: 2200,
      wordCount: candidate.wordCount,
      mainStatus: 'trial_written',
      statusNote: '试写正文已生成，等待总评确认。',
      impactLevel: 'none',
      currentContentVersionId: candidate.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    currentContent: candidate,
    featureCard: result.featureCard,
    reviewReport: result.reviewReport,
    reviewIssues: result.reviewReport?.issues ?? [],
    candidateVersions: [candidate, createMockTrialCandidate(74, 2)],
    candidateCompares: {},
    longTermMemory: null,
    impactCases: [],
    recentTask: null,
    recommendedAction: {
      type: 'view_trial_review',
      label: '查看试写总评',
      reasonText: '章节已有试写正文，可查看试写总评和审稿问题。',
      target: 'detail',
      disabled: false,
      disabledReason: null,
      confirmRequired: false,
      taskType: null,
    },
  }
}

function createMockBodyBatchActionResult(novelId: string, request: Pick<GenerateBodyBatchRequest, 'strategySnapshotId' | 'expectedStrategySnapshotVersion'>): BodyBatchActionResultDTO {
  const now = new Date().toISOString()
  const summary = {
    id: 'mock-body-summary-001',
    batchId: 'mock-body-batch-001',
    conclusion: '第 4-8 章批量正文已完成，普通风险已写入单章审稿和批次总结。',
    chapterResults: Array.from({ length: 5 }, (_, index) => createMockBodyBatchChapterResult(index + 4)),
    riskTrend: '本批连续性稳定，第 5 章节奏偏慢，下一批继续关注人物一致性。',
    nextBatchNotes: ['下一批读取第 4-8 章总结。', '继续沿用旧码头线索和反击节奏。'],
    riskChapterIds: ['mock-chapter-5'],
    createdAt: now,
  }

  return {
    novelId,
    statusSummary: createMockStatusSummary(NovelCreationStage.Body, StageStatus.NotStarted, '正文生成'),
    task: {
      id: 'mock-body-task-001',
      taskType: 'body_batch_generate',
      status: TaskStatus.Completed,
      statusText: '已完成',
      progress: 100,
      currentStep: '批次总结已生成',
      resultVersionIds: summary.chapterResults.map((item) => item.contentVersionId).filter((id): id is string => Boolean(id)),
      statusNote: '本批正文生成完成。',
      failureCategory: null,
      errorCode: null,
    },
    batch: {
      id: 'mock-body-batch-001',
      taskId: 'mock-body-task-001',
      status: 'completed',
      statusText: '本批完成',
      strategySnapshotId: request.strategySnapshotId,
      strategySnapshotVersion: request.expectedStrategySnapshotVersion,
      startChapterNo: 4,
      endChapterNo: 8,
      totalCount: 5,
      completedCount: 5,
      failedCount: 0,
      pendingCount: 0,
      failedChapterNo: null,
      statusNote: '本批正文生成完成。',
      chapterResults: summary.chapterResults,
      summary,
      createdAt: now,
    },
    bodyGeneration: createMockBodyGenerationState(request.strategySnapshotId, request.expectedStrategySnapshotVersion),
    chapters: [],
    affectedObjects: ['chapters', 'review_reports', 'long_term_memory', 'body_batch_summary'],
    nextAction: createMockStatusSummary(NovelCreationStage.Body, StageStatus.NotStarted, '正文生成').recommendedAction,
  }
}

function createMockBodyBatchChapterResult(chapterNo: number) {
  return {
    chapterId: `mock-chapter-${chapterNo}`,
    chapterNo,
    title: `第${chapterNo}章 正文节点`,
    status: 'completed' as const,
    statusText: '已生成',
    contentVersionId: `mock-content-${chapterNo}`,
    featureCardId: `mock-feature-${chapterNo}`,
    reviewReportId: `mock-review-${chapterNo}`,
    longTermMemoryId: `mock-memory-${chapterNo}`,
    score: chapterNo === 5 ? 66 : 84,
    riskLevel: chapterNo === 5 ? RiskLevel.Medium : RiskLevel.Low,
    hardFailed: false,
    statusNote: chapterNo === 5 ? '普通风险，已记录。' : null,
    recommendedAction: chapterNo === 5 ? '批次完成后可优化本章' : '继续下一章',
  }
}

function createMockBodyGenerationState(strategySnapshotId = 'mock-body-strategy-001', versionNo = 1) {
  const now = new Date().toISOString()

  return {
    strategySnapshot: {
      id: strategySnapshotId,
      versionNo,
      status: VersionStatus.Current,
      summary: '基于前三章试写结果沉淀的正文生成策略。',
      sourceTrialRunId: 'mock-trial-run-001',
      selectedChapterOneVersionId: 'mock-trial-candidate-1',
      writingStyle: '强压迫开局，三段内给出可见反击线索。',
      rhythm: '每章承接上一章钩子，推进一个明确目标。',
      protagonistGuidance: '主角依赖证据和行动推进，不使用万能能力。',
      conflictGuidance: '冲突推动旧码头线索和母亲旧案。',
      endingHookRule: '每章结尾保留可视化动作或证据线索。',
      longMemory: ['旧码头仓库线索', '母亲公司旧案'],
      acceptedRisks: [],
      enhancedReviewRules: ['复审人物一致性', '复审主线连续性'],
      createdAt: now,
    },
    latestBatch: null,
    openImpactCases: [],
    nextBatchRange: {
      startChapterNo: 4,
      endChapterNo: 8,
      batchSize: 5,
      text: '第 4-8 章',
    },
    chapterProgress: {
      plannedChapterCount: 12,
      completedChapterCount: 3,
      pendingChapterCount: 9,
      text: '3/12',
    },
    blockingReasons: [],
    recommendedAction: {
      type: 'start_body_batch',
      label: '开始本批生成',
      reasonText: '将基于策略快照生成第 4-8 章，默认最多 5 章。',
      target: 'detail' as const,
      disabled: false,
      disabledReason: null,
      confirmRequired: true,
      taskType: 'body_batch_generate',
    },
  }
}

function createMockFullReviewActionResult(novelId: string): FullReviewActionResultDTO {
  const now = new Date().toISOString()
  const statusSummary = createMockStatusSummary(NovelCreationStage.CompletionConfirm, StageStatus.WaitingUser, '待确认完成')
  statusSummary.recommendedAction = {
    type: 'confirm_completion',
    label: '确认小说完成',
    reasonText: '全书审稿已通过，请确认小说完成。',
    target: 'detail',
    disabled: false,
    disabledReason: null,
    confirmRequired: true,
    taskType: null,
  }

  return {
    novelId,
    statusSummary,
    task: {
      id: 'mock-full-review-task-001',
      taskType: 'novel_full_review',
      status: TaskStatus.Completed,
      statusText: '已完成',
      progress: 100,
      currentStep: '全书审稿完成',
      resultVersionIds: [],
      statusNote: '全书审稿报告已生成。',
      failureCategory: null,
      errorCode: null,
    },
    fullReview: {
      id: 'mock-full-review-001',
      version: 1,
      reviewLevel: 'full_novel',
      totalScore: 84,
      rating: 'A-',
      gateResult: 'pass',
      summary: '全书主线清晰，前中段冲突和结尾钩子适合短视频拆条。',
      strengths: ['主线连续', '人物动机明确', '短视频开场素材充分'],
      problems: ['第 5 章节奏略慢'],
      suggestions: ['全书完成确认前复查第 5 章节奏'],
      dimensionScores: [
        { key: 'continuity', label: '主线连续性', score: 86, weight: 0.3, evidence: '章节承接稳定。', penaltyPoints: 0 },
        { key: 'video', label: '视频化潜力', score: 88, weight: 0.25, evidence: '首条视频钩子清晰。', penaltyPoints: 0 },
      ],
      issues: [
        {
          issueId: 'mock-full-review-issue-001',
          title: '第 5 章节奏偏慢',
          plainDescription: '该问题不阻塞完成确认，但建议章节详情中复查。',
          severity: 'warning',
          scopeType: 'chapter',
          scopeRefs: ['mock-chapter-5'],
          dimension: 'rhythm',
          blocking: false,
          recommendedTarget: 'chapter_workbench',
          recommendedAction: '进入章节详情复查',
          status: 'open',
          acceptedReason: null,
        },
      ],
      videoSuggestion: '首条视频建议取第 1-2 章，突出被压迫后的第一次反击。',
      firstVideoSuggestion: createMockFirstVideoSuggestion(),
      platformRisks: [],
      originalityRisks: ['轻微套路化，标题需避免同质化'],
      aiFlavorRisks: [],
      lowScoreContinueRisks: [],
      reviewPolicyVersionId: 'full-review-policy-v1',
      sourceVersionRefs: {},
      gate: {
        id: 'mock-full-review-gate-001',
        reviewReportId: 'mock-full-review-001',
        gateResult: 'pass',
        gateResultText: '通过',
        allowCompletion: true,
        allowVideoReady: true,
        blockingIssueCount: 0,
        warningIssueCount: 1,
        forcePassAllowed: false,
        forcePassReason: null,
        isStale: false,
        staleReason: null,
        createdAt: now,
      },
      createdAt: now,
    },
    affectedObjects: ['review_report', 'full_review_gate'],
    nextAction: statusSummary.recommendedAction,
  }
}

function createMockCompletionActionResult(novelId: string): CompletionActionResultDTO {
  const statusSummary = createMockStatusSummary(NovelCreationStage.CompletionConfirm, StageStatus.Completed, '已完成，待确认视频化')
  const completionDecision = {
    id: 'mock-completion-001',
    reviewReportId: 'mock-full-review-001',
    fullReviewGateId: 'mock-full-review-gate-001',
    decision: 'confirm_completion',
    reason: '确认小说完成',
    isForced: false,
    score: 84,
    riskSummary: '全书审稿已通过完成门禁。',
    chapterCount: 12,
    totalWordCount: 26000,
    estimatedAudioMinutes: 93,
    createdAt: new Date().toISOString(),
  }
  const videoReadiness = createMockVideoReadinessDTO(novelId, completionDecision)
  statusSummary.recommendedAction = videoReadiness.recommendedAction

  return {
    novelId,
    statusSummary,
    completionDecision,
    videoReadiness,
    affectedObjects: ['completion_decision', 'video_readiness_check'],
    nextAction: videoReadiness.recommendedAction,
  }
}

function createMockVideoReadinessActionResult(novelId: string): VideoReadinessActionResultDTO {
  const completion = createMockCompletionActionResult(novelId)
  const statusSummary = createMockStatusSummary(NovelCreationStage.VideoReady, StageStatus.Completed, '待视频化')

  return {
    novelId,
    statusSummary,
    task: null,
    videoReadiness: {
      ...completion.videoReadiness,
      status: 'ready',
      statusText: '已进入待视频化',
      snapshot: {
        id: 'mock-video-ready-001',
        completionDecisionId: completion.completionDecision.id,
        reviewReportId: completion.completionDecision.reviewReportId,
        status: 'ready',
        chapterCount: 12,
        totalWordCount: 26000,
        estimatedAudioMinutes: 93,
        riskSummary: completion.completionDecision.riskSummary,
        referableChapterIds: ['mock-chapter-1', 'mock-chapter-2'],
        referableChapterVersionIds: ['mock-content-1', 'mock-content-2'],
        firstVideoSuggestion: createMockFirstVideoSuggestion(),
        createdAt: new Date().toISOString(),
      },
      recommendedAction: {
        type: 'go_video_list',
        label: '去视频列表',
        reasonText: '小说已可被视频模块引用；请去视频列表查看承接。',
        target: 'detail',
        disabled: false,
        disabledReason: null,
        confirmRequired: false,
        taskType: null,
      },
    },
    affectedObjects: ['video_readiness_snapshot'],
    nextAction: statusSummary.recommendedAction,
  }
}

function createMockVideoReadinessDTO(novelId: string, completionDecision: CompletionActionResultDTO['completionDecision']): VideoReadinessDTO {
  const checkItems = [
    { key: 'completion_confirmed', label: '完成确认', passed: true, severity: 'blocking' as const, message: '小说完成决策已记录。', nextAction: '继续待视频化检查。' },
    { key: 'chapters_complete', label: '章节正文完整', passed: true, severity: 'blocking' as const, message: '所有计划章节都有正式正文。', nextAction: '继续检查。' },
    { key: 'first_video_suggestion', label: '首条视频建议', passed: true, severity: 'blocking' as const, message: '首条视频建议已生成。', nextAction: '确认进入待视频化。' },
  ]

  return {
    novelId,
    status: 'candidate',
    statusText: '待确认视频化',
    check: {
      id: 'mock-video-check-001',
      version: 1,
      status: 'candidate',
      statusText: '待确认视频化',
      checkItems,
      blockingReasons: [],
      firstVideoSuggestion: createMockFirstVideoSuggestion(),
      createdAt: new Date().toISOString(),
    },
    checkItems,
    blockingReasons: [],
    completionDecision,
    snapshot: null,
    firstVideoSuggestion: createMockFirstVideoSuggestion(),
    recommendedAction: {
      type: 'confirm_video_readiness',
      label: '确认进入待视频化',
      reasonText: '待视频化检查已通过，确认后生成可被视频模块引用的快照。',
      target: 'detail',
      disabled: false,
      disabledReason: null,
      confirmRequired: true,
      taskType: 'video_readiness_check',
    },
  }
}

function createMockFirstVideoSuggestion() {
  return {
    chapterRange: '第 1-2 章',
    openingSlice: '女主被迫签下不平等协议，当场发现关键证据。',
    narrationHook: '她以为自己输定了，却在三秒内找到了翻盘证据。',
    firstScreenSubtitle: '被逼到绝路后，她反手拿出关键证据',
    titleHook: '被裁员当天，我接管了未来公司',
    endingSuspense: '证据背后的人，竟然还藏在公司高层。',
    suggestedFormat: '口播解说 + 关键台词字幕',
    riskTips: ['标题避免夸大承诺', '弱化现实公司影射'],
  }
}

function createMockChapterRewriteResult(novelId: string, chapterId: string): ChapterRewriteResultDTO {
  const current = createMockTrialCandidate(84, 1, 'mock-body-current-1')
  const candidate = {
    ...createMockTrialCandidate(86, 3),
    id: 'mock-body-candidate-001',
    chapterId,
    status: VersionStatus.Candidate,
    title: '第4章 正文改稿候选',
    aiRecommendedReason: '候选强化结尾钩子，采用前需要查看影响提示。',
  }

  return {
    novelId,
    statusSummary: createMockStatusSummary(NovelCreationStage.Body, StageStatus.NotStarted, '正文生成'),
    task: {
      id: 'mock-rewrite-task-001',
      taskType: 'chapter_body_rewrite',
      status: TaskStatus.WaitingConfirmation,
      statusText: '待确认结果',
      progress: 100,
      currentStep: '章节重写候选已生成，等待采用',
      resultVersionIds: [candidate.id],
    },
    chapter: {
      id: chapterId,
      chapterNo: 4,
      stageIndex: 2,
      title: '第4章 正文节点',
      wordTarget: 2200,
      wordCount: current.wordCount,
      mainStatus: 'completed',
      statusNote: '正文已生成并完成单章审稿。',
      impactLevel: 'none',
      currentContentVersionId: current.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    currentContent: current,
    candidate,
    summaryCompare: {
      currentSummary: '当前正文推进旧码头线索。',
      candidateSummary: '候选加强结尾反击和后续承接。',
      benefit: '提升结尾钩子和短视频口播张力。',
      newRisks: ['可能影响后续旧码头线索。'],
      possibleImpact: '可能影响后续章节承接，需要影响评估。',
      aiSuggestion: '采用后先处理影响案例，再继续下一批。',
    },
    affectedObjects: ['chapter_candidate_version'],
    nextAction: {
      type: 'adopt_chapter_candidate',
      label: '采用候选版本',
      reasonText: '重写候选已生成，采用前请查看摘要对比和影响提示。',
      target: 'detail',
      disabled: false,
      disabledReason: null,
      confirmRequired: false,
      taskType: 'chapter_impact_assess',
    },
  }
}

function createMockChapterAdoptionResult(novelId: string, chapterId: string, versionId: string): ChapterContentAdoptionResultDTO {
  return {
    novelId,
    statusSummary: createMockStatusSummary(NovelCreationStage.Body, StageStatus.Blocked, '正文生成'),
    task: {
      id: 'mock-impact-task-001',
      taskType: 'chapter_impact_assess',
      status: TaskStatus.Completed,
      statusText: '已完成',
      progress: 100,
      currentStep: '影响评估已生成，等待处理',
      resultVersionIds: [versionId],
    },
    chapter: {
      id: chapterId,
      chapterNo: 4,
      stageIndex: 2,
      title: '第4章 正文节点',
      wordTarget: 2200,
      wordCount: 2200,
      mainStatus: 'pending',
      statusNote: '重写采用后影响未关闭。',
      impactLevel: 'medium',
      currentContentVersionId: versionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    previousContentVersionId: 'mock-body-current-1',
    currentContent: { ...createMockTrialCandidate(86, 3), id: versionId, chapterId, status: VersionStatus.Current },
    impactCase: createMockImpactCase(novelId, 'mock-impact-001'),
    affectedObjects: ['chapter_current_content', 'impact_case', 'review_report', 'long_term_memory'],
    nextAction: {
      type: 'resolve_impact_case',
      label: '处理影响案例',
      reasonText: '当前章改动会影响后续章节承接，关闭影响前不能进入正式全书审稿。',
      target: 'detail',
      disabled: false,
      disabledReason: null,
      confirmRequired: false,
      taskType: 'chapter_impact_assess',
    },
  }
}

function createMockImpactAssessmentResult(novelId: string, chapterId: string): ImpactAssessmentActionResultDTO {
  return {
    novelId,
    statusSummary: createMockStatusSummary(NovelCreationStage.Body, StageStatus.Blocked, '正文生成'),
    task: {
      id: 'mock-impact-task-002',
      taskType: 'chapter_impact_assess',
      status: TaskStatus.Completed,
      statusText: '已完成',
      progress: 100,
      currentStep: '影响评估已生成',
      resultVersionIds: [],
    },
    impactCase: createMockImpactCase(novelId, `mock-impact-${chapterId}`),
    nextAction: createMockStatusSummary(NovelCreationStage.Body, StageStatus.Blocked, '正文生成').recommendedAction,
  }
}

function createMockImpactCase(novelId: string, impactCaseId: string, status: ImpactCaseDTO['status'] = 'waiting_decision'): ImpactCaseDTO {
  const resolved = status === 'resolved' || status === 'ignored' || status === 'cancelled'

  return {
    id: impactCaseId,
    novelId,
    sourceChapterId: 'mock-chapter-4',
    sourceOldVersionId: 'mock-body-current-1',
    sourceNewVersionId: 'mock-body-candidate-001',
    impactLevel: ImpactLevel.Medium,
    impactLevelText: '中等影响',
    status,
    statusText: resolved ? '已处理' : '等待处理',
    summary: '当前章改动会影响后续章节承接，关闭影响前不能进入正式全书审稿。',
    changedFacts: ['旧码头线索触发方式发生变化'],
    affectedChapterIds: ['mock-chapter-5', 'mock-chapter-6'],
    affectedVideoReferenceIds: [],
    recommendedHandling: '逐章确认受影响章节，必要时生成调整候选。',
    suggestedActions: ['生成调整方案', '逐章处理', '手动确认无影响'],
    blocksFullReview: !resolved,
    createdAt: new Date().toISOString(),
    resolvedAt: resolved ? new Date().toISOString() : null,
  }
}

function createMockStatusSummary(creationStage: NovelCreationStage, stageStatus: StageStatus, displayStatusText: string): NovelDetailDTO['statusSummary'] {
  return {
    lifecycleStatus: NovelLifecycleStatus.Active,
    creationStage,
    stageStatus,
    displayStatus: `${creationStage}_${stageStatus}`,
    displayStatusText,
    currentStep: stageStatus === StageStatus.Blocked ? '处理阻塞原因' : '查看下一步',
    completedSteps: ['创建草稿', '确认方向', '确认设定', '确认大纲', '确认章节目录', '试写通过'],
    blockingReasons: stageStatus === StageStatus.Blocked ? ['当前阶段存在阻塞问题。'] : [],
    recommendedAction: {
      type: stageStatus === StageStatus.Blocked ? 'resolve_impact_case' : 'start_body_batch',
      label: stageStatus === StageStatus.Blocked ? '处理影响案例' : '开始本批生成',
      reasonText: stageStatus === StageStatus.Blocked ? '中等或严重影响未关闭前，不能进入正式全书审稿。' : '按默认 5 章一批继续生成正文。',
      target: 'detail' as const,
      disabled: false,
      disabledReason: null,
      confirmRequired: stageStatus !== StageStatus.Blocked,
      taskType: stageStatus === StageStatus.Blocked ? 'chapter_impact_assess' : 'body_batch_generate',
    },
    videoPreparationStatus: 'not_ready',
    videoReferenceStatus: 'not_referenced',
    calculatedAt: new Date().toISOString(),
    calculationVersion: 'novel-status-v1',
  }
}

function formatDateTime(value: string) {
  return value.replace('T', ' ').slice(0, 16)
}

function getVersionStatusText(status: VersionStatus | string) {
  if (status === 'selected_for_trial') return '已选试写版'
  if (status === VersionStatus.Current) return '正式采用版本'
  if (status === VersionStatus.Historical) return '历史版本'
  if (status === VersionStatus.Discarded) return '已放弃'
  if (status === VersionStatus.Stale) return '已过期'
  return '候选版本'
}

function getRiskLevelText(level: RiskLevel | string) {
  if (level === RiskLevel.High) return '高风险'
  if (level === RiskLevel.Medium) return '中风险'
  if (level === RiskLevel.Low) return '低风险'
  if (level === RiskLevel.Blocking) return '阻塞'
  return '无明显风险'
}

function getImpactLevelText(level: string) {
  if (level === 'severe') return '严重影响'
  if (level === 'medium') return '中等影响'
  if (level === 'minor') return '轻微影响'
  return '无影响'
}

function getStructureAssetTypeText(type: StructureAssetType | string) {
  if (type === 'setting') return '设定'
  if (type === 'outline') return '全书大纲'
  if (type === 'stage_outline') return '阶段大纲'
  return '章节目录'
}

function getChapterStatusText(status: string) {
  if (status === 'pending') return '待试写'
  if (status === 'trial_written') return '试写已生成'
  if (status === 'completed') return '已完成'
  if (status === 'blocked') return '需处理'
  return status
}

function getMockStructureTaskType(type: StructureAssetType) {
  if (type === 'setting') return 'novel_setting_generate'
  if (type === 'outline') return 'novel_outline_generate'
  if (type === 'stage_outline') return 'stage_outline_generate'
  return 'chapter_plan_generate'
}

function getMockNextStage(type: StructureAssetType, isAdopted: boolean) {
  if (!isAdopted) {
    if (type === 'setting') return NovelCreationStage.Setting
    if (type === 'chapter_plan') return NovelCreationStage.ChapterPlan
    return NovelCreationStage.Outline
  }

  if (type === 'setting' || type === 'outline') return NovelCreationStage.Outline
  if (type === 'stage_outline') return NovelCreationStage.ChapterPlan
  return NovelCreationStage.Trial
}

function getMockNextDisplayText(type: StructureAssetType) {
  if (type === 'setting') return '待生成全书大纲'
  if (type === 'outline') return '待生成阶段大纲'
  if (type === 'stage_outline') return '待生成章节目录'
  return '待生成试写'
}
