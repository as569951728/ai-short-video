import {
  ErrorCode,
  NOVEL_PROVIDER_ACTIONS,
  createExecutionEnvelopeV1_1,
  type ExecutionEnvelopeV1_1,
  type NovelProviderAction
} from '@ai-shortvideo/shared';
import { BusinessError } from '../../../shared/errors.js';
import {
  hashCanonicalJson,
  matchGenerationAuthority,
  validateExecutionEnvelopeV1_1ForTask,
  WorkerPayloadUnsupportedError
} from '../domain/executionContract.js';
import type {
  ChapterContentVersionRecord,
  CreativeVersionRecord,
  GenerationAuthoritySnapshot,
  GenerationTaskRecord,
  LongTermMemoryRecord,
  NovelChapterRecord,
  NovelRecord,
  NovelRepository,
  RequestContext
} from '../domain/novelDomain.js';
import {
  getActionExecutionPlan,
  projectBodyStrategyProviderInput,
  projectChapterContentProviderInput,
  projectChapterProviderInput,
  projectCreativeAssetProviderInput,
  projectFullReviewSourceVersionRefsProviderInput,
  projectLongTermMemoryProviderInput
} from './actionExecutionPlan.js';

export { NOVEL_PROVIDER_ACTIONS, hashCanonicalJson };
export type { NovelProviderAction };

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
  authorityBarrier?: (phase: 'after_first_authority_load' | 'after_claim') => void | Promise<void>;
  providerCapability?: unknown;
  prepare?: (task: GenerationTaskRecord) => Promise<void>;
  provider: (providerInput: unknown) => Promise<TProviderResult>;
  finalize: (task: GenerationTaskRecord, providerResult: TProviderResult) => Promise<TFinalResult>;
}

export type ExecuteClaimedGenerationResult<T> =
  | { reused: true; task: GenerationTaskRecord; value: null }
  | { reused: false; task: GenerationTaskRecord; value: T };

export async function executeClaimedGeneration<TProviderResult, TFinalResult>(
  input: ExecuteClaimedGenerationInput<TProviderResult, TFinalResult>
): Promise<ExecuteClaimedGenerationResult<TFinalResult>> {
  const spec = getActionExecutionPlan(input.action);
  const providerCapability = input.providerCapability as {
    assertAvailable?: () => void | Promise<void>;
    getModelRoutingVersion?: (action: NovelProviderAction) => string;
    constructor?: { name?: string };
  } | undefined;
  const objectId = input.objectId ?? input.novel.id;
  assertTrustedContext(input.context);
  if (input.novel.tenantId !== input.context.tenantId) {
    throw new BusinessError(ErrorCode.VersionConflict, '小说权威归属已变化，请刷新后重试。');
  }
  const rawIdempotencyKey = resolveIdempotencyToken(input.idempotencyKey, input.context.requestId);
  const idempotencyToken = createActorScopedIdempotencyToken({
    tenantId: input.context.tenantId,
    userId: input.context.userId,
    action: input.action,
    objectId,
    rawIdempotencyKey
  });
  const scopedIdempotentTask = await input.repository.findTaskByIdempotencyToken(
    input.context.tenantId,
    spec.taskType,
    idempotencyToken
  );
  const legacyIdempotentTask = scopedIdempotentTask
    ? null
    : await input.repository.findTaskByIdempotencyToken(input.context.tenantId, spec.taskType, rawIdempotencyKey);
  const existingIdempotentTask = scopedIdempotentTask ?? (
    legacyIdempotentTask?.createdBy === input.context.userId
    && legacyIdempotentTask.objectId === objectId
      ? legacyIdempotentTask
      : null
  );
  const modelRoutingVersion = providerCapability?.getModelRoutingVersion?.(input.action)
    ?? `provider:${providerCapability?.constructor?.name || 'default'}:v1`;
  assertRequiredClaimSourceRefs(input.action, input.sourceVersionRefs);
  const normalizedSourceVersionRefs = normalizeClaimSourceRefs(input.action, input.sourceVersionRefs, objectId);
  const normalizedRequest = normalizeClaimEffectiveRequest(
    input.action,
    objectId,
    input.effectiveRequest,
    normalizedSourceVersionRefs,
    input.novel.policyProfileVersionId
  );
  if (existingIdempotentTask) {
    let persistedEnvelope: ExecutionEnvelopeV1_1;
    try {
      persistedEnvelope = validateExecutionEnvelopeV1_1ForTask(existingIdempotentTask);
    } catch (error) {
      if (error instanceof BusinessError) throw error;
      if (!(error instanceof WorkerPayloadUnsupportedError)) throw error;
      throw taskConflict(ErrorCode.IdempotencyConflict, '同一个幂等键已绑定到不受支持的历史请求。', existingIdempotentTask);
    }
    if (
      persistedEnvelope.tenantId !== input.context.tenantId
      || persistedEnvelope.auditContext.requestedByUserId !== input.context.userId
      || persistedEnvelope.novelId !== input.novel.id
      || persistedEnvelope.action !== input.action
      || persistedEnvelope.objectType !== spec.objectType
      || persistedEnvelope.objectId !== objectId
      || persistedEnvelope.policyProfileVersionId !== input.novel.policyProfileVersionId
      || persistedEnvelope.modelRoutingVersion !== modelRoutingVersion
      || hashCanonicalJson(persistedEnvelope.normalizedRequest) !== hashCanonicalJson(normalizedRequest)
    ) {
      throw taskConflict(ErrorCode.IdempotencyConflict, '同一个幂等键已绑定到不同请求。', existingIdempotentTask);
    }
    const replayAuthorityInput = {
      action: input.action,
      tenantId: input.context.tenantId,
      novelId: input.novel.id,
      objectId,
      sourceVersionRefs: persistedEnvelope.sourceVersionRefs,
      normalizedRequest: persistedEnvelope.normalizedRequest
    };
    const replayAuthority = await input.repository.loadGenerationAuthority(replayAuthorityInput);
    if (!matchGenerationAuthority(
      replayAuthorityInput,
      persistedEnvelope.sourceVersionRefs.authoritySnapshotHash,
      replayAuthority
    ).ok) throw sourceStale();
    return { reused: true, task: existingIdempotentTask, value: null };
  }
  const requestedAt = input.now().toISOString();
  try {
    createExecutionEnvelopeV1_1({
      tenantId: input.context.tenantId,
      novelId: input.novel.id,
      auditContext: { requestedByUserId: input.context.userId, requestedAt },
      action: input.action,
      objectType: spec.objectType,
      objectId,
      normalizedRequest,
      sourceVersionRefs: {
        ...normalizedSourceVersionRefs,
        authoritySnapshotHash: '0'.repeat(64),
        providerInputSnapshotHash: '0'.repeat(64)
      },
      policyProfileVersionId: input.novel.policyProfileVersionId,
      modelRoutingVersion
    });
  } catch (error) {
    if (error instanceof BusinessError) throw error;
    if (!(error instanceof WorkerPayloadUnsupportedError)) throw error;
    throw new BusinessError(ErrorCode.GateBlocked, '生成上下文缺少必需的权威版本引用，请刷新后重试。', {
      action: input.action,
      contractError: error.message
    });
  }
  const authorityInput = {
    action: input.action,
    tenantId: input.context.tenantId,
    novelId: input.novel.id,
    objectId,
    sourceVersionRefs: normalizedSourceVersionRefs,
    normalizedRequest
  };
  const authority = await input.repository.loadGenerationAuthority(authorityInput);
  if (!authority) throw sourceStale();
  const authoritySnapshotHash = hashCanonicalJson(authority);
  await providerCapability?.assertAvailable?.();
  await input.repository.assertProviderActionSupported(spec.taskType);
  await input.authorityBarrier?.('after_first_authority_load');
  const providerAuthority = await input.repository.loadGenerationAuthority(authorityInput);
  if (!matchGenerationAuthority(authorityInput, authoritySnapshotHash, providerAuthority).ok) throw sourceStale();
  const authoritativeProviderInput = buildAuthoritativeProviderInput(
    input.action,
    providerAuthority!,
    normalizedRequest,
    normalizedSourceVersionRefs
  );
  const providerInputSnapshotHash = hashCanonicalJson(authoritativeProviderInput);
  const executionEnvelopeJson = createExecutionEnvelopeV1_1({
    tenantId: input.context.tenantId,
    novelId: input.novel.id,
    auditContext: { requestedByUserId: input.context.userId, requestedAt },
    action: input.action,
    objectType: spec.objectType,
    objectId,
    normalizedRequest,
    sourceVersionRefs: {
      ...normalizedSourceVersionRefs,
      authoritySnapshotHash,
      providerInputSnapshotHash
    },
    policyProfileVersionId: input.novel.policyProfileVersionId,
    modelRoutingVersion
  });
  const requestHash = hashCanonicalJson(executionEnvelopeJson);
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
    sourceVersionRefs: executionEnvelopeJson.sourceVersionRefs,
    executionEnvelopeJson,
    policyProfileVersionId: input.novel.policyProfileVersionId,
    modelRoutingVersion,
    inputSummary: spec.inputSummary,
    authorityInput,
    expectedAuthoritySnapshotHash: authoritySnapshotHash,
    context: input.context,
    now: input.now()
  });

  if (claim.outcome === 'idempotency_conflict') {
    throw taskConflict(ErrorCode.IdempotencyConflict, '同一个幂等键已绑定到不同请求。', claim.task);
  }
  if (claim.outcome === 'active_conflict') {
    throw taskConflict(ErrorCode.ConflictTaskExists, '同一冲突范围已有生成任务正在处理。', claim.task);
  }
  if (claim.outcome === 'source_stale') throw sourceStale();
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

  await input.authorityBarrier?.('after_claim');
  const finalProviderAuthority = await input.repository.loadGenerationAuthority(authorityInput);
  if (!matchGenerationAuthority(authorityInput, authoritySnapshotHash, finalProviderAuthority).ok) {
    const error = sourceStale();
    await failClaimedTask(input, claim.task, error, 'source_stale');
    throw error;
  }
  const finalProviderInput = buildAuthoritativeProviderInput(
    input.action,
    finalProviderAuthority!,
    normalizedRequest,
    normalizedSourceVersionRefs
  );
  if (hashCanonicalJson(finalProviderInput) !== providerInputSnapshotHash) {
    const error = sourceStale();
    await failClaimedTask(input, claim.task, error, 'source_stale');
    throw error;
  }

  let providerResult: TProviderResult;
  try {
    providerResult = await input.provider(finalProviderInput);
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

export function createActorScopedIdempotencyToken(input: {
  tenantId: string;
  userId: string;
  action: NovelProviderAction;
  objectId: string;
  rawIdempotencyKey: string;
}): string {
  return hashCanonicalJson({
    tenantId: input.tenantId,
    userId: input.userId,
    action: input.action,
    objectId: input.objectId,
    idempotencyKey: input.rawIdempotencyKey
  });
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

function normalizeClaimEffectiveRequest(action: NovelProviderAction, objectId: string, effectiveRequest: unknown, sourceVersionRefs: unknown, policyProfileVersionId: string | null) {
  const request = toRecord(effectiveRequest);
  const refs = toRecord(sourceVersionRefs);
  switch (action) {
    case 'direction_generate': return compact({ regenerateReason: request.regenerateReason });
    case 'direction_fuse': return compact({ versionIds: canonicalIdArray(request.versionIds ?? refs.sourceVersionIds), reason: request.reason });
    case 'direction_optimize': return compact({ versionId: request.versionId ?? objectId, instruction: request.instruction });
    case 'setting_generate': return compact({ currentDirectionVersionId: refs.currentDirectionVersionId, regenerateReason: request.regenerateReason });
    case 'outline_generate': return compact({ currentDirectionVersionId: refs.currentDirectionVersionId, currentSettingVersionId: refs.currentSettingVersionId, regenerateReason: request.regenerateReason });
    case 'stage_outline_generate': return compact({ currentOutlineVersionId: refs.currentOutlineVersionId, regenerateReason: request.regenerateReason });
    case 'chapter_plan_generate': return compact({ currentOutlineVersionId: refs.currentOutlineVersionId, currentStageOutlineVersionId: refs.currentStageOutlineVersionId, regenerateReason: request.regenerateReason });
    case 'trial_chapter_one_generate': return compact({ chapterPlanVersionId: refs.currentChapterPlanVersionId, chapterCount: request.chapterCount ?? 3, regenerateReason: request.regenerateReason });
    case 'trial_followup_generate': return compact({
      trialRunId: objectId,
      selectedCandidateVersionId: request.selectedCandidateId ?? refs.selectedChapterOneCandidateId,
      chapterPlanVersionId: refs.currentChapterPlanVersionId,
      selectionReason: request.selectionReason,
      confirmRisk: request.confirmRisk
    });
    case 'body_batch_generate': {
      const startChapter = typeof request.startChapterNo === 'number' ? request.startChapterNo : 1;
      const endChapter = typeof request.endChapterNo === 'number' ? request.endChapterNo : startChapter;
      return { startChapter, endChapter, batchSize: endChapter - startChapter + 1, strategySnapshotId: refs.strategySnapshotId };
    }
    case 'chapter_body_generate': return compact({ chapterId: objectId, strategySnapshotId: refs.strategySnapshotId, enhancedReview: request.enhancedReview });
    case 'chapter_rewrite': return compact({ chapterId: objectId, currentContentVersionId: request.currentContentVersionId ?? refs.currentContentVersionId, instruction: request.instruction || request.reason || '基于审稿建议优化本章', reason: request.reason });
    case 'chapter_impact_assess': return compact({ chapterId: objectId, currentContentVersionId: request.currentContentVersionId ?? refs.currentContentVersionId, instruction: request.instruction ?? request.reason, reason: request.reason });
    case 'chapter_adopt_impact_assess': return compact({ chapterId: objectId, candidateVersionId: refs.candidateVersionId, currentContentVersionId: request.currentContentVersionId ?? refs.currentContentVersionId, reason: request.reason || '采用候选前影响评估', pageVersionSnapshot: request.pageVersionSnapshot });
    case 'novel_full_review': return { policyProfileVersionId: request.reviewPolicyVersionId ?? policyProfileVersionId };
  }
}

function normalizeClaimSourceRefs(action: NovelProviderAction, value: unknown, objectId: string) {
  const refs = toRecord(value);
  const structure = {
    currentDirectionVersionId: refs.currentDirectionVersionId,
    currentSettingVersionId: refs.currentSettingVersionId,
    currentOutlineVersionId: refs.currentOutlineVersionId,
    currentStageOutlineVersionId: refs.currentStageOutlineVersionId
  };
  if (action === 'direction_generate') return { currentDirectionVersionId: refs.currentDirectionVersionId };
  if (action === 'direction_fuse' || action === 'direction_optimize') return { sourceVersionIds: canonicalIdArray(refs.sourceVersionIds) };
  if (action === 'setting_generate' || action === 'outline_generate' || action === 'stage_outline_generate' || action === 'chapter_plan_generate') {
    return { ...structure, objectType: action.replace('_generate', '') };
  }
  if (action === 'trial_chapter_one_generate' || action === 'trial_followup_generate') {
    return { ...structure, currentChapterPlanVersionId: refs.currentChapterPlanVersionId, objectType: 'trial_run',
      ...(action === 'trial_followup_generate' ? { trialRunId: objectId, selectedChapterOneCandidateId: refs.selectedChapterOneCandidateId } : {}) };
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

function assertRequiredClaimSourceRefs(action: NovelProviderAction, value: unknown) {
  const refs = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (!refs) throw sourceStale();
  const structure = [
    'currentDirectionVersionId',
    'currentSettingVersionId',
    'currentOutlineVersionId',
    'currentStageOutlineVersionId'
  ];
  let required: string[];
  switch (action) {
    case 'direction_generate': required = ['currentDirectionVersionId']; break;
    case 'direction_fuse':
    case 'direction_optimize': required = ['sourceVersionIds']; break;
    case 'setting_generate':
    case 'outline_generate':
    case 'stage_outline_generate':
    case 'chapter_plan_generate': required = [...structure, 'objectType']; break;
    case 'trial_chapter_one_generate': required = [...structure, 'currentChapterPlanVersionId', 'objectType']; break;
    case 'trial_followup_generate': required = [...structure, 'currentChapterPlanVersionId', 'selectedChapterOneCandidateId', 'objectType']; break;
    case 'body_batch_generate':
    case 'chapter_body_generate': required = [
      ...structure,
      'currentChapterPlanVersionId',
      'trialRunId',
      'selectedChapterOneCandidateId',
      'strategySnapshotId',
      'strategySnapshotVersion',
      'creationStage'
    ]; break;
    case 'chapter_rewrite':
    case 'chapter_impact_assess': required = ['currentContentVersionId']; break;
    case 'chapter_adopt_impact_assess': required = ['currentContentVersionId', 'candidateVersionId']; break;
    case 'novel_full_review': required = [...structure, 'currentChapterPlanVersionId', 'chapterContentVersionIds']; break;
  }
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(refs, key))) throw sourceStale();
  const expectedObjectType = action === 'setting_generate' ? 'setting'
    : action === 'outline_generate' ? 'outline'
      : action === 'stage_outline_generate' ? 'stage_outline'
        : action === 'chapter_plan_generate' ? 'chapter_plan'
          : action === 'trial_chapter_one_generate' || action === 'trial_followup_generate' ? 'trial_run'
            : null;
  if (expectedObjectType && refs.objectType !== expectedObjectType) throw sourceStale();
  if ((action === 'body_batch_generate' || action === 'chapter_body_generate') && refs.creationStage !== 'body') throw sourceStale();
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function compact(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''));
}

function canonicalIdArray(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].sort();
}

function buildAuthoritativeProviderInput(
  action: NovelProviderAction,
  authority: GenerationAuthoritySnapshot,
  normalizedRequest: unknown,
  sourceVersionRefs: unknown
): unknown {
  const facts = toRecord(authority.facts);
  const request = toRecord(normalizedRequest);
  const refs = toRecord(sourceVersionRefs);
  const novel = toRecord(facts.novel);
  const preferences = facts.preferences ? toRecord(facts.preferences) : { appealPoints: [], targetAudience: null, stageCount: null };
  const versions = Array.isArray(facts.versions) ? facts.versions as CreativeVersionRecord[] : [];
  const chapters = Array.isArray(facts.chapters) ? facts.chapters as NovelChapterRecord[] : [];
  const chapter = facts.chapter as NovelChapterRecord | null;
  const currentContent = facts.currentContent as ChapterContentVersionRecord | null;
  const candidate = facts.candidate as ChapterContentVersionRecord | null;
  const strategy = facts.strategy as CreativeVersionRecord | null;
  const version = (id: unknown) => typeof id === 'string' ? versions.find((item) => item.id === id) ?? null : null;
  if (action === 'direction_generate') return { action, novel, preferences };
  if (action === 'direction_fuse') return { action, sources: versions.map(projectAuthorityDirection), reason: request.reason };
  if (action === 'direction_optimize') return { action, source: projectAuthorityDirection(versions[0]), instruction: request.instruction };
  if (['setting_generate', 'outline_generate', 'stage_outline_generate', 'chapter_plan_generate'].includes(action)) {
    return {
      action,
      objectType: action.replace('_generate', ''),
      novel,
      preferences,
      currentAssets: {
        direction: projectCreativeAssetProviderInput(version(refs.currentDirectionVersionId)),
        setting: action === 'setting_generate' ? null : projectCreativeAssetProviderInput(version(refs.currentSettingVersionId)),
        outline: action === 'setting_generate' || action === 'outline_generate' ? null : projectCreativeAssetProviderInput(version(refs.currentOutlineVersionId)),
        stageOutline: action === 'chapter_plan_generate' ? projectCreativeAssetProviderInput(version(refs.currentStageOutlineVersionId)) : null
      }
    };
  }
  if (action === 'trial_chapter_one_generate') {
    return { action, novel, preferences, chapters: chapters.map(projectChapterProviderInput), chapterCount: Number(request.chapterCount) };
  }
  if (action === 'trial_followup_generate') {
    return { action, novel, selectedCandidate: projectChapterContentProviderInput(candidate!), chapters: chapters.map(projectChapterProviderInput) };
  }
  if (action === 'body_batch_generate' || action === 'chapter_body_generate') {
    const targetChapters = action === 'body_batch_generate'
      ? chapters.filter((item) => item.chapterNo >= Number(request.startChapter) && item.chapterNo <= Number(request.endChapter))
      : chapter ? [chapter] : [];
    const content = toRecord(strategy?.content);
    return {
      action,
      novel,
      targetChapters: targetChapters.map(projectChapterProviderInput),
      strategySnapshot: projectBodyStrategyProviderInput(strategy!),
      previousContent: facts.bodyPreviousContent
        ? projectChapterContentProviderInput(facts.bodyPreviousContent as ChapterContentVersionRecord) : null,
      previousMemory: projectLongTermMemoryProviderInput(facts.bodyPreviousMemory as LongTermMemoryRecord | null),
      previousBatchNotes: Array.isArray(facts.bodyPreviousBatchNotes) ? facts.bodyPreviousBatchNotes : [],
      enhancedReview: targetChapters[0]?.chapterNo <= 10
        && (arrayHasItems(content.acceptedRisks) || arrayHasItems(content.enhancedReviewRules))
    };
  }
  if (action === 'chapter_rewrite') {
    return { action, novel, chapter: projectChapterProviderInput(chapter!), currentContent: projectChapterContentProviderInput(currentContent!), instruction: request.instruction };
  }
  if (action === 'chapter_impact_assess') {
    const projected = projectChapterContentProviderInput(currentContent!);
    return { action, novel, chapter: projectChapterProviderInput(chapter!), oldContent: projected, newContent: projected, instruction: request.instruction };
  }
  if (action === 'chapter_adopt_impact_assess') {
    return { action, novel, chapter: projectChapterProviderInput(chapter!), oldContent: currentContent ? projectChapterContentProviderInput(currentContent) : null,
      newContent: projectChapterContentProviderInput(candidate!), instruction: candidate?.rewriteReason };
  }
  return {
    action,
    novel,
    chapters: chapters.map(projectChapterProviderInput),
    sourceVersionRefs: projectFullReviewSourceVersionRefsProviderInput(refs)
  };
}

function projectAuthorityDirection(version: CreativeVersionRecord | undefined) {
  const content = toRecord(version?.content);
  const metadata = toRecord(version?.metadata);
  return {
    title: String(content.title ?? ''), summary: version?.summary ?? '',
    content: {
      title: String(content.title ?? ''), logline: String(content.logline ?? ''), coreHook: String(content.coreHook ?? ''),
      audienceAppeal: String(content.audienceAppeal ?? ''), videoPotential: String(content.videoPotential ?? ''),
      sellingPoints: stringArray(content.sellingPoints), riskTags: stringArray(content.riskTags), recommendation: String(content.recommendation ?? '')
    },
    score: version?.score ?? 0, marketScore: Number(metadata.marketScore ?? 0), riskLevel: version?.riskLevel,
    riskTags: stringArray(metadata.riskTags), recommendedReason: String(metadata.recommendedReason ?? content.recommendation ?? '')
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function arrayHasItems(value: unknown): boolean {
  return stringArray(value).length > 0;
}

function taskConflict(code: ErrorCode, message: string, task: GenerationTaskRecord) {
  return new BusinessError(code, message, {
    existingTaskId: task.id,
    activeTaskId: task.id,
    taskType: task.taskType,
    status: task.status
  });
}

function assertTrustedContext(context: RequestContext) {
  if (
    !context.tenantId.trim()
    || !context.userId.trim()
    || context.userId === 'user_default'
  ) {
    throw new BusinessError(ErrorCode.Unauthorized, '当前请求缺少可信身份。');
  }
}

function sourceStale() {
  return new BusinessError(ErrorCode.VersionConflict, '生成所依赖的权威内容已变化，请刷新后重试。', {
    code: 'SOURCE_STALE'
  });
}

async function failClaimedTask<TProviderResult, TFinalResult>(
  input: ExecuteClaimedGenerationInput<TProviderResult, TFinalResult>,
  task: GenerationTaskRecord,
  error: unknown,
  category: 'provider_error' | 'save_failed' | 'source_stale'
) {
  const sourceChanged = category === 'source_stale';
  await input.repository.failTask({
    task,
    errorCode: sourceChanged ? 'SOURCE_STALE' : category === 'provider_error' ? 'PROVIDER_ERROR' : 'SAVE_FAILED',
    errorMessage: sourceChanged ? '生成所依赖的权威内容已变化。' : category === 'provider_error' ? '模型服务调用失败。' : '生成结果保存失败。',
    failureCategory: category,
    statusNote: sourceChanged ? '权威内容已变化，任务已在模型调用前终止。' : category === 'provider_error' ? '模型服务调用失败，请稍后重试。' : '生成结果保存失败，请联系管理员处理。',
    context: input.context,
    now: input.now()
  });
  void error;
}
