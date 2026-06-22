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
