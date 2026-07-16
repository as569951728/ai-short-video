import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ErrorCode,
  NovelCreationStage,
  NovelLifecycleStatus,
  StageStatus,
  TaskStatus,
  VersionStatus,
  StaleLevel,
  RiskLevel,
  ImpactLevel,
  createErrorResponse,
  createSuccessResponse,
  getEnumOption,
  getErrorDefinition,
  VIDEO_WORKBENCH_STEP_KEYS,
  P9A_LOCKED_PRODUCTION_ACTION_LABELS,
  VIDEO_NARRATION_ARTIFACT_STATUSES,
  VIDEO_NARRATION_QUALITY_MODES,
  VIDEO_NARRATION_MOCK_TASK_OUTCOMES,
  VIDEO_TTS_EMOTIONS,
  VIDEO_TTS_MOCK_TASK_OUTCOMES,
  VIDEO_TTS_VOICES,
  VIDEO_RENDER_MOCK_TASK_OUTCOMES,
  VIDEO_VISUAL_BACKGROUND_ASSETS,
  VIDEO_PUBLISH_PLATFORMS,
  VIDEO_PUBLISH_METHODS,
  VIDEO_PUBLISH_STATUSES,
  VIDEO_METRIC_WINDOW_TYPES,
  VIDEO_METRIC_BACKFILL_PERSISTENT_STATUSES,
  VIDEO_METRIC_BACKFILL_DISPLAY_STATUSES,
  VIDEO_METRIC_SAMPLE_SIZE_LEVELS,
  VIDEO_METRIC_SUBJECTIVE_RATINGS,
  VIDEO_PUBLISH_NEXT_DECISIONS,
  VIDEO_PUBLISH_DECISION_CONFIDENCES,
  VIDEO_PUBLISHING_AGGREGATE_STATUSES,
  VIDEO_PUBLISHING_RECOMMENDED_ACTION_TYPES,
  deriveVideoMetricBackfillDisplayStatus,
  isForbiddenVideoPublishField,
  sanitizeVideoPublishAuditSummary,
  sanitizeVideoPublishUrlForDisplay,
  sanitizeVideoPublishVisibleText,
  NOVEL_CREATION_SOURCE_REQUEST_TYPES,
  NOVEL_CREATION_SOURCE_RESPONSE_TYPES,
  NOVEL_CREATION_SOURCE_DB_VALUES,
  novelCreationSourceFromDb,
  novelCreationSourceToDb,
  sanitizeVideoArtifactMetadata,
  sanitizeVideoProviderSummary,
  sanitizeVideoVisibleTask,
  sanitizeVideoVisibleText
} from './index.js';
import type {
  CreatePlatformMetricSnapshotRequest,
  CreateVideoPublishRecordRequest,
  VideoMetricBackfillNodeDTO,
  VideoPublishRecordDTO,
  VideoPublishSourceVersionRefsDTO
} from './index.js';

describe('shared contract enums', () => {
  it('keeps package-0 enum values aligned with the novel contracts', () => {
    assert.deepEqual(Object.values(NovelLifecycleStatus), ['active', 'paused', 'archived', 'deleted']);
    assert.deepEqual(Object.values(NovelCreationStage), [
      'draft',
      'direction',
      'setting',
      'outline',
      'chapter_plan',
      'trial',
      'body',
      'full_review',
      'completion_confirm',
      'video_ready'
    ]);
    assert.deepEqual(Object.values(StageStatus), [
      'not_started',
      'processing',
      'waiting_user',
      'blocked',
      'failed',
      'completed'
    ]);
    assert.deepEqual(Object.values(TaskStatus), [
      'queued',
      'processing',
      'waiting_confirmation',
      'completed',
      'failed',
      'cancelled'
    ]);
    assert.deepEqual(Object.values(VersionStatus), ['candidate', 'current', 'historical', 'discarded', 'stale']);
    assert.deepEqual(Object.values(StaleLevel), ['none', 'soft_stale', 'hard_stale', 'risk_stale']);
    assert.deepEqual(Object.values(RiskLevel), ['none', 'low', 'medium', 'high', 'blocking']);
    assert.deepEqual(Object.values(ImpactLevel), ['none', 'minor', 'medium', 'severe']);
  });

  it('exposes user-facing metadata for shared enum values', () => {
    assert.equal(getEnumOption('novelCreationStage', NovelCreationStage.ChapterPlan)?.label, '章节目录');
    assert.equal(getEnumOption('taskStatus', TaskStatus.WaitingConfirmation)?.label, '有新结果待确认');
    assert.equal(getEnumOption('impactLevel', ImpactLevel.Severe)?.blocksNextStep, true);
  });
});

describe('shared novel creation source contracts', () => {
  it('keeps request and response source values explicit', () => {
    assert.deepEqual(NOVEL_CREATION_SOURCE_REQUEST_TYPES, ['system_recommendation', 'hotspot_reference', 'manual_idea']);
    assert.deepEqual(NOVEL_CREATION_SOURCE_RESPONSE_TYPES, [
      'system_recommendation',
      'hotspot_reference',
      'manual_idea',
      'legacy_unknown'
    ]);
  });

  it('maps DB enum values without confusing legacy rows with system recommendations', () => {
    assert.equal(NOVEL_CREATION_SOURCE_DB_VALUES.system_recommendation, 'SYSTEM_RECOMMENDATION');
    assert.equal(novelCreationSourceToDb('manual_idea'), 'MANUAL_IDEA');
    assert.equal(novelCreationSourceFromDb('SYSTEM_RECOMMENDATION'), 'system_recommendation');
    assert.equal(novelCreationSourceFromDb('HOTSPOT_REFERENCE'), 'hotspot_reference');
    assert.equal(novelCreationSourceFromDb('MANUAL_IDEA'), 'manual_idea');
    assert.equal(novelCreationSourceFromDb('LEGACY_UNKNOWN'), 'legacy_unknown');
    assert.equal(novelCreationSourceFromDb(null), 'legacy_unknown');
    assert.equal(novelCreationSourceFromDb('unexpected_old_value'), 'legacy_unknown');
  });
});

describe('shared API response contracts', () => {
  it('creates success and error envelopes with requestId', () => {
    assert.deepEqual(createSuccessResponse({ ok: true }, 'req-1'), {
      success: true,
      data: { ok: true },
      error: null,
      requestId: 'req-1'
    });

    assert.deepEqual(createErrorResponse(ErrorCode.ValidationError, '参数不合法', 'req-2', { field: 'page' }), {
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: '参数不合法',
        details: { field: 'page' }
      },
      requestId: 'req-2'
    });
  });

  it('keeps error codes discoverable with default status and message', () => {
    assert.deepEqual(getErrorDefinition(ErrorCode.ConflictTaskExists), {
      code: 'CONFLICT_TASK_EXISTS',
      httpStatus: 409,
      message: '存在冲突任务'
    });
    assert.deepEqual(getErrorDefinition(ErrorCode.PublishGateBlocked), {
      code: 'PUBLISH_GATE_BLOCKED',
      httpStatus: 409,
      message: '发布登记门禁阻塞'
    });
    assert.deepEqual(getErrorDefinition(ErrorCode.PublishDuplicate), {
      code: 'PUBLISH_DUPLICATE',
      httpStatus: 409,
      message: '发布事实重复'
    });
    assert.deepEqual(getErrorDefinition(ErrorCode.MetricBackfillInvalid), {
      code: 'METRIC_BACKFILL_INVALID',
      httpStatus: 400,
      message: '回填数据不合法'
    });
  });
});

describe('shared video P9a workbench contracts', () => {
  it('keeps the P9a workbench step keys stable and excludes executable production actions', () => {
    assert.deepEqual(VIDEO_WORKBENCH_STEP_KEYS, [
      'reference_check',
      'narration',
      'tts',
      'subtitle',
      'visual_plan',
      'render',
      'preview',
      'export'
    ]);
    assert.deepEqual(P9A_LOCKED_PRODUCTION_ACTION_LABELS, ['生成旁白', '生成配音', '生成字幕', '渲染视频', '导出文件']);
  });
});

describe('shared video P9b narration contracts', () => {
  it('keeps narration artifact statuses and quality modes stable', () => {
    assert.deepEqual(VIDEO_NARRATION_ARTIFACT_STATUSES, ['candidate', 'draft', 'confirmed', 'rejected', 'stale', 'archived']);
    assert.deepEqual(VIDEO_NARRATION_QUALITY_MODES, ['fast', 'standard', 'high_quality']);
    assert.deepEqual(VIDEO_NARRATION_MOCK_TASK_OUTCOMES, ['success', 'failed', 'cancelled']);
  });
});

describe('shared video P9c TTS contracts', () => {
  it('keeps mock TTS voice controls and task outcomes stable', () => {
    assert.deepEqual(VIDEO_TTS_MOCK_TASK_OUTCOMES, ['success', 'failed', 'cancelled']);
    assert.deepEqual(VIDEO_TTS_EMOTIONS, ['calm', 'suspense', 'excited', 'warm']);
    assert.equal(VIDEO_TTS_VOICES.some((voice) => voice.id === 'mock-male-cinematic' && voice.name === '男声-剧情感'), true);
  });
});

describe('shared video P9e render contracts', () => {
  it('keeps mock render outcomes and built-in visual backgrounds stable', () => {
    assert.deepEqual(VIDEO_RENDER_MOCK_TASK_OUTCOMES, ['success', 'failed', 'cancelled']);
    assert.equal(VIDEO_VISUAL_BACKGROUND_ASSETS.some((asset) => asset.id === 'mock-bg-salt-field' && asset.type === 'loop_background'), true);
  });
});

describe('shared video visible-output sanitizers', () => {
  it('keeps explicit safe artifact metadata fields and drops forbidden nested payloads', () => {
    const metadata = sanitizeVideoArtifactMetadata({
      isMockOutput: true,
      candidateRank: 1,
      subtitleStyle: 'dramatic',
      lineLength: 18,
      previewKind: 'mock-local-video-placeholder',
      rawResponse: '完整模型响应',
      providerPayload: { endpoint: 'https://example.test/v1/chat/completions' },
      nested: { apiKey: 'sk-secret' },
      timelineSummary: ['0-3 秒钩子', 'prompt: raw hidden']
    });

    assert.deepEqual(metadata, {
      isMockOutput: true,
      candidateRank: 1,
      subtitleStyle: 'dramatic',
      lineLength: 18,
      previewKind: 'mock-local-video-placeholder',
      timelineSummary: ['0-3 秒钩子', '内容已脱敏，仅保留安全摘要。']
    });
    assert.equal(Object.prototype.hasOwnProperty.call(metadata, 'rawResponse'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(metadata, 'providerPayload'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(metadata, 'nested'), false);
  });

  it('keeps provider summaries display-only and sanitizes task failure notes', () => {
    const providerSummary = sanitizeVideoProviderSummary({
      provider: 'mock-local-render',
      model: 'mock-render-v1',
      isMockOutput: true,
      endpoint: 'https://example.test/v1/chat/completions',
      apiKey: 'sk-secret',
      safeSummary: 'mock/local 渲染摘要'
    });
    assert.deepEqual(providerSummary, {
      provider: 'mock-local-render',
      model: 'mock-render-v1',
      isMockOutput: true,
      safeSummary: 'mock/local 渲染摘要'
    });

    const task = sanitizeVideoVisibleTask({
      id: 'task_1',
      taskType: 'video_render_generate',
      status: 'failed',
      currentStep: 'calling_model',
      statusNote: 'provider error: https://example.test/v1/chat/completions apiKey=sk-secret prompt: full',
      progress: 50,
      failureCategory: 'provider_error',
      debug: { rawResponse: 'hidden' }
    }, 'video_render_generate');

    assert.equal(task?.failureCategory, 'provider_error');
    assert.equal(task?.statusNote, '生成服务返回异常，当前产物未受影响，可以稍后重试。');
    assert.equal(sanitizeVideoVisibleText('prompt: full input'), '内容已脱敏，仅保留安全摘要。');
  });
});

describe('shared video P10 publishing contracts', () => {
  it('freezes publishing enums and avoids credential-oriented platform fields', () => {
    assert.deepEqual(VIDEO_PUBLISH_PLATFORMS, [
      'douyin',
      'kuaishou',
      'xiaohongshu',
      'bilibili',
      'wechat_channels',
      'tiktok',
      'youtube',
      'other'
    ]);
    assert.deepEqual(VIDEO_PUBLISH_METHODS, ['manual_record']);
    assert.deepEqual(VIDEO_PUBLISH_STATUSES, ['active', 'withdrawn', 'superseded']);
    assert.deepEqual(VIDEO_METRIC_WINDOW_TYPES, ['h24', 'h48']);
    assert.deepEqual(VIDEO_METRIC_BACKFILL_PERSISTENT_STATUSES, ['pending', 'completed', 'waived']);
    assert.deepEqual(VIDEO_METRIC_BACKFILL_DISPLAY_STATUSES, ['waiting', 'due', 'overdue', 'completed', 'waived']);
    assert.deepEqual(VIDEO_METRIC_SAMPLE_SIZE_LEVELS, ['insufficient', 'normal']);
    assert.deepEqual(VIDEO_METRIC_SUBJECTIVE_RATINGS, ['good', 'average', 'bad', 'insufficient']);
    assert.deepEqual(VIDEO_PUBLISH_NEXT_DECISIONS, [
      'continue',
      'optimize_title',
      'optimize_narration',
      'change_chapter',
      'redo_video',
      'pause_project'
    ]);
    assert.deepEqual(VIDEO_PUBLISH_DECISION_CONFIDENCES, ['low', 'normal']);
    assert.deepEqual(VIDEO_PUBLISHING_AGGREGATE_STATUSES, [
      'exported_unpublished',
      'published_waiting_24h',
      'published_24h_overdue',
      'published_waiting_48h',
      'published_48h_overdue',
      'data_incomplete',
      'sample_insufficient',
      'decision_recorded',
      'version_stale_after_publish'
    ]);
    assert.equal(VIDEO_PUBLISHING_AGGREGATE_STATUSES.includes('reviewed' as never), false);
    assert.deepEqual(VIDEO_PUBLISHING_RECOMMENDED_ACTION_TYPES, [
      'register_publish',
      'fill_24h_metrics',
      'fill_48h_metrics',
      'view_overdue',
      'mark_sample_insufficient',
      'record_next_decision',
      'view_publish_records'
    ]);
    assert.equal(isForbiddenVideoPublishField('platformAccountLabel'), false);
    assert.equal(isForbiddenVideoPublishField('platformToken'), true);
    assert.equal(isForbiddenVideoPublishField('cookie'), true);
    assert.equal(isForbiddenVideoPublishField('authCredential'), true);
  });

  it('keeps publish audit summaries on an explicit safe allowlist', () => {
    const summary = sanitizeVideoPublishAuditSummary({
      publishStatus: 'active',
      platform: 'douyin',
      platformAccountLabel: '官方账号',
      platformUrlDisplay: 'https://user:pass@example.com/work/123?token=secret#debug',
      platformToken: 'secret-token',
      cookie: 'session=hidden',
      rawPayload: '完整平台响应',
      nested: { token: 'hidden' },
      metricWindowType: 'h24',
      metricPersistentStatus: 'completed',
      metricDisplayStatus: 'completed',
      sampleSizeLevel: 'normal',
      subjectiveRating: 'good',
      nextDecision: 'continue',
      confidence: 'normal',
      publishRecordVersionNo: 3,
      backfillNodeVersionNo: 2,
      metricSnapshotVersionNo: 1
    });

    assert.deepEqual(summary, {
      publishStatus: 'active',
      platform: 'douyin',
      platformAccountLabel: '官方账号',
      platformUrlDisplay: 'https://example.com/work/123',
      metricWindowType: 'h24',
      metricPersistentStatus: 'completed',
      metricDisplayStatus: 'completed',
      sampleSizeLevel: 'normal',
      subjectiveRating: 'good',
      nextDecision: 'continue',
      confidence: 'normal',
      publishRecordVersionNo: 3,
      backfillNodeVersionNo: 2,
      metricSnapshotVersionNo: 1
    });
    assert.equal(Object.prototype.hasOwnProperty.call(summary, 'platformToken'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(summary, 'cookie'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(summary, 'rawPayload'), false);

    const invalidUrlSummary = sanitizeVideoPublishAuditSummary({
      platformUrlDisplay: 'ftp://example.com/work/123'
    });
    assert.equal(Object.prototype.hasOwnProperty.call(invalidUrlSummary, 'platformUrlDisplay'), false);

    const overlongUrlSummary = sanitizeVideoPublishAuditSummary({
      platformUrlDisplay: `https://example.com/${'a'.repeat(600)}`
    });
    assert.equal(Object.prototype.hasOwnProperty.call(overlongUrlSummary, 'platformUrlDisplay'), false);
  });

  it('keeps source version refs and optimistic-lock request fields stable', () => {
    const sourceVersionRefs = {
      videoReference: { id: 'ref_1', versionNo: 4 },
      videoUnit: { id: 'unit_1', unitNo: 1, versionNo: 2 },
      export: { id: 'export_1', versionNo: 5 },
      render: { id: 'render_1', versionNo: 3 },
      narration: { id: 'narration_1', versionNo: 7 },
      tts: { id: 'tts_1', versionNo: 8 },
      subtitle: { id: 'subtitle_1', versionNo: 9 },
      visualPlan: { id: 'visual_1', versionNo: 10 },
      chapters: [{
        chapterId: 'chapter_1',
        chapterNo: 1,
        contentVersionId: 'content_1',
        contentVersionNo: 11
      }]
    } satisfies VideoPublishSourceVersionRefsDTO;
    assert.equal(sourceVersionRefs.videoUnit.versionNo, 2);
    assert.equal(sourceVersionRefs.export.versionNo, 5);

    const createRequest = {
      idempotencyToken: 'idem_1',
      videoUnitId: 'unit_1',
      expectedReferenceVersion: 4,
      exportId: 'export_1',
      expectedExportVersionNo: 5,
      renderId: 'render_1',
      expectedRenderVersionNo: 3,
      platform: 'douyin',
      platformAccountLabel: '官方账号',
      publishedAt: '2026-07-12T10:00:00.000Z',
      publishTitle: '标题'
    } satisfies CreateVideoPublishRecordRequest;
    assert.equal(createRequest.expectedReferenceVersion, 4);
    assert.equal(createRequest.expectedExportVersionNo, 5);
    assert.equal(Object.prototype.hasOwnProperty.call(createRequest, 'expectedExportStatus'), false);

    const backfillNode = {
      id: 'node_1',
      versionNo: 6,
      publishRecordId: 'publish_1',
      windowType: 'h24',
      dueAt: '2026-07-13T10:00:00.000Z',
      overdueAt: '2026-07-13T12:00:00.000Z',
      persistentStatus: 'pending',
      displayStatus: 'waiting',
      completedAt: null,
      waivedReason: null
    } satisfies VideoMetricBackfillNodeDTO;
    assert.equal(backfillNode.versionNo, 6);

    const snapshotRequest = {
      idempotencyToken: 'idem_2',
      backfillNodeId: 'node_1',
      expectedBackfillNodeVersionNo: 6,
      windowType: 'h24',
      collectedAt: '2026-07-13T10:30:00.000Z',
      sampleSizeLevel: 'normal',
      subjectiveRating: 'good'
    } satisfies CreatePlatformMetricSnapshotRequest;
    assert.equal(snapshotRequest.expectedBackfillNodeVersionNo, 6);
  });

  it('keeps public publish record DTO free of idempotency tokens', () => {
    const publishRecord = {
      id: 'publish_1',
      versionNo: 1,
      tenantId: 'tenant_1',
      videoProjectId: 'video_1',
      videoUnitId: 'unit_1',
      videoReferenceId: 'reference_1',
      exportId: 'export_1',
      renderId: 'render_1',
      freezeSnapshotId: 'freeze_1',
      platform: 'douyin',
      platformAccountLabel: '官方账号',
      platformWorkId: null,
      platformUrl: null,
      platformUrlDisplay: null,
      publishedAt: '2026-07-12T10:00:00.000Z',
      publishTitle: '标题',
      publishCaption: null,
      notes: null,
      publishMethod: 'manual_record',
      status: 'active',
      sourceVersionRefs: {
        videoReference: { id: 'ref_1', versionNo: 4 },
        videoUnit: { id: 'unit_1', unitNo: 1, versionNo: 2 },
        export: { id: 'export_1', versionNo: 5 },
        render: { id: 'render_1', versionNo: 3 },
        narration: { id: 'narration_1', versionNo: 7 },
        tts: { id: 'tts_1', versionNo: 8 },
        subtitle: { id: 'subtitle_1', versionNo: 9 },
        visualPlan: { id: 'visual_1', versionNo: 10 },
        chapters: []
      },
      createdBy: 'user_1',
      createdAt: '2026-07-12T10:00:00.000Z',
      updatedAt: '2026-07-12T10:00:00.000Z'
    } satisfies VideoPublishRecordDTO;
    assert.equal(Object.prototype.hasOwnProperty.call(publishRecord, 'idempotencyToken'), false);
  });

  it('derives metric display status from frozen dueAt and overdueAt without timers', () => {
    const dueAt = '2026-07-12T10:00:00.000Z';
    const overdueAt = '2026-07-12T12:00:00.000Z';

    assert.equal(deriveVideoMetricBackfillDisplayStatus({
      persistentStatus: 'pending',
      dueAt,
      overdueAt,
      now: '2026-07-12T09:59:59.999Z'
    }), 'waiting');
    assert.equal(deriveVideoMetricBackfillDisplayStatus({
      persistentStatus: 'pending',
      dueAt,
      overdueAt,
      now: '2026-07-12T10:00:00.000Z'
    }), 'due');
    assert.equal(deriveVideoMetricBackfillDisplayStatus({
      persistentStatus: 'pending',
      dueAt,
      overdueAt,
      now: '2026-07-12T11:59:59.999Z'
    }), 'due');
    assert.equal(deriveVideoMetricBackfillDisplayStatus({
      persistentStatus: 'pending',
      dueAt,
      overdueAt,
      now: '2026-07-12T12:00:00.000Z'
    }), 'overdue');
  });

  it('handles zero-grace metric windows at exact dueAt boundaries', () => {
    const dueAt = '2026-07-12T10:00:00.000Z';
    const overdueAt = '2026-07-12T10:00:00.000Z';

    assert.equal(deriveVideoMetricBackfillDisplayStatus({
      persistentStatus: 'pending',
      dueAt,
      overdueAt,
      now: '2026-07-12T09:59:59.999Z'
    }), 'waiting');
    assert.equal(deriveVideoMetricBackfillDisplayStatus({
      persistentStatus: 'pending',
      dueAt,
      overdueAt,
      now: '2026-07-12T10:00:00.000Z'
    }), 'overdue');
  });

  it('keeps completed and waived terminal before date validation', () => {
    assert.equal(deriveVideoMetricBackfillDisplayStatus({
      persistentStatus: 'completed',
      dueAt: 'not-a-date',
      overdueAt: 'also-not-a-date',
      now: '2026-07-12T12:00:00.000Z'
    }), 'completed');
    assert.equal(deriveVideoMetricBackfillDisplayStatus({
      persistentStatus: 'waived',
      dueAt: '2026-07-12T12:00:00.000Z',
      overdueAt: '2026-07-12T10:00:00.000Z',
      now: '2026-07-12T12:00:00.000Z'
    }), 'waived');
  });

  it('rejects invalid pending metric windows instead of silently correcting them', () => {
    assert.throws(() => deriveVideoMetricBackfillDisplayStatus({
      persistentStatus: 'pending',
      dueAt: 'bad-date',
      overdueAt: '2026-07-12T12:00:00.000Z',
      now: '2026-07-12T10:00:00.000Z'
    }), /dueAt must be a valid date/);
    assert.throws(() => deriveVideoMetricBackfillDisplayStatus({
      persistentStatus: 'pending',
      dueAt: '2026-07-12T10:00:00.000Z',
      overdueAt: 'bad-date',
      now: '2026-07-12T10:00:00.000Z'
    }), /overdueAt must be a valid date/);
    assert.throws(() => deriveVideoMetricBackfillDisplayStatus({
      persistentStatus: 'pending',
      dueAt: '2026-07-12T10:00:00.000Z',
      overdueAt: '2026-07-12T12:00:00.000Z',
      now: 'bad-date'
    }), /now must be a valid date/);
    assert.throws(() => deriveVideoMetricBackfillDisplayStatus({
      persistentStatus: 'pending',
      dueAt: '2026-07-12T12:00:00.000Z',
      overdueAt: '2026-07-12T10:00:00.000Z',
      now: '2026-07-12T10:00:00.000Z'
    }), /overdueAt must be greater than or equal to dueAt/);
  });

  it('sanitizes publishing URL and visible text without removing normal business copy', () => {
    assert.equal(
      sanitizeVideoPublishUrlForDisplay('https://user:pass@example.com/work/123?token=secret#debug'),
      'https://example.com/work/123'
    );
    assert.equal(sanitizeVideoPublishUrlForDisplay('ftp://example.com/work/123'), null);
    assert.equal(sanitizeVideoPublishUrlForDisplay('not a url'), null);
    assert.equal(sanitizeVideoPublishUrlForDisplay(`https://example.com/${'a'.repeat(600)}`), null);
    assert.equal(sanitizeVideoPublishVisibleText(' 标题\u0000带控制字符 ', 20, 'fallback'), '标题 带控制字符');
    assert.equal(sanitizeVideoPublishVisibleText('token=secret should hide', 20, 'fallback'), 'fallback');
  });
});
