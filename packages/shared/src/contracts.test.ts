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
