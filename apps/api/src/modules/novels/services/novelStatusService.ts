import {
  NovelCreationStage,
  NovelLifecycleStatus,
  StageStatus,
  type NovelStatusSummaryDTO,
  type RecommendedActionDTO
} from '@ai-shortvideo/shared';
import type { NovelRecord } from '../domain/novelDomain.js';

const CALCULATION_VERSION = 'novel-status-v1';

export class NovelStatusService {
  constructor(private readonly now: () => Date = () => new Date()) {}

  calculate(
    novel: Pick<
      NovelRecord,
      | 'lifecycleStatus'
      | 'creationStage'
      | 'stageStatus'
      | 'currentOutlineVersionId'
      | 'currentStageOutlineVersionId'
    >
  ): NovelStatusSummaryDTO {
    const lifecycleBlock = this.getLifecycleBlock(novel.lifecycleStatus);
    const stageInfo = this.getStageInfo(novel);

    return {
      lifecycleStatus: novel.lifecycleStatus,
      creationStage: novel.creationStage,
      stageStatus: novel.stageStatus,
      displayStatus: lifecycleBlock?.displayStatus ?? stageInfo.displayStatus,
      displayStatusText: lifecycleBlock?.displayStatusText ?? stageInfo.displayStatusText,
      currentStep: lifecycleBlock?.currentStep ?? stageInfo.currentStep,
      completedSteps: stageInfo.completedSteps,
      blockingReasons: lifecycleBlock?.blockingReasons ?? stageInfo.blockingReasons,
      recommendedAction: lifecycleBlock?.recommendedAction ?? stageInfo.recommendedAction,
      videoPreparationStatus: novel.creationStage === NovelCreationStage.VideoReady ? 'ready' : 'not_ready',
      videoReferenceStatus: 'not_referenced',
      calculatedAt: this.now().toISOString(),
      calculationVersion: CALCULATION_VERSION
    };
  }

  private getLifecycleBlock(lifecycleStatus: NovelLifecycleStatus) {
    if (lifecycleStatus === NovelLifecycleStatus.Active) {
      return null;
    }

    const action = createRecommendedAction({
      type: 'view_lifecycle_reason',
      label: '查看原因',
      reasonText: lifecycleStatus === NovelLifecycleStatus.Paused ? '小说已暂停，恢复前不会继续推进创作。' : '小说已归档或删除，不在默认创作流程中推进。',
      target: 'detail',
      disabled: false
    });

    return {
      displayStatus: lifecycleStatus,
      displayStatusText:
        lifecycleStatus === NovelLifecycleStatus.Paused
          ? '已暂停'
          : lifecycleStatus === NovelLifecycleStatus.Archived
            ? '已归档'
            : '已删除',
      currentStep: '查看生命周期原因',
      blockingReasons: ['小说当前不在进行中状态。'],
      recommendedAction: action
    };
  }

  private getStageInfo(
    novel: Pick<NovelRecord, 'creationStage' | 'stageStatus' | 'currentOutlineVersionId' | 'currentStageOutlineVersionId'>
  ) {
    const { creationStage, stageStatus } = novel;

    if (creationStage === NovelCreationStage.Draft && stageStatus === StageStatus.NotStarted) {
      return {
        displayStatus: 'draft_created',
        displayStatusText: '草稿已创建',
        currentStep: '准备生成小说方向',
        completedSteps: ['创建草稿'],
        blockingReasons: [],
        recommendedAction: createRecommendedAction({
          type: 'view_detail',
          label: '进入详情',
          reasonText: '暂无 AI 结果，下一步需要进入详情后生成小说方向。',
          target: 'detail',
          disabled: false,
          taskType: 'novel_direction_generate'
        })
      };
    }

    if (creationStage === NovelCreationStage.Direction && stageStatus === StageStatus.WaitingUser) {
      return {
        displayStatus: 'direction_waiting_user',
        displayStatusText: '待选择方向',
        currentStep: '比较并采用小说方向',
        completedSteps: ['创建草稿'],
        blockingReasons: [],
        recommendedAction: createRecommendedAction({
          type: 'adopt_direction',
          label: '选择方向',
          reasonText: '已生成方向候选，采用一个方向后进入设定阶段。',
          target: 'detail',
          disabled: false,
          taskType: 'novel_direction_adopt'
        })
      };
    }

    if (creationStage === NovelCreationStage.Setting && stageStatus === StageStatus.NotStarted) {
      return {
        displayStatus: 'setting_not_started',
        displayStatusText: '待生成设定',
        currentStep: '准备生成小说设定',
        completedSteps: ['创建草稿', '确认方向'],
        blockingReasons: [],
        recommendedAction: createRecommendedAction({
          type: 'generate_setting',
          label: '生成设定',
          reasonText: '方向已采用，下一步生成小说设定，设定确认后才能进入全书大纲。',
          target: 'detail',
          disabled: false,
          taskType: 'novel_setting_generate'
        })
      };
    }

    if (creationStage === NovelCreationStage.Setting && stageStatus === StageStatus.WaitingUser) {
      return {
        displayStatus: 'setting_waiting_user',
        displayStatusText: '待确认设定',
        currentStep: '确认小说设定',
        completedSteps: ['创建草稿', '确认方向'],
        blockingReasons: [],
        recommendedAction: createRecommendedAction({
          type: 'adopt_setting',
          label: '采用设定',
          reasonText: '设定候选已生成，采用后才能生成全书大纲。',
          target: 'detail',
          disabled: false,
          taskType: 'adopt_setting'
        })
      };
    }

    if (creationStage === NovelCreationStage.Outline && stageStatus === StageStatus.NotStarted && !novel.currentOutlineVersionId) {
      return {
        displayStatus: 'outline_not_started',
        displayStatusText: '待生成全书大纲',
        currentStep: '准备生成全书大纲',
        completedSteps: ['创建草稿', '确认方向', '确认设定'],
        blockingReasons: [],
        recommendedAction: createRecommendedAction({
          type: 'generate_outline',
          label: '生成全书大纲',
          reasonText: '设定已确认，下一步生成全书主线和阶段方向。',
          target: 'detail',
          disabled: false,
          taskType: 'novel_outline_generate'
        })
      };
    }

    if (creationStage === NovelCreationStage.Outline && stageStatus === StageStatus.WaitingUser && !novel.currentOutlineVersionId) {
      return {
        displayStatus: 'outline_waiting_user',
        displayStatusText: '待确认全书大纲',
        currentStep: '确认全书大纲',
        completedSteps: ['创建草稿', '确认方向', '确认设定'],
        blockingReasons: [],
        recommendedAction: createRecommendedAction({
          type: 'adopt_outline',
          label: '采用全书大纲',
          reasonText: '全书大纲候选已生成，采用后继续生成阶段大纲。',
          target: 'detail',
          disabled: false,
          taskType: 'adopt_outline'
        })
      };
    }

    if (creationStage === NovelCreationStage.Outline && stageStatus === StageStatus.NotStarted && novel.currentOutlineVersionId) {
      return {
        displayStatus: 'stage_outline_not_started',
        displayStatusText: '待生成阶段大纲',
        currentStep: '准备生成阶段大纲',
        completedSteps: ['创建草稿', '确认方向', '确认设定', '确认全书大纲'],
        blockingReasons: [],
        recommendedAction: createRecommendedAction({
          type: 'generate_stage_outline',
          label: '生成阶段大纲',
          reasonText: '全书大纲已确认，下一步拆分阶段结构。',
          target: 'detail',
          disabled: false,
          taskType: 'stage_outline_generate'
        })
      };
    }

    if (creationStage === NovelCreationStage.Outline && stageStatus === StageStatus.WaitingUser && novel.currentOutlineVersionId) {
      return {
        displayStatus: 'stage_outline_waiting_user',
        displayStatusText: '待确认阶段大纲',
        currentStep: '确认阶段大纲',
        completedSteps: ['创建草稿', '确认方向', '确认设定', '确认全书大纲'],
        blockingReasons: [],
        recommendedAction: createRecommendedAction({
          type: 'adopt_stage_outline',
          label: '采用阶段大纲',
          reasonText: '阶段大纲候选已生成，采用后才能生成章节目录。',
          target: 'detail',
          disabled: false,
          taskType: 'adopt_stage_outline'
        })
      };
    }

    if (creationStage === NovelCreationStage.ChapterPlan && stageStatus === StageStatus.NotStarted) {
      return {
        displayStatus: 'chapter_plan_not_started',
        displayStatusText: '待生成章节目录',
        currentStep: '准备生成章节目录',
        completedSteps: ['创建草稿', '确认方向', '确认设定', '确认大纲'],
        blockingReasons: [],
        recommendedAction: createRecommendedAction({
          type: 'generate_chapter_plan',
          label: '生成章节目录',
          reasonText: '阶段大纲已确认，下一步生成每章目标、冲突和钩子。',
          target: 'detail',
          disabled: false,
          taskType: 'chapter_plan_generate'
        })
      };
    }

    if (creationStage === NovelCreationStage.ChapterPlan && stageStatus === StageStatus.WaitingUser) {
      return {
        displayStatus: 'chapter_plan_waiting_user',
        displayStatusText: '待确认章节目录',
        currentStep: '确认章节目录',
        completedSteps: ['创建草稿', '确认方向', '确认设定', '确认大纲'],
        blockingReasons: [],
        recommendedAction: createRecommendedAction({
          type: 'adopt_chapter_plan',
          label: '采用章节目录',
          reasonText: '章节目录候选已生成，采用后只创建章节计划，不生成正文。',
          target: 'detail',
          disabled: false,
          taskType: 'adopt_chapter_plan'
        })
      };
    }

    if (creationStage === NovelCreationStage.Trial && stageStatus === StageStatus.NotStarted) {
      return {
        displayStatus: 'trial_not_started',
        displayStatusText: '待生成试写',
        currentStep: '生成第1章试写候选',
        completedSteps: ['创建草稿', '确认方向', '确认设定', '确认大纲', '确认章节目录'],
        blockingReasons: [],
        recommendedAction: createRecommendedAction({
          type: 'generate_trial',
          label: '生成试写',
          reasonText: '章节目录已确认，下一步生成第1章试写候选；候选需要人工选择后才会继续第2-3章。',
          target: 'detail',
          disabled: false,
          taskType: 'trial_writing_generate'
        })
      };
    }

    if (creationStage === NovelCreationStage.Trial && stageStatus === StageStatus.WaitingUser) {
      return {
        displayStatus: 'trial_waiting_user',
        displayStatusText: '试写待确认',
        currentStep: '选择第1章候选或确认试写总评',
        completedSteps: ['创建草稿', '确认方向', '确认设定', '确认大纲', '确认章节目录'],
        blockingReasons: [],
        recommendedAction: createRecommendedAction({
          type: 'select_trial_chapter_one',
          label: '选择第1章候选',
          reasonText: '试写结果已生成，先选择第1章候选；完成前三章后再确认试写总评。',
          target: 'detail',
          disabled: false,
          taskType: 'trial_writing_generate'
        })
      };
    }

    if (creationStage === NovelCreationStage.Body && stageStatus === StageStatus.NotStarted) {
      return {
        displayStatus: 'body_strategy_ready',
        displayStatusText: '正文策略已生成',
        currentStep: '准备按批次生成正文',
        completedSteps: ['创建草稿', '确认方向', '确认设定', '确认大纲', '确认章节目录', '试写通过'],
        blockingReasons: [],
        recommendedAction: createRecommendedAction({
          type: 'start_body_batch',
          label: '开始本批生成',
          reasonText: '试写已确认并生成正文策略快照；下一步按默认 5 章一批生成正文。',
          target: 'detail',
          disabled: false,
          confirmRequired: true,
          taskType: 'body_batch_generate'
        })
      };
    }

    if (creationStage === NovelCreationStage.Body && stageStatus === StageStatus.Completed) {
      return {
        displayStatus: 'body_ready_for_full_review',
        displayStatusText: '待全书审稿',
        currentStep: '正文批量生成阶段完成',
        completedSteps: ['创建草稿', '确认方向', '确认设定', '确认大纲', '确认章节目录', '试写通过', '正文生成'],
        blockingReasons: [],
        recommendedAction: createRecommendedAction({
          type: 'start_full_review',
          label: '全书 AI 审稿',
          reasonText: '正文批量生成阶段已完成，下一步创建正式全书审稿任务。',
          target: 'detail',
          disabled: false,
          confirmRequired: true,
          taskType: 'novel_full_review'
        })
      };
    }

    if (creationStage === NovelCreationStage.FullReview) {
      return {
        displayStatus: stageStatus === StageStatus.Blocked ? 'full_review_blocked' : 'full_review_processing',
        displayStatusText: stageStatus === StageStatus.Blocked ? '全书审稿未通过' : '全书审稿中',
        currentStep: stageStatus === StageStatus.Blocked ? '处理全书审稿问题或确认风险继续' : '等待全书审稿完成',
        completedSteps: this.getCompletedSteps(creationStage),
        blockingReasons: stageStatus === StageStatus.Blocked ? ['全书审稿存在阻塞问题。'] : [],
        recommendedAction: createRecommendedAction({
          type: stageStatus === StageStatus.Blocked ? 'handle_full_review_issues' : 'view_full_review_task',
          label: stageStatus === StageStatus.Blocked ? '处理审稿问题' : '查看审稿进度',
          reasonText: stageStatus === StageStatus.Blocked ? '进入详情查看问题卡、处理问题或填写原因强制通过。' : '全书审稿任务正在处理，请查看进度。',
          target: 'detail',
          disabled: false,
          taskType: 'novel_full_review'
        })
      };
    }

    if (creationStage === NovelCreationStage.CompletionConfirm && stageStatus === StageStatus.WaitingUser) {
      return {
        displayStatus: 'completion_waiting_confirm',
        displayStatusText: '待确认完成',
        currentStep: '确认小说完成',
        completedSteps: this.getCompletedSteps(creationStage),
        blockingReasons: [],
        recommendedAction: createRecommendedAction({
          type: 'confirm_completion',
          label: '确认小说完成',
          reasonText: '全书审稿已通过，请确认小说完成；完成确认不会直接创建视频项目。',
          target: 'detail',
          disabled: false,
          confirmRequired: true,
          taskType: null
        })
      };
    }

    if (creationStage === NovelCreationStage.CompletionConfirm && stageStatus === StageStatus.Completed) {
      return {
        displayStatus: 'completion_confirmed_video_check_ready',
        displayStatusText: '已完成，待确认视频化',
        currentStep: '确认进入待视频化',
        completedSteps: this.getCompletedSteps(creationStage),
        blockingReasons: [],
        recommendedAction: createRecommendedAction({
          type: 'confirm_video_readiness',
          label: '确认进入待视频化',
          reasonText: '小说已完成且待视频化检查通过，确认后生成视频化引用快照。',
          target: 'detail',
          disabled: false,
          confirmRequired: true,
          taskType: 'video_readiness_check'
        })
      };
    }

    if (creationStage === NovelCreationStage.VideoReady) {
      return {
        displayStatus: 'video_ready',
        displayStatusText: '待视频化',
        currentStep: '小说已可被视频模块引用',
        completedSteps: this.getCompletedSteps(creationStage),
        blockingReasons: [],
        recommendedAction: createRecommendedAction({
          type: 'go_video_list',
          label: '去视频列表',
          reasonText: '小说已生成视频化引用快照，可在视频模块查看引用状态；这里不创建视频项目。',
          target: 'detail',
          disabled: false,
          taskType: null
        })
      };
    }

    if (stageStatus === StageStatus.Processing) {
      return {
        displayStatus: 'processing',
        displayStatusText: '处理中',
        currentStep: '等待当前任务完成',
        completedSteps: this.getCompletedSteps(creationStage),
        blockingReasons: [],
        recommendedAction: createRecommendedAction({
          type: 'view_detail',
          label: '进入详情',
          reasonText: '当前阶段已有任务在处理，进入详情查看进度。',
          target: 'detail',
          disabled: false
        })
      };
    }

    if (stageStatus === StageStatus.Blocked || stageStatus === StageStatus.Failed) {
      return {
        displayStatus: stageStatus,
        displayStatusText: stageStatus === StageStatus.Blocked ? '当前阶段被阻塞' : '最近任务失败',
        currentStep: '处理阻塞原因',
        completedSteps: this.getCompletedSteps(creationStage),
        blockingReasons: [stageStatus === StageStatus.Blocked ? '当前阶段存在阻塞问题。' : '最近一次任务失败，需要查看原因。'],
        recommendedAction: createRecommendedAction({
          type: 'view_detail',
          label: '进入详情',
          reasonText: '进入详情查看阻塞原因和下一步建议。',
          target: 'detail',
          disabled: false
        })
      };
    }

    return {
      displayStatus: `${creationStage}_${stageStatus}`,
      displayStatusText: '等待继续推进',
      currentStep: '查看下一步',
      completedSteps: this.getCompletedSteps(creationStage),
      blockingReasons: [],
      recommendedAction: createRecommendedAction({
        type: 'view_detail',
        label: '进入详情',
        reasonText: '进入详情查看当前阶段和下一步。',
        target: 'detail',
        disabled: false
      })
    };
  }

  private getCompletedSteps(creationStage: NovelCreationStage) {
    const allSteps = [
      [NovelCreationStage.Draft, '创建草稿'],
      [NovelCreationStage.Direction, '确认方向'],
      [NovelCreationStage.Setting, '确认设定'],
      [NovelCreationStage.Outline, '确认大纲'],
      [NovelCreationStage.ChapterPlan, '确认章节目录'],
      [NovelCreationStage.Trial, '试写通过'],
      [NovelCreationStage.Body, '正文完成'],
      [NovelCreationStage.FullReview, '全书审稿'],
      [NovelCreationStage.CompletionConfirm, '完成确认'],
      [NovelCreationStage.VideoReady, '待视频化']
    ] as const;
    const index = allSteps.findIndex(([stage]) => stage === creationStage);

    return index <= 0 ? ['创建草稿'] : allSteps.slice(0, index).map(([, label]) => label);
  }
}

function createRecommendedAction(options: {
  type: string;
  label: string;
  reasonText: string;
  target: RecommendedActionDTO['target'];
  disabled: boolean;
  disabledReason?: string | null;
  confirmRequired?: boolean;
  taskType?: string | null;
}): RecommendedActionDTO {
  return {
    type: options.type,
    label: options.label,
    reasonText: options.reasonText,
    target: options.target,
    disabled: options.disabled,
    disabledReason: options.disabledReason ?? null,
    confirmRequired: options.confirmRequired ?? false,
    taskType: options.taskType ?? null
  };
}
