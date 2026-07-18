import { createHash } from 'node:crypto';
import {
  assertNoSensitiveExecutionPayload,
  canonicalExecutionJson,
  createExecutionEnvelope,
  normalizeExecutionEnvelope,
  normalizeExecutionEnvelopeV1_1,
  WorkerPayloadUnsupportedError,
  type ExecutionEnvelopeV1,
  type ExecutionEnvelopeV1_1,
  type NovelProviderAction
} from '@ai-shortvideo/shared';
import type {
  GenerationAuthoritySnapshot,
  GenerationTaskRecord,
  HashedSafeResultReceipt,
  LoadGenerationAuthorityInput
} from '../domain/novelDomain.js';

const TASK_ACTIONS: Record<string, readonly NovelProviderAction[]> = {
  novel_direction_generate: ['direction_generate'], novel_direction_fuse: ['direction_fuse'], novel_direction_optimize: ['direction_optimize'],
  novel_setting_generate: ['setting_generate'], novel_outline_generate: ['outline_generate'], stage_outline_generate: ['stage_outline_generate'],
  chapter_plan_generate: ['chapter_plan_generate'], trial_writing_generate: ['trial_chapter_one_generate'], trial_followup_generate: ['trial_followup_generate'],
  body_batch_generate: ['body_batch_generate'], chapter_body_generate: ['chapter_body_generate'], chapter_body_rewrite: ['chapter_rewrite'],
  chapter_impact_assess: ['chapter_impact_assess', 'chapter_adopt_impact_assess'], novel_full_review: ['novel_full_review']
};

export { createExecutionEnvelope, normalizeExecutionEnvelope, WorkerPayloadUnsupportedError };

export function validateExecutionEnvelopeForTask(task: GenerationTaskRecord): ExecutionEnvelopeV1 {
  try {
    if (!task.executionEnvelopeJson) unsupported('execution envelope is missing');
    const envelope = normalizeExecutionEnvelope(task.executionEnvelopeJson);
    const expectedActions = TASK_ACTIONS[task.taskType];
    if (!expectedActions?.includes(envelope.action) || envelope.objectType !== task.objectType || envelope.objectId !== task.objectId
      || canonicalExecutionJson(envelope.sourceVersionRefs) !== canonicalExecutionJson(task.sourceVersionRefs)
      || envelope.policyProfileVersionId !== task.policyProfileVersionId || envelope.modelRoutingVersion !== task.modelRoutingVersion
      || hashCanonicalJson(envelope) !== task.requestHash) unsupported('task and execution envelope mismatch');
    return envelope;
  } catch (error) {
    if (error instanceof WorkerPayloadUnsupportedError) throw error;
    unsupported('execution envelope cannot be deserialized');
  }
}

export function validateExecutionEnvelopeV1_1ForTask(task: GenerationTaskRecord): ExecutionEnvelopeV1_1 {
  try {
    if (!task.executionEnvelopeJson) unsupported('execution envelope is missing');
    const envelope = normalizeExecutionEnvelopeV1_1(task.executionEnvelopeJson);
    if (isUntrustedAuditActor(task.createdBy) || isUntrustedAuditActor(envelope.auditContext.requestedByUserId)) {
      unsupported('audit actor must not use default, legacy, or placeholder identity');
    }
    const expectedActions = TASK_ACTIONS[task.taskType];
    if (
      !expectedActions?.includes(envelope.action)
      || envelope.objectType !== task.objectType
      || envelope.objectId !== task.objectId
      || envelope.tenantId !== task.tenantId
      || envelope.novelId !== task.novelId
      || envelope.auditContext.requestedByUserId !== task.createdBy
      || canonicalExecutionJson(envelope.sourceVersionRefs) !== canonicalExecutionJson(task.sourceVersionRefs)
      || envelope.policyProfileVersionId !== task.policyProfileVersionId
      || envelope.modelRoutingVersion !== task.modelRoutingVersion
      || hashCanonicalJson(envelope) !== task.requestHash
    ) unsupported('task and execution envelope mismatch');
    return envelope;
  } catch (error) {
    if (error instanceof WorkerPayloadUnsupportedError) throw error;
    unsupported('execution envelope cannot be deserialized');
  }
}

export type GenerationAuthorityMatchResult =
  | { ok: true; sources: GenerationAuthoritySnapshot }
  | { ok: false; code: 'SOURCE_STALE'; safeReason: string };

export function matchGenerationAuthority(
  expected: LoadGenerationAuthorityInput,
  expectedSnapshotHash: string,
  actual: GenerationAuthoritySnapshot | null
): GenerationAuthorityMatchResult {
  if (
    !actual
    || actual.action !== expected.action
    || actual.tenantId !== expected.tenantId
    || actual.novelId !== expected.novelId
    || actual.objectId !== expected.objectId
    || hashCanonicalJson(actual) !== expectedSnapshotHash
  ) {
    return { ok: false, code: 'SOURCE_STALE', safeReason: '生成来源已变化，请刷新后重试。' };
  }
  return { ok: true, sources: actual };
}

export function createSafeResultReceipt(task: GenerationTaskRecord, input: unknown): HashedSafeResultReceipt {
  assertNoSensitiveExecutionPayload(input, 'result');
  const value = strictRecord(input, ['status', 'outcome', 'resultObjectType', 'resultObjectId', 'resultVersionIds', 'resultCount'], 'result');
  if (!task.providerAttemptId) unsupported('provider attempt is missing');
  const status = oneOf(value.status, ['waiting_confirmation', 'completed'], 'status');
  const outcome = oneOf(value.outcome, ['candidate_created', 'review_created', 'completed'], 'outcome');
  const receipt = {
    schemaVersion: 1 as const,
    taskId: task.id,
    attemptId: id(task.providerAttemptId, 'attemptId'),
    status,
    outcome,
    resultObjectType: nullableId(value.resultObjectType, 'resultObjectType'),
    resultObjectId: nullableId(value.resultObjectId, 'resultObjectId'),
    resultVersionIds: idArray(value.resultVersionIds, 'resultVersionIds', 0, 100),
    safeSummary: { schemaVersion: 1 as const, resultCount: integer(value.resultCount, 'resultCount', 0, 100) }
  };
  return { receipt, hash: hashCanonicalJson(receipt) };
}

export function verifyHashedSafeResultReceipt(input: unknown): HashedSafeResultReceipt {
  assertNoSensitiveExecutionPayload(input, 'resultReceipt');
  const value = strictRecord(input, ['receipt', 'hash'], 'resultReceipt');
  const source = strictRecord(value.receipt, [
    'schemaVersion', 'taskId', 'attemptId', 'status', 'outcome', 'resultObjectType', 'resultObjectId', 'resultVersionIds', 'safeSummary'
  ], 'resultReceipt.receipt');
  if (source.schemaVersion !== 1) unsupported('result receipt schemaVersion must be 1');
  const safeSummary = strictRecord(source.safeSummary, ['schemaVersion', 'resultCount'], 'resultReceipt.receipt.safeSummary');
  if (safeSummary.schemaVersion !== 1) unsupported('result receipt safeSummary schemaVersion must be 1');
  const receipt = {
    schemaVersion: 1 as const,
    taskId: id(source.taskId, 'resultReceipt.receipt.taskId'),
    attemptId: id(source.attemptId, 'resultReceipt.receipt.attemptId'),
    status: oneOf(source.status, ['waiting_confirmation', 'completed'], 'resultReceipt.receipt.status'),
    outcome: oneOf(source.outcome, ['candidate_created', 'review_created', 'completed'], 'resultReceipt.receipt.outcome'),
    resultObjectType: nullableId(source.resultObjectType, 'resultReceipt.receipt.resultObjectType'),
    resultObjectId: nullableId(source.resultObjectId, 'resultReceipt.receipt.resultObjectId'),
    resultVersionIds: idArray(source.resultVersionIds, 'resultReceipt.receipt.resultVersionIds', 0, 100),
    safeSummary: {
      schemaVersion: 1 as const,
      resultCount: integer(safeSummary.resultCount, 'resultReceipt.receipt.safeSummary.resultCount', 0, 100)
    }
  };
  const hash = hashCanonicalJson(receipt);
  if (value.hash !== hash) unsupported('result receipt hash mismatch');
  return { receipt, hash };
}

export function hashCanonicalJson(value: unknown): string {
  return createHash('sha256').update(canonicalExecutionJson(value)).digest('hex');
}

function strictRecord(value: unknown, keys: string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) unsupported(`${path} must be an object`);
  const source = value as Record<string, unknown>;
  const unknown = Object.keys(source).filter((key) => !keys.includes(key));
  if (unknown.length) unsupported(`unknown field ${path}.${unknown[0]}`);
  return source;
}
function id(value: unknown, path: string) { const normalized = typeof value === 'string' ? value.trim() : ''; if (normalized.length < 1 || normalized.length > 128) unsupported(`${path} must be 1-128 characters`); return normalized; }
function nullableId(value: unknown, path: string) { return value === null || value === undefined ? null : id(value, path); }
function integer(value: unknown, path: string, min: number, max: number) { if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) unsupported(`${path} must be ${min}-${max}`); return value as number; }
function oneOf<T extends string>(value: unknown, values: readonly T[], path: string): T { if (typeof value !== 'string' || !values.includes(value as T)) unsupported(`${path} is unsupported`); return value as T; }
function idArray(value: unknown, path: string, min: number, max: number) { if (!Array.isArray(value)) unsupported(`${path} must be an array`); const normalized = [...new Set(value.map((item, index) => { const result = id(item, `${path}[${index}]`); if (result.length > 32) unsupported(`${path}[${index}] must be 1-32 characters`); return result; }))].sort(); if (normalized.length < min || normalized.length > max) unsupported(`${path} must contain ${min}-${max} unique items`); return normalized; }
function isUntrustedAuditActor(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return true;
  const tokens = value.trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return tokens.some((token) => token === 'default' || token === 'legacy' || token === 'placeholder');
}
function unsupported(message: string): never { throw new WorkerPayloadUnsupportedError(message); }
