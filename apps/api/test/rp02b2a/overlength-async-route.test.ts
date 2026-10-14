import assert from 'node:assert/strict';
import { it } from 'node:test';
import { TaskStatus, VersionStatus } from '@ai-shortvideo/shared';
import { buildApp } from '../../src/app.js';
import { evaluateChapterLength } from '../../src/modules/novels/domain/chapterLengthPolicy.js';
import { MockBodyProvider } from '../../src/modules/novels/providers/mockBodyProvider.js';
import { MockDirectionProvider } from '../../src/modules/novels/providers/mockDirectionProvider.js';
import { MockFullReviewProvider } from '../../src/modules/novels/providers/mockFullReviewProvider.js';
import { MockStructureProvider } from '../../src/modules/novels/providers/mockStructureProvider.js';
import { MockTrialProvider } from '../../src/modules/novels/providers/mockTrialProvider.js';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';
import { createLeasedActionExecutor } from '../../src/modules/novels/services/leasedActionExecutor.js';
import { NovelService } from '../../src/modules/novels/services/novelService.js';
import { createRouteAuthorityFixture } from './fixtures.js';

async function prepareOverlengthSource() {
  const repository = createInMemoryNovelRepository();
  const fixture = await createRouteAuthorityFixture('chapter_impact_assess', repository);
  await fixture.app.close();
  const chapter = repository.getNovelChapters().find((item) => item.id === fixture.authorityObjectId);
  const novel = await repository.findById('tenant_test', fixture.novelId);
  assert.ok(chapter && novel && chapter.currentContentVersionId && chapter.wordTarget);
  const original = repository.getChapterContentVersions().find((item) => item.id === chapter.currentContentVersionId);
  assert.ok(original);
  const removable = '这是一句可以删除的冗余描写。';
  const upperBound = Math.floor(chapter.wordTarget * 1.15);
  original.content = '稳'.repeat(upperBound - 20) + removable.repeat(4);
  const lengthGate = evaluateChapterLength(original.content, chapter.wordTarget);
  assert.equal(lengthGate.status, 'too_long');
  original.wordCount = lengthGate.actual;
  original.status = VersionStatus.Candidate;
  original.sourceType = 'ai_overlength_original';
  original.sourceVersionRefs = { currentChapterPlanVersionId: novel.currentChapterPlanVersionId };
  original.metadata = { lengthGate };
  chapter.currentContentVersionId = null;
  return { repository, novel, chapter, original, lengthGate };
}

it('queues one attested overlength revision and leaves its result as a review-only candidate', async () => {
  const { repository, novel, chapter, original, lengthGate } = await prepareOverlengthSource();
  const now = new Date('2030-01-01T00:00:10.000Z');
  repository.getAuthoritativeTaskTime = async () => now;
  repository.getLeasedExecutionCapability = async (taskType) =>
    taskType === 'chapter_overlength_revise' ? 'enabled' : 'unsupported';
  let enabledActions: Array<'direction_generate' | 'chapter_overlength_revise'> = ['direction_generate'];
  const app = await buildApp({ logger: false, novelRepository: repository,
    aiProviderEnv: { AI_PROVIDER_MODE: 'mock' },
    asyncTransportPolicy: () => ({ novelAsyncDispatchEnabled: true, enabledActions,
      scopeSecret: 'chapter-revision-async-scope-secret-32-bytes-min', apiAudience: 'novel-api' }),
    requestContextResolver: async () => ({ tenantId: 'tenant_test', userId: 'user_test' }),
    now: () => now });
  try {
    const url = `/novels/${novel.id}/chapters/${chapter.id}/overlength-revisions`;
    const blocked = await app.inject({ method: 'POST', url,
      headers: { 'idempotency-key': 'revision-submit-key-001' },
      payload: { sourceCandidateVersionId: original.id } });
    assert.equal(blocked.statusCode, 409);
    enabledActions = ['chapter_overlength_revise'];
    const capability = (await app.inject({ method: 'GET', url: '/novels/async-transport-capability' })).json().data;
    assert.deepEqual(capability.enabledActions, ['chapter_overlength_revise']);
    const payload = { sourceCandidateVersionId: original.id,
      expectedSubmissionScopeId: capability.submissionScopeId,
      expectedCapabilityRevision: capability.capabilityRevision,
      expectedCapabilityExpiresAt: capability.expiresAt };
    const before = repository.getGenerationTasks().length;
    assert.equal((await app.inject({ method: 'POST', url,
      headers: { 'idempotency-key': 'revision-submit-key-001' },
      payload: { sourceCandidateVersionId: original.id } })).statusCode, 409);
    assert.equal(repository.getGenerationTasks().length, before);
    const accepted = await app.inject({ method: 'POST', url,
      headers: { 'idempotency-key': 'revision-submit-key-001' }, payload });
    assert.equal(accepted.statusCode, 202, accepted.body);
    assert.equal(accepted.json().data.action, 'chapter_overlength_revise');
    assert.equal(accepted.json().data.objectId, chapter.id);
    const taskId = accepted.json().data.taskId as string;
    assert.equal(repository.getGenerationTasks().length, before + 1);
    assert.equal(repository.getChapterContentVersions().filter((item) => item.sourceTaskId === taskId).length, 0);
    const replay = await app.inject({ method: 'POST', url,
      headers: { 'idempotency-key': 'revision-submit-key-002' }, payload });
    assert.equal(replay.statusCode, 202, replay.body);
    assert.equal(replay.json().data.taskId, taskId);
    assert.equal(replay.json().data.reused, true);

    const lease = await repository.leaseNextQueuedTask('worker-revision-route', 'lease-revision-route', now,
      new Date(now.getTime() + 60_000));
    assert.equal(lease?.id, taskId);
    const handlers = createLeasedActionExecutor({ repository, providers: {
      directionProvider: new MockDirectionProvider(), structureProvider: new MockStructureProvider(),
      trialProvider: new MockTrialProvider(), bodyProvider: new MockBodyProvider(),
      fullReviewProvider: new MockFullReviewProvider()
    } });
    const result = await handlers.execute({ task: lease!, leaseOwnerId: 'worker-revision-route',
      leaseToken: 'lease-revision-route', signal: new AbortController().signal,
      mutate: (operation) => operation() });
    assert.equal(result.kind, 'provider_result');
    await handlers.settle({ task: lease!, leaseOwnerId: 'worker-revision-route', leaseToken: 'lease-revision-route',
      authoritativeNow: now, outcome: { kind: 'fulfilled', value: result } });
    const task = await repository.findTaskById('tenant_test', taskId);
    assert.equal(task?.status, TaskStatus.WaitingConfirmation);
    assert.equal(task?.providerCallBudgetUsed, 1);
    const revisions = repository.getChapterContentVersions().filter((item) => item.sourceTaskId === taskId);
    assert.equal(revisions.length, 1);
    assert.equal(revisions[0]?.status, VersionStatus.Candidate);
    assert.equal(revisions[0]?.sourceType, 'ai_overlength_revision');
    assert.equal(chapter.currentContentVersionId, null);
    assert.equal(original.content.length, lengthGate.actual);
    const terminalReplay = await app.inject({ method: 'POST', url,
      headers: { 'idempotency-key': 'revision-submit-key-001' }, payload });
    assert.equal(terminalReplay.statusCode, 200, terminalReplay.body);
    assert.equal(terminalReplay.json().data.taskId, taskId);
    assert.equal(repository.getChapterContentVersions().filter((item) => item.sourceTaskId === taskId).length, 1);
  } finally {
    await app.close();
  }
});

it('closes an interrupted paid attempt without replaying the model or creating a candidate', async () => {
  const { repository, novel, chapter, original } = await prepareOverlengthSource();
  const now = new Date('2030-01-01T00:00:10.000Z');
  repository.getAuthoritativeTaskTime = async () => now;
  repository.getLeasedExecutionCapability = async (taskType) =>
    taskType === 'chapter_overlength_revise' ? 'enabled' : 'unsupported';
  const service = new NovelService({ repository, now: () => now });
  const context = { tenantId: 'tenant_test', userId: 'user_test', requestId: 'revision-interruption' };
  const request = { sourceCandidateVersionId: original.id, idempotencyKey: 'revision-first-key' };
  const queued = await service.queueOverlengthRevision(novel.id, chapter.id, request, context, now);
  assert.equal(queued.task.status, TaskStatus.Queued);
  const leaseEnd = new Date(now.getTime() + 60_000);
  const lease = await repository.leaseNextQueuedTask('worker-lost', 'lease-lost', now, leaseEnd);
  assert.equal(lease?.id, queued.task.id);
  const base = { tenantId: 'tenant_test', taskId: queued.task.id, leaseOwnerId: 'worker-lost', leaseToken: 'lease-lost' };
  assert.equal((await repository.checkpointLeasedTask({ ...base, authoritativeNow: now,
    checkpoint: { expectedPhase: 'leased', nextPhase: 'prepared' } })).outcome, 'applied');
  assert.equal((await repository.checkpointLeasedTask({ ...base, authoritativeNow: now,
    checkpoint: { expectedPhase: 'prepared', nextPhase: 'provider_call_started',
      providerAttemptId: 'revision-attempt-1' } })).outcome, 'applied');
  assert.equal(queued.task.providerCallBudgetUsed, 1);
  const recovered = await repository.recoverExpiredTask({ ...base, leaseExpiresAt: leaseEnd }, leaseEnd);
  assert.equal(recovered.task?.status, TaskStatus.Failed);
  assert.equal(recovered.task?.errorCode, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(recovered.task?.providerCallBudgetUsed, 1);
  assert.equal(repository.getChapterContentVersions().filter((item) => item.sourceTaskId === queued.task.id).length, 0);
  assert.equal(chapter.currentContentVersionId, null);
  assert.equal(await repository.leaseNextQueuedTask('worker-retry', 'lease-retry',
    new Date(leaseEnd.getTime() + 1), new Date(leaseEnd.getTime() + 60_000)), null);
  const replay = await service.queueOverlengthRevision(novel.id, chapter.id,
    { ...request, idempotencyKey: 'revision-second-key' }, context,
    new Date(leaseEnd.getTime() + 2));
  assert.equal(replay.reused, true);
  assert.equal(replay.task.id, queued.task.id);
  assert.equal(replay.task.providerCallBudgetUsed, 1);
});
