import assert from 'node:assert/strict';
import { it } from 'node:test';
import Fastify from 'fastify';
import { ErrorCode, StaleLevel, TaskStatus, VersionStatus, type NovelAsyncTransportAction } from '@ai-shortvideo/shared';
import { toErrorResponse } from '../../src/shared/errors.js';
import { registerNovelRoutes } from '../../src/modules/novels/routes/novelRoutes.js';
import { createCapabilityPolicySnapshotResolver } from '../../src/modules/novels/services/asyncTransportCapability.js';
import { MockBodyProvider } from '../../src/modules/novels/providers/mockBodyProvider.js';
import { MockDirectionProvider } from '../../src/modules/novels/providers/mockDirectionProvider.js';
import { MockFullReviewProvider } from '../../src/modules/novels/providers/mockFullReviewProvider.js';
import { MockStructureProvider } from '../../src/modules/novels/providers/mockStructureProvider.js';
import { MockTrialProvider } from '../../src/modules/novels/providers/mockTrialProvider.js';
import { createLeasedActionExecutor } from '../../src/modules/novels/services/leasedActionExecutor.js';
import { createRouteAuthorityFixture } from './fixtures.js';

const actions = ['chapter_rewrite', 'chapter_impact_assess', 'chapter_adopt_impact_assess'] as const;
type Action = typeof actions[number];
const now = new Date('2030-01-01T00:00:10.000Z');

async function prepare(action: Action) {
  const fixture = await createRouteAuthorityFixture(action);
  const { repository, novelId, authorityObjectId: chapterId } = fixture;
  await fixture.app.close();
  const chapter = repository.getNovelChapters().find((item) => item.id === chapterId)!;
  const current = repository.getChapterContentVersions().find((item) => item.id === chapter.currentContentVersionId)!;
  const candidate = repository.getChapterContentVersions().find((item) => item.chapterId === chapterId && item.status === VersionStatus.Candidate);
  const bodyProvider = new MockBodyProvider();
  const calls: unknown[] = [];
  const rewrite = bodyProvider.rewriteChapter.bind(bodyProvider);
  const impact = bodyProvider.assessImpact.bind(bodyProvider);
  bodyProvider.rewriteChapter = async (input) => { calls.push(input); return rewrite(input); };
  bodyProvider.assessImpact = async (input) => { calls.push(input); return impact(input); };
  let enabled = true;
  let enabledActions: readonly NovelAsyncTransportAction[] = [action];
  let userId = 'user_test';
  let tenantId = 'tenant_test';
  repository.getAuthoritativeTaskTime = async () => now;
  repository.getLeasedExecutionCapability = async (taskType) =>
    ['chapter_body_rewrite', 'chapter_impact_assess'].includes(taskType) ? 'enabled' : 'unsupported';
  const app = Fastify({ logger: false });
  app.setErrorHandler((error, request, reply) => {
    const result = toErrorResponse(error, request.id);
    reply.status(result.statusCode).send(result.body);
  });
  const requestContextResolver = async () => ({ tenantId, userId });
  await registerNovelRoutes(app, { repository, bodyProvider, now: () => now, requestContextResolver,
    capabilityPolicySnapshotResolver: createCapabilityPolicySnapshotResolver({
      runtimeEnvironment: 'development', providerMode: 'mock', requestContextResolver, now: () => now,
      policy: () => ({ novelAsyncDispatchEnabled: enabled, enabledActions,
        scopeSecret: 'chapter-actions-async-scope-secret-32-bytes-min', apiAudience: 'novel-api' }) }) });
  const capability = (await app.inject({ method: 'GET', url: '/novels/async-transport-capability' })).json().data;
  assert.equal(capability.enabled, true);
  const expected = { expectedSubmissionScopeId: capability.submissionScopeId,
    expectedCapabilityRevision: capability.capabilityRevision, expectedCapabilityExpiresAt: capability.expiresAt };
  const url = `/novels/${novelId}/chapters/${chapterId}/` + (action === 'chapter_rewrite' ? 'rewrite'
    : action === 'chapter_impact_assess' ? 'impact-assessments' : `content-versions/${candidate!.id}/adopt`);
  const pageVersionSnapshot = { seenCandidateVersionId: candidate?.id, seenAt: '2029-12-31T23:59:00.000Z' };
  const payload = { currentContentVersionId: current.id, reason: '保持后续章节连贯',
    ...(action === 'chapter_rewrite' ? { instruction: '仅优化本章表达' } : {}),
    ...(action === 'chapter_adopt_impact_assess' ? { pageVersionSnapshot } : {}) };
  const post = (override: Record<string, unknown> = {}, key = 'chapter-action-submit-001', route = url) =>
    app.inject({ method: 'POST', url: route, headers: { 'idempotency-key': key }, payload: { ...payload, ...expected, ...override } });
  const handlers = createLeasedActionExecutor({ repository, providers: { bodyProvider,
    directionProvider: new MockDirectionProvider(), structureProvider: new MockStructureProvider(),
    trialProvider: new MockTrialProvider(), fullReviewProvider: new MockFullReviewProvider() } });
  const execute = async (taskId: string, beforeSettle?: () => void) => {
    const lease = await repository.leaseNextQueuedTask('chapter-worker', 'chapter-lease', now, new Date(now.getTime() + 60_000));
    assert.equal(lease?.id, taskId);
    const result = await handlers.execute({ task: lease!, leaseOwnerId: 'chapter-worker', leaseToken: 'chapter-lease',
      signal: new AbortController().signal, mutate: (operation) => operation() });
    beforeSettle?.();
    await handlers.settle({ task: lease!, leaseOwnerId: 'chapter-worker', leaseToken: 'chapter-lease',
      authoritativeNow: now, outcome: { kind: 'fulfilled', value: result } });
    return repository.findTaskById('tenant_test', taskId);
  };
  return { app, repository, chapter, current, candidate, calls, payload, expected, url, post, execute,
    policy: (value: boolean, allowed: readonly NovelAsyncTransportAction[] = [action]) => { enabled = value; enabledActions = allowed; },
    actor: (user: string, tenant = 'tenant_test') => { userId = user; tenantId = tenant; } };
}

for (const action of actions) {
  it(`${action}: queues an attested contract, replays, and finalizes with one model call`, async () => {
    const f = await prepare(action);
    try {
      const before = f.repository.getGenerationTasks().length;
      const accepted = await f.post();
      assert.equal(accepted.statusCode, 202, accepted.body);
      const dispatch = accepted.json().data;
      assert.equal(dispatch.action, action);
      assert.equal(dispatch.objectId, f.chapter.id);
      assert.equal(dispatch.kind, 'accepted');
      assert.equal(f.calls.length, 0);
      assert.equal(f.repository.getGenerationTasks().length, before + 1);
      const task = (await f.repository.findTaskById('tenant_test', dispatch.taskId))!;
      assert.equal(task.taskType, action === 'chapter_rewrite' ? 'chapter_body_rewrite' : 'chapter_impact_assess');
      assert.equal(task.objectId, f.chapter.id);
      const envelope = task.executionEnvelopeJson as any;
      assert.equal(envelope.schemaVersion, '1.1');
      assert.equal(envelope.auditContext.requestedByUserId, 'user_test');
      assert.equal(envelope.normalizedRequest.currentContentVersionId, f.current.id);
      assert.ok(envelope.sourceVersionRefs.providerInputSnapshotHash);
      assert.ok(envelope.sourceVersionRefs.authoritySnapshotHash);
      if (action === 'chapter_adopt_impact_assess') {
        assert.equal(envelope.normalizedRequest.candidateVersionId, f.candidate!.id);
        assert.deepEqual(envelope.normalizedRequest.pageVersionSnapshot, f.payload.pageVersionSnapshot);
      }
      const replay = await f.post();
      assert.equal(replay.statusCode, 202, replay.body);
      assert.equal(replay.json().data.taskId, task.id);
      assert.equal(replay.json().data.reused, true);
      const conflict = await f.post({ reason: 'changed intent' });
      assert.equal(conflict.statusCode, 409, conflict.body);
      assert.equal(conflict.json().error.code, ErrorCode.IdempotencyConflict);
      const concurrent = await f.post({}, 'chapter-action-submit-002');
      assert.equal(concurrent.statusCode, 409, concurrent.body);
      assert.equal(concurrent.json().error.code, ErrorCode.ConflictTaskExists);
      assert.equal(f.chapter.currentContentVersionId, f.current.id);
      const settled = await f.execute(task.id);
      assert.equal(settled?.status, action === 'chapter_rewrite' ? TaskStatus.WaitingConfirmation : TaskStatus.Completed);
      assert.equal(settled?.providerCallBudgetUsed, 1);
      assert.ok(settled?.resultReceiptHash);
      assert.equal(f.calls.length, 1);
      assert.equal(f.chapter.currentContentVersionId, action === 'chapter_adopt_impact_assess' ? f.candidate!.id : f.current.id);
      if (action === 'chapter_adopt_impact_assess') {
        const decision = f.repository.getAssetDecisionRecords().find((item) => item.sourceTaskId === task.id)!;
        assert.deepEqual(decision.pageVersionSnapshot, f.payload.pageVersionSnapshot);
        assert.equal(decision.decisionReason, f.payload.reason);
        assert.equal(f.current.status, VersionStatus.Historical);
      }
      const terminal = await f.post();
      assert.equal(terminal.statusCode, 200, terminal.body);
      assert.equal(terminal.json().data.kind, 'existing');
      assert.equal(terminal.json().data.taskId, task.id);
      assert.equal(f.calls.length, 1);
      assert.equal(f.repository.getGenerationTasks().length, before + 1);
    } finally { await f.app.close(); }
  });

  it(`${action}: rejects non-admitted actions, stale capability, missing keys and foreign scope without sync fallback`, async () => {
    const f = await prepare(action);
    try {
      const before = f.repository.getGenerationTasks().length;
      f.policy(true, ['direction_generate']);
      assert.equal((await f.post()).statusCode, 409);
      f.policy(true);
      assert.equal((await f.app.inject({ method: 'POST', url: f.url, payload: f.payload })).statusCode, 409);
      assert.equal((await f.app.inject({ method: 'POST', url: f.url, payload: { ...f.payload, ...f.expected } })).statusCode, 400);
      assert.equal((await f.post({ expectedCapabilityRevision: 'x'.repeat(43) })).statusCode, 409);
      f.actor('user_other');
      assert.equal((await f.post()).statusCode, 409);
      f.actor('user_test', 'tenant_other');
      assert.equal((await f.post()).statusCode, 409);
      f.actor('user_test');
      f.policy(false);
      assert.equal((await f.post()).statusCode, 409);
      assert.equal(f.repository.getGenerationTasks().length, before);
      assert.equal(f.calls.length, 0);
      f.policy(true);
      const capabilityGate = f.repository.getLeasedExecutionCapability;
      f.repository.getLeasedExecutionCapability = async () => 'disabled';
      const unsupported = await f.post();
      assert.equal(unsupported.json().error.code, ErrorCode.ConfigMissing);
      assert.equal(f.repository.getGenerationTasks().length, before);
      assert.equal(f.calls.length, 0);
      f.repository.getLeasedExecutionCapability = capabilityGate;
      f.policy(false);
      const legacy = await f.app.inject({ method: 'POST', url: f.url, payload: { ...f.payload, idempotencyKey: 'legacy-chapter-submit' } });
      assert.equal(legacy.statusCode, 200, legacy.body);
      assert.equal(f.calls.length, 1);
      assert.equal(legacy.json().data.task.taskType, action === 'chapter_rewrite' ? 'chapter_body_rewrite' : 'chapter_impact_assess');
      assert.equal(f.chapter.currentContentVersionId, action === 'chapter_adopt_impact_assess' ? f.candidate!.id : f.current.id);
    } finally { await f.app.close(); }
  });

  it(`${action}: fences source drift before provider dispatch and after paid result`, async () => {
    for (const afterProvider of [false, true]) {
      const f = await prepare(action);
      try {
        const accepted = await f.post();
        assert.equal(accepted.statusCode, 202, accepted.body);
        const mutate = () => { f.current.summary = 'source changed after queue'; };
        if (!afterProvider) mutate();
        const task = await f.execute(accepted.json().data.taskId, afterProvider ? mutate : undefined);
        assert.equal(task?.status, TaskStatus.Failed);
        assert.equal(task?.errorCode, 'SOURCE_STALE');
        assert.equal(f.calls.length, afterProvider ? 1 : 0);
        assert.equal(f.chapter.currentContentVersionId, f.current.id);
        assert.equal(f.repository.getChapterContentVersions().filter((item) => item.sourceTaskId === task!.id).length, 0);
        assert.equal(f.repository.getAssetDecisionRecords().filter((item) => item.sourceTaskId === task!.id).length, 0);
      } finally { await f.app.close(); }
    }
  });

  it(`${action}: interrupted paid execution is not automatically billed again`, async () => {
    const f = await prepare(action);
    try {
      const accepted = await f.post();
      assert.equal(accepted.statusCode, 202, accepted.body);
      const taskId = accepted.json().data.taskId;
      const leaseEnd = new Date(now.getTime() + 60_000);
      const lease = await f.repository.leaseNextQueuedTask('lost-worker', 'lost-lease', now, leaseEnd);
      assert.equal(lease?.id, taskId);
      const base = { tenantId: 'tenant_test', taskId, leaseOwnerId: 'lost-worker', leaseToken: 'lost-lease' };
      await f.repository.checkpointLeasedTask({ ...base, authoritativeNow: now,
        checkpoint: { expectedPhase: 'leased', nextPhase: 'prepared' } });
      await f.repository.dispatchLeasedTask({ ...base, authoritativeNow: now, providerAttemptId: 'chapter-attempt-001' });
      const recovered = await f.repository.recoverExpiredTask({ ...base, leaseExpiresAt: leaseEnd }, leaseEnd);
      assert.equal(recovered.task?.errorCode, 'PROVIDER_OUTCOME_UNKNOWN');
      assert.equal(recovered.task?.providerCallBudgetUsed, 1);
      const replay = await f.post();
      assert.equal(replay.statusCode, 200, replay.body);
      assert.equal(replay.json().data.taskId, taskId);
      assert.equal(await f.repository.leaseNextQueuedTask('next-worker', 'next-lease', leaseEnd, new Date(leaseEnd.getTime() + 60_000)), null);
      assert.equal(f.chapter.currentContentVersionId, f.current.id);
    } finally { await f.app.close(); }
  });
}

it('adoption validates the full contract before a task or model call exists', async () => {
  const f = await prepare('chapter_adopt_impact_assess');
  try {
    const before = f.repository.getGenerationTasks().length;
    for (const patch of [
      { status: VersionStatus.Historical }, { staleLevel: StaleLevel.HardStale },
      { chapterId: 'other-chapter' }, { sourceVersionRefs: { currentContentVersionId: 'old-content' } },
      { metadata: { reviewRequired: true } }, { sourceType: 'ai_overlength_revision' },
      { content: 'short', wordCount: 5 }, { wordCount: 1 }
    ]) {
      const original = structuredClone(f.candidate!);
      Object.assign(f.candidate!, patch);
      const response = await f.post();
      assert.ok([404, 409].includes(response.statusCode), response.body);
      Object.assign(f.candidate!, original);
    }
    for (const patch of [
      { currentContentVersionId: null }, { currentContentVersionId: 'old-content' },
      { pageVersionSnapshot: { seenCandidateVersionId: 'other-candidate', seenAt: '2029-01-01' } },
      { pageVersionSnapshot: { currentContentVersionId: 'old-content' } },
      { pageVersionSnapshot: { candidateVersionId: 'other-candidate' } },
      { pageVersionSnapshot: { note: 'x'.repeat(4097) } },
      { pageVersionSnapshot: { apiKey: 'must-not-persist' } }
    ]) {
      const response = await f.post(patch);
      assert.ok([400, 409].includes(response.statusCode), response.body);
    }
    assert.equal(f.repository.getGenerationTasks().length, before);
    assert.equal(f.calls.length, 0);
    const accepted = await f.post();
    assert.equal(accepted.statusCode, 202, accepted.body);
    for (const override of [
      { pageVersionSnapshot: { ...f.payload.pageVersionSnapshot, seenAt: '2030-01-01T00:00:00.000Z' } },
      { pageVersionSnapshot: null }, { currentContentVersionId: null }, { reason: null }
    ]) {
      const changed = await f.post(override);
      assert.equal(changed.statusCode, 409, changed.body);
      assert.equal(changed.json().error.code, ErrorCode.IdempotencyConflict);
    }
    const changedUrl = await f.post({}, 'chapter-action-submit-001', f.url.replace(f.candidate!.id, 'other-candidate'));
    assert.equal(changedUrl.statusCode, 409, changedUrl.body);
    assert.equal(changedUrl.json().error.code, ErrorCode.IdempotencyConflict);
  } finally { await f.app.close(); }
});

it('first adoption without formal content is explicitly blocked without fake source refs or a paid call', async () => {
  const f = await prepare('chapter_adopt_impact_assess');
  try {
    f.chapter.currentContentVersionId = null;
    const before = f.repository.getGenerationTasks().length;
    const response = await f.post({ currentContentVersionId: null });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json().error.code, ErrorCode.GateBlocked);
    assert.equal(f.repository.getGenerationTasks().length, before);
    assert.equal(f.calls.length, 0);
  } finally { await f.app.close(); }
});

it('rechecks the adoption contract when authority is loaded after the route validation', async () => {
  const f = await prepare('chapter_adopt_impact_assess');
  try {
    const originalLoad = f.repository.loadGenerationAuthority.bind(f.repository);
    f.repository.loadGenerationAuthority = async (input) => {
      f.candidate!.sourceVersionRefs = { currentContentVersionId: 'changed-before-first-authority-read' };
      return originalLoad(input);
    };
    const before = f.repository.getGenerationTasks().length;
    const response = await f.post();
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(f.repository.getGenerationTasks().length, before);
    assert.equal(f.calls.length, 0);
  } finally { await f.app.close(); }
});

for (const severity of ['minor', 'medium', 'severe']) {
  it(`adoption preserves ${severity} impact handling and does not invent a user risk reason`, async () => {
    const f = await prepare('chapter_adopt_impact_assess');
    try {
      f.candidate!.rewriteReason = severity === 'severe' ? '严重影响' : severity === 'medium' ? '影响后续' : '仅优化表达';
      const accepted = await f.post({ reason: null });
      assert.equal(accepted.statusCode, 202, accepted.body);
      const task = await f.execute(accepted.json().data.taskId);
      assert.equal(f.calls.length, 1);
      assert.equal(task?.status, severity === 'minor' ? TaskStatus.Completed : TaskStatus.Failed);
      assert.equal(f.chapter.currentContentVersionId, severity === 'minor' ? f.candidate!.id : f.current.id);
      if (severity !== 'minor') {
        assert.equal(f.repository.getAssetDecisionRecords().filter((item) => item.sourceTaskId === task!.id).length, 0);
      }
    } finally { await f.app.close(); }
  });
}
