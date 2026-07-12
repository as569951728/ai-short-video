import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  analyzeGitBudget,
  analyzeSlaReceipt,
  GovernanceFailure,
  parseNumstatZ,
  validateAdrFields
} from './remediation-governance.mjs';

function entries(count, additionsPerFile = 1) {
  return Array.from({ length: count }, (_, index) => ({
    file: `docs/example-${index}.md`,
    additions: additionsPerFile,
    deletions: 0,
    binaryOrUnscored: false
  }));
}

function parseTestAdrFields() {
  const fields = {};
  for (const line of readFileSync('docs/adr/rp-00b-test-override.md', 'utf8').split('\n')) {
    const match = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (match) fields[match[1]] = match[2].trim();
  }
  return fields;
}

function entriesMatchingTestAdr() {
  const fields = parseTestAdrFields();
  const fileCount = Number(fields.actual_files);
  const netAdditions = Number(fields.actual_net_additions);
  const normalFileCount = fileCount - 1;
  const generated = Array.from({ length: normalFileCount }, (_, index) => ({
    file: `docs/example-${index}.md`,
    additions: index === 0 ? netAdditions - normalFileCount : 1,
    deletions: 0,
    binaryOrUnscored: false
  }));
  return [...generated, { file: 'docs/adr/rp-00b-test-override.md', additions: 1, deletions: 0, binaryOrUnscored: false }];
}

describe('RP-00B git budget', () => {
  it('accepts exactly 20 files and 2000 net additions', () => {
    const result = analyzeGitBudget({ entries: entries(20, 100) });
    assert.equal(result.fileCount, 20);
    assert.equal(result.netAdditions, 2000);
  });

  it('rejects 21 files without ADR', () => {
    assert.throws(() => analyzeGitBudget({ entries: entries(21, 1) }), GovernanceFailure);
  });

  it('rejects 2001 net additions without ADR', () => {
    assert.throws(
      () => analyzeGitBudget({ entries: [{ file: 'docs/large.md', additions: 2001, deletions: 0 }] }),
      GovernanceFailure
    );
  });

  it('allows over-budget changes with an explicit in-diff ADR', () => {
    const result = analyzeGitBudget({
      entries: entriesMatchingTestAdr(),
      adrPaths: ['docs/adr/rp-00b-test-override.md'],
      limits: { maxFiles: 1, maxNetAdditions: 2000 }
    });
    assert.equal(result.passed, true);
    assert.deepEqual(result.adrApprovals, ['docs/adr/rp-00b-test-override.md']);
  });

  it('ignores discovered ADR files when the diff is within budget', () => {
    const result = analyzeGitBudget({
      entries: [
        ...entries(2, 10),
        { file: 'docs/adr/rp-00b-test-override.md', additions: 1, deletions: 0, binaryOrUnscored: false }
      ],
      adrPaths: ['docs/adr/rp-00b-test-override.md']
    });
    assert.equal(result.passed, true);
    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.adrApprovals, []);
    assert.deepEqual(result.ignoredAdrPaths, ['docs/adr/rp-00b-test-override.md']);
  });

  it('rejects ADR files that are not part of the current diff', () => {
    assert.throws(
      () => analyzeGitBudget({ entries: entries(21, 1), adrPaths: ['docs/adr/rp-00b-test-override.md'] }),
      GovernanceFailure
    );
  });

  it('rejects ADR actual count, exceeded budget, expiry, and commit mismatches', () => {
    const context = {
      changedFiles: ['docs/adr/rp-00b-test-override.md', 'docs/large.md'],
      fileCount: 2,
      netAdditions: 2001,
      violations: ['net_additions:2001>2000'],
      applicableCommit: 'abc123',
      now: new Date(Date.UTC(2026, 6, 12, 0, 0, 0))
    };
    const validFields = {
      package_id: 'RP-00B-TEST',
      exceeded_budget: 'net_additions',
      actual_files: '2',
      actual_net_additions: '2001',
      split_reason: 'fixture',
      owner: 'QUALITY',
      valid_until: '2099-12-31'
    };
    assert.equal(validateAdrFields(validFields, context, 'docs/adr/test.md'), 'docs/adr/test.md');
    assert.throws(() => validateAdrFields({ ...validFields, actual_files: '3' }, context, 'docs/adr/test.md'), GovernanceFailure);
    assert.throws(
      () => validateAdrFields({ ...validFields, actual_net_additions: '2002' }, context, 'docs/adr/test.md'),
      GovernanceFailure
    );
    assert.throws(
      () => validateAdrFields({ ...validFields, exceeded_budget: 'changed_files' }, context, 'docs/adr/test.md'),
      GovernanceFailure
    );
    assert.throws(
      () => validateAdrFields({ ...validFields, valid_until: '2026-07-11' }, context, 'docs/adr/test.md'),
      GovernanceFailure
    );
    assert.throws(
      () =>
        validateAdrFields(
          { ...validFields, valid_until: undefined, applies_to_commit: 'different-commit' },
          context,
          'docs/adr/test.md'
        ),
      GovernanceFailure
    );
  });

  it('parses numstat -z paths with spaces, rename, deletion, and binary entries', () => {
    const parsed = parseNumstatZ(
      Buffer.from(
        '1\t0\tdocs/path with spaces.md\0' +
          '2\t1\t\0old name.md\0new name.md\0' +
          '0\t4\tdeleted.md\0' +
          '-\t-\timage.png\0'
      )
    );
    assert.deepEqual(parsed.map((entry) => entry.file), [
      'docs/path with spaces.md',
      'new name.md',
      'deleted.md',
      'image.png'
    ]);
    assert.equal(parsed[1].oldFile, 'old name.md');
    assert.equal(parsed[3].binaryOrUnscored, true);
    const result = analyzeGitBudget({ entries: parsed });
    assert.deepEqual(result.binaryOrUnscored, ['image.png']);
  });

  it('handles staged-only style entries without requiring untracked files', () => {
    const result = analyzeGitBudget({ entries: [{ file: 'staged.md', additions: 3, deletions: 1 }] });
    assert.equal(result.fileCount, 1);
    assert.equal(result.netAdditions, 2);
  });

  it('documents workflow ADR discovery with NUL-safe diff names and no empty ADR argument', () => {
    const workflow = readFileSync('.github/workflows/remediation-governance.yml', 'utf8');
    assert.match(workflow, /git diff --name-only -z "\$base" "\$head"/);
    assert.match(workflow, /ADR_ARGS=\(\)/);
    assert.match(workflow, /ADR_ARGS\+=\(--adr "\$path"\)/);
    assert.match(workflow, /"\$\{ADR_ARGS\[@\]\}"/);
  });
});

describe('RP-00B SLA receipts', () => {
  it('accepts the RP-00A receipt elapsed durations', () => {
    const result = analyzeSlaReceipt(
      `
package_id: RP-00A
dev_completed_at: 2026-07-12 20:19:02 CST
test_dispatched_at: 2026-07-12 20:30:05 CST
test_completed_at: 2026-07-12 20:33:12 CST
mc_decided_at: 2026-07-12 20:46:00 CST
dev_to_test_elapsed: 11m03s
test_to_mc_elapsed: 12m48s
dev_to_test_sla_result: passed
test_to_mc_sla_result: passed
timeout_reason: N/A
`,
      { now: new Date(Date.UTC(2026, 6, 12, 13, 0, 0)) }
    );
    assert.equal(result.devToTestElapsed, '11m03s');
    assert.equal(result.testToMcElapsed, '12m48s');
  });

  it('rejects incorrect elapsed text', () => {
    assert.throws(
      () =>
        analyzeSlaReceipt(
          `
package_id: RP-X
dev_completed_at: 2026-07-12 20:00:00 CST
test_dispatched_at: 2026-07-12 20:00:05 CST
test_completed_at: 2026-07-12 20:00:10 CST
mc_decided_at: 2026-07-12 20:00:20 CST
dev_to_test_elapsed: 1m00s
test_to_mc_elapsed: 0m10s
dev_to_test_sla_result: passed
test_to_mc_sla_result: passed
timeout_reason: N/A
`,
          { now: new Date(Date.UTC(2026, 6, 12, 13, 0, 0)) }
        ),
      GovernanceFailure
    );
  });

  it('requires over-SLA receipts to be waived or accepted_with_reason', () => {
    assert.throws(
      () =>
        analyzeSlaReceipt(
          `
package_id: RP-X
dev_completed_at: 2026-07-12 20:00:00 CST
test_dispatched_at: 2026-07-12 20:20:00 CST
test_completed_at: 2026-07-12 20:21:00 CST
mc_decided_at: 2026-07-12 20:22:00 CST
dev_to_test_elapsed: 20m00s
test_to_mc_elapsed: 1m00s
dev_to_test_sla_result: passed
test_to_mc_sla_result: passed
timeout_reason: N/A
`,
          { now: new Date(Date.UTC(2026, 6, 12, 13, 0, 0)) }
        ),
      GovernanceFailure
    );
  });

  it('accepts over-SLA receipts with accepted_with_reason', () => {
    const result = analyzeSlaReceipt(
      `
package_id: RP-X
dev_completed_at: 2026-07-12 20:00:00 CST
test_dispatched_at: 2026-07-12 20:20:00 CST
test_completed_at: 2026-07-12 20:21:00 CST
mc_decided_at: 2026-07-12 20:22:00 CST
dev_to_test_elapsed: 20m00s
test_to_mc_elapsed: 1m00s
dev_to_test_sla_result: accepted_with_reason
test_to_mc_sla_result: passed
timeout_reason: TEST seat occupied; MC accepted with reason.
`,
      { now: new Date(Date.UTC(2026, 6, 12, 13, 0, 0)) }
    );
    assert.equal(result.devToTestPassed, false);
  });

  it('rejects invalid timezone, reverse order, and future timestamps', () => {
    assert.throws(
      () =>
        analyzeSlaReceipt(`
package_id: RP-X
dev_completed_at: 2026-07-12 20:00:00 UTC
test_dispatched_at: 2026-07-12 20:01:00 CST
test_completed_at: 2026-07-12 20:02:00 CST
mc_decided_at: 2026-07-12 20:03:00 CST
dev_to_test_elapsed: 1m00s
test_to_mc_elapsed: 1m00s
dev_to_test_sla_result: passed
test_to_mc_sla_result: passed
timeout_reason: N/A
`),
      GovernanceFailure
    );
    assert.throws(
      () =>
        analyzeSlaReceipt(
          `
package_id: RP-X
dev_completed_at: 2026-07-12 20:02:00 CST
test_dispatched_at: 2026-07-12 20:01:00 CST
test_completed_at: 2026-07-12 20:03:00 CST
mc_decided_at: 2026-07-12 20:04:00 CST
dev_to_test_elapsed: 0m00s
test_to_mc_elapsed: 1m00s
dev_to_test_sla_result: passed
test_to_mc_sla_result: passed
timeout_reason: N/A
`,
          { now: new Date(Date.UTC(2026, 6, 12, 13, 0, 0)) }
        ),
      GovernanceFailure
    );
    assert.throws(
      () =>
        analyzeSlaReceipt(
          `
package_id: RP-X
dev_completed_at: 2026-07-12 21:00:00 CST
test_dispatched_at: 2026-07-12 21:01:00 CST
test_completed_at: 2026-07-12 21:02:00 CST
mc_decided_at: 2026-07-12 21:03:00 CST
dev_to_test_elapsed: 1m00s
test_to_mc_elapsed: 1m00s
dev_to_test_sla_result: passed
test_to_mc_sla_result: passed
timeout_reason: N/A
`,
          { now: new Date(Date.UTC(2026, 6, 12, 12, 0, 0)) }
        ),
      GovernanceFailure
    );
  });
});
