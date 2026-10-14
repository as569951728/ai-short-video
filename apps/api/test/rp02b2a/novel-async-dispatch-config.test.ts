import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { resolveNovelAsyncDispatchConfig } from '../../src/config/novelAsyncDispatch.js';
import { ISOLATED_E1_ACTIONS, ISOLATED_E1_TASK_TYPES } from '../../src/config/isolatedNovelAsyncPolicy.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';
import { getActionExecutionPlan } from '../../src/modules/novels/services/actionExecutionPlan.js';

const databaseUrl = 'mysql://novel_service:private-password@db.invalid:3306/novels?connection_limit=2';
const valid = () => ({
  flag: 'true', runtimeEnvironment: 'production', providerMode: 'deepseek', databaseUrl,
  deploymentActor: { tenantId: 'tenant-deployment', userId: 'user-deployment' },
  scopeSecret: 'persistent-scope-secret-32-bytes-minimum', apiAudience: 'novel-api'
});

describe('regular novel async dispatch configuration', () => {
  it('is opt-in and does not validate inactive configuration', () => {
    for (const flag of [undefined, 'false']) {
      assert.equal(resolveNovelAsyncDispatchConfig({ flag, runtimeEnvironment: 'test', providerMode: 'unknown' }), null);
    }
    for (const flag of ['', '1', 'TRUE', 'yes']) {
      assert.throws(() => resolveNovelAsyncDispatchConfig({ ...valid(), flag }), /NOVEL_ASYNC_DISPATCH_ENABLED/);
    }
  });

  for (const runtimeEnvironment of ['development', 'production']) {
    for (const providerMode of ['mock', 'deepseek']) {
      it(`allows explicitly configured ${runtimeEnvironment}/${providerMode} with exactly 13 E1 actions`, () => {
        const config = resolveNovelAsyncDispatchConfig({ ...valid(), runtimeEnvironment, providerMode });
        assert.ok(config);
        assert.equal(config.asyncTransportPolicy.novelAsyncDispatchEnabled, true);
        assert.equal(config.asyncTransportPolicy.durableRuntimeConfigured, true);
        assert.deepEqual(config.asyncTransportPolicy.enabledActions, ISOLATED_E1_ACTIONS);
        assert.equal(config.asyncTransportPolicy.enabledActions?.length, 13);
        assert.deepEqual(config.enabledLeasedTaskTypes, ISOLATED_E1_TASK_TYPES);
        assert.deepEqual(config.enabledLeasedTaskTypes,
          new Set(ISOLATED_E1_ACTIONS.map((action) => getActionExecutionPlan(action).taskType)));
      });
    }
  }

  it('keeps Prisma leased task types aligned with advertised actions and denies E2/E3', async () => {
    const config = resolveNovelAsyncDispatchConfig(valid())!;
    // Exercise the real capability method without constructing a database client.
    const repository = Object.create(PrismaNovelRepository.prototype) as PrismaNovelRepository;
    Object.defineProperty(repository, 'options', { value: { enabledLeasedTaskTypes: config.enabledLeasedTaskTypes } });
    for (const action of ISOLATED_E1_ACTIONS) {
      assert.equal(await repository.getLeasedExecutionCapability(getActionExecutionPlan(action).taskType), 'enabled');
    }
    for (const action of ['chapter_plan_generate', 'chapter_body_generate', 'body_batch_generate'] as const) {
      assert.equal((config.asyncTransportPolicy.enabledActions as readonly string[]).includes(action), false);
      assert.equal(await repository.getLeasedExecutionCapability(getActionExecutionPlan(action).taskType), 'disabled');
    }
  });

  const invalid: Array<[string, Partial<ReturnType<typeof valid>>, RegExp]> = [
    ['test runtime', { runtimeEnvironment: 'test' }, /NODE_ENV/],
    ['unknown runtime', { runtimeEnvironment: 'staging' }, /NODE_ENV/],
    ['unsupported provider', { providerMode: 'openai' }, /AI_PROVIDER_MODE/],
    ['misspelled provider', { providerMode: 'deepseak' }, /AI_PROVIDER_MODE/],
    ['empty provider', { providerMode: '' }, /AI_PROVIDER_MODE/],
    ['missing database', { databaseUrl: undefined }, /DATABASE_URL/],
    ['blank database', { databaseUrl: '   ' }, /DATABASE_URL/],
    ['malformed database', { databaseUrl: 'not-a-url' }, /DATABASE_URL/],
    ['non-MySQL database', { databaseUrl: 'postgres://user:private-password@db.invalid/novels' }, /DATABASE_URL/],
    ['missing schema', { databaseUrl: 'mysql://user:private-password@db.invalid/' }, /DATABASE_URL/],
    ['missing secret', { scopeSecret: undefined }, /NOVEL_ASYNC_SCOPE_SECRET/],
    ['short secret', { scopeSecret: 'a'.repeat(31) }, /NOVEL_ASYNC_SCOPE_SECRET/],
    ['blank secret', { scopeSecret: ' '.repeat(32) }, /NOVEL_ASYNC_SCOPE_SECRET/],
    ['missing audience', { apiAudience: undefined }, /NOVEL_ASYNC_API_AUDIENCE/],
    ['blank audience', { apiAudience: '  ' }, /NOVEL_ASYNC_API_AUDIENCE/],
    ['missing actor', { deploymentActor: undefined }, /DEPLOYMENT_ACTOR/],
    ['missing tenant', { deploymentActor: { tenantId: '', userId: 'user-deployment' } }, /DEPLOYMENT_ACTOR/],
    ['missing user', { deploymentActor: { tenantId: 'tenant-deployment', userId: '' } }, /DEPLOYMENT_ACTOR/],
    ['placeholder tenant', { deploymentActor: { tenantId: 'tenant_default', userId: 'user-deployment' } }, /DEPLOYMENT_ACTOR/],
    ['placeholder user', { deploymentActor: { tenantId: 'tenant-deployment', userId: 'mock_actor' } }, /DEPLOYMENT_ACTOR/]
  ];
  for (const [label, override, expected] of invalid) {
    it(`fails closed for ${label}`, () => {
      assert.throws(() => resolveNovelAsyncDispatchConfig({ ...valid(), ...override }), (error: Error) => {
        assert.match(error.message, expected);
        assert.equal(error.message.includes('private-password'), false);
        assert.equal(error.message.includes(valid().scopeSecret), false);
        return true;
      });
    });
  }

  it('measures the secret in UTF-8 bytes and preserves provider normalization', () => {
    for (const scopeSecret of ['a'.repeat(32), '\u00e9'.repeat(16)]) {
      const config = resolveNovelAsyncDispatchConfig({ ...valid(), scopeSecret, providerMode: ' DeepSeek ', apiAudience: ' novel-api ' });
      assert.equal(config?.asyncTransportPolicy.scopeSecret, scopeSecret);
      assert.equal(config?.asyncTransportPolicy.apiAudience, 'novel-api');
    }
    assert.throws(() => resolveNovelAsyncDispatchConfig({ ...valid(), scopeSecret: '\u00e9'.repeat(15) }), /32 UTF-8 bytes/);
  });
});

describe('regular entrypoint startup validation', () => {
  const childEnv = () => ({
    PATH: process.env.PATH,
    DOTENV_CONFIG_PATH: '/dev/null', NODE_ENV: 'production', AI_PROVIDER_MODE: 'mock',
    DATABASE_URL: databaseUrl, NOVEL_ASYNC_DISPATCH_ENABLED: 'true',
    NOVEL_ASYNC_SCOPE_SECRET: valid().scopeSecret, NOVEL_ASYNC_API_AUDIENCE: 'novel-api',
    DEPLOYMENT_ACTOR_TENANT_ID: 'tenant-deployment', DEPLOYMENT_ACTOR_USER_ID: 'user-deployment'
  });
  const entrypoint = new URL('../../src/main.ts', import.meta.url).href;
  const guardedImport = `
    import net from 'node:net';
    const deny = () => { throw new Error('UNEXPECTED_NETWORK_OR_LISTEN'); };
    net.Server.prototype.listen = deny;
    net.Socket.prototype.connect = deny;
    globalThis.fetch = deny;
    await import(${JSON.stringify(entrypoint)});
  `;

  it('parses the new flag as false when absent', () => {
    const envModule = new URL('../../src/config/env.ts', import.meta.url).href;
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval',
      `const { env } = await import(${JSON.stringify(envModule)}); console.log(env.NOVEL_ASYNC_DISPATCH_ENABLED);`], {
      env: { PATH: process.env.PATH, DOTENV_CONFIG_PATH: '/dev/null' }, encoding: 'utf8', timeout: 10_000
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'false');
  });

  const failures: Array<[string, Record<string, string | undefined>, RegExp]> = [
    ['invalid flag', { NOVEL_ASYNC_DISPATCH_ENABLED: 'yes' }, /NOVEL_ASYNC_DISPATCH_ENABLED/],
    ['unsupported provider', { AI_PROVIDER_MODE: 'deepseak' }, /AI_PROVIDER_MODE/],
    ['missing database', { DATABASE_URL: undefined }, /DATABASE_URL/],
    ['invalid database', { DATABASE_URL: 'postgres://user:private-password@db.invalid/novels' }, /DATABASE_URL/],
    ['missing secret', { NOVEL_ASYNC_SCOPE_SECRET: undefined }, /NOVEL_ASYNC_SCOPE_SECRET/],
    ['short secret', { NOVEL_ASYNC_SCOPE_SECRET: 'short' }, /NOVEL_ASYNC_SCOPE_SECRET/],
    ['missing audience', { NOVEL_ASYNC_API_AUDIENCE: undefined }, /NOVEL_ASYNC_API_AUDIENCE/],
    ['missing actor', { DEPLOYMENT_ACTOR_USER_ID: undefined }, /DEPLOYMENT_ACTOR/],
    ['placeholder actor', { DEPLOYMENT_ACTOR_TENANT_ID: 'tenant_default' }, /DEPLOYMENT_ACTOR/],
    ['test runtime', { NODE_ENV: 'test' }, /NODE_ENV/],
    ['invalid config with legacy dev flag', { DATABASE_URL: undefined, NODE_ENV: 'development', NOVEL_ASYNC_DISPATCH_DEV_ENABLED: 'true' }, /DATABASE_URL/]
  ];
  for (const [label, override, expected] of failures) {
    it(`rejects ${label} before listen without synchronous fallback`, () => {
      const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', guardedImport], {
        env: { ...childEnv(), ...override }, encoding: 'utf8', timeout: 10_000
      });
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expected);
      assert.doesNotMatch(result.stderr, /UNEXPECTED_NETWORK_OR_LISTEN|private-password|persistent-scope-secret/);
    });
  }
});
