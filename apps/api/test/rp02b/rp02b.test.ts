import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { createExecutionEnvelope, createExecutionEnvelopeV1_1, normalizeExecutionEnvelope, TaskStatus, type ExecutionEnvelopeV1, type NovelProviderAction } from '@ai-shortvideo/shared';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';
import {
  createSafeResultReceipt,
  validateExecutionEnvelopeForTask
} from '../../src/modules/novels/domain/executionContract.js';
import { executeClaimedGeneration, hashCanonicalJson, NOVEL_PROVIDER_ACTIONS } from '../../src/modules/novels/services/taskClaim.js';
import type { ClaimGenerationTaskInput, GenerationTaskRecord, NovelRecord } from '../../src/modules/novels/domain/novelDomain.js';

describe('RP-02B1 recoverable execution contract', () => {
  it('normalizes all 15 strict envelopes and uses the normalized envelope identity', () => {
    for (const action of NOVEL_PROVIDER_ACTIONS) {
      const envelope = createExecutionEnvelope(envelopeInput(action));
      assert.equal(envelope.schemaVersion, 1, action);
      assert.equal(envelope.action, action, action);
      assert.deepEqual(normalizeExecutionEnvelope(JSON.parse(JSON.stringify(envelope))), envelope, action);
      assert.equal(hashCanonicalJson(envelope), hashCanonicalJson(normalizeExecutionEnvelope(envelope)), action);
    }
  });
  it('enforces bounds while de-duplicating, sorting, and trimming normalized values', () => {
    const fused = createExecutionEnvelope({
      ...envelopeInput('direction_fuse'),
      effectiveRequest: { versionIds: [' version-b ', 'version-a', 'version-a'], reason: 'x'.repeat(500) }
    });
    assert.deepEqual(fused.effectiveRequest.versionIds, ['version-a', 'version-b']);
    assert.throws(() => createExecutionEnvelope({ ...envelopeInput('direction_fuse'), effectiveRequest: { versionIds: ['only-one'] } }), /2-20/);
    assert.throws(() => createExecutionEnvelope({ ...envelopeInput('direction_optimize'), effectiveRequest: { versionId: 'v1', instruction: 'x'.repeat(2_001) } }), /1-2000/);
    assert.throws(() => createExecutionEnvelope({ ...envelopeInput('trial_chapter_one_generate'), effectiveRequest: { chapterPlanVersionId: 'plan-v1', chapterCount: 1 } }), /2-5/);
    assert.throws(() => createExecutionEnvelope({ ...envelopeInput('body_batch_generate'), effectiveRequest: { startChapter: 1, endChapter: 3, batchSize: 2, strategySnapshotId: 'strategy-1' } }), /match chapter range/);
  });
  it('rejects unknown fields, sensitive canaries, unsupported actions, and envelopes over 32 KiB', () => {
    const valid = createExecutionEnvelope(envelopeInput('direction_generate'));
    assert.throws(() => normalizeExecutionEnvelope({ ...valid, surprise: true }), /unknown field/i);
    assert.throws(() => createExecutionEnvelope({
      ...envelopeInput('direction_generate'),
      effectiveRequest: { regenerateReason: 'again', apiKey: 'sk-secret-canary' }
    }), /sensitive field/i);
    for (const sensitiveValue of [
      'Bearer token-value-12345678',
      'AKIAIOSFODNN7EXAMPLE',
      'gh' + 'p_012345678901234567890123456789012345', 'AI' + 'zaSyD12345678901234567890123456789012', 'xox' + 'b-1234567890-abcdefghijklmnop', 'eyJhbGciOiJIUzI1NiJ9' + '.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123', '-----BEGIN ' + 'PRIVATE KEY-----',
      'sk-secret-canary',
      'mysql://user:password@localhost/private',
      'DATABASE_URL=mysql://user:password@localhost/private',
      'SYSTEM PROMPT: secret-canary',
      'messages=[{role:user}]',
      'provider raw response: secret-canary',
      'reasoning: hidden-chain',
      'client IP: 203.0.113.42',
      'User-Agent: secret-canary'
    ]) {
      assert.throws(() => createExecutionEnvelope({
        ...envelopeInput('direction_generate'),
        effectiveRequest: { regenerateReason: sensitiveValue }
      }), /sensitive value/i);
    }
    assert.throws(() => normalizeExecutionEnvelope({ ...valid, action: 'unknown_action' }), /unsupported action/i);
    assert.throws(() => createExecutionEnvelope({ ...envelopeInput('novel_full_review'), policyProfileVersionId: 'policy-v2' }), /authoritative sourceVersionRefs/i);
    assert.throws(() => createExecutionEnvelope({
      ...envelopeInput('novel_full_review'),
      sourceVersionRefs: {
        ...envelopeInput('novel_full_review').sourceVersionRefs,
        chapterContentVersionIds: Array.from({ length: 100 }, (_, index) => ({
          chapterId: `chapter-${index}-${'x'.repeat(100)}`,
          chapterNo: index + 1,
          currentContentVersionId: `content-${index}-${'x'.repeat(100)}`,
          currentFeatureCardVersionId: `feature-${index}-${'x'.repeat(100)}`,
          currentReviewReportId: `review-${index}-${'x'.repeat(100)}`
        }))
      }
    }), /32 KiB/i);
  });
  it('fails safe when task columns and the persisted envelope do not match', () => {
    const envelope = createExecutionEnvelope(envelopeInput('direction_generate'));
    const task = taskForReceipt();
    Object.assign(task, {
      objectType: envelope.objectType,
      objectId: envelope.objectId,
      sourceVersionRefs: envelope.sourceVersionRefs,
      policyProfileVersionId: envelope.policyProfileVersionId,
      modelRoutingVersion: envelope.modelRoutingVersion,
      requestHash: hashCanonicalJson(envelope),
      executionEnvelopeJson: envelope
    });
    assert.deepEqual(validateExecutionEnvelopeForTask(task), envelope);
    for (const patch of [
      { taskType: 'novel_outline_generate' }, { objectType: 'outline' }, { objectId: 'other' },
      { sourceVersionRefs: { currentDirectionVersionId: 'other' } }, { policyProfileVersionId: 'other' },
      { modelRoutingVersion: 'other' }, { requestHash: 'other' }
    ]) {
      assert.throws(() => validateExecutionEnvelopeForTask({ ...task, ...patch }), (error: unknown) => (error as { code?: string }).code === 'WORKER_PAYLOAD_UNSUPPORTED');
    }
  });
  it('validates every action against its persisted task type, including both impact variants', () => {
    for (const action of NOVEL_PROVIDER_ACTIONS) {
      const envelope = createExecutionEnvelope(envelopeInput(action));
      const task = taskForReceipt();
      Object.assign(task, {
        taskType: taskTypeFor(action),
        objectType: envelope.objectType,
        objectId: envelope.objectId,
        sourceVersionRefs: envelope.sourceVersionRefs,
        policyProfileVersionId: envelope.policyProfileVersionId,
        modelRoutingVersion: envelope.modelRoutingVersion,
        requestHash: hashCanonicalJson(envelope),
        executionEnvelopeJson: envelope
      });
      assert.equal(validateExecutionEnvelopeForTask(task).action, action);
    }
  });
  it('rejects identifiers and bounded text that normalize to empty strings', () => {
    assert.throws(() => createExecutionEnvelope({ ...envelopeInput('direction_generate'), objectId: '   ' }), /1-128 characters/);
    assert.throws(() => createExecutionEnvelope({
      ...envelopeInput('direction_optimize'),
      effectiveRequest: { versionId: 'version-a', instruction: '   ' }
    }), /1-2000 characters/);
  });
  it('creates one canonical safe receipt and rejects duplicate finalize', async () => {
    const task = taskForReceipt();
    assert.throws(() => createSafeResultReceipt(task, { status: TaskStatus.Completed, outcome: 'completed', resultObjectType: null, resultObjectId: null, resultVersionIds: ['x'.repeat(33)], resultCount: 1 }), /1-32 characters/);
    const first = createSafeResultReceipt(task, {
      status: TaskStatus.WaitingConfirmation,
      outcome: 'candidate_created',
      resultObjectType: 'direction',
      resultObjectId: 'direction-1',
      resultVersionIds: ['version-b', 'version-a', 'version-a'],
      resultCount: 2
    });
    const second = createSafeResultReceipt(task, {
      status: TaskStatus.WaitingConfirmation,
      outcome: 'candidate_created',
      resultObjectType: 'direction',
      resultObjectId: 'direction-1',
      resultVersionIds: ['version-a', 'version-b'],
      resultCount: 2
    });
    assert.equal(first.hash, second.hash);
    assert.deepEqual(first.receipt.resultVersionIds, ['version-a', 'version-b']);
    assert.doesNotMatch(JSON.stringify(first.receipt), /prompt|response|reasoning|secret/i);
    assert.throws(() => createSafeResultReceipt(task, {
      status: TaskStatus.Completed,
      outcome: 'completed',
      resultObjectType: null,
      resultObjectId: null,
      resultVersionIds: [],
      resultCount: 0,
      providerRawResponse: 'secret'
    } as never), /(?:sensitive field|unknown field)/i);
    assert.throws(() => createSafeResultReceipt(task, {
      status: TaskStatus.Completed,
      outcome: 'completed',
      resultObjectType: 'direction',
      resultObjectId: 'sk-secret-canary',
      resultVersionIds: [],
      resultCount: 0
    }), /sensitive value/i);
    const repository = createInMemoryNovelRepository();
    const queued = await seedQueuedTask(repository, 'unique-receipt');
    const leased = (await repository.leaseNextQueuedTask('worker-a', 'token-a', at(0), at(60)))!;
    const receipt = createSafeResultReceipt(leased, {
      status: TaskStatus.Completed, outcome: 'completed', resultObjectType: 'direction', resultObjectId: 'direction-1', resultVersionIds: ['version-1'], resultCount: 1
    });
    assert.equal((await repository.finalizeLeasedTask(queued.tenantId, queued.id, 'worker-a', 'token-a', at(9), {
      ...receipt,
      hash: '0'.repeat(64)
    })).outcome, 'fenced');
    const prismaRepository = Object.create(PrismaNovelRepository.prototype) as PrismaNovelRepository & { prisma: { $transaction: () => never } };
    let prismaTransactions = 0;
    Object.defineProperty(prismaRepository, 'prisma', { value: { $transaction: () => { prismaTransactions += 1; throw new Error('must not enter transaction'); } } });
    assert.equal((await prismaRepository.finalizeLeasedTask(queued.tenantId, queued.id, 'worker-a', 'token-a', at(9), { ...receipt, hash: '0'.repeat(64) })).outcome, 'fenced');
    assert.equal(prismaTransactions, 0);
    assert.equal((await repository.findTaskById(queued.tenantId, queued.id))?.resultReceiptHash, null);
    assert.equal((await repository.finalizeLeasedTask(queued.tenantId, queued.id, 'worker-a', 'token-a', at(10), receipt)).outcome, 'applied');
    assert.equal((await repository.finalizeLeasedTask(queued.tenantId, queued.id, 'worker-a', 'token-a', at(11), receipt)).outcome, 'fenced');
  });
  it('rejects missing authoritative source refs before task claim or provider call', async () => {
    const repository = createInMemoryNovelRepository();
    let providerCalls = 0;
    let finalizeCalls = 0;
    for (const action of NOVEL_PROVIDER_ACTIONS.filter((value) => value !== 'direction_generate')) {
    await assert.rejects(() => executeClaimedGeneration({
      action,
      repository,
      novel: {
        id: 'novel-missing-source',
        tenantId: 'tenant-rp02b',
        policyProfileVersionId: 'policy-v1',
        currentDirectionVersionId: null,
        currentSettingVersionId: null,
        currentOutlineVersionId: null,
        currentStageOutlineVersionId: null,
        currentChapterPlanVersionId: null
      } as NovelRecord,
      objectId: action.startsWith('chapter_') ? 'chapter-1' : undefined,
      idempotencyKey: `missing-source-${action}`,
      effectiveRequest: envelopeInput(action).effectiveRequest,
      sourceVersionRefs: {},
      context: { tenantId: 'tenant-rp02b', userId: 'user-1', requestId: 'request-missing-source' },
      now: () => at(0),
      provider: async () => {
        providerCalls += 1;
        return { unsafe: true };
      },
      finalize: async () => {
        finalizeCalls += 1;
        return { unsafe: true };
      }
    }), (error: unknown) => {
      const failure = error as { code?: string; details?: { code?: string } };
      return failure.code === 'VERSION_CONFLICT' && failure.details?.code === 'SOURCE_STALE';
    }); }
    assert.equal(repository.getGenerationTasks().length, 0);
    assert.equal(providerCalls, 0);
    assert.equal(finalizeCalls, 0);
  });
  it('keeps idempotency conflict authoritative when provider configuration is unavailable', async () => {
    const repository = createInMemoryNovelRepository();
    const queued = await seedQueuedTask(repository, 'idempotency-priority');
    let capabilityChecks = 0;
    await assert.rejects(() => executeClaimedGeneration({
      action: 'direction_generate', repository, novel: { id: queued.novelId, tenantId: 'tenant-rp02b', policyProfileVersionId: 'policy-v1', currentDirectionVersionId: null } as NovelRecord,
      idempotencyKey: 'token-idempotency-priority', effectiveRequest: { regenerateReason: 'different' }, sourceVersionRefs: { currentDirectionVersionId: null },
      context: { tenantId: 'tenant-rp02b', userId: 'user-1', requestId: 'request-idempotency-priority' }, now: () => at(0),
      providerCapability: { assertAvailable: () => { capabilityChecks += 1; throw new Error('unavailable'); } }, provider: async () => null, finalize: async () => null
    }), (error: unknown) => (error as { code?: string }).code === 'IDEMPOTENCY_CONFLICT');
    assert.equal(capabilityChecks, 0);
  });
  it('uses authoritativeNow for lease acquisition and heartbeat boundaries', async () => {
    const repository = createInMemoryNovelRepository();
    const queued = await seedQueuedTask(repository, 'authoritative-now');
    assert.equal(await repository.leaseNextQueuedTask('worker-a', 'token-a', at(10), at(10)), null);
    const leased = await repository.leaseNextQueuedTask('worker-a', 'token-a', at(10), at(60));
    assert.equal(leased?.id, queued.id);
    assert.equal(leased?.providerAttemptPhase, 'leased');
    assert.equal(await repository.heartbeatTask(queued.tenantId, queued.id, 'worker-a', 'token-a', at(59), at(90)), true);
    assert.equal(await repository.heartbeatTask(queued.tenantId, queued.id, 'worker-a', 'token-a', at(90), at(120)), false);
  });
  it('gives an expired owner zero heartbeat, finalize, failure, and result writes', async () => {
    const repository = createInMemoryNovelRepository();
    const queued = await seedQueuedTask(repository, 'expired-owner');
    const leased = (await repository.leaseNextQueuedTask('worker-a', 'token-a', at(0), at(30)))!;
    const receipt = createSafeResultReceipt(leased, {
      status: TaskStatus.Completed, outcome: 'completed', resultObjectType: 'direction', resultObjectId: 'direction-1', resultVersionIds: ['version-1'], resultCount: 1
    });
    assert.equal(await repository.heartbeatTask(queued.tenantId, queued.id, 'worker-a', 'token-a', at(30), at(60)), false);
    assert.equal((await repository.finalizeLeasedTask(queued.tenantId, queued.id, 'worker-a', 'token-a', at(30), receipt)).outcome, 'fenced');
    assert.equal((await repository.failLeasedTask(queued.tenantId, queued.id, 'worker-a', 'token-a', at(30), { failureCategory: 'provider_error', errorCode: 'LATE', errorMessage: 'late', statusNote: 'late' })).outcome, 'fenced');
    const unchanged = (await repository.findTaskById(queued.tenantId, queued.id))!;
    assert.equal(unchanged.resultReceiptHash, null);
    assert.deepEqual(unchanged.resultVersionIds, []);
  });
  it('uses observed lease CAS so renewal wins recovery and expired owners cannot revive', async () => {
    const repository = createInMemoryNovelRepository();
    const queued = await seedQueuedTask(repository, 'recovery-cas');
    const leased = (await repository.leaseNextQueuedTask('worker-a', 'token-a', at(0), at(30)))!;
    const observed = {
      tenantId: leased.tenantId,
      taskId: leased.id,
      leaseOwnerId: leased.leaseOwnerId!,
      leaseToken: leased.leaseToken!,
      leaseExpiresAt: leased.leaseExpiresAt!
    };
    assert.equal(await repository.heartbeatTask(leased.tenantId, leased.id, 'worker-a', 'token-a', at(20), at(80)), true);
    assert.equal((await repository.recoverExpiredTask(observed, at(40))).outcome, 'not_recovered');
    assert.equal(await repository.heartbeatTask(leased.tenantId, leased.id, 'worker-a', 'token-a', at(81), at(120)), false);

    const latest = (await repository.findTaskById(leased.tenantId, leased.id))!;
    const renewedObservation = {
      tenantId: latest.tenantId,
      taskId: latest.id,
      leaseOwnerId: latest.leaseOwnerId!,
      leaseToken: latest.leaseToken!,
      leaseExpiresAt: latest.leaseExpiresAt!
    };
    const recovered = await repository.recoverExpiredTask(renewedObservation, at(81));
    assert.equal(recovered.outcome, 'recovered');
    assert.equal(recovered.task.errorCode, 'WORKER_LEASE_EXPIRED');
    assert.equal(recovered.task.activeClaimKey, null);
  });
  it('keeps legacy behavior safe and pins the retryable Prisma static contract', async () => {
    const repository = createInMemoryNovelRepository();
    const legacyActive = await seedQueuedTask(repository, 'legacy-active');
    legacyActive.executionEnvelopeJson = null;
    const terminal = await seedQueuedTask(repository, 'legacy-terminal');
    terminal.executionEnvelopeJson = null;
    terminal.status = TaskStatus.Completed;
    terminal.finishedAt = at(1);

    assert.equal(await repository.leaseNextQueuedTask('worker-a', 'token-a', at(2), at(30)), null);
    assert.equal(legacyActive.status, TaskStatus.Failed);
    assert.equal(legacyActive.errorCode, 'WORKER_PAYLOAD_UNSUPPORTED');
    assert.equal(repository.getGenerationTaskEvents().filter((event) => event.taskId === legacyActive.id && event.eventType === 'task_failed').length, 0);
    assert.equal(terminal.status, TaskStatus.Completed);
    assert.equal(terminal.errorCode, null);
    const [schema, migration, prismaRepository] = await Promise.all([
      readFile('prisma/schema.prisma', 'utf8'),
      readFile('prisma/migrations/20260713120000_rp02b1_recoverable_execution_contract/migration.sql', 'utf8'),
      readFile('src/modules/novels/repositories/prismaNovelRepository.ts', 'utf8')
    ]);
    assert.match(schema, /executionEnvelopeJson\s+Json\?/);
    assert.match(schema, /resultVersionIdsJson\s+Json\?/);
    assert.match(schema, /@@unique\(\[tenantId, providerAttemptId\]\)/);
    assert.match(migration, /information_schema.*COLUMNS/is);
    assert.match(migration, /root_task_id.*duration_deadline_at/is);
    assert.match(migration, /result_version_ids_json/);
    assert.match(prismaRepository, /resultVersionIdsJson:\s*verified\.receipt\.resultVersionIds/);
    assert.match(prismaRepository, /leaseExpiresAt:\s*\{ gt: authoritativeNow \}/);
    assert.match(prismaRepository, /leaseExpiresAt:\s*\{ equals: observed\.leaseExpiresAt, lte: authoritativeNow \}/);
  });
});
function envelopeInput(action: NovelProviderAction) {
  const common = {
    action,
    objectType: objectTypeFor(action),
    objectId: action.startsWith('chapter_') ? 'chapter-1' : 'novel-1',
    policyProfileVersionId: 'policy-v1',
    modelRoutingVersion: 'route-v1'
  };
  const structureRefs = {
    currentDirectionVersionId: 'direction-v1',
    currentSettingVersionId: 'setting-v1',
    currentOutlineVersionId: 'outline-v1',
    currentStageOutlineVersionId: 'stage-v1'
  };
  const bodyRefs = {
    ...structureRefs,
    currentChapterPlanVersionId: 'plan-v1',
    trialRunId: 'trial-1',
    selectedChapterOneCandidateId: 'candidate-1',
    strategySnapshotId: 'strategy-1',
    strategySnapshotVersion: 1,
    creationStage: 'body'
  };
  const variants: Record<NovelProviderAction, { effectiveRequest: unknown; sourceVersionRefs: unknown }> = {
    direction_generate: { effectiveRequest: { regenerateReason: 'again' }, sourceVersionRefs: { currentDirectionVersionId: null } },
    direction_fuse: { effectiveRequest: { versionIds: ['version-b', 'version-a'], reason: 'fuse' }, sourceVersionRefs: { sourceVersionIds: ['version-a', 'version-b'] } },
    direction_optimize: { effectiveRequest: { versionId: 'version-a', instruction: 'improve' }, sourceVersionRefs: { sourceVersionIds: ['version-a'] } },
    setting_generate: { effectiveRequest: { currentDirectionVersionId: 'direction-v1' }, sourceVersionRefs: { ...structureRefs, objectType: 'setting' } },
    outline_generate: { effectiveRequest: { currentDirectionVersionId: 'direction-v1', currentSettingVersionId: 'setting-v1' }, sourceVersionRefs: { ...structureRefs, objectType: 'outline' } },
    stage_outline_generate: { effectiveRequest: { currentOutlineVersionId: 'outline-v1' }, sourceVersionRefs: { ...structureRefs, objectType: 'stage_outline' } },
    chapter_plan_generate: { effectiveRequest: { currentOutlineVersionId: 'outline-v1', currentStageOutlineVersionId: 'stage-v1' }, sourceVersionRefs: { ...structureRefs, objectType: 'chapter_plan' } },
    trial_chapter_one_generate: { effectiveRequest: { chapterPlanVersionId: 'plan-v1', chapterCount: 3 }, sourceVersionRefs: { ...structureRefs, currentChapterPlanVersionId: 'plan-v1', objectType: 'trial_run' } },
    trial_followup_generate: { effectiveRequest: { selectedCandidateVersionId: 'candidate-1', chapterPlanVersionId: 'plan-v1' }, sourceVersionRefs: { ...structureRefs, currentChapterPlanVersionId: 'plan-v1', objectType: 'trial_run', selectedChapterOneCandidateId: 'candidate-1' } },
    body_batch_generate: { effectiveRequest: { startChapter: 1, endChapter: 10, batchSize: 10, strategySnapshotId: 'strategy-1' }, sourceVersionRefs: bodyRefs },
    chapter_body_generate: { effectiveRequest: { chapterId: 'chapter-1', strategySnapshotId: 'strategy-1', enhancedReview: true }, sourceVersionRefs: bodyRefs },
    chapter_rewrite: { effectiveRequest: { chapterId: 'chapter-1', currentContentVersionId: 'content-v1', instruction: 'rewrite' }, sourceVersionRefs: { currentContentVersionId: 'content-v1' } },
    chapter_impact_assess: { effectiveRequest: { chapterId: 'chapter-1', currentContentVersionId: 'content-v1', instruction: 'assess' }, sourceVersionRefs: { currentContentVersionId: 'content-v1' } },
    chapter_adopt_impact_assess: { effectiveRequest: { chapterId: 'chapter-1', candidateVersionId: 'candidate-1', currentContentVersionId: 'content-v1', reason: 'adopt' }, sourceVersionRefs: { currentContentVersionId: 'content-v1', candidateVersionId: 'candidate-1' } },
    novel_full_review: {
      effectiveRequest: { policyProfileVersionId: 'policy-v1' },
      sourceVersionRefs: {
        ...structureRefs,
        currentChapterPlanVersionId: 'plan-v1',
        chapterContentVersionIds: [{
          chapterId: 'chapter-1', chapterNo: 1, currentContentVersionId: 'content-v1',
          currentFeatureCardVersionId: 'feature-v1', currentReviewReportId: 'review-v1'
        }]
      }
    }
  };
  return { ...common, ...variants[action] };
}
function objectTypeFor(action: NovelProviderAction) {
  if (action === 'direction_generate' || action === 'direction_fuse' || action === 'direction_optimize') return 'direction';
  if (action === 'setting_generate') return 'setting';
  if (action === 'outline_generate') return 'outline';
  if (action === 'stage_outline_generate') return 'stage_outline';
  if (action === 'chapter_plan_generate') return 'chapter_plan';
  if (action === 'trial_chapter_one_generate' || action === 'trial_followup_generate') return 'trial_run';
  if (action.startsWith('chapter_')) return 'chapter';
  return 'novel';
}
function taskTypeFor(action: NovelProviderAction) {
  const taskTypes: Record<NovelProviderAction, string> = {
    direction_generate: 'novel_direction_generate',
    direction_fuse: 'novel_direction_fuse',
    direction_optimize: 'novel_direction_optimize',
    setting_generate: 'novel_setting_generate',
    outline_generate: 'novel_outline_generate',
    stage_outline_generate: 'stage_outline_generate',
    chapter_plan_generate: 'chapter_plan_generate',
    trial_chapter_one_generate: 'trial_writing_generate',
    trial_followup_generate: 'trial_followup_generate',
    body_batch_generate: 'body_batch_generate',
    chapter_body_generate: 'chapter_body_generate',
    chapter_rewrite: 'chapter_body_rewrite',
    chapter_impact_assess: 'chapter_impact_assess',
    chapter_adopt_impact_assess: 'chapter_impact_assess',
    novel_full_review: 'novel_full_review'
  };
  return taskTypes[action];
}

async function seedQueuedTask(repository: ReturnType<typeof createInMemoryNovelRepository>, suffix: string) {
  const context = { tenantId: 'tenant-rp02b', userId: 'user-1', requestId: `request-${suffix}` };
  const created = await repository.createDraft({ request: { title: `RP-02B1 ${suffix}` }, context, now: at(0) });
  const legacyEnvelope = createExecutionEnvelope({ ...envelopeInput('direction_generate'), objectId: created.novel.id });
  const authorityInput = {
    action: 'direction_generate' as const, tenantId: context.tenantId, novelId: created.novel.id,
    objectId: created.novel.id, sourceVersionRefs: legacyEnvelope.sourceVersionRefs, normalizedRequest: legacyEnvelope.effectiveRequest
  };
  const authority = await repository.loadGenerationAuthority(authorityInput);
  assert.ok(authority);
  const authoritySnapshotHash = hashCanonicalJson(authority);
  const authorityFacts = authority.facts as {
    novel: Record<string, unknown>;
    preferences: Record<string, unknown> | null;
  };
  const novelSnapshotHash = hashCanonicalJson(authorityFacts.novel);
  const preferencesSnapshot = authorityFacts.preferences ?? { appealPoints: [], targetAudience: null, stageCount: null };
  const preferencesSnapshotHash = hashCanonicalJson(preferencesSnapshot);
  const envelope = createExecutionEnvelopeV1_1({
    tenantId: context.tenantId,
    novelId: created.novel.id,
    auditContext: { requestedByUserId: context.userId, requestedAt: at(0).toISOString() },
    action: 'direction_generate',
    objectType: 'direction',
    objectId: created.novel.id,
    normalizedRequest: legacyEnvelope.effectiveRequest,
    sourceVersionRefs: {
      ...legacyEnvelope.sourceVersionRefs,
      sourceIdentitySchemaVersion: 1,
      sourceIdentities: [
        { sourceType: 'novel', sourceId: created.novel.id, revision: novelSnapshotHash, snapshotHash: novelSnapshotHash },
        { sourceType: 'preferences', sourceId: created.novel.id, revision: preferencesSnapshotHash, snapshotHash: preferencesSnapshotHash }
      ],
      novelProviderInputSnapshotHash: novelSnapshotHash,
      preferencesSnapshotHash,
      authoritySnapshotHash,
      providerInputSnapshotHash: '3'.repeat(64)
    },
    policyProfileVersionId: legacyEnvelope.policyProfileVersionId,
    modelRoutingVersion: legacyEnvelope.modelRoutingVersion
  });
  const input: ClaimGenerationTaskInput = {
    tenantId: context.tenantId, novelId: created.novel.id, taskType: 'novel_direction_generate', objectType: 'direction', objectId: created.novel.id,
    conflictScope: 'novel_direction', conflictKey: suffix, activeClaimKey: `claim-${suffix}`, idempotencyToken: `token-${suffix}`,
    requestHash: hashCanonicalJson(envelope), sourceVersionRefs: envelope.sourceVersionRefs, executionEnvelopeJson: envelope,
    policyProfileVersionId: envelope.policyProfileVersionId, modelRoutingVersion: envelope.modelRoutingVersion,
    inputSummary: 'test', authorityInput: { ...authorityInput, sourceVersionRefs: envelope.sourceVersionRefs }, expectedAuthoritySnapshotHash: authoritySnapshotHash, context, now: at(0)
  };
  const claim = await repository.claimGenerationTask(input);
  assert.equal(claim.outcome, 'created');
  claim.task.status = TaskStatus.Queued;
  claim.task.startedAt = null;
  return claim.task;
}
function taskForReceipt(): GenerationTaskRecord {
  return {
    id: 'task-1', tenantId: 'tenant-1', novelId: 'novel-1', taskType: 'novel_direction_generate', objectType: 'direction', objectId: 'novel-1',
    status: TaskStatus.Processing, statusNote: null, progress: 0, currentStep: null, triggerSource: 'worker', sourceVersionRefs: {},
    conflictScope: 'novel_direction', conflictKey: 'novel-1', idempotencyToken: 'token-1234', requestHash: 'hash', activeClaimKey: 'claim',
    inputSummary: null, outputSummary: null, resultVersionIds: [], retryOfTaskId: null, failureCategory: null, errorCode: null, errorMessage: null,
    resultObjectType: null, resultObjectId: null, userAcceptedResult: false, cancelRequestedAt: null, cancelReason: null, startedAt: at(0), finishedAt: null,
    createdBy: 'user-1', createdAt: at(0), updatedAt: at(0), metadata: {}, leaseOwnerId: 'worker-a', leaseToken: 'token-a', leaseExpiresAt: at(60),
    lastHeartbeatAt: at(0), retryCount: 0, maxRetries: 2, executionEnvelopeJson: createExecutionEnvelope(envelopeInput('direction_generate')),
    providerAttemptId: 'attempt-1', providerAttemptPhase: 'provider_result_validated', providerDispatchedAt: at(1), resultReceiptHash: null,
    rootTaskId: 'task-1', providerCallBudgetMax: 1, providerCallBudgetUsed: 1, durationDeadlineAt: at(600), costBudgetMicrosMax: 1_000_000n,
    costBudgetMicrosUsed: 0n
  };
}
function at(seconds: number) {
  return new Date(Date.UTC(2026, 6, 13, 0, 0, seconds));
}
