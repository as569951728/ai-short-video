import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ErrorCode, type ExecutionEnvelopeV1_1 } from '@ai-shortvideo/shared';
import { BusinessError } from '../../src/shared/errors.js';
import { WorkerPayloadUnsupportedError } from '../../src/modules/novels/domain/executionContract.js';
import { hashCanonicalJson, reconstructLeasedProviderInput } from '../../src/modules/novels/services/taskClaim.js';
import { ACTIONS, createRouteAuthorityFixture } from './fixtures.js';

describe('leased provider input reconstruction', () => {
  for (const action of ACTIONS) {
    it(`${action} rebuilds the claimed provider input before a model call`, async () => {
      const fixture = await createRouteAuthorityFixture(action);
      const originalFence = fixture.repository.fenceGenerationAuthority.bind(fixture.repository);
      let checked = false;
      fixture.repository.fenceGenerationAuthority = async (input) => {
        if (input.phase === 'provider_dispatch') {
          const task = await fixture.repository.findTaskById(input.tenantId, input.taskId);
          assert.ok(task);
          const beforeProvider = fixture.providerInvocations().length;
          const rebuilt = await reconstructLeasedProviderInput(fixture.repository, task);
          assert.equal(rebuilt.action, action);
          assert.equal(rebuilt.authoritySnapshotHash, (task.executionEnvelopeJson as ExecutionEnvelopeV1_1).sourceVersionRefs.authoritySnapshotHash);
          assert.equal(hashCanonicalJson(rebuilt.providerInput), (task.executionEnvelopeJson as ExecutionEnvelopeV1_1).sourceVersionRefs.providerInputSnapshotHash);
          assert.equal(fixture.providerInvocations().length, beforeProvider);
          checked = true;
        }
        return originalFence(input);
      };
      try {
        const response = await fixture.runSuccess(`reconstruct-${action}`);
        assert.equal(response.statusCode, 200, response.body);
        assert.equal(checked, true);
      } finally {
        fixture.repository.fenceGenerationAuthority = originalFence;
        await fixture.app.close();
      }
    });
  }

  it('rejects changed authority and a forged provider snapshot before a model call', async () => {
    const fixture = await createRouteAuthorityFixture('direction_generate');
    const originalFence = fixture.repository.fenceGenerationAuthority.bind(fixture.repository);
    let checked = false;
    fixture.repository.fenceGenerationAuthority = async (input) => {
      if (input.phase === 'provider_dispatch') {
        const task = await fixture.repository.findTaskById(input.tenantId, input.taskId);
        const novel = await fixture.repository.findById(input.tenantId, fixture.novelId);
        assert.ok(task && novel);
        const originalTitle = novel.title;
        novel.title = `${originalTitle} changed`;
        await assert.rejects(reconstructLeasedProviderInput(fixture.repository, task),
          (error: unknown) => error instanceof BusinessError && error.code === ErrorCode.VersionConflict);
        novel.title = originalTitle;
        const tampered = structuredClone(task);
        const envelope = tampered.executionEnvelopeJson as ExecutionEnvelopeV1_1;
        envelope.sourceVersionRefs.providerInputSnapshotHash = '0'.repeat(64);
        tampered.sourceVersionRefs = envelope.sourceVersionRefs;
        tampered.requestHash = hashCanonicalJson(envelope);
        await assert.rejects(reconstructLeasedProviderInput(fixture.repository, tampered),
          (error: unknown) => (error instanceof BusinessError && error.code === ErrorCode.VersionConflict)
            || error instanceof WorkerPayloadUnsupportedError);
        assert.equal(fixture.providerInvocations().length, 0);
        checked = true;
      }
      return originalFence(input);
    };
    try {
      const response = await fixture.runSuccess('reconstruct-negative-direction');
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(checked, true);
    } finally {
      fixture.repository.fenceGenerationAuthority = originalFence;
      await fixture.app.close();
    }
  });
});
