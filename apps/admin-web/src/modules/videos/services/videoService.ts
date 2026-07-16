import { VIDEO_VISUAL_BACKGROUND_ASSETS } from '@ai-shortvideo/shared'
import type {
  CreateVideoProjectRequest,
  ConfirmVideoNarrationRequest,
  ConfirmVideoNarrationResultDTO,
  ConfirmVideoRenderRequest,
  ConfirmVideoRenderResultDTO,
  ConfirmVideoTtsRequest,
  ConfirmVideoTtsResultDTO,
  ConfirmVideoSubtitleRequest,
  ConfirmVideoSubtitleResultDTO,
  ConfirmVideoVisualPlanRequest,
  ConfirmVideoVisualPlanResultDTO,
  CreateVideoExportRequest,
  CreateVideoExportResultDTO,
  GenerateVideoNarrationRequest,
  GenerateVideoNarrationResultDTO,
  GenerateVideoRenderRequest,
  GenerateVideoRenderResultDTO,
  GenerateVideoSubtitleRequest,
  GenerateVideoSubtitleResultDTO,
  GenerateVideoTtsRequest,
  GenerateVideoTtsResultDTO,
  RecheckVideoReferenceRequest,
  RejectVideoNarrationRequest,
  RejectVideoNarrationResultDTO,
  RejectVideoRenderRequest,
  RejectVideoRenderResultDTO,
  RejectVideoSubtitleRequest,
  RejectVideoSubtitleResultDTO,
  RejectVideoTtsRequest,
  RejectVideoTtsResultDTO,
  RejectVideoVisualPlanRequest,
  RejectVideoVisualPlanResultDTO,
  ResolveVideoReferenceIssueRequest,
  SaveVideoNarrationDraftRequest,
  SaveVideoNarrationDraftResultDTO,
  SaveVideoSubtitleDraftRequest,
  SaveVideoSubtitleDraftResultDTO,
  SaveVideoVisualPlanRequest,
  SaveVideoVisualPlanResultDTO,
  StopVideoProjectRequest,
  VideoNarrationArtifactDTO,
  VideoNarrationListDTO,
  VideoRenderDTO,
  VideoRenderListDTO,
  VideoExportDTO,
  VideoExportListDTO,
  VideoSubtitleArtifactDTO,
  VideoSubtitleListDTO,
  VideoTtsArtifactDTO,
  VideoTtsListDTO,
  VideoVisualPlanArtifactDTO,
  VideoVisualPlanListDTO,
  VideoProjectActionResultDTO,
  VideoProjectListDTO,
  VideoReadySourceListDTO,
  VideoReferenceDetailDTO,
  VideoWorkbenchDTO,
} from '@ai-shortvideo/shared'
import { videos } from '../../../mock/prototypeData.js'
import { getApiMode, type ApiMode } from '../../../shared/services/apiMode.js'
import { apiRequest } from '../../../shared/services/http.js'

const mockSources: VideoReadySourceListDTO = {
  items: [
    {
      novelId: 'novel_000001',
      title: '化学大秦',
      creationStage: 'video_ready',
      videoReadinessSnapshotId: 'snapshot_mock_003',
      chapterCount: 36,
      totalWordCount: 86000,
      snapshotStatus: 'confirmed',
      firstVideoSuggestion: {
        chapterRangeText: '第 1-3 章',
        chapterIds: ['chapter_mock_001', 'chapter_mock_002', 'chapter_mock_003'],
        title: '化学老师穿秦朝，第一天就改写盐场命运',
      },
      updatedAt: '2026-06-22T09:30:00.000Z',
    },
    {
      novelId: 'novel-003',
      title: '玄门小师妹直播算命爆红',
      creationStage: 'video_ready',
      videoReadinessSnapshotId: 'snapshot_mock_002',
      chapterCount: 42,
      totalWordCount: 101000,
      snapshotStatus: 'confirmed',
      firstVideoSuggestion: {
        chapterRangeText: '第 1-2 章',
        chapterIds: ['chapter_mock_101', 'chapter_mock_102'],
        title: '小师妹一开播，全网都坐不住了',
      },
      updatedAt: '2026-06-21T18:06:00.000Z',
    },
  ],
  page: 1,
  pageSize: 20,
  total: 2,
}

const mockNarrationsByVideo = new Map<string, VideoNarrationListDTO>()
const mockTtsByVideo = new Map<string, VideoTtsListDTO>()
const mockSubtitlesByVideo = new Map<string, VideoSubtitleListDTO>()
const mockVisualPlansByVideo = new Map<string, VideoVisualPlanListDTO>()
const mockRendersByVideo = new Map<string, VideoRenderListDTO>()
const mockExportsByVideo = new Map<string, VideoExportListDTO>()

export async function listVideoSources(
  query: { page?: number; pageSize?: number; keyword?: string } = {},
  mode: ApiMode = getApiMode(),
): Promise<VideoReadySourceListDTO> {
  if (mode === 'mock') {
    const keyword = query.keyword?.trim()
    const items = keyword ? mockSources.items.filter((item) => item.title.includes(keyword)) : mockSources.items
    return { items, page: query.page ?? 1, pageSize: query.pageSize ?? 20, total: items.length }
  }

  return apiRequest<VideoReadySourceListDTO>('/videos/sources', {
    query: {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      keyword: query.keyword,
    },
  })
}

export async function listVideoProjects(
  query: { page?: number; pageSize?: number; keyword?: string; referenceStatus?: string; lifecycleStatus?: string } = {},
  mode: ApiMode = getApiMode(),
): Promise<VideoProjectListDTO> {
  if (mode === 'mock') {
    return {
      items: videos.map((video) => ({
        id: video.id,
        title: video.title,
        projectType: video.typeText === '首条测试' ? 'first_test' : 'chapter_range',
        novelId: video.novelId,
        novelTitle: video.novelTitle,
        lifecycleStatus: video.lifecycleStatus,
        referenceStatus: video.referenceStatus,
        productionStatus: video.lifecycleStatus === 'stopped' ? 'generation_locked' : 'not_started',
        chapterRangeText: video.chapterRangeText,
        chapterCount: video.chapterCount,
        currentVideoReferenceId: video.referenceVersionText,
        defaultVideoUnitId: `unit_${video.id}`,
        updatedAt: video.updatedAt,
      })),
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      total: videos.length,
    }
  }

  return apiRequest<VideoProjectListDTO>('/videos', {
    query: {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      keyword: query.keyword,
      referenceStatus: query.referenceStatus === 'all' ? undefined : query.referenceStatus,
      lifecycleStatus: query.lifecycleStatus === 'all' ? undefined : query.lifecycleStatus,
    },
  })
}

export async function createVideoProject(request: CreateVideoProjectRequest, mode: ApiMode = getApiMode()): Promise<VideoProjectActionResultDTO> {
  if (mode === 'mock') {
    throw new Error('mock mode creates video projects in the page view model')
  }

  return apiRequest<VideoProjectActionResultDTO>('/videos', {
    method: 'POST',
    body: request,
  })
}

export async function getVideoReference(videoId: string, mode: ApiMode = getApiMode()): Promise<VideoReferenceDetailDTO> {
  if (mode === 'mock') {
    throw new Error('mock mode reads reference snapshots from the page view model')
  }

  return apiRequest<VideoReferenceDetailDTO>(`/videos/${videoId}/reference`)
}

export async function getVideoWorkbench(videoId: string, mode: ApiMode = getApiMode()): Promise<VideoWorkbenchDTO> {
  if (mode === 'mock') {
    return createMockWorkbench(videoId)
  }

  return apiRequest<VideoWorkbenchDTO>(`/videos/${videoId}/workbench`)
}

export async function listVideoNarrations(videoId: string, mode: ApiMode = getApiMode()): Promise<VideoNarrationListDTO> {
  if (mode === 'mock') {
    return getMockNarrations(videoId)
  }

  return apiRequest<VideoNarrationListDTO>(`/videos/${videoId}/narrations`)
}

export async function generateVideoNarrations(
  videoId: string,
  request: GenerateVideoNarrationRequest,
  mode: ApiMode = getApiMode(),
): Promise<GenerateVideoNarrationResultDTO> {
  if (mode === 'mock') {
    const narrations = getMockNarrations(videoId)
    if (request.mockTaskOutcome && request.mockTaskOutcome !== 'success') {
      const task = createMockNarrationTask(request.mockTaskOutcome, request.retryOfTaskId ?? null)
      narrations.activeTask = task
      mockNarrationsByVideo.set(videoId, narrations)
      return {
        task,
        artifacts: [],
        current: narrations.current,
      }
    }

    const artifacts = createMockNarrationArtifacts(videoId, request.candidateCount ?? 3, request.qualityMode ?? 'standard')
    const task = createMockNarrationTask('success', request.retryOfTaskId ?? null)
    narrations.candidates.unshift(...artifacts)
    narrations.history.unshift(...artifacts)
    narrations.activeTask = task
    mockNarrationsByVideo.set(videoId, narrations)
    return {
      task,
      artifacts,
      current: narrations.current,
    }
  }

  return apiRequest<GenerateVideoNarrationResultDTO>(`/videos/${videoId}/narrations/generate`, {
    method: 'POST',
    body: request,
  })
}

export async function editVideoNarrationDraft(
  videoId: string,
  request: SaveVideoNarrationDraftRequest,
  mode: ApiMode = getApiMode(),
): Promise<SaveVideoNarrationDraftResultDTO> {
  if (mode === 'mock') {
    const artifact = createMockNarrationArtifact(videoId, {
      id: `mock-narration-draft-${Date.now()}`,
      status: 'draft',
      versionNo: getMockNarrations(videoId).history.length + 1,
      contentText: request.contentText,
      hook: request.hook,
      firstScreenSubtitle: request.firstScreenSubtitle,
      endingHook: request.endingHook,
      metadata: { isMockOutput: false, baseArtifactId: request.baseArtifactId ?? null },
      providerSummary: { provider: 'manual', model: 'manual-edit', isMockOutput: false },
    })
    const narrations = getMockNarrations(videoId)
    narrations.drafts.unshift(artifact)
    narrations.history.unshift(artifact)
    mockNarrationsByVideo.set(videoId, narrations)
    return { artifact, narrations }
  }

  return apiRequest<SaveVideoNarrationDraftResultDTO>(`/videos/${videoId}/narrations/drafts`, {
    method: 'POST',
    body: request,
  })
}

export async function confirmVideoNarration(
  videoId: string,
  artifactId: string,
  request: ConfirmVideoNarrationRequest,
  mode: ApiMode = getApiMode(),
): Promise<ConfirmVideoNarrationResultDTO> {
  if (mode === 'mock') {
    const narrations = getMockNarrations(videoId)
    const artifact = narrations.history.find((item) => item.id === artifactId)
    if (!artifact) throw new Error('旁白版本不存在')
    for (const item of narrations.history) item.isCurrent = false
    artifact.status = 'confirmed'
    artifact.isCurrent = true
    artifact.confirmedAt = new Date().toISOString()
    narrations.current = artifact
    narrations.candidates = narrations.candidates.filter((item) => item.id !== artifactId)
    narrations.drafts = narrations.drafts.filter((item) => item.id !== artifactId)
    mockNarrationsByVideo.set(videoId, narrations)
    return { current: artifact, narrations }
  }

  return apiRequest<ConfirmVideoNarrationResultDTO>(`/videos/${videoId}/narrations/${artifactId}/confirm`, {
    method: 'POST',
    body: request,
  })
}

export async function rejectVideoNarration(
  videoId: string,
  artifactId: string,
  request: RejectVideoNarrationRequest,
  mode: ApiMode = getApiMode(),
): Promise<RejectVideoNarrationResultDTO> {
  if (mode === 'mock') {
    const narrations = getMockNarrations(videoId)
    const artifact = narrations.history.find((item) => item.id === artifactId)
    if (!artifact) throw new Error('旁白版本不存在')
    artifact.status = 'rejected'
    artifact.rejectedReason = request.reason
    narrations.candidates = narrations.candidates.filter((item) => item.id !== artifactId)
    narrations.drafts = narrations.drafts.filter((item) => item.id !== artifactId)
    mockNarrationsByVideo.set(videoId, narrations)
    return { artifact, narrations }
  }

  return apiRequest<RejectVideoNarrationResultDTO>(`/videos/${videoId}/narrations/${artifactId}/reject`, {
    method: 'POST',
    body: request,
  })
}

export async function generateVideoTts(
  videoId: string,
  request: GenerateVideoTtsRequest,
  mode: ApiMode = getApiMode(),
): Promise<GenerateVideoTtsResultDTO> {
  if (mode === 'mock') {
    const narrations = getMockNarrations(videoId)
    if (!narrations.current || narrations.current.id !== request.narrationArtifactId) {
      throw new Error('需先确认旁白稿后才能生成配音')
    }
    const tts = getMockTts(videoId)
    if (request.mockTaskOutcome && request.mockTaskOutcome !== 'success') {
      const task = createMockTtsTask(request.mockTaskOutcome, request.retryOfTaskId ?? null)
      tts.activeTask = task
      mockTtsByVideo.set(videoId, tts)
      return {
        task,
        artifacts: [],
        current: tts.current,
      }
    }

    const artifact = createMockTtsArtifact(videoId, request)
    const task = createMockTtsTask('success', request.retryOfTaskId ?? null)
    tts.candidates.unshift(artifact)
    tts.history.unshift(artifact)
    tts.activeTask = task
    mockTtsByVideo.set(videoId, tts)
    return {
      task,
      artifacts: [artifact],
      current: tts.current,
    }
  }

  return apiRequest<GenerateVideoTtsResultDTO>(`/videos/${videoId}/tts/generate`, {
    method: 'POST',
    body: request,
  })
}

export async function confirmVideoTts(
  videoId: string,
  artifactId: string,
  request: ConfirmVideoTtsRequest,
  mode: ApiMode = getApiMode(),
): Promise<ConfirmVideoTtsResultDTO> {
  if (mode === 'mock') {
    const tts = getMockTts(videoId)
    const artifact = tts.history.find((item) => item.id === artifactId)
    if (!artifact) throw new Error('配音版本不存在')
    for (const item of tts.history) item.isCurrent = false
    artifact.status = 'confirmed'
    artifact.isCurrent = true
    artifact.confirmedAt = new Date().toISOString()
    tts.current = artifact
    tts.candidates = tts.candidates.filter((item) => item.id !== artifactId)
    mockTtsByVideo.set(videoId, tts)
    return { current: artifact, tts }
  }

  return apiRequest<ConfirmVideoTtsResultDTO>(`/videos/${videoId}/tts/${artifactId}/confirm`, {
    method: 'POST',
    body: request,
  })
}

export async function rejectVideoTts(
  videoId: string,
  artifactId: string,
  request: RejectVideoTtsRequest,
  mode: ApiMode = getApiMode(),
): Promise<RejectVideoTtsResultDTO> {
  if (mode === 'mock') {
    const tts = getMockTts(videoId)
    const artifact = tts.history.find((item) => item.id === artifactId)
    if (!artifact) throw new Error('配音版本不存在')
    artifact.status = 'rejected'
    artifact.rejectedReason = request.reason
    artifact.isCurrent = false
    tts.candidates = tts.candidates.filter((item) => item.id !== artifactId)
    mockTtsByVideo.set(videoId, tts)
    return { artifact, tts }
  }

  return apiRequest<RejectVideoTtsResultDTO>(`/videos/${videoId}/tts/${artifactId}/reject`, {
    method: 'POST',
    body: request,
  })
}

export async function listVideoSubtitles(videoId: string, mode: ApiMode = getApiMode()): Promise<VideoSubtitleListDTO> {
  if (mode === 'mock') {
    return getMockSubtitles(videoId)
  }

  return apiRequest<VideoSubtitleListDTO>(`/videos/${videoId}/subtitles`)
}

export async function generateVideoSubtitles(
  videoId: string,
  request: GenerateVideoSubtitleRequest,
  mode: ApiMode = getApiMode(),
): Promise<GenerateVideoSubtitleResultDTO> {
  if (mode === 'mock') {
    const tts = getMockTts(videoId)
    if (!tts.current || tts.current.id !== request.ttsArtifactId) {
      throw new Error('需先确认配音后才能生成字幕')
    }
    const subtitles = getMockSubtitles(videoId)
    if (request.mockTaskOutcome && request.mockTaskOutcome !== 'success') {
      const task = createMockSubtitleTask(request.mockTaskOutcome, request.retryOfTaskId ?? null)
      subtitles.activeTask = task
      mockSubtitlesByVideo.set(videoId, subtitles)
      return {
        task,
        artifacts: [],
        current: subtitles.current,
      }
    }

    const artifact = createMockSubtitleArtifact(videoId, request)
    const task = createMockSubtitleTask('success', request.retryOfTaskId ?? null)
    subtitles.candidates.unshift(artifact)
    subtitles.history.unshift(artifact)
    subtitles.activeTask = task
    mockSubtitlesByVideo.set(videoId, subtitles)
    return {
      task,
      artifacts: [artifact],
      current: subtitles.current,
    }
  }

  return apiRequest<GenerateVideoSubtitleResultDTO>(`/videos/${videoId}/subtitles/generate`, {
    method: 'POST',
    body: request,
  })
}

export async function editVideoSubtitleDraft(
  videoId: string,
  request: SaveVideoSubtitleDraftRequest,
  mode: ApiMode = getApiMode(),
): Promise<SaveVideoSubtitleDraftResultDTO> {
  if (mode === 'mock') {
    const artifact = createMockSubtitleArtifact(videoId, {
      id: `mock-subtitle-draft-${Date.now()}`,
      status: 'draft',
      versionNo: getMockSubtitles(videoId).history.length + 1,
      contentText: request.contentText,
      firstScreenSubtitle: request.firstScreenSubtitle,
      metadata: { isMockOutput: false, baseArtifactId: request.baseArtifactId ?? null, editReason: request.reason },
      providerSummary: { provider: 'manual', model: 'manual-edit', isMockOutput: false },
    })
    const subtitles = getMockSubtitles(videoId)
    subtitles.drafts.unshift(artifact)
    subtitles.history.unshift(artifact)
    mockSubtitlesByVideo.set(videoId, subtitles)
    return { artifact, subtitles }
  }

  return apiRequest<SaveVideoSubtitleDraftResultDTO>(`/videos/${videoId}/subtitles/drafts`, {
    method: 'POST',
    body: request,
  })
}

export async function confirmVideoSubtitle(
  videoId: string,
  artifactId: string,
  request: ConfirmVideoSubtitleRequest,
  mode: ApiMode = getApiMode(),
): Promise<ConfirmVideoSubtitleResultDTO> {
  if (mode === 'mock') {
    const subtitles = getMockSubtitles(videoId)
    const artifact = subtitles.history.find((item) => item.id === artifactId)
    if (!artifact) throw new Error('字幕版本不存在')
    for (const item of subtitles.history) {
      if (item.isCurrent) {
        item.isCurrent = false
        item.status = 'archived'
      }
    }
    artifact.status = 'confirmed'
    artifact.isCurrent = true
    artifact.confirmedAt = new Date().toISOString()
    subtitles.current = artifact
    subtitles.candidates = subtitles.candidates.filter((item) => item.id !== artifactId)
    subtitles.drafts = subtitles.drafts.filter((item) => item.id !== artifactId)
    mockSubtitlesByVideo.set(videoId, subtitles)
    return { current: artifact, subtitles }
  }

  return apiRequest<ConfirmVideoSubtitleResultDTO>(`/videos/${videoId}/subtitles/${artifactId}/confirm`, {
    method: 'POST',
    body: request,
  })
}

export async function rejectVideoSubtitle(
  videoId: string,
  artifactId: string,
  request: RejectVideoSubtitleRequest,
  mode: ApiMode = getApiMode(),
): Promise<RejectVideoSubtitleResultDTO> {
  if (mode === 'mock') {
    const subtitles = getMockSubtitles(videoId)
    const artifact = subtitles.history.find((item) => item.id === artifactId)
    if (!artifact) throw new Error('字幕版本不存在')
    artifact.status = 'rejected'
    artifact.rejectedReason = request.reason
    artifact.isCurrent = false
    subtitles.candidates = subtitles.candidates.filter((item) => item.id !== artifactId)
    subtitles.drafts = subtitles.drafts.filter((item) => item.id !== artifactId)
    mockSubtitlesByVideo.set(videoId, subtitles)
    return { artifact, subtitles }
  }

  return apiRequest<RejectVideoSubtitleResultDTO>(`/videos/${videoId}/subtitles/${artifactId}/reject`, {
    method: 'POST',
    body: request,
  })
}

export async function listVideoVisualPlans(videoId: string, mode: ApiMode = getApiMode()): Promise<VideoVisualPlanListDTO> {
  if (mode === 'mock') {
    return getMockVisualPlans(videoId)
  }

  return apiRequest<VideoVisualPlanListDTO>(`/videos/${videoId}/visual-plans`)
}

export async function saveVideoVisualPlan(
  videoId: string,
  request: SaveVideoVisualPlanRequest,
  mode: ApiMode = getApiMode(),
): Promise<SaveVideoVisualPlanResultDTO> {
  if (mode === 'mock') {
    const subtitles = getMockSubtitles(videoId)
    if (!subtitles.current || subtitles.current.id !== request.subtitleArtifactId) {
      throw new Error('需先确认字幕后才能保存视觉方案')
    }
    const visualPlans = getMockVisualPlans(videoId)
    const artifact = createMockVisualPlanArtifact(videoId, request)
    visualPlans.candidates.unshift(artifact)
    visualPlans.history.unshift(artifact)
    mockVisualPlansByVideo.set(videoId, visualPlans)
    return { artifact, visualPlans }
  }

  return apiRequest<SaveVideoVisualPlanResultDTO>(`/videos/${videoId}/visual-plans`, {
    method: 'POST',
    body: request,
  })
}

export async function confirmVideoVisualPlan(
  videoId: string,
  artifactId: string,
  request: ConfirmVideoVisualPlanRequest,
  mode: ApiMode = getApiMode(),
): Promise<ConfirmVideoVisualPlanResultDTO> {
  if (mode === 'mock') {
    const visualPlans = getMockVisualPlans(videoId)
    const artifact = visualPlans.history.find((item) => item.id === artifactId)
    if (!artifact) throw new Error('视觉方案不存在')
    for (const item of visualPlans.history) {
      if (item.isCurrent) {
        item.isCurrent = false
        item.status = 'archived'
      }
    }
    artifact.status = 'confirmed'
    artifact.isCurrent = true
    artifact.confirmedAt = new Date().toISOString()
    visualPlans.current = artifact
    visualPlans.candidates = visualPlans.candidates.filter((item) => item.id !== artifactId)
    mockVisualPlansByVideo.set(videoId, visualPlans)
    return { current: artifact, visualPlans }
  }

  return apiRequest<ConfirmVideoVisualPlanResultDTO>(`/videos/${videoId}/visual-plans/${artifactId}/confirm`, {
    method: 'POST',
    body: request,
  })
}

export async function rejectVideoVisualPlan(
  videoId: string,
  artifactId: string,
  request: RejectVideoVisualPlanRequest,
  mode: ApiMode = getApiMode(),
): Promise<RejectVideoVisualPlanResultDTO> {
  if (mode === 'mock') {
    const visualPlans = getMockVisualPlans(videoId)
    const artifact = visualPlans.history.find((item) => item.id === artifactId)
    if (!artifact) throw new Error('视觉方案不存在')
    artifact.status = 'rejected'
    artifact.rejectedReason = request.reason
    artifact.isCurrent = false
    visualPlans.candidates = visualPlans.candidates.filter((item) => item.id !== artifactId)
    mockVisualPlansByVideo.set(videoId, visualPlans)
    return { artifact, visualPlans }
  }

  return apiRequest<RejectVideoVisualPlanResultDTO>(`/videos/${videoId}/visual-plans/${artifactId}/reject`, {
    method: 'POST',
    body: request,
  })
}

export async function listVideoRenders(videoId: string, mode: ApiMode = getApiMode()): Promise<VideoRenderListDTO> {
  if (mode === 'mock') {
    return getMockRenders(videoId)
  }

  return apiRequest<VideoRenderListDTO>(`/videos/${videoId}/renders`)
}

export async function generateVideoRender(
  videoId: string,
  request: GenerateVideoRenderRequest,
  mode: ApiMode = getApiMode(),
): Promise<GenerateVideoRenderResultDTO> {
  if (mode === 'mock') {
    const visualPlans = getMockVisualPlans(videoId)
    if (!visualPlans.current || visualPlans.current.id !== request.visualPlanArtifactId) {
      throw new Error('需先确认视觉方案后才能渲染视频预览')
    }
    const renders = getMockRenders(videoId)
    if (request.mockTaskOutcome && request.mockTaskOutcome !== 'success') {
      const task = createMockRenderTask(request.mockTaskOutcome, request.retryOfTaskId ?? null)
      renders.activeTask = task
      mockRendersByVideo.set(videoId, renders)
      return { task, renders: [], current: renders.current }
    }

    const render = createMockRender(videoId, request)
    const task = createMockRenderTask('success', request.retryOfTaskId ?? null)
    renders.candidates.unshift(render)
    renders.history.unshift(render)
    renders.activeTask = task
    mockRendersByVideo.set(videoId, renders)
    return { task, renders: [render], current: renders.current }
  }

  return apiRequest<GenerateVideoRenderResultDTO>(`/videos/${videoId}/renders/generate`, {
    method: 'POST',
    body: request,
  })
}

export async function confirmVideoRender(
  videoId: string,
  renderId: string,
  request: ConfirmVideoRenderRequest,
  mode: ApiMode = getApiMode(),
): Promise<ConfirmVideoRenderResultDTO> {
  if (mode === 'mock') {
    const renders = getMockRenders(videoId)
    const render = renders.history.find((item) => item.id === renderId)
    if (!render) throw new Error('渲染版本不存在')
    for (const item of renders.history) {
      if (item.isCurrent) {
        item.isCurrent = false
        item.status = 'archived'
      }
    }
    render.status = 'confirmed'
    render.previewStatus = 'confirmed_exportable'
    render.isCurrent = true
    render.confirmedAt = new Date().toISOString()
    renders.current = render
    renders.candidates = renders.candidates.filter((item) => item.id !== renderId)
    mockRendersByVideo.set(videoId, renders)
    return { current: render, renders }
  }

  return apiRequest<ConfirmVideoRenderResultDTO>(`/videos/${videoId}/renders/${renderId}/confirm`, {
    method: 'POST',
    body: request,
  })
}

export async function rejectVideoRender(
  videoId: string,
  renderId: string,
  request: RejectVideoRenderRequest,
  mode: ApiMode = getApiMode(),
): Promise<RejectVideoRenderResultDTO> {
  if (mode === 'mock') {
    const renders = getMockRenders(videoId)
    const render = renders.history.find((item) => item.id === renderId)
    if (!render) throw new Error('渲染版本不存在')
    render.status = 'rejected'
    render.previewStatus = 'rejected_pending_revision'
    render.rejectedReason = request.reason
    render.isCurrent = false
    renders.candidates = renders.candidates.filter((item) => item.id !== renderId)
    mockRendersByVideo.set(videoId, renders)
    return { render, renders }
  }

  return apiRequest<RejectVideoRenderResultDTO>(`/videos/${videoId}/renders/${renderId}/reject`, {
    method: 'POST',
    body: request,
  })
}

export async function listVideoExports(videoId: string, mode: ApiMode = getApiMode()): Promise<VideoExportListDTO> {
  if (mode === 'mock') {
    return getMockExports(videoId)
  }

  return apiRequest<VideoExportListDTO>(`/videos/${videoId}/exports`)
}

export async function createVideoExport(
  videoId: string,
  request: CreateVideoExportRequest,
  mode: ApiMode = getApiMode(),
): Promise<CreateVideoExportResultDTO> {
  if (mode === 'mock') {
    const renders = getMockRenders(videoId)
    const render = renders.current
    if (!render || render.id !== request.renderVersionId || render.previewStatus !== 'confirmed_exportable') {
      throw new Error('需先确认当前视频预览后才能创建导出记录')
    }
    const exports = getMockExports(videoId)
    const exportRecord = createMockExport(render, request.fileName)
    exports.current = exportRecord
    exports.history.unshift(exportRecord)
    mockExportsByVideo.set(videoId, exports)
    return { exportRecord, exports }
  }

  return apiRequest<CreateVideoExportResultDTO>(`/videos/${videoId}/exports`, {
    method: 'POST',
    body: request,
  })
}

export async function recheckVideoReference(
  videoId: string,
  request: RecheckVideoReferenceRequest & { reason?: string },
  mode: ApiMode = getApiMode(),
): Promise<VideoReferenceDetailDTO> {
  if (mode === 'mock') {
    throw new Error('mock mode handles recheck in the page view model')
  }

  return apiRequest<VideoReferenceDetailDTO>(`/videos/${videoId}/reference/recheck`, {
    method: 'POST',
    body: request,
  })
}

export async function resolveVideoReferenceIssue(
  videoId: string,
  issueId: string,
  request: ResolveVideoReferenceIssueRequest,
  mode: ApiMode = getApiMode(),
): Promise<VideoReferenceDetailDTO> {
  if (mode === 'mock') {
    throw new Error('mock mode handles issue resolution in the page view model')
  }

  return apiRequest<VideoReferenceDetailDTO>(`/videos/${videoId}/reference/issues/${issueId}/resolve`, {
    method: 'POST',
    body: request,
  })
}

export async function stopVideoProject(videoId: string, request: StopVideoProjectRequest, mode: ApiMode = getApiMode()): Promise<VideoProjectActionResultDTO> {
  if (mode === 'mock') {
    throw new Error('mock mode handles stop in the page view model')
  }

  return apiRequest<VideoProjectActionResultDTO>(`/videos/${videoId}/stop`, {
    method: 'POST',
    body: request,
  })
}

function createMockWorkbench(videoId: string): VideoWorkbenchDTO {
  const matched = videos.find((video) => video.id === videoId) ?? videos[0]
  const referenceStatus = matched.referenceStatus
  const isBlocking = referenceStatus === 'blocking'
  const narrations = getMockNarrations(videoId)
  const tts = getMockTts(videoId)
  const subtitles = getMockSubtitles(videoId)
  const visualPlans = getMockVisualPlans(videoId)
  const renders = getMockRenders(videoId)
  const exports = getMockExports(videoId)
  const hasNarration = Boolean(narrations.current)
  const hasCandidates = narrations.candidates.length > 0 || narrations.drafts.length > 0
  const hasTts = Boolean(tts.current)
  const hasTtsCandidates = tts.candidates.length > 0
  const hasSubtitle = Boolean(subtitles.current)
  const hasSubtitleCandidates = subtitles.candidates.length > 0 || subtitles.drafts.length > 0
  const hasVisualPlan = Boolean(visualPlans.current)
  const hasVisualCandidates = visualPlans.candidates.length > 0
  const hasRender = Boolean(renders.current)
  const hasRenderCandidates = renders.candidates.length > 0
  const hasExport = Boolean(exports.current)
  const project = {
    id: matched.id,
    title: matched.title,
    projectType: matched.typeText === '首条测试' ? 'first_test' as const : 'chapter_range' as const,
    novelId: matched.novelId,
    novelTitle: matched.novelTitle,
    lifecycleStatus: matched.lifecycleStatus,
    referenceStatus,
    productionStatus: isBlocking || matched.lifecycleStatus === 'stopped' ? 'generation_locked' as const : 'not_started' as const,
    chapterRangeText: matched.chapterRangeText,
    chapterCount: matched.chapterCount,
    currentVideoReferenceId: matched.referenceVersionText,
    defaultVideoUnitId: `unit_${matched.id}`,
    updatedAt: matched.updatedAt,
  }
  const reference = {
    project,
    referenceId: project.currentVideoReferenceId,
    versionNo: 1,
    status: referenceStatus,
    chapterRangeText: matched.chapterRangeText,
    chapterCount: matched.chapterCount,
    referenceSummary: matched.referenceIssueSummary,
    chapters: [
      {
        chapterId: 'chapter_mock_001',
        chapterNo: 1,
        chapterTitle: '首条引用章节',
        contentVersionId: 'content_mock_v1',
        wordCount: 2200,
        summary: '仅展示摘要，不展示完整正文。',
        riskLevel: 'low',
      },
    ],
    issues: isBlocking
      ? [
          {
            id: 'mock_issue_001',
            issueLevel: 'blocking' as const,
            issueType: 'chapter_version_changed',
            issueReason: '引用章节版本已变化，需先处理引用异常。',
            status: 'open' as const,
            affectedChapterIds: ['chapter_mock_001'],
            resolutionAction: null,
            resolutionReason: null,
          },
        ]
      : [],
    nextAction: { label: isBlocking ? '处理引用异常' : '查看引用快照', disabled: false, disabledReason: null },
  }

  return {
    project,
    reference,
    defaultUnit: {
      id: project.defaultVideoUnitId,
      unitNo: 1,
      unitType: 'first_test',
      title: matched.title,
      chapterRangeText: matched.chapterRangeText,
      chapterIds: ['chapter_mock_001'],
      status: 'reference_ready',
      productionStatus: 'not_started',
    },
    recommendedAction: {
      label: isBlocking
        ? '处理引用异常'
        : hasNarration
          ? hasTts
            ? hasSubtitle
              ? hasVisualPlan
                ? hasRender
                  ? hasExport
                    ? '查看导出记录'
                    : '创建导出记录'
                  : hasRenderCandidates
                    ? '预览并确认当前视频'
                    : '渲染视频预览'
                : hasVisualCandidates
                  ? '确认视觉方案'
                  : '配置视觉方案'
              : hasSubtitleCandidates
                ? '编辑并确认字幕候选'
                : '生成字幕候选'
            : hasTtsCandidates
              ? '试听并确认配音候选'
              : '生成配音候选'
          : hasCandidates
            ? '选择或编辑旁白候选'
            : '生成旁白候选',
      stepKey: isBlocking
        ? 'reference_check'
        : hasNarration
          ? hasTts
            ? hasSubtitle
              ? hasVisualPlan
                ? hasRender
                  ? hasExport
                    ? 'export'
                    : 'export'
                  : hasRenderCandidates
                    ? 'preview'
                    : 'render'
                : 'visual_plan'
              : 'subtitle'
            : 'tts'
          : 'narration',
      disabled: false,
      reason: isBlocking
        ? '引用存在 blocking 异常，先处理引用异常。'
        : hasExport
          ? '已创建导出记录；导出只代表系统内文件占位，不代表发布。'
          : hasRender
            ? '当前视频预览已确认，可以创建导出记录。'
            : hasVisualPlan
              ? '视觉方案已确认，可以生成 mock/local 渲染预览。'
              : hasSubtitle
                ? '字幕已确认，可以配置视觉方案并进入 mock/local 渲染闭环。'
                : hasTts
                  ? '配音已确认，可以进入 P9d 生成、编辑并确认字幕。'
                  : '引用状态正常，可以继续完成旁白与配音后进入字幕调试。',
    },
    steps: createMockWorkbenchSteps(isBlocking, hasNarration, hasTts, hasSubtitle, hasVisualPlan, hasRender, hasExport),
    dependencyRefs: {
      videoReferenceId: reference.referenceId,
      videoReferenceVersion: reference.versionNo,
      videoUnitId: project.defaultVideoUnitId,
      chapterContentVersionIds: ['content_mock_v1'],
    },
    risks: isBlocking ? [{ level: 'blocking', message: '存在 blocking 引用异常，后续视频生产步骤全部锁定。', actionLabel: '处理引用异常' }] : [],
    artifacts: {
      placeholders: [
        { type: 'narration_script', label: '旁白稿', status: hasNarration ? 'confirmed' : hasCandidates ? 'candidate_ready' : 'not_started', currentVersionId: narrations.current?.id ?? null, unlockPackage: 'P9b' },
        { type: 'tts_audio', label: '配音', status: hasTts ? 'confirmed' : hasTtsCandidates ? 'candidate_ready' : hasNarration ? 'not_started' : 'locked', currentVersionId: tts.current?.id ?? null, unlockPackage: 'P9c' },
        { type: 'subtitle', label: '字幕', status: hasSubtitle ? 'confirmed' : hasSubtitleCandidates ? 'candidate_ready' : hasTts ? 'not_started' : 'locked', currentVersionId: subtitles.current?.id ?? null, unlockPackage: 'P9d' },
        { type: 'visual_plan', label: '视觉方案', status: hasVisualPlan ? 'confirmed' : hasVisualCandidates ? 'candidate_ready' : hasSubtitle ? 'not_started' : 'locked', currentVersionId: visualPlans.current?.id ?? null, unlockPackage: 'P9e' },
      ],
      narration: narrations,
      tts,
      subtitle: subtitles,
      visualPlan: visualPlans,
      renders,
      exports,
      render: {
        status: hasRender ? 'confirmed' : hasRenderCandidates ? 'candidate_ready' : hasVisualPlan ? 'not_started' : 'locked',
        currentRenderId: renders.current?.id ?? null,
        lockedReason: hasVisualPlan ? null : '需先确认视觉方案后才能渲染视频预览。',
      },
      export: {
        status: hasExport ? 'created' : hasRender ? 'not_started' : 'locked',
        currentExportId: exports.current?.id ?? null,
        lockedReason: hasRender ? null : '需先确认当前视频预览后才能创建导出记录。',
      },
    },
    recentTasks: createMockRecentTasks(narrations, tts, subtitles, visualPlans, renders, exports),
    operationRecords: [],
  }
}

function createMockRecentTasks(
  narrations: VideoNarrationListDTO,
  tts: VideoTtsListDTO,
  subtitles: VideoSubtitleListDTO,
  visualPlans: VideoVisualPlanListDTO,
  renders: VideoRenderListDTO,
  exports: VideoExportListDTO,
): VideoWorkbenchDTO['recentTasks'] {
  if (renders.activeTask) return [renders.activeTask]
  if (subtitles.activeTask) return [subtitles.activeTask]
  if (tts.activeTask) return [tts.activeTask]
  if (narrations.activeTask) return [narrations.activeTask]

  if (exports.current) {
    return [
      {
        id: `mock-video-export-${exports.current.id}`,
        taskType: 'video_export_create',
        status: 'completed',
        statusNote: `导出记录 ${exports.current.fileName} 已创建；这不是发布记录。`,
      },
    ]
  }

  if (renders.current) {
    return [
      {
        id: `mock-video-render-confirmed-${renders.current.id}`,
        taskType: 'video_render_confirm',
        status: 'completed',
        statusNote: `当前视频预览 v${renders.current.versionNo} 已确认，可创建导出记录。`,
      },
    ]
  }

  const latestRenderCandidate = renders.candidates[0]
  if (latestRenderCandidate) {
    return [
      {
        id: `mock-video-render-generate-${latestRenderCandidate.id}`,
        taskType: 'video_render_generate',
        status: 'completed',
        statusNote: `渲染候选 v${latestRenderCandidate.versionNo} 已生成，等待预览确认。`,
      },
    ]
  }

  if (visualPlans.current) {
    return [
      {
        id: `mock-video-visual-confirmed-${visualPlans.current.id}`,
        taskType: 'video_visual_plan_confirm',
        status: 'completed',
        statusNote: `当前视觉方案 v${visualPlans.current.versionNo} 已确认；下一步渲染视频预览。`,
      },
    ]
  }

  const latestVisualCandidate = visualPlans.candidates[0]
  if (latestVisualCandidate) {
    return [
      {
        id: `mock-video-visual-save-${latestVisualCandidate.id}`,
        taskType: 'video_visual_plan_save',
        status: 'completed',
        statusNote: `视觉方案候选 v${latestVisualCandidate.versionNo} 已保存，等待确认。`,
      },
    ]
  }

  if (subtitles.current) {
    return [
      {
        id: `mock-video-subtitle-confirmed-${subtitles.current.id}`,
        taskType: 'video_subtitle_confirm',
        status: 'completed',
        statusNote: `当前字幕 v${subtitles.current.versionNo} 已确认；下一步配置视觉方案。`,
      },
    ]
  }

  const latestSubtitleDraft = subtitles.drafts[0]
  if (latestSubtitleDraft) {
    return [
      {
        id: `mock-video-subtitle-draft-${latestSubtitleDraft.id}`,
        taskType: 'video_subtitle_edit',
        status: 'completed',
        statusNote: `字幕草稿 v${latestSubtitleDraft.versionNo} 已保存，等待确认。`,
      },
    ]
  }

  const latestSubtitleCandidate = subtitles.candidates[0]
  if (latestSubtitleCandidate) {
    return [
      {
        id: `mock-video-subtitle-generate-${latestSubtitleCandidate.id}`,
        taskType: 'video_subtitle_generate',
        status: 'completed',
        statusNote: `字幕候选 v${latestSubtitleCandidate.versionNo} 已生成，等待编辑或确认。`,
      },
    ]
  }

  if (tts.current) {
    return [
      {
        id: `mock-video-tts-confirmed-${tts.current.id}`,
        taskType: 'video_tts_confirm',
        status: 'completed',
        statusNote: `当前配音 v${tts.current.versionNo} 已确认；下一步生成字幕候选。`,
      },
    ]
  }

  const latestTtsCandidate = tts.candidates[0]
  if (latestTtsCandidate) {
    return [
      {
        id: `mock-video-tts-generate-${latestTtsCandidate.id}`,
        taskType: 'video_tts_generate',
        status: 'completed',
        statusNote: `配音候选 v${latestTtsCandidate.versionNo} 已生成，等待试听确认。`,
      },
    ]
  }

  if (narrations.current) {
    return [
      {
        id: `mock-video-narration-confirmed-${narrations.current.id}`,
        taskType: 'video_narration_confirm',
        status: 'completed',
        statusNote: `当前旁白 v${narrations.current.versionNo} 已确认；下一步生成配音候选。`,
      },
    ]
  }

  const latestDraft = narrations.drafts[0]
  if (latestDraft) {
    return [
      {
        id: `mock-video-narration-draft-${latestDraft.id}`,
        taskType: 'video_narration_edit',
        status: 'completed',
        statusNote: `旁白草稿 v${latestDraft.versionNo} 已保存，等待确认。`,
      },
    ]
  }

  const latestCandidate = narrations.candidates[0]
  if (latestCandidate) {
    return [
      {
        id: `mock-video-narration-generate-${latestCandidate.id}`,
        taskType: 'video_narration_generate',
        status: 'completed',
        statusNote: `已生成 ${narrations.candidates.length} 个旁白候选，等待选择。`,
      },
    ]
  }

  return []
}

function createMockWorkbenchSteps(
  isBlocking: boolean,
  hasNarration = false,
  hasTts = false,
  hasSubtitle = false,
  hasVisualPlan = false,
  hasRender = false,
  hasExport = false,
): VideoWorkbenchDTO['steps'] {
  const keys: Array<[VideoWorkbenchDTO['steps'][number]['key'], string, string, VideoWorkbenchDTO['steps'][number]['unlockPackage']]> = [
    ['reference_check', '引用检查', '查看引用快照、章节版本和异常建议。', 'P9a'],
    ['narration', '旁白稿', '后续生成和确认旁白稿。', 'P9b'],
    ['tts', '配音', '后续生成、试听和确认配音。', 'P9c'],
    ['subtitle', '字幕', '后续生成、编辑和确认字幕。', 'P9d'],
    ['visual_plan', '视觉方案', '后续确认视觉方案。', 'P9e'],
    ['render', '渲染', '后续渲染视频。', 'P9e'],
    ['preview', '预览确认', '后续预览并确认当前视频。', 'P9e'],
    ['export', '导出', '后续导出文件，不自动发布。', 'P9e'],
  ]
  return keys.map(([key, label, description, unlockPackage], index) => ({
    key,
    label,
    description,
    unlockPackage,
    status: index === 0
      ? 'active'
      : key === 'narration' && !isBlocking
        ? (hasNarration ? 'completed' : 'active')
        : key === 'tts' && !isBlocking
          ? (hasTts ? 'completed' : hasNarration ? 'active' : 'placeholder_locked')
          : key === 'subtitle' && !isBlocking
            ? (hasSubtitle ? 'completed' : hasTts ? 'active' : 'placeholder_locked')
            : key === 'visual_plan' && !isBlocking
              ? (hasVisualPlan ? 'completed' : hasSubtitle ? 'active' : 'placeholder_locked')
              : key === 'render' && !isBlocking
                ? (hasRender ? 'completed' : hasVisualPlan ? 'active' : 'placeholder_locked')
                : key === 'preview' && !isBlocking
                  ? (hasRender ? 'completed' : hasVisualPlan ? 'active' : 'placeholder_locked')
                  : key === 'export' && !isBlocking
                    ? (hasExport ? 'completed' : hasRender ? 'active' : 'placeholder_locked')
          : isBlocking
            ? 'blocked'
            : 'placeholder_locked',
    lockedReason:
      index === 0 ||
      (key === 'narration' && !isBlocking) ||
      (key === 'tts' && !isBlocking && hasNarration) ||
      (key === 'subtitle' && !isBlocking && hasTts) ||
      (key === 'visual_plan' && !isBlocking && hasSubtitle) ||
      (key === 'render' && !isBlocking && hasVisualPlan) ||
      (key === 'preview' && !isBlocking && hasVisualPlan) ||
      (key === 'export' && !isBlocking && hasRender)
        ? null
        : isBlocking
          ? '引用存在 blocking 异常，先处理引用异常后才能继续。'
          : key === 'tts'
            ? '需先确认旁白稿后才能生成配音。'
            : key === 'subtitle'
              ? '需先确认配音后才能生成字幕。'
              : key === 'visual_plan'
                ? '需先确认字幕后才能配置视觉方案。'
                : key === 'render' || key === 'preview'
                  ? '需先确认视觉方案后才能渲染和预览视频。'
                  : key === 'export'
                    ? '需先确认当前视频预览后才能创建导出记录。'
                    : `${unlockPackage} 解锁${label}。`,
  }))
}

function getMockNarrations(videoId: string): VideoNarrationListDTO {
  const existing = mockNarrationsByVideo.get(videoId)
  if (existing) return existing

  const empty: VideoNarrationListDTO = {
    current: null,
    candidates: [],
    drafts: [],
    history: [],
    activeTask: null,
  }
  mockNarrationsByVideo.set(videoId, empty)
  return empty
}

function getMockTts(videoId: string): VideoTtsListDTO {
  const existing = mockTtsByVideo.get(videoId)
  if (existing) return existing

  const empty: VideoTtsListDTO = {
    current: null,
    candidates: [],
    history: [],
    activeTask: null,
  }
  mockTtsByVideo.set(videoId, empty)
  return empty
}

function getMockSubtitles(videoId: string): VideoSubtitleListDTO {
  const existing = mockSubtitlesByVideo.get(videoId)
  if (existing) return existing

  const empty: VideoSubtitleListDTO = {
    current: null,
    candidates: [],
    drafts: [],
    history: [],
    activeTask: null,
  }
  mockSubtitlesByVideo.set(videoId, empty)
  return empty
}

function getMockVisualPlans(videoId: string): VideoVisualPlanListDTO {
  const existing = mockVisualPlansByVideo.get(videoId)
  if (existing) return existing

  const empty: VideoVisualPlanListDTO = {
    current: null,
    candidates: [],
    history: [],
  }
  mockVisualPlansByVideo.set(videoId, empty)
  return empty
}

function getMockRenders(videoId: string): VideoRenderListDTO {
  const existing = mockRendersByVideo.get(videoId)
  if (existing) return existing

  const empty: VideoRenderListDTO = {
    current: null,
    candidates: [],
    history: [],
    activeTask: null,
  }
  mockRendersByVideo.set(videoId, empty)
  return empty
}

function getMockExports(videoId: string): VideoExportListDTO {
  const existing = mockExportsByVideo.get(videoId)
  if (existing) return existing

  const empty: VideoExportListDTO = {
    current: null,
    history: [],
  }
  mockExportsByVideo.set(videoId, empty)
  return empty
}

function createMockNarrationArtifacts(videoId: string, requestedCount: number, qualityMode: GenerateVideoNarrationRequest['qualityMode']) {
  const count = Math.min(Math.max(requestedCount, 1), 3)
  return Array.from({ length: count }, (_, index) =>
    createMockNarrationArtifact(videoId, {
      id: `mock-narration-${Date.now()}-${index + 1}`,
      versionNo: getMockNarrations(videoId).history.length + index + 1,
      qualityMode: qualityMode ?? 'standard',
      metadata: { isMockOutput: true, candidateRank: index + 1 },
    }),
  )
}

type VideoNarrationTask = NonNullable<VideoNarrationListDTO['activeTask']>
type VideoTtsTask = NonNullable<VideoTtsListDTO['activeTask']>
type VideoSubtitleTask = NonNullable<VideoSubtitleListDTO['activeTask']>
type VideoRenderTask = NonNullable<VideoRenderListDTO['activeTask']>

function createMockNarrationTask(outcome: NonNullable<GenerateVideoNarrationRequest['mockTaskOutcome']>, retryOfTaskId: string | null): VideoNarrationTask {
  if (outcome === 'failed') {
    return {
      id: `mock-video-task-failed-${Date.now()}`,
      taskType: 'video_narration_generate',
      status: 'failed',
      currentStep: 'calling_model',
      statusNote: '旁白生成失败，旧版本不受影响。可以重试生成或手动编辑。',
      progress: 45,
      failureCategory: 'provider_error',
      retryOfTaskId,
      canRetry: true,
      canCancel: true,
    }
  }

  if (outcome === 'cancelled') {
    return {
      id: `mock-video-task-cancelled-${Date.now()}`,
      taskType: 'video_narration_generate',
      status: 'cancelled',
      currentStep: 'cancelled',
      statusNote: '旁白生成已取消，未写入候选版本，配音仍保持锁定。',
      progress: 0,
      failureCategory: 'user_cancelled',
      retryOfTaskId,
      canRetry: true,
      canCancel: false,
    }
  }

  return {
    id: `mock-video-task-${Date.now()}`,
    taskType: 'video_narration_generate',
    status: 'completed',
    currentStep: 'saving_result',
    statusNote: '旁白候选已生成，等待选择。',
    progress: 100,
    failureCategory: null,
    retryOfTaskId,
    canRetry: false,
    canCancel: false,
  }
}

function createMockTtsTask(outcome: NonNullable<GenerateVideoTtsRequest['mockTaskOutcome']>, retryOfTaskId: string | null): VideoTtsTask {
  if (outcome === 'failed') {
    return {
      id: `mock-video-tts-task-failed-${Date.now()}`,
      taskType: 'video_tts_generate',
      status: 'failed',
      currentStep: 'calling_model',
      statusNote: '配音生成失败，当前音频不受影响。可以重试、换音色或调整语速。',
      progress: 48,
      failureCategory: 'provider_error',
      retryOfTaskId,
      canRetry: true,
      canCancel: true,
    }
  }

  if (outcome === 'cancelled') {
    return {
      id: `mock-video-tts-task-cancelled-${Date.now()}`,
      taskType: 'video_tts_generate',
      status: 'cancelled',
      currentStep: 'cancelled',
      statusNote: '配音生成已取消，未写入候选音频，字幕仍保持锁定。',
      progress: 0,
      failureCategory: 'user_cancelled',
      retryOfTaskId,
      canRetry: true,
      canCancel: false,
    }
  }

  return {
    id: `mock-video-tts-task-${Date.now()}`,
    taskType: 'video_tts_generate',
    status: 'completed',
    currentStep: 'saving_result',
    statusNote: '配音候选已生成，等待试听确认。',
    progress: 100,
    failureCategory: null,
    retryOfTaskId,
    canRetry: false,
    canCancel: false,
  }
}

function createMockSubtitleTask(outcome: NonNullable<GenerateVideoSubtitleRequest['mockTaskOutcome']>, retryOfTaskId: string | null): VideoSubtitleTask {
  if (outcome === 'failed') {
    return {
      id: `mock-video-subtitle-task-failed-${Date.now()}`,
      taskType: 'video_subtitle_generate',
      status: 'failed',
      currentStep: 'calling_model',
      statusNote: '字幕生成失败，当前字幕不受影响。可以重试或手动编辑字幕草稿。',
      progress: 52,
      failureCategory: 'provider_error',
      retryOfTaskId,
      canRetry: true,
      canCancel: true,
    }
  }

  if (outcome === 'cancelled') {
    return {
      id: `mock-video-subtitle-task-cancelled-${Date.now()}`,
      taskType: 'video_subtitle_generate',
      status: 'cancelled',
      currentStep: 'cancelled',
      statusNote: '字幕生成已取消，未写入候选字幕。',
      progress: 0,
      failureCategory: 'user_cancelled',
      retryOfTaskId,
      canRetry: true,
      canCancel: false,
    }
  }

  return {
    id: `mock-video-subtitle-task-${Date.now()}`,
    taskType: 'video_subtitle_generate',
    status: 'completed',
    currentStep: 'saving_result',
    statusNote: '字幕候选已生成，等待编辑或确认。',
    progress: 100,
    failureCategory: null,
    retryOfTaskId,
    canRetry: false,
    canCancel: false,
  }
}

function createMockRenderTask(outcome: NonNullable<GenerateVideoRenderRequest['mockTaskOutcome']>, retryOfTaskId: string | null): VideoRenderTask {
  if (outcome === 'failed') {
    return {
      id: `mock-video-render-task-failed-${Date.now()}`,
      taskType: 'video_render_generate',
      status: 'failed',
      currentStep: 'rendering_preview',
      statusNote: '渲染预览失败，当前视频不受影响。可以重试或调整视觉方案。',
      progress: 62,
      failureCategory: 'provider_error',
      retryOfTaskId,
      canRetry: true,
      canCancel: true,
    }
  }

  if (outcome === 'cancelled') {
    return {
      id: `mock-video-render-task-cancelled-${Date.now()}`,
      taskType: 'video_render_generate',
      status: 'cancelled',
      currentStep: 'cancelled',
      statusNote: '渲染预览已取消，未写入候选视频，导出仍保持锁定。',
      progress: 0,
      failureCategory: 'user_cancelled',
      retryOfTaskId,
      canRetry: true,
      canCancel: false,
    }
  }

  return {
    id: `mock-video-render-task-${Date.now()}`,
    taskType: 'video_render_generate',
    status: 'completed',
    currentStep: 'saving_result',
    statusNote: '渲染预览已生成，等待预览确认。',
    progress: 100,
    failureCategory: null,
    retryOfTaskId,
    canRetry: false,
    canCancel: false,
  }
}

function createMockNarrationArtifact(videoId: string, overrides: Partial<VideoNarrationArtifactDTO> = {}): VideoNarrationArtifactDTO {
  const contentText =
    overrides.contentText ??
    '前三秒钩子：秦朝盐场快塌了，一个化学老师醒来后决定先救盐。他用现代化学知识把粗盐、火药和人心一步步变成翻盘筹码，结尾留下官府新命令的悬念。'
  return {
    id: overrides.id ?? `mock-narration-${Date.now()}`,
    artifactType: 'narration_script',
    status: overrides.status ?? 'candidate',
    versionNo: overrides.versionNo ?? getMockNarrations(videoId).history.length + 1,
    isCurrent: overrides.isCurrent ?? false,
    contentText,
    hook: overrides.hook ?? '秦朝盐场快塌了，他却拿出现代化学办法。',
    firstScreenSubtitle: overrides.firstScreenSubtitle ?? '化学老师穿秦朝，开局救盐场',
    endingHook: overrides.endingHook ?? '真正的危机，来自官府的下一道命令。',
    estimatedDurationSeconds: overrides.estimatedDurationSeconds ?? Math.max(10, Math.ceil(Array.from(contentText).length / 3.2)),
    wordCount: overrides.wordCount ?? Array.from(contentText).length,
    riskTags: overrides.riskTags ?? ['低风险', '节奏稳定'],
    recommendationReason: overrides.recommendationReason ?? '受控 mock 旁白，适合页面验收。',
    score: overrides.score ?? 86,
    qualitySummary: overrides.qualitySummary ?? '钩子清晰，时长适合首条测试。',
    sourceVersionRefs: overrides.sourceVersionRefs ?? {
      videoReferenceId: 'mock-reference',
      videoReferenceVersion: 1,
      videoUnitId: `unit_${videoId}`,
      videoReadinessSnapshotId: 'snapshot_mock_003',
      chapterContentVersionIds: ['content_mock_v1'],
    },
    providerSummary: overrides.providerSummary ?? { provider: 'mock', model: 'mock-video-narration', isMockOutput: true },
    providerRouteId: overrides.providerRouteId ?? 'video_narration_agent.mock.v1',
    strategyVersion: overrides.strategyVersion ?? 'video_narration_strategy.v1',
    qualityMode: overrides.qualityMode ?? 'standard',
    metadata: overrides.metadata ?? { isMockOutput: true },
    rejectedReason: overrides.rejectedReason ?? null,
    confirmedAt: overrides.confirmedAt ?? null,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  }
}

function createMockTtsArtifact(videoId: string, request: GenerateVideoTtsRequest): VideoTtsArtifactDTO {
  const narrations = getMockNarrations(videoId)
  const currentNarration = narrations.current
  const voiceName = request.voiceName ?? resolveMockVoiceName(request.voiceId)
  const durationSeconds = Math.max(8, Math.round((currentNarration?.estimatedDurationSeconds ?? 58) / Math.max(request.speed, 0.5)))
  const id = `mock-tts-${Date.now()}`
  return {
    id,
    artifactType: 'tts_audio',
    status: 'candidate',
    versionNo: getMockTts(videoId).history.length + 1,
    isCurrent: false,
    voiceId: request.voiceId,
    voiceName,
    speed: request.speed,
    emotion: request.emotion,
    volume: request.volume,
    durationSeconds,
    fileKey: `mock://video-tts/${id}.mp3`,
    previewUrl: `/mock-audio/video-tts/${id}.mp3`,
    riskTags: ['模拟音频', request.speed > 1.4 ? '语速偏快' : '节奏稳定'],
    recommendationReason: `${voiceName} 已按 ${request.emotion} 情绪生成 mock 试听候选。`,
    qualitySummary: '本地 mock TTS 产物，可用于流程验收；未调用真实外部 TTS。',
    sourceVersionRefs: {
      videoReferenceId: 'mock-reference',
      videoReferenceVersion: request.expectedReferenceVersion,
      videoUnitId: request.videoUnitId,
      videoReadinessSnapshotId: 'snapshot_mock_003',
      narrationArtifactId: request.narrationArtifactId,
      narrationVersionNo: request.expectedNarrationVersionNo,
      chapterContentVersionIds: ['content_mock_v1'],
    },
    providerSummary: { provider: 'mock-local-tts', model: 'mock-tts-v1', isMockOutput: true, safeSummary: '本地 mock TTS provider，仅生成试听占位和安全摘要。' },
    providerRouteId: 'video_tts_provider.mock.v1',
    strategyVersion: 'video_tts_strategy.v1',
    qualityMode: request.qualityMode ?? 'standard',
    metadata: { isMockOutput: true, previewKind: 'mock-local-audio-placeholder' },
    rejectedReason: null,
    confirmedAt: null,
    createdAt: new Date().toISOString(),
  }
}

function createMockSubtitleArtifact(videoId: string, input: GenerateVideoSubtitleRequest | Partial<VideoSubtitleArtifactDTO>): VideoSubtitleArtifactDTO {
  const narrations = getMockNarrations(videoId)
  const tts = getMockTts(videoId)
  const currentNarration = narrations.current
  const currentTts = tts.current
  const data = input as Partial<VideoSubtitleArtifactDTO> & Partial<GenerateVideoSubtitleRequest>
  const lineLength = clampSubtitleLineLength(data.lineLength)
  const subtitleStyle = data.subtitleStyle ?? 'balanced'
  const contentText =
    typeof data.contentText === 'string'
      ? data.contentText
      : createMockSubtitleText(currentNarration?.contentText ?? '化学老师穿秦朝开局救盐场他靠现代知识翻盘', lineLength, subtitleStyle)
  const id = data.id ?? `mock-subtitle-${Date.now()}`

  return {
    id,
    artifactType: 'subtitle',
    status: data.status ?? 'candidate',
    versionNo: data.versionNo ?? getMockSubtitles(videoId).history.length + 1,
    isCurrent: data.isCurrent ?? false,
    contentText,
    firstScreenSubtitle: data.firstScreenSubtitle ?? currentNarration?.firstScreenSubtitle ?? contentText.split('\n')[0] ?? '首屏字幕',
    timelineSummary: data.timelineSummary ?? createTimelineSummary(contentText),
    estimatedDurationSeconds: data.estimatedDurationSeconds ?? currentTts?.durationSeconds ?? estimateSubtitleDuration(contentText),
    lineCount: data.lineCount ?? contentText.split('\n').filter(Boolean).length,
    wordCount: data.wordCount ?? Array.from(contentText).filter((char) => !/\s/.test(char)).length,
    riskTags: data.riskTags ?? (subtitleStyle === 'dramatic' ? ['首屏强刺激需复核', '节奏偏快'] : ['低风险', '行长可控']),
    recommendationReason: data.recommendationReason ?? `按 ${subtitleStyle} 风格和每行约 ${lineLength} 字生成字幕候选。`,
    score: data.score ?? (subtitleStyle === 'dramatic' ? 78 : 88),
    qualitySummary: data.qualitySummary ?? '字幕已按当前配音时长和旁白内容生成，可编辑后确认进入视觉方案前置。',
    sourceVersionRefs: data.sourceVersionRefs ?? {
      videoReferenceId: 'mock-reference',
      videoReferenceVersion: typeof data.expectedReferenceVersion === 'number' ? data.expectedReferenceVersion : 1,
      videoUnitId: typeof data.videoUnitId === 'string' ? data.videoUnitId : `unit_${videoId}`,
      videoReadinessSnapshotId: 'snapshot_mock_003',
      narrationArtifactId: currentNarration?.id ?? 'mock-narration-missing',
      narrationVersionNo: currentNarration?.versionNo ?? 1,
      ttsArtifactId: currentTts?.id ?? (typeof data.ttsArtifactId === 'string' ? data.ttsArtifactId : 'mock-tts-missing'),
      ttsVersionNo: currentTts?.versionNo ?? (typeof data.expectedTtsVersionNo === 'number' ? data.expectedTtsVersionNo : 1),
      chapterContentVersionIds: ['content_mock_v1'],
    },
    providerSummary: data.providerSummary ?? { provider: 'mock-local-subtitle', model: 'mock-subtitle-v1', isMockOutput: true, safeSummary: '本地 mock 字幕 provider，仅生成分行字幕和安全摘要。' },
    providerRouteId: data.providerRouteId ?? 'video_subtitle_provider.mock.v1',
    strategyVersion: data.strategyVersion ?? 'video_subtitle_strategy.v1',
    qualityMode: data.qualityMode ?? 'standard',
    subtitleStyle: data.subtitleStyle ?? subtitleStyle,
    lineLength: data.lineLength ?? lineLength,
    metadata: data.metadata ?? { isMockOutput: true, subtitleStyle, lineLength },
    rejectedReason: data.rejectedReason ?? null,
    confirmedAt: data.confirmedAt ?? null,
    createdAt: data.createdAt ?? new Date().toISOString(),
  }
}

function createMockVisualPlanArtifact(videoId: string, request: SaveVideoVisualPlanRequest): VideoVisualPlanArtifactDTO {
  const subtitles = getMockSubtitles(videoId)
  const subtitle = subtitles.current
  const backgroundName = request.backgroundName ?? resolveMockBackgroundName(request.backgroundAssetId)
  const id = `mock-visual-plan-${Date.now()}`
  return {
    id,
    artifactType: 'visual_plan',
    status: 'candidate',
    versionNo: getMockVisualPlans(videoId).history.length + 1,
    isCurrent: false,
    backgroundAssetId: request.backgroundAssetId,
    backgroundName,
    backgroundType: 'loop_background',
    aspectRatio: request.aspectRatio,
    resolution: request.resolution,
    subtitlePosition: request.subtitlePosition,
    fontSize: request.fontSize,
    textColor: request.textColor,
    strokeColor: request.strokeColor,
    shadowEnabled: request.shadowEnabled,
    safeAreaPreset: request.safeAreaPreset,
    riskTags: ['本地循环背景', request.fontSize < 32 ? '字号偏小需复核' : '安全区可控'],
    recommendationReason: `${backgroundName} 已按 ${request.aspectRatio} 和 ${request.resolution} 保存为视觉方案候选。`,
    qualitySummary: 'mock/local 视觉方案，仅使用循环背景、字幕样式和安全区参数；不接外部素材搜索。',
    sourceVersionRefs: {
      videoReferenceId: 'mock-reference',
      videoReferenceVersion: request.expectedReferenceVersion,
      videoUnitId: request.videoUnitId,
      videoReadinessSnapshotId: 'snapshot_mock_003',
      narrationArtifactId: subtitle?.sourceVersionRefs.narrationArtifactId ?? 'mock-narration-missing',
      narrationVersionNo: subtitle?.sourceVersionRefs.narrationVersionNo ?? 1,
      ttsArtifactId: subtitle?.sourceVersionRefs.ttsArtifactId ?? 'mock-tts-missing',
      ttsVersionNo: subtitle?.sourceVersionRefs.ttsVersionNo ?? 1,
      subtitleArtifactId: request.subtitleArtifactId,
      subtitleVersionNo: request.expectedSubtitleVersionNo,
      chapterContentVersionIds: ['content_mock_v1'],
    },
    providerSummary: { provider: 'mock-local-visual', model: 'mock-visual-plan-v1', isMockOutput: true, safeSummary: '本地 mock 视觉方案，仅返回安全摘要和参数。' },
    providerRouteId: 'video_visual_plan_provider.mock.v1',
    strategyVersion: 'video_visual_plan_strategy.v1',
    qualityMode: request.qualityMode ?? 'standard',
    metadata: { isMockOutput: true, visualPlanKind: 'loop_background' },
    rejectedReason: null,
    confirmedAt: null,
    createdAt: new Date().toISOString(),
  }
}

function createMockRender(videoId: string, request: GenerateVideoRenderRequest): VideoRenderDTO {
  const visualPlan = getMockVisualPlans(videoId).current
  const id = `mock-render-${Date.now()}`
  return {
    id,
    versionNo: getMockRenders(videoId).history.length + 1,
    status: 'candidate',
    isCurrent: false,
    previewStatus: 'preview_pending',
    previewUrl: `/mock-video/renders/${id}.mp4`,
    fileKey: `mock://video-render/${id}.mp4`,
    durationSeconds: getMockSubtitles(videoId).current?.estimatedDurationSeconds ?? 58,
    renderMode: 'mock_loop_background',
    qualityMode: request.qualityMode ?? 'standard',
    qualityIssues: ['本地 mock 渲染预览，需人工确认画面节奏', visualPlan?.safeAreaPreset === 'douyin_safe' ? '抖音安全区已套用' : '安全区需复核'],
    safeSummary: 'mock/local render provider 仅生成系统内预览和导出占位，不调用真实渲染工具。',
    providerSummary: { provider: 'mock-local-render', model: 'mock-render-v1', isMockOutput: true, safeSummary: '本地 mock 渲染 provider，仅返回预览占位和安全摘要。' },
    providerRouteId: 'video_render_provider.mock.v1',
    strategyVersion: 'video_render_strategy.v1',
    sourceVersionRefs: {
      videoReferenceId: 'mock-reference',
      videoReferenceVersion: request.expectedReferenceVersion,
      videoUnitId: request.videoUnitId,
      videoReadinessSnapshotId: 'snapshot_mock_003',
      narrationArtifactId: visualPlan?.sourceVersionRefs.narrationArtifactId ?? 'mock-narration-missing',
      narrationVersionNo: visualPlan?.sourceVersionRefs.narrationVersionNo ?? 1,
      ttsArtifactId: visualPlan?.sourceVersionRefs.ttsArtifactId ?? 'mock-tts-missing',
      ttsVersionNo: visualPlan?.sourceVersionRefs.ttsVersionNo ?? 1,
      subtitleArtifactId: visualPlan?.sourceVersionRefs.subtitleArtifactId ?? 'mock-subtitle-missing',
      subtitleVersionNo: visualPlan?.sourceVersionRefs.subtitleVersionNo ?? 1,
      visualPlanArtifactId: request.visualPlanArtifactId,
      visualPlanVersionNo: request.expectedVisualPlanVersionNo,
      chapterContentVersionIds: ['content_mock_v1'],
    },
    rejectedReason: null,
    confirmedAt: null,
    createdAt: new Date().toISOString(),
  }
}

function createMockExport(render: VideoRenderDTO, fileName?: string): VideoExportDTO {
  const id = `mock-export-${Date.now()}`
  return {
    id,
    status: 'created',
    fileKey: `mock://video-export/${id}.mp4`,
    downloadUrl: `/mock-video/exports/${id}.mp4`,
    fileName: fileName?.trim() || `mock-video-${render.versionNo}.mp4`,
    renderVersionId: render.id,
    renderVersionNo: render.versionNo,
    safeSummary: '导出记录仅为系统内文件占位，不代表发布、上传或平台回填。',
    createdAt: new Date().toISOString(),
  }
}

function createMockSubtitleText(rawText: string, lineLength: number, subtitleStyle: 'compact' | 'balanced' | 'dramatic') {
  const punctuation = subtitleStyle === 'dramatic' ? '！' : '。'
  const normalized = rawText.replace(/^前三秒钩子：/, '').replace(/[，。！？；：,.!?;:]/g, ' ').replace(/\s+/g, '')
  const lines: string[] = []
  for (let index = 0; index < normalized.length; index += lineLength) {
    const chunk = normalized.slice(index, index + lineLength)
    if (chunk) lines.push(`${chunk}${punctuation}`)
  }
  if (subtitleStyle === 'compact') return lines.slice(0, 8).join('\n')
  if (subtitleStyle === 'dramatic') return lines.slice(0, 11).join('\n')
  return lines.slice(0, 10).join('\n')
}

function estimateSubtitleDuration(contentText: string) {
  return Math.max(8, Math.ceil(Array.from(contentText).filter((char) => !/\s/.test(char)).length / 3.4))
}

function createTimelineSummary(contentText: string) {
  return contentText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6)
}

function clampSubtitleLineLength(value?: number) {
  return Math.min(Math.max(value ?? 18, 10), 28)
}

function resolveMockVoiceName(voiceId: string) {
  if (voiceId === 'mock-female-bright') return '女声-明亮感'
  if (voiceId === 'mock-neutral-calm') return '中性-冷静感'
  return '男声-剧情感'
}

function resolveMockBackgroundName(backgroundAssetId: string) {
  return VIDEO_VISUAL_BACKGROUND_ASSETS.find((asset) => asset.id === backgroundAssetId)?.name ?? '默认循环背景'
}
