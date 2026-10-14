import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ISOLATED_E1_ACTIONS,
  ISOLATED_E1_TASK_TYPES,
  resolveIsolatedNovelAsyncEnabled
} from '../../src/config/isolatedNovelAsyncPolicy.js';

const databaseUrl = 'mysql://e1_test:secret@127.0.0.1:64631/ai_shortvideo_e1_20261014';
const valid = () => ({
  flag: 'true', runtimeEnvironment: 'development', providerMode: 'mock',
  databaseUrl, smokeUrl: databaseUrl
});

describe('isolated E1 MySQL async policy', () => {
  it('stays off by default and permits only the isolated development configuration', () => {
    assert.equal(resolveIsolatedNovelAsyncEnabled({ ...valid(), flag: 'false' }), false);
    assert.equal(resolveIsolatedNovelAsyncEnabled(valid()), true);
    assert.equal(ISOLATED_E1_ACTIONS.includes('chapter_plan_generate'), false);
    assert.equal(ISOLATED_E1_TASK_TYPES.has('chapter_plan_generate'), false);
    for (const action of ['chapter_rewrite', 'chapter_impact_assess', 'chapter_adopt_impact_assess'] as const) {
      assert.equal(ISOLATED_E1_ACTIONS.includes(action), true);
    }
    assert.equal(ISOLATED_E1_TASK_TYPES.has('chapter_body_rewrite'), true);
    assert.equal(ISOLATED_E1_TASK_TYPES.has('chapter_impact_assess'), true);
  });

  it('refuses unsafe environments, provider modes, and databases', () => {
    for (const override of [
      { runtimeEnvironment: 'production' }, { providerMode: 'deepseek' },
      { smokeUrl: undefined }, { smokeUrl: databaseUrl + '_other' },
      { databaseUrl: 'not-a-url', smokeUrl: 'not-a-url' },
      { databaseUrl: databaseUrl.replace('127.0.0.1', 'db.example.com') },
      { databaseUrl: databaseUrl.replace('64631', '3306') },
      { databaseUrl: databaseUrl.replace('ai_shortvideo_e1_20261014', 'ai_shortvideo') },
      { databaseUrl: databaseUrl.replace('e1_test', 'root') },
      { databaseUrl: databaseUrl.replace(':secret@', '@') },
      { databaseUrl: databaseUrl + '?connection_limit=1' }
    ]) {
      assert.throws(() => resolveIsolatedNovelAsyncEnabled({ ...valid(), ...override }),
        `Expected isolated policy to reject ${JSON.stringify(override)}`);
    }
  });
});
