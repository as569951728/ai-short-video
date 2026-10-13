import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TaskStatus } from '@ai-shortvideo/shared';
import { buildApp } from '../../src/app.js';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';

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
    const failure = { tenantId: task.tenantId, taskId: task.id, leaseOwnerId: 'worker-3', leaseToken: 'lease-3',
      authoritativeNow: at(2), expectedPhase: 'leased' as const, reason: 'retry_not_available' as const };
    assert.equal((await repository.failLeasedAction(failure)).outcome, 'applied');
    assert.equal(task.status, TaskStatus.Failed);
    assert.equal(task.errorCode, 'RETRY_NOT_AVAILABLE');
    assert.equal(task.activeClaimKey, null);
    assert.equal(task.leaseToken, null);
    assert.equal((await repository.failLeasedAction(failure)).outcome, 'fenced');
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
