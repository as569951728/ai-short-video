import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDeepSeekConfig } from './modelRouting.js';

describe('AI model routing', () => {
  it('uses deepseek-v4-pro as the default DeepSeek model family', () => {
    const config = resolveDeepSeekConfig({
      AI_PROVIDER_MODE: 'deepseek',
      DEEPSEEK_API_KEY: 'test-key'
    });

    assert.equal(config.mode, 'deepseek');
    assert.equal(config.model, 'deepseek-v4-pro');
    assert.equal(config.structureModel, 'deepseek-v4-pro');
    assert.equal(config.reasonerModel, 'deepseek-v4-pro');
    assert.equal(config.timeoutMs, 360000);
    assert.equal(config.maxRetries, 0);
  });

  it('keeps explicit DeepSeek model overrides', () => {
    const config = resolveDeepSeekConfig({
        AI_PROVIDER_MODE: 'deepseek',
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_MODEL: 'deepseek-v4-flash',
        DEEPSEEK_STRUCTURE_MODEL: 'deepseek-v4-pro',
        DEEPSEEK_REASONER_MODEL: 'deepseek-v4-pro'
      });

    assert.equal(config.model, 'deepseek-v4-flash');
    assert.equal(config.structureModel, 'deepseek-v4-pro');
    assert.equal(config.reasonerModel, 'deepseek-v4-pro');
  });

  it('allows operators to override the bounded model wait and transport retry count', () => {
    const config = resolveDeepSeekConfig({ DEEPSEEK_TIMEOUT_MS: '420000', DEEPSEEK_MAX_RETRIES: '1' });
    assert.equal(config.timeoutMs, 420000);
    assert.equal(config.maxRetries, 1);
  });
});
