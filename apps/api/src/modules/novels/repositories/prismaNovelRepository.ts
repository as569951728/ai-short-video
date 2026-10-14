import { randomUUID } from 'node:crypto';
import {
  ErrorCode,
  NovelCreationStage,
  NovelLifecycleStatus,
  RiskLevel,
  StaleLevel,
  StageStatus,
  TaskStatus,
  VersionStatus,
  assertNoSensitiveExecutionPayload,
  type BodyBatchChapterResultDTO,
  type ChapterLengthGateDTO,
  type ChapterSummaryCompareDTO,
  type StructureAssetContentDTO,
  type ExecutionEnvelope
} from '@ai-shortvideo/shared';
import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { evaluateChapterLength, isBoundedOverlengthRevision } from '../domain/chapterLengthPolicy.js';
import { bindGeneratedBodyChapter } from '../domain/bodyChapterBinding.js';
import { bindTrialFollowupChapters } from '../domain/trialFollowupBinding.js';
import { fullReviewRequestFingerprintFromExecution, validateFullReviewDraftForPersistence, type BodyChapterProviderDraft, type TrialFollowupChapterProviderDraft } from '../services/actionExecutionPlan.js';
import type { ImpactAssessmentDraft } from '../domain/novelDomain.js';
import {
  DEFAULT_POLICY_PROFILE_VERSION_ID,
  leasedActionFailure,
  type AdoptedDirectionRecord,
  type AdoptedChapterContentRecord,
  type AdoptedStructureAssetRecord,
  type AssetDecisionRecord,
  type BodyBatchGenerationInput,
  type BodyBatchRecord,
  type BodyBatchTaskCreationInput,
  type ChapterContentAdoptionInput,
  type ChapterRewriteInput,
  type CreatedBodyBatchTaskRecord,
  type CreatedDirectionCandidatesRecord,
  type DirectionCandidateDraft,
  type CreatedDirectionRevisionRecord,
  type CreatedDraftRecord,
  type CreatedImpactAssessmentRecord,
  type CreatedStructureAssetRecord,
  type CreatedTrialCandidatesRecord,
  type CreatedTrialFollowupTaskRecord,
  type ChapterContentVersionRecord,
  type ChapterFeatureCardRecord,
  type ChapterWordTargetUpdateInput,
  type ChapterWorkbenchRecord,
  type ClaimGenerationTaskInput,
  type ClaimGenerationTaskResult,
  type LoadGenerationAuthorityInput,
  type GenerationAuthoritySnapshot,
  type HashedSafeResultReceipt,
  type LeasedTaskFailure,
  type LeasedTaskCheckpointInput,
  type LeasedProviderDispatchInput,
  type LeasedActionFailureInput,
  type LeasedCreativeFinalizeInput,
  type ObservedTaskLease,
  type ObservedUnleasedTask,
  type CompletionConfirmationInput,
  type CompletionDecisionRecord,
  type ConfirmedCompletionRecord,
  type ConfirmedVideoReadinessRecord,
  type ConfirmedTrialRecord,
  type CreatedFullReviewRecord,
  type CreativeVersionRecord,
  type CreatedVideoReadinessCheckRecord,
  type DirectionAdoptionInput,
  type DirectionCreationInput,
  type DirectionRevisionInput,
  type DraftCreationInput,
  type GeneratedTrialFollowupRecord,
  type GeneratedBodyBatchRecord,
  type CancelledTaskRecord,
  type GenerationTaskEventRecord,
  type GenerationTaskRecord,
  type GenerationAuthorityFenceInput,
  type GenerationAuthorityFenceResult,
  type ListedNovelRecords,
  type ListNovelRecordsQuery,
  type LongTermMemoryRecord,
  type ImpactAssessmentInput,
  type ImpactCaseRecord,
  type ImpactCaseResolveInput,
  type ForcedFullReviewRecord,
  type FullReviewCreationInput,
  type FullReviewDraft,
  type FullReviewForcePassInput,
  type FullReviewGateRecord,
  type FullReviewIssueResolutionInput,
  type NovelChapterRecord,
  type NovelPreferencesRecord,
  type NovelRecord,
  type NovelRepository,
  type OperationLogRecord,
  type RetriedTaskRecord,
  type ResolvedFullReviewIssueRecord,
  type ResolvedImpactCaseRecord,
  type RewrittenChapterRecord,
  type OverlengthRevisionInput,
  type SavedOverlengthRevisionRecord,
  type ReviewReportRecord,
  type StructureAdoptionInput,
  type StructureAssetDraft,
  type StructureCreationInput,
  type StructureGenerationTaskCreationInput,
  type TaskCancelInput,
  type TaskFailureInput,
  type TaskRetryInput,
  type TrialCandidateCreationInput,
  type TrialChapterCandidateDraft,
  type TrialChapterResultRecord,
  type TrialConfirmationInput,
  type TrialFollowupGenerationInput,
  type TrialReviewDraft,
  type TrialFollowupTaskCreationInput,
  type TrialRunRecord,
  type VideoReadinessCheckInput,
  type VideoReadinessCheckRecord,
  type VideoReadinessConfirmationInput,
  type VideoReadinessSnapshotRecord,
  normalizeDraftRequest
} from '../domain/novelDomain.js';
import {
  NOVEL_PROVIDER_TASK_TYPES,
  isNovelProviderTaskType,
  createSafeResultReceipt,
  matchGenerationAuthority,
  validateExecutionEnvelopeV1_1ForTask,
  verifyHashedSafeResultReceipt
} from '../domain/executionContract.js';
import {
  ImpactLevel as PrismaImpactLevel,
  NovelCreationStage as PrismaNovelCreationStage,
  NovelCreationSourceType as PrismaNovelCreationSourceType,
  NovelLifecycleStatus as PrismaNovelLifecycleStatus,
  RiskLevel as PrismaRiskLevel,
  StageStatus as PrismaStageStatus,
  StaleLevel as PrismaStaleLevel,
  TaskStatus as PrismaTaskStatus,
  ProviderAttemptPhase as PrismaProviderAttemptPhase,
  VersionStatus as PrismaVersionStatus
} from '../../../generated/prisma/enums.js';
import { BusinessError } from '../../../shared/errors.js';

class ClaimSourceStaleRollbackError extends Error {
  constructor() {
    super('claim authority changed before commit');
    this.name = 'ClaimSourceStaleRollbackError';
  }
}
function activeGenerationClaimWhere(input: ClaimGenerationTaskInput) {
  return {
    tenantId: input.tenantId, novelId: input.novelId,
    status: { in: [PrismaTaskStatus.QUEUED, PrismaTaskStatus.PROCESSING] },
    activeClaimKey: { not: null },
    ...(input.conflictScope === 'chapter' ? {
      OR: [
        { conflictScope: null }, { conflictScope: { not: 'chapter' } },
        { conflictScope: 'chapter', conflictKey: input.conflictKey }
      ]
    } : {})
  };
}
export class PrismaNovelRepository implements NovelRepository {
  private readonly prisma = getPrismaClient();

  async createDraft(input: DraftCreationInput): Promise<CreatedDraftRecord> {
    const normalized = normalizeDraftRequest(input.request);

    return this.prisma.$transaction(async (tx) => {
      const novel = await tx.novel.create({
        data: {
          tenantId: input.context.tenantId,
          ownerId: input.context.userId,
          title: normalized.title,
          channel: normalized.channel,
          genresJson: normalized.genres,
          lifecycleStatus: PrismaNovelLifecycleStatus.ACTIVE,
          creationStage: PrismaNovelCreationStage.DRAFT,
          stageStatus: PrismaStageStatus.NOT_STARTED,
          hotspotReportId: normalized.hotspotReportId,
          policyProfileVersionId: DEFAULT_POLICY_PROFILE_VERSION_ID,
          chapterLimit: normalized.chapterLimit,
          chapterWordMin: normalized.chapterWordMin,
          chapterWordMax: normalized.chapterWordMax,
          videoReferenceStatus: 'not_referenced',
          createdBy: input.context.userId,
          updatedBy: input.context.userId,
          createdAt: input.now,
          updatedAt: input.now
        }
      });

      const preferences = await tx.createNovelPreferences.create({
        data: {
          tenantId: input.context.tenantId,
          novelId: novel.id,
          creationSourceType: toPrismaCreationSourceType(normalized.creationSourceType),
          hotspotReportId: normalized.hotspotReportId,
          hotspotOpportunityId: normalized.hotspotOpportunityId,
          hotspotTitle: input.creationSourceContext?.hotspotTitle ?? null,
          hotspotOpportunityTitle: input.creationSourceContext?.hotspotOpportunityTitle ?? null,
          appealPointsJson: normalized.appealPoints,
          genresJson: normalized.genres,
          openingState: normalized.openingState,
          blockedElementsJson: normalized.blockedElements,
          targetAudience: normalized.targetAudience,
          chapterLimit: normalized.chapterLimit,
          chapterWordMin: normalized.chapterWordMin,
          chapterWordMax: normalized.chapterWordMax,
          stageCount: normalized.stageCount,
          customIdea: normalized.customIdea,
          style: normalized.style,
          videoAdaptationPreference: normalized.videoAdaptationPreference,
          createdBy: input.context.userId,
          createdAt: input.now
        }
      });

      const operationLog = await tx.operationLog.create({
        data: {
          id: createId('oplog'),
          tenantId: input.context.tenantId,
          userId: input.context.userId,
          novelId: novel.id,
          action: 'create_novel_draft',
          objectType: 'novel',
          objectId: novel.id,
          beforeSnapshot: { state: 'none' },
          afterSnapshot: {
            lifecycleStatus: NovelLifecycleStatus.Active,
            creationStage: NovelCreationStage.Draft,
            stageStatus: StageStatus.NotStarted,
            creationSourceType: normalized.creationSourceType,
            hotspotReportId: normalized.hotspotReportId,
            hotspotOpportunityId: normalized.hotspotOpportunityId
          },
          reason: '创建小说草稿',
          impactSummary: '新建草稿，不影响既有创作资产。',
          sourceTaskId: null,
          requestId: input.context.requestId,
          ip: input.context.ip ?? null,
          userAgent: input.context.userAgent ?? null,
          createdAt: input.now
        }
      });

      return {
        novel: mapNovel(novel),
        preferences: mapPreferences(preferences),
        operationLog: mapOperationLog(operationLog)
      };
    });
  }

  async list(query: ListNovelRecordsQuery): Promise<ListedNovelRecords> {
    const where = {
      tenantId: query.tenantId,
      deletedAt: null,
      ...(query.lifecycleStatus ? { lifecycleStatus: toPrismaLifecycleStatus(query.lifecycleStatus) } : {}),
      ...(query.creationStage ? { creationStage: toPrismaCreationStage(query.creationStage) } : {}),
      ...(query.videoReferenceStatus ? { videoReferenceStatus: query.videoReferenceStatus } : {}),
      ...(query.keyword ? { title: { contains: query.keyword } } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.novel.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.prisma.novel.count({ where })
    ]);

    return {
      items: items.map(mapNovel),
      total
    };
  }

  async findById(tenantId: string, novelId: string, prisma: Prisma.TransactionClient = this.prisma) {
    const novel = await prisma.novel.findFirst({
      where: {
        tenantId,
        id: novelId,
        deletedAt: null
      }
    });

    return novel ? mapNovel(novel) : null;
  }

  async findPreferencesByNovelId(tenantId: string, novelId: string, prisma: Prisma.TransactionClient = this.prisma) {
    const preferences = await prisma.createNovelPreferences.findFirst({
      where: {
        tenantId,
        novelId
      }
    });

    return preferences ? mapPreferences(preferences) : null;
  }

  async findActiveDirectionGenerationTask(tenantId: string, novelId: string) {
    const task = await this.prisma.generationTask.findFirst({
      where: {
        tenantId,
        novelId,
        taskType: 'novel_direction_generate',
        status: {
          in: [PrismaTaskStatus.QUEUED, PrismaTaskStatus.PROCESSING]
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return task ? mapGenerationTask(task) : null;
  }

  async findTaskById(tenantId: string, taskId: string) {
    const task = await this.prisma.generationTask.findFirst({
      where: {
        tenantId,
        id: taskId
      }
    });

    return task ? mapGenerationTask(task) : null;
  }

  async findTaskByIdempotencyToken(tenantId: string, taskType: string, idempotencyToken: string) {
    const task = await this.prisma.generationTask.findFirst({
      where: { tenantId, taskType, idempotencyToken }
    });
    return task ? mapGenerationTask(task) : null;
  }

  async listTaskEvents(tenantId: string, taskId: string) {
    const events = await this.prisma.generationTaskEvent.findMany({
      where: {
        tenantId,
        taskId
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    return events.map(mapGenerationTaskEvent);
  }

  async listRecentTasksForNovel(tenantId: string, novelId: string, limit: number) {
    const tasks = await this.prisma.generationTask.findMany({
      where: {
        tenantId,
        novelId
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: limit
    });

    return tasks.map(mapGenerationTask);
  }

  async assertProviderActionSupported(taskType: string) {
    const supported = new Set([
      'novel_direction_generate',
      'novel_direction_fuse',
      'novel_direction_optimize',
      'novel_setting_generate',
      'novel_outline_generate',
      'stage_outline_generate',
      'chapter_plan_generate',
      'trial_writing_generate',
      'trial_followup_generate',
      'body_batch_generate',
      'chapter_body_generate',
      'chapter_overlength_revise'
    ]);
    if (!supported.has(taskType)) {
      throw new BusinessError(ErrorCode.ConfigMissing, 'Prisma 小说后半写链尚未实现，provider 调用已在 task claim 前阻断。', {
        taskType,
        capability: 'prisma_novel_provider_finalize'
      });
    }
  }


  async getLeasedExecutionCapability(taskType: string) {
    return isNovelProviderTaskType(taskType) ? 'disabled' as const : 'unsupported' as const;
  }

  async loadGenerationAuthority(
    input: LoadGenerationAuthorityInput,
    prisma: Prisma.TransactionClient = this.prisma
  ): Promise<GenerationAuthoritySnapshot | null> {
    const novel = await this.findById(input.tenantId, input.novelId, prisma);
    if (!novel || novel.lifecycleStatus !== NovelLifecycleStatus.Active) return null;
    const refs = authorityRecord(input.sourceVersionRefs);
    const currentRefs = {
      currentDirectionVersionId: novel.currentDirectionVersionId,
      currentSettingVersionId: novel.currentSettingVersionId,
      currentOutlineVersionId: novel.currentOutlineVersionId,
      currentStageOutlineVersionId: novel.currentStageOutlineVersionId,
      currentChapterPlanVersionId: novel.currentChapterPlanVersionId
    };
    for (const [key, value] of Object.entries(currentRefs)) if (key in refs && refs[key] !== value) return null;
    const [preference, directions, structures, chapters] = await Promise.all([
      this.findPreferencesByNovelId(input.tenantId, novel.id, prisma),
      this.listDirectionVersions(input.tenantId, novel.id, prisma),
      this.listStructureVersions(input.tenantId, novel.id, prisma),
      this.listNovelChapters(input.tenantId, novel.id, prisma)
    ]);
    const versions = [...directions, ...structures];
    const versionById = (id: unknown) => typeof id === 'string' ? versions.find((item) => item.id === id) ?? null : null;
    const structureAction = ['setting_generate', 'outline_generate', 'stage_outline_generate', 'chapter_plan_generate'].includes(input.action);
    const currentVersionIds = [refs.currentDirectionVersionId, refs.currentSettingVersionId, refs.currentOutlineVersionId, refs.currentStageOutlineVersionId, refs.currentChapterPlanVersionId];
    const optimizationSourceIds = structureAction && Array.isArray(refs.sourceVersionIds) ? refs.sourceVersionIds : [];
    const selectedIds = input.action === 'direction_fuse' || input.action === 'direction_optimize'
      ? (Array.isArray(refs.sourceVersionIds) ? refs.sourceVersionIds : [])
      : [...currentVersionIds, ...optimizationSourceIds];
    const selectedVersions = selectedIds.map(versionById);
    if (selectedVersions.some((item, index) => selectedIds[index] !== null && selectedIds[index] !== undefined && !item)) return null;
    if ((input.action === 'direction_fuse' || input.action === 'direction_optimize') && selectedVersions.some((item) =>
      !item || item.objectType !== 'direction' || ![VersionStatus.Candidate, VersionStatus.Current].includes(item.status)
    )) return null;
    if (structureAction && optimizationSourceIds.some((id) => {
      const item = versionById(id);
      return !item || item.objectType !== refs.objectType || ![VersionStatus.Candidate, VersionStatus.Current].includes(item.status) || item.staleLevel === StaleLevel.HardStale;
    })) return null;
    if (input.action !== 'direction_fuse' && input.action !== 'direction_optimize'
      && currentVersionIds.map(versionById).some((item) => item && item.status !== VersionStatus.Current)) return null;
    const chapter = chapters.find((item) => item.id === input.objectId) ?? null;
    if (['chapter_body_generate', 'chapter_overlength_revise', 'chapter_rewrite', 'chapter_impact_assess', 'chapter_adopt_impact_assess'].includes(input.action) && !chapter) return null;
    if (chapter && 'currentContentVersionId' in refs && chapter.currentContentVersionId !== refs.currentContentVersionId) return null;
    const candidateRefId = refs.candidateVersionId ?? refs.selectedChapterOneCandidateId;
    const trialRunId = refs.trialRunId ?? (input.action === 'trial_followup_generate' ? input.objectId : null);
    const [currentContent, candidate, trialRun] = await Promise.all([
      typeof refs.currentContentVersionId === 'string' ? this.findChapterContentVersionById(input.tenantId, novel.id, refs.currentContentVersionId, prisma) : null,
      typeof candidateRefId === 'string' ? this.findChapterContentVersionById(input.tenantId, novel.id, candidateRefId, prisma) : null,
      typeof trialRunId === 'string' ? this.findTrialRunById(input.tenantId, novel.id, trialRunId, prisma) : null
    ]);
    if (refs.currentContentVersionId && (!currentContent || currentContent.chapterId !== chapter?.id)) return null;
    if (refs.candidateVersionId && (!candidate || candidate.chapterId !== chapter?.id || candidate.status === VersionStatus.Discarded)) return null;
    if (input.action === 'chapter_overlength_revise' && (!chapter || chapter.currentContentVersionId || !candidate ||
      candidate.status !== VersionStatus.Candidate || candidate.sourceType !== 'ai_overlength_original' ||
      toRecord(toRecord(candidate.metadata).lengthGate).target !== chapter.wordTarget ||
      evaluateChapterLength(candidate.content, chapter.wordTarget).status !== 'too_long')) return null;
    if (trialRunId && !trialRun) return null;
    if (input.action === 'trial_followup_generate') {
      if (
        !trialRun
        || trialRun.status !== 'waiting_chapter1_selection'
        || typeof refs.selectedChapterOneCandidateId !== 'string'
        || !candidate
        || candidate.status === VersionStatus.Discarded
        || authorityRecord(candidate.metadata).trialRunId !== trialRun.id
      ) return null;
    }
    const orderedChapters = chapters
      .sort((left, right) => left.chapterNo - right.chapterNo || left.id.localeCompare(right.id))
      .map((item) => ({
        id: item.id, chapterNo: item.chapterNo, title: item.title, wordTarget: item.wordTarget,
        statusNote: item.statusNote, currentContentVersionId: item.currentContentVersionId,
        currentFeatureCardVersionId: item.currentFeatureCardVersionId, currentReviewReportId: item.currentReviewReportId
      }));
    if (input.action === 'novel_full_review') {
      const expected = Array.isArray(refs.chapterContentVersionIds) ? refs.chapterContentVersionIds : [];
      const actual = orderedChapters.map((item) => ({
        chapterId: item.id, chapterNo: item.chapterNo, currentContentVersionId: item.currentContentVersionId,
        currentFeatureCardVersionId: item.currentFeatureCardVersionId, currentReviewReportId: item.currentReviewReportId
      }));
      if (JSON.stringify(expected) !== JSON.stringify(actual)) return null;
    }
    const loadedFullReviewContents = input.action === 'novel_full_review'
      ? await Promise.all(orderedChapters.map((item) => this.findChapterContentVersionById(
          input.tenantId, novel.id, item.currentContentVersionId!, prisma
        )))
      : [];
    const loadedFullReviewFeatureCards = input.action === 'novel_full_review'
      ? await Promise.all(orderedChapters.map((item) => this.findFeatureCardById(
          input.tenantId, item.currentFeatureCardVersionId!, prisma
        )))
      : [];
    const loadedFullReviewReviews = input.action === 'novel_full_review'
      ? await Promise.all(orderedChapters.map((item) => this.findReviewReportById(
          input.tenantId, item.currentReviewReportId!, prisma
        )))
      : [];
    const finalChapter = orderedChapters.at(-1);
    const fullReviewMemory = input.action === 'novel_full_review' && finalChapter
      ? await this.findLatestLongTermMemory(input.tenantId, novel.id, finalChapter.id, prisma)
      : null;
    if (
      loadedFullReviewContents.some((item, index) => !item || item.chapterId !== orderedChapters[index]?.id)
      || loadedFullReviewFeatureCards.some((item, index) => !item || item.chapterId !== orderedChapters[index]?.id || item.staleLevel === StaleLevel.HardStale)
      || loadedFullReviewReviews.some((item, index) => !item || item.objectId !== orderedChapters[index]?.id || item.objectVersionId !== orderedChapters[index]?.currentContentVersionId)
      || (input.action === 'novel_full_review' && (
        !fullReviewMemory
        || !finalChapter
        || fullReviewMemory.chapterId !== finalChapter.id
        || fullReviewMemory.sourceContentVersionId !== finalChapter.currentContentVersionId
        || fullReviewMemory.staleLevel === StaleLevel.HardStale
      ))
    ) return null;
    const fullReviewContents = loadedFullReviewContents.filter((item): item is ChapterContentVersionRecord => Boolean(item));
    const fullReviewFeatureCards = loadedFullReviewFeatureCards.filter((item): item is ChapterFeatureCardRecord => Boolean(item));
    const fullReviewReviews = loadedFullReviewReviews.filter((item): item is ReviewReportRecord => Boolean(item));
    const strategy = typeof refs.strategySnapshotId === 'string'
      ? await this.findStructureVersionById(input.tenantId, novel.id, 'body_strategy_snapshot', refs.strategySnapshotId, prisma)
      : null;
    if (typeof refs.strategySnapshotId === 'string' && (
      !strategy
      || strategy.versionNo !== refs.strategySnapshotVersion
      || strategy.status === VersionStatus.Discarded
    )) return null;
    const normalizedRequest = authorityRecord(input.normalizedRequest);
    const authorityChapters = input.action === 'trial_followup_generate'
      ? orderedChapters.slice(0, trialRun?.trialChapterCount ?? 0)
      : orderedChapters;
    const bodyAuthority = input.action === 'body_batch_generate' || input.action === 'chapter_body_generate';
    const bodyStartChapterNo = input.action === 'body_batch_generate'
      ? Number(normalizedRequest.startChapter)
      : chapter?.chapterNo;
    const previousChapter = bodyAuthority && Number.isInteger(bodyStartChapterNo)
      ? orderedChapters.filter((item) => item.chapterNo < Number(bodyStartChapterNo)).at(-1)
      : null;
    const [bodyPreviousContent, bodyPreviousMemory, bodyPreviousBatch] = await Promise.all([
      previousChapter?.currentContentVersionId
        ? this.findChapterContentVersionById(input.tenantId, novel.id, previousChapter.currentContentVersionId, prisma)
        : null,
      bodyAuthority && previousChapter ? this.findLatestLongTermMemory(input.tenantId, novel.id, previousChapter.id, prisma) : null,
      bodyAuthority ? this.findLatestBodyBatch(input.tenantId, novel.id, prisma) : null
    ]);
    return {
      action: input.action,
      tenantId: input.tenantId,
      novelId: novel.id,
      objectId: input.objectId,
      facts: {
        novel: {
          id: novel.id, title: novel.title, genres: [...novel.genres].sort(), chapterLimit: novel.chapterLimit,
          chapterWordMin: novel.chapterWordMin, chapterWordMax: novel.chapterWordMax,
          policyProfileVersionId: novel.policyProfileVersionId
        },
        preferences: preference ? {
          appealPoints: preference.appealPoints.map((item) => item.trim()).filter(Boolean).sort(), targetAudience: preference.targetAudience, stageCount: preference.stageCount
        } : null,
        currentRefs,
        versions: selectedVersions.filter(Boolean),
        chapter: chapter ? orderedChapters.find((item) => item.id === chapter.id) : null,
        chapters: ['trial_chapter_one_generate', 'trial_followup_generate', 'body_batch_generate', 'novel_full_review'].includes(input.action) ? authorityChapters : [],
        currentContent,
        candidate,
        trialRun,
        strategy,
        bodyPreviousContent,
        bodyPreviousMemory,
        bodyPreviousBatch,
        fullReviewNovel: input.action === 'novel_full_review' ? novel : null,
        fullReviewChapters: input.action === 'novel_full_review' ? chapters : [],
        fullReviewContents,
        fullReviewFeatureCards,
        fullReviewReviews,
        fullReviewMemory,
        bodyPreviousBatchNotes: bodyPreviousBatch?.summary.nextBatchNotes ?? []
      }
    };
  }
  async claimGenerationTask(input: ClaimGenerationTaskInput): Promise<ClaimGenerationTaskResult> {
    if (input.executionMode === 'queued' && (!(input.durationDeadlineAt instanceof Date)
      || !Number.isFinite(input.durationDeadlineAt.getTime())
      || input.durationDeadlineAt.getTime() <= input.now.getTime())) {
      throw new BusinessError(ErrorCode.ValidationError, '任务执行截止时间无效。');
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          await lockGenerationAuthority(tx, input.authorityInput);
          const authority = await this.loadGenerationAuthority(input.authorityInput, tx);
          if (!matchGenerationAuthority(input.authorityInput, input.expectedAuthoritySnapshotHash, authority).ok) {
            return { outcome: 'source_stale' as const, task: null };
          }
          const idempotentTask = await tx.generationTask.findFirst({
            where: {
              tenantId: input.tenantId,
              taskType: input.taskType,
              idempotencyToken: input.idempotencyToken
            }
          });
          if (idempotentTask) {
            return {
              outcome: idempotentTask.requestHash === input.requestHash ? 'reused' : 'idempotency_conflict',
              task: mapGenerationTask(idempotentTask)
            };
          }

          const activeTask = await tx.generationTask.findFirst({
            where: activeGenerationClaimWhere(input)
          });
          if (activeTask) return { outcome: 'active_conflict', task: mapGenerationTask(activeTask) };

          const taskId = randomUUID().replaceAll('-', '').slice(0, 32);
          const task = await tx.generationTask.create({
            data: {
              id: taskId,
              tenantId: input.tenantId,
              novelId: input.novelId,
              taskType: input.taskType,
              objectType: input.objectType,
              objectId: input.objectId,
              status: input.executionMode === 'queued' ? PrismaTaskStatus.QUEUED : PrismaTaskStatus.PROCESSING,
              statusNote: input.executionMode === 'queued' ? '任务已受理，等待后台执行。' : '生成任务已创建，正在调用模型。',
              progress: 0,
              currentStep: input.executionMode === 'queued' ? '等待执行' : '正在调用模型',
              triggerSource: 'manual',
              sourceVersionRefs: toJsonObject(input.sourceVersionRefs),
              executionEnvelopeJson: toJsonObject(input.executionEnvelopeJson),
              conflictScope: input.conflictScope,
              conflictKey: input.conflictKey,
              idempotencyToken: input.idempotencyToken,
              requestHash: input.requestHash,
              activeClaimKey: input.activeClaimKey,
              policyProfileVersionId: input.policyProfileVersionId,
              modelRoutingVersion: input.modelRoutingVersion,
              rootTaskId: taskId,
              providerCallBudgetMax: input.executionMode === 'queued' ? 1 : 0,
              maxRetries: input.executionMode === 'queued' ? 0 : 2,
              durationDeadlineAt: input.executionMode === 'queued' ? input.durationDeadlineAt : input.now,
              inputSummary: input.inputSummary,
              startedAt: input.executionMode === 'queued' ? null : input.now,
              createdBy: input.context.userId,
              createdAt: input.now,
              updatedAt: input.now,
              metadata: { requestId: input.context.requestId }
            }
          });
          await createTaskEvent(tx, {
            task,
            eventType: 'task_claimed',
            message: input.executionMode === 'queued' ? '任务已受理，等待后台执行。' : '生成任务已创建，正在调用模型。',
            progress: 0,
            requestId: input.context.requestId,
            createdAt: input.now
          });
          await input.afterClaimBarrier?.();
          const commitAuthority = await this.loadGenerationAuthority(input.authorityInput, tx);
          if (!matchGenerationAuthority(input.authorityInput, input.expectedAuthoritySnapshotHash, commitAuthority).ok) {
            throw new ClaimSourceStaleRollbackError();
          }
          return { outcome: 'created', task: mapGenerationTask(task) };
        });
      } catch (error) {
        if (error instanceof ClaimSourceStaleRollbackError) {
          return { outcome: 'source_stale', task: null };
        }
        if (!isPrismaUniqueConstraintError(error)) throw error;

        const authority = await this.loadGenerationAuthority(input.authorityInput);
        if (!matchGenerationAuthority(input.authorityInput, input.expectedAuthoritySnapshotHash, authority).ok) {
          return { outcome: 'source_stale', task: null };
        }
        const idempotentTask = await this.prisma.generationTask.findFirst({
          where: {
            tenantId: input.tenantId,
            taskType: input.taskType,
            idempotencyToken: input.idempotencyToken
          }
        });
        if (idempotentTask) {
          return {
            outcome: idempotentTask.requestHash === input.requestHash ? 'reused' : 'idempotency_conflict',
            task: mapGenerationTask(idempotentTask)
          };
        }

        const activeTask = await this.prisma.generationTask.findFirst({
          where: activeGenerationClaimWhere(input)
        });
        if (activeTask) return { outcome: 'active_conflict', task: mapGenerationTask(activeTask) };
        if (attempt === 1) {
          throw new BusinessError(ErrorCode.ConflictTaskExists, '并发任务 claim 正在收敛，请重试当前请求。', {
            taskType: input.taskType
          });
        }
      }
    }

    throw new BusinessError(ErrorCode.InternalError, '生成任务 claim 未返回结果。');
  }

  async fenceGenerationAuthority(input: GenerationAuthorityFenceInput): Promise<GenerationAuthorityFenceResult> {
    return this.prisma.$transaction(async (tx) => {
      await lockGenerationAuthority(tx, input.authorityInput);
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM generation_task WHERE tenant_id = ${input.tenantId} AND id = ${input.taskId} FOR UPDATE`
      );
      const current = await tx.generationTask.findFirst({
        where: { id: input.taskId, tenantId: input.tenantId }
      });
      if (!current || current.status !== PrismaTaskStatus.PROCESSING) {
        return { outcome: 'task_not_writable' as const, task: current ? mapGenerationTask(current) : null };
      }
      const authority = await this.loadGenerationAuthority(input.authorityInput, tx);
      if (!matchGenerationAuthority(input.authorityInput, input.expectedAuthoritySnapshotHash, authority).ok) {
        const failed = await tx.generationTask.update({
          where: { id: current.id, tenantId: input.tenantId },
          data: {
            status: PrismaTaskStatus.FAILED,
            statusNote: '生成来源已变化，模型结果已安全丢弃。',
            currentStep: '生成来源已变化',
            failureCategory: 'source_stale',
            errorCode: 'SOURCE_STALE',
            errorMessage: '生成来源已变化，请刷新后重试。',
            activeClaimKey: null,
            finishedAt: input.now,
            updatedAt: input.now
          }
        });
        await createTaskEvent(tx, {
          task: failed,
          eventType: 'failed',
          message: '生成来源已变化，请刷新后重试。',
          progress: failed.progress,
          requestId: input.context.requestId,
          createdAt: input.now
        });
        return { outcome: 'source_stale' as const, task: mapGenerationTask(failed) };
      }
      if (input.phase === 'prepare') return { outcome: 'authorized' as const, task: mapGenerationTask(current) };
      const authorized = await tx.generationTask.update({
        where: { id: current.id, tenantId: input.tenantId },
        data: input.phase === 'provider_dispatch'
          ? {
              providerAttemptPhase: PrismaProviderAttemptPhase.PROVIDER_CALL_STARTED,
              providerDispatchedAt: input.now,
              updatedAt: input.now
            }
          : {
              providerAttemptPhase: PrismaProviderAttemptPhase.FINALIZING,
              updatedAt: input.now
            }
      });
      return { outcome: 'authorized' as const, task: mapGenerationTask(authorized) };
    });
  }
  async leaseNextQueuedTask(workerId: string, leaseToken: string, now: Date, leaseUntil: Date) {
    if (leaseUntil.getTime() <= now.getTime()) return null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await this.prisma.$transaction(async (tx) => {
        const candidate = await tx.generationTask.findFirst({
          where: { status: PrismaTaskStatus.QUEUED },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
        });
        if (!candidate) return { kind: 'empty' as const };
        if (candidate.providerAttemptId !== null || candidate.providerDispatchedAt !== null || candidate.providerAttemptPhase !== null
          || candidate.providerCallBudgetUsed > 0) {
          const failed = await tx.generationTask.updateMany({
            where: {
              id: candidate.id, tenantId: candidate.tenantId, status: PrismaTaskStatus.QUEUED,
              leaseOwnerId: null, leaseToken: null,
              providerAttemptId: candidate.providerAttemptId,
              providerDispatchedAt: candidate.providerDispatchedAt,
              providerAttemptPhase: candidate.providerAttemptPhase,
              providerCallBudgetUsed: candidate.providerCallBudgetUsed
            },
            data: {
              status: PrismaTaskStatus.FAILED,
              statusNote: '模型调用结果未确认，任务已安全结束。', currentStep: 'failed',
              failureCategory: 'provider_outcome_unknown', errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
              errorMessage: 'Queued task contains prior execution evidence.',
              activeClaimKey: null, leaseOwnerId: null, leaseToken: null, leaseExpiresAt: null,
              finishedAt: now, updatedAt: now
            }
          });
          if (failed.count === 1) {
            const task = await tx.generationTask.findFirstOrThrow({ where: { id: candidate.id, tenantId: candidate.tenantId } });
            await createTaskEvent(tx, { task, eventType: 'task_failed', message: '模型调用结果未确认，任务已安全结束。',
              progress: task.progress, requestId: 'worker:queued-recovery', createdAt: now });
            await tx.operationLog.create({ data: {
              tenantId: task.tenantId, userId: task.createdBy, novelId: task.novelId,
              action: 'generation_task_failed', objectType: 'generation_task', objectId: task.id,
              afterSnapshot: { failureCategory: 'provider_outcome_unknown', errorCode: 'PROVIDER_OUTCOME_UNKNOWN' },
              reason: '模型调用结果未确认，任务已安全结束。', sourceTaskId: task.id, requestId: 'worker:queued-recovery', createdAt: now
            } });
          }
          return { kind: 'retry' as const };
        }
        try {
          validateExecutionEnvelopeV1_1ForTask(mapGenerationTask(candidate));
        } catch {
          await tx.generationTask.updateMany({
            where: { id: candidate.id, tenantId: candidate.tenantId, status: PrismaTaskStatus.QUEUED, leaseOwnerId: null, leaseToken: null },
            data: {
              status: PrismaTaskStatus.FAILED,
              statusNote: '任务执行合同或可信身份无效，已安全失败。',
              currentStep: 'failed',
              failureCategory: 'worker_payload_unsupported',
              errorCode: 'WORKER_PAYLOAD_UNSUPPORTED',
              errorMessage: 'Execution envelope V1.1 or trusted audit actor is invalid.',
              activeClaimKey: null,
              finishedAt: now,
              updatedAt: now
            }
          });
          return { kind: 'retry' as const };
        }
        const claimed = await tx.generationTask.updateMany({
          where: { id: candidate.id, tenantId: candidate.tenantId, status: PrismaTaskStatus.QUEUED, leaseOwnerId: null, leaseToken: null },
          data: {
            status: PrismaTaskStatus.PROCESSING,
            statusNote: 'Worker 已领取任务。',
            currentStep: 'worker_leased',
            leaseOwnerId: workerId,
            leaseToken,
            leaseExpiresAt: leaseUntil,
            lastHeartbeatAt: now,
            providerAttemptId: null,
            providerAttemptPhase: PrismaProviderAttemptPhase.LEASED,
            providerDispatchedAt: null,
            startedAt: candidate.startedAt ?? now,
            updatedAt: now
          }
        });
        if (claimed.count !== 1) return { kind: 'retry' as const };
        const task = await tx.generationTask.findFirstOrThrow({ where: { id: candidate.id, tenantId: candidate.tenantId } });
        await createTaskEvent(tx, { task, eventType: 'task_leased', message: 'Worker 已领取任务。', progress: task.progress, requestId: `worker:${workerId}`, createdAt: now });
        return { kind: 'claimed' as const, task: mapGenerationTask(task) };
      });
      if (result.kind === 'empty') return null;
      if (result.kind === 'claimed') return result.task;
    }
    return null;
  }

  async heartbeatTask(tenantId: string, taskId: string, leaseOwnerId: string, leaseToken: string, now: Date, leaseUntil: Date) {
    if (leaseUntil.getTime() <= now.getTime()) return false;
    const result = await this.prisma.generationTask.updateMany({
      where: { tenantId, id: taskId, status: PrismaTaskStatus.PROCESSING, leaseOwnerId, leaseToken, leaseExpiresAt: { gt: now } },
      data: { lastHeartbeatAt: now, leaseExpiresAt: leaseUntil, updatedAt: now }
    });
    return result.count === 1;
  }

  async checkpointLeasedTask(input: LeasedTaskCheckpointInput) {
    const checkpoint = input.checkpoint;
    if (checkpoint.expectedPhase === 'prepared') {
      return this.dispatchLeasedTask({ ...input, providerAttemptId: checkpoint.providerAttemptId });
    }
    const expectedPhase = checkpoint.expectedPhase.toUpperCase() as PrismaProviderAttemptPhase;
    const nextPhase = checkpoint.nextPhase.toUpperCase() as PrismaProviderAttemptPhase;
    const attemptId = checkpoint.expectedPhase === 'leased' ? null : checkpoint.providerAttemptId.trim();
    if (checkpoint.expectedPhase !== 'leased' && !attemptId) return { outcome: 'fenced' as const, task: null };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const transition = await tx.generationTask.updateMany({
          where: {
            tenantId: input.tenantId,
            id: input.taskId,
            status: PrismaTaskStatus.PROCESSING,
            leaseOwnerId: input.leaseOwnerId,
            leaseToken: input.leaseToken,
            leaseExpiresAt: { gt: input.authoritativeNow },
            retryOfTaskId: null,
            providerAttemptPhase: expectedPhase,
            ...(checkpoint.expectedPhase === 'leased'
              ? { providerAttemptId: null, providerDispatchedAt: null }
              : { providerAttemptId: attemptId, providerDispatchedAt: { not: null } })
          },
          data: {
            providerAttemptPhase: nextPhase,
            updatedAt: input.authoritativeNow
          }
        });
        if (transition.count !== 1) return { outcome: 'fenced' as const, task: null };
        const task = await tx.generationTask.findFirstOrThrow({ where: { id: input.taskId, tenantId: input.tenantId } });
        return { outcome: 'applied' as const, task: mapGenerationTask(task) };
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) return { outcome: 'fenced' as const, task: null };
      throw error;
    }
  }

  async dispatchLeasedTask(input: LeasedProviderDispatchInput) {
    if (!input.providerAttemptId.trim()) return { outcome: 'fenced' as const, task: null };
    const observed = await this.prisma.generationTask.findFirst({ where: { tenantId: input.tenantId, id: input.taskId } });
    if (!observed?.novelId) return { outcome: 'fenced' as const, task: null };
    let observedEnvelope: ReturnType<typeof validateExecutionEnvelopeV1_1ForTask> | null = null;
    try {
      observedEnvelope = validateExecutionEnvelopeV1_1ForTask(mapGenerationTask(observed));
    } catch {
      // The same live lease must be checked under the row lock before a malformed task can be failed.
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const authorityInput = observedEnvelope ? {
          action: observedEnvelope.action, tenantId: observedEnvelope.tenantId, novelId: observedEnvelope.novelId,
          objectId: observedEnvelope.objectId, sourceVersionRefs: observedEnvelope.sourceVersionRefs,
          normalizedRequest: observedEnvelope.normalizedRequest
        } : null;
        if (authorityInput) await lockGenerationAuthority(tx, authorityInput);
        else await lockNovelAuthorityRoot(tx, input.tenantId, observed.novelId!);
        await tx.$queryRaw(Prisma.sql`SELECT id FROM generation_task WHERE tenant_id = ${input.tenantId} AND id = ${input.taskId} FOR UPDATE`);
        const current = await tx.generationTask.findFirst({ where: { tenantId: input.tenantId, id: input.taskId } });
        if (!current || current.novelId !== observed.novelId || current.status !== PrismaTaskStatus.PROCESSING
          || current.leaseOwnerId !== input.leaseOwnerId || current.leaseToken !== input.leaseToken
          || !current.leaseExpiresAt || current.leaseExpiresAt.getTime() <= input.authoritativeNow.getTime()
          || current.providerAttemptPhase !== PrismaProviderAttemptPhase.PREPARED
          || current.providerAttemptId !== null || current.providerDispatchedAt !== null
          || current.providerCallBudgetUsed !== 0 || current.providerCallBudgetMax < 1
          || current.durationDeadlineAt.getTime() <= input.authoritativeNow.getTime()
          || current.retryOfTaskId !== null || current.cancelRequestedAt !== null) {
          return { outcome: 'fenced' as const, task: null };
        }
        const fence = {
          tenantId: input.tenantId, id: input.taskId, novelId: current.novelId,
          status: PrismaTaskStatus.PROCESSING, leaseOwnerId: input.leaseOwnerId, leaseToken: input.leaseToken,
          leaseExpiresAt: { gt: input.authoritativeNow }, providerAttemptPhase: PrismaProviderAttemptPhase.PREPARED,
          providerAttemptId: null, providerDispatchedAt: null, providerCallBudgetUsed: 0,
          providerCallBudgetMax: { gt: 0 }, durationDeadlineAt: { gt: input.authoritativeNow },
          retryOfTaskId: null, cancelRequestedAt: null
        };
        const requestId = `worker:${input.leaseOwnerId.slice(0, 110)}`;
        const fail = async (reason: 'worker_payload_unsupported' | 'source_stale') => {
          const failure = leasedActionFailure(reason);
          const transition = await tx.generationTask.updateMany({ where: fence, data: leaseFailureData(failure, input.authoritativeNow) });
          if (transition.count !== 1) return { outcome: 'fenced' as const, task: null };
          const failed = await tx.generationTask.findFirstOrThrow({ where: { tenantId: input.tenantId, id: input.taskId } });
          await createTaskEvent(tx, { task: failed, eventType: 'task_failed', message: failure.statusNote,
            progress: failed.progress, requestId, createdAt: input.authoritativeNow });
          await tx.operationLog.create({ data: {
            tenantId: failed.tenantId, userId: failed.createdBy, novelId: failed.novelId,
            action: 'generation_task_failed', objectType: 'generation_task', objectId: failed.id,
            afterSnapshot: { failureCategory: failure.failureCategory, errorCode: failure.errorCode },
            reason: failure.statusNote, sourceTaskId: failed.id, requestId, createdAt: input.authoritativeNow
          } });
          return { outcome: 'applied' as const, task: mapGenerationTask(failed) };
        };
        let envelope: ReturnType<typeof validateExecutionEnvelopeV1_1ForTask>;
        try {
          envelope = validateExecutionEnvelopeV1_1ForTask(mapGenerationTask(current));
        } catch {
          return fail('worker_payload_unsupported');
        }
        const currentAuthorityInput = {
          action: envelope.action, tenantId: envelope.tenantId, novelId: envelope.novelId,
          objectId: envelope.objectId, sourceVersionRefs: envelope.sourceVersionRefs,
          normalizedRequest: envelope.normalizedRequest
        };
        const authority = await this.loadGenerationAuthority(currentAuthorityInput, tx);
        if (!matchGenerationAuthority(currentAuthorityInput, envelope.sourceVersionRefs.authoritySnapshotHash, authority).ok) {
          return fail('source_stale');
        }
        const transition = await tx.generationTask.updateMany({ where: fence, data: {
          providerAttemptId: input.providerAttemptId, providerDispatchedAt: input.authoritativeNow,
          providerAttemptPhase: PrismaProviderAttemptPhase.PROVIDER_CALL_STARTED,
          providerCallBudgetUsed: { increment: 1 }, updatedAt: input.authoritativeNow
        } });
        if (transition.count !== 1) return { outcome: 'fenced' as const, task: null };
        const dispatched = await tx.generationTask.findFirstOrThrow({ where: { tenantId: input.tenantId, id: input.taskId } });
        await createTaskEvent(tx, { task: dispatched, eventType: 'calling_model', message: '正在调用模型。',
          progress: dispatched.progress, requestId, createdAt: input.authoritativeNow });
        return { outcome: 'applied' as const, task: mapGenerationTask(dispatched) };
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) return { outcome: 'fenced' as const, task: null };
      throw error;
    }
  }

  async failLeasedAction(input: LeasedActionFailureInput) {
    const failure = leasedActionFailure(input.reason);
    return this.prisma.$transaction(async (tx) => {
      const transition = await tx.generationTask.updateMany({
        where: {
          tenantId: input.tenantId, id: input.taskId, status: PrismaTaskStatus.PROCESSING,
          leaseOwnerId: input.leaseOwnerId, leaseToken: input.leaseToken,
          leaseExpiresAt: { gt: input.authoritativeNow },
          providerAttemptPhase: input.expectedPhase.toUpperCase() as PrismaProviderAttemptPhase,
          ...(input.reason === 'retry_not_available' ? { retryOfTaskId: { not: null } } : {})
        },
        data: leaseFailureData(failure, input.authoritativeNow)
      });
      if (transition.count !== 1) return { outcome: 'fenced' as const, task: null };
      const task = await tx.generationTask.findFirstOrThrow({ where: { tenantId: input.tenantId, id: input.taskId } });
      const requestId = `worker:${input.leaseOwnerId.slice(0, 110)}`;
      await createTaskEvent(tx, { task, eventType: 'task_failed', message: failure.statusNote,
        progress: task.progress, requestId, createdAt: input.authoritativeNow });
      await tx.operationLog.create({ data: {
        tenantId: task.tenantId, userId: task.createdBy, novelId: task.novelId,
        action: 'generation_task_failed', objectType: 'generation_task', objectId: task.id,
        afterSnapshot: { failureCategory: failure.failureCategory, errorCode: failure.errorCode },
        reason: failure.statusNote, sourceTaskId: task.id, requestId, createdAt: input.authoritativeNow
      } });
      return { outcome: 'applied' as const, task: mapGenerationTask(task) };
    });
  }

  async finalizeLeasedAction(input: LeasedCreativeFinalizeInput) {
    const observed = await this.prisma.generationTask.findFirst({ where: { tenantId: input.tenantId, id: input.taskId } });
    if (!observed) return { outcome: 'fenced' as const, task: null };
    if (!['novel_direction_generate', 'novel_direction_fuse', 'novel_direction_optimize',
      'novel_setting_generate', 'novel_outline_generate',
      'stage_outline_generate', 'chapter_plan_generate', 'trial_writing_generate',
      'trial_followup_generate', 'chapter_overlength_revise', 'chapter_body_rewrite',
      'novel_full_review',
      'chapter_impact_assess'].includes(observed.taskType)) {
      const task = mapGenerationTask(observed);
      if (!task.providerAttemptPhase) return { outcome: 'fenced' as const, task: null };
      return this.failLeasedAction({ ...input, expectedPhase: task.providerAttemptPhase, reason: 'worker_payload_unsupported' });
    }
    if (!observed.novelId || !Number.isFinite(input.authoritativeNow.getTime())) return { outcome: 'fenced' as const, task: null };
    let observedEnvelope: ReturnType<typeof validateExecutionEnvelopeV1_1ForTask> | null = null;
    try {
      observedEnvelope = validateExecutionEnvelopeV1_1ForTask(mapGenerationTask(observed));
    } catch {
      // A malformed envelope is terminal only if the same live lease still owns it under the row lock.
    }
    return this.prisma.$transaction(async (tx) => {
      const authorityInput = observedEnvelope ? {
        action: observedEnvelope.action, tenantId: observedEnvelope.tenantId, novelId: observedEnvelope.novelId,
        objectId: observedEnvelope.objectId, sourceVersionRefs: observedEnvelope.sourceVersionRefs,
        normalizedRequest: observedEnvelope.normalizedRequest
      } : null;
      if (authorityInput) await lockGenerationAuthority(tx, authorityInput);
      else await lockNovelAuthorityRoot(tx, input.tenantId, observed.novelId!);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM generation_task WHERE tenant_id = ${input.tenantId} AND id = ${input.taskId} FOR UPDATE`);
      const current = await tx.generationTask.findFirst({ where: { tenantId: input.tenantId, id: input.taskId } });
      if (!current || current.novelId !== observed.novelId || current.taskType !== observed.taskType
        || current.status !== PrismaTaskStatus.PROCESSING || current.leaseOwnerId !== input.leaseOwnerId
        || current.leaseToken !== input.leaseToken || !current.leaseExpiresAt
        || current.leaseExpiresAt.getTime() <= input.authoritativeNow.getTime()
        || current.providerAttemptPhase !== PrismaProviderAttemptPhase.PROVIDER_RESULT_VALIDATED
        || typeof input.providerAttemptId !== 'string' || !input.providerAttemptId.trim()
        || current.providerAttemptId !== input.providerAttemptId
        || current.providerDispatchedAt === null || current.resultReceiptHash !== null
        || current.retryOfTaskId !== null || current.cancelRequestedAt !== null
        || current.providerCallBudgetUsed !== 1 || current.providerCallBudgetMax < 1
        || current.durationDeadlineAt.getTime() <= input.authoritativeNow.getTime()) {
        return { outcome: 'fenced' as const, task: null };
      }
      const fence = {
        tenantId: input.tenantId, id: input.taskId, novelId: current.novelId,
        taskType: observed.taskType, status: PrismaTaskStatus.PROCESSING,
        leaseOwnerId: input.leaseOwnerId, leaseToken: input.leaseToken,
        leaseExpiresAt: { gt: input.authoritativeNow }, providerAttemptId: input.providerAttemptId,
        providerAttemptPhase: PrismaProviderAttemptPhase.PROVIDER_RESULT_VALIDATED,
        providerDispatchedAt: { not: null }, providerCallBudgetUsed: 1,
        providerCallBudgetMax: { gte: 1 }, durationDeadlineAt: { gt: input.authoritativeNow },
        retryOfTaskId: null, cancelRequestedAt: null, resultReceiptHash: null
      };
      const requestId = `worker:${input.leaseOwnerId.slice(0, 110)}`;
      const fail = async (reason: 'worker_payload_unsupported' | 'source_stale') => {
        const failure = leasedActionFailure(reason);
        const transition = await tx.generationTask.updateMany({ where: fence, data: leaseFailureData(failure, input.authoritativeNow) });
        if (transition.count !== 1) return { outcome: 'fenced' as const, task: null };
        const failed = await tx.generationTask.findFirstOrThrow({ where: { tenantId: input.tenantId, id: input.taskId } });
        await createTaskEvent(tx, { task: failed, eventType: 'task_failed', message: failure.statusNote,
          progress: failed.progress, requestId, createdAt: input.authoritativeNow });
        await tx.operationLog.create({ data: {
          tenantId: failed.tenantId, userId: failed.createdBy, novelId: failed.novelId,
          action: 'generation_task_failed', objectType: 'generation_task', objectId: failed.id,
          afterSnapshot: { failureCategory: failure.failureCategory, errorCode: failure.errorCode },
          reason: failure.statusNote, sourceTaskId: failed.id, requestId, createdAt: input.authoritativeNow
        } });
        return { outcome: 'applied' as const, task: mapGenerationTask(failed) };
      };
      let envelope: ReturnType<typeof validateExecutionEnvelopeV1_1ForTask>;
      try {
        envelope = validateExecutionEnvelopeV1_1ForTask(mapGenerationTask(current));
      } catch {
        return fail('worker_payload_unsupported');
      }
      if (!observedEnvelope || !authorityInput || current.requestHash !== observed.requestHash
        || envelope.sourceVersionRefs.authoritySnapshotHash !== observedEnvelope.sourceVersionRefs.authoritySnapshotHash) {
        return fail('worker_payload_unsupported');
      }
      const authority = await this.loadGenerationAuthority(authorityInput, tx);
      if (!matchGenerationAuthority(authorityInput, envelope.sourceVersionRefs.authoritySnapshotHash, authority).ok) {
        return fail('source_stale');
      }
      if (current.taskType === 'novel_full_review') {
        const request = authorityRecord(envelope.normalizedRequest);
        const policyVersion = request.policyProfileVersionId;
        const novel = await this.findById(input.tenantId, current.novelId!, tx);
        const chapters = await tx.novelChapter.findMany({
          where: { tenantId: input.tenantId, novelId: current.novelId!, deletedAt: null },
          orderBy: [{ chapterNo: 'asc' }, { id: 'asc' }]
        });
        const priorReport = await tx.reviewReport.findFirst({
          where: { tenantId: input.tenantId, novelId: current.novelId!, sourceTaskId: current.id, reviewLevel: 'full_novel' }
        });
        if (!novel || novel.creationStage !== NovelCreationStage.Body || novel.stageStatus !== StageStatus.Completed
          || !current.idempotencyToken || typeof policyVersion !== 'string' || !policyVersion.trim()
          || !chapters.length || priorReport
          || chapters.some((chapter, index) => chapter.chapterNo !== index + 1
            || chapter.mainStatus !== 'completed' || !chapter.currentContentVersionId
            || !chapter.currentFeatureCardVersionId || !chapter.currentReviewReportId)) {
          return fail('source_stale');
        }
        let draft: FullReviewDraft;
        try {
          draft = validateFullReviewDraftForPersistence(input.validatedResult as FullReviewDraft, {
            expectedReviewPolicyVersionId: policyVersion,
            chapterManifest: chapters.map((chapter) => ({ chapterId: chapter.id, chapterNo: chapter.chapterNo }))
          });
          assertNoSensitiveExecutionPayload(draft, 'fullReviewResult');
        } catch {
          return fail('worker_payload_unsupported');
        }
        const reviewId = randomUUID().replaceAll('-', '');
        const issues = draft.issues.map((issue) => ({ ...issue, sourceReviewReportId: reviewId }));
        const blockingIssueCount = issues.filter((issue) => issue.blocking && issue.status === 'open').length;
        const warningIssueCount = issues.filter((issue) => issue.severity === 'warning' && issue.status === 'open').length;
        const allowCompletion = draft.gateResult !== 'blocked';
        await tx.reviewReport.create({ data: {
          id: reviewId, tenantId: input.tenantId, novelId: current.novelId!,
          objectType: 'novel', objectId: current.novelId!, objectVersionId: null,
          reviewLevel: 'full_novel', totalScore: draft.totalScore,
          subScoresJson: toJsonObject(draft.dimensionScores), rating: draft.rating,
          summary: draft.summary, strengthsJson: toJsonObject(draft.strengths),
          problemsJson: toJsonObject(draft.problems), suggestionsJson: toJsonObject(draft.suggestions),
          issueCardsJson: toJsonObject(issues), actionOptionsJson: toJsonObject(draft.suggestions),
          recommendedAction: allowCompletion ? '确认小说完成' : '优化全书问题',
          allowNextStep: allowCompletion, blockingIssueCount, resolvedStatus: 'open',
          promptTemplateVersionId: null, policyProfileVersionId: draft.reviewPolicyVersionId,
          sourceTaskId: current.id, createdAt: input.authoritativeNow,
          metadata: toJsonObject({
            version: 1, reviewPolicyVersionId: draft.reviewPolicyVersionId,
            videoSuggestion: draft.videoSuggestion, firstVideoSuggestion: draft.firstVideoSuggestion,
            platformRisks: draft.platformRisks, originalityRisks: draft.originalityRisks,
            aiFlavorRisks: draft.aiFlavorRisks, lowScoreContinueRisks: draft.lowScoreContinueRisks,
            sourceVersionRefs: envelope.sourceVersionRefs,
            requestFingerprint: fullReviewRequestFingerprintFromExecution(envelope)
          })
        } });
        const gate = await tx.fullReviewGate.create({ data: {
          tenantId: input.tenantId, novelId: current.novelId!, reviewReportId: reviewId,
          gateResult: draft.gateResult, allowCompletion, allowVideoReady: allowCompletion,
          blockingIssueCount, warningIssueCount, isStale: false, staleReason: null,
          policyProfileVersionId: draft.reviewPolicyVersionId, createdAt: input.authoritativeNow,
          metadata: toJsonObject({
            score: draft.totalScore, idempotencyKey: current.idempotencyToken,
            forcePassAllowed: draft.gateResult === 'blocked' && draft.totalScore >= 60 && draft.totalScore < 70,
            forcePassReason: null, sourceVersionRefs: envelope.sourceVersionRefs,
            updatedAt: input.authoritativeNow.toISOString()
          })
        } });
        await tx.novel.update({ where: { id: novel.id, tenantId: input.tenantId }, data: {
          creationStage: allowCompletion ? PrismaNovelCreationStage.COMPLETION_CONFIRM : PrismaNovelCreationStage.FULL_REVIEW,
          stageStatus: allowCompletion ? PrismaStageStatus.WAITING_USER : PrismaStageStatus.BLOCKED,
          updatedBy: current.createdBy, updatedAt: input.authoritativeNow
        } });
        const receipt = createSafeResultReceipt(mapGenerationTask(current), {
          status: 'completed', outcome: 'review_created', resultObjectType: 'full_review',
          resultObjectId: reviewId, resultVersionIds: [], resultCount: 1
        });
        const statusNote = '全书审稿完成，已生成完成门禁。';
        const transition = await tx.generationTask.updateMany({ where: fence, data: {
          status: PrismaTaskStatus.COMPLETED, statusNote, progress: 100,
          currentStep: allowCompletion ? '全书审稿已完成，可确认小说完成。' : '全书审稿已完成，请先处理阻塞问题。',
          outputSummary: draft.summary, resultObjectType: 'full_review', resultObjectId: reviewId,
          resultVersionId: null, resultVersionIdsJson: [], resultReceiptHash: receipt.hash,
          providerAttemptPhase: PrismaProviderAttemptPhase.FINALIZING,
          activeClaimKey: null, leaseOwnerId: null, leaseToken: null, leaseExpiresAt: null,
          finishedAt: input.authoritativeNow, updatedAt: input.authoritativeNow
        } });
        if (transition.count !== 1) throw new Error('Full review lost its fenced task transition.');
        const finalized = await tx.generationTask.findFirstOrThrow({ where: { tenantId: input.tenantId, id: current.id } });
        await createTaskEvent(tx, { task: finalized, eventType: 'task_finalized',
          message: statusNote, progress: 100, requestId, createdAt: input.authoritativeNow });
        await tx.operationLog.create({ data: {
          tenantId: input.tenantId, userId: current.createdBy, novelId: current.novelId,
          action: 'generation_task_finalized', objectType: 'generation_task', objectId: current.id,
          afterSnapshot: { resultObjectId: reviewId, gateId: gate.id, receiptHash: receipt.hash },
          reason: '全书审稿生成完成', sourceTaskId: current.id,
          requestId, createdAt: input.authoritativeNow
        } });
        return { outcome: 'applied' as const, task: mapGenerationTask(finalized) };
      }
      if (current.taskType === 'chapter_impact_assess' && envelope.action === 'chapter_adopt_impact_assess') {
        const refs = authorityRecord(envelope.sourceVersionRefs);
        const request = authorityRecord(envelope.normalizedRequest);
        const novel = await this.findById(input.tenantId, current.novelId!, tx);
        const chapterRow = await tx.novelChapter.findFirst({ where: {
          tenantId: input.tenantId, novelId: current.novelId!, id: envelope.objectId, deletedAt: null
        } });
        const chapter = chapterRow ? mapNovelChapter(chapterRow) : null;
        const currentContent = typeof refs.currentContentVersionId === 'string'
          ? await this.findChapterContentVersionById(input.tenantId, current.novelId!, refs.currentContentVersionId, tx)
          : null;
        const candidate = typeof refs.candidateVersionId === 'string'
          ? await this.findChapterContentVersionById(input.tenantId, current.novelId!, refs.candidateVersionId, tx)
          : null;
        if (envelope.action !== 'chapter_adopt_impact_assess' || !novel || !chapter || !currentContent || !candidate
          || request.chapterId !== chapter.id || request.currentContentVersionId !== currentContent.id
          || request.candidateVersionId !== candidate.id
          || chapter.currentContentVersionId !== currentContent.id || currentContent.chapterId !== chapter.id
          || currentContent.status !== VersionStatus.Current || currentContent.staleLevel !== StaleLevel.None
          || candidate.chapterId !== chapter.id || candidate.id === currentContent.id
          || candidate.status !== VersionStatus.Candidate || candidate.staleLevel !== StaleLevel.None
          || (Object.hasOwn(authorityRecord(candidate.sourceVersionRefs), 'currentContentVersionId')
            && authorityRecord(candidate.sourceVersionRefs).currentContentVersionId !== currentContent.id)
          || authorityRecord(candidate.metadata).reviewRequired === true
          || candidate.sourceType?.startsWith('ai_overlength_')
          || candidate.wordCount !== evaluateChapterLength(candidate.content, chapter.wordTarget).actual
          || evaluateChapterLength(candidate.content, chapter.wordTarget).status !== 'pass') {
          return fail('source_stale');
        }
        const pageSnapshot = request.pageVersionSnapshot;
        if (pageSnapshot !== undefined && (!pageSnapshot || typeof pageSnapshot !== 'object'
          || Array.isArray(pageSnapshot) || JSON.stringify(pageSnapshot).length > 4096)) {
          return fail('worker_payload_unsupported');
        }
        const snapshot = authorityRecord(pageSnapshot);
        if ((Object.hasOwn(snapshot, 'currentContentVersionId')
            && snapshot.currentContentVersionId !== currentContent.id)
          || (Object.hasOwn(snapshot, 'seenCandidateVersionId')
            && snapshot.seenCandidateVersionId !== candidate.id)
          || (Object.hasOwn(snapshot, 'candidateVersionId')
            && snapshot.candidateVersionId !== candidate.id)) return fail('source_stale');
        if (!validPrismaLeasedImpactDraft(input.validatedResult)) return fail('worker_payload_unsupported');
        const impact = input.validatedResult;
        const suppliedReason = typeof request.reason === 'string'
          && request.reason.trim() !== '采用候选前影响评估' ? request.reason.trim() : '';
        if (impact.blocksFullReview && !suppliedReason) return fail('worker_payload_unsupported');
        const reason = suppliedReason || '采用章节候选正文';
        try {
          assertNoSensitiveExecutionPayload({ impact, pageSnapshot: snapshot }, 'chapterAdoptImpactResult');
        } catch {
          return fail('worker_payload_unsupported');
        }
        const comparison = authorityRecord(authorityRecord(candidate.metadata).summaryCompare);
        const summaryCompare: ChapterSummaryCompareDTO = validPrismaLeasedSummaryCompare(comparison)
          ? comparison : {
            currentSummary: currentContent.summary ?? '', candidateSummary: candidate.summary ?? '',
            benefit: '候选版本优化了本章表达和钩子。', newRisks: [],
            possibleImpact: '预计主要影响本章表达。', aiSuggestion: '采用前请确认摘要对比和影响提示。'
          };
        try {
          assertNoSensitiveExecutionPayload(summaryCompare, 'chapterAdoptSummaryCompare');
        } catch {
          return fail('worker_payload_unsupported');
        }
        const decision = await tx.assetDecisionRecord.create({ data: {
          tenantId: input.tenantId, novelId: current.novelId!, actionType: 'adopt_chapter_content',
          objectType: 'chapter_content', objectId: chapter.id,
          candidateVersionId: candidate.id, currentVersionIdBefore: currentContent.id,
          currentVersionIdAfter: candidate.id, decisionReason: reason, isForced: impact.blocksFullReview,
          riskSummary: summaryCompare.newRisks.join('；'), impactSummary: impact.summary,
          pageVersionSnapshot: toJsonObject(pageSnapshot ?? { currentContentVersionId: currentContent.id,
            seenCandidateVersionId: candidate.id }), sourceTaskId: current.id,
          createdBy: current.createdBy, createdAt: input.authoritativeNow
        } });
        const impactCase = await tx.impactCase.create({ data: {
          tenantId: input.tenantId, novelId: current.novelId!, sourceObjectType: 'chapter',
          sourceObjectId: chapter.id, sourceOldVersionId: currentContent.id,
          sourceNewVersionId: candidate.id,
          impactLevel: PrismaImpactLevel[impact.impactLevel.toUpperCase() as keyof typeof PrismaImpactLevel],
          status: impact.blocksFullReview ? 'waiting_decision'
            : impact.impactLevel === 'none' ? 'resolved' : 'ignored',
          affectedChapterIdsJson: impact.affectedChapterIds,
          affectedVideoReferenceIdsJson: impact.affectedVideoReferenceIds,
          summary: impact.summary, suggestedActionsJson: impact.suggestedActions,
          decisionRecordId: decision.id, sourceTaskId: current.id,
          createdAt: input.authoritativeNow,
          resolvedAt: impact.blocksFullReview ? null : input.authoritativeNow,
          metadata: toJsonObject({ changedFacts: impact.changedFacts,
            recommendedHandling: impact.recommendedHandling,
            blocksFullReview: impact.blocksFullReview, summaryCompare })
        } });
        const priorTransition = await tx.chapterContentVersion.updateMany({ where: {
          tenantId: input.tenantId, novelId: current.novelId!, chapterId: chapter.id,
          id: currentContent.id, status: PrismaVersionStatus.CURRENT,
          staleLevel: PrismaStaleLevel.NONE
        }, data: { status: PrismaVersionStatus.HISTORICAL } });
        if (priorTransition.count !== 1) throw new Error('Chapter adoption lost its prior version transition.');
        const candidateTransition = await tx.chapterContentVersion.updateMany({ where: {
          tenantId: input.tenantId, novelId: current.novelId!, chapterId: chapter.id,
          id: candidate.id, status: PrismaVersionStatus.CANDIDATE,
          staleLevel: PrismaStaleLevel.NONE
        }, data: { status: PrismaVersionStatus.CURRENT, decisionRecordId: decision.id } });
        if (candidateTransition.count !== 1) throw new Error('Chapter adoption lost its candidate version transition.');
        const chapterTransition = await tx.novelChapter.updateMany({ where: {
          tenantId: input.tenantId, novelId: current.novelId!, id: chapter.id,
          deletedAt: null, currentContentVersionId: currentContent.id
        }, data: {
          currentContentVersionId: candidate.id, wordCount: candidate.wordCount,
          mainStatus: impact.blocksFullReview ? 'pending' : 'completed',
          statusNote: impact.blocksFullReview ? '重写采用后影响未关闭。' : '重写已采用，影响已同步。',
          impactLevel: PrismaImpactLevel[impact.impactLevel.toUpperCase() as keyof typeof PrismaImpactLevel],
          lastGenerationTaskId: current.id, updatedAt: input.authoritativeNow
        } });
        if (chapterTransition.count !== 1) throw new Error('Chapter adoption lost its chapter transition.');
        const novelTransition = await tx.novel.updateMany({ where: {
          tenantId: input.tenantId, id: current.novelId!, deletedAt: null,
          lifecycleStatus: PrismaNovelLifecycleStatus.ACTIVE,
          currentDirectionVersionId: novel.currentDirectionVersionId,
          currentSettingVersionId: novel.currentSettingVersionId,
          currentOutlineVersionId: novel.currentOutlineVersionId,
          currentStageOutlineVersionId: novel.currentStageOutlineVersionId,
          currentChapterPlanVersionId: novel.currentChapterPlanVersionId
        }, data: {
          creationStage: PrismaNovelCreationStage.BODY,
          stageStatus: impact.blocksFullReview ? PrismaStageStatus.BLOCKED : PrismaStageStatus.NOT_STARTED,
          updatedBy: current.createdBy, updatedAt: input.authoritativeNow
        } });
        if (novelTransition.count !== 1) throw new Error('Chapter adoption lost its novel transition.');
        const receipt = createSafeResultReceipt(mapGenerationTask(current), {
          status: 'completed', outcome: 'completed', resultObjectType: 'impact_case',
          resultObjectId: impactCase.id, resultVersionIds: [candidate.id], resultCount: 1
        });
        const transition = await tx.generationTask.updateMany({ where: fence, data: {
          status: PrismaTaskStatus.COMPLETED, statusNote: '候选已采用，影响评估已记录。',
          progress: 100, currentStep: '章节候选已采用', outputSummary: '章节候选已采用，影响评估已记录。',
          resultObjectType: 'impact_case', resultObjectId: impactCase.id,
          resultVersionId: candidate.id, resultVersionIdsJson: [candidate.id],
          resultReceiptHash: receipt.hash, providerAttemptPhase: PrismaProviderAttemptPhase.FINALIZING,
          activeClaimKey: null, leaseOwnerId: null, leaseToken: null, leaseExpiresAt: null,
          finishedAt: input.authoritativeNow, updatedAt: input.authoritativeNow
        } });
        if (transition.count !== 1) throw new Error('Chapter adoption lost its fenced task transition.');
        const finalized = await tx.generationTask.findFirstOrThrow({ where: { tenantId: input.tenantId, id: current.id } });
        await createTaskEvent(tx, { task: finalized, eventType: 'task_finalized',
          message: finalized.statusNote!, progress: 100, requestId, createdAt: input.authoritativeNow });
        await tx.operationLog.create({ data: {
          tenantId: input.tenantId, userId: current.createdBy, novelId: current.novelId,
          action: 'adopt_chapter_content', objectType: 'chapter', objectId: chapter.id,
          beforeSnapshot: { currentContentVersionId: currentContent.id },
          afterSnapshot: { currentContentVersionId: candidate.id, impactCaseId: impactCase.id },
          reason, impactSummary: impact.summary, sourceTaskId: current.id,
          requestId, createdAt: input.authoritativeNow
        } });
        await tx.operationLog.create({ data: {
          tenantId: input.tenantId, userId: current.createdBy, novelId: current.novelId,
          action: 'generation_task_finalized', objectType: 'generation_task', objectId: current.id,
          afterSnapshot: { resultObjectId: impactCase.id, resultVersionIds: [candidate.id],
            receiptHash: receipt.hash },
          reason: '章节候选采用与影响评估完成', impactSummary: impact.summary,
          sourceTaskId: current.id, requestId, createdAt: input.authoritativeNow
        } });
        return { outcome: 'applied' as const, task: mapGenerationTask(finalized) };
      }
      if (current.taskType === 'chapter_body_rewrite') {
        const refs = authorityRecord(envelope.sourceVersionRefs);
        const chapterRow = await tx.novelChapter.findFirst({ where: {
          tenantId: input.tenantId, novelId: current.novelId!, id: envelope.objectId, deletedAt: null
        } });
        const chapter = chapterRow ? mapNovelChapter(chapterRow) : null;
        const currentContent = typeof refs.currentContentVersionId === 'string'
          ? await this.findChapterContentVersionById(input.tenantId, current.novelId!, refs.currentContentVersionId, tx)
          : null;
        if (envelope.action !== 'chapter_rewrite' || !chapter || !currentContent
          || chapter.currentContentVersionId !== currentContent.id
          || currentContent.chapterId !== chapter.id || currentContent.status !== VersionStatus.Current) {
          return fail('source_stale');
        }
        const raw: unknown = input.validatedResult;
        let candidate: ReturnType<typeof bindGeneratedBodyChapter>;
        let summaryCompare: ChapterSummaryCompareDTO;
        try {
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)
            || !Object.hasOwn(raw, 'candidate') || !Object.hasOwn(raw, 'summaryCompare')
            || Object.keys(raw).length !== 2
            || !validPrismaLeasedSummaryCompare((raw as Record<string, unknown>).summaryCompare)) {
            throw new Error('invalid chapter rewrite result');
          }
          const result = raw as { candidate: BodyChapterProviderDraft; summaryCompare: ChapterSummaryCompareDTO };
          candidate = bindGeneratedBodyChapter(chapter, result.candidate);
          summaryCompare = result.summaryCompare;
          assertNoSensitiveExecutionPayload({
            candidate: {
              ...result.candidate,
              review: {
                ...result.candidate.review,
                issueCards: result.candidate.review.issueCards.map(({ message, ...issue }) => ({ ...issue, issueText: message }))
              }
            },
            summaryCompare
          }, 'chapterRewriteResult');
        } catch {
          return fail('worker_payload_unsupported');
        }
        const request = authorityRecord(envelope.normalizedRequest);
        const reason = typeof request.reason === 'string' && request.reason.trim()
          ? request.reason.trim() : '生成章节重写候选';
        const versionNo = await getNextChapterContentVersionNo(tx, input.tenantId, current.novelId!, chapter.id);
        const version = await tx.chapterContentVersion.create({ data: {
          tenantId: input.tenantId, novelId: current.novelId!, chapterId: chapter.id,
          versionNo, status: PrismaVersionStatus.CANDIDATE, staleLevel: PrismaStaleLevel.NONE,
          sourceType: current.modelRoutingVersion?.startsWith('deepseek:') ? 'deepseek' : 'mock_ai',
          sourceTaskId: current.id, sourceVersionRefs: toJsonObject(envelope.sourceVersionRefs),
          rewriteReason: reason, content: candidate.content, wordCount: countWords(candidate.content),
          summary: candidate.summary, reviewScore: candidate.scoring.totalScore,
          createdBy: current.createdBy, createdAt: input.authoritativeNow,
          metadata: toJsonObject({
            chapterNo: chapter.chapterNo, title: chapter.title,
            openingStrategy: candidate.openingStrategy, openingHighlight: candidate.openingHighlight,
            firstSentence: candidate.firstSentence, first300Summary: candidate.first300Summary,
            endingHook: candidate.endingHook, riskLevel: candidate.riskLevel,
            riskTags: candidate.riskTags, aiRecommendedReason: candidate.aiRecommendedReason,
            isAiRecommended: false, isSelected: false, scoring: candidate.scoring, summaryCompare
          })
        } });
        const receipt = createSafeResultReceipt(mapGenerationTask(current), {
          status: 'waiting_confirmation', outcome: 'candidate_created',
          resultObjectType: 'chapter_content_version', resultObjectId: version.id,
          resultVersionIds: [version.id], resultCount: 1
        });
        const transition = await tx.generationTask.updateMany({ where: fence, data: {
          status: PrismaTaskStatus.WAITING_CONFIRMATION,
          statusNote: '章节重写候选已生成，等待采用', progress: 100,
          currentStep: '章节重写候选已生成，等待采用', outputSummary: summaryCompare.candidateSummary,
          resultObjectType: 'chapter_content_version', resultObjectId: version.id,
          resultVersionId: version.id, resultVersionIdsJson: [version.id],
          resultReceiptHash: receipt.hash, providerAttemptPhase: PrismaProviderAttemptPhase.FINALIZING,
          activeClaimKey: null, leaseOwnerId: null, leaseToken: null, leaseExpiresAt: null,
          finishedAt: input.authoritativeNow, updatedAt: input.authoritativeNow
        } });
        if (transition.count !== 1) throw new Error('Chapter rewrite lost its fenced task transition.');
        const finalized = await tx.generationTask.findFirstOrThrow({ where: { tenantId: input.tenantId, id: current.id } });
        await createTaskEvent(tx, { task: finalized, eventType: 'task_finalized',
          message: finalized.statusNote!, progress: 100, requestId, createdAt: input.authoritativeNow });
        await tx.operationLog.create({ data: {
          tenantId: input.tenantId, userId: current.createdBy, novelId: current.novelId,
          action: 'generation_task_finalized', objectType: 'generation_task', objectId: current.id,
          afterSnapshot: { resultVersionIds: [version.id], receiptHash: receipt.hash },
          reason: '章节重写候选生成完成', sourceTaskId: current.id,
          requestId, createdAt: input.authoritativeNow
        } });
        return { outcome: 'applied' as const, task: mapGenerationTask(finalized) };
      }
      if (current.taskType === 'chapter_impact_assess') {
        const refs = authorityRecord(envelope.sourceVersionRefs);
        const chapterRow = await tx.novelChapter.findFirst({ where: {
          tenantId: input.tenantId, novelId: current.novelId!, id: envelope.objectId, deletedAt: null
        } });
        const chapter = chapterRow ? mapNovelChapter(chapterRow) : null;
        const currentContent = typeof refs.currentContentVersionId === 'string'
          ? await this.findChapterContentVersionById(input.tenantId, current.novelId!, refs.currentContentVersionId, tx)
          : null;
        if (envelope.action !== 'chapter_impact_assess' || !chapter || !currentContent
          || chapter.currentContentVersionId !== currentContent.id
          || currentContent.chapterId !== chapter.id || currentContent.status !== VersionStatus.Current) {
          return fail('source_stale');
        }
        if (!validPrismaLeasedImpactDraft(input.validatedResult)) return fail('worker_payload_unsupported');
        const impact = input.validatedResult;
        try {
          assertNoSensitiveExecutionPayload(impact, 'chapterImpactResult');
        } catch {
          return fail('worker_payload_unsupported');
        }
        const request = authorityRecord(envelope.normalizedRequest);
        const reason = typeof request.reason === 'string' && request.reason.trim()
          ? request.reason.trim() : '手动发起章节影响评估';
        const status = impact.blocksFullReview ? 'waiting_decision'
          : impact.impactLevel === 'none' ? 'resolved' : 'ignored';
        const impactCase = await tx.impactCase.create({ data: {
          tenantId: input.tenantId, novelId: current.novelId!, sourceObjectType: 'chapter',
          sourceObjectId: chapter.id, sourceOldVersionId: currentContent.id,
          sourceNewVersionId: currentContent.id,
          impactLevel: PrismaImpactLevel[impact.impactLevel.toUpperCase() as keyof typeof PrismaImpactLevel],
          status, affectedChapterIdsJson: impact.affectedChapterIds,
          affectedVideoReferenceIdsJson: impact.affectedVideoReferenceIds,
          summary: impact.summary, suggestedActionsJson: impact.suggestedActions,
          decisionRecordId: null, sourceTaskId: current.id, createdAt: input.authoritativeNow,
          resolvedAt: impact.blocksFullReview ? null : input.authoritativeNow,
          metadata: toJsonObject({
            changedFacts: impact.changedFacts, recommendedHandling: impact.recommendedHandling,
            blocksFullReview: impact.blocksFullReview, reason,
            summaryCompare: {
              currentSummary: currentContent.summary ?? '', candidateSummary: currentContent.summary ?? '',
              benefit: '补充影响评估', newRisks: [], possibleImpact: impact.summary,
              aiSuggestion: impact.recommendedHandling
            }
          })
        } });
        const receipt = createSafeResultReceipt(mapGenerationTask(current), {
          status: 'completed', outcome: 'completed', resultObjectType: 'impact_case',
          resultObjectId: impactCase.id, resultVersionIds: [], resultCount: 1
        });
        const transition = await tx.generationTask.updateMany({ where: fence, data: {
          status: PrismaTaskStatus.COMPLETED, statusNote: '影响评估已生成', progress: 100,
          currentStep: '影响评估已生成', outputSummary: impact.summary,
          resultObjectType: 'impact_case', resultObjectId: impactCase.id,
          resultVersionId: null, resultVersionIdsJson: [], resultReceiptHash: receipt.hash,
          providerAttemptPhase: PrismaProviderAttemptPhase.FINALIZING,
          activeClaimKey: null, leaseOwnerId: null, leaseToken: null, leaseExpiresAt: null,
          finishedAt: input.authoritativeNow, updatedAt: input.authoritativeNow
        } });
        if (transition.count !== 1) throw new Error('Chapter impact assessment lost its fenced task transition.');
        const finalized = await tx.generationTask.findFirstOrThrow({ where: { tenantId: input.tenantId, id: current.id } });
        await createTaskEvent(tx, { task: finalized, eventType: 'task_finalized',
          message: finalized.statusNote!, progress: 100, requestId, createdAt: input.authoritativeNow });
        await tx.operationLog.create({ data: {
          tenantId: input.tenantId, userId: current.createdBy, novelId: current.novelId,
          action: 'generation_task_finalized', objectType: 'generation_task', objectId: current.id,
          afterSnapshot: { resultObjectId: impactCase.id, receiptHash: receipt.hash },
          reason: '章节影响评估完成', sourceTaskId: current.id,
          requestId, createdAt: input.authoritativeNow
        } });
        return { outcome: 'applied' as const, task: mapGenerationTask(finalized) };
      }
      if (current.taskType === 'chapter_overlength_revise') {
        const refs = authorityRecord(envelope.sourceVersionRefs);
        const novel = await this.findById(input.tenantId, current.novelId!, tx);
        const chapterRow = await tx.novelChapter.findFirst({ where: {
          tenantId: input.tenantId, novelId: current.novelId!, id: envelope.objectId, deletedAt: null
        } });
        const chapter = chapterRow ? mapNovelChapter(chapterRow) : null;
        const original = typeof refs.candidateVersionId === 'string'
          ? await this.findChapterContentVersionById(input.tenantId, current.novelId!, refs.candidateVersionId, tx)
          : null;
        const priorRevision = chapter ? await tx.chapterContentVersion.findFirst({ where: {
          tenantId: input.tenantId, novelId: current.novelId!, chapterId: chapter.id,
          sourceType: 'ai_overlength_revision'
        } }) : null;
        if (envelope.action !== 'chapter_overlength_revise' || !novel || !chapter || !original
          || novel.creationStage !== NovelCreationStage.Body
          || novel.currentChapterPlanVersionId !== refs.currentChapterPlanVersionId
          || chapter.currentContentVersionId !== null || refs.currentContentVersionId !== null
          || original.chapterId !== chapter.id || original.status !== VersionStatus.Candidate
          || original.staleLevel !== StaleLevel.None || original.sourceType !== 'ai_overlength_original'
          || authorityRecord(original.sourceVersionRefs).currentChapterPlanVersionId !== novel.currentChapterPlanVersionId
          || authorityRecord(authorityRecord(original.metadata).lengthGate).target !== chapter.wordTarget
          || evaluateChapterLength(original.content, chapter.wordTarget).status !== 'too_long'
          || priorRevision) return fail('source_stale');
        if (typeof input.validatedResult !== 'string'
          || !isBoundedOverlengthRevision(original.content, input.validatedResult, chapter.wordTarget)) {
          return fail('worker_payload_unsupported');
        }
        try {
          assertNoSensitiveExecutionPayload({ content: input.validatedResult }, 'overlengthRevision');
        } catch {
          return fail('worker_payload_unsupported');
        }
        const lengthGate = evaluateChapterLength(input.validatedResult, chapter.wordTarget);
        const versionNo = await getNextChapterContentVersionNo(tx, input.tenantId, current.novelId!, chapter.id);
        const candidate = await tx.chapterContentVersion.create({ data: {
          tenantId: input.tenantId, novelId: current.novelId!, chapterId: chapter.id,
          versionNo, status: PrismaVersionStatus.CANDIDATE, staleLevel: PrismaStaleLevel.NONE,
          sourceType: 'ai_overlength_revision', sourceTaskId: current.id,
          sourceVersionRefs: toJsonObject(envelope.sourceVersionRefs),
          rewriteReason: '用户发起超长正文精简', content: input.validatedResult,
          wordCount: lengthGate.actual, summary: null, reviewScore: null,
          createdBy: current.createdBy, createdAt: input.authoritativeNow,
          metadata: toJsonObject({ reviewRequired: true, lengthRecovery: 'revision',
            revisionOfCandidateId: original.id, lengthGate, chapterNo: chapter.chapterNo,
            title: chapter.title, riskLevel: RiskLevel.Medium })
        } });
        const receipt = createSafeResultReceipt(mapGenerationTask(current), {
          status: 'waiting_confirmation', outcome: 'candidate_created',
          resultObjectType: 'chapter_content_version', resultObjectId: candidate.id,
          resultVersionIds: [candidate.id], resultCount: 1
        });
        const transition = await tx.generationTask.updateMany({ where: fence, data: {
          status: PrismaTaskStatus.WAITING_CONFIRMATION,
          statusNote: '超长精简候选已保存，待逐版本复核。', progress: 100,
          currentStep: '精简候选待复核', outputSummary: '精简候选已保存，正式正文未改变。',
          resultObjectType: 'chapter_content_version', resultObjectId: candidate.id,
          resultVersionId: candidate.id, resultVersionIdsJson: [candidate.id],
          resultReceiptHash: receipt.hash, providerAttemptPhase: PrismaProviderAttemptPhase.FINALIZING,
          activeClaimKey: null, leaseOwnerId: null, leaseToken: null, leaseExpiresAt: null,
          finishedAt: input.authoritativeNow, updatedAt: input.authoritativeNow
        } });
        if (transition.count !== 1) throw new Error('Overlength revision lost its fenced task transition.');
        const finalized = await tx.generationTask.findFirstOrThrow({ where: { tenantId: input.tenantId, id: current.id } });
        await createTaskEvent(tx, { task: finalized, eventType: 'task_finalized',
          message: finalized.statusNote!, progress: 100, requestId, createdAt: input.authoritativeNow });
        await tx.operationLog.create({ data: {
          tenantId: input.tenantId, userId: current.createdBy, novelId: current.novelId,
          action: 'generation_task_finalized', objectType: 'generation_task', objectId: current.id,
          afterSnapshot: { resultVersionIds: [candidate.id], receiptHash: receipt.hash },
          reason: '超长正文精简候选生成完成', sourceTaskId: current.id,
          requestId, createdAt: input.authoritativeNow
        } });
        return { outcome: 'applied' as const, task: mapGenerationTask(finalized) };
      }
      if (current.taskType === 'trial_followup_generate') {
        const refs = authorityRecord(envelope.sourceVersionRefs);
        const request = authorityRecord(envelope.normalizedRequest);
        const novel = await this.findById(input.tenantId, current.novelId!, tx);
        const trialRun = await this.findTrialRunById(input.tenantId, current.novelId!, envelope.objectId, tx);
        const selected = typeof refs.selectedChapterOneCandidateId === 'string'
          ? await this.findChapterContentVersionById(input.tenantId, current.novelId!,
            refs.selectedChapterOneCandidateId, tx) : null;
        const chapters = (await this.listNovelChapters(input.tenantId, current.novelId!, tx))
          .slice(0, trialRun?.trialChapterCount ?? 0);
        const sourceTask = trialRun?.sourceTaskId
          ? await tx.generationTask.findFirst({ where: { tenantId: input.tenantId, id: trialRun.sourceTaskId } }) : null;
        if (envelope.action !== 'trial_followup_generate' || !novel || !trialRun || !selected
          || trialRun.status !== 'waiting_chapter1_selection'
          || trialRun.chapterPlanVersionId !== novel.currentChapterPlanVersionId
          || trialRun.trialChapterCount < 2 || trialRun.trialChapterCount > 5
          || chapters.length !== trialRun.trialChapterCount
          || chapters.some((chapter, index) => chapter.chapterNo !== index + 1)
          || selected.status !== VersionStatus.Candidate || selected.chapterId !== chapters[0]?.id
          || authorityRecord(selected.metadata).trialRunId !== trialRun.id
          || request.trialRunId !== trialRun.id || request.selectedCandidateVersionId !== selected.id
          || !sourceTask || sourceTask.id === current.id
          || sourceTask.status !== PrismaTaskStatus.WAITING_CONFIRMATION) return fail('source_stale');
        const raw = input.validatedResult;
        let bound;
        let review: TrialReviewDraft;
        try {
          if (!validPrismaLeasedTrialFollowupResult(raw)) {
            throw new Error('invalid trial followup result');
          }
          review = raw.review;
          bound = bindTrialFollowupChapters(chapters, raw.chapters, review);
          if (bound[0]?.chapter.id !== selected.chapterId || bound[0]?.content !== selected.content) {
            throw new Error('selected opening changed in followup');
          }
          assertNoSensitiveExecutionPayload(trialFollowupSensitiveProbe(raw), 'trialFollowupResult');
        } catch {
          return fail('worker_payload_unsupported');
        }
        const context = { tenantId: input.tenantId, userId: current.createdBy!, requestId };
        const generationInput: TrialFollowupGenerationInput = {
          novel, trialRun, task: mapGenerationTask(current), selectedCandidate: selected,
          chapters: bound, review, context, now: input.authoritativeNow
        };
        const contentVersionIds = await persistLeasedTrialFollowupAssets(tx, generationInput,
          sourceTask.id, envelope.sourceVersionRefs, current.modelRoutingVersion);
        const blocked = review.trialResult === 'blocked';
        const receipt = createSafeResultReceipt(mapGenerationTask(current), {
          status: 'waiting_confirmation', outcome: 'review_created',
          resultObjectType: 'trial_run', resultObjectId: trialRun.id,
          resultVersionIds: contentVersionIds, resultCount: contentVersionIds.length
        });
        const transition = await tx.generationTask.updateMany({ where: fence, data: {
          status: PrismaTaskStatus.WAITING_CONFIRMATION,
          statusNote: '模型服务已生成试写结果，等待用户确认。', progress: 100,
          currentStep: blocked ? '第2章硬门槛未通过，试写暂停' : '前三章试写总评已生成，等待确认',
          resultObjectType: 'trial_run', resultObjectId: trialRun.id,
          resultVersionId: contentVersionIds[0]!, resultVersionIdsJson: contentVersionIds,
          outputSummary: review.summary, resultReceiptHash: receipt.hash,
          providerAttemptPhase: PrismaProviderAttemptPhase.FINALIZING,
          activeClaimKey: null, leaseOwnerId: null, leaseToken: null, leaseExpiresAt: null,
          finishedAt: input.authoritativeNow, updatedAt: input.authoritativeNow
        } });
        if (transition.count !== 1) throw new Error('Trial followup lost its fenced task transition.');
        const novelTransition = await tx.novel.updateMany({ where: {
          tenantId: input.tenantId, id: current.novelId!, deletedAt: null,
          lifecycleStatus: PrismaNovelLifecycleStatus.ACTIVE,
          currentChapterPlanVersionId: trialRun.chapterPlanVersionId
        }, data: { creationStage: PrismaNovelCreationStage.TRIAL,
          stageStatus: blocked ? PrismaStageStatus.BLOCKED : PrismaStageStatus.WAITING_USER,
          updatedBy: current.createdBy, updatedAt: input.authoritativeNow } });
        if (novelTransition.count !== 1) throw new Error('Trial followup lost its novel stage transition.');
        const finalized = await tx.generationTask.findFirstOrThrow({ where: { tenantId: input.tenantId, id: current.id } });
        await createTaskEvent(tx, { task: finalized, eventType: 'task_finalized',
          message: finalized.statusNote!, progress: 100,
          requestId, createdAt: input.authoritativeNow });
        await tx.operationLog.create({ data: {
          tenantId: input.tenantId, userId: current.createdBy, novelId: current.novelId,
          action: 'generation_task_finalized', objectType: 'generation_task', objectId: current.id,
          afterSnapshot: { resultVersionIds: receipt.receipt.resultVersionIds, receiptHash: receipt.hash },
          reason: '后续试写与总评生成完成', sourceTaskId: current.id,
          requestId, createdAt: input.authoritativeNow
        } });
        return { outcome: 'applied' as const, task: mapGenerationTask(finalized) };
      }
      if (current.taskType === 'trial_writing_generate') {
        const request = authorityRecord(envelope.normalizedRequest);
        const chapterCount = request.chapterCount;
        const chapters = authorityRecord(authorityRecord(authority).facts).chapters;
        const chapter = Array.isArray(chapters) ? chapters.find((item) => authorityRecord(item).chapterNo === 1) : null;
        const chapterFields = authorityRecord(chapter);
        const candidates = input.validatedResult;
        if (envelope.action !== 'trial_chapter_one_generate'
          || !Number.isInteger(chapterCount) || Number(chapterCount) < 2 || Number(chapterCount) > 5
          || typeof chapterFields.id !== 'string' || !Number.isInteger(chapterFields.wordTarget)
          || Number(chapterFields.wordTarget) < 1
          || !Array.isArray(candidates) || candidates.length !== chapterCount
          || !candidates.every((candidate) => validPrismaLeasedTrialCandidate(candidate,
            chapterFields.id as string, Number(chapterFields.wordTarget)))
          || candidates.filter((candidate) => candidate.isAiRecommended).length !== 1) {
          return fail('worker_payload_unsupported');
        }
        try {
          assertNoSensitiveExecutionPayload(candidates, 'trialChapterCandidates');
        } catch {
          return fail('worker_payload_unsupported');
        }
        const trialRun = await tx.trialRun.create({ data: {
          tenantId: input.tenantId, novelId: current.novelId!,
          chapterPlanVersionId: authorityRecord(envelope.sourceVersionRefs).currentChapterPlanVersionId as string,
          trialChapterCount: Number(chapterCount), status: 'waiting_chapter1_selection',
          policyProfileVersionId: current.policyProfileVersionId, sourceTaskId: current.id,
          createdAt: input.authoritativeNow, updatedAt: input.authoritativeNow,
          metadata: toJsonObject({ selectedChapterOneCandidateId: null,
            currentStep: '选择第1章候选后继续生成第2-3章', blockingReason: null,
            sourceVersionRefs: envelope.sourceVersionRefs })
        } });
        const firstVersionNo = await getNextChapterContentVersionNo(tx, input.tenantId, current.novelId!, chapterFields.id);
        const sourceType = current.modelRoutingVersion?.startsWith('deepseek:') ? 'deepseek' : 'mock_ai';
        const versions = [];
        for (const [index, candidate] of candidates.entries()) {
          versions.push(await tx.chapterContentVersion.create({ data: {
            tenantId: input.tenantId, novelId: current.novelId!, chapterId: chapterFields.id,
            versionNo: firstVersionNo + index, status: PrismaVersionStatus.CANDIDATE,
            staleLevel: PrismaStaleLevel.NONE, sourceType, sourceTaskId: current.id,
            sourceVersionRefs: toJsonObject(envelope.sourceVersionRefs),
            rewriteReason: typeof request.regenerateReason === 'string' && request.regenerateReason.trim()
              ? request.regenerateReason.trim() : '模型服务生成第1章试写候选',
            content: candidate.content, wordCount: countWords(candidate.content), summary: candidate.summary,
            reviewScore: candidate.scoring.totalScore, createdBy: current.createdBy,
            createdAt: input.authoritativeNow,
            metadata: toJsonObject({ trialRunId: trialRun.id, trialStatus: 'candidate',
              chapterNo: candidate.chapterNo, title: candidate.title,
              openingStrategy: candidate.openingStrategy, openingHighlight: candidate.openingHighlight,
              firstSentence: candidate.firstSentence, first300Summary: candidate.first300Summary,
              endingHook: candidate.endingHook, riskLevel: candidate.riskLevel, riskTags: candidate.riskTags,
              aiRecommendedReason: candidate.aiRecommendedReason, isAiRecommended: candidate.isAiRecommended,
              scoring: candidate.scoring })
          } }));
        }
        const receipt = createSafeResultReceipt(mapGenerationTask(current), {
          status: 'waiting_confirmation', outcome: 'candidate_created',
          resultObjectType: 'trial_run', resultObjectId: trialRun.id,
          resultVersionIds: versions.map((version) => version.id), resultCount: versions.length
        });
        const transition = await tx.generationTask.updateMany({ where: fence, data: {
          status: PrismaTaskStatus.WAITING_CONFIRMATION,
          statusNote: '第1章试写候选已生成，等待用户选择。', progress: 100,
          currentStep: '第1章候选已生成，等待选择', resultObjectType: 'trial_run',
          resultObjectId: trialRun.id, resultVersionId: versions[0]!.id,
          resultVersionIdsJson: receipt.receipt.resultVersionIds,
          outputSummary: `${versions.length} 个第1章试写候选已生成，等待用户选择。`,
          resultReceiptHash: receipt.hash, providerAttemptPhase: PrismaProviderAttemptPhase.FINALIZING,
          activeClaimKey: null, leaseOwnerId: null, leaseToken: null, leaseExpiresAt: null,
          finishedAt: input.authoritativeNow, updatedAt: input.authoritativeNow
        } });
        if (transition.count !== 1) throw new Error('Trial finalize lost its fenced task transition.');
        const novelTransition = await tx.novel.updateMany({ where: {
          tenantId: input.tenantId, id: current.novelId!, deletedAt: null,
          lifecycleStatus: PrismaNovelLifecycleStatus.ACTIVE,
          currentChapterPlanVersionId: trialRun.chapterPlanVersionId
        }, data: { creationStage: PrismaNovelCreationStage.TRIAL,
          stageStatus: PrismaStageStatus.WAITING_USER,
          updatedBy: current.createdBy, updatedAt: input.authoritativeNow } });
        if (novelTransition.count !== 1) throw new Error('Trial finalize lost its novel stage transition.');
        const finalized = await tx.generationTask.findFirstOrThrow({ where: { tenantId: input.tenantId, id: input.taskId } });
        await createTaskEvent(tx, { task: finalized, eventType: 'task_finalized', message: finalized.statusNote!,
          progress: 100, requestId, createdAt: input.authoritativeNow });
        await tx.operationLog.create({ data: {
          tenantId: input.tenantId, userId: current.createdBy, novelId: current.novelId,
          action: 'generation_task_finalized', objectType: 'generation_task', objectId: current.id,
          afterSnapshot: { resultVersionIds: receipt.receipt.resultVersionIds, receiptHash: receipt.hash },
          reason: '第1章试写候选生成完成', sourceTaskId: current.id,
          requestId, createdAt: input.authoritativeNow
        } });
        return { outcome: 'applied' as const, task: mapGenerationTask(finalized) };
      }
      const structureType = current.taskType === 'novel_setting_generate' ? 'setting'
        : current.taskType === 'novel_outline_generate' ? 'outline'
          : current.taskType === 'stage_outline_generate' ? 'stage_outline'
            : current.taskType === 'chapter_plan_generate' ? 'chapter_plan' : null;
      const isDirectionRevision = current.taskType === 'novel_direction_fuse'
        || current.taskType === 'novel_direction_optimize';
      const drafts = input.validatedResult;
      const structureDraft = structureType && validPrismaLeasedStructureDraft(drafts, structureType) ? drafts : null;
      const chapterLimit = authorityRecord(authorityRecord(authority?.facts).novel).chapterLimit;
      if (structureType
        ? !structureDraft
          || (structureType === 'chapter_plan' && (!Number.isSafeInteger(chapterLimit) || Number(chapterLimit) < 1
            || structureDraft.content.chapters.length !== chapterLimit
            || structureDraft.content.chapters.some((chapter, index) => chapter.chapterNo !== index + 1)))
        : isDirectionRevision ? !validPrismaLeasedDirectionDraft(drafts)
          : !Array.isArray(drafts) || drafts.length < 1 || drafts.length > 10
            || !drafts.every(validPrismaLeasedDirectionDraft)) return fail('worker_payload_unsupported');
      const sourceVersionIds = authorityRecord(envelope.sourceVersionRefs).sourceVersionIds;
      const normalizedRequest = authorityRecord(envelope.normalizedRequest);
      if (isDirectionRevision && (!Array.isArray(sourceVersionIds)
        || (current.taskType === 'novel_direction_optimize'
          ? sourceVersionIds.length !== 1 || sourceVersionIds[0] !== envelope.objectId
            || normalizedRequest.versionId !== envelope.objectId
            || typeof normalizedRequest.instruction !== 'string' || !normalizedRequest.instruction.trim()
          : sourceVersionIds.length < 2)
        || sourceVersionIds.some((id) => typeof id !== 'string' || !id.trim())
        || new Set(sourceVersionIds).size !== sourceVersionIds.length)) return fail('worker_payload_unsupported');
      const candidates = structureType ? [] : isDirectionRevision
        ? [drafts as DirectionCandidateDraft] : drafts as DirectionCandidateDraft[];
      try {
        assertNoSensitiveExecutionPayload(structureType ? drafts : candidates,
          structureType ? 'structureCandidate' : 'directionCandidates');
      } catch {
        return fail('worker_payload_unsupported');
      }
      const sourceDirectionId = isDirectionRevision
        ? authorityRecord(authorityRecord(authority?.facts).currentRefs).currentDirectionVersionId ?? null
        : authorityRecord(envelope.sourceVersionRefs).currentDirectionVersionId ?? null;
      const sourceSettingId = authorityRecord(envelope.sourceVersionRefs).currentSettingVersionId ?? null;
      const sourceOutlineId = authorityRecord(envelope.sourceVersionRefs).currentOutlineVersionId ?? null;
      const sourceStageOutlineId = authorityRecord(envelope.sourceVersionRefs).currentStageOutlineVersionId ?? null;
      const sourceType = current.modelRoutingVersion?.startsWith('deepseek:') ? 'deepseek' : 'mock_ai';
      const revisionReason = current.taskType === 'novel_direction_fuse'
        ? normalizedRequest.reason : normalizedRequest.instruction;
      const changeReason = isDirectionRevision && typeof revisionReason === 'string' && revisionReason.trim()
        ? revisionReason.trim() : isDirectionRevision ? '融合方向候选' : '模型生成方向候选';
      const firstVersionNo = await getNextVersionNo(tx, input.tenantId, current.novelId!, structureType ?? 'direction');
      const versions = [];
      if (structureType) {
        const candidate = structureDraft!;
        versions.push(await tx.creativeVersion.create({ data: {
          tenantId: input.tenantId, novelId: current.novelId!, objectType: structureType, objectId: structureType,
          versionNo: firstVersionNo, status: PrismaVersionStatus.CANDIDATE, staleLevel: PrismaStaleLevel.NONE,
          sourceType, sourceTaskId: current.id,
          sourceVersionRefs: toJsonObject(envelope.sourceVersionRefs),
          changeReason: `模型生成${getStructureObjectText(structureType)}候选`,
          contentJson: toJsonObject(candidate.content), summary: candidate.summary,
          score: candidate.score, riskLevel: toPrismaRiskLevel(candidate.riskLevel),
          promptTemplateVersionId: current.promptTemplateVersionId,
          policyProfileVersionId: current.policyProfileVersionId, createdBy: current.createdBy,
          createdAt: input.authoritativeNow,
          metadata: { riskTags: candidate.riskTags, recommendedReason: candidate.recommendedReason }
        } }));
      } else {
        for (const [index, candidate] of candidates.entries()) {
          versions.push(await tx.creativeVersion.create({ data: {
            tenantId: input.tenantId, novelId: current.novelId!, objectType: 'direction', objectId: 'direction',
            versionNo: firstVersionNo + index, status: PrismaVersionStatus.CANDIDATE, staleLevel: PrismaStaleLevel.NONE,
            sourceType, sourceTaskId: current.id,
            sourceVersionRefs: toJsonObject(isDirectionRevision
              ? { sourceVersionIds } : { currentDirectionVersionId: sourceDirectionId }),
            changeReason, contentJson: toJsonObject({
              title: candidate.content.title, logline: candidate.content.logline,
              coreHook: candidate.content.coreHook, audienceAppeal: candidate.content.audienceAppeal,
              videoPotential: candidate.content.videoPotential, sellingPoints: candidate.content.sellingPoints,
              riskTags: candidate.content.riskTags, recommendation: candidate.content.recommendation
            }), summary: candidate.summary,
            score: candidate.score, riskLevel: toPrismaRiskLevel(candidate.riskLevel),
            promptTemplateVersionId: current.promptTemplateVersionId,
            policyProfileVersionId: current.policyProfileVersionId, createdBy: current.createdBy,
            createdAt: input.authoritativeNow,
            metadata: { marketScore: candidate.marketScore, riskTags: candidate.riskTags,
              recommendedReason: candidate.recommendedReason }
          } }));
        }
      }
      const receipt = createSafeResultReceipt(mapGenerationTask(current), {
        status: 'waiting_confirmation', outcome: 'candidate_created', resultObjectType: 'creative_version',
        resultObjectId: versions[0]!.id, resultVersionIds: versions.map((version) => version.id), resultCount: versions.length
      });
      const resultLabel = structureType ? getStructureObjectText(structureType) : '方向';
      const transition = await tx.generationTask.updateMany({ where: fence, data: {
        status: PrismaTaskStatus.WAITING_CONFIRMATION,
        statusNote: `${resultLabel}候选已生成，等待用户确认。`,
        progress: 100, currentStep: structureType ? getStructureGenerateStep(structureType)
          : isDirectionRevision ? getDirectionRevisionTaskStep(current.taskType) : '方向候选已生成，等待选择',
        resultObjectType: receipt.receipt.resultObjectType,
        resultObjectId: receipt.receipt.resultObjectId, resultVersionId: versions[0]!.id,
        resultVersionIdsJson: receipt.receipt.resultVersionIds,
        outputSummary: structureType ? `${resultLabel}候选已生成，等待用户采用。`
          : isDirectionRevision ? getDirectionRevisionOutputSummary(current.taskType)
            : `${versions.length} 个方向候选已生成，等待用户采用。`,
        resultReceiptHash: receipt.hash, providerAttemptPhase: PrismaProviderAttemptPhase.FINALIZING,
        activeClaimKey: null, leaseOwnerId: null, leaseToken: null, leaseExpiresAt: null,
        finishedAt: input.authoritativeNow, updatedAt: input.authoritativeNow
      } });
      if (transition.count !== 1) throw new Error('Creative finalize lost its fenced task transition.');
      if (structureType || sourceDirectionId === null) {
        const stageTransition = await tx.novel.updateMany({ where: {
          tenantId: input.tenantId, id: current.novelId!, deletedAt: null,
          lifecycleStatus: PrismaNovelLifecycleStatus.ACTIVE, currentDirectionVersionId: sourceDirectionId,
          ...(structureType ? { currentSettingVersionId: sourceSettingId,
            currentOutlineVersionId: sourceOutlineId, currentStageOutlineVersionId: sourceStageOutlineId } : {})
        }, data: { creationStage: structureType
          ? toPrismaCreationStage(getGenerationStage(structureType)) : PrismaNovelCreationStage.DIRECTION,
          stageStatus: PrismaStageStatus.WAITING_USER, updatedBy: current.createdBy, updatedAt: input.authoritativeNow } });
        if (stageTransition.count !== 1) throw new Error('Creative finalize lost its novel stage transition.');
      }
      const finalized = await tx.generationTask.findFirstOrThrow({ where: { tenantId: input.tenantId, id: input.taskId } });
      await createTaskEvent(tx, { task: finalized, eventType: 'task_finalized', message: finalized.statusNote!,
        progress: 100, requestId, createdAt: input.authoritativeNow });
      await tx.operationLog.create({ data: {
        tenantId: input.tenantId, userId: current.createdBy, novelId: current.novelId,
        action: 'generation_task_finalized', objectType: 'generation_task', objectId: current.id,
        afterSnapshot: { resultVersionIds: receipt.receipt.resultVersionIds, receiptHash: receipt.hash },
        reason: `${resultLabel}候选生成完成`,
        sourceTaskId: current.id, requestId, createdAt: input.authoritativeNow
      } });
      return { outcome: 'applied' as const, task: mapGenerationTask(finalized) };
    });
  }

  async finalizeLeasedTask(tenantId: string, taskId: string, leaseOwnerId: string, leaseToken: string, authoritativeNow: Date, result: HashedSafeResultReceipt) {
    let verified: HashedSafeResultReceipt;
    try {
      verified = verifyHashedSafeResultReceipt(result);
    } catch {
      return { outcome: 'fenced' as const, task: null };
    }
    if (verified.receipt.taskId !== taskId) return { outcome: 'fenced' as const, task: null };
    return this.prisma.$transaction(async (tx) => {
      const transition = await tx.generationTask.updateMany({
        where: {
          tenantId, id: taskId, status: PrismaTaskStatus.PROCESSING, leaseOwnerId, leaseToken,
          leaseExpiresAt: { gt: authoritativeNow }, resultReceiptHash: null,
          providerAttemptId: verified.receipt.attemptId
        },
        data: {
          status: verified.receipt.status === 'completed' ? PrismaTaskStatus.COMPLETED : PrismaTaskStatus.WAITING_CONFIRMATION,
          statusNote: 'Worker 结果已安全落账。', progress: 100, currentStep: 'finalized',
          resultObjectType: verified.receipt.resultObjectType, resultObjectId: verified.receipt.resultObjectId,
          resultVersionId: verified.receipt.resultVersionIds[0] ?? null,
          resultVersionIdsJson: verified.receipt.resultVersionIds,
          outputSummary: `${verified.receipt.safeSummary.resultCount} 个安全结果标识`,
          resultReceiptHash: verified.hash, providerAttemptPhase: PrismaProviderAttemptPhase.FINALIZING,
          activeClaimKey: null, leaseOwnerId: null, leaseToken: null, leaseExpiresAt: null,
          finishedAt: authoritativeNow, updatedAt: authoritativeNow
        }
      });
      if (transition.count !== 1) return { outcome: 'fenced' as const, task: null };
      const task = await tx.generationTask.findFirstOrThrow({ where: { tenantId, id: taskId } });
      await createTaskEvent(tx, { task, eventType: 'task_finalized', message: task.statusNote ?? 'Task finalized.', progress: 100, requestId: `worker:${leaseOwnerId}`, createdAt: authoritativeNow });
      return { outcome: 'applied' as const, task: mapGenerationTask(task) };
    });
  }

  async failLeasedTask(tenantId: string, taskId: string, leaseOwnerId: string, leaseToken: string, authoritativeNow: Date, failure: LeasedTaskFailure) {
    return this.prisma.$transaction(async (tx) => {
      const requestId = `worker:${leaseOwnerId.slice(0, 110)}`;
      const transition = await tx.generationTask.updateMany({
        where: { tenantId, id: taskId, status: PrismaTaskStatus.PROCESSING, leaseOwnerId, leaseToken, leaseExpiresAt: { gt: authoritativeNow } },
        data: leaseFailureData(failure, authoritativeNow)
      });
      if (transition.count !== 1) return { outcome: 'fenced' as const, task: null };
      const task = await tx.generationTask.findFirstOrThrow({ where: { tenantId, id: taskId } });
      await createTaskEvent(tx, { task, eventType: 'task_failed', message: failure.statusNote, progress: task.progress, requestId, createdAt: authoritativeNow });
      await tx.operationLog.create({ data: {
        tenantId: task.tenantId, userId: task.createdBy, novelId: task.novelId,
        action: 'generation_task_failed', objectType: 'generation_task', objectId: task.id,
        afterSnapshot: { failureCategory: failure.failureCategory, errorCode: failure.errorCode },
        reason: failure.statusNote, sourceTaskId: task.id, requestId, createdAt: authoritativeNow
      } });
      return { outcome: 'applied' as const, task: mapGenerationTask(task) };
    });
  }

  async listExpiredTaskLeases(authoritativeNow: Date, limit: number): Promise<ObservedTaskLease[]> {
    const take = Number.isInteger(limit) ? Math.min(Math.max(limit, 0), 100) : 0;
    if (take === 0) return [];
    const rows = await this.prisma.generationTask.findMany({
      where: {
        status: PrismaTaskStatus.PROCESSING,
        leaseOwnerId: { not: null }, leaseToken: { not: null },
        leaseExpiresAt: { lte: authoritativeNow }
      },
      select: { tenantId: true, id: true, leaseOwnerId: true, leaseToken: true, leaseExpiresAt: true },
      orderBy: [{ leaseExpiresAt: 'asc' }, { id: 'asc' }],
      take
    });
    return rows.flatMap((row) => row.leaseOwnerId && row.leaseToken && row.leaseExpiresAt
      ? [{ tenantId: row.tenantId, taskId: row.id, leaseOwnerId: row.leaseOwnerId,
        leaseToken: row.leaseToken, leaseExpiresAt: row.leaseExpiresAt }]
      : []);
  }

  async listStaleUnleasedTasks(staleBefore: Date, limit: number): Promise<ObservedUnleasedTask[]> {
    const take = Number.isInteger(limit) ? Math.min(Math.max(limit, 0), 100) : 0;
    if (take === 0) return [];
    const rows = await this.prisma.generationTask.findMany({
      where: {
        status: PrismaTaskStatus.PROCESSING,
        taskType: { in: [...NOVEL_PROVIDER_TASK_TYPES] },
        providerCallBudgetMax: 0,
        leaseOwnerId: null, leaseToken: null, leaseExpiresAt: null,
        startedAt: { not: null }, updatedAt: { lte: staleBefore }
      },
      select: { tenantId: true, id: true, updatedAt: true },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take
    });
    return rows.map((row) => ({ tenantId: row.tenantId, taskId: row.id, updatedAt: row.updatedAt }));
  }

  async getAuthoritativeTaskTime(): Promise<Date> {
    const rows = await this.prisma.$queryRaw<Array<{ now_ms: bigint | number | string }>>`
      SELECT CAST(ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000) AS UNSIGNED) AS now_ms
    `;
    const milliseconds = Number(rows[0]?.now_ms);
    if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
      throw new Error('Database clock is unavailable.');
    }
    return new Date(milliseconds);
  }

  async recoverExpiredTask(observed: ObservedTaskLease, authoritativeNow: Date) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.generationTask.findFirst({ where: {
        tenantId: observed.tenantId, id: observed.taskId, status: PrismaTaskStatus.PROCESSING,
        leaseOwnerId: observed.leaseOwnerId, leaseToken: observed.leaseToken, leaseExpiresAt: observed.leaseExpiresAt
      } });
      if (!current || current.leaseExpiresAt === null || current.leaseExpiresAt.getTime() > authoritativeNow.getTime()) return { outcome: 'not_recovered' as const, task: null };
      let envelopeValid = true;
      try {
        validateExecutionEnvelopeV1_1ForTask(mapGenerationTask(current));
      } catch {
        envelopeValid = false;
      }
      const dispatched = current.providerDispatchedAt !== null || current.providerAttemptId !== null
        || current.providerCallBudgetUsed > 0
        || (current.providerAttemptPhase !== null
          && current.providerAttemptPhase !== PrismaProviderAttemptPhase.LEASED
          && current.providerAttemptPhase !== PrismaProviderAttemptPhase.PREPARED);
      const failure = {
        failureCategory: dispatched ? 'provider_outcome_unknown' : envelopeValid ? 'worker_lease_expired' : 'worker_payload_unsupported',
        errorCode: dispatched ? 'PROVIDER_OUTCOME_UNKNOWN' : envelopeValid ? 'WORKER_LEASE_EXPIRED' : 'WORKER_PAYLOAD_UNSUPPORTED',
        errorMessage: dispatched ? 'Provider outcome is unknown.' : envelopeValid ? 'Worker lease expired.' : 'Execution envelope is invalid.',
        statusNote: dispatched ? 'Provider 结果未知，禁止自动重放。'
          : envelopeValid ? 'Worker 租约已过期。' : '任务执行合同无效，已安全结束。'
      };
      const transition = await tx.generationTask.updateMany({
        where: {
          tenantId: observed.tenantId, id: observed.taskId, status: PrismaTaskStatus.PROCESSING,
          leaseOwnerId: observed.leaseOwnerId, leaseToken: observed.leaseToken,
          leaseExpiresAt: { equals: observed.leaseExpiresAt, lte: authoritativeNow }
        },
        data: leaseFailureData(failure, authoritativeNow)
      });
      if (transition.count !== 1) return { outcome: 'not_recovered' as const, task: null };
      const task = await tx.generationTask.findFirstOrThrow({ where: { tenantId: observed.tenantId, id: observed.taskId } });
      await createTaskEvent(tx, { task, eventType: 'task_recovered', message: failure.statusNote, progress: task.progress, requestId: 'worker:recovery', createdAt: authoritativeNow });
      await tx.operationLog.create({ data: {
        tenantId: task.tenantId, userId: task.createdBy, novelId: task.novelId,
        action: 'generation_task_recovered', objectType: 'generation_task', objectId: task.id,
        afterSnapshot: { failureCategory: failure.failureCategory, errorCode: failure.errorCode },
        reason: failure.statusNote, sourceTaskId: task.id, requestId: 'worker:recovery', createdAt: authoritativeNow
      } });
      return { outcome: 'recovered' as const, task: mapGenerationTask(task) };
    });
  }

  async recoverStaleUnleasedTask(observed: ObservedUnleasedTask, staleBefore: Date, authoritativeNow: Date) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.generationTask.findFirst({ where: {
        tenantId: observed.tenantId, id: observed.taskId, status: PrismaTaskStatus.PROCESSING,
        taskType: { in: [...NOVEL_PROVIDER_TASK_TYPES] }, providerCallBudgetMax: 0,
        leaseOwnerId: null, leaseToken: null, leaseExpiresAt: null, startedAt: { not: null },
        updatedAt: observed.updatedAt
      } });
      if (!current || current.updatedAt.getTime() > staleBefore.getTime()) {
        return { outcome: 'not_recovered' as const, task: null };
      }
      const failure = {
        failureCategory: 'provider_outcome_unknown', errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
        errorMessage: 'Unleased inline provider outcome is unknown.',
        statusNote: '旧生成任务长时间未更新，模型调用结果未确认；系统不会自动重试。'
      };
      const transition = await tx.generationTask.updateMany({
        where: {
          tenantId: observed.tenantId, id: observed.taskId, status: PrismaTaskStatus.PROCESSING,
          taskType: { in: [...NOVEL_PROVIDER_TASK_TYPES] }, providerCallBudgetMax: 0,
          leaseOwnerId: null, leaseToken: null, leaseExpiresAt: null, startedAt: { not: null },
          updatedAt: { equals: observed.updatedAt, lte: staleBefore }
        },
        data: leaseFailureData(failure, authoritativeNow)
      });
      if (transition.count !== 1) return { outcome: 'not_recovered' as const, task: null };
      const task = await tx.generationTask.findFirstOrThrow({ where: { tenantId: observed.tenantId, id: observed.taskId } });
      await createTaskEvent(tx, { task, eventType: 'task_recovered', message: failure.statusNote,
        progress: task.progress, requestId: 'worker:unleased-recovery', createdAt: authoritativeNow });
      await tx.operationLog.create({ data: {
        tenantId: task.tenantId, userId: task.createdBy, novelId: task.novelId,
        action: 'generation_task_recovered', objectType: 'generation_task', objectId: task.id,
        afterSnapshot: { failureCategory: failure.failureCategory, errorCode: failure.errorCode },
        reason: failure.statusNote, sourceTaskId: task.id,
        requestId: 'worker:unleased-recovery', createdAt: authoritativeNow
      } });
      return { outcome: 'recovered' as const, task: mapGenerationTask(task) };
    });
  }

  async findActiveTaskByConflict(tenantId: string, conflictScope: string, conflictKey: string) {
    const task = await this.prisma.generationTask.findFirst({
      where: {
        tenantId,
        conflictScope,
        conflictKey,
        status: {
          in: [PrismaTaskStatus.QUEUED, PrismaTaskStatus.PROCESSING]
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return task ? mapGenerationTask(task) : null;
  }

  async listDirectionVersions(tenantId: string, novelId: string, prisma: Prisma.TransactionClient = this.prisma) {
    const versions = await prisma.creativeVersion.findMany({
      where: {
        tenantId,
        novelId,
        objectType: 'direction'
      },
      orderBy: {
        versionNo: 'desc'
      }
    });

    return versions.map(mapCreativeVersion);
  }

  async listStructureVersions(tenantId: string, novelId: string, prisma: Prisma.TransactionClient = this.prisma) {
    const versions = await prisma.creativeVersion.findMany({
      where: {
        tenantId,
        novelId,
        objectType: {
          in: ['setting', 'outline', 'stage_outline', 'chapter_plan']
        }
      },
      orderBy: [{ createdAt: 'desc' }, { versionNo: 'desc' }]
    });

    return versions.map(mapCreativeVersion);
  }

  async listStructureVersionsByType(tenantId: string, novelId: string, objectType: string) {
    const versions = await this.prisma.creativeVersion.findMany({
      where: {
        tenantId,
        novelId,
        objectType
      },
      orderBy: {
        versionNo: 'desc'
      }
    });

    return versions.map(mapCreativeVersion);
  }

  async listNovelChapters(tenantId: string, novelId: string, prisma: Prisma.TransactionClient = this.prisma) {
    const chapters = await prisma.novelChapter.findMany({
      where: {
        tenantId,
        novelId,
        deletedAt: null
      },
      orderBy: {
        chapterNo: 'asc'
      }
    });

    return chapters.map(mapNovelChapter);
  }

  async createDirectionCandidates(input: DirectionCreationInput): Promise<CreatedDirectionCandidatesRecord> {
    return this.prisma.$transaction(async (tx) => {
      await assertNoActiveAuthorityClaim(tx, input.context.tenantId, input.novel.id, input.task);
      const task = await transitionClaimedTask(tx, {
        taskId: input.task.id,
        tenantId: input.context.tenantId,
        data: {
          status: PrismaTaskStatus.WAITING_CONFIRMATION,
          statusNote: '模型服务已生成方向候选，等待用户确认。',
          progress: 100,
          currentStep: '方向候选已生成，等待选择',
          activeClaimKey: null,
          updatedAt: input.now
        }
      });
      const firstVersionNo = await getNextDirectionVersionNo(tx, input.context.tenantId, input.novel.id);
      const versions = [];

      for (const [index, candidate] of input.candidates.entries()) {
        versions.push(
          await tx.creativeVersion.create({
            data: {
              tenantId: input.context.tenantId,
              novelId: input.novel.id,
              objectType: 'direction',
              objectId: 'direction',
              versionNo: firstVersionNo + index,
              status: PrismaVersionStatus.CANDIDATE,
              staleLevel: PrismaStaleLevel.NONE,
              sourceType: 'mock_ai',
              sourceTaskId: task.id,
              sourceVersionRefs: {
                currentDirectionVersionId: input.novel.currentDirectionVersionId
              },
              changeReason: input.changeReason,
              contentJson: toJsonObject(candidate.content),
              summary: candidate.summary,
              score: candidate.score,
              riskLevel: toPrismaRiskLevel(candidate.riskLevel),
              promptTemplateVersionId: null,
              policyProfileVersionId: input.novel.policyProfileVersionId,
              createdBy: input.context.userId,
              createdAt: input.now,
              metadata: {
                marketScore: candidate.marketScore,
                riskTags: candidate.riskTags,
                recommendedReason: candidate.recommendedReason
              }
            }
          })
        );
      }

      const updatedTask = await tx.generationTask.update({
        where: { id: task.id, tenantId: input.context.tenantId },
        data: {
          resultObjectType: 'direction',
          resultObjectId: 'direction',
          resultVersionId: versions[0]?.id ?? null,
          outputSummary: `生成 ${versions.length} 个方向候选`,
          updatedAt: input.now
        }
      });
      await createTaskProgressEvents(tx, updatedTask, input.context.requestId, input.now);

      const novel = await tx.novel.update({
        where: { id: input.novel.id },
        data: {
          ...(input.novel.currentDirectionVersionId
            ? {}
            : {
                creationStage: PrismaNovelCreationStage.DIRECTION,
                stageStatus: PrismaStageStatus.WAITING_USER
              }),
          updatedBy: input.context.userId,
          updatedAt: input.now
        }
      });

      return {
        novel: mapNovel(novel),
        task: {
          ...mapGenerationTask(updatedTask),
          resultVersionIds: versions.map((version) => version.id)
        },
        versions: versions.map(mapCreativeVersion)
      };
    });
  }

  async createDirectionRevision(input: DirectionRevisionInput): Promise<CreatedDirectionRevisionRecord> {
    return this.prisma.$transaction(async (tx) => {
      await assertNoActiveAuthorityClaim(tx, input.context.tenantId, input.novel.id, input.task);
      const task = input.task
        ? await transitionClaimedTask(tx, {
            taskId: input.task.id,
            tenantId: input.context.tenantId,
            data: {
              status: PrismaTaskStatus.WAITING_CONFIRMATION,
              statusNote: '模型服务已生成方向候选，等待用户确认。',
              progress: 100,
              currentStep: getDirectionRevisionTaskStep(input.taskType),
              activeClaimKey: null,
              updatedAt: input.now
            }
          })
        : await tx.generationTask.create({
            data: createDirectionTaskData({ input, taskType: input.taskType, status: PrismaTaskStatus.WAITING_CONFIRMATION, currentStep: getDirectionRevisionTaskStep(input.taskType), now: input.now })
          });
      const versionNo = await getNextDirectionVersionNo(tx, input.context.tenantId, input.novel.id);
      const version = await tx.creativeVersion.create({
        data: {
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          objectType: 'direction',
          objectId: 'direction',
          versionNo,
          status: PrismaVersionStatus.CANDIDATE,
          staleLevel: PrismaStaleLevel.NONE,
          sourceType: getDirectionRevisionSourceType(input.taskType),
          sourceTaskId: task.id,
          sourceVersionRefs: {
            sourceVersionIds: input.sourceVersionIds
          },
          changeReason: input.changeReason,
          contentJson: toJsonObject(input.candidate.content),
          summary: input.candidate.summary,
          score: input.candidate.score,
          riskLevel: toPrismaRiskLevel(input.candidate.riskLevel),
          policyProfileVersionId: input.novel.policyProfileVersionId,
          createdBy: input.context.userId,
          createdAt: input.now,
          metadata: {
            marketScore: input.candidate.marketScore,
            riskTags: input.candidate.riskTags,
            recommendedReason: input.candidate.recommendedReason
          }
        }
      });

      const updatedTask = await tx.generationTask.update({
        where: { id: task.id, tenantId: input.context.tenantId },
        data: {
          resultObjectType: 'direction',
          resultObjectId: 'direction',
          resultVersionId: version.id,
          outputSummary: getDirectionRevisionOutputSummary(input.taskType),
          updatedAt: input.now
        }
      });
      await createTaskProgressEvents(tx, updatedTask, input.context.requestId, input.now);

      const novel = await tx.novel.update({
        where: { id: input.novel.id },
        data: {
          ...(input.novel.currentDirectionVersionId
            ? {}
            : {
                creationStage: PrismaNovelCreationStage.DIRECTION,
                stageStatus: PrismaStageStatus.WAITING_USER
              }),
          updatedBy: input.context.userId,
          updatedAt: input.now
        }
      });

      return {
        novel: mapNovel(novel),
        task: mapGenerationTask(updatedTask),
        version: mapCreativeVersion(version)
      };
    });
  }

  async findDirectionVersionById(tenantId: string, novelId: string, versionId: string) {
    const version = await this.prisma.creativeVersion.findFirst({
      where: {
        id: versionId,
        tenantId,
        novelId,
        objectType: 'direction'
      }
    });

    return version ? mapCreativeVersion(version) : null;
  }

  async adoptDirection(input: DirectionAdoptionInput): Promise<AdoptedDirectionRecord> {
    return this.prisma.$transaction(async (tx) => {
      await lockNovelAuthorityRoot(tx, input.context.tenantId, input.novel.id);
      const lockedNovel = await tx.novel.findFirst({
        where: { id: input.novel.id, tenantId: input.context.tenantId }
      });
      const lockedCandidate = await tx.creativeVersion.findFirst({
        where: {
          id: input.candidate.id,
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          objectType: 'direction'
        }
      });
      if (!lockedNovel || !lockedCandidate) throw new BusinessError(ErrorCode.NotFound, '小说或方向候选不存在');

      const priorDecisions = await tx.assetDecisionRecord.findMany({
        where: {
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          actionType: 'adopt_direction'
        },
        orderBy: { createdAt: 'desc' }
      });
      const replayDecision = priorDecisions.find((item) =>
        toJsonObject(item.metadata).adoptionIdempotencyToken === input.idempotencyToken
      );
      if (replayDecision) {
        const metadata = toJsonObject(replayDecision.metadata);
        if (metadata.adoptionRequestHash !== input.requestHash) {
          throw new BusinessError(ErrorCode.IdempotencyConflict, '同一个幂等键已绑定到不同的方向采用请求');
        }
        if (lockedNovel.currentDirectionVersionId !== replayDecision.candidateVersionId) {
          throw new BusinessError(ErrorCode.VersionConflict, '原方向采用结果已不再是当前版本，请刷新后重试');
        }
        const replayOperationLog = await tx.operationLog.findFirst({
          where: {
            tenantId: input.context.tenantId,
            novelId: input.novel.id,
            action: 'adopt_direction',
            objectId: replayDecision.candidateVersionId
          },
          orderBy: { createdAt: 'desc' }
        });
        if (!replayOperationLog) throw new BusinessError(ErrorCode.InternalError, '方向采用审计记录不完整');
        const replayVersions = await tx.creativeVersion.findMany({
          where: { tenantId: input.context.tenantId, novelId: input.novel.id, objectType: 'direction' },
          orderBy: { versionNo: 'desc' }
        });
        return {
          novel: mapNovel(lockedNovel),
          currentDirection: mapCreativeVersion(lockedCandidate),
          versions: replayVersions.map(mapCreativeVersion),
          decisionRecord: mapAssetDecisionRecord(replayDecision),
          operationLog: mapOperationLog(replayOperationLog)
        };
      }

      await assertNoActiveAuthorityClaimAfterRootLock(tx, input.context.tenantId, input.novel.id);
      if (lockedNovel.currentDirectionVersionId !== input.expectedCurrentVersionId) {
        throw new BusinessError(ErrorCode.VersionConflict, '当前方向版本已变化，请刷新后重试');
      }
      if (lockedCandidate.status !== PrismaVersionStatus.CANDIDATE || lockedCandidate.staleLevel === PrismaStaleLevel.HARD_STALE) {
        throw new BusinessError(ErrorCode.VersionConflict, '该方向候选当前不可采用');
      }

      const currentVersionIdBefore = lockedNovel.currentDirectionVersionId;
      const decisionRecord = await tx.assetDecisionRecord.create({
        data: {
          id: createId('decision'),
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          actionType: 'adopt_direction',
          objectType: 'direction',
          objectId: 'direction',
          candidateVersionId: input.candidate.id,
          currentVersionIdBefore,
          currentVersionIdAfter: input.candidate.id,
          decisionReason: input.reason,
          isForced: input.isForced,
          riskSummary: input.isForced ? '低分方向采用，已记录用户确认原因。' : '方向评分满足采用门槛。',
          impactSummary: '当前方向切换为正式方向，小说进入设定阶段；其他方向候选转为历史，下游正式资产失效并等待重新生成。',
          pageVersionSnapshot: toJsonObject(input.pageVersionSnapshot ?? {}),
          sourceTaskId: input.candidate.sourceTaskId,
          createdBy: input.context.userId,
          createdAt: input.now,
          metadata: {
            adoptionIdempotencyToken: input.idempotencyToken,
            adoptionRequestHash: input.requestHash
          }
        }
      });

      const invalidatedDownstreamVersions = await tx.creativeVersion.findMany({
        where: {
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          objectType: { in: ['setting', 'outline', 'stage_outline', 'chapter_plan'] }
        },
        select: { id: true }
      });
      const invalidatedDownstreamVersionIds = new Set(invalidatedDownstreamVersions.map((version) => version.id));

      await tx.creativeVersion.updateMany({
        where: {
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          objectType: 'direction',
          id: { not: input.candidate.id },
          status: { in: [PrismaVersionStatus.CANDIDATE, PrismaVersionStatus.CURRENT] }
        },
        data: {
          status: PrismaVersionStatus.HISTORICAL
        }
      });

      await tx.creativeVersion.updateMany({
        where: {
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          objectType: { in: ['setting', 'outline', 'stage_outline', 'chapter_plan'] },
          status: { in: [PrismaVersionStatus.CANDIDATE, PrismaVersionStatus.CURRENT] }
        },
        data: {
          status: PrismaVersionStatus.STALE,
          staleLevel: PrismaStaleLevel.HARD_STALE
        }
      });

      const currentDirection = await tx.creativeVersion.update({
        where: { id: input.candidate.id },
        data: {
          status: PrismaVersionStatus.CURRENT,
          staleLevel: PrismaStaleLevel.NONE,
          decisionRecordId: decisionRecord.id
        }
      });

      const novel = await tx.novel.update({
        where: { id: input.novel.id },
        data: {
          currentDirectionVersionId: input.candidate.id,
          currentSettingVersionId: null,
          currentOutlineVersionId: null,
          currentStageOutlineVersionId: null,
          currentChapterPlanVersionId: null,
          creationStage: PrismaNovelCreationStage.SETTING,
          stageStatus: PrismaStageStatus.NOT_STARTED,
          updatedBy: input.context.userId,
          updatedAt: input.now
        }
      });

      const waitingTasks = await tx.generationTask.findMany({
        where: {
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          objectType: { in: ['direction', 'setting', 'outline', 'stage_outline', 'chapter_plan'] },
          status: { in: [PrismaTaskStatus.WAITING_CONFIRMATION, PrismaTaskStatus.COMPLETED] }
        }
      });

      for (const waitingTask of waitingTasks) {
        const resultVersionIds = Array.isArray(waitingTask.resultVersionIdsJson)
          ? waitingTask.resultVersionIdsJson.filter((value): value is string => typeof value === 'string')
          : waitingTask.resultVersionId ? [waitingTask.resultVersionId] : [];
        const isDirectionTask = waitingTask.objectType === 'direction';
        const isWaiting = waitingTask.status === PrismaTaskStatus.WAITING_CONFIRMATION;
        const acceptedResult = isDirectionTask && isWaiting && resultVersionIds.includes(input.candidate.id);
        const invalidatedDownstreamResult = !isDirectionTask && resultVersionIds.some((versionId) => invalidatedDownstreamVersionIds.has(versionId));
        if (isDirectionTask && !isWaiting) continue;
        if (!isDirectionTask && !invalidatedDownstreamResult) continue;
        if (!isWaiting && !waitingTask.userAcceptedResult) continue;
        if (!isWaiting) {
          if (waitingTask.currentStep === '历史采用结果已失效（上游方向变更）') continue;
          const invalidatedTask = await tx.generationTask.update({
            where: { id: waitingTask.id },
            data: {
              statusNote: '上游方向已变更，本任务曾采用的结果现已失效',
              currentStep: '历史采用结果已失效（上游方向变更）',
              updatedAt: input.now
            }
          });
          await createTaskEvent(tx, {
            task: invalidatedTask,
            eventType: 'task_result_invalidated',
            message: '上游方向已变更，本任务曾采用的结果已转为失效历史；原采用事实保留。',
            progress: 100,
            requestId: input.context.requestId,
            createdAt: input.now
          });
          continue;
        }
        const statusNote = isDirectionTask
          ? acceptedResult ? '用户已采用方向' : '本任务方向候选未采用，已归档'
          : '上游方向已变更，本任务候选已过期并归档';
        const currentStep = isDirectionTask
          ? acceptedResult ? '方向已采用' : '方向候选未采用，已归档'
          : '候选因方向变更已过期并归档';
        const completedTask = await tx.generationTask.update({
          where: { id: waitingTask.id },
          data: {
            status: PrismaTaskStatus.COMPLETED,
            activeClaimKey: null,
            statusNote,
            currentStep,
            userAcceptedResult: acceptedResult,
            finishedAt: input.now,
            updatedAt: input.now
          }
        });
        await createTaskEvent(tx, {
          task: completedTask,
          eventType: 'task_completed',
          message: isDirectionTask
            ? acceptedResult ? '方向已采用，任务完成。' : '本任务方向候选未采用，已转为历史版本。'
            : '上游方向已变更，本任务候选已过期，待确认入口已归档。',
          progress: 100,
          requestId: input.context.requestId,
          createdAt: input.now
        });
      }

      const operationLog = await tx.operationLog.create({
        data: {
          id: createId('oplog'),
          tenantId: input.context.tenantId,
          userId: input.context.userId,
          novelId: input.novel.id,
          action: 'adopt_direction',
          objectType: 'direction',
          objectId: input.candidate.id,
          beforeSnapshot: {
            currentDirectionVersionId: currentVersionIdBefore,
            creationStage: fromPrismaEnum<NovelCreationStage>(lockedNovel.creationStage),
            stageStatus: fromPrismaEnum<StageStatus>(lockedNovel.stageStatus)
          },
          afterSnapshot: {
            currentDirectionVersionId: input.candidate.id,
            creationStage: NovelCreationStage.Setting,
            stageStatus: StageStatus.NotStarted
          },
          reason: input.reason,
          impactSummary: '当前方向切换为正式方向，小说进入设定阶段；其他方向候选转为历史，下游正式资产失效并等待重新生成。',
          sourceTaskId: input.candidate.sourceTaskId,
          requestId: input.context.requestId,
          ip: input.context.ip ?? null,
          userAgent: input.context.userAgent ?? null,
          createdAt: input.now
        }
      });

      const versions = await tx.creativeVersion.findMany({
        where: {
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          objectType: 'direction'
        },
        orderBy: { versionNo: 'desc' }
      });

      return {
        novel: mapNovel(novel),
        currentDirection: mapCreativeVersion(currentDirection),
        versions: versions.map(mapCreativeVersion),
        decisionRecord: mapAssetDecisionRecord(decisionRecord),
        operationLog: mapOperationLog(operationLog)
      };
    });
  }

  async createStructureGenerationTask(input: StructureGenerationTaskCreationInput): Promise<GenerationTaskRecord> {
    const task = await this.prisma.generationTask.create({
      data: createStructureGenerationTaskData({
        input,
        status: PrismaTaskStatus.PROCESSING,
        currentStep: `${input.objectType} 正在生成中`,
        now: input.now
      })
    });
    await createTaskEvent(this.prisma, {
      task,
      eventType: 'calling_model',
      message: '正在调用模型生成内容，可能需要 2-5 分钟；若等待过久，请刷新查看任务状态。',
      progress: 0,
      requestId: input.context.requestId,
      createdAt: input.now
    });

    return mapGenerationTask(task);
  }

  async createStructureCandidate(input: StructureCreationInput): Promise<CreatedStructureAssetRecord> {
    return this.prisma.$transaction(async (tx) => {
      await assertNoActiveAuthorityClaim(tx, input.context.tenantId, input.novel.id, input.task);
      const task = input.task
        ? await transitionClaimedTask(tx, {
            taskId: input.task.id,
            tenantId: input.context.tenantId,
            data: {
              status: PrismaTaskStatus.WAITING_CONFIRMATION,
              statusNote: `模型服务已生成 ${input.asset.objectType} 候选`,
              progress: 100,
              currentStep: getStructureGenerateStep(input.asset.objectType),
              activeClaimKey: null,
              updatedAt: input.now
            }
          })
        : await tx.generationTask.create({
            data: createStructureTaskData({ input, taskType: input.taskType, status: PrismaTaskStatus.WAITING_CONFIRMATION, currentStep: getStructureGenerateStep(input.asset.objectType), now: input.now })
          });
      const versionNo = await getNextVersionNo(tx, input.context.tenantId, input.novel.id, input.asset.objectType);
      const version = await tx.creativeVersion.create({
        data: {
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          objectType: input.asset.objectType,
          objectId: input.asset.objectType,
          versionNo,
          status: PrismaVersionStatus.CANDIDATE,
          staleLevel: PrismaStaleLevel.NONE,
          sourceType: 'mock_ai',
          sourceTaskId: task.id,
          sourceVersionRefs: toJsonObject(input.sourceVersionRefs),
          changeReason: input.changeReason,
          contentJson: toJsonObject(input.asset.content),
          summary: input.asset.summary,
          score: input.asset.score,
          riskLevel: toPrismaRiskLevel(input.asset.riskLevel),
          policyProfileVersionId: input.novel.policyProfileVersionId,
          createdBy: input.context.userId,
          createdAt: input.now,
          metadata: {
            riskTags: input.asset.riskTags,
            recommendedReason: input.asset.recommendedReason
          }
        }
      });

      const updatedTask = await tx.generationTask.update({
        where: { id: task.id, tenantId: input.context.tenantId },
        data: {
          resultObjectType: input.asset.objectType,
          resultObjectId: input.asset.objectType,
          resultVersionId: version.id,
          outputSummary: `生成 ${input.asset.objectType} 候选`,
          updatedAt: input.now
        }
      });
      await createTaskProgressEvents(tx, updatedTask, input.context.requestId, input.now);

      const novel = await tx.novel.update({
        where: { id: input.novel.id },
        data: {
          creationStage: toPrismaCreationStage(getGenerationStage(input.asset.objectType)),
          stageStatus: PrismaStageStatus.WAITING_USER,
          updatedBy: input.context.userId,
          updatedAt: input.now
        }
      });

      return {
        novel: mapNovel(novel),
        task: mapGenerationTask(updatedTask),
        version: mapCreativeVersion(version)
      };
    });
  }

  async failTask(input: TaskFailureInput): Promise<GenerationTaskRecord> {
    return this.prisma.$transaction(async (tx) => {
      const transition = await tx.generationTask.updateMany({
        where: {
          id: input.task.id,
          tenantId: input.context.tenantId,
          status: PrismaTaskStatus.PROCESSING
        },
        data: {
          status: PrismaTaskStatus.FAILED,
          statusNote: input.statusNote ?? '模型生成失败，请查看原因后重试。',
          currentStep: '生成失败',
          failureCategory: input.failureCategory ?? 'model_generation_failed',
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          activeClaimKey: null,
          finishedAt: input.now,
          updatedAt: input.now
        }
      });
      if (transition.count !== 1) {
        const current = await tx.generationTask.findFirst({
          where: { id: input.task.id, tenantId: input.context.tenantId }
        });
        return current ? mapGenerationTask(current) : input.task;
      }
      const task = await tx.generationTask.findFirstOrThrow({
        where: { id: input.task.id, tenantId: input.context.tenantId }
      });
      await createTaskEvent(tx, {
        task,
        eventType: 'failed',
        message: input.errorMessage,
        progress: task.progress,
        requestId: input.context.requestId,
        createdAt: input.now
      });

      if (task.taskType === 'trial_followup_generate' && task.objectId && task.novelId) {
        const trialRun = await tx.trialRun.findFirst({
          where: {
            id: task.objectId,
            tenantId: input.context.tenantId
          }
        });
        await tx.trialRun.update({
          where: { id: task.objectId },
          data: {
            status: 'followup_failed',
            updatedAt: input.now,
            metadata: toJsonObject({
              ...toRecord(trialRun?.metadata),
              currentStep: '继续试写失败',
              blockingReason: input.errorMessage
            })
          }
        });
        await tx.novel.update({
          where: { id: task.novelId },
          data: {
            creationStage: PrismaNovelCreationStage.TRIAL,
            stageStatus: PrismaStageStatus.FAILED,
            updatedBy: input.context.userId,
            updatedAt: input.now
          }
        });
      }

      if (task.taskType === 'body_batch_generate' && task.novelId) {
        await tx.novel.update({
          where: { id: task.novelId },
          data: {
            creationStage: PrismaNovelCreationStage.BODY,
            stageStatus: PrismaStageStatus.FAILED,
            updatedBy: input.context.userId,
            updatedAt: input.now
          }
        });
      }

      return mapGenerationTask(task);
    });
  }

  async findStructureVersionById(tenantId: string, novelId: string, objectType: string, versionId: string, prisma: Prisma.TransactionClient = this.prisma) {
    const version = await prisma.creativeVersion.findFirst({
      where: {
        id: versionId,
        tenantId,
        novelId,
        objectType
      }
    });

    return version ? mapCreativeVersion(version) : null;
  }

  async adoptStructureAsset(input: StructureAdoptionInput): Promise<AdoptedStructureAssetRecord> {
    return this.prisma.$transaction(async (tx) => {
      await assertNoActiveAuthorityClaim(tx, input.context.tenantId, input.novel.id);
      const currentVersionIdBefore = getCurrentVersionId(input.novel, input.objectType);
      const downstream = getDownstreamObjectTypes(input.objectType);
      const decisionRecord = await tx.assetDecisionRecord.create({
        data: {
          id: createId('decision'),
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          actionType: `adopt_${input.objectType}`,
          objectType: input.objectType,
          objectId: input.objectType,
          candidateVersionId: input.candidate.id,
          currentVersionIdBefore,
          currentVersionIdAfter: input.candidate.id,
          decisionReason: input.reason,
          isForced: input.isForced,
          riskSummary: input.isForced ? '高风险结构资产采用，已记录用户确认原因。' : '结构资产通过采用门槛。',
          impactSummary:
            downstream.length > 0
              ? `采用 ${input.objectType} 后，下游候选或当前版本已标记为过期。`
              : '采用章节目录后刷新章节计划，不生成正文。',
          pageVersionSnapshot: toJsonObject(input.pageVersionSnapshot ?? {}),
          sourceTaskId: input.candidate.sourceTaskId,
          createdBy: input.context.userId,
          createdAt: input.now
        }
      });

      await tx.creativeVersion.updateMany({
        where: {
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          objectType: input.objectType,
          id: { not: input.candidate.id },
          status: { in: [PrismaVersionStatus.CANDIDATE, PrismaVersionStatus.CURRENT] }
        },
        data: {
          status: PrismaVersionStatus.HISTORICAL
        }
      });

      if (downstream.length > 0) {
        await tx.creativeVersion.updateMany({
          where: {
            tenantId: input.context.tenantId,
            novelId: input.novel.id,
            objectType: { in: downstream },
            status: { in: [PrismaVersionStatus.CANDIDATE, PrismaVersionStatus.CURRENT] }
          },
          data: {
            status: PrismaVersionStatus.STALE,
            staleLevel: PrismaStaleLevel.HARD_STALE
          }
        });
      }

      const currentAsset = await tx.creativeVersion.update({
        where: { id: input.candidate.id },
        data: {
          status: PrismaVersionStatus.CURRENT,
          staleLevel: PrismaStaleLevel.NONE,
          decisionRecordId: decisionRecord.id
        }
      });

      if (input.objectType === 'chapter_plan') {
        await refreshPrismaChapters(tx, input);
      }

      const novelPatch = createPrismaNovelPatchAfterStructureAdoption(input);
      const novel = await tx.novel.update({
        where: { id: input.novel.id },
        data: novelPatch
      });

      const waitingTasks = await tx.generationTask.findMany({
        where: {
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          objectType: input.objectType,
          status: PrismaTaskStatus.WAITING_CONFIRMATION
        }
      });

      for (const waitingTask of waitingTasks) {
        const resultVersionIds = Array.isArray(waitingTask.resultVersionIdsJson)
          ? waitingTask.resultVersionIdsJson.filter((value): value is string => typeof value === 'string')
          : waitingTask.resultVersionId ? [waitingTask.resultVersionId] : [];
        const acceptedResult = resultVersionIds.includes(input.candidate.id);
        const completedTask = await tx.generationTask.update({
          where: { id: waitingTask.id },
          data: {
            status: PrismaTaskStatus.COMPLETED,
            activeClaimKey: null,
            statusNote: acceptedResult ? '用户已采用结构资产' : '本任务结构候选未采用，已归档',
            currentStep: acceptedResult ? getStructureAdoptStep(input.objectType) : `${getStructureObjectText(input.objectType)}候选未采用，已归档`,
            userAcceptedResult: acceptedResult,
            finishedAt: input.now,
            updatedAt: input.now
          }
        });
        await createTaskEvent(tx, {
          task: completedTask,
          eventType: 'task_completed',
          message: acceptedResult
            ? `${getStructureObjectText(input.objectType)}已采用，任务完成。`
            : `本任务${getStructureObjectText(input.objectType)}候选未采用，已转为历史版本。`,
          progress: 100,
          requestId: input.context.requestId,
          createdAt: input.now
        });
      }

      const operationLog = await tx.operationLog.create({
        data: {
          id: createId('oplog'),
          tenantId: input.context.tenantId,
          userId: input.context.userId,
          novelId: input.novel.id,
          action: `adopt_${input.objectType}`,
          objectType: input.objectType,
          objectId: input.candidate.id,
          beforeSnapshot: {
            currentVersionId: currentVersionIdBefore,
            creationStage: input.novel.creationStage,
            stageStatus: input.novel.stageStatus
          },
          afterSnapshot: {
            currentVersionId: input.candidate.id,
            creationStage: novelPatch.creationStage,
            stageStatus: novelPatch.stageStatus
          },
          reason: input.reason,
          impactSummary:
            downstream.length > 0
              ? `采用 ${input.objectType} 后，下游候选或当前版本已标记为过期。`
              : '采用章节目录后刷新章节计划，不生成正文。',
          sourceTaskId: input.candidate.sourceTaskId,
          requestId: input.context.requestId,
          ip: input.context.ip ?? null,
          userAgent: input.context.userAgent ?? null,
          createdAt: input.now
        }
      });

      const versions = await tx.creativeVersion.findMany({
        where: {
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          objectType: {
            in: ['setting', 'outline', 'stage_outline', 'chapter_plan']
          }
        },
        orderBy: [{ createdAt: 'desc' }, { versionNo: 'desc' }]
      });
      const chapters = await tx.novelChapter.findMany({
        where: {
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          deletedAt: null
        },
        orderBy: { chapterNo: 'asc' }
      });

      return {
        novel: mapNovel(novel),
        currentAsset: mapCreativeVersion(currentAsset),
        versions: versions.map(mapCreativeVersion),
        chapters: chapters.map(mapNovelChapter),
        decisionRecord: mapAssetDecisionRecord(decisionRecord),
        operationLog: mapOperationLog(operationLog)
      };
    });
  }

  async updateChapterWordTargets(input: ChapterWordTargetUpdateInput) {
    const currentPlanId = input.novel.currentChapterPlanVersionId;
    if (!currentPlanId) {
      throw new Error('current chapter plan asset is required');
    }

    await this.prisma.$transaction(async (tx) => {
      await assertNoActiveAuthorityClaim(tx, input.context.tenantId, input.novel.id);
      const currentAsset = await tx.creativeVersion.findFirst({
        where: {
          id: currentPlanId,
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          objectType: 'chapter_plan'
        }
      });
      if (!currentAsset) {
        throw new Error('current chapter plan asset is required');
      }

      const updatesByNo = new Map(input.updates.map((update) => [update.chapterNo, update.wordTarget]));
      const content = normalizePrismaStructureContent(currentAsset.contentJson);
      const nextContent = {
        ...content,
        chapters: content.chapters.map((chapter) => ({
          ...chapter,
          wordTarget: updatesByNo.get(chapter.chapterNo) ?? chapter.wordTarget
        }))
      };

      await tx.creativeVersion.update({
        where: { id: currentAsset.id },
        data: {
          contentJson: nextContent as unknown as Prisma.InputJsonValue,
          changeReason: input.reason
        }
      });

      for (const update of input.updates) {
        await tx.novelChapter.updateMany({
          where: {
            tenantId: input.context.tenantId,
            novelId: input.novel.id,
            chapterNo: update.chapterNo,
            deletedAt: null
          },
          data: {
            wordTarget: update.wordTarget,
            statusNote: '目标字数已调整，后续生成将按新目标执行。',
            updatedAt: input.now
          }
        });
      }

      await tx.novel.update({
        where: { id: input.novel.id },
        data: {
          updatedBy: input.context.userId,
          updatedAt: input.now
        }
      });
    });

    const novel = await this.findById(input.context.tenantId, input.novel.id);
    const versions = await this.listStructureVersions(input.context.tenantId, input.novel.id);
    const currentAsset = versions.find((version) => version.id === currentPlanId);
    if (!novel || !currentAsset) {
      throw new Error('updated chapter plan asset is required');
    }

    return {
      novel,
      currentAsset,
      versions,
      chapters: await this.listNovelChapters(input.context.tenantId, input.novel.id)
    };
  }

  async retryTask(input: TaskRetryInput): Promise<RetriedTaskRecord> {
    return this.prisma.$transaction(async (tx) => {
      const newTask = await tx.generationTask.create({
        data: {
          tenantId: input.context.tenantId,
          novelId: input.task.novelId,
          taskType: input.task.taskType,
          objectType: input.task.objectType,
          objectId: input.task.objectId,
          status: PrismaTaskStatus.QUEUED,
          statusNote: '任务已重新加入队列，等待模型服务执行。',
          progress: 0,
          currentStep: '等待重试执行',
          triggerSource: 'manual_retry',
          sourceVersionRefs: toJsonObject(input.task.sourceVersionRefs),
          conflictScope: input.task.conflictScope,
          conflictKey: input.task.conflictKey,
          inputSummary: input.task.inputSummary,
          outputSummary: null,
          retryOfTaskId: input.task.id,
          userAcceptedResult: false,
          createdBy: input.context.userId,
          createdAt: input.now,
          updatedAt: input.now,
          metadata: {
            requestId: input.context.requestId,
            retryReason: input.reason,
            retryOfTaskId: input.task.id
          }
        }
      });
      const event = await createTaskEvent(tx, {
        task: newTask,
        eventType: 'task_retry_created',
        message: input.reason ? `已创建重试任务：${input.reason}` : '已创建重试任务。',
        progress: 0,
        requestId: input.context.requestId,
        createdAt: input.now
      });
      const operationLog = await tx.operationLog.create({
        data: {
          id: createId('oplog'),
          tenantId: input.context.tenantId,
          userId: input.context.userId,
          novelId: input.task.novelId,
          action: 'retry_generation_task',
          objectType: input.task.objectType,
          objectId: input.task.objectId,
          beforeSnapshot: {
            failedTaskId: input.task.id,
            status: input.task.status,
            errorCode: input.task.errorCode
          },
          afterSnapshot: {
            retryTaskId: newTask.id,
            status: TaskStatus.Queued
          },
          reason: input.reason || '重试失败任务',
          impactSummary: '创建新的重试任务，原失败任务保留。',
          sourceTaskId: input.task.id,
          requestId: input.context.requestId,
          ip: input.context.ip ?? null,
          userAgent: input.context.userAgent ?? null,
          createdAt: input.now
        }
      });

      return {
        originalTask: input.task,
        newTask: mapGenerationTask(newTask),
        event: mapGenerationTaskEvent(event),
        operationLog: mapOperationLog(operationLog)
      };
    });
  }

  async cancelTask(input: TaskCancelInput): Promise<CancelledTaskRecord> {
    return this.prisma.$transaction(async (tx) => {
      const previousStatus = input.task.status;
      const task = await transitionCancellableTask(tx, {
        taskId: input.task.id,
        tenantId: input.context.tenantId,
        data: {
          status: PrismaTaskStatus.CANCELLED,
          statusNote: '任务已取消，不会写入正式资产。',
          currentStep: '任务已取消',
          cancelRequestedAt: input.now,
          cancelReason: input.reason,
          activeClaimKey: null,
          finishedAt: input.now,
          updatedAt: input.now
        }
      });
      const event = await createTaskEvent(tx, {
        task,
        eventType: 'task_cancelled',
        message: input.reason ? `任务已取消：${input.reason}` : '任务已取消。',
        progress: task.progress,
        requestId: input.context.requestId,
        createdAt: input.now
      });
      const operationLog = await tx.operationLog.create({
        data: {
          id: createId('oplog'),
          tenantId: input.context.tenantId,
          userId: input.context.userId,
          novelId: input.task.novelId,
          action: 'cancel_generation_task',
          objectType: input.task.objectType,
          objectId: input.task.objectId,
          beforeSnapshot: {
            taskId: input.task.id,
            status: previousStatus
          },
          afterSnapshot: {
            taskId: task.id,
            status: TaskStatus.Cancelled
          },
          reason: input.reason || '取消生成任务',
          impactSummary: '取消任务不会采用候选，也不会写入正式资产。',
          sourceTaskId: input.task.id,
          requestId: input.context.requestId,
          ip: input.context.ip ?? null,
          userAgent: input.context.userAgent ?? null,
          createdAt: input.now
        }
      });

      return {
        task: mapGenerationTask(task),
        event: mapGenerationTaskEvent(event),
        operationLog: mapOperationLog(operationLog)
      };
    });
  }

  async findLatestTrialRun(tenantId: string, novelId: string) {
    const run = await this.prisma.trialRun.findFirst({
      where: { tenantId, novelId },
      orderBy: { updatedAt: 'desc' }
    });

    return run ? mapTrialRun(run) : null;
  }

  async findTrialRunById(tenantId: string, novelId: string, trialRunId: string, prisma: Prisma.TransactionClient = this.prisma) {
    const run = await prisma.trialRun.findFirst({
      where: { tenantId, novelId, id: trialRunId }
    });

    return run ? mapTrialRun(run) : null;
  }

  async listTrialChapterResults(tenantId: string, trialRunId: string) {
    const results = await this.prisma.trialChapterResult.findMany({
      where: { tenantId, trialRunId },
      orderBy: { createdAt: 'asc' }
    });

    return results.map(mapTrialChapterResult);
  }

  async listChapterContentVersions(tenantId: string, novelId: string, chapterId: string) {
    const versions = await this.prisma.chapterContentVersion.findMany({
      where: { tenantId, novelId, chapterId },
      orderBy: { versionNo: 'desc' }
    });

    return versions.map(mapChapterContentVersion);
  }

  async findChapterContentVersionById(tenantId: string, novelId: string, versionId: string, prisma: Prisma.TransactionClient = this.prisma) {
    const version = await prisma.chapterContentVersion.findFirst({
      where: { tenantId, novelId, id: versionId }
    });

    return version ? mapChapterContentVersion(version) : null;
  }

  async findChapterById(tenantId: string, novelId: string, chapterId: string) {
    const chapter = await this.prisma.novelChapter.findFirst({
      where: { tenantId, novelId, id: chapterId, deletedAt: null }
    });

    return chapter ? mapNovelChapter(chapter) : null;
  }

  async findFeatureCardById(
    tenantId: string,
    featureCardId: string,
    prisma: Prisma.TransactionClient = this.prisma
  ) {
    const card = await prisma.chapterFeatureCard.findFirst({
      where: { tenantId, id: featureCardId }
    });

    return card ? mapChapterFeatureCard(card) : null;
  }

  async findReviewReportById(
    tenantId: string,
    reviewReportId: string,
    prisma: Prisma.TransactionClient = this.prisma
  ) {
    const report = await prisma.reviewReport.findFirst({
      where: { tenantId, id: reviewReportId }
    });

    return report ? mapReviewReport(report) : null;
  }

  async findBodyStrategySnapshot(tenantId: string, novelId: string) {
    const version = await this.prisma.creativeVersion.findFirst({
      where: {
        tenantId,
        novelId,
        objectType: 'body_strategy_snapshot',
        status: PrismaVersionStatus.CURRENT
      },
      orderBy: { versionNo: 'desc' }
    });

    return version ? mapCreativeVersion(version) : null;
  }

  async createTrialChapterOneCandidates(input: TrialCandidateCreationInput): Promise<CreatedTrialCandidatesRecord> {
    return this.prisma.$transaction(async (tx) => {
      await assertNoActiveAuthorityClaim(tx, input.context.tenantId, input.novel.id, input.task);
      const trialRunId = createId('trial');
      const task = await transitionClaimedTask(tx, {
        taskId: input.task.id,
        tenantId: input.context.tenantId,
        data: {
          status: PrismaTaskStatus.WAITING_CONFIRMATION,
          statusNote: '模型服务已生成试写结果，等待用户确认。',
          progress: 100,
          currentStep: '第1章候选已生成，等待选择',
          resultObjectType: 'trial_run',
          resultObjectId: trialRunId,
          activeClaimKey: null,
          updatedAt: input.now
        }
      });
      const trialRun = await tx.trialRun.create({
        data: {
          id: trialRunId,
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          chapterPlanVersionId: input.novel.currentChapterPlanVersionId,
          trialChapterCount: input.chapterCount,
          status: 'waiting_chapter1_selection',
          policyProfileVersionId: input.novel.policyProfileVersionId,
          sourceTaskId: task.id,
          createdAt: input.now,
          updatedAt: input.now,
          metadata: {
            selectedChapterOneCandidateId: null,
            currentStep: '选择第1章候选后继续生成第2-3章',
            blockingReason: null,
            sourceVersionRefs: toJsonObject(input.sourceVersionRefs)
          }
        }
      });
      const versions = [];
      for (const candidate of input.candidates) {
        const versionNo = await getNextChapterContentVersionNo(tx, input.context.tenantId, input.novel.id, candidate.chapterId);
        versions.push(
          await tx.chapterContentVersion.create({
            data: {
              tenantId: input.context.tenantId,
              novelId: input.novel.id,
              chapterId: candidate.chapterId,
              versionNo,
              status: PrismaVersionStatus.CANDIDATE,
              staleLevel: PrismaStaleLevel.NONE,
              sourceType: 'mock_ai',
              sourceTaskId: task.id,
              sourceVersionRefs: toJsonObject(input.sourceVersionRefs),
              rewriteReason: input.changeReason,
              content: candidate.content,
              wordCount: countWords(candidate.content),
              summary: candidate.summary,
              reviewScore: candidate.scoring.totalScore,
              createdBy: input.context.userId,
              createdAt: input.now,
              metadata: toJsonObject({
                trialRunId,
                trialStatus: 'candidate',
                chapterNo: candidate.chapterNo,
                title: candidate.title,
                openingStrategy: candidate.openingStrategy,
                openingHighlight: candidate.openingHighlight,
                firstSentence: candidate.firstSentence,
                first300Summary: candidate.first300Summary,
                endingHook: candidate.endingHook,
                riskLevel: candidate.riskLevel,
                riskTags: candidate.riskTags,
                aiRecommendedReason: candidate.aiRecommendedReason,
                isAiRecommended: candidate.isAiRecommended,
                scoring: candidate.scoring
              })
            }
          })
        );
      }
      const updatedTask = await tx.generationTask.update({
        where: { id: task.id, tenantId: input.context.tenantId },
        data: {
          resultObjectType: 'trial_run',
          resultObjectId: trialRunId,
          resultVersionId: versions[0]?.id ?? null,
          outputSummary: `${versions.length} 个第1章试写候选已生成，等待用户选择。`,
          updatedAt: input.now
        }
      });
      await createTaskProgressEvents(tx, updatedTask, input.context.requestId, input.now);
      const novel = await tx.novel.update({
        where: { id: input.novel.id },
        data: {
          creationStage: PrismaNovelCreationStage.TRIAL,
          stageStatus: PrismaStageStatus.WAITING_USER,
          updatedBy: input.context.userId,
          updatedAt: input.now
        }
      });

      return {
        novel: mapNovel(novel),
        task: {
          ...mapGenerationTask(updatedTask),
          resultVersionIds: versions.map((version) => version.id)
        },
        trialRun: mapTrialRun(trialRun),
        chapterOneCandidates: versions.map(mapChapterContentVersion)
      };
    });
  }

  async createTrialFollowupTask(input: TrialFollowupTaskCreationInput): Promise<CreatedTrialFollowupTaskRecord> {
    return this.prisma.$transaction(async (tx) => {
      const selectedMetadata = {
        ...toRecord(input.selectedCandidate.metadata),
        trialStatus: 'selected_for_trial',
        isSelected: true,
        followupStatus: 'generating'
      };
      await tx.chapterContentVersion.update({
        where: { id: input.selectedCandidate.id },
        data: {
          status: PrismaVersionStatus.CURRENT,
          metadata: toJsonObject(selectedMetadata)
        }
      });
      await tx.chapterContentVersion.updateMany({
        where: {
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          chapterId: input.selectedCandidate.chapterId,
          id: { not: input.selectedCandidate.id },
          status: PrismaVersionStatus.CANDIDATE
        },
        data: {
          status: PrismaVersionStatus.HISTORICAL
        }
      });

      const sourceTask = input.trialRun.sourceTaskId
        ? await tx.generationTask.findFirst({
            where: {
              id: input.trialRun.sourceTaskId,
              tenantId: input.context.tenantId
            }
          })
        : null;
      if (sourceTask?.status === PrismaTaskStatus.WAITING_CONFIRMATION) {
        const oldTask = await tx.generationTask.update({
          where: { id: sourceTask.id, tenantId: input.context.tenantId },
          data: {
            status: PrismaTaskStatus.COMPLETED,
            statusNote: '用户已选择第1章候选',
            currentStep: '第1章候选已选择，继续试写',
            userAcceptedResult: true,
            finishedAt: input.now,
            updatedAt: input.now
          }
        });
        await createTaskEvent(tx, {
          task: oldTask,
          eventType: 'task_completed',
          message: '用户已选择第1章候选，任务完成。',
          progress: 100,
          requestId: input.context.requestId,
          createdAt: input.now
        });
      }

      const sourceVersionRefs = createTrialFollowupSourceVersionRefs(input.novel, input.selectedCandidate.id);
      const task = await transitionClaimedTask(tx, {
        taskId: input.task.id,
        tenantId: input.context.tenantId,
        data: {
          status: PrismaTaskStatus.PROCESSING,
          statusNote: '正在调用模型继续试写第2-3章并生成试写总评，可能需要 2-5 分钟；若等待过久，请刷新查看任务状态。',
          progress: 18,
          resultVersionId: input.selectedCandidate.id,
          resultObjectType: 'trial_run',
          resultObjectId: input.trialRun.id,
          outputSummary: null,
          updatedAt: input.now
        }
      });
      await createTaskEvent(tx, {
        task,
        eventType: 'calling_model',
        message: '正在调用模型继续试写第2-3章并生成试写总评，可能需要 2-5 分钟；若等待过久，请刷新查看任务状态。',
        progress: 18,
        requestId: input.context.requestId,
        createdAt: input.now
      });

      const updatedTrialRun = await tx.trialRun.update({
        where: { id: input.trialRun.id },
        data: {
          status: 'followup_generating',
          sourceTaskId: task.id,
          updatedAt: input.now,
          metadata: toJsonObject({
            ...toRecord(input.trialRun.metadata),
            selectedChapterOneCandidateId: input.selectedCandidate.id,
            currentStep: '已选择第1章候选，正在生成第2-3章和试写总评',
            blockingReason: null,
            sourceVersionRefs
          })
        }
      });
      const novel = await tx.novel.update({
        where: { id: input.novel.id },
        data: {
          creationStage: PrismaNovelCreationStage.TRIAL,
          stageStatus: PrismaStageStatus.PROCESSING,
          updatedBy: input.context.userId,
          updatedAt: input.now
        }
      });

      return {
        novel: mapNovel(novel),
        trialRun: mapTrialRun(updatedTrialRun),
        task: mapGenerationTask(task)
      };
    });
  }

  async selectTrialChapterOneAndGenerateFollowup(input: TrialFollowupGenerationInput): Promise<GeneratedTrialFollowupRecord> {
    return this.prisma.$transaction(async (tx) => {
      await assertNoActiveAuthorityClaim(tx, input.context.tenantId, input.novel.id, input.task);
      const selectedMetadata = { ...toRecord(input.selectedCandidate.metadata), trialStatus: 'selected_for_trial', isSelected: true, followupStatus: 'completed' };
      const selected = await tx.chapterContentVersion.update({
        where: { id: input.selectedCandidate.id },
        data: {
          metadata: toJsonObject(selectedMetadata)
        }
      });
      await tx.chapterContentVersion.updateMany({
        where: {
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          chapterId: input.selectedCandidate.chapterId,
          id: { not: input.selectedCandidate.id },
          status: PrismaVersionStatus.CANDIDATE
        },
        data: {
          status: PrismaVersionStatus.HISTORICAL
        }
      });
      const oldTask = input.trialRun.sourceTaskId && input.trialRun.sourceTaskId !== input.task.id
        ? await tx.generationTask.update({
            where: { id: input.trialRun.sourceTaskId, tenantId: input.context.tenantId },
            data: {
              status: PrismaTaskStatus.COMPLETED,
              statusNote: '用户已选择第1章候选',
              currentStep: '第1章候选已选择，继续试写',
              userAcceptedResult: true,
              finishedAt: input.now,
              updatedAt: input.now
            }
          })
        : null;
      if (oldTask) {
        await createTaskEvent(tx, {
          task: oldTask,
          eventType: 'task_completed',
          message: '用户已选择第1章候选，任务完成。',
          progress: 100,
          requestId: input.context.requestId,
          createdAt: input.now
        });
      }

      const sourceVersionRefs = createTrialFollowupSourceVersionRefs(input.novel, input.selectedCandidate.id);
      const task = await transitionClaimedTask(tx, {
        taskId: input.task.id,
        tenantId: input.context.tenantId,
        data: {
          status: PrismaTaskStatus.WAITING_CONFIRMATION,
          statusNote: '模型服务已生成试写结果，等待用户确认。',
          progress: 100,
          currentStep: input.review.trialResult === 'blocked' ? '第2章硬门槛未通过，试写暂停' : '前三章试写总评已生成，等待确认',
          activeClaimKey: null,
          updatedAt: input.now
        }
      });
      const contentVersions = [mapChapterContentVersion(selected)];
      const featureCards = [];
      const reviewReports = [];
      const chapterResults = [];

      for (const chapterDraft of input.chapters) {
        const contentVersion =
          chapterDraft.chapter.chapterNo === 1
            ? selected
            : await tx.chapterContentVersion.create({
                data: {
                  tenantId: input.context.tenantId,
                  novelId: input.novel.id,
                  chapterId: chapterDraft.chapter.id,
                  versionNo: await getNextChapterContentVersionNo(tx, input.context.tenantId, input.novel.id, chapterDraft.chapter.id),
                  status: PrismaVersionStatus.CANDIDATE,
                  staleLevel: PrismaStaleLevel.NONE,
                  sourceType: 'mock_ai',
                  sourceTaskId: task.id,
                  sourceVersionRefs: toJsonObject(sourceVersionRefs),
                  rewriteReason: '连续试写生成章节正文',
                  content: chapterDraft.content,
                  wordCount: countWords(chapterDraft.content),
                  summary: chapterDraft.summary,
                  reviewScore: chapterDraft.scoring.totalScore,
                  createdBy: input.context.userId,
                  createdAt: input.now,
                  metadata: toJsonObject({
                    trialRunId: input.trialRun.id,
                    trialStatus: 'selected_for_trial',
                    chapterNo: chapterDraft.chapter.chapterNo,
                    title: chapterDraft.chapter.title,
                    openingStrategy: chapterDraft.openingStrategy,
                    openingHighlight: chapterDraft.openingHighlight,
                    firstSentence: chapterDraft.firstSentence,
                    first300Summary: chapterDraft.first300Summary,
                    endingHook: chapterDraft.endingHook,
                    riskLevel: chapterDraft.riskLevel,
                    riskTags: chapterDraft.riskTags,
                    aiRecommendedReason: chapterDraft.aiRecommendedReason,
                    isAiRecommended: false,
                    isSelected: true,
                    scoring: chapterDraft.scoring
                  })
                }
              });
        if (chapterDraft.chapter.chapterNo !== 1) {
          contentVersions.push(mapChapterContentVersion(contentVersion));
        }

        const featureCard = await tx.chapterFeatureCard.create({
          data: {
            tenantId: input.context.tenantId,
            novelId: input.novel.id,
            chapterId: chapterDraft.chapter.id,
            versionNo: await getNextFeatureCardVersionNo(tx, input.context.tenantId, chapterDraft.chapter.id),
            status: PrismaVersionStatus.CANDIDATE,
            staleLevel: PrismaStaleLevel.NONE,
            oneLineSummary: chapterDraft.featureCard.oneLineSummary,
            coreTask: chapterDraft.featureCard.coreTask,
            mainConflict: chapterDraft.featureCard.mainConflict,
            appealPoint: chapterDraft.featureCard.appealPoint,
            emotionKeywordsJson: chapterDraft.featureCard.emotionKeywords,
            characterChangesJson: chapterDraft.featureCard.characterChanges,
            relationshipChangesJson: chapterDraft.featureCard.relationshipChanges,
            keyInformationJson: chapterDraft.featureCard.keyInformation,
            foreshadowingOperation: chapterDraft.featureCard.foreshadowingOperation,
            endingHook: chapterDraft.featureCard.endingHook,
            factsCannotChangeJson: chapterDraft.featureCard.factsCannotChange,
            featuresToStrengthenJson: chapterDraft.featureCard.featuresToStrengthen,
            sourceTaskId: task.id,
            createdAt: input.now,
            metadata: toJsonObject(chapterDraft.featureCard.metadata)
          }
        });
        const reviewReport = await tx.reviewReport.create({
          data: createReviewReportData({
            input,
            taskId: task.id,
            chapterDraft,
            contentVersionId: contentVersion.id
          })
        });
        const result = await tx.trialChapterResult.create({
          data: {
            tenantId: input.context.tenantId,
            trialRunId: input.trialRun.id,
            chapterId: chapterDraft.chapter.id,
            contentVersionId: contentVersion.id,
            featureCardVersionId: featureCard.id,
            reviewReportId: reviewReport.id,
            score: chapterDraft.scoring.totalScore,
            status: chapterDraft.hardFailed ? 'hard_failed' : 'completed',
            createdAt: input.now,
            metadata: {
              hardFailed: chapterDraft.hardFailed,
              hardFailureReasons: chapterDraft.hardFailureReasons
            }
          }
        });

        featureCards.push(mapChapterFeatureCard(featureCard));
        reviewReports.push(mapReviewReport(reviewReport));
        chapterResults.push(mapTrialChapterResult(result));
      }

      const trialReview = await tx.reviewReport.create({
        data: createTrialReviewReportData(input, task.id)
      });
      reviewReports.push(mapReviewReport(trialReview));
      const updatedTask = await tx.generationTask.update({
        where: { id: task.id, tenantId: input.context.tenantId },
        data: {
          resultObjectType: 'trial_run',
          resultObjectId: input.trialRun.id,
          resultVersionId: contentVersions[0]?.id ?? null,
          outputSummary: input.review.summary,
          updatedAt: input.now
        }
      });
      await createTaskProgressEvents(tx, updatedTask, input.context.requestId, input.now);
      const updatedTrialRun = await tx.trialRun.update({
        where: { id: input.trialRun.id },
        data: {
          status: input.review.trialResult === 'blocked' ? 'blocked' : 'review_ready',
          totalScore: input.review.totalScore,
          trialResult: input.review.trialResult,
          reviewReportId: trialReview.id,
          sourceTaskId: task.id,
          updatedAt: input.now,
          metadata: {
            ...toRecord(input.trialRun.metadata),
            selectedChapterOneCandidateId: input.selectedCandidate.id,
            currentStep: input.review.trialResult === 'blocked' ? '处理第2章硬失败' : '确认试写总评并生成正文策略快照',
            blockingReason: input.review.trialResult === 'blocked' ? '第2章硬门槛未通过，不能继续第3章。' : null,
            requiresRiskConfirmation: input.review.requiresRiskConfirmation
          }
        }
      });
      const novel = await tx.novel.update({
        where: { id: input.novel.id },
        data: {
          creationStage: PrismaNovelCreationStage.TRIAL,
          stageStatus: input.review.trialResult === 'blocked' ? PrismaStageStatus.BLOCKED : PrismaStageStatus.WAITING_USER,
          updatedBy: input.context.userId,
          updatedAt: input.now
        }
      });
      await tx.operationLog.create({
        data: {
          id: createId('oplog'),
          tenantId: input.context.tenantId,
          userId: input.context.userId,
          novelId: input.novel.id,
          action: 'select_trial_chapter1_candidate',
          objectType: 'trial_run',
          objectId: input.trialRun.id,
          beforeSnapshot: { selectedChapterOneCandidateId: null },
          afterSnapshot: {
            selectedChapterOneCandidateId: input.selectedCandidate.id,
            trialResult: input.review.trialResult,
            totalScore: input.review.totalScore
          },
          reason: '用户选择第1章候选并继续试写',
          impactSummary: input.review.summary,
          sourceTaskId: task.id,
          requestId: input.context.requestId,
          ip: input.context.ip ?? null,
          userAgent: input.context.userAgent ?? null,
          createdAt: input.now
        }
      });

      return {
        novel: mapNovel(novel),
        trialRun: mapTrialRun(updatedTrialRun),
        task: {
          ...mapGenerationTask(updatedTask),
          resultVersionIds: contentVersions.map((version) => version.id)
        },
        chapterResults,
        contentVersions,
        featureCards,
        reviewReports
      };
    });
  }

  async confirmTrial(input: TrialConfirmationInput): Promise<ConfirmedTrialRecord> {
    return this.prisma.$transaction(async (tx) => {
      await assertNoActiveAuthorityClaim(tx, input.context.tenantId, input.novel.id);
      const isReturnUpstream = input.decision === 'return_upstream';
      if (input.trialRun.status !== 'review_ready'
        || input.trialRun.chapterPlanVersionId !== input.novel.currentChapterPlanVersionId
        || authorityRecord(input.selectedCandidate.metadata).trialRunId !== input.trialRun.id
        || !input.trialRun.sourceTaskId) {
        throw new BusinessError(ErrorCode.VersionConflict, '试写结果已变化，请刷新后重试。');
      }
      const trialChapters = await tx.novelChapter.findMany({ where: {
        tenantId: input.context.tenantId, novelId: input.novel.id,
        chapterNo: { lte: input.trialRun.trialChapterCount }, deletedAt: null
      }, orderBy: { chapterNo: 'asc' } });
      const trialResults = await tx.trialChapterResult.findMany({ where: {
        tenantId: input.context.tenantId, trialRunId: input.trialRun.id
      } });
      if (trialChapters.length !== input.trialRun.trialChapterCount
        || trialResults.length !== trialChapters.length) {
        throw new BusinessError(ErrorCode.VersionConflict, '试写章节结果已变化，请刷新后重试。');
      }
      const promotion = [];
      for (const chapter of trialChapters) {
        const result = trialResults.find((item) => item.chapterId === chapter.id);
        if (!result?.contentVersionId || !result.featureCardVersionId || !result.reviewReportId
          || (!isReturnUpstream && result.status !== 'completed')) {
          throw new BusinessError(ErrorCode.GateBlocked, '试写章节尚未全部完成，不能进入批量正文。');
        }
        const [content, feature, report] = await Promise.all([
          tx.chapterContentVersion.findFirst({ where: {
            tenantId: input.context.tenantId, novelId: input.novel.id,
            chapterId: chapter.id, id: result.contentVersionId
          } }),
          tx.chapterFeatureCard.findFirst({ where: {
            tenantId: input.context.tenantId, novelId: input.novel.id,
            chapterId: chapter.id, id: result.featureCardVersionId
          } }),
          tx.reviewReport.findFirst({ where: {
            tenantId: input.context.tenantId, novelId: input.novel.id,
            objectType: 'chapter', objectId: chapter.id,
            objectVersionId: result.contentVersionId, id: result.reviewReportId
          } })
        ]);
        if (!content || !feature || !report
          || authorityRecord(content.metadata).trialRunId !== input.trialRun.id
          || (content.status !== PrismaVersionStatus.CANDIDATE
            && (content.status !== PrismaVersionStatus.CURRENT
              || chapter.currentContentVersionId !== content.id))
          || (feature.status !== PrismaVersionStatus.CANDIDATE
            && (feature.status !== PrismaVersionStatus.CURRENT
              || chapter.currentFeatureCardVersionId !== feature.id))) {
          throw new BusinessError(ErrorCode.VersionConflict, '试写候选版本已变化，请刷新后重试。');
        }
        promotion.push({ chapter, result, content, feature, report });
      }
      let snapshot: any = null;
      if (!isReturnUpstream) {
        await tx.creativeVersion.updateMany({
          where: {
            tenantId: input.context.tenantId,
            novelId: input.novel.id,
            objectType: 'body_strategy_snapshot',
            status: PrismaVersionStatus.CURRENT
          },
          data: { status: PrismaVersionStatus.HISTORICAL }
        });
        snapshot = await tx.creativeVersion.create({
          data: {
            tenantId: input.context.tenantId,
            novelId: input.novel.id,
            objectType: 'body_strategy_snapshot',
            objectId: 'body_strategy_snapshot',
            versionNo: await getNextVersionNo(tx, input.context.tenantId, input.novel.id, 'body_strategy_snapshot'),
            status: PrismaVersionStatus.CURRENT,
            staleLevel: PrismaStaleLevel.NONE,
            sourceType: 'trial_writing',
            sourceTaskId: input.trialRun.sourceTaskId,
            sourceVersionRefs: {
              currentDirectionVersionId: input.novel.currentDirectionVersionId,
              currentSettingVersionId: input.novel.currentSettingVersionId,
              currentOutlineVersionId: input.novel.currentOutlineVersionId,
              currentStageOutlineVersionId: input.novel.currentStageOutlineVersionId,
              currentChapterPlanVersionId: input.novel.currentChapterPlanVersionId,
              trialRunId: input.trialRun.id,
              selectedChapterOneCandidateId: input.selectedCandidate.id
            },
            changeReason: input.reason,
            contentJson: toJsonObject(input.snapshotContent),
            summary: '试写通过后生成的正文批量生成策略快照。',
            score: input.trialRun.totalScore,
            riskLevel: input.isForced ? PrismaRiskLevel.MEDIUM : PrismaRiskLevel.LOW,
            policyProfileVersionId: input.novel.policyProfileVersionId,
            createdBy: input.context.userId,
            createdAt: input.now,
            metadata: {
              sourceTrialRunId: input.trialRun.id,
              selectedChapterOneVersionId: input.selectedCandidate.id,
              acceptedRisks: input.isForced ? [input.reason] : []
            }
          }
        });
      }

      const actionType = input.decision === 'force_pass' ? 'confirm_trial_force_pass' : input.decision === 'return_upstream' ? 'confirm_trial_return_upstream' : 'confirm_trial_pass';
      const decision = await tx.assetDecisionRecord.create({
        data: {
          id: createId('decision'),
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          actionType,
          objectType: 'trial_run',
          objectId: input.trialRun.id,
          candidateVersionId: input.selectedCandidate.id,
          currentVersionIdBefore: null,
          currentVersionIdAfter: snapshot?.id ?? null,
          decisionReason: input.reason,
          isForced: input.isForced,
          riskSummary: input.isForced ? '低分或风险试写强制通过，已记录用户原因。' : '试写总评通过。',
          impactSummary: isReturnUpstream ? '试写未通过，返回上游调整，不生成正文策略快照。' : '生成正文策略快照，进入正文阶段前置状态。',
          pageVersionSnapshot: {
            trialRunId: input.trialRun.id,
            totalScore: input.trialRun.totalScore,
            trialResult: input.trialRun.trialResult
          },
          sourceTaskId: input.trialRun.sourceTaskId,
          createdBy: input.context.userId,
          createdAt: input.now
        }
      });
      if (snapshot) {
        snapshot = await tx.creativeVersion.update({
          where: { id: snapshot.id },
          data: { decisionRecordId: decision.id }
        });
      }
      const trialTransition = await tx.trialRun.updateMany({
        where: { id: input.trialRun.id, tenantId: input.context.tenantId,
          novelId: input.novel.id, status: 'review_ready',
          chapterPlanVersionId: input.novel.currentChapterPlanVersionId },
        data: {
          status: isReturnUpstream ? 'returned_upstream' : 'confirmed',
          confirmedAt: input.now,
          confirmedBy: input.context.userId,
          forceReason: input.isForced ? input.reason : null,
          updatedAt: input.now,
          metadata: {
            ...toRecord(input.trialRun.metadata),
            decision: input.decision,
            reason: input.reason,
            bodyStrategySnapshotId: snapshot?.id ?? null
          }
        }
      });
      if (trialTransition.count !== 1) {
        throw new BusinessError(ErrorCode.VersionConflict, '试写状态已变化，请刷新后重试。');
      }
      const trialRun = await tx.trialRun.findFirstOrThrow({ where: {
        id: input.trialRun.id, tenantId: input.context.tenantId, novelId: input.novel.id
      } });
      if (!isReturnUpstream) {
        for (const { chapter, result, content, feature } of promotion) {
          await tx.chapterContentVersion.updateMany({ where: {
            tenantId: input.context.tenantId, novelId: input.novel.id,
            chapterId: chapter.id, id: { not: content.id }, status: PrismaVersionStatus.CURRENT
          }, data: { status: PrismaVersionStatus.HISTORICAL } });
          await tx.chapterFeatureCard.updateMany({ where: {
            tenantId: input.context.tenantId, novelId: input.novel.id,
            chapterId: chapter.id, id: { not: feature.id }, status: PrismaVersionStatus.CURRENT
          }, data: { status: PrismaVersionStatus.HISTORICAL } });
          const [contentTransition, featureTransition] = await Promise.all([
            tx.chapterContentVersion.updateMany({ where: {
              tenantId: input.context.tenantId, novelId: input.novel.id,
              id: content.id, status: content.status
            }, data: { status: PrismaVersionStatus.CURRENT,
              decisionRecordId: decision.id,
              metadata: toJsonObject({ ...authorityRecord(content.metadata), trialStatus: 'confirmed' }) } }),
            tx.chapterFeatureCard.updateMany({ where: {
              tenantId: input.context.tenantId, novelId: input.novel.id,
              id: feature.id, status: feature.status
            }, data: { status: PrismaVersionStatus.CURRENT, decisionRecordId: decision.id } })
          ]);
          if (contentTransition.count !== 1 || featureTransition.count !== 1) {
            throw new BusinessError(ErrorCode.VersionConflict, '试写候选版本已变化，请刷新后重试。');
          }
          const promoted = await tx.novelChapter.updateMany({
            where: {
              id: chapter.id,
              tenantId: input.context.tenantId,
              novelId: input.novel.id,
              currentContentVersionId: chapter.currentContentVersionId,
              currentFeatureCardVersionId: chapter.currentFeatureCardVersionId,
              currentReviewReportId: chapter.currentReviewReportId,
              deletedAt: null
            },
            data: {
              currentContentVersionId: content.id,
              currentFeatureCardVersionId: feature.id,
              currentReviewReportId: result.reviewReportId,
              lastGenerationTaskId: input.trialRun.sourceTaskId,
              wordCount: content.wordCount,
              mainStatus: 'completed',
              statusNote: '试写已确认，作为批量正文前置正式版本。',
              updatedAt: input.now
            }
          });
          if (promoted.count !== 1) {
            throw new BusinessError(ErrorCode.VersionConflict, '试写章节正文版本已变化，请刷新后重试。');
          }
        }
      } else {
        for (const { content, feature } of promotion) {
          if (content.status === PrismaVersionStatus.CANDIDATE) {
            await tx.chapterContentVersion.updateMany({ where: {
              tenantId: input.context.tenantId, novelId: input.novel.id,
              id: content.id, status: PrismaVersionStatus.CANDIDATE
            }, data: { status: PrismaVersionStatus.HISTORICAL,
              decisionRecordId: decision.id,
              metadata: toJsonObject({ ...authorityRecord(content.metadata), trialStatus: 'historical' }) } });
          }
          if (feature.status === PrismaVersionStatus.CANDIDATE) {
            await tx.chapterFeatureCard.updateMany({ where: {
              tenantId: input.context.tenantId, novelId: input.novel.id,
              id: feature.id, status: PrismaVersionStatus.CANDIDATE
            }, data: { status: PrismaVersionStatus.HISTORICAL, decisionRecordId: decision.id } });
          }
        }
      }
      const sourceTask = input.trialRun.sourceTaskId
        ? await tx.generationTask.findFirst({
            where: {
              id: input.trialRun.sourceTaskId,
              tenantId: input.context.tenantId,
              novelId: input.novel.id
            }
          })
        : null;
      if (sourceTask?.status === PrismaTaskStatus.WAITING_CONFIRMATION) {
        const completedTask = await tx.generationTask.update({
          where: { id: sourceTask.id, tenantId: input.context.tenantId },
          data: {
            status: PrismaTaskStatus.COMPLETED,
            statusNote: isReturnUpstream ? '用户已退回试写' : '用户已确认试写',
            currentStep: isReturnUpstream ? '试写已退回上游调整' : '试写已确认，正文策略快照已生成',
            userAcceptedResult: !isReturnUpstream,
            finishedAt: input.now,
            updatedAt: input.now
          }
        });
        await createTaskEvent(tx, {
          task: completedTask,
          eventType: 'task_completed',
          message: isReturnUpstream ? '试写已退回上游调整，任务完成。' : '试写已确认并生成正文策略快照，任务完成。',
          progress: 100,
          requestId: input.context.requestId,
          createdAt: input.now
        });
      }
      const novelTransition = await tx.novel.updateMany({
        where: {
          id: input.novel.id,
          tenantId: input.context.tenantId,
          currentChapterPlanVersionId: input.trialRun.chapterPlanVersionId
        },
        data: {
          creationStage: isReturnUpstream ? PrismaNovelCreationStage.TRIAL : PrismaNovelCreationStage.BODY,
          stageStatus: isReturnUpstream ? PrismaStageStatus.BLOCKED : PrismaStageStatus.NOT_STARTED,
          updatedBy: input.context.userId,
          updatedAt: input.now
        }
      });
      if (novelTransition.count !== 1) {
        throw new BusinessError(ErrorCode.VersionConflict, '章节目录已变化，请刷新后重试。');
      }
      const novel = await tx.novel.findFirstOrThrow({ where: {
        id: input.novel.id, tenantId: input.context.tenantId
      } });
      const operationLog = await tx.operationLog.create({
        data: {
          id: createId('oplog'),
          tenantId: input.context.tenantId,
          userId: input.context.userId,
          novelId: input.novel.id,
          action: actionType,
          objectType: 'trial_run',
          objectId: input.trialRun.id,
          beforeSnapshot: { trialRunStatus: 'review_ready', creationStage: input.novel.creationStage },
          afterSnapshot: {
            trialRunStatus: trialRun.status,
            bodyStrategySnapshotId: snapshot?.id ?? null,
            creationStage: isReturnUpstream ? NovelCreationStage.Trial : NovelCreationStage.Body
          },
          reason: input.reason,
          impactSummary: isReturnUpstream ? '试写未通过，返回上游调整，不生成正文策略快照。' : '生成正文策略快照，进入正文阶段前置状态。',
          sourceTaskId: input.trialRun.sourceTaskId,
          requestId: input.context.requestId,
          ip: input.context.ip ?? null,
          userAgent: input.context.userAgent ?? null,
          createdAt: input.now
        }
      });

      return {
        novel: mapNovel(novel),
        trialRun: mapTrialRun(trialRun),
        bodyStrategySnapshot: snapshot ? mapCreativeVersion(snapshot) : null,
        decisionRecord: mapAssetDecisionRecord(decision),
        operationLog: mapOperationLog(operationLog)
      };
    });
  }

  async getChapterWorkbench(tenantId: string, novelId: string, chapterId: string): Promise<ChapterWorkbenchRecord | null> {
    const chapter = await this.prisma.novelChapter.findFirst({
      where: { tenantId, novelId, id: chapterId, deletedAt: null }
    });
    if (!chapter) return null;
    const [versions, featureCard, reviewReport, recentTask, longTermMemory, impactCases] = await Promise.all([
      this.prisma.chapterContentVersion.findMany({
        where: { tenantId, novelId, chapterId },
        orderBy: { versionNo: 'desc' }
      }),
      chapter.currentFeatureCardVersionId
        ? this.prisma.chapterFeatureCard.findFirst({
            where: { tenantId, novelId, chapterId, id: chapter.currentFeatureCardVersionId }
          }) : Promise.resolve(null),
      chapter.currentReviewReportId
        ? this.prisma.reviewReport.findFirst({
            where: { tenantId, novelId, objectType: 'chapter', objectId: chapterId,
              id: chapter.currentReviewReportId }
          }) : Promise.resolve(null),
      this.prisma.generationTask.findFirst({
        where: { tenantId, novelId, OR: [
          { objectType: 'chapter', objectId: chapterId },
          ...(chapter.lastGenerationTaskId ? [{ id: chapter.lastGenerationTaskId }] : []),
          { objectType: 'trial_run' }
        ] },
        orderBy: { updatedAt: 'desc' }
      }),
      this.prisma.longTermMemory.findFirst({
        where: { tenantId, novelId, chapterId },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.impactCase.findMany({
        where: { tenantId, novelId, sourceObjectId: chapterId },
        orderBy: { createdAt: 'desc' }
      })
    ]);
    const currentContent = chapter.currentContentVersionId
      ? versions.find((version) => version.id === chapter.currentContentVersionId) ?? null
      : null;

    return {
      chapter: mapNovelChapter(chapter),
      currentContent: currentContent ? mapChapterContentVersion(currentContent) : null,
      featureCard: featureCard ? mapChapterFeatureCard(featureCard) : null,
      reviewReport: reviewReport ? mapReviewReport(reviewReport) : null,
      candidateVersions: versions.map(mapChapterContentVersion),
      longTermMemory: longTermMemory ? mapLongTermMemory(longTermMemory) : null,
      impactCases: impactCases.map(mapImpactCase),
      recentTask: recentTask ? mapGenerationTask(recentTask) : null
    };
  }

  async findLatestBodyBatch(
    tenantId: string,
    novelId: string,
    prisma: Prisma.TransactionClient = this.prisma
  ): Promise<BodyBatchRecord | null> {
    const tasks = await prisma.generationTask.findMany({
      where: {
        tenantId,
        novelId,
        taskType: { in: ['body_batch_generate', 'chapter_body_generate'] },
        resultObjectType: 'body_batch'
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: { metadata: true }
    });
    return tasks
      .map((task) => bodyBatchFromTaskMetadata(task.metadata, tenantId, novelId))
      .filter((batch): batch is BodyBatchRecord => batch !== null)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id))[0] ?? null;
  }

  async findBodyBatchByIdempotencyKey(tenantId: string, novelId: string, idempotencyKey: string): Promise<BodyBatchRecord | null> {
    const tasks = await this.prisma.generationTask.findMany({
      where: {
        tenantId,
        novelId,
        taskType: { in: ['body_batch_generate', 'chapter_body_generate'] },
        resultObjectType: 'body_batch',
        resultObjectId: { not: null }
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    });
    const task = tasks.find((item) => toRecord(toRecord(item.metadata).batch).idempotencyKey === idempotencyKey);
    return task ? mapStoredBodyBatch(task, tenantId, novelId) : null;
  }

  async listOpenBlockingImpactCases(tenantId: string, novelId: string): Promise<ImpactCaseRecord[]> {
    const cases = await this.prisma.impactCase.findMany({
      where: {
        tenantId,
        novelId,
        impactLevel: { in: [PrismaImpactLevel.MEDIUM, PrismaImpactLevel.SEVERE] },
        status: { in: ['open', 'processing', 'waiting_decision', 'handling', 'assessing'] }
      },
      orderBy: { createdAt: 'desc' }
    });

    return cases.map(mapImpactCase);
  }

  async listImpactCasesForChapter(tenantId: string, novelId: string, chapterId: string): Promise<ImpactCaseRecord[]> {
    const cases = await this.prisma.impactCase.findMany({
      where: { tenantId, novelId, sourceObjectId: chapterId },
      orderBy: { createdAt: 'desc' }
    });

    return cases.map(mapImpactCase);
  }

  async findImpactCaseById(tenantId: string, novelId: string, impactCaseId: string): Promise<ImpactCaseRecord | null> {
    const impactCase = await this.prisma.impactCase.findFirst({
      where: { tenantId, novelId, id: impactCaseId }
    });

    return impactCase ? mapImpactCase(impactCase) : null;
  }

  async findLatestLongTermMemory(
    tenantId: string,
    novelId: string,
    chapterId?: string | null,
    prisma: Prisma.TransactionClient = this.prisma
  ): Promise<LongTermMemoryRecord | null> {
    const chapters = await prisma.novelChapter.findMany({
      where: { tenantId, novelId, deletedAt: null, ...(chapterId ? { id: chapterId } : {}) },
      select: { id: true, chapterNo: true, currentContentVersionId: true }
    });
    const referencedContentIds = chapters
      .map((chapter) => chapter.currentContentVersionId)
      .filter((id): id is string => Boolean(id));
    if (referencedContentIds.length === 0) return null;
    const versions = await prisma.chapterContentVersion.findMany({
      where: { tenantId, novelId, id: { in: referencedContentIds }, status: PrismaVersionStatus.CURRENT },
      select: { id: true, chapterId: true }
    });
    const currentVersionByChapter = new Map(versions.map((version) => [version.chapterId, version.id]));
    const eligibleChapters = chapters.filter((chapter) =>
      chapter.currentContentVersionId && currentVersionByChapter.get(chapter.id) === chapter.currentContentVersionId);
    if (eligibleChapters.length === 0) return null;
    const where = {
      tenantId,
      novelId,
      status: PrismaVersionStatus.CURRENT,
      staleLevel: { not: PrismaStaleLevel.HARD_STALE },
      chapterId: { in: eligibleChapters.map((chapter) => chapter.id) },
      sourceContentVersionId: { in: eligibleChapters.map((chapter) => chapter.currentContentVersionId!) }
    };
    const memory = chapterId
      ? await prisma.longTermMemory.findFirst({
          where: { tenantId, novelId, status: PrismaVersionStatus.CURRENT, staleLevel: { not: PrismaStaleLevel.HARD_STALE }, chapterId,
            sourceContentVersionId: eligibleChapters[0].currentContentVersionId },
          orderBy: { createdAt: 'desc' }
        })
      : await (async () => {
          const candidates = await prisma.longTermMemory.findMany({
            where,
            select: { id: true, chapterId: true, sourceContentVersionId: true, createdAt: true }
          });
          const chapterOrder = new Map(eligibleChapters.map((chapter) => [chapter.id, chapter.chapterNo]));
          const latest = candidates.filter((candidate) =>
            currentVersionByChapter.get(candidate.chapterId ?? '') === candidate.sourceContentVersionId
          ).sort((left, right) =>
            (chapterOrder.get(right.chapterId ?? '') ?? 0) - (chapterOrder.get(left.chapterId ?? '') ?? 0) ||
            right.createdAt.getTime() - left.createdAt.getTime())[0];
          return latest ? prisma.longTermMemory.findFirst({ where: { ...where, id: latest.id } }) : null;
        })();

    return memory ? mapLongTermMemory(memory) : null;
  }

  async findLatestFullReview(tenantId: string, novelId: string): Promise<{ reviewReport: ReviewReportRecord; gate: FullReviewGateRecord } | null> {
    const report = await this.prisma.reviewReport.findFirst({
      where: { tenantId, novelId, reviewLevel: 'full_novel' }, orderBy: { createdAt: 'desc' }
    });
    if (!report) return null;
    const gate = await this.prisma.fullReviewGate.findFirst({ where: { tenantId, novelId, reviewReportId: report.id } });
    return gate ? { reviewReport: mapReviewReport(report), gate: mapFullReviewGate(gate) } : null;
  }

  async findFullReviewGateById(tenantId: string, novelId: string, gateId: string): Promise<FullReviewGateRecord | null> {
    const gate = await this.prisma.fullReviewGate.findFirst({ where: { tenantId, novelId, id: gateId } });
    return gate ? mapFullReviewGate(gate) : null;
  }

  async findFullReviewByIdempotencyKey(
    tenantId: string,
    novelId: string,
    idempotencyKey: string
  ): Promise<{ task: GenerationTaskRecord; reviewReport: ReviewReportRecord; gate: FullReviewGateRecord } | null> {
    const task = await this.prisma.generationTask.findFirst({
      where: { tenantId, novelId, taskType: 'novel_full_review', idempotencyToken: idempotencyKey }
    });
    if (!task?.resultObjectId) return null;
    const report = await this.prisma.reviewReport.findFirst({
      where: { tenantId, novelId, id: task.resultObjectId, reviewLevel: 'full_novel', sourceTaskId: task.id }
    });
    if (!report) return null;
    const gate = await this.prisma.fullReviewGate.findFirst({ where: { tenantId, novelId, reviewReportId: report.id } });
    return gate ? { task: mapGenerationTask(task), reviewReport: mapReviewReport(report), gate: mapFullReviewGate(gate) } : null;
  }

  async findCompletionDecisionById(_tenantId: string, _novelId: string, _decisionId: string): Promise<CompletionDecisionRecord | null> {
    return null;
  }

  async findLatestCompletionDecision(_tenantId: string, _novelId: string): Promise<CompletionDecisionRecord | null> {
    return null;
  }

  async findCompletionDecisionByIdempotencyKey(_tenantId: string, _novelId: string, _idempotencyKey: string): Promise<CompletionDecisionRecord | null> {
    return null;
  }

  async findLatestVideoReadinessCheck(_tenantId: string, _novelId: string): Promise<VideoReadinessCheckRecord | null> {
    return null;
  }

  async findVideoReadinessCheckById(_tenantId: string, _novelId: string, _checkId: string): Promise<VideoReadinessCheckRecord | null> {
    return null;
  }

  async findLatestVideoReadinessSnapshot(_tenantId: string, _novelId: string): Promise<VideoReadinessSnapshotRecord | null> {
    return null;
  }

  async findVideoReadinessSnapshotByIdempotencyKey(_tenantId: string, _novelId: string, _idempotencyKey: string): Promise<VideoReadinessSnapshotRecord | null> {
    return null;
  }

  async createBodyBatchTask(input: BodyBatchTaskCreationInput): Promise<CreatedBodyBatchTaskRecord> {
    return this.prisma.$transaction(async (tx) => {
      validateBodyBatchRange(input);
      const { task } = await verifyBodyBatchWriteContext(tx, input);
      const existing = readBodyBatchProgress(task);
      if (existing) {
        assertMatchingBodyBatchProgress(existing, input);
        const novel = await tx.novel.findFirstOrThrow({ where: { id: input.novel.id, tenantId: input.context.tenantId } });
        return { novel: mapNovel(novel), task: mapGenerationTask(task), reused: true };
      }
      const chapters = await tx.novelChapter.findMany({
        where: { tenantId: input.context.tenantId, novelId: input.novel.id, deletedAt: null, chapterNo: { gte: input.startChapterNo, lte: input.endChapterNo } },
        orderBy: { chapterNo: 'asc' }
      });
      if (chapters.length !== input.endChapterNo - input.startChapterNo + 1 || chapters.some((chapter, index) => chapter.chapterNo !== input.startChapterNo + index)) {
        throw new BusinessError(ErrorCode.GateBlocked, '正文批次章节目录不完整，请刷新后重试。');
      }
      if (chapters.some((chapter) => chapter.currentContentVersionId)) {
        throw new BusinessError(ErrorCode.GateBlocked, '本批范围已有正式正文，不能覆盖。');
      }
      const existingVersion = await tx.chapterContentVersion.findFirst({
        where: { tenantId: input.context.tenantId, novelId: input.novel.id, chapterId: { in: chapters.map((chapter) => chapter.id) } },
        select: { id: true }
      });
      if (existingVersion) throw new BusinessError(ErrorCode.GateBlocked, '本批范围已有正文版本，需先人工处理，不能重复生成。');
      const batchId = createId('bodybatch');
      const progress: BodyBatchProgress = {
        batchId,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        strategySnapshotId: input.strategySnapshot.id,
        strategySnapshotVersion: input.strategySnapshot.versionNo,
        sourceVersionRefs: input.sourceVersionRefs,
        startChapterNo: input.startChapterNo,
        endChapterNo: input.endChapterNo,
        chapterResults: []
      };
      const updatedTask = await tx.generationTask.update({
        where: { id: task.id, tenantId: input.context.tenantId },
        data: {
          progress: 8,
          currentStep: `正在生成第 ${input.startChapterNo}-${input.endChapterNo} 章正文`,
          statusNote: '正在生成正文，可以稍后回来查看。',
          resultObjectType: 'body_batch',
          metadata: toJsonObject({ ...toRecord(task.metadata), bodyBatchProgress: progress }),
          updatedAt: input.now
        }
      });
      const novel = await tx.novel.update({
        where: { id: input.novel.id, tenantId: input.context.tenantId },
        data: { stageStatus: PrismaStageStatus.PROCESSING, updatedBy: input.context.userId, updatedAt: input.now }
      });
      await createTaskEvent(tx, { task: updatedTask, eventType: 'calling_model', message: '正在生成本批正文。', progress: 8, requestId: input.context.requestId, createdAt: input.now });
      return { novel: mapNovel(novel), task: mapGenerationTask(updatedTask), reused: false };
    });
  }

  async createFullReview(_input: FullReviewCreationInput): Promise<CreatedFullReviewRecord> {
    throw new Error('Package 7 Prisma full-review write path is not implemented; use in-memory mock provider for current package verification.');
  }

  async forcePassFullReview(_input: FullReviewForcePassInput): Promise<ForcedFullReviewRecord> {
    throw new Error('Package 7 Prisma full-review force-pass path is not implemented; use in-memory mock provider for current package verification.');
  }

  async resolveFullReviewIssue(_input: FullReviewIssueResolutionInput): Promise<ResolvedFullReviewIssueRecord> {
    throw new Error('Package 7 Prisma full-review issue path is not implemented; use in-memory mock provider for current package verification.');
  }

  async confirmCompletion(_input: CompletionConfirmationInput): Promise<ConfirmedCompletionRecord> {
    throw new Error('Package 7 Prisma completion write path is not implemented; use in-memory mock provider for current package verification.');
  }

  async createVideoReadinessCheck(_input: VideoReadinessCheckInput): Promise<CreatedVideoReadinessCheckRecord> {
    throw new Error('Package 7 Prisma video-readiness check path is not implemented; use in-memory mock provider for current package verification.');
  }

  async confirmVideoReadiness(_input: VideoReadinessConfirmationInput): Promise<ConfirmedVideoReadinessRecord> {
    throw new Error('Package 7 Prisma video-readiness snapshot path is not implemented; use in-memory mock provider for current package verification.');
  }

  async generateBodyBatch(input: BodyBatchGenerationInput): Promise<GeneratedBodyBatchRecord> {
    validateBodyBatchRange(input);
    validateBodyBatchDrafts(input);
    for (const draft of input.chapters) {
      const done = await this.prisma.$transaction(async (tx) => {
        const { task } = await verifyBodyBatchWriteContext(tx, input);
        const progress = requireBodyBatchProgress(task, input);
        const prior = progress.chapterResults.find((result) => result.chapterNo === draft.chapter.chapterNo);
        if (prior) {
          await verifyPersistedBodyChapterResult(tx, input, prior);
          return prior.status === 'failed';
        }
        if (progress.chapterResults.length !== draft.chapter.chapterNo - input.startChapterNo) {
          throw new BusinessError(ErrorCode.GateBlocked, '正文批次检查点不连续，已停止写入。');
        }
        const chapter = await tx.novelChapter.findFirst({
          where: { id: draft.chapter.id, tenantId: input.context.tenantId, novelId: input.novel.id, chapterNo: draft.chapter.chapterNo, deletedAt: null }
        });
        if (!chapter || chapter.currentContentVersionId) {
          throw new BusinessError(ErrorCode.GateBlocked, '章节已变化或已有正式正文，不能覆盖。');
        }
        if (chapter.wordTarget !== draft.chapter.wordTarget) {
          throw new BusinessError(ErrorCode.CandidateStale, '章节目标字数已变化，正文批次已停止。');
        }
        if (!draft.hardFailed && !evaluateChapterLength(draft.content, chapter.wordTarget).canAdopt) {
          throw new BusinessError(ErrorCode.GateBlocked, '正文字数超出当前章节允许范围，不能写入正式版本。');
        }
        const existingVersion = await tx.chapterContentVersion.findFirst({
          where: { tenantId: input.context.tenantId, novelId: input.novel.id, chapterId: chapter.id }, select: { id: true }
        });
        if (existingVersion) throw new BusinessError(ErrorCode.GateBlocked, '章节已有正文候选或历史版本，不能重复写入。');
        const locked = await tx.novelChapter.updateMany({
          where: { id: chapter.id, tenantId: input.context.tenantId, novelId: input.novel.id, deletedAt: null, currentContentVersionId: null },
          data: { lastGenerationTaskId: task.id, updatedAt: input.now }
        });
        if (locked.count !== 1) throw new BusinessError(ErrorCode.GateBlocked, '章节并发写入冲突，已停止本批。');
        const result = draft.hardFailed
          ? await persistFailedBodyChapter(tx, input, task.id, draft)
          : await persistCompletedBodyChapter(tx, input, task.id, progress.batchId, draft);
        const chapterResults = [...progress.chapterResults, result];
        const nextProgress = { ...progress, chapterResults };
        const updatedTask = await tx.generationTask.update({
          where: { id: task.id, tenantId: input.context.tenantId },
          data: {
            progress: Math.min(95, 20 + chapterResults.length * 15),
            currentStep: `已处理第 ${draft.chapter.chapterNo} 章`,
            statusNote: draft.hardFailed ? `第 ${draft.chapter.chapterNo} 章硬失败，后续章节暂停。` : `第 ${draft.chapter.chapterNo} 章已保存。`,
            resultVersionIdsJson: chapterResults.map((item) => item.contentVersionId).filter((id): id is string => Boolean(id)),
            metadata: toJsonObject({ ...toRecord(task.metadata), bodyBatchProgress: nextProgress }),
            updatedAt: input.now
          }
        });
        await createTaskEvent(tx, {
          task: updatedTask,
          eventType: draft.hardFailed ? 'chapter_failed' : 'chapter_saved',
          message: draft.hardFailed ? `第 ${draft.chapter.chapterNo} 章硬失败，后续章节暂停。` : `第 ${draft.chapter.chapterNo} 章已保存正文与审稿。`,
          progress: updatedTask.progress,
          requestId: input.context.requestId,
          createdAt: input.now
        });
        return draft.hardFailed;
      });
      if (done) break;
    }
    return this.prisma.$transaction(async (tx) => {
      const { task } = await verifyBodyBatchWriteContext(tx, input);
      const progress = requireBodyBatchProgress(task, input);
      const overlengthPersistence = input.overlengthDraft
        ? await persistOverlengthBodyCandidates(tx, input, progress)
        : null;
      const overlengthResult = overlengthPersistence?.chapterResult ?? null;
      const chapterResults = overlengthResult ? [...progress.chapterResults, overlengthResult] : progress.chapterResults;
      const failed = chapterResults.find((result) => result.status === 'failed') ?? null;
      const totalCount = input.endChapterNo - input.startChapterNo + 1;
      if (!failed && !overlengthResult && chapterResults.length !== totalCount) {
        throw new BusinessError(ErrorCode.GateBlocked, '正文批次结果不完整，不能标记完成。');
      }
      const completedCount = chapterResults.filter((result) => result.status === 'completed').length;
      const summary: BodyBatchRecord['summary'] = {
        id: createId('batchsummary'),
        batchId: progress.batchId,
        conclusion: overlengthResult
          ? `已完成 ${completedCount} 章，第 ${overlengthResult.chapterNo} 章原稿超长，已保存候选并暂停后续章节。`
          : failed
          ? `已完成 ${completedCount} 章，第 ${failed.chapterNo} 章硬失败，后续章节已暂停。`
          : `第 ${input.startChapterNo}-${input.endChapterNo} 章批量正文已完成。`,
        chapterResults,
        riskTrend: failed || overlengthResult || chapterResults.some((result) => result.score !== null && result.score < 70)
          ? '本批存在需要关注的质量风险。' : '本批未发现阻塞风险。',
        nextBatchNotes: input.previousBatchSummary?.nextBatchNotes ?? [],
        riskChapterIds: chapterResults.filter((result) => result.hardFailed || result.status === 'pending' || (result.score !== null && result.score < 70)).map((result) => result.chapterId),
        createdAt: input.now
      };
      const batch: BodyBatchRecord = {
        id: progress.batchId,
        tenantId: input.context.tenantId,
        novelId: input.novel.id,
        taskId: task.id,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        strategySnapshotId: input.strategySnapshot.id,
        strategySnapshotVersion: input.strategySnapshot.versionNo,
        sourceVersionRefs: input.sourceVersionRefs,
        startChapterNo: input.startChapterNo,
        endChapterNo: input.endChapterNo,
        status: failed || overlengthResult ? 'paused' : 'completed',
        statusNote: overlengthResult ? `第 ${overlengthResult.chapterNo} 章超长待处理，后续章节未继续。` : failed ? `第 ${failed.chapterNo} 章硬失败，后续章节未继续。` : '本批正文生成完成。',
        completedCount,
        failedCount: failed ? 1 : 0,
        pendingCount: overlengthResult ? totalCount - completedCount : failed ? totalCount - completedCount - 1 : 0,
        failedChapterNo: failed?.chapterNo ?? overlengthResult?.chapterNo ?? null,
        chapterResults,
        summary,
        createdAt: input.now,
        metadata: { previousBatchSummaryId: input.previousBatchSummary?.id ?? null,
          overlengthCandidateId: overlengthResult?.contentVersionId ?? null,
          overlengthRevisionCandidateId: overlengthPersistence?.candidateIds[1] ?? null }
      };
      const updatedTask = await transitionClaimedTask(tx, {
        taskId: task.id,
        tenantId: input.context.tenantId,
        data: {
          status: overlengthResult ? PrismaTaskStatus.WAITING_CONFIRMATION : failed ? PrismaTaskStatus.FAILED : PrismaTaskStatus.COMPLETED,
          statusNote: overlengthResult ? '原稿超长已存为候选，等待处理；正式正文未写入。' : failed ? '硬失败待处理，已完成章节保留。' : '本批正文生成完成。',
          progress: 100,
          currentStep: overlengthResult ? `第 ${overlengthResult.chapterNo} 章超长待处理` : failed ? `第 ${failed.chapterNo} 章硬失败待处理` : '批次总结已生成',
          outputSummary: summary.conclusion,
          resultObjectType: 'body_batch',
          resultObjectId: batch.id,
          resultVersionIdsJson: [...new Set([
            ...chapterResults.map((result) => result.contentVersionId).filter((id): id is string => Boolean(id)),
            ...(overlengthPersistence?.candidateIds ?? [])
          ])],
          failureCategory: failed ? 'quality_failed' : null,
          errorCode: failed ? 'QUALITY_GATE_FAILED' : null,
          errorMessage: failed ? `第 ${failed.chapterNo} 章硬失败，后续章节已暂停。` : null,
          activeClaimKey: null,
          finishedAt: input.now,
          metadata: toJsonObject({ ...toRecord(task.metadata), bodyBatchProgress: { ...progress, chapterResults }, batch }),
          updatedAt: input.now
        }
      });
      await createTaskEvent(tx, {
        task: updatedTask,
        eventType: failed || overlengthResult ? 'batch_paused' : 'batch_completed',
        message: summary.conclusion,
        progress: 100,
        requestId: input.context.requestId,
        createdAt: input.now
      });
      const remaining = await tx.novelChapter.count({
        where: { tenantId: input.context.tenantId, novelId: input.novel.id, deletedAt: null, currentContentVersionId: null }
      });
      const novel = await tx.novel.update({
        where: { id: input.novel.id, tenantId: input.context.tenantId },
        data: {
          creationStage: PrismaNovelCreationStage.BODY,
          stageStatus: failed || overlengthResult ? PrismaStageStatus.BLOCKED : remaining === 0 ? PrismaStageStatus.COMPLETED : PrismaStageStatus.NOT_STARTED,
          updatedBy: input.context.userId,
          updatedAt: input.now
        }
      });
      const chapters = await tx.novelChapter.findMany({
        where: { tenantId: input.context.tenantId, novelId: input.novel.id, deletedAt: null },
        orderBy: { chapterNo: 'asc' }
      });
      return { novel: mapNovel(novel), task: mapGenerationTask(updatedTask), batch, chapters: chapters.map(mapNovelChapter) };
    });
  }

  async rewriteChapter(_input: ChapterRewriteInput): Promise<RewrittenChapterRecord> {
    throw new Error('Package 6 Prisma rewrite path is not implemented; use in-memory mock provider for current package verification.');
  }

  async createOverlengthRevision(input: OverlengthRevisionInput): Promise<SavedOverlengthRevisionRecord> {
    return this.prisma.$transaction(async (tx) => {
      const tenantId = input.context.tenantId;
      const claimed = await tx.generationTask.updateMany({
        where: { id: input.task.id, tenantId, novelId: input.novel.id,
          taskType: 'chapter_overlength_revise', status: PrismaTaskStatus.PROCESSING,
          activeClaimKey: input.task.activeClaimKey, requestHash: input.task.requestHash,
          cancelRequestedAt: null },
        data: { updatedAt: input.now }
      });
      if (claimed.count !== 1) throw new BusinessError(ErrorCode.GateBlocked, '精简任务已取消或失去 claim，模型结果已丢弃。');
      const task = await tx.generationTask.findFirstOrThrow({ where: { id: input.task.id, tenantId } });
      const refs = toRecord(task.sourceVersionRefs);
      if (refs.candidateVersionId !== input.original.id || refs.currentContentVersionId !== null ||
        refs.currentChapterPlanVersionId !== input.novel.currentChapterPlanVersionId) {
        throw new BusinessError(ErrorCode.CandidateStale, '精简任务的原稿或上游目录已变化。');
      }
      const novelLock = await tx.novel.updateMany({
        where: { id: input.novel.id, tenantId, deletedAt: null,
          lifecycleStatus: PrismaNovelLifecycleStatus.ACTIVE, creationStage: PrismaNovelCreationStage.BODY,
          currentChapterPlanVersionId: String(refs.currentChapterPlanVersionId) },
        data: { updatedAt: input.now }
      });
      const chapterLock = await tx.novelChapter.updateMany({
        where: { id: input.chapter.id, tenantId, novelId: input.novel.id, deletedAt: null,
          currentContentVersionId: null, wordTarget: input.chapter.wordTarget },
        data: { updatedAt: input.now }
      });
      if (novelLock.count !== 1 || chapterLock.count !== 1) {
        throw new BusinessError(ErrorCode.CandidateStale, '小说目录或章节目标已变化，未保存精简候选。');
      }
      const original = await tx.chapterContentVersion.findFirst({
        where: { id: input.original.id, tenantId, novelId: input.novel.id, chapterId: input.chapter.id,
          status: PrismaVersionStatus.CANDIDATE, sourceType: 'ai_overlength_original' }
      });
      if (!original || original.content !== input.original.content ||
        toRecord(toRecord(original.metadata).lengthGate).target !== input.chapter.wordTarget ||
        evaluateChapterLength(original.content, input.chapter.wordTarget).status !== 'too_long') {
        throw new BusinessError(ErrorCode.CandidateStale, '超长原稿已变化，未保存精简候选。');
      }
      const priorRevision = await tx.chapterContentVersion.findFirst({
        where: { tenantId, novelId: input.novel.id, chapterId: input.chapter.id, sourceType: 'ai_overlength_revision' }
      });
      if (priorRevision) throw new BusinessError(ErrorCode.GateBlocked, '本章已有一次精简候选，请先查看已有结果。');
      const lengthGate = evaluateChapterLength(input.content, input.chapter.wordTarget);
      if (lengthGate.status !== 'pass') throw new BusinessError(ErrorCode.GateBlocked, '精简稿未通过字数门禁。');
      const latest = await tx.chapterContentVersion.findFirst({
        where: { tenantId, novelId: input.novel.id, chapterId: input.chapter.id }, orderBy: { versionNo: 'desc' },
        select: { versionNo: true }
      });
      const candidate = await tx.chapterContentVersion.create({ data: {
        tenantId, novelId: input.novel.id, chapterId: input.chapter.id,
        versionNo: (latest?.versionNo ?? 0) + 1, status: PrismaVersionStatus.CANDIDATE,
        staleLevel: PrismaStaleLevel.NONE, sourceType: 'ai_overlength_revision', sourceTaskId: task.id,
        sourceVersionRefs: toJsonObject(task.sourceVersionRefs), rewriteReason: '用户发起超长正文精简',
        content: input.content, wordCount: lengthGate.actual, summary: null, reviewScore: null,
        createdBy: input.context.userId, createdAt: input.now,
        metadata: toJsonObject({ reviewRequired: true, lengthRecovery: 'revision',
          revisionOfCandidateId: original.id, lengthGate, chapterNo: input.chapter.chapterNo,
          title: input.chapter.title, riskLevel: RiskLevel.Medium })
      } });
      const updatedTask = await transitionClaimedTask(tx, { taskId: task.id, tenantId, data: {
        status: PrismaTaskStatus.WAITING_CONFIRMATION, statusNote: '超长精简候选已保存，待逐版本复核。',
        progress: 100, currentStep: '精简候选待复核', outputSummary: '精简候选已保存，正式正文未改变。',
        resultObjectType: 'chapter_content_version', resultObjectId: candidate.id,
        resultVersionIdsJson: [candidate.id], activeClaimKey: null, finishedAt: input.now, updatedAt: input.now
      } });
      await createTaskEvent(tx, { task: updatedTask, eventType: 'candidate_created',
        message: '精简候选已保存，等待复核。', progress: 100,
        requestId: input.context.requestId, createdAt: input.now });
      return { task: mapGenerationTask(updatedTask), candidate: mapChapterContentVersion(candidate) };
    });
  }

  async adoptChapterContent(_input: ChapterContentAdoptionInput): Promise<AdoptedChapterContentRecord> {
    throw new Error('Package 6 Prisma adoption path is not implemented; use in-memory mock provider for current package verification.');
  }

  async createImpactAssessment(_input: ImpactAssessmentInput): Promise<CreatedImpactAssessmentRecord> {
    throw new Error('Package 6 Prisma impact-assessment write path is not implemented; use in-memory mock provider for current package verification.');
  }

  async resolveImpactCase(_input: ImpactCaseResolveInput): Promise<ResolvedImpactCaseRecord> {
    throw new Error('Package 6 Prisma impact resolve write path is not implemented; use in-memory mock provider for current package verification.');
  }
}

async function lockGenerationAuthority(tx: Prisma.TransactionClient, input: LoadGenerationAuthorityInput) {
  const lock = (table: string) => tx.$queryRaw(
    Prisma.sql`SELECT id FROM ${Prisma.raw(table)} WHERE tenant_id = ${input.tenantId} AND novel_id = ${input.novelId} FOR UPDATE`
  );
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM novel WHERE tenant_id = ${input.tenantId} AND id = ${input.novelId} FOR UPDATE`
  );
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM create_novel_preferences WHERE tenant_id = ${input.tenantId} AND novel_id = ${input.novelId} FOR UPDATE`
  );
  await lock('creative_version');
  await lock('novel_chapter');
  await lock('chapter_content_version');
  await lock('trial_run');
  await lock('long_term_memory');
  await lock('generation_task');
}
async function assertNoActiveAuthorityClaim(
  tx: Prisma.TransactionClient,
  tenantId: string,
  novelId: string,
  allowedTask?: Pick<GenerationTaskRecord, 'id' | 'conflictScope' | 'conflictKey'>
) {
  await lockNovelAuthorityRoot(tx, tenantId, novelId);
  await assertNoActiveAuthorityClaimAfterRootLock(tx, tenantId, novelId, allowedTask);
}

async function lockNovelAuthorityRoot(tx: Prisma.TransactionClient, tenantId: string, novelId: string) {
  // The novel row is the shared lock root for claim, fences, finalizers, and authority-changing user writes.
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM novel WHERE tenant_id = ${tenantId} AND id = ${novelId} FOR UPDATE`
  );
}

async function assertNoActiveAuthorityClaimAfterRootLock(
  tx: Prisma.TransactionClient,
  tenantId: string,
  novelId: string,
  allowedTask?: Pick<GenerationTaskRecord, 'id' | 'conflictScope' | 'conflictKey'>
) {
  const activeTask = await tx.generationTask.findFirst({
    where: {
      tenantId,
      novelId,
      status: PrismaTaskStatus.PROCESSING,
      activeClaimKey: { not: null },
      ...(allowedTask ? { id: { not: allowedTask.id } } : {}),
      ...(allowedTask?.conflictScope === 'chapter' ? {
        OR: [
          { conflictScope: { not: 'chapter' } },
          { conflictScope: null },
          { conflictScope: 'chapter', conflictKey: allowedTask.conflictKey }
        ]
      } : {})
    }
  });
  if (!activeTask) return;
  throw new BusinessError(ErrorCode.ConflictTaskExists, '小说权威来源正在被生成任务使用，请等待任务结束或先取消任务。', {
    taskId: activeTask.id,
    taskType: activeTask.taskType
  });
}
interface BodyBatchProgress {
  batchId: string;
  idempotencyKey: string;
  requestFingerprint: unknown;
  strategySnapshotId: string;
  strategySnapshotVersion: number;
  sourceVersionRefs: unknown;
  startChapterNo: number;
  endChapterNo: number;
  chapterResults: BodyBatchChapterResultDTO[];
}

function stableBodyValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableBodyValue).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableBodyValue(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function validateBodyBatchRange(input: BodyBatchTaskCreationInput | BodyBatchGenerationInput) {
  if (!Number.isInteger(input.startChapterNo) || !Number.isInteger(input.endChapterNo) ||
      input.startChapterNo <= 3 || input.endChapterNo < input.startChapterNo || input.endChapterNo - input.startChapterNo >= 5) {
    throw new BusinessError(ErrorCode.GateBlocked, '正文批次范围必须是第 4 章起的连续 1-5 章。');
  }
}

function validateBodyBatchDrafts(input: BodyBatchGenerationInput) {
  const total = input.endChapterNo - input.startChapterNo + 1;
  const overlength = input.overlengthDraft;
  if ((!overlength && input.chapters.length === 0) || input.chapters.length > total ||
      input.chapters.some((draft, index) => draft.chapter.chapterNo !== input.startChapterNo + index ||
        (draft.hardFailed && index !== input.chapters.length - 1)) ||
      (overlength && (input.chapters.at(-1)?.hardFailed || overlength.chapter.chapterNo !== input.startChapterNo + input.chapters.length ||
        overlength.chapter.chapterNo > input.endChapterNo ||
        evaluateChapterLength(overlength.originalContent, overlength.chapter.wordTarget).status !== 'too_long' ||
        (overlength.revisedContent !== undefined && evaluateChapterLength(overlength.revisedContent, overlength.chapter.wordTarget).status !== 'pass'))) ||
      (!overlength && !input.chapters.at(-1)?.hardFailed && input.chapters.length !== total)) {
    throw new BusinessError(ErrorCode.GateBlocked, '模型返回的正文章节不连续或不完整，未写入正文。');
  }
}

function readBodyBatchProgress(task: { metadata: unknown }): BodyBatchProgress | null {
  const raw = toRecord(toRecord(task.metadata).bodyBatchProgress);
  if (!raw.batchId) return null;
  if (typeof raw.batchId !== 'string' || raw.batchId.length === 0 || typeof raw.idempotencyKey !== 'string' ||
      typeof raw.strategySnapshotId !== 'string' || typeof raw.strategySnapshotVersion !== 'number' ||
      typeof raw.startChapterNo !== 'number' || typeof raw.endChapterNo !== 'number' ||
      !Array.isArray(raw.chapterResults)) {
    throw new BusinessError(ErrorCode.GateBlocked, '正文批次检查点损坏，已停止写入。');
  }
  return raw as unknown as BodyBatchProgress;
}

function assertMatchingBodyBatchProgress(progress: BodyBatchProgress, input: BodyBatchTaskCreationInput | BodyBatchGenerationInput) {
  if (progress.idempotencyKey !== input.idempotencyKey || progress.strategySnapshotId !== input.strategySnapshot.id ||
      progress.strategySnapshotVersion !== input.strategySnapshot.versionNo || progress.startChapterNo !== input.startChapterNo ||
      progress.endChapterNo !== input.endChapterNo ||
      stableBodyValue(progress.requestFingerprint) !== stableBodyValue(input.requestFingerprint) ||
      stableBodyValue(progress.sourceVersionRefs) !== stableBodyValue(input.sourceVersionRefs)) {
    throw new BusinessError(ErrorCode.IdempotencyConflict, '正文批次幂等键已绑定到不同请求。');
  }
}

function requireBodyBatchProgress(task: { metadata: unknown }, input: BodyBatchGenerationInput): BodyBatchProgress {
  const progress = readBodyBatchProgress(task);
  if (!progress) throw new BusinessError(ErrorCode.GateBlocked, '正文批次尚未预占，不能保存模型结果。');
  assertMatchingBodyBatchProgress(progress, input);
  return progress;
}

async function verifyBodyBatchWriteContext(tx: Prisma.TransactionClient, input: BodyBatchTaskCreationInput | BodyBatchGenerationInput) {
  const tenantId = input.context.tenantId;
  if (!input.task.activeClaimKey || !input.task.requestHash || !input.task.idempotencyToken ||
      !['body_batch_generate', 'chapter_body_generate'].includes(input.task.taskType) || input.task.novelId !== input.novel.id) {
    throw new BusinessError(ErrorCode.GateBlocked, '正文任务缺少有效 claim，不能写入。');
  }
  const taskLock = await tx.generationTask.updateMany({
    where: {
      id: input.task.id,
      tenantId,
      novelId: input.novel.id,
      taskType: input.task.taskType,
      status: PrismaTaskStatus.PROCESSING,
      activeClaimKey: input.task.activeClaimKey,
      idempotencyToken: input.task.idempotencyToken,
      requestHash: input.task.requestHash,
      cancelRequestedAt: null,
      ...(input.task.leaseToken
        ? { leaseOwnerId: input.task.leaseOwnerId, leaseToken: input.task.leaseToken, leaseExpiresAt: { gt: input.now } }
        : { leaseToken: null })
    },
    data: { updatedAt: input.now }
  });
  if (taskLock.count !== 1) throw new BusinessError(ErrorCode.GateBlocked, '正文任务已取消、失去 claim 或版本变化，结果已丢弃。');
  const task = await tx.generationTask.findFirstOrThrow({ where: { id: input.task.id, tenantId } });
  const claimedRefs = toRecord(task.sourceVersionRefs);
  const requestedRefs = toRecord(input.sourceVersionRefs);
  if (Object.keys(requestedRefs).some((key) => stableBodyValue(claimedRefs[key]) !== stableBodyValue(requestedRefs[key]))) {
    throw new BusinessError(ErrorCode.CandidateStale, '正文任务来源版本已变化。');
  }
  const refs = toRecord(input.sourceVersionRefs);
  for (const key of ['currentDirectionVersionId', 'currentSettingVersionId', 'currentOutlineVersionId', 'currentStageOutlineVersionId', 'currentChapterPlanVersionId', 'trialRunId', 'selectedChapterOneCandidateId']) {
    if (typeof refs[key] !== 'string' || !(refs[key] as string).trim()) {
      throw new BusinessError(ErrorCode.GateBlocked, '正文批次缺少必需的上游版本引用。', { field: key });
    }
  }
  const novelLock = await tx.novel.updateMany({
    where: {
      id: input.novel.id,
      tenantId,
      deletedAt: null,
      lifecycleStatus: PrismaNovelLifecycleStatus.ACTIVE,
      creationStage: PrismaNovelCreationStage.BODY,
      currentDirectionVersionId: asNullableBodyRef(refs.currentDirectionVersionId),
      currentSettingVersionId: asNullableBodyRef(refs.currentSettingVersionId),
      currentOutlineVersionId: asNullableBodyRef(refs.currentOutlineVersionId),
      currentStageOutlineVersionId: asNullableBodyRef(refs.currentStageOutlineVersionId),
      currentChapterPlanVersionId: asNullableBodyRef(refs.currentChapterPlanVersionId)
    },
    data: { updatedAt: input.now }
  });
  if (novelLock.count !== 1) throw new BusinessError(ErrorCode.CandidateStale, '小说或上游版本已变化，正文批次已停止。');
  const trialRun = await tx.trialRun.findFirst({
    where: { id: String(refs.trialRunId), tenantId, novelId: input.novel.id, status: 'confirmed' }
  });
  if (!trialRun || toRecord(trialRun.metadata).bodyStrategySnapshotId !== input.strategySnapshot.id) {
    throw new BusinessError(ErrorCode.CandidateStale, '试写确认或正文策略来源已变化，正文批次已停止。');
  }
  const snapshot = await tx.creativeVersion.findFirst({
    where: {
      id: input.strategySnapshot.id,
      tenantId,
      novelId: input.novel.id,
      objectType: 'body_strategy_snapshot',
      versionNo: input.strategySnapshot.versionNo,
      status: PrismaVersionStatus.CURRENT,
      staleLevel: PrismaStaleLevel.NONE
    }
  });
  if (!snapshot || refs.strategySnapshotId !== snapshot.id || refs.strategySnapshotVersion !== snapshot.versionNo || refs.creationStage !== 'body') {
    throw new BusinessError(ErrorCode.CandidateStale, '正文策略快照已变化，不能写入旧批次。');
  }
  const snapshotRefs = toRecord(snapshot.sourceVersionRefs);
  for (const key of ['currentDirectionVersionId', 'currentSettingVersionId', 'currentOutlineVersionId', 'currentStageOutlineVersionId', 'currentChapterPlanVersionId', 'trialRunId', 'selectedChapterOneCandidateId']) {
    if (refs[key] !== snapshotRefs[key]) throw new BusinessError(ErrorCode.CandidateStale, '正文策略快照的来源版本不匹配。');
  }
  return { task };
}

function asNullableBodyRef(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

async function verifyPersistedBodyChapterResult(tx: Prisma.TransactionClient, input: BodyBatchGenerationInput, result: BodyBatchChapterResultDTO) {
  const chapter = await tx.novelChapter.findFirst({
    where: { id: result.chapterId, tenantId: input.context.tenantId, novelId: input.novel.id, chapterNo: result.chapterNo, deletedAt: null }
  });
  if (!chapter || chapter.lastGenerationTaskId !== input.task.id) throw new BusinessError(ErrorCode.GateBlocked, '已保存章节的任务归属已变化，不能续写。');
  if (result.status === 'failed') {
    if (chapter.currentContentVersionId) throw new BusinessError(ErrorCode.GateBlocked, '失败章节已有正式正文，不能续写。');
    return;
  }
  if (!result.contentVersionId || !result.featureCardId || !result.reviewReportId || !result.longTermMemoryId ||
      chapter.currentContentVersionId !== result.contentVersionId || chapter.currentFeatureCardVersionId !== result.featureCardId ||
      chapter.currentReviewReportId !== result.reviewReportId) {
    throw new BusinessError(ErrorCode.GateBlocked, '已保存章节版本引用不一致，不能续写。');
  }
  const [content, card, review, memory] = await Promise.all([
    tx.chapterContentVersion.findFirst({ where: { id: result.contentVersionId, tenantId: input.context.tenantId, novelId: input.novel.id, chapterId: chapter.id, sourceTaskId: input.task.id, status: PrismaVersionStatus.CURRENT } }),
    tx.chapterFeatureCard.findFirst({ where: { id: result.featureCardId, tenantId: input.context.tenantId, novelId: input.novel.id, chapterId: chapter.id, sourceTaskId: input.task.id, status: PrismaVersionStatus.CURRENT } }),
    tx.reviewReport.findFirst({ where: { id: result.reviewReportId, tenantId: input.context.tenantId, novelId: input.novel.id, objectType: 'chapter', objectId: chapter.id, objectVersionId: result.contentVersionId, sourceTaskId: input.task.id } }),
    tx.longTermMemory.findFirst({ where: { id: result.longTermMemoryId, tenantId: input.context.tenantId, novelId: input.novel.id, chapterId: chapter.id, sourceContentVersionId: result.contentVersionId, sourceTaskId: input.task.id, status: PrismaVersionStatus.CURRENT } })
  ]);
  if (!content || !card || !review || !memory) throw new BusinessError(ErrorCode.GateBlocked, '已保存章节配套资产不完整，不能续写。');
}

async function persistFailedBodyChapter(tx: Prisma.TransactionClient, input: BodyBatchGenerationInput, taskId: string, draft: BodyBatchGenerationInput['chapters'][number]): Promise<BodyBatchChapterResultDTO> {
  await tx.novelChapter.update({
    where: { id: draft.chapter.id, tenantId: input.context.tenantId },
    data: { mainStatus: 'pending', statusNote: '硬失败待处理', impactLevel: PrismaImpactLevel.MEDIUM, lastGenerationTaskId: taskId, updatedAt: input.now }
  });
  return bodyChapterResult(draft, 'failed', null, null, null, null);
}

async function persistOverlengthBodyCandidates(
  tx: Prisma.TransactionClient,
  input: BodyBatchGenerationInput,
  progress: BodyBatchProgress
): Promise<{ chapterResult: BodyBatchChapterResultDTO; candidateIds: string[] }> {
  const draft = input.overlengthDraft!;
  const tenantId = input.context.tenantId;
  if (progress.chapterResults.length !== draft.chapter.chapterNo - input.startChapterNo) {
    throw new BusinessError(ErrorCode.GateBlocked, '超长章节与已保存批次检查点不连续。');
  }
  const chapter = await tx.novelChapter.findFirst({
    where: { id: draft.chapter.id, tenantId, novelId: input.novel.id, chapterNo: draft.chapter.chapterNo, deletedAt: null }
  });
  if (!chapter || chapter.currentContentVersionId || chapter.wordTarget !== draft.chapter.wordTarget) {
    throw new BusinessError(ErrorCode.CandidateStale, '超长章节目标或正式正文已变化，不能保存旧候选。');
  }
  const existing = await tx.chapterContentVersion.findFirst({ where: { tenantId, novelId: input.novel.id, chapterId: chapter.id } });
  if (existing) throw new BusinessError(ErrorCode.GateBlocked, '本章已有候选或正式版本，不能重复保存超长原稿。');
  const originalLength = evaluateChapterLength(draft.originalContent, chapter.wordTarget);
  if (originalLength.status !== 'too_long') throw new BusinessError(ErrorCode.ValidationError, '超长原稿不符合恢复条件。');
  const original = await tx.chapterContentVersion.create({
    data: {
      tenantId, novelId: input.novel.id, chapterId: chapter.id, versionNo: 1,
      status: PrismaVersionStatus.CANDIDATE, staleLevel: PrismaStaleLevel.NONE,
      sourceType: 'ai_overlength_original', sourceTaskId: input.task.id,
      sourceVersionRefs: toJsonObject(input.sourceVersionRefs), rewriteReason: null,
      content: draft.originalContent, wordCount: originalLength.actual,
      summary: draft.originalSummary, reviewScore: null, createdBy: input.context.userId, createdAt: input.now,
      metadata: toJsonObject({ batchId: progress.batchId, chapterNo: chapter.chapterNo, title: chapter.title,
        lengthRecovery: 'original', lengthGate: originalLength, reviewRequired: true, riskLevel: RiskLevel.Medium })
    }
  });
  let revisionId: string | null = null;
  if (draft.revisedContent) {
    const revisedLength = evaluateChapterLength(draft.revisedContent, chapter.wordTarget);
    if (revisedLength.status !== 'pass') throw new BusinessError(ErrorCode.ValidationError, '精简候选未通过字数门禁。');
    const revision = await tx.chapterContentVersion.create({
      data: {
        tenantId, novelId: input.novel.id, chapterId: chapter.id, versionNo: 2,
        status: PrismaVersionStatus.CANDIDATE, staleLevel: PrismaStaleLevel.NONE,
        sourceType: 'ai_overlength_revision', sourceTaskId: input.task.id,
        sourceVersionRefs: toJsonObject(input.sourceVersionRefs), rewriteReason: '超长原稿实验精简',
        content: draft.revisedContent, wordCount: revisedLength.actual,
        summary: null, reviewScore: null, createdBy: input.context.userId, createdAt: input.now,
        metadata: toJsonObject({ batchId: progress.batchId, chapterNo: chapter.chapterNo, title: chapter.title,
          lengthRecovery: 'revision', revisionOfCandidateId: original.id, lengthGate: revisedLength,
          reviewRequired: true, riskLevel: RiskLevel.Medium })
      }
    });
    revisionId = revision.id;
  }
  await tx.novelChapter.update({
    where: { id: chapter.id, tenantId },
    data: { mainStatus: 'pending', statusNote: '原稿超长待处理', lastGenerationTaskId: input.task.id, updatedAt: input.now }
  });
  return { chapterResult: {
    chapterId: chapter.id, chapterNo: chapter.chapterNo, title: chapter.title,
    status: 'pending', statusText: '超长待处理', contentVersionId: original.id,
    featureCardId: null, reviewReportId: null, longTermMemoryId: null,
    score: null, riskLevel: RiskLevel.Medium, hardFailed: false, lengthGate: originalLength,
    statusNote: `原稿 ${originalLength.actual} 字，高于上限 ${originalLength.upperBound} 字。`,
    recommendedAction: '查看超长候选，复核后再继续'
  }, candidateIds: revisionId ? [original.id, revisionId] : [original.id] };
}

async function persistCompletedBodyChapter(tx: Prisma.TransactionClient, input: BodyBatchGenerationInput, taskId: string, batchId: string, draft: BodyBatchGenerationInput['chapters'][number]): Promise<BodyBatchChapterResultDTO> {
  const tenantId = input.context.tenantId;
  const chapterId = draft.chapter.id;
  const feature = draft.featureCard;
  const review = draft.review;
  const memoryDraft = draft.memory;
  const lastCard = await tx.chapterFeatureCard.findFirst({ where: { tenantId, chapterId }, orderBy: { versionNo: 'desc' }, select: { versionNo: true } });
  const contentVersion = await tx.chapterContentVersion.create({
    data: {
      tenantId, novelId: input.novel.id, chapterId, versionNo: 1,
      status: PrismaVersionStatus.CURRENT, staleLevel: PrismaStaleLevel.NONE,
      sourceType: 'ai', sourceTaskId: taskId, sourceVersionRefs: toJsonObject(input.sourceVersionRefs),
      rewriteReason: '批量正文生成章节正文', content: draft.content, wordCount: countWords(draft.content),
      summary: draft.summary, reviewScore: draft.scoring.totalScore, createdBy: input.context.userId, createdAt: input.now,
      metadata: toJsonObject({
        batchId,
        chapterNo: draft.chapter.chapterNo, title: draft.chapter.title, openingStrategy: draft.openingStrategy,
        openingHighlight: draft.openingHighlight, firstSentence: draft.firstSentence, first300Summary: draft.first300Summary,
        endingHook: draft.endingHook, riskLevel: draft.riskLevel, riskTags: draft.riskTags,
        aiRecommendedReason: draft.aiRecommendedReason, isAiRecommended: false, isSelected: true, scoring: draft.scoring
      })
    }
  });
  await tx.chapterFeatureCard.updateMany({
    where: { tenantId, novelId: input.novel.id, chapterId, status: PrismaVersionStatus.CURRENT },
    data: { status: PrismaVersionStatus.HISTORICAL }
  });
  const card = await tx.chapterFeatureCard.create({
    data: {
      tenantId, novelId: input.novel.id, chapterId, versionNo: (lastCard?.versionNo ?? 0) + 1,
      status: PrismaVersionStatus.CURRENT, staleLevel: PrismaStaleLevel.NONE,
      oneLineSummary: feature.oneLineSummary, coreTask: feature.coreTask, mainConflict: feature.mainConflict,
      appealPoint: feature.appealPoint, emotionKeywordsJson: toJsonObject(feature.emotionKeywords),
      characterChangesJson: toJsonObject(feature.characterChanges), relationshipChangesJson: toJsonObject(feature.relationshipChanges),
      keyInformationJson: toJsonObject(feature.keyInformation), foreshadowingOperation: feature.foreshadowingOperation,
      endingHook: feature.endingHook, factsCannotChangeJson: toJsonObject(feature.factsCannotChange),
      featuresToStrengthenJson: toJsonObject(feature.featuresToStrengthen), sourceTaskId: taskId, createdAt: input.now,
      metadata: toJsonObject({ ...toRecord(feature.metadata), sourceContentVersionId: contentVersion.id })
    }
  });
  const report = await tx.reviewReport.create({
    data: {
      tenantId, novelId: input.novel.id, objectType: 'chapter', objectId: chapterId, objectVersionId: contentVersion.id,
      reviewLevel: review.reviewLevel, totalScore: review.totalScore, subScoresJson: toJsonObject(review.subScores),
      rating: review.rating, summary: review.summary, strengthsJson: toJsonObject(review.strengths),
      problemsJson: toJsonObject(review.problems), suggestionsJson: toJsonObject(review.suggestions),
      issueCardsJson: toJsonObject(review.issueCards), actionOptionsJson: toJsonObject(review.actionOptions),
      recommendedAction: review.recommendedAction, allowNextStep: review.allowNextStep,
      blockingIssueCount: review.blockingIssueCount, resolvedStatus: review.resolvedStatus,
      promptTemplateVersionId: review.promptTemplateVersionId,
      policyProfileVersionId: review.policyProfileVersionId ?? input.novel.policyProfileVersionId,
      sourceTaskId: taskId, createdAt: input.now, metadata: toJsonObject(review.metadata)
    }
  });
  await tx.longTermMemory.updateMany({
    where: { tenantId, novelId: input.novel.id, chapterId, status: PrismaVersionStatus.CURRENT },
    data: { status: PrismaVersionStatus.HISTORICAL }
  });
  const memory = await tx.longTermMemory.create({
    data: {
      tenantId, novelId: input.novel.id, chapterId, sourceContentVersionId: contentVersion.id,
      previousSummary: memoryDraft.previousSummary, characterStatesJson: toJsonObject(memoryDraft.characterStates),
      relationshipStatesJson: toJsonObject(memoryDraft.relationshipStates), locationsJson: toJsonObject(memoryDraft.locations),
      organizationsJson: toJsonObject(memoryDraft.organizations), itemsJson: toJsonObject(memoryDraft.items),
      plantedForeshadowingJson: toJsonObject(memoryDraft.plantedForeshadowing),
      resolvedForeshadowingJson: toJsonObject(memoryDraft.resolvedForeshadowing),
      unresolvedConflictsJson: toJsonObject(memoryDraft.unresolvedConflicts), newSettingsJson: toJsonObject(memoryDraft.newSettings),
      factsCannotContradictJson: toJsonObject(memoryDraft.factsCannotContradict), status: PrismaVersionStatus.CURRENT,
      staleLevel: PrismaStaleLevel.NONE, sourceTaskId: taskId, createdAt: input.now, metadata: toJsonObject(memoryDraft.metadata)
    }
  });
  await tx.novelChapter.update({
    where: { id: chapterId, tenantId },
    data: {
      currentContentVersionId: contentVersion.id, currentFeatureCardVersionId: card.id, currentReviewReportId: report.id,
      wordCount: contentVersion.wordCount, mainStatus: 'completed',
      statusNote: draft.scoring.totalScore < 70 ? '普通风险，已进入批次总结。' : '正文已生成并完成单章审稿。',
      impactLevel: draft.scoring.totalScore < 70 ? PrismaImpactLevel.MINOR : PrismaImpactLevel.NONE,
      lastGenerationTaskId: taskId, updatedAt: input.now
    }
  });
  return bodyChapterResult(draft, 'completed', contentVersion.id, card.id, report.id, memory.id);
}

function bodyChapterResult(
  draft: BodyBatchGenerationInput['chapters'][number],
  status: 'completed' | 'failed',
  contentVersionId: string | null,
  featureCardId: string | null,
  reviewReportId: string | null,
  longTermMemoryId: string | null
): BodyBatchChapterResultDTO {
  return {
    chapterId: draft.chapter.id, chapterNo: draft.chapter.chapterNo, title: draft.chapter.title,
    status, statusText: status === 'completed' ? '已生成' : '硬失败',
    contentVersionId, featureCardId, reviewReportId, longTermMemoryId,
    score: draft.scoring.totalScore, riskLevel: draft.riskLevel, hardFailed: draft.hardFailed,
    lengthGate: draft.lengthGate,
    statusNote: status === 'failed' ? '硬失败待处理' : draft.scoring.totalScore < 70 ? '普通风险，已记录。' : null,
    recommendedAction: status === 'failed' ? '进入章节详情处理' : draft.scoring.totalScore < 70 ? '批次完成后可优化本章' : '继续下一章'
  };
}

function mapStoredBodyBatch(task: { id: string; tenantId: string; novelId: string | null; resultObjectId: string | null; metadata: unknown }, tenantId: string, novelId: string): BodyBatchRecord {
  if (task.tenantId !== tenantId || task.novelId !== novelId) {
    throw new BusinessError(ErrorCode.GateBlocked, '正文批次任务归属不一致。');
  }
  const raw = toRecord(toRecord(task.metadata).batch);
  const summary = toRecord(raw.summary);
  if (typeof raw.id !== 'string' || raw.id !== task.resultObjectId || raw.taskId !== task.id ||
      raw.tenantId !== tenantId || raw.novelId !== novelId || !Array.isArray(raw.chapterResults) ||
      typeof summary.id !== 'string' || !Array.isArray(summary.chapterResults)) {
    throw new BusinessError(ErrorCode.GateBlocked, '正文批次记录不完整，不能继续生成。');
  }
  return {
    ...raw,
    createdAt: new Date(String(raw.createdAt)),
    summary: { ...summary, createdAt: new Date(String(summary.createdAt)) }
  } as BodyBatchRecord;
}

function createId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

function mapNovel(novel: {
  id: string;
  tenantId: string;
  ownerId: string;
  title: string;
  channel: string;
  genresJson: unknown;
  lifecycleStatus: string;
  creationStage: string;
  stageStatus: string;
  currentDirectionVersionId: string | null;
  currentSettingVersionId: string | null;
  currentOutlineVersionId: string | null;
  currentStageOutlineVersionId: string | null;
  currentChapterPlanVersionId: string | null;
  hotspotReportId: string | null;
  policyProfileVersionId: string | null;
  chapterLimit: number;
  chapterWordMin: number;
  chapterWordMax: number;
  summary: string | null;
  videoReferenceStatus: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): NovelRecord {
  return {
    id: novel.id,
    tenantId: novel.tenantId,
    ownerId: novel.ownerId,
    title: novel.title,
    channel: novel.channel,
    genres: toStringArray(novel.genresJson),
    lifecycleStatus: fromPrismaEnum<NovelLifecycleStatus>(novel.lifecycleStatus),
    creationStage: fromPrismaEnum<NovelCreationStage>(novel.creationStage),
    stageStatus: fromPrismaEnum<StageStatus>(novel.stageStatus),
    currentDirectionVersionId: novel.currentDirectionVersionId,
    currentSettingVersionId: novel.currentSettingVersionId,
    currentOutlineVersionId: novel.currentOutlineVersionId,
    currentStageOutlineVersionId: novel.currentStageOutlineVersionId,
    currentChapterPlanVersionId: novel.currentChapterPlanVersionId,
    hotspotReportId: novel.hotspotReportId,
    policyProfileVersionId: novel.policyProfileVersionId,
    chapterLimit: novel.chapterLimit,
    chapterWordMin: novel.chapterWordMin,
    chapterWordMax: novel.chapterWordMax,
    summary: novel.summary,
    videoReferenceStatus: novel.videoReferenceStatus,
    createdBy: novel.createdBy,
    updatedBy: novel.updatedBy,
    createdAt: novel.createdAt,
    updatedAt: novel.updatedAt,
    deletedAt: novel.deletedAt
  };
}

function mapPreferences(preferences: {
  id: string;
  tenantId: string;
  novelId: string;
  creationSourceType: string;
  hotspotReportId: string | null;
  hotspotOpportunityId: string | null;
  hotspotTitle: string | null;
  hotspotOpportunityTitle: string | null;
  appealPointsJson: unknown;
  genresJson: unknown;
  openingState: string | null;
  blockedElementsJson: unknown;
  targetAudience: string | null;
  chapterLimit: number;
  chapterWordMin: number;
  chapterWordMax: number;
  stageCount: number | null;
  customIdea: string | null;
  style: string | null;
  videoAdaptationPreference: string | null;
  createdBy: string | null;
  createdAt: Date;
}): NovelPreferencesRecord {
  return {
    id: preferences.id,
    tenantId: preferences.tenantId,
    novelId: preferences.novelId,
    creationSourceType: fromPrismaCreationSourceType(preferences.creationSourceType),
    hotspotReportId: preferences.hotspotReportId,
    hotspotOpportunityId: preferences.hotspotOpportunityId,
    hotspotTitle: preferences.hotspotTitle,
    hotspotOpportunityTitle: preferences.hotspotOpportunityTitle,
    appealPoints: toStringArray(preferences.appealPointsJson),
    genres: toStringArray(preferences.genresJson),
    openingState: preferences.openingState,
    blockedElements: toStringArray(preferences.blockedElementsJson),
    targetAudience: preferences.targetAudience,
    chapterLimit: preferences.chapterLimit,
    chapterWordMin: preferences.chapterWordMin,
    chapterWordMax: preferences.chapterWordMax,
    stageCount: preferences.stageCount,
    customIdea: preferences.customIdea,
    style: preferences.style,
    videoAdaptationPreference: preferences.videoAdaptationPreference,
    createdBy: preferences.createdBy,
    createdAt: preferences.createdAt
  };
}

function toPrismaCreationSourceType(value: string): PrismaNovelCreationSourceType {
  switch (value) {
    case 'hotspot_reference':
      return PrismaNovelCreationSourceType.HOTSPOT_REFERENCE;
    case 'manual_idea':
      return PrismaNovelCreationSourceType.MANUAL_IDEA;
    case 'legacy_unknown':
      return PrismaNovelCreationSourceType.LEGACY_UNKNOWN;
    case 'system_recommendation':
    default:
      return PrismaNovelCreationSourceType.SYSTEM_RECOMMENDATION;
  }
}

function fromPrismaCreationSourceType(value: string) {
  switch (value) {
    case 'HOTSPOT_REFERENCE':
    case 'hotspot_reference':
      return 'hotspot_reference';
    case 'MANUAL_IDEA':
    case 'manual_idea':
      return 'manual_idea';
    case 'SYSTEM_RECOMMENDATION':
    case 'system_recommendation':
      return 'system_recommendation';
    case 'LEGACY_UNKNOWN':
    case 'legacy_unknown':
    default:
      return 'legacy_unknown';
  }
}

function mapOperationLog(operationLog: {
  id: string;
  tenantId: string;
  userId: string | null;
  novelId: string | null;
  action: string;
  objectType: string | null;
  objectId: string | null;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  reason: string | null;
  impactSummary: string | null;
  sourceTaskId: string | null;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}): OperationLogRecord {
  return operationLog;
}

function mapCreativeVersion(version: {
  id: string;
  tenantId: string;
  novelId: string;
  objectType: string;
  objectId: string;
  versionNo: number;
  status: string;
  staleLevel: string;
  sourceType: string | null;
  sourceTaskId: string | null;
  sourceVersionRefs: unknown;
  changeReason: string | null;
  contentJson: unknown;
  summary: string | null;
  score: unknown;
  riskLevel: string;
  decisionRecordId: string | null;
  createdBy: string | null;
  createdAt: Date;
  metadata: unknown;
}): CreativeVersionRecord {
  return {
    id: version.id,
    tenantId: version.tenantId,
    novelId: version.novelId,
    objectType: version.objectType,
    objectId: version.objectId,
    versionNo: version.versionNo,
    status: fromPrismaEnum<VersionStatus>(version.status),
    staleLevel: fromPrismaEnum<StaleLevel>(version.staleLevel),
    sourceType: version.sourceType,
    sourceTaskId: version.sourceTaskId,
    sourceVersionRefs: version.sourceVersionRefs,
    changeReason: version.changeReason,
    content: version.contentJson as CreativeVersionRecord['content'],
    summary: version.summary,
    score: version.score === null ? null : Number(version.score),
    riskLevel: fromPrismaEnum<RiskLevel>(version.riskLevel),
    decisionRecordId: version.decisionRecordId,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
    metadata: version.metadata
  };
}

async function transitionClaimedTask(
  tx: Prisma.TransactionClient,
  input: {
    taskId: string;
    tenantId: string;
    data: Prisma.GenerationTaskUpdateManyMutationInput;
  }
) {
  const transition = await tx.generationTask.updateMany({
    where: {
      id: input.taskId,
      tenantId: input.tenantId,
      status: PrismaTaskStatus.PROCESSING
    },
    data: input.data
  });
  if (transition.count !== 1) {
    const current = await tx.generationTask.findFirst({
      where: { id: input.taskId, tenantId: input.tenantId }
    });
    throw new BusinessError(ErrorCode.GateBlocked, '生成任务已不在可写入状态，模型结果已丢弃。', {
      taskId: input.taskId,
      status: current ? fromPrismaEnum<TaskStatus>(current.status) : 'not_found'
    });
  }
  return tx.generationTask.findFirstOrThrow({
    where: { id: input.taskId, tenantId: input.tenantId }
  });
}

async function transitionCancellableTask(
  tx: Prisma.TransactionClient,
  input: {
    taskId: string;
    tenantId: string;
    data: Prisma.GenerationTaskUpdateManyMutationInput;
  }
) {
  const transition = await tx.generationTask.updateMany({
    where: {
      id: input.taskId,
      tenantId: input.tenantId,
      status: { in: [PrismaTaskStatus.QUEUED, PrismaTaskStatus.PROCESSING, PrismaTaskStatus.WAITING_CONFIRMATION] }
    },
    data: input.data
  });
  if (transition.count !== 1) {
    throw new BusinessError(ErrorCode.TaskNotRetryable, '当前任务不能取消', { taskId: input.taskId });
  }
  return tx.generationTask.findFirstOrThrow({
    where: { id: input.taskId, tenantId: input.tenantId }
  });
}

function isPrismaUniqueConstraintError(error: unknown): error is { code: 'P2002' } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function leaseFailureData(failure: LeasedTaskFailure, now: Date): Prisma.GenerationTaskUpdateManyMutationInput {
  return {
    status: PrismaTaskStatus.FAILED,
    statusNote: failure.statusNote,
    currentStep: 'failed',
    failureCategory: failure.failureCategory,
    errorCode: failure.errorCode,
    errorMessage: failure.errorMessage,
    activeClaimKey: null,
    leaseOwnerId: null,
    leaseToken: null,
    leaseExpiresAt: null,
    finishedAt: now,
    updatedAt: now
  };
}

function mapGenerationTask(task: {
  id: string;
  tenantId: string;
  novelId: string | null;
  taskType: string;
  objectType: string | null;
  objectId: string | null;
  status: string;
  statusNote: string | null;
  progress: number;
  currentStep: string | null;
  triggerSource: string | null;
  sourceVersionRefs: unknown;
  conflictScope: string | null;
  conflictKey: string | null;
  idempotencyToken: string | null;
  requestHash: string | null;
  activeClaimKey: string | null;
  policyProfileVersionId: string | null;
  modelRoutingVersion: string | null;
  inputSummary: string | null;
  outputSummary: string | null;
  resultVersionId: string | null;
  resultVersionIdsJson: unknown;
  retryOfTaskId: string | null;
  failureCategory: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  resultObjectType: string | null;
  resultObjectId: string | null;
  userAcceptedResult: boolean;
  cancelRequestedAt: Date | null;
  cancelReason: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: unknown;
  leaseOwnerId: string | null;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  lastHeartbeatAt: Date | null;
  retryCount: number;
  maxRetries: number;
  executionEnvelopeJson: unknown;
  providerAttemptId: string | null;
  providerAttemptPhase: string | null;
  providerDispatchedAt: Date | null;
  resultReceiptHash: string | null;
  rootTaskId: string;
  providerCallBudgetMax: number;
  providerCallBudgetUsed: number;
  durationDeadlineAt: Date;
  costBudgetMicrosMax: bigint;
  costBudgetMicrosUsed: bigint;
}): GenerationTaskRecord {
  return {
    id: task.id,
    tenantId: task.tenantId,
    novelId: task.novelId,
    taskType: task.taskType,
    objectType: task.objectType,
    objectId: task.objectId,
    status: fromPrismaEnum<TaskStatus>(task.status),
    statusNote: task.statusNote,
    progress: task.progress,
    currentStep: task.currentStep,
    triggerSource: task.triggerSource,
    sourceVersionRefs: task.sourceVersionRefs,
    conflictScope: task.conflictScope,
    conflictKey: task.conflictKey,
    idempotencyToken: task.idempotencyToken,
    requestHash: task.requestHash,
    activeClaimKey: task.activeClaimKey,
    policyProfileVersionId: task.policyProfileVersionId,
    modelRoutingVersion: task.modelRoutingVersion,
    inputSummary: task.inputSummary,
    outputSummary: task.outputSummary,
    resultVersionIds: Array.isArray(task.resultVersionIdsJson) ? task.resultVersionIdsJson.filter((value): value is string => typeof value === 'string') : task.resultVersionId ? [task.resultVersionId] : [],
    retryOfTaskId: task.retryOfTaskId,
    failureCategory: task.failureCategory,
    errorCode: task.errorCode,
    errorMessage: task.errorMessage,
    resultObjectType: task.resultObjectType,
    resultObjectId: task.resultObjectId,
    userAcceptedResult: task.userAcceptedResult,
    cancelRequestedAt: task.cancelRequestedAt,
    cancelReason: task.cancelReason,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    createdBy: task.createdBy,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    metadata: task.metadata,
    leaseOwnerId: task.leaseOwnerId,
    leaseToken: task.leaseToken,
    leaseExpiresAt: task.leaseExpiresAt,
    lastHeartbeatAt: task.lastHeartbeatAt,
    retryCount: task.retryCount,
    maxRetries: task.maxRetries,
    executionEnvelopeJson: task.executionEnvelopeJson as ExecutionEnvelope | null,
    providerAttemptId: task.providerAttemptId,
    providerAttemptPhase: task.providerAttemptPhase ? fromPrismaEnum(task.providerAttemptPhase) : null,
    providerDispatchedAt: task.providerDispatchedAt,
    resultReceiptHash: task.resultReceiptHash,
    rootTaskId: task.rootTaskId,
    providerCallBudgetMax: task.providerCallBudgetMax,
    providerCallBudgetUsed: task.providerCallBudgetUsed,
    durationDeadlineAt: task.durationDeadlineAt,
    costBudgetMicrosMax: task.costBudgetMicrosMax,
    costBudgetMicrosUsed: task.costBudgetMicrosUsed
  };
}

function mapGenerationTaskEvent(event: {
  id: string;
  tenantId: string;
  taskId: string;
  status: string;
  eventType: string;
  message: string | null;
  progress: number | null;
  payloadJson: unknown;
  createdAt: Date;
}): GenerationTaskEventRecord {
  return {
    id: event.id,
    tenantId: event.tenantId,
    taskId: event.taskId,
    status: fromPrismaEnum<TaskStatus>(event.status),
    eventType: event.eventType,
    message: event.message,
    progress: event.progress,
    payload: event.payloadJson,
    createdAt: event.createdAt
  };
}

function mapAssetDecisionRecord(record: {
  id: string;
  tenantId: string;
  novelId: string;
  actionType: string;
  objectType: string;
  objectId: string;
  candidateVersionId: string | null;
  currentVersionIdBefore: string | null;
  currentVersionIdAfter: string | null;
  decisionReason: string | null;
  isForced: boolean;
  riskSummary: string | null;
  impactSummary: string | null;
  pageVersionSnapshot: unknown;
  sourceTaskId: string | null;
  createdBy: string | null;
  createdAt: Date;
  metadata?: unknown;
}): AssetDecisionRecord {
  return record;
}

function mapNovelChapter(chapter: {
  id: string;
  tenantId: string;
  novelId: string;
  chapterNo: number;
  stageIndex: number | null;
  title: string;
  wordTarget: number | null;
  wordCount: number;
  mainStatus: string;
  statusNote: string | null;
  impactLevel: string;
  currentFeatureCardVersionId: string | null;
  currentContentVersionId: string | null;
  currentReviewReportId: string | null;
  lastGenerationTaskId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  metadata?: unknown;
}): NovelChapterRecord {
  return {
    id: chapter.id,
    tenantId: chapter.tenantId,
    novelId: chapter.novelId,
    chapterNo: chapter.chapterNo,
    stageIndex: chapter.stageIndex,
    title: chapter.title,
    wordTarget: chapter.wordTarget,
    wordCount: chapter.wordCount,
    mainStatus: chapter.mainStatus,
    statusNote: chapter.statusNote,
    impactLevel: fromPrismaEnum<string>(chapter.impactLevel),
    currentFeatureCardVersionId: chapter.currentFeatureCardVersionId,
    currentContentVersionId: chapter.currentContentVersionId,
    currentReviewReportId: chapter.currentReviewReportId,
    lastGenerationTaskId: chapter.lastGenerationTaskId,
    createdAt: chapter.createdAt,
    updatedAt: chapter.updatedAt,
    deletedAt: chapter.deletedAt,
    metadata: chapter.metadata ?? {}
  };
}

function mapChapterContentVersion(version: {
  id: string;
  tenantId: string;
  novelId: string;
  chapterId: string;
  versionNo: number;
  status: string;
  staleLevel: string;
  sourceType: string | null;
  sourceTaskId: string | null;
  sourceVersionRefs: unknown;
  rewriteReason: string | null;
  content: string;
  wordCount: number;
  summary: string | null;
  reviewScore: unknown;
  decisionRecordId: string | null;
  createdBy: string | null;
  createdAt: Date;
  metadata: unknown;
}): ChapterContentVersionRecord {
  return {
    id: version.id,
    tenantId: version.tenantId,
    novelId: version.novelId,
    chapterId: version.chapterId,
    versionNo: version.versionNo,
    status: fromPrismaEnum<VersionStatus>(version.status),
    staleLevel: fromPrismaEnum<StaleLevel>(version.staleLevel),
    sourceType: version.sourceType,
    sourceTaskId: version.sourceTaskId,
    sourceVersionRefs: version.sourceVersionRefs,
    rewriteReason: version.rewriteReason,
    content: version.content,
    wordCount: version.wordCount,
    summary: version.summary,
    reviewScore: version.reviewScore === null ? null : Number(version.reviewScore),
    decisionRecordId: version.decisionRecordId,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
    metadata: version.metadata
  };
}

function mapChapterFeatureCard(card: {
  id: string;
  tenantId: string;
  novelId: string;
  chapterId: string;
  versionNo: number;
  status: string;
  staleLevel: string;
  oneLineSummary: string | null;
  coreTask: string | null;
  mainConflict: string | null;
  appealPoint: string | null;
  emotionKeywordsJson: unknown;
  characterChangesJson: unknown;
  relationshipChangesJson: unknown;
  keyInformationJson: unknown;
  foreshadowingOperation: string | null;
  endingHook: string | null;
  factsCannotChangeJson: unknown;
  featuresToStrengthenJson: unknown;
  sourceTaskId: string | null;
  decisionRecordId: string | null;
  createdAt: Date;
  metadata: unknown;
}): ChapterFeatureCardRecord {
  return {
    id: card.id,
    tenantId: card.tenantId,
    novelId: card.novelId,
    chapterId: card.chapterId,
    versionNo: card.versionNo,
    status: fromPrismaEnum<VersionStatus>(card.status),
    staleLevel: fromPrismaEnum<StaleLevel>(card.staleLevel),
    oneLineSummary: card.oneLineSummary,
    coreTask: card.coreTask,
    mainConflict: card.mainConflict,
    appealPoint: card.appealPoint,
    emotionKeywords: toStringArray(card.emotionKeywordsJson),
    characterChanges: toStringArray(card.characterChangesJson),
    relationshipChanges: toStringArray(card.relationshipChangesJson),
    keyInformation: toStringArray(card.keyInformationJson),
    foreshadowingOperation: card.foreshadowingOperation,
    endingHook: card.endingHook,
    factsCannotChange: toStringArray(card.factsCannotChangeJson),
    featuresToStrengthen: toStringArray(card.featuresToStrengthenJson),
    sourceTaskId: card.sourceTaskId,
    decisionRecordId: card.decisionRecordId,
    createdAt: card.createdAt,
    metadata: card.metadata
  };
}

function mapReviewReport(report: {
  id: string;
  tenantId: string;
  novelId: string;
  objectType: string;
  objectId: string;
  objectVersionId: string | null;
  reviewLevel: string;
  totalScore: unknown;
  subScoresJson: unknown;
  rating: string | null;
  summary: string | null;
  strengthsJson: unknown;
  problemsJson: unknown;
  suggestionsJson: unknown;
  issueCardsJson: unknown;
  actionOptionsJson: unknown;
  recommendedAction: string | null;
  allowNextStep: boolean;
  blockingIssueCount: number;
  resolvedStatus: string | null;
  promptTemplateVersionId: string | null;
  policyProfileVersionId: string | null;
  sourceTaskId: string | null;
  createdAt: Date;
  metadata: unknown;
}): ReviewReportRecord {
  return {
    id: report.id,
    tenantId: report.tenantId,
    novelId: report.novelId,
    objectType: report.objectType,
    objectId: report.objectId,
    objectVersionId: report.objectVersionId,
    reviewLevel: report.reviewLevel,
    totalScore: report.totalScore === null ? null : Number(report.totalScore),
    subScores: report.subScoresJson,
    rating: report.rating,
    summary: report.summary,
    strengths: toStringArray(report.strengthsJson),
    problems: toStringArray(report.problemsJson),
    suggestions: toStringArray(report.suggestionsJson),
    issueCards: report.issueCardsJson,
    actionOptions: report.actionOptionsJson,
    recommendedAction: report.recommendedAction,
    allowNextStep: report.allowNextStep,
    blockingIssueCount: report.blockingIssueCount,
    resolvedStatus: report.resolvedStatus,
    promptTemplateVersionId: report.promptTemplateVersionId,
    policyProfileVersionId: report.policyProfileVersionId,
    sourceTaskId: report.sourceTaskId,
    createdAt: report.createdAt,
    metadata: report.metadata
  };
}

function mapFullReviewGate(gate: {
  id: string;
  tenantId: string;
  novelId: string;
  reviewReportId: string;
  gateResult: string;
  allowCompletion: boolean;
  allowVideoReady: boolean;
  blockingIssueCount: number;
  warningIssueCount: number;
  isStale: boolean;
  staleReason: string | null;
  policyProfileVersionId: string | null;
  createdAt: Date;
  metadata: unknown;
}): FullReviewGateRecord {
  const metadata = toRecord(gate.metadata);
  const updatedAt = typeof metadata.updatedAt === 'string' ? new Date(metadata.updatedAt) : gate.createdAt;
  return {
    id: gate.id, tenantId: gate.tenantId, novelId: gate.novelId,
    reviewReportId: gate.reviewReportId, gateResult: gate.gateResult as FullReviewGateRecord['gateResult'],
    allowCompletion: gate.allowCompletion, allowVideoReady: gate.allowVideoReady,
    blockingIssueCount: gate.blockingIssueCount, warningIssueCount: gate.warningIssueCount,
    forcePassAllowed: metadata.forcePassAllowed === true,
    forcePassReason: typeof metadata.forcePassReason === 'string' ? metadata.forcePassReason : null,
    isStale: gate.isStale, staleReason: gate.staleReason,
    sourceVersionRefs: metadata.sourceVersionRefs ?? null,
    policyProfileVersionId: gate.policyProfileVersionId, createdAt: gate.createdAt,
    updatedAt: Number.isNaN(updatedAt.getTime()) ? gate.createdAt : updatedAt,
    metadata: gate.metadata
  };
}

function mapTrialRun(run: {
  id: string;
  tenantId: string;
  novelId: string;
  chapterPlanVersionId: string | null;
  trialChapterCount: number;
  status: string;
  totalScore: unknown;
  trialResult: string | null;
  reviewReportId: string | null;
  policyProfileVersionId: string | null;
  sourceTaskId: string | null;
  confirmedAt: Date | null;
  confirmedBy: string | null;
  forceReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: unknown;
}): TrialRunRecord {
  return {
    id: run.id,
    tenantId: run.tenantId,
    novelId: run.novelId,
    chapterPlanVersionId: run.chapterPlanVersionId,
    trialChapterCount: run.trialChapterCount,
    status: run.status,
    totalScore: run.totalScore === null ? null : Number(run.totalScore),
    trialResult: run.trialResult,
    reviewReportId: run.reviewReportId,
    policyProfileVersionId: run.policyProfileVersionId,
    sourceTaskId: run.sourceTaskId,
    confirmedAt: run.confirmedAt,
    confirmedBy: run.confirmedBy,
    forceReason: run.forceReason,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    metadata: run.metadata
  };
}

function mapTrialChapterResult(result: {
  id: string;
  tenantId: string;
  trialRunId: string;
  chapterId: string;
  contentVersionId: string | null;
  featureCardVersionId: string | null;
  reviewReportId: string | null;
  score: unknown;
  status: string;
  createdAt: Date;
  metadata: unknown;
}): TrialChapterResultRecord {
  return {
    id: result.id,
    tenantId: result.tenantId,
    trialRunId: result.trialRunId,
    chapterId: result.chapterId,
    contentVersionId: result.contentVersionId,
    featureCardVersionId: result.featureCardVersionId,
    reviewReportId: result.reviewReportId,
    score: result.score === null ? null : Number(result.score),
    status: result.status,
    createdAt: result.createdAt,
    metadata: result.metadata
  };
}

function createDirectionTaskData(options: {
  input: DirectionCreationInput | DirectionRevisionInput;
  taskType: string;
  status: keyof typeof PrismaTaskStatus;
  currentStep: string;
  now: Date;
}) {
  return {
    tenantId: options.input.context.tenantId,
    novelId: options.input.novel.id,
    taskType: options.taskType,
    objectType: 'direction',
    objectId: 'direction',
    status: options.status,
    statusNote: '模型服务已生成结构化方向候选',
    progress: 100,
    currentStep: options.currentStep,
    triggerSource: 'manual',
    sourceVersionRefs: getDirectionTaskSourceRefs(options.input),
    conflictScope: 'novel_direction',
    conflictKey: options.input.novel.id,
    policyProfileVersionId: options.input.novel.policyProfileVersionId,
    inputSummary: '基于小说创建偏好生成方向候选',
    outputSummary: null,
    userAcceptedResult: false,
    startedAt: options.now,
    createdBy: options.input.context.userId,
    createdAt: options.now,
    updatedAt: options.now,
    metadata: {
      requestId: options.input.context.requestId
    }
  };
}

function createStructureTaskData(options: {
  input: StructureCreationInput;
  taskType: string;
  status: keyof typeof PrismaTaskStatus;
  currentStep: string;
  now: Date;
}) {
  return {
    tenantId: options.input.context.tenantId,
    novelId: options.input.novel.id,
    taskType: options.taskType,
    objectType: options.input.asset.objectType,
    objectId: options.input.asset.objectType,
    status: options.status,
    statusNote: `模型服务已生成 ${options.input.asset.objectType} 候选`,
    progress: 100,
    currentStep: options.currentStep,
    triggerSource: 'manual',
    sourceVersionRefs: toJsonObject(options.input.sourceVersionRefs),
    conflictScope: `novel_${options.input.asset.objectType}`,
    conflictKey: options.input.novel.id,
    policyProfileVersionId: options.input.novel.policyProfileVersionId,
    inputSummary: `基于上游正式资产生成 ${options.input.asset.objectType} 候选`,
    outputSummary: null,
    userAcceptedResult: false,
    startedAt: options.now,
    createdBy: options.input.context.userId,
    createdAt: options.now,
    updatedAt: options.now,
    metadata: {
      requestId: options.input.context.requestId
    }
  };
}

function createStructureGenerationTaskData(options: {
  input: StructureGenerationTaskCreationInput;
  status: keyof typeof PrismaTaskStatus;
  currentStep: string;
  now: Date;
}) {
  return {
    tenantId: options.input.context.tenantId,
    novelId: options.input.novel.id,
    taskType: options.input.taskType,
    objectType: options.input.objectType,
    objectId: options.input.objectType,
    status: options.status,
    statusNote: '正在调用模型生成内容，可能需要 2-5 分钟；若等待过久，请刷新查看任务状态。',
    progress: 0,
    currentStep: options.currentStep,
    triggerSource: 'manual',
    sourceVersionRefs: toJsonObject(options.input.sourceVersionRefs),
    conflictScope: `novel_${options.input.objectType}`,
    conflictKey: options.input.novel.id,
    policyProfileVersionId: options.input.novel.policyProfileVersionId,
    inputSummary: `基于上游正式资产生成 ${options.input.objectType} 候选`,
    outputSummary: null,
    userAcceptedResult: false,
    startedAt: options.now,
    createdBy: options.input.context.userId,
    createdAt: options.now,
    updatedAt: options.now,
    metadata: {
      requestId: options.input.context.requestId,
      changeReason: options.input.changeReason
    }
  };
}

function createTrialTaskData(options: {
  input: TrialCandidateCreationInput | TrialFollowupTaskCreationInput | TrialFollowupGenerationInput;
  taskType: string;
  trialRunId: string;
  currentStep: string;
  sourceVersionRefs: unknown;
}) {
  return {
    tenantId: options.input.context.tenantId,
    novelId: options.input.novel.id,
    taskType: options.taskType,
    objectType: 'trial_run',
    objectId: options.trialRunId,
    status: PrismaTaskStatus.WAITING_CONFIRMATION,
    statusNote: '模型服务已生成试写结果，等待用户确认。',
    progress: 100,
    currentStep: options.currentStep,
    triggerSource: 'manual',
    sourceVersionRefs: toJsonObject(options.sourceVersionRefs),
    conflictScope: 'novel_trial',
    conflictKey: options.input.novel.id,
    policyProfileVersionId: options.input.novel.policyProfileVersionId,
    inputSummary: '根据已确认章节目录和上游资产生成试写候选。',
    outputSummary: null,
    userAcceptedResult: false,
    startedAt: options.input.now,
    createdBy: options.input.context.userId,
    createdAt: options.input.now,
    updatedAt: options.input.now,
    metadata: {
      requestId: options.input.context.requestId,
      trialRunId: options.trialRunId
    }
  };
}

function createTrialFollowupSourceVersionRefs(novel: NovelRecord, selectedChapterOneCandidateId: string) {
  return {
    currentDirectionVersionId: novel.currentDirectionVersionId,
    currentSettingVersionId: novel.currentSettingVersionId,
    currentOutlineVersionId: novel.currentOutlineVersionId,
    currentStageOutlineVersionId: novel.currentStageOutlineVersionId,
    currentChapterPlanVersionId: novel.currentChapterPlanVersionId,
    selectedChapterOneCandidateId
  };
}

async function persistLeasedTrialFollowupAssets(
  tx: Prisma.TransactionClient,
  input: TrialFollowupGenerationInput,
  sourceTaskId: string,
  sourceVersionRefs: unknown,
  modelRoutingVersion: string | null
): Promise<string[]> {
  const { context, novel, trialRun, selectedCandidate, chapters, review, task, now } = input;
  const sourceTransition = await tx.generationTask.updateMany({ where: {
    tenantId: context.tenantId, id: sourceTaskId, status: PrismaTaskStatus.WAITING_CONFIRMATION
  }, data: { status: PrismaTaskStatus.COMPLETED, statusNote: '用户已选择第1章候选',
    currentStep: '第1章候选已选择，继续试写', userAcceptedResult: true,
    finishedAt: now, updatedAt: now } });
  if (sourceTransition.count !== 1) throw new Error('Trial followup lost its source task transition.');
  const completedSourceTask = await tx.generationTask.findFirstOrThrow({ where: {
    tenantId: context.tenantId, id: sourceTaskId
  } });
  await createTaskEvent(tx, { task: completedSourceTask, eventType: 'task_completed',
    message: '用户已选择第1章候选，任务完成。', progress: 100,
    requestId: context.requestId, createdAt: now });
  const selectedTransition = await tx.chapterContentVersion.updateMany({ where: {
    tenantId: context.tenantId, novelId: novel.id, id: selectedCandidate.id,
    status: PrismaVersionStatus.CANDIDATE
  }, data: { metadata: toJsonObject({ ...authorityRecord(selectedCandidate.metadata),
      trialStatus: 'selected_for_trial', isSelected: true, followupStatus: 'completed' }) } });
  if (selectedTransition.count !== 1) throw new Error('Trial followup lost its selected candidate.');
  await tx.chapterContentVersion.updateMany({ where: {
    tenantId: context.tenantId, novelId: novel.id, chapterId: selectedCandidate.chapterId,
    id: { not: selectedCandidate.id }, status: PrismaVersionStatus.CANDIDATE
  }, data: { status: PrismaVersionStatus.HISTORICAL } });
  const sourceType = modelRoutingVersion?.startsWith('deepseek:') ? 'deepseek' : 'mock_ai';
  const contentVersionIds: string[] = [];
  for (const chapterDraft of chapters) {
    const chapter = chapterDraft.chapter;
    const contentVersion = chapter.chapterNo === 1 ? { id: selectedCandidate.id }
      : await tx.chapterContentVersion.create({ data: {
        tenantId: context.tenantId, novelId: novel.id, chapterId: chapter.id,
        versionNo: await getNextChapterContentVersionNo(tx, context.tenantId, novel.id, chapter.id),
        status: PrismaVersionStatus.CANDIDATE, staleLevel: PrismaStaleLevel.NONE,
        sourceType, sourceTaskId: task.id,
        sourceVersionRefs: toJsonObject(sourceVersionRefs),
        rewriteReason: '连续试写生成章节正文', content: chapterDraft.content,
        wordCount: countWords(chapterDraft.content), summary: chapterDraft.summary,
        reviewScore: chapterDraft.scoring.totalScore, createdBy: context.userId,
        createdAt: now,
        metadata: toJsonObject({ trialRunId: trialRun.id, trialStatus: 'selected_for_trial',
          chapterNo: chapter.chapterNo, title: chapter.title,
          openingStrategy: chapterDraft.openingStrategy,
          openingHighlight: chapterDraft.openingHighlight,
          firstSentence: chapterDraft.firstSentence,
          first300Summary: chapterDraft.first300Summary,
          endingHook: chapterDraft.endingHook, riskLevel: chapterDraft.riskLevel,
          riskTags: chapterDraft.riskTags, aiRecommendedReason: chapterDraft.aiRecommendedReason,
          isAiRecommended: false, isSelected: true, scoring: chapterDraft.scoring })
      } });
    contentVersionIds.push(contentVersion.id);
    const feature = chapterDraft.featureCard;
    const featureCard = await tx.chapterFeatureCard.create({ data: {
      tenantId: context.tenantId, novelId: novel.id, chapterId: chapter.id,
      versionNo: await getNextFeatureCardVersionNo(tx, context.tenantId, chapter.id),
      status: PrismaVersionStatus.CANDIDATE, staleLevel: PrismaStaleLevel.NONE,
      oneLineSummary: feature.oneLineSummary, coreTask: feature.coreTask,
      mainConflict: feature.mainConflict, appealPoint: feature.appealPoint,
      emotionKeywordsJson: feature.emotionKeywords,
      characterChangesJson: feature.characterChanges,
      relationshipChangesJson: feature.relationshipChanges,
      keyInformationJson: feature.keyInformation,
      foreshadowingOperation: feature.foreshadowingOperation,
      endingHook: feature.endingHook,
      factsCannotChangeJson: feature.factsCannotChange,
      featuresToStrengthenJson: feature.featuresToStrengthen,
      sourceTaskId: task.id, createdAt: now,
      metadata: toJsonObject(feature.metadata)
    } });
    const reviewReport = await tx.reviewReport.create({ data: createReviewReportData({
      input, taskId: task.id, chapterDraft, contentVersionId: contentVersion.id
    }) });
    await tx.trialChapterResult.create({ data: {
      tenantId: context.tenantId, trialRunId: trialRun.id, chapterId: chapter.id,
      contentVersionId: contentVersion.id, featureCardVersionId: featureCard.id,
      reviewReportId: reviewReport.id, score: chapterDraft.scoring.totalScore,
      status: chapterDraft.hardFailed ? 'hard_failed' : 'completed',
      createdAt: now, metadata: { hardFailed: chapterDraft.hardFailed,
        hardFailureReasons: chapterDraft.hardFailureReasons }
    } });
  }
  const trialReview = await tx.reviewReport.create({ data: createTrialReviewReportData(input, task.id) });
  const blocked = review.trialResult === 'blocked';
  const trialTransition = await tx.trialRun.updateMany({ where: {
    tenantId: context.tenantId, novelId: novel.id, id: trialRun.id,
    status: 'waiting_chapter1_selection', sourceTaskId
  }, data: {
    status: blocked ? 'blocked' : 'review_ready', totalScore: review.totalScore,
    trialResult: review.trialResult, reviewReportId: trialReview.id,
    sourceTaskId: task.id, updatedAt: now,
    metadata: toJsonObject({ ...authorityRecord(trialRun.metadata),
      selectedChapterOneCandidateId: selectedCandidate.id,
      currentStep: blocked ? '处理第2章硬失败' : '确认试写总评并生成正文策略快照',
      blockingReason: blocked ? '第2章硬门槛未通过，不能继续第3章。' : null,
      requiresRiskConfirmation: review.requiresRiskConfirmation })
  } });
  if (trialTransition.count !== 1) throw new Error('Trial followup lost its run transition.');
  await tx.operationLog.create({ data: {
    tenantId: context.tenantId, userId: context.userId, novelId: novel.id,
    action: 'select_trial_chapter1_candidate', objectType: 'trial_run', objectId: trialRun.id,
    beforeSnapshot: { selectedChapterOneCandidateId: null },
    afterSnapshot: { selectedChapterOneCandidateId: selectedCandidate.id,
      trialResult: review.trialResult, totalScore: review.totalScore },
    reason: '用户选择第1章候选并继续试写', impactSummary: review.summary,
    sourceTaskId: task.id, requestId: context.requestId, createdAt: now
  } });
  return contentVersionIds;
}

function createReviewReportData(options: {
  input: TrialFollowupGenerationInput;
  taskId: string;
  chapterDraft: TrialFollowupGenerationInput['chapters'][number];
  contentVersionId: string;
}) {
  const draft = options.chapterDraft.review;

  return {
    tenantId: options.input.context.tenantId,
    novelId: options.input.novel.id,
    objectType: 'chapter',
    objectId: options.chapterDraft.chapter.id,
    objectVersionId: options.contentVersionId,
    reviewLevel: draft.reviewLevel,
    totalScore: draft.totalScore,
    subScoresJson: toJsonObject(draft.subScores),
    rating: draft.rating,
    summary: draft.summary,
    strengthsJson: draft.strengths,
    problemsJson: draft.problems,
    suggestionsJson: draft.suggestions,
    issueCardsJson: toJsonObject(draft.issueCards),
    actionOptionsJson: toJsonObject(draft.actionOptions),
    recommendedAction: draft.recommendedAction,
    allowNextStep: draft.allowNextStep,
    blockingIssueCount: draft.blockingIssueCount,
    resolvedStatus: draft.resolvedStatus,
    promptTemplateVersionId: draft.promptTemplateVersionId,
    policyProfileVersionId: draft.policyProfileVersionId ?? options.input.novel.policyProfileVersionId,
    sourceTaskId: options.taskId,
    createdAt: options.input.now,
    metadata: toJsonObject(draft.metadata)
  };
}

function createTrialReviewReportData(input: TrialFollowupGenerationInput, taskId: string) {
  const review = input.review;

  return {
    tenantId: input.context.tenantId,
    novelId: input.novel.id,
    objectType: 'trial_run',
    objectId: input.trialRun.id,
    objectVersionId: null,
    reviewLevel: 'trial',
    totalScore: review.totalScore,
    subScoresJson: {
      scoringStrategyVersion: 'trial-summary-score-v1',
      chapterScores: review.chapterScores
    },
    rating: review.trialResult,
    summary: review.summary,
    strengthsJson: review.strengths,
    problemsJson: review.problems,
    suggestionsJson: review.suggestions,
    issueCardsJson: review.problems.map((problem) => ({
      severity: review.trialResult === 'blocked' ? 'blocking' : 'warning',
      dimension: 'trial_summary',
      message: problem,
      suggestion: review.suggestions[0] ?? '查看试写总评'
    })),
    actionOptionsJson: [review.recommendedAction],
    recommendedAction: review.recommendedAction,
    allowNextStep: review.allowNextStep,
    blockingIssueCount: review.trialResult === 'blocked' ? 1 : 0,
    resolvedStatus: 'open',
    promptTemplateVersionId: null,
    policyProfileVersionId: input.novel.policyProfileVersionId,
    sourceTaskId: taskId,
    createdAt: input.now,
    metadata: {
      scoringStrategyVersion: 'trial-summary-score-v1',
      trialResult: review.trialResult,
      requiresRiskConfirmation: review.requiresRiskConfirmation,
      chapterScores: review.chapterScores
    }
  };
}

function getDirectionTaskSourceRefs(input: DirectionCreationInput | DirectionRevisionInput) {
  if ('sourceVersionIds' in input) {
    return {
      sourceVersionIds: input.sourceVersionIds,
      currentDirectionVersionId: input.novel.currentDirectionVersionId
    };
  }

  return {
    currentDirectionVersionId: input.novel.currentDirectionVersionId
  };
}

function getDirectionRevisionTaskStep(taskType: string) {
  if (taskType === 'novel_direction_fuse') return '融合方向候选已生成';
  if (taskType === 'novel_direction_manual_edit') return '手动编辑方向候选已保存';
  return '优化方向候选已生成';
}

function getDirectionRevisionOutputSummary(taskType: string) {
  if (taskType === 'novel_direction_fuse') return '生成融合方向候选';
  if (taskType === 'novel_direction_manual_edit') return '保存手动编辑方向候选';
  return '生成优化方向候选';
}

function getDirectionRevisionSourceType(taskType: string) {
  return taskType === 'novel_direction_manual_edit' ? 'manual_edit' : 'mock_ai';
}

async function createTaskProgressEvents(
  tx: any,
  task: {
    id: string;
    tenantId: string;
    status: string;
    progress: number;
    currentStep: string | null;
  },
  requestId: string,
  now: Date
) {
  const timestamp = now.getTime();
  await createTaskEvent(tx, {
    task,
    eventType: 'preparing_context',
    message: '正在准备上下文、版本引用和生成参数。',
    progress: 0,
    requestId,
    createdAt: new Date(timestamp)
  });
  await createTaskEvent(tx, {
    task,
    eventType: 'calling_model',
    message: '正在调用模型生成内容，可能需要 2-5 分钟；若等待过久，请刷新查看任务状态。',
    progress: 35,
    requestId,
    createdAt: new Date(timestamp + 1)
  });
  await createTaskEvent(tx, {
    task,
    eventType: 'parsing_output',
    message: '模型返回后正在解析结构化输出。',
    progress: 65,
    requestId,
    createdAt: new Date(timestamp + 2)
  });
  await createTaskEvent(tx, {
    task,
    eventType: 'quality_checking',
    message: '正在检查输出完整性、评分和风险门禁。',
    progress: 82,
    requestId,
    createdAt: new Date(timestamp + 3)
  });
  await createTaskEvent(tx, {
    task,
    eventType: 'saving_result',
    message: task.currentStep ?? '正在保存生成结果和任务摘要。',
    progress: task.progress,
    requestId,
    createdAt: new Date(timestamp + 4)
  });
}

async function createTaskEvent(
  tx: any,
  input: {
    task: {
      id: string;
      tenantId: string;
      status: string;
    };
    eventType: string;
    message: string;
    progress: number | null;
    requestId: string;
    createdAt: Date;
  }
) {
  return tx.generationTaskEvent.create({
    data: {
      tenantId: input.task.tenantId,
      taskId: input.task.id,
      status: input.task.status,
      eventType: input.eventType,
      message: input.message,
      progress: input.progress,
      payloadJson: {
        requestId: input.requestId
      },
      createdAt: input.createdAt
    }
  });
}

async function getNextDirectionVersionNo(tx: any, tenantId: string, novelId: string) {
  return getNextVersionNo(tx, tenantId, novelId, 'direction');
}

async function getNextVersionNo(tx: any, tenantId: string, novelId: string, objectType: string) {
  const latest = await tx.creativeVersion.findFirst({
    where: {
      tenantId,
      novelId,
      objectType
    },
    orderBy: {
      versionNo: 'desc'
    }
  });

  return latest ? latest.versionNo + 1 : 1;
}

async function getNextChapterContentVersionNo(tx: any, tenantId: string, novelId: string, chapterId: string) {
  const latest = await tx.chapterContentVersion.findFirst({
    where: { tenantId, novelId, chapterId },
    orderBy: { versionNo: 'desc' }
  });

  return latest ? latest.versionNo + 1 : 1;
}

async function getNextFeatureCardVersionNo(tx: any, tenantId: string, chapterId: string) {
  const latest = await tx.chapterFeatureCard.findFirst({
    where: { tenantId, chapterId },
    orderBy: { versionNo: 'desc' }
  });

  return latest ? latest.versionNo + 1 : 1;
}

function getGenerationStage(objectType: string) {
  if (objectType === 'setting') return NovelCreationStage.Setting;
  if (objectType === 'outline' || objectType === 'stage_outline') return NovelCreationStage.Outline;
  return NovelCreationStage.ChapterPlan;
}

function getStructureGenerateStep(objectType: string) {
  if (objectType === 'setting') return '设定候选已生成，等待确认';
  if (objectType === 'outline') return '全书大纲候选已生成，等待确认';
  if (objectType === 'stage_outline') return '阶段大纲候选已生成，等待确认';
  return '章节目录候选已生成，等待确认';
}

function getStructureAdoptStep(objectType: string) {
  if (objectType === 'setting') return '设定已采用，进入大纲阶段';
  if (objectType === 'outline') return '全书大纲已采用，准备阶段大纲';
  if (objectType === 'stage_outline') return '阶段大纲已采用，进入章节目录阶段';
  return '章节目录已采用，准备试写';
}

function getStructureObjectText(objectType: string) {
  if (objectType === 'setting') return '设定';
  if (objectType === 'outline') return '全书大纲';
  if (objectType === 'stage_outline') return '阶段大纲';
  if (objectType === 'chapter_plan') return '章节目录';
  return objectType;
}

function getCurrentVersionId(novel: NovelRecord, objectType: string) {
  if (objectType === 'setting') return novel.currentSettingVersionId;
  if (objectType === 'outline') return novel.currentOutlineVersionId;
  if (objectType === 'stage_outline') return novel.currentStageOutlineVersionId;
  if (objectType === 'chapter_plan') return novel.currentChapterPlanVersionId;
  return null;
}

function getDownstreamObjectTypes(objectType: string) {
  if (objectType === 'setting') return ['outline', 'stage_outline', 'chapter_plan'];
  if (objectType === 'outline') return ['stage_outline', 'chapter_plan'];
  if (objectType === 'stage_outline') return ['chapter_plan'];
  return [];
}

function createPrismaNovelPatchAfterStructureAdoption(input: StructureAdoptionInput) {
  const base = {
    updatedBy: input.context.userId,
    updatedAt: input.now
  };

  if (input.objectType === 'setting') {
    return {
      ...base,
      currentSettingVersionId: input.candidate.id,
      currentOutlineVersionId: null,
      currentStageOutlineVersionId: null,
      currentChapterPlanVersionId: null,
      creationStage: PrismaNovelCreationStage.OUTLINE,
      stageStatus: PrismaStageStatus.NOT_STARTED
    };
  }

  if (input.objectType === 'outline') {
    return {
      ...base,
      currentOutlineVersionId: input.candidate.id,
      currentStageOutlineVersionId: null,
      currentChapterPlanVersionId: null,
      creationStage: PrismaNovelCreationStage.OUTLINE,
      stageStatus: PrismaStageStatus.NOT_STARTED
    };
  }

  if (input.objectType === 'stage_outline') {
    return {
      ...base,
      currentStageOutlineVersionId: input.candidate.id,
      currentChapterPlanVersionId: null,
      creationStage: PrismaNovelCreationStage.CHAPTER_PLAN,
      stageStatus: PrismaStageStatus.NOT_STARTED
    };
  }

  return {
    ...base,
    currentChapterPlanVersionId: input.candidate.id,
    creationStage: PrismaNovelCreationStage.TRIAL,
    stageStatus: PrismaStageStatus.NOT_STARTED
  };
}

async function refreshPrismaChapters(tx: any, input: StructureAdoptionInput) {
  const content = input.candidate.content as { chapters?: Array<{ chapterNo: number; stageIndex: number; title: string; wordTarget: number }> };
  const plannedChapters = Array.isArray(content.chapters) ? content.chapters : [];
  const plannedNos = plannedChapters.map((chapter) => chapter.chapterNo);

  await tx.novelChapter.updateMany({
    where: {
      tenantId: input.context.tenantId,
      novelId: input.novel.id,
      deletedAt: null,
      chapterNo: {
        notIn: plannedNos.length > 0 ? plannedNos : [-1]
      }
    },
    data: {
      deletedAt: input.now,
      updatedAt: input.now
    }
  });

  for (const planned of plannedChapters) {
    await tx.novelChapter.upsert({
      where: {
        tenantId_novelId_chapterNo: {
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          chapterNo: planned.chapterNo
        }
      },
      create: {
        tenantId: input.context.tenantId,
        novelId: input.novel.id,
        chapterNo: planned.chapterNo,
        stageIndex: planned.stageIndex,
        title: planned.title,
        wordTarget: planned.wordTarget,
        wordCount: 0,
        mainStatus: 'pending',
        statusNote: '章节目录已确认，正文尚未生成。',
        impactLevel: PrismaImpactLevel.NONE,
        currentContentVersionId: null,
        createdAt: input.now,
        updatedAt: input.now
      },
      update: {
        stageIndex: planned.stageIndex,
        title: planned.title,
        wordTarget: planned.wordTarget,
        statusNote: '章节目录已刷新，正文尚未生成。',
        deletedAt: null,
        updatedAt: input.now
      }
    });
  }
}

function normalizePrismaStructureContent(value: unknown): StructureAssetContentDTO {
  const content = typeof value === 'object' && value !== null ? (value as Partial<StructureAssetContentDTO>) : {};
  return {
    title: typeof content.title === 'string' ? content.title : '',
    summary: typeof content.summary === 'string' ? content.summary : '',
    sections: Array.isArray(content.sections) ? content.sections : [],
    stages: Array.isArray(content.stages) ? content.stages : [],
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
    riskTags: Array.isArray(content.riskTags) ? content.riskTags : [],
    recommendation: typeof content.recommendation === 'string' ? content.recommendation : ''
  };
}

function mapImpactCase(record: {
  id: string;
  tenantId: string;
  novelId: string;
  sourceObjectType: string;
  sourceObjectId: string;
  sourceOldVersionId: string | null;
  sourceNewVersionId: string | null;
  impactLevel: string;
  status: string;
  affectedChapterIdsJson: unknown;
  affectedVideoReferenceIdsJson: unknown;
  summary: string | null;
  suggestedActionsJson: unknown;
  decisionRecordId: string | null;
  sourceTaskId: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  metadata: unknown;
}): ImpactCaseRecord {
  return {
    id: record.id,
    tenantId: record.tenantId,
    novelId: record.novelId,
    sourceObjectType: record.sourceObjectType,
    sourceObjectId: record.sourceObjectId,
    sourceOldVersionId: record.sourceOldVersionId,
    sourceNewVersionId: record.sourceNewVersionId,
    impactLevel: fromPrismaEnum<ImpactCaseRecord['impactLevel']>(record.impactLevel),
    status: record.status,
    affectedChapterIds: toStringArray(record.affectedChapterIdsJson),
    affectedVideoReferenceIds: toStringArray(record.affectedVideoReferenceIdsJson),
    summary: record.summary,
    suggestedActions: toStringArray(record.suggestedActionsJson),
    decisionRecordId: record.decisionRecordId,
    sourceTaskId: record.sourceTaskId,
    createdAt: record.createdAt,
    resolvedAt: record.resolvedAt,
    metadata: record.metadata ?? {}
  };
}

function mapLongTermMemory(record: {
  id: string;
  tenantId: string;
  novelId: string;
  chapterId: string | null;
  sourceContentVersionId: string | null;
  previousSummary: string | null;
  characterStatesJson: unknown;
  relationshipStatesJson: unknown;
  locationsJson: unknown;
  organizationsJson: unknown;
  itemsJson: unknown;
  plantedForeshadowingJson: unknown;
  resolvedForeshadowingJson: unknown;
  unresolvedConflictsJson: unknown;
  newSettingsJson: unknown;
  factsCannotContradictJson: unknown;
  status: string;
  staleLevel: string;
  sourceTaskId: string | null;
  createdAt: Date;
  metadata: unknown;
}): LongTermMemoryRecord {
  return {
    id: record.id,
    tenantId: record.tenantId,
    novelId: record.novelId,
    chapterId: record.chapterId,
    sourceContentVersionId: record.sourceContentVersionId,
    previousSummary: record.previousSummary,
    characterStates: toStringArray(record.characterStatesJson),
    relationshipStates: toStringArray(record.relationshipStatesJson),
    locations: toStringArray(record.locationsJson),
    organizations: toStringArray(record.organizationsJson),
    items: toStringArray(record.itemsJson),
    plantedForeshadowing: toStringArray(record.plantedForeshadowingJson),
    resolvedForeshadowing: toStringArray(record.resolvedForeshadowingJson),
    unresolvedConflicts: toStringArray(record.unresolvedConflictsJson),
    newSettings: toStringArray(record.newSettingsJson),
    factsCannotContradict: toStringArray(record.factsCannotContradictJson),
    status: fromPrismaEnum<VersionStatus>(record.status),
    staleLevel: fromPrismaEnum<StaleLevel>(record.staleLevel),
    sourceTaskId: record.sourceTaskId,
    createdAt: record.createdAt,
    metadata: record.metadata ?? {}
  };
}

function toDirectionContent(value: unknown) {
  if (value && typeof value === 'object') {
    const content = value as Record<string, unknown>;

    return {
      title: toStringValue(content.title),
      logline: toStringValue(content.logline),
      coreHook: toStringValue(content.coreHook),
      audienceAppeal: toStringValue(content.audienceAppeal),
      videoPotential: toStringValue(content.videoPotential),
      sellingPoints: toStringArray(content.sellingPoints),
      riskTags: toStringArray(content.riskTags),
      recommendation: toStringValue(content.recommendation)
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

function validPrismaLeasedSummaryCompare(value: unknown): value is ChapterSummaryCompareDTO {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const compare = value as Record<string, unknown>;
  const text = (input: unknown) => typeof input === 'string' && input.trim().length > 0;
  const fields = ['currentSummary', 'candidateSummary', 'benefit', 'newRisks', 'possibleImpact', 'aiSuggestion'];
  return Object.keys(compare).length === fields.length && fields.every((field) => Object.hasOwn(compare, field))
    && typeof compare.currentSummary === 'string' && text(compare.candidateSummary)
    && text(compare.benefit) && text(compare.possibleImpact) && text(compare.aiSuggestion)
    && Array.isArray(compare.newRisks) && compare.newRisks.every(text);
}

function validPrismaLeasedImpactDraft(value: unknown): value is ImpactAssessmentDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  const text = (input: unknown) => typeof input === 'string' && input.trim().length > 0;
  const strings = (input: unknown) => Array.isArray(input) && input.every(text);
  const fields = ['impactLevel', 'summary', 'changedFacts', 'affectedChapterIds',
    'affectedVideoReferenceIds', 'recommendedHandling', 'suggestedActions', 'blocksFullReview'];
  return Object.keys(draft).length === fields.length && fields.every((field) => Object.hasOwn(draft, field))
    && ['none', 'minor', 'medium', 'severe'].includes(String(draft.impactLevel))
    && text(draft.summary) && text(draft.recommendedHandling)
    && strings(draft.changedFacts) && strings(draft.affectedChapterIds)
    && strings(draft.affectedVideoReferenceIds) && strings(draft.suggestedActions)
    && (draft.suggestedActions as unknown[]).length > 0
    && draft.blocksFullReview === ['medium', 'severe'].includes(String(draft.impactLevel));
}

function validPrismaLeasedDirectionDraft(value: unknown): value is DirectionCandidateDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  const content = authorityRecord(draft.content);
  const text = (item: unknown, max = 10000) => typeof item === 'string' && item.trim().length > 0 && item.length <= max;
  const strings = (item: unknown) => Array.isArray(item) && item.length <= 30 && item.every((part) => text(part, 2000));
  const score = (item: unknown) => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 100;
  return text(draft.title, 200) && text(draft.summary) && text(draft.recommendedReason)
    && score(draft.score) && score(draft.marketScore)
    && Object.values(RiskLevel).includes(draft.riskLevel as RiskLevel) && strings(draft.riskTags)
    && text(content.title, 200) && text(content.logline) && text(content.coreHook)
    && text(content.audienceAppeal) && text(content.videoPotential)
    && strings(content.sellingPoints) && strings(content.riskTags) && text(content.recommendation);
}

function validPrismaLeasedTrialCandidate(
  value: unknown,
  chapterId: string,
  wordTarget: number
): value is TrialChapterCandidateDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  const scoring = authorityRecord(draft.scoring);
  const text = (item: unknown, max = 20000) => typeof item === 'string' && item.trim().length > 0 && item.length <= max;
  const strings = (item: unknown) => Array.isArray(item) && item.length <= 30 && item.every((part) => text(part, 2000));
  const score = (item: unknown) => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 100;
  const weights = authorityRecord(scoring.weights);
  const fields = (item: Record<string, unknown>, allowed: string[]) => Object.keys(item).every((key) => allowed.includes(key));
  return fields(draft, ['chapterId', 'chapterNo', 'title', 'content', 'summary', 'openingStrategy',
    'openingHighlight', 'firstSentence', 'first300Summary', 'endingHook', 'riskLevel',
    'riskTags', 'aiRecommendedReason', 'isAiRecommended', 'scoring'])
    && fields(scoring, ['scoringStrategyVersion', 'totalScore', 'gateResult', 'gateResultText',
      'dimensions', 'weights', 'evidence', 'penalties', 'hardFailure', 'hardFailureReasons'])
    && draft.chapterId === chapterId && draft.chapterNo === 1
    && text(draft.title, 200) && text(draft.content, 100000) && text(draft.summary)
    && text(draft.openingStrategy) && text(draft.openingHighlight)
    && text(draft.firstSentence) && text(draft.first300Summary)
    && text(draft.endingHook) && text(draft.aiRecommendedReason)
    && Object.values(RiskLevel).includes(draft.riskLevel as RiskLevel)
    && strings(draft.riskTags) && typeof draft.isAiRecommended === 'boolean'
    && text(scoring.scoringStrategyVersion, 200) && score(scoring.totalScore)
    && ['pass', 'warning', 'hard_fail'].includes(String(scoring.gateResult))
    && text(scoring.gateResultText)
    && Array.isArray(scoring.dimensions) && scoring.dimensions.length > 0 && scoring.dimensions.length <= 30
    && scoring.dimensions.every((part) => {
      const dimension = authorityRecord(part);
      return fields(dimension, ['key', 'label', 'score', 'weight', 'evidence', 'penaltyPoints'])
        && text(dimension.key, 100) && text(dimension.label, 200) && score(dimension.score)
        && typeof dimension.weight === 'number' && Number.isFinite(dimension.weight)
        && dimension.weight >= 0 && dimension.weight <= 1 && text(dimension.evidence)
        && typeof dimension.penaltyPoints === 'number' && Number.isFinite(dimension.penaltyPoints)
        && dimension.penaltyPoints >= 0;
    })
    && Object.keys(weights).length > 0
    && Object.values(weights).every((weight) => typeof weight === 'number' && Number.isFinite(weight)
      && weight >= 0 && weight <= 1)
    && strings(scoring.evidence) && strings(scoring.penalties)
    && typeof scoring.hardFailure === 'boolean' && strings(scoring.hardFailureReasons)
    && evaluateChapterLength(draft.content as string, wordTarget).status === 'pass';
}

function trialFollowupSensitiveProbe(result: {
  chapters: TrialFollowupChapterProviderDraft[];
  review: TrialReviewDraft;
}) {
  return {
    ...result,
    chapters: result.chapters.map((chapter) => ({
      ...chapter,
      review: {
        ...chapter.review,
        issueCards: chapter.review.issueCards.map((issue) => {
          const { message, ...otherFields } = issue;
          return { ...otherFields, issueText: message };
        })
      }
    }))
  };
}

function validPrismaLeasedTrialFollowupResult(value: unknown): value is {
  chapters: TrialFollowupChapterProviderDraft[];
  review: TrialReviewDraft;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  const review = authorityRecord(result.review);
  const text = (item: unknown, max = 20000) => typeof item === 'string'
    && item.trim().length > 0 && item.length <= max;
  const strings = (item: unknown) => Array.isArray(item) && item.length <= 30
    && item.every((part) => text(part, 2000));
  return Array.isArray(result.chapters) && result.chapters.length >= 2 && result.chapters.length <= 5
    && text(review.summary) && strings(review.strengths) && strings(review.problems)
    && strings(review.suggestions) && text(review.recommendedAction, 200)
    && typeof review.requiresRiskConfirmation === 'boolean'
    && result.chapters.every((item) => {
      const draft = authorityRecord(item);
      const feature = authorityRecord(draft.featureCard);
      const chapterReview = authorityRecord(draft.review);
      return text(draft.content, 100000) && text(draft.summary)
        && text(draft.openingStrategy) && text(draft.openingHighlight)
        && text(draft.firstSentence) && text(draft.first300Summary)
        && text(draft.endingHook) && text(draft.aiRecommendedReason)
        && strings(draft.riskTags) && strings(draft.hardFailureReasons)
        && text(feature.oneLineSummary) && text(feature.coreTask)
        && text(feature.mainConflict) && text(feature.appealPoint)
        && strings(feature.emotionKeywords) && strings(feature.characterChanges)
        && strings(feature.relationshipChanges) && strings(feature.keyInformation)
        && text(feature.foreshadowingOperation) && text(feature.endingHook)
        && strings(feature.factsCannotChange) && strings(feature.featuresToStrengthen)
        && text(chapterReview.reviewLevel, 100) && text(chapterReview.summary)
        && strings(chapterReview.strengths) && strings(chapterReview.problems)
        && strings(chapterReview.suggestions) && strings(chapterReview.actionOptions)
        && text(chapterReview.recommendedAction, 200)
        && typeof chapterReview.allowNextStep === 'boolean'
        && Number.isInteger(chapterReview.blockingIssueCount)
        && Array.isArray(chapterReview.issueCards)
        && chapterReview.issueCards.length <= 30;
    });
}

function validPrismaLeasedStructureDraft(value: unknown, objectType: StructureAssetDraft['objectType']): value is StructureAssetDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  if (draft.objectType !== objectType || !draft.content || typeof draft.content !== 'object'
    || Array.isArray(draft.content)) return false;
  const content = draft.content as Record<string, unknown>;
  const text = (item: unknown, max = 10000) => typeof item === 'string' && item.trim().length > 0 && item.length <= max;
  const strings = (item: unknown) => Array.isArray(item) && item.length <= 30 && item.every((part) => text(part, 2000));
  const positiveInteger = (item: unknown) => Number.isInteger(item) && Number(item) > 0;
  const fields = (item: Record<string, unknown>, allowed: string[]) => Object.keys(item).every((key) => allowed.includes(key));
  return fields(draft, ['objectType', 'title', 'summary', 'content', 'score', 'riskLevel', 'riskTags', 'recommendedReason'])
    && fields(content, ['title', 'summary', 'sections', 'stages', 'chapters', 'riskTags', 'recommendation'])
    && text(draft.title, 200) && text(draft.summary) && text(draft.recommendedReason)
    && typeof draft.score === 'number' && Number.isFinite(draft.score) && draft.score >= 0 && draft.score <= 100
    && Object.values(RiskLevel).includes(draft.riskLevel as RiskLevel) && strings(draft.riskTags)
    && text(content.title, 200) && text(content.summary) && text(content.recommendation) && strings(content.riskTags)
    && Array.isArray(content.sections) && content.sections.length > 0 && content.sections.length <= 100
    && content.sections.every((section) => !!section && typeof section === 'object' && !Array.isArray(section)
      && fields(section, ['title', 'body', 'items']) && text(section.title, 200)
      && text(section.body, 20000) && strings(section.items))
    && Array.isArray(content.stages) && content.stages.length <= 100
    && content.stages.every((stage) => !!stage && typeof stage === 'object' && !Array.isArray(stage)
      && fields(stage, ['stageIndex', 'title', 'chapterRange', 'goal', 'conflict', 'payoff'])
      && positiveInteger(stage.stageIndex) && text(stage.title, 200) && text(stage.chapterRange, 200)
      && text(stage.goal) && text(stage.conflict) && text(stage.payoff))
    && (objectType === 'setting' || objectType === 'outline' || content.stages.length > 0)
    && Array.isArray(content.chapters) && content.chapters.length <= (objectType === 'chapter_plan' ? 1000 : 100)
    && content.chapters.every((chapter) => !!chapter && typeof chapter === 'object' && !Array.isArray(chapter)
      && fields(chapter, ['chapterNo', 'stageIndex', 'title', 'wordTarget', 'goal', 'conflict', 'hook'])
      && positiveInteger(chapter.chapterNo) && positiveInteger(chapter.stageIndex)
      && positiveInteger(chapter.wordTarget) && text(chapter.title, 200)
      && text(chapter.goal) && text(chapter.conflict) && text(chapter.hook))
    && (objectType !== 'chapter_plan' || content.chapters.length > 0);
}

function bodyBatchFromTaskMetadata(metadata: unknown, tenantId: string, novelId: string): BodyBatchRecord | null {
  try {
    const batch = requiredRecord(requiredRecord(metadata, 'metadata').batch, 'metadata.batch');
    if (requiredString(batch.tenantId, 'batch.tenantId') !== tenantId || requiredString(batch.novelId, 'batch.novelId') !== novelId) return null;
    const chapterResults = requiredArray(batch.chapterResults, 'batch.chapterResults').map((value, index) => {
      const row = requiredRecord(value, `batch.chapterResults[${index}]`);
      return {
        chapterId: requiredString(row.chapterId, 'chapterId'),
        chapterNo: requiredInteger(row.chapterNo, 'chapterNo'),
        title: requiredString(row.title, 'title'),
        status: requiredOneOf(row.status, ['completed', 'failed', 'pending'] as const, 'status'),
        statusText: requiredString(row.statusText, 'statusText'),
        contentVersionId: nullableString(row.contentVersionId, 'contentVersionId'),
        featureCardId: nullableString(row.featureCardId, 'featureCardId'),
        reviewReportId: nullableString(row.reviewReportId, 'reviewReportId'),
        longTermMemoryId: nullableString(row.longTermMemoryId, 'longTermMemoryId'),
        score: nullableNumber(row.score, 'score'),
        riskLevel: requiredOneOf(row.riskLevel, Object.values(RiskLevel), 'riskLevel'),
        hardFailed: requiredBoolean(row.hardFailed, 'hardFailed'),
        ...(row.lengthGate == null ? {} : { lengthGate: storedBodyLengthGate(row.lengthGate) }),
        statusNote: nullableString(row.statusNote, 'statusNote'),
        recommendedAction: requiredString(row.recommendedAction, 'recommendedAction')
      };
    });
    const summary = requiredRecord(batch.summary, 'batch.summary');
    if (JSON.stringify(requiredArray(summary.chapterResults, 'batch.summary.chapterResults')) !== JSON.stringify(batch.chapterResults)) return null;
    return {
      id: requiredString(batch.id, 'batch.id'),
      tenantId,
      novelId,
      taskId: requiredString(batch.taskId, 'batch.taskId'),
      idempotencyKey: requiredString(batch.idempotencyKey, 'batch.idempotencyKey'),
      requestFingerprint: structuredClone(batch.requestFingerprint),
      strategySnapshotId: requiredString(batch.strategySnapshotId, 'batch.strategySnapshotId'),
      strategySnapshotVersion: requiredInteger(batch.strategySnapshotVersion, 'batch.strategySnapshotVersion'),
      sourceVersionRefs: structuredClone(batch.sourceVersionRefs),
      startChapterNo: requiredInteger(batch.startChapterNo, 'batch.startChapterNo'),
      endChapterNo: requiredInteger(batch.endChapterNo, 'batch.endChapterNo'),
      status: requiredOneOf(batch.status, ['completed', 'paused', 'cancelled'] as const, 'batch.status'),
      statusNote: nullableString(batch.statusNote, 'batch.statusNote'),
      completedCount: requiredInteger(batch.completedCount, 'batch.completedCount'),
      failedCount: requiredInteger(batch.failedCount, 'batch.failedCount'),
      pendingCount: requiredInteger(batch.pendingCount, 'batch.pendingCount'),
      failedChapterNo: nullableInteger(batch.failedChapterNo, 'batch.failedChapterNo'),
      chapterResults,
      summary: {
        id: requiredString(summary.id, 'batch.summary.id'),
        batchId: requiredString(summary.batchId, 'batch.summary.batchId'),
        conclusion: requiredString(summary.conclusion, 'batch.summary.conclusion'),
        chapterResults,
        riskTrend: requiredString(summary.riskTrend, 'batch.summary.riskTrend'),
        nextBatchNotes: requiredStringArray(summary.nextBatchNotes, 'batch.summary.nextBatchNotes'),
        riskChapterIds: requiredStringArray(summary.riskChapterIds, 'batch.summary.riskChapterIds'),
        createdAt: requiredDate(summary.createdAt, 'batch.summary.createdAt')
      },
      createdAt: requiredDate(batch.createdAt, 'batch.createdAt'),
      metadata: structuredClone(batch.metadata)
    };
  } catch {
    return null;
  }
}

function storedBodyLengthGate(value: unknown): ChapterLengthGateDTO {
  const gate = requiredRecord(value, 'lengthGate');
  return {
    metric: requiredOneOf(gate.metric, ['unicode_code_point_non_whitespace_nfc_v1'] as const, 'lengthGate.metric'),
    target: nullableInteger(gate.target, 'lengthGate.target'),
    lowerBound: nullableInteger(gate.lowerBound, 'lengthGate.lowerBound'),
    upperBound: nullableInteger(gate.upperBound, 'lengthGate.upperBound'),
    actual: requiredInteger(gate.actual, 'lengthGate.actual'),
    status: requiredOneOf(gate.status, ['unconfigured', 'pass', 'too_short', 'too_long'] as const, 'lengthGate.status'),
    statusText: requiredString(gate.statusText, 'lengthGate.statusText'),
    canAdopt: requiredBoolean(gate.canAdopt, 'lengthGate.canAdopt')
  };
}
function requiredRecord(value: unknown, path: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${path} must be an object`); return value as Record<string, unknown>; }
function requiredArray(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`); return value; }
function requiredString(value: unknown, path: string): string { if (typeof value !== 'string' || !value) throw new TypeError(`${path} must be a string`); return value; }
function nullableString(value: unknown, path: string): string | null { return value === null ? null : requiredString(value, path); }
function requiredInteger(value: unknown, path: string): number { if (!Number.isInteger(value) || (value as number) < 0) throw new TypeError(`${path} must be a non-negative integer`); return value as number; }
function nullableInteger(value: unknown, path: string): number | null { return value === null ? null : requiredInteger(value, path); }
function nullableNumber(value: unknown, path: string): number | null { if (value === null) return null; if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${path} must be a number`); return value; }
function requiredBoolean(value: unknown, path: string): boolean { if (typeof value !== 'boolean') throw new TypeError(`${path} must be a boolean`); return value; }
function requiredStringArray(value: unknown, path: string): string[] { return requiredArray(value, path).map((item, index) => requiredString(item, `${path}[${index}]`)); }
function requiredDate(value: unknown, path: string): Date { const date = value instanceof Date ? new Date(value) : new Date(requiredString(value, path)); if (Number.isNaN(date.getTime())) throw new TypeError(`${path} must be a date`); return date; }
function requiredOneOf<T extends string>(value: unknown, values: readonly T[], path: string): T { if (typeof value !== 'string' || !values.includes(value as T)) throw new TypeError(`${path} is unsupported`); return value as T; }
function toJsonObject(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonObject;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toStringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function authorityRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function countWords(content: string) {
  return content.replace(/\s/g, '').length;
}

function fromPrismaEnum<TValue extends string>(value: string): TValue {
  return value.toLowerCase() as TValue;
}

function toPrismaLifecycleStatus(status: NovelLifecycleStatus) {
  return status.toUpperCase() as keyof typeof PrismaNovelLifecycleStatus;
}

function toPrismaCreationStage(stage: NovelCreationStage) {
  return stage.toUpperCase() as keyof typeof PrismaNovelCreationStage;
}

function toPrismaRiskLevel(level: RiskLevel) {
  return level.toUpperCase() as keyof typeof PrismaRiskLevel;
}
