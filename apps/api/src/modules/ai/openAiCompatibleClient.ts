import { LlmProviderError, type ChatCompletionRequest, type ChatCompletionResult, type LlmClient } from './llmClient.js';

export interface OpenAiCompatibleClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
  fetchImpl?: typeof fetch;
}

export class OpenAiCompatibleChatClient implements LlmClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAiCompatibleClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    if (!this.options.apiKey.trim()) {
      throw new LlmProviderError('configuration_error', '模型服务 API Key 未配置。');
    }

    const url = `${this.options.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
    let lastStatus: number | null = null;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
      try {
        const response = await this.fetchImpl(url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.options.apiKey}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            temperature: request.temperature ?? 0.4,
            max_tokens: request.maxTokens,
            response_format: { type: 'json_object' }
          }),
          signal: controller.signal
        });
        lastStatus = response.status;

        if (!response.ok) {
          if (attempt < this.options.maxRetries && response.status >= 500) {
            continue;
          }
          const category = classifyProviderFailure(response.status);
          throw new LlmProviderError(category, getProviderFailureMessage(category), {
            taskName: request.taskName,
            status: response.status
          });
        }

        const payload = (await response.json()) as {
          model?: string;
          choices?: Array<{ message?: { content?: string } }>;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
          };
        };
        const content = payload.choices?.[0]?.message?.content;
        if (!content) {
          if (attempt < this.options.maxRetries) {
            continue;
          }
          throw new LlmProviderError('provider_error', '模型服务返回为空。', {
            taskName: request.taskName,
            status: response.status
          });
        }

        return {
          content,
          model: payload.model ?? request.model,
          usage: {
            promptTokens: payload.usage?.prompt_tokens,
            completionTokens: payload.usage?.completion_tokens,
            totalTokens: payload.usage?.total_tokens
          }
        };
      } catch (error) {
        if (error instanceof LlmProviderError) {
          throw error;
        }
        if (attempt >= this.options.maxRetries) {
          const timeout = error instanceof Error && error.name === 'AbortError';
          throw new LlmProviderError(timeout ? 'timeout' : 'provider_error', timeout ? '模型调用超时，请稍后重试。' : '模型服务调用异常。', {
            taskName: request.taskName,
            status: lastStatus,
            reason: timeout ? 'timeout' : 'network_error'
          });
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new LlmProviderError('provider_error', '模型服务调用失败。', {
      taskName: request.taskName,
      status: lastStatus
    });
  }
}

function classifyProviderFailure(status: number) {
  if (status === 429) return 'rate_limited';
  if (status === 402 || status === 403) return 'quota_insufficient';
  return 'provider_error';
}

function getProviderFailureMessage(category: 'provider_error' | 'rate_limited' | 'quota_insufficient') {
  if (category === 'rate_limited') return '模型服务限流，请稍后重试。';
  if (category === 'quota_insufficient') return '模型服务额度不足，请检查账号额度。';
  return '模型服务调用失败。';
}
