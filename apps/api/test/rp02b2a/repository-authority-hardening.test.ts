import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TaskStatus,
  createExecutionEnvelope,
  createExecutionEnvelopeV1_1,
  type ExecutionEnvelopeV1_1
} from '@ai-shortvideo/shared';
import { hashCanonicalJson } from '../../src/modules/novels/domain/executionContract.js';
import type { BodyBatchRecord, ClaimGenerationTaskInput, GenerationTaskRecord } from '../../src/modules/novels/domain/novelDomain.js';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';
import { PrismaNovelRepository } from '../../src/modules/novels/repositories/prismaNovelRepository.js';

describe('RP-02B2a2 A2 repository authority hardening', () => {
  it('keeps after_claim stale at absolute zero side effects and preserves the next internal ID', async () => {
    const repository = createInMemoryNovelRepository();
    const context = { tenantId: 'tenant_authority', userId: 'user_authority', requestId: 'request-stale' };
    const created = await repository.createDraft({ request: { title: 'authority sequence' }, context, now: at(0) });
    const staleInput = await claimInput(repository, created.novel.id, context, 'stale');
    staleInput.afterClaimBarrier = () => { created.novel.title = 'authority sequence changed'; };

    assert.deepEqual(await repository.claimGenerationTask(staleInput), { outcome: 'source_stale', task: null });
    assert.equal(repository.getGenerationTasks().length, 0);
    assert.equal(repository.getGenerationTaskEvents().length, 0);

    const next = await repository.claimGenerationTask(await claimInput(repository, created.novel.id, context, 'next'));
    assert.equal(next.outcome, 'created');
    assert.equal(next.task.id, 'task_000004');
    assert.equal(repository.getGenerationTaskEvents()[0]?.id, 'event_000005');
  });

  it('leases a valid V1.1 task and recovers only the same authoritative envelope and actor', async () => {
    const repository = createInMemoryNovelRepository();
    const queued = await seedQueuedTask(repository, 'normal');
    const beforeLeaseEvents = repository.getGenerationTaskEvents().length;
    const leased = await repository.leaseNextQueuedTask('worker-a', 'lease-a', at(1), at(30));
    assert.equal(leased?.id, queued.id);
    assert.ok(leased?.providerAttemptId);
    assert.equal(repository.getGenerationTaskEvents().length, beforeLeaseEvents + 1);

    const recovered = await repository.recoverExpiredTask({
      tenantId: leased!.tenantId,
      taskId: leased!.id,
      leaseOwnerId: leased!.leaseOwnerId!,
      leaseToken: leased!.leaseToken!,
      leaseExpiresAt: leased!.leaseExpiresAt!
    }, at(30));
    assert.equal(recovered.outcome, 'recovered');
    assert.equal(recovered.task.errorCode, 'WORKER_LEASE_EXPIRED');
    assert.equal(repository.getGenerationTaskEvents().at(-1)?.eventType, 'task_recovered');
  });

  it('rejects legacy, malformed, wrong-tenant, and placeholder actors before attempt, event, or lease claim', async () => {
    const mutations: Array<[string, (task: GenerationTaskRecord) => void]> = [
      ['legacy-v1', (task) => {
        task.executionEnvelopeJson = createExecutionEnvelope({
          action: 'direction_generate', objectType: 'direction', objectId: task.objectId!, effectiveRequest: {},
          sourceVersionRefs: { currentDirectionVersionId: null }, policyProfileVersionId: task.policyProfileVersionId ?? null,
          modelRoutingVersion: task.modelRoutingVersion!
        });
        task.requestHash = hashCanonicalJson(task.executionEnvelopeJson);
      }],
      ['malformed', (task) => { task.executionEnvelopeJson = { schemaVersion: '1.1' } as never; task.requestHash = hashCanonicalJson(task.executionEnvelopeJson); }],
      ['wrong-tenant', (task) => mutateEnvelope(task, { tenantId: 'tenant_other' })],
      ['default-actor', (task) => mutateActor(task, 'user_default')],
      ['legacy-actor', (task) => mutateActor(task, 'legacy_worker')],
      ['placeholder-actor', (task) => mutateActor(task, 'placeholder_actor')]
    ];
    for (const [label, mutate] of mutations) {
      const repository = createInMemoryNovelRepository();
      const queued = await seedQueuedTask(repository, label);
      mutate(queued);
      const beforeEvents = repository.getGenerationTaskEvents().length;
      const beforeTasks = repository.getGenerationTasks().length;
      assert.equal(await repository.leaseNextQueuedTask('worker-a', `lease-${label}`, at(1), at(30)), null, label);
      assert.equal(repository.getGenerationTasks().length, beforeTasks, `${label}:claim`);
      assert.equal(repository.getGenerationTaskEvents().length, beforeEvents, `${label}:event`);
      assert.equal(queued.providerAttemptId, null, `${label}:attempt`);
      assert.equal(queued.leaseOwnerId, null, `${label}:lease owner`);
      assert.equal(queued.status, TaskStatus.Failed, `${label}:safe terminal state`);
    }
  });

  it('gives malformed recovery zero mutation and zero recovery event', async () => {
    const repository = createInMemoryNovelRepository();
    const queued = await seedQueuedTask(repository, 'recovery-invalid');
    const leased = (await repository.leaseNextQueuedTask('worker-a', 'lease-a', at(1), at(30)))!;
    const observed = {
      tenantId: leased.tenantId,
      taskId: leased.id,
      leaseOwnerId: leased.leaseOwnerId!,
      leaseToken: leased.leaseToken!,
      leaseExpiresAt: leased.leaseExpiresAt!
    };
    mutateActor(leased, 'legacy_recovery');
    const before = structuredClone(leased);
    const beforeEvents = repository.getGenerationTaskEvents().length;
    assert.deepEqual(await repository.recoverExpiredTask(observed, at(30)), { outcome: 'not_recovered', task: null });
    assert.deepEqual(leased, before);
    assert.equal(repository.getGenerationTaskEvents().length, beforeEvents);
  });

  it('keeps Prisma legacy lease and recovery fail-closed before attempt or event creation', async () => {
    const source = createInMemoryNovelRepository();
    const legacy = await seedQueuedTask(source, 'prisma-legacy');
    legacy.executionEnvelopeJson = createExecutionEnvelope({
      action: 'direction_generate', objectType: 'direction', objectId: legacy.objectId!, effectiveRequest: {},
      sourceVersionRefs: { currentDirectionVersionId: null }, policyProfileVersionId: legacy.policyProfileVersionId ?? null,
      modelRoutingVersion: legacy.modelRoutingVersion!
    });
    legacy.requestHash = hashCanonicalJson(legacy.executionEnvelopeJson);
    const legacyRow = toPrismaTask(legacy);
    let failedTransitions = 0;
    let events = 0;
    const leaseRepository = prismaRepositoryWithTransaction({
      generationTask: {
        findFirst: async () => legacyRow.status === 'QUEUED' ? legacyRow : null,
        updateMany: async () => { failedTransitions += 1; legacyRow.status = 'FAILED'; return { count: 1 }; }
      },
      generationTaskEvent: { create: async () => { events += 1; throw new Error('legacy lease must not create event'); } }
    });
    assert.equal(await leaseRepository.leaseNextQueuedTask('worker-a', 'lease-a', at(1), at(30)), null);
    assert.equal(failedTransitions, 1);
    assert.equal(events, 0);
    assert.equal(legacyRow.providerAttemptId, null);
    assert.equal(legacyRow.leaseOwnerId, null);

    const recoverable = await seedQueuedTask(source, 'prisma-recovery');
    const validEnvelope = recoverable.executionEnvelopeJson as ExecutionEnvelopeV1_1;
    Object.assign(recoverable, {
      status: TaskStatus.Processing,
      leaseOwnerId: 'worker-a',
      leaseToken: 'lease-recovery',
      leaseExpiresAt: at(30),
      providerAttemptId: 'attempt-existing',
      providerAttemptPhase: 'leased',
      createdBy: 'placeholder_recovery',
      executionEnvelopeJson: {
        ...validEnvelope,
        auditContext: { ...validEnvelope.auditContext, requestedByUserId: 'placeholder_recovery' }
      }
    });
    recoverable.requestHash = hashCanonicalJson(recoverable.executionEnvelopeJson);
    const recoveryRow = toPrismaTask(recoverable);
    const recoveryRepository = prismaRepositoryWithTransaction({
      generationTask: {
        findFirst: async () => recoveryRow,
        updateMany: async () => { throw new Error('invalid recovery must not mutate'); }
      },
      generationTaskEvent: { create: async () => { throw new Error('invalid recovery must not create event'); } }
    });
    assert.deepEqual(await recoveryRepository.recoverExpiredTask({
      tenantId: recoverable.tenantId,
      taskId: recoverable.id,
      leaseOwnerId: 'worker-a',
      leaseToken: 'lease-recovery',
      leaseExpiresAt: at(30)
    }, at(30)), { outcome: 'not_recovered', task: null });
    assert.equal(recoveryRow.providerAttemptId, 'attempt-existing');
    assert.equal(recoveryRow.status, 'PROCESSING');
  });

  it('queries Prisma generation-task metadata directly and returns the latest authoritative body batch', async () => {
    const older = storedBodyBatch('batch-old', '2026-07-18T00:00:01.000Z');
    const latest = storedBodyBatch('batch-latest', '2026-07-18T00:00:02.000Z');
    const queries: unknown[] = [];
    const repository = Object.create(PrismaNovelRepository.prototype) as PrismaNovelRepository & { prisma: unknown };
    Object.defineProperty(repository, 'prisma', { value: {
      generationTask: {
        findMany: async (query: unknown) => { queries.push(query); return [{ metadata: { batch: older } }, { metadata: { batch: latest } }]; }
      }
    } });

    const result = await repository.findLatestBodyBatch('tenant_batch', 'novel_batch');
    const inMemory = createInMemoryNovelRepository();
    inMemory.getBodyBatches().push(toInMemoryBatch(older), toInMemoryBatch(latest));
    const inMemoryResult = await inMemory.findLatestBodyBatch('tenant_batch', 'novel_batch');
    assert.equal(result?.id, 'batch-latest');
    assert.equal(result?.createdAt.toISOString(), latest.createdAt);
    assert.equal(result?.summary.createdAt.toISOString(), latest.summary.createdAt);
    assert.deepEqual(result, inMemoryResult);
    assert.deepEqual(queries, [{
      where: { tenantId: 'tenant_batch', novelId: 'novel_batch', taskType: 'body_batch_generate', resultObjectType: 'body_batch' },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: { metadata: true }
    }]);
  });
});

async function seedQueuedTask(repository: ReturnType<typeof createInMemoryNovelRepository>, suffix: string) {
  const context = { tenantId: 'tenant_worker', userId: 'user_worker', requestId: `request-${suffix}` };
  const created = await repository.createDraft({ request: { title: `worker ${suffix}` }, context, now: at(0) });
  const claim = await repository.claimGenerationTask(await claimInput(repository, created.novel.id, context, suffix));
  assert.equal(claim.outcome, 'created');
  claim.task.status = TaskStatus.Queued;
  claim.task.startedAt = null;
  return claim.task;
}

async function claimInput(
  repository: ReturnType<typeof createInMemoryNovelRepository>,
  novelId: string,
  context: { tenantId: string; userId: string; requestId: string },
  suffix: string
): Promise<ClaimGenerationTaskInput> {
  const authorityInput = {
    action: 'direction_generate' as const,
    tenantId: context.tenantId,
    novelId,
    objectId: novelId,
    sourceVersionRefs: { currentDirectionVersionId: null },
    normalizedRequest: {}
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
    novelId,
    auditContext: { requestedByUserId: context.userId, requestedAt: at(0).toISOString() },
    action: 'direction_generate',
    objectType: 'direction',
    objectId: novelId,
    normalizedRequest: {},
    sourceVersionRefs: {
      currentDirectionVersionId: null,
      sourceIdentitySchemaVersion: 1,
      sourceIdentities: [
        { sourceType: 'novel', sourceId: novelId, revision: novelSnapshotHash, snapshotHash: novelSnapshotHash },
        { sourceType: 'preferences', sourceId: novelId, revision: preferencesSnapshotHash, snapshotHash: preferencesSnapshotHash }
      ],
      novelProviderInputSnapshotHash: novelSnapshotHash,
      preferencesSnapshotHash,
      authoritySnapshotHash,
      providerInputSnapshotHash: '3'.repeat(64)
    },
    policyProfileVersionId: 'policy_default_v1',
    modelRoutingVersion: 'provider:test:v1'
  });
  return {
    tenantId: context.tenantId,
    novelId,
    taskType: 'novel_direction_generate',
    objectType: 'direction',
    objectId: novelId,
    conflictScope: 'novel_direction',
    conflictKey: suffix,
    activeClaimKey: `active-${suffix}`,
    idempotencyToken: `token-${suffix}`,
    requestHash: hashCanonicalJson(envelope),
    sourceVersionRefs: envelope.sourceVersionRefs,
    executionEnvelopeJson: envelope,
    policyProfileVersionId: envelope.policyProfileVersionId,
    modelRoutingVersion: envelope.modelRoutingVersion,
    inputSummary: 'repository hardening test',
    authorityInput: { ...authorityInput, sourceVersionRefs: envelope.sourceVersionRefs },
    expectedAuthoritySnapshotHash: authoritySnapshotHash,
    context,
    now: at(0)
  };
}

function mutateActor(task: GenerationTaskRecord, actor: string) {
  task.createdBy = actor;
  mutateEnvelope(task, { auditContext: { ...(task.executionEnvelopeJson as ExecutionEnvelopeV1_1).auditContext, requestedByUserId: actor } });
}

function mutateEnvelope(task: GenerationTaskRecord, patch: Partial<ExecutionEnvelopeV1_1>) {
  task.executionEnvelopeJson = { ...(task.executionEnvelopeJson as ExecutionEnvelopeV1_1), ...patch };
  task.requestHash = hashCanonicalJson(task.executionEnvelopeJson);
}

function storedBodyBatch(id: string, createdAt: string) {
  const chapterResults = [{
    chapterId: 'chapter-1', chapterNo: 1, title: 'Chapter 1', status: 'completed', statusText: 'Completed',
    contentVersionId: 'content-1', featureCardId: 'feature-1', reviewReportId: 'review-1', longTermMemoryId: 'memory-1',
    score: 88, riskLevel: 'none', hardFailed: false, statusNote: null, recommendedAction: 'continue'
  }];
  return {
    id, tenantId: 'tenant_batch', novelId: 'novel_batch', taskId: `task-${id}`, idempotencyKey: `key-${id}`,
    requestFingerprint: { range: [1, 1] }, strategySnapshotId: 'strategy-1', strategySnapshotVersion: 1,
    sourceVersionRefs: { currentChapterPlanVersionId: 'plan-1' }, startChapterNo: 1, endChapterNo: 1,
    status: 'completed', statusNote: null, completedCount: 1, failedCount: 0, pendingCount: 0, failedChapterNo: null,
    chapterResults,
    summary: {
      id: `summary-${id}`, batchId: id, conclusion: 'Completed', chapterResults, riskTrend: 'Stable',
      nextBatchNotes: ['Continue'], riskChapterIds: [], createdAt
    },
    createdAt,
    metadata: { source: 'generation_task' }
  };
}

function prismaRepositoryWithTransaction(tx: unknown) {
  const repository = Object.create(PrismaNovelRepository.prototype) as PrismaNovelRepository & { prisma: unknown };
  Object.defineProperty(repository, 'prisma', { value: { $transaction: async (callback: (client: unknown) => unknown) => callback(tx) } });
  return repository;
}

function toInMemoryBatch(batch: ReturnType<typeof storedBodyBatch>): BodyBatchRecord {
  return {
    ...structuredClone(batch),
    status: batch.status as BodyBatchRecord['status'],
    chapterResults: batch.chapterResults as BodyBatchRecord['chapterResults'],
    summary: {
      ...structuredClone(batch.summary),
      chapterResults: batch.chapterResults as BodyBatchRecord['chapterResults'],
      createdAt: new Date(batch.summary.createdAt)
    },
    createdAt: new Date(batch.createdAt)
  };
}

function toPrismaTask(task: GenerationTaskRecord) {
  return {
    ...structuredClone(task),
    status: task.status.toUpperCase(),
    sourceVersionRefs: task.sourceVersionRefs,
    resultVersionId: task.resultVersionIds[0] ?? null,
    resultVersionIdsJson: task.resultVersionIds,
    executionEnvelopeJson: task.executionEnvelopeJson,
    providerAttemptPhase: task.providerAttemptPhase?.toUpperCase() ?? null,
    rootTaskId: task.rootTaskId!,
    providerCallBudgetMax: task.providerCallBudgetMax!,
    providerCallBudgetUsed: task.providerCallBudgetUsed!,
    durationDeadlineAt: task.durationDeadlineAt!,
    costBudgetMicrosMax: BigInt(task.costBudgetMicrosMax ?? 0),
    costBudgetMicrosUsed: BigInt(task.costBudgetMicrosUsed ?? 0)
  };
}

function at(seconds: number) {
  return new Date(Date.UTC(2026, 6, 18, 0, 0, seconds));
}
