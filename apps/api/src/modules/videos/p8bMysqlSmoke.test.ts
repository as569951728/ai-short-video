import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateP8bMysqlSmokeSafety, formatP8bMysqlSmokeSafetySummary } from './p8bMysqlSmoke.js';

describe('P8b MySQL smoke safety gate', () => {
  it('fails safely when DATABASE_URL is missing', () => {
    const result = evaluateP8bMysqlSmokeSafety({});

    assert.equal(result.ok, false);
    assert.equal(result.reasonCode, 'DATABASE_URL_MISSING');
    assert.equal(result.summary.databaseUrlConfigured, false);
    assert.equal(result.message.includes('未配置'), true);
  });

  it('rejects non-local database hosts without printing the full URL', () => {
    const databaseUrl = 'mysql://smoke_user:secret-password@prod-db.example.com:3306/ai_shortvideo_smoke';
    const result = evaluateP8bMysqlSmokeSafety({
      DATABASE_URL: databaseUrl,
      ALLOW_P8B_SMOKE_DB_WRITE: '1'
    });
    const output = formatP8bMysqlSmokeSafetySummary(result);

    assert.equal(result.ok, false);
    assert.equal(result.reasonCode, 'DATABASE_HOST_NOT_LOCAL');
    assert.equal(output.includes(databaseUrl), false);
    assert.equal(output.includes('smoke_user'), false);
    assert.equal(output.includes('secret-password'), false);
  });

  it('rejects database names without safe dev, test, smoke, or local markers', () => {
    const result = evaluateP8bMysqlSmokeSafety({
      DATABASE_URL: 'mysql://user:secret@localhost:3306/ai_shortvideo',
      ALLOW_P8B_SMOKE_DB_WRITE: '1'
    });

    assert.equal(result.ok, false);
    assert.equal(result.reasonCode, 'DATABASE_NAME_NOT_SAFE');
    assert.equal(result.summary.hostIsLocal, true);
    assert.equal(result.summary.databaseNameLooksSafe, false);
  });

  it('rejects otherwise safe databases without the explicit write authorization switch', () => {
    const result = evaluateP8bMysqlSmokeSafety({
      DATABASE_URL: 'mysql://user:secret@127.0.0.1:3306/ai_shortvideo_smoke'
    });

    assert.equal(result.ok, false);
    assert.equal(result.reasonCode, 'SMOKE_WRITE_NOT_ALLOWED');
    assert.equal(result.summary.hostIsLocal, true);
    assert.equal(result.summary.databaseNameLooksSafe, true);
    assert.equal(result.summary.writeAuthorized, false);
  });

  it('passes only for local safe-named databases with explicit write authorization and keeps summaries redacted', () => {
    const databaseUrl = 'mysql://user:secret@127.0.0.1:3306/ai_shortvideo_smoke';
    const result = evaluateP8bMysqlSmokeSafety({
      DATABASE_URL: databaseUrl,
      ALLOW_P8B_SMOKE_DB_WRITE: '1'
    });
    const output = formatP8bMysqlSmokeSafetySummary(result);

    assert.equal(result.ok, true);
    assert.equal(result.summary.databaseUrlConfigured, true);
    assert.equal(result.summary.hostIsLocal, true);
    assert.equal(result.summary.databaseNameLooksSafe, true);
    assert.equal(result.summary.writeAuthorized, true);
    assert.equal(output.includes(databaseUrl), false);
    assert.equal(output.includes('user'), false);
    assert.equal(output.includes('secret'), false);
  });
});
