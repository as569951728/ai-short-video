#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'; import { createHash } from 'node:crypto'; import { lstatSync, readFileSync } from 'node:fs'; import { resolve } from 'node:path'; import { TextDecoder } from 'node:util';
const B2A1_BASELINE_SHA = '501a3cfcdf12341d9f611f0fdd6a6336d4ade483', B2A2_GATE_PREP_BASELINE_SHA = '6eaf60af4155a8b95ff77d53261f5896d3a8f77d', GATE_PREP_BASELINE = 'verified-gate-prep', RANGE_BASELINE = 'range-base', ZERO_SHA = '0'.repeat(40), FALLBACK_PACKAGE_ID = 'RP-01C', FALLBACK_TEST_COMMAND = 'test:rp02b1';
const B2A2_GATE_PREP_ID = 'RP-02B2a2-G0', B2A2_GATE_PREP_ADR = 'docs/adr/rp-02b2a2-gate-prep-budget.md';
const G0_CORRECTION_ID = 'RP-02B2a2-G0-C1', G0_CORRECTION_BASELINE_SHA = '59cedaf7150029fcbde03d2779662659727e8b4e', G0_CORRECTION_ADR = 'docs/adr/rp-02b2a2-g0-ci-compat-correction-budget.md';
const GATE_PREP_EVIDENCE_ID = 'RP-02B2a2-G0-E1', GATE_PREP_EVIDENCE_COMMAND = 'test:governance', GATE_PREP_EVIDENCE_MAX_ADDITIONS = 64, GATE_PREP_EVIDENCE_MAX_DELETIONS = 48, GATE_PREP_EVIDENCE_MAX_NET_ADDITIONS = 64;
const GATE_PREP_EVIDENCE_FILES = new Set(['docs/reviews/main-control-status.md', 'docs/reviews/main-control-event-ledger.md', 'docs/reviews/remediation-rmd-task-002-003-rp-02b2a1-verification-2026-07-15.md']);
const GATE_PREP_EVIDENCE_FIELDS = Object.freeze(['g0_evidence_parent_sha', 'g0_evidence_rp01a_run', 'g0_evidence_rp01b_run', 'g0_evidence_rp01c_run', 'g0_evidence_governance_run', 'g0_evidence_a2_authorization', 'g0_evidence_issue_closed_count', 'g0_evidence_rmd_task_002', 'g0_evidence_rmd_task_003']);
const GATE_PREP_TEST_PATH = 'scripts/rp02b2a-package-gate.test.mjs';
const ADR_ALLOWED_FIELDS = new Set(['status', 'package_id', 'manifest_id', 'baseline_sha', 'hard_max_files', 'hard_max_net_additions', 'exceeded_budget', 'actual_files', 'actual_net_additions', 'split_reason', 'owner', 'valid_until']);
const GIT_MAX_BUFFER = 16 * 1024 * 1024;
const MAX_RENDERED_HTML_COMMENTS = 1024, MAX_RENDERED_HTML_COMMENT_LENGTH = 4096;
const GATE_ENV_COMMAND = 'env -u DATABASE_URL -u DEEPSEEK_API_KEY -u DEEPSEEK_BASE_URL -u DEEPSEEK_MODEL -u DEEPSEEK_STRUCTURE_MODEL -u DEEPSEEK_REASONER_MODEL -u DEEPSEEK_TIMEOUT_MS -u DEEPSEEK_MAX_RETRIES -u DEPLOYMENT_ACTOR_TENANT_ID -u DEPLOYMENT_ACTOR_USER_ID NODE_ENV=production AI_PROVIDER_MODE=mock DOTENV_CONFIG_PATH=/dev/null';
const TRUSTED_ADMISSION_WORKFLOW = '.github/workflows/rp02b2a-admission.yml';
const TRUSTED_ADMISSION_WORKFLOW_CANONICAL_SHA256 = 'bd744804b87d6359b86ff05de71edb0a094962d43215c7b5010a8a82ae18f8a8';
const B2A2_PACKAGE_SCRIPTS = Object.freeze({
  'test:rp02b2a2:env-probe': `node -e "const keys=['DATABASE_URL','DEEPSEEK_API_KEY','DEEPSEEK_BASE_URL','DEEPSEEK_MODEL','DEEPSEEK_STRUCTURE_MODEL','DEEPSEEK_REASONER_MODEL','DEEPSEEK_TIMEOUT_MS','DEEPSEEK_MAX_RETRIES','DEPLOYMENT_ACTOR_TENANT_ID','DEPLOYMENT_ACTOR_USER_ID']; if(keys.some((key)=>process.env[key]!==undefined)||process.env.NODE_ENV!=='production'||process.env.AI_PROVIDER_MODE!=='mock'||process.env.DOTENV_CONFIG_PATH!=='/dev/null') process.exit(1); console.log('RP02B2A2_ENV_CLEAN')"`,
  'test:rp02b2a2:core': `${GATE_ENV_COMMAND} sh -c 'npm run test:rp02b2a2:env-probe && npm run build -w @ai-shortvideo/shared && npm run prisma:generate -w @ai-shortvideo/api && npm exec -w @ai-shortvideo/api -- tsx --test test/rp02b2a/authority-claim.test.ts test/rp02b2a/repository-authority-hardening.test.ts src/modules/novels/novelRoutes.test.ts'`,
  'test:rp02b2a2': `${GATE_ENV_COMMAND} sh -c 'npm run test:rp02b2a2:env-probe && npm run test:rp02b2a1 && npm run test:rp02b2a2:core'`
});
const BUSINESS_PACKAGE_SEQUENCE = Object.freeze(['RP-02B2a2', 'RP-02B2a3', 'RP-02B2a4', 'RP-02B2a5']);
const BUSINESS_PACKAGE_PREDECESSOR = Object.freeze({ 'RP-02B2a2': G0_CORRECTION_ID, 'RP-02B2a3': 'RP-02B2a2', 'RP-02B2a4': 'RP-02B2a3', 'RP-02B2a5': 'RP-02B2a4' });
const BUSINESS_PACKAGE_SCRIPT_ADDITIONS = Object.freeze({
  'RP-02B2a2': B2A2_PACKAGE_SCRIPTS,
  'RP-02B2a3': Object.freeze({
    'test:rp02b2a3:core': `${GATE_ENV_COMMAND} sh -c 'npm run test:rp02b2a2:env-probe && npm exec -w @ai-shortvideo/api -- tsx --test test/rp02b2a/lease-dispatch-retry.test.ts'`,
    'test:rp02b2a3': `${GATE_ENV_COMMAND} sh -c 'npm run test:rp02b2a2:env-probe && npm run test:rp02b2a2 && npm run test:rp02b2a3:core'`
  }),
  'RP-02B2a4': Object.freeze({
    'test:rp02b2a4:core': `${GATE_ENV_COMMAND} sh -c 'npm run test:rp02b2a2:env-probe && npm exec -w @ai-shortvideo/api -- tsx --test test/rp02b2a/inmemory-fenced-finalize.test.ts src/modules/novels/novelRoutes.test.ts'`,
    'test:rp02b2a4': `${GATE_ENV_COMMAND} sh -c 'npm run test:rp02b2a2:env-probe && npm run test:rp02b2a3 && npm run test:rp02b2a4:core'`
  }),
  'RP-02B2a5': Object.freeze({
    'test:rp02b2a5:core': `${GATE_ENV_COMMAND} sh -c 'npm run test:rp02b2a2:env-probe && npm run prisma:generate -w @ai-shortvideo/api && npm exec -w @ai-shortvideo/api -- tsx --test test/rp02b2a/prisma-fenced-finalize.test.ts'`,
    'test:rp02b2a5': `${GATE_ENV_COMMAND} sh -c 'npm run test:rp02b2a2:env-probe && npm run test:rp02b2a4 && npm run test:rp02b2a5:core'`
  })
});
const GATE_PREP_A1_SCRIPTS = Object.freeze({
  'test:rp02b2a1:env-probe': `node -e "const keys=['DATABASE_URL','DEEPSEEK_API_KEY','DEEPSEEK_BASE_URL','DEEPSEEK_MODEL','DEEPSEEK_STRUCTURE_MODEL','DEEPSEEK_REASONER_MODEL','DEEPSEEK_TIMEOUT_MS','DEEPSEEK_MAX_RETRIES','DEPLOYMENT_ACTOR_TENANT_ID','DEPLOYMENT_ACTOR_USER_ID']; if(keys.some((key)=>process.env[key]!==undefined)||process.env.NODE_ENV!=='production'||process.env.AI_PROVIDER_MODE!=='mock'||process.env.DOTENV_CONFIG_PATH!=='/dev/null') process.exit(1); console.log('RP02B2A_ENV_CLEAN')"`,
  'test:rp02b2a1:gate': `${GATE_ENV_COMMAND} sh -c 'npm run test:rp02b2a1:env-probe && node --test scripts/rp02b2a-package-gate.test.mjs'`,
  'test:rp02b2a1:core': `${GATE_ENV_COMMAND} sh -c 'npm run test:rp02b2a1:env-probe && npm run test:rp02b2a1:gate && npm run build -w @ai-shortvideo/shared && npm run prisma:generate -w @ai-shortvideo/api && npm exec -w @ai-shortvideo/api -- tsx --test test/rp02a/rp02a.test.ts src/modules/novels/novelRoutes.test.ts'`,
  'test:rp02b2a1': `${GATE_ENV_COMMAND} sh -c 'npm run test:rp02b2a1:env-probe && npm run test:rp02b1 && npm run test:rp02b2a0 && npm run test:rp02b2a1:core'`
});
function canonicalJson(value) { if (Array.isArray(value)) return value.map(canonicalJson); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])])); return value; }
function assertPackageNonScriptsEqual(candidate, baseline, packageId) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || !baseline || typeof baseline !== 'object' || Array.isArray(baseline)) throw new Error(`${packageId} package.json root must be an object`);
  const candidateFields = Object.fromEntries(Object.entries(candidate).filter(([key]) => key !== 'scripts')), baselineFields = Object.fromEntries(Object.entries(baseline).filter(([key]) => key !== 'scripts'));
  if (JSON.stringify(canonicalJson(candidateFields)) !== JSON.stringify(canonicalJson(baselineFields))) throw new Error(`${packageId} candidate HEAD cannot modify non-script package.json fields`);
}
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const YAML_AST_TO_JSON = String.raw`def convert(node, anchors = {}, resolving = {})
  if node.is_a?(Psych::Nodes::Alias); target = anchors[node.anchor]; raise "unknown YAML alias: #{node.anchor}" unless target; raise "cyclic YAML alias: #{node.anchor}" if resolving[node.anchor]; return convert(target, anchors, resolving); end
  anchor = node.respond_to?(:anchor) ? node.anchor : nil; if anchor && !anchor.empty?; raise "duplicate YAML anchor: #{anchor}" if anchors.key?(anchor) && anchors[anchor] != node; raise "cyclic YAML alias: #{anchor}" if resolving[anchor]; anchors[anchor] = node; resolving[anchor] = true; end
  begin; case node; when Psych::Nodes::Document then raise 'YAML document must have one root node' unless node.children.length == 1; convert(node.children.first, anchors, resolving); when Psych::Nodes::Mapping then result = {}; node.children.each_slice(2) { |key_node, value_node| raise 'YAML mapping keys must be scalars' unless key_node.is_a?(Psych::Nodes::Scalar); key = key_node.value; raise "duplicate YAML mapping key: #{key}" if result.key?(key); result[key] = convert(value_node, anchors, resolving) }; result; when Psych::Nodes::Sequence then node.children.map { |child| convert(child, anchors, resolving) }; when Psych::Nodes::Scalar then node.value; else raise "unsupported YAML node: #{node.class}"; end; ensure resolving.delete(anchor) if anchor && !anchor.empty?; end
end
stream = Psych.parse_stream(STDIN.read); raise 'workflow YAML must contain exactly one document' unless stream.children.length == 1; puts JSON.generate(convert(stream.children.first))`;
const COMMON_GATE_FILES = 'scripts/rp02b2a-package-gate.mjs|scripts/rp02b2a-package-gate.test.mjs|.github/workflows/rp01c-fixtures.yml|package.json'.split('|');
const FIXED_BASELINES = Object.freeze({ 'RP-02B2a1': B2A1_BASELINE_SHA, [B2A2_GATE_PREP_ID]: B2A2_GATE_PREP_BASELINE_SHA, [G0_CORRECTION_ID]: G0_CORRECTION_BASELINE_SHA, 'RP-02B2a2': GATE_PREP_BASELINE });
const definition = (packageId, manifestId, adrPath, testCommand, hardMaxFiles, hardMaxNetAdditions, manifest, requiredCategories = ['production', 'test', 'adr']) => ({ packageId, manifestId, adrPath, testCommand, hardMaxFiles, hardMaxNetAdditions, baselinePolicy: FIXED_BASELINES[packageId] ?? RANGE_BASELINE, manifest: new Set(manifest), requiredCategories });
export const PACKAGE_DEFINITIONS = {
  'RP-02B2a1': definition('RP-02B2a1', 'RP-02B2a1-v1', 'docs/adr/rp-02b2a1-registry-abi-budget.md', 'test:rp02b2a1', 18, 1900, [...'packages/shared/src/api.ts|packages/shared/src/novels.ts|apps/api/src/modules/novels/services/actionExecutionPlan.ts|apps/api/src/modules/novels/services/novelService.ts|apps/api/src/modules/tasks/services/taskService.ts|apps/api/src/modules/novels/providers/mockDirectionProvider.ts|apps/api/src/modules/novels/providers/mockStructureProvider.ts|apps/api/src/modules/novels/providers/mockTrialProvider.ts|apps/api/src/modules/novels/providers/mockBodyProvider.ts|apps/api/src/modules/novels/providers/mockFullReviewProvider.ts|apps/api/src/modules/novels/providers/deepseekNovelProvider.ts|apps/api/test/rp01c/fixtureFactory.test.ts|apps/api/test/rp02a/rp02a.test.ts|apps/api/src/modules/novels/novelRoutes.test.ts|docs/adr/rp-02b2a1-registry-abi-budget.md'.split('|'), ...COMMON_GATE_FILES]),
  [B2A2_GATE_PREP_ID]: definition(B2A2_GATE_PREP_ID, 'RP-02B2a2-G0-v1', B2A2_GATE_PREP_ADR, 'test:rp02b2a1:gate', 16, 2000, '.github/workflows/rp01a-e2e.yml|.github/workflows/rp01b-dom.yml|.github/workflows/rp01c-fixtures.yml|.github/workflows/remediation-governance.yml|.github/workflows/rp02b2a-admission.yml|apps/admin-web/src/modules/novels/components/TaskProgressPanel.dom.spec.ts|apps/api/test/rp01c/fixtureFactory.test.ts|docs/modules/rp-02b2-dispatcher-transport-implementation-package.md|docs/remediation/acceptance-matrix.md|docs/reviews/main-control-event-ledger.md|docs/reviews/main-control-status.md|docs/reviews/remediation-rmd-task-002-003-rp-02b2a1-verification-2026-07-15.md|scripts/rp02b2a-package-gate.mjs|scripts/rp02b2a-package-gate.test.mjs|docs/adr/rp-02b2a2-gate-prep-budget.md|package.json'.split('|'), ['governance', 'test', 'adr']),
  [G0_CORRECTION_ID]: definition(G0_CORRECTION_ID, 'RP-02B2a2-G0-C1-v1', G0_CORRECTION_ADR, 'test:rp02b2a1:gate', 10, 700, '.github/workflows/rp01c-fixtures.yml|.github/workflows/rp02b2a-admission.yml|scripts/e2e/api-e2e-server.ts|scripts/e2e/run-playwright-backend-e2e.test.mjs|scripts/rp02b2a-package-gate.mjs|scripts/rp02b2a-package-gate.test.mjs|docs/adr/rp-02b2a2-g0-ci-compat-correction-budget.md|docs/modules/rp-02b2-dispatcher-transport-implementation-package.md|docs/reviews/rp-02b2a2-g0-ci-compat-correction-verification-2026-07-18.md'.split('|'), ['governance', 'test', 'adr']),
  'RP-02B2a2': definition('RP-02B2a2', 'RP-02B2a2-v3', 'docs/adr/rp-02b2a2-authority-claim-budget.md', 'test:rp02b2a2', 20, 3250, 'packages/shared/src/api.ts|packages/shared/src/novels.ts|apps/api/src/config/env.ts|apps/api/src/modules/novels/domain/executionContract.ts|apps/api/src/modules/novels/domain/novelDomain.ts|apps/api/test/rp02b/rp02b.test.ts|apps/api/src/modules/novels/services/taskClaim.ts|apps/api/src/modules/novels/services/novelService.ts|apps/api/src/modules/novels/routes/novelRoutes.ts|apps/api/src/modules/tasks/routes/taskRoutes.ts|apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts|apps/api/src/modules/novels/repositories/prismaNovelRepository.ts|apps/api/src/app.ts|apps/api/src/main.ts|apps/api/test/rp02b2a/fixtures.ts|apps/api/test/rp02b2a/authority-claim.test.ts|apps/api/test/rp02b2a/repository-authority-hardening.test.ts|apps/api/src/modules/novels/novelRoutes.test.ts|docs/adr/rp-02b2a2-authority-claim-budget.md|package.json'.split('|')),
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
export function parseAdr(text) {
  const record = {};
  for (const line of text.split(/\r?\n/)) {
    const fieldLike = /^([a-zA-Z0-9_]+)[ \t]*:/.exec(line);
    const match = /^([a-zA-Z0-9_]+):[ \t]*(\S(?:.*\S)?)?[ \t]*$/.exec(line);
    if (!fieldLike) continue;
    if (!match || match[2] === undefined) throw new Error(`RP-02B2a ADR malformed or empty field: ${fieldLike[1]}`);
    if (Object.hasOwn(record, match[1])) throw new Error(`RP-02B2a ADR duplicate field: ${match[1]}`);
    record[match[1]] = match[2];
  }
  return record;
}
export function analyzePackageGate({ files, netAdditions, addedLines = netAdditions, deletedLines = 0, adrTextByPath, base, head, worktree = false }) {
  assertUsableSha('BASE', base); assertUsableSha('HEAD', head);
  if (!worktree && base === head) throw new Error('RP-02B2a package gate rejects identical BASE/HEAD');
  const changedFiles = [...new Set(files)].sort(), changedAdrs = changedFiles.filter((file) => file.startsWith('docs/adr/rp-02b2a') && file.endsWith('.md')), touchesManifest = changedFiles.some((file) => Object.values(PACKAGE_DEFINITIONS).some((item) => item.manifest.has(file))), touchesEvidence = changedFiles.some((file) => GATE_PREP_EVIDENCE_FILES.has(file));
  if (changedAdrs.length === 1 && changedAdrs[0] === G0_CORRECTION_ADR && [...GATE_PREP_EVIDENCE_FILES].every((file) => changedFiles.includes(file))) {
    throw new Error(`${G0_CORRECTION_ID} cannot batch ${GATE_PREP_EVIDENCE_ID} publication evidence`);
  }
  if (changedAdrs.length === 0 && touchesEvidence) {
    if (!sameFileSet(changedFiles, GATE_PREP_EVIDENCE_FILES)) throw new Error(`${GATE_PREP_EVIDENCE_ID} requires exactly the three frozen evidence files`);
    if (addedLines > GATE_PREP_EVIDENCE_MAX_ADDITIONS) throw new Error(`${GATE_PREP_EVIDENCE_ID} additions budget exceeded: ${addedLines}/${GATE_PREP_EVIDENCE_MAX_ADDITIONS}`);
    if (deletedLines > GATE_PREP_EVIDENCE_MAX_DELETIONS) throw new Error(`${GATE_PREP_EVIDENCE_ID} deletions budget exceeded: ${deletedLines}/${GATE_PREP_EVIDENCE_MAX_DELETIONS}`);
    if (netAdditions > GATE_PREP_EVIDENCE_MAX_NET_ADDITIONS) throw new Error(`${GATE_PREP_EVIDENCE_ID} net additions budget exceeded: ${netAdditions}/${GATE_PREP_EVIDENCE_MAX_NET_ADDITIONS}`);
    return { packageId: GATE_PREP_EVIDENCE_ID, manifestId: 'RP-02B2a2-G0-EVIDENCE-v1', files: changedFiles.length, netAdditions, adr: 'none', testCommand: GATE_PREP_EVIDENCE_COMMAND, categories: ['governance-evidence'] };
  }
  if (changedAdrs.length === 0 && !touchesManifest) return { packageId: FALLBACK_PACKAGE_ID, manifestId: 'none', files: changedFiles.length, netAdditions, adr: 'none', testCommand: FALLBACK_TEST_COMMAND, categories: [...new Set(changedFiles.map(categorizeFile))].sort() };
  if (changedAdrs.length !== 1) throw new Error(`RP-02B2a package gate requires exactly one changed ADR, got ${changedAdrs.length}`);
  const definition = Object.values(PACKAGE_DEFINITIONS).find((item) => item.adrPath === changedAdrs[0]);
  if (!definition) throw new Error(`RP-02B2a package gate found unsupported ADR: ${changedAdrs[0]}`);
  if (![RANGE_BASELINE, GATE_PREP_BASELINE].includes(definition.baselinePolicy) && base !== definition.baselinePolicy) throw new Error(`${definition.packageId} requires fixed baseline ${definition.baselinePolicy}, got ${base}`);
  const outsideManifest = changedFiles.filter((file) => !definition.manifest.has(file));
  if (outsideManifest.length > 0) throw new Error(`${definition.packageId} manifest violation: ${outsideManifest.join(', ')}`);
  if (definition.packageId === G0_CORRECTION_ID && !sameFileSet(changedFiles, definition.manifest)) {
    const missing = [...definition.manifest].filter((file) => !changedFiles.includes(file));
    throw new Error(`${G0_CORRECTION_ID} requires exactly the nine frozen manifest files${missing.length > 0 ? `; missing: ${missing.join(', ')}` : ''}`);
  }
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
  const unknown = Object.keys(adr).filter((field) => !ADR_ALLOWED_FIELDS.has(field));
  if (unknown.length > 0) throw new Error(`${definition.packageId} ADR unsupported field: ${unknown.join(', ')}`);
  const expectedBaseline = [RANGE_BASELINE, GATE_PREP_BASELINE].includes(definition.baselinePolicy) ? base : definition.baselinePolicy;
  const expected = { status: 'ready', package_id: definition.packageId, manifest_id: definition.manifestId, baseline_sha: expectedBaseline, hard_max_files: String(definition.hardMaxFiles), hard_max_net_additions: String(definition.hardMaxNetAdditions), actual_files: String(changedFiles.length), actual_net_additions: String(netAdditions) };
  for (const [field, value] of Object.entries(expected)) if (adr[field] !== value) throw new Error(`${definition.packageId} ADR ${field} mismatch: ${adr[field] ?? '<missing>'} != ${value}`);
}
function categorizeFile(file) { if (file.startsWith('docs/adr/')) return 'adr'; if (file.includes('.test.') || file.includes('/test/') || file.endsWith('novelRoutes.test.ts')) return 'test'; if (file.startsWith('scripts/') || file.startsWith('.github/')) return 'governance'; if (file === 'package.json') return 'package-metadata'; return 'production'; }
function sameFileSet(files, expected) { return files.length === expected.size && files.every((file) => expected.has(file)); }
function assertUsableSha(label, sha) { if (!sha) throw new Error(`RP-02B2a package gate requires explicit ${label}`); if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error(`RP-02B2a package gate rejects unparseable ${label}: ${sha}`); if (/^0{40}$/.test(sha)) throw new Error(`RP-02B2a package gate rejects zero ${label}`); }
function gitText(args) { return execFileSync('git', args, { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER }); }
function gitBuffer(args) { return execFileSync('git', args, { maxBuffer: GIT_MAX_BUFFER }); }
function assertGitCommit(label, sha) { if (!gitCommitExists(sha)) throw new Error(`RP-02B2a package gate rejects unreachable ${label}: ${sha}`); }
function gitCommitExists(sha) { return spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' }).status === 0; }
function isAncestor(base, head) { return spawnSync('git', ['merge-base', '--is-ancestor', base, head], { stdio: 'ignore' }).status === 0; }
function changedFiles(base, head) { return splitNulBuffer(gitBuffer(['diff', '--name-only', '-z', base, head])).map(decodeGitPath); }
function adrExistsAt(ref, definition) { return spawnSync('git', ['cat-file', '-e', `${ref}:${definition.adrPath}`], { stdio: 'ignore' }).status === 0; }
function adrReadyAt(ref, definition) { try { return parseAdr(gitText(['show', `${ref}:${definition.adrPath}`])).status === 'ready'; } catch { return false; } }
function gatePrepCommitForHead(head) {
  const candidates = [G0_CORRECTION_ADR].flatMap((adrPath) =>
    gitText(['log', '--format=%H', '--diff-filter=A', head, '--', adrPath]).trim().split(/\r?\n/).filter(Boolean)
  );
  for (const candidate of candidates) { try { validateGatePrepBase(candidate); if (isAncestor(candidate, head)) return candidate; } catch {} }
  throw new Error(`RP-02B2a2 candidate HEAD requires a verified ${G0_CORRECTION_ID} ancestor rooted at ${G0_CORRECTION_BASELINE_SHA}`);
}
function fixedPackageBase(base, head) {
  const directFiles = changedFiles(base, head);
  const directAdr = Object.values(PACKAGE_DEFINITIONS).find((item) => directFiles.includes(item.adrPath));
  const b2a2 = PACKAGE_DEFINITIONS['RP-02B2a2'];
  let gatePrep;
  try { gatePrep = gatePrepCommitForHead(head); } catch {}
  if (gatePrep && base === gatePrep && sameFileSet([...new Set(directFiles)], GATE_PREP_EVIDENCE_FILES)) return base;
  const directB2a2Change = directFiles.includes(b2a2.adrPath) || (gatePrep && adrExistsAt(head, b2a2) && !directAdr && directFiles.some((file) => b2a2.manifest.has(file)));
  const b2a2BecameReady = !adrReadyAt(base, b2a2) && adrReadyAt(head, b2a2);
  if (directB2a2Change || b2a2BecameReady) {
    const acceptedGatePrep = gatePrep ?? gatePrepCommitForHead(head);
    if (base !== acceptedGatePrep) throw new Error('RP-02B2a2 requires its accepted G0 code head to be independently landed before the A2 range; G0 and A2 cannot be batched in one PR, push, or manual range');
    return acceptedGatePrep;
  }
  if (gatePrep && !adrReadyAt(head, b2a2) && changedFiles(gatePrep, head).some((file) => b2a2.manifest.has(file))) return gatePrep;
  const fixedDefinitions = Object.values(PACKAGE_DEFINITIONS).filter((item) => item.baselinePolicy !== RANGE_BASELINE).reverse();
  for (const definition of fixedDefinitions) {
    const fixed = definition.baselinePolicy;
    const directPackageChange = directFiles.includes(definition.adrPath) || (!directAdr && directFiles.some((file) => definition.manifest.has(file)));
    const fixedReachable = gitCommitExists(fixed) && isAncestor(fixed, head);
    if (directPackageChange) {
      if (!fixedReachable) {
        if (directFiles.includes(definition.adrPath)) throw new Error(`${definition.packageId} candidate HEAD must descend from fixed predecessor ${fixed}`);
        continue;
      }
      return fixed;
    }
    if (!fixedReachable || adrReadyAt(head, definition)) continue;
    if (changedFiles(fixed, head).some((file) => definition.manifest.has(file))) return fixed;
  }
  return base;
}
function externallyAuthorizedRange(input, head) {
  const packageId = input.authorizedPackageId, base = input.authorizedPredecessorSha;
  if ((!packageId && !base) || (packageId === 'NOT_AUTHORIZED' && base === 'not_authorized')) return undefined;
  if (!packageId || !base || packageId === 'NOT_AUTHORIZED' || base === 'not_authorized') throw new Error('RP-02B2a package gate rejects incomplete repository-authorized package/predecessor tuple');
  if (!BUSINESS_PACKAGE_SEQUENCE.includes(packageId)) throw new Error(`RP-02B2a package gate rejects unsupported repository-authorized package: ${packageId}`);
  assertUsableSha('AUTHORIZED_PREDECESSOR', base); assertGitCommit('AUTHORIZED_PREDECESSOR', base);
  if (!isAncestor(base, head)) throw new Error('RP-02B2a package gate rejects repository-authorized predecessor that is not an ancestor of HEAD');
  return { base, head };
}
function correctionBootstrapRange(head) {
  const definition = PACKAGE_DEFINITIONS[G0_CORRECTION_ID];
  const commitAndParents = gitText(['rev-list', '--parents', '-n', '1', head]).trim().split(/\s+/);
  if (commitAndParents.length !== 2 || commitAndParents[1] !== G0_CORRECTION_BASELINE_SHA || !adrExistsAt(head, definition)) return undefined;
  validateGatePrepBase(head);
  return { base: G0_CORRECTION_BASELINE_SHA, head };
}
export function resolvePackageGateRange(input) {
  const event = input.event;
  if (event === 'pull_request_target') {
    const eventBase = input.eventBase, head = input.eventHead;
    assertUsableSha('EVENT_BASE', eventBase); assertUsableSha('EVENT_HEAD', head);
    assertGitCommit('EVENT_BASE', eventBase); assertGitCommit('EVENT_HEAD', head);
    if (!BUSINESS_PACKAGE_SEQUENCE.includes(input.authorizedPackageId) || !input.authorizedPredecessorSha) throw new Error('RP-02B2a authoritative admission requires the repository-controlled package/predecessor tuple');
    assertUsableSha('GATE_SOURCE', input.gateSource); assertGitCommit('GATE_SOURCE', input.gateSource);
    if (!isAncestor(input.gateSource, eventBase)) throw new Error('RP-02B2a authoritative workflow base must descend from the accepted G0 gate source');
    const range = externallyAuthorizedRange(input, head);
    const mergeBase = gitText(['merge-base', eventBase, head]).trim();
    assertUsableSha('EVENT_MERGE_BASE', mergeBase); assertGitCommit('EVENT_MERGE_BASE', mergeBase);
    if (mergeBase !== range.base) throw new Error(`RP-02B2a authoritative PR merge-base must equal the authorized predecessor: ${mergeBase} != ${range.base}`);
    return { ...range, eventBase };
  }
  if (event === 'pull_request') {
    const baseRef = input.prBaseRef, head = input.prHead;
    if (!baseRef) throw new Error('RP-02B2a package gate requires explicit PR base ref');
    assertUsableSha('PR_HEAD', head); assertGitCommit('PR_HEAD', head); const base = gitText(['merge-base', baseRef, head]).trim(); assertUsableSha('PR_BASE', base); assertGitCommit('PR_BASE', base);
    const correction = correctionBootstrapRange(head);
    if (correction) {
      if (base !== G0_CORRECTION_BASELINE_SHA) throw new Error(`${G0_CORRECTION_ID} pull request must have fixed merge-base ${G0_CORRECTION_BASELINE_SHA}`);
      return correction;
    }
    return externallyAuthorizedRange(input, head) ?? { base: fixedPackageBase(base, head), head };
  }
  if (event === 'push') {
    const base = input.pushBefore, head = input.pushHead;
    assertUsableSha('PUSH_HEAD', head); assertGitCommit('PUSH_HEAD', head);
    const correction = correctionBootstrapRange(head);
    if (base === ZERO_SHA) {
      if (input.pushCreated !== 'true') throw new Error('RP-02B2a package gate rejects zero PUSH_BEFORE unless GitHub marks a newly created ref');
      if (correction) return correction;
      const authorized = externallyAuthorizedRange(input, head);
      if (!authorized) throw new Error('RP-02B2a package gate rejects newly created ref without a complete repository-authorized package/predecessor tuple');
      return authorized;
    }
    if (input.pushCreated === 'true') throw new Error('RP-02B2a package gate rejects inconsistent created push with non-zero PUSH_BEFORE');
    assertUsableSha('PUSH_BEFORE', base); assertGitCommit('PUSH_BEFORE', base);
    if (correction) {
      if (base === G0_CORRECTION_BASELINE_SHA) return correction;
      if (correctionBootstrapRange(base)) return correction;
      throw new Error(`${G0_CORRECTION_ID} replacement push requires the fixed baseline or a separately valid correction candidate as PUSH_BEFORE`);
    }
    if (!isAncestor(base, head)) throw new Error('RP-02B2a package gate rejects push before that is not an ancestor of after');
    return externallyAuthorizedRange(input, head) ?? { base: fixedPackageBase(base, head), head };
  }
  if (event === 'workflow_dispatch') {
    const base = input.manualBase, head = input.manualHead; assertUsableSha('MANUAL_BASE', base); assertUsableSha('MANUAL_HEAD', head); assertGitCommit('MANUAL_BASE', base); assertGitCommit('MANUAL_HEAD', head);
    const correction = correctionBootstrapRange(head);
    if (correction) {
      if (base !== G0_CORRECTION_BASELINE_SHA) throw new Error(`${G0_CORRECTION_ID} manual replay requires fixed base ${G0_CORRECTION_BASELINE_SHA}`);
      return correction;
    }
    if (!isAncestor(base, head)) throw new Error('RP-02B2a package gate rejects manual base that is not an ancestor of head');
    return externallyAuthorizedRange(input, head) ?? { base: fixedPackageBase(base, head), head };
  }
  throw new Error(`RP-02B2a package gate rejects unsupported event: ${event ?? '<missing>'}`);
}
export function readGitDiff({ base, head, worktree }) {
  assertUsableSha('BASE', base); assertUsableSha('HEAD', head); const effectiveHead = worktree ? gitText(['rev-parse', 'HEAD']).trim() : head; if (worktree && effectiveHead !== head) throw new Error('RP-02B2a package gate explicit HEAD does not match current checkout HEAD'); assertGitCommit('BASE', base); assertGitCommit('HEAD', effectiveHead);
  if (!isAncestor(base, effectiveHead)) throw new Error('RP-02B2a package gate rejects BASE that is not an ancestor of HEAD');
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
  return { files, addedLines: totalAdded, deletedLines: totalDeleted, netAdditions: Math.max(0, totalAdded - totalDeleted), head: effectiveHead };
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
function validateOriginalGatePrepBase(base) {
  assertUsableSha('GATE_PREP_BASE', base); assertGitCommit('GATE_PREP_BASE', base);
  const commitAndParents = gitText(['rev-list', '--parents', '-n', '1', base]).trim().split(/\s+/);
  if (commitAndParents.length !== 2 || commitAndParents[1] !== B2A2_GATE_PREP_BASELINE_SHA) throw new Error(`${B2A2_GATE_PREP_ID} must be one atomic direct child commit of ${B2A2_GATE_PREP_BASELINE_SHA}`);
  const { files, netAdditions } = readGitDiff({ base: B2A2_GATE_PREP_BASELINE_SHA, head: base, worktree: false });
  const adrTextByPath = { [B2A2_GATE_PREP_ADR]: readAdrText(B2A2_GATE_PREP_ADR, base, false) };
  const result = analyzePackageGate({ files, netAdditions, adrTextByPath, base: B2A2_GATE_PREP_BASELINE_SHA, head: base, worktree: false });
  if (result.packageId !== B2A2_GATE_PREP_ID) throw new Error(`RP-02B2a2 baseline is not a verified ${B2A2_GATE_PREP_ID} package`);
  assertGatePrepDoesNotEmbedEvidencePublication({ head: base, worktree: false });
  validateGatePrepPackageScripts({ packageId: B2A2_GATE_PREP_ID, head: base, worktree: false });
  verifyPinnedEvidenceParentWorkflows({ head: base, worktree: false });
  verifyTrustedAdmissionWorkflowContract({ workflowPath: TRUSTED_ADMISSION_WORKFLOW, head: base });
  return result;
}
export function validateGatePrepBase(base) {
  assertUsableSha('GATE_PREP_BASE', base); assertGitCommit('GATE_PREP_BASE', base);
  const commitAndParents = gitText(['rev-list', '--parents', '-n', '1', base]).trim().split(/\s+/);
  if (commitAndParents.length === 2 && commitAndParents[1] === B2A2_GATE_PREP_BASELINE_SHA) {
    return validateOriginalGatePrepBase(base);
  }
  if (commitAndParents.length !== 2 || commitAndParents[1] !== G0_CORRECTION_BASELINE_SHA) {
    throw new Error(`${G0_CORRECTION_ID} must be one atomic direct child commit of ${G0_CORRECTION_BASELINE_SHA}`);
  }
  if (!isAncestor('01245feb51b50ec838cb405a67bcafd1b194eeae', G0_CORRECTION_BASELINE_SHA)) {
    throw new Error(`${G0_CORRECTION_ID} baseline must contain the accepted ${B2A2_GATE_PREP_ID} lineage`);
  }
  const { files, netAdditions } = readGitDiff({ base: G0_CORRECTION_BASELINE_SHA, head: base, worktree: false });
  const adrTextByPath = { [G0_CORRECTION_ADR]: readAdrText(G0_CORRECTION_ADR, base, false) };
  const result = analyzePackageGate({ files, netAdditions, adrTextByPath, base: G0_CORRECTION_BASELINE_SHA, head: base, worktree: false });
  if (result.packageId !== G0_CORRECTION_ID) throw new Error(`RP-02B2a2 baseline is not a verified ${G0_CORRECTION_ID} package`);
  verifyTrustedAdmissionWorkflowContract({ workflowPath: TRUSTED_ADMISSION_WORKFLOW, head: base });
  verifyWorkflowContract({ workflowPath: '.github/workflows/rp01c-fixtures.yml', head: base });
  return result;
}
function validateGatePrepWorktreeHead(head) {
  if (head === B2A2_GATE_PREP_BASELINE_SHA) return;
  const commitAndParents = gitText(['rev-list', '--parents', '-n', '1', head]).trim().split(/\s+/);
  if (commitAndParents.length !== 2 || commitAndParents[1] !== B2A2_GATE_PREP_BASELINE_SHA) {
    throw new Error(`${B2A2_GATE_PREP_ID} worktree preparation must be at fixed baseline ${B2A2_GATE_PREP_BASELINE_SHA} or its single direct child pending atomic amend`);
  }
}
function evidenceField(text, field, path) { const matches = [...text.matchAll(new RegExp(`^${field}:[ \\t]*([^\\r\\n]*\\S)[ \\t]*$`, 'gm'))]; if (matches.length !== 1) throw new Error(`${GATE_PREP_EVIDENCE_ID} ${path} requires exactly one non-empty same-line ${field}`); return matches[0][1]; }
function evidenceFieldNames(text) { return [...text.matchAll(/\b(g0_evidence_[^\s:=]+)\s*[:=]/gi)].map((match) => match[1]); }
function assertExactEvidenceFieldSet(text, path) {
  const names = evidenceFieldNames(text), unique = new Set(names);
  if (names.length !== GATE_PREP_EVIDENCE_FIELDS.length || unique.size !== GATE_PREP_EVIDENCE_FIELDS.length || GATE_PREP_EVIDENCE_FIELDS.some((field) => !unique.has(field))) throw new Error(`${GATE_PREP_EVIDENCE_ID} ${path} evidence field set must equal the frozen nine-field whitelist`);
}
function assertGatePrepDoesNotEmbedEvidencePublication({ head, worktree }) {
  for (const path of GATE_PREP_EVIDENCE_FILES) {
    const text = readAdrText(path, head, worktree);
    if (/\bg0_evidence_[^\s:=]+\s*[:=]/i.test(text) || text.includes('### MCE-RP02B2A2-G0-E1-REMOTE-ACCEPTED') || text.includes('### 7.3 G0 accepted code head 与远程关闭证据')) throw new Error(`${B2A2_GATE_PREP_ID} cannot batch ${GATE_PREP_EVIDENCE_ID} publication evidence`);
  }
}
function stripRenderedHtmlComments(text, path) {
  const chunks = [];
  let cursor = 0, comments = 0;
  while (cursor < text.length) {
    const start = text.indexOf('<!--', cursor);
    if (start < 0) { chunks.push(text.slice(cursor)); break; }
    chunks.push(text.slice(cursor, start));
    const end = text.indexOf('-->', start + 4);
    comments += 1;
    if (end < 0 || end - start - 4 > MAX_RENDERED_HTML_COMMENT_LENGTH || comments > MAX_RENDERED_HTML_COMMENTS) throw new Error(`${GATE_PREP_EVIDENCE_ID} ${path} contains malformed or overlong rendered HTML comments`);
    cursor = end + 3;
  }
  return chunks.join('');
}
function assertNoA2AuthorizationContradiction(text, path) {
  const subject = '(?:A2|B2a2|RP-02B2a2)';
  const rendered = stripRenderedHtmlComments(text, path);
  const renderedWithoutCodeSpans = rendered.replace(/`[^`\r\n]*`/g, '');
  if (/<\/?[a-z][^>\r\n]*>/i.test(renderedWithoutCodeSpans)) throw new Error(`${GATE_PREP_EVIDENCE_ID} ${path} contains unsupported rendered HTML`);
  const decoded = rendered.replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, decimal) => String.fromCodePoint(Number.parseInt(hex ?? decimal, hex ? 16 : 10))).replace(/&(zwnj|zwj|lrm|rlm|nbsp|zerowidthspace|zerowidthnonjoiner|zerowidthjoiner|lefttorightmark|righttoleftmark|nobreakspace|shy|softhyphen);/gi, (_, entity) => ['nbsp', 'nobreakspace'].includes(entity.toLowerCase()) ? ' ' : '');
  const decodedWithoutCodeSpans = decoded.replace(/`[^`\r\n]*`/g, '');
  if (/<\/?[a-z][^>\r\n]*>/i.test(decodedWithoutCodeSpans)) throw new Error(`${GATE_PREP_EVIDENCE_ID} ${path} contains unsupported decoded HTML`);
  if (/&[a-z][a-z0-9]+;/i.test(decoded)) throw new Error(`${GATE_PREP_EVIDENCE_ID} ${path} contains an unsupported named HTML entity`);
  const normalized = decoded.normalize('NFKC').replace(/\p{Default_Ignorable_Code_Point}/gu, '').replace(/\r?\n/g, ' ').replace(/RP-02B2a2-G0(?:-E1)?/gi, 'G0').replace(/[`*~>#\[\](){}|]/g, '');
  const startWords = '(?:启动|开始|进入|开工|开发|编码|实施|实现|推进|继续)';
  const positiveToken = `(?:已(?:经)?(?:获得|获)?(?:授权|批准)|授权(?:已经)?生效|授权(?:已)?通过|准入(?:已)?(?:完成|通过)|已?(?:放行|解禁)|获批|获准(?:${startWords})?|准予${startWords}|批准${startWords}|可以${startWords}|可(?:直接|立即|正式)?${startWords}|允许(?:立即|正式)?${startWords})`;
  const positiveSources = [
    `${subject}.{0,36}?${positiveToken}`,
    `${positiveToken}.{0,24}?${subject}`,
    `(?:授权|批准)(?:予以)?[ \\t，,：:]*${subject}[ \\t，,：:]*(?:${startWords}|生效|通过)`,
    `\\b${subject}\\b.{0,36}?\\b(?:is\\s+)?(?:authorized|admitted|allowed|unlocked|released)\\b`,
    `\\b${subject}\\b.{0,36}?\\bapproved\\b.{0,16}?\\bfor\\s+(?:implementation|development|start|proceeding)\\b`,
    `\\b(?:authorized|admitted|allowed|unlocked|released)\\b[ \\t,，:：]{1,8}\\b${subject}\\b`,
  ];
  const protectedSources = [
    `(?:不得|禁止|不应|不能|不可|严禁).{0,48}?(?:宣称|写入|记录|表示|标记|视为).{0,48}?${subject}.{0,36}?${positiveToken}`,
    `${subject}.{0,24}?(?:不得|禁止|不应|不能|不可|严禁).{0,48}?(?:宣称|写入|记录|表示|标记|视为).{0,48}?${positiveToken}`,
    `(?:不|未|无|尚未|没有|不得|禁止|不应|不能|不可)(?:予以|进行|为)?(?:授权|批准|准入)[^。；;！？!?\\n]{0,24}?${subject}[^。；;！？!?\\n]{0,24}`,
  ];
  const ranges = (sources) => sources.flatMap((source) => [...normalized.matchAll(new RegExp(source, 'gi'))].map((match) => [match.index, match.index + match[0].length]));
  const protectedRanges = ranges(protectedSources);
  const contradictory = ranges(positiveSources).some(([start, end]) => !protectedRanges.some(([safeStart, safeEnd]) => safeStart <= start && safeEnd >= end));
  if (/g0_evidence_a2_authorization[ \t]*[:=][ \t]*authorized/i.test(normalized) || contradictory) throw new Error(`${GATE_PREP_EVIDENCE_ID} ${path} contains a contradictory A2 authorization statement`);
}
function requiredMarkdownSection(text, heading, path) {
  const parsed = /^(#{1,6})[ \t]+(.+)$/.exec(heading);
  if (!parsed) throw new Error(`RP-02B2a invalid required markdown heading: ${heading}`);
  const [, hashes, title] = parsed, escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...text.matchAll(new RegExp(`^${hashes}[ \\t]+${escapedTitle}[ \\t]*\\r?$`, 'gm'))];
  if (matches.length !== 1) throw new Error(`${GATE_PREP_EVIDENCE_ID} ${path} requires exactly one ${heading} section`);
  const start = matches[0].index + matches[0][0].length, remainder = text.slice(start);
  const nextHeading = new RegExp(`^#{1,${hashes.length}}[ \\t]+`, 'm').exec(remainder);
  return nextHeading ? remainder.slice(0, nextHeading.index) : remainder;
}
function evidenceFieldSection(text, path) {
  if (path === 'docs/reviews/main-control-status.md') return requiredMarkdownSection(text, '## 7. 当前唯一推荐动作', path);
  if (path === 'docs/reviews/main-control-event-ledger.md') return requiredMarkdownSection(text, '### MCE-RP02B2A2-G0-E1-REMOTE-ACCEPTED', path);
  return requiredMarkdownSection(text, '### 7.3 G0 accepted code head 与远程关闭证据', path);
}
function gatePrepTestCountAt(head) {
  const count = readAdrText(GATE_PREP_TEST_PATH, head, false).match(/\bit\s*\(/g)?.length ?? 0;
  if (count < 1) throw new Error(`${GATE_PREP_EVIDENCE_ID} cannot derive the accepted G0 package gate test count`);
  return `${count}/${count}`;
}
function assertGatePrepEvidenceCurrentState({ path, text, base, gatePrep, runs, gateCount }) {
  const shortBase = base.slice(0, 7), runByLabel = Object.fromEntries(runs), fail = (detail) => { throw new Error(`${GATE_PREP_EVIDENCE_ID} ${path} ${detail}`); };
  if (path === 'docs/reviews/main-control-status.md') {
    const progressSection = requiredMarkdownSection(text, '### 1.1 复盘整改进度', path), actionSection = requiredMarkdownSection(text, '## 7. 当前唯一推荐动作', path);
    const lines = progressSection.split(/\r?\n/), progress = /总体关闭进度[\s\S]*?当前包阶段：/.exec(progressSection)?.[0] ?? '';
    const packageLines = lines.filter((line) => /^当前整改包\s+/.test(line)), stateLines = lines.filter((line) => /^当前状态\s+/.test(line));
    const rows = lines.filter((line) => line.includes('| RP-02B2a2-G0 整改后最终复核 |')), actions = actionSection.split(/\r?\n/).filter((line) => /^1\. .*RP-02B2a2-G0/.test(line));
    if (packageLines.length !== 1 || stateLines.length !== 1 || rows.length !== 1 || actions.length !== 1) fail('requires unique current-package, current-state, final-review, and numbered-action entries');
    const row = rows[0], action = actions[0], currentState = [...packageLines, ...stateLines, row, action];
    if (currentState.some((line) => /待提交|\bpending\b|旧(?:快照|计数|差异)|40\/40/i.test(line))) fail('must remove residual pending or stale G0 counts from current state');
    if (!progress.includes(`当前整改包    RP-02B2a2-G0 accepted code head ${shortBase}`) || !progress.includes('四路远程 CI 已通过') || !new RegExp(`当前状态.*G0 accepted code head ${shortBase}.*远程 runs.*success.*B2a2.*not_authorized`).test(progress)) fail('must replace the current progress block with the accepted G0 remote-success state');
    if (!row.includes('| 已完成 |') || !row.includes(`accepted code head \`${shortBase}\``) || !row.includes(`${gatePrep.files} files / ${gatePrep.netAdditions} net additions`) || !row.includes(`package gate ${gateCount}`)) fail('must replace the G0 final-review row with the final package counts');
    if (!action.includes(`accepted code head \`${shortBase}\``) || !action.includes('四路远程 CI 已完成') || action.includes('待提交')) fail('must replace the current recommended action with the closed G0 state');
    return;
  }
  if (path === 'docs/reviews/main-control-event-ledger.md') {
    const event = requiredMarkdownSection(text, '### MCE-RP02B2A2-G0-E1-REMOTE-ACCEPTED', path);
    if (!event.includes('event_type: governance_bootstrap_remote_accepted') || !event.includes(`accepted_code_head: ${base}`) || !event.includes(`package_id: ${GATE_PREP_EVIDENCE_ID}`) || !/mc_decision: RP-02B2a2-G0 关闭；.*B2a2.*not_authorized/.test(event)) fail('remote-accepted event is incomplete or contradictory');
    return;
  }
  const section = requiredMarkdownSection(text, '### 7.3 G0 accepted code head 与远程关闭证据', path);
  const expected = [`accepted_code_head | \`${base}\``, `${gatePrep.files} files / ${gatePrep.netAdditions} net additions`, `package gate ${gateCount}`, `run \`${runByLabel.rp01a}\``, `run \`${runByLabel.rp01b}\``, `run \`${runByLabel.rp01c}\``, `run \`${runByLabel.governance}\``, 'B2a2 继续 `not_authorized`'];
  if (expected.some((item) => !section.includes(item))) fail('final G0 evidence section is missing accepted counts, runs, or authorization boundary');
}
function validateGatePrepEvidencePublication({ base, head, worktree }) {
  const gatePrep = gatePrepCommitForHead(head);
  if (gatePrep !== base) throw new Error(`${GATE_PREP_EVIDENCE_ID} requires its verified G0 commit as the direct base`);
  const gatePrepResult = validateGatePrepBase(base), gateCount = gatePrepTestCountAt(base);
  if (worktree) {
    if (head !== base) throw new Error(`${GATE_PREP_EVIDENCE_ID} worktree HEAD must equal its verified G0 base`);
  } else {
    const commitAndParents = gitText(['rev-list', '--parents', '-n', '1', head]).trim().split(/\s+/);
    if (commitAndParents.length !== 2 || commitAndParents[1] !== base) throw new Error(`${GATE_PREP_EVIDENCE_ID} must be one direct child commit of its verified G0 base`);
  }
  if (adrReadyAt(head, PACKAGE_DEFINITIONS['RP-02B2a2'])) throw new Error(`${GATE_PREP_EVIDENCE_ID} cannot authorize RP-02B2a2`);
  const records = [...GATE_PREP_EVIDENCE_FILES].map((path) => {
    const text = readAdrText(path, head, worktree);
    const fieldSection = evidenceFieldSection(text, path);
    assertExactEvidenceFieldSet(text, path);
    const values = Object.fromEntries(GATE_PREP_EVIDENCE_FIELDS.map((field) => [field, evidenceField(fieldSection, field, path)]));
    if (!worktree && text.includes(head)) throw new Error(`${GATE_PREP_EVIDENCE_ID} cannot record its own publication SHA`);
    assertNoA2AuthorizationContradiction(text, path);
    return { path, text, values };
  });
  for (const record of records) if (JSON.stringify(record.values) !== JSON.stringify(records[0].values)) throw new Error(`${GATE_PREP_EVIDENCE_ID} evidence fields must match across all three files`);
  const evidence = records[0].values;
  if (evidence.g0_evidence_parent_sha !== base) throw new Error(`${GATE_PREP_EVIDENCE_ID} g0_evidence_parent_sha must equal the verified G0 base`);
  if (evidence.g0_evidence_a2_authorization !== 'not_authorized') throw new Error(`${GATE_PREP_EVIDENCE_ID} must preserve A2 not_authorized`);
  if (evidence.g0_evidence_issue_closed_count !== '9/42' || evidence.g0_evidence_rmd_task_002 !== 'partial' || evidence.g0_evidence_rmd_task_003 !== 'open') throw new Error(`${GATE_PREP_EVIDENCE_ID} must preserve ledger 9/42 with RMD-TASK-002 partial and RMD-TASK-003 open`);
  const runs = ['rp01a', 'rp01b', 'rp01c', 'governance'].map((label) => [label, evidence[`g0_evidence_${label}_run`]]);
  if (runs.some(([, id]) => !/^[1-9][0-9]{7,}$/.test(id)) || new Set(runs.map(([, id]) => id)).size !== runs.length) throw new Error(`${GATE_PREP_EVIDENCE_ID} requires four unique numeric parent run ids`);
  for (const record of records) assertGatePrepEvidenceCurrentState({ path: record.path, text: record.text, base, gatePrep: gatePrepResult, runs, gateCount });
  return { parent: base, runs: runs.map(([label, id]) => `${label}:${id}`).join(',') };
}
function assertA2HistoryDoesNotInheritEvidencePublication(gatePrep, head) {
  if (gatePrep === head) return;
  const touched = splitNulBuffer(gitBuffer(['log', '-m', '--format=', '--name-only', '-z', `${gatePrep}..${head}`, '--', ...[...GATE_PREP_EVIDENCE_FILES].map((path) => `:(literal)${path}`)])).map(decodeGitPath);
  if (touched.length > 0) throw new Error(`RP-02B2a2 history cannot touch, delete, inherit, or merge ${GATE_PREP_EVIDENCE_ID} files; A2 must remain a sibling branch from the accepted G0 code head`);
}
function commitPathDescriptor(head, path) {
  const records = splitNulBuffer(gitBuffer(['ls-tree', '-z', '--full-tree', head, '--', `:(literal)${path}`]));
  if (records.length === 0) return { path, state: 'missing' };
  if (records.length !== 1) throw new Error(`RP-02B2a package gate found ambiguous manifest path: ${path}`);
  const tab = records[0].indexOf(0x09), meta = records[0].subarray(0, tab).toString('ascii').split(' ');
  if (tab < 0 || !['100644', '100755'].includes(meta[0]) || meta[1] !== 'blob' || !/^[0-9a-f]{40,64}$/.test(meta[2] ?? '')) throw new Error(`RP-02B2a package gate rejects non-regular manifest path: ${path}`);
  return { path, mode: meta[0], object: meta[2] };
}
function packageManifestDigest(definition, { base, head }) {
  return createHash('sha256').update(JSON.stringify({
    policy_version: 'RP-02B2a-trusted-admission-v2',
    package_id: definition.packageId,
    manifest_id: definition.manifestId,
    adr_path: definition.adrPath,
    test_command: definition.testCommand,
    hard_max_files: definition.hardMaxFiles,
    hard_max_net_additions: definition.hardMaxNetAdditions,
    baseline_policy: definition.baselinePolicy,
    required_categories: [...definition.requiredCategories].sort(),
    base_sha: base,
    candidate_sha: head,
    manifest: [...definition.manifest].sort().map((path) => commitPathDescriptor(head, path))
  })).digest('hex');
}
function validateAcceptedGatePrepEvidence({ gateSource, evidenceHead }) {
  assertUsableSha('G0_EVIDENCE', evidenceHead); assertGitCommit('G0_EVIDENCE', evidenceHead);
  const commitAndParents = gitText(['rev-list', '--parents', '-n', '1', evidenceHead]).trim().split(/\s+/);
  if (commitAndParents.length !== 2 || commitAndParents[1] !== gateSource) throw new Error(`${GATE_PREP_EVIDENCE_ID} must be one direct child commit of the repository-controlled G0 gate source`);
  const diff = readGitDiff({ base: gateSource, head: evidenceHead, worktree: false });
  const result = analyzePackageGate({ ...diff, adrTextByPath: {}, base: gateSource, head: evidenceHead, worktree: false });
  if (result.packageId !== GATE_PREP_EVIDENCE_ID) throw new Error(`RP-02B2a trusted admission requires an accepted ${GATE_PREP_EVIDENCE_ID} receipt`);
  const receipt = validateGatePrepEvidencePublication({ base: gateSource, head: evidenceHead, worktree: false });
  const digest = createHash('sha256').update(JSON.stringify({
    policy_version: 'RP-02B2a-G0-E1-v1',
    parent_sha: gateSource,
    evidence_sha: evidenceHead,
    evidence_files: [...GATE_PREP_EVIDENCE_FILES].sort().map((path) => commitPathDescriptor(evidenceHead, path)),
    runs: receipt.runs
  })).digest('hex');
  return { sha: evidenceHead, digest };
}
function validateAcceptedBusinessPackage(packageId, head, gateSource, seen = new Set()) {
  if (!BUSINESS_PACKAGE_SEQUENCE.includes(packageId)) throw new Error(`RP-02B2a trusted admission rejects unsupported accepted predecessor package: ${packageId ?? '<missing>'}`);
  if (seen.has(packageId)) throw new Error(`RP-02B2a trusted admission rejects cyclic predecessor validation at ${packageId}`);
  seen.add(packageId);
  assertUsableSha(`${packageId}_ACCEPTED_HEAD`, head); assertGitCommit(`${packageId}_ACCEPTED_HEAD`, head);
  const definition = PACKAGE_DEFINITIONS[packageId], adr = parseAdr(readAdrText(definition.adrPath, head, false)), base = adr.baseline_sha;
  assertUsableSha(`${packageId}_BASELINE`, base); assertGitCommit(`${packageId}_BASELINE`, base);
  if (!isAncestor(base, head)) throw new Error(`${packageId} accepted predecessor baseline is not an ancestor of its head`);
  const expectedPredecessor = BUSINESS_PACKAGE_PREDECESSOR[packageId];
  if (expectedPredecessor === G0_CORRECTION_ID) {
    if (base !== gateSource) throw new Error(`${packageId} accepted predecessor must be rooted at the repository-controlled G0 gate source`);
    validateGatePrepBase(base);
  } else validateAcceptedBusinessPackage(expectedPredecessor, base, gateSource, seen);
  const diff = readGitDiff({ base, head, worktree: false }), changedAdrs = diff.files.filter((file) => file.startsWith('docs/adr/rp-02b2a') && file.endsWith('.md'));
  const adrTextByPath = Object.fromEntries(changedAdrs.map((path) => [path, readAdrText(path, head, false)]));
  const result = analyzePackageGate({ ...diff, adrTextByPath, base, head, worktree: false });
  if (result.packageId !== packageId) throw new Error(`${packageId} accepted predecessor structurally resolves as ${result.packageId}`);
  validateCandidatePackageScripts({ packageId, head, base, worktree: false });
  seen.delete(packageId);
  return result;
}
function validateBusinessAuthorization({ packageId, base, head, gateSource, g0EvidenceSha, authorizedPackageId, authorizedPredecessorSha }) {
  if (!BUSINESS_PACKAGE_SEQUENCE.includes(packageId)) return undefined;
  if (authorizedPackageId !== packageId) throw new Error(`RP-02B2a trusted admission package mismatch: candidate ${packageId} != repository-authorized ${authorizedPackageId ?? '<missing>'}`);
  assertUsableSha('GATE_SOURCE', gateSource); assertGitCommit('GATE_SOURCE', gateSource);
  try { validateGatePrepBase(gateSource); } catch (error) { throw new Error(`RP-02B2a2 must branch directly from the accepted G0 code head: ${error.message}`); }
  const acceptedEvidence = validateAcceptedGatePrepEvidence({ gateSource, evidenceHead: g0EvidenceSha });
  assertUsableSha('AUTHORIZED_PREDECESSOR', authorizedPredecessorSha); assertGitCommit('AUTHORIZED_PREDECESSOR', authorizedPredecessorSha);
  if (base !== authorizedPredecessorSha) throw new Error(`RP-02B2a trusted admission must analyze the cumulative authorized-predecessor range: ${base ?? '<missing>'} != ${authorizedPredecessorSha}`);
  if (!isAncestor(gateSource, base) || !isAncestor(base, head)) throw new Error('RP-02B2a trusted admission rejects stale, unrelated, or non-ancestor authorization topology');
  const predecessorPackage = BUSINESS_PACKAGE_PREDECESSOR[packageId];
  if (predecessorPackage === G0_CORRECTION_ID) {
    if (authorizedPredecessorSha !== gateSource) throw new Error('RP-02B2a2 authorized predecessor must equal the accepted G0 gate source and must not be E1');
  } else validateAcceptedBusinessPackage(predecessorPackage, authorizedPredecessorSha, gateSource);
  assertA2HistoryDoesNotInheritEvidencePublication(gateSource, head);
  return { gateSource, g0EvidenceSha: acceptedEvidence.sha, g0EvidenceDigest: acceptedEvidence.digest, authorizedPredecessor: authorizedPredecessorSha, manifestDigest: packageManifestDigest(PACKAGE_DEFINITIONS[packageId], { base, head }) };
}
function validateGatePrepPackageScripts({ packageId, head, worktree }) {
  if (packageId !== B2A2_GATE_PREP_ID) return;
  let text, baseText;
  try { text = worktree ? readFileSync(resolve('package.json'), 'utf8') : gitText(['show', `${head}:package.json`]); baseText = gitText(['show', `${B2A2_GATE_PREP_BASELINE_SHA}:package.json`]); }
  catch { throw new Error(`${packageId} candidate HEAD requires readable package.json`); }
  let packageJson, basePackageJson;
  try { packageJson = JSON.parse(text); basePackageJson = JSON.parse(baseText); }
  catch (error) { throw new Error(`${packageId} candidate HEAD package.json is invalid JSON: ${error.message}`); }
  assertPackageNonScriptsEqual(packageJson, basePackageJson, packageId);
  const scripts = packageJson && typeof packageJson === 'object' && !Array.isArray(packageJson) ? packageJson.scripts : undefined;
  const baseScripts = basePackageJson && typeof basePackageJson === 'object' && !Array.isArray(basePackageJson) ? basePackageJson.scripts : undefined;
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) throw new Error(`${packageId} candidate HEAD requires scripts mapping`);
  if (!baseScripts || typeof baseScripts !== 'object' || Array.isArray(baseScripts)) throw new Error(`${packageId} fixed baseline requires scripts mapping`);
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) if (Object.hasOwn(scripts, lifecycle)) throw new Error(`${packageId} candidate HEAD rejects root npm lifecycle script ${lifecycle}`);
  for (const [name, expected] of Object.entries(baseScripts)) {
    const required = GATE_PREP_A1_SCRIPTS[name] ?? expected;
    if (scripts[name] !== required) throw new Error(`${packageId} candidate HEAD cannot rewrite inherited package.json script ${name}`);
  }
  for (const name of Object.keys(scripts)) if (!Object.hasOwn(baseScripts, name)) throw new Error(`${packageId} candidate HEAD cannot add package.json script ${name}`);
  for (const [name, expected] of Object.entries(GATE_PREP_A1_SCRIPTS)) if (scripts[name] !== expected) throw new Error(`${packageId} candidate HEAD package.json script ${name} does not match the actor-clean contract`);
}
function validateCandidatePackageScripts({ packageId, head, base, worktree }) {
  if (!BUSINESS_PACKAGE_SEQUENCE.includes(packageId)) return;
  let text, baseText;
  try { text = worktree ? readFileSync(resolve('package.json'), 'utf8') : gitText(['show', `${head}:package.json`]); baseText = gitText(['show', `${base}:package.json`]); }
  catch { throw new Error(`${packageId} candidate HEAD requires readable package.json`); }
  let packageJson, basePackageJson;
  try { packageJson = JSON.parse(text); basePackageJson = JSON.parse(baseText); }
  catch (error) { throw new Error(`${packageId} candidate HEAD package.json is invalid JSON: ${error.message}`); }
  assertPackageNonScriptsEqual(packageJson, basePackageJson, packageId);
  const scripts = packageJson && typeof packageJson === 'object' && !Array.isArray(packageJson) ? packageJson.scripts : undefined;
  const baseScripts = basePackageJson && typeof basePackageJson === 'object' && !Array.isArray(basePackageJson) ? basePackageJson.scripts : undefined;
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) throw new Error(`${packageId} candidate HEAD package.json requires scripts mapping`);
  if (!baseScripts || typeof baseScripts !== 'object' || Array.isArray(baseScripts)) throw new Error(`${packageId} verified gate-prep package requires scripts mapping`);
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) if (Object.hasOwn(scripts, lifecycle)) throw new Error(`${packageId} candidate HEAD rejects root npm lifecycle script ${lifecycle}`);
  for (const [name, expected] of Object.entries(baseScripts)) if (scripts[name] !== expected) throw new Error(`${packageId} candidate HEAD cannot rewrite inherited package.json script ${name}`);
  const additions = BUSINESS_PACKAGE_SCRIPT_ADDITIONS[packageId];
  for (const name of Object.keys(scripts)) if (!Object.hasOwn(baseScripts, name) && !Object.hasOwn(additions, name)) throw new Error(`${packageId} candidate HEAD cannot add unapproved package.json script ${name}`);
  for (const [name, expected] of Object.entries(additions)) {
    if (scripts[name] !== expected) throw new Error(`${packageId} candidate HEAD package.json script ${name} does not match the env-clean fail-fast contract`);
  }
}
function normalizedWorkflowActionShape(value) {
  if (Array.isArray(value)) return value.map(normalizedWorkflowActionShape);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if (key === 'uses' && typeof child === 'string') return [key, child.replace(/@[^@]+$/, '@<pinned>')];
    return [key, normalizedWorkflowActionShape(child)];
  }));
}
function collectWorkflowUses(value, output = []) {
  if (Array.isArray(value)) { for (const child of value) collectWorkflowUses(child, output); return output; }
  if (!value || typeof value !== 'object') return output;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'uses' && typeof child === 'string') output.push(child);
    else collectWorkflowUses(child, output);
  }
  return output;
}
function hardenedEvidenceParentShape(value) {
  if (Array.isArray(value)) return value.map(hardenedEvidenceParentShape);
  if (!value || typeof value !== 'object') return value;
  const result = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, hardenedEvidenceParentShape(child)]));
  if (typeof result.uses === 'string' && result.uses.startsWith('actions/checkout@')) {
    const withConfig = result.with && typeof result.with === 'object' && !Array.isArray(result.with) ? result.with : {};
    result.with = { ...withConfig, 'persist-credentials': 'false' };
  }
  return result;
}
function verifyPinnedEvidenceParentWorkflows({ head, worktree }) {
  const expectedByPath = {
    '.github/workflows/rp01a-e2e.yml': ['actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5', 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020', 'actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830', 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'],
    '.github/workflows/rp01b-dom.yml': ['actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5', 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020'],
    '.github/workflows/remediation-governance.yml': ['actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5', 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020']
  };
  for (const [path, expectedUses] of Object.entries(expectedByPath)) {
    const candidate = parseWorkflowYaml(path, worktree ? undefined : head), baseline = parseWorkflowYaml(path, B2A2_GATE_PREP_BASELINE_SHA);
    const actualUses = collectWorkflowUses(candidate);
    if (JSON.stringify(actualUses) !== JSON.stringify(expectedUses)) throw new Error(`${B2A2_GATE_PREP_ID} ${path} action pins mismatch`);
    const expected = hardenedEvidenceParentShape(baseline);
    expected.permissions = { contents: 'read' };
    if (JSON.stringify(canonicalJson(normalizedWorkflowActionShape(candidate))) !== JSON.stringify(canonicalJson(normalizedWorkflowActionShape(expected)))) throw new Error(`${B2A2_GATE_PREP_ID} ${path} must equal the inherited workflow plus frozen action SHAs, read-only permissions, and non-persistent checkout credentials`);
  }
}
export function verifyWorkflowContract({ workflowPath, packageId, testCommand, triggerFile, head }) {
  const workflow = parseWorkflowYaml(workflowPath, head); assertNoDefaultShell(workflow, 'workflow');
  assertExactKeys(workflow, ['name', 'on', 'permissions', 'jobs'], 'workflow root');
  const permissions = requireMapping(workflow.permissions, 'workflow permissions');
  if (JSON.stringify(permissions) !== JSON.stringify({ actions: 'read', contents: 'read' })) throw new Error('RP-02B2a workflow permissions must be exactly actions:read and contents:read');
  const triggers = requireMapping(workflow.on, 'workflow on'), dispatch = requireMapping(triggers.workflow_dispatch, 'workflow_dispatch'), inputs = requireMapping(dispatch.inputs, 'workflow_dispatch inputs');
  assertExactKeys(triggers, ['workflow_dispatch', 'push'], 'workflow triggers');
  assertExactKeys(dispatch, ['inputs'], 'workflow_dispatch');
  assertExactKeys(inputs, ['base_sha', 'head_sha'], 'workflow_dispatch inputs');
  const baseInput = requireMapping(inputs.base_sha, 'workflow_dispatch base_sha'), headInput = requireMapping(inputs.head_sha, 'workflow_dispatch head_sha');
  assertExactKeys(baseInput, ['description', 'required'], 'workflow_dispatch base_sha');
  assertExactKeys(headInput, ['description', 'required'], 'workflow_dispatch head_sha');
  if (baseInput.required !== 'true' || headInput.required !== 'true') throw new Error('RP-02B2a workflow requires base_sha/head_sha');
  const requiredFiles = [...new Set(Object.values(PACKAGE_DEFINITIONS).flatMap((item) => [...item.manifest]))];
  for (const event of ['push']) {
    const eventConfig = requireMapping(triggers[event], `workflow ${event}`);
    assertExactKeys(eventConfig, ['paths'], `workflow ${event}`);
    const paths = requireSequence(eventConfig.paths, `workflow ${event} paths`);
    if (paths.length === 0) throw new Error(`RP-02B2a workflow missing ${event} paths`);
    for (const file of requiredFiles) {
      if (!paths.some((pattern) => workflowPathCovers(pattern, file))) throw new Error(`RP-02B2a workflow ${event} missing required path: ${file}`);
    }
    if (triggerFile && !paths.some((pattern) => workflowPathCovers(pattern, triggerFile))) throw new Error(`RP-02B2a workflow ${event} skips changed file: ${triggerFile}`);
  }
  const jobs = requireMapping(workflow.jobs, 'workflow jobs');
  assertExactKeys(jobs, ['rp01c-fixtures'], 'workflow jobs');
  const job = requireMapping(jobs['rp01c-fixtures'], 'rp01c-fixtures job'); assertNoDefaultShell(job, 'job');
  assertExactKeys(job, ['runs-on', 'timeout-minutes', 'env', 'steps'], 'rp01c-fixtures job');
  if (job['runs-on'] !== 'ubuntu-latest' || job['timeout-minutes'] !== '20') throw new Error('RP-02B2a workflow job runner or timeout mismatch');
  const jobEnv = requireMapping(job.env, 'rp01c-fixtures job env');
  if (JSON.stringify(jobEnv) !== JSON.stringify({ AI_PROVIDER_MODE: 'mock', E2E_PROFILE: 'rp01a-local-inmemory' })) throw new Error('RP-02B2a workflow job env mismatch');
  const steps = requireSequence(job.steps, 'rp01c-fixtures steps').map((step, index) => requireMapping(step, `rp01c-fixtures step ${index + 1}`));
  const checkoutAction = 'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5';
  const setupNodeAction = 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020';
  const checkout = findSingleStep(steps, (step) => step.uses === checkoutAction, checkoutAction);
  assertExactKeys(checkout, ['uses', 'with'], 'checkout step');
  const checkoutWith = requireMapping(checkout.with, `${checkoutAction} with`);
  const expectedCheckoutRef = "${{ github.event_name == 'workflow_dispatch' && inputs.head_sha || github.event.after }}";
  if (checkoutWith.ref !== expectedCheckoutRef || checkoutWith.ref.includes('github.sha')) throw new Error('RP-02B2a workflow checkout ref is not bound to selected head');
  assertExactKeys(checkoutWith, ['fetch-depth', 'ref', 'persist-credentials'], 'checkout with');
  if (checkoutWith['fetch-depth'] !== '0' || checkoutWith['persist-credentials'] !== 'false') throw new Error('RP-02B2a workflow checkout must fetch full history without persisted credentials');
  const setupNode = findSingleStep(steps, (step) => step.uses === setupNodeAction, setupNodeAction);
  assertExactKeys(setupNode, ['uses', 'with'], 'setup-node step');
  const setupNodeWith = requireMapping(setupNode.with, `${setupNodeAction} with`);
  if (JSON.stringify(setupNodeWith) !== JSON.stringify({ 'node-version': '24.14.0', cache: 'npm' })) throw new Error('RP-02B2a workflow setup-node contract mismatch');
  const rangeStep = findNamedStep(steps, 'Resolve B2a package gate range'), resolverStep = findNamedStep(steps, 'Resolve B2a package command'), selfCheckStep = findNamedStep(steps, 'Verify B2a workflow contract'), evidenceStep = findNamedStep(steps, 'Verify G0 evidence parent runs');
  if (rangeStep.id !== 'b2a-range' || resolverStep.id !== 'b2a-package') throw new Error('RP-02B2a workflow dynamic package step ids mismatch');
  const selectedTestStep = findSingleStep(steps, (step) => typeof step.run === 'string' && step.run.includes('npm run "$B2A_TEST_COMMAND"'), 'selected package command');
  const installStep = findSingleStep(steps, (step) => step.run === 'npm ci', 'npm ci');
  const expectedStepIdentities = [`uses:${checkoutAction}`, `uses:${setupNodeAction}`, 'name:Resolve B2a package gate range', 'name:Resolve B2a package command', 'name:Verify B2a workflow contract', 'name:Verify G0 evidence parent runs', 'run:npm ci', 'run:./node_modules/.bin/playwright install chromium', 'run:npm run test:rp01c', 'run:npm run test:rp02a', 'run:selected-package-command', 'run:npm test -w @ai-shortvideo/api', 'run:npm run test:e2e:rp01a', 'run:npm run test:governance', 'run:npm run typecheck', 'run:npm run build -w @ai-shortvideo/api', 'run:npm run prisma:validate -w @ai-shortvideo/api', 'run:git diff --check', 'run:npm run governance:git-budget'];
  const actualStepIdentities = steps.map(workflowStepIdentity);
  if (JSON.stringify(actualStepIdentities) !== JSON.stringify(expectedStepIdentities)) throw new Error('RP-02B2a workflow step sequence contains missing, extra, or reordered execution');
  const expectedStepKeys = [['uses', 'with'], ['uses', 'with'], ['name', 'id', 'env', 'run'], ['name', 'id', 'env', 'run'], ['name', 'env', 'run'], ['name', 'if', 'env', 'run'], ['run'], ['run'], ['run'], ['run'], ['env', 'run'], ['run'], ['run'], ['run'], ['run'], ['run'], ['run'], ['run'], ['run']];
  steps.forEach((step, index) => assertExactKeys(step, expectedStepKeys[index], `rp01c-fixtures step ${index + 1}`));
  assertStepEnv(rangeStep, { EVENT_NAME: '${{ github.event_name }}', PUSH_CREATED: '${{ github.event.created }}', PUSH_BEFORE_SHA: '${{ github.event.before }}', PUSH_AFTER_SHA: '${{ github.event.after }}', MANUAL_BASE_SHA: '${{ inputs.base_sha }}', MANUAL_HEAD_SHA: '${{ inputs.head_sha }}', B2A_AUTHORIZED_PACKAGE_ID: '${{ vars.RP02B2A_AUTHORIZED_PACKAGE_ID }}', B2A_AUTHORIZED_PREDECESSOR_SHA: '${{ vars.RP02B2A_AUTHORIZED_PREDECESSOR_SHA }}' }, 'range resolver');
  assertStepEnv(resolverStep, { B2A_BASE_SHA: '${{ steps.b2a-range.outputs.base }}', B2A_HEAD_SHA: '${{ steps.b2a-range.outputs.head }}', B2A_GATE_SOURCE_SHA: '${{ vars.RP02B2A_GATE_SOURCE_SHA }}', B2A_G0_EVIDENCE_SHA: '${{ vars.RP02B2A_G0_EVIDENCE_SHA }}', B2A_AUTHORIZED_PACKAGE_ID: '${{ vars.RP02B2A_AUTHORIZED_PACKAGE_ID }}', B2A_AUTHORIZED_PREDECESSOR_SHA: '${{ vars.RP02B2A_AUTHORIZED_PREDECESSOR_SHA }}' }, 'package resolver');
  assertStepEnv(selfCheckStep, { B2A_PACKAGE_ID: '${{ steps.b2a-package.outputs.package_id }}', B2A_TEST_COMMAND: '${{ steps.b2a-package.outputs.test_command }}' }, 'workflow self-check');
  assertStepEnv(evidenceStep, { GH_TOKEN: '${{ github.token }}', GITHUB_REPOSITORY: '${{ github.repository }}', B2A_BASE_SHA: '${{ steps.b2a-range.outputs.base }}', B2A_HEAD_SHA: '${{ steps.b2a-range.outputs.head }}', EVIDENCE_PARENT: '${{ steps.b2a-package.outputs.evidence_parent }}', EVIDENCE_RUNS: '${{ steps.b2a-package.outputs.evidence_runs }}' }, 'evidence parent runs');
  assertStepEnv(selectedTestStep, { B2A_TEST_COMMAND: '${{ steps.b2a-package.outputs.test_command }}' }, 'selected package command');
  if (!(steps.indexOf(rangeStep) < steps.indexOf(resolverStep) && steps.indexOf(resolverStep) < steps.indexOf(selfCheckStep) && steps.indexOf(selfCheckStep) < steps.indexOf(evidenceStep) && steps.indexOf(evidenceStep) < steps.indexOf(installStep))) throw new Error('RP-02B2a workflow package gate and evidence verification must complete before npm ci');
  assertShellBlock(rangeStep, rangeCommands(), 'range resolver');
  assertShellBlock(resolverStep, ['set -euo pipefail', `${GATE_ENV_COMMAND} node scripts/rp02b2a-package-gate.mjs --github-output --base "$B2A_BASE_SHA" --head "$B2A_HEAD_SHA" --gate-source "$B2A_GATE_SOURCE_SHA" --g0-evidence-sha "$B2A_G0_EVIDENCE_SHA" --authorized-package-id "$B2A_AUTHORIZED_PACKAGE_ID" --authorized-predecessor-sha "$B2A_AUTHORIZED_PREDECESSOR_SHA" >> "$GITHUB_OUTPUT"`], 'package resolver');
  assertShellBlock(selfCheckStep, ['set -euo pipefail', `${GATE_ENV_COMMAND} node scripts/rp02b2a-package-gate.mjs --verify-workflow .github/workflows/rp01c-fixtures.yml --package-id "$B2A_PACKAGE_ID" --test-command "$B2A_TEST_COMMAND"`], 'workflow self-check');
  assertShellBlock(evidenceStep, evidenceRunCommands(), 'evidence parent runs');
  assertShellBlock(selectedTestStep, ['set -euo pipefail', `${GATE_ENV_COMMAND} npm run "$B2A_TEST_COMMAND"`], 'selected package command');
  for (const [index, step] of steps.entries()) if (step !== evidenceStep) assertRequiredStepEnabled(step, index + 1);
  if (evidenceStep.if !== "steps.b2a-package.outputs.package_id == 'RP-02B2a2-G0-E1'" || Object.hasOwn(evidenceStep, 'shell') || (Object.hasOwn(evidenceStep, 'continue-on-error') && evidenceStep['continue-on-error'] !== 'false')) throw new Error('RP-02B2a workflow evidence step condition or failure semantics mismatch');
  if (packageId || testCommand) { const definition = PACKAGE_DEFINITIONS[packageId], fallback = packageId === FALLBACK_PACKAGE_ID && testCommand === FALLBACK_TEST_COMMAND, evidence = packageId === GATE_PREP_EVIDENCE_ID && testCommand === GATE_PREP_EVIDENCE_COMMAND; if ((!definition || definition.testCommand !== testCommand) && !fallback && !evidence) throw new Error(`RP-02B2a workflow package command mismatch: ${packageId}/${testCommand}`); }
  return { requiredFiles: requiredFiles.length };
}
export function verifyTrustedAdmissionWorkflowContract({ workflowPath = TRUSTED_ADMISSION_WORKFLOW, head } = {}) {
  if (workflowPath !== TRUSTED_ADMISSION_WORKFLOW) throw new Error(`RP-02B2a trusted admission workflow path must be ${TRUSTED_ADMISSION_WORKFLOW}`);
  const workflowText = readWorkflowText(workflowPath, head);
  const workflow = parseWorkflowYaml(workflowPath, head);
  assertExactKeys(workflow, ['name', 'on', 'concurrency', 'permissions', 'jobs'], 'trusted workflow root');
  if (workflow.name !== 'RP-02B2a trusted admission') throw new Error('RP-02B2a trusted admission workflow name mismatch');
  const triggers = requireMapping(workflow.on, 'trusted workflow on');
  assertExactKeys(triggers, ['pull_request_target'], 'trusted workflow triggers');
  const pullRequestTarget = requireMapping(triggers.pull_request_target, 'trusted pull_request_target');
  assertExactKeys(pullRequestTarget, ['types'], 'trusted pull_request_target');
  const types = requireSequence(pullRequestTarget.types, 'trusted pull_request_target types');
  if (JSON.stringify(types) !== JSON.stringify(['opened', 'synchronize', 'reopened', 'ready_for_review'])) throw new Error('RP-02B2a trusted admission trigger types mismatch');
  const concurrency = requireMapping(workflow.concurrency, 'trusted workflow concurrency');
  if (JSON.stringify(concurrency) !== JSON.stringify({ group: 'rp02b2a-admission-pr-${{ github.event.pull_request.number }}', 'cancel-in-progress': 'true' })) throw new Error('RP-02B2a trusted admission concurrency must cancel stale runs for the same PR');
  const permissions = requireMapping(workflow.permissions, 'trusted workflow permissions');
  if (JSON.stringify(permissions) !== JSON.stringify({ actions: 'read', contents: 'read', 'pull-requests': 'read' })) throw new Error('RP-02B2a trusted admission permissions must be exactly actions/contents/pull-requests read');
  const jobs = requireMapping(workflow.jobs, 'trusted workflow jobs');
  assertExactKeys(jobs, ['admission', 'candidate'], 'trusted workflow jobs');
  const digest = createHash('sha256').update(workflowText.replace(/\r\n/g, '\n')).digest('hex');
  if (digest !== TRUSTED_ADMISSION_WORKFLOW_CANONICAL_SHA256) throw new Error(`RP-02B2a trusted admission workflow canonical contract mismatch: ${digest}`);
  return { workflowPath, digest };
}
function workflowPathCovers(pattern, file) { if (typeof pattern !== 'string') return false; if (pattern.endsWith('/**')) return file.startsWith(pattern.slice(0, -3)); if (pattern.endsWith('.*')) return file.startsWith(pattern.slice(0, -1)); return pattern === file; }
function workflowStepIdentity(step) {
  if (typeof step.uses === 'string') return `uses:${step.uses}`;
  if (typeof step.name === 'string') return `name:${step.name}`;
  if (step.run === 'npm ci' || (typeof step.run === 'string' && !step.run.includes('\n'))) return `run:${step.run}`;
  if (typeof step.run === 'string' && step.run.includes('npm run "$B2A_TEST_COMMAND"')) return 'run:selected-package-command';
  return 'unknown';
}
function rangeCommands() { const authorization = '--authorized-package-id "$B2A_AUTHORIZED_PACKAGE_ID" --authorized-predecessor-sha "$B2A_AUTHORIZED_PREDECESSOR_SHA"'; return ['set -euo pipefail', 'if [[ "$EVENT_NAME" == "push" ]]; then', GATE_ENV_COMMAND + ` node scripts/rp02b2a-package-gate.mjs --print-range --event push --push-created "$PUSH_CREATED" --push-before "$PUSH_BEFORE_SHA" --push-head "$PUSH_AFTER_SHA" ${authorization} >> "$GITHUB_OUTPUT"`, 'elif [[ "$EVENT_NAME" == "workflow_dispatch" ]]; then', GATE_ENV_COMMAND + ` node scripts/rp02b2a-package-gate.mjs --print-range --event workflow_dispatch --manual-base "$MANUAL_BASE_SHA" --manual-head "$MANUAL_HEAD_SHA" ${authorization} >> "$GITHUB_OUTPUT"`, 'else', 'echo "RP-01C only accepts trusted push or explicit workflow_dispatch ranges" >&2', 'exit 1', 'fi', 'BASE="$(grep \'^base=\' "$GITHUB_OUTPUT" | tail -n1 | cut -d= -f2-)"', 'HEAD="$(grep \'^head=\' "$GITHUB_OUTPUT" | tail -n1 | cut -d= -f2-)"', 'if [[ -z "$BASE" || -z "$HEAD" || "$BASE" =~ ^0+$ || "$HEAD" =~ ^0+$ ]]; then', 'echo "B2a package gate requires explicit non-zero BASE/HEAD" >&2', 'exit 1', 'fi', 'test "$(git rev-parse HEAD)" = "$(git rev-parse "$HEAD")"']; }
function evidenceRunCommands() { return ['set -euo pipefail', 'test "$B2A_BASE_SHA" = "$EVIDENCE_PARENT"', `IFS=',' read -r -a RUNS <<< "$EVIDENCE_RUNS"`, 'test "${#RUNS[@]}" -eq 4', 'declare -A SEEN_LABELS=() SEEN_RUN_IDS=()', 'for item in "${RUNS[@]}"; do', 'label="${item%%:*}"', 'run_id="${item#*:}"', 'case "$label" in', 'rp01a) expected="RP-01A backend E2E"; workflow_file="rp01a-e2e.yml"; expected_path=".github/workflows/$workflow_file" ;;', 'rp01b) expected="RP-01B admin DOM tests"; workflow_file="rp01b-dom.yml"; expected_path=".github/workflows/$workflow_file" ;;', 'rp01c) expected="RP-01C deterministic fixtures"; workflow_file="rp01c-fixtures.yml"; expected_path=".github/workflows/$workflow_file" ;;', 'governance) expected="Remediation governance"; workflow_file="remediation-governance.yml"; expected_path=".github/workflows/$workflow_file" ;;', '*) exit 1 ;;', 'esac', '[[ "$run_id" =~ ^[1-9][0-9]+$ ]] || { echo "parent run id is invalid" >&2; exit 1; }', 'test -z "${SEEN_LABELS[$label]+x}" || { echo "duplicate workflow label" >&2; exit 1; }', 'test -z "${SEEN_RUN_IDS[$run_id]+x}" || { echo "duplicate workflow run id" >&2; exit 1; }', 'SEEN_LABELS[$label]=1', 'SEEN_RUN_IDS[$run_id]=1', `IFS=$'\\t' read -r expected_workflow_id repository_path < <(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/$workflow_file" --jq '[.id,.path] | @tsv')`, '[[ "$expected_workflow_id" =~ ^[1-9][0-9]+$ ]] || { echo "workflow id lookup is invalid" >&2; exit 1; }', 'test "$repository_path" = "$expected_path" || { echo "workflow repository path mismatch" >&2; exit 1; }', `IFS=$'\\t' read -r name workflow_path workflow_id event run_head status conclusion < <(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$run_id" --jq '[.name,.path,.workflow_id,.event,.head_sha,.status,.conclusion] | @tsv')`, 'test "$name" = "$expected" || { echo "workflow name mismatch" >&2; exit 1; }', 'case "$workflow_path" in', '"$expected_path") ;;', '"$expected_path"@*) workflow_ref="${workflow_path#"$expected_path"@}"; [[ "$workflow_ref" =~ ^[A-Za-z0-9][A-Za-z0-9._/@+-]{0,254}$ ]] || exit 1 ;;', '*) echo "workflow path mismatch" >&2; exit 1 ;;', 'esac', 'test "$workflow_id" = "$expected_workflow_id" || { echo "workflow id mismatch" >&2; exit 1; }', 'test "$event" = "push" || { echo "workflow event mismatch" >&2; exit 1; }', 'test "$run_head" = "$EVIDENCE_PARENT" || { echo "workflow head mismatch" >&2; exit 1; }', 'test "$status" = "completed" || { echo "workflow status mismatch" >&2; exit 1; }', 'test "$conclusion" = "success" || { echo "workflow conclusion mismatch" >&2; exit 1; }', 'git cat-file -e "${EVIDENCE_PARENT}:${expected_path}"', 'git cat-file -e "${B2A_HEAD_SHA}:${expected_path}"', 'git diff --quiet "$EVIDENCE_PARENT" "$B2A_HEAD_SHA" -- "$expected_path"', 'done']; }
function assertStepEnv(step, expected, label) { const actual = requireMapping(step.env, `${label} env`); const actualKeys = Object.keys(actual).sort(), expectedKeys = Object.keys(expected).sort(); if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys) || expectedKeys.some((key) => actual[key] !== expected[key])) throw new Error(`RP-02B2a workflow ${label} env binding mismatch`); }
function assertShellBlock(step, expected, label) { const actual = requireRun(step).split(/\r?\n/).map((line) => line.trim()).filter(Boolean); if (actual.length !== expected.length || actual.some((line, index) => line !== expected[index])) throw new Error(`RP-02B2a workflow ${label} shell semantics mismatch`); }
export function parseWorkflowYaml(workflowPath, head) {
  const workflowText = readWorkflowText(workflowPath, head);
  let json;
  try {
    json = execFileSync('ruby', ['-W0', '-rpsych', '-rjson', '-e', YAML_AST_TO_JSON], { input: workflowText, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  } catch (error) {
    const detail = error?.stderr?.toString().trim() || error?.message || String(error); throw new Error(`RP-02B2a workflow YAML structure parse failed: ${detail}`);
  }
  try { return requireMapping(JSON.parse(json), 'workflow root'); }
  catch (error) { if (error instanceof SyntaxError) throw new Error(`RP-02B2a workflow YAML parser returned invalid JSON: ${error.message}`); throw error; }
}
function readWorkflowText(workflowPath, head) {
  try { return head ? UTF8_DECODER.decode(readCommitPath(head, workflowPath)) : readFileSync(resolve(workflowPath), 'utf8'); }
  catch (error) { throw new Error(`RP-02B2a workflow cannot be read from ${head ? `selected commit ${head}` : 'worktree'}: ${workflowPath}: ${error.message}`); }
}
function requireMapping(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`RP-02B2a ${label} must be a YAML mapping`); return value; }
function requireSequence(value, label) { if (!Array.isArray(value)) throw new Error(`RP-02B2a ${label} must be a YAML sequence`); return value; }
function assertExactKeys(value, expected, label) { const actual = Object.keys(value).sort(), wanted = [...expected].sort(); if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(`RP-02B2a ${label} keys mismatch`); }
function findNamedStep(steps, name) { return findSingleStep(steps, (step) => step.name === name, `step named ${name}`); }
function findSingleStep(steps, predicate, label) { const matches = steps.filter(predicate); if (matches.length !== 1) throw new Error(`RP-02B2a workflow requires exactly one ${label}, got ${matches.length}`); return matches[0]; }
function requireRun(step) { if (typeof step.run !== 'string' || step.run.length === 0) throw new Error(`RP-02B2a workflow step ${step.name ?? '<unnamed>'} requires structured run command`); return step.run; }
function assertNoDefaultShell(owner, label) { const defaults = owner.defaults; if (defaults === undefined) return; const run = requireMapping(defaults, `${label} defaults`).run; if (run !== undefined && Object.hasOwn(requireMapping(run, `${label} defaults.run`), 'shell')) throw new Error(`RP-02B2a workflow rejects ${label} defaults.run.shell`); }
function assertRequiredStepEnabled(step, index) { if (Object.hasOwn(step, 'shell')) throw new Error(`RP-02B2a workflow required step ${index} rejects custom shell`); if (Object.hasOwn(step, 'if') || Object.hasOwn(step, 'continue-on-error')) throw new Error(`RP-02B2a workflow required step ${index} is disabled`); }
export function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.has('verify-admission-workflow')) {
    const result = verifyTrustedAdmissionWorkflowContract({ workflowPath: args.get('verify-admission-workflow'), head: args.get('head') });
    console.log(`trusted_workflow_contract=passed workflow_path=${result.workflowPath} canonical_sha256=${result.digest}`); return;
  }
  if (args.has('verify-workflow')) {
    const result = verifyWorkflowContract({ workflowPath: args.get('verify-workflow'), packageId: args.get('package-id'), testCommand: args.get('test-command'), triggerFile: args.get('trigger-file') });
    console.log(`workflow_contract=passed required_files=${result.requiredFiles}`); return;
  }
  if (args.get('print-range') === 'true') {
    const range = resolvePackageGateRange({ event: args.get('event'), eventBase: args.get('event-base'), eventHead: args.get('event-head'), gateSource: args.get('gate-source'), prBaseRef: args.get('pr-base-ref'), prHead: args.get('pr-head'), pushBaseRef: args.get('push-base-ref'), pushCreated: args.get('push-created'), pushBefore: args.get('push-before'), pushHead: args.get('push-head'), manualBase: args.get('manual-base'), manualHead: args.get('manual-head'), authorizedPackageId: args.get('authorized-package-id'), authorizedPredecessorSha: args.get('authorized-predecessor-sha') });
    console.log(`base=${range.base}`); console.log(`head=${range.head}`); return;
  }
  let base = args.get('base'), head = args.get('head');
  const worktree = args.get('worktree') === 'true', githubOutput = args.get('github-output') === 'true', event = args.get('event');
  let authoritativeEventBase;
  if (event === 'pull_request_target') {
    if (args.has('base') || args.has('head') || worktree) throw new Error('RP-02B2a authoritative admission rejects caller-selected base/head or worktree mode');
    const range = resolvePackageGateRange({ event, eventBase: args.get('event-base'), eventHead: args.get('event-head'), gateSource: args.get('gate-source'), authorizedPackageId: args.get('authorized-package-id'), authorizedPredecessorSha: args.get('authorized-predecessor-sha') });
    base = range.base; head = range.head; authoritativeEventBase = range.eventBase;
  } else if (event) throw new Error(`RP-02B2a non-range gate rejects non-authoritative event mode: ${event}`);
  if (worktree && githubOutput) throw new Error('RP-02B2a package gate rejects --worktree with --github-output because dirty reviewed content has no stable output identity');
  const { files, addedLines, deletedLines, netAdditions, head: effectiveHead } = readGitDiff({ base, head, worktree });
  const changedAdrs = files.filter((file) => file.startsWith('docs/adr/rp-02b2a') && file.endsWith('.md'));
  const adrTextByPath = Object.fromEntries(changedAdrs.map((path) => [path, readAdrText(path, effectiveHead, worktree)]));
  if (changedAdrs.length === 1 && changedAdrs[0] === B2A2_GATE_PREP_ADR) validateGatePrepPackageScripts({ packageId: B2A2_GATE_PREP_ID, head: effectiveHead, worktree });
  const result = analyzePackageGate({ files, addedLines, deletedLines, netAdditions, adrTextByPath, base, head: effectiveHead, worktree });
  if (result.packageId === B2A2_GATE_PREP_ID) {
    if (worktree) {
      validateGatePrepWorktreeHead(effectiveHead);
      assertGatePrepDoesNotEmbedEvidencePublication({ head: effectiveHead, worktree: true });
      verifyPinnedEvidenceParentWorkflows({ head: effectiveHead, worktree: true });
      verifyTrustedAdmissionWorkflowContract({ workflowPath: TRUSTED_ADMISSION_WORKFLOW });
    } else validateGatePrepBase(effectiveHead);
  }
  if (args.has('authorized-g0')) throw new Error('RP-02B2a trusted admission rejects retired --authorized-g0; use the repository-controlled package/predecessor tuple');
  const businessAuthorization = validateBusinessAuthorization({ packageId: result.packageId, base, head: effectiveHead, gateSource: args.get('gate-source'), g0EvidenceSha: args.get('g0-evidence-sha'), authorizedPackageId: args.get('authorized-package-id'), authorizedPredecessorSha: args.get('authorized-predecessor-sha') });
  const evidence = result.packageId === GATE_PREP_EVIDENCE_ID ? validateGatePrepEvidencePublication({ base, head: effectiveHead, worktree }) : undefined;
  validateGatePrepPackageScripts({ packageId: result.packageId, head: effectiveHead, worktree });
  validateCandidatePackageScripts({ packageId: result.packageId, head: effectiveHead, base, worktree });
  if (githubOutput) {
    console.log(`package_id=${result.packageId}`); console.log(`test_command=${result.testCommand}`); console.log(`files=${result.files}`); console.log(`net_additions=${result.netAdditions}`); if (businessAuthorization) { if (authoritativeEventBase) console.log(`event_base_sha=${authoritativeEventBase}`); console.log(`gate_source_sha=${businessAuthorization.gateSource}`); console.log(`g0_evidence_sha=${businessAuthorization.g0EvidenceSha}`); console.log(`g0_evidence_digest=${businessAuthorization.g0EvidenceDigest}`); console.log(`authorized_predecessor_sha=${businessAuthorization.authorizedPredecessor}`); console.log(`candidate_sha=${effectiveHead}`); console.log(`manifest_digest=${businessAuthorization.manifestDigest}`); } if (evidence) { console.log(`evidence_parent=${evidence.parent}`); console.log(`evidence_runs=${evidence.runs}`); } return;
  }
  console.log(`${result.packageId} package gate passed: files=${result.files}, netAdditions=${result.netAdditions}, adr=${result.adr}, categories=${result.categories.join(',')}`);
}
if (import.meta.url === `file://${process.argv[1]}`) try { runCli(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
