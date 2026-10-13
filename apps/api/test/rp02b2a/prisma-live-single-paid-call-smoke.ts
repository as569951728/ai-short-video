import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TaskStatus } from '@ai-shortvideo/shared';
import { OpenAiCompatibleChatClient } from '../../src/modules/ai/openAiCompatibleClient.js';
import { disconnectPrismaClient, getPrismaClient } from '../../src/infrastructure/database/prisma.js';
import { DeepSeekNovelProvider } from '../../src/modules/novels/providers/deepseekNovelProvider.js';
import { MockBodyProvider } from '../../src/modules/novels/providers/mockBodyProvider.js';
import { MockFullReviewProvider } from '../../src/modules/novels/providers/mockFullReviewProvider.js';
import { MockStructureProvider } from '../../src/modules/novels/providers/mockStructureProvider.js';
import { MockTrialProvider } from '../../src/modules/novels/providers/mockTrialProvider.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';
import { createLeasedActionExecutor } from '../../src/modules/novels/services/leasedActionExecutor.js';
import { NovelTaskWorkerRuntime, createSystemNovelTaskWorkerScheduler } from '../../src/modules/novels/services/novelTaskWorkerRuntime.js';
import { claimQueuedGeneration } from '../../src/modules/novels/services/taskClaim.js';

const url = process.env.E1_MYSQL_SMOKE_URL;
if (!url || process.env.DATABASE_URL !== url) throw new Error('Set matching E1_MYSQL_SMOKE_URL and DATABASE_URL.');
const target = new URL(url);
if (target.protocol !== 'mysql:' || !['127.0.0.1', 'localhost'].includes(target.hostname)
  || !/^\/ai_shortvideo_e1_[a-z0-9_]+$/.test(target.pathname)
  || !target.port || target.port === '3306' || target.search || target.hash
  || !target.username || !target.password) {
  throw new Error('E1 paid-call smoke requires a dedicated loopback test schema and non-default port.');
}

class IsolatedPrismaRepository extends PrismaNovelRepository {
  override async getLeasedExecutionCapability(taskType: string) {
    return taskType === 'novel_direction_generate' ? 'enabled' as const : super.getLeasedExecutionCapability(taskType);
  }
}

const repository = new IsolatedPrismaRepository();
let httpCalls = 0;
const client = new OpenAiCompatibleChatClient({
  baseUrl: 'https://model.invalid', apiKey: 'e1-test-only', timeoutMs: 10_000, maxRetries: 2,
  fetchImpl: async () => {
    httpCalls += 1;
    return new Response(JSON.stringify({ model: 'e1-model', choices: [{
      finish_reason: 'stop', message: { content: '不是合法 JSON' }
    }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
});
const directionProvider = new DeepSeekNovelProvider({ client, model: 'e1-model', singlePaidCallMode: true });
const suffix = randomUUID();
const context = { tenantId: `tenant-e1-${suffix.slice(0, 8)}`,
  userId: `user-e1-${suffix.slice(0, 8)}`, requestId: `req-e1-${suffix}` };

try {
  const { novel } = await repository.createDraft({
    request: { title: 'E1 single paid-call MySQL smoke' }, context, now: new Date()
  });
  const now = await repository.getAuthoritativeTaskTime();
  const queued = await claimQueuedGeneration({
    action: 'direction_generate', repository, novel, context,
    idempotencyKey: `e1-single-call-${suffix}`, effectiveRequest: { regenerateReason: null },
    sourceVersionRefs: { currentDirectionVersionId: null }, now: () => now,
    durationDeadlineAt: new Date(now.getTime() + 15 * 60_000), providerCapability: directionProvider
  });
  assert.equal(queued.task.status, TaskStatus.Queued);
  const worker = new NovelTaskWorkerRuntime({
    repository, clock: { now: () => repository.getAuthoritativeTaskTime() },
    scheduler: createSystemNovelTaskWorkerScheduler(), workerId: `e1-single-call-${suffix}`,
    policy: { workerConcurrency: 1, leaseDurationMs: 10_000, heartbeatIntervalMs: 1000,
      pollIntervalMs: 100, shutdownGracePeriodMs: 1000 },
    ...createLeasedActionExecutor({ repository, providers: {
      directionProvider, structureProvider: new MockStructureProvider(),
      trialProvider: new MockTrialProvider(), bodyProvider: new MockBodyProvider(),
      fullReviewProvider: new MockFullReviewProvider()
    } })
  });
  try {
    worker.start();
    let task = queued.task;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const current = await repository.findTaskById(context.tenantId, task.id);
      if (!current) throw new Error('Queued task disappeared.');
      task = current;
      if (![TaskStatus.Queued, TaskStatus.Processing].includes(task.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(task.status, TaskStatus.Failed);
    assert.equal(task.errorCode, 'PROVIDER_ERROR');
    assert.equal(task.providerCallBudgetUsed, 1);
    assert.equal(httpCalls, 1);
    assert.equal(await getPrismaClient().creativeVersion.count({
      where: { tenantId: context.tenantId, sourceTaskId: task.id }
    }), 0);
    const events = await repository.listTaskEvents(context.tenantId, task.id);
    assert.equal(events.filter((event) => event.eventType === 'task_failed').length, 1);
    assert.equal(await repository.leaseNextQueuedTask('e1-replay-check', randomUUID(),
      await repository.getAuthoritativeTaskTime(), new Date(Date.now() + 10_000)), null);
    process.stdout.write(JSON.stringify({ result: 'passed', taskId: task.id,
      status: task.status, httpCalls, providerCallBudgetUsed: task.providerCallBudgetUsed,
      candidateCount: 0 }) + '\n');
  } finally {
    await worker.stop();
  }
} finally {
  await disconnectPrismaClient();
}
