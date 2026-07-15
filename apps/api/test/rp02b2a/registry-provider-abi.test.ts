import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ErrorCode, NOVEL_PROVIDER_ACTIONS, RiskLevel, TaskStatus, type NovelProviderAction } from '@ai-shortvideo/shared';
import Fastify from 'fastify';
import { BusinessError, toErrorResponse } from '../../src/shared/errors.js';
import { registerNovelRoutes } from '../../src/modules/novels/routes/novelRoutes.js';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';
import { MockBodyProvider } from '../../src/modules/novels/providers/mockBodyProvider.js';
import { MockDirectionProvider } from '../../src/modules/novels/providers/mockDirectionProvider.js';
import { MockFullReviewProvider } from '../../src/modules/novels/providers/mockFullReviewProvider.js';
import { MockStructureProvider } from '../../src/modules/novels/providers/mockStructureProvider.js';
import { MockTrialProvider } from '../../src/modules/novels/providers/mockTrialProvider.js';
import { DeepSeekNovelProvider } from '../../src/modules/novels/providers/deepseekNovelProvider.js';
import type { GenerationTaskRecord } from '../../src/modules/novels/domain/novelDomain.js';
import {
  ACTION_INPUT_KEYS,
  ACTION_EXECUTION_PLANS,
  executeNovelProviderAction,
  listActionExecutionPlans,
  type CreativeAssetProviderInputV1,
  type NovelProviderSet,
  type StructureCurrentAssetsProviderInputV1,
  type StructureProviderAction
} from '../../src/modules/novels/services/actionExecutionPlan.js';
import { TaskService } from '../../src/modules/tasks/services/taskService.js';
import { toRecentTaskSummaryDTO } from '../../src/modules/tasks/services/taskService.js';
import { registerTaskRoutes } from '../../src/modules/tasks/routes/taskRoutes.js';
const RAW_ENTITY_CANARY = 'RAW_ENTITY_CANARY_SHOULD_NOT_REACH_PROVIDER', PROVIDER_RETURNED_ID_CANARY = 'PROVIDER_RETURNED_ID_CANARY';
const novel = { id: 'novel-1', title: '测试小说', genres: ['都市'], chapterLimit: 10, chapterWordMin: 1000, chapterWordMax: 1400, policyProfileVersionId: 'policy-1' };
const preferences = { appealPoints: ['反击'], targetAudience: '读者', stageCount: 3 };
const chapter = { id: 'chapter-1', chapterNo: 1, title: '第1章', wordTarget: null, statusNote: null };
const providerSafeMetadata = { scoringStrategyVersion: null, hardFailed: null, candidateRank: null, isMockOutput: null };
const content = { id: 'content-1', content: '正文', summary: '摘要', reviewScore: 80, providerSafeMetadata };
const strategySnapshot = { id: 'strategy-1', versionNo: 1, title: null, summary: null, riskLevel: RiskLevel.Low, riskTags: [], providerSafeMetadata };
const structureContent: CreativeAssetProviderInputV1['content'] = { kind: 'structure', sections: [{ title: '段落', body: '内容', items: [] }], stages: [{ stageIndex: 1, title: '阶段', chapterRange: '1-10', goal: '目标', conflict: '冲突', payoff: '回报' }], chapters: [] };
const asset = (objectType: string, content: CreativeAssetProviderInputV1['content']): CreativeAssetProviderInputV1 => ({ id: `${objectType}-1`, objectType, versionNo: 1, title: objectType, summary: null, score: 80, riskLevel: RiskLevel.Low, riskTags: [], content });
const upstreamAssets = { direction: asset('direction', { kind: 'direction', logline: '方向主线', coreHook: '核心钩子' }), setting: asset('setting', structureContent), outline: asset('outline', structureContent), stageOutline: asset('stage_outline', structureContent) };
function currentAssetsFor(action: StructureProviderAction): StructureCurrentAssetsProviderInputV1 { return { direction: upstreamAssets.direction, setting: action === 'setting_generate' ? null : upstreamAssets.setting, outline: action === 'setting_generate' || action === 'outline_generate' ? null : upstreamAssets.outline, stageOutline: action === 'chapter_plan_generate' ? upstreamAssets.stageOutline : null }; }
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
  const structureProvider = new MockStructureProvider(), bodyProvider = new MockBodyProvider();
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
      now: () => new Date('2026-07-14T00:00:00.000Z'),
      ...providers
    });
    const novelId = await routeCreateDraft(app);
    const rawNovel = await repository.findById('tenant_default', novelId);
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
    const nodeEnv = process.env.NODE_ENV; process.env.NODE_ENV = 'test'; await registerNovelRoutes(app, { repository, now: () => new Date('2026-07-14T00:00:00.000Z'), ...createRouteProviderSpies(captured, poison, repository) }); process.env.NODE_ENV = nodeEnv;
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
      const source = readFileSync(new URL(`../../src/modules/novels/providers/${file}`, import.meta.url), 'utf8');
      assert.doesNotMatch(source, /NovelRecord|NovelChapterRecord|NovelPreferencesRecord|ChapterContentVersionRecord/);
    }
    const serviceSource = readFileSync(new URL('../../src/modules/novels/services/novelService.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(serviceSource, /this\.(directionProvider|structureProvider|trialProvider|bodyProvider|fullReviewProvider)\.(generate|fuse|optimize|rewrite|assess)/);
    assert.doesNotMatch(serviceSource, /\bas\s+(?:BodyChapterDraft|TrialFollowupChapterDraft)\b/);
    assert.doesNotMatch(serviceSource, /pickProviderChapterDraft|BODY_PROVIDER_DRAFT_KEYS|TRIAL_FOLLOWUP_PROVIDER_DRAFT_KEYS/);
    assert.match(serviceSource, /function constructTrialFollowupChapterDraft[\s\S]*?: TrialFollowupChapterDraft \{/);
    const registrySource = readFileSync(new URL('../../src/modules/novels/services/actionExecutionPlan.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(registrySource, /as unknown as|BodyChapterDraft|TrialFollowupChapterDraft|^\s*content:\s*unknown|^\s*metadata:\s*unknown|^\s*sourceVersionRefs:\s*unknown/m);
    assert.match(registrySource, /executeProvider\(providers: NovelProviderSet, input: NovelProviderActionInputFor<A>\)/);
    assert.doesNotMatch(registrySource, /StructureProviderDispatchInput|input:\s*NovelProviderActionInput\b/);
  });
});
describe('RP-02B2a1 public retry freeze', () => {
  const task: GenerationTaskRecord = {
    id: 'task-1',
    tenantId: 'tenant-1',
    novelId: 'novel-1',
    taskType: 'novel_direction_generate',
    status: TaskStatus.Failed,
    progress: 30,
    currentStep: 'calling_model',
    objectType: 'direction',
    objectId: 'novel-1',
    statusNote: 'provider failed',
    sourceVersionRefs: {},
    conflictScope: 'novel_direction',
    conflictKey: 'novel-1',
    triggerSource: null, idempotencyToken: null, requestHash: null, activeClaimKey: null,
    inputSummary: null, outputSummary: null,
    resultVersionIds: ['fake-result-binding-is-not-a-receipt'],
    retryOfTaskId: null,
    failureCategory: 'provider_error',
    errorCode: 'PROVIDER_ERROR',
    errorMessage: 'raw provider stack should not be exposed',
    cancelReason: null,
    resultObjectType: null, resultObjectId: null, userAcceptedResult: false, cancelRequestedAt: null,
    startedAt: null, finishedAt: null, createdBy: null,
    metadata: {},
    createdAt: new Date('2026-07-14T00:00:00.000Z'),
    updatedAt: new Date('2026-07-14T00:00:00.000Z')
  };
  it('scenario 22 provider_backed_task_projection_freezes_retry with exact side effects', async () => {
    const repository = createInMemoryNovelRepository();
    repository.getGenerationTasks().push({ ...task, novelId: null });
    const service = new TaskService({ repository });
    const before = await snapshotScenarioCounts(repository);
    const dto = await service.getTask(task.id, { tenantId: 'tenant-1', userId: 'user-1', requestId: 'req-1' });
    assert.equal(dto.retryable, false);
    assert.equal(dto.userFailureReason, '任务执行失败，未写入新的候选或正式内容。');
    assert.equal(dto.errorMessage, '任务执行失败，未写入新的候选或正式内容。');
    assert.equal(dto.nextAction.type, 'disabled');
    assert.equal(dto.nextAction.label, '暂不支持任务重试');
    const recent = toRecentTaskSummaryDTO(repository.getGenerationTasks()[0]);
    assert.equal(recent.currentStep, '生成任务失败，暂不支持直接重试');
    assert.equal(recent.errorMessage, '任务执行失败，未写入新的候选或正式内容。');
    const after = await snapshotScenarioCounts(repository);
    assert.deepEqual(diffScenarioCounts(before, after), scenarioExpectedCounts());
  });
  it('scenario 15 provider_retry_api_frozen_zero_child and scenario 22 retry mutation remain exact-zero', async () => {
    const repository = createInMemoryNovelRepository();
    const captured: Array<{ action: NovelProviderAction; payload: Record<string, unknown> }> = [];
    const app = Fastify({ logger: false });
    app.setErrorHandler((error, request, reply) => {
      const { statusCode, body } = toErrorResponse(error, request.id);
      reply.status(statusCode).send(body);
    });
    await registerNovelRoutes(app, { repository, now: () => new Date('2026-07-14T00:00:00.000Z'), ...createRouteProviderSpies(captured) });
    await registerTaskRoutes(app, { repository, now: () => new Date('2026-07-14T00:00:00.000Z') });
    repository.getGenerationTasks().push({ ...task, id: 'active-conflict', tenantId: 'tenant_default', novelId: null, status: TaskStatus.Processing, sourceVersionRefs: {} });
    const gateCalls = { stale: 0, conflict: 0, finalize: 0 }; let probing = false;
    for (const [method, gate] of [['findById', 'stale'], ['findActiveTaskByConflict', 'conflict'], ['retryTask', 'finalize']] as const) { const original = Reflect.get(repository, method); Reflect.set(repository, method, async (...args: unknown[]) => { if (probing) { gateCalls[gate] += 1; throw new Error(`${gate} reached before retry freeze`); } return Reflect.apply(original, repository, args); }); }
    const statuses = [TaskStatus.Queued, TaskStatus.Processing, TaskStatus.WaitingConfirmation, TaskStatus.Completed, TaskStatus.Failed, TaskStatus.Cancelled];
    for (const [gate, novelId, sourceVersionRefs] of [['stale', 'novel-1', { currentDirectionVersionId: 'stale-direction' }], ['conflict', null, {}]] as const) {
      for (const status of statuses) {
        const taskId = `${task.id}-${gate}-${status}`;
        repository.getGenerationTasks().push({ ...task, id: taskId, status, tenantId: 'tenant_default', novelId, sourceVersionRefs });
        const taskBefore = JSON.stringify(repository.getGenerationTasks().find((item) => item.id === taskId));
        const before = await snapshotScenarioCounts(repository, captured.length); probing = true;
        const response = await app.inject({ method: 'POST', url: `/tasks/${taskId}/retry`, payload: { reason: 'retry' } }); probing = false;
        assert.equal(response.statusCode, 409, `${gate}/${status}: ${response.body}`);
        assert.equal(response.json().error.code, ErrorCode.RetryNotAvailable, `${gate}/${status}`);
        assert.equal(response.json().error.message, '当前阶段暂不支持任务重试，未创建新任务。');
        const after = await snapshotScenarioCounts(repository, captured.length);
        assert.deepEqual(diffScenarioCounts(before, after), scenarioExpectedCounts(), `${gate}/${status} side effects`);
        assert.equal(JSON.stringify(repository.getGenerationTasks().find((item) => item.id === taskId)), taskBefore, `${gate}/${status} mutation`);
      }
    }
    assert.deepEqual(gateCalls, { stale: 0, conflict: 0, finalize: 0 }); assert.equal(captured.length, 0);
    await app.close();
    const taskServiceSource = readFileSync(new URL('../../src/modules/tasks/services/taskService.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(taskServiceSource, /executeNovelProviderAction|directionProvider|structureProvider|trialProvider|bodyProvider|fullReviewProvider/);
    assert.match(taskServiceSource, /listActionExecutionPlans\(\)\.map\(\(plan\) => plan\.taskType\)/);
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
  const rawNovel = await repository.findById('tenant_default', novelId);
  if (rawNovel) {
    (rawNovel as unknown as Record<string, unknown>).rawEntityCanary = RAW_ENTITY_CANARY;
    rawNovel.summary = RAW_ENTITY_CANARY;
  }
  const rawPreferences = await repository.findPreferencesByNovelId('tenant_default', novelId);
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
  const novel = await repository.findById('tenant_default', novelId); assert.ok(novel);
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
  const novels = (await Promise.all(novelIds.map((novelId) => repository.findById('tenant_default', novelId))))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const trialChapterResults = (await Promise.all(
    trialRuns.map((trialRun) => repository.listTrialChapterResults(trialRun.tenantId, trialRun.id))
  )).flat();
  const latestFullReviews = (await Promise.all(
    novelIds.map((novelId) => repository.findLatestFullReview('tenant_default', novelId))
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
  const featureCards = await Promise.all([...featureCardIds].map((id) => repository.findFeatureCardById('tenant_default', id)));
  const reviewReports = await Promise.all([...reviewReportIds].map((id) => repository.findReviewReportById('tenant_default', id)));
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
