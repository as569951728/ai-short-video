import { TaskStatus, type CancelTaskRequest, type CancelTaskResultDTO, type RetryTaskRequest, type RetryTaskResultDTO, type TaskDetailDTO, type TaskEventListDTO } from '@ai-shortvideo/shared'
import { getApiMode, type ApiMode } from '../../../shared/services/apiMode.js'
import { apiRequest } from '../../../shared/services/http.js'

export async function getTaskDetail(taskId: string, mode: ApiMode = getApiMode()): Promise<TaskDetailDTO> {
  if (mode === 'mock') return createMockTaskDetail(taskId)

  return apiRequest<TaskDetailDTO>(`/tasks/${taskId}`)
}

export async function getTaskEvents(taskId: string, mode: ApiMode = getApiMode()): Promise<TaskEventListDTO> {
  if (mode === 'mock') {
    return {
      items: createMockTaskDetail(taskId).events,
    }
  }

  return apiRequest<TaskEventListDTO>(`/tasks/${taskId}/events`)
}

export async function retryTask(taskId: string, request: RetryTaskRequest = {}, mode: ApiMode = getApiMode()): Promise<RetryTaskResultDTO> {
  if (mode === 'mock') {
    return {
      originalTask: createMockTaskDetail(taskId),
      newTask: createMockTaskDetail(`mock-retry-${Date.now()}`, {
        status: TaskStatus.Queued,
        statusText: '已排队',
        progress: 0,
        currentStep: '等待重试执行',
        retryOfTaskId: taskId,
        retryable: false,
        cancellable: true,
      }),
    }
  }

  return apiRequest<RetryTaskResultDTO>(`/tasks/${taskId}/retry`, {
    method: 'POST',
    body: request,
  })
}

export async function cancelTask(taskId: string, request: CancelTaskRequest = {}, mode: ApiMode = getApiMode()): Promise<CancelTaskResultDTO> {
  if (mode === 'mock') {
    return {
      task: createMockTaskDetail(taskId, {
        status: TaskStatus.Cancelled,
        statusText: '已取消',
        progress: 100,
        currentStep: '任务已取消',
        retryable: false,
        cancellable: false,
        cancelReason: request.reason ?? '用户取消任务',
      }),
    }
  }

  return apiRequest<CancelTaskResultDTO>(`/tasks/${taskId}/cancel`, {
    method: 'POST',
    body: request,
  })
}

function createMockTaskDetail(taskId: string, overrides: Partial<TaskDetailDTO> = {}): TaskDetailDTO {
  const now = new Date().toISOString()

  return {
    id: taskId,
    taskType: 'novel_direction_generate',
    status: TaskStatus.WaitingConfirmation,
    statusText: '有新结果待确认',
    progress: 100,
    currentStep: '方向候选已生成，等待确认',
    novelId: 'mock-novel',
    objectType: 'direction',
    objectId: 'direction',
    statusNote: 'mock provider 已生成候选',
    sourceVersionRefs: { currentDirectionVersionId: null },
    conflictScope: 'novel_direction',
    conflictKey: 'mock-novel',
    resultVersionIds: ['mock-version'],
    retryOfTaskId: null,
    failureCategory: null,
    failureCategoryText: null,
    errorCode: null,
    errorMessage: null,
    userFailureReason: null,
    retryable: false,
    cancellable: true,
    cancelReason: null,
    trace: {
      taskId,
      requestId: 'mock-request',
      retryOfTaskId: null,
    },
    nextAction: {
      type: 'view_result',
      label: '查看候选结果',
      reasonText: '候选已生成，采用后才会成为当前正式资产。',
      target: 'detail',
      disabled: false,
      disabledReason: null,
      confirmRequired: false,
      taskType: null,
    },
    createdAt: now,
    updatedAt: now,
    events: [
      {
        id: `${taskId}-event-1`,
        taskId,
        status: TaskStatus.Queued,
        statusText: '已排队',
        eventType: 'task_created',
        eventTypeText: '任务创建',
        message: '任务已创建。',
        progress: 0,
        requestId: 'mock-request',
        createdAt: now,
      },
      {
        id: `${taskId}-event-2`,
        taskId,
        status: TaskStatus.WaitingConfirmation,
        statusText: '有新结果待确认',
        eventType: 'result_ready',
        eventTypeText: '结果已生成',
        message: '候选结果已生成，等待确认。',
        progress: 100,
        requestId: 'mock-request',
        createdAt: now,
      },
    ],
    ...overrides,
  }
}
