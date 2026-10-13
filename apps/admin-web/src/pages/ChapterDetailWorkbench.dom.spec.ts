import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ChapterDetailWorkbench from './ChapterDetailWorkbench.vue'

const mocks = vi.hoisted(() => ({
  getChapterWorkbench: vi.fn(),
  reviseOverlengthChapter: vi.fn(),
  getTaskDetail: vi.fn(),
  cancelTask: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { novelId: 'novel-1', chapterId: 'chapter-5' } }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../modules/novels/services/novelService', () => ({
  getChapterWorkbench: mocks.getChapterWorkbench,
  reviseOverlengthChapter: mocks.reviseOverlengthChapter,
  adoptChapterContentVersion: vi.fn(),
  createImpactAssessment: vi.fn(),
  resolveImpactCase: vi.fn(),
  rewriteChapter: vi.fn(),
  toTrialCandidateRow: (candidate: Record<string, unknown>) => ({
    ...candidate,
    versionLabel: `v${candidate.versionNo}`,
    statusText: '候选版本',
    scoreText: '-',
    gateText: '待复核',
    canSelectByStatus: true,
    canSelect: false,
    selectDisabledReason: '待内容复核',
    lengthGate: candidate.lengthGate,
  }),
}))

vi.mock('../modules/novels/services/taskService', () => ({
  getTaskDetail: mocks.getTaskDetail,
  cancelTask: mocks.cancelTask,
  retryTask: vi.fn(),
}))

const original = {
  id: 'original-1', chapterId: 'chapter-5', versionNo: 1,
  sourceType: 'ai_overlength_original', title: '第5章', content: '原稿',
  first300Summary: '超长原稿',
  lengthGate: { status: 'too_long', statusText: '超出上限', tagType: 'danger',
    actualText: '2300 字', rangeText: '850-1150 字' },
}
const revised = {
  ...original, id: 'revision-1', versionNo: 2, sourceType: 'ai_overlength_revision',
  content: '精简稿', first300Summary: '精简候选',
  lengthGate: { ...original.lengthGate, status: 'pass', statusText: '合格', tagType: 'success', actualText: '1150 字' },
}
const workbench = (candidateVersions: unknown[], recentTask: unknown = null) => ({
  chapter: { chapterNo: 5, title: '第5章', mainStatus: 'blocked', statusNote: '超长待处理', currentContentVersionId: null },
  recommendedAction: { reasonText: '检查超长候选' },
  recentTask, currentContent: null, candidateVersions,
  candidateCompares: {}, featureCard: null, reviewIssues: [], longTermMemory: null, impactCases: [],
})

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
  mocks.getChapterWorkbench.mockReset()
  mocks.reviseOverlengthChapter.mockReset()
  mocks.getTaskDetail.mockReset()
  mocks.cancelTask.mockReset()
})

describe('ChapterDetailWorkbench overlength recovery', () => {
  it('starts one explicit revision and keeps the saved result visible after remount', async () => {
    let saved = false
    mocks.getChapterWorkbench.mockImplementation(async () => workbench(saved ? [original, revised] : [original]))
    let resolveRevision: ((value: unknown) => void) | undefined
    mocks.reviseOverlengthChapter.mockImplementation(() => new Promise((resolve) => { resolveRevision = resolve }))
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)

    wrapper = mount(ChapterDetailWorkbench, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const reviseButton = wrapper.findAll('button').find((button) => button.text() === '精简一次')
    expect(reviseButton?.exists()).toBe(true)
    await reviseButton!.trigger('click')
    await flushPromises()
    expect(mocks.reviseOverlengthChapter).toHaveBeenCalledWith('novel-1', 'chapter-5', { sourceCandidateVersionId: 'original-1' })
    expect(reviseButton?.attributes('disabled')).toBeDefined()

    saved = true
    resolveRevision?.({ candidate: revised })
    await flushPromises()
    expect(wrapper.text()).toContain('精简候选已保留，待内容复核后才能采用。')
    expect(wrapper.findAll('button').find((button) => button.text() === '精简一次')?.attributes('disabled')).toBeDefined()

    wrapper.unmount()
    wrapper = mount(ChapterDetailWorkbench, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.text()).toContain('精简候选已保留，待内容复核后才能采用。')
    expect(mocks.reviseOverlengthChapter).toHaveBeenCalledTimes(1)
  })

  it('opens the processing task and lets the user cancel waiting', async () => {
    const summary = { id: 'revision-task-1', taskType: 'chapter_overlength_revise',
      status: 'processing', statusText: '生成中', progress: 30, currentStep: '正在调用模型', resultVersionIds: [] }
    const detail = { ...summary, trace: { taskId: summary.id, requestId: 'request-1', retryOfTaskId: null },
      events: [], cancellable: true, retryable: false, nextAction: { reasonText: '等待模型结果' } }
    mocks.getChapterWorkbench.mockResolvedValue(workbench([original], summary))
    mocks.getTaskDetail.mockResolvedValueOnce(detail).mockResolvedValueOnce({ ...detail,
      status: 'cancelled', statusText: '已取消', cancellable: false })
    mocks.cancelTask.mockResolvedValue({ task: { ...detail, status: 'cancelled' } })
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)

    wrapper = mount(ChapterDetailWorkbench, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.findAll('button').find((button) => button.text() === '精简一次')?.attributes('disabled')).toBeDefined()
    await wrapper.findAll('button').find((button) => button.text() === '查看详情')!.trigger('click')
    await flushPromises()
    expect(mocks.getTaskDetail).toHaveBeenCalledWith(summary.id)
    const cancelButton = [...document.body.querySelectorAll('button')].find((button) => button.textContent?.trim() === '取消任务')
    expect(cancelButton).toBeDefined()
    cancelButton?.click()
    await flushPromises()
    expect(mocks.cancelTask).toHaveBeenCalledWith(summary.id, { reason: '用户取消章节任务等待' })
  })

  it('continues reading a processing revision after the page is reopened', async () => {
    let finished = false
    const summary = { id: 'revision-task-2', taskType: 'chapter_overlength_revise',
      status: 'processing', statusText: '生成中', progress: 30, currentStep: '正在调用模型', resultVersionIds: [] }
    mocks.getChapterWorkbench.mockImplementation(async () => workbench(finished ? [original, revised] : [original],
      finished ? { ...summary, status: 'waiting_confirmation', statusText: '待复核' } : summary))
    const interval = vi.spyOn(globalThis, 'setInterval')
    wrapper = mount(ChapterDetailWorkbench, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const poll = interval.mock.calls.find((call) => call[1] === 10000)?.[0] as (() => void) | undefined
    expect(poll).toBeDefined()
    finished = true
    poll?.()
    await flushPromises()
    expect(mocks.getChapterWorkbench).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('精简候选已保留，待内容复核后才能采用。')
  })
})
