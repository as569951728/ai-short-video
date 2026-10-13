import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TaskStatus } from '@ai-shortvideo/shared';
import { buildApp } from '../../src/app.js';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';
import { preflightLeasedAction } from '../../src/modules/novels/services/taskClaim.js';
import { listActionExecutionPlans } from '../../src/modules/novels/services/actionExecutionPlan.js';

const at = (seconds: number) => new Date(Date.UTC(2030, 0, 1, 0, 0, seconds));

async function queuedTask() {
  const repository = createInMemoryNovelRepository();
  const app = await buildApp({
    logger: false,
    novelRepository: repository,
    requestContextResolver: async () => ({ tenantId: 'tenant_lease', userId: 'user_lease' })
  });
  try {
    const draft = await app.inject({ method: 'POST', url: '/novels/drafts', payload: {
      title: '租约检查点测试', genres: ['都市逆袭'], preferences: { appealPoints: ['逆袭'], targetAudience: '成年读者' },
      chapterLimit: 8, chapterWordRange: { min: 1800, max: 2600 }
    } });
    assert.equal(draft.statusCode, 201, draft.body);
    const novelId = draft.json().data.id as string;
    const generated = await app.inject({ method: 'POST', url: `/novels/${novelId}/directions/generate`, payload: {} });
    assert.equal(generated.statusCode, 200, generated.body);
    const task = repository.getGenerationTasks().find((item) => item.id === generated.json().data.task.id);
    assert.ok(task);
    task.status = TaskStatus.Queued;
    task.startedAt = null;
    task.finishedAt = null;
    task.providerAttemptId = null;
    task.providerAttemptPhase = null;
    task.providerDispatchedAt = null;
    return { repository, task };
  } finally {
    await app.close();
  }
}

describe('RP-02B2a3 leased dispatch checkpoint', () => {
  it('keeps all provider action capabilities disabled until fenced finalize is available', async () => {
    const inMemory = createInMemoryNovelRepository();
    const prisma = Object.create(PrismaNovelRepository.prototype) as PrismaNovelRepository;
    const taskTypes = new Set(listActionExecutionPlans().map((plan) => plan.taskType));
    assert.equal(taskTypes.size, 15);
    for (const taskType of taskTypes) {
      assert.equal(await inMemory.getLeasedExecutionCapability(taskType), 'disabled', taskType);
      assert.equal(await prisma.getLeasedExecutionCapability(taskType), 'disabled', taskType);
    }
    assert.equal(await inMemory.getLeasedExecutionCapability('unknown_task'), 'unsupported');
    assert.equal(await prisma.getLeasedExecutionCapability('unknown_task'), 'unsupported');
  });

  it('safely terminates a disabled leased action without an attempt, provider result, or duplicate audit', async () => {
    const { repository, task } = await queuedTask();
    await repository.leaseNextQueuedTask('worker-safe', 'lease-safe', at(0), at(30));
    const beforeEvents = repository.getGenerationTaskEvents().length;
    const beforeLogs = repository.getOperationLogs().length;
    const input = { repository, tenantId: task.tenantId, taskId: task.id,
      leaseOwnerId: 'worker-safe', leaseToken: 'lease-safe', authoritativeNow: at(1) };
    assert.equal((await preflightLeasedAction({ ...input, leaseOwnerId: 'wrong-owner' })).outcome, 'fenced');
    assert.equal(repository.getGenerationTaskEvents().length, beforeEvents);
    assert.equal((await preflightLeasedAction(input)).outcome, 'failed');
    assert.equal(task.status, TaskStatus.Failed);
    assert.equal(task.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
    assert.equal(task.providerAttemptId, null);
    assert.equal(task.providerDispatchedAt, null);
    assert.equal(task.resultReceiptHash, null);
    assert.equal(task.activeClaimKey, null);
    assert.equal(repository.getGenerationTaskEvents().length, beforeEvents + 1);
    assert.equal(repository.getOperationLogs().length, beforeLogs + 1);
    assert.equal((await preflightLeasedAction(input)).outcome, 'fenced');
    assert.equal(repository.getGenerationTaskEvents().length, beforeEvents + 1);
    assert.equal(repository.getOperationLogs().length, beforeLogs + 1);
  });

  it('redacts a damaged leased envelope and fences the expired owner', async () => {
    const { repository, task } = await queuedTask();
    await repository.leaseNextQueuedTask('worker-damaged', 'lease-damaged', at(0), at(30));
    task.executionEnvelopeJson = { secret: 'sk-secret-canary' } as never;
    const input = { repository, tenantId: task.tenantId, taskId: task.id,
      leaseOwnerId: 'worker-damaged', leaseToken: 'lease-damaged' };
    assert.equal((await preflightLeasedAction({ ...input, authoritativeNow: at(30) })).outcome, 'fenced');
    assert.equal(task.status, TaskStatus.Processing);
    assert.equal((await preflightLeasedAction({ ...input, authoritativeNow: at(1) })).outcome, 'failed');
    assert.equal(task.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
    assert.equal(JSON.stringify(repository.getGenerationTaskEvents()).includes('sk-secret-canary'), false);
    assert.equal(JSON.stringify(repository.getOperationLogs()).includes('sk-secret-canary'), false);
  });

  it('does not erase evidence of an earlier provider attempt when a task is queued again', async () => {
    const { repository, task } = await queuedTask();
    task.providerAttemptId = 'earlier-attempt';
    task.providerDispatchedAt = at(0);
    task.providerAttemptPhase = 'provider_call_started';
    const beforeEvents = repository.getGenerationTaskEvents().length;
    const beforeLogs = repository.getOperationLogs().length;
    assert.equal(await repository.leaseNextQueuedTask('worker-replay', 'lease-replay', at(1), at(30)), null);
    assert.equal(task.status, TaskStatus.Failed);
    assert.equal(task.errorCode, 'PROVIDER_OUTCOME_UNKNOWN');
    assert.equal(task.providerAttemptId, 'earlier-attempt');
    assert.equal(task.providerDispatchedAt?.toISOString(), at(0).toISOString());
    assert.equal(task.leaseOwnerId, null);
    assert.equal(repository.getGenerationTaskEvents().length, beforeEvents + 1);
    assert.equal(repository.getOperationLogs().length, beforeLogs + 1);
    assert.equal(await repository.leaseNextQueuedTask('worker-replay', 'lease-again', at(2), at(30)), null);
    assert.equal(repository.getGenerationTaskEvents().length, beforeEvents + 1);
    assert.equal(repository.getOperationLogs().length, beforeLogs + 1);
  });

  it('does not lease a queued task when only the paid-call budget shows prior use', async () => {
    const { repository, task } = await queuedTask();
    task.providerCallBudgetUsed = 1;
    assert.equal(task.providerAttemptId, null);
    assert.equal(task.providerDispatchedAt, null);
    assert.equal(await repository.leaseNextQueuedTask('worker-budget', 'lease-budget', at(1), at(30)), null);
    assert.equal(task.status, TaskStatus.Failed);
    assert.equal(task.errorCode, 'PROVIDER_OUTCOME_UNKNOWN');
    assert.equal(task.providerCallBudgetUsed, 1);
  });

  it('atomically fails a Prisma queued task with prior dispatch evidence before leasing it', async () => {
    const row = {
      id: 'task-old-attempt', tenantId: 'tenant-1', novelId: 'novel-1', createdBy: 'user-1',
      status: 'QUEUED', statusNote: null as string | null, progress: 0,
      providerAttemptId: 'attempt-old', providerDispatchedAt: at(0), providerAttemptPhase: 'PROVIDER_CALL_STARTED',
      providerCallBudgetUsed: 1, leaseOwnerId: null, leaseToken: null
    };
    const events: unknown[] = [];
    const logs: unknown[] = [];
    const updates: unknown[] = [];
    const repository = Object.create(PrismaNovelRepository.prototype) as PrismaNovelRepository & { prisma: unknown };
    Object.defineProperty(repository, 'prisma', { value: {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
        generationTask: {
          findFirst: async () => row.status === 'QUEUED' ? row : null,
          findFirstOrThrow: async () => row,
          updateMany: async (input: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
            updates.push(input);
            Object.assign(row, input.data);
            return { count: 1 };
          }
        },
        generationTaskEvent: { create: async (input: unknown) => { events.push(input); } },
        operationLog: { create: async (input: unknown) => { logs.push(input); } }
      })
    } });
    assert.equal(await repository.leaseNextQueuedTask('worker-1', 'lease-1', at(1), at(30)), null);
    assert.equal(row.status, 'FAILED');
    assert.equal(row.providerAttemptId, 'attempt-old');
    assert.equal(row.providerDispatchedAt.toISOString(), at(0).toISOString());
    assert.equal((updates[0] as { where: Record<string, unknown> }).where.providerAttemptId, 'attempt-old');
    assert.equal(events.length, 1);
    assert.equal(logs.length, 1);
    assert.equal(await repository.leaseNextQueuedTask('worker-1', 'lease-2', at(2), at(30)), null);
    assert.equal(events.length, 1);
    assert.equal(logs.length, 1);
  });

  it('records an attempt only at dispatch and fences duplicate or wrong-phase checkpoints', async () => {
    const { repository, task } = await queuedTask();
    const lease = await repository.leaseNextQueuedTask('worker-1', 'lease-1', at(0), at(60));
    assert.equal(lease?.id, task.id);
    assert.equal(lease?.providerAttemptId, null);
    assert.equal(lease?.providerDispatchedAt, null);
    const base = { tenantId: task.tenantId, taskId: task.id, leaseOwnerId: 'worker-1', leaseToken: 'lease-1' };
    const prepare = { ...base, authoritativeNow: at(10), checkpoint: { expectedPhase: 'leased' as const, nextPhase: 'prepared' as const } };
    assert.equal((await repository.checkpointLeasedTask(prepare)).outcome, 'applied');
    assert.equal((await repository.checkpointLeasedTask(prepare)).outcome, 'fenced');
    const eventCount = repository.getGenerationTaskEvents().length;
    const dispatch = { ...base, authoritativeNow: at(20), checkpoint: {
      expectedPhase: 'prepared' as const, nextPhase: 'provider_call_started' as const, providerAttemptId: 'attempt-1'
    } };
    assert.equal((await repository.checkpointLeasedTask(dispatch)).outcome, 'applied');
    assert.equal(task.providerAttemptId, 'attempt-1');
    assert.equal(task.providerDispatchedAt?.toISOString(), at(20).toISOString());
    assert.equal(repository.getGenerationTaskEvents().length, eventCount + 1);
    assert.equal((await repository.checkpointLeasedTask(dispatch)).outcome, 'fenced');
    assert.equal((await repository.checkpointLeasedTask({ ...base, authoritativeNow: at(30), checkpoint: {
      expectedPhase: 'provider_call_started', nextPhase: 'provider_result_validated', providerAttemptId: 'wrong-attempt'
    } })).outcome, 'fenced');
    assert.equal((await repository.checkpointLeasedTask({ ...base, authoritativeNow: at(30), checkpoint: {
      expectedPhase: 'provider_call_started', nextPhase: 'provider_result_validated', providerAttemptId: 'attempt-1'
    } })).outcome, 'applied');
    assert.equal((await repository.checkpointLeasedTask({ ...base, authoritativeNow: at(60), checkpoint: {
      expectedPhase: 'provider_call_started', nextPhase: 'provider_result_validated', providerAttemptId: 'attempt-1'
    } })).outcome, 'fenced');
    assert.equal((await repository.recoverExpiredTask({ ...base, leaseExpiresAt: at(60) }, at(60))).task?.errorCode, 'PROVIDER_OUTCOME_UNKNOWN');
  });

  it('recovers an expired pre-dispatch lease without claiming that the provider ran', async () => {
    const { repository, task } = await queuedTask();
    await repository.leaseNextQueuedTask('worker-2', 'lease-2', at(0), at(30));
    const observed = { tenantId: task.tenantId, taskId: task.id, leaseOwnerId: 'worker-2', leaseToken: 'lease-2', leaseExpiresAt: at(30) };
    assert.equal((await repository.recoverExpiredTask(observed, at(30))).task?.errorCode, 'WORKER_LEASE_EXPIRED');
    assert.equal(task.activeClaimKey, null);
    assert.equal(task.leaseToken, null);
    assert.equal((await repository.checkpointLeasedTask({ ...observed, authoritativeNow: at(31), checkpoint: {
      expectedPhase: 'leased', nextPhase: 'prepared'
    } })).outcome, 'fenced');
  });

  it('fences a legacy retry child before provider dispatch', async () => {
    const { repository, task } = await queuedTask();
    task.retryOfTaskId = 'parent-task';
    await repository.leaseNextQueuedTask('worker-3', 'lease-3', at(0), at(30));
    const eventsBefore = repository.getGenerationTaskEvents().length;
    const logsBefore = repository.getOperationLogs().length;
    assert.equal((await repository.checkpointLeasedTask({ tenantId: task.tenantId, taskId: task.id,
      leaseOwnerId: 'worker-3', leaseToken: 'lease-3', authoritativeNow: at(1), checkpoint: {
        expectedPhase: 'leased', nextPhase: 'prepared'
    } })).outcome, 'fenced');
    assert.equal(task.providerAttemptId, null);
    const failure = { repository, tenantId: task.tenantId, taskId: task.id, leaseOwnerId: 'worker-3', leaseToken: 'lease-3',
      authoritativeNow: at(2) };
    assert.equal((await preflightLeasedAction(failure)).outcome, 'failed');
    assert.equal(task.status, TaskStatus.Failed);
    assert.equal(task.errorCode, 'RETRY_NOT_AVAILABLE');
    assert.equal(task.activeClaimKey, null);
    assert.equal(task.leaseToken, null);
    assert.equal((await preflightLeasedAction(failure)).outcome, 'fenced');
    assert.equal(repository.getGenerationTaskEvents().length, eventsBefore + 1);
    assert.equal(repository.getOperationLogs().length, logsBefore + 1);
    assert.equal(repository.getOperationLogs()[0]?.sourceTaskId, task.id);
  });

  it('fences a non-retry task and an expired owner before writing failure audit', async () => {
    const { repository, task } = await queuedTask();
    await repository.leaseNextQueuedTask('worker-4', 'lease-4', at(0), at(30));
    const auditBefore = repository.getOperationLogs().length;
    const base = { tenantId: task.tenantId, taskId: task.id, leaseOwnerId: 'worker-4', leaseToken: 'lease-4',
      expectedPhase: 'leased' as const, reason: 'retry_not_available' as const };
    assert.equal((await repository.failLeasedAction({ ...base, authoritativeNow: at(1) })).outcome, 'fenced');
    task.retryOfTaskId = 'parent-task';
    assert.equal((await repository.failLeasedAction({ ...base, authoritativeNow: at(30) })).outcome, 'fenced');
    assert.equal(repository.getOperationLogs().length, auditBefore);
    assert.equal(task.status, TaskStatus.Processing);
  });

  it('uses tenant, owner, token, live expiry, phase and attempt in the Prisma checkpoint CAS', async () => {
    const updates: unknown[] = [];
    const repository = Object.create(PrismaNovelRepository.prototype) as PrismaNovelRepository & { prisma: unknown };
    Object.defineProperty(repository, 'prisma', { value: { $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      generationTask: { updateMany: async (input: unknown) => { updates.push(input); return { count: 0 }; } }
    }) } });
    const input = { tenantId: 'tenant-1', taskId: 'task-1', leaseOwnerId: 'worker-1', leaseToken: 'lease-1', authoritativeNow: at(10), checkpoint: {
      expectedPhase: 'provider_call_started' as const, nextPhase: 'provider_result_validated' as const, providerAttemptId: 'attempt-1'
    } };
    assert.equal((await repository.checkpointLeasedTask(input)).outcome, 'fenced');
    assert.deepEqual((updates[0] as { where: unknown }).where, {
      tenantId: 'tenant-1', id: 'task-1', status: 'PROCESSING', leaseOwnerId: 'worker-1', leaseToken: 'lease-1',
      leaseExpiresAt: { gt: at(10) }, retryOfTaskId: null, providerAttemptPhase: 'PROVIDER_CALL_STARTED',
      providerAttemptId: 'attempt-1', providerDispatchedAt: { not: null }
    });
  });

  it('fences Prisma retry-child failure with the same live lease and phase', async () => {
    const updates: unknown[] = [];
    const repository = Object.create(PrismaNovelRepository.prototype) as PrismaNovelRepository & { prisma: unknown };
    Object.defineProperty(repository, 'prisma', { value: { $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      generationTask: { updateMany: async (input: unknown) => { updates.push(input); return { count: 0 }; } }
    }) } });
    const result = await repository.failLeasedAction({
      tenantId: 'tenant-1', taskId: 'task-1', leaseOwnerId: 'worker-1', leaseToken: 'lease-1',
      authoritativeNow: at(10), expectedPhase: 'leased', reason: 'retry_not_available'
    });
    assert.equal(result.outcome, 'fenced');
    assert.deepEqual((updates[0] as { where: unknown }).where, {
      tenantId: 'tenant-1', id: 'task-1', status: 'PROCESSING', leaseOwnerId: 'worker-1', leaseToken: 'lease-1',
      leaseExpiresAt: { gt: at(10) }, providerAttemptPhase: 'LEASED', retryOfTaskId: { not: null }
    });
  });
});
