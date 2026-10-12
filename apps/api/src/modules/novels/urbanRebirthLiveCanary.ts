import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RiskLevel } from '@ai-shortvideo/shared';
import { createDeepSeekLlmClient, resolveDeepSeekConfig } from '../ai/modelRouting.js';
import { isLlmProviderError, type ChatCompletionResult, type LlmClient } from '../ai/llmClient.js';
import { evaluateChapterLength } from './domain/chapterLengthPolicy.js';
import { DeepSeekNovelProvider } from './providers/deepseekNovelProvider.js';

const TARGET = 2300;
const MAX_CALLS = 1;
const MAX_COMPLETION_TOKENS = 9000;
const MAX_PROMPT_CHARACTERS = 20_000;

async function main() {
  const config = resolveDeepSeekConfig(process.env);
  if (config.mode !== 'deepseek' || !config.apiKey) {
    throw new Error('都市重生 canary 需要 AI_PROVIDER_MODE=deepseek 和 DEEPSEEK_API_KEY。');
  }

  const client = createDeepSeekLlmClient({ ...config, maxRetries: 0 });
  if (!client) throw new Error('DeepSeek client 未配置。');

  let callCount = 0;
  let completion: ChatCompletionResult | null = null;
  const budgetedClient: LlmClient = {
    async chat(request) {
      callCount += 1;
      if (callCount > MAX_CALLS) throw new Error('Canary call budget exceeded');
      const promptCharacters = request.messages.reduce((sum, message) => sum + message.content.length, 0);
      if (promptCharacters > MAX_PROMPT_CHARACTERS) throw new Error('Canary prompt budget exceeded');
      if ((request.maxTokens ?? 0) > MAX_COMPLETION_TOKENS) throw new Error('Canary output budget exceeded');
      completion = await client.chat(request);
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
      id: 'urban-rebirth-live-canary',
      title: '回到十八岁，我先救下那本旧账',
      genres: ['都市逆袭', '重生'],
      chapterLimit: 8,
      chapterWordMin: 1800,
      chapterWordMax: 2600,
      policyProfileVersionId: 'policy_default_v1'
    },
    chapter: {
      id: 'urban-rebirth-live-canary-chapter-1',
      chapterNo: 1,
      title: '第1章 被撕掉的账页',
      wordTarget: TARGET,
      statusNote: null
    },
    strategySnapshot: {
      id: 'urban-rebirth-live-canary-strategy',
      versionNo: 1,
      title: '都市重生与证据反转',
      summary: '主角林越重生回高三毕业的夏天。上一世父亲被合作伙伴栽赃挪用货款，仓库当晚失火，家族生意从此崩塌。首章聚焦一处仓库和一本旧账：主角凭记忆发现账页被替换，但证据不完整；他必须在父亲签字前阻止错误决定。人物行动要有代价，冲突通过具体场景推进，结尾留下可验证的新线索，不靠旁白概述未来商业帝国。',
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
  const requiredAnchors = ['林越', '仓库', '账', '父亲'];
  const missingAnchors = requiredAnchors.filter((anchor) => !draft.content.includes(anchor));
  const outputDir = mkdtempSync(join(tmpdir(), 'novel-urban-rebirth-canary-'));
  const chapterPath = join(outputDir, 'chapter-1.txt');
  writeFileSync(chapterPath, draft.content, { encoding: 'utf8', mode: 0o600 });
  const finalCompletion = completion as ChatCompletionResult | null;
  console.log(JSON.stringify({
    success: gate.canAdopt && missingAnchors.length === 0 && callCount === MAX_CALLS,
    evidence: 'REAL_MODEL_ONE_CALL_NO_DATABASE',
    model: finalCompletion?.model ?? config.model,
    target: gate.target,
    actual: gate.actual,
    lowerBound: gate.lowerBound,
    upperBound: gate.upperBound,
    status: gate.status,
    fixedFixtureMissingAnchors: missingAnchors,
    countMode: gate.metric,
    callCount,
    retryCount: 0,
    usage: finalCompletion?.usage ?? null,
    elapsedMs: Date.now() - startedAt,
    maxCompletionTokens: MAX_COMPLETION_TOKENS,
    resultHash: createHash('sha256').update(draft.content).digest('hex'),
    chapterPath
  }, null, 2));
  if (!gate.canAdopt || missingAnchors.length > 0) throw new Error('都市重生章节未通过长度或固定样本情节锚点检查。');
}

main().catch((error) => {
  if (isLlmProviderError(error)) {
    console.error(JSON.stringify({
      category: error.category,
      taskName: error.details?.taskName ?? null,
      outputKind: error.details?.outputKind ?? null,
      finishReason: error.details?.finishReason ?? null,
      completionTokens: error.details?.completionTokens ?? null,
      responseCharacters: error.details?.responseCharacters ?? null
    }));
  }
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
