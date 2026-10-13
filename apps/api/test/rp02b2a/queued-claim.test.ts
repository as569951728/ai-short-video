import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TaskStatus } from '@ai-shortvideo/shared';
import { createInMemoryNovelRepository } from '../../src/modules/novels/repositories/inMemoryNovelRepository.js';
import { claimQueuedGeneration } from '../../src/modules/novels/services/taskClaim.js';

const at = (minutes: number) => new Date(Date.UTC(2030, 0, 1, 0, minutes));

describe('queued generation claim', () => {
  it('persists a queued task without dispatching a provider, and replays the same task after source changes', async () => {
    const repository = createInMemoryNovelRepository();
    const context = { tenantId: 'tenant-queue', userId: 'user-queue', requestId: 'request-queue' };
    const { novel } = await repository.createDraft({ request: { title: 'Queued novel' }, context, now: at(0) });
    repository.getLeasedExecutionCapability = async () => 'enabled';
    let providerAssertions = 0;
    const input = {
      action: 'direction_generate' as const,
      repository,
      novel,
      idempotencyKey: 'same-submission-0001',
      effectiveRequest: { regenerateReason: null },
      sourceVersionRefs: { currentDirectionVersionId: null },
      context,
      now: () => at(0),
      durationDeadlineAt: at(15),
      providerCapability: { assertAvailable: () => { providerAssertions += 1; }, getModelRoutingVersion: () => 'mock:v1' }
    };
    const first = await claimQueuedGeneration(input);
    assert.equal(first.reused, false);
    assert.equal(first.task.status, TaskStatus.Queued);
    assert.equal(first.task.startedAt, null);
    assert.equal(first.task.providerAttemptId, null);
    assert.equal(first.task.providerDispatchedAt, null);
    assert.equal(first.task.providerCallBudgetMax, 1);
    assert.equal(first.task.providerCallBudgetUsed, 0);
    assert.equal(first.task.maxRetries, 0);
    assert.equal(first.task.durationDeadlineAt?.getTime(), at(15).getTime());
    assert.equal(providerAssertions, 1);

    novel.title = 'Source changed after submission';
    const replay = await claimQueuedGeneration({ ...input, now: () => at(20) });
    assert.equal(replay.reused, true);
    assert.equal(replay.task.id, first.task.id);
    assert.equal(providerAssertions, 1);
    assert.equal(repository.getGenerationTasks().length, 1);
  });

  it('blocks another key while a queued task holds the same novel conflict scope', async () => {
    const repository = createInMemoryNovelRepository();
    const context = { tenantId: 'tenant-queue', userId: 'user-queue', requestId: 'request-queue' };
    const { novel } = await repository.createDraft({ request: { title: 'Queued novel' }, context, now: at(0) });
    repository.getLeasedExecutionCapability = async () => 'enabled';
    const base = {
      action: 'direction_generate' as const, repository, novel,
      effectiveRequest: { regenerateReason: null },
      sourceVersionRefs: { currentDirectionVersionId: null },
      context, now: () => at(0), durationDeadlineAt: at(15)
    };
    await claimQueuedGeneration({ ...base, idempotencyKey: 'first-submission-0001' });
    await assert.rejects(
      claimQueuedGeneration({ ...base, idempotencyKey: 'other-submission-0002' }),
      (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'CONFLICT_TASK_EXISTS')
    );
    assert.equal(repository.getGenerationTasks().length, 1);
  });

  it('rejects missing submission identity and an expired new deadline before creating a task', async () => {
    const repository = createInMemoryNovelRepository();
    const context = { tenantId: 'tenant-queue', userId: 'user-queue', requestId: 'request-queue' };
    const { novel } = await repository.createDraft({ request: { title: 'Queued novel' }, context, now: at(0) });
    repository.getLeasedExecutionCapability = async () => 'enabled';
    const input = {
      action: 'direction_generate' as const, repository, novel,
      effectiveRequest: { regenerateReason: null },
      sourceVersionRefs: { currentDirectionVersionId: null },
      context, now: () => at(20), durationDeadlineAt: at(15)
    };
    await assert.rejects(claimQueuedGeneration({ ...input, idempotencyKey: '' }));
    await assert.rejects(claimQueuedGeneration({ ...input, idempotencyKey: 'expired-submission-0001' }));
    assert.equal(repository.getGenerationTasks().length, 0);
  });
});
