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
});
