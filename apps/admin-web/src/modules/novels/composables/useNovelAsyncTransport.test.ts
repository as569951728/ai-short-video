import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium, type Browser, type Page } from 'playwright'
import type { createApp, h } from 'vue'
import { TaskStatus, type TaskDetailDTO } from '@ai-shortvideo/shared'
import type { SubmissionIntentStore } from './submissionIntentStore.js'
import type { useNovelAsyncTransport } from './useNovelAsyncTransport.js'

type Transport = ReturnType<typeof useNovelAsyncTransport>
type DispatchStatus = 'queued' | 'processing' | 'waiting_confirmation' | 'completed' | 'failed' | 'cancelled'

declare global {
  interface Window {
    NovelAsyncTestModule: {
      createApp: typeof createApp
      h: typeof h
      useNovelAsyncTransport: typeof useNovelAsyncTransport
      SubmissionIntentStore: typeof SubmissionIntentStore
    }
    novelAsyncTest: { transport: Transport; taskIds: string[] }
  }
}

const scope = 'A'.repeat(43)
const terminalStatuses = [TaskStatus.WaitingConfirmation, TaskStatus.Completed, TaskStatus.Failed, TaskStatus.Cancelled] as const
let browser: Browser
let origin: string
let bundledSource: string
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end('<!doctype html><title>Async composable test</title><div id="app"></div>')
})

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test origin unavailable')
  origin = `http://127.0.0.1:${address.port}`
  const bundle = await build({
    stdin: {
      contents: `export { createApp, h } from 'vue';
        export { useNovelAsyncTransport } from './useNovelAsyncTransport.ts';
        export { SubmissionIntentStore } from './submissionIntentStore.ts';`,
      resolveDir: fileURLToPath(new URL('.', import.meta.url)),
    },
    bundle: true, platform: 'browser', format: 'iife', globalName: 'NovelAsyncTestModule', write: false,
    define: {
      'import.meta.env': JSON.stringify({ VITE_DATA_SOURCE: 'backend', VITE_API_BASE_URL: origin }),
      'process.env.NODE_ENV': '"test"',
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
  })
  bundledSource = bundle.outputFiles[0].text
  browser = await chromium.launch({ headless: true })
})

after(async () => {
  await browser?.close()
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

async function mountTransport(page: Page) {
  await page.addScriptTag({ content: bundledSource })
  await page.evaluate(() => {
    const api = window.NovelAsyncTestModule
    const taskIds: string[] = []
    api.createApp({
      setup() {
        window.novelAsyncTest = {
          transport: api.useNovelAsyncTransport(() => 'novel-e1', (id) => taskIds.push(id)), taskIds,
        }
        return () => api.h('div')
      },
    }).mount('#app')
  })
}

async function fixture(status: DispatchStatus, loseFirstResponse = false) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const submissions: Array<{ key: string; body: unknown }> = []
  const reply: { status: DispatchStatus; taskId: string; invalidResponse: boolean;
    failure: { status: number; code: string; message: string; details?: unknown } | null } = {
    status, taskId: 'task-original', failure: null, invalidResponse: false,
  }
  const capability = {
    contractVersion: 'v1', enabled: true, submissionScopeId: scope,
    capabilityRevision: 'B'.repeat(43), expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  }
  // Only the HTTP boundary is faked; Vue, the composable, transport and IndexedDB store are real.
  await context.route(`${origin}/novels/**`, async (route) => {
    if (new URL(route.request().url()).pathname === '/novels/async-transport-capability') {
      await route.fulfill({ json: { success: true, data: capability } })
      return
    }
    assert.equal(new URL(route.request().url()).pathname, '/novels/novel-e1/settings/generate')
    assert.equal(route.request().method(), 'POST')
    submissions.push({ key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() })
    if (loseFirstResponse && submissions.length === 1) {
      await route.abort('failed')
      return
    }
    if (reply.invalidResponse) {
      await route.fulfill({ status: 202, body: 'invalid JSON' })
      return
    }
    if (reply.failure) {
      const { status: httpStatus, ...error } = reply.failure
      await route.fulfill({ status: httpStatus, json: { success: false, error } })
      return
    }
    const terminal = terminalStatuses.some((value) => value === reply.status)
    await route.fulfill({
      status: terminal ? 200 : 202,
      json: { success: true, data: {
        kind: terminal ? 'existing' : 'accepted', taskId: reply.taskId, status: reply.status,
        action: 'setting_generate', objectId: 'novel-e1', pollUrl: `/tasks/${reply.taskId}`,
      } },
    })
  })
  await page.goto(origin)
  await page.clock.install()
  await mountTransport(page)
  return { page, context, submissions, reply, capability }
}

function submit(page: Page) {
  return page.evaluate(() => window.novelAsyncTest.transport.submit('setting_generate', { regenerateReason: 'Tighten pacing' }))
}

function updateTask(page: Page, status: DispatchStatus, id = 'task-original') {
  return page.evaluate(({ status, id }) =>
    window.novelAsyncTest.transport.taskUpdated({ id, status } as TaskDetailDTO), { status, id })
}

async function snapshot(page: Page) {
  return page.evaluate(async ({ origin, scope }) => {
    const { transport, taskIds } = window.novelAsyncTest
    const partition = { apiOrigin: origin, submissionScopeId: scope, novelId: 'novel-e1',
      objectId: 'novel-e1', action: 'setting_generate' as const }
    const store = new window.NovelAsyncTestModule.SubmissionIntentStore()
    const stored = await store.read(partition, scope)
    const receipt = stored ? await store.readReceipt(partition, stored.submissionId, scope) : null
    const rejection = stored ? await store.readRejection(partition, stored.submissionId, scope) : null
    return { active: transport.activeIntent.value, stored, receipt, rejection, taskIds,
      phase: transport.phase.value, message: transport.message.value }
  }, { origin, scope })
}

async function archivedRejection(page: Page, submissionId: string) {
  return page.evaluate(async ({ origin, scope, submissionId }) => {
    const store = new window.NovelAsyncTestModule.SubmissionIntentStore()
    return store.readRejection({ apiOrigin: origin, submissionScopeId: scope, novelId: 'novel-e1',
      objectId: 'novel-e1', action: 'setting_generate' }, submissionId, scope)
  }, { origin, scope, submissionId })
}

for (const code of ['VERSION_CONFLICT', 'CANDIDATE_STALE']) {
  test(`${code} retires the rejected intent, preserves its reason across reload, and requires an explicit new POST`, async () => {
    const { page, context, submissions, reply } = await fixture(TaskStatus.Queued)
    try {
      reply.failure = { status: 409, code, message: 'The source version changed; refresh first.' }
      assert.deepEqual(await submit(page), { kind: 'blocked' })
      const refused = await snapshot(page)
      assert.equal(refused.stored?.state, 'blocked')
      assert.equal(refused.stored?.retired, true)
      assert.equal(refused.stored?.taskId, undefined)
      assert.equal(refused.receipt, null)
      assert.match(refused.message, /source version changed/)
      assert.deepEqual(refused.taskIds, [])
      assert.deepEqual(refused.rejection, refused.stored)
      assert.deepEqual(await submit(page), { kind: 'blocked' })
      await page.clock.fastForward(60_000)
      assert.equal(submissions.length, 1)
      await refresh(page)
      assert.equal((await snapshot(page)).phase, 'ready')
      assert.match((await snapshot(page)).message, /source version changed/)
      assert.equal(submissions.length, 1)
      reply.failure = null
      assert.deepEqual(await submit(page), { kind: 'task', taskId: 'task-original' })
      assert.equal(submissions.length, 2)
      assert.notEqual(submissions[1].key, submissions[0].key)
      assert.deepEqual(await archivedRejection(page, refused.stored!.submissionId), refused.stored)
    } finally { await context.close() }
  })
}

test('conflict retirement never adopts the other task and allows an explicit submission after recheck', async () => {
  const { page, context, submissions, reply } = await fixture(TaskStatus.Queued)
  try {
    reply.failure = { status: 409, code: 'CONFLICT_TASK_EXISTS', message: 'busy', details: { existingTaskId: 'task-other' } }
    await submit(page)
    const refused = await snapshot(page)
    assert.equal(refused.stored?.retired, true)
    assert.equal(refused.stored?.taskId, undefined)
    assert.equal(refused.stored?.rejection?.existingTaskId, 'task-other')
    assert.match(refused.message, /task-other/)
    assert.deepEqual(refused.taskIds, [])
    await refresh(page)
    assert.match((await snapshot(page)).message, /task-other/)
    assert.deepEqual((await snapshot(page)).taskIds, [])
    await updateTask(page, TaskStatus.Completed, 'task-other')
    await page.clock.fastForward(60_000)
    assert.equal(submissions.length, 1)
    reply.failure = null
    await page.evaluate(() => window.novelAsyncTest.transport.recheckCapability())
    assert.equal(submissions.length, 1, 'recheck must not resubmit the rejected request')
    assert.equal((await snapshot(page)).phase, 'ready')
    await submit(page)
    assert.notEqual(submissions[1].key, submissions[0].key)
    assert.deepEqual((await snapshot(page)).taskIds, ['task-original'])
  } finally { await context.close() }
})

for (const kind of ['network', 'invalid_response', '5xx'] as const) {
  test(`${kind} remains unknown across reload and keeps the exact original key and payload`, async () => {
    const { page, context, submissions, reply } = await fixture(TaskStatus.Queued, kind === 'network')
    try {
      if (kind === 'invalid_response') reply.invalidResponse = true
      if (kind === '5xx') reply.failure = { status: 503, code: 'VERSION_CONFLICT', message: 'ambiguous server response' }
      await submit(page)
      const unknown = await snapshot(page)
      assert.equal(unknown.stored?.retired, false)
      assert.equal(unknown.stored?.deliveryUncertain, true)
      assert.equal(unknown.stored?.state, 'transport_unknown')
      await refresh(page)
      assert.equal((await snapshot(page)).stored?.idempotencyKey, submissions[0].key)
      assert.deepEqual(await submit(page), { kind: 'blocked' })
      assert.equal(submissions.length, 1)
      reply.invalidResponse = false
      reply.failure = null
      await page.evaluate(() => window.novelAsyncTest.transport.reconcileUnknown())
      assert.equal(submissions.length, 2)
      assert.deepEqual(submissions[1], submissions[0])
      assert.equal((await snapshot(page)).stored?.retired, false)
    } finally { await context.close() }
  })
}

for (const code of ['VERSION_CONFLICT', 'CANDIDATE_STALE', 'CONFLICT_TASK_EXISTS']) {
test(`${code} after an uncertain POST can manually recover the original task across reload`, async () => {
  const { page, context, submissions, reply } = await fixture(TaskStatus.Queued, true)
  try {
    await submit(page)
    reply.failure = { status: 409, code, message: 'source changed', details: { existingTaskId: 'task-other' } }
    await page.evaluate(() => window.novelAsyncTest.transport.reconcileUnknown())
    const blocked = await snapshot(page)
    assert.equal(blocked.stored?.retired, false)
    assert.equal(blocked.stored?.deliveryUncertain, true)
    assert.equal(blocked.stored?.state, 'transport_unknown')
    await refresh(page)
    await page.clock.fastForward(60_000)
    assert.equal(submissions.length, 2, 'reload must not automatically replay this rejection')
    await page.evaluate(() => window.novelAsyncTest.transport.recheckCapability())
    assert.equal(submissions.length, 3, 'explicit recheck must actually send the original request')
    assert.deepEqual(await submit(page), { kind: 'blocked' })
    await page.clock.fastForward(60_000)
    assert.equal(submissions.length, 3)
    assert.equal((await snapshot(page)).stored?.idempotencyKey, submissions[0].key)
    assert.equal((await snapshot(page)).stored?.retired, false)
    assert.deepEqual((await snapshot(page)).taskIds, [])
    reply.failure = null
    await page.evaluate(() => window.novelAsyncTest.transport.recheckCapability())
    assert.equal(submissions.length, 4)
    for (const submission of submissions) assert.deepEqual(submission, submissions[0])
    const recovered = await snapshot(page)
    assert.equal(recovered.stored?.submissionId, blocked.stored?.submissionId)
    assert.equal(recovered.stored?.taskId, 'task-original')
    assert.equal(recovered.phase, 'tracking')
    assert.deepEqual(recovered.taskIds, ['task-original'])
  } finally { await context.close() }
})
}

for (const code of ['VERSION_CONFLICT', 'CANDIDATE_STALE']) {
  test(`restores an older blocked ${code} record and manually recovers without replacing its key`, async () => {
    const { page, context, submissions, reply } = await fixture(TaskStatus.Queued, true)
    try {
      await submit(page)
      reply.failure = { status: 409, code, message: 'source changed' }
      await page.evaluate(() => window.novelAsyncTest.transport.reconcileUnknown())
      const original = (await snapshot(page)).stored!
      await page.evaluate(async () => {
        const { transport } = window.novelAsyncTest
        const intent = transport.activeIntent.value!
        const store = new window.NovelAsyncTestModule.SubmissionIntentStore()
        const result = await store.compareAndSet({ expectedSubmissionId: intent.submissionId,
          expectedRevision: intent.revision, trustedScopeId: intent.submissionScopeId },
        { ...intent, state: 'blocked', revision: intent.revision + 1 })
        if (!result.applied) throw new Error('Could not prepare older blocked record')
      })
      await refresh(page)
      await page.clock.fastForward(60_000)
      assert.equal(submissions.length, 2)
      assert.deepEqual(await submit(page), { kind: 'blocked' })
      reply.failure = null
      await page.evaluate(() => window.novelAsyncTest.transport.recheckCapability())
      assert.equal(submissions.length, 3)
      assert.deepEqual(submissions[2], submissions[0])
      const recovered = await snapshot(page)
      assert.equal(recovered.stored?.submissionId, original.submissionId)
      assert.equal(recovered.stored?.retired, false)
      assert.equal(recovered.stored?.taskId, 'task-original')
      assert.equal(recovered.phase, 'tracking')
    } finally { await context.close() }
  })
}

test('GateBlocked stays manual across reload and rechecks once per click with the same key', async () => {
  const { page, context, submissions, reply } = await fixture(TaskStatus.Queued)
  try {
    reply.failure = { status: 409, code: 'GATE_BLOCKED', message: 'business gate, not credentials' }
    await submit(page)
    const refused = await snapshot(page)
    assert.equal(submissions.length, 1)
    assert.equal(refused.stored?.retired, false)
    assert.equal(refused.stored?.rejection?.code, 'GATE_BLOCKED')
    assert.match(refused.message, /business gate/)
    await page.clock.fastForward(60_000)
    assert.equal(submissions.length, 1)
    await refresh(page)
    await page.clock.fastForward(60_000)
    await page.evaluate(() => window.novelAsyncTest.transport.reconcileUnknown())
    assert.deepEqual(await submit(page), { kind: 'blocked' })
    assert.equal(submissions.length, 1)
    await page.evaluate(() => window.novelAsyncTest.transport.recheckCapability())
    assert.equal(submissions.length, 2)
    assert.deepEqual(submissions[1], submissions[0])
    assert.equal((await snapshot(page)).stored?.retired, false)
    await refresh(page)
    await page.clock.fastForward(60_000)
    assert.equal(submissions.length, 2)
    reply.failure = null
    await page.evaluate(() => window.novelAsyncTest.transport.recheckCapability())
    assert.equal(submissions.length, 3)
    assert.deepEqual(submissions[2], submissions[0])
    assert.deepEqual((await snapshot(page)).taskIds, ['task-original'])
  } finally { await context.close() }
})

test('a network error during manual GateBlocked recheck does not resume automatic replay', async () => {
  const { page, context, submissions, reply } = await fixture(TaskStatus.Queued)
  try {
    reply.failure = { status: 409, code: 'GATE_BLOCKED', message: 'scope check required' }
    await submit(page)
    reply.failure = { status: 503, code: 'GATE_BLOCKED', message: 'outcome unknown' }
    await page.evaluate(() => window.novelAsyncTest.transport.recheckCapability())
    await refresh(page)
    await page.clock.fastForward(60_000)
    assert.equal(submissions.length, 2)
    assert.deepEqual(submissions[1], submissions[0])
    assert.equal((await snapshot(page)).stored?.retired, false)
    assert.deepEqual(await submit(page), { kind: 'blocked' })
  } finally { await context.close() }
})

test('manual gate recheck suspends across scope changes and refreshes only attestation on return', async () => {
  const { page, context, submissions, reply, capability } = await fixture(TaskStatus.Queued)
  try {
    reply.failure = { status: 409, code: 'GATE_BLOCKED', message: 'check required' }
    await submit(page)
    capability.submissionScopeId = 'C'.repeat(43)
    await page.evaluate(() => window.novelAsyncTest.transport.recheckCapability())
    assert.equal(submissions.length, 1)
    assert.equal((await snapshot(page)).phase, 'scope_suspended')
    capability.submissionScopeId = scope
    capability.capabilityRevision = 'D'.repeat(43)
    reply.failure = null
    await page.evaluate(() => window.novelAsyncTest.transport.recheckCapability())
    assert.equal(submissions.length, 2)
    assert.equal(submissions[1].key, submissions[0].key)
    assert.deepEqual(submissions[1].body, {
      ...(submissions[0].body as Record<string, unknown>), expectedCapabilityRevision: capability.capabilityRevision,
    })
    assert.deepEqual((await snapshot(page)).taskIds, ['task-original'])
  } finally { await context.close() }
})

async function refresh(page: Page) {
  await page.reload()
  await mountTransport(page)
  await page.evaluate(() => window.novelAsyncTest.transport.restore())
}

for (const status of terminalStatuses) {
  test(`retires a recovered ${status} response and permits only an explicit new submission`, async () => {
    const { page, context, submissions, reply } = await fixture(status, true)
    try {
      assert.deepEqual(await submit(page), { kind: 'blocked' })
      assert.equal((await snapshot(page)).active?.state, 'transport_unknown')
      await page.evaluate(() => window.novelAsyncTest.transport.reconcileUnknown())
      assert.equal(submissions.length, 2)
      assert.deepEqual(submissions[1], submissions[0])
      const bound = await snapshot(page)
      assert.equal(bound.active?.state, status)
      assert.equal(bound.active?.retired, false)
      assert.deepEqual(bound.taskIds, ['task-original'])

      await updateTask(page, status)
      const retired = await snapshot(page)
      assert.equal(retired.active?.retired, true)
      assert.equal(retired.stored?.retired, true)
      assert.equal(retired.receipt?.retired, true)
      assert.equal(retired.receipt?.status, status)
      assert.equal(retired.active?.idempotencyKey, bound.active?.idempotencyKey)

      await updateTask(page, status)
      await page.clock.fastForward(60_000)
      await page.evaluate(async () => {
        await window.novelAsyncTest.transport.reconcileUnknown()
        await window.novelAsyncTest.transport.recheckCapability()
      })
      assert.equal(submissions.length, 2, 'retirement and pending replay timers must not start a new paid task')
      assert.deepEqual((await snapshot(page)).stored, retired.stored)

      reply.status = TaskStatus.Queued
      reply.taskId = 'task-new'
      assert.deepEqual(await submit(page), { kind: 'task', taskId: 'task-new' })
      assert.equal(submissions.length, 3)
      assert.notEqual(submissions[2].key, submissions[0].key)
      assert.notEqual((await snapshot(page)).active?.submissionId, bound.active?.submissionId)
    } finally { await context.close() }
  })

  test(`refresh restores an unretired ${status} task, then taskUpdated retires it durably`, async () => {
    const { page, context, submissions, reply } = await fixture(status)
    try {
      assert.deepEqual(await submit(page), { kind: 'task', taskId: 'task-original' })
      const bound = await snapshot(page)
      await refresh(page)
      const restored = await snapshot(page)
      assert.deepEqual(restored.active, bound.active)
      assert.deepEqual(restored.taskIds, ['task-original'])
      assert.equal(submissions.length, 1)

      await updateTask(page, status)
      assert.equal((await snapshot(page)).stored?.retired, true)
      assert.equal((await snapshot(page)).receipt?.retired, true)
      await refresh(page)
      const settled = await snapshot(page)
      assert.equal(settled.active, null)
      assert.deepEqual(settled.taskIds, [])
      await page.clock.fastForward(60_000)
      await page.evaluate(() => window.novelAsyncTest.transport.reconcileUnknown())
      assert.equal(submissions.length, 1, 'refreshing a retired task must not resubmit it')

      reply.status = TaskStatus.Queued
      reply.taskId = 'task-new'
      assert.deepEqual(await submit(page), { kind: 'task', taskId: 'task-new' })
      assert.notEqual(submissions[1].key, submissions[0].key)
    } finally { await context.close() }
  })

  test(`still retires a queued task when it changes to ${status}`, async () => {
    const { page, context, submissions } = await fixture(TaskStatus.Queued)
    try {
      await submit(page)
      await updateTask(page, status, 'unrelated-task')
      assert.equal((await snapshot(page)).stored?.retired, false)
      await updateTask(page, status)
      const settled = await snapshot(page)
      assert.equal(settled.active?.state, status)
      assert.equal(settled.stored?.retired, true)
      assert.equal(settled.receipt?.retired, true)
      assert.equal(submissions.length, 1)
    } finally { await context.close() }
  })
}

for (const status of [TaskStatus.Queued, TaskStatus.Processing] as const) {
  test(`${status} recovery and refresh retain the original key without retirement or another POST`, async () => {
    const { page, context, submissions } = await fixture(status, true)
    try {
      await submit(page)
      await page.evaluate(() => window.novelAsyncTest.transport.reconcileUnknown())
      const bound = await snapshot(page)
      assert.equal(bound.active?.state, status)
      assert.equal(submissions.length, 2)
      assert.deepEqual(submissions[1], submissions[0])
      await updateTask(page, status)
      assert.deepEqual((await snapshot(page)).stored, bound.stored)
      assert.deepEqual(await submit(page), { kind: 'task', taskId: 'task-original' })
      await refresh(page)
      await updateTask(page, status)
      assert.deepEqual(await submit(page), { kind: 'task', taskId: 'task-original' })
      const restored = await snapshot(page)
      assert.deepEqual(restored.stored, bound.stored)
      assert.equal(restored.active?.retired, false)
      assert.equal(restored.receipt?.retired, false)
      assert.equal(restored.active?.idempotencyKey, submissions[0].key)
      assert.equal(submissions.length, 2)
    } finally { await context.close() }
  })
}
