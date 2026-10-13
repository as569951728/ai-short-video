import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TaskStatus, type DirectionCandidateContentDTO, type StructureAssetContentDTO, type StructureAssetType } from '@ai-shortvideo/shared';
import { buildApp } from '../../src/app.js';
import type { DirectionCandidateDraft, StructureAssetDraft } from '../../src/modules/novels/domain/novelDomain.js';
import { MockTrialProvider } from '../../src/modules/novels/providers/mockTrialProvider.js';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';
import type { NovelProviderActionInputFor } from '../../src/modules/novels/services/actionExecutionPlan.js';
import { createRouteAuthorityFixture } from './fixtures.js';

const at = (seconds: number) => new Date(Date.UTC(2030, 0, 1, 0, 0, seconds));
type FinalizeStage = 'asset' | 'receipt' | 'task' | 'event' | 'operation_log';

async function leasedDirection(onLeasedFinalizeStage?: (stage: FinalizeStage) => void,
  action: 'direction_generate' | 'direction_fuse' | 'direction_optimize' = 'direction_generate',
  onLeasedFailureStage?: (stage: 'event' | 'operation_log') => void) {
  const repository = createInMemoryNovelRepository({ onLeasedFinalizeStage, onLeasedFailureStage });
  const app = await buildApp({
    logger: false, novelRepository: repository,
    requestContextResolver: async () => ({ tenantId: 'tenant_finalize', userId: 'user_finalize' })
  });
  try {
    const draft = await app.inject({ method: 'POST', url: '/novels/drafts', payload: {
      title: '原子落账测试', genres: ['都市逆袭'], preferences: { appealPoints: ['逆袭'], targetAudience: '成年读者' },
      chapterLimit: 8, chapterWordRange: { min: 1800, max: 2600 }
    } });
    assert.equal(draft.statusCode, 201, draft.body);
    const novelId = draft.json().data.id as string;
    const generated = await app.inject({ method: 'POST', url: `/novels/${novelId}/directions/generate`, payload: {} });
    assert.equal(generated.statusCode, 200, generated.body);
    const sourceIds = (generated.json().data.candidates as Array<{ id: string }>).slice(0, 2).map((item) => item.id);
    const revision = action === 'direction_fuse'
      ? await app.inject({ method: 'POST', url: `/novels/${novelId}/directions/fuse`,
          payload: { versionIds: sourceIds, reason: '保留两个钩子' } })
      : action === 'direction_optimize'
        ? await app.inject({ method: 'POST', url: `/novels/${novelId}/directions/${sourceIds[0]}/optimize`,
            payload: { instruction: '强化人物动机' } })
        : generated;
    assert.equal(revision.statusCode, 200, revision.body);
    const task = repository.getGenerationTasks().find((item) => item.id === revision.json().data.task.id);
    assert.ok(task);
    const priorVersion = repository.getCreativeVersions().find((item) => item.sourceTaskId === task.id);
    assert.ok(priorVersion);
    const candidate: DirectionCandidateDraft = {
      title: '重生后的第二条路', summary: '新的候选方向',
      content: priorVersion.content as DirectionCandidateContentDTO,
      score: 88, marketScore: 87, riskLevel: priorVersion.riskLevel,
      riskTags: [], recommendedReason: '主线更清楚'
    };
    task.status = TaskStatus.Queued;
    task.startedAt = null;
    task.finishedAt = null;
    task.providerAttemptId = null;
    task.providerAttemptPhase = null;
    task.providerDispatchedAt = null;
    task.resultReceiptHash = null;
    task.providerCallBudgetUsed = 0;
    const lease = await repository.leaseNextQueuedTask('worker-finalize', 'lease-finalize', at(0), at(60));
    assert.equal(lease?.id, task.id);
    const base = { tenantId: task.tenantId, taskId: task.id, leaseOwnerId: 'worker-finalize', leaseToken: 'lease-finalize' };
    assert.equal((await repository.checkpointLeasedTask({ ...base, authoritativeNow: at(1), checkpoint: {
      expectedPhase: 'leased', nextPhase: 'prepared'
    } })).outcome, 'applied');
    assert.equal((await repository.checkpointLeasedTask({ ...base, authoritativeNow: at(2), checkpoint: {
      expectedPhase: 'prepared', nextPhase: 'provider_call_started', providerAttemptId: 'attempt-finalize'
    } })).outcome, 'applied');
    assert.equal((await repository.checkpointLeasedTask({ ...base, authoritativeNow: at(3), checkpoint: {
      expectedPhase: 'provider_call_started', nextPhase: 'provider_result_validated', providerAttemptId: 'attempt-finalize'
    } })).outcome, 'applied');
    return { repository, task, novelId, candidate, finalizeInput: {
      ...base, authoritativeNow: at(4), providerAttemptId: 'attempt-finalize',
      validatedResult: action === 'direction_generate' ? [candidate] : candidate
    } };
  } finally {
    await app.close();
  }
}

async function leasedStructure(objectType: StructureAssetType, onLeasedFinalizeStage?: (stage: FinalizeStage) => void) {
  const repository = createInMemoryNovelRepository({ onLeasedFinalizeStage });
  const app = await buildApp({
    logger: false, novelRepository: repository,
    requestContextResolver: async () => ({ tenantId: 'tenant_structure', userId: 'user_structure' })
  });
  try {
    const post = async (url: string, payload: unknown = {}) => {
      const response = await app.inject({ method: 'POST', url, payload });
      assert.ok(response.statusCode === 200 || response.statusCode === 201, response.body);
      return response.json().data;
    };
    const draft = await post('/novels/drafts', {
      title: '结构原子落账', genres: ['都市逆袭'], preferences: { appealPoints: ['逆袭'], targetAudience: '成年读者' },
      chapterLimit: 8, chapterWordRange: { min: 1800, max: 2600 }
    });
    const novelId = draft.id as string;
    const direction = await post(`/novels/${novelId}/directions/generate`);
    await post(`/novels/${novelId}/directions/${direction.candidates[0].id}/adopt`, {
      currentVersionId: null, idempotencyKey: 'adopt-structure-direction', reason: '采用低分测试方向',
      confirmLowScore: true
    });
    const resources = [
      ['setting', 'settings'], ['outline', 'outlines'],
      ['stage_outline', 'stage-outlines'], ['chapter_plan', 'chapter-plans']
    ] as const;
    let target: { task: { id: string }; candidate: { id: string } } | null = null;
    for (const [kind, resource] of resources) {
      const generated = await post(`/novels/${novelId}/${resource}/generate`);
      if (kind === objectType) {
        target = generated;
        break;
      }
      await post(`/novels/${novelId}/${resource}/${generated.candidate.id}/adopt`, { reason: '采用上游结构资产' });
    }
    assert.ok(target);
    const task = repository.getGenerationTasks().find((item) => item.id === target.task.id);
    assert.ok(task);
    const version = repository.getCreativeVersions().find((item) => item.id === target.candidate.id);
    assert.ok(version);
    const metadata = version.metadata as { riskTags: string[]; recommendedReason: string };
    const content = version.content as StructureAssetContentDTO;
    const asset: StructureAssetDraft = {
      objectType, title: content.title, summary: version.summary!, content,
      score: version.score!, riskLevel: version.riskLevel,
      riskTags: metadata.riskTags, recommendedReason: metadata.recommendedReason
    };
    task.status = TaskStatus.Queued;
    task.startedAt = null;
    task.finishedAt = null;
    task.providerAttemptId = null;
    task.providerAttemptPhase = null;
    task.providerDispatchedAt = null;
    task.resultReceiptHash = null;
    task.providerCallBudgetUsed = 0;
    assert.equal((await repository.leaseNextQueuedTask('worker-structure', 'lease-structure', at(0), at(60)))?.id, task.id);
    const base = { tenantId: task.tenantId, taskId: task.id, leaseOwnerId: 'worker-structure', leaseToken: 'lease-structure' };
    assert.equal((await repository.checkpointLeasedTask({ ...base, authoritativeNow: at(1), checkpoint: {
      expectedPhase: 'leased', nextPhase: 'prepared'
    } })).outcome, 'applied');
    assert.equal((await repository.checkpointLeasedTask({ ...base, authoritativeNow: at(2), checkpoint: {
      expectedPhase: 'prepared', nextPhase: 'provider_call_started', providerAttemptId: 'attempt-structure'
    } })).outcome, 'applied');
    assert.equal((await repository.checkpointLeasedTask({ ...base, authoritativeNow: at(3), checkpoint: {
      expectedPhase: 'provider_call_started', nextPhase: 'provider_result_validated', providerAttemptId: 'attempt-structure'
    } })).outcome, 'applied');
    return { repository, task, novelId, asset, finalizeInput: {
      ...base, authoritativeNow: at(4), providerAttemptId: 'attempt-structure', validatedResult: asset
    } };
  } finally {
    await app.close();
  }
}

async function leasedTrialOne(onLeasedFinalizeStage?: (stage: FinalizeStage) => void) {
  const repository = createInMemoryNovelRepository({ onLeasedFinalizeStage });
  const fixture = await createRouteAuthorityFixture('trial_chapter_one_generate', repository);
  try {
    const generated = await fixture.runSuccess('leased-trial-one');
    assert.equal(generated.statusCode, 200, generated.body);
    const task = repository.getGenerationTasks().find((item) => item.id === generated.json().data.task.id);
    assert.ok(task);
    const invocation = fixture.providerInvocations().find((item) => item.action === 'trial_chapter_one_generate');
    assert.ok(invocation);
    const candidates = await new MockTrialProvider().generateChapterOneCandidates(
      invocation.input as NovelProviderActionInputFor<'trial_chapter_one_generate'>
    );
    task.status = TaskStatus.Queued;
    task.startedAt = null;
    task.finishedAt = null;
    task.providerAttemptId = null;
    task.providerAttemptPhase = null;
    task.providerDispatchedAt = null;
    task.resultReceiptHash = null;
    task.providerCallBudgetUsed = 0;
    assert.equal((await repository.leaseNextQueuedTask('worker-trial', 'lease-trial', at(0), at(60)))?.id, task.id);
    const base = { tenantId: task.tenantId, taskId: task.id, leaseOwnerId: 'worker-trial', leaseToken: 'lease-trial' };
    assert.equal((await repository.checkpointLeasedTask({ ...base, authoritativeNow: at(1), checkpoint: {
      expectedPhase: 'leased', nextPhase: 'prepared'
    } })).outcome, 'applied');
    assert.equal((await repository.checkpointLeasedTask({ ...base, authoritativeNow: at(2), checkpoint: {
      expectedPhase: 'prepared', nextPhase: 'provider_call_started', providerAttemptId: 'attempt-trial'
    } })).outcome, 'applied');
    assert.equal((await repository.checkpointLeasedTask({ ...base, authoritativeNow: at(3), checkpoint: {
      expectedPhase: 'provider_call_started', nextPhase: 'provider_result_validated', providerAttemptId: 'attempt-trial'
    } })).outcome, 'applied');
    return { repository, task, novelId: fixture.novelId, candidates, finalizeInput: {
      ...base, authoritativeNow: at(4), providerAttemptId: 'attempt-trial', validatedResult: candidates
    } };
  } finally {
    await fixture.app.close();
  }
}

function restoreMutableRecords<T extends object>(items: T[]): () => void {
  const originals = [...items];
  const snapshots = originals.map((item) => structuredClone(item));
  return () => {
    originals.forEach((item, index) => Object.assign(item, snapshots[index]));
    items.splice(0, items.length, ...originals);
  };
}

async function leasedTrialFollowup(onLeasedFinalizeStage?: (stage: FinalizeStage) => void) {
  const repository = createInMemoryNovelRepository({ onLeasedFinalizeStage });
  const fixture = await createRouteAuthorityFixture('trial_followup_generate', repository);
  try {
    const novel = await repository.findById('tenant_test', fixture.novelId);
    assert.ok(novel);
    const novelBefore = structuredClone(novel);
    const sourceRun = repository.getTrialRuns().find((item) => item.id === fixture.authorityObjectId);
    assert.ok(sourceRun);
    const sourceTask = repository.getGenerationTasks().find((item) => item.id === sourceRun.sourceTaskId);
    const sourceTaskBefore = sourceTask ? structuredClone(sourceTask) : null;
    const restore = [
      restoreMutableRecords(repository.getNovelChapters()),
      restoreMutableRecords(repository.getChapterContentVersions()),
      restoreMutableRecords(repository.getChapterFeatureCards()),
      restoreMutableRecords(repository.getReviewReports()),
      restoreMutableRecords(repository.getTrialRuns()),
      restoreMutableRecords(repository.getTrialChapterResults())
    ];
    const generated = await fixture.runSuccess('leased-trial-followup');
    assert.equal(generated.statusCode, 200, generated.body);
    const task = repository.getGenerationTasks().find((item) => item.id === generated.json().data.task.id);
    assert.ok(task);
    const invocation = fixture.providerInvocations().find((item) => item.action === 'trial_followup_generate');
    assert.ok(invocation);
    const followup = await new MockTrialProvider().generateFollowup(
      invocation.input as NovelProviderActionInputFor<'trial_followup_generate'>
    );
    restore.forEach((restoreStore) => restoreStore());
    Object.assign(novel, novelBefore);
    if (sourceTask && sourceTaskBefore) Object.assign(sourceTask, sourceTaskBefore);
    task.status = TaskStatus.Queued;
    task.startedAt = null;
    task.finishedAt = null;
    task.providerAttemptId = null;
    task.providerAttemptPhase = null;
    task.providerDispatchedAt = null;
    task.resultReceiptHash = null;
    task.providerCallBudgetUsed = 0;
    assert.equal((await repository.leaseNextQueuedTask('worker-followup', 'lease-followup', at(0), at(60)))?.id, task.id);
    const base = { tenantId: task.tenantId, taskId: task.id, leaseOwnerId: 'worker-followup', leaseToken: 'lease-followup' };
    assert.equal((await repository.checkpointLeasedTask({ ...base, authoritativeNow: at(1), checkpoint: {
      expectedPhase: 'leased', nextPhase: 'prepared'
    } })).outcome, 'applied');
    assert.equal((await repository.checkpointLeasedTask({ ...base, authoritativeNow: at(2), checkpoint: {
      expectedPhase: 'prepared', nextPhase: 'provider_call_started', providerAttemptId: 'attempt-followup'
    } })).outcome, 'applied');
    assert.equal((await repository.checkpointLeasedTask({ ...base, authoritativeNow: at(3), checkpoint: {
      expectedPhase: 'provider_call_started', nextPhase: 'provider_result_validated', providerAttemptId: 'attempt-followup'
    } })).outcome, 'applied');
    return { repository, task, novelId: fixture.novelId, sourceRun, followup, finalizeInput: {
      ...base, authoritativeNow: at(4), providerAttemptId: 'attempt-followup', validatedResult: followup
    } };
  } finally {
    await fixture.app.close();
  }
}

describe('RP-02B2a4 in-memory direction fenced finalize', () => {
  it('writes one candidate, canonical receipt, terminal event and audit without adopting it', async () => {
    const { repository, task, novelId, finalizeInput } = await leasedDirection();
    const before = { versions: repository.getCreativeVersions().length, events: repository.getGenerationTaskEvents().length,
      logs: repository.getOperationLogs().length };
    assert.equal((await repository.finalizeLeasedAction(finalizeInput)).outcome, 'applied');
    assert.equal(repository.getCreativeVersions().length, before.versions + 1);
    assert.equal(repository.getGenerationTaskEvents().length, before.events + 1);
    assert.equal(repository.getOperationLogs().length, before.logs + 1);
    assert.equal(task.status, TaskStatus.WaitingConfirmation);
    assert.equal(task.resultVersionIds?.length, 1);
    assert.match(task.resultReceiptHash ?? '', /^[0-9a-f]{64}$/);
    assert.equal(task.activeClaimKey, null);
    assert.equal(task.leaseToken, null);
    assert.equal((await repository.findById(task.tenantId, novelId))?.currentDirectionVersionId, null);
    assert.equal((await repository.finalizeLeasedAction(finalizeInput)).outcome, 'fenced');
    assert.equal(repository.getCreativeVersions().length, before.versions + 1);
    assert.equal(repository.getGenerationTaskEvents().length, before.events + 1);
    assert.equal(repository.getOperationLogs().length, before.logs + 1);
  });

  for (const action of ['direction_fuse', 'direction_optimize'] as const) {
    it(`persists ${action} as a new candidate with the original user instruction`, async () => {
      const { repository, task, finalizeInput } = await leasedDirection(undefined, action);
      const before = repository.getCreativeVersions().length;
      assert.equal((await repository.finalizeLeasedAction(finalizeInput)).outcome, 'applied');
      assert.equal(repository.getCreativeVersions().length, before + 1);
      const version = repository.getCreativeVersions().find((item) => item.id === task.resultVersionIds?.[0]);
      assert.ok(version);
      assert.equal(version.changeReason, action === 'direction_fuse' ? '保留两个钩子' : '强化人物动机');
      assert.equal(version.status, 'candidate');
      assert.equal(task.status, TaskStatus.WaitingConfirmation);
    });
  }

  for (const failAt of ['asset', 'receipt', 'task', 'event', 'operation_log'] as const) {
    it(`rolls back all writes when ${failAt} fails`, async () => {
      const { repository, task, novelId, finalizeInput } = await leasedDirection((stage) => {
        if (stage === failAt) throw new Error('injected finalize fault');
      });
      const before = { versions: repository.getCreativeVersions().length, events: repository.getGenerationTaskEvents().length,
        logs: repository.getOperationLogs().length };
      await assert.rejects(repository.finalizeLeasedAction(finalizeInput), /injected finalize fault/);
      assert.equal(repository.getCreativeVersions().length, before.versions);
      assert.equal(repository.getGenerationTaskEvents().length, before.events);
      assert.equal(repository.getOperationLogs().length, before.logs);
      assert.equal(task.status, TaskStatus.Processing);
      assert.equal(task.providerAttemptPhase, 'provider_result_validated');
      assert.equal(task.resultReceiptHash, null);
      assert.equal(task.leaseToken, 'lease-finalize');
      assert.equal((await repository.findById(task.tenantId, novelId))?.currentDirectionVersionId, null);
    });
  }

  it('fails stale authority without writing the returned candidate or a receipt', async () => {
    const { repository, task, novelId, finalizeInput } = await leasedDirection();
    const novel = await repository.findById(task.tenantId, novelId);
    assert.ok(novel);
    novel.title = '来源已变化';
    const before = { versions: repository.getCreativeVersions().length, events: repository.getGenerationTaskEvents().length,
      logs: repository.getOperationLogs().length };
    assert.equal((await repository.finalizeLeasedAction(finalizeInput)).outcome, 'applied');
    assert.equal(task.status, TaskStatus.Failed);
    assert.equal(task.errorCode, 'SOURCE_STALE');
    assert.equal(task.resultReceiptHash, null);
    assert.equal(repository.getCreativeVersions().length, before.versions);
    assert.equal(repository.getGenerationTaskEvents().length, before.events + 1);
    assert.equal(repository.getOperationLogs().length, before.logs + 1);
  });

  for (const failAt of ['event', 'operation_log'] as const) {
    it(`rolls back a stale failure when its ${failAt} audit write fails`, async () => {
      const { repository, task, novelId, finalizeInput } = await leasedDirection(undefined, 'direction_generate', (stage) => {
        if (stage === failAt) throw new Error('injected failure audit fault');
      });
      const novel = await repository.findById(task.tenantId, novelId);
      assert.ok(novel);
      novel.title = '来源已变化';
      const before = { versions: repository.getCreativeVersions().length, events: repository.getGenerationTaskEvents().length,
        logs: repository.getOperationLogs().length };
      await assert.rejects(repository.finalizeLeasedAction(finalizeInput), /injected failure audit fault/);
      assert.equal(task.status, TaskStatus.Processing);
      assert.equal(task.leaseToken, 'lease-finalize');
      assert.equal(repository.getCreativeVersions().length, before.versions);
      assert.equal(repository.getGenerationTaskEvents().length, before.events);
      assert.equal(repository.getOperationLogs().length, before.logs);
    });
  }

  it('rejects a model result that does not meet the direction content contract', async () => {
    const { repository, task, candidate, finalizeInput } = await leasedDirection();
    const beforeVersions = repository.getCreativeVersions().length;
    const result = await repository.finalizeLeasedAction({ ...finalizeInput, validatedResult: [{
      ...candidate, content: { title: '不完整方向' } as DirectionCandidateContentDTO
    }] });
    assert.equal(result.outcome, 'applied');
    assert.equal(task.status, TaskStatus.Failed);
    assert.equal(task.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
    assert.equal(task.resultReceiptHash, null);
    assert.equal(repository.getCreativeVersions().length, beforeVersions);
  });

  it('fences expired and cancelled owners before asset creation', async () => {
    const { repository, task, finalizeInput } = await leasedDirection();
    const beforeVersions = repository.getCreativeVersions().length;
    assert.equal((await repository.finalizeLeasedAction({ ...finalizeInput, authoritativeNow: at(60) })).outcome, 'fenced');
    assert.equal(repository.getCreativeVersions().length, beforeVersions);
    task.status = TaskStatus.Cancelled;
    assert.equal((await repository.finalizeLeasedAction(finalizeInput)).outcome, 'fenced');
    assert.equal(repository.getCreativeVersions().length, beforeVersions);
  });
});

describe('RP-02B2a4 in-memory structure fenced finalize', () => {
  for (const objectType of ['setting', 'outline', 'stage_outline', 'chapter_plan'] as const) {
    it(`creates only a candidate for ${objectType}`, async () => {
      const { repository, task, novelId, finalizeInput } = await leasedStructure(objectType);
      const before = { versions: repository.getCreativeVersions().length, events: repository.getGenerationTaskEvents().length,
        logs: repository.getOperationLogs().length };
      assert.equal((await repository.finalizeLeasedAction(finalizeInput)).outcome, 'applied');
      assert.equal(repository.getCreativeVersions().length, before.versions + 1);
      assert.equal(repository.getGenerationTaskEvents().length, before.events + 1);
      assert.equal(repository.getOperationLogs().length, before.logs + 1);
      assert.equal(task.status, TaskStatus.WaitingConfirmation);
      assert.match(task.resultReceiptHash ?? '', /^[0-9a-f]{64}$/);
      const newVersion = repository.getCreativeVersions().find((item) => item.id === task.resultVersionIds[0]);
      assert.equal(newVersion?.objectType, objectType);
      assert.equal(newVersion?.status, 'candidate');
      const novel = await repository.findById(task.tenantId, novelId);
      assert.ok(novel);
      const currentPointer = {
        setting: novel.currentSettingVersionId, outline: novel.currentOutlineVersionId,
        stage_outline: novel.currentStageOutlineVersionId, chapter_plan: novel.currentChapterPlanVersionId
      }[objectType];
      assert.equal(currentPointer, null);
      assert.equal((await repository.finalizeLeasedAction(finalizeInput)).outcome, 'fenced');
    });
  }

  for (const failAt of ['asset', 'receipt', 'task', 'event', 'operation_log'] as const) {
    it(`rolls back chapter-plan writes when ${failAt} fails`, async () => {
      const { repository, task, finalizeInput } = await leasedStructure('chapter_plan', (stage) => {
        if (stage === failAt) throw new Error('injected structure finalize fault');
      });
      const before = { versions: repository.getCreativeVersions().length, events: repository.getGenerationTaskEvents().length,
        logs: repository.getOperationLogs().length };
      await assert.rejects(repository.finalizeLeasedAction(finalizeInput), /injected structure finalize fault/);
      assert.equal(repository.getCreativeVersions().length, before.versions);
      assert.equal(repository.getGenerationTaskEvents().length, before.events);
      assert.equal(repository.getOperationLogs().length, before.logs);
      assert.equal(task.status, TaskStatus.Processing);
      assert.equal(task.resultReceiptHash, null);
      assert.equal(task.leaseToken, 'lease-structure');
    });
  }

  it('rejects a chapter plan with malformed chapter fields before persistence', async () => {
    const { repository, task, asset, finalizeInput } = await leasedStructure('chapter_plan');
    const beforeVersions = repository.getCreativeVersions().length;
    const result = await repository.finalizeLeasedAction({ ...finalizeInput, validatedResult: {
      ...asset, content: { ...asset.content, chapters: [{ chapterNo: 1 }] as StructureAssetContentDTO['chapters'] }
    } });
    assert.equal(result.outcome, 'applied');
    assert.equal(task.status, TaskStatus.Failed);
    assert.equal(task.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
    assert.equal(repository.getCreativeVersions().length, beforeVersions);
  });

  it('rejects an incomplete chapter plan before persistence', async () => {
    const { repository, task, asset, finalizeInput } = await leasedStructure('chapter_plan');
    const beforeVersions = repository.getCreativeVersions().length;
    const result = await repository.finalizeLeasedAction({ ...finalizeInput, validatedResult: {
      ...asset, content: { ...asset.content, chapters: asset.content.chapters.slice(0, -1) }
    } });
    assert.equal(result.outcome, 'applied');
    assert.equal(task.status, TaskStatus.Failed);
    assert.equal(task.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
    assert.equal(repository.getCreativeVersions().length, beforeVersions);
  });

  it('fails stale upstream structure without writing a candidate or receipt', async () => {
    const { repository, task, novelId, finalizeInput } = await leasedStructure('chapter_plan');
    const novel = await repository.findById(task.tenantId, novelId);
    assert.ok(novel);
    novel.currentStageOutlineVersionId = 'replaced-stage-outline';
    const beforeVersions = repository.getCreativeVersions().length;
    assert.equal((await repository.finalizeLeasedAction(finalizeInput)).outcome, 'applied');
    assert.equal(task.status, TaskStatus.Failed);
    assert.equal(task.errorCode, 'SOURCE_STALE');
    assert.equal(task.resultReceiptHash, null);
    assert.equal(repository.getCreativeVersions().length, beforeVersions);
  });
});

describe('RP-02B2a4 in-memory trial chapter one fenced finalize', () => {
  it('creates candidate chapter versions and a selectable trial run atomically', async () => {
    const { repository, task, novelId, candidates, finalizeInput } = await leasedTrialOne();
    const before = { versions: repository.getChapterContentVersions().length, runs: repository.getTrialRuns().length,
      events: repository.getGenerationTaskEvents().length, logs: repository.getOperationLogs().length };
    assert.equal((await repository.finalizeLeasedAction(finalizeInput)).outcome, 'applied');
    assert.equal(repository.getChapterContentVersions().length, before.versions + candidates.length);
    assert.equal(repository.getTrialRuns().length, before.runs + 1);
    assert.equal(repository.getGenerationTaskEvents().length, before.events + 1);
    assert.equal(repository.getOperationLogs().length, before.logs + 1);
    assert.equal(task.status, TaskStatus.WaitingConfirmation);
    assert.equal(task.resultObjectType, 'trial_run');
    assert.match(task.resultReceiptHash ?? '', /^[0-9a-f]{64}$/);
    assert.equal(task.resultVersionIds.length, candidates.length);
    const run = repository.getTrialRuns().find((item) => item.id === task.resultObjectId);
    assert.equal(run?.status, 'waiting_chapter1_selection');
    assert.ok(task.resultVersionIds.every((id) => repository.getChapterContentVersions().some((version) =>
      version.id === id && version.status === 'candidate' && version.chapterId === candidates[0]?.chapterId)));
    const chapter = repository.getNovelChapters().find((item) => item.novelId === novelId && item.chapterNo === 1);
    assert.equal(chapter?.currentContentVersionId, null);
    assert.equal((await repository.finalizeLeasedAction(finalizeInput)).outcome, 'fenced');
  });

  for (const failAt of ['asset', 'receipt', 'task', 'event', 'operation_log'] as const) {
    it(`rolls back trial candidates and run when ${failAt} fails`, async () => {
      const { repository, task, finalizeInput } = await leasedTrialOne((stage) => {
        if (stage === failAt) throw new Error('injected trial finalize fault');
      });
      const before = { versions: repository.getChapterContentVersions().length, runs: repository.getTrialRuns().length,
        events: repository.getGenerationTaskEvents().length, logs: repository.getOperationLogs().length };
      await assert.rejects(repository.finalizeLeasedAction(finalizeInput), /injected trial finalize fault/);
      assert.equal(repository.getChapterContentVersions().length, before.versions);
      assert.equal(repository.getTrialRuns().length, before.runs);
      assert.equal(repository.getGenerationTaskEvents().length, before.events);
      assert.equal(repository.getOperationLogs().length, before.logs);
      assert.equal(task.status, TaskStatus.Processing);
      assert.equal(task.resultReceiptHash, null);
      assert.equal(task.leaseToken, 'lease-trial');
    });
  }

  it('rejects an overlength chapter candidate without a new run or version', async () => {
    const { repository, task, candidates, finalizeInput } = await leasedTrialOne();
    const before = { versions: repository.getChapterContentVersions().length, runs: repository.getTrialRuns().length };
    const result = await repository.finalizeLeasedAction({ ...finalizeInput, validatedResult: [
      { ...candidates[0]!, content: candidates[0]!.content.repeat(2) }, ...candidates.slice(1)
    ] });
    assert.equal(result.outcome, 'applied');
    assert.equal(task.status, TaskStatus.Failed);
    assert.equal(task.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
    assert.equal(repository.getChapterContentVersions().length, before.versions);
    assert.equal(repository.getTrialRuns().length, before.runs);
  });

  it('rejects incomplete scoring before persisting trial candidates', async () => {
    const { repository, task, candidates, finalizeInput } = await leasedTrialOne();
    const before = { versions: repository.getChapterContentVersions().length, runs: repository.getTrialRuns().length };
    const result = await repository.finalizeLeasedAction({ ...finalizeInput, validatedResult: [
      { ...candidates[0]!, scoring: { ...candidates[0]!.scoring, dimensions: [{ key: 'missing_score' }] } as typeof candidates[0]['scoring'] },
      ...candidates.slice(1)
    ] });
    assert.equal(result.outcome, 'applied');
    assert.equal(task.status, TaskStatus.Failed);
    assert.equal(task.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
    assert.equal(repository.getChapterContentVersions().length, before.versions);
    assert.equal(repository.getTrialRuns().length, before.runs);
  });

  it('fences a cancelled or expired trial result before writing assets', async () => {
    const { repository, task, finalizeInput } = await leasedTrialOne();
    const before = { versions: repository.getChapterContentVersions().length, runs: repository.getTrialRuns().length };
    assert.equal((await repository.finalizeLeasedAction({ ...finalizeInput, authoritativeNow: at(60) })).outcome, 'fenced');
    task.status = TaskStatus.Cancelled;
    assert.equal((await repository.finalizeLeasedAction(finalizeInput)).outcome, 'fenced');
    assert.equal(repository.getChapterContentVersions().length, before.versions);
    assert.equal(repository.getTrialRuns().length, before.runs);
  });

  it('rejects stale chapter authority before persisting trial candidates', async () => {
    const { repository, task, novelId, finalizeInput } = await leasedTrialOne();
    const chapter = repository.getNovelChapters().find((item) => item.novelId === novelId && item.chapterNo === 1);
    assert.ok(chapter);
    chapter.wordTarget = (chapter.wordTarget ?? 2000) + 100;
    const before = repository.getChapterContentVersions().length;
    assert.equal((await repository.finalizeLeasedAction(finalizeInput)).outcome, 'applied');
    assert.equal(task.status, TaskStatus.Failed);
    assert.equal(task.errorCode, 'SOURCE_STALE');
    assert.equal(task.resultReceiptHash, null);
    assert.equal(repository.getChapterContentVersions().length, before);
  });
});

describe('RP-02B2a4 in-memory trial followup fenced finalize', () => {
  it('writes chapter, feature-card, review, result and receipt together', async () => {
    const { repository, task, sourceRun, finalizeInput } = await leasedTrialFollowup();
    const before = { versions: repository.getChapterContentVersions().length,
      cards: repository.getChapterFeatureCards().length, reports: repository.getReviewReports().length,
      results: repository.getTrialChapterResults().length, events: repository.getGenerationTaskEvents().length };
    assert.equal((await repository.finalizeLeasedAction(finalizeInput)).outcome, 'applied');
    assert.equal(repository.getChapterContentVersions().length, before.versions + 2);
    assert.equal(repository.getChapterFeatureCards().length, before.cards + 3);
    assert.equal(repository.getReviewReports().length, before.reports + 4);
    assert.equal(repository.getTrialChapterResults().length, before.results + 3);
    assert.ok(repository.getGenerationTaskEvents().length > before.events);
    assert.equal(task.status, TaskStatus.WaitingConfirmation);
    assert.match(task.resultReceiptHash ?? '', /^[0-9a-f]{64}$/);
    assert.equal(sourceRun.status, 'review_ready');
    assert.equal(sourceRun.sourceTaskId, task.id);
    assert.equal((await repository.finalizeLeasedAction(finalizeInput)).outcome, 'fenced');
  });

  for (const failAt of ['asset', 'receipt', 'task', 'event', 'operation_log'] as const) {
    it(`rolls back all followup writes when ${failAt} fails`, async () => {
      const { repository, task, sourceRun, finalizeInput } = await leasedTrialFollowup((stage) => {
        if (stage === failAt) throw new Error('injected followup fault');
      });
      const before = { versions: repository.getChapterContentVersions().length,
        cards: repository.getChapterFeatureCards().length, reports: repository.getReviewReports().length,
        results: repository.getTrialChapterResults().length,
        events: repository.getGenerationTaskEvents().length, logs: repository.getOperationLogs().length };
      const chapterPointers = repository.getNovelChapters().map((chapter) => ({
        id: chapter.id,
        currentContentVersionId: chapter.currentContentVersionId,
        currentFeatureCardVersionId: chapter.currentFeatureCardVersionId,
        currentReviewReportId: chapter.currentReviewReportId
      }));
      const candidateStates = repository.getChapterContentVersions().map((version) => ({
        id: version.id, status: version.status, metadata: structuredClone(version.metadata)
      }));
      await assert.rejects(repository.finalizeLeasedAction(finalizeInput), /injected followup fault/);
      assert.equal(repository.getChapterContentVersions().length, before.versions);
      assert.equal(repository.getChapterFeatureCards().length, before.cards);
      assert.equal(repository.getReviewReports().length, before.reports);
      assert.equal(repository.getTrialChapterResults().length, before.results);
      assert.equal(repository.getGenerationTaskEvents().length, before.events);
      assert.equal(repository.getOperationLogs().length, before.logs);
      assert.deepEqual(repository.getNovelChapters().map((chapter) => ({
        id: chapter.id,
        currentContentVersionId: chapter.currentContentVersionId,
        currentFeatureCardVersionId: chapter.currentFeatureCardVersionId,
        currentReviewReportId: chapter.currentReviewReportId
      })), chapterPointers);
      assert.deepEqual(repository.getChapterContentVersions().map((version) => ({
        id: version.id, status: version.status, metadata: version.metadata
      })), candidateStates);
      assert.equal(sourceRun.status, 'waiting_chapter1_selection');
      assert.equal(task.status, TaskStatus.Processing);
      assert.equal(task.resultReceiptHash, null);
      assert.equal(task.leaseToken, 'lease-followup');
    });
  }

  it('rejects mismatched model chapter scores before writing assets', async () => {
    const { repository, task, followup, finalizeInput } = await leasedTrialFollowup();
    const before = repository.getChapterContentVersions().length;
    const result = await repository.finalizeLeasedAction({ ...finalizeInput, validatedResult: {
      chapters: followup.chapters,
      review: { ...followup.review, chapterScores: followup.review.chapterScores.map((score, index) =>
        index === 0 ? { ...score, score: score.score - 1 } : score) }
    } });
    assert.equal(result.outcome, 'applied');
    assert.equal(task.status, TaskStatus.Failed);
    assert.equal(task.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
    assert.equal(repository.getChapterContentVersions().length, before);
  });

  it('fences a cancelled or expired followup result', async () => {
    const { repository, task, finalizeInput } = await leasedTrialFollowup();
    const before = { versions: repository.getChapterContentVersions().length,
      results: repository.getTrialChapterResults().length };
    assert.equal((await repository.finalizeLeasedAction({ ...finalizeInput, authoritativeNow: at(60) })).outcome, 'fenced');
    task.status = TaskStatus.Cancelled;
    assert.equal((await repository.finalizeLeasedAction(finalizeInput)).outcome, 'fenced');
    assert.equal(repository.getChapterContentVersions().length, before.versions);
    assert.equal(repository.getTrialChapterResults().length, before.results);
  });

  it('fails stale trial authority before writing any followup assets', async () => {
    const { repository, task, novelId, finalizeInput } = await leasedTrialFollowup();
    const novel = await repository.findById(task.tenantId, novelId);
    assert.ok(novel);
    novel.currentChapterPlanVersionId = 'replaced-plan';
    const before = repository.getChapterContentVersions().length;
    assert.equal((await repository.finalizeLeasedAction(finalizeInput)).outcome, 'applied');
    assert.equal(task.status, TaskStatus.Failed);
    assert.equal(task.errorCode, 'SOURCE_STALE');
    assert.equal(task.resultReceiptHash, null);
    assert.equal(repository.getChapterContentVersions().length, before);
  });
});
