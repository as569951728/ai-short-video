import type { PagedResult } from './api.js';
import type { ImpactLevel, NovelCreationStage, NovelLifecycleStatus, RiskLevel, StageStatus, StaleLevel, TaskStatus, VersionStatus } from './enums.js';

export const NOVEL_PROVIDER_ACTIONS = [
  'direction_generate', 'direction_fuse', 'direction_optimize', 'setting_generate', 'outline_generate',
  'stage_outline_generate', 'chapter_plan_generate', 'trial_chapter_one_generate', 'trial_followup_generate',
  'body_batch_generate', 'chapter_body_generate', 'chapter_rewrite', 'chapter_impact_assess',
  'chapter_adopt_impact_assess', 'novel_full_review'
] as const;

export type NovelProviderAction = (typeof NOVEL_PROVIDER_ACTIONS)[number];

interface ExecutionEnvelopeBaseV1<A extends NovelProviderAction, O extends string, R, S> {
  schemaVersion: 1;
  action: A;
  objectType: O;
  objectId: string;
  effectiveRequest: R;
  sourceVersionRefs: S;
  policyProfileVersionId: string | null;
  modelRoutingVersion: string;
}

export interface StructureExecutionSourceRefsV1 {
  currentDirectionVersionId: string | null;
  currentSettingVersionId: string | null;
  currentOutlineVersionId: string | null;
  currentStageOutlineVersionId: string | null;
  objectType: 'setting' | 'outline' | 'stage_outline' | 'chapter_plan';
}

export interface BodyExecutionSourceRefsV1 {
  currentDirectionVersionId: string | null;
  currentSettingVersionId: string | null;
  currentOutlineVersionId: string | null;
  currentStageOutlineVersionId: string | null;
  currentChapterPlanVersionId: string | null;
  trialRunId: string | null;
  selectedChapterOneCandidateId: string | null;
  strategySnapshotId: string;
  strategySnapshotVersion: number;
  creationStage: 'body';
}

export interface TrialExecutionSourceRefsV1 {
  currentDirectionVersionId: string | null;
  currentSettingVersionId: string | null;
  currentOutlineVersionId: string | null;
  currentStageOutlineVersionId: string | null;
  currentChapterPlanVersionId: string;
  objectType: 'trial_run';
}

export interface TrialFollowupExecutionSourceRefsV1 extends TrialExecutionSourceRefsV1 {
  trialRunId: string;
  selectedChapterOneCandidateId: string;
}

export interface FullReviewChapterSourceRefV1 {
  chapterId: string;
  chapterNo: number;
  currentContentVersionId: string;
  currentFeatureCardVersionId: string | null;
  currentReviewReportId: string | null;
}

export type ExecutionEnvelopeV1 =
  | ExecutionEnvelopeBaseV1<'direction_generate', 'direction', { regenerateReason?: string }, { currentDirectionVersionId: string | null }>
  | ExecutionEnvelopeBaseV1<'direction_fuse', 'direction', { versionIds: string[]; reason?: string }, { sourceVersionIds: string[] }>
  | ExecutionEnvelopeBaseV1<'direction_optimize', 'direction', { versionId: string; instruction?: string }, { sourceVersionIds: string[] }>
  | ExecutionEnvelopeBaseV1<'setting_generate', 'setting', { currentDirectionVersionId: string; regenerateReason?: string }, StructureExecutionSourceRefsV1>
  | ExecutionEnvelopeBaseV1<'outline_generate', 'outline', { currentDirectionVersionId: string; currentSettingVersionId: string; regenerateReason?: string }, StructureExecutionSourceRefsV1>
  | ExecutionEnvelopeBaseV1<'stage_outline_generate', 'stage_outline', { currentOutlineVersionId: string; regenerateReason?: string }, StructureExecutionSourceRefsV1>
  | ExecutionEnvelopeBaseV1<'chapter_plan_generate', 'chapter_plan', { currentOutlineVersionId: string; currentStageOutlineVersionId: string; regenerateReason?: string }, StructureExecutionSourceRefsV1>
  | ExecutionEnvelopeBaseV1<'trial_chapter_one_generate', 'trial_run', { chapterPlanVersionId: string; chapterCount: number; regenerateReason?: string }, TrialExecutionSourceRefsV1>
  | ExecutionEnvelopeBaseV1<'trial_followup_generate', 'trial_run', { trialRunId: string; selectedCandidateVersionId: string; chapterPlanVersionId: string; selectionReason?: string; confirmRisk?: boolean }, TrialFollowupExecutionSourceRefsV1>
  | ExecutionEnvelopeBaseV1<'body_batch_generate', 'novel', { startChapter: number; endChapter: number; batchSize: number; strategySnapshotId: string }, BodyExecutionSourceRefsV1>
  | ExecutionEnvelopeBaseV1<'chapter_body_generate', 'chapter', { chapterId: string; strategySnapshotId: string; enhancedReview?: boolean }, BodyExecutionSourceRefsV1>
  | ExecutionEnvelopeBaseV1<'chapter_rewrite', 'chapter', { chapterId: string; currentContentVersionId: string; instruction: string; reason?: string }, { currentContentVersionId: string }>
  | ExecutionEnvelopeBaseV1<'chapter_impact_assess', 'chapter', { chapterId: string; currentContentVersionId: string; instruction?: string; reason?: string }, { currentContentVersionId: string }>
  | ExecutionEnvelopeBaseV1<'chapter_adopt_impact_assess', 'chapter', { chapterId: string; candidateVersionId: string; currentContentVersionId: string; reason: string; pageVersionSnapshot?: Record<string, unknown> }, { currentContentVersionId: string; candidateVersionId: string }>
  | ExecutionEnvelopeBaseV1<'novel_full_review', 'novel', { policyProfileVersionId: string }, {
      currentDirectionVersionId: string;
      currentSettingVersionId: string;
      currentOutlineVersionId: string;
      currentStageOutlineVersionId: string;
      currentChapterPlanVersionId: string;
      chapterContentVersionIds: FullReviewChapterSourceRefV1[];
    }>;

export interface ExecutionAuditContextV1_1 {
  requestedByUserId: string;
  requestedAt: string;
}

export interface AuthorityChapterSourceRefV1 {
  chapterId: string;
  chapterNo: number;
  planVersionId: string;
  currentContentVersionId: string | null;
}

export interface AuthorityTargetChapterSourceRefV1 extends AuthorityChapterSourceRefV1 {
  providerInputSnapshotHash: string;
}

export interface LongTermMemoryAuthorityIdentityV1 {
  id: string;
  sourceContentVersionId: string;
  snapshotHash: string;
}

export interface PreviousBatchAuthorityIdentityV1 {
  id: string;
  summaryHash: string;
}

export const AUTHORITY_SOURCE_TYPES = [
  'novel', 'preferences', 'direction', 'setting', 'outline', 'stage_outline', 'chapter_plan',
  'trial_run', 'chapter', 'chapter_content', 'body_strategy_snapshot', 'long_term_memory', 'body_batch'
] as const;

export type AuthoritySourceType = (typeof AUTHORITY_SOURCE_TYPES)[number];

export interface AuthoritySourceIdentityV1 {
  sourceType: AuthoritySourceType;
  sourceId: string;
  revision: string | number;
  snapshotHash: string;
}

export interface AuthoritySourceVersionRefsV1 {
  sourceIdentitySchemaVersion: 1;
  sourceIdentities: AuthoritySourceIdentityV1[];
  novelProviderInputSnapshotHash: string;
  preferencesSnapshotHash?: string;
  chapterProviderInputSnapshotHash?: string;
  chapterRefs?: AuthorityChapterSourceRefV1[];
  chapterInputSnapshotHash?: string;
  targetChapterRefs?: AuthorityTargetChapterSourceRefV1[];
  previousContentVersionId?: string | null;
  longTermMemoryIdentity?: LongTermMemoryAuthorityIdentityV1 | null;
  previousBatchIdentity?: PreviousBatchAuthorityIdentityV1 | null;
  strategyProviderInputSnapshotHash?: string;
}

export type ExecutionEnvelopeV1_1 = ExecutionEnvelopeV1 extends infer TEnvelope
  ? TEnvelope extends ExecutionEnvelopeV1
    ? Omit<TEnvelope, 'schemaVersion' | 'effectiveRequest'> & {
        schemaVersion: '1.1';
        tenantId: string;
        novelId: string;
        auditContext: ExecutionAuditContextV1_1;
        normalizedRequest: TEnvelope['effectiveRequest'];
        sourceVersionRefs: TEnvelope['sourceVersionRefs'] & AuthoritySourceVersionRefsV1 & {
          authoritySnapshotHash: string;
          providerInputSnapshotHash: string;
        };
      }
    : never
  : never;

export type ExecutionEnvelope = ExecutionEnvelopeV1 | ExecutionEnvelopeV1_1;

const MAX_EXECUTION_ENVELOPE_BYTES = 32 * 1024;
const MAX_EXECUTION_ENVELOPE_V1_1_BYTES = 48 * 1024;
const EXECUTION_SENSITIVE_KEY = /(?:api.?key|authorization|cookie|database.?url|access.?token|provider.*(?:body|header|response)|raw.?response|reasoning|messages?|system.?prompt|user.?prompt|user.?agent|ip.?address)/i;
const EXECUTION_SENSITIVE_VALUE = /(?:\bBearer\s+[A-Za-z0-9._~+\/-]+=*|\bsk-[A-Za-z0-9_-]{8,}\b|\b(?:AKIA|ASIA|AIDA|AROA|AIPA|ANPA|ANVA|ASCA)[A-Z0-9]{16}\b|\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bAIza[A-Za-z0-9_-]{30,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:mysql|mariadb|postgres(?:ql)?):\/\/[^\s]+|\b(?:DEEPSEEK_API_KEY|DATABASE_URL)\s*=|\b(?:system|user)\s*prompt\s*:|\bmessages\s*=|\bprovider\s+raw\s+response\s*:|\breasoning\s*:|\bclient\s+ip\s*:|\buser-agent\s*:)/i;
const EXECUTION_ACTIONS = new Set<string>(NOVEL_PROVIDER_ACTIONS);
const EXECUTION_AUTHORITY_REF_KEYS = [
  'authoritySnapshotHash', 'providerInputSnapshotHash', 'sourceIdentitySchemaVersion',
  'sourceIdentities', 'novelProviderInputSnapshotHash', 'preferencesSnapshotHash', 'chapterProviderInputSnapshotHash',
  'chapterRefs', 'chapterInputSnapshotHash', 'targetChapterRefs', 'previousContentVersionId',
  'longTermMemoryIdentity', 'previousBatchIdentity', 'strategyProviderInputSnapshotHash'
] as const;
const EXECUTION_REQUIRED_AUTHORITY_REF_KEYS = [
  'authoritySnapshotHash', 'providerInputSnapshotHash', 'sourceIdentitySchemaVersion',
  'sourceIdentities', 'novelProviderInputSnapshotHash'
] as const;

const AUTHORITY_PLACEHOLDER_TOKENS = new Set([
  'legacy', 'objectid', 'placeholder', 'synthetic', 'default', 'null', 'empty', 'undefined',
  'unknown', 'none', 'nil', 'dummy', 'fake', 'mock', 'temporary', 'temp', 'sample', 'example',
  'todo', 'tbd', 'na'
]);

export class WorkerPayloadUnsupportedError extends Error { readonly code = 'WORKER_PAYLOAD_UNSUPPORTED'; }

export function createExecutionEnvelope(input: unknown): ExecutionEnvelopeV1 {
  const source = executionRecord(input, ['action', 'objectType', 'objectId', 'effectiveRequest', 'sourceVersionRefs', 'policyProfileVersionId', 'modelRoutingVersion'], 'envelope');
  return normalizeExecutionEnvelope({ ...source, schemaVersion: 1 });
}

export function createExecutionEnvelopeV1_1(input: unknown): ExecutionEnvelopeV1_1 {
  const source = executionRecord(input, [
    'tenantId', 'novelId', 'auditContext', 'action', 'objectType', 'objectId', 'normalizedRequest',
    'sourceVersionRefs', 'policyProfileVersionId', 'modelRoutingVersion'
  ], 'envelope');
  return normalizeExecutionEnvelopeV1_1({ ...source, schemaVersion: '1.1' });
}

export function normalizeExecutionEnvelopeV1_1(input: unknown): ExecutionEnvelopeV1_1 {
  assertNoSensitiveExecutionPayload(input);
  const value = executionRecord(input, [
    'schemaVersion', 'tenantId', 'novelId', 'auditContext', 'action', 'objectType', 'objectId',
    'normalizedRequest', 'sourceVersionRefs', 'policyProfileVersionId', 'modelRoutingVersion'
  ], 'envelope');
  if (value.schemaVersion !== '1.1') executionUnsupported('schemaVersion must be 1.1');
  const audit = executionRecord(value.auditContext, ['requestedByUserId', 'requestedAt'], 'auditContext');
  const requestedAt = executionIsoDate(audit.requestedAt, 'auditContext.requestedAt');
  const refs = executionRecordWithRequiredExtensions(value.sourceVersionRefs, EXECUTION_REQUIRED_AUTHORITY_REF_KEYS, 'sourceVersionRefs');
  const authoritySnapshotHash = executionSha256(refs.authoritySnapshotHash, 'sourceVersionRefs.authoritySnapshotHash');
  const providerInputSnapshotHash = executionSha256(refs.providerInputSnapshotHash, 'sourceVersionRefs.providerInputSnapshotHash');
  const action = executionText(value.action, 'action', 128) as NovelProviderAction;
  if (!EXECUTION_ACTIONS.has(action)) executionUnsupported(`unsupported action: ${action}`);
  const authorityRefs = executionActionAuthorityRefs(action, refs);
  const authorityKeys = new Set<string>(EXECUTION_AUTHORITY_REF_KEYS);
  const legacyRefs = Object.fromEntries(Object.entries(refs).filter(([key]) => !authorityKeys.has(key)));
  const legacy = normalizeExecutionEnvelope({
    schemaVersion: 1,
    action: value.action,
    objectType: value.objectType,
    objectId: value.objectId,
    effectiveRequest: value.normalizedRequest,
    sourceVersionRefs: legacyRefs,
    policyProfileVersionId: value.policyProfileVersionId,
    modelRoutingVersion: value.modelRoutingVersion
  });
  const { effectiveRequest, ...legacyBase } = legacy;
  const envelope = {
    ...legacyBase,
    schemaVersion: '1.1' as const,
    tenantId: executionTrustedActorId(value.tenantId, 'tenantId', 'tenant_default'),
    novelId: executionAuthorityId(value.novelId, 'novelId'),
    auditContext: {
      requestedByUserId: executionTrustedActorId(audit.requestedByUserId, 'auditContext.requestedByUserId', 'user_default'),
      requestedAt
    },
    normalizedRequest: effectiveRequest,
    sourceVersionRefs: {
      ...legacy.sourceVersionRefs,
      ...authorityRefs,
      authoritySnapshotHash,
      providerInputSnapshotHash
    }
  };
  assertAuthoritySourceIdentityCoverage(envelope as ExecutionEnvelopeV1_1);
  if (new TextEncoder().encode(canonicalExecutionJson(envelope)).byteLength > MAX_EXECUTION_ENVELOPE_V1_1_BYTES) {
    executionUnsupported('normalized envelope exceeds 48 KiB');
  }
  return envelope as ExecutionEnvelopeV1_1;
}

export function normalizeExecutionEnvelope(input: unknown): ExecutionEnvelopeV1 {
  assertNoSensitiveExecutionPayload(input);
  const value = executionRecord(input, ['schemaVersion', 'action', 'objectType', 'objectId', 'effectiveRequest', 'sourceVersionRefs', 'policyProfileVersionId', 'modelRoutingVersion'], 'envelope');
  if (value.schemaVersion !== 1) executionUnsupported('schemaVersion must be 1');
  const action = executionText(value.action, 'action', 128);
  if (!EXECUTION_ACTIONS.has(action)) executionUnsupported(`unsupported action: ${action}`);
  const common = { schemaVersion: 1 as const, action: action as NovelProviderAction, objectType: executionText(value.objectType, 'objectType', 128), objectId: executionAuthorityId(value.objectId, 'objectId'), policyProfileVersionId: executionNullableId(value.policyProfileVersionId, 'policyProfileVersionId'), modelRoutingVersion: executionId(value.modelRoutingVersion, 'modelRoutingVersion') };
  const request = value.effectiveRequest;
  const refs = value.sourceVersionRefs;
  let envelope: ExecutionEnvelopeV1;
  switch (common.action) {
    case 'direction_generate': envelope = executionExact(common, 'direction', executionOptionalTextRequest(request, 'regenerateReason', 500), executionDirectionGenerateRefs(refs)); break;
    case 'direction_fuse': envelope = executionExact(common, 'direction', executionFuseRequest(request), executionVersionRefs(refs)); break;
    case 'direction_optimize': envelope = executionExact(common, 'direction', executionOptimizeRequest(request), executionVersionRefs(refs)); break;
    case 'setting_generate': envelope = executionExact(common, 'setting', executionStructureRequest(request, ['currentDirectionVersionId']), executionStructureRefs(refs, 'setting')); break;
    case 'outline_generate': envelope = executionExact(common, 'outline', executionStructureRequest(request, ['currentDirectionVersionId', 'currentSettingVersionId']), executionStructureRefs(refs, 'outline')); break;
    case 'stage_outline_generate': envelope = executionExact(common, 'stage_outline', executionStructureRequest(request, ['currentOutlineVersionId']), executionStructureRefs(refs, 'stage_outline')); break;
    case 'chapter_plan_generate': envelope = executionExact(common, 'chapter_plan', executionStructureRequest(request, ['currentOutlineVersionId', 'currentStageOutlineVersionId']), executionStructureRefs(refs, 'chapter_plan')); break;
    case 'trial_chapter_one_generate': envelope = executionExact(common, 'trial_run', executionTrialOneRequest(request), executionTrialRefs(refs, false)); break;
    case 'trial_followup_generate': envelope = executionExact(common, 'trial_run', executionTrialFollowupRequest(request, common.objectId), executionTrialRefs(refs, true, common.objectId)); break;
    case 'body_batch_generate': envelope = executionExact(common, 'novel', executionBodyBatchRequest(request), executionBodyRefs(refs)); break;
    case 'chapter_body_generate': envelope = executionExact(common, 'chapter', executionChapterBodyRequest(request), executionBodyRefs(refs)); break;
    case 'chapter_rewrite': envelope = executionExact(common, 'chapter', executionChapterRewriteRequest(request), executionContentRefs(refs, false)); break;
    case 'chapter_impact_assess': envelope = executionExact(common, 'chapter', executionChapterImpactRequest(request), executionContentRefs(refs, false)); break;
    case 'chapter_adopt_impact_assess': envelope = executionExact(common, 'chapter', executionChapterAdoptImpactRequest(request), executionContentRefs(refs, true)); break;
    case 'novel_full_review': envelope = executionExact(common, 'novel', executionFullReviewRequest(request), executionFullReviewRefs(refs)); break;
  }
  assertExecutionSourceConsistency(envelope);
  if (new TextEncoder().encode(canonicalExecutionJson(envelope)).byteLength > MAX_EXECUTION_ENVELOPE_BYTES) executionUnsupported('normalized envelope exceeds 32 KiB');
  return envelope;
}

export function assertNoSensitiveExecutionPayload(value: unknown, path = 'envelope'): void {
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoSensitiveExecutionPayload(item, `${path}[${index}]`));
  if (typeof value === 'string' && EXECUTION_SENSITIVE_VALUE.test(value)) executionUnsupported(`sensitive value ${path}`);
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (EXECUTION_SENSITIVE_KEY.test(key)) executionUnsupported(`sensitive field ${path}.${key}`);
    assertNoSensitiveExecutionPayload(child, `${path}.${key}`);
  }
}

export function canonicalExecutionJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalExecutionJson).join(',')}]`;
  if (value && typeof value === 'object') { const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalExecutionJson(record[key])}`).join(',')}}`; }
  return JSON.stringify(value) ?? 'null';
}

function assertExecutionSourceConsistency(envelope: ExecutionEnvelopeV1) {
  const mismatch = (condition: boolean) => { if (condition) executionUnsupported('effectiveRequest must match authoritative sourceVersionRefs'); };
  switch (envelope.action) {
    case 'direction_generate': return;
    case 'direction_fuse': return mismatch(canonicalExecutionJson(envelope.effectiveRequest.versionIds) !== canonicalExecutionJson(envelope.sourceVersionRefs.sourceVersionIds));
    case 'direction_optimize': return mismatch(!envelope.sourceVersionRefs.sourceVersionIds.includes(envelope.effectiveRequest.versionId));
    case 'setting_generate': return mismatch(envelope.effectiveRequest.currentDirectionVersionId !== envelope.sourceVersionRefs.currentDirectionVersionId);
    case 'outline_generate': return mismatch(envelope.effectiveRequest.currentDirectionVersionId !== envelope.sourceVersionRefs.currentDirectionVersionId || envelope.effectiveRequest.currentSettingVersionId !== envelope.sourceVersionRefs.currentSettingVersionId);
    case 'stage_outline_generate': return mismatch(envelope.effectiveRequest.currentOutlineVersionId !== envelope.sourceVersionRefs.currentOutlineVersionId);
    case 'chapter_plan_generate': return mismatch(envelope.effectiveRequest.currentOutlineVersionId !== envelope.sourceVersionRefs.currentOutlineVersionId || envelope.effectiveRequest.currentStageOutlineVersionId !== envelope.sourceVersionRefs.currentStageOutlineVersionId);
    case 'trial_chapter_one_generate': return mismatch(envelope.effectiveRequest.chapterPlanVersionId !== envelope.sourceVersionRefs.currentChapterPlanVersionId);
    case 'trial_followup_generate': return mismatch(envelope.effectiveRequest.trialRunId !== envelope.objectId || envelope.effectiveRequest.trialRunId !== envelope.sourceVersionRefs.trialRunId || envelope.effectiveRequest.chapterPlanVersionId !== envelope.sourceVersionRefs.currentChapterPlanVersionId || envelope.effectiveRequest.selectedCandidateVersionId !== envelope.sourceVersionRefs.selectedChapterOneCandidateId);
    case 'body_batch_generate': return mismatch(envelope.effectiveRequest.strategySnapshotId !== envelope.sourceVersionRefs.strategySnapshotId);
    case 'chapter_body_generate': return mismatch(envelope.objectId !== envelope.effectiveRequest.chapterId || envelope.effectiveRequest.strategySnapshotId !== envelope.sourceVersionRefs.strategySnapshotId);
    case 'chapter_rewrite': case 'chapter_impact_assess': return mismatch(envelope.objectId !== envelope.effectiveRequest.chapterId || envelope.effectiveRequest.currentContentVersionId !== envelope.sourceVersionRefs.currentContentVersionId);
    case 'chapter_adopt_impact_assess': return mismatch(envelope.objectId !== envelope.effectiveRequest.chapterId || envelope.effectiveRequest.currentContentVersionId !== envelope.sourceVersionRefs.currentContentVersionId || envelope.effectiveRequest.candidateVersionId !== envelope.sourceVersionRefs.candidateVersionId);
    case 'novel_full_review': return mismatch(envelope.policyProfileVersionId !== envelope.effectiveRequest.policyProfileVersionId);
  }
}

function executionExact(common: { schemaVersion: 1; action: NovelProviderAction; objectType: string; objectId: string; policyProfileVersionId: string | null; modelRoutingVersion: string }, objectType: string, effectiveRequest: unknown, sourceVersionRefs: unknown) {
  if (common.objectType !== objectType) executionUnsupported(`objectType must be ${objectType}`);
  return { ...common, objectType, effectiveRequest, sourceVersionRefs } as ExecutionEnvelopeV1;
}
function executionOptionalTextRequest(value: unknown, key: string, max: number) { const source = executionRecord(value, [key], 'effectiveRequest'); const text = executionOptionalText(source[key], `effectiveRequest.${key}`, max); return text === undefined ? {} : { [key]: text }; }
function executionFuseRequest(value: unknown) { const source = executionRecord(value, ['versionIds', 'reason'], 'effectiveRequest'); const reason = executionOptionalText(source.reason, 'effectiveRequest.reason', 500); return { versionIds: executionIdArray(source.versionIds, 'effectiveRequest.versionIds', 2, 20), ...(reason ? { reason } : {}) }; }
function executionOptimizeRequest(value: unknown) { const source = executionRecord(value, ['versionId', 'instruction'], 'effectiveRequest'); const instruction = executionOptionalText(source.instruction, 'effectiveRequest.instruction', 2_000); return { versionId: executionId(source.versionId, 'effectiveRequest.versionId'), ...(instruction ? { instruction } : {}) }; }
function executionStructureRequest(value: unknown, keys: string[]) { const source = executionRecord(value, [...keys, 'regenerateReason'], 'effectiveRequest'); const regenerateReason = executionOptionalText(source.regenerateReason, 'effectiveRequest.regenerateReason', 500); return { ...Object.fromEntries(keys.map((key) => [key, executionId(source[key], `effectiveRequest.${key}`)])), ...(regenerateReason ? { regenerateReason } : {}) }; }
function executionTrialOneRequest(value: unknown) { const source = executionRecord(value, ['chapterPlanVersionId', 'chapterCount', 'regenerateReason'], 'effectiveRequest'); const regenerateReason = executionOptionalText(source.regenerateReason, 'effectiveRequest.regenerateReason', 500); return { chapterPlanVersionId: executionId(source.chapterPlanVersionId, 'effectiveRequest.chapterPlanVersionId'), chapterCount: executionInteger(source.chapterCount, 'effectiveRequest.chapterCount', 2, 5), ...(regenerateReason ? { regenerateReason } : {}) }; }
function executionTrialFollowupRequest(value: unknown, objectId: string) { const source = executionRecord(value, ['trialRunId', 'selectedCandidateVersionId', 'chapterPlanVersionId', 'selectionReason', 'confirmRisk'], 'effectiveRequest'); const trialRunId = executionId(source.trialRunId ?? objectId, 'effectiveRequest.trialRunId'); if (trialRunId !== objectId) executionUnsupported('effectiveRequest.trialRunId must match objectId'); const selectionReason = executionOptionalText(source.selectionReason, 'effectiveRequest.selectionReason', 500); if (source.confirmRisk !== undefined && typeof source.confirmRisk !== 'boolean') executionUnsupported('effectiveRequest.confirmRisk must be boolean'); return { trialRunId, selectedCandidateVersionId: executionId(source.selectedCandidateVersionId, 'effectiveRequest.selectedCandidateVersionId'), chapterPlanVersionId: executionId(source.chapterPlanVersionId, 'effectiveRequest.chapterPlanVersionId'), ...(selectionReason ? { selectionReason } : {}), ...(source.confirmRisk === undefined ? {} : { confirmRisk: source.confirmRisk }) }; }
function executionBodyBatchRequest(value: unknown) {
  const source = executionRecord(value, ['startChapter', 'endChapter', 'batchSize', 'strategySnapshotId'], 'effectiveRequest');
  const startChapter = executionInteger(source.startChapter, 'effectiveRequest.startChapter', 1, 100_000); const endChapter = executionInteger(source.endChapter, 'effectiveRequest.endChapter', startChapter, 100_000); const batchSize = executionInteger(source.batchSize, 'effectiveRequest.batchSize', 1, 20);
  if (endChapter - startChapter + 1 !== batchSize) executionUnsupported('batchSize must match chapter range');
  return { startChapter, endChapter, batchSize, strategySnapshotId: executionId(source.strategySnapshotId, 'effectiveRequest.strategySnapshotId') };
}
function executionChapterBodyRequest(value: unknown) { const source = executionRecord(value, ['chapterId', 'strategySnapshotId', 'enhancedReview'], 'effectiveRequest'); if (source.enhancedReview !== undefined && typeof source.enhancedReview !== 'boolean') executionUnsupported('effectiveRequest.enhancedReview must be boolean'); return { chapterId: executionId(source.chapterId, 'effectiveRequest.chapterId'), strategySnapshotId: executionId(source.strategySnapshotId, 'effectiveRequest.strategySnapshotId'), ...(source.enhancedReview === undefined ? {} : { enhancedReview: source.enhancedReview }) }; }
function executionChapterRewriteRequest(value: unknown) { const source = executionRecord(value, ['chapterId', 'currentContentVersionId', 'instruction', 'reason'], 'effectiveRequest'); const reason = executionOptionalText(source.reason, 'effectiveRequest.reason', 1_000); return { chapterId: executionId(source.chapterId, 'effectiveRequest.chapterId'), currentContentVersionId: executionId(source.currentContentVersionId, 'effectiveRequest.currentContentVersionId'), instruction: executionText(source.instruction, 'effectiveRequest.instruction', 2_000), ...(reason ? { reason } : {}) }; }
function executionChapterImpactRequest(value: unknown) { const source = executionRecord(value, ['chapterId', 'currentContentVersionId', 'instruction', 'reason'], 'effectiveRequest'); const instruction = executionOptionalText(source.instruction, 'effectiveRequest.instruction', 2_000); const reason = executionOptionalText(source.reason, 'effectiveRequest.reason', 1_000); return { chapterId: executionId(source.chapterId, 'effectiveRequest.chapterId'), currentContentVersionId: executionId(source.currentContentVersionId, 'effectiveRequest.currentContentVersionId'), ...(instruction ? { instruction } : {}), ...(reason ? { reason } : {}) }; }
function executionChapterAdoptImpactRequest(value: unknown) { const source = executionRecord(value, ['chapterId', 'candidateVersionId', 'currentContentVersionId', 'reason', 'pageVersionSnapshot'], 'effectiveRequest'); const pageVersionSnapshot = executionOptionalPageVersionSnapshot(source.pageVersionSnapshot); return { chapterId: executionId(source.chapterId, 'effectiveRequest.chapterId'), candidateVersionId: executionId(source.candidateVersionId, 'effectiveRequest.candidateVersionId'), currentContentVersionId: executionId(source.currentContentVersionId, 'effectiveRequest.currentContentVersionId'), reason: executionText(source.reason, 'effectiveRequest.reason', 1_000), ...(pageVersionSnapshot ? { pageVersionSnapshot } : {}) }; }
function executionFullReviewRequest(value: unknown) { const source = executionRecord(value, ['policyProfileVersionId'], 'effectiveRequest'); return { policyProfileVersionId: executionId(source.policyProfileVersionId, 'effectiveRequest.policyProfileVersionId') }; }
function executionDirectionGenerateRefs(value: unknown) { const source = executionRequiredRecord(value, ['currentDirectionVersionId'], 'sourceVersionRefs'); return { currentDirectionVersionId: executionNullableAuthorityId(source.currentDirectionVersionId, 'sourceVersionRefs.currentDirectionVersionId') }; }
function executionVersionRefs(value: unknown) { const source = executionRecord(value, ['sourceVersionIds'], 'sourceVersionRefs'); return { sourceVersionIds: executionAuthorityIdArray(source.sourceVersionIds, 'sourceVersionRefs.sourceVersionIds', 1, 100) }; }
function executionStructureRefs(value: unknown, objectType: string) {
  const source = executionRequiredRecord(value, ['currentDirectionVersionId', 'currentSettingVersionId', 'currentOutlineVersionId', 'currentStageOutlineVersionId', 'objectType'], 'sourceVersionRefs');
  if (source.objectType !== objectType) executionUnsupported(`sourceVersionRefs.objectType must be ${objectType}`);
  return { currentDirectionVersionId: executionNullableAuthorityId(source.currentDirectionVersionId, 'sourceVersionRefs.currentDirectionVersionId'), currentSettingVersionId: executionNullableAuthorityId(source.currentSettingVersionId, 'sourceVersionRefs.currentSettingVersionId'), currentOutlineVersionId: executionNullableAuthorityId(source.currentOutlineVersionId, 'sourceVersionRefs.currentOutlineVersionId'), currentStageOutlineVersionId: executionNullableAuthorityId(source.currentStageOutlineVersionId, 'sourceVersionRefs.currentStageOutlineVersionId'), objectType };
}
function executionTrialRefs(value: unknown, followup: boolean, objectId?: string) {
  const keys = ['currentDirectionVersionId', 'currentSettingVersionId', 'currentOutlineVersionId', 'currentStageOutlineVersionId', 'currentChapterPlanVersionId', 'objectType', ...(followup ? ['trialRunId', 'selectedChapterOneCandidateId'] : [])];
  const source = executionRecord(value, keys, 'sourceVersionRefs');
  for (const key of keys) if (key !== 'trialRunId' && !(key in source)) executionUnsupported(`sourceVersionRefs.${key} is required`);
  const base = executionStructureRefs(Object.fromEntries(['currentDirectionVersionId', 'currentSettingVersionId', 'currentOutlineVersionId', 'currentStageOutlineVersionId'].map((key) => [key, source[key]]).concat([['objectType', source.objectType]])), 'trial_run');
  const trialRunId = followup ? executionAuthorityId(source.trialRunId ?? objectId, 'sourceVersionRefs.trialRunId') : undefined;
  if (trialRunId && objectId && trialRunId !== objectId) executionUnsupported('sourceVersionRefs.trialRunId must match objectId');
  return { ...base, currentChapterPlanVersionId: executionAuthorityId(source.currentChapterPlanVersionId, 'sourceVersionRefs.currentChapterPlanVersionId'), ...(followup ? { trialRunId: trialRunId!, selectedChapterOneCandidateId: executionAuthorityId(source.selectedChapterOneCandidateId, 'sourceVersionRefs.selectedChapterOneCandidateId') } : {}) };
}
function executionBodyRefs(value: unknown) {
  const keys = ['currentDirectionVersionId', 'currentSettingVersionId', 'currentOutlineVersionId', 'currentStageOutlineVersionId', 'currentChapterPlanVersionId', 'trialRunId', 'selectedChapterOneCandidateId', 'strategySnapshotId', 'strategySnapshotVersion', 'creationStage'];
  const source = executionRequiredRecord(value, keys, 'sourceVersionRefs');
  if (source.creationStage !== 'body') executionUnsupported('sourceVersionRefs.creationStage must be body');
  return Object.fromEntries(keys.map((key) => [key, key === 'strategySnapshotVersion' ? executionInteger(source[key], `sourceVersionRefs.${key}`, 1, 1_000_000) : key === 'creationStage' ? 'body' : executionNullableAuthorityId(source[key], `sourceVersionRefs.${key}`)])) as never;
}
function executionContentRefs(value: unknown, candidate: boolean) { const source = executionRequiredRecord(value, ['currentContentVersionId', ...(candidate ? ['candidateVersionId'] : [])], 'sourceVersionRefs'); return { currentContentVersionId: executionAuthorityId(source.currentContentVersionId, 'sourceVersionRefs.currentContentVersionId'), ...(candidate ? { candidateVersionId: executionAuthorityId(source.candidateVersionId, 'sourceVersionRefs.candidateVersionId') } : {}) }; }
function executionFullReviewRefs(value: unknown) {
  const keys = ['currentDirectionVersionId', 'currentSettingVersionId', 'currentOutlineVersionId', 'currentStageOutlineVersionId', 'currentChapterPlanVersionId', 'chapterContentVersionIds'];
  const source = executionRecord(value, keys, 'sourceVersionRefs');
  if (!Array.isArray(source.chapterContentVersionIds) || source.chapterContentVersionIds.length > 100) executionUnsupported('sourceVersionRefs.chapterContentVersionIds must contain at most 100 items');
  const chapters = source.chapterContentVersionIds.map((item, index) => { const row = executionRecord(item, ['chapterId', 'chapterNo', 'currentContentVersionId', 'currentFeatureCardVersionId', 'currentReviewReportId'], `sourceVersionRefs.chapterContentVersionIds[${index}]`); return { chapterId: executionAuthorityId(row.chapterId, 'chapterId'), chapterNo: executionInteger(row.chapterNo, 'chapterNo', 1, 100_000), currentContentVersionId: executionAuthorityId(row.currentContentVersionId, 'currentContentVersionId'), currentFeatureCardVersionId: executionNullableAuthorityId(row.currentFeatureCardVersionId, 'currentFeatureCardVersionId'), currentReviewReportId: executionNullableAuthorityId(row.currentReviewReportId, 'currentReviewReportId') }; }).sort((a, b) => a.chapterNo - b.chapterNo || a.chapterId.localeCompare(b.chapterId));
  if (new Set(chapters.map((row) => row.chapterId)).size !== chapters.length) executionUnsupported('chapterContentVersionIds must be unique');
  return { ...Object.fromEntries(keys.slice(0, 5).map((key) => [key, executionAuthorityId(source[key], `sourceVersionRefs.${key}`)])), chapterContentVersionIds: chapters } as never;
}
function executionRecord(value: unknown, keys: string[], path: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) executionUnsupported(`${path} must be an object`); const source = value as Record<string, unknown>; const unknown = Object.keys(source).filter((key) => !keys.includes(key)); if (unknown.length) executionUnsupported(`unknown field ${path}.${unknown[0]}`); return source; }
function executionRequiredRecord(value: unknown, keys: string[], path: string) { const source = executionRecord(value, keys, path); for (const key of keys) if (!(key in source)) executionUnsupported(`${path}.${key} is required`); return source; }
function executionRecordWithRequiredExtensions(value: unknown, requiredKeys: readonly string[], path: string) { if (!value || typeof value !== 'object' || Array.isArray(value)) executionUnsupported(`${path} must be an object`); const source = value as Record<string, unknown>; for (const key of requiredKeys) if (!(key in source)) executionUnsupported(`${path}.${key} is required`); return source; }
function executionActionAuthorityRefs(action: NovelProviderAction, refs: Record<string, unknown>): AuthoritySourceVersionRefsV1 {
  if (refs.sourceIdentitySchemaVersion !== 1) executionUnsupported('sourceVersionRefs.sourceIdentitySchemaVersion must be 1');
  const required = new Set<string>(['sourceIdentitySchemaVersion', 'sourceIdentities', 'novelProviderInputSnapshotHash']);
  if (['direction_generate', 'direction_fuse', 'direction_optimize', 'setting_generate', 'outline_generate', 'stage_outline_generate', 'chapter_plan_generate', 'trial_chapter_one_generate', 'trial_followup_generate'].includes(action)) required.add('preferencesSnapshotHash');
  if (['trial_chapter_one_generate', 'trial_followup_generate', 'body_batch_generate', 'chapter_body_generate', 'chapter_rewrite', 'chapter_impact_assess', 'chapter_adopt_impact_assess', 'novel_full_review'].includes(action)) required.add('chapterProviderInputSnapshotHash');
  if (action === 'trial_chapter_one_generate' || action === 'trial_followup_generate') {
    required.add('chapterRefs'); required.add('chapterInputSnapshotHash');
  }
  if (action === 'body_batch_generate' || action === 'chapter_body_generate') {
    for (const key of ['targetChapterRefs', 'previousContentVersionId', 'longTermMemoryIdentity', 'previousBatchIdentity', 'strategyProviderInputSnapshotHash']) required.add(key);
  }
  for (const key of required) if (!(key in refs)) executionUnsupported(`sourceVersionRefs.${key} is required for ${action}`);
  for (const key of EXECUTION_AUTHORITY_REF_KEYS.slice(4)) {
    if (key in refs && !required.has(key)) executionUnsupported(`sourceVersionRefs.${key} is not allowed for ${action}`);
  }
  const result: AuthoritySourceVersionRefsV1 = {
    sourceIdentitySchemaVersion: 1,
    sourceIdentities: executionAuthoritySourceIdentities(refs.sourceIdentities),
    novelProviderInputSnapshotHash: executionSha256(refs.novelProviderInputSnapshotHash, 'sourceVersionRefs.novelProviderInputSnapshotHash')
  };
  if (required.has('preferencesSnapshotHash')) result.preferencesSnapshotHash = executionSha256(refs.preferencesSnapshotHash, 'sourceVersionRefs.preferencesSnapshotHash');
  if (required.has('chapterProviderInputSnapshotHash')) result.chapterProviderInputSnapshotHash = executionSha256(refs.chapterProviderInputSnapshotHash, 'sourceVersionRefs.chapterProviderInputSnapshotHash');
  if (required.has('chapterRefs')) result.chapterRefs = executionAuthorityChapterRefs(refs.chapterRefs, 'sourceVersionRefs.chapterRefs', false);
  if (required.has('chapterInputSnapshotHash')) result.chapterInputSnapshotHash = executionSha256(refs.chapterInputSnapshotHash, 'sourceVersionRefs.chapterInputSnapshotHash');
  if (required.has('targetChapterRefs')) result.targetChapterRefs = executionAuthorityChapterRefs(refs.targetChapterRefs, 'sourceVersionRefs.targetChapterRefs', true) as AuthorityTargetChapterSourceRefV1[];
  if (required.has('previousContentVersionId')) result.previousContentVersionId = executionNullableAuthorityId(refs.previousContentVersionId, 'sourceVersionRefs.previousContentVersionId');
  if (required.has('longTermMemoryIdentity')) result.longTermMemoryIdentity = executionLongTermMemoryIdentity(refs.longTermMemoryIdentity);
  if (required.has('previousBatchIdentity')) result.previousBatchIdentity = executionPreviousBatchIdentity(refs.previousBatchIdentity);
  if (required.has('strategyProviderInputSnapshotHash')) result.strategyProviderInputSnapshotHash = executionSha256(refs.strategyProviderInputSnapshotHash, 'sourceVersionRefs.strategyProviderInputSnapshotHash');
  return result;
}
function executionAuthoritySourceIdentities(value: unknown): AuthoritySourceIdentityV1[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 512) executionUnsupported('sourceVersionRefs.sourceIdentities must contain 1-512 items');
  const rows = value.map((item, index) => {
    const path = `sourceVersionRefs.sourceIdentities[${index}]`;
    const row = executionRequiredRecord(item, ['sourceType', 'sourceId', 'revision', 'snapshotHash'], path);
    const sourceType = executionText(row.sourceType, `${path}.sourceType`, 40) as AuthoritySourceType;
    if (!(AUTHORITY_SOURCE_TYPES as readonly string[]).includes(sourceType)) executionUnsupported(`${path}.sourceType is unsupported`);
    return {
      sourceType,
      sourceId: executionAuthorityId(row.sourceId, `${path}.sourceId`),
      revision: executionAuthorityRevision(row.revision, `${path}.revision`),
      snapshotHash: executionSha256(row.snapshotHash, `${path}.snapshotHash`)
    };
  });
  const keys = rows.map((row) => `${row.sourceType}\u0000${row.sourceId}`);
  if (new Set(keys).size !== rows.length) executionUnsupported('sourceVersionRefs.sourceIdentities must be unique');
  if (keys.some((key, index) => index > 0 && key <= keys[index - 1]!)) executionUnsupported('sourceVersionRefs.sourceIdentities must be canonically ordered');
  return rows;
}
function executionAuthorityChapterRefs(value: unknown, path: string, target: boolean): AuthorityChapterSourceRefV1[] | AuthorityTargetChapterSourceRefV1[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) executionUnsupported(`${path} must contain 1-100 items`);
  const rows = value.map((item, index) => {
    const keys = ['chapterId', 'chapterNo', 'planVersionId', 'currentContentVersionId', ...(target ? ['providerInputSnapshotHash'] : [])];
    const row = executionRequiredRecord(item, keys, `${path}[${index}]`);
    return {
      chapterId: executionAuthorityId(row.chapterId, `${path}[${index}].chapterId`),
      chapterNo: executionInteger(row.chapterNo, `${path}[${index}].chapterNo`, 1, 100_000),
      planVersionId: executionAuthorityId(row.planVersionId, `${path}[${index}].planVersionId`),
      currentContentVersionId: executionNullableAuthorityId(row.currentContentVersionId, `${path}[${index}].currentContentVersionId`),
      ...(target ? { providerInputSnapshotHash: executionSha256(row.providerInputSnapshotHash, `${path}[${index}].providerInputSnapshotHash`) } : {})
    };
  });
  if (new Set(rows.map((row) => row.chapterId)).size !== rows.length) executionUnsupported(`${path} chapterId values must be unique`);
  if (rows.some((row, index) => index > 0 && (row.chapterNo < rows[index - 1]!.chapterNo || (row.chapterNo === rows[index - 1]!.chapterNo && row.chapterId <= rows[index - 1]!.chapterId)))) executionUnsupported(`${path} must be canonically ordered`);
  return rows;
}
function executionLongTermMemoryIdentity(value: unknown): LongTermMemoryAuthorityIdentityV1 | null {
  if (value === null) return null;
  const row = executionRequiredRecord(value, ['id', 'sourceContentVersionId', 'snapshotHash'], 'sourceVersionRefs.longTermMemoryIdentity');
  return { id: executionAuthorityId(row.id, 'sourceVersionRefs.longTermMemoryIdentity.id'), sourceContentVersionId: executionAuthorityId(row.sourceContentVersionId, 'sourceVersionRefs.longTermMemoryIdentity.sourceContentVersionId'), snapshotHash: executionSha256(row.snapshotHash, 'sourceVersionRefs.longTermMemoryIdentity.snapshotHash') };
}
function executionPreviousBatchIdentity(value: unknown): PreviousBatchAuthorityIdentityV1 | null {
  if (value === null) return null;
  const row = executionRequiredRecord(value, ['id', 'summaryHash'], 'sourceVersionRefs.previousBatchIdentity');
  return { id: executionAuthorityId(row.id, 'sourceVersionRefs.previousBatchIdentity.id'), summaryHash: executionSha256(row.summaryHash, 'sourceVersionRefs.previousBatchIdentity.summaryHash') };
}
function executionId(value: unknown, path: string) { return executionText(value, path, 128); }
function executionAuthorityId(value: unknown, path: string) { const id = executionId(value, path); if (isPlaceholderAuthorityIdentifier(id)) executionUnsupported(`${path} must identify a real authoritative source`); return id; }
function executionAuthorityRevision(value: unknown, path: string): string | number { if (Number.isInteger(value) && (value as number) > 0) return value as number; return executionAuthorityId(value, path); }
function executionTrustedActorId(value: unknown, path: string, forbidden: string) { const id = executionId(value, path); if (id === forbidden || isPlaceholderAuthorityIdentifier(id)) executionUnsupported(`${path} must identify a trusted actor`); return id; }
function executionNullableId(value: unknown, path: string) { return value === null || value === undefined ? null : executionId(value, path); }
function executionNullableAuthorityId(value: unknown, path: string) { return value === null || value === undefined ? null : executionAuthorityId(value, path); }
function executionOptionalPageVersionSnapshot(value: unknown): Record<string, unknown> | undefined { if (value === undefined || value === null) return undefined; if (!value || typeof value !== 'object' || Array.isArray(value)) executionUnsupported('effectiveRequest.pageVersionSnapshot must be an object'); return structuredClone(value) as Record<string, unknown>; }
function executionText(value: unknown, path: string, max: number) { const normalized = typeof value === 'string' ? value.trim() : ''; if (normalized.length < 1 || normalized.length > max) executionUnsupported(`${path} must be 1-${max} characters`); return normalized; }
function executionOptionalText(value: unknown, path: string, max: number) { return value === undefined || value === null || value === '' ? undefined : executionText(value, path, max); }
function executionInteger(value: unknown, path: string, min: number, max: number) { if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) executionUnsupported(`${path} must be ${min}-${max}`); return value as number; }
function executionSha256(value: unknown, path: string) { const text = executionText(value, path, 64); if (!/^[a-f0-9]{64}$/.test(text) || /^0{64}$/.test(text)) executionUnsupported(`${path} must be a non-placeholder SHA-256 hex digest`); return text; }
function executionIsoDate(value: unknown, path: string) { const text = executionText(value, path, 40); const parsed = new Date(text); if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== text) executionUnsupported(`${path} must be canonical ISO-8601`); return text; }
function executionIdArray(value: unknown, path: string, min: number, max: number) { if (!Array.isArray(value)) executionUnsupported(`${path} must be an array`); const normalized = [...new Set(value.map((item, index) => executionId(item, `${path}[${index}]`)))].sort(); if (normalized.length < min || normalized.length > max) executionUnsupported(`${path} must contain ${min}-${max} unique items`); return normalized; }
function executionAuthorityIdArray(value: unknown, path: string, min: number, max: number) { if (!Array.isArray(value)) executionUnsupported(`${path} must be an array`); const normalized = [...new Set(value.map((item, index) => executionAuthorityId(item, `${path}[${index}]`)))].sort(); if (normalized.length < min || normalized.length > max) executionUnsupported(`${path} must contain ${min}-${max} unique items`); return normalized; }
function executionUnsupported(message: string): never { throw new WorkerPayloadUnsupportedError(message); }

export function isPlaceholderAuthorityIdentifier(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const normalized = value.trim();
  if (!normalized || /^0+$/.test(normalized)) return true;
  if (/^policy_default_v[1-9]\d*$/i.test(normalized)) return false;
  const camelSeparated = normalized.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  const tokens = camelSeparated.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((token) => AUTHORITY_PLACEHOLDER_TOKENS.has(token))
    || tokens.some((token, index) => token === 'object' && tokens[index + 1] === 'id');
}

function assertAuthoritySourceIdentityCoverage(envelope: ExecutionEnvelopeV1_1): void {
  const identities = envelope.sourceVersionRefs.sourceIdentities;
  const byKey = new Map(identities.map((identity) => [`${identity.sourceType}\u0000${identity.sourceId}`, identity]));
  const expectedKeys = new Set<string>();
  const requireIdentity = (sourceType: AuthoritySourceType, sourceId: string | null | undefined, path: string, revision?: string | number) => {
    if (sourceId === null || sourceId === undefined) return;
    const key = `${sourceType}\u0000${sourceId}`;
    expectedKeys.add(key);
    const identity = byKey.get(key);
    if (!identity) executionUnsupported(`${path} is missing a matching source identity`);
    if (revision !== undefined && identity.revision !== revision) executionUnsupported(`${path} source identity revision does not match`);
  };
  requireIdentity('novel', envelope.novelId, 'novelId');
  const refs = envelope.sourceVersionRefs as unknown as Record<string, unknown>;
  if ('preferencesSnapshotHash' in refs) requireIdentity('preferences', envelope.novelId, 'sourceVersionRefs.preferencesSnapshotHash');
  const currentTypes: Array<[string, AuthoritySourceType]> = [
    ['currentDirectionVersionId', 'direction'], ['currentSettingVersionId', 'setting'],
    ['currentOutlineVersionId', 'outline'], ['currentStageOutlineVersionId', 'stage_outline'],
    ['currentChapterPlanVersionId', 'chapter_plan']
  ];
  for (const [key, sourceType] of currentTypes) requireIdentity(sourceType, refs[key] as string | null | undefined, `sourceVersionRefs.${key}`);
  if (Array.isArray(refs.sourceVersionIds)) {
    for (const [index, id] of refs.sourceVersionIds.entries()) requireIdentity('direction', id as string, `sourceVersionRefs.sourceVersionIds[${index}]`);
  }
  requireIdentity('trial_run', refs.trialRunId as string | null | undefined, 'sourceVersionRefs.trialRunId');
  requireIdentity('chapter_content', refs.selectedChapterOneCandidateId as string | null | undefined, 'sourceVersionRefs.selectedChapterOneCandidateId');
  requireIdentity('body_strategy_snapshot', refs.strategySnapshotId as string | null | undefined, 'sourceVersionRefs.strategySnapshotId', refs.strategySnapshotVersion as number | undefined);
  requireIdentity('chapter_content', refs.currentContentVersionId as string | null | undefined, 'sourceVersionRefs.currentContentVersionId');
  requireIdentity('chapter_content', refs.candidateVersionId as string | null | undefined, 'sourceVersionRefs.candidateVersionId');
  if (['chapter_body_generate', 'chapter_rewrite', 'chapter_impact_assess', 'chapter_adopt_impact_assess'].includes(envelope.action)) {
    requireIdentity('chapter', envelope.objectId, 'objectId');
  }
  for (const key of ['chapterRefs', 'targetChapterRefs'] as const) {
    if (!Array.isArray(refs[key])) continue;
    for (const [index, item] of (refs[key] as Array<AuthorityChapterSourceRefV1>).entries()) {
      requireIdentity('chapter', item.chapterId, `sourceVersionRefs.${key}[${index}].chapterId`);
    }
  }
  requireIdentity('chapter_content', refs.previousContentVersionId as string | null | undefined, 'sourceVersionRefs.previousContentVersionId');
  const memory = refs.longTermMemoryIdentity as LongTermMemoryAuthorityIdentityV1 | null | undefined;
  requireIdentity('long_term_memory', memory?.id, 'sourceVersionRefs.longTermMemoryIdentity.id');
  const batch = refs.previousBatchIdentity as PreviousBatchAuthorityIdentityV1 | null | undefined;
  requireIdentity('body_batch', batch?.id, 'sourceVersionRefs.previousBatchIdentity.id');
  if (Array.isArray(refs.chapterContentVersionIds)) {
    for (const [index, item] of refs.chapterContentVersionIds.entries()) {
      const row = item as FullReviewChapterSourceRefV1;
      requireIdentity('chapter', row.chapterId, `sourceVersionRefs.chapterContentVersionIds[${index}].chapterId`);
    }
  }
  if (expectedKeys.size !== identities.length || identities.some((identity) => !expectedKeys.has(`${identity.sourceType}\u0000${identity.sourceId}`))) {
    executionUnsupported(`sourceVersionRefs.sourceIdentities contains an identity not used by ${envelope.action}`);
  }
}

export interface RecommendedActionDTO {
  type: string;
  label: string;
  reasonText: string;
  target: 'detail' | 'task' | 'drawer' | 'dialog' | 'disabled';
  disabled: boolean;
  disabledReason: string | null;
  confirmRequired: boolean;
  taskType: string | null;
}

export interface NovelStatusSummaryDTO {
  lifecycleStatus: NovelLifecycleStatus;
  creationStage: NovelCreationStage;
  stageStatus: StageStatus;
  displayStatus: string;
  displayStatusText: string;
  currentStep: string;
  completedSteps: string[];
  blockingReasons: string[];
  recommendedAction: RecommendedActionDTO;
  videoPreparationStatus: string;
  videoReferenceStatus: string;
  calculatedAt: string;
  calculationVersion: string;
}

export interface NovelScoreSummaryDTO {
  qualityScore: number | null;
  marketScore: number | null;
  riskLevel: string;
}

export interface NovelChapterProgressDTO {
  plannedChapterCount: number;
  completedChapterCount: number;
  pendingChapterCount: number;
  text: string;
}

export interface NovelVideoReferenceSummaryDTO {
  status: string;
  statusText: string;
  referencedVideoCount: number;
}

export interface RecentTaskSummaryDTO {
  id: string;
  taskType: string;
  status: TaskStatus | string;
  statusText: string;
  progress: number;
  currentStep: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskTraceDTO {
  taskId: string;
  requestId: string | null;
  retryOfTaskId: string | null;
}

export interface TaskEventDTO {
  id: string;
  taskId: string;
  status: TaskStatus | string;
  statusText: string;
  eventType: string;
  eventTypeText: string;
  message: string;
  progress: number | null;
  requestId: string | null;
  createdAt: string;
}

export interface TaskDetailDTO extends RecentTaskSummaryDTO {
  novelId: string | null;
  objectType: string | null;
  objectId: string | null;
  statusNote: string | null;
  sourceVersionRefs: unknown;
  conflictScope: string | null;
  conflictKey: string | null;
  resultVersionIds: string[];
  retryOfTaskId: string | null;
  failureCategory: string | null;
  failureCategoryText: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  userFailureReason: string | null;
  retryable: boolean;
  cancellable: boolean;
  cancelReason: string | null;
  trace: TaskTraceDTO;
  nextAction: RecommendedActionDTO;
  createdAt: string;
  updatedAt: string;
  events: TaskEventDTO[];
}

export interface TaskEventListDTO {
  items: TaskEventDTO[];
}

export interface RetryTaskRequest {
  reason?: string | null;
}

export interface CancelTaskRequest {
  reason?: string | null;
}

export interface RetryTaskResultDTO {
  originalTask: TaskDetailDTO;
  newTask: TaskDetailDTO;
}

export interface CancelTaskResultDTO {
  task: TaskDetailDTO;
}

export interface DirectionCandidateContentDTO {
  title: string;
  logline: string;
  coreHook: string;
  audienceAppeal: string;
  videoPotential: string;
  sellingPoints: string[];
  riskTags: string[];
  recommendation: string;
}

export interface DirectionCandidateDTO {
  id: string;
  versionNo: number;
  status: VersionStatus;
  staleLevel: StaleLevel;
  title: string;
  summary: string;
  content: DirectionCandidateContentDTO;
  score: number;
  marketScore: number;
  riskLevel: RiskLevel;
  riskTags: string[];
  recommendedReason: string;
  createdAt: string;
}

export interface DirectionTaskDTO extends RecentTaskSummaryDTO {
  resultVersionIds: string[];
  statusNote?: string | null;
  failureCategory?: string | null;
}

export interface DirectionActionResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  task: DirectionTaskDTO;
  candidates: DirectionCandidateDTO[];
  candidate: DirectionCandidateDTO | null;
  currentDirection: DirectionCandidateDTO | null;
  affectedObjects: string[];
  nextAction: RecommendedActionDTO;
}

export type StructureAssetType = 'setting' | 'outline' | 'stage_outline' | 'chapter_plan';

export interface StructureSectionDTO {
  title: string;
  body: string;
  items: string[];
}

export interface StageOutlineItemDTO {
  stageIndex: number;
  title: string;
  chapterRange: string;
  goal: string;
  conflict: string;
  payoff: string;
}

export interface ChapterPlanItemDTO {
  chapterNo: number;
  stageIndex: number;
  title: string;
  wordTarget: number;
  goal: string;
  conflict: string;
  hook: string;
}

export interface StructureAssetContentDTO {
  title: string;
  summary: string;
  sections: StructureSectionDTO[];
  stages: StageOutlineItemDTO[];
  chapters: ChapterPlanItemDTO[];
  riskTags: string[];
  recommendation: string;
}

export interface StructureAssetDTO {
  id: string;
  objectType: StructureAssetType;
  versionNo: number;
  status: VersionStatus;
  staleLevel: StaleLevel;
  title: string;
  summary: string;
  content: StructureAssetContentDTO;
  score: number;
  riskLevel: RiskLevel;
  riskTags: string[];
  recommendedReason: string;
  createdAt: string;
}

export interface StructureTaskDTO extends RecentTaskSummaryDTO {
  resultVersionIds: string[];
}

export interface NovelChapterDTO {
  id: string;
  chapterNo: number;
  stageIndex: number | null;
  title: string;
  wordTarget: number | null;
  wordCount: number;
  mainStatus: string;
  statusNote: string | null;
  impactLevel: string;
  currentContentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StructureActionResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  task: StructureTaskDTO;
  candidates: StructureAssetDTO[];
  candidate: StructureAssetDTO | null;
  currentAssets: {
    direction: DirectionCandidateDTO | null;
    setting: StructureAssetDTO | null;
    outline: StructureAssetDTO | null;
    stageOutline: StructureAssetDTO | null;
    chapterPlan: StructureAssetDTO | null;
  };
  chapters: NovelChapterDTO[];
  affectedObjects: string[];
  nextAction: RecommendedActionDTO;
}

export interface ScoringDimensionDTO {
  key: string;
  label: string;
  score: number;
  weight: number;
  evidence: string;
  penaltyPoints: number;
}

export interface QualityScoringDTO {
  scoringStrategyVersion: string;
  totalScore: number;
  gateResult: 'pass' | 'warning' | 'hard_fail';
  gateResultText: string;
  dimensions: ScoringDimensionDTO[];
  weights: Record<string, number>;
  evidence: string[];
  penalties: string[];
  hardFailure: boolean;
  hardFailureReasons: string[];
}

export interface TrialChapterCandidateDTO {
  id: string;
  chapterId: string;
  chapterNo: number;
  title: string;
  versionNo: number;
  status: VersionStatus | 'selected_for_trial' | 'historical';
  staleLevel: StaleLevel;
  isAiRecommended: boolean;
  isSelected: boolean;
  openingStrategy: string;
  openingHighlight: string;
  firstSentence: string;
  first300Summary: string;
  endingHook: string;
  riskLevel: RiskLevel;
  riskTags: string[];
  aiRecommendedReason: string;
  wordCount: number;
  contentPreview: string;
  content: string;
  scoring: QualityScoringDTO;
  createdAt: string;
}

export interface ChapterFeatureCardDTO {
  id: string;
  chapterId: string;
  versionNo: number;
  status: VersionStatus | string;
  oneLineSummary: string;
  coreTask: string;
  mainConflict: string;
  appealPoint: string;
  emotionKeywords: string[];
  characterChanges: string[];
  relationshipChanges: string[];
  keyInformation: string[];
  foreshadowingOperation: string;
  endingHook: string;
  factsCannotChange: string[];
  featuresToStrengthen: string[];
  createdAt: string;
}

export interface ChapterReviewIssueDTO {
  severity: 'info' | 'warning' | 'blocking';
  dimension: string;
  message: string;
  suggestion: string;
}

export interface ChapterReviewReportDTO {
  id: string;
  objectVersionId: string | null;
  reviewLevel: string;
  scoringStrategyVersion: string;
  totalScore: number;
  rating: string;
  summary: string;
  strengths: string[];
  problems: string[];
  suggestions: string[];
  issues: ChapterReviewIssueDTO[];
  recommendedAction: string;
  allowNextStep: boolean;
  blockingIssueCount: number;
  createdAt: string;
}

export interface LongTermMemoryDTO {
  id: string;
  chapterId: string | null;
  sourceContentVersionId: string | null;
  summary: string;
  factsCannotContradict: string[];
  unresolvedConflicts: string[];
  status: VersionStatus | string;
  staleLevel: StaleLevel;
  createdAt: string;
}

export type ImpactCaseVisibleStatus = 'assessing' | 'waiting_decision' | 'handling' | 'resolved' | 'ignored' | 'cancelled';

export interface ImpactCaseDTO {
  id: string;
  novelId: string;
  sourceChapterId: string | null;
  sourceOldVersionId: string | null;
  sourceNewVersionId: string | null;
  impactLevel: ImpactLevel;
  impactLevelText: string;
  status: ImpactCaseVisibleStatus;
  statusText: string;
  summary: string;
  changedFacts: string[];
  affectedChapterIds: string[];
  affectedVideoReferenceIds: string[];
  recommendedHandling: string;
  suggestedActions: string[];
  blocksFullReview: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ChapterSummaryCompareDTO {
  currentSummary: string;
  candidateSummary: string;
  benefit: string;
  newRisks: string[];
  possibleImpact: string;
  aiSuggestion: string;
}

export interface TrialChapterResultDTO {
  id: string;
  chapterId: string;
  chapterNo: number;
  title: string;
  status: string;
  score: number;
  hardFailed: boolean;
  hardFailureReasons: string[];
  contentVersion: TrialChapterCandidateDTO | null;
  featureCard: ChapterFeatureCardDTO | null;
  reviewReport: ChapterReviewReportDTO | null;
}

export interface TrialReviewDTO {
  id: string;
  scoringStrategyVersion: string;
  totalScore: number;
  trialResult: 'pass' | 'pass_with_suggestions' | 'return_upstream' | 'blocked';
  trialResultText: string;
  allowNextStep: boolean;
  requiresRiskConfirmation: boolean;
  strengths: string[];
  problems: string[];
  suggestions: string[];
  chapterScores: Array<{
    chapterNo: number;
    score: number;
    hardFailed: boolean;
  }>;
  recommendedAction: string;
}

export interface BodyGenerationStrategySnapshotDTO {
  id: string;
  versionNo: number;
  status: VersionStatus | string;
  summary: string;
  sourceTrialRunId: string;
  selectedChapterOneVersionId: string;
  writingStyle: string;
  rhythm: string;
  protagonistGuidance: string;
  conflictGuidance: string;
  endingHookRule: string;
  longMemory: string[];
  acceptedRisks: string[];
  enhancedReviewRules: string[];
  createdAt: string;
}

export type BodyBatchStatus = 'completed' | 'paused' | 'cancelled';

export interface BodyBatchChapterResultDTO {
  chapterId: string;
  chapterNo: number;
  title: string;
  status: 'completed' | 'failed' | 'pending';
  statusText: string;
  contentVersionId: string | null;
  featureCardId: string | null;
  reviewReportId: string | null;
  longTermMemoryId: string | null;
  score: number | null;
  riskLevel: RiskLevel;
  hardFailed: boolean;
  statusNote: string | null;
  recommendedAction: string;
}

export interface BodyBatchSummaryDTO {
  id: string;
  batchId: string;
  conclusion: string;
  chapterResults: BodyBatchChapterResultDTO[];
  riskTrend: string;
  nextBatchNotes: string[];
  riskChapterIds: string[];
  createdAt: string;
}

export interface BodyBatchDTO {
  id: string;
  taskId: string;
  status: BodyBatchStatus;
  statusText: string;
  strategySnapshotId: string;
  strategySnapshotVersion: number;
  startChapterNo: number;
  endChapterNo: number;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  failedChapterNo: number | null;
  statusNote: string | null;
  chapterResults: BodyBatchChapterResultDTO[];
  summary: BodyBatchSummaryDTO;
  createdAt: string;
}

export interface BodyGenerationStateDTO {
  strategySnapshot: BodyGenerationStrategySnapshotDTO | null;
  latestBatch: BodyBatchDTO | null;
  openImpactCases: ImpactCaseDTO[];
  nextBatchRange: {
    startChapterNo: number | null;
    endChapterNo: number | null;
    batchSize: number;
    text: string;
  };
  chapterProgress: NovelChapterProgressDTO;
  blockingReasons: string[];
  recommendedAction: RecommendedActionDTO;
}

export interface BodyBatchActionResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  task: DirectionTaskDTO;
  batch: BodyBatchDTO | null;
  bodyGeneration: BodyGenerationStateDTO;
  chapters: NovelChapterDTO[];
  affectedObjects: string[];
  nextAction: RecommendedActionDTO;
}

export type FullReviewGateResult = 'pass' | 'warning' | 'blocked' | 'forced_pass';
export type FullReviewIssueStatus = 'open' | 'accepted_risk' | 'resolved' | 'stale';

export interface FullReviewIssueDTO {
  issueId: string;
  title: string;
  plainDescription: string;
  severity: 'info' | 'warning' | 'blocking';
  scopeType: 'novel' | 'chapter' | 'stage' | 'structure';
  scopeRefs: string[];
  dimension: string;
  blocking: boolean;
  recommendedTarget: string;
  recommendedAction: string;
  status: FullReviewIssueStatus;
  acceptedReason: string | null;
}

export interface FirstVideoSuggestionDTO {
  chapterRange: string;
  openingSlice: string;
  narrationHook: string;
  firstScreenSubtitle: string;
  titleHook: string;
  endingSuspense: string;
  suggestedFormat: string;
  riskTips: string[];
}

export interface FullReviewGateDTO {
  id: string;
  reviewReportId: string;
  gateResult: FullReviewGateResult;
  gateResultText: string;
  allowCompletion: boolean;
  allowVideoReady: boolean;
  blockingIssueCount: number;
  warningIssueCount: number;
  forcePassAllowed: boolean;
  forcePassReason: string | null;
  isStale: boolean;
  staleReason: string | null;
  createdAt: string;
}

export interface FullReviewReportDTO {
  id: string;
  version: number;
  reviewLevel: 'full_novel';
  totalScore: number;
  rating: string;
  gateResult: FullReviewGateResult;
  summary: string;
  strengths: string[];
  problems: string[];
  suggestions: string[];
  dimensionScores: ScoringDimensionDTO[];
  issues: FullReviewIssueDTO[];
  videoSuggestion: string;
  firstVideoSuggestion: FirstVideoSuggestionDTO;
  platformRisks: string[];
  originalityRisks: string[];
  aiFlavorRisks: string[];
  lowScoreContinueRisks: string[];
  reviewPolicyVersionId: string;
  sourceVersionRefs: unknown;
  gate: FullReviewGateDTO;
  createdAt: string;
}

export interface FullReviewActionResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  task: DirectionTaskDTO;
  fullReview: FullReviewReportDTO;
  affectedObjects: string[];
  nextAction: RecommendedActionDTO;
}

export interface FullReviewLatestResultDTO {
  novelId: string;
  fullReview: FullReviewReportDTO | null;
  statusSummary: NovelStatusSummaryDTO;
  nextAction: RecommendedActionDTO;
}

export interface FullReviewIssueActionResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  fullReview: FullReviewReportDTO;
  issue: FullReviewIssueDTO;
  nextAction: RecommendedActionDTO;
}

export interface CompletionDecisionDTO {
  id: string;
  reviewReportId: string;
  fullReviewGateId: string;
  decision: string;
  reason: string;
  isForced: boolean;
  score: number;
  riskSummary: string;
  chapterCount: number;
  totalWordCount: number;
  estimatedAudioMinutes: number;
  createdAt: string;
}

export interface VideoReadinessCheckItemDTO {
  key: string;
  label: string;
  passed: boolean;
  severity: 'info' | 'warning' | 'blocking';
  message: string;
  nextAction: string;
}

export interface VideoReadinessCheckDTO {
  id: string;
  version: number;
  status: 'candidate' | 'not_ready' | 'ready';
  statusText: string;
  checkItems: VideoReadinessCheckItemDTO[];
  blockingReasons: string[];
  firstVideoSuggestion: FirstVideoSuggestionDTO;
  createdAt: string;
}

export interface VideoReadinessSnapshotDTO {
  id: string;
  completionDecisionId: string;
  reviewReportId: string;
  status: 'ready';
  chapterCount: number;
  totalWordCount: number;
  estimatedAudioMinutes: number;
  riskSummary: string;
  referableChapterIds: string[];
  referableChapterVersionIds: string[];
  firstVideoSuggestion: FirstVideoSuggestionDTO;
  createdAt: string;
}

export interface VideoReadinessDTO {
  novelId: string;
  status: 'not_ready' | 'candidate' | 'ready';
  statusText: string;
  check: VideoReadinessCheckDTO | null;
  checkItems: VideoReadinessCheckItemDTO[];
  blockingReasons: string[];
  completionDecision: CompletionDecisionDTO | null;
  snapshot: VideoReadinessSnapshotDTO | null;
  firstVideoSuggestion: FirstVideoSuggestionDTO | null;
  recommendedAction: RecommendedActionDTO;
}

export interface CompletionActionResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  completionDecision: CompletionDecisionDTO;
  videoReadiness: VideoReadinessDTO;
  affectedObjects: string[];
  nextAction: RecommendedActionDTO;
}

export interface VideoReadinessActionResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  task: DirectionTaskDTO | null;
  videoReadiness: VideoReadinessDTO;
  affectedObjects: string[];
  nextAction: RecommendedActionDTO;
}

export interface ChapterRewriteResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  task: DirectionTaskDTO;
  chapter: NovelChapterDTO;
  currentContent: TrialChapterCandidateDTO | null;
  candidate: TrialChapterCandidateDTO;
  summaryCompare: ChapterSummaryCompareDTO;
  affectedObjects: string[];
  nextAction: RecommendedActionDTO;
}

export interface ChapterContentAdoptionResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  task: DirectionTaskDTO;
  chapter: NovelChapterDTO;
  previousContentVersionId: string | null;
  currentContent: TrialChapterCandidateDTO;
  impactCase: ImpactCaseDTO;
  affectedObjects: string[];
  nextAction: RecommendedActionDTO;
}

export interface ImpactAssessmentActionResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  task: DirectionTaskDTO;
  impactCase: ImpactCaseDTO;
  nextAction: RecommendedActionDTO;
}

export interface ImpactCaseResolveResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  impactCase: ImpactCaseDTO;
  nextAction: RecommendedActionDTO;
}

export interface TrialRunDTO {
  id: string;
  novelId: string;
  status: string;
  statusText: string;
  chapterCount: number;
  currentStep: string;
  selectedChapterOneCandidateId: string | null;
  blockingReason: string | null;
  chapterOneCandidates: TrialChapterCandidateDTO[];
  chapterResults: TrialChapterResultDTO[];
  trialReview: TrialReviewDTO | null;
  bodyStrategySnapshot: BodyGenerationStrategySnapshotDTO | null;
  task: RecentTaskSummaryDTO | null;
  recentTask: RecentTaskSummaryDTO | null;
}

export interface TrialActionResultDTO {
  novelId: string;
  statusSummary: NovelStatusSummaryDTO;
  task: DirectionTaskDTO;
  trialRun: TrialRunDTO;
  bodyStrategySnapshot: BodyGenerationStrategySnapshotDTO | null;
  affectedObjects: string[];
  nextAction: RecommendedActionDTO;
}

export interface ChapterWorkbenchDTO {
  novelId: string;
  chapter: NovelChapterDTO;
  currentContent: TrialChapterCandidateDTO | null;
  featureCard: ChapterFeatureCardDTO | null;
  reviewReport: ChapterReviewReportDTO | null;
  reviewIssues: ChapterReviewIssueDTO[];
  candidateVersions: TrialChapterCandidateDTO[];
  candidateCompares: Record<string, ChapterSummaryCompareDTO>;
  longTermMemory: LongTermMemoryDTO | null;
  impactCases: ImpactCaseDTO[];
  recentTask: RecentTaskSummaryDTO | null;
  recommendedAction: RecommendedActionDTO;
}

export interface PrimaryActionDTO {
  type: string;
  label: string;
  target: 'detail';
}

export const NOVEL_CREATION_SOURCE_REQUEST_TYPES = ['system_recommendation', 'hotspot_reference', 'manual_idea'] as const;
export const NOVEL_CREATION_SOURCE_RESPONSE_TYPES = [...NOVEL_CREATION_SOURCE_REQUEST_TYPES, 'legacy_unknown'] as const;

export type NovelCreationSourceRequestType = (typeof NOVEL_CREATION_SOURCE_REQUEST_TYPES)[number];
export type NovelCreationSourceType = (typeof NOVEL_CREATION_SOURCE_RESPONSE_TYPES)[number];

export const NOVEL_CREATION_SOURCE_DB_VALUES = {
  system_recommendation: 'SYSTEM_RECOMMENDATION',
  hotspot_reference: 'HOTSPOT_REFERENCE',
  manual_idea: 'MANUAL_IDEA',
  legacy_unknown: 'LEGACY_UNKNOWN'
} as const satisfies Record<NovelCreationSourceType, string>;

export function novelCreationSourceFromDb(value: string | null | undefined): NovelCreationSourceType {
  const normalized = value?.trim().toUpperCase();

  switch (normalized) {
    case 'SYSTEM_RECOMMENDATION':
      return 'system_recommendation';
    case 'HOTSPOT_REFERENCE':
      return 'hotspot_reference';
    case 'MANUAL_IDEA':
      return 'manual_idea';
    case 'LEGACY_UNKNOWN':
    default:
      return 'legacy_unknown';
  }
}

export function novelCreationSourceToDb(value: NovelCreationSourceType): string {
  return NOVEL_CREATION_SOURCE_DB_VALUES[value];
}

export interface NovelCreationSourceSummaryDTO {
  type: NovelCreationSourceType;
  label: string;
  description: string;
  hotspotReportId: string | null;
  hotspotOpportunityId: string | null;
  hotspotTitle: string | null;
  hotspotOpportunityTitle: string | null;
  isLegacyUnknown: boolean;
  unavailableReason: string | null;
}

export interface NovelListItemDTO {
  id: string;
  title: string;
  channel: string;
  genres: string[];
  lifecycleStatus: NovelLifecycleStatus;
  creationStage: NovelCreationStage;
  stageStatus: StageStatus;
  statusSummary: NovelStatusSummaryDTO;
  scoreSummary: NovelScoreSummaryDTO;
  chapterProgress: NovelChapterProgressDTO;
  videoReferenceSummary: NovelVideoReferenceSummaryDTO;
  creationSource: NovelCreationSourceSummaryDTO;
  recentTask: RecentTaskSummaryDTO | null;
  primaryAction: PrimaryActionDTO;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNovelPreferencesDTO {
  creationSourceType: NovelCreationSourceType;
  creationSourceLabel: string;
  creationSourceDescription: string;
  hotspotReportId: string | null;
  hotspotOpportunityId: string | null;
  hotspotTitle: string | null;
  hotspotOpportunityTitle: string | null;
  appealPoints: string[];
  genres: string[];
  openingState: string | null;
  blockedElements: string[];
  targetAudience: string | null;
  chapterLimit: number;
  chapterWordMin: number;
  chapterWordMax: number;
  stageCount: number | null;
  customIdea: string | null;
  style: string | null;
  videoAdaptationPreference: string | null;
}

export interface NovelDetailDTO extends NovelListItemDTO {
  preferences: CreateNovelPreferencesDTO;
  currentAssets: {
    direction: DirectionCandidateDTO | null;
    setting: StructureAssetDTO | null;
    outline: StructureAssetDTO | null;
    stageOutline: StructureAssetDTO | null;
    chapterPlan: StructureAssetDTO | null;
  };
  directionCandidates: DirectionCandidateDTO[];
  structureCandidates: StructureAssetDTO[];
  chapters: NovelChapterDTO[];
  chapterStats: NovelChapterProgressDTO;
  latestTrialRun: TrialRunDTO | null;
  bodyStrategySnapshot: BodyGenerationStrategySnapshotDTO | null;
  bodyGeneration: BodyGenerationStateDTO | null;
  latestFullReview: FullReviewReportDTO | null;
  completionDecision: CompletionDecisionDTO | null;
  videoReadiness: VideoReadinessDTO | null;
  recentTasks: RecentTaskSummaryDTO[];
  blockingReasons: string[];
  videoSummary: NovelVideoReferenceSummaryDTO;
}

export interface NovelRowSummaryDTO {
  novelId: string;
  recentTask: RecentTaskSummaryDTO | null;
  recentReviewSummary: string | null;
  pendingChapters: number;
  riskTips: string[];
  recommendedAction: RecommendedActionDTO;
}

export interface CreateNovelDraftRequest {
  title: string;
  channel?: string;
  creationSourceType?: NovelCreationSourceRequestType;
  genres?: string[];
  hotspotReportId?: string | null;
  hotspotOpportunityId?: string | null;
  preferences?: {
    appealPoints?: string[];
    openingState?: string | null;
    blockedElements?: string[];
    targetAudience?: string | null;
    stageCount?: number | null;
    customIdea?: string | null;
    style?: string | null;
    videoAdaptationPreference?: string | null;
  };
  chapterLimit?: number;
  chapterWordRange?: {
    min: number;
    max: number;
  };
}

export interface GenerateDirectionsRequest {
  regenerateReason?: string | null;
  idempotencyKey?: string | null;
}

export interface FuseDirectionsRequest {
  versionIds: string[];
  reason?: string | null;
  idempotencyKey?: string | null;
}

export interface OptimizeDirectionRequest {
  instruction?: string | null;
  idempotencyKey?: string | null;
}

export interface EditDirectionCandidateRequest {
  title: string;
  logline: string;
  coreHook: string;
  audienceAppeal: string;
  videoPotential: string;
  sellingPoints: string[];
  riskTags: string[];
  recommendation: string;
  reason: string;
}

export interface AdoptDirectionRequest {
  confirmLowScore?: boolean;
  reason?: string | null;
  pageVersionSnapshot?: unknown;
  currentVersionId?: string | null;
}

export interface GenerateStructureAssetRequest {
  regenerateReason?: string | null;
  idempotencyKey?: string | null;
}

export interface EditStructureAssetRequest {
  title: string;
  summary: string;
  sectionTitle: string;
  sectionBody: string;
  sectionItems: string[];
  riskTags: string[];
  recommendation: string;
  reason: string;
}

export interface AdoptStructureAssetRequest {
  confirmHighRisk?: boolean;
  reason?: string | null;
  pageVersionSnapshot?: unknown;
  currentVersionId?: string | null;
}

export interface UpdateChapterWordTargetsRequest {
  updates: Array<{
    chapterNo: number;
    wordTarget: number;
  }>;
  reason?: string | null;
  currentChapterPlanVersionId?: string | null;
}

export interface GenerateTrialRequest {
  chapterCount?: number;
  trialRunId?: string | null;
  selectedCandidateId?: string | null;
  confirmRisk?: boolean;
  selectionReason?: string | null;
  regenerateReason?: string | null;
  idempotencyKey?: string | null;
}

export interface ConfirmTrialRequest {
  trialRunId: string;
  decision: 'confirm_pass' | 'force_pass' | 'return_upstream';
  reason?: string | null;
  confirmRisk?: boolean;
}

export interface GenerateBodyBatchRequest {
  strategySnapshotId: string;
  expectedStrategySnapshotVersion: number;
  startChapterNo?: number | null;
  endChapterNo?: number | null;
  idempotencyKey?: string | null;
}

export interface GenerateChapterBodyRequest {
  strategySnapshotId: string;
  expectedStrategySnapshotVersion: number;
  reason?: string | null;
  idempotencyKey?: string | null;
}

export interface StartFullReviewRequest {
  idempotencyKey?: string | null;
  expectedNovelVersion?: string | null;
  reviewPolicyVersionId?: string | null;
}

export interface ResolveFullReviewIssueRequest {
  issueId: string;
  action: 'resolve' | 'accept_risk';
  reason?: string | null;
}

export interface ForcePassFullReviewRequest {
  idempotencyKey: string;
  fullReviewGateId: string;
  expectedReviewReportVersion?: number | null;
  reason: string;
  confirmRisk: boolean;
}

export interface ConfirmCompletionRequest {
  idempotencyKey: string;
  reviewReportId: string;
  fullReviewGateId: string;
  expectedReviewReportVersion?: number | null;
  expectedNovelVersion?: string | null;
  reason?: string | null;
  confirmRisk?: boolean;
}

export interface RecheckVideoReadinessRequest {
  idempotencyKey?: string | null;
}

export interface ConfirmVideoReadinessRequest {
  idempotencyKey: string;
  completionDecisionId: string;
  readinessCheckId: string;
  checkVersion: number;
  expectedNovelVersion?: string | null;
  reason?: string | null;
  confirmRisk?: boolean;
}

export interface RewriteChapterRequest {
  instruction?: string | null;
  reason?: string | null;
  currentContentVersionId?: string | null;
  idempotencyKey?: string | null;
}

export interface AdoptChapterContentVersionRequest {
  reason?: string | null;
  currentContentVersionId?: string | null;
  pageVersionSnapshot?: unknown;
  idempotencyKey?: string | null;
}

export interface CreateImpactAssessmentRequest {
  reason?: string | null;
  currentContentVersionId?: string | null;
  idempotencyKey?: string | null;
}

export interface ResolveImpactCaseRequest {
  resolution: 'resolved' | 'ignored' | 'cancelled';
  reason?: string | null;
  handlingChoice?: 'confirm_no_impact' | 'mark_resolved' | 'cancel_case' | null;
}

export interface NovelListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  lifecycleStatus?: NovelLifecycleStatus;
  creationStage?: NovelCreationStage;
  videoReferenceStatus?: string;
}

export type NovelListResultDTO = PagedResult<NovelListItemDTO>;
