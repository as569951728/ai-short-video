import type { NovelProviderAction } from '@ai-shortvideo/shared'

const DATABASE_NAME = 'ai-shortvideo-submission-intents-v1'
const INTENTS_STORE = 'intents'
const RECEIPTS_STORE = 'receipts'
const MAX_REPLAY_BYTES = 8192
const MAX_RECORD_BYTES = 16384

type FieldRule = 'id' | 'text' | 'boolean' | 'positiveInt' | 'nullablePositiveInt'
  | 'nullableId' | 'nullableText' | 'ids' | 'pageSnapshot' | 'optimization'

const REQUEST_FIELDS: Record<NovelProviderAction, Record<string, FieldRule>> = {
  direction_generate: { regenerateReason: 'nullableText' },
  direction_fuse: { versionIds: 'ids', reason: 'nullableText' },
  direction_optimize: { versionId: 'id', instruction: 'text' },
  setting_generate: { regenerateReason: 'nullableText', optimization: 'optimization' },
  outline_generate: { regenerateReason: 'nullableText', optimization: 'optimization' },
  stage_outline_generate: { regenerateReason: 'nullableText', optimization: 'optimization' },
  chapter_plan_generate: { regenerateReason: 'nullableText', optimization: 'optimization' },
  trial_chapter_one_generate: {
    chapterCount: 'positiveInt', trialRunId: 'nullableId', selectedCandidateId: 'nullableId',
    confirmRisk: 'boolean', selectionReason: 'nullableText', regenerateReason: 'nullableText',
  },
  trial_followup_generate: {
    chapterCount: 'positiveInt', trialRunId: 'nullableId', selectedCandidateId: 'nullableId',
    confirmRisk: 'boolean', selectionReason: 'nullableText', regenerateReason: 'nullableText',
  },
  body_batch_generate: {
    strategySnapshotId: 'id', expectedStrategySnapshotVersion: 'positiveInt',
    startChapterNo: 'nullablePositiveInt', endChapterNo: 'nullablePositiveInt',
  },
  chapter_body_generate: {
    strategySnapshotId: 'id', expectedStrategySnapshotVersion: 'positiveInt', reason: 'nullableText',
  },
  chapter_overlength_revise: { sourceCandidateVersionId: 'id' },
  chapter_rewrite: { instruction: 'nullableText', reason: 'nullableText', currentContentVersionId: 'nullableId' },
  chapter_impact_assess: { reason: 'nullableText', currentContentVersionId: 'nullableId' },
  chapter_adopt_impact_assess: {
    reason: 'nullableText', currentContentVersionId: 'nullableId', pageVersionSnapshot: 'pageSnapshot',
  },
  novel_full_review: { expectedNovelVersion: 'nullableId', reviewPolicyVersionId: 'nullableId' },
}

const REQUIRED_FIELDS: Partial<Record<NovelProviderAction, readonly string[]>> = {
  direction_fuse: ['versionIds'],
  direction_optimize: ['versionId', 'instruction'],
  body_batch_generate: ['strategySnapshotId', 'expectedStrategySnapshotVersion'],
  chapter_body_generate: ['strategySnapshotId', 'expectedStrategySnapshotVersion'],
  chapter_overlength_revise: ['sourceCandidateVersionId'],
}

const SECRET_PATTERN = /(?:\bbearer\s+\S+|\b(?:api[_ -]?key|access[_ -]?token|secret|password)\s*[:=]\s*\S+|\bsk-[a-z\d_-]{12,}|\b(?:ghp_|github_pat_|AKIA|AIza)[a-z\d_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SCOPE_PATTERN = /^[A-Za-z0-9_-]{43}$/
const HASH_PATTERN = /^[a-f0-9]{64}$/
const STATES: readonly SubmissionIntentState[] = [
  'submitting', 'transport_unknown', 'scope_suspended', 'blocked', 'queued', 'processing',
  'waiting_confirmation', 'completed', 'failed', 'cancelled',
]
const TASK_SETTLED_STATES: readonly SubmissionIntentState[] = ['waiting_confirmation', 'completed', 'failed', 'cancelled']
const SETTLED_STATES: readonly SubmissionIntentState[] = ['blocked', ...TASK_SETTLED_STATES]
const INTENT_FIELDS = new Set([
  'apiOrigin', 'submissionScopeId', 'novelId', 'action', 'objectId', 'submissionId',
  'idempotencyKey', 'normalizedReplayRequest', 'requestHash', 'taskId', 'pollUrl',
  'state', 'revision', 'capabilityRevision', 'capabilityExpiresAt', 'updatedAt', 'retired',
])
const RECEIPT_FIELDS = new Set([
  'apiOrigin', 'submissionScopeId', 'novelId', 'action', 'objectId', 'submissionId',
  'taskId', 'pollUrl', 'status', 'retired', 'revision', 'updatedAt',
])
const PAGE_SNAPSHOT_FIELDS = new Set([
  'novelUpdatedAt', 'currentDirectionVersionId', 'currentSettingVersionId',
  'currentOutlineVersionId', 'currentStageOutlineVersionId', 'currentChapterPlanVersionId',
  'chapterCurrentContentVersionId',
])

export type SubmissionIntentState =
  | 'submitting' | 'transport_unknown' | 'scope_suspended' | 'blocked'
  | 'queued' | 'processing' | 'waiting_confirmation'
  | 'completed' | 'failed' | 'cancelled'

export interface SubmissionPartition {
  apiOrigin: string
  submissionScopeId: string
  novelId: string
  action: NovelProviderAction
  objectId: string
}

export interface SubmissionAttestation {
  submissionScopeId: string
  capabilityRevision: string
  capabilityExpiresAt: string
}

export interface SubmissionIntentV1 extends SubmissionPartition {
  submissionId: string
  idempotencyKey: string
  normalizedReplayRequest: Record<string, unknown>
  requestHash: string
  taskId?: string
  pollUrl?: string
  state: SubmissionIntentState
  revision: number
  capabilityRevision: string
  capabilityExpiresAt: string
  updatedAt: string
  retired: boolean
}

export interface PendingTaskReceiptV1 extends SubmissionPartition {
  submissionId: string
  taskId: string
  pollUrl: string
  status: 'queued' | 'processing' | 'waiting_confirmation' | 'completed' | 'failed' | 'cancelled'
  retired: boolean
  revision: number
  updatedAt: string
}

export interface CompareAndSetExpectation {
  expectedSubmissionId: string | null
  expectedRevision: number
  trustedScopeId: string
}

export type CompareAndSetResult =
  | { applied: true; intent: SubmissionIntentV1 }
  | { applied: false; reason: 'stale' | 'scope_suspended' | 'scope_mismatch' }

export interface IndexedDbTransactionProbe {
  onStart?(transaction: IDBTransaction, mode: IDBTransactionMode): void
  afterRead?(transaction: IDBTransaction): void
  onComplete?(): void
  onAbort?(): void
}

export interface SubmissionIntentStoreOptions {
  indexedDB?: IDBFactory
  databaseName?: string
  now?: () => number
  randomUUID?: () => string
  probe?: IndexedDbTransactionProbe
}

export class SubmissionIntentStoreError extends Error {
  readonly code: 'UNAVAILABLE' | 'INVALID_INTENT' | 'REPLAY_CONFLICT'

  constructor(code: 'UNAVAILABLE' | 'INVALID_INTENT' | 'REPLAY_CONFLICT', message: string) {
    super(message)
    this.name = 'SubmissionIntentStoreError'
    this.code = code
  }
}

function invalid(message: string): never {
  throw new SubmissionIntentStoreError('INVALID_INTENT', message)
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value) && !SECRET_PATTERN.test(value)
}

function validText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 1024 && !SECRET_PATTERN.test(value)
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
}

function checkField(rule: FieldRule, value: unknown): boolean {
  if (rule === 'optimization') {
    return plainObject(value) && Object.keys(value).length === 2
      && typeof value.sourceVersionId === 'string' && validId(value.sourceVersionId)
      && typeof value.instruction === 'string' && value.instruction.trim().length > 0
      && value.instruction.length <= 2000 && !SECRET_PATTERN.test(value.instruction)
  }
  if (rule === 'id') return validId(value)
  if (rule === 'text') return validText(value)
  if (rule === 'nullableId') return value === null || validId(value)
  if (rule === 'nullableText') return value === null || validText(value)
  if (rule === 'positiveInt') return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= 1_000_000
  if (rule === 'nullablePositiveInt') return value === null || checkField('positiveInt', value)
  if (rule === 'boolean') return typeof value === 'boolean'
  if (rule === 'pageSnapshot') {
    return value === null || (plainObject(value) && Object.keys(value).length <= PAGE_SNAPSHOT_FIELDS.size
      && Object.keys(value).every((key) => PAGE_SNAPSHOT_FIELDS.has(key)
        && (key === 'novelUpdatedAt'
          ? typeof value[key] === 'string' && Number.isFinite(Date.parse(value[key]))
          : checkField('nullableId', value[key]))))
  }
  return Array.isArray(value) && value.length >= 2 && value.length <= 20
    && value.every(validId) && new Set(value).size === value.length
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (plainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  const encoded = JSON.stringify(value)
  if (encoded === undefined) invalid('Unsupported replay value')
  return encoded
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function partitionKey(partition: SubmissionPartition): string {
  let origin: URL
  try {
    origin = new URL(partition.apiOrigin)
  } catch {
    return invalid('Invalid API origin')
  }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== partition.apiOrigin
    || origin.pathname !== '/' || origin.search || origin.hash) invalid('API origin must be an origin')
  if (!SCOPE_PATTERN.test(partition.submissionScopeId) || !validId(partition.novelId)
    || !validId(partition.objectId) || !Object.hasOwn(REQUEST_FIELDS, partition.action)) {
    invalid('Invalid submission partition')
  }
  return JSON.stringify([partition.apiOrigin, partition.submissionScopeId, partition.novelId, partition.action, partition.objectId])
}

export function normalizeReplayRequest(action: NovelProviderAction, request: unknown): Record<string, unknown> {
  if (!Object.hasOwn(REQUEST_FIELDS, action) || !plainObject(request)) invalid('Invalid replay request')
  const rules = REQUEST_FIELDS[action]
  const normalized: Record<string, unknown> = {}
  for (const key of Object.keys(request).sort()) {
    if (!Object.hasOwn(rules, key) || !checkField(rules[key], request[key])) invalid(`Unsupported replay field: ${key}`)
    normalized[key] = clone(request[key])
  }
  for (const key of REQUIRED_FIELDS[action] ?? []) {
    if (!Object.hasOwn(normalized, key)) invalid(`Missing replay field: ${key}`)
  }
  if (new TextEncoder().encode(canonical(normalized)).length > MAX_REPLAY_BYTES) invalid('Replay request exceeds size limit')
  return normalized
}

export async function hashReplayRequest(partition: SubmissionPartition, request: Record<string, unknown>): Promise<string> {
  partitionKey(partition)
  const normalized = normalizeReplayRequest(partition.action, request)
  if (canonical(normalized) !== canonical(request)) invalid('Replay request is not normalized')
  if (!globalThis.crypto?.subtle) throw new SubmissionIntentStoreError('UNAVAILABLE', 'Secure request hash unavailable')
  const payload = new TextEncoder().encode(canonical([partition.apiOrigin, partition.submissionScopeId,
    partition.novelId, partition.action, partition.objectId, normalized]))
  const digest = await crypto.subtle.digest('SHA-256', payload)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function verifiedReplayRequest(intent: SubmissionIntentV1): Promise<Record<string, unknown>> {
  const actual = await hashReplayRequest(intent, intent.normalizedReplayRequest)
  if (actual !== intent.requestHash) throw new SubmissionIntentStoreError('REPLAY_CONFLICT', 'Saved replay request changed')
  return clone(intent.normalizedReplayRequest)
}

function validateShape(intent: SubmissionIntentV1): void {
  if (!plainObject(intent) || Object.keys(intent).some((key) => !INTENT_FIELDS.has(key))) invalid('Unexpected intent field')
  partitionKey(intent)
  if (!validId(intent.submissionId) || !validId(intent.idempotencyKey)
    || !SCOPE_PATTERN.test(intent.capabilityRevision) || !HASH_PATTERN.test(intent.requestHash)
    || !Number.isSafeInteger(intent.revision) || intent.revision < 1
    || !Number.isFinite(Date.parse(intent.capabilityExpiresAt))
    || !Number.isFinite(Date.parse(intent.updatedAt))
    || typeof intent.retired !== 'boolean' || !STATES.includes(intent.state)) invalid('Invalid intent metadata')
  if (intent.taskId !== undefined && !validId(intent.taskId)) invalid('Invalid task ID')
  if (intent.pollUrl !== undefined && (!intent.pollUrl.startsWith('/tasks/') || intent.pollUrl.length > 512)) invalid('Invalid poll URL')
  if ((intent.taskId === undefined) !== (intent.pollUrl === undefined)) invalid('Task and poll URL must bind together')
  if (intent.taskId === undefined && !['submitting', 'transport_unknown', 'scope_suspended', 'blocked'].includes(intent.state)) {
    invalid('Task state requires a task ID')
  }
  if (intent.taskId !== undefined && ['submitting', 'transport_unknown', 'scope_suspended', 'blocked'].includes(intent.state)) {
    invalid('Pending submission cannot have a task ID')
  }
  if (intent.retired && !SETTLED_STATES.includes(intent.state)) {
    invalid('Only settled receipts can retire')
  }
  if (new TextEncoder().encode(canonical(intent)).length > MAX_RECORD_BYTES) invalid('Intent exceeds size limit')
}

function validTransition(from: SubmissionIntentState, to: SubmissionIntentState): boolean {
  if (from === to) return true
  if (from === 'scope_suspended') return to === 'transport_unknown'
  if (from === 'submitting' || from === 'transport_unknown') return to !== 'submitting' && to !== 'scope_suspended'
  if (from === 'queued') return ['processing', ...TASK_SETTLED_STATES].includes(to)
  if (from === 'processing') return TASK_SETTLED_STATES.includes(to)
  return false
}

function validateReceipt(receipt: PendingTaskReceiptV1, partition: SubmissionPartition, submissionId: string): void {
  if (!plainObject(receipt) || Object.keys(receipt).some((key) => !RECEIPT_FIELDS.has(key))
    || partitionKey(receipt) !== partitionKey(partition) || receipt.submissionId !== submissionId
    || !validId(receipt.taskId) || !receipt.pollUrl?.startsWith('/tasks/')
    || !['queued', 'processing', ...TASK_SETTLED_STATES].includes(receipt.status)
    || typeof receipt.retired !== 'boolean' || !Number.isSafeInteger(receipt.revision)
    || receipt.revision < 1 || !Number.isFinite(Date.parse(receipt.updatedAt))) {
    invalid('Invalid stored receipt')
  }
}

function sameIdentity(left: SubmissionIntentV1, right: SubmissionIntentV1): boolean {
  return left.submissionId === right.submissionId && left.idempotencyKey === right.idempotencyKey
    && left.requestHash === right.requestHash && left.submissionScopeId === right.submissionScopeId
    && canonical(left.normalizedReplayRequest) === canonical(right.normalizedReplayRequest)
}

function receiptFor(intent: SubmissionIntentV1): PendingTaskReceiptV1 | null {
  if (!intent.taskId || !intent.pollUrl
    || !['queued', 'processing', 'waiting_confirmation', 'completed', 'failed', 'cancelled'].includes(intent.state)) return null
  return {
    apiOrigin: intent.apiOrigin, submissionScopeId: intent.submissionScopeId, novelId: intent.novelId,
    action: intent.action, objectId: intent.objectId, submissionId: intent.submissionId,
    taskId: intent.taskId, pollUrl: intent.pollUrl,
    status: intent.state as PendingTaskReceiptV1['status'],
    retired: intent.retired, revision: intent.revision, updatedAt: intent.updatedAt,
  }
}

export class SubmissionIntentStore {
  private databasePromise?: Promise<IDBDatabase>
  private readonly factory: IDBFactory | undefined
  private readonly name: string
  private readonly now: () => number
  private readonly randomUUID: () => string
  private readonly probe?: IndexedDbTransactionProbe

  constructor(options: SubmissionIntentStoreOptions = {}) {
    this.factory = options.indexedDB ?? globalThis.indexedDB
    this.name = options.databaseName ?? DATABASE_NAME
    this.now = options.now ?? (() => Date.now())
    this.randomUUID = options.randomUUID ?? (() => crypto.randomUUID())
    this.probe = options.probe
  }

  private async database(): Promise<IDBDatabase> {
    if (!this.factory) throw new SubmissionIntentStoreError('UNAVAILABLE', 'IndexedDB unavailable')
    if (!this.databasePromise) {
      this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = this.factory!.open(this.name, 1)
        request.onupgradeneeded = () => {
          const database = request.result
          if (!database.objectStoreNames.contains(INTENTS_STORE)) database.createObjectStore(INTENTS_STORE)
          if (!database.objectStoreNames.contains(RECEIPTS_STORE)) database.createObjectStore(RECEIPTS_STORE)
        }
        request.onsuccess = () => {
          request.result.onversionchange = () => request.result.close()
          resolve(request.result)
        }
        request.onerror = () => reject(new SubmissionIntentStoreError('UNAVAILABLE', 'IndexedDB open failed'))
        request.onblocked = () => reject(new SubmissionIntentStoreError('UNAVAILABLE', 'IndexedDB upgrade blocked'))
      }).catch((error: unknown) => {
        this.databasePromise = undefined
        throw error
      })
    }
    return this.databasePromise
  }

  private async readStored<T>(storeName: string, key: string): Promise<T | null> {
    const database = await this.database()
    return new Promise<T | null>((resolve, reject) => {
      let value: T | null = null
      let failure: unknown
      let transaction: IDBTransaction
      try {
        transaction = database.transaction(storeName, 'readonly')
        this.probe?.onStart?.(transaction, 'readonly')
        const request = transaction.objectStore(storeName).get(key)
        request.onsuccess = () => {
          try {
            value = request.result ?? null
            this.probe?.afterRead?.(transaction)
          } catch (error) {
            failure = error
            try { transaction.abort() } catch { /* Already aborted. */ }
          }
        }
        request.onerror = () => { failure = request.error }
      } catch (error) {
        reject(new SubmissionIntentStoreError('UNAVAILABLE', `IndexedDB read unavailable: ${String(error)}`))
        return
      }
      transaction.oncomplete = () => { this.probe?.onComplete?.(); resolve(value === null ? null : clone(value)) }
      transaction.onabort = () => {
        this.probe?.onAbort?.()
        reject(new SubmissionIntentStoreError('UNAVAILABLE', `IndexedDB read aborted${failure ? `: ${String(failure)}` : ''}`))
      }
      transaction.onerror = () => { failure = transaction.error ?? failure }
    })
  }

  private async readVerified(partition: SubmissionPartition): Promise<SubmissionIntentV1 | null> {
    const intent = await this.readStored<SubmissionIntentV1>(INTENTS_STORE, partitionKey(partition))
    if (!intent) return null
    validateShape(intent)
    if (partitionKey(intent) !== partitionKey(partition)) invalid('Stored partition mismatch')
    await verifiedReplayRequest(intent)
    return intent
  }

  async read(partition: SubmissionPartition, trustedScopeId: string): Promise<SubmissionIntentV1 | null> {
    if (partition.submissionScopeId !== trustedScopeId) return null
    return this.readVerified(partition)
  }

  async readReceipt(partition: SubmissionPartition, submissionId: string, trustedScopeId: string): Promise<PendingTaskReceiptV1 | null> {
    if (partition.submissionScopeId !== trustedScopeId) return null
    if (!validId(submissionId)) invalid('Invalid submission ID')
    const receipt = await this.readStored<PendingTaskReceiptV1>(RECEIPTS_STORE, JSON.stringify([partitionKey(partition), submissionId]))
    if (receipt) validateReceipt(receipt, partition, submissionId)
    return receipt
  }

  async create(partition: SubmissionPartition, request: unknown, attestation: SubmissionAttestation,
    trustedScopeId: string): Promise<CompareAndSetResult> {
    partitionKey(partition)
    if (trustedScopeId !== partition.submissionScopeId || attestation.submissionScopeId !== trustedScopeId) {
      return { applied: false, reason: 'scope_mismatch' }
    }
    if (!SCOPE_PATTERN.test(attestation.capabilityRevision) || !(this.now() < Date.parse(attestation.capabilityExpiresAt))) {
      invalid('Capability attestation expired or invalid')
    }
    const previous = await this.readVerified(partition)
    if (previous && !previous.retired) return { applied: false, reason: 'stale' }
    const normalizedReplayRequest = normalizeReplayRequest(partition.action, request)
    const next: SubmissionIntentV1 = {
      ...partition, submissionId: this.randomUUID(), idempotencyKey: this.randomUUID(),
      normalizedReplayRequest, requestHash: await hashReplayRequest(partition, normalizedReplayRequest),
      state: 'submitting', revision: (previous?.revision ?? 0) + 1,
      capabilityRevision: attestation.capabilityRevision,
      capabilityExpiresAt: attestation.capabilityExpiresAt,
      updatedAt: new Date(this.now()).toISOString(), retired: false,
    }
    return this.compareAndSetInternal({ expectedSubmissionId: previous?.submissionId ?? null,
      expectedRevision: previous?.revision ?? 0, trustedScopeId }, next, true)
  }

  async compareAndSet(expected: CompareAndSetExpectation, nextIntent: SubmissionIntentV1): Promise<CompareAndSetResult> {
    return this.compareAndSetInternal(expected, nextIntent, false)
  }

  private async compareAndSetInternal(expected: CompareAndSetExpectation, nextIntent: SubmissionIntentV1,
    allowNewSubmission: boolean): Promise<CompareAndSetResult> {
    validateShape(nextIntent)
    await verifiedReplayRequest(nextIntent)
    const key = partitionKey(nextIntent)
    const before = await this.readVerified(nextIntent)
    const database = await this.database()
    return new Promise<CompareAndSetResult>((resolve, reject) => {
      let outcome: CompareAndSetResult = { applied: false, reason: 'stale' }
      let failure: unknown
      let transaction: IDBTransaction
      try {
        transaction = database.transaction([INTENTS_STORE, RECEIPTS_STORE], 'readwrite')
        this.probe?.onStart?.(transaction, 'readwrite')
        const intentStore = transaction.objectStore(INTENTS_STORE)
        const readRequest = intentStore.get(key)
        readRequest.onsuccess = () => {
          try {
            const current = (readRequest.result ?? null) as SubmissionIntentV1 | null
            this.probe?.afterRead?.(transaction)
            if (canonical(current) !== canonical(before)) return
            if ((current?.submissionId ?? null) !== expected.expectedSubmissionId
              || (current?.revision ?? 0) !== expected.expectedRevision) return
            if (!current) {
              if (!allowNewSubmission || expected.expectedRevision !== 0
                || expected.expectedSubmissionId !== null || nextIntent.revision !== 1
                || expected.trustedScopeId !== nextIntent.submissionScopeId) return
            } else if (nextIntent.revision !== current.revision + 1) return

            if (current && expected.trustedScopeId !== current.submissionScopeId) {
              if (!current.taskId && ['submitting', 'transport_unknown'].includes(current.state)) {
                const suspended: SubmissionIntentV1 = {
                  ...current, state: 'scope_suspended', revision: current.revision + 1,
                  updatedAt: new Date(this.now()).toISOString(),
                }
                intentStore.put(suspended, key)
                outcome = { applied: false, reason: 'scope_suspended' }
              } else {
                outcome = { applied: false, reason: 'scope_mismatch' }
              }
              return
            }
            if (expected.trustedScopeId !== nextIntent.submissionScopeId) return

            if (current && current.submissionId !== nextIntent.submissionId) {
              if (!allowNewSubmission || !current.retired || nextIntent.state !== 'submitting'
                || nextIntent.retired || nextIntent.taskId) return
            } else if (current) {
              if (current.retired || !sameIdentity(current, nextIntent)) return
              if (!validTransition(current.state, nextIntent.state)) return
              if (current.taskId && (current.taskId !== nextIntent.taskId || current.pollUrl !== nextIntent.pollUrl)) return
              if (current.state === 'scope_suspended' && nextIntent.state !== 'transport_unknown') return
              if (nextIntent.state === 'scope_suspended') return
              const changedAttestation = current.capabilityRevision !== nextIntent.capabilityRevision
                || current.capabilityExpiresAt !== nextIntent.capabilityExpiresAt
              if (changedAttestation && (current.state !== nextIntent.state
                || current.taskId !== nextIntent.taskId || current.pollUrl !== nextIntent.pollUrl
                || current.retired !== nextIntent.retired
                || !(this.now() < Date.parse(nextIntent.capabilityExpiresAt)))) return
              if (nextIntent.retired && !nextIntent.taskId && nextIntent.state !== 'blocked') return
            }

            intentStore.put(nextIntent, key)
            const receipt = receiptFor(nextIntent)
            if (receipt) transaction.objectStore(RECEIPTS_STORE).put(receipt, JSON.stringify([key, receipt.submissionId]))
            outcome = { applied: true, intent: clone(nextIntent) }
          } catch (error) {
            failure = error
            try { transaction.abort() } catch { /* Already aborted. */ }
          }
        }
        readRequest.onerror = () => { failure = readRequest.error }
      } catch (error) {
        reject(new SubmissionIntentStoreError('UNAVAILABLE', `IndexedDB write unavailable: ${String(error)}`))
        return
      }
      transaction.oncomplete = () => { this.probe?.onComplete?.(); resolve(outcome) }
      transaction.onabort = () => {
        this.probe?.onAbort?.()
        reject(new SubmissionIntentStoreError('UNAVAILABLE', `IndexedDB write aborted${failure ? `: ${String(failure)}` : ''}`))
      }
      transaction.onerror = () => { failure = transaction.error ?? failure }
    })
  }

  async refreshAttestation(expected: CompareAndSetExpectation, intent: SubmissionIntentV1,
    attestation: SubmissionAttestation): Promise<CompareAndSetResult> {
    if (expected.trustedScopeId !== intent.submissionScopeId
      || attestation.submissionScopeId !== intent.submissionScopeId) return { applied: false, reason: 'scope_mismatch' }
    if (!SCOPE_PATTERN.test(attestation.capabilityRevision) || !(this.now() < Date.parse(attestation.capabilityExpiresAt))) {
      invalid('Capability attestation expired or invalid')
    }
    return this.compareAndSet(expected, {
      ...intent, capabilityRevision: attestation.capabilityRevision,
      capabilityExpiresAt: attestation.capabilityExpiresAt,
      revision: intent.revision + 1, updatedAt: new Date(this.now()).toISOString(),
    })
  }

  async resume(expected: CompareAndSetExpectation, intent: SubmissionIntentV1): Promise<CompareAndSetResult> {
    if (expected.trustedScopeId !== intent.submissionScopeId || intent.state !== 'scope_suspended') {
      return { applied: false, reason: 'scope_mismatch' }
    }
    return this.compareAndSet(expected, {
      ...intent, state: 'transport_unknown', revision: intent.revision + 1,
      updatedAt: new Date(this.now()).toISOString(),
    })
  }

  async retire(expected: CompareAndSetExpectation, intent: SubmissionIntentV1): Promise<CompareAndSetResult> {
    if ((!intent.taskId && intent.state !== 'blocked')
      || !SETTLED_STATES.includes(intent.state)) {
      invalid('Only a settled submission can retire')
    }
    return this.compareAndSet(expected, {
      ...intent, retired: true, revision: intent.revision + 1,
      updatedAt: new Date(this.now()).toISOString(),
    })
  }
}
