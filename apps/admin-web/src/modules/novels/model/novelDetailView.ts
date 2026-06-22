import { NovelCreationStage, TaskStatus, type NovelDetailDTO, type RecentTaskSummaryDTO, type TaskDetailDTO } from '@ai-shortvideo/shared'

type DetailState = Pick<NovelDetailDTO, 'creationStage' | 'statusSummary'>

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

export interface LocalPendingTaskSummary extends RecentTaskSummaryDTO {
  isLocalPending: true
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
  return !isVideoReadyDetail(detail)
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
  startedAt?: string
}): LocalPendingTaskSummary {
  const startedAt = input.startedAt ?? new Date().toISOString()

  return {
    id: `pending-${input.taskType}-${Date.parse(startedAt) || Date.now()}`,
    taskType: input.taskType,
    status: TaskStatus.Processing,
    statusText: '生成中',
    progress: 12,
    currentStep: `${input.label}：${LONG_RUNNING_MODEL_STATUS_NOTE}`,
    isLocalPending: true,
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

export function getDirectionDraftSubStepState(input: { hasDirection: boolean; hasCandidates: boolean }): NovelWorkbenchStepState {
  if (input.hasDirection || input.hasCandidates) return 'done'
  return 'active'
}

export function resolveVisibleTaskSummary(
  pendingTask: RecentTaskSummaryDTO | null | undefined,
  detail: Pick<NovelDetailDTO, 'recentTask' | 'recentTasks'> | null | undefined,
): RecentTaskSummaryDTO | null {
  return pendingTask ?? detail?.recentTask ?? detail?.recentTasks?.[0] ?? null
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
