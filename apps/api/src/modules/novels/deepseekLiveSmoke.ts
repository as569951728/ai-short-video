import { buildApp } from '../../app.js';
import { createInMemoryNovelRepository } from './repositories/inMemoryNovelRepository.js';

async function main() {
  if (process.env.AI_PROVIDER_MODE !== 'deepseek' || !process.env.DEEPSEEK_API_KEY?.trim()) {
    throw new Error('DeepSeek live smoke 需要配置 AI_PROVIDER_MODE=deepseek 和 DEEPSEEK_API_KEY。');
  }

  const app = await buildApp({
    logger: false,
    novelRepository: createInMemoryNovelRepository(),
    aiProviderEnv: process.env
  });

  try {
    logStage('start', `model=${process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-pro'}`);
    const novelId = await createDraft(app);
    logStage('draft_created', novelId);
    const directions = await post(app, `/novels/${novelId}/directions/generate`, {});
    logStage('directions_generated', `candidates=${directions.candidates.length}`);
    await logTaskEvents(app, directions.task?.id, 'directions');
    const direction = directions.candidates.find((candidate: any) => candidate.score >= 75) ?? directions.candidates[0];
    await post(app, `/novels/${novelId}/directions/${direction.id}/adopt`, {
      reason: direction.score >= 75 ? 'live smoke 采用方向。' : 'live smoke 低分方向风险确认。',
      confirmLowScore: direction.score < 75
    });
    logStage('direction_adopted', `score=${direction.score}`);

    const setting = await generateAndAdoptStructure(app, novelId, 'settings');
    logStage('setting_adopted', setting.candidate.id);
    await logTaskEvents(app, setting.task?.id, 'setting');
    const outline = await generateAndAdoptStructure(app, novelId, 'outlines');
    logStage('outline_adopted', outline.candidate.id);
    await logTaskEvents(app, outline.task?.id, 'outline');
    const stageOutline = await generateAndAdoptStructure(app, novelId, 'stage-outlines');
    logStage('stage_outline_adopted', stageOutline.candidate.id);
    await logTaskEvents(app, stageOutline.task?.id, 'stage_outline');
    const chapterPlan = await generateAndAdoptStructure(app, novelId, 'chapter-plans');
    logStage('chapter_plan_adopted', chapterPlan.candidate.id);
    await logTaskEvents(app, chapterPlan.task?.id, 'chapter_plan');

    const firstTrial = await post(app, `/novels/${novelId}/trial/generate`, {});
    logStage('trial_chapter_one_generated', `candidates=${firstTrial.trialRun.chapterOneCandidates.length}`);
    await logTaskEvents(app, firstTrial.task?.id, 'trial_chapter_one');
    const selected = firstTrial.trialRun.chapterOneCandidates.find((candidate: any) => candidate.isAiRecommended) ?? firstTrial.trialRun.chapterOneCandidates[0];
    const followup = await post(app, `/novels/${novelId}/trial/generate`, {
      trialRunId: firstTrial.trialRun.id,
      selectedCandidateId: selected.id
    });
    logStage('trial_followup_generated', followup.trialRun.trialReview.trialResult);
    await logTaskEvents(app, followup.task?.id, 'trial_followup');
    const trialDecision = followup.trialRun.trialReview.requiresRiskConfirmation ? 'force_pass' : 'confirm_pass';
    const trialConfirm = await post(app, `/novels/${novelId}/trial/confirm`, {
      trialRunId: followup.trialRun.id,
      decision: trialDecision,
      confirmRisk: trialDecision === 'force_pass',
      reason: trialDecision === 'force_pass' ? 'live smoke 接受试写风险继续。' : undefined
    });
    logStage('trial_confirmed', trialDecision);

    const bodyBatch = await post(app, `/novels/${novelId}/chapters/batch-generate`, {
      strategySnapshotId: trialConfirm.bodyStrategySnapshot.id,
      expectedStrategySnapshotVersion: trialConfirm.bodyStrategySnapshot.versionNo,
      idempotencyKey: `deepseek-live-body-${Date.now()}`
    });
    logStage('body_batch_generated', 'chapter_range=4-5');
    await logTaskEvents(app, bodyBatch.task?.id, 'body_batch');

    const detailBeforeReview = await get(app, `/novels/${novelId}`);
    const reviewResult = await post(app, `/novels/${novelId}/full-review`, {
      idempotencyKey: `deepseek-live-review-${Date.now()}`,
      expectedNovelVersion: detailBeforeReview.updatedAt
    });
    logStage('full_review_generated', `gate=${reviewResult.fullReview.gateResult},score=${reviewResult.fullReview.totalScore}`);
    await logTaskEvents(app, reviewResult.task?.id, 'full_review');
    if (reviewResult.fullReview.gateResult !== 'pass' && reviewResult.fullReview.gateResult !== 'warning') {
      throw new Error(`全书审稿未通过，live smoke 停止：${reviewResult.fullReview.gateResult}`);
    }

    const completion = await post(app, `/novels/${novelId}/completion/confirm`, {
      idempotencyKey: `deepseek-live-completion-${Date.now()}`,
      reviewReportId: reviewResult.fullReview.id,
      fullReviewGateId: reviewResult.fullReview.gate.id,
      reason: 'DeepSeek live smoke 全书审稿通过，确认完成。'
    });
    logStage('completion_confirmed', completion.completionDecision.id);

    const ready = await post(app, `/novels/${novelId}/video-readiness/confirm`, {
      idempotencyKey: `deepseek-live-video-ready-${Date.now()}`,
      completionDecisionId: completion.completionDecision.id,
      readinessCheckId: completion.videoReadiness.check.id,
      checkVersion: completion.videoReadiness.check.version,
      reason: 'DeepSeek live smoke 待视频化检查通过。'
    });
    logStage('video_readiness_confirmed', ready.statusSummary.creationStage);

    console.log(
      JSON.stringify(
        {
          success: true,
          novelId,
          structures: [setting.candidate.id, outline.candidate.id, stageOutline.candidate.id, chapterPlan.candidate.id],
          creationStage: ready.statusSummary.creationStage,
          recommendedAction: ready.statusSummary.recommendedAction.label
        },
        null,
        2
      )
    );
  } finally {
    await app.close();
  }
}

function logStage(stage: string, note: string) {
  console.log(`[deepseek-live-smoke] ${stage}: ${note}`);
}

async function logTaskEvents(app: Awaited<ReturnType<typeof buildApp>>, taskId: string | undefined, label: string) {
  if (!taskId) return;
  const events = await get(app, `/tasks/${taskId}/events`);
  const eventTypes = events.items.map((event: any) => event.eventType).join('>');
  console.log(`[deepseek-live-smoke] task_events:${label}: ${eventTypes}`);
}

async function createDraft(app: Awaited<ReturnType<typeof buildApp>>) {
  const result = await post(app, '/novels/drafts', {
    title: 'DeepSeek live smoke 短篇',
    genres: ['都市逆袭'],
    preferences: {
      appealPoints: ['低谷翻盘', '证据反转'],
      targetAudience: '18-35 岁爽文用户',
      customIdea: '主角被误解后用证据翻盘，适合短视频切片。'
    },
    chapterLimit: 5,
    chapterWordRange: {
      min: 800,
      max: 1200
    }
  }, 201);
  return result.id as string;
}

async function generateAndAdoptStructure(app: Awaited<ReturnType<typeof buildApp>>, novelId: string, resource: string) {
  const generated = await post(app, `/novels/${novelId}/${resource}/generate`, {});
  await post(app, `/novels/${novelId}/${resource}/${generated.candidate.id}/adopt`, {
    reason: `live smoke 采用 ${resource}。`
  });
  return generated;
}

async function get(app: Awaited<ReturnType<typeof buildApp>>, url: string) {
  const response = await app.inject({ method: 'GET', url });
  const body = response.json();
  if (response.statusCode !== 200 || body.success !== true) {
    throw new Error(`GET ${url} failed: ${JSON.stringify(body.error)}`);
  }
  return body.data;
}

async function post(app: Awaited<ReturnType<typeof buildApp>>, url: string, payload: unknown, expectedStatus = 200) {
  const response = await app.inject({ method: 'POST', url, payload: payload as any });
  const body = response.json();
  if (response.statusCode !== expectedStatus || body.success !== true) {
    throw new Error(`POST ${url} failed: ${JSON.stringify(body.error)}`);
  }
  return body.data;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
