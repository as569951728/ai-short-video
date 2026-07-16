import { NovelCreationStage, TaskStatus, type NovelDetailDTO, type RecentTaskSummaryDTO, type TaskDetailDTO } from '@ai-shortvideo/shared'

type DetailState = Pick<NovelDetailDTO, 'creationStage' | 'statusSummary'> & Partial<Pick<NovelDetailDTO, 'latestTrialRun' | 'bodyStrategySnapshot'>>

export const NOVEL_WORKBENCH_STEP_KEYS = [
  'direction',
  'setting',
  'outline',
  'chapterPlan',
  'trial',
  'body',
  'fullReview',
  'videoReady',
] as const

export type NovelWorkbenchStepKey = (typeof NOVEL_WORKBENCH_STEP_KEYS)[number]
export type NovelWorkbenchMode = 'overview' | 'step'
export type NovelWorkbenchStepState = 'done' | 'active' | 'ready' | 'locked' | 'issue'
export type NovelLongRunningAction =
  | 'direction_generate'
  | 'direction_fuse'
  | 'direction_optimize'
  | 'setting_generate'
  | 'outline_generate'
  | 'stage_outline_generate'
  | 'chapter_plan_generate'
  | 'trial_generate'
  | 'trial_followup_generate'
  | 'body_batch_generate'
  | 'full_review'
  | 'video_readiness_recheck'
  | 'video_readiness_confirm'

export interface NovelWorkbenchLocation {
  mode: NovelWorkbenchMode
  stepKey: NovelWorkbenchStepKey
}

export interface VideoReadyEntryAction {
  label: '去视频列表'
  route: '/videos'
}

export interface TaskResultPlacement {
  summary: string
  actionLabel: string
  stepKey: NovelWorkbenchStepKey
}

export interface LocalPendingTaskSummary extends RecentTaskSummaryDTO {
  isLocalPending: true
  action: NovelLongRunningAction
  startedAt: string
  statusNote: string
}

export const LONG_RUNNING_MODEL_STATUS_NOTE = '正在调用模型生成内容，可能需要 1-3 分钟，可以稍后回来查看。'

const PENDING_ACTION_META: Record<NovelLongRunningAction, { taskType: string; label: string }> = {
  direction_generate: { taskType: 'novel_direction_generate', label: '生成方向' },
  direction_fuse: { taskType: 'novel_direction_fuse', label: '融合方向' },
  direction_optimize: { taskType: 'novel_direction_optimize', label: '优化方向' },
  setting_generate: { taskType: 'novel_setting_generate', label: '生成设定' },
  outline_generate: { taskType: 'novel_outline_generate', label: '生成全书大纲' },
  stage_outline_generate: { taskType: 'novel_stage_outline_generate', label: '生成阶段大纲' },
  chapter_plan_generate: { taskType: 'novel_chapter_plan_generate', label: '生成章节目录' },
  trial_generate: { taskType: 'novel_trial_generate', label: '生成试写' },
  trial_followup_generate: { taskType: 'novel_trial_followup', label: '继续试写' },
  body_batch_generate: { taskType: 'body_batch_generate', label: '批量正文' },
  full_review: { taskType: 'novel_full_review', label: '全书审稿' },
  video_readiness_recheck: { taskType: 'video_readiness_check', label: '待视频化检查' },
  video_readiness_confirm: { taskType: 'video_readiness_confirm', label: '待视频化确认' },
}

export function isVideoReadyDetail(detail: DetailState | null | undefined): boolean {
  return (
    detail?.creationStage === NovelCreationStage.VideoReady ||
    detail?.statusSummary.recommendedAction.type === 'go_video_list' ||
    detail?.statusSummary.recommendedAction.label === '去视频列表'
  )
}

export function shouldShowTrialCandidateAction(detail: DetailState | null | undefined, canSelect: boolean): boolean {
  return canSelect && !isVideoReadyDetail(detail)
}

export function shouldShowTrialAuthoringAction(detail: DetailState | null | undefined): boolean {
  return !isVideoReadyDetail(detail)
}

export function shouldShowTrialReviewConfirmAction(detail: DetailState | null | undefined): boolean {
  if (!detail || isVideoReadyDetail(detail)) return false

  return (
    detail.statusSummary.recommendedAction.type === 'confirm_trial_review' &&
    detail.latestTrialRun?.status === 'review_ready' &&
    !detail.bodyStrategySnapshot
  )
}

export function getVideoReadyEntryAction(detail: DetailState | null | undefined): VideoReadyEntryAction | null {
  if (!isVideoReadyDetail(detail)) return null

  return {
    label: '去视频列表',
    route: '/videos',
  }
}

export function createLocalPendingTaskSummary(input: {
  taskType: string
  label: string
  action: NovelLongRunningAction
  startedAt?: string
}): LocalPendingTaskSummary {
  const startedAt = input.startedAt ?? new Date().toISOString()

  return {
    id: `pending-${input.taskType}-${Date.parse(startedAt) || Date.now()}`,
    taskType: input.taskType,
    status: TaskStatus.Processing,
    statusText: '生成中',
    progress: 0,
    currentStep: `${input.label}：${LONG_RUNNING_MODEL_STATUS_NOTE}`,
    isLocalPending: true,
    action: input.action,
    startedAt,
    statusNote: LONG_RUNNING_MODEL_STATUS_NOTE,
  }
}

export function isNovelWorkbenchStepKey(value: unknown): value is NovelWorkbenchStepKey {
  return typeof value === 'string' && (NOVEL_WORKBENCH_STEP_KEYS as readonly string[]).includes(value)
}

export function resolveNovelWorkbenchLocation(queryStep: unknown): NovelWorkbenchLocation {
  const rawStep = Array.isArray(queryStep) ? queryStep[0] : queryStep
  if (!isNovelWorkbenchStepKey(rawStep)) {
    return {
      mode: 'overview',
      stepKey: 'direction',
    }
  }

  return {
    mode: 'step',
    stepKey: rawStep,
  }
}

export function createNovelActionPendingTask(action: NovelLongRunningAction, startedAt?: string): LocalPendingTaskSummary {
  const meta = PENDING_ACTION_META[action]
  return createLocalPendingTaskSummary({
    taskType: meta.taskType,
    label: meta.label,
    action,
    startedAt,
  })
}

export function getWorkbenchStepLockedReason(stepKey: NovelWorkbenchStepKey): string {
  const reasons: Record<NovelWorkbenchStepKey, string> = {
    direction: '当前可以生成方向候选。',
    setting: '需先采用正式方向后可生成设定。',
    outline: '需先采用小说设定后可生成全书大纲。',
    chapterPlan: '需先采用阶段大纲后可生成章节目录。',
    trial: '需先采用章节目录后可生成试写。',
    body: '需先确认试写总评并生成策略快照后可批量正文。',
    fullReview: '需先完成全部正文且无阻塞问题后可发起全书审稿。',
    videoReady: '需先确认小说完成并通过待视频化检查后可进入待视频化。',
  }

  return reasons[stepKey]
}

export function canInteractWithSubStep(state: NovelWorkbenchStepState): boolean {
  return state !== 'locked'
}

export function getTaskResultPlacement(task: (Pick<RecentTaskSummaryDTO, 'status'> & { taskType?: string | null }) | null | undefined): TaskResultPlacement | null {
  if (!task) return null
  if (task.status !== TaskStatus.Completed && task.status !== TaskStatus.WaitingConfirmation) return null

  const taskType = task.taskType ?? ''
  if (taskType.includes('direction')) {
    return {
      summary: taskType.includes('adopt') ? '正式方向已采用，下一步可生成小说设定。' : '新方向候选已进入候选池，请查看后决定是否采用。',
      actionLabel: taskType.includes('adopt') ? '进入设定' : '查看方向候选',
      stepKey: taskType.includes('adopt') ? 'setting' : 'direction',
    }
  }

  if (taskType.includes('setting')) {
    return {
      summary: taskType.includes('adopt') ? '正式设定已采用，下一步可生成全书大纲。' : '新设定候选已进入候选池，请查看后决定是否采用。',
      actionLabel: taskType.includes('adopt') ? '进入大纲' : '查看设定候选',
      stepKey: taskType.includes('adopt') ? 'outline' : 'setting',
    }
  }

  if (taskType.includes('adopt_stage_outline')) {
    return {
      summary: '阶段大纲已采用，下一步可生成章节目录。',
      actionLabel: '进入章节目录',
      stepKey: 'chapterPlan',
    }
  }

  if (taskType.includes('adopt_outline')) {
    return {
      summary: '全书大纲已采用，下一步需要生成并采用阶段大纲。',
      actionLabel: '生成阶段大纲',
      stepKey: 'outline',
    }
  }

  if (taskType.includes('outline') || taskType.includes('stage_outline')) {
    return {
      summary: '新大纲候选已进入候选池，请查看后决定是否采用。',
      actionLabel: '查看大纲候选',
      stepKey: 'outline',
    }
  }

  if (taskType.includes('chapter_plan') || taskType.includes('chapterPlan')) {
    return {
      summary: taskType.includes('adopt') ? '章节目录已采用，下一步可进入试写调试。' : '新章节目录候选已进入候选池，请查看后决定是否采用。',
      actionLabel: taskType.includes('adopt') ? '进入试写' : '查看章节目录',
      stepKey: taskType.includes('adopt') ? 'trial' : 'chapterPlan',
    }
  }

  if (taskType.includes('trial')) {
    return {
      summary: '试写结果已生成，请查看章节候选和试写总评。',
      actionLabel: '查看试写结果',
      stepKey: 'trial',
    }
  }

  if (taskType.includes('body_batch')) {
    return {
      summary: '正文批次已生成，请查看章节表、失败章节和批次确认状态。',
      actionLabel: '查看正文批次',
      stepKey: 'body',
    }
  }

  if (taskType.includes('full_review')) {
    return {
      summary: '全书质检结果已生成，请查看总评、Top 问题和处理建议。',
      actionLabel: '查看全书质检',
      stepKey: 'fullReview',
    }
  }

  if (taskType.includes('video_readiness')) {
    return {
      summary: '待视频化检查结果已生成，请查看检查清单和首条视频建议。',
      actionLabel: '查看待视频化',
      stepKey: 'videoReady',
    }
  }

  return null
}

export function getDirectionDraftSubStepState(input: { hasDirection: boolean; hasCandidates: boolean }): NovelWorkbenchStepState {
  if (input.hasDirection || input.hasCandidates) return 'done'
  return 'active'
}

export function resolveVisibleTaskSummary(
  pendingTask: RecentTaskSummaryDTO | null | undefined,
  detail: Pick<NovelDetailDTO, 'recentTask' | 'recentTasks'> | null | undefined,
): RecentTaskSummaryDTO | null {
  const backendTask = detail?.recentTask ?? detail?.recentTasks?.[0] ?? null
  if (shouldPreferBackendTask(pendingTask, backendTask)) return backendTask
  return pendingTask ?? backendTask
}

export function resolveTaskSummaryForAction(
  pendingTask: RecentTaskSummaryDTO | null | undefined,
  detail: Pick<NovelDetailDTO, 'recentTask' | 'recentTasks'> | null | undefined,
  action: NovelLongRunningAction,
): RecentTaskSummaryDTO | null {
  const pendingForAction = isTaskForNovelAction(pendingTask, action) ? pendingTask : null
  const backendTask = findBackendTaskForAction(detail, action)
  if (shouldPreferBackendTaskForAction(pendingForAction, backendTask)) return backendTask
  return pendingForAction ?? backendTask
}

function shouldPreferBackendTask(pendingTask: RecentTaskSummaryDTO | null | undefined, backendTask: RecentTaskSummaryDTO | null | undefined) {
  if (!backendTask) return false
  if (isActiveBackendTask(backendTask)) return true
  if (!pendingTask) return true
  if (!isSameTaskFamily(backendTask.taskType, pendingTask.taskType)) return false

  const pendingStartedAt = Date.parse((pendingTask as { startedAt?: string }).startedAt ?? '')
  const backendUpdatedAt = Date.parse(backendTask.updatedAt ?? backendTask.createdAt ?? '')
  return Number.isFinite(pendingStartedAt) && Number.isFinite(backendUpdatedAt) && backendUpdatedAt >= pendingStartedAt
}

function shouldPreferBackendTaskForAction(pendingTask: RecentTaskSummaryDTO | null | undefined, backendTask: RecentTaskSummaryDTO | null | undefined) {
  if (!backendTask) return false
  if (isActiveBackendTask(backendTask)) return true
  if (!pendingTask) return true

  const pendingStartedAt = Date.parse((pendingTask as { startedAt?: string }).startedAt ?? '')
  const backendUpdatedAt = Date.parse(backendTask.updatedAt ?? backendTask.createdAt ?? '')
  return Number.isFinite(pendingStartedAt) && Number.isFinite(backendUpdatedAt) && backendUpdatedAt >= pendingStartedAt
}

function isActiveBackendTask(task: RecentTaskSummaryDTO | null | undefined) {
  return task?.status === TaskStatus.Queued || task?.status === TaskStatus.Processing
}

function isSameTaskFamily(left: string | null | undefined, right: string | null | undefined) {
  const leftType = normalizeTaskType(left)
  const rightType = normalizeTaskType(right)
  if (!leftType || !rightType) return false
  if (leftType === rightType) return true

  const leftFamily = getTaskFamily(leftType)
  const rightFamily = getTaskFamily(rightType)
  return Boolean(leftFamily && leftFamily === rightFamily)
}

function normalizeTaskType(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/^novel_/, '')
}

function getTaskFamily(taskType: string) {
  if (taskType.includes('chapter_plan')) return 'chapter_plan'
  if (taskType.includes('stage_outline')) return 'stage_outline'
  if (taskType.includes('direction_fuse')) return 'direction_fuse'
  if (taskType.includes('direction_optimize')) return 'direction_optimize'
  if (taskType.includes('direction') && taskType.includes('generate')) return 'direction_generate'
  if (taskType.includes('setting')) return 'setting'
  if (taskType.includes('outline') && !taskType.includes('stage_outline')) return 'outline'
  if (taskType.includes('trial_followup')) return 'trial_followup'
  if (taskType.includes('trial')) return 'trial'
  if (taskType.includes('body_batch')) return 'body_batch'
  if (taskType.includes('full_review')) return 'full_review'
  if (taskType.includes('video_readiness')) return 'video_readiness'
  return ''
}

function findBackendTaskForAction(
  detail: Pick<NovelDetailDTO, 'recentTask' | 'recentTasks'> | null | undefined,
  action: NovelLongRunningAction,
) {
  const tasks = [detail?.recentTask, ...(detail?.recentTasks ?? [])].filter(Boolean) as RecentTaskSummaryDTO[]
  const seen = new Set<string>()
  return tasks.find((task) => {
    if (seen.has(task.id)) return false
    seen.add(task.id)
    return isTaskForNovelAction(task, action)
  }) ?? null
}

function isTaskForNovelAction(task: RecentTaskSummaryDTO | null | undefined, action: NovelLongRunningAction) {
  const taskType = task?.taskType ?? ''
  if (!taskType) return false
  const normalized = taskType.toLowerCase()
  const isGeneration = normalized.includes('generate')
  const isAdoptOrEdit = normalized.includes('adopt') || normalized.includes('edit') || normalized.includes('discard')

  if (action === 'chapter_plan_generate') return normalized.includes('chapter_plan') && isGeneration && !isAdoptOrEdit
  if (action === 'stage_outline_generate') return normalized.includes('stage_outline') && isGeneration && !isAdoptOrEdit
  if (action === 'outline_generate') return normalized.includes('outline') && !normalized.includes('stage_outline') && isGeneration && !isAdoptOrEdit
  if (action === 'setting_generate') return normalized.includes('setting') && isGeneration && !isAdoptOrEdit
  if (action === 'direction_generate') return normalized.includes('direction') && isGeneration && !normalized.includes('fuse') && !normalized.includes('optimize') && !isAdoptOrEdit
  if (action === 'direction_fuse') return normalized.includes('direction') && normalized.includes('fuse')
  if (action === 'direction_optimize') return normalized.includes('direction') && normalized.includes('optimize')
  if (action === 'trial_generate') return normalized.includes('trial') && isGeneration
  if (action === 'trial_followup_generate') return normalized.includes('trial_followup')
  if (action === 'body_batch_generate') return normalized.includes('body_batch')
  if (action === 'full_review') return normalized.includes('full_review')
  if (action === 'video_readiness_recheck') return normalized.includes('video_readiness') && normalized.includes('check')
  if (action === 'video_readiness_confirm') return normalized.includes('video_readiness') && normalized.includes('confirm')
  return false
}

export function createLocalPendingTaskDetail(input: {
  novelId: string
  task: LocalPendingTaskSummary
  now?: string
}): TaskDetailDTO {
  const now = input.now ?? new Date().toISOString()

  return {
    ...input.task,
    novelId: input.novelId,
    objectType: 'novel',
    objectId: input.novelId,
    statusNote: input.task.statusNote,
    sourceVersionRefs: null,
    conflictScope: null,
    conflictKey: null,
    resultVersionIds: [],
    retryOfTaskId: null,
    failureCategory: null,
    failureCategoryText: null,
    errorCode: null,
    errorMessage: null,
    userFailureReason: null,
    retryable: false,
    cancellable: false,
    cancelReason: '请求已发送到模型服务，本地取消不能保证中止模型调用；请等待返回或刷新查看结果。',
    trace: {
      taskId: input.task.id,
      requestId: null,
      retryOfTaskId: null,
    },
    nextAction: {
      type: 'wait_for_generation',
      label: '稍后刷新',
      reasonText: '模型仍在生成中，可以稍后刷新或返回列表后再查看。',
      target: 'detail',
      disabled: false,
      disabledReason: null,
      confirmRequired: false,
      taskType: input.task.taskType,
    },
    createdAt: input.task.startedAt,
    updatedAt: now,
    events: [
      {
        id: `${input.task.id}-calling-model`,
        taskId: input.task.id,
        status: TaskStatus.Processing,
        statusText: '生成中',
        eventType: 'calling_model',
        eventTypeText: '调用模型',
        message: LONG_RUNNING_MODEL_STATUS_NOTE,
        progress: input.task.progress,
        requestId: null,
        createdAt: input.task.startedAt,
      },
    ],
  }
}
