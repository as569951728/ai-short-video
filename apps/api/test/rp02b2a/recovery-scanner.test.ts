import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TaskStatus } from '@ai-shortvideo/shared';
import type { NovelRepository, ObservedTaskLease } from '../../src/modules/novels/domain/novelDomain.js';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';
import { createNovelRecoveryLoop, sweepExpiredNovelTasks } from '../../src/modules/novels/services/recoveryScanner.js';
import { createRouteAuthorityFixture } from './fixtures.js';

const at = (seconds: number) => new Date(Date.UTC(2030, 0, 1, 0, 0, seconds));

describe('novel recovery scanner', () => {
  it('releases a real expired in-memory claim and keeps the same task terminal after another scan', async () => {
    const repository = createInMemoryNovelRepository();
    const fixture = await createRouteAuthorityFixture('direction_generate', repository);
    try {
      const response = await fixture.runSuccess('expired-scan');
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
      task.providerCallBudgetUsed = 0;
      assert.equal((await repository.leaseNextQueuedTask('worker-expired', 'lease-expired', at(0), at(30)))?.id, task.id);
      const beforeEvents = repository.getGenerationTaskEvents().length;
      assert.deepEqual(await sweepExpiredNovelTasks(repository, at(30)), { observed: 1, recovered: 1, raced: 0, failed: 0 });
      assert.equal(task.status, TaskStatus.Failed);
      assert.equal(task.errorCode, 'WORKER_LEASE_EXPIRED');
      assert.equal(task.leaseToken, null);
      assert.equal(task.activeClaimKey, null);
      assert.equal(repository.getGenerationTaskEvents().length, beforeEvents + 1);
      assert.deepEqual(await sweepExpiredNovelTasks(repository, at(31)), { observed: 0, recovered: 0, raced: 0, failed: 0 });
      assert.equal(repository.getGenerationTaskEvents().length, beforeEvents + 1);
    } finally {
      await fixture.app.close();
    }
  });

  it('ends expired leases once and does not repeat a terminal task', async () => {
    const leases: ObservedTaskLease[] = ['task-a', 'task-b'].map((taskId) => ({
      tenantId: 'tenant-1', taskId, leaseOwnerId: 'worker-1',
      leaseToken: `lease-${taskId}`, leaseExpiresAt: at(30)
    }));
    const recovered: string[] = [];
    const repository = {
      listExpiredTaskLeases: async (_now: Date, limit: number) => leases.slice(0, limit),
      recoverExpiredTask: async (lease: ObservedTaskLease) => {
        recovered.push(lease.taskId);
        leases.splice(leases.findIndex((item) => item.taskId === lease.taskId), 1);
        return { outcome: 'recovered', task: null };
      }
    } as unknown as NovelRepository;
    assert.deepEqual(await sweepExpiredNovelTasks(repository, at(30), 2), {
      observed: 2, recovered: 2, raced: 0, failed: 0
    });
    assert.deepEqual(await sweepExpiredNovelTasks(repository, at(31), 2), {
      observed: 0, recovered: 0, raced: 0, failed: 0
    });
    assert.deepEqual(recovered, ['task-a', 'task-b']);
  });

  it('counts a lease lost to another worker without retrying its provider', async () => {
    const lease: ObservedTaskLease = { tenantId: 'tenant-1', taskId: 'task-raced',
      leaseOwnerId: 'old-worker', leaseToken: 'old-lease', leaseExpiresAt: at(30) };
    let calls = 0;
    const repository = {
      listExpiredTaskLeases: async () => [lease],
      recoverExpiredTask: async () => { calls += 1; return { outcome: 'not_recovered', task: null }; }
    } as unknown as NovelRepository;
    assert.deepEqual(await sweepExpiredNovelTasks(repository, at(30)), {
      observed: 1, recovered: 0, raced: 1, failed: 0
    });
    assert.equal(calls, 1);
  });

  it('continues past one failed recovery without exposing its error or skipping later leases', async () => {
    const leases: ObservedTaskLease[] = ['task-poison', 'task-safe'].map((taskId) => ({
      tenantId: 'tenant-1', taskId, leaseOwnerId: 'worker-1',
      leaseToken: `lease-${taskId}`, leaseExpiresAt: at(30)
    }));
    const attempts: string[] = [];
    const repository = {
      listExpiredTaskLeases: async () => leases,
      recoverExpiredTask: async (lease: ObservedTaskLease) => {
        attempts.push(lease.taskId);
        if (lease.taskId === 'task-poison') throw new Error('sensitive internal failure');
        return { outcome: 'recovered', task: null };
      }
    } as unknown as NovelRepository;
    assert.deepEqual(await sweepExpiredNovelTasks(repository, at(30)), {
      observed: 2, recovered: 1, raced: 0, failed: 1
    });
    assert.deepEqual(attempts, ['task-poison', 'task-safe']);
  });

  it('runs immediately on start, never overlaps, and stops without leaving a timer', async () => {
    let resolveSweep!: () => void;
    const sweepStarted = new Promise<void>((resolve) => { resolveSweep = resolve; });
    let releaseRead!: () => void;
    const readHeld = new Promise<void>((resolve) => { releaseRead = resolve; });
    let calls = 0;
    let clockReads = 0;
    const repository = {
      getAuthoritativeTaskTime: async () => { clockReads += 1; return at(30); },
      listExpiredTaskLeases: async (now: Date) => {
        assert.equal(now.getTime(), at(30).getTime());
        calls += 1;
        resolveSweep();
        await readHeld;
        return [];
      }
    } as unknown as NovelRepository;
    const loop = createNovelRecoveryLoop({ repository, intervalMs: 1_000 });
    loop.start();
    loop.start();
    await sweepStarted;
    const stopping = loop.stop();
    releaseRead();
    await stopping;
    assert.equal(calls, 1);
    assert.equal(clockReads, 1);
  });

  it('rejects an unbounded sweep before reading the repository', async () => {
    let reads = 0;
    const repository = { listExpiredTaskLeases: async () => { reads += 1; return []; } } as unknown as NovelRepository;
    await assert.rejects(sweepExpiredNovelTasks(repository, at(30), 101), RangeError);
    assert.equal(reads, 0);
  });
});
