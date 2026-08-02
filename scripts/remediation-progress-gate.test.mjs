import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseIssueLedger,
  validateNovelCandidateAcceptanceOwnership,
  validateProgressFiles,
  validateProgressState
} from './remediation-progress-gate.mjs';

const ledger = `
| ID | 类别/级别 | 问题 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| RMD-A | PB/P0 | a | open | x |
| RMD-B | RB/P1 | b | partial | x |
| RMD-C | QG/P1 | c | closed | x |
| RMD-D | DEBT/P1 | d | closed | x |
| PB | 1 | 0 |
| RB | 1 | 0 |
| QG | 1 | 1 |
| DEBT | 1 | 1 |
| 合计 | 4 | 2 |
`;

const eventLedger = `
\`\`\`text
event_id: E-CLOSE
closure_issue_id: RMD-C
closure_head: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
closure_ledger_closed: 2
\`\`\`
\`\`\`text
event_id: E-MERGES
merged_pr_1: 1111111111111111111111111111111111111111
merged_pr_2: 2222222222222222222222222222222222222222
\`\`\`
`;
const flowEvents = {
  schemaVersion: 1,
  events: [
    {
      id: 'closure-1',
      type: 'ledger_closure',
      authorityEventId: 'E-CLOSE',
      issueId: 'RMD-C',
      closureHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      closedCountAfterEvent: 2
    },
    {
      id: 'pr-1',
      type: 'pull_request_merged',
      pullRequest: 1,
      mergeSha: '1111111111111111111111111111111111111111',
      authorityEventId: 'E-MERGES'
    },
    {
      id: 'pr-2',
      type: 'pull_request_merged',
      pullRequest: 2,
      mergeSha: '2222222222222222222222222222222222222222',
      authorityEventId: 'E-MERGES'
    }
  ]
};
const flowPolicy = structuredClone(flowEvents);

const scoreboard = {
  schemaVersion: 1,
  mode: 'execution_reset',
  ledger: {
    total: 4,
    closed: 2,
    openOrPending: 2,
    byCategory: {
      PB: { total: 1, closed: 0 },
      RB: { total: 1, closed: 0 },
      QG: { total: 1, closed: 1 },
      DEBT: { total: 1, closed: 1 }
    }
  },
  delivery: { activeImplementationPackage: null },
  productOutcome: { pbClosed: 0, rbClosed: 0, status: 'not_proven' },
  flowControl: {
    maxActiveImplementationPackages: 1,
    mergedPullRequestsWithoutLedgerClosure: 2,
    mergedPullRequestRefs: ['#1', '#2'],
    stopReviewThreshold: 2
  },
  decision: { nextAction: 'rebaseline_before_new_package' }
};

const status = `
### 1.1 复盘整改进度

\`\`\`text
execution_mode: execution_reset
ledger_closed: 2/4
pb_closed: 0/1
rb_closed: 0/1
active_implementation_package: none
merged_prs_without_ledger_closure: 2
stop_review_threshold: 2
next_decision: rebaseline_before_new_package
\`\`\`

### 1.2 历史
`;
const program = 'target_issue_ids expected_ledger_transition merged_prs_without_ledger_closure execution_reset';
const validate = (overrides = {}) => validateProgressState({
  ledgerMarkdown: ledger,
  statusMarkdown: status,
  programMarkdown: program,
  eventLedgerMarkdown: eventLedger,
  flowEvents,
  flowPolicy,
  scoreboard,
  ...overrides
});

test('parses ledger counts by category and state', () => {
  assert.deepEqual(parseIssueLedger(ledger), scoreboard.ledger);
});

test('keeps UI projection acceptance separate from MySQL current uniqueness', () => {
  const ownership = `
| RMD-NOV-VERSION-001 | RB/P1 | version | partial | evidence | owner | package | NOV-CURRENT-01, NOV-CANDIDATE-04 |
| RMD-NOV-UX-001 | RB/P1 | ux | closed | evidence | owner | package | NOV-CANDIDATE-UI-01 |
`;
  assert.doesNotThrow(() => validateNovelCandidateAcceptanceOwnership(ownership));
  assert.throws(
    () => validateNovelCandidateAcceptanceOwnership(ownership.replace('NOV-CANDIDATE-UI-01', 'NOV-CANDIDATE-04')),
    /must own only the E4 current-version UI projection/
  );
  assert.throws(
    () => validateNovelCandidateAcceptanceOwnership(ownership.replace('NOV-CURRENT-01, NOV-CANDIDATE-04', 'NOV-CURRENT-01')),
    /must retain candidate current uniqueness and MySQL acceptance/
  );
});

test('accepts a result-oriented execution reset snapshot', () => {
  const result = validate();
  assert.equal(result.status, 'passed');
});

test('rejects a stale scoreboard', () => {
  const stale = structuredClone(scoreboard);
  stale.ledger.closed = 1;
  assert.throws(
    () => validate({ scoreboard: stale }),
    /scoreboard ledger does not match issue ledger/
  );
});

test('rejects completion percentages in the current progress section', () => {
  const withPercentage = `${status}\n## 2. 当前项目完成度：50%`;
  assert.throws(
    () => validate({ statusMarkdown: withPercentage }),
    /cannot present a completion percentage/
  );
});

test('rejects active implementation after the stop-review threshold', () => {
  const active = structuredClone(scoreboard);
  active.delivery.activeImplementationPackage = 'RP-NEXT';
  assert.throws(
    () => validate({ scoreboard: active }),
    /cannot have an active implementation package/
  );
});

test('rejects a stalled pull request count that does not match flow events', () => {
  const tampered = structuredClone(scoreboard);
  tampered.flowControl.mergedPullRequestsWithoutLedgerClosure = 0;
  assert.throws(() => validate({ scoreboard: tampered }), /count does not match flow events/);
});

test('rejects an active package whenever mode is execution_reset', () => {
  const active = structuredClone(scoreboard);
  active.flowControl.stopReviewThreshold = 3;
  active.delivery.activeImplementationPackage = 'RP-BYPASS';
  assert.throws(() => validate({ scoreboard: active }), /cannot have an active implementation package/);
});

test('rejects issue ledger summary drift', () => {
  const summaryDrift = ledger.replace('| 合计 | 4 | 2 |', '| 合计 | 41 | 8 |');
  assert.throws(() => validate({ ledgerMarkdown: summaryDrift }), /total summary does not match issue rows/);
});

test('rejects product outcome drift from PB and RB issue rows', () => {
  const outcomeDrift = structuredClone(scoreboard);
  outcomeDrift.productOutcome = { pbClosed: 1, rbClosed: 1, status: 'proven' };
  assert.throws(() => validate({ scoreboard: outcomeDrift }), /product outcome does not match issue ledger/);
});

test('rejects a flow event missing from the event ledger', () => {
  assert.throws(
    () => validate({ eventLedgerMarkdown: eventLedger.replace('merged_pr_2:', 'removed_pr_2:') }),
    /merge tuple mismatch: PR #2/
  );
});

test('rejects deleting a reviewed merged PR even when projections are synchronized', () => {
  const shortenedEvents = structuredClone(flowEvents);
  shortenedEvents.events.pop();
  const shortenedScoreboard = structuredClone(scoreboard);
  shortenedScoreboard.flowControl.mergedPullRequestsWithoutLedgerClosure = 1;
  shortenedScoreboard.flowControl.mergedPullRequestRefs = ['#1'];
  assert.throws(
    () => validate({ flowEvents: shortenedEvents, scoreboard: shortenedScoreboard }),
    /do not match the reviewed repository flow policy/
  );
});

test('rejects an appended fake closure checkpoint', () => {
  const fakeClosure = structuredClone(flowEvents);
  fakeClosure.events.push({
    id: 'fake-closure',
    type: 'ledger_closure',
    authorityEventId: 'E-CLOSE',
    issueId: 'RMD-C',
    closureHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    closedCountAfterEvent: 2
  });
  assert.throws(() => validate({ flowEvents: fakeClosure }), /do not match the reviewed repository flow policy/);
});

test('rejects swapped PR and merge SHA tuples', () => {
  const swapped = structuredClone(flowEvents);
  [swapped.events[1].mergeSha, swapped.events[2].mergeSha] = [
    swapped.events[2].mergeSha,
    swapped.events[1].mergeSha
  ];
  assert.throws(() => validate({ flowEvents: swapped }), /do not match the reviewed repository flow policy/);
});

test('the repository progress assets pass the gate', () => {
  assert.equal(validateProgressFiles().status, 'passed');
});
