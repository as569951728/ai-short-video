export enum NovelLifecycleStatus {
  Active = 'active',
  Paused = 'paused',
  Archived = 'archived',
  Deleted = 'deleted'
}

export enum NovelCreationStage {
  Draft = 'draft',
  Direction = 'direction',
  Setting = 'setting',
  Outline = 'outline',
  ChapterPlan = 'chapter_plan',
  Trial = 'trial',
  Body = 'body',
  FullReview = 'full_review',
  CompletionConfirm = 'completion_confirm',
  VideoReady = 'video_ready'
}

export enum StageStatus {
  NotStarted = 'not_started',
  Processing = 'processing',
  WaitingUser = 'waiting_user',
  Blocked = 'blocked',
  Failed = 'failed',
  Completed = 'completed'
}

export enum TaskStatus {
  Queued = 'queued',
  Processing = 'processing',
  WaitingConfirmation = 'waiting_confirmation',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled'
}

export enum VersionStatus {
  Candidate = 'candidate',
  Current = 'current',
  Historical = 'historical',
  Discarded = 'discarded',
  Stale = 'stale'
}

export enum StaleLevel {
  None = 'none',
  SoftStale = 'soft_stale',
  HardStale = 'hard_stale',
  RiskStale = 'risk_stale'
}

export enum RiskLevel {
  None = 'none',
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Blocking = 'blocking'
}

export enum ImpactLevel {
  None = 'none',
  Minor = 'minor',
  Medium = 'medium',
  Severe = 'severe'
}

export type SharedEnumName =
  | 'novelLifecycleStatus'
  | 'novelCreationStage'
  | 'stageStatus'
  | 'taskStatus'
  | 'versionStatus'
  | 'staleLevel'
  | 'riskLevel'
  | 'impactLevel';

export interface EnumOption<TValue extends string = string> {
  value: TValue;
  label: string;
  description: string;
  terminal?: boolean;
  blocksNextStep?: boolean;
}

export const enumOptions = {
  novelLifecycleStatus: [
    {
      value: NovelLifecycleStatus.Active,
      label: '进行中',
      description: '小说仍在创作池中，可继续推进'
    },
    {
      value: NovelLifecycleStatus.Paused,
      label: '已暂停',
      description: '暂时停止推进，保留当前阶段和任务上下文',
      blocksNextStep: true
    },
    {
      value: NovelLifecycleStatus.Archived,
      label: '已归档',
      description: '移出进行中列表，保留复盘数据',
      blocksNextStep: true
    },
    {
      value: NovelLifecycleStatus.Deleted,
      label: '已删除',
      description: '默认不在普通列表展示',
      terminal: true,
      blocksNextStep: true
    }
  ],
  novelCreationStage: [
    {
      value: NovelCreationStage.Draft,
      label: '草稿',
      description: '创建项目，保存热点来源和基础偏好'
    },
    {
      value: NovelCreationStage.Direction,
      label: '选小说方向',
      description: '生成、比较、融合或确认小说方向'
    },
    {
      value: NovelCreationStage.Setting,
      label: '小说设定',
      description: '生成并确认人物、世界观、爽点、雷区'
    },
    {
      value: NovelCreationStage.Outline,
      label: '大纲结构',
      description: '生成并确认全书主线和阶段结构'
    },
    {
      value: NovelCreationStage.ChapterPlan,
      label: '章节目录',
      description: '生成并确认每章目标、冲突、爽点和钩子'
    },
    {
      value: NovelCreationStage.Trial,
      label: '试写调试',
      description: '试写前 1-3 章并完成审稿调试'
    },
    {
      value: NovelCreationStage.Body,
      label: '正文生成',
      description: '批量生成正文并处理章节问题'
    },
    {
      value: NovelCreationStage.FullReview,
      label: '全书审稿',
      description: '全书评分，判断是否适合视频化'
    },
    {
      value: NovelCreationStage.CompletionConfirm,
      label: '完成确认',
      description: '用户确认接受审稿结果'
    },
    {
      value: NovelCreationStage.VideoReady,
      label: '待视频化',
      description: '小说进入视频系统承接',
      terminal: true
    }
  ],
  stageStatus: [
    {
      value: StageStatus.NotStarted,
      label: '未开始',
      description: '当前阶段尚未开始'
    },
    {
      value: StageStatus.Processing,
      label: '处理中',
      description: '当前阶段有任务进行中'
    },
    {
      value: StageStatus.WaitingUser,
      label: '等待确认',
      description: '系统已给出结果，等待用户确认'
    },
    {
      value: StageStatus.Blocked,
      label: '已阻塞',
      description: '当前阶段被问题阻塞',
      blocksNextStep: true
    },
    {
      value: StageStatus.Failed,
      label: '失败',
      description: '当前阶段最近任务失败',
      blocksNextStep: true
    },
    {
      value: StageStatus.Completed,
      label: '已完成',
      description: '当前阶段完成'
    }
  ],
  taskStatus: [
    {
      value: TaskStatus.Queued,
      label: '已加入队列',
      description: '任务已创建，等待 worker 执行'
    },
    {
      value: TaskStatus.Processing,
      label: '正在处理',
      description: 'worker 正在执行任务'
    },
    {
      value: TaskStatus.WaitingConfirmation,
      label: '有新结果待确认',
      description: '任务已有结果，但需要用户确认采用或处理'
    },
    {
      value: TaskStatus.Completed,
      label: '已完成',
      description: '任务完成，结果已保存或确认采用',
      terminal: true
    },
    {
      value: TaskStatus.Failed,
      label: '失败',
      description: '任务失败，需要用户重试、调整或取消',
      terminal: true,
      blocksNextStep: true
    },
    {
      value: TaskStatus.Cancelled,
      label: '已取消',
      description: '用户取消，或系统因前置条件变化取消',
      terminal: true
    }
  ],
  versionStatus: [
    {
      value: VersionStatus.Candidate,
      label: '新改稿',
      description: '候选版本，等待采用或放弃'
    },
    {
      value: VersionStatus.Current,
      label: '当前版本',
      description: '当前正式使用版本'
    },
    {
      value: VersionStatus.Historical,
      label: '历史版本',
      description: '曾经使用过或被替换的版本'
    },
    {
      value: VersionStatus.Discarded,
      label: '已放弃',
      description: '用户明确放弃的候选版本',
      terminal: true
    },
    {
      value: VersionStatus.Stale,
      label: '已过期',
      description: '基于旧上游内容生成，不建议采用',
      blocksNextStep: true
    }
  ],
  staleLevel: [
    {
      value: StaleLevel.None,
      label: '未过期',
      description: '内容基于当前上游版本'
    },
    {
      value: StaleLevel.SoftStale,
      label: '轻微过期',
      description: '上游轻微变化，结果可能仍可参考'
    },
    {
      value: StaleLevel.HardStale,
      label: '强过期',
      description: '上游关键版本变化，结果不应采用',
      blocksNextStep: true
    },
    {
      value: StaleLevel.RiskStale,
      label: '风险过期',
      description: '结果可采用但风险明显，需要强确认',
      blocksNextStep: true
    }
  ],
  riskLevel: [
    {
      value: RiskLevel.None,
      label: '无风险',
      description: '未发现明显风险'
    },
    {
      value: RiskLevel.Low,
      label: '低风险',
      description: '风险较低，可继续处理'
    },
    {
      value: RiskLevel.Medium,
      label: '中风险',
      description: '需要关注并记录处理方式'
    },
    {
      value: RiskLevel.High,
      label: '高风险',
      description: '继续前需要确认原因',
      blocksNextStep: true
    },
    {
      value: RiskLevel.Blocking,
      label: '强阻塞',
      description: '内容安全或平台风险阻塞流程',
      blocksNextStep: true
    }
  ],
  impactLevel: [
    {
      value: ImpactLevel.None,
      label: '无影响',
      description: '只改表达，不影响事实和后文'
    },
    {
      value: ImpactLevel.Minor,
      label: '轻微影响',
      description: '改动局部情绪、表达或细节，可同步摘要解决'
    },
    {
      value: ImpactLevel.Medium,
      label: '中等影响',
      description: '影响部分后续章节，但不需要推翻全书',
      blocksNextStep: true
    },
    {
      value: ImpactLevel.Severe,
      label: '严重影响',
      description: '破坏后续主线、关键关系、伏笔或大量正文',
      blocksNextStep: true
    }
  ]
} satisfies Record<SharedEnumName, EnumOption[]>;

export function getEnumOption<TName extends SharedEnumName>(
  enumName: TName,
  value: (typeof enumOptions)[TName][number]['value']
) {
  return enumOptions[enumName].find((option) => option.value === value);
}
