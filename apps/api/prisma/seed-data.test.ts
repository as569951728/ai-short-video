import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getSeedRecords } from './seed-data.js';

describe('seed data contract', () => {
  it('defines the package-0 default tenant, user, policy, prompt template, and mock provider', () => {
    const seedRecords = getSeedRecords();

    assert.equal(seedRecords.tenant.id, 'tenant_default');
    assert.equal(seedRecords.user.id, 'user_default');
    assert.equal(seedRecords.policyProfileVersion.key, 'default_novel_policy');
    assert.equal(seedRecords.promptTemplateVersion.templateKey, 'novel_direction_generate');
    assert.equal(seedRecords.modelProvider.providerType, 'mock');
    assert.equal(seedRecords.modelConfig.modelKey, 'mock-novel-generator');
  });

  it('does not include secrets, full prompts, or full provider responses in default seed data', () => {
    const serialized = JSON.stringify(getSeedRecords()).toLowerCase();

    assert.equal(serialized.includes('api_key'), false);
    assert.equal(serialized.includes('secret'), false);
    assert.equal(serialized.includes('token'), false);
    assert.equal(serialized.includes('完整提示词'), false);
    assert.equal(serialized.includes('完整模型响应'), false);
  });
});
