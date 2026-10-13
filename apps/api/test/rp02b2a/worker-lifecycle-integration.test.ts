import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TaskStatus } from '@ai-shortvideo/shared';
import { MockBodyProvider } from '../../src/modules/novels/providers/mockBodyProvider.js';
import { MockDirectionProvider } from '../../src/modules/novels/providers/mockDirectionProvider.js';
import { MockFullReviewProvider } from '../../src/modules/novels/providers/mockFullReviewProvider.js';
import { MockStructureProvider } from '../../src/modules/novels/providers/mockStructureProvider.js';
import { MockTrialProvider } from '../../src/modules/novels/providers/mockTrialProvider.js';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';
import { claimQueuedGeneration } from '../../src/modules/novels/services/taskClaim.js';
import { createLeasedActionExecutor } from '../../src/modules/novels/services/leasedActionExecutor.js';
import { NovelTaskWorkerRuntime, type NovelTaskWorkerScheduler } from '../../src/modules/novels/services/novelTaskWorkerRuntime.js';
import { sweepExpiredNovelTasks } from '../../src/modules/novels/services/recoveryScanner.js';

const baseMs = Date.UTC(2030, 0, 1);

class Scheduler implements NovelTaskWorkerScheduler {
  nowMs = 0;
  private timers: Array<{ at: number; run: () => void; cancelled: boolean }> = [];

  schedule(delayMs: number, run: () => void) {
    const timer = { at: this.nowMs + delayMs, run, cancelled: false };
    this.timers.push(timer);
    return { cancel: () => { timer.cancelled = true; } };
  }

  async flush() {
    for (let index = 0; index < 50; index += 1) await Promise.resolve();
  }

  async advance(ms: number) {
    const target = this.nowMs + ms;
    for (let index = 0; index < 1000; index += 1) {
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
      next.run();
    }
    throw new Error('Worker scheduler did not quiesce');
  }
}

async function harness(providerGate?: Promise<void>) {
  const scheduler = new Scheduler();
  const at = (ms: number) => new Date(baseMs + ms);
  const repository = createInMemoryNovelRepository();
  repository.getLeasedExecutionCapability = async (taskType) => taskType === 'novel_direction_generate' ? 'enabled' : 'unsupported';
  repository.getAuthoritativeTaskTime = async () => at(scheduler.nowMs);
  const context = { tenantId: 'tenant-worker-flow', userId: 'user-worker-flow', requestId: 'request-worker-flow' };
  const { novel } = await repository.createDraft({ request: { title: '后台任务恢复验收' }, context, now: at(0) });
  const directionProvider = new MockDirectionProvider();
  const generate = directionProvider.generateCandidates.bind(directionProvider);
  let calls = 0;
  directionProvider.generateCandidates = async (input) => {
    calls += 1;
    await providerGate;
    return generate(input);
  };
  const queued = await claimQueuedGeneration({
    action: 'direction_generate', repository, novel, context,
    idempotencyKey: 'worker-flow-submission-0001', effectiveRequest: { regenerateReason: null },
    sourceVersionRefs: { currentDirectionVersionId: null }, now: () => at(scheduler.nowMs),
    durationDeadlineAt: at(1000), providerCapability: directionProvider
  });
  const createWorker = (id: string) => new NovelTaskWorkerRuntime({
    repository, scheduler, clock: { now: () => at(scheduler.nowMs) }, workerId: id,
    policy: { workerConcurrency: 1, leaseDurationMs: 100, heartbeatIntervalMs: 20,
      pollIntervalMs: 10, shutdownGracePeriodMs: 10 },
    ...createLeasedActionExecutor({ repository, providers: {
      directionProvider, structureProvider: new MockStructureProvider(), trialProvider: new MockTrialProvider(),
      bodyProvider: new MockBodyProvider(), fullReviewProvider: new MockFullReviewProvider()
    } })
  });
  return { repository, scheduler, at, queued: queued.task, createWorker, get calls() { return calls; } };
}

describe('queued claim through real worker callbacks', () => {
  it('claims, dispatches once and persists a candidate without waiting in the submitter', async () => {
    const h = await harness();
    assert.equal(h.queued.status, TaskStatus.Queued);
    assert.equal(h.calls, 0);
    const worker = h.createWorker('worker-complete');
    worker.start();
    await h.scheduler.advance(0);
    assert.equal(h.calls, 1);
    assert.equal(h.queued.status, TaskStatus.WaitingConfirmation);
    assert.equal(h.queued.providerCallBudgetUsed, 1);
    assert.ok(h.queued.resultReceiptHash);
    assert.equal(h.repository.getCreativeVersions().filter((version) => version.sourceTaskId === h.queued.id).length, 4);
    await worker.stop();
  });

  it('recovers an interrupted paid call as outcome unknown and never dispatches it again', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const h = await harness(gate);
    const worker = h.createWorker('worker-before-restart');
    worker.start();
    await h.scheduler.advance(0);
    assert.equal(h.calls, 1);
    assert.equal(h.queued.providerCallBudgetUsed, 1);
    const stopping = worker.stop();
    await h.scheduler.advance(10);
    await stopping;
    await h.scheduler.advance(90);
    const recovery = await sweepExpiredNovelTasks(h.repository, h.at(100));
    assert.equal(recovery.recovered, 1);
    assert.equal(h.queued.status, TaskStatus.Failed);
    assert.equal(h.queued.errorCode, 'PROVIDER_OUTCOME_UNKNOWN');
    const restarted = h.createWorker('worker-after-restart');
    restarted.start();
    await h.scheduler.advance(0);
    assert.equal(h.calls, 1);
    release();
    await h.scheduler.flush();
    assert.equal(h.repository.getCreativeVersions().filter((version) => version.sourceTaskId === h.queued.id).length, 0);
    await restarted.stop();
  });
});
