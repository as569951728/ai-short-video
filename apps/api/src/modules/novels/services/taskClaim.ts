import { ErrorCode, NOVEL_PROVIDER_ACTIONS, type NovelProviderAction } from '@ai-shortvideo/shared';
import { BusinessError } from '../../../shared/errors.js';
import { createExecutionEnvelope, hashCanonicalJson, WorkerPayloadUnsupportedError } from '../domain/executionContract.js';
import type {
  GenerationTaskRecord,
  NovelRecord,
  NovelRepository,
  RequestContext
} from '../domain/novelDomain.js';

export { NOVEL_PROVIDER_ACTIONS, hashCanonicalJson };
export type { NovelProviderAction };

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
  const objectId = input.objectId ?? input.novel.id;
  const idempotencyToken = resolveIdempotencyToken(input.idempotencyKey, input.context.requestId);
  const existingIdempotentTask = await input.repository.findTaskByIdempotencyToken(
    input.context.tenantId,
    spec.taskType,
    idempotencyToken
  );
  const modelRoutingVersion = providerCapability?.getModelRoutingVersion?.(input.action)
    ?? `provider:${providerCapability?.constructor?.name || 'default'}:v1`;
  const normalizedSourceVersionRefs = normalizeClaimSourceRefs(input.action, input.sourceVersionRefs);
  let executionEnvelopeJson;
  try {
    executionEnvelopeJson = createExecutionEnvelope({
      action: input.action,
      objectType: spec.objectType,
      objectId,
      effectiveRequest: normalizeClaimEffectiveRequest(input.action, objectId, input.effectiveRequest, normalizedSourceVersionRefs, input.novel.policyProfileVersionId),
      sourceVersionRefs: normalizedSourceVersionRefs,
      policyProfileVersionId: input.novel.policyProfileVersionId,
      modelRoutingVersion
    });
  } catch (error) {
    if (!(error instanceof WorkerPayloadUnsupportedError)) throw error;
    if (existingIdempotentTask) {
      throw taskConflict(ErrorCode.IdempotencyConflict, '同一个幂等键已绑定到不同请求。', existingIdempotentTask);
    }
    throw new BusinessError(ErrorCode.GateBlocked, '生成上下文缺少必需的权威版本引用，请刷新后重试。', {
      action: input.action,
      contractError: error.message
    });
  }
  const requestHash = hashCanonicalJson(executionEnvelopeJson);
  if (!existingIdempotentTask) {
    await providerCapability?.assertAvailable?.();
    await input.repository.assertProviderActionSupported(spec.taskType);
  }
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
    sourceVersionRefs: normalizedSourceVersionRefs,
    executionEnvelopeJson,
    policyProfileVersionId: input.novel.policyProfileVersionId,
    modelRoutingVersion,
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

function taskSpec(taskType: string, objectType: string, conflictScope: string, inputSummary: string): ClaimSpec {
  return { taskType, objectType, conflictScope, inputSummary };
}

function normalizeClaimEffectiveRequest(action: NovelProviderAction, objectId: string, effectiveRequest: unknown, sourceVersionRefs: unknown, policyProfileVersionId: string | null) {
  const request = toRecord(effectiveRequest);
  const refs = toRecord(sourceVersionRefs);
  switch (action) {
    case 'direction_generate': return compact({ regenerateReason: request.regenerateReason });
    case 'direction_fuse': return compact({ versionIds: request.versionIds ?? refs.sourceVersionIds, reason: request.reason });
    case 'direction_optimize': return compact({ versionId: request.versionId ?? objectId, instruction: request.instruction });
    case 'setting_generate': return { currentDirectionVersionId: refs.currentDirectionVersionId };
    case 'outline_generate': return { currentDirectionVersionId: refs.currentDirectionVersionId, currentSettingVersionId: refs.currentSettingVersionId };
    case 'stage_outline_generate': return { currentOutlineVersionId: refs.currentOutlineVersionId };
    case 'chapter_plan_generate': return { currentOutlineVersionId: refs.currentOutlineVersionId, currentStageOutlineVersionId: refs.currentStageOutlineVersionId };
    case 'trial_chapter_one_generate': return { chapterPlanVersionId: refs.currentChapterPlanVersionId, chapterCount: request.chapterCount ?? 3 };
    case 'trial_followup_generate': return { selectedCandidateVersionId: request.selectedCandidateId ?? refs.selectedChapterOneCandidateId, chapterPlanVersionId: refs.currentChapterPlanVersionId };
    case 'body_batch_generate': {
      const startChapter = typeof request.startChapterNo === 'number' ? request.startChapterNo : 1;
      const endChapter = typeof request.endChapterNo === 'number' ? request.endChapterNo : startChapter;
      return { startChapter, endChapter, batchSize: endChapter - startChapter + 1, strategySnapshotId: refs.strategySnapshotId };
    }
    case 'chapter_body_generate': return { chapterId: objectId, strategySnapshotId: refs.strategySnapshotId };
    case 'chapter_rewrite': return { chapterId: objectId, currentContentVersionId: request.currentContentVersionId ?? refs.currentContentVersionId, instruction: request.instruction || request.reason || '基于审稿建议优化本章' };
    case 'chapter_impact_assess': return compact({ chapterId: objectId, currentContentVersionId: request.currentContentVersionId ?? refs.currentContentVersionId, instruction: request.reason });
    case 'chapter_adopt_impact_assess': return { chapterId: objectId, candidateVersionId: refs.candidateVersionId, currentContentVersionId: request.currentContentVersionId ?? refs.currentContentVersionId, reason: request.reason || '采用候选前影响评估' };
    case 'novel_full_review': return { policyProfileVersionId: request.reviewPolicyVersionId ?? policyProfileVersionId };
  }
}

function normalizeClaimSourceRefs(action: NovelProviderAction, value: unknown) {
  const refs = toRecord(value);
  const structure = {
    currentDirectionVersionId: refs.currentDirectionVersionId,
    currentSettingVersionId: refs.currentSettingVersionId,
    currentOutlineVersionId: refs.currentOutlineVersionId,
    currentStageOutlineVersionId: refs.currentStageOutlineVersionId
  };
  if (action === 'direction_generate') return { currentDirectionVersionId: refs.currentDirectionVersionId };
  if (action === 'direction_fuse' || action === 'direction_optimize') return { sourceVersionIds: refs.sourceVersionIds };
  if (action === 'setting_generate' || action === 'outline_generate' || action === 'stage_outline_generate' || action === 'chapter_plan_generate') {
    return { ...structure, objectType: action.replace('_generate', '') };
  }
  if (action === 'trial_chapter_one_generate' || action === 'trial_followup_generate') {
    return { ...structure, currentChapterPlanVersionId: refs.currentChapterPlanVersionId, objectType: 'trial_run',
      ...(action === 'trial_followup_generate' ? { selectedChapterOneCandidateId: refs.selectedChapterOneCandidateId } : {}) };
  }
  if (action === 'body_batch_generate' || action === 'chapter_body_generate') {
    return { ...structure, currentChapterPlanVersionId: refs.currentChapterPlanVersionId, trialRunId: refs.trialRunId,
      selectedChapterOneCandidateId: refs.selectedChapterOneCandidateId, strategySnapshotId: refs.strategySnapshotId,
      strategySnapshotVersion: refs.strategySnapshotVersion, creationStage: 'body' };
  }
  if (action === 'chapter_rewrite' || action === 'chapter_impact_assess' || action === 'chapter_adopt_impact_assess') {
    return { currentContentVersionId: refs.currentContentVersionId, ...(action === 'chapter_adopt_impact_assess' ? { candidateVersionId: refs.candidateVersionId } : {}) };
  }
  if (action === 'novel_full_review') return { ...structure,
    currentChapterPlanVersionId: refs.currentChapterPlanVersionId,
    chapterContentVersionIds: refs.chapterContentVersionIds };
  return refs;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function compact(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''));
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
