import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TaskStatus } from '@ai-shortvideo/shared';
import { buildApp } from '../../src/app.js';
import {
  RP01C_BASE_TIME_ISO,
  RP01C_SCENARIOS,
  createDeferred,
  createRp01cFixture,
  createRp01cRepository,
  createRp01cInjectionPlan,
  createScriptedLlmClient,
  applyRp01cInjectionOverlay,
  executeRp01cInjectionProbe,
  resolveRp01cIdempotency,
  type Rp01cScenarioId
} from './fixtureFactory.js';

const VALID_SCENARIOS = [
  'processing',
  'failed_timeout',
  'failed_malformed_json',
  'stale_source',
  'active_conflict',
  'restart_boundary',
  'chapter_plan_chunk_failure',
  'save_failure_after_provider'
] as const satisfies readonly Rp01cScenarioId[];

const COUNTEREXAMPLES = ['late_result_after_cancel', 'duplicate_current'] as const satisfies readonly Rp01cScenarioId[];
const FORBIDDEN_TEXT = /apiKey|authorization|database_url|DATABASE_URL|secret|rawPrompt|rawResponse|providerResponse|fullChapterText|chapterBody/i;

describe('RP-01C fixture factory contract', () => {
  it('keeps the scenario catalogue complete and classified', () => {
    assert.deepEqual(RP01C_SCENARIOS.map((scenario) => scenario.id), [...VALID_SCENARIOS, ...COUNTEREXAMPLES]);
    assert.deepEqual(RP01C_SCENARIOS.filter((scenario) => scenario.kind === 'valid_state').map((scenario) => scenario.id), [...VALID_SCENARIOS]);
    assert.deepEqual(RP01C_SCENARIOS.filter((scenario) => scenario.kind === 'counterexample').map((scenario) => scenario.id), [...COUNTEREXAMPLES]);
  });

  it('builds deterministic, serializable snapshots with frozen ordinary structure and safe references', () => {
    for (const scenario of RP01C_SCENARIOS) {
      const first = createRp01cFixture(scenario.id);
      const second = createRp01cFixture(scenario.id);

      assert.deepEqual(first, second);
      assert.notEqual(first.scenario, second.scenario);
      assert.notEqual(first.tasks, second.tasks);
      assert.notEqual(first.events, second.events);
      assert.notEqual(first.versions, second.versions);
      assert.notEqual(first.tasks[0].metadata, second.tasks[0].metadata);
      assert.notEqual(first.tasks[0].sourceVersionRefs, second.tasks[0].sourceVersionRefs);
      assert.notEqual(first.tasks[0].sourceVersionRefs, first.versions[0].sourceVersionRefs);
      assert.notEqual(first.tasks[0].sourceVersionRefs, first.replayInput.sourceVersionRefs);
      assert.equal(Object.isFrozen(first), true);
      assert.equal(Object.isFrozen(first.tasks[0]), true);
      assert.equal(first.generatedAt.toISOString(), RP01C_BASE_TIME_ISO);
      assert.doesNotThrow(() => JSON.stringify(first));
      assert.equal(FORBIDDEN_TEXT.test(JSON.stringify(first)), false);
      assert.equal(first.novels.every((novel) => novel.tenantId === first.tasks[0].tenantId), true);
      assert.equal(first.events.every((event) => event.tenantId === first.tasks[0].tenantId && event.taskId === first.tasks[0].id), true);
      assert.equal(first.versions.every((version) => version.tenantId === first.tasks[0].tenantId && version.novelId === first.novels[0].id), true);
      assert.equal(first.tasks.every((task) => task.novelId === first.novels[0].id && task.objectId?.startsWith(first.novels[0].id)), true);
    }
  });

  it('keeps repeated fixture construction and repository returns isolated from Date and nested mutations', async () => {
    const first = createRp01cFixture('processing');
    const second = createRp01cFixture('processing');
    first.generatedAt.setTime(Date.parse('2030-01-01T00:00:00.000Z'));
    first.tasks[0].updatedAt.setTime(Date.parse('2030-01-01T00:00:00.001Z'));
    assert.equal(second.generatedAt.toISOString(), RP01C_BASE_TIME_ISO);
    assert.equal(second.tasks[0].updatedAt.toISOString(), '2026-07-13T00:00:00.009Z');

    const repository = createRp01cRepository(second);
    const mutableTask = await repository.findTaskById(DEFAULT_TENANT_FOR_TEST, second.tasks[0].id);
    assert.ok(mutableTask);
    mutableTask.updatedAt.setTime(Date.parse('2030-01-01T00:00:00.002Z'));
    (mutableTask.metadata as Record<string, unknown>).safeSummary = 'mutated in caller';
    const freshTask = await repository.findTaskById(DEFAULT_TENANT_FOR_TEST, second.tasks[0].id);
    assert.equal(freshTask?.updatedAt.toISOString(), '2026-07-13T00:00:00.009Z');
    assert.equal((freshTask?.metadata as Record<string, unknown>).safeSummary, 'rp01c safe deterministic task metadata');
  });

  it('detects counterexamples without normalizing invalid states', () => {
    const duplicateCurrent = createRp01cFixture('duplicate_current');
    assert.deepEqual(duplicateCurrent.detectors.duplicateCurrentVersionIds, ['rp01c_dir_v1', 'rp01c_dir_v2']);
    assert.equal(duplicateCurrent.versions.filter((version) => version.status === 'current').length, 2);

    const lateResult = createRp01cFixture('late_result_after_cancel');
    assert.equal(lateResult.detectors.lateResultRisk, true);
    assert.equal(lateResult.tasks[0].status, TaskStatus.Cancelled);
    assert.notEqual((lateResult.tasks[0].sourceVersionRefs as Record<string, unknown>).currentDirectionVersionId, lateResult.novels[0].currentDirectionVersionId);
  });

  it('resolves idempotency reuse, conflict, and tenant isolation deterministically', () => {
    const snapshot = createRp01cFixture('processing');
    const base = snapshot.idempotencyClaims[0];
    assert.deepEqual(
      resolveRp01cIdempotency(snapshot, {
        tenantId: base.tenantId,
        taskType: base.taskType,
        idempotencyToken: base.idempotencyToken,
        requestHash: base.requestHash
      }),
      { decision: 'reuse_existing', taskId: base.taskId }
    );
    assert.deepEqual(
      resolveRp01cIdempotency(snapshot, {
        tenantId: base.tenantId,
        taskType: base.taskType,
        idempotencyToken: base.idempotencyToken,
        requestHash: 'rp01c-different-hash'
      }),
      { decision: 'idempotency_conflict', taskId: base.taskId }
    );
    assert.deepEqual(
      resolveRp01cIdempotency(snapshot, {
        tenantId: 'tenant_third',
        taskType: base.taskType,
        idempotencyToken: base.idempotencyToken,
        requestHash: base.requestHash
      }),
      { decision: 'create_new' }
    );
  });

  it('provides test-only scripted LLM and deferred controls with call counts', async () => {
    const deferred = createDeferred<{ content: string; model: string }>();
    const client = createScriptedLlmClient([() => deferred.promise]);
    const responsePromise = client.chat({ taskName: 'rp01c', model: 'mock', messages: [] });
    assert.equal(client.callCount(), 1);
    deferred.release({ content: '{"ok":true}', model: 'mock' });
    assert.deepEqual(await responsePromise, { content: '{"ok":true}', model: 'mock' });
  });

  it('executes scenario-specific failure injection probes without pretending to fix production paths', async () => {
    const expected = [
      ['failed_timeout', 'llm', 1, 'timeout', false, { chatCalls: 1, rejected: true, parseFailed: false, saveCalls: 0, lateResultReleased: false }],
      ['failed_malformed_json', 'llm', 1, 'malformed_json', false, { chatCalls: 1, rejected: false, parseFailed: true, saveCalls: 0, lateResultReleased: false }],
      ['chapter_plan_chunk_failure', 'llm', 2, 'malformed_json', false, { chatCalls: 2, rejected: false, parseFailed: true, saveCalls: 0, lateResultReleased: false }],
      ['save_failure_after_provider', 'repository', 1, 'save_failed', true, { chatCalls: 1, rejected: true, parseFailed: false, saveCalls: 1, lateResultReleased: false }],
      ['late_result_after_cancel', 'late_result', 1, 'released_after_cancel', true, { chatCalls: 0, rejected: false, parseFailed: false, saveCalls: 0, lateResultReleased: true }]
    ] as const;

    for (const [scenarioId, target, callIndex, outcome, providerCompleted, resultShape] of expected) {
      const snapshot = createRp01cFixture(scenarioId);
      const plan = createRp01cInjectionPlan(scenarioId);
      const overlay = applyRp01cInjectionOverlay(snapshot, plan);
      const probeResult = await executeRp01cInjectionProbe(scenarioId);
      assert.deepEqual(plan.steps[0], {
        target,
        callIndex,
        outcome,
        providerCompleted,
        safeSummary: plan.steps[0].safeSummary
      });
      assert.equal((overlay.replayInput.injectionPlan as { scenarioId: string }).scenarioId, scenarioId);
      assert.equal(FORBIDDEN_TEXT.test(JSON.stringify(overlay)), false);
      assert.equal(probeResult.chatCalls, resultShape.chatCalls);
      assert.equal(probeResult.rejected, resultShape.rejected);
      assert.equal(probeResult.parseFailed, resultShape.parseFailed);
      assert.equal(probeResult.saveCalls, resultShape.saveCalls);
      assert.equal(probeResult.providerCompleted, providerCompleted);
      assert.equal(probeResult.lateResultReleased, resultShape.lateResultReleased);
      assert.equal(probeResult.records.length > 0, true);
      if (scenarioId === 'save_failure_after_provider') assert.deepEqual(probeResult.records, ['provider_completed_before_save', 'save_call_1_rejected']);
      if (scenarioId === 'late_result_after_cancel') {
        assert.equal(snapshot.scenario.kind, 'counterexample');
        assert.equal(probeResult.cancelledBeforeRelease, true);
        assert.equal(probeResult.writesAttempted, false);
        assert.deepEqual(probeResult.records, ['cancel_marked_before_release', 'late_input_released_after_cancel']);
      }
    }
  });
});

describe('RP-01C Fastify task projection', () => {
  it('serves processing, failed, stale, and conflict snapshots through existing task routes', async () => {
    for (const scenarioId of ['processing', 'failed_timeout', 'stale_source', 'active_conflict'] as const) {
      const snapshot = createRp01cFixture(scenarioId);
      const app = await buildApp({
        logger: false,
        novelRepository: createRp01cRepository(snapshot),
        now: () => new Date(RP01C_BASE_TIME_ISO)
      });

      const task = snapshot.tasks[0];
      const response = await app.inject({ method: 'GET', url: `/tasks/${task.id}`, headers: { 'x-request-id': `rp01c-${scenarioId}` } });
      assert.equal(response.statusCode, 200);
      const body = response.json();
      assert.equal(body.success, true);
      assert.equal(body.data.id, task.id);
      assert.equal(body.data.status, task.status);
      assert.equal(body.data.trace.requestId, `rp01c-request-${scenarioId}`);
      assert.equal(FORBIDDEN_TEXT.test(JSON.stringify(body)), false);
      if (scenarioId === 'failed_timeout') assert.equal(body.data.failureCategory, 'timeout');
      if (scenarioId === 'stale_source') {
        assert.equal(body.data.retryable, false);
        assert.equal(body.data.nextAction.type, 'regenerate');
      }
      if (scenarioId === 'active_conflict') {
        assert.equal(body.data.conflictScope, 'novel_body_batch');
        assert.equal(body.data.cancellable, true);
      }

      const events = await app.inject({ method: 'GET', url: `/tasks/${task.id}/events` });
      assert.equal(events.statusCode, 200);
      assert.equal(events.json().data.items.length, snapshot.events.length);

      const projectionRepository = createRp01cRepository(snapshot);
      assert.equal(await projectionRepository.findById('tenant_other', snapshot.novels[0].id), null);
      assert.equal(await projectionRepository.findTaskById('tenant_other', task.id), null);
      assert.deepEqual(await projectionRepository.listTaskEvents('tenant_other', task.id), []);
      assert.deepEqual(await projectionRepository.listRecentTasksForNovel('tenant_other', snapshot.novels[0].id, 10), []);
      if (scenarioId === 'active_conflict') {
        assert.equal((await projectionRepository.findActiveTaskByConflict(task.tenantId, 'novel_body_batch', snapshot.novels[0].id))?.id, task.id);
        assert.equal(await projectionRepository.findActiveTaskByConflict('tenant_other', 'novel_body_batch', snapshot.novels[0].id), null);
      }
      await app.close();
    }
  });

  it('rebuilds restart_boundary from the same scenario id after app close with equivalent task projection', async () => {
    const firstSnapshot = createRp01cFixture('restart_boundary');
    const firstProjection = await projectTask(firstSnapshot);
    assert.doesNotThrow(() => JSON.stringify(firstSnapshot));

    const rebuiltSnapshot = createRp01cFixture('restart_boundary');
    const rebuiltProjection = await projectTask(rebuiltSnapshot);
    assert.deepEqual(firstProjection, rebuiltProjection);
  });

  it('keeps counterexamples as pure fixture evidence instead of claiming route support', () => {
    const lateResult = createRp01cFixture('late_result_after_cancel');
    const duplicateCurrent = createRp01cFixture('duplicate_current');
    assert.equal(lateResult.detectors.lateResultRisk, true);
    assert.equal(duplicateCurrent.detectors.duplicateCurrentVersionIds.length, 2);
  });
});

const DEFAULT_TENANT_FOR_TEST = 'tenant_default';

async function projectTask(snapshot: ReturnType<typeof createRp01cFixture>) {
  const app = await buildApp({
    logger: false,
    novelRepository: createRp01cRepository(snapshot),
    now: () => new Date(RP01C_BASE_TIME_ISO)
  });
  const response = await app.inject({ method: 'GET', url: `/tasks/${snapshot.tasks[0].id}` });
  await app.close();
  assert.equal(response.statusCode, 200);
  const body = response.json().data;
  return {
    id: body.id,
    status: body.status,
    currentStep: body.currentStep,
    traceRequestId: body.trace.requestId,
    nextActionType: body.nextAction.type
  };
}
