import {
  ErrorCode,
  NovelCreationStage,
  NovelLifecycleStatus,
  RiskLevel,
  StaleLevel,
  StageStatus,
  TaskStatus,
  VersionStatus,
  type FirstVideoSuggestionDTO,
  type FullReviewIssueDTO,
  type StructureAssetContentDTO,
  type VideoReadinessCheckItemDTO
} from '@ai-shortvideo/shared';
import {
  DEFAULT_POLICY_PROFILE_VERSION_ID,
  type AdoptedDirectionRecord,
  type AdoptedStructureAssetRecord,
  type AssetDecisionRecord,
  type BodyBatchGenerationInput,
  type BodyBatchRecord,
  type BodyBatchSummaryRecord,
  type BodyBatchTaskCreationInput,
  type CompletionConfirmationInput,
  type CompletionDecisionRecord,
  type ConfirmedCompletionRecord,
  type ConfirmedVideoReadinessRecord,
  type CreatedBodyBatchTaskRecord,
  type CreatedDirectionCandidatesRecord,
  type CreatedDirectionRevisionRecord,
  type CreatedDraftRecord,
  type CreatedFullReviewRecord,
  type CreatedImpactAssessmentRecord,
  type CreatedStructureAssetRecord,
  type CreatedVideoReadinessCheckRecord,
  type CreativeVersionRecord,
  type AdoptedChapterContentRecord,
  type ChapterContentAdoptionInput,
  type DirectionAdoptionInput,
  type DirectionCreationInput,
  type DirectionRevisionInput,
  type DraftCreationInput,
  type ForcedFullReviewRecord,
  type FullReviewCreationInput,
  type FullReviewForcePassInput,
  type FullReviewGateRecord,
  type FullReviewIssueResolutionInput,
  type GenerationTaskRecord,
  type GenerationTaskEventRecord,
  type GenerationAuthorityFenceInput,
  type GenerationAuthorityFenceResult,
  type GeneratedBodyBatchRecord,
  type ListedNovelRecords,
  type ListNovelRecordsQuery,
  type LongTermMemoryRecord,
  type ImpactAssessmentInput,
  type ImpactCaseRecord,
  type ImpactCaseResolveInput,
  type NovelChapterRecord,
  type NovelPreferencesRecord,
  type NovelRecord,
  type NovelRepository,
  type OperationLogRecord,
  type CancelledTaskRecord,
  type ClaimGenerationTaskInput,
  type ClaimGenerationTaskResult,
  type LoadGenerationAuthorityInput,
  type GenerationAuthoritySnapshot,
  type HashedSafeResultReceipt,
  type LeasedTaskFailure,
  type ObservedTaskLease,
  type ChapterContentVersionRecord,
  type ChapterFeatureCardRecord,
  type ChapterWorkbenchRecord,
  type ChapterWordTargetUpdateInput,
  type ConfirmedTrialRecord,
  type RetriedTaskRecord,
  type ResolvedImpactCaseRecord,
  type RewrittenChapterRecord,
  type ChapterRewriteInput,
  type CreatedTrialCandidatesRecord,
  type CreatedTrialFollowupTaskRecord,
  type StructureAdoptionInput,
  type StructureAssetDraft,
  type StructureCreationInput,
  type StructureGenerationTaskCreationInput,
  type TaskCancelInput,
  type TaskFailureInput,
  type TaskRetryInput,
  type GeneratedTrialFollowupRecord,
  type ReviewReportRecord,
  type RequestContext,
  type ResolvedFullReviewIssueRecord,
  type TrialCandidateCreationInput,
  type TrialChapterResultRecord,
  type TrialConfirmationInput,
  type TrialFollowupGenerationInput,
  type TrialFollowupTaskCreationInput,
  type TrialRunRecord,
  type VideoReadinessCheckInput,
  type VideoReadinessCheckRecord,
  type VideoReadinessConfirmationInput,
  type VideoReadinessSnapshotRecord,
  normalizeDraftRequest
} from '../domain/novelDomain.js';
import {
  hashCanonicalJson,
  matchGenerationAuthority,
  validateExecutionEnvelopeV1_1ForTask,
  verifyHashedSafeResultReceipt
} from '../domain/executionContract.js';
import { BusinessError } from '../../../shared/errors.js';

export function createInMemoryNovelRepository(): NovelRepository & {
  getOperationLogs(): OperationLogRecord[];
  getGenerationTasks(): GenerationTaskRecord[];
  getGenerationTaskEvents(): GenerationTaskEventRecord[];
  getCreativeVersions(): CreativeVersionRecord[];
  getAssetDecisionRecords(): AssetDecisionRecord[];
  getNovelChapters(): NovelChapterRecord[];
  getChapterContentVersions(): ChapterContentVersionRecord[];
  getTrialRuns(): TrialRunRecord[];
  getImpactCases(): ImpactCaseRecord[];
  getLongTermMemories(): LongTermMemoryRecord[];
  getBodyBatches(): BodyBatchRecord[];
} {
  const novels: NovelRecord[] = [];
  const preferences: NovelPreferencesRecord[] = [];
  const operationLogs: OperationLogRecord[] = [];
  const generationTasks: GenerationTaskRecord[] = [];
  const generationTaskEvents: GenerationTaskEventRecord[] = [];
  const creativeVersions: CreativeVersionRecord[] = [];
  const assetDecisionRecords: AssetDecisionRecord[] = [];
  const chapters: NovelChapterRecord[] = [];
  const chapterContentVersions: ChapterContentVersionRecord[] = [];
  const chapterFeatureCards: ChapterFeatureCardRecord[] = [];
  const reviewReports: ReviewReportRecord[] = [];
  const trialRuns: TrialRunRecord[] = [];
  const trialChapterResults: TrialChapterResultRecord[] = [];
  const longTermMemories: LongTermMemoryRecord[] = [];
  const impactCases: ImpactCaseRecord[] = [];
  const bodyBatches: BodyBatchRecord[] = [];
  const fullReviewGates: FullReviewGateRecord[] = [];
  const completionDecisions: CompletionDecisionRecord[] = [];
  const videoReadinessChecks: VideoReadinessCheckRecord[] = [];
  const videoReadinessSnapshots: VideoReadinessSnapshotRecord[] = [];
  let sequence = 1;

  function nextId(prefix: string) {
    return `${prefix}_${String(sequence++).padStart(6, '0')}`;
  }

  function loadAuthority(input: LoadGenerationAuthorityInput): GenerationAuthoritySnapshot | null {
    const novel = novels.find((item) => item.tenantId === input.tenantId && item.id === input.novelId && !item.deletedAt);
    if (!novel || novel.lifecycleStatus !== NovelLifecycleStatus.Active) return null;
    const refs = asRecord(input.sourceVersionRefs);
    const currentRefs = {
      currentDirectionVersionId: novel.currentDirectionVersionId,
      currentSettingVersionId: novel.currentSettingVersionId,
      currentOutlineVersionId: novel.currentOutlineVersionId,
      currentStageOutlineVersionId: novel.currentStageOutlineVersionId,
      currentChapterPlanVersionId: novel.currentChapterPlanVersionId
    };
    for (const [key, value] of Object.entries(currentRefs)) {
      if (key in refs && refs[key] !== value) return null;
    }
    const novelFacts = {
      id: novel.id,
      title: novel.title,
      genres: [...novel.genres].sort(),
      chapterLimit: novel.chapterLimit,
      chapterWordMin: novel.chapterWordMin,
      chapterWordMax: novel.chapterWordMax,
      policyProfileVersionId: novel.policyProfileVersionId
    };
    const preference = preferences.find((item) => item.tenantId === input.tenantId && item.novelId === novel.id);
    const preferenceFacts = preference ? {
      appealPoints: preference.appealPoints.map((item) => item.trim()).filter(Boolean).sort(),
      targetAudience: preference.targetAudience,
      stageCount: preference.stageCount
    } : null;
    const versionById = (id: unknown) => typeof id === 'string'
      ? creativeVersions.find((item) => item.tenantId === input.tenantId && item.novelId === novel.id && item.id === id)
      : null;
    const contentById = (id: unknown) => typeof id === 'string'
      ? chapterContentVersions.find((item) => item.tenantId === input.tenantId && item.novelId === novel.id && item.id === id)
      : null;
    const selectedIds = input.action === 'direction_fuse' || input.action === 'direction_optimize'
      ? (Array.isArray(refs.sourceVersionIds) ? refs.sourceVersionIds : [])
      : [refs.currentDirectionVersionId, refs.currentSettingVersionId, refs.currentOutlineVersionId, refs.currentStageOutlineVersionId, refs.currentChapterPlanVersionId];
    const selectedVersions = selectedIds.map(versionById);
    if (selectedVersions.some((item, index) => selectedIds[index] !== null && selectedIds[index] !== undefined && !item)) return null;
    if ((input.action === 'direction_fuse' || input.action === 'direction_optimize') && selectedVersions.some((item) =>
      !item || item.objectType !== 'direction' || item.status === VersionStatus.Discarded
    )) return null;
    if (input.action !== 'direction_fuse' && input.action !== 'direction_optimize'
      && selectedVersions.some((item) => item && item.status !== VersionStatus.Current)) return null;
    const chapter = chapters.find((item) => item.tenantId === input.tenantId && item.novelId === novel.id && item.id === input.objectId);
    if (['chapter_body_generate', 'chapter_rewrite', 'chapter_impact_assess', 'chapter_adopt_impact_assess'].includes(input.action) && !chapter) return null;
    if (chapter && 'currentContentVersionId' in refs && chapter.currentContentVersionId !== refs.currentContentVersionId) return null;
    const currentContent = contentById(refs.currentContentVersionId);
    if (refs.currentContentVersionId && (!currentContent || currentContent.chapterId !== chapter?.id)) return null;
    const candidateRefId = refs.candidateVersionId ?? refs.selectedChapterOneCandidateId;
    const candidate = contentById(candidateRefId);
    if (refs.candidateVersionId && (!candidate || candidate.chapterId !== chapter?.id || candidate.status === VersionStatus.Discarded)) return null;
    const trialRunId = typeof refs.trialRunId === 'string'
      ? refs.trialRunId
      : input.action === 'trial_followup_generate' ? input.objectId : null;
    const trialRun = typeof trialRunId === 'string'
      ? trialRuns.find((item) => item.tenantId === input.tenantId && item.novelId === novel.id && item.id === trialRunId)
      : null;
    if (trialRunId && !trialRun) return null;
    const selectedCandidateId = refs.selectedChapterOneCandidateId;
    if (input.action === 'trial_followup_generate') {
      if (!trialRun || trialRun.status !== 'waiting_chapter1_selection' || typeof selectedCandidateId !== 'string') return null;
      const selected = contentById(selectedCandidateId);
      if (
        !selected
        || asRecord(selected.metadata).trialRunId !== trialRun.id
        || selected.status === VersionStatus.Discarded
      ) return null;
    }
    const orderedChapters = chapters
      .filter((item) => item.tenantId === input.tenantId && item.novelId === novel.id)
      .sort((left, right) => left.chapterNo - right.chapterNo || left.id.localeCompare(right.id))
      .map((item) => ({
        id: item.id,
        chapterNo: item.chapterNo,
        title: item.title,
        wordTarget: item.wordTarget,
        statusNote: item.statusNote,
        currentContentVersionId: item.currentContentVersionId,
        currentFeatureCardVersionId: item.currentFeatureCardVersionId,
        currentReviewReportId: item.currentReviewReportId
      }));
    if (input.action === 'novel_full_review') {
      const expected = Array.isArray(refs.chapterContentVersionIds) ? refs.chapterContentVersionIds : [];
      if (JSON.stringify(expected) !== JSON.stringify(orderedChapters.map((item) => ({
        chapterId: item.id,
        chapterNo: item.chapterNo,
        currentContentVersionId: item.currentContentVersionId,
        currentFeatureCardVersionId: item.currentFeatureCardVersionId,
        currentReviewReportId: item.currentReviewReportId
      })))) return null;
    }
    const loadedFullReviewContents = input.action === 'novel_full_review'
      ? orderedChapters.map((item) => contentById(item.currentContentVersionId))
      : [];
    if (loadedFullReviewContents.some((item) => !item)) return null;
    const fullReviewContents = loadedFullReviewContents.filter((item): item is ChapterContentVersionRecord => Boolean(item));
    const strategy = versionById(refs.strategySnapshotId);
    if (typeof refs.strategySnapshotId === 'string' && (
      !strategy
      || strategy.versionNo !== refs.strategySnapshotVersion
      || strategy.status === VersionStatus.Discarded
    )) return null;
    const bodyAuthority = input.action === 'body_batch_generate' || input.action === 'chapter_body_generate';
    const normalizedRequest = asRecord(input.normalizedRequest);
    const authorityChapters = input.action === 'trial_followup_generate'
      ? orderedChapters.slice(0, trialRun?.trialChapterCount ?? 0)
      : orderedChapters;
    const bodyStartChapterNo = input.action === 'body_batch_generate'
      ? Number(normalizedRequest.startChapter)
      : chapter?.chapterNo;
    const previousChapter = bodyAuthority && Number.isInteger(bodyStartChapterNo)
      ? orderedChapters.filter((item) => item.chapterNo < Number(bodyStartChapterNo)).at(-1)
      : null;
    const bodyPreviousContent = previousChapter ? contentById(previousChapter.currentContentVersionId) : null;
    const bodyPreviousMemory = bodyAuthority ? longTermMemories
      .filter((item) => item.tenantId === input.tenantId && item.novelId === novel.id)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null : null;
    const bodyPreviousBatch = bodyAuthority ? bodyBatches
      .filter((item) => item.tenantId === input.tenantId && item.novelId === novel.id)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null : null;
    return {
      action: input.action,
      tenantId: input.tenantId,
      novelId: novel.id,
      objectId: input.objectId,
      facts: {
        novel: novelFacts,
        preferences: preferenceFacts,
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
        fullReviewContents,
        bodyPreviousBatchNotes: bodyPreviousBatch?.summary.nextBatchNotes ?? []
      }
    };
  }

  return {
    async createDraft(input: DraftCreationInput): Promise<CreatedDraftRecord> {
      const normalized = normalizeDraftRequest(input.request);
      const novelId = nextId('novel');
      const preferenceId = nextId('pref');
      const operationLogId = nextId('oplog');
      const now = input.now;

      const novel: NovelRecord = {
        id: novelId,
        tenantId: input.context.tenantId,
        ownerId: input.context.userId,
        title: normalized.title,
        channel: normalized.channel,
        genres: normalized.genres,
        lifecycleStatus: NovelLifecycleStatus.Active,
        creationStage: NovelCreationStage.Draft,
        stageStatus: StageStatus.NotStarted,
        currentDirectionVersionId: null,
        currentSettingVersionId: null,
        currentOutlineVersionId: null,
        currentStageOutlineVersionId: null,
        currentChapterPlanVersionId: null,
        hotspotReportId: normalized.hotspotReportId,
        policyProfileVersionId: DEFAULT_POLICY_PROFILE_VERSION_ID,
        chapterLimit: normalized.chapterLimit,
        chapterWordMin: normalized.chapterWordMin,
        chapterWordMax: normalized.chapterWordMax,
        summary: null,
        videoReferenceStatus: 'not_referenced',
        createdBy: input.context.userId,
        updatedBy: input.context.userId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      };

      const preference: NovelPreferencesRecord = {
        id: preferenceId,
        tenantId: input.context.tenantId,
        novelId,
        creationSourceType: normalized.creationSourceType,
        hotspotReportId: normalized.hotspotReportId,
        hotspotOpportunityId: normalized.hotspotOpportunityId,
        hotspotTitle: input.creationSourceContext?.hotspotTitle ?? null,
        hotspotOpportunityTitle: input.creationSourceContext?.hotspotOpportunityTitle ?? null,
        appealPoints: normalized.appealPoints,
        genres: normalized.genres,
        openingState: normalized.openingState,
        blockedElements: normalized.blockedElements,
        targetAudience: normalized.targetAudience,
        chapterLimit: normalized.chapterLimit,
        chapterWordMin: normalized.chapterWordMin,
        chapterWordMax: normalized.chapterWordMax,
        stageCount: normalized.stageCount,
        customIdea: normalized.customIdea,
        style: normalized.style,
        videoAdaptationPreference: normalized.videoAdaptationPreference,
        createdBy: input.context.userId,
        createdAt: now
      };

      const operationLog: OperationLogRecord = {
        id: operationLogId,
        tenantId: input.context.tenantId,
        userId: input.context.userId,
        novelId,
        action: 'create_novel_draft',
        objectType: 'novel',
        objectId: novelId,
        beforeSnapshot: null,
        afterSnapshot: {
          lifecycleStatus: novel.lifecycleStatus,
          creationStage: novel.creationStage,
          stageStatus: novel.stageStatus,
          creationSourceType: preference.creationSourceType,
          hotspotReportId: preference.hotspotReportId,
          hotspotOpportunityId: preference.hotspotOpportunityId
        },
        reason: '创建小说草稿',
        impactSummary: '新建草稿，不影响既有创作资产。',
        sourceTaskId: null,
        requestId: input.context.requestId,
        ip: input.context.ip ?? null,
        userAgent: input.context.userAgent ?? null,
        createdAt: now
      };

      novels.unshift(novel);
      preferences.unshift(preference);
      operationLogs.unshift(operationLog);

      return { novel, preferences: preference, operationLog };
    },

    async list(query: ListNovelRecordsQuery): Promise<ListedNovelRecords> {
      const filtered = novels.filter((novel) => {
        if (novel.tenantId !== query.tenantId || novel.deletedAt) return false;
        if (query.lifecycleStatus && novel.lifecycleStatus !== query.lifecycleStatus) return false;
        if (query.creationStage && novel.creationStage !== query.creationStage) return false;
        if (query.videoReferenceStatus && novel.videoReferenceStatus !== query.videoReferenceStatus) return false;
        if (query.keyword) {
          const keyword = query.keyword.trim();
          return novel.title.includes(keyword) || novel.genres.some((genre) => genre.includes(keyword));
        }
        return true;
      });
      const start = (query.page - 1) * query.pageSize;

      return {
        items: filtered.slice(start, start + query.pageSize),
        total: filtered.length
      };
    },

    async findById(tenantId: string, novelId: string) {
      return novels.find((novel) => novel.tenantId === tenantId && novel.id === novelId && !novel.deletedAt) ?? null;
    },

    async findPreferencesByNovelId(tenantId: string, novelId: string) {
      return preferences.find((item) => item.tenantId === tenantId && item.novelId === novelId) ?? null;
    },

    async findActiveDirectionGenerationTask(tenantId: string, novelId: string) {
      return generationTasks.find(
        (task) =>
          task.tenantId === tenantId &&
          task.novelId === novelId &&
          task.taskType === 'novel_direction_generate' &&
          [TaskStatus.Queued, TaskStatus.Processing].includes(task.status)
      ) ?? null;
    },

    async findTaskById(tenantId: string, taskId: string) {
      return generationTasks.find((task) => task.tenantId === tenantId && task.id === taskId) ?? null;
    },

    async findTaskByIdempotencyToken(tenantId: string, taskType: string, idempotencyToken: string) {
      return generationTasks.find(
        (task) => task.tenantId === tenantId && task.taskType === taskType && task.idempotencyToken === idempotencyToken
      ) ?? null;
    },

    async listTaskEvents(tenantId: string, taskId: string) {
      return generationTaskEvents
        .filter((event) => event.tenantId === tenantId && event.taskId === taskId)
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    },

    async listRecentTasksForNovel(tenantId: string, novelId: string, limit: number) {
      return generationTasks
        .filter((task) => task.tenantId === tenantId && task.novelId === novelId)
        .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
        .slice(0, limit);
    },

    async assertProviderActionSupported(_taskType: string) {},

    async loadGenerationAuthority(input: LoadGenerationAuthorityInput): Promise<GenerationAuthoritySnapshot | null> {
      return loadAuthority(input);
    },

    async claimGenerationTask(input: ClaimGenerationTaskInput): Promise<ClaimGenerationTaskResult> {
      const authority = loadAuthority(input.authorityInput);
      if (!matchGenerationAuthority(input.authorityInput, input.expectedAuthoritySnapshotHash, authority).ok) {
        return { outcome: 'source_stale', task: null };
      }
      const idempotentTask = generationTasks.find(
        (task) =>
          task.tenantId === input.tenantId &&
          task.taskType === input.taskType &&
          task.idempotencyToken === input.idempotencyToken
      );
      if (idempotentTask) {
        return {
          outcome: idempotentTask.requestHash === input.requestHash ? 'reused' : 'idempotency_conflict',
          task: idempotentTask
        };
      }

      const activeTask = generationTasks.find(
        (task) => task.tenantId === input.tenantId && task.activeClaimKey === input.activeClaimKey
      );
      if (activeTask) return { outcome: 'active_conflict', task: activeTask };

      await input.afterClaimBarrier?.();
      const commitAuthority = loadAuthority(input.authorityInput);
      if (!matchGenerationAuthority(input.authorityInput, input.expectedAuthoritySnapshotHash, commitAuthority).ok) {
        return { outcome: 'source_stale', task: null };
      }

      const taskId = nextId('task');
      const task: GenerationTaskRecord = {
        id: taskId,
        tenantId: input.tenantId,
        novelId: input.novelId,
        taskType: input.taskType,
        objectType: input.objectType,
        objectId: input.objectId,
        status: TaskStatus.Processing,
        statusNote: '生成任务已创建，正在调用模型。',
        progress: 0,
        currentStep: '正在调用模型',
        triggerSource: 'manual',
        sourceVersionRefs: input.sourceVersionRefs,
        conflictScope: input.conflictScope,
        conflictKey: input.conflictKey,
        idempotencyToken: input.idempotencyToken,
        requestHash: input.requestHash,
        activeClaimKey: input.activeClaimKey,
        policyProfileVersionId: input.policyProfileVersionId,
        modelRoutingVersion: input.modelRoutingVersion,
        inputSummary: input.inputSummary,
        outputSummary: null,
        resultVersionIds: [],
        retryOfTaskId: null,
        failureCategory: null,
        errorCode: null,
        errorMessage: null,
        resultObjectType: null,
        resultObjectId: null,
        userAcceptedResult: false,
        cancelRequestedAt: null,
        cancelReason: null,
        startedAt: input.now,
        finishedAt: null,
        createdBy: input.context.userId,
        createdAt: input.now,
        updatedAt: input.now,
        metadata: { requestId: input.context.requestId },
        leaseOwnerId: null,
        leaseToken: null,
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
        retryCount: 0,
        maxRetries: 2,
        executionEnvelopeJson: input.executionEnvelopeJson,
        providerAttemptId: null,
        providerAttemptPhase: null,
        providerDispatchedAt: null,
        resultReceiptHash: null,
        rootTaskId: taskId,
        providerCallBudgetMax: 0,
        providerCallBudgetUsed: 0,
        durationDeadlineAt: input.now,
        costBudgetMicrosMax: 0,
        costBudgetMicrosUsed: 0
      };
      const event: GenerationTaskEventRecord = {
        id: nextId('event'),
        tenantId: input.tenantId,
        taskId: task.id,
        status: TaskStatus.Processing,
        eventType: 'task_claimed',
        message: '生成任务已创建，正在调用模型。',
        progress: 0,
        payload: { requestId: input.context.requestId },
        createdAt: input.now
      };

      generationTasks.unshift(task);
      generationTaskEvents.push(event);
      return { outcome: 'created', task };
    },

    async fenceGenerationAuthority(input: GenerationAuthorityFenceInput): Promise<GenerationAuthorityFenceResult> {
      const task = generationTasks.find((item) => item.id === input.taskId && item.tenantId === input.tenantId) ?? null;
      if (!task || task.status !== TaskStatus.Processing) {
        return { outcome: 'task_not_writable', task };
      }
      const authority = loadAuthority(input.authorityInput);
      if (!matchGenerationAuthority(input.authorityInput, input.expectedAuthoritySnapshotHash, authority).ok) {
        task.status = TaskStatus.Failed;
        task.statusNote = '生成来源已变化，模型结果已安全丢弃。';
        task.currentStep = '生成来源已变化';
        task.failureCategory = 'source_stale';
        task.errorCode = 'SOURCE_STALE';
        task.errorMessage = '生成来源已变化，请刷新后重试。';
        task.activeClaimKey = null;
        task.finishedAt = input.now;
        task.updatedAt = input.now;
        appendTaskEvent(task, {
          eventType: 'failed',
          message: task.errorMessage,
          progress: task.progress,
          requestId: input.context.requestId,
          createdAt: input.now
        });
        return { outcome: 'source_stale', task };
      }
      task.providerAttemptPhase = input.phase === 'provider_dispatch' ? 'provider_call_started' : 'finalizing';
      if (input.phase === 'provider_dispatch') task.providerDispatchedAt = input.now;
      task.updatedAt = input.now;
      return { outcome: 'authorized', task };
    },

    async leaseNextQueuedTask(workerId: string, leaseToken: string, now: Date, leaseUntil: Date) {
      if (leaseUntil.getTime() <= now.getTime()) return null;
      for (const task of generationTasks.filter((item) => item.status === TaskStatus.Queued).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
        try {
          validateExecutionEnvelopeV1_1ForTask(task);
        } catch {
          failUnsupportedQueuedTask(task, now);
          continue;
        }
        task.status = TaskStatus.Processing;
        task.statusNote = 'Worker 已领取任务。';
        task.currentStep = 'worker_leased';
        task.leaseOwnerId = workerId;
        task.leaseToken = leaseToken;
        task.leaseExpiresAt = leaseUntil;
        task.lastHeartbeatAt = now;
        task.providerAttemptId = nextId('attempt');
        task.providerAttemptPhase = 'leased';
        task.startedAt = task.startedAt ?? now;
        task.updatedAt = now;
        appendLeaseEvent(task, 'task_leased', 'Worker 已领取任务。', now);
        return task;
      }
      return null;
    },

    async heartbeatTask(tenantId: string, taskId: string, leaseOwnerId: string, leaseToken: string, now: Date, leaseUntil: Date) {
      const task = validLease(tenantId, taskId, leaseOwnerId, leaseToken, now);
      if (!task || leaseUntil.getTime() <= now.getTime()) return false;
      task.lastHeartbeatAt = now;
      task.leaseExpiresAt = leaseUntil;
      task.updatedAt = now;
      return true;
    },

    async finalizeLeasedTask(tenantId: string, taskId: string, leaseOwnerId: string, leaseToken: string, authoritativeNow: Date, result: HashedSafeResultReceipt) {
      const task = validLease(tenantId, taskId, leaseOwnerId, leaseToken, authoritativeNow);
      let verified: HashedSafeResultReceipt;
      try {
        verified = verifyHashedSafeResultReceipt(result);
      } catch {
        return { outcome: 'fenced' as const, task: null };
      }
      if (!task || task.resultReceiptHash || verified.receipt.taskId !== task.id || verified.receipt.attemptId !== task.providerAttemptId) return { outcome: 'fenced' as const, task: null };
      task.status = verified.receipt.status === 'completed' ? TaskStatus.Completed : TaskStatus.WaitingConfirmation;
      task.statusNote = 'Worker 结果已安全落账。';
      task.progress = 100;
      task.currentStep = 'finalized';
      task.resultObjectType = verified.receipt.resultObjectType;
      task.resultObjectId = verified.receipt.resultObjectId;
      task.resultVersionIds = verified.receipt.resultVersionIds;
      task.outputSummary = `${verified.receipt.safeSummary.resultCount} 个安全结果标识`;
      task.resultReceiptHash = verified.hash;
      task.providerAttemptPhase = 'finalizing';
      task.finishedAt = authoritativeNow;
      clearLease(task);
      task.updatedAt = authoritativeNow;
      appendLeaseEvent(task, 'task_finalized', 'Worker 结果已安全落账。', authoritativeNow);
      return { outcome: 'applied' as const, task };
    },

    async failLeasedTask(tenantId: string, taskId: string, leaseOwnerId: string, leaseToken: string, authoritativeNow: Date, failure: LeasedTaskFailure) {
      const task = validLease(tenantId, taskId, leaseOwnerId, leaseToken, authoritativeNow);
      if (!task) return { outcome: 'fenced' as const, task: null };
      applyLeaseFailure(task, failure, authoritativeNow);
      return { outcome: 'applied' as const, task };
    },

    async recoverExpiredTask(observed: ObservedTaskLease, authoritativeNow: Date) {
      const task = generationTasks.find((item) => item.tenantId === observed.tenantId && item.id === observed.taskId);
      if (!task || task.status !== TaskStatus.Processing || task.leaseOwnerId !== observed.leaseOwnerId || task.leaseToken !== observed.leaseToken
        || task.leaseExpiresAt?.getTime() !== observed.leaseExpiresAt.getTime() || task.leaseExpiresAt.getTime() > authoritativeNow.getTime()) {
        return { outcome: 'not_recovered' as const, task: null };
      }
      try {
        validateExecutionEnvelopeV1_1ForTask(task);
      } catch {
        return { outcome: 'not_recovered' as const, task: null };
      }
      const dispatched = task.providerDispatchedAt !== null;
      applyLeaseFailure(task, {
        failureCategory: dispatched ? 'provider_outcome_unknown' : 'worker_lease_expired',
        errorCode: dispatched ? 'PROVIDER_OUTCOME_UNKNOWN' : 'WORKER_LEASE_EXPIRED',
        errorMessage: dispatched ? 'Provider outcome is unknown.' : 'Worker lease expired.',
        statusNote: dispatched ? 'Provider 结果未知，禁止自动重放。' : 'Worker 租约已过期。'
      }, authoritativeNow, 'task_recovered');
      return { outcome: 'recovered' as const, task };
    },

    async findActiveTaskByConflict(tenantId: string, conflictScope: string, conflictKey: string) {
      return generationTasks.find(
        (task) =>
          task.tenantId === tenantId &&
          task.conflictScope === conflictScope &&
          task.conflictKey === conflictKey &&
          [TaskStatus.Queued, TaskStatus.Processing].includes(task.status)
      ) ?? null;
    },

    async listDirectionVersions(tenantId: string, novelId: string) {
      return creativeVersions
        .filter((version) => version.tenantId === tenantId && version.novelId === novelId && version.objectType === 'direction')
        .sort((left, right) => right.versionNo - left.versionNo);
    },

    async listStructureVersions(tenantId: string, novelId: string) {
      return creativeVersions
        .filter(
          (version) =>
            version.tenantId === tenantId &&
            version.novelId === novelId &&
            ['setting', 'outline', 'stage_outline', 'chapter_plan'].includes(version.objectType)
        )
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.versionNo - left.versionNo);
    },

    async listStructureVersionsByType(tenantId: string, novelId: string, objectType) {
      return creativeVersions
        .filter((version) => version.tenantId === tenantId && version.novelId === novelId && version.objectType === objectType)
        .sort((left, right) => right.versionNo - left.versionNo);
    },

    async listNovelChapters(tenantId: string, novelId: string) {
      return chapters
        .filter((chapter) => chapter.tenantId === tenantId && chapter.novelId === novelId && !chapter.deletedAt)
        .sort((left, right) => left.chapterNo - right.chapterNo);
    },

    async createDirectionCandidates(input: DirectionCreationInput): Promise<CreatedDirectionCandidatesRecord> {
      assertNoActiveAuthorityClaim(input.context.tenantId, input.novel.id, input.task?.id);
      const task = input.task
        ? requireClaimedTask(input.task, input.context.tenantId)
        : createTask({ input, taskId: nextId('task'), status: TaskStatus.WaitingConfirmation, progress: 100, currentStep: getDirectionRevisionTaskStep(input.taskType) });
      const versions = input.candidates.map((candidate, index) =>
        createCreativeVersion({
          id: nextId('cv'),
          input,
          candidate,
          taskId: task.id,
          versionNo: nextDirectionVersionNo(input.novel.tenantId, input.novel.id) + index
        })
      );
      task.resultVersionIds = versions.map((version) => version.id);
      task.resultObjectType = 'creative_version';
      task.resultObjectId = versions[0]?.id ?? null;
      task.outputSummary = `${versions.length} 个方向候选已生成，等待用户采用。`;
      task.status = TaskStatus.WaitingConfirmation;
      task.statusNote = '模型服务已生成方向候选，等待用户确认。';
      task.progress = 100;
      task.currentStep = '方向候选已生成，等待选择';
      task.updatedAt = input.now;
      task.activeClaimKey = null;

      if (!generationTasks.some((item) => item.id === task.id)) generationTasks.unshift(task);
      appendTaskProgressEvents(task, input.context.requestId, input.now);
      creativeVersions.unshift(...versions);
      mutateNovel(input.novel.id, {
        creationStage: NovelCreationStage.Direction,
        stageStatus: StageStatus.WaitingUser,
        updatedBy: input.context.userId,
        updatedAt: input.now
      });
      const novel = cloneNovel(input.novel.id);

      return { novel, task, versions };
    },

    async createDirectionRevision(input: DirectionRevisionInput): Promise<CreatedDirectionRevisionRecord> {
      assertNoActiveAuthorityClaim(input.context.tenantId, input.novel.id, input.task?.id);
      const task = input.task
        ? requireClaimedTask(input.task, input.context.tenantId)
        : createTask({ input, taskId: nextId('task'), status: TaskStatus.WaitingConfirmation, progress: 100, currentStep: getDirectionRevisionTaskStep(input.taskType) });
      const version = createCreativeVersion({
        id: nextId('cv'),
        input,
        candidate: input.candidate,
        taskId: task.id,
        versionNo: nextDirectionVersionNo(input.novel.tenantId, input.novel.id),
        sourceVersionRefs: {
          sourceVersionIds: input.sourceVersionIds
        }
      });
      task.resultVersionIds = [version.id];
      task.resultObjectType = 'creative_version';
      task.resultObjectId = version.id;
      task.outputSummary = getDirectionRevisionOutputSummary(input.taskType);
      task.status = TaskStatus.WaitingConfirmation;
      task.statusNote = '模型服务已生成方向候选，等待用户确认。';
      task.progress = 100;
      task.currentStep = getDirectionRevisionTaskStep(input.taskType);
      task.updatedAt = input.now;
      task.activeClaimKey = null;

      if (!generationTasks.some((item) => item.id === task.id)) generationTasks.unshift(task);
      appendTaskProgressEvents(task, input.context.requestId, input.now);
      creativeVersions.unshift(version);
      mutateNovel(input.novel.id, {
        creationStage: NovelCreationStage.Direction,
        stageStatus: StageStatus.WaitingUser,
        updatedBy: input.context.userId,
        updatedAt: input.now
      });
      const novel = cloneNovel(input.novel.id);

      return { novel, task, version };
    },

    async findDirectionVersionById(tenantId: string, novelId: string, versionId: string) {
      return creativeVersions.find(
        (version) => version.tenantId === tenantId && version.novelId === novelId && version.objectType === 'direction' && version.id === versionId
      ) ?? null;
    },

    async adoptDirection(input: DirectionAdoptionInput): Promise<AdoptedDirectionRecord> {
      assertNoActiveAuthorityClaim(input.context.tenantId, input.novel.id);
      const currentVersionIdBefore = input.novel.currentDirectionVersionId;
      const decisionRecord: AssetDecisionRecord = {
        id: nextId('decision'),
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
        impactSummary: '当前方向切换为正式方向，小说进入设定阶段；其他方向候选转为历史。',
        pageVersionSnapshot: input.pageVersionSnapshot ?? null,
        sourceTaskId: input.candidate.sourceTaskId,
        createdBy: input.context.userId,
        createdAt: input.now
      };

      for (const version of creativeVersions) {
        if (version.tenantId !== input.context.tenantId || version.novelId !== input.novel.id || version.objectType !== 'direction') continue;
        if (version.id === input.candidate.id) {
          version.status = VersionStatus.Current;
          version.decisionRecordId = decisionRecord.id;
        } else if (version.status === VersionStatus.Candidate || version.status === VersionStatus.Current) {
          version.status = VersionStatus.Historical;
        }
      }

      mutateNovel(input.novel.id, {
        currentDirectionVersionId: input.candidate.id,
        creationStage: NovelCreationStage.Setting,
        stageStatus: StageStatus.NotStarted,
        updatedBy: input.context.userId,
        updatedAt: input.now
      });

      for (const task of generationTasks) {
        if (
          task.tenantId === input.context.tenantId &&
          task.novelId === input.novel.id &&
          task.objectType === 'direction' &&
          task.status === TaskStatus.WaitingConfirmation
        ) {
          task.status = TaskStatus.Completed;
          task.activeClaimKey = null;
          task.statusNote = '用户已采用方向';
          task.currentStep = '方向已采用';
          task.userAcceptedResult = true;
          task.finishedAt = input.now;
          task.updatedAt = input.now;
          appendTaskEvent(task, {
            eventType: 'task_completed',
            message: '方向已采用，任务完成。',
            progress: 100,
            requestId: input.context.requestId,
            createdAt: input.now
          });
        }
      }

      const operationLog: OperationLogRecord = {
        id: nextId('oplog'),
        tenantId: input.context.tenantId,
        userId: input.context.userId,
        novelId: input.novel.id,
        action: 'adopt_direction',
        objectType: 'direction',
        objectId: input.candidate.id,
        beforeSnapshot: {
          currentDirectionVersionId: currentVersionIdBefore,
          creationStage: input.novel.creationStage,
          stageStatus: input.novel.stageStatus
        },
        afterSnapshot: {
          currentDirectionVersionId: input.candidate.id,
          creationStage: NovelCreationStage.Setting,
          stageStatus: StageStatus.NotStarted
        },
        reason: input.reason,
        impactSummary: decisionRecord.impactSummary,
        sourceTaskId: input.candidate.sourceTaskId,
        requestId: input.context.requestId,
        ip: input.context.ip ?? null,
        userAgent: input.context.userAgent ?? null,
        createdAt: input.now
      };

      assetDecisionRecords.unshift(decisionRecord);
      operationLogs.unshift(operationLog);

      return {
        novel: cloneNovel(input.novel.id),
        currentDirection: creativeVersions.find((version) => version.id === input.candidate.id)!,
        versions: await this.listDirectionVersions(input.context.tenantId, input.novel.id),
        decisionRecord,
        operationLog
      };
    },

    async createStructureGenerationTask(input: StructureGenerationTaskCreationInput): Promise<GenerationTaskRecord> {
      const task = createTask({
        input,
        objectType: input.objectType,
        taskId: nextId('task'),
        status: TaskStatus.Processing,
        progress: 0,
        currentStep: `${getStructureObjectText(input.objectType)}正在生成中`
      });
      task.statusNote = '正在调用模型生成内容，可能需要 1-3 分钟，可以稍后回来查看。';

      generationTasks.unshift(task);
      appendTaskEvent(task, {
        eventType: 'calling_model',
        message: task.statusNote,
        progress: 0,
        requestId: input.context.requestId,
        createdAt: input.now
      });

      return task;
    },

    async createStructureCandidate(input: StructureCreationInput): Promise<CreatedStructureAssetRecord> {
      assertNoActiveAuthorityClaim(input.context.tenantId, input.novel.id, input.task?.id);
      const effectiveTask = input.task
        ? requireClaimedTask(input.task, input.context.tenantId)
        : createTask({ input, objectType: input.asset.objectType, taskId: nextId('task'), status: TaskStatus.WaitingConfirmation, progress: 100, currentStep: getStructureGenerateStep(input.asset.objectType) });
      const version = createStructureVersion({
        id: nextId('cv'),
        input,
        taskId: effectiveTask.id,
        versionNo: nextVersionNo(input.novel.tenantId, input.novel.id, input.asset.objectType)
      });
      effectiveTask.status = TaskStatus.WaitingConfirmation;
      effectiveTask.statusNote = `模型服务已生成 ${input.asset.objectType} 候选`;
      effectiveTask.progress = 100;
      effectiveTask.currentStep = getStructureGenerateStep(input.asset.objectType);
      effectiveTask.resultVersionIds = [version.id];
      effectiveTask.resultObjectType = 'creative_version';
      effectiveTask.resultObjectId = version.id;
      effectiveTask.outputSummary = `${getStructureObjectText(input.asset.objectType)}候选已生成，等待用户采用。`;
      effectiveTask.updatedAt = input.now;
      effectiveTask.activeClaimKey = null;

      if (!generationTasks.some((item) => item.id === effectiveTask.id)) generationTasks.unshift(effectiveTask);
      appendTaskProgressEvents(effectiveTask, input.context.requestId, input.now);
      creativeVersions.unshift(version);
      mutateNovel(input.novel.id, {
        creationStage: getGenerationStage(input.asset.objectType),
        stageStatus: StageStatus.WaitingUser,
        updatedBy: input.context.userId,
        updatedAt: input.now
      });

      return { novel: cloneNovel(input.novel.id), task: effectiveTask, version };
    },

    async failTask(input: TaskFailureInput): Promise<GenerationTaskRecord> {
      const task = generationTasks.find((item) => item.id === input.task.id && item.tenantId === input.context.tenantId);
      if (!task) return input.task;
      if (task.status === TaskStatus.Cancelled) return task;

      task.status = TaskStatus.Failed;
      task.statusNote = input.statusNote ?? '模型生成失败，请查看原因后重试。';
      task.progress = Math.max(task.progress, 0);
      task.currentStep = '生成失败';
      task.failureCategory = input.failureCategory ?? 'model_generation_failed';
      task.errorCode = input.errorCode;
      task.errorMessage = input.errorMessage;
      task.finishedAt = input.now;
      task.updatedAt = input.now;
      task.activeClaimKey = null;
      appendTaskEvent(task, {
        eventType: 'failed',
        message: input.errorMessage,
        progress: task.progress,
        requestId: input.context.requestId,
        createdAt: input.now
      });

      if (task.taskType === 'trial_followup_generate' && task.objectId) {
        const trialRun = trialRuns.find((run) => run.tenantId === input.context.tenantId && run.id === task.objectId);
        if (trialRun) {
          trialRun.status = 'followup_failed';
          trialRun.updatedAt = input.now;
          trialRun.metadata = {
            ...toMutableMetadata(trialRun.metadata),
            currentStep: '继续试写失败',
            blockingReason: input.errorMessage
          };
          mutateNovel(trialRun.novelId, {
            creationStage: NovelCreationStage.Trial,
            stageStatus: StageStatus.Failed,
            updatedBy: input.context.userId,
            updatedAt: input.now
          });
        }
      }

      if (task.taskType === 'body_batch_generate' && task.novelId) {
        mutateNovel(task.novelId, {
          creationStage: NovelCreationStage.Body,
          stageStatus: StageStatus.Failed,
          updatedBy: input.context.userId,
          updatedAt: input.now
        });
      }

      return task;
    },

    async findStructureVersionById(tenantId: string, novelId: string, objectType, versionId: string) {
      return creativeVersions.find(
        (version) => version.tenantId === tenantId && version.novelId === novelId && version.objectType === objectType && version.id === versionId
      ) ?? null;
    },

    async adoptStructureAsset(input: StructureAdoptionInput): Promise<AdoptedStructureAssetRecord> {
      assertNoActiveAuthorityClaim(input.context.tenantId, input.novel.id);
      const currentVersionIdBefore = getCurrentVersionId(input.novel, input.objectType);
      const downstream = getDownstreamObjectTypes(input.objectType);
      const decisionRecord: AssetDecisionRecord = {
        id: nextId('decision'),
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
            ? `采用 ${input.objectType} 后，${downstream.join('、')} 候选或当前版本已标记为过期。`
            : '采用章节目录后刷新章节计划，不生成正文。',
        pageVersionSnapshot: input.pageVersionSnapshot ?? null,
        sourceTaskId: input.candidate.sourceTaskId,
        createdBy: input.context.userId,
        createdAt: input.now
      };

      for (const version of creativeVersions) {
        if (version.tenantId !== input.context.tenantId || version.novelId !== input.novel.id) continue;

        if (version.objectType === input.objectType) {
          if (version.id === input.candidate.id) {
            version.status = VersionStatus.Current;
            version.staleLevel = StaleLevel.None;
            version.decisionRecordId = decisionRecord.id;
          } else if (version.status === VersionStatus.Candidate || version.status === VersionStatus.Current) {
            version.status = VersionStatus.Historical;
          }
        }

        if (downstream.includes(version.objectType) && (version.status === VersionStatus.Candidate || version.status === VersionStatus.Current)) {
          version.status = VersionStatus.Stale;
          version.staleLevel = StaleLevel.HardStale;
        }
      }

      const patch = createNovelPatchAfterStructureAdoption(input);
      mutateNovel(input.novel.id, patch);

      for (const task of generationTasks) {
        if (
          task.tenantId === input.context.tenantId &&
          task.novelId === input.novel.id &&
          task.objectType === input.objectType &&
          task.status === TaskStatus.WaitingConfirmation
        ) {
          task.status = TaskStatus.Completed;
          task.activeClaimKey = null;
          task.statusNote = '用户已采用结构资产';
          task.currentStep = getStructureAdoptStep(input.objectType);
          task.userAcceptedResult = true;
          task.finishedAt = input.now;
          task.updatedAt = input.now;
          appendTaskEvent(task, {
            eventType: 'task_completed',
            message: `${getStructureObjectText(input.objectType)}已采用，任务完成。`,
            progress: 100,
            requestId: input.context.requestId,
            createdAt: input.now
          });
        }
      }

      if (input.objectType === 'chapter_plan') {
        refreshChapters(input);
      }

      const operationLog: OperationLogRecord = {
        id: nextId('oplog'),
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
          creationStage: patch.creationStage,
          stageStatus: patch.stageStatus
        },
        reason: input.reason,
        impactSummary: decisionRecord.impactSummary,
        sourceTaskId: input.candidate.sourceTaskId,
        requestId: input.context.requestId,
        ip: input.context.ip ?? null,
        userAgent: input.context.userAgent ?? null,
        createdAt: input.now
      };

      assetDecisionRecords.unshift(decisionRecord);
      operationLogs.unshift(operationLog);

      return {
        novel: cloneNovel(input.novel.id),
        currentAsset: creativeVersions.find((version) => version.id === input.candidate.id)!,
        versions: await this.listStructureVersions(input.context.tenantId, input.novel.id),
        chapters: await this.listNovelChapters(input.context.tenantId, input.novel.id),
        decisionRecord,
        operationLog
      };
    },

    async findLatestTrialRun(tenantId: string, novelId: string) {
      return trialRuns
        .filter((run) => run.tenantId === tenantId && run.novelId === novelId)
        .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0] ?? null;
    },

    async findTrialRunById(tenantId: string, novelId: string, trialRunId: string) {
      return trialRuns.find((run) => run.tenantId === tenantId && run.novelId === novelId && run.id === trialRunId) ?? null;
    },

    async listTrialChapterResults(tenantId: string, trialRunId: string) {
      return trialChapterResults
        .filter((result) => result.tenantId === tenantId && result.trialRunId === trialRunId)
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    },

    async listChapterContentVersions(tenantId: string, novelId: string, chapterId: string) {
      return chapterContentVersions
        .filter((version) => version.tenantId === tenantId && version.novelId === novelId && version.chapterId === chapterId)
        .sort((left, right) => right.versionNo - left.versionNo);
    },

    async findChapterContentVersionById(tenantId: string, novelId: string, versionId: string) {
      return chapterContentVersions.find((version) => version.tenantId === tenantId && version.novelId === novelId && version.id === versionId) ?? null;
    },

    async findChapterById(tenantId: string, novelId: string, chapterId: string) {
      return chapters.find((chapter) => chapter.tenantId === tenantId && chapter.novelId === novelId && chapter.id === chapterId && !chapter.deletedAt) ?? null;
    },

    async findFeatureCardById(tenantId: string, featureCardId: string) {
      return chapterFeatureCards.find((card) => card.tenantId === tenantId && card.id === featureCardId) ?? null;
    },

    async findReviewReportById(tenantId: string, reviewReportId: string) {
      return reviewReports.find((report) => report.tenantId === tenantId && report.id === reviewReportId) ?? null;
    },

    async findLatestFullReview(tenantId: string, novelId: string) {
      const reviewReport = reviewReports
        .filter((report) => report.tenantId === tenantId && report.novelId === novelId && report.reviewLevel === 'full_novel')
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
      if (!reviewReport) return null;
      const gate = fullReviewGates.find((item) => item.tenantId === tenantId && item.novelId === novelId && item.reviewReportId === reviewReport.id) ?? null;

      return gate ? { reviewReport, gate } : null;
    },

    async findFullReviewGateById(tenantId: string, novelId: string, gateId: string) {
      return fullReviewGates.find((gate) => gate.tenantId === tenantId && gate.novelId === novelId && gate.id === gateId) ?? null;
    },

    async findFullReviewByIdempotencyKey(tenantId: string, novelId: string, idempotencyKey: string) {
      const task = generationTasks.find(
        (item) =>
          item.tenantId === tenantId &&
          item.novelId === novelId &&
          item.taskType === 'novel_full_review' &&
          item.idempotencyToken === idempotencyKey
      );
      if (!task?.resultObjectId) return null;
      const reviewReport = reviewReports.find((report) => report.tenantId === tenantId && report.id === task.resultObjectId) ?? null;
      const gate = reviewReport ? fullReviewGates.find((item) => item.tenantId === tenantId && item.novelId === novelId && item.reviewReportId === reviewReport.id) ?? null : null;

      return reviewReport && gate ? { task, reviewReport, gate } : null;
    },

    async findCompletionDecisionById(tenantId: string, novelId: string, decisionId: string) {
      return completionDecisions.find((decision) => decision.tenantId === tenantId && decision.novelId === novelId && decision.id === decisionId) ?? null;
    },

    async findLatestCompletionDecision(tenantId: string, novelId: string) {
      return completionDecisions
        .filter((decision) => decision.tenantId === tenantId && decision.novelId === novelId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
    },

    async findCompletionDecisionByIdempotencyKey(tenantId: string, novelId: string, idempotencyKey: string) {
      return completionDecisions.find((decision) => decision.tenantId === tenantId && decision.novelId === novelId && decision.idempotencyKey === idempotencyKey) ?? null;
    },

    async findLatestVideoReadinessCheck(tenantId: string, novelId: string) {
      return videoReadinessChecks
        .filter((check) => check.tenantId === tenantId && check.novelId === novelId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
    },

    async findVideoReadinessCheckById(tenantId: string, novelId: string, checkId: string) {
      return videoReadinessChecks.find((check) => check.tenantId === tenantId && check.novelId === novelId && check.id === checkId) ?? null;
    },

    async findLatestVideoReadinessSnapshot(tenantId: string, novelId: string) {
      return videoReadinessSnapshots
        .filter((snapshot) => snapshot.tenantId === tenantId && snapshot.novelId === novelId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
    },

    async findVideoReadinessSnapshotByIdempotencyKey(tenantId: string, novelId: string, idempotencyKey: string) {
      return videoReadinessSnapshots.find((snapshot) => snapshot.tenantId === tenantId && snapshot.novelId === novelId && snapshot.idempotencyKey === idempotencyKey) ?? null;
    },

    async findBodyStrategySnapshot(tenantId: string, novelId: string) {
      return creativeVersions.find(
        (version) =>
          version.tenantId === tenantId &&
          version.novelId === novelId &&
          version.objectType === 'body_strategy_snapshot' &&
          version.status === VersionStatus.Current
      ) ?? null;
    },

    async createTrialChapterOneCandidates(input: TrialCandidateCreationInput): Promise<CreatedTrialCandidatesRecord> {
      assertNoActiveAuthorityClaim(input.context.tenantId, input.novel.id, input.task.id);
      const trialRunId = nextId('trial');
      const task = requireClaimedTask(input.task, input.context.tenantId);
      const versions = input.candidates.map((candidate) => {
        const version: ChapterContentVersionRecord = {
          id: nextId('ccv'),
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          chapterId: candidate.chapterId,
          versionNo: nextChapterContentVersionNo(input.context.tenantId, input.novel.id, candidate.chapterId),
          status: VersionStatus.Candidate,
          staleLevel: StaleLevel.None,
          sourceType: 'mock_ai',
          sourceTaskId: task.id,
          sourceVersionRefs: input.sourceVersionRefs,
          rewriteReason: input.changeReason,
          content: candidate.content,
          wordCount: countWords(candidate.content),
          summary: candidate.summary,
          reviewScore: candidate.scoring.totalScore,
          decisionRecordId: null,
          createdBy: input.context.userId,
          createdAt: input.now,
          metadata: {
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
          }
        };

        return version;
      });
      task.resultVersionIds = versions.map((version) => version.id);
      task.resultObjectType = 'trial_run';
      task.resultObjectId = trialRunId;
      task.outputSummary = `${versions.length} 个第1章试写候选已生成，等待用户选择。`;
      task.status = TaskStatus.WaitingConfirmation;
      task.statusNote = '模型服务已生成试写结果，等待用户确认。';
      task.progress = 100;
      task.currentStep = '第1章候选已生成，等待选择';
      task.updatedAt = input.now;
      task.activeClaimKey = null;
      const trialRun: TrialRunRecord = {
        id: trialRunId,
        tenantId: input.context.tenantId,
        novelId: input.novel.id,
        chapterPlanVersionId: input.novel.currentChapterPlanVersionId,
        trialChapterCount: input.chapterCount,
        status: 'waiting_chapter1_selection',
        totalScore: null,
        trialResult: null,
        reviewReportId: null,
        policyProfileVersionId: input.novel.policyProfileVersionId,
        sourceTaskId: task.id,
        confirmedAt: null,
        confirmedBy: null,
        forceReason: null,
        createdAt: input.now,
        updatedAt: input.now,
        metadata: {
          selectedChapterOneCandidateId: null,
          currentStep: '选择第1章候选后继续生成第2-3章',
          blockingReason: null,
          sourceVersionRefs: input.sourceVersionRefs
        }
      };

      appendTaskProgressEvents(task, input.context.requestId, input.now);
      trialRuns.unshift(trialRun);
      chapterContentVersions.unshift(...versions);
      mutateNovel(input.novel.id, {
        creationStage: NovelCreationStage.Trial,
        stageStatus: StageStatus.WaitingUser,
        updatedBy: input.context.userId,
        updatedAt: input.now
      });

      return {
        novel: cloneNovel(input.novel.id),
        task,
        trialRun,
        chapterOneCandidates: versions
      };
    },

    async createTrialFollowupTask(input: TrialFollowupTaskCreationInput): Promise<CreatedTrialFollowupTaskRecord> {
      const selectedMetadata = toMutableMetadata(input.selectedCandidate.metadata);
      selectedMetadata.trialStatus = 'selected_for_trial';
      selectedMetadata.isSelected = true;
      selectedMetadata.followupStatus = 'generating';
      input.selectedCandidate.status = VersionStatus.Current;
      input.selectedCandidate.metadata = selectedMetadata;

      for (const version of chapterContentVersions) {
        if (
          version.tenantId === input.context.tenantId &&
          version.novelId === input.novel.id &&
          version.chapterId === input.selectedCandidate.chapterId &&
          version.id !== input.selectedCandidate.id &&
          getMetadataString(version.metadata, 'trialRunId') === input.trialRun.id &&
          version.status === VersionStatus.Candidate
        ) {
          const metadata = toMutableMetadata(version.metadata);
          metadata.trialStatus = 'historical';
          metadata.isSelected = false;
          version.status = VersionStatus.Historical;
          version.metadata = metadata;
        }
      }

      const existingTask = generationTasks.find((task) => task.id === input.trialRun.sourceTaskId);
      if (existingTask && existingTask.status === TaskStatus.WaitingConfirmation) {
        existingTask.status = TaskStatus.Completed;
        existingTask.activeClaimKey = null;
        existingTask.statusNote = '用户已选择第1章候选';
        existingTask.currentStep = '第1章候选已选择，继续试写';
        existingTask.userAcceptedResult = true;
        existingTask.finishedAt = input.now;
        existingTask.updatedAt = input.now;
        appendTaskEvent(existingTask, {
          eventType: 'task_completed',
          message: '用户已选择第1章候选，任务完成。',
          progress: 100,
          requestId: input.context.requestId,
          createdAt: input.now
        });
      }

      const sourceVersionRefs = createTrialFollowupSourceVersionRefs(input.novel, input.selectedCandidate.id);
      const task = requireClaimedTask(input.task, input.context.tenantId);
      task.status = TaskStatus.Processing;
      task.statusNote = '正在调用模型继续试写第2-3章并生成试写总评，可能需要 1-3 分钟，可以稍后回来查看。';
      task.progress = 18;
      task.outputSummary = null;
      task.resultObjectType = 'trial_run';
      task.resultObjectId = input.trialRun.id;

      appendTaskEvent(task, {
        eventType: 'calling_model',
        message: task.statusNote,
        progress: task.progress,
        requestId: input.context.requestId,
        createdAt: input.now
      });

      input.trialRun.status = 'followup_generating';
      input.trialRun.sourceTaskId = task.id;
      input.trialRun.updatedAt = input.now;
      input.trialRun.metadata = {
        ...toMutableMetadata(input.trialRun.metadata),
        selectedChapterOneCandidateId: input.selectedCandidate.id,
        currentStep: '已选择第1章候选，正在生成第2-3章和试写总评',
        blockingReason: null,
        sourceVersionRefs
      };

      mutateNovel(input.novel.id, {
        creationStage: NovelCreationStage.Trial,
        stageStatus: StageStatus.Processing,
        updatedBy: input.context.userId,
        updatedAt: input.now
      });

      return {
        novel: cloneNovel(input.novel.id),
        trialRun: input.trialRun,
        task
      };
    },

    async selectTrialChapterOneAndGenerateFollowup(input: TrialFollowupGenerationInput): Promise<GeneratedTrialFollowupRecord> {
      assertNoActiveAuthorityClaim(input.context.tenantId, input.novel.id, input.task.id);
      const selectedMetadata = toMutableMetadata(input.selectedCandidate.metadata);
      selectedMetadata.trialStatus = 'selected_for_trial';
      selectedMetadata.isSelected = true;
      selectedMetadata.followupStatus = 'completed';
      input.selectedCandidate.status = VersionStatus.Current;
      input.selectedCandidate.metadata = selectedMetadata;

      for (const version of chapterContentVersions) {
        if (
          version.tenantId === input.context.tenantId &&
          version.novelId === input.novel.id &&
          version.chapterId === input.selectedCandidate.chapterId &&
          version.id !== input.selectedCandidate.id &&
          getMetadataString(version.metadata, 'trialRunId') === input.trialRun.id &&
          version.status === VersionStatus.Candidate
        ) {
          const metadata = toMutableMetadata(version.metadata);
          metadata.trialStatus = 'historical';
          metadata.isSelected = false;
          version.status = VersionStatus.Historical;
          version.metadata = metadata;
        }
      }

      const existingTask = generationTasks.find((task) => task.id === input.trialRun.sourceTaskId);
      if (existingTask && existingTask.status === TaskStatus.WaitingConfirmation) {
        existingTask.status = TaskStatus.Completed;
        existingTask.activeClaimKey = null;
        existingTask.statusNote = '用户已选择第1章候选';
        existingTask.currentStep = '第1章候选已选择，继续试写';
        existingTask.userAcceptedResult = true;
        existingTask.finishedAt = input.now;
        existingTask.updatedAt = input.now;
        appendTaskEvent(existingTask, {
          eventType: 'task_completed',
          message: '用户已选择第1章候选，任务完成。',
          progress: 100,
          requestId: input.context.requestId,
          createdAt: input.now
        });
      }

      const task = generationTasks.find((item) => item.id === input.task.id) ?? input.task;
      const sourceVersionRefs = createTrialFollowupSourceVersionRefs(input.novel, input.selectedCandidate.id);
      task.status = TaskStatus.WaitingConfirmation;
      task.statusNote = '模型服务已生成试写结果，等待用户确认。';
      task.progress = 100;
      task.currentStep = input.review.trialResult === 'blocked' ? '第2章硬门槛未通过，试写暂停' : '前三章试写总评已生成，等待确认';
      task.updatedAt = input.now;
      task.activeClaimKey = null;
      const createdContentVersions: ChapterContentVersionRecord[] = [];
      const createdFeatureCards: ChapterFeatureCardRecord[] = [];
      const createdReviewReports: ReviewReportRecord[] = [];
      const createdResults: TrialChapterResultRecord[] = [];

      for (const chapterDraft of input.chapters) {
        const contentVersion =
          chapterDraft.chapter.chapterNo === 1
            ? input.selectedCandidate
            : createChapterContentVersion({
                input,
                taskId: task.id,
                chapterDraft,
                sourceVersionRefs
              });
        if (chapterDraft.chapter.chapterNo !== 1) {
          createdContentVersions.push(contentVersion);
          chapterContentVersions.unshift(contentVersion);
        }

        const featureCard = createChapterFeatureCard({
          input,
          taskId: task.id,
          chapterDraft
        });
        const reviewReport = createChapterReviewReport({
          input,
          taskId: task.id,
          chapterDraft,
          contentVersionId: contentVersion.id
        });
        const result: TrialChapterResultRecord = {
          id: nextId('trialresult'),
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
        };

        chapterFeatureCards.unshift(featureCard);
        reviewReports.unshift(reviewReport);
        trialChapterResults.push(result);
        createdFeatureCards.push(featureCard);
        createdReviewReports.push(reviewReport);
        createdResults.push(result);

        const chapter = chapters.find((item) => item.id === chapterDraft.chapter.id);
        if (chapter) {
          chapter.currentContentVersionId = contentVersion.id;
          chapter.currentFeatureCardVersionId = featureCard.id;
          chapter.currentReviewReportId = reviewReport.id;
          chapter.lastGenerationTaskId = task.id;
          chapter.wordCount = contentVersion.wordCount;
          chapter.mainStatus = chapterDraft.hardFailed ? 'blocked' : 'trial_written';
          chapter.statusNote = chapterDraft.hardFailed ? '试写硬门槛未通过，暂停继续生成。' : '试写正文已生成，等待总评确认。';
          chapter.updatedAt = input.now;
        }
      }

      const trialReviewReport = createTrialReviewReport({
        input,
        taskId: task.id
      });
      reviewReports.unshift(trialReviewReport);
      createdReviewReports.push(trialReviewReport);
      task.resultVersionIds = [input.selectedCandidate.id, ...createdContentVersions.map((version) => version.id)];
      task.resultObjectType = 'trial_run';
      task.resultObjectId = input.trialRun.id;
      task.outputSummary = input.review.summary;
      appendTaskProgressEvents(task, input.context.requestId, input.now);

      input.trialRun.status = input.review.trialResult === 'blocked' ? 'blocked' : 'review_ready';
      input.trialRun.totalScore = input.review.totalScore;
      input.trialRun.trialResult = input.review.trialResult;
      input.trialRun.reviewReportId = trialReviewReport.id;
      input.trialRun.sourceTaskId = task.id;
      input.trialRun.updatedAt = input.now;
      input.trialRun.metadata = {
        ...toMutableMetadata(input.trialRun.metadata),
        selectedChapterOneCandidateId: input.selectedCandidate.id,
        currentStep: input.review.trialResult === 'blocked' ? '处理第2章硬失败' : '确认试写总评并生成正文策略快照',
        blockingReason: input.review.trialResult === 'blocked' ? '第2章硬门槛未通过，不能继续第3章。' : null,
        requiresRiskConfirmation: input.review.requiresRiskConfirmation
      };

      mutateNovel(input.novel.id, {
        creationStage: NovelCreationStage.Trial,
        stageStatus: input.review.trialResult === 'blocked' ? StageStatus.Blocked : StageStatus.WaitingUser,
        updatedBy: input.context.userId,
        updatedAt: input.now
      });

      const operationLog: OperationLogRecord = {
        id: nextId('oplog'),
        tenantId: input.context.tenantId,
        userId: input.context.userId,
        novelId: input.novel.id,
        action: 'select_trial_chapter1_candidate',
        objectType: 'trial_run',
        objectId: input.trialRun.id,
        beforeSnapshot: {
          selectedChapterOneCandidateId: null
        },
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
      };
      operationLogs.unshift(operationLog);

      return {
        novel: cloneNovel(input.novel.id),
        trialRun: input.trialRun,
        task,
        chapterResults: createdResults,
        contentVersions: [input.selectedCandidate, ...createdContentVersions],
        featureCards: createdFeatureCards,
        reviewReports: createdReviewReports
      };
    },

    async confirmTrial(input: TrialConfirmationInput): Promise<ConfirmedTrialRecord> {
      assertNoActiveAuthorityClaim(input.context.tenantId, input.novel.id);
      const isReturnUpstream = input.decision === 'return_upstream';
      let snapshot: CreativeVersionRecord | null = null;
      const snapshotVersionId = isReturnUpstream ? null : nextId('cv');

      if (!isReturnUpstream) {
        for (const version of creativeVersions) {
          if (version.tenantId === input.context.tenantId && version.novelId === input.novel.id && version.objectType === 'body_strategy_snapshot' && version.status === VersionStatus.Current) {
            version.status = VersionStatus.Historical;
          }
        }

        snapshot = {
          id: snapshotVersionId!,
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          objectType: 'body_strategy_snapshot',
          objectId: 'body_strategy_snapshot',
          versionNo: nextVersionNo(input.context.tenantId, input.novel.id, 'body_strategy_snapshot'),
          status: VersionStatus.Current,
          staleLevel: StaleLevel.None,
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
          content: input.snapshotContent,
          summary: '试写通过后生成的正文批量生成策略快照。',
          score: input.trialRun.totalScore,
          riskLevel: input.isForced ? RiskLevel.Medium : RiskLevel.Low,
          decisionRecordId: null,
          createdBy: input.context.userId,
          createdAt: input.now,
          metadata: {
            sourceTrialRunId: input.trialRun.id,
            selectedChapterOneVersionId: input.selectedCandidate.id,
            acceptedRisks: input.isForced ? [input.reason] : []
          }
        };
        creativeVersions.unshift(snapshot);
      }

      const actionType = input.decision === 'force_pass' ? 'confirm_trial_force_pass' : input.decision === 'return_upstream' ? 'confirm_trial_return_upstream' : 'confirm_trial_pass';
      const decisionRecord: AssetDecisionRecord = {
        id: nextId('decision'),
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
      };
      if (snapshot) {
        snapshot.decisionRecordId = decisionRecord.id;
      }

      input.trialRun.status = isReturnUpstream ? 'returned_upstream' : 'confirmed';
      input.trialRun.confirmedAt = input.now;
      input.trialRun.confirmedBy = input.context.userId;
      input.trialRun.forceReason = input.isForced ? input.reason : null;
      input.trialRun.updatedAt = input.now;
      input.trialRun.metadata = {
        ...toMutableMetadata(input.trialRun.metadata),
        decision: input.decision,
        reason: input.reason,
        bodyStrategySnapshotId: snapshot?.id ?? null
      };

      const sourceTask = generationTasks.find((task) => (
        task.id === input.trialRun.sourceTaskId &&
        task.tenantId === input.context.tenantId &&
        task.novelId === input.novel.id
      ));
      if (sourceTask?.status === TaskStatus.WaitingConfirmation) {
        sourceTask.status = TaskStatus.Completed;
        sourceTask.statusNote = isReturnUpstream ? '用户已退回试写' : '用户已确认试写';
        sourceTask.currentStep = isReturnUpstream ? '试写已退回上游调整' : '试写已确认，正文策略快照已生成';
        sourceTask.userAcceptedResult = !isReturnUpstream;
        sourceTask.finishedAt = input.now;
        sourceTask.updatedAt = input.now;
        appendTaskEvent(sourceTask, {
          eventType: 'task_completed',
          message: isReturnUpstream ? '试写已退回上游调整，任务完成。' : '试写已确认并生成正文策略快照，任务完成。',
          progress: 100,
          requestId: input.context.requestId,
          createdAt: input.now
        });
      }

      if (!isReturnUpstream) {
        const results = trialChapterResults.filter((result) => result.tenantId === input.context.tenantId && result.trialRunId === input.trialRun.id);
        for (const result of results) {
          const chapter = chapters.find((item) => item.id === result.chapterId);
          if (!chapter || result.status === 'hard_failed') continue;
          chapter.mainStatus = 'completed';
          chapter.statusNote = '试写已确认，作为批量正文前置正式版本。';
          chapter.updatedAt = input.now;
        }
      }

      mutateNovel(input.novel.id, {
        creationStage: isReturnUpstream ? NovelCreationStage.Trial : NovelCreationStage.Body,
        stageStatus: isReturnUpstream ? StageStatus.Blocked : StageStatus.NotStarted,
        updatedBy: input.context.userId,
        updatedAt: input.now
      });

      const operationLog: OperationLogRecord = {
        id: nextId('oplog'),
        tenantId: input.context.tenantId,
        userId: input.context.userId,
        novelId: input.novel.id,
        action: actionType,
        objectType: 'trial_run',
        objectId: input.trialRun.id,
        beforeSnapshot: {
          trialRunStatus: 'review_ready',
          creationStage: input.novel.creationStage
        },
        afterSnapshot: {
          trialRunStatus: input.trialRun.status,
          bodyStrategySnapshotId: snapshot?.id ?? null,
          creationStage: isReturnUpstream ? NovelCreationStage.Trial : NovelCreationStage.Body
        },
        reason: input.reason,
        impactSummary: decisionRecord.impactSummary,
        sourceTaskId: input.trialRun.sourceTaskId,
        requestId: input.context.requestId,
        ip: input.context.ip ?? null,
        userAgent: input.context.userAgent ?? null,
        createdAt: input.now
      };

      assetDecisionRecords.unshift(decisionRecord);
      operationLogs.unshift(operationLog);

      return {
        novel: cloneNovel(input.novel.id),
        trialRun: input.trialRun,
        bodyStrategySnapshot: snapshot,
        decisionRecord,
        operationLog
      };
    },

    async getChapterWorkbench(tenantId: string, novelId: string, chapterId: string): Promise<ChapterWorkbenchRecord | null> {
      const chapter = chapters.find((item) => item.tenantId === tenantId && item.novelId === novelId && item.id === chapterId && !item.deletedAt);
      if (!chapter) return null;
      const candidateVersions = await this.listChapterContentVersions(tenantId, novelId, chapterId);
      const currentContent = chapter.currentContentVersionId
        ? chapterContentVersions.find((version) => version.id === chapter.currentContentVersionId) ?? null
        : null;
      const featureCard = chapterFeatureCards
        .filter((card) => card.tenantId === tenantId && card.novelId === novelId && card.chapterId === chapterId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
      const reviewReport = reviewReports
        .filter((report) => report.tenantId === tenantId && report.novelId === novelId && report.objectType === 'chapter' && report.objectId === chapterId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
      const recentTask = generationTasks
        .filter((task) => task.tenantId === tenantId && task.novelId === novelId && task.resultVersionIds.some((id) => candidateVersions.some((version) => version.id === id)))
        .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0] ?? null;
      const longTermMemory = longTermMemories
        .filter((memory) => memory.tenantId === tenantId && memory.novelId === novelId && memory.chapterId === chapterId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
      const chapterImpactCases = impactCases
        .filter((item) => item.tenantId === tenantId && item.novelId === novelId && item.sourceObjectId === chapterId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

      return {
        chapter,
        currentContent,
        featureCard,
        reviewReport,
        candidateVersions,
        longTermMemory,
        impactCases: chapterImpactCases,
        recentTask
      };
    },

    async findLatestBodyBatch(tenantId: string, novelId: string) {
      return bodyBatches
        .filter((batch) => batch.tenantId === tenantId && batch.novelId === novelId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id))[0] ?? null;
    },

    async findBodyBatchByIdempotencyKey(tenantId: string, novelId: string, idempotencyKey: string) {
      return bodyBatches.find((batch) => batch.tenantId === tenantId && batch.novelId === novelId && batch.idempotencyKey === idempotencyKey) ?? null;
    },

    async listOpenBlockingImpactCases(tenantId: string, novelId: string) {
      return impactCases
        .filter(
          (impactCase) =>
            impactCase.tenantId === tenantId &&
            impactCase.novelId === novelId &&
            ['medium', 'severe'].includes(impactCase.impactLevel) &&
            ['open', 'processing', 'waiting_decision', 'handling', 'assessing'].includes(impactCase.status)
        )
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    },

    async listImpactCasesForChapter(tenantId: string, novelId: string, chapterId: string) {
      return impactCases
        .filter((impactCase) => impactCase.tenantId === tenantId && impactCase.novelId === novelId && impactCase.sourceObjectId === chapterId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    },

    async findImpactCaseById(tenantId: string, novelId: string, impactCaseId: string) {
      return impactCases.find((impactCase) => impactCase.tenantId === tenantId && impactCase.novelId === novelId && impactCase.id === impactCaseId) ?? null;
    },

    async findLatestLongTermMemory(tenantId: string, novelId: string, chapterId?: string | null) {
      return longTermMemories
        .filter((memory) => memory.tenantId === tenantId && memory.novelId === novelId && (chapterId === undefined || chapterId === null || memory.chapterId === chapterId))
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
    },

    async createBodyBatchTask(input: BodyBatchTaskCreationInput): Promise<CreatedBodyBatchTaskRecord> {
      const task = requireClaimedTask(input.task, input.context.tenantId);
      task.progress = 8;
      task.currentStep = `正在生成第 ${input.startChapterNo}-${input.endChapterNo} 章正文`;
      task.statusNote = '正在调用模型生成本批正文，可能需要 1-3 分钟，可以稍后回来查看。';
      task.outputSummary = null;
      task.resultObjectType = 'body_batch';
      task.updatedAt = input.now;

      mutateNovel(input.novel.id, {
        creationStage: NovelCreationStage.Body,
        stageStatus: StageStatus.Processing,
        updatedBy: input.context.userId,
        updatedAt: input.now
      });

      return {
        novel: cloneNovel(input.novel.id),
        task,
        reused: false
      };
    },

    async createFullReview(input: FullReviewCreationInput): Promise<CreatedFullReviewRecord> {
      const task = requireClaimedTask(input.task, input.context.tenantId);
      const reviewId = nextId('review');
      const issueCards = input.draft.issues.map((issue) => ({
        ...issue,
        sourceReviewReportId: reviewId
      }));
      const reviewReport: ReviewReportRecord = {
        id: reviewId,
        tenantId: input.context.tenantId,
        novelId: input.novel.id,
        objectType: 'novel',
        objectId: input.novel.id,
        objectVersionId: null,
        reviewLevel: 'full_novel',
        totalScore: input.draft.totalScore,
        subScores: input.draft.dimensionScores,
        rating: input.draft.rating,
        summary: input.draft.summary,
        strengths: input.draft.strengths,
        problems: input.draft.problems,
        suggestions: input.draft.suggestions,
        issueCards,
        actionOptions: input.draft.suggestions,
        recommendedAction: input.draft.gateResult === 'blocked' ? '优化全书问题' : '确认小说完成',
        allowNextStep: input.draft.gateResult !== 'blocked',
        blockingIssueCount: issueCards.filter((issue) => issue.blocking && issue.status === 'open').length,
        resolvedStatus: 'open',
        promptTemplateVersionId: null,
        policyProfileVersionId: input.draft.reviewPolicyVersionId,
        sourceTaskId: task.id,
        createdAt: input.now,
        metadata: {
          version: 1,
          reviewPolicyVersionId: input.draft.reviewPolicyVersionId,
          videoSuggestion: input.draft.videoSuggestion,
          firstVideoSuggestion: input.draft.firstVideoSuggestion,
          platformRisks: input.draft.platformRisks,
          originalityRisks: input.draft.originalityRisks,
          aiFlavorRisks: input.draft.aiFlavorRisks,
          lowScoreContinueRisks: input.draft.lowScoreContinueRisks,
          sourceVersionRefs: input.sourceVersionRefs,
          requestFingerprint: input.requestFingerprint
        }
      };
      const gate = createFullReviewGateRecord({
        input,
        reviewReport,
        gateResult: input.draft.gateResult,
        forcePassReason: null
      });
      reviewReports.unshift(reviewReport);
      fullReviewGates.unshift(gate);
      task.status = TaskStatus.Completed;
      task.statusNote = '全书审稿完成，已生成完成门禁。';
      task.progress = 100;
      task.outputSummary = input.draft.summary;
      task.resultObjectType = 'full_review';
      task.resultObjectId = reviewReport.id;
      task.finishedAt = input.now;
      task.updatedAt = input.now;
      task.activeClaimKey = null;
      appendNovelTaskEvents(task, input.context.requestId, input.now, '全书审稿任务已创建。', '全书审稿完成，完成门禁已生成。');
      mutateNovel(input.novel.id, {
        creationStage: gate.allowCompletion ? NovelCreationStage.CompletionConfirm : NovelCreationStage.FullReview,
        stageStatus: gate.allowCompletion ? StageStatus.WaitingUser : StageStatus.Blocked,
        updatedBy: input.context.userId,
        updatedAt: input.now
      });

      return {
        novel: cloneNovel(input.novel.id),
        task,
        reviewReport,
        gate
      };
    },

    async forcePassFullReview(input: FullReviewForcePassInput): Promise<ForcedFullReviewRecord> {
      input.gate.gateResult = 'forced_pass';
      input.gate.allowCompletion = true;
      input.gate.allowVideoReady = true;
      input.gate.forcePassAllowed = false;
      input.gate.forcePassReason = input.reason;
      input.gate.updatedAt = input.now;
      input.reviewReport.allowNextStep = true;
      input.reviewReport.recommendedAction = '确认小说完成';
      input.reviewReport.metadata = {
        ...(input.reviewReport.metadata as Record<string, unknown>),
        forcePassReason: input.reason,
        gateResult: 'forced_pass'
      };
      const decisionRecord: AssetDecisionRecord = {
        id: nextId('decision'),
        tenantId: input.context.tenantId,
        novelId: input.novel.id,
        actionType: 'force_pass_full_review',
        objectType: 'full_review',
        objectId: input.reviewReport.id,
        candidateVersionId: input.reviewReport.id,
        currentVersionIdBefore: null,
        currentVersionIdAfter: input.reviewReport.id,
        decisionReason: input.reason,
        isForced: true,
        riskSummary: '低分全书审稿强制通过，已记录用户确认原因。',
        impactSummary: '用户接受低分全书审稿风险，允许进入完成确认。',
        pageVersionSnapshot: null,
        sourceTaskId: input.reviewReport.sourceTaskId,
        createdBy: input.context.userId,
        createdAt: input.now
      };
      const operationLog = createOperationLog({
        tenantId: input.context.tenantId,
        novelId: input.novel.id,
        action: 'force_pass_full_review',
        objectType: 'full_review',
        objectId: input.reviewReport.id,
        reason: input.reason,
        context: input.context,
        now: input.now,
        metadata: {
          gateId: input.gate.id
        }
      });
      assetDecisionRecords.unshift(decisionRecord);
      operationLogs.unshift(operationLog);
      mutateNovel(input.novel.id, {
        creationStage: NovelCreationStage.CompletionConfirm,
        stageStatus: StageStatus.WaitingUser,
        updatedBy: input.context.userId,
        updatedAt: input.now
      });

      return {
        novel: cloneNovel(input.novel.id),
        reviewReport: input.reviewReport,
        gate: input.gate,
        decisionRecord,
        operationLog
      };
    },

    async resolveFullReviewIssue(input: FullReviewIssueResolutionInput): Promise<ResolvedFullReviewIssueRecord> {
      const issues = toIssueCards(input.reviewReport.issueCards).map((issue) =>
        issue.issueId === input.issueId
          ? {
              ...issue,
              status: input.action === 'accept_risk' ? 'accepted_risk' : 'resolved',
              acceptedReason: input.reason
            }
          : issue
      );
      input.reviewReport.issueCards = issues;
      input.reviewReport.blockingIssueCount = issues.filter((issue) => issue.blocking && issue.status === 'open').length;
      input.gate.blockingIssueCount = input.reviewReport.blockingIssueCount;
      input.gate.warningIssueCount = issues.filter((issue) => issue.severity === 'warning' && issue.status === 'open').length;
      input.gate.updatedAt = input.now;

      return {
        novel: cloneNovel(input.novel.id),
        reviewReport: input.reviewReport,
        gate: input.gate
      };
    },

    async confirmCompletion(input: CompletionConfirmationInput): Promise<ConfirmedCompletionRecord> {
      const existing = completionDecisions.find((decision) => decision.tenantId === input.context.tenantId && decision.novelId === input.novel.id && decision.idempotencyKey === input.idempotencyKey);
      if (existing) {
        const latestCheck = videoReadinessChecks.find((check) => check.completionDecisionId === existing.id) ?? createVideoReadinessCheckRecord({ input, completionDecision: existing, taskId: null });
        return {
          novel: cloneNovel(input.novel.id),
          completionDecision: existing,
          readinessCheck: latestCheck,
          task: createVirtualVideoReadinessTask(input.novel, latestCheck, input.context, input.now),
          operationLog: operationLogs[0]
        };
      }
      const totalWordCount = input.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0);
      const completionDecision: CompletionDecisionRecord = {
        id: nextId('completion'),
        tenantId: input.context.tenantId,
        novelId: input.novel.id,
        reviewReportId: input.reviewReport.id,
        fullReviewGateId: input.gate.id,
        decision: 'confirm_completion',
        decisionReason: input.reason,
        isForced: input.gate.gateResult === 'forced_pass' || input.confirmRisk,
        score: input.reviewReport.totalScore ?? 0,
        riskSummary: input.gate.gateResult === 'forced_pass' ? `强制通过原因：${input.gate.forcePassReason ?? input.reason}` : '全书审稿已通过完成门禁。',
        sourceVersionRefs: input.sourceVersionRefs,
        chapterCount: input.chapters.length,
        totalWordCount,
        estimatedAudioMinutes: Math.max(1, Math.round(totalWordCount / 280)),
        idempotencyKey: input.idempotencyKey,
        createdBy: input.context.userId,
        createdAt: input.now,
        metadata: {
          confirmRisk: input.confirmRisk
        }
      };
      const task = createNovelLevelTask({
        novel: input.novel,
        context: input.context,
        now: input.now,
        taskId: nextId('task'),
        taskType: 'video_readiness_check',
        objectType: 'video_readiness',
        currentStep: '待视频化检查已生成',
        sourceVersionRefs: input.sourceVersionRefs,
        idempotencyKey: `${input.idempotencyKey}:readiness`,
        requestFingerprint: {
          completionDecisionId: completionDecision.id,
          reviewReportId: input.reviewReport.id
        }
      });
      const readinessCheck = createVideoReadinessCheckRecord({ input, completionDecision, taskId: task.id });
      completionDecisions.unshift(completionDecision);
      videoReadinessChecks.unshift(readinessCheck);
      generationTasks.unshift(task);
      task.status = TaskStatus.Completed;
      task.statusNote = readinessCheck.status === 'candidate' ? '待视频化检查通过，等待用户确认。' : '待视频化检查未通过，需处理阻塞项。';
      task.progress = 100;
      task.outputSummary = task.statusNote;
      task.resultObjectType = 'video_readiness_check';
      task.resultObjectId = readinessCheck.id;
      task.finishedAt = input.now;
      task.updatedAt = input.now;
      appendNovelTaskEvents(task, input.context.requestId, input.now, '视频化检查任务已创建。', task.statusNote);
      const operationLog = createOperationLog({
        tenantId: input.context.tenantId,
        novelId: input.novel.id,
        action: 'confirm_completion',
        objectType: 'completion_decision',
        objectId: completionDecision.id,
        reason: input.reason,
        context: input.context,
        now: input.now,
        metadata: {
          reviewReportId: input.reviewReport.id,
          gateId: input.gate.id
        }
      });
      operationLogs.unshift(operationLog);
      mutateNovel(input.novel.id, {
        creationStage: NovelCreationStage.CompletionConfirm,
        stageStatus: readinessCheck.status === 'candidate' ? StageStatus.Completed : StageStatus.Blocked,
        updatedBy: input.context.userId,
        updatedAt: input.now
      });

      return {
        novel: cloneNovel(input.novel.id),
        completionDecision,
        readinessCheck,
        task,
        operationLog
      };
    },

    async createVideoReadinessCheck(input: VideoReadinessCheckInput): Promise<CreatedVideoReadinessCheckRecord> {
      const task = createNovelLevelTask({
        novel: input.novel,
        context: input.context,
        now: input.now,
        taskId: nextId('task'),
        taskType: 'video_readiness_check',
        objectType: 'video_readiness',
        currentStep: '待视频化检查已刷新',
        sourceVersionRefs: input.sourceVersionRefs,
        idempotencyKey: `video-readiness-recheck-${input.context.requestId}`,
        requestFingerprint: {
          completionDecisionId: input.completionDecision?.id ?? null,
          reviewReportId: input.reviewReport?.id ?? null
        }
      });
      const checkInput = {
        novel: input.novel,
        reviewReport: input.reviewReport ?? createEmptyFullReview(input.novel, input.now),
        gate: input.gate ?? createEmptyGate(input.novel, input.now),
        chapters: input.chapters,
        sourceVersionRefs: input.sourceVersionRefs,
        idempotencyKey: `video-readiness-recheck-${input.context.requestId}`,
        reason: '重新检查待视频化',
        confirmRisk: false,
        context: input.context,
        now: input.now
      };
      const check = createVideoReadinessCheckRecord({ input: checkInput, completionDecision: input.completionDecision, taskId: task.id });
      videoReadinessChecks.unshift(check);
      generationTasks.unshift(task);
      task.status = TaskStatus.Completed;
      task.statusNote = check.status === 'candidate' ? '待视频化检查通过，等待用户确认。' : '待视频化检查未通过。';
      task.progress = 100;
      task.outputSummary = task.statusNote;
      task.resultObjectType = 'video_readiness_check';
      task.resultObjectId = check.id;
      task.finishedAt = input.now;
      task.updatedAt = input.now;
      appendNovelTaskEvents(task, input.context.requestId, input.now, '视频化检查任务已创建。', task.statusNote);

      return { novel: cloneNovel(input.novel.id), task, check };
    },

    async confirmVideoReadiness(input: VideoReadinessConfirmationInput): Promise<ConfirmedVideoReadinessRecord> {
      const existing = videoReadinessSnapshots.find((snapshot) => snapshot.tenantId === input.context.tenantId && snapshot.novelId === input.novel.id && snapshot.idempotencyKey === input.idempotencyKey);
      if (existing) {
        return {
          novel: cloneNovel(input.novel.id),
          snapshot: existing,
          operationLog: operationLogs[0]
        };
      }
      const totalWordCount = input.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0);
      const snapshot: VideoReadinessSnapshotRecord = {
        id: nextId('videoReady'),
        tenantId: input.context.tenantId,
        novelId: input.novel.id,
        fullReviewGateId: input.gate.id,
        completionDecisionId: input.completionDecision.id,
        reviewReportId: input.reviewReport.id,
        status: 'ready',
        checkItems: input.check.checkItems,
        chapterCount: input.chapters.length,
        totalWordCount,
        estimatedAudioMinutes: Math.max(1, Math.round(totalWordCount / 280)),
        riskSummary: input.completionDecision.riskSummary,
        referableChapterIds: input.chapters.map((chapter) => chapter.id),
        referableChapterVersionIds: input.chapters.map((chapter) => chapter.currentContentVersionId).filter((id): id is string => Boolean(id)),
        firstVideoSuggestion: input.check.firstVideoSuggestion,
        sourceVersionRefs: input.sourceVersionRefs,
        idempotencyKey: input.idempotencyKey,
        createdBy: input.context.userId,
        createdAt: input.now,
        metadata: {
          reason: input.reason
        }
      };
      videoReadinessSnapshots.unshift(snapshot);
      input.check.status = 'ready';
      snapshot.metadata = {
        ...(snapshot.metadata as Record<string, unknown>),
        requestFingerprint: input.requestFingerprint
      };
      const operationLog = createOperationLog({
        tenantId: input.context.tenantId,
        novelId: input.novel.id,
        action: 'confirm_video_readiness',
        objectType: 'video_readiness_snapshot',
        objectId: snapshot.id,
        reason: input.reason,
        context: input.context,
        now: input.now,
        metadata: {
          completionDecisionId: input.completionDecision.id,
          reviewReportId: input.reviewReport.id
        }
      });
      operationLogs.unshift(operationLog);
      mutateNovel(input.novel.id, {
        creationStage: NovelCreationStage.VideoReady,
        stageStatus: StageStatus.Completed,
        videoReferenceStatus: 'ready',
        updatedBy: input.context.userId,
        updatedAt: input.now
      });

      return {
        novel: cloneNovel(input.novel.id),
        snapshot,
        operationLog
      };
    },

    async generateBodyBatch(input: BodyBatchGenerationInput): Promise<GeneratedBodyBatchRecord> {
      assertNoActiveAuthorityClaim(input.context.tenantId, input.novel.id, input.task.id);
      const task = generationTasks.find((item) => item.id === input.task.id && item.tenantId === input.context.tenantId) ?? input.task;
      task.status = TaskStatus.Processing;
      task.statusNote = '模型已返回，正在保存正文版本和批次总结。';
      task.progress = Math.max(task.progress, 30);
      task.currentStep = `正在保存第 ${input.startChapterNo}-${input.endChapterNo} 章正文`;
      task.updatedAt = input.now;
      const batchId = nextId('bodybatch');
      const chapterResults = [];
      let failedChapterNo: number | null = null;
      let completedCount = 0;

      if (!generationTasks.some((item) => item.id === task.id)) {
        generationTasks.unshift(task);
      }
      appendModelTaskLifecycleEvents(task, input.context.requestId, input.now, {
        preparing: `批量正文任务已创建，本批第 ${input.startChapterNo}-${input.endChapterNo} 章。`,
        calling: '正在调用模型生成正文，可能需要 1-3 分钟，可以稍后回来查看。',
        parsing: '模型返回后正在解析章节正文和审稿结构。',
        quality: '正在检查章节评分、风险和硬失败门禁。',
        saving: '正在保存正文版本、章节特性卡、单章审稿和长篇记忆。'
      });

      for (const draft of input.chapters) {
        const totalChapters = Math.max(1, input.endChapterNo - input.startChapterNo + 1);
        appendTaskEvent(task, {
          eventType: 'chapter_progress',
          message: `正在生成第 ${completedCount + 1}/${totalChapters} 章（第 ${draft.chapter.chapterNo} 章）。`,
          progress: Math.min(95, 10 + completedCount * 15),
          requestId: input.context.requestId,
          createdAt: new Date(input.now.getTime() + completedCount + 5)
        });

        if (draft.hardFailed) {
          const chapter = chapters.find((item) => item.id === draft.chapter.id);
          if (chapter) {
            chapter.mainStatus = 'pending';
            chapter.statusNote = '硬失败待处理';
            chapter.impactLevel = 'medium';
            chapter.lastGenerationTaskId = task.id;
            chapter.updatedAt = input.now;
          }
          failedChapterNo = draft.chapter.chapterNo;
          chapterResults.push(createBodyChapterResult({
            draft,
            contentVersion: null,
            featureCard: null,
            reviewReport: null,
            memory: null,
            status: 'failed',
            statusNote: '硬失败待处理'
          }));
          appendTaskEvent(task, {
            eventType: 'task_failed',
            message: `第 ${draft.chapter.chapterNo} 章硬失败，已暂停后续章节。`,
            progress: Math.min(99, 20 + completedCount * 15),
            requestId: input.context.requestId,
            createdAt: new Date(input.now.getTime() + completedCount + 2)
          });
          break;
        }

        const contentVersion = createBodyContentVersion({ input, taskId: task.id, draft, status: VersionStatus.Current });
        const featureCard = createBodyFeatureCard({ input, taskId: task.id, draft });
        const reviewReport = createBodyReviewReport({ input, taskId: task.id, draft, contentVersionId: contentVersion.id });
        const memory = createLongTermMemory({ input, taskId: task.id, draft, contentVersionId: contentVersion.id });
        chapterContentVersions.unshift(contentVersion);
        chapterFeatureCards.unshift(featureCard);
        reviewReports.unshift(reviewReport);
        longTermMemories.unshift(memory);

        const chapter = chapters.find((item) => item.id === draft.chapter.id);
        if (chapter) {
          chapter.currentContentVersionId = contentVersion.id;
          chapter.currentFeatureCardVersionId = featureCard.id;
          chapter.currentReviewReportId = reviewReport.id;
          chapter.lastGenerationTaskId = task.id;
          chapter.wordCount = contentVersion.wordCount;
          chapter.mainStatus = 'completed';
          chapter.statusNote = draft.scoring.totalScore < 70 ? '普通风险，已进入批次总结。' : '正文已生成并完成单章审稿。';
          chapter.impactLevel = draft.scoring.totalScore < 70 ? 'minor' : 'none';
          chapter.updatedAt = input.now;
        }

        completedCount += 1;
        chapterResults.push(createBodyChapterResult({
          draft,
          contentVersion,
          featureCard,
          reviewReport,
          memory,
          status: 'completed',
          statusNote: draft.scoring.totalScore < 70 ? '普通风险，已记录。' : null
        }));
      }

      const status = failedChapterNo ? 'paused' : 'completed';
      const summary = createBodyBatchSummary({
        batchId,
        chapterResults,
        startChapterNo: input.startChapterNo,
        endChapterNo: input.endChapterNo,
        failedChapterNo,
        completedCount,
        createdAt: input.now
      });
      const totalCount = input.endChapterNo - input.startChapterNo + 1;
      const batch: BodyBatchRecord = {
        id: batchId,
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
        status,
        statusNote: failedChapterNo ? `第 ${failedChapterNo} 章硬失败，后续章节未继续生成。` : '本批正文生成完成。',
        completedCount,
        failedCount: failedChapterNo ? 1 : 0,
        pendingCount: failedChapterNo ? totalCount - completedCount - 1 : 0,
        failedChapterNo,
        chapterResults,
        summary,
        createdAt: input.now,
        metadata: {
          previousBatchSummaryId: input.previousBatchSummary?.id ?? null,
          sourceVersionRefs: input.sourceVersionRefs,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: input.requestFingerprint
        }
      };
      bodyBatches.unshift(batch);

      task.status = failedChapterNo ? TaskStatus.Failed : TaskStatus.Completed;
      task.statusNote = failedChapterNo ? '硬失败待处理，已完成章节保留。' : '本批正文生成完成，已生成批次总结。';
      task.progress = 100;
      task.currentStep = failedChapterNo ? `第 ${failedChapterNo} 章硬失败待处理` : '批次总结已生成';
      task.outputSummary = summary.conclusion;
      task.resultObjectType = 'body_batch';
      task.resultObjectId = batch.id;
      task.resultVersionIds = chapterResults.map((result) => result.contentVersionId).filter((id): id is string => Boolean(id));
      task.failureCategory = failedChapterNo ? 'quality_failed' : null;
      task.errorCode = failedChapterNo ? 'QUALITY_GATE_FAILED' : null;
      task.errorMessage = failedChapterNo ? `第 ${failedChapterNo} 章硬失败，后续章节已暂停。` : null;
      task.finishedAt = input.now;
      task.updatedAt = input.now;
      task.activeClaimKey = null;
      task.metadata = {
        ...(task.metadata as Record<string, unknown>),
        batch
      };
      appendTaskEvent(task, {
        eventType: failedChapterNo ? 'batch_paused' : 'batch_completed',
        message: summary.conclusion,
        progress: 100,
        requestId: input.context.requestId,
        createdAt: new Date(input.now.getTime() + completedCount + 10)
      });

      const activeChapters = chapters.filter((chapter) => chapter.tenantId === input.context.tenantId && chapter.novelId === input.novel.id && !chapter.deletedAt);
      const allCompleted = activeChapters.length > 0 && activeChapters.every((chapter) => chapter.currentContentVersionId && chapter.mainStatus === 'completed');
      mutateNovel(input.novel.id, {
        creationStage: NovelCreationStage.Body,
        stageStatus: failedChapterNo ? StageStatus.Blocked : allCompleted ? StageStatus.Completed : StageStatus.NotStarted,
        updatedBy: input.context.userId,
        updatedAt: input.now
      });

      return {
        novel: cloneNovel(input.novel.id),
        task,
        batch,
        chapters: activeChapters.map((chapter) => ({ ...chapter }))
      };
    },

    async rewriteChapter(input: ChapterRewriteInput): Promise<RewrittenChapterRecord> {
      assertNoActiveAuthorityClaim(input.context.tenantId, input.novel.id, input.task.id);
      const task = requireClaimedTask(input.task, input.context.tenantId);
      const candidate = createBodyContentVersion({
        input: {
          novel: input.novel,
          strategySnapshot: createSyntheticStrategySnapshot(input.novel, input.context, input.now),
          task,
          chapters: [input.candidate],
          idempotencyKey: `chapter-rewrite-${task.id}`,
          requestFingerprint: {
            taskType: 'chapter_body_rewrite',
            taskId: task.id,
            chapterId: input.chapter.id,
            currentContentVersionId: input.currentContent.id
          },
          startChapterNo: input.chapter.chapterNo,
          endChapterNo: input.chapter.chapterNo,
          sourceVersionRefs: input.currentContent.sourceVersionRefs,
          previousBatchSummary: null,
          context: input.context,
          now: input.now
        },
        taskId: task.id,
        draft: input.candidate,
        status: VersionStatus.Candidate,
        rewriteReason: input.reason,
        summaryCompare: input.summaryCompare
      });
      task.resultVersionIds = [candidate.id];
      task.resultObjectType = 'chapter_content_version';
      task.resultObjectId = candidate.id;
      task.outputSummary = input.summaryCompare.candidateSummary;
      task.status = TaskStatus.WaitingConfirmation;
      task.statusNote = '章节重写候选已生成，等待采用';
      task.progress = 100;
      task.currentStep = '章节重写候选已生成，等待采用';
      task.updatedAt = input.now;
      task.activeClaimKey = null;
      appendTaskProgressEvents(task, input.context.requestId, input.now);
      chapterContentVersions.unshift(candidate);

      return {
        novel: cloneNovel(input.novel.id),
        task,
        chapter: input.chapter,
        currentContent: input.currentContent,
        candidate,
        summaryCompare: input.summaryCompare
      };
    },

    async adoptChapterContent(input: ChapterContentAdoptionInput): Promise<AdoptedChapterContentRecord> {
      assertNoActiveAuthorityClaim(input.context.tenantId, input.novel.id, input.task.id);
      for (const version of chapterContentVersions) {
        if (version.tenantId === input.context.tenantId && version.chapterId === input.chapter.id && version.status === VersionStatus.Current) {
          version.status = VersionStatus.Historical;
        }
      }
      input.candidate.status = VersionStatus.Current;
      input.candidate.decisionRecordId = null;
      const task = requireClaimedTask(input.task, input.context.tenantId);
      task.status = TaskStatus.Completed;
      task.progress = 100;
      task.outputSummary = input.impact.summary;
      task.resultVersionIds = [input.candidate.id];
      task.resultObjectType = 'impact_case';
      task.finishedAt = input.now;
      task.updatedAt = input.now;
      task.activeClaimKey = null;

      const decisionRecord: AssetDecisionRecord = {
        id: nextId('decision'),
        tenantId: input.context.tenantId,
        novelId: input.novel.id,
        actionType: 'adopt_chapter_content',
        objectType: 'chapter_content',
        objectId: input.chapter.id,
        candidateVersionId: input.candidate.id,
        currentVersionIdBefore: input.currentContent?.id ?? null,
        currentVersionIdAfter: input.candidate.id,
        decisionReason: input.reason,
        isForced: input.impact.blocksFullReview,
        riskSummary: input.summaryCompare.newRisks.join('；'),
        impactSummary: input.impact.summary,
        pageVersionSnapshot: input.pageVersionSnapshot ?? {
          currentContentVersionId: input.currentContent?.id ?? null
        },
        sourceTaskId: task.id,
        createdBy: input.context.userId,
        createdAt: input.now
      };
      const impactCase = createImpactCaseRecord({
        input,
        taskId: task.id,
        decisionRecordId: decisionRecord.id
      });
      task.resultObjectId = impactCase.id;
      task.metadata = {
        requestId: input.context.requestId,
        impactCaseId: impactCase.id
      };
      appendTaskProgressEvents(task, input.context.requestId, input.now);
      assetDecisionRecords.unshift(decisionRecord);
      impactCases.unshift(impactCase);

      input.candidate.decisionRecordId = decisionRecord.id;
      const chapter = chapters.find((item) => item.id === input.chapter.id);
      if (chapter) {
        chapter.currentContentVersionId = input.candidate.id;
        chapter.wordCount = input.candidate.wordCount;
        chapter.mainStatus = input.impact.blocksFullReview ? 'pending' : 'completed';
        chapter.statusNote = input.impact.blocksFullReview ? '重写采用后影响未关闭。' : '重写已采用，影响已同步。';
        chapter.impactLevel = input.impact.impactLevel;
        chapter.lastGenerationTaskId = task.id;
        chapter.updatedAt = input.now;
      }

      const operationLog: OperationLogRecord = {
        id: nextId('oplog'),
        tenantId: input.context.tenantId,
        userId: input.context.userId,
        novelId: input.novel.id,
        action: 'adopt_chapter_content',
        objectType: 'chapter',
        objectId: input.chapter.id,
        beforeSnapshot: {
          currentContentVersionId: input.currentContent?.id ?? null
        },
        afterSnapshot: {
          currentContentVersionId: input.candidate.id,
          impactCaseId: impactCase.id
        },
        reason: input.reason,
        impactSummary: input.impact.summary,
        sourceTaskId: task.id,
        requestId: input.context.requestId,
        ip: input.context.ip ?? null,
        userAgent: input.context.userAgent ?? null,
        createdAt: input.now
      };
      operationLogs.unshift(operationLog);
      mutateNovel(input.novel.id, {
        creationStage: NovelCreationStage.Body,
        stageStatus: input.impact.blocksFullReview ? StageStatus.Blocked : StageStatus.NotStarted,
        updatedBy: input.context.userId,
        updatedAt: input.now
      });

      return {
        novel: cloneNovel(input.novel.id),
        task,
        chapter: chapter ? { ...chapter } : input.chapter,
        previousContentVersionId: input.currentContent?.id ?? null,
        currentContent: input.candidate,
        impactCase,
        decisionRecord,
        operationLog
      };
    },

    async createImpactAssessment(input: ImpactAssessmentInput): Promise<CreatedImpactAssessmentRecord> {
      const task = requireClaimedTask(input.task, input.context.tenantId);
      task.status = TaskStatus.Completed;
      task.progress = 100;
      task.outputSummary = input.impact.summary;
      task.statusNote = '影响评估已生成';
      task.currentStep = '影响评估已生成';
      task.finishedAt = input.now;
      task.updatedAt = input.now;
      task.activeClaimKey = null;
      const impactCase = createImpactCaseRecord({
        input: {
          novel: input.novel,
          task: input.task,
          chapter: input.chapter,
          currentContent: input.currentContent,
          candidate: input.currentContent,
          reason: input.reason,
          summaryCompare: {
            currentSummary: input.currentContent.summary ?? '',
            candidateSummary: input.currentContent.summary ?? '',
            benefit: '补充影响评估',
            newRisks: [],
            possibleImpact: input.impact.summary,
            aiSuggestion: input.impact.recommendedHandling
          },
          impact: input.impact,
          context: input.context,
          now: input.now
        },
        taskId: task.id,
        decisionRecordId: null
      });
      task.resultObjectType = 'impact_case';
      task.resultObjectId = impactCase.id;
      appendTaskProgressEvents(task, input.context.requestId, input.now);
      impactCases.unshift(impactCase);

      return {
        novel: cloneNovel(input.novel.id),
        task,
        impactCase
      };
    },

    async resolveImpactCase(input: ImpactCaseResolveInput): Promise<ResolvedImpactCaseRecord> {
      assertNoActiveAuthorityClaim(input.context.tenantId, input.novel.id);
      input.impactCase.status = input.resolution;
      input.impactCase.resolvedAt = input.now;
      input.impactCase.metadata = {
        ...toMutableMetadata(input.impactCase.metadata),
        resolveReason: input.reason,
        resolvedBy: input.context.userId
      };
      if (input.impactCase.sourceObjectId) {
        const chapter = chapters.find((item) => item.id === input.impactCase.sourceObjectId);
        if (chapter) {
          chapter.mainStatus = 'completed';
          chapter.statusNote = input.resolution === 'ignored' ? '影响已人工确认忽略。' : '影响已处理完成。';
          chapter.impactLevel = input.resolution === 'cancelled' ? chapter.impactLevel : 'none';
          chapter.updatedAt = input.now;
        }
      }
      const openBlocking = impactCases.some(
        (impactCase) =>
          impactCase.novelId === input.novel.id &&
          impactCase.id !== input.impactCase.id &&
          ['medium', 'severe'].includes(impactCase.impactLevel) &&
          ['open', 'processing', 'waiting_decision', 'handling', 'assessing'].includes(impactCase.status)
      );
      if (!openBlocking) {
        mutateNovel(input.novel.id, {
          stageStatus: StageStatus.NotStarted,
          updatedBy: input.context.userId,
          updatedAt: input.now
        });
      }
      const operationLog: OperationLogRecord = {
        id: nextId('oplog'),
        tenantId: input.context.tenantId,
        userId: input.context.userId,
        novelId: input.novel.id,
        action: 'resolve_impact_case',
        objectType: 'impact_case',
        objectId: input.impactCase.id,
        beforeSnapshot: {
          status: 'waiting_decision'
        },
        afterSnapshot: {
          status: input.resolution
        },
        reason: input.reason,
        impactSummary: input.impactCase.summary,
        sourceTaskId: input.impactCase.sourceTaskId,
        requestId: input.context.requestId,
        ip: input.context.ip ?? null,
        userAgent: input.context.userAgent ?? null,
        createdAt: input.now
      };
      operationLogs.unshift(operationLog);

      return {
        novel: cloneNovel(input.novel.id),
        impactCase: input.impactCase,
        operationLog
      };
    },

    async updateChapterWordTargets(input: ChapterWordTargetUpdateInput) {
      assertNoActiveAuthorityClaim(input.context.tenantId, input.novel.id);
      const currentPlanId = input.novel.currentChapterPlanVersionId;
      const currentAsset = creativeVersions.find(
        (version) =>
          version.tenantId === input.context.tenantId &&
          version.novelId === input.novel.id &&
          version.id === currentPlanId &&
          version.objectType === 'chapter_plan'
      );
      if (!currentAsset) {
        throw new Error('current chapter plan asset is required');
      }

      const updatesByNo = new Map(input.updates.map((update) => [update.chapterNo, update.wordTarget]));
      const content = normalizeStructureContent(currentAsset.content);
      currentAsset.content = {
        ...content,
        chapters: content.chapters.map((chapter) => ({
          ...chapter,
          wordTarget: updatesByNo.get(chapter.chapterNo) ?? chapter.wordTarget
        }))
      };
      currentAsset.changeReason = input.reason;

      for (const chapter of chapters) {
        if (chapter.tenantId !== input.context.tenantId || chapter.novelId !== input.novel.id || chapter.deletedAt) continue;
        const nextTarget = updatesByNo.get(chapter.chapterNo);
        if (nextTarget === undefined) continue;
        chapter.wordTarget = nextTarget;
        chapter.statusNote = chapter.currentContentVersionId ? '目标字数已调整，已生成正文可按需扩写。' : '目标字数已调整，正文尚未生成。';
        chapter.updatedAt = input.now;
      }

      mutateNovel(input.novel.id, { updatedAt: input.now, updatedBy: input.context.userId });

      return {
        novel: cloneNovel(input.novel.id),
        currentAsset,
        versions: await this.listStructureVersions(input.context.tenantId, input.novel.id),
        chapters: await this.listNovelChapters(input.context.tenantId, input.novel.id)
      };
    },

    async retryTask(input: TaskRetryInput): Promise<RetriedTaskRecord> {
      const newTaskId = nextId('task');
      const newTask: GenerationTaskRecord = {
        ...input.task,
        id: newTaskId,
        status: TaskStatus.Queued,
        statusNote: '任务已重新加入队列，等待模型服务执行。',
        progress: 0,
        currentStep: '等待重试执行',
        outputSummary: null,
        resultVersionIds: [],
        retryOfTaskId: input.task.id,
        failureCategory: null,
        errorCode: null,
        errorMessage: null,
        resultObjectType: null,
        resultObjectId: null,
        userAcceptedResult: false,
        cancelRequestedAt: null,
        cancelReason: null,
        startedAt: null,
        finishedAt: null,
        leaseOwnerId: null,
        leaseToken: null,
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
        retryCount: (input.task.retryCount ?? 0) + 1,
        providerAttemptId: null,
        providerAttemptPhase: null,
        providerDispatchedAt: null,
        resultReceiptHash: null,
        createdBy: input.context.userId,
        createdAt: input.now,
        updatedAt: input.now,
        metadata: {
          requestId: input.context.requestId,
          retryReason: input.reason,
          retryOfTaskId: input.task.id
        }
      };
      const event = appendTaskEvent(newTask, {
        eventType: 'task_retry_created',
        message: input.reason ? `已创建重试任务：${input.reason}` : '已创建重试任务。',
        progress: 0,
        requestId: input.context.requestId,
        createdAt: input.now
      });
      const operationLog: OperationLogRecord = {
        id: nextId('oplog'),
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
          status: newTask.status
        },
        reason: input.reason || '重试失败任务',
        impactSummary: '创建新的重试任务，原失败任务保留。',
        sourceTaskId: input.task.id,
        requestId: input.context.requestId,
        ip: input.context.ip ?? null,
        userAgent: input.context.userAgent ?? null,
        createdAt: input.now
      };

      generationTasks.unshift(newTask);
      operationLogs.unshift(operationLog);

      return {
        originalTask: input.task,
        newTask,
        event,
        operationLog
      };
    },

    async cancelTask(input: TaskCancelInput): Promise<CancelledTaskRecord> {
      const previousStatus = input.task.status;
      input.task.status = TaskStatus.Cancelled;
      input.task.activeClaimKey = null;
      input.task.statusNote = '任务已取消，不会写入正式资产。';
      input.task.currentStep = '任务已取消';
      input.task.cancelRequestedAt = input.now;
      input.task.cancelReason = input.reason;
      input.task.finishedAt = input.now;
      input.task.updatedAt = input.now;
      const event = appendTaskEvent(input.task, {
        eventType: 'task_cancelled',
        message: input.reason ? `任务已取消：${input.reason}` : '任务已取消。',
        progress: input.task.progress,
        requestId: input.context.requestId,
        createdAt: input.now
      });
      const operationLog: OperationLogRecord = {
        id: nextId('oplog'),
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
          taskId: input.task.id,
          status: TaskStatus.Cancelled
        },
        reason: input.reason || '取消生成任务',
        impactSummary: '取消任务不会采用候选，也不会写入正式资产。',
        sourceTaskId: input.task.id,
        requestId: input.context.requestId,
        ip: input.context.ip ?? null,
        userAgent: input.context.userAgent ?? null,
        createdAt: input.now
      };

      operationLogs.unshift(operationLog);

      return {
        task: input.task,
        event,
        operationLog
      };
    },

    getOperationLogs() {
      return operationLogs;
    },

    getGenerationTasks() {
      return generationTasks;
    },

    getGenerationTaskEvents() {
      return generationTaskEvents;
    },

    getCreativeVersions() {
      return creativeVersions;
    },

    getAssetDecisionRecords() {
      return assetDecisionRecords;
    },

    getNovelChapters() {
      return chapters;
    },

    getChapterContentVersions() {
      return chapterContentVersions;
    },

    getTrialRuns() {
      return trialRuns;
    },

    getImpactCases() {
      return impactCases;
    },

    getLongTermMemories() {
      return longTermMemories;
    },

    getBodyBatches() {
      return bodyBatches;
    }
  };

  function createTask(options: {
    input: DirectionCreationInput | DirectionRevisionInput | StructureCreationInput | StructureGenerationTaskCreationInput;
    objectType?: string;
    taskId: string;
    status: TaskStatus;
    progress: number;
    currentStep: string;
  }): GenerationTaskRecord {
    const objectType = options.objectType ?? 'direction';

    return {
      ...legacyExecutionFields(options.taskId, options.input.now),
      id: options.taskId,
      tenantId: options.input.context.tenantId,
      novelId: options.input.novel.id,
      taskType: options.input.taskType,
      objectType,
      objectId: objectType,
      status: options.status,
      statusNote: `模型服务已生成 ${objectType} 候选`,
      progress: options.progress,
      currentStep: options.currentStep,
      triggerSource: 'manual',
      sourceVersionRefs: getTaskSourceVersionRefs(options.input, objectType),
      conflictScope: `novel_${objectType}`,
      conflictKey: options.input.novel.id,
      idempotencyToken: null,
      requestHash: null,
      activeClaimKey: null,
      inputSummary: getTaskInputSummary(options.input.taskType, objectType),
      outputSummary: null,
      resultVersionIds: [],
      retryOfTaskId: null,
      failureCategory: null,
      errorCode: null,
      errorMessage: null,
      resultObjectType: null,
      resultObjectId: null,
      userAcceptedResult: false,
      cancelRequestedAt: null,
      cancelReason: null,
      startedAt: options.input.now,
      finishedAt: null,
      createdBy: options.input.context.userId,
      createdAt: options.input.now,
      updatedAt: options.input.now,
      metadata: {
        requestId: options.input.context.requestId
      }
    };
  }

  function createTrialTask(options: {
    novel: NovelRecord;
    context: TrialCandidateCreationInput['context'];
    now: Date;
    taskId: string;
    trialRunId: string;
    taskType: string;
    currentStep: string;
    sourceVersionRefs: unknown;
    resultVersionIds: string[];
  }): GenerationTaskRecord {
    return {
      ...legacyExecutionFields(options.taskId, options.now),
      id: options.taskId,
      tenantId: options.context.tenantId,
      novelId: options.novel.id,
      taskType: options.taskType,
      objectType: 'trial_run',
      objectId: options.trialRunId,
      status: TaskStatus.WaitingConfirmation,
      statusNote: '模型服务已生成试写结果，等待用户确认。',
      progress: 100,
      currentStep: options.currentStep,
      triggerSource: 'manual',
      sourceVersionRefs: options.sourceVersionRefs,
      conflictScope: 'novel_trial',
      conflictKey: options.novel.id,
      idempotencyToken: null,
      requestHash: null,
      activeClaimKey: null,
      inputSummary: '根据已确认章节目录和上游资产生成试写候选。',
      outputSummary: null,
      resultVersionIds: options.resultVersionIds,
      retryOfTaskId: null,
      failureCategory: null,
      errorCode: null,
      errorMessage: null,
      resultObjectType: 'trial_run',
      resultObjectId: options.trialRunId,
      userAcceptedResult: false,
      cancelRequestedAt: null,
      cancelReason: null,
      startedAt: options.now,
      finishedAt: null,
      createdBy: options.context.userId,
      createdAt: options.now,
      updatedAt: options.now,
      metadata: {
        requestId: options.context.requestId,
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

  function createBodyTask(options: {
    input: BodyBatchGenerationInput | BodyBatchTaskCreationInput;
    taskId: string;
    status: TaskStatus;
    progress: number;
    currentStep: string;
  }): GenerationTaskRecord {
    return {
      ...legacyExecutionFields(options.taskId, options.input.now),
      id: options.taskId,
      tenantId: options.input.context.tenantId,
      novelId: options.input.novel.id,
      taskType: 'body_batch_generate',
      objectType: 'body_batch',
      objectId: options.input.novel.id,
      status: options.status,
      statusNote: '正在按批次生成正文。',
      progress: options.progress,
      currentStep: options.currentStep,
      triggerSource: 'manual',
      sourceVersionRefs: options.input.sourceVersionRefs,
      conflictScope: 'novel_body_batch',
      conflictKey: options.input.novel.id,
      idempotencyToken: null,
      requestHash: null,
      activeClaimKey: null,
      inputSummary: `基于策略快照 ${options.input.strategySnapshot.id} 生成第 ${options.input.startChapterNo}-${options.input.endChapterNo} 章。`,
      outputSummary: null,
      resultVersionIds: [],
      retryOfTaskId: null,
      failureCategory: null,
      errorCode: null,
      errorMessage: null,
      resultObjectType: null,
      resultObjectId: null,
      userAcceptedResult: false,
      cancelRequestedAt: null,
      cancelReason: null,
      startedAt: options.input.now,
      finishedAt: null,
      createdBy: options.input.context.userId,
      createdAt: options.input.now,
      updatedAt: options.input.now,
      metadata: {
        requestId: options.input.context.requestId,
        idempotencyKey: options.input.idempotencyKey,
        requestFingerprint: options.input.requestFingerprint,
        strategySnapshotId: options.input.strategySnapshot.id,
        strategySnapshotVersion: options.input.strategySnapshot.versionNo,
        batchRange: {
          startChapterNo: options.input.startChapterNo,
          endChapterNo: options.input.endChapterNo
        }
      }
    };
  }

  function createChapterTask(options: {
    novel: NovelRecord;
    chapter: NovelChapterRecord;
    context: TrialCandidateCreationInput['context'];
    now: Date;
    taskId: string;
    taskType: string;
    currentStep: string;
    sourceVersionRefs: unknown;
  }): GenerationTaskRecord {
    return {
      ...legacyExecutionFields(options.taskId, options.now),
      id: options.taskId,
      tenantId: options.context.tenantId,
      novelId: options.novel.id,
      taskType: options.taskType,
      objectType: 'chapter',
      objectId: options.chapter.id,
      status: TaskStatus.WaitingConfirmation,
      statusNote: options.currentStep,
      progress: 100,
      currentStep: options.currentStep,
      triggerSource: 'manual',
      sourceVersionRefs: options.sourceVersionRefs,
      conflictScope: 'chapter',
      conflictKey: options.chapter.id,
      idempotencyToken: null,
      requestHash: null,
      activeClaimKey: null,
      inputSummary: `${options.taskType} for chapter ${options.chapter.chapterNo}`,
      outputSummary: null,
      resultVersionIds: [],
      retryOfTaskId: null,
      failureCategory: null,
      errorCode: null,
      errorMessage: null,
      resultObjectType: null,
      resultObjectId: null,
      userAcceptedResult: false,
      cancelRequestedAt: null,
      cancelReason: null,
      startedAt: options.now,
      finishedAt: options.now,
      createdBy: options.context.userId,
      createdAt: options.now,
      updatedAt: options.now,
      metadata: {
        requestId: options.context.requestId,
        chapterNo: options.chapter.chapterNo
      }
    };
  }

  function createBodyContentVersion(options: {
    input: BodyBatchGenerationInput;
    taskId: string;
    draft: BodyBatchGenerationInput['chapters'][number];
    status: VersionStatus;
    rewriteReason?: string;
    summaryCompare?: unknown;
  }): ChapterContentVersionRecord {
    const draft = options.draft;

    return {
      id: nextId('ccv'),
      tenantId: options.input.context.tenantId,
      novelId: options.input.novel.id,
      chapterId: draft.chapter.id,
      versionNo: nextChapterContentVersionNo(options.input.context.tenantId, options.input.novel.id, draft.chapter.id),
      status: options.status,
      staleLevel: StaleLevel.None,
      sourceType: 'mock_ai',
      sourceTaskId: options.taskId,
      sourceVersionRefs: options.input.sourceVersionRefs,
      rewriteReason: options.rewriteReason ?? '批量正文生成章节正文',
      content: draft.content,
      wordCount: countWords(draft.content),
      summary: draft.summary,
      reviewScore: draft.scoring.totalScore,
      decisionRecordId: null,
      createdBy: options.input.context.userId,
      createdAt: options.input.now,
      metadata: {
        chapterNo: draft.chapter.chapterNo,
        title: draft.chapter.title,
        openingStrategy: draft.openingStrategy,
        openingHighlight: draft.openingHighlight,
        firstSentence: draft.firstSentence,
        first300Summary: draft.first300Summary,
        endingHook: draft.endingHook,
        riskLevel: draft.riskLevel,
        riskTags: draft.riskTags,
        aiRecommendedReason: draft.aiRecommendedReason,
        isAiRecommended: false,
        isSelected: options.status === VersionStatus.Current,
        scoring: draft.scoring,
        summaryCompare: options.summaryCompare ?? null
      }
    };
  }

  function createBodyFeatureCard(options: {
    input: BodyBatchGenerationInput;
    taskId: string;
    draft: BodyBatchGenerationInput['chapters'][number];
  }): ChapterFeatureCardRecord {
    const draft = options.draft.featureCard;

    return {
      id: nextId('feature'),
      tenantId: options.input.context.tenantId,
      novelId: options.input.novel.id,
      chapterId: options.draft.chapter.id,
      versionNo: nextFeatureCardVersionNo(options.input.context.tenantId, options.draft.chapter.id),
      status: VersionStatus.Current,
      staleLevel: StaleLevel.None,
      oneLineSummary: draft.oneLineSummary,
      coreTask: draft.coreTask,
      mainConflict: draft.mainConflict,
      appealPoint: draft.appealPoint,
      emotionKeywords: draft.emotionKeywords,
      characterChanges: draft.characterChanges,
      relationshipChanges: draft.relationshipChanges,
      keyInformation: draft.keyInformation,
      foreshadowingOperation: draft.foreshadowingOperation,
      endingHook: draft.endingHook,
      factsCannotChange: draft.factsCannotChange,
      featuresToStrengthen: draft.featuresToStrengthen,
      sourceTaskId: options.taskId,
      decisionRecordId: null,
      createdAt: options.input.now,
      metadata: draft.metadata
    };
  }

  function createBodyReviewReport(options: {
    input: BodyBatchGenerationInput;
    taskId: string;
    draft: BodyBatchGenerationInput['chapters'][number];
    contentVersionId: string;
  }): ReviewReportRecord {
    const draft = options.draft.review;

    return {
      id: nextId('review'),
      tenantId: options.input.context.tenantId,
      novelId: options.input.novel.id,
      objectType: 'chapter',
      objectId: options.draft.chapter.id,
      objectVersionId: options.contentVersionId,
      reviewLevel: draft.reviewLevel,
      totalScore: draft.totalScore,
      subScores: draft.subScores,
      rating: draft.rating,
      summary: draft.summary,
      strengths: draft.strengths,
      problems: draft.problems,
      suggestions: draft.suggestions,
      issueCards: draft.issueCards,
      actionOptions: draft.actionOptions,
      recommendedAction: draft.recommendedAction,
      allowNextStep: draft.allowNextStep,
      blockingIssueCount: draft.blockingIssueCount,
      resolvedStatus: draft.resolvedStatus,
      promptTemplateVersionId: draft.promptTemplateVersionId,
      policyProfileVersionId: draft.policyProfileVersionId ?? options.input.novel.policyProfileVersionId,
      sourceTaskId: options.taskId,
      createdAt: options.input.now,
      metadata: draft.metadata
    };
  }

  function createLongTermMemory(options: {
    input: BodyBatchGenerationInput;
    taskId: string;
    draft: BodyBatchGenerationInput['chapters'][number];
    contentVersionId: string;
  }): LongTermMemoryRecord {
    const draft = options.draft.memory;

    return {
      id: nextId('memory'),
      tenantId: options.input.context.tenantId,
      novelId: options.input.novel.id,
      chapterId: options.draft.chapter.id,
      sourceContentVersionId: options.contentVersionId,
      previousSummary: draft.previousSummary,
      characterStates: draft.characterStates,
      relationshipStates: draft.relationshipStates,
      locations: draft.locations,
      organizations: draft.organizations,
      items: draft.items,
      plantedForeshadowing: draft.plantedForeshadowing,
      resolvedForeshadowing: draft.resolvedForeshadowing,
      unresolvedConflicts: draft.unresolvedConflicts,
      newSettings: draft.newSettings,
      factsCannotContradict: draft.factsCannotContradict,
      status: VersionStatus.Current,
      staleLevel: StaleLevel.None,
      sourceTaskId: options.taskId,
      createdAt: options.input.now,
      metadata: draft.metadata
    };
  }

  function createBodyChapterResult(options: {
    draft: BodyBatchGenerationInput['chapters'][number];
    contentVersion: ChapterContentVersionRecord | null;
    featureCard: ChapterFeatureCardRecord | null;
    reviewReport: ReviewReportRecord | null;
    memory: LongTermMemoryRecord | null;
    status: 'completed' | 'failed' | 'pending';
    statusNote: string | null;
  }) {
    return {
      chapterId: options.draft.chapter.id,
      chapterNo: options.draft.chapter.chapterNo,
      title: options.draft.chapter.title,
      status: options.status,
      statusText: options.status === 'completed' ? '已生成' : options.status === 'failed' ? '硬失败' : '待处理',
      contentVersionId: options.contentVersion?.id ?? null,
      featureCardId: options.featureCard?.id ?? null,
      reviewReportId: options.reviewReport?.id ?? null,
      longTermMemoryId: options.memory?.id ?? null,
      score: options.draft.scoring.totalScore,
      riskLevel: options.draft.riskLevel,
      hardFailed: options.draft.hardFailed,
      statusNote: options.statusNote,
      recommendedAction: options.draft.hardFailed ? '进入章节详情处理' : options.draft.scoring.totalScore < 70 ? '批次完成后可优化本章' : '继续下一章'
    };
  }

  function createBodyBatchSummary(options: {
    batchId: string;
    chapterResults: ReturnType<typeof createBodyChapterResult>[];
    startChapterNo: number;
    endChapterNo: number;
    failedChapterNo: number | null;
    completedCount: number;
    createdAt: Date;
  }): BodyBatchSummaryRecord {
    const riskChapters = options.chapterResults.filter((result) => result.hardFailed || (result.score !== null && result.score < 70));

    return {
      id: nextId('batchsummary'),
      batchId: options.batchId,
      conclusion: options.failedChapterNo
        ? `已完成 ${options.completedCount} 章已保留，第 ${options.failedChapterNo} 章硬失败，下一步处理第 ${options.failedChapterNo} 章。`
        : `第 ${options.startChapterNo}-${options.endChapterNo} 章批量正文已完成，普通风险已写入单章审稿和批次总结。`,
      chapterResults: options.chapterResults,
      riskTrend: riskChapters.length > 0 ? '本批存在需要关注的质量风险。' : '本批连续性和人物一致性稳定。',
      nextBatchNotes: [
        '继续沿用已确认的正文策略快照。',
        '下一批先读取本批总结和最新长篇记忆。',
        '保持旧码头线索和母亲公司旧案的连续性。'
      ],
      riskChapterIds: riskChapters.map((result) => result.chapterId),
      createdAt: options.createdAt
    };
  }

  function createImpactCaseRecord(options: {
    input: ChapterContentAdoptionInput;
    taskId: string;
    decisionRecordId: string | null;
  }): ImpactCaseRecord {
    const impact = options.input.impact;

    return {
      id: nextId('impact'),
      tenantId: options.input.context.tenantId,
      novelId: options.input.novel.id,
      sourceObjectType: 'chapter',
      sourceObjectId: options.input.chapter.id,
      sourceOldVersionId: options.input.currentContent?.id ?? null,
      sourceNewVersionId: options.input.candidate.id,
      impactLevel: impact.impactLevel,
      status: impact.blocksFullReview ? 'waiting_decision' : impact.impactLevel === 'none' ? 'resolved' : 'ignored',
      affectedChapterIds: impact.affectedChapterIds,
      affectedVideoReferenceIds: impact.affectedVideoReferenceIds,
      summary: impact.summary,
      suggestedActions: impact.suggestedActions,
      decisionRecordId: options.decisionRecordId,
      sourceTaskId: options.taskId,
      createdAt: options.input.now,
      resolvedAt: impact.blocksFullReview ? null : options.input.now,
      metadata: {
        changedFacts: impact.changedFacts,
        recommendedHandling: impact.recommendedHandling,
        blocksFullReview: impact.blocksFullReview,
        summaryCompare: options.input.summaryCompare
      }
    };
  }

  function createSyntheticStrategySnapshot(novel: NovelRecord, context: TrialCandidateCreationInput['context'], now: Date): CreativeVersionRecord {
    return {
      id: `synthetic_strategy_${novel.id}`,
      tenantId: context.tenantId,
      novelId: novel.id,
      objectType: 'body_strategy_snapshot',
      objectId: 'body_strategy_snapshot',
      versionNo: 0,
      status: VersionStatus.Current,
      staleLevel: StaleLevel.None,
      sourceType: 'chapter_rewrite',
      sourceTaskId: null,
      sourceVersionRefs: {},
      changeReason: '章节重写临时上下文',
      content: {},
      summary: null,
      score: null,
      riskLevel: RiskLevel.Low,
      decisionRecordId: null,
      createdBy: context.userId,
      createdAt: now,
      metadata: {}
    };
  }

  function createChapterContentVersion(options: {
    input: TrialFollowupGenerationInput;
    taskId: string;
    chapterDraft: TrialFollowupGenerationInput['chapters'][number];
    sourceVersionRefs: unknown;
  }): ChapterContentVersionRecord {
    return {
      id: nextId('ccv'),
      tenantId: options.input.context.tenantId,
      novelId: options.input.novel.id,
      chapterId: options.chapterDraft.chapter.id,
      versionNo: nextChapterContentVersionNo(options.input.context.tenantId, options.input.novel.id, options.chapterDraft.chapter.id),
      status: VersionStatus.Current,
      staleLevel: StaleLevel.None,
      sourceType: 'mock_ai',
      sourceTaskId: options.taskId,
      sourceVersionRefs: options.sourceVersionRefs,
      rewriteReason: '连续试写生成章节正文',
      content: options.chapterDraft.content,
      wordCount: countWords(options.chapterDraft.content),
      summary: options.chapterDraft.summary,
      reviewScore: options.chapterDraft.scoring.totalScore,
      decisionRecordId: null,
      createdBy: options.input.context.userId,
      createdAt: options.input.now,
      metadata: {
        trialRunId: options.input.trialRun.id,
        trialStatus: 'selected_for_trial',
        chapterNo: options.chapterDraft.chapter.chapterNo,
        title: options.chapterDraft.chapter.title,
        openingStrategy: options.chapterDraft.openingStrategy,
        openingHighlight: options.chapterDraft.openingHighlight,
        firstSentence: options.chapterDraft.firstSentence,
        first300Summary: options.chapterDraft.first300Summary,
        endingHook: options.chapterDraft.endingHook,
        riskLevel: options.chapterDraft.riskLevel,
        riskTags: options.chapterDraft.riskTags,
        aiRecommendedReason: options.chapterDraft.aiRecommendedReason,
        isAiRecommended: false,
        isSelected: true,
        scoring: options.chapterDraft.scoring
      }
    };
  }

  function createChapterFeatureCard(options: {
    input: TrialFollowupGenerationInput;
    taskId: string;
    chapterDraft: TrialFollowupGenerationInput['chapters'][number];
  }): ChapterFeatureCardRecord {
    const draft = options.chapterDraft.featureCard;

    return {
      id: nextId('feature'),
      tenantId: options.input.context.tenantId,
      novelId: options.input.novel.id,
      chapterId: options.chapterDraft.chapter.id,
      versionNo: nextFeatureCardVersionNo(options.input.context.tenantId, options.chapterDraft.chapter.id),
      status: VersionStatus.Current,
      staleLevel: StaleLevel.None,
      oneLineSummary: draft.oneLineSummary,
      coreTask: draft.coreTask,
      mainConflict: draft.mainConflict,
      appealPoint: draft.appealPoint,
      emotionKeywords: draft.emotionKeywords,
      characterChanges: draft.characterChanges,
      relationshipChanges: draft.relationshipChanges,
      keyInformation: draft.keyInformation,
      foreshadowingOperation: draft.foreshadowingOperation,
      endingHook: draft.endingHook,
      factsCannotChange: draft.factsCannotChange,
      featuresToStrengthen: draft.featuresToStrengthen,
      sourceTaskId: options.taskId,
      decisionRecordId: null,
      createdAt: options.input.now,
      metadata: draft.metadata
    };
  }

  function createChapterReviewReport(options: {
    input: TrialFollowupGenerationInput;
    taskId: string;
    chapterDraft: TrialFollowupGenerationInput['chapters'][number];
    contentVersionId: string;
  }): ReviewReportRecord {
    const draft = options.chapterDraft.review;

    return {
      id: nextId('review'),
      tenantId: options.input.context.tenantId,
      novelId: options.input.novel.id,
      objectType: 'chapter',
      objectId: options.chapterDraft.chapter.id,
      objectVersionId: options.contentVersionId,
      reviewLevel: draft.reviewLevel,
      totalScore: draft.totalScore,
      subScores: draft.subScores,
      rating: draft.rating,
      summary: draft.summary,
      strengths: draft.strengths,
      problems: draft.problems,
      suggestions: draft.suggestions,
      issueCards: draft.issueCards,
      actionOptions: draft.actionOptions,
      recommendedAction: draft.recommendedAction,
      allowNextStep: draft.allowNextStep,
      blockingIssueCount: draft.blockingIssueCount,
      resolvedStatus: draft.resolvedStatus,
      promptTemplateVersionId: draft.promptTemplateVersionId,
      policyProfileVersionId: draft.policyProfileVersionId ?? options.input.novel.policyProfileVersionId,
      sourceTaskId: options.taskId,
      createdAt: options.input.now,
      metadata: draft.metadata
    };
  }

  function createTrialReviewReport(options: {
    input: TrialFollowupGenerationInput;
    taskId: string;
  }): ReviewReportRecord {
    const review = options.input.review;

    return {
      id: nextId('review'),
      tenantId: options.input.context.tenantId,
      novelId: options.input.novel.id,
      objectType: 'trial_run',
      objectId: options.input.trialRun.id,
      objectVersionId: null,
      reviewLevel: 'trial',
      totalScore: review.totalScore,
      subScores: {
        scoringStrategyVersion: 'trial-summary-score-v1',
        chapterScores: review.chapterScores
      },
      rating: review.trialResult,
      summary: review.summary,
      strengths: review.strengths,
      problems: review.problems,
      suggestions: review.suggestions,
      issueCards: review.problems.map((problem) => ({
        severity: review.trialResult === 'blocked' ? 'blocking' : 'warning',
        dimension: 'trial_summary',
        message: problem,
        suggestion: review.suggestions[0] ?? '查看试写总评'
      })),
      actionOptions: [review.recommendedAction],
      recommendedAction: review.recommendedAction,
      allowNextStep: review.allowNextStep,
      blockingIssueCount: review.trialResult === 'blocked' ? 1 : 0,
      resolvedStatus: 'open',
      promptTemplateVersionId: null,
      policyProfileVersionId: options.input.novel.policyProfileVersionId,
      sourceTaskId: options.taskId,
      createdAt: options.input.now,
      metadata: {
        scoringStrategyVersion: 'trial-summary-score-v1',
        trialResult: review.trialResult,
        requiresRiskConfirmation: review.requiresRiskConfirmation,
        chapterScores: review.chapterScores
      }
    };
  }

  function appendTaskProgressEvents(task: GenerationTaskRecord, requestId: string, now: Date) {
    appendModelTaskLifecycleEvents(task, requestId, now);
  }

  function appendModelTaskLifecycleEvents(
    task: GenerationTaskRecord,
    requestId: string,
    now: Date,
    messages: {
      preparing?: string;
      calling?: string;
      parsing?: string;
      quality?: string;
      saving?: string;
    } = {}
  ) {
    const createdAt = now.getTime();
    appendTaskEvent(task, {
      eventType: 'preparing_context',
      message: messages.preparing ?? '正在准备上下文、版本引用和生成参数。',
      progress: 0,
      requestId,
      createdAt: new Date(createdAt)
    });
    appendTaskEvent(task, {
      eventType: 'calling_model',
      message: messages.calling ?? '正在调用模型生成内容，可能需要 1-3 分钟，可以稍后回来查看。',
      progress: 35,
      requestId,
      createdAt: new Date(createdAt + 1)
    });
    appendTaskEvent(task, {
      eventType: 'parsing_output',
      message: messages.parsing ?? '模型返回后正在解析结构化输出。',
      progress: 65,
      requestId,
      createdAt: new Date(createdAt + 2)
    });
    appendTaskEvent(task, {
      eventType: 'quality_checking',
      message: messages.quality ?? '正在检查输出完整性、评分和风险门禁。',
      progress: 82,
      requestId,
      createdAt: new Date(createdAt + 3)
    });
    appendTaskEvent(task, {
      eventType: 'saving_result',
      message: messages.saving ?? task.currentStep ?? '正在保存生成结果和任务摘要。',
      progress: task.progress,
      requestId,
      createdAt: new Date(createdAt + 4)
    });
  }

  function appendTaskEvent(
    task: GenerationTaskRecord,
    input: {
      eventType: string;
      message: string;
      progress: number | null;
      requestId: string;
      createdAt: Date;
    }
  ): GenerationTaskEventRecord {
    const event: GenerationTaskEventRecord = {
      id: nextId('taskevent'),
      tenantId: task.tenantId,
      taskId: task.id,
      status: task.status,
      eventType: input.eventType,
      message: input.message,
      progress: input.progress,
      payload: {
        requestId: input.requestId
      },
      createdAt: input.createdAt
    };

    generationTaskEvents.push(event);

    return event;
  }

  function getDirectionRevisionTaskStep(taskType: string) {
    if (taskType === 'novel_direction_fuse') return '融合方向候选已生成';
    if (taskType === 'novel_direction_manual_edit') return '手动编辑方向候选已保存';
    return '优化方向候选已生成';
  }

  function getDirectionRevisionOutputSummary(taskType: string) {
    if (taskType === 'novel_direction_fuse') return '生成融合方向候选，等待用户采用。';
    if (taskType === 'novel_direction_manual_edit') return '保存手动编辑方向候选，等待用户采用。';
    return '生成优化方向候选，等待用户采用。';
  }

  function getDirectionRevisionSourceType(taskType: string) {
    return taskType === 'novel_direction_manual_edit' ? 'manual_edit' : 'mock_ai';
  }

  function getTaskSourceVersionRefs(input: DirectionCreationInput | DirectionRevisionInput | StructureCreationInput | StructureGenerationTaskCreationInput, objectType: string) {
    if ('sourceVersionRefs' in input) {
      return input.sourceVersionRefs;
    }

    if ('sourceVersionIds' in input) {
      return {
        sourceVersionIds: input.sourceVersionIds,
        currentDirectionVersionId: input.novel.currentDirectionVersionId
      };
    }

    return {
      currentDirectionVersionId: input.novel.currentDirectionVersionId,
      objectType
    };
  }

  function getTaskInputSummary(taskType: string, objectType: string) {
    if (taskType === 'novel_direction_generate') return '根据小说草稿和创作偏好生成方向候选。';
    if (taskType === 'novel_direction_fuse') return '融合用户选择的方向候选，生成一个新候选版本。';
    if (taskType === 'novel_direction_optimize') return '基于用户指令优化方向候选，生成一个新候选版本。';
    if (taskType === 'novel_direction_manual_edit') return '保存用户手动编辑的方向内容，生成一个新候选版本。';
    return `根据已确认上游资产生成${getStructureObjectText(objectType)}候选。`;
  }

  function getStructureObjectText(objectType: string) {
    if (objectType === 'setting') return '设定';
    if (objectType === 'outline') return '全书大纲';
    if (objectType === 'stage_outline') return '阶段大纲';
    if (objectType === 'chapter_plan') return '章节目录';
    return objectType;
  }

  function createCreativeVersion(options: {
    id: string;
    input: DirectionCreationInput | DirectionRevisionInput;
    candidate: DirectionCreationInput['candidates'][number];
    taskId: string;
    versionNo: number;
    sourceVersionRefs?: unknown;
  }): CreativeVersionRecord {
    return {
      id: options.id,
      tenantId: options.input.context.tenantId,
      novelId: options.input.novel.id,
      objectType: 'direction',
      objectId: 'direction',
      versionNo: options.versionNo,
      status: VersionStatus.Candidate,
      staleLevel: StaleLevel.None,
      sourceType: 'sourceVersionIds' in options.input ? getDirectionRevisionSourceType(options.input.taskType) : 'mock_ai',
      sourceTaskId: options.taskId,
      sourceVersionRefs: options.sourceVersionRefs ?? {
        currentDirectionVersionId: options.input.novel.currentDirectionVersionId
      },
      changeReason: options.input.changeReason,
      content: options.candidate.content,
      summary: options.candidate.summary,
      score: options.candidate.score,
      riskLevel: options.candidate.riskLevel,
      decisionRecordId: null,
      createdBy: options.input.context.userId,
      createdAt: options.input.now,
      metadata: {
        marketScore: options.candidate.marketScore,
        riskTags: options.candidate.riskTags,
        recommendedReason: options.candidate.recommendedReason
      }
    };
  }

  function nextDirectionVersionNo(tenantId: string, novelId: string) {
    return nextVersionNo(tenantId, novelId, 'direction');
  }

  function createStructureVersion(options: {
    id: string;
    input: StructureCreationInput;
    taskId: string;
    versionNo: number;
  }): CreativeVersionRecord {
    return {
      id: options.id,
      tenantId: options.input.context.tenantId,
      novelId: options.input.novel.id,
      objectType: options.input.asset.objectType,
      objectId: options.input.asset.objectType,
      versionNo: options.versionNo,
      status: VersionStatus.Candidate,
      staleLevel: StaleLevel.None,
      sourceType: 'mock_ai',
      sourceTaskId: options.taskId,
      sourceVersionRefs: options.input.sourceVersionRefs,
      changeReason: options.input.changeReason,
      content: options.input.asset.content,
      summary: options.input.asset.summary,
      score: options.input.asset.score,
      riskLevel: options.input.asset.riskLevel,
      decisionRecordId: null,
      createdBy: options.input.context.userId,
      createdAt: options.input.now,
      metadata: {
        riskTags: options.input.asset.riskTags,
        recommendedReason: options.input.asset.recommendedReason
      }
    };
  }

  function nextVersionNo(tenantId: string, novelId: string, objectType: string) {
    const maxVersionNo = creativeVersions
      .filter((version) => version.tenantId === tenantId && version.novelId === novelId && version.objectType === objectType)
      .reduce((max, version) => Math.max(max, version.versionNo), 0);

    return maxVersionNo + 1;
  }

  function nextChapterContentVersionNo(tenantId: string, novelId: string, chapterId: string) {
    const maxVersionNo = chapterContentVersions
      .filter((version) => version.tenantId === tenantId && version.novelId === novelId && version.chapterId === chapterId)
      .reduce((max, version) => Math.max(max, version.versionNo), 0);

    return maxVersionNo + 1;
  }

  function nextFeatureCardVersionNo(tenantId: string, chapterId: string) {
    const maxVersionNo = chapterFeatureCards
      .filter((card) => card.tenantId === tenantId && card.chapterId === chapterId)
      .reduce((max, card) => Math.max(max, card.versionNo), 0);

    return maxVersionNo + 1;
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

  function createNovelPatchAfterStructureAdoption(input: StructureAdoptionInput): Partial<NovelRecord> {
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
        creationStage: NovelCreationStage.Outline,
        stageStatus: StageStatus.NotStarted
      };
    }

    if (input.objectType === 'outline') {
      return {
        ...base,
        currentOutlineVersionId: input.candidate.id,
        currentStageOutlineVersionId: null,
        currentChapterPlanVersionId: null,
        creationStage: NovelCreationStage.Outline,
        stageStatus: StageStatus.NotStarted
      };
    }

    if (input.objectType === 'stage_outline') {
      return {
        ...base,
        currentStageOutlineVersionId: input.candidate.id,
        currentChapterPlanVersionId: null,
        creationStage: NovelCreationStage.ChapterPlan,
        stageStatus: StageStatus.NotStarted
      };
    }

    return {
      ...base,
      currentChapterPlanVersionId: input.candidate.id,
      creationStage: NovelCreationStage.Trial,
      stageStatus: StageStatus.NotStarted
    };
  }

  function refreshChapters(input: StructureAdoptionInput) {
    const content = input.candidate.content as StructureAssetDraft['content'];
    const plannedChapters = content.chapters;
    const existing = chapters.filter((chapter) => chapter.tenantId === input.context.tenantId && chapter.novelId === input.novel.id && !chapter.deletedAt);
    const existingByNo = new Map(existing.map((chapter) => [chapter.chapterNo, chapter]));
    const plannedNos = new Set(plannedChapters.map((chapter) => chapter.chapterNo));

    for (const chapter of existing) {
      if (!plannedNos.has(chapter.chapterNo)) {
        chapter.deletedAt = input.now;
        chapter.updatedAt = input.now;
      }
    }

    for (const planned of plannedChapters) {
      const existingChapter = existingByNo.get(planned.chapterNo);
      if (existingChapter) {
        existingChapter.stageIndex = planned.stageIndex;
        existingChapter.title = planned.title;
        existingChapter.wordTarget = planned.wordTarget;
        existingChapter.statusNote = '章节目录已刷新，正文尚未生成。';
        existingChapter.updatedAt = input.now;
        continue;
      }

      chapters.push({
        id: nextId('chapter'),
        tenantId: input.context.tenantId,
        novelId: input.novel.id,
        chapterNo: planned.chapterNo,
        stageIndex: planned.stageIndex,
        title: planned.title,
        wordTarget: planned.wordTarget,
        wordCount: 0,
        mainStatus: 'pending',
        statusNote: '章节目录已确认，正文尚未生成。',
        impactLevel: 'none',
        currentFeatureCardVersionId: null,
        currentContentVersionId: null,
        currentReviewReportId: null,
        lastGenerationTaskId: null,
        createdAt: input.now,
        updatedAt: input.now,
        deletedAt: null,
        metadata: {}
      });
    }
  }

  function normalizeStructureContent(value: unknown): StructureAssetContentDTO {
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

  function createNovelLevelTask(options: {
    novel: NovelRecord;
    context: RequestContext;
    now: Date;
    taskId: string;
    taskType: string;
    objectType: string;
    currentStep: string;
    sourceVersionRefs: unknown;
    idempotencyKey: string;
    requestFingerprint: unknown;
  }): GenerationTaskRecord {
    return {
      ...legacyExecutionFields(options.taskId, options.now),
      id: options.taskId,
      tenantId: options.context.tenantId,
      novelId: options.novel.id,
      taskType: options.taskType,
      objectType: options.objectType,
      objectId: options.novel.id,
      status: TaskStatus.Processing,
      statusNote: options.currentStep,
      progress: 10,
      currentStep: options.currentStep,
      triggerSource: 'manual',
      sourceVersionRefs: options.sourceVersionRefs,
      conflictScope: options.taskType === 'novel_full_review' ? 'novel_full_review' : 'novel_video_readiness',
      conflictKey: options.novel.id,
      idempotencyToken: null,
      requestHash: null,
      activeClaimKey: null,
      inputSummary: options.taskType === 'novel_full_review' ? '基于全书正文和审稿策略执行全书审稿。' : '基于完成决策执行待视频化检查。',
      outputSummary: null,
      resultVersionIds: [],
      retryOfTaskId: null,
      failureCategory: null,
      errorCode: null,
      errorMessage: null,
      resultObjectType: null,
      resultObjectId: null,
      userAcceptedResult: false,
      cancelRequestedAt: null,
      cancelReason: null,
      startedAt: options.now,
      finishedAt: null,
      createdBy: options.context.userId,
      createdAt: options.now,
      updatedAt: options.now,
      metadata: {
        requestId: options.context.requestId,
        idempotencyKey: options.idempotencyKey,
        requestFingerprint: options.requestFingerprint
      }
    };
  }

  function createFullReviewGateRecord(options: {
    input: FullReviewCreationInput;
    reviewReport: ReviewReportRecord;
    gateResult: FullReviewGateRecord['gateResult'];
    forcePassReason: string | null;
  }): FullReviewGateRecord {
    const issues = toIssueCards(options.reviewReport.issueCards);
    const blockingIssueCount = issues.filter((issue) => issue.blocking && issue.status === 'open').length;
    const warningIssueCount = issues.filter((issue) => issue.severity === 'warning' && issue.status === 'open').length;
    const score = options.reviewReport.totalScore ?? 0;
    const allowCompletion = options.gateResult === 'pass' || options.gateResult === 'warning' || options.gateResult === 'forced_pass';

    return {
      id: nextId('fullGate'),
      tenantId: options.input.context.tenantId,
      novelId: options.input.novel.id,
      reviewReportId: options.reviewReport.id,
      gateResult: options.gateResult,
      allowCompletion,
      allowVideoReady: allowCompletion,
      blockingIssueCount,
      warningIssueCount,
      forcePassAllowed: options.gateResult === 'blocked' && score >= 60 && score < 70,
      forcePassReason: options.forcePassReason,
      isStale: false,
      staleReason: null,
      sourceVersionRefs: options.input.sourceVersionRefs,
      policyProfileVersionId: options.input.draft.reviewPolicyVersionId,
      createdAt: options.input.now,
      updatedAt: options.input.now,
      metadata: {
        score,
        idempotencyKey: options.input.idempotencyKey
      }
    };
  }

  function createVideoReadinessCheckRecord(options: {
    input: CompletionConfirmationInput | (VideoReadinessCheckInput & {
      idempotencyKey?: string;
      reason?: string;
      confirmRisk?: boolean;
    });
    completionDecision: CompletionDecisionRecord | null;
    taskId: string | null;
  }): VideoReadinessCheckRecord {
    const input = options.input;
    const reviewReport = 'reviewReport' in input ? input.reviewReport : null;
    const metadata = toMutableMetadata(reviewReport?.metadata);
    const suggestion = toFirstVideoSuggestion(metadata.firstVideoSuggestion);
    const sourceVersionRefs = input.sourceVersionRefs;
    const contentChapters = input.chapters.filter((chapter) => chapter.currentContentVersionId && chapter.mainStatus === 'completed');
    const allChaptersComplete = input.chapters.length > 0 && contentChapters.length === input.chapters.length;
    const hasFirstVideoSuggestion = Boolean(suggestion.chapterRange && suggestion.narrationHook && suggestion.firstScreenSubtitle && suggestion.titleHook && suggestion.openingSlice);
    const platformRisks = Array.isArray(metadata.platformRisks) ? metadata.platformRisks.filter((item): item is string => typeof item === 'string') : [];
    const hasBlockingSafetyRisk = platformRisks.some((risk) => /强阻塞|高危|违规/.test(risk));
    const items: VideoReadinessCheckItemDTO[] = [
      {
        key: 'completion_confirmed',
        label: '完成确认',
        passed: Boolean(options.completionDecision),
        severity: 'blocking',
        message: options.completionDecision ? '小说完成决策已记录。' : '尚未确认小说完成。',
        nextAction: options.completionDecision ? '继续待视频化检查。' : '先确认小说完成。'
      },
      {
        key: 'chapters_complete',
        label: '章节正文完整',
        passed: allChaptersComplete,
        severity: 'blocking',
        message: allChaptersComplete ? '所有计划章节都有正式正文。' : '仍有章节缺少正式正文或审稿摘要。',
        nextAction: allChaptersComplete ? '继续检查。' : '回到正文生成区补齐章节。'
      },
      {
        key: 'content_safety',
        label: '内容安全',
        passed: !hasBlockingSafetyRisk,
        severity: 'blocking',
        message: hasBlockingSafetyRisk ? '存在内容安全强阻塞风险。' : '未发现强阻塞内容安全风险。',
        nextAction: hasBlockingSafetyRisk ? '处理内容安全问题后重新检查。' : '继续检查。'
      },
      {
        key: 'first_video_suggestion',
        label: '首条视频建议',
        passed: hasFirstVideoSuggestion,
        severity: 'blocking',
        message: hasFirstVideoSuggestion ? '首条视频建议已生成。' : '首条视频建议不完整，暂不可确认待视频化。',
        nextAction: hasFirstVideoSuggestion ? '可进入待视频化确认。' : '重新执行待视频化检查或补全建议。'
      }
    ];
    const blockingReasons = items.filter((item) => !item.passed && item.severity === 'blocking').map((item) => item.message);
    const version = videoReadinessChecks.filter((check) => check.tenantId === input.novel.tenantId && check.novelId === input.novel.id).length + 1;

    return {
      id: nextId('videoCheck'),
      tenantId: input.novel.tenantId,
      novelId: input.novel.id,
      taskId: options.taskId,
      completionDecisionId: options.completionDecision?.id ?? null,
      reviewReportId: reviewReport?.id ?? null,
      version,
      status: blockingReasons.length > 0 ? 'not_ready' : 'candidate',
      checkItems: items,
      blockingReasons,
      firstVideoSuggestion: suggestion,
      sourceVersionRefs,
      createdAt: input.now,
      metadata: {
        reason: 'reason' in input ? input.reason ?? null : null
      }
    };
  }

  function createVirtualVideoReadinessTask(novel: NovelRecord, check: VideoReadinessCheckRecord, context: RequestContext, now: Date): GenerationTaskRecord {
    const taskId = check.taskId ?? `task_${check.id}`;
    return {
      ...legacyExecutionFields(taskId, now),
      id: taskId,
      tenantId: context.tenantId,
      novelId: novel.id,
      taskType: 'video_readiness_check',
      objectType: 'video_readiness',
      objectId: novel.id,
      status: TaskStatus.Completed,
      statusNote: check.status === 'candidate' || check.status === 'ready' ? '待视频化检查通过。' : '待视频化检查未通过。',
      progress: 100,
      currentStep: '待视频化检查已完成',
      triggerSource: 'manual',
      sourceVersionRefs: check.sourceVersionRefs,
      conflictScope: 'novel_video_readiness',
      conflictKey: novel.id,
      idempotencyToken: null,
      requestHash: null,
      activeClaimKey: null,
      inputSummary: '待视频化检查。',
      outputSummary: check.blockingReasons.join('；') || '待视频化检查通过。',
      resultVersionIds: [],
      retryOfTaskId: null,
      failureCategory: null,
      errorCode: null,
      errorMessage: null,
      resultObjectType: 'video_readiness_check',
      resultObjectId: check.id,
      userAcceptedResult: false,
      cancelRequestedAt: null,
      cancelReason: null,
      startedAt: check.createdAt,
      finishedAt: check.createdAt,
      createdBy: context.userId,
      createdAt: check.createdAt,
      updatedAt: now,
      metadata: {
        requestId: context.requestId
      }
    };
  }

  function createEmptyFullReview(novel: NovelRecord, now: Date): ReviewReportRecord {
    return {
      id: '',
      tenantId: novel.tenantId,
      novelId: novel.id,
      objectType: 'novel',
      objectId: novel.id,
      objectVersionId: null,
      reviewLevel: 'full_novel',
      totalScore: null,
      subScores: [],
      rating: null,
      summary: null,
      strengths: [],
      problems: [],
      suggestions: [],
      issueCards: [],
      actionOptions: [],
      recommendedAction: null,
      allowNextStep: false,
      blockingIssueCount: 0,
      resolvedStatus: 'open',
      promptTemplateVersionId: null,
      policyProfileVersionId: null,
      sourceTaskId: null,
      createdAt: now,
      metadata: {}
    };
  }

  function createEmptyGate(novel: NovelRecord, now: Date): FullReviewGateRecord {
    return {
      id: '',
      tenantId: novel.tenantId,
      novelId: novel.id,
      reviewReportId: '',
      gateResult: 'blocked',
      allowCompletion: false,
      allowVideoReady: false,
      blockingIssueCount: 0,
      warningIssueCount: 0,
      forcePassAllowed: false,
      forcePassReason: null,
      isStale: false,
      staleReason: null,
      sourceVersionRefs: {},
      policyProfileVersionId: null,
      createdAt: now,
      updatedAt: now,
      metadata: {}
    };
  }

  function toIssueCards(value: unknown): FullReviewIssueDTO[] {
    return Array.isArray(value) ? value.map((item) => item as FullReviewIssueDTO) : [];
  }

  function toFirstVideoSuggestion(value: unknown): FirstVideoSuggestionDTO {
    const record = toMutableMetadata(value);

    return {
      chapterRange: typeof record.chapterRange === 'string' ? record.chapterRange : '',
      openingSlice: typeof record.openingSlice === 'string' ? record.openingSlice : '',
      narrationHook: typeof record.narrationHook === 'string' ? record.narrationHook : '',
      firstScreenSubtitle: typeof record.firstScreenSubtitle === 'string' ? record.firstScreenSubtitle : '',
      titleHook: typeof record.titleHook === 'string' ? record.titleHook : '',
      endingSuspense: typeof record.endingSuspense === 'string' ? record.endingSuspense : '',
      suggestedFormat: typeof record.suggestedFormat === 'string' ? record.suggestedFormat : '',
      riskTips: Array.isArray(record.riskTips) ? record.riskTips.filter((item): item is string => typeof item === 'string') : []
    };
  }

  function createOperationLog(input: {
    tenantId: string;
    novelId: string;
    action: string;
    objectType: string;
    objectId: string;
    reason: string;
    context: RequestContext;
    now: Date;
    metadata?: unknown;
  }): OperationLogRecord {
    return {
      id: nextId('oplog'),
      tenantId: input.tenantId,
      userId: input.context.userId,
      novelId: input.novelId,
      action: input.action,
      objectType: input.objectType,
      objectId: input.objectId,
      beforeSnapshot: null,
      afterSnapshot: input.metadata ?? null,
      reason: input.reason,
      impactSummary: null,
      sourceTaskId: null,
      requestId: input.context.requestId,
      ip: input.context.ip ?? null,
      userAgent: input.context.userAgent ?? null,
      createdAt: input.now
    };
  }

  function appendNovelTaskEvents(task: GenerationTaskRecord, requestId: string, now: Date, createdMessage: string, doneMessage: string) {
    appendModelTaskLifecycleEvents(task, requestId, now, {
      preparing: createdMessage,
      calling: '正在调用模型进行审稿或检查，可能需要 1-3 分钟，可以稍后回来查看。',
      parsing: '模型返回后正在解析审稿或检查结果。',
      quality: '正在检查门禁、风险和下一步建议。',
      saving: doneMessage
    });
  }

  function mutateNovel(novelId: string, patch: Partial<NovelRecord>) {
    const novel = novels.find((item) => item.id === novelId);
    if (!novel) return;
    Object.assign(novel, patch);
  }

  function assertNoActiveAuthorityClaim(tenantId: string, novelId: string, allowedTaskId?: string) {
    // Every in-memory authority writer calls this before its synchronous mutation block.
    const activeTask = generationTasks.find((task) =>
      task.tenantId === tenantId
      && task.novelId === novelId
      && task.id !== allowedTaskId
      && task.status === TaskStatus.Processing
      && task.activeClaimKey !== null
    );
    if (!activeTask) return;
    throw new BusinessError(ErrorCode.ConflictTaskExists, '小说权威来源正在被生成任务使用，请等待任务结束或先取消任务。', {
      taskId: activeTask.id,
      taskType: activeTask.taskType
    });
  }

  function requireClaimedTask(task: GenerationTaskRecord, tenantId: string) {
    const stored = generationTasks.find((item) => item.id === task.id && item.tenantId === tenantId);
    if (!stored) throw new Error('Claimed generation task is missing');
    return stored;
  }

  function validLease(tenantId: string, taskId: string, leaseOwnerId: string, leaseToken: string, authoritativeNow: Date) {
    return generationTasks.find((task) => task.tenantId === tenantId && task.id === taskId && task.status === TaskStatus.Processing
      && task.leaseOwnerId === leaseOwnerId && task.leaseToken === leaseToken
      && task.leaseExpiresAt != null && task.leaseExpiresAt.getTime() > authoritativeNow.getTime()) ?? null;
  }

  function clearLease(task: GenerationTaskRecord) {
    task.activeClaimKey = null;
    task.leaseOwnerId = null;
    task.leaseToken = null;
    task.leaseExpiresAt = null;
  }

  function applyLeaseFailure(task: GenerationTaskRecord, failure: { failureCategory: string; errorCode: string; errorMessage: string; statusNote: string }, now: Date, eventType = 'task_failed') {
    task.status = TaskStatus.Failed;
    task.statusNote = failure.statusNote;
    task.failureCategory = failure.failureCategory;
    task.errorCode = failure.errorCode;
    task.errorMessage = failure.errorMessage;
    task.currentStep = 'failed';
    task.finishedAt = now;
    task.updatedAt = now;
    clearLease(task);
    appendLeaseEvent(task, eventType, failure.statusNote, now);
  }

  function failUnsupportedQueuedTask(task: GenerationTaskRecord, now: Date) {
    task.status = TaskStatus.Failed;
    task.statusNote = '任务执行合同或可信身份无效，已安全失败。';
    task.currentStep = 'failed';
    task.failureCategory = 'worker_payload_unsupported';
    task.errorCode = 'WORKER_PAYLOAD_UNSUPPORTED';
    task.errorMessage = 'Execution envelope V1.1 or trusted audit actor is invalid.';
    task.activeClaimKey = null;
    task.finishedAt = now;
    task.updatedAt = now;
  }

  function appendLeaseEvent(task: GenerationTaskRecord, eventType: string, message: string, now: Date) {
    generationTaskEvents.push({ id: nextId('event'), tenantId: task.tenantId, taskId: task.id, status: task.status, eventType, message, progress: task.progress, payload: null, createdAt: now });
  }

  function legacyExecutionFields(taskId: string, now: Date) {
    return {
      policyProfileVersionId: null,
      modelRoutingVersion: null,
      leaseOwnerId: null,
      leaseToken: null,
      leaseExpiresAt: null,
      lastHeartbeatAt: null,
      retryCount: 0,
      maxRetries: 2,
      executionEnvelopeJson: null,
      providerAttemptId: null,
      providerAttemptPhase: null,
      providerDispatchedAt: null,
      resultReceiptHash: null,
      rootTaskId: taskId,
      providerCallBudgetMax: 0,
      providerCallBudgetUsed: 0,
      durationDeadlineAt: now,
      costBudgetMicrosMax: 0,
      costBudgetMicrosUsed: 0
    } as const;
  }

  function cloneNovel(novelId: string): NovelRecord {
    const novel = novels.find((item) => item.id === novelId);
    if (!novel) {
      throw new Error(`Novel not found in memory repository: ${novelId}`);
    }

    return { ...novel };
  }

  function toMutableMetadata(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {};
  }

  function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  function getMetadataString(value: unknown, key: string) {
    if (!value || typeof value !== 'object') return null;
    const metadata = value as Record<string, unknown>;
    return typeof metadata[key] === 'string' ? metadata[key] : null;
  }

  function isSameRepositoryFingerprint(left: unknown, right: unknown) {
    return stableRepositoryStringify(left) === stableRepositoryStringify(right);
  }

  function stableRepositoryStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => stableRepositoryStringify(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableRepositoryStringify(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function countWords(content: string) {
    return content.replace(/\s/g, '').length;
  }
}
