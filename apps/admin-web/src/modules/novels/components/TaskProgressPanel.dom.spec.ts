import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskStatus, type RecentTaskSummaryDTO } from '@ai-shortvideo/shared'
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
})
