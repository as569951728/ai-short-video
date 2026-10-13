import assert from 'node:assert/strict'
import { it } from 'node:test'
import type { NovelAsyncTransportCapabilityV1 } from '@ai-shortvideo/shared'
import { ApiClientError } from '../../../shared/services/http.js'
import {
  classifyAsyncDispatchFailure,
  getAsyncNovelTransportCapability,
  normalizeGenerationRequest,
  submitAsyncNovelGeneration,
} from './asyncNovelTransport.js'

const enabledCapability: Extract<NovelAsyncTransportCapabilityV1, { enabled: true }> = {
  contractVersion: 'v1', enabled: true,
  submissionScopeId: 's'.repeat(43), capabilityRevision: 'r'.repeat(43),
  expiresAt: '2099-01-01T00:00:00.000Z',
}

it('normalizes only bounded, action-specific replay fields', () => {
  assert.deepEqual(normalizeGenerationRequest('outline_generate', {
    regenerateReason: '  再试一次  ',
    optimization: { sourceVersionId: ' cv-1 ', instruction: ' 改进节奏 ' },
  }), {
    regenerateReason: '再试一次',
    optimization: { sourceVersionId: 'cv-1', instruction: '改进节奏' },
  })
  assert.throws(() => normalizeGenerationRequest('direction_generate', {
    optimization: { sourceVersionId: 'cv-1', instruction: '改进节奏' },
  }))
  assert.throws(() => normalizeGenerationRequest('setting_generate', { unsafe: 'secret' } as never))
})

it('checks the capability contract and does not create a task', async () => {
  const oldFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (_url, init) => {
    calls += 1
    assert.equal(init?.method, undefined)
    return Response.json({ success: true, data: enabledCapability, error: null, requestId: 'req-capability' })
  }
  try {
    assert.deepEqual(await getAsyncNovelTransportCapability(), enabledCapability)
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = oldFetch
  }
})

it('distinguishes 202 accepted from 200 existing and preserves the same submission key', async () => {
  const oldFetch = globalThis.fetch
  const requests: Array<{ key: string | null; body: Record<string, unknown> }> = []
  let status = 202
  globalThis.fetch = async (_url, init) => {
    requests.push({
      key: new Headers(init?.headers).get('Idempotency-Key'),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    })
    return Response.json({ success: true, data: {
      kind: status === 202 ? 'accepted' : 'existing',
      taskId: 'task-1', action: 'outline_generate', objectId: 'novel-1',
      status: status === 202 ? 'queued' : 'waiting_confirmation', reused: status === 200,
      pollUrl: '/tasks/task-1',
    }, error: null, requestId: 'req-submit' }, { status })
  }
  try {
    const input = { novelId: 'novel-1', action: 'outline_generate' as const,
      request: { regenerateReason: '再次生成' }, idempotencyKey: 'stable-key', capability: enabledCapability }
    assert.equal((await submitAsyncNovelGeneration(input)).kind, 'accepted')
    status = 200
    assert.equal((await submitAsyncNovelGeneration(input)).kind, 'existing')
    assert.deepEqual(requests.map((request) => request.key), ['stable-key', 'stable-key'])
    assert.deepEqual(requests[0]?.body, {
      regenerateReason: '再次生成', expectedSubmissionScopeId: enabledCapability.submissionScopeId,
      expectedCapabilityRevision: enabledCapability.capabilityRevision,
      expectedCapabilityExpiresAt: enabledCapability.expiresAt,
    })
  } finally {
    globalThis.fetch = oldFetch
  }
})

it('rejects an inconsistent status/contract response without creating a new key', async () => {
  const oldFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ success: true, data: {
    kind: 'accepted', taskId: 'task-1', action: 'outline_generate', objectId: 'novel-1',
    status: 'queued', reused: false, pollUrl: '/tasks/task-1',
  }, error: null, requestId: 'req-bad' }, { status: 200 })
  try {
    await assert.rejects(() => submitAsyncNovelGeneration({ novelId: 'novel-1', action: 'outline_generate',
      request: {}, idempotencyKey: 'stable-key', capability: enabledCapability }),
    (error) => error instanceof ApiClientError && error.code === 'INVALID_RESPONSE')
  } finally {
    globalThis.fetch = oldFetch
  }
})

it('classifies safe conflict details and keeps network ambiguity distinct', () => {
  assert.deepEqual(classifyAsyncDispatchFailure(new ApiClientError('CONFLICT_TASK_EXISTS', '已有任务', 'req', {
    existingTaskId: 'task-older', rawProviderOutput: 'not for display',
  })), { kind: 'active_task', existingTaskId: 'task-older' })
  assert.deepEqual(classifyAsyncDispatchFailure(new ApiClientError('IDEMPOTENCY_CONFLICT', '提交内容已改变')),
    { kind: 'idempotency_conflict' })
  assert.deepEqual(classifyAsyncDispatchFailure(new ApiClientError('GATE_BLOCKED', '凭证已失效')),
    { kind: 'attestation_stale' })
  assert.deepEqual(classifyAsyncDispatchFailure(new ApiClientError('NETWORK_ERROR', '网络中断')),
    { kind: 'transport_unknown' })
})
