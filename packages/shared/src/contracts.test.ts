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
  getErrorDefinition
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
