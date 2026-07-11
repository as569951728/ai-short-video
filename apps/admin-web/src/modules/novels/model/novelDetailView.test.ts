import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { NovelCreationStage, TaskStatus, type NovelDetailDTO, type RecentTaskSummaryDTO } from '@ai-shortvideo/shared'
import {
  createLocalPendingTaskDetail,
  createLocalPendingTaskSummary,
  getTaskResultPlacement,
  getVideoReadyEntryAction,
  LONG_RUNNING_MODEL_STATUS_NOTE,
  resolveTaskSummaryForAction,
  resolveVisibleTaskSummary,
  shouldShowTrialAuthoringAction,
  shouldShowTrialCandidateAction,
  shouldShowTrialReviewConfirmAction,
} from './novelDetailView.js'
import * as novelDetailView from './novelDetailView.js'

type DetailForView = Pick<NovelDetailDTO, 'creationStage' | 'statusSummary'> & Partial<Pick<NovelDetailDTO, 'latestTrialRun' | 'bodyStrategySnapshot'>>

function createDetailForView(
  creationStage: NovelCreationStage,
  actionLabel = '去视频列表',
  overrides: Partial<DetailForView> = {},
): DetailForView {
  return {
    creationStage,
    statusSummary: {
      recommendedAction: {
        type: actionLabel === '去视频列表' ? 'go_video_list' : 'view_detail',
        label: actionLabel,
        reasonText: '小说已进入待视频化，可去视频模块查看承接。',
        target: 'detail',
        disabled: false,
        disabledReason: null,
        confirmRequired: false,
        taskType: null,
      },
    },
    ...overrides,
  } as DetailForView
}

describe('novel detail view model', () => {
  it('hides historical trial actions when the novel is video ready', () => {
    const detail = createDetailForView(NovelCreationStage.VideoReady)

    assert.equal(shouldShowTrialCandidateAction(detail, true), false)
    assert.equal(shouldShowTrialReviewConfirmAction(detail), false)
    assert.equal(shouldShowTrialAuthoringAction(detail), false)
  })

  it('keeps trial actions available before the video-ready state', () => {
    const detail = createDetailForView(NovelCreationStage.Trial, '确认试写并生成策略快照', {
      statusSummary: {
        recommendedAction: {
          type: 'confirm_trial_review',
          label: '确认试写并生成策略快照',
          reasonText: '前三章试写总评已生成，请确认试写并生成策略快照。',
          target: 'detail',
          disabled: false,
          disabledReason: null,
          confirmRequired: true,
          taskType: 'trial_confirm',
        },
      },
      latestTrialRun: {
        status: 'review_ready',
      } as DetailForView['latestTrialRun'],
    })

    assert.equal(shouldShowTrialCandidateAction(detail, true), true)
    assert.equal(shouldShowTrialCandidateAction(detail, false), false)
    assert.equal(shouldShowTrialReviewConfirmAction(detail), true)
    assert.equal(shouldShowTrialAuthoringAction(detail), true)
  })

  it('hides the trial confirmation action after the body strategy snapshot exists', () => {
    const detail = createDetailForView(NovelCreationStage.Body, '开始本批生成', {
      statusSummary: {
        recommendedAction: {
          type: 'start_body_batch',
          label: '开始本批生成',
          reasonText: '试写已确认并生成正文策略快照；下一步按默认 5 章一批生成正文。',
          target: 'detail',
          disabled: false,
          disabledReason: null,
          confirmRequired: true,
          taskType: 'body_batch_generate',
        },
      },
      latestTrialRun: {
        status: 'confirmed',
      } as DetailForView['latestTrialRun'],
      bodyStrategySnapshot: {
        id: 'strategy-001',
      } as DetailForView['bodyStrategySnapshot'],
    })

    assert.equal(shouldShowTrialReviewConfirmAction(detail), false)
  })

  it('returns a video list entry for the video-ready recommended action', () => {
    const detail = createDetailForView(NovelCreationStage.VideoReady)

    assert.deepEqual(getVideoReadyEntryAction(detail), {
      label: '去视频列表',
      route: '/videos',
    })
  })

  it('creates a visible pending model-generation task while the request is still waiting', () => {
    const task = createLocalPendingTaskSummary({
      taskType: 'novel_direction_generate',
      label: '生成方向',
      action: 'direction_generate',
      startedAt: '2026-06-19T10:00:00.000Z',
    })

    assert.equal(task.status, TaskStatus.Processing)
    assert.equal(task.statusText, '生成中')
    assert.equal(task.action, 'direction_generate')
    assert.match(task.id, /^pending-novel_direction_generate-/)
    assert.equal(task.startedAt, '2026-06-19T10:00:00.000Z')
    assert.equal(task.progress, 0)
    assert.match(task.currentStep ?? '', /正在调用模型生成内容/)
    assert.equal(task.statusNote, LONG_RUNNING_MODEL_STATUS_NOTE)
  })

  it('prefers the local pending task over stale backend recent tasks during a long request', () => {
    const pending = createLocalPendingTaskSummary({
      taskType: 'novel_direction_generate',
      label: '生成方向',
      action: 'direction_generate',
      startedAt: '2026-06-19T10:00:00.000Z',
    })
    const backendTask: RecentTaskSummaryDTO = {
      id: 'task-old',
      taskType: 'novel_trial_chapter_one',
      status: TaskStatus.Completed,
      statusText: '已完成',
      progress: 100,
      currentStep: '历史任务',
    }

    const visible = resolveVisibleTaskSummary(pending, { recentTask: backendTask, recentTasks: [backendTask] })

    assert.equal(visible?.id, pending.id)
    assert.equal(visible?.status, TaskStatus.Processing)
  })

  it('prefers an active backend task over the local pending placeholder after refresh', () => {
    const pending = createLocalPendingTaskSummary({
      taskType: 'novel_setting_generate',
      label: '生成设定',
      action: 'setting_generate',
      startedAt: '2026-06-19T10:00:00.000Z',
    })
    const backendTask: RecentTaskSummaryDTO = {
      id: 'task-real',
      taskType: 'novel_setting_generate',
      status: TaskStatus.Processing,
      statusText: '正在处理',
      progress: 0,
      currentStep: '设定正在生成中',
    }

    const visible = resolveVisibleTaskSummary(pending, { recentTask: backendTask, recentTasks: [backendTask] })

    assert.equal(visible?.id, backendTask.id)
    assert.equal(visible?.status, TaskStatus.Processing)
  })

  it('prefers a completed backend task over the local pending placeholder when it is newer', () => {
    const pending = createLocalPendingTaskSummary({
      taskType: 'novel_setting_generate',
      label: '生成设定',
      action: 'setting_generate',
      startedAt: '2026-06-19T10:00:00.000Z',
    })
    const backendTask: RecentTaskSummaryDTO = {
      id: 'task-real',
      taskType: 'novel_setting_generate',
      status: TaskStatus.WaitingConfirmation,
      statusText: '有新结果待确认',
      progress: 100,
      currentStep: '设定候选已生成',
      createdAt: '2026-06-19T10:00:01.000Z',
      updatedAt: '2026-06-19T10:01:00.000Z',
    }

    const visible = resolveVisibleTaskSummary(pending, { recentTask: backendTask, recentTasks: [backendTask] })

    assert.equal(visible?.id, backendTask.id)
    assert.equal(visible?.status, TaskStatus.WaitingConfirmation)
  })

  it('prefers a terminal backend task over a local pending placeholder with an equivalent task family', () => {
    const pending = createLocalPendingTaskSummary({
      taskType: 'novel_chapter_plan_generate',
      label: '生成章节目录',
      action: 'chapter_plan_generate',
      startedAt: '2026-06-19T10:00:00.000Z',
    })
    const backendTask: RecentTaskSummaryDTO = {
      id: 'task-real',
      taskType: 'chapter_plan_generate',
      status: TaskStatus.Failed,
      statusText: '失败',
      progress: 0,
      currentStep: '生成失败',
      errorMessage: '模型输出不是合法 JSON：novel_structure_chapter_plan',
      updatedAt: '2026-06-19T10:01:00.000Z',
    }

    const visible = resolveVisibleTaskSummary(pending, { recentTask: backendTask, recentTasks: [backendTask] })

    assert.equal(visible?.id, backendTask.id)
    assert.equal(visible?.status, TaskStatus.Failed)
  })

  it('finds the failed chapter-plan task even when the global recent task is unrelated', () => {
    const pending = createLocalPendingTaskSummary({
      taskType: 'novel_chapter_plan_generate',
      label: '生成章节目录',
      action: 'chapter_plan_generate',
      startedAt: '2026-06-19T10:00:00.000Z',
    })
    const unrelatedTask: RecentTaskSummaryDTO = {
      id: 'task-adopt',
      taskType: 'adopt_stage_outline',
      status: TaskStatus.Completed,
      statusText: '已完成',
      progress: 100,
      currentStep: '阶段大纲已采用',
      updatedAt: '2026-06-19T10:00:02.000Z',
    }
    const failedTask: RecentTaskSummaryDTO = {
      id: 'task-real',
      taskType: 'chapter_plan_generate',
      status: TaskStatus.Failed,
      statusText: '失败',
      progress: 0,
      currentStep: '模型输出不是合法 JSON：novel_structure_chapter_plan',
      updatedAt: '2026-06-19T10:01:00.000Z',
    }

    const visible = resolveTaskSummaryForAction(pending, { recentTask: unrelatedTask, recentTasks: [unrelatedTask, failedTask] }, 'chapter_plan_generate')

    assert.equal(visible?.id, failedTask.id)
    assert.equal(visible?.status, TaskStatus.Failed)
  })

  it('builds a local pending task detail with a safe recovery hint and no provider payload', () => {
    const pending = createLocalPendingTaskSummary({
      taskType: 'novel_direction_generate',
      label: '生成方向',
      action: 'direction_generate',
      startedAt: '2026-06-19T10:00:00.000Z',
    })

    const detail = createLocalPendingTaskDetail({
      novelId: 'novel-1',
      task: pending,
      now: '2026-06-19T10:00:05.000Z',
    })

    assert.equal(detail.status, TaskStatus.Processing)
    assert.equal(detail.events[0].eventType, 'calling_model')
    assert.match(detail.nextAction.reasonText, /稍后刷新/)
    assert.doesNotMatch(JSON.stringify(detail), /api[_-]?key|完整提示词|完整模型响应/i)
  })

  it('exposes eight stable routable workbench step keys', () => {
    assert.deepEqual(novelDetailView.NOVEL_WORKBENCH_STEP_KEYS, [
      'direction',
      'setting',
      'outline',
      'chapterPlan',
      'trial',
      'body',
      'fullReview',
      'videoReady',
    ])
  })

  it('resolves overview and step query state for refreshable workbench URLs', () => {
    assert.deepEqual(novelDetailView.resolveNovelWorkbenchLocation(undefined), {
      mode: 'overview',
      stepKey: 'direction',
    })
    assert.deepEqual(novelDetailView.resolveNovelWorkbenchLocation('trial'), {
      mode: 'step',
      stepKey: 'trial',
    })
    assert.deepEqual(novelDetailView.resolveNovelWorkbenchLocation(['body']), {
      mode: 'step',
      stepKey: 'body',
    })
    assert.deepEqual(novelDetailView.resolveNovelWorkbenchLocation('unknown-step'), {
      mode: 'overview',
      stepKey: 'direction',
    })
  })

  it('maps every long-running novel action to a visible pending task summary', () => {
    const actions = [
      ['direction_generate', 'novel_direction_generate', '生成方向'],
      ['direction_fuse', 'novel_direction_fuse', '融合方向'],
      ['direction_optimize', 'novel_direction_optimize', '优化方向'],
      ['setting_generate', 'novel_setting_generate', '生成设定'],
      ['outline_generate', 'novel_outline_generate', '生成全书大纲'],
      ['stage_outline_generate', 'novel_stage_outline_generate', '生成阶段大纲'],
      ['chapter_plan_generate', 'novel_chapter_plan_generate', '生成章节目录'],
      ['trial_generate', 'novel_trial_generate', '生成试写'],
      ['trial_followup_generate', 'novel_trial_followup', '继续试写'],
      ['body_batch_generate', 'body_batch_generate', '批量正文'],
      ['full_review', 'novel_full_review', '全书审稿'],
      ['video_readiness_recheck', 'video_readiness_check', '待视频化检查'],
    ] as const

    for (const [action, taskType, label] of actions) {
      const pending = novelDetailView.createNovelActionPendingTask(action, '2026-06-19T10:00:00.000Z')

      assert.equal(pending.taskType, taskType)
      assert.match(pending.currentStep ?? '', new RegExp(label))
      assert.equal(pending.status, TaskStatus.Processing)
    }
  })

  it('explains why locked workbench step actions are unavailable', () => {
    assert.equal(novelDetailView.getWorkbenchStepLockedReason('setting'), '需先采用正式方向后可生成设定。')
    assert.equal(novelDetailView.getWorkbenchStepLockedReason('outline'), '需先采用小说设定后可生成全书大纲。')
    assert.equal(novelDetailView.getWorkbenchStepLockedReason('trial'), '需先采用章节目录后可生成试写。')
    assert.equal(novelDetailView.getWorkbenchStepLockedReason('body'), '需先确认试写总评并生成策略快照后可批量正文。')
  })

  it('treats locked sub steps as non-interactive but keeps active steps clickable', () => {
    assert.equal(novelDetailView.canInteractWithSubStep('locked'), false)
    assert.equal(novelDetailView.canInteractWithSubStep('active'), true)
    assert.equal(novelDetailView.canInteractWithSubStep('done'), true)
  })

  it('maps completed generation tasks to the step where users can inspect the result', () => {
    const baseTask: RecentTaskSummaryDTO = {
      id: 'task-1',
      taskType: 'novel_direction_fuse',
      status: TaskStatus.Completed,
      statusText: '已完成',
      progress: 100,
      currentStep: '融合方向候选已生成，等待选择',
    }

    assert.deepEqual(getTaskResultPlacement(baseTask), {
      summary: '新方向候选已进入候选池，请查看后决定是否采用。',
      actionLabel: '查看方向候选',
      stepKey: 'direction',
    })
    assert.equal(getTaskResultPlacement({ ...baseTask, taskType: 'novel_setting_generate' })?.stepKey, 'setting')
    assert.equal(getTaskResultPlacement({ ...baseTask, taskType: 'chapter_plan_generate' })?.stepKey, 'chapterPlan')
    assert.equal(getTaskResultPlacement({ ...baseTask, taskType: 'trial_writing_generate' })?.stepKey, 'trial')
    assert.equal(getTaskResultPlacement({ ...baseTask, taskType: 'body_batch_generate' })?.stepKey, 'body')
    assert.equal(getTaskResultPlacement({ ...baseTask, taskType: 'novel_full_review' })?.stepKey, 'fullReview')
    assert.equal(getTaskResultPlacement({ ...baseTask, taskType: 'video_readiness_check' })?.stepKey, 'videoReady')
  })

  it('maps adopted structure assets to the next concrete authoring step', () => {
    const completedTask: RecentTaskSummaryDTO = {
      id: 'task-adopt-1',
      taskType: 'adopt_outline',
      status: TaskStatus.Completed,
      statusText: '已完成',
      progress: 100,
      currentStep: '全书大纲已采用',
    }

    assert.deepEqual(getTaskResultPlacement(completedTask), {
      summary: '全书大纲已采用，下一步需要生成并采用阶段大纲。',
      actionLabel: '生成阶段大纲',
      stepKey: 'outline',
    })
    assert.deepEqual(getTaskResultPlacement({ ...completedTask, taskType: 'adopt_stage_outline' }), {
      summary: '阶段大纲已采用，下一步可生成章节目录。',
      actionLabel: '进入章节目录',
      stepKey: 'chapterPlan',
    })
    assert.deepEqual(getTaskResultPlacement({ ...completedTask, taskType: 'adopt_chapter_plan' }), {
      summary: '章节目录已采用，下一步可进入试写调试。',
      actionLabel: '进入试写',
      stepKey: 'trial',
    })
  })

  it('does not show a result placement while a task is still processing', () => {
    assert.equal(
      getTaskResultPlacement({
        id: 'task-processing',
        taskType: 'novel_direction_generate',
        status: TaskStatus.Processing,
        statusText: '生成中',
        progress: 0,
        currentStep: '调用模型中',
      }),
      null,
    )
  })

  it('ignores completed tasks without a known task type', () => {
    assert.equal(getTaskResultPlacement({ taskType: null, status: TaskStatus.Completed }), null)
  })

  it('keeps the direction draft sub-step active before candidates exist', () => {
    assert.equal(novelDetailView.getDirectionDraftSubStepState({ hasDirection: false, hasCandidates: false }), 'active')
    assert.equal(novelDetailView.getDirectionDraftSubStepState({ hasDirection: false, hasCandidates: true }), 'done')
    assert.equal(novelDetailView.getDirectionDraftSubStepState({ hasDirection: true, hasCandidates: false }), 'done')
  })
})
