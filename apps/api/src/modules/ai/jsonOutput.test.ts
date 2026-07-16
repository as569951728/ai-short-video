import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LlmProviderError, type LlmClient } from './llmClient.js';
import { requestJsonOutput } from './jsonOutput.js';

describe('AI JSON output helper', () => {
  it('parses structured JSON from an OpenAI-compatible response', async () => {
    const client = createFakeClient('```json\n{"title":"方向 A","score":86}\n```');

    const result = await requestJsonOutput(client, {
      taskName: 'test_direction',
      model: 'fake-model',
      messages: [{ role: 'user', content: 'return json' }],
      validate: (value) => {
        assert.equal((value as any).title, '方向 A');
        return value as { title: string; score: number };
      }
    });

    assert.equal(result.title, '方向 A');
    assert.equal(result.score, 86);
  });

  it('extracts a JSON object when the provider wraps it with prose', async () => {
    const client = createFakeClient('可以，以下是 JSON：\n{"title":"设定档案","score":82}\n请确认。');

    const result = await requestJsonOutput(client, {
      taskName: 'test_structure',
      model: 'fake-model',
      messages: [{ role: 'user', content: 'return json' }],
      validate: (value) => value as { title: string; score: number }
    });

    assert.equal(result.title, '设定档案');
    assert.equal(result.score, 82);
  });

  it('repairs one malformed response by retrying with strict JSON instructions', async () => {
    const calls: string[] = [];
    const client: LlmClient = {
      async chat(request) {
        calls.push(request.messages.at(-1)?.content ?? '');
        return {
          content: calls.length === 1 ? '这次先给说明，不给 JSON' : '{"title":"修复后的大纲","score":88}',
          model: 'fake-model'
        };
      }
    };

    const result = await requestJsonOutput(client, {
      taskName: 'test_repair',
      model: 'fake-model',
      messages: [{ role: 'user', content: 'return json' }],
      validate: (value) => value as { title: string; score: number }
    });

    assert.equal(result.title, '修复后的大纲');
    assert.equal(result.score, 88);
    assert.equal(calls.length, 2);
    assert.match(calls[1], /重新输出一个完整 JSON 对象/);
  });

  it('classifies non-JSON responses without leaking raw model output', async () => {
    const client = createFakeClient('FULL_MODEL_RESPONSE_SHOULD_NOT_LEAK');

    await assert.rejects(
      () =>
        requestJsonOutput(client, {
          taskName: 'test_direction',
          model: 'fake-model',
          messages: [{ role: 'user', content: 'FULL_PROMPT_SHOULD_NOT_LEAK' }],
          validate: (value) => value
        }),
      (error) => {
        assert.ok(error instanceof LlmProviderError);
        assert.equal(error.category, 'output_parse_failed');
        assert.match(error.message, /JSON/);
        assert.doesNotMatch(error.message, /FULL_MODEL_RESPONSE_SHOULD_NOT_LEAK|FULL_PROMPT_SHOULD_NOT_LEAK/);
        assert.doesNotMatch(JSON.stringify(error.details ?? {}), /FULL_MODEL_RESPONSE_SHOULD_NOT_LEAK|FULL_PROMPT_SHOULD_NOT_LEAK/);
        return true;
      }
    );
  });

  it('classifies schema validation failures without leaking raw model output', async () => {
    const client = createFakeClient('{"title":"缺少内容","raw":"FULL_MODEL_RESPONSE_SHOULD_NOT_LEAK"}');

    await assert.rejects(
      () =>
        requestJsonOutput(client, {
          taskName: 'test_trial',
          model: 'fake-model',
          messages: [{ role: 'user', content: 'FULL_PROMPT_SHOULD_NOT_LEAK' }],
          validate: () => {
            throw new Error('content is required');
          }
        }),
      (error) => {
        assert.ok(error instanceof LlmProviderError);
        assert.equal(error.category, 'output_parse_failed');
        assert.doesNotMatch(error.message, /FULL_MODEL_RESPONSE_SHOULD_NOT_LEAK|FULL_PROMPT_SHOULD_NOT_LEAK/);
        assert.doesNotMatch(JSON.stringify(error.details ?? {}), /FULL_MODEL_RESPONSE_SHOULD_NOT_LEAK|FULL_PROMPT_SHOULD_NOT_LEAK/);
        return true;
      }
    );
  });
});

function createFakeClient(content: string): LlmClient {
  return {
    async chat() {
      return {
        content,
        model: 'fake-model',
        usage: {
          promptTokens: 12,
          completionTokens: 8,
          totalTokens: 20
        }
      };
    }
  };
}
