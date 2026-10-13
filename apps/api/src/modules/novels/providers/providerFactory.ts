import { ErrorCode } from '@ai-shortvideo/shared';
import type { LlmClient } from '../../ai/llmClient.js';
import { createDeepSeekLlmClient, resolveDeepSeekConfig, type AiProviderEnv } from '../../ai/modelRouting.js';
import { BusinessError } from '../../../shared/errors.js';
import type { NovelServiceOptions } from '../services/novelService.js';
import type { NovelProviderSet } from '../services/actionExecutionPlan.js';
import { DeepSeekNovelProvider } from './deepseekNovelProvider.js';
import { MockDirectionProvider } from './mockDirectionProvider.js';
import { MockStructureProvider } from './mockStructureProvider.js';
import { MockTrialProvider } from './mockTrialProvider.js';
import { MockBodyProvider } from './mockBodyProvider.js';
import { MockFullReviewProvider } from './mockFullReviewProvider.js';

export interface NovelProviderFactoryOptions {
  env?: AiProviderEnv;
  llmClient?: LlmClient;
}

export function createNovelProvidersFromEnv(options: NovelProviderFactoryOptions = {}): Partial<NovelServiceOptions> {
  return createConfiguredProviders(options, false);
}

export function createLeasedNovelProvidersFromEnv(options: NovelProviderFactoryOptions = {}): NovelProviderSet {
  const configured = createConfiguredProviders(options, true);
  return {
    directionProvider: configured.directionProvider ?? new MockDirectionProvider(),
    structureProvider: configured.structureProvider ?? new MockStructureProvider(),
    trialProvider: configured.trialProvider ?? new MockTrialProvider(),
    bodyProvider: configured.bodyProvider ?? new MockBodyProvider(),
    fullReviewProvider: configured.fullReviewProvider ?? new MockFullReviewProvider()
  };
}

function createConfiguredProviders(options: NovelProviderFactoryOptions, singlePaidCallMode: boolean): Partial<NovelServiceOptions> {
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
    structureModel: config.structureModel,
    reasonerModel: config.reasonerModel,
    singlePaidCallMode
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
  assertAvailable(): never {
    throwMissingDeepSeekConfig();
  }

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

  async reviseOverlengthChapter(): Promise<never> {
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
