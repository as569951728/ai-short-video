import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  P8_FORBIDDEN_ACTION_LABELS,
  createVideoP8Metrics,
  createVideoP8ProjectDraft,
  createVideoP8RouteQuery,
  getCreateWizardNextLabel,
  getReferenceIssueActionState,
  getVideoWorkbenchCurrentStep,
  getVideoWorkbenchNarrationSummary,
  getVideoWorkbenchStepAction,
  getVideoP8PrimaryAction,
  hasForbiddenP8Action,
  mapVideoWorkbenchDtoToView,
  mapVideoProjectDtoToP8Project,
  mapVideoReferenceDetailToChapterRows,
  mapVideoSourceDtoToP8Source,
  resolveCreateWizardStepRequest,
  resolveVideoP8InitialView,
  resolveVideoP8ReferenceIssue,
  type VideoP8Project,
} from './videoP8View'
import { tasks } from '../../../mock/prototypeData'

function createProject(overrides: Partial<VideoP8Project> = {}): VideoP8Project {
  return {
    id: 'video-001',
    title: '化学大秦：首条测试',
    typeText: '首条测试',
    novelId: 'novel_000001',
    novelTitle: '化学大秦',
    novelStageText: '待视频化',
    chapterRangeText: '第 1-3 章',
    chapterCount: 3,
    referenceVersionText: 'VideoReference v3',
    referenceSnapshotAt: '2026-06-22 09:30',
    referenceStatus: 'normal',
    referenceStatusText: '引用正常',
    referenceIssueSummary: '章节版本一致，可进入后续生成准备。',
    lifecycleStatus: 'active',
    lifecycleStatusText: '进行中',
    productionStatusText: 'P8 未开始生成',
    updatedAt: '2026-06-22 10:20',
    recommendedActionReason: '引用状态正常，先查看快照确认范围。',
    ...overrides,
  }
}

describe('video P8 view model', () => {
  it('calculates P8 list metrics from reference status without using production status as source of truth', () => {
    const metrics = createVideoP8Metrics([
      createProject({ referenceStatus: 'normal' }),
      createProject({ id: 'video-002', referenceStatus: 'warning' }),
      createProject({ id: 'video-003', referenceStatus: 'blocking' }),
      createProject({ id: 'video-004', referenceStatus: 'resolved' }),
      createProject({ id: 'video-005', lifecycleStatus: 'stopped', referenceStatus: 'normal' }),
    ])

    assert.deepEqual(metrics, {
      total: 5,
      normal: 2,
      attention: 2,
      blocking: 1,
      stopped: 1,
    })
  })

  it('maps reference status to a single P8 primary action', () => {
    assert.equal(getVideoP8PrimaryAction(createProject({ referenceStatus: 'normal' })).label, '查看引用快照')
    assert.equal(getVideoP8PrimaryAction(createProject({ referenceStatus: 'warning' })).label, '查看差异')
    assert.equal(getVideoP8PrimaryAction(createProject({ referenceStatus: 'blocking' })).label, '处理异常')
    assert.equal(getVideoP8PrimaryAction(createProject({ lifecycleStatus: 'stopped' })).label, '查看处理记录')
  })

  it('keeps render, publish, and data backfill actions outside P8 primary actions', () => {
    assert.deepEqual(P8_FORBIDDEN_ACTION_LABELS, ['生成视频', '生成配音', '生成字幕', '渲染视频', '标记发布', '回填数据'])
    assert.equal(hasForbiddenP8Action('查看引用快照'), false)
    assert.equal(hasForbiddenP8Action('标记发布'), true)
    assert.equal(hasForbiddenP8Action('渲染视频'), true)
  })

  it('keeps the create wizard next action aligned with the four-step prototype', () => {
    assert.equal(getCreateWizardNextLabel(1), '下一步：确认范围')
    assert.equal(getCreateWizardNextLabel(2), '下一步：创建前检查')
    assert.equal(getCreateWizardNextLabel(3), '创建视频项目')
    assert.equal(getCreateWizardNextLabel(4), '查看引用快照')
  })

  it('resolves entry view from route query for novel handoff and deep links', () => {
    assert.equal(resolveVideoP8InitialView({ create: '1', novelId: 'novel_000001' }), 'create')
    assert.equal(resolveVideoP8InitialView({ focus: 'issue' }), 'issue')
    assert.equal(resolveVideoP8InitialView({ focus: 'snapshot' }), 'snapshot')
    assert.equal(resolveVideoP8InitialView({}), 'overview')
  })

  it('creates route queries for shareable P8 step URLs without keeping stale create flags', () => {
    assert.deepEqual(createVideoP8RouteQuery('overview'), {})
    assert.deepEqual(createVideoP8RouteQuery('source'), { focus: 'source' })
    assert.deepEqual(createVideoP8RouteQuery('create', 'novel_000001'), { create: '1', novelId: 'novel_000001' })
    assert.deepEqual(createVideoP8RouteQuery('snapshot', 'novel_000001'), { focus: 'snapshot', novelId: 'novel_000001' })
  })

  it('creates a P8 video project draft with a reference snapshot and default unit wording', () => {
    const project = createVideoP8ProjectDraft({
      existingCount: 4,
      novelId: 'novel_000003',
      novelTitle: '玄门小师妹直播算命爆红',
      chapterRangeText: '第 1-2 章',
      chapterCount: 2,
      createdAt: '2026-06-23 10:30',
    })

    assert.equal(project.id, 'video-p8-005')
    assert.equal(project.title, '玄门小师妹直播算命爆红：第 1-2 章')
    assert.equal(project.referenceVersionText, 'VideoReference v1')
    assert.equal(project.referenceStatus, 'normal')
    assert.equal(project.productionStatusText, 'P8 未开始生成')
    assert.match(project.referenceIssueSummary, /默认视频单元/)
    assert.equal(hasForbiddenP8Action(getVideoP8PrimaryAction(project).label), false)
  })

  it('maps backend video DTOs into P8 source, project, and snapshot rows', () => {
    const source = mapVideoSourceDtoToP8Source({
      novelId: 'novel-video-ready',
      title: '化学大秦',
      creationStage: 'video_ready',
      videoReadinessSnapshotId: 'vrs-001',
      chapterCount: 36,
      totalWordCount: 86000,
      snapshotStatus: 'confirmed',
      firstVideoSuggestion: {
        chapterRangeText: '第 1-3 章',
        chapterIds: ['chapter-1', 'chapter-2', 'chapter-3'],
        title: '化学老师穿秦朝',
      },
      updatedAt: '2026-06-23T10:00:00.000Z',
    })

    assert.equal(source.id, 'novel-video-ready')
    assert.equal(source.snapshotId, 'vrs-001')
    assert.equal(source.range, '推荐 3 章')

    const project = mapVideoProjectDtoToP8Project({
      id: 'video-001',
      title: '化学大秦：第 1-3 章',
      projectType: 'first_test',
      novelId: 'novel-video-ready',
      novelTitle: '化学大秦',
      lifecycleStatus: 'active',
      referenceStatus: 'blocking',
      productionStatus: 'generation_locked',
      chapterRangeText: '第 1-3 章',
      chapterCount: 3,
      currentVideoReferenceId: 'vref-001',
      defaultVideoUnitId: 'vunit-001',
      updatedAt: '2026-06-23T10:00:00.000Z',
    })

    assert.equal(project.referenceStatusText, '阻塞异常')
    assert.equal(project.productionStatusText, '后续生成锁定')
    assert.equal(getVideoP8PrimaryAction(project).label, '处理异常')

    const rows = mapVideoReferenceDetailToChapterRows({
      project: {
        id: 'video-001',
        title: '化学大秦：第 1-3 章',
        projectType: 'first_test',
        novelId: 'novel-video-ready',
        novelTitle: '化学大秦',
        lifecycleStatus: 'active',
        referenceStatus: 'normal',
        productionStatus: 'not_started',
        chapterRangeText: '第 1-3 章',
        chapterCount: 3,
        currentVideoReferenceId: 'vref-001',
        defaultVideoUnitId: 'vunit-001',
        updatedAt: '2026-06-23T10:00:00.000Z',
      },
      referenceId: 'vref-001',
      versionNo: 1,
      status: 'normal',
      chapterRangeText: '第 1-3 章',
      chapterCount: 3,
      referenceSummary: '引用三章',
      chapters: [
        {
          chapterId: 'chapter-1',
          chapterNo: 1,
          chapterTitle: '盐场醒来',
          contentVersionId: 'body-v1',
          wordCount: 2200,
          summary: '现代化学知识开始发挥作用。',
          riskLevel: 'low',
        },
      ],
      issues: [],
      nextAction: { label: '查看引用快照', disabled: false, disabledReason: null },
    })

    assert.equal(rows[0].title, '第 1 章 盐场醒来')
    assert.equal(rows[0].referenceVersion, 'body-v1')
    assert.equal(rows[0].status, '一致')
  })

  it('keeps reference issue actions explicit and does not allow silent blocking ignore', () => {
    assert.deepEqual(getReferenceIssueActionState('warning', 'ignore'), { allowed: true, message: '可记录忽略原因，P9 前仍建议重新检测。' })
    assert.deepEqual(getReferenceIssueActionState('blocking', 'ignore'), { allowed: false, message: 'blocking 异常不能直接忽略，请回小说处理或停止项目。' })

    const resolved = resolveVideoP8ReferenceIssue(createProject({ referenceStatus: 'warning' }), {
      action: 'ignore',
      reason: '轻微修订不影响当前试投',
    })

    assert.equal(resolved.referenceStatus, 'resolved')
    assert.equal(resolved.referenceStatusText, '已处理')
    assert.match(resolved.referenceIssueSummary, /轻微修订不影响当前试投/)
  })

  it('does not allow the create wizard to jump into the completed state before the formal create action succeeds', () => {
    assert.deepEqual(resolveCreateWizardStepRequest({ currentStep: 1, requestedStep: 4, hasCreatedProject: false }), {
      nextStep: 1,
      allowed: false,
      message: '请先按底部按钮完成前置步骤，创建成功后才能查看完成状态。',
    })

    assert.deepEqual(resolveCreateWizardStepRequest({ currentStep: 2, requestedStep: 3, hasCreatedProject: false }), {
      nextStep: 3,
      allowed: true,
      message: null,
    })

    assert.deepEqual(resolveCreateWizardStepRequest({ currentStep: 3, requestedStep: 4, hasCreatedProject: false }), {
      nextStep: 3,
      allowed: false,
      message: '请点击底部“创建视频项目”完成正式创建。',
    })

    assert.deepEqual(resolveCreateWizardStepRequest({ currentStep: 3, requestedStep: 4, hasCreatedProject: true }), {
      nextStep: 4,
      allowed: true,
      message: null,
    })
  })

  it('keeps task-center mock data within P8 boundaries and avoids executable video production samples', () => {
    const misleadingTasks = tasks.filter((task) => /生成视频字幕|生成字幕|渲染|发布|回填/.test(`${task.name} ${task.step}`))
    assert.deepEqual(misleadingTasks, [])
  })

  it('maps the P9a workbench into a step view that locks production actions behind later packages', () => {
    const view = mapVideoWorkbenchDtoToView(createWorkbenchDto())

    assert.equal(view.title, '化学大秦：第 1-3 章')
    assert.equal(view.reference.statusText, '引用正常')
    assert.equal(view.defaultUnit.title, '化学大秦：第 1-3 章')
    assert.equal(getVideoWorkbenchCurrentStep(view).key, 'reference_check')
    assert.equal(getVideoWorkbenchStepAction(view.steps[0]).label, '重新检查引用')
    assert.equal(view.steps[1].key, 'narration')
    assert.equal(view.steps[1].status, 'active')
    assert.equal(view.steps[1].action.disabled, false)
    assert.equal(view.steps[1].action.label, '生成旁白候选')

    for (const step of view.steps.slice(2)) {
      assert.equal(step.clickable, true)
      assert.equal(step.action.disabled, true)
      assert.equal(/P9/.test(step.action.disabledReason ?? ''), true)
      assert.equal(['生成旁白', '生成配音', '生成字幕', '渲染视频', '导出文件'].includes(step.action.label), false)
    }
  })

  it('keeps every production step blocked when the video reference is blocking', () => {
    const view = mapVideoWorkbenchDtoToView(
      createWorkbenchDto({
        referenceStatus: 'blocking',
        recommendedActionLabel: '处理引用异常',
        productionStepStatus: 'blocked',
        productionLockedReason: '引用存在 blocking 异常，先处理引用异常后才能继续。',
      }),
    )

    assert.equal(view.recommendedAction.label, '处理引用异常')
    assert.equal(view.riskSummary, '存在 blocking 引用异常，后续视频生产步骤全部锁定。')
    for (const step of view.steps.slice(1)) {
      assert.equal(step.status, 'blocked')
      assert.equal(step.action.disabled, true)
      assert.match(step.action.disabledReason ?? '', /引用/)
    }
  })

  it('maps confirmed narration into the workbench and unlocks the P9c TTS step only', () => {
    const view = mapVideoWorkbenchDtoToView(
      createWorkbenchDto({
        narrationStatus: 'confirmed',
        currentNarrationId: 'artifact-confirmed-001',
        productionStepStatus: 'placeholder_locked',
        productionLockedReason: 'P9c 解锁配音；当前不能生成音频。',
      }),
    )

    assert.equal(view.steps[1].status, 'completed')
    assert.equal(view.steps[1].statusText, '已完成')
    assert.equal(view.steps[2].status, 'active')
    assert.equal(view.steps[2].action.disabled, false)
    assert.equal(view.steps[2].action.label, '生成配音候选')
    assert.equal(view.steps[3].status, 'placeholder_locked')
    assert.equal(view.steps[3].action.disabled, true)
    assert.equal(view.artifacts.narration.current?.id, 'artifact-confirmed-001')
    assert.equal(getVideoWorkbenchNarrationSummary(view).currentLabel, '当前旁白 v2')
    assert.equal(getVideoWorkbenchNarrationSummary(view).candidateCount, 1)
  })

  it('maps P9c TTS state while keeping subtitle generation locked', () => {
    const view = mapVideoWorkbenchDtoToView(
      createWorkbenchDto({
        narrationStatus: 'confirmed',
        currentNarrationId: 'artifact-confirmed-001',
        ttsStatus: 'confirmed',
        currentTtsId: 'audio-confirmed-001',
        recommendedActionLabel: '查看已确认配音',
        productionStepStatus: 'placeholder_locked',
        productionLockedReason: '字幕将在 P9d 解锁；当前不能生成字幕。',
      }),
    )

    assert.equal(view.steps[1].status, 'completed')
    assert.equal(view.steps[2].status, 'completed')
    assert.equal(view.steps[2].action.disabled, false)
    assert.equal(view.artifacts.tts.current?.id, 'audio-confirmed-001')
    assert.equal(view.steps[3].status, 'placeholder_locked')
    assert.equal(view.steps[3].action.disabled, true)
    assert.match(view.steps[3].action.disabledReason ?? '', /P9d/)
  })

  it('sanitizes forbidden video metadata in the page model while preserving narration and subtitle contentText', () => {
    const dto = createWorkbenchDto({
      narrationStatus: 'confirmed',
      currentNarrationId: 'artifact-confirmed-001',
      ttsStatus: 'confirmed',
      currentTtsId: 'audio-confirmed-001',
    })
    dto.artifacts.narration.current = createNarrationArtifact({
      id: 'artifact-confirmed-001',
      status: 'confirmed',
      isCurrent: true,
      providerSummary: {
        provider: 'mock',
        model: 'mock-video-narration',
        isMockOutput: true,
        endpoint: 'https://provider.example.test/v1/chat/completions',
        apiKey: 'sk-test-secret',
      },
      metadata: {
        isMockOutput: true,
        candidateRank: 1,
        rawPrompt: '完整 prompt',
        providerPayload: { apiKey: 'sk-test-secret' },
      },
    })
    dto.artifacts.subtitle.current = createSubtitleArtifact({
      contentText: '字幕第一行。\n字幕第二行。',
      metadata: {
        isMockOutput: true,
        subtitleStyle: 'balanced',
        lineLength: 18,
        responsePayload: { rawResponse: '完整响应' },
      },
    })
    dto.recentTasks = [
      {
        id: 'task-unsafe',
        taskType: 'video_subtitle_generate',
        status: 'failed',
        currentStep: 'calling_model',
        statusNote: 'provider error: https://provider.example.test/v1/chat/completions apiKey=sk-test-secret prompt: full',
        progress: 40,
        failureCategory: 'provider_error',
      },
    ]

    const view = mapVideoWorkbenchDtoToView(dto)

    assert.equal(view.artifacts.narration.current?.contentText, '三秒钩子：秦朝盐场快塌了，一个化学老师醒来后决定先救盐。')
    assert.equal(view.artifacts.subtitle.current?.contentText, '字幕第一行。\n字幕第二行。')
    assert.equal(view.artifacts.narration.current?.metadata.candidateRank, 1)
    assert.equal(view.artifacts.subtitle.current?.metadata.subtitleStyle, 'balanced')
    assert.equal(view.recentTasks[0].statusNote, '生成服务返回异常，当前产物未受影响，可以稍后重试。')
    assert.equal(JSON.stringify(view).includes('sk-test-secret'), false)
    assert.equal(JSON.stringify(view).includes('rawPrompt'), false)
    assert.equal(JSON.stringify(view).includes('providerPayload'), false)
    assert.equal(JSON.stringify(view).includes('provider.example.test'), false)
  })
})

function createWorkbenchDto(
  overrides: Partial<{
    referenceStatus: 'normal' | 'blocking'
    recommendedActionLabel: string
    productionStepStatus: 'placeholder_locked' | 'blocked'
    productionLockedReason: string
    narrationStatus: 'not_started' | 'candidate_ready' | 'confirmed'
    currentNarrationId: string | null
    ttsStatus: 'not_started' | 'candidate_ready' | 'confirmed'
    currentTtsId: string | null
  }> = {},
) {
  const referenceStatus = overrides.referenceStatus ?? 'normal'
  const productionStepStatus = overrides.productionStepStatus ?? 'placeholder_locked'
  const productionLockedReason = overrides.productionLockedReason ?? 'P9a 只展示占位，P9b 解锁旁白稿。'
  const narrationStatus = overrides.narrationStatus ?? 'not_started'
  const narrationStepStatus = referenceStatus === 'blocking' ? 'blocked' : narrationStatus === 'confirmed' ? 'completed' : 'active'
  const ttsStatus = overrides.ttsStatus ?? 'not_started'
  const ttsStepStatus = referenceStatus === 'blocking'
    ? 'blocked'
    : ttsStatus === 'confirmed'
      ? 'completed'
      : narrationStatus === 'confirmed'
        ? 'active'
        : productionStepStatus

  return {
    project: {
      id: 'video-001',
      title: '化学大秦：第 1-3 章',
      projectType: 'first_test',
      novelId: 'novel-video-ready',
      novelTitle: '化学大秦',
      lifecycleStatus: 'active',
      referenceStatus,
      productionStatus: referenceStatus === 'blocking' ? 'generation_locked' : 'not_started',
      chapterRangeText: '第 1-3 章',
      chapterCount: 3,
      currentVideoReferenceId: 'vref-001',
      defaultVideoUnitId: 'vunit-001',
      updatedAt: '2026-06-23T10:00:00.000Z',
    },
    reference: {
      project: createVideoProjectDTO({ referenceStatus }),
      referenceId: 'vref-001',
      versionNo: 1,
      status: referenceStatus,
      chapterRangeText: '第 1-3 章',
      chapterCount: 3,
      referenceSummary: '引用快照已保存。',
      chapters: [
        {
          chapterId: 'chapter-1',
          chapterNo: 1,
          chapterTitle: '盐场醒来',
          contentVersionId: 'body-v1',
          wordCount: 2200,
          summary: '现代化学知识开始发挥作用。',
          riskLevel: 'low',
        },
      ],
      issues: referenceStatus === 'blocking'
        ? [
            {
              id: 'issue-001',
              issueLevel: 'blocking',
              issueType: 'chapter_version_changed',
              issueReason: '章节版本已变化。',
              status: 'open',
              affectedChapterIds: ['chapter-1'],
              resolutionAction: null,
              resolutionReason: null,
            },
          ]
        : [],
      nextAction: { label: referenceStatus === 'blocking' ? '处理引用异常' : '查看引用快照', disabled: false, disabledReason: null },
    },
    defaultUnit: {
      id: 'vunit-001',
      unitNo: 1,
      unitType: 'first_test',
      title: '化学大秦：第 1-3 章',
      chapterRangeText: '第 1-3 章',
      chapterIds: ['chapter-1'],
      status: 'reference_ready',
      productionStatus: 'not_started',
    },
    recommendedAction: {
      label: overrides.recommendedActionLabel ?? '重新检查引用',
      stepKey: 'reference_check',
      disabled: false,
      reason: referenceStatus === 'blocking' ? '先处理引用异常。' : '引用状态正常，P9a 只允许重新检查引用。',
    },
    steps: [
      { key: 'reference_check', label: '引用检查', status: 'active', lockedReason: null, description: '确认引用仍有效。' },
      { key: 'narration', label: '旁白稿', status: narrationStepStatus, lockedReason: referenceStatus === 'blocking' ? productionLockedReason : null, description: '生成、编辑和确认旁白。', unlockPackage: 'P9b' },
      { key: 'tts', label: '配音', status: ttsStepStatus, lockedReason: ttsStepStatus === 'active' || ttsStepStatus === 'completed' ? null : productionLockedReason, description: '生成、试听和确认配音。', unlockPackage: 'P9c' },
      { key: 'subtitle', label: '字幕', status: productionStepStatus, lockedReason: productionLockedReason, description: '后续生成字幕。', unlockPackage: 'P9d' },
      { key: 'visual_plan', label: '视觉方案', status: productionStepStatus, lockedReason: productionLockedReason, description: '后续确认视觉方案。', unlockPackage: 'P9e' },
      { key: 'render', label: '渲染', status: productionStepStatus, lockedReason: productionLockedReason, description: '后续渲染。', unlockPackage: 'P9e' },
      { key: 'preview', label: '预览确认', status: productionStepStatus, lockedReason: productionLockedReason, description: '后续预览。', unlockPackage: 'P9e' },
      { key: 'export', label: '导出', status: productionStepStatus, lockedReason: productionLockedReason, description: '后续导出。', unlockPackage: 'P9e' },
    ],
    dependencyRefs: {
      videoReferenceId: 'vref-001',
      videoReferenceVersion: 1,
      videoUnitId: 'vunit-001',
      chapterContentVersionIds: ['body-v1'],
    },
    risks: referenceStatus === 'blocking'
      ? [{ level: 'blocking', message: '存在 blocking 引用异常，后续视频生产步骤全部锁定。', actionLabel: '处理引用异常' }]
      : [],
    artifacts: {
      placeholders: [{ type: 'narration_script', label: '旁白稿', status: 'not_started', currentVersionId: overrides.currentNarrationId ?? null, unlockPackage: 'P9b' }],
      narration: {
        current: overrides.currentNarrationId ? createNarrationArtifact({ id: overrides.currentNarrationId, status: 'confirmed', isCurrent: true, versionNo: 2 }) : null,
        candidates: [createNarrationArtifact()],
        drafts: [],
        history: [createNarrationArtifact(), ...(overrides.currentNarrationId ? [createNarrationArtifact({ id: overrides.currentNarrationId, status: 'confirmed', isCurrent: true, versionNo: 2 })] : [])],
        activeTask: null,
      },
      tts: {
        current: overrides.currentTtsId ? createTtsArtifact({ id: overrides.currentTtsId, status: 'confirmed', isCurrent: true, versionNo: 2 }) : null,
        candidates: ttsStatus === 'candidate_ready' ? [createTtsArtifact()] : [],
        history: [createTtsArtifact(), ...(overrides.currentTtsId ? [createTtsArtifact({ id: overrides.currentTtsId, status: 'confirmed', isCurrent: true, versionNo: 2 })] : [])],
        activeTask: null,
      },
      subtitle: {
        current: null,
        candidates: [],
        drafts: [],
        history: [],
        activeTask: null,
      },
      visualPlan: {
        current: null,
        candidates: [],
        history: [],
      },
      renders: {
        current: null,
        candidates: [],
        history: [],
        activeTask: null,
      },
      exports: {
        current: null,
        history: [],
      },
      render: { status: 'locked', currentRenderId: null, lockedReason: 'P9e 解锁渲染。' },
      export: { status: 'locked', currentExportId: null, lockedReason: 'P9e 解锁导出。' },
    },
    recentTasks: [],
    operationRecords: [],
  }
}

function createSubtitleArtifact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'subtitle-confirmed-001',
    artifactType: 'subtitle',
    status: 'confirmed',
    versionNo: 1,
    isCurrent: true,
    contentText: '秦朝盐场快塌了。\n化学老师开始救场。',
    firstScreenSubtitle: '化学老师穿秦朝',
    timelineSummary: ['0-3 秒钩子'],
    estimatedDurationSeconds: 58,
    lineCount: 2,
    wordCount: 30,
    riskTags: ['低风险'],
    recommendationReason: '字幕短句清楚。',
    score: 88,
    qualitySummary: '节奏稳定。',
    sourceVersionRefs: {
      videoReferenceId: 'vref-001',
      videoReferenceVersion: 1,
      videoUnitId: 'vunit-001',
      videoReadinessSnapshotId: 'vrs-001',
      narrationArtifactId: 'artifact-confirmed-001',
      narrationVersionNo: 2,
      ttsArtifactId: 'audio-confirmed-001',
      ttsVersionNo: 2,
      chapterContentVersionIds: ['body-v1'],
    },
    providerSummary: { provider: 'mock-local-subtitle', model: 'mock-subtitle-v1', isMockOutput: true },
    providerRouteId: 'video_subtitle_provider.mock.v1',
    strategyVersion: 'video_subtitle_strategy.v1',
    qualityMode: 'standard',
    subtitleStyle: 'balanced',
    lineLength: 18,
    metadata: { isMockOutput: true, subtitleStyle: 'balanced', lineLength: 18 },
    rejectedReason: null,
    confirmedAt: '2026-06-23T10:00:00.000Z',
    createdAt: '2026-06-23T10:00:00.000Z',
    ...overrides,
  }
}

function createTtsArtifact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'audio-candidate-001',
    artifactType: 'tts_audio',
    status: 'candidate',
    versionNo: 1,
    isCurrent: false,
    voiceId: 'mock-male-cinematic',
    voiceName: '男声-剧情感',
    speed: 1,
    emotion: 'suspense',
    volume: 90,
    durationSeconds: 58,
    fileKey: 'mock://video-tts/audio-candidate-001.mp3',
    previewUrl: '/mock-audio/video-tts/audio-candidate-001.mp3',
    riskTags: ['模拟音频'],
    recommendationReason: 'mock TTS 试听候选。',
    qualitySummary: '本地 mock TTS 产物。',
    sourceVersionRefs: {
      videoReferenceId: 'vref-001',
      videoReferenceVersion: 1,
      videoUnitId: 'vunit-001',
      videoReadinessSnapshotId: 'vrs-001',
      narrationArtifactId: 'artifact-confirmed-001',
      narrationVersionNo: 2,
      chapterContentVersionIds: ['body-v1'],
    },
    providerSummary: { provider: 'mock-local-tts', model: 'mock-tts-v1', isMockOutput: true },
    providerRouteId: 'video_tts_provider.mock.v1',
    strategyVersion: 'video_tts_strategy.v1',
    qualityMode: 'standard',
    metadata: { isMockOutput: true },
    rejectedReason: null,
    confirmedAt: null,
    createdAt: '2026-06-23T10:00:00.000Z',
    ...overrides,
  }
}

function createNarrationArtifact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'artifact-candidate-001',
    artifactType: 'narration_script',
    status: 'candidate',
    versionNo: 1,
    isCurrent: false,
    contentText: '三秒钩子：秦朝盐场快塌了，一个化学老师醒来后决定先救盐。',
    hook: '秦朝盐场快塌了。',
    firstScreenSubtitle: '化学老师穿秦朝',
    endingHook: '真正的危机来自下一道命令。',
    estimatedDurationSeconds: 58,
    wordCount: 120,
    riskTags: ['低风险'],
    recommendationReason: '钩子清楚。',
    score: 86,
    qualitySummary: '节奏稳定。',
    sourceVersionRefs: {
      videoReferenceId: 'vref-001',
      videoReferenceVersion: 1,
      videoUnitId: 'vunit-001',
      videoReadinessSnapshotId: 'vrs-001',
      chapterContentVersionIds: ['body-v1'],
    },
    providerSummary: { provider: 'mock', model: 'mock-video-narration', isMockOutput: true },
    providerRouteId: 'video_narration_agent.mock.v1',
    strategyVersion: 'video_narration_strategy.v1',
    qualityMode: 'standard',
    metadata: { isMockOutput: true },
    rejectedReason: null,
    confirmedAt: null,
    createdAt: '2026-06-23T10:00:00.000Z',
    ...overrides,
  }
}

function createVideoProjectDTO(overrides: Record<string, unknown> = {}) {
  return {
    id: 'video-001',
    title: '化学大秦：第 1-3 章',
    projectType: 'first_test',
    novelId: 'novel-video-ready',
    novelTitle: '化学大秦',
    lifecycleStatus: 'active',
    referenceStatus: 'normal',
    productionStatus: 'not_started',
    chapterRangeText: '第 1-3 章',
    chapterCount: 3,
    currentVideoReferenceId: 'vref-001',
    defaultVideoUnitId: 'vunit-001',
    updatedAt: '2026-06-23T10:00:00.000Z',
    ...overrides,
  }
}
