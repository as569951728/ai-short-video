import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TaskStatus } from '@ai-shortvideo/shared';
import { OpenAiCompatibleChatClient } from '../../src/modules/ai/openAiCompatibleClient.js';
import { disconnectPrismaClient, getPrismaClient } from '../../src/infrastructure/database/prisma.js';
import { createLeasedNovelProvidersFromEnv } from '../../src/modules/novels/providers/providerFactory.js';
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
let returnValidCandidate = false;
const client = new OpenAiCompatibleChatClient({
  baseUrl: 'https://model.invalid', apiKey: 'e1-test-only', timeoutMs: 10_000, maxRetries: 2,
  fetchImpl: async () => {
    httpCalls += 1;
    return new Response(JSON.stringify({ model: 'e1-model', choices: [{
      finish_reason: 'stop', message: { content: returnValidCandidate ? JSON.stringify({ candidates: [{
        title: '逆境反击', summary: '主角从低谷寻找证据并逐步反击。', score: 86,
        marketScore: 85, riskLevel: 'low', riskTags: [], recommendedReason: '主线与冲突清楚。',
        content: {
          title: '逆境反击', logline: '主角从低谷寻找证据并逐步反击。',
          coreHook: '第一次反击暴露更大的对手。', audienceAppeal: '都市逆袭读者',
          videoPotential: '开篇冲突可拆成短视频。', sellingPoints: ['证据反击'],
          riskTags: [], recommendation: '可以进入设定阶段。'
        }
      }] }) : '不是合法 JSON' }
    }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
});
const providers = createLeasedNovelProvidersFromEnv({
  env: { AI_PROVIDER_MODE: 'deepseek', DEEPSEEK_API_KEY: 'e1-test-only', DEEPSEEK_MODEL: 'e1-model' },
  llmClient: client
});
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
    durationDeadlineAt: new Date(now.getTime() + 15 * 60_000), providerCapability: providers.directionProvider
  });
  assert.equal(queued.task.status, TaskStatus.Queued);
  const worker = new NovelTaskWorkerRuntime({
    repository, clock: { now: () => repository.getAuthoritativeTaskTime() },
    scheduler: createSystemNovelTaskWorkerScheduler(), workerId: `e1-single-call-${suffix}`,
    policy: { workerConcurrency: 1, leaseDurationMs: 10_000, heartbeatIntervalMs: 1000,
      pollIntervalMs: 100, shutdownGracePeriodMs: 1000 },
    ...createLeasedActionExecutor({ repository, providers })
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

    returnValidCandidate = true;
    const secondNow = await repository.getAuthoritativeTaskTime();
    const successful = await claimQueuedGeneration({
      action: 'direction_generate', repository, novel, context,
      idempotencyKey: `e1-single-call-success-${suffix}`, effectiveRequest: { regenerateReason: null },
      sourceVersionRefs: { currentDirectionVersionId: null }, now: () => secondNow,
      durationDeadlineAt: new Date(secondNow.getTime() + 15 * 60_000),
      providerCapability: providers.directionProvider
    });
    let completed = successful.task;
    const successDeadline = Date.now() + 15_000;
    while (Date.now() < successDeadline) {
      const current = await repository.findTaskById(context.tenantId, completed.id);
      if (!current) throw new Error('Successful task disappeared.');
      completed = current;
      if (![TaskStatus.Queued, TaskStatus.Processing].includes(completed.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(completed.status, TaskStatus.WaitingConfirmation);
    assert.equal(completed.providerCallBudgetUsed, 1);
    assert.equal(httpCalls, 2);
    const candidateVersions = await getPrismaClient().creativeVersion.findMany({
      where: { tenantId: context.tenantId, sourceTaskId: completed.id }
    });
    assert.equal(candidateVersions.length, 1);
    assert.equal(candidateVersions[0]?.sourceType, 'deepseek');
    const currentNovel = await repository.findById(context.tenantId, novel.id);
    assert.equal(currentNovel?.currentDirectionVersionId, null);
    process.stdout.write(JSON.stringify({ result: 'passed', taskId: task.id,
      status: task.status, successfulTaskId: completed.id, successfulStatus: completed.status,
      httpCalls, providerCallBudgetUsed: task.providerCallBudgetUsed,
      candidateCount: candidateVersions.length, candidateSourceType: candidateVersions[0]?.sourceType }) + '\n');
  } finally {
    await worker.stop();
  }
} finally {
  await disconnectPrismaClient();
}
