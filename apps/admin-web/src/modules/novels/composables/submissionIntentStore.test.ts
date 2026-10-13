import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { normalizeReplayRequest } from './submissionIntentStore.js'

const scopeA = 'A'.repeat(43)
const scopeB = 'B'.repeat(43)
const now = Date.parse('2026-10-14T00:00:00.000Z')
const attestation = { submissionScopeId: scopeA, capabilityRevision: 'policy-v1', capabilityExpiresAt: new Date(now + 300_000).toISOString() }

let browser: Browser
let context: BrowserContext
let origin: string
let bundledSource: string
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end('<!doctype html><title>SubmissionIntentStore IDB test</title>')
})

before(async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('./submissionIntentStore.ts', import.meta.url))],
    bundle: true, platform: 'browser', format: 'iife', globalName: 'SubmissionIntentModule',
    write: false,
  })
  bundledSource = bundle.outputFiles[0].text
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test HTTP origin unavailable')
  origin = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: true })
  context = await browser.newContext()
})

after(async () => {
  await browser?.close()
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

async function page(): Promise<Page> {
  const tab = await context.newPage()
  await tab.goto(origin)
  await tab.addScriptTag({ content: bundledSource })
  await tab.addScriptTag({ content: 'window.__name = function(value) { return value }' })
  return tab
}

function partition(action = 'direction_generate') {
  return { apiOrigin: origin, submissionScopeId: scopeA, novelId: 'novel_000001', action, objectId: 'novel_000001' }
}

test('keeps structure optimization in the strict replay payload', () => {
  const request = { optimization: { sourceVersionId: 'cv-1', instruction: '调整人物动机' } }
  assert.deepEqual(normalizeReplayRequest('outline_generate', request), request)
  assert.throws(() => normalizeReplayRequest('direction_generate', request))
})

test('IndexedDB commit, scoped replay, monotonic revision and retired receipt', async () => {
  const tab = await page()
  try {
    const result = await tab.evaluate(async ({ partition, attestation, scopeA, now }) => {
      const api = (window as any).SubmissionIntentModule
      const counts = { read: 0, write: 0, complete: 0, abort: 0 }
      const store = new api.SubmissionIntentStore({
        databaseName: 'commit-retire', now: () => now,
        probe: {
          onStart: (_tx: IDBTransaction, mode: IDBTransactionMode) => { counts[mode === 'readwrite' ? 'write' : 'read'] += 1 },
          onComplete: () => { counts.complete += 1 }, onAbort: () => { counts.abort += 1 },
        },
      })
      const first = await store.create(partition, { regenerateReason: '改善节奏' }, attestation, scopeA)
      if (!first.applied) throw new Error(`First create failed: ${JSON.stringify(first)}`)
      const duplicate = await store.create(partition, {}, attestation, scopeA)
      const initial = await store.read(partition, scopeA)
      const replay = await api.verifiedReplayRequest(initial)
      const unknown = await store.compareAndSet({ expectedSubmissionId: initial.submissionId, expectedRevision: 1, trustedScopeId: scopeA },
        { ...initial, state: 'transport_unknown', revision: 2 })
      const stale = await store.compareAndSet({ expectedSubmissionId: initial.submissionId, expectedRevision: 1, trustedScopeId: scopeA },
        { ...initial, state: 'transport_unknown', revision: 2 })
      const inFlight = await store.read(partition, scopeA)
      const accepted = await store.compareAndSet({ expectedSubmissionId: inFlight.submissionId, expectedRevision: 2, trustedScopeId: scopeA },
        { ...inFlight, taskId: 'task_000001', pollUrl: '/tasks/task_000001', state: 'queued', revision: 3 })
      const queued = await store.read(partition, scopeA)
      const waiting = await store.compareAndSet({ expectedSubmissionId: queued.submissionId, expectedRevision: 3, trustedScopeId: scopeA },
        { ...queued, state: 'waiting_confirmation', revision: 4 })
      const settled = await store.read(partition, scopeA)
      const retired = await store.retire({ expectedSubmissionId: settled.submissionId, expectedRevision: 4, trustedScopeId: scopeA }, settled)
      const previousReceipt = await store.readReceipt(partition, settled.submissionId, scopeA)
      const next = await store.create(partition, {}, attestation, scopeA)
      const current = await store.read(partition, scopeA)
      const delayedOldResponse = await store.compareAndSet(
        { expectedSubmissionId: settled.submissionId, expectedRevision: 5, trustedScopeId: scopeA },
        { ...settled, state: 'completed', revision: 6 },
      )
      return {
        first, duplicate, replay, unknown, stale, accepted, waiting, retired,
        previousReceipt, next, current, delayedOldResponse, counts,
      }
    }, { partition: partition(), attestation, scopeA, now })
    assert.equal(result.first.applied, true)
    assert.deepEqual(result.replay, { regenerateReason: '改善节奏' })
    assert.deepEqual(result.duplicate, { applied: false, reason: 'stale' })
    assert.equal(result.unknown.applied, true)
    assert.deepEqual(result.stale, { applied: false, reason: 'stale' })
    assert.equal(result.accepted.applied, true)
    assert.equal(result.waiting.applied, true)
    assert.equal(result.retired.applied, true)
    assert.equal(result.previousReceipt.retired, true)
    assert.equal(result.previousReceipt.taskId, 'task_000001')
    assert.equal(result.next.applied, true)
    assert.equal(result.current.revision, 6)
    assert.notEqual(result.current.submissionId, result.first.intent.submissionId)
    assert.notEqual(result.current.idempotencyKey, result.first.intent.idempotencyKey)
    assert.deepEqual(result.delayedOldResponse, { applied: false, reason: 'stale' })
    assert.equal(result.counts.abort, 0)
    assert.equal(result.counts.write, 8)
    assert.equal(result.counts.complete, result.counts.read + result.counts.write)
  } finally {
    await tab.close()
  }
})

test('scope switch suspends in readwrite transaction; return resumes same identity and refreshes only attestation', async () => {
  const tab = await page()
  try {
    const result = await tab.evaluate(async ({ partition, attestation, scopeA, scopeB, now }) => {
      const api = (window as any).SubmissionIntentModule
      const store = new api.SubmissionIntentStore({ databaseName: 'scope-switch', now: () => now })
      const created = await store.create(partition, {}, attestation, scopeA)
      if (!created.applied) throw new Error('Create failed')
      const old = created.intent
      const switched = await store.compareAndSet({ expectedSubmissionId: old.submissionId, expectedRevision: old.revision, trustedScopeId: scopeB },
        { ...old, state: 'scope_suspended', revision: old.revision + 1 })
      const hidden = await store.read(partition, scopeB)
      const paused = await store.read(partition, scopeA)
      const resumed = await store.resume({ expectedSubmissionId: paused.submissionId, expectedRevision: paused.revision, trustedScopeId: scopeA }, paused)
      if (!resumed.applied) throw new Error('Resume failed')
      const rotated = await store.refreshAttestation(
        { expectedSubmissionId: resumed.intent.submissionId, expectedRevision: resumed.intent.revision, trustedScopeId: scopeA },
        resumed.intent,
        { submissionScopeId: scopeA, capabilityRevision: 'policy-v2', capabilityExpiresAt: new Date(now + 600_000).toISOString() },
      )
      const final = await store.read(partition, scopeA)
      const wrongScopeRefresh = await store.refreshAttestation(
        { expectedSubmissionId: final.submissionId, expectedRevision: final.revision, trustedScopeId: scopeB },
        final, { submissionScopeId: scopeB, capabilityRevision: 'policy-v3', capabilityExpiresAt: new Date(now + 600_000).toISOString() },
      )
      return { old, switched, hidden, paused, resumed, rotated, final, wrongScopeRefresh }
    }, { partition: partition(), attestation, scopeA, scopeB, now })
    assert.deepEqual(result.switched, { applied: false, reason: 'scope_suspended' })
    assert.equal(result.hidden, null)
    assert.equal(result.paused.state, 'scope_suspended')
    assert.equal(result.paused.revision, 2)
    assert.equal(result.resumed.intent.state, 'transport_unknown')
    assert.equal(result.rotated.intent.capabilityRevision, 'policy-v2')
    assert.equal(result.final.revision, 4)
    for (const field of ['submissionId', 'idempotencyKey', 'requestHash', 'submissionScopeId', 'normalizedReplayRequest']) {
      assert.deepEqual(result.final[field], result.old[field])
    }
    assert.deepEqual(result.wrongScopeRefresh, { applied: false, reason: 'scope_mismatch' })
  } finally {
    await tab.close()
  }
})

test('aborted readwrite transaction fails closed without changing intent or receipt', async () => {
  const tab = await page()
  try {
    const result = await tab.evaluate(async ({ partition, attestation, scopeA, now }) => {
      const api = (window as any).SubmissionIntentModule
      const counts = { read: 0, write: 0, abort: 0, complete: 0 }
      let abortNextWrite = false
      const store = new api.SubmissionIntentStore({ databaseName: 'transaction-abort', now: () => now,
        probe: {
          onStart: (_tx: IDBTransaction, mode: IDBTransactionMode) => { counts[mode === 'readwrite' ? 'write' : 'read'] += 1 },
          afterRead: (transaction: IDBTransaction) => { if (abortNextWrite && transaction.mode === 'readwrite') transaction.abort() },
          onAbort: () => { counts.abort += 1 }, onComplete: () => { counts.complete += 1 },
        },
      })
      const created = await store.create(partition, {}, attestation, scopeA)
      if (!created.applied) throw new Error('Create failed')
      const initial = created.intent
      counts.read = counts.write = counts.abort = counts.complete = 0
      abortNextWrite = true
      let errorCode: string | undefined
      try {
        await store.compareAndSet({ expectedSubmissionId: initial.submissionId, expectedRevision: 1, trustedScopeId: scopeA },
          { ...initial, taskId: 'task_000001', pollUrl: '/tasks/task_000001', state: 'queued', revision: 2 })
      } catch (error) {
        errorCode = error.code
      }
      const operationCounts = { ...counts }
      abortNextWrite = false
      const current = await store.read(partition, scopeA)
      const receipt = await store.readReceipt(partition, initial.submissionId, scopeA)
      return { errorCode, operationCounts, current, receipt }
    }, { partition: partition(), attestation, scopeA, now })
    assert.equal(result.errorCode, 'UNAVAILABLE')
    assert.deepEqual(result.operationCounts, { read: 1, write: 1, abort: 1, complete: 1 })
    assert.equal(result.current.revision, 1)
    assert.equal(result.current.taskId, undefined)
    assert.equal(result.receipt, null)
  } finally {
    await tab.close()
  }
})

test('two tabs compete for one revision; only one readwrite CAS commits', async () => {
  const firstTab = await page()
  const secondTab = await page()
  try {
    const dbName = 'two-tabs'
    const created = await firstTab.evaluate(async ({ dbName, partition, attestation, scopeA, now }) => {
      const api = (window as any).SubmissionIntentModule
      const store = new api.SubmissionIntentStore({ databaseName: dbName, now: () => now })
      return store.create(partition, {}, attestation, scopeA)
    }, { dbName, partition: partition(), attestation, scopeA, now })
    assert.equal(created.applied, true)
    const arrivals: Array<() => void> = []
    const barrier = () => new Promise<void>((resolve) => {
      arrivals.push(resolve)
      if (arrivals.length === 2) arrivals.forEach((release) => release())
    })
    await firstTab.exposeFunction('twoTabBarrier', barrier)
    await secondTab.exposeFunction('twoTabBarrier', barrier)
    const attempt = (tab: Page) => tab.evaluate(async ({ dbName, partition, scopeA, now }) => {
      const api = (window as any).SubmissionIntentModule
      const store = new api.SubmissionIntentStore({ databaseName: dbName, now: () => now })
      const snapshot = await store.read(partition, scopeA)
      await (window as any).twoTabBarrier()
      return store.compareAndSet({ expectedSubmissionId: snapshot.submissionId, expectedRevision: snapshot.revision, trustedScopeId: scopeA },
        { ...snapshot, state: 'transport_unknown', revision: snapshot.revision + 1 })
    }, { dbName, partition: partition(), scopeA, now })
    const [first, second] = await Promise.all([attempt(firstTab), attempt(secondTab)])
    assert.equal(Number(first.applied) + Number(second.applied), 1)
    const saved = await firstTab.evaluate(async ({ dbName, partition, scopeA, now }) => {
      const api = (window as any).SubmissionIntentModule
      return new api.SubmissionIntentStore({ databaseName: dbName, now: () => now }).read(partition, scopeA)
    }, { dbName, partition: partition(), scopeA, now })
    assert.equal(saved.revision, 2)
    assert.equal(saved.submissionId, created.intent.submissionId)
  } finally {
    await firstTab.close()
    await secondTab.close()
  }
})

test('request whitelist, replay hash and attestation TTL fail closed', async () => {
  const tab = await page()
  try {
    const result = await tab.evaluate(async ({ partition, attestation, scopeA, now }) => {
      const api = (window as any).SubmissionIntentModule
      const store = new api.SubmissionIntentStore({ databaseName: 'validation', now: () => now })
      const errors: string[] = []
      for (const request of [{ accessToken: 'secret' }, { regenerateReason: 'Bearer abcdef12345' },
        { regenerateReason: 'x'.repeat(9000) }]) {
        try { await store.create(partition, request, attestation, scopeA) } catch (error) { errors.push(error.code) }
      }
      try {
        await store.create(partition, {}, { ...attestation, capabilityExpiresAt: new Date(now).toISOString() }, scopeA)
      } catch (error) { errors.push(error.code) }
      const created = await store.create(partition, { regenerateReason: '调整开篇节奏' }, attestation, scopeA)
      if (!created.applied) throw new Error('Create failed')
      let replayConflict: string | undefined
      try { await api.verifiedReplayRequest({ ...created.intent, normalizedReplayRequest: { regenerateReason: '偷偷修改' } }) }
      catch (error) { replayConflict = error.code }
      const current = await store.read(partition, scopeA)
      return { errors, replayConflict, current }
    }, { partition: partition(), attestation, scopeA, now })
    assert.deepEqual(result.errors, ['INVALID_INTENT', 'INVALID_INTENT', 'INVALID_INTENT', 'INVALID_INTENT'])
    assert.equal(result.replayConflict, 'REPLAY_CONFLICT')
    assert.equal(result.current.revision, 1)
  } finally {
    await tab.close()
  }
})

test('blocked ambiguity cannot mint another submission key until explicitly retired', async () => {
  const tab = await page()
  try {
    const result = await tab.evaluate(async ({ partition, attestation, scopeA, now }) => {
      const api = (window as any).SubmissionIntentModule
      const store = new api.SubmissionIntentStore({ databaseName: 'blocked-retire', now: () => now })
      const created = await store.create(partition, {}, attestation, scopeA)
      if (!created.applied) throw new Error('Create failed')
      const blocked = await store.compareAndSet({ expectedSubmissionId: created.intent.submissionId,
        expectedRevision: created.intent.revision, trustedScopeId: scopeA },
      { ...created.intent, state: 'blocked', revision: created.intent.revision + 1 })
      if (!blocked.applied) throw new Error('Block failed')
      const duplicate = await store.create(partition, {}, attestation, scopeA)
      const retired = await store.retire({ expectedSubmissionId: blocked.intent.submissionId,
        expectedRevision: blocked.intent.revision, trustedScopeId: scopeA }, blocked.intent)
      return { created, blocked, duplicate, retired, current: await store.read(partition, scopeA) }
    }, { partition: partition(), attestation, scopeA, now })
    assert.deepEqual(result.duplicate, { applied: false, reason: 'stale' })
    assert.equal(result.blocked.intent.idempotencyKey, result.created.intent.idempotencyKey)
    assert.equal(result.retired.applied, true)
    assert.equal(result.current.retired, true)
  } finally {
    await tab.close()
  }
})

test('injected IDBFactory is authoritative and expiry boundary rejects a new intent', async () => {
  const tab = await page()
  try {
    const result = await tab.evaluate(async ({ partition, scopeA, now }) => {
      const api = (window as any).SubmissionIntentModule
      let opened = 0
      let clock = now - 1
      const factory = { open: (name: string, version: number) => {
        opened += 1
        return indexedDB.open(name, version)
      } } as IDBFactory
      const store = new api.SubmissionIntentStore({ indexedDB: factory, databaseName: 'injected-factory', now: () => clock })
      const boundaryAttestation = {
        submissionScopeId: scopeA, capabilityRevision: 'policy-v1', capabilityExpiresAt: new Date(now).toISOString(),
      }
      const beforeExpiry = await store.create(partition, {}, boundaryAttestation, scopeA)
      clock = now
      let expiredCode: string | undefined
      try { await store.refreshAttestation(
        { expectedSubmissionId: beforeExpiry.intent.submissionId, expectedRevision: 1, trustedScopeId: scopeA },
        beforeExpiry.intent, boundaryAttestation,
      ) } catch (error) { expiredCode = error.code }
      const current = await store.read(partition, scopeA)
      return { opened, beforeExpiry, expiredCode, current }
    }, { partition: partition(), scopeA, now })
    assert.equal(result.opened, 1)
    assert.equal(result.beforeExpiry.applied, true)
    assert.equal(result.expiredCode, 'INVALID_INTENT')
    assert.equal(result.current.revision, 1)
  } finally {
    await tab.close()
  }
})
