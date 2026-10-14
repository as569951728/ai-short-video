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
import { NovelService } from '../../src/modules/novels/services/novelService.js';
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
const action = process.env.E1_REAL_MODEL_ACTION || 'direction_generate';
if (!['direction_generate', 'setting_generate', 'outline_generate', 'stage_outline_generate'].includes(action)) {
  throw new Error('Real-model smoke supports only direction, setting, outline, or stage-outline generation.');
}

class IsolatedPrismaRepository extends PrismaNovelRepository {
  override async getLeasedExecutionCapability(taskType: string) {
    const expectedType = action === 'stage_outline_generate' ? 'stage_outline_generate'
      : action === 'outline_generate' ? 'novel_outline_generate'
      : action === 'setting_generate' ? 'novel_setting_generate' : 'novel_direction_generate';
    return taskType === expectedType
      ? 'enabled' as const
      : super.getLeasedExecutionCapability(taskType);
  }
}

let httpCalls = 0;
let httpStatus: number | null = null;
let usage: ChatCompletionUsage | undefined;
let responseEvidence: { finishReason: string | null; contentCharacters: number;
  reasoningCharacters: number; promptTokens: number | null; completionTokens: number | null } | null = null;
const rawClient = new OpenAiCompatibleChatClient({
  baseUrl, apiKey, timeoutMs: 360_000, maxRetries: 0,
  fetchImpl: async (input, init) => {
    httpCalls += 1;
    if (httpCalls !== 1) throw new Error('Real-model smoke attempted a second HTTP request.');
    const response = await fetch(input, { ...init, redirect: 'error' });
    httpStatus = response.status;
    if (response.ok) {
      const payload = await response.clone().json().catch(() => null) as {
        choices?: Array<{ finish_reason?: string; message?: { content?: string;
          reasoning_content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      } | null;
      responseEvidence = {
        finishReason: payload?.choices?.[0]?.finish_reason ?? null,
        contentCharacters: payload?.choices?.[0]?.message?.content?.length ?? 0,
        reasoningCharacters: payload?.choices?.[0]?.message?.reasoning_content?.length ?? 0,
        promptTokens: payload?.usage?.prompt_tokens ?? null,
        completionTokens: payload?.usage?.completion_tokens ?? null
      };
    }
    return response;
  }
});
const observedClient: LlmClient = {
  async chat(request) {
    assert.equal(request.maxRetries, 0, 'Leased provider must disable transport retries.');
    const tokenCap = 4096;
    const result = await rawClient.chat({ ...request, maxTokens: Math.min(request.maxTokens ?? tokenCap, tokenCap) });
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
  if (action !== 'direction_generate') {
    const setup = new NovelService({ repository });
    await setup.generateDirections(novel.id, { idempotencyKey: `e1-real-seed-${suffix}` }, context);
    const directions = await repository.listDirectionVersions(context.tenantId, novel.id);
    const seed = directions.find((version) => version.status === 'candidate'
      && (version.score ?? 0) >= 70);
    assert.ok(seed, 'Mock direction setup did not produce an adoptable candidate.');
    await setup.adoptDirection(novel.id, seed.id, {
      idempotencyKey: `e1-real-seed-adopt-${suffix}`, currentVersionId: null
    }, context);
    if (action === 'outline_generate' || action === 'stage_outline_generate') {
      await setup.generateSetting(novel.id, { idempotencyKey: `e1-real-seed-setting-${suffix}` }, context);
      const settings = await repository.listStructureVersions(context.tenantId, novel.id);
      const setting = settings.find((version) => version.objectType === 'setting'
        && version.status === 'candidate');
      assert.ok(setting, 'Mock setting setup did not produce an adoptable candidate.');
      await setup.adoptSetting(novel.id, setting.id, { currentVersionId: null }, context);
    }
    if (action === 'stage_outline_generate') {
      await setup.generateOutline(novel.id, { idempotencyKey: `e1-real-seed-outline-${suffix}` }, context);
      const outlines = await repository.listStructureVersions(context.tenantId, novel.id);
      const outline = outlines.find((version) => version.objectType === 'outline'
        && version.status === 'candidate');
      assert.ok(outline, 'Mock outline setup did not produce an adoptable candidate.');
      await setup.adoptOutline(novel.id, outline.id, { currentVersionId: null }, context);
    }
  }
  const now = await repository.getAuthoritativeTaskTime();
  const queued = action === 'stage_outline_generate'
    ? await new NovelService({ repository, structureProvider: providers.structureProvider })
      .queueStageOutline(novel.id, { idempotencyKey: `e1-real-once-${suffix}` }, context, now)
    : action === 'outline_generate'
    ? await new NovelService({ repository, structureProvider: providers.structureProvider })
      .queueOutline(novel.id, { idempotencyKey: `e1-real-once-${suffix}` }, context, now)
    : action === 'setting_generate'
    ? await new NovelService({ repository, structureProvider: providers.structureProvider })
      .queueSetting(novel.id, { idempotencyKey: `e1-real-once-${suffix}` }, context, now)
    : await claimQueuedGeneration({
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
    if (task.status !== TaskStatus.WaitingConfirmation) {
      process.stdout.write(JSON.stringify({ result: 'failed', action, taskId: task.id,
        status: task.status, errorCode: task.errorCode, httpStatus, httpCalls,
        providerCallBudgetUsed: task.providerCallBudgetUsed,
        responseEvidence }) + '\n');
    }
    assert.equal(task.status, TaskStatus.WaitingConfirmation,
      `Real-model task ended at ${task.status}; errorCode=${task.errorCode ?? 'none'}.`);
    assert.ok(task.resultReceiptHash);
    const candidates = await getPrismaClient().creativeVersion.findMany({
      where: { tenantId: context.tenantId, novelId: novel.id, sourceTaskId: task.id }
    });
    assert.ok(candidates.length >= 1 && candidates.length <= (action === 'direction_generate' ? 10 : 5));
    assert.ok(candidates.every((candidate) => candidate.status === 'CANDIDATE'
      && candidate.sourceType === 'deepseek'
      && candidate.objectType === (action === 'stage_outline_generate' ? 'stage_outline'
        : action === 'outline_generate' ? 'outline'
        : action === 'setting_generate' ? 'setting' : 'direction')));
    const currentNovel = await repository.findById(context.tenantId, novel.id);
    assert.equal(action === 'stage_outline_generate' ? currentNovel?.currentStageOutlineVersionId
      : action === 'outline_generate' ? currentNovel?.currentOutlineVersionId
      : action === 'setting_generate' ? currentNovel?.currentSettingVersionId
        : currentNovel?.currentDirectionVersionId, null);
    assert.equal((await repository.listTaskEvents(context.tenantId, task.id))
      .filter((event) => event.eventType === 'task_finalized').length, 1);
    process.stdout.write(JSON.stringify({ result: 'passed', action, taskId: task.id,
      status: task.status, httpCalls, providerCallBudgetUsed: task.providerCallBudgetUsed,
      candidateCount: candidates.length, promptTokens: usage?.promptTokens ?? null,
      completionTokens: usage?.completionTokens ?? null, totalTokens: usage?.totalTokens ?? null }) + '\n');
  } finally {
    await worker.stop();
  }
} finally {
  await disconnectPrismaClient();
}
