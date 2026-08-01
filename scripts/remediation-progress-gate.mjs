import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VALID_STATUSES = new Set([
  'open',
  'implemented_pending_verification',
  'partial',
  'verification_gap',
  'closed'
]);
const CATEGORIES = ['PB', 'RB', 'QG', 'DEBT'];
export const REPOSITORY_FLOW_POLICY = {
  schemaVersion: 1,
  events: [
    {
      id: 'ledger-closure-checkpoint-2026-07-15',
      type: 'ledger_closure',
      authorityEventId: 'MCE-20260713-RP01C-CLOSE-CI-VERIFY',
      issueId: 'RMD-TEST-FIXTURE-001',
      closureHead: 'bdfa8142c4f9f13ce047c1f4faeb56fcbaa0d192',
      closedCountAfterEvent: 9
    },
    {
      id: 'pr-51-merged',
      type: 'pull_request_merged',
      pullRequest: 51,
      mergeSha: 'dc193dbbd3ac1970f571fd618f12902a4033994c',
      authorityEventId: 'MCE-20260723-RP02B2A2-FINAL-ACCEPTED'
    },
    {
      id: 'pr-53-merged',
      type: 'pull_request_merged',
      pullRequest: 53,
      mergeSha: '9f04986469a3e409b3ce887390e8830cbdfe9493',
      authorityEventId: 'MCE-20260723-RP02B2A2-FINAL-ACCEPTED'
    },
    {
      id: 'pr-55-merged',
      type: 'pull_request_merged',
      pullRequest: 55,
      mergeSha: 'b77496d57aaffaaa229769be276a86d967a64af6',
      authorityEventId: 'MCE-20260801-RESULT-PROGRESS-RESET'
    },
    {
      id: 'pr-56-merged',
      type: 'pull_request_merged',
      pullRequest: 56,
      mergeSha: '0ff9107bbfbf95983ae8c21391754520f4374711',
      authorityEventId: 'MCE-20260801-RESULT-PROGRESS-RESET'
    },
    {
      id: 'pr-57-merged',
      type: 'pull_request_merged',
      pullRequest: 57,
      mergeSha: '8940d6dda29f6cdcfd9b272f317f6fc5d4f5e766',
      authorityEventId: 'MCE-20260801-RESULT-PROGRESS-RESET'
    }
  ]
};

function fail(message) {
  throw new Error(`remediation progress gate: ${message}`);
}

export function parseIssueLedger(markdown) {
  const issues = [];
  for (const line of markdown.split('\n')) {
    if (!/^\|\s*RMD-/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    const [id, classification, , status] = cells;
    const [category] = classification.split('/');
    if (!id || !CATEGORIES.includes(category) || !VALID_STATUSES.has(status)) {
      fail(`invalid issue row: ${line}`);
    }
    issues.push({ id, category, status });
  }
  if (issues.length === 0) fail('issue ledger has no issue rows');
  if (new Set(issues.map(({ id }) => id)).size !== issues.length) fail('issue ledger contains duplicate ids');

  const byCategory = Object.fromEntries(CATEGORIES.map((category) => [category, { total: 0, closed: 0 }]));
  for (const issue of issues) {
    byCategory[issue.category].total += 1;
    if (issue.status === 'closed') byCategory[issue.category].closed += 1;
  }
  const closed = issues.filter(({ status }) => status === 'closed').length;
  const summary = {};
  for (const line of markdown.split('\n')) {
    const match = /^\|\s*(PB|RB|QG|DEBT|合计)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|$/.exec(line);
    if (match) summary[match[1]] = { total: Number(match[2]), closed: Number(match[3]) };
  }
  for (const category of CATEGORIES) {
    if (JSON.stringify(summary[category]) !== JSON.stringify(byCategory[category])) {
      fail(`issue ledger ${category} summary does not match issue rows`);
    }
  }
  if (JSON.stringify(summary['合计']) !== JSON.stringify({ total: issues.length, closed })) {
    fail('issue ledger total summary does not match issue rows');
  }
  return { total: issues.length, closed, openOrPending: issues.length - closed, byCategory };
}

function parseEventBlocks(markdown) {
  const events = new Map();
  for (const match of markdown.matchAll(/```text\r?\n([\s\S]*?)\r?\n```/g)) {
    const block = match[1];
    const id = /^event_id:\s*(\S+)$/m.exec(block)?.[1];
    if (!id) continue;
    if (events.has(id)) fail(`event ledger contains duplicate event_id ${id}`);
    events.set(id, block);
  }
  return events;
}

function eventField(block, name) {
  return new RegExp(`^${name}:\\s*(.+)$`, 'm').exec(block)?.[1].trim();
}

export function parseFlowEvents(flowEvents, eventLedgerMarkdown, flowPolicy = REPOSITORY_FLOW_POLICY) {
  if (flowEvents.schemaVersion !== 1 || !Array.isArray(flowEvents.events)) {
    fail('flow events must use schemaVersion 1 and an events array');
  }
  if (JSON.stringify(flowEvents) !== JSON.stringify(flowPolicy)) {
    fail('flow events do not match the reviewed repository flow policy');
  }
  const authorityEvents = parseEventBlocks(eventLedgerMarkdown);
  const seenIds = new Set();
  let lastClosureIndex = -1;
  flowEvents.events.forEach((event, index) => {
    if (!event.id || seenIds.has(event.id)) fail('flow events require unique ids');
    seenIds.add(event.id);
    const authorityBlock = authorityEvents.get(event.authorityEventId);
    if (!authorityBlock) fail(`event ledger is missing authority event ${event.authorityEventId}`);
    if (event.type === 'ledger_closure') {
      lastClosureIndex = index;
      if (
        eventField(authorityBlock, 'closure_issue_id') !== event.issueId
        || eventField(authorityBlock, 'closure_head') !== event.closureHead
        || eventField(authorityBlock, 'closure_ledger_closed') !== String(event.closedCountAfterEvent)
      ) {
        fail(`ledger closure authority mismatch: ${event.id}`);
      }
    }
    if (event.type === 'pull_request_merged') {
      if (!Number.isInteger(event.pullRequest) || event.pullRequest < 1 || !/^[0-9a-f]{40}$/.test(event.mergeSha ?? '')) {
        fail(`invalid merged pull request event: ${event.id}`);
      }
      if (eventField(authorityBlock, `merged_pr_${event.pullRequest}`) !== event.mergeSha) {
        fail(`event ledger merge tuple mismatch: PR #${event.pullRequest} / ${event.mergeSha}`);
      }
    }
  });
  if (lastClosureIndex < 0) fail('flow events are missing a ledger_closure checkpoint');
  const merged = flowEvents.events
    .slice(lastClosureIndex + 1)
    .filter(({ type }) => type === 'pull_request_merged');
  return {
    mergedPullRequestsWithoutLedgerClosure: merged.length,
    refs: merged.map(({ pullRequest }) => `#${pullRequest}`)
  };
}

function progressSection(markdown) {
  const match = /### 1\.1 复盘整改进度([\s\S]*?)(?=\n### |\n## 2\.)/.exec(markdown);
  if (!match) fail('main-control status is missing section 1.1');
  return match[1];
}

function marker(markdown, name) {
  const match = new RegExp(`^${name}:\\s*(.+)$`, 'm').exec(markdown);
  if (!match) fail(`main-control status is missing ${name}`);
  return match[1].trim();
}

function assertJsonEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} does not match issue ledger`);
  }
}

export function validateProgressState({
  ledgerMarkdown,
  statusMarkdown,
  programMarkdown,
  eventLedgerMarkdown,
  flowEvents,
  flowPolicy = REPOSITORY_FLOW_POLICY,
  scoreboard
}) {
  const ledger = parseIssueLedger(ledgerMarkdown);
  if (scoreboard.schemaVersion !== 1) fail('scoreboard schemaVersion must be 1');
  assertJsonEqual(scoreboard.ledger, ledger, 'scoreboard ledger');

  const flow = parseFlowEvents(flowEvents, eventLedgerMarkdown, flowPolicy);

  const threshold = scoreboard.flowControl?.stopReviewThreshold;
  const stalledPullRequests = flow.mergedPullRequestsWithoutLedgerClosure;
  if (!Number.isInteger(threshold) || threshold < 1) fail('stopReviewThreshold must be a positive integer');
  if (scoreboard.flowControl?.mergedPullRequestsWithoutLedgerClosure !== stalledPullRequests) {
    fail('scoreboard stalled pull request count does not match flow events');
  }
  assertJsonEqual(scoreboard.flowControl?.mergedPullRequestRefs, flow.refs, 'scoreboard stalled pull request refs');
  if (scoreboard.flowControl?.maxActiveImplementationPackages !== 1) {
    fail('maxActiveImplementationPackages must be 1');
  }
  if (scoreboard.mode === 'execution_reset' && scoreboard.delivery?.activeImplementationPackage !== null) {
    fail('execution_reset mode cannot have an active implementation package');
  }
  if (stalledPullRequests >= threshold) {
    if (scoreboard.mode !== 'execution_reset') fail('stop-review threshold requires execution_reset mode');
  }

  const pbClosed = ledger.byCategory.PB.closed;
  const rbClosed = ledger.byCategory.RB.closed;
  const outcomeStatus = pbClosed === 0 && rbClosed === 0
    ? 'not_proven'
    : pbClosed === ledger.byCategory.PB.total && rbClosed === ledger.byCategory.RB.total
      ? 'proven'
      : 'partial';
  assertJsonEqual(
    scoreboard.productOutcome,
    { pbClosed, rbClosed, status: outcomeStatus },
    'scoreboard product outcome'
  );

  const section = progressSection(statusMarkdown);
  if (/总体关闭进度|\d+\s*[%％]/.test(statusMarkdown)) {
    fail('main-control status cannot present a completion percentage');
  }
  if (statusMarkdown.includes('尚待本次 closeout commit/push')) fail('main-control status still claims E3 closeout is pending');

  const expectedMarkers = {
    execution_mode: scoreboard.mode,
    ledger_closed: `${ledger.closed}/${ledger.total}`,
    pb_closed: `${ledger.byCategory.PB.closed}/${ledger.byCategory.PB.total}`,
    rb_closed: `${ledger.byCategory.RB.closed}/${ledger.byCategory.RB.total}`,
    active_implementation_package: scoreboard.delivery.activeImplementationPackage ?? 'none',
    merged_prs_without_ledger_closure: String(stalledPullRequests),
    stop_review_threshold: String(threshold),
    next_decision: scoreboard.decision?.nextAction
  };
  for (const [name, expected] of Object.entries(expectedMarkers)) {
    if (marker(section, name) !== expected) fail(`${name} does not match scoreboard`);
  }

  const requiredProgramTokens = [
    'target_issue_ids',
    'expected_ledger_transition',
    'merged_prs_without_ledger_closure',
    'execution_reset'
  ];
  for (const token of requiredProgramTokens) {
    if (!programMarkdown.includes(token)) fail(`remediation program is missing ${token}`);
  }
  return { status: 'passed', ledger, mode: scoreboard.mode, stalledPullRequests, threshold };
}

export function validateProgressFiles(root = process.cwd()) {
  const read = (path) => readFileSync(resolve(root, path), 'utf8');
  return validateProgressState({
    ledgerMarkdown: read('docs/remediation/issue-ledger.md'),
    statusMarkdown: read('docs/reviews/main-control-status.md'),
    programMarkdown: read('docs/remediation/remediation-program.md'),
    eventLedgerMarkdown: read('docs/reviews/main-control-event-ledger.md'),
    flowEvents: JSON.parse(read('docs/remediation/execution-flow-events.json')),
    scoreboard: JSON.parse(read('docs/remediation/execution-scoreboard.json'))
  });
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    console.log(JSON.stringify(validateProgressFiles(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
