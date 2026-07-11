import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createVideoProject,
  confirmVideoRender,
  confirmVideoNarration,
  confirmVideoSubtitle,
  confirmVideoTts,
  confirmVideoVisualPlan,
  createVideoExport,
  editVideoNarrationDraft,
  editVideoSubtitleDraft,
  generateVideoRender,
  generateVideoNarrations,
  generateVideoSubtitles,
  generateVideoTts,
  getVideoWorkbench,
  listVideoNarrations,
  listVideoProjects,
  listVideoSubtitles,
  listVideoSources,
  recheckVideoReference,
  rejectVideoRender,
  rejectVideoNarration,
  rejectVideoSubtitle,
  rejectVideoTts,
  rejectVideoVisualPlan,
  resolveVideoReferenceIssue,
  saveVideoVisualPlan,
  stopVideoProject,
} from './videoService'

describe('video P8b service api contract', () => {
  it('keeps mock video sources available without backend calls', async () => {
    const result = await listVideoSources({}, 'mock')

    assert.equal(result.items[0].creationStage, 'video_ready')
    assert.equal(result.items[0].firstVideoSuggestion.chapterIds.length > 0, true)
  })

  it('keeps mock narration generation visible in workbench tasks after refresh', async () => {
    await generateVideoNarrations(
      'video-001',
      {
        idempotencyToken: 'mock-generate-narration-token',
        expectedReferenceVersion: 1,
        videoUnitId: 'unit_video-001',
        candidateCount: 3,
        qualityMode: 'standard',
      },
      'mock',
    )

    const workbench = await getVideoWorkbench('video-001', 'mock')

    assert.equal(workbench.artifacts.narration.candidates.length >= 3, true)
    assert.equal(workbench.recentTasks[0].taskType, 'video_narration_generate')
    assert.equal(workbench.recentTasks[0].status, 'completed')
  })

  it('keeps mock narration failure, retry, and cancellation visible without setting current narration', async () => {
    const failed = await generateVideoNarrations(
      'video-failure-mock',
      {
        idempotencyToken: 'mock-generate-failure-token',
        expectedReferenceVersion: 1,
        videoUnitId: 'unit_video-failure-mock',
        candidateCount: 3,
        qualityMode: 'standard',
        mockTaskOutcome: 'failed',
      },
      'mock',
    )

    assert.equal(failed.task.status, 'failed')
    assert.equal(failed.task.canRetry, true)
    assert.equal(failed.artifacts.length, 0)

    const failedWorkbench = await getVideoWorkbench('video-failure-mock', 'mock')
    assert.equal(failedWorkbench.recentTasks[0].status, 'failed')
    assert.equal(failedWorkbench.recentTasks[0].failureCategory, 'provider_error')
    assert.equal(failedWorkbench.artifacts.narration.current, null)

    const retry = await generateVideoNarrations(
      'video-failure-mock',
      {
        idempotencyToken: 'mock-generate-retry-token',
        expectedReferenceVersion: 1,
        videoUnitId: 'unit_video-failure-mock',
        candidateCount: 2,
        qualityMode: 'standard',
        retryOfTaskId: failed.task.id,
      },
      'mock',
    )

    assert.equal(retry.task.status, 'completed')
    assert.equal(retry.task.retryOfTaskId, failed.task.id)
    assert.equal(retry.artifacts.length, 2)

    const cancelled = await generateVideoNarrations(
      'video-cancel-mock',
      {
        idempotencyToken: 'mock-generate-cancel-token',
        expectedReferenceVersion: 1,
        videoUnitId: 'unit_video-cancel-mock',
        candidateCount: 3,
        qualityMode: 'standard',
        mockTaskOutcome: 'cancelled',
      },
      'mock',
    )

    assert.equal(cancelled.task.status, 'cancelled')
    assert.equal(cancelled.task.failureCategory, 'user_cancelled')
    assert.equal(cancelled.artifacts.length, 0)
    assert.equal(cancelled.current, null)
  })

  it('keeps mock TTS generation visible after narration confirmation and does not auto-confirm audio', async () => {
    const narration = await generateVideoNarrations(
      'video-tts-mock',
      {
        idempotencyToken: 'mock-tts-narration-token',
        expectedReferenceVersion: 1,
        videoUnitId: 'unit_video-tts-mock',
        candidateCount: 1,
        qualityMode: 'standard',
      },
      'mock',
    )
    const confirmedNarration = await confirmVideoNarration(
      'video-tts-mock',
      narration.artifacts[0].id,
      { idempotencyToken: 'mock-confirm-narration-for-tts', expectedVersionNo: narration.artifacts[0].versionNo },
      'mock',
    )

    const generated = await generateVideoTts(
      'video-tts-mock',
      {
        idempotencyToken: 'mock-generate-tts-token',
        expectedReferenceVersion: 1,
        videoUnitId: 'unit_video-tts-mock',
        narrationArtifactId: confirmedNarration.current.id,
        expectedNarrationVersionNo: confirmedNarration.current.versionNo,
        voiceId: 'mock-male-cinematic',
        voiceName: '男声-剧情感',
        speed: 1.05,
        emotion: 'suspense',
        volume: 90,
        qualityMode: 'standard',
      },
      'mock',
    )

    assert.equal(generated.task.taskType, 'video_tts_generate')
    assert.equal(generated.artifacts.length, 1)
    assert.equal(generated.current, null)
    assert.equal(generated.artifacts[0].artifactType, 'tts_audio')
    assert.equal(generated.artifacts[0].voiceId, 'mock-male-cinematic')
    assert.equal(generated.artifacts[0].metadata.isMockOutput, true)

    const workbench = await getVideoWorkbench('video-tts-mock', 'mock')
    assert.equal(workbench.artifacts.tts.candidates[0].id, generated.artifacts[0].id)
    assert.equal(workbench.recentTasks[0].taskType, 'video_tts_generate')
    assert.equal(workbench.steps.find((step) => step.key === 'tts')?.status, 'active')
    assert.equal(workbench.steps.find((step) => step.key === 'subtitle')?.status, 'placeholder_locked')
  })

  it('keeps mock TTS failure, retry, reject, and confirmation visible, then unlocks subtitles', async () => {
    const narration = await generateVideoNarrations(
      'video-tts-failure-mock',
      {
        idempotencyToken: 'mock-tts-failure-narration-token',
        expectedReferenceVersion: 1,
        videoUnitId: 'unit_video-tts-failure-mock',
        candidateCount: 1,
        qualityMode: 'standard',
      },
      'mock',
    )
    const confirmedNarration = await confirmVideoNarration(
      'video-tts-failure-mock',
      narration.artifacts[0].id,
      { idempotencyToken: 'mock-confirm-narration-for-tts-failure', expectedVersionNo: narration.artifacts[0].versionNo },
      'mock',
    )
    const baseRequest = {
      expectedReferenceVersion: 1,
      videoUnitId: 'unit_video-tts-failure-mock',
      narrationArtifactId: confirmedNarration.current.id,
      expectedNarrationVersionNo: confirmedNarration.current.versionNo,
      voiceId: 'mock-female-bright',
      speed: 1,
      emotion: 'warm' as const,
      volume: 88,
    }

    const failed = await generateVideoTts(
      'video-tts-failure-mock',
      { ...baseRequest, idempotencyToken: 'mock-generate-tts-failed-token', mockTaskOutcome: 'failed' },
      'mock',
    )
    assert.equal(failed.task.status, 'failed')
    assert.equal(failed.task.canRetry, true)
    assert.equal(failed.artifacts.length, 0)

    const retry = await generateVideoTts(
      'video-tts-failure-mock',
      { ...baseRequest, idempotencyToken: 'mock-generate-tts-retry-token', retryOfTaskId: failed.task.id },
      'mock',
    )
    assert.equal(retry.task.retryOfTaskId, failed.task.id)
    assert.equal(retry.artifacts.length, 1)

    const rejected = await rejectVideoTts(
      'video-tts-failure-mock',
      retry.artifacts[0].id,
      { idempotencyToken: 'mock-reject-tts-token', reason: '声音情绪不适合' },
      'mock',
    )
    assert.equal(rejected.artifact.status, 'rejected')

    const next = await generateVideoTts(
      'video-tts-failure-mock',
      { ...baseRequest, idempotencyToken: 'mock-generate-tts-confirm-token' },
      'mock',
    )
    const confirmed = await confirmVideoTts(
      'video-tts-failure-mock',
      next.artifacts[0].id,
      { idempotencyToken: 'mock-confirm-tts-token', expectedVersionNo: next.artifacts[0].versionNo },
      'mock',
    )
    assert.equal(confirmed.current.id, next.artifacts[0].id)

    const workbench = await getVideoWorkbench('video-tts-failure-mock', 'mock')
    assert.equal(workbench.artifacts.tts.current?.id, next.artifacts[0].id)
    assert.equal(workbench.steps.find((step) => step.key === 'tts')?.status, 'completed')
    assert.equal(workbench.steps.find((step) => step.key === 'subtitle')?.status, 'active')
    assert.equal(workbench.recommendedAction.label, '生成字幕候选')
  })

  it('keeps mock subtitle generation, editing, rejection, and confirmation visible before P9e visual planning', async () => {
    const videoId = 'video-subtitle-mock'
    const narration = await generateVideoNarrations(
      videoId,
      {
        idempotencyToken: 'mock-subtitle-narration-token',
        expectedReferenceVersion: 1,
        videoUnitId: `unit_${videoId}`,
        candidateCount: 1,
        qualityMode: 'standard',
      },
      'mock',
    )
    const confirmedNarration = await confirmVideoNarration(
      videoId,
      narration.artifacts[0].id,
      { idempotencyToken: 'mock-confirm-narration-for-subtitle', expectedVersionNo: narration.artifacts[0].versionNo },
      'mock',
    )
    const tts = await generateVideoTts(
      videoId,
      {
        idempotencyToken: 'mock-subtitle-tts-token',
        expectedReferenceVersion: 1,
        videoUnitId: `unit_${videoId}`,
        narrationArtifactId: confirmedNarration.current.id,
        expectedNarrationVersionNo: confirmedNarration.current.versionNo,
        voiceId: 'mock-male-cinematic',
        speed: 1,
        emotion: 'suspense',
        volume: 90,
      },
      'mock',
    )
    const confirmedTts = await confirmVideoTts(
      videoId,
      tts.artifacts[0].id,
      { idempotencyToken: 'mock-confirm-tts-for-subtitle', expectedVersionNo: tts.artifacts[0].versionNo },
      'mock',
    )

    const failed = await generateVideoSubtitles(
      videoId,
      {
        idempotencyToken: 'mock-generate-subtitle-failed-token',
        expectedReferenceVersion: 1,
        videoUnitId: `unit_${videoId}`,
        ttsArtifactId: confirmedTts.current.id,
        expectedTtsVersionNo: confirmedTts.current.versionNo,
        subtitleStyle: 'balanced',
        lineLength: 18,
        mockTaskOutcome: 'failed',
      },
      'mock',
    )
    assert.equal(failed.task.status, 'failed')
    assert.equal(failed.artifacts.length, 0)

    const generated = await generateVideoSubtitles(
      videoId,
      {
        idempotencyToken: 'mock-generate-subtitle-token',
        expectedReferenceVersion: 1,
        videoUnitId: `unit_${videoId}`,
        ttsArtifactId: confirmedTts.current.id,
        expectedTtsVersionNo: confirmedTts.current.versionNo,
        subtitleStyle: 'dramatic',
        lineLength: 16,
      },
      'mock',
    )
    assert.equal(generated.task.taskType, 'video_subtitle_generate')
    assert.equal(generated.artifacts[0].artifactType, 'subtitle')
    assert.equal(generated.artifacts[0].status, 'candidate')
    assert.equal(generated.artifacts[0].subtitleStyle, 'dramatic')
    assert.equal(generated.current, null)

    const draft = await editVideoSubtitleDraft(
      videoId,
      {
        idempotencyToken: 'mock-edit-subtitle-token',
        baseArtifactId: generated.artifacts[0].id,
        contentText: '秦朝盐场快塌了。\n他拿出现代化学办法。\n所有人都等着看他翻盘。',
        firstScreenSubtitle: '化学老师穿秦朝，开局救盐场',
        reason: '调整分行和首屏',
      },
      'mock',
    )
    assert.equal(draft.artifact.status, 'draft')

    const rejected = await rejectVideoSubtitle(
      videoId,
      generated.artifacts[0].id,
      { idempotencyToken: 'mock-reject-subtitle-token', reason: '分行节奏需要调整' },
      'mock',
    )
    assert.equal(rejected.artifact.status, 'rejected')

    const confirmed = await confirmVideoSubtitle(
      videoId,
      draft.artifact.id,
      { idempotencyToken: 'mock-confirm-subtitle-token', expectedVersionNo: draft.artifact.versionNo },
      'mock',
    )
    assert.equal(confirmed.current.id, draft.artifact.id)
    assert.equal(confirmed.current.status, 'confirmed')

    const list = await listVideoSubtitles(videoId, 'mock')
    assert.equal(list.current?.id, draft.artifact.id)
    assert.equal(list.history.some((item) => item.status === 'rejected'), true)

    const workbench = await getVideoWorkbench(videoId, 'mock')
    assert.equal(workbench.artifacts.subtitle.current?.id, draft.artifact.id)
    assert.equal(workbench.steps.find((step) => step.key === 'subtitle')?.status, 'completed')
    assert.equal(workbench.steps.find((step) => step.key === 'visual_plan')?.status, 'active')
    assert.equal(workbench.recommendedAction.label, '配置视觉方案')
  })

  it('keeps mock P9e visual plan, render preview, and export records visible without publishing', async () => {
    const videoId = 'video-p9e-mock'
    const narration = await generateVideoNarrations(
      videoId,
      {
        idempotencyToken: 'mock-p9e-narration-token',
        expectedReferenceVersion: 1,
        videoUnitId: `unit_${videoId}`,
        candidateCount: 1,
        qualityMode: 'standard',
      },
      'mock',
    )
    const confirmedNarration = await confirmVideoNarration(
      videoId,
      narration.artifacts[0].id,
      { idempotencyToken: 'mock-p9e-confirm-narration', expectedVersionNo: narration.artifacts[0].versionNo },
      'mock',
    )
    const tts = await generateVideoTts(
      videoId,
      {
        idempotencyToken: 'mock-p9e-tts-token',
        expectedReferenceVersion: 1,
        videoUnitId: `unit_${videoId}`,
        narrationArtifactId: confirmedNarration.current.id,
        expectedNarrationVersionNo: confirmedNarration.current.versionNo,
        voiceId: 'mock-male-cinematic',
        speed: 1,
        emotion: 'suspense',
        volume: 90,
      },
      'mock',
    )
    const confirmedTts = await confirmVideoTts(
      videoId,
      tts.artifacts[0].id,
      { idempotencyToken: 'mock-p9e-confirm-tts', expectedVersionNo: tts.artifacts[0].versionNo },
      'mock',
    )
    const subtitles = await generateVideoSubtitles(
      videoId,
      {
        idempotencyToken: 'mock-p9e-subtitle-token',
        expectedReferenceVersion: 1,
        videoUnitId: `unit_${videoId}`,
        ttsArtifactId: confirmedTts.current.id,
        expectedTtsVersionNo: confirmedTts.current.versionNo,
        subtitleStyle: 'balanced',
        lineLength: 18,
      },
      'mock',
    )
    const confirmedSubtitle = await confirmVideoSubtitle(
      videoId,
      subtitles.artifacts[0].id,
      { idempotencyToken: 'mock-p9e-confirm-subtitle', expectedVersionNo: subtitles.artifacts[0].versionNo },
      'mock',
    )

    const visual = await saveVideoVisualPlan(
      videoId,
      {
        idempotencyToken: 'mock-p9e-save-visual',
        expectedReferenceVersion: 1,
        videoUnitId: `unit_${videoId}`,
        subtitleArtifactId: confirmedSubtitle.current.id,
        expectedSubtitleVersionNo: confirmedSubtitle.current.versionNo,
        backgroundAssetId: 'mock-bg-salt-field',
        aspectRatio: '9:16',
        resolution: '1080x1920',
        subtitlePosition: 'bottom_safe',
        fontSize: 42,
        textColor: '#ffffff',
        strokeColor: '#111827',
        shadowEnabled: true,
        safeAreaPreset: 'douyin_safe',
      },
      'mock',
    )
    assert.equal(visual.artifact.status, 'candidate')
    assert.equal(visual.visualPlans.current, null)

    const rejectedVisual = await rejectVideoVisualPlan(
      videoId,
      visual.artifact.id,
      { idempotencyToken: 'mock-p9e-reject-visual', reason: '背景氛围不合适' },
      'mock',
    )
    assert.equal(rejectedVisual.artifact.status, 'rejected')

    const nextVisual = await saveVideoVisualPlan(
      videoId,
      {
        idempotencyToken: 'mock-p9e-save-visual-next',
        expectedReferenceVersion: 1,
        videoUnitId: `unit_${videoId}`,
        subtitleArtifactId: confirmedSubtitle.current.id,
        expectedSubtitleVersionNo: confirmedSubtitle.current.versionNo,
        backgroundAssetId: 'mock-bg-ink-motion',
        aspectRatio: '9:16',
        resolution: '1080x1920',
        subtitlePosition: 'bottom_safe',
        fontSize: 44,
        textColor: '#ffffff',
        strokeColor: '#111827',
        shadowEnabled: true,
        safeAreaPreset: 'douyin_safe',
      },
      'mock',
    )
    const confirmedVisual = await confirmVideoVisualPlan(
      videoId,
      nextVisual.artifact.id,
      { idempotencyToken: 'mock-p9e-confirm-visual', expectedVersionNo: nextVisual.artifact.versionNo },
      'mock',
    )
    assert.equal(confirmedVisual.current.id, nextVisual.artifact.id)

    const failedRender = await generateVideoRender(
      videoId,
      {
        idempotencyToken: 'mock-p9e-render-failed',
        expectedReferenceVersion: 1,
        videoUnitId: `unit_${videoId}`,
        visualPlanArtifactId: confirmedVisual.current.id,
        expectedVisualPlanVersionNo: confirmedVisual.current.versionNo,
        mockTaskOutcome: 'failed',
      },
      'mock',
    )
    assert.equal(failedRender.task.status, 'failed')
    assert.equal(failedRender.renders.length, 0)

    const render = await generateVideoRender(
      videoId,
      {
        idempotencyToken: 'mock-p9e-render',
        expectedReferenceVersion: 1,
        videoUnitId: `unit_${videoId}`,
        visualPlanArtifactId: confirmedVisual.current.id,
        expectedVisualPlanVersionNo: confirmedVisual.current.versionNo,
        retryOfTaskId: failedRender.task.id,
      },
      'mock',
    )
    assert.equal(render.renders[0].status, 'candidate')
    assert.equal(render.current, null)

    const confirmedRender = await confirmVideoRender(
      videoId,
      render.renders[0].id,
      { idempotencyToken: 'mock-p9e-confirm-render', expectedVersionNo: render.renders[0].versionNo },
      'mock',
    )
    assert.equal(confirmedRender.current.previewStatus, 'confirmed_exportable')

    const exportResult = await createVideoExport(
      videoId,
      {
        idempotencyToken: 'mock-p9e-export',
        renderVersionId: confirmedRender.current.id,
        expectedRenderVersionNo: confirmedRender.current.versionNo,
        fileName: 'first-test.mp4',
        format: 'mp4',
      },
      'mock',
    )
    assert.equal(exportResult.exportRecord.status, 'created')
    assert.equal(exportResult.exportRecord.safeSummary.includes('不代表发布'), true)

    const workbench = await getVideoWorkbench(videoId, 'mock')
    assert.equal(workbench.artifacts.visualPlan.current?.id, confirmedVisual.current.id)
    assert.equal(workbench.artifacts.renders.current?.id, confirmedRender.current.id)
    assert.equal(workbench.artifacts.exports.current?.id, exportResult.exportRecord.id)
    assert.equal(workbench.steps.find((step) => step.key === 'visual_plan')?.status, 'completed')
    assert.equal(workbench.steps.find((step) => step.key === 'render')?.status, 'completed')
    assert.equal(workbench.steps.find((step) => step.key === 'export')?.status, 'completed')
    assert.equal(workbench.recommendedAction.label, '查看导出记录')
  })

  it('calls backend video endpoints through the shared api client and keeps idempotency tokens in request bodies', async () => {
    const originalFetch = globalThis.fetch
    const requested: Array<{ url: string; method: string; body: unknown }> = []

    globalThis.fetch = (async (url, init) => {
      const requestUrl = String(url)
      requested.push({
        url: requestUrl,
        method: String(init?.method ?? 'GET'),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })

      return new Response(
        JSON.stringify({
          success: true,
          data: createResponseData(requestUrl),
          error: null,
          requestId: 'video-request',
        }),
        {
          status: requestUrl.endsWith('/videos') && init?.method === 'POST' ? 201 : 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    }) as typeof fetch

    try {
      await listVideoProjects({ referenceStatus: 'blocking' }, 'backend')
      await createVideoProject(
        {
          novelId: 'novel-video-ready',
          videoReadinessSnapshotId: 'vrs-001',
          projectType: 'first_test',
          chapterRange: { mode: 'first_recommended', chapterIds: [] },
          idempotencyToken: 'create-video-token',
        },
        'backend',
      )
      await recheckVideoReference('video-001', { expectedReferenceVersion: 1, idempotencyToken: 'recheck-video-token' }, 'backend')
      await resolveVideoReferenceIssue(
        'video-001',
        'issue-001',
        { action: 'resolve', reason: '小说侧已完成处理', idempotencyToken: 'resolve-video-token' },
        'backend',
      )
      await stopVideoProject('video-001', { reason: '用户停止该承接项目', idempotencyToken: 'stop-video-token' }, 'backend')
      await getVideoWorkbench('video-001', 'backend')
      await listVideoNarrations('video-001', 'backend')
      await generateVideoNarrations(
        'video-001',
        {
          idempotencyToken: 'generate-narration-token',
          expectedReferenceVersion: 1,
          videoUnitId: 'vunit-001',
          candidateCount: 3,
          qualityMode: 'standard',
        },
        'backend',
      )
      await editVideoNarrationDraft(
        'video-001',
        {
          idempotencyToken: 'edit-narration-token',
          baseArtifactId: 'artifact-001',
          contentText: '新的旁白稿',
          hook: '前三秒钩子',
          firstScreenSubtitle: '首屏字幕',
          endingHook: '结尾悬念',
          reason: '手动压缩',
        },
        'backend',
      )
      await confirmVideoNarration(
        'video-001',
        'artifact-001',
        { idempotencyToken: 'confirm-narration-token', expectedVersionNo: 1 },
        'backend',
      )
      await rejectVideoNarration(
        'video-001',
        'artifact-002',
        { idempotencyToken: 'reject-narration-token', reason: '不适合作为当前版本' },
        'backend',
      )
      await generateVideoTts(
        'video-001',
        {
          idempotencyToken: 'generate-tts-token',
          expectedReferenceVersion: 1,
          videoUnitId: 'vunit-001',
          narrationArtifactId: 'artifact-001',
          expectedNarrationVersionNo: 1,
          voiceId: 'mock-male-cinematic',
          voiceName: '男声-剧情感',
          speed: 1,
          emotion: 'suspense',
          volume: 90,
        },
        'backend',
      )
      await confirmVideoTts(
        'video-001',
        'audio-001',
        { idempotencyToken: 'confirm-tts-token', expectedVersionNo: 1 },
        'backend',
      )
      await rejectVideoTts(
        'video-001',
        'audio-002',
        { idempotencyToken: 'reject-tts-token', reason: '试听后节奏不合适' },
        'backend',
      )
      await listVideoSubtitles('video-001', 'backend')
      await generateVideoSubtitles(
        'video-001',
        {
          idempotencyToken: 'generate-subtitle-token',
          expectedReferenceVersion: 1,
          videoUnitId: 'vunit-001',
          ttsArtifactId: 'audio-001',
          expectedTtsVersionNo: 1,
          subtitleStyle: 'balanced',
          lineLength: 18,
        },
        'backend',
      )
      await editVideoSubtitleDraft(
        'video-001',
        {
          idempotencyToken: 'edit-subtitle-token',
          baseArtifactId: 'subtitle-001',
          contentText: '字幕第一行。\n字幕第二行。',
          firstScreenSubtitle: '首屏字幕',
          reason: '调整分行',
        },
        'backend',
      )
      await confirmVideoSubtitle(
        'video-001',
        'subtitle-001',
        { idempotencyToken: 'confirm-subtitle-token', expectedVersionNo: 1 },
        'backend',
      )
      await rejectVideoSubtitle(
        'video-001',
        'subtitle-002',
        { idempotencyToken: 'reject-subtitle-token', reason: '分行不合适' },
        'backend',
      )
      await saveVideoVisualPlan(
        'video-001',
        {
          idempotencyToken: 'save-visual-token',
          expectedReferenceVersion: 1,
          videoUnitId: 'vunit-001',
          subtitleArtifactId: 'subtitle-001',
          expectedSubtitleVersionNo: 1,
          backgroundAssetId: 'mock-bg-salt-field',
          aspectRatio: '9:16',
          resolution: '1080x1920',
          subtitlePosition: 'bottom_safe',
          fontSize: 42,
          textColor: '#ffffff',
          strokeColor: '#111827',
          shadowEnabled: true,
          safeAreaPreset: 'douyin_safe',
        },
        'backend',
      )
      await confirmVideoVisualPlan(
        'video-001',
        'visual-001',
        { idempotencyToken: 'confirm-visual-token', expectedVersionNo: 1 },
        'backend',
      )
      await rejectVideoVisualPlan(
        'video-001',
        'visual-002',
        { idempotencyToken: 'reject-visual-token', reason: '背景不适合' },
        'backend',
      )
      await generateVideoRender(
        'video-001',
        {
          idempotencyToken: 'generate-render-token',
          expectedReferenceVersion: 1,
          videoUnitId: 'vunit-001',
          visualPlanArtifactId: 'visual-001',
          expectedVisualPlanVersionNo: 1,
        },
        'backend',
      )
      await confirmVideoRender(
        'video-001',
        'render-001',
        { idempotencyToken: 'confirm-render-token', expectedVersionNo: 1 },
        'backend',
      )
      await rejectVideoRender(
        'video-001',
        'render-002',
        { idempotencyToken: 'reject-render-token', reason: '画面节奏不满意' },
        'backend',
      )
      await createVideoExport(
        'video-001',
        {
          idempotencyToken: 'create-export-token',
          renderVersionId: 'render-001',
          expectedRenderVersionNo: 1,
          fileName: 'first-test.mp4',
          format: 'mp4',
        },
        'backend',
      )

      assert.equal(requested[0].url, 'http://localhost:3001/videos?page=1&pageSize=20&referenceStatus=blocking')
      assert.equal(requested[1].url, 'http://localhost:3001/videos')
      assert.equal(requested[1].method, 'POST')
      assert.equal((requested[1].body as { idempotencyToken: string }).idempotencyToken, 'create-video-token')
      assert.equal(requested[2].url, 'http://localhost:3001/videos/video-001/reference/recheck')
      assert.equal((requested[2].body as { idempotencyToken: string }).idempotencyToken, 'recheck-video-token')
      assert.equal(requested[3].url, 'http://localhost:3001/videos/video-001/reference/issues/issue-001/resolve')
      assert.equal((requested[3].body as { reason: string }).reason, '小说侧已完成处理')
      assert.equal(requested[4].url, 'http://localhost:3001/videos/video-001/stop')
      assert.equal((requested[4].body as { idempotencyToken: string }).idempotencyToken, 'stop-video-token')
      assert.equal(requested[5].url, 'http://localhost:3001/videos/video-001/workbench')
      assert.equal(requested[5].method, 'GET')
      assert.equal(requested[6].url, 'http://localhost:3001/videos/video-001/narrations')
      assert.equal(requested[7].url, 'http://localhost:3001/videos/video-001/narrations/generate')
      assert.equal((requested[7].body as { idempotencyToken: string }).idempotencyToken, 'generate-narration-token')
      assert.equal(requested[8].url, 'http://localhost:3001/videos/video-001/narrations/drafts')
      assert.equal((requested[8].body as { contentText: string }).contentText, '新的旁白稿')
      assert.equal(requested[9].url, 'http://localhost:3001/videos/video-001/narrations/artifact-001/confirm')
      assert.equal(requested[10].url, 'http://localhost:3001/videos/video-001/narrations/artifact-002/reject')
      assert.equal(requested[11].url, 'http://localhost:3001/videos/video-001/tts/generate')
      assert.equal((requested[11].body as { voiceId: string }).voiceId, 'mock-male-cinematic')
      assert.equal(requested[12].url, 'http://localhost:3001/videos/video-001/tts/audio-001/confirm')
      assert.equal(requested[13].url, 'http://localhost:3001/videos/video-001/tts/audio-002/reject')
      assert.equal(requested[14].url, 'http://localhost:3001/videos/video-001/subtitles')
      assert.equal(requested[15].url, 'http://localhost:3001/videos/video-001/subtitles/generate')
      assert.equal((requested[15].body as { idempotencyToken: string }).idempotencyToken, 'generate-subtitle-token')
      assert.equal(requested[16].url, 'http://localhost:3001/videos/video-001/subtitles/drafts')
      assert.equal((requested[16].body as { firstScreenSubtitle: string }).firstScreenSubtitle, '首屏字幕')
      assert.equal(requested[17].url, 'http://localhost:3001/videos/video-001/subtitles/subtitle-001/confirm')
      assert.equal(requested[18].url, 'http://localhost:3001/videos/video-001/subtitles/subtitle-002/reject')
      assert.equal(requested[19].url, 'http://localhost:3001/videos/video-001/visual-plans')
      assert.equal((requested[19].body as { idempotencyToken: string }).idempotencyToken, 'save-visual-token')
      assert.equal(requested[20].url, 'http://localhost:3001/videos/video-001/visual-plans/visual-001/confirm')
      assert.equal(requested[21].url, 'http://localhost:3001/videos/video-001/visual-plans/visual-002/reject')
      assert.equal(requested[22].url, 'http://localhost:3001/videos/video-001/renders/generate')
      assert.equal((requested[22].body as { idempotencyToken: string }).idempotencyToken, 'generate-render-token')
      assert.equal(requested[23].url, 'http://localhost:3001/videos/video-001/renders/render-001/confirm')
      assert.equal(requested[24].url, 'http://localhost:3001/videos/video-001/renders/render-002/reject')
      assert.equal(requested[25].url, 'http://localhost:3001/videos/video-001/exports')
      assert.equal((requested[25].body as { idempotencyToken: string }).idempotencyToken, 'create-export-token')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

function createResponseData(url: string) {
  if (url.includes('/exports')) return { exportRecord: createExportRecord(), exports: createExportList() }
  if (url.includes('/renders/generate')) return createRenderActionResult()
  if (url.includes('/renders/') && url.includes('/confirm')) return { current: createRender({ status: 'confirmed', isCurrent: true, previewStatus: 'confirmed_exportable' }), renders: createRenderList({ hasCurrent: true }) }
  if (url.includes('/renders/') && url.includes('/reject')) return { render: createRender({ status: 'rejected', previewStatus: 'rejected_pending_revision' }), renders: createRenderList() }
  if (url.includes('/visual-plans/') && url.includes('/confirm')) return { current: createVisualPlan({ status: 'confirmed', isCurrent: true }), visualPlans: createVisualPlanList({ hasCurrent: true }) }
  if (url.includes('/visual-plans/') && url.includes('/reject')) return { artifact: createVisualPlan({ status: 'rejected' }), visualPlans: createVisualPlanList() }
  if (url.includes('/visual-plans')) return { artifact: createVisualPlan(), visualPlans: createVisualPlanList() }
  if (url.includes('/subtitles/generate')) return createSubtitleActionResult()
  if (url.includes('/subtitles/drafts')) return { artifact: createSubtitleArtifact({ status: 'draft' }), subtitles: createSubtitleList() }
  if (url.includes('/subtitles/') && url.includes('/confirm')) return { current: createSubtitleArtifact({ status: 'confirmed', isCurrent: true }), subtitles: createSubtitleList({ hasCurrent: true }) }
  if (url.includes('/subtitles/') && url.includes('/reject')) return { artifact: createSubtitleArtifact({ status: 'rejected' }), subtitles: createSubtitleList() }
  if (url.endsWith('/subtitles')) return createSubtitleList()
  if (url.includes('/tts/generate')) return createTtsActionResult()
  if (url.includes('/narrations/generate')) return createNarrationActionResult()
  if (url.includes('/narrations/drafts')) return { artifact: createNarrationArtifact({ status: 'draft' }), narrations: createNarrationList() }
  if (url.includes('/tts/') && url.includes('/confirm')) return { current: createTtsArtifact({ status: 'confirmed', isCurrent: true }), tts: createTtsList({ hasCurrent: true }) }
  if (url.includes('/tts/') && url.includes('/reject')) return { artifact: createTtsArtifact({ status: 'rejected' }), tts: createTtsList() }
  if (url.includes('/confirm')) return { current: createNarrationArtifact({ status: 'confirmed', isCurrent: true }), narrations: createNarrationList({ hasCurrent: true }) }
  if (url.includes('/reject')) return { artifact: createNarrationArtifact({ status: 'rejected' }), narrations: createNarrationList() }
  if (url.endsWith('/narrations')) return createNarrationList()
  if (url.includes('/reference/recheck') || url.includes('/issues/') || url.includes('/reference')) return createReferenceDetail()
  if (url.includes('/workbench')) return createWorkbenchDetail()
  if (url.endsWith('/stop')) {
    return {
      project: createVideoProjectDTO({ lifecycleStatus: 'stopped', productionStatus: 'generation_locked' }),
      reference: createReferenceDetail(),
      reusedExisting: false,
    }
  }
  if (url.endsWith('/videos')) {
    return {
      project: createVideoProjectDTO(),
      reference: createReferenceDetail(),
      reusedExisting: false,
    }
  }
  return {
    items: [createVideoProjectDTO({ referenceStatus: 'blocking' })],
    page: 1,
    pageSize: 20,
    total: 1,
  }
}

function createRenderActionResult() {
  return {
    task: {
      id: 'video-render-task-001',
      taskType: 'video_render_generate',
      status: 'completed',
      currentStep: 'saving_result',
      statusNote: '渲染预览已生成，等待预览确认。',
      progress: 100,
    },
    renders: [createRender()],
    current: null,
  }
}

function createRenderList(overrides: { hasCurrent?: boolean } = {}) {
  const render = createRender({ status: overrides.hasCurrent ? 'confirmed' : 'candidate', isCurrent: Boolean(overrides.hasCurrent), previewStatus: overrides.hasCurrent ? 'confirmed_exportable' : 'preview_pending' })
  return {
    current: overrides.hasCurrent ? render : null,
    candidates: overrides.hasCurrent ? [] : [render],
    history: [render],
    activeTask: null,
  }
}

function createRender(overrides: Record<string, unknown> = {}) {
  return {
    id: 'render-001',
    versionNo: 1,
    status: 'candidate',
    isCurrent: false,
    previewStatus: 'preview_pending',
    previewUrl: '/mock-video/renders/render-001.mp4',
    fileKey: 'mock://video-render/render-001.mp4',
    durationSeconds: 58,
    renderMode: 'mock_loop_background',
    qualityMode: 'standard',
    qualityIssues: ['mock 渲染预览，需人工确认'],
    safeSummary: 'mock/local render provider 仅生成系统内预览占位。',
    providerSummary: { provider: 'mock-local-render', model: 'mock-render-v1', isMockOutput: true },
    providerRouteId: 'video_render_provider.mock.v1',
    strategyVersion: 'video_render_strategy.v1',
    sourceVersionRefs: {
      videoReferenceId: 'vref-001',
      videoReferenceVersion: 1,
      videoUnitId: 'vunit-001',
      videoReadinessSnapshotId: 'vrs-001',
      narrationArtifactId: 'artifact-001',
      narrationVersionNo: 1,
      ttsArtifactId: 'audio-001',
      ttsVersionNo: 1,
      subtitleArtifactId: 'subtitle-001',
      subtitleVersionNo: 1,
      visualPlanArtifactId: 'visual-001',
      visualPlanVersionNo: 1,
      chapterContentVersionIds: ['body-v1'],
    },
    rejectedReason: null,
    confirmedAt: null,
    createdAt: '2026-06-23T10:00:00.000Z',
    ...overrides,
  }
}

function createExportList() {
  const exportRecord = createExportRecord()
  return {
    current: exportRecord,
    history: [exportRecord],
  }
}

function createExportRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'export-001',
    status: 'created',
    fileKey: 'mock://video-export/export-001.mp4',
    downloadUrl: '/mock-video/exports/export-001.mp4',
    fileName: 'first-test.mp4',
    renderVersionId: 'render-001',
    renderVersionNo: 1,
    safeSummary: '导出记录只代表系统内文件占位，不代表发布。',
    createdAt: '2026-06-23T10:00:00.000Z',
    ...overrides,
  }
}

function createVisualPlanList(overrides: { hasCurrent?: boolean } = {}) {
  const artifact = createVisualPlan({ status: overrides.hasCurrent ? 'confirmed' : 'candidate', isCurrent: Boolean(overrides.hasCurrent) })
  return {
    current: overrides.hasCurrent ? artifact : null,
    candidates: overrides.hasCurrent ? [] : [artifact],
    history: [artifact],
  }
}

function createVisualPlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'visual-001',
    artifactType: 'visual_plan',
    status: 'candidate',
    versionNo: 1,
    isCurrent: false,
    backgroundAssetId: 'mock-bg-salt-field',
    backgroundName: '盐场风沙循环背景',
    backgroundType: 'loop_background',
    aspectRatio: '9:16',
    resolution: '1080x1920',
    subtitlePosition: 'bottom_safe',
    fontSize: 42,
    textColor: '#ffffff',
    strokeColor: '#111827',
    shadowEnabled: true,
    safeAreaPreset: 'douyin_safe',
    riskTags: ['本地循环背景'],
    recommendationReason: '保存为视觉方案候选。',
    qualitySummary: 'mock/local 视觉方案，不接外部素材搜索。',
    sourceVersionRefs: {
      videoReferenceId: 'vref-001',
      videoReferenceVersion: 1,
      videoUnitId: 'vunit-001',
      videoReadinessSnapshotId: 'vrs-001',
      narrationArtifactId: 'artifact-001',
      narrationVersionNo: 1,
      ttsArtifactId: 'audio-001',
      ttsVersionNo: 1,
      subtitleArtifactId: 'subtitle-001',
      subtitleVersionNo: 1,
      chapterContentVersionIds: ['body-v1'],
    },
    providerSummary: { provider: 'mock-local-visual', model: 'mock-visual-plan-v1', isMockOutput: true },
    providerRouteId: 'video_visual_plan_provider.mock.v1',
    strategyVersion: 'video_visual_plan_strategy.v1',
    qualityMode: 'standard',
    metadata: { isMockOutput: true },
    rejectedReason: null,
    confirmedAt: null,
    createdAt: '2026-06-23T10:00:00.000Z',
    ...overrides,
  }
}

function createSubtitleActionResult() {
  return {
    task: {
      id: 'video-subtitle-task-001',
      taskType: 'video_subtitle_generate',
      status: 'completed',
      currentStep: 'saving_result',
      statusNote: '字幕候选已生成，等待编辑或确认。',
      progress: 100,
    },
    artifacts: [createSubtitleArtifact()],
    current: null,
  }
}

function createSubtitleList(overrides: { hasCurrent?: boolean } = {}) {
  const artifact = createSubtitleArtifact({ status: overrides.hasCurrent ? 'confirmed' : 'candidate', isCurrent: Boolean(overrides.hasCurrent) })
  return {
    current: overrides.hasCurrent ? artifact : null,
    candidates: overrides.hasCurrent ? [] : [artifact],
    drafts: [],
    history: [artifact],
    activeTask: null,
  }
}

function createSubtitleArtifact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'subtitle-001',
    artifactType: 'subtitle',
    status: 'candidate',
    versionNo: 1,
    isCurrent: false,
    contentText: '秦朝盐场快塌了。\n他拿出现代化学办法。',
    firstScreenSubtitle: '化学老师穿秦朝',
    timelineSummary: ['秦朝盐场快塌了。', '他拿出现代化学办法。'],
    estimatedDurationSeconds: 18,
    lineCount: 2,
    wordCount: 22,
    riskTags: ['低风险'],
    recommendationReason: '分行清楚，适合短视频字幕。',
    score: 88,
    qualitySummary: '字幕节奏稳定。',
    sourceVersionRefs: {
      videoReferenceId: 'vref-001',
      videoReferenceVersion: 1,
      videoUnitId: 'vunit-001',
      videoReadinessSnapshotId: 'vrs-001',
      narrationArtifactId: 'artifact-001',
      narrationVersionNo: 1,
      ttsArtifactId: 'audio-001',
      ttsVersionNo: 1,
      chapterContentVersionIds: ['body-v1'],
    },
    providerSummary: { provider: 'mock-local-subtitle', model: 'mock-subtitle-v1', isMockOutput: true },
    providerRouteId: 'video_subtitle_provider.mock.v1',
    strategyVersion: 'video_subtitle_strategy.v1',
    qualityMode: 'standard',
    subtitleStyle: 'balanced',
    lineLength: 18,
    metadata: { isMockOutput: true },
    rejectedReason: null,
    confirmedAt: null,
    createdAt: '2026-06-23T10:00:00.000Z',
    ...overrides,
  }
}

function createTtsActionResult() {
  return {
    task: {
      id: 'video-tts-task-001',
      taskType: 'video_tts_generate',
      status: 'completed',
      currentStep: 'saving_result',
      statusNote: '配音候选已生成，等待试听确认。',
      progress: 100,
    },
    artifacts: [createTtsArtifact()],
    current: null,
  }
}

function createTtsList(overrides: { hasCurrent?: boolean } = {}) {
  const artifact = createTtsArtifact({ status: overrides.hasCurrent ? 'confirmed' : 'candidate', isCurrent: Boolean(overrides.hasCurrent) })
  return {
    current: overrides.hasCurrent ? artifact : null,
    candidates: overrides.hasCurrent ? [] : [artifact],
    history: [artifact],
    activeTask: null,
  }
}

function createTtsArtifact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'audio-001',
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
    fileKey: 'mock://video-tts/audio-001.mp3',
    previewUrl: '/mock-audio/video-tts/audio-001.mp3',
    riskTags: ['模拟音频'],
    recommendationReason: 'mock TTS 音色稳定，适合作为验收试听占位。',
    qualitySummary: '本地 mock TTS 产物，未调用真实 TTS provider。',
    sourceVersionRefs: {
      videoReferenceId: 'vref-001',
      videoReferenceVersion: 1,
      videoUnitId: 'vunit-001',
      videoReadinessSnapshotId: 'vrs-001',
      narrationArtifactId: 'artifact-001',
      narrationVersionNo: 1,
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

function createNarrationActionResult() {
  return {
    task: {
      id: 'video-task-001',
      taskType: 'video_narration_generate',
      status: 'completed',
      currentStep: 'saving_result',
      statusNote: '旁白候选已生成，等待选择。',
      progress: 100,
    },
    artifacts: [createNarrationArtifact()],
    current: null,
  }
}

function createNarrationList(overrides: { hasCurrent?: boolean } = {}) {
  const artifact = createNarrationArtifact({ status: overrides.hasCurrent ? 'confirmed' : 'candidate', isCurrent: Boolean(overrides.hasCurrent) })
  return {
    current: overrides.hasCurrent ? artifact : null,
    candidates: overrides.hasCurrent ? [] : [artifact],
    drafts: [],
    history: [artifact],
    activeTask: null,
  }
}

function createNarrationArtifact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'artifact-001',
    artifactType: 'narration_script',
    status: 'candidate',
    versionNo: 1,
    isCurrent: false,
    contentText: '前三秒钩子：秦朝盐场快塌了，一个化学老师醒来后决定先救盐。',
    hook: '秦朝盐场快塌了，他却拿出一套化学办法。',
    firstScreenSubtitle: '化学老师穿秦朝，开局救盐场',
    endingHook: '下一道命令，让他卷进更大的风暴。',
    estimatedDurationSeconds: 58,
    wordCount: 118,
    riskTags: ['低风险'],
    recommendationReason: '钩子直接，适合首条测试。',
    score: 86,
    qualitySummary: '节奏清楚，风险可控。',
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

function createWorkbenchDetail() {
  const reference = createReferenceDetail()
  return {
    project: createVideoProjectDTO(),
    reference,
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
      label: '重新检查引用',
      stepKey: 'reference_check',
      disabled: false,
      reason: '引用状态正常，P9a 只允许重新检查引用。',
    },
    steps: [
      { key: 'reference_check', label: '引用检查', status: 'active', lockedReason: null, description: '确认引用仍有效。' },
      { key: 'narration', label: '旁白稿', status: 'placeholder_locked', lockedReason: 'P9a 只展示占位，P9b 解锁旁白稿。', description: '后续生成旁白。' },
    ],
    dependencyRefs: {
      videoReferenceId: 'vref-001',
      videoReferenceVersion: 1,
      videoUnitId: 'vunit-001',
      chapterContentVersionIds: ['body-v1'],
    },
    risks: [],
    artifacts: {
      placeholders: [{ type: 'narration_script', label: '旁白稿', status: 'not_started', currentVersionId: null, unlockPackage: 'P9b' }],
      narration: createNarrationList(),
      tts: createTtsList(),
      subtitle: createSubtitleList(),
      visualPlan: createVisualPlanList(),
      renders: createRenderList(),
      exports: createExportList(),
      render: { status: 'locked', currentRenderId: null, lockedReason: 'P9e 解锁渲染。' },
      export: { status: 'locked', currentExportId: null, lockedReason: 'P9e 解锁导出。' },
    },
    recentTasks: [],
    operationRecords: [],
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

function createReferenceDetail() {
  return {
    project: createVideoProjectDTO(),
    referenceId: 'vref-001',
    versionNo: 1,
    status: 'normal',
    chapterRangeText: '第 1-3 章',
    chapterCount: 3,
    referenceSummary: '引用快照已保存。',
    chapters: [],
    issues: [],
    nextAction: { label: '查看引用快照', disabled: false, disabledReason: null },
  }
}
