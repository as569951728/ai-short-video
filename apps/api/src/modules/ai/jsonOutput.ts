import { LlmProviderError, type ChatMessage, type LlmClient } from './llmClient.js';

export interface JsonOutputRequest<T> {
  taskName: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  outputRepairRetries?: number;
  validate: (value: unknown) => T;
}

export async function requestJsonOutput<T>(
  client: LlmClient,
  request: JsonOutputRequest<T>
): Promise<T> {
  const maxAttempts = 1 + Math.max(0, request.outputRepairRetries ?? 1);
  let lastModel = request.model;
  let lastValidationReason = 'schema_invalid';

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await client.chat({
      taskName: request.taskName,
      model: request.model,
      messages: attempt === 0 ? request.messages : createRepairMessages(request.messages),
      temperature: attempt === 0 ? request.temperature : 0.1,
      maxTokens: request.maxTokens
    });
    lastModel = result.model;
    const text = extractJsonText(result.content);
    let parsed: unknown;

    try {
      parsed = JSON.parse(text);
    } catch {
      if (attempt < maxAttempts - 1) {
        continue;
      }
      throw new LlmProviderError('output_parse_failed', `模型输出不是合法 JSON：${request.taskName}`, {
        taskName: request.taskName,
        model: lastModel,
        outputKind: 'non_json'
      });
    }

    try {
      return request.validate(parsed);
    } catch (error) {
      lastValidationReason = error instanceof Error ? error.message : 'schema_invalid';
      if (attempt < maxAttempts - 1) {
        continue;
      }
    }
  }

  throw new LlmProviderError('output_parse_failed', `模型输出结构不符合约定：${request.taskName}`, {
    taskName: request.taskName,
    model: lastModel,
    outputKind: 'schema_invalid',
    reason: lastValidationReason
  });
}

function createRepairMessages(messages: ChatMessage[]): ChatMessage[] {
  return [
    ...messages,
    {
      role: 'user',
      content: '上一轮输出无法被系统解析为合法 JSON 或结构不符合约定。请重新输出一个完整 JSON 对象：不要 Markdown，不要解释，不要省略字段，不要尾随逗号。'
    }
  ];
}

function extractJsonText(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return extractFirstJsonObject(trimmed) ?? trimmed;
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1).trim();
      }
    }
  }
  return null;
}
