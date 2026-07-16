import {
  type CreateVideoExportResultDTO,
  type GenerateVideoRenderResultDTO,
  type GenerateVideoSubtitleResultDTO,
  type GenerateVideoTtsResultDTO,
  type VideoNarrationTaskDTO,
  type VideoProjectActionResultDTO,
  type VideoReferenceChapterSnapshotDTO,
  type VideoReferenceDetailDTO,
  type VideoReferenceIssueDTO,
  type VideoReferenceStatus,
  type VideoReadySourceDTO
} from '@ai-shortvideo/shared';
import {
  createVideoReferenceNextAction,
  toProjectDTO,
  type VideoActionReceiptRecord,
  type VideoChapterCurrentVersionRecord,
  type VideoOperationLogRecord,
  type VideoArtifactRecord,
  type VideoExportRecord,
  type VideoProjectCreationInput,
  type VideoProjectRecord,
  type VideoProjectStopInput,
  type VideoReferenceChapterSnapshotRecord,
  type VideoReferenceIssueRecord,
  type VideoReferenceIssueResolutionInput,
  type VideoReferenceRecord,
  type VideoReferenceRecheckInput,
  type VideoRenderRecord,
  type VideoRepository,
  type VideoSourceRecord,
  type VideoUnitRecord
} from '../domain/videoDomain.js';
import { toExportDTO, toExportListDTO, toNarrationArtifactDTO, toNarrationListDTO, toRenderDTO, toRenderListDTO, toSubtitleArtifactDTO, toSubtitleListDTO, toTtsArtifactDTO, toTtsListDTO, toVisualPlanArtifactDTO, toVisualPlanListDTO } from '../domain/videoDomain.js';

export function createInMemoryVideoRepository(): VideoRepository & {
  getProjects(): VideoProjectRecord[];
  getActionReceipts(): VideoActionReceiptRecord[];
  getOperationLogs(): VideoOperationLogRecord[];
  getNarrationArtifacts(): VideoArtifactRecord[];
  getRenders(): VideoRenderRecord[];
  getExports(): VideoExportRecord[];
  mutateCurrentChapterVersion(novelId: string, chapterId: string, contentVersionId: string): void;
} {
  let sequence = 1;
  const sources = createSeedSources();
  const projects: VideoProjectRecord[] = [];
  const references: VideoReferenceRecord[] = [];
  const chapterSnapshots: VideoReferenceChapterSnapshotRecord[] = [];
  const units: VideoUnitRecord[] = [];
  const issues: VideoReferenceIssueRecord[] = [];
  const artifacts: VideoArtifactRecord[] = [];
  const renders: VideoRenderRecord[] = [];
  const exports: VideoExportRecord[] = [];
  const receipts: VideoActionReceiptRecord[] = [];
  const operationLogs: VideoOperationLogRecord[] = [];

  function nextId(prefix: string) {
    return `${prefix}_${String(sequence++).padStart(6, '0')}`;
  }

  const repository: VideoRepository & {
    getProjects(): VideoProjectRecord[];
    getActionReceipts(): VideoActionReceiptRecord[];
    getOperationLogs(): VideoOperationLogRecord[];
    getNarrationArtifacts(): VideoArtifactRecord[];
    getRenders(): VideoRenderRecord[];
    getExports(): VideoExportRecord[];
    mutateCurrentChapterVersion(novelId: string, chapterId: string, contentVersionId: string): void;
  } = {
    async listSources(query) {
      const filtered = sources
        .filter((source) => source.tenantId === query.tenantId)
        .filter((source) => !query.keyword || source.title.includes(query.keyword));
      return paginate(filtered.map(toSourceDTO), query.page, query.pageSize);
    },

    async listProjects(query) {
      const filtered = projects
        .filter((project) => project.tenantId === query.tenantId && !project.deletedAt)
        .filter((project) => !query.keyword || project.title.includes(query.keyword) || project.novelTitle.includes(query.keyword))
        .filter((project) => !query.novelId || project.novelId === query.novelId)
        .filter((project) => !query.referenceStatus || project.referenceStatus === query.referenceStatus)
        .filter((project) => !query.lifecycleStatus || project.lifecycleStatus === query.lifecycleStatus)
        .filter((project) => !query.productionStatus || project.productionStatus === query.productionStatus)
        .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
      return paginate(filtered.map(toProjectDTO), query.page, query.pageSize);
    },

    async findSourceByNovelId(tenantId, novelId) {
      return cloneSource(sources.find((source) => source.tenantId === tenantId && source.novelId === novelId) ?? null);
    },

    async findProjectById(tenantId, videoId) {
      return cloneProject(projects.find((project) => project.tenantId === tenantId && project.id === videoId && !project.deletedAt) ?? null);
    },

    async findDefaultUnit(tenantId, videoProjectId) {
      return clone(units.find((unit) => unit.tenantId === tenantId && unit.videoProjectId === videoProjectId) ?? null);
    },

    async findActionReceipt(tenantId, actionType, idempotencyToken) {
      return clone(receipts.find((receipt) => receipt.tenantId === tenantId && receipt.actionType === actionType && receipt.idempotencyToken === idempotencyToken) ?? null);
    },

    async listActionReceipts(tenantId, videoProjectId, actionType, limit = 10) {
      return receipts
        .filter((receipt) => receipt.tenantId === tenantId && receipt.videoProjectId === videoProjectId && receipt.actionType === actionType)
        .slice(0, limit)
        .map((receipt) => clone(receipt));
    },

    async createActionReceipt(input) {
      const receipt: VideoActionReceiptRecord = {
        id: nextId('vreceipt'),
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
      };
      receipts.unshift(receipt);
      return clone(receipt);
    },

    async createProjectWithReference(input) {
      const projectId = nextId('video');
      const referenceId = nextId('vref');
      const unitId = nextId('vunit');
      const chapterRangeText = createChapterRangeText(input.chapters);
      const project: VideoProjectRecord = {
        id: projectId,
        tenantId: input.context.tenantId,
        title: input.request.title,
        projectType: input.request.projectType,
        novelId: input.source.novelId,
        novelTitle: input.source.title,
        lifecycleStatus: 'active',
        referenceStatus: 'normal',
        productionStatus: 'not_started',
        chapterRangeText,
        chapterCount: input.chapters.length,
        currentVideoReferenceId: referenceId,
        defaultVideoUnitId: unitId,
        createdAt: input.now,
        updatedAt: input.now,
        deletedAt: null
      };
      const reference: VideoReferenceRecord = {
        id: referenceId,
        tenantId: input.context.tenantId,
        videoProjectId: projectId,
        novelId: input.source.novelId,
        versionNo: 1,
        status: 'normal',
        chapterRangeText,
        chapterCount: input.chapters.length,
        referenceSummary: `引用 ${input.source.title} ${chapterRangeText}，共 ${input.chapters.length} 章。`,
        createdAt: input.now,
        updatedAt: input.now
      };
      const snapshots = input.chapters.map((chapter) => createChapterSnapshot({
        id: nextId('vchap'),
        tenantId: input.context.tenantId,
        referenceId,
        novelId: input.source.novelId,
        chapter,
        now: input.now
      }));
      const unit: VideoUnitRecord = {
        id: unitId,
        tenantId: input.context.tenantId,
        videoProjectId: projectId,
        videoReferenceId: referenceId,
        unitNo: 1,
        unitType: 'first_test',
        title: input.request.title,
        chapterRangeText,
        chapterIds: input.chapters.map((chapter) => chapter.chapterId),
        status: 'reference_ready',
        productionStatus: 'not_started',
        createdAt: input.now,
        updatedAt: input.now
      };
      projects.unshift(project);
      references.unshift(reference);
      chapterSnapshots.unshift(...snapshots);
      units.unshift(unit);
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: projectId,
        action: 'create_video_project',
        objectType: 'video_project',
        objectId: projectId,
        reason: '创建视频承接项目并保存引用快照',
        createdBy: input.context.userId,
        now: input.now,
        metadata: {
          videoReadinessSnapshotId: input.request.videoReadinessSnapshotId,
          requestHash: input.requestHash
        }
      }));
      receipts.unshift({
        id: nextId('vreceipt'),
        tenantId: input.context.tenantId,
        videoProjectId: projectId,
        actionType: 'create_video_project',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_project',
        resultObjectId: projectId,
        createdBy: input.context.userId,
        createdAt: input.now,
        metadata: {
          referenceId
        }
      });
      const detail = toReferenceDetail(project, reference, snapshots, []);
      return { project: toProjectDTO(project), reference: detail, reusedExisting: false };
    },

    async getReferenceDetail(tenantId, videoId) {
      const project = projects.find((item) => item.tenantId === tenantId && item.id === videoId && !item.deletedAt);
      if (!project) return null;
      return buildReferenceDetail(project);
    },

    async listNarrationArtifacts(tenantId, videoProjectId) {
      return artifacts
        .filter((artifact) => artifact.tenantId === tenantId && artifact.videoProjectId === videoProjectId && artifact.artifactType === 'narration_script')
        .map((artifact) => cloneArtifact(artifact)!);
    },

    async getNarrationArtifact(tenantId, videoProjectId, artifactId) {
      return cloneArtifact(artifacts.find((artifact) => artifact.tenantId === tenantId && artifact.videoProjectId === videoProjectId && artifact.id === artifactId) ?? null);
    },

    async listTtsArtifacts(tenantId, videoProjectId) {
      return artifacts
        .filter((artifact) => artifact.tenantId === tenantId && artifact.videoProjectId === videoProjectId && artifact.artifactType === 'tts_audio')
        .map((artifact) => cloneArtifact(artifact)!);
    },

    async getTtsArtifact(tenantId, videoProjectId, artifactId) {
      return cloneArtifact(artifacts.find((artifact) => artifact.tenantId === tenantId && artifact.videoProjectId === videoProjectId && artifact.id === artifactId && artifact.artifactType === 'tts_audio') ?? null);
    },

    async listSubtitleArtifacts(tenantId, videoProjectId) {
      return artifacts
        .filter((artifact) => artifact.tenantId === tenantId && artifact.videoProjectId === videoProjectId && artifact.artifactType === 'subtitle')
        .map((artifact) => cloneArtifact(artifact)!);
    },

    async getSubtitleArtifact(tenantId, videoProjectId, artifactId) {
      return cloneArtifact(artifacts.find((artifact) => artifact.tenantId === tenantId && artifact.videoProjectId === videoProjectId && artifact.id === artifactId && artifact.artifactType === 'subtitle') ?? null);
    },

    async listVisualPlanArtifacts(tenantId, videoProjectId) {
      return artifacts
        .filter((artifact) => artifact.tenantId === tenantId && artifact.videoProjectId === videoProjectId && artifact.artifactType === 'visual_plan')
        .map((artifact) => cloneArtifact(artifact)!);
    },

    async getVisualPlanArtifact(tenantId, videoProjectId, artifactId) {
      return cloneArtifact(artifacts.find((artifact) => artifact.tenantId === tenantId && artifact.videoProjectId === videoProjectId && artifact.id === artifactId && artifact.artifactType === 'visual_plan') ?? null);
    },

    async listRenders(tenantId, videoProjectId) {
      return renders.filter((render) => render.tenantId === tenantId && render.videoProjectId === videoProjectId).map((render) => cloneRender(render)!);
    },

    async getRender(tenantId, videoProjectId, renderId) {
      return cloneRender(renders.find((render) => render.tenantId === tenantId && render.videoProjectId === videoProjectId && render.id === renderId) ?? null);
    },

    async listExports(tenantId, videoProjectId) {
      return exports.filter((exportRecord) => exportRecord.tenantId === tenantId && exportRecord.videoProjectId === videoProjectId).map((exportRecord) => cloneExport(exportRecord)!);
    },

    async createNarrationCandidates(input) {
      const mockOutcome = input.request.mockTaskOutcome ?? 'success';
      const task = createMockNarrationTask({
        id: nextId('vtask'),
        outcome: mockOutcome,
        retryOfTaskId: input.request.retryOfTaskId ?? null
      });

      if (mockOutcome !== 'success') {
        operationLogs.unshift(createOperationLog({
          id: nextId('voplog'),
          tenantId: input.context.tenantId,
          videoProjectId: input.project.id,
          action: 'generate_video_narration',
          objectType: 'video_narration_task',
          objectId: task.id,
          reason: task.statusNote,
          createdBy: input.context.userId,
          now: input.now,
          metadata: {
            requestHash: input.requestHash,
            task,
            safeSummary: '旁白生成未写入候选，旧版本不受影响。'
          }
        }));
        receipts.unshift(createNarrationTaskReceipt({
          id: nextId('vreceipt'),
          input,
          task,
          artifactIds: []
        }));
        return {
          task,
          artifacts: [],
          current: toNarrationListDTO(artifacts.filter((artifact) => artifact.videoProjectId === input.project.id)).current
        };
      }

      const created = createMockNarrationCandidates({
        nextId,
        existing: artifacts.filter((artifact) => artifact.videoProjectId === input.project.id),
        input
      });
      artifacts.unshift(...created);
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        action: 'generate_video_narration',
        objectType: 'video_artifact',
        objectId: created[0]?.id ?? input.project.id,
        reason: '生成旁白候选',
        createdBy: input.context.userId,
        now: input.now,
        metadata: {
          requestHash: input.requestHash,
          taskId: task.id,
          candidateCount: created.length,
          providerSummary: created[0]?.providerSummary
        }
      }));
      receipts.unshift(createNarrationTaskReceipt({
        id: nextId('vreceipt'),
        input,
        task,
        artifactIds: created.map((artifact) => artifact.id)
      }));
      return {
        task,
        artifacts: created.map(toNarrationArtifactDTO),
        current: toNarrationListDTO(artifacts.filter((artifact) => artifact.videoProjectId === input.project.id)).current
      };
    },

    async saveNarrationDraft(input) {
      const versionNo = getNextArtifactVersion(artifacts, input.project.id);
      const draft: VideoArtifactRecord = {
        id: nextId('vartifact'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        videoUnitId: input.unit.id,
        videoReferenceId: input.reference.referenceId,
        artifactType: 'narration_script',
        status: 'draft',
        versionNo,
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
        estimatedDurationSeconds: estimateDurationSeconds(input.request.contentText),
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
      artifacts.unshift(draft);
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        action: 'save_video_narration_draft',
        objectType: 'video_artifact',
        objectId: draft.id,
        reason: input.request.reason,
        createdBy: input.context.userId,
        now: input.now,
        metadata: { requestHash: input.requestHash, baseArtifactId: input.request.baseArtifactId ?? null }
      }));
      receipts.unshift(createArtifactReceipt({
        id: nextId('vreceipt'),
        input,
        actionType: 'save_video_narration_draft',
        resultObjectId: draft.id
      }));
      return {
        artifact: toNarrationArtifactDTO(draft),
        narrations: toNarrationListDTO(artifacts.filter((artifact) => artifact.videoProjectId === input.project.id))
      };
    },

    async confirmNarration(input) {
      for (const artifact of artifacts.filter((item) => item.videoProjectId === input.project.id && item.artifactType === 'narration_script')) {
        if (artifact.isCurrent) {
          artifact.isCurrent = false;
          if (artifact.status === 'confirmed') artifact.status = 'archived';
          artifact.updatedAt = input.now;
        }
      }
      const artifact = artifacts.find((item) => item.id === input.artifact.id)!;
      artifact.status = 'confirmed';
      artifact.isCurrent = true;
      artifact.confirmedBy = input.context.userId;
      artifact.confirmedAt = input.now;
      artifact.updatedAt = input.now;
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        action: 'confirm_video_narration',
        objectType: 'video_artifact',
        objectId: artifact.id,
        reason: input.request.riskContinueReason ?? '确认旁白稿',
        createdBy: input.context.userId,
        now: input.now,
        metadata: {
          requestHash: input.requestHash,
          sourceVersionRefs: artifact.sourceVersionRefs,
          downstreamStale: ['tts_audio', 'subtitle', 'visual_plan', 'render', 'export']
        }
      }));
      receipts.unshift(createArtifactReceipt({
        id: nextId('vreceipt'),
        input,
        actionType: 'confirm_video_narration',
        resultObjectId: artifact.id
      }));
      const narrations = toNarrationListDTO(artifacts.filter((item) => item.videoProjectId === input.project.id));
      return { current: toNarrationArtifactDTO(artifact), narrations };
    },

    async rejectNarration(input) {
      const artifact = artifacts.find((item) => item.id === input.artifact.id)!;
      artifact.status = 'rejected';
      artifact.isCurrent = false;
      artifact.rejectedReason = input.request.reason;
      artifact.updatedAt = input.now;
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        action: 'reject_video_narration',
        objectType: 'video_artifact',
        objectId: artifact.id,
        reason: input.request.reason,
        createdBy: input.context.userId,
        now: input.now,
        metadata: { requestHash: input.requestHash }
      }));
      receipts.unshift(createArtifactReceipt({
        id: nextId('vreceipt'),
        input,
        actionType: 'reject_video_narration',
        resultObjectId: artifact.id
      }));
      return {
        artifact: toNarrationArtifactDTO(artifact),
        narrations: toNarrationListDTO(artifacts.filter((item) => item.videoProjectId === input.project.id))
      };
    },

    async createTtsCandidate(input) {
      const mockOutcome = input.request.mockTaskOutcome ?? 'success';
      const task = createMockTtsTask({
        id: nextId('vttask'),
        outcome: mockOutcome,
        retryOfTaskId: input.request.retryOfTaskId ?? null
      });

      if (mockOutcome !== 'success') {
        operationLogs.unshift(createOperationLog({
          id: nextId('voplog'),
          tenantId: input.context.tenantId,
          videoProjectId: input.project.id,
          action: 'generate_video_tts',
          objectType: 'video_tts_task',
          objectId: task.id,
          reason: task.statusNote,
          createdBy: input.context.userId,
          now: input.now,
          metadata: {
            requestHash: input.requestHash,
            task,
            safeSummary: '配音生成未写入候选，当前音频不受影响。'
          }
        }));
        receipts.unshift(createTtsTaskReceipt({
          id: nextId('vreceipt'),
          input,
          task,
          artifactIds: []
        }));
        return {
          task,
          artifacts: [],
          current: toTtsListDTO(artifacts.filter((artifact) => artifact.videoProjectId === input.project.id)).current
        };
      }

      const artifact = createMockTtsArtifact({
        id: nextId('vartifact'),
        existing: artifacts.filter((item) => item.videoProjectId === input.project.id),
        input
      });
      artifacts.unshift(artifact);
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        action: 'generate_video_tts',
        objectType: 'video_artifact',
        objectId: artifact.id,
        reason: '生成配音候选',
        createdBy: input.context.userId,
        now: input.now,
        metadata: {
          requestHash: input.requestHash,
          taskId: task.id,
          providerSummary: artifact.providerSummary,
          safeSummary: 'mock/local TTS 生成安全摘要，未调用真实 TTS provider。'
        }
      }));
      receipts.unshift(createTtsTaskReceipt({
        id: nextId('vreceipt'),
        input,
        task,
        artifactIds: [artifact.id]
      }));
      return {
        task,
        artifacts: [toTtsArtifactDTO(artifact)],
        current: toTtsListDTO(artifacts.filter((item) => item.videoProjectId === input.project.id)).current
      };
    },

    async confirmTts(input) {
      for (const artifact of artifacts.filter((item) => item.videoProjectId === input.project.id && item.artifactType === 'tts_audio')) {
        if (artifact.isCurrent) {
          artifact.isCurrent = false;
          if (artifact.status === 'confirmed') artifact.status = 'archived';
          artifact.updatedAt = input.now;
        }
      }
      const artifact = artifacts.find((item) => item.id === input.artifact.id)!;
      artifact.status = 'confirmed';
      artifact.isCurrent = true;
      artifact.confirmedBy = input.context.userId;
      artifact.confirmedAt = input.now;
      artifact.updatedAt = input.now;
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        action: 'confirm_video_tts',
        objectType: 'video_artifact',
        objectId: artifact.id,
        reason: '确认配音版本',
        createdBy: input.context.userId,
        now: input.now,
        metadata: {
          requestHash: input.requestHash,
          sourceVersionRefs: artifact.sourceVersionRefs,
          downstreamStale: ['subtitle', 'visual_plan', 'render', 'export']
        }
      }));
      receipts.unshift(createArtifactReceipt({
        id: nextId('vreceipt'),
        input,
        actionType: 'confirm_video_tts',
        resultObjectId: artifact.id
      }));
      return {
        current: toTtsArtifactDTO(artifact),
        tts: toTtsListDTO(artifacts.filter((item) => item.videoProjectId === input.project.id))
      };
    },

    async rejectTts(input) {
      const artifact = artifacts.find((item) => item.id === input.artifact.id)!;
      artifact.status = 'rejected';
      artifact.isCurrent = false;
      artifact.rejectedReason = input.request.reason;
      artifact.updatedAt = input.now;
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        action: 'reject_video_tts',
        objectType: 'video_artifact',
        objectId: artifact.id,
        reason: input.request.reason,
        createdBy: input.context.userId,
        now: input.now,
        metadata: { requestHash: input.requestHash }
      }));
      receipts.unshift(createArtifactReceipt({
        id: nextId('vreceipt'),
        input,
        actionType: 'reject_video_tts',
        resultObjectId: artifact.id
      }));
      return {
        artifact: toTtsArtifactDTO(artifact),
        tts: toTtsListDTO(artifacts.filter((item) => item.videoProjectId === input.project.id))
      };
    },

    async createSubtitleCandidate(input) {
      const mockOutcome = input.request.mockTaskOutcome ?? 'success';
      const task = createMockSubtitleTask({
        id: nextId('vstask'),
        outcome: mockOutcome,
        retryOfTaskId: input.request.retryOfTaskId ?? null
      });

      if (mockOutcome !== 'success') {
        operationLogs.unshift(createOperationLog({
          id: nextId('voplog'),
          tenantId: input.context.tenantId,
          videoProjectId: input.project.id,
          action: 'generate_video_subtitle',
          objectType: 'video_subtitle_task',
          objectId: task.id,
          reason: task.statusNote,
          createdBy: input.context.userId,
          now: input.now,
          metadata: {
            requestHash: input.requestHash,
            task,
            safeSummary: '字幕生成未写入候选，当前字幕不受影响。'
          }
        }));
        receipts.unshift(createSubtitleTaskReceipt({
          id: nextId('vreceipt'),
          input,
          task,
          artifactIds: []
        }));
        return {
          task,
          artifacts: [],
          current: toSubtitleListDTO(artifacts.filter((artifact) => artifact.videoProjectId === input.project.id)).current
        };
      }

      const artifact = createMockSubtitleArtifact({
        id: nextId('vartifact'),
        existing: artifacts.filter((item) => item.videoProjectId === input.project.id),
        input
      });
      artifacts.unshift(artifact);
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        action: 'generate_video_subtitle',
        objectType: 'video_artifact',
        objectId: artifact.id,
        reason: '生成字幕候选',
        createdBy: input.context.userId,
        now: input.now,
        metadata: {
          requestHash: input.requestHash,
          taskId: task.id,
          providerSummary: artifact.providerSummary,
          safeSummary: 'mock/local 字幕生成安全摘要，未调用真实字幕 provider。'
        }
      }));
      receipts.unshift(createSubtitleTaskReceipt({
        id: nextId('vreceipt'),
        input,
        task,
        artifactIds: [artifact.id]
      }));
      return {
        task,
        artifacts: [toSubtitleArtifactDTO(artifact)],
        current: toSubtitleListDTO(artifacts.filter((item) => item.videoProjectId === input.project.id)).current
      };
    },

    async saveSubtitleDraft(input) {
      const versionNo = getNextArtifactVersion(artifacts, input.project.id, 'subtitle');
      const draft: VideoArtifactRecord = {
        id: nextId('vartifact'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        videoUnitId: input.unit.id,
        videoReferenceId: input.reference.referenceId,
        artifactType: 'subtitle',
        status: 'draft',
        versionNo,
        isCurrent: false,
        sourceVersionRefs: input.sourceVersionRefs,
        providerSummary: { provider: 'manual', model: 'manual-edit', isMockOutput: false, safeSummary: '用户手动编辑字幕稿' },
        providerRouteId: 'video_subtitle_manual.v1',
        strategyVersion: 'video_subtitle_strategy.v1',
        qualityMode: 'standard',
        contentText: input.request.contentText,
        hook: input.request.firstScreenSubtitle,
        firstScreenSubtitle: input.request.firstScreenSubtitle,
        endingHook: '',
        estimatedDurationSeconds: estimateSubtitleDuration(input.request.contentText),
        wordCount: countWords(input.request.contentText),
        riskTags: [],
        recommendationReason: '用户手动编辑保存。',
        score: 82,
        qualitySummary: '手动字幕草稿，建议确认前检查首屏字幕和行长。',
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
          timelineSummary: createTimelineSummary(input.request.contentText),
          subtitleStyle: 'balanced',
          lineLength: 18
        }
      };
      artifacts.unshift(draft);
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        action: 'save_video_subtitle_draft',
        objectType: 'video_artifact',
        objectId: draft.id,
        reason: input.request.reason,
        createdBy: input.context.userId,
        now: input.now,
        metadata: { requestHash: input.requestHash, baseArtifactId: input.request.baseArtifactId ?? null }
      }));
      receipts.unshift(createArtifactReceipt({
        id: nextId('vreceipt'),
        input,
        actionType: 'save_video_subtitle_draft',
        resultObjectId: draft.id
      }));
      return {
        artifact: toSubtitleArtifactDTO(draft),
        subtitles: toSubtitleListDTO(artifacts.filter((artifact) => artifact.videoProjectId === input.project.id))
      };
    },

    async confirmSubtitle(input) {
      for (const artifact of artifacts.filter((item) => item.videoProjectId === input.project.id && item.artifactType === 'subtitle')) {
        if (artifact.isCurrent) {
          artifact.isCurrent = false;
          if (artifact.status === 'confirmed') artifact.status = 'archived';
          artifact.updatedAt = input.now;
        }
      }
      const artifact = artifacts.find((item) => item.id === input.artifact.id)!;
      artifact.status = 'confirmed';
      artifact.isCurrent = true;
      artifact.confirmedBy = input.context.userId;
      artifact.confirmedAt = input.now;
      artifact.updatedAt = input.now;
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        action: 'confirm_video_subtitle',
        objectType: 'video_artifact',
        objectId: artifact.id,
        reason: '确认字幕版本',
        createdBy: input.context.userId,
        now: input.now,
        metadata: {
          requestHash: input.requestHash,
          sourceVersionRefs: artifact.sourceVersionRefs,
          downstreamStale: ['visual_plan', 'render', 'export']
        }
      }));
      receipts.unshift(createArtifactReceipt({
        id: nextId('vreceipt'),
        input,
        actionType: 'confirm_video_subtitle',
        resultObjectId: artifact.id
      }));
      return {
        current: toSubtitleArtifactDTO(artifact),
        subtitles: toSubtitleListDTO(artifacts.filter((item) => item.videoProjectId === input.project.id))
      };
    },

    async rejectSubtitle(input) {
      const artifact = artifacts.find((item) => item.id === input.artifact.id)!;
      artifact.status = 'rejected';
      artifact.isCurrent = false;
      artifact.rejectedReason = input.request.reason;
      artifact.updatedAt = input.now;
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        action: 'reject_video_subtitle',
        objectType: 'video_artifact',
        objectId: artifact.id,
        reason: input.request.reason,
        createdBy: input.context.userId,
        now: input.now,
        metadata: { requestHash: input.requestHash }
      }));
      receipts.unshift(createArtifactReceipt({
        id: nextId('vreceipt'),
        input,
        actionType: 'reject_video_subtitle',
        resultObjectId: artifact.id
      }));
      return {
        artifact: toSubtitleArtifactDTO(artifact),
        subtitles: toSubtitleListDTO(artifacts.filter((item) => item.videoProjectId === input.project.id))
      };
    },

    async saveVisualPlan(input) {
      const versionNo = getNextArtifactVersion(artifacts, input.project.id, 'visual_plan');
      const artifact: VideoArtifactRecord = {
        id: nextId('vartifact'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        videoUnitId: input.unit.id,
        videoReferenceId: input.reference.referenceId,
        artifactType: 'visual_plan',
        status: 'candidate',
        versionNo,
        isCurrent: false,
        sourceVersionRefs: input.sourceVersionRefs,
        providerSummary: {
          provider: 'mock-local-render',
          model: 'mock-visual-plan-v1',
          isMockOutput: true,
          safeSummary: '本地 mock 视觉方案，仅保存循环背景和字幕安全区参数。'
        },
        providerRouteId: 'video_visual_plan_provider.mock.v1',
        strategyVersion: 'video_visual_plan_strategy.v1',
        qualityMode: input.request.qualityMode ?? 'standard',
        contentText: `视觉方案：${input.request.backgroundName ?? resolveMockBackgroundName(input.request.backgroundAssetId)}，${input.request.aspectRatio}，${input.request.resolution}。`,
        hook: input.subtitle.firstScreenSubtitle,
        firstScreenSubtitle: input.subtitle.firstScreenSubtitle,
        endingHook: '',
        estimatedDurationSeconds: input.subtitle.estimatedDurationSeconds,
        durationSeconds: input.subtitle.estimatedDurationSeconds,
        wordCount: 0,
        riskTags: ['mock 循环背景', input.request.safeAreaPreset === 'douyin_safe' ? '抖音安全区' : '安全区待复核'],
        recommendationReason: '视觉方案已绑定当前字幕版本，确认后可生成 mock/local 渲染预览。',
        score: input.request.fontSize > 64 ? 76 : 88,
        qualitySummary: '循环背景、字幕位置和安全区参数完整；未接真实素材库或外部渲染。',
        rejectedReason: null,
        confirmedBy: null,
        confirmedAt: null,
        createdBy: input.context.userId,
        createdAt: input.now,
        updatedAt: input.now,
        metadata: {
          isMockOutput: true,
          backgroundAssetId: input.request.backgroundAssetId,
          backgroundName: input.request.backgroundName ?? resolveMockBackgroundName(input.request.backgroundAssetId),
          backgroundType: 'loop_background',
          aspectRatio: input.request.aspectRatio,
          resolution: input.request.resolution,
          subtitlePosition: input.request.subtitlePosition,
          fontSize: input.request.fontSize,
          textColor: input.request.textColor,
          strokeColor: input.request.strokeColor,
          shadowEnabled: input.request.shadowEnabled,
          safeAreaPreset: input.request.safeAreaPreset,
          subtitleArtifactId: input.subtitle.id
        }
      };
      artifacts.unshift(artifact);
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        action: 'save_video_visual_plan',
        objectType: 'video_artifact',
        objectId: artifact.id,
        reason: '保存视觉方案候选',
        createdBy: input.context.userId,
        now: input.now,
        metadata: { requestHash: input.requestHash, sourceVersionRefs: input.sourceVersionRefs, safeSummary: '未调用真实渲染或素材 provider。' }
      }));
      receipts.unshift(createArtifactReceipt({
        id: nextId('vreceipt'),
        input,
        actionType: 'save_video_visual_plan',
        resultObjectId: artifact.id
      }));
      return {
        artifact: toVisualPlanArtifactDTO(artifact),
        visualPlans: toVisualPlanListDTO(artifacts.filter((item) => item.videoProjectId === input.project.id))
      };
    },

    async confirmVisualPlan(input) {
      for (const artifact of artifacts.filter((item) => item.videoProjectId === input.project.id && item.artifactType === 'visual_plan')) {
        if (artifact.isCurrent) {
          artifact.isCurrent = false;
          if (artifact.status === 'confirmed') artifact.status = 'archived';
          artifact.updatedAt = input.now;
        }
      }
      const artifact = artifacts.find((item) => item.id === input.artifact.id)!;
      artifact.status = 'confirmed';
      artifact.isCurrent = true;
      artifact.confirmedBy = input.context.userId;
      artifact.confirmedAt = input.now;
      artifact.updatedAt = input.now;
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        action: 'confirm_video_visual_plan',
        objectType: 'video_artifact',
        objectId: artifact.id,
        reason: '确认视觉方案',
        createdBy: input.context.userId,
        now: input.now,
        metadata: { requestHash: input.requestHash, sourceVersionRefs: artifact.sourceVersionRefs, downstreamStale: ['render', 'export'] }
      }));
      receipts.unshift(createArtifactReceipt({
        id: nextId('vreceipt'),
        input,
        actionType: 'confirm_video_visual_plan',
        resultObjectId: artifact.id
      }));
      return {
        current: toVisualPlanArtifactDTO(artifact),
        visualPlans: toVisualPlanListDTO(artifacts.filter((item) => item.videoProjectId === input.project.id))
      };
    },

    async rejectVisualPlan(input) {
      const artifact = artifacts.find((item) => item.id === input.artifact.id)!;
      artifact.status = 'rejected';
      artifact.isCurrent = false;
      artifact.rejectedReason = input.request.reason;
      artifact.updatedAt = input.now;
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        action: 'reject_video_visual_plan',
        objectType: 'video_artifact',
        objectId: artifact.id,
        reason: input.request.reason,
        createdBy: input.context.userId,
        now: input.now,
        metadata: { requestHash: input.requestHash }
      }));
      receipts.unshift(createArtifactReceipt({
        id: nextId('vreceipt'),
        input,
        actionType: 'reject_video_visual_plan',
        resultObjectId: artifact.id
      }));
      return {
        artifact: toVisualPlanArtifactDTO(artifact),
        visualPlans: toVisualPlanListDTO(artifacts.filter((item) => item.videoProjectId === input.project.id))
      };
    },

    async createRender(input) {
      const mockOutcome = input.request.mockTaskOutcome ?? 'success';
      const task = createMockRenderTask({
        id: nextId('vrtask'),
        outcome: mockOutcome,
        retryOfTaskId: input.request.retryOfTaskId ?? null
      });

      if (mockOutcome !== 'success') {
        operationLogs.unshift(createOperationLog({
          id: nextId('voplog'),
          tenantId: input.context.tenantId,
          videoProjectId: input.project.id,
          action: 'generate_video_render',
          objectType: 'video_render_task',
          objectId: task.id,
          reason: task.statusNote,
          createdBy: input.context.userId,
          now: input.now,
          metadata: { requestHash: input.requestHash, task, safeSummary: '渲染未写入候选，导出仍保持锁定。' }
        }));
        receipts.unshift(createRenderTaskReceipt({ id: nextId('vreceipt'), input, task, renderIds: [] }));
        return {
          task,
          renders: [],
          current: toRenderListDTO(renders.filter((render) => render.videoProjectId === input.project.id)).current
        };
      }

      const render = createMockRenderRecord({
        id: nextId('vrender'),
        existing: renders.filter((item) => item.videoProjectId === input.project.id),
        input
      });
      renders.unshift(render);
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        action: 'generate_video_render',
        objectType: 'video_render',
        objectId: render.id,
        reason: '生成 mock/local 渲染预览候选',
        createdBy: input.context.userId,
        now: input.now,
        metadata: { requestHash: input.requestHash, taskId: task.id, providerSummary: render.providerSummary, safeSummary: render.safeSummary }
      }));
      receipts.unshift(createRenderTaskReceipt({ id: nextId('vreceipt'), input, task, renderIds: [render.id] }));
      return {
        task,
        renders: [toRenderDTO(render)],
        current: toRenderListDTO(renders.filter((item) => item.videoProjectId === input.project.id)).current
      };
    },

    async confirmRender(input) {
      for (const render of renders.filter((item) => item.videoProjectId === input.project.id)) {
        if (render.isCurrent) {
          render.isCurrent = false;
          if (render.status === 'confirmed') render.status = 'archived';
          render.updatedAt = input.now;
        }
      }
      const render = renders.find((item) => item.id === input.render.id)!;
      render.status = 'confirmed';
      render.isCurrent = true;
      render.previewStatus = 'confirmed_exportable';
      render.confirmedBy = input.context.userId;
      render.confirmedAt = input.now;
      render.updatedAt = input.now;
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        action: 'confirm_video_render',
        objectType: 'video_render',
        objectId: render.id,
        reason: '预览确认当前视频',
        createdBy: input.context.userId,
        now: input.now,
        metadata: { requestHash: input.requestHash, sourceVersionRefs: render.sourceVersionRefs, downstreamStale: ['export'] }
      }));
      receipts.unshift(createRenderReceipt({ id: nextId('vreceipt'), input, actionType: 'confirm_video_render', resultObjectId: render.id }));
      return { current: toRenderDTO(render), renders: toRenderListDTO(renders.filter((item) => item.videoProjectId === input.project.id)) };
    },

    async rejectRender(input) {
      const render = renders.find((item) => item.id === input.render.id)!;
      render.status = 'rejected';
      render.isCurrent = false;
      render.previewStatus = 'rejected_pending_revision';
      render.rejectedReason = input.request.reason;
      render.updatedAt = input.now;
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        action: 'reject_video_render',
        objectType: 'video_render',
        objectId: render.id,
        reason: input.request.reason,
        createdBy: input.context.userId,
        now: input.now,
        metadata: { requestHash: input.requestHash }
      }));
      receipts.unshift(createRenderReceipt({ id: nextId('vreceipt'), input, actionType: 'reject_video_render', resultObjectId: render.id }));
      return { render: toRenderDTO(render), renders: toRenderListDTO(renders.filter((item) => item.videoProjectId === input.project.id)) };
    },

    async createExport(input) {
      const exportRecord: VideoExportRecord = {
        id: nextId('vexport'),
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
      exports.unshift(exportRecord);
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        action: 'create_video_export',
        objectType: 'video_export',
        objectId: exportRecord.id,
        reason: '创建导出记录，占位文件不等于发布',
        createdBy: input.context.userId,
        now: input.now,
        metadata: { requestHash: input.requestHash, renderVersionId: input.render.id, safeSummary: exportRecord.safeSummary }
      }));
      receipts.unshift({
        id: nextId('vreceipt'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'create_video_export',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_export',
        resultObjectId: exportRecord.id,
        createdBy: input.context.userId,
        createdAt: input.now,
        metadata: { renderVersionId: input.render.id }
      });
      return {
        exportRecord: toExportDTO(exportRecord),
        exports: toExportListDTO(exports.filter((item) => item.videoProjectId === input.project.id))
      };
    },

    async recheckReference(input) {
      const reference = references.find((item) => item.id === input.project.currentVideoReferenceId && item.tenantId === input.context.tenantId);
      if (!reference) throw new Error('reference missing');
      const snapshots = chapterSnapshots.filter((snapshot) => snapshot.videoReferenceId === reference.id);
      const source = sources.find((item) => item.tenantId === input.context.tenantId && item.novelId === input.project.novelId);
      const openIssues: VideoReferenceIssueRecord[] = [];
      for (const snapshot of snapshots) {
        const current = source?.currentChapterVersions.find((chapter) => chapter.chapterId === snapshot.chapterId);
        if (!current || current.contentVersionId !== snapshot.contentVersionId) {
          const existing = issues.find((issue) => issue.videoProjectId === input.project.id && issue.status === 'open' && issue.affectedChapterIds.includes(snapshot.chapterId));
          if (existing) {
            openIssues.push(existing);
            continue;
          }
          const issue: VideoReferenceIssueRecord = {
            id: nextId('vissue'),
            tenantId: input.context.tenantId,
            videoProjectId: input.project.id,
            videoReferenceId: reference.id,
            issueLevel: 'blocking',
            issueType: current ? 'chapter_version_changed' : 'chapter_removed',
            issueReason: current ? `${snapshot.chapterTitle} 当前正文版本已变化。` : `${snapshot.chapterTitle} 当前不可引用。`,
            status: 'open',
            affectedChapterIds: [snapshot.chapterId],
            resolutionAction: null,
            resolutionReason: null,
            createdAt: input.now,
            updatedAt: input.now
          };
          issues.unshift(issue);
          openIssues.push(issue);
        }
      }
      const project = projects.find((item) => item.id === input.project.id);
      if (project) {
        project.referenceStatus = openIssues.length > 0 ? 'blocking' : 'normal';
        project.productionStatus = openIssues.length > 0 ? 'generation_locked' : 'not_started';
        project.updatedAt = input.now;
      }
      reference.status = openIssues.length > 0 ? 'blocking' : 'normal';
      reference.updatedAt = input.now;
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        action: 'recheck_video_reference',
        objectType: 'video_reference',
        objectId: reference.id,
        reason: openIssues.length > 0 ? '引用重检发现章节版本变化' : '引用重检未发现异常',
        createdBy: input.context.userId,
        now: input.now,
        metadata: { requestHash: input.requestHash }
      }));
      receipts.unshift({
        id: nextId('vreceipt'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'recheck_video_reference',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_reference',
        resultObjectId: reference.id,
        createdBy: input.context.userId,
        createdAt: input.now,
        metadata: { issueCount: openIssues.length }
      });
      return buildReferenceDetail(project ?? input.project) as VideoReferenceDetailDTO;
    },

    async resolveIssue(input) {
      const issue = issues.find((item) => item.tenantId === input.context.tenantId && item.videoProjectId === input.project.id && item.id === input.issueId);
      if (!issue) throw new Error('issue missing');
      issue.status = input.request.action === 'ignore' ? 'ignored' : 'resolved';
      issue.resolutionAction = input.request.action;
      issue.resolutionReason = input.request.reason;
      issue.updatedAt = input.now;
      const openIssues = issues.filter((item) => item.videoProjectId === input.project.id && item.status === 'open');
      const project = projects.find((item) => item.id === input.project.id);
      if (project && openIssues.length === 0) {
        project.referenceStatus = 'resolved';
        project.productionStatus = 'not_started';
        project.updatedAt = input.now;
      }
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        action: 'resolve_video_reference_issue',
        objectType: 'video_reference_issue',
        objectId: issue.id,
        reason: input.request.reason,
        createdBy: input.context.userId,
        now: input.now,
        metadata: { action: input.request.action, requestHash: input.requestHash }
      }));
      receipts.unshift({
        id: nextId('vreceipt'),
        tenantId: input.context.tenantId,
        videoProjectId: input.project.id,
        actionType: 'resolve_video_reference_issue',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_reference_issue',
        resultObjectId: issue.id,
        createdBy: input.context.userId,
        createdAt: input.now,
        metadata: { action: input.request.action }
      });
      return buildReferenceDetail(project ?? input.project) as VideoReferenceDetailDTO;
    },

    async stopProject(input) {
      const project = projects.find((item) => item.id === input.project.id);
      if (!project) throw new Error('project missing');
      project.lifecycleStatus = 'stopped';
      project.referenceStatus = 'resolved';
      project.productionStatus = 'generation_locked';
      project.updatedAt = input.now;
      operationLogs.unshift(createOperationLog({
        id: nextId('voplog'),
        tenantId: input.context.tenantId,
        videoProjectId: project.id,
        action: 'stop_video_project',
        objectType: 'video_project',
        objectId: project.id,
        reason: input.request.reason,
        createdBy: input.context.userId,
        now: input.now,
        metadata: { requestHash: input.requestHash }
      }));
      receipts.unshift({
        id: nextId('vreceipt'),
        tenantId: input.context.tenantId,
        videoProjectId: project.id,
        actionType: 'stop_video_project',
        idempotencyToken: input.request.idempotencyToken,
        requestHash: input.requestHash,
        resultObjectType: 'video_project',
        resultObjectId: project.id,
        createdBy: input.context.userId,
        createdAt: input.now,
        metadata: {}
      });
      const detail = buildReferenceDetail(project) as VideoReferenceDetailDTO;
      return { project: toProjectDTO(project), reference: detail, reusedExisting: false };
    },

    getProjects() {
      return projects.map((project) => ({ ...project }));
    },

    getActionReceipts() {
      return receipts.map((receipt) => ({ ...receipt }));
    },

    getOperationLogs() {
      return operationLogs.map((log) => ({ ...log }));
    },

    getNarrationArtifacts() {
      return artifacts.map((artifact) => cloneArtifact(artifact)!);
    },

    getRenders() {
      return renders.map((render) => cloneRender(render)!);
    },

    getExports() {
      return exports.map((exportRecord) => cloneExport(exportRecord)!);
    },

    mutateCurrentChapterVersion(novelId, chapterId, contentVersionId) {
      const source = sources.find((item) => item.novelId === novelId);
      const chapter = source?.currentChapterVersions.find((item) => item.chapterId === chapterId);
      if (chapter) {
        chapter.contentVersionId = contentVersionId;
        chapter.updatedAt = new Date('2026-06-23T10:05:00.000Z');
      }
    }
  };

  function buildReferenceDetail(project: VideoProjectRecord): VideoReferenceDetailDTO | null {
    const reference = references.find((item) => item.id === project.currentVideoReferenceId);
    if (!reference) return null;
    const snapshots = chapterSnapshots.filter((snapshot) => snapshot.videoReferenceId === reference.id);
    const projectIssues = issues.filter((issue) => issue.videoProjectId === project.id);
    return toReferenceDetail(project, reference, snapshots, projectIssues);
  }

  return repository;
}

function toReferenceDetail(
  project: VideoProjectRecord,
  reference: VideoReferenceRecord,
  snapshots: VideoReferenceChapterSnapshotRecord[],
  projectIssues: VideoReferenceIssueRecord[]
): VideoReferenceDetailDTO {
  return {
    project: toProjectDTO(project),
    referenceId: reference.id,
    versionNo: reference.versionNo,
    status: reference.status,
    chapterRangeText: reference.chapterRangeText,
    chapterCount: reference.chapterCount,
    referenceSummary: reference.referenceSummary,
    chapters: snapshots.sort((left, right) => left.chapterNo - right.chapterNo).map(toChapterSnapshotDTO),
    issues: projectIssues.map(toIssueDTO),
    nextAction: createVideoReferenceNextAction(project.referenceStatus)
  };
}

function createSeedSources(): VideoSourceRecord[] {
  const updatedAt = '2026-06-22T09:30:00.000Z';
  const sources: VideoSourceRecord[] = [
    {
      tenantId: 'tenant_default',
      novelId: 'novel_video_ready',
      title: '化学大秦',
      creationStage: 'video_ready',
      videoReadinessSnapshotId: 'vrs_ready_001',
      snapshotStatus: 'ready',
      chapterCount: 3,
      totalWordCount: 7200,
      firstVideoSuggestion: {
        chapterRangeText: '第 1-3 章',
        chapterIds: ['chapter_ready_001', 'chapter_ready_002', 'chapter_ready_003'],
        title: '盐场醒来后三章强钩子'
      },
      updatedAt,
      currentChapterVersions: [
        createCurrentChapter('chapter_ready_001', 1, '盐场醒来', 'ccv_ready_001'),
        createCurrentChapter('chapter_ready_002', 2, '炼盐反转', 'ccv_ready_002'),
        createCurrentChapter('chapter_ready_003', 3, '黑火药惊世', 'ccv_ready_003')
      ]
    },
    {
      tenantId: 'tenant_default',
      novelId: 'novel_draft',
      title: '草稿小说',
      creationStage: 'video_ready',
      videoReadinessSnapshotId: '',
      snapshotStatus: 'missing',
      chapterCount: 0,
      totalWordCount: 0,
      firstVideoSuggestion: {
        chapterRangeText: '',
        chapterIds: [],
        title: ''
      },
      updatedAt,
      currentChapterVersions: []
    }
  ];
  return sources.filter((source) => source.videoReadinessSnapshotId);
}

function createCurrentChapter(chapterId: string, chapterNo: number, chapterTitle: string, contentVersionId: string): VideoChapterCurrentVersionRecord {
  return {
    chapterId,
    chapterNo,
    chapterTitle,
    contentVersionId,
    wordCount: 2400,
    summary: `${chapterTitle}摘要，保留视频引用所需的最小信息。`,
    riskLevel: 'low',
    updatedAt: new Date('2026-06-22T09:30:00.000Z')
  };
}

function createChapterSnapshot(input: {
  id: string;
  tenantId: string;
  referenceId: string;
  novelId: string;
  chapter: VideoChapterCurrentVersionRecord;
  now: Date;
}): VideoReferenceChapterSnapshotRecord {
  return {
    id: input.id,
    tenantId: input.tenantId,
    videoReferenceId: input.referenceId,
    novelId: input.novelId,
    chapterId: input.chapter.chapterId,
    chapterNo: input.chapter.chapterNo,
    chapterTitle: input.chapter.chapterTitle,
    contentVersionId: input.chapter.contentVersionId,
    wordCount: input.chapter.wordCount,
    summary: input.chapter.summary,
    riskLevel: input.chapter.riskLevel,
    createdAt: input.now
  };
}

function toSourceDTO(source: VideoSourceRecord): VideoReadySourceDTO {
  return {
    novelId: source.novelId,
    title: source.title,
    creationStage: source.creationStage,
    videoReadinessSnapshotId: source.videoReadinessSnapshotId,
    snapshotStatus: source.snapshotStatus,
    chapterCount: source.chapterCount,
    totalWordCount: source.totalWordCount,
    firstVideoSuggestion: source.firstVideoSuggestion,
    updatedAt: source.updatedAt
  };
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
    status: issue.status,
    affectedChapterIds: issue.affectedChapterIds,
    resolutionAction: issue.resolutionAction,
    resolutionReason: issue.resolutionReason
  };
}

function createChapterRangeText(chapters: VideoChapterCurrentVersionRecord[]) {
  if (chapters.length === 0) return '未选择章节';
  const sorted = [...chapters].sort((left, right) => left.chapterNo - right.chapterNo);
  return `第 ${sorted[0].chapterNo}-${sorted[sorted.length - 1].chapterNo} 章`;
}

function createOperationLog(input: {
  id: string;
  tenantId: string;
  videoProjectId: string | null;
  action: VideoOperationLogRecord['action'];
  objectType: string;
  objectId: string;
  reason: string | null;
  createdBy: string | null;
  now: Date;
  metadata: unknown;
}): VideoOperationLogRecord {
  return {
    id: input.id,
    tenantId: input.tenantId,
    videoProjectId: input.videoProjectId,
    action: input.action,
    objectType: input.objectType,
    objectId: input.objectId,
    reason: input.reason,
    createdBy: input.createdBy,
    createdAt: input.now,
    metadata: input.metadata
  };
}

function createMockNarrationCandidates(input: {
  nextId: (prefix: string) => string;
  existing: VideoArtifactRecord[];
  input: {
    context: { tenantId: string; userId: string | null };
    project: VideoProjectRecord;
    unit: VideoUnitRecord;
    reference: VideoReferenceDetailDTO;
    request: { candidateCount?: number; qualityMode?: 'fast' | 'standard' | 'high_quality' };
    sourceVersionRefs: VideoArtifactRecord['sourceVersionRefs'];
    now: Date;
  };
}): VideoArtifactRecord[] {
  const candidateCount = Math.min(Math.max(input.input.request.candidateCount ?? 3, 1), 3);
  const baseVersion = getNextArtifactVersion(input.existing, input.input.project.id);
  return Array.from({ length: candidateCount }, (_, index) => {
    const rank = index + 1;
    const isRisky = rank === 3;
    const contentText = [
      `前三秒钩子：${input.input.project.novelTitle}的主角刚醒来，就发现秦朝盐场快要崩盘。`,
      `他没有金手指面板，只靠一套现代化学知识，把粗盐、火药和人心一步步变成翻盘筹码。`,
      `第 ${rank} 版旁白强调${rank === 1 ? '爽点直给和节奏推进' : rank === 2 ? '人物反差和短视频悬念' : '更强冲突但平台风险更高'}。`,
      '结尾留下官府新命令的悬念，引导用户继续看下一条。'
    ].join('');
    return {
      id: input.nextId('vartifact'),
      tenantId: input.input.context.tenantId,
      videoProjectId: input.input.project.id,
      videoUnitId: input.input.unit.id,
      videoReferenceId: input.input.reference.referenceId,
      artifactType: 'narration_script',
      status: 'candidate',
      versionNo: baseVersion + index,
      isCurrent: false,
      sourceVersionRefs: input.input.sourceVersionRefs,
      providerSummary: {
        provider: 'mock',
        model: 'mock-video-narration',
        isMockOutput: true,
        safeSummary: '受控 mock 旁白 provider，未调用真实模型。'
      },
      providerRouteId: 'video_narration_agent.mock.v1',
      strategyVersion: 'video_narration_strategy.v1',
      qualityMode: input.input.request.qualityMode ?? 'standard',
      contentText,
      hook: rank === 1 ? '秦朝盐场快塌了，他却拿出现代化学办法。' : rank === 2 ? '别人穿越靠系统，他靠一袋粗盐翻盘。' : '一个错误配方，可能让全城陪葬。',
      firstScreenSubtitle: rank === 1 ? '化学老师穿秦朝，开局救盐场' : rank === 2 ? '没有系统，他用化学硬改命' : '火药配方失控，秦朝盐场要炸了？',
      endingHook: '真正的危机，来自官府的下一道命令。',
      estimatedDurationSeconds: estimateDurationSeconds(contentText),
      wordCount: countWords(contentText),
      riskTags: isRisky ? ['火药表达需弱化', '平台风险偏高'] : ['低风险', '节奏稳定'],
      recommendationReason: rank === 1 ? '开头直接、风险可控，适合作为首条测试。' : rank === 2 ? '人物反差更强，可作为备选。' : '冲突更强但风险偏高，确认前需说明原因。',
      score: isRisky ? 58 : rank === 1 ? 88 : 82,
      qualitySummary: isRisky ? '冲突强但风险较高，不建议默认确认。' : '钩子清晰，时长适合首条测试。',
      rejectedReason: null,
      confirmedBy: null,
      confirmedAt: null,
      createdBy: input.input.context.userId,
      createdAt: input.input.now,
      updatedAt: input.input.now,
      metadata: { isMockOutput: true, candidateRank: rank }
    };
  });
}

function getNextArtifactVersion(artifacts: VideoArtifactRecord[], videoProjectId: string, artifactType: VideoArtifactRecord['artifactType'] = 'narration_script') {
  const maxVersion = artifacts
    .filter((artifact) => artifact.videoProjectId === videoProjectId && artifact.artifactType === artifactType)
    .reduce((max, artifact) => Math.max(max, artifact.versionNo), 0);
  return maxVersion + 1;
}

function estimateDurationSeconds(text: string) {
  return Math.max(10, Math.ceil(countWords(text) / 3.2));
}

function countWords(text: string) {
  return Array.from(text.trim()).filter((char) => !/\s/.test(char)).length;
}

function estimateSubtitleDuration(text: string) {
  const lineCount = text.split('\n').filter((line) => line.trim()).length;
  return Math.max(8, lineCount * 4);
}

function createTimelineSummary(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function clampSubtitleLineLength(value: number | undefined) {
  return Math.min(Math.max(value ?? 18, 10), 28);
}

function createArtifactReceipt(input: {
  id: string;
  input: {
    context: { tenantId: string; userId: string | null };
    project: VideoProjectRecord;
    request: { idempotencyToken: string };
    requestHash: string;
    now: Date;
  };
  actionType: VideoActionReceiptRecord['actionType'];
  resultObjectId: string;
}): VideoActionReceiptRecord {
  return {
    id: input.id,
    tenantId: input.input.context.tenantId,
    videoProjectId: input.input.project.id,
    actionType: input.actionType,
    idempotencyToken: input.input.request.idempotencyToken,
    requestHash: input.input.requestHash,
    resultObjectType: 'video_artifact',
    resultObjectId: input.resultObjectId,
    createdBy: input.input.context.userId,
    createdAt: input.input.now,
    metadata: {}
  };
}

function createNarrationTaskReceipt(input: {
  id: string;
  input: {
    context: { tenantId: string; userId: string | null };
    project: VideoProjectRecord;
    request: { idempotencyToken: string };
    requestHash: string;
    now: Date;
  };
  task: VideoNarrationTaskDTO;
  artifactIds: string[];
}): VideoActionReceiptRecord {
  return {
    id: input.id,
    tenantId: input.input.context.tenantId,
    videoProjectId: input.input.project.id,
    actionType: 'generate_video_narration',
    idempotencyToken: input.input.request.idempotencyToken,
    requestHash: input.input.requestHash,
    resultObjectType: 'video_narration_task',
    resultObjectId: input.task.id,
    createdBy: input.input.context.userId,
    createdAt: input.input.now,
    metadata: {
      artifactIds: input.artifactIds,
      task: input.task
    }
  };
}

function createTtsTaskReceipt(input: {
  id: string;
  input: {
    context: { tenantId: string; userId: string | null };
    project: VideoProjectRecord;
    request: { idempotencyToken: string };
    requestHash: string;
    now: Date;
  };
  task: GenerateVideoTtsResultDTO['task'];
  artifactIds: string[];
}): VideoActionReceiptRecord {
  return {
    id: input.id,
    tenantId: input.input.context.tenantId,
    videoProjectId: input.input.project.id,
    actionType: 'generate_video_tts',
    idempotencyToken: input.input.request.idempotencyToken,
    requestHash: input.input.requestHash,
    resultObjectType: 'video_tts_task',
    resultObjectId: input.task.id,
    createdBy: input.input.context.userId,
    createdAt: input.input.now,
    metadata: {
      artifactIds: input.artifactIds,
      task: input.task
    }
  };
}

function createSubtitleTaskReceipt(input: {
  id: string;
  input: {
    context: { tenantId: string; userId: string | null };
    project: VideoProjectRecord;
    request: { idempotencyToken: string };
    requestHash: string;
    now: Date;
  };
  task: GenerateVideoSubtitleResultDTO['task'];
  artifactIds: string[];
}): VideoActionReceiptRecord {
  return {
    id: input.id,
    tenantId: input.input.context.tenantId,
    videoProjectId: input.input.project.id,
    actionType: 'generate_video_subtitle',
    idempotencyToken: input.input.request.idempotencyToken,
    requestHash: input.input.requestHash,
    resultObjectType: 'video_subtitle_task',
    resultObjectId: input.task.id,
    createdBy: input.input.context.userId,
    createdAt: input.input.now,
    metadata: {
      artifactIds: input.artifactIds,
      task: input.task
    }
  };
}

function createRenderTaskReceipt(input: {
  id: string;
  input: {
    context: { tenantId: string; userId: string | null };
    project: VideoProjectRecord;
    request: { idempotencyToken: string };
    requestHash: string;
    now: Date;
  };
  task: GenerateVideoRenderResultDTO['task'];
  renderIds: string[];
}): VideoActionReceiptRecord {
  return {
    id: input.id,
    tenantId: input.input.context.tenantId,
    videoProjectId: input.input.project.id,
    actionType: 'generate_video_render',
    idempotencyToken: input.input.request.idempotencyToken,
    requestHash: input.input.requestHash,
    resultObjectType: 'video_render_task',
    resultObjectId: input.task.id,
    createdBy: input.input.context.userId,
    createdAt: input.input.now,
    metadata: {
      renderIds: input.renderIds,
      task: input.task
    }
  };
}

function createRenderReceipt(input: {
  id: string;
  input: {
    context: { tenantId: string; userId: string | null };
    project: VideoProjectRecord;
    request: { idempotencyToken: string };
    requestHash: string;
    now: Date;
  };
  actionType: VideoActionReceiptRecord['actionType'];
  resultObjectId: string;
}): VideoActionReceiptRecord {
  return {
    id: input.id,
    tenantId: input.input.context.tenantId,
    videoProjectId: input.input.project.id,
    actionType: input.actionType,
    idempotencyToken: input.input.request.idempotencyToken,
    requestHash: input.input.requestHash,
    resultObjectType: 'video_render',
    resultObjectId: input.resultObjectId,
    createdBy: input.input.context.userId,
    createdAt: input.input.now,
    metadata: {}
  };
}

function createMockTtsArtifact(input: {
  id: string;
  existing: VideoArtifactRecord[];
  input: {
    context: { tenantId: string; userId: string | null };
    project: VideoProjectRecord;
    unit: VideoUnitRecord;
    reference: VideoReferenceDetailDTO;
    narration: VideoArtifactRecord;
    request: {
      voiceId: string;
      voiceName?: string;
      speed: number;
      emotion: string;
      volume: number;
      qualityMode?: 'fast' | 'standard' | 'high_quality';
    };
    sourceVersionRefs: VideoArtifactRecord['sourceVersionRefs'];
    now: Date;
  };
}): VideoArtifactRecord {
  const versionNo = getNextArtifactVersion(input.existing, input.input.project.id, 'tts_audio');
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
    versionNo,
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
    metadata: {
      isMockOutput: true,
      narrationArtifactId: input.input.narration.id,
      previewKind: 'mock-local-audio-placeholder'
    }
  };
}

function createMockSubtitleArtifact(input: {
  id: string;
  existing: VideoArtifactRecord[];
  input: {
    context: { tenantId: string; userId: string | null };
    project: VideoProjectRecord;
    unit: VideoUnitRecord;
    reference: VideoReferenceDetailDTO;
    narration: VideoArtifactRecord;
    tts: VideoArtifactRecord;
    request: {
      subtitleStyle?: 'compact' | 'balanced' | 'dramatic';
      lineLength?: number;
      qualityMode?: 'fast' | 'standard' | 'high_quality';
    };
    sourceVersionRefs: VideoArtifactRecord['sourceVersionRefs'];
    now: Date;
  };
}): VideoArtifactRecord {
  const versionNo = getNextArtifactVersion(input.existing, input.input.project.id, 'subtitle');
  const lineLength = clampSubtitleLineLength(input.input.request.lineLength);
  const subtitleStyle = input.input.request.subtitleStyle ?? 'balanced';
  const contentText = createMockSubtitleText(input.input.narration, lineLength, subtitleStyle);
  return {
    id: input.id,
    tenantId: input.input.context.tenantId,
    videoProjectId: input.input.project.id,
    videoUnitId: input.input.unit.id,
    videoReferenceId: input.input.reference.referenceId,
    artifactType: 'subtitle',
    status: 'candidate',
    versionNo,
    isCurrent: false,
    sourceVersionRefs: input.input.sourceVersionRefs,
    providerSummary: {
      provider: 'mock-local-subtitle',
      model: 'mock-subtitle-v1',
      isMockOutput: true,
      safeSummary: '本地 mock 字幕 provider，仅生成字幕行和时间轴摘要。'
    },
    providerRouteId: 'video_subtitle_provider.mock.v1',
    strategyVersion: 'video_subtitle_strategy.v1',
    qualityMode: input.input.request.qualityMode ?? 'standard',
    contentText,
    hook: input.input.narration.hook,
    firstScreenSubtitle: input.input.narration.firstScreenSubtitle,
    endingHook: input.input.narration.endingHook,
    estimatedDurationSeconds: input.input.tts.durationSeconds ?? input.input.tts.estimatedDurationSeconds,
    wordCount: countWords(contentText),
    riskTags: subtitleStyle === 'dramatic' ? ['首屏强刺激需复核', '节奏偏快'] : ['低风险', '行长可控'],
    recommendationReason: `按 ${subtitleStyle} 风格和每行约 ${lineLength} 字生成字幕候选。`,
    score: subtitleStyle === 'dramatic' ? 78 : 88,
    qualitySummary: '字幕候选已绑定当前配音版本；确认前可编辑首屏字幕和字幕正文。',
    rejectedReason: null,
    confirmedBy: null,
    confirmedAt: null,
    createdBy: input.input.context.userId,
    createdAt: input.input.now,
    updatedAt: input.input.now,
    metadata: {
      isMockOutput: true,
      ttsArtifactId: input.input.tts.id,
      timelineSummary: createTimelineSummary(contentText),
      subtitleStyle,
      lineLength
    }
  };
}

function createMockRenderRecord(input: {
  id: string;
  existing: VideoRenderRecord[];
  input: {
    context: { tenantId: string; userId: string | null };
    project: VideoProjectRecord;
    unit: VideoUnitRecord;
    reference: VideoReferenceDetailDTO;
    visualPlan: VideoArtifactRecord;
    request: { qualityMode?: 'fast' | 'standard' | 'high_quality' };
    sourceVersionRefs: VideoRenderRecord['sourceVersionRefs'];
    now: Date;
  };
}): VideoRenderRecord {
  const versionNo = getNextRenderVersion(input.existing, input.input.project.id);
  const visualMeta = input.input.visualPlan.metadata as { backgroundName?: string; aspectRatio?: string; resolution?: string } | null;
  return {
    id: input.id,
    tenantId: input.input.context.tenantId,
    videoProjectId: input.input.project.id,
    videoUnitId: input.input.unit.id,
    videoReferenceId: input.input.reference.referenceId,
    versionNo,
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

function getNextRenderVersion(renders: VideoRenderRecord[], videoProjectId: string) {
  return renders
    .filter((render) => render.videoProjectId === videoProjectId)
    .reduce((max, render) => Math.max(max, render.versionNo), 0) + 1;
}

function createMockSubtitleText(narration: VideoArtifactRecord, lineLength: number, subtitleStyle: 'compact' | 'balanced' | 'dramatic') {
  const punctuation = subtitleStyle === 'dramatic' ? '！' : '。';
  const parts = [
    narration.firstScreenSubtitle,
    narration.hook,
    '他把粗盐、火药和人心变成翻盘筹码',
    narration.endingHook || '真正的危机，还在后面'
  ];
  return parts
    .map((part, index) => {
      const start = index * 4;
      const end = start + 4;
      const clipped = Array.from(part.replace(/[。！？,.，]/g, '')).slice(0, lineLength).join('');
      return `${String(start).padStart(2, '0')}:00-${String(end).padStart(2, '0')}:00 ${clipped}${punctuation}`;
    })
    .join('\n');
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
      currentStep: 'aligning_timeline',
      statusNote: '字幕生成失败，当前字幕不受影响。可以重试或先编辑草稿。',
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
      statusNote: '字幕生成已取消，未写入候选字幕，视觉方案仍保持锁定。',
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

function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length
  };
}

function cloneSource(source: VideoSourceRecord | null): VideoSourceRecord | null {
  if (!source) return null;
  return {
    ...source,
    currentChapterVersions: source.currentChapterVersions.map((chapter) => ({ ...chapter }))
  };
}

function cloneProject(project: VideoProjectRecord | null): VideoProjectRecord | null {
  return project ? { ...project } : null;
}

function cloneArtifact(artifact: VideoArtifactRecord | null): VideoArtifactRecord | null {
  return artifact
    ? {
        ...artifact,
        riskTags: [...artifact.riskTags],
        sourceVersionRefs: {
          ...artifact.sourceVersionRefs,
          chapterContentVersionIds: [...artifact.sourceVersionRefs.chapterContentVersionIds]
        },
        providerSummary: { ...artifact.providerSummary },
        metadata: { ...artifact.metadata }
      }
    : null;
}

function cloneRender(render: VideoRenderRecord | null): VideoRenderRecord | null {
  return render
    ? {
        ...render,
        qualityIssues: [...render.qualityIssues],
        providerSummary: { ...render.providerSummary },
        sourceVersionRefs: {
          ...render.sourceVersionRefs,
          chapterContentVersionIds: [...render.sourceVersionRefs.chapterContentVersionIds]
        }
      }
    : null;
}

function cloneExport(exportRecord: VideoExportRecord | null): VideoExportRecord | null {
  return exportRecord ? { ...exportRecord, metadata: { ...(exportRecord.metadata as Record<string, unknown>) } } : null;
}

function clone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
