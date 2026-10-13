import type { NovelRepository } from '../domain/novelDomain.js';

export interface RecoverySweepResult {
  observed: number;
  recovered: number;
  raced: number;
  failed: number;
}

export async function sweepExpiredNovelTasks(
  repository: NovelRepository,
  authoritativeNow: Date,
  limit = 50
): Promise<RecoverySweepResult> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError('Recovery sweep limit must be between 1 and 100.');
  }
  const leases = await repository.listExpiredTaskLeases(authoritativeNow, limit);
  let recovered = 0;
  let failed = 0;
  for (const lease of leases) {
    try {
      const result = await repository.recoverExpiredTask(lease, authoritativeNow);
      if (result.outcome === 'recovered') recovered += 1;
    } catch {
      failed += 1;
    }
  }
  return { observed: leases.length, recovered, raced: leases.length - recovered - failed, failed };
}

export function createNovelRecoveryLoop(input: {
  repository: NovelRepository;
  now?: () => Date | Promise<Date>;
  intervalMs?: number;
  onSweep?: (result: RecoverySweepResult) => void;
  onError?: () => void;
}) {
  const intervalMs = input.intervalMs ?? 15_000;
  if (!Number.isInteger(intervalMs) || intervalMs < 1_000) throw new RangeError('Invalid recovery interval.');
  let active = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;

  const tick = () => {
    if (!active || running) return;
    running = (async () => {
      try {
        const authoritativeNow = await (input.now ?? (() => input.repository.getAuthoritativeTaskTime()))();
        const result = await sweepExpiredNovelTasks(input.repository, authoritativeNow);
        input.onSweep?.(result);
      } catch {
        input.onError?.();
      } finally {
        running = null;
        if (active) timer = setTimeout(tick, intervalMs);
      }
    })();
  };

  return {
    start() {
      if (active) return;
      active = true;
      tick();
    },
    async stop() {
      active = false;
      if (timer) clearTimeout(timer);
      timer = null;
      await running;
    }
  };
}
