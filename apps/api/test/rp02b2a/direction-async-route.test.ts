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

it('accepts an attested direction task as 202 and recovers the same task after submission replay', async () => {
  const repository = createInMemoryNovelRepository();
  repository.getLeasedExecutionCapability = async (taskType) => taskType === 'novel_direction_generate' ? 'enabled' : 'unsupported';
  let now = new Date('2030-01-01T00:00:10.000Z');
  repository.getAuthoritativeTaskTime = async () => now;
  let userId = 'user-direction-a';
  let resolverCalls = 0;
  const app = await buildApp({ logger: false, novelRepository: repository,
    aiProviderEnv: { AI_PROVIDER_MODE: 'mock' },
    asyncTransportPolicy: { novelAsyncDispatchEnabled: true,
      scopeSecret: 'direction-async-scope-secret-32-bytes-min', apiAudience: 'novel-api', capabilityTtlMs: 60_000 },
    requestContextResolver: async () => {
      resolverCalls += 1;
      return { tenantId: 'tenant-direction-async', userId };
    },
    now: () => now });
  try {
    const draft = await app.inject({ method: 'POST', url: '/novels/drafts', payload: { title: '方向异步提交' } });
    assert.equal(draft.statusCode, 201);
    const novelId = draft.json().data.id as string;
    const capabilityResponse = await app.inject({ method: 'GET', url: '/novels/async-transport-capability' });
    assert.equal(capabilityResponse.statusCode, 200);
    const capability = capabilityResponse.json().data;
    assert.equal(capability.enabled, true);
    const blockedOutline = await app.inject({ method: 'POST', url: `/novels/${novelId}/outlines/generate`, payload: {} });
    assert.equal(blockedOutline.statusCode, 409);
    assert.equal(blockedOutline.json().error.code, 'GATE_BLOCKED');
    assert.equal(repository.getGenerationTasks().length, 0);
    const url = `/novels/${novelId}/directions/generate`;
    const key = 'async-direction-submit-0001';
    const before = repository.getGenerationTasks().length;
    assert.equal((await app.inject({ method: 'POST', url, headers: { 'idempotency-key': key }, payload: {} })).statusCode, 409);
    assert.equal(repository.getGenerationTasks().length, before);
    const payload = { expectedSubmissionScopeId: capability.submissionScopeId,
      expectedCapabilityRevision: capability.capabilityRevision,
      expectedCapabilityExpiresAt: capability.expiresAt };
    const callsBefore = resolverCalls;
    const accepted = await app.inject({ method: 'POST', url, headers: { 'idempotency-key': key }, payload });
    assert.equal(accepted.statusCode, 202, accepted.body);
    assert.equal(resolverCalls, callsBefore + 1, 'capability and claim must use one cached actor per request');
    assert.equal(accepted.json().data.kind, 'accepted');
    assert.equal(accepted.json().data.reused, false);
    const taskId = accepted.json().data.taskId as string;
    assert.equal(accepted.json().data.pollUrl, `/tasks/${taskId}`);
    assert.equal(repository.getGenerationTasks().length, before + 1);
    assert.equal(repository.getCreativeVersions().filter((version) => version.sourceTaskId === taskId).length, 0);
    const replay = await app.inject({ method: 'POST', url, headers: { 'idempotency-key': key }, payload });
    assert.equal(replay.statusCode, 202, replay.body);
    assert.equal(replay.json().data.taskId, taskId);
    assert.equal(replay.json().data.reused, true);
    assert.equal(repository.getGenerationTasks().length, before + 1);

    const task = await repository.leaseNextQueuedTask('worker-route', 'lease-route', now,
      new Date(now.getTime() + 60_000));
    assert.equal(task?.id, taskId);
    const handlers = createLeasedActionExecutor({ repository, providers: {
      directionProvider: new MockDirectionProvider(), structureProvider: new MockStructureProvider(),
      trialProvider: new MockTrialProvider(), bodyProvider: new MockBodyProvider(),
      fullReviewProvider: new MockFullReviewProvider()
    } });
    const result = await handlers.execute({ task: task!, leaseOwnerId: 'worker-route', leaseToken: 'lease-route',
      signal: new AbortController().signal, mutate: (operation) => operation() });
    assert.equal(result.kind, 'provider_result');
    await handlers.settle({ task: task!, leaseOwnerId: 'worker-route', leaseToken: 'lease-route',
      authoritativeNow: now, outcome: { kind: 'fulfilled', value: result } });
    assert.equal((await repository.findTaskById('tenant-direction-async', taskId))?.status, TaskStatus.WaitingConfirmation);
    assert.equal((await app.inject({ method: 'GET', url: `/tasks/${taskId}` })).statusCode, 200);
    const terminalReplay = await app.inject({ method: 'POST', url, headers: { 'idempotency-key': key }, payload });
    assert.equal(terminalReplay.statusCode, 200, terminalReplay.body);
    assert.equal(terminalReplay.json().data.kind, 'existing');
    assert.equal(terminalReplay.json().data.taskId, taskId);

    userId = 'user-direction-b';
    assert.equal((await app.inject({ method: 'GET', url: `/tasks/${taskId}` })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url, headers: { 'idempotency-key': key }, payload })).statusCode, 409);
    assert.equal(repository.getGenerationTasks().length, before + 1);
    now = new Date(capability.expiresAt);
    userId = 'user-direction-a';
    assert.equal((await app.inject({ method: 'POST', url, headers: { 'idempotency-key': key }, payload })).statusCode, 409);
  } finally {
    await app.close();
  }
});

it('queues an attested setting task and keeps its result as a candidate', async () => {
  const repository = createInMemoryNovelRepository();
  repository.getLeasedExecutionCapability = async (taskType) =>
    ['novel_setting_generate', 'novel_outline_generate'].includes(taskType) ? 'enabled' : 'unsupported';
  let policyEnabled = false;
  const now = new Date('2030-01-01T00:00:10.000Z');
  repository.getAuthoritativeTaskTime = async () => now;
  const app = await buildApp({ logger: false, novelRepository: repository,
    aiProviderEnv: { AI_PROVIDER_MODE: 'mock' },
    asyncTransportPolicy: () => ({ novelAsyncDispatchEnabled: policyEnabled,
      scopeSecret: 'setting-async-scope-secret-32-bytes-min', apiAudience: 'novel-api', capabilityTtlMs: 60_000 }),
    requestContextResolver: async () => ({ tenantId: 'tenant-setting-async', userId: 'user-setting-async' }),
    now: () => now });
  try {
    const draft = await app.inject({ method: 'POST', url: '/novels/drafts', payload: { title: '设定异步提交' } });
    assert.equal(draft.statusCode, 201);
    const novelId = draft.json().data.id as string;
    const directions = await app.inject({ method: 'POST', url: `/novels/${novelId}/directions/generate`, payload: {} });
    assert.equal(directions.statusCode, 200, directions.body);
    const candidateId = directions.json().data.candidates.find((candidate: { id: string; score: number }) => candidate.score >= 75).id as string;
    const adopted = await app.inject({ method: 'POST', url: `/novels/${novelId}/directions/${candidateId}/adopt`,
      payload: { currentVersionId: null, idempotencyKey: 'adopt-setting-async-0001', reason: '确认创作方向' } });
    assert.equal(adopted.statusCode, 200, adopted.body);
    policyEnabled = true;
    const capability = (await app.inject({ method: 'GET', url: '/novels/async-transport-capability' })).json().data;
    assert.equal(capability.enabled, true);
    const payload = { expectedSubmissionScopeId: capability.submissionScopeId,
      expectedCapabilityRevision: capability.capabilityRevision,
      expectedCapabilityExpiresAt: capability.expiresAt };
    const accepted = await app.inject({ method: 'POST', url: `/novels/${novelId}/settings/generate`,
      headers: { 'idempotency-key': 'setting-async-submit-0001' }, payload });
    assert.equal(accepted.statusCode, 202, accepted.body);
    const taskId = accepted.json().data.taskId as string;
    assert.equal(repository.getCreativeVersions().filter((version) => version.sourceTaskId === taskId).length, 0);
    const task = await repository.leaseNextQueuedTask('worker-setting-route', 'lease-setting-route', now,
      new Date(now.getTime() + 60_000));
    assert.equal(task?.id, taskId);
    const handlers = createLeasedActionExecutor({ repository, providers: {
      directionProvider: new MockDirectionProvider(), structureProvider: new MockStructureProvider(),
      trialProvider: new MockTrialProvider(), bodyProvider: new MockBodyProvider(),
      fullReviewProvider: new MockFullReviewProvider()
    } });
    const result = await handlers.execute({ task: task!, leaseOwnerId: 'worker-setting-route', leaseToken: 'lease-setting-route',
      signal: new AbortController().signal, mutate: (operation) => operation() });
    assert.equal(result.kind, 'provider_result');
    await handlers.settle({ task: task!, leaseOwnerId: 'worker-setting-route', leaseToken: 'lease-setting-route',
      authoritativeNow: now, outcome: { kind: 'fulfilled', value: result } });
    assert.equal((await repository.findTaskById('tenant-setting-async', taskId))?.status, TaskStatus.WaitingConfirmation);
    const versions = repository.getCreativeVersions().filter((version) => version.sourceTaskId === taskId);
    assert.equal(versions.length, 1);
    assert.equal(versions[0].objectType, 'setting');
    assert.equal(versions[0].status, 'candidate');
    assert.equal((await repository.findById('tenant-setting-async', novelId))?.currentSettingVersionId, null);
    const adoptSetting = await app.inject({ method: 'POST',
      url: `/novels/${novelId}/settings/${versions[0].id}/adopt`, payload: { reason: '确认小说设定' } });
    assert.equal(adoptSetting.statusCode, 200, adoptSetting.body);
    const outline = await app.inject({ method: 'POST', url: `/novels/${novelId}/outlines/generate`,
      headers: { 'idempotency-key': 'outline-async-submit-0001' }, payload });
    assert.equal(outline.statusCode, 202, outline.body);
    const outlineTaskId = outline.json().data.taskId as string;
    const outlineLease = await repository.leaseNextQueuedTask('worker-outline-route', 'lease-outline-route', now,
      new Date(now.getTime() + 60_000));
    assert.equal(outlineLease?.id, outlineTaskId);
    const outlineResult = await handlers.execute({ task: outlineLease!, leaseOwnerId: 'worker-outline-route',
      leaseToken: 'lease-outline-route', signal: new AbortController().signal, mutate: (operation) => operation() });
    await handlers.settle({ task: outlineLease!, leaseOwnerId: 'worker-outline-route',
      leaseToken: 'lease-outline-route', authoritativeNow: now, outcome: { kind: 'fulfilled', value: outlineResult } });
    assert.equal((await repository.findTaskById('tenant-setting-async', outlineTaskId))?.status,
      TaskStatus.WaitingConfirmation);
    assert.equal(repository.getCreativeVersions().filter((version) => version.sourceTaskId === outlineTaskId).length, 1);
    assert.equal((await repository.findById('tenant-setting-async', novelId))?.currentOutlineVersionId, null);
  } finally {
    await app.close();
  }
});
