import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskStatus, type RecentTaskSummaryDTO, type TaskDetailDTO } from '@ai-shortvideo/shared'
import TaskProgressPanel from './TaskProgressPanel.vue'

let wrapper: ReturnType<typeof mount> | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('TaskProgressPanel DOM integration', () => {
  it('keeps the real result button wired to viewResult with the resolved step key', async () => {
    const handleViewResult = vi.fn()
    const summary: RecentTaskSummaryDTO = {
      id: 'task-direction-001',
      taskType: 'novel_direction_generate',
      status: TaskStatus.Completed,
      statusText: '已完成',
      progress: 100,
      currentStep: '方向候选已生成',
      resultVersionIds: ['direction-candidate-001'],
    }

    wrapper = mount(TaskProgressPanel, {
      attachTo: document.body,
      props: { summary },
      attrs: { onViewResult: handleViewResult },
      global: { plugins: [ElementPlus] },
    })

    await wrapper.get('button.el-button--success').trigger('click')
    await flushPromises()

    expect(handleViewResult).toHaveBeenCalledWith('direction')
  })

  it('does not emit refresh while the real Element Plus loading button is disabled', async () => {
    const summary: RecentTaskSummaryDTO = {
      id: 'task-processing-001',
      taskType: 'novel_direction_generate',
      status: TaskStatus.Processing,
      statusText: '处理中',
      progress: 30,
      currentStep: '正在调用模型',
      resultVersionIds: [],
    }

    wrapper = mount(TaskProgressPanel, {
      attachTo: document.body,
      props: { summary, loading: true },
      global: { plugins: [ElementPlus] },
    })

    const refreshButton = wrapper.findAll('button').find((button) => button.text() === '刷新')
    expect(refreshButton?.attributes('disabled')).toBeDefined()

    await refreshButton?.trigger('click')

    expect(wrapper.emitted('refresh')).toBeUndefined()
  })

  it('does not describe a queued task as a model call or show fake progress', () => {
    wrapper = mount(TaskProgressPanel, {
      attachTo: document.body,
      props: { summary: {
        id: 'task-queued-001', taskType: 'novel_outline_generate',
        status: TaskStatus.Queued, statusText: '等待执行', progress: 0,
        currentStep: '任务已受理', resultVersionIds: [],
      } },
      global: { plugins: [ElementPlus] },
    })

    expect(wrapper.text()).toContain('任务已受理，尚未开始调用模型')
    expect(wrapper.text()).not.toContain('正在调用模型生成内容')
    expect(wrapper.text()).not.toContain('100%')
  })

  it('shows a user-facing stage while the worker has leased a long-running task', () => {
    wrapper = mount(TaskProgressPanel, {
      attachTo: document.body,
      props: { summary: {
        id: 'task-review-processing-001', taskType: 'novel_full_review',
        status: TaskStatus.Processing, statusText: '生成中', progress: 0,
        currentStep: 'worker_leased', resultVersionIds: [],
      } },
      global: { plugins: [ElementPlus] },
    })

    expect(wrapper.text()).toContain('后台已接手，正在准备模型调用')
    expect(wrapper.text()).not.toContain('worker_leased')
    expect(wrapper.text()).not.toContain('100%')
  })

  it('shows an unknown model-call outcome and does not offer automatic retry', () => {
    const reason = '模型调用结果无法确认，可能已产生费用；系统不会自动重试。请核对任务与模型账单后，再决定是否重新生成。'
    const detail: TaskDetailDTO = {
      id: 'task-outcome-unknown-001', taskType: 'novel_outline_generate',
      status: TaskStatus.Failed, statusText: '失败', progress: 0, currentStep: '模型调用结果未确认',
      resultVersionIds: [], novelId: 'novel-001', objectType: 'novel', objectId: 'novel-001',
      statusNote: reason, sourceVersionRefs: {}, conflictScope: null, conflictKey: null,
      retryOfTaskId: null, failureCategory: 'provider_outcome_unknown',
      failureCategoryText: '模型调用结果未确认', errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
      errorMessage: reason, userFailureReason: reason, retryable: false, cancellable: false,
      cancelReason: null, trace: { taskId: 'task-outcome-unknown-001', requestId: null, retryOfTaskId: null },
      nextAction: { type: 'disabled', label: '先核对调用结果', reasonText: reason,
        target: 'disabled', disabled: true, disabledReason: reason, confirmRequired: false, taskType: null },
      createdAt: '2026-10-14T12:00:00.000Z', updatedAt: '2026-10-14T12:03:00.000Z', events: [],
    }

    wrapper = mount(TaskProgressPanel, {
      attachTo: document.body,
      props: { detail },
      global: { plugins: [ElementPlus] },
    })

    expect(wrapper.text()).toContain('可能已产生费用')
    expect(wrapper.text()).toContain('请核对任务与模型账单')
    expect(wrapper.text()).not.toContain('重试任务')
    expect(wrapper.text()).not.toContain('取消任务')
    expect(wrapper.text()).not.toContain('状态 failed')
    expect(wrapper.text().match(/模型调用结果无法确认，可能已产生费用/g)).toHaveLength(1)
  })
})
