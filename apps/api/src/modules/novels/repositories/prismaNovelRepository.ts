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
  type StructureAssetContentDTO
} from '@ai-shortvideo/shared';
import { getPrismaClient } from '../../../infrastructure/database/prisma.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  DEFAULT_POLICY_PROFILE_VERSION_ID,
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
  type ListedNovelRecords,
  type ListNovelRecordsQuery,
  type LongTermMemoryRecord,
  type ImpactAssessmentInput,
  type ImpactCaseRecord,
  type ImpactCaseResolveInput,
  type ForcedFullReviewRecord,
  type FullReviewCreationInput,
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
  type ReviewReportRecord,
  type StructureAdoptionInput,
  type StructureCreationInput,
  type StructureGenerationTaskCreationInput,
  type TaskCancelInput,
  type TaskFailureInput,
  type TaskRetryInput,
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
  ImpactLevel as PrismaImpactLevel,
  NovelCreationStage as PrismaNovelCreationStage,
  NovelCreationSourceType as PrismaNovelCreationSourceType,
  NovelLifecycleStatus as PrismaNovelLifecycleStatus,
  RiskLevel as PrismaRiskLevel,
  StageStatus as PrismaStageStatus,
  StaleLevel as PrismaStaleLevel,
  TaskStatus as PrismaTaskStatus,
  VersionStatus as PrismaVersionStatus
} from '../../../generated/prisma/enums.js';
import { BusinessError } from '../../../shared/errors.js';

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

  async findById(tenantId: string, novelId: string) {
    const novel = await this.prisma.novel.findFirst({
      where: {
        tenantId,
        id: novelId,
        deletedAt: null
      }
    });

    return novel ? mapNovel(novel) : null;
  }

  async findPreferencesByNovelId(tenantId: string, novelId: string) {
    const preferences = await this.prisma.createNovelPreferences.findFirst({
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
      'trial_followup_generate'
    ]);
    if (!supported.has(taskType)) {
      throw new BusinessError(ErrorCode.ConfigMissing, 'Prisma 小说后半写链尚未实现，provider 调用已在 task claim 前阻断。', {
        taskType,
        capability: 'prisma_novel_provider_finalize'
      });
    }
  }

  async claimGenerationTask(input: ClaimGenerationTaskInput): Promise<ClaimGenerationTaskResult> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
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
            where: { tenantId: input.tenantId, activeClaimKey: input.activeClaimKey }
          });
          if (activeTask) return { outcome: 'active_conflict', task: mapGenerationTask(activeTask) };

          const task = await tx.generationTask.create({
            data: {
              tenantId: input.tenantId,
              novelId: input.novelId,
              taskType: input.taskType,
              objectType: input.objectType,
              objectId: input.objectId,
              status: PrismaTaskStatus.PROCESSING,
              statusNote: '生成任务已创建，正在调用模型。',
              progress: 0,
              currentStep: '正在调用模型',
              triggerSource: 'manual',
              sourceVersionRefs: toJsonObject(input.sourceVersionRefs),
              conflictScope: input.conflictScope,
              conflictKey: input.conflictKey,
              idempotencyToken: input.idempotencyToken,
              requestHash: input.requestHash,
              activeClaimKey: input.activeClaimKey,
              inputSummary: input.inputSummary,
              startedAt: input.now,
              createdBy: input.context.userId,
              createdAt: input.now,
              updatedAt: input.now,
              metadata: { requestId: input.context.requestId }
            }
          });
          await createTaskEvent(tx, {
            task,
            eventType: 'task_claimed',
            message: '生成任务已创建，正在调用模型。',
            progress: 0,
            requestId: input.context.requestId,
            createdAt: input.now
          });
          return { outcome: 'created', task: mapGenerationTask(task) };
        });
      } catch (error) {
        if (!isPrismaUniqueConstraintError(error)) throw error;

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
          where: { tenantId: input.tenantId, activeClaimKey: input.activeClaimKey }
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

  async listDirectionVersions(tenantId: string, novelId: string) {
    const versions = await this.prisma.creativeVersion.findMany({
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

  async listStructureVersions(tenantId: string, novelId: string) {
    const versions = await this.prisma.creativeVersion.findMany({
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

  async listNovelChapters(tenantId: string, novelId: string) {
    const chapters = await this.prisma.novelChapter.findMany({
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
          creationStage: PrismaNovelCreationStage.DIRECTION,
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
        versions: versions.map(mapCreativeVersion)
      };
    });
  }

  async createDirectionRevision(input: DirectionRevisionInput): Promise<CreatedDirectionRevisionRecord> {
    return this.prisma.$transaction(async (tx) => {
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
          creationStage: PrismaNovelCreationStage.DIRECTION,
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
      const currentVersionIdBefore = input.novel.currentDirectionVersionId;
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
          impactSummary: '当前方向切换为正式方向，小说进入设定阶段；其他方向候选转为历史。',
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
          objectType: 'direction',
          id: { not: input.candidate.id },
          status: { in: [PrismaVersionStatus.CANDIDATE, PrismaVersionStatus.CURRENT] }
        },
        data: {
          status: PrismaVersionStatus.HISTORICAL
        }
      });

      const currentDirection = await tx.creativeVersion.update({
        where: { id: input.candidate.id },
        data: {
          status: PrismaVersionStatus.CURRENT,
          decisionRecordId: decisionRecord.id
        }
      });

      const novel = await tx.novel.update({
        where: { id: input.novel.id },
        data: {
          currentDirectionVersionId: input.candidate.id,
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
          objectType: 'direction',
          status: PrismaTaskStatus.WAITING_CONFIRMATION
        }
      });

      await tx.generationTask.updateMany({
        where: {
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          objectType: 'direction',
          status: PrismaTaskStatus.WAITING_CONFIRMATION
        },
        data: {
          status: PrismaTaskStatus.COMPLETED,
          statusNote: '用户已采用方向',
          currentStep: '方向已采用',
          userAcceptedResult: true,
          finishedAt: input.now,
          updatedAt: input.now
        }
      });

      for (const waitingTask of waitingTasks) {
        await createTaskEvent(tx, {
          task: { ...waitingTask, status: PrismaTaskStatus.COMPLETED },
          eventType: 'task_completed',
          message: '方向已采用，任务完成。',
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
            creationStage: input.novel.creationStage,
            stageStatus: input.novel.stageStatus
          },
          afterSnapshot: {
            currentDirectionVersionId: input.candidate.id,
            creationStage: NovelCreationStage.Setting,
            stageStatus: StageStatus.NotStarted
          },
          reason: input.reason,
          impactSummary: '当前方向切换为正式方向，小说进入设定阶段；其他方向候选转为历史。',
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
      message: '正在调用模型生成内容，可能需要 1-3 分钟，可以稍后回来查看。',
      progress: 0,
      requestId: input.context.requestId,
      createdAt: input.now
    });

    return mapGenerationTask(task);
  }

  async createStructureCandidate(input: StructureCreationInput): Promise<CreatedStructureAssetRecord> {
    return this.prisma.$transaction(async (tx) => {
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

  async findStructureVersionById(tenantId: string, novelId: string, objectType: string, versionId: string) {
    const version = await this.prisma.creativeVersion.findFirst({
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

      await tx.generationTask.updateMany({
        where: {
          tenantId: input.context.tenantId,
          novelId: input.novel.id,
          objectType: input.objectType,
          status: PrismaTaskStatus.WAITING_CONFIRMATION
        },
        data: {
          status: PrismaTaskStatus.COMPLETED,
          statusNote: '用户已采用结构资产',
          currentStep: getStructureAdoptStep(input.objectType),
          userAcceptedResult: true,
          finishedAt: input.now,
          updatedAt: input.now
        }
      });

      for (const waitingTask of waitingTasks) {
        await createTaskEvent(tx, {
          task: { ...waitingTask, status: PrismaTaskStatus.COMPLETED },
          eventType: 'task_completed',
          message: `${input.objectType} 已采用，任务完成。`,
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

  async findTrialRunById(tenantId: string, novelId: string, trialRunId: string) {
    const run = await this.prisma.trialRun.findFirst({
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

  async findChapterContentVersionById(tenantId: string, novelId: string, versionId: string) {
    const version = await this.prisma.chapterContentVersion.findFirst({
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

  async findFeatureCardById(tenantId: string, featureCardId: string) {
    const card = await this.prisma.chapterFeatureCard.findFirst({
      where: { tenantId, id: featureCardId }
    });

    return card ? mapChapterFeatureCard(card) : null;
  }

  async findReviewReportById(tenantId: string, reviewReportId: string) {
    const report = await this.prisma.reviewReport.findFirst({
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
          statusNote: '正在调用模型继续试写第2-3章并生成试写总评，可能需要 1-3 分钟，可以稍后回来查看。',
          progress: 18,
          sourceVersionRefs: toJsonObject(sourceVersionRefs),
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
        message: '正在调用模型继续试写第2-3章并生成试写总评，可能需要 1-3 分钟，可以稍后回来查看。',
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
      const selectedMetadata = { ...toRecord(input.selectedCandidate.metadata), trialStatus: 'selected_for_trial', isSelected: true, followupStatus: 'completed' };
      const selected = await tx.chapterContentVersion.update({
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
          sourceVersionRefs: toJsonObject(sourceVersionRefs),
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
                  status: PrismaVersionStatus.CURRENT,
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
            status: PrismaVersionStatus.CURRENT,
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

        await tx.novelChapter.update({
          where: { id: chapterDraft.chapter.id },
          data: {
            currentContentVersionId: contentVersion.id,
            currentFeatureCardVersionId: featureCard.id,
            currentReviewReportId: reviewReport.id,
            lastGenerationTaskId: task.id,
            wordCount: countWords(chapterDraft.content),
            mainStatus: chapterDraft.hardFailed ? 'blocked' : 'trial_written',
            statusNote: chapterDraft.hardFailed ? '试写硬门槛未通过，暂停继续生成。' : '试写正文已生成，等待总评确认。',
            updatedAt: input.now
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
      const isReturnUpstream = input.decision === 'return_upstream';
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
      const trialRun = await tx.trialRun.update({
        where: { id: input.trialRun.id },
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
      const novel = await tx.novel.update({
        where: { id: input.novel.id },
        data: {
          creationStage: isReturnUpstream ? PrismaNovelCreationStage.TRIAL : PrismaNovelCreationStage.BODY,
          stageStatus: isReturnUpstream ? PrismaStageStatus.BLOCKED : PrismaStageStatus.NOT_STARTED,
          updatedBy: input.context.userId,
          updatedAt: input.now
        }
      });
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
      this.prisma.chapterFeatureCard.findFirst({
        where: { tenantId, novelId, chapterId },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.reviewReport.findFirst({
        where: { tenantId, novelId, objectType: 'chapter', objectId: chapterId },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.generationTask.findFirst({
        where: { tenantId, novelId, objectType: 'trial_run' },
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

  async findLatestBodyBatch(_tenantId: string, _novelId: string): Promise<BodyBatchRecord | null> {
    return null;
  }

  async findBodyBatchByIdempotencyKey(_tenantId: string, _novelId: string, _idempotencyKey: string): Promise<BodyBatchRecord | null> {
    return null;
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

  async findLatestLongTermMemory(tenantId: string, novelId: string, chapterId?: string | null): Promise<LongTermMemoryRecord | null> {
    const memory = await this.prisma.longTermMemory.findFirst({
      where: {
        tenantId,
        novelId,
        ...(chapterId ? { chapterId } : {})
      },
      orderBy: { createdAt: 'desc' }
    });

    return memory ? mapLongTermMemory(memory) : null;
  }

  async findLatestFullReview(_tenantId: string, _novelId: string): Promise<{ reviewReport: ReviewReportRecord; gate: FullReviewGateRecord } | null> {
    return null;
  }

  async findFullReviewGateById(_tenantId: string, _novelId: string, _gateId: string): Promise<FullReviewGateRecord | null> {
    return null;
  }

  async findFullReviewByIdempotencyKey(
    _tenantId: string,
    _novelId: string,
    _idempotencyKey: string
  ): Promise<{ task: GenerationTaskRecord; reviewReport: ReviewReportRecord; gate: FullReviewGateRecord } | null> {
    return null;
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

  async createBodyBatchTask(_input: BodyBatchTaskCreationInput): Promise<CreatedBodyBatchTaskRecord> {
    throw new BusinessError(ErrorCode.ConfigMissing, 'Prisma 正文批量写路径尚未实现，不能创建正文批次预占任务；请使用 in-memory 验收路径或先补齐真实数据库写入。', {
      taskType: 'body_batch_generate',
      capability: 'prisma_body_batch_write'
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

  async generateBodyBatch(_input: BodyBatchGenerationInput): Promise<GeneratedBodyBatchRecord> {
    throw new Error('Package 6 Prisma write path is not implemented; use in-memory mock provider for current package verification.');
  }

  async rewriteChapter(_input: ChapterRewriteInput): Promise<RewrittenChapterRecord> {
    throw new Error('Package 6 Prisma rewrite path is not implemented; use in-memory mock provider for current package verification.');
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
  inputSummary: string | null;
  outputSummary: string | null;
  resultVersionId: string | null;
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
    inputSummary: task.inputSummary,
    outputSummary: task.outputSummary,
    resultVersionIds: task.resultVersionId ? [task.resultVersionId] : [],
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
    metadata: task.metadata
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
    statusNote: '正在调用模型生成内容，可能需要 1-3 分钟，可以稍后回来查看。',
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
    message: '正在调用模型生成内容，可能需要 1-3 分钟，可以稍后回来查看。',
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
