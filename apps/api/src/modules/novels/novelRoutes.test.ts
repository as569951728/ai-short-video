import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { ErrorCode, RiskLevel, TaskStatus } from '@ai-shortvideo/shared';
import { buildApp } from '../../app.js';
import type { LlmClient } from '../ai/llmClient.js';
import { createInMemoryNovelRepository } from './repositories/inMemoryNovelRepository.js';
import type { NovelRepository } from './domain/novelDomain.js';
import type { HotspotReferenceGateway, HotspotReferenceValidationInput } from './integrations/hotspotReferenceGateway.js';
import { BusinessError } from '../../shared/errors.js';
import { hashCanonicalJson } from './services/taskClaim.js';

describe('novel package 1 routes', () => {
  it('creates a draft and returns it in the list with a status summary', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T10:00:00.000Z')
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/novels/drafts',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'create-draft-1'
      },
      payload: {
        title: '重生后我靠系统逆袭',
        channel: 'novel',
        creationSourceType: 'system_recommendation',
        genres: ['都市逆袭'],
        preferences: {
          appealPoints: ['低谷翻盘', '强反击'],
          targetAudience: '18-35 岁爽文用户',
          customIdea: '主角从低谷开始，用系统能力反击。'
        },
        chapterLimit: 80,
        chapterWordRange: {
          min: 1800,
          max: 2600
        }
      }
    });

    assert.equal(createResponse.statusCode, 201);
    const created = createResponse.json();
    assert.equal(created.success, true);
    assert.equal(created.requestId, 'create-draft-1');
    assert.equal(created.data.title, '重生后我靠系统逆袭');
    assert.equal(created.data.lifecycleStatus, 'active');
    assert.equal(created.data.creationStage, 'draft');
    assert.equal(created.data.stageStatus, 'not_started');
    assert.equal(created.data.statusSummary.displayStatusText, '草稿已创建');
    assert.equal(created.data.statusSummary.currentStep, '准备生成小说方向');
    assert.equal(created.data.statusSummary.recommendedAction.label, '进入详情');
    assert.equal(created.data.statusSummary.recommendedAction.target, 'detail');
    assert.equal(created.data.preferences.creationSourceType, 'system_recommendation');
    assert.equal(created.data.creationSource.label, '系统推荐');

    const listResponse = await app.inject({
      method: 'GET',
      url: '/novels?page=1&pageSize=20&keyword=%E7%B3%BB%E7%BB%9F'
    });
    assert.equal(listResponse.statusCode, 200);
    const list = listResponse.json();
    assert.equal(list.success, true);
    assert.equal(list.data.total, 1);
    assert.equal(list.data.items[0].title, '重生后我靠系统逆袭');
    assert.equal(list.data.items[0].primaryAction.label, '详情');
    assert.notEqual(list.data.items[0].primaryAction.label, '创建视频');
    assert.equal(list.data.items[0].statusSummary.displayStatusText, '草稿已创建');
    assert.equal(list.data.items[0].statusSummary.recommendedAction.reasonText, '暂无 AI 结果，下一步需要进入详情后生成小说方向。');
    assert.equal(list.data.items[0].creationSource.type, 'system_recommendation');

    assert.equal(repository.getOperationLogs()[0]?.action, 'create_novel_draft');

    await app.close();
  });

  it('returns detail and row summary for an existing draft', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T10:00:00.000Z')
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/novels/drafts',
      headers: { 'content-type': 'application/json' },
      payload: {
        title: '离婚后她成了商业女王',
        genres: ['女频爽文'],
        preferences: {
          appealPoints: ['女性成长'],
          targetAudience: '女频爽文用户'
        },
        chapterLimit: 60,
        chapterWordRange: {
          min: 1600,
          max: 2400
        }
      }
    });
    const novelId = createResponse.json().data.id;

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}`
    });
    assert.equal(detailResponse.statusCode, 200);
    const detail = detailResponse.json();
    assert.equal(detail.data.id, novelId);
    assert.equal(detail.data.preferences.appealPoints[0], '女性成长');
    assert.equal(detail.data.chapterStats.plannedChapterCount, 60);
    assert.equal(detail.data.currentAssets.direction, null);
    assert.equal(detail.data.statusSummary.recommendedAction.disabled, false);

    const summaryResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}/summary`
    });
    assert.equal(summaryResponse.statusCode, 200);
    const summary = summaryResponse.json();
    assert.equal(summary.data.novelId, novelId);
    assert.equal(summary.data.recentTask, null);
    assert.deepEqual(summary.data.riskTips, ['暂无 AI 结果，尚未进入内容风险判断。']);
    assert.equal(summary.data.recommendedAction.label, '进入详情');

    await app.close();
  });

  it('defaults old clients to system recommendation but keeps historical missing preferences as legacy unknown', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T10:00:00.000Z')
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/novels/drafts',
      headers: { 'content-type': 'application/json' },
      payload: {
        title: '旧客户端创建的草稿',
        genres: ['都市逆袭'],
        preferences: {
          appealPoints: ['低谷翻盘']
        }
      }
    });

    assert.equal(createResponse.statusCode, 201);
    assert.equal(createResponse.json().data.preferences.creationSourceType, 'system_recommendation');

    await app.close();
  });

  it('rejects unavailable hotspot references without creating a draft', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T10:00:00.000Z')
    });

    const response = await app.inject({
      method: 'POST',
      url: '/novels/drafts',
      headers: { 'content-type': 'application/json' },
      payload: {
        title: '热点草稿',
        creationSourceType: 'hotspot_reference',
        hotspotReportId: 'hotspot-001',
        hotspotOpportunityId: 'opportunity-001',
        genres: ['都市逆袭']
      }
    });

    assert.equal(response.statusCode, 400);
    const body = response.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, ErrorCode.ValidationError);
    assert.equal(body.error.details.issues[0].path, 'creationSourceType');

    const listResponse = await app.inject({ method: 'GET', url: '/novels?page=1&pageSize=20' });
    assert.equal(listResponse.json().data.total, 0);

    await app.close();
  });

  it('validates hotspot references through an injected gateway and persists safe source summary', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      hotspotReferenceGateway: new FakeHotspotReferenceGateway(),
      now: () => new Date('2026-06-17T10:00:00.000Z')
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/novels/drafts',
      headers: { 'content-type': 'application/json' },
      payload: {
        title: '热点引用草稿',
        creationSourceType: 'hotspot_reference',
        hotspotReportId: 'hotspot-001',
        hotspotOpportunityId: 'opportunity-001',
        genres: ['都市逆袭'],
        preferences: {
          customIdea: '补充偏好：更强调短视频开场钩子。'
        }
      }
    });

    assert.equal(createResponse.statusCode, 201);
    const created = createResponse.json().data;
    assert.equal(created.preferences.creationSourceType, 'hotspot_reference');
    assert.equal(created.preferences.hotspotTitle, '同租户热点报告');
    assert.equal(created.preferences.hotspotOpportunityTitle, '短视频机会点');
    assert.equal(created.creationSource.type, 'hotspot_reference');
    assert.equal(created.creationSource.hotspotTitle, '同租户热点报告');

    const detailResponse = await app.inject({ method: 'GET', url: `/novels/${created.id}` });
    assert.equal(detailResponse.statusCode, 200);
    assert.equal(detailResponse.json().data.preferences.creationSourceType, 'hotspot_reference');

    await app.close();
  });

  it('returns field-level validation errors for manual and hotspot source conflicts', async () => {
    const app = await buildApp({
      logger: false,
      novelRepository: createInMemoryNovelRepository(),
      hotspotReferenceGateway: new FakeHotspotReferenceGateway(),
      now: () => new Date('2026-06-17T10:00:00.000Z')
    });

    const manualTooShort = await app.inject({
      method: 'POST',
      url: '/novels/drafts',
      headers: { 'content-type': 'application/json' },
      payload: {
        title: '手动想法过短',
        creationSourceType: 'manual_idea',
        preferences: { customIdea: '太短' }
      }
    });
    assert.equal(manualTooShort.statusCode, 400);
    assert.equal(manualTooShort.json().error.details.issues[0].path, 'preferences.customIdea');

    const systemConflict = await app.inject({
      method: 'POST',
      url: '/novels/drafts',
      headers: { 'content-type': 'application/json' },
      payload: {
        title: '系统推荐冲突',
        creationSourceType: 'system_recommendation',
        hotspotReportId: 'hotspot-001'
      }
    });
    assert.equal(systemConflict.statusCode, 400);
    assert.equal(systemConflict.json().error.details.issues[0].path, 'hotspotReportId');

    const crossTenant = await app.inject({
      method: 'POST',
      url: '/novels/drafts',
      headers: { 'content-type': 'application/json' },
      payload: {
        title: '跨租户热点',
        creationSourceType: 'hotspot_reference',
        hotspotReportId: 'hotspot-cross-tenant'
      }
    });
    assert.equal(crossTenant.statusCode, 400);
    assert.equal(crossTenant.json().error.details.reasonCode, 'cross_tenant');

    const wrongOpportunity = await app.inject({
      method: 'POST',
      url: '/novels/drafts',
      headers: { 'content-type': 'application/json' },
      payload: {
        title: '机会点归属错误',
        creationSourceType: 'hotspot_reference',
        hotspotReportId: 'hotspot-001',
        hotspotOpportunityId: 'opportunity-other'
      }
    });
    assert.equal(wrongOpportunity.statusCode, 400);
    assert.equal(wrongOpportunity.json().error.details.reasonCode, 'opportunity_not_in_report');

    await app.close();
  });

  it('returns NOT_FOUND for missing novel detail', async () => {
    const app = await buildApp({
      logger: false,
      novelRepository: createInMemoryNovelRepository()
    });

    const response = await app.inject({
      method: 'GET',
      url: '/novels/not-exists',
      headers: {
        'x-request-id': 'missing-novel'
      }
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), {
      success: false,
      data: null,
      error: {
        code: 'NOT_FOUND',
        message: '小说不存在'
      },
      requestId: 'missing-novel'
    });

    await app.close();
  });
});

describe('novel package 2 direction routes', () => {
  it('generates direction candidates once and keeps them as candidates', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T11:00:00.000Z')
    });
    const novelId = await createDraft(app, '方向生成互斥测试');

    const generateResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/directions/generate`,
      headers: { 'x-request-id': 'direction-generate-1' },
      payload: {}
    });

    assert.equal(generateResponse.statusCode, 200);
    const generated = generateResponse.json();
    assert.equal(generated.success, true);
    assert.equal(generated.requestId, 'direction-generate-1');
    assert.equal(generated.data.novelId, novelId);
    assert.equal(generated.data.task.taskType, 'novel_direction_generate');
    assert.equal(generated.data.task.status, 'waiting_confirmation');
    assert.ok(generated.data.candidates.length >= 3);
    assert.ok(generated.data.candidates.length <= 5);
    assert.equal(generated.data.candidates[0].status, 'candidate');
    assert.equal(generated.data.statusSummary.creationStage, 'direction');
    assert.equal(generated.data.statusSummary.stageStatus, 'waiting_user');
    assert.equal(generated.data.statusSummary.displayStatusText, '待选择方向');

    const repeatedResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/directions/generate`,
      payload: {}
    });
    assert.equal(repeatedResponse.statusCode, 200);
    const repeated = repeatedResponse.json();
    assert.notEqual(repeated.data.task.id, generated.data.task.id);
    assert.equal((repository as any).getCreativeVersions().filter((version: any) => version.objectType === 'direction').length, generated.data.candidates.length * 2);
    assert.equal((repository as any).getGenerationTasks().filter((task: any) => task.taskType === 'novel_direction_generate').length, 2);

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}`
    });
    const detail = detailResponse.json();
    assert.equal(detail.data.currentAssets.direction, null);
    assert.equal(detail.data.directionCandidates.length, (repository as any).getCreativeVersions().filter((version: any) => version.objectType === 'direction').length);
    assert.equal(detail.data.statusSummary.recommendedAction.label, '选择方向');

    await app.close();
  });

  it('fuses and optimizes direction candidates without adopting them', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T11:10:00.000Z')
    });
    const novelId = await createDraft(app, '方向融合优化测试');
    const generated = await generateDirections(app, novelId);
    const sourceIds = generated.candidates.slice(0, 2).map((candidate: any) => candidate.id);

    const fuseResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/directions/fuse`,
      payload: {
        versionIds: sourceIds,
        reason: '融合开篇钩子和视频化表达'
      }
    });
    assert.equal(fuseResponse.statusCode, 200);
    const fused = fuseResponse.json();
    assert.equal(fused.data.task.taskType, 'novel_direction_fuse');
    assert.equal(fused.data.candidate.status, 'candidate');
    assert.equal(fused.data.currentDirection, null);

    const optimizeResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/directions/${sourceIds[0]}/optimize`,
      payload: {
        instruction: '强化前三秒短视频钩子'
      }
    });
    assert.equal(optimizeResponse.statusCode, 200);
    const optimized = optimizeResponse.json();
    assert.equal(optimized.data.task.taskType, 'novel_direction_optimize');
    assert.equal(optimized.data.candidate.status, 'candidate');
    assert.equal(optimized.data.currentDirection, null);

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}`
    });
    const detail = detailResponse.json();
    assert.equal(detail.data.currentAssets.direction, null);
    assert.ok(detail.data.directionCandidates.length >= generated.candidates.length + 2);

    await app.close();
  });

  it('saves a manually edited direction as a new candidate without adopting it', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T11:11:00.000Z')
    });
    const novelId = await createDraft(app, '方向手动编辑测试');
    const generated = await generateDirections(app, novelId);
    const source = generated.candidates[0];

    const editResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/directions/${source.id}/edit`,
      payload: {
        title: '手动编辑后的重生商战方向',
        logline: '重生学渣靠记忆优势打穿考场和商场。',
        coreHook: '上一世被学历和眼界困住，这一次他先从高考翻盘。',
        audienceAppeal: '喜欢重生逆袭、商战打脸的短视频爽文读者。',
        videoPotential: '前三秒用高考考场反差切入，后续接商战逆袭。',
        sellingPoints: ['高考封神', '商战复仇', '记忆优势'],
        riskTags: ['避免系统万能'],
        recommendation: '保留重生爽点，强化短视频开场。',
        reason: '验收手动编辑候选'
      }
    });
    assert.equal(editResponse.statusCode, 200);
    const edited = editResponse.json();
    assert.equal(edited.data.task.taskType, 'novel_direction_manual_edit');
    assert.equal(edited.data.candidate.title, '手动编辑后的重生商战方向');
    assert.equal(edited.data.candidate.status, 'candidate');
    assert.equal(edited.data.currentDirection, null);

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}`
    });
    const detail = detailResponse.json();
    assert.equal(detail.data.currentAssets.direction, null);
    assert.ok(detail.data.directionCandidates.some((candidate: any) => candidate.id === edited.data.candidate.id));
    assert.ok(detail.data.directionCandidates.some((candidate: any) => candidate.id === source.id));

    await app.close();
  });

  it('adopts a direction, writes decision records, and advances to setting', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T11:20:00.000Z')
    });
    const novelId = await createDraft(app, '方向采用测试');
    const generated = await generateDirections(app, novelId);
    const candidate = generated.candidates.find((item: any) => item.score >= 75);

    const adoptResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/directions/${candidate.id}/adopt`,
      headers: { 'x-request-id': 'adopt-direction-1' },
      payload: {
        reason: '方向评分高，适合作为设定输入。',
        pageVersionSnapshot: {
          seenCandidateVersionId: candidate.id
        }
      }
    });

    assert.equal(adoptResponse.statusCode, 200);
    const adopted = adoptResponse.json();
    assert.equal(adopted.success, true);
    assert.equal(adopted.data.currentDirection.id, candidate.id);
    assert.equal(adopted.data.currentDirection.status, 'current');
    assert.equal(adopted.data.statusSummary.creationStage, 'setting');
    assert.equal(adopted.data.statusSummary.stageStatus, 'not_started');
    assert.equal(adopted.data.statusSummary.displayStatusText, '待生成设定');
    assert.equal(adopted.data.nextAction.label, '生成设定');

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}`
    });
    const detail = detailResponse.json();
    assert.equal(detail.data.currentAssets.direction.id, candidate.id);
    assert.equal(detail.data.creationStage, 'setting');
    assert.ok(detail.data.directionCandidates.every((item: any) => item.id === candidate.id || item.status === 'historical'));

    const decision = (repository as any).getAssetDecisionRecords()[0];
    assert.equal(decision.actionType, 'adopt_direction');
    assert.equal(decision.candidateVersionId, candidate.id);
    assert.equal(decision.decisionReason, '方向评分高，适合作为设定输入。');
    assert.equal(decision.isForced, false);
    assert.equal(repository.getOperationLogs()[0]?.action, 'adopt_direction');

    await app.close();
  });

  it('requires confirmation and reason when adopting a low score direction', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T11:30:00.000Z')
    });
    const novelId = await createDraft(app, '低分方向采用测试');
    const generated = await generateDirections(app, novelId);
    const lowScoreCandidate = generated.candidates.find((item: any) => item.score < 70);

    const blockedResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/directions/${lowScoreCandidate.id}/adopt`,
      payload: {
        reason: '想先验证差异化表达。'
      }
    });
    assert.equal(blockedResponse.statusCode, 409);
    assert.equal(blockedResponse.json().error.code, 'GATE_BLOCKED');

    const missingReasonResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/directions/${lowScoreCandidate.id}/adopt`,
      payload: {
        confirmLowScore: true
      }
    });
    assert.equal(missingReasonResponse.statusCode, 409);
    assert.equal(missingReasonResponse.json().error.code, 'GATE_BLOCKED');

    const adoptResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/directions/${lowScoreCandidate.id}/adopt`,
      payload: {
        confirmLowScore: true,
        reason: '低分但题材差异化明显，先采用做设定验证。'
      }
    });
    assert.equal(adoptResponse.statusCode, 200);
    assert.equal(adoptResponse.json().data.currentDirection.id, lowScoreCandidate.id);

    const decision = (repository as any).getAssetDecisionRecords()[0];
    assert.equal(decision.isForced, true);
    assert.equal(decision.decisionReason, '低分但题材差异化明显，先采用做设定验证。');
    assert.equal(repository.getOperationLogs()[0]?.reason, '低分但题材差异化明显，先采用做设定验证。');

    await app.close();
  });
});

describe('novel package 3 structure routes', () => {
  it('blocks setting generation before a direction is adopted', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T12:00:00.000Z')
    });
    const novelId = await createDraft(app, '无方向生成设定阻塞测试');

    const response = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/settings/generate`,
      headers: { 'x-request-id': 'setting-gate-1' },
      payload: {}
    });

    assert.equal(response.statusCode, 409);
    const body = response.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'GATE_BLOCKED');
    assert.equal(body.requestId, 'setting-gate-1');

    await app.close();
  });

  it('runs setting, outline, stage outline, and chapter plan adoption without generating body text', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T12:10:00.000Z')
    });
    const { novelId } = await createNovelWithAdoptedDirection(app);

    const settingGenerated = await postStructure(app, novelId, 'settings', 'generate');
    assert.equal(settingGenerated.task.taskType, 'novel_setting_generate');
    assert.equal(settingGenerated.candidate.objectType, 'setting');
    assert.equal(settingGenerated.candidate.status, 'candidate');
    assert.equal(settingGenerated.currentAssets.setting, null);
    assert.equal(settingGenerated.statusSummary.creationStage, 'setting');
    assert.equal(settingGenerated.statusSummary.stageStatus, 'waiting_user');
    assert.equal(settingGenerated.statusSummary.displayStatusText, '待确认设定');

    const settingAdopted = await postStructure(app, novelId, 'settings', 'adopt', settingGenerated.candidate.id, {
      reason: '设定完整，采用为全书大纲输入。'
    });
    assert.equal(settingAdopted.currentAssets.setting.id, settingGenerated.candidate.id);
    assert.equal(settingAdopted.currentAssets.setting.status, 'current');
    assert.equal(settingAdopted.statusSummary.creationStage, 'outline');
    assert.equal(settingAdopted.statusSummary.displayStatusText, '待生成全书大纲');
    assert.equal(settingAdopted.nextAction.label, '生成全书大纲');

    const outlineGenerated = await postStructure(app, novelId, 'outlines', 'generate');
    assert.equal(outlineGenerated.task.taskType, 'novel_outline_generate');
    assert.equal(outlineGenerated.candidate.objectType, 'outline');
    assert.equal(outlineGenerated.statusSummary.displayStatusText, '待确认全书大纲');

    const outlineAdopted = await postStructure(app, novelId, 'outlines', 'adopt', outlineGenerated.candidate.id, {
      reason: '全书主线清晰，采用后进入阶段大纲。'
    });
    assert.equal(outlineAdopted.currentAssets.outline.id, outlineGenerated.candidate.id);
    assert.equal(outlineAdopted.statusSummary.creationStage, 'outline');
    assert.equal(outlineAdopted.statusSummary.displayStatusText, '待生成阶段大纲');
    assert.equal(outlineAdopted.nextAction.label, '生成阶段大纲');

    const stageOutlineGenerated = await postStructure(app, novelId, 'stage-outlines', 'generate');
    assert.equal(stageOutlineGenerated.task.taskType, 'stage_outline_generate');
    assert.equal(stageOutlineGenerated.candidate.objectType, 'stage_outline');
    assert.equal(stageOutlineGenerated.statusSummary.displayStatusText, '待确认阶段大纲');

    const stageOutlineAdopted = await postStructure(app, novelId, 'stage-outlines', 'adopt', stageOutlineGenerated.candidate.id, {
      reason: '阶段拆分能支撑章节目录。'
    });
    assert.equal(stageOutlineAdopted.currentAssets.stageOutline.id, stageOutlineGenerated.candidate.id);
    assert.equal(stageOutlineAdopted.statusSummary.creationStage, 'chapter_plan');
    assert.equal(stageOutlineAdopted.statusSummary.displayStatusText, '待生成章节目录');

    const chapterPlanGenerated = await postStructure(app, novelId, 'chapter-plans', 'generate');
    assert.equal(chapterPlanGenerated.task.taskType, 'chapter_plan_generate');
    assert.equal(chapterPlanGenerated.candidate.objectType, 'chapter_plan');
    assert.equal(chapterPlanGenerated.candidate.content.chapters.length, 80);
    assert.equal(chapterPlanGenerated.statusSummary.displayStatusText, '待确认章节目录');

    const chapterPlanAdopted = await postStructure(app, novelId, 'chapter-plans', 'adopt', chapterPlanGenerated.candidate.id, {
      reason: '章节目录完整，进入试写前置状态。'
    });
    assert.equal(chapterPlanAdopted.currentAssets.chapterPlan.id, chapterPlanGenerated.candidate.id);
    assert.equal(chapterPlanAdopted.statusSummary.creationStage, 'trial');
    assert.equal(chapterPlanAdopted.statusSummary.stageStatus, 'not_started');
    assert.equal(chapterPlanAdopted.statusSummary.displayStatusText, '待生成试写');
    assert.equal(chapterPlanAdopted.chapters.length, 80);
    assert.equal(chapterPlanAdopted.chapters[0].mainStatus, 'pending');
    assert.equal(chapterPlanAdopted.chapters[0].wordCount, 0);

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}`
    });
    assert.equal(detailResponse.statusCode, 200);
    const detail = detailResponse.json().data;
    assert.equal(detail.currentAssets.setting.id, settingGenerated.candidate.id);
    assert.equal(detail.currentAssets.outline.id, outlineGenerated.candidate.id);
    assert.equal(detail.currentAssets.stageOutline.id, stageOutlineGenerated.candidate.id);
    assert.equal(detail.currentAssets.chapterPlan.id, chapterPlanGenerated.candidate.id);
    assert.equal(detail.chapters.length, 80);
    assert.equal(detail.chapters.every((chapter: any) => chapter.currentContentVersionId === null), true);

    const actionTypes = (repository as any).getAssetDecisionRecords().map((record: any) => record.actionType);
    assert.ok(actionTypes.includes('adopt_setting'));
    assert.ok(actionTypes.includes('adopt_outline'));
    assert.ok(actionTypes.includes('adopt_stage_outline'));
    assert.ok(actionTypes.includes('adopt_chapter_plan'));

    await app.close();
  });

  it('blocks a second setting generation while the first model call is still running', async () => {
    const repository = createInMemoryNovelRepository();
    let releaseFirstStructureCall: (() => void) | null = null;
    let firstStructureCallStarted: (() => void) | null = null;
    const firstStructureCallStartedPromise = new Promise<void>((resolve) => {
      firstStructureCallStarted = resolve;
    });
    let structureCallCount = 0;
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      aiProviderEnv: {
        AI_PROVIDER_MODE: 'deepseek',
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://example.test/v1',
        DEEPSEEK_MODEL: 'deepseek-chat',
        DEEPSEEK_REASONER_MODEL: 'deepseek-reasoner'
      },
      llmClient: {
        async chat(request) {
          if (request.taskName === 'novel_structure_setting') {
            structureCallCount += 1;
            if (structureCallCount === 1) {
              firstStructureCallStarted?.();
              await new Promise<void>((resolve) => {
                releaseFirstStructureCall = resolve;
              });
            }
          }

          return {
            content: JSON.stringify(createFakeDeepSeekPayload(request.taskName ?? 'unknown_task')),
            model: request.model,
            usage: {
              promptTokens: 24,
              completionTokens: 48,
              totalTokens: 72
            }
          };
        }
      },
      now: () => new Date('2026-06-17T12:12:00.000Z')
    });
    const { novelId } = await createNovelWithAdoptedDirection(app);

    const firstRequest = app.inject({
      method: 'POST',
      url: `/novels/${novelId}/settings/generate`,
      headers: { 'x-request-id': 'setting-concurrent-1' },
      payload: {}
    });
    await firstStructureCallStartedPromise;

    const secondResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/settings/generate`,
      headers: { 'x-request-id': 'setting-concurrent-2' },
      payload: {}
    });

    assert.equal(secondResponse.statusCode, 409);
    const secondBody = secondResponse.json();
    assert.equal(secondBody.success, false);
    assert.equal(secondBody.error.code, 'CONFLICT_TASK_EXISTS');
    assert.equal(structureCallCount, 1);
    const activeTasks = repository.getGenerationTasks().filter((task) =>
      task.conflictScope === 'novel_setting' &&
      task.conflictKey === novelId &&
      [TaskStatus.Processing, TaskStatus.WaitingConfirmation].includes(task.status)
    );
    assert.equal(activeTasks.length, 1);

    releaseFirstStructureCall?.();
    const firstResponse = await firstRequest;
    assert.equal(firstResponse.statusCode, 200);
    assert.equal(firstResponse.json().data.candidate.objectType, 'setting');

    await app.close();
  });

  it('keeps a cancelled structure generation from saving a late model result', async () => {
    const repository = createInMemoryNovelRepository();
    let releaseFirstStructureCall: (() => void) | null = null;
    let firstStructureCallStarted: (() => void) | null = null;
    const firstStructureCallStartedPromise = new Promise<void>((resolve) => {
      firstStructureCallStarted = resolve;
    });
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      aiProviderEnv: {
        AI_PROVIDER_MODE: 'deepseek',
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://example.test/v1',
        DEEPSEEK_MODEL: 'deepseek-chat',
        DEEPSEEK_REASONER_MODEL: 'deepseek-reasoner'
      },
      llmClient: {
        async chat(request) {
          if (request.taskName === 'novel_structure_setting') {
            firstStructureCallStarted?.();
            await new Promise<void>((resolve) => {
              releaseFirstStructureCall = resolve;
            });
          }

          return {
            content: JSON.stringify(createFakeDeepSeekPayload(request.taskName ?? 'unknown_task')),
            model: request.model,
            usage: {
              promptTokens: 24,
              completionTokens: 48,
              totalTokens: 72
            }
          };
        }
      },
      now: () => new Date('2026-06-17T12:16:00.000Z')
    });
    const { novelId } = await createNovelWithAdoptedDirection(app);

    const firstRequest = app.inject({
      method: 'POST',
      url: `/novels/${novelId}/settings/generate`,
      headers: { 'x-request-id': 'setting-cancel-late-1' },
      payload: {}
    });
    await firstStructureCallStartedPromise;
    const activeTask = repository.getGenerationTasks().find((task) =>
      task.conflictScope === 'novel_setting' &&
      task.conflictKey === novelId &&
      task.status === TaskStatus.Processing
    );
    assert.ok(activeTask);

    const cancelResponse = await app.inject({
      method: 'POST',
      url: `/tasks/${activeTask.id}/cancel`,
      headers: { 'x-request-id': 'setting-cancel-late-2' },
      payload: {
        reason: '用户取消等待，准备重新生成'
      }
    });
    assert.equal(cancelResponse.statusCode, 200);

    releaseFirstStructureCall?.();
    const firstResponse = await firstRequest;
    assert.equal(firstResponse.statusCode, 409);
    assert.equal(firstResponse.json().error.code, 'GATE_BLOCKED');
    const storedTask = repository.getGenerationTasks().find((task) => task.id === activeTask.id);
    assert.equal(storedTask?.status, TaskStatus.Cancelled);
    assert.equal(
      repository.getCreativeVersions().some((version) => version.novelId === novelId && version.objectType === 'setting' && version.status === 'candidate'),
      false
    );

    await app.close();
  });

  it('marks downstream candidates stale after re-adopting an upstream asset', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T12:20:00.000Z')
    });
    const { novelId } = await createNovelWithAdoptedDirection(app);

    const firstSetting = await postStructure(app, novelId, 'settings', 'generate');
    await postStructure(app, novelId, 'settings', 'adopt', firstSetting.candidate.id, {
      reason: '先采用第一版设定。'
    });
    const outline = await postStructure(app, novelId, 'outlines', 'generate');

    const secondSetting = await postStructure(app, novelId, 'settings', 'generate');
    await postStructure(app, novelId, 'settings', 'adopt', secondSetting.candidate.id, {
      reason: '重新采用设定，刷新后续大纲依据。'
    });

    const staleOutline = (repository as any).getCreativeVersions().find((version: any) => version.id === outline.candidate.id);
    assert.equal(staleOutline.status, 'stale');
    assert.equal(staleOutline.staleLevel, 'hard_stale');

    const blockedAdopt = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/outlines/${outline.candidate.id}/adopt`,
      payload: {
        reason: '尝试采用已过期大纲。'
      }
    });
    assert.equal(blockedAdopt.statusCode, 409);
    assert.equal(blockedAdopt.json().error.code, 'CANDIDATE_STALE');

    await app.close();
  });
});

describe('novel package 4 task center routes', () => {
  it('returns task detail and progress events for generation tasks', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T13:00:00.000Z')
    });
    const novelId = await createDraft(app, '任务详情测试');

    const generateResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/directions/generate`,
      headers: { 'x-request-id': 'task-generate-1' },
      payload: {}
    });
    const taskId = generateResponse.json().data.task.id;

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/tasks/${taskId}`,
      headers: { 'x-request-id': 'task-detail-1' }
    });
    assert.equal(detailResponse.statusCode, 200);
    const detail = detailResponse.json();
    assert.equal(detail.success, true);
    assert.equal(detail.data.id, taskId);
    assert.equal(detail.data.status, 'waiting_confirmation');
    assert.equal(detail.data.progress, 100);
    assert.equal(detail.data.trace.taskId, taskId);
    assert.equal(detail.data.trace.requestId, 'task-generate-1');
    assert.equal(detail.data.retryable, false);
    assert.equal(detail.data.userFailureReason, null);
    assert.equal(detail.data.nextAction.label, '查看候选结果');

    const eventsResponse = await app.inject({
      method: 'GET',
      url: `/tasks/${taskId}/events`
    });
    assert.equal(eventsResponse.statusCode, 200);
    const events = eventsResponse.json().data.items;
    assert.ok(events.length >= 3);
    assert.deepEqual(
      events.map((event: any) => event.eventType).slice(0, 3),
      ['task_claimed', 'preparing_context', 'calling_model']
    );
    assert.equal(events.at(-1).requestId, 'task-generate-1');

    await app.close();
  });

  it('retries failed tasks by creating a new task and preserving the failed task', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T13:10:00.000Z')
    });
    const novelId = await createDraft(app, '失败重试测试');
    const generated = await generateDirections(app, novelId);
    const failedTask = repository.getGenerationTasks().find((task) => task.id === generated.task.id)!;
    Object.assign(failedTask, {
      status: 'failed',
      progress: 45,
      currentStep: 'mock provider 结构化输出失败',
      failureCategory: 'provider_error',
      errorCode: 'MOCK_PROVIDER_TIMEOUT',
      errorMessage: '生成服务暂时没有响应，请稍后重试。',
      updatedAt: new Date('2026-06-17T13:11:00.000Z')
    });

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/tasks/${failedTask.id}`
    });
    assert.equal(detailResponse.statusCode, 200);
    assert.equal(detailResponse.json().data.status, 'failed');
    assert.equal(detailResponse.json().data.retryable, true);
    assert.equal(detailResponse.json().data.userFailureReason, '生成服务暂时没有响应，请稍后重试。');
    assert.equal(detailResponse.json().data.nextAction.label, '重试任务');

    const retryResponse = await app.inject({
      method: 'POST',
      url: `/tasks/${failedTask.id}/retry`,
      headers: { 'x-request-id': 'retry-task-1' },
      payload: {
        reason: '网络恢复后重试'
      }
    });
    assert.equal(retryResponse.statusCode, 200);
    const retried = retryResponse.json().data;
    assert.notEqual(retried.newTask.id, failedTask.id);
    assert.equal(retried.originalTask.id, failedTask.id);
    assert.equal(retried.originalTask.status, 'failed');
    assert.equal(retried.newTask.status, 'queued');
    assert.equal(retried.newTask.retryOfTaskId, failedTask.id);
    assert.equal(repository.getGenerationTasks().filter((task) => (task as any).retryOfTaskId === failedTask.id).length, 1);

    await app.close();
  });

  it('cancels active tasks without adopting generated assets', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T13:20:00.000Z')
    });
    const novelId = await createDraft(app, '取消任务测试');
    const generated = await generateDirections(app, novelId);
    const activeTask = repository.getGenerationTasks().find((task) => task.id === generated.task.id)!;
    activeTask.status = 'processing' as any;
    activeTask.progress = 60;
    activeTask.currentStep = 'mock provider 正在生成方向';

    const cancelResponse = await app.inject({
      method: 'POST',
      url: `/tasks/${activeTask.id}/cancel`,
      headers: { 'x-request-id': 'cancel-task-1' },
      payload: {
        reason: '用户主动取消本次生成'
      }
    });
    assert.equal(cancelResponse.statusCode, 200);
    const cancelled = cancelResponse.json().data.task;
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.cancelReason, '用户主动取消本次生成');
    assert.equal(cancelled.nextAction.label, '重新生成');

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}`
    });
    assert.equal(detailResponse.json().data.currentAssets.direction, null);
    assert.equal(repository.getOperationLogs()[0]?.action, 'cancel_generation_task');

    await app.close();
  });

  it('blocks conflicting generation tasks with a unified error', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T13:30:00.000Z')
    });
    const { novelId } = await createNovelWithAdoptedDirection(app);

    const firstResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/settings/generate`,
      payload: {}
    });
    assert.equal(firstResponse.statusCode, 200);
    const activeTaskId = firstResponse.json().data.task.id;
    const activeTask = repository.getGenerationTasks().find((task) => task.id === activeTaskId)!;
    activeTask.status = TaskStatus.Processing;
    activeTask.progress = 45;
    activeTask.activeClaimKey = hashCanonicalJson({ conflictScope: activeTask.conflictScope, conflictKey: activeTask.conflictKey });

    const conflictResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/settings/generate`,
      headers: { 'x-request-id': 'conflict-task-1' },
      payload: {}
    });
    assert.equal(conflictResponse.statusCode, 409);
    const conflict = conflictResponse.json();
    assert.equal(conflict.success, false);
    assert.equal(conflict.error.code, 'CONFLICT_TASK_EXISTS');
    assert.equal(conflict.error.details.activeTaskId, activeTaskId);
    assert.equal(conflict.requestId, 'conflict-task-1');

    await app.close();
  });

  it('allows generating another structure candidate while an earlier one waits for confirmation', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T13:35:00.000Z')
    });
    const { novelId } = await createNovelWithAdoptedDirection(app);

    const firstResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/settings/generate`,
      payload: {}
    });
    assert.equal(firstResponse.statusCode, 200);
    assert.equal(firstResponse.json().data.task.status, 'waiting_confirmation');

    const optimizeResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/settings/generate`,
      headers: { 'x-request-id': 'optimize-setting-candidate-1' },
      payload: {
        instruction: '继续优化这个候选，强化人物关系和短视频冲突。'
      }
    });
    assert.equal(optimizeResponse.statusCode, 200);
    const optimized = optimizeResponse.json();
    assert.notEqual(optimized.data.task.id, firstResponse.json().data.task.id);
    assert.equal(optimized.requestId, 'optimize-setting-candidate-1');
    assert.equal(repository.getGenerationTasks().filter((task) => task.taskType === 'novel_setting_generate').length, 2);

    await app.close();
  });

  it('does not retry stale tasks after upstream source versions changed', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T13:40:00.000Z')
    });
    const { novelId } = await createNovelWithAdoptedDirection(app);

    const firstSetting = await postStructure(app, novelId, 'settings', 'generate');
    await postStructure(app, novelId, 'settings', 'adopt', firstSetting.candidate.id, {
      reason: '先采用设定。'
    });
    const outline = await postStructure(app, novelId, 'outlines', 'generate');
    const failedOutlineTask = repository.getGenerationTasks().find((task) => task.id === outline.task.id)!;
    Object.assign(failedOutlineTask, {
      status: 'failed',
      failureCategory: 'provider_error',
      errorCode: 'MOCK_PROVIDER_TIMEOUT',
      errorMessage: '生成服务暂时没有响应，请稍后重试。'
    });

    const secondSetting = await postStructure(app, novelId, 'settings', 'generate');
    await postStructure(app, novelId, 'settings', 'adopt', secondSetting.candidate.id, {
      reason: '重新采用设定，旧大纲任务应过期。'
    });

    const staleDetailResponse = await app.inject({
      method: 'GET',
      url: `/tasks/${failedOutlineTask.id}`
    });
    assert.equal(staleDetailResponse.statusCode, 200);
    const staleDetail = staleDetailResponse.json().data;
    assert.equal(staleDetail.retryable, false);
    assert.equal(staleDetail.nextAction.label, '重新生成');
    assert.equal(staleDetail.nextAction.type, 'regenerate');
    assert.equal(staleDetail.userFailureReason, '上游内容已经变化，旧任务不能直接重试，请基于最新版本重新生成。');

    const retryResponse = await app.inject({
      method: 'POST',
      url: `/tasks/${failedOutlineTask.id}/retry`,
      payload: {
        reason: '尝试重试旧大纲任务'
      }
    });
    assert.equal(retryResponse.statusCode, 409);
    assert.equal(retryResponse.json().error.code, 'CANDIDATE_STALE');
    assert.equal(repository.getGenerationTasks().filter((task) => (task as any).retryOfTaskId === failedOutlineTask.id).length, 0);

    await app.close();
  });
});

describe('novel package 5 trial writing routes', () => {
  it('blocks trial generation before chapter plan is adopted', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T14:00:00.000Z')
    });
    const novelId = await createDraft(app, '未确认章节目录试写阻塞测试');

    const response = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/trial/generate`,
      headers: { 'x-request-id': 'trial-gate-1' },
      payload: {}
    });

    assert.equal(response.statusCode, 409);
    assert.equal(response.json().success, false);
    assert.equal(response.json().error.code, 'GATE_BLOCKED');
    assert.equal(response.json().requestId, 'trial-gate-1');

    await app.close();
  });

  it('generates three chapter one candidates without auto-selecting one', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T14:10:00.000Z')
    });
    const { novelId } = await createNovelReadyForTrial(app);

    const response = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/trial/generate`,
      headers: { 'x-request-id': 'trial-generate-1' },
      payload: {}
    });

    assert.equal(response.statusCode, 200);
    const generated = response.json().data;
    assert.equal(generated.novelId, novelId);
    assert.equal(generated.task.taskType, 'trial_writing_generate');
    assert.equal(generated.task.status, 'waiting_confirmation');
    assert.equal(generated.trialRun.status, 'waiting_chapter1_selection');
    assert.equal(generated.trialRun.chapterCount, 3);
    assert.equal(generated.trialRun.chapterOneCandidates.length, 3);
    assert.equal(generated.trialRun.chapterOneCandidates.filter((candidate: any) => candidate.isAiRecommended).length, 1);
    assert.equal(generated.trialRun.chapterOneCandidates.some((candidate: any) => candidate.isSelected), false);

    const firstCandidate = generated.trialRun.chapterOneCandidates[0];
    assert.equal(firstCandidate.chapterNo, 1);
    assert.ok(firstCandidate.content.length > 300);
    assert.ok(firstCandidate.openingHighlight.length > 0);
    assert.ok(firstCandidate.firstSentence.length > 0);
    assert.ok(firstCandidate.first300Summary.length > 0);
    assert.ok(firstCandidate.endingHook.length > 0);
    assert.equal(firstCandidate.scoring.scoringStrategyVersion, 'trial-opening-score-v1');
    assert.ok(firstCandidate.scoring.dimensions.length >= 5);
    assert.ok(firstCandidate.scoring.evidence.length > 0);
    assert.ok(Array.isArray(firstCandidate.scoring.penalties));
    assert.ok(['pass', 'warning', 'hard_fail'].includes(firstCandidate.scoring.gateResult));
    assert.equal(generated.statusSummary.creationStage, 'trial');
    assert.equal(generated.statusSummary.stageStatus, 'waiting_user');
    assert.equal(generated.nextAction.label, '选择第1章候选');

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}`
    });
    const detail = detailResponse.json().data;
    assert.equal(detail.latestTrialRun.id, generated.trialRun.id);
    assert.equal(detail.latestTrialRun.chapterOneCandidates.length, 3);
    assert.equal(detail.chapters[0].currentContentVersionId, null);

    await app.close();
  });

  it('requires chapter one selection before generating chapters two and three', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T14:20:00.000Z')
    });
    const { novelId } = await createNovelReadyForTrial(app);
    const firstStep = await postTrialGenerate(app, novelId);

    const blockedResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/trial/generate`,
      payload: {
        trialRunId: firstStep.trialRun.id
      }
    });
    assert.equal(blockedResponse.statusCode, 409);
    assert.equal(blockedResponse.json().error.code, 'GATE_BLOCKED');

    await app.close();
  });

  it('selects a chapter one candidate, generates follow-up trial chapters, and exposes chapter workbench data', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T14:30:00.000Z')
    });
    const { novelId } = await createNovelReadyForTrial(app);
    const firstStep = await postTrialGenerate(app, novelId);
    const selectedCandidate = firstStep.trialRun.chapterOneCandidates.find((candidate: any) => candidate.isAiRecommended);

    const followupResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/trial/generate`,
      headers: { 'x-request-id': 'trial-followup-1' },
      payload: {
        trialRunId: firstStep.trialRun.id,
        selectedCandidateId: selectedCandidate.id
      }
    });

    assert.equal(followupResponse.statusCode, 200);
    const followup = followupResponse.json().data;
    assert.equal(followup.trialRun.selectedChapterOneCandidateId, selectedCandidate.id);
    assert.equal(followup.trialRun.chapterOneCandidates.find((candidate: any) => candidate.id === selectedCandidate.id).status, 'selected_for_trial');
    assert.equal(followup.trialRun.chapterOneCandidates.filter((candidate: any) => candidate.status === 'historical').length, 2);
    assert.equal(followup.trialRun.chapterResults.length, 3);
    assert.equal(followup.trialRun.chapterResults[1].chapterNo, 2);
    assert.equal(followup.trialRun.chapterResults[1].featureCard.coreTask.length > 0, true);
    assert.ok(followup.trialRun.chapterResults[1].reviewReport.issues.length >= 1);
    assert.equal(followup.trialRun.trialReview.scoringStrategyVersion, 'trial-summary-score-v1');
    assert.equal(followup.trialRun.trialReview.allowNextStep, true);
    assert.equal(followup.statusSummary.displayStatusText, '试写总评待确认');

    const chapterId = followup.trialRun.chapterResults[0].chapterId;
    const workbenchResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}/chapters/${chapterId}`
    });
    assert.equal(workbenchResponse.statusCode, 200);
    const workbench = workbenchResponse.json().data;
    assert.equal(workbench.chapter.id, chapterId);
    assert.equal(workbench.currentContent.id, selectedCandidate.id);
    assert.equal(workbench.featureCard.chapterId, chapterId);
    assert.ok(workbench.reviewIssues.length >= 1);
    assert.equal(workbench.candidateVersions.length, 3);
    assert.equal(workbench.recommendedAction.label, '查看试写总评');

    assert.ok(repository.getOperationLogs().some((log) => log.action === 'select_trial_chapter1_candidate'));

    await app.close();
  });

  it('requires explicit safe confirmation before high-risk trial follow-up without side effects', async () => {
    const repository = createInMemoryNovelRepository();
    const logSink = createMemoryLogSink();
    let followupProviderCalls = 0;
    const app = await buildApp({
      logger: { level: 'info', stream: logSink } as any,
      novelRepository: repository,
      aiProviderEnv: {
        AI_PROVIDER_MODE: 'deepseek',
        DEEPSEEK_API_KEY: 'test-deepseek-key-should-not-leak',
        DEEPSEEK_MODEL: 'deepseek-fake-chat',
        DEEPSEEK_REASONER_MODEL: 'deepseek-fake-reasoner'
      },
      llmClient: {
        async chat(request) {
          if (request.taskName === 'novel_trial_followup') followupProviderCalls += 1;
          return {
            content: JSON.stringify(createFakeDeepSeekPayload(request.taskName ?? 'unknown_task')),
            model: request.model,
            usage: { promptTokens: 24, completionTokens: 48, totalTokens: 72 }
          };
        }
      },
      now: () => new Date('2026-06-17T14:35:00.000Z')
    });
    const { novelId } = await createNovelReadyForTrial(app, '高风险试写确认透传测试', 5);
    const firstStep = await postTrialGenerate(app, novelId);
    const riskyCandidate = firstStep.trialRun.chapterOneCandidates[0];
    const storedCandidate = repository.getChapterContentVersions().find((version) => version.id === riskyCandidate.id);
    assert.ok(storedCandidate);
    const before = captureTrialFollowupSideEffects(repository, novelId);

    const secretCanaries = [
      { name: 'api-key', value: 'api_key=should-not-leak-api-key' },
      { name: 'authorization-bearer', value: 'Authorization: Bearer should-not-leak-authorization-bearer' },
      { name: 'cookie', value: 'Cookie: session=should-not-leak-cookie' },
      { name: 'token', value: 'token=should-not-leak-token' }
    ];
    const negativeCases = [
      {
        name: 'missing-confirm',
        expectedStatus: 409,
        expectedCode: ErrorCode.GateBlocked,
        payload: {}
      },
      {
        name: 'blank-reason',
        expectedStatus: 409,
        expectedCode: ErrorCode.GateBlocked,
        payload: { confirmRisk: true, selectionReason: '   ' }
      },
      ...secretCanaries.map((canary) => ({
        name: `secret-${canary.name}`,
        expectedStatus: 400,
        expectedCode: ErrorCode.ValidationError,
        payload: { confirmRisk: true, selectionReason: canary.value },
        canary: canary.value
      }))
    ];

    for (const riskLevel of [RiskLevel.High, RiskLevel.Blocking]) {
      storedCandidate.metadata = { ...(storedCandidate.metadata as Record<string, unknown>), riskLevel };

      for (const testCase of negativeCases) {
        const response = await app.inject({
          method: 'POST',
          url: `/novels/${novelId}/trial/generate`,
          headers: { 'x-request-id': `risk-selection-${riskLevel}-${testCase.name}` },
          payload: {
            trialRunId: firstStep.trialRun.id,
            selectedCandidateId: riskyCandidate.id,
            idempotencyKey: `risk-selection-${riskLevel}-${testCase.name}`,
            ...testCase.payload
          }
        });
        assert.equal(response.statusCode, testCase.expectedStatus, `${riskLevel}/${testCase.name}`);
        assert.equal(response.json().error.code, testCase.expectedCode);
        if ('canary' in testCase) {
          assert.equal(response.body.includes(testCase.canary), false);
          assert.equal(logSink.text().includes(testCase.canary), false);
        }
        assert.deepEqual(captureTrialFollowupSideEffects(repository, novelId), before);
        assert.equal(followupProviderCalls, 0);
      }
    }

    storedCandidate.metadata = { ...(storedCandidate.metadata as Record<string, unknown>), riskLevel: RiskLevel.High };
    const repeatedMissingResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/trial/generate`,
      payload: {
        trialRunId: firstStep.trialRun.id,
        selectedCandidateId: riskyCandidate.id,
        idempotencyKey: 'risk-selection-high-missing-confirm'
      }
    });
    assert.equal(repeatedMissingResponse.statusCode, 409);
    assert.equal(repeatedMissingResponse.json().error.code, ErrorCode.GateBlocked);
    assert.deepEqual(captureTrialFollowupSideEffects(repository, novelId), before);
    assert.equal(followupProviderCalls, 0);

    const legalResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/trial/generate`,
      payload: {
        trialRunId: firstStep.trialRun.id,
        selectedCandidateId: riskyCandidate.id,
        confirmRisk: true,
        selectionReason: '人工确认该候选风险，继续生成第2-3章用于试写总评。',
        idempotencyKey: 'risk-selection-safe-1'
      }
    });
    assert.equal(legalResponse.statusCode, 200, legalResponse.body);
    assert.equal(legalResponse.json().success, true);
    assert.equal(legalResponse.json().data.trialRun.selectedChapterOneCandidateId, riskyCandidate.id);
    assert.equal(followupProviderCalls, 1);

    await app.close();
  });

  it('persists follow-up trial processing state and avoids duplicate continuation tasks while the model call is running', async () => {
    const repository = createInMemoryNovelRepository();
    const delayedClient = createDelayedFollowupFakeLlmClient();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      aiProviderEnv: {
        AI_PROVIDER_MODE: 'deepseek',
        DEEPSEEK_API_KEY: 'test-deepseek-key-should-not-leak',
        DEEPSEEK_MODEL: 'deepseek-fake-chat',
        DEEPSEEK_REASONER_MODEL: 'deepseek-fake-reasoner'
      },
      llmClient: delayedClient.client,
      now: () => new Date('2026-06-17T14:45:00.000Z')
    });
    const { novelId } = await createNovelReadyForTrial(app, '续写处理中刷新测试', 5);
    const firstStep = await postTrialGenerate(app, novelId);
    const selectedCandidate = firstStep.trialRun.chapterOneCandidates.find((candidate: any) => candidate.isAiRecommended);

    const followupPayload = {
      trialRunId: firstStep.trialRun.id,
      selectedCandidateId: selectedCandidate.id,
      idempotencyKey: 'trial-followup-replay-1'
    };
    const followupPromise = postTrialGenerate(app, novelId, followupPayload);
    await delayedClient.waitForFollowup();

    const duringResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}`
    });
    assert.equal(duringResponse.statusCode, 200);
    const during = duringResponse.json().data;
    assert.equal(during.latestTrialRun.status, 'followup_generating');
    assert.equal(during.latestTrialRun.selectedChapterOneCandidateId, selectedCandidate.id);
    assert.equal(during.latestTrialRun.task.taskType, 'trial_followup_generate');
    assert.equal(during.latestTrialRun.task.status, TaskStatus.Processing);
    assert.equal(during.statusSummary.stageStatus, 'processing');
    assert.equal(during.latestTrialRun.chapterOneCandidates.find((candidate: any) => candidate.id === selectedCandidate.id).status, 'selected_for_trial');

    const duplicateResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/trial/generate`,
      payload: followupPayload
    });
    assert.equal(duplicateResponse.statusCode, 200);
    const duplicate = duplicateResponse.json().data;
    assert.equal(duplicate.task.id, during.latestTrialRun.task.id);
    assert.equal(repository.getGenerationTasks().filter((task) => task.taskType === 'trial_followup_generate').length, 1);

    delayedClient.releaseFollowup();
    const followup = await followupPromise;
    assert.equal(followup.trialRun.status, 'review_ready');
    assert.equal(followup.task.id, during.latestTrialRun.task.id);
    assert.equal(followup.task.status, TaskStatus.WaitingConfirmation);
    assert.equal(repository.getGenerationTasks().filter((task) => task.taskType === 'trial_followup_generate').length, 1);

    const terminalReplay = await postTrialGenerate(app, novelId, followupPayload);
    assert.equal(terminalReplay.task.id, followup.task.id);
    assert.equal(repository.getGenerationTasks().filter((task) => task.taskType === 'trial_followup_generate').length, 1);
    const differentTokenResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/trial/generate`,
      payload: { ...followupPayload, idempotencyKey: 'trial-followup-new-token-2' }
    });
    assert.equal(differentTokenResponse.statusCode, 409);
    assert.equal(differentTokenResponse.json().error.code, ErrorCode.ConflictTaskExists);
    assert.equal(repository.getGenerationTasks().filter((task) => task.taskType === 'trial_followup_generate').length, 1);
    const differentCandidate = firstStep.trialRun.chapterOneCandidates.find((candidate: any) => candidate.id !== selectedCandidate.id);
    const conflictResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/trial/generate`,
      payload: { ...followupPayload, selectedCandidateId: differentCandidate.id }
    });
    assert.equal(conflictResponse.statusCode, 409);
    assert.equal(conflictResponse.json().error.code, ErrorCode.IdempotencyConflict);
    assert.doesNotMatch(conflictResponse.body, /trial-followup-replay-1/);

    await app.close();
  });

  it('blocks chapter three when chapter two has a hard failure', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T14:40:00.000Z')
    });
    const { novelId } = await createNovelReadyForTrial(app, '硬失败试写测试');
    const firstStep = await postTrialGenerate(app, novelId);
    const selectedCandidate = firstStep.trialRun.chapterOneCandidates.find((candidate: any) => candidate.isAiRecommended);

    const response = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/trial/generate`,
      payload: {
        trialRunId: firstStep.trialRun.id,
        selectedCandidateId: selectedCandidate.id
      }
    });

    assert.equal(response.statusCode, 200);
    const blocked = response.json().data;
    assert.equal(blocked.trialRun.status, 'blocked');
    assert.equal(blocked.trialRun.chapterResults.length, 2);
    assert.equal(blocked.trialRun.chapterResults.some((result: any) => result.chapterNo === 3), false);
    assert.equal(blocked.trialRun.chapterResults[1].hardFailed, true);
    assert.equal(blocked.statusSummary.stageStatus, 'blocked');
    assert.ok(blocked.trialRun.blockingReason.includes('第2章硬门槛未通过'));

    await app.close();
  });

  it('requires risk confirmation before producing a body strategy snapshot for risky trial runs', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T14:50:00.000Z')
    });
    const { novelId } = await createNovelReadyForTrial(app, '风险继续试写测试');
    const firstStep = await postTrialGenerate(app, novelId);
    const riskyCandidate = firstStep.trialRun.chapterOneCandidates.find((candidate: any) => candidate.scoring.totalScore < 75);
    const followup = await postTrialGenerate(app, novelId, {
      trialRunId: firstStep.trialRun.id,
      selectedCandidateId: riskyCandidate.id
    });
    assert.equal(followup.trialRun.trialReview.requiresRiskConfirmation, true);

    const blockedConfirm = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/trial/confirm`,
      payload: {
        trialRunId: followup.trialRun.id,
        decision: 'force_pass'
      }
    });
    assert.equal(blockedConfirm.statusCode, 409);
    assert.equal(blockedConfirm.json().error.code, 'GATE_BLOCKED');

    const confirmResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/trial/confirm`,
      headers: { 'x-request-id': 'trial-confirm-risk-1' },
      payload: {
        trialRunId: followup.trialRun.id,
        decision: 'force_pass',
        confirmRisk: true,
        reason: '开篇差异化强，接受节奏风险进入批量正文前置策略。'
      }
    });
    assert.equal(confirmResponse.statusCode, 200);
    const confirmed = confirmResponse.json().data;
    assert.equal(confirmed.statusSummary.creationStage, 'body');
    assert.equal(confirmed.task.taskType, 'trial_followup_generate');
    assert.equal(confirmed.task.status, TaskStatus.Completed);
    assert.equal(confirmed.task.currentStep, '试写已确认，正文策略快照已生成');
    assert.equal(confirmed.bodyStrategySnapshot.status, 'current');
    assert.equal(confirmed.bodyStrategySnapshot.sourceTrialRunId, followup.trialRun.id);
    assert.ok(confirmed.bodyStrategySnapshot.enhancedReviewRules.length > 0);
    assert.ok(repository.getOperationLogs().some((log) => log.action === 'confirm_trial_force_pass' && log.reason === '开篇差异化强，接受节奏风险进入批量正文前置策略。'));

    const detailAfterConfirmResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}`
    });
    assert.equal(detailAfterConfirmResponse.statusCode, 200);
    const detailAfterConfirm = detailAfterConfirmResponse.json().data;
    assert.equal(detailAfterConfirm.recentTask.taskType, 'trial_followup_generate');
    assert.equal(detailAfterConfirm.recentTask.status, TaskStatus.Completed);
    assert.equal(detailAfterConfirm.statusSummary.recommendedAction.type, 'start_body_batch');

    await app.close();
  });
});

describe('novel package 6 body generation routes', () => {
  it('guides users to confirm the trial review once follow-up trial chapters are ready', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T15:00:00.000Z')
    });
    const { novelId } = await createNovelReadyForTrial(app, '试写总评文案修正测试');
    const firstStep = await postTrialGenerate(app, novelId);
    const selectedCandidate = firstStep.trialRun.chapterOneCandidates.find((candidate: any) => candidate.isAiRecommended);
    await postTrialGenerate(app, novelId, {
      trialRunId: firstStep.trialRun.id,
      selectedCandidateId: selectedCandidate.id
    });

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}`
    });
    assert.equal(detailResponse.statusCode, 200);
    const detail = detailResponse.json().data;
    assert.equal(detail.statusSummary.recommendedAction.label, '确认试写总评');
    assert.ok(detail.statusSummary.recommendedAction.reasonText.includes('确认试写并生成策略快照'));

    const listResponse = await app.inject({
      method: 'GET',
      url: '/novels?page=1&pageSize=20'
    });
    assert.equal(listResponse.statusCode, 200);
    assert.equal(listResponse.json().data.items[0].statusSummary.recommendedAction.label, '确认试写总评');

    await app.close();
  });

  it('blocks batch body generation before a confirmed strategy snapshot exists even if trial content is current', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T15:10:00.000Z')
    });
    const { novelId } = await createNovelReadyForTrial(app, '未确认试写不能批量正文测试');
    const firstStep = await postTrialGenerate(app, novelId);
    const selectedCandidate = firstStep.trialRun.chapterOneCandidates.find((candidate: any) => candidate.isAiRecommended);
    const followup = await postTrialGenerate(app, novelId, {
      trialRunId: firstStep.trialRun.id,
      selectedCandidateId: selectedCandidate.id
    });
    assert.equal(followup.trialRun.chapterResults[0].contentVersion.id, selectedCandidate.id);

    const response = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/batch-generate`,
      headers: { 'x-request-id': 'body-no-snapshot-1' },
      payload: {
        strategySnapshotId: 'missing_snapshot',
        expectedStrategySnapshotVersion: 1,
        idempotencyKey: 'body-batch-no-snapshot-1'
      }
    });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json().error.code, 'GATE_BLOCKED');
    assert.equal(response.json().requestId, 'body-no-snapshot-1');

    await app.close();
  });

  it('maps a missing batch idempotency key to the request id for legacy callers', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T15:12:00.000Z')
    });
    const { novelId, strategySnapshot } = await createNovelReadyForBody(app, '批量正文幂等 key 缺失测试', 8);
    const taskCountBefore = repository.getGenerationTasks().filter((task) => task.taskType === 'body_batch_generate').length;
    const contentCountBefore = repository.getChapterContentVersions().length;

    const response = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/batch-generate`,
      headers: { 'x-request-id': 'body-batch-missing-key' },
      payload: {
        strategySnapshotId: strategySnapshot.id,
        expectedStrategySnapshotVersion: strategySnapshot.versionNo
      }
    });

    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().success, true);
    assert.equal(response.json().requestId, 'body-batch-missing-key');
    assert.equal(repository.getGenerationTasks().filter((task) => task.taskType === 'body_batch_generate').length, taskCountBefore + 1);
    assert.equal(repository.getBodyBatches().length, 1);
    assert.ok(repository.getChapterContentVersions().length > contentCountBefore);

    await app.close();
  });

  it('preclaims a processing body batch task and reuses it for duplicate idempotency keys while the model call is running', async () => {
    const repository = createInMemoryNovelRepository();
    const delayedClient = createDelayedBodyFakeLlmClient();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      aiProviderEnv: {
        AI_PROVIDER_MODE: 'deepseek',
        DEEPSEEK_API_KEY: 'test-deepseek-key-should-not-leak',
        DEEPSEEK_MODEL: 'deepseek-fake-chat',
        DEEPSEEK_REASONER_MODEL: 'deepseek-fake-reasoner'
      },
      llmClient: delayedClient.client,
      now: () => new Date('2026-06-17T15:16:00.000Z')
    });
    const { novelId, strategySnapshot } = await createNovelReadyForBody(app, '批量正文处理中刷新测试', 8);
    const payload = {
      strategySnapshotId: strategySnapshot.id,
      expectedStrategySnapshotVersion: strategySnapshot.versionNo,
      idempotencyKey: 'body-batch-processing-1'
    };

    const firstRequest = app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/batch-generate`,
      payload
    });
    await delayedClient.waitForBody();

    const duringResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}`
    });
    assert.equal(duringResponse.statusCode, 200);
    const during = duringResponse.json().data;
    assert.equal(during.statusSummary.creationStage, 'body');
    assert.equal(during.statusSummary.stageStatus, 'processing');
    assert.equal(during.recentTask.taskType, 'body_batch_generate');
    assert.equal(during.recentTask.status, TaskStatus.Processing);
    assert.match(during.recentTask.currentStep, /第 4-5 章正文/);
    assert.equal(repository.getGenerationTasks().filter((task) => task.taskType === 'body_batch_generate').length, 1);
    assert.equal(delayedClient.getBodyCallCount(), 1);

    const duplicateResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/batch-generate`,
      headers: { 'x-request-id': 'body-batch-processing-duplicate' },
      payload
    });
    assert.equal(duplicateResponse.statusCode, 200, duplicateResponse.body);
    const duplicate = duplicateResponse.json().data;
    assert.equal(duplicateResponse.json().requestId, 'body-batch-processing-duplicate');
    assert.equal(duplicate.task.id, during.recentTask.id);
    assert.equal(duplicate.task.status, TaskStatus.Processing);
    assert.equal(duplicate.batch, null);
    assert.equal(repository.getGenerationTasks().filter((task) => task.taskType === 'body_batch_generate').length, 1);
    assert.equal(delayedClient.getBodyCallCount(), 1);

    const fingerprintConflictResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/batch-generate`,
      headers: { 'x-request-id': 'body-batch-processing-fingerprint-conflict' },
      payload: {
        ...payload,
        startChapterNo: 5,
        endChapterNo: 5
      }
    });
    assert.equal(fingerprintConflictResponse.statusCode, 409);
    assert.equal(fingerprintConflictResponse.json().error.code, 'IDEMPOTENCY_CONFLICT');
    assert.equal(repository.getGenerationTasks().filter((task) => task.taskType === 'body_batch_generate').length, 1);

    const activeConflictResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/batch-generate`,
      headers: { 'x-request-id': 'body-batch-processing-active-conflict' },
      payload: {
        ...payload,
        idempotencyKey: 'body-batch-processing-2'
      }
    });
    assert.equal(activeConflictResponse.statusCode, 409);
    assert.equal(activeConflictResponse.json().error.code, 'CONFLICT_TASK_EXISTS');
    assert.equal(repository.getGenerationTasks().filter((task) => task.taskType === 'body_batch_generate').length, 1);

    delayedClient.releaseBody();
    const firstResponse = await firstRequest;
    assert.equal(firstResponse.statusCode, 200, firstResponse.body);
    const generated = firstResponse.json().data;
    assert.equal(generated.task.id, during.recentTask.id);
    assert.equal(generated.task.status, TaskStatus.Completed);
    assert.equal(generated.batch.startChapterNo, 4);
    assert.equal(generated.batch.endChapterNo, 5);

    await app.close();
  });

  it('marks the preclaimed body batch task as failed when the body model throws before saving chapters', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      aiProviderEnv: {
        AI_PROVIDER_MODE: 'deepseek',
        DEEPSEEK_API_KEY: 'test-deepseek-key-should-not-leak',
        DEEPSEEK_MODEL: 'deepseek-fake-chat',
        DEEPSEEK_REASONER_MODEL: 'deepseek-fake-reasoner'
      },
      llmClient: createFailingBodyFakeLlmClient(),
      now: () => new Date('2026-06-17T15:18:00.000Z')
    });
    const { novelId, strategySnapshot } = await createNovelReadyForBody(app, '批量正文失败恢复测试', 8);

    const response = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/batch-generate`,
      headers: { 'x-request-id': 'body-batch-failing-model' },
      payload: {
        strategySnapshotId: strategySnapshot.id,
        expectedStrategySnapshotVersion: strategySnapshot.versionNo,
        idempotencyKey: 'body-batch-failing-model-1'
      }
    });
    assert.equal(response.statusCode, 500);
    assert.equal(response.json().success, false);
    assert.equal(response.json().error.code, 'INTERNAL_ERROR');
    assert.equal(response.json().requestId, 'body-batch-failing-model');

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}`
    });
    assert.equal(detailResponse.statusCode, 200);
    const detail = detailResponse.json().data;
    assert.equal(detail.statusSummary.creationStage, 'body');
    assert.equal(detail.statusSummary.stageStatus, 'failed');
    assert.equal(detail.recentTask.taskType, 'body_batch_generate');
    assert.equal(detail.recentTask.status, TaskStatus.Failed);
    assert.equal(detail.chapters.find((chapter: any) => chapter.chapterNo === 4).currentContentVersionId, null);
    const task = repository.getGenerationTasks().find((item) => item.id === detail.recentTask.id);
    assert.equal(task?.errorCode, 'PROVIDER_ERROR');
    assert.equal(task?.errorMessage, '模型服务调用失败。');
    assert.equal(task?.failureCategory, 'provider_error');
    assert.equal(repository.getBodyBatches().length, 0);

    await app.close();
  });

  it('blocks unsupported Prisma-like body write path before preclaiming tasks or calling the provider', async () => {
    const repository = createInMemoryNovelRepository();
    const guardedRepository = Object.create(repository) as NovelRepository & ReturnType<typeof createInMemoryNovelRepository>;
    guardedRepository.assertProviderActionSupported = async (taskType) => {
      if (taskType !== 'body_batch_generate') return;
      throw new BusinessError(ErrorCode.ConfigMissing, 'Prisma 正文批量写路径尚未实现，不能创建正文批次预占任务。', {
        taskType: 'body_batch_generate',
        capability: 'prisma_body_batch_write'
      });
    };
    const countingClient = createCountingBodyFakeLlmClient();
    const app = await buildApp({
      logger: false,
      novelRepository: guardedRepository,
      aiProviderEnv: {
        AI_PROVIDER_MODE: 'deepseek',
        DEEPSEEK_API_KEY: 'test-deepseek-key-should-not-leak',
        DEEPSEEK_MODEL: 'deepseek-fake-chat',
        DEEPSEEK_REASONER_MODEL: 'deepseek-fake-reasoner'
      },
      llmClient: countingClient.client,
      now: () => new Date('2026-06-17T15:19:00.000Z')
    });
    const { novelId, strategySnapshot } = await createNovelReadyForBody(app, 'Prisma 正文写路径能力门禁测试', 8);
    assert.equal(countingClient.getBodyCallCount(), 0);

    const response = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/batch-generate`,
      headers: { 'x-request-id': 'body-batch-prisma-not-implemented' },
      payload: {
        strategySnapshotId: strategySnapshot.id,
        expectedStrategySnapshotVersion: strategySnapshot.versionNo,
        idempotencyKey: 'body-batch-prisma-gate-1'
      }
    });
    assert.equal(response.statusCode, 500);
    assert.equal(response.json().error.code, 'CONFIG_MISSING');
    assert.equal(response.json().requestId, 'body-batch-prisma-not-implemented');
    assert.equal(countingClient.getBodyCallCount(), 0);
    assert.equal(repository.getGenerationTasks().filter((task) => task.taskType === 'body_batch_generate').length, 0);
    assert.equal(repository.getBodyBatches().length, 0);

    await app.close();
  });

  it('keeps the preclaimed body batch task failed with save_failed when repository saving fails after provider success', async () => {
    const repository = createInMemoryNovelRepository();
    const guardedRepository = Object.create(repository) as NovelRepository & ReturnType<typeof createInMemoryNovelRepository>;
    guardedRepository.generateBodyBatch = async () => {
      throw new Error('正文保存阶段测试失败：写入正文版本失败');
    };
    const countingClient = createCountingBodyFakeLlmClient();
    const app = await buildApp({
      logger: false,
      novelRepository: guardedRepository,
      aiProviderEnv: {
        AI_PROVIDER_MODE: 'deepseek',
        DEEPSEEK_API_KEY: 'test-deepseek-key-should-not-leak',
        DEEPSEEK_MODEL: 'deepseek-fake-chat',
        DEEPSEEK_REASONER_MODEL: 'deepseek-fake-reasoner'
      },
      llmClient: countingClient.client,
      now: () => new Date('2026-06-17T15:20:00.000Z')
    });
    const { novelId, strategySnapshot } = await createNovelReadyForBody(app, '正文保存失败固定回归测试', 8);
    const taskCountBefore = repository.getGenerationTasks().filter((task) => task.taskType === 'body_batch_generate').length;
    const batchCountBefore = repository.getBodyBatches().length;
    const contentCountBefore = repository.getChapterContentVersions().length;
    const bodyCallCountBefore = countingClient.getBodyCallCount();

    const response = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/batch-generate`,
      headers: { 'x-request-id': 'body-batch-save-failed' },
      payload: {
        strategySnapshotId: strategySnapshot.id,
        expectedStrategySnapshotVersion: strategySnapshot.versionNo,
        idempotencyKey: 'body-batch-save-failed-1'
      }
    });
    assert.equal(response.statusCode, 500);
    assert.equal(response.json().error.code, 'INTERNAL_ERROR');
    assert.ok(countingClient.getBodyCallCount() > bodyCallCountBefore);
    const bodyCallCountAfterFailure = countingClient.getBodyCallCount();

    const bodyTasks = repository.getGenerationTasks().filter((task) => task.taskType === 'body_batch_generate');
    assert.equal(bodyTasks.length, taskCountBefore + 1);
    const failedTasksForRequest = bodyTasks.filter((task) => task.idempotencyToken === 'body-batch-save-failed-1');
    assert.equal(failedTasksForRequest.length, 1);
    const failedTask = failedTasksForRequest[0];
    assert.equal(failedTask.status, TaskStatus.Failed);
    assert.equal(failedTask.failureCategory, 'save_failed');
    assert.equal(failedTask.statusNote, '生成结果保存失败，请联系管理员处理。');
    assert.equal(failedTask.errorMessage, '生成结果保存失败。');
    assert.equal(repository.getBodyBatches().length, batchCountBefore);
    assert.equal(repository.getChapterContentVersions().length, contentCountBefore);
    assert.equal(repository.getNovelChapters().find((chapter) => chapter.novelId === novelId && chapter.chapterNo === 4)?.currentContentVersionId, null);

    const taskDetailResponse = await app.inject({
      method: 'GET',
      url: `/tasks/${failedTask.id}`,
      headers: { 'x-request-id': 'body-batch-save-failed-task-detail' }
    });
    assert.equal(taskDetailResponse.statusCode, 200);
    const taskDetail = taskDetailResponse.json().data;
    assert.equal(taskDetail.id, failedTask.id);
    assert.equal(taskDetail.status, TaskStatus.Failed);
    assert.equal(taskDetail.failureCategory, 'save_failed');
    assert.equal(taskDetail.userFailureReason, '生成结果保存失败。');
    assert.equal(taskDetail.retryable, true);
    assert.equal(taskDetail.nextAction.type, 'retry_task');
    assert.equal(taskDetail.nextAction.label, '重试任务');
    assert.doesNotMatch(JSON.stringify(taskDetail), /test-deepseek-key-should-not-leak|FULL_MODEL_RESPONSE_SHOULD_NOT_LEAK/);

    const repeatedResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/batch-generate`,
      headers: { 'x-request-id': 'body-batch-save-failed-repeat' },
      payload: {
        strategySnapshotId: strategySnapshot.id,
        expectedStrategySnapshotVersion: strategySnapshot.versionNo,
        idempotencyKey: 'body-batch-save-failed-1'
      }
    });
    assert.equal(repeatedResponse.statusCode, 200);
    assert.equal(repeatedResponse.json().data.task.id, failedTask.id);
    assert.equal(repeatedResponse.json().data.task.status, TaskStatus.Failed);
    assert.equal(repeatedResponse.json().data.batch, null);
    assert.equal(countingClient.getBodyCallCount(), bodyCallCountAfterFailure);
    assert.equal(
      repository
        .getGenerationTasks()
        .filter((task) => task.taskType === 'body_batch_generate' && task.idempotencyToken === 'body-batch-save-failed-1').length,
      1
    );

    await app.close();
  });

  it('generates a default five-chapter body batch with per-chapter content, feature card, review, memory, and summary', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T15:20:00.000Z')
    });
    const { novelId, strategySnapshot } = await createNovelReadyForBody(app, '批量正文默认批次测试', 8);

    const response = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/batch-generate`,
      headers: { 'x-request-id': 'body-batch-1' },
      payload: {
        strategySnapshotId: strategySnapshot.id,
        expectedStrategySnapshotVersion: strategySnapshot.versionNo,
        idempotencyKey: 'body-batch-default-1'
      }
    });

    assert.equal(response.statusCode, 200);
    const generated = response.json().data;
    assert.equal(generated.task.taskType, 'body_batch_generate');
    assert.equal(generated.batch.startChapterNo, 4);
    assert.equal(generated.batch.endChapterNo, 8);
    assert.equal(generated.batch.chapterResults.length, 5);
    assert.equal(generated.batch.status, 'completed');
    assert.ok(generated.batch.summary.nextBatchNotes.length >= 1);
    assert.equal(generated.statusSummary.creationStage, 'body');
    assert.equal(generated.statusSummary.stageStatus, 'completed');
    assert.equal(generated.statusSummary.displayStatusText, '待全书审稿');
    assert.equal(generated.nextAction.taskType, 'novel_full_review');
    assert.equal(generated.nextAction.label, '全书 AI 审稿');

    const eventsResponse = await app.inject({
      method: 'GET',
      url: `/tasks/${generated.task.id}/events`
    });
    assert.equal(eventsResponse.statusCode, 200);
    const eventTypes = eventsResponse.json().data.items.map((event: any) => event.eventType);
    assert.deepEqual(eventTypes.slice(0, 6), ['task_claimed', 'preparing_context', 'calling_model', 'parsing_output', 'quality_checking', 'saving_result']);
    assert.equal(eventsResponse.json().data.items.some((event: any) => /正在生成第 1\/5 章/.test(event.message)), true);

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}`
    });
    const detail = detailResponse.json().data;
    const generatedChapters = detail.chapters.filter((chapter: any) => chapter.chapterNo >= 4 && chapter.chapterNo <= 8);
    assert.equal(generatedChapters.length, 5);
    assert.equal(generatedChapters.every((chapter: any) => chapter.currentContentVersionId), true);
    assert.equal(generatedChapters.every((chapter: any) => chapter.mainStatus === 'completed'), true);
    assert.equal(detail.bodyGeneration.latestBatch.summary.id, generated.batch.summary.id);
    assert.equal(detail.bodyGeneration.latestBatch.summary.conclusion.includes('第 4-8 章'), true);

    const chapterResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}/chapters/${generatedChapters[0].id}`
    });
    const chapter = chapterResponse.json().data;
    assert.ok(chapter.currentContent.content.length > 300);
    assert.ok(chapter.featureCard.oneLineSummary.length > 0);
    assert.ok(chapter.reviewReport.totalScore >= 60);
    assert.ok(chapter.longTermMemory.summary.length > 0);

    await app.close();
  });

  it('pauses a batch on hard failure and keeps already completed chapters', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T15:30:00.000Z')
    });
    const { novelId, strategySnapshot } = await createNovelReadyForBody(app, '批量正文暂停测试', 10);

    const response = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/batch-generate`,
      payload: {
        strategySnapshotId: strategySnapshot.id,
        expectedStrategySnapshotVersion: strategySnapshot.versionNo,
        idempotencyKey: 'body-batch-hard-failure-1'
      }
    });

    assert.equal(response.statusCode, 200);
    const paused = response.json().data;
    assert.equal(paused.batch.status, 'paused');
    assert.equal(paused.task.status, 'failed');
    assert.equal(paused.task.failureCategory, 'quality_failed');
    assert.equal(paused.batch.failedChapterNo, 6);
    assert.ok(paused.batch.summary.conclusion.includes('已完成 2 章已保留，第 6 章硬失败'));

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}`
    });
    const chapters = detailResponse.json().data.chapters;
    assert.equal(chapters.find((chapter: any) => chapter.chapterNo === 4).mainStatus, 'completed');
    assert.equal(chapters.find((chapter: any) => chapter.chapterNo === 5).mainStatus, 'completed');
    assert.equal(chapters.find((chapter: any) => chapter.chapterNo === 6).mainStatus, 'pending');
    assert.equal(chapters.find((chapter: any) => chapter.chapterNo === 7).currentContentVersionId, null);

    await app.close();
  });

  it('returns the original body batch for repeated idempotency keys without advancing the next range', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T15:35:00.000Z')
    });
    const { novelId, strategySnapshot } = await createNovelReadyForBody(app, '批量正文幂等重复提交测试', 12);
    const payload = {
      strategySnapshotId: strategySnapshot.id,
      expectedStrategySnapshotVersion: strategySnapshot.versionNo,
      idempotencyKey: 'body-batch-repeat-1'
    };

    const firstResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/batch-generate`,
      payload
    });
    assert.equal(firstResponse.statusCode, 200);
    const first = firstResponse.json().data;
    assert.equal(first.batch.startChapterNo, 4);
    assert.equal(first.batch.endChapterNo, 8);
    const bodyTaskCountAfterFirst = repository.getGenerationTasks().filter((task) => task.taskType === 'body_batch_generate').length;
    const bodyBatchCountAfterFirst = repository.getBodyBatches().length;

    const repeatedResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/batch-generate`,
      payload
    });
    assert.equal(repeatedResponse.statusCode, 200);
    const repeated = repeatedResponse.json().data;
    assert.equal(repeated.task.id, first.task.id);
    assert.equal(repeated.batch.id, first.batch.id);
    assert.equal(repeated.batch.startChapterNo, 4);
    assert.equal(repeated.batch.endChapterNo, 8);
    assert.equal(repository.getGenerationTasks().filter((task) => task.taskType === 'body_batch_generate').length, bodyTaskCountAfterFirst);
    assert.equal(repository.getBodyBatches().length, bodyBatchCountAfterFirst);
    assert.equal(repository.getNovelChapters().find((chapter) => chapter.novelId === novelId && chapter.chapterNo === 9)?.currentContentVersionId, null);

    await app.close();
  });

  it('rejects the same body batch idempotency key when the request fingerprint changes', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T15:36:00.000Z')
    });
    const { novelId, strategySnapshot } = await createNovelReadyForBody(app, '批量正文幂等冲突测试', 12);
    const firstPayload = {
      strategySnapshotId: strategySnapshot.id,
      expectedStrategySnapshotVersion: strategySnapshot.versionNo,
      idempotencyKey: 'body-batch-conflict-1'
    };
    const firstResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/batch-generate`,
      payload: firstPayload
    });
    assert.equal(firstResponse.statusCode, 200);
    const bodyTaskCountAfterFirst = repository.getGenerationTasks().filter((task) => task.taskType === 'body_batch_generate').length;
    const bodyBatchCountAfterFirst = repository.getBodyBatches().length;

    const conflictResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/batch-generate`,
      headers: { 'x-request-id': 'body-batch-idempotency-conflict' },
      payload: {
        ...firstPayload,
        startChapterNo: 9,
        endChapterNo: 12
      }
    });
    assert.equal(conflictResponse.statusCode, 409);
    assert.equal(conflictResponse.json().error.code, 'IDEMPOTENCY_CONFLICT');
    assert.equal(conflictResponse.json().requestId, 'body-batch-idempotency-conflict');
    assert.equal(repository.getGenerationTasks().filter((task) => task.taskType === 'body_batch_generate').length, bodyTaskCountAfterFirst);
    assert.equal(repository.getBodyBatches().length, bodyBatchCountAfterFirst);
    assert.equal(repository.getNovelChapters().find((chapter) => chapter.novelId === novelId && chapter.chapterNo === 9)?.currentContentVersionId, null);

    await app.close();
  });

  it('replays a completed impact assessment and rejects the same token with a different fingerprint', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({ logger: false, novelRepository: repository });
    const { novelId, strategySnapshot } = await createNovelReadyForBody(app, '影响评估终态重放测试', 8);
    await postBodyBatch(app, novelId, strategySnapshot);
    const detail = (await app.inject({ method: 'GET', url: `/novels/${novelId}` })).json().data;
    const chapter4 = detail.chapters.find((chapter: any) => chapter.chapterNo === 4);
    const chapter5 = detail.chapters.find((chapter: any) => chapter.chapterNo === 5);
    const payload = {
      idempotencyKey: 'impact-assessment-replay-1',
      currentContentVersionId: chapter4.currentContentVersionId,
      reason: '核对当前章节对后续线索的影响。'
    };
    const first = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/${chapter4.id}/impact-assessments`,
      payload
    });
    assert.equal(first.statusCode, 200, first.body);
    const replay = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/${chapter4.id}/impact-assessments`,
      payload
    });
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(replay.json().data.task.id, first.json().data.task.id);
    assert.equal(replay.json().data.impactCase.id, first.json().data.impactCase.id);

    const versionConflict = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/${chapter4.id}/impact-assessments`,
      payload: { ...payload, currentContentVersionId: chapter5.currentContentVersionId }
    });
    assert.equal(versionConflict.statusCode, 409);
    assert.equal(versionConflict.json().error.code, ErrorCode.IdempotencyConflict);
    const nullVersionConflict = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/${chapter4.id}/impact-assessments`,
      payload: { ...payload, currentContentVersionId: null }
    });
    assert.equal(nullVersionConflict.statusCode, 409);
    assert.equal(nullVersionConflict.json().error.code, ErrorCode.IdempotencyConflict);

    const conflict = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/${chapter4.id}/impact-assessments`,
      payload: { ...payload, reason: '使用不同的评估目标。' }
    });
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.json().error.code, ErrorCode.IdempotencyConflict);
    assert.doesNotMatch(conflict.body, /impact-assessment-replay-1/);
    await app.close();
  });

  it('creates rewrite candidates, adopts with audit records, triggers impact assessment, and blocks next batch until impact is closed', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T15:40:00.000Z')
    });
    const { novelId, strategySnapshot } = await createNovelReadyForBody(app, '章节重写影响评估测试', 12);
    await postBodyBatch(app, novelId, strategySnapshot);
    const detailBefore = (await app.inject({ method: 'GET', url: `/novels/${novelId}` })).json().data;
    const chapter4 = detailBefore.chapters.find((chapter: any) => chapter.chapterNo === 4);
    const originalCurrentVersionId = chapter4.currentContentVersionId;

    const rewritePayload = {
      idempotencyKey: 'chapter-rewrite-replay-1',
      instruction: '强化结尾，并加入会影响后续旧码头线索的改动。',
      reason: '批次总结建议优化第4章结尾',
      currentContentVersionId: originalCurrentVersionId
    };
    const rewriteResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/${chapter4.id}/rewrite`,
      payload: rewritePayload
    });
    assert.equal(rewriteResponse.statusCode, 200);
    const rewrite = rewriteResponse.json().data;
    assert.equal(rewrite.task.taskType, 'chapter_body_rewrite');
    assert.equal(rewrite.candidate.status, 'candidate');
    assert.equal(rewrite.currentContent.id, originalCurrentVersionId);
    assert.ok(rewrite.summaryCompare.possibleImpact.includes('后续'));

    const rewriteReplay = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/${chapter4.id}/rewrite`,
      payload: rewritePayload
    });
    assert.equal(rewriteReplay.statusCode, 200, rewriteReplay.body);
    assert.equal(rewriteReplay.json().data.task.id, rewrite.task.id);
    assert.equal(rewriteReplay.json().data.candidate.id, rewrite.candidate.id);
    assert.deepEqual(rewriteReplay.json().data.affectedObjects, []);
    const rewriteConflict = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/${chapter4.id}/rewrite`,
      payload: { ...rewritePayload, instruction: '改成完全不同的结尾。' }
    });
    assert.equal(rewriteConflict.statusCode, 409);
    assert.equal(rewriteConflict.json().error.code, ErrorCode.IdempotencyConflict);
    assert.doesNotMatch(rewriteConflict.body, /chapter-rewrite-replay-1/);
    const rewriteNullVersionConflict = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/${chapter4.id}/rewrite`,
      payload: { ...rewritePayload, currentContentVersionId: null }
    });
    assert.equal(rewriteNullVersionConflict.statusCode, 409);
    assert.equal(rewriteNullVersionConflict.json().error.code, ErrorCode.IdempotencyConflict);

    const adoptPayload = {
      idempotencyKey: 'chapter-adopt-replay-1',
      reason: '候选提升结尾钩子，接受影响评估后再继续。',
      currentContentVersionId: originalCurrentVersionId
    };
    const adoptResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/${chapter4.id}/content-versions/${rewrite.candidate.id}/adopt`,
      headers: { 'x-request-id': 'adopt-chapter-content-1' },
      payload: adoptPayload
    });
    assert.equal(adoptResponse.statusCode, 200);
    const adopted = adoptResponse.json().data;
    assert.equal(adopted.currentContent.id, rewrite.candidate.id);
    assert.equal(adopted.impactCase.impactLevel, 'medium');
    assert.equal(adopted.impactCase.status, 'waiting_decision');
    assert.equal(adopted.impactCase.blocksFullReview, true);
    assert.ok(repository.getAssetDecisionRecords().some((record: any) => record.actionType === 'adopt_chapter_content' && record.candidateVersionId === rewrite.candidate.id));
    assert.ok(repository.getOperationLogs().some((log) => log.action === 'adopt_chapter_content' && log.requestId === 'adopt-chapter-content-1'));

    const rewriteAfterAdopt = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/${chapter4.id}/rewrite`,
      payload: rewritePayload
    });
    assert.equal(rewriteAfterAdopt.statusCode, 200, rewriteAfterAdopt.body);
    assert.equal(rewriteAfterAdopt.json().data.task.id, rewrite.task.id);
    assert.equal(rewriteAfterAdopt.json().data.candidate.id, rewrite.candidate.id);

    const adoptReplay = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/${chapter4.id}/content-versions/${rewrite.candidate.id}/adopt`,
      payload: adoptPayload
    });
    assert.equal(adoptReplay.statusCode, 200, adoptReplay.body);
    assert.equal(adoptReplay.json().data.task.id, adopted.task.id);
    assert.equal(adoptReplay.json().data.impactCase.id, adopted.impactCase.id);
    assert.deepEqual(adoptReplay.json().data.affectedObjects, []);
    const adoptConflict = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/${chapter4.id}/content-versions/${rewrite.candidate.id}/adopt`,
      payload: { ...adoptPayload, reason: '改用另一套风险理由。' }
    });
    assert.equal(adoptConflict.statusCode, 409);
    assert.equal(adoptConflict.json().error.code, ErrorCode.IdempotencyConflict);
    assert.doesNotMatch(adoptConflict.body, /chapter-adopt-replay-1/);
    const adoptNullVersionConflict = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/${chapter4.id}/content-versions/${rewrite.candidate.id}/adopt`,
      payload: { ...adoptPayload, currentContentVersionId: null }
    });
    assert.equal(adoptNullVersionConflict.statusCode, 409);
    assert.equal(adoptNullVersionConflict.json().error.code, ErrorCode.IdempotencyConflict);

    const blockedDetailResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}`
    });
    assert.equal(blockedDetailResponse.statusCode, 200);
    const blockedDetail = blockedDetailResponse.json().data;
    assert.equal(blockedDetail.bodyGeneration.openImpactCases.length, 1);
    assert.equal(blockedDetail.bodyGeneration.openImpactCases[0].id, adopted.impactCase.id);
    assert.deepEqual(blockedDetail.bodyGeneration.blockingReasons, ['存在中等或严重影响案例未关闭。']);
    assert.equal(blockedDetail.bodyGeneration.recommendedAction.label, '处理影响案例');
    assert.equal(blockedDetail.bodyGeneration.recommendedAction.taskType, 'chapter_impact_assess');

    const blockedNextBatch = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/batch-generate`,
      payload: {
        strategySnapshotId: strategySnapshot.id,
        expectedStrategySnapshotVersion: strategySnapshot.versionNo,
        idempotencyKey: 'body-batch-impact-blocked-1'
      }
    });
    assert.equal(blockedNextBatch.statusCode, 409);
    assert.equal(blockedNextBatch.json().error.code, 'GATE_BLOCKED');

    const caseResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}/impact-cases/${adopted.impactCase.id}`
    });
    assert.equal(caseResponse.statusCode, 200);
    assert.equal(caseResponse.json().data.id, adopted.impactCase.id);

    const resolveResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/impact-cases/${adopted.impactCase.id}/resolve`,
      payload: {
        resolution: 'ignored',
        reason: '已人工确认第5章以后只需沿用新钩子，不阻塞继续生成。'
      }
    });
    assert.equal(resolveResponse.statusCode, 200);
    assert.equal(resolveResponse.json().data.impactCase.status, 'ignored');

    const nextBatch = await postBodyBatch(app, novelId, strategySnapshot);
    assert.equal(nextBatch.batch.startChapterNo, 9);
    assert.equal(nextBatch.batch.endChapterNo, 12);

    await app.close();
  });
});

describe('novel package 7 full review and video readiness routes', () => {
  it('blocks full review when body chapters are not all completed and creates no review task', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T17:00:00.000Z')
    });
    const { novelId, strategySnapshot } = await createNovelReadyForBody(app, '全书审稿前置门禁测试', 12);
    await postBodyBatch(app, novelId, strategySnapshot);
    const detail = (await app.inject({ method: 'GET', url: `/novels/${novelId}` })).json().data;

    const response = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/full-review`,
      headers: { 'x-request-id': 'full-review-blocked-1' },
      payload: {
        idempotencyKey: 'full-review-blocked-1',
        expectedNovelVersion: detail.updatedAt
      }
    });

    assert.equal(response.statusCode, 409);
    assert.equal(response.json().error.code, 'GATE_BLOCKED');
    assert.equal(response.json().requestId, 'full-review-blocked-1');
    assert.equal(repository.getGenerationTasks().some((task) => task.taskType === 'novel_full_review'), false);

    await app.close();
  });

  it('runs full review, confirms completion, then confirms video readiness as two separate actions', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T17:10:00.000Z')
    });
    const { novelId, strategySnapshot } = await createNovelReadyForBody(app, '全书审稿待视频化通过测试', 8);
    await postBodyBatch(app, novelId, strategySnapshot);
    const detailBeforeReview = (await app.inject({ method: 'GET', url: `/novels/${novelId}` })).json().data;
    assert.equal(detailBeforeReview.statusSummary.recommendedAction.label, '全书 AI 审稿');

    const reviewResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/full-review`,
      payload: {
        idempotencyKey: 'full-review-pass-1',
        expectedNovelVersion: detailBeforeReview.updatedAt
      }
    });
    assert.equal(reviewResponse.statusCode, 200);
    const reviewResult = reviewResponse.json().data;
    assert.equal(reviewResult.task.taskType, 'novel_full_review');
    assert.equal(reviewResult.fullReview.reviewLevel, 'full_novel');
    assert.equal(reviewResult.fullReview.gateResult, 'pass');
    assert.equal(reviewResult.fullReview.gate.allowCompletion, true);
    assert.equal(reviewResult.statusSummary.creationStage, 'completion_confirm');
    assert.equal(reviewResult.statusSummary.stageStatus, 'waiting_user');
    assert.equal(reviewResult.statusSummary.recommendedAction.label, '确认小说完成');

    const reviewReplayResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/full-review`,
      payload: {
        idempotencyKey: 'full-review-pass-1',
        expectedNovelVersion: detailBeforeReview.updatedAt
      }
    });
    assert.equal(reviewReplayResponse.statusCode, 200, reviewReplayResponse.body);
    assert.equal(reviewReplayResponse.json().data.task.id, reviewResult.task.id);
    assert.equal(reviewReplayResponse.json().data.fullReview.id, reviewResult.fullReview.id);
    assert.deepEqual(reviewReplayResponse.json().data.affectedObjects, []);

    const reviewConflictResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/full-review`,
      payload: {
        idempotencyKey: 'full-review-pass-1',
        expectedNovelVersion: detailBeforeReview.updatedAt,
        reviewPolicyVersionId: 'policy-full-review-v2'
      }
    });
    assert.equal(reviewConflictResponse.statusCode, 409);
    assert.equal(reviewConflictResponse.json().error.code, ErrorCode.IdempotencyConflict);
    assert.doesNotMatch(reviewConflictResponse.body, /full-review-pass-1/);

    const latestReviewResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}/full-review/latest`
    });
    assert.equal(latestReviewResponse.statusCode, 200);
    assert.equal(latestReviewResponse.json().data.fullReview.id, reviewResult.fullReview.id);

    const completionResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/completion/confirm`,
      payload: {
        idempotencyKey: 'completion-confirm-1',
        reviewReportId: reviewResult.fullReview.id,
        fullReviewGateId: reviewResult.fullReview.gate.id,
        reason: '全书审稿通过，确认小说完成。'
      }
    });
    assert.equal(completionResponse.statusCode, 200);
    const completionResult = completionResponse.json().data;
    assert.equal(completionResult.statusSummary.creationStage, 'completion_confirm');
    assert.equal(completionResult.statusSummary.recommendedAction.label, '确认进入待视频化');
    assert.equal(completionResult.completionDecision.reviewReportId, reviewResult.fullReview.id);
    assert.equal(completionResult.videoReadiness.snapshot, null);
    assert.equal(completionResult.videoReadiness.status, 'candidate');

    const readinessResponse = await app.inject({
      method: 'GET',
      url: `/novels/${novelId}/video-readiness`
    });
    assert.equal(readinessResponse.statusCode, 200);
    assert.equal(readinessResponse.json().data.status, 'candidate');
    assert.equal(readinessResponse.json().data.checkItems.every((item: any) => item.passed), true);

    const confirmVideoResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/video-readiness/confirm`,
      payload: {
        idempotencyKey: 'video-readiness-confirm-1',
        completionDecisionId: completionResult.completionDecision.id,
        readinessCheckId: completionResult.videoReadiness.check.id,
        checkVersion: completionResult.videoReadiness.check.version,
        reason: '检查通过，进入待视频化承接。'
      }
    });
    assert.equal(confirmVideoResponse.statusCode, 200);
    const videoReady = confirmVideoResponse.json().data;
    assert.equal(videoReady.statusSummary.creationStage, 'video_ready');
    assert.equal(videoReady.statusSummary.stageStatus, 'completed');
    assert.equal(videoReady.videoReadiness.status, 'ready');
    assert.equal(videoReady.videoReadiness.snapshot.completionDecisionId, completionResult.completionDecision.id);
    assert.equal(videoReady.statusSummary.recommendedAction.label, '去视频列表');
    assert.notEqual(videoReady.statusSummary.recommendedAction.label, '创建视频');

    const repeatedConfirmVideoResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/video-readiness/confirm`,
      payload: {
        idempotencyKey: 'video-readiness-confirm-1',
        completionDecisionId: completionResult.completionDecision.id,
        readinessCheckId: completionResult.videoReadiness.check.id,
        checkVersion: completionResult.videoReadiness.check.version,
        reason: '检查通过，进入待视频化承接。'
      }
    });
    assert.equal(repeatedConfirmVideoResponse.statusCode, 200);
    const repeatedVideoReady = repeatedConfirmVideoResponse.json().data;
    assert.equal(repeatedVideoReady.videoReadiness.snapshot.id, videoReady.videoReadiness.snapshot.id);
    assert.equal(repeatedVideoReady.statusSummary.creationStage, 'video_ready');
    assert.equal(repeatedVideoReady.videoReadiness.status, 'ready');

    const conflictingConfirmVideoResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/video-readiness/confirm`,
      payload: {
        idempotencyKey: 'video-readiness-confirm-1',
        completionDecisionId: completionResult.completionDecision.id,
        readinessCheckId: completionResult.videoReadiness.check.id,
        checkVersion: completionResult.videoReadiness.check.version + 1,
        reason: '不同检查版本不应复用幂等结果。'
      }
    });
    assert.equal(conflictingConfirmVideoResponse.statusCode, 409);
    assert.equal(conflictingConfirmVideoResponse.json().error.code, 'IDEMPOTENCY_CONFLICT');

    await app.close();
  });

  it('requires a reason to force pass a low full-review score before completion confirmation', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T17:20:00.000Z')
    });
    const { novelId, strategySnapshot } = await createNovelReadyForBody(app, '低分全书审稿强制通过测试', 8);
    await postBodyBatch(app, novelId, strategySnapshot);
    const detailBeforeReview = (await app.inject({ method: 'GET', url: `/novels/${novelId}` })).json().data;

    const reviewResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/full-review`,
      payload: {
        idempotencyKey: 'full-review-low-score-1',
        expectedNovelVersion: detailBeforeReview.updatedAt
      }
    });
    assert.equal(reviewResponse.statusCode, 200);
    const reviewResult = reviewResponse.json().data;
    assert.equal(reviewResult.fullReview.totalScore, 66);
    assert.equal(reviewResult.fullReview.gateResult, 'blocked');
    assert.equal(reviewResult.fullReview.gate.forcePassAllowed, true);
    assert.equal(reviewResult.statusSummary.creationStage, 'full_review');
    assert.equal(reviewResult.statusSummary.stageStatus, 'blocked');

    const blockedCompletion = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/completion/confirm`,
      payload: {
        idempotencyKey: 'completion-confirm-blocked-low-1',
        reviewReportId: reviewResult.fullReview.id,
        fullReviewGateId: reviewResult.fullReview.gate.id,
        reason: '尝试直接确认'
      }
    });
    assert.equal(blockedCompletion.statusCode, 409);
    assert.equal(blockedCompletion.json().error.code, 'GATE_BLOCKED');

    const forceWithoutReason = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/full-review/${reviewResult.fullReview.id}/force-pass`,
      payload: {
        idempotencyKey: 'full-review-force-no-reason-1',
        fullReviewGateId: reviewResult.fullReview.gate.id,
        expectedReviewReportVersion: reviewResult.fullReview.version,
        confirmRisk: true
      }
    });
    assert.equal(forceWithoutReason.statusCode, 400);
    assert.equal(forceWithoutReason.json().error.code, 'VALIDATION_ERROR');

    const forceResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/full-review/${reviewResult.fullReview.id}/force-pass`,
      headers: { 'x-request-id': 'force-low-review-1' },
      payload: {
        idempotencyKey: 'full-review-force-pass-1',
        fullReviewGateId: reviewResult.fullReview.gate.id,
        expectedReviewReportVersion: reviewResult.fullReview.version,
        reason: '开篇和视频化切片仍可测试，接受低分风险继续。',
        confirmRisk: true
      }
    });
    assert.equal(forceResponse.statusCode, 200);
    const forced = forceResponse.json().data;
    assert.equal(forced.fullReview.gateResult, 'forced_pass');
    assert.equal(forced.statusSummary.creationStage, 'completion_confirm');
    assert.equal(repository.getOperationLogs().some((log) => log.action === 'force_pass_full_review' && log.requestId === 'force-low-review-1'), true);

    const completionResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/completion/confirm`,
      payload: {
        idempotencyKey: 'completion-confirm-forced-1',
        reviewReportId: forced.fullReview.id,
        fullReviewGateId: forced.fullReview.gate.id,
        reason: '已接受全书低分风险，先完成后做开篇视频验证。',
        confirmRisk: true
      }
    });
    assert.equal(completionResponse.statusCode, 200);
    assert.equal(completionResponse.json().data.completionDecision.isForced, true);

    await app.close();
  });

  it('keeps completion confirmed when video readiness fails and blocks video-ready confirmation', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T17:30:00.000Z')
    });
    const { novelId, strategySnapshot } = await createNovelReadyForBody(app, '视频化检查失败不回滚测试', 8);
    await postBodyBatch(app, novelId, strategySnapshot);
    const detailBeforeReview = (await app.inject({ method: 'GET', url: `/novels/${novelId}` })).json().data;
    const reviewResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/full-review`,
      payload: {
        idempotencyKey: 'full-review-readiness-fail-1',
        expectedNovelVersion: detailBeforeReview.updatedAt
      }
    });
    assert.equal(reviewResponse.statusCode, 200);
    const reviewResult = reviewResponse.json().data;

    const completionResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/completion/confirm`,
      payload: {
        idempotencyKey: 'completion-confirm-readiness-fail-1',
        reviewReportId: reviewResult.fullReview.id,
        fullReviewGateId: reviewResult.fullReview.gate.id,
        reason: '先确认小说完成，再处理视频化检查。'
      }
    });
    assert.equal(completionResponse.statusCode, 200);
    const completed = completionResponse.json().data;
    assert.equal(completed.statusSummary.creationStage, 'completion_confirm');
    assert.equal(completed.videoReadiness.status, 'not_ready');
    assert.equal(completed.videoReadiness.checkItems.some((item: any) => !item.passed && item.key === 'first_video_suggestion'), true);

    const confirmVideoResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/video-readiness/confirm`,
      payload: {
        idempotencyKey: 'video-readiness-fail-confirm-1',
        completionDecisionId: completed.completionDecision.id,
        readinessCheckId: completed.videoReadiness.check.id,
        checkVersion: completed.videoReadiness.check.version,
        reason: '尝试进入待视频化'
      }
    });
    assert.equal(confirmVideoResponse.statusCode, 409);
    assert.equal(confirmVideoResponse.json().error.code, 'GATE_BLOCKED');

    const detailAfterFailure = (await app.inject({ method: 'GET', url: `/novels/${novelId}` })).json().data;
    assert.equal(detailAfterFailure.creationStage, 'completion_confirm');
    assert.equal(detailAfterFailure.videoReadiness.status, 'not_ready');
    assert.equal(detailAfterFailure.videoReadiness.snapshot, null);

    await app.close();
  });
});

describe('model integration M1 DeepSeek provider routes', () => {
  it('returns a unified config error in deepseek mode when DEEPSEEK_API_KEY is missing', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      aiProviderEnv: {
        AI_PROVIDER_MODE: 'deepseek',
        DEEPSEEK_API_KEY: ''
      }
    });
    const novelId = await createDraft(app, 'DeepSeek 缺配置测试', 5);

    const response = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/directions/generate`,
      headers: { 'x-request-id': 'deepseek-missing-key-1' },
      payload: {}
    });

    assert.equal(response.statusCode, 500);
    const body = response.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'CONFIG_MISSING');
    assert.equal(body.requestId, 'deepseek-missing-key-1');
    assert.doesNotMatch(JSON.stringify(body), /DEEPSEEK_API_KEY|test-deepseek-key|sk-/i);
    assert.equal(repository.getGenerationTasks().length, 0);

    await app.close();
  });

  it('runs the full short-novel flow with a fake DeepSeek client without leaking prompts or raw responses', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      aiProviderEnv: {
        AI_PROVIDER_MODE: 'deepseek',
        DEEPSEEK_API_KEY: 'test-deepseek-key-should-not-leak',
        DEEPSEEK_MODEL: 'deepseek-fake-chat',
        DEEPSEEK_REASONER_MODEL: 'deepseek-fake-reasoner'
      },
      llmClient: createM1E2EFakeLlmClient()
    });

    const novelId = await createDraft(app, 'DeepSeek fake E2E 短篇', 5);
    const directions = await generateDirections(app, novelId);
    assert.equal(directions.candidates.length >= 3, true);

    const direction = directions.candidates[0];
    const adoptDirection = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/directions/${direction.id}/adopt`,
      payload: { reason: '采用 fake DeepSeek 高分方向。' }
    });
    assertUnifiedSuccess(adoptDirection);

    const setting = await postStructure(app, novelId, 'settings', 'generate');
    await postStructure(app, novelId, 'settings', 'adopt', setting.candidate.id, { reason: '采用设定。' });
    const outline = await postStructure(app, novelId, 'outlines', 'generate');
    await postStructure(app, novelId, 'outlines', 'adopt', outline.candidate.id, { reason: '采用大纲。' });
    const stageOutline = await postStructure(app, novelId, 'stage-outlines', 'generate');
    await postStructure(app, novelId, 'stage-outlines', 'adopt', stageOutline.candidate.id, { reason: '采用阶段大纲。' });
    const chapterPlan = await postStructure(app, novelId, 'chapter-plans', 'generate');
    await postStructure(app, novelId, 'chapter-plans', 'adopt', chapterPlan.candidate.id, { reason: '采用章节目录。' });

    const firstTrial = await postTrialGenerate(app, novelId);
    assert.equal(firstTrial.trialRun.chapterOneCandidates.length, 3);
    assert.equal(firstTrial.trialRun.chapterOneCandidates.some((candidate: any) => candidate.isSelected), false);
    const selectedCandidate = firstTrial.trialRun.chapterOneCandidates.find((candidate: any) => candidate.isAiRecommended);
    const followupTrial = await postTrialGenerate(app, novelId, {
      trialRunId: firstTrial.trialRun.id,
      selectedCandidateId: selectedCandidate.id
    });
    assert.equal(followupTrial.trialRun.trialReview.trialResult, 'pass');

    const confirmTrial = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/trial/confirm`,
      payload: {
        trialRunId: followupTrial.trialRun.id,
        decision: 'confirm_pass'
      }
    });
    assertUnifiedSuccess(confirmTrial);
    const strategySnapshot = confirmTrial.json().data.bodyStrategySnapshot;

    const bodyBatch = await postBodyBatch(app, novelId, strategySnapshot);
    assert.equal(bodyBatch.batch.startChapterNo, 4);
    assert.equal(bodyBatch.batch.endChapterNo, 5);
    assert.equal(bodyBatch.statusSummary.recommendedAction.label, '全书 AI 审稿');

    const detailBeforeReview = (await app.inject({ method: 'GET', url: `/novels/${novelId}` })).json().data;
    const reviewResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/full-review`,
      payload: {
        idempotencyKey: 'm1-fake-full-review-1',
        expectedNovelVersion: detailBeforeReview.updatedAt
      }
    });
    assertUnifiedSuccess(reviewResponse);
    const review = reviewResponse.json().data.fullReview;
    assert.equal(review.gateResult, 'pass');

    const completionResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/completion/confirm`,
      payload: {
        idempotencyKey: 'm1-fake-completion-1',
        reviewReportId: review.id,
        fullReviewGateId: review.gate.id,
        reason: 'fake DeepSeek 全书审稿通过。'
      }
    });
    assertUnifiedSuccess(completionResponse);
    const completion = completionResponse.json().data;

    const readinessResponse = await app.inject({ method: 'GET', url: `/novels/${novelId}/video-readiness` });
    assertUnifiedSuccess(readinessResponse);
    assert.equal(readinessResponse.json().data.status, 'candidate');

    const confirmVideoResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/video-readiness/confirm`,
      payload: {
        idempotencyKey: 'm1-fake-video-ready-1',
        completionDecisionId: completion.completionDecision.id,
        readinessCheckId: completion.videoReadiness.check.id,
        checkVersion: completion.videoReadiness.check.version,
        reason: 'fake DeepSeek 待视频化检查通过。'
      }
    });
    assertUnifiedSuccess(confirmVideoResponse);
    const videoReady = confirmVideoResponse.json().data;
    assert.equal(videoReady.statusSummary.creationStage, 'video_ready');
    assert.equal(videoReady.statusSummary.recommendedAction.label, '去视频列表');

    const finalDetail = await app.inject({ method: 'GET', url: `/novels/${novelId}` });
    assertUnifiedSuccess(finalDetail);
    assert.equal(finalDetail.json().data.creationStage, 'video_ready');

    const serializedEvidence = JSON.stringify({
      finalDetail: finalDetail.json().data,
      tasks: repository.getGenerationTasks(),
      events: repository.getGenerationTaskEvents()
    });
    assert.doesNotMatch(serializedEvidence, /test-deepseek-key-should-not-leak/);
    assert.doesNotMatch(serializedEvidence, /FULL_PROMPT_SHOULD_NOT_LEAK/);
    assert.doesNotMatch(serializedEvidence, /FULL_MODEL_RESPONSE_SHOULD_NOT_LEAK/);

    await app.close();
  });
});

async function createDraft(app: Awaited<ReturnType<typeof buildApp>>, title: string, chapterLimit = 80) {
  const response = await app.inject({
    method: 'POST',
    url: '/novels/drafts',
    headers: { 'content-type': 'application/json' },
    payload: {
      title,
      genres: ['都市逆袭'],
      preferences: {
        appealPoints: ['低谷翻盘'],
        targetAudience: '18-35 岁爽文用户'
      },
      chapterLimit,
      chapterWordRange: {
        min: 1800,
        max: 2600
      }
    }
  });

  assert.equal(response.statusCode, 201);
  return response.json().data.id as string;
}

class FakeHotspotReferenceGateway implements HotspotReferenceGateway {
  async getCapability() {
    return {
      available: true,
      unavailableReason: null
    };
  }

  async validateReference(input: HotspotReferenceValidationInput) {
    if (input.reportId === 'hotspot-cross-tenant') {
      return {
        ok: false,
        reasonCode: 'cross_tenant' as const,
        message: '热点报告不属于当前租户。',
        report: null,
        opportunity: null
      };
    }

    if (input.reportId !== 'hotspot-001') {
      return {
        ok: false,
        reasonCode: 'missing_report' as const,
        message: '热点报告不存在或不可访问。',
        report: null,
        opportunity: null
      };
    }

    if (input.opportunityId && input.opportunityId !== 'opportunity-001') {
      return {
        ok: false,
        reasonCode: 'opportunity_not_in_report' as const,
        message: '热点机会点不属于所选报告。',
        report: { id: input.reportId, title: '同租户热点报告' },
        opportunity: null
      };
    }

    return {
      ok: true,
      reasonCode: null,
      message: null,
      report: { id: input.reportId, title: '同租户热点报告' },
      opportunity: input.opportunityId ? { id: input.opportunityId, title: '短视频机会点' } : null
    };
  }
}

async function generateDirections(app: Awaited<ReturnType<typeof buildApp>>, novelId: string) {
  const response = await app.inject({
    method: 'POST',
    url: `/novels/${novelId}/directions/generate`,
    payload: {}
  });

  assert.equal(response.statusCode, 200);
  return response.json().data;
}

async function createNovelWithAdoptedDirection(app: Awaited<ReturnType<typeof buildApp>>, title = '结构资产链路测试', chapterLimit = 80) {
  const novelId = await createDraft(app, title, chapterLimit);
  const generated = await generateDirections(app, novelId);
  const candidate = generated.candidates.find((item: any) => item.score >= 75);

  const response = await app.inject({
    method: 'POST',
    url: `/novels/${novelId}/directions/${candidate.id}/adopt`,
    payload: {
      reason: '采用高分方向，进入设定阶段。'
    }
  });

  assert.equal(response.statusCode, 200);

  return { novelId, directionId: candidate.id as string };
}

async function createNovelReadyForTrial(app: Awaited<ReturnType<typeof buildApp>>, title = '试写链路测试', chapterLimit = 80) {
  const { novelId } = await createNovelWithAdoptedDirection(app, title, chapterLimit);
  const setting = await postStructure(app, novelId, 'settings', 'generate');
  await postStructure(app, novelId, 'settings', 'adopt', setting.candidate.id, {
    reason: '设定完整，采用为试写链路输入。'
  });
  const outline = await postStructure(app, novelId, 'outlines', 'generate');
  await postStructure(app, novelId, 'outlines', 'adopt', outline.candidate.id, {
    reason: '全书大纲完整，采用为试写链路输入。'
  });
  const stageOutline = await postStructure(app, novelId, 'stage-outlines', 'generate');
  await postStructure(app, novelId, 'stage-outlines', 'adopt', stageOutline.candidate.id, {
    reason: '阶段大纲完整，采用为试写链路输入。'
  });
  const chapterPlan = await postStructure(app, novelId, 'chapter-plans', 'generate');
  await postStructure(app, novelId, 'chapter-plans', 'adopt', chapterPlan.candidate.id, {
    reason: '章节目录完整，进入试写。'
  });

  return { novelId };
}

async function createNovelReadyForBody(app: Awaited<ReturnType<typeof buildApp>>, title = '正文链路测试', chapterLimit = 80) {
  const { novelId } = await createNovelReadyForTrial(app, title, chapterLimit);
  const firstStep = await postTrialGenerate(app, novelId);
  const selectedCandidate = firstStep.trialRun.chapterOneCandidates.find((candidate: any) => candidate.isAiRecommended);
  const followup = await postTrialGenerate(app, novelId, {
    trialRunId: firstStep.trialRun.id,
    selectedCandidateId: selectedCandidate.id
  });
  const confirmResponse = await app.inject({
    method: 'POST',
    url: `/novels/${novelId}/trial/confirm`,
    payload: {
      trialRunId: followup.trialRun.id,
      decision: 'confirm_pass'
    }
  });
  assert.equal(confirmResponse.statusCode, 200);
  assert.equal(confirmResponse.json().success, true);

  return {
    novelId,
    strategySnapshot: confirmResponse.json().data.bodyStrategySnapshot
  };
}

let bodyBatchHelperSequence = 1;

async function postBodyBatch(app: Awaited<ReturnType<typeof buildApp>>, novelId: string, strategySnapshot: any) {
  const response = await app.inject({
    method: 'POST',
    url: `/novels/${novelId}/chapters/batch-generate`,
    payload: {
      strategySnapshotId: strategySnapshot.id,
      expectedStrategySnapshotVersion: strategySnapshot.versionNo,
      idempotencyKey: `body-batch-helper-${bodyBatchHelperSequence++}`
    }
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().success, true);
  return response.json().data;
}

async function postTrialGenerate(
  app: Awaited<ReturnType<typeof buildApp>>,
  novelId: string,
  payload: Record<string, unknown> = {}
) {
  const response = await app.inject({
    method: 'POST',
    url: `/novels/${novelId}/trial/generate`,
    payload
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().success, true);
  return response.json().data;
}

function captureTrialFollowupSideEffects(repository: ReturnType<typeof createInMemoryNovelRepository>, novelId: string) {
  const tasks = repository.getGenerationTasks().filter((task) => task.novelId === novelId);
  return {
    followupTasks: tasks.filter((task) => task.taskType === 'trial_followup_generate').length,
    events: repository.getGenerationTaskEvents().filter((event) => tasks.some((task) => task.id === event.taskId)).length,
    contentVersions: repository.getChapterContentVersions().filter((version) => version.novelId === novelId).length,
    currentChapterPointers: repository.getNovelChapters().filter((chapter) => chapter.novelId === novelId && Boolean(chapter.currentContentVersionId)).length,
    operationLogs: repository.getOperationLogs().filter((log) => log.novelId === novelId).length,
    resultReceipts: tasks.filter((task) => Boolean((task as any).resultReceiptHash)).length,
    childTasks: tasks.filter((task) => Boolean((task as any).retryOfTaskId)).length
  };
}

function createMemoryLogSink() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    }
  });
  return Object.assign(stream, {
    text: () => chunks.join('')
  });
}

async function postStructure(
  app: Awaited<ReturnType<typeof buildApp>>,
  novelId: string,
  resource: 'settings' | 'outlines' | 'stage-outlines' | 'chapter-plans',
  action: 'generate' | 'adopt',
  versionId?: string,
  payload: Record<string, unknown> = {}
) {
  const url =
    action === 'generate'
      ? `/novels/${novelId}/${resource}/generate`
      : `/novels/${novelId}/${resource}/${versionId ?? 'missing-version'}/adopt`;
  const response = await app.inject({
    method: 'POST',
    url,
    payload
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().success, true);
  return response.json().data;
}

function assertUnifiedSuccess(response: { statusCode: number; json: () => any }) {
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.success, true);
  assert.equal(body.error, null);
  assert.equal(typeof body.requestId, 'string');
  assert.notEqual(body.requestId.length, 0);
}

function createM1E2EFakeLlmClient(): LlmClient {
  return {
    async chat(request) {
      return {
        content: JSON.stringify({
          ...createFakeDeepSeekPayload(request.taskName ?? 'unknown_task'),
          debugRaw: 'FULL_MODEL_RESPONSE_SHOULD_NOT_LEAK'
        }),
        model: request.model,
        usage: {
          promptTokens: 24,
          completionTokens: 48,
          totalTokens: 72
        }
      };
    }
  };
}

function createDelayedFollowupFakeLlmClient(): { client: LlmClient; waitForFollowup: () => Promise<void>; releaseFollowup: () => void } {
  let releaseFollowup!: () => void;
  let markFollowupStarted!: () => void;
  const releasePromise = new Promise<void>((resolve) => {
    releaseFollowup = resolve;
  });
  const startedPromise = new Promise<void>((resolve) => {
    markFollowupStarted = resolve;
  });
  let hasDelayedFollowup = false;

  return {
    client: {
      async chat(request) {
        if (request.taskName === 'novel_trial_followup' && !hasDelayedFollowup) {
          hasDelayedFollowup = true;
          markFollowupStarted();
          await releasePromise;
        }

        return {
          content: JSON.stringify({
            ...createFakeDeepSeekPayload(request.taskName ?? 'unknown_task'),
            debugRaw: 'FULL_MODEL_RESPONSE_SHOULD_NOT_LEAK'
          }),
          model: request.model,
          usage: {
            promptTokens: 24,
            completionTokens: 48,
            totalTokens: 72
          }
        };
      }
    },
    waitForFollowup: () => startedPromise,
    releaseFollowup
  };
}

function createDelayedBodyFakeLlmClient(): { client: LlmClient; waitForBody: () => Promise<void>; releaseBody: () => void; getBodyCallCount: () => number } {
  let releaseBody!: () => void;
  let markBodyStarted!: () => void;
  const releasePromise = new Promise<void>((resolve) => {
    releaseBody = resolve;
  });
  const startedPromise = new Promise<void>((resolve) => {
    markBodyStarted = resolve;
  });
  let hasDelayedBody = false;
  let bodyCallCount = 0;

  return {
    client: {
      async chat(request) {
        if (request.taskName === 'novel_body_chapter_generate') {
          bodyCallCount += 1;
          if (!hasDelayedBody) {
            hasDelayedBody = true;
            markBodyStarted();
            await releasePromise;
          }
        }

        return {
          content: JSON.stringify({
            ...createFakeDeepSeekPayload(request.taskName ?? 'unknown_task'),
            debugRaw: 'FULL_MODEL_RESPONSE_SHOULD_NOT_LEAK'
          }),
          model: request.model,
          usage: {
            promptTokens: 24,
            completionTokens: 48,
            totalTokens: 72
          }
        };
      }
    },
    waitForBody: () => startedPromise,
    releaseBody,
    getBodyCallCount: () => bodyCallCount
  };
}

function createFailingBodyFakeLlmClient(): LlmClient {
  return {
    async chat(request) {
      if (request.taskName === 'novel_body_chapter_generate') {
        throw new Error('正文模型测试失败');
      }

      return {
        content: JSON.stringify({
          ...createFakeDeepSeekPayload(request.taskName ?? 'unknown_task'),
          debugRaw: 'FULL_MODEL_RESPONSE_SHOULD_NOT_LEAK'
        }),
        model: request.model,
        usage: {
          promptTokens: 24,
          completionTokens: 48,
          totalTokens: 72
        }
      };
    }
  };
}

function createCountingBodyFakeLlmClient(): { client: LlmClient; getBodyCallCount: () => number } {
  let bodyCallCount = 0;

  return {
    client: {
      async chat(request) {
        if (request.taskName === 'novel_body_chapter_generate') {
          bodyCallCount += 1;
        }

        return {
          content: JSON.stringify({
            ...createFakeDeepSeekPayload(request.taskName ?? 'unknown_task'),
            debugRaw: 'FULL_MODEL_RESPONSE_SHOULD_NOT_LEAK'
          }),
          model: request.model,
          usage: {
            promptTokens: 24,
            completionTokens: 48,
            totalTokens: 72
          }
        };
      }
    },
    getBodyCallCount: () => bodyCallCount
  };
}

function createFakeDeepSeekPayload(taskName: string): Record<string, unknown> {
  if (taskName === 'novel_direction_generate' || taskName === 'novel_direction_fuse' || taskName === 'novel_direction_optimize') {
    return {
      candidates: [1, 2, 3].map((index) => ({
        title: `DeepSeek 方向 ${index}`,
        summary: `第 ${index} 个方向围绕低谷翻盘展开。`,
        content: `主角在第 ${index} 条主线中被误解后寻找证据，逐步反击并形成短视频钩子。`,
        score: 88 - index,
        marketScore: 86 - index,
        riskLevel: 'low',
        riskTags: ['节奏可控'],
        recommendedReason: '冲突清楚，适合作为短篇主线。'
      }))
    };
  }

  if (taskName.startsWith('novel_structure_chapter_plan_')) {
    return {
      chapters: [1, 2, 3, 4, 5].map((chapterNo) => ({
        chapterNo,
        stageIndex: 1,
        title: `第${chapterNo}章`,
        wordTarget: 2200,
        goal: `第${chapterNo}章推进翻盘线索`,
        conflict: '外界质疑升级',
        hook: '新证据出现'
      }))
    };
  }

  if (taskName.startsWith('novel_structure_')) {
    return {
      title: `${taskName} 候选`,
      summary: '结构清晰，能支撑 5 章短篇闭环。',
      content: {
        sections: [
          { title: '开局', summary: '误解爆发并留下证据钩子。' },
          { title: '反击', summary: '主角逐步拿回主动权。' }
        ],
        stages: [{ title: '第一阶段', chapterRange: '1-5', goal: '完成翻盘闭环' }],
        chapters: [1, 2, 3, 4, 5].map((chapterNo) => ({
          chapterNo,
          title: `第${chapterNo}章`,
          summary: `第${chapterNo}章推进翻盘线索。`
        }))
      },
      score: 85,
      riskLevel: 'low',
      riskTags: ['结构稳定'],
      recommendedReason: '章节粒度适合短篇 E2E 验收。'
    };
  }

  if (taskName === 'novel_trial_chapter_one') {
    return {
      candidates: [1, 2, 3].map((index) => ({
        title: `第1章 候选 ${index}`,
        content: `所有人都以为林舟完了。候选 ${index} 让主角在公开误解中抓住证据，并把第一个反击钩子抛给读者。`.repeat(60),
        openingStrategy: '强冲突开场',
        openingHighlight: '主角被误解但迅速发现破局证据',
        firstSentence: '所有人都以为林舟完了。',
        first300Summary: '林舟被公开误解，仍冷静找到关键证据。',
        endingHook: '监控备份里出现了第二个人。',
        riskLevel: 'low',
        riskTags: ['无明显风险'],
        aiRecommendedReason: index === 1 ? '节奏最快，钩子最清楚。' : '可作为备选开篇。',
        isAiRecommended: index === 1,
        scoring: createFakeScoring(88 - index)
      }))
    };
  }

  if (taskName === 'novel_trial_followup') {
    return {
      chapters: [2, 3].map((chapterNo) => ({
        chapterNo,
        title: `第${chapterNo}章 深挖证据`,
        content: `第${chapterNo}章中，林舟沿着第1章线索继续推进，证据链和人物动机都更清楚。`.repeat(70),
        summary: `第${chapterNo}章承接第1章证据钩子。`,
        openingStrategy: '承接反击',
        openingHighlight: '证据链继续扩大',
        firstSentence: '林舟没有解释，只把第二段视频推到众人面前。',
        first300Summary: '主角继续顺着证据追查，旧公司开始露出破绽。',
        endingHook: '真正的幕后操盘者打来电话。',
        riskLevel: 'low',
        riskTags: ['无明显风险'],
        aiRecommendedReason: '与第1章承接稳定。',
        scoring: createFakeScoring(84),
        featureCard: createFakeFeatureCard(chapterNo),
        review: createFakeChapterReview(84),
        hardFailed: false,
        hardFailureReasons: []
      })),
      review: {
        totalScore: 86,
        trialResult: 'pass',
        summary: '前三章开篇冲突、反击节奏和视频化钩子都清楚。',
        strengths: ['冲突直接', '承接稳定'],
        problems: [],
        suggestions: ['后续保持每章一个反击点'],
        recommendedAction: 'confirm_trial',
        allowNextStep: true,
        requiresRiskConfirmation: false,
        chapterScores: [
          { chapterNo: 1, score: 87 },
          { chapterNo: 2, score: 84 },
          { chapterNo: 3, score: 84 }
        ]
      }
    };
  }

  if (taskName === 'novel_body_chapter_generate' || taskName === 'novel_chapter_rewrite') {
    return {
      title: '批量正文章节',
      content: '林舟继续推进证据链，章节保持试写确认后的节奏和反击密度。'.repeat(90),
      summary: '本章继续推进证据链和反击节奏。',
      openingStrategy: '延续反击节奏',
      openingHighlight: '新的证据推动主线升级',
      firstSentence: '林舟把第三份证据放到了桌上。',
      first300Summary: '主角继续沿着证据推进，反派开始慌乱。',
      endingHook: '旧公司的真正账本出现了。',
      riskLevel: 'low',
      riskTags: ['无明显风险'],
      aiRecommendedReason: '符合策略快照。',
      scoring: createFakeScoring(85),
      featureCard: createFakeFeatureCard(4),
      review: createFakeChapterReview(85),
      memory: {
        summary: '林舟获得更多证据，旧公司压力上升。',
        facts: ['账本线索出现'],
        foreshadows: ['幕后操盘者将露面']
      },
      hardFailed: false,
      hardFailureReasons: []
    };
  }

  if (taskName === 'novel_impact_assess') {
    return {
      impactLevel: 'none',
      summary: '改动只影响当前章节表达。',
      changedFacts: [],
      affectedChapterIds: [],
      affectedVideoReferenceIds: [],
      recommendedHandling: '无需额外处理',
      suggestedActions: [],
      blocksFullReview: false
    };
  }

  if (taskName === 'novel_full_review') {
    return {
      totalScore: 88,
      rating: 'A',
      gateResult: 'pass',
      summary: '短篇主线完整，章节承接稳定，适合进入待视频化。',
      strengths: ['前三秒冲突清楚', '章节节奏稳定'],
      problems: [],
      suggestions: ['首条视频突出误解和证据反转'],
      dimensionScores: [
        { key: 'continuity', label: '连续性', score: 88, weight: 0.4 },
        { key: 'video', label: '视频化', score: 87, weight: 0.3 }
      ],
      issues: [],
      videoSuggestion: '建议首条视频覆盖第1章公开误解到证据出现。',
      firstVideoSuggestion: {
        chapterRange: '1-1',
        firstThreeSecondVoiceover: '所有人都以为他完了。',
        firstScreenSubtitle: '被全网误解后，他反手拿出证据',
        titleHook: '被误解的他，反手拿出关键证据',
        endingSuspense: '监控备份里出现第二个人'
      },
      platformRisks: [],
      originalityRisks: [],
      aiFlavorRisks: [],
      lowScoreContinueRisks: [],
      reviewPolicyVersionId: 'policy-full-review-v1'
    };
  }

  return {
    title: '默认 fake 输出',
    summary: '默认 fake 输出。',
    content: { note: 'default' },
    score: 80,
    riskLevel: 'low',
    riskTags: [],
    recommendedReason: '默认 fake 输出。'
  };
}

function createFakeScoring(totalScore: number) {
  return {
    totalScore,
    gateConclusion: 'pass',
    dimensions: [
      { key: 'opening', label: '开篇吸引力', score: totalScore, weight: 0.4, evidence: '冲突清楚', deductions: [] }
    ]
  };
}

function createFakeFeatureCard(chapterNo: number) {
  return {
    highlights: [`第${chapterNo}章反击点`],
    characters: ['林舟'],
    plotPoints: [`第${chapterNo}章推进证据链`],
    risks: []
  };
}

function createFakeChapterReview(totalScore: number) {
  return {
    totalScore,
    issues: [],
    suggestions: ['保持节奏'],
    riskLevel: 'low'
  };
}
