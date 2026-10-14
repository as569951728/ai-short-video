import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { TaskStatus, type NovelAsyncTransportCapabilityV1, type TaskDetailDTO } from '@ai-shortvideo/shared'
import { getApiBaseUrl } from '../../../shared/services/http.js'
import {
  classifyAsyncDispatchFailure,
  getAsyncNovelTransportCapability,
  normalizeGenerationRequest,
  submitAsyncNovelGeneration,
  type AsyncNovelGenerationAction,
  type NormalizedGenerationRequest,
} from '../services/asyncNovelTransport.js'
import {
  SubmissionIntentStore,
  verifiedReplayRequest,
  type SubmissionAttestation,
  type SubmissionIntentV1,
  type SubmissionPartition,
} from './submissionIntentStore.js'

type TransportPhase = 'idle' | 'capability_checking' | 'capability_unavailable' | 'ready'
  | 'submitting' | 'transport_unknown' | 'scope_suspended' | 'tracking' | 'blocked'

type SubmitDecision = { kind: 'legacy' } | { kind: 'task'; taskId: string } | { kind: 'blocked' }

const actions: AsyncNovelGenerationAction[] = [
  'direction_generate', 'setting_generate', 'outline_generate',
  'stage_outline_generate', 'chapter_plan_generate',
  'trial_chapter_one_generate', 'trial_followup_generate',
  'novel_full_review',
]

export function useNovelAsyncTransport(novelId: () => string, onTaskId: (taskId: string) => void) {
  const store = new SubmissionIntentStore()
  const phase = ref<TransportPhase>('idle')
  const message = ref('')
  const activeIntent = shallowRef<SubmissionIntentV1 | null>(null)
  const capability = ref<NovelAsyncTransportCapabilityV1 | null>(null)
  let replayTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  const blocksNewSubmission = computed(() => [
    'capability_checking', 'capability_unavailable', 'submitting', 'transport_unknown',
    'scope_suspended', 'blocked',
  ].includes(phase.value))

  function partition(scope: string, action: AsyncNovelGenerationAction): SubmissionPartition {
    return { apiOrigin: new URL(getApiBaseUrl()).origin, submissionScopeId: scope,
      novelId: novelId(), action, objectId: novelId() }
  }

  function expected(intent: SubmissionIntentV1, trustedScopeId = intent.submissionScopeId) {
    return { expectedSubmissionId: intent.submissionId, expectedRevision: intent.revision, trustedScopeId }
  }

  function next(intent: SubmissionIntentV1, changes: Partial<SubmissionIntentV1>): SubmissionIntentV1 {
    return { ...intent, ...changes, revision: intent.revision + 1, updatedAt: new Date().toISOString() }
  }

  function attestation(snapshot: Extract<NovelAsyncTransportCapabilityV1, { enabled: true }>): SubmissionAttestation {
    return { submissionScopeId: snapshot.submissionScopeId,
      capabilityRevision: snapshot.capabilityRevision, capabilityExpiresAt: snapshot.expiresAt }
  }

  function scheduleReplay() {
    if (replayTimer || disposed) return
    replayTimer = setTimeout(() => {
      replayTimer = undefined
      void reconcileUnknown()
    }, 6000)
  }

  async function checkCapability(): Promise<NovelAsyncTransportCapabilityV1 | null> {
    phase.value = 'capability_checking'
    message.value = '正在确认任务提交方式'
    try {
      const snapshot = await getAsyncNovelTransportCapability()
      capability.value = snapshot
      if (!snapshot.enabled) {
        if (['POLICY_DISABLED', 'UNSUPPORTED_ENVIRONMENT'].includes(snapshot.reasonCode)) {
          phase.value = 'idle'
          message.value = ''
          return snapshot
        }
        phase.value = 'capability_unavailable'
        message.value = '暂时无法确认任务提交方式，任务尚未提交。'
        return null
      }
      if (Date.now() >= Date.parse(snapshot.expiresAt)) {
        phase.value = 'capability_unavailable'
        message.value = '任务提交方式已过期，请重新检查。'
        return null
      }
      phase.value = 'ready'
      message.value = '提交方式已确认，请重新点击生成。'
      return snapshot
    } catch {
      phase.value = 'capability_unavailable'
      message.value = '暂时无法确认任务提交方式，任务尚未提交。'
      return null
    }
  }

  async function recheckCapability() {
    const snapshot = await checkCapability()
    if (snapshot?.enabled) await restore()
  }

  async function refreshForIntent(intent: SubmissionIntentV1) {
    const snapshot = await getAsyncNovelTransportCapability()
    capability.value = snapshot
    if (!snapshot.enabled || Date.now() >= Date.parse(snapshot.expiresAt)) return null
    if (snapshot.submissionScopeId !== intent.submissionScopeId) {
      await store.compareAndSet(expected(intent, snapshot.submissionScopeId), next(intent, {}))
      activeIntent.value = null
      phase.value = 'scope_suspended'
      message.value = '当前账号或空间已变更，原提交已安全暂停。'
      return null
    }
    if (snapshot.capabilityRevision !== intent.capabilityRevision
      || snapshot.expiresAt !== intent.capabilityExpiresAt) {
      const refreshed = await store.refreshAttestation(expected(intent), intent, attestation(snapshot))
      if (!refreshed.applied) return null
      intent = refreshed.intent
      const confirmed = await getAsyncNovelTransportCapability()
      if (!confirmed.enabled || confirmed.submissionScopeId !== intent.submissionScopeId
        || confirmed.capabilityRevision !== intent.capabilityRevision
        || confirmed.expiresAt !== intent.capabilityExpiresAt
        || Date.now() >= Date.parse(confirmed.expiresAt)) return null
    }
    return intent
  }

  async function bindTask(intent: SubmissionIntentV1, taskId: string, pollUrl: string,
    status: 'queued' | 'processing' | 'waiting_confirmation' | 'completed' | 'failed' | 'cancelled') {
    const bound = await store.compareAndSet(expected(intent), next(intent, {
      taskId, pollUrl, state: status,
    }))
    if (!bound.applied) {
      const current = await store.read(intent, intent.submissionScopeId)
      if (!current || current.submissionId !== intent.submissionId || current.taskId !== taskId) {
        phase.value = 'transport_unknown'
        message.value = '任务提交结果需要继续核对，请勿重复生成。'
        scheduleReplay()
        return { kind: 'blocked' } as const
      }
      activeIntent.value = current
    } else {
      activeIntent.value = bound.intent
    }
    onTaskId(taskId)
    phase.value = 'tracking'
    message.value = status === 'queued' ? '任务已受理，等待执行。' : '已关联到生成任务。'
    return { kind: 'task', taskId } as const
  }

  async function markUnknown(intent: SubmissionIntentV1) {
    const unknown = await store.compareAndSet(expected(intent), next(intent, { state: 'transport_unknown' }))
    activeIntent.value = unknown.applied ? unknown.intent : await store.read(intent, intent.submissionScopeId)
    if (activeIntent.value?.submissionId !== intent.submissionId) {
      phase.value = 'blocked'
      message.value = '本地提交记录已被其他页面更新，请刷新并核对最近任务。'
      return
    }
    if (activeIntent.value.taskId) {
      onTaskId(activeIntent.value.taskId)
      phase.value = 'tracking'
      message.value = '已关联到生成任务。'
      return
    }
    phase.value = 'transport_unknown'
    message.value = '提交结果未确认，正在用原请求核对；请勿再次点击生成。'
    scheduleReplay()
  }

  async function markBlocked(intent: SubmissionIntentV1, reason: string) {
    const blocked = await store.compareAndSet(expected(intent), next(intent, { state: 'blocked' }))
    activeIntent.value = blocked.applied ? blocked.intent : await store.read(intent, intent.submissionScopeId)
    phase.value = 'blocked'
    message.value = reason
  }

  async function postIntent(intent: SubmissionIntentV1): Promise<SubmitDecision> {
    const ready = await refreshForIntent(intent)
    if (!ready) {
      if (phase.value !== 'scope_suspended') {
        phase.value = 'transport_unknown'
        message.value = '提交方式暂时无法核对，已保留原提交记录。'
        scheduleReplay()
      }
      return { kind: 'blocked' }
    }
    intent = ready
    activeIntent.value = intent
    phase.value = 'submitting'
    message.value = '正在提交任务'
    let request: Record<string, unknown>
    try {
      request = await verifiedReplayRequest(intent)
    } catch {
      await markBlocked(intent, '保存的提交内容无法核对，已停止自动提交。')
      return { kind: 'blocked' }
    }
    try {
      const result = await submitAsyncNovelGeneration({ novelId: intent.novelId,
        action: intent.action as AsyncNovelGenerationAction,
        request, idempotencyKey: intent.idempotencyKey,
        capability: { contractVersion: 'v1', enabled: true,
          submissionScopeId: intent.submissionScopeId, capabilityRevision: intent.capabilityRevision,
          expiresAt: intent.capabilityExpiresAt } })
      return bindTask(intent, result.taskId, result.pollUrl, result.status)
    } catch (error) {
      const failure = classifyAsyncDispatchFailure(error)
      if (failure.kind === 'transport_unknown') {
        await markUnknown(intent)
      } else if (failure.kind === 'active_task') {
        await markBlocked(intent, failure.existingTaskId
          ? `已有生成任务 ${failure.existingTaskId}，请先查看任务状态。`
          : '已有生成任务，请先查看任务状态。')
      } else if (failure.kind === 'idempotency_conflict') {
        await markBlocked(intent, '原提交内容与任务记录不一致，请查看任务详情。')
      } else if (failure.kind === 'attestation_stale') {
        await markUnknown(intent)
      } else {
        await markUnknown(intent)
      }
      return { kind: 'blocked' }
    }
  }

  async function reconcileUnknown() {
    if (disposed || !activeIntent.value || activeIntent.value.taskId) return
    let intent = activeIntent.value
    if (!['submitting', 'transport_unknown', 'scope_suspended'].includes(intent.state)) return
    try {
      if (intent.state === 'scope_suspended') {
        const snapshot = await getAsyncNovelTransportCapability()
        if (!snapshot.enabled || snapshot.submissionScopeId !== intent.submissionScopeId) {
          phase.value = 'scope_suspended'
          message.value = '当前账号或空间与原提交不同，请切回后重新检查。'
          return
        }
        const resumed = await store.resume(expected(intent), intent)
        if (!resumed.applied) return
        intent = resumed.intent
      } else {
        const claimed = await store.compareAndSet(expected(intent), next(intent, { state: 'transport_unknown' }))
        if (!claimed.applied) {
          activeIntent.value = await store.read(intent, intent.submissionScopeId)
          if (activeIntent.value?.submissionId !== intent.submissionId) {
            phase.value = 'blocked'
            message.value = '本地提交记录已被其他页面更新，请刷新并核对最近任务。'
          } else if (activeIntent.value.taskId) {
            onTaskId(activeIntent.value.taskId)
            phase.value = 'tracking'
            message.value = '已关联到生成任务。'
          } else if (activeIntent.value.state === 'blocked') {
            phase.value = 'blocked'
            message.value = '原提交已被阻断，请先核对任务状态。'
          } else {
            scheduleReplay()
          }
          return
        }
        intent = claimed.intent
      }
      await postIntent(intent)
    } catch {
      phase.value = 'transport_unknown'
      message.value = '提交结果暂时无法核对，已保留原提交记录。'
      scheduleReplay()
    }
  }

  async function submit(action: AsyncNovelGenerationAction,
    request: NormalizedGenerationRequest = {}): Promise<SubmitDecision> {
    if (blocksNewSubmission.value) return { kind: 'blocked' }
    const snapshot = await checkCapability()
    if (!snapshot) return { kind: 'blocked' }
    if (!snapshot.enabled) return { kind: 'legacy' }
    const normalized = normalizeGenerationRequest(action, request)
    const scopePartition = partition(snapshot.submissionScopeId, action)
    try {
      const existing = await store.read(scopePartition, snapshot.submissionScopeId)
      if (existing && !existing.retired) {
        activeIntent.value = existing
        if (existing.taskId) {
          onTaskId(existing.taskId)
          phase.value = 'tracking'
          message.value = '已关联到进行中的任务。'
          return { kind: 'task', taskId: existing.taskId }
        }
        if (existing.state === 'blocked') {
          phase.value = 'blocked'
          message.value = '原提交已被阻断，请先核对任务状态。'
          return { kind: 'blocked' }
        }
        await reconcileUnknown()
        return { kind: 'blocked' }
      }
      const created = await store.create(scopePartition, normalized, attestation(snapshot), snapshot.submissionScopeId)
      if (!created.applied) {
        activeIntent.value = await store.read(scopePartition, snapshot.submissionScopeId)
        phase.value = 'transport_unknown'
        message.value = '另一页面正在提交同一任务，正在核对。'
        scheduleReplay()
        return { kind: 'blocked' }
      }
      activeIntent.value = created.intent
      return postIntent(created.intent)
    } catch {
      if (activeIntent.value) {
        phase.value = 'transport_unknown'
        message.value = '提交记录已保存，但结果暂时无法核对；请勿重复生成。'
        scheduleReplay()
      } else {
        phase.value = 'capability_unavailable'
        message.value = '无法安全保存任务提交记录，任务尚未提交。'
      }
      return { kind: 'blocked' }
    }
  }

  async function restore() {
    try {
      const snapshot = await getAsyncNovelTransportCapability()
      capability.value = snapshot
      if (!snapshot.enabled) return
      const intents = await Promise.all(actions.map((action) =>
        store.read(partition(snapshot.submissionScopeId, action), snapshot.submissionScopeId)))
      const latest = intents.filter((intent): intent is SubmissionIntentV1 => Boolean(intent && !intent.retired))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
      if (!latest) return
      activeIntent.value = latest
      if (latest.taskId) {
        onTaskId(latest.taskId)
        phase.value = 'tracking'
        message.value = '已恢复上次提交的任务。'
      } else if (latest.state === 'blocked') {
        phase.value = 'blocked'
        message.value = '上次提交已被阻断，请先核对任务状态。'
      } else {
        phase.value = 'transport_unknown'
        message.value = '正在核对上次提交的任务。'
        scheduleReplay()
      }
    } catch {
      phase.value = 'capability_unavailable'
      message.value = '暂时无法恢复上次任务，请重新检查提交方式。'
    }
  }

  async function taskUpdated(task: TaskDetailDTO) {
    const intent = activeIntent.value
    if (!intent || intent.taskId !== task.id || intent.retired) return
    const status = task.status as TaskStatus
    if (![TaskStatus.Queued, TaskStatus.Processing, TaskStatus.WaitingConfirmation,
      TaskStatus.Completed, TaskStatus.Failed, TaskStatus.Cancelled].includes(status)) return
    if (intent.state === status) return
    const updated = await store.compareAndSet(expected(intent), next(intent, { state: status }))
    if (!updated.applied) return
    activeIntent.value = updated.intent
    if ([TaskStatus.WaitingConfirmation, TaskStatus.Completed, TaskStatus.Failed, TaskStatus.Cancelled].includes(status)) {
      const retired = await store.retire(expected(updated.intent), updated.intent)
      if (retired.applied) activeIntent.value = retired.intent
      phase.value = 'tracking'
      message.value = status === TaskStatus.WaitingConfirmation
        ? '结果已生成，待确认后才会成为正式内容。'
        : status === TaskStatus.Failed ? '任务失败，未自动生成新的正式内容。'
          : status === TaskStatus.Cancelled ? '任务已取消，未确认新的正式结果。' : '任务已完成。'
    }
  }

  onBeforeUnmount(() => {
    disposed = true
    if (replayTimer) clearTimeout(replayTimer)
  })

  return { phase, message, activeIntent, blocksNewSubmission, submit, restore,
    taskUpdated, recheckCapability, reconcileUnknown }
}
