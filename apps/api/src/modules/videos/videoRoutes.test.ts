import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../app.js';
import { createInMemoryVideoRepository } from './repositories/inMemoryVideoRepository.js';
import type { VideoActionReceiptRecord, VideoArtifactRecord, VideoExportRecord, VideoRenderRecord } from './domain/videoDomain.js';

describe('video P8b routes', () => {
  it('creates a video project from a video_ready novel and stores a reference snapshot', async () => {
    const videoRepository = createInMemoryVideoRepository();
    const app = await buildApp({ logger: false, videoRepository, now: fixedNow });

    const sourcesResponse = await app.inject({ method: 'GET', url: '/videos/sources?page=1&pageSize=20' });
    assert.equal(sourcesResponse.statusCode, 200);
    const sources = sourcesResponse.json();
    assert.equal(sources.success, true);
    assert.equal(sources.data.total, 1);
    assert.equal(sources.data.items[0].creationStage, 'video_ready');
    assert.equal(sources.data.items[0].videoReadinessSnapshotId, 'vrs_ready_001');

    const createResponse = await app.inject({
      method: 'POST',
      url: '/videos',
      headers: { 'x-request-id': 'create-video-1' },
      payload: createVideoPayload({ idempotencyToken: 'create-video-token-1' })
    });

    assert.equal(createResponse.statusCode, 201);
    const created = createResponse.json();
    assert.equal(created.success, true);
    assert.equal(created.requestId, 'create-video-1');
    assert.equal(created.data.project.novelId, 'novel_video_ready');
    assert.equal(created.data.project.currentVideoReferenceId, created.data.reference.referenceId);
    assert.equal(created.data.project.productionStatus, 'not_started');
    assert.equal(created.data.reference.chapters.length, 3);
    assert.equal(created.data.reference.chapters[0].contentVersionId, 'ccv_ready_001');
    assert.equal(created.data.reusedExisting, false);
    assert.equal(videoRepository.getActionReceipts().length, 1);
    assert.equal(videoRepository.getOperationLogs()[0]?.action, 'create_video_project');

    await app.close();
  });

  it('reuses a video project for the same idempotency token and rejects a different request hash', async () => {
    const videoRepository = createInMemoryVideoRepository();
    const app = await buildApp({ logger: false, videoRepository, now: fixedNow });

    const firstResponse = await app.inject({
      method: 'POST',
      url: '/videos',
      payload: createVideoPayload({ idempotencyToken: 'idem-create-same' })
    });
    assert.equal(firstResponse.statusCode, 201);
    const first = firstResponse.json().data;

    const repeatedResponse = await app.inject({
      method: 'POST',
      url: '/videos',
      payload: createVideoPayload({ idempotencyToken: 'idem-create-same' })
    });
    assert.equal(repeatedResponse.statusCode, 200);
    const repeated = repeatedResponse.json().data;
    assert.equal(repeated.project.id, first.project.id);
    assert.equal(repeated.reusedExisting, true);
    assert.equal(videoRepository.getProjects().length, 1);

    const conflictResponse = await app.inject({
      method: 'POST',
      url: '/videos',
      payload: createVideoPayload({ idempotencyToken: 'idem-create-same', title: '不同标题' })
    });
    assert.equal(conflictResponse.statusCode, 409);
    assert.equal(conflictResponse.json().error.code, 'IDEMPOTENCY_CONFLICT');
    assert.equal(videoRepository.getProjects().length, 1);

    await app.close();
  });

  it('keeps create-video route schema aligned with shared project types', async () => {
    const app = await buildApp({ logger: false, videoRepository: createInMemoryVideoRepository(), now: fixedNow });

    for (const projectType of ['first_test', 'chapter_range', 'full_book_seed'] as const) {
      const response = await app.inject({
        method: 'POST',
        url: '/videos',
        payload: createVideoPayload({
          idempotencyToken: `create-project-type-${projectType}`,
          projectType
        })
      });

      assert.equal(response.statusCode, 201);
      assert.equal(response.json().data.project.projectType, projectType);
    }

    const standardResponse = await app.inject({
      method: 'POST',
      url: '/videos',
      payload: createVideoPayload({
        idempotencyToken: 'create-project-type-standard',
        projectType: 'standard'
      })
    });

    assert.equal(standardResponse.statusCode, 400);
    assert.equal(standardResponse.json().error.code, 'VALIDATION_ERROR');

    await app.close();
  });

  it('declares duplicatePolicy in create-video route schema and rejects unsupported values', async () => {
    const app = await buildApp({ logger: false, videoRepository: createInMemoryVideoRepository(), now: fixedNow });

    for (const duplicatePolicy of ['return_existing', 'create_distinct'] as const) {
      const response = await app.inject({
        method: 'POST',
        url: '/videos',
        payload: createVideoPayload({
          idempotencyToken: `create-duplicate-policy-${duplicatePolicy}`,
          duplicatePolicy
        })
      });

      assert.equal(response.statusCode, 201);
      assert.equal(response.json().data.project.novelId, 'novel_video_ready');
    }

    const invalidResponse = await app.inject({
      method: 'POST',
      url: '/videos',
      payload: createVideoPayload({
        idempotencyToken: 'create-duplicate-policy-invalid',
        duplicatePolicy: 'silently_overwrite'
      })
    });

    assert.equal(invalidResponse.statusCode, 400);
    assert.equal(invalidResponse.json().error.code, 'VALIDATION_ERROR');

    await app.close();
  });

  it('rejects lifecycle filters and issue actions that are outside the shared video contract', async () => {
    const videoRepository = createInMemoryVideoRepository();
    const app = await buildApp({ logger: false, videoRepository, now: fixedNow });

    const draftFilterResponse = await app.inject({ method: 'GET', url: '/videos?lifecycleStatus=draft' });
    assert.equal(draftFilterResponse.statusCode, 400);
    assert.equal(draftFilterResponse.json().error.code, 'VALIDATION_ERROR');

    const projectId = await createVideoProject(app, 'return-to-novel-project-token');
    videoRepository.mutateCurrentChapterVersion('novel_video_ready', 'chapter_ready_002', 'ccv_ready_002_rewrite');
    const rechecked = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/reference/recheck`,
      payload: { idempotencyToken: 'return-to-novel-recheck-token', expectedReferenceVersion: 1 }
    });
    const issueId = rechecked.json().data.issues[0].id;

    const returnToNovelResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/reference/issues/${issueId}/resolve`,
      payload: {
        idempotencyToken: 'return-to-novel-action-token',
        action: 'return_to_novel',
        reason: '回小说侧处理只是导航动作'
      }
    });

    assert.equal(returnToNovelResponse.statusCode, 400);
    assert.equal(returnToNovelResponse.json().error.code, 'VALIDATION_ERROR');

    await app.close();
  });

  it('rejects non video_ready novels when creating a project', async () => {
    const app = await buildApp({ logger: false, videoRepository: createInMemoryVideoRepository(), now: fixedNow });

    const response = await app.inject({
      method: 'POST',
      url: '/videos',
      payload: createVideoPayload({
        idempotencyToken: 'create-draft-video',
        novelId: 'novel_draft',
        videoReadinessSnapshotId: 'missing'
      })
    });

    assert.equal(response.statusCode, 409);
    assert.equal(response.json().error.code, 'INVALID_STAGE');
    await app.close();
  });

  it('creates a reference issue when recheck sees changed chapter versions', async () => {
    const videoRepository = createInMemoryVideoRepository();
    const app = await buildApp({ logger: false, videoRepository, now: fixedNow });
    const projectId = await createVideoProject(app, 'recheck-project-token');
    videoRepository.mutateCurrentChapterVersion('novel_video_ready', 'chapter_ready_002', 'ccv_ready_002_rewrite');

    const response = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/reference/recheck`,
      payload: {
        idempotencyToken: 'recheck-token-1',
        expectedReferenceVersion: 1
      }
    });

    assert.equal(response.statusCode, 200);
    const rechecked = response.json().data;
    assert.equal(rechecked.status, 'blocking');
    assert.equal(rechecked.issues.length, 1);
    assert.equal(rechecked.issues[0].issueLevel, 'blocking');
    assert.equal(rechecked.issues[0].issueType, 'chapter_version_changed');

    const detailResponse = await app.inject({ method: 'GET', url: `/videos/${projectId}/reference` });
    assert.equal(detailResponse.statusCode, 200);
    assert.equal(detailResponse.json().data.project.referenceStatus, 'blocking');

    await app.close();
  });

  it('does not allow blocking issues to be ignored and requires reasons for stop', async () => {
    const videoRepository = createInMemoryVideoRepository();
    const app = await buildApp({ logger: false, videoRepository, now: fixedNow });
    const projectId = await createVideoProject(app, 'blocking-issue-token');
    videoRepository.mutateCurrentChapterVersion('novel_video_ready', 'chapter_ready_002', 'ccv_ready_002_rewrite');
    const rechecked = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/reference/recheck`,
      payload: { idempotencyToken: 'blocking-recheck-token', expectedReferenceVersion: 1 }
    });
    const issueId = rechecked.json().data.issues[0].id;

    const ignoreResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/reference/issues/${issueId}/resolve`,
      payload: {
        idempotencyToken: 'ignore-blocking-token',
        action: 'ignore',
        reason: '想先忽略'
      }
    });
    assert.equal(ignoreResponse.statusCode, 409);
    assert.equal(ignoreResponse.json().error.code, 'VIDEO_REFERENCE_BLOCKING');

    const missingReasonResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/stop`,
      payload: {
        idempotencyToken: 'stop-missing-reason',
        reason: ''
      }
    });
    assert.equal(missingReasonResponse.statusCode, 400);
    assert.equal(missingReasonResponse.json().error.code, 'VALIDATION_ERROR');

    const stopResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/stop`,
      payload: {
        idempotencyToken: 'stop-with-reason',
        reason: '小说正文版本已变化，先停止该视频项目'
      }
    });
    assert.equal(stopResponse.statusCode, 200);
    assert.equal(stopResponse.json().data.project.lifecycleStatus, 'stopped');
    assert.equal(videoRepository.getOperationLogs().some((log) => log.action === 'stop_video_project'), true);

    await app.close();
  });

  it('returns a P9b workbench aggregate with reference snapshot, default unit, dependency refs, and narration unlocked', async () => {
    const videoRepository = createInMemoryVideoRepository();
    const app = await buildApp({ logger: false, videoRepository, now: fixedNow });
    const projectId = await createVideoProject(app, 'workbench-project-token');

    const response = await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` });

    assert.equal(response.statusCode, 200);
    const workbench = response.json();
    assert.equal(workbench.success, true);
    assert.equal(workbench.data.project.id, projectId);
    assert.equal(workbench.data.reference.referenceId, workbench.data.project.currentVideoReferenceId);
    assert.equal(workbench.data.defaultUnit.id, workbench.data.project.defaultVideoUnitId);
    assert.equal(workbench.data.defaultUnit.unitType, 'first_test');
    assert.equal(workbench.data.dependencyRefs.videoReferenceId, workbench.data.reference.referenceId);
    assert.deepEqual(
      workbench.data.dependencyRefs.chapterContentVersionIds,
      workbench.data.reference.chapters.map((chapter: { contentVersionId: string }) => chapter.contentVersionId)
    );
    assert.deepEqual(
      workbench.data.steps.map((step: { key: string }) => step.key),
      ['reference_check', 'narration', 'tts', 'subtitle', 'visual_plan', 'render', 'preview', 'export']
    );
    assert.equal(workbench.data.steps[0].status, 'active');
    assert.equal(workbench.data.steps[1].status, 'active');
    assert.equal(workbench.data.steps[1].lockedReason, null);
    assert.equal(workbench.data.steps[2].status, 'placeholder_locked');
    assert.equal(workbench.data.steps[2].lockedReason.includes('旁白'), true);
    assert.equal(workbench.data.recommendedAction.label, '生成旁白候选');
    assert.equal(workbench.data.artifacts.placeholders.some((item: { type: string }) => item.type === 'narration_script'), true);
    assert.equal(workbench.data.artifacts.narration.current, null);

    await app.close();
  });

  it('locks every production step in the workbench when the reference is blocking', async () => {
    const videoRepository = createInMemoryVideoRepository();
    const app = await buildApp({ logger: false, videoRepository, now: fixedNow });
    const projectId = await createVideoProject(app, 'workbench-blocking-project-token');
    videoRepository.mutateCurrentChapterVersion('novel_video_ready', 'chapter_ready_002', 'ccv_ready_002_rewrite');
    await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/reference/recheck`,
      payload: { idempotencyToken: 'workbench-blocking-recheck-token', expectedReferenceVersion: 1 }
    });

    const response = await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` });

    assert.equal(response.statusCode, 200);
    const workbench = response.json().data;
    assert.equal(workbench.reference.status, 'blocking');
    assert.equal(workbench.recommendedAction.label, '处理引用异常');
    assert.equal(workbench.risks.some((risk: { level: string }) => risk.level === 'blocking'), true);
    for (const step of workbench.steps.slice(1)) {
      assert.equal(step.status, 'blocked');
      assert.equal(step.lockedReason.includes('引用'), true);
    }

    await app.close();
  });

  it('generates narration candidates without making them current and reuses the same idempotency token', async () => {
    const videoRepository = createInMemoryVideoRepository();
    const app = await buildApp({ logger: false, videoRepository, now: fixedNow });
    const projectId = await createVideoProject(app, 'narration-project-token');
    const workbenchResponse = await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` });
    const workbench = workbenchResponse.json().data;

    const response = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/narrations/generate`,
      payload: {
        idempotencyToken: 'generate-narration-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        candidateCount: 3,
        qualityMode: 'standard'
      }
    });

    assert.equal(response.statusCode, 200);
    const generated = response.json().data;
    assert.equal(generated.artifacts.length, 3);
    assert.equal(generated.current, null);
    assert.equal(generated.task.taskType, 'video_narration_generate');
    assert.equal(generated.task.status, 'completed');
    assert.equal(generated.artifacts[0].status, 'candidate');
    assert.equal(generated.artifacts[0].artifactType, 'narration_script');
    assert.equal(generated.artifacts[0].metadata.isMockOutput, true);
    assert.equal(generated.artifacts[0].sourceVersionRefs.videoReferenceId, workbench.reference.referenceId);

    const generatedWorkbenchResponse = await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` });
    assert.equal(generatedWorkbenchResponse.statusCode, 200);
    const generatedWorkbench = generatedWorkbenchResponse.json().data;
    assert.equal(generatedWorkbench.recentTasks[0].taskType, 'video_narration_generate');
    assert.equal(generatedWorkbench.recentTasks[0].status, 'completed');

    const repeatedResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/narrations/generate`,
      payload: {
        idempotencyToken: 'generate-narration-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        candidateCount: 3,
        qualityMode: 'standard'
      }
    });
    assert.equal(repeatedResponse.statusCode, 200);
    assert.equal(repeatedResponse.json().data.artifacts[0].id, generated.artifacts[0].id);

    const conflictResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/narrations/generate`,
      payload: {
        idempotencyToken: 'generate-narration-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        candidateCount: 2,
        qualityMode: 'standard'
      }
    });
    assert.equal(conflictResponse.statusCode, 409);
    assert.equal(conflictResponse.json().error.code, 'IDEMPOTENCY_CONFLICT');

    await app.close();
  });

  it('keeps failed and cancelled narration tasks visible without creating candidates or unlocking TTS', async () => {
    const videoRepository = createInMemoryVideoRepository();
    const app = await buildApp({ logger: false, videoRepository, now: fixedNow });
    const projectId = await createVideoProject(app, 'narration-failure-project-token');
    const workbenchResponse = await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` });
    const workbench = workbenchResponse.json().data;

    const failedResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/narrations/generate`,
      payload: {
        idempotencyToken: 'generate-narration-failed-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        candidateCount: 3,
        qualityMode: 'standard',
        mockTaskOutcome: 'failed'
      }
    });

    assert.equal(failedResponse.statusCode, 200);
    const failed = failedResponse.json().data;
    assert.equal(failed.task.status, 'failed');
    assert.equal(failed.task.failureCategory, 'provider_error');
    assert.equal(failed.task.canRetry, true);
    assert.equal(failed.artifacts.length, 0);
    assert.equal(failed.current, null);
    assert.equal(videoRepository.getNarrationArtifacts().filter((artifact) => artifact.videoProjectId === projectId).length, 0);

    const failedWorkbenchResponse = await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` });
    const failedWorkbench = failedWorkbenchResponse.json().data;
    assert.equal(failedWorkbench.recentTasks[0].status, 'failed');
    assert.equal(failedWorkbench.recentTasks[0].failureCategory, 'provider_error');
    assert.equal(failedWorkbench.recommendedAction.label, '重试旁白生成');
    assert.equal(failedWorkbench.steps.find((step: { key: string }) => step.key === 'tts')?.status, 'placeholder_locked');

    const retryResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/narrations/generate`,
      payload: {
        idempotencyToken: 'generate-narration-retry-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        candidateCount: 2,
        qualityMode: 'standard',
        retryOfTaskId: failed.task.id
      }
    });

    assert.equal(retryResponse.statusCode, 200);
    const retry = retryResponse.json().data;
    assert.equal(retry.task.status, 'completed');
    assert.equal(retry.task.retryOfTaskId, failed.task.id);
    assert.equal(retry.artifacts.length, 2);
    assert.equal(retry.current, null);

    const cancelledResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/narrations/generate`,
      payload: {
        idempotencyToken: 'generate-narration-cancelled-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        candidateCount: 3,
        qualityMode: 'standard',
        mockTaskOutcome: 'cancelled'
      }
    });

    assert.equal(cancelledResponse.statusCode, 200);
    const cancelled = cancelledResponse.json().data;
    assert.equal(cancelled.task.status, 'cancelled');
    assert.equal(cancelled.task.failureCategory, 'user_cancelled');
    assert.equal(cancelled.artifacts.length, 0);
    assert.equal(cancelled.current, null);

    await app.close();
  });

  it('blocks narration generation when the video reference is blocking', async () => {
    const videoRepository = createInMemoryVideoRepository();
    const app = await buildApp({ logger: false, videoRepository, now: fixedNow });
    const projectId = await createVideoProject(app, 'narration-blocking-project-token');
    videoRepository.mutateCurrentChapterVersion('novel_video_ready', 'chapter_ready_002', 'ccv_ready_002_rewrite');
    await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/reference/recheck`,
      payload: { idempotencyToken: 'narration-blocking-recheck-token', expectedReferenceVersion: 1 }
    });

    const response = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/narrations/generate`,
      payload: {
        idempotencyToken: 'generate-narration-blocked-token',
        expectedReferenceVersion: 1,
        videoUnitId: 'vunit_000003',
        candidateCount: 3,
        qualityMode: 'standard'
      }
    });

    assert.equal(response.statusCode, 409);
    assert.equal(response.json().error.code, 'VIDEO_REFERENCE_BLOCKING');
    assert.equal(videoRepository.getNarrationArtifacts().length, 0);

    await app.close();
  });

  it('saves edited narration drafts, rejects candidates with reason, and requires reason for risky confirmation', async () => {
    const videoRepository = createInMemoryVideoRepository();
    const app = await buildApp({ logger: false, videoRepository, now: fixedNow });
    const projectId = await createVideoProject(app, 'narration-confirm-project-token');
    const workbench = (await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` })).json().data;
    const generated = (await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/narrations/generate`,
      payload: {
        idempotencyToken: 'generate-risky-narration-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        candidateCount: 3,
        qualityMode: 'standard'
      }
    })).json().data;
    const riskyCandidate = generated.artifacts[2];

    const missingReasonResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/narrations/${riskyCandidate.id}/confirm`,
      payload: {
        idempotencyToken: 'confirm-risky-narration-no-reason',
        expectedVersionNo: riskyCandidate.versionNo
      }
    });
    assert.equal(missingReasonResponse.statusCode, 400);
    assert.equal(missingReasonResponse.json().error.code, 'VALIDATION_ERROR');

    const editResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/narrations/drafts`,
      payload: {
        idempotencyToken: 'edit-narration-token',
        baseArtifactId: riskyCandidate.id,
        contentText: '三秒钩子：穿越秦朝，他用化学改变盐场命运。随后用白话讲清冲突和悬念。',
        hook: '穿越秦朝，他第一件事竟然是救盐场。',
        firstScreenSubtitle: '化学老师穿秦朝，开局救盐场',
        endingHook: '真正的危机，来自官府的下一道命令。',
        reason: '压缩口播节奏'
      }
    });
    assert.equal(editResponse.statusCode, 200);
    assert.equal(editResponse.json().data.artifact.status, 'draft');

    const rejectResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/narrations/${riskyCandidate.id}/reject`,
      payload: {
        idempotencyToken: 'reject-narration-token',
        reason: '风险标签较多，不作为本轮旁白'
      }
    });
    assert.equal(rejectResponse.statusCode, 200);
    assert.equal(rejectResponse.json().data.artifact.status, 'rejected');

    const confirmResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/narrations/${generated.artifacts[0].id}/confirm`,
      payload: {
        idempotencyToken: 'confirm-narration-token',
        expectedVersionNo: generated.artifacts[0].versionNo
      }
    });
    assert.equal(confirmResponse.statusCode, 200);
    assert.equal(confirmResponse.json().data.current.id, generated.artifacts[0].id);
    assert.equal(confirmResponse.json().data.current.status, 'confirmed');
    assert.equal(videoRepository.getOperationLogs().some((log) => log.action === 'confirm_video_narration'), true);

    const listResponse = await app.inject({ method: 'GET', url: `/videos/${projectId}/narrations` });
    assert.equal(listResponse.statusCode, 200);
    assert.equal(listResponse.json().data.current.id, generated.artifacts[0].id);
    assert.equal(listResponse.json().data.history.some((item: { status: string }) => item.status === 'rejected'), true);

    const updatedWorkbench = (await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` })).json().data;
    assert.equal(updatedWorkbench.steps[1].status, 'completed');
    assert.equal(updatedWorkbench.artifacts.placeholders.find((item: { type: string }) => item.type === 'narration_script').currentVersionId, generated.artifacts[0].id);
    assert.equal(updatedWorkbench.steps[2].status, 'active');
    assert.equal(updatedWorkbench.steps[2].lockedReason, null);
    assert.equal(updatedWorkbench.recommendedAction.label, '生成配音候选');

    await app.close();
  });

  it('blocks TTS generation until narration is confirmed, then creates audio candidates without making them current', async () => {
    const videoRepository = createInMemoryVideoRepository();
    const app = await buildApp({ logger: false, videoRepository, now: fixedNow });
    const projectId = await createVideoProject(app, 'tts-project-token');
    const workbench = (await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` })).json().data;

    const blockedResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/tts/generate`,
      payload: {
        idempotencyToken: 'generate-tts-before-narration',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        narrationArtifactId: 'missing-narration',
        expectedNarrationVersionNo: 1,
        voiceId: 'mock-male-cinematic',
        voiceName: '男声-剧情感',
        speed: 1,
        emotion: 'suspense',
        volume: 90,
        qualityMode: 'standard'
      }
    });
    assert.equal(blockedResponse.statusCode, 409);
    assert.equal(blockedResponse.json().error.code, 'GATE_BLOCKED');

    const narration = await generateAndConfirmNarration(app, projectId, 'tts-base');
    const generatedResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/tts/generate`,
      payload: {
        idempotencyToken: 'generate-tts-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        narrationArtifactId: narration.id,
        expectedNarrationVersionNo: narration.versionNo,
        voiceId: 'mock-male-cinematic',
        voiceName: '男声-剧情感',
        speed: 1.05,
        emotion: 'suspense',
        volume: 90,
        qualityMode: 'standard'
      }
    });

    assert.equal(generatedResponse.statusCode, 200);
    const generated = generatedResponse.json().data;
    assert.equal(generated.task.taskType, 'video_tts_generate');
    assert.equal(generated.task.status, 'completed');
    assert.equal(generated.artifacts.length, 1);
    assert.equal(generated.current, null);
    assert.equal(generated.artifacts[0].artifactType, 'tts_audio');
    assert.equal(generated.artifacts[0].status, 'candidate');
    assert.equal(generated.artifacts[0].voiceId, 'mock-male-cinematic');
    assert.equal(generated.artifacts[0].durationSeconds > 0, true);
    assert.equal(generated.artifacts[0].fileKey.includes('mock'), true);
    assert.equal(generated.artifacts[0].previewUrl.includes('mock'), true);
    assert.equal(generated.artifacts[0].sourceVersionRefs.narrationArtifactId, narration.id);
    assert.equal(generated.artifacts[0].metadata.isMockOutput, true);

    const generatedWorkbench = (await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` })).json().data;
    assert.equal(generatedWorkbench.steps.find((step: { key: string }) => step.key === 'tts')?.status, 'active');
    assert.equal(generatedWorkbench.recentTasks[0].taskType, 'video_tts_generate');
    assert.equal(generatedWorkbench.artifacts.tts.candidates[0].id, generated.artifacts[0].id);
    assert.equal(generatedWorkbench.artifacts.tts.current, null);

    const repeatedResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/tts/generate`,
      payload: {
        idempotencyToken: 'generate-tts-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        narrationArtifactId: narration.id,
        expectedNarrationVersionNo: narration.versionNo,
        voiceId: 'mock-male-cinematic',
        voiceName: '男声-剧情感',
        speed: 1.05,
        emotion: 'suspense',
        volume: 90,
        qualityMode: 'standard'
      }
    });
    assert.equal(repeatedResponse.statusCode, 200);
    assert.equal(repeatedResponse.json().data.artifacts[0].id, generated.artifacts[0].id);

    const conflictResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/tts/generate`,
      payload: {
        idempotencyToken: 'generate-tts-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        narrationArtifactId: narration.id,
        expectedNarrationVersionNo: narration.versionNo,
        voiceId: 'mock-female-bright',
        voiceName: '女声-明亮感',
        speed: 1.05,
        emotion: 'suspense',
        volume: 90,
        qualityMode: 'standard'
      }
    });
    assert.equal(conflictResponse.statusCode, 409);
    assert.equal(conflictResponse.json().error.code, 'IDEMPOTENCY_CONFLICT');

    await app.close();
  });

  it('confirms, rejects, fails, and cancels TTS candidates, then unlocks subtitles', async () => {
    const videoRepository = createInMemoryVideoRepository();
    const app = await buildApp({ logger: false, videoRepository, now: fixedNow });
    const projectId = await createVideoProject(app, 'tts-confirm-project-token');
    const workbench = (await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` })).json().data;
    const narration = await generateAndConfirmNarration(app, projectId, 'tts-confirm-base');

    const failedResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/tts/generate`,
      payload: {
        idempotencyToken: 'generate-tts-failed-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        narrationArtifactId: narration.id,
        expectedNarrationVersionNo: narration.versionNo,
        voiceId: 'mock-male-cinematic',
        speed: 1,
        emotion: 'calm',
        volume: 80,
        mockTaskOutcome: 'failed'
      }
    });
    assert.equal(failedResponse.statusCode, 200);
    assert.equal(failedResponse.json().data.task.status, 'failed');
    assert.equal(failedResponse.json().data.task.failureCategory, 'provider_error');
    assert.equal(failedResponse.json().data.artifacts.length, 0);

    const retryResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/tts/generate`,
      payload: {
        idempotencyToken: 'generate-tts-retry-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        narrationArtifactId: narration.id,
        expectedNarrationVersionNo: narration.versionNo,
        voiceId: 'mock-male-cinematic',
        speed: 1,
        emotion: 'calm',
        volume: 80,
        retryOfTaskId: failedResponse.json().data.task.id
      }
    });
    assert.equal(retryResponse.statusCode, 200);
    const candidate = retryResponse.json().data.artifacts[0];
    assert.equal(retryResponse.json().data.task.retryOfTaskId, failedResponse.json().data.task.id);

    const rejectResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/tts/${candidate.id}/reject`,
      payload: {
        idempotencyToken: 'reject-tts-token',
        reason: '试听后情绪不够紧张'
      }
    });
    assert.equal(rejectResponse.statusCode, 200);
    assert.equal(rejectResponse.json().data.artifact.status, 'rejected');

    const generated = (await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/tts/generate`,
      payload: {
        idempotencyToken: 'generate-tts-confirm-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        narrationArtifactId: narration.id,
        expectedNarrationVersionNo: narration.versionNo,
        voiceId: 'mock-female-bright',
        speed: 0.98,
        emotion: 'warm',
        volume: 92
      }
    })).json().data.artifacts[0];

    const confirmResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/tts/${generated.id}/confirm`,
      payload: {
        idempotencyToken: 'confirm-tts-token',
        expectedVersionNo: generated.versionNo
      }
    });
    assert.equal(confirmResponse.statusCode, 200);
    assert.equal(confirmResponse.json().data.current.id, generated.id);
    assert.equal(videoRepository.getOperationLogs().some((log) => log.action === 'confirm_video_tts'), true);

    const cancelledResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/tts/generate`,
      payload: {
        idempotencyToken: 'generate-tts-cancelled-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        narrationArtifactId: narration.id,
        expectedNarrationVersionNo: narration.versionNo,
        voiceId: 'mock-male-cinematic',
        speed: 1,
        emotion: 'calm',
        volume: 80,
        mockTaskOutcome: 'cancelled'
      }
    });
    assert.equal(cancelledResponse.statusCode, 200);
    assert.equal(cancelledResponse.json().data.task.status, 'cancelled');
    assert.equal(cancelledResponse.json().data.current.id, generated.id);

    const finalWorkbench = (await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` })).json().data;
    assert.equal(finalWorkbench.artifacts.tts.current.id, generated.id);
    assert.equal(finalWorkbench.steps.find((step: { key: string }) => step.key === 'tts')?.status, 'completed');
    assert.equal(finalWorkbench.steps.find((step: { key: string }) => step.key === 'subtitle')?.status, 'active');
    assert.equal(finalWorkbench.steps.find((step: { key: string }) => step.key === 'subtitle')?.lockedReason, null);
    assert.equal(finalWorkbench.recommendedAction.label, '生成字幕候选');

    await app.close();
  });

  it('blocks subtitle generation until TTS is confirmed, then creates subtitle candidates without making them current', async () => {
    const videoRepository = createInMemoryVideoRepository();
    const app = await buildApp({ logger: false, videoRepository, now: fixedNow });
    const projectId = await createVideoProject(app, 'subtitle-project-token');
    const initialWorkbench = (await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` })).json().data;

    const blockedResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/subtitles/generate`,
      payload: {
        idempotencyToken: 'generate-subtitle-before-tts',
        expectedReferenceVersion: initialWorkbench.reference.versionNo,
        videoUnitId: initialWorkbench.defaultUnit.id,
        ttsArtifactId: 'missing-tts',
        expectedTtsVersionNo: 1,
        subtitleStyle: 'balanced',
        lineLength: 18,
        qualityMode: 'standard'
      }
    });
    assert.equal(blockedResponse.statusCode, 409);
    assert.equal(blockedResponse.json().error.code, 'GATE_BLOCKED');

    const { tts, workbench } = await generateAndConfirmTts(app, projectId, 'subtitle-base');
    const response = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/subtitles/generate`,
      payload: {
        idempotencyToken: 'generate-subtitle-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        ttsArtifactId: tts.id,
        expectedTtsVersionNo: tts.versionNo,
        subtitleStyle: 'dramatic',
        lineLength: 16,
        qualityMode: 'standard'
      }
    });

    assert.equal(response.statusCode, 200);
    const generated = response.json().data;
    assert.equal(generated.task.taskType, 'video_subtitle_generate');
    assert.equal(generated.task.status, 'completed');
    assert.equal(generated.artifacts.length, 1);
    assert.equal(generated.current, null);
    assert.equal(generated.artifacts[0].artifactType, 'subtitle');
    assert.equal(generated.artifacts[0].status, 'candidate');
    assert.equal(generated.artifacts[0].subtitleStyle, 'dramatic');
    assert.equal(generated.artifacts[0].lineLength, 16);
    assert.equal(generated.artifacts[0].sourceVersionRefs.ttsArtifactId, tts.id);
    assert.equal(generated.artifacts[0].metadata.isMockOutput, true);

    const generatedWorkbench = (await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` })).json().data;
    assert.equal(generatedWorkbench.steps.find((step: { key: string }) => step.key === 'subtitle')?.status, 'active');
    assert.equal(generatedWorkbench.recentTasks[0].taskType, 'video_subtitle_generate');
    assert.equal(generatedWorkbench.artifacts.subtitle.candidates[0].id, generated.artifacts[0].id);
    assert.equal(generatedWorkbench.artifacts.subtitle.current, null);

    const repeatedResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/subtitles/generate`,
      payload: {
        idempotencyToken: 'generate-subtitle-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        ttsArtifactId: tts.id,
        expectedTtsVersionNo: tts.versionNo,
        subtitleStyle: 'dramatic',
        lineLength: 16,
        qualityMode: 'standard'
      }
    });
    assert.equal(repeatedResponse.statusCode, 200);
    assert.equal(repeatedResponse.json().data.artifacts[0].id, generated.artifacts[0].id);

    const conflictResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/subtitles/generate`,
      payload: {
        idempotencyToken: 'generate-subtitle-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        ttsArtifactId: tts.id,
        expectedTtsVersionNo: tts.versionNo,
        subtitleStyle: 'compact',
        lineLength: 16,
        qualityMode: 'standard'
      }
    });
    assert.equal(conflictResponse.statusCode, 409);
    assert.equal(conflictResponse.json().error.code, 'IDEMPOTENCY_CONFLICT');

    await app.close();
  });

  it('keeps failed and cancelled subtitle tasks visible without creating candidates', async () => {
    const videoRepository = createInMemoryVideoRepository();
    const app = await buildApp({ logger: false, videoRepository, now: fixedNow });
    const projectId = await createVideoProject(app, 'subtitle-failure-project-token');
    const { tts, workbench } = await generateAndConfirmTts(app, projectId, 'subtitle-failure-base');

    const failedResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/subtitles/generate`,
      payload: {
        idempotencyToken: 'generate-subtitle-failed-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        ttsArtifactId: tts.id,
        expectedTtsVersionNo: tts.versionNo,
        subtitleStyle: 'balanced',
        lineLength: 18,
        mockTaskOutcome: 'failed'
      }
    });
    assert.equal(failedResponse.statusCode, 200);
    const failed = failedResponse.json().data;
    assert.equal(failed.task.status, 'failed');
    assert.equal(failed.task.failureCategory, 'provider_error');
    assert.equal(failed.task.canRetry, true);
    assert.equal(failed.artifacts.length, 0);
    assert.equal(failed.current, null);

    const failedWorkbench = (await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` })).json().data;
    assert.equal(failedWorkbench.recentTasks[0].status, 'failed');
    assert.equal(failedWorkbench.recommendedAction.label, '重试字幕生成');

    const retryResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/subtitles/generate`,
      payload: {
        idempotencyToken: 'generate-subtitle-retry-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        ttsArtifactId: tts.id,
        expectedTtsVersionNo: tts.versionNo,
        subtitleStyle: 'balanced',
        lineLength: 18,
        retryOfTaskId: failed.task.id
      }
    });
    assert.equal(retryResponse.statusCode, 200);
    assert.equal(retryResponse.json().data.task.retryOfTaskId, failed.task.id);
    assert.equal(retryResponse.json().data.artifacts.length, 1);

    const cancelledResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/subtitles/generate`,
      payload: {
        idempotencyToken: 'generate-subtitle-cancelled-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        ttsArtifactId: tts.id,
        expectedTtsVersionNo: tts.versionNo,
        subtitleStyle: 'compact',
        lineLength: 18,
        mockTaskOutcome: 'cancelled'
      }
    });
    assert.equal(cancelledResponse.statusCode, 200);
    assert.equal(cancelledResponse.json().data.task.status, 'cancelled');
    assert.equal(cancelledResponse.json().data.task.failureCategory, 'user_cancelled');
    assert.equal(cancelledResponse.json().data.artifacts.length, 0);

    await app.close();
  });

  it('saves edited subtitle drafts, rejects candidates, and confirms one subtitle while keeping P9e locked', async () => {
    const videoRepository = createInMemoryVideoRepository();
    const app = await buildApp({ logger: false, videoRepository, now: fixedNow });
    const projectId = await createVideoProject(app, 'subtitle-confirm-project-token');
    const { tts, workbench } = await generateAndConfirmTts(app, projectId, 'subtitle-confirm-base');

    const generated = (await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/subtitles/generate`,
      payload: {
        idempotencyToken: 'generate-subtitle-confirm-token',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        ttsArtifactId: tts.id,
        expectedTtsVersionNo: tts.versionNo,
        subtitleStyle: 'balanced',
        lineLength: 18
      }
    })).json().data.artifacts[0];

    const editResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/subtitles/drafts`,
      payload: {
        idempotencyToken: 'edit-subtitle-token',
        baseArtifactId: generated.id,
        contentText: '秦朝盐场快塌了。\n他拿出现代化学办法。\n所有人都等着看他翻盘。',
        firstScreenSubtitle: '化学老师穿秦朝，开局救盐场',
        reason: '调整首屏节奏和分行'
      }
    });
    assert.equal(editResponse.statusCode, 200);
    assert.equal(editResponse.json().data.artifact.status, 'draft');
    assert.equal(editResponse.json().data.artifact.firstScreenSubtitle, '化学老师穿秦朝，开局救盐场');

    const rejectResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/subtitles/${generated.id}/reject`,
      payload: {
        idempotencyToken: 'reject-subtitle-token',
        reason: '分行节奏需要重新调整'
      }
    });
    assert.equal(rejectResponse.statusCode, 200);
    assert.equal(rejectResponse.json().data.artifact.status, 'rejected');

    const draft = editResponse.json().data.artifact;
    const confirmResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/subtitles/${draft.id}/confirm`,
      payload: {
        idempotencyToken: 'confirm-subtitle-token',
        expectedVersionNo: draft.versionNo
      }
    });
    assert.equal(confirmResponse.statusCode, 200);
    assert.equal(confirmResponse.json().data.current.id, draft.id);
    assert.equal(confirmResponse.json().data.current.status, 'confirmed');
    assert.equal(videoRepository.getOperationLogs().some((log) => log.action === 'confirm_video_subtitle'), true);

    const listResponse = await app.inject({ method: 'GET', url: `/videos/${projectId}/subtitles` });
    assert.equal(listResponse.statusCode, 200);
    assert.equal(listResponse.json().data.current.id, draft.id);
    assert.equal(listResponse.json().data.history.some((item: { status: string }) => item.status === 'rejected'), true);

    const finalWorkbench = (await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` })).json().data;
    assert.equal(finalWorkbench.artifacts.subtitle.current.id, draft.id);
    assert.equal(finalWorkbench.steps.find((step: { key: string }) => step.key === 'subtitle')?.status, 'completed');
    assert.equal(finalWorkbench.steps.find((step: { key: string }) => step.key === 'visual_plan')?.status, 'active');
    assert.equal(finalWorkbench.steps.find((step: { key: string }) => step.key === 'visual_plan')?.lockedReason, null);
    assert.equal(finalWorkbench.recommendedAction.label, '配置视觉方案');

    await app.close();
  });

  it('runs the P9e visual plan, render preview, confirmation, and export flow without creating publish actions', async () => {
    const videoRepository = createInMemoryVideoRepository();
    const app = await buildApp({ logger: false, videoRepository, now: fixedNow });
    const projectId = await createVideoProject(app, 'p9e-project-token');
    const { subtitle, workbench } = await generateAndConfirmSubtitle(app, projectId, 'p9e-base');

    const blockedExport = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/exports`,
      payload: {
        idempotencyToken: 'p9e-export-before-render',
        renderVersionId: 'missing-render',
        expectedRenderVersionNo: 1
      }
    });
    assert.equal(blockedExport.statusCode, 404);

    const saveVisual = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/visual-plans`,
      payload: createVisualPlanPayload({
        idempotencyToken: 'p9e-save-visual',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        subtitleArtifactId: subtitle.id,
        expectedSubtitleVersionNo: subtitle.versionNo
      })
    });
    assert.equal(saveVisual.statusCode, 200);
    const visualCandidate = saveVisual.json().data.artifact;
    assert.equal(visualCandidate.status, 'candidate');
    assert.equal(visualCandidate.isCurrent, false);
    assert.equal(visualCandidate.backgroundAssetId, 'mock-bg-salt-field');

    const visualRepeat = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/visual-plans`,
      payload: createVisualPlanPayload({
        idempotencyToken: 'p9e-save-visual',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        subtitleArtifactId: subtitle.id,
        expectedSubtitleVersionNo: subtitle.versionNo
      })
    });
    assert.equal(visualRepeat.statusCode, 200);
    assert.equal(visualRepeat.json().data.artifact.id, visualCandidate.id);

    const visualConflict = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/visual-plans`,
      payload: createVisualPlanPayload({
        idempotencyToken: 'p9e-save-visual',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        subtitleArtifactId: subtitle.id,
        expectedSubtitleVersionNo: subtitle.versionNo,
        backgroundAssetId: 'mock-bg-night-city'
      })
    });
    assert.equal(visualConflict.statusCode, 409);
    assert.equal(visualConflict.json().error.code, 'IDEMPOTENCY_CONFLICT');

    const confirmVisual = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/visual-plans/${visualCandidate.id}/confirm`,
      payload: {
        idempotencyToken: 'p9e-confirm-visual',
        expectedVersionNo: visualCandidate.versionNo
      }
    });
    assert.equal(confirmVisual.statusCode, 200);
    const visualCurrent = confirmVisual.json().data.current;
    assert.equal(visualCurrent.status, 'confirmed');

    const renderResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/renders/generate`,
      payload: {
        idempotencyToken: 'p9e-generate-render',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        visualPlanArtifactId: visualCurrent.id,
        expectedVisualPlanVersionNo: visualCurrent.versionNo,
        qualityMode: 'standard'
      }
    });
    assert.equal(renderResponse.statusCode, 200);
    const renderGenerated = renderResponse.json().data;
    assert.equal(renderGenerated.task.taskType, 'video_render_generate');
    assert.equal(renderGenerated.task.status, 'completed');
    assert.equal(renderGenerated.renders[0].status, 'candidate');
    assert.equal(renderGenerated.renders[0].previewStatus, 'preview_pending');
    assert.equal(renderGenerated.current, null);

    const exportBeforeConfirm = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/exports`,
      payload: {
        idempotencyToken: 'p9e-export-before-confirm',
        renderVersionId: renderGenerated.renders[0].id,
        expectedRenderVersionNo: renderGenerated.renders[0].versionNo
      }
    });
    assert.equal(exportBeforeConfirm.statusCode, 409);
    assert.equal(exportBeforeConfirm.json().error.code, 'GATE_BLOCKED');

    const confirmRender = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/renders/${renderGenerated.renders[0].id}/confirm`,
      payload: {
        idempotencyToken: 'p9e-confirm-render',
        expectedVersionNo: renderGenerated.renders[0].versionNo
      }
    });
    assert.equal(confirmRender.statusCode, 200);
    const renderCurrent = confirmRender.json().data.current;
    assert.equal(renderCurrent.status, 'confirmed');
    assert.equal(renderCurrent.previewStatus, 'confirmed_exportable');

    const exportResponse = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/exports`,
      payload: {
        idempotencyToken: 'p9e-create-export',
        renderVersionId: renderCurrent.id,
        expectedRenderVersionNo: renderCurrent.versionNo,
        fileName: '化学大秦-首条预览.mp4'
      }
    });
    assert.equal(exportResponse.statusCode, 200);
    assert.equal(exportResponse.json().data.exportRecord.status, 'created');
    assert.equal(exportResponse.json().data.exportRecord.fileName, '化学大秦-首条预览.mp4');
    assert.equal(videoRepository.getOperationLogs().some((log) => /publish|upload|platform/.test(log.action)), false);

    const finalWorkbench = (await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` })).json().data;
    assert.equal(finalWorkbench.steps.find((step: { key: string }) => step.key === 'visual_plan')?.status, 'completed');
    assert.equal(finalWorkbench.steps.find((step: { key: string }) => step.key === 'render')?.status, 'completed');
    assert.equal(finalWorkbench.steps.find((step: { key: string }) => step.key === 'preview')?.status, 'completed');
    assert.equal(finalWorkbench.steps.find((step: { key: string }) => step.key === 'export')?.status, 'completed');
    assert.equal(finalWorkbench.recommendedAction.label, '查看导出记录');
    assert.equal(finalWorkbench.artifacts.exports.current.fileName, '化学大秦-首条预览.mp4');

    await app.close();
  });

  it('sanitizes video artifact metadata, provider summaries, render/export DTOs, and recent tasks while preserving editable text', async () => {
    const baseRepository = createInMemoryVideoRepository();
    let sanitizeOutput = false;
    let projectId = '';
    const videoRepository = {
      ...baseRepository,
      async listNarrationArtifacts(tenantId: string, videoProjectId: string) {
        const records = await baseRepository.listNarrationArtifacts(tenantId, videoProjectId);
        return sanitizeOutput && videoProjectId === projectId ? records.map(injectUnsafeArtifactFields) : records;
      },
      async listSubtitleArtifacts(tenantId: string, videoProjectId: string) {
        const records = await baseRepository.listSubtitleArtifacts(tenantId, videoProjectId);
        return sanitizeOutput && videoProjectId === projectId ? records.map(injectUnsafeArtifactFields) : records;
      },
      async listVisualPlanArtifacts(tenantId: string, videoProjectId: string) {
        const records = await baseRepository.listVisualPlanArtifacts(tenantId, videoProjectId);
        return sanitizeOutput && videoProjectId === projectId ? records.map(injectUnsafeArtifactFields) : records;
      },
      async listRenders(tenantId: string, videoProjectId: string) {
        const records = await baseRepository.listRenders(tenantId, videoProjectId);
        return sanitizeOutput && videoProjectId === projectId ? records.map(injectUnsafeRenderFields) : records;
      },
      async listExports(tenantId: string, videoProjectId: string) {
        const records = await baseRepository.listExports(tenantId, videoProjectId);
        return sanitizeOutput && videoProjectId === projectId ? records.map(injectUnsafeExportFields) : records;
      },
      async listActionReceipts(tenantId: string, videoProjectId: string, actionType: Parameters<typeof baseRepository.listActionReceipts>[2], limit?: number) {
        if (sanitizeOutput && videoProjectId === projectId && actionType === 'generate_video_render') {
          return [createUnsafeTaskReceipt(tenantId, videoProjectId)];
        }
        return baseRepository.listActionReceipts(tenantId, videoProjectId, actionType, limit);
      }
    };
    const app = await buildApp({ logger: false, videoRepository, now: fixedNow });
    projectId = await createVideoProject(app, 'sanitize-video-project-token');
    const { subtitle, workbench } = await generateAndConfirmSubtitle(app, projectId, 'sanitize-base');
    const saveVisual = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/visual-plans`,
      payload: createVisualPlanPayload({
        idempotencyToken: 'sanitize-save-visual',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        subtitleArtifactId: subtitle.id,
        expectedSubtitleVersionNo: subtitle.versionNo
      })
    });
    const visualCandidate = saveVisual.json().data.artifact;
    const visualCurrent = (await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/visual-plans/${visualCandidate.id}/confirm`,
      payload: {
        idempotencyToken: 'sanitize-confirm-visual',
        expectedVersionNo: visualCandidate.versionNo
      }
    })).json().data.current;
    const renderGenerated = (await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/renders/generate`,
      payload: {
        idempotencyToken: 'sanitize-generate-render',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        visualPlanArtifactId: visualCurrent.id,
        expectedVisualPlanVersionNo: visualCurrent.versionNo,
        qualityMode: 'standard'
      }
    })).json().data;
    const renderCurrent = (await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/renders/${renderGenerated.renders[0].id}/confirm`,
      payload: {
        idempotencyToken: 'sanitize-confirm-render',
        expectedVersionNo: renderGenerated.renders[0].versionNo
      }
    })).json().data.current;
    await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/exports`,
      payload: {
        idempotencyToken: 'sanitize-create-export',
        renderVersionId: renderCurrent.id,
        expectedRenderVersionNo: renderCurrent.versionNo,
        fileName: 'sanitize-export.mp4'
      }
    });

    sanitizeOutput = true;

    const narrationResponse = await app.inject({ method: 'GET', url: `/videos/${projectId}/narrations` });
    const subtitleResponse = await app.inject({ method: 'GET', url: `/videos/${projectId}/subtitles` });
    const workbenchResponse = await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` });
    const renderResponse = await app.inject({ method: 'GET', url: `/videos/${projectId}/renders` });
    const exportResponse = await app.inject({ method: 'GET', url: `/videos/${projectId}/exports` });

    assert.equal(narrationResponse.statusCode, 200);
    assert.equal(subtitleResponse.statusCode, 200);
    assert.equal(workbenchResponse.statusCode, 200);
    assert.equal(renderResponse.statusCode, 200);
    assert.equal(exportResponse.statusCode, 200);

    const narrations = narrationResponse.json().data;
    const subtitles = subtitleResponse.json().data;
    const workbenchData = workbenchResponse.json().data;
    const renders = renderResponse.json().data;
    const exports = exportResponse.json().data;
    assert.match(narrations.current.contentText, /秦朝|盐场|化学/);
    assert.match(subtitles.current.contentText, /秦朝|盐场|化学/);
    assert.equal(narrations.current.metadata.isMockOutput, true);
    assert.equal(narrations.current.metadata.candidateRank, 1);
    assert.equal(subtitles.current.metadata.subtitleStyle, 'balanced');
    assert.equal(subtitles.current.metadata.lineLength, 18);
    assert.equal(workbenchData.recentTasks[0].failureCategory, 'provider_error');
    assert.equal(workbenchData.recentTasks[0].statusNote, '生成服务返回异常，当前产物未受影响，可以稍后重试。');
    assert.equal(renders.current.providerSummary.provider, 'mock-local-render');
    assert.equal(exports.current.fileName, 'sanitize-export.mp4');

    for (const payload of [narrations, subtitles, workbenchData, renders, exports]) {
      assert.equal(hasForbiddenVisiblePayload(payload), false);
    }

    await app.close();
  });

  it('keeps failed and cancelled render tasks visible without unlocking export', async () => {
    const videoRepository = createInMemoryVideoRepository();
    const app = await buildApp({ logger: false, videoRepository, now: fixedNow });
    const projectId = await createVideoProject(app, 'p9e-render-failure-project-token');
    const { visualPlan, workbench } = await saveAndConfirmVisualPlan(app, projectId, 'p9e-render-failure-base');

    const failed = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/renders/generate`,
      payload: {
        idempotencyToken: 'p9e-render-failed',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        visualPlanArtifactId: visualPlan.id,
        expectedVisualPlanVersionNo: visualPlan.versionNo,
        mockTaskOutcome: 'failed'
      }
    });
    assert.equal(failed.statusCode, 200);
    assert.equal(failed.json().data.task.status, 'failed');
    assert.equal(failed.json().data.task.failureCategory, 'provider_error');
    assert.equal(failed.json().data.renders.length, 0);

    const failedWorkbench = (await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` })).json().data;
    assert.equal(failedWorkbench.recentTasks[0].status, 'failed');
    assert.equal(failedWorkbench.recommendedAction.label, '重试视频渲染');
    assert.equal(failedWorkbench.steps.find((step: { key: string }) => step.key === 'export')?.status, 'placeholder_locked');

    const cancelled = await app.inject({
      method: 'POST',
      url: `/videos/${projectId}/renders/generate`,
      payload: {
        idempotencyToken: 'p9e-render-cancelled',
        expectedReferenceVersion: workbench.reference.versionNo,
        videoUnitId: workbench.defaultUnit.id,
        visualPlanArtifactId: visualPlan.id,
        expectedVisualPlanVersionNo: visualPlan.versionNo,
        mockTaskOutcome: 'cancelled'
      }
    });
    assert.equal(cancelled.statusCode, 200);
    assert.equal(cancelled.json().data.task.status, 'cancelled');
    assert.equal(cancelled.json().data.current, null);

    await app.close();
  });
});

function fixedNow() {
  return new Date('2026-06-23T10:00:00.000Z');
}

function injectUnsafeArtifactFields(record: VideoArtifactRecord): VideoArtifactRecord {
  return {
    ...record,
    providerSummary: {
      ...record.providerSummary,
      endpoint: 'https://provider.example.test/v1/chat/completions',
      apiKey: 'sk-test-secret',
      rawResponse: '完整 provider response 不应出现在响应里'
    } as VideoArtifactRecord['providerSummary'],
    metadata: {
      ...(record.metadata as Record<string, unknown>),
      rawPrompt: '完整 prompt 不应返回',
      providerPayload: { apiKey: 'sk-test-secret', requestPayload: { prompt: 'hidden prompt' } },
      debug: { rawResponse: 'hidden raw response' },
      fullChapterText: '完整章节正文不应返回',
      nested: { modelResponse: 'hidden model response' }
    }
  };
}

function injectUnsafeRenderFields(record: VideoRenderRecord): VideoRenderRecord {
  return {
    ...record,
    safeSummary: 'provider error: https://provider.example.test/v1/chat/completions apiKey=sk-test-secret prompt: full',
    providerSummary: {
      ...record.providerSummary,
      endpoint: 'https://provider.example.test/v1/chat/completions',
      token: 'secret-token',
      providerResponse: 'raw provider response'
    } as VideoRenderRecord['providerSummary'],
    metadata: {
      ...(record.metadata as Record<string, unknown>),
      rawResponse: 'raw render response',
      providerPayload: { token: 'secret-token' }
    }
  };
}

function injectUnsafeExportFields(record: VideoExportRecord): VideoExportRecord {
  return {
    ...record,
    safeSummary: 'DATABASE_URL=mysql://user:pass@localhost/db raw response',
    metadata: {
      ...(record.metadata as Record<string, unknown>),
      responsePayload: { downloadUrl: 'https://provider.example.test/private?token=secret' },
      debug: 'hidden'
    }
  };
}

function createUnsafeTaskReceipt(tenantId: string, videoProjectId: string): VideoActionReceiptRecord {
  return {
    id: 'unsafe_receipt_001',
    tenantId,
    videoProjectId,
    actionType: 'generate_video_render',
    idempotencyToken: 'unsafe-render-token',
    requestHash: 'unsafe-request-hash',
    resultObjectType: 'video_render',
    resultObjectId: 'unsafe-render',
    createdBy: 'user_default',
    createdAt: fixedNow(),
    metadata: {
      task: {
        id: 'unsafe_task_001',
        taskType: 'video_render_generate',
        status: 'failed',
        currentStep: 'calling_model',
        statusNote: 'provider error: https://provider.example.test/v1/chat/completions apiKey=sk-test-secret prompt: full',
        progress: 45,
        failureCategory: 'provider_error',
        retryOfTaskId: null,
        canRetry: true,
        canCancel: false,
        debug: { rawResponse: 'hidden raw response' }
      }
    }
  };
}

function hasForbiddenVisiblePayload(value: unknown): boolean {
  const serialized = JSON.stringify(value).toLowerCase();
  return [
    'sk-test-secret',
    'secret-token',
    'rawprompt',
    'rawresponse',
    'modelresponse',
    'providerresponse',
    'providerpayload',
    'requestpayload',
    'responsepayload',
    'apikey',
    'database_url',
    'fullchaptertext',
    'chapterbody',
    'debug',
    'hidden prompt',
    'hidden raw response',
    'provider.example.test'
  ].some((needle) => serialized.includes(needle));
}

function createVideoPayload(overrides: Partial<{
  idempotencyToken: string;
  novelId: string;
  videoReadinessSnapshotId: string;
  title: string;
  projectType: string;
  duplicatePolicy: string;
}> = {}) {
  return {
    idempotencyToken: overrides.idempotencyToken ?? 'create-video-token',
    novelId: overrides.novelId ?? 'novel_video_ready',
    videoReadinessSnapshotId: overrides.videoReadinessSnapshotId ?? 'vrs_ready_001',
    title: overrides.title ?? '化学大秦：第 1-3 章',
    projectType: overrides.projectType ?? 'first_test',
    chapterRange: {
      mode: 'first_recommended',
      chapterIds: []
    },
    duplicatePolicy: overrides.duplicatePolicy ?? 'return_existing'
  };
}

async function createVideoProject(app: Awaited<ReturnType<typeof buildApp>>, idempotencyToken: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/videos',
    payload: createVideoPayload({ idempotencyToken })
  });
  assert.equal(response.statusCode, 201);
  return response.json().data.project.id as string;
}

async function generateAndConfirmNarration(app: Awaited<ReturnType<typeof buildApp>>, projectId: string, tokenPrefix: string) {
  const workbench = (await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` })).json().data;
  const generated = (await app.inject({
    method: 'POST',
    url: `/videos/${projectId}/narrations/generate`,
    payload: {
      idempotencyToken: `${tokenPrefix}-generate-narration`,
      expectedReferenceVersion: workbench.reference.versionNo,
      videoUnitId: workbench.defaultUnit.id,
      candidateCount: 2,
      qualityMode: 'standard'
    }
  })).json().data;
  const artifact = generated.artifacts[0];
  const confirmed = await app.inject({
    method: 'POST',
    url: `/videos/${projectId}/narrations/${artifact.id}/confirm`,
    payload: {
      idempotencyToken: `${tokenPrefix}-confirm-narration`,
      expectedVersionNo: artifact.versionNo
    }
  });
  assert.equal(confirmed.statusCode, 200);
  return confirmed.json().data.current;
}

async function generateAndConfirmTts(app: Awaited<ReturnType<typeof buildApp>>, projectId: string, tokenPrefix: string) {
  const narration = await generateAndConfirmNarration(app, projectId, `${tokenPrefix}-narration`);
  const workbench = (await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` })).json().data;
  const generated = (await app.inject({
    method: 'POST',
    url: `/videos/${projectId}/tts/generate`,
    payload: {
      idempotencyToken: `${tokenPrefix}-generate-tts`,
      expectedReferenceVersion: workbench.reference.versionNo,
      videoUnitId: workbench.defaultUnit.id,
      narrationArtifactId: narration.id,
      expectedNarrationVersionNo: narration.versionNo,
      voiceId: 'mock-male-cinematic',
      voiceName: '男声-剧情感',
      speed: 1,
      emotion: 'suspense',
      volume: 90,
      qualityMode: 'standard'
    }
  })).json().data;
  const artifact = generated.artifacts[0];
  const confirmed = await app.inject({
    method: 'POST',
    url: `/videos/${projectId}/tts/${artifact.id}/confirm`,
    payload: {
      idempotencyToken: `${tokenPrefix}-confirm-tts`,
      expectedVersionNo: artifact.versionNo
    }
  });
  assert.equal(confirmed.statusCode, 200);
  return { narration, tts: confirmed.json().data.current, workbench };
}

async function generateAndConfirmSubtitle(app: Awaited<ReturnType<typeof buildApp>>, projectId: string, tokenPrefix: string) {
  const { tts } = await generateAndConfirmTts(app, projectId, `${tokenPrefix}-tts`);
  const workbench = (await app.inject({ method: 'GET', url: `/videos/${projectId}/workbench` })).json().data;
  const generated = (await app.inject({
    method: 'POST',
    url: `/videos/${projectId}/subtitles/generate`,
    payload: {
      idempotencyToken: `${tokenPrefix}-generate-subtitle`,
      expectedReferenceVersion: workbench.reference.versionNo,
      videoUnitId: workbench.defaultUnit.id,
      ttsArtifactId: tts.id,
      expectedTtsVersionNo: tts.versionNo,
      subtitleStyle: 'balanced',
      lineLength: 18
    }
  })).json().data;
  const artifact = generated.artifacts[0];
  const confirmed = await app.inject({
    method: 'POST',
    url: `/videos/${projectId}/subtitles/${artifact.id}/confirm`,
    payload: {
      idempotencyToken: `${tokenPrefix}-confirm-subtitle`,
      expectedVersionNo: artifact.versionNo
    }
  });
  assert.equal(confirmed.statusCode, 200);
  return { tts, subtitle: confirmed.json().data.current, workbench };
}

async function saveAndConfirmVisualPlan(app: Awaited<ReturnType<typeof buildApp>>, projectId: string, tokenPrefix: string) {
  const { subtitle, workbench } = await generateAndConfirmSubtitle(app, projectId, `${tokenPrefix}-subtitle`);
  const saved = (await app.inject({
    method: 'POST',
    url: `/videos/${projectId}/visual-plans`,
    payload: createVisualPlanPayload({
      idempotencyToken: `${tokenPrefix}-save-visual`,
      expectedReferenceVersion: workbench.reference.versionNo,
      videoUnitId: workbench.defaultUnit.id,
      subtitleArtifactId: subtitle.id,
      expectedSubtitleVersionNo: subtitle.versionNo
    })
  })).json().data.artifact;
  const confirmed = await app.inject({
    method: 'POST',
    url: `/videos/${projectId}/visual-plans/${saved.id}/confirm`,
    payload: {
      idempotencyToken: `${tokenPrefix}-confirm-visual`,
      expectedVersionNo: saved.versionNo
    }
  });
  assert.equal(confirmed.statusCode, 200);
  return { subtitle, visualPlan: confirmed.json().data.current, workbench };
}

function createVisualPlanPayload(overrides: Partial<{
  idempotencyToken: string;
  expectedReferenceVersion: number;
  videoUnitId: string;
  subtitleArtifactId: string;
  expectedSubtitleVersionNo: number;
  backgroundAssetId: string;
}> = {}) {
  return {
    idempotencyToken: overrides.idempotencyToken ?? 'visual-plan-token',
    expectedReferenceVersion: overrides.expectedReferenceVersion ?? 1,
    videoUnitId: overrides.videoUnitId ?? 'vunit_missing',
    subtitleArtifactId: overrides.subtitleArtifactId ?? 'subtitle_missing',
    expectedSubtitleVersionNo: overrides.expectedSubtitleVersionNo ?? 1,
    backgroundAssetId: overrides.backgroundAssetId ?? 'mock-bg-salt-field',
    backgroundName: overrides.backgroundAssetId === 'mock-bg-night-city' ? '夜色城市循环背景' : '盐场风沙循环背景',
    aspectRatio: '9:16',
    resolution: '1080x1920',
    subtitlePosition: 'bottom_safe',
    fontSize: 42,
    textColor: '#ffffff',
    strokeColor: '#111827',
    shadowEnabled: true,
    safeAreaPreset: 'douyin_safe',
    qualityMode: 'standard'
  };
}
