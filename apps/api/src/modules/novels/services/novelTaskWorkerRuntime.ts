import { randomUUID } from 'node:crypto';
import type { GenerationTaskRecord, NovelRepository } from '../domain/novelDomain.js';

export interface NovelTaskWorkerScheduler {
  schedule(delayMs: number, callback: () => void): { cancel(): void };
}

export interface NovelTaskWorkerClock {
  // Production wiring must use the repository's authoritative database time.
  now(): Date | Promise<Date>;
}

export interface NovelTaskWorkerPolicy {
  workerConcurrency: number;
  leaseDurationMs: number;
  heartbeatIntervalMs: number;
  pollIntervalMs: number;
  shutdownGracePeriodMs: number;
}

export interface NovelTaskLeaseContext {
  task: GenerationTaskRecord;
  leaseOwnerId: string;
  leaseToken: string;
}

export type NovelTaskExecutionOutcome<TResult> =
  | { kind: 'fulfilled'; value: TResult }
  | { kind: 'rejected'; reason: unknown };

export interface NovelTaskWorkerRuntimeOptions<TResult> {
  repository: Pick<NovelRepository, 'leaseNextQueuedTask' | 'heartbeatTask'>;
  clock: NovelTaskWorkerClock;
  scheduler: NovelTaskWorkerScheduler;
  workerId: string;
  policy: NovelTaskWorkerPolicy;
  newLeaseToken?: () => string;
  // Pure execution boundary: no repository calls here. It may observe abort.
  execute(context: NovelTaskLeaseContext & { signal: AbortSignal }): Promise<TResult>;
  // The caller must implement one fenced, atomic terminal write using this lease.
  settle(context: NovelTaskLeaseContext & {
    authoritativeNow: Date;
    outcome: NovelTaskExecutionOutcome<TResult>;
  }): Promise<void>;
  onRuntimeError?: (stage: 'claim' | 'heartbeat' | 'settle') => void;
}

interface ActiveExecution {
  phase: 'running' | 'settling' | 'abandoned' | 'finished';
  task: GenerationTaskRecord;
  leaseToken: string;
  abortController: AbortController;
  heartbeatInFlight: boolean;
  heartbeatTimer: { cancel(): void } | null;
  leaseLost: boolean;
}

export function createSystemNovelTaskWorkerScheduler(): NovelTaskWorkerScheduler {
  return {
    schedule(delayMs, callback) {
      const timer = setTimeout(callback, delayMs);
      return { cancel: () => clearTimeout(timer) };
    }
  };
}

export class NovelTaskWorkerRuntime<TResult> {
  private state: 'idle' | 'running' | 'stopping' | 'stopped' = 'idle';
  private readonly active = new Set<ActiveExecution>();
  private pollTimer: { cancel(): void } | null = null;
  private graceTimer: { cancel(): void } | null = null;
  private pollInFlight = false;
  private graceElapsed = false;
  private stopPromise: Promise<void> | null = null;
  private resolveStop: (() => void) | null = null;

  constructor(private readonly options: NovelTaskWorkerRuntimeOptions<TResult>) {
    const { workerConcurrency, leaseDurationMs, heartbeatIntervalMs, pollIntervalMs, shutdownGracePeriodMs } = options.policy;
    if (!options.workerId.trim() || !Number.isInteger(workerConcurrency) || workerConcurrency < 1 ||
      !Number.isSafeInteger(leaseDurationMs) || leaseDurationMs < 1 ||
      !Number.isSafeInteger(heartbeatIntervalMs) || heartbeatIntervalMs < 1 ||
      heartbeatIntervalMs >= leaseDurationMs / 3 ||
      !Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1 ||
      !Number.isSafeInteger(shutdownGracePeriodMs) || shutdownGracePeriodMs < 0) {
      throw new Error('Invalid novel task worker policy');
    }
  }

  start(): void {
    if (this.state === 'running') return;
    if (this.state !== 'idle') throw new Error('Novel task worker runtime cannot restart');
    this.state = 'running';
    this.schedulePoll(0);
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    if (this.state === 'idle') {
      this.state = 'stopped';
      this.stopPromise = Promise.resolve();
      return this.stopPromise;
    }
    this.state = 'stopping';
    this.pollTimer?.cancel();
    this.pollTimer = null;
    this.stopPromise = new Promise<void>((resolve) => { this.resolveStop = resolve; });
    this.graceTimer = this.options.scheduler.schedule(this.options.policy.shutdownGracePeriodMs, () => {
      this.graceElapsed = true;
      for (const execution of [...this.active]) this.abandon(execution);
      this.maybeFinishStop();
    });
    this.maybeFinishStop();
    return this.stopPromise;
  }

  snapshot(): { state: string; active: number; polling: boolean } {
    return { state: this.state, active: this.active.size, polling: this.pollInFlight };
  }

  private schedulePoll(delayMs: number): void {
    if (this.state !== 'running' || this.pollTimer || this.pollInFlight ||
      this.active.size >= this.options.policy.workerConcurrency) return;
    this.pollTimer = this.options.scheduler.schedule(delayMs, () => {
      this.pollTimer = null;
      void this.poll();
    });
  }

  private async poll(): Promise<void> {
    if (this.state !== 'running' || this.pollInFlight) return;
    this.pollInFlight = true;
    try {
      while (this.state === 'running' && this.active.size < this.options.policy.workerConcurrency) {
        const now = await this.options.clock.now();
        const leaseToken = (this.options.newLeaseToken ?? randomUUID)();
        const task = await this.options.repository.leaseNextQueuedTask(
          this.options.workerId, leaseToken, now, new Date(now.getTime() + this.options.policy.leaseDurationMs)
        );
        if (!task) break;
        // A claim may finish after shutdown. Leave its lease to expire; never dispatch it.
        if (this.state !== 'running') break;
        if (task.leaseOwnerId !== this.options.workerId || task.leaseToken !== leaseToken ||
          !task.leaseExpiresAt || task.leaseExpiresAt.getTime() <= now.getTime()) {
          this.options.onRuntimeError?.('claim');
          break;
        }
        this.run(task, leaseToken);
      }
    } catch {
      this.options.onRuntimeError?.('claim');
    } finally {
      this.pollInFlight = false;
      this.schedulePoll(this.options.policy.pollIntervalMs);
      this.maybeFinishStop();
    }
  }

  private run(task: GenerationTaskRecord, leaseToken: string): void {
    const execution: ActiveExecution = {
      phase: 'running', task, leaseToken, abortController: new AbortController(),
      heartbeatInFlight: false, heartbeatTimer: null, leaseLost: false
    };
    this.active.add(execution);
    this.scheduleHeartbeat(execution);
    void this.executeAndSettle(execution);
  }

  private scheduleHeartbeat(execution: ActiveExecution): void {
    if (execution.heartbeatTimer || execution.heartbeatInFlight || execution.leaseLost ||
      (execution.phase !== 'running' && execution.phase !== 'settling')) return;
    execution.heartbeatTimer = this.options.scheduler.schedule(this.options.policy.heartbeatIntervalMs, () => {
      execution.heartbeatTimer = null;
      void this.heartbeat(execution);
    });
  }

  private async heartbeat(execution: ActiveExecution): Promise<void> {
    if (execution.heartbeatInFlight || execution.leaseLost ||
      (execution.phase !== 'running' && execution.phase !== 'settling')) return;
    execution.heartbeatInFlight = true;
    try {
      const now = await this.options.clock.now();
      if (execution.phase !== 'running' && execution.phase !== 'settling') return;
      const owned = await this.options.repository.heartbeatTask(
        execution.task.tenantId, execution.task.id, this.options.workerId, execution.leaseToken,
        now, new Date(now.getTime() + this.options.policy.leaseDurationMs)
      );
      if (!owned) this.loseLease(execution);
    } catch {
      this.options.onRuntimeError?.('heartbeat');
      this.loseLease(execution);
    } finally {
      execution.heartbeatInFlight = false;
      this.scheduleHeartbeat(execution);
    }
  }

  private loseLease(execution: ActiveExecution): void {
    execution.leaseLost = true;
    execution.abortController.abort();
    if (execution.phase === 'running') this.abandon(execution);
    // A settlement already in flight is fenced by its repository implementation.
  }

  private async executeAndSettle(execution: ActiveExecution): Promise<void> {
    const lease = {
      task: execution.task, leaseOwnerId: this.options.workerId, leaseToken: execution.leaseToken
    };
    let outcome: NovelTaskExecutionOutcome<TResult>;
    try {
      outcome = { kind: 'fulfilled', value: await this.options.execute({
        ...lease, signal: execution.abortController.signal
      }) };
    } catch (reason) {
      outcome = { kind: 'rejected', reason };
    }
    // This synchronous transition wins or loses against the shutdown deadline.
    if (execution.phase !== 'running' || execution.leaseLost) return;
    execution.phase = 'settling';
    try {
      const authoritativeNow = await this.options.clock.now();
      await this.options.settle({ ...lease, authoritativeNow, outcome });
    } catch {
      this.options.onRuntimeError?.('settle');
    } finally {
      execution.phase = 'finished';
      execution.heartbeatTimer?.cancel();
      execution.heartbeatTimer = null;
      this.active.delete(execution);
      this.schedulePoll(0);
      this.maybeFinishStop();
    }
  }

  private abandon(execution: ActiveExecution): void {
    if (execution.phase !== 'running') return;
    execution.phase = 'abandoned';
    execution.heartbeatTimer?.cancel();
    execution.heartbeatTimer = null;
    execution.abortController.abort();
    this.active.delete(execution);
    this.schedulePoll(0);
    this.maybeFinishStop();
  }

  private maybeFinishStop(): void {
    if (this.state !== 'stopping' || this.active.size > 0 ||
      (this.pollInFlight && !this.graceElapsed)) return;
    this.state = 'stopped';
    this.graceTimer?.cancel();
    this.graceTimer = null;
    this.resolveStop?.();
    this.resolveStop = null;
  }
}
