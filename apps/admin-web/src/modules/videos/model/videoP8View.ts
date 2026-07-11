import type {
  VideoNarrationListDTO,
  VideoProjectDTO,
  VideoReadySourceDTO,
  VideoReferenceDetailDTO,
  VideoRenderListDTO,
  VideoSubtitleListDTO,
  VideoTtsListDTO,
  VideoVisualPlanListDTO,
  VideoWorkbenchDTO,
  VideoWorkbenchStepDTO,
} from '@ai-shortvideo/shared'
import { sanitizeVideoArtifactMetadata, sanitizeVideoProviderSummary, sanitizeVideoVisibleTask } from '@ai-shortvideo/shared'

export const VIDEO_P8_VIEW_KEYS = ['overview', 'source', 'list', 'create', 'snapshot', 'issue', 'generation'] as const

export type VideoP8ViewKey = (typeof VIDEO_P8_VIEW_KEYS)[number]
export type VideoReferenceStatus = 'normal' | 'info' | 'warning' | 'blocking' | 'resolved'
export type VideoLifecycleStatus = 'active' | 'stopped' | 'archived'
export type VideoP8ActionIntent = 'primary' | 'warning' | 'danger' | 'info'
export type VideoP8ActionTarget = 'snapshot' | 'issue' | 'list' | 'create' | 'generation' | 'novel' | 'record'
export type VideoP8IssueAction = 'return_to_novel' | 'ignore' | 'stop' | 'resolve'
export type VideoWorkbenchViewStepStatus = 'active' | 'completed' | 'placeholder_locked' | 'blocked'

export interface VideoP8Project {
  id: string
  title: string
  typeText: string
  novelId: string
  novelTitle: string
  novelStageText: string
  chapterRangeText: string
  chapterCount: number
  referenceVersionText: string
  referenceSnapshotAt: string
  referenceStatus: VideoReferenceStatus
  referenceStatusText: string
  referenceIssueSummary: string
  lifecycleStatus: VideoLifecycleStatus
  lifecycleStatusText: string
  productionStatusText: string
  updatedAt: string
  recommendedActionReason: string
}

export interface VideoP8Source {
  id: string
  title: string
  status: string
  snapshot: string
  snapshotId: string
  range: string
  chapterIds: string[]
}

export interface VideoP8Action {
  label: string
  intent: VideoP8ActionIntent
  target: VideoP8ActionTarget
  disabled: boolean
  disabledReason: string | null
}

export interface VideoP8Metrics {
  total: number
  normal: number
  attention: number
  blocking: number
  stopped: number
}

export interface VideoWorkbenchView {
  videoId: string
  title: string
  novelTitle: string
  projectStatusText: string
  recommendedAction: {
    label: string
    reason: string
    disabled: boolean
  }
  reference: {
    id: string
    versionText: string
    status: VideoReferenceStatus
    statusText: string
    summary: string
    chapterRangeText: string
    chapters: ReturnType<typeof mapVideoReferenceDetailToChapterRows>
  }
  defaultUnit: {
    id: string
    title: string
    chapterRangeText: string
    statusText: string
  }
  steps: VideoWorkbenchViewStep[]
  dependencyRefs: VideoWorkbenchDTO['dependencyRefs']
  artifacts: VideoWorkbenchDTO['artifacts']
  narration: {
    currentLabel: string
    candidateCount: number
    draftCount: number
    historyCount: number
    providerText: string
  }
  tts: {
    currentLabel: string
    candidateCount: number
    historyCount: number
    providerText: string
  }
  subtitle: {
    currentLabel: string
    candidateCount: number
    draftCount: number
    historyCount: number
    providerText: string
  }
  risks: VideoWorkbenchDTO['risks']
  riskSummary: string
  recentTasks: VideoWorkbenchDTO['recentTasks']
  operationRecords: VideoWorkbenchDTO['operationRecords']
}

export interface VideoWorkbenchViewStep {
  key: VideoWorkbenchStepDTO['key']
  label: string
  status: VideoWorkbenchViewStepStatus
  statusText: string
  description: string
  lockedReason: string | null
  unlockPackage?: VideoWorkbenchStepDTO['unlockPackage']
  clickable: boolean
  action: {
    label: string
    disabled: boolean
    disabledReason: string | null
  }
}

export const P8_FORBIDDEN_ACTION_LABELS = ['生成视频', '生成配音', '生成字幕', '渲染视频', '标记发布', '回填数据'] as const
export const CREATE_WIZARD_COMPLETED_STEP = 4

const VIEW_KEY_SET = new Set<string>(VIDEO_P8_VIEW_KEYS)

export function createVideoP8Metrics(projects: VideoP8Project[]): VideoP8Metrics {
  return {
    total: projects.length,
    normal: projects.filter((project) => project.referenceStatus === 'normal').length,
    attention: projects.filter((project) => project.referenceStatus === 'info' || project.referenceStatus === 'warning' || project.referenceStatus === 'blocking').length,
    blocking: projects.filter((project) => project.referenceStatus === 'blocking').length,
    stopped: projects.filter((project) => project.lifecycleStatus === 'stopped').length,
  }
}

export function getVideoP8PrimaryAction(project: Pick<VideoP8Project, 'referenceStatus' | 'lifecycleStatus'>): VideoP8Action {
  if (project.lifecycleStatus === 'stopped') {
    return {
      label: '查看处理记录',
      intent: 'info',
      target: 'record',
      disabled: false,
      disabledReason: null,
    }
  }

  if (project.referenceStatus === 'blocking') {
    return {
      label: '处理异常',
      intent: 'danger',
      target: 'issue',
      disabled: false,
      disabledReason: null,
    }
  }

  if (project.referenceStatus === 'warning' || project.referenceStatus === 'info') {
    return {
      label: '查看差异',
      intent: 'warning',
      target: 'issue',
      disabled: false,
      disabledReason: null,
    }
  }

  if (project.referenceStatus === 'resolved') {
    return {
      label: '查看处理记录',
      intent: 'info',
      target: 'record',
      disabled: false,
      disabledReason: null,
    }
  }

  return {
    label: '查看引用快照',
    intent: 'primary',
    target: 'snapshot',
    disabled: false,
    disabledReason: null,
  }
}

export function hasForbiddenP8Action(label: string): boolean {
  return (P8_FORBIDDEN_ACTION_LABELS as readonly string[]).includes(label)
}

export function getCreateWizardNextLabel(step: number): string {
  if (step <= 1) return '下一步：确认范围'
  if (step === 2) return '下一步：创建前检查'
  if (step === 3) return '创建视频项目'
  return '查看引用快照'
}

export function resolveCreateWizardStepRequest(input: {
  currentStep: number
  requestedStep: number
  hasCreatedProject: boolean
}): { nextStep: number; allowed: boolean; message: string | null } {
  const normalizedRequestedStep = Math.min(Math.max(input.requestedStep, 1), CREATE_WIZARD_COMPLETED_STEP)

  if (normalizedRequestedStep === CREATE_WIZARD_COMPLETED_STEP && !input.hasCreatedProject) {
    return {
      nextStep: input.currentStep,
      allowed: false,
      message:
        input.currentStep >= 3
          ? '请点击底部“创建视频项目”完成正式创建。'
          : '请先按底部按钮完成前置步骤，创建成功后才能查看完成状态。',
    }
  }

  if (normalizedRequestedStep > input.currentStep + 1) {
    return {
      nextStep: input.currentStep,
      allowed: false,
      message: '请先按底部按钮完成前置步骤，不能跳过中间确认。',
    }
  }

  return { nextStep: normalizedRequestedStep, allowed: true, message: null }
}

export function createVideoP8RouteQuery(view: VideoP8ViewKey, novelId?: string): Record<string, string> {
  const query: Record<string, string> = {}

  if (view === 'create') {
    query.create = '1'
  } else if (view !== 'overview') {
    query.focus = view
  }

  if (novelId) {
    query.novelId = novelId
  }

  return query
}

export function resolveVideoP8InitialView(query: Record<string, unknown>): VideoP8ViewKey {
  if (query.create === '1' || query.create === 'true') return 'create'

  const focus = Array.isArray(query.focus) ? query.focus[0] : query.focus
  if (typeof focus === 'string' && VIEW_KEY_SET.has(focus)) return focus as VideoP8ViewKey

  return 'overview'
}

export function getReferenceStatusTagType(status: VideoReferenceStatus): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'normal' || status === 'resolved') return 'success'
  if (status === 'blocking') return 'danger'
  if (status === 'warning') return 'warning'
  return 'info'
}

export function createVideoP8ProjectDraft(input: {
  existingCount: number
  novelId: string
  novelTitle: string
  chapterRangeText: string
  chapterCount: number
  createdAt: string
}): VideoP8Project {
  const nextNo = input.existingCount + 1
  const paddedNo = String(nextNo).padStart(3, '0')

  return {
    id: `video-p8-${paddedNo}`,
    title: `${input.novelTitle}：${input.chapterRangeText}`,
    typeText: '首条测试',
    novelId: input.novelId,
    novelTitle: input.novelTitle,
    novelStageText: '待视频化',
    chapterRangeText: input.chapterRangeText,
    chapterCount: input.chapterCount,
    referenceVersionText: 'VideoReference v1',
    referenceSnapshotAt: input.createdAt,
    referenceStatus: 'normal',
    referenceStatusText: '引用正常',
    referenceIssueSummary: '已保存引用快照并创建默认视频单元；P8 不生成旁白、字幕、渲染或发布产物。',
    lifecycleStatus: 'active',
    lifecycleStatusText: '进行中',
    productionStatusText: 'P8 未开始生成',
    updatedAt: input.createdAt,
    recommendedActionReason: '项目已创建，下一步查看引用快照和章节版本范围。',
  }
}

export function mapVideoSourceDtoToP8Source(source: VideoReadySourceDTO): VideoP8Source {
  return {
    id: source.novelId,
    title: source.title,
    status: source.creationStage,
    snapshot: `${source.videoReadinessSnapshotId} · ${source.chapterCount} 章 · ${source.totalWordCount} 字`,
    snapshotId: source.videoReadinessSnapshotId,
    range: source.firstVideoSuggestion.chapterIds.length > 0 ? `推荐 ${source.firstVideoSuggestion.chapterIds.length} 章` : '待选择章节',
    chapterIds: source.firstVideoSuggestion.chapterIds,
  }
}

export function mapVideoProjectDtoToP8Project(project: VideoProjectDTO): VideoP8Project {
  return {
    id: project.id,
    title: project.title,
    typeText: project.projectType === 'first_test' ? '首条测试' : '标准视频',
    novelId: project.novelId,
    novelTitle: project.novelTitle,
    novelStageText: '待视频化',
    chapterRangeText: project.chapterRangeText,
    chapterCount: project.chapterCount,
    referenceVersionText: `VideoReference ${project.currentVideoReferenceId}`,
    referenceSnapshotAt: project.updatedAt,
    referenceStatus: project.referenceStatus,
    referenceStatusText: getReferenceStatusText(project.referenceStatus),
    referenceIssueSummary: getReferenceIssueSummary(project.referenceStatus),
    lifecycleStatus: project.lifecycleStatus,
    lifecycleStatusText: getLifecycleStatusText(project.lifecycleStatus),
    productionStatusText: getProductionStatusText(project.productionStatus),
    updatedAt: project.updatedAt,
    recommendedActionReason: getRecommendedActionReason(project.referenceStatus),
  }
}

export function mapVideoReferenceDetailToChapterRows(detail: VideoReferenceDetailDTO) {
  return detail.chapters.map((chapter) => ({
    title: `第 ${chapter.chapterNo} 章 ${chapter.chapterTitle}`,
    referenceVersion: chapter.contentVersionId,
    currentVersion: chapter.contentVersionId,
    status: '一致',
    summary: chapter.summary,
  }))
}

export function getReferenceIssueActionState(
  status: VideoReferenceStatus,
  action: VideoP8IssueAction,
): { allowed: boolean; message: string } {
  if (action === 'ignore' && status === 'blocking') {
    return { allowed: false, message: 'blocking 异常不能直接忽略，请回小说处理或停止项目。' }
  }

  if (action === 'ignore') {
    return { allowed: true, message: '可记录忽略原因，P9 前仍建议重新检测。' }
  }

  if (action === 'stop') {
    return { allowed: true, message: '停止后项目只保留处理记录，后续生成入口关闭。' }
  }

  if (action === 'return_to_novel') {
    return { allowed: true, message: '回小说处理后，可在视频模块重新检测引用状态。' }
  }

  return { allowed: true, message: '可标记为已处理，并保留处理原因。' }
}

export function resolveVideoP8ReferenceIssue(
  project: VideoP8Project,
  input: { action: Exclude<VideoP8IssueAction, 'return_to_novel'>; reason: string },
): VideoP8Project {
  if (input.action === 'stop') {
    return {
      ...project,
      lifecycleStatus: 'stopped',
      lifecycleStatusText: '已停止',
      productionStatusText: '后续关闭',
      referenceStatus: 'resolved',
      referenceStatusText: '已处理',
      referenceIssueSummary: `项目已停止：${input.reason}`,
    }
  }

  return {
    ...project,
    referenceStatus: 'resolved',
    referenceStatusText: '已处理',
    referenceIssueSummary: `${input.action === 'ignore' ? '已记录忽略原因' : '异常已标记处理'}：${input.reason}`,
  }
}

export function getStepState(input: {
  step: VideoP8ViewKey
  activeView: VideoP8ViewKey
  hasCreatedProject: boolean
  hasSnapshot: boolean
  hasBlockingIssue: boolean
}): 'done' | 'active' | 'issue' | 'locked' {
  if (input.step === input.activeView) return 'active'
  if (input.step === 'issue' && input.hasBlockingIssue) return 'issue'
  if (input.step === 'source') return 'done'
  if (input.step === 'create') return input.hasCreatedProject ? 'done' : 'active'
  if (input.step === 'snapshot') return input.hasSnapshot ? 'done' : 'locked'
  if (input.step === 'generation') return 'locked'
  return 'done'
}

export function mapVideoWorkbenchDtoToView(dto: VideoWorkbenchDTO): VideoWorkbenchView {
  const artifacts = sanitizeWorkbenchArtifacts(dto.artifacts)
  const chapters = mapVideoReferenceDetailToChapterRows(dto.reference)
  return {
    videoId: dto.project.id,
    title: dto.project.title,
    novelTitle: dto.project.novelTitle,
    projectStatusText: `${getLifecycleStatusText(dto.project.lifecycleStatus)} · ${getProductionStatusText(dto.project.productionStatus)}`,
    recommendedAction: {
      label: dto.recommendedAction.label,
      reason: dto.recommendedAction.reason,
      disabled: dto.recommendedAction.disabled,
    },
    reference: {
      id: dto.reference.referenceId,
      versionText: `VideoReference v${dto.reference.versionNo}`,
      status: dto.reference.status,
      statusText: getReferenceStatusText(dto.reference.status),
      summary: dto.reference.referenceSummary,
      chapterRangeText: dto.reference.chapterRangeText,
      chapters,
    },
    defaultUnit: {
      id: dto.defaultUnit.id,
      title: dto.defaultUnit.title,
      chapterRangeText: dto.defaultUnit.chapterRangeText,
      statusText: dto.defaultUnit.status === 'reference_ready' ? '引用就绪' : dto.defaultUnit.status,
    },
    steps: dto.steps.map(mapVideoWorkbenchStepDtoToView),
    dependencyRefs: dto.dependencyRefs,
    artifacts,
    narration: mapNarrationSummary(artifacts.narration),
    tts: mapTtsSummary(artifacts.tts),
    subtitle: mapSubtitleSummary(artifacts.subtitle),
    risks: dto.risks,
    riskSummary:
      dto.risks.find((risk) => risk.level === 'blocking')?.message ??
      (dto.reference.status === 'blocking' ? '存在 blocking 引用异常，后续视频生产步骤全部锁定。' : '引用状态正常；P9e 可完成视觉方案、渲染预览、预览确认和导出记录。'),
    recentTasks: dto.recentTasks
      .map((task) => sanitizeVideoVisibleTask(task, task.taskType))
      .filter((task): task is NonNullable<typeof task> => Boolean(task)),
    operationRecords: dto.operationRecords,
  }
}

export function getVideoWorkbenchCurrentStep(view: VideoWorkbenchView): VideoWorkbenchViewStep {
  return view.steps.find((step) => step.status === 'active') ?? view.steps[0]
}

export function getVideoWorkbenchStepAction(step: VideoWorkbenchViewStep): VideoWorkbenchViewStep['action'] {
  return step.action
}

export function getVideoWorkbenchNarrationSummary(view: VideoWorkbenchView): VideoWorkbenchView['narration'] {
  return view.narration
}

function mapVideoWorkbenchStepDtoToView(step: VideoWorkbenchStepDTO): VideoWorkbenchViewStep {
  return {
    key: step.key,
    label: step.label,
    status: step.status,
    statusText: getWorkbenchStepStatusText(step.status),
    description: step.description,
    lockedReason: step.lockedReason,
    unlockPackage: step.unlockPackage,
    clickable: true,
    action: createWorkbenchStepAction(step),
  }
}

function createWorkbenchStepAction(step: VideoWorkbenchStepDTO): VideoWorkbenchViewStep['action'] {
  if (step.key === 'reference_check') {
    return {
      label: '重新检查引用',
      disabled: false,
      disabledReason: null,
    }
  }

  if (step.key === 'narration' && step.status !== 'blocked') {
    return {
      label: step.status === 'completed' ? '查看旁白版本' : '生成旁白候选',
      disabled: false,
      disabledReason: null,
    }
  }

  if (step.key === 'tts' && step.status !== 'blocked' && step.status !== 'placeholder_locked') {
    return {
      label: step.status === 'completed' ? '查看配音版本' : '生成配音候选',
      disabled: false,
      disabledReason: null,
    }
  }

  if (step.key === 'subtitle' && step.status !== 'blocked' && step.status !== 'placeholder_locked') {
    return {
      label: step.status === 'completed' ? '查看字幕版本' : '生成字幕候选',
      disabled: false,
      disabledReason: null,
    }
  }

  if (step.key === 'visual_plan' && step.status !== 'blocked' && step.status !== 'placeholder_locked') {
    return {
      label: step.status === 'completed' ? '查看视觉方案' : '配置视觉方案',
      disabled: false,
      disabledReason: null,
    }
  }

  if (step.key === 'render' && step.status !== 'blocked' && step.status !== 'placeholder_locked') {
    return {
      label: step.status === 'completed' ? '查看渲染版本' : '渲染视频预览',
      disabled: false,
      disabledReason: null,
    }
  }

  if (step.key === 'preview' && step.status !== 'blocked' && step.status !== 'placeholder_locked') {
    return {
      label: step.status === 'completed' ? '查看当前视频' : '预览并确认当前视频',
      disabled: false,
      disabledReason: null,
    }
  }

  if (step.key === 'export' && step.status !== 'blocked' && step.status !== 'placeholder_locked') {
    return {
      label: step.status === 'completed' ? '查看导出记录' : '创建导出记录',
      disabled: false,
      disabledReason: null,
    }
  }

  return {
    label: step.status === 'blocked' ? '先处理引用异常' : `查看${step.label}占位`,
    disabled: true,
    disabledReason: step.lockedReason ?? '需先完成前置步骤后才能继续。',
  }
}

function getWorkbenchStepStatusText(status: VideoWorkbenchStepDTO['status']): string {
  if (status === 'active') return '当前处理'
  if (status === 'completed') return '已完成'
  if (status === 'blocked') return '被阻塞'
  return '占位锁定'
}

function mapNarrationSummary(narrations: VideoWorkbenchDTO['artifacts']['narration']): VideoWorkbenchView['narration'] {
  const provider = narrations.current?.providerSummary ?? narrations.candidates[0]?.providerSummary ?? narrations.drafts[0]?.providerSummary
  return {
    currentLabel: narrations.current ? `当前旁白 v${narrations.current.versionNo}` : '暂无已确认旁白',
    candidateCount: narrations.candidates.length,
    draftCount: narrations.drafts.length,
    historyCount: narrations.history.length,
    providerText: provider ? `${provider.provider}${provider.isMockOutput ? ' · 模拟输出' : ''}` : '暂无生成来源',
  }
}

function mapTtsSummary(tts: VideoWorkbenchDTO['artifacts']['tts']): VideoWorkbenchView['tts'] {
  const provider = tts.current?.providerSummary ?? tts.candidates[0]?.providerSummary
  return {
    currentLabel: tts.current ? `当前配音 v${tts.current.versionNo}` : '暂无已确认配音',
    candidateCount: tts.candidates.length,
    historyCount: tts.history.length,
    providerText: provider ? `${provider.provider}${provider.isMockOutput ? ' · 模拟输出' : ''}` : '暂无生成来源',
  }
}

function mapSubtitleSummary(subtitles?: VideoWorkbenchDTO['artifacts']['subtitle']): VideoWorkbenchView['subtitle'] {
  if (!subtitles) {
    return {
      currentLabel: '暂无已确认字幕',
      candidateCount: 0,
      draftCount: 0,
      historyCount: 0,
      providerText: '暂无生成来源',
    }
  }
  const provider = subtitles.current?.providerSummary ?? subtitles.candidates[0]?.providerSummary ?? subtitles.drafts[0]?.providerSummary
  return {
    currentLabel: subtitles.current ? `当前字幕 v${subtitles.current.versionNo}` : '暂无已确认字幕',
    candidateCount: subtitles.candidates.length,
    draftCount: subtitles.drafts.length,
    historyCount: subtitles.history.length,
    providerText: provider ? `${provider.provider}${provider.isMockOutput ? ' · 模拟输出' : ''}` : '暂无生成来源',
  }
}

function sanitizeWorkbenchArtifacts(artifacts: VideoWorkbenchDTO['artifacts']): VideoWorkbenchDTO['artifacts'] {
  return {
    ...artifacts,
    narration: sanitizeNarrationList(artifacts.narration),
    tts: sanitizeTtsList(artifacts.tts),
    subtitle: sanitizeSubtitleList(artifacts.subtitle),
    visualPlan: sanitizeVisualPlanList(artifacts.visualPlan),
    renders: sanitizeRenderList(artifacts.renders),
  }
}

function sanitizeNarrationList(list: VideoNarrationListDTO): VideoNarrationListDTO {
  return {
    ...list,
    current: list.current ? sanitizeArtifact(list.current) : null,
    candidates: list.candidates.map(sanitizeArtifact),
    drafts: list.drafts.map(sanitizeArtifact),
    history: list.history.map(sanitizeArtifact),
    activeTask: list.activeTask ? sanitizeVideoVisibleTask(list.activeTask, 'video_narration_generate') as VideoNarrationListDTO['activeTask'] : null,
  }
}

function sanitizeTtsList(list: VideoTtsListDTO): VideoTtsListDTO {
  return {
    ...list,
    current: list.current ? sanitizeArtifact(list.current) : null,
    candidates: list.candidates.map(sanitizeArtifact),
    history: list.history.map(sanitizeArtifact),
    activeTask: list.activeTask ? sanitizeVideoVisibleTask(list.activeTask, 'video_tts_generate') as VideoTtsListDTO['activeTask'] : null,
  }
}

function sanitizeSubtitleList(list: VideoSubtitleListDTO): VideoSubtitleListDTO {
  return {
    ...list,
    current: list.current ? sanitizeArtifact(list.current) : null,
    candidates: list.candidates.map(sanitizeArtifact),
    drafts: list.drafts.map(sanitizeArtifact),
    history: list.history.map(sanitizeArtifact),
    activeTask: list.activeTask ? sanitizeVideoVisibleTask(list.activeTask, 'video_subtitle_generate') as VideoSubtitleListDTO['activeTask'] : null,
  }
}

function sanitizeVisualPlanList(list: VideoVisualPlanListDTO): VideoVisualPlanListDTO {
  return {
    ...list,
    current: list.current ? sanitizeArtifact(list.current) : null,
    candidates: list.candidates.map(sanitizeArtifact),
    history: list.history.map(sanitizeArtifact),
  }
}

function sanitizeRenderList(list: VideoRenderListDTO): VideoRenderListDTO {
  return {
    ...list,
    current: list.current ? { ...list.current, providerSummary: sanitizeVideoProviderSummary(list.current.providerSummary) } : null,
    candidates: list.candidates.map((render) => ({ ...render, providerSummary: sanitizeVideoProviderSummary(render.providerSummary) })),
    history: list.history.map((render) => ({ ...render, providerSummary: sanitizeVideoProviderSummary(render.providerSummary) })),
    activeTask: list.activeTask ? sanitizeVideoVisibleTask(list.activeTask, 'video_render_generate') as VideoRenderListDTO['activeTask'] : null,
  }
}

function sanitizeArtifact<T extends { providerSummary: unknown; metadata: unknown }>(artifact: T): T {
  return {
    ...artifact,
    providerSummary: sanitizeVideoProviderSummary(artifact.providerSummary),
    metadata: sanitizeVideoArtifactMetadata(artifact.metadata),
  }
}

function getReferenceStatusText(status: VideoReferenceStatus): string {
  if (status === 'normal') return '引用正常'
  if (status === 'blocking') return '阻塞异常'
  if (status === 'warning') return '需关注'
  if (status === 'info') return '有提示'
  return '已处理'
}

function getReferenceIssueSummary(status: VideoReferenceStatus): string {
  if (status === 'blocking') return '存在 blocking 引用异常，后续生成入口必须锁定。'
  if (status === 'warning') return '引用存在差异，需要确认是否影响视频承接。'
  if (status === 'info') return '引用有提示信息，可查看详情。'
  if (status === 'resolved') return '引用异常已处理，可查看处理记录。'
  return '已保存引用快照和默认视频单元；P8 不生成旁白、字幕、渲染或发布产物。'
}

function getLifecycleStatusText(status: VideoProjectDTO['lifecycleStatus']): string {
  if (status === 'stopped') return '已停止'
  if (status === 'archived') return '已归档'
  return '进行中'
}

function getProductionStatusText(status: VideoProjectDTO['productionStatus']): string {
  if (status === 'ready_for_generation') return '引用已就绪'
  if (status === 'generation_locked') return '后续生成锁定'
  return 'P8 未开始生成'
}

function getRecommendedActionReason(status: VideoReferenceStatus): string {
  if (status === 'blocking') return '先处理引用异常，不能进入后续视频生成。'
  if (status === 'warning' || status === 'info') return '查看引用差异，再决定处理方式。'
  if (status === 'resolved') return '查看异常处理记录。'
  return '引用状态正常，先查看快照确认范围。'
}
