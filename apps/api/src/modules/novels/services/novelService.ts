import {
  ErrorCode,
  ImpactLevel,
  RiskLevel,
  StaleLevel,
  TaskStatus,
  VersionStatus,
  NovelCreationStage,
  NovelLifecycleStatus,
  StageStatus,
  type AdoptDirectionRequest,
  type CreateNovelDraftRequest,
  type CreateNovelPreferencesDTO,
  type AdoptChapterContentVersionRequest,
  type BodyBatchChapterResultDTO,
  type BodyBatchActionResultDTO,
  type BodyBatchDTO,
  type BodyBatchSummaryDTO,
  type BodyGenerationStateDTO,
  type BodyGenerationStrategySnapshotDTO,
  type ChapterFeatureCardDTO,
  type ChapterContentAdoptionResultDTO,
  type ChapterReviewIssueDTO,
  type ChapterReviewReportDTO,
  type ChapterRewriteResultDTO,
  type ChapterSummaryCompareDTO,
  type ChapterWorkbenchDTO,
  type CompletionActionResultDTO,
  type CompletionDecisionDTO,
  type ConfirmCompletionRequest,
  type ConfirmVideoReadinessRequest,
  type ConfirmTrialRequest,
  type CreateImpactAssessmentRequest,
  type DirectionActionResultDTO,
  type DirectionCandidateContentDTO,
  type DirectionCandidateDTO,
  type DirectionTaskDTO,
  type EditDirectionCandidateRequest,
  type EditStructureAssetRequest,
  type FirstVideoSuggestionDTO,
  type ForcePassFullReviewRequest,
  type FullReviewActionResultDTO,
  type FullReviewGateDTO,
  type FullReviewIssueActionResultDTO,
  type FullReviewIssueDTO,
  type FullReviewLatestResultDTO,
  type FullReviewReportDTO,
  type FuseDirectionsRequest,
  type GenerateBodyBatchRequest,
  type GenerateChapterBodyRequest,
  type GenerateDirectionsRequest,
  type GenerateStructureAssetRequest,
  type GenerateTrialRequest,
  type ImpactAssessmentActionResultDTO,
  type ImpactCaseDTO,
  type ImpactCaseVisibleStatus,
  type ImpactCaseResolveResultDTO,
  type LongTermMemoryDTO,
  type NovelDetailDTO,
  type NovelChapterDTO,
  type NovelListItemDTO,
  type NovelListQuery,
  type NovelListResultDTO,
  type NovelRowSummaryDTO,
  type OptimizeDirectionRequest,
  type RecheckVideoReadinessRequest,
  type ResolveFullReviewIssueRequest,
  type ResolveImpactCaseRequest,
  type RewriteChapterRequest,
  type StartFullReviewRequest,
  type StructureActionResultDTO,
  type StructureAssetContentDTO,
  type StructureAssetDTO,
  type StructureAssetType,
  type StructureTaskDTO,
  type AdoptStructureAssetRequest,
  type UpdateChapterWordTargetsRequest,
  type TrialActionResultDTO,
  type TrialChapterCandidateDTO,
  type TrialChapterResultDTO,
  type TrialReviewDTO,
  type TrialRunDTO,
  type VideoReadinessActionResultDTO,
  type VideoReadinessCheckDTO,
  type VideoReadinessDTO,
  type VideoReadinessSnapshotDTO,
  type QualityScoringDTO
} from '@ai-shortvideo/shared';
import { BusinessError } from '../../../shared/errors.js';
import {
  DEFAULT_TENANT_ID,
  DEFAULT_USER_ID,
  DEFAULT_POLICY_PROFILE_VERSION_ID,
  type BodyChapterDraft,
  type ChapterContentVersionRecord,
  type ChapterFeatureCardRecord,
  type CreativeVersionRecord,
  type BodyBatchRecord,
  type BodyBatchSummaryRecord,
  type DirectionCandidateDraft,
  type GenerationTaskRecord,
  type GeneratedBodyBatchRecord,
  type ImpactCaseRecord,
  type LongTermMemoryRecord,
  type NovelChapterRecord,
  type NovelPreferencesRecord,
  type NovelRecord,
  type NovelRepository,
  type RequestContext,
  type ReviewReportRecord,
  type StructureAssetDraft,
  type FullReviewGateRecord,
  type CompletionDecisionRecord,
  type VideoReadinessCheckRecord,
  type VideoReadinessSnapshotRecord,
  type TrialRunRecord,
  type TrialChapterResultRecord,
  type TrialChapterCandidateDraft, type TrialFollowupChapterDraft
} from '../domain/novelDomain.js';
import { MockDirectionProvider, type DirectionProvider } from '../providers/mockDirectionProvider.js';
import { MockStructureProvider, type StructureProvider } from '../providers/mockStructureProvider.js';
import { MockTrialProvider, type TrialProvider } from '../providers/mockTrialProvider.js';
import { MockBodyProvider, type BodyProvider } from '../providers/mockBodyProvider.js';
import { MockFullReviewProvider, type FullReviewProvider } from '../providers/mockFullReviewProvider.js';
import { UnavailableHotspotReferenceGateway, type HotspotReferenceGateway } from '../integrations/hotspotReferenceGateway.js';
import { NovelStatusService } from './novelStatusService.js';
import { toRecentTaskSummaryDTO } from '../../tasks/services/taskService.js';
import {
  createActorScopedIdempotencyToken,
  executeClaimedGeneration as executeTaskClaimedGeneration,
  type ExecuteClaimedGenerationInput,
  type ExecuteClaimedGenerationResult,
  type NovelProviderAction
} from './taskClaim.js';
import {
  getActionExecutionPlan,
  executeNovelProviderAction,
  projectBodyStrategyProviderInput,
  projectChapterContentProviderInput,
  projectChapterProviderInput,
  projectCreativeAssetProviderInput,
  projectDirectionDraftProviderInput,
  projectFullReviewSourceVersionRefsProviderInput,
  projectLongTermMemoryProviderInput,
  projectNovelProviderInput,
  projectPreferencesProviderInput,
  type BodyChapterProviderDraft,
  type NovelProviderSet,
  type TrialFollowupChapterProviderDraft
} from './actionExecutionPlan.js';

export interface NovelServiceOptions {
  repository: NovelRepository;
  directionProvider?: DirectionProvider;
  structureProvider?: StructureProvider;
  trialProvider?: TrialProvider;
  bodyProvider?: BodyProvider;
  fullReviewProvider?: FullReviewProvider;
  hotspotReferenceGateway?: HotspotReferenceGateway;
  now?: () => Date;
}

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/;

async function executeClaimedGeneration<TProviderResult, TFinalResult>(
  input: ExecuteClaimedGenerationInput<TProviderResult, TFinalResult>
): Promise<ExecuteClaimedGenerationResult<TFinalResult>> {
  const rawIdempotencyKey = resolveLegacyRawIdempotencyKey(input.idempotencyKey, input.context.requestId);
  if (rawIdempotencyKey && isTrustedRequestActor(input.context)) {
    const objectId = input.objectId ?? input.novel.id;
    const scopedToken = createActorScopedIdempotencyToken({
      tenantId: input.context.tenantId,
      userId: input.context.userId,
      action: input.action,
      objectId,
      rawIdempotencyKey
    });
    const taskType = getActionExecutionPlan(input.action).taskType;
    const scopedTask = await input.repository.findTaskByIdempotencyToken(input.context.tenantId, taskType, scopedToken);
    if (!scopedTask) {
      const legacyTask = await input.repository.findTaskByIdempotencyToken(input.context.tenantId, taskType, rawIdempotencyKey);
      if (legacyTask && !isTrustedLegacyTaskActor(legacyTask.createdBy, input.context.userId)) {
        throw new BusinessError(ErrorCode.IdempotencyConflict, '同一个幂等键已绑定到无法验证归属的历史任务。', {
          taskType,
          existingTaskId: legacyTask.id
        });
      }
    }
  }

  return executeTaskClaimedGeneration(input);
}

function resolveLegacyRawIdempotencyKey(idempotencyKey: string | null | undefined, requestId: string): string | null {
  const normalized = idempotencyKey?.trim();
  if (normalized) return IDEMPOTENCY_KEY_PATTERN.test(normalized) ? normalized : null;
  return `request:${requestId}`.slice(0, 120);
}

function isTrustedRequestActor(context: RequestContext): boolean {
  return Boolean(context.userId?.trim()) && context.userId !== DEFAULT_USER_ID;
}

function isTrustedLegacyTaskActor(createdBy: string | null | undefined, requestUserId: string): boolean {
  return Boolean(createdBy?.trim()) && createdBy !== DEFAULT_USER_ID && createdBy === requestUserId;
}

export class NovelService {
  private readonly statusService: NovelStatusService;
  private readonly directionProvider: DirectionProvider;
  private readonly structureProvider: StructureProvider;
  private readonly trialProvider: TrialProvider;
  private readonly bodyProvider: BodyProvider;
  private readonly fullReviewProvider: FullReviewProvider;
  private readonly hotspotReferenceGateway: HotspotReferenceGateway;
  private readonly now: () => Date;

  constructor(private readonly options: NovelServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.statusService = new NovelStatusService(this.now);
    this.directionProvider = options.directionProvider ?? new MockDirectionProvider();
    this.structureProvider = options.structureProvider ?? new MockStructureProvider();
    this.trialProvider = options.trialProvider ?? new MockTrialProvider();
    this.bodyProvider = options.bodyProvider ?? new MockBodyProvider();
    this.fullReviewProvider = options.fullReviewProvider ?? new MockFullReviewProvider();
    this.hotspotReferenceGateway = options.hotspotReferenceGateway ?? new UnavailableHotspotReferenceGateway();
  }

  private getProviderSet(): NovelProviderSet {
    return {
      directionProvider: this.directionProvider,
      structureProvider: this.structureProvider,
      trialProvider: this.trialProvider,
      bodyProvider: this.bodyProvider,
      fullReviewProvider: this.fullReviewProvider
    };
  }

  async createDraft(request: CreateNovelDraftRequest, context: RequestContext): Promise<NovelDetailDTO> {
    if (request.chapterWordRange && request.chapterWordRange.min > request.chapterWordRange.max) {
      throw new BusinessError(ErrorCode.ValidationError, '章节字数范围不合法', {
        issues: [{ path: 'chapterWordRange', message: 'min must be <= max' }]
      });
    }

    const creationSourceContext = await this.validateCreationSource(request, context);

    const { novel, preferences } = await this.options.repository.createDraft({
      request,
      context,
      now: this.now(),
      creationSourceContext
    });

    return this.toDetailDTO(novel, preferences);
  }

  private async validateCreationSource(request: CreateNovelDraftRequest, context: RequestContext) {
    const sourceType = request.creationSourceType ?? 'system_recommendation';
    const customIdea = request.preferences?.customIdea?.trim() ?? '';
    const hotspotReportId = request.hotspotReportId?.trim() ?? '';
    const hotspotOpportunityId = request.hotspotOpportunityId?.trim() ?? '';

    if (sourceType === 'system_recommendation') {
      if (hotspotReportId || hotspotOpportunityId) {
        throw createCreationSourceValidationError('hotspotReportId', '系统推荐不能携带热点报告或机会点。');
      }

      return { hotspotTitle: null, hotspotOpportunityTitle: null };
    }

    if (sourceType === 'manual_idea') {
      if (customIdea.length < 6) {
        throw createCreationSourceValidationError('preferences.customIdea', '手动想法需要填写不少于 6 个字符的核心想法。');
      }

      if (hotspotReportId || hotspotOpportunityId) {
        throw createCreationSourceValidationError('hotspotReportId', '手动想法不能携带热点报告或机会点。');
      }

      return { hotspotTitle: null, hotspotOpportunityTitle: null };
    }

    if (sourceType === 'hotspot_reference') {
      if (!hotspotReportId) {
        throw createCreationSourceValidationError('hotspotReportId', '引用热点需要选择可验证的热点报告。');
      }

      const capability = await this.hotspotReferenceGateway.getCapability(context.tenantId);
      if (!capability.available) {
        throw createCreationSourceValidationError('creationSourceType', capability.unavailableReason ?? '当前热点引用能力不可用。');
      }

      const validation = await this.hotspotReferenceGateway.validateReference({
        tenantId: context.tenantId,
        reportId: hotspotReportId,
        opportunityId: hotspotOpportunityId || null
      });

      if (!validation.ok) {
        throw createCreationSourceValidationError('hotspotReportId', validation.message ?? '热点引用校验未通过。', {
          reasonCode: validation.reasonCode
        });
      }

      return {
        hotspotTitle: validation.report?.title ?? null,
        hotspotOpportunityTitle: validation.opportunity?.title ?? null
      };
    }

    throw createCreationSourceValidationError('creationSourceType', '创作来源类型不合法。');
  }

  async list(query: NovelListQuery, tenantId = DEFAULT_TENANT_ID): Promise<NovelListResultDTO> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const { items, total } = await this.options.repository.list({
      tenantId,
      page,
      pageSize,
      keyword: query.keyword,
      lifecycleStatus: query.lifecycleStatus,
      creationStage: query.creationStage,
      videoReferenceStatus: query.videoReferenceStatus
    });

    return {
      items: await Promise.all(items.map((novel) => this.toListItemDTOWithRecentTask(novel))),
      page,
      pageSize,
      total
    };
  }

  async getDetail(novelId: string, tenantId = DEFAULT_TENANT_ID): Promise<NovelDetailDTO> {
    const novel = await this.findNovelOrThrow(tenantId, novelId);
    const preferences = await this.options.repository.findPreferencesByNovelId(tenantId, novelId);
    const detail = this.toDetailDTO(novel, preferences ?? createEmptyPreferences(novel));

    return enrichDetailWithCreativeAssets(detail, novel, this.options.repository, tenantId);
  }

  async getSummary(novelId: string, tenantId = DEFAULT_TENANT_ID): Promise<NovelRowSummaryDTO> {
    const novel = await this.findNovelOrThrow(tenantId, novelId);
    const latestTrialRun = await this.options.repository.findLatestTrialRun(tenantId, novelId);
    const statusSummary = applyTrialReviewStatusSummary(this.statusService.calculate(novel), latestTrialRun);
    const recentTasks = await this.options.repository.listRecentTasksForNovel(tenantId, novelId, 1);

    return {
      novelId,
      recentTask: recentTasks[0] ? toRecentTaskSummaryDTO(recentTasks[0]) : null,
      recentReviewSummary: null,
      pendingChapters: 0,
      riskTips: ['暂无 AI 结果，尚未进入内容风险判断。'],
      recommendedAction: statusSummary.recommendedAction
    };
  }

  async generateDirections(novelId: string, request: GenerateDirectionsRequest, context: RequestContext): Promise<DirectionActionResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    const rawIdempotencyKey = request.idempotencyKey?.trim() || `request:${context.requestId}`.slice(0, 120);
    const idempotencyToken = createActorScopedIdempotencyToken({
      tenantId: context.tenantId,
      userId: context.userId,
      action: 'direction_generate',
      objectId: novel.id,
      rawIdempotencyKey
    });
    const existingTask = await this.options.repository.findTaskByIdempotencyToken(
      context.tenantId,
      'novel_direction_generate',
      idempotencyToken
    );
    if (!existingTask) {
      this.ensureLifecycleActive(novel);
      this.ensureDirectionGenerationStage(novel);
    }
    const preferences = await this.options.repository.findPreferencesByNovelId(context.tenantId, novelId);
    const sourceVersionRefs = existingTask?.sourceVersionRefs ?? { currentDirectionVersionId: novel.currentDirectionVersionId };
    const providerInput = {
      action: 'direction_generate' as const,
      novel: projectNovelProviderInput(novel),
      preferences: projectPreferencesProviderInput(preferences ?? createEmptyPreferences(novel))
    };
    const execution = await executeClaimedGeneration({
      action: 'direction_generate',
      repository: this.options.repository,
      novel,
      idempotencyKey: request.idempotencyKey,
      effectiveRequest: { regenerateReason: request.regenerateReason?.trim() || null },
      sourceVersionRefs,
      context,
      now: this.now,
      providerCapability: this.directionProvider,
      provider: (authoritativeInput) => executeNovelProviderAction(this.getProviderSet(), authoritativeInput as typeof providerInput),
      finalize: (task, candidates) => this.options.repository.createDirectionCandidates({
        novel,
        task,
        candidates,
        taskType: 'novel_direction_generate',
        changeReason: request.regenerateReason ?? '模型服务生成方向候选',
        context,
        now: this.now()
      })
    });
    if (execution.reused) {
      const candidates = await this.options.repository.listDirectionVersions(context.tenantId, novelId);
      return this.toDirectionActionResult(novel, execution.task, candidates, null);
    }
    const result = execution.value;

    return this.toDirectionActionResult(result.novel, result.task, result.versions, null);
  }

  async fuseDirections(novelId: string, request: FuseDirectionsRequest, context: RequestContext): Promise<DirectionActionResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    this.ensureLifecycleActive(novel);
    this.ensureDirectionWorkStage(novel);

    if (request.versionIds.length < 2) {
      throw new BusinessError(ErrorCode.ValidationError, '至少选择两个方向候选进行融合');
    }

    const sources = await this.findDirectionVersionsOrThrow(context.tenantId, novelId, request.versionIds);
    const providerInput = {
      action: 'direction_fuse' as const,
      sources: sources.map((source) => projectDirectionDraftProviderInput(toDirectionDraft(source))),
      reason: request.reason
    };
    const execution = await executeClaimedGeneration({
      action: 'direction_fuse',
      repository: this.options.repository,
      novel,
      idempotencyKey: request.idempotencyKey,
      effectiveRequest: { versionIds: [...request.versionIds].sort(), reason: request.reason?.trim() || null },
      sourceVersionRefs: { sourceVersionIds: request.versionIds },
      context,
      now: this.now,
      providerCapability: this.directionProvider,
      provider: (authoritativeInput) => executeNovelProviderAction(this.getProviderSet(), authoritativeInput as typeof providerInput),
      finalize: (task, candidate) => this.options.repository.createDirectionRevision({
        novel,
        task,
        candidate,
        taskType: 'novel_direction_fuse',
        changeReason: request.reason ?? '融合方向候选',
        sourceVersionIds: request.versionIds,
        context,
        now: this.now()
      })
    });
    const versions = await this.options.repository.listDirectionVersions(context.tenantId, novelId);
    if (execution.reused) return this.toDirectionActionResult(novel, execution.task, versions, null);
    const result = execution.value;

    return this.toDirectionActionResult(result.novel, result.task, versions, result.version);
  }

  async optimizeDirection(novelId: string, versionId: string, request: OptimizeDirectionRequest, context: RequestContext): Promise<DirectionActionResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    this.ensureLifecycleActive(novel);
    this.ensureDirectionWorkStage(novel);
    const source = await this.findDirectionVersionOrThrow(context.tenantId, novelId, versionId);
    const providerInput = {
      action: 'direction_optimize' as const,
      source: projectDirectionDraftProviderInput(toDirectionDraft(source)),
      instruction: request.instruction
    };
    const execution = await executeClaimedGeneration({
      action: 'direction_optimize',
      repository: this.options.repository,
      novel,
      objectId: versionId,
      idempotencyKey: request.idempotencyKey,
      effectiveRequest: { versionId, instruction: request.instruction?.trim() || null },
      sourceVersionRefs: { sourceVersionIds: [versionId] },
      context,
      now: this.now,
      providerCapability: this.directionProvider,
      provider: (authoritativeInput) => executeNovelProviderAction(this.getProviderSet(), authoritativeInput as typeof providerInput),
      finalize: (task, candidate) => this.options.repository.createDirectionRevision({
        novel,
        task,
        candidate,
        taskType: 'novel_direction_optimize',
        changeReason: request.instruction ?? '优化方向候选',
        sourceVersionIds: [versionId],
        context,
        now: this.now()
      })
    });
    const versions = await this.options.repository.listDirectionVersions(context.tenantId, novelId);
    if (execution.reused) return this.toDirectionActionResult(novel, execution.task, versions, null);
    const result = execution.value;

    return this.toDirectionActionResult(result.novel, result.task, versions, result.version);
  }

  async editDirectionCandidate(novelId: string, versionId: string, request: EditDirectionCandidateRequest, context: RequestContext): Promise<DirectionActionResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    this.ensureLifecycleActive(novel);
    this.ensureDirectionWorkStage(novel);
    const source = await this.findDirectionVersionOrThrow(context.tenantId, novelId, versionId);
    const sourceDraft = toDirectionDraft(source);
    const candidate: DirectionCandidateDraft = {
      title: request.title.trim(),
      summary: request.logline.trim(),
      content: {
        title: request.title.trim(),
        logline: request.logline.trim(),
        coreHook: request.coreHook.trim(),
        audienceAppeal: request.audienceAppeal.trim(),
        videoPotential: request.videoPotential.trim(),
        sellingPoints: normalizeTextItems(request.sellingPoints),
        riskTags: normalizeTextItems(request.riskTags),
        recommendation: request.recommendation.trim()
      },
      score: sourceDraft.score,
      marketScore: sourceDraft.marketScore,
      riskLevel: sourceDraft.riskLevel,
      riskTags: normalizeTextItems(request.riskTags),
      recommendedReason: request.recommendation.trim()
    };
    const result = await this.options.repository.createDirectionRevision({
      novel,
      candidate,
      taskType: 'novel_direction_manual_edit',
      changeReason: request.reason.trim(),
      sourceVersionIds: [versionId],
      context,
      now: this.now()
    });
    const versions = await this.options.repository.listDirectionVersions(context.tenantId, novelId);

    return this.toDirectionActionResult(result.novel, result.task, versions, result.version);
  }

  async adoptDirection(novelId: string, versionId: string, request: AdoptDirectionRequest, context: RequestContext): Promise<DirectionActionResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    this.ensureLifecycleActive(novel);
    this.ensureDirectionWorkStage(novel);

    if (request.currentVersionId !== undefined && request.currentVersionId !== novel.currentDirectionVersionId) {
      throw new BusinessError(ErrorCode.VersionConflict, '当前方向版本已变化，请刷新后重试');
    }

    const candidate = await this.findDirectionVersionOrThrow(context.tenantId, novelId, versionId);
    if (candidate.status !== VersionStatus.Candidate) {
      throw new BusinessError(ErrorCode.VersionConflict, '该方向候选当前不可采用');
    }
    if (candidate.staleLevel === StaleLevel.HardStale) {
      throw new BusinessError(ErrorCode.CandidateStale, '该方向候选已过期，请重新生成');
    }

    const score = candidate.score ?? 0;
    const isLowScore = score < 70;
    const reason = request.reason?.trim() ?? '';
    if (isLowScore && (!request.confirmLowScore || !reason)) {
      throw new BusinessError(ErrorCode.GateBlocked, '低分方向采用必须二次确认并填写原因');
    }

    const result = await this.options.repository.adoptDirection({
      novel,
      candidate,
      reason: reason || '采用方向候选',
      isForced: isLowScore,
      pageVersionSnapshot: request.pageVersionSnapshot,
      context,
      now: this.now()
    });

    return this.toDirectionActionResult(
      result.novel,
      createAdoptedTask(result.currentDirection),
      result.versions,
      result.currentDirection
    );
  }

  async generateSetting(novelId: string, request: GenerateStructureAssetRequest, context: RequestContext) {
    return this.generateStructureAsset(novelId, 'setting', request, context);
  }

  async adoptSetting(novelId: string, versionId: string, request: AdoptStructureAssetRequest, context: RequestContext) {
    return this.adoptStructureAsset(novelId, 'setting', versionId, request, context);
  }

  async generateOutline(novelId: string, request: GenerateStructureAssetRequest, context: RequestContext) {
    return this.generateStructureAsset(novelId, 'outline', request, context);
  }

  async adoptOutline(novelId: string, versionId: string, request: AdoptStructureAssetRequest, context: RequestContext) {
    return this.adoptStructureAsset(novelId, 'outline', versionId, request, context);
  }

  async generateStageOutline(novelId: string, request: GenerateStructureAssetRequest, context: RequestContext) {
    return this.generateStructureAsset(novelId, 'stage_outline', request, context);
  }

  async adoptStageOutline(novelId: string, versionId: string, request: AdoptStructureAssetRequest, context: RequestContext) {
    return this.adoptStructureAsset(novelId, 'stage_outline', versionId, request, context);
  }

  async generateChapterPlan(novelId: string, request: GenerateStructureAssetRequest, context: RequestContext) {
    return this.generateStructureAsset(novelId, 'chapter_plan', request, context);
  }

  async editStructureAsset(
    novelId: string,
    objectType: StructureAssetType,
    versionId: string,
    request: EditStructureAssetRequest,
    context: RequestContext
  ): Promise<StructureActionResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    this.ensureLifecycleActive(novel);
    await this.ensureStructureGenerationGate(novel, objectType);

    const source = await this.options.repository.findStructureVersionById(context.tenantId, novelId, objectType, versionId);
    if (!source) {
      throw new BusinessError(ErrorCode.NotFound, '结构资产候选不存在');
    }
    if (source.staleLevel === StaleLevel.HardStale) {
      throw new BusinessError(ErrorCode.CandidateStale, '该结构资产候选已过期，请重新生成');
    }
    if (source.status !== VersionStatus.Candidate) {
      throw new BusinessError(ErrorCode.VersionConflict, '该结构资产候选当前不可编辑');
    }

    const reason = request.reason.trim();
    const sourceContent = toStructureContent(source.content);
    const riskTags = normalizeTextItems(request.riskTags);
    const recommendation = request.recommendation.trim();
    const content: StructureAssetContentDTO = {
      ...sourceContent,
      title: request.title.trim(),
      summary: request.summary.trim(),
      sections: [
        {
          title: request.sectionTitle.trim(),
          body: request.sectionBody.trim(),
          items: normalizeTextItems(request.sectionItems)
        },
        ...sourceContent.sections.slice(1)
      ],
      riskTags,
      recommendation
    };
    const asset: StructureAssetDraft = {
      objectType,
      title: content.title,
      summary: content.summary,
      content,
      score: source.score ?? 0,
      riskLevel: source.riskLevel,
      riskTags,
      recommendedReason: recommendation
    };
    const directionVersions = await this.options.repository.listDirectionVersions(context.tenantId, novelId);
    const result = await this.options.repository.createStructureCandidate({
      novel,
      asset,
      taskType: `${getStructureTaskType(objectType)}_manual_edit`,
      changeReason: reason,
      sourceVersionRefs: {
        ...createStructureSourceRefs(novel, objectType),
        sourceStructureVersionId: versionId,
        editReason: reason
      },
      context,
      now: this.now()
    });
    const versions = await this.options.repository.listStructureVersions(context.tenantId, novelId);
    const chapters = await this.options.repository.listNovelChapters(context.tenantId, novelId);

    return this.toStructureActionResult(result.novel, result.task, versions, result.version, chapters, directionVersions);
  }

  async adoptChapterPlan(novelId: string, versionId: string, request: AdoptStructureAssetRequest, context: RequestContext) {
    return this.adoptStructureAsset(novelId, 'chapter_plan', versionId, request, context);
  }

  async updateChapterWordTargets(
    novelId: string,
    request: UpdateChapterWordTargetsRequest,
    context: RequestContext
  ): Promise<StructureActionResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    this.ensureLifecycleActive(novel);
    if (!novel.currentChapterPlanVersionId) {
      throw new BusinessError(ErrorCode.GateBlocked, '需要先采用章节目录后才能调整目标字数');
    }
    if (request.currentChapterPlanVersionId !== undefined && request.currentChapterPlanVersionId !== novel.currentChapterPlanVersionId) {
      throw new BusinessError(ErrorCode.VersionConflict, '当前章节目录版本已变化，请刷新后重试');
    }

    const updates = normalizeChapterWordTargetUpdates(request, novel);
    const result = await this.options.repository.updateChapterWordTargets({
      novel,
      updates,
      reason: request.reason?.trim() || '调整章节目标字数',
      context,
      now: this.now()
    });
    const directionVersions = await this.options.repository.listDirectionVersions(context.tenantId, novelId);

    return this.toStructureActionResult(
      result.novel,
      createStructureAdoptedTask(result.currentAsset),
      result.versions,
      result.currentAsset,
      result.chapters,
      directionVersions
    );
  }

  async generateTrial(novelId: string, request: GenerateTrialRequest, context: RequestContext): Promise<TrialActionResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    this.ensureLifecycleActive(novel);
    const chapters = await this.ensureTrialGate(novel, context.tenantId);

    if (!request.trialRunId) {
      const chapterCount = normalizeTrialChapterCount(request.chapterCount);
      const preferences = await this.options.repository.findPreferencesByNovelId(context.tenantId, novelId);
      const sourceVersionRefs = createTrialSourceRefs(novel);
      const providerInput = {
        action: 'trial_chapter_one_generate' as const,
        novel: projectNovelProviderInput(novel),
        preferences: projectPreferencesProviderInput(preferences ?? createEmptyPreferences(novel)),
        chapters: chapters.map(projectChapterProviderInput),
        chapterCount
      };
      const execution = await executeClaimedGeneration({
        action: 'trial_chapter_one_generate',
        repository: this.options.repository,
        novel,
        idempotencyKey: request.idempotencyKey,
        effectiveRequest: { chapterCount, regenerateReason: request.regenerateReason?.trim() || null },
        sourceVersionRefs,
        context,
        now: this.now,
        providerCapability: this.trialProvider,
        provider: (authoritativeInput) => executeNovelProviderAction(this.getProviderSet(), authoritativeInput as typeof providerInput)
          .then((candidates) => bindTrialChapterOneCandidates(chapters, candidates)),
        finalize: (task, candidates) => this.options.repository.createTrialChapterOneCandidates({
          novel,
          task,
          chapters,
          candidates,
          chapterCount,
          changeReason: request.regenerateReason ?? '模型服务生成第1章试写候选',
          sourceVersionRefs,
          context,
          now: this.now()
        })
      });
      if (execution.reused) {
        const latestRun = await this.options.repository.findLatestTrialRun(context.tenantId, novelId);
        return this.toTrialActionResult(novel, execution.task, latestRun ?? createProcessingTrialRun(execution.task, novel, chapterCount));
      }
      const result = execution.value;

      return this.toTrialActionResult(result.novel, result.task, result.trialRun);
    }

    if (!request.selectedCandidateId) {
      throw new BusinessError(ErrorCode.GateBlocked, '选择第1章候选前，不能生成第2-3章');
    }

    const trialRun = await this.options.repository.findTrialRunById(context.tenantId, novelId, request.trialRunId);
    if (!trialRun) {
      throw new BusinessError(ErrorCode.NotFound, '试写记录不存在');
    }
    const followupRawKey = request.idempotencyKey?.trim() || `request:${context.requestId}`.slice(0, 120);
    const followupToken = createActorScopedIdempotencyToken({
      tenantId: context.tenantId,
      userId: context.userId,
      action: 'trial_followup_generate',
      objectId: trialRun.id,
      rawIdempotencyKey: followupRawKey
    });
    const existingFollowupTask = await this.options.repository.findTaskByIdempotencyToken(
      context.tenantId,
      'trial_followup_generate',
      followupToken
    );
    if (trialRun.status !== 'waiting_chapter1_selection' && !existingFollowupTask) {
      throw new BusinessError(ErrorCode.ConflictTaskExists, '本次试写结果正在等待确认，不能用新的幂等键重复生成。', {
        taskType: 'trial_followup_generate',
        status: trialRun.status
      });
    }
    const selectedCandidate = await this.options.repository.findChapterContentVersionById(context.tenantId, novelId, request.selectedCandidateId);
    if (!selectedCandidate || getMetadataString(selectedCandidate.metadata, 'trialRunId') !== trialRun.id) {
      throw new BusinessError(ErrorCode.NotFound, '第1章候选不存在');
    }
    const selectionReason = request.selectionReason?.trim() ?? '';
    if (selectionReason) {
      assertSafeTrialSelectionReason(selectionReason);
    }
    const selectedCandidateRiskLevel = getTrialCandidateRiskLevel(selectedCandidate);
    const requiresRiskConfirmation = selectedCandidateRiskLevel === RiskLevel.High || selectedCandidateRiskLevel === RiskLevel.Blocking;
    if (requiresRiskConfirmation && (!request.confirmRisk || !selectionReason)) {
      throw new BusinessError(ErrorCode.GateBlocked, '高风险试写候选继续生成必须二次确认并填写原因', {
        confirmRisk: request.confirmRisk === true,
        issues: [{ path: 'selectionReason', message: 'required for high or blocking trial candidate' }]
      });
    }

    const sourceVersionRefs = createTrialSourceRefs(novel);
    const trialScopeChapters = chapters.slice(0, trialRun.trialChapterCount);
    const providerInput = {
      action: 'trial_followup_generate' as const,
      novel: projectNovelProviderInput(novel),
      selectedCandidate: projectChapterContentProviderInput(selectedCandidate),
      chapters: trialScopeChapters.map(projectChapterProviderInput)
    };
    const execution = await executeClaimedGeneration({
      action: 'trial_followup_generate',
      repository: this.options.repository,
      novel,
      objectId: trialRun.id,
      idempotencyKey: request.idempotencyKey,
      effectiveRequest: { trialRunId: trialRun.id, selectedCandidateId: selectedCandidate.id },
      sourceVersionRefs: { ...sourceVersionRefs, selectedChapterOneCandidateId: selectedCandidate.id },
      context,
      now: this.now,
      providerCapability: this.trialProvider,
      prepare: () => Promise.resolve(),
      provider: (authoritativeInput) => executeNovelProviderAction(this.getProviderSet(), authoritativeInput as typeof providerInput).then((followup) => ({
        ...followup,
        chapters: bindTrialFollowupChapters(trialScopeChapters, followup.chapters, followup.review)
      })),
      finalize: (task, followup) => this.options.repository.selectTrialChapterOneAndGenerateFollowup({ novel, trialRun, task, selectedCandidate, chapters: followup.chapters, review: followup.review, context, now: this.now() })
    });
    if (execution.reused) return this.toTrialActionResult(novel, execution.task, trialRun);
    const result = execution.value;

    return this.toTrialActionResult(result.novel, result.task, result.trialRun);
  }

  async confirmTrial(novelId: string, request: ConfirmTrialRequest, context: RequestContext): Promise<TrialActionResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    this.ensureLifecycleActive(novel);

    const trialRun = await this.options.repository.findTrialRunById(context.tenantId, novelId, request.trialRunId);
    if (!trialRun) {
      throw new BusinessError(ErrorCode.NotFound, '试写记录不存在');
    }
    if (trialRun.status !== 'review_ready') {
      throw new BusinessError(ErrorCode.GateBlocked, '试写总评尚未完成，不能确认进入后续正文策略');
    }

    const trialReview = trialRun.reviewReportId ? await this.options.repository.findReviewReportById(context.tenantId, trialRun.reviewReportId) : null;
    const reviewMetadata = toRecord(trialReview?.metadata);
    const trialResult = String(reviewMetadata.trialResult ?? trialRun.trialResult ?? '');
    const requiresRiskConfirmation = reviewMetadata.requiresRiskConfirmation === true || request.decision === 'force_pass';
    const reason = request.reason?.trim() ?? '';

    if (trialResult === 'blocked') {
      throw new BusinessError(ErrorCode.GateBlocked, '试写存在硬失败，不能确认进入正文策略');
    }
    if (request.decision === 'return_upstream' && !reason) {
      throw new BusinessError(ErrorCode.GateBlocked, '返回上游必须填写原因');
    }
    if (requiresRiskConfirmation && (!request.confirmRisk || !reason)) {
      throw new BusinessError(ErrorCode.GateBlocked, '低分或风险试写继续必须二次确认并填写原因');
    }
    if (request.decision === 'confirm_pass' && trialResult !== 'pass') {
      throw new BusinessError(ErrorCode.GateBlocked, '当前试写总评不是直接通过，请使用风险继续确认并填写原因');
    }

    const selectedCandidateId = getMetadataString(trialRun.metadata, 'selectedChapterOneCandidateId');
    if (!selectedCandidateId) {
      throw new BusinessError(ErrorCode.GateBlocked, '没有已选择的第1章候选，不能确认试写');
    }
    const selectedCandidate = await this.options.repository.findChapterContentVersionById(context.tenantId, novelId, selectedCandidateId);
    if (!selectedCandidate) {
      throw new BusinessError(ErrorCode.NotFound, '已选择的第1章候选不存在');
    }

    const result = await this.options.repository.confirmTrial({
      novel,
      trialRun,
      selectedCandidate,
      decision: request.decision,
      reason: reason || '试写通过，生成正文策略快照',
      isForced: request.decision === 'force_pass' || requiresRiskConfirmation,
      snapshotContent: createBodyStrategySnapshotContent(trialRun, trialReview, selectedCandidate),
      context,
      now: this.now()
    });
    const task = trialRun.sourceTaskId ? await this.options.repository.findTaskById(context.tenantId, trialRun.sourceTaskId) : createVirtualTrialTask(result.trialRun, result.novel);

    return this.toTrialActionResult(result.novel, task ?? createVirtualTrialTask(result.trialRun, result.novel), result.trialRun, result.bodyStrategySnapshot);
  }

  async getChapterWorkbench(novelId: string, chapterId: string, tenantId = DEFAULT_TENANT_ID): Promise<ChapterWorkbenchDTO> {
    const novel = await this.findNovelOrThrow(tenantId, novelId);
    const record = await this.options.repository.getChapterWorkbench(tenantId, novelId, chapterId);
    if (!record) {
      throw new BusinessError(ErrorCode.NotFound, '章节不存在');
    }

    return toChapterWorkbenchDTO(record, novel);
  }

  async generateBodyBatch(
    novelId: string,
    request: GenerateBodyBatchRequest,
    context: RequestContext,
    action: 'body_batch_generate' | 'chapter_body_generate' = 'body_batch_generate'
  ): Promise<BodyBatchActionResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    this.ensureLifecycleActive(novel);
    const idempotencyKey = request.idempotencyKey?.trim() || createInternalBodyIdempotencyKey(action, novelId, context.requestId);
    const strategySnapshot = await this.ensureBodyBatchGate(novel, request, context);
    const sourceVersionRefs = createBodySourceRefs(novel, strategySnapshot);
    const existingBatch = await this.options.repository.findBodyBatchByIdempotencyKey(context.tenantId, novelId, idempotencyKey);
    if (existingBatch) {
      return this.returnExistingBodyBatch({ novel, request, context, strategySnapshot, sourceVersionRefs, existingBatch, idempotencyKey });
    }
    const chapters = await this.options.repository.listNovelChapters(context.tenantId, novelId);
    const range = calculateBodyBatchRange(chapters, request);
    if (!range.startChapterNo || !range.endChapterNo) {
      throw new BusinessError(ErrorCode.GateBlocked, '所有计划章节已生成，任务包 6 只能提示待全书审稿，不能自动进入全书审稿。');
    }
    const requestFingerprint = createBodyBatchRequestFingerprint(request, strategySnapshot, sourceVersionRefs, {
      startChapterNo: range.startChapterNo,
      endChapterNo: range.endChapterNo
    });

    const latestBatch = await this.options.repository.findLatestBodyBatch(context.tenantId, novelId);
    const previousMemory = await this.options.repository.findLatestLongTermMemory(context.tenantId, novelId, null);
    const targetChapters = chapters.filter((chapter) => chapter.chapterNo >= range.startChapterNo! && chapter.chapterNo <= range.endChapterNo!);
    const previousBatchNotes = latestBatch?.summary.nextBatchNotes ?? [];
    const enhancedReview = isEnhancedReviewEnabled(strategySnapshot) && range.startChapterNo <= 10;
    const objectId = action === 'chapter_body_generate' ? targetChapters[0]?.id ?? novelId : novelId;
    const initialPreviousContent = await findPreviousContentVersion(
      this.options.repository,
      context.tenantId,
      novelId,
      chapters,
      range.startChapterNo
    );
    const providerInput = {
      action,
      novel: projectNovelProviderInput(novel),
      targetChapters: targetChapters.map(projectChapterProviderInput),
      strategySnapshot: projectBodyStrategyProviderInput(strategySnapshot),
      previousContent: initialPreviousContent ? projectChapterContentProviderInput(initialPreviousContent) : null,
      previousMemory: projectLongTermMemoryProviderInput(previousMemory),
      previousBatchNotes,
      enhancedReview
    };
    const execution = await executeClaimedGeneration({
      action,
      repository: this.options.repository,
      novel,
      objectId,
      idempotencyKey,
      effectiveRequest: requestFingerprint,
      sourceVersionRefs,
      context,
      now: this.now,
      providerCapability: this.bodyProvider,
      prepare: (task) => this.options.repository.createBodyBatchTask({
        novel,
        task,
        strategySnapshot,
        idempotencyKey,
        requestFingerprint,
        startChapterNo: range.startChapterNo!,
        endChapterNo: range.endChapterNo!,
        sourceVersionRefs,
        context,
        now: this.now()
      }).then(() => undefined),
      provider: async (authoritativeInput) => {
        const authoritative = authoritativeInput as typeof providerInput;
        const drafts: BodyChapterDraft[] = [];
        let previousContent = authoritative.previousContent;
        for (const providerChapter of authoritative.targetChapters) {
          const chapter = targetChapters.find((item) => item.id === providerChapter.id);
          if (!chapter) throw new BusinessError(ErrorCode.VersionConflict, '章节权威投影已变化，请刷新后重试。');
          const providerDraft = await executeNovelProviderAction(this.getProviderSet(), {
            action,
            novel: authoritative.novel,
            chapter: providerChapter,
            strategySnapshot: authoritative.strategySnapshot,
            previousContent,
            previousMemory: authoritative.previousMemory,
            previousBatchNotes: authoritative.previousBatchNotes,
            enhancedReview: authoritative.enhancedReview && chapter.chapterNo <= 10
          });
          const draft = bindGeneratedBodyChapter(chapter, providerDraft);
          drafts.push(draft);
          if (draft.hardFailed) break;
          previousContent = projectChapterContentProviderInput(createDraftLikeContentVersion(chapter, draft));
        }
        return drafts;
      },
      finalize: (task, drafts) => this.options.repository.generateBodyBatch({
        novel,
        strategySnapshot,
        task,
        chapters: drafts,
        idempotencyKey,
        requestFingerprint,
        startChapterNo: range.startChapterNo!,
        endChapterNo: range.endChapterNo!,
        sourceVersionRefs,
        previousBatchSummary: latestBatch?.summary ?? null,
        context,
        now: this.now()
      })
    });
    if (execution.reused) {
      const existingBatch = await this.options.repository.findBodyBatchByIdempotencyKey(context.tenantId, novelId, idempotencyKey);
      if (existingBatch) {
        return this.returnExistingBodyBatch({ novel, request, context, strategySnapshot, sourceVersionRefs, existingBatch, idempotencyKey });
      }
      return this.returnReservedBodyBatchTask({
        novel,
        context,
        strategySnapshot,
        task: execution.task
      });
    }
    const result = execution.value;

    const statusSummary = this.statusService.calculate(result.novel);
    const bodyGeneration = await this.getBodyGenerationState(result.novel, result.chapters, strategySnapshot);

    return {
      novelId,
      statusSummary,
      task: toDirectionTaskDTO(result.task),
      batch: toBodyBatchDTO(result.batch),
      bodyGeneration,
      chapters: result.chapters.map(toNovelChapterDTO),
      affectedObjects: ['chapters', 'review_reports', 'long_term_memory', 'body_batch_summary'],
      nextAction: bodyGeneration.recommendedAction
    };
  }

  private async returnReservedBodyBatchTask(input: {
    novel: NovelRecord;
    context: RequestContext;
    strategySnapshot: CreativeVersionRecord;
    task: GenerationTaskRecord;
  }): Promise<BodyBatchActionResultDTO> {
    const chapters = await this.options.repository.listNovelChapters(input.context.tenantId, input.novel.id);
    const statusSummary = this.statusService.calculate(input.novel);
    const bodyGeneration = await this.getBodyGenerationState(input.novel, chapters, input.strategySnapshot);

    return {
      novelId: input.novel.id,
      statusSummary,
      task: toDirectionTaskDTO(input.task),
      batch: null,
      bodyGeneration,
      chapters: chapters.map(toNovelChapterDTO),
      affectedObjects: ['body_batch_task'],
      nextAction: bodyGeneration.recommendedAction
    };
  }

  async generateChapterBody(novelId: string, chapterId: string, request: GenerateChapterBodyRequest, context: RequestContext): Promise<BodyBatchActionResultDTO> {
    const chapter = await this.options.repository.findChapterById(context.tenantId, novelId, chapterId);
    if (!chapter) {
      throw new BusinessError(ErrorCode.NotFound, '章节不存在');
    }

    return this.generateBodyBatch(
      novelId,
      {
        strategySnapshotId: request.strategySnapshotId,
        expectedStrategySnapshotVersion: request.expectedStrategySnapshotVersion,
        startChapterNo: chapter.chapterNo,
        endChapterNo: chapter.chapterNo,
        idempotencyKey: request.idempotencyKey ?? null
      },
      context,
      'chapter_body_generate'
    );
  }

  private async returnExistingBodyBatch(input: {
    novel: NovelRecord;
    request: GenerateBodyBatchRequest;
    context: RequestContext;
    strategySnapshot: CreativeVersionRecord;
    sourceVersionRefs: Record<string, unknown>;
    existingBatch: BodyBatchRecord;
    idempotencyKey: string;
  }): Promise<BodyBatchActionResultDTO> {
    const expectedFingerprint = createBodyBatchRequestFingerprint(input.request, input.strategySnapshot, input.sourceVersionRefs, {
      startChapterNo: input.existingBatch.startChapterNo,
      endChapterNo: input.existingBatch.endChapterNo
    });
    if (!isSameBodyRequestFingerprint(input.existingBatch.requestFingerprint, expectedFingerprint)) {
      throw new BusinessError(ErrorCode.IdempotencyConflict, '同一个幂等键已绑定到不同的批量正文请求，请刷新后重新提交。', {
        taskType: 'body_batch_generate',
        existingBatchId: input.existingBatch.id,
        existingTaskId: input.existingBatch.taskId
      });
    }

    const task = await this.options.repository.findTaskById(input.context.tenantId, input.existingBatch.taskId);
    if (!task) {
      throw new BusinessError(ErrorCode.InternalError, '幂等批次缺少原始任务记录，请联系管理员处理。', {
        batchId: input.existingBatch.id,
        taskId: input.existingBatch.taskId
      });
    }

    const chapters = await this.options.repository.listNovelChapters(input.context.tenantId, input.novel.id);
    const statusSummary = this.statusService.calculate(input.novel);
    const bodyGeneration = await this.getBodyGenerationState(input.novel, chapters, input.strategySnapshot);

    return {
      novelId: input.novel.id,
      statusSummary,
      task: toDirectionTaskDTO(task),
      batch: toBodyBatchDTO(input.existingBatch),
      bodyGeneration,
      chapters: chapters.map(toNovelChapterDTO),
      affectedObjects: [],
      nextAction: bodyGeneration.recommendedAction
    };
  }

  async rewriteChapter(novelId: string, chapterId: string, request: RewriteChapterRequest, context: RequestContext): Promise<ChapterRewriteResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    this.ensureLifecycleActive(novel);
    const chapter = await this.options.repository.findChapterById(context.tenantId, novelId, chapterId);
    if (!chapter) {
      throw new BusinessError(ErrorCode.NotFound, '章节不存在');
    }
    if (!chapter.currentContentVersionId) {
      throw new BusinessError(ErrorCode.GateBlocked, '当前章节没有正式正文，不能生成重写候选');
    }
    const existingTask = request.idempotencyKey?.trim()
      ? await this.options.repository.findTaskByIdempotencyToken(
          context.tenantId,
          'chapter_body_rewrite',
          createActorScopedIdempotencyToken({
            tenantId: context.tenantId, userId: context.userId, action: 'chapter_rewrite',
            objectId: chapter.id, rawIdempotencyKey: request.idempotencyKey.trim()
          })
        )
      : null;
    if (!existingTask && request.currentContentVersionId !== undefined && request.currentContentVersionId !== chapter.currentContentVersionId) {
      throw new BusinessError(ErrorCode.VersionConflict, '当前章节正文版本已变化，请刷新后重试');
    }
    const existingSourceRefs = toRecord(existingTask?.sourceVersionRefs);
    const existingContentVersionId = typeof existingSourceRefs.currentContentVersionId === 'string'
      ? existingSourceRefs.currentContentVersionId
      : chapter.currentContentVersionId;
    const fingerprintContentVersionId = request.currentContentVersionId !== undefined
      ? request.currentContentVersionId
      : existingContentVersionId;
    const sourceContentVersionId = typeof fingerprintContentVersionId === 'string'
      ? fingerprintContentVersionId
      : existingContentVersionId;
    const currentContent = await this.options.repository.findChapterContentVersionById(context.tenantId, novelId, sourceContentVersionId);
    if (!currentContent) {
      throw new BusinessError(ErrorCode.NotFound, '当前章节正文不存在');
    }
    const sourceVersionRefs = { currentContentVersionId: fingerprintContentVersionId };
    const providerInput = {
      action: 'chapter_rewrite' as const,
      novel: projectNovelProviderInput(novel),
      chapter: projectChapterProviderInput(chapter),
      currentContent: projectChapterContentProviderInput(currentContent),
      instruction: request.instruction?.trim() || '基于审稿建议优化本章'
    };
    const execution = await executeClaimedGeneration({
      action: 'chapter_rewrite',
      repository: this.options.repository,
      novel,
      objectId: chapter.id,
      idempotencyKey: request.idempotencyKey,
      effectiveRequest: {
        currentContentVersionId: fingerprintContentVersionId,
        instruction: request.instruction?.trim() || null,
        reason: request.reason?.trim() || null
      },
      sourceVersionRefs,
      context,
      now: this.now,
      providerCapability: this.bodyProvider,
      provider: (authoritativeInput) => executeNovelProviderAction(this.getProviderSet(), authoritativeInput as typeof providerInput)
        .then((rewrite) => ({ ...rewrite, candidate: bindGeneratedBodyChapter(chapter, rewrite.candidate) })),
      finalize: (task, rewrite) => this.options.repository.rewriteChapter({
        novel,
        task,
        chapter,
        currentContent,
        candidate: rewrite.candidate,
        instruction: request.instruction?.trim() || '',
        reason: request.reason?.trim() || '生成章节重写候选',
        summaryCompare: rewrite.summaryCompare,
        context,
        now: this.now()
      })
    });
    if (execution.reused) {
      const candidateId = execution.task.resultObjectId ?? execution.task.resultVersionIds[0];
      const candidate = candidateId
        ? await this.options.repository.findChapterContentVersionById(context.tenantId, novelId, candidateId)
        : null;
      if (!candidate) throw reusedTaskInProgress(execution.task);
      const summaryCompare = toSummaryCompare(toRecord(candidate.metadata).summaryCompare, currentContent, candidate);
      const statusSummary = this.statusService.calculate(novel);
      return {
        novelId,
        statusSummary,
        task: toDirectionTaskDTO(execution.task),
        chapter: toNovelChapterDTO(chapter),
        currentContent: toTrialChapterCandidateDTO(currentContent, chapter),
        candidate: toTrialChapterCandidateDTO(candidate, chapter),
        summaryCompare,
        affectedObjects: [],
        nextAction: createLocalRecommendedAction({
          type: 'adopt_chapter_candidate',
          label: '采用候选版本',
          reasonText: '重写候选已生成，采用前请查看摘要对比和影响提示。',
          taskType: 'chapter_impact_assess'
        })
      };
    }
    const result = execution.value;
    const statusSummary = this.statusService.calculate(result.novel);

    return {
      novelId,
      statusSummary,
      task: toDirectionTaskDTO(result.task),
      chapter: toNovelChapterDTO(result.chapter),
      currentContent: toTrialChapterCandidateDTO(result.currentContent, result.chapter),
      candidate: toTrialChapterCandidateDTO(result.candidate, result.chapter),
      summaryCompare: result.summaryCompare,
      affectedObjects: ['chapter_candidate_version'],
      nextAction: createLocalRecommendedAction({
        type: 'adopt_chapter_candidate',
        label: '采用候选版本',
        reasonText: '重写候选已生成，采用前请查看摘要对比和影响提示。',
        taskType: 'chapter_impact_assess'
      })
    };
  }

  async adoptChapterContentVersion(
    novelId: string,
    chapterId: string,
    versionId: string,
    request: AdoptChapterContentVersionRequest,
    context: RequestContext
  ): Promise<ChapterContentAdoptionResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    this.ensureLifecycleActive(novel);
    const chapter = await this.options.repository.findChapterById(context.tenantId, novelId, chapterId);
    if (!chapter) {
      throw new BusinessError(ErrorCode.NotFound, '章节不存在');
    }
    const existingTask = request.idempotencyKey?.trim()
      ? await this.options.repository.findTaskByIdempotencyToken(
          context.tenantId,
          'chapter_impact_assess',
          createActorScopedIdempotencyToken({
            tenantId: context.tenantId, userId: context.userId, action: 'chapter_adopt_impact_assess',
            objectId: chapter.id, rawIdempotencyKey: request.idempotencyKey.trim()
          })
        )
      : null;
    if (!existingTask && request.currentContentVersionId !== undefined && request.currentContentVersionId !== chapter.currentContentVersionId) {
      throw new BusinessError(ErrorCode.VersionConflict, '当前章节正文版本已变化，请刷新后重试');
    }
    const candidate = await this.options.repository.findChapterContentVersionById(context.tenantId, novelId, versionId);
    if (!candidate || candidate.chapterId !== chapterId) {
      throw new BusinessError(ErrorCode.NotFound, '章节候选正文不存在');
    }
    if (!existingTask && candidate.status !== VersionStatus.Candidate) {
      throw new BusinessError(ErrorCode.VersionConflict, '该章节正文版本当前不可采用');
    }
    const existingSourceRefs = toRecord(existingTask?.sourceVersionRefs);
    const existingContentVersionId = typeof existingSourceRefs.currentContentVersionId === 'string'
      ? existingSourceRefs.currentContentVersionId
      : chapter.currentContentVersionId;
    const fingerprintContentVersionId = request.currentContentVersionId !== undefined
      ? request.currentContentVersionId
      : existingContentVersionId;
    const sourceContentVersionId = typeof fingerprintContentVersionId === 'string'
      ? fingerprintContentVersionId
      : existingContentVersionId;
    const currentContent = sourceContentVersionId
      ? await this.options.repository.findChapterContentVersionById(context.tenantId, novelId, sourceContentVersionId)
      : null;
    const candidateMetadata = toRecord(candidate.metadata);
    const summaryCompare = toSummaryCompare(candidateMetadata.summaryCompare, currentContent, candidate);
    const reason = request.reason?.trim() ?? '';
    const providerInput = {
      action: 'chapter_adopt_impact_assess' as const,
      novel: projectNovelProviderInput(novel),
      chapter: projectChapterProviderInput(chapter),
      oldContent: currentContent ? projectChapterContentProviderInput(currentContent) : null,
      newContent: projectChapterContentProviderInput(candidate),
      instruction: candidate.rewriteReason
    };
    const execution = await executeClaimedGeneration({
      action: 'chapter_adopt_impact_assess',
      repository: this.options.repository,
      novel,
      objectId: chapter.id,
      idempotencyKey: request.idempotencyKey,
      effectiveRequest: { candidateVersionId: candidate.id, currentContentVersionId: fingerprintContentVersionId, reason: reason || null },
      sourceVersionRefs: { currentContentVersionId: fingerprintContentVersionId, candidateVersionId: candidate.id },
      context,
      now: this.now,
      providerCapability: this.bodyProvider,
      provider: (authoritativeInput) => executeNovelProviderAction(this.getProviderSet(), authoritativeInput as typeof providerInput),
      finalize: (task, impact) => {
        if ((impact.impactLevel === 'medium' || impact.impactLevel === 'severe') && !reason) {
          throw new BusinessError(ErrorCode.GateBlocked, '采用可能影响后续章节的候选必须填写原因');
        }
        return this.options.repository.adoptChapterContent({
          novel,
          task,
          chapter,
          currentContent,
          candidate,
          reason: reason || '采用章节候选正文',
          summaryCompare,
          impact,
          pageVersionSnapshot: request.pageVersionSnapshot,
          context,
          now: this.now()
        });
      }
    });
    if (execution.reused) {
      const impactCase = execution.task.resultObjectId
        ? await this.options.repository.findImpactCaseById(context.tenantId, novelId, execution.task.resultObjectId)
        : null;
      const adoptedContentId = execution.task.resultVersionIds[0] ?? candidate.id;
      const adoptedContent = await this.options.repository.findChapterContentVersionById(context.tenantId, novelId, adoptedContentId);
      const updatedChapter = await this.options.repository.findChapterById(context.tenantId, novelId, chapterId);
      if (!impactCase || !adoptedContent || !updatedChapter) throw reusedTaskInProgress(execution.task);
      const statusSummary = this.statusService.calculate(novel);
      return {
        novelId,
        statusSummary,
        task: toDirectionTaskDTO(execution.task),
        chapter: toNovelChapterDTO(updatedChapter),
        previousContentVersionId: typeof existingSourceRefs.currentContentVersionId === 'string'
          ? existingSourceRefs.currentContentVersionId
          : null,
        currentContent: toTrialChapterCandidateDTO(adoptedContent, updatedChapter),
        impactCase: toImpactCaseDTO(impactCase),
        affectedObjects: [],
        nextAction: createLocalRecommendedAction({
          type: impactCase.status === 'waiting_decision' ? 'resolve_impact_case' : 'continue_body_batch',
          label: impactCase.status === 'waiting_decision' ? '处理影响案例' : '继续批量正文',
          reasonText: impactCase.summary ?? '候选已采用，影响评估已记录。',
          taskType: impactCase.status === 'waiting_decision' ? 'chapter_impact_assess' : 'body_batch_generate'
        })
      };
    }
    const result = execution.value;
    const statusSummary = this.statusService.calculate(result.novel);

    return {
      novelId,
      statusSummary,
      task: toDirectionTaskDTO(result.task),
      chapter: toNovelChapterDTO(result.chapter),
      previousContentVersionId: result.previousContentVersionId,
      currentContent: toTrialChapterCandidateDTO(result.currentContent, result.chapter),
      impactCase: toImpactCaseDTO(result.impactCase),
      affectedObjects: ['chapter_current_content', 'impact_case', 'review_report', 'long_term_memory'],
      nextAction: createLocalRecommendedAction({
        type: result.impactCase.status === 'waiting_decision' ? 'resolve_impact_case' : 'continue_body_batch',
        label: result.impactCase.status === 'waiting_decision' ? '处理影响案例' : '继续批量正文',
        reasonText: result.impactCase.summary ?? '候选已采用，影响评估已记录。',
        taskType: result.impactCase.status === 'waiting_decision' ? 'chapter_impact_assess' : 'body_batch_generate'
      })
    };
  }

  async createImpactAssessment(
    novelId: string,
    chapterId: string,
    request: CreateImpactAssessmentRequest,
    context: RequestContext
  ): Promise<ImpactAssessmentActionResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    const chapter = await this.options.repository.findChapterById(context.tenantId, novelId, chapterId);
    if (!chapter || !chapter.currentContentVersionId) {
      throw new BusinessError(ErrorCode.GateBlocked, '当前章节没有正式正文，不能发起影响评估');
    }
    const existingTask = request.idempotencyKey?.trim()
      ? await this.options.repository.findTaskByIdempotencyToken(
          context.tenantId,
          'chapter_impact_assess',
          createActorScopedIdempotencyToken({
            tenantId: context.tenantId, userId: context.userId, action: 'chapter_impact_assess',
            objectId: chapter.id, rawIdempotencyKey: request.idempotencyKey.trim()
          })
        )
      : null;
    if (!existingTask && request.currentContentVersionId !== undefined && request.currentContentVersionId !== chapter.currentContentVersionId) {
      throw new BusinessError(ErrorCode.VersionConflict, '当前章节正文版本已变化，请刷新后重试');
    }
    const existingSourceRefs = toRecord(existingTask?.sourceVersionRefs);
    const existingContentVersionId = typeof existingSourceRefs.currentContentVersionId === 'string'
      ? existingSourceRefs.currentContentVersionId
      : chapter.currentContentVersionId;
    const fingerprintContentVersionId = request.currentContentVersionId !== undefined
      ? request.currentContentVersionId
      : existingContentVersionId;
    const sourceContentVersionId = typeof fingerprintContentVersionId === 'string'
      ? fingerprintContentVersionId
      : existingContentVersionId;
    const currentContent = await this.options.repository.findChapterContentVersionById(context.tenantId, novelId, sourceContentVersionId);
    if (!currentContent) {
      throw new BusinessError(ErrorCode.NotFound, '当前章节正文不存在');
    }
    const providerInput = {
      action: 'chapter_impact_assess' as const,
      novel: projectNovelProviderInput(novel),
      chapter: projectChapterProviderInput(chapter),
      oldContent: projectChapterContentProviderInput(currentContent),
      newContent: projectChapterContentProviderInput(currentContent),
      instruction: request.reason
    };
    const execution = await executeClaimedGeneration({
      action: 'chapter_impact_assess',
      repository: this.options.repository,
      novel,
      objectId: chapter.id,
      idempotencyKey: request.idempotencyKey,
      effectiveRequest: { currentContentVersionId: fingerprintContentVersionId, reason: request.reason?.trim() || null },
      sourceVersionRefs: { currentContentVersionId: fingerprintContentVersionId },
      context,
      now: this.now,
      providerCapability: this.bodyProvider,
      provider: (authoritativeInput) => executeNovelProviderAction(this.getProviderSet(), authoritativeInput as typeof providerInput),
      finalize: (task, impact) => this.options.repository.createImpactAssessment({
        novel,
        task,
        chapter,
        currentContent,
        impact,
        reason: request.reason?.trim() || '手动发起章节影响评估',
        context,
        now: this.now()
      })
    });
    if (execution.reused) {
      const impactCase = execution.task.resultObjectId
        ? await this.options.repository.findImpactCaseById(context.tenantId, novelId, execution.task.resultObjectId)
        : null;
      if (!impactCase) throw reusedTaskInProgress(execution.task);
      const statusSummary = this.statusService.calculate(novel);
      return {
        novelId,
        statusSummary,
        task: toDirectionTaskDTO(execution.task),
        impactCase: toImpactCaseDTO(impactCase),
        nextAction: statusSummary.recommendedAction
      };
    }
    const result = execution.value;
    const statusSummary = this.statusService.calculate(result.novel);

    return {
      novelId,
      statusSummary,
      task: toDirectionTaskDTO(result.task),
      impactCase: toImpactCaseDTO(result.impactCase),
      nextAction: statusSummary.recommendedAction
    };
  }

  async getImpactCase(novelId: string, impactCaseId: string, tenantId = DEFAULT_TENANT_ID): Promise<ImpactCaseDTO> {
    const impactCase = await this.options.repository.findImpactCaseById(tenantId, novelId, impactCaseId);
    if (!impactCase) {
      throw new BusinessError(ErrorCode.NotFound, '影响案例不存在');
    }

    return toImpactCaseDTO(impactCase);
  }

  async resolveImpactCase(novelId: string, impactCaseId: string, request: ResolveImpactCaseRequest, context: RequestContext): Promise<ImpactCaseResolveResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    const impactCase = await this.options.repository.findImpactCaseById(context.tenantId, novelId, impactCaseId);
    if (!impactCase) {
      throw new BusinessError(ErrorCode.NotFound, '影响案例不存在');
    }
    const reason = request.reason?.trim() ?? '';
    if ((request.resolution === 'ignored' || impactCase.impactLevel === 'severe') && !reason) {
      throw new BusinessError(ErrorCode.GateBlocked, '关闭或忽略中高影响案例必须填写原因');
    }
    const result = await this.options.repository.resolveImpactCase({
      novel,
      impactCase,
      resolution: request.resolution,
      reason: reason || '影响案例已处理',
      context,
      now: this.now()
    });
    const statusSummary = this.statusService.calculate(result.novel);

    return {
      novelId,
      statusSummary,
      impactCase: toImpactCaseDTO(result.impactCase),
      nextAction: statusSummary.recommendedAction
    };
  }

  async startFullReview(novelId: string, request: StartFullReviewRequest, context: RequestContext): Promise<FullReviewActionResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    this.ensureLifecycleActive(novel);
    const idempotencyKey = request.idempotencyKey?.trim() || createInternalBodyIdempotencyKey('full-review', novelId, context.requestId);
    const idempotencyToken = createActorScopedIdempotencyToken({
      tenantId: context.tenantId,
      userId: context.userId,
      action: 'novel_full_review',
      objectId: novel.id,
      rawIdempotencyKey: idempotencyKey
    });
    const currentChapters = await this.options.repository.listNovelChapters(context.tenantId, novel.id);
    const currentSourceVersionRefs = createFullReviewSourceRefs(novel, currentChapters);
    const requestFingerprint = {
      taskType: 'novel_full_review',
      reviewPolicyVersionId: request.reviewPolicyVersionId?.trim() || novel.policyProfileVersionId || DEFAULT_POLICY_PROFILE_VERSION_ID,
      expectedNovelVersion: request.expectedNovelVersion ?? null,
      sourceVersionRefs: currentSourceVersionRefs
    };
    const existing = await this.options.repository.findFullReviewByIdempotencyKey(context.tenantId, novelId, idempotencyToken);
    if (existing) {
      const existingFingerprint = toRecord(existing.reviewReport.metadata).requestFingerprint;
      if (existingFingerprint && !isSameFingerprint(existingFingerprint, requestFingerprint)) {
        throw new BusinessError(ErrorCode.IdempotencyConflict, '同一个幂等键已绑定到不同的全书审稿请求，请刷新后重新提交。', {
          taskType: 'novel_full_review',
          existingTaskId: existing.task.id,
          existingReviewReportId: existing.reviewReport.id
        });
      }
      const statusSummary = this.statusService.calculate(novel);
      return {
        novelId,
        statusSummary,
        task: toDirectionTaskDTO(existing.task),
        fullReview: toFullReviewReportDTO(existing.reviewReport, existing.gate),
        affectedObjects: [],
        nextAction: statusSummary.recommendedAction
      };
    }
    if (request.expectedNovelVersion && request.expectedNovelVersion !== novel.updatedAt.toISOString()) {
      throw new BusinessError(ErrorCode.VersionConflict, '小说版本已变化，请刷新后重新发起全书审稿');
    }

    const chapters = await this.ensureFullReviewGate(novel, context);
    const sourceVersionRefs = createFullReviewSourceRefs(novel, chapters);
    const providerInput = {
      action: 'novel_full_review' as const,
      novel: projectNovelProviderInput(novel),
      chapters: chapters.map(projectChapterProviderInput),
      sourceVersionRefs: projectFullReviewSourceVersionRefsProviderInput(sourceVersionRefs)
    };
    const execution = await executeClaimedGeneration({
      action: 'novel_full_review',
      repository: this.options.repository,
      novel,
      idempotencyKey,
      effectiveRequest: requestFingerprint,
      sourceVersionRefs,
      context,
      now: this.now,
      providerCapability: this.fullReviewProvider,
      provider: (authoritativeInput) => executeNovelProviderAction(this.getProviderSet(), authoritativeInput as typeof providerInput),
      finalize: (task, draft) => this.options.repository.createFullReview({
        novel,
        task,
        chapters,
        draft: {
          ...draft,
          reviewPolicyVersionId: requestFingerprint.reviewPolicyVersionId
        },
        idempotencyKey,
        requestFingerprint,
        sourceVersionRefs,
        context,
        now: this.now()
      })
    });
    if (execution.reused) {
      const existing = await this.options.repository.findFullReviewByIdempotencyKey(context.tenantId, novelId, idempotencyToken);
      if (!existing) throw reusedTaskInProgress(execution.task);
      const statusSummary = this.statusService.calculate(novel);
      return {
        novelId,
        statusSummary,
        task: toDirectionTaskDTO(existing.task),
        fullReview: toFullReviewReportDTO(existing.reviewReport, existing.gate),
        affectedObjects: [],
        nextAction: statusSummary.recommendedAction
      };
    }
    const result = execution.value;
    const statusSummary = this.statusService.calculate(result.novel);

    return {
      novelId,
      statusSummary,
      task: toDirectionTaskDTO(result.task),
      fullReview: toFullReviewReportDTO(result.reviewReport, result.gate),
      affectedObjects: ['review_report', 'full_review_gate'],
      nextAction: statusSummary.recommendedAction
    };
  }

  async getLatestFullReview(novelId: string, tenantId = DEFAULT_TENANT_ID): Promise<FullReviewLatestResultDTO> {
    const novel = await this.findNovelOrThrow(tenantId, novelId);
    const latest = await this.options.repository.findLatestFullReview(tenantId, novelId);
    const statusSummary = this.statusService.calculate(novel);

    return {
      novelId,
      fullReview: latest ? toFullReviewReportDTO(latest.reviewReport, latest.gate) : null,
      statusSummary,
      nextAction: statusSummary.recommendedAction
    };
  }

  async resolveFullReviewIssue(
    novelId: string,
    reviewId: string,
    request: ResolveFullReviewIssueRequest,
    context: RequestContext
  ): Promise<FullReviewIssueActionResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    const latest = await this.findFullReviewOrThrow(context.tenantId, novelId, reviewId);
    const reason = request.reason?.trim() ?? '';
    if (request.action === 'accept_risk' && !reason) {
      throw new BusinessError(ErrorCode.ValidationError, '接受全书审稿风险必须填写原因');
    }
    const result = await this.options.repository.resolveFullReviewIssue({
      novel,
      reviewReport: latest.reviewReport,
      gate: latest.gate,
      issueId: request.issueId,
      action: request.action,
      reason: reason || '问题已处理',
      context,
      now: this.now()
    });
    const fullReview = toFullReviewReportDTO(result.reviewReport, result.gate);
    const issue = fullReview.issues.find((item) => item.issueId === request.issueId);
    if (!issue) {
      throw new BusinessError(ErrorCode.NotFound, '全书审稿问题不存在');
    }
    const statusSummary = this.statusService.calculate(result.novel);

    return {
      novelId,
      statusSummary,
      fullReview,
      issue,
      nextAction: statusSummary.recommendedAction
    };
  }

  async forcePassFullReview(
    novelId: string,
    reviewId: string,
    request: ForcePassFullReviewRequest,
    context: RequestContext
  ): Promise<FullReviewActionResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    const idempotencyKey = normalizeActionIdempotencyKey(request.idempotencyKey, '全书审稿强制通过');
    const reason = request.reason?.trim() ?? '';
    if (!request.confirmRisk || !reason) {
      throw new BusinessError(ErrorCode.ValidationError, '低分全书审稿强制通过必须二次确认并填写原因');
    }
    const latest = await this.findFullReviewOrThrow(context.tenantId, novelId, reviewId);
    if (latest.gate.id !== request.fullReviewGateId) {
      throw new BusinessError(ErrorCode.VersionConflict, '全书审稿门禁版本不匹配，请刷新后重试');
    }
    if (latest.gate.isStale) {
      throw new BusinessError(ErrorCode.CandidateStale, '全书审稿已过期，不能强制通过');
    }
    if (!latest.gate.forcePassAllowed || (latest.reviewReport.totalScore ?? 0) < 60) {
      throw new BusinessError(ErrorCode.GateBlocked, '当前全书审稿不能强制通过，需先处理数据或安全阻塞');
    }
    const result = await this.options.repository.forcePassFullReview({
      novel,
      reviewReport: latest.reviewReport,
      gate: latest.gate,
      reason,
      idempotencyKey,
      context,
      now: this.now()
    });
    const statusSummary = this.statusService.calculate(result.novel);
    const task = result.reviewReport.sourceTaskId ? await this.options.repository.findTaskById(context.tenantId, result.reviewReport.sourceTaskId) : null;

    return {
      novelId,
      statusSummary,
      task: task ? toDirectionTaskDTO(task) : createVirtualDirectionTaskDTO('novel_full_review', '全书审稿已强制通过'),
      fullReview: toFullReviewReportDTO(result.reviewReport, result.gate),
      affectedObjects: ['full_review_gate', 'asset_decision_record', 'operation_log'],
      nextAction: statusSummary.recommendedAction
    };
  }

  async confirmCompletion(novelId: string, request: ConfirmCompletionRequest, context: RequestContext): Promise<CompletionActionResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    this.ensureLifecycleActive(novel);
    const idempotencyKey = normalizeActionIdempotencyKey(request.idempotencyKey, '完成确认');
    if (request.expectedNovelVersion && request.expectedNovelVersion !== novel.updatedAt.toISOString()) {
      throw new BusinessError(ErrorCode.VersionConflict, '小说版本已变化，请刷新后重新确认完成');
    }
    const latest = await this.findFullReviewOrThrow(context.tenantId, novelId, request.reviewReportId);
    if (latest.gate.id !== request.fullReviewGateId) {
      throw new BusinessError(ErrorCode.VersionConflict, '全书审稿门禁版本不匹配，请刷新后重试');
    }
    const sourceVersionRefs = createFullReviewSourceRefs(novel, await this.options.repository.listNovelChapters(context.tenantId, novelId));
    ensureFullReviewSourceRefsFresh(latest.gate, sourceVersionRefs);
    if (latest.gate.isStale) {
      throw new BusinessError(ErrorCode.CandidateStale, '全书审稿已过期，不能确认完成');
    }
    if (!latest.gate.allowCompletion) {
      throw new BusinessError(ErrorCode.GateBlocked, '全书审稿未通过完成门禁，不能确认完成');
    }
    if ((latest.gate.gateResult === 'warning' || latest.gate.gateResult === 'forced_pass') && !((request.reason ?? '').trim() || request.confirmRisk)) {
      throw new BusinessError(ErrorCode.GateBlocked, '风险通过或强制通过需要确认原因');
    }
    const chapters = await this.ensureCompletionGate(novel, context);
    const existing = await this.options.repository.findCompletionDecisionByIdempotencyKey(context.tenantId, novelId, idempotencyKey);
    if (existing) {
      const check = await this.options.repository.findLatestVideoReadinessCheck(context.tenantId, novelId);
      const snapshot = await this.options.repository.findLatestVideoReadinessSnapshot(context.tenantId, novelId);
      const statusSummary = this.statusService.calculate(novel);

      return {
        novelId,
        statusSummary,
        completionDecision: toCompletionDecisionDTO(existing),
        videoReadiness: toVideoReadinessDTO(novelId, existing, check, snapshot, statusSummary.recommendedAction),
        affectedObjects: [],
        nextAction: statusSummary.recommendedAction
      };
    }

    const result = await this.options.repository.confirmCompletion({
      novel,
      reviewReport: latest.reviewReport,
      gate: latest.gate,
      chapters,
      idempotencyKey,
      reason: request.reason?.trim() || '确认小说完成',
      confirmRisk: request.confirmRisk === true,
      sourceVersionRefs,
      context,
      now: this.now()
    });
    const statusSummary = this.statusService.calculate(result.novel);
    const snapshot = await this.options.repository.findLatestVideoReadinessSnapshot(context.tenantId, novelId);

    return {
      novelId,
      statusSummary,
      completionDecision: toCompletionDecisionDTO(result.completionDecision),
      videoReadiness: toVideoReadinessDTO(novelId, result.completionDecision, result.readinessCheck, snapshot, statusSummary.recommendedAction),
      affectedObjects: ['completion_decision', 'video_readiness_check'],
      nextAction: statusSummary.recommendedAction
    };
  }

  async getVideoReadiness(novelId: string, tenantId = DEFAULT_TENANT_ID): Promise<VideoReadinessDTO> {
    const novel = await this.findNovelOrThrow(tenantId, novelId);
    const completionDecision = await this.options.repository.findLatestCompletionDecision(tenantId, novelId);
    const check = await this.options.repository.findLatestVideoReadinessCheck(tenantId, novelId);
    const snapshot = await this.options.repository.findLatestVideoReadinessSnapshot(tenantId, novelId);
    const statusSummary = this.statusService.calculate(novel);

    return toVideoReadinessDTO(novelId, completionDecision, check, snapshot, statusSummary.recommendedAction);
  }

  async recheckVideoReadiness(novelId: string, _request: RecheckVideoReadinessRequest, context: RequestContext): Promise<VideoReadinessActionResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    const completionDecision = await this.options.repository.findLatestCompletionDecision(context.tenantId, novelId);
    if (!completionDecision) {
      throw new BusinessError(ErrorCode.GateBlocked, '尚未确认小说完成，不能重新检查待视频化');
    }
    const latest = await this.findFullReviewOrThrow(context.tenantId, novelId, completionDecision.reviewReportId);
    const chapters = await this.options.repository.listNovelChapters(context.tenantId, novelId);
    const sourceVersionRefs = createFullReviewSourceRefs(novel, chapters);
    const result = await this.options.repository.createVideoReadinessCheck({
      novel,
      completionDecision,
      reviewReport: latest.reviewReport,
      gate: latest.gate,
      chapters,
      sourceVersionRefs,
      context,
      now: this.now()
    });
    const statusSummary = this.statusService.calculate(result.novel);
    const snapshot = await this.options.repository.findLatestVideoReadinessSnapshot(context.tenantId, novelId);

    return {
      novelId,
      statusSummary,
      task: toDirectionTaskDTO(result.task),
      videoReadiness: toVideoReadinessDTO(novelId, completionDecision, result.check, snapshot, statusSummary.recommendedAction),
      affectedObjects: ['video_readiness_check'],
      nextAction: statusSummary.recommendedAction
    };
  }

  async confirmVideoReadiness(novelId: string, request: ConfirmVideoReadinessRequest, context: RequestContext): Promise<VideoReadinessActionResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    this.ensureLifecycleActive(novel);
    const idempotencyKey = normalizeActionIdempotencyKey(request.idempotencyKey, '待视频化确认');
    const completionDecision = await this.options.repository.findCompletionDecisionById(context.tenantId, novelId, request.completionDecisionId);
    if (!completionDecision) {
      throw new BusinessError(ErrorCode.GateBlocked, '没有完成确认记录，不能进入待视频化');
    }
    const check = await this.options.repository.findVideoReadinessCheckById(context.tenantId, novelId, request.readinessCheckId);
    if (!check) {
      throw new BusinessError(ErrorCode.VersionConflict, '待视频化检查版本已变化，请刷新后重试');
    }
    const latest = await this.findFullReviewOrThrow(context.tenantId, novelId, completionDecision.reviewReportId);
    const chapters = await this.options.repository.listNovelChapters(context.tenantId, novelId);
    const sourceVersionRefs = createFullReviewSourceRefs(novel, chapters);
    const requestFingerprint = createVideoReadinessConfirmRequestFingerprint(request, sourceVersionRefs);
    const existing = await this.options.repository.findVideoReadinessSnapshotByIdempotencyKey(context.tenantId, novelId, idempotencyKey);
    if (existing) {
      const existingFingerprint = toRecord(existing.metadata).requestFingerprint;
      if (!isSameFingerprint(existingFingerprint, requestFingerprint)) {
        throw new BusinessError(ErrorCode.IdempotencyConflict, '同一个幂等键已绑定到不同的待视频化确认请求，请刷新后重新提交。', {
          idempotencyKey,
          existingSnapshotId: existing.id
        });
      }
      const statusSummary = this.statusService.calculate(novel);

      return {
        novelId,
        statusSummary,
        task: null,
        videoReadiness: toVideoReadinessDTO(novelId, completionDecision, check, existing, statusSummary.recommendedAction),
        affectedObjects: [],
        nextAction: statusSummary.recommendedAction
      };
    }
    if (request.expectedNovelVersion && request.expectedNovelVersion !== novel.updatedAt.toISOString()) {
      throw new BusinessError(ErrorCode.VersionConflict, '小说版本已变化，请刷新后重新确认待视频化');
    }
    if (check.version !== request.checkVersion) {
      throw new BusinessError(ErrorCode.VersionConflict, '待视频化检查版本已变化，请刷新后重试');
    }
    if (check.status !== 'candidate' || check.checkItems.some((item) => !item.passed && item.severity === 'blocking')) {
      throw new BusinessError(ErrorCode.GateBlocked, '待视频化检查未通过，不能确认进入待视频化', {
        blockingReasons: check.blockingReasons
      });
    }
    ensureFullReviewSourceRefsFresh(latest.gate, sourceVersionRefs);
    const result = await this.options.repository.confirmVideoReadiness({
      novel,
      completionDecision,
      reviewReport: latest.reviewReport,
      gate: latest.gate,
      check,
      chapters,
      idempotencyKey,
      requestFingerprint,
      reason: request.reason?.trim() || '确认进入待视频化',
      sourceVersionRefs,
      context,
      now: this.now()
    });
    const statusSummary = this.statusService.calculate(result.novel);

    return {
      novelId,
      statusSummary,
      task: null,
      videoReadiness: toVideoReadinessDTO(novelId, completionDecision, check, result.snapshot, statusSummary.recommendedAction),
      affectedObjects: ['video_readiness_snapshot', 'operation_log'],
      nextAction: statusSummary.recommendedAction
    };
  }

  private async ensureFullReviewGate(novel: NovelRecord, context: RequestContext): Promise<NovelChapterRecord[]> {
    if (novel.creationStage !== NovelCreationStage.Body || novel.stageStatus !== StageStatus.Completed) {
      throw new BusinessError(ErrorCode.GateBlocked, '正文生成阶段尚未完成，不能发起正式全书审稿');
    }
    const chapters = await this.options.repository.listNovelChapters(context.tenantId, novel.id);
    if (chapters.length === 0) {
      throw new BusinessError(ErrorCode.GateBlocked, '没有已确认章节目录，不能全书审稿');
    }
    const invalidChapter = chapters.find(
      (chapter) => !chapter.currentContentVersionId || !chapter.currentFeatureCardVersionId || !chapter.currentReviewReportId || chapter.mainStatus !== 'completed'
    );
    if (invalidChapter) {
      throw new BusinessError(ErrorCode.GateBlocked, '仍有章节缺少正式正文、章节特性卡或单章审稿，不能发起全书审稿', {
        chapterId: invalidChapter.id,
        chapterNo: invalidChapter.chapterNo
      });
    }
    const openImpactCases = await this.options.repository.listOpenBlockingImpactCases(context.tenantId, novel.id);
    if (openImpactCases.length > 0) {
      throw new BusinessError(ErrorCode.GateBlocked, '存在中等或严重影响案例未关闭，不能发起全书审稿', {
        impactCaseIds: openImpactCases.map((impactCase) => impactCase.id)
      });
    }

    return chapters;
  }

  private async ensureCompletionGate(novel: NovelRecord, context: RequestContext): Promise<NovelChapterRecord[]> {
    const chapters = await this.ensureFullReviewGate({ ...novel, creationStage: NovelCreationStage.Body, stageStatus: StageStatus.Completed }, context);
    const activeReadinessTask = await this.options.repository.findActiveTaskByConflict(context.tenantId, 'novel_video_readiness', novel.id);
    if (activeReadinessTask) {
      throw new BusinessError(ErrorCode.ConflictTaskExists, '待视频化检查任务正在处理，请先查看任务进度。', {
        activeTaskId: activeReadinessTask.id
      });
    }

    return chapters;
  }

  private async findFullReviewOrThrow(tenantId: string, novelId: string, reviewId: string): Promise<{ reviewReport: ReviewReportRecord; gate: FullReviewGateRecord }> {
    const latest = await this.options.repository.findLatestFullReview(tenantId, novelId);
    if (!latest || latest.reviewReport.id !== reviewId) {
      throw new BusinessError(ErrorCode.NotFound, '全书审稿报告不存在或不是最新报告');
    }

    return latest;
  }

  private async ensureBodyBatchGate(
    novel: NovelRecord,
    request: GenerateBodyBatchRequest,
    context: RequestContext
  ): Promise<CreativeVersionRecord> {
    const snapshot = await this.options.repository.findBodyStrategySnapshot(context.tenantId, novel.id);
    if (!snapshot) {
      throw new BusinessError(ErrorCode.GateBlocked, '没有最新正文生成策略快照，不能批量正文');
    }
    if (novel.creationStage !== NovelCreationStage.Body) {
      throw new BusinessError(ErrorCode.InvalidStage, '当前小说尚未进入正文生成阶段，不能批量生成正文');
    }
    if (snapshot.id !== request.strategySnapshotId) {
      throw new BusinessError(ErrorCode.CandidateStale, '正文策略快照不是当前最新版本，请刷新后基于最新试写结论继续生成');
    }
    if (snapshot.versionNo !== request.expectedStrategySnapshotVersion) {
      throw new BusinessError(ErrorCode.VersionConflict, '正文策略快照版本已变化，请刷新后重试');
    }
    if (snapshot.status !== VersionStatus.Current || snapshot.staleLevel !== StaleLevel.None) {
      throw new BusinessError(ErrorCode.CandidateStale, '正文策略快照已过期或不是当前版本，不能继续批量正文');
    }

    const sourceRefs = toRecord(snapshot.sourceVersionRefs);
    const expectedRefs = createBodySourceRefs(novel, snapshot);
    const sourceKeys = [
      'currentDirectionVersionId',
      'currentSettingVersionId',
      'currentOutlineVersionId',
      'currentStageOutlineVersionId',
      'currentChapterPlanVersionId',
      'trialRunId',
      'selectedChapterOneCandidateId'
    ] as const;
    for (const key of sourceKeys) {
      const expectedValue = expectedRefs[key];
      if (sourceRefs[key] !== expectedValue) {
        throw new BusinessError(ErrorCode.CandidateStale, '上游方向、设定、大纲、章节目录或试写版本已变化，旧策略快照不能继续批量正文', {
          field: key
        });
      }
    }

    const trialRunId = typeof sourceRefs.trialRunId === 'string' ? sourceRefs.trialRunId : null;
    const selectedChapterOneCandidateId = typeof sourceRefs.selectedChapterOneCandidateId === 'string' ? sourceRefs.selectedChapterOneCandidateId : null;
    if (!trialRunId || !selectedChapterOneCandidateId) {
      throw new BusinessError(ErrorCode.GateBlocked, '正文策略快照缺少试写来源，不能批量正文');
    }
    const trialRun = await this.options.repository.findTrialRunById(context.tenantId, novel.id, trialRunId);
    if (!trialRun || trialRun.status !== 'confirmed') {
      throw new BusinessError(ErrorCode.GateBlocked, '试写总评尚未确认，不能批量正文');
    }

    const chapters = await this.options.repository.listNovelChapters(context.tenantId, novel.id);
    const trialResults = await this.options.repository.listTrialChapterResults(context.tenantId, trialRun.id);
    const trialResultByChapterId = new Map(trialResults.map((result) => [result.chapterId, result]));
    const firstThree = chapters.filter((chapter) => chapter.chapterNo >= 1 && chapter.chapterNo <= 3);
    const invalidTrialChapter = firstThree.find((chapter) => {
      const trialResult = trialResultByChapterId.get(chapter.id);

      return !chapter.currentContentVersionId || chapter.mainStatus !== 'completed' || !trialResult?.contentVersionId || trialResult.contentVersionId !== chapter.currentContentVersionId;
    });
    if (invalidTrialChapter) {
      throw new BusinessError(ErrorCode.GateBlocked, '第 1-3 章试写版本尚未正式化为当前正文，不能批量正文', {
        chapterId: invalidTrialChapter.id,
        chapterNo: invalidTrialChapter.chapterNo
      });
    }

    const openImpactCases = await this.options.repository.listOpenBlockingImpactCases(context.tenantId, novel.id);
    if (openImpactCases.length > 0) {
      throw new BusinessError(ErrorCode.GateBlocked, '存在中等或严重影响案例未关闭，不能继续批量正文或进入全书审稿', {
        impactCaseIds: openImpactCases.map((impactCase) => impactCase.id)
      });
    }

    const candidateChapters = await Promise.all(
      chapters.map(async (chapter) => {
        const versions = await this.options.repository.listChapterContentVersions(context.tenantId, novel.id, chapter.id);

        return versions.some((version) => {
          if (version.status !== VersionStatus.Candidate) return false;
          const metadata = toRecord(version.metadata);
          if (typeof metadata.trialRunId === 'string') return false;

          return true;
        }) ? chapter : null;
      })
    );
    const candidateChapter = candidateChapters.find(Boolean);
    if (candidateChapter) {
      throw new BusinessError(ErrorCode.GateBlocked, '存在未确认章节正文候选，请先采用、放弃或处理后再继续批量正文', {
        chapterId: candidateChapter.id,
        chapterNo: candidateChapter.chapterNo
      });
    }

    return snapshot;
  }

  private async getBodyGenerationState(
    novel: NovelRecord,
    chapters?: NovelChapterRecord[],
    strategySnapshot?: CreativeVersionRecord | null
  ): Promise<BodyGenerationStateDTO> {
    return buildBodyGenerationState(this.options.repository, novel, this.statusService, chapters, strategySnapshot);
  }

  private async generateStructureAsset(
    novelId: string,
    objectType: StructureAssetType,
    request: GenerateStructureAssetRequest,
    context: RequestContext
  ): Promise<StructureActionResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    this.ensureLifecycleActive(novel);
    await this.ensureStructureGenerationGate(novel, objectType);

    const preferences = await this.options.repository.findPreferencesByNovelId(context.tenantId, novelId);
    const allStructureVersions = await this.options.repository.listStructureVersions(context.tenantId, novelId);
    const directionVersions = await this.options.repository.listDirectionVersions(context.tenantId, novelId);
    const currentAssets = getCurrentCreativeAssetRecords(novel, directionVersions, allStructureVersions);
    const taskType = getStructureTaskType(objectType);
    const changeReason = request.regenerateReason ?? `模型服务生成 ${objectType} 候选`;
    const sourceVersionRefs = createStructureSourceRefs(novel, objectType);
    const action = getStructureGenerateAction(objectType);
    const providerBaseInput = {
      novel: projectNovelProviderInput(novel),
      preferences: projectPreferencesProviderInput(preferences ?? createEmptyPreferences(novel)),
      currentAssets: {
        direction: projectCreativeAssetProviderInput(currentAssets.direction),
        setting: action === 'setting_generate' ? null : projectCreativeAssetProviderInput(currentAssets.setting),
        outline: action === 'setting_generate' || action === 'outline_generate' ? null : projectCreativeAssetProviderInput(currentAssets.outline),
        stageOutline: action === 'chapter_plan_generate' ? projectCreativeAssetProviderInput(currentAssets.stageOutline) : null
      }
    };
    const execution = await executeClaimedGeneration({
      action,
      repository: this.options.repository,
      novel,
      idempotencyKey: request.idempotencyKey,
      effectiveRequest: { objectType, regenerateReason: request.regenerateReason?.trim() || null },
      sourceVersionRefs,
      context,
      now: this.now,
      providerCapability: this.structureProvider,
      provider: (authoritativeInput) => executeNovelProviderAction(this.getProviderSet(), authoritativeInput as typeof providerBaseInput & { action: typeof action; objectType: typeof objectType }),
      finalize: (task, asset) => this.options.repository.createStructureCandidate({
        novel,
        task,
        asset,
        taskType,
        changeReason,
        sourceVersionRefs,
        context,
        now: this.now()
      })
    });
    const versions = await this.options.repository.listStructureVersions(context.tenantId, novelId);
    const chapters = await this.options.repository.listNovelChapters(context.tenantId, novelId);
    if (execution.reused) {
      const version = versions.find((item) => execution.task.resultVersionIds.includes(item.id)) ?? null;
      return this.toStructureActionResult(novel, execution.task, versions, version, chapters, directionVersions);
    }
    const result = execution.value;

    return this.toStructureActionResult(result.novel, result.task, versions, result.version, chapters, directionVersions);
  }

  private async adoptStructureAsset(
    novelId: string,
    objectType: StructureAssetType,
    versionId: string,
    request: AdoptStructureAssetRequest,
    context: RequestContext
  ): Promise<StructureActionResultDTO> {
    const novel = await this.findNovelOrThrow(context.tenantId, novelId);
    this.ensureLifecycleActive(novel);
    await this.ensureStructureGenerationGate(novel, objectType);

    if (request.currentVersionId !== undefined && request.currentVersionId !== getCurrentVersionId(novel, objectType)) {
      throw new BusinessError(ErrorCode.VersionConflict, '当前结构资产版本已变化，请刷新后重试');
    }

    const candidate = await this.options.repository.findStructureVersionById(context.tenantId, novelId, objectType, versionId);
    if (!candidate) {
      throw new BusinessError(ErrorCode.NotFound, '结构资产候选不存在');
    }
    if (candidate.staleLevel === StaleLevel.HardStale) {
      throw new BusinessError(ErrorCode.CandidateStale, '该结构资产候选已过期，请重新生成');
    }
    if (candidate.status !== VersionStatus.Candidate) {
      throw new BusinessError(ErrorCode.VersionConflict, '该结构资产候选当前不可采用');
    }

    const isHighRisk = candidate.riskLevel === RiskLevel.High || candidate.riskLevel === RiskLevel.Blocking;
    const reason = request.reason?.trim() ?? '';
    if (isHighRisk && (!request.confirmHighRisk || !reason)) {
      throw new BusinessError(ErrorCode.GateBlocked, '高风险结构资产采用必须二次确认并填写原因');
    }

    const result = await this.options.repository.adoptStructureAsset({
      novel,
      candidate,
      objectType,
      reason: reason || `采用 ${objectType} 候选`,
      isForced: isHighRisk,
      pageVersionSnapshot: request.pageVersionSnapshot,
      context,
      now: this.now()
    });
    const directionVersions = await this.options.repository.listDirectionVersions(context.tenantId, novelId);

    return this.toStructureActionResult(result.novel, createStructureAdoptedTask(result.currentAsset), result.versions, result.currentAsset, result.chapters, directionVersions);
  }

  private async findNovelOrThrow(tenantIdOrNovelId: string, scopedNovelId?: string) {
    const tenantId = scopedNovelId ? tenantIdOrNovelId : DEFAULT_TENANT_ID;
    const novelId = scopedNovelId ?? tenantIdOrNovelId;
    const novel = await this.options.repository.findById(tenantId, novelId);

    if (!novel) {
      throw new BusinessError(ErrorCode.NotFound, '小说不存在');
    }

    return novel;
  }

  private ensureLifecycleActive(novel: NovelRecord) {
    if (novel.lifecycleStatus !== NovelLifecycleStatus.Active) {
      throw new BusinessError(ErrorCode.LifecycleNotActive, '小说已暂停、归档或删除，不能继续生成方向');
    }
  }

  private ensureDirectionGenerationStage(novel: NovelRecord) {
    if (![NovelCreationStage.Draft, NovelCreationStage.Direction].includes(novel.creationStage)) {
      throw new BusinessError(ErrorCode.InvalidStage, '当前阶段不能生成方向候选');
    }
  }

  private ensureDirectionWorkStage(novel: NovelRecord) {
    if (novel.creationStage !== NovelCreationStage.Direction) {
      throw new BusinessError(ErrorCode.InvalidStage, '当前阶段不能处理方向候选');
    }
  }

  private async ensureStructureGenerationGate(novel: NovelRecord, objectType: StructureAssetType) {
    if (objectType === 'setting') {
      if (!novel.currentDirectionVersionId) {
        throw new BusinessError(ErrorCode.GateBlocked, '没有已采用方向，不能生成设定');
      }
      return;
    }

    if (objectType === 'outline') {
      if (!novel.currentSettingVersionId) {
        throw new BusinessError(ErrorCode.GateBlocked, '没有已采用设定，不能生成全书大纲');
      }
      return;
    }

    if (objectType === 'stage_outline') {
      if (!novel.currentOutlineVersionId) {
        throw new BusinessError(ErrorCode.GateBlocked, '没有已采用全书大纲，不能生成阶段大纲');
      }
      return;
    }

    if (!novel.currentStageOutlineVersionId) {
      throw new BusinessError(ErrorCode.GateBlocked, '没有已采用阶段大纲，不能生成章节目录');
    }
  }

  private async ensureTrialGate(novel: NovelRecord, tenantId: string) {
    if (!novel.currentChapterPlanVersionId) {
      throw new BusinessError(ErrorCode.GateBlocked, '章节目录未确认，不能进入试写');
    }
    if (novel.creationStage !== NovelCreationStage.Trial) {
      throw new BusinessError(ErrorCode.InvalidStage, '当前阶段不能生成试写');
    }

    const chapters = await this.options.repository.listNovelChapters(tenantId, novel.id);
    if (chapters.length < 3) {
      throw new BusinessError(ErrorCode.GateBlocked, '试写至少需要前三章章节计划');
    }

    return chapters;
  }

  private async findDirectionVersionsOrThrow(tenantId: string, novelId: string, versionIds: string[]) {
    const versions = await Promise.all(versionIds.map((versionId) => this.findDirectionVersionOrThrow(tenantId, novelId, versionId)));

    return versions;
  }

  private async findDirectionVersionOrThrow(tenantId: string, novelId: string, versionId: string) {
    const version = await this.options.repository.findDirectionVersionById(tenantId, novelId, versionId);

    if (!version) {
      throw new BusinessError(ErrorCode.NotFound, '方向候选不存在');
    }

    return version;
  }

  private toListItemDTO(novel: NovelRecord, preferences?: NovelPreferencesRecord): NovelListItemDTO {
    const statusSummary = this.statusService.calculate(novel);
    const safePreferences = preferences ?? createEmptyPreferences(novel);

    return {
      id: novel.id,
      title: novel.title,
      channel: novel.channel,
      genres: novel.genres,
      lifecycleStatus: novel.lifecycleStatus,
      creationStage: novel.creationStage,
      stageStatus: novel.stageStatus,
      statusSummary,
      scoreSummary: {
        qualityScore: null,
        marketScore: null,
        riskLevel: 'none'
      },
      chapterProgress: {
        plannedChapterCount: novel.chapterLimit,
        completedChapterCount: 0,
        pendingChapterCount: 0,
        text: `0/${novel.chapterLimit}`
      },
      videoReferenceSummary: {
        status: novel.videoReferenceStatus ?? 'not_referenced',
        statusText: '未准备',
        referencedVideoCount: 0
      },
      creationSource: toCreationSourceSummaryDTO(safePreferences),
      recentTask: null,
      primaryAction: {
        type: 'view_detail',
        label: '详情',
        target: 'detail'
      },
      createdAt: novel.createdAt.toISOString(),
      updatedAt: novel.updatedAt.toISOString()
    };
  }

  private async toListItemDTOWithRecentTask(novel: NovelRecord): Promise<NovelListItemDTO> {
    const preferences = await this.options.repository.findPreferencesByNovelId(novel.tenantId, novel.id);
    const item = this.toListItemDTO(novel, preferences ?? createEmptyPreferences(novel));
    const recentTasks = await this.options.repository.listRecentTasksForNovel(novel.tenantId, novel.id, 1);
    const latestTrialRun = await this.options.repository.findLatestTrialRun(novel.tenantId, novel.id);

    return {
      ...item,
      statusSummary: applyTrialReviewStatusSummary(item.statusSummary, latestTrialRun),
      recentTask: recentTasks[0] ? toRecentTaskSummaryDTO(recentTasks[0]) : null
    };
  }

  private toDetailDTO(novel: NovelRecord, preferences: NovelPreferencesRecord): NovelDetailDTO {
    const item = this.toListItemDTO(novel, preferences);
    const preferenceDTO = toPreferenceDTO(preferences);
    const directionCandidates: DirectionCandidateDTO[] = [];

    return {
      ...item,
      preferences: preferenceDTO,
      currentAssets: {
        direction: null,
        setting: null,
        outline: null,
        stageOutline: null,
        chapterPlan: null
      },
      directionCandidates,
      structureCandidates: [],
      chapters: [],
      chapterStats: item.chapterProgress,
      latestTrialRun: null,
      bodyStrategySnapshot: null,
      bodyGeneration: null,
      latestFullReview: null,
      completionDecision: null,
      videoReadiness: null,
      recentTasks: [],
      blockingReasons: item.statusSummary.blockingReasons,
      videoSummary: item.videoReferenceSummary
    };
  }

  private async toDirectionActionResult(
    novel: NovelRecord,
    task: GenerationTaskRecord,
    versions: CreativeVersionRecord[],
    changedCandidate: CreativeVersionRecord | null
  ): Promise<DirectionActionResultDTO> {
    const sortedVersions = versions.sort((left, right) => right.versionNo - left.versionNo);
    const currentDirection = sortedVersions.find((version) => version.id === novel.currentDirectionVersionId) ?? null;
    const statusSummary = this.statusService.calculate(novel);

    return {
      novelId: novel.id,
      statusSummary,
      task: toDirectionTaskDTO(task),
      candidates: sortedVersions.map(toDirectionCandidateDTO),
      candidate: changedCandidate ? toDirectionCandidateDTO(changedCandidate) : null,
      currentDirection: currentDirection ? toDirectionCandidateDTO(currentDirection) : null,
      affectedObjects: currentDirection ? ['direction', 'setting_stage'] : ['direction'],
      nextAction: statusSummary.recommendedAction
    };
  }

  private async toStructureActionResult(
    novel: NovelRecord,
    task: GenerationTaskRecord,
    versions: CreativeVersionRecord[],
    changedCandidate: CreativeVersionRecord | null,
    chapters: NovelChapterRecord[],
    directionVersions: CreativeVersionRecord[]
  ): Promise<StructureActionResultDTO> {
    const sortedVersions = versions.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.versionNo - left.versionNo);
    const structureCandidates = sortedVersions.map(toStructureAssetDTO);
    const currentAssets = toCurrentAssetsDTO(novel, directionVersions, sortedVersions);
    const statusSummary = this.statusService.calculate(novel);

    return {
      novelId: novel.id,
      statusSummary,
      task: toStructureTaskDTO(task),
      candidates: structureCandidates,
      candidate: changedCandidate ? toStructureAssetDTO(changedCandidate) : null,
      currentAssets,
      chapters: chapters.map(toNovelChapterDTO),
      affectedObjects: changedCandidate ? getAffectedObjects(changedCandidate.objectType as StructureAssetType) : [],
      nextAction: statusSummary.recommendedAction
    };
  }

  private async toTrialActionResult(
    novel: NovelRecord,
    task: GenerationTaskRecord,
    trialRun: TrialRunRecord,
    explicitSnapshot: CreativeVersionRecord | null = null
  ): Promise<TrialActionResultDTO> {
    const statusSummary = applyTrialReviewStatusSummary(this.statusService.calculate(novel), trialRun);
    const bodyStrategySnapshot = explicitSnapshot ?? await this.options.repository.findBodyStrategySnapshot(novel.tenantId, novel.id);

    return {
      novelId: novel.id,
      statusSummary,
      task: toDirectionTaskDTO(task),
      trialRun: await toTrialRunDTO(trialRun, novel, this.options.repository, bodyStrategySnapshot),
      bodyStrategySnapshot: bodyStrategySnapshot ? toBodyStrategySnapshotDTO(bodyStrategySnapshot) : null,
      affectedObjects: bodyStrategySnapshot ? ['trial_run', 'body_strategy_snapshot'] : ['trial_run'],
      nextAction: statusSummary.recommendedAction
    };
  }
}

export function createDefaultRequestContext(requestId: string, ip?: string, userAgent?: string): RequestContext {
  return {
    tenantId: DEFAULT_TENANT_ID,
    userId: DEFAULT_USER_ID,
    requestId,
    ip,
    userAgent
  };
}

function toPreferenceDTO(preferences: NovelPreferencesRecord): CreateNovelPreferencesDTO {
  const sourceSummary = toCreationSourceSummaryDTO(preferences);

  return {
    creationSourceType: preferences.creationSourceType,
    creationSourceLabel: sourceSummary.label,
    creationSourceDescription: sourceSummary.description,
    hotspotReportId: preferences.hotspotReportId,
    hotspotOpportunityId: preferences.hotspotOpportunityId,
    hotspotTitle: preferences.hotspotTitle,
    hotspotOpportunityTitle: preferences.hotspotOpportunityTitle,
    appealPoints: preferences.appealPoints,
    genres: preferences.genres,
    openingState: preferences.openingState,
    blockedElements: preferences.blockedElements,
    targetAudience: preferences.targetAudience,
    chapterLimit: preferences.chapterLimit,
    chapterWordMin: preferences.chapterWordMin,
    chapterWordMax: preferences.chapterWordMax,
    stageCount: preferences.stageCount,
    customIdea: preferences.customIdea,
    style: preferences.style,
    videoAdaptationPreference: preferences.videoAdaptationPreference
  };
}

function toCreationSourceSummaryDTO(preferences: NovelPreferencesRecord) {
  const type = preferences.creationSourceType;
  const base = getCreationSourceDisplay(type);

  return {
    type,
    label: base.label,
    description: base.description,
    hotspotReportId: preferences.hotspotReportId,
    hotspotOpportunityId: preferences.hotspotOpportunityId,
    hotspotTitle: preferences.hotspotTitle,
    hotspotOpportunityTitle: preferences.hotspotOpportunityTitle,
    isLegacyUnknown: type === 'legacy_unknown',
    unavailableReason: type === 'hotspot_reference' ? null : null
  };
}

function getCreationSourceDisplay(type: NovelPreferencesRecord['creationSourceType']) {
  switch (type) {
    case 'system_recommendation':
      return {
        label: '系统推荐',
        description: '按题材、爽点和默认策略作为方向生成参考。'
      };
    case 'hotspot_reference':
      return {
        label: '引用热点',
        description: '基于已验证的热点报告或机会点作为方向生成参考。'
      };
    case 'manual_idea':
      return {
        label: '手动想法',
        description: '围绕用户填写的核心想法扩展方向。'
      };
    case 'legacy_unknown':
    default:
      return {
        label: '未记录来源',
        description: '历史数据没有可信创作来源记录。'
      };
  }
}

function createEmptyPreferences(novel: NovelRecord): NovelPreferencesRecord {
  return {
    id: '',
    tenantId: novel.tenantId,
    novelId: novel.id,
    creationSourceType: 'legacy_unknown',
    hotspotReportId: novel.hotspotReportId,
    hotspotOpportunityId: null,
    hotspotTitle: null,
    hotspotOpportunityTitle: null,
    appealPoints: [],
    genres: novel.genres,
    openingState: null,
    blockedElements: [],
    targetAudience: null,
    chapterLimit: novel.chapterLimit,
    chapterWordMin: novel.chapterWordMin,
    chapterWordMax: novel.chapterWordMax,
    stageCount: null,
    customIdea: null,
    style: null,
    videoAdaptationPreference: null,
    createdBy: novel.createdBy,
    createdAt: novel.createdAt
  };
}

function createCreationSourceValidationError(path: string, message: string, extraDetails: Record<string, unknown> = {}) {
  return new BusinessError(ErrorCode.ValidationError, message, {
    issues: [{ path, message }],
    ...extraDetails
  });
}

function applyTrialReviewStatusSummary<T extends { recommendedAction: unknown }>(
  statusSummary: T & { displayStatus?: string; displayStatusText?: string; currentStep?: string; recommendedAction: NovelDetailDTO['statusSummary']['recommendedAction'] },
  trialRun: TrialRunRecord | null
) {
  if (!trialRun || trialRun.status !== 'review_ready') {
    return statusSummary;
  }

  return {
    ...statusSummary,
    displayStatus: 'trial_review_ready',
    displayStatusText: '试写总评待确认',
    currentStep: '确认试写总评并生成正文策略快照',
    recommendedAction: createLocalRecommendedAction({
      type: 'confirm_trial_review',
      label: '确认试写总评',
      reasonText: '前三章试写总评已生成，请确认试写并生成策略快照。',
      confirmRequired: true,
      taskType: 'trial_confirm'
    })
  };
}

async function buildBodyGenerationState(
  repository: NovelRepository,
  novel: NovelRecord,
  statusService: NovelStatusService,
  inputChapters?: NovelChapterRecord[],
  inputStrategySnapshot?: CreativeVersionRecord | null
): Promise<BodyGenerationStateDTO> {
  const chapters = inputChapters ?? await repository.listNovelChapters(novel.tenantId, novel.id);
  const strategySnapshot = inputStrategySnapshot ?? await repository.findBodyStrategySnapshot(novel.tenantId, novel.id);
  const latestBatch = await repository.findLatestBodyBatch(novel.tenantId, novel.id);
  const openImpactCases = await repository.listOpenBlockingImpactCases(novel.tenantId, novel.id);
  const nextRange = calculateBodyBatchPreviewRange(chapters);
  const completedCount = chapters.filter((chapter) => chapter.currentContentVersionId && chapter.mainStatus === 'completed').length;
  const pendingCount = Math.max(0, chapters.length - completedCount);
  const blockingReasons: string[] = [];

  if (!strategySnapshot) {
    blockingReasons.push('没有已确认且未过期的正文生成策略快照。');
  }
  if (openImpactCases.length > 0) {
    blockingReasons.push('存在中等或严重影响案例未关闭。');
  }
  if (latestBatch?.status === 'paused') {
    blockingReasons.push(latestBatch.statusNote ?? '上一批正文生成已暂停，需要先处理失败章节。');
  }

  const statusSummary = statusService.calculate(novel);
  const recommendedAction =
    openImpactCases.length > 0
      ? createLocalRecommendedAction({
          type: 'resolve_impact_case',
          label: '处理影响案例',
          reasonText: '中等或严重影响未关闭前，不能继续正文生成或进入全书审稿。',
          taskType: 'chapter_impact_assess'
        })
      : latestBatch?.status === 'paused'
        ? createLocalRecommendedAction({
            type: 'handle_failed_chapter',
            label: '处理失败章节',
            reasonText: latestBatch.summary.conclusion,
            taskType: 'chapter_body_rewrite'
          })
        : !strategySnapshot
          ? createLocalRecommendedAction({
              type: 'confirm_trial_review',
              label: '确认试写总评',
              reasonText: '需要先确认试写总评并生成策略快照，才能批量正文。',
              disabled: true,
              disabledReason: '缺少正文生成策略快照',
              confirmRequired: true,
              taskType: 'trial_confirm'
            })
          : nextRange.startChapterNo && nextRange.endChapterNo
            ? createLocalRecommendedAction({
                type: 'start_body_batch',
                label: '开始本批生成',
                reasonText: `将基于策略快照 v${strategySnapshot.versionNo} 生成第 ${nextRange.startChapterNo}-${nextRange.endChapterNo} 章，默认最多 5 章。`,
                confirmRequired: true,
                taskType: 'body_batch_generate'
              })
            : createLocalRecommendedAction({
                type: 'body_ready_for_full_review',
                label: '全书 AI 审稿',
                reasonText: '正文批量生成阶段已完成，下一步创建正式全书审稿任务。',
                confirmRequired: true,
                taskType: 'novel_full_review'
              });

  return {
    strategySnapshot: strategySnapshot ? toBodyStrategySnapshotDTO(strategySnapshot) : null,
    latestBatch: latestBatch ? toBodyBatchDTO(latestBatch) : null,
    openImpactCases: openImpactCases.map(toImpactCaseDTO),
    nextBatchRange: {
      startChapterNo: nextRange.startChapterNo,
      endChapterNo: nextRange.endChapterNo,
      batchSize: nextRange.batchSize,
      text: nextRange.startChapterNo && nextRange.endChapterNo ? `第 ${nextRange.startChapterNo}-${nextRange.endChapterNo} 章` : '暂无可生成章节'
    },
    chapterProgress: {
      plannedChapterCount: chapters.length > 0 ? chapters.length : novel.chapterLimit,
      completedChapterCount: completedCount,
      pendingChapterCount: pendingCount,
      text: `${completedCount}/${chapters.length > 0 ? chapters.length : novel.chapterLimit}`
    },
    blockingReasons,
    recommendedAction: recommendedAction ?? statusSummary.recommendedAction
  };
}

export async function enrichDetailWithCreativeAssets(
  detail: NovelDetailDTO,
  novel: NovelRecord,
  repository: NovelRepository,
  tenantId = DEFAULT_TENANT_ID
) {
  const directionVersions = await repository.listDirectionVersions(tenantId, novel.id);
  const structureVersions = await repository.listStructureVersions(tenantId, novel.id);
  const chapters = await repository.listNovelChapters(tenantId, novel.id);
  const directionCandidates = directionVersions.map(toDirectionCandidateDTO);
  const structureCandidates = structureVersions.map(toStructureAssetDTO);
  const currentAssets = toCurrentAssetsDTO(novel, directionVersions, structureVersions);
  const recentTasks = await repository.listRecentTasksForNovel(tenantId, novel.id, 5);
  const recentTaskSummaries = recentTasks.map(toRecentTaskSummaryDTO);
  const latestTrialRun = await repository.findLatestTrialRun(tenantId, novel.id);
  const bodyStrategySnapshot = await repository.findBodyStrategySnapshot(tenantId, novel.id);
  const latestFullReview = await repository.findLatestFullReview(tenantId, novel.id);
  const completionDecision = await repository.findLatestCompletionDecision(tenantId, novel.id);
  const latestVideoReadinessCheck = await repository.findLatestVideoReadinessCheck(tenantId, novel.id);
  const latestVideoReadinessSnapshot = await repository.findLatestVideoReadinessSnapshot(tenantId, novel.id);
  const statusService = new NovelStatusService();
  const activeTrialFollowup = recentTasks.find((task) => task.taskType === 'trial_followup_generate' && task.status === TaskStatus.Processing);
  const statusSummary = activeTrialFollowup ? {
    ...applyTrialReviewStatusSummary(detail.statusSummary, latestTrialRun),
    stageStatus: StageStatus.Processing,
    displayStatus: 'trial_followup_processing',
    displayStatusText: '正在生成第2-3章和试写总评',
    currentStep: activeTrialFollowup.currentStep ?? '正在生成第2-3章和试写总评',
    recommendedAction: createLocalRecommendedAction({ type: 'view_task', label: '查看任务', reasonText: '试写续写任务正在处理，请查看任务进度。', target: 'task', taskType: activeTrialFollowup.taskType })
  } : applyTrialReviewStatusSummary(detail.statusSummary, latestTrialRun);
  const bodyGeneration = await buildBodyGenerationState(repository, novel, statusService, chapters, bodyStrategySnapshot);

  return {
    ...detail,
    statusSummary,
    currentAssets,
    directionCandidates,
    structureCandidates,
    chapters: chapters.map(toNovelChapterDTO),
    chapterProgress: {
      ...detail.chapterProgress,
      plannedChapterCount: chapters.length > 0 ? chapters.length : detail.chapterProgress.plannedChapterCount,
      pendingChapterCount: chapters.filter((chapter) => chapter.mainStatus === 'pending').length,
      completedChapterCount: chapters.filter((chapter) => chapter.mainStatus === 'completed').length,
      text: `${chapters.filter((chapter) => chapter.mainStatus === 'completed').length}/${chapters.length > 0 ? chapters.length : detail.chapterProgress.plannedChapterCount}`
    },
    chapterStats: {
      ...detail.chapterStats,
      plannedChapterCount: chapters.length > 0 ? chapters.length : detail.chapterStats.plannedChapterCount,
      pendingChapterCount: chapters.filter((chapter) => chapter.mainStatus === 'pending').length,
      completedChapterCount: chapters.filter((chapter) => chapter.mainStatus === 'completed').length,
      text: `${chapters.filter((chapter) => chapter.mainStatus === 'completed').length}/${chapters.length > 0 ? chapters.length : detail.chapterStats.plannedChapterCount}`
    },
    latestTrialRun: latestTrialRun ? await toTrialRunDTO(latestTrialRun, novel, repository, bodyStrategySnapshot) : null,
    bodyStrategySnapshot: bodyStrategySnapshot ? toBodyStrategySnapshotDTO(bodyStrategySnapshot) : null,
    bodyGeneration,
    latestFullReview: latestFullReview ? toFullReviewReportDTO(latestFullReview.reviewReport, latestFullReview.gate) : null,
    completionDecision: completionDecision ? toCompletionDecisionDTO(completionDecision) : null,
    videoReadiness: toVideoReadinessDTO(novel.id, completionDecision, latestVideoReadinessCheck, latestVideoReadinessSnapshot, statusSummary.recommendedAction),
    recentTask: recentTaskSummaries[0] ?? null,
    recentTasks: recentTaskSummaries
  };
}

export async function enrichDetailWithDirections(
  detail: NovelDetailDTO,
  novel: NovelRecord,
  repository: NovelRepository,
  tenantId = DEFAULT_TENANT_ID
) {
  return enrichDetailWithCreativeAssets(detail, novel, repository, tenantId);
}

function toDirectionTaskDTO(task: GenerationTaskRecord): DirectionTaskDTO {
  const safe = toRecentTaskSummaryDTO(task);
  return {
    id: task.id,
    taskType: task.taskType,
    status: task.status,
    statusText: getTaskStatusText(task.status),
    statusNote: task.status === TaskStatus.Failed ? safe.errorMessage : task.statusNote,
    progress: task.progress,
    currentStep: safe.currentStep,
    resultVersionIds: task.resultVersionIds,
    failureCategory: task.failureCategory,
    errorCode: safe.errorCode,
    errorMessage: safe.errorMessage
  };
}

function createVirtualDirectionTaskDTO(taskType: string, currentStep: string): DirectionTaskDTO {
  return {
    id: `virtual_${taskType}`,
    taskType,
    status: TaskStatus.Completed,
    statusText: getTaskStatusText(TaskStatus.Completed),
    statusNote: currentStep,
    progress: 100,
    currentStep,
    resultVersionIds: [],
    failureCategory: null,
    errorCode: null
  };
}

function createAdoptedTask(currentDirection: CreativeVersionRecord): GenerationTaskRecord {
  const now = new Date();

  return {
    id: currentDirection.sourceTaskId ?? `adopt_${currentDirection.id}`,
    tenantId: currentDirection.tenantId,
    novelId: currentDirection.novelId,
    taskType: 'novel_direction_adopt',
    objectType: 'direction',
    objectId: 'direction',
    status: TaskStatus.Completed,
    statusNote: '方向已采用',
    progress: 100,
    currentStep: '方向已采用，进入设定阶段',
    triggerSource: 'manual',
    sourceVersionRefs: currentDirection.sourceVersionRefs,
    conflictScope: 'novel_direction',
    conflictKey: currentDirection.novelId,
    idempotencyToken: null,
    requestHash: null,
    activeClaimKey: null,
    inputSummary: '采用方向候选。',
    outputSummary: '方向已采用，小说进入设定阶段。',
    resultVersionIds: [currentDirection.id],
    retryOfTaskId: null,
    failureCategory: null,
    errorCode: null,
    errorMessage: null,
    resultObjectType: 'creative_version',
    resultObjectId: currentDirection.id,
    userAcceptedResult: true,
    cancelRequestedAt: null,
    cancelReason: null,
    startedAt: currentDirection.createdAt,
    finishedAt: now,
    createdBy: currentDirection.createdBy,
    createdAt: currentDirection.createdAt,
    updatedAt: now,
    metadata: {}
  };
}

function createStructureAdoptedTask(currentAsset: CreativeVersionRecord): GenerationTaskRecord {
  const now = new Date();

  return {
    id: currentAsset.sourceTaskId ?? `adopt_${currentAsset.id}`,
    tenantId: currentAsset.tenantId,
    novelId: currentAsset.novelId,
    taskType: `adopt_${currentAsset.objectType}`,
    objectType: currentAsset.objectType,
    objectId: currentAsset.objectType,
    status: TaskStatus.Completed,
    statusNote: '结构资产已采用',
    progress: 100,
    currentStep: '结构资产已采用，下一步状态已更新',
    triggerSource: 'manual',
    sourceVersionRefs: currentAsset.sourceVersionRefs,
    conflictScope: `novel_${currentAsset.objectType}`,
    conflictKey: currentAsset.novelId,
    idempotencyToken: null,
    requestHash: null,
    activeClaimKey: null,
    inputSummary: '采用结构资产候选。',
    outputSummary: '结构资产已采用，小说阶段已推进。',
    resultVersionIds: [currentAsset.id],
    retryOfTaskId: null,
    failureCategory: null,
    errorCode: null,
    errorMessage: null,
    resultObjectType: 'creative_version',
    resultObjectId: currentAsset.id,
    userAcceptedResult: true,
    cancelRequestedAt: null,
    cancelReason: null,
    startedAt: currentAsset.createdAt,
    finishedAt: now,
    createdBy: currentAsset.createdBy,
    createdAt: currentAsset.createdAt,
    updatedAt: now,
    metadata: {}
  };
}

function toDirectionCandidateDTO(version: CreativeVersionRecord): DirectionCandidateDTO {
  const metadata = toMetadata(version.metadata);
  const content = toDirectionContent(version.content);

  return {
    id: version.id,
    versionNo: version.versionNo,
    status: version.status,
    staleLevel: version.staleLevel,
    title: content.title,
    summary: version.summary ?? content.logline,
    content,
    score: version.score ?? 0,
    marketScore: metadata.marketScore,
    riskLevel: version.riskLevel,
    riskTags: metadata.riskTags.length > 0 ? metadata.riskTags : content.riskTags,
    recommendedReason: metadata.recommendedReason || content.recommendation,
    createdAt: version.createdAt.toISOString()
  };
}

function toStructureAssetDTO(version: CreativeVersionRecord): StructureAssetDTO {
  const metadata = toMetadata(version.metadata);
  const content = toStructureContent(version.content);

  return {
    id: version.id,
    objectType: version.objectType as StructureAssetType,
    versionNo: version.versionNo,
    status: version.status,
    staleLevel: version.staleLevel,
    title: content.title,
    summary: version.summary ?? content.summary,
    content,
    score: version.score ?? 0,
    riskLevel: version.riskLevel,
    riskTags: metadata.riskTags.length > 0 ? metadata.riskTags : content.riskTags,
    recommendedReason: metadata.recommendedReason || content.recommendation,
    createdAt: version.createdAt.toISOString()
  };
}

function toNovelChapterDTO(chapter: NovelChapterRecord): NovelChapterDTO {
  return {
    id: chapter.id,
    chapterNo: chapter.chapterNo,
    stageIndex: chapter.stageIndex,
    title: chapter.title,
    wordTarget: chapter.wordTarget,
    wordCount: chapter.wordCount,
    mainStatus: chapter.mainStatus,
    statusNote: chapter.statusNote,
    impactLevel: chapter.impactLevel,
    currentContentVersionId: chapter.currentContentVersionId,
    createdAt: chapter.createdAt.toISOString(),
    updatedAt: chapter.updatedAt.toISOString()
  };
}

function toFullReviewReportDTO(report: ReviewReportRecord, gate: FullReviewGateRecord): FullReviewReportDTO {
  const metadata = toRecord(report.metadata);

  return {
    id: report.id,
    version: Number(metadata.version ?? 1),
    reviewLevel: 'full_novel',
    totalScore: report.totalScore ?? 0,
    rating: report.rating ?? '',
    gateResult: gate.gateResult,
    summary: report.summary ?? '',
    strengths: report.strengths,
    problems: report.problems,
    suggestions: report.suggestions,
    dimensionScores: toScoringDimensions(report.subScores),
    issues: toFullReviewIssues(report.issueCards),
    videoSuggestion: String(metadata.videoSuggestion ?? ''),
    firstVideoSuggestion: toFirstVideoSuggestion(metadata.firstVideoSuggestion),
    platformRisks: toStringArray(metadata.platformRisks),
    originalityRisks: toStringArray(metadata.originalityRisks),
    aiFlavorRisks: toStringArray(metadata.aiFlavorRisks),
    lowScoreContinueRisks: toStringArray(metadata.lowScoreContinueRisks),
    reviewPolicyVersionId: report.policyProfileVersionId ?? String(metadata.reviewPolicyVersionId ?? DEFAULT_POLICY_PROFILE_VERSION_ID),
    sourceVersionRefs: metadata.sourceVersionRefs ?? gate.sourceVersionRefs,
    gate: toFullReviewGateDTO(gate),
    createdAt: report.createdAt.toISOString()
  };
}

function toFullReviewGateDTO(gate: FullReviewGateRecord): FullReviewGateDTO {
  return {
    id: gate.id,
    reviewReportId: gate.reviewReportId,
    gateResult: gate.gateResult,
    gateResultText: getFullReviewGateText(gate.gateResult),
    allowCompletion: gate.allowCompletion,
    allowVideoReady: gate.allowVideoReady,
    blockingIssueCount: gate.blockingIssueCount,
    warningIssueCount: gate.warningIssueCount,
    forcePassAllowed: gate.forcePassAllowed,
    forcePassReason: gate.forcePassReason,
    isStale: gate.isStale,
    staleReason: gate.staleReason,
    createdAt: gate.createdAt.toISOString()
  };
}

function toCompletionDecisionDTO(decision: CompletionDecisionRecord): CompletionDecisionDTO {
  return {
    id: decision.id,
    reviewReportId: decision.reviewReportId,
    fullReviewGateId: decision.fullReviewGateId,
    decision: decision.decision,
    reason: decision.decisionReason,
    isForced: decision.isForced,
    score: decision.score,
    riskSummary: decision.riskSummary,
    chapterCount: decision.chapterCount,
    totalWordCount: decision.totalWordCount,
    estimatedAudioMinutes: decision.estimatedAudioMinutes,
    createdAt: decision.createdAt.toISOString()
  };
}

function toVideoReadinessDTO(
  novelId: string,
  completionDecision: CompletionDecisionRecord | null,
  check: VideoReadinessCheckRecord | null,
  snapshot: VideoReadinessSnapshotRecord | null,
  fallbackAction: NovelDetailDTO['statusSummary']['recommendedAction']
): VideoReadinessDTO {
  const status = snapshot ? 'ready' : check?.status ?? 'not_ready';
  const recommendedAction =
    snapshot
      ? createLocalRecommendedAction({
          type: 'go_video_list',
          label: '去视频列表',
          reasonText: '小说已可被视频模块引用；这里不创建视频项目。'
        })
      : check?.status === 'candidate' && completionDecision
        ? createLocalRecommendedAction({
            type: 'confirm_video_readiness',
            label: '确认进入待视频化',
            reasonText: '待视频化检查已通过，确认后生成可被视频模块引用的快照。',
            confirmRequired: true,
            taskType: 'video_readiness_check'
          })
        : check?.status === 'not_ready'
          ? createLocalRecommendedAction({
              type: 'recheck_video_readiness',
              label: '重新检查待视频化',
              reasonText: check.blockingReasons[0] ?? '待视频化检查未通过，请处理后重新检查。',
              taskType: 'video_readiness_check'
            })
          : fallbackAction;

  return {
    novelId,
    status,
    statusText: getVideoReadinessStatusText(status),
    check: check ? toVideoReadinessCheckDTO(check) : null,
    checkItems: check?.checkItems ?? [],
    blockingReasons: check?.blockingReasons ?? [],
    completionDecision: completionDecision ? toCompletionDecisionDTO(completionDecision) : null,
    snapshot: snapshot ? toVideoReadinessSnapshotDTO(snapshot) : null,
    firstVideoSuggestion: snapshot?.firstVideoSuggestion ?? check?.firstVideoSuggestion ?? null,
    recommendedAction
  };
}

function toVideoReadinessCheckDTO(check: VideoReadinessCheckRecord): VideoReadinessCheckDTO {
  return {
    id: check.id,
    version: check.version,
    status: check.status,
    statusText: getVideoReadinessStatusText(check.status),
    checkItems: check.checkItems,
    blockingReasons: check.blockingReasons,
    firstVideoSuggestion: check.firstVideoSuggestion,
    createdAt: check.createdAt.toISOString()
  };
}

function toVideoReadinessSnapshotDTO(snapshot: VideoReadinessSnapshotRecord): VideoReadinessSnapshotDTO {
  return {
    id: snapshot.id,
    completionDecisionId: snapshot.completionDecisionId,
    reviewReportId: snapshot.reviewReportId,
    status: snapshot.status,
    chapterCount: snapshot.chapterCount,
    totalWordCount: snapshot.totalWordCount,
    estimatedAudioMinutes: snapshot.estimatedAudioMinutes,
    riskSummary: snapshot.riskSummary,
    referableChapterIds: snapshot.referableChapterIds,
    referableChapterVersionIds: snapshot.referableChapterVersionIds,
    firstVideoSuggestion: snapshot.firstVideoSuggestion,
    createdAt: snapshot.createdAt.toISOString()
  };
}

function toScoringDimensions(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is FullReviewReportDTO['dimensionScores'][number] => Boolean(item && typeof item === 'object')) : [];
}

function toFullReviewIssues(value: unknown): FullReviewIssueDTO[] {
  return Array.isArray(value) ? value.map((item) => item as FullReviewIssueDTO) : [];
}

function toFirstVideoSuggestion(value: unknown): FirstVideoSuggestionDTO {
  const record = toRecord(value);

  return {
    chapterRange: typeof record.chapterRange === 'string' ? record.chapterRange : '',
    openingSlice: typeof record.openingSlice === 'string' ? record.openingSlice : '',
    narrationHook: typeof record.narrationHook === 'string' ? record.narrationHook : '',
    firstScreenSubtitle: typeof record.firstScreenSubtitle === 'string' ? record.firstScreenSubtitle : '',
    titleHook: typeof record.titleHook === 'string' ? record.titleHook : '',
    endingSuspense: typeof record.endingSuspense === 'string' ? record.endingSuspense : '',
    suggestedFormat: typeof record.suggestedFormat === 'string' ? record.suggestedFormat : '',
    riskTips: toStringArray(record.riskTips)
  };
}

async function toTrialRunDTO(
  trialRun: TrialRunRecord,
  novel: NovelRecord,
  repository: NovelRepository,
  bodyStrategySnapshot: CreativeVersionRecord | null = null
): Promise<TrialRunDTO> {
  const chapters = await repository.listNovelChapters(novel.tenantId, novel.id);
  const versionGroups = await Promise.all(chapters.map((chapter) => repository.listChapterContentVersions(novel.tenantId, novel.id, chapter.id)));
  const allVersions = versionGroups.flat().filter((version) => getMetadataString(version.metadata, 'trialRunId') === trialRun.id);
  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const chapterOneCandidates = allVersions
    .filter((version) => Number(toRecord(version.metadata).chapterNo ?? chapterById.get(version.chapterId)?.chapterNo ?? 0) === 1)
    .sort((left, right) => left.versionNo - right.versionNo)
    .map((version) => toTrialChapterCandidateDTO(version, chapterById.get(version.chapterId)));
  const results = await repository.listTrialChapterResults(novel.tenantId, trialRun.id);
  const chapterResults = await Promise.all(
    results.map(async (result) => {
      const contentVersion = result.contentVersionId ? await repository.findChapterContentVersionById(novel.tenantId, novel.id, result.contentVersionId) : null;
      const featureCard = result.featureCardVersionId ? await repository.findFeatureCardById(novel.tenantId, result.featureCardVersionId) : null;
      const reviewReport = result.reviewReportId ? await repository.findReviewReportById(novel.tenantId, result.reviewReportId) : null;
      const chapter = chapterById.get(result.chapterId);

      return toTrialChapterResultDTO(result, chapter, contentVersion, featureCard, reviewReport);
    })
  );
  const trialReview = trialRun.reviewReportId ? await repository.findReviewReportById(novel.tenantId, trialRun.reviewReportId) : null;
  const task = trialRun.sourceTaskId ? await repository.findTaskById(novel.tenantId, trialRun.sourceTaskId) : null;
  const metadata = toRecord(trialRun.metadata);

  return {
    id: trialRun.id,
    novelId: trialRun.novelId,
    status: trialRun.status,
    statusText: getTrialRunStatusText(trialRun.status),
    chapterCount: trialRun.trialChapterCount,
    currentStep: typeof metadata.currentStep === 'string' ? metadata.currentStep : getTrialRunStatusText(trialRun.status),
    selectedChapterOneCandidateId: typeof metadata.selectedChapterOneCandidateId === 'string' ? metadata.selectedChapterOneCandidateId : null,
    blockingReason: typeof metadata.blockingReason === 'string' ? metadata.blockingReason : null,
    chapterOneCandidates,
    chapterResults,
    trialReview: trialReview ? toTrialReviewDTO(trialReview) : null,
    bodyStrategySnapshot: bodyStrategySnapshot ? toBodyStrategySnapshotDTO(bodyStrategySnapshot) : null,
    task: task ? toRecentTaskSummaryDTO(task) : null,
    recentTask: task ? toRecentTaskSummaryDTO(task) : null
  };
}

function toTrialChapterResultDTO(
  result: TrialChapterResultRecord,
  chapter: NovelChapterRecord | undefined,
  contentVersion: ChapterContentVersionRecord | null,
  featureCard: ChapterFeatureCardRecord | null,
  reviewReport: ReviewReportRecord | null
): TrialChapterResultDTO {
  const metadata = toRecord(result.metadata);

  return {
    id: result.id,
    chapterId: result.chapterId,
    chapterNo: chapter?.chapterNo ?? Number(toRecord(contentVersion?.metadata).chapterNo ?? 0),
    title: chapter?.title ?? String(toRecord(contentVersion?.metadata).title ?? '试写章节'),
    status: result.status,
    score: result.score ?? 0,
    hardFailed: metadata.hardFailed === true,
    hardFailureReasons: toStringArray(metadata.hardFailureReasons),
    contentVersion: contentVersion ? toTrialChapterCandidateDTO(contentVersion, chapter) : null,
    featureCard: featureCard ? toChapterFeatureCardDTO(featureCard) : null,
    reviewReport: reviewReport ? toChapterReviewReportDTO(reviewReport) : null
  };
}

function toTrialChapterCandidateDTO(version: ChapterContentVersionRecord, chapter?: NovelChapterRecord): TrialChapterCandidateDTO {
  const metadata = toRecord(version.metadata);
  const trialStatus = typeof metadata.trialStatus === 'string' ? metadata.trialStatus : null;

  return {
    id: version.id,
    chapterId: version.chapterId,
    chapterNo: Number(metadata.chapterNo ?? chapter?.chapterNo ?? 0),
    title: typeof metadata.title === 'string' ? metadata.title : chapter?.title ?? '试写章节',
    versionNo: version.versionNo,
    status: trialStatus === 'selected_for_trial' ? 'selected_for_trial' : trialStatus === 'historical' ? 'historical' : version.status,
    staleLevel: version.staleLevel,
    isAiRecommended: metadata.isAiRecommended === true,
    isSelected: metadata.isSelected === true || trialStatus === 'selected_for_trial',
    openingStrategy: String(metadata.openingStrategy ?? ''),
    openingHighlight: String(metadata.openingHighlight ?? ''),
    firstSentence: String(metadata.firstSentence ?? firstSentence(version.content)),
    first300Summary: String(metadata.first300Summary ?? version.content.slice(0, 300)),
    endingHook: String(metadata.endingHook ?? ''),
    riskLevel: (metadata.riskLevel as RiskLevel) ?? RiskLevel.Low,
    riskTags: toStringArray(metadata.riskTags),
    aiRecommendedReason: String(metadata.aiRecommendedReason ?? ''),
    wordCount: version.wordCount,
    contentPreview: version.content.slice(0, 180),
    content: version.content,
    scoring: toQualityScoring(metadata.scoring, version.reviewScore ?? 0),
    createdAt: version.createdAt.toISOString()
  };
}

function toChapterFeatureCardDTO(card: ChapterFeatureCardRecord): ChapterFeatureCardDTO {
  return {
    id: card.id,
    chapterId: card.chapterId,
    versionNo: card.versionNo,
    status: card.status,
    oneLineSummary: card.oneLineSummary ?? '',
    coreTask: card.coreTask ?? '',
    mainConflict: card.mainConflict ?? '',
    appealPoint: card.appealPoint ?? '',
    emotionKeywords: card.emotionKeywords,
    characterChanges: card.characterChanges,
    relationshipChanges: card.relationshipChanges,
    keyInformation: card.keyInformation,
    foreshadowingOperation: card.foreshadowingOperation ?? '',
    endingHook: card.endingHook ?? '',
    factsCannotChange: card.factsCannotChange,
    featuresToStrengthen: card.featuresToStrengthen,
    createdAt: card.createdAt.toISOString()
  };
}

function toChapterReviewReportDTO(report: ReviewReportRecord): ChapterReviewReportDTO {
  const metadata = toRecord(report.metadata);

  return {
    id: report.id,
    objectVersionId: report.objectVersionId,
    reviewLevel: report.reviewLevel,
    scoringStrategyVersion: String(metadata.scoringStrategyVersion ?? 'trial-chapter-score-v1'),
    totalScore: report.totalScore ?? 0,
    rating: report.rating ?? '',
    summary: report.summary ?? '',
    strengths: report.strengths,
    problems: report.problems,
    suggestions: report.suggestions,
    issues: toReviewIssues(report.issueCards),
    recommendedAction: report.recommendedAction ?? '',
    allowNextStep: report.allowNextStep,
    blockingIssueCount: report.blockingIssueCount,
    createdAt: report.createdAt.toISOString()
  };
}

function toTrialReviewDTO(report: ReviewReportRecord): TrialReviewDTO {
  const metadata = toRecord(report.metadata);
  const trialResult = String(metadata.trialResult ?? report.rating ?? 'pass') as TrialReviewDTO['trialResult'];

  return {
    id: report.id,
    scoringStrategyVersion: String(metadata.scoringStrategyVersion ?? 'trial-summary-score-v1'),
    totalScore: report.totalScore ?? 0,
    trialResult,
    trialResultText: getTrialResultText(trialResult),
    allowNextStep: report.allowNextStep,
    requiresRiskConfirmation: metadata.requiresRiskConfirmation === true,
    strengths: report.strengths,
    problems: report.problems,
    suggestions: report.suggestions,
    chapterScores: Array.isArray(metadata.chapterScores)
      ? metadata.chapterScores.map((item) => {
          const record = toRecord(item);
          return {
            chapterNo: Number(record.chapterNo ?? 0),
            score: Number(record.score ?? 0),
            hardFailed: record.hardFailed === true
          };
        })
      : [],
    recommendedAction: report.recommendedAction ?? ''
  };
}

function toBodyStrategySnapshotDTO(version: CreativeVersionRecord): BodyGenerationStrategySnapshotDTO {
  const content = toRecord(version.content);
  const metadata = toRecord(version.metadata);

  return {
    id: version.id,
    versionNo: version.versionNo,
    status: version.status,
    summary: version.summary ?? String(content.summary ?? ''),
    sourceTrialRunId: String(content.sourceTrialRunId ?? metadata.sourceTrialRunId ?? ''),
    selectedChapterOneVersionId: String(content.selectedChapterOneVersionId ?? metadata.selectedChapterOneVersionId ?? ''),
    writingStyle: String(content.writingStyle ?? ''),
    rhythm: String(content.rhythm ?? ''),
    protagonistGuidance: String(content.protagonistGuidance ?? ''),
    conflictGuidance: String(content.conflictGuidance ?? ''),
    endingHookRule: String(content.endingHookRule ?? ''),
    longMemory: toStringArray(content.longMemory),
    acceptedRisks: toStringArray(content.acceptedRisks),
    enhancedReviewRules: toStringArray(content.enhancedReviewRules),
    createdAt: version.createdAt.toISOString()
  };
}

function toBodyBatchDTO(batch: BodyBatchRecord): BodyBatchDTO {
  return {
    id: batch.id,
    taskId: batch.taskId,
    status: batch.status,
    statusText: getBodyBatchStatusText(batch.status),
    strategySnapshotId: batch.strategySnapshotId,
    strategySnapshotVersion: batch.strategySnapshotVersion,
    startChapterNo: batch.startChapterNo,
    endChapterNo: batch.endChapterNo,
    totalCount: batch.endChapterNo - batch.startChapterNo + 1,
    completedCount: batch.completedCount,
    failedCount: batch.failedCount,
    pendingCount: batch.pendingCount,
    failedChapterNo: batch.failedChapterNo,
    statusNote: batch.statusNote,
    chapterResults: batch.chapterResults.map(toBodyBatchChapterResultDTO),
    summary: toBodyBatchSummaryDTO(batch.summary),
    createdAt: batch.createdAt.toISOString()
  };
}

function toBodyBatchSummaryDTO(summary: BodyBatchSummaryRecord): BodyBatchSummaryDTO {
  return {
    id: summary.id,
    batchId: summary.batchId,
    conclusion: summary.conclusion,
    chapterResults: summary.chapterResults.map(toBodyBatchChapterResultDTO),
    riskTrend: summary.riskTrend,
    nextBatchNotes: summary.nextBatchNotes,
    riskChapterIds: summary.riskChapterIds,
    createdAt: summary.createdAt.toISOString()
  };
}

function toBodyBatchChapterResultDTO(result: BodyBatchChapterResultDTO): BodyBatchChapterResultDTO {
  return {
    ...result,
    riskLevel: result.riskLevel ?? RiskLevel.None
  };
}

function toLongTermMemoryDTO(memory: LongTermMemoryRecord): LongTermMemoryDTO {
  const metadata = toRecord(memory.metadata);

  return {
    id: memory.id,
    chapterId: memory.chapterId,
    sourceContentVersionId: memory.sourceContentVersionId,
    summary: memory.previousSummary ?? String(metadata.summary ?? ''),
    factsCannotContradict: memory.factsCannotContradict,
    unresolvedConflicts: memory.unresolvedConflicts,
    status: memory.status,
    staleLevel: memory.staleLevel,
    createdAt: memory.createdAt.toISOString()
  };
}

function toImpactCaseDTO(impactCase: ImpactCaseRecord): ImpactCaseDTO {
  const metadata = toRecord(impactCase.metadata);
  const status = toImpactVisibleStatus(impactCase.status, impactCase.impactLevel);
  const blocksFullReview =
    (impactCase.impactLevel === 'medium' || impactCase.impactLevel === 'severe') &&
    !['resolved', 'ignored', 'cancelled'].includes(status);

  return {
    id: impactCase.id,
    novelId: impactCase.novelId,
    sourceChapterId: impactCase.sourceObjectId ?? null,
    sourceOldVersionId: impactCase.sourceOldVersionId,
    sourceNewVersionId: impactCase.sourceNewVersionId,
    impactLevel: normalizeImpactLevel(impactCase.impactLevel),
    impactLevelText: getImpactLevelText(impactCase.impactLevel),
    status,
    statusText: getImpactStatusText(status),
    summary: impactCase.summary ?? '',
    changedFacts: toStringArray(metadata.changedFacts),
    affectedChapterIds: impactCase.affectedChapterIds,
    affectedVideoReferenceIds: impactCase.affectedVideoReferenceIds,
    recommendedHandling: typeof metadata.recommendedHandling === 'string' ? metadata.recommendedHandling : '',
    suggestedActions: impactCase.suggestedActions,
    blocksFullReview,
    createdAt: impactCase.createdAt.toISOString(),
    resolvedAt: impactCase.resolvedAt ? impactCase.resolvedAt.toISOString() : null
  };
}

function toImpactVisibleStatus(status: string, impactLevel: ImpactCaseRecord['impactLevel']): ImpactCaseVisibleStatus {
  if (status === 'resolved' || status === 'ignored' || status === 'cancelled') return status;
  if (status === 'processing' || status === 'handling') return 'handling';
  if (status === 'assessing') return 'assessing';
  if (impactLevel === 'medium' || impactLevel === 'severe') return 'waiting_decision';
  return 'resolved';
}

function normalizeImpactLevel(level: ImpactCaseRecord['impactLevel']): ImpactLevel {
  if (level === 'severe') return ImpactLevel.Severe;
  if (level === 'medium') return ImpactLevel.Medium;
  if (level === 'minor') return ImpactLevel.Minor;
  return ImpactLevel.None;
}

const BODY_BATCH_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/;

function normalizeBodyBatchIdempotencyKey(value: unknown) {
  if (typeof value !== 'string') {
    throw new BusinessError(ErrorCode.ValidationError, '批量正文请求必须携带幂等键');
  }
  const idempotencyKey = value.trim();
  if (!BODY_BATCH_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new BusinessError(ErrorCode.ValidationError, '批量正文幂等键格式不合法', {
      field: 'idempotencyKey',
      rule: '8-120 characters, starts with a letter or number, supports letters, numbers, dot, underscore, colon, and hyphen'
    });
  }

  return idempotencyKey;
}

function normalizeActionIdempotencyKey(value: unknown, actionText: string) {
  if (typeof value !== 'string') {
    throw new BusinessError(ErrorCode.ValidationError, `${actionText}请求必须携带幂等键`);
  }
  const idempotencyKey = value.trim();
  if (!BODY_BATCH_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new BusinessError(ErrorCode.ValidationError, `${actionText}幂等键格式不合法`, {
      field: 'idempotencyKey',
      rule: '8-120 characters, starts with a letter or number, supports letters, numbers, dot, underscore, colon, and hyphen'
    });
  }

  return idempotencyKey;
}

function createInternalBodyIdempotencyKey(prefix: string, objectId: string, requestId: string) {
  const rawKey = `${prefix}-${objectId}-${requestId}`
    .replace(/[^A-Za-z0-9._:-]/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '');

  return normalizeBodyBatchIdempotencyKey(rawKey.slice(0, 120).padEnd(8, '0'));
}

function createBodyBatchRequestFingerprint(
  request: GenerateBodyBatchRequest,
  strategySnapshot: CreativeVersionRecord,
  sourceVersionRefs: Record<string, unknown>,
  range: { startChapterNo: number; endChapterNo: number }
) {
  return {
    taskType: 'body_batch_generate',
    strategySnapshotId: request.strategySnapshotId,
    expectedStrategySnapshotVersion: request.expectedStrategySnapshotVersion,
    actualStrategySnapshotId: strategySnapshot.id,
    actualStrategySnapshotVersion: strategySnapshot.versionNo,
    requestedStartChapterNo: request.startChapterNo ?? null,
    requestedEndChapterNo: request.endChapterNo ?? null,
    startChapterNo: range.startChapterNo,
    endChapterNo: range.endChapterNo,
    sourceVersionRefs
  };
}

function isSameFingerprint(left: unknown, right: unknown) {
  return stableStringify(left) === stableStringify(right);
}

function isSameBodyRequestFingerprint(left: unknown, right: unknown) {
  const selectIdentity = (value: unknown) => {
    const record = toRecord(value);
    return {
      taskType: record.taskType,
      strategySnapshotId: record.strategySnapshotId,
      expectedStrategySnapshotVersion: record.expectedStrategySnapshotVersion,
      actualStrategySnapshotId: record.actualStrategySnapshotId,
      actualStrategySnapshotVersion: record.actualStrategySnapshotVersion,
      requestedStartChapterNo: record.requestedStartChapterNo ?? null,
      requestedEndChapterNo: record.requestedEndChapterNo ?? null
    };
  };
  return isSameFingerprint(selectIdentity(left), selectIdentity(right));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

const TRIAL_SELECTION_REASON_SECRET = /\b(?:authorization|cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret)\b\s*[:=]\s*["']?[^"',;\s]+|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\bsk-[A-Za-z0-9_-]{8,}/i;

function assertSafeTrialSelectionReason(reason: string) {
  if (!TRIAL_SELECTION_REASON_SECRET.test(reason)) return;
  throw new BusinessError(ErrorCode.ValidationError, '选择高风险试写候选的原因包含敏感信息，请移除密钥或 token 后重试。', {
    issues: [{ path: 'selectionReason', message: 'must not contain secrets' }]
  });
}

function getTrialCandidateRiskLevel(candidate: ChapterContentVersionRecord): RiskLevel {
  const metadata = toRecord(candidate.metadata);
  const riskLevel = metadata.riskLevel;
  return riskLevel === RiskLevel.High || riskLevel === RiskLevel.Blocking || riskLevel === RiskLevel.Medium || riskLevel === RiskLevel.Low || riskLevel === RiskLevel.None
    ? riskLevel
    : RiskLevel.Low;
}

function calculateBodyBatchRange(
  chapters: NovelChapterRecord[],
  request: Partial<Pick<GenerateBodyBatchRequest, 'startChapterNo' | 'endChapterNo'>>
) {
  const activeChapters = chapters.filter((chapter) => !chapter.deletedAt).sort((left, right) => left.chapterNo - right.chapterNo);
  const bodyChapters = activeChapters.filter((chapter) => chapter.chapterNo > 3);
  let startChapterNo = request.startChapterNo ?? null;
  let endChapterNo = request.endChapterNo ?? null;

  if (startChapterNo !== null && startChapterNo <= 3) {
    throw new BusinessError(ErrorCode.GateBlocked, '第 1-3 章来自已确认试写，不能通过批量正文重复生成');
  }

  if (startChapterNo === null) {
    const firstPending = bodyChapters.find((chapter) => !chapter.currentContentVersionId || chapter.mainStatus !== 'completed');
    startChapterNo = firstPending?.chapterNo ?? null;
  }

  if (startChapterNo !== null && endChapterNo === null) {
    const lastChapterNo = bodyChapters.at(-1)?.chapterNo ?? startChapterNo;
    endChapterNo = Math.min(startChapterNo + 4, lastChapterNo);
  }

  if (startChapterNo !== null && endChapterNo !== null) {
    if (endChapterNo < startChapterNo) {
      throw new BusinessError(ErrorCode.ValidationError, '批次章节范围不合法');
    }
    if (endChapterNo - startChapterNo + 1 > 5) {
      throw new BusinessError(ErrorCode.GateBlocked, '默认最多 5 章一批，不能一键无门禁生成全书');
    }
    const targetChapters = bodyChapters.filter((chapter) => chapter.chapterNo >= startChapterNo! && chapter.chapterNo <= endChapterNo!);
    if (targetChapters.length === 0) {
      throw new BusinessError(ErrorCode.GateBlocked, '没有可生成的正文章节');
    }
    const completedChapter = targetChapters.find((chapter) => chapter.currentContentVersionId && chapter.mainStatus === 'completed');
    if (completedChapter) {
      throw new BusinessError(ErrorCode.GateBlocked, '本批范围已有正式正文，不能通过批量入口重复覆盖；如需调整请进入章节详情重写', {
        chapterId: completedChapter.id,
        chapterNo: completedChapter.chapterNo
      });
    }
  }

  return {
    startChapterNo,
    endChapterNo,
    batchSize: startChapterNo && endChapterNo ? endChapterNo - startChapterNo + 1 : 0
  };
}

function calculateBodyBatchPreviewRange(chapters: NovelChapterRecord[]) {
  const bodyChapters = chapters
    .filter((chapter) => !chapter.deletedAt && chapter.chapterNo > 3)
    .sort((left, right) => left.chapterNo - right.chapterNo);
  const startChapterNo = bodyChapters.find((chapter) => !chapter.currentContentVersionId)?.chapterNo ?? null;
  const lastChapterNo = bodyChapters.at(-1)?.chapterNo ?? startChapterNo;
  const endChapterNo = startChapterNo === null ? null : Math.min(startChapterNo + 4, lastChapterNo ?? startChapterNo);

  return {
    startChapterNo,
    endChapterNo,
    batchSize: startChapterNo && endChapterNo ? endChapterNo - startChapterNo + 1 : 0
  };
}

async function findPreviousContentVersion(
  repository: NovelRepository,
  tenantId: string,
  novelId: string,
  chapters: NovelChapterRecord[],
  startChapterNo: number | null
) {
  if (!startChapterNo) return null;
  const previousChapter = chapters
    .filter((chapter) => chapter.chapterNo < startChapterNo && chapter.currentContentVersionId)
    .sort((left, right) => right.chapterNo - left.chapterNo)[0];

  return previousChapter?.currentContentVersionId
    ? repository.findChapterContentVersionById(tenantId, novelId, previousChapter.currentContentVersionId)
    : null;
}

function createDraftLikeContentVersion(chapter: NovelChapterRecord, draft: BodyChapterDraft): ChapterContentVersionRecord {
  return {
    id: `draft_${chapter.id}`,
    tenantId: chapter.tenantId,
    novelId: chapter.novelId,
    chapterId: chapter.id,
    versionNo: 0,
    status: VersionStatus.Current,
    staleLevel: StaleLevel.None,
    sourceType: 'mock_ai',
    sourceTaskId: null,
    sourceVersionRefs: {},
    rewriteReason: null,
    content: draft.content,
    wordCount: countChineseWords(draft.content),
    summary: draft.summary,
    reviewScore: draft.scoring.totalScore,
    decisionRecordId: null,
    createdBy: null,
    createdAt: new Date(),
    metadata: {
      chapterNo: chapter.chapterNo,
      title: chapter.title
    }
  };
}

function createBodySourceRefs(novel: NovelRecord, strategySnapshot: CreativeVersionRecord) {
  const sourceRefs = toRecord(strategySnapshot.sourceVersionRefs);

  return {
    currentDirectionVersionId: novel.currentDirectionVersionId,
    currentSettingVersionId: novel.currentSettingVersionId,
    currentOutlineVersionId: novel.currentOutlineVersionId,
    currentStageOutlineVersionId: novel.currentStageOutlineVersionId,
    currentChapterPlanVersionId: novel.currentChapterPlanVersionId,
    trialRunId: sourceRefs.trialRunId,
    selectedChapterOneCandidateId: sourceRefs.selectedChapterOneCandidateId,
    strategySnapshotId: strategySnapshot.id,
    strategySnapshotVersion: strategySnapshot.versionNo,
    creationStage: NovelCreationStage.Body
  };
}

function createFullReviewSourceRefs(novel: NovelRecord, chapters: NovelChapterRecord[]) {
  return {
    currentDirectionVersionId: novel.currentDirectionVersionId,
    currentSettingVersionId: novel.currentSettingVersionId,
    currentOutlineVersionId: novel.currentOutlineVersionId,
    currentStageOutlineVersionId: novel.currentStageOutlineVersionId,
    currentChapterPlanVersionId: novel.currentChapterPlanVersionId,
    chapterContentVersionIds: chapters.map((chapter) => ({
      chapterId: chapter.id,
      chapterNo: chapter.chapterNo,
      currentContentVersionId: chapter.currentContentVersionId,
      currentFeatureCardVersionId: chapter.currentFeatureCardVersionId,
      currentReviewReportId: chapter.currentReviewReportId
    }))
  };
}

function createVideoReadinessConfirmRequestFingerprint(request: ConfirmVideoReadinessRequest, sourceVersionRefs: Record<string, unknown>) {
  return {
    taskType: 'video_readiness_confirm',
    completionDecisionId: request.completionDecisionId,
    readinessCheckId: request.readinessCheckId,
    checkVersion: request.checkVersion,
    expectedNovelVersion: request.expectedNovelVersion ?? null,
    sourceVersionRefs
  };
}

function ensureFullReviewSourceRefsFresh(gate: FullReviewGateRecord, expectedRefs: Record<string, unknown>) {
  if (gate.isStale) {
    throw new BusinessError(ErrorCode.CandidateStale, gate.staleReason ?? '全书审稿来源已过期，请重新审稿');
  }
  if (!isSameFingerprint(gate.sourceVersionRefs, expectedRefs)) {
    throw new BusinessError(ErrorCode.CandidateStale, '方向、设定、大纲、章节目录或章节正文版本已变化，旧全书审稿不能继续确认');
  }
}

function isEnhancedReviewEnabled(strategySnapshot: CreativeVersionRecord) {
  const content = toRecord(strategySnapshot.content);

  return toStringArray(content.acceptedRisks).length > 0 || toStringArray(content.enhancedReviewRules).length > 0;
}

function toSummaryCompare(
  value: unknown,
  currentContent: ChapterContentVersionRecord | null,
  candidate: ChapterContentVersionRecord
): ChapterSummaryCompareDTO {
  const record = toRecord(value);
  if (typeof record.currentSummary === 'string' && typeof record.candidateSummary === 'string') {
    return {
      currentSummary: record.currentSummary,
      candidateSummary: record.candidateSummary,
      benefit: String(record.benefit ?? ''),
      newRisks: toStringArray(record.newRisks),
      possibleImpact: String(record.possibleImpact ?? ''),
      aiSuggestion: String(record.aiSuggestion ?? '')
    };
  }

  return {
    currentSummary: currentContent?.summary ?? '',
    candidateSummary: candidate.summary ?? '',
    benefit: '候选版本优化了本章表达和钩子。',
    newRisks: [],
    possibleImpact: '预计主要影响本章表达。',
    aiSuggestion: '采用前请确认摘要对比和影响提示。'
  };
}

function toChapterWorkbenchDTO(record: {
  chapter: NovelChapterRecord;
  currentContent: ChapterContentVersionRecord | null;
  featureCard: ChapterFeatureCardRecord | null;
  reviewReport: ReviewReportRecord | null;
  candidateVersions: ChapterContentVersionRecord[];
  longTermMemory: LongTermMemoryRecord | null;
  impactCases: ImpactCaseRecord[];
  recentTask: GenerationTaskRecord | null;
}, novel: NovelRecord): ChapterWorkbenchDTO {
  const currentContent = record.currentContent ? toTrialChapterCandidateDTO(record.currentContent, record.chapter) : null;
  const candidateCompares = Object.fromEntries(
    record.candidateVersions.map((version) => [
      version.id,
      toSummaryCompare(toRecord(version.metadata).summaryCompare, record.currentContent, version)
    ])
  );
  const openBlockingImpactCase = record.impactCases.find((impactCase) => toImpactCaseDTO(impactCase).blocksFullReview);
  const actionableCandidate = record.candidateVersions.find((version) => version.status === VersionStatus.Candidate && typeof toRecord(version.metadata).trialRunId !== 'string');
  const recommendedAction = novel.creationStage === NovelCreationStage.Trial
    ? createLocalRecommendedAction({
        type: currentContent ? 'view_trial_review' : 'generate_trial',
        label: currentContent ? '查看试写总评' : '生成试写',
        reasonText: currentContent ? '章节已有试写正文，可查看试写总评和审稿问题。' : '章节还没有试写正文，需要先生成试写候选。',
        taskType: currentContent ? null : 'trial_writing_generate'
      })
    : openBlockingImpactCase
    ? createLocalRecommendedAction({
        type: 'resolve_impact_case',
        label: '处理影响案例',
        reasonText: openBlockingImpactCase.summary ?? '影响案例未关闭前，不能进入全书审稿。',
        taskType: 'chapter_impact_assess'
      })
    : actionableCandidate
      ? createLocalRecommendedAction({
          type: 'adopt_chapter_candidate',
          label: '采用候选版本',
          reasonText: '本章存在重写候选，采用前请查看摘要对比和影响提示。',
          confirmRequired: true,
          taskType: 'chapter_impact_assess'
        })
      : currentContent
        ? createLocalRecommendedAction({
            type: 'rewrite_chapter',
            label: '生成重写候选',
            reasonText: '当前章节已有正式正文；如需修复问题，请先生成候选，不会直接覆盖正式正文。',
            confirmRequired: true,
            taskType: 'chapter_body_rewrite'
          })
        : createLocalRecommendedAction({
            type: 'wait_body_batch',
            label: '等待批量生成',
            reasonText: '本章还没有正文，请回到正文生成区按批次生成。',
            disabled: true,
            disabledReason: '正文需从批量生成区进入',
            taskType: 'body_batch_generate'
          });

  return {
    novelId: novel.id,
    chapter: toNovelChapterDTO(record.chapter),
    currentContent,
    featureCard: record.featureCard ? toChapterFeatureCardDTO(record.featureCard) : null,
    reviewReport: record.reviewReport ? toChapterReviewReportDTO(record.reviewReport) : null,
    reviewIssues: record.reviewReport ? toReviewIssues(record.reviewReport.issueCards) : [],
    candidateVersions: record.candidateVersions.map((version) => toTrialChapterCandidateDTO(version, record.chapter)),
    candidateCompares,
    longTermMemory: record.longTermMemory ? toLongTermMemoryDTO(record.longTermMemory) : null,
    impactCases: record.impactCases.map(toImpactCaseDTO),
    recentTask: record.recentTask ? toRecentTaskSummaryDTO(record.recentTask) : null,
    recommendedAction
  };
}

function toDirectionDraft(version: CreativeVersionRecord): DirectionCandidateDraft {
  const candidate = toDirectionCandidateDTO(version);

  return {
    title: candidate.title,
    summary: candidate.summary,
    content: candidate.content,
    score: candidate.score,
    marketScore: candidate.marketScore,
    riskLevel: candidate.riskLevel,
    riskTags: candidate.riskTags,
    recommendedReason: candidate.recommendedReason
  };
}

function normalizeTextItems(items: string[]) {
  return items.map((item) => item.trim()).filter(Boolean);
}

function toMetadata(value: unknown) {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    return {
      marketScore: typeof record.marketScore === 'number' ? record.marketScore : Number(record.marketScore ?? 0),
      riskTags: Array.isArray(record.riskTags) ? record.riskTags.filter((item): item is string => typeof item === 'string') : [],
      recommendedReason: typeof record.recommendedReason === 'string' ? record.recommendedReason : ''
    };
  }

  return {
    marketScore: 0,
    riskTags: [],
    recommendedReason: ''
  };
}

function toDirectionContent(value: unknown): DirectionCandidateContentDTO {
  if (value && typeof value === 'object') {
    const content = value as Partial<DirectionCandidateContentDTO>;

    return {
      title: typeof content.title === 'string' ? content.title : '',
      logline: typeof content.logline === 'string' ? content.logline : '',
      coreHook: typeof content.coreHook === 'string' ? content.coreHook : '',
      audienceAppeal: typeof content.audienceAppeal === 'string' ? content.audienceAppeal : '',
      videoPotential: typeof content.videoPotential === 'string' ? content.videoPotential : '',
      sellingPoints: Array.isArray(content.sellingPoints) ? content.sellingPoints.filter((item): item is string => typeof item === 'string') : [],
      riskTags: Array.isArray(content.riskTags) ? content.riskTags.filter((item): item is string => typeof item === 'string') : [],
      recommendation: typeof content.recommendation === 'string' ? content.recommendation : ''
    };
  }

  return {
    title: '',
    logline: '',
    coreHook: '',
    audienceAppeal: '',
    videoPotential: '',
    sellingPoints: [],
    riskTags: [],
    recommendation: ''
  };
}

function toStructureContent(value: unknown): StructureAssetContentDTO {
  if (value && typeof value === 'object') {
    const content = value as Partial<StructureAssetContentDTO>;

    return {
      title: typeof content.title === 'string' ? content.title : '',
      summary: typeof content.summary === 'string' ? content.summary : '',
      sections: Array.isArray(content.sections)
        ? content.sections.map((section) => ({
            title: typeof section.title === 'string' ? section.title : '',
            body: typeof section.body === 'string' ? section.body : '',
            items: Array.isArray(section.items) ? section.items.filter((item): item is string => typeof item === 'string') : []
          }))
        : [],
      stages: Array.isArray(content.stages)
        ? content.stages.map((stage) => ({
            stageIndex: Number(stage.stageIndex ?? 0),
            title: typeof stage.title === 'string' ? stage.title : '',
            chapterRange: typeof stage.chapterRange === 'string' ? stage.chapterRange : '',
            goal: typeof stage.goal === 'string' ? stage.goal : '',
            conflict: typeof stage.conflict === 'string' ? stage.conflict : '',
            payoff: typeof stage.payoff === 'string' ? stage.payoff : ''
          }))
        : [],
      chapters: Array.isArray(content.chapters)
        ? content.chapters.map((chapter) => ({
            chapterNo: Number(chapter.chapterNo ?? 0),
            stageIndex: Number(chapter.stageIndex ?? 0),
            title: typeof chapter.title === 'string' ? chapter.title : '',
            wordTarget: Number(chapter.wordTarget ?? 0),
            goal: typeof chapter.goal === 'string' ? chapter.goal : '',
            conflict: typeof chapter.conflict === 'string' ? chapter.conflict : '',
            hook: typeof chapter.hook === 'string' ? chapter.hook : ''
          }))
        : [],
      riskTags: Array.isArray(content.riskTags) ? content.riskTags.filter((item): item is string => typeof item === 'string') : [],
      recommendation: typeof content.recommendation === 'string' ? content.recommendation : ''
    };
  }

  return {
    title: '',
    summary: '',
    sections: [],
    stages: [],
    chapters: [],
    riskTags: [],
    recommendation: ''
  };
}

function toCurrentAssetsDTO(novel: NovelRecord, directionVersions: CreativeVersionRecord[], structureVersions: CreativeVersionRecord[]) {
  return {
    direction: directionVersions.find((version) => version.id === novel.currentDirectionVersionId) ? toDirectionCandidateDTO(directionVersions.find((version) => version.id === novel.currentDirectionVersionId)!) : null,
    setting: structureVersions.find((version) => version.id === novel.currentSettingVersionId) ? toStructureAssetDTO(structureVersions.find((version) => version.id === novel.currentSettingVersionId)!) : null,
    outline: structureVersions.find((version) => version.id === novel.currentOutlineVersionId) ? toStructureAssetDTO(structureVersions.find((version) => version.id === novel.currentOutlineVersionId)!) : null,
    stageOutline: structureVersions.find((version) => version.id === novel.currentStageOutlineVersionId)
      ? toStructureAssetDTO(structureVersions.find((version) => version.id === novel.currentStageOutlineVersionId)!)
      : null,
    chapterPlan: structureVersions.find((version) => version.id === novel.currentChapterPlanVersionId)
      ? toStructureAssetDTO(structureVersions.find((version) => version.id === novel.currentChapterPlanVersionId)!)
      : null
  };
}

function getCurrentCreativeAssetRecords(novel: NovelRecord, directionVersions: CreativeVersionRecord[], structureVersions: CreativeVersionRecord[]) {
  return {
    direction: directionVersions.find((version) => version.id === novel.currentDirectionVersionId) ?? null,
    setting: structureVersions.find((version) => version.id === novel.currentSettingVersionId) ?? null,
    outline: structureVersions.find((version) => version.id === novel.currentOutlineVersionId) ?? null,
    stageOutline: structureVersions.find((version) => version.id === novel.currentStageOutlineVersionId) ?? null
  };
}

function getStructureTaskType(objectType: StructureAssetType) {
  if (objectType === 'setting') return 'novel_setting_generate';
  if (objectType === 'outline') return 'novel_outline_generate';
  if (objectType === 'stage_outline') return 'stage_outline_generate';
  return 'chapter_plan_generate';
}

type StructureGenerateAction = 'setting_generate' | 'outline_generate' | 'stage_outline_generate' | 'chapter_plan_generate';

function getStructureGenerateAction(objectType: StructureAssetType): StructureGenerateAction {
  if (objectType === 'setting') return 'setting_generate';
  if (objectType === 'outline') return 'outline_generate';
  if (objectType === 'stage_outline') return 'stage_outline_generate';
  return 'chapter_plan_generate';
}

function createStructureSourceRefs(novel: NovelRecord, objectType: StructureAssetType) {
  return {
    currentDirectionVersionId: novel.currentDirectionVersionId,
    currentSettingVersionId: novel.currentSettingVersionId,
    currentOutlineVersionId: novel.currentOutlineVersionId,
    currentStageOutlineVersionId: novel.currentStageOutlineVersionId,
    objectType
  };
}

function getCurrentVersionId(novel: NovelRecord, objectType: StructureAssetType) {
  if (objectType === 'setting') return novel.currentSettingVersionId;
  if (objectType === 'outline') return novel.currentOutlineVersionId;
  if (objectType === 'stage_outline') return novel.currentStageOutlineVersionId;
  return novel.currentChapterPlanVersionId;
}

function getAffectedObjects(objectType: StructureAssetType) {
  if (objectType === 'setting') return ['setting', 'outline', 'stage_outline', 'chapter_plan'];
  if (objectType === 'outline') return ['outline', 'stage_outline', 'chapter_plan'];
  if (objectType === 'stage_outline') return ['stage_outline', 'chapter_plan'];
  return ['chapter_plan', 'chapter'];
}

function toStructureTaskDTO(task: GenerationTaskRecord): StructureTaskDTO {
  const safe = toRecentTaskSummaryDTO(task);
  return {
    id: task.id,
    taskType: task.taskType,
    status: task.status,
    statusText: getTaskStatusText(task.status),
    progress: task.progress,
    currentStep: safe.currentStep,
    errorCode: safe.errorCode,
    errorMessage: safe.errorMessage,
    resultVersionIds: task.resultVersionIds
  };
}

function normalizeTrialChapterCount(value: number | undefined) {
  if (value === 2 || value === 3 || value === 5) return value;
  return 3;
}

function normalizeChapterWordTargetUpdates(request: UpdateChapterWordTargetsRequest, novel: NovelRecord) {
  if (!Array.isArray(request.updates) || request.updates.length === 0) {
    throw new BusinessError(ErrorCode.ValidationError, '请至少提供一个章节目标字数');
  }
  const minAllowed = Math.max(100, Math.floor(novel.chapterWordMin * 0.5));
  const maxAllowed = Math.min(30000, Math.ceil(novel.chapterWordMax * 1.8));
  const seen = new Set<number>();

  return request.updates.map((update) => {
    const chapterNo = Number(update.chapterNo);
    const wordTarget = Number(update.wordTarget);
    if (!Number.isInteger(chapterNo) || chapterNo < 1 || chapterNo > novel.chapterLimit) {
      throw new BusinessError(ErrorCode.ValidationError, '章节序号不合法');
    }
    if (seen.has(chapterNo)) {
      throw new BusinessError(ErrorCode.ValidationError, '章节目标字数不能重复提交同一章');
    }
    seen.add(chapterNo);
    if (!Number.isInteger(wordTarget) || wordTarget < minAllowed || wordTarget > maxAllowed) {
      throw new BusinessError(ErrorCode.ValidationError, `目标字数需在 ${minAllowed}-${maxAllowed} 之间`);
    }
    return { chapterNo, wordTarget };
  });
}

function createTrialSourceRefs(novel: NovelRecord) {
  return {
    currentDirectionVersionId: novel.currentDirectionVersionId,
    currentSettingVersionId: novel.currentSettingVersionId,
    currentOutlineVersionId: novel.currentOutlineVersionId,
    currentStageOutlineVersionId: novel.currentStageOutlineVersionId,
    currentChapterPlanVersionId: novel.currentChapterPlanVersionId,
    objectType: 'trial_run'
  };
}

function createBodyStrategySnapshotContent(
  trialRun: TrialRunRecord,
  trialReview: ReviewReportRecord | null,
  selectedCandidate: ChapterContentVersionRecord
) {
  const reviewMetadata = toRecord(trialReview?.metadata);
  const acceptedRisks = reviewMetadata.requiresRiskConfirmation === true ? ['试写存在低分或节奏风险，用户已确认继续。'] : [];

  return {
    summary: '基于前三章试写结果沉淀批量正文生成策略，供后续任务包使用。',
    sourceTrialRunId: trialRun.id,
    selectedChapterOneVersionId: selectedCandidate.id,
    writingStyle: '强压迫开局，三段内给出可见反击线索，避免万能系统直接替主角解决问题。',
    rhythm: '每章先承接上一章钩子，再推进一个明确目标，结尾保留下一章悬念。',
    protagonistGuidance: '主角胜利依赖选择、证据和行动，情绪表达服务反击节奏。',
    conflictGuidance: '反派压迫需要逐步升级但避免重复羞辱，冲突必须推动主线证据链。',
    endingHookRule: '每章结尾保留一个可视化动作或证据线索，便于短视频拆条。',
    longMemory: ['旧码头仓库线索', '母亲公司旧案', '主角不能使用万能能力'],
    acceptedRisks,
    enhancedReviewRules: ['复审人物一致性', '复审主线连续性', '复审第1章选定开篇风格是否延续', '低分章节不得静默进入批量正文']
  };
}

function createProcessingTrialRun(task: GenerationTaskRecord, novel: NovelRecord, chapterCount: number): TrialRunRecord {
  return {
    id: `pending_${task.id}`,
    tenantId: task.tenantId,
    novelId: novel.id,
    chapterPlanVersionId: novel.currentChapterPlanVersionId,
    trialChapterCount: chapterCount,
    status: 'generating_chapter1_candidates',
    totalScore: null,
    trialResult: null,
    reviewReportId: null,
    policyProfileVersionId: novel.policyProfileVersionId,
    sourceTaskId: task.id,
    confirmedAt: null,
    confirmedBy: null,
    forceReason: null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    metadata: { currentStep: task.currentStep }
  };
}

function createVirtualTrialTask(trialRun: TrialRunRecord, novel: NovelRecord): GenerationTaskRecord {
  const status =
    trialRun.status === 'blocked' || trialRun.status === 'followup_failed'
      ? TaskStatus.Failed
      : trialRun.status === 'followup_generating'
        ? TaskStatus.Processing
        : TaskStatus.WaitingConfirmation;

  return {
    id: trialRun.sourceTaskId ?? `trial_${trialRun.id}`,
    tenantId: trialRun.tenantId,
    novelId: trialRun.novelId,
    taskType: 'trial_writing_generate',
    objectType: 'trial_run',
    objectId: trialRun.id,
    status,
    statusNote: trialRun.status,
    progress: status === TaskStatus.Processing ? 18 : 100,
    currentStep: getTrialRunStatusText(trialRun.status),
    triggerSource: 'manual',
    sourceVersionRefs: createTrialSourceRefs(novel),
    conflictScope: 'novel_trial',
    conflictKey: novel.id,
    idempotencyToken: null,
    requestHash: null,
    activeClaimKey: null,
    inputSummary: '试写任务',
    outputSummary: trialRun.trialResult,
    resultVersionIds: [],
    retryOfTaskId: null,
    failureCategory: status === TaskStatus.Failed ? 'model_generation_failed' : null,
    errorCode: null,
    errorMessage: null,
    resultObjectType: 'trial_run',
    resultObjectId: trialRun.id,
    userAcceptedResult: false,
    cancelRequestedAt: null,
    cancelReason: null,
    startedAt: trialRun.createdAt,
    finishedAt: status === TaskStatus.Processing ? null : trialRun.updatedAt,
    createdBy: null,
    createdAt: trialRun.createdAt,
    updatedAt: trialRun.updatedAt,
    metadata: {}
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function getMetadataString(value: unknown, key: string) {
  const record = toRecord(value);

  return typeof record[key] === 'string' ? record[key] : null;
}

function reusedTaskInProgress(task: GenerationTaskRecord) {
  return new BusinessError(ErrorCode.ConflictTaskExists, '该请求已复用原生成任务，请按 taskId 查询当前状态。', {
    existingTaskId: task.id,
    taskType: task.taskType,
    status: task.status
  });
}

function toQualityScoring(value: unknown, fallbackScore: number): QualityScoringDTO {
  const record = toRecord(value);
  if (typeof record.scoringStrategyVersion === 'string') {
    return value as QualityScoringDTO;
  }

  return {
    scoringStrategyVersion: 'trial-opening-score-v1',
    totalScore: fallbackScore,
    gateResult: fallbackScore < 70 ? 'hard_fail' : fallbackScore < 78 ? 'warning' : 'pass',
    gateResultText: fallbackScore < 70 ? '硬门槛未通过' : fallbackScore < 78 ? '有风险，需确认' : '通过',
    dimensions: [],
    weights: {},
    evidence: [],
    penalties: [],
    hardFailure: fallbackScore < 70,
    hardFailureReasons: fallbackScore < 70 ? ['综合分低于硬门槛'] : []
  };
}

function toReviewIssues(value: unknown): ChapterReviewIssueDTO[] {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    const record = toRecord(item);
    const severity = record.severity === 'blocking' || record.severity === 'warning' || record.severity === 'info' ? record.severity : 'info';

    return {
      severity,
      dimension: String(record.dimension ?? 'general'),
      message: String(record.message ?? ''),
      suggestion: String(record.suggestion ?? '')
    };
  });
}

function getTrialRunStatusText(status: string) {
  if (status === 'waiting_chapter1_selection') return '待选择第1章候选';
  if (status === 'followup_generating') return '正在生成第2-3章和试写总评';
  if (status === 'followup_failed') return '继续试写失败';
  if (status === 'review_ready') return '试写待确认';
  if (status === 'blocked') return '试写被阻塞';
  if (status === 'confirmed') return '试写已确认';
  if (status === 'returned_upstream') return '已返回上游调整';
  return '试写处理中';
}

function getTrialResultText(result: TrialReviewDTO['trialResult']) {
  if (result === 'pass') return '试写通过';
  if (result === 'pass_with_suggestions') return '建议优化后风险继续';
  if (result === 'return_upstream') return '建议返回上游';
  return '硬失败阻塞';
}

function firstSentence(content: string) {
  return content.split(/[。！？]/)[0] ? `${content.split(/[。！？]/)[0]}。` : content.slice(0, 80);
}

function getTaskErrorCode(error: unknown) {
  if (error instanceof BusinessError) return error.code;
  if (error instanceof Error && error.name) return error.name;
  return ErrorCode.InternalError;
}

function getTaskErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return '模型生成失败，请稍后重试';
}

function getBodyBatchFailureCategory(error: unknown, providerCompleted: boolean) {
  if (error instanceof BusinessError && error.code === ErrorCode.ConfigMissing) return 'not_implemented';
  if (providerCompleted) return 'save_failed';
  if (error instanceof BusinessError && error.code === ErrorCode.ValidationError) return 'output_parse_failed';
  return 'provider_error';
}

function getTaskStatusText(status: TaskStatus | string) {
  if (status === TaskStatus.WaitingConfirmation) return '待确认结果';
  if (status === TaskStatus.Completed) return '已完成';
  if (status === TaskStatus.Processing) return '正在处理';
  if (status === TaskStatus.Failed) return '失败';
  if (status === TaskStatus.Cancelled) return '已取消';
  return '已加入队列';
}

function getFullReviewGateText(result: string) {
  if (result === 'pass') return '通过';
  if (result === 'warning') return '有风险但可继续';
  if (result === 'forced_pass') return '已强制通过';
  return '阻塞';
}

function getVideoReadinessStatusText(status: string) {
  if (status === 'ready') return '已进入待视频化';
  if (status === 'candidate') return '待确认视频化';
  return '暂不可视频化';
}

function getBodyBatchStatusText(status: string) {
  if (status === 'completed') return '本批完成';
  if (status === 'paused') return '本批暂停';
  if (status === 'cancelled') return '已取消';
  return '正文批次处理中';
}

function getImpactLevelText(level: ImpactCaseRecord['impactLevel']) {
  if (level === 'severe') return '严重影响';
  if (level === 'medium') return '中等影响';
  if (level === 'minor') return '轻微影响';
  return '无影响';
}

function getImpactStatusText(status: ImpactCaseVisibleStatus) {
  if (status === 'assessing') return '评估中';
  if (status === 'waiting_decision') return '等待处理';
  if (status === 'handling') return '处理中';
  if (status === 'resolved') return '已处理';
  if (status === 'ignored') return '已忽略';
  return '已取消';
}

function bindTrialChapterOneCandidates(chapters: NovelChapterRecord[], candidates: TrialChapterCandidateDraft[]): TrialChapterCandidateDraft[] { const chapter = chapters.find((item) => item.chapterNo === 1); if (!chapter) throw new BusinessError(ErrorCode.ValidationError, '缺少权威第1章，无法保存试写候选。'); if (candidates.some((candidate) => candidate.chapterId !== chapter.id || candidate.chapterNo !== chapter.chapterNo)) throw new BusinessError(ErrorCode.ValidationError, '模型返回的首章标识与权威章节不一致。'); return candidates.map((candidate) => ({ ...candidate, chapterId: chapter.id, chapterNo: chapter.chapterNo })); }
function bindGeneratedBodyChapter(chapter: NovelChapterRecord, draft: BodyChapterProviderDraft): BodyChapterDraft {
  const providerChapter = draft.chapter;
  if (providerChapter.id !== chapter.id || providerChapter.chapterNo !== chapter.chapterNo) {
    throw new BusinessError(ErrorCode.ValidationError, '模型返回的章节标识与请求章节不一致。');
  }
  if (draft.featureCard.chapterId !== chapter.id) throw new BusinessError(ErrorCode.ValidationError, '模型返回的章节特性卡与请求章节不一致。');
  return {
    ...constructTrialFollowupChapterDraft(chapter, draft),
    memory: {
      previousSummary: draft.memory.previousSummary,
      characterStates: [...draft.memory.characterStates],
      relationshipStates: [...draft.memory.relationshipStates],
      locations: [...draft.memory.locations],
      organizations: [...draft.memory.organizations],
      items: [...draft.memory.items],
      plantedForeshadowing: [...draft.memory.plantedForeshadowing],
      resolvedForeshadowing: [...draft.memory.resolvedForeshadowing],
      unresolvedConflicts: [...draft.memory.unresolvedConflicts],
      newSettings: [...draft.memory.newSettings],
      factsCannotContradict: [...draft.memory.factsCannotContradict],
      metadata: {
        scoringStrategyVersion: draft.memory.metadata.scoringStrategyVersion,
        hardFailed: draft.memory.metadata.hardFailed,
        summary: draft.memory.metadata.summary
      }
    }
  };
}

function bindTrialFollowupChapters(
  chapters: NovelChapterRecord[],
  drafts: TrialFollowupChapterProviderDraft[],
  review: { totalScore: number; trialResult: string; allowNextStep: boolean; chapterScores: Array<{ chapterNo: number; score: number; hardFailed: boolean }> }
): TrialFollowupChapterDraft[] {
  const chaptersById = new Map(chapters.map((chapter) => [chapter.id, chapter])); const seenChapterIds = new Set<string>();
  const blocked = review.trialResult === 'blocked'; const allowsNext = review.trialResult === 'pass' || review.trialResult === 'pass_with_suggestions'; const failedDrafts = drafts.filter((draft) => draft.hardFailed); const failedScores = review.chapterScores.filter((score) => score.hardFailed);
  const failedIndex = blocked && failedDrafts.length === 1 ? chapters.findIndex((chapter) => chapter.id === failedDrafts[0].chapter.id) : -1;
  const expected = blocked && failedIndex >= 0 ? chapters.slice(0, failedIndex + 1) : chapters; const expectedChapterNos = expected.map((chapter) => chapter.chapterNo); const scoreChapterNos = review.chapterScores.map((score) => score.chapterNo); const scoreChapterSet = new Set(scoreChapterNos); const chapterScoresByNo = new Map(review.chapterScores.map((score) => [score.chapterNo, score])); if ([review.totalScore, ...review.chapterScores.map((score) => score.score)].some((score) => !Number.isFinite(score) || score < 0 || score > 100) || review.totalScore !== Math.round(review.chapterScores.reduce((sum, score) => sum + score.score, 0) / review.chapterScores.length)) throw new BusinessError(ErrorCode.ValidationError, '模型试写评分不合法。');
  if (scoreChapterSet.size !== expected.length || scoreChapterNos.length !== expected.length || expectedChapterNos.some((chapterNo) => !scoreChapterSet.has(chapterNo))) throw new BusinessError(ErrorCode.ValidationError, '模型试写评分章节集合不完整。');
  if (!['pass', 'pass_with_suggestions', 'return_upstream', 'blocked'].includes(review.trialResult) || review.allowNextStep !== allowsNext || (blocked && (failedDrafts.length !== 1 || failedScores.length !== 1 || failedIndex < 0 || failedDrafts[0].chapter.chapterNo !== chapters[failedIndex]?.chapterNo || failedScores[0].chapterNo !== chapters[failedIndex]?.chapterNo)) || (!blocked && (failedDrafts.length > 0 || failedScores.length > 0))) throw new BusinessError(ErrorCode.ValidationError, '模型失败章声明与返回章节不一致。');
  const bound = drafts.map((draft) => {
    const providerChapter = draft.chapter;
    const chapter = chaptersById.get(providerChapter.id);
    if (!chapter || chapter.chapterNo !== providerChapter.chapterNo) throw new BusinessError(ErrorCode.ValidationError, '模型返回了不属于当前试写范围的章节。');
    if (seenChapterIds.has(chapter.id)) throw new BusinessError(ErrorCode.ValidationError, '模型重复返回了同一试写章节。');
    if (draft.featureCard.chapterId !== chapter.id) throw new BusinessError(ErrorCode.ValidationError, '模型返回的章节特性卡与试写章节不一致。');
    const chapterScore = chapterScoresByNo.get(providerChapter.chapterNo);
    if (!chapterScore || chapterScore.score !== draft.scoring.totalScore || draft.scoring.totalScore !== draft.review.totalScore || chapterScore.hardFailed !== draft.hardFailed || draft.scoring.hardFailure !== draft.hardFailed || (typeof draft.review.metadata.hardFailed === 'boolean' && draft.review.metadata.hardFailed !== draft.hardFailed)) throw new BusinessError(ErrorCode.ValidationError, '模型试写章节评分或硬失败标记不一致。');
    seenChapterIds.add(chapter.id);
    return constructTrialFollowupChapterDraft(chapter, draft);
  });
  if (bound.length !== expected.length || expected.some((chapter) => !seenChapterIds.has(chapter.id))) {
    throw new BusinessError(ErrorCode.ValidationError, '模型未完整返回当前试写范围章节。');
  }
  return bound;
}

function constructTrialFollowupChapterDraft(
  chapter: NovelChapterRecord,
  draft: TrialFollowupChapterProviderDraft
): TrialFollowupChapterDraft {
  const score = draft.scoring.totalScore; const reviewScore = draft.review.totalScore; const reviewHardFailed = draft.review.metadata.hardFailed; const scoringReasons = draft.scoring.hardFailureReasons; const subScores = Object.values(draft.review.subScores);
  if (!Number.isFinite(score) || score < 0 || score > 100 || typeof reviewScore !== 'number' || !Number.isFinite(reviewScore) || reviewScore < 0 || reviewScore > 100 || score !== reviewScore || draft.scoring.dimensions.some((dimension) => !Number.isFinite(dimension.score) || dimension.score < 0 || dimension.score > 100) || subScores.some((subScore) => typeof subScore === 'number' && (!Number.isFinite(subScore) || subScore < 0 || subScore > 100)) || draft.scoring.scoringStrategyVersion !== draft.review.metadata.scoringStrategyVersion || draft.review.subScores.scoringStrategyVersion !== draft.scoring.scoringStrategyVersion) throw new BusinessError(ErrorCode.ValidationError, '模型章节评分不一致。');
  if (draft.hardFailed !== draft.scoring.hardFailure || (typeof reviewHardFailed === 'boolean' && reviewHardFailed !== draft.hardFailed) || !['pass', 'warning', 'hard_fail'].includes(draft.scoring.gateResult) || (draft.scoring.gateResult === 'hard_fail') !== draft.hardFailed || draft.review.allowNextStep === draft.hardFailed || (draft.hardFailureReasons.length > 0) !== draft.hardFailed || draft.hardFailureReasons.length !== scoringReasons.length || draft.hardFailureReasons.some((reason, index) => reason !== scoringReasons[index])) throw new BusinessError(ErrorCode.ValidationError, '模型章节硬失败语义不一致。');
  return {
    chapter,
    content: draft.content,
    summary: draft.summary,
    openingStrategy: draft.openingStrategy,
    openingHighlight: draft.openingHighlight,
    firstSentence: draft.firstSentence,
    first300Summary: draft.first300Summary,
    endingHook: draft.endingHook,
    riskLevel: draft.riskLevel,
    riskTags: [...draft.riskTags],
    aiRecommendedReason: draft.aiRecommendedReason,
    scoring: draft.scoring,
    featureCard: {
      chapterId: chapter.id,
      oneLineSummary: draft.featureCard.oneLineSummary,
      coreTask: draft.featureCard.coreTask,
      mainConflict: draft.featureCard.mainConflict,
      appealPoint: draft.featureCard.appealPoint,
      emotionKeywords: [...draft.featureCard.emotionKeywords],
      characterChanges: [...draft.featureCard.characterChanges],
      relationshipChanges: [...draft.featureCard.relationshipChanges],
      keyInformation: [...draft.featureCard.keyInformation],
      foreshadowingOperation: draft.featureCard.foreshadowingOperation,
      endingHook: draft.featureCard.endingHook,
      factsCannotChange: [...draft.featureCard.factsCannotChange],
      featuresToStrengthen: [...draft.featureCard.featuresToStrengthen],
      metadata: {
        scoringStrategyVersion: draft.featureCard.metadata.scoringStrategyVersion,
        hardFailed: draft.featureCard.metadata.hardFailed,
        summary: draft.featureCard.metadata.summary
      }
    },
    review: {
      reviewLevel: draft.review.reviewLevel,
      totalScore: draft.review.totalScore,
      subScores: { ...draft.review.subScores },
      rating: draft.review.rating,
      summary: draft.review.summary,
      strengths: [...draft.review.strengths],
      problems: [...draft.review.problems],
      suggestions: [...draft.review.suggestions],
      issueCards: draft.review.issueCards.map((issue) => ({ ...issue })),
      actionOptions: [...draft.review.actionOptions],
      recommendedAction: draft.review.recommendedAction,
      allowNextStep: draft.review.allowNextStep,
      blockingIssueCount: draft.review.blockingIssueCount,
      resolvedStatus: draft.review.resolvedStatus,
      promptTemplateVersionId: draft.review.promptTemplateVersionId,
      policyProfileVersionId: draft.review.policyProfileVersionId,
      metadata: {
        scoringStrategyVersion: draft.review.metadata.scoringStrategyVersion,
        hardFailed: draft.review.metadata.hardFailed,
        summary: draft.review.metadata.summary
      }
    },
    hardFailed: draft.hardFailed,
    hardFailureReasons: [...draft.hardFailureReasons]
  };
}

function countChineseWords(content: string) {
  return content.replace(/\s+/g, '').length;
}

function createLocalRecommendedAction(options: {
  type: string;
  label: string;
  reasonText: string;
  target?: NovelDetailDTO['statusSummary']['recommendedAction']['target'];
  disabled?: boolean;
  disabledReason?: string | null;
  confirmRequired?: boolean;
  taskType?: string | null;
}): NovelDetailDTO['statusSummary']['recommendedAction'] {
  return {
    type: options.type,
    label: options.label,
    reasonText: options.reasonText,
    target: options.target ?? 'detail',
    disabled: options.disabled ?? false,
    disabledReason: options.disabledReason ?? null,
    confirmRequired: options.confirmRequired ?? false,
    taskType: options.taskType ?? null
  };
}
