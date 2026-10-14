import type {
  NovelAsyncTransportAction,
  NovelAsyncTransportCapabilityV1,
  TaskDispatchResponseV1,
} from '@ai-shortvideo/shared'
import { ErrorCode, NOVEL_ASYNC_TRANSPORT_ACTIONS, isNovelAsyncTransportActionEnabled } from '@ai-shortvideo/shared'
import { getApiMode } from '../../../shared/services/apiMode.js'
import { ApiClientError, apiRequest, apiRequestWithStatus } from '../../../shared/services/http.js'

export type AsyncNovelGenerationAction = NovelAsyncTransportAction

export interface NormalizedGenerationRequest {
  regenerateReason?: string
  versionIds?: string[]
  reason?: string
  versionId?: string
  instruction?: string
  optimization?: { sourceVersionId: string; instruction: string }
  chapterCount?: number
  trialRunId?: string
  selectedCandidateId?: string
  confirmRisk?: boolean
  selectionReason?: string
  expectedNovelVersion?: string
  reviewPolicyVersionId?: string
  sourceCandidateVersionId?: string
  currentContentVersionId?: string
  candidateVersionId?: string
  pageVersionSnapshot?: { seenCandidateVersionId: string; seenAt: string }
}

export type AsyncDispatchFailure =
  | { kind: 'active_task'; existingTaskId: string | null }
  | { kind: 'idempotency_conflict' }
  | { kind: 'gate_blocked'; message: string }
  | { kind: 'rejected'; code: string; message: string }
  | { kind: 'transport_unknown' }
  | { kind: 'other'; message: string }

export function classifyAsyncDispatchFailure(error: unknown): AsyncDispatchFailure {
  if (!(error instanceof ApiClientError)) {
    return { kind: 'other', message: error instanceof Error ? error.message : '任务提交失败。' }
  }
  if (error.httpStatus !== undefined && error.httpStatus >= 500) return { kind: 'transport_unknown' }
  if (error.code === 'NETWORK_ERROR' || error.code === 'INVALID_RESPONSE') return { kind: 'transport_unknown' }
  if (error.code === ErrorCode.ConflictTaskExists) {
    const details = error.details && typeof error.details === 'object' ? error.details as Record<string, unknown> : {}
    const taskId = typeof details.existingTaskId === 'string' && details.existingTaskId.length <= 128
      ? details.existingTaskId : null
    return { kind: 'active_task', existingTaskId: taskId }
  }
  if (error.code === ErrorCode.IdempotencyConflict) return { kind: 'idempotency_conflict' }
  if (error.code === ErrorCode.GateBlocked) return { kind: 'gate_blocked', message: error.message }
  if (error.code === ErrorCode.VersionConflict || error.code === ErrorCode.CandidateStale) {
    return { kind: 'rejected', code: error.code, message: error.message }
  }
  return { kind: 'other', message: error.message }
}

const actionPaths: Record<AsyncNovelGenerationAction, string> = {
  direction_generate: 'directions/generate',
  direction_fuse: 'directions/fuse',
  direction_optimize: 'directions',
  setting_generate: 'settings/generate',
  outline_generate: 'outlines/generate',
  stage_outline_generate: 'stage-outlines/generate',
  chapter_plan_generate: 'chapter-plans/generate',
  trial_chapter_one_generate: 'trial/generate',
  trial_followup_generate: 'trial/generate',
  chapter_overlength_revise: 'chapters',
  chapter_rewrite: 'chapters',
  chapter_impact_assess: 'chapters',
  chapter_adopt_impact_assess: 'chapters',
  novel_full_review: 'full-review',
}

export function normalizeGenerationRequest(
  action: AsyncNovelGenerationAction,
  request: NormalizedGenerationRequest = {},
): NormalizedGenerationRequest {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('生成参数无效，请重新填写。')
  }
  const trialOne = action === 'trial_chapter_one_generate'
  const trialFollowup = action === 'trial_followup_generate'
  const fullReview = action === 'novel_full_review'
  const fuse = action === 'direction_fuse'
  const optimize = action === 'direction_optimize'
  const overlength = action === 'chapter_overlength_revise'
  const rewrite = action === 'chapter_rewrite'
  const impact = action === 'chapter_impact_assess'
  const adopt = action === 'chapter_adopt_impact_assess'
  const allowedFields = fuse ? ['versionIds', 'reason']
    : optimize ? ['versionId', 'instruction']
    : overlength ? ['sourceCandidateVersionId']
    : rewrite ? ['instruction', 'reason', 'currentContentVersionId']
    : impact ? ['reason', 'currentContentVersionId']
    : adopt ? ['candidateVersionId', 'reason', 'currentContentVersionId', 'pageVersionSnapshot']
    : fullReview ? ['expectedNovelVersion', 'reviewPolicyVersionId']
    : trialOne ? ['chapterCount', 'regenerateReason']
    : trialFollowup ? ['trialRunId', 'selectedCandidateId', 'confirmRisk', 'selectionReason']
      : ['regenerateReason', 'optimization']
  if (Object.keys(request).some((key) => !allowedFields.includes(key))) {
    throw new Error('生成参数包含不支持的字段。')
  }
  const normalized: NormalizedGenerationRequest = {}
  if (rewrite || impact || adopt) {
    if (typeof request.currentContentVersionId !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(request.currentContentVersionId.trim())) {
      throw new Error('当前正文版本无法核对，请刷新后重试。')
    }
    normalized.currentContentVersionId = request.currentContentVersionId.trim()
    for (const field of (rewrite ? ['instruction', 'reason'] : ['reason']) as Array<'instruction' | 'reason'>) {
      const value = request[field]
      if (value !== undefined) {
        if (typeof value !== 'string' || !value.trim() || value.trim().length > 1000) {
          throw new Error('处理说明不能为空且不能超过 1000 字。')
        }
        normalized[field] = value.trim()
      }
    }
    if (rewrite && !normalized.instruction) throw new Error('请填写重写要求。')
    if (adopt) {
      if (!normalized.reason) throw new Error('请填写采用原因。')
      if (typeof request.candidateVersionId !== 'string'
        || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(request.candidateVersionId.trim())) {
        throw new Error('待采用候选无法核对，请刷新后重试。')
      }
      normalized.candidateVersionId = request.candidateVersionId.trim()
      if (request.pageVersionSnapshot !== undefined) {
        const snapshot = request.pageVersionSnapshot
        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
          || Object.keys(snapshot).some((key) => !['seenCandidateVersionId', 'seenAt'].includes(key))
          || snapshot.seenCandidateVersionId !== normalized.candidateVersionId
          || typeof snapshot.seenAt !== 'string' || snapshot.seenAt.length > 80
          || !Number.isFinite(Date.parse(snapshot.seenAt))) {
          throw new Error('候选确认快照无效，请刷新后重试。')
        }
        normalized.pageVersionSnapshot = { ...snapshot }
      }
    }
    return normalized
  }
  if (fuse) {
    if (!Array.isArray(request.versionIds) || request.versionIds.length < 2 || request.versionIds.length > 5
      || request.versionIds.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(id))
      || new Set(request.versionIds).size !== request.versionIds.length) {
      throw new Error('请至少选择两个有效的方向候选。')
    }
    normalized.versionIds = [...request.versionIds].sort()
    if (request.reason !== undefined) {
      if (typeof request.reason !== 'string' || request.reason.trim().length > 500) throw new Error('融合原因无效。')
      if (request.reason.trim()) normalized.reason = request.reason.trim()
    }
    return normalized
  }
  if (optimize) {
    if (typeof request.versionId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(request.versionId.trim())
      || typeof request.instruction !== 'string' || !request.instruction.trim()
      || request.instruction.trim().length > 500) {
      throw new Error('方向优化来源或建议无效。')
    }
    normalized.versionId = request.versionId.trim()
    normalized.instruction = request.instruction.trim()
    return normalized
  }
  if (overlength) {
    if (typeof request.sourceCandidateVersionId !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(request.sourceCandidateVersionId.trim())) {
      throw new Error('超长原稿候选无效。')
    }
    normalized.sourceCandidateVersionId = request.sourceCandidateVersionId.trim()
    return normalized
  }
  if (fullReview) {
    if (request.expectedNovelVersion !== undefined) {
      if (typeof request.expectedNovelVersion !== 'string'
        || request.expectedNovelVersion.length > 80
        || !Number.isFinite(Date.parse(request.expectedNovelVersion))) {
        throw new Error('小说版本无效，请刷新后重试。')
      }
      normalized.expectedNovelVersion = request.expectedNovelVersion
    }
    if (request.reviewPolicyVersionId !== undefined) {
      if (typeof request.reviewPolicyVersionId !== 'string'
        || !request.reviewPolicyVersionId.trim() || request.reviewPolicyVersionId.length > 120) {
        throw new Error('全书审稿策略版本无效。')
      }
      normalized.reviewPolicyVersionId = request.reviewPolicyVersionId.trim()
    }
    return normalized
  }
  if (trialOne) {
    if (request.chapterCount !== undefined && ![2, 3, 5].includes(request.chapterCount)) {
      throw new Error('试写章节数无效。')
    }
    normalized.chapterCount = request.chapterCount ?? 3
  }
  if (trialFollowup) {
    const trialRunId = request.trialRunId?.trim()
    const selectedCandidateId = request.selectedCandidateId?.trim()
    if (!trialRunId || trialRunId.length > 80 || !selectedCandidateId || selectedCandidateId.length > 80) {
      throw new Error('试写记录或候选无效。')
    }
    if (request.confirmRisk !== undefined && typeof request.confirmRisk !== 'boolean') {
      throw new Error('风险确认参数无效。')
    }
    if (request.selectionReason !== undefined) {
      if (typeof request.selectionReason !== 'string' || request.selectionReason.trim().length > 500) {
        throw new Error('选择原因无效。')
      }
      const reason = request.selectionReason.trim()
      if (reason) normalized.selectionReason = reason
    }
    normalized.trialRunId = trialRunId
    normalized.selectedCandidateId = selectedCandidateId
    if (request.confirmRisk) normalized.confirmRisk = true
  }
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
  if (capability.enabled && capability.enabledActions !== undefined
    && (!Array.isArray(capability.enabledActions)
      || capability.enabledActions.length === 0
      || new Set(capability.enabledActions).size !== capability.enabledActions.length
      || capability.enabledActions.some((action) => !NOVEL_ASYNC_TRANSPORT_ACTIONS.includes(action)))) {
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
  objectId?: string
  action: AsyncNovelGenerationAction
  request: NormalizedGenerationRequest
  idempotencyKey: string
  capability: Extract<NovelAsyncTransportCapabilityV1, { enabled: true }>
}): Promise<TaskDispatchResponseV1> {
  const { novelId, action, idempotencyKey, capability } = input
  if (!idempotencyKey || !isNovelAsyncTransportActionEnabled(capability, action)
    || Date.now() >= Date.parse(capability.expiresAt)) {
    throw new ApiClientError('INVALID_RESPONSE', '任务提交方式已失效，请重新检查。')
  }
  const chapterAction = action.startsWith('chapter_') && action !== 'chapter_plan_generate'
  if (chapterAction
    && (typeof input.objectId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(input.objectId))) {
    throw new ApiClientError('INVALID_RESPONSE', '章节对象无法核对，请刷新后重试。')
  }
  const request = normalizeGenerationRequest(action, input.request)
  const path = action === 'direction_optimize'
    ? `${actionPaths[action]}/${encodeURIComponent(request.versionId!)}/optimize`
    : action === 'chapter_overlength_revise'
      ? `${actionPaths[action]}/${encodeURIComponent(input.objectId || '')}/overlength-revisions`
    : action === 'chapter_rewrite'
      ? `chapters/${encodeURIComponent(input.objectId!)}/rewrite`
    : action === 'chapter_impact_assess'
      ? `chapters/${encodeURIComponent(input.objectId!)}/impact-assessments`
    : action === 'chapter_adopt_impact_assess'
      ? `chapters/${encodeURIComponent(input.objectId!)}/content-versions/${encodeURIComponent(request.candidateVersionId!)}/adopt`
    : actionPaths[action]
  const bodyRequest = { ...request }
  if (action === 'chapter_adopt_impact_assess') delete bodyRequest.candidateVersionId
  const { status, data } = await apiRequestWithStatus<TaskDispatchResponseV1>(
    `/novels/${encodeURIComponent(novelId)}/${path}`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: {
        ...bodyRequest,
        expectedSubmissionScopeId: capability.submissionScopeId,
        expectedCapabilityRevision: capability.capabilityRevision,
        expectedCapabilityExpiresAt: capability.expiresAt,
      },
    },
  )
  const expectedObjectId = action === 'trial_followup_generate' ? request.trialRunId
    : action === 'direction_optimize' ? request.versionId
      : chapterAction ? input.objectId : novelId
  if (!data || data.action !== action || data.objectId !== expectedObjectId
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
