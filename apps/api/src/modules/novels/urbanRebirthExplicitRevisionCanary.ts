import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDeepSeekLlmClient, resolveDeepSeekConfig } from '../ai/modelRouting.js';
import { isLlmProviderError, type LlmClient } from '../ai/llmClient.js';
import { evaluateChapterLength } from './domain/chapterLengthPolicy.js';
import { DeepSeekNovelProvider } from './providers/deepseekNovelProvider.js';

const TARGET = 2300;
const SOURCE_HASH = '8ba8c44d9f5ce1cf279a93640fb6baed9abf7b9603b0da384823e40d37486c27';
const MAX_PROMPT_CHARACTERS = 40_000;
const MAX_COMPLETION_TOKENS = 700;

async function main() {
  const sourcePath = process.env.NOVEL_CANARY_REPLAY_ORIGINAL_PATH;
  if (!sourcePath) throw new Error('Missing NOVEL_CANARY_REPLAY_ORIGINAL_PATH');
  const original = readFileSync(sourcePath, 'utf8');
  if (createHash('sha256').update(original).digest('hex') !== SOURCE_HASH) {
    throw new Error('Fixed urban rebirth source hash mismatch');
  }
  const before = evaluateChapterLength(original, TARGET);
  if (before.status !== 'too_long') throw new Error('Fixed source is not overlong');

  const config = resolveDeepSeekConfig(process.env);
  if (config.mode !== 'deepseek' || !config.apiKey) throw new Error('DeepSeek live canary is not configured');
  const client = createDeepSeekLlmClient({ ...config, maxRetries: 0 });
  if (!client) throw new Error('DeepSeek client is unavailable');

  let calls = 0;
  let usage = null;
  const budgetedClient: LlmClient = {
    async chat(request) {
      calls += 1;
      if (calls > 1) throw new Error('Canary call budget exceeded');
      const promptCharacters = request.messages.reduce((sum, message) => sum + message.content.length, 0);
      if (promptCharacters > MAX_PROMPT_CHARACTERS) throw new Error('Canary prompt budget exceeded');
      if ((request.maxTokens ?? 0) > MAX_COMPLETION_TOKENS) throw new Error('Canary output budget exceeded');
      const result = await client.chat(request);
      usage = result.usage ?? null;
      return result;
    }
  };
  const provider = new DeepSeekNovelProvider({
    client: budgetedClient,
    model: config.model,
    structureModel: config.structureModel,
    reasonerModel: config.reasonerModel
  });
  const startedAt = Date.now();
  try {
    const revised = await provider.reviseOverlengthChapter({
      action: 'chapter_overlength_revise',
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
      original: {
        id: 'urban-rebirth-canary-original',
        content: original,
        summary: null,
        reviewScore: null,
        providerSafeMetadata: {
          scoringStrategyVersion: null,
          hardFailed: null,
          candidateRank: null,
          isMockOutput: false
        }
      }
    });
    const after = evaluateChapterLength(revised, TARGET);
    const outputDir = mkdtempSync(join(tmpdir(), 'novel-explicit-revision-canary-'));
    const resultPath = join(outputDir, 'chapter-1-revised.txt');
    writeFileSync(resultPath, revised, { encoding: 'utf8', mode: 0o600 });
    console.log(JSON.stringify({
      status: after.status,
      originalCharacters: before.actual,
      revisedCharacters: after.actual,
      lowerBound: after.lowerBound,
      upperBound: after.upperBound,
      calls,
      usage,
      elapsedMs: Date.now() - startedAt,
      originalHash: SOURCE_HASH,
      resultHash: createHash('sha256').update(revised).digest('hex'),
      resultPath
    }, null, 2));
  } catch (error) {
    const reason = isLlmProviderError(error) ? error.details?.reason : null;
    const safeReasons = new Set([
      'sentenceIds is required',
      'body deletion output has unexpected fields',
      'body deletion count exceeds the limit',
      'body deletion id is invalid',
      'body deletion size is outside the bounded range',
      'body deletion result is outside the chapter length gate'
    ]);
    console.error(JSON.stringify({
      status: 'failed',
      calls,
      usage,
      elapsedMs: Date.now() - startedAt,
      category: isLlmProviderError(error) ? error.category : 'unknown',
      safeReason: typeof reason === 'string' && safeReasons.has(reason) ? reason : null
    }));
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error('Live canary setup failed');
  process.exitCode = 1;
});
