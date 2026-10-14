import {
  ErrorCode, NovelLifecycleStatus, StaleLevel, VersionStatus, assertNoSensitiveExecutionPayload,
  type AdoptChapterContentVersionRequest, type CreateImpactAssessmentRequest, type RewriteChapterRequest
} from '@ai-shortvideo/shared';
import { BusinessError } from '../../../shared/errors.js';
import { matchesChapterAdoptionContract } from '../domain/chapterAdoptionContract.js';
import type { NovelRepository, RequestContext } from '../domain/novelDomain.js';
import type { BodyProvider } from '../providers/mockBodyProvider.js';
import { getActionExecutionPlan } from './actionExecutionPlan.js';
import { claimQueuedGeneration, createActorScopedIdempotencyToken } from './taskClaim.js';

type ChapterSubmission =
  | { action: 'chapter_rewrite'; request: RewriteChapterRequest }
  | { action: 'chapter_impact_assess'; request: CreateImpactAssessmentRequest }
  | { action: 'chapter_adopt_impact_assess'; request: AdoptChapterContentVersionRequest; candidateVersionId: string };

export async function queueChapterAction(input: ChapterSubmission & {
  repository: NovelRepository;
  provider: BodyProvider;
  novelId: string;
  chapterId: string;
  context: RequestContext;
  authoritativeNow: Date;
}) {
  const { repository, novelId, chapterId, context, request, action, authoritativeNow } = input;
  const idempotencyKey = request.idempotencyKey?.trim() ?? '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/.test(idempotencyKey)) {
    throw new BusinessError(ErrorCode.ValidationError, '后台任务需要有效的持久提交键。');
  }
  const novel = await repository.findById(context.tenantId, novelId);
  if (!novel) throw new BusinessError(ErrorCode.NotFound, '小说不存在');
  const chapter = await repository.findChapterById(context.tenantId, novelId, chapterId);
  if (!chapter) throw new BusinessError(ErrorCode.NotFound, '章节不存在');
  const existingTask = await repository.findTaskByIdempotencyToken(context.tenantId,
    getActionExecutionPlan(action).taskType, createActorScopedIdempotencyToken({
      tenantId: context.tenantId, userId: context.userId, action, objectId: chapterId,
      rawIdempotencyKey: idempotencyKey
    }));
  const existingRefs = record(existingTask?.sourceVersionRefs);
  // An omitted source on replay refers to the original contract, not a newly adopted version.
  const currentContentVersionId = request.currentContentVersionId !== undefined
    ? request.currentContentVersionId
    : existingTask ? existingRefs.currentContentVersionId : chapter.currentContentVersionId;
  const pageVersionSnapshot = input.action === 'chapter_adopt_impact_assess'
    ? input.request.pageVersionSnapshot ?? undefined : undefined;
  if (input.action === 'chapter_adopt_impact_assess') {
    assertPageSnapshot(pageVersionSnapshot);
  }
  if (!existingTask) {
    if (novel.lifecycleStatus !== NovelLifecycleStatus.Active) {
      throw new BusinessError(ErrorCode.GateBlocked, '当前小说状态不允许生成任务。');
    }
    if (!chapter.currentContentVersionId) {
      throw new BusinessError(ErrorCode.GateBlocked, action === 'chapter_adopt_impact_assess'
        ? '首次采用尚未支持后台影响评估；当前章节没有正式正文，任务未创建。'
        : '当前章节没有正式正文，不能发起重写或影响评估。');
    }
    if (!currentContentVersionId || currentContentVersionId !== chapter.currentContentVersionId) {
      throw new BusinessError(ErrorCode.VersionConflict, '当前章节正文版本已变化，请刷新后重试');
    }
    const currentContent = await repository.findChapterContentVersionById(context.tenantId, novelId, String(currentContentVersionId));
    if (!currentContent || currentContent.chapterId !== chapter.id
      || currentContent.status !== VersionStatus.Current || currentContent.staleLevel !== StaleLevel.None) {
      throw new BusinessError(ErrorCode.CandidateStale, '当前章节正式正文不可用，请刷新后重试。');
    }
    if (action !== 'chapter_impact_assess' && (!chapter.wordTarget || !Number.isSafeInteger(chapter.wordTarget) || chapter.wordTarget <= 0)) {
      throw new BusinessError(ErrorCode.GateBlocked, '请先配置章节目标字数。');
    }
    if (input.action === 'chapter_adopt_impact_assess') {
      const candidate = await repository.findChapterContentVersionById(context.tenantId, novelId, input.candidateVersionId);
      if (!candidate || candidate.chapterId !== chapter.id) {
        throw new BusinessError(ErrorCode.NotFound, '章节候选正文不存在');
      }
      if (!matchesChapterAdoptionContract(chapter, currentContent, candidate, pageVersionSnapshot)) {
        throw new BusinessError(ErrorCode.CandidateStale, '候选来源、状态、字数门禁或页面采用快照已变化，不能采用。');
      }
    }
  }
  return claimQueuedGeneration({
    action, repository, novel, objectId: chapterId, idempotencyKey,
    effectiveRequest: {
      currentContentVersionId, reason: request.reason?.trim() || null,
      ...(input.action === 'chapter_rewrite' ? { instruction: input.request.instruction?.trim() || null } : {}),
      ...(input.action === 'chapter_adopt_impact_assess'
        ? { candidateVersionId: input.candidateVersionId, pageVersionSnapshot } : {})
    },
    sourceVersionRefs: { currentContentVersionId,
      ...(input.action === 'chapter_adopt_impact_assess' ? { candidateVersionId: input.candidateVersionId } : {}) },
    context, now: () => authoritativeNow,
    durationDeadlineAt: new Date(authoritativeNow.getTime() + 15 * 60_000),
    providerCapability: input.provider
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function assertPageSnapshot(value: unknown) {
  if (value === undefined) return;
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 4096) {
      throw new Error('invalid page snapshot');
    }
    assertNoSensitiveExecutionPayload(value, 'pageVersionSnapshot');
  } catch {
    throw new BusinessError(ErrorCode.ValidationError, '页面版本快照无效或含有敏感字段。');
  }
}
