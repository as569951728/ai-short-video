import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from './app.js';

describe('api foundation', () => {
  it('returns health checks in the unified response envelope', async () => {
    const app = await buildApp({ logger: false });
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': 'test-request-id'
      }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['x-request-id'], 'test-request-id');
    assert.deepEqual(response.json(), {
      success: true,
      data: {
        service: 'ai-shortvideo-api',
        status: 'ok'
      },
      error: null,
      requestId: 'test-request-id'
    });

    await app.close();
  });

  it('exposes shared enum metadata for front-end labels', async () => {
    const app = await buildApp({ logger: false });
    const response = await app.inject({
      method: 'GET',
      url: '/contracts/enums'
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.success, true);
    assert.equal(body.data.novelCreationStage[4].value, 'chapter_plan');
    assert.equal(body.data.novelCreationStage[4].label, '章节目录');
    assert.equal(body.data.taskStatus[2].value, 'waiting_confirmation');
    assert.ok(body.requestId);

    await app.close();
  });

  it('returns validation failures with unified error shape', async () => {
    const app = await buildApp({ logger: false });
    const response = await app.inject({
      method: 'GET',
      url: '/novels?page=0&pageSize=20',
      headers: {
        'x-request-id': 'bad-page'
      }
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: '请求参数不合法',
        details: {
          issues: [
            {
              path: 'page',
              message: 'must be >= 1'
            }
          ]
        }
      },
      requestId: 'bad-page'
    });

    await app.close();
  });
});
