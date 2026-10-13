import { randomUUID } from 'node:crypto';
import { ErrorCode, TaskStatus } from '@ai-shortvideo/shared';
import { BusinessError } from '../../../shared/errors.js';
import { hashCanonicalJson, WorkerPayloadUnsupportedError } from '../domain/executionContract.js';
import type { NovelRepository } from '../domain/novelDomain.js';
import {
  executeNovelProviderAction,
  getActionExecutionPlan,
  validateNovelProviderActionInput,
  type NovelProviderActionResult,
  type NovelProviderSet
} from './actionExecutionPlan.js';
import { NovelTaskLeaseAbandonedError, type NovelTaskWorkerRuntimeOptions } from './novelTaskWorkerRuntime.js';
import { preflightLeasedAction, reconstructLeasedProviderInput } from './taskClaim.js';

export type LeasedActionExecutionResult =
  | { kind: 'terminal' | 'fenced' }
  | { kind: 'provider_failure' }
  | { kind: 'provider_result'; providerAttemptId: string; value: NovelProviderActionResult };

export interface LeasedActionExecutorOptions {
  repository: NovelRepository;
  providers: NovelProviderSet;
  newProviderAttemptId?: () => string;
}

export function createLeasedActionExecutor(
  options: LeasedActionExecutorOptions
): Pick<NovelTaskWorkerRuntimeOptions<LeasedActionExecutionResult>, 'execute' | 'settle'> {
  const { repository, providers } = options;
  return {
    async execute(context) {
      const lease = { tenantId: context.task.tenantId, taskId: context.task.id,
        leaseOwnerId: context.leaseOwnerId, leaseToken: context.leaseToken };
      if (context.signal.aborted) return { kind: 'fenced' };
      const preflight = await context.mutate(async () => preflightLeasedAction({
        repository, ...lease, authoritativeNow: await repository.getAuthoritativeTaskTime()
      }));
      if (preflight.outcome === 'fenced') return { kind: 'fenced' };
      if (preflight.outcome === 'failed') return { kind: 'terminal' };

      let providerInput;
      try {
        const reconstructed = await context.mutate(() => reconstructLeasedProviderInput(repository, preflight.task));
        try {
          providerInput = validateNovelProviderActionInput(reconstructed.providerInput);
          if (hashCanonicalJson(providerInput) !== hashCanonicalJson(reconstructed.providerInput)) {
            throw new Error('Provider input changed during validation');
          }
          if (preflight.task.modelRoutingVersion !== configuredRoutingVersion(providerInput.action, providers)) {
            throw new Error('Task model routing no longer matches the worker');
          }
          assertLeasedPaidCallBudget(providerInput.action, providers);
        } catch {
          throw new WorkerPayloadUnsupportedError('Provider input is invalid');
        }
      } catch (error) {
        if (error instanceof NovelTaskLeaseAbandonedError || context.signal.aborted) return { kind: 'fenced' };
        if (!isSourceStale(error) && !(error instanceof WorkerPayloadUnsupportedError)) throw error;
        const reason = isSourceStale(error) ? 'source_stale' : 'worker_payload_unsupported';
        const failure = await context.mutate(async () => repository.failLeasedAction({
          ...lease, authoritativeNow: await repository.getAuthoritativeTaskTime(),
          expectedPhase: 'leased', reason
        }));
        return { kind: failure.outcome === 'applied' ? 'terminal' : 'fenced' };
      }

      const prepared = await context.mutate(async () => repository.checkpointLeasedTask({
        ...lease, authoritativeNow: await repository.getAuthoritativeTaskTime(),
        checkpoint: { expectedPhase: 'leased', nextPhase: 'prepared' }
      }));
      if (prepared.outcome !== 'applied' || context.signal.aborted) return { kind: 'fenced' };

      const providerAttemptId = (options.newProviderAttemptId ?? randomUUID)();
      const dispatched = await context.mutate(async () => repository.dispatchLeasedTask({
        ...lease, authoritativeNow: await repository.getAuthoritativeTaskTime(), providerAttemptId
      }));
      if (dispatched.outcome !== 'applied') return { kind: 'fenced' };
      if (dispatched.task.status === TaskStatus.Failed) return { kind: 'terminal' };
      if (context.signal.aborted) return { kind: 'fenced' };

      let value: NovelProviderActionResult;
      try {
        value = await executeNovelProviderAction(providers, providerInput);
      } catch {
        return { kind: 'provider_failure' };
      }
      if (context.signal.aborted) return { kind: 'fenced' };
      const validated = await context.mutate(async () => repository.checkpointLeasedTask({
        ...lease, authoritativeNow: await repository.getAuthoritativeTaskTime(),
        checkpoint: { expectedPhase: 'provider_call_started', nextPhase: 'provider_result_validated', providerAttemptId }
      }));
      return validated.outcome === 'applied'
        ? { kind: 'provider_result', providerAttemptId, value }
        : { kind: 'fenced' };
    },

    async settle(context) {
      const lease = { tenantId: context.task.tenantId, taskId: context.task.id,
        leaseOwnerId: context.leaseOwnerId, leaseToken: context.leaseToken,
        authoritativeNow: context.authoritativeNow };
      if (context.outcome.kind === 'fulfilled') {
        if (context.outcome.value.kind === 'provider_result') {
          await repository.finalizeLeasedAction({ ...lease,
            providerAttemptId: context.outcome.value.providerAttemptId,
            validatedResult: context.outcome.value.value
          });
        } else if (context.outcome.value.kind === 'provider_failure') {
          await repository.failLeasedTask(lease.tenantId, lease.taskId, lease.leaseOwnerId,
            lease.leaseToken, lease.authoritativeNow, {
              failureCategory: 'provider_error', errorCode: 'PROVIDER_ERROR',
              errorMessage: '模型服务调用失败，本次不会自动重试。',
              statusNote: '模型服务调用失败，任务已安全结束。'
            });
        }
        return;
      }
      await repository.failLeasedTask(lease.tenantId, lease.taskId, lease.leaseOwnerId,
        lease.leaseToken, lease.authoritativeNow, {
          failureCategory: 'worker_error', errorCode: 'WORKER_EXECUTION_FAILED',
          errorMessage: '后台执行未完成，本次不会自动重试。',
          statusNote: '后台执行未完成，任务已安全结束。'
        });
    }
  };
}

function configuredRoutingVersion(action: Parameters<typeof getActionExecutionPlan>[0], providers: NovelProviderSet): string {
  const provider = providerForAction(action, providers);
  const capability = provider as typeof provider & { getModelRoutingVersion?: (action: string) => string };
  return capability.getModelRoutingVersion?.(action) ?? `provider:${provider.constructor.name}:v1`;
}

function assertLeasedPaidCallBudget(action: Parameters<typeof getActionExecutionPlan>[0], providers: NovelProviderSet): void {
  const provider = providerForAction(action, providers) as { getLeasedPaidCallBudget?: (action: string) => 1 | null };
  if (provider.getLeasedPaidCallBudget?.(action) !== 1) {
    throw new WorkerPayloadUnsupportedError('Provider cannot guarantee one paid call for this leased action');
  }
}

function providerForAction(action: Parameters<typeof getActionExecutionPlan>[0], providers: NovelProviderSet) {
  const kind = getActionExecutionPlan(action).providerKind;
  return kind === 'direction' ? providers.directionProvider
    : kind === 'structure' ? providers.structureProvider
      : kind === 'trial' ? providers.trialProvider
        : kind === 'body' ? providers.bodyProvider : providers.fullReviewProvider;
}

function isSourceStale(error: unknown): boolean {
  return error instanceof BusinessError && error.code === ErrorCode.VersionConflict
    && (error.details as { code?: unknown } | undefined)?.code === 'SOURCE_STALE';
}
