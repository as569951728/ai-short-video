import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  adoptDirection,
  adoptSetting,
  createNovelDraft,
  confirmCompletion,
  confirmVideoReadiness,
  adoptChapterContentVersion,
  createImpactAssessment,
  forcePassFullReview,
  fuseDirections,
  editDirectionCandidate,
  generateChapterPlan,
  generateBodyBatch,
  generateDirections,
  generateOutline,
  generateSetting,
  generateStageOutline,
  generateTrial,
  confirmTrial,
  getNovelDetail,
  getImpactCase,
  getChapterWorkbench,
  listNovels,
  optimizeDirection,
  resolveImpactCase,
  resolveFullReviewIssue,
  recheckVideoReadiness,
  rewriteChapter,
  startFullReview,
  toDirectionCandidateRow,
  toNovelChapterPlanRow,
  toNovelListRow,
  toStructureAssetRow,
  toTrialCandidateRow,
} from './novelService.js'
import {
  NovelCreationStage,
  NovelLifecycleStatus,
  RiskLevel,
  StageStatus,
  StaleLevel,
  TaskStatus,
  VersionStatus,
  type DirectionActionResultDTO,
  type DirectionCandidateDTO,
  type NovelDetailDTO,
  type NovelListItemDTO,
  type StructureActionResultDTO,
  type StructureAssetDTO,
  type TrialActionResultDTO,
  type TrialChapterCandidateDTO,
} from '@ai-shortvideo/shared'

describe('novel service data source switching', () => {
  it('returns prototype novels through the shared paged structure in mock mode', async () => {
    const result = await listNovels({ page: 1, pageSize: 2, keyword: '重生后' }, 'mock')

    assert.equal(result.page, 1)
    assert.equal(result.pageSize, 2)
    assert.equal(result.total, 1)
    assert.equal(result.items[0]?.title, '重生后我靠系统逆袭')
  })

  it('keeps mock video-ready rows aligned with the video handoff wording', async () => {
    const result = await listNovels({ page: 1, pageSize: 10, keyword: '玄门小师妹' }, 'mock')
    const row = result.items[0]

    assert.equal(row.videoStatus, '可被视频引用')
    assert.equal(row.action.label, '去视频列表')
    assert.equal(row.primaryAction.label, '详情')
    assert.ok(!row.action.reason.includes('创建视频'))
  })

  it('returns mock video-ready details with a video-list handoff action', async () => {
    const detail = await getNovelDetail('novel-003', 'mock')

    assert.equal(detail.creationStage, NovelCreationStage.VideoReady)
    assert.equal(detail.videoReferenceSummary.statusText, '可被视频引用')
    assert.equal(detail.statusSummary.recommendedAction.label, '去视频列表')
    assert.equal(detail.videoReadiness?.recommendedAction.label, '去视频列表')
  })

  it('provides stable mock fixtures for high-risk confirmation page regression', async () => {
    const riskTrial = await getNovelDetail('qa-risk-trial', 'mock')
    const riskyCandidate = riskTrial.latestTrialRun?.chapterOneCandidates.map(toTrialCandidateRow).find((candidate) => candidate.requiresRiskConfirm)
    assert.equal(riskTrial.creationStage, NovelCreationStage.Trial)
    assert.equal(riskTrial.stageStatus, StageStatus.WaitingUser)
    assert.ok(riskyCandidate, 'risk trial fixture should expose a selectable risky candidate')
    assert.equal(riskyCandidate?.canSelect, true)

    const bodyBatch = await getNovelDetail('qa-body-batch', 'mock')
    assert.equal(bodyBatch.creationStage, NovelCreationStage.Body)
    assert.equal(bodyBatch.bodyGeneration?.strategySnapshot?.id, 'qa-body-strategy-001')
    assert.equal(bodyBatch.bodyGeneration?.nextBatchRange.text, '第 4-8 章')
    assert.equal(bodyBatch.bodyGeneration?.recommendedAction.disabled, false)

    const fullReview = await getNovelDetail('qa-full-review', 'mock')
    assert.equal(fullReview.creationStage, NovelCreationStage.CompletionConfirm)
    assert.equal(fullReview.stageStatus, StageStatus.WaitingUser)
    assert.equal(fullReview.latestFullReview?.issues[0]?.issueId, 'mock-full-review-issue-001')
    assert.equal(fullReview.latestFullReview?.gate.allowCompletion, true)

    const videoReadiness = await getNovelDetail('qa-video-readiness', 'mock')
    assert.equal(videoReadiness.creationStage, NovelCreationStage.CompletionConfirm)
    assert.equal(videoReadiness.stageStatus, StageStatus.Completed)
    assert.equal(videoReadiness.videoReadiness?.status, 'candidate')
    assert.equal(videoReadiness.videoReadiness?.recommendedAction.label, '确认进入待视频化')
  })

  it('maps backend draft DTOs into list rows with detail as the primary action', () => {
    const row = toNovelListRow(createNovelListItemDTO())

    assert.equal(row.title, '重生后我靠系统逆袭')
    assert.equal(row.stage, '草稿已创建')
    assert.equal(row.status, '草稿已创建')
    assert.equal(row.chapterProgress, '0/80')
    assert.equal(row.creationSourceType, 'system_recommendation')
    assert.equal(row.creationSourceText, '系统推荐')
    assert.equal(row.videoReferenceStatus, 'not_referenced')
    assert.equal(row.videoStatus, '未准备')
    assert.equal(row.action.label, '进入详情')
    assert.equal(row.primaryAction.label, '详情')
    assert.notEqual(row.primaryAction.label, '创建视频')
  })

  it('maps video-ready novels as referenceable without changing the list primary action', () => {
    const dto = createNovelListItemDTO()
    dto.creationStage = NovelCreationStage.VideoReady
    dto.statusSummary.creationStage = NovelCreationStage.VideoReady
    dto.statusSummary.displayStatusText = '待视频化'
    dto.statusSummary.recommendedAction = {
      type: 'go_video_list',
      label: '去视频列表',
      reasonText: '小说已完成待视频化确认，可去视频模块查看承接。',
      target: 'detail',
      disabled: false,
      disabledReason: null,
      confirmRequired: false,
      taskType: null,
    }
    dto.videoReferenceSummary = {
      status: 'not_referenced',
      statusText: '未准备',
      referencedVideoCount: 0,
    }

    const row = toNovelListRow(dto)

    assert.equal(row.videoStatus, '可被视频引用')
    assert.equal(row.primaryAction.label, '详情')
    assert.notEqual(row.primaryAction.label, '创建视频')
  })

  it('posts draft creation requests to the backend and unwraps the unified response', async () => {
    const originalFetch = globalThis.fetch
    let requestedUrl = ''
    let requestedBody = ''

    globalThis.fetch = (async (url, init) => {
      requestedUrl = String(url)
      requestedBody = String(init?.body ?? '')

      return new Response(
        JSON.stringify({
          success: true,
          data: createNovelDetailDTO(),
          error: null,
          requestId: 'draft-request',
        }),
        {
          status: 201,
          headers: { 'content-type': 'application/json' },
        },
      )
    }) as typeof fetch

    try {
      const result = await createNovelDraft(
        {
          title: '重生后我靠系统逆袭',
          creationSourceType: 'manual_idea',
          genres: ['都市逆袭'],
          preferences: {
            appealPoints: ['低谷翻盘'],
            targetAudience: '18-35 岁爽文用户',
            customIdea: '主角被背叛后靠证据反击。',
          },
          chapterLimit: 80,
          chapterWordRange: { min: 1800, max: 2600 },
        },
        'backend',
      )

      assert.equal(requestedUrl, 'http://localhost:3001/novels/drafts')
      assert.equal(JSON.parse(requestedBody).title, '重生后我靠系统逆袭')
      assert.equal(JSON.parse(requestedBody).creationSourceType, 'manual_idea')
      assert.equal(JSON.parse(requestedBody).preferences.customIdea, '主角被背叛后靠证据反击。')
      assert.equal(result.title, '重生后我靠系统逆袭')
      assert.equal(result.statusSummary.displayStatusText, '草稿已创建')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('maps direction candidates into rows with low-score confirmation hints', () => {
    const row = toDirectionCandidateRow(createDirectionCandidateDTO({ score: 62, riskLevel: RiskLevel.High }))

    assert.equal(row.title, '低谷系统翻盘线')
    assert.equal(row.scoreText, '62')
    assert.equal(row.marketScoreText, '58')
    assert.equal(row.statusKey, VersionStatus.Candidate)
    assert.equal(row.lowScoreRequiresConfirm, true)
    assert.equal(row.riskLevelText, '高风险')
    assert.equal(row.primaryReason, '差异化强但理解成本偏高。')
  })

  it('posts direction generation and adoption requests to the backend', async () => {
    const originalFetch = globalThis.fetch
    const requested: Array<{ url: string; method: string; body: unknown }> = []

    globalThis.fetch = (async (url, init) => {
      requested.push({
        url: String(url),
        method: String(init?.method ?? 'GET'),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })

      return new Response(
        JSON.stringify({
          success: true,
          data: createDirectionActionResultDTO(),
          error: null,
          requestId: 'direction-request',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    }) as typeof fetch

    try {
      const generated = await generateDirections('novel-001', {}, 'backend')
      await optimizeDirection('novel-001', generated.candidates[0].id, { instruction: '强化短视频钩子' }, 'backend')
      await adoptDirection(
        'novel-001',
        generated.candidates[0].id,
        {
          confirmLowScore: true,
          reason: '低分但差异化明确，先进入设定验证。',
          pageVersionSnapshot: { seenCandidateVersionId: generated.candidates[0].id },
        },
        'backend',
      )

      assert.equal(requested[0].url, 'http://localhost:3001/novels/novel-001/directions/generate')
      assert.equal(requested[0].method, 'POST')
      assert.equal(requested[1].url, 'http://localhost:3001/novels/novel-001/directions/cv-001/optimize')
      assert.equal(requested[1].body.instruction, '强化短视频钩子')
      assert.equal(requested[2].url, 'http://localhost:3001/novels/novel-001/directions/cv-001/adopt')
      assert.equal(requested[2].body.confirmLowScore, true)
      assert.equal(requested[2].body.reason, '低分但差异化明确，先进入设定验证。')
      assert.equal(generated.candidates.length, 1)
      assert.equal(generated.statusSummary.displayStatusText, '待选择方向')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('keeps mock generated direction candidates visible after detail refresh', async () => {
    const novelId = `mock-visible-${Date.now()}`

    const before = await getNovelDetail(novelId, 'mock')
    assert.equal(before.directionCandidates.length, 0)
    assert.equal(before.recentTask, null)

    const generated = await generateDirections(novelId, {}, 'mock')
    const after = await getNovelDetail(novelId, 'mock')

    assert.equal(after.directionCandidates.length, generated.candidates.length)
    assert.equal(after.directionCandidates[0].id, generated.candidates[0].id)
    assert.equal(after.recentTask?.id, generated.task.id)
    assert.equal(after.recentTasks[0]?.id, generated.task.id)
  })

  it('keeps mock fused and optimized direction candidates visible after detail refresh', async () => {
    const novelId = `mock-direction-revision-${Date.now()}`
    const generated = await generateDirections(novelId, {}, 'mock')

    const fused = await fuseDirections(
      novelId,
      {
        versionIds: generated.candidates.map((candidate) => candidate.id).slice(0, 2),
        reason: '融合两个候选的钩子和爽点',
      },
      'mock',
    )
    const afterFuse = await getNovelDetail(novelId, 'mock')
    assert.ok(afterFuse.directionCandidates.some((candidate) => candidate.id === fused.candidate?.id))
    assert.equal(afterFuse.recentTask?.id, fused.task.id)

    const optimized = await optimizeDirection(
      novelId,
      generated.candidates[0].id,
      { instruction: '强化前三秒钩子' },
      'mock',
    )
    const afterOptimize = await getNovelDetail(novelId, 'mock')
    assert.ok(afterOptimize.directionCandidates.some((candidate) => candidate.id === optimized.candidate?.id))
    assert.equal(afterOptimize.recentTask?.id, optimized.task.id)
    assert.ok(afterOptimize.directionCandidates.length >= generated.candidates.length + 2)
  })

  it('keeps mock manually edited direction candidates visible after detail refresh', async () => {
    const novelId = `mock-direction-edit-${Date.now()}`
    const generated = await generateDirections(novelId, {}, 'mock')
    const edited = await editDirectionCandidate(
      novelId,
      generated.candidates[0].id,
      {
        title: '手动编辑方向',
        logline: '用户直接微调后形成的新方向。',
        coreHook: '先用反差开场，再给明确逆袭承诺。',
        audienceAppeal: '短视频爽文读者',
        videoPotential: '适合前三秒强钩子口播。',
        sellingPoints: ['反差开场', '逆袭承诺'],
        riskTags: ['避免空泛'],
        recommendation: '手动编辑后再对比采用。',
        reason: '用户手动编辑候选',
      },
      'mock',
    )
    const afterEdit = await getNovelDetail(novelId, 'mock')

    assert.ok(afterEdit.directionCandidates.some((candidate) => candidate.id === edited.candidate?.id))
    assert.equal(afterEdit.recentTask?.taskType, 'novel_direction_manual_edit')
    assert.equal(afterEdit.recentTask?.id, edited.task.id)
  })

  it('maps structure assets and chapter plans into workbench rows', () => {
    const asset = createStructureAssetDTO()
    const row = toStructureAssetRow(asset)
    const chapter = toNovelChapterPlanRow({
      id: 'chapter-001',
      chapterNo: 1,
      stageIndex: 1,
      title: '第1章 背锅开局',
      wordTarget: 2200,
      wordCount: 0,
      mainStatus: 'pending',
      statusNote: '章节目录已确认，正文尚未生成。',
      impactLevel: 'none',
      currentContentVersionId: null,
      createdAt: '2026-06-17T12:00:00.000Z',
      updatedAt: '2026-06-17T12:00:00.000Z',
    })

    assert.equal(row.typeText, '章节目录')
    assert.equal(row.status, '候选版本')
    assert.equal(row.chapterCount, 1)
    assert.equal(row.canAdopt, true)
    assert.equal(row.primaryReason, '章节目录字段完整，可以进入试写前置。')
    assert.equal(chapter.statusText, '待试写')
    assert.equal(chapter.wordTarget, '2200')
  })

  it('posts structure generation and adoption requests to the backend', async () => {
    const originalFetch = globalThis.fetch
    const requested: Array<{ url: string; method: string; body: unknown }> = []

    globalThis.fetch = (async (url, init) => {
      requested.push({
        url: String(url),
        method: String(init?.method ?? 'GET'),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })

      return new Response(
        JSON.stringify({
          success: true,
          data: createStructureActionResultDTO(),
          error: null,
          requestId: 'structure-request',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    }) as typeof fetch

    try {
      await generateSetting('novel-001', {}, 'backend')
      await generateOutline('novel-001', {}, 'backend')
      await generateStageOutline('novel-001', {}, 'backend')
      await generateChapterPlan('novel-001', {}, 'backend')
      await adoptSetting(
        'novel-001',
        'cv-setting-001',
        {
          reason: '设定完整，采用为大纲输入。',
          pageVersionSnapshot: { seenCandidateVersionId: 'cv-setting-001' },
        },
        'backend',
      )

      assert.equal(requested[0].url, 'http://localhost:3001/novels/novel-001/settings/generate')
      assert.equal(requested[1].url, 'http://localhost:3001/novels/novel-001/outlines/generate')
      assert.equal(requested[2].url, 'http://localhost:3001/novels/novel-001/stage-outlines/generate')
      assert.equal(requested[3].url, 'http://localhost:3001/novels/novel-001/chapter-plans/generate')
      assert.equal(requested[4].url, 'http://localhost:3001/novels/novel-001/settings/cv-setting-001/adopt')
      assert.equal(requested[4].body.reason, '设定完整，采用为大纲输入。')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('posts trial generation, confirmation, and chapter workbench requests to the backend', async () => {
    const originalFetch = globalThis.fetch
    const requested: Array<{ url: string; method: string; body: unknown }> = []

    globalThis.fetch = (async (url, init) => {
      requested.push({
        url: String(url),
        method: String(init?.method ?? 'GET'),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })

      const data = String(url).includes('/chapters/')
        ? createChapterWorkbenchDTO()
        : createTrialActionResultDTO()

      return new Response(
        JSON.stringify({
          success: true,
          data,
          error: null,
          requestId: 'trial-request',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    }) as typeof fetch

    try {
      const generated = await generateTrial('novel-001', { chapterCount: 3 }, 'backend')
      await generateTrial('novel-001', {
        trialRunId: generated.trialRun.id,
        selectedCandidateId: generated.trialRun.chapterOneCandidates[0].id,
        confirmRisk: true,
        selectionReason: '高风险候选已人工确认，继续用于试写验证。',
      }, 'backend')
      await confirmTrial('novel-001', { trialRunId: generated.trialRun.id, decision: 'confirm_pass' }, 'backend')
      await getChapterWorkbench('novel-001', 'chapter-001', 'backend')
      const row = toTrialCandidateRow(generated.trialRun.chapterOneCandidates[0])

      assert.equal(requested[0].url, 'http://localhost:3001/novels/novel-001/trial/generate')
      assert.equal(requested[0].method, 'POST')
      assert.equal(requested[0].body.chapterCount, 3)
      assert.equal(requested[1].body.selectedCandidateId, 'trial-candidate-001')
      assert.equal(requested[1].body.confirmRisk, true)
      assert.equal(requested[1].body.selectionReason, '高风险候选已人工确认，继续用于试写验证。')
      assert.equal(requested[2].url, 'http://localhost:3001/novels/novel-001/trial/confirm')
      assert.equal(requested[3].url, 'http://localhost:3001/novels/novel-001/chapters/chapter-001')
      assert.equal(row.isAiRecommended, true)
      assert.equal(row.canSelect, true)
      assert.equal(row.evidence.length, 1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('posts package 6 body generation, rewrite, adoption, and impact requests to the backend', async () => {
    const originalFetch = globalThis.fetch
    const requested: Array<{ url: string; method: string; body: unknown }> = []

    globalThis.fetch = (async (url, init) => {
      requested.push({
        url: String(url),
        method: String(init?.method ?? 'GET'),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })

      return new Response(
        JSON.stringify({
          success: true,
          data: createPackage6ResponseDTO(String(url)),
          error: null,
          requestId: 'body-request',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    }) as typeof fetch

    try {
      await generateBodyBatch(
        'novel-001',
        { strategySnapshotId: 'strategy-001', expectedStrategySnapshotVersion: 1, idempotencyKey: 'body-batch-ui-1' },
        'backend',
      )
      await rewriteChapter('novel-001', 'chapter-004', { instruction: '强化结尾', currentContentVersionId: 'content-004' }, 'backend')
      await adoptChapterContentVersion('novel-001', 'chapter-004', 'candidate-004', { reason: '采用候选', currentContentVersionId: 'content-004' }, 'backend')
      await createImpactAssessment('novel-001', 'chapter-004', { reason: '检查后续影响' }, 'backend')
      await getImpactCase('novel-001', 'impact-001', 'backend')
      await resolveImpactCase('novel-001', 'impact-001', { resolution: 'resolved', reason: '已处理' }, 'backend')

      assert.equal(requested[0].url, 'http://localhost:3001/novels/novel-001/chapters/batch-generate')
      assert.equal(requested[0].body.strategySnapshotId, 'strategy-001')
      assert.equal(requested[0].body.idempotencyKey, 'body-batch-ui-1')
      assert.equal(requested[1].url, 'http://localhost:3001/novels/novel-001/chapters/chapter-004/rewrite')
      assert.equal(requested[1].body.currentContentVersionId, 'content-004')
      assert.equal(requested[2].url, 'http://localhost:3001/novels/novel-001/chapters/chapter-004/content-versions/candidate-004/adopt')
      assert.equal(requested[3].url, 'http://localhost:3001/novels/novel-001/chapters/chapter-004/impact-assessments')
      assert.equal(requested[4].url, 'http://localhost:3001/novels/novel-001/impact-cases/impact-001')
      assert.equal(requested[5].url, 'http://localhost:3001/novels/novel-001/impact-cases/impact-001/resolve')
      assert.equal(requested[5].body.reason, '已处理')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('posts package 7 full-review, completion, and video-readiness requests to the backend', async () => {
    const originalFetch = globalThis.fetch
    const requested: Array<{ url: string; method: string; body: unknown }> = []

    globalThis.fetch = (async (url, init) => {
      requested.push({
        url: String(url),
        method: String(init?.method ?? 'GET'),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })

      return new Response(
        JSON.stringify({
          success: true,
          data: createPackage7ResponseDTO(String(url)),
          error: null,
          requestId: 'package7-request',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    }) as typeof fetch

    try {
      await startFullReview('novel-001', { idempotencyKey: 'full-review-ui-1', expectedNovelVersion: '2026-06-18T00:00:00.000Z' }, 'backend')
      await resolveFullReviewIssue('novel-001', 'review-001', { issueId: 'issue-001', action: 'resolve', reason: '已复查' }, 'backend')
      await forcePassFullReview('novel-001', 'review-001', { idempotencyKey: 'force-pass-ui-1', fullReviewGateId: 'gate-001', reason: '接受风险', confirmRisk: true }, 'backend')
      await confirmCompletion('novel-001', { idempotencyKey: 'completion-ui-1', reviewReportId: 'review-001', fullReviewGateId: 'gate-001', reason: '确认完成' }, 'backend')
      await recheckVideoReadiness('novel-001', { idempotencyKey: 'readiness-recheck-ui-1' }, 'backend')
      const readiness = await confirmVideoReadiness(
        'novel-001',
        { idempotencyKey: 'readiness-confirm-ui-1', completionDecisionId: 'completion-001', readinessCheckId: 'video-check-001', checkVersion: 1 },
        'backend',
      )

      assert.equal(requested[0].url, 'http://localhost:3001/novels/novel-001/full-review')
      assert.equal(requested[0].body.idempotencyKey, 'full-review-ui-1')
      assert.equal(requested[1].url, 'http://localhost:3001/novels/novel-001/full-review/review-001/resolve-issue')
      assert.equal(requested[2].url, 'http://localhost:3001/novels/novel-001/full-review/review-001/force-pass')
      assert.equal(requested[2].body.confirmRisk, true)
      assert.equal(requested[3].url, 'http://localhost:3001/novels/novel-001/completion/confirm')
      assert.equal(requested[4].url, 'http://localhost:3001/novels/novel-001/video-readiness/recheck')
      assert.equal(requested[5].url, 'http://localhost:3001/novels/novel-001/video-readiness/confirm')
      assert.equal(readiness.videoReadiness.recommendedAction.label, '去视频列表')
      assert.notEqual(readiness.videoReadiness.recommendedAction.label, '创建视频')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

function createPackage7ResponseDTO(url: string): any {
  const statusSummary = {
    ...createNovelListItemDTO().statusSummary,
    creationStage: url.includes('/video-readiness/confirm') ? NovelCreationStage.VideoReady : NovelCreationStage.CompletionConfirm,
    stageStatus: url.includes('/completion/confirm') ? StageStatus.Completed : StageStatus.WaitingUser,
    recommendedAction: {
      type: url.includes('/video-readiness/confirm') ? 'go_video_list' : 'confirm_completion',
      label: url.includes('/video-readiness/confirm') ? '去视频列表' : '确认小说完成',
      reasonText: '任务包 7 测试响应。',
      target: 'detail',
      disabled: false,
      disabledReason: null,
      confirmRequired: !url.includes('/video-readiness/confirm'),
      taskType: null,
    },
  }
  const task = {
    id: 'task-full-review-001',
    taskType: 'novel_full_review',
    status: TaskStatus.Completed,
    statusText: '已完成',
    progress: 100,
    currentStep: '全书审稿完成',
    resultVersionIds: [],
  }
  const fullReview = {
    id: 'review-001',
    version: 1,
    reviewLevel: 'full_novel',
    totalScore: 84,
    rating: 'A-',
    gateResult: 'pass',
    summary: '全书审稿通过。',
    strengths: ['主线连续'],
    problems: [],
    suggestions: ['确认完成'],
    dimensionScores: [],
    issues: [
      {
        issueId: 'issue-001',
        title: '轻微节奏问题',
        plainDescription: '不阻塞完成确认。',
        severity: 'warning',
        scopeType: 'chapter',
        scopeRefs: ['chapter-005'],
        dimension: 'rhythm',
        blocking: false,
        recommendedTarget: 'chapter_workbench',
        recommendedAction: '复查章节',
        status: 'open',
        acceptedReason: null,
      },
    ],
    videoSuggestion: '建议第 1-2 章作为首条视频。',
    firstVideoSuggestion: createFirstVideoSuggestionDTO(),
    platformRisks: [],
    originalityRisks: [],
    aiFlavorRisks: [],
    lowScoreContinueRisks: [],
    reviewPolicyVersionId: 'full-review-policy-v1',
    sourceVersionRefs: {},
    gate: {
      id: 'gate-001',
      reviewReportId: 'review-001',
      gateResult: 'pass',
      gateResultText: '通过',
      allowCompletion: true,
      allowVideoReady: true,
      blockingIssueCount: 0,
      warningIssueCount: 1,
      forcePassAllowed: false,
      forcePassReason: null,
      isStale: false,
      staleReason: null,
      createdAt: '2026-06-18T00:00:00.000Z',
    },
    createdAt: '2026-06-18T00:00:00.000Z',
  }
  const completionDecision = {
    id: 'completion-001',
    reviewReportId: 'review-001',
    fullReviewGateId: 'gate-001',
    decision: 'confirm_completion',
    reason: '确认完成',
    isForced: false,
    score: 84,
    riskSummary: '全书审稿通过。',
    chapterCount: 12,
    totalWordCount: 26000,
    estimatedAudioMinutes: 93,
    createdAt: '2026-06-18T00:00:00.000Z',
  }
  const videoReadiness = {
    novelId: 'novel-001',
    status: url.includes('/video-readiness/confirm') ? 'ready' : 'candidate',
    statusText: url.includes('/video-readiness/confirm') ? '已进入待视频化' : '待确认视频化',
    check: {
      id: 'video-check-001',
      version: 1,
      status: 'candidate',
      statusText: '待确认视频化',
      checkItems: [],
      blockingReasons: [],
      firstVideoSuggestion: createFirstVideoSuggestionDTO(),
      createdAt: '2026-06-18T00:00:00.000Z',
    },
    checkItems: [],
    blockingReasons: [],
    completionDecision,
    snapshot: url.includes('/video-readiness/confirm')
      ? {
          id: 'video-ready-001',
          completionDecisionId: 'completion-001',
          reviewReportId: 'review-001',
          status: 'ready',
          chapterCount: 12,
          totalWordCount: 26000,
          estimatedAudioMinutes: 93,
          riskSummary: '全书审稿通过。',
          referableChapterIds: ['chapter-001'],
          referableChapterVersionIds: ['content-001'],
          firstVideoSuggestion: createFirstVideoSuggestionDTO(),
          createdAt: '2026-06-18T00:00:00.000Z',
        }
      : null,
    firstVideoSuggestion: createFirstVideoSuggestionDTO(),
    recommendedAction: {
      type: url.includes('/video-readiness/confirm') ? 'go_video_list' : 'confirm_video_readiness',
      label: url.includes('/video-readiness/confirm') ? '去视频列表' : '确认进入待视频化',
      reasonText: '待视频化检查通过。',
      target: 'detail',
      disabled: false,
      disabledReason: null,
      confirmRequired: !url.includes('/video-readiness/confirm'),
      taskType: 'video_readiness_check',
    },
  }

  if (url.includes('/resolve-issue')) {
    return { novelId: 'novel-001', statusSummary, fullReview, issue: fullReview.issues[0], nextAction: statusSummary.recommendedAction }
  }
  if (url.includes('/completion/confirm')) {
    return { novelId: 'novel-001', statusSummary, completionDecision, videoReadiness, affectedObjects: ['completion_decision'], nextAction: videoReadiness.recommendedAction }
  }
  if (url.includes('/video-readiness')) {
    return { novelId: 'novel-001', statusSummary, task: null, videoReadiness, affectedObjects: ['video_readiness_snapshot'], nextAction: videoReadiness.recommendedAction }
  }

  return { novelId: 'novel-001', statusSummary, task, fullReview, affectedObjects: ['review_report'], nextAction: statusSummary.recommendedAction }
}

function createFirstVideoSuggestionDTO() {
  return {
    chapterRange: '第 1-2 章',
    openingSlice: '开场反击',
    narrationHook: '三秒内翻盘。',
    firstScreenSubtitle: '被逼到绝路，她反手翻盘',
    titleHook: '被裁员当天，我接管了未来公司',
    endingSuspense: '证据背后还有人。',
    suggestedFormat: '口播解说',
    riskTips: [],
  }
}

function createPackage6ResponseDTO(url: string): any {
  const statusSummary = createNovelListItemDTO().statusSummary
  const task = {
    id: 'task-body-001',
    taskType: 'body_batch_generate',
    status: TaskStatus.Completed,
    statusText: '已完成',
    progress: 100,
    currentStep: '批次总结已生成',
    resultVersionIds: ['content-004'],
  }
  const impactCase = {
    id: 'impact-001',
    novelId: 'novel-001',
    sourceChapterId: 'chapter-004',
    sourceOldVersionId: 'content-004',
    sourceNewVersionId: 'candidate-004',
    impactLevel: 'medium',
    impactLevelText: '中等影响',
    status: 'waiting_decision',
    statusText: '等待处理',
    summary: '当前章改动会影响后续章节承接。',
    changedFacts: ['旧码头线索变化'],
    affectedChapterIds: ['chapter-005'],
    affectedVideoReferenceIds: [],
    recommendedHandling: '逐章确认受影响章节。',
    suggestedActions: ['逐章处理'],
    blocksFullReview: true,
    createdAt: '2026-06-17T12:00:00.000Z',
    resolvedAt: null,
  }

  if (url.includes('/impact-cases/') && !url.endsWith('/resolve')) return impactCase
  if (url.endsWith('/resolve')) {
    return {
      novelId: 'novel-001',
      statusSummary,
      impactCase: { ...impactCase, status: 'resolved', statusText: '已处理', blocksFullReview: false },
      nextAction: statusSummary.recommendedAction,
    }
  }
  if (url.includes('/rewrite')) {
    return {
      novelId: 'novel-001',
      statusSummary,
      task: { ...task, taskType: 'chapter_body_rewrite' },
      chapter: createChapterDTO(),
      currentContent: createTrialCandidateDTO(),
      candidate: { ...createTrialCandidateDTO(), id: 'candidate-004', status: VersionStatus.Candidate },
      summaryCompare: {
        currentSummary: '当前正文摘要',
        candidateSummary: '候选正文摘要',
        benefit: '强化结尾钩子',
        newRisks: ['可能影响后续'],
        possibleImpact: '可能影响后续章节承接。',
        aiSuggestion: '采用后先做影响评估。',
      },
      affectedObjects: ['chapter_candidate_version'],
      nextAction: statusSummary.recommendedAction,
    }
  }
  if (url.includes('/adopt')) {
    return {
      novelId: 'novel-001',
      statusSummary,
      task: { ...task, taskType: 'chapter_impact_assess' },
      chapter: createChapterDTO(),
      previousContentVersionId: 'content-004',
      currentContent: { ...createTrialCandidateDTO(), id: 'candidate-004', status: VersionStatus.Current },
      impactCase,
      affectedObjects: ['impact_case'],
      nextAction: statusSummary.recommendedAction,
    }
  }
  if (url.includes('/impact-assessments')) {
    return {
      novelId: 'novel-001',
      statusSummary,
      task: { ...task, taskType: 'chapter_impact_assess' },
      impactCase,
      nextAction: statusSummary.recommendedAction,
    }
  }

  return {
    novelId: 'novel-001',
    statusSummary,
    task,
    batch: {
      id: 'batch-001',
      taskId: task.id,
      status: 'completed',
      statusText: '本批完成',
      strategySnapshotId: 'strategy-001',
      strategySnapshotVersion: 1,
      startChapterNo: 4,
      endChapterNo: 8,
      totalCount: 5,
      completedCount: 5,
      failedCount: 0,
      pendingCount: 0,
      failedChapterNo: null,
      statusNote: '本批完成。',
      chapterResults: [],
      summary: {
        id: 'summary-001',
        batchId: 'batch-001',
        conclusion: '本批完成。',
        chapterResults: [],
        riskTrend: '稳定',
        nextBatchNotes: [],
        riskChapterIds: [],
        createdAt: '2026-06-17T12:00:00.000Z',
      },
      createdAt: '2026-06-17T12:00:00.000Z',
    },
    bodyGeneration: {
      strategySnapshot: null,
      latestBatch: null,
      openImpactCases: [],
      nextBatchRange: { startChapterNo: 9, endChapterNo: 12, batchSize: 4, text: '第 9-12 章' },
      chapterProgress: { plannedChapterCount: 12, completedChapterCount: 8, pendingChapterCount: 4, text: '8/12' },
      blockingReasons: [],
      recommendedAction: statusSummary.recommendedAction,
    },
    chapters: [],
    affectedObjects: ['chapters'],
    nextAction: statusSummary.recommendedAction,
  }
}

function createChapterDTO() {
  return {
    id: 'chapter-004',
    chapterNo: 4,
    stageIndex: 2,
    title: '第4章 正文节点',
    wordTarget: 2200,
    wordCount: 2200,
    mainStatus: 'completed',
    statusNote: '正文已生成。',
    impactLevel: 'none',
    currentContentVersionId: 'content-004',
    createdAt: '2026-06-17T12:00:00.000Z',
    updatedAt: '2026-06-17T12:00:00.000Z',
  }
}

function createNovelListItemDTO(): NovelListItemDTO {
  return {
    id: 'novel-001',
    title: '重生后我靠系统逆袭',
    channel: 'novel',
    genres: ['都市逆袭'],
    lifecycleStatus: NovelLifecycleStatus.Active,
    creationStage: NovelCreationStage.Draft,
    stageStatus: StageStatus.NotStarted,
    statusSummary: {
      lifecycleStatus: NovelLifecycleStatus.Active,
      creationStage: NovelCreationStage.Draft,
      stageStatus: StageStatus.NotStarted,
      displayStatus: 'draft_created',
      displayStatusText: '草稿已创建',
      currentStep: '准备生成小说方向',
      completedSteps: ['创建草稿'],
      blockingReasons: [],
      recommendedAction: {
        type: 'view_detail',
        label: '进入详情',
        reasonText: '暂无 AI 结果，下一步需要进入详情后生成小说方向。',
        target: 'detail',
        disabled: false,
        disabledReason: null,
        confirmRequired: false,
        taskType: 'novel_direction_generate',
      },
      videoPreparationStatus: 'not_ready',
      videoReferenceStatus: 'not_referenced',
      calculatedAt: '2026-06-17T10:00:00.000Z',
      calculationVersion: 'novel-status-v1',
    },
    scoreSummary: {
      qualityScore: null,
      marketScore: null,
      riskLevel: 'none',
    },
    chapterProgress: {
      plannedChapterCount: 80,
      completedChapterCount: 0,
      pendingChapterCount: 0,
      text: '0/80',
    },
    videoReferenceSummary: {
      status: 'not_referenced',
      statusText: '未准备',
      referencedVideoCount: 0,
    },
    creationSource: {
      type: 'system_recommendation',
      label: '系统推荐',
      description: '按题材、爽点和默认策略作为方向生成参考。',
      hotspotReportId: null,
      hotspotOpportunityId: null,
      hotspotTitle: null,
      hotspotOpportunityTitle: null,
      isLegacyUnknown: false,
      unavailableReason: null,
    },
    recentTask: null,
    primaryAction: {
      type: 'view_detail',
      label: '详情',
      target: 'detail',
    },
    createdAt: '2026-06-17T10:00:00.000Z',
    updatedAt: '2026-06-17T10:00:00.000Z',
  }
}

function createNovelDetailDTO(): NovelDetailDTO {
  const item = createNovelListItemDTO()

  return {
    ...item,
    preferences: {
      creationSourceType: 'system_recommendation',
      creationSourceLabel: '系统推荐',
      creationSourceDescription: '按题材、爽点和默认策略作为方向生成参考。',
      hotspotReportId: null,
      hotspotOpportunityId: null,
      hotspotTitle: null,
      hotspotOpportunityTitle: null,
      appealPoints: ['低谷翻盘'],
      genres: ['都市逆袭'],
      openingState: null,
      blockedElements: [],
      targetAudience: '18-35 岁爽文用户',
      chapterLimit: 80,
      chapterWordMin: 1800,
      chapterWordMax: 2600,
      stageCount: null,
      customIdea: null,
      style: null,
      videoAdaptationPreference: null,
    },
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
    chapterStats: item.chapterProgress,
    latestTrialRun: null,
    bodyStrategySnapshot: null,
    recentTasks: [],
    blockingReasons: [],
    videoSummary: item.videoReferenceSummary,
  }
}

function createDirectionActionResultDTO(): DirectionActionResultDTO {
  const candidate = createDirectionCandidateDTO()

  return {
    novelId: 'novel-001',
    statusSummary: {
      lifecycleStatus: NovelLifecycleStatus.Active,
      creationStage: NovelCreationStage.Direction,
      stageStatus: StageStatus.WaitingUser,
      displayStatus: 'direction_waiting_user',
      displayStatusText: '待选择方向',
      currentStep: '比较并采用小说方向',
      completedSteps: ['创建草稿'],
      blockingReasons: [],
      recommendedAction: {
        type: 'adopt_direction',
        label: '选择方向',
        reasonText: '已生成方向候选，采用一个方向后进入设定阶段。',
        target: 'detail',
        disabled: false,
        disabledReason: null,
        confirmRequired: false,
        taskType: 'novel_direction_adopt',
      },
      videoPreparationStatus: 'not_ready',
      videoReferenceStatus: 'not_referenced',
      calculatedAt: '2026-06-17T11:00:00.000Z',
      calculationVersion: 'novel-status-v1',
    },
    task: {
      id: 'task-001',
      taskType: 'novel_direction_generate',
      status: TaskStatus.WaitingConfirmation,
      statusText: '待确认结果',
      progress: 100,
      currentStep: '方向候选已生成，等待选择',
      resultVersionIds: ['cv-001'],
    },
    candidates: [candidate],
    candidate,
    currentDirection: null,
    affectedObjects: ['direction'],
    nextAction: {
      type: 'adopt_direction',
      label: '选择方向',
      reasonText: '已生成方向候选，采用一个方向后进入设定阶段。',
      target: 'detail',
      disabled: false,
      disabledReason: null,
      confirmRequired: false,
      taskType: 'novel_direction_adopt',
    },
  }
}

function createDirectionCandidateDTO(overrides: Partial<DirectionCandidateDTO> = {}): DirectionCandidateDTO {
  return {
    id: 'cv-001',
    versionNo: 1,
    status: VersionStatus.Candidate,
    staleLevel: StaleLevel.None,
    title: '低谷系统翻盘线',
    summary: '主角在最低谷获得成长系统，逐步完成反击。',
    content: {
      title: '低谷系统翻盘线',
      logline: '主角在最低谷获得成长系统，逐步完成反击。',
      coreHook: '前三章先给强压迫，再给公开反击。',
      audienceAppeal: '18-35 岁爽文用户',
      videoPotential: '适合拆成口播短视频。',
      sellingPoints: ['反击节奏明确', '短视频钩子清晰'],
      riskTags: ['理解成本高'],
      recommendation: '低分候选，仅建议测试采用。',
    },
    score: 62,
    marketScore: 58,
    riskLevel: RiskLevel.High,
    riskTags: ['理解成本高'],
    recommendedReason: '差异化强但理解成本偏高。',
    createdAt: '2026-06-17T11:00:00.000Z',
    ...overrides,
  }
}

function createStructureActionResultDTO(): StructureActionResultDTO {
  const candidate = createStructureAssetDTO()

  return {
    novelId: 'novel-001',
    statusSummary: {
      lifecycleStatus: NovelLifecycleStatus.Active,
      creationStage: NovelCreationStage.ChapterPlan,
      stageStatus: StageStatus.WaitingUser,
      displayStatus: 'chapter_plan_waiting_user',
      displayStatusText: '待确认章节目录',
      currentStep: '确认章节目录',
      completedSteps: ['创建草稿', '确认方向', '确认设定', '确认大纲'],
      blockingReasons: [],
      recommendedAction: {
        type: 'adopt_chapter_plan',
        label: '采用章节目录',
        reasonText: '章节目录候选已生成，采用后只创建章节计划，不生成正文。',
        target: 'detail',
        disabled: false,
        disabledReason: null,
        confirmRequired: false,
        taskType: 'adopt_chapter_plan',
      },
      videoPreparationStatus: 'not_ready',
      videoReferenceStatus: 'not_referenced',
      calculatedAt: '2026-06-17T12:00:00.000Z',
      calculationVersion: 'novel-status-v1',
    },
    task: {
      id: 'task-structure-001',
      taskType: 'chapter_plan_generate',
      status: TaskStatus.WaitingConfirmation,
      statusText: '待确认结果',
      progress: 100,
      currentStep: '章节目录候选已生成',
      resultVersionIds: ['cv-structure-001'],
    },
    candidates: [candidate],
    candidate,
    currentAssets: {
      direction: null,
      setting: null,
      outline: null,
      stageOutline: null,
      chapterPlan: null,
    },
    chapters: [],
    affectedObjects: ['chapter_plan'],
    nextAction: {
      type: 'adopt_chapter_plan',
      label: '采用章节目录',
      reasonText: '章节目录候选已生成，采用后只创建章节计划，不生成正文。',
      target: 'detail',
      disabled: false,
      disabledReason: null,
      confirmRequired: false,
      taskType: 'adopt_chapter_plan',
    },
  }
}

function createStructureAssetDTO(overrides: Partial<StructureAssetDTO> = {}): StructureAssetDTO {
  return {
    id: 'cv-structure-001',
    objectType: 'chapter_plan',
    versionNo: 1,
    status: VersionStatus.Candidate,
    staleLevel: StaleLevel.None,
    title: '章节目录候选',
    summary: '生成逐章目标、冲突和钩子。',
    content: {
      title: '章节目录候选',
      summary: '生成逐章目标、冲突和钩子。',
      sections: [
        {
          title: '章节目录说明',
          body: '只创建章节计划，不生成正文。',
          items: ['目标', '冲突', '钩子'],
        },
      ],
      stages: [
        {
          stageIndex: 1,
          title: '第一阶段：低谷破局',
          chapterRange: '1-20章',
          goal: '建立压迫和第一次反击',
          conflict: '主角缺少信任与资源',
          payoff: '完成公开反击',
        },
      ],
      chapters: [
        {
          chapterNo: 1,
          stageIndex: 1,
          title: '第1章 背锅开局',
          wordTarget: 2200,
          goal: '建立低谷处境',
          conflict: '主角被迫背锅',
          hook: '新证据出现',
        },
      ],
      riskTags: ['目录需要试写验证'],
      recommendation: '可采用进入试写前置。',
    },
    score: 82,
    riskLevel: RiskLevel.Low,
    riskTags: ['目录需要试写验证'],
    recommendedReason: '章节目录字段完整，可以进入试写前置。',
    createdAt: '2026-06-17T12:00:00.000Z',
    ...overrides,
  }
}

function createTrialActionResultDTO(): TrialActionResultDTO {
  const candidate = createTrialCandidateDTO()

  return {
    novelId: 'novel-001',
    statusSummary: {
      lifecycleStatus: NovelLifecycleStatus.Active,
      creationStage: NovelCreationStage.Trial,
      stageStatus: StageStatus.WaitingUser,
      displayStatus: 'trial_waiting_user',
      displayStatusText: '待选择第1章候选',
      currentStep: '选择第1章候选',
      completedSteps: ['创建草稿', '确认方向', '确认设定', '确认大纲', '确认章节目录'],
      blockingReasons: [],
      recommendedAction: {
        type: 'select_trial_chapter_one',
        label: '选择第1章候选',
        reasonText: '候选不会自动选择。',
        target: 'detail',
        disabled: false,
        disabledReason: null,
        confirmRequired: false,
        taskType: 'trial_writing_generate',
      },
      videoPreparationStatus: 'not_ready',
      videoReferenceStatus: 'not_referenced',
      calculatedAt: '2026-06-17T14:00:00.000Z',
      calculationVersion: 'novel-status-v1',
    },
    task: {
      id: 'task-trial-001',
      taskType: 'trial_writing_generate',
      status: TaskStatus.WaitingConfirmation,
      statusText: '待确认结果',
      progress: 100,
      currentStep: '第1章候选已生成',
      resultVersionIds: ['trial-candidate-001'],
    },
    trialRun: {
      id: 'trial-run-001',
      novelId: 'novel-001',
      status: 'waiting_chapter1_selection',
      statusText: '待选择第1章候选',
      chapterCount: 3,
      currentStep: '选择第1章候选后继续生成第2-3章',
      selectedChapterOneCandidateId: null,
      blockingReason: null,
      chapterOneCandidates: [candidate],
      chapterResults: [],
      trialReview: null,
      bodyStrategySnapshot: null,
      task: null,
      recentTask: null,
    },
    bodyStrategySnapshot: null,
    affectedObjects: ['trial_run'],
    nextAction: {
      type: 'select_trial_chapter_one',
      label: '选择第1章候选',
      reasonText: '候选不会自动选择。',
      target: 'detail',
      disabled: false,
      disabledReason: null,
      confirmRequired: false,
      taskType: 'trial_writing_generate',
    },
  }
}

function createTrialCandidateDTO(): TrialChapterCandidateDTO {
  return {
    id: 'trial-candidate-001',
    chapterId: 'chapter-001',
    chapterNo: 1,
    title: '第1章 背锅开局',
    versionNo: 1,
    status: VersionStatus.Candidate,
    staleLevel: StaleLevel.None,
    isAiRecommended: true,
    isSelected: false,
    openingStrategy: '强压迫开场',
    openingHighlight: '第一屏展示压迫和反击线索。',
    firstSentence: '会议室的灯白得刺眼。',
    first300Summary: '会议室的灯白得刺眼，所有人都在等她低头签字。',
    endingHook: '旧码头短信出现。',
    riskLevel: RiskLevel.Low,
    riskTags: ['节奏稳定'],
    aiRecommendedReason: '综合分最高。',
    wordCount: 1800,
    contentPreview: '会议室的灯白得刺眼。',
    content: '会议室的灯白得刺眼，所有人都在等她低头签字。',
    scoring: {
      scoringStrategyVersion: 'trial-opening-score-v1',
      totalScore: 88,
      gateResult: 'pass',
      gateResultText: '通过',
      dimensions: [
        { key: 'opening_hook', label: '开篇钩子', score: 88, weight: 0.3, evidence: '首屏有压迫。', penaltyPoints: 0 },
      ],
      weights: { opening_hook: 0.3 },
      evidence: ['首屏有压迫。'],
      penalties: [],
      hardFailure: false,
      hardFailureReasons: [],
    },
    createdAt: '2026-06-17T14:00:00.000Z',
  }
}

function createChapterWorkbenchDTO() {
  const candidate = createTrialCandidateDTO()

  return {
    novelId: 'novel-001',
    chapter: {
      id: 'chapter-001',
      chapterNo: 1,
      stageIndex: 1,
      title: '第1章 背锅开局',
      wordTarget: 2200,
      wordCount: 1800,
      mainStatus: 'trial_written',
      statusNote: '试写正文已生成。',
      impactLevel: 'none',
      currentContentVersionId: candidate.id,
      createdAt: '2026-06-17T14:00:00.000Z',
      updatedAt: '2026-06-17T14:00:00.000Z',
    },
    currentContent: candidate,
    featureCard: null,
    reviewReport: null,
    reviewIssues: [],
    candidateVersions: [candidate],
    recentTask: null,
    recommendedAction: {
      type: 'view_trial_review',
      label: '查看试写总评',
      reasonText: '章节已有试写正文。',
      target: 'detail',
      disabled: false,
      disabledReason: null,
      confirmRequired: false,
      taskType: null,
    },
  }
}
