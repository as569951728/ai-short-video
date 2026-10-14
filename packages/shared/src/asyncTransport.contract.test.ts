import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isNovelAsyncTransportActionEnabled } from './index.js';
import type {
  NovelAsyncTransportCapabilityV1,
  NovelProviderAction,
  TaskDispatchConflictDetailsV1,
  TaskDispatchResponseV1
} from './index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
type Accepted = Extract<TaskDispatchResponseV1, { kind: 'accepted' }>;
type Existing = Extract<TaskDispatchResponseV1, { kind: 'existing' }>;
type Disabled = Extract<NovelAsyncTransportCapabilityV1, { enabled: false }>;
type Enabled = Extract<NovelAsyncTransportCapabilityV1, { enabled: true }>;

type ContractChecks = [
  Expect<Equal<TaskDispatchResponseV1['action'], NovelProviderAction>>,
  Expect<Equal<Accepted['status'], 'queued' | 'processing'>>,
  Expect<Equal<Accepted['reused'], boolean>>,
  Expect<Equal<Existing['status'], 'waiting_confirmation' | 'completed' | 'failed' | 'cancelled'>>,
  Expect<Equal<Existing['reused'], true>>,
  Expect<Equal<keyof TaskDispatchConflictDetailsV1, 'existingTaskId' | 'action' | 'objectId'>>,
  Expect<Equal<TaskDispatchConflictDetailsV1['existingTaskId'], string | undefined>>,
  Expect<Equal<TaskDispatchConflictDetailsV1['action'], NovelProviderAction>>,
  Expect<Equal<Disabled['reasonCode'],
    'TRUSTED_CONTEXT_MISSING' | 'SCOPE_SECRET_MISSING' | 'API_AUDIENCE_MISSING' |
    'POLICY_DISABLED' | 'UNSUPPORTED_ENVIRONMENT'>>,
  Expect<Equal<keyof Disabled, 'contractVersion' | 'enabled' | 'reasonCode'>>,
  Expect<Equal<keyof Enabled,
    'contractVersion' | 'enabled' | 'capabilityRevision' | 'submissionScopeId' | 'expiresAt' | 'enabledActions'>>,
  Expect<Equal<NovelAsyncTransportCapabilityV1['contractVersion'], 'v1'>>
];

describe('shared B2b async transport contracts', () => {
  it('keeps accepted and existing task responses distinct', () => {
    const accepted = {
      kind: 'accepted',
      taskId: 'task-1',
      action: 'direction_generate',
      objectId: 'novel-1',
      status: 'queued',
      reused: false,
      pollUrl: '/tasks/task-1'
    } satisfies TaskDispatchResponseV1;
    const existing = {
      ...accepted,
      kind: 'existing',
      status: 'waiting_confirmation',
      reused: true
    } satisfies TaskDispatchResponseV1;

    assert.equal(accepted.kind, 'accepted');
    assert.equal(existing.kind, 'existing');
    assert.equal(existing.reused, true);
  });

  it('allows conflict details without leaking more than the optional task id', () => {
    const details = {
      action: 'chapter_rewrite',
      objectId: 'chapter-1',
      existingTaskId: 'task-2'
    } satisfies TaskDispatchConflictDetailsV1;

    assert.deepEqual(Object.keys(details).sort(), ['action', 'existingTaskId', 'objectId']);
  });

  it('discriminates disabled reasons from enabled capability fields', () => {
    const disabled = {
      contractVersion: 'v1',
      enabled: false,
      reasonCode: 'POLICY_DISABLED'
    } satisfies NovelAsyncTransportCapabilityV1;
    const enabled = {
      contractVersion: 'v1',
      enabled: true,
      capabilityRevision: 'revision-1',
      submissionScopeId: 'scope-1',
      expiresAt: '2026-10-14T00:00:00.000Z'
    } satisfies NovelAsyncTransportCapabilityV1;

    assert.equal(disabled.enabled, false);
    assert.equal(enabled.enabled, true);
    assert.equal(enabled.submissionScopeId, 'scope-1');
    assert.equal(isNovelAsyncTransportActionEnabled(enabled, 'chapter_plan_generate'), true);
    const partial = { ...enabled, enabledActions: ['direction_generate'] } as const;
    assert.equal(isNovelAsyncTransportActionEnabled(partial, 'direction_generate'), true);
    assert.equal(isNovelAsyncTransportActionEnabled(partial, 'chapter_plan_generate'), false);
  });
});
