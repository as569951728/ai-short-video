import { NovelCreationStage, NovelLifecycleStatus, StageStatus, type NovelProviderAction } from '@ai-shortvideo/shared';
import Fastify from 'fastify';
import { toErrorResponse } from '../../src/shared/errors.js';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';
import { registerNovelRoutes } from '../../src/modules/novels/routes/novelRoutes.js';
import { MockBodyProvider } from '../../src/modules/novels/providers/mockBodyProvider.js';
import { MockDirectionProvider } from '../../src/modules/novels/providers/mockDirectionProvider.js';
import { MockFullReviewProvider } from '../../src/modules/novels/providers/mockFullReviewProvider.js';
import { MockStructureProvider } from '../../src/modules/novels/providers/mockStructureProvider.js';
import { MockTrialProvider } from '../../src/modules/novels/providers/mockTrialProvider.js';
import type { NovelProviderSet } from '../../src/modules/novels/services/actionExecutionPlan.js';
import type { GenerationAuthoritySnapshot, NovelRecord, NovelRepository, RequestContext } from '../../src/modules/novels/domain/novelDomain.js';
export const ACTIONS: NovelProviderAction[] = [
  'direction_generate', 'direction_fuse', 'direction_optimize', 'setting_generate',
  'outline_generate', 'stage_outline_generate', 'chapter_plan_generate',
  'trial_chapter_one_generate', 'trial_followup_generate', 'body_batch_generate',
  'chapter_body_generate', 'chapter_rewrite', 'chapter_impact_assess',
  'chapter_adopt_impact_assess', 'novel_full_review'
];
export class ManualClock {
  constructor(private value: Date) {}
  now = () => new Date(this.value);
  set(value: string) { this.value = new Date(value); }
}
export class MutableAuthorityStore {
  missing = false;
  sourceStale = false;
  loadCount = 0;
  constructor(
    private readonly novel: NovelRecord,
    private readonly load: (input: Parameters<NovelRepository['loadGenerationAuthority']>[0]) => Promise<GenerationAuthoritySnapshot | null>
  ) {}
  async snapshot(input: Parameters<NovelRepository['loadGenerationAuthority']>[0]) {
    this.loadCount += 1;
    if (this.missing || this.sourceStale) return null;
    return this.load(input);
  }
  change() { this.novel.title = `${this.novel.title} changed`; }
  invalidateSource() { this.sourceStale = true; }
  remove() { this.missing = true; }
}
export async function createAuthorityFixture(
  action: NovelProviderAction,
  identity: { tenantId: string; userId: string } = { tenantId: 'tenant_a', userId: 'user_a' }
) {
  const repository = createInMemoryNovelRepository();
  const counters = { intent: 0 };
  const originalClaim = repository.claimGenerationTask.bind(repository);
  repository.claimGenerationTask = async (input) => {
    const result = await originalClaim(input);
    if (result.outcome !== 'source_stale') counters.intent += 1;
    return result;
  };
  const context: RequestContext = {
    ...identity,
    requestId: `request_${action}`
  };
  const created = await repository.createDraft({
    request: { title: `A2 ${action}` },
    context,
    now: new Date('2026-07-15T00:00:00.000Z')
  });
  Object.assign(created.novel, {
    lifecycleStatus: NovelLifecycleStatus.Active,
    creationStage: NovelCreationStage.Body,
    stageStatus: StageStatus.Processing,
    currentDirectionVersionId: action === 'direction_generate' ? null : 'direction_v1',
    currentSettingVersionId: 'setting_v1',
    currentOutlineVersionId: 'outline_v1',
    currentStageOutlineVersionId: 'stage_v1',
    currentChapterPlanVersionId: 'plan_v1'
  });
  const authority = new MutableAuthorityStore(created.novel, repository.loadGenerationAuthority.bind(repository));
  repository.loadGenerationAuthority = async (input) => authority.snapshot(input);
  const spec = actionSpec(action, created.novel.id);
  return { repository, context, novel: created.novel, authority, counters, action, ...spec };
}
export const ZERO_SIDE_EFFECTS = {
  task: 0, event: 0, provider: 0, intent: 0, asset: 0, receipt: 0,
  current: 0, 'operation-log': 0, child: 0
};
export function sideEffects(repository: ReturnType<typeof createInMemoryNovelRepository>, providerCalls: number, intentCalls = 0) {
  return {
    task: repository.getGenerationTasks().length,
    event: repository.getGenerationTaskEvents().length,
    provider: providerCalls,
    intent: intentCalls,
    asset: repository.getCreativeVersions().length,
    receipt: repository.getGenerationTasks().filter((task) => task.resultReceiptHash).length,
    current: repository.getCreativeVersions().filter((version) => version.status === 'current').length,
    'operation-log': repository.getOperationLogs().filter((log) => log.sourceTaskId).length,
    child: repository.getGenerationTasks().filter((task) => task.retryOfTaskId).length
  };
}
export function actionSpec(action: NovelProviderAction, novelId: string) {
  const structure = {
    currentDirectionVersionId: 'direction_v1',
    currentSettingVersionId: 'setting_v1',
    currentOutlineVersionId: 'outline_v1',
    currentStageOutlineVersionId: 'stage_v1'
  };
  switch (action) {
    case 'direction_generate': return { objectId: novelId, effectiveRequest: {}, sourceVersionRefs: { currentDirectionVersionId: null } };
    case 'direction_fuse': return { objectId: novelId, effectiveRequest: { versionIds: ['direction_a', 'direction_b'] }, sourceVersionRefs: { sourceVersionIds: ['direction_a', 'direction_b'] } };
    case 'direction_optimize': return { objectId: 'direction_a', effectiveRequest: { versionId: 'direction_a' }, sourceVersionRefs: { sourceVersionIds: ['direction_a'] } };
    case 'setting_generate': return { objectId: novelId, effectiveRequest: {}, sourceVersionRefs: { ...structure, objectType: 'setting' } };
    case 'outline_generate': return { objectId: novelId, effectiveRequest: {}, sourceVersionRefs: { ...structure, objectType: 'outline' } };
    case 'stage_outline_generate': return { objectId: novelId, effectiveRequest: {}, sourceVersionRefs: { ...structure, objectType: 'stage_outline' } };
    case 'chapter_plan_generate': return { objectId: novelId, effectiveRequest: {}, sourceVersionRefs: { ...structure, objectType: 'chapter_plan' } };
    case 'trial_chapter_one_generate': return { objectId: novelId, effectiveRequest: { chapterCount: 3 }, sourceVersionRefs: { ...structure, currentChapterPlanVersionId: 'plan_v1', objectType: 'trial_run' } };
    case 'trial_followup_generate': return { objectId: 'trial_1', effectiveRequest: { selectedCandidateId: 'content_candidate' }, sourceVersionRefs: { ...structure, currentChapterPlanVersionId: 'plan_v1', selectedChapterOneCandidateId: 'content_candidate', objectType: 'trial_run' } };
    case 'body_batch_generate': return { objectId: novelId, effectiveRequest: { startChapterNo: 1, endChapterNo: 2 }, sourceVersionRefs: { ...structure, currentChapterPlanVersionId: 'plan_v1', trialRunId: 'trial_1', selectedChapterOneCandidateId: 'content_candidate', strategySnapshotId: 'strategy_1', strategySnapshotVersion: 1, creationStage: 'body' } };
    case 'chapter_body_generate': return { objectId: 'chapter_1', effectiveRequest: {}, sourceVersionRefs: { ...structure, currentChapterPlanVersionId: 'plan_v1', trialRunId: 'trial_1', selectedChapterOneCandidateId: 'content_candidate', strategySnapshotId: 'strategy_1', strategySnapshotVersion: 1, creationStage: 'body' } };
    case 'chapter_rewrite': return { objectId: 'chapter_1', effectiveRequest: { currentContentVersionId: 'content_v1', instruction: 'rewrite' }, sourceVersionRefs: { currentContentVersionId: 'content_v1' } };
    case 'chapter_impact_assess': return { objectId: 'chapter_1', effectiveRequest: { currentContentVersionId: 'content_v1' }, sourceVersionRefs: { currentContentVersionId: 'content_v1' } };
    case 'chapter_adopt_impact_assess': return { objectId: 'chapter_1', effectiveRequest: { currentContentVersionId: 'content_v1', candidateVersionId: 'content_v2', reason: 'adopt' }, sourceVersionRefs: { currentContentVersionId: 'content_v1', candidateVersionId: 'content_v2' } };
    case 'novel_full_review': return { objectId: novelId, effectiveRequest: { reviewPolicyVersionId: 'policy_default_v1' }, sourceVersionRefs: { ...structure, currentChapterPlanVersionId: 'plan_v1', chapterContentVersionIds: [{ chapterId: 'chapter_1', chapterNo: 1, currentContentVersionId: 'content_v1', currentFeatureCardVersionId: null, currentReviewReportId: null }] } };
  }
}
export type AuthorityFixtureRepository = NovelRepository & ReturnType<typeof createInMemoryNovelRepository>;
export type AuthorityMutation = 'missing' | 'changed';
export type AuthorityPhase = 'before_claim' | 'after_first_authority_read' | 'after_claim';
export async function createRouteAuthorityFixture(action: NovelProviderAction) {
  const repository = createInMemoryNovelRepository();
  const counters = { provider: 0, intent: 0, authority: 0 };
  const providerInvocations: Array<{ action: NovelProviderAction; input: unknown }> = [];
  let armed: { phase: AuthorityPhase; mutation: AuthorityMutation } | null = null;
  let restore = () => {};
  const originalClaim = repository.claimGenerationTask.bind(repository);
  repository.claimGenerationTask = async (input) => {
    const result = await originalClaim(armed?.phase === 'after_claim' ? {
      ...input,
      afterClaimBarrier: async () => {
        await input.afterClaimBarrier?.();
        restore = mutateAuthority(armed!.mutation, 'after_claim', action, novel, repository, prepared);
      }
    } : input);
    if (result.outcome !== 'source_stale') counters.intent += 1;
    return result;
  };
  const providers = countedProviders(counters, providerInvocations);
  const app = Fastify({ logger: false });
  app.setErrorHandler((error, request, reply) => {
    const result = toErrorResponse(error, request.id);
    reply.status(result.statusCode).send(result.body);
  });
  await registerNovelRoutes(app, {
    repository,
    requestContextResolver: async () => ({ tenantId: 'tenant_test', userId: 'user_test' }),
    now: () => new Date('2026-07-17T00:00:00.000Z'),
    ...providers
  });
  const prepared = await prepareTarget(app, repository, action);
  const novel = await repository.findById('tenant_test', prepared.novelId);
  if (!novel) throw new Error(`missing prepared novel for ${action}`);
  const originalLoad = repository.loadGenerationAuthority.bind(repository);
  let captureAuthority = false;
  let loadCount = 0;
  let authoritySnapshots: Array<GenerationAuthoritySnapshot | null> = [];
  let restorePreviousRunState = () => {};
  repository.loadGenerationAuthority = async (input) => {
    if (!captureAuthority || input.action !== action) return originalLoad(input);
    loadCount += 1;
    counters.authority += 1;
    if (loadCount === 1 && armed?.phase === 'before_claim') {
      restore = mutateAuthority(armed.mutation, 'before_claim', action, novel, repository, prepared);
    }
    const snapshot = await originalLoad(input);
    authoritySnapshots.push(snapshot ? structuredClone(snapshot) : null);
    if (loadCount === 1 && armed?.phase === 'after_first_authority_read') {
      restore = mutateAuthority(armed.mutation, 'after_first_authority_read', action, novel, repository, prepared);
    }
    return snapshot;
  };
  return {
    app,
    repository,
    counters,
    action,
    async run(phase: AuthorityPhase, mutation: AuthorityMutation, caseNo: number) {
      restorePreviousRunState();
      restorePreviousRunState = captureRunState(action, novel, repository, prepared);
      armed = { phase, mutation };
      captureAuthority = true;
      loadCount = 0;
      authoritySnapshots = [];
      providerInvocations.length = 0;
      try {
        return await prepared.invoke(`a2-${caseNo}-${action}-${phase}-${mutation}`);
      } finally {
        restore();
        restore = () => {};
        armed = null;
        captureAuthority = false;
      }
    },
    async runSuccess(idempotencyKey: string) {
      restorePreviousRunState();
      restorePreviousRunState = captureRunState(action, novel, repository, prepared);
      loadCount = 0;
      authoritySnapshots = [];
      providerInvocations.length = 0;
      captureAuthority = true;
      try {
        return await prepared.invoke(idempotencyKey);
      } finally {
        captureAuthority = false;
      }
    },
    authorityReads: () => loadCount,
    authoritySnapshots: () => authoritySnapshots,
    providerInvocations: () => providerInvocations,
    novelId: prepared.novelId,
    authorityObjectId: prepared.authorityObjectId
  };
}
function captureRunState(action: NovelProviderAction, novel: NovelRecord, repository: ReturnType<typeof createInMemoryNovelRepository>, prepared: PreparedTarget) {
  if (action !== 'trial_followup_generate') return () => {};
  const trialRun = repository.getTrialRuns().find((item) => item.id === prepared.authorityObjectId);
  if (!trialRun) throw new Error('missing trial run state');
  const trialState = {
    status: trialRun.status,
    metadata: structuredClone(trialRun.metadata),
    updatedAt: new Date(trialRun.updatedAt)
  };
  const novelState = {
    creationStage: novel.creationStage,
    stageStatus: novel.stageStatus,
    updatedBy: novel.updatedBy,
    updatedAt: new Date(novel.updatedAt)
  };
  return () => {
    Object.assign(trialRun, trialState);
    Object.assign(novel, novelState);
  };
}
export async function snapshotRouteSideEffects(fixture: Awaited<ReturnType<typeof createRouteAuthorityFixture>>) {
  const { repository, counters } = fixture;
  const tasks = repository.getGenerationTasks();
  const chapters = repository.getNovelChapters();
  const trials = repository.getTrialRuns();
  const trialResults = (await Promise.all(trials.map((item) => repository.listTrialChapterResults(item.tenantId, item.id)))).flat();
  const novelIds = [...new Set([
    ...tasks.map((item) => item.novelId),
    ...chapters.map((item) => item.novelId),
    ...repository.getCreativeVersions().map((item) => item.novelId)
  ].filter((item): item is string => Boolean(item)))];
  const novels = (await Promise.all(novelIds.map((id) => repository.findById('tenant_test', id)))).filter(Boolean);
  const fullReviews = (await Promise.all(novelIds.map((id) => repository.findLatestFullReview('tenant_test', id)))).filter(Boolean);
  return {
    task: tasks.length,
    event: repository.getGenerationTaskEvents().length,
    provider: counters.provider,
    intent: counters.intent,
    asset: repository.getCreativeVersions().length + repository.getAssetDecisionRecords().length
      + chapters.length + repository.getChapterContentVersions().length + trials.length + trialResults.length
      + repository.getImpactCases().length + repository.getLongTermMemories().length
      + repository.getBodyBatches().length + fullReviews.length,
    receipt: tasks.filter((item) => item.resultReceiptHash).length,
    current: novels.reduce((sum, item) => sum + [item?.currentDirectionVersionId, item?.currentSettingVersionId,
      item?.currentOutlineVersionId, item?.currentStageOutlineVersionId, item?.currentChapterPlanVersionId].filter(Boolean).length, 0)
      + chapters.reduce((sum, item) => sum + [item.currentContentVersionId, item.currentFeatureCardVersionId, item.currentReviewReportId].filter(Boolean).length, 0)
      + trials.filter((item) => item.reviewReportId).length,
    log: repository.getOperationLogs().length,
    child: tasks.filter((item) => item.retryOfTaskId).length
  };
}
type PreparedTarget = {
  novelId: string;
  authorityObjectId: string;
  sourceVersionId?: string;
  chapterId?: string;
  invoke: (idempotencyKey: string) => ReturnType<ReturnType<typeof Fastify>['inject']>;
};
async function prepareTarget(
  app: ReturnType<typeof Fastify>,
  repository: ReturnType<typeof createInMemoryNovelRepository>,
  action: NovelProviderAction
): Promise<PreparedTarget> {
  const novelId = await createRouteDraft(app);
  const target = (url: string, payload: Record<string, unknown> = {}, extra: Partial<PreparedTarget> = {}): PreparedTarget => ({
    novelId,
    authorityObjectId: novelId,
    ...extra,
    invoke: (idempotencyKey) => app.inject({ method: 'POST', url, payload: { ...payload, idempotencyKey } })
  });
  if (action === 'direction_generate') return target(`/novels/${novelId}/directions/generate`);
  const directions = await postRouteOk(app, `/novels/${novelId}/directions/generate`, { idempotencyKey: `setup-${action}-directions` });
  const candidates = directions.candidates as Array<{ id: string; score: number }>;
  const source = candidates.find((item) => item.score >= 75) ?? candidates[0];
  if (!source || candidates.length < 2) throw new Error('direction setup failed');
  if (action === 'direction_fuse') return target(`/novels/${novelId}/directions/fuse`, { versionIds: candidates.slice(0, 2).map((item) => item.id), reason: 'authority matrix' }, { sourceVersionId: candidates[0].id });
  if (action === 'direction_optimize') return target(`/novels/${novelId}/directions/${source.id}/optimize`, { instruction: 'authority matrix' }, { sourceVersionId: source.id, authorityObjectId: source.id });
  await postRouteOk(app, `/novels/${novelId}/directions/${source.id}/adopt`, { reason: 'setup' });
  if (action === 'setting_generate') return target(`/novels/${novelId}/settings/generate`);
  const setting = await postRouteOk(app, `/novels/${novelId}/settings/generate`, { idempotencyKey: `setup-${action}-setting` });
  await postRouteOk(app, `/novels/${novelId}/settings/${setting.candidate.id}/adopt`, { reason: 'setup' });
  if (action === 'outline_generate') return target(`/novels/${novelId}/outlines/generate`);
  const outline = await postRouteOk(app, `/novels/${novelId}/outlines/generate`, { idempotencyKey: `setup-${action}-outline` });
  await postRouteOk(app, `/novels/${novelId}/outlines/${outline.candidate.id}/adopt`, { reason: 'setup' });
  if (action === 'stage_outline_generate') return target(`/novels/${novelId}/stage-outlines/generate`);
  const stage = await postRouteOk(app, `/novels/${novelId}/stage-outlines/generate`, { idempotencyKey: `setup-${action}-stage` });
  await postRouteOk(app, `/novels/${novelId}/stage-outlines/${stage.candidate.id}/adopt`, { reason: 'setup' });
  if (action === 'chapter_plan_generate') return target(`/novels/${novelId}/chapter-plans/generate`);
  const plan = await postRouteOk(app, `/novels/${novelId}/chapter-plans/generate`, { idempotencyKey: `setup-${action}-plan` });
  await postRouteOk(app, `/novels/${novelId}/chapter-plans/${plan.candidate.id}/adopt`, { reason: 'setup' });
  if (action === 'trial_chapter_one_generate') return target(`/novels/${novelId}/trial/generate`);
  const trial = await postRouteOk(app, `/novels/${novelId}/trial/generate`, { idempotencyKey: `setup-${action}-trial-one` });
  const selected = trial.trialRun.chapterOneCandidates.find((item: { isAiRecommended: boolean }) => item.isAiRecommended)
    ?? trial.trialRun.chapterOneCandidates[0];
  if (action === 'trial_followup_generate') return target(`/novels/${novelId}/trial/generate`, { trialRunId: trial.trialRun.id, selectedCandidateId: selected.id }, { authorityObjectId: trial.trialRun.id });
  await postRouteOk(app, `/novels/${novelId}/trial/generate`, { trialRunId: trial.trialRun.id, selectedCandidateId: selected.id, idempotencyKey: `setup-${action}-trial-followup` });
  const confirmed = await postRouteOk(app, `/novels/${novelId}/trial/confirm`, { trialRunId: trial.trialRun.id, decision: 'confirm_pass' });
  const strategy = confirmed.bodyStrategySnapshot;
  const chapters = repository.getNovelChapters().filter((item) => item.novelId === novelId).sort((a, b) => a.chapterNo - b.chapterNo);
  const chapter = chapters[3] ?? chapters[0];
  const bodyPayload = { strategySnapshotId: strategy.id, expectedStrategySnapshotVersion: strategy.versionNo };
  if (action === 'chapter_body_generate') return target(`/novels/${novelId}/chapters/${chapter.id}/generate`, bodyPayload, { chapterId: chapter.id, authorityObjectId: chapter.id });
  if (action === 'body_batch_generate') return target(`/novels/${novelId}/chapters/batch-generate`, bodyPayload);
  await postRouteOk(app, `/novels/${novelId}/chapters/${chapter.id}/generate`, { ...bodyPayload, idempotencyKey: `setup-${action}-single-body` });
  await postRouteOk(app, `/novels/${novelId}/chapters/batch-generate`, { ...bodyPayload, idempotencyKey: `setup-${action}-batch-body` });
  if (action === 'novel_full_review') return target(`/novels/${novelId}/full-review`);
  const currentChapter = repository.getNovelChapters().find((item) => item.novelId === novelId && item.currentContentVersionId);
  if (!currentChapter) throw new Error('body setup failed');
  if (action === 'chapter_rewrite') return target(`/novels/${novelId}/chapters/${currentChapter.id}/rewrite`, { instruction: 'authority matrix' }, { chapterId: currentChapter.id, authorityObjectId: currentChapter.id });
  if (action === 'chapter_impact_assess') return target(`/novels/${novelId}/chapters/${currentChapter.id}/impact-assessments`, {}, { chapterId: currentChapter.id, authorityObjectId: currentChapter.id });
  const rewrite = await postRouteOk(app, `/novels/${novelId}/chapters/${currentChapter.id}/rewrite`, { instruction: 'setup', idempotencyKey: `setup-${action}-rewrite` });
  return target(`/novels/${novelId}/chapters/${currentChapter.id}/content-versions/${rewrite.candidate.id}/adopt`, { reason: 'authority matrix' }, { chapterId: currentChapter.id, authorityObjectId: currentChapter.id });
}
function mutateAuthority(
  mutation: AuthorityMutation,
  phase: AuthorityPhase,
  action: NovelProviderAction,
  novel: NovelRecord,
  repository: ReturnType<typeof createInMemoryNovelRepository>,
  prepared: PreparedTarget
) {
  if (mutation === 'missing') {
    const previous = novel.deletedAt;
    novel.deletedAt = new Date('2026-07-17T00:01:00.000Z');
    return () => { novel.deletedAt = previous; };
  }
  if (phase !== 'before_claim') {
    const previous = novel.title;
    novel.title = `${previous} authority changed`;
    return () => { novel.title = previous; };
  }
  if (prepared.sourceVersionId) {
    const source = repository.getCreativeVersions().find((item) => item.id === prepared.sourceVersionId);
    if (!source) throw new Error('missing direction source');
    const previous = source.novelId;
    source.novelId = 'novel_authority_changed';
    return () => { source.novelId = previous; };
  }
  if (prepared.chapterId && ['chapter_rewrite', 'chapter_impact_assess', 'chapter_adopt_impact_assess'].includes(action)) {
    const chapter = repository.getNovelChapters().find((item) => item.id === prepared.chapterId);
    if (!chapter) throw new Error('missing chapter authority');
    const previous = chapter.currentContentVersionId;
    chapter.currentContentVersionId = 'content_authority_changed';
    return () => { chapter.currentContentVersionId = previous; };
  }
  const previous = novel.currentDirectionVersionId;
  novel.currentDirectionVersionId = 'direction_authority_changed';
  return () => { novel.currentDirectionVersionId = previous; };
}
function countedProviders(counters: { provider: number }, invocations: Array<{ action: NovelProviderAction; input: unknown }>): NovelProviderSet {
  const dispatchMethods = new Set<PropertyKey>([
    'generateCandidates', 'fuseCandidates', 'optimizeCandidate', 'generateAsset',
    'generateChapterOneCandidates', 'generateFollowup', 'generateBodyChapter',
    'rewriteChapter', 'assessImpact', 'generateFullReview'
  ]);
  const counted = <T extends object>(provider: T): T => new Proxy(provider, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        if (dispatchMethods.has(property)) {
          counters.provider += 1;
          const input = args[0] as { action?: NovelProviderAction };
          if (input?.action) invocations.push({ action: input.action, input: structuredClone(input) });
        }
        return Reflect.apply(value, target, args);
      };
    }
  });
  return {
    directionProvider: counted(new MockDirectionProvider()),
    structureProvider: counted(new MockStructureProvider()),
    trialProvider: counted(new MockTrialProvider()),
    bodyProvider: counted(new MockBodyProvider()),
    fullReviewProvider: counted(new MockFullReviewProvider())
  };
}
async function createRouteDraft(app: ReturnType<typeof Fastify>) {
  const response = await app.inject({ method: 'POST', url: '/novels/drafts', payload: {
    title: 'RP02B2a2 authority route', genres: ['都市逆袭'],
    preferences: { appealPoints: ['低谷翻盘'], targetAudience: '测试读者' },
    chapterLimit: 8, chapterWordRange: { min: 1200, max: 1600 }
  } });
  if (response.statusCode !== 201) throw new Error(response.body);
  return response.json().data.id as string;
}
async function postRouteOk(app: ReturnType<typeof Fastify>, url: string, payload: Record<string, unknown>) {
  const response = await app.inject({ method: 'POST', url, payload });
  if (response.statusCode !== 200) throw new Error(`${url}: ${response.body}`);
  return response.json().data;
}
