import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { ErrorCode, TaskStatus } from '@ai-shortvideo/shared';
import { buildApp } from '../../src/app.js';
import type { DirectionCandidateDraft, NovelRepository, RequestContext } from '../../src/modules/novels/domain/novelDomain.js';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';
import { MockDirectionProvider, type DirectionProvider } from '../../src/modules/novels/providers/mockDirectionProvider.js';
import { NovelService } from '../../src/modules/novels/services/novelService.js';
import { executeClaimedGeneration, NOVEL_PROVIDER_ACTIONS } from '../../src/modules/novels/services/taskClaim.js';
import { BusinessError } from '../../src/shared/errors.js';

describe('RP-02A generation task SSOT and provider preclaim', () => {
  it('publishes one processing task before a deferred provider is released', async () => {
    const repository = createInMemoryNovelRepository();
    const provider = new DeferredDirectionProvider();
    const { service, novelId, context } = await createDirectionFixture(repository, provider, 'preclaim');

    const pending = service.generateDirections(novelId, { idempotencyKey: 'rp02a-preclaim-0001' }, context);
    await provider.entered;

    const tasks = repository.getGenerationTasks();
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0]?.status, TaskStatus.Processing);
    assert.equal((await repository.findTaskById(context.tenantId, tasks[0]!.id))?.id, tasks[0]?.id);
    assert.deepEqual(repository.getGenerationTaskEvents().map((event) => event.eventType), ['task_claimed']);

    provider.release();
    await pending;
  });

  it('runs twenty latch-based 10-request races with one provider call, task, and candidate group', async () => {
    for (let round = 0; round < 20; round += 1) {
      const repository = createInMemoryNovelRepository();
      const provider = new DeferredDirectionProvider();
      const { service, novelId, context } = await createDirectionFixture(repository, provider, `race-${round}`);
      const request = { idempotencyKey: `rp02a-race-${String(round).padStart(4, '0')}` };

      const primary = service.generateDirections(novelId, request, context);
      await provider.entered;
      const duplicates = Array.from({ length: 9 }, (_, index) =>
        service.generateDirections(novelId, request, { ...context, requestId: `race-${round}-duplicate-${index}` })
      );
      const duplicateResults = await Promise.all(duplicates);
      const claimedTaskId = repository.getGenerationTasks()[0]!.id;
      assert.deepEqual(new Set(duplicateResults.map((result) => result.task.id)), new Set([claimedTaskId]));
      assert.equal(repository.getCreativeVersions().length, 0);

      provider.release();
      const primaryResult = await primary;
      assert.equal(primaryResult.task.id, claimedTaskId);
      assert.equal(provider.calls, 1);
      assert.equal(repository.getGenerationTasks().length, 1);
      const candidates = repository.getCreativeVersions().filter((version) => version.sourceTaskId === claimedTaskId);
      assert.equal(candidates.length, 4);
      assert.equal(new Set(candidates.map((version) => version.sourceTaskId)).size, 1);
    }
  });

  it('separates idempotency conflict from active conflict without additional provider calls', async () => {
    const repository = createInMemoryNovelRepository();
    const provider = new DeferredDirectionProvider();
    const { service, novelId, context } = await createDirectionFixture(repository, provider, 'conflicts');
    const primary = service.generateDirections(novelId, { idempotencyKey: 'rp02a-conflict-token' }, context);
    await provider.entered;

    await assertBusinessError(
      service.generateDirections(novelId, { idempotencyKey: 'rp02a-conflict-token', regenerateReason: 'different effective input' }, context),
      ErrorCode.IdempotencyConflict
    );
    await assertBusinessError(
      service.generateDirections(novelId, { idempotencyKey: 'rp02a-active-token-02' }, context),
      ErrorCode.ConflictTaskExists
    );
    assert.equal(provider.calls, 1);
    assert.equal(repository.getGenerationTasks().length, 1);
    provider.release();
    await primary;
  });

  it('binds the idempotency fingerprint to the provider model routing version', async () => {
    const repository = createInMemoryNovelRepository();
    const context = requestContext('tenant-routing', 'routing-request');
    const created = await repository.createDraft({ request: { title: 'Routing fingerprint novel' }, context, now: new Date() });
    let routingVersion = 'deepseek:model-a:route-v1';
    let providerCalls = 0;
    const input = () => ({
      action: 'direction_generate' as const,
      repository,
      novel: created.novel,
      idempotencyKey: 'rp02a-routing-token',
      effectiveRequest: { regenerateReason: null },
      sourceVersionRefs: { currentDirectionVersionId: null },
      context,
      now: () => new Date(),
      providerCapability: { getModelRoutingVersion: () => routingVersion },
      provider: async () => {
        providerCalls += 1;
        return 'draft';
      },
      finalize: async (task: { id: string }) => task.id
    });

    await executeClaimedGeneration(input());
    routingVersion = 'deepseek:model-b:route-v1';
    await assertBusinessError(executeClaimedGeneration(input()), ErrorCode.IdempotencyConflict);
    assert.equal(providerCalls, 1);
  });

  it('isolates identical tokens and conflict keys by tenant and prevents cross-tenant reads', async () => {
    const repository = createInMemoryNovelRepository();
    const provider = new CountingDirectionProvider();
    const service = new NovelService({ repository, directionProvider: provider });
    const contextA = requestContext('tenant-a', 'tenant-a-request');
    const contextB = requestContext('tenant-b', 'tenant-b-request');
    const novelA = await service.createDraft({ title: 'Tenant A novel', genres: ['test'] }, contextA);
    const novelB = await service.createDraft({ title: 'Tenant B novel', genres: ['test'] }, contextB);
    const token = 'rp02a-cross-tenant-token';

    const [resultA, resultB] = await Promise.all([
      service.generateDirections(novelA.id, { idempotencyKey: token }, contextA),
      service.generateDirections(novelB.id, { idempotencyKey: token }, contextB)
    ]);

    assert.equal(provider.calls, 2);
    assert.notEqual(resultA.task.id, resultB.task.id);
    assert.equal(await repository.findTaskById(contextA.tenantId, resultB.task.id), null);
    assert.equal(await repository.findTaskById(contextB.tenantId, resultA.task.id), null);
  });

  it('keeps provider and save failures on the claimed task and never calls provider on replay', async () => {
    const timeoutRepository = createInMemoryNovelRepository();
    const timeoutProvider = new RejectingDirectionProvider(new Error('provider timeout'));
    const timeoutFixture = await createDirectionFixture(timeoutRepository, timeoutProvider, 'timeout');
    const timeoutRequest = { idempotencyKey: 'rp02a-timeout-token' };
    await assert.rejects(timeoutFixture.service.generateDirections(timeoutFixture.novelId, timeoutRequest, timeoutFixture.context));
    const timeoutTask = timeoutRepository.getGenerationTasks()[0]!;
    assert.equal(timeoutTask.status, TaskStatus.Failed);
    assert.equal(timeoutTask.failureCategory, 'provider_error');
    assert.equal(timeoutTask.errorMessage, '模型服务调用失败。');
    const timeoutReplay = await timeoutFixture.service.generateDirections(timeoutFixture.novelId, timeoutRequest, timeoutFixture.context);
    assert.equal(timeoutReplay.task.id, timeoutTask.id);
    assert.equal(timeoutProvider.calls, 1);

    const baseRepository = createInMemoryNovelRepository();
    let saveCalls = 0;
    const saveFailureRepository = overrideRepository(baseRepository, {
      createDirectionCandidates: async () => {
        saveCalls += 1;
        throw new Error('database payload must not escape');
      }
    });
    const saveProvider = new CountingDirectionProvider();
    const saveFixture = await createDirectionFixture(saveFailureRepository, saveProvider, 'save');
    const saveRequest = { idempotencyKey: 'rp02a-save-failure-token' };
    await assert.rejects(saveFixture.service.generateDirections(saveFixture.novelId, saveRequest, saveFixture.context));
    const saveTask = baseRepository.getGenerationTasks()[0]!;
    assert.equal(saveTask.status, TaskStatus.Failed);
    assert.equal(saveTask.failureCategory, 'save_failed');
    assert.equal(saveTask.errorMessage, '生成结果保存失败。');
    const saveReplay = await saveFixture.service.generateDirections(saveFixture.novelId, saveRequest, saveFixture.context);
    assert.equal(saveReplay.task.id, saveTask.id);
    assert.equal(saveProvider.calls, 1);
    assert.equal(saveCalls, 1);
  });

  it('does not call provider or leave half a task when claim fails', async () => {
    const baseRepository = createInMemoryNovelRepository();
    const repository = overrideRepository(baseRepository, {
      claimGenerationTask: async () => {
        throw new Error('claim transaction failed');
      }
    });
    const provider = new CountingDirectionProvider();
    const fixture = await createDirectionFixture(repository, provider, 'claim-failure');
    await assert.rejects(fixture.service.generateDirections(fixture.novelId, { idempotencyKey: 'rp02a-claim-failure' }, fixture.context));
    assert.equal(provider.calls, 0);
    assert.equal(baseRepository.getGenerationTasks().length, 0);
    assert.equal(baseRepository.getGenerationTaskEvents().length, 0);
  });

  it('table-drives every provider-backed novel action through claim before provider and finalize', async () => {
    for (const action of NOVEL_PROVIDER_ACTIONS) {
      const baseRepository = createInMemoryNovelRepository();
      const context = requestContext('tenant-guard', `guard-${action}`);
      const created = await baseRepository.createDraft({ request: { title: `Guard ${action}` }, context, now: new Date() });
      const order: string[] = [];
      const repository = overrideRepository(baseRepository, {
        claimGenerationTask: async (input) => {
          order.push('claim');
          return baseRepository.claimGenerationTask(input);
        }
      });
      const contract = claimContractFor(action);
      const result = await executeClaimedGeneration({
        action,
        repository,
        novel: created.novel,
        objectId: action.includes('chapter') ? 'chapter-guard' : undefined,
        idempotencyKey: `guard-${action}`.slice(0, 120),
        effectiveRequest: action === 'novel_full_review' ? { reviewPolicyVersionId: created.novel.policyProfileVersionId } : contract.effectiveRequest,
        sourceVersionRefs: contract.sourceVersionRefs,
        context,
        now: () => new Date(),
        provider: async () => {
          order.push('provider');
          return 'draft';
        },
        finalize: async (task) => {
          order.push('finalize');
          return task.id;
        }
      });
      assert.equal(result.reused, false);
      assert.deepEqual(order, ['claim', 'provider', 'finalize'], action);
    }

    const serviceSource = await readFile('src/modules/novels/services/novelService.ts', 'utf8');
    assert.equal((serviceSource.match(/this\.(?:direction|structure|trial|body|fullReview)Provider\./g) ?? []).length, 11);
    assert.equal((serviceSource.match(/executeClaimedGeneration\(\{/g) ?? []).length, 11);
  });

  it('accepts Idempotency-Key, rejects mismatched body aliases, and does not expose claim internals', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({ logger: false, novelRepository: repository });
    const draft = await app.inject({ method: 'POST', url: '/novels/drafts', payload: { title: 'Header contract novel' } });
    const novelId = draft.json().data.id;
    const headers = { 'idempotency-key': 'rp02a-header-token' };
    const first = await app.inject({ method: 'POST', url: `/novels/${novelId}/directions/generate`, headers, payload: {} });
    const replay = await app.inject({ method: 'POST', url: `/novels/${novelId}/directions/generate`, headers, payload: {} });
    assert.equal(first.statusCode, 200);
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(first.json().data.task.id, replay.json().data.task.id);
    assert.doesNotMatch(JSON.stringify(first.json()), /idempotencyToken|requestHash|activeClaimKey|rp02a-header-token/);

    const mismatch = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/directions/generate`,
      headers: { 'idempotency-key': 'rp02a-header-token-2' },
      payload: { idempotencyKey: 'rp02a-body-token-0002' }
    });
    assert.equal(mismatch.statusCode, 400);
    assert.equal(mismatch.json().error.code, ErrorCode.ValidationError);
    const storedTask = repository.getGenerationTasks()[0]!;
    assert.doesNotMatch(JSON.stringify(storedTask.metadata), /idempotency|requestHash|prompt|provider|api.?key/i);
    await app.close();
  });

  it('replays a terminal direction task after adoption advances the business stage', async () => {
    const repository = createInMemoryNovelRepository();
    const app = await buildApp({ logger: false, novelRepository: repository });
    const draft = await app.inject({ method: 'POST', url: '/novels/drafts', payload: { title: 'Terminal replay novel' } });
    const novelId = draft.json().data.id;
    const headers = { 'idempotency-key': 'rp02a-terminal-direction-token' };
    const generated = await app.inject({ method: 'POST', url: `/novels/${novelId}/directions/generate`, headers, payload: {} });
    const candidate = generated.json().data.candidates.find((item: { score: number }) => item.score >= 75);
    const candidateId = candidate.id;
    const adopted = await app.inject({
      method: 'POST',
      url: `/novels/${novelId}/directions/${candidateId}/adopt`,
      payload: {
        reason: 'adopt before replay',
        pageVersionSnapshot: { seenCandidateVersionId: candidateId }
      }
    });
    const replay = await app.inject({ method: 'POST', url: `/novels/${novelId}/directions/generate`, headers, payload: {} });

    assert.equal(adopted.statusCode, 200);
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(replay.json().data.task.id, generated.json().data.task.id);
    assert.equal(repository.getGenerationTasks().filter((task) => task.taskType === 'novel_direction_generate').length, 1);
    await app.close();
  });

  it('pins the Prisma static claim contract and duplicate-refusal migration without running a database', async () => {
    const schema = await readFile('prisma/schema.prisma', 'utf8');
    const migration = await readFile('prisma/migrations/20260713000000_rp02a_generation_task_preclaim/migration.sql', 'utf8');
    assert.match(schema, /@@unique\(\[tenantId, taskType, idempotencyToken\]\)/);
    assert.match(schema, /@@unique\(\[tenantId, activeClaimKey\]\)/);
    assert.doesNotMatch(migration, /DELIMITER|CREATE PROCEDURE/);
    assert.ok(migration.indexOf('CREATE TEMPORARY TABLE') < migration.indexOf('ALTER TABLE `generation_task`'));
    assert.match(migration, /duplicate_idempotency_identity/);
    assert.match(migration, /duplicate_active_claim/);
    assert.match(migration, /ADD UNIQUE INDEX `generation_task_tenant_id_task_type_idempotency_token_key`/);
    assert.match(migration, /ADD UNIQUE INDEX `generation_task_tenant_id_active_claim_key_key`/);
    assert.match(migration, /MySQL aborts this migration/);
    assert.match(migration, /active_claim_key/);
    assert.match(migration, /information_schema`.`COLUMNS/);
    assert.match(migration, /information_schema`.`STATISTICS/);
    assert.match(migration, /PREPARE `rp02a_stmt`/);
    assert.match(migration, /Each DDL is conditional/);
  });
});

function claimContractFor(action: (typeof NOVEL_PROVIDER_ACTIONS)[number]) {
  const structure = { currentDirectionVersionId: 'direction-v1', currentSettingVersionId: 'setting-v1', currentOutlineVersionId: 'outline-v1', currentStageOutlineVersionId: 'stage-v1' };
  const body = { ...structure, currentChapterPlanVersionId: 'plan-v1', trialRunId: 'trial-v1', selectedChapterOneCandidateId: 'candidate-v1', strategySnapshotId: 'strategy-v1', strategySnapshotVersion: 1, creationStage: 'body' };
  const contracts: Record<(typeof NOVEL_PROVIDER_ACTIONS)[number], { effectiveRequest: unknown; sourceVersionRefs: unknown }> = {
    direction_generate: { effectiveRequest: {}, sourceVersionRefs: { currentDirectionVersionId: null } }, direction_fuse: { effectiveRequest: { versionIds: ['direction-v1', 'direction-v2'] }, sourceVersionRefs: { sourceVersionIds: ['direction-v1', 'direction-v2'] } },
    direction_optimize: { effectiveRequest: { versionId: 'direction-v1' }, sourceVersionRefs: { sourceVersionIds: ['direction-v1'] } }, setting_generate: { effectiveRequest: {}, sourceVersionRefs: { ...structure, objectType: 'setting' } },
    outline_generate: { effectiveRequest: {}, sourceVersionRefs: { ...structure, objectType: 'outline' } }, stage_outline_generate: { effectiveRequest: {}, sourceVersionRefs: { ...structure, objectType: 'stage_outline' } },
    chapter_plan_generate: { effectiveRequest: {}, sourceVersionRefs: { ...structure, objectType: 'chapter_plan' } }, trial_chapter_one_generate: { effectiveRequest: { chapterCount: 3 }, sourceVersionRefs: { ...structure, currentChapterPlanVersionId: 'plan-v1', objectType: 'trial_run' } },
    trial_followup_generate: { effectiveRequest: { selectedCandidateId: 'candidate-v1' }, sourceVersionRefs: { ...structure, currentChapterPlanVersionId: 'plan-v1', selectedChapterOneCandidateId: 'candidate-v1', objectType: 'trial_run' } }, body_batch_generate: { effectiveRequest: { startChapterNo: 1, endChapterNo: 2 }, sourceVersionRefs: body },
    chapter_body_generate: { effectiveRequest: {}, sourceVersionRefs: body }, chapter_rewrite: { effectiveRequest: { currentContentVersionId: 'content-v1', instruction: 'rewrite' }, sourceVersionRefs: { currentContentVersionId: 'content-v1' } },
    chapter_impact_assess: { effectiveRequest: { currentContentVersionId: 'content-v1' }, sourceVersionRefs: { currentContentVersionId: 'content-v1' } }, chapter_adopt_impact_assess: { effectiveRequest: { currentContentVersionId: 'content-v1', candidateVersionId: 'candidate-v1', reason: 'adopt' }, sourceVersionRefs: { currentContentVersionId: 'content-v1', candidateVersionId: 'candidate-v1' } },
    novel_full_review: { effectiveRequest: { reviewPolicyVersionId: 'policy-v1' }, sourceVersionRefs: { ...structure, currentChapterPlanVersionId: 'plan-v1', chapterContentVersionIds: [{ chapterId: 'chapter-v1', chapterNo: 1, currentContentVersionId: 'content-v1', currentFeatureCardVersionId: null, currentReviewReportId: null }] } }
  };
  return contracts[action];
}

class CountingDirectionProvider implements DirectionProvider {
  readonly delegate = new MockDirectionProvider();
  calls = 0;

  async generateCandidates(input: Parameters<DirectionProvider['generateCandidates']>[0]) {
    this.calls += 1;
    return this.delegate.generateCandidates(input);
  }

  fuseCandidates(input: Parameters<DirectionProvider['fuseCandidates']>[0]) {
    return this.delegate.fuseCandidates(input);
  }

  optimizeCandidate(input: Parameters<DirectionProvider['optimizeCandidate']>[0]) {
    return this.delegate.optimizeCandidate(input);
  }
}

class DeferredDirectionProvider extends CountingDirectionProvider {
  private readonly gate = deferred<void>();
  private readonly enteredGate = deferred<void>();
  readonly entered = this.enteredGate.promise;

  override async generateCandidates(input: Parameters<DirectionProvider['generateCandidates']>[0]) {
    this.calls += 1;
    this.enteredGate.resolve();
    await this.gate.promise;
    return this.delegate.generateCandidates(input);
  }

  release() {
    this.gate.resolve();
  }
}

class RejectingDirectionProvider extends CountingDirectionProvider {
  constructor(private readonly failure: Error) {
    super();
  }

  override async generateCandidates(_input: Parameters<DirectionProvider['generateCandidates']>[0]): Promise<DirectionCandidateDraft[]> {
    this.calls += 1;
    throw this.failure;
  }
}

async function createDirectionFixture(repository: NovelRepository, provider: DirectionProvider, suffix: string) {
  const context = requestContext('tenant-rp02a', `request-${suffix}`);
  const service = new NovelService({ repository, directionProvider: provider, now: monotonicClock() });
  const novel = await service.createDraft({ title: `RP-02A ${suffix}`, genres: ['test'] }, context);
  return { service, novelId: novel.id, context };
}

function requestContext(tenantId: string, requestId: string): RequestContext {
  return { tenantId, userId: `user-${tenantId}`, requestId };
}

function monotonicClock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 6, 13, 0, 0, tick++));
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function assertBusinessError(promise: Promise<unknown>, code: ErrorCode) {
  await assert.rejects(promise, (error: unknown) => error instanceof BusinessError && error.code === code);
}

function overrideRepository<T extends NovelRepository>(repository: T, overrides: Partial<NovelRepository>): T {
  return new Proxy(repository, {
    get(target, property, receiver) {
      const override = overrides[property as keyof NovelRepository];
      if (override) return override;
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(receiver) : value;
    }
  });
}
