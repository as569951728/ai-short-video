import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TaskStatus } from '@ai-shortvideo/shared';
import { disconnectPrismaClient, getPrismaClient } from '../../src/infrastructure/database/prisma.js';
import { MockDirectionProvider } from '../../src/modules/novels/providers/mockDirectionProvider.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';
import { UNLEASED_TASK_STALE_AFTER_MS, sweepExpiredNovelTasks } from '../../src/modules/novels/services/recoveryScanner.js';
import { executeClaimedGeneration } from '../../src/modules/novels/services/taskClaim.js';

const url = process.env.E1_MYSQL_SMOKE_URL;
if (process.env.E1_UNLEASED_SMOKE !== 'true' || !url || process.env.DATABASE_URL !== url
  || process.env.NODE_ENV !== 'development' || process.env.AI_PROVIDER_MODE !== 'mock') {
  throw new Error('E1 unleased recovery smoke requires explicit development/mock test configuration.');
}
const target = new URL(url);
if (target.protocol !== 'mysql:' || !['127.0.0.1', 'localhost'].includes(target.hostname)
  || !/^\/ai_shortvideo_e1_[a-z0-9_]+$/.test(target.pathname)
  || !target.port || target.port === '3306' || target.search || target.hash
  || !/^e1_[a-z0-9_]+$/.test(target.username) || !target.password) {
  throw new Error('E1 unleased recovery smoke requires a dedicated loopback schema and account.');
}

const repository = new PrismaNovelRepository();
let releaseProvider = () => {};
try {
  const suffix = randomUUID();
  const context = { tenantId: `tenant-e1-unleased-${suffix.slice(0, 8)}`,
    userId: `user-e1-unleased-${suffix.slice(0, 8)}`, requestId: `req-e1-unleased-${suffix}` };
  const { novel } = await repository.createDraft({
    request: { title: 'E1 unleased inline recovery smoke' }, context, now: new Date()
  });
  const provider = new MockDirectionProvider();
  let providerCalls = 0;
  let resolveEntered!: () => void;
  const entered = new Promise<void>((resolve) => { resolveEntered = resolve; });
  const providerHeld = new Promise<void>((resolve) => { releaseProvider = resolve; });
  const execution = executeClaimedGeneration({
    action: 'direction_generate', repository, novel, idempotencyKey: `e1-unleased-${suffix}`,
    effectiveRequest: { regenerateReason: null }, sourceVersionRefs: { currentDirectionVersionId: null },
    context, now: () => new Date(), providerCapability: provider,
    provider: async () => {
      providerCalls += 1;
      resolveEntered();
      await providerHeld;
      return { late: true };
    },
    finalize: async () => { throw new Error('Late inline result must not reach finalization.'); }
  });
  const executionOutcome = execution.then(
    () => ({ rejected: false as const }),
    (error: unknown) => ({ rejected: true as const, error })
  );
  await Promise.race([
    entered,
    executionOutcome.then((outcome) => { throw outcome.rejected ? outcome.error : new Error('Provider was not entered.'); }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Provider entry timed out.')), 30_000).unref();
    })
  ]);
  const claimed = (await repository.listRecentTasksForNovel(context.tenantId, novel.id, 1))[0];
  assert.ok(claimed);
  assert.equal(claimed.status, TaskStatus.Processing);
  assert.equal(claimed.leaseOwnerId, null);
  assert.equal(claimed.providerCallBudgetMax, 0);
  assert.ok(claimed.providerDispatchedAt);
  assert.equal(providerCalls, 1);

  const beforeEvents = (await repository.listTaskEvents(context.tenantId, claimed.id)).length;
  const quietSince = new Date((await repository.getAuthoritativeTaskTime()).getTime()
    - UNLEASED_TASK_STALE_AFTER_MS - 60_000);
  await getPrismaClient().generationTask.updateMany({
    where: { tenantId: context.tenantId, id: claimed.id, status: 'PROCESSING' },
    data: { updatedAt: quietSince }
  });
  const firstSweep = await sweepExpiredNovelTasks(repository, await repository.getAuthoritativeTaskTime());
  assert.deepEqual(firstSweep, { observed: 1, recovered: 1, raced: 0, failed: 0 });
  releaseProvider();
  assert.equal((await executionOutcome).rejected, true);

  const failed = await repository.findTaskById(context.tenantId, claimed.id);
  assert.equal(failed?.status, TaskStatus.Failed);
  assert.equal(failed?.errorCode, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(failed?.activeClaimKey, null);
  assert.equal(providerCalls, 1);
  assert.equal(await getPrismaClient().creativeVersion.count({ where: {
    tenantId: context.tenantId, novelId: novel.id, sourceTaskId: claimed.id
  } }), 0);
  assert.equal((await repository.listTaskEvents(context.tenantId, claimed.id)).length, beforeEvents + 1);
  assert.equal(await getPrismaClient().operationLog.count({ where: {
    tenantId: context.tenantId, sourceTaskId: claimed.id, action: 'generation_task_recovered'
  } }), 1);
  assert.deepEqual(await sweepExpiredNovelTasks(repository, await repository.getAuthoritativeTaskTime()),
    { observed: 0, recovered: 0, raced: 0, failed: 0 });
  process.stdout.write(JSON.stringify({ result: 'passed', taskId: claimed.id,
    status: failed.status, errorCode: failed.errorCode, providerCalls,
    lateCandidateCount: 0, recoveryEvents: 1 }) + '\n');
} finally {
  releaseProvider();
  await disconnectPrismaClient();
}
