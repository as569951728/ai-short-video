import type {
  NovelAsyncTransportCapabilityV1,
  TaskDispatchResponseV1,
} from '@ai-shortvideo/shared'
import { ErrorCode } from '@ai-shortvideo/shared'
import { getApiMode } from '../../../shared/services/apiMode.js'
import { ApiClientError, apiRequest, apiRequestWithStatus } from '../../../shared/services/http.js'

export type AsyncNovelGenerationAction =
  | 'direction_generate'
  | 'setting_generate'
  | 'outline_generate'
  | 'stage_outline_generate'
  | 'chapter_plan_generate'

export interface NormalizedGenerationRequest {
  regenerateReason?: string
  optimization?: { sourceVersionId: string; instruction: string }
}

export type AsyncDispatchFailure =
  | { kind: 'active_task'; existingTaskId: string | null }
  | { kind: 'idempotency_conflict' }
  | { kind: 'attestation_stale' }
  | { kind: 'transport_unknown' }
  | { kind: 'other'; message: string }

export function classifyAsyncDispatchFailure(error: unknown): AsyncDispatchFailure {
  if (!(error instanceof ApiClientError)) {
    return { kind: 'other', message: error instanceof Error ? error.message : '任务提交失败。' }
  }
  if (error.code === 'NETWORK_ERROR' || error.code === 'INVALID_RESPONSE') return { kind: 'transport_unknown' }
  if (error.code === ErrorCode.ConflictTaskExists) {
    const details = error.details && typeof error.details === 'object' ? error.details as Record<string, unknown> : {}
    const taskId = typeof details.existingTaskId === 'string' && details.existingTaskId.length <= 128
      ? details.existingTaskId : null
    return { kind: 'active_task', existingTaskId: taskId }
  }
  if (error.code === ErrorCode.IdempotencyConflict) return { kind: 'idempotency_conflict' }
  if (error.code === ErrorCode.GateBlocked) return { kind: 'attestation_stale' }
  return { kind: 'other', message: error.message }
}

const actionPaths: Record<AsyncNovelGenerationAction, string> = {
  direction_generate: 'directions/generate',
  setting_generate: 'settings/generate',
  outline_generate: 'outlines/generate',
  stage_outline_generate: 'stage-outlines/generate',
  chapter_plan_generate: 'chapter-plans/generate',
}

export function normalizeGenerationRequest(
  action: AsyncNovelGenerationAction,
  request: NormalizedGenerationRequest = {},
): NormalizedGenerationRequest {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('生成参数无效，请重新填写。')
  }
  if (Object.keys(request).some((key) => key !== 'regenerateReason' && key !== 'optimization')) {
    throw new Error('生成参数包含不支持的字段。')
  }
  const normalized: NormalizedGenerationRequest = {}
  if (request.regenerateReason !== undefined) {
    if (typeof request.regenerateReason !== 'string') throw new Error('重新生成原因无效。')
    const reason = request.regenerateReason.trim()
    if (reason.length > 500) throw new Error('重新生成原因不能超过 500 字。')
    if (reason) normalized.regenerateReason = reason
  }
  if (request.optimization !== undefined) {
    if (action === 'direction_generate') throw new Error('方向生成不接受结构优化参数。')
    const optimization = request.optimization
    if (!optimization || typeof optimization !== 'object' || Array.isArray(optimization)
      || Object.keys(optimization).some((key) => key !== 'sourceVersionId' && key !== 'instruction')) {
      throw new Error('优化参数无效。')
    }
    if (typeof optimization.sourceVersionId !== 'string' || typeof optimization.instruction !== 'string') {
      throw new Error('优化来源或建议长度无效。')
    }
    const sourceVersionId = optimization.sourceVersionId?.trim()
    const instruction = optimization.instruction?.trim()
    if (!sourceVersionId || sourceVersionId.length > 128 || !instruction || instruction.length > 2000) {
      throw new Error('优化来源或建议长度无效。')
    }
    normalized.optimization = { sourceVersionId, instruction }
  }
  return normalized
}

export async function getAsyncNovelTransportCapability(): Promise<NovelAsyncTransportCapabilityV1> {
  if (getApiMode() === 'mock') {
    return { contractVersion: 'v1', enabled: false, reasonCode: 'UNSUPPORTED_ENVIRONMENT' }
  }
  const capability = await apiRequest<NovelAsyncTransportCapabilityV1>('/novels/async-transport-capability')
  if (!capability || capability.contractVersion !== 'v1' || typeof capability.enabled !== 'boolean') {
    throw new ApiClientError('INVALID_RESPONSE', '任务提交方式暂时无法确认。')
  }
  if (capability.enabled && (!capability.submissionScopeId || !capability.capabilityRevision
    || !Number.isFinite(Date.parse(capability.expiresAt)))) {
    throw new ApiClientError('INVALID_RESPONSE', '任务提交方式暂时无法确认。')
  }
  if (!capability.enabled && ![
    'POLICY_DISABLED', 'UNSUPPORTED_ENVIRONMENT', 'TRUSTED_CONTEXT_MISSING',
    'SCOPE_SECRET_MISSING', 'API_AUDIENCE_MISSING',
  ].includes(capability.reasonCode)) {
    throw new ApiClientError('INVALID_RESPONSE', '任务提交方式暂时无法确认。')
  }
  return capability
}

export async function submitAsyncNovelGeneration(input: {
  novelId: string
  action: AsyncNovelGenerationAction
  request: NormalizedGenerationRequest
  idempotencyKey: string
  capability: Extract<NovelAsyncTransportCapabilityV1, { enabled: true }>
}): Promise<TaskDispatchResponseV1> {
  const { novelId, action, idempotencyKey, capability } = input
  if (!idempotencyKey || !capability.enabled || Date.now() >= Date.parse(capability.expiresAt)) {
    throw new ApiClientError('INVALID_RESPONSE', '任务提交方式已失效，请重新检查。')
  }
  const request = normalizeGenerationRequest(action, input.request)
  const { status, data } = await apiRequestWithStatus<TaskDispatchResponseV1>(
    `/novels/${encodeURIComponent(novelId)}/${actionPaths[action]}`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: {
        ...request,
        expectedSubmissionScopeId: capability.submissionScopeId,
        expectedCapabilityRevision: capability.capabilityRevision,
        expectedCapabilityExpiresAt: capability.expiresAt,
      },
    },
  )
  if (!data || data.action !== action || data.objectId !== novelId
    || !data.taskId || data.pollUrl !== `/tasks/${data.taskId}`
    || (status === 202 && (data.kind !== 'accepted' || !['queued', 'processing'].includes(data.status)))
    || (status === 200 && (data.kind !== 'existing' || ![
      'waiting_confirmation', 'completed', 'failed', 'cancelled',
    ].includes(data.status)))
    || ![200, 202].includes(status)) {
    throw new ApiClientError('INVALID_RESPONSE', '任务提交响应无法核对，请勿重复生成。')
  }
  return data
}
