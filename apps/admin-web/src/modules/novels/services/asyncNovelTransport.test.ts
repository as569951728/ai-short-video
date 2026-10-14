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
  assert.deepEqual(normalizeGenerationRequest('direction_fuse', {
    versionIds: ['cv-2', 'cv-1'], reason: ' 融合钩子 ',
  }), { versionIds: ['cv-1', 'cv-2'], reason: '融合钩子' })
  assert.throws(() => normalizeGenerationRequest('direction_fuse', { versionIds: ['cv-1', 'cv-1'] }))
  assert.deepEqual(normalizeGenerationRequest('direction_optimize', {
    versionId: ' cv-1 ', instruction: ' 强化冲突 ',
  }), { versionId: 'cv-1', instruction: '强化冲突' })
  assert.throws(() => normalizeGenerationRequest('direction_optimize', { instruction: '强化冲突' }))
  assert.throws(() => normalizeGenerationRequest('setting_generate', { unsafe: 'secret' } as never))
  assert.deepEqual(normalizeGenerationRequest('trial_chapter_one_generate', { chapterCount: 3 }), { chapterCount: 3 })
  assert.deepEqual(normalizeGenerationRequest('trial_followup_generate', {
    trialRunId: ' run-1 ', selectedCandidateId: ' candidate-1 ', confirmRisk: true,
    selectionReason: ' 接受风险 ',
  }), { trialRunId: 'run-1', selectedCandidateId: 'candidate-1', confirmRisk: true,
    selectionReason: '接受风险' })
  assert.throws(() => normalizeGenerationRequest('trial_chapter_one_generate', { chapterCount: 4 }))
  assert.throws(() => normalizeGenerationRequest('trial_followup_generate', { trialRunId: 'run-1' }))
  assert.throws(() => normalizeGenerationRequest('trial_followup_generate', {
    trialRunId: 'run-1', selectedCandidateId: 'candidate-1', optimization: {
      sourceVersionId: 'v-1', instruction: 'not allowed',
    },
  }))
  assert.deepEqual(normalizeGenerationRequest('novel_full_review', {
    expectedNovelVersion: '2030-01-01T00:00:00.000Z', reviewPolicyVersionId: ' policy-v1 ',
  }), { expectedNovelVersion: '2030-01-01T00:00:00.000Z', reviewPolicyVersionId: 'policy-v1' })
  assert.throws(() => normalizeGenerationRequest('novel_full_review', { regenerateReason: 'retry' }))
  assert.throws(() => normalizeGenerationRequest('novel_full_review', { expectedNovelVersion: 'invalid' }))
})

it('submits direction fusion and optimization with stable replay targets', async () => {
  const oldFetch = globalThis.fetch
  const requests: Array<{ url: string; body: Record<string, unknown> }> = []
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    requests.push({ url: String(url), body })
    const optimize = String(url).endsWith('/directions/cv-1/optimize')
    return Response.json({ success: true, data: {
      kind: 'accepted', taskId: optimize ? 'task-optimize' : 'task-fuse',
      action: optimize ? 'direction_optimize' : 'direction_fuse',
      objectId: optimize ? 'cv-1' : 'novel-1', status: 'queued', reused: false,
      pollUrl: optimize ? '/tasks/task-optimize' : '/tasks/task-fuse',
    }, error: null, requestId: 'req-direction' }, { status: 202 })
  }
  try {
    await submitAsyncNovelGeneration({ novelId: 'novel-1', action: 'direction_fuse',
      request: { versionIds: ['cv-2', 'cv-1'], reason: '融合钩子' },
      idempotencyKey: 'fuse-stable-key', capability: enabledCapability })
    await submitAsyncNovelGeneration({ novelId: 'novel-1', action: 'direction_optimize',
      request: { versionId: 'cv-1', instruction: '强化冲突' },
      idempotencyKey: 'optimize-stable-key', capability: enabledCapability })
    assert.match(requests[0]!.url, /\/novels\/novel-1\/directions\/fuse$/)
    assert.deepEqual(requests[0]!.body.versionIds, ['cv-1', 'cv-2'])
    assert.match(requests[1]!.url, /\/novels\/novel-1\/directions\/cv-1\/optimize$/)
    assert.equal(requests[1]!.body.versionId, 'cv-1')
  } finally {
    globalThis.fetch = oldFetch
  }
})

it('submits full review through its task endpoint with one stable request', async () => {
  const oldFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (url, init) => {
    calls += 1
    assert.match(String(url), /\/novels\/novel-1\/full-review$/)
    assert.equal(new Headers(init?.headers).get('Idempotency-Key'), 'review-stable-key')
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    assert.equal(body.expectedNovelVersion, '2030-01-01T00:00:00.000Z')
    assert.equal(body.expectedSubmissionScopeId, enabledCapability.submissionScopeId)
    return Response.json({ success: true, data: {
      kind: 'accepted', taskId: 'task-review', action: 'novel_full_review', objectId: 'novel-1',
      status: 'queued', reused: false, pollUrl: '/tasks/task-review',
    }, error: null, requestId: 'req-review' }, { status: 202 })
  }
  try {
    const result = await submitAsyncNovelGeneration({ novelId: 'novel-1', action: 'novel_full_review',
      request: { expectedNovelVersion: '2030-01-01T00:00:00.000Z' },
      idempotencyKey: 'review-stable-key', capability: enabledCapability })
    assert.equal(result.taskId, 'task-review')
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = oldFetch
  }
})

it('validates trial followup dispatch against its trial run object, not the novel', async () => {
  const oldFetch = globalThis.fetch
  let objectId = 'run-1'
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/novels\/novel-1\/trial\/generate$/)
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    assert.equal(body.trialRunId, 'run-1')
    assert.equal(body.selectedCandidateId, 'candidate-1')
    return Response.json({ success: true, data: {
      kind: 'accepted', taskId: 'task-trial', action: 'trial_followup_generate', objectId,
      status: 'queued', reused: false, pollUrl: '/tasks/task-trial',
    }, error: null, requestId: 'req-trial' }, { status: 202 })
  }
  try {
    const input = { novelId: 'novel-1', action: 'trial_followup_generate' as const,
      request: { trialRunId: 'run-1', selectedCandidateId: 'candidate-1' },
      idempotencyKey: 'trial-followup-stable-key', capability: enabledCapability }
    assert.equal((await submitAsyncNovelGeneration(input)).taskId, 'task-trial')
    objectId = 'novel-1'
    await assert.rejects(() => submitAsyncNovelGeneration(input),
      (error) => error instanceof ApiClientError && error.code === 'INVALID_RESPONSE')
  } finally {
    globalThis.fetch = oldFetch
  }
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

it('rejects malformed partial capabilities and prevents an unsupported action from posting', async () => {
  const oldFetch = globalThis.fetch
  let calls = 0
  let actions: unknown = ['direction_generate', 'direction_generate']
  globalThis.fetch = async () => {
    calls += 1
    return Response.json({ success: true, data: { ...enabledCapability, enabledActions: actions },
      error: null, requestId: 'req-partial' })
  }
  try {
    await assert.rejects(getAsyncNovelTransportCapability,
      (error) => error instanceof ApiClientError && error.code === 'INVALID_RESPONSE')
    actions = ['direction_generate']
    const partial = await getAsyncNovelTransportCapability()
    assert.deepEqual(partial.enabled && partial.enabledActions, ['direction_generate'])
    const beforeSubmit = calls
    await assert.rejects(() => submitAsyncNovelGeneration({ novelId: 'novel-1',
      action: 'chapter_plan_generate', request: {}, idempotencyKey: 'blocked-plan',
      capability: partial as Extract<NovelAsyncTransportCapabilityV1, { enabled: true }> }),
    (error) => error instanceof ApiClientError && error.code === 'INVALID_RESPONSE')
    assert.equal(calls, beforeSubmit)
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
