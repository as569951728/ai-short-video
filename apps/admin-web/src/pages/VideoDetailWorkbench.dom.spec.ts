import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VideoDetailWorkbench from './VideoDetailWorkbench.vue'

const mocks = vi.hoisted(() => ({
  route: {
    params: { videoId: 'video-dom-001' },
  },
  routerPush: vi.fn(),
  getVideoWorkbench: vi.fn(),
  generateVideoNarrations: vi.fn(),
  generateVideoTts: vi.fn(),
  generateVideoSubtitles: vi.fn(),
  generateVideoRender: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('../shared/services/apiMode', () => ({
  getApiMode: () => 'mock',
}))

vi.mock('../modules/videos/model/videoP8View', () => ({
  getVideoWorkbenchCurrentStep: (view: { steps: Array<{ key: string }> }) => view.steps[0],
  mapVideoWorkbenchDtoToView: (dto: unknown) => dto,
}))

vi.mock('../modules/videos/services/videoService', () => {
  const noop = vi.fn().mockResolvedValue({})
  return {
    cancelVideoTask: noop,
    confirmVideoNarration: noop,
    confirmVideoRender: noop,
    confirmVideoSubtitle: noop,
    confirmVideoTts: noop,
    confirmVideoVisualPlan: noop,
    createVideoExport: noop,
    editVideoNarrationDraft: noop,
    editVideoSubtitleDraft: noop,
    generateVideoNarrations: mocks.generateVideoNarrations,
    generateVideoRender: mocks.generateVideoRender,
    generateVideoSubtitles: mocks.generateVideoSubtitles,
    generateVideoTts: mocks.generateVideoTts,
    getVideoWorkbench: mocks.getVideoWorkbench,
    recheckVideoReference: noop,
    rejectVideoNarration: noop,
    rejectVideoRender: noop,
    rejectVideoSubtitle: noop,
    rejectVideoTts: noop,
    rejectVideoVisualPlan: noop,
    saveVideoVisualPlan: noop,
  }
})

let wrapper: VueWrapper | null = null

beforeEach(() => {
  mocks.getVideoWorkbench.mockResolvedValue(createVideoWorkbenchView())
  mocks.generateVideoNarrations.mockResolvedValue({ task: { status: 'completed' } })
  mocks.generateVideoTts.mockResolvedValue({ task: { status: 'completed' } })
  mocks.generateVideoSubtitles.mockResolvedValue({ task: { status: 'completed' } })
  mocks.generateVideoRender.mockResolvedValue({ task: { status: 'completed' } })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  mocks.routerPush.mockClear()
  mocks.getVideoWorkbench.mockReset()
  mocks.generateVideoNarrations.mockReset()
  mocks.generateVideoTts.mockReset()
  mocks.generateVideoSubtitles.mockReset()
  mocks.generateVideoRender.mockReset()
  delete (MouseEvent.prototype as { retryOfTaskId?: string }).retryOfTaskId
  delete (MouseEvent.prototype as { mockTaskOutcome?: string }).mockTaskOutcome
})

describe('VideoDetailWorkbench DOM behavior', () => {
  it.each([
    ['旁白稿', '生成旁白候选', mocks.generateVideoNarrations, { candidateCount: 3 }],
    ['配音', '生成配音候选', mocks.generateVideoTts, { narrationArtifactId: 'narration-current-1' }],
    ['字幕', '生成字幕候选', mocks.generateVideoSubtitles, { ttsArtifactId: 'tts-current-1' }],
    ['渲染', '渲染视频预览', mocks.generateVideoRender, { visualPlanArtifactId: 'visual-current-1' }],
  ])('does not pass the click MouseEvent as generation options for %s', async (stepLabel, actionLabel, serviceMock, payloadSubset) => {
    ;(MouseEvent.prototype as { retryOfTaskId?: string }).retryOfTaskId = 'mouse-event-leak'
    ;(MouseEvent.prototype as { mockTaskOutcome?: string }).mockTaskOutcome = 'failed'

    wrapper = mount(VideoDetailWorkbench, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()

    const stepButton = wrapper.findAll('button').find((button) => button.text().includes(stepLabel) && !button.text().includes('生成'))
    await stepButton?.trigger('click')
    await flushPromises()

    const generateButton = wrapper.findAll('button').find((button) => button.text().includes(actionLabel))
    await generateButton?.trigger('click')
    await flushPromises()

    expect(serviceMock).toHaveBeenCalledWith(
      'video-dom-001',
      expect.objectContaining({
        ...payloadSubset,
        retryOfTaskId: undefined,
        mockTaskOutcome: undefined,
      }),
      'mock',
    )
  })
})

function createVideoWorkbenchView() {
  return {
    videoId: 'video-dom-001',
    title: 'DOM 视频工作台',
    novelTitle: '来源小说',
    projectStatusText: '承接中',
    recommendedAction: {
      label: '生成旁白候选',
      reason: '引用正常，可以生成旁白',
      disabled: false,
      stepKey: 'narration',
    },
    reference: {
      id: 'ref-001',
      versionText: '引用 v1',
      status: 'normal',
      statusText: '正常',
      summary: '引用摘要',
      chapterRangeText: '第 1-3 章',
      chapters: [],
    },
    defaultUnit: {
      id: 'unit-001',
      title: '默认视频单元',
      chapterRangeText: '第 1-3 章',
      statusText: '待生产',
    },
    steps: [
      {
        key: 'narration',
        label: '旁白稿',
        status: 'active',
        statusText: '当前处理',
        description: '生成并确认旁白候选',
        lockedReason: null,
        clickable: true,
        action: { label: '生成旁白候选', disabled: false, disabledReason: null },
      },
      {
        key: 'tts',
        label: '配音',
        status: 'active',
        statusText: '当前处理',
        description: '生成并确认配音候选',
        lockedReason: null,
        clickable: true,
        action: { label: '生成配音候选', disabled: false, disabledReason: null },
      },
      {
        key: 'subtitle',
        label: '字幕',
        status: 'active',
        statusText: '当前处理',
        description: '生成并确认字幕候选',
        lockedReason: null,
        clickable: true,
        action: { label: '生成字幕候选', disabled: false, disabledReason: null },
      },
      {
        key: 'render',
        label: '渲染',
        status: 'active',
        statusText: '当前处理',
        description: '生成 mock/local 渲染预览',
        lockedReason: null,
        clickable: true,
        action: { label: '渲染视频预览', disabled: false, disabledReason: null },
      },
    ],
    dependencyRefs: {
      videoReferenceVersion: 1,
      videoUnitId: 'unit-001',
    },
    artifacts: {
      placeholders: [],
      narration: { current: createNarrationArtifact(), candidates: [], drafts: [], history: [] },
      tts: { current: createTtsArtifact(), candidates: [], history: [] },
      subtitle: { current: createSubtitleArtifact(), candidates: [], drafts: [], history: [] },
      visualPlan: { current: createVisualPlanArtifact(), candidates: [], history: [] },
      renders: { current: null, candidates: [], history: [] },
      exports: [],
    },
    narration: {
      currentLabel: '未确认',
      candidateCount: 0,
      draftCount: 0,
      historyCount: 0,
      providerText: 'mock',
    },
    tts: { currentLabel: '未确认', candidateCount: 0, historyCount: 0, providerText: 'mock' },
    subtitle: { currentLabel: '未确认', candidateCount: 0, draftCount: 0, historyCount: 0, providerText: 'mock' },
    risks: [],
    riskSummary: '暂无阻塞风险',
    recentTasks: [],
    operationRecords: [],
  }
}

function createProviderSummary() {
  return { provider: 'mock', isMockOutput: true, safeSummary: 'mock output' }
}

function createNarrationArtifact() {
  return {
    id: 'narration-current-1',
    versionNo: 1,
    status: 'confirmed',
    score: 88,
    hook: '前三秒钩子',
    firstScreenSubtitle: '首屏字幕',
    estimatedDurationSeconds: 45,
    wordCount: 180,
    riskTags: [],
    qualitySummary: '旁白质量摘要',
    recommendationReason: '推荐理由',
    providerSummary: createProviderSummary(),
    contentText: '完整旁白稿',
  }
}

function createTtsArtifact() {
  return {
    id: 'tts-current-1',
    versionNo: 1,
    status: 'confirmed',
    voiceName: '男声-剧情感',
    voiceId: 'mock-male-cinematic',
    speed: 1,
    emotion: 'suspense',
    volume: 80,
    durationSeconds: 45,
    previewUrl: 'mock://audio/tts-current-1',
    riskTags: [],
    qualitySummary: '配音质量摘要',
    recommendationReason: '推荐理由',
    providerSummary: createProviderSummary(),
  }
}

function createSubtitleArtifact() {
  return {
    id: 'subtitle-current-1',
    versionNo: 1,
    status: 'confirmed',
    score: 90,
    firstScreenSubtitle: '首屏字幕',
    subtitleStyle: 'balanced',
    lineLength: 16,
    lineCount: 12,
    estimatedDurationSeconds: 45,
    contentText: '00:00:01,000 --> 00:00:03,000\n首屏字幕',
    riskTags: [],
    qualitySummary: '字幕质量摘要',
    recommendationReason: '推荐理由',
    providerSummary: createProviderSummary(),
  }
}

function createVisualPlanArtifact() {
  return {
    id: 'visual-current-1',
    versionNo: 1,
    status: 'confirmed',
    backgroundAssetId: 'gradient-night',
    backgroundAssetName: '循环夜景',
    backgroundAssetType: 'loop_background',
    aspectRatio: '9:16',
    resolution: '1080x1920',
    subtitlePosition: 'bottom_safe',
    fontSize: 42,
    textColor: '#ffffff',
    strokeColor: '#111827',
    shadowEnabled: true,
    safeAreaPreset: 'douyin_safe',
    riskTags: [],
    qualitySummary: '视觉方案摘要',
    recommendationReason: '推荐理由',
    providerSummary: createProviderSummary(),
  }
}
