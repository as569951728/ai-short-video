import type { LlmClient } from './llmClient.js';
import { OpenAiCompatibleChatClient } from './openAiCompatibleClient.js';

export type AiProviderMode = 'mock' | 'deepseek';

export interface AiProviderEnv {
  AI_PROVIDER_MODE?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_BASE_URL?: string;
  DEEPSEEK_MODEL?: string;
  DEEPSEEK_STRUCTURE_MODEL?: string;
  DEEPSEEK_REASONER_MODEL?: string;
  DEEPSEEK_TIMEOUT_MS?: string;
  DEEPSEEK_MAX_RETRIES?: string;
}

export interface DeepSeekRuntimeConfig {
  mode: AiProviderMode;
  apiKey: string | null;
  baseUrl: string;
  model: string;
  structureModel: string;
  reasonerModel: string;
  timeoutMs: number;
  maxRetries: number;
}

export function resolveAiProviderMode(envLike: AiProviderEnv = process.env): AiProviderMode {
  const mode = (envLike.AI_PROVIDER_MODE ?? 'mock').trim().toLowerCase();
  return mode === 'deepseek' ? 'deepseek' : 'mock';
}

export function resolveDeepSeekConfig(envLike: AiProviderEnv = process.env): DeepSeekRuntimeConfig {
  const model = (envLike.DEEPSEEK_MODEL ?? 'deepseek-v4-pro').trim() || 'deepseek-v4-pro';
  return {
    mode: resolveAiProviderMode(envLike),
    apiKey: envLike.DEEPSEEK_API_KEY?.trim() || null,
    baseUrl: (envLike.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').trim() || 'https://api.deepseek.com',
    model,
    structureModel: (envLike.DEEPSEEK_STRUCTURE_MODEL ?? model).trim() || model,
    reasonerModel: (envLike.DEEPSEEK_REASONER_MODEL ?? 'deepseek-v4-pro').trim() || model,
    timeoutMs: parsePositiveInt(envLike.DEEPSEEK_TIMEOUT_MS, 60000),
    maxRetries: parseNonNegativeInt(envLike.DEEPSEEK_MAX_RETRIES, 1)
  };
}

export function createDeepSeekLlmClient(config: DeepSeekRuntimeConfig, override?: LlmClient): LlmClient | null {
  if (override) {
    return override;
  }
  if (!config.apiKey) {
    return null;
  }

  return new OpenAiCompatibleChatClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries
  });
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
