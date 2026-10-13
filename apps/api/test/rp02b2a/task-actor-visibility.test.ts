import assert from 'node:assert/strict';
import { it } from 'node:test';
import { buildApp } from '../../src/app.js';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';

it('keeps task detail, events and mutations invisible to another user in the same tenant', async () => {
  const repository = createInMemoryNovelRepository();
  const app = await buildApp({ logger: false, novelRepository: repository,
    requestContextResolver: async (request) => ({
      tenantId: 'tenant-task-visibility',
      userId: request.headers['x-test-user'] === 'other' ? 'user-other' : 'user-owner'
    }) });
  try {
    const draft = await app.inject({ method: 'POST', url: '/novels/drafts', payload: { title: '任务归属隔离' } });
    assert.equal(draft.statusCode, 201);
    const novelId = draft.json().data.id as string;
    const generated = await app.inject({ method: 'POST', url: `/novels/${novelId}/directions/generate`, payload: {} });
    assert.equal(generated.statusCode, 200);
    const taskId = generated.json().data.task.id as string;
    const beforeEvents = repository.getGenerationTaskEvents().length;
    const beforeLogs = repository.getOperationLogs().length;

    for (const [method, url] of [
      ['GET', `/tasks/${taskId}`],
      ['GET', `/tasks/${taskId}/events`],
      ['POST', `/tasks/${taskId}/retry`],
      ['POST', `/tasks/${taskId}/cancel`]
    ] as const) {
      const response = await app.inject({ method, url, headers: { 'x-test-user': 'other' },
        ...(method === 'POST' ? { payload: {} } : {}) });
      assert.equal(response.statusCode, 404, `${method} ${url}: ${response.body}`);
    }
    assert.equal(repository.getGenerationTaskEvents().length, beforeEvents);
    assert.equal(repository.getOperationLogs().length, beforeLogs);
    assert.equal((await app.inject({ method: 'GET', url: `/tasks/${taskId}` })).statusCode, 200);
  } finally {
    await app.close();
  }
});
