import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TaskStatus } from '@ai-shortvideo/shared';
import { OpenAiCompatibleChatClient } from '../../src/modules/ai/openAiCompatibleClient.js';
import type { ChatCompletionUsage, LlmClient } from '../../src/modules/ai/llmClient.js';
import { disconnectPrismaClient, getPrismaClient } from '../../src/infrastructure/database/prisma.js';
import { createLeasedNovelProvidersFromEnv } from '../../src/modules/novels/providers/providerFactory.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';
import { createLeasedActionExecutor } from '../../src/modules/novels/services/leasedActionExecutor.js';
import { NovelTaskWorkerRuntime, createSystemNovelTaskWorkerScheduler } from '../../src/modules/novels/services/novelTaskWorkerRuntime.js';
import { claimQueuedGeneration } from '../../src/modules/novels/services/taskClaim.js';

if (process.env.E1_REAL_MODEL_SMOKE !== 'true') {
  throw new Error('Real-model smoke requires E1_REAL_MODEL_SMOKE=true.');
}
const databaseUrl = process.env.E1_MYSQL_SMOKE_URL;
if (!databaseUrl || process.env.DATABASE_URL !== databaseUrl) {
  throw new Error('Set matching E1_MYSQL_SMOKE_URL and DATABASE_URL.');
}
const database = new URL(databaseUrl);
if (database.protocol !== 'mysql:' || !['127.0.0.1', 'localhost'].includes(database.hostname)
  || !/^\/ai_shortvideo_e1_[a-z0-9_]+$/.test(database.pathname)
  || !database.port || database.port === '3306' || database.search || database.hash
  || !database.username || !database.password) {
  throw new Error('Real-model smoke requires a dedicated loopback E1 schema and non-default port.');
}
const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
const baseUrl = process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com';
const model = process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-v4-pro';
if (!apiKey || new URL(baseUrl).protocol !== 'https:' || new URL(baseUrl).hostname !== 'api.deepseek.com') {
  throw new Error('Real-model smoke requires a configured DeepSeek key and the official HTTPS host.');
}

class IsolatedPrismaRepository extends PrismaNovelRepository {
  override async getLeasedExecutionCapability(taskType: string) {
    return taskType === 'novel_direction_generate' ? 'enabled' as const
      : super.getLeasedExecutionCapability(taskType);
  }
}

let httpCalls = 0;
let usage: ChatCompletionUsage | undefined;
const rawClient = new OpenAiCompatibleChatClient({
  baseUrl, apiKey, timeoutMs: 360_000, maxRetries: 0,
  fetchImpl: async (input, init) => {
    httpCalls += 1;
    if (httpCalls !== 1) throw new Error('Real-model smoke attempted a second HTTP request.');
    return fetch(input, { ...init, redirect: 'error' });
  }
});
const observedClient: LlmClient = {
  async chat(request) {
    assert.equal(request.maxRetries, 0, 'Leased provider must disable transport retries.');
    const result = await rawClient.chat({ ...request, maxTokens: Math.min(request.maxTokens ?? 4096, 4096) });
    usage = result.usage;
    return result;
  }
};
const providers = createLeasedNovelProvidersFromEnv({
  env: { AI_PROVIDER_MODE: 'deepseek', DEEPSEEK_API_KEY: apiKey,
    DEEPSEEK_BASE_URL: baseUrl, DEEPSEEK_MODEL: model,
    DEEPSEEK_STRUCTURE_MODEL: model, DEEPSEEK_REASONER_MODEL: model,
    DEEPSEEK_TIMEOUT_MS: '360000', DEEPSEEK_MAX_RETRIES: '0' },
  llmClient: observedClient
});
const repository = new IsolatedPrismaRepository();
const suffix = randomUUID();
const context = { tenantId: `tenant-e1-real-${suffix.slice(0, 8)}`,
  userId: `user-e1-real-${suffix.slice(0, 8)}`, requestId: `req-e1-real-${suffix}` };

try {
  const { novel } = await repository.createDraft({
    request: { title: '都市重生逆袭单次调用验收', genres: ['都市逆袭', '重生'],
      preferences: { appealPoints: ['低谷反击'], targetAudience: '成年读者' },
      chapterLimit: 12, chapterWordRange: { min: 1200, max: 1600 } },
    context, now: new Date()
  });
  const now = await repository.getAuthoritativeTaskTime();
  const queued = await claimQueuedGeneration({
    action: 'direction_generate', repository, novel, context,
    idempotencyKey: `e1-real-once-${suffix}`, effectiveRequest: { regenerateReason: null },
    sourceVersionRefs: { currentDirectionVersionId: null }, now: () => now,
    durationDeadlineAt: new Date(now.getTime() + 8 * 60_000),
    providerCapability: providers.directionProvider
  });
  assert.equal(queued.task.status, TaskStatus.Queued);
  const worker = new NovelTaskWorkerRuntime({
    repository, clock: { now: () => repository.getAuthoritativeTaskTime() },
    scheduler: createSystemNovelTaskWorkerScheduler(), workerId: `e1-real-${suffix}`,
    policy: { workerConcurrency: 1, leaseDurationMs: 60_000,
      heartbeatIntervalMs: 10_000, pollIntervalMs: 500, shutdownGracePeriodMs: 1000 },
    ...createLeasedActionExecutor({ repository, providers })
  });
  try {
    worker.start();
    let task = queued.task;
    const deadline = Date.now() + 7 * 60_000;
    while (Date.now() < deadline) {
      const current = await repository.findTaskById(context.tenantId, task.id);
      if (!current) throw new Error('Real-model task disappeared.');
      task = current;
      if (![TaskStatus.Queued, TaskStatus.Processing].includes(task.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.equal(httpCalls, 1);
    assert.equal(task.providerCallBudgetUsed, 1);
    assert.equal(task.status, TaskStatus.WaitingConfirmation,
      `Real-model task ended at ${task.status}; errorCode=${task.errorCode ?? 'none'}.`);
    assert.ok(task.resultReceiptHash);
    const candidates = await getPrismaClient().creativeVersion.findMany({
      where: { tenantId: context.tenantId, novelId: novel.id, sourceTaskId: task.id }
    });
    assert.ok(candidates.length >= 1 && candidates.length <= 10);
    assert.ok(candidates.every((candidate) => candidate.status === 'CANDIDATE'
      && candidate.sourceType === 'deepseek'));
    assert.equal((await repository.findById(context.tenantId, novel.id))?.currentDirectionVersionId, null);
    assert.equal((await repository.listTaskEvents(context.tenantId, task.id))
      .filter((event) => event.eventType === 'task_finalized').length, 1);
    process.stdout.write(JSON.stringify({ result: 'passed', taskId: task.id,
      status: task.status, httpCalls, providerCallBudgetUsed: task.providerCallBudgetUsed,
      candidateCount: candidates.length, promptTokens: usage?.promptTokens ?? null,
      completionTokens: usage?.completionTokens ?? null, totalTokens: usage?.totalTokens ?? null }) + '\n');
  } finally {
    await worker.stop();
  }
} finally {
  await disconnectPrismaClient();
}
