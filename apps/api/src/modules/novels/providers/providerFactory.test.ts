import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ChatCompletionRequest } from '../../ai/llmClient.js';
import { LlmProviderError } from '../../ai/llmClient.js';
import { DeepSeekNovelProvider } from './deepseekNovelProvider.js';
import { MockDirectionProvider } from './mockDirectionProvider.js';
import { createLeasedNovelProvidersFromEnv, createNovelProvidersFromEnv } from './providerFactory.js';

describe('novel provider factory for leased tasks', () => {
  it('keeps mock workers on mock providers', () => {
    const providers = createLeasedNovelProvidersFromEnv({ env: { AI_PROVIDER_MODE: 'mock' } });
    assert.ok(providers.directionProvider instanceof MockDirectionProvider);
    assert.equal(providers.directionProvider.getLeasedPaidCallBudget(), 1);
  });

  it('uses the synchronous model route but permits only one paid request', async () => {
    const requests: ChatCompletionRequest[] = [];
    const options = {
      env: {
        AI_PROVIDER_MODE: 'deepseek', DEEPSEEK_API_KEY: 'test-only-key',
        DEEPSEEK_MODEL: 'direction-test', DEEPSEEK_STRUCTURE_MODEL: 'structure-test'
      },
      llmClient: { async chat(request: ChatCompletionRequest) {
        requests.push(request);
        return { content: 'not-json', model: request.model };
      } }
    };
    const synchronous = createNovelProvidersFromEnv(options);
    const leased = createLeasedNovelProvidersFromEnv(options);
    assert.ok(synchronous.directionProvider instanceof DeepSeekNovelProvider);
    assert.ok(leased.directionProvider instanceof DeepSeekNovelProvider);
    assert.ok(leased.structureProvider instanceof DeepSeekNovelProvider);
    assert.equal(leased.directionProvider.getModelRoutingVersion('direction_generate'),
      synchronous.directionProvider.getModelRoutingVersion('direction_generate'));
    assert.equal(leased.structureProvider.getModelRoutingVersion('setting_generate'),
      synchronous.directionProvider.getModelRoutingVersion('setting_generate'));
    assert.equal(leased.directionProvider.getLeasedPaidCallBudget(), 1);
    assert.equal(leased.structureProvider.getLeasedPaidCallBudget('chapter_plan_generate'), null);
    await assert.rejects(() => leased.directionProvider.generateCandidates({
      action: 'direction_generate',
      novel: { id: 'novel-1', title: '测试小说', genres: ['都市逆袭'], chapterLimit: 5,
        chapterWordMin: 800, chapterWordMax: 1200, policyProfileVersionId: null },
      preferences: { appealPoints: [], targetAudience: null, stageCount: null }
    }), (error) => error instanceof LlmProviderError && error.category === 'output_parse_failed');
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.maxRetries, 0);
  });

  it('fails closed when the real model key is absent', async () => {
    const providers = createLeasedNovelProvidersFromEnv({ env: { AI_PROVIDER_MODE: 'deepseek' } });
    assert.equal('getLeasedPaidCallBudget' in providers.directionProvider, false);
    await assert.rejects(() => providers.directionProvider.generateCandidates({
      action: 'direction_generate',
      novel: { id: 'novel-1', title: '测试小说', genres: ['都市逆袭'], chapterLimit: 5,
        chapterWordMin: 800, chapterWordMax: 1200, policyProfileVersionId: null },
      preferences: { appealPoints: [], targetAudience: null, stageCount: null }
    }));
  });
});
