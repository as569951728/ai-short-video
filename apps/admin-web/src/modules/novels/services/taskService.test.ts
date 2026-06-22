import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TaskStatus, type CancelTaskResultDTO, type RetryTaskResultDTO, type TaskDetailDTO, type TaskEventListDTO } from '@ai-shortvideo/shared'
import { cancelTask, getTaskDetail, getTaskEvents, retryTask } from './taskService.js'

describe('task service api contract', () => {
  it('loads task detail and task events from backend task center endpoints', async () => {
    const originalFetch = globalThis.fetch
    const requested: Array<{ url: string; method: string }> = []

    globalThis.fetch = (async (url, init) => {
      requested.push({
        url: String(url),
        method: String(init?.method ?? 'GET'),
      })

      const data = requested.length === 1 ? createTaskDetailDTO() : createTaskEventListDTO()

      return new Response(
        JSON.stringify({
          success: true,
          data,
          error: null,
          requestId: 'task-request',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    }) as typeof fetch

    try {
      const detail = await getTaskDetail('task-001', 'backend')
      const events = await getTaskEvents('task-001', 'backend')

      assert.equal(requested[0].url, 'http://localhost:3001/tasks/task-001')
      assert.equal(requested[1].url, 'http://localhost:3001/tasks/task-001/events')
      assert.equal(detail.trace.requestId, 'backend-request-001')
      assert.equal(events.items[0].eventType, 'task_created')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('posts retry and cancel actions without mutating the original failed task', async () => {
    const originalFetch = globalThis.fetch
    const requested: Array<{ url: string; method: string; body: unknown }> = []

    globalThis.fetch = (async (url, init) => {
      requested.push({
        url: String(url),
        method: String(init?.method ?? 'GET'),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })

      const data = String(url).endsWith('/retry') ? createRetryResultDTO() : createCancelResultDTO()

      return new Response(
        JSON.stringify({
          success: true,
          data,
          error: null,
          requestId: 'task-action-request',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    }) as typeof fetch

    try {
      const retried = await retryTask('task-001', { reason: '网络恢复后重试' }, 'backend')
      const cancelled = await cancelTask('task-002', { reason: '用户确认取消' }, 'backend')

      assert.equal(requested[0].url, 'http://localhost:3001/tasks/task-001/retry')
      assert.equal(requested[0].method, 'POST')
      assert.equal(requested[0].body.reason, '网络恢复后重试')
      assert.equal(retried.originalTask.status, TaskStatus.Failed)
      assert.equal(retried.newTask.retryOfTaskId, 'task-001')
      assert.equal(requested[1].url, 'http://localhost:3001/tasks/task-002/cancel')
      assert.equal(cancelled.task.status, TaskStatus.Cancelled)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

function createTaskDetailDTO(overrides: Partial<TaskDetailDTO> = {}): TaskDetailDTO {
  return {
    id: 'task-001',
    taskType: 'novel_direction_generate',
    status: TaskStatus.Failed,
    statusText: '失败',
    progress: 45,
    currentStep: 'mock provider 结构化输出失败',
    novelId: 'novel-001',
    objectType: 'direction',
    objectId: 'direction',
    statusNote: '生成服务暂时没有响应',
    sourceVersionRefs: { currentDirectionVersionId: null },
    conflictScope: 'novel_direction',
    conflictKey: 'novel-001',
    resultVersionIds: [],
    retryOfTaskId: null,
    failureCategory: 'provider_error',
    failureCategoryText: '生成服务异常',
    errorCode: 'MOCK_PROVIDER_TIMEOUT',
    errorMessage: '生成服务暂时没有响应，请稍后重试。',
    userFailureReason: '生成服务暂时没有响应，请稍后重试。',
    retryable: true,
    cancellable: false,
    cancelReason: null,
    trace: {
      taskId: 'task-001',
      requestId: 'backend-request-001',
      retryOfTaskId: null,
    },
    nextAction: {
      type: 'retry_task',
      label: '重试任务',
      reasonText: '失败任务可创建一个新的重试任务，原任务会保留。',
      target: 'task',
      disabled: false,
      disabledReason: null,
      confirmRequired: true,
      taskType: null,
    },
    createdAt: '2026-06-17T12:00:00.000Z',
    updatedAt: '2026-06-17T12:01:00.000Z',
    events: createTaskEventListDTO().items,
    ...overrides,
  }
}

function createTaskEventListDTO(): TaskEventListDTO {
  return {
    items: [
      {
        id: 'event-001',
        taskId: 'task-001',
        status: TaskStatus.Queued,
        statusText: '已排队',
        eventType: 'task_created',
        eventTypeText: '任务创建',
        message: '任务已创建。',
        progress: 0,
        requestId: 'backend-request-001',
        createdAt: '2026-06-17T12:00:00.000Z',
      },
    ],
  }
}

function createRetryResultDTO(): RetryTaskResultDTO {
  return {
    originalTask: createTaskDetailDTO(),
    newTask: createTaskDetailDTO({
      id: 'task-002',
      status: TaskStatus.Queued,
      statusText: '已排队',
      progress: 0,
      currentStep: '等待重试执行',
      retryOfTaskId: 'task-001',
      retryable: false,
      cancellable: true,
    }),
  }
}

function createCancelResultDTO(): CancelTaskResultDTO {
  return {
    task: createTaskDetailDTO({
      id: 'task-002',
      status: TaskStatus.Cancelled,
      statusText: '已取消',
      retryable: false,
      cancellable: false,
      cancelReason: '用户确认取消',
    }),
  }
}
