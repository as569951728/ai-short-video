import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LlmProviderError } from './llmClient.js';
import { OpenAiCompatibleChatClient } from './openAiCompatibleClient.js';

describe('OpenAI-compatible chat client failure classification', () => {
  it('classifies timeout without leaking the API key or prompt', async () => {
    let calls = 0;
    const client = new OpenAiCompatibleChatClient({
      baseUrl: 'https://example.test',
      apiKey: 'sk-should-not-leak',
      timeoutMs: 1,
      maxRetries: 2,
      fetchImpl: async (_url, init) => {
        calls += 1;
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
          messages: [{ role: 'user', content: 'FULL_PROMPT_SHOULD_NOT_LEAK' }],
          maxRetries: 0
        }),
      (error) => {
        assert.ok(error instanceof LlmProviderError);
        assert.equal(error.category, 'timeout');
        assert.doesNotMatch(error.message, /sk-should-not-leak|FULL_PROMPT_SHOULD_NOT_LEAK/);
        assert.doesNotMatch(JSON.stringify(error.details ?? {}), /sk-should-not-leak|FULL_PROMPT_SHOULD_NOT_LEAK/);
        return true;
      }
    );
    assert.equal(calls, 1);
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

  it('honors a per-request zero-retry boundary even when the client default allows retries', async () => {
    let calls = 0;
    const client = new OpenAiCompatibleChatClient({
      baseUrl: 'https://example.test',
      apiKey: 'sk-should-not-leak',
      timeoutMs: 1000,
      maxRetries: 1,
      fetchImpl: async () => {
        calls += 1;
        return new Response('{}', { status: 503 });
      }
    });

    await assert.rejects(
      () => client.chat({
        taskName: 'novel_body_chapter_generate',
        model: 'deepseek-v4-pro',
        messages: [],
        maxRetries: 0
      }),
      (error) => error instanceof LlmProviderError && error.category === 'provider_error'
    );
    assert.equal(calls, 1);
  });

  it('does not retry empty provider content when the request freezes retries at zero', async () => {
    let calls = 0;
    const client = new OpenAiCompatibleChatClient({
      baseUrl: 'https://example.test',
      apiKey: 'sk-should-not-leak',
      timeoutMs: 1000,
      maxRetries: 2,
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({
          model: 'deepseek-v4-pro',
          choices: [{ finish_reason: 'length', message: { content: '' } }],
          usage: { completion_tokens: 3600, completion_tokens_details: { reasoning_tokens: 3600 } }
        }), { status: 200 });
      }
    });

    await assert.rejects(
      () => client.chat({
        taskName: 'novel_body_chapter_generate',
        model: 'deepseek-v4-pro',
        messages: [],
        maxRetries: 0
      }),
      (error) => {
        assert.ok(error instanceof LlmProviderError);
        assert.equal(error.category, 'provider_error');
        assert.deepEqual(error.details, {
          taskName: 'novel_body_chapter_generate',
          status: 200,
          finishReason: 'length',
          completionTokens: 3600,
          reasoningTokens: 3600
        });
        assert.doesNotMatch(JSON.stringify(error.details), /sk-should-not-leak/);
        return true;
      }
    );
    assert.equal(calls, 1);
  });

  it('sends non-thinking mode only for an explicitly bounded request', async () => {
    let sentBody: any;
    const client = new OpenAiCompatibleChatClient({
      baseUrl: 'https://example.test',
      apiKey: 'sk-should-not-leak',
      timeoutMs: 1000,
      maxRetries: 0,
      fetchImpl: async (_url, init) => {
        sentBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }));
      }
    });

    await client.chat({
      taskName: 'novel_body_chapter_generate',
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: 'json' }],
      thinkingMode: 'disabled'
    });
    assert.deepEqual(sentBody.thinking, { type: 'disabled' });

    await client.chat({ taskName: 'novel_full_review', model: 'deepseek-v4-pro', messages: [] });
    assert.equal(Object.hasOwn(sentBody, 'thinking'), false);
  });
});
