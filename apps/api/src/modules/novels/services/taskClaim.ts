import { createHash } from 'node:crypto';
import { ErrorCode } from '@ai-shortvideo/shared';
import { BusinessError } from '../../../shared/errors.js';
import type {
  GenerationTaskRecord,
  NovelRecord,
  NovelRepository,
  RequestContext
} from '../domain/novelDomain.js';

export const NOVEL_PROVIDER_ACTIONS = [
  'direction_generate',
  'direction_fuse',
  'direction_optimize',
  'setting_generate',
  'outline_generate',
  'stage_outline_generate',
  'chapter_plan_generate',
  'trial_chapter_one_generate',
  'trial_followup_generate',
  'body_batch_generate',
  'chapter_body_generate',
  'chapter_rewrite',
  'chapter_impact_assess',
  'chapter_adopt_impact_assess',
  'novel_full_review'
] as const;

export type NovelProviderAction = (typeof NOVEL_PROVIDER_ACTIONS)[number];

interface ClaimSpec {
  taskType: string;
  objectType: string;
  conflictScope: string;
  inputSummary: string;
}

const CLAIM_SPECS: Record<NovelProviderAction, ClaimSpec> = {
  direction_generate: taskSpec('novel_direction_generate', 'direction', 'novel_direction', '生成小说方向候选'),
  direction_fuse: taskSpec('novel_direction_fuse', 'direction', 'novel_direction', '融合小说方向候选'),
  direction_optimize: taskSpec('novel_direction_optimize', 'direction', 'novel_direction', '优化小说方向候选'),
  setting_generate: taskSpec('novel_setting_generate', 'setting', 'novel_setting', '生成小说设定候选'),
  outline_generate: taskSpec('novel_outline_generate', 'outline', 'novel_outline', '生成全书大纲候选'),
  stage_outline_generate: taskSpec('stage_outline_generate', 'stage_outline', 'novel_outline', '生成阶段大纲候选'),
  chapter_plan_generate: taskSpec('chapter_plan_generate', 'chapter_plan', 'novel_outline', '生成章节目录候选'),
  trial_chapter_one_generate: taskSpec('trial_writing_generate', 'trial_run', 'novel_trial', '生成首章试写候选'),
  trial_followup_generate: taskSpec('trial_followup_generate', 'trial_run', 'novel_trial_followup', '生成后续试写章节和总评'),
  body_batch_generate: taskSpec('body_batch_generate', 'novel', 'novel_body', '生成批量章节正文'),
  chapter_body_generate: taskSpec('chapter_body_generate', 'chapter', 'chapter', '生成单章正文'),
  chapter_rewrite: taskSpec('chapter_body_rewrite', 'chapter', 'chapter', '生成章节重写候选'),
  chapter_impact_assess: taskSpec('chapter_impact_assess', 'chapter', 'chapter', '评估章节正文影响'),
  chapter_adopt_impact_assess: taskSpec('chapter_impact_assess', 'chapter', 'chapter', '采用候选前评估章节影响'),
  novel_full_review: taskSpec('novel_full_review', 'novel', 'novel_body', '生成全书审稿报告')
};

export interface ExecuteClaimedGenerationInput<TProviderResult, TFinalResult> {
  action: NovelProviderAction;
  repository: NovelRepository;
  novel: NovelRecord;
  objectId?: string;
  idempotencyKey?: string | null;
  effectiveRequest: unknown;
  sourceVersionRefs: unknown;
  context: RequestContext;
  now: () => Date;
  providerCapability?: unknown;
  prepare?: (task: GenerationTaskRecord) => Promise<void>;
  provider: () => Promise<TProviderResult>;
  finalize: (task: GenerationTaskRecord, providerResult: TProviderResult) => Promise<TFinalResult>;
}

export type ExecuteClaimedGenerationResult<T> =
  | { reused: true; task: GenerationTaskRecord; value: null }
  | { reused: false; task: GenerationTaskRecord; value: T };

export async function executeClaimedGeneration<TProviderResult, TFinalResult>(
  input: ExecuteClaimedGenerationInput<TProviderResult, TFinalResult>
): Promise<ExecuteClaimedGenerationResult<TFinalResult>> {
  const spec = CLAIM_SPECS[input.action];
  const providerCapability = input.providerCapability as {
    assertAvailable?: () => void | Promise<void>;
    getModelRoutingVersion?: (action: NovelProviderAction) => string;
    constructor?: { name?: string };
  } | undefined;
  await providerCapability?.assertAvailable?.();
  await input.repository.assertProviderActionSupported(spec.taskType);
  const objectId = input.objectId ?? input.novel.id;
  const idempotencyToken = resolveIdempotencyToken(input.idempotencyKey, input.context.requestId);
  const requestHash = hashCanonicalJson({
    taskType: spec.taskType,
    novelId: input.novel.id,
    objectType: spec.objectType,
    objectId,
    effectiveRequest: input.effectiveRequest,
    sourceVersionRefs: input.sourceVersionRefs,
    policyProfileVersionId: input.novel.policyProfileVersionId,
    modelRoutingVersion: providerCapability?.getModelRoutingVersion?.(input.action)
      ?? `provider:${providerCapability?.constructor?.name || 'default'}:v1`
  });
  const conflictKey = spec.conflictScope === 'chapter' ? objectId : input.novel.id;
  const claim = await input.repository.claimGenerationTask({
    tenantId: input.context.tenantId,
    novelId: input.novel.id,
    taskType: spec.taskType,
    objectType: spec.objectType,
    objectId,
    conflictScope: spec.conflictScope,
    conflictKey,
    activeClaimKey: hashCanonicalJson({ conflictScope: spec.conflictScope, conflictKey }),
    idempotencyToken,
    requestHash,
    sourceVersionRefs: input.sourceVersionRefs,
    inputSummary: spec.inputSummary,
    context: input.context,
    now: input.now()
  });

  if (claim.outcome === 'idempotency_conflict') {
    throw taskConflict(ErrorCode.IdempotencyConflict, '同一个幂等键已绑定到不同请求。', claim.task);
  }
  if (claim.outcome === 'active_conflict') {
    throw taskConflict(ErrorCode.ConflictTaskExists, '同一冲突范围已有生成任务正在处理。', claim.task);
  }
  if (claim.outcome === 'reused') {
    return { reused: true, task: claim.task, value: null };
  }

  if (input.prepare) {
    try {
      await input.prepare(claim.task);
    } catch (error) {
      await failClaimedTask(input, claim.task, error, 'save_failed');
      throw error;
    }
  }

  let providerResult: TProviderResult;
  try {
    providerResult = await input.provider();
  } catch (error) {
    await failClaimedTask(input, claim.task, error, 'provider_error');
    throw error;
  }

  const latestTask = await input.repository.findTaskById(input.context.tenantId, claim.task.id);
  if (latestTask?.status === 'cancelled') {
    throw new BusinessError(ErrorCode.GateBlocked, '生成任务已取消，模型返回结果已丢弃。', {
      taskId: latestTask.id,
      taskType: latestTask.taskType,
      status: latestTask.status
    });
  }

  try {
    const value = await input.finalize(claim.task, providerResult);
    return { reused: false, task: claim.task, value };
  } catch (error) {
    await failClaimedTask(input, claim.task, error, 'save_failed');
    throw error;
  }
}

export function resolveRequestIdempotencyKey(headerValue: unknown, bodyValue: unknown): string | undefined {
  const header = normalizeOptionalKey(headerValue);
  const body = normalizeOptionalKey(bodyValue);
  if (header && body && header !== body) {
    throw new BusinessError(ErrorCode.ValidationError, 'Idempotency-Key 与 body.idempotencyKey 必须一致。', {
      issues: [{ path: 'idempotencyKey', message: 'header and body values must match' }]
    });
  }
  return header ?? body;
}

export function hashCanonicalJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function resolveIdempotencyToken(value: string | null | undefined, requestId: string): string {
  const normalized = normalizeOptionalKey(value);
  return normalized ?? `request:${requestId}`.slice(0, 120);
}

function normalizeOptionalKey(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = Array.isArray(value) ? String(value[0] ?? '').trim() : String(value).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/.test(normalized)) {
    throw new BusinessError(ErrorCode.ValidationError, '幂等键格式不合法。', {
      issues: [{ path: 'idempotencyKey', message: 'must be 8-120 safe characters' }]
    });
  }
  return normalized;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? 'null' : encoded;
}

function taskSpec(taskType: string, objectType: string, conflictScope: string, inputSummary: string): ClaimSpec {
  return { taskType, objectType, conflictScope, inputSummary };
}

function taskConflict(code: ErrorCode, message: string, task: GenerationTaskRecord) {
  return new BusinessError(code, message, {
    existingTaskId: task.id,
    activeTaskId: task.id,
    taskType: task.taskType,
    status: task.status
  });
}

async function failClaimedTask<TProviderResult, TFinalResult>(
  input: ExecuteClaimedGenerationInput<TProviderResult, TFinalResult>,
  task: GenerationTaskRecord,
  error: unknown,
  category: 'provider_error' | 'save_failed'
) {
  await input.repository.failTask({
    task,
    errorCode: category === 'provider_error' ? 'PROVIDER_ERROR' : 'SAVE_FAILED',
    errorMessage: category === 'provider_error' ? '模型服务调用失败。' : '生成结果保存失败。',
    failureCategory: category,
    statusNote: category === 'provider_error' ? '模型服务调用失败，请稍后重试。' : '生成结果保存失败，请联系管理员处理。',
    context: input.context,
    now: input.now()
  });
  void error;
}
