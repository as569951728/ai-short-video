import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TaskStatus, type DirectionCandidateContentDTO, type StructureAssetContentDTO, type StructureAssetType } from '@ai-shortvideo/shared';
import { buildApp } from '../../src/app.js';
import type { DirectionCandidateDraft, StructureAssetDraft } from '../../src/modules/novels/domain/novelDomain.js';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';

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
