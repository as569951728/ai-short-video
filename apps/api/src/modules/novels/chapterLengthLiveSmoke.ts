import { createHash } from 'node:crypto';
import { RiskLevel } from '@ai-shortvideo/shared';
import { createDeepSeekLlmClient, resolveDeepSeekConfig } from '../ai/modelRouting.js';
import type { ChatCompletionResult, LlmClient } from '../ai/llmClient.js';
import { evaluateChapterLength } from './domain/chapterLengthPolicy.js';
import { DeepSeekNovelProvider } from './providers/deepseekNovelProvider.js';

const TARGET = 800;
const MAX_CALLS = 1;
const MAX_COMPLETION_TOKENS = 3_600;
const MAX_PROMPT_CHARACTERS = 20_000;
const MAX_COST_USD = 0.05;

async function main() {
  const config = resolveDeepSeekConfig(process.env);
  if (config.mode !== 'deepseek' || !config.apiKey) {
    throw new Error('章节长度 live smoke 需要 AI_PROVIDER_MODE=deepseek 和 DEEPSEEK_API_KEY。');
  }

  const baseClient = createDeepSeekLlmClient({ ...config, maxRetries: 0 });
  if (!baseClient) throw new Error('DeepSeek client 未配置。');

  let callCount = 0;
  let completion: ChatCompletionResult | null = null;
  const budgetedClient: LlmClient = {
    async chat(request) {
      callCount += 1;
      if (callCount > MAX_CALLS) throw new Error('E5 call budget exceeded');
      const promptCharacters = request.messages.reduce((sum, message) => sum + message.content.length, 0);
      if (promptCharacters > MAX_PROMPT_CHARACTERS) throw new Error('E5 prompt budget exceeded');
      if ((request.maxTokens ?? 0) > MAX_COMPLETION_TOKENS) throw new Error('E5 completion budget exceeded');
      completion = await baseClient.chat(request);
      return completion;
    }
  };

  const provider = new DeepSeekNovelProvider({
    client: budgetedClient,
    model: config.model,
    structureModel: config.structureModel,
    reasonerModel: config.reasonerModel
  });
  const startedAt = Date.now();
  const draft = await provider.generateBodyChapter({
    action: 'chapter_body_generate',
    novel: {
      id: 'rp04b-l1-live-novel',
      title: '雨夜便利店的最后一张彩票',
      genres: ['都市现实', '轻悬疑'],
      chapterLimit: 1,
      chapterWordMin: TARGET,
      chapterWordMax: TARGET,
      policyProfileVersionId: 'policy_default_v1'
    },
    chapter: {
      id: 'rp04b-l1-live-chapter-1',
      chapterNo: 1,
      title: '第1章 雨夜来客',
      wordTarget: TARGET,
      statusNote: null
    },
    strategySnapshot: {
      id: 'rp04b-l1-live-strategy',
      versionNo: 1,
      title: '现实悬疑短篇策略',
      summary: '单一场景开篇，以中奖彩票归属冲突推进人物选择，结尾留下监控盲区钩子。',
      riskLevel: RiskLevel.Low,
      riskTags: [],
      providerSafeMetadata: {
        scoringStrategyVersion: 'body-chapter-score-v1',
        hardFailed: false,
        candidateRank: 1,
        isMockOutput: false
      }
    },
    previousContent: null,
    previousMemory: null,
    previousBatchNotes: [],
    enhancedReview: false
  });
  const gate = evaluateChapterLength(draft.content, TARGET);
  const finalCompletion = completion as ChatCompletionResult | null;
  const summary = {
    success: gate.canAdopt && callCount === MAX_CALLS,
    evidence: 'E5_REAL_DEEPSEEK_ONE_CALL',
    modelRoutingVersion: provider.getModelRoutingVersion('chapter_body_generate'),
    model: finalCompletion?.model ?? config.model,
    target: gate.target,
    actual: gate.actual,
    lowerBound: gate.lowerBound,
    upperBound: gate.upperBound,
    status: gate.status,
    countMode: gate.metric,
    callCount,
    retryCount: 0,
    usage: finalCompletion?.usage ?? null,
    elapsedMs: Date.now() - startedAt,
    budget: {
      maxCalls: MAX_CALLS,
      maxCompletionTokens: MAX_COMPLETION_TOKENS,
      maxPromptCharacters: MAX_PROMPT_CHARACTERS,
      maxCostUsd: MAX_COST_USD
    },
    resultHash: createHash('sha256').update(draft.content).digest('hex')
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.success) throw new Error('章节长度 E5 canary 未命中权威字符数区间。');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
