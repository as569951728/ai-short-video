import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Writable } from 'node:stream';
import { ErrorCode, NOVEL_PROVIDER_ACTIONS, RiskLevel, TaskStatus, type NovelProviderAction } from '@ai-shortvideo/shared';
import Fastify from 'fastify';
import { buildApp as buildBaseApp } from '../../app.js';
import type { LlmClient } from '../ai/llmClient.js';
import { createInMemoryNovelRepository } from './repositories/inMemoryNovelRepository.js';
import type { NovelRepository } from './domain/novelDomain.js';
import type { HotspotReferenceGateway, HotspotReferenceValidationInput } from './integrations/hotspotReferenceGateway.js';
import { BusinessError, toErrorResponse } from '../../shared/errors.js';
import { registerNovelRoutes } from './routes/novelRoutes.js';
import { toRecentTaskSummaryDTO } from '../tasks/services/taskService.js';
import {
  ACTION_EXECUTION_PLANS,
  ACTION_INPUT_KEYS,
  executeNovelProviderAction,
  listActionExecutionPlans,
  type CreativeAssetProviderInputV1,
  type NovelProviderSet,
  type StructureCurrentAssetsProviderInputV1,
  type StructureProviderAction
} from './services/actionExecutionPlan.js';
import { createActorScopedIdempotencyToken, hashCanonicalJson } from './services/taskClaim.js';
import { MockBodyProvider } from './providers/mockBodyProvider.js';
import { MockDirectionProvider } from './providers/mockDirectionProvider.js';
import { MockFullReviewProvider } from './providers/mockFullReviewProvider.js';
import { MockStructureProvider } from './providers/mockStructureProvider.js';
import { MockTrialProvider } from './providers/mockTrialProvider.js';
import { DeepSeekNovelProvider } from './providers/deepseekNovelProvider.js';
type MockBodyChapter = Awaited<ReturnType<MockBodyProvider['generateBodyChapter']>>;
type MockTrialFollowup = Awaited<ReturnType<MockTrialProvider['generateFollowup']>>;
const buildApp = (options: Parameters<typeof buildBaseApp>[0] = {}) => buildBaseApp({
  requestContextResolver: async () => ({ tenantId: 'tenant_test', userId: 'user_test' }),
  ...options
});
it('rejects default actor identities before task creation', async () => {
  for (const actor of [{ tenantId: 'tenant_default', userId: 'user_test' }, { tenantId: 'tenant_test', userId: 'user_default' }]) {
    const repository = createInMemoryNovelRepository();
    const app = await buildBaseApp({ logger: false, novelRepository: repository, requestContextResolver: async () => actor });
    const response = await app.inject({ method: 'POST', url: '/novels/drafts', payload: { title: 'default actor rejected', genres: ['test'], preferences: { appealPoints: ['test'], targetAudience: 'test' }, chapterLimit: 8, chapterWordRange: { min: 1200, max: 1600 } } });
    assert.equal(response.statusCode, 401, response.body); assert.equal(repository.getGenerationTasks().length, 0); await app.close();
  }
});
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

  it('sanitizes and freezes every provider-backed task type while preserving non-matches', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      now: () => new Date('2026-06-17T13:10:00.000Z')
    });
    const novelId = await createDraft(app, '任务投影矩阵测试');
    const generated = await generateDirections(app, novelId);
    const template = repository.getGenerationTasks().find((task) => task.id === generated.task.id)!;
    const eventTemplate = repository.getGenerationTaskEvents().find((event) => event.taskId === template.id)!;
    const raw = 'RAW_PROVIDER_ERROR_CANARY/稍后重试';
    const taskTypes = [...new Set(listActionExecutionPlans().map((plan) => plan.taskType))];
    const matrixTasks = taskTypes.map((taskType, index) => ({
      ...template, id: `task_matrix_${index}`, novelId: null, taskType, status: TaskStatus.Failed,
      currentStep: raw, statusNote: raw, errorCode: raw, errorMessage: raw
    }));
    repository.getGenerationTasks().push(...matrixTasks);
    repository.getGenerationTaskEvents().push(...matrixTasks.map((task, index) => ({
      ...eventTemplate, id: `event_matrix_${index}`, taskId: task.id, status: TaskStatus.Failed,
      eventType: 'task_failed', message: raw
    })));
    const before = snapshotTaskRetrySideEffects(repository);

    for (const task of matrixTasks) {
      const detailResponse = await app.inject({ method: 'GET', url: `/tasks/${task.id}` });
      assert.equal(detailResponse.statusCode, 200, task.taskType);
      const detail = detailResponse.json().data;
      assert.deepEqual(
        [detail.currentStep, detail.statusNote, detail.errorCode, detail.errorMessage, detail.userFailureReason, detail.nextAction.type, detail.retryable],
        ['生成任务失败，暂不支持直接重试', '任务执行失败，未写入新的候选或正式内容。', 'PROVIDER_ERROR', '任务执行失败，未写入新的候选或正式内容。', '任务执行失败，未写入新的候选或正式内容。', 'disabled', false],
        task.taskType
      );
      const events = (await app.inject({ method: 'GET', url: `/tasks/${task.id}/events` })).json().data.items;
      const recent = toRecentTaskSummaryDTO(task);
      assert.ok(detail.events.every((event: any) => event.message === '任务执行失败，未写入新的候选或正式内容。'), task.taskType);
      assert.ok(events.every((event: any) => event.message === '任务执行失败，未写入新的候选或正式内容。'), task.taskType);
      assert.deepEqual([recent.currentStep, recent.errorCode, recent.errorMessage], ['生成任务失败，暂不支持直接重试', 'PROVIDER_ERROR', '任务执行失败，未写入新的候选或正式内容。']);
      assert.doesNotMatch(JSON.stringify({ detail, events, recent }), /RAW_PROVIDER_ERROR_CANARY|稍后重试/, task.taskType);
      const retry = await app.inject({ method: 'POST', url: `/tasks/${task.id}/retry`, payload: {} });
      assert.equal(retry.statusCode, 409, task.taskType);
      assert.equal(retry.json().error.code, ErrorCode.RetryNotAvailable, task.taskType);
    }
    assert.deepEqual(snapshotTaskRetrySideEffects(repository), before);
    Object.assign(template, { currentStep: 'provider current', statusNote: 'provider note', errorCode: 'PROVIDER_DIAGNOSTIC', errorMessage: 'provider diagnostic' });
    for (const event of repository.getGenerationTaskEvents().filter((item) => item.taskId === template.id)) event.message = 'provider event';
    const providerDetail = (await app.inject({ method: 'GET', url: `/tasks/${template.id}` })).json().data;
    const providerRecent = toRecentTaskSummaryDTO(template);
    assert.deepEqual([providerDetail.currentStep, providerDetail.statusNote, providerDetail.errorCode, providerDetail.errorMessage, providerDetail.events[0].message, providerRecent.errorCode, providerRecent.errorMessage], [template.currentStep, template.statusNote, template.errorCode, template.errorMessage, 'provider event', template.errorCode, template.errorMessage]);
    for (const status of Object.values(TaskStatus)) { template.status = status; const retry = await app.inject({ method: 'POST', url: `/tasks/${template.id}/retry`, payload: {} }); assert.deepEqual([retry.statusCode, retry.json().error.code], [409, ErrorCode.RetryNotAvailable], status); }
    assert.deepEqual(snapshotTaskRetrySideEffects(repository), before);

    const nonProviderTask = { ...template, id: 'task_non_provider_failed', taskType: 'video_render', status: TaskStatus.Failed, currentStep: 'video step', statusNote: 'video note', errorCode: 'VIDEO_ERROR', errorMessage: 'video failure' };
    repository.getGenerationTasks().push(nonProviderTask);
    repository.getGenerationTaskEvents().push({ ...eventTemplate, id: 'event_non_provider_failed', taskId: nonProviderTask.id, status: TaskStatus.Failed, message: 'video event' });
    const nonProviderDetail = (await app.inject({ method: 'GET', url: `/tasks/${nonProviderTask.id}` })).json().data;
    assert.deepEqual([nonProviderDetail.currentStep, nonProviderDetail.statusNote, nonProviderDetail.errorCode, nonProviderDetail.errorMessage, nonProviderDetail.userFailureReason, nonProviderDetail.events[0].message, nonProviderDetail.nextAction.type, nonProviderDetail.retryable], ['video step', 'video note', 'VIDEO_ERROR', 'video failure', 'video failure', 'video event', 'retry_task', true]);
    assert.deepEqual([toRecentTaskSummaryDTO(nonProviderTask).errorCode, toRecentTaskSummaryDTO(nonProviderTask).errorMessage], ['VIDEO_ERROR', 'video failure']);
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
    activeTask.status = TaskStatus.Processing;
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

  it('prioritizes retry freeze when provider failure is both stale and actively conflicted', async () => {
    const repository = createInMemoryNovelRepository();
    let providerCalls = 0;
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
          providerCalls += 1;
          return { content: JSON.stringify(createFakeDeepSeekPayload(request.taskName)), model: request.model };
        }
      },
      now: () => new Date('2026-06-17T13:40:00.000Z')
    });
    const { novelId } = await createNovelWithAdoptedDirection(app);
    const failedDirectionTask = repository.getGenerationTasks().find((task) => task.taskType === 'novel_direction_generate')!; Object.assign(failedDirectionTask, { status: TaskStatus.Failed, failureCategory: 'provider_error', currentStep: 'RAW_DIRECTION_PROVIDER_CANARY', statusNote: 'RAW_DIRECTION_PROVIDER_CANARY', errorCode: 'RAW_DIRECTION_PROVIDER_CANARY', errorMessage: '生成服务暂时没有响应，请稍后重试。' });
    const directionBefore = snapshotTaskRetrySideEffects(repository, providerCalls); const directionReplay = await app.inject({ method: 'POST', url: `/novels/${novelId}/directions/generate`, payload: { idempotencyKey: requestFallbackIdempotencyKey(failedDirectionTask) } });
    assert.equal(directionReplay.statusCode, 409); assert.equal(directionReplay.json().error.code, ErrorCode.VersionConflict); assert.equal(directionReplay.json().error.details.code, 'SOURCE_STALE'); assert.deepEqual(snapshotTaskRetrySideEffects(repository, providerCalls), directionBefore);
    const firstSetting = await postStructure(app, novelId, 'settings', 'generate');
    await postStructure(app, novelId, 'settings', 'adopt', firstSetting.candidate.id, {
      reason: '先采用设定。'
    });
    const outline = await postStructure(app, novelId, 'outlines', 'generate');
    const failedOutlineTask = repository.getGenerationTasks().find((task) => task.id === outline.task.id)!;
    Object.assign(failedOutlineTask, {
      status: 'failed',
      failureCategory: 'provider_error',
      currentStep: 'RAW_STRUCTURE_PROVIDER_CANARY', statusNote: 'RAW_STRUCTURE_PROVIDER_CANARY',
      errorCode: 'MOCK_PROVIDER_TIMEOUT',
      errorMessage: '生成服务暂时没有响应，请稍后重试。'
    });
    const replayBefore = snapshotTaskRetrySideEffects(repository, providerCalls); const structureReplay = await postStructure(app, novelId, 'outlines', 'generate', undefined, { idempotencyKey: requestFallbackIdempotencyKey(failedOutlineTask) });
    assert.deepEqual([structureReplay.task.id, structureReplay.task.currentStep, structureReplay.task.errorCode, structureReplay.task.errorMessage], [failedOutlineTask.id, '生成任务失败，暂不支持直接重试', 'PROVIDER_ERROR', '任务执行失败，未写入新的候选或正式内容。']);
    assert.doesNotMatch(JSON.stringify(structureReplay.task), /RAW_STRUCTURE_PROVIDER_CANARY|稍后重试/); assert.deepEqual(snapshotTaskRetrySideEffects(repository, providerCalls), replayBefore);

    const secondSetting = await postStructure(app, novelId, 'settings', 'generate');
    await postStructure(app, novelId, 'settings', 'adopt', secondSetting.candidate.id, {
      reason: '重新采用设定，旧大纲任务应过期。'
    });
    const activeConflictTask = { ...failedOutlineTask, id: 'task_active_outline_conflict', status: TaskStatus.Processing };
    repository.getGenerationTasks().push(activeConflictTask);
    const novel = await repository.findById('tenant_test', novelId);
    assert.notEqual((failedOutlineTask.sourceVersionRefs as Record<string, unknown>).currentSettingVersionId, novel?.currentSettingVersionId);
    assert.equal((await repository.findActiveTaskByConflict('tenant_test', failedOutlineTask.conflictScope!, failedOutlineTask.conflictKey!))?.id, activeConflictTask.id);
    const before = snapshotTaskRetrySideEffects(repository, providerCalls);
    const taskBefore = JSON.stringify(failedOutlineTask);

    const retryResponse = await app.inject({
      method: 'POST',
      url: `/tasks/${failedOutlineTask.id}/retry`,
      payload: {
        reason: '尝试重试旧大纲任务'
      }
    });
    assert.equal(retryResponse.statusCode, 409);
    assert.equal(retryResponse.json().error.code, ErrorCode.RetryNotAvailable);
    assert.deepEqual(snapshotTaskRetrySideEffects(repository, providerCalls), before);
    assert.equal(JSON.stringify(failedOutlineTask), taskBefore);
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
  it('keeps trial assets unchanged through provider processing and atomic finalize', async () => {
    const repository = createInMemoryNovelRepository();
    const delayedClient = createDelayedFollowupFakeLlmClient();
    const atomicFinalize = repository.selectTrialChapterOneAndGenerateFollowup; let releaseFinalize!: () => void; let markFinalize!: () => void;
    const finalizeRelease = new Promise<void>((resolve) => { releaseFinalize = resolve; }); const finalizeStarted = new Promise<void>((resolve) => { markFinalize = resolve; });
    repository.selectTrialChapterOneAndGenerateFollowup = async (input) => { markFinalize(); await finalizeRelease; return atomicFinalize(input); };
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
    assert.equal(during.latestTrialRun.status, 'waiting_chapter1_selection');
    assert.equal(during.latestTrialRun.selectedChapterOneCandidateId, null);
    const processingTask = repository.getGenerationTasks().find((task) => task.taskType === 'trial_followup_generate'); assert.equal(processingTask?.status, TaskStatus.Processing);
    assert.equal(during.statusSummary.stageStatus, 'processing');
    assert.equal(during.statusSummary.displayStatus, 'trial_followup_processing');
    assert.equal(during.statusSummary.recommendedAction.type, 'view_task');
    assert.equal(during.latestTrialRun.chapterOneCandidates.find((candidate: any) => candidate.id === selectedCandidate.id).status, 'candidate');
    const duplicateResponse = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/trial/generate`,
      payload: followupPayload
    });
    assert.equal(duplicateResponse.statusCode, 200);
    const duplicate = duplicateResponse.json().data;
    assert.equal(duplicate.task.id, processingTask?.id);
    assert.equal(repository.getGenerationTasks().filter((task) => task.taskType === 'trial_followup_generate').length, 1);

    delayedClient.releaseFollowup();
    await finalizeStarted;
    const beforeFinalizeTrial = repository.getTrialRuns().find((item) => item.id === firstStep.trialRun.id); const beforeFinalizeCandidate = repository.getChapterContentVersions().find((item) => item.id === selectedCandidate.id);
    assert.deepEqual([beforeFinalizeTrial?.status, (beforeFinalizeTrial?.metadata as Record<string, unknown>)?.selectedChapterOneCandidateId ?? null, beforeFinalizeCandidate?.status, (beforeFinalizeCandidate?.metadata as Record<string, unknown>)?.isSelected ?? null, (beforeFinalizeCandidate?.metadata as Record<string, unknown>)?.followupStatus ?? null], ['waiting_chapter1_selection', null, 'candidate', null, null]); releaseFinalize();
    const followup = await followupPromise;
    assert.equal(followup.trialRun.status, 'review_ready');
    assert.equal(followup.task.id, processingTask?.id);
    assert.equal(followup.task.status, TaskStatus.WaitingConfirmation);
    assert.equal(repository.getGenerationTasks().filter((task) => task.taskType === 'trial_followup_generate').length, 1);

    const terminalReplay = await app.inject({ method: 'POST', url: `/novels/${novelId}/trial/generate`, payload: followupPayload });
    assert.equal(terminalReplay.statusCode, 409); assert.equal(terminalReplay.json().error.code, ErrorCode.VersionConflict); assert.equal(terminalReplay.json().error.details.code, 'SOURCE_STALE');
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
    await app.close();
  });
  it('rejects incomplete, out-of-scope, duplicate, and failure-mismatched follow-up output as provider errors', async () => {
    const block = (p: MockTrialFollowup) => { p.chapters.pop(); p.review.chapterScores.pop(); p.chapters[1].hardFailed = true; Object.assign(p.review, { trialResult: 'blocked' as const, allowNextStep: false, chapterScores: p.review.chapterScores.map((score) => ({ ...score, hardFailed: score.chapterNo === 2 })) }); }; const hardFail = (p: MockTrialFollowup) => { block(p); const chapter = p.chapters[1]; Object.assign(chapter.scoring, { hardFailure: true, gateResult: 'hard_fail', hardFailureReasons: ['硬失败原因'] }); Object.assign(chapter.review, { allowNextStep: false, metadata: { ...chapter.review.metadata, hardFailed: true } }); chapter.hardFailureReasons = ['硬失败原因']; }; const cases: Record<string, (payload: MockTrialFollowup) => void> = { omittedDraft: (p) => p.chapters.pop(), outOfScopeDraft: (p) => { p.chapters[2].chapter = { id: 'outside', chapterNo: 99 }; }, duplicateDraft: (p) => { p.chapters[2].chapter = p.chapters[1].chapter; }, omittedScore: (p) => p.review.chapterScores.pop(), outOfScopeScore: (p) => { p.review.chapterScores[2].chapterNo = 99; }, duplicateScore: (p) => { p.review.chapterScores[2].chapterNo = 2; }, scoreVsScoring: (p) => { p.review.chapterScores[1].score += 1; }, scoreVsReview: (p) => { p.chapters[1].review.totalScore += 1; }, allScores999: (p) => { p.review.chapterScores[1].score = 999; p.chapters[1].scoring.totalScore = 999; p.chapters[1].review.totalScore = 999; }, chapterHardFailedMismatch: (p) => { p.review.chapterScores[1].hardFailed = true; }, scoringHardFailureMismatch: (p) => { p.chapters[1].scoring.hardFailure = true; }, reviewMetadataHardFailedMismatch: (p) => { p.chapters[1].review.metadata.hardFailed = true; }, nonBlockedHardFailure: (p) => { p.chapters[1].hardFailed = true; p.review.chapterScores[1].hardFailed = true; }, blockedWithoutHardFailure: (p) => { p.chapters.pop(); p.review.chapterScores.pop(); Object.assign(p.review, { trialResult: 'blocked' as const, allowNextStep: false }); }, blockedAllowsNextStep: (p) => { block(p); p.review.allowNextStep = true; }, hardFailedGateMismatch: (p) => { hardFail(p); p.chapters[1].scoring.gateResult = 'pass'; }, hardFailedAllowMismatch: (p) => { hardFail(p); p.chapters[1].review.allowNextStep = true; }, hardFailedReasonsMismatch: (p) => { hardFail(p); p.chapters[1].hardFailureReasons = []; p.chapters[1].scoring.hardFailureReasons = []; }, mismatchedFailure: (p) => { block(p); p.review.chapterScores[1].hardFailed = false; p.review.chapterScores[0].hardFailed = true; } };
    Object.assign(cases, { totalScoreMeanMismatch: (p: MockTrialFollowup) => { p.review.totalScore += 1; }, passDisallowsNextStep: (p: MockTrialFollowup) => { p.review.allowNextStep = false; }, dimensionScoreAboveRange: (p: MockTrialFollowup) => { p.chapters[1].scoring.dimensions[0].score = 101; }, numericReviewSubScoreAboveRange: (p: MockTrialFollowup) => { (p.chapters[1].review.subScores as Record<string, string | number>).quality = 101; }, scoringStrategyVersionMismatch: (p: MockTrialFollowup) => { p.chapters[1].scoring.scoringStrategyVersion = 'mismatch-score-v2'; }, reviewSubScoreVersionMismatch: (p: MockTrialFollowup) => { p.chapters[1].review.subScores.scoringStrategyVersion = 'mismatch-review-v2'; }, invalidGateResult: (p: MockTrialFollowup) => { p.chapters[1].scoring.gateResult = 'invalid' as typeof p.chapters[number]['scoring']['gateResult']; } });
    const generateFollowup = MockTrialProvider.prototype.generateFollowup; for (const [name, mutate] of Object.entries(cases)) { const repository = createInMemoryNovelRepository(); let providerReturns = 0; let finalizeCalls = 0; const finalize = repository.selectTrialChapterOneAndGenerateFollowup;
      repository.selectTrialChapterOneAndGenerateFollowup = async (input) => { finalizeCalls += 1; return finalize(input); }; MockTrialProvider.prototype.generateFollowup = async function(input) { const output = await generateFollowup.call(this, input); mutate(output); providerReturns += 1; return output; }; const app = await buildApp({ logger: false, novelRepository: repository });
      try { const { novelId } = await createNovelReadyForTrial(app, `非法试写拒绝测试-${name}`, 5); const first = await postTrialGenerate(app, novelId); const selected = first.trialRun.chapterOneCandidates.find((candidate: any) => candidate.isAiRecommended); const stateSnapshot = async (excludedTaskId?: string) => { const trial = repository.getTrialRuns().find((item) => item.id === first.trialRun.id); const novel = await repository.findById('tenant_test', novelId); return JSON.stringify({ creativeVersions: repository.getCreativeVersions(), contentVersions: repository.getChapterContentVersions(), chapterPointers: repository.getNovelChapters(), operationLogs: repository.getOperationLogs(), trialSelection: { selectedCandidateId: (trial?.metadata as Record<string, unknown> | null)?.selectedChapterOneCandidateId, sourceTaskId: trial?.sourceTaskId, chapterResults: await repository.listTrialChapterResults('tenant_test', first.trialRun.id) }, novelCurrentPointers: { direction: novel?.currentDirectionVersionId, setting: novel?.currentSettingVersionId, outline: novel?.currentOutlineVersionId, stageOutline: novel?.currentStageOutlineVersionId, chapterPlan: novel?.currentChapterPlanVersionId }, existingTasks: repository.getGenerationTasks().filter((item) => item.id !== excludedTaskId), existingEvents: repository.getGenerationTaskEvents().filter((item) => item.taskId !== excludedTaskId) }); }; const stateBefore = await stateSnapshot();
        const response = await app.inject({ method: 'POST', url: `/novels/${novelId}/trial/generate`, payload: { trialRunId: first.trialRun.id, selectedCandidateId: selected.id } }); const task = repository.getGenerationTasks().findLast((item) => item.taskType === 'trial_followup_generate'); const failedNovel = await repository.findById('tenant_test', novelId); const failedTrial = repository.getTrialRuns().find((item) => item.id === first.trialRun.id); const taskEvents = repository.getGenerationTaskEvents().filter((item) => item.taskId === task?.id).map((item) => item.eventType);
        assert.ok(response.statusCode >= 400, name); assert.deepEqual([providerReturns, finalizeCalls, task?.failureCategory, task?.errorCode, task?.resultReceiptHash, taskEvents, failedTrial?.status, failedNovel?.creationStage, failedNovel?.stageStatus], [1, 0, 'provider_error', 'PROVIDER_ERROR', null, ['task_claimed', 'failed'], 'followup_failed', 'trial', 'failed'], name); assert.equal(await stateSnapshot(task?.id), stateBefore, name);
      } finally { MockTrialProvider.prototype.generateFollowup = generateFollowup; await app.close(); }
    }
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

  it('rejects contradictory body provider output before finalizing batch, chapter, or rewrite writes', async () => {
    const hardFail = (draft: MockBodyChapter) => { draft.hardFailed = true; Object.assign(draft.scoring, { hardFailure: true, gateResult: 'hard_fail', hardFailureReasons: ['硬失败原因'] }); Object.assign(draft.review, { allowNextStep: false, metadata: { ...draft.review.metadata, hardFailed: true } }); draft.hardFailureReasons = ['硬失败原因']; };
    const cases: Record<string, (draft: MockBodyChapter) => void> = { hardFailedMismatch: (draft) => { draft.hardFailed = true; }, scoringHardFailureMismatch: (draft) => { draft.scoring.hardFailure = true; }, reviewMetadataHardFailedMismatch: (draft) => { draft.review.metadata.hardFailed = true; }, scoreMismatch: (draft) => { draft.review.totalScore += 1; }, scoreBelowRange: (draft) => { draft.scoring.totalScore = -1; draft.review.totalScore = -1; }, scoreAboveRange: (draft) => { draft.scoring.totalScore = 101; draft.review.totalScore = 101; }, gateResultMismatch: (draft) => { draft.scoring.gateResult = 'hard_fail'; }, allowNextStepMismatch: (draft) => { draft.review.allowNextStep = false; }, reasonsWithoutHardFailure: (draft) => { draft.hardFailureReasons = ['错误硬失败原因']; draft.scoring.hardFailureReasons = ['错误硬失败原因']; }, hardFailureWithoutReasons: (draft) => { hardFail(draft); draft.hardFailureReasons = []; draft.scoring.hardFailureReasons = []; } };
    Object.assign(cases, { dimensionScoreAboveRange: (draft: MockBodyChapter) => { draft.scoring.dimensions[0].score = 101; }, numericReviewSubScoreAboveRange: (draft: MockBodyChapter) => { (draft.review.subScores as Record<string, string | number>).quality = 101; }, scoringStrategyVersionMismatch: (draft: MockBodyChapter) => { draft.scoring.scoringStrategyVersion = 'mismatch-score-v2'; }, reviewSubScoreVersionMismatch: (draft: MockBodyChapter) => { draft.review.subScores.scoringStrategyVersion = 'mismatch-review-v2'; }, invalidGateResult: (draft: MockBodyChapter) => { draft.scoring.gateResult = 'invalid' as typeof draft.scoring.gateResult; } });
    const routes = ['batch', 'chapter', 'rewrite'] as const; const generateBodyChapter = MockBodyProvider.prototype.generateBodyChapter; const rewriteChapter = MockBodyProvider.prototype.rewriteChapter;
    for (const route of routes) { const repository = createInMemoryNovelRepository(); const app = await buildApp({ logger: false, novelRepository: repository });
      try { const { novelId, strategySnapshot } = await createNovelReadyForBody(app, `正文跨字段拒绝测试-${route}`, 8); if (route === 'rewrite') await postBodyBatch(app, novelId, strategySnapshot); const chapter = repository.getNovelChapters().find((item) => item.novelId === novelId && item.chapterNo === 4)!; let providerReturns = 0; let finalizeCalls = 0; const finalizeBody = repository.generateBodyBatch; const finalizeRewrite = repository.rewriteChapter;
        repository.generateBodyBatch = async (input) => { finalizeCalls += 1; return finalizeBody(input); }; repository.rewriteChapter = async (input) => { finalizeCalls += 1; return finalizeRewrite(input); };
        for (const [name, mutate] of Object.entries(cases)) { MockBodyProvider.prototype.generateBodyChapter = async function(input) { const output = await generateBodyChapter.call(this, input); mutate(output); providerReturns += 1; return output; }; MockBodyProvider.prototype.rewriteChapter = async function(input) { const output = await rewriteChapter.call(this, input); mutate(output.candidate); providerReturns += 1; return output; };
          const key = `body-provider-${route}-${name}`; const before = JSON.stringify(snapshotTaskRetrySideEffects(repository, 0, { novelId })); const providerBefore = providerReturns; const finalizeBefore = finalizeCalls; const bodyPayload = { strategySnapshotId: strategySnapshot.id, expectedStrategySnapshotVersion: strategySnapshot.versionNo, idempotencyKey: key }; const [url, payload] = route === 'batch' ? [`/novels/${novelId}/chapters/batch-generate`, bodyPayload] : route === 'chapter' ? [`/novels/${novelId}/chapters/${chapter.id}/generate`, bodyPayload] : [`/novels/${novelId}/chapters/${chapter.id}/rewrite`, { currentContentVersionId: chapter.currentContentVersionId, instruction: '保持主线，仅优化表达。', reason: '验证非法 provider 输出不落库。', idempotencyKey: key }]; const response = await app.inject({ method: 'POST', url, payload }); const action = route === 'batch' ? 'body_batch_generate' : route === 'chapter' ? 'chapter_body_generate' : 'chapter_rewrite'; const task = repository.getGenerationTasks().find((item) => item.idempotencyToken === testActorScopedIdempotencyToken(action, route === 'batch' ? novelId : chapter.id, key)); const label = `${route}:${name}`;
          assert.ok(response.statusCode >= 400, label); assert.deepEqual([providerReturns - providerBefore, finalizeCalls - finalizeBefore, task?.failureCategory, task?.errorCode, task?.resultReceiptHash], [1, 0, 'provider_error', 'PROVIDER_ERROR', null], label); assert.equal(JSON.stringify(snapshotTaskRetrySideEffects(repository, 0, { novelId, excludedTaskId: task?.id })), before, label);
        }
      } finally { MockBodyProvider.prototype.generateBodyChapter = generateBodyChapter; MockBodyProvider.prototype.rewriteChapter = rewriteChapter; await app.close(); }
    }
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
    const failedTaskToken = testActorScopedIdempotencyToken('body_batch_generate', novelId, 'body-batch-save-failed-1');
    const failedTasksForRequest = bodyTasks.filter((task) => task.idempotencyToken === failedTaskToken);
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
    assert.equal(taskDetail.userFailureReason, '任务执行失败，未写入新的候选或正式内容。');
    assert.equal(taskDetail.retryable, false);
    assert.equal(taskDetail.nextAction.type, 'disabled');
    assert.equal(taskDetail.nextAction.label, '暂不支持任务重试');
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
        .filter((task) => task.taskType === 'body_batch_generate' && task.idempotencyToken === failedTaskToken).length,
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
    assert.equal(rewriteAfterAdopt.statusCode, 409, rewriteAfterAdopt.body);
    assert.equal(rewriteAfterAdopt.json().error.code, ErrorCode.VersionConflict);
    assert.equal(rewriteAfterAdopt.json().error.details.code, 'SOURCE_STALE');
    const adoptReplay = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/chapters/${chapter4.id}/content-versions/${rewrite.candidate.id}/adopt`,
      payload: adoptPayload
    });
    assert.equal(adoptReplay.statusCode, 409, adoptReplay.body);
    assert.equal(adoptReplay.json().error.code, ErrorCode.VersionConflict);
    assert.equal(adoptReplay.json().error.details.code, 'SOURCE_STALE');
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
    const fakeClient = createM1E2EFakeLlmClient();
    const app = await buildApp({
      logger: false,
      novelRepository: repository,
      aiProviderEnv: {
        AI_PROVIDER_MODE: 'deepseek',
        DEEPSEEK_API_KEY: 'test-deepseek-key-should-not-leak',
        DEEPSEEK_MODEL: 'deepseek-fake-chat',
        DEEPSEEK_REASONER_MODEL: 'deepseek-fake-reasoner'
      },
      llmClient: fakeClient.client
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
    assert.equal(followupTrial.trialRun.trialReview.trialResult, 'pass'); for (const result of followupTrial.trialRun.chapterResults) { const report = await repository.findReviewReportById('tenant_test', result.reviewReport.id); assert.ok(report); const version = result.reviewReport.scoringStrategyVersion; assert.deepEqual([(report.subScores as Record<string, unknown>).scoringStrategyVersion, (report.metadata as Record<string, unknown>).scoringStrategyVersion], [version, version]); if (result.chapterNo > 1) assert.equal(result.contentVersion.scoring.scoringStrategyVersion, version); }

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
    assert.equal(bodyBatch.batch.endChapterNo, 5); for (const chapter of repository.getNovelChapters().filter((item) => item.novelId === novelId && item.chapterNo >= 4)) { const content = repository.getChapterContentVersions().find((item) => item.id === chapter.currentContentVersionId), report = await repository.findReviewReportById('tenant_test', chapter.currentReviewReportId!); assert.ok(content && report); const version = ((content.metadata as Record<string, unknown>).scoring as { scoringStrategyVersion: string }).scoringStrategyVersion; assert.deepEqual([(report.subScores as Record<string, unknown>).scoringStrategyVersion, (report.metadata as Record<string, unknown>).scoringStrategyVersion], [version, version]); }
    assert.equal(bodyBatch.statusSummary.recommendedAction.label, '全书 AI 审稿');
    const detailBeforeReview = (await app.inject({ method: 'GET', url: `/novels/${novelId}` })).json().data;
    const reviewLogsBefore = repository.getOperationLogs().length;
    const rejectedReview = await app.inject({ method: 'POST', url: `/novels/${novelId}/full-review`, payload: { idempotencyKey: 'm1-fake-full-review-poison', expectedNovelVersion: detailBeforeReview.updatedAt } });
    assert.equal(rejectedReview.statusCode, 500); const rejectedReviewTask = repository.getGenerationTasks().find((task) => task.idempotencyToken === testActorScopedIdempotencyToken('novel_full_review', novelId, 'm1-fake-full-review-poison')); assert.equal(rejectedReviewTask?.failureCategory, 'provider_error'); assert.equal(rejectedReviewTask?.resultReceiptHash, null); assert.equal(await repository.findLatestFullReview('tenant_test', novelId), null); assert.equal(repository.getOperationLogs().length, reviewLogsBefore);
    fakeClient.allowFullReview();
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
    assert.equal(review.gateResult, 'pass'); assert.equal(review.reviewPolicyVersionId, (await repository.findById('tenant_test', novelId))?.policyProfileVersionId); assert.doesNotMatch(JSON.stringify(await repository.findLatestFullReview('tenant_test', novelId)), /MODEL_REVIEW_POLICY_CANARY/);

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

function snapshotTaskRetrySideEffects(repository: ReturnType<typeof createInMemoryNovelRepository>, provider = 0, scope?: { novelId: string; excludedTaskId?: string }) {
  const tasks = repository.getGenerationTasks().filter((task) => task.id !== scope?.excludedTaskId); const events = repository.getGenerationTaskEvents().filter((event) => event.taskId !== scope?.excludedTaskId); const scoped = scope ? { tasks, events, bodyBatches: repository.getBodyBatches().filter((batch) => batch.novelId === scope.novelId), contentVersions: repository.getChapterContentVersions().filter((version) => version.novelId === scope.novelId), memories: repository.getLongTermMemories().filter((memory) => memory.novelId === scope.novelId), impactCases: repository.getImpactCases().filter((impactCase) => impactCase.novelId === scope.novelId), decisions: repository.getAssetDecisionRecords().filter((record) => record.novelId === scope.novelId), operationLogs: repository.getOperationLogs().filter((log) => log.novelId === scope.novelId), chapterPointers: repository.getNovelChapters().filter((chapter) => chapter.novelId === scope.novelId).map((chapter) => ({ id: chapter.id, currentContentVersionId: chapter.currentContentVersionId, currentFeatureCardVersionId: chapter.currentFeatureCardVersionId, currentReviewReportId: chapter.currentReviewReportId, lastGenerationTaskId: chapter.lastGenerationTaskId, mainStatus: chapter.mainStatus, statusNote: chapter.statusNote })) } : undefined;
  return { provider, task: tasks.length, event: events.length, asset: repository.getCreativeVersions().length, receipt: tasks.filter((task) => task.resultReceiptHash).length, current: repository.getNovelChapters().filter((chapter) => chapter.currentContentVersionId).length, operationLog: repository.getOperationLogs().length, child: tasks.filter((task) => task.retryOfTaskId).length, scoped };
}
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
  const response = await app.inject({ method: 'POST', url: `/novels/${novelId}/chapters/batch-generate`, payload: { strategySnapshotId: strategySnapshot.id, expectedStrategySnapshotVersion: strategySnapshot.versionNo, idempotencyKey: `body-batch-helper-${bodyBatchHelperSequence++}` } });
  assert.equal(response.statusCode, 200, response.body); assert.equal(response.json().success, true);
  return response.json().data;
}

async function postTrialGenerate(app: Awaited<ReturnType<typeof buildApp>>, novelId: string, payload: Record<string, unknown> = {}) {
  const response = await app.inject({ method: 'POST', url: `/novels/${novelId}/trial/generate`, payload });
  assert.equal(response.statusCode, 200, response.body); assert.equal(response.json().success, true);
  return response.json().data;
}

function requestFallbackIdempotencyKey(task: { metadata: unknown }) {
  const requestId = (task.metadata as { requestId?: unknown } | null)?.requestId;
  assert.equal(typeof requestId, 'string');
  return `request:${requestId}`.slice(0, 120);
}

function testActorScopedIdempotencyToken(action: NovelProviderAction, objectId: string, rawIdempotencyKey: string) {
  return createActorScopedIdempotencyToken({
    tenantId: 'tenant_test',
    userId: 'user_test',
    action,
    objectId,
    rawIdempotencyKey
  });
}
function captureTrialFollowupSideEffects(repository: ReturnType<typeof createInMemoryNovelRepository>, novelId: string) {
  const tasks = repository.getGenerationTasks().filter((task) => task.novelId === novelId);
  return {
    followupTasks: tasks.filter((task) => task.taskType === 'trial_followup_generate').length,
    events: repository.getGenerationTaskEvents().filter((event) => tasks.some((task) => task.id === event.taskId)).length,
    contentVersions: repository.getChapterContentVersions().filter((version) => version.novelId === novelId).length,
    currentChapterPointers: repository.getNovelChapters().filter((chapter) => chapter.novelId === novelId && Boolean(chapter.currentContentVersionId)).length,
    operationLogs: repository.getOperationLogs().filter((log) => log.novelId === novelId).length,
    resultReceipts: tasks.filter((task) => Boolean(task.resultReceiptHash)).length,
    childTasks: tasks.filter((task) => Boolean(task.retryOfTaskId)).length
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

function createM1E2EFakeLlmClient(): { client: LlmClient; allowFullReview: () => void } {
  let poisonFullReview = true;
  return { client: {
    async chat(request) {
      const payload = createFakeDeepSeekPayload(request.taskName ?? 'unknown_task');
      if (request.taskName === 'novel_full_review' && poisonFullReview) payload.reviewPolicyVersionId = 'MODEL_REVIEW_POLICY_CANARY';
      return {
        content: JSON.stringify({
          ...payload,
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
  }, allowFullReview: () => { poisonFullReview = false; } };
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
        totalScore: 85,
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
      reviewPolicyVersionId: 'deepseek-full-review-v1'
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
const RAW_ENTITY_CANARY = 'RAW_ENTITY_CANARY_SHOULD_NOT_REACH_PROVIDER';
const PROVIDER_RETURNED_ID_CANARY = 'PROVIDER_RETURNED_ID_CANARY';
const novel = {
  id: 'novel-1',
  title: '测试小说',
  genres: ['都市'],
  chapterLimit: 10,
  chapterWordMin: 1000,
  chapterWordMax: 1400,
  policyProfileVersionId: 'policy-1'
};
const preferences = { appealPoints: ['反击'], targetAudience: '读者', stageCount: 3 };
const chapter = {
  id: 'chapter-1',
  chapterNo: 1,
  title: '第1章',
  wordTarget: null,
  statusNote: null
};
const providerSafeMetadata = { scoringStrategyVersion: null, hardFailed: null, candidateRank: null, isMockOutput: null };
const content = { id: 'content-1', content: '正文', summary: '摘要', reviewScore: 80, providerSafeMetadata };
const strategySnapshot = {
  id: 'strategy-1',
  versionNo: 1,
  title: null,
  summary: null,
  riskLevel: RiskLevel.Low,
  riskTags: [],
  providerSafeMetadata
};
const structureContent: CreativeAssetProviderInputV1['content'] = {
  kind: 'structure',
  sections: [{ title: '段落', body: '内容', items: [] }],
  stages: [{
    stageIndex: 1,
    title: '阶段',
    chapterRange: '1-10',
    goal: '目标',
    conflict: '冲突',
    payoff: '回报'
  }],
  chapters: []
};
const asset = (
  objectType: string,
  content: CreativeAssetProviderInputV1['content']
): CreativeAssetProviderInputV1 => ({
  id: `${objectType}-1`,
  objectType,
  versionNo: 1,
  title: objectType,
  summary: null,
  score: 80,
  riskLevel: RiskLevel.Low,
  riskTags: [],
  content
});
const upstreamAssets = {
  direction: asset('direction', { kind: 'direction', logline: '方向主线', coreHook: '核心钩子' }),
  setting: asset('setting', structureContent), outline: asset('outline', structureContent), stageOutline: asset('stage_outline', structureContent)
};
function currentAssetsFor(action: StructureProviderAction): StructureCurrentAssetsProviderInputV1 {
  return {
    direction: upstreamAssets.direction,
    setting: action === 'setting_generate' ? null : upstreamAssets.setting,
    outline: action === 'setting_generate' || action === 'outline_generate' ? null : upstreamAssets.outline,
    stageOutline: action === 'chapter_plan_generate' ? upstreamAssets.stageOutline : null
  };
}
const direction = {
  title: '方向',
  summary: '方向摘要',
  content: { title: '方向', logline: '一句话', coreHook: '钩子', audienceAppeal: '读者', videoPotential: '视频', sellingPoints: ['爽点'], riskTags: [], recommendation: '采用' },
  score: 80,
  marketScore: 82,
  riskLevel: RiskLevel.Low,
  riskTags: [],
  recommendedReason: '稳定'
};
function exactKeys(value: unknown) {
  return Object.keys(value as Record<string, unknown>).sort();
}
function createProviderSet(calls: Array<{ action: NovelProviderAction; keys: string[]; payload: unknown }>): NovelProviderSet {
  const record = <T>(action: NovelProviderAction, input: unknown, result: T | PromiseLike<T>): Promise<T> => {
    calls.push({ action, keys: exactKeys(input), payload: structuredClone(input) });
    return Promise.resolve(result);
  };
  const structureProvider = new MockStructureProvider();
  const bodyProvider = new MockBodyProvider();
  return {
    directionProvider: {
      generateCandidates: (input) => record('direction_generate', input, [direction]),
      fuseCandidates: (input) => record('direction_fuse', input, direction),
      optimizeCandidate: (input) => record('direction_optimize', input, direction)
    },
    structureProvider: {
      generateAsset: (input) => record(({ setting: 'setting_generate', outline: 'outline_generate', stage_outline: 'stage_outline_generate', chapter_plan: 'chapter_plan_generate' } as const)[input.objectType], input, structureProvider.generateAsset(input))
    },
    trialProvider: {
      generateChapterOneCandidates: (input) => record('trial_chapter_one_generate', input, []),
      generateFollowup: (input) => record('trial_followup_generate', input, { chapters: [], review: { totalScore: 80, trialResult: 'pass', summary: 'ok', strengths: [], problems: [], suggestions: [], recommendedAction: 'confirm', allowNextStep: true, requiresRiskConfirmation: false, chapterScores: [] } })
    },
    bodyProvider: {
      generateBodyChapter: (input) => record(input.action === 'chapter_body_generate' ? 'chapter_body_generate' : 'body_batch_generate', input, bodyProvider.generateBodyChapter(input)),
      rewriteChapter: (input) => record('chapter_rewrite', input, bodyProvider.rewriteChapter(input)),
      assessImpact: (input) => record(input.action === 'chapter_adopt_impact_assess' ? 'chapter_adopt_impact_assess' : 'chapter_impact_assess', input, bodyProvider.assessImpact(input))
    },
    fullReviewProvider: {
      generateFullReview: (input) => record('novel_full_review', input, { totalScore: 80, rating: 'B', gateResult: 'pass', summary: '通过', strengths: [], problems: [], suggestions: [], dimensionScores: [], issues: [], videoSuggestion: '', firstVideoSuggestion: { chapterRange: '1', openingSlice: '', narrationHook: '', firstScreenSubtitle: '', titleHook: '', endingSuspense: '', suggestedFormat: '', riskTips: [] }, platformRisks: [], originalityRisks: [], aiFlavorRisks: [], lowScoreContinueRisks: [], reviewPolicyVersionId: 'deepseek-full-review-v1' })
    }
  };
}
describe('RP-02B2a1 registry and strict provider ABI', () => {
  it('fails closed for untrusted legacy raw-token actors while preserving trusted replay', async () => {
    for (const actorCase of ['trusted', 'missing', 'null', 'default', 'mismatched'] as const) {
      const repository = createInMemoryNovelRepository();
      const providerCalls: Array<{ action: NovelProviderAction; payload: Record<string, unknown> }> = [];
      const app = Fastify({ logger: false });
      app.setErrorHandler((error, request, reply) => {
        const { statusCode, body } = toErrorResponse(error, request.id);
        reply.status(statusCode).send(body);
      });
      await registerNovelRoutes(app, {
        repository,
        requestContextResolver: async () => ({ tenantId: 'tenant_test', userId: 'user_test' }),
        ...createRouteProviderSpies(providerCalls)
      });
      try {
        const novelId = await routeCreateDraft(app);
        const idempotencyKey = `legacy-raw-${actorCase}-0001`;
        const firstResponse = await app.inject({
          method: 'POST',
          url: `/novels/${novelId}/directions/generate`,
          payload: { idempotencyKey }
        });
        assert.equal(firstResponse.statusCode, 200, firstResponse.body);
        const legacyTask = repository.getGenerationTasks().find((task) => task.taskType === 'novel_direction_generate');
        assert.ok(legacyTask, actorCase);
        Object.assign(legacyTask, { idempotencyToken: idempotencyKey, activeClaimKey: null });
        if (actorCase === 'missing') delete (legacyTask as { createdBy?: string | null }).createdBy;
        if (actorCase === 'null') legacyTask.createdBy = null;
        if (actorCase === 'default') legacyTask.createdBy = 'user_default';
        if (actorCase === 'mismatched') legacyTask.createdBy = 'user_other';

        const before = { taskCount: repository.getGenerationTasks().length, providerCount: providerCalls.length };
        const replayResponse = await app.inject({
          method: 'POST',
          url: `/novels/${novelId}/directions/generate`,
          payload: { idempotencyKey }
        });
        if (actorCase === 'trusted') {
          assert.equal(replayResponse.statusCode, 200, replayResponse.body);
          assert.equal(replayResponse.json().data.task.id, legacyTask.id);
        } else {
          assert.equal(replayResponse.statusCode, 409, `${actorCase}:${replayResponse.body}`);
          assert.equal(replayResponse.json().error.code, ErrorCode.IdempotencyConflict, actorCase);
        }
        assert.deepEqual(
          { taskCount: repository.getGenerationTasks().length, providerCount: providerCalls.length },
          before,
          `${actorCase}:legacy raw task must not create or dispatch a second task`
        );
        assert.deepEqual(before, { taskCount: 1, providerCount: 1 }, `${actorCase}:exact baseline contract`);
      } finally {
        await app.close();
      }
    }
  });
  it('covers all 15 actions with stable execution plans', () => {
    assert.deepEqual(Object.keys(ACTION_EXECUTION_PLANS).sort(), [...NOVEL_PROVIDER_ACTIONS].sort());
    assert.equal(listActionExecutionPlans().length, 15);
    assert.deepEqual(
      Object.fromEntries(['setting_generate', 'outline_generate', 'stage_outline_generate', 'chapter_plan_generate'].map((action) => [action, ACTION_EXECUTION_PLANS[action as keyof typeof ACTION_EXECUTION_PLANS].objectType])),
      {
        setting_generate: 'setting',
        outline_generate: 'outline',
        stage_outline_generate: 'stage_outline',
        chapter_plan_generate: 'chapter_plan'
      }
    );
    assert.throws(() => assertNoQueuedTaskStatus({ nested: [{ taskType: 'canary', status: TaskStatus.Queued }] }), /queued task/);
  });
  it('scenario 1 dispatcher_all_15_actions_and_unknown_handler uses strict inputs and exact side effects', async () => {
    const calls: Array<{ action: NovelProviderAction; keys: string[]; payload: unknown }> = [];
    const repository = createInMemoryNovelRepository();
    const before = await snapshotScenarioCounts(repository, calls.length);
    const providers = createProviderSet(calls);
    await executeNovelProviderAction(providers, { action: 'direction_generate', novel, preferences });
    await executeNovelProviderAction(providers, { action: 'direction_fuse', sources: [direction] });
    await executeNovelProviderAction(providers, { action: 'direction_optimize', source: direction });
    for (const pair of [
      { action: 'setting_generate', objectType: 'setting' },
      { action: 'outline_generate', objectType: 'outline' },
      { action: 'stage_outline_generate', objectType: 'stage_outline' },
      { action: 'chapter_plan_generate', objectType: 'chapter_plan' }
    ] as const) {
      await executeNovelProviderAction(providers, { ...pair, novel, preferences, currentAssets: currentAssetsFor(pair.action) });
    }
    await executeNovelProviderAction(providers, { action: 'trial_chapter_one_generate', novel, preferences, chapters: [chapter], chapterCount: 3 });
    await executeNovelProviderAction(providers, { action: 'trial_followup_generate', novel, selectedCandidate: { id: 'c1', content: '正文', summary: '摘要', reviewScore: 80, providerSafeMetadata }, chapters: [chapter] });
    await executeNovelProviderAction(providers, { action: 'body_batch_generate', novel, chapter, strategySnapshot, previousContent: null, previousMemory: { previousSummary: '前情', characterStates: [], relationshipStates: [], unresolvedConflicts: [], factsCannotContradict: ['不可矛盾'] }, previousBatchNotes: [], enhancedReview: false });
    await executeNovelProviderAction(providers, { action: 'chapter_body_generate', novel, chapter, strategySnapshot, previousContent: null, previousMemory: null, previousBatchNotes: [], enhancedReview: false });
    await executeNovelProviderAction(providers, { action: 'chapter_rewrite', novel, chapter, currentContent: content, instruction: '重写' });
    await executeNovelProviderAction(providers, { action: 'chapter_impact_assess', novel, chapter, oldContent: content, newContent: content });
    await executeNovelProviderAction(providers, { action: 'chapter_adopt_impact_assess', novel, chapter, oldContent: null, newContent: content });
    await executeNovelProviderAction(providers, { action: 'novel_full_review', novel, chapters: [chapter], sourceVersionRefs: { directionVersionId: null, settingVersionId: null, outlineVersionId: null, stageOutlineVersionId: null, chapterPlanVersionId: null, bodyStrategySnapshotId: null, chapterContentVersionIds: [] } });
    assert.throws(() => Reflect.apply(executeNovelProviderAction, undefined, [providers, { action: 'unknown_action' }]),
      (error) => error instanceof BusinessError && error.code === ErrorCode.ConfigMissing);
    const unknownKey = 'PROMPT_CANARY';
    for (const item of [...calls]) {
      const input = structuredClone(item.payload) as Record<string, unknown>;
      input[unknownKey] = unknownKey;
      assert.throws(() => Reflect.apply(executeNovelProviderAction, undefined, [providers, input]), /invalid keys/);
      for (const [key, canary] of [[unknownKey, unknownKey], ['SECRET_API_KEY_CANARY', 'secret'], ['rawEntityCanary', RAW_ENTITY_CANARY]] as const) { const nested = structuredClone(item.payload) as Record<string, unknown>, value = Object.values(nested).find((candidate) => candidate && typeof candidate === 'object'), target = (Array.isArray(value) ? value[0] : value) as Record<string, unknown>; target[key] = canary; assert.throws(() => Reflect.apply(executeNovelProviderAction, undefined, [providers, nested]), /invalid keys/); }
      assert.equal(calls.length, 15, `${item.action} nested canary provider=0`);
    }
    const missingRequired = structuredClone(calls.find((item) => item.action === 'direction_fuse')!.payload) as Record<string, unknown>; delete missingRequired.sources; assert.throws(() => Reflect.apply(executeNovelProviderAction, undefined, [providers, missingRequired]), /invalid keys/);
    assert.equal(calls.length, 15);
    assert.doesNotMatch(JSON.stringify(calls), /PROMPT_CANARY|SECRET_API_KEY_CANARY|RAW_ENTITY_CANARY/);
    for (const item of calls) assertNestedProviderAbi(item.action, item.payload as Record<string, unknown>);
    assert.deepEqual(calls.find((item) => item.action === 'direction_generate')?.keys, ['action', 'novel', 'preferences']);
    for (const action of ['direction_fuse', 'direction_optimize', 'chapter_impact_assess', 'chapter_adopt_impact_assess'] as const) assert.deepEqual(calls.find((item) => item.action === action)?.keys, ACTION_INPUT_KEYS[action].filter((key) => key !== 'reason' && key !== 'instruction').sort(), `${action} optional key`);
    assert.deepEqual(calls.find((item) => item.action === 'trial_followup_generate')?.keys, ['action', 'chapters', 'novel', 'selectedCandidate']);
    const after = await snapshotScenarioCounts(repository, calls.length);
    assert.deepEqual(diffScenarioCounts(before, after), scenarioExpectedCounts({ provider: 15 }));
    const bodyPayload = calls.find((item) => item.action === 'body_batch_generate')?.payload as { chapter: { wordTarget: number | null }; strategySnapshot: { title: string | null; summary: string | null }; previousContent: unknown; previousMemory: unknown };
    assert.equal(bodyPayload.chapter.wordTarget, null);
    assert.equal(bodyPayload.strategySnapshot.title, null);
    assert.equal(bodyPayload.strategySnapshot.summary, null);
    assert.equal(bodyPayload.previousContent, null);
    assert.deepEqual(bodyPayload.previousMemory, { previousSummary: '前情', characterStates: [], relationshipStates: [], unresolvedConflicts: [], factsCannotContradict: ['不可矛盾'] });
  });
  it('rejects all structure action/objectType mismatches before provider invocation or side effects', async () => {
    const calls: Array<{ action: NovelProviderAction; keys: string[]; payload: unknown }> = [];
    const repository = createInMemoryNovelRepository();
    const probe = createMismatchSideEffectProbe(repository, calls);
    const providers = createProviderSet(calls);
    const generateAsset = providers.structureProvider.generateAsset.bind(providers.structureProvider);
    providers.structureProvider.generateAsset = async (input) => { probe.poison(); return generateAsset(input); };
    const currentAssets = { direction: null, setting: null, outline: null, stageOutline: null };
    const mismatches = [
      { action: 'setting_generate', objectType: 'outline' },
      { action: 'outline_generate', objectType: 'stage_outline' },
      { action: 'stage_outline_generate', objectType: 'chapter_plan' },
      { action: 'chapter_plan_generate', objectType: 'setting' }
    ] as const;
    for (const mismatch of mismatches) {
      assert.throws(
        () => Reflect.apply(executeNovelProviderAction, undefined, [providers, { ...mismatch, novel, preferences, currentAssets }]),
        (error) => error instanceof BusinessError
          && error.code === ErrorCode.ConfigMissing
          && (error.details as { expectedObjectType?: string }).expectedObjectType !== mismatch.objectType
      );
    }
    const invalids = [
      { action: 'setting_generate', objectType: 'setting', mutate: (value: any) => { value.extra = null; } }, { action: 'setting_generate', objectType: 'setting', mutate: (value: any) => { value.direction.content.logline = '   '; } }, { action: 'setting_generate', objectType: 'setting', mutate: (value: any) => { value.direction = null; } }, { action: 'setting_generate', objectType: 'setting', mutate: (value: any) => { value.setting = upstreamAssets.setting; } },
      { action: 'outline_generate', objectType: 'outline', mutate: (value: any) => { value.setting.content.sections = []; } }, { action: 'stage_outline_generate', objectType: 'stage_outline', mutate: (value: any) => { value.outline.content.sections = []; } }, { action: 'chapter_plan_generate', objectType: 'chapter_plan', mutate: (value: any) => { value.stageOutline.content.stages = []; } }
    ] as const;
    for (const invalid of invalids) { const currentAssets = structuredClone(currentAssetsFor(invalid.action)); invalid.mutate(currentAssets); assert.throws(() => Reflect.apply(executeNovelProviderAction, undefined, [providers, { action: invalid.action, objectType: invalid.objectType, novel, preferences, currentAssets }]), /currentAssets|direction/); }
    assert.deepEqual(probe.snapshot(), { provider: 0, task: 0, event: 0, asset: 0, receipt: 0, current: 0, operationLog: 0, child: 0 });
  });
  it('scenario 20 provider_public_abi_uses_exact_action_pick_and_preserves_nullable_word_target through real routes', async () => {
    const repository = createInMemoryNovelRepository();
    const bindings = createExpectedBindingLedger();
    const writeTrace = traceCompoundRepositoryWrites(repository, bindings);
    const captured: Array<{ action: NovelProviderAction; payload: Record<string, unknown> }> = [];
    const app = Fastify({ logger: false });
    const providers = createRouteProviderSpies(captured);
    await registerNovelRoutes(app, {
      repository,
      requestContextResolver: async () => ({ tenantId: 'tenant_test', userId: 'user_test' }),
      now: () => new Date('2026-07-14T00:00:00.000Z'),
      ...providers
    });
    const novelId = await routeCreateDraft(app);
    const rawNovel = await repository.findById('tenant_test', novelId);
    assert.ok(rawNovel);
    Object.assign(rawNovel, { title: 'B2A1_MUTATED_NOVEL_TITLE', genres: ['B2A1_MUTATED_GENRE_A', 'B2A1_MUTATED_GENRE_B'], chapterLimit: 9, chapterWordMin: 1333, chapterWordMax: 1777 });
    rawNovel.policyProfileVersionId = null;
    await seedRawCanary(repository, novelId);
    const scenario20Before = await snapshotScenarioCounts(repository, captured.length, writeTrace);
    const directions = await postOk(app, 'POST', `/novels/${novelId}/directions/generate`, { idempotencyKey: 'b2a1-direction-generate' });
    rawNovel.policyProfileVersionId = 'policy_default_v1';
    const highCandidate = directions.candidates.find((item: { score: number }) => item.score >= 75);
    const candidateIds = directions.candidates.map((item: { id: string }) => item.id);
    seedDirectionSourceCanary(repository, novelId, candidateIds);
    await postOk(app, 'POST', `/novels/${novelId}/directions/fuse`, { versionIds: candidateIds.slice(0, 2), reason: 'route fuse', idempotencyKey: 'b2a1-direction-fuse' });
    await postOk(app, 'POST', `/novels/${novelId}/directions/${highCandidate.id}/optimize`, { instruction: 'route optimize', idempotencyKey: 'b2a1-direction-optimize' });
    bindings.creative.set('currentDirectionVersionId', highCandidate.id);
    await postOk(app, 'POST', `/novels/${novelId}/directions/${highCandidate.id}/adopt`, { reason: 'adopt direction' });
    Object.assign(repository.getCreativeVersions().find((item) => item.id === highCandidate.id)!.content as Record<string, unknown>, { logline: 'DIRECTION_LOGLINE_CANARY', coreHook: 'DIRECTION_HOOK_CANARY' });
    await seedRawCanary(repository, novelId);
    const setting = await postOk(app, 'POST', `/novels/${novelId}/settings/generate`, { idempotencyKey: 'b2a1-setting' });
    const settingContent = repository.getCreativeVersions().find((item) => item.id === setting.candidate.id)!.content as { sections: Array<{ body: string; items: string[] }> }; Object.assign(settingContent.sections[0], { body: 'SETTING_SECTION_CANARY', items: ['SETTING_ITEM_CANARY'] });
    bindings.creative.set('currentSettingVersionId', setting.candidate.id);
    await postOk(app, 'POST', `/novels/${novelId}/settings/${setting.candidate.id}/adopt`, { reason: 'adopt setting' });
    const outline = await postOk(app, 'POST', `/novels/${novelId}/outlines/generate`, { idempotencyKey: 'b2a1-outline' });
    const outlineContent = repository.getCreativeVersions().find((item) => item.id === outline.candidate.id)!.content as { stages: Array<{ goal: string }> }; outlineContent.stages[0].goal = 'OUTLINE_GOAL_CANARY';
    bindings.creative.set('currentOutlineVersionId', outline.candidate.id);
    await postOk(app, 'POST', `/novels/${novelId}/outlines/${outline.candidate.id}/adopt`, { reason: 'adopt outline' });
    const stage = await postOk(app, 'POST', `/novels/${novelId}/stage-outlines/generate`, { idempotencyKey: 'b2a1-stage' });
    bindings.creative.set('currentStageOutlineVersionId', stage.candidate.id);
    await postOk(app, 'POST', `/novels/${novelId}/stage-outlines/${stage.candidate.id}/adopt`, { reason: 'adopt stage' });
    const stageContent = repository.getCreativeVersions().find((item) => item.id === stage.candidate.id)!.content as { sections: unknown[]; stages: Array<{ chapterRange: string; conflict: string; payoff: string }>; chapters: unknown[] };
    Object.assign(stageContent.stages[0], { chapterRange: 'STAGE_RANGE_CANARY', conflict: 'STAGE_CONFLICT_CANARY', payoff: 'STAGE_PAYOFF_CANARY' });
    stageContent.sections.push(...Array(4).fill(stageContent.sections[0])); stageContent.stages.push(...Array(8).fill(stageContent.stages[0])); stageContent.chapters = Array.from({ length: 12 }, (_, index) => ({ chapterNo: index + 1, stageIndex: 9, title: '章', wordTarget: 1777, goal: 'CHAPTER_GOAL_CANARY', conflict: 'CHAPTER_CONFLICT_CANARY', hook: 'CHAPTER_HOOK_CANARY' }));
    const chapterPlan = await postOk(app, 'POST', `/novels/${novelId}/chapter-plans/generate`, { idempotencyKey: 'b2a1-chapter-plan' });
    bindings.creative.set('currentChapterPlanVersionId', chapterPlan.candidate.id);
    await postOk(app, 'POST', `/novels/${novelId}/chapter-plans/${chapterPlan.candidate.id}/adopt`, { reason: 'adopt chapter plan' });
    const trialOne = await postOk(app, 'POST', `/novels/${novelId}/trial/generate`, { idempotencyKey: 'b2a1-trial-one' });
    const selected = trialOne.trialRun.chapterOneCandidates.find((item: { isAiRecommended: boolean }) => item.isAiRecommended);
    await postOk(app, 'POST', `/novels/${novelId}/trial/generate`, {
      trialRunId: trialOne.trialRun.id,
      selectedCandidateId: selected.id,
      idempotencyKey: 'b2a1-trial-followup'
    });
    const confirmed = await postOk(app, 'POST', `/novels/${novelId}/trial/confirm`, {
      trialRunId: trialOne.trialRun.id,
      decision: 'confirm_pass'
    });
    const strategy = confirmed.bodyStrategySnapshot;
    const chapters = repository.getNovelChapters().filter((item) => item.novelId === novelId).sort((a, b) => a.chapterNo - b.chapterNo);
    for (const item of chapters.slice(3)) item.wordTarget = null;
    Object.assign(chapters[3], { title: 'B2A1_MUTATED_SINGLE_CHAPTER_TITLE', wordTarget: 1666, statusNote: 'B2A1_MUTATED_SINGLE_STATUS' });
    Object.assign(chapters[4], { title: 'B2A1_MUTATED_BATCH_CHAPTER_TITLE', wordTarget: 1555, statusNote: 'B2A1_MUTATED_BATCH_STATUS' });
    await seedRawCanary(repository, novelId);
    await postOk(app, 'POST', `/novels/${novelId}/chapters/${chapters[3].id}/generate`, {
      strategySnapshotId: strategy.id,
      expectedStrategySnapshotVersion: strategy.versionNo,
      idempotencyKey: 'b2a1-chapter-body'
    });
    const priorMemory = repository.getLongTermMemories().find((item) => item.chapterId === chapters[3].id); assert.ok(priorMemory); priorMemory.factsCannotContradict = ['FACT_CANARY', ...Array(120).fill('X'.repeat(5000))];
    const batch = await postOk(app, 'POST', `/novels/${novelId}/chapters/batch-generate`, {
      strategySnapshotId: strategy.id,
      expectedStrategySnapshotVersion: strategy.versionNo,
      idempotencyKey: 'b2a1-body-batch'
    });
    assert.equal(batch.task.status, 'completed');
    await seedRawCanary(repository, novelId);
    const fullReview = await postOk(app, 'POST', `/novels/${novelId}/full-review`, { idempotencyKey: 'b2a1-full-review' }); assert.equal(fullReview.fullReview.reviewPolicyVersionId, 'policy_default_v1');
    const currentChapters = repository.getNovelChapters().filter((item) => item.novelId === novelId && item.currentContentVersionId);
    const rewriteChapter = currentChapters[0];
    const rewriteCurrentPointer = rewriteChapter.currentContentVersionId;
    assert.ok(rewriteCurrentPointer);
    const rewrite = await postOk(app, 'POST', `/novels/${novelId}/chapters/${rewriteChapter.id}/rewrite`, {
      instruction: '强化结尾钩子',
      idempotencyKey: 'b2a1-rewrite'
    });
    await postOk(app, 'POST', `/novels/${novelId}/chapters/${rewriteChapter.id}/impact-assessments`, {
      idempotencyKey: 'b2a1-impact-direct'
    });
    bindings.current.set(rewriteChapter.id, { ...bindings.current.get(rewriteChapter.id)!, contentVersionId: rewrite.candidate.id, contentTaskId: undefined });
    await postOk(app, 'POST', `/novels/${novelId}/chapters/${rewriteChapter.id}/content-versions/${rewrite.candidate.id}/adopt`, {
      reason: 'adopt candidate',
      idempotencyKey: 'b2a1-adopt-impact'
    });
    const actions = new Set(captured.map((item) => item.action));
    assert.deepEqual([...actions].sort(), [...NOVEL_PROVIDER_ACTIONS].sort());
    for (const { action, payload } of captured) {
      assert.deepEqual(exactKeys(payload), ACTION_INPUT_KEYS[action].filter((key) => key in payload || !((action === 'direction_fuse' && key === 'reason') || (action !== 'chapter_rewrite' && key === 'instruction'))));
      assertNestedProviderAbi(action, payload);
      assert.doesNotMatch(JSON.stringify(payload), /tenantId|deletedAt|createdAt|updatedAt|rawEntityCanary|RAW_ENTITY_CANARY/);
    }
    assert.equal((captured.find((item) => item.action === 'direction_generate')?.payload.novel as { policyProfileVersionId: string | null }).policyProfileVersionId, null);
    const mutatedNovelPayload = captured.find((item) => item.action === 'direction_generate')?.payload.novel as { title: string; genres: string[]; chapterLimit: number; chapterWordMin: number; chapterWordMax: number };
    assert.deepEqual(mutatedNovelPayload, { id: novelId, title: 'B2A1_MUTATED_NOVEL_TITLE', genres: ['B2A1_MUTATED_GENRE_A', 'B2A1_MUTATED_GENRE_B'], chapterLimit: 9, chapterWordMin: 1333, chapterWordMax: 1777, policyProfileVersionId: null });
    const singleChapterPayload = captured.find((item) => item.action === 'chapter_body_generate')?.payload.chapter as { title: string; wordTarget: number | null; statusNote: string | null };
    assert.deepEqual({ title: singleChapterPayload.title, wordTarget: singleChapterPayload.wordTarget, statusNote: singleChapterPayload.statusNote }, { title: 'B2A1_MUTATED_SINGLE_CHAPTER_TITLE', wordTarget: 1666, statusNote: 'B2A1_MUTATED_SINGLE_STATUS' });
    const batchChapterPayload = captured.find((item) => item.action === 'body_batch_generate')?.payload.chapter as { title: string; wordTarget: number | null; statusNote: string | null };
    assert.deepEqual({ title: batchChapterPayload.title, wordTarget: batchChapterPayload.wordTarget, statusNote: batchChapterPayload.statusNote }, { title: 'B2A1_MUTATED_BATCH_CHAPTER_TITLE', wordTarget: 1555, statusNote: 'B2A1_MUTATED_BATCH_STATUS' });
    const rewritePayload = captured.find((item) => item.action === 'chapter_rewrite')?.payload as { currentContent: { id: string } };
    assert.equal(rewritePayload.currentContent.id, rewriteCurrentPointer);
    assert.doesNotMatch(JSON.stringify(captured), /currentContentVersionId/);
    assert.equal((captured.find((item) => item.action === 'setting_generate')?.payload.currentAssets as { setting: unknown }).setting, null);
    assert.equal((captured.find((item) => item.action === 'novel_full_review')?.payload.sourceVersionRefs as { bodyStrategySnapshotId: string | null }).bodyStrategySnapshotId, null);
    const chapterPlanInput = captured.find((item) => item.action === 'chapter_plan_generate')!.payload, projectedStage = (chapterPlanInput.currentAssets as { stageOutline: { content: { sections: unknown[]; stages: unknown[]; chapters: unknown[] } } }).stageOutline.content;
    assert.deepEqual([projectedStage.sections.length, projectedStage.stages.length, projectedStage.chapters.length], [4, 5, 8]);
    const prompts = new Map<string, any>(); let providerCalls = 0; const deepseek = new DeepSeekNovelProvider({ client: { chat: async (request) => { providerCalls += 1; prompts.set(request.taskName, JSON.parse(request.messages[1]?.content ?? '{}')); return { content: request.taskName.includes('chapter_plan') ? '{"chapters":[{"chapterNo":1}]}' : request.taskName === 'novel_body_chapter_generate' ? '{"content":"正文"}' : '{}', model: request.model }; } } });
    for (const action of ['setting_generate', 'outline_generate', 'stage_outline_generate', 'chapter_plan_generate'] as const) await Reflect.apply(deepseek.generateAsset, deepseek, [captured.find((item) => item.action === action)!.payload]); await Reflect.apply(deepseek.generateBodyChapter, deepseek, [captured.find((item) => item.action === 'body_batch_generate')!.payload]);
    const assets = (task: string) => prompts.get(task).payload.currentAssets as Record<string, any>;
    assert.deepEqual(exactKeys(assets('novel_structure_setting')), ['direction']); assert.equal(assets('novel_structure_setting').direction.logline, 'DIRECTION_LOGLINE_CANARY'); assert.equal(assets('novel_structure_setting').direction.coreHook, 'DIRECTION_HOOK_CANARY');
    assert.deepEqual(exactKeys(assets('novel_structure_outline')), ['direction', 'setting']); assert.equal(assets('novel_structure_outline').setting.sections[0].body, 'SETTING_SECTION_CANARY');
    assert.deepEqual(exactKeys(assets('novel_structure_stage_outline')), ['direction', 'outline', 'setting']); assert.equal(assets('novel_structure_stage_outline').outline.stages[0].goal, 'OUTLINE_GOAL_CANARY');
    const planAssets = assets('novel_structure_chapter_plan_1_9'); assert.deepEqual(exactKeys(planAssets), ['direction', 'outline', 'setting', 'stageOutline']); assert.deepEqual({ chapterRange: planAssets.stageOutline.stages[0].chapterRange, conflict: planAssets.stageOutline.stages[0].conflict, payoff: planAssets.stageOutline.stages[0].payoff }, { chapterRange: 'STAGE_RANGE_CANARY', conflict: 'STAGE_CONFLICT_CANARY', payoff: 'STAGE_PAYOFF_CANARY' });
    assert.deepEqual([planAssets.stageOutline.sections.length, planAssets.stageOutline.stages.length, planAssets.stageOutline.chapters.length], [4, 5, 8]); assert.deepEqual({ stageIndex: planAssets.stageOutline.chapters[0].stageIndex, wordTarget: planAssets.stageOutline.chapters[0].wordTarget, conflict: planAssets.stageOutline.chapters[0].conflict, hook: planAssets.stageOutline.chapters[0].hook }, { stageIndex: 9, wordTarget: 1777, conflict: 'CHAPTER_CONFLICT_CANARY', hook: 'CHAPTER_HOOK_CANARY' }); const memoryPrompt = prompts.get('novel_body_chapter_generate').payload.previousMemory; assert.equal(memoryPrompt.factsCannotContradict[0], 'FACT_CANARY'); assert.equal(memoryPrompt.factsCannotContradict.length, 100); assert.equal(memoryPrompt.factsCannotContradict[1].length, 4000); assert.doesNotMatch(JSON.stringify([...prompts.values()]), /RAW_ENTITY_CANARY/);
    const settingInput = captured.find((item) => item.action === 'setting_generate')!.payload, callsBeforeInvalid = providerCalls; for (const mutate of [(input: any) => { input.currentAssets = structuredClone(chapterPlanInput.currentAssets); }, (input: any) => { input.currentAssets.extra = null; }, (input: any) => { delete input.currentAssets.stageOutline; }, (input: any) => { input.currentAssets.direction = null; }, (input: any) => { input.currentAssets.direction.content.kind = 'structure'; }, (input: any) => { input.currentAssets.direction.content.logline = ' '; }]) { const invalid = structuredClone(settingInput); mutate(invalid); await assert.rejects(() => Reflect.apply(deepseek.generateAsset, deepseek, [invalid]), /currentAssets|direction/); } assert.equal(providerCalls, callsBeforeInvalid);
    const scenario20After = await snapshotScenarioCounts(repository, captured.length, writeTrace);
    assert.deepEqual(diffScenarioCounts(scenario20Before, scenario20After), scenarioExpectedCounts({
      task: 15, event: 107, provider: 19, creativeVersion: 11, assetDecision: 7,
      chapter: 9, chapterContentVersion: 12, featureCard: 9, reviewReport: 11,
      trialRun: 1, trialChapterResult: 3, longTermMemory: 6, impactCase: 2,
      bodyBatch: 2, bodyBatchSummary: 2, fullReviewGate: 1,
      currentDirection: 1, currentSetting: 1, currentOutline: 1, currentStageOutline: 1, currentChapterPlan: 1,
      currentContent: 9, currentFeatureCard: 9, currentReviewReport: 9, trialReviewPointer: 1, operationLog: 8
    }));
    await assertWriteTraceOracle(repository, novelId, writeTrace, bindings);
    const expectedDirectionId = bindings.creative.get('currentDirectionVersionId');
    const sameTypeDirection = repository.getCreativeVersions().find((item) => item.novelId === novelId && item.objectType === 'direction' && item.id !== expectedDirectionId);
    assert.ok(sameTypeDirection);
    rawNovel.currentDirectionVersionId = sameTypeDirection.id;
    await assert.rejects(() => assertWriteTraceOracle(repository, novelId, writeTrace, bindings), /currentDirectionVersionId/);
    rawNovel.currentDirectionVersionId = expectedDirectionId!;
    const pointerCanaryChapter = repository.getNovelChapters().find((item) => item.novelId === novelId)!;
    const correctFeaturePointer = pointerCanaryChapter.currentFeatureCardVersionId;
    pointerCanaryChapter.currentFeatureCardVersionId = repository.getNovelChapters().find((item) => item.novelId === novelId && item.id !== pointerCanaryChapter.id)!.currentFeatureCardVersionId;
    await assert.rejects(() => assertWriteTraceOracle(repository, novelId, writeTrace, bindings), /currentFeatureCardVersionId/);
    pointerCanaryChapter.currentFeatureCardVersionId = correctFeaturePointer;
    await assertWriteTraceOracle(repository, novelId, writeTrace, bindings);
    const replay = writeTrace.lastBodyInput; assert.ok(replay);
    const orphanDraft = replay.chapters[0], orphanChapter = repository.getNovelChapters().find((item) => item.id === orphanDraft.chapter.id)!;
    const restoredBinding = { ...bindings.current.get(orphanChapter.id)! };
    const restored = { content: orphanChapter.currentContentVersionId, feature: orphanChapter.currentFeatureCardVersionId, review: orphanChapter.currentReviewReportId }; assert.ok(restored.content && restored.feature && restored.review);
    const orphan = await repository.generateBodyBatch({ ...replay, chapters: [orphanDraft], startChapterNo: orphanDraft.chapter.chapterNo, endChapterNo: orphanDraft.chapter.chapterNo });
    const orphanResult = orphan.batch.chapterResults[0]; assert.ok(orphanResult.featureCardId && orphanResult.reviewReportId);
    assert.ok(await repository.findFeatureCardById(rawNovel.tenantId, orphanResult.featureCardId));
    assert.ok(await repository.findReviewReportById(rawNovel.tenantId, orphanResult.reviewReportId));
    Object.assign(orphanChapter, { currentContentVersionId: restored.content, currentFeatureCardVersionId: restored.feature, currentReviewReportId: restored.review });
    bindings.current.set(orphanChapter.id, restoredBinding);
    await assert.rejects(() => assertWriteTraceOracle(repository, novelId, writeTrace, bindings), /\.reference/);
    await app.close();
  });
  it('fails closed when chapter-one, followup, or body providers return non-authoritative chapter refs', async () => {
    const repository = createInMemoryNovelRepository(), writeTrace = traceCompoundRepositoryWrites(repository);
    const captured: Array<{ action: NovelProviderAction; payload: Record<string, unknown> }> = [], poison: ProviderPoison = {};
    const logs: string[] = []; const app = Fastify({ logger: { level: 'info', stream: { write: (chunk: unknown) => logs.push(String(chunk)) } } as any });
    app.setErrorHandler((error, request, reply) => { const { statusCode, body } = toErrorResponse(error, request.id); reply.status(statusCode).send(body); });
    const nodeEnv = process.env.NODE_ENV; process.env.NODE_ENV = 'test'; await registerNovelRoutes(app, { repository, requestContextResolver: async () => ({ tenantId: 'tenant_test', userId: 'user_test' }), now: () => new Date('2026-07-14T00:00:00.000Z'), ...createRouteProviderSpies(captured, poison, repository) }); process.env.NODE_ENV = nodeEnv;
    const seedOne = (await app.inject({ method: 'POST', url: '/dev/novels/acceptance-seeds/trial', payload: { title: 'chapter-one authority' } })).json().data, authoritativeChapterOne = repository.getNovelChapters().find((item) => item.novelId === seedOne.novelId && item.chapterNo === 1); assert.ok(authoritativeChapterOne);
    assert.deepEqual(seedOne.candidateIds.map((id: string) => repository.getChapterContentVersions().find((item) => item.id === id)?.chapterId), Array(seedOne.candidateIds.length).fill(authoritativeChapterOne.id), 'legal chapter-one candidates bind to the authoritative chapter');
    for (const mode of ['other_chapter', 'canary_id', 'wrong_chapter_no'] as const) {
      const before = await snapshotScenarioCounts(repository, captured.length, writeTrace), eventOffset = repository.getGenerationTaskEvents().length, finalizeWrites = writeTrace.calls.trialOne; poison.chapterOne = mode;
      const response = await app.inject({ method: 'POST', url: `/novels/${seedOne.novelId}/trial/generate`, payload: { chapterCount: 3, regenerateReason: mode, idempotencyKey: `bad-chapter-one-${mode}` } });
      assert.equal(response.statusCode, 400, response.body); assert.equal(response.json().error.code, ErrorCode.ValidationError); assert.equal(writeTrace.calls.trialOne, finalizeWrites); assert.deepEqual(diffScenarioCounts(before, await snapshotScenarioCounts(repository, captured.length, writeTrace)), scenarioExpectedCounts({ task: 1, event: 2, provider: 1 }));
      const failureEvents = repository.getGenerationTaskEvents().slice(eventOffset), failedTask = repository.getGenerationTasks().find((item) => item.id === failureEvents.at(-1)?.taskId)!; assert.deepEqual([failedTask.status, failedTask.failureCategory, failedTask.errorCode, failedTask.resultReceiptHash], [TaskStatus.Failed, 'provider_error', 'PROVIDER_ERROR', null]); assert.deepEqual(failureEvents.map((event) => [event.eventType, event.status]), [['task_claimed', TaskStatus.Processing], ['failed', TaskStatus.Failed]]);
      assert.doesNotMatch(response.body, /PROVIDER_RETURNED_ID_CANARY/); assert.doesNotMatch(logs.join(''), /PROVIDER_RETURNED_ID_CANARY/); assert.doesNotMatch(JSON.stringify({ tasks: repository.getGenerationTasks(), events: repository.getGenerationTaskEvents(), oplogs: repository.getOperationLogs(), assets: repository.getCreativeVersions(), contents: repository.getChapterContentVersions(), chapters: repository.getNovelChapters(), trials: repository.getTrialRuns() }), /PROVIDER_RETURNED_ID_CANARY/);
    }
    poison.chapterOne = undefined;
    for (const mode of ['out_of_scope', 'duplicate', 'feature_mismatch'] as const) {
      const seed = (await app.inject({ method: 'POST', url: '/dev/novels/acceptance-seeds/trial', payload: { title: `bad followup ${mode}` } })).json().data;
      const before = await snapshotScenarioCounts(repository, captured.length, writeTrace);
      const eventOffset = repository.getGenerationTaskEvents().length, finalizeWrites = writeTrace.calls.trialFollowup; poison.followup = mode;
      const response = await app.inject({ method: 'POST', url: `/novels/${seed.novelId}/trial/generate`, payload: { trialRunId: seed.trialRunId, selectedCandidateId: seed.candidateIds[0], idempotencyKey: `bad-followup-${mode}` } });
      assert.equal(response.statusCode, 400, response.body); assert.equal(response.json().error.code, ErrorCode.ValidationError); assert.equal(writeTrace.calls.trialFollowup, finalizeWrites);
      assert.deepEqual(diffScenarioCounts(before, await snapshotScenarioCounts(repository, captured.length, writeTrace)), scenarioExpectedCounts({ task: 1, event: 2, provider: 1 }));
      const failedTask = repository.getGenerationTasks().findLast((item) => item.taskType === 'trial_followup_generate')!; assert.deepEqual([failedTask.status, failedTask.failureCategory, failedTask.errorCode, failedTask.resultReceiptHash], [TaskStatus.Failed, 'provider_error', 'PROVIDER_ERROR', null]); assert.deepEqual(repository.getGenerationTaskEvents().slice(eventOffset).map((event) => [event.eventType, event.status]), [['task_claimed', TaskStatus.Processing], ['failed', TaskStatus.Failed]], 'fail-fast provider-result validation emits only claim and failure events'); assert.doesNotMatch(response.body, /PROVIDER_RETURNED_ID_CANARY/); assert.doesNotMatch(logs.join(''), /PROVIDER_RETURNED_ID_CANARY/); assert.doesNotMatch(JSON.stringify({ tasks: repository.getGenerationTasks(), events: repository.getGenerationTaskEvents(), oplogs: repository.getOperationLogs(), assets: repository.getCreativeVersions(), contents: repository.getChapterContentVersions(), chapters: repository.getNovelChapters(), trials: repository.getTrialRuns() }), /PROVIDER_RETURNED_ID_CANARY/);
    }
    poison.followup = undefined;
    const seed2 = (await app.inject({ method: 'POST', url: '/dev/novels/acceptance-seeds/trial', payload: { title: 'bad body ref' } })).json().data;
    await postOk(app, 'POST', `/novels/${seed2.novelId}/trial/generate`, { trialRunId: seed2.trialRunId, selectedCandidateId: seed2.candidateIds[0], idempotencyKey: 'body-ready-followup' });
    const confirmed = await postOk(app, 'POST', `/novels/${seed2.novelId}/trial/confirm`, { trialRunId: seed2.trialRunId, decision: 'confirm_pass' });
    const chapter4 = repository.getNovelChapters().find((chapter) => chapter.novelId === seed2.novelId && chapter.chapterNo === 4)!;
    const beforeBody = await snapshotScenarioCounts(repository, captured.length, writeTrace), bodyEventOffset = repository.getGenerationTaskEvents().length, bodyFinalizeWrites = writeTrace.calls.body; poison.body = true;
    const badBody = await app.inject({ method: 'POST', url: `/novels/${seed2.novelId}/chapters/${chapter4.id}/generate`, payload: { strategySnapshotId: confirmed.bodyStrategySnapshot.id, expectedStrategySnapshotVersion: confirmed.bodyStrategySnapshot.versionNo, idempotencyKey: 'bad-body-ref' } });
    assert.equal(badBody.statusCode, 400, badBody.body);
    assert.equal(badBody.json().error.code, ErrorCode.ValidationError);
    assert.equal(writeTrace.calls.body, bodyFinalizeWrites);
    assert.deepEqual(diffScenarioCounts(beforeBody, await snapshotScenarioCounts(repository, captured.length, writeTrace)), scenarioExpectedCounts({ task: 1, event: 2, provider: 1 }));
    const failedBodyTask = repository.getGenerationTasks().findLast((item) => item.taskType === 'chapter_body_generate')!; assert.deepEqual([failedBodyTask.status, failedBodyTask.failureCategory, failedBodyTask.errorCode, failedBodyTask.resultReceiptHash], [TaskStatus.Failed, 'provider_error', 'PROVIDER_ERROR', null]); assert.deepEqual(repository.getGenerationTaskEvents().slice(bodyEventOffset).map((event) => [event.eventType, event.status]), [['task_claimed', TaskStatus.Processing], ['failed', TaskStatus.Failed]]); assert.doesNotMatch(badBody.body, /PROVIDER_RETURNED_ID_CANARY/); assert.doesNotMatch(logs.join(''), /PROVIDER_RETURNED_ID_CANARY/); assert.doesNotMatch(JSON.stringify({ tasks: repository.getGenerationTasks(), events: repository.getGenerationTaskEvents(), oplogs: repository.getOperationLogs(), assets: repository.getCreativeVersions(), contents: repository.getChapterContentVersions(), chapters: repository.getNovelChapters(), trials: repository.getTrialRuns() }), /PROVIDER_RETURNED_ID_CANARY/);
    await app.close();
  });
  it('keeps provider public ABI free of raw repository entity names and direct service provider calls', () => {
    const providerFiles = [
      'mockDirectionProvider.ts',
      'mockStructureProvider.ts',
      'mockTrialProvider.ts',
      'mockBodyProvider.ts',
      'mockFullReviewProvider.ts',
      'deepseekNovelProvider.ts'
    ];
    for (const file of providerFiles) {
      const source = readFileSync(new URL(`./providers/${file}`, import.meta.url), 'utf8');
      assert.doesNotMatch(source, /NovelRecord|NovelChapterRecord|NovelPreferencesRecord|ChapterContentVersionRecord/);
    }
    const serviceSource = readFileSync(new URL('./services/novelService.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(serviceSource, /this\.(directionProvider|structureProvider|trialProvider|bodyProvider|fullReviewProvider)\.(generate|fuse|optimize|rewrite|assess)/);
    assert.doesNotMatch(serviceSource, /\bas\s+(?:BodyChapterDraft|TrialFollowupChapterDraft)\b/);
    assert.doesNotMatch(serviceSource, /pickProviderChapterDraft|BODY_PROVIDER_DRAFT_KEYS|TRIAL_FOLLOWUP_PROVIDER_DRAFT_KEYS/);
    assert.match(serviceSource, /function constructTrialFollowupChapterDraft[\s\S]*?: TrialFollowupChapterDraft \{/);
    const registrySource = readFileSync(new URL('./services/actionExecutionPlan.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(registrySource, /as unknown as|BodyChapterDraft|TrialFollowupChapterDraft|^\s*content:\s*unknown|^\s*metadata:\s*unknown|^\s*sourceVersionRefs:\s*unknown/m);
    assert.match(registrySource, /executeProvider\(providers: NovelProviderSet, input: NovelProviderActionInputFor<A>\)/);
    assert.doesNotMatch(registrySource, /StructureProviderDispatchInput|input:\s*NovelProviderActionInput\b/);
  });
});
const nestedProviderKeys = {
  novel: ['chapterLimit', 'chapterWordMax', 'chapterWordMin', 'genres', 'id', 'policyProfileVersionId', 'title'],
  preferences: ['appealPoints', 'stageCount', 'targetAudience'],
  directionDraft: ['content', 'marketScore', 'recommendedReason', 'riskLevel', 'riskTags', 'score', 'summary', 'title'],
  directionContent: ['audienceAppeal', 'coreHook', 'logline', 'recommendation', 'riskTags', 'sellingPoints', 'title', 'videoPotential'],
  chapter: ['chapterNo', 'id', 'statusNote', 'title', 'wordTarget'],
  providerSafeMetadata: ['candidateRank', 'hardFailed', 'isMockOutput', 'scoringStrategyVersion'],
  strategySnapshot: ['id', 'providerSafeMetadata', 'riskLevel', 'riskTags', 'summary', 'title', 'versionNo'],
  chapterContent: ['content', 'id', 'providerSafeMetadata', 'reviewScore', 'summary'],
  currentAssets: ['direction', 'outline', 'setting', 'stageOutline'],
  creativeAsset: ['content', 'id', 'objectType', 'riskLevel', 'riskTags', 'score', 'summary', 'title', 'versionNo'],
  sourceVersionRefs: ['bodyStrategySnapshotId', 'chapterContentVersionIds', 'chapterPlanVersionId', 'directionVersionId', 'outlineVersionId', 'settingVersionId', 'stageOutlineVersionId'],
  previousMemory: ['characterStates', 'factsCannotContradict', 'previousSummary', 'relationshipStates', 'unresolvedConflicts']
};
function assertNestedProviderAbi(action: string, payload: Record<string, unknown>) {
  if ('novel' in payload) assert.deepEqual(exactKeys(payload.novel), nestedProviderKeys.novel, `${action}.novel`);
  if ('preferences' in payload) assert.deepEqual(exactKeys(payload.preferences), nestedProviderKeys.preferences, `${action}.preferences`);
  if ('source' in payload) assertDirectionDraftProviderAbi(payload.source, `${action}.source`);
  if ('sources' in payload) {
    for (const [index, source] of (payload.sources as unknown[]).entries()) assertDirectionDraftProviderAbi(source, `${action}.sources[${index}]`);
  }
  if ('chapter' in payload) assert.deepEqual(exactKeys(payload.chapter), nestedProviderKeys.chapter, `${action}.chapter`);
  if ('chapters' in payload) {
    for (const item of payload.chapters as unknown[]) assert.deepEqual(exactKeys(item), nestedProviderKeys.chapter, `${action}.chapters[]`);
  }
  if ('strategySnapshot' in payload) {
    assert.deepEqual(exactKeys(payload.strategySnapshot), nestedProviderKeys.strategySnapshot, `${action}.strategySnapshot`);
    assert.deepEqual(exactKeys((payload.strategySnapshot as { providerSafeMetadata: unknown }).providerSafeMetadata), nestedProviderKeys.providerSafeMetadata, `${action}.strategySnapshot.providerSafeMetadata`);
  }
  for (const key of ['previousContent', 'currentContent', 'oldContent', 'newContent', 'selectedCandidate'] as const) {
    const value = payload[key];
    if (value) {
      assert.deepEqual(exactKeys(value), nestedProviderKeys.chapterContent, `${action}.${key}`);
      assert.deepEqual(exactKeys((value as { providerSafeMetadata: unknown }).providerSafeMetadata), nestedProviderKeys.providerSafeMetadata, `${action}.${key}.providerSafeMetadata`);
    }
  }
  if ('previousMemory' in payload && payload.previousMemory) assert.deepEqual(exactKeys(payload.previousMemory), nestedProviderKeys.previousMemory, `${action}.previousMemory`);
  if ('currentAssets' in payload) {
    assert.deepEqual(exactKeys(payload.currentAssets), nestedProviderKeys.currentAssets, `${action}.currentAssets`);
    for (const value of Object.values(payload.currentAssets as Record<string, unknown>)) {
      if (value) { assert.deepEqual(exactKeys(value), nestedProviderKeys.creativeAsset, `${action}.currentAssets.asset`); const content = (value as { content: { kind: string } }).content; assert.deepEqual(exactKeys(content), content.kind === 'direction' ? ['coreHook', 'kind', 'logline'] : ['chapters', 'kind', 'sections', 'stages']); }
    }
  }
  if ('sourceVersionRefs' in payload) assert.deepEqual(exactKeys(payload.sourceVersionRefs), nestedProviderKeys.sourceVersionRefs, `${action}.sourceVersionRefs`);
}
function assertDirectionDraftProviderAbi(value: unknown, path: string) {
  assert.deepEqual(exactKeys(value), nestedProviderKeys.directionDraft, path);
  assert.deepEqual(exactKeys((value as { content: unknown }).content), nestedProviderKeys.directionContent, `${path}.content`);
}
async function seedRawCanary(repository: ReturnType<typeof createInMemoryNovelRepository>, novelId: string) {
  const rawNovel = await repository.findById('tenant_test', novelId);
  if (rawNovel) {
    (rawNovel as unknown as Record<string, unknown>).rawEntityCanary = RAW_ENTITY_CANARY;
    rawNovel.summary = RAW_ENTITY_CANARY;
  }
  const rawPreferences = await repository.findPreferencesByNovelId('tenant_test', novelId);
  if (rawPreferences) (rawPreferences as unknown as Record<string, unknown>).rawEntityCanary = RAW_ENTITY_CANARY;
  for (const chapter of repository.getNovelChapters().filter((item) => item.novelId === novelId)) {
    (chapter as unknown as Record<string, unknown>).rawEntityCanary = RAW_ENTITY_CANARY;
    chapter.metadata = { ...(chapter.metadata as Record<string, unknown> | undefined), rawEntityCanary: RAW_ENTITY_CANARY };
  }
  for (const version of repository.getCreativeVersions().filter((item) => item.novelId === novelId)) {
    version.metadata = { ...(version.metadata as Record<string, unknown>), rawEntityCanary: RAW_ENTITY_CANARY };
  }
  for (const version of repository.getChapterContentVersions().filter((item) => item.novelId === novelId)) {
    version.metadata = { ...(version.metadata as Record<string, unknown>), rawEntityCanary: RAW_ENTITY_CANARY };
  }
}
function seedDirectionSourceCanary(
  repository: ReturnType<typeof createInMemoryNovelRepository>,
  novelId: string,
  versionIds: string[]
) {
  for (const version of repository.getCreativeVersions().filter((item) => item.novelId === novelId && versionIds.includes(item.id))) {
    (version as unknown as Record<string, unknown>).rawEntityCanary = RAW_ENTITY_CANARY;
    version.metadata = { ...(version.metadata as Record<string, unknown>), rawEntityCanary: RAW_ENTITY_CANARY };
    (version.content as Record<string, unknown>).rawEntityCanary = RAW_ENTITY_CANARY;
  }
}
type Repository = ReturnType<typeof createInMemoryNovelRepository>;
type BodyInput = Parameters<Repository['generateBodyBatch']>[0];
type CurrentWriteIds = { content?: string | null; feature?: string | null; review?: string | null };
type CreativeField = 'currentDirectionVersionId' | 'currentSettingVersionId' | 'currentOutlineVersionId' | 'currentStageOutlineVersionId' | 'currentChapterPlanVersionId';
type ChapterBinding = { chapterId: string; taskId: string; contentVersionId?: string };
type CurrentBinding = { contentVersionId?: string; contentTaskId?: string; featureTaskId: string; reviewTaskId: string; reviewContentVersionId?: string };
type ReviewBinding = { objectType: string; objectId: string; taskId: string; objectVersionId?: string | null };
type ExpectedBindingLedger = { creative: Map<CreativeField, string>; content: Map<string, ChapterBinding>; feature: Map<string, ChapterBinding>; review: Map<string, ReviewBinding>; memory: Map<string, ChapterBinding>; current: Map<string, CurrentBinding> };
type WriteTrace = { content: Set<string>; feature: Set<string>; review: Set<string>; memory: Set<string>; fullReview: Set<string>; calls: { trialOne: number; trialFollowup: number; body: number }; lastBodyInput?: BodyInput };
function createExpectedBindingLedger(): ExpectedBindingLedger {
  return { creative: new Map(), content: new Map(), feature: new Map(), review: new Map(), memory: new Map(), current: new Map() };
}
function createMismatchSideEffectProbe(repository: ReturnType<typeof createInMemoryNovelRepository>, calls: unknown[]) {
  const tasks = repository.getGenerationTasks();
  const poison = () => {
    Reflect.apply(Array.prototype.push, tasks, [{ resultReceiptHash: 'poison', retryOfTaskId: 'poison' }]); Reflect.apply(Array.prototype.push, repository.getGenerationTaskEvents(), [{}]); Reflect.apply(Array.prototype.push, repository.getCreativeVersions(), [{}]);
    Reflect.apply(Array.prototype.push, repository.getNovelChapters(), [{ currentContentVersionId: 'poison' }]); Reflect.apply(Array.prototype.push, repository.getOperationLogs(), [{}]);
  };
  const snapshot = () => ({ provider: calls.length, task: tasks.length, event: repository.getGenerationTaskEvents().length, asset: repository.getCreativeVersions().length, receipt: tasks.filter((item) => item.resultReceiptHash).length, current: repository.getNovelChapters().filter((item) => item.currentContentVersionId).length, operationLog: repository.getOperationLogs().length, child: tasks.filter((item) => item.retryOfTaskId).length });
  return { poison, snapshot };
}
function traceCompoundRepositoryWrites(repository: Repository, bindings = createExpectedBindingLedger()): WriteTrace {
  const trace: WriteTrace = { content: new Set(), feature: new Set(), review: new Set(), memory: new Set(), fullReview: new Set(), calls: { trialOne: 0, trialFollowup: 0, body: 0 } };
  const bindChapter = (chapterId: string, taskId: string, ids: CurrentWriteIds & { memory?: string | null }, contentVersionId?: string) => {
    if (ids.content) { trace.content.add(ids.content); if (!bindings.content.has(ids.content)) bindings.content.set(ids.content, { chapterId, taskId }); }
    if (ids.feature) { trace.feature.add(ids.feature); bindings.feature.set(ids.feature, { chapterId, taskId, contentVersionId }); }
    if (ids.review) { trace.review.add(ids.review); bindings.review.set(ids.review, { objectType: 'chapter', objectId: chapterId, taskId, ...(contentVersionId ? { objectVersionId: contentVersionId } : {}) }); }
    if (ids.memory) { trace.memory.add(ids.memory); bindings.memory.set(ids.memory, { chapterId, taskId, contentVersionId }); }
    bindings.current.set(chapterId, { contentVersionId, contentTaskId: contentVersionId ? undefined : taskId, featureTaskId: taskId, reviewTaskId: taskId, reviewContentVersionId: contentVersionId });
  };
  const wrap = (name: string, collect: (input: any, result: any) => void) => {
    const original = Reflect.get(repository, name);
    Reflect.set(repository, name, async (...args: unknown[]) => { const result = await Reflect.apply(original, repository, args); collect(args[0], result); return result; });
  };
  wrap('createTrialChapterOneCandidates', (input, result) => { trace.calls.trialOne += 1; result.chapterOneCandidates.forEach((item: { id: string }, index: number) => { trace.content.add(item.id); bindings.content.set(item.id, { chapterId: input.candidates[index].chapterId, taskId: input.task.id }); }); });
  wrap('selectTrialChapterOneAndGenerateFollowup', (input, result) => {
    trace.calls.trialFollowup += 1;
    const generatedVersions = result.contentVersions.filter((item: { id: string }) => item.id !== input.selectedCandidate.id);
    let generated = 0;
    input.chapters.forEach((draft: { chapter: { id: string } }, index: number) => {
      const contentId = input.chapters[index].chapter.chapterNo === 1 ? input.selectedCandidate.id : generatedVersions[generated++].id;
      bindChapter(draft.chapter.id, input.task.id, { content: contentId, feature: result.featureCards[index].id, review: result.reviewReports[index].id }, input.chapters[index].chapter.chapterNo === 1 ? input.selectedCandidate.id : undefined);
    });
    const trialReview = result.reviewReports[input.chapters.length];
    trace.review.add(trialReview.id); bindings.review.set(trialReview.id, { objectType: 'trial_run', objectId: input.trialRun.id, taskId: input.task.id, objectVersionId: null });
  });
  wrap('generateBodyBatch', (input: BodyInput, result) => {
    trace.calls.body += 1;
    trace.lastBodyInput = input;
    input.chapters.forEach((draft, index) => { const item = result.batch.chapterResults[index]; if (item?.contentVersionId) bindChapter(draft.chapter.id, input.task.id, { content: item.contentVersionId, feature: item.featureCardId, review: item.reviewReportId, memory: item.longTermMemoryId }); });
  });
  wrap('rewriteChapter', (input, result) => { trace.content.add(result.candidate.id); bindings.content.set(result.candidate.id, { chapterId: input.chapter.id, taskId: input.task.id }); });
  wrap('createFullReview', (input, result) => { const id = result.reviewReport.id; trace.review.add(id); trace.fullReview.add(id); bindings.review.set(id, { objectType: 'novel', objectId: input.novel.id, taskId: input.task.id, objectVersionId: null }); });
  return trace;
}
async function assertWriteTraceOracle(repository: Repository, novelId: string, trace: WriteTrace, bindings: ExpectedBindingLedger) {
  const novel = await repository.findById('tenant_test', novelId); assert.ok(novel);
  const chapters = repository.getNovelChapters().filter((item) => item.novelId === novelId);
  const contents = repository.getChapterContentVersions().filter((item) => item.novelId === novelId);
  const memories = repository.getLongTermMemories().filter((item) => item.novelId === novelId);
  assert.deepEqual(contents.map((item) => item.id).sort(), [...trace.content].sort(), 'content write set');
  assert.deepEqual(memories.map((item) => item.id).sort(), [...trace.memory].sort(), 'memory write set');
  assert.deepEqual([...trace.content].sort(), [...bindings.content.keys()].sort(), 'content binding coverage');
  assert.deepEqual([...trace.feature].sort(), [...bindings.feature.keys()].sort(), 'feature binding coverage');
  assert.deepEqual([...trace.review].sort(), [...bindings.review.keys()].sort(), 'review binding coverage');
  const contentById = new Map(contents.map((item) => [item.id, item]));
  const features = new Map<string, NonNullable<Awaited<ReturnType<Repository['findFeatureCardById']>>>>(), reviews = new Map<string, NonNullable<Awaited<ReturnType<Repository['findReviewReportById']>>>>();
  for (const id of trace.feature) { const item = await repository.findFeatureCardById(novel.tenantId, id); assert.ok(item, id); features.set(id, item); }
  for (const id of trace.review) { const item = await repository.findReviewReportById(novel.tenantId, id); assert.ok(item, id); reviews.set(id, item); }
  for (const item of [...contents, ...features.values(), ...reviews.values(), ...memories]) { assert.equal(item.tenantId, novel.tenantId, `${item.id}.tenantId`); assert.equal(item.novelId, novelId, `${item.id}.novelId`); }
  for (const item of contents) { const expected = bindings.content.get(item.id); assert.ok(expected, item.id); assert.equal(item.chapterId, expected.chapterId, `${item.id}.chapterId`); assert.equal(item.sourceTaskId, expected.taskId, `${item.id}.sourceTaskId`); }
  for (const item of memories) { const expected = bindings.memory.get(item.id); assert.ok(expected, item.id); assert.equal(item.chapterId, expected.chapterId, `${item.id}.chapterId`); assert.equal(item.sourceTaskId, expected.taskId, `${item.id}.sourceTaskId`); const source = contentById.get(item.sourceContentVersionId!); assert.ok(source, `${item.id}.sourceContentVersionId`); assert.equal(source.chapterId, expected.chapterId, `${item.id}.sourceContentVersion.chapterId`); assert.equal(source.sourceTaskId, expected.taskId, `${item.id}.sourceContentVersion.sourceTaskId`); }
  assert.equal(bindings.current.size, chapters.length, 'all chapters must have independently bound formal pointers');
  for (const chapter of chapters) {
    const expected = bindings.current.get(chapter.id); assert.ok(expected, chapter.id);
    const currentContent = contentById.get(chapter.currentContentVersionId!); assert.ok(currentContent, `${chapter.id}.currentContentVersionId`); assert.equal(currentContent.chapterId, chapter.id, `${chapter.id}.currentContentVersionId.chapterId`);
    if (expected.contentVersionId) assert.equal(chapter.currentContentVersionId, expected.contentVersionId, `${chapter.id}.currentContentVersionId`); else assert.equal(currentContent.sourceTaskId, expected.contentTaskId, `${chapter.id}.currentContentVersionId.sourceTaskId`);
    const currentFeature = await repository.findFeatureCardById(novel.tenantId, chapter.currentFeatureCardVersionId!); assert.ok(currentFeature, `${chapter.id}.currentFeatureCardVersionId`); assert.equal(currentFeature.chapterId, chapter.id, `${chapter.id}.currentFeatureCardVersionId.chapterId`); assert.equal(currentFeature.sourceTaskId, expected.featureTaskId, `${chapter.id}.currentFeatureCardVersionId.sourceTaskId`);
    const currentReview = await repository.findReviewReportById(novel.tenantId, chapter.currentReviewReportId!); assert.ok(currentReview, `${chapter.id}.currentReviewReportId`); assert.equal(currentReview.objectId, chapter.id, `${chapter.id}.currentReviewReportId.objectId`); assert.equal(currentReview.sourceTaskId, expected.reviewTaskId, `${chapter.id}.currentReviewReportId.sourceTaskId`);
    if (expected.reviewContentVersionId) assert.equal(currentReview.objectVersionId, expected.reviewContentVersionId, `${chapter.id}.currentReviewReportId.objectVersionId`); else { const reviewed = contentById.get(currentReview.objectVersionId!); assert.ok(reviewed, `${chapter.id}.currentReviewReportId.objectVersionId`); assert.equal(reviewed.chapterId, chapter.id, `${chapter.id}.currentReviewReportId.content.chapterId`); assert.equal(reviewed.sourceTaskId, expected.reviewTaskId, `${chapter.id}.currentReviewReportId.content.sourceTaskId`); }
  }
  const trialRuns = repository.getTrialRuns().filter((item) => item.novelId === novelId);
  const trialResults = (await Promise.all(trialRuns.map((item) => repository.listTrialChapterResults(item.tenantId, item.id)))).flat();
  const latestFullReview = await repository.findLatestFullReview(novel.tenantId, novelId);
  for (const [id, expected] of bindings.feature) {
    const item = features.get(id); assert.ok(item, id); assert.equal(item.chapterId, expected.chapterId, `${id}.chapterId`); assert.equal(item.sourceTaskId, expected.taskId, `${id}.sourceTaskId`);
    const trialRef = trialResults.find((value) => value.featureCardVersionId === id), currentRef = chapters.find((value) => value.currentFeatureCardVersionId === id); assert.ok(trialRef ?? currentRef, `${id}.reference`);
    if (trialRef) { assert.equal(trialRef.chapterId, expected.chapterId, `${id}.reference.chapterId`); if (expected.contentVersionId) assert.equal(trialRef.contentVersionId, expected.contentVersionId, `${id}.reference.contentVersionId`); else assert.equal(contentById.get(trialRef.contentVersionId!)?.sourceTaskId, expected.taskId, `${id}.reference.contentTaskId`); }
    else assert.equal(currentRef!.id, expected.chapterId, `${id}.reference.chapterId`);
  }
  for (const [id, expected] of bindings.review) {
    const item = reviews.get(id); assert.ok(item, id); assert.equal(item.objectType, expected.objectType, `${id}.objectType`); assert.equal(item.objectId, expected.objectId, `${id}.objectId`); assert.equal(item.sourceTaskId, expected.taskId, `${id}.sourceTaskId`);
    if (Object.hasOwn(expected, 'objectVersionId')) assert.equal(item.objectVersionId, expected.objectVersionId, `${id}.objectVersionId`); else { const reviewed = contentById.get(item.objectVersionId!); assert.ok(reviewed, `${id}.objectVersionId`); assert.equal(reviewed.chapterId, expected.objectId, `${id}.objectVersionId.chapterId`); assert.equal(reviewed.sourceTaskId, expected.taskId, `${id}.objectVersionId.sourceTaskId`); }
    if (expected.objectType === 'chapter') { const ref = trialResults.find((value) => value.reviewReportId === id) ?? chapters.find((value) => value.currentReviewReportId === id); assert.ok(ref, `${id}.reference`); assert.equal('chapterId' in ref ? ref.chapterId : ref.id, expected.objectId, `${id}.reference.chapterId`); if ('contentVersionId' in ref && Object.hasOwn(expected, 'objectVersionId')) assert.equal(ref.contentVersionId, expected.objectVersionId, `${id}.reference.contentVersionId`); }
  }
  const featureRefs = new Set([...chapters.map((item) => item.currentFeatureCardVersionId), ...trialResults.map((item) => item.featureCardVersionId)].filter((id): id is string => Boolean(id)));
  const reviewRefs = new Set([...chapters.map((item) => item.currentReviewReportId), ...trialResults.map((item) => item.reviewReportId), ...trialRuns.map((item) => item.reviewReportId), latestFullReview?.reviewReport.id].filter((id): id is string => Boolean(id)));
  assert.deepEqual([...trace.feature].sort(), [...featureRefs].sort(), 'feature write/reference set'); assert.deepEqual([...trace.review].sort(), [...reviewRefs].sort(), 'review write/reference set');
  const creativeById = new Map(repository.getCreativeVersions().filter((item) => item.novelId === novelId).map((item) => [item.id, item]));
  for (const [field, objectType] of [['currentDirectionVersionId', 'direction'], ['currentSettingVersionId', 'setting'], ['currentOutlineVersionId', 'outline'], ['currentStageOutlineVersionId', 'stage_outline'], ['currentChapterPlanVersionId', 'chapter_plan']] as const) {
    const expectedId = bindings.creative.get(field); assert.ok(expectedId, field); assert.equal(novel[field], expectedId, field);
    const target = creativeById.get(expectedId); assert.ok(target, field); assert.equal(target.objectType, objectType, field);
  }
  assert.deepEqual([...trace.fullReview], latestFullReview ? [latestFullReview.reviewReport.id] : [], 'full-review write set');
}
async function snapshotScenarioCounts(repository?: ReturnType<typeof createInMemoryNovelRepository>, provider = 0, trace?: WriteTrace) {
  if (!repository) return scenarioCounts({ provider });
  const tasks = repository.getGenerationTasks();
  const chapters = repository.getNovelChapters();
  const creativeVersions = repository.getCreativeVersions();
  const chapterContentVersions = repository.getChapterContentVersions();
  const trialRuns = repository.getTrialRuns();
  const impactCases = repository.getImpactCases();
  const longTermMemories = repository.getLongTermMemories();
  const bodyBatches = repository.getBodyBatches();
  const assetDecisions = repository.getAssetDecisionRecords();
  const novelIds = [...new Set([
    ...tasks.map((task) => task.novelId),
    ...chapters.map((item) => item.novelId),
    ...creativeVersions.map((item) => item.novelId),
    ...chapterContentVersions.map((item) => item.novelId),
    ...trialRuns.map((item) => item.novelId),
    ...impactCases.map((item) => item.novelId),
    ...longTermMemories.map((item) => item.novelId),
    ...bodyBatches.map((item) => item.novelId)
  ].filter((item): item is string => Boolean(item)))];
  const novels = (await Promise.all(novelIds.map((novelId) => repository.findById('tenant_test', novelId))))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const trialChapterResults = (await Promise.all(
    trialRuns.map((trialRun) => repository.listTrialChapterResults(trialRun.tenantId, trialRun.id))
  )).flat();
  const latestFullReviews = (await Promise.all(
    novelIds.map((novelId) => repository.findLatestFullReview('tenant_test', novelId))
  )).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const featureCardIds = trace?.feature ?? new Set([
    ...chapters.map((item) => item.currentFeatureCardVersionId),
    ...trialChapterResults.map((item) => item.featureCardVersionId)
  ].filter((item): item is string => Boolean(item)));
  const reviewReportIds = trace?.review ?? new Set([
    ...chapters.map((item) => item.currentReviewReportId),
    ...trialChapterResults.map((item) => item.reviewReportId),
    ...trialRuns.map((item) => item.reviewReportId),
    ...latestFullReviews.map((item) => item.reviewReport.id)
  ].filter((item): item is string => Boolean(item)));
  const featureCards = await Promise.all([...featureCardIds].map((id) => repository.findFeatureCardById('tenant_test', id)));
  const reviewReports = await Promise.all([...reviewReportIds].map((id) => repository.findReviewReportById('tenant_test', id)));
  assert.equal(featureCards.filter(Boolean).length, featureCardIds.size, 'all feature card pointers must resolve');
  assert.equal(reviewReports.filter(Boolean).length, reviewReportIds.size, 'all review report pointers must resolve');
  return scenarioCounts({
    task: tasks.length,
    event: repository.getGenerationTaskEvents().length,
    provider,
    creativeVersion: creativeVersions.length,
    assetDecision: assetDecisions.length,
    chapter: chapters.length,
    chapterContentVersion: chapterContentVersions.length,
    featureCard: featureCards.length,
    reviewReport: reviewReports.length,
    trialRun: trialRuns.length,
    trialChapterResult: trialChapterResults.length,
    longTermMemory: longTermMemories.length,
    impactCase: impactCases.length,
    bodyBatch: bodyBatches.length,
    bodyBatchSummary: bodyBatches.filter((item) => Boolean(item.summary?.id)).length,
    fullReviewGate: latestFullReviews.length,
    receipt: tasks.filter((item) => item.resultReceiptHash).length,
    currentDirection: novels.filter((item) => item.currentDirectionVersionId).length,
    currentSetting: novels.filter((item) => item.currentSettingVersionId).length,
    currentOutline: novels.filter((item) => item.currentOutlineVersionId).length,
    currentStageOutline: novels.filter((item) => item.currentStageOutlineVersionId).length,
    currentChapterPlan: novels.filter((item) => item.currentChapterPlanVersionId).length,
    currentContent: chapters.filter((item) => item.currentContentVersionId).length,
    currentFeatureCard: chapters.filter((item) => item.currentFeatureCardVersionId).length,
    currentReviewReport: chapters.filter((item) => item.currentReviewReportId).length,
    trialReviewPointer: trialRuns.filter((item) => item.reviewReportId).length,
    operationLog: repository.getOperationLogs().length,
    child: tasks.filter((item) => item.retryOfTaskId).length
  });
}
function diffScenarioCounts(before: Awaited<ReturnType<typeof snapshotScenarioCounts>>, after: Awaited<ReturnType<typeof snapshotScenarioCounts>>) {
  return scenarioCounts(Object.fromEntries(Object.keys(after).map((key) => [key, after[key as keyof typeof after] - before[key as keyof typeof before]])));
}
function scenarioExpectedCounts(overrides: Partial<Awaited<ReturnType<typeof snapshotScenarioCounts>>> = {}) {
  return scenarioCounts(overrides);
}
const ZERO_SCENARIO_COUNTS = {
  task: 0, event: 0, provider: 0, creativeVersion: 0, assetDecision: 0,
  chapter: 0, chapterContentVersion: 0, featureCard: 0, reviewReport: 0,
  trialRun: 0, trialChapterResult: 0, longTermMemory: 0, impactCase: 0,
  bodyBatch: 0, bodyBatchSummary: 0, fullReviewGate: 0, receipt: 0,
  currentDirection: 0, currentSetting: 0, currentOutline: 0, currentStageOutline: 0,
  currentChapterPlan: 0, currentContent: 0, currentFeatureCard: 0, currentReviewReport: 0,
  trialReviewPointer: 0, operationLog: 0, child: 0
};
type ScenarioCounts = { [K in keyof typeof ZERO_SCENARIO_COUNTS]: number };
function scenarioCounts(overrides: Partial<ScenarioCounts> = {}): ScenarioCounts {
  return { ...ZERO_SCENARIO_COUNTS, ...overrides };
}
type ProviderPoison = { chapterOne?: 'other_chapter' | 'canary_id' | 'wrong_chapter_no'; followup?: 'out_of_scope' | 'duplicate' | 'feature_mismatch'; body?: boolean };
function createRouteProviderSpies(captured: Array<{ action: NovelProviderAction; payload: Record<string, unknown> }>, poison: ProviderPoison = {}, repository?: ReturnType<typeof createInMemoryNovelRepository>) {
  const directionProvider = new MockDirectionProvider(), structureProvider = new MockStructureProvider(), trialProvider = new MockTrialProvider();
  const bodyProvider = new MockBodyProvider(), fullReviewProvider = new MockFullReviewProvider();
  const record = <T>(action: NovelProviderAction, input: T) => captured.push({ action, payload: structuredClone(input) as Record<string, unknown> });
  return {
    directionProvider: {
      generateCandidates: async (input: Parameters<typeof directionProvider.generateCandidates>[0]) => {
        record('direction_generate', input);
        return directionProvider.generateCandidates(input);
      },
      fuseCandidates: async (input: Parameters<typeof directionProvider.fuseCandidates>[0]) => {
        record('direction_fuse', input);
        return directionProvider.fuseCandidates(input);
      },
      optimizeCandidate: async (input: Parameters<typeof directionProvider.optimizeCandidate>[0]) => {
        record('direction_optimize', input);
        return directionProvider.optimizeCandidate(input);
      }
    },
    structureProvider: {
      generateAsset: async (input: Parameters<typeof structureProvider.generateAsset>[0]) => {
        const action = ({ setting: 'setting_generate', outline: 'outline_generate', stage_outline: 'stage_outline_generate', chapter_plan: 'chapter_plan_generate' } as const)[input.objectType];
        record(action, input);
        return structureProvider.generateAsset(input);
      }
    },
    trialProvider: {
      generateChapterOneCandidates: async (input: Parameters<typeof trialProvider.generateChapterOneCandidates>[0]) => {
        record('trial_chapter_one_generate', input);
        const result = await trialProvider.generateChapterOneCandidates(input), wrong = input.chapters[1];
        return poison.chapterOne ? result.map((draft, index) => index === 0 ? { ...draft, chapterId: poison.chapterOne === 'other_chapter' ? wrong.id : poison.chapterOne === 'canary_id' ? PROVIDER_RETURNED_ID_CANARY : draft.chapterId, chapterNo: poison.chapterOne === 'wrong_chapter_no' ? wrong.chapterNo : draft.chapterNo } : draft) : result;
      },
      generateFollowup: async (input: Parameters<typeof trialProvider.generateFollowup>[0]) => {
        record('trial_followup_generate', input);
        const result = await trialProvider.generateFollowup(input);
        if (poison.followup === 'out_of_scope') {
          const outside = repository?.getNovelChapters().find((item) => item.novelId === input.novel.id && !input.chapters.some((scope) => scope.id === item.id));
          assert.ok(outside);
          return { ...result, chapters: result.chapters.map((draft, index) => index === 0 ? { ...draft, chapter: { id: PROVIDER_RETURNED_ID_CANARY, chapterNo: outside.chapterNo }, featureCard: { ...draft.featureCard, chapterId: outside.id } } : draft) };
        }
        if (poison.followup === 'duplicate') {
          const first = result.chapters[0]; assert.ok(first);
          return { ...result, chapters: result.chapters.map((draft, index) => index === 1 ? { ...draft, chapter: { ...first.chapter }, featureCard: { ...draft.featureCard, chapterId: first.chapter.id } } : draft) };
        }
        if (poison.followup === 'feature_mismatch') {
          const wrong = result.chapters[1]; assert.ok(wrong);
          return { ...result, chapters: result.chapters.map((draft, index) => index === 0 ? { ...draft, featureCard: { ...draft.featureCard, chapterId: PROVIDER_RETURNED_ID_CANARY } } : draft) };
        }
        return result;
      }
    },
    bodyProvider: {
      generateBodyChapter: async (input: Parameters<typeof bodyProvider.generateBodyChapter>[0] & { action?: string }) => {
        record(input.action === 'chapter_body_generate' ? 'chapter_body_generate' : 'body_batch_generate', input);
        const result = await bodyProvider.generateBodyChapter(input);
        return poison.body ? { ...result, chapter: { ...result.chapter, id: PROVIDER_RETURNED_ID_CANARY } } : result;
      },
      rewriteChapter: async (input: Parameters<typeof bodyProvider.rewriteChapter>[0]) => {
        record('chapter_rewrite', input);
        return bodyProvider.rewriteChapter(input);
      },
      assessImpact: async (input: Parameters<typeof bodyProvider.assessImpact>[0] & { action?: string }) => {
        record(input.action === 'chapter_adopt_impact_assess' ? 'chapter_adopt_impact_assess' : 'chapter_impact_assess', input);
        return bodyProvider.assessImpact(input);
      }
    },
    fullReviewProvider: {
      generateFullReview: async (input: Parameters<typeof fullReviewProvider.generateFullReview>[0]) => {
        record('novel_full_review', input);
        return fullReviewProvider.generateFullReview(input);
      }
    }
  };
}
async function routeCreateDraft(app: ReturnType<typeof Fastify>) {
  const response = await app.inject({
    method: 'POST',
    url: '/novels/drafts',
    payload: {
      title: 'RP02B2a1 route strict ABI',
      genres: ['都市逆袭'],
      preferences: { appealPoints: ['低谷翻盘'], targetAudience: '测试读者' },
      chapterLimit: 8,
      chapterWordRange: { min: 1200, max: 1600 }
    }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data.id as string;
}
async function postOk(app: ReturnType<typeof Fastify>, method: 'POST', url: string, payload: Record<string, unknown>) {
  const response = await app.inject({ method, url, payload });
  assert.equal(response.statusCode, 200, response.body);
  assert.notEqual(response.statusCode, 202);
  const body = response.json();
  assert.equal(body.success, true);
  assertNoQueuedTaskStatus(body.data);
  return body.data;
}
function assertNoQueuedTaskStatus(value: unknown, path = 'data'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoQueuedTaskStatus(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (typeof record.taskType === 'string' && typeof record.status === 'string') {
    assert.notEqual(record.status, TaskStatus.Queued, `${path} returned a queued task in a synchronous 200 response`);
  }
  for (const [key, child] of Object.entries(record)) assertNoQueuedTaskStatus(child, `${path}.${key}`);
}
