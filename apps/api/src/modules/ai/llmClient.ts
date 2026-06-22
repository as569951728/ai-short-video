export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionRequest {
  taskName: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatCompletionUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  usage?: ChatCompletionUsage;
}

export interface LlmClient {
  chat(request: ChatCompletionRequest): Promise<ChatCompletionResult>;
}

export type LlmProviderErrorCategory =
  | 'configuration_error'
  | 'provider_error'
  | 'timeout'
  | 'rate_limited'
  | 'quota_insufficient'
  | 'output_parse_failed';

export class LlmProviderError extends Error {
  readonly category: LlmProviderErrorCategory;
  readonly details?: Record<string, unknown>;

  constructor(category: LlmProviderErrorCategory, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'LlmProviderError';
    this.category = category;
    this.details = details;
  }
}

export function isLlmProviderError(error: unknown): error is LlmProviderError {
  return error instanceof LlmProviderError;
}

export function createConfigurationError(message = '模型服务配置缺失，请联系管理员检查模型配置。') {
  return new LlmProviderError('configuration_error', message);
}
