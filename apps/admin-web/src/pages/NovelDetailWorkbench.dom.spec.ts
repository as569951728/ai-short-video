import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NovelCreationStage, StageStatus, TaskStatus } from '@ai-shortvideo/shared'
import NovelDetailWorkbench from './NovelDetailWorkbench.vue'

const mocks = vi.hoisted(() => ({
  route: {
    path: '/novels/novel-dom-001',
    params: { novelId: 'novel-dom-001' },
    query: {} as Record<string, string>,
  },
  routerPush: vi.fn(),
  getNovelDetail: vi.fn(),
  adoptDirection: vi.fn(),
  generateTrial: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('../modules/novels/services/taskService', () => ({
  cancelTask: vi.fn(),
  getTaskDetail: vi.fn(),
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
    editDirectionCandidate: noopAction,
    editStructureAsset: noopAction,
    forcePassFullReview: noopAction,
    fuseDirections: noopAction,
    generateBodyBatch: noopAction,
    generateChapterPlan: noopAction,
    generateDirections: noopAction,
    generateOutline: noopAction,
    generateSetting: noopAction,
    generateStageOutline: noopAction,
    generateTrial: mocks.generateTrial,
    getNovelDetail: mocks.getNovelDetail,
    optimizeDirection: noopAction,
    recheckVideoReadiness: noopAction,
    resolveFullReviewIssue: noopAction,
    startFullReview: noopAction,
    updateChapterWordTargets: noopAction,
    toDirectionCandidateRow: (candidate: Record<string, unknown>) => ({
      id: candidate.id,
      title: candidate.title,
      versionLabel: 'v1',
      lowScoreRequiresConfirm: true,
      scoreText: '58',
      riskLevelText: '高风险',
      logline: '一句话方向',
      coreHook: '前三秒钩子',
      primaryReason: '推荐理由',
      videoPotential: '视频化表达',
      riskTags: ['低分采用需确认'],
      canAdopt: true,
    }),
    toNovelChapterPlanRow: (chapter: unknown) => chapter,
    toStructureAssetRow: (asset: Record<string, unknown>) => ({
      id: asset.id,
      title: asset.title,
      objectType: asset.objectType,
      typeText: '小说设定',
      versionLabel: 'v1',
      scoreText: '82',
      highRiskRequiresConfirm: false,
      status: '候选版本',
      summary: '设定候选摘要',
      primaryReason: '设定推荐理由',
      sections: [{ body: '设定结构内容' }],
      riskTags: [],
    }),
    toTrialCandidateRow: (candidate: unknown) => candidate,
    toTrialChapterResultRow: (result: unknown) => result,
  }
})

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  mocks.routerPush.mockClear()
  mocks.getNovelDetail.mockReset()
  mocks.adoptDirection.mockReset()
  mocks.generateTrial.mockReset()
  localStorage.clear()
  sessionStorage.clear()
  vi.useRealTimers()
})

beforeEach(() => {
  mocks.route.query = {}
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

  it('uses the existing task result path to scroll to the structure candidate target', async () => {
    vi.useFakeTimers()
    mocks.getNovelDetail.mockResolvedValue(createNovelDetail({
      structureCandidates: [{ id: 'setting-candidate-1', title: '设定候选', objectType: 'setting' }],
      recentTask: {
        id: 'task-setting-1',
        taskType: 'novel_setting_generate',
        status: TaskStatus.Completed,
        statusText: '已完成',
        progress: 100,
        currentStep: '设定已生成',
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

    vi.runOnlyPendingTimers()
    scrollIntoView.mockRestore()
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
