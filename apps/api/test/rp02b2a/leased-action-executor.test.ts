import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TaskStatus } from '@ai-shortvideo/shared';
import { buildApp } from '../../src/app.js';
import type { NovelRepository } from '../../src/modules/novels/domain/novelDomain.js';
import { MockBodyProvider } from '../../src/modules/novels/providers/mockBodyProvider.js';
import { MockDirectionProvider } from '../../src/modules/novels/providers/mockDirectionProvider.js';
import { MockFullReviewProvider } from '../../src/modules/novels/providers/mockFullReviewProvider.js';
import { MockStructureProvider } from '../../src/modules/novels/providers/mockStructureProvider.js';
import { MockTrialProvider } from '../../src/modules/novels/providers/mockTrialProvider.js';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';
import { createLeasedActionExecutor } from '../../src/modules/novels/services/leasedActionExecutor.js';

const at = (seconds: number) => new Date(Date.UTC(2030, 0, 1, 0, 0, seconds));

async function harness(providerFailure = false, providerGate?: Promise<void>,
  onFailureStage?: (stage: 'event' | 'operation_log') => void) {
  const repository = createInMemoryNovelRepository({ onLeasedFailureStage: onFailureStage });
  const app = await buildApp({ logger: false, novelRepository: repository,
    requestContextResolver: async () => ({ tenantId: 'tenant_executor', userId: 'user_executor' }) });
  try {
    const draft = await app.inject({ method: 'POST', url: '/novels/drafts', payload: {
      title: '后台执行顺序测试', genres: ['都市逆袭'], preferences: {
        appealPoints: ['逆袭'], targetAudience: '成年读者'
      }, chapterLimit: 8, chapterWordRange: { min: 1800, max: 2600 }
    } });
    assert.equal(draft.statusCode, 201, draft.body);
    const novelId = draft.json().data.id as string;
    const response = await app.inject({ method: 'POST', url: `/novels/${novelId}/directions/generate`, payload: {} });
    assert.equal(response.statusCode, 200, response.body);
    const task = repository.getGenerationTasks().find((item) => item.id === response.json().data.task.id);
    assert.ok(task);
    task.status = TaskStatus.Queued;
    task.startedAt = null;
    task.finishedAt = null;
    task.providerAttemptId = null;
    task.providerAttemptPhase = null;
    task.providerDispatchedAt = null;
    task.resultReceiptHash = null;
    task.providerCallBudgetMax = 1;
    task.providerCallBudgetUsed = 0;
    task.durationDeadlineAt = at(120);
    const leased = await repository.leaseNextQueuedTask('worker-executor', 'lease-executor', at(0), at(60));
    assert.equal(leased?.id, task.id);
    let clock = at(1);
    let providerCalls = 0;
    let authorityReadError = false;
    let workerModelRoute = 'provider:MockDirectionProvider:v1';
    class CountingDirectionProvider extends MockDirectionProvider {
      getModelRoutingVersion() { return workerModelRoute; }
      override async generateCandidates(input: Parameters<MockDirectionProvider['generateCandidates']>[0]) {
        providerCalls += 1;
        await providerGate;
        if (providerFailure) throw new Error('sk-secret-provider-canary');
        return super.generateCandidates(input);
      }
    }
    const enabledRepository: NovelRepository = {
      ...repository,
      getLeasedExecutionCapability: async (taskType) => taskType === 'novel_direction_generate' ? 'enabled' : 'unsupported',
      getAuthoritativeTaskTime: async () => clock,
      loadGenerationAuthority: async (input) => {
        if (authorityReadError) throw new Error('injected authority read fault');
        return repository.loadGenerationAuthority(input);
      }
    };
    const handlers = createLeasedActionExecutor({ repository: enabledRepository, newProviderAttemptId: () => 'attempt-executor',
      providers: { directionProvider: new CountingDirectionProvider(), structureProvider: new MockStructureProvider(),
        trialProvider: new MockTrialProvider(), bodyProvider: new MockBodyProvider(),
        fullReviewProvider: new MockFullReviewProvider() } });
    const controller = new AbortController();
    const context = { task, leaseOwnerId: 'worker-executor', leaseToken: 'lease-executor',
      signal: controller.signal, mutate: <T>(operation: () => Promise<T>) => operation() };
    return { repository, task, handlers, context, controller, get providerCalls() { return providerCalls; },
      setClock: (seconds: number) => { clock = at(seconds); },
      failAuthorityRead: () => { authorityReadError = true; },
      changeModelRouting: () => { workerModelRoute = 'deepseek:other-model:route-v1'; } };
  } finally {
    await app.close();
  }
}

describe('leased action executor', () => {
  it('rebuilds and validates input, reserves one attempt, then writes one candidate receipt', async () => {
    const h = await harness();
    const beforeVersions = h.repository.getCreativeVersions().length;
    const result = await h.handlers.execute(h.context);
    assert.equal(result.kind, 'provider_result');
    assert.equal(h.providerCalls, 1);
    assert.equal(h.task.providerCallBudgetUsed, 1);
    assert.equal(h.task.providerAttemptPhase, 'provider_result_validated');
    assert.equal(h.repository.getCreativeVersions().length, beforeVersions);
    await h.handlers.settle({ task: h.task, leaseOwnerId: h.context.leaseOwnerId,
      leaseToken: h.context.leaseToken, authoritativeNow: at(2), outcome: { kind: 'fulfilled', value: result } });
    assert.equal(h.task.status, TaskStatus.WaitingConfirmation);
    assert.ok(h.task.resultReceiptHash);
    assert.equal(h.repository.getCreativeVersions().length, beforeVersions + 4);
    assert.equal((await h.handlers.execute(h.context)).kind, 'fenced');
    assert.equal(h.providerCalls, 1);
  });

  it('fails a changed source before allocating a paid attempt or calling a model', async () => {
    const h = await harness();
    h.repository.getPreferences()[0]!.targetAudience = '另一类读者';
    const result = await h.handlers.execute(h.context);
    assert.equal(result.kind, 'terminal');
    assert.equal(h.task.status, TaskStatus.Failed);
    assert.equal(h.task.errorCode, 'SOURCE_STALE');
    assert.equal(h.task.providerCallBudgetUsed, 0);
    assert.equal(h.task.providerAttemptId, null);
    assert.equal(h.providerCalls, 0);
  });

  it('does not misclassify an authority read fault as unsupported input', async () => {
    const h = await harness();
    h.failAuthorityRead();
    await assert.rejects(h.handlers.execute(h.context), /injected authority read fault/);
    assert.equal(h.task.providerCallBudgetUsed, 0);
    assert.equal(h.providerCalls, 0);
    assert.equal(h.task.status, TaskStatus.Processing);
  });

  it('fails a changed model route before reserving the paid call', async () => {
    const h = await harness();
    h.changeModelRouting();
    const result = await h.handlers.execute(h.context);
    assert.equal(result.kind, 'terminal');
    assert.equal(h.task.status, TaskStatus.Failed);
    assert.equal(h.task.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
    assert.equal(h.task.providerCallBudgetUsed, 0);
    assert.equal(h.providerCalls, 0);
  });

  it('fences a returned result after lease expiry and recovery never calls the provider again', async () => {
    const h = await harness();
    const result = await h.handlers.execute(h.context);
    assert.equal(result.kind, 'provider_result');
    const beforeVersions = h.repository.getCreativeVersions().length;
    h.task.leaseExpiresAt = at(2);
    await h.handlers.settle({ task: h.task, leaseOwnerId: h.context.leaseOwnerId,
      leaseToken: h.context.leaseToken, authoritativeNow: at(2), outcome: { kind: 'fulfilled', value: result } });
    assert.equal(h.repository.getCreativeVersions().length, beforeVersions);
    const recovered = await h.repository.recoverExpiredTask({ tenantId: h.task.tenantId, taskId: h.task.id,
      leaseOwnerId: h.context.leaseOwnerId, leaseToken: h.context.leaseToken, leaseExpiresAt: at(2) }, at(2));
    assert.equal(recovered.task?.errorCode, 'PROVIDER_OUTCOME_UNKNOWN');
    assert.equal(h.task.providerCallBudgetUsed, 1);
    assert.equal(h.providerCalls, 1);
    assert.equal(await h.repository.leaseNextQueuedTask('worker-again', 'lease-again', at(3), at(60)), null);
  });

  it('does not retry a rejected provider call or leak its raw error', async () => {
    const h = await harness(true);
    const beforeLogs = h.repository.getOperationLogs().length;
    const result = await h.handlers.execute(h.context);
    assert.equal(result.kind, 'provider_failure');
    assert.equal(h.providerCalls, 1);
    assert.equal(h.task.providerCallBudgetUsed, 1);
    await h.handlers.settle({ task: h.task, leaseOwnerId: h.context.leaseOwnerId,
      leaseToken: h.context.leaseToken, authoritativeNow: at(2), outcome: { kind: 'fulfilled', value: result } });
    assert.equal(h.task.status, TaskStatus.Failed);
    assert.equal(h.task.errorCode, 'PROVIDER_ERROR');
    assert.equal(h.repository.getOperationLogs().length, beforeLogs + 1);
    assert.equal(JSON.stringify(h.repository.getGenerationTaskEvents()).includes('sk-secret-provider-canary'), false);
    assert.equal(JSON.stringify(h.repository.getOperationLogs()).includes('sk-secret-provider-canary'), false);
    assert.equal((await h.handlers.execute(h.context)).kind, 'fenced');
    assert.equal(h.providerCalls, 1);
  });

  it('rolls back a failed task when its failure audit cannot be committed', async () => {
    const h = await harness(true, undefined, (stage) => {
      if (stage === 'operation_log') throw new Error('audit write failed');
    });
    const result = await h.handlers.execute(h.context);
    assert.equal(result.kind, 'provider_failure');
    const events = h.repository.getGenerationTaskEvents().length;
    const logs = h.repository.getOperationLogs().length;
    await assert.rejects(h.handlers.settle({ task: h.task, leaseOwnerId: h.context.leaseOwnerId,
      leaseToken: h.context.leaseToken, authoritativeNow: at(2), outcome: { kind: 'fulfilled', value: result } }),
    /audit write failed/);
    assert.equal(h.task.status, TaskStatus.Processing);
    assert.equal(h.task.providerCallBudgetUsed, 1);
    assert.equal(h.repository.getGenerationTaskEvents().length, events);
    assert.equal(h.repository.getOperationLogs().length, logs);
    assert.equal(h.providerCalls, 1);
  });

  it('does not reserve a paid attempt when stopped before execution begins', async () => {
    const h = await harness();
    h.controller.abort();
    assert.equal((await h.handlers.execute(h.context)).kind, 'fenced');
    assert.equal(h.task.providerCallBudgetUsed, 0);
    assert.equal(h.providerCalls, 0);
  });

  it('drops a model result returned after lease loss without making a candidate current', async () => {
    let release!: () => void;
    const providerGate = new Promise<void>((resolve) => { release = resolve; });
    const h = await harness(false, providerGate);
    const beforeVersions = h.repository.getCreativeVersions().length;
    const executing = h.handlers.execute(h.context);
    for (let i = 0; i < 30 && h.providerCalls === 0; i += 1) await Promise.resolve();
    assert.equal(h.providerCalls, 1);
    h.task.leaseExpiresAt = at(2);
    h.setClock(2);
    release();
    assert.equal((await executing).kind, 'fenced');
    assert.equal(h.repository.getCreativeVersions().length, beforeVersions);
    const recovered = await h.repository.recoverExpiredTask({ tenantId: h.task.tenantId, taskId: h.task.id,
      leaseOwnerId: h.context.leaseOwnerId, leaseToken: h.context.leaseToken, leaseExpiresAt: at(2) }, at(2));
    assert.equal(recovered.task?.errorCode, 'PROVIDER_OUTCOME_UNKNOWN');
    assert.equal(h.providerCalls, 1);
  });
});
