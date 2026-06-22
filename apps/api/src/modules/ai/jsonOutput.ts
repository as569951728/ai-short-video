import { LlmProviderError, type ChatMessage, type LlmClient } from './llmClient.js';

export interface JsonOutputRequest<T> {
  taskName: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  validate: (value: unknown) => T;
}

export async function requestJsonOutput<T>(
  client: LlmClient,
  request: JsonOutputRequest<T>
): Promise<T> {
  const result = await client.chat({
    taskName: request.taskName,
    model: request.model,
    messages: request.messages,
    temperature: request.temperature,
    maxTokens: request.maxTokens
  });
  const text = extractJsonText(result.content);
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new LlmProviderError('output_parse_failed', `模型输出不是合法 JSON：${request.taskName}`, {
      taskName: request.taskName,
      model: result.model,
      outputKind: 'non_json'
    });
  }

  try {
    return request.validate(parsed);
  } catch (error) {
    throw new LlmProviderError('output_parse_failed', `模型输出结构不符合约定：${request.taskName}`, {
      taskName: request.taskName,
      model: result.model,
      outputKind: 'schema_invalid',
      reason: error instanceof Error ? error.message : 'schema_invalid'
    });
  }
}

function extractJsonText(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}
