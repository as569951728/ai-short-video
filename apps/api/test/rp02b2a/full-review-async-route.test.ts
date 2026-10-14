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

it('queues full review once and resumes the same result without confirming novel completion', async () => {
  const repository = createInMemoryNovelRepository();
  repository.getLeasedExecutionCapability = async (taskType) =>
    taskType === 'novel_full_review' ? 'enabled' : 'unsupported';
  const now = new Date('2030-01-01T00:00:10.000Z');
  repository.getAuthoritativeTaskTime = async () => now;
  const tenantId = 'tenant-review-async';
  const model = new MockFullReviewProvider();
  let providerCalls = 0;
  const fullReviewProvider = {
    getLeasedPaidCallBudget: () => 1 as const,
    async generateFullReview(input: Parameters<MockFullReviewProvider['generateFullReview']>[0]) {
      providerCalls += 1;
      return model.generateFullReview(input);
    }
  };
  let asyncEnabled = false;
  const app = await buildApp({ logger: false, novelRepository: repository, fullReviewProvider,
    enableAcceptanceSeeds: true, aiProviderEnv: { AI_PROVIDER_MODE: 'mock' },
    asyncTransportPolicy: () => ({ novelAsyncDispatchEnabled: asyncEnabled,
      scopeSecret: 'full-review-async-scope-secret-32-bytes-min', apiAudience: 'novel-api', capabilityTtlMs: 60_000 }),
    requestContextResolver: async () => ({ tenantId, userId: 'user-review-async' }), now: () => now });
  try {
    const seedResponse = await app.inject({ method: 'POST', url: '/dev/novels/acceptance-seeds/full-review',
      payload: { title: '都市逆袭重生全书审稿异步验收' } });
    assert.equal(seedResponse.statusCode, 201, seedResponse.body);
    const novelId = seedResponse.json().data.novelId as string;
    const novelVersion = (await app.inject({ method: 'GET', url: `/novels/${novelId}` })).json().data.updatedAt;
    asyncEnabled = true;
    const capability = (await app.inject({ method: 'GET', url: '/novels/async-transport-capability' })).json().data;
    assert.equal(capability.enabled, true);
    const payload = {
      expectedNovelVersion: novelVersion,
      expectedSubmissionScopeId: capability.submissionScopeId,
      expectedCapabilityRevision: capability.capabilityRevision,
      expectedCapabilityExpiresAt: capability.expiresAt
    };
    const url = `/novels/${novelId}/full-review`;
    const key = 'full-review-async-0001';
    const before = repository.getGenerationTasks().length;
    const missingScope = await app.inject({ method: 'POST', url,
      headers: { 'idempotency-key': key }, payload: { expectedNovelVersion: novelVersion } });
    assert.equal(missingScope.statusCode, 409);
    assert.equal(repository.getGenerationTasks().length, before);
    const missingKey = await app.inject({ method: 'POST', url, payload });
    assert.equal(missingKey.statusCode, 400);
    assert.equal(repository.getGenerationTasks().length, before);

    const first = await app.inject({ method: 'POST', url, headers: { 'idempotency-key': key }, payload });
    assert.equal(first.statusCode, 202, first.body);
    assert.equal(first.json().data.action, 'novel_full_review');
    const taskId = first.json().data.taskId as string;
    const duplicate = await app.inject({ method: 'POST', url, headers: { 'idempotency-key': key }, payload });
    assert.equal(duplicate.statusCode, 202, duplicate.body);
    assert.equal(duplicate.json().data.taskId, taskId);
    assert.equal(repository.getGenerationTasks().length, before + 1);
    assert.equal(providerCalls, 0);

    const executor = createLeasedActionExecutor({ repository, providers: {
      directionProvider: new MockDirectionProvider(), structureProvider: new MockStructureProvider(),
      trialProvider: new MockTrialProvider(), bodyProvider: new MockBodyProvider(), fullReviewProvider
    } });
    const lease = await repository.leaseNextQueuedTask('worker-review-route', 'review-lease', now,
      new Date(now.getTime() + 60_000));
    assert.equal(lease?.id, taskId);
    const result = await executor.execute({ task: lease!, leaseOwnerId: 'worker-review-route',
      leaseToken: 'review-lease', signal: new AbortController().signal, mutate: (operation) => operation() });
    assert.equal(result.kind, 'provider_result');
    await executor.settle({ task: lease!, leaseOwnerId: 'worker-review-route', leaseToken: 'review-lease',
      authoritativeNow: now, outcome: { kind: 'fulfilled', value: result } });
    assert.equal(providerCalls, 1);
    const task = await repository.findTaskById(tenantId, taskId);
    assert.equal(task?.status, TaskStatus.Completed);
    assert.equal(task?.providerCallBudgetUsed, 1);
    const report = await repository.findLatestFullReview(tenantId, novelId);
    assert.equal(report?.reviewReport.sourceTaskId, taskId);
    assert.equal(report?.gate.allowCompletion, true);
    assert.equal(await repository.findLatestCompletionDecision(tenantId, novelId), null);
    assert.equal((await repository.findById(tenantId, novelId))?.creationStage, 'completion_confirm');
    assert.equal((await repository.findById(tenantId, novelId))?.stageStatus, 'waiting_user');

    const replay = await app.inject({ method: 'POST', url, headers: { 'idempotency-key': key }, payload });
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(replay.json().data.kind, 'existing');
    assert.equal(replay.json().data.taskId, taskId);
    assert.equal(providerCalls, 1);
    assert.equal(repository.getGenerationTasks().length, before + 1);
    const latest = await app.inject({ method: 'GET', url: `/novels/${novelId}/full-review/latest` });
    assert.equal(latest.statusCode, 200, latest.body);
    assert.equal(latest.json().data.fullReview.id, report?.reviewReport.id);

    asyncEnabled = false;
    const legacyReplay = await app.inject({ method: 'POST', url, headers: { 'idempotency-key': key },
      payload: { expectedNovelVersion: novelVersion } });
    assert.equal(legacyReplay.statusCode, 200, legacyReplay.body);
    assert.equal(legacyReplay.json().data.task.id, taskId);
    assert.equal(providerCalls, 1);
  } finally {
    await app.close();
  }
});
