import { ErrorCode } from '@ai-shortvideo/shared';
import type { LlmClient } from '../../ai/llmClient.js';
import { createDeepSeekLlmClient, resolveDeepSeekConfig, type AiProviderEnv } from '../../ai/modelRouting.js';
import { BusinessError } from '../../../shared/errors.js';
import type { NovelServiceOptions } from '../services/novelService.js';
import { DeepSeekNovelProvider } from './deepseekNovelProvider.js';

export interface NovelProviderFactoryOptions {
  env?: AiProviderEnv;
  llmClient?: LlmClient;
}

export function createNovelProvidersFromEnv(options: NovelProviderFactoryOptions = {}): Partial<NovelServiceOptions> {
  const config = resolveDeepSeekConfig(options.env);
  if (config.mode !== 'deepseek') {
    return {};
  }

  const client = createDeepSeekLlmClient(config, options.llmClient);
  if (!client) {
    const missing = new MissingDeepSeekConfigProvider();
    return {
      directionProvider: missing,
      structureProvider: missing,
      trialProvider: missing,
      bodyProvider: missing,
      fullReviewProvider: missing
    };
  }

  const provider = new DeepSeekNovelProvider({
    client,
    model: config.model,
    reasonerModel: config.reasonerModel
  });

  return {
    directionProvider: provider,
    structureProvider: provider,
    trialProvider: provider,
    bodyProvider: provider,
    fullReviewProvider: provider
  };
}

class MissingDeepSeekConfigProvider {
  async generateCandidates(): Promise<never> {
    throwMissingDeepSeekConfig();
  }

  async fuseCandidates(): Promise<never> {
    throwMissingDeepSeekConfig();
  }

  async optimizeCandidate(): Promise<never> {
    throwMissingDeepSeekConfig();
  }

  async generateAsset(): Promise<never> {
    throwMissingDeepSeekConfig();
  }

  async generateChapterOneCandidates(): Promise<never> {
    throwMissingDeepSeekConfig();
  }

  async generateFollowup(): Promise<never> {
    throwMissingDeepSeekConfig();
  }

  async generateBodyChapter(): Promise<never> {
    throwMissingDeepSeekConfig();
  }

  async rewriteChapter(): Promise<never> {
    throwMissingDeepSeekConfig();
  }

  async assessImpact(): Promise<never> {
    throwMissingDeepSeekConfig();
  }

  async generateFullReview(): Promise<never> {
    throwMissingDeepSeekConfig();
  }
}

function throwMissingDeepSeekConfig(): never {
  throw new BusinessError(ErrorCode.ConfigMissing, 'DeepSeek 模型服务未配置，请设置模型 API Key 后重试。', {
    provider: 'deepseek',
    missing: ['apiKey']
  });
}
