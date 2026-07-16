import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export class GovernanceFailure extends Error {}

export const DEFAULT_GIT_BUDGET = { maxFiles: 20, maxNetAdditions: 2000 };
export const DEFAULT_SLA_LIMITS = { devToTestSeconds: 15 * 60, testToMcSeconds: 30 * 60 };
export const SLA_SUCCESS = 'passed';
export const SLA_WAIVERS = new Set(['waived', 'accepted_with_reason']);

export function analyzeGitBudget({
  entries,
  adrPaths = [],
  limits = DEFAULT_GIT_BUDGET,
  applicableCommit,
  now = new Date()
}) {
  const uniqueFiles = Array.from(new Set(entries.map((entry) => entry.file).filter(Boolean)));
  const totals = sumNumstat(entries);
  const violations = [];
  if (uniqueFiles.length > limits.maxFiles) violations.push(`changed_files:${uniqueFiles.length}>${limits.maxFiles}`);
  if (totals.netAdditions > limits.maxNetAdditions) {
    violations.push(`net_additions:${totals.netAdditions}>${limits.maxNetAdditions}`);
  }

  const context = {
    changedFiles: uniqueFiles,
    fileCount: uniqueFiles.length,
    netAdditions: totals.netAdditions,
    violations,
    applicableCommit,
    now
  };
  const ignoredAdrPaths = violations.length === 0 ? adrPaths : [];
  const adrApprovals = violations.length > 0 ? adrPaths.map((adrPath) => validateAdr(adrPath, context)) : [];
  if (violations.length > 0 && adrApprovals.length === 0) {
    throw new GovernanceFailure(`Git budget exceeded: ${violations.join('; ')}. Provide --adr <docs/adr/...md>.`);
  }

  return {
    fileCount: uniqueFiles.length,
    files: uniqueFiles,
    additions: totals.additions,
    deletions: totals.deletions,
    netAdditions: totals.netAdditions,
    binaryOrUnscored: entries.filter((entry) => entry.binaryOrUnscored).map((entry) => entry.file),
    violations,
    adrApprovals,
    ignoredAdrPaths,
    passed: violations.length === 0 || adrApprovals.length > 0
  };
}

export function analyzeSlaReceipt(receiptText, { limits = DEFAULT_SLA_LIMITS, now = new Date() } = {}) {
  const fields = parseKeyValueBlock(receiptText);
  const required = [
    'package_id',
    'dev_completed_at',
    'test_dispatched_at',
    'test_completed_at',
    'mc_decided_at',
    'dev_to_test_elapsed',
    'test_to_mc_elapsed',
    'dev_to_test_sla_result',
    'test_to_mc_sla_result',
    'timeout_reason'
  ];
  const missing = required.filter((field) => !fields[field]);
  if (missing.length > 0) throw new GovernanceFailure(`SLA receipt missing fields: ${missing.join(', ')}`);

  const devCompletedAt = parseCstTimestamp(fields.dev_completed_at);
  const testDispatchedAt = parseCstTimestamp(fields.test_dispatched_at);
  const testCompletedAt = parseCstTimestamp(fields.test_completed_at);
  const mcDecidedAt = parseCstTimestamp(fields.mc_decided_at);
  assertNotFuture([devCompletedAt, testDispatchedAt, testCompletedAt, mcDecidedAt], now);
  assertOrdered([devCompletedAt, testDispatchedAt, testCompletedAt, mcDecidedAt]);

  const devToTestSeconds = secondsBetween(devCompletedAt, testDispatchedAt);
  const testToMcSeconds = secondsBetween(testCompletedAt, mcDecidedAt);
  const expectedDevToTest = formatDuration(devToTestSeconds);
  const expectedTestToMc = formatDuration(testToMcSeconds);
  const devToTestPassed = devToTestSeconds <= limits.devToTestSeconds;
  const testToMcPassed = testToMcSeconds <= limits.testToMcSeconds;
  const problems = [];
  validateSlaResult('dev_to_test', fields.dev_to_test_sla_result, devToTestPassed, fields.timeout_reason, problems);
  validateSlaResult('test_to_mc', fields.test_to_mc_sla_result, testToMcPassed, fields.timeout_reason, problems);
  if (fields.dev_to_test_elapsed !== expectedDevToTest) {
    problems.push(`dev_to_test_elapsed ${fields.dev_to_test_elapsed} != ${expectedDevToTest}`);
  }
  if (fields.test_to_mc_elapsed !== expectedTestToMc) {
    problems.push(`test_to_mc_elapsed ${fields.test_to_mc_elapsed} != ${expectedTestToMc}`);
  }
  if (problems.length > 0) throw new GovernanceFailure(`SLA receipt invalid: ${problems.join('; ')}`);

  return {
    packageId: fields.package_id,
    devToTestSeconds,
    testToMcSeconds,
    devToTestElapsed: expectedDevToTest,
    testToMcElapsed: expectedTestToMc,
    devToTestPassed,
    testToMcPassed
  };
}

export function parseNumstatZ(bufferOrText) {
  const text = Buffer.isBuffer(bufferOrText) ? bufferOrText.toString('utf8') : String(bufferOrText);
  const tokens = text.split('\0').filter((token) => token.length > 0);
  const entries = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const parts = token.split('\t');
    if (parts.length < 3) continue;
    const [added, deleted, ...pathParts] = parts;
    let file = pathParts.join('\t');
    let oldFile;
    if (file === '') {
      oldFile = tokens[++index];
      file = tokens[++index];
    }
    const binaryOrUnscored = added === '-' || deleted === '-';
    entries.push({
      file,
      oldFile,
      additions: binaryOrUnscored ? 0 : Number.parseInt(added, 10),
      deletions: binaryOrUnscored ? 0 : Number.parseInt(deleted, 10),
      binaryOrUnscored
    });
  }
  return entries;
}

export function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m${String(seconds).padStart(2, '0')}s`;
}

function sumNumstat(entries) {
  const additions = entries.reduce((sum, entry) => sum + safeNumber(entry.additions), 0);
  const deletions = entries.reduce((sum, entry) => sum + safeNumber(entry.deletions), 0);
  return { additions, deletions, netAdditions: Math.max(0, additions - deletions) };
}

function validateAdr(adrPath, context) {
  if (!adrPath.startsWith('docs/adr/') || !adrPath.endsWith('.md')) {
    throw new GovernanceFailure(`ADR path must be under docs/adr/*.md: ${adrPath}`);
  }
  if (!existsSync(adrPath)) throw new GovernanceFailure(`ADR file does not exist: ${adrPath}`);
  if (!context.changedFiles.includes(adrPath)) {
    throw new GovernanceFailure(`ADR file must belong to this diff: ${adrPath}`);
  }
  const fields = parseKeyValueBlock(readFileSync(adrPath, 'utf8'));
  return validateAdrFields(fields, context, adrPath);
}

export function validateAdrFields(fields, context, adrPath = 'ADR') {
  const required = ['package_id', 'exceeded_budget', 'actual_files', 'actual_net_additions', 'split_reason', 'owner'];
  const missing = required.filter((field) => !fields[field]);
  if (!fields.valid_until && !fields.applies_to_commit) missing.push('valid_until_or_applies_to_commit');
  if (missing.length > 0) throw new GovernanceFailure(`ADR missing fields: ${adrPath}: ${missing.join(', ')}`);

  const actualFiles = Number(fields.actual_files);
  const actualNetAdditions = Number(fields.actual_net_additions);
  if (!Number.isInteger(actualFiles) || !Number.isInteger(actualNetAdditions)) {
    throw new GovernanceFailure(`ADR actual_files and actual_net_additions must be integers: ${adrPath}`);
  }
  if (actualFiles !== context.fileCount) {
    throw new GovernanceFailure(`ADR actual_files ${actualFiles} does not match current diff fileCount ${context.fileCount}: ${adrPath}`);
  }
  if (actualNetAdditions !== context.netAdditions) {
    throw new GovernanceFailure(
      `ADR actual_net_additions ${actualNetAdditions} does not match current diff netAdditions ${context.netAdditions}: ${adrPath}`
    );
  }

  const expectedViolations = new Set(context.violations.map((violation) => violation.split(':')[0]));
  const declaredViolations = new Set(
    fields.exceeded_budget
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
  if (!setsEqual(expectedViolations, declaredViolations)) {
    throw new GovernanceFailure(
      `ADR exceeded_budget ${Array.from(declaredViolations).join(',')} does not match current violations ${Array.from(
        expectedViolations
      ).join(',')}: ${adrPath}`
    );
  }

  if (fields.valid_until) validateAdrValidUntil(fields.valid_until, context.now, adrPath);
  if (fields.applies_to_commit && fields.applies_to_commit !== context.applicableCommit) {
    throw new GovernanceFailure(
      `ADR applies_to_commit ${fields.applies_to_commit} does not match current commit ${context.applicableCommit || 'unknown'}: ${adrPath}`
    );
  }
  return adrPath;
}

function validateAdrValidUntil(value, now, adrPath) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new GovernanceFailure(`ADR valid_until must be YYYY-MM-DD: ${adrPath}`);
  const [, year, month, day] = match.map(Number);
  const expiry = Date.UTC(year, month - 1, day + 1, 0, 0, 0);
  const parsed = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  if (
    Number.isNaN(expiry) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new GovernanceFailure(`ADR valid_until is invalid: ${adrPath}`);
  }
  if (now.getTime() >= expiry) throw new GovernanceFailure(`ADR valid_until is expired: ${adrPath}`);
}

function setsEqual(left, right) {
  if (left.size !== right.size) return false;
  for (const item of left) {
    if (!right.has(item)) return false;
  }
  return true;
}

function validateSlaResult(prefix, result, passed, timeoutReason, problems) {
  if (passed) {
    if (result !== SLA_SUCCESS) problems.push(`${prefix}_sla_result ${result} != ${SLA_SUCCESS}`);
    return;
  }
  if (!SLA_WAIVERS.has(result)) {
    problems.push(`${prefix}_sla_result ${result} must be waived or accepted_with_reason when over SLA`);
  }
  if (!timeoutReason || timeoutReason === 'N/A') {
    problems.push(`${prefix} timeout_reason must explain over-SLA decision`);
  }
}

function parseKeyValueBlock(text) {
  const fields = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (match) fields[match[1]] = match[2].trim();
  }
  return fields;
}

function parseCstTimestamp(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) CST$/);
  if (!match) throw new GovernanceFailure(`Invalid CST timestamp: ${value}`);
  const [, year, month, day, hour, minute, second] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second));
}

function assertNotFuture(dates, now) {
  for (const date of dates) {
    if (date.getTime() > now.getTime()) throw new GovernanceFailure(`SLA timestamp is in the future: ${date.toISOString()}`);
  }
}

function assertOrdered(dates) {
  for (let index = 1; index < dates.length; index += 1) {
    if (dates[index].getTime() < dates[index - 1].getTime()) throw new GovernanceFailure('SLA timestamps are out of order');
  }
}

function secondsBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 1000);
}

function safeNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function runGitBudgetCli(args) {
  const options = parseCliArgs(args);
  const { entries, degraded, applicableCommit } = collectDiffEntries(options);
  const result = analyzeGitBudget({
    entries,
    adrPaths: options.adr,
    applicableCommit,
    limits: {
      maxFiles: options.maxFiles ?? DEFAULT_GIT_BUDGET.maxFiles,
      maxNetAdditions: options.maxNetAdditions ?? DEFAULT_GIT_BUDGET.maxNetAdditions
    }
  });
  console.log(
    `Git budget passed: files=${result.fileCount}, netAdditions=${result.netAdditions}, binary_or_unscored=${result.binaryOrUnscored.length}`
  );
  if (degraded) console.log(`degraded: ${degraded}`);
  if (result.violations.length > 0) console.log(`ADR override: ${result.adrApprovals.join(', ')}`);
  if (result.ignoredAdrPaths.length > 0) console.log(`ADR ignored: ${result.ignoredAdrPaths.join(', ')}`);
  if (result.binaryOrUnscored.length > 0) console.log(`binary_or_unscored: ${result.binaryOrUnscored.join(', ')}`);
}

function collectDiffEntries(options) {
  if (options.staged) {
    return {
      entries: parseNumstatZ(gitBuffer(['diff', '--cached', '--numstat', '-z'])),
      applicableCommit: gitText(['rev-parse', '--verify', 'HEAD']).trim()
    };
  }
  if (options.worktree) {
    const entries = parseNumstatZ(gitBuffer(['diff', '--numstat', '-z', 'HEAD']));
    entries.push(...collectUntrackedEntries());
    return { entries, applicableCommit: gitText(['rev-parse', '--verify', 'HEAD']).trim() };
  }
  if (options.base && options.head) {
    return {
      entries: parseNumstatZ(gitBuffer(['diff', '--numstat', '-z', options.base, options.head])),
      applicableCommit: gitText(['rev-parse', '--verify', options.head]).trim()
    };
  }
  const fallbackBase = gitText(['rev-parse', '--verify', 'HEAD~1']).trim();
  const fallbackHead = gitText(['rev-parse', '--verify', 'HEAD']).trim();
  return {
    entries: parseNumstatZ(gitBuffer(['diff', '--numstat', '-z', fallbackBase, fallbackHead])),
    applicableCommit: fallbackHead,
    degraded: 'no explicit base/head; using HEAD~1...HEAD'
  };
}

function collectUntrackedEntries() {
  return gitBuffer(['ls-files', '--others', '--exclude-standard', '-z'])
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((file) => {
      const { lines, binaryOrUnscored } = countTextLinesOrBinary(file);
      return { file, additions: lines, deletions: 0, binaryOrUnscored };
    });
}

function countTextLinesOrBinary(file) {
  const buffer = readFileSync(file);
  if (buffer.includes(0)) return { lines: 0, binaryOrUnscored: true };
  return { lines: buffer.toString('utf8').split('\n').length, binaryOrUnscored: false };
}

function runSlaCli(args) {
  if (args.length === 0) throw new GovernanceFailure('Provide at least one receipt file.');
  for (const file of args) {
    const result = analyzeSlaReceipt(readFileSync(file, 'utf8'));
    console.log(
      `SLA receipt passed: ${file} package=${result.packageId} dev_to_test=${result.devToTestElapsed} test_to_mc=${result.testToMcElapsed}`
    );
  }
}

function parseCliArgs(args) {
  const options = { adr: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--staged') options.staged = true;
    else if (arg === '--worktree') options.worktree = true;
    else if (arg === '--base') options.base = args[++index];
    else if (arg === '--head') options.head = args[++index];
    else if (arg === '--adr') options.adr.push(args[++index]);
    else if (arg === '--max-files') options.maxFiles = Number.parseInt(args[++index], 10);
    else if (arg === '--max-net-additions') options.maxNetAdditions = Number.parseInt(args[++index], 10);
    else throw new GovernanceFailure(`Unknown argument: ${arg}`);
  }
  return options;
}

function gitBuffer(args) {
  const result = spawnSync('git', args, { encoding: 'buffer' });
  if (result.status !== 0) throw new GovernanceFailure(result.stderr.toString('utf8') || `git ${args.join(' ')} failed`);
  return result.stdout;
}

function gitText(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new GovernanceFailure(result.stderr || `git ${args.join(' ')} failed`);
  return result.stdout;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [, , command, ...args] = process.argv;
    if (command === 'git-budget') runGitBudgetCli(args);
    else if (command === 'sla') runSlaCli(args);
    else throw new GovernanceFailure('Use command: git-budget | sla');
  } catch (error) {
    if (error instanceof GovernanceFailure) {
      console.error(`Governance check failed: ${error.message}`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
