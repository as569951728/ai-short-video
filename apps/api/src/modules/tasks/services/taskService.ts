import {
  ErrorCode,
  TaskStatus,
  type CancelTaskRequest,
  type CancelTaskResultDTO,
  type RecommendedActionDTO,
  type RetryTaskRequest,
  type RetryTaskResultDTO,
  type TaskDetailDTO,
  type TaskEventDTO,
  type TaskEventListDTO
} from '@ai-shortvideo/shared';
import { BusinessError } from '../../../shared/errors.js';
import type {
  GenerationTaskEventRecord,
  GenerationTaskRecord,
  NovelRecord,
  NovelRepository,
  RequestContext
} from '../../novels/domain/novelDomain.js';

export interface TaskServiceOptions {
  repository: NovelRepository;
  now?: () => Date;
}

const ACTIVE_TASK_STATUSES = [TaskStatus.Queued, TaskStatus.Processing, TaskStatus.WaitingConfirmation];

export class TaskService {
  private readonly now: () => Date;

  constructor(private readonly options: TaskServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async getTask(taskId: string, context: RequestContext): Promise<TaskDetailDTO> {
    const task = await this.findTaskOrThrow(taskId, context);
    const events = await this.options.repository.listTaskEvents(context.tenantId, taskId);
    const sourceStale = await this.isSourceVersionStale(task, context);

    return this.toTaskDetailDTO(task, events, sourceStale);
  }

  async getTaskEvents(taskId: string, context: RequestContext): Promise<TaskEventListDTO> {
    const task = await this.findTaskOrThrow(taskId, context);
    const events = await this.options.repository.listTaskEvents(context.tenantId, task.id);

    return {
      items: events.map(toTaskEventDTO)
    };
  }

  async retryTask(taskId: string, request: RetryTaskRequest, context: RequestContext): Promise<RetryTaskResultDTO> {
    const task = await this.findTaskOrThrow(taskId, context);

    if (task.status !== TaskStatus.Failed) {
      throw new BusinessError(ErrorCode.TaskNotRetryable, '只有失败任务可以重试', {
        taskId: task.id,
        status: task.status
      });
    }

    const sourceStale = await this.isSourceVersionStale(task, context);
    if (sourceStale) {
      throw new BusinessError(ErrorCode.CandidateStale, '任务使用的上游版本已变化，请重新生成。', {
        taskId: task.id,
        sourceVersionRefs: task.sourceVersionRefs
      });
    }

    if (task.conflictScope && task.conflictKey) {
      const activeTask = await this.options.repository.findActiveTaskByConflict(context.tenantId, task.conflictScope, task.conflictKey);
      if (activeTask && activeTask.id !== task.id) {
        throw new BusinessError(ErrorCode.ConflictTaskExists, '已有同一对象的任务正在处理，请先处理当前任务。', {
          activeTaskId: activeTask.id,
          status: activeTask.status,
          taskType: activeTask.taskType
        });
      }
    }

    const result = await this.options.repository.retryTask({
      task,
      reason: request.reason?.trim() || '重试失败任务',
      context,
      now: this.now()
    });
    const originalEvents = await this.options.repository.listTaskEvents(context.tenantId, result.originalTask.id);
    const newEvents = await this.options.repository.listTaskEvents(context.tenantId, result.newTask.id);

    return {
      originalTask: this.toTaskDetailDTO(result.originalTask, originalEvents, false),
      newTask: this.toTaskDetailDTO(result.newTask, newEvents, false)
    };
  }

  async cancelTask(taskId: string, request: CancelTaskRequest, context: RequestContext): Promise<CancelTaskResultDTO> {
    const task = await this.findTaskOrThrow(taskId, context);

    if (!ACTIVE_TASK_STATUSES.includes(task.status)) {
      throw new BusinessError(ErrorCode.TaskNotRetryable, '当前任务不能取消', {
        taskId: task.id,
        status: task.status
      });
    }

    const result = await this.options.repository.cancelTask({
      task,
      reason: request.reason?.trim() || '用户取消任务',
      context,
      now: this.now()
    });
    const events = await this.options.repository.listTaskEvents(context.tenantId, result.task.id);

    return {
      task: this.toTaskDetailDTO(result.task, events, false)
    };
  }

  private async findTaskOrThrow(taskId: string, context: RequestContext) {
    const task = await this.options.repository.findTaskById(context.tenantId, taskId);

    if (!task) {
      throw new BusinessError(ErrorCode.NotFound, '任务不存在');
    }

    return task;
  }

  private async isSourceVersionStale(task: GenerationTaskRecord, context: RequestContext) {
    if (!task.novelId) return false;

    const novel = await this.options.repository.findById(context.tenantId, task.novelId);
    if (!novel) return true;

    return sourceRefsChanged(task.sourceVersionRefs, novel);
  }

  private toTaskDetailDTO(task: GenerationTaskRecord, events: GenerationTaskEventRecord[], sourceStale: boolean): TaskDetailDTO {
    const retryable = task.status === TaskStatus.Failed && !sourceStale;
    const cancellable = ACTIVE_TASK_STATUSES.includes(task.status);
    const traceRequestId = getRequestId(task.metadata);

    return {
      id: task.id,
      taskType: task.taskType,
      status: task.status,
      statusText: getTaskStatusText(task.status),
      progress: task.progress,
      currentStep: task.currentStep,
      novelId: task.novelId,
      objectType: task.objectType,
      objectId: task.objectId,
      statusNote: task.statusNote,
      sourceVersionRefs: task.sourceVersionRefs,
      conflictScope: task.conflictScope,
      conflictKey: task.conflictKey,
      resultVersionIds: task.resultVersionIds,
      retryOfTaskId: task.retryOfTaskId,
      failureCategory: task.failureCategory,
      failureCategoryText: getFailureCategoryText(task.failureCategory),
      errorCode: task.errorCode,
      errorMessage: task.errorMessage,
      userFailureReason: getUserFailureReason(task, sourceStale),
      retryable,
      cancellable,
      cancelReason: task.cancelReason,
      trace: {
        taskId: task.id,
        requestId: traceRequestId,
        retryOfTaskId: task.retryOfTaskId
      },
      nextAction: getTaskNextAction(task, retryable, cancellable, sourceStale),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      events: events.map(toTaskEventDTO)
    };
  }
}

export function toRecentTaskSummaryDTO(task: GenerationTaskRecord) {
  return {
    id: task.id,
    taskType: task.taskType,
    status: task.status,
    statusText: getTaskStatusText(task.status),
    progress: task.progress,
    currentStep: task.currentStep
  };
}

function toTaskEventDTO(event: GenerationTaskEventRecord): TaskEventDTO {
  return {
    id: event.id,
    taskId: event.taskId,
    status: event.status,
    statusText: getTaskStatusText(event.status),
    eventType: event.eventType,
    eventTypeText: getEventTypeText(event.eventType),
    message: event.message ?? '',
    progress: event.progress,
    requestId: getRequestId(event.payload),
    createdAt: event.createdAt.toISOString()
  };
}

function getTaskStatusText(status: TaskStatus | string) {
  if (status === TaskStatus.WaitingConfirmation) return '有新结果待确认';
  if (status === TaskStatus.Completed) return '已完成';
  if (status === TaskStatus.Processing) return '正在处理';
  if (status === TaskStatus.Failed) return '失败';
  if (status === TaskStatus.Cancelled) return '已取消';
  return '已排队';
}

function getEventTypeText(eventType: string) {
  if (eventType === 'preparing_context') return '准备上下文';
  if (eventType === 'calling_model') return '调用模型';
  if (eventType === 'parsing_output') return '解析输出';
  if (eventType === 'quality_checking') return '质量检查';
  if (eventType === 'saving_result') return '保存结果';
  if (eventType === 'chapter_progress') return '章节进度';
  if (eventType === 'task_created') return '任务创建';
  if (eventType === 'task_processing') return '处理中';
  if (eventType === 'result_ready') return '结果已生成';
  if (eventType === 'task_completed') return '已确认完成';
  if (eventType === 'task_retry_created') return '已创建重试';
  if (eventType === 'task_cancelled') return '已取消';
  if (eventType === 'task_failed') return '失败';
  return '任务事件';
}

function getFailureCategoryText(category: string | null) {
  if (!category) return null;
  if (category === 'provider_error') return '生成服务异常';
  if (category === 'timeout') return '模型调用超时';
  if (category === 'rate_limited') return '模型服务限流';
  if (category === 'quota_insufficient') return '模型额度不足';
  if (category === 'output_parse_failed') return '模型输出解析失败';
  if (category === 'source_stale') return '上游版本已变化';
  if (category === 'validation_error') return '生成结果结构异常';
  if (category === 'cancelled') return '用户取消';
  return '任务异常';
}

function getUserFailureReason(task: GenerationTaskRecord, sourceStale: boolean) {
  if (sourceStale) return '上游内容已经变化，旧任务不能直接重试，请基于最新版本重新生成。';
  if (task.status === TaskStatus.Failed) {
    return task.errorMessage || task.statusNote || '任务失败，请稍后重试或调整输入后重新生成。';
  }
  if (task.status === TaskStatus.Cancelled) {
    return task.cancelReason ? `任务已取消：${task.cancelReason}` : '任务已取消，不会写入正式资产。';
  }
  return null;
}

function getTaskNextAction(
  task: GenerationTaskRecord,
  retryable: boolean,
  cancellable: boolean,
  sourceStale: boolean
): RecommendedActionDTO {
  if (sourceStale) return createAction('regenerate', '重新生成', '上游内容已经变化，旧任务不能直接重试，请基于最新版本重新生成。', 'detail', false);
  if (retryable) return createAction('retry_task', '重试任务', '失败任务可创建一个新的重试任务，原任务会保留。', 'task', false);
  if (task.status === TaskStatus.WaitingConfirmation) return createAction('view_result', '查看候选结果', '候选已生成，采用后才会成为当前正式资产。', 'detail', false);
  if (cancellable) return createAction('view_task', '查看进度', '任务仍在执行，可查看进度并按需取消。', 'task', false);
  if (task.status === TaskStatus.Cancelled) return createAction('regenerate', '重新生成', '任务已取消，如仍需要结果请重新生成。', 'detail', false);
  if (task.status === TaskStatus.Completed) return createAction('view_detail', '查看结果', '任务已完成，可回到详情查看当前资产。', 'detail', false);
  return createAction('disabled', '暂无可用动作', '当前任务状态暂不能继续操作。', 'disabled', true);
}

function createAction(
  type: string,
  label: string,
  reasonText: string,
  target: RecommendedActionDTO['target'],
  disabled: boolean
): RecommendedActionDTO {
  return {
    type,
    label,
    reasonText,
    target,
    disabled,
    disabledReason: disabled ? reasonText : null,
    confirmRequired: type === 'retry_task' || type === 'regenerate',
    taskType: null
  };
}

function getRequestId(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  return typeof record.requestId === 'string' ? record.requestId : null;
}

function sourceRefsChanged(sourceVersionRefs: unknown, novel: NovelRecord) {
  if (!sourceVersionRefs || typeof sourceVersionRefs !== 'object') return false;
  const refs = sourceVersionRefs as Record<string, unknown>;

  return (
    isVersionRefChanged(refs, 'currentDirectionVersionId', novel.currentDirectionVersionId) ||
    isVersionRefChanged(refs, 'currentSettingVersionId', novel.currentSettingVersionId) ||
    isVersionRefChanged(refs, 'currentOutlineVersionId', novel.currentOutlineVersionId) ||
    isVersionRefChanged(refs, 'currentStageOutlineVersionId', novel.currentStageOutlineVersionId) ||
    isVersionRefChanged(refs, 'currentChapterPlanVersionId', novel.currentChapterPlanVersionId)
  );
}

function isVersionRefChanged(refs: Record<string, unknown>, key: string, currentValue: string | null) {
  if (!(key in refs)) return false;

  return (refs[key] ?? null) !== currentValue;
}
