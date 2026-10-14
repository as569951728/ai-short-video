import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import ChapterDetailWorkbench from './ChapterDetailWorkbench.vue'

const mocks = vi.hoisted(() => ({
  getChapterWorkbench: vi.fn(),
  reviseOverlengthChapter: vi.fn(),
  getTaskDetail: vi.fn(),
  cancelTask: vi.fn(),
  submitAsync: vi.fn(),
}))

vi.mock('../modules/novels/composables/useNovelAsyncTransport', () => ({
  useNovelAsyncTransport: () => ({
    phase: ref('idle'), message: ref(''), blocksNewSubmission: ref(false),
    activeIntent: ref(null), restore: async () => undefined, taskUpdated: async () => undefined,
    submit: mocks.submitAsync,
  }),
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
  mocks.submitAsync.mockReset()
})

describe('ChapterDetailWorkbench overlength recovery', () => {
  it('starts one explicit revision and keeps the saved result visible after remount', async () => {
    let saved = false
    mocks.getChapterWorkbench.mockImplementation(async () => workbench(saved ? [original, revised] : [original]))
    let resolveRevision: ((value: unknown) => void) | undefined
    mocks.reviseOverlengthChapter.mockImplementation(() => new Promise((resolve) => { resolveRevision = resolve }))
    mocks.submitAsync.mockResolvedValue({ kind: 'legacy' })
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

  it('returns promptly to task tracking when async revision is accepted', async () => {
    let submitted = false
    mocks.getChapterWorkbench.mockImplementation(async () => workbench([original], submitted ? {
      id: 'revision-task-async', taskType: 'chapter_overlength_revise', status: 'queued',
      statusText: '等待执行', progress: null, currentStep: '等待执行', resultVersionIds: [],
    } : null))
    mocks.submitAsync.mockImplementation(async () => {
      submitted = true
      return { kind: 'task', taskId: 'revision-task-async' }
    })
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    wrapper = mount(ChapterDetailWorkbench, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === '精简一次')!.trigger('click')
    await flushPromises()
    expect(mocks.submitAsync).toHaveBeenCalledWith('chapter_overlength_revise', {
      sourceCandidateVersionId: 'original-1',
    })
    expect(mocks.reviseOverlengthChapter).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('等待执行')
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
