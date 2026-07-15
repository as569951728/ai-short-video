#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'; import { lstatSync, readFileSync } from 'node:fs'; import { resolve } from 'node:path'; import { TextDecoder } from 'node:util';
const BASELINE_SHA = '501a3cfcdf12341d9f611f0fdd6a6336d4ade483', RANGE_BASELINE = 'range-base', ZERO_SHA = '0'.repeat(40), FALLBACK_PACKAGE_ID = 'RP-01C', FALLBACK_TEST_COMMAND = 'test:rp02b1';
const GATE_ENV_COMMAND = 'env -u DATABASE_URL -u DEEPSEEK_API_KEY -u DEEPSEEK_BASE_URL -u DEEPSEEK_MODEL -u DEEPSEEK_STRUCTURE_MODEL -u DEEPSEEK_REASONER_MODEL -u DEEPSEEK_TIMEOUT_MS -u DEEPSEEK_MAX_RETRIES NODE_ENV=production AI_PROVIDER_MODE=mock DOTENV_CONFIG_PATH=/dev/null';
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const YAML_AST_TO_JSON = String.raw`def convert(node, anchors = {}, resolving = {})
  if node.is_a?(Psych::Nodes::Alias); target = anchors[node.anchor]; raise "unknown YAML alias: #{node.anchor}" unless target; raise "cyclic YAML alias: #{node.anchor}" if resolving[node.anchor]; return convert(target, anchors, resolving); end
  anchor = node.respond_to?(:anchor) ? node.anchor : nil; if anchor && !anchor.empty?; raise "duplicate YAML anchor: #{anchor}" if anchors.key?(anchor) && anchors[anchor] != node; raise "cyclic YAML alias: #{anchor}" if resolving[anchor]; anchors[anchor] = node; resolving[anchor] = true; end
  begin; case node; when Psych::Nodes::Document then raise 'YAML document must have one root node' unless node.children.length == 1; convert(node.children.first, anchors, resolving); when Psych::Nodes::Mapping then result = {}; node.children.each_slice(2) { |key_node, value_node| raise 'YAML mapping keys must be scalars' unless key_node.is_a?(Psych::Nodes::Scalar); key = key_node.value; raise "duplicate YAML mapping key: #{key}" if result.key?(key); result[key] = convert(value_node, anchors, resolving) }; result; when Psych::Nodes::Sequence then node.children.map { |child| convert(child, anchors, resolving) }; when Psych::Nodes::Scalar then node.value; else raise "unsupported YAML node: #{node.class}"; end; ensure resolving.delete(anchor) if anchor && !anchor.empty?; end
end
stream = Psych.parse_stream(STDIN.read); raise 'workflow YAML must contain exactly one document' unless stream.children.length == 1; puts JSON.generate(convert(stream.children.first))`;
const COMMON_GATE_FILES = 'scripts/rp02b2a-package-gate.mjs|scripts/rp02b2a-package-gate.test.mjs|.github/workflows/rp01c-fixtures.yml|package.json'.split('|');
const definition = (packageId, manifestId, adrPath, testCommand, hardMaxFiles, hardMaxNetAdditions, manifest) => ({ packageId, manifestId, adrPath, testCommand, hardMaxFiles, hardMaxNetAdditions, baselinePolicy: packageId === 'RP-02B2a1' ? BASELINE_SHA : RANGE_BASELINE, manifest: new Set(manifest), requiredCategories: ['production', 'test', 'adr'] });
export const PACKAGE_DEFINITIONS = {
  'RP-02B2a1': definition('RP-02B2a1', 'RP-02B2a1-v1', 'docs/adr/rp-02b2a1-registry-abi-budget.md', 'test:rp02b2a1', 18, 1900, [...'packages/shared/src/api.ts|packages/shared/src/novels.ts|apps/api/src/modules/novels/services/actionExecutionPlan.ts|apps/api/src/modules/novels/services/novelService.ts|apps/api/src/modules/tasks/services/taskService.ts|apps/api/src/modules/novels/providers/mockDirectionProvider.ts|apps/api/src/modules/novels/providers/mockStructureProvider.ts|apps/api/src/modules/novels/providers/mockTrialProvider.ts|apps/api/src/modules/novels/providers/mockBodyProvider.ts|apps/api/src/modules/novels/providers/mockFullReviewProvider.ts|apps/api/src/modules/novels/providers/deepseekNovelProvider.ts|apps/api/test/rp01c/fixtureFactory.test.ts|apps/api/test/rp02b2a/registry-provider-abi.test.ts|apps/api/src/modules/novels/novelRoutes.test.ts|docs/adr/rp-02b2a1-registry-abi-budget.md'.split('|'), ...COMMON_GATE_FILES]),
  'RP-02B2a2': definition('RP-02B2a2', 'RP-02B2a2-v1', 'docs/adr/rp-02b2a2-authority-claim-budget.md', 'test:rp02b2a2', 15, 1900, 'packages/shared/src/novels.ts|apps/api/src/modules/novels/domain/executionContract.ts|apps/api/src/modules/novels/domain/novelDomain.ts|apps/api/src/modules/novels/services/actionExecutionPlan.ts|apps/api/src/modules/novels/services/taskClaim.ts|apps/api/src/modules/novels/services/novelService.ts|apps/api/src/modules/novels/routes/novelRoutes.ts|apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts|apps/api/src/modules/novels/repositories/prismaNovelRepository.ts|apps/api/src/app.ts|apps/api/test/rp02b2a/fixtures.ts|apps/api/test/rp02b2a/authority-claim.test.ts|apps/api/src/modules/novels/novelRoutes.test.ts|docs/adr/rp-02b2a2-authority-claim-budget.md|package.json'.split('|')),
  'RP-02B2a3': definition('RP-02B2a3', 'RP-02B2a3-v1', 'docs/adr/rp-02b2a3-lease-retry-budget.md', 'test:rp02b2a3', 14, 1800, 'packages/shared/src/api.ts|packages/shared/src/novels.ts|apps/api/src/modules/novels/domain/executionContract.ts|apps/api/src/modules/novels/domain/novelDomain.ts|apps/api/src/modules/novels/services/actionExecutionPlan.ts|apps/api/src/modules/novels/services/taskClaim.ts|apps/api/src/modules/tasks/services/taskService.ts|apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts|apps/api/src/modules/novels/repositories/prismaNovelRepository.ts|apps/api/src/modules/novels/novelRoutes.test.ts|apps/api/test/rp02b2a/fixtures.ts|apps/api/test/rp02b2a/lease-dispatch-retry.test.ts|docs/adr/rp-02b2a3-lease-retry-budget.md|package.json'.split('|')),
  'RP-02B2a4': definition('RP-02B2a4', 'RP-02B2a4-v1', 'docs/adr/rp-02b2a4-inmemory-finalize-budget.md', 'test:rp02b2a4', 12, 1900, 'packages/shared/src/novels.ts|apps/api/src/modules/novels/domain/executionContract.ts|apps/api/src/modules/novels/domain/novelDomain.ts|apps/api/src/modules/novels/services/actionExecutionPlan.ts|apps/api/src/modules/novels/services/taskClaim.ts|apps/api/src/modules/novels/services/novelService.ts|apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts|apps/api/test/rp02b2a/fixtures.ts|apps/api/test/rp02b2a/inmemory-fenced-finalize.test.ts|apps/api/src/modules/novels/novelRoutes.test.ts|docs/adr/rp-02b2a4-inmemory-finalize-budget.md|package.json'.split('|')),
  'RP-02B2a5': definition('RP-02B2a5', 'RP-02B2a5-v1', 'docs/adr/rp-02b2a5-prisma-nine-six-budget.md', 'test:rp02b2a5', 10, 1900, 'apps/api/src/modules/novels/domain/executionContract.ts|apps/api/src/modules/novels/domain/novelDomain.ts|apps/api/src/modules/novels/services/actionExecutionPlan.ts|apps/api/src/modules/novels/services/taskClaim.ts|apps/api/src/modules/novels/repositories/prismaNovelRepository.ts|apps/api/src/modules/novels/novelRoutes.test.ts|apps/api/test/rp02b2a/fixtures.ts|apps/api/test/rp02b2a/prisma-fenced-finalize.test.ts|docs/adr/rp-02b2a5-prisma-nine-six-budget.md|package.json'.split('|'))
};
export function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]; if (!item.startsWith('--')) continue;
    const value = argv[index + 1]?.startsWith('--') ? 'true' : argv[index + 1] ?? 'true'; args.set(item.slice(2), value); if (value !== 'true') index += 1;
  }
  return args;
}
export function parseAdr(text) { const record = {}; for (const line of text.split(/\r?\n/)) { const match = /^([a-zA-Z0-9_]+):\s*(.+?)\s*$/.exec(line); if (match) record[match[1]] = match[2]; } return record; }
export function analyzePackageGate({ files, netAdditions, adrTextByPath, base, head, worktree = false }) {
  assertUsableSha('BASE', base); assertUsableSha('HEAD', head);
  if (!worktree && base === head) throw new Error('RP-02B2a package gate rejects identical BASE/HEAD');
  const changedFiles = [...new Set(files)].sort(), changedAdrs = changedFiles.filter((file) => file.startsWith('docs/adr/rp-02b2a') && file.endsWith('.md')), touchesManifest = changedFiles.some((file) => Object.values(PACKAGE_DEFINITIONS).some((item) => item.manifest.has(file))); if (changedAdrs.length === 0 && !touchesManifest) return { packageId: FALLBACK_PACKAGE_ID, manifestId: 'none', files: changedFiles.length, netAdditions, adr: 'none', testCommand: FALLBACK_TEST_COMMAND, categories: [...new Set(changedFiles.map(categorizeFile))].sort() };
  if (changedAdrs.length !== 1) throw new Error(`RP-02B2a package gate requires exactly one changed ADR, got ${changedAdrs.length}`);
  const definition = Object.values(PACKAGE_DEFINITIONS).find((item) => item.adrPath === changedAdrs[0]);
  if (!definition) throw new Error(`RP-02B2a package gate found unsupported ADR: ${changedAdrs[0]}`);
  if (definition.baselinePolicy !== RANGE_BASELINE && base !== definition.baselinePolicy) throw new Error(`${definition.packageId} requires fixed baseline ${definition.baselinePolicy}, got ${base}`);
  const outsideManifest = changedFiles.filter((file) => !definition.manifest.has(file));
  if (outsideManifest.length > 0) throw new Error(`${definition.packageId} manifest violation: ${outsideManifest.join(', ')}`);
  if (changedFiles.length > definition.hardMaxFiles) throw new Error(`${definition.packageId} file budget exceeded: ${changedFiles.length}/${definition.hardMaxFiles}`);
  if (netAdditions > definition.hardMaxNetAdditions) throw new Error(`${definition.packageId} net additions budget exceeded: ${netAdditions}/${definition.hardMaxNetAdditions}`);
  const categories = new Set(changedFiles.map(categorizeFile));
  for (const category of definition.requiredCategories) if (!categories.has(category)) throw new Error(`${definition.packageId} missing required ${category} category`);
  const adrText = adrTextByPath?.[definition.adrPath];
  if (!adrText) throw new Error(`${definition.packageId} ADR was changed but not passed to package gate: ${definition.adrPath}`);
  validateAdr({ adr: parseAdr(adrText), definition, base, changedFiles, netAdditions });
  return { packageId: definition.packageId, manifestId: definition.manifestId, files: changedFiles.length, netAdditions, adr: definition.adrPath, testCommand: definition.testCommand, categories: [...categories].sort() };
}
function validateAdr({ adr, definition, base, changedFiles, netAdditions }) {
  const expectedBaseline = definition.baselinePolicy === RANGE_BASELINE ? base : definition.baselinePolicy;
  const expected = { status: 'ready', package_id: definition.packageId, manifest_id: definition.manifestId, baseline_sha: expectedBaseline, hard_max_files: String(definition.hardMaxFiles), hard_max_net_additions: String(definition.hardMaxNetAdditions), actual_files: String(changedFiles.length), actual_net_additions: String(netAdditions) };
  for (const [field, value] of Object.entries(expected)) if (adr[field] !== value) throw new Error(`${definition.packageId} ADR ${field} mismatch: ${adr[field] ?? '<missing>'} != ${value}`);
}
function categorizeFile(file) { if (file.startsWith('docs/adr/')) return 'adr'; if (file.includes('.test.') || file.includes('/test/') || file.endsWith('novelRoutes.test.ts')) return 'test'; if (file.startsWith('scripts/') || file.startsWith('.github/')) return 'governance'; return 'production'; }
function assertUsableSha(label, sha) { if (!sha) throw new Error(`RP-02B2a package gate requires explicit ${label}`); if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error(`RP-02B2a package gate rejects unparseable ${label}: ${sha}`); if (/^0{40}$/.test(sha)) throw new Error(`RP-02B2a package gate rejects zero ${label}`); }
function gitText(args) { return execFileSync('git', args, { encoding: 'utf8' }); }
function gitBuffer(args) { return execFileSync('git', args, { maxBuffer: Infinity }); }
function assertGitCommit(sha) { execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' }); }
export function resolvePackageGateRange(input) {
  const event = input.event;
  if (event === 'pull_request') {
    const baseRef = input.prBaseRef, head = input.prHead;
    if (!baseRef) throw new Error('RP-02B2a package gate requires explicit PR base ref');
    assertUsableSha('PR_HEAD', head); const base = gitText(['merge-base', baseRef, head]).trim(); assertUsableSha('PR_BASE', base);
    return { base, head };
  }
  if (event === 'push') {
    let base = input.pushBefore; const head = input.pushHead, baseRef = input.pushBaseRef, zeroBefore = base === ZERO_SHA, readyAt = (ref, item) => { try { return parseAdr(gitText(['show', `${ref}:${item.adrPath}`])).status === 'ready'; } catch { return false; } }; if (!baseRef) throw new Error('RP-02B2a package gate requires explicit PUSH_BASE_REF'); assertUsableSha('PUSH_HEAD', head); assertGitCommit(head); if (!zeroBefore) assertUsableSha('PUSH_BEFORE', base); const beforeReachable = !zeroBefore && spawnSync('git', ['merge-base', '--is-ancestor', base, head], { stdio: 'ignore' }).status === 0; if (zeroBefore || !beforeReachable) base = gitText(['merge-base', baseRef, head]).trim(); assertUsableSha('PUSH_BASE', base); assertGitCommit(base); const rangeFiles = splitNulBuffer(gitBuffer(['diff', '--name-only', '-z', base, head])).map(decodeGitPath), active = Object.values(PACKAGE_DEFINITIONS).filter((item) => readyAt(head, item)), a1 = PACKAGE_DEFINITIONS['RP-02B2a1'], fixedA1 = active.length === 1 && active[0] === a1; if (fixedA1 && rangeFiles.some((file) => a1.manifest.has(file))) { assertGitCommit(BASELINE_SHA); execFileSync('git', ['merge-base', '--is-ancestor', BASELINE_SHA, head], { stdio: 'ignore' }); base = BASELINE_SHA; }
    return { base, head };
  }
  if (event === 'workflow_dispatch') {
    const base = input.manualBase, head = input.manualHead; assertUsableSha('MANUAL_BASE', base); assertUsableSha('MANUAL_HEAD', head);
    return { base, head };
  }
  throw new Error(`RP-02B2a package gate rejects unsupported event: ${event ?? '<missing>'}`);
}
export function readGitDiff({ base, head, worktree }) {
  assertUsableSha('BASE', base); assertUsableSha('HEAD', head); const effectiveHead = worktree ? gitText(['rev-parse', 'HEAD']).trim() : head; if (worktree && effectiveHead !== head) throw new Error('RP-02B2a package gate explicit HEAD does not match current checkout HEAD'); assertGitCommit(base); assertGitCommit(effectiveHead);
  const range = worktree ? [base] : [base, effectiveHead];
  const numstat = gitBuffer(['diff', '--text', '--find-renames', '--find-copies-harder', '--numstat', '-z', ...range]);
  const files = [], currentPaths = [], stats = [];
  const parts = splitNulBuffer(numstat);
  for (let index = 0; index < parts.length;) {
    const record = parts[index]; index += 1; const firstTab = record.indexOf(0x09);
    const secondTab = firstTab < 0 ? -1 : record.indexOf(0x09, firstTab + 1);
    if (firstTab <= 0 || secondTab <= firstTab + 1) throw new Error('RP-02B2a package gate rejects malformed git numstat record');
    const inlinePath = record.subarray(secondTab + 1);
    if (inlinePath.length > 0) { const path = decodeGitPath(inlinePath); files.push(path); currentPaths.push(path); }
    else {
      if (index + 1 >= parts.length) throw new Error('RP-02B2a package gate rejects incomplete git rename/copy record');
      const oldPath = decodeGitPath(parts[index]), newPath = decodeGitPath(parts[index + 1]); files.push(oldPath, newPath); currentPaths.push(oldPath, newPath);
      index += 2;
    }
    stats.push([record.subarray(0, firstTab), record.subarray(firstTab + 1, secondTab)]);
  }
  const untracked = worktree ? splitNulBuffer(gitBuffer(['ls-files', '--others', '--exclude-standard', '-z'])).map(decodeGitPath) : []; files.push(...untracked); currentPaths.push(...untracked); validateChangedText(currentPaths, effectiveHead, worktree);
  let totalAdded = 0, totalDeleted = 0; for (const [added, deleted] of stats) { totalAdded += parseNumstatCount(added, 'tracked'); totalDeleted += parseNumstatCount(deleted, 'tracked'); } for (const path of untracked) totalAdded += untrackedAdditions(path);
  return { files, netAdditions: Math.max(0, totalAdded - totalDeleted), head: effectiveHead };
}
function splitNulBuffer(buffer) {
  const parts = []; let start = 0;
  for (let index = 0; index < buffer.length; index += 1) { if (buffer[index] !== 0) continue; if (index > start) parts.push(buffer.subarray(start, index)); start = index + 1; }
  if (start !== buffer.length) throw new Error('RP-02B2a package gate rejects unterminated NUL-delimited git output'); return parts;
}
function parseNumstatCount(buffer, label) { const value = buffer.toString('ascii'); if (value === '-') throw new Error(`RP-02B2a package gate rejects ${label} binary/unscored diff`); if (!/^\d+$/.test(value)) throw new Error(`RP-02B2a package gate rejects malformed ${label} count: ${value}`); return Number(value); }
function decodeGitPath(buffer) { try { return UTF8_DECODER.decode(buffer); } catch { throw new Error('RP-02B2a package gate rejects non-UTF-8 git path outside auditable manifest comparison'); } }
function untrackedAdditions(path) {
  const result = spawnSync('git', ['diff', '--text', '--no-index', '--numstat', '-z', '--', '/dev/null', path], { maxBuffer: 10 * 1024 * 1024 }); if (result.error || ![0, 1].includes(result.status)) throw new Error(`RP-02B2a package gate cannot score untracked path: ${path}`);
  if (result.stdout.length === 0) return 0; const record = splitNulBuffer(result.stdout)[0], firstTab = record?.indexOf(0x09) ?? -1, secondTab = firstTab < 0 ? -1 : record.indexOf(0x09, firstTab + 1); if (firstTab <= 0 || secondTab <= firstTab + 1) throw new Error(`RP-02B2a package gate rejects malformed untracked numstat: ${path}`); const added = parseNumstatCount(record.subarray(0, firstTab), `untracked ${path}`), deleted = parseNumstatCount(record.subarray(firstTab + 1, secondTab), `untracked ${path}`); if (deleted !== 0) throw new Error(`RP-02B2a package gate rejects untracked deletion score: ${path}`); return added;
}
function validateChangedText(paths, head, worktree) { for (const path of new Set(paths)) { const bytes = worktree ? readWorktreePath(path) : readCommitPath(head, path); if (bytes === null) continue; let text; try { text = UTF8_DECODER.decode(bytes); } catch { throw new Error(`RP-02B2a package gate rejects invalid UTF-8 text: ${path}`); } for (const char of text) { const code = char.codePointAt(0); if ((code < 0x20 && ![0x09, 0x0a, 0x0d].includes(code)) || (code >= 0x7f && code <= 0x9f)) throw new Error(`RP-02B2a package gate rejects disallowed text control U+${code.toString(16).padStart(4, '0')}: ${path}`); } } }
function readWorktreePath(path) { let stat; try { stat = lstatSync(path); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; } if (!stat.isFile()) throw new Error(`RP-02B2a package gate rejects non-regular worktree path: ${path}`); try { return readFileSync(path); } catch { throw new Error(`RP-02B2a package gate cannot read changed worktree path: ${path}`); } }
function readCommitPath(head, path) { const records = splitNulBuffer(gitBuffer(['ls-tree', '-z', '--full-tree', head, '--', `:(literal)${path}`])); if (records.length === 0) return null; if (records.length !== 1) throw new Error(`RP-02B2a package gate found ambiguous commit path: ${path}`); const tab = records[0].indexOf(0x09), meta = records[0].subarray(0, tab).toString('ascii').split(' '); if (tab < 0 || !['100644', '100755'].includes(meta[0]) || meta[1] !== 'blob' || !/^[0-9a-f]{40,64}$/.test(meta[2] ?? '')) throw new Error(`RP-02B2a package gate rejects non-regular commit path: ${path}`); return gitBuffer(['cat-file', 'blob', meta[2]]); }
function readAdrText(path, head, worktree) { let bytes; try { bytes = worktree ? readFileSync(resolve(path)) : gitBuffer(['show', `${head}:${path}`]); } catch { throw new Error(`RP-02B2a package gate cannot read ADR from ${worktree ? 'worktree' : 'selected HEAD'}: ${path}`); } try { return UTF8_DECODER.decode(bytes); } catch { throw new Error(`RP-02B2a package gate rejects invalid UTF-8 ADR: ${path}`); } }
export function verifyWorkflowContract({ workflowPath, packageId, testCommand, triggerFile }) {
  const workflow = parseWorkflowYaml(workflowPath); assertNoDefaultShell(workflow, 'workflow');
  const triggers = requireMapping(workflow.on, 'workflow on'), dispatch = requireMapping(triggers.workflow_dispatch, 'workflow_dispatch'), inputs = requireMapping(dispatch.inputs, 'workflow_dispatch inputs');
  const baseInput = requireMapping(inputs.base_sha, 'workflow_dispatch base_sha'), headInput = requireMapping(inputs.head_sha, 'workflow_dispatch head_sha');
  if (baseInput.required !== 'true' || headInput.required !== 'true') throw new Error('RP-02B2a workflow requires base_sha/head_sha');
  const requiredFiles = [...new Set(Object.values(PACKAGE_DEFINITIONS).flatMap((item) => [...item.manifest]))];
  for (const event of ['push', 'pull_request']) {
    const eventConfig = requireMapping(triggers[event], `workflow ${event}`);
    const paths = requireSequence(eventConfig.paths, `workflow ${event} paths`);
    if (paths.length === 0) throw new Error(`RP-02B2a workflow missing ${event} paths`);
    for (const file of requiredFiles) {
      if (!paths.some((pattern) => workflowPathCovers(pattern, file))) throw new Error(`RP-02B2a workflow ${event} missing required path: ${file}`);
    }
    if (triggerFile && !paths.some((pattern) => workflowPathCovers(pattern, triggerFile))) throw new Error(`RP-02B2a workflow ${event} skips changed file: ${triggerFile}`);
  }
  const jobs = requireMapping(workflow.jobs, 'workflow jobs'), job = requireMapping(jobs['rp01c-fixtures'], 'rp01c-fixtures job'); assertNoDefaultShell(job, 'job');
  const steps = requireSequence(job.steps, 'rp01c-fixtures steps').map((step, index) => requireMapping(step, `rp01c-fixtures step ${index + 1}`));
  const checkout = findSingleStep(steps, (step) => step.uses === 'actions/checkout@v4', 'actions/checkout@v4');
  const checkoutWith = requireMapping(checkout.with, 'actions/checkout@v4 with');
  const expectedCheckoutRef = "${{ github.event_name == 'workflow_dispatch' && inputs.head_sha || github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.event.after }}";
  if (checkoutWith.ref !== expectedCheckoutRef || checkoutWith.ref.includes('github.sha')) throw new Error('RP-02B2a workflow checkout ref is not bound to selected head');
  const rangeStep = findNamedStep(steps, 'Resolve B2a1 package gate range'), resolverStep = findNamedStep(steps, 'Resolve B2a package command'), selfCheckStep = findNamedStep(steps, 'Verify B2a workflow contract');
  const selectedTestStep = findSingleStep(steps, (step) => typeof step.run === 'string' && step.run.includes('npm run') && step.run.includes('steps.b2a-package.outputs.test_command'), 'selected package command');
  assertShellBlock(rangeStep, rangeCommands(), 'range resolver');
  assertShellBlock(resolverStep, ['set -euo pipefail', `${GATE_ENV_COMMAND} node scripts/rp02b2a-package-gate.mjs --github-output --base "\${{ steps.b2a1-range.outputs.base }}" --head "\${{ steps.b2a1-range.outputs.head }}" >> "$GITHUB_OUTPUT"`], 'package resolver');
  assertShellBlock(selfCheckStep, [`${GATE_ENV_COMMAND} node scripts/rp02b2a-package-gate.mjs --verify-workflow .github/workflows/rp01c-fixtures.yml --package-id "\${{ steps.b2a-package.outputs.package_id }}" --test-command "\${{ steps.b2a-package.outputs.test_command }}"`], 'workflow self-check');
  assertShellBlock(selectedTestStep, [`${GATE_ENV_COMMAND} npm run "\${{ steps.b2a-package.outputs.test_command }}"`], 'selected package command');
  for (const step of [rangeStep, resolverStep, selfCheckStep, selectedTestStep]) assertRequiredStepEnabled(step);
  if (packageId || testCommand) { const definition = PACKAGE_DEFINITIONS[packageId], fallback = packageId === FALLBACK_PACKAGE_ID && testCommand === FALLBACK_TEST_COMMAND; if ((!definition || definition.testCommand !== testCommand) && !fallback) throw new Error(`RP-02B2a workflow package command mismatch: ${packageId}/${testCommand}`); }
  return { requiredFiles: requiredFiles.length };
}
function workflowPathCovers(pattern, file) { if (typeof pattern !== 'string') return false; if (pattern.endsWith('/**')) return file.startsWith(pattern.slice(0, -3)); if (pattern.endsWith('.*')) return file.startsWith(pattern.slice(0, -1)); return pattern === file; }
function rangeCommands() { return ['set -euo pipefail', 'if [[ "${{ github.event_name }}" == "pull_request" ]]; then', 'git fetch --no-tags --prune origin "+refs/heads/${{ github.event.pull_request.base.ref }}:refs/remotes/origin/${{ github.event.pull_request.base.ref }}"', GATE_ENV_COMMAND + ' node scripts/rp02b2a-package-gate.mjs --print-range --event pull_request --pr-base-ref "origin/${{ github.event.pull_request.base.ref }}" --pr-head "${{ github.event.pull_request.head.sha }}" >> "$GITHUB_OUTPUT"', 'elif [[ "${{ github.event_name }}" == "push" ]]; then', 'git fetch --no-tags --prune origin "+refs/heads/${{ github.event.repository.default_branch }}:refs/remotes/origin/${{ github.event.repository.default_branch }}"; ' + GATE_ENV_COMMAND + ' node scripts/rp02b2a-package-gate.mjs --print-range --event push --push-base-ref "origin/${{ github.event.repository.default_branch }}" --push-before "${{ github.event.before }}" --push-head "${{ github.event.after }}" >> "$GITHUB_OUTPUT"', 'else', GATE_ENV_COMMAND + ' node scripts/rp02b2a-package-gate.mjs --print-range --event workflow_dispatch --manual-base "${{ inputs.base_sha }}" --manual-head "${{ inputs.head_sha }}" >> "$GITHUB_OUTPUT"', 'fi', 'BASE="$(grep \'^base=\' "$GITHUB_OUTPUT" | tail -n1 | cut -d= -f2-)"', 'HEAD="$(grep \'^head=\' "$GITHUB_OUTPUT" | tail -n1 | cut -d= -f2-)"', 'if [[ -z "$BASE" || -z "$HEAD" || "$BASE" =~ ^0+$ || "$HEAD" =~ ^0+$ ]]; then', 'echo "B2a1 package gate requires explicit non-zero BASE/HEAD" >&2', 'exit 1', 'fi', 'test "$(git rev-parse HEAD)" = "$(git rev-parse "$HEAD")"']; }
function assertShellBlock(step, expected, label) { const actual = requireRun(step).split(/\r?\n/).map((line) => line.trim()).filter(Boolean); if (actual.length !== expected.length || actual.some((line, index) => line !== expected[index])) throw new Error(`RP-02B2a workflow ${label} shell semantics mismatch`); }
function parseWorkflowYaml(workflowPath) {
  const workflowText = readFileSync(resolve(workflowPath), 'utf8'); let json;
  try {
    json = execFileSync('ruby', ['-W0', '-rpsych', '-rjson', '-e', YAML_AST_TO_JSON], { input: workflowText, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  } catch (error) {
    const detail = error?.stderr?.toString().trim() || error?.message || String(error); throw new Error(`RP-02B2a workflow YAML structure parse failed: ${detail}`);
  }
  try { return requireMapping(JSON.parse(json), 'workflow root'); }
  catch (error) { if (error instanceof SyntaxError) throw new Error(`RP-02B2a workflow YAML parser returned invalid JSON: ${error.message}`); throw error; }
}
function requireMapping(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`RP-02B2a ${label} must be a YAML mapping`); return value; }
function requireSequence(value, label) { if (!Array.isArray(value)) throw new Error(`RP-02B2a ${label} must be a YAML sequence`); return value; }
function findNamedStep(steps, name) { return findSingleStep(steps, (step) => step.name === name, `step named ${name}`); }
function findSingleStep(steps, predicate, label) { const matches = steps.filter(predicate); if (matches.length !== 1) throw new Error(`RP-02B2a workflow requires exactly one ${label}, got ${matches.length}`); return matches[0]; }
function requireRun(step) { if (typeof step.run !== 'string' || step.run.length === 0) throw new Error(`RP-02B2a workflow step ${step.name ?? '<unnamed>'} requires structured run command`); return step.run; }
function assertNoDefaultShell(owner, label) { const defaults = owner.defaults; if (defaults === undefined) return; const run = requireMapping(defaults, `${label} defaults`).run; if (run !== undefined && Object.hasOwn(requireMapping(run, `${label} defaults.run`), 'shell')) throw new Error(`RP-02B2a workflow rejects ${label} defaults.run.shell`); }
function assertRequiredStepEnabled(step) { if (Object.hasOwn(step, 'shell')) throw new Error('RP-02B2a workflow required step rejects custom shell'); if (Object.hasOwn(step, 'if') || (Object.hasOwn(step, 'continue-on-error') && step['continue-on-error'] !== 'false')) throw new Error('RP-02B2a workflow required step is disabled'); }
export function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.has('verify-workflow')) {
    const result = verifyWorkflowContract({ workflowPath: args.get('verify-workflow'), packageId: args.get('package-id'), testCommand: args.get('test-command'), triggerFile: args.get('trigger-file') });
    console.log(`workflow_contract=passed required_files=${result.requiredFiles}`); return;
  }
  if (args.get('print-range') === 'true') {
    const range = resolvePackageGateRange({ event: args.get('event'), prBaseRef: args.get('pr-base-ref'), prHead: args.get('pr-head'), pushBaseRef: args.get('push-base-ref'), pushBefore: args.get('push-before'), pushHead: args.get('push-head'), manualBase: args.get('manual-base'), manualHead: args.get('manual-head') });
    console.log(`base=${range.base}`); console.log(`head=${range.head}`); return;
  }
  const base = args.get('base'), head = args.get('head'), worktree = args.get('worktree') === 'true';
  const { files, netAdditions, head: effectiveHead } = readGitDiff({ base, head, worktree });
  const changedAdrs = files.filter((file) => file.startsWith('docs/adr/rp-02b2a') && file.endsWith('.md'));
  const adrTextByPath = Object.fromEntries(changedAdrs.map((path) => [path, readAdrText(path, effectiveHead, worktree)]));
  const result = analyzePackageGate({ files, netAdditions, adrTextByPath, base, head: effectiveHead, worktree });
  if (args.get('github-output') === 'true') {
    console.log(`package_id=${result.packageId}`); console.log(`test_command=${result.testCommand}`); console.log(`files=${result.files}`); console.log(`net_additions=${result.netAdditions}`); return;
  }
  console.log(`${result.packageId} package gate passed: files=${result.files}, netAdditions=${result.netAdditions}, adr=${result.adr}, categories=${result.categories.join(',')}`);
}
if (import.meta.url === `file://${process.argv[1]}`) try { runCli(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
