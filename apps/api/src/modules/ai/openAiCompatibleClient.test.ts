import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LlmProviderError } from './llmClient.js';
import { OpenAiCompatibleChatClient } from './openAiCompatibleClient.js';

describe('OpenAI-compatible chat client failure classification', () => {
  it('classifies timeout without leaking the API key or prompt', async () => {
    const client = new OpenAiCompatibleChatClient({
      baseUrl: 'https://example.test',
      apiKey: 'sk-should-not-leak',
      timeoutMs: 1,
      maxRetries: 0,
      fetchImpl: async (_url, init) => {
        await new Promise((resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
          setTimeout(resolve, 10);
        });
        return new Response('{}');
      }
    });

    await assert.rejects(
      () =>
        client.chat({
          taskName: 'novel_trial_followup',
          model: 'deepseek-v4-pro',
          messages: [{ role: 'user', content: 'FULL_PROMPT_SHOULD_NOT_LEAK' }]
        }),
      (error) => {
        assert.ok(error instanceof LlmProviderError);
        assert.equal(error.category, 'timeout');
        assert.doesNotMatch(error.message, /sk-should-not-leak|FULL_PROMPT_SHOULD_NOT_LEAK/);
        assert.doesNotMatch(JSON.stringify(error.details ?? {}), /sk-should-not-leak|FULL_PROMPT_SHOULD_NOT_LEAK/);
        return true;
      }
    );
  });

  it('classifies provider rate limit and quota errors', async () => {
    const rateLimited = new OpenAiCompatibleChatClient({
      baseUrl: 'https://example.test',
      apiKey: 'sk-should-not-leak',
      timeoutMs: 1000,
      maxRetries: 0,
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 })
    });
    await assert.rejects(
      () => rateLimited.chat({ taskName: 'novel_direction_generate', model: 'deepseek-v4-pro', messages: [] }),
      (error) => error instanceof LlmProviderError && error.category === 'rate_limited'
    );

    const quota = new OpenAiCompatibleChatClient({
      baseUrl: 'https://example.test',
      apiKey: 'sk-should-not-leak',
      timeoutMs: 1000,
      maxRetries: 0,
      fetchImpl: async () => new Response(JSON.stringify({ error: { code: 'insufficient_quota' } }), { status: 402 })
    });
    await assert.rejects(
      () => quota.chat({ taskName: 'novel_direction_generate', model: 'deepseek-v4-pro', messages: [] }),
      (error) => error instanceof LlmProviderError && error.category === 'quota_insufficient'
    );
  });

  it('retries empty provider content before failing', async () => {
    let calls = 0;
    const client = new OpenAiCompatibleChatClient({
      baseUrl: 'https://example.test',
      apiKey: 'sk-should-not-leak',
      timeoutMs: 1000,
      maxRetries: 1,
      fetchImpl: async () => {
        calls += 1;
        return new Response(
          JSON.stringify({
            model: 'deepseek-v4-pro',
            choices: [{ message: { content: calls === 1 ? '' : '{"ok":true}' } }]
          }),
          { status: 200 }
        );
      }
    });

    const result = await client.chat({
      taskName: 'novel_structure_outline',
      model: 'deepseek-v4-pro',
      messages: []
    });

    assert.equal(calls, 2);
    assert.equal(result.content, '{"ok":true}');
  });
});
