import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NovelCreationStage, StageStatus, StaleLevel, TaskStatus, VersionStatus } from '@ai-shortvideo/shared'
import NovelDetailWorkbench from './NovelDetailWorkbench.vue'

const mocks = vi.hoisted(() => ({
  route: {
    path: '/novels/novel-dom-001',
    params: { novelId: 'novel-dom-001' },
    query: {} as Record<string, string>,
  },
  routerPush: vi.fn(),
  getNovelDetail: vi.fn(),
  getTaskDetail: vi.fn(),
  adoptDirection: vi.fn(),
  editDirectionCandidate: vi.fn(),
  fuseDirections: vi.fn(),
  generateDirections: vi.fn(),
  generateOutline: vi.fn(),
  optimizeDirection: vi.fn(),
  startFullReview: vi.fn(),
  generateTrial: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('../modules/novels/services/taskService', () => ({
  cancelTask: vi.fn(),
  getTaskDetail: mocks.getTaskDetail,
  retryTask: vi.fn(),
}))

vi.mock('../modules/novels/services/novelService', () => {
  const noopAction = vi.fn().mockResolvedValue({})
  return {
    adoptChapterPlan: noopAction,
    adoptDirection: mocks.adoptDirection,
    adoptOutline: noopAction,
    adoptSetting: noopAction,
    adoptStageOutline: noopAction,
    confirmCompletion: noopAction,
    confirmVideoReadiness: noopAction,
    confirmTrial: noopAction,
    editDirectionCandidate: mocks.editDirectionCandidate,
    editStructureAsset: noopAction,
    forcePassFullReview: noopAction,
    fuseDirections: mocks.fuseDirections,
    generateBodyBatch: noopAction,
    generateChapterPlan: noopAction,
    generateDirections: mocks.generateDirections,
    generateOutline: mocks.generateOutline,
    generateSetting: noopAction,
    generateStageOutline: noopAction,
    generateTrial: mocks.generateTrial,
    getNovelDetail: mocks.getNovelDetail,
    optimizeDirection: mocks.optimizeDirection,
    recheckVideoReadiness: noopAction,
    resolveFullReviewIssue: noopAction,
    startFullReview: mocks.startFullReview,
    updateChapterWordTargets: noopAction,
    toDirectionCandidateRow: (candidate: Record<string, unknown>) => ({
      id: candidate.id,
      title: candidate.title,
      versionLabel: 'v1',
      statusKey: candidate.status ?? VersionStatus.Candidate,
      status: candidate.status === VersionStatus.Current
        ? '当前版本'
        : candidate.status === VersionStatus.Historical
          ? '历史版本'
          : candidate.status === VersionStatus.Stale
            ? '已过期'
            : candidate.status === VersionStatus.Discarded
              ? '已放弃'
              : '候选版本',
      lowScoreRequiresConfirm: true,
      scoreText: '58',
      riskLevelText: '高风险',
      logline: '一句话方向',
      coreHook: '前三秒钩子',
      primaryReason: '推荐理由',
      videoPotential: '视频化表达',
      riskTags: ['低分采用需确认'],
      sellingPoints: ['短视频钩子'],
      audienceAppeal: '爽文用户',
      sourceVersionIds: candidate.sourceVersionIds ?? [],
      changeReason: candidate.changeReason ?? '',
      canAdopt: (candidate.status ?? VersionStatus.Candidate) === VersionStatus.Candidate && candidate.staleLevel !== StaleLevel.HardStale,
    }),
    toNovelChapterPlanRow: (chapter: unknown) => chapter,
    toStructureAssetRow: (asset: Record<string, unknown>) => ({
      id: asset.id,
      title: asset.title,
      objectType: asset.objectType,
      typeText: '小说设定',
      versionLabel: 'v1',
      statusKey: asset.status ?? VersionStatus.Candidate,
      scoreText: '82',
      highRiskRequiresConfirm: false,
      status: asset.status === VersionStatus.Current
        ? '当前版本'
        : asset.status === VersionStatus.Historical
          ? '历史版本'
          : asset.status === VersionStatus.Stale
            ? '已过期'
            : asset.status === VersionStatus.Discarded
              ? '已放弃'
              : '候选版本',
      summary: asset.summary ?? '设定候选摘要',
      primaryReason: '设定推荐理由',
      sections: asset.sections ?? [{ body: '设定结构内容' }],
      stages: asset.stages ?? [],
      chapters: asset.chapters ?? [],
      chapterCount: asset.chapterCount ?? 0,
      riskTags: [],
      sourceVersionIds: asset.sourceVersionIds ?? [],
      changeReason: asset.changeReason ?? '',
      canAdopt: (asset.status ?? VersionStatus.Candidate) === VersionStatus.Candidate && asset.staleLevel !== StaleLevel.HardStale,
    }),
    toTrialCandidateRow: (candidate: unknown) => candidate,
    toTrialChapterResultRow: (result: unknown) => result,
  }
})

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  mocks.routerPush.mockReset()
  mocks.getNovelDetail.mockReset()
  mocks.getTaskDetail.mockReset()
  mocks.adoptDirection.mockReset()
  mocks.editDirectionCandidate.mockReset()
  mocks.fuseDirections.mockReset()
  mocks.generateDirections.mockReset()
  mocks.generateOutline.mockReset()
  mocks.optimizeDirection.mockReset()
  mocks.startFullReview.mockReset()
  mocks.generateTrial.mockReset()
  localStorage.clear()
  sessionStorage.clear()
  vi.useRealTimers()
})

beforeEach(() => {
  mocks.route.query = {}
  mocks.routerPush.mockResolvedValue(undefined)
})

describe('NovelDetailWorkbench DOM behavior', () => {
  it('sets real loading state when the refresh button is clicked instead of treating MouseEvent as silent=true', async () => {
    mocks.getNovelDetail.mockResolvedValueOnce(createNovelDetail())
    wrapper = mount(NovelDetailWorkbench, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()

    let resolveRefresh!: (value: unknown) => void
    mocks.getNovelDetail.mockReturnValueOnce(new Promise((resolve) => {
      resolveRefresh = resolve
    }))

    const refreshButton = wrapper.findAll('button').find((button) => button.text() === '刷新')
    await refreshButton?.trigger('click')
    await nextTick()

    expect(mocks.getNovelDetail).toHaveBeenCalledTimes(2)
    expect(refreshButton?.attributes('disabled')).toBeDefined()

    resolveRefresh(createNovelDetail())
    await flushPromises()
  })

  it('opens the existing teleported adopt dialog and confirms through the original API path', async () => {
    mocks.route.query = { step: 'direction' }
    mocks.getNovelDetail.mockResolvedValue(createNovelDetail({
      directionCandidates: [{ id: 'direction-low-1', title: '低分方向候选' }],
    }))
    mocks.adoptDirection.mockResolvedValue({})

    wrapper = mount(NovelDetailWorkbench, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()

    const adoptButton = wrapper.findAll('button').find((button) => button.text() === '采用')
    await adoptButton?.trigger('click')
    await nextTick()
    await flushPromises()

    const dialog = document.body.querySelector('.el-dialog') as HTMLElement | null
    expect(dialog?.textContent).toContain('采用方向')
    expect(document.body.contains(dialog)).toBe(true)
    expect(getAdoptDialogModelValue()).toBe(true)
    expect(document.body.textContent).toContain('该方向评分偏低')
    expect(dialog?.contains(document.activeElement)).toBe(true)

    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement
    textarea.value = '风险可接受，保留开篇强钩子方向'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    const confirmButton = getAdoptDialog().findAll('button').find((button) => button.text() === '确认采用')
    await confirmButton?.trigger('click')
    await flushPromises()
    await waitForDialogClose()

    expectAdoptDirectionRequest({
      confirmLowScore: true,
      currentVersionId: null,
      idempotencyKey: expect.stringMatching(/^direction-adopt-[0-9a-f-]{36}$/),
      pageVersionSnapshot: {
        seenAt: expect.any(String),
        seenCandidateVersionId: 'direction-low-1',
      },
      reason: '风险可接受，保留开篇强钩子方向',
    })
    expectAdoptDialogClosed()
  })

  it('closes the existing adopt dialog on cancel without calling the API', async () => {
    mocks.route.query = { step: 'direction' }
    mocks.getNovelDetail.mockResolvedValue(createNovelDetail({
      directionCandidates: [{ id: 'direction-low-1', title: '低分方向候选' }],
    }))

    wrapper = mount(NovelDetailWorkbench, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()

    const adoptButton = wrapper.findAll('button').find((button) => button.text() === '采用')
    adoptButton?.element.focus()
    await adoptButton?.trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('确认采用')
    expect(getAdoptDialogModelValue()).toBe(true)

    const cancelButton = getAdoptDialog().findAll('button').find((button) => button.text() === '取消')
    await cancelButton?.trigger('click')
    await flushPromises()
    await waitForDialogClose()

    expect(mocks.adoptDirection).not.toHaveBeenCalled()
    expectAdoptDialogClosed()
  })

  it('uses task resultVersionIds instead of the first pool item when viewing a structure result', async () => {
    vi.useFakeTimers()
    mocks.getNovelDetail.mockResolvedValue(createNovelDetail({
      structureCandidates: [
        { id: 'setting-distractor-1', title: '较早设定候选', objectType: 'setting' },
        { id: 'setting-candidate-1', title: '本次设定候选', objectType: 'setting' },
      ],
      recentTask: {
        id: 'task-setting-1',
        taskType: 'novel_setting_generate',
        status: TaskStatus.Completed,
        statusText: '已完成',
        progress: 100,
        currentStep: '设定已生成',
        resultVersionIds: ['setting-candidate-1'],
      },
    }))
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})

    wrapper = mount(NovelDetailWorkbench, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()

    const viewResultButton = wrapper.findAll('button').find((button) => button.text() === '查看设定候选')
    await viewResultButton?.trigger('click')
    await flushPromises()
    await nextTick()

    const target = document.getElementById('structure-candidate-setting-candidate-1')
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(scrollIntoView.mock.instances).toContain(target)
    expect(scrollIntoView.mock.instances).not.toContain(document.getElementById('structure-candidate-setting-distractor-1'))

    vi.runOnlyPendingTimers()
    scrollIntoView.mockRestore()
  })

  it('prioritizes the explicitly opened older task over newer recent task results', async () => {
    vi.useFakeTimers()
    mocks.route.query = { step: 'direction' }
    mocks.getNovelDetail.mockResolvedValue(createNovelDetail({
      directionCandidates: [
        { id: 'direction-newest', title: '最新任务候选' },
        { id: 'direction-older', title: '较旧任务候选' },
      ],
      recentTask: createRecentTask('task-older', 'direction-older'),
      recentTasks: [createRecentTask('task-newest', 'direction-newest'), createRecentTask('task-older', 'direction-older')],
    }))
    mocks.getTaskDetail.mockResolvedValue(createTaskDetail('task-older', 'direction-older'))
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})

    wrapper = mount(NovelDetailWorkbench, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()

    await wrapper.findAll('button').find((button) => button.text() === '任务详情')?.trigger('click')
    await flushPromises()
    expect(mocks.getTaskDetail).toHaveBeenCalledWith('task-older')
    const viewButtons = wrapper.findAll('button').filter((button) => button.text() === '查看方向候选')
    await viewButtons.at(-1)?.trigger('click')
    await flushPromises()
    await nextTick()

    const olderTarget = document.getElementById('direction-candidate-direction-older')
    expect(scrollIntoView.mock.instances).toContain(olderTarget)
    expect(scrollIntoView.mock.instances).not.toContain(document.getElementById('direction-candidate-direction-newest'))
    expect(olderTarget?.classList.contains('result-focus-card')).toBe(true)

    vi.runOnlyPendingTimers()
    scrollIntoView.mockRestore()
  })

  it('waits for cross-step routing before restoring the outline sub-step and focusing its exact result', async () => {
    vi.useFakeTimers()
    mocks.route.query = { step: 'setting' }
    let resolveNavigation!: () => void
    mocks.routerPush.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolveNavigation = resolve
    }))
    const newestTask = createRecentTask('task-stage-newest', 'stage-newest', 'novel_stage_outline_generate')
    const olderTask = createRecentTask('task-outline-older', 'outline-older', 'novel_outline_generate')
    mocks.getNovelDetail.mockResolvedValue(createNovelDetail({
      creationStage: NovelCreationStage.Outline,
      currentAssets: { direction: {}, setting: {}, outline: { id: 'outline-current' }, stageOutline: null, chapterPlan: null },
      structureCandidates: [
        createStructureCandidate('stage-newest', '最新阶段大纲', { objectType: 'stage_outline' }),
        createStructureCandidate('outline-older', '较旧全书大纲'),
      ],
      recentTask: olderTask,
      recentTasks: [newestTask, olderTask],
    }))
    mocks.getTaskDetail.mockResolvedValue(createTaskDetail('task-outline-older', 'outline-older', 'novel_outline_generate'))
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})

    wrapper = mount(NovelDetailWorkbench, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(document.getElementById('structure-candidate-outline-older')).toBeNull()

    await wrapper.findAll('button').find((button) => button.text() === '任务详情')?.trigger('click')
    await flushPromises()
    expect(mocks.getTaskDetail).toHaveBeenCalledWith('task-outline-older')
    const viewButtons = wrapper.findAll('button').filter((button) => button.text() === '查看大纲候选')
    await viewButtons.at(-1)?.trigger('click')
    await nextTick()
    expect(document.getElementById('structure-candidate-outline-older')).toBeNull()

    resolveNavigation()
    await flushPromises()
    await nextTick()

    const target = document.getElementById('structure-candidate-outline-older')
    expect(target).not.toBeNull()
    expect(scrollIntoView.mock.instances).toContain(target)
    expect(target?.classList.contains('result-focus-card')).toBe(true)

    vi.runOnlyPendingTimers()
    scrollIntoView.mockRestore()
  })

  it('focuses the exact direction candidate returned by generation', async () => {
    vi.useFakeTimers()
    mocks.route.query = { step: 'direction' }
    mocks.getNovelDetail
      .mockResolvedValueOnce(createNovelDetail())
      .mockResolvedValueOnce(createNovelDetail({
        directionCandidates: [createDirectionCandidate('direction-existing', '既有候选'), createDirectionCandidate('direction-generated', '本次生成候选')],
      }))
    mocks.generateDirections.mockResolvedValue(createDirectionActionResult('direction-generated'))
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})

    wrapper = mount(NovelDetailWorkbench, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === '生成 3-5 个方向候选')?.trigger('click')
    await flushPromises()

    expectFocusedResult(scrollIntoView, 'direction-candidate-direction-generated', 'direction-candidate-direction-existing')
    vi.advanceTimersByTime(2199)
    expect(document.getElementById('direction-candidate-direction-generated')?.classList.contains('result-focus-card')).toBe(true)
    vi.advanceTimersByTime(1)
    await nextTick()
    expect(document.getElementById('direction-candidate-direction-generated')?.classList.contains('result-focus-card')).toBe(false)
    scrollIntoView.mockRestore()
  })

  it('focuses the exact new direction candidates returned by fusion, optimization, and manual edit', async () => {
    vi.useFakeTimers()
    mocks.route.query = { step: 'direction' }
    const baseCandidates = [createDirectionCandidate('direction-a', '候选 A'), createDirectionCandidate('direction-b', '候选 B')]
    const resultCandidates = [
      ...baseCandidates,
      createDirectionCandidate('direction-fused', '融合候选', { sourceVersionIds: ['direction-a', 'direction-b'], changeReason: '融合两版的核心卖点。' }),
      createDirectionCandidate('direction-optimized', '优化候选', { sourceVersionIds: ['direction-a'], changeReason: '强化前三秒钩子。' }),
      createDirectionCandidate('direction-edited', '编辑候选', { sourceVersionIds: ['direction-b'], changeReason: '人工修正目标读者。' }),
    ]
    mocks.getNovelDetail.mockResolvedValueOnce(createNovelDetail({ directionCandidates: baseCandidates }))
    mocks.fuseDirections.mockResolvedValue(createDirectionActionResult('direction-fused'))
    mocks.optimizeDirection.mockResolvedValue(createDirectionActionResult('direction-optimized'))
    mocks.editDirectionCandidate.mockResolvedValue(createDirectionActionResult('direction-edited'))
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})

    wrapper = mount(NovelDetailWorkbench, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()

    const checkboxes = wrapper.findAllComponents({ name: 'ElCheckbox' })
    checkboxes[0].vm.$emit('change', true)
    checkboxes[1].vm.$emit('change', true)
    await nextTick()
    await wrapper.findAll('button').find((button) => button.text() === '融合所选方向')?.trigger('click')
    await flushPromises()
    mocks.getNovelDetail.mockResolvedValueOnce(createNovelDetail({ directionCandidates: resultCandidates }))
    await getDialog('融合所选方向').findAll('button').find((button) => button.text() === '生成融合候选')?.trigger('click')
    await flushPromises()
    expectFocusedResult(scrollIntoView, 'direction-candidate-direction-fused', 'direction-candidate-direction-a')

    await wrapper.find('#direction-candidate-direction-a').findAll('button').find((button) => button.text() === '按要求优化')?.trigger('click')
    await flushPromises()
    await setOpenDialogTextarea('按要求优化方向', '强化前三秒钩子并减少术语。')
    mocks.getNovelDetail.mockResolvedValueOnce(createNovelDetail({ directionCandidates: resultCandidates }))
    await getDialog('按要求优化方向').findAll('button').find((button) => button.text() === '生成优化候选')?.trigger('click')
    await flushPromises()
    expectFocusedResult(scrollIntoView, 'direction-candidate-direction-optimized', 'direction-candidate-direction-a')

    await wrapper.find('#direction-candidate-direction-b').findAll('button').find((button) => button.text() === '编辑')?.trigger('click')
    await flushPromises()
    mocks.getNovelDetail.mockResolvedValueOnce(createNovelDetail({ directionCandidates: resultCandidates }))
    await getDialog('编辑方向候选').findAll('button').find((button) => button.text() === '保存为新候选')?.trigger('click')
    await flushPromises()
    expectFocusedResult(scrollIntoView, 'direction-candidate-direction-edited', 'direction-candidate-direction-b')
    expect(document.body.textContent).toContain('来源版本')
    expect(document.body.textContent).toContain('候选 B v1')
    expect(document.body.textContent).toContain('人工修正目标读者。')

    vi.runOnlyPendingTimers()
    scrollIntoView.mockRestore()
  })

  it('focuses exact structure results after generation and continue optimization', async () => {
    vi.useFakeTimers()
    mocks.route.query = { step: 'outline' }
    const initial = createNovelDetail({
      creationStage: NovelCreationStage.Outline,
      currentAssets: { direction: {}, setting: { id: 'setting-current' }, outline: null, stageOutline: null, chapterPlan: null },
      structureCandidates: [],
    })
    const generatedAssets = [
      createStructureCandidate('outline-existing', '既有大纲'),
      createStructureCandidate('outline-generated', '本次大纲', { summary: '来源摘要', sections: [{ body: '来源结构' }] }),
    ]
    const optimizedAssets = [
      ...generatedAssets,
      createStructureCandidate('outline-optimized', '优化大纲', {
        summary: '优化后的摘要',
        sections: [{ body: '强化后的冲突结构' }],
        sourceVersionIds: ['outline-generated'],
        changeReason: '强化冲突层次并提前结局伏笔。',
      }),
    ]
    mocks.getNovelDetail.mockResolvedValueOnce(initial)
    mocks.generateOutline
      .mockResolvedValueOnce(createStructureActionResult('outline-generated'))
      .mockResolvedValueOnce(createStructureActionResult('outline-optimized'))
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})

    wrapper = mount(NovelDetailWorkbench, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    mocks.getNovelDetail.mockResolvedValueOnce(createNovelDetail({ ...initial, structureCandidates: generatedAssets }))
    await wrapper.findAll('button').find((button) => button.text() === '生成全书大纲')?.trigger('click')
    await flushPromises()
    expectFocusedResult(scrollIntoView, 'structure-candidate-outline-generated', 'structure-candidate-outline-existing')
    scrollIntoView.mockClear()

    await wrapper.find('#structure-candidate-outline-generated').findAll('button').find((button) => button.text() === '继续优化')?.trigger('click')
    await flushPromises()
    mocks.getNovelDetail.mockResolvedValueOnce(createNovelDetail({ ...initial, structureCandidates: optimizedAssets }))
    await getDialog('继续优化小说设定候选').findAll('button').find((button) => button.text() === '生成优化候选')?.trigger('click')
    await flushPromises()
    expectFocusedResult(scrollIntoView, 'structure-candidate-outline-optimized', 'structure-candidate-outline-generated')
    expect(mocks.generateOutline).toHaveBeenLastCalledWith('novel-dom-001', {
      optimization: {
        sourceVersionId: 'outline-generated',
        instruction: expect.stringContaining('强化冲突层次'),
      },
    })
    expect(document.body.textContent).toContain('来源版本')
    expect(document.body.textContent).toContain('本次大纲 v1')
    expect(document.body.textContent).toContain('优化目标')
    expect(document.body.textContent).toContain('强化冲突层次并提前结局伏笔。')
    expect(document.body.textContent).toContain('摘要内容已调整')
    expect(document.body.textContent).toContain('结构段落内容已调整')

    vi.runOnlyPendingTimers()
    scrollIntoView.mockRestore()
  })

  it('focuses the exact trial candidate returned by chapter-one generation', async () => {
    vi.useFakeTimers()
    mocks.route.query = { step: 'trial' }
    const generatedRun = createTrialRunFixture()
    generatedRun.chapterOneCandidates = [
      { ...generatedRun.chapterOneCandidates[0], id: 'trial-distractor', title: '较早试写候选' },
      { ...generatedRun.chapterOneCandidates[0], id: 'trial-generated', title: '本次试写候选' },
    ]
    mocks.getNovelDetail
      .mockResolvedValueOnce(createNovelDetail({
        creationStage: NovelCreationStage.Trial,
        currentAssets: { direction: {}, setting: {}, outline: {}, stageOutline: {}, chapterPlan: { id: 'chapter-plan-current' } },
      }))
      .mockResolvedValueOnce(createNovelDetail({
        creationStage: NovelCreationStage.Trial,
        currentAssets: { direction: {}, setting: {}, outline: {}, stageOutline: {}, chapterPlan: { id: 'chapter-plan-current' } },
        latestTrialRun: generatedRun,
      }))
    mocks.generateTrial.mockResolvedValue({ task: { resultVersionIds: ['trial-generated'] } })
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})

    wrapper = mount(NovelDetailWorkbench, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === '生成第 1 章候选')?.trigger('click')
    await flushPromises()

    expectFocusedResult(scrollIntoView, 'trial-candidate-trial-generated', 'trial-candidate-trial-distractor')
    vi.advanceTimersByTime(2200)
    await nextTick()
    expect(document.getElementById('trial-candidate-trial-generated')?.classList.contains('result-focus-card')).toBe(false)
    scrollIntoView.mockRestore()
  })

  it('shows one current direction, historicalizes the previous version, removes non-candidate controls, and enters setting after adopt', async () => {
    mocks.route.query = { step: 'direction' }
    const candidate = createDirectionCandidate('direction-next', '待采用方向')
    mocks.getNovelDetail
      .mockResolvedValueOnce(createNovelDetail({ directionCandidates: [candidate] }))
      .mockResolvedValueOnce(createNovelDetail({
        creationStage: NovelCreationStage.Setting,
        currentAssets: { direction: { id: 'direction-next', title: '正式方向' }, setting: null, outline: null, stageOutline: null, chapterPlan: null },
        directionCandidates: [
          createDirectionCandidate('direction-next', '正式方向', { status: VersionStatus.Current }),
          createDirectionCandidate('direction-previous', '旧方向', { status: VersionStatus.Historical }),
        ],
      }))
    mocks.adoptDirection.mockResolvedValue(createDirectionActionResult('direction-next'))

    wrapper = mount(NovelDetailWorkbench, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    await wrapper.find('#direction-candidate-direction-next').findAll('button').find((button) => button.text() === '采用')?.trigger('click')
    await flushPromises()
    await setOpenDialogTextarea('采用方向', '采用该方向作为后续设定输入。')
    await getDialog('采用方向').findAll('button').find((button) => button.text() === '确认采用')?.trigger('click')
    await flushPromises()
    expect(mocks.routerPush).toHaveBeenLastCalledWith(expect.objectContaining({ query: expect.objectContaining({ step: 'setting' }) }))

    await wrapper.findAll('button.major-step').find((button) => button.text().includes('方向确认'))?.trigger('click')
    await nextTick()

    const currentCard = wrapper.find('#direction-candidate-direction-next')
    const historicalCard = wrapper.find('#direction-candidate-direction-previous')
    expect(wrapper.findAll('.direction-card').filter((card) => card.text().includes('当前版本'))).toHaveLength(1)
    expect(currentCard.text()).toContain('唯一的当前正式方向')
    expect(historicalCard.text()).toContain('历史版本')
    expect(currentCard.find('.el-checkbox').exists()).toBe(false)
    expect(historicalCard.find('.el-checkbox').exists()).toBe(false)
    expect(currentCard.findAll('button').map((button) => button.text())).not.toContain('采用')
    expect(currentCard.findAll('button').map((button) => button.text())).not.toContain('编辑')
    expect(historicalCard.findAll('button').map((button) => button.text())).toEqual(['详情'])
  })

  it('optimizes the adopted current direction and focuses the exact new candidate', async () => {
    vi.useFakeTimers()
    mocks.route.query = { step: 'direction' }
    const current = createDirectionCandidate('direction-current', '正式方向', { status: VersionStatus.Current })
    const optimized = createDirectionCandidate('direction-current-optimized', '正式方向优化稿', {
      sourceVersionIds: ['direction-current'],
      changeReason: '强化采用后的开篇钩子。',
    })
    mocks.getNovelDetail
      .mockResolvedValueOnce(createNovelDetail({
        creationStage: NovelCreationStage.Setting,
        currentAssets: { direction: { id: current.id, title: current.title }, setting: null, outline: null, stageOutline: null, chapterPlan: null },
        directionCandidates: [current],
      }))
      .mockResolvedValueOnce(createNovelDetail({
        creationStage: NovelCreationStage.Direction,
        currentAssets: { direction: { id: current.id, title: current.title }, setting: null, outline: null, stageOutline: null, chapterPlan: null },
        directionCandidates: [current, optimized],
      }))
    mocks.optimizeDirection.mockResolvedValue(createDirectionActionResult(optimized.id))
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})

    wrapper = mount(NovelDetailWorkbench, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    await wrapper.find('#direction-candidate-direction-current').findAll('button').find((button) => button.text() === '基于当前优化')?.trigger('click')
    await setOpenDialogTextarea('按要求优化方向', '强化采用后的开篇钩子。')
    await getDialog('按要求优化方向').findAll('button').find((button) => button.text() === '生成优化候选')?.trigger('click')
    await flushPromises()

    expect(mocks.optimizeDirection).toHaveBeenCalledWith('novel-dom-001', 'direction-current', {
      instruction: '强化采用后的开篇钩子。',
    })
    expectFocusedResult(scrollIntoView, 'direction-candidate-direction-current-optimized', 'direction-candidate-direction-current')

    vi.runOnlyPendingTimers()
    scrollIntoView.mockRestore()
  })

  it('separates historical, stale, discarded, and hard-stale candidate semantics', async () => {
    mocks.route.query = { step: 'direction' }
    mocks.getNovelDetail.mockResolvedValue(createNovelDetail({
      creationStage: NovelCreationStage.Outline,
      currentAssets: { direction: { id: 'direction-current' }, setting: { id: 'setting-current' }, outline: null, stageOutline: null, chapterPlan: null },
      directionCandidates: [
        createDirectionCandidate('direction-historical', '历史方向', { status: VersionStatus.Historical }),
        createDirectionCandidate('direction-stale', '过期方向', { status: VersionStatus.Stale }),
        createDirectionCandidate('direction-discarded', '放弃方向', { status: VersionStatus.Discarded }),
        createDirectionCandidate('direction-hard-stale', '失效方向', { staleLevel: StaleLevel.HardStale }),
      ],
      structureCandidates: [
        createStructureCandidate('outline-historical', '历史大纲', { status: VersionStatus.Historical }),
        createStructureCandidate('outline-stale', '过期大纲', { status: VersionStatus.Stale }),
        createStructureCandidate('outline-discarded', '放弃大纲', { status: VersionStatus.Discarded }),
        createStructureCandidate('outline-hard-stale', '失效大纲', { staleLevel: StaleLevel.HardStale }),
      ],
    }))

    wrapper = mount(NovelDetailWorkbench, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()

    expect(wrapper.find('#direction-candidate-direction-historical').text()).toContain('这是历史版本')
    expect(wrapper.find('#direction-candidate-direction-stale').text()).toContain('这是已过期版本')
    expect(wrapper.find('#direction-candidate-direction-discarded').text()).toContain('这个候选已放弃')
    expect(wrapper.find('#direction-candidate-direction-hard-stale').text()).toContain('这个候选已失效')
    expect(wrapper.find('#direction-candidate-direction-hard-stale').text()).toContain('失效候选')

    await wrapper.findAll('button.major-step').find((button) => button.text().includes('大纲设计'))?.trigger('click')
    await flushPromises()

    expect(wrapper.find('#structure-candidate-outline-historical').text()).toContain('这是历史版本')
    expect(wrapper.find('#structure-candidate-outline-stale').text()).toContain('这是已过期版本')
    expect(wrapper.find('#structure-candidate-outline-discarded').text()).toContain('这个候选已放弃')
    expect(wrapper.find('#structure-candidate-outline-hard-stale').text()).toContain('这个候选已失效')
    expect(wrapper.find('#structure-candidate-outline-hard-stale').text()).toContain('失效候选')
  })

  it('passes high-risk trial confirmation reason through the existing generate trial action', async () => {
    mocks.route.query = { step: 'trial' }
    mocks.getNovelDetail.mockResolvedValue(createNovelDetail({
      creationStage: NovelCreationStage.Trial,
      stageStatus: StageStatus.WaitingUser,
      statusSummary: {
        displayStatusText: '试写调试',
        recommendedAction: { type: 'select_trial_chapter_one', label: '选择第1章候选', reason: '选择候选继续试写' },
      },
      latestTrialRun: createTrialRunFixture(),
    }))
    mocks.generateTrial.mockResolvedValue({})
    const promptSpy = vi.spyOn(ElMessageBox, 'prompt').mockResolvedValue({
      value: '人工确认该候选风险，继续生成第2-3章用于试写总评。',
      action: 'confirm',
    } as any)

    wrapper = mount(NovelDetailWorkbench, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()

    const selectButton = wrapper.findAll('button').find((button) => button.text() === '选这个继续试写')
    await selectButton?.trigger('click')
    await flushPromises()

    expect(promptSpy).toHaveBeenCalledTimes(1)
    expect(mocks.generateTrial).toHaveBeenCalledTimes(1)
    expect(mocks.generateTrial.mock.calls[0]).toEqual([
      'novel-dom-001',
      {
        trialRunId: 'trial-run-dom-001',
        selectedCandidateId: 'trial-candidate-risk-001',
        confirmRisk: true,
        selectionReason: '人工确认该候选风险，继续生成第2-3章用于试写总评。',
      },
    ])
    expect(JSON.stringify({ localStorage: { ...localStorage }, sessionStorage: { ...sessionStorage } })).not.toContain('人工确认该候选风险')
    promptSpy.mockRestore()
  })

  it('keeps secret canary out of page text and browser storage when high-risk trial selection is rejected', async () => {
    const secretCanaries = [
      'api_key=should-not-leak-dom-api-key',
      'Authorization: Bearer should-not-leak-dom-authorization-bearer',
      'Cookie: session=should-not-leak-dom-cookie',
      'token=should-not-leak-dom-token',
    ]
    mocks.route.query = { step: 'trial' }
    mocks.getNovelDetail.mockResolvedValue(createNovelDetail({
      creationStage: NovelCreationStage.Trial,
      stageStatus: StageStatus.WaitingUser,
      statusSummary: {
        displayStatusText: '试写调试',
        recommendedAction: { type: 'select_trial_chapter_one', label: '选择第1章候选', reason: '选择候选继续试写' },
      },
      latestTrialRun: createTrialRunFixture(),
    }))
    mocks.generateTrial.mockRejectedValue(new Error('选择高风险试写候选的原因包含敏感信息，请移除密钥或 token 后重试。'))
    const promptSpy = vi.spyOn(ElMessageBox, 'prompt')

    wrapper = mount(NovelDetailWorkbench, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()

    const selectButton = wrapper.findAll('button').find((button) => button.text() === '选这个继续试写')
    for (const secretCanary of secretCanaries) {
      promptSpy.mockResolvedValueOnce({
        value: secretCanary,
        action: 'confirm',
      } as any)
      await selectButton?.trigger('click')
      await flushPromises()

      expect(JSON.stringify(mocks.generateTrial.mock.calls.at(-1))).toContain(secretCanary)
      expect(document.body.textContent).not.toContain(secretCanary)
      expect(JSON.stringify({ localStorage: { ...localStorage }, sessionStorage: { ...sessionStorage } })).not.toContain(secretCanary)
    }
    expect(promptSpy).toHaveBeenCalledTimes(secretCanaries.length)
    expect(mocks.generateTrial).toHaveBeenCalledTimes(secretCanaries.length)
    promptSpy.mockRestore()
  })

  it('renders authoritative chapter locations for full-review issues without exposing internal ids', async () => {
    mocks.route.query = { step: 'fullReview' }
    mocks.getNovelDetail.mockResolvedValue(createNovelDetail({
      creationStage: NovelCreationStage.FullReview,
      stageStatus: StageStatus.WaitingUser,
      statusSummary: {
        displayStatusText: '全书审稿',
        recommendedAction: { type: 'resolve_full_review_issue', label: '处理问题', reason: '先处理阻塞问题' },
      },
      chapters: [
        { id: 'chapter-authority-002', chapterNo: 2, title: '第二章' },
        { id: 'chapter-authority-008', chapterNo: 8, title: '第八章' },
      ],
      latestFullReview: {
        id: 'review-001',
        version: 1,
        totalScore: 68,
        rating: 'C',
        summary: '存在跨章一致性冲突。',
        suggestions: ['先修复阻塞问题'],
        videoSuggestion: '',
        firstVideoSuggestion: { chapterRange: '', narrationHook: '' },
        issues: [{
          issueId: 'issue-001',
          title: '人物生死状态冲突',
          plainDescription: '人物状态前后矛盾。',
          severity: 'blocking',
          scopeType: 'chapter',
          scopeRefs: ['chapter-authority-002', 'chapter-authority-008'],
          dimension: 'character_continuity',
          blocking: true,
          recommendedTarget: '第 2、8 章',
          recommendedAction: '统一人物状态。',
          status: 'open',
          acceptedReason: null,
        }],
        gate: {
          id: 'gate-001',
          gateResultText: '阻断',
          allowCompletion: false,
          forcePassAllowed: false,
          forcePassReason: null,
        },
      },
    }))

    wrapper = mount(NovelDetailWorkbench, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()

    const scope = wrapper.find('.full-review-issue-scope')
    expect(scope.text()).toBe('涉及章节：第 2 章、第 8 章')
    expect(wrapper.text()).not.toContain('chapter-authority-002')
    expect(wrapper.text()).not.toContain('chapter-authority-008')
  })

  it('shows a safe failed full-review recovery state with task and request trace access', async () => {
    mocks.route.query = { step: 'fullReview' }
    const failedTask = createFailedFullReviewTask()
    mocks.getNovelDetail.mockResolvedValue(createNovelDetail({
      creationStage: NovelCreationStage.Body,
      stageStatus: StageStatus.Completed,
      statusSummary: {
        displayStatusText: '批量正文已完成',
        recommendedAction: { type: 'full_review', label: '全书 AI 审稿', reason: '重新审稿' },
      },
      recentTask: failedTask,
      recentTasks: [failedTask],
    }))
    mocks.getTaskDetail.mockResolvedValue(createFailedFullReviewTaskDetail())

    wrapper = mount(NovelDetailWorkbench, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('模型输出格式不符合约定，本次未生成报告')
    expect(wrapper.text()).toContain('模型输出格式不符合约定，本次未生成报告。')
    expect(wrapper.text()).toContain('错误代码：PROVIDER_ERROR')
    expect(wrapper.text()).toContain('Task ID：task-full-review-failed-001')
    const restartButtons = wrapper.findAll('button').filter((button) => button.text() === '重新发起全书审稿')
    expect(restartButtons.length).toBeGreaterThan(0)
    expect(restartButtons.every((button) => button.attributes('disabled') === undefined)).toBe(true)
    expect(wrapper.text()).not.toContain('RAW_PROVIDER_RESPONSE_CANARY')

    await wrapper.findAll('button').find((button) => button.text() === '查看 Task / Request 详情')?.trigger('click')
    await flushPromises()

    expect(mocks.getTaskDetail).toHaveBeenCalledWith('task-full-review-failed-001')
    expect(document.body.textContent).toContain('request-full-review-failed-001')
    expect(document.body.textContent).toContain('task-full-review-failed-001')
  })

  it('uses the generic failed full-review title for a non-schema provider failure', async () => {
    mocks.route.query = { step: 'fullReview' }
    const failedTask = createFailedFullReviewTask({
      failureCategory: 'provider_error',
      errorCode: 'PROVIDER_TIMEOUT',
      errorMessage: '模型调用超时，请稍后重试。',
      currentStep: '等待模型响应超时',
    })
    mocks.getNovelDetail.mockResolvedValue(createNovelDetail({
      creationStage: NovelCreationStage.Body,
      stageStatus: StageStatus.Completed,
      statusSummary: {
        displayStatusText: '批量正文已完成',
        recommendedAction: { type: 'full_review', label: '全书 AI 审稿', reason: '重新审稿' },
      },
      recentTask: failedTask,
      recentTasks: [failedTask],
    }))

    wrapper = mount(NovelDetailWorkbench, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('全书审稿失败，本次未生成报告')
    expect(wrapper.text()).toContain('模型调用超时，请稍后重试。')
    expect(wrapper.text()).toContain('错误代码：PROVIDER_TIMEOUT')
    expect(wrapper.text()).not.toContain('模型输出格式不符合约定')
  })

  it('keeps full-review actions locked from an authoritative processing task after refresh without local pending state', async () => {
    mocks.route.query = { step: 'fullReview' }
    const processingTask = createProcessingFullReviewTask()
    mocks.getNovelDetail.mockResolvedValue(createNovelDetail({
      creationStage: NovelCreationStage.Body,
      stageStatus: StageStatus.Completed,
      statusSummary: {
        displayStatusText: '批量正文已完成',
        recommendedAction: { type: 'full_review', label: '全书 AI 审稿', reason: '发起审稿' },
      },
      recentTask: processingTask,
      recentTasks: [processingTask],
    }))
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm')

    expect(localStorage.length).toBe(0)
    wrapper = mount(NovelDetailWorkbench, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()

    const fullReviewButtons = wrapper.findAll('button').filter((button) => button.text() === '全书 AI 审稿')
    expect(fullReviewButtons.length).toBeGreaterThanOrEqual(2)
    expect(fullReviewButtons.every((button) => button.attributes('disabled') !== undefined)).toBe(true)
    expect(fullReviewButtons.every((button) => button.classes().includes('is-loading'))).toBe(true)

    for (const button of fullReviewButtons) await button.trigger('click')
    await flushPromises()

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(mocks.startFullReview).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
    confirmSpy.mockRestore()
  })

  it('explains that a failed full review restart is a new potentially billable call and cancel has no side effect', async () => {
    mocks.route.query = { step: 'fullReview' }
    const failedTask = createFailedFullReviewTask()
    mocks.getNovelDetail.mockResolvedValue(createNovelDetail({
      creationStage: NovelCreationStage.Body,
      stageStatus: StageStatus.Completed,
      statusSummary: {
        displayStatusText: '批量正文已完成',
        recommendedAction: { type: 'full_review', label: '全书 AI 审稿', reason: '重新审稿' },
      },
      recentTask: failedTask,
      recentTasks: [failedTask],
    }))
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('cancel')

    wrapper = mount(NovelDetailWorkbench, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()

    await wrapper.findAll('button').find((button) => button.text() === '重新发起全书审稿')?.trigger('click')
    await flushPromises()

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(confirmSpy.mock.calls[0]?.[1]).toBe('确认重新发起全书审稿')
    expect(String(confirmSpy.mock.calls[0]?.[0])).toContain('新的模型调用')
    expect(String(confirmSpy.mock.calls[0]?.[0])).toContain('可能产生新的模型费用')
    expect(String(confirmSpy.mock.calls[0]?.[0])).toContain('旧任务不会被直接 retry')
    expect(confirmSpy.mock.calls[0]?.[2]).toEqual(expect.objectContaining({ confirmButtonText: '确认新的模型调用' }))
    expect(mocks.startFullReview).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
    confirmSpy.mockRestore()
  })

  it('starts exactly one new full-review call after explicit restart confirmation', async () => {
    mocks.route.query = { step: 'fullReview' }
    const failedTask = createFailedFullReviewTask()
    const failedDetail = createNovelDetail({
      creationStage: NovelCreationStage.Body,
      stageStatus: StageStatus.Completed,
      statusSummary: {
        displayStatusText: '批量正文已完成',
        recommendedAction: { type: 'full_review', label: '全书 AI 审稿', reason: '重新审稿' },
      },
      recentTask: failedTask,
      recentTasks: [failedTask],
    })
    mocks.getNovelDetail.mockResolvedValue(failedDetail)
    mocks.startFullReview.mockResolvedValue({})
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockImplementationOnce(async () => 'confirm' as never)

    wrapper = mount(NovelDetailWorkbench, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()

    await wrapper.findAll('button').find((button) => button.text() === '重新发起全书审稿')?.trigger('click')
    await flushPromises()

    expect(mocks.startFullReview).toHaveBeenCalledTimes(1)
    expect(mocks.startFullReview).toHaveBeenCalledWith('novel-dom-001', {
      idempotencyKey: expect.stringMatching(/^full-review-[0-9a-f-]{36}$/),
      expectedNovelVersion: '2026-07-13T00:00:00.000Z',
    })
    confirmSpy.mockRestore()
  })
})

function createNovelDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'novel-dom-001',
    title: 'DOM 回归小说',
    genres: ['都市'],
    lifecycleStatus: 'active',
    creationStage: NovelCreationStage.Direction,
    stageStatus: StageStatus.WaitingUser,
    statusSummary: {
      displayStatusText: '方向确认',
      recommendedAction: { type: 'generate_direction', label: '生成方向', reason: '生成候选方向' },
    },
    chapterProgress: { text: '0/5' },
    videoReferenceSummary: { statusText: '未准备' },
    creationSource: { label: '系统推荐' },
    preferences: { chapterWordMin: 1800, chapterWordMax: 2600 },
    currentAssets: {
      direction: null,
      setting: null,
      outline: null,
      stageOutline: null,
      chapterPlan: null,
    },
    directionCandidates: [],
    structureCandidates: [],
    chapters: [],
    recentTask: null,
    recentTasks: [],
    latestTrialRun: null,
    bodyGeneration: null,
    latestFullReview: null,
    videoReadiness: null,
    completionDecision: null,
    updatedAt: '2026-07-13T00:00:00.000Z',
    ...overrides,
  }
}

function createRecentTask(taskId: string, resultVersionId: string, taskType = 'novel_direction_optimize') {
  return {
    id: taskId,
    taskType,
    status: TaskStatus.WaitingConfirmation,
    statusText: '有新结果待确认',
    progress: 100,
    currentStep: '方向候选已生成',
    resultVersionIds: [resultVersionId],
  }
}

function createTaskDetail(taskId: string, resultVersionId: string, taskType = 'novel_direction_optimize') {
  return {
    ...createRecentTask(taskId, resultVersionId, taskType),
    novelId: 'novel-dom-001',
    objectType: 'direction',
    objectId: resultVersionId,
    statusNote: '方向候选已生成',
    sourceVersionRefs: [],
    conflictScope: null,
    conflictKey: null,
    retryOfTaskId: null,
    failureCategory: null,
    failureCategoryText: null,
    errorCode: null,
    errorMessage: null,
    userFailureReason: null,
    retryable: false,
    cancellable: false,
    cancelReason: null,
    trace: { taskId, requestId: `request-${taskId}`, retryOfTaskId: null },
    nextAction: { reasonText: '查看并确认候选' },
    createdAt: '2026-08-02T08:00:00.000Z',
    updatedAt: '2026-08-02T08:01:00.000Z',
    events: [],
  }
}

function createFailedFullReviewTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-full-review-failed-001',
    taskType: 'novel_full_review',
    status: TaskStatus.Failed,
    statusText: '失败',
    progress: 0,
    currentStep: '模型输出格式不符合约定，本次未生成报告。',
    resultVersionIds: [],
    failureCategory: 'output_parse_failed',
    failureCategoryText: '模型输出解析失败',
    errorCode: 'PROVIDER_ERROR',
    errorMessage: '模型输出格式不符合约定，本次未生成报告。',
    createdAt: '2026-08-03T01:00:00.000Z',
    updatedAt: '2026-08-03T01:01:00.000Z',
    ...overrides,
  }
}

function createProcessingFullReviewTask() {
  return {
    id: 'task-full-review-processing-001',
    taskType: 'novel_full_review',
    status: TaskStatus.Processing,
    statusText: '生成中',
    progress: 42,
    currentStep: '正在执行全书审稿',
    resultVersionIds: [],
    errorCode: null,
    errorMessage: null,
    createdAt: '2026-08-03T02:00:00.000Z',
    updatedAt: '2026-08-03T02:01:00.000Z',
  }
}

function createFailedFullReviewTaskDetail() {
  const task = createFailedFullReviewTask()
  return {
    ...task,
    novelId: 'novel-dom-001',
    objectType: 'novel',
    objectId: 'novel-dom-001',
    statusNote: task.errorMessage,
    sourceVersionRefs: [],
    conflictScope: null,
    conflictKey: null,
    retryOfTaskId: null,
    failureCategory: 'provider_error',
    failureCategoryText: '生成服务异常',
    userFailureReason: task.errorMessage,
    retryable: false,
    cancellable: false,
    cancelReason: null,
    trace: {
      taskId: task.id,
      requestId: 'request-full-review-failed-001',
      retryOfTaskId: null,
    },
    nextAction: {
      type: 'disabled',
      label: '暂不支持任务重试',
      reasonText: '旧任务不会被直接重试。',
      targetType: 'disabled',
      disabled: true,
    },
    events: [],
  }
}

function createDirectionCandidate(id: string, title: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title,
    status: VersionStatus.Candidate,
    sourceVersionIds: [],
    changeReason: '',
    ...overrides,
  }
}

function createDirectionActionResult(resultVersionId: string) {
  return {
    task: createRecentTask(`task-${resultVersionId}`, resultVersionId),
    candidate: createDirectionCandidate(resultVersionId, '新方向候选'),
    candidates: [createDirectionCandidate(resultVersionId, '新方向候选')],
  }
}

function createStructureCandidate(id: string, title: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title,
    objectType: 'outline',
    status: VersionStatus.Candidate,
    summary: '设定候选摘要',
    sections: [{ body: '设定结构内容' }],
    stages: [],
    chapters: [],
    chapterCount: 0,
    sourceVersionIds: [],
    changeReason: '',
    ...overrides,
  }
}

function createStructureActionResult(resultVersionId: string) {
  return {
    task: {
      ...createRecentTask(`task-${resultVersionId}`, resultVersionId),
      taskType: 'novel_outline_generate',
    },
    candidate: createStructureCandidate(resultVersionId, '新大纲候选'),
  }
}

function createTrialRunFixture() {
  return {
    id: 'trial-run-dom-001',
    novelId: 'novel-dom-001',
    status: 'waiting_chapter1_selection',
    statusText: '待选择第1章候选',
    chapterCount: 3,
    currentStep: '选择第1章候选后继续生成第2-3章',
    selectedChapterOneCandidateId: null,
    blockingReason: null,
    chapterOneCandidates: [
      {
        id: 'trial-candidate-risk-001',
        title: '风险开篇候选',
        versionLabel: 'v1',
        isAiRecommended: true,
        isSelected: false,
        requiresRiskConfirm: true,
        scoreText: '58',
        gateText: '风险继续',
        statusText: '候选版本',
        riskLevelText: '高风险',
        openingStrategy: '强冲突开场',
        firstSentence: '所有人都以为主角输了。',
        first300Summary: '主角在误解中抓住证据，准备反击。',
        endingHook: '关键证据突然出现。',
        riskTags: ['低分继续需确认'],
        aiRecommendedReason: '钩子强，但评分偏低。',
        canSelect: true,
        content: '完整正文内容摘要占位',
      },
    ],
    chapterResults: [],
    trialReview: null,
    task: null,
  }
}

function getAdoptDialog() {
  const dialog = wrapper?.findAllComponents({ name: 'ElDialog' }).find((component) => component.props('title') === '采用方向')
  if (!dialog) throw new Error('Adopt dialog component was not found')
  return dialog
}

function getDialog(title: string) {
  const dialog = wrapper?.findAllComponents({ name: 'ElDialog' }).find((component) => component.props('title') === title)
  if (!dialog) throw new Error(`Dialog was not found: ${title}`)
  return dialog
}

async function setOpenDialogTextarea(title: string, value: string) {
  const textarea = getDialog(title).find('textarea')
  if (!textarea.exists()) throw new Error(`Dialog textarea was not found: ${title}`)
  await textarea.setValue(value)
  await nextTick()
}

function expectFocusedResult(scrollIntoView: ReturnType<typeof vi.spyOn>, expectedId: string, unexpectedId: string) {
  const expected = document.getElementById(expectedId)
  const unexpected = document.getElementById(unexpectedId)
  expect(scrollIntoView.mock.instances).toContain(expected)
  expect(scrollIntoView.mock.instances).not.toContain(unexpected)
  expect(expected?.classList.contains('result-focus-card')).toBe(true)
}

function getAdoptDialogModelValue() {
  return getAdoptDialog().props('modelValue')
}

function expectAdoptDirectionRequest(expectedRequest: Record<string, unknown>) {
  expect(mocks.adoptDirection).toHaveBeenCalledTimes(1)
  const [novelId, versionId, request] = mocks.adoptDirection.mock.calls[0] as [
    string,
    string,
    {
      pageVersionSnapshot: Record<string, unknown>
    } & Record<string, unknown>,
  ]

  expect(novelId).toBe('novel-dom-001')
  expect(versionId).toBe('direction-low-1')
  expect(Object.keys(request).sort()).toEqual(Object.keys(expectedRequest).sort())
  expect(Object.keys(request.pageVersionSnapshot).sort()).toEqual(['seenAt', 'seenCandidateVersionId'])
  expect(Date.parse(String(request.pageVersionSnapshot.seenAt))).not.toBeNaN()
  expect(request).toEqual(expectedRequest)
}

function expectAdoptDialogClosed() {
  expect(getAdoptDialogModelValue()).toBe(false)
  expect(getAdoptDialog().props('modelValue')).toBe(false)
  expect(getAdoptDialog().isVisible()).toBe(false)
  expect(document.body.classList.contains('el-popup-parent--hidden')).toBe(false)
  expect(document.body.style.overflow).not.toBe('hidden')
}

async function waitForDialogClose() {
  await new Promise((resolve) => window.setTimeout(resolve, 350))
  await flushPromises()
  await nextTick()
}
