import assert from 'node:assert/strict';
import { it } from 'node:test';
import { TaskStatus } from '@ai-shortvideo/shared';
import { buildApp } from '../../src/app.js';
import { MockBodyProvider } from '../../src/modules/novels/providers/mockBodyProvider.js';
import { MockDirectionProvider } from '../../src/modules/novels/providers/mockDirectionProvider.js';
import { MockFullReviewProvider } from '../../src/modules/novels/providers/mockFullReviewProvider.js';
import { MockStructureProvider } from '../../src/modules/novels/providers/mockStructureProvider.js';
import { MockTrialProvider } from '../../src/modules/novels/providers/mockTrialProvider.js';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';
import { createLeasedActionExecutor } from '../../src/modules/novels/services/leasedActionExecutor.js';

it('queues both trial phases, recovers replays, and keeps results behind confirmation', async () => {
  const repository = createInMemoryNovelRepository();
  repository.getLeasedExecutionCapability = async (taskType) =>
    ['trial_writing_generate', 'trial_followup_generate'].includes(taskType) ? 'enabled' : 'unsupported';
  const now = new Date('2030-01-01T00:00:10.000Z');
  repository.getAuthoritativeTaskTime = async () => now;
  let asyncEnabled = false;
  const tenantId = 'tenant-trial-async';
  const app = await buildApp({ logger: false, novelRepository: repository,
    aiProviderEnv: { AI_PROVIDER_MODE: 'mock' },
    asyncTransportPolicy: () => ({ novelAsyncDispatchEnabled: asyncEnabled,
      scopeSecret: 'trial-async-scope-secret-32-bytes-min', apiAudience: 'novel-api', capabilityTtlMs: 60_000 }),
    requestContextResolver: async () => ({ tenantId, userId: 'user-trial-async' }), now: () => now });
  const post = async (url: string, payload: Record<string, unknown> = {}) => {
    const response = await app.inject({ method: 'POST', url, payload });
    assert.ok(response.statusCode >= 200 && response.statusCode < 300, response.body);
    return response.json().data;
  };
  try {
    const novel = await post('/novels/drafts', { title: '试写异步提交' });
    const novelId = novel.id as string;
    const direction = await post(`/novels/${novelId}/directions/generate`);
    const directionId = direction.candidates.find((candidate: { score: number }) => candidate.score >= 75).id;
    await post(`/novels/${novelId}/directions/${directionId}/adopt`,
      { currentVersionId: null, idempotencyKey: 'trial-async-adopt-direction', reason: '确认方向' });
    for (const [path, key] of [
      ['settings', 'setting'], ['outlines', 'outline'], ['stage-outlines', 'stageOutline'],
      ['chapter-plans', 'chapterPlan']
    ]) {
      const generated = await post(`/novels/${novelId}/${path}/generate`);
      await post(`/novels/${novelId}/${path}/${generated.candidate.id}/adopt`, { reason: `确认 ${key}` });
    }
    asyncEnabled = true;
    const capability = (await app.inject({ method: 'GET', url: '/novels/async-transport-capability' })).json().data;
    assert.equal(capability.enabled, true);
    const attestation = {
      expectedSubmissionScopeId: capability.submissionScopeId,
      expectedCapabilityRevision: capability.capabilityRevision,
      expectedCapabilityExpiresAt: capability.expiresAt
    };
    const trialUrl = `/novels/${novelId}/trial/generate`;
    const firstKey = 'trial-async-first-0001';
    const firstPayload = { ...attestation, chapterCount: 3 };
    const before = repository.getGenerationTasks().length;
    const missingAttestation = await app.inject({ method: 'POST', url: trialUrl,
      headers: { 'idempotency-key': firstKey }, payload: { chapterCount: 3 } });
    assert.equal(missingAttestation.statusCode, 409);
    assert.equal(repository.getGenerationTasks().length, before);
    const first = await app.inject({ method: 'POST', url: trialUrl,
      headers: { 'idempotency-key': firstKey }, payload: firstPayload });
    assert.equal(first.statusCode, 202, first.body);
    assert.equal(first.json().data.action, 'trial_chapter_one_generate');
    assert.equal(first.json().data.objectId, novelId);
    const firstTaskId = first.json().data.taskId as string;
    const replay = await app.inject({ method: 'POST', url: trialUrl,
      headers: { 'idempotency-key': firstKey }, payload: firstPayload });
    assert.equal(replay.statusCode, 202, replay.body);
    assert.equal(replay.json().data.taskId, firstTaskId);
    assert.equal(repository.getGenerationTasks().length, before + 1);

    const executor = createLeasedActionExecutor({ repository, providers: {
      directionProvider: new MockDirectionProvider(), structureProvider: new MockStructureProvider(),
      trialProvider: new MockTrialProvider(), bodyProvider: new MockBodyProvider(),
      fullReviewProvider: new MockFullReviewProvider()
    } });
    const settleNext = async (taskId: string, token: string) => {
      const lease = await repository.leaseNextQueuedTask('worker-trial-route', token, now,
        new Date(now.getTime() + 60_000));
      assert.equal(lease?.id, taskId);
      const result = await executor.execute({ task: lease!, leaseOwnerId: 'worker-trial-route', leaseToken: token,
        signal: new AbortController().signal, mutate: (operation) => operation() });
      assert.equal(result.kind, 'provider_result');
      await executor.settle({ task: lease!, leaseOwnerId: 'worker-trial-route', leaseToken: token,
        authoritativeNow: now, outcome: { kind: 'fulfilled', value: result } });
    };
    await settleNext(firstTaskId, 'trial-lease-one');
    assert.equal((await repository.findTaskById(tenantId, firstTaskId))?.status, TaskStatus.WaitingConfirmation);
    const trialRun = await repository.findLatestTrialRun(tenantId, novelId);
    assert.equal(trialRun?.status, 'waiting_chapter1_selection');
    const chapterOneCandidates = repository.getChapterContentVersions().filter((version) =>
      version.novelId === novelId && version.metadata?.trialRunId === trialRun?.id);
    assert.equal(chapterOneCandidates.length, 3);
    const selectedCandidateId = chapterOneCandidates[0].id;

    const followupKey = 'trial-async-followup-0001';
    const followupPayload = { ...attestation, trialRunId: trialRun!.id, selectedCandidateId };
    const followup = await app.inject({ method: 'POST', url: trialUrl,
      headers: { 'idempotency-key': followupKey }, payload: followupPayload });
    assert.equal(followup.statusCode, 202, followup.body);
    assert.equal(followup.json().data.action, 'trial_followup_generate');
    assert.equal(followup.json().data.objectId, trialRun!.id);
    const followupTaskId = followup.json().data.taskId as string;
    assert.equal((await app.inject({ method: 'POST', url: trialUrl,
      headers: { 'idempotency-key': followupKey }, payload: followupPayload })).json().data.taskId, followupTaskId);
    await settleNext(followupTaskId, 'trial-lease-followup');
    assert.equal((await repository.findTaskById(tenantId, followupTaskId))?.status, TaskStatus.WaitingConfirmation);
    assert.equal((await repository.findLatestTrialRun(tenantId, novelId))?.status, 'review_ready');
    assert.equal((await repository.findById(tenantId, novelId))?.creationStage, 'trial');
    const terminalReplay = await app.inject({ method: 'POST', url: trialUrl,
      headers: { 'idempotency-key': followupKey }, payload: followupPayload });
    assert.equal(terminalReplay.statusCode, 200, terminalReplay.body);
    assert.equal(terminalReplay.json().data.kind, 'existing');
    assert.equal(terminalReplay.json().data.taskId, followupTaskId);
    await post(`/novels/${novelId}/trial/confirm`, { trialRunId: trialRun!.id, decision: 'confirm_pass' });
    assert.equal((await repository.findById(tenantId, novelId))?.creationStage, 'body');
    const afterStageChange = await app.inject({ method: 'POST', url: trialUrl,
      headers: { 'idempotency-key': firstKey }, payload: firstPayload });
    assert.equal(afterStageChange.statusCode, 200, afterStageChange.body);
    assert.equal(afterStageChange.json().data.taskId, firstTaskId);
    assert.equal(repository.getGenerationTasks().length, before + 2);
  } finally {
    await app.close();
  }
});
