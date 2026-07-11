import { randomUUID } from 'node:crypto';
import {
  type CreateVideoExportResultDTO,
  type GenerateVideoRenderResultDTO,
  type GenerateVideoSubtitleResultDTO,
  type GenerateVideoTtsResultDTO,
  type GenerateVideoNarrationResultDTO,
  type VideoNarrationTaskDTO,
  type VideoProjectActionResultDTO,
  type VideoReferenceChapterSnapshotDTO,
  type VideoReferenceDetailDTO,
  type VideoReferenceIssueDTO,
  type VideoReferenceStatus,
  type VideoReadySourceDTO
} from '@ai-shortvideo/shared';
import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import {
  createVideoReferenceNextAction,
  toProjectDTO,
  toExportDTO,
  toExportListDTO,
  toNarrationArtifactDTO,
  toNarrationListDTO,
  toRenderDTO,
  toRenderListDTO,
  toSubtitleArtifactDTO,
  toSubtitleListDTO,
  toTtsArtifactDTO,
  toTtsListDTO,
  toVisualPlanArtifactDTO,
  toVisualPlanListDTO,
  type VideoActionReceiptRecord,
  type VideoArtifactRecord,
  type VideoExportCreateInput,
  type VideoExportRecord,
  type VideoOperationLogRecord,
  type VideoNarrationConfirmInput,
  type VideoNarrationDraftInput,
  type VideoNarrationGenerationInput,
  type VideoNarrationRejectInput,
  type VideoSubtitleConfirmInput,
  type VideoSubtitleDraftInput,
  type VideoSubtitleGenerationInput,
  type VideoSubtitleRejectInput,
  type VideoTtsConfirmInput,
  type VideoTtsGenerationInput,
  type VideoTtsRejectInput,
  type VideoProjectCreationInput,
  type VideoProjectRecord,
  type VideoProjectStopInput,
  type VideoReferenceChapterSnapshotRecord,
  type VideoReferenceIssueRecord,
  type VideoReferenceIssueResolutionInput,
  type VideoReferenceRecord,
  type VideoReferenceRecheckInput,
  type VideoRenderConfirmInput,
  type VideoRenderGenerationInput,
  type VideoRenderRecord,
  type VideoRenderRejectInput,
  type VideoRepository,
  type VideoSourceRecord,
  type VideoUnitRecord,
  type VideoVisualPlanConfirmInput,
  type VideoVisualPlanRejectInput,
  type VideoVisualPlanSaveInput
} from '../domain/videoDomain.js';

export class PrismaVideoRepository implements VideoRepository {
  private readonly prisma = getPrismaClient() as unknown as PrismaVideoClient;

  async listSources(query: { tenantId: string; page: number; pageSize: number; keyword?: string }) {
    const where = {
      tenantId: query.tenantId,
      creationStage: 'VIDEO_READY',
      currentVideoReadinessSnapshotId: { not: null },
      deletedAt: null,
      ...(query.keyword ? { title: { contains: query.keyword } } : {})
    };
    const novels = await this.prisma.novel.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize
    });
    const total = await this.prisma.novel.count({ where });
    const sources = (await Promise.all(novels.map((novel: PrismaNovelRecord) => this.buildSource(novel)))).filter(
      (item): item is VideoSourceRecord => Boolean(item)
    );

    return {
      items: sources,
      page: query.page,
      pageSize: query.pageSize,
      total
    };
  }

  async listProjects(query: {
    tenantId: string;
    page: number;
    pageSize: number;
    keyword?: string;
    novelId?: string;
    referenceStatus?: VideoReferenceStatus;
    lifecycleStatus?: string;
    productionStatus?: string;
  }) {
    const where = {
      tenantId: query.tenantId,
      deletedAt: null,
      ...(query.keyword ? { OR: [{ title: { contains: query.keyword } }, { novelTitle: { contains: query.keyword } }] } : {}),
      ...(query.novelId ? { novelId: query.novelId } : {}),
      ...(query.referenceStatus ? { referenceStatus: query.referenceStatus } : {}),
      ...(query.lifecycleStatus ? { lifecycleStatus: query.lifecycleStatus } : {}),
      ...(query.productionStatus ? { productionStatus: query.productionStatus } : {})
    };
    const projects = await this.prisma.videoProject.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize
    });
    const total = await this.prisma.videoProject.count({ where });

    return {
      items: projects.map((project: PrismaVideoProjectRecord) => toProjectDTO(mapProject(project))),
      page: query.page,
      pageSize: query.pageSize,
      total
    };
  }

  async findSourceByNovelId(tenantId: string, novelId: string): Promise<VideoSourceRecord | null> {
    const novel = await this.prisma.novel.findFirst({
      where: {
        tenantId,
        id: novelId,
        creationStage: 'VIDEO_READY',
        currentVideoReadinessSnapshotId: { not: null },
        deletedAt: null
      }
    });
    return novel ? this.buildSource(novel) : null;
  }

  async findProjectById(tenantId: string, videoId: string): Promise<VideoProjectRecord | null> {
    const project = await this.prisma.videoProject.findFirst({
      where: {
        tenantId,
        id: videoId,
        deletedAt: null
      }
    });

    return project ? mapProject(project) : null;
  }

  async findDefaultUnit(tenantId: string, videoProjectId: string): Promise<VideoUnitRecord | null> {
    const unit = await this.prisma.videoUnit.findFirst({
      where: {
        tenantId,
        videoProjectId
      },
      orderBy: { unitNo: 'asc' }
    });

    return unit ? mapUnit(unit) : null;
  }

  async findActionReceipt(tenantId: string, actionType: string, idempotencyToken: string): Promise<VideoActionReceiptRecord | null> {
    const receipt = await this.prisma.videoActionReceipt.findUnique({
      where: {
        tenantId_actionType_idempotencyToken: {
          tenantId,
          actionType,
          idempotencyToken
        }
      }
    });

    return receipt ? mapReceipt(receipt) : null;
  }

  async listActionReceipts(tenantId: string, videoProjectId: string, actionType: string, limit = 10): Promise<VideoActionReceiptRecord[]> {
    const receipts = await this.prisma.videoActionReceipt.findMany({
      where: {
        tenantId,
        videoProjectId,
        actionType
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return receipts.map(mapReceipt);
  }

  async createActionReceipt(input: Omit<VideoActionReceiptRecord, 'id' | 'createdAt'> & { now: Date }) {
    const receipt = await this.prisma.videoActionReceipt.create({
      data: {
        id: createId('vrec'),
        tenantId: input.tenantId,
        videoProjectId: input.videoProjectId,
        actionType: input.actionType,
        idempotencyToken: input.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: input.resultObjectType,
        resultObjectId: input.resultObjectId,
        createdBy: input.createdBy,
        createdAt: input.now,
        metadata: input.metadata
      }
    });

    return mapReceipt(receipt);
  }

  async createProjectWithReference(input: VideoProjectCreationInput): Promise<VideoProjectActionResultDTO> {
    const ids = {
      project: createId('vproj'),
      reference: createId('vref'),
      unit: createId('vunit')
    };
    const chapterRangeText = createChapterRangeText(input.chapters);
    const referenceSummary = `引用《${input.source.title}》${chapterRangeText}，共 ${input.chapters.length} 章。`;
    const title = input.request.title?.trim() || `${input.source.title} ${chapterRangeText}视频承接`;

    await this.prisma.$transaction(async (tx) => {
      await tx.videoProject.create({
        data: {
          id: ids.project,
          tenantId: input.context.tenantId,
          novelId: input.source.novelId,
          novelTitle: input.source.title,
          title,
          projectType: input.request.projectType,
          lifecycleStatus: 'active',
          referenceStatus: 'normal',
          productionStatus: 'not_started',
          sourceVideoReadinessSnapshotId: input.source.videoReadinessSnapshotId,
          chapterRangeText,
          chapterCount: input.chapters.length,
          currentVideoReferenceId: ids.reference,
          defaultVideoUnitId: ids.unit,
          createdBy: input.context.userId,
          updatedBy: input.context.userId,
          createdAt: input.now,
          updatedAt: input.now
        }
      });
      await tx.videoReference.create({
        data: {
          id: ids.reference,
          tenantId: input.context.tenantId,
          videoProjectId: ids.project,
          novelId: input.source.novelId,
          videoReadinessSnapshotId: input.source.videoReadinessSnapshotId,
          versionNo: 1,
          chapterIdsJson: input.chapters.map((chapter) => chapter.chapterId),
          chapterContentVersionIdsJson: Object.fromEntries(input.chapters.map((chapter) => [chapter.chapterId, chapter.contentVersionId])),
          chapterRangeText,
          chapterCount: input.chapters.length,
          referenceSummary,
          riskSummary: '引用快照已保存，后续生成前仍需重新检测引用状态。',
          status: 'normal',
          createdAt: input.now,
          updatedAt: input.now
        }
      });
      await tx.videoReferenceChapterSnapshot.createMany({
        data: input.chapters.map((chapter) => ({
          id: createId('vchap'),
          tenantId: input.context.tenantId,
          videoProjectId: ids.project,
          videoReferenceId: ids.reference,
          novelId: input.source.novelId,
          chapterId: chapter.chapterId,
          chapterNo: chapter.chapterNo,
          chapterTitle: chapter.chapterTitle,
          contentVersionId: chapter.contentVersionId,
          wordCount: chapter.wordCount,
          summary: chapter.summary,
          riskLevel: chapter.riskLevel,
          createdAt: input.now
        }))
      });
      await tx.videoUnit.create({
        data: {
          id: ids.unit,
          tenantId: input.context.tenantId,
          videoProjectId: ids.project,
          videoReferenceId: ids.reference,
          unitNo: 1,
          unitType: 'first_test',
          title: '首条测试视频承接单元',
          chapterRangeText,
          chapterIdsJson: input.chapters.map((chapter) => chapter.chapterId),
          status: 'reference_ready',
          productionStatus: 'not_started',
          createdAt: input.now,
          updatedAt: input.now
        }
      });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: ids.project,
        actionType: 'create_video_project',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_project',
        resultObjectId: ids.project,
        objectType: 'video_project',
        objectId: ids.project,
        reason: '创建视频承接项目',
        userId: input.context.userId,
        now: input.now,
        metadata: {
          novelId: input.source.novelId,
          chapterIds: input.chapters.map((chapter) => chapter.chapterId)
        }
      });
    });

    const detail = await this.getReferenceDetail(input.context.tenantId, ids.project);
    return {
      project: detail!.project,
      reference: detail!,
      reusedExisting: false
    };
  }

  async getReferenceDetail(tenantId: string, videoId: string): Promise<VideoReferenceDetailDTO | null> {
    const project = await this.prisma.videoProject.findFirst({
      where: {
        tenantId,
        id: videoId,
        deletedAt: null
      }
    });
    if (!project?.currentVideoReferenceId) return null;

    const [reference, snapshots, issues] = await Promise.all([
      this.prisma.videoReference.findFirst({ where: { tenantId, id: project.currentVideoReferenceId } }),
      this.prisma.videoReferenceChapterSnapshot.findMany({
        where: { tenantId, videoReferenceId: project.currentVideoReferenceId },
        orderBy: { chapterNo: 'asc' }
      }),
      this.prisma.videoReferenceIssue.findMany({
        where: { tenantId, videoProjectId: project.id },
        orderBy: { createdAt: 'desc' }
      })
    ]);
    if (!reference) return null;

    return toReferenceDetail(mapProject(project), mapReference(reference), snapshots.map(mapChapterSnapshot), issues.map(mapIssue));
  }

  async listNarrationArtifacts(tenantId: string, videoProjectId: string): Promise<VideoArtifactRecord[]> {
    const rows = await this.prisma.videoArtifact.findMany({
      where: {
        tenantId,
        videoProjectId,
        artifactType: 'narration_script'
      },
      orderBy: { versionNo: 'desc' }
    });

    return rows.map(mapArtifact);
  }

  async getNarrationArtifact(tenantId: string, videoProjectId: string, artifactId: string): Promise<VideoArtifactRecord | null> {
    const row = await this.prisma.videoArtifact.findFirst({
      where: {
        tenantId,
        videoProjectId,
        id: artifactId,
        artifactType: 'narration_script'
      }
    });

    return row ? mapArtifact(row) : null;
  }

  async listTtsArtifacts(tenantId: string, videoProjectId: string): Promise<VideoArtifactRecord[]> {
    const rows = await this.prisma.videoArtifact.findMany({
      where: {
        tenantId,
        videoProjectId,
        artifactType: 'tts_audio'
      },
      orderBy: { versionNo: 'desc' }
    });

    return rows.map(mapArtifact);
  }

  async getTtsArtifact(tenantId: string, videoProjectId: string, artifactId: string): Promise<VideoArtifactRecord | null> {
    const row = await this.prisma.videoArtifact.findFirst({
      where: {
        tenantId,
        videoProjectId,
        id: artifactId,
        artifactType: 'tts_audio'
      }
    });

    return row ? mapArtifact(row) : null;
  }

  async listSubtitleArtifacts(tenantId: string, videoProjectId: string): Promise<VideoArtifactRecord[]> {
    const rows = await this.prisma.videoArtifact.findMany({
      where: {
        tenantId,
        videoProjectId,
        artifactType: 'subtitle'
      },
      orderBy: { versionNo: 'desc' }
    });

    return rows.map(mapArtifact);
  }

  async getSubtitleArtifact(tenantId: string, videoProjectId: string, artifactId: string): Promise<VideoArtifactRecord | null> {
    const row = await this.prisma.videoArtifact.findFirst({
      where: {
        tenantId,
        videoProjectId,
        id: artifactId,
        artifactType: 'subtitle'
      }
    });

    return row ? mapArtifact(row) : null;
  }

  async listVisualPlanArtifacts(tenantId: string, videoProjectId: string): Promise<VideoArtifactRecord[]> {
    const rows = await this.prisma.videoArtifact.findMany({
      where: { tenantId, videoProjectId, artifactType: 'visual_plan' },
      orderBy: { versionNo: 'desc' }
    });

    return rows.map(mapArtifact);
  }

  async getVisualPlanArtifact(tenantId: string, videoProjectId: string, artifactId: string): Promise<VideoArtifactRecord | null> {
    const row = await this.prisma.videoArtifact.findFirst({
      where: { tenantId, videoProjectId, id: artifactId, artifactType: 'visual_plan' }
    });

    return row ? mapArtifact(row) : null;
  }

  async listRenders(tenantId: string, videoProjectId: string): Promise<VideoRenderRecord[]> {
    const rows = await this.prisma.videoRender.findMany({
      where: { tenantId, videoProjectId },
      orderBy: { versionNo: 'desc' }
    });

    return rows.map(mapRender);
  }

  async getRender(tenantId: string, videoProjectId: string, renderId: string): Promise<VideoRenderRecord | null> {
    const row = await this.prisma.videoRender.findFirst({
      where: { tenantId, videoProjectId, id: renderId }
    });

    return row ? mapRender(row) : null;
  }

  async listExports(tenantId: string, videoProjectId: string): Promise<VideoExportRecord[]> {
    const rows = await this.prisma.videoExport.findMany({
      where: { tenantId, videoProjectId },
      orderBy: { createdAt: 'desc' }
    });

    return rows.map(mapExport);
  }

  async createNarrationCandidates(input: VideoNarrationGenerationInput): Promise<GenerateVideoNarrationResultDTO> {
    const existing = await this.listNarrationArtifacts(input.context.tenantId, input.project.id);
    const task = createMockNarrationTask({
      id: createId('vtask'),
      outcome: input.request.mockTaskOutcome ?? 'success',
      retryOfTaskId: input.request.retryOfTaskId ?? null
    });
    if ((input.request.mockTaskOutcome ?? 'success') !== 'success') {
      await this.prisma.$transaction(async (tx) => {
        await this.createReceiptAndLog(tx, {
          tenantId: input.context.tenantId,
          videoProjectId: input.project.id,
          actionType: 'generate_video_narration',
          idempotencyToken: input.request.idempotencyToken,
          requestHash: input.requestHash,
          resultObjectType: 'video_narration_task',
          resultObjectId: task.id,
          objectType: 'video_narration_task',
          objectId: task.id,
          reason: task.statusNote,
          userId: input.context.userId,
          now: input.now,
          metadata: {
            artifactIds: [],
            task,
            safeSummary: '旁白生成未写入候选，旧版本不受影响。'
          }
        });
      });

      return {
        task,
        artifacts: [],
        current: toNarrationListDTO(existing).current
      };
    }

    const candidateCount = Math.min(Math.max(input.request.candidateCount ?? 3, 1), 3);
    const baseVersion = getNextVersion(existing);
    const ids = Array.from({ length: candidateCount }, () => createId('vart'));
    const rows = ids.map((id, index) => createMockArtifactRecord({
      id,
      input,
      versionNo: baseVersion + index,
      rank: index + 1
    }));

    await this.prisma.$transaction(async (tx) => {
      await tx.videoArtifact.createMany({
        data: rows.map((row) => artifactRecordToPrismaCreate(row))
      });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'generate_video_narration',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_narration_task',
        resultObjectId: task.id,
        objectType: 'video_artifact',
        objectId: rows[0]?.id ?? input.project.id,
        reason: '生成旁白候选',
        userId: input.context.userId,
        now: input.now,
        metadata: { artifactIds: rows.map((row) => row.id), task, providerSummary: rows[0]?.providerSummary }
      });
    });

    return {
      task,
      artifacts: rows.map(toNarrationArtifactDTO),
      current: toNarrationListDTO(existing).current
    };
  }

  async saveNarrationDraft(input: VideoNarrationDraftInput) {
    const existing = await this.listNarrationArtifacts(input.context.tenantId, input.project.id);
    const draft: VideoArtifactRecord = {
      id: createId('vart'),
      tenantId: input.context.tenantId,
      videoProjectId: input.project.id,
      videoUnitId: input.unit.id,
      videoReferenceId: input.reference.referenceId,
      artifactType: 'narration_script',
      status: 'draft',
      versionNo: getNextVersion(existing),
      isCurrent: false,
      sourceVersionRefs: input.sourceVersionRefs,
      providerSummary: { provider: 'manual', model: 'manual-edit', isMockOutput: false, safeSummary: '用户手动编辑旁白稿' },
      providerRouteId: 'video_narration_manual.v1',
      strategyVersion: 'video_narration_strategy.v1',
      qualityMode: 'standard',
      contentText: input.request.contentText,
      hook: input.request.hook,
      firstScreenSubtitle: input.request.firstScreenSubtitle,
      endingHook: input.request.endingHook,
      estimatedDurationSeconds: Math.max(10, Math.ceil(countWords(input.request.contentText) / 3.2)),
      wordCount: countWords(input.request.contentText),
      riskTags: [],
      recommendationReason: '用户手动编辑保存。',
      score: 82,
      qualitySummary: '手动编辑稿，建议确认前检查节奏和风险。',
      rejectedReason: null,
      confirmedBy: null,
      confirmedAt: null,
      createdBy: input.context.userId,
      createdAt: input.now,
      updatedAt: input.now,
      metadata: { isMockOutput: false, baseArtifactId: input.request.baseArtifactId ?? null, editReason: input.request.reason }
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.videoArtifact.create({ data: artifactRecordToPrismaCreate(draft) });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'save_video_narration_draft',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_artifact',
        resultObjectId: draft.id,
        objectType: 'video_artifact',
        objectId: draft.id,
        reason: input.request.reason,
        userId: input.context.userId,
        now: input.now,
        metadata: { baseArtifactId: input.request.baseArtifactId ?? null }
      });
    });
    return {
      artifact: toNarrationArtifactDTO(draft),
      narrations: toNarrationListDTO(await this.listNarrationArtifacts(input.context.tenantId, input.project.id))
    };
  }

  async confirmNarration(input: VideoNarrationConfirmInput) {
    await this.prisma.$transaction(async (tx) => {
      await tx.videoArtifact.update({
        where: { id: input.artifact.id },
        data: {
          status: 'confirmed',
          isCurrent: true,
          confirmedBy: input.context.userId,
          confirmedAt: input.now,
          updatedAt: input.now
        }
      });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'confirm_video_narration',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_artifact',
        resultObjectId: input.artifact.id,
        objectType: 'video_artifact',
        objectId: input.artifact.id,
        reason: input.request.riskContinueReason ?? '确认旁白稿',
        userId: input.context.userId,
        now: input.now,
        metadata: { downstreamStale: ['tts_audio', 'subtitle', 'visual_plan', 'render', 'export'] }
      });
    });
    const artifact = (await this.getNarrationArtifact(input.context.tenantId, input.project.id, input.artifact.id))!;
    return {
      current: toNarrationArtifactDTO(artifact),
      narrations: toNarrationListDTO(await this.listNarrationArtifacts(input.context.tenantId, input.project.id))
    };
  }

  async rejectNarration(input: VideoNarrationRejectInput) {
    await this.prisma.$transaction(async (tx) => {
      await tx.videoArtifact.update({
        where: { id: input.artifact.id },
        data: {
          status: 'rejected',
          isCurrent: false,
          rejectedReason: input.request.reason,
          updatedAt: input.now
        }
      });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'reject_video_narration',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_artifact',
        resultObjectId: input.artifact.id,
        objectType: 'video_artifact',
        objectId: input.artifact.id,
        reason: input.request.reason,
        userId: input.context.userId,
        now: input.now,
        metadata: {}
      });
    });
    const artifact = (await this.getNarrationArtifact(input.context.tenantId, input.project.id, input.artifact.id))!;
    return {
      artifact: toNarrationArtifactDTO(artifact),
      narrations: toNarrationListDTO(await this.listNarrationArtifacts(input.context.tenantId, input.project.id))
    };
  }

  async createTtsCandidate(input: VideoTtsGenerationInput): Promise<GenerateVideoTtsResultDTO> {
    const existing = await this.listTtsArtifacts(input.context.tenantId, input.project.id);
    const task = createMockTtsTask({
      id: createId('vtts'),
      outcome: input.request.mockTaskOutcome ?? 'success',
      retryOfTaskId: input.request.retryOfTaskId ?? null
    });
    if ((input.request.mockTaskOutcome ?? 'success') !== 'success') {
      await this.prisma.$transaction(async (tx) => {
        await this.createReceiptAndLog(tx, {
          tenantId: input.context.tenantId,
          videoProjectId: input.project.id,
          actionType: 'generate_video_tts',
          idempotencyToken: input.request.idempotencyToken,
          requestHash: input.requestHash,
          resultObjectType: 'video_tts_task',
          resultObjectId: task.id,
          objectType: 'video_tts_task',
          objectId: task.id,
          reason: task.statusNote,
          userId: input.context.userId,
          now: input.now,
          metadata: {
            artifactIds: [],
            task,
            safeSummary: '配音生成未写入候选，当前音频不受影响。'
          }
        });
      });

      return {
        task,
        artifacts: [],
        current: toTtsListDTO(existing).current
      };
    }

    const row = createMockTtsArtifactRecord({
      id: createId('vart'),
      input,
      versionNo: getNextVersion(existing),
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.videoArtifact.create({ data: artifactRecordToPrismaCreate(row) });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'generate_video_tts',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_tts_task',
        resultObjectId: task.id,
        objectType: 'video_artifact',
        objectId: row.id,
        reason: '生成配音候选',
        userId: input.context.userId,
        now: input.now,
        metadata: { artifactIds: [row.id], task, providerSummary: row.providerSummary }
      });
    });

    return {
      task,
      artifacts: [toTtsArtifactDTO(row)],
      current: toTtsListDTO(existing).current
    };
  }

  async confirmTts(input: VideoTtsConfirmInput) {
    await this.prisma.$transaction(async (tx) => {
      await tx.videoArtifact.updateMany({
        where: {
          tenantId: input.context.tenantId,
          videoProjectId: input.project.id,
          artifactType: 'tts_audio',
          isCurrent: true
        },
        data: {
          isCurrent: false,
          status: 'archived',
          updatedAt: input.now
        }
      });
      await tx.videoArtifact.update({
        where: { id: input.artifact.id },
        data: {
          status: 'confirmed',
          isCurrent: true,
          confirmedBy: input.context.userId,
          confirmedAt: input.now,
          updatedAt: input.now
        }
      });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'confirm_video_tts',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_artifact',
        resultObjectId: input.artifact.id,
        objectType: 'video_artifact',
        objectId: input.artifact.id,
        reason: '确认配音版本',
        userId: input.context.userId,
        now: input.now,
        metadata: { downstreamStale: ['subtitle', 'visual_plan', 'render', 'export'] }
      });
    });
    const artifact = (await this.getTtsArtifact(input.context.tenantId, input.project.id, input.artifact.id))!;
    return {
      current: toTtsArtifactDTO(artifact),
      tts: toTtsListDTO(await this.listTtsArtifacts(input.context.tenantId, input.project.id))
    };
  }

  async rejectTts(input: VideoTtsRejectInput) {
    await this.prisma.$transaction(async (tx) => {
      await tx.videoArtifact.update({
        where: { id: input.artifact.id },
        data: {
          status: 'rejected',
          isCurrent: false,
          rejectedReason: input.request.reason,
          updatedAt: input.now
        }
      });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'reject_video_tts',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_artifact',
        resultObjectId: input.artifact.id,
        objectType: 'video_artifact',
        objectId: input.artifact.id,
        reason: input.request.reason,
        userId: input.context.userId,
        now: input.now,
        metadata: {}
      });
    });
    const artifact = (await this.getTtsArtifact(input.context.tenantId, input.project.id, input.artifact.id))!;
    return {
      artifact: toTtsArtifactDTO(artifact),
      tts: toTtsListDTO(await this.listTtsArtifacts(input.context.tenantId, input.project.id))
    };
  }

  async createSubtitleCandidate(input: VideoSubtitleGenerationInput): Promise<GenerateVideoSubtitleResultDTO> {
    const existing = await this.listSubtitleArtifacts(input.context.tenantId, input.project.id);
    const task = createMockSubtitleTask({
      id: createId('vsubtask'),
      outcome: input.request.mockTaskOutcome ?? 'success',
      retryOfTaskId: input.request.retryOfTaskId ?? null
    });
    if ((input.request.mockTaskOutcome ?? 'success') !== 'success') {
      await this.prisma.$transaction(async (tx) => {
        await this.createReceiptAndLog(tx, {
          tenantId: input.context.tenantId,
          videoProjectId: input.project.id,
          actionType: 'generate_video_subtitle',
          idempotencyToken: input.request.idempotencyToken,
          requestHash: input.requestHash,
          resultObjectType: 'video_subtitle_task',
          resultObjectId: task.id,
          objectType: 'video_subtitle_task',
          objectId: task.id,
          reason: task.statusNote,
          userId: input.context.userId,
          now: input.now,
          metadata: {
            artifactIds: [],
            task,
            safeSummary: '字幕生成未写入候选，当前字幕不受影响。'
          }
        });
      });

      return {
        task,
        artifacts: [],
        current: toSubtitleListDTO(existing).current
      };
    }

    const row = createMockSubtitleArtifactRecord({
      id: createId('vart'),
      input,
      versionNo: getNextVersion(existing)
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.videoArtifact.create({ data: artifactRecordToPrismaCreate(row) });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'generate_video_subtitle',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_subtitle_task',
        resultObjectId: task.id,
        objectType: 'video_artifact',
        objectId: row.id,
        reason: '生成字幕候选',
        userId: input.context.userId,
        now: input.now,
        metadata: { artifactIds: [row.id], task, providerSummary: row.providerSummary }
      });
    });

    return {
      task,
      artifacts: [toSubtitleArtifactDTO(row)],
      current: toSubtitleListDTO(existing).current
    };
  }

  async saveSubtitleDraft(input: VideoSubtitleDraftInput) {
    const existing = await this.listSubtitleArtifacts(input.context.tenantId, input.project.id);
    const contentText = input.request.contentText.trim();
    const draft: VideoArtifactRecord = {
      id: createId('vart'),
      tenantId: input.context.tenantId,
      videoProjectId: input.project.id,
      videoUnitId: input.unit.id,
      videoReferenceId: input.reference.referenceId,
      artifactType: 'subtitle',
      status: 'draft',
      versionNo: getNextVersion(existing),
      isCurrent: false,
      sourceVersionRefs: input.sourceVersionRefs,
      providerSummary: { provider: 'manual', model: 'manual-edit', isMockOutput: false, safeSummary: '用户手动编辑字幕稿' },
      providerRouteId: 'video_subtitle_manual.v1',
      strategyVersion: 'video_subtitle_strategy.v1',
      qualityMode: 'standard',
      contentText,
      hook: input.request.firstScreenSubtitle,
      firstScreenSubtitle: input.request.firstScreenSubtitle,
      endingHook: '',
      estimatedDurationSeconds: estimateSubtitleDuration(contentText),
      durationSeconds: estimateSubtitleDuration(contentText),
      wordCount: countWords(contentText),
      riskTags: [],
      recommendationReason: '用户手动编辑保存。',
      score: 82,
      qualitySummary: '手动编辑字幕，建议确认前检查分行节奏。',
      rejectedReason: null,
      confirmedBy: null,
      confirmedAt: null,
      createdBy: input.context.userId,
      createdAt: input.now,
      updatedAt: input.now,
      metadata: {
        isMockOutput: false,
        baseArtifactId: input.request.baseArtifactId ?? null,
        editReason: input.request.reason,
        subtitleStyle: 'balanced',
        lineLength: clampSubtitleLineLength(),
        timelineSummary: createTimelineSummary(contentText)
      }
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.videoArtifact.create({ data: artifactRecordToPrismaCreate(draft) });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'save_video_subtitle_draft',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_artifact',
        resultObjectId: draft.id,
        objectType: 'video_artifact',
        objectId: draft.id,
        reason: input.request.reason,
        userId: input.context.userId,
        now: input.now,
        metadata: { baseArtifactId: input.request.baseArtifactId ?? null }
      });
    });
    return {
      artifact: toSubtitleArtifactDTO(draft),
      subtitles: toSubtitleListDTO(await this.listSubtitleArtifacts(input.context.tenantId, input.project.id))
    };
  }

  async confirmSubtitle(input: VideoSubtitleConfirmInput) {
    await this.prisma.$transaction(async (tx) => {
      await tx.videoArtifact.updateMany({
        where: {
          tenantId: input.context.tenantId,
          videoProjectId: input.project.id,
          artifactType: 'subtitle',
          isCurrent: true
        },
        data: {
          isCurrent: false,
          status: 'archived',
          updatedAt: input.now
        }
      });
      await tx.videoArtifact.update({
        where: { id: input.artifact.id },
        data: {
          status: 'confirmed',
          isCurrent: true,
          confirmedBy: input.context.userId,
          confirmedAt: input.now,
          updatedAt: input.now
        }
      });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'confirm_video_subtitle',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_artifact',
        resultObjectId: input.artifact.id,
        objectType: 'video_artifact',
        objectId: input.artifact.id,
        reason: '确认字幕版本',
        userId: input.context.userId,
        now: input.now,
        metadata: { downstreamStale: ['visual_plan', 'render', 'export'] }
      });
    });
    const artifact = (await this.getSubtitleArtifact(input.context.tenantId, input.project.id, input.artifact.id))!;
    return {
      current: toSubtitleArtifactDTO(artifact),
      subtitles: toSubtitleListDTO(await this.listSubtitleArtifacts(input.context.tenantId, input.project.id))
    };
  }

  async rejectSubtitle(input: VideoSubtitleRejectInput) {
    await this.prisma.$transaction(async (tx) => {
      await tx.videoArtifact.update({
        where: { id: input.artifact.id },
        data: {
          status: 'rejected',
          isCurrent: false,
          rejectedReason: input.request.reason,
          updatedAt: input.now
        }
      });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'reject_video_subtitle',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_artifact',
        resultObjectId: input.artifact.id,
        objectType: 'video_artifact',
        objectId: input.artifact.id,
        reason: input.request.reason,
        userId: input.context.userId,
        now: input.now,
        metadata: {}
      });
    });
    const artifact = (await this.getSubtitleArtifact(input.context.tenantId, input.project.id, input.artifact.id))!;
    return {
      artifact: toSubtitleArtifactDTO(artifact),
      subtitles: toSubtitleListDTO(await this.listSubtitleArtifacts(input.context.tenantId, input.project.id))
    };
  }

  async saveVisualPlan(input: VideoVisualPlanSaveInput) {
    const existing = await this.listVisualPlanArtifacts(input.context.tenantId, input.project.id);
    const row = createMockVisualPlanArtifactRecord({
      id: createId('vart'),
      input,
      versionNo: getNextVersion(existing)
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.videoArtifact.create({ data: artifactRecordToPrismaCreate(row) });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'save_video_visual_plan',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_artifact',
        resultObjectId: row.id,
        objectType: 'video_artifact',
        objectId: row.id,
        reason: '保存视觉方案候选',
        userId: input.context.userId,
        now: input.now,
        metadata: { sourceVersionRefs: input.sourceVersionRefs, safeSummary: '未调用真实渲染或素材 provider。' }
      });
    });
    return {
      artifact: toVisualPlanArtifactDTO(row),
      visualPlans: toVisualPlanListDTO(await this.listVisualPlanArtifacts(input.context.tenantId, input.project.id))
    };
  }

  async confirmVisualPlan(input: VideoVisualPlanConfirmInput) {
    await this.prisma.$transaction(async (tx) => {
      await tx.videoArtifact.updateMany({
        where: { tenantId: input.context.tenantId, videoProjectId: input.project.id, artifactType: 'visual_plan', isCurrent: true },
        data: { isCurrent: false, status: 'archived', updatedAt: input.now }
      });
      await tx.videoArtifact.update({
        where: { id: input.artifact.id },
        data: { status: 'confirmed', isCurrent: true, confirmedBy: input.context.userId, confirmedAt: input.now, updatedAt: input.now }
      });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'confirm_video_visual_plan',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_artifact',
        resultObjectId: input.artifact.id,
        objectType: 'video_artifact',
        objectId: input.artifact.id,
        reason: '确认视觉方案',
        userId: input.context.userId,
        now: input.now,
        metadata: { downstreamStale: ['render', 'export'] }
      });
    });
    const artifact = (await this.getVisualPlanArtifact(input.context.tenantId, input.project.id, input.artifact.id))!;
    return {
      current: toVisualPlanArtifactDTO(artifact),
      visualPlans: toVisualPlanListDTO(await this.listVisualPlanArtifacts(input.context.tenantId, input.project.id))
    };
  }

  async rejectVisualPlan(input: VideoVisualPlanRejectInput) {
    await this.prisma.$transaction(async (tx) => {
      await tx.videoArtifact.update({
        where: { id: input.artifact.id },
        data: { status: 'rejected', isCurrent: false, rejectedReason: input.request.reason, updatedAt: input.now }
      });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'reject_video_visual_plan',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_artifact',
        resultObjectId: input.artifact.id,
        objectType: 'video_artifact',
        objectId: input.artifact.id,
        reason: input.request.reason,
        userId: input.context.userId,
        now: input.now,
        metadata: {}
      });
    });
    const artifact = (await this.getVisualPlanArtifact(input.context.tenantId, input.project.id, input.artifact.id))!;
    return {
      artifact: toVisualPlanArtifactDTO(artifact),
      visualPlans: toVisualPlanListDTO(await this.listVisualPlanArtifacts(input.context.tenantId, input.project.id))
    };
  }

  async createRender(input: VideoRenderGenerationInput): Promise<GenerateVideoRenderResultDTO> {
    const existing = await this.listRenders(input.context.tenantId, input.project.id);
    const task = createMockRenderTask({
      id: createId('vrtask'),
      outcome: input.request.mockTaskOutcome ?? 'success',
      retryOfTaskId: input.request.retryOfTaskId ?? null
    });
    if ((input.request.mockTaskOutcome ?? 'success') !== 'success') {
      await this.prisma.$transaction(async (tx) => {
        await this.createReceiptAndLog(tx, {
          tenantId: input.context.tenantId,
          videoProjectId: input.project.id,
          actionType: 'generate_video_render',
          idempotencyToken: input.request.idempotencyToken,
          requestHash: input.requestHash,
          resultObjectType: 'video_render_task',
          resultObjectId: task.id,
          objectType: 'video_render_task',
          objectId: task.id,
          reason: task.statusNote,
          userId: input.context.userId,
          now: input.now,
          metadata: { renderIds: [], task, safeSummary: '渲染未写入候选，导出仍保持锁定。' }
        });
      });
      return { task, renders: [], current: toRenderListDTO(existing).current };
    }

    const row = createMockRenderRecord({ id: createId('vrender'), input, versionNo: getNextRenderVersion(existing) });
    await this.prisma.$transaction(async (tx) => {
      await tx.videoRender.create({ data: renderRecordToPrismaCreate(row) });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'generate_video_render',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_render_task',
        resultObjectId: task.id,
        objectType: 'video_render',
        objectId: row.id,
        reason: '生成 mock/local 渲染预览候选',
        userId: input.context.userId,
        now: input.now,
        metadata: { renderIds: [row.id], task, safeSummary: row.safeSummary }
      });
    });
    return { task, renders: [toRenderDTO(row)], current: toRenderListDTO(existing).current };
  }

  async confirmRender(input: VideoRenderConfirmInput) {
    await this.prisma.$transaction(async (tx) => {
      await tx.videoRender.updateMany({
        where: { tenantId: input.context.tenantId, videoProjectId: input.project.id, isCurrent: true },
        data: { isCurrent: false, status: 'archived', updatedAt: input.now }
      });
      await tx.videoRender.update({
        where: { id: input.render.id },
        data: { status: 'confirmed', isCurrent: true, previewStatus: 'confirmed_exportable', confirmedBy: input.context.userId, confirmedAt: input.now, updatedAt: input.now }
      });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'confirm_video_render',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_render',
        resultObjectId: input.render.id,
        objectType: 'video_render',
        objectId: input.render.id,
        reason: '预览确认当前视频',
        userId: input.context.userId,
        now: input.now,
        metadata: { sourceVersionRefs: input.render.sourceVersionRefs, downstreamStale: ['export'] }
      });
    });
    const render = (await this.getRender(input.context.tenantId, input.project.id, input.render.id))!;
    return { current: toRenderDTO(render), renders: toRenderListDTO(await this.listRenders(input.context.tenantId, input.project.id)) };
  }

  async rejectRender(input: VideoRenderRejectInput) {
    await this.prisma.$transaction(async (tx) => {
      await tx.videoRender.update({
        where: { id: input.render.id },
        data: { status: 'rejected', isCurrent: false, previewStatus: 'rejected_pending_revision', rejectedReason: input.request.reason, updatedAt: input.now }
      });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'reject_video_render',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_render',
        resultObjectId: input.render.id,
        objectType: 'video_render',
        objectId: input.render.id,
        reason: input.request.reason,
        userId: input.context.userId,
        now: input.now,
        metadata: {}
      });
    });
    const render = (await this.getRender(input.context.tenantId, input.project.id, input.render.id))!;
    return { render: toRenderDTO(render), renders: toRenderListDTO(await this.listRenders(input.context.tenantId, input.project.id)) };
  }

  async createExport(input: VideoExportCreateInput): Promise<CreateVideoExportResultDTO> {
    const row: VideoExportRecord = {
      id: createId('vexport'),
      tenantId: input.context.tenantId,
      videoProjectId: input.project.id,
      videoUnitId: input.render.videoUnitId,
      videoReferenceId: input.render.videoReferenceId,
      status: 'created',
      fileKey: `mock://video-export/${input.render.id}.mp4`,
      downloadUrl: `/mock-video/export/${input.render.id}.mp4`,
      fileName: input.request.fileName ?? `${input.project.title}-预览导出-v${input.render.versionNo}.mp4`,
      renderVersionId: input.render.id,
      renderVersionNo: input.render.versionNo,
      safeSummary: 'mock/local 导出记录，占位文件不可代表正式发布。',
      createdBy: input.context.userId,
      createdAt: input.now,
      metadata: { isMockOutput: true, format: input.request.format ?? 'mp4', sourceVersionRefs: input.render.sourceVersionRefs }
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.videoExport.create({ data: exportRecordToPrismaCreate(row) });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'create_video_export',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_export',
        resultObjectId: row.id,
        objectType: 'video_export',
        objectId: row.id,
        reason: '创建导出记录，占位文件不等于发布',
        userId: input.context.userId,
        now: input.now,
        metadata: { renderVersionId: input.render.id, safeSummary: row.safeSummary }
      });
    });
    return { exportRecord: toExportDTO(row), exports: toExportListDTO(await this.listExports(input.context.tenantId, input.project.id)) };
  }

  async recheckReference(input: VideoReferenceRecheckInput): Promise<VideoReferenceDetailDTO> {
    const detail = await this.getReferenceDetail(input.context.tenantId, input.project.id);
    const reference = detail ? await this.prisma.videoReference.findFirst({ where: { tenantId: input.context.tenantId, id: detail.referenceId } }) : null;
    if (!detail || !reference) throw new Error('video reference not found');

    const currentChapters = await this.loadCurrentChapterVersions(input.context.tenantId, input.project.novelId, detail.chapters.map((chapter) => chapter.chapterId));
    const changed = detail.chapters.filter((snapshot) => {
      const current = currentChapters.find((chapter) => chapter.chapterId === snapshot.chapterId);
      return current && current.contentVersionId !== snapshot.contentVersionId;
    });

    const status: VideoReferenceStatus = changed.length > 0 ? 'blocking' : 'normal';
    await this.prisma.$transaction(async (tx) => {
      for (const chapter of changed) {
        const exists = await tx.videoReferenceIssue.findFirst({
          where: {
            tenantId: input.context.tenantId,
            videoProjectId: input.project.id,
            videoReferenceId: detail.referenceId,
            status: 'open',
            sourceChangeObjectId: chapter.chapterId
          }
        });
        if (exists) continue;
        await tx.videoReferenceIssue.create({
          data: {
            id: createId('viss'),
            tenantId: input.context.tenantId,
            videoProjectId: input.project.id,
            videoReferenceId: detail.referenceId,
            novelId: input.project.novelId,
            issueLevel: 'blocking',
            issueType: 'chapter_version_changed',
            issueReason: `第 ${chapter.chapterNo} 章正文版本已变化，需要先处理引用异常。`,
            affectedChapterIdsJson: [chapter.chapterId],
            affectedChapterNumbersJson: [chapter.chapterNo],
            sourceChangeObjectType: 'chapter_content_version',
            sourceChangeObjectId: chapter.chapterId,
            status: 'open',
            createdAt: input.now,
            updatedAt: input.now
          }
        });
      }
      await tx.videoReference.update({
        where: { id: detail.referenceId },
        data: {
          status,
          updatedAt: input.now
        }
      });
      await tx.videoProject.update({
        where: { id: input.project.id },
        data: {
          referenceStatus: status,
          productionStatus: changed.length > 0 ? 'generation_locked' : 'not_started',
          updatedBy: input.context.userId,
          updatedAt: input.now
        }
      });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'recheck_video_reference',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_reference',
        resultObjectId: detail.referenceId,
        objectType: 'video_reference',
        objectId: detail.referenceId,
        reason: '重新检测视频引用',
        userId: input.context.userId,
        now: input.now,
        metadata: { changedChapterIds: changed.map((chapter) => chapter.chapterId) }
      });
    });

    return (await this.getReferenceDetail(input.context.tenantId, input.project.id))!;
  }

  async resolveIssue(input: VideoReferenceIssueResolutionInput): Promise<VideoReferenceDetailDTO> {
    await this.prisma.$transaction(async (tx) => {
      await tx.videoReferenceIssue.update({
        where: { id: input.issueId },
        data: {
          status: input.request.action === 'ignore' ? 'ignored' : 'resolved',
          resolutionAction: input.request.action,
          resolutionReason: input.request.reason,
          resolvedBy: input.context.userId,
          resolvedAt: input.now,
          updatedAt: input.now
        }
      });
      const openCount = await tx.videoReferenceIssue.count({
        where: {
          tenantId: input.context.tenantId,
          videoProjectId: input.project.id,
          status: 'open'
        }
      });
      const lifecycleStatus = input.request.action === 'stop_project' ? 'stopped' : input.project.lifecycleStatus;
      const referenceStatus = openCount === 0 ? 'resolved' : input.project.referenceStatus;
      await tx.videoProject.update({
        where: { id: input.project.id },
        data: {
          lifecycleStatus,
          referenceStatus,
          productionStatus: input.request.action === 'stop_project' || referenceStatus === 'blocking' ? 'generation_locked' : 'not_started',
          updatedBy: input.context.userId,
          updatedAt: input.now
        }
      });
      if (openCount === 0) {
        await tx.videoReference.update({
          where: { id: input.project.currentVideoReferenceId },
          data: {
            status: 'resolved',
            updatedAt: input.now
          }
        });
      }
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'resolve_video_reference_issue',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_reference_issue',
        resultObjectId: input.issueId,
        objectType: 'video_reference_issue',
        objectId: input.issueId,
        reason: input.request.reason,
        userId: input.context.userId,
        now: input.now,
        metadata: { action: input.request.action }
      });
    });

    return (await this.getReferenceDetail(input.context.tenantId, input.project.id))!;
  }

  async stopProject(input: VideoProjectStopInput): Promise<VideoProjectActionResultDTO> {
    await this.prisma.$transaction(async (tx) => {
      await tx.videoProject.update({
        where: { id: input.project.id },
        data: {
          lifecycleStatus: 'stopped',
          productionStatus: 'generation_locked',
          updatedBy: input.context.userId,
          updatedAt: input.now
        }
      });
      await this.createReceiptAndLog(tx, {
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'stop_video_project',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_project',
        resultObjectId: input.project.id,
        objectType: 'video_project',
        objectId: input.project.id,
        reason: input.request.reason,
        userId: input.context.userId,
        now: input.now,
        metadata: {}
      });
    });

    const detail = (await this.getReferenceDetail(input.context.tenantId, input.project.id))!;
    return {
      project: detail.project,
      reference: detail,
      reusedExisting: false
    };
  }

  private async buildSource(novel: PrismaNovelRecord): Promise<VideoSourceRecord | null> {
    if (!novel.currentVideoReadinessSnapshotId) return null;
    const snapshot = await this.prisma.videoReadinessSnapshot.findFirst({
      where: {
        tenantId: novel.tenantId,
        id: novel.currentVideoReadinessSnapshotId,
        status: 'ready'
      }
    });
    if (!snapshot) return null;
    const firstVideoSuggestion = normalizeFirstVideoSuggestion(snapshot.firstVideoSuggestionJson, toStringArray(snapshot.referableChapterIdsJson));
    const chapters = await this.loadCurrentChapterVersions(novel.tenantId, novel.id, firstVideoSuggestion.chapterIds);
    if (chapters.length === 0) return null;

    return {
      tenantId: novel.tenantId,
      novelId: novel.id,
      title: novel.title,
      creationStage: 'video_ready',
      videoReadinessSnapshotId: snapshot.id,
      snapshotStatus: snapshot.status,
      chapterCount: Number(snapshot.chapterCount ?? chapters.length),
      totalWordCount: Number(snapshot.totalWordCount ?? chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0)),
      firstVideoSuggestion,
      updatedAt: snapshot.createdAt.toISOString(),
      currentChapterVersions: chapters
    };
  }

  private async loadCurrentChapterVersions(tenantId: string, novelId: string, chapterIds?: string[]) {
    const chapters = await this.prisma.novelChapter.findMany({
      where: {
        tenantId,
        novelId,
        currentContentVersionId: { not: null },
        deletedAt: null,
        ...(chapterIds && chapterIds.length > 0 ? { id: { in: chapterIds } } : {})
      },
      orderBy: { chapterNo: 'asc' }
    });
    const contentVersions = await this.prisma.chapterContentVersion.findMany({
      where: {
        tenantId,
        id: { in: chapters.map((chapter) => chapter.currentContentVersionId).filter(Boolean) }
      }
    });

    return chapters.map((chapter) => {
      const contentVersion = contentVersions.find((version) => version.id === chapter.currentContentVersionId);
      return {
        chapterId: chapter.id,
        chapterNo: chapter.chapterNo,
        chapterTitle: chapter.title,
        contentVersionId: chapter.currentContentVersionId!,
        wordCount: Number(contentVersion?.wordCount ?? chapter.wordCount ?? 0),
        summary: contentVersion?.summary ?? chapter.statusNote ?? `第 ${chapter.chapterNo} 章`,
        riskLevel: String(chapter.impactLevel ?? 'none').toLowerCase(),
        updatedAt: chapter.updatedAt
      };
    });
  }

  private async createReceiptAndLog(tx: PrismaVideoClient, input: {
    tenantId: string;
    videoProjectId: string | null;
    actionType: string;
    idempotencyToken: string;
    requestHash: string;
    resultObjectType: string;
    resultObjectId: string;
    objectType: string;
    objectId: string;
    reason: string | null;
    userId: string | null;
    now: Date;
    metadata: unknown;
  }) {
    await tx.videoActionReceipt.create({
      data: {
        id: createId('vrec'),
        tenantId: input.tenantId,
        videoProjectId: input.videoProjectId,
        actionType: input.actionType,
        idempotencyToken: input.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: input.resultObjectType,
        resultObjectId: input.resultObjectId,
        createdBy: input.userId,
        createdAt: input.now,
        metadata: input.metadata
      }
    });
    await tx.videoOperationLog.create({
      data: {
        id: createId('vlog'),
        tenantId: input.tenantId,
        videoProjectId: input.videoProjectId,
        action: input.actionType,
        objectType: input.objectType,
        objectId: input.objectId,
        reason: input.reason,
        createdBy: input.userId,
        createdAt: input.now,
        metadata: input.metadata
      }
    });
  }
}

function toReferenceDetail(
  project: VideoProjectRecord,
  reference: VideoReferenceRecord,
  snapshots: VideoReferenceChapterSnapshotRecord[],
  issues: VideoReferenceIssueRecord[]
): VideoReferenceDetailDTO {
  return {
    project: toProjectDTO(project),
    referenceId: reference.id,
    versionNo: reference.versionNo,
    status: reference.status,
    chapterRangeText: reference.chapterRangeText,
    chapterCount: reference.chapterCount,
    referenceSummary: reference.referenceSummary,
    chapters: snapshots.map(toChapterSnapshotDTO),
    issues: issues.map(toIssueDTO),
    nextAction: createVideoReferenceNextAction(project.referenceStatus)
  };
}

function mapProject(project: PrismaVideoProjectRecord): VideoProjectRecord {
  return {
    id: project.id,
    tenantId: project.tenantId,
    title: project.title,
    projectType: project.projectType,
    novelId: project.novelId,
    novelTitle: project.novelTitle,
    lifecycleStatus: project.lifecycleStatus,
    referenceStatus: project.referenceStatus,
    productionStatus: project.productionStatus,
    chapterRangeText: project.chapterRangeText,
    chapterCount: project.chapterCount,
    currentVideoReferenceId: project.currentVideoReferenceId ?? '',
    defaultVideoUnitId: project.defaultVideoUnitId ?? '',
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    deletedAt: project.deletedAt
  };
}

function mapReference(reference: PrismaVideoReferenceRecord): VideoReferenceRecord {
  return {
    id: reference.id,
    tenantId: reference.tenantId,
    videoProjectId: reference.videoProjectId,
    novelId: reference.novelId,
    versionNo: reference.versionNo,
    status: reference.status,
    chapterRangeText: reference.chapterRangeText ?? '未记录章节范围',
    chapterCount: reference.chapterCount,
    referenceSummary: reference.referenceSummary ?? '引用快照已保存。',
    createdAt: reference.createdAt,
    updatedAt: reference.updatedAt
  };
}

function mapChapterSnapshot(snapshot: PrismaVideoChapterSnapshotRecord): VideoReferenceChapterSnapshotRecord {
  return {
    id: snapshot.id,
    tenantId: snapshot.tenantId,
    videoReferenceId: snapshot.videoReferenceId,
    novelId: snapshot.novelId,
    chapterId: snapshot.chapterId,
    chapterNo: snapshot.chapterNo,
    chapterTitle: snapshot.chapterTitle,
    contentVersionId: snapshot.contentVersionId,
    wordCount: snapshot.wordCount,
    summary: snapshot.summary ?? '',
    riskLevel: snapshot.riskLevel,
    createdAt: snapshot.createdAt
  };
}

function mapIssue(issue: PrismaVideoIssueRecord): VideoReferenceIssueRecord {
  return {
    id: issue.id,
    tenantId: issue.tenantId,
    videoProjectId: issue.videoProjectId,
    videoReferenceId: issue.videoReferenceId,
    issueLevel: issue.issueLevel,
    issueType: issue.issueType ?? 'reference_changed',
    issueReason: issue.issueReason,
    affectedChapterIds: toStringArray(issue.affectedChapterIdsJson),
    status: issue.status,
    resolutionAction: issue.resolutionAction ?? undefined,
    resolutionReason: issue.resolutionReason ?? undefined,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt
  };
}

function mapUnit(unit: PrismaVideoUnitRecord): VideoUnitRecord {
  return {
    id: unit.id,
    tenantId: unit.tenantId,
    videoProjectId: unit.videoProjectId,
    videoReferenceId: unit.videoReferenceId,
    unitNo: unit.unitNo,
    unitType: unit.unitType,
    title: unit.title,
    chapterRangeText: unit.chapterRangeText,
    chapterIds: toStringArray(unit.chapterIdsJson),
    status: unit.status,
    productionStatus: unit.productionStatus,
    createdAt: unit.createdAt,
    updatedAt: unit.updatedAt
  };
}

function mapReceipt(receipt: PrismaVideoActionReceiptRecord): VideoActionReceiptRecord {
  return {
    id: receipt.id,
    tenantId: receipt.tenantId,
    videoProjectId: receipt.videoProjectId,
    actionType: receipt.actionType,
    idempotencyToken: receipt.idempotencyToken,
    requestHash: receipt.requestHash,
    resultObjectType: receipt.resultObjectType,
    resultObjectId: receipt.resultObjectId,
    createdBy: receipt.createdBy,
    createdAt: receipt.createdAt,
    metadata: receipt.metadata
  };
}

function mapArtifact(artifact: PrismaVideoArtifactRecord): VideoArtifactRecord {
  return {
    id: artifact.id,
    tenantId: artifact.tenantId,
    videoProjectId: artifact.videoProjectId,
    videoUnitId: artifact.videoUnitId,
    videoReferenceId: artifact.videoReferenceId,
    artifactType: artifact.artifactType,
    status: artifact.status,
    versionNo: artifact.versionNo,
    isCurrent: Boolean(artifact.isCurrent),
    sourceVersionRefs: artifact.sourceVersionRefs,
    providerSummary: artifact.providerSummary,
    providerRouteId: artifact.providerRouteId,
    strategyVersion: artifact.strategyVersion,
    qualityMode: artifact.qualityMode,
    contentText: artifact.contentText,
    hook: artifact.hook,
    firstScreenSubtitle: artifact.firstScreenSubtitle,
    endingHook: artifact.endingHook,
    estimatedDurationSeconds: artifact.estimatedDurationSeconds,
    durationSeconds: artifact.durationSeconds ?? artifact.estimatedDurationSeconds,
    fileKey: artifact.fileKey ?? null,
    previewUrl: artifact.previewUrl ?? null,
    voiceId: artifact.voiceId ?? null,
    voiceName: artifact.voiceName ?? null,
    speed: artifact.speed ?? null,
    emotion: artifact.emotion ?? null,
    volume: artifact.volume ?? null,
    wordCount: artifact.wordCount,
    riskTags: toStringArray(artifact.riskTagsJson),
    recommendationReason: artifact.recommendationReason ?? '',
    score: artifact.score,
    qualitySummary: artifact.qualitySummary ?? '',
    rejectedReason: artifact.rejectedReason ?? null,
    confirmedBy: artifact.confirmedBy ?? null,
    confirmedAt: artifact.confirmedAt ?? null,
    createdBy: artifact.createdBy ?? null,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
    metadata: artifact.metadata ?? { isMockOutput: Boolean(artifact.providerSummary?.isMockOutput) }
  };
}

function mapRender(render: PrismaVideoRenderRecord): VideoRenderRecord {
  return {
    id: render.id,
    tenantId: render.tenantId,
    videoProjectId: render.videoProjectId,
    videoUnitId: render.videoUnitId,
    videoReferenceId: render.videoReferenceId,
    versionNo: render.versionNo,
    status: render.status,
    isCurrent: Boolean(render.isCurrent),
    previewStatus: render.previewStatus,
    previewUrl: render.previewUrl,
    fileKey: render.fileKey,
    durationSeconds: render.durationSeconds,
    renderMode: render.renderMode,
    qualityMode: render.qualityMode,
    qualityIssues: toStringArray(render.qualityIssuesJson),
    safeSummary: render.safeSummary,
    providerSummary: render.providerSummary,
    providerRouteId: render.providerRouteId,
    strategyVersion: render.strategyVersion,
    sourceVersionRefs: render.sourceVersionRefs,
    rejectedReason: render.rejectedReason ?? null,
    confirmedBy: render.confirmedBy ?? null,
    confirmedAt: render.confirmedAt ?? null,
    createdBy: render.createdBy ?? null,
    createdAt: render.createdAt,
    updatedAt: render.updatedAt,
    metadata: render.metadata ?? {}
  };
}

function mapExport(row: PrismaVideoExportRecord): VideoExportRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    videoProjectId: row.videoProjectId,
    videoUnitId: row.videoUnitId,
    videoReferenceId: row.videoReferenceId,
    status: row.status,
    fileKey: row.fileKey,
    downloadUrl: row.downloadUrl,
    fileName: row.fileName,
    renderVersionId: row.renderVersionId,
    renderVersionNo: row.renderVersionNo,
    safeSummary: row.safeSummary,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt,
    metadata: row.metadata ?? {}
  };
}

function artifactRecordToPrismaCreate(artifact: VideoArtifactRecord) {
  return {
    id: artifact.id,
    tenantId: artifact.tenantId,
    videoProjectId: artifact.videoProjectId,
    videoUnitId: artifact.videoUnitId,
    videoReferenceId: artifact.videoReferenceId,
    artifactType: artifact.artifactType,
    status: artifact.status,
    versionNo: artifact.versionNo,
    isCurrent: artifact.isCurrent,
    sourceVersionRefs: artifact.sourceVersionRefs,
    providerSummary: artifact.providerSummary,
    providerRouteId: artifact.providerRouteId,
    strategyVersion: artifact.strategyVersion,
    qualityMode: artifact.qualityMode,
    contentText: artifact.contentText,
    hook: artifact.hook,
    firstScreenSubtitle: artifact.firstScreenSubtitle,
    endingHook: artifact.endingHook,
    estimatedDurationSeconds: artifact.estimatedDurationSeconds,
    durationSeconds: artifact.durationSeconds ?? 0,
    fileKey: artifact.fileKey ?? null,
    previewUrl: artifact.previewUrl ?? null,
    voiceId: artifact.voiceId ?? null,
    voiceName: artifact.voiceName ?? null,
    speed: artifact.speed ?? null,
    emotion: artifact.emotion ?? null,
    volume: artifact.volume ?? null,
    wordCount: artifact.wordCount,
    riskTagsJson: artifact.riskTags,
    recommendationReason: artifact.recommendationReason,
    score: artifact.score,
    qualitySummary: artifact.qualitySummary,
    rejectedReason: artifact.rejectedReason,
    confirmedBy: artifact.confirmedBy,
    confirmedAt: artifact.confirmedAt,
    createdBy: artifact.createdBy,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
    metadata: artifact.metadata
  };
}

function renderRecordToPrismaCreate(render: VideoRenderRecord) {
  return {
    id: render.id,
    tenantId: render.tenantId,
    videoProjectId: render.videoProjectId,
    videoUnitId: render.videoUnitId,
    videoReferenceId: render.videoReferenceId,
    versionNo: render.versionNo,
    status: render.status,
    isCurrent: render.isCurrent,
    previewStatus: render.previewStatus,
    previewUrl: render.previewUrl,
    fileKey: render.fileKey,
    durationSeconds: render.durationSeconds,
    renderMode: render.renderMode,
    qualityMode: render.qualityMode,
    qualityIssuesJson: render.qualityIssues,
    safeSummary: render.safeSummary,
    providerSummary: render.providerSummary,
    providerRouteId: render.providerRouteId,
    strategyVersion: render.strategyVersion,
    sourceVersionRefs: render.sourceVersionRefs,
    rejectedReason: render.rejectedReason,
    confirmedBy: render.confirmedBy,
    confirmedAt: render.confirmedAt,
    createdBy: render.createdBy,
    createdAt: render.createdAt,
    updatedAt: render.updatedAt,
    metadata: render.metadata
  };
}

function exportRecordToPrismaCreate(row: VideoExportRecord) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    videoProjectId: row.videoProjectId,
    videoUnitId: row.videoUnitId,
    videoReferenceId: row.videoReferenceId,
    status: row.status,
    fileKey: row.fileKey,
    downloadUrl: row.downloadUrl,
    fileName: row.fileName,
    renderVersionId: row.renderVersionId,
    renderVersionNo: row.renderVersionNo,
    safeSummary: row.safeSummary,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    metadata: row.metadata
  };
}

function createMockArtifactRecord(input: {
  id: string;
  input: VideoNarrationGenerationInput;
  versionNo: number;
  rank: number;
}): VideoArtifactRecord {
  const isRisky = input.rank === 3;
  const contentText = `前三秒钩子：${input.input.project.novelTitle}的主角刚醒来，就发现秦朝盐场快要崩盘。他靠现代化学知识把粗盐、火药和人心一步步变成翻盘筹码。第 ${input.rank} 版旁白强调${input.rank === 1 ? '爽点直给' : input.rank === 2 ? '人物反差' : '强冲突高风险'}，结尾留下官府新命令的悬念。`;
  return {
    id: input.id,
    tenantId: input.input.context.tenantId,
    videoProjectId: input.input.project.id,
    videoUnitId: input.input.unit.id,
    videoReferenceId: input.input.reference.referenceId,
    artifactType: 'narration_script',
    status: 'candidate',
    versionNo: input.versionNo,
    isCurrent: false,
    sourceVersionRefs: input.input.sourceVersionRefs,
    providerSummary: { provider: 'mock', model: 'mock-video-narration', isMockOutput: true, safeSummary: '受控 mock 旁白 provider，未调用真实模型。' },
    providerRouteId: 'video_narration_agent.mock.v1',
    strategyVersion: 'video_narration_strategy.v1',
    qualityMode: input.input.request.qualityMode ?? 'standard',
    contentText,
    hook: input.rank === 1 ? '秦朝盐场快塌了，他却拿出现代化学办法。' : input.rank === 2 ? '别人穿越靠系统，他靠一袋粗盐翻盘。' : '一个错误配方，可能让全城陪葬。',
    firstScreenSubtitle: input.rank === 1 ? '化学老师穿秦朝，开局救盐场' : input.rank === 2 ? '没有系统，他用化学硬改命' : '火药配方失控，秦朝盐场要炸了？',
    endingHook: '真正的危机，来自官府的下一道命令。',
    estimatedDurationSeconds: Math.max(10, Math.ceil(countWords(contentText) / 3.2)),
    wordCount: countWords(contentText),
    riskTags: isRisky ? ['火药表达需弱化', '平台风险偏高'] : ['低风险', '节奏稳定'],
    recommendationReason: input.rank === 1 ? '开头直接、风险可控，适合作为首条测试。' : input.rank === 2 ? '人物反差更强，可作为备选。' : '冲突更强但风险偏高，确认前需说明原因。',
    score: isRisky ? 58 : input.rank === 1 ? 88 : 82,
    qualitySummary: isRisky ? '冲突强但风险较高，不建议默认确认。' : '钩子清晰，时长适合首条测试。',
    rejectedReason: null,
    confirmedBy: null,
    confirmedAt: null,
    createdBy: input.input.context.userId,
    createdAt: input.input.now,
    updatedAt: input.input.now,
    metadata: { isMockOutput: true, candidateRank: input.rank }
  };
}

function createMockTtsArtifactRecord(input: {
  id: string;
  input: VideoTtsGenerationInput;
  versionNo: number;
}): VideoArtifactRecord {
  const durationSeconds = Math.max(8, Math.round(input.input.narration.estimatedDurationSeconds / Math.max(input.input.request.speed, 0.5)));
  const voiceName = input.input.request.voiceName ?? resolveMockVoiceName(input.input.request.voiceId);
  return {
    id: input.id,
    tenantId: input.input.context.tenantId,
    videoProjectId: input.input.project.id,
    videoUnitId: input.input.unit.id,
    videoReferenceId: input.input.reference.referenceId,
    artifactType: 'tts_audio',
    status: 'candidate',
    versionNo: input.versionNo,
    isCurrent: false,
    sourceVersionRefs: input.input.sourceVersionRefs,
    providerSummary: {
      provider: 'mock-local-tts',
      model: 'mock-tts-v1',
      isMockOutput: true,
      safeSummary: '本地 mock TTS provider，仅生成试听占位和安全摘要。'
    },
    providerRouteId: 'video_tts_provider.mock.v1',
    strategyVersion: 'video_tts_strategy.v1',
    qualityMode: input.input.request.qualityMode ?? 'standard',
    contentText: `mock TTS 基于旁白 v${input.input.narration.versionNo} 生成，未保存完整供应商请求。`,
    hook: input.input.narration.hook,
    firstScreenSubtitle: input.input.narration.firstScreenSubtitle,
    endingHook: input.input.narration.endingHook,
    estimatedDurationSeconds: durationSeconds,
    durationSeconds,
    fileKey: `mock://video-tts/${input.id}.mp3`,
    previewUrl: `/mock-audio/video-tts/${input.id}.mp3`,
    voiceId: input.input.request.voiceId,
    voiceName,
    speed: input.input.request.speed,
    emotion: input.input.request.emotion,
    volume: input.input.request.volume,
    wordCount: input.input.narration.wordCount,
    riskTags: ['模拟音频', input.input.request.speed > 1.4 ? '语速偏快' : '节奏稳定'],
    recommendationReason: `${voiceName} 已按 ${input.input.request.emotion} 情绪生成 mock 试听候选。`,
    score: input.input.request.speed > 1.4 ? 72 : 86,
    qualitySummary: 'mock/local TTS 产物，可用于流程验收；未调用真实外部 TTS。',
    rejectedReason: null,
    confirmedBy: null,
    confirmedAt: null,
    createdBy: input.input.context.userId,
    createdAt: input.input.now,
    updatedAt: input.input.now,
    metadata: { isMockOutput: true, narrationArtifactId: input.input.narration.id, previewKind: 'mock-local-audio-placeholder' }
  };
}

function createMockSubtitleArtifactRecord(input: {
  id: string;
  input: VideoSubtitleGenerationInput;
  versionNo: number;
}): VideoArtifactRecord {
  const subtitleStyle = input.input.request.subtitleStyle ?? 'balanced';
  const lineLength = clampSubtitleLineLength(input.input.request.lineLength);
  const contentText = createMockSubtitleText(input.input.narration, lineLength, subtitleStyle);
  const durationSeconds = input.input.tts.durationSeconds ?? input.input.tts.estimatedDurationSeconds ?? estimateSubtitleDuration(contentText);

  return {
    id: input.id,
    tenantId: input.input.context.tenantId,
    videoProjectId: input.input.project.id,
    videoUnitId: input.input.unit.id,
    videoReferenceId: input.input.reference.referenceId,
    artifactType: 'subtitle',
    status: 'candidate',
    versionNo: input.versionNo,
    isCurrent: false,
    sourceVersionRefs: input.input.sourceVersionRefs,
    providerSummary: {
      provider: 'mock-local-subtitle',
      model: 'mock-subtitle-v1',
      isMockOutput: true,
      safeSummary: '本地 mock 字幕 provider，仅生成分行字幕和安全摘要。'
    },
    providerRouteId: 'video_subtitle_provider.mock.v1',
    strategyVersion: 'video_subtitle_strategy.v1',
    qualityMode: input.input.request.qualityMode ?? 'standard',
    contentText,
    hook: input.input.narration.hook,
    firstScreenSubtitle: input.input.narration.firstScreenSubtitle,
    endingHook: '',
    estimatedDurationSeconds: durationSeconds,
    durationSeconds,
    wordCount: countWords(contentText),
    riskTags: subtitleStyle === 'dramatic' ? ['首屏强刺激需复核', '节奏偏快'] : ['低风险', '行长可控'],
    recommendationReason: `按 ${subtitleStyle} 风格和每行约 ${lineLength} 字生成字幕候选。`,
    score: subtitleStyle === 'dramatic' ? 78 : 88,
    qualitySummary: '字幕已按当前配音时长和旁白内容生成，可编辑后确认进入视觉方案前置。',
    rejectedReason: null,
    confirmedBy: null,
    confirmedAt: null,
    createdBy: input.input.context.userId,
    createdAt: input.input.now,
    updatedAt: input.input.now,
    metadata: {
      isMockOutput: true,
      ttsArtifactId: input.input.tts.id,
      narrationArtifactId: input.input.narration.id,
      subtitleStyle,
      lineLength,
      timelineSummary: createTimelineSummary(contentText)
    }
  };
}

function createMockVisualPlanArtifactRecord(input: {
  id: string;
  input: VideoVisualPlanSaveInput;
  versionNo: number;
}): VideoArtifactRecord {
  return {
    id: input.id,
    tenantId: input.input.context.tenantId,
    videoProjectId: input.input.project.id,
    videoUnitId: input.input.unit.id,
    videoReferenceId: input.input.reference.referenceId,
    artifactType: 'visual_plan',
    status: 'candidate',
    versionNo: input.versionNo,
    isCurrent: false,
    sourceVersionRefs: input.input.sourceVersionRefs,
    providerSummary: {
      provider: 'mock-local-render',
      model: 'mock-visual-plan-v1',
      isMockOutput: true,
      safeSummary: '本地 mock 视觉方案，仅保存循环背景和字幕安全区参数。'
    },
    providerRouteId: 'video_visual_plan_provider.mock.v1',
    strategyVersion: 'video_visual_plan_strategy.v1',
    qualityMode: input.input.request.qualityMode ?? 'standard',
    contentText: `视觉方案：${input.input.request.backgroundName ?? resolveMockBackgroundName(input.input.request.backgroundAssetId)}，${input.input.request.aspectRatio}，${input.input.request.resolution}。`,
    hook: input.input.subtitle.firstScreenSubtitle,
    firstScreenSubtitle: input.input.subtitle.firstScreenSubtitle,
    endingHook: '',
    estimatedDurationSeconds: input.input.subtitle.estimatedDurationSeconds,
    durationSeconds: input.input.subtitle.estimatedDurationSeconds,
    wordCount: 0,
    riskTags: ['mock 循环背景', input.input.request.safeAreaPreset === 'douyin_safe' ? '抖音安全区' : '安全区待复核'],
    recommendationReason: '视觉方案已绑定当前字幕版本，确认后可生成 mock/local 渲染预览。',
    score: input.input.request.fontSize > 64 ? 76 : 88,
    qualitySummary: '循环背景、字幕位置和安全区参数完整；未接真实素材库或外部渲染。',
    rejectedReason: null,
    confirmedBy: null,
    confirmedAt: null,
    createdBy: input.input.context.userId,
    createdAt: input.input.now,
    updatedAt: input.input.now,
    metadata: {
      isMockOutput: true,
      backgroundAssetId: input.input.request.backgroundAssetId,
      backgroundName: input.input.request.backgroundName ?? resolveMockBackgroundName(input.input.request.backgroundAssetId),
      backgroundType: 'loop_background',
      aspectRatio: input.input.request.aspectRatio,
      resolution: input.input.request.resolution,
      subtitlePosition: input.input.request.subtitlePosition,
      fontSize: input.input.request.fontSize,
      textColor: input.input.request.textColor,
      strokeColor: input.input.request.strokeColor,
      shadowEnabled: input.input.request.shadowEnabled,
      safeAreaPreset: input.input.request.safeAreaPreset,
      subtitleArtifactId: input.input.subtitle.id
    }
  };
}

function createMockRenderRecord(input: {
  id: string;
  input: VideoRenderGenerationInput;
  versionNo: number;
}): VideoRenderRecord {
  const visualMeta = input.input.visualPlan.metadata as { backgroundName?: string; aspectRatio?: string; resolution?: string } | null;
  return {
    id: input.id,
    tenantId: input.input.context.tenantId,
    videoProjectId: input.input.project.id,
    videoUnitId: input.input.unit.id,
    videoReferenceId: input.input.reference.referenceId,
    versionNo: input.versionNo,
    status: 'candidate',
    isCurrent: false,
    previewStatus: 'preview_pending',
    previewUrl: `/mock-video/render/${input.id}.mp4`,
    fileKey: `mock://video-render/${input.id}.mp4`,
    durationSeconds: Math.max(15, input.input.visualPlan.estimatedDurationSeconds),
    renderMode: 'mock_loop_background',
    qualityMode: input.input.request.qualityMode ?? 'standard',
    qualityIssues: visualMeta?.aspectRatio === '16:9' ? ['横屏比例需复核平台适配'] : ['mock 预览需人工确认'],
    safeSummary: `mock/local 渲染预览：${visualMeta?.backgroundName ?? '循环背景'}，${visualMeta?.resolution ?? '1080x1920'}。未调用真实外部渲染。`,
    providerSummary: {
      provider: 'mock-local-render',
      model: 'mock-render-v1',
      isMockOutput: true,
      safeSummary: '本地 mock render provider，仅生成播放器占位和导出占位。'
    },
    providerRouteId: 'video_render_provider.mock.v1',
    strategyVersion: 'video_render_strategy.v1',
    sourceVersionRefs: input.input.sourceVersionRefs,
    rejectedReason: null,
    confirmedBy: null,
    confirmedAt: null,
    createdBy: input.input.context.userId,
    createdAt: input.input.now,
    updatedAt: input.input.now,
    metadata: { isMockOutput: true, visualPlanArtifactId: input.input.visualPlan.id, previewKind: 'mock-local-video-placeholder' }
  };
}

function createMockSubtitleText(narration: VideoArtifactRecord, lineLength: number, subtitleStyle: 'compact' | 'balanced' | 'dramatic') {
  const punctuation = subtitleStyle === 'dramatic' ? '！' : '。';
  const baseText = narration.contentText.replace(/^前三秒钩子：/, '').replace(/[，。！？；：,.!?;:]/g, ' ').replace(/\s+/g, '');
  const text = baseText.length > 0 ? baseText : narration.firstScreenSubtitle;
  const lines: string[] = [];
  for (let index = 0; index < text.length; index += lineLength) {
    const chunk = text.slice(index, index + lineLength);
    if (chunk) lines.push(`${chunk}${punctuation}`);
  }
  if (subtitleStyle === 'compact') return lines.slice(0, 8).join('\n');
  if (subtitleStyle === 'dramatic') return [`${narration.firstScreenSubtitle}！`, ...lines.slice(0, 10)].join('\n');
  return [`${narration.firstScreenSubtitle}。`, ...lines.slice(0, 9)].join('\n');
}

function estimateSubtitleDuration(contentText: string) {
  return Math.max(8, Math.ceil(countWords(contentText) / 3.4));
}

function createTimelineSummary(contentText: string) {
  return contentText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function clampSubtitleLineLength(value?: number) {
  return Math.min(Math.max(value ?? 18, 10), 28);
}

function createMockNarrationTask(input: {
  id: string;
  outcome: 'success' | 'failed' | 'cancelled';
  retryOfTaskId: string | null;
}): VideoNarrationTaskDTO {
  if (input.outcome === 'failed') {
    return {
      id: input.id,
      taskType: 'video_narration_generate',
      status: 'failed',
      currentStep: 'calling_model',
      statusNote: '旁白生成失败，旧版本不受影响。可以重试生成或手动编辑。',
      progress: 45,
      failureCategory: 'provider_error',
      retryOfTaskId: input.retryOfTaskId,
      canRetry: true,
      canCancel: true
    };
  }

  if (input.outcome === 'cancelled') {
    return {
      id: input.id,
      taskType: 'video_narration_generate',
      status: 'cancelled',
      currentStep: 'cancelled',
      statusNote: '旁白生成已取消，未写入候选版本，配音仍保持锁定。',
      progress: 0,
      failureCategory: 'user_cancelled',
      retryOfTaskId: input.retryOfTaskId,
      canRetry: true,
      canCancel: false
    };
  }

  return {
    id: input.id,
    taskType: 'video_narration_generate',
    status: 'completed',
    currentStep: 'saving_result',
    statusNote: '旁白候选已生成，等待用户选择。',
    progress: 100,
    failureCategory: null,
    retryOfTaskId: input.retryOfTaskId,
    canRetry: false,
    canCancel: false
  };
}

function createMockTtsTask(input: {
  id: string;
  outcome: 'success' | 'failed' | 'cancelled';
  retryOfTaskId: string | null;
}): GenerateVideoTtsResultDTO['task'] {
  if (input.outcome === 'failed') {
    return {
      id: input.id,
      taskType: 'video_tts_generate',
      status: 'failed',
      currentStep: 'calling_model',
      statusNote: '配音生成失败，当前音频不受影响。可以重试、换音色或调整语速。',
      progress: 48,
      failureCategory: 'provider_error',
      retryOfTaskId: input.retryOfTaskId,
      canRetry: true,
      canCancel: true
    };
  }

  if (input.outcome === 'cancelled') {
    return {
      id: input.id,
      taskType: 'video_tts_generate',
      status: 'cancelled',
      currentStep: 'cancelled',
      statusNote: '配音生成已取消，未写入候选音频，字幕仍保持锁定。',
      progress: 0,
      failureCategory: 'user_cancelled',
      retryOfTaskId: input.retryOfTaskId,
      canRetry: true,
      canCancel: false
    };
  }

  return {
    id: input.id,
    taskType: 'video_tts_generate',
    status: 'completed',
    currentStep: 'saving_result',
    statusNote: '配音候选已生成，等待试听确认。',
    progress: 100,
    failureCategory: null,
    retryOfTaskId: input.retryOfTaskId,
    canRetry: false,
    canCancel: false
  };
}

function createMockSubtitleTask(input: {
  id: string;
  outcome: 'success' | 'failed' | 'cancelled';
  retryOfTaskId: string | null;
}): GenerateVideoSubtitleResultDTO['task'] {
  if (input.outcome === 'failed') {
    return {
      id: input.id,
      taskType: 'video_subtitle_generate',
      status: 'failed',
      currentStep: 'calling_model',
      statusNote: '字幕生成失败，当前字幕不受影响。可以重试或手动编辑字幕草稿。',
      progress: 52,
      failureCategory: 'provider_error',
      retryOfTaskId: input.retryOfTaskId,
      canRetry: true,
      canCancel: true
    };
  }

  if (input.outcome === 'cancelled') {
    return {
      id: input.id,
      taskType: 'video_subtitle_generate',
      status: 'cancelled',
      currentStep: 'cancelled',
      statusNote: '字幕生成已取消，未写入候选字幕。',
      progress: 0,
      failureCategory: 'user_cancelled',
      retryOfTaskId: input.retryOfTaskId,
      canRetry: true,
      canCancel: false
    };
  }

  return {
    id: input.id,
    taskType: 'video_subtitle_generate',
    status: 'completed',
    currentStep: 'saving_result',
    statusNote: '字幕候选已生成，等待编辑或确认。',
    progress: 100,
    failureCategory: null,
    retryOfTaskId: input.retryOfTaskId,
    canRetry: false,
    canCancel: false
  };
}

function createMockRenderTask(input: {
  id: string;
  outcome: 'success' | 'failed' | 'cancelled';
  retryOfTaskId: string | null;
}): GenerateVideoRenderResultDTO['task'] {
  if (input.outcome === 'failed') {
    return {
      id: input.id,
      taskType: 'video_render_generate',
      status: 'failed',
      currentStep: 'rendering_preview',
      statusNote: 'mock/local 渲染失败，当前视频不受影响。可以重试或调整视觉方案。',
      progress: 56,
      failureCategory: 'provider_error',
      retryOfTaskId: input.retryOfTaskId,
      canRetry: true,
      canCancel: true
    };
  }

  if (input.outcome === 'cancelled') {
    return {
      id: input.id,
      taskType: 'video_render_generate',
      status: 'cancelled',
      currentStep: 'cancelled',
      statusNote: '渲染任务已取消，未写入渲染候选，导出仍保持锁定。',
      progress: 0,
      failureCategory: 'user_cancelled',
      retryOfTaskId: input.retryOfTaskId,
      canRetry: true,
      canCancel: false
    };
  }

  return {
    id: input.id,
    taskType: 'video_render_generate',
    status: 'completed',
    currentStep: 'saving_result',
    statusNote: '渲染候选已生成，等待预览确认。',
    progress: 100,
    failureCategory: null,
    retryOfTaskId: input.retryOfTaskId,
    canRetry: false,
    canCancel: false
  };
}

function getNextRenderVersion(renders: VideoRenderRecord[]) {
  return renders.reduce((max, render) => Math.max(max, render.versionNo), 0) + 1;
}

function resolveMockBackgroundName(backgroundAssetId: string) {
  if (backgroundAssetId === 'mock-bg-night-city') return '夜色城市循环背景';
  if (backgroundAssetId === 'mock-bg-ink-motion') return '水墨流动循环背景';
  return '盐场风沙循环背景';
}

function resolveMockVoiceName(voiceId: string) {
  if (voiceId === 'mock-female-bright') return '女声-明亮感';
  if (voiceId === 'mock-neutral-calm') return '中性-冷静感';
  return '男声-剧情感';
}

function getNextVersion(artifacts: VideoArtifactRecord[]) {
  return artifacts.reduce((max, artifact) => Math.max(max, artifact.versionNo), 0) + 1;
}

function countWords(text: string) {
  return Array.from(text.trim()).filter((char) => !/\s/.test(char)).length;
}

function toChapterSnapshotDTO(snapshot: VideoReferenceChapterSnapshotRecord): VideoReferenceChapterSnapshotDTO {
  return {
    chapterId: snapshot.chapterId,
    chapterNo: snapshot.chapterNo,
    chapterTitle: snapshot.chapterTitle,
    contentVersionId: snapshot.contentVersionId,
    wordCount: snapshot.wordCount,
    summary: snapshot.summary,
    riskLevel: snapshot.riskLevel
  };
}

function toIssueDTO(issue: VideoReferenceIssueRecord): VideoReferenceIssueDTO {
  return {
    id: issue.id,
    issueLevel: issue.issueLevel,
    issueType: issue.issueType,
    issueReason: issue.issueReason,
    affectedChapterIds: issue.affectedChapterIds,
    status: issue.status,
    resolutionAction: issue.resolutionAction,
    resolutionReason: issue.resolutionReason
  };
}

function createChapterRangeText(chapters: Array<{ chapterNo: number }>): string {
  if (chapters.length === 0) return '未选择章节';
  const numbers = chapters.map((chapter) => chapter.chapterNo);
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  return min === max ? `第 ${min} 章` : `第 ${min}-${max} 章`;
}

function normalizeFirstVideoSuggestion(value: unknown, fallbackChapterIds: string[]) {
  if (value && typeof value === 'object') {
    const raw = value as { chapterIds?: unknown; chapterRangeText?: unknown; chapterRange?: unknown; title?: unknown; titleHook?: unknown };
    const chapterIds = toStringArray(raw.chapterIds);
    return {
      chapterRangeText:
        typeof raw.chapterRangeText === 'string'
          ? raw.chapterRangeText
          : typeof raw.chapterRange === 'string'
            ? raw.chapterRange
            : '推荐首条范围',
      chapterIds: chapterIds.length > 0 ? chapterIds : fallbackChapterIds,
      title: typeof raw.title === 'string' ? raw.title : typeof raw.titleHook === 'string' ? raw.titleHook : '首条视频建议'
    };
  }

  return {
    chapterRangeText: '推荐首条范围',
    chapterIds: fallbackChapterIds,
    title: '首条视频建议'
  };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function createId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

type PrismaVideoClient = Record<string, unknown> & {
  $transaction: <T>(input: Promise<T>[] | ((tx: PrismaVideoClient) => Promise<T>)) => Promise<T>;
  novel: PrismaCrud;
  novelChapter: PrismaCrud;
  chapterContentVersion: PrismaCrud;
  videoReadinessSnapshot: PrismaCrud;
  videoProject: PrismaCrud;
  videoReference: PrismaCrud;
  videoReferenceChapterSnapshot: PrismaCrud;
  videoReferenceIssue: PrismaCrud;
  videoUnit: PrismaCrud;
  videoArtifact: PrismaCrud;
  videoRender: PrismaCrud;
  videoExport: PrismaCrud;
  videoActionReceipt: PrismaCrud;
  videoOperationLog: PrismaCrud;
};

type PrismaCrud = {
  findMany: (args?: unknown) => Promise<any[]>;
  findFirst: (args?: unknown) => Promise<any | null>;
  findUnique: (args?: unknown) => Promise<any | null>;
  count: (args?: unknown) => Promise<number>;
  create: (args: unknown) => Promise<any>;
  createMany: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<any>;
  updateMany: (args: unknown) => Promise<unknown>;
};

type PrismaNovelRecord = any;
type PrismaVideoProjectRecord = any;
type PrismaVideoReferenceRecord = any;
type PrismaVideoChapterSnapshotRecord = any;
type PrismaVideoIssueRecord = any;
type PrismaVideoUnitRecord = any;
type PrismaVideoActionReceiptRecord = any;
type PrismaVideoArtifactRecord = any;
type PrismaVideoRenderRecord = any;
type PrismaVideoExportRecord = any;
