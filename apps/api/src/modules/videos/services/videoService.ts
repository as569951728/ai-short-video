import {
  ErrorCode,
  type ConfirmVideoNarrationRequest,
  type ConfirmVideoRenderRequest,
  type ConfirmVideoSubtitleRequest,
  type ConfirmVideoTtsRequest,
  type ConfirmVideoVisualPlanRequest,
  type CreateVideoExportRequest,
  VIDEO_WORKBENCH_STEP_KEYS,
  type CreateVideoProjectRequest,
  type GenerateVideoNarrationRequest,
  type GenerateVideoRenderRequest,
  type GenerateVideoSubtitleRequest,
  type GenerateVideoTtsRequest,
  type RecheckVideoReferenceRequest,
  type RejectVideoNarrationRequest,
  type RejectVideoRenderRequest,
  type RejectVideoSubtitleRequest,
  type RejectVideoTtsRequest,
  type RejectVideoVisualPlanRequest,
  type ResolveVideoReferenceIssueRequest,
  type SaveVideoNarrationDraftRequest,
  type SaveVideoSubtitleDraftRequest,
  type SaveVideoVisualPlanRequest,
  type StopVideoProjectRequest,
  type VideoNarrationListDTO,
  type VideoRenderListDTO,
  type VideoSubtitleListDTO,
  type VideoTtsListDTO,
  type VideoVisualPlanListDTO,
  type VideoLifecycleStatus,
  type VideoProductionStatus,
  type VideoProjectActionResultDTO,
  type VideoProjectListDTO,
  type VideoReferenceDetailDTO,
  type VideoReferenceStatus,
  type VideoReadySourceListDTO,
  type VideoWorkbenchDTO,
  type VideoWorkbenchStepDTO,
  type VideoWorkbenchStepKey
} from '@ai-shortvideo/shared';
import { BusinessError } from '../../../shared/errors.js';
import {
  assertIdempotencyToken,
  assertIssueActionAllowed,
  assertReason,
  assertReceiptRequestHash,
  createVideoActionRequestHash,
  toNarrationArtifactDTO,
  toNarrationListDTO,
  toNarrationTaskFromReceipt,
  toExportListDTO,
  toRenderDTO,
  toRenderListDTO,
  toRenderTaskFromReceipt,
  toSubtitleArtifactDTO,
  toSubtitleListDTO,
  toSubtitleTaskFromReceipt,
  toTtsArtifactDTO,
  toTtsListDTO,
  toTtsTaskFromReceipt,
  toUnitDTO,
  toVisualPlanArtifactDTO,
  toVisualPlanListDTO,
  type VideoArtifactRecord,
  type VideoRenderRecord,
  type VideoRepository
} from '../domain/videoDomain.js';
import { DEFAULT_TENANT_ID, DEFAULT_USER_ID, type RequestContext } from '../../novels/domain/novelDomain.js';

export class VideoService {
  constructor(
    private readonly repository: VideoRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  async listSources(input: {
    context: RequestContext;
    page: number;
    pageSize: number;
    keyword?: string;
  }): Promise<VideoReadySourceListDTO> {
    return this.repository.listSources({
      tenantId: input.context.tenantId,
      page: input.page,
      pageSize: input.pageSize,
      keyword: input.keyword
    });
  }

  async listProjects(input: {
    context: RequestContext;
    page: number;
    pageSize: number;
    keyword?: string;
    novelId?: string;
    referenceStatus?: VideoReferenceStatus;
    lifecycleStatus?: VideoLifecycleStatus;
    productionStatus?: VideoProductionStatus;
  }): Promise<VideoProjectListDTO> {
    return this.repository.listProjects({
      tenantId: input.context.tenantId,
      page: input.page,
      pageSize: input.pageSize,
      keyword: input.keyword,
      novelId: input.novelId,
      referenceStatus: input.referenceStatus,
      lifecycleStatus: input.lifecycleStatus,
      productionStatus: input.productionStatus
    });
  }

  async createProject(context: RequestContext, request: CreateVideoProjectRequest): Promise<VideoProjectActionResultDTO & { reusedByIdempotency: boolean }> {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    const requestHash = createVideoActionRequestHash({
      ...request,
      idempotencyToken: undefined
    });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'create_video_project', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const detail = await this.repository.getReferenceDetail(context.tenantId, existingReceipt.resultObjectId);
      if (!detail) throw new BusinessError(ErrorCode.NotFound, '幂等收据对应的视频项目不存在');
      return {
        project: detail.project,
        reference: detail,
        reusedExisting: true,
        reusedByIdempotency: true
      };
    }

    const source = await this.repository.findSourceByNovelId(context.tenantId, request.novelId);
    if (!source || source.videoReadinessSnapshotId !== request.videoReadinessSnapshotId) {
      throw new BusinessError(ErrorCode.InvalidStage, '只有已完成待视频化检查的小说才能创建视频项目');
    }
    const chapterIds = request.chapterRange.mode === 'first_recommended' || request.chapterRange.chapterIds.length === 0
      ? source.firstVideoSuggestion.chapterIds
      : request.chapterRange.chapterIds;
    const chapters = chapterIds
      .map((chapterId) => source.currentChapterVersions.find((chapter) => chapter.chapterId === chapterId))
      .filter((chapter): chapter is NonNullable<typeof chapter> => Boolean(chapter));
    if (chapters.length !== chapterIds.length || chapters.length === 0) {
      throw new BusinessError(ErrorCode.GateBlocked, '引用章节必须存在正式正文版本');
    }

    const result = await this.repository.createProjectWithReference({
      context,
      request: {
        ...request,
        idempotencyToken
      },
      requestHash,
      source,
      chapters,
      now: this.now()
    });

    return {
      ...result,
      reusedByIdempotency: false
    };
  }

  async getReference(context: RequestContext, videoId: string): Promise<VideoReferenceDetailDTO> {
    const detail = await this.repository.getReferenceDetail(context.tenantId, videoId);
    if (!detail) throw new BusinessError(ErrorCode.NotFound, '视频项目不存在');
    return detail;
  }

  async getWorkbench(context: RequestContext, videoId: string): Promise<VideoWorkbenchDTO> {
    const detail = await this.getReference(context, videoId);
    const defaultUnit = await this.repository.findDefaultUnit(context.tenantId, videoId);
    if (!defaultUnit) throw new BusinessError(ErrorCode.NotFound, '默认视频单元不存在');
    const artifacts = await this.repository.listNarrationArtifacts(context.tenantId, videoId);
    const latestTask = toNarrationTaskFromReceipt((await this.repository.listActionReceipts(context.tenantId, videoId, 'generate_video_narration', 1))[0] ?? null);
    const ttsArtifacts = await this.repository.listTtsArtifacts(context.tenantId, videoId);
    const latestTtsTask = toTtsTaskFromReceipt((await this.repository.listActionReceipts(context.tenantId, videoId, 'generate_video_tts', 1))[0] ?? null);
    const subtitleArtifacts = await this.repository.listSubtitleArtifacts(context.tenantId, videoId);
    const latestSubtitleTask = toSubtitleTaskFromReceipt((await this.repository.listActionReceipts(context.tenantId, videoId, 'generate_video_subtitle', 1))[0] ?? null);
    const visualPlanArtifacts = await this.repository.listVisualPlanArtifacts(context.tenantId, videoId);
    const renderRecords = await this.repository.listRenders(context.tenantId, videoId);
    const latestRenderTask = toRenderTaskFromReceipt((await this.repository.listActionReceipts(context.tenantId, videoId, 'generate_video_render', 1))[0] ?? null);
    const exportRecords = await this.repository.listExports(context.tenantId, videoId);
    const narrations = { ...toNarrationListDTO(artifacts), activeTask: latestTask };
    const tts = { ...toTtsListDTO(ttsArtifacts), activeTask: latestTtsTask };
    const subtitles = { ...toSubtitleListDTO(subtitleArtifacts), activeTask: latestSubtitleTask };
    const visualPlans = toVisualPlanListDTO(visualPlanArtifacts);
    const renders = toRenderListDTO(renderRecords, latestRenderTask);
    const exports = toExportListDTO(exportRecords);

    return createP9eWorkbenchDTO(detail, toUnitDTO(defaultUnit), narrations, tts, subtitles, visualPlans, renders, exports, latestTask, latestTtsTask, latestSubtitleTask, latestRenderTask);
  }

  async listNarrations(context: RequestContext, videoId: string): Promise<VideoNarrationListDTO> {
    await this.assertProjectExists(context, videoId);
    const artifacts = await this.repository.listNarrationArtifacts(context.tenantId, videoId);
    const latestTask = toNarrationTaskFromReceipt((await this.repository.listActionReceipts(context.tenantId, videoId, 'generate_video_narration', 1))[0] ?? null);
    return { ...toNarrationListDTO(artifacts), activeTask: latestTask };
  }

  async generateNarrations(context: RequestContext, videoId: string, request: GenerateVideoNarrationRequest) {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'generate_video_narration', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const artifacts = await this.repository.listNarrationArtifacts(context.tenantId, videoId);
      const artifactIds = new Set(((existingReceipt.metadata as { artifactIds?: string[] } | null)?.artifactIds ?? []));
      const task = toNarrationTaskFromReceipt(existingReceipt) ?? createCompletedNarrationTask(existingReceipt.resultObjectId, request.retryOfTaskId ?? null);
      return {
        task,
        artifacts: artifacts.filter((artifact) => artifactIds.has(artifact.id)).map(toNarrationArtifactDTO),
        current: toNarrationListDTO(artifacts).current
      };
    }

    const { project, detail, unit } = await this.assertNarrationWritable(context, videoId, request.videoUnitId, request.expectedReferenceVersion);
    const sourceVersionRefs = createNarrationSourceVersionRefs(detail, unit.id);
    return this.repository.createNarrationCandidates({
      context,
      project,
      reference: detail,
      unit,
      request: { ...request, idempotencyToken, candidateCount: clampCandidateCount(request.candidateCount), qualityMode: request.qualityMode ?? 'standard' },
      requestHash,
      sourceVersionRefs,
      now: this.now()
    });
  }

  async saveNarrationDraft(context: RequestContext, videoId: string, request: SaveVideoNarrationDraftRequest) {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    assertNarrationText(request.contentText);
    assertReason(request.reason, '保存旁白编辑稿');
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'save_video_narration_draft', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const artifact = await this.repository.getNarrationArtifact(context.tenantId, videoId, existingReceipt.resultObjectId);
      if (!artifact) throw new BusinessError(ErrorCode.NotFound, '幂等收据对应的旁白版本不存在');
      const narrations = toNarrationListDTO(await this.repository.listNarrationArtifacts(context.tenantId, videoId));
      return { artifact: toNarrationArtifactDTO(artifact), narrations };
    }

    const detail = await this.getReference(context, videoId);
    const unit = await this.repository.findDefaultUnit(context.tenantId, videoId);
    if (!unit) throw new BusinessError(ErrorCode.NotFound, '默认视频单元不存在');
    const project = await this.assertProjectExists(context, videoId);
    assertReferenceNotBlocking(detail);
    return this.repository.saveNarrationDraft({
      context,
      project,
      reference: detail,
      unit,
      request: { ...request, idempotencyToken },
      requestHash,
      sourceVersionRefs: createNarrationSourceVersionRefs(detail, unit.id),
      now: this.now()
    });
  }

  async confirmNarration(context: RequestContext, videoId: string, artifactId: string, request: ConfirmVideoNarrationRequest) {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId, artifactId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'confirm_video_narration', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const artifact = await this.repository.getNarrationArtifact(context.tenantId, videoId, existingReceipt.resultObjectId);
      if (!artifact) throw new BusinessError(ErrorCode.NotFound, '幂等收据对应的旁白版本不存在');
      return { current: toNarrationArtifactDTO(artifact), narrations: toNarrationListDTO(await this.repository.listNarrationArtifacts(context.tenantId, videoId)) };
    }

    const detail = await this.getReference(context, videoId);
    assertReferenceNotBlocking(detail);
    const project = await this.assertProjectExists(context, videoId);
    const artifact = await this.repository.getNarrationArtifact(context.tenantId, videoId, artifactId);
    if (!artifact) throw new BusinessError(ErrorCode.NotFound, '旁白版本不存在');
    if (artifact.versionNo !== request.expectedVersionNo) throw new BusinessError(ErrorCode.VersionConflict, '旁白版本已变化，请刷新后重试');
    if (artifact.sourceVersionRefs.videoReferenceId !== detail.referenceId || artifact.sourceVersionRefs.videoReferenceVersion !== detail.versionNo) {
      throw new BusinessError(ErrorCode.CandidateStale, '旁白来源引用已变化，请重新生成旁白候选');
    }
    if ((artifact.score < 70 || artifact.riskTags.some((tag) => /高风险|风险偏高|敏感|火药/.test(tag))) && !request.riskContinueReason?.trim()) {
      throw new BusinessError(ErrorCode.ValidationError, '确认低分或高风险旁白必须填写原因');
    }
    return this.repository.confirmNarration({
      context,
      project,
      artifact,
      request: { ...request, idempotencyToken },
      requestHash,
      now: this.now()
    });
  }

  async rejectNarration(context: RequestContext, videoId: string, artifactId: string, request: RejectVideoNarrationRequest) {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    assertReason(request.reason, '标记不采用旁白');
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId, artifactId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'reject_video_narration', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const artifact = await this.repository.getNarrationArtifact(context.tenantId, videoId, existingReceipt.resultObjectId);
      if (!artifact) throw new BusinessError(ErrorCode.NotFound, '幂等收据对应的旁白版本不存在');
      return { artifact: toNarrationArtifactDTO(artifact), narrations: toNarrationListDTO(await this.repository.listNarrationArtifacts(context.tenantId, videoId)) };
    }

    const project = await this.assertProjectExists(context, videoId);
    const artifact = await this.repository.getNarrationArtifact(context.tenantId, videoId, artifactId);
    if (!artifact) throw new BusinessError(ErrorCode.NotFound, '旁白版本不存在');
    return this.repository.rejectNarration({
      context,
      project,
      artifact,
      request: { ...request, idempotencyToken },
      requestHash,
      now: this.now()
    });
  }

  async listTts(context: RequestContext, videoId: string): Promise<VideoTtsListDTO> {
    await this.assertProjectExists(context, videoId);
    const artifacts = await this.repository.listTtsArtifacts(context.tenantId, videoId);
    const latestTask = toTtsTaskFromReceipt((await this.repository.listActionReceipts(context.tenantId, videoId, 'generate_video_tts', 1))[0] ?? null);
    return { ...toTtsListDTO(artifacts), activeTask: latestTask };
  }

  async generateTts(context: RequestContext, videoId: string, request: GenerateVideoTtsRequest) {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    assertTtsParams(request);
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'generate_video_tts', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const artifacts = await this.repository.listTtsArtifacts(context.tenantId, videoId);
      const artifactIds = new Set(((existingReceipt.metadata as { artifactIds?: string[] } | null)?.artifactIds ?? []));
      const task = toTtsTaskFromReceipt(existingReceipt) ?? createCompletedTtsTask(existingReceipt.resultObjectId, request.retryOfTaskId ?? null);
      return {
        task,
        artifacts: artifacts.filter((artifact) => artifactIds.has(artifact.id)).map(toTtsArtifactDTO),
        current: toTtsListDTO(artifacts).current
      };
    }

    const { project, detail, unit, narration } = await this.assertTtsWritable(context, videoId, request);
    return this.repository.createTtsCandidate({
      context,
      project,
      reference: detail,
      unit,
      narration,
      request: {
        ...request,
        idempotencyToken,
        voiceName: request.voiceName ?? resolveTtsVoiceName(request.voiceId),
        qualityMode: request.qualityMode ?? 'standard'
      },
      requestHash,
      sourceVersionRefs: createTtsSourceVersionRefs(detail, unit.id, narration),
      now: this.now()
    });
  }

  async confirmTts(context: RequestContext, videoId: string, artifactId: string, request: ConfirmVideoTtsRequest) {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId, artifactId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'confirm_video_tts', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const artifact = await this.repository.getTtsArtifact(context.tenantId, videoId, existingReceipt.resultObjectId);
      if (!artifact) throw new BusinessError(ErrorCode.NotFound, '幂等收据对应的配音版本不存在');
      return { current: toTtsArtifactDTO(artifact), tts: toTtsListDTO(await this.repository.listTtsArtifacts(context.tenantId, videoId)) };
    }

    const detail = await this.getReference(context, videoId);
    assertReferenceNotBlocking(detail);
    const project = await this.assertProjectExists(context, videoId);
    const artifact = await this.repository.getTtsArtifact(context.tenantId, videoId, artifactId);
    if (!artifact) throw new BusinessError(ErrorCode.NotFound, '配音版本不存在');
    if (artifact.versionNo !== request.expectedVersionNo) throw new BusinessError(ErrorCode.VersionConflict, '配音版本已变化，请刷新后重试');
    await this.assertCurrentNarrationMatchesTts(context, videoId, detail, artifact);
    return this.repository.confirmTts({
      context,
      project,
      artifact,
      request: { ...request, idempotencyToken },
      requestHash,
      now: this.now()
    });
  }

  async rejectTts(context: RequestContext, videoId: string, artifactId: string, request: RejectVideoTtsRequest) {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    assertReason(request.reason, '标记不采用配音');
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId, artifactId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'reject_video_tts', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const artifact = await this.repository.getTtsArtifact(context.tenantId, videoId, existingReceipt.resultObjectId);
      if (!artifact) throw new BusinessError(ErrorCode.NotFound, '幂等收据对应的配音版本不存在');
      return { artifact: toTtsArtifactDTO(artifact), tts: toTtsListDTO(await this.repository.listTtsArtifacts(context.tenantId, videoId)) };
    }

    const project = await this.assertProjectExists(context, videoId);
    const artifact = await this.repository.getTtsArtifact(context.tenantId, videoId, artifactId);
    if (!artifact) throw new BusinessError(ErrorCode.NotFound, '配音版本不存在');
    return this.repository.rejectTts({
      context,
      project,
      artifact,
      request: { ...request, idempotencyToken },
      requestHash,
      now: this.now()
    });
  }

  async listSubtitles(context: RequestContext, videoId: string): Promise<VideoSubtitleListDTO> {
    await this.assertProjectExists(context, videoId);
    const artifacts = await this.repository.listSubtitleArtifacts(context.tenantId, videoId);
    const latestTask = toSubtitleTaskFromReceipt((await this.repository.listActionReceipts(context.tenantId, videoId, 'generate_video_subtitle', 1))[0] ?? null);
    return { ...toSubtitleListDTO(artifacts), activeTask: latestTask };
  }

  async generateSubtitles(context: RequestContext, videoId: string, request: GenerateVideoSubtitleRequest) {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    assertSubtitleParams(request);
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'generate_video_subtitle', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const artifacts = await this.repository.listSubtitleArtifacts(context.tenantId, videoId);
      const artifactIds = new Set(((existingReceipt.metadata as { artifactIds?: string[] } | null)?.artifactIds ?? []));
      const task = toSubtitleTaskFromReceipt(existingReceipt) ?? createCompletedSubtitleTask(existingReceipt.resultObjectId, request.retryOfTaskId ?? null);
      return {
        task,
        artifacts: artifacts.filter((artifact) => artifactIds.has(artifact.id)).map(toSubtitleArtifactDTO),
        current: toSubtitleListDTO(artifacts).current
      };
    }

    const { project, detail, unit, narration, tts } = await this.assertSubtitleWritable(context, videoId, request);
    return this.repository.createSubtitleCandidate({
      context,
      project,
      reference: detail,
      unit,
      narration,
      tts,
      request: {
        ...request,
        idempotencyToken,
        lineLength: clampSubtitleLineLength(request.lineLength),
        subtitleStyle: request.subtitleStyle ?? 'balanced',
        qualityMode: request.qualityMode ?? 'standard'
      },
      requestHash,
      sourceVersionRefs: createSubtitleSourceVersionRefs(detail, unit.id, narration, tts),
      now: this.now()
    });
  }

  async saveSubtitleDraft(context: RequestContext, videoId: string, request: SaveVideoSubtitleDraftRequest) {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    assertSubtitleText(request.contentText);
    assertReason(request.reason, '保存字幕编辑稿');
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'save_video_subtitle_draft', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const artifact = await this.repository.getSubtitleArtifact(context.tenantId, videoId, existingReceipt.resultObjectId);
      if (!artifact) throw new BusinessError(ErrorCode.NotFound, '幂等收据对应的字幕版本不存在');
      return { artifact: toSubtitleArtifactDTO(artifact), subtitles: toSubtitleListDTO(await this.repository.listSubtitleArtifacts(context.tenantId, videoId)) };
    }

    const detail = await this.getReference(context, videoId);
    assertReferenceNotBlocking(detail);
    const project = await this.assertProjectExists(context, videoId);
    const unit = await this.repository.findDefaultUnit(context.tenantId, videoId);
    if (!unit) throw new BusinessError(ErrorCode.NotFound, '默认视频单元不存在');
    const { narration, tts } = await this.getCurrentNarrationAndTts(context, videoId, detail);
    return this.repository.saveSubtitleDraft({
      context,
      project,
      reference: detail,
      unit,
      request: { ...request, idempotencyToken },
      requestHash,
      sourceVersionRefs: createSubtitleSourceVersionRefs(detail, unit.id, narration, tts),
      now: this.now()
    });
  }

  async confirmSubtitle(context: RequestContext, videoId: string, artifactId: string, request: ConfirmVideoSubtitleRequest) {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId, artifactId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'confirm_video_subtitle', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const artifact = await this.repository.getSubtitleArtifact(context.tenantId, videoId, existingReceipt.resultObjectId);
      if (!artifact) throw new BusinessError(ErrorCode.NotFound, '幂等收据对应的字幕版本不存在');
      return { current: toSubtitleArtifactDTO(artifact), subtitles: toSubtitleListDTO(await this.repository.listSubtitleArtifacts(context.tenantId, videoId)) };
    }

    const detail = await this.getReference(context, videoId);
    assertReferenceNotBlocking(detail);
    const project = await this.assertProjectExists(context, videoId);
    const artifact = await this.repository.getSubtitleArtifact(context.tenantId, videoId, artifactId);
    if (!artifact) throw new BusinessError(ErrorCode.NotFound, '字幕版本不存在');
    if (artifact.versionNo !== request.expectedVersionNo) throw new BusinessError(ErrorCode.VersionConflict, '字幕版本已变化，请刷新后重试');
    await this.assertCurrentTtsMatchesSubtitle(context, videoId, detail, artifact);
    return this.repository.confirmSubtitle({
      context,
      project,
      artifact,
      request: { ...request, idempotencyToken },
      requestHash,
      now: this.now()
    });
  }

  async rejectSubtitle(context: RequestContext, videoId: string, artifactId: string, request: RejectVideoSubtitleRequest) {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    assertReason(request.reason, '标记不采用字幕');
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId, artifactId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'reject_video_subtitle', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const artifact = await this.repository.getSubtitleArtifact(context.tenantId, videoId, existingReceipt.resultObjectId);
      if (!artifact) throw new BusinessError(ErrorCode.NotFound, '幂等收据对应的字幕版本不存在');
      return { artifact: toSubtitleArtifactDTO(artifact), subtitles: toSubtitleListDTO(await this.repository.listSubtitleArtifacts(context.tenantId, videoId)) };
    }

    const project = await this.assertProjectExists(context, videoId);
    const artifact = await this.repository.getSubtitleArtifact(context.tenantId, videoId, artifactId);
    if (!artifact) throw new BusinessError(ErrorCode.NotFound, '字幕版本不存在');
    return this.repository.rejectSubtitle({
      context,
      project,
      artifact,
      request: { ...request, idempotencyToken },
      requestHash,
      now: this.now()
    });
  }

  async listVisualPlans(context: RequestContext, videoId: string): Promise<VideoVisualPlanListDTO> {
    await this.assertProjectExists(context, videoId);
    return toVisualPlanListDTO(await this.repository.listVisualPlanArtifacts(context.tenantId, videoId));
  }

  async saveVisualPlan(context: RequestContext, videoId: string, request: SaveVideoVisualPlanRequest) {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    assertVisualPlanParams(request);
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'save_video_visual_plan', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const artifact = await this.repository.getVisualPlanArtifact(context.tenantId, videoId, existingReceipt.resultObjectId);
      if (!artifact) throw new BusinessError(ErrorCode.NotFound, '幂等收据对应的视觉方案不存在');
      return { artifact: toVisualPlanArtifactDTO(artifact), visualPlans: toVisualPlanListDTO(await this.repository.listVisualPlanArtifacts(context.tenantId, videoId)) };
    }

    const { project, detail, unit, narration, tts, subtitle } = await this.assertVisualPlanWritable(context, videoId, request);
    return this.repository.saveVisualPlan({
      context,
      project,
      reference: detail,
      unit,
      subtitle,
      request: { ...request, idempotencyToken, backgroundName: request.backgroundName ?? resolveVisualBackgroundName(request.backgroundAssetId), qualityMode: request.qualityMode ?? 'standard' },
      requestHash,
      sourceVersionRefs: createVisualPlanSourceVersionRefs(detail, unit.id, narration, tts, subtitle),
      now: this.now()
    });
  }

  async confirmVisualPlan(context: RequestContext, videoId: string, artifactId: string, request: ConfirmVideoVisualPlanRequest) {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId, artifactId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'confirm_video_visual_plan', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const artifact = await this.repository.getVisualPlanArtifact(context.tenantId, videoId, existingReceipt.resultObjectId);
      if (!artifact) throw new BusinessError(ErrorCode.NotFound, '幂等收据对应的视觉方案不存在');
      return { current: toVisualPlanArtifactDTO(artifact), visualPlans: toVisualPlanListDTO(await this.repository.listVisualPlanArtifacts(context.tenantId, videoId)) };
    }

    const detail = await this.getReference(context, videoId);
    assertReferenceNotBlocking(detail);
    const project = await this.assertProjectExists(context, videoId);
    const artifact = await this.repository.getVisualPlanArtifact(context.tenantId, videoId, artifactId);
    if (!artifact) throw new BusinessError(ErrorCode.NotFound, '视觉方案不存在');
    if (artifact.versionNo !== request.expectedVersionNo) throw new BusinessError(ErrorCode.VersionConflict, '视觉方案版本已变化，请刷新后重试');
    await this.assertCurrentSubtitleMatchesVisualPlan(context, videoId, detail, artifact);
    return this.repository.confirmVisualPlan({
      context,
      project,
      artifact,
      request: { ...request, idempotencyToken },
      requestHash,
      now: this.now()
    });
  }

  async rejectVisualPlan(context: RequestContext, videoId: string, artifactId: string, request: RejectVideoVisualPlanRequest) {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    assertReason(request.reason, '标记不采用视觉方案');
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId, artifactId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'reject_video_visual_plan', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const artifact = await this.repository.getVisualPlanArtifact(context.tenantId, videoId, existingReceipt.resultObjectId);
      if (!artifact) throw new BusinessError(ErrorCode.NotFound, '幂等收据对应的视觉方案不存在');
      return { artifact: toVisualPlanArtifactDTO(artifact), visualPlans: toVisualPlanListDTO(await this.repository.listVisualPlanArtifacts(context.tenantId, videoId)) };
    }

    const project = await this.assertProjectExists(context, videoId);
    const artifact = await this.repository.getVisualPlanArtifact(context.tenantId, videoId, artifactId);
    if (!artifact) throw new BusinessError(ErrorCode.NotFound, '视觉方案不存在');
    return this.repository.rejectVisualPlan({
      context,
      project,
      artifact,
      request: { ...request, idempotencyToken },
      requestHash,
      now: this.now()
    });
  }

  async listRenders(context: RequestContext, videoId: string): Promise<VideoRenderListDTO> {
    await this.assertProjectExists(context, videoId);
    const task = toRenderTaskFromReceipt((await this.repository.listActionReceipts(context.tenantId, videoId, 'generate_video_render', 1))[0] ?? null);
    return toRenderListDTO(await this.repository.listRenders(context.tenantId, videoId), task);
  }

  async generateRender(context: RequestContext, videoId: string, request: GenerateVideoRenderRequest) {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'generate_video_render', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const records = await this.repository.listRenders(context.tenantId, videoId);
      const renderIds = new Set(((existingReceipt.metadata as { renderIds?: string[] } | null)?.renderIds ?? []));
      const task = toRenderTaskFromReceipt(existingReceipt) ?? createCompletedRenderTask(existingReceipt.resultObjectId, request.retryOfTaskId ?? null);
      return {
        task,
        renders: records.filter((record) => renderIds.has(record.id)).map(toRenderDTO),
        current: toRenderListDTO(records).current
      };
    }

    const { project, detail, unit, visualPlan } = await this.assertRenderWritable(context, videoId, request);
    return this.repository.createRender({
      context,
      project,
      reference: detail,
      unit,
      visualPlan,
      request: { ...request, idempotencyToken, qualityMode: request.qualityMode ?? 'standard' },
      requestHash,
      sourceVersionRefs: createRenderSourceVersionRefs(visualPlan, request.expectedVisualPlanVersionNo),
      now: this.now()
    });
  }

  async confirmRender(context: RequestContext, videoId: string, renderId: string, request: ConfirmVideoRenderRequest) {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId, renderId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'confirm_video_render', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const render = await this.repository.getRender(context.tenantId, videoId, existingReceipt.resultObjectId);
      if (!render) throw new BusinessError(ErrorCode.NotFound, '幂等收据对应的渲染版本不存在');
      return { current: toRenderDTO(render), renders: toRenderListDTO(await this.repository.listRenders(context.tenantId, videoId)) };
    }

    const detail = await this.getReference(context, videoId);
    assertReferenceNotBlocking(detail);
    const project = await this.assertProjectExists(context, videoId);
    const render = await this.repository.getRender(context.tenantId, videoId, renderId);
    if (!render) throw new BusinessError(ErrorCode.NotFound, '渲染版本不存在');
    if (render.versionNo !== request.expectedVersionNo) throw new BusinessError(ErrorCode.VersionConflict, '渲染版本已变化，请刷新后重试');
    await this.assertCurrentVisualPlanMatchesRender(context, videoId, detail, render);
    return this.repository.confirmRender({
      context,
      project,
      render,
      request: { ...request, idempotencyToken },
      requestHash,
      now: this.now()
    });
  }

  async rejectRender(context: RequestContext, videoId: string, renderId: string, request: RejectVideoRenderRequest) {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    assertReason(request.reason, '驳回渲染预览');
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId, renderId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'reject_video_render', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const render = await this.repository.getRender(context.tenantId, videoId, existingReceipt.resultObjectId);
      if (!render) throw new BusinessError(ErrorCode.NotFound, '幂等收据对应的渲染版本不存在');
      return { render: toRenderDTO(render), renders: toRenderListDTO(await this.repository.listRenders(context.tenantId, videoId)) };
    }

    const project = await this.assertProjectExists(context, videoId);
    const render = await this.repository.getRender(context.tenantId, videoId, renderId);
    if (!render) throw new BusinessError(ErrorCode.NotFound, '渲染版本不存在');
    return this.repository.rejectRender({
      context,
      project,
      render,
      request: { ...request, idempotencyToken },
      requestHash,
      now: this.now()
    });
  }

  async listExports(context: RequestContext, videoId: string) {
    await this.assertProjectExists(context, videoId);
    return toExportListDTO(await this.repository.listExports(context.tenantId, videoId));
  }

  async createExport(context: RequestContext, videoId: string, request: CreateVideoExportRequest) {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'create_video_export', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const exports = await this.repository.listExports(context.tenantId, videoId);
      const exportRecord = exports.find((item) => item.id === existingReceipt.resultObjectId);
      if (!exportRecord) throw new BusinessError(ErrorCode.NotFound, '幂等收据对应的导出记录不存在');
      return { exportRecord: toExportListDTO([exportRecord]).history[0], exports: toExportListDTO(exports) };
    }

    const detail = await this.getReference(context, videoId);
    assertReferenceNotBlocking(detail);
    const project = await this.assertProjectExists(context, videoId);
    const render = await this.repository.getRender(context.tenantId, videoId, request.renderVersionId);
    if (!render) throw new BusinessError(ErrorCode.NotFound, '渲染版本不存在');
    if (render.versionNo !== request.expectedRenderVersionNo) throw new BusinessError(ErrorCode.VersionConflict, '渲染版本已变化，请刷新后重试');
    await this.assertExportableRender(context, videoId, detail, render);
    return this.repository.createExport({
      context,
      project,
      render,
      request: { ...request, idempotencyToken, format: request.format ?? 'mp4' },
      requestHash,
      now: this.now()
    });
  }

  async recheckReference(context: RequestContext, videoId: string, request: RecheckVideoReferenceRequest): Promise<VideoReferenceDetailDTO> {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'recheck_video_reference', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const detail = await this.repository.getReferenceDetail(context.tenantId, videoId);
      if (!detail) throw new BusinessError(ErrorCode.NotFound, '视频项目不存在');
      return detail;
    }

    const project = await this.repository.findProjectById(context.tenantId, videoId);
    if (!project) throw new BusinessError(ErrorCode.NotFound, '视频项目不存在');
    const detail = await this.repository.getReferenceDetail(context.tenantId, videoId);
    if (!detail) throw new BusinessError(ErrorCode.NotFound, '引用快照不存在');
    if (detail.versionNo !== request.expectedReferenceVersion) {
      throw new BusinessError(ErrorCode.VersionConflict, '引用快照版本已变化，请刷新后重试');
    }

    return this.repository.recheckReference({
      context,
      project,
      request: { ...request, idempotencyToken },
      requestHash,
      now: this.now()
    });
  }

  async resolveIssue(context: RequestContext, videoId: string, issueId: string, request: ResolveVideoReferenceIssueRequest): Promise<VideoReferenceDetailDTO> {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    assertReason(request.reason, '处理引用异常');
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId, issueId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'resolve_video_reference_issue', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const detail = await this.repository.getReferenceDetail(context.tenantId, videoId);
      if (!detail) throw new BusinessError(ErrorCode.NotFound, '视频项目不存在');
      return detail;
    }

    const project = await this.repository.findProjectById(context.tenantId, videoId);
    if (!project) throw new BusinessError(ErrorCode.NotFound, '视频项目不存在');
    const detail = await this.repository.getReferenceDetail(context.tenantId, videoId);
    const issue = detail?.issues.find((item) => item.id === issueId);
    if (!issue) throw new BusinessError(ErrorCode.NotFound, '引用异常不存在');
    assertIssueActionAllowed(issue.issueLevel, request.action);

    return this.repository.resolveIssue({
      context,
      project,
      issueId,
      request: { ...request, idempotencyToken },
      requestHash,
      now: this.now()
    });
  }

  async stopProject(context: RequestContext, videoId: string, request: StopVideoProjectRequest): Promise<VideoProjectActionResultDTO> {
    const idempotencyToken = assertIdempotencyToken(request.idempotencyToken);
    assertReason(request.reason, '停止视频项目');
    const requestHash = createVideoActionRequestHash({ ...request, idempotencyToken: undefined, videoId });
    const existingReceipt = await this.repository.findActionReceipt(context.tenantId, 'stop_video_project', idempotencyToken);
    if (existingReceipt) {
      assertReceiptRequestHash(existingReceipt, requestHash);
      const detail = await this.repository.getReferenceDetail(context.tenantId, videoId);
      if (!detail) throw new BusinessError(ErrorCode.NotFound, '视频项目不存在');
      return { project: detail.project, reference: detail, reusedExisting: true };
    }

    const project = await this.repository.findProjectById(context.tenantId, videoId);
    if (!project) throw new BusinessError(ErrorCode.NotFound, '视频项目不存在');
    return this.repository.stopProject({
      context,
      project,
      request: { ...request, idempotencyToken },
      requestHash,
      now: this.now()
    });
  }

  private async assertProjectExists(context: RequestContext, videoId: string) {
    const project = await this.repository.findProjectById(context.tenantId, videoId);
    if (!project) throw new BusinessError(ErrorCode.NotFound, '视频项目不存在');
    return project;
  }

  private async assertNarrationWritable(context: RequestContext, videoId: string, videoUnitId: string, expectedReferenceVersion: number) {
    const project = await this.assertProjectExists(context, videoId);
    const detail = await this.getReference(context, videoId);
    assertReferenceNotBlocking(detail);
    if (detail.versionNo !== expectedReferenceVersion) {
      throw new BusinessError(ErrorCode.VersionConflict, '引用快照版本已变化，请刷新后重试');
    }
    const unit = await this.repository.findDefaultUnit(context.tenantId, videoId);
    if (!unit || unit.id !== videoUnitId) throw new BusinessError(ErrorCode.NotFound, '默认视频单元不存在或已变化');
    return { project, detail, unit };
  }

  private async assertTtsWritable(context: RequestContext, videoId: string, request: GenerateVideoTtsRequest) {
    const project = await this.assertProjectExists(context, videoId);
    const detail = await this.getReference(context, videoId);
    assertReferenceNotBlocking(detail);
    if (detail.versionNo !== request.expectedReferenceVersion) {
      throw new BusinessError(ErrorCode.VersionConflict, '引用快照版本已变化，请刷新后重试');
    }
    const unit = await this.repository.findDefaultUnit(context.tenantId, videoId);
    if (!unit || unit.id !== request.videoUnitId) throw new BusinessError(ErrorCode.NotFound, '默认视频单元不存在或已变化');
    const narrationArtifacts = await this.repository.listNarrationArtifacts(context.tenantId, videoId);
    const currentNarration = toNarrationListDTO(narrationArtifacts).current;
    if (!currentNarration) {
      throw new BusinessError(ErrorCode.GateBlocked, '需先确认旁白稿后才能生成配音');
    }
    if (currentNarration.id !== request.narrationArtifactId || currentNarration.versionNo !== request.expectedNarrationVersionNo) {
      throw new BusinessError(ErrorCode.VersionConflict, '当前旁白版本已变化，请刷新后重试');
    }
    const narration = await this.repository.getNarrationArtifact(context.tenantId, videoId, currentNarration.id);
    if (!narration) throw new BusinessError(ErrorCode.NotFound, '当前旁白版本不存在');
    if (narration.sourceVersionRefs.videoReferenceId !== detail.referenceId || narration.sourceVersionRefs.videoReferenceVersion !== detail.versionNo) {
      throw new BusinessError(ErrorCode.CandidateStale, '旁白来源引用已变化，请重新确认旁白后再配音');
    }
    return { project, detail, unit, narration };
  }

  private async assertCurrentNarrationMatchesTts(context: RequestContext, videoId: string, detail: VideoReferenceDetailDTO, artifact: VideoArtifactRecord) {
    const refs = artifact.sourceVersionRefs as ReturnType<typeof createTtsSourceVersionRefs>;
    if (refs.videoReferenceId !== detail.referenceId || refs.videoReferenceVersion !== detail.versionNo) {
      throw new BusinessError(ErrorCode.CandidateStale, '配音来源引用已变化，请重新生成配音候选');
    }
    const currentNarration = toNarrationListDTO(await this.repository.listNarrationArtifacts(context.tenantId, videoId)).current;
    if (!currentNarration || currentNarration.id !== refs.narrationArtifactId || currentNarration.versionNo !== refs.narrationVersionNo) {
      throw new BusinessError(ErrorCode.CandidateStale, '配音来源旁白已变化，请基于当前旁白重新生成配音');
    }
  }

  private async assertSubtitleWritable(context: RequestContext, videoId: string, request: GenerateVideoSubtitleRequest) {
    const project = await this.assertProjectExists(context, videoId);
    const detail = await this.getReference(context, videoId);
    assertReferenceNotBlocking(detail);
    if (detail.versionNo !== request.expectedReferenceVersion) {
      throw new BusinessError(ErrorCode.VersionConflict, '引用快照版本已变化，请刷新后重试');
    }
    const unit = await this.repository.findDefaultUnit(context.tenantId, videoId);
    if (!unit || unit.id !== request.videoUnitId) throw new BusinessError(ErrorCode.NotFound, '默认视频单元不存在或已变化');
    const { narration, tts } = await this.getCurrentNarrationAndTts(context, videoId, detail);
    if (tts.id !== request.ttsArtifactId || tts.versionNo !== request.expectedTtsVersionNo) {
      throw new BusinessError(ErrorCode.VersionConflict, '当前配音版本已变化，请刷新后重试');
    }
    return { project, detail, unit, narration, tts };
  }

  private async getCurrentNarrationAndTts(context: RequestContext, videoId: string, detail: VideoReferenceDetailDTO) {
    const currentTts = toTtsListDTO(await this.repository.listTtsArtifacts(context.tenantId, videoId)).current;
    if (!currentTts) {
      throw new BusinessError(ErrorCode.GateBlocked, '需先确认配音后才能生成字幕');
    }
    const tts = await this.repository.getTtsArtifact(context.tenantId, videoId, currentTts.id);
    if (!tts) throw new BusinessError(ErrorCode.NotFound, '当前配音版本不存在');
    await this.assertCurrentNarrationMatchesTts(context, videoId, detail, tts);
    const refs = tts.sourceVersionRefs as ReturnType<typeof createTtsSourceVersionRefs>;
    const narration = await this.repository.getNarrationArtifact(context.tenantId, videoId, refs.narrationArtifactId);
    if (!narration) throw new BusinessError(ErrorCode.NotFound, '当前配音来源旁白不存在');
    return { narration, tts };
  }

  private async assertCurrentTtsMatchesSubtitle(context: RequestContext, videoId: string, detail: VideoReferenceDetailDTO, artifact: VideoArtifactRecord) {
    const refs = artifact.sourceVersionRefs as ReturnType<typeof createSubtitleSourceVersionRefs>;
    if (refs.videoReferenceId !== detail.referenceId || refs.videoReferenceVersion !== detail.versionNo) {
      throw new BusinessError(ErrorCode.CandidateStale, '字幕来源引用已变化，请重新生成字幕候选');
    }
    const { narration, tts } = await this.getCurrentNarrationAndTts(context, videoId, detail);
    if (tts.id !== refs.ttsArtifactId || tts.versionNo !== refs.ttsVersionNo) {
      throw new BusinessError(ErrorCode.CandidateStale, '字幕来源配音已变化，请基于当前配音重新生成字幕');
    }
    if (narration.id !== refs.narrationArtifactId || narration.versionNo !== refs.narrationVersionNo) {
      throw new BusinessError(ErrorCode.CandidateStale, '字幕来源旁白已变化，请重新确认旁白和配音后再生成字幕');
    }
  }

  private async assertVisualPlanWritable(context: RequestContext, videoId: string, request: SaveVideoVisualPlanRequest) {
    const project = await this.assertProjectExists(context, videoId);
    const detail = await this.getReference(context, videoId);
    assertReferenceNotBlocking(detail);
    if (detail.versionNo !== request.expectedReferenceVersion) {
      throw new BusinessError(ErrorCode.VersionConflict, '引用快照版本已变化，请刷新后重试');
    }
    const unit = await this.repository.findDefaultUnit(context.tenantId, videoId);
    if (!unit || unit.id !== request.videoUnitId) throw new BusinessError(ErrorCode.NotFound, '默认视频单元不存在或已变化');
    const { narration, tts, subtitle } = await this.getCurrentNarrationTtsAndSubtitle(context, videoId, detail);
    if (subtitle.id !== request.subtitleArtifactId || subtitle.versionNo !== request.expectedSubtitleVersionNo) {
      throw new BusinessError(ErrorCode.VersionConflict, '当前字幕版本已变化，请刷新后重试');
    }
    return { project, detail, unit, narration, tts, subtitle };
  }

  private async getCurrentNarrationTtsAndSubtitle(context: RequestContext, videoId: string, detail: VideoReferenceDetailDTO) {
    const currentSubtitle = toSubtitleListDTO(await this.repository.listSubtitleArtifacts(context.tenantId, videoId)).current;
    if (!currentSubtitle) {
      throw new BusinessError(ErrorCode.GateBlocked, '需先确认字幕后才能配置视觉方案');
    }
    const subtitle = await this.repository.getSubtitleArtifact(context.tenantId, videoId, currentSubtitle.id);
    if (!subtitle) throw new BusinessError(ErrorCode.NotFound, '当前字幕版本不存在');
    await this.assertCurrentTtsMatchesSubtitle(context, videoId, detail, subtitle);
    const refs = subtitle.sourceVersionRefs as ReturnType<typeof createSubtitleSourceVersionRefs>;
    const narration = await this.repository.getNarrationArtifact(context.tenantId, videoId, refs.narrationArtifactId);
    const tts = await this.repository.getTtsArtifact(context.tenantId, videoId, refs.ttsArtifactId);
    if (!narration || !tts) throw new BusinessError(ErrorCode.NotFound, '当前字幕来源产物不存在');
    return { narration, tts, subtitle };
  }

  private async assertCurrentSubtitleMatchesVisualPlan(context: RequestContext, videoId: string, detail: VideoReferenceDetailDTO, artifact: VideoArtifactRecord) {
    const refs = artifact.sourceVersionRefs as ReturnType<typeof createVisualPlanSourceVersionRefs>;
    if (refs.videoReferenceId !== detail.referenceId || refs.videoReferenceVersion !== detail.versionNo) {
      throw new BusinessError(ErrorCode.CandidateStale, '视觉方案来源引用已变化，请重新配置视觉方案');
    }
    const { narration, tts, subtitle } = await this.getCurrentNarrationTtsAndSubtitle(context, videoId, detail);
    if (subtitle.id !== refs.subtitleArtifactId || subtitle.versionNo !== refs.subtitleVersionNo) {
      throw new BusinessError(ErrorCode.CandidateStale, '视觉方案来源字幕已变化，请基于当前字幕重新配置视觉方案');
    }
    if (tts.id !== refs.ttsArtifactId || tts.versionNo !== refs.ttsVersionNo || narration.id !== refs.narrationArtifactId || narration.versionNo !== refs.narrationVersionNo) {
      throw new BusinessError(ErrorCode.CandidateStale, '视觉方案来源旁白或配音已变化，请重新确认上游产物');
    }
  }

  private async assertRenderWritable(context: RequestContext, videoId: string, request: GenerateVideoRenderRequest) {
    const project = await this.assertProjectExists(context, videoId);
    const detail = await this.getReference(context, videoId);
    assertReferenceNotBlocking(detail);
    if (detail.versionNo !== request.expectedReferenceVersion) {
      throw new BusinessError(ErrorCode.VersionConflict, '引用快照版本已变化，请刷新后重试');
    }
    const unit = await this.repository.findDefaultUnit(context.tenantId, videoId);
    if (!unit || unit.id !== request.videoUnitId) throw new BusinessError(ErrorCode.NotFound, '默认视频单元不存在或已变化');
    const visualPlanList = toVisualPlanListDTO(await this.repository.listVisualPlanArtifacts(context.tenantId, videoId));
    const currentVisualPlan = visualPlanList.current;
    if (!currentVisualPlan) {
      throw new BusinessError(ErrorCode.GateBlocked, '需先确认视觉方案后才能渲染视频');
    }
    if (currentVisualPlan.id !== request.visualPlanArtifactId || currentVisualPlan.versionNo !== request.expectedVisualPlanVersionNo) {
      throw new BusinessError(ErrorCode.VersionConflict, '当前视觉方案已变化，请刷新后重试');
    }
    const visualPlan = await this.repository.getVisualPlanArtifact(context.tenantId, videoId, currentVisualPlan.id);
    if (!visualPlan) throw new BusinessError(ErrorCode.NotFound, '当前视觉方案不存在');
    await this.assertCurrentSubtitleMatchesVisualPlan(context, videoId, detail, visualPlan);
    return { project, detail, unit, visualPlan };
  }

  private async assertCurrentVisualPlanMatchesRender(context: RequestContext, videoId: string, detail: VideoReferenceDetailDTO, render: VideoRenderRecord) {
    const refs = render.sourceVersionRefs;
    if (refs.videoReferenceId !== detail.referenceId || refs.videoReferenceVersion !== detail.versionNo) {
      throw new BusinessError(ErrorCode.CandidateStale, '渲染来源引用已变化，请重新渲染');
    }
    const currentVisualPlan = toVisualPlanListDTO(await this.repository.listVisualPlanArtifacts(context.tenantId, videoId)).current;
    if (!currentVisualPlan || currentVisualPlan.id !== refs.visualPlanArtifactId || currentVisualPlan.versionNo !== refs.visualPlanVersionNo) {
      throw new BusinessError(ErrorCode.CandidateStale, '渲染来源视觉方案已变化，请重新渲染');
    }
    const visualPlan = await this.repository.getVisualPlanArtifact(context.tenantId, videoId, refs.visualPlanArtifactId);
    if (!visualPlan) throw new BusinessError(ErrorCode.NotFound, '渲染来源视觉方案不存在');
    await this.assertCurrentSubtitleMatchesVisualPlan(context, videoId, detail, visualPlan);
  }

  private async assertExportableRender(context: RequestContext, videoId: string, detail: VideoReferenceDetailDTO, render: VideoRenderRecord) {
    await this.assertCurrentVisualPlanMatchesRender(context, videoId, detail, render);
    if (!render.isCurrent || render.status !== 'confirmed' || render.previewStatus !== 'confirmed_exportable') {
      throw new BusinessError(ErrorCode.GateBlocked, '需先预览并确认当前视频后才能创建导出记录');
    }
  }
}

export function createVideoRequestContext(requestId: string): RequestContext {
  return {
    tenantId: DEFAULT_TENANT_ID,
    userId: DEFAULT_USER_ID,
    requestId
  };
}

function createP9eWorkbenchDTO(
  detail: VideoReferenceDetailDTO,
  defaultUnit: VideoWorkbenchDTO['defaultUnit'],
  narrations: VideoNarrationListDTO,
  tts: VideoTtsListDTO,
  subtitles: VideoSubtitleListDTO,
  visualPlans: VideoVisualPlanListDTO,
  renders: VideoRenderListDTO,
  exports: ReturnType<typeof toExportListDTO>,
  latestTask: VideoNarrationListDTO['activeTask'] = null,
  latestTtsTask: VideoTtsListDTO['activeTask'] = null,
  latestSubtitleTask: VideoSubtitleListDTO['activeTask'] = null,
  latestRenderTask: VideoRenderListDTO['activeTask'] = null
): VideoWorkbenchDTO {
  const isBlocking = detail.status === 'blocking' || detail.project.referenceStatus === 'blocking';
  const hasNarration = Boolean(narrations.current);
  const hasCandidates = narrations.candidates.length > 0 || narrations.drafts.length > 0;
  const hasTts = Boolean(tts.current);
  const hasTtsCandidates = tts.candidates.length > 0;
  const hasSubtitle = Boolean(subtitles.current);
  const hasSubtitleCandidates = subtitles.candidates.length > 0 || subtitles.drafts.length > 0;
  const hasVisualPlan = Boolean(visualPlans.current);
  const hasVisualPlanCandidates = visualPlans.candidates.length > 0;
  const hasRender = Boolean(renders.current);
  const hasRenderCandidates = renders.candidates.length > 0;
  const hasExport = Boolean(exports.current);
  const steps = createP9eWorkbenchSteps(isBlocking, hasNarration, hasTts, hasSubtitle, hasVisualPlan, hasRender, hasExport);
  const hasFailedRetryableTask = latestTask?.status === 'failed' && latestTask.canRetry;
  const hasFailedRetryableTtsTask = latestTtsTask?.status === 'failed' && latestTtsTask.canRetry;
  const hasFailedRetryableSubtitleTask = latestSubtitleTask?.status === 'failed' && latestSubtitleTask.canRetry;
  const hasFailedRetryableRenderTask = latestRenderTask?.status === 'failed' && latestRenderTask.canRetry;
  const recommendedAction: VideoWorkbenchDTO['recommendedAction'] = isBlocking
    ? {
        label: '处理引用异常',
        stepKey: 'reference_check',
        disabled: false,
        reason: '引用存在 blocking 异常，先处理引用异常后才能继续。'
      }
    : hasFailedRetryableRenderTask
      ? {
          label: '重试视频渲染',
          stepKey: 'render',
          disabled: false,
          reason: latestRenderTask.statusNote
        }
    : hasFailedRetryableSubtitleTask
      ? {
          label: '重试字幕生成',
          stepKey: 'subtitle',
          disabled: false,
          reason: latestSubtitleTask.statusNote
        }
    : hasFailedRetryableTtsTask
      ? {
          label: '重试配音生成',
          stepKey: 'tts',
          disabled: false,
          reason: latestTtsTask.statusNote
        }
    : hasFailedRetryableTask
      ? {
          label: '重试旁白生成',
          stepKey: 'narration',
          disabled: false,
          reason: latestTask.statusNote
        }
    : hasRender
      ? {
          label: hasExport ? '查看导出记录' : '创建导出记录',
          stepKey: 'export',
          disabled: false,
          reason: hasExport ? '视频已确认并创建导出记录；导出不等于发布。' : '当前视频已预览确认，可以创建本地/占位导出记录。'
        }
    : hasRenderCandidates
      ? {
          label: '预览并确认当前视频',
          stepKey: 'preview',
          disabled: false,
          reason: '渲染候选已生成，预览确认后才能导出。'
        }
    : hasVisualPlan
      ? {
          label: '渲染视频预览',
          stepKey: 'render',
          disabled: false,
          reason: '视觉方案已确认，可以生成 mock/local 渲染预览。'
        }
    : hasVisualPlanCandidates
      ? {
          label: '确认视觉方案',
          stepKey: 'visual_plan',
          disabled: false,
          reason: '已有视觉方案候选，确认后才能渲染。'
        }
    : hasSubtitle
      ? {
          label: '配置视觉方案',
          stepKey: 'visual_plan',
          disabled: false,
          reason: '字幕已确认，可以配置循环背景、比例和字幕安全区。'
        }
    : hasNarration
      ? {
          label: hasTts ? hasSubtitle ? '查看已确认字幕' : hasSubtitleCandidates ? '编辑并确认字幕候选' : '生成字幕候选' : hasTtsCandidates ? '试听并确认配音候选' : '生成配音候选',
          stepKey: hasTts ? 'subtitle' : 'tts',
          disabled: false,
          reason: hasTts
            ? hasSubtitle
              ? '字幕已确认，可以进入 P9e 配置视觉方案。'
              : '配音已确认，可以进入 P9d 生成、编辑并确认字幕。'
            : '旁白已确认，可以进入 P9c 生成、试听并确认配音。'
        }
      : {
        label: hasNarration ? '查看已确认旁白' : hasCandidates ? '选择或编辑旁白候选' : '生成旁白候选',
        stepKey: 'narration',
        disabled: false,
        reason: '引用状态正常，可以进入 P9b 生成、编辑并确认旁白稿。'
      };

  return {
    project: detail.project,
    reference: detail,
    defaultUnit,
    recommendedAction,
    steps,
    dependencyRefs: {
      videoReferenceId: detail.referenceId,
      videoReferenceVersion: detail.versionNo,
      videoUnitId: defaultUnit.id,
      chapterContentVersionIds: detail.chapters.map((chapter) => chapter.contentVersionId)
    },
    risks: isBlocking
      ? [
          {
            level: 'blocking',
            message: '存在 blocking 引用异常，后续视频生产步骤全部锁定。',
            actionLabel: '处理引用异常'
          }
        ]
      : [],
    artifacts: {
      placeholders: [
        { type: 'narration_script', label: '旁白稿', status: hasNarration ? 'confirmed' : hasCandidates ? 'candidate_ready' : 'not_started', currentVersionId: narrations.current?.id ?? null, unlockPackage: 'P9b' },
        { type: 'tts_audio', label: '配音', status: hasTts ? 'confirmed' : hasTtsCandidates ? 'candidate_ready' : hasNarration ? 'not_started' : 'locked', currentVersionId: tts.current?.id ?? null, unlockPackage: 'P9c' },
        { type: 'subtitle', label: '字幕', status: hasSubtitle ? 'confirmed' : hasSubtitleCandidates ? 'candidate_ready' : hasTts ? 'not_started' : 'locked', currentVersionId: subtitles.current?.id ?? null, unlockPackage: 'P9d' },
        { type: 'visual_plan', label: '视觉方案', status: hasVisualPlan ? 'confirmed' : hasVisualPlanCandidates ? 'candidate_ready' : hasSubtitle ? 'not_started' : 'locked', currentVersionId: visualPlans.current?.id ?? null, unlockPackage: 'P9e' }
      ],
      narration: narrations,
      tts,
      subtitle: subtitles,
      visualPlan: visualPlans,
      renders,
      exports,
      render: {
        status: hasRender ? 'confirmed' : hasRenderCandidates ? 'candidate_ready' : hasVisualPlan ? 'not_started' : 'locked',
        currentRenderId: renders.current?.id ?? null,
        lockedReason: hasVisualPlan ? null : '需先确认视觉方案后才能渲染预览。'
      },
      export: {
        status: hasExport ? 'created' : hasRender ? 'not_started' : 'locked',
        currentExportId: exports.current?.id ?? null,
        lockedReason: hasRender ? null : '需先预览确认当前视频后才能导出。'
      }
    },
    recentTasks: createVideoRecentTasks(narrations, tts, subtitles, visualPlans, renders, exports, latestTask, latestTtsTask, latestSubtitleTask, latestRenderTask),
    operationRecords: []
  };
}

function createVideoRecentTasks(
  narrations: VideoNarrationListDTO,
  tts: VideoTtsListDTO,
  subtitles: VideoSubtitleListDTO,
  visualPlans: VideoVisualPlanListDTO,
  renders: VideoRenderListDTO,
  exports: ReturnType<typeof toExportListDTO>,
  latestTask: VideoNarrationListDTO['activeTask'] = null,
  latestTtsTask: VideoTtsListDTO['activeTask'] = null,
  latestSubtitleTask: VideoSubtitleListDTO['activeTask'] = null,
  latestRenderTask: VideoRenderListDTO['activeTask'] = null
): VideoWorkbenchDTO['recentTasks'] {
  if (latestRenderTask) return [latestRenderTask];
  if (latestSubtitleTask) return [latestSubtitleTask];
  if (latestTtsTask) return [latestTtsTask];
  if (latestTask) return [latestTask];

  if (exports.current) {
    return [
      {
        id: `video-export-created-${exports.current.id}`,
        taskType: 'video_export_create',
        status: 'completed',
        statusNote: `导出记录 ${exports.current.fileName} 已创建；导出不等于发布。`
      }
    ];
  }

  if (renders.current) {
    return [
      {
        id: `video-render-confirmed-${renders.current.id}`,
        taskType: 'video_render_confirm',
        status: 'completed',
        statusNote: `当前视频 v${renders.current.versionNo} 已预览确认；下一步创建导出记录。`
      }
    ];
  }

  const latestRenderCandidate = renders.candidates[0];
  if (latestRenderCandidate) {
    return [
      {
        id: `video-render-generate-${latestRenderCandidate.id}`,
        taskType: 'video_render_generate',
        status: 'completed',
        statusNote: `渲染候选 v${latestRenderCandidate.versionNo} 已生成，等待预览确认。`
      }
    ];
  }

  if (visualPlans.current) {
    return [
      {
        id: `video-visual-plan-confirmed-${visualPlans.current.id}`,
        taskType: 'video_visual_plan_confirm',
        status: 'completed',
        statusNote: `视觉方案 v${visualPlans.current.versionNo} 已确认；下一步生成渲染预览。`
      }
    ];
  }

  const latestVisualCandidate = visualPlans.candidates[0];
  if (latestVisualCandidate) {
    return [
      {
        id: `video-visual-plan-save-${latestVisualCandidate.id}`,
        taskType: 'video_visual_plan_save',
        status: 'completed',
        statusNote: `视觉方案候选 v${latestVisualCandidate.versionNo} 已保存，等待确认。`
      }
    ];
  }

  if (subtitles.current) {
    return [
      {
        id: `video-subtitle-confirmed-${subtitles.current.id}`,
        taskType: 'video_subtitle_confirm',
        status: 'completed',
        statusNote: `当前字幕 v${subtitles.current.versionNo} 已确认；下一步配置视觉方案。`
      }
    ];
  }

  const latestSubtitleDraft = subtitles.drafts[0];
  if (latestSubtitleDraft) {
    return [
      {
        id: `video-subtitle-draft-${latestSubtitleDraft.id}`,
        taskType: 'video_subtitle_edit',
        status: 'completed',
        statusNote: `字幕草稿 v${latestSubtitleDraft.versionNo} 已保存，等待确认。`
      }
    ];
  }

  const latestSubtitleCandidate = subtitles.candidates[0];
  if (latestSubtitleCandidate) {
    return [
      {
        id: `video-subtitle-generate-${latestSubtitleCandidate.id}`,
        taskType: 'video_subtitle_generate',
        status: 'completed',
        statusNote: `字幕候选 v${latestSubtitleCandidate.versionNo} 已生成，等待编辑或确认。`
      }
    ];
  }

  if (tts.current) {
    return [
      {
        id: `video-tts-confirmed-${tts.current.id}`,
        taskType: 'video_tts_confirm',
        status: 'completed',
        statusNote: `当前配音 v${tts.current.versionNo} 已确认；下一步生成字幕候选。`
      }
    ];
  }

  const latestTtsCandidate = tts.candidates[0];
  if (latestTtsCandidate) {
    return [
      {
        id: `video-tts-generate-${latestTtsCandidate.id}`,
        taskType: 'video_tts_generate',
        status: 'completed',
        statusNote: `配音候选 v${latestTtsCandidate.versionNo} 已生成，等待试听确认。`
      }
    ];
  }

  if (narrations.current) {
    return [
      {
        id: `video-narration-confirmed-${narrations.current.id}`,
        taskType: 'video_narration_confirm',
        status: 'completed',
        statusNote: `当前旁白 v${narrations.current.versionNo} 已确认；下一步生成配音候选。`
      }
    ];
  }

  const latestDraft = narrations.drafts[0];
  if (latestDraft) {
    return [
      {
        id: `video-narration-draft-${latestDraft.id}`,
        taskType: 'video_narration_edit',
        status: 'completed',
        statusNote: `旁白草稿 v${latestDraft.versionNo} 已保存，等待确认。`
      }
    ];
  }

  const latestCandidate = narrations.candidates[0];
  if (latestCandidate) {
    return [
      {
        id: `video-narration-generate-${latestCandidate.id}`,
        taskType: 'video_narration_generate',
        status: 'completed',
        statusNote: `已生成 ${narrations.candidates.length} 个旁白候选，等待选择。`
      }
    ];
  }

  return [];
}

function createP9eWorkbenchSteps(isBlocking: boolean, hasNarration: boolean, hasTts: boolean, hasSubtitle: boolean, hasVisualPlan: boolean, hasRender: boolean, hasExport: boolean): VideoWorkbenchStepDTO[] {
  const stepLabels: Record<VideoWorkbenchStepKey, { label: string; description: string; unlockPackage?: VideoWorkbenchStepDTO['unlockPackage'] }> = {
    reference_check: { label: '引用检查', description: '查看引用快照、章节版本和异常处理建议。', unlockPackage: 'P9a' },
    narration: { label: '旁白稿', description: '生成候选、编辑优化、确认当前旁白稿。', unlockPackage: 'P9b' },
    tts: { label: '配音', description: '后续生成、试听和确认配音。', unlockPackage: 'P9c' },
    subtitle: { label: '字幕', description: '后续生成、编辑和确认字幕。', unlockPackage: 'P9d' },
    visual_plan: { label: '视觉方案', description: '后续确认循环背景、比例和字幕样式。', unlockPackage: 'P9e' },
    render: { label: '渲染', description: '基于已确认产物生成 mock/local 渲染预览。', unlockPackage: 'P9e' },
    preview: { label: '预览确认', description: '在系统内预览并确认当前视频。', unlockPackage: 'P9e' },
    export: { label: '导出', description: '导出已确认视频文件占位，不自动发布。', unlockPackage: 'P9e' }
  };

  return VIDEO_WORKBENCH_STEP_KEYS.map((key, index) => {
    if (index === 0) {
      return {
        key,
        label: stepLabels[key].label,
        status: 'active',
        description: stepLabels[key].description,
        lockedReason: null,
        unlockPackage: 'P9a'
      };
    }

    if (key === 'narration') {
      return {
        key,
        label: stepLabels[key].label,
        status: isBlocking ? 'blocked' : hasNarration ? 'completed' : 'active',
        description: stepLabels[key].description,
        lockedReason: isBlocking ? '引用存在 blocking 异常，先处理引用异常后才能生成旁白。' : null,
        unlockPackage: 'P9b'
      };
    }

    if (key === 'tts') {
      return {
        key,
        label: stepLabels[key].label,
        status: isBlocking ? 'blocked' : hasTts ? 'completed' : hasNarration ? 'active' : 'placeholder_locked',
        description: stepLabels[key].description,
        lockedReason: isBlocking
          ? '引用存在 blocking 异常，先处理引用异常后才能生成配音。'
          : hasNarration
            ? null
            : '需先确认旁白稿后才能生成配音。',
        unlockPackage: 'P9c'
      };
    }

    if (key === 'subtitle') {
      return {
        key,
        label: stepLabels[key].label,
        status: isBlocking ? 'blocked' : hasSubtitle ? 'completed' : hasTts ? 'active' : 'placeholder_locked',
        description: stepLabels[key].description,
        lockedReason: isBlocking
          ? '引用存在 blocking 异常，先处理引用异常后才能生成字幕。'
          : hasTts
            ? null
            : '需先确认配音后才能生成字幕。',
        unlockPackage: 'P9d'
      };
    }

    if (key === 'visual_plan') {
      return {
        key,
        label: stepLabels[key].label,
        status: isBlocking ? 'blocked' : hasVisualPlan ? 'completed' : hasSubtitle ? 'active' : 'placeholder_locked',
        description: stepLabels[key].description,
        lockedReason: isBlocking
          ? '引用存在 blocking 异常，先处理引用异常后才能配置视觉方案。'
          : hasSubtitle
            ? null
            : '需先确认字幕后才能配置视觉方案。',
        unlockPackage: 'P9e'
      };
    }

    if (key === 'render') {
      return {
        key,
        label: stepLabels[key].label,
        status: isBlocking ? 'blocked' : hasRender ? 'completed' : hasVisualPlan ? 'active' : 'placeholder_locked',
        description: stepLabels[key].description,
        lockedReason: isBlocking
          ? '引用存在 blocking 异常，先处理引用异常后才能渲染。'
          : hasVisualPlan
            ? null
            : '需先确认视觉方案后才能渲染视频。',
        unlockPackage: 'P9e'
      };
    }

    if (key === 'preview') {
      return {
        key,
        label: stepLabels[key].label,
        status: isBlocking ? 'blocked' : hasRender ? 'completed' : 'placeholder_locked',
        description: stepLabels[key].description,
        lockedReason: isBlocking
          ? '引用存在 blocking 异常，先处理引用异常后才能预览确认。'
          : hasRender
            ? null
            : '需先生成渲染候选后才能预览确认。',
        unlockPackage: 'P9e'
      };
    }

    if (key === 'export') {
      return {
        key,
        label: stepLabels[key].label,
        status: isBlocking ? 'blocked' : hasExport ? 'completed' : hasRender ? 'active' : 'placeholder_locked',
        description: stepLabels[key].description,
        lockedReason: isBlocking
          ? '引用存在 blocking 异常，先处理引用异常后才能导出。'
          : hasRender
            ? null
            : '需先预览确认当前视频后才能导出。',
        unlockPackage: 'P9e'
      };
    }

    const lockedReason = isBlocking ? '引用存在 blocking 异常，先处理引用异常后才能继续。' : '需先完成前置步骤。';
    return {
      key,
      label: stepLabels[key].label,
      status: isBlocking ? 'blocked' : 'placeholder_locked',
      description: stepLabels[key].description,
      lockedReason,
      unlockPackage: stepLabels[key].unlockPackage
    };
  });
}

function assertReferenceNotBlocking(detail: VideoReferenceDetailDTO) {
  if (detail.status === 'blocking' || detail.project.referenceStatus === 'blocking') {
    throw new BusinessError(ErrorCode.VideoReferenceBlocking, '引用存在 blocking 异常，不能生成或确认视频生产产物');
  }
}

function assertNarrationText(contentText: string) {
  if (typeof contentText !== 'string' || contentText.trim().length < 20) {
    throw new BusinessError(ErrorCode.ValidationError, '旁白正文至少需要 20 个字符');
  }
}

function createNarrationSourceVersionRefs(detail: VideoReferenceDetailDTO, videoUnitId: string) {
  return {
    videoReferenceId: detail.referenceId,
    videoReferenceVersion: detail.versionNo,
    videoUnitId,
    videoReadinessSnapshotId: detail.project.currentVideoReferenceId ? 'vrs_ready_001' : 'unknown',
    chapterContentVersionIds: detail.chapters.map((chapter) => chapter.contentVersionId)
  };
}

function createTtsSourceVersionRefs(detail: VideoReferenceDetailDTO, videoUnitId: string, narration: VideoArtifactRecord) {
  return {
    videoReferenceId: detail.referenceId,
    videoReferenceVersion: detail.versionNo,
    videoUnitId,
    videoReadinessSnapshotId: detail.project.currentVideoReferenceId ? 'vrs_ready_001' : 'unknown',
    narrationArtifactId: narration.id,
    narrationVersionNo: narration.versionNo,
    chapterContentVersionIds: detail.chapters.map((chapter) => chapter.contentVersionId)
  };
}

function createSubtitleSourceVersionRefs(detail: VideoReferenceDetailDTO, videoUnitId: string, narration: VideoArtifactRecord, tts: VideoArtifactRecord) {
  const ttsRefs = tts.sourceVersionRefs as ReturnType<typeof createTtsSourceVersionRefs>;
  return {
    videoReferenceId: detail.referenceId,
    videoReferenceVersion: detail.versionNo,
    videoUnitId,
    videoReadinessSnapshotId: detail.project.currentVideoReferenceId ? 'vrs_ready_001' : 'unknown',
    narrationArtifactId: narration.id,
    narrationVersionNo: narration.versionNo,
    ttsArtifactId: tts.id,
    ttsVersionNo: tts.versionNo,
    chapterContentVersionIds: ttsRefs.chapterContentVersionIds
  };
}

function createVisualPlanSourceVersionRefs(
  detail: VideoReferenceDetailDTO,
  videoUnitId: string,
  narration: VideoArtifactRecord,
  tts: VideoArtifactRecord,
  subtitle: VideoArtifactRecord
) {
  const subtitleRefs = subtitle.sourceVersionRefs as ReturnType<typeof createSubtitleSourceVersionRefs>;
  return {
    videoReferenceId: detail.referenceId,
    videoReferenceVersion: detail.versionNo,
    videoUnitId,
    videoReadinessSnapshotId: detail.project.currentVideoReferenceId ? 'vrs_ready_001' : 'unknown',
    narrationArtifactId: narration.id,
    narrationVersionNo: narration.versionNo,
    ttsArtifactId: tts.id,
    ttsVersionNo: tts.versionNo,
    subtitleArtifactId: subtitle.id,
    subtitleVersionNo: subtitle.versionNo,
    chapterContentVersionIds: subtitleRefs.chapterContentVersionIds
  };
}

function createRenderSourceVersionRefs(visualPlan: VideoArtifactRecord, expectedVisualPlanVersionNo: number) {
  const visualRefs = visualPlan.sourceVersionRefs as ReturnType<typeof createVisualPlanSourceVersionRefs>;
  return {
    ...visualRefs,
    visualPlanArtifactId: visualPlan.id,
    visualPlanVersionNo: expectedVisualPlanVersionNo
  };
}

function clampCandidateCount(value: number | undefined) {
  return Math.min(Math.max(value ?? 3, 1), 3);
}

function clampSubtitleLineLength(value: number | undefined) {
  return Math.min(Math.max(value ?? 18, 10), 28);
}

function createCompletedNarrationTask(id: string, retryOfTaskId: string | null) {
  return {
    id,
    taskType: 'video_narration_generate' as const,
    status: 'completed' as const,
    currentStep: 'saving_result',
    statusNote: '旁白候选已生成，等待用户选择。',
    progress: 100,
    failureCategory: null,
    retryOfTaskId,
    canRetry: false,
    canCancel: false
  };
}

function createCompletedTtsTask(id: string, retryOfTaskId: string | null) {
  return {
    id,
    taskType: 'video_tts_generate' as const,
    status: 'completed' as const,
    currentStep: 'saving_result',
    statusNote: '配音候选已生成，等待试听确认。',
    progress: 100,
    failureCategory: null,
    retryOfTaskId,
    canRetry: false,
    canCancel: false
  };
}

function createCompletedSubtitleTask(id: string, retryOfTaskId: string | null) {
  return {
    id,
    taskType: 'video_subtitle_generate' as const,
    status: 'completed' as const,
    currentStep: 'saving_result',
    statusNote: '字幕候选已生成，等待编辑或确认。',
    progress: 100,
    failureCategory: null,
    retryOfTaskId,
    canRetry: false,
    canCancel: false
  };
}

function createCompletedRenderTask(id: string, retryOfTaskId: string | null) {
  return {
    id,
    taskType: 'video_render_generate' as const,
    status: 'completed' as const,
    currentStep: 'saving_result',
    statusNote: '渲染候选已生成，等待预览确认。',
    progress: 100,
    failureCategory: null,
    retryOfTaskId,
    canRetry: false,
    canCancel: false
  };
}

function assertTtsParams(request: GenerateVideoTtsRequest) {
  if (!request.narrationArtifactId) throw new BusinessError(ErrorCode.ValidationError, 'narrationArtifactId 必填');
  if (!request.voiceId) throw new BusinessError(ErrorCode.ValidationError, 'voiceId 必填');
  if (request.speed < 0.5 || request.speed > 2) throw new BusinessError(ErrorCode.ValidationError, '语速需在 0.5-2.0 之间');
  if (request.volume < 0 || request.volume > 100) throw new BusinessError(ErrorCode.ValidationError, '音量需在 0-100 之间');
}

function assertSubtitleParams(request: GenerateVideoSubtitleRequest) {
  if (!request.ttsArtifactId) throw new BusinessError(ErrorCode.ValidationError, 'ttsArtifactId 必填');
  if (request.lineLength !== undefined && (request.lineLength < 10 || request.lineLength > 28)) {
    throw new BusinessError(ErrorCode.ValidationError, '字幕每行字数需在 10-28 之间');
  }
}

function assertSubtitleText(contentText: string) {
  if (typeof contentText !== 'string' || contentText.trim().length < 10) {
    throw new BusinessError(ErrorCode.ValidationError, '字幕正文至少需要 10 个字符');
  }
}

function assertVisualPlanParams(request: SaveVideoVisualPlanRequest) {
  if (!request.subtitleArtifactId) throw new BusinessError(ErrorCode.ValidationError, 'subtitleArtifactId 必填');
  if (!['mock-bg-salt-field', 'mock-bg-night-city', 'mock-bg-ink-motion'].includes(request.backgroundAssetId)) {
    throw new BusinessError(ErrorCode.ValidationError, '背景素材不在可用 mock/local 列表中');
  }
  if (request.fontSize < 20 || request.fontSize > 80) {
    throw new BusinessError(ErrorCode.ValidationError, '字幕字号需在 20-80 之间');
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(request.textColor) || !/^#[0-9a-fA-F]{6}$/.test(request.strokeColor)) {
    throw new BusinessError(ErrorCode.ValidationError, '字幕颜色必须是 #RRGGBB 格式');
  }
}

function resolveVisualBackgroundName(backgroundAssetId: string) {
  if (backgroundAssetId === 'mock-bg-night-city') return '夜色城市循环背景';
  if (backgroundAssetId === 'mock-bg-ink-motion') return '水墨流动循环背景';
  return '盐场风沙循环背景';
}

function resolveTtsVoiceName(voiceId: string) {
  if (voiceId === 'mock-female-bright') return '女声-明亮感';
  if (voiceId === 'mock-neutral-calm') return '中性-冷静感';
  return '男声-剧情感';
}
