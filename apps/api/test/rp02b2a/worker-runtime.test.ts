import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GenerationTaskRecord } from '../../src/modules/novels/domain/novelDomain.js';
import {
  NovelTaskWorkerRuntime,
  type NovelTaskWorkerScheduler
} from '../../src/modules/novels/services/novelTaskWorkerRuntime.js';

class Deferred<T> {
  readonly promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (reason: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

class ManualScheduler implements NovelTaskWorkerScheduler {
  nowMs = 0;
  private timers: Array<{ at: number; callback: () => void; cancelled: boolean }> = [];

  schedule(delayMs: number, callback: () => void): { cancel(): void } {
    const timer = { at: this.nowMs + delayMs, callback, cancelled: false };
    this.timers.push(timer);
    return { cancel: () => { timer.cancelled = true; } };
  }

  async flush(): Promise<void> {
    for (let index = 0; index < 20; index += 1) await Promise.resolve();
  }

  async advance(ms: number): Promise<void> {
    const target = this.nowMs + ms;
    for (let count = 0; count < 1000; count += 1) {
      await this.flush();
      const next = this.timers.filter((timer) => !timer.cancelled && timer.at <= target)
        .sort((left, right) => left.at - right.at)[0];
      if (!next) {
        this.nowMs = target;
        await this.flush();
        return;
      }
      this.timers.splice(this.timers.indexOf(next), 1);
      this.nowMs = next.at;
      next.callback();
    }
    throw new Error('Manual scheduler did not quiesce');
  }
}

function task(id = 'task-1'): GenerationTaskRecord {
  return { id, tenantId: 'tenant-1', leaseOwnerId: null, leaseToken: null,
    leaseExpiresAt: null } as GenerationTaskRecord;
}

function harness(overrides: {
  execute?: (signal: AbortSignal) => Promise<string>;
  settle?: () => Promise<void>;
  heartbeat?: () => Promise<boolean>;
  graceMs?: number;
  concurrency?: number;
} = {}) {
  const scheduler = new ManualScheduler();
  const queued = [task()];
  const claimed: string[] = [];
  const heartbeats: number[] = [];
  const settled: string[] = [];
  const signals: AbortSignal[] = [];
  const execution = new Deferred<string>();
  const repository = {
    async leaseNextQueuedTask(owner: string, token: string, now: Date, until: Date) {
      const next = queued.shift() ?? null;
      if (next) {
        next.leaseOwnerId = owner;
        next.leaseToken = token;
        next.leaseExpiresAt = until;
        claimed.push(next.id);
      }
      assert.equal(now.getTime(), scheduler.nowMs);
      return next;
    },
    async heartbeatTask(_tenant: string, _task: string, _owner: string, _token: string,
      now: Date, _until: Date) {
      heartbeats.push(now.getTime());
      return overrides.heartbeat ? overrides.heartbeat() : true;
    }
  };
  const runtime = new NovelTaskWorkerRuntime<string>({
    repository,
    clock: { now: () => new Date(scheduler.nowMs) },
    scheduler,
    workerId: 'worker-1',
    newLeaseToken: () => 'lease-1',
    policy: { workerConcurrency: overrides.concurrency ?? 1, leaseDurationMs: 90,
      heartbeatIntervalMs: 10, pollIntervalMs: 100, shutdownGracePeriodMs: overrides.graceMs ?? 50 },
    execute: ({ signal }) => {
      signals.push(signal);
      return overrides.execute ? overrides.execute(signal) : execution.promise;
    },
    settle: async ({ outcome }) => {
      settled.push(outcome.kind);
      await overrides.settle?.();
    }
  });
  return { runtime, scheduler, queued, claimed, heartbeats, settled, signals, execution };
}

describe('novel task worker runtime (injected execute/settle only)', () => {
  it('polls queued work, claims once, and settles once after execution', async () => {
    const h = harness();
    h.runtime.start();
    await h.scheduler.advance(0);
    assert.deepEqual(h.claimed, ['task-1']);
    assert.equal(h.runtime.snapshot().active, 1);
    assert.deepEqual(h.settled, []);
    h.execution.resolve('validated');
    await h.scheduler.flush();
    assert.deepEqual(h.settled, ['fulfilled']);
    assert.equal(h.runtime.snapshot().active, 0);
    await h.runtime.stop();
  });

  it('serializes heartbeats and never starts another while one is pending', async () => {
    const first = new Deferred<boolean>();
    let calls = 0;
    const h = harness({ heartbeat: () => (++calls === 1 ? first.promise : Promise.resolve(true)) });
    h.runtime.start();
    await h.scheduler.advance(0);
    await h.scheduler.advance(10);
    assert.equal(calls, 1);
    await h.scheduler.advance(25);
    assert.equal(calls, 1);
    first.resolve(true);
    await h.scheduler.flush();
    await h.scheduler.advance(10);
    assert.equal(calls, 2);
    h.execution.resolve('done');
    await h.scheduler.flush();
    await h.runtime.stop();
  });

  it('aborts on lease loss and drops a provider result without settling', async () => {
    const h = harness({ heartbeat: async () => false });
    h.runtime.start();
    await h.scheduler.advance(0);
    await h.scheduler.advance(10);
    assert.equal(h.signals[0]?.aborted, true);
    assert.equal(h.runtime.snapshot().active, 0);
    h.execution.resolve('late paid result');
    await h.scheduler.flush();
    assert.deepEqual(h.settled, []);
    await h.runtime.stop();
  });

  it('keeps heartbeats through grace, then abandons and never settles a late result', async () => {
    const h = harness({ graceMs: 35 });
    h.runtime.start();
    await h.scheduler.advance(0);
    const stopping = h.runtime.stop();
    await h.scheduler.advance(30);
    assert.deepEqual(h.heartbeats, [10, 20, 30]);
    assert.equal(h.signals[0]?.aborted, false);
    await h.scheduler.advance(5);
    await stopping;
    assert.equal(h.signals[0]?.aborted, true);
    assert.equal(h.runtime.snapshot().state, 'stopped');
    h.execution.resolve('late result');
    await h.scheduler.flush();
    await h.scheduler.advance(100);
    assert.deepEqual(h.settled, []);
    assert.deepEqual(h.heartbeats, [10, 20, 30]);
  });

  it('does not schedule another heartbeat or settle after grace beats an in-flight heartbeat', async () => {
    const heartbeat = new Deferred<boolean>();
    const h = harness({ heartbeat: () => heartbeat.promise, graceMs: 20 });
    h.runtime.start();
    await h.scheduler.advance(0);
    await h.scheduler.advance(10);
    const stopping = h.runtime.stop();
    await h.scheduler.advance(20);
    await stopping;
    assert.equal(h.signals[0]?.aborted, true);
    heartbeat.resolve(true);
    h.execution.resolve('late result');
    await h.scheduler.flush();
    await h.scheduler.advance(100);
    assert.deepEqual(h.heartbeats, [10]);
    assert.deepEqual(h.settled, []);
  });

  it('waits for the single fenced settlement when settlement wins the grace race', async () => {
    const settlement = new Deferred<void>();
    const h = harness({ settle: () => settlement.promise, graceMs: 20 });
    h.runtime.start();
    await h.scheduler.advance(0);
    h.execution.resolve('ready');
    await h.scheduler.flush();
    assert.deepEqual(h.settled, ['fulfilled']);
    const stopping = h.runtime.stop();
    await h.scheduler.advance(20);
    assert.equal(h.runtime.snapshot().state, 'stopping');
    assert.equal(h.signals[0]?.aborted, false);
    assert.deepEqual(h.heartbeats, [10, 20]);
    settlement.resolve();
    await stopping;
    assert.equal(h.runtime.snapshot().state, 'stopped');
    assert.deepEqual(h.settled, ['fulfilled']);
  });

  it('settles a provider rejection once while the lease remains owned', async () => {
    const h = harness();
    h.runtime.start();
    await h.scheduler.advance(0);
    h.execution.reject(new Error('provider failed'));
    await h.scheduler.flush();
    assert.deepEqual(h.settled, ['rejected']);
    await h.runtime.stop();
  });

  it('does not dispatch a claim that returns after shutdown', async () => {
    const scheduler = new ManualScheduler();
    const claimed = new Deferred<GenerationTaskRecord | null>();
    let executions = 0;
    let settlements = 0;
    const runtime = new NovelTaskWorkerRuntime<string>({
      repository: {
        leaseNextQueuedTask: () => claimed.promise,
        heartbeatTask: async () => true
      },
      clock: { now: () => new Date(scheduler.nowMs) }, scheduler, workerId: 'worker-1',
      policy: { workerConcurrency: 1, leaseDurationMs: 90, heartbeatIntervalMs: 10,
        pollIntervalMs: 100, shutdownGracePeriodMs: 20 },
      execute: async () => { executions += 1; return 'done'; },
      settle: async () => { settlements += 1; }
    });
    runtime.start();
    await scheduler.advance(0);
    assert.equal(runtime.snapshot().polling, true);
    const stopping = runtime.stop();
    await scheduler.advance(20);
    await stopping;
    claimed.resolve(task());
    await scheduler.flush();
    assert.equal(executions, 0);
    assert.equal(settlements, 0);
    assert.equal(runtime.snapshot().state, 'stopped');
  });

  it('rejects unsafe timing policies before starting any work', () => {
    const h = harness();
    assert.throws(() => new NovelTaskWorkerRuntime({
      repository: {
        leaseNextQueuedTask: async () => null,
        heartbeatTask: async () => true
      }, clock: { now: () => new Date(0) }, scheduler: h.scheduler, workerId: 'worker-1',
      policy: { workerConcurrency: 1, leaseDurationMs: 30, heartbeatIntervalMs: 10,
        pollIntervalMs: 1, shutdownGracePeriodMs: 0 },
      execute: async () => 'done', settle: async () => undefined
    }), /Invalid novel task worker policy/);
  });

  it('treats shutdown before start as idempotent and never starts afterward', async () => {
    const h = harness();
    const first = h.runtime.stop();
    assert.equal(h.runtime.stop(), first);
    await first;
    assert.throws(() => h.runtime.start(), /cannot restart/);
    await h.scheduler.advance(100);
    assert.deepEqual(h.claimed, []);
  });
});
