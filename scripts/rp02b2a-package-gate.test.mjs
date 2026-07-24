import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  PACKAGE_DEFINITIONS,
  analyzePackageGate,
} from "./rp02b2a-package-gate.mjs";

function aliasPermissions(text, name = "read_permission") {
  return text.replace(
    "permissions:\n  actions: read\n  contents: read",
    `permissions:\n  actions: &read_permission read\n  contents: *${name}`,
  );
}
const ROOT = resolve("."),
  GATE_SCRIPT = "scripts/rp02b2a-package-gate.mjs",
  WORKFLOW = resolve(".github/workflows/rp01c-fixtures.yml"),
  ADMISSION_WORKFLOW = resolve(".github/workflows/rp02b2a-admission.yml"),
  TRUSTED_WORKFLOW_ORACLE_SHA256 =
    "c48196d1b167d60c4f94b3f7b915ea2853488ada4b89ab0e4df767214739c7c7",
  BASELINE = "501a3cfcdf12341d9f611f0fdd6a6336d4ade483",
  B2A2_BASELINE = "6eaf60af4155a8b95ff77d53261f5896d3a8f77d",
  STALE_B2A2_BASELINE = "4817abc67cf916772b317aff027403b97ab4df76",
  A1_ADR = "docs/adr/rp-02b2a1-registry-abi-budget.md",
  GATE_PREP_ID = "RP-02B2a2-G0",
  GATE_PREP_ADR = "docs/adr/rp-02b2a2-gate-prep-budget.md",
  CORRECTION_ID = "RP-02B2a2-G0-C1",
  CORRECTION_BASELINE = "59cedaf7150029fcbde03d2779662659727e8b4e",
  CORRECTION_ADR = "docs/adr/rp-02b2a2-g0-ci-compat-correction-budget.md",
  TEST_LAYER_ID = "RP-02B2a2-G0-C2",
  TEST_LAYER_BASELINE = "9e0f5fcf30ef78b605f13465458ec19e84a9d8fa",
  TEST_LAYER_ADR = "docs/adr/rp-02b2a2-g0-self-reference-correction-budget.md",
  EVIDENCE_TRIGGER_ID = "RP-02B2a2-G0-C3",
  EVIDENCE_TRIGGER_BASELINE = "e15b59b1eef9165501d534a183577617512df5d3",
  EVIDENCE_TRIGGER_ADR = "docs/adr/rp-02b2a2-g0-evidence-trigger-correction-budget.md",
  A2_SCOPE_ID = "RP-02B2a2-G0-C4",
  A2_SCOPE_BASELINE = "f243595d32f555f1f98162f2f9ddebce0a1f8528",
  A2_SCOPE_ADR = "docs/adr/rp-02b2a2-g0-a2-scope-correction-budget.md",
  A2_SCOPE_V5_ID = "RP-02B2a2-G0-C5",
  A2_SCOPE_V5_BASELINE = "b22db8e15eb648220e6c8cfab1829ed184ab59da",
  A2_SCOPE_V5_ADR = "docs/adr/rp-02b2a2-g0-a2-scope-v5-correction-budget.md",
  POSTMERGE_CORRECTION_ID = "RP-02B2a2-PM-C1",
  POSTMERGE_CORRECTION_BASELINE = "dc193dbbd3ac1970f571fd618f12902a4033994c",
  POSTMERGE_CORRECTION_ADR = "docs/adr/rp-02b2a2-postmerge-range-correction-budget.md",
  CLOSEOUT_POLICY_CORRECTION_ID = "RP-02B2a2-PM-C2",
  CLOSEOUT_POLICY_CORRECTION_BASELINE = "9f04986469a3e409b3ce887390e8830cbdfe9493",
  CLOSEOUT_POLICY_CORRECTION_ADR = "docs/adr/rp-02b2a2-closeout-policy-correction-budget.md",
  CI_TRIGGER_SPLIT_ID = "RP-02B2a2-PM-C3",
  CI_TRIGGER_SPLIT_BASELINE = "0ff9107bbfbf95983ae8c21391754520f4374711",
  CI_TRIGGER_SPLIT_ADR = "docs/adr/rp-02b2a2-ci-trigger-split-budget.md",
  A2_CLOSEOUT_EVIDENCE_ID = "RP-02B2a2-E3",
  A2_CLOSEOUT_EVIDENCE_COMMAND = "test:governance",
  A2_CLOSEOUT_EVIDENCE_VERIFICATION = "docs/reviews/remediation-rmd-task-002-003-rp-02b2a2-verification-2026-07-23.md",
  VERIFIED_GATE_PREP = "verified-gate-prep";
const A2_CLOSEOUT_EVIDENCE_FILES = Object.freeze([
  "docs/remediation/acceptance-matrix.md",
  "docs/remediation/issue-ledger.md",
  "docs/reviews/main-control-event-ledger.md",
  "docs/reviews/main-control-status.md",
  A2_CLOSEOUT_EVIDENCE_VERIFICATION,
]);
const EVIDENCE_RECEIPT_PATHS = Object.freeze([
  "docs/reviews/main-control-event-ledger.md",
  "docs/reviews/main-control-status.md",
  "docs/reviews/remediation-rmd-task-002-003-rp-02b2a1-verification-2026-07-15.md",
]);
const GOVERNANCE_REMEDIATION_FILES = Object.freeze([
  ".github/workflows/rp01a-e2e.yml",
  ".github/workflows/rp01b-dom.yml",
  ".github/workflows/rp01c-fixtures.yml",
  ".github/workflows/remediation-governance.yml",
  ".github/workflows/rp02b2a-admission.yml",
  "apps/admin-web/src/modules/novels/components/TaskProgressPanel.dom.spec.ts",
  "apps/api/test/rp01c/fixtureFactory.test.ts",
  "docs/modules/rp-02b2-dispatcher-transport-implementation-package\
.md",
  "docs/remediation/acceptance-matrix.md",
  "docs/reviews/main-control-event-ledger.md",
  "docs/reviews/main-control-status.md",
  "docs/reviews/remediation-rmd-task-002-003-rp-02b2a1-verification-2026-07-15.md",
  GATE_SCRIPT,
  "scripts/rp02b2a-package-gate.test.mjs",
  "package.json",
]);
const CLEAN_ENV =
  "env -u DATABASE_URL -u DEEPSEEK_API_KEY -u DEEPSEEK_BASE_URL -u DEEPSEEK_MODEL -u DEEPSEEK_STRUCTURE_MODEL -u DEEPSEEK_REASONER_MODEL -u DEEPSEEK_TIMEOUT_MS -u DEEPSEEK_MAX_RETRIES -u DEPLOYMENT_ACTOR_TENANT_ID -u DEPLOYMENT_ACTOR_USER_ID NODE_ENV=production AI_PROVIDER_MODE=moc\
k DOTENV_CONFIG_PATH=/dev/null";
const SYNTHETIC_LEGACY_GATE_SUBJECTS = new Set([
  CORRECTION_ID,
  TEST_LAYER_ID,
  EVIDENCE_TRIGGER_ID,
  A2_SCOPE_ID,
  A2_SCOPE_V5_ID,
]);
const FIXTURE_GATE_CACHE = new Map();
const B2A2_SCRIPTS = Object.freeze({
  "test:rp02b2a2:env-probe": `node -e "const keys=['DATABASE_URL','DEEPSEEK_API_KEY','DEEPSEEK_BASE_URL','DEEPSEEK_MODEL','DEEPSEEK_STRUCTURE_MODEL','DEEPSEEK_REASONER_MODEL','DEEPSEEK_TIMEOUT_MS','DEEPSEEK_MAX_RETRIES','DEPLOYMENT_ACTOR_TENANT_ID','DEPLOYMENT_ACTOR_USER_ID']; if(keys.some((key)=>process.env[key]!==undefined)||process.env.NODE_ENV!=='production'||process.env.AI_PROVIDER_MODE!=='mock'||process.env.DOTENV_CONFIG_PATH!=='/dev/null') process.exit(1); console.log('RP02B2A2_ENV\
_CLEAN')"`,
  "test:rp02b2a2:core": `${CLEAN_ENV} sh -c 'npm run test:rp02b2a2:env-probe && npm run build -w @ai-shortvideo/shared && npm run prisma:generate -w @ai-shortvideo/api && npm exec -w @ai-shortvideo/api -- tsx --test test/rp02b2a/authority-claim.test.ts test/rp02b2a/repository-authority-hardening.test.ts src/modules/novels/novelRoutes.test.ts'`,
  "test:rp02b2a2": `${CLEAN_ENV} sh -c 'npm run test:rp02b2a2:env-probe && npm run test:rp01c && npm run test:rp02b2a1 && npm run test:rp02b2a2:core'`,
});
const BUSINESS_PACKAGE_SEQUENCE = Object.freeze([
    "RP-02B2a2",
    "RP-02B2a3",
    "RP-02B2a4",
    "RP-02B2a5",
  ]),
  BUSINESS_PREDECESSOR = Object.freeze({
    "RP-02B2a2": A2_SCOPE_V5_ID,
    "RP-02B2a3": "RP-02B2a2",
    "RP-02B2a4": "RP-02B2a3",
    "RP-02B2a5": "RP-02B2a4",
  }),
  BUSINESS_SCRIPT_ADDITIONS = Object.freeze({
    "RP-02B2a2": B2A2_SCRIPTS,
    "RP-02B2a3": Object.freeze({
      "test:rp02b2a3:core": `${CLEAN_ENV} sh -c 'npm run test:rp02b2a2:env-probe && npm exec -w @ai-shortvideo/api -- tsx --test test/rp02b2a/lease-dispatch-retry.test.ts'`,
      "test:rp02b2a3": `${CLEAN_ENV} sh -c 'npm run test:rp02b2a2:env-probe && npm run test:rp02b2a2 && npm run test:rp02b2a3:core'`,
    }),
    "RP-02B2a4": Object.freeze({
      "test:rp02b2a4:core": `${CLEAN_ENV} sh -c 'npm run test:rp02b2a2:env-probe && npm exec -w @ai-shortvideo/api -- tsx --test test/rp02b2a/inmemory-fenced-finalize.test.ts src/modules/novels/novelRoutes.test.ts'`,
      "test:rp02b2a4": `${CLEAN_ENV} sh -c 'npm run test:rp02b2a2:env-probe && npm run test:rp02b2a3 && npm run test:rp02b2a4:core'`,
    }),
    "RP-02B2a5": Object.freeze({
      "test:rp02b2a5:core": `${CLEAN_ENV} sh -c 'npm run test:rp02b2a2:env-probe && npm run prisma:generate -w @ai-shortvideo/api && npm exec -w @ai-shortvideo/api -- tsx --test test/rp02b2a/prisma-fenced-finalize.test.ts'`,
      "test:rp02b2a5": `${CLEAN_ENV} sh -c 'npm run test:rp02b2a2:env-probe && npm run test:rp02b2a4 && npm run test:rp02b2a5:core'`,
    }),
  });
const COMMANDS = Object.freeze({
  "RP-02B2a1": "test:rp02b2a1",
  [GATE_PREP_ID]:
    "\
test:rp02b2a1:gate",
  [CORRECTION_ID]: "test:rp02b2a1:gate",
  [TEST_LAYER_ID]: "test:rp02b2a1:gate",
  [EVIDENCE_TRIGGER_ID]: "test:rp02b2a1:gate",
  [A2_SCOPE_ID]: "test:rp02b2a1:gate",
  [A2_SCOPE_V5_ID]: "test:rp02b2a1:gate",
  [POSTMERGE_CORRECTION_ID]: "test:rp02b2a1:gate",
  [CLOSEOUT_POLICY_CORRECTION_ID]: "test:rp02b2a1:gate",
  [CI_TRIGGER_SPLIT_ID]: "test:rp02b2a1:gate",
  "RP-02B2a2": "test:rp02b2a2",
  "RP-02B2a3": "test:rp02b2a3",
  "RP-02B2a4": "test:rp02b2a4",
  "RP-02B2a5": "test:rp02b2a5",
});
const RANGE_PACKAGES = Object.freeze(["RP-02B2a3", "RP-02B2a4", "RP-02B2a5"]);
const ORACLE = Object.freeze({
  "RP-02B2a1": ["RP-02B2a1-v1", A1_ADR, 18, 1900],
  [GATE_PREP_ID]: ["RP-02B2a2-G0-v1", GATE_PREP_ADR, 16, 2e3],
  [CORRECTION_ID]: ["RP-02B2a2-G0-C1-v3", CORRECTION_ADR, 14, 700],
  [TEST_LAYER_ID]: ["RP-02B2a2-G0-C2-v1", TEST_LAYER_ADR, 5, 600],
  [EVIDENCE_TRIGGER_ID]: ["RP-02B2a2-G0-C3-v1", EVIDENCE_TRIGGER_ADR, 5, 500],
  [A2_SCOPE_ID]: ["RP-02B2a2-G0-C4-v1", A2_SCOPE_ADR, 4, 500],
  [A2_SCOPE_V5_ID]: ["RP-02B2a2-G0-C5-v1", A2_SCOPE_V5_ADR, 6, 900],
  [POSTMERGE_CORRECTION_ID]: ["RP-02B2a2-PM-C1-v1", POSTMERGE_CORRECTION_ADR, 5, 1900],
  [CLOSEOUT_POLICY_CORRECTION_ID]: ["RP-02B2a2-PM-C2-v1", CLOSEOUT_POLICY_CORRECTION_ADR, 5, 1500],
  [CI_TRIGGER_SPLIT_ID]: ["RP-02B2a2-PM-C3-v1", CI_TRIGGER_SPLIT_ADR, 5, 1200],
  "RP-02B2a2": [
    "RP-02B2a2-v5",
    "docs/adr/rp-02b2a2-authority-claim-budget.md",
    22,
    3900,
  ],
  "RP-02B2a3": [
    "RP-02B2a3-v1",
    "docs/adr/rp-02b2a3-lease-retry-budget.md",
    14,
    1800,
  ],
  "\
RP-02B2a4": [
    "RP-02B2a4-v1",
    "docs/adr/rp-02b2a4-inmemory-finalize-budget.md",
    12,
    1900,
  ],
  "RP-02B2a5": [
    "RP-02B2a5-v1",
    "docs/adr/rp-02b2a5-prisma-nine-six-budget.md",
    10,
    1900,
  ],
});
const BASELINES = Object.freeze({
  "RP-02B2a1": BASELINE,
  [GATE_PREP_ID]: B2A2_BASELINE,
  [CORRECTION_ID]: CORRECTION_BASELINE,
  [TEST_LAYER_ID]: TEST_LAYER_BASELINE,
  [EVIDENCE_TRIGGER_ID]: EVIDENCE_TRIGGER_BASELINE,
  [A2_SCOPE_ID]: A2_SCOPE_BASELINE,
  [A2_SCOPE_V5_ID]: A2_SCOPE_V5_BASELINE,
  [POSTMERGE_CORRECTION_ID]: POSTMERGE_CORRECTION_BASELINE,
  [CLOSEOUT_POLICY_CORRECTION_ID]: CLOSEOUT_POLICY_CORRECTION_BASELINE,
  [CI_TRIGGER_SPLIT_ID]: CI_TRIGGER_SPLIT_BASELINE,
  "RP-02B2a2": VERIFIED_GATE_PREP,
  "RP-02B2a3": "range-base",
  "RP-02B2a4": "range-base",
  "RP-02B2a5": "range-base",
});
const REQUIRED_CATEGORIES = Object.freeze({
    "RP-02B2a1": Object.freeze(["production", "test", "adr"]),
    [GATE_PREP_ID]: Object.freeze(["governance", "test", "adr"]),
    [CORRECTION_ID]: Object.freeze(["governance", "test", "adr"]),
    [TEST_LAYER_ID]: Object.freeze(["governance", "test", "adr"]),
    [EVIDENCE_TRIGGER_ID]: Object.freeze(["governance", "test", "adr"]),
    [A2_SCOPE_ID]: Object.freeze(["governance", "test", "adr"]),
    [A2_SCOPE_V5_ID]: Object.freeze(["governance", "test", "adr"]),
    [POSTMERGE_CORRECTION_ID]: Object.freeze(["governance", "test", "adr"]),
    [CLOSEOUT_POLICY_CORRECTION_ID]: Object.freeze(["governance", "test", "adr"]),
    [CI_TRIGGER_SPLIT_ID]: Object.freeze(["governance", "test", "adr"]),
    "RP-02B2a2": Object.freeze(["production", "test", "adr"]),
    "RP-02B2a3": Object.freeze(["production", "test", "adr"]),
    "RP-02B2a4": Object.freeze(["production", "test", "adr"]),
    "RP-02B2a5": Object.freeze(["production", "test", "adr"]),
  }),
  manifest = (text) => Object.freeze(text.split("|").sort());
const MANIFESTS = Object.freeze({
  "RP-02B2a1": manifest(
    ".github/workflows/rp01c-fixtures.y\
ml|apps/api/src/modules/novels/novelRoutes.test.ts|apps/api/src/modules/novels/providers/deepseekNovelProvider.ts|apps/api/src/modules/novels/providers/mockBodyProvider.ts|apps/api/src/modules/novels/providers/mockDirectionProvider.ts|apps/api/src/modules/novels/providers/mockFullReviewProvider.ts|apps/api/src/modules/novels/providers/mockStructureProvider.ts|apps/api/src/modules/novels/providers/mockTrialProvider.ts|apps/api/src/modules/novels/services/actionExecutionPlan.ts|apps/api/src/module\
s/novels/services/novelService.ts|apps/api/src/modules/tasks/services/taskService.ts|apps/api/test/rp01c/fixtureFactory.test.ts|apps/api/test/rp02a/rp02a.test.ts|docs/adr/rp-02b2a1-registry-abi-budget.md|package.json|packages/shared/src/api.ts|packages/shared/src/novels.ts|scripts/rp02b2a-package-gate.mjs|scripts/rp02b2a-package-gate.test.mjs",
  ),
  [GATE_PREP_ID]: manifest(
    `${GOVERNANCE_REMEDIATION_FILES.join("|")}|${GATE_PREP_ADR}`,
  ),
  [CORRECTION_ID]: manifest(
    ".github/workflows/rp01b-dom.yml|.github/workflows/rp01c-fixtures.yml|.github/workflows/remediation-governance.yml|.github/workflows/rp02b2a-admission.yml|scripts/e2e/api-e2e-server.ts|scripts/e2e/run-playwright-backend-e2e.test.mjs|scripts/rp02b2a-package-gate.mjs|scripts/rp02b2a-package-gate.test.mjs|docs/adr/rp-02b2a2-gate-prep-budget.md|docs/adr/rp-02b2a2-authority-claim-budget.md|docs/adr/rp-02b2a2-g0-ci-compat-correction-budget.md|docs/modules/rp-02b2-dispatcher-transport-implementation-package.md|docs/remediation/acceptance-matrix.md|docs/reviews/rp-02b2a2-g0-ci-compat-correction-verification-2026-07-18.md",
  ),
  [TEST_LAYER_ID]: manifest(
    `.github/workflows/rp01c-fixtures.yml|.github/workflows/rp02b2a-admission.yml|${GATE_SCRIPT}|scripts/rp02b2a-package-gate.test.mjs|${TEST_LAYER_ADR}`,
  ),
  [EVIDENCE_TRIGGER_ID]: manifest(
    `.github/workflows/rp01a-e2e.yml|.github/workflows/rp01c-fixtures.yml|${GATE_SCRIPT}|scripts/rp02b2a-package-gate.test.mjs|${EVIDENCE_TRIGGER_ADR}`,
  ),
  [A2_SCOPE_ID]: manifest(
    `.github/workflows/rp01c-fixtures.yml|${GATE_SCRIPT}|scripts/rp02b2a-package-gate.test.mjs|${A2_SCOPE_ADR}`,
  ),
  [A2_SCOPE_V5_ID]: manifest(
    `.github/workflows/rp01a-e2e.yml|.github/workflows/rp01b-dom.yml|.github/workflows/rp01c-fixtures.yml|${GATE_SCRIPT}|scripts/rp02b2a-package-gate.test.mjs|${A2_SCOPE_V5_ADR}`,
  ),
  [POSTMERGE_CORRECTION_ID]: manifest(
    `.github/workflows/rp01c-fixtures.yml|apps/api/test/rp01c/fixtureFactory.test.ts|${GATE_SCRIPT}|scripts/rp02b2a-package-gate.test.mjs|${POSTMERGE_CORRECTION_ADR}`,
  ),
  [CLOSEOUT_POLICY_CORRECTION_ID]: manifest(
    `.github/workflows/rp01c-fixtures.yml|.github/workflows/rp02b2a-admission.yml|${GATE_SCRIPT}|scripts/rp02b2a-package-gate.test.mjs|${CLOSEOUT_POLICY_CORRECTION_ADR}`,
  ),
  [CI_TRIGGER_SPLIT_ID]: manifest(
    `.github/workflows/rp01c-fixtures.yml|apps/api/test/rp01c/fixtureFactory.test.ts|${GATE_SCRIPT}|scripts/rp02b2a-package-gate.test.mjs|${CI_TRIGGER_SPLIT_ADR}`,
  ),
  "RP-02B2a2": manifest(
    "packages/shared/src/api.ts|packages/shared/src/novels.ts|apps/api/src/config/env.ts|apps/api/src/modules/novels/domain/executionContract.ts|apps/api/src/modules/novels/domain/novelDomain.ts|apps/api/test/rp01c/fixtureFactory.test.ts|apps/api/test/rp02b/rp02b.test.ts|apps/api/src/modules/novels/services/taskClaim.ts|apps/api/src/modules/novels/services/novelService.ts|apps/api/src/modules/novels/routes/novelRoutes.ts|apps/api/src/modules/tasks/routes/taskRoutes.ts|apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts|apps/api/src/modules/novels/repositories/prismaNovelRepository.ts|apps/api/src/app.ts|apps/api/src/main.ts|apps/api/test/rp02a/rp02a.test.ts|apps/api/test/rp02b2a/fixtures.ts|apps/api/test/rp02b2a/authority-claim.test.ts|apps/api/test/rp02b2a/repository-authority-hardening.test.ts|apps/api/src/modules/novels/novelRoutes.test.ts|docs/adr/rp-02b2a2-authority-claim-budget.md|package.json",
  ),
  "RP-02B2a3": manifest(
    "packages/shared/src/api.ts|packages/shared/src/novels.ts|apps/api/src/modules/novels/domain/executionContract.ts|apps/api/src/modules/novels/domain/novelDomain.ts|apps/api/src/modules/novels/services/actionExecutionPlan.ts|apps/api/src/modules/novels/services/taskClaim.ts|apps/api/sr\
c/modules/tasks/services/taskService.ts|apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts|apps/api/src/modules/novels/repositories/prismaNovelRepository.ts|apps/api/src/modules/novels/novelRoutes.test.ts|apps/api/test/rp02b2a/fixtures.ts|apps/api/test/rp02b2a/lease-dispatch-retry.test.ts|docs/adr/rp-02b2a3-lease-retry-budget.md|package.json",
  ),
  "RP-02B2a4": manifest(
    "packages/shared/src/novels.ts|apps/api/src/modules/novels/domain/executionContract.ts|apps/api/src/modules/novels/d\
omain/novelDomain.ts|apps/api/src/modules/novels/services/actionExecutionPlan.ts|apps/api/src/modules/novels/services/taskClaim.ts|apps/api/src/modules/novels/services/novelService.ts|apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts|apps/api/test/rp02b2a/fixtures.ts|apps/api/test/rp02b2a/inmemory-fenced-finalize.test.ts|apps/api/src/modules/novels/novelRoutes.test.ts|docs/adr/rp-02b2a4-inmemory-finalize-budget.md|package.json",
  ),
  "RP-02B2a5": manifest(
    "apps/api/src/modules/novels\
/domain/executionContract.ts|apps/api/src/modules/novels/domain/novelDomain.ts|apps/api/src/modules/novels/services/actionExecutionPlan.ts|apps/api/src/modules/novels/services/taskClaim.ts|apps/api/src/modules/novels/repositories/prismaNovelRepository.ts|apps/api/src/modules/novels/novelRoutes.test.ts|apps/api/test/rp02b2a/fixtures.ts|apps/api/test/rp02b2a/prisma-fenced-finalize.test.ts|docs/adr/rp-02b2a5-prisma-nine-six-budget.md|package.json",
  ),
});
const A1_FILES = [
    "apps/api/src/modules/novels/ser\
vices/actionExecutionPlan.ts",
    "apps/api/test/rp02a/rp02a.test.ts",
    A1_ADR,
  ],
  EXCLUSIVE = Object.freeze({
    "RP-02B2a1":
      "apps/api/src/modules/novels/providers/mockDirectionProvider.ts",
    [GATE_PREP_ID]: GATE_SCRIPT,
    [TEST_LAYER_ID]: GATE_SCRIPT,
    [EVIDENCE_TRIGGER_ID]: GATE_SCRIPT,
    [A2_SCOPE_ID]: GATE_SCRIPT,
    [A2_SCOPE_V5_ID]: GATE_SCRIPT,
    [POSTMERGE_CORRECTION_ID]: GATE_SCRIPT,
    [CLOSEOUT_POLICY_CORRECTION_ID]: GATE_SCRIPT,
    [CI_TRIGGER_SPLIT_ID]: GATE_SCRIPT,
    "RP-02B2a2": "apps/api/src/app.ts",
    "RP-02B2a3": "apps/api/test/rp02b2a/lease-dispatch-retry.test.ts",
    "RP-02B2a4":
      "apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts",
    "RP-02B2a5":
      "apps/api/src/modules/novels/repositories/prismaNovelRepository.ts",
  });
function sh(cwd, args, options = {}) {
  return execFileSync(args[0], args.slice(1), {
    cwd,
    encoding: "utf8",
    ...options,
  });
}
function write(repo2, file, content) {
  mkdirSync(dirname(resolve(repo2, file)), { recursive: true });
  writeFileSync(resolve(repo2, file), content);
}
function commit(repo2, message) {
  sh(repo2, ["git", "add", "-A"]);
  sh(repo2, ["git", "commit", "-q", "-m", message]);
  return sh(repo2, ["git", "rev-parse", "HEAD"]).trim();
}
function repo(fixed = false) {
  const path = mkdtempSync(resolve(tmpdir(), "rp02b2a-gate-")),
    fixedSha = fixed === true ? BASELINE : fixed || void 0;
  if (fixedSha)
    sh(tmpdir(), [
      "git",
      "clone",
      "-q",
      "--shared",
      "--no-checkout",
      ROOT,
      path,
    ]);
  else sh(path, ["git", "init", "-q"]);
  sh(path, ["git", "config", "user.email", "rp02b2a@example.test"]);
  sh(path, ["git", "config", "user.name", "RP02B2a Gate"]);
  if (fixedSha) {
    sh(path, ["git", "checkout", "-q", "--detach", fixedSha]);
    write(path, GATE_SCRIPT, readFileSync(resolve(ROOT, GATE_SCRIPT)));
  } else {
    write(path, "README.md", "base\n");
    write(path, GATE_SCRIPT, readFileSync(resolve(ROOT, GATE_SCRIPT)));
    commit(path, "base");
  }
  return path;
}function stats(repoPath, base) {
  sh(repoPath, ["git", "add", "-N", "--", "."]);
  let added = 0,
    deleted = 0,
    files = 0;
  for (const line of sh(repoPath, ["git", "diff", "--text", "--numstat", base])
    .split("\n")
    .filter(Boolean)) {
    const [a, d] = line.split("	", 2);
    added += Number(a);
    deleted += Number(d);
    files += 1;
  }
  return { files, net: Math.max(0, added - deleted) };
}
function adr(values) {
  return `${Object.entries(values)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")}
`;
}
function select(packageId) {
  const all = MANIFESTS[packageId];
  if (
    packageId === GATE_PREP_ID ||
    packageId === CORRECTION_ID ||
    packageId === TEST_LAYER_ID || packageId === EVIDENCE_TRIGGER_ID || packageId === A2_SCOPE_ID || packageId === A2_SCOPE_V5_ID
    || packageId === POSTMERGE_CORRECTION_ID || packageId === CLOSEOUT_POLICY_CORRECTION_ID || packageId === CI_TRIGGER_SPLIT_ID
  )
    return [...all];
  const production =
      packageId === "RP-02B2a1"
        ? A1_FILES[0]
        : category(EXCLUSIVE[packageId]) === "production"
          ? EXCLUSIVE[packageId]
          : all.find((file) => category(file) === "production"),
    test = BUSINESS_PACKAGE_SEQUENCE.includes(packageId)
      ? all.find(
          (file) =>
            file.startsWith("apps/api/test/rp02b2a/") &&
            file.endsWith(".test.ts"),
        )
      : all.find((file) => category(file) === "test");
  return [production, test, ORACLE[packageId][1]];
}
function category(file) {
  if (file.startsWith("docs/adr/")) return "adr";
  if (
    file.includes(".test.") ||
    file.includes("/test/") ||
    file.endsWith("novelRoutes.test.ts")
  )
    return "test";
  if (file.startsWith("scripts/") || file.startsWith(".github/"))
    return "governance";
  return "production";
}
function writeBusinessPackageJson(
  repoPath,
  packageId,
  mutate2 = (scripts) => scripts,
) {
  const packageJson = JSON.parse(
      readFileSync(resolve(repoPath, "package.json"), "utf8"),
    ),
    additions = BUSINESS_SCRIPT_ADDITIONS[packageId];
  packageJson.scripts = {
    ...packageJson.scripts,
    ...mutate2({ ...additions }),
  };
  write(
    repoPath,
    "package.json",
    `${JSON.stringify(packageJson, null, 2)}
`,
  );
}
function writeB2a2PackageJson(repoPath, mutate2 = (scripts) => scripts) {
  writeBusinessPackageJson(repoPath, "RP-02B2a2", mutate2);
}
function prepareUncached(packageId = "RP-02B2a1", files, options = {}) {
  const [manifestId, defaultAdr, hardMaxFiles, hardMaxNetAdditions] =
    ORACLE[packageId];
  let path;
  let base;
  let gateSource;
  let g0EvidenceSha;
  if (BUSINESS_PACKAGE_SEQUENCE.includes(packageId)) {
    const predecessor = prepare(BUSINESS_PREDECESSOR[packageId]);
    path = predecessor.repo;
    base = predecessor.head;
    gateSource =
      predecessor.gateSource ??
      (BUSINESS_PREDECESSOR[packageId] === A2_SCOPE_V5_ID
        ? predecessor.head
        : void 0);
    g0EvidenceSha = predecessor.g0EvidenceSha;
    if (predecessor.packageId === A2_SCOPE_V5_ID) {
      g0EvidenceSha = publishEvidence(predecessor).head;
      sh(path, ["git", "checkout", "-q", "--detach", predecessor.head]);
    }
  } else {
    const fixed =
      BASELINES[packageId] === "range-base" ? false : BASELINES[packageId];
    path = repo(fixed);
    base = sh(path, ["git", "rev-parse", "HEAD"]).trim();
  }
  const chosen = files ?? select(packageId);
  for (const file of chosen.filter((item) =>
    packageId === CORRECTION_ID || packageId === TEST_LAYER_ID || packageId === EVIDENCE_TRIGGER_ID || packageId === A2_SCOPE_ID || packageId === A2_SCOPE_V5_ID || packageId === POSTMERGE_CORRECTION_ID || packageId === CLOSEOUT_POLICY_CORRECTION_ID || packageId === CI_TRIGGER_SPLIT_ID
      ? item !== defaultAdr
      : !item.startsWith(
          "\
docs/adr/",
        ),
  )) {
    if (BUSINESS_PACKAGE_SEQUENCE.includes(packageId) && file === "package.json") continue;
    if (
      packageId === GATE_PREP_ID &&
      GOVERNANCE_REMEDIATION_FILES.includes(file)
    )
      copyGatePrepFile(path, file);
    else if (packageId === CORRECTION_ID) copyCorrectionFile(path, file);
    else if (packageId === TEST_LAYER_ID) copyTestLayerFile(path, file, ACCEPTED_G0_C2_SHA);
    else if (packageId === EVIDENCE_TRIGGER_ID)
      copyTestLayerFile(path, file, ACCEPTED_G0_C3_SHA);
    else if (packageId === A2_SCOPE_ID)
      copyTestLayerFile(path, file, ACCEPTED_G0_C4_SHA);
    else if (packageId === A2_SCOPE_V5_ID) copyA2ScopeV5File(path, file);
    else if (packageId === POSTMERGE_CORRECTION_ID || packageId === CLOSEOUT_POLICY_CORRECTION_ID || packageId === CI_TRIGGER_SPLIT_ID)
      write(path, file, readFileSync(resolve(ROOT, file)));
    else if (file === GATE_SCRIPT)
      write(path, file, readFileSync(resolve(ROOT, file)));
    else
      write(
        path,
        file,
        `${file}
`,
      );
  }
  if ([EVIDENCE_TRIGGER_ID, A2_SCOPE_ID, A2_SCOPE_V5_ID].includes(packageId) && !chosen.includes(GATE_SCRIPT))
    sh(path, ["git", "checkout", base, "--", GATE_SCRIPT]);
  if (BUSINESS_PACKAGE_SEQUENCE.includes(packageId))
    writeBusinessPackageJson(path, packageId, options.mutateScripts);
  if (options.includeAdr !== false) {
    const adrPath = options.adrPath ?? defaultAdr,
      render = (filesCount, net) =>
        adr({
          status: "ready",
          package_id: packageId,
          manifest_id: manifestId,
          baseline_sha: ["range-base", VERIFIED_GATE_PREP].includes(
            BASELINES[packageId],
          )
            ? base
            : BASELINES[packageId],
          hard_max_files: hardMaxFiles,
          hard_max_net_additions: hardMaxNetAdditions,
          actual_files: filesCount,
          actual_net_additions: net,
          ...options.overrides,
        });
    write(path, adrPath, render(0, 0));
    const actual = stats(path, base);
    write(path, adrPath, render(actual.files, actual.net));
  }
  return {
    repo: path,
    base,
    head: commit(path, packageId),
    packageId,
    gateSource: gateSource ?? options.gateSource,
    g0EvidenceSha: g0EvidenceSha ?? options.g0EvidenceSha,
    authorizedPredecessorSha: base,
  };
}
const PREPARED_FIXTURE_CACHE = new Map();
function clonePreparedFixture(item) {
  const path = mkdtempSync(resolve(tmpdir(), "rp02b2a-prepared-"));
  sh(tmpdir(), [
    "git",
    "clone",
    "-q",
    "--shared",
    "--no-checkout",
    item.repo,
    path,
  ]);
  sh(path, ["git", "config", "user.email", "rp02b2a@example.test"]);
  sh(path, ["git", "config", "user.name", "RP02B2a Gate"]);
  sh(path, ["git", "checkout", "-q", "--detach", item.head]);
  return { ...item, repo: path };
}
function prepare(packageId = "RP-02B2a1", files, options = {}) {
  if (files !== undefined || Object.keys(options).length > 0)
    return prepareUncached(packageId, files, options);
  if (!PREPARED_FIXTURE_CACHE.has(packageId))
    PREPARED_FIXTURE_CACHE.set(packageId, prepareUncached(packageId));
  return clonePreparedFixture(PREPARED_FIXTURE_CACHE.get(packageId));
}
function changedBusinessPackage(item) {
  const changed = new Set(
    sh(item.repo, ["git", "diff", "--name-only", item.base, item.head])
      .split(/\r?\n/)
      .filter(Boolean),
  );
  return BUSINESS_PACKAGE_SEQUENCE.find((id) => changed.has(ORACLE[id][1]));
}
function authorizedArgs(item) {
  const packageId = item.authorizedPackageId ?? changedBusinessPackage(item);
  return packageId
    ? [
        "--gate-source",
        item.gateSource ?? "",
        "--g0-evidence-sha",
        item.g0EvidenceSha ?? "",
        "--authorized-package-id",
        packageId,
        "--authorized-predecessor-sha",
        item.authorizedPredecessorSha ?? item.base,
      ]
    : [];
}
function fixtureGateExecutable(repoPath) {
  const candidatePath = realpathSync(resolve(repoPath, GATE_SCRIPT));
  const candidateText = readFileSync(candidatePath, "utf8");
  const trustedText = readFileSync(resolve(ROOT, GATE_SCRIPT), "utf8");
  if (candidateText !== trustedText) return candidatePath;
  const syntheticHeads = sh(repoPath, ["git", "log", "--format=%H%x09%s", "--all"])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split("\t", 2))
    .filter(([, subject]) => SYNTHETIC_LEGACY_GATE_SUBJECTS.has(subject))
    .map(([sha]) => sha)
    .sort();
  if (syntheticHeads.length === 0) return candidatePath;
  const cacheKey = createHash("sha256").update(`${trustedText}\n${syntheticHeads.join("\n")}`).digest("hex");
  if (FIXTURE_GATE_CACHE.has(cacheKey)) return FIXTURE_GATE_CACHE.get(cacheKey);
  const marker = "const TRUSTED_ADMISSION_WORKFLOW_LEGACY_HEADS = new Set([\n";
  const replacement = `${marker}${syntheticHeads.map((sha) => `  '${sha}',`).join("\n")}\n`;
  const fixtureText = trustedText.replace(marker, replacement);
  assert.notEqual(fixtureText, trustedText, "fixture legacy-head injection marker must exist");
  const fixturePath = resolve(mkdtempSync(resolve(tmpdir(), "rp02b2a-fixture-gate-")), "rp02b2a-package-gate.mjs");
  writeFileSync(fixturePath, fixtureText);
  const executablePath = realpathSync(fixturePath);
  FIXTURE_GATE_CACHE.set(cacheKey, executablePath);
  return executablePath;
}
function gate(item) {
  return spawnSync(
    process.execPath,
    [
      fixtureGateExecutable(item.repo),
      "--base",
      item.base,
      "--head",
      item.head,
      ...authorizedArgs(item),
    ],
    { cwd: item.repo, encoding: "utf8" },
  );
}
function currentGate(item) {
  return spawnSync(
    process.execPath,
    [resolve(ROOT, GATE_SCRIPT), "--base", item.base, "--head", item.head, ...authorizedArgs(item)],
    { cwd: item.repo, encoding: "utf8" },
  );
}
function gateAsync(item) {
  const packageId = changedBusinessPackage(item);
  const target =
    packageId === "RP-02B2a2" && !item.gateSource
      ? {
          ...item,
          gateSource: item.base,
          authorizedPackageId: packageId,
          authorizedPredecessorSha: item.base,
        }
      : item;
  return new Promise((resolve2, reject) => {
    const child = spawn(
      process.execPath,
      [
        fixtureGateExecutable(target.repo),
        "--base",
        target.base,
        "--head",
        target.head,
        ...authorizedArgs(target),
      ],
      { cwd: target.repo },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status, signal) =>
      resolve2({ status, signal, stdout, stderr }),
    );
  });
}
async function mapWithConcurrency(items, concurrency, worker) {
  let next = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        await worker(items[index], index);
      }
    },
  );
  await Promise.all(runners);
}
function run(repoPath, args, env) {
  return spawnSync(
    process.execPath,
    [fixtureGateExecutable(repoPath), ...args],
    { cwd: repoPath, encoding: "utf8", env: env && { ...process.env, ...env } },
  );
}
function runAsync(repoPath, args, env) {
  return new Promise((resolve2, reject) => {
    const child = spawn(
      process.execPath,
      [fixtureGateExecutable(repoPath), ...args],
      { cwd: repoPath, env: env && { ...process.env, ...env } },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status, signal) => resolve2({ status, signal, stdout, stderr }));
  });
}
function githubOutput(item){return run(item.repo,["--github-output","--base",item.base,"--head",item.head,...authorizedArgs(item)])}
function githubOutputAsync(item){return runAsync(item.repo,["--github-output","--base",item.base,"--head",item.head,...authorizedArgs(item)])}
function authoritativeGate(item,{eventBase=item.base,eventHead=item.head,gateSource=item.gateSource,g0EvidenceSha=item.g0EvidenceSha,authorizedPackageId=item.authorizedPackageId??changedBusinessPackage(item),authorizedPredecessorSha=item.authorizedPredecessorSha??item.base,extra=[]}={}){const authorization=authorizedPackageId===void 0?[]:["--gate-source",gateSource??"","--g0-evidence-sha",g0EvidenceSha??"","--authorized-package-id",authorizedPackageId,"--authorized-predecessor-sha",authorizedPredecessorSha??""];return run(item.repo,["--github-output","--event","pull_request_target","--event-base",eventBase,"--event-head",eventHead,...authorization,...extra])}
function closeoutEvidenceAppend(path) {
  const content = {
    [A2_CLOSEOUT_EVIDENCE_VERIFICATION]: `# RP-02B2a2 closeout verification
| field | value |
| admitted_candidate | \`e8e37cd892570e3abee961374ec3512a373f6400\` |
| admitted_candidate_tree | \`749fe41f42285dc9115351ddcbc675e77d428cb7\` |
| admitted_manifest_digest | \`11e82805b419a97f598c5b4a9595eb897584c92add2e9d0071184ff9e414c1ba\` |
| squash_delivery_head | \`dc193dbbd3ac1970f571fd618f12902a4033994c\` |
| post_merge_gate_head | \`9f04986469a3e409b3ce887390e8830cbdfe9493\` |
trusted_replay_run: 29977969717 completed/success
RMD-TASK-002: partial
RMD-TASK-003: open
issue_closed_count: 9/42 unchanged
未证明边界：真实 MySQL、真实付费 provider、真实媒体、E6。
ARCH/SECURITY \`APPROVED P0=0/P1=0/P2=1\`
TEST/QUALITY \`APPROVED P0=0/P1=0/P2=0\`
`,
    "docs/reviews/main-control-event-ledger.md": `
accepted_candidate: e8e37cd892570e3abee961374ec3512a373f6400
accepted_candidate_tree: 749fe41f42285dc9115351ddcbc675e77d428cb7
squash_delivery_head: dc193dbbd3ac1970f571fd618f12902a4033994c
post_merge_gate_head: 9f04986469a3e409b3ce887390e8830cbdfe9493
trusted replay \`29977969717\` completed/success
RMD-TASK-002 保持 partial、RMD-TASK-003 保持 open、总账保持 9/42
`,
    "docs/reviews/main-control-status.md": `
RP-02B2a2 trusted replay \`29977969717\` 全绿
总账 9/42、RMD-TASK-002=partial、RMD-TASK-003=open
`,
    "docs/remediation/issue-ledger.md": `
| RMD-TASK-002 | fixture | partial |
| RMD-TASK-003 | fixture | open |
`,
    "docs/remediation/acceptance-matrix.md": `
candidate \`e8e37cd\` delivered; trusted replay \`29977969717\`
\`9/42\` \`RMD-TASK-002=partial\` \`RMD-TASK-003=open\`
`,
  };
  return content[path];
}
function prepareCloseoutEvidence({ mutate, secondCommit = false } = {}) {
  const policy = prepare(CLOSEOUT_POLICY_CORRECTION_ID), repoPath = policy.repo;
  for (const path of A2_CLOSEOUT_EVIDENCE_FILES) {
    let original = "";
    try { original = readFileSync(resolve(repoPath, path), "utf8"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
    let next = `${original.trimEnd()}\n${closeoutEvidenceAppend(path)}`;
    if (mutate) next = mutate(path, next);
    write(repoPath, path, next);
  }
  let head = commit(repoPath, "RP-02B2a2 closeout evidence");
  if (secondCommit) {
    write(repoPath, A2_CLOSEOUT_EVIDENCE_VERIFICATION, `${readFileSync(resolve(repoPath, A2_CLOSEOUT_EVIDENCE_VERIFICATION), "utf8")}second commit\n`);
    head = commit(repoPath, "invalid second closeout commit");
  }
  return { repo: repoPath, base: policy.head, policySource: policy.head, head, packageId: A2_CLOSEOUT_EVIDENCE_ID };
}
function closeoutAdmission(item, overrides = {}) {
  const policySource = Object.hasOwn(overrides, "policySource") ? overrides.policySource : item.policySource;
  const args = ["--github-output", "--event", "pull_request_target", "--event-base", overrides.eventBase ?? item.base, "--event-head", overrides.eventHead ?? item.head];
  if (policySource) args.push("--policy-source", policySource);
  return run(item.repo, args);
}
const invokePackageGate=gate;gate=item=>{const packageId=changedBusinessPackage(item);return invokePackageGate(packageId==="RP-02B2a2"&&!item.gateSource?{...item,gateSource:item.base,authorizedPackageId:packageId,authorizedPredecessorSha:item.base}:item)};
function trustedCheckoutGate(item) {
  const trusted = mkdtempSync(resolve(tmpdir(), "rp02b2a-trusted-checkout-"));
  sh(tmpdir(), ["git", "clone", "-q", "--shared", "--no-checkout", item.repo, trusted]);
  sh(trusted, ["git", "checkout", "-q", "--detach", item.gateSource]);
  return run(trusted, ["--github-output", "--event", "pull_request_target", "--event-base", item.base, "--event-head", item.head, "--gate-source", item.gateSource, "--g0-evidence-sha", item.g0EvidenceSha, "--authorized-package-id", item.packageId, "--authorized-predecessor-sha", item.authorizedPredecessorSha]);
}
function expectedManifestDigest(item, base = item.base) {
  const [manifestId, adrPath, hardMaxFiles, hardMaxNetAdditions] = ORACLE[item.packageId];
  const manifest = MANIFESTS[item.packageId].map((path) => {
    const entry = sh(item.repo, ["git", "ls-tree", item.head, "--", path]).trim();
    if (!entry) return { path, state: "missing" };
    const [metadata] = entry.split("\t"), [mode, type, object] = metadata.split(" ");
    assert.equal(type, "blob", path);
    return { path, mode, object };
  });
  return createHash("sha256").update(JSON.stringify({ policy_version: "RP-02B2a-trusted-admission-v2", package_id: item.packageId, manifest_id: manifestId, adr_path: adrPath, test_command: COMMANDS[item.packageId], hard_max_files: hardMaxFiles, hard_max_net_additions: hardMaxNetAdditions, baseline_policy: BASELINES[item.packageId], required_categories: [...REQUIRED_CATEGORIES[item.packageId]].sort(), base_sha: base, candidate_sha: item.head, manifest })).digest("hex");
}
function admittedCandidateArgs(item, overrides = {}) {
  const values = {
    packageId: item.packageId,
    predecessor: item.base,
    candidate: item.head,
    tree: sh(item.repo, ["git", "rev-parse", `${item.head}^{tree}`]).trim(),
    digest: expectedManifestDigest(item),
    ...overrides,
  };
  return [
    "--gate-source", item.gateSource,
    "--g0-evidence-sha", item.g0EvidenceSha,
    "--authorized-package-id", values.packageId,
    "--authorized-predecessor-sha", values.predecessor,
    "--authorized-candidate-sha", values.candidate,
    "--authorized-candidate-tree", values.tree,
    "--authorized-manifest-digest", values.digest,
  ];
}
const GATE_PREP_SCRIPT_NAMES=Object.freeze(["test:rp02b2a1:env-probe","test:rp02b2a1:gate","test:rp02b2a1:core","test:rp02b2a1"]);
function gatePrepPackageJson(sourcePackageJson=JSON.parse(readFileSync(resolve(ROOT,"package.json"),"utf8"))){const baselinePackageJson=JSON.parse(sh(ROOT,["git","show",`${B2A2_BASELINE}:package.json`]));baselinePackageJson.scripts={...baselinePackageJson.scripts,...Object.fromEntries(GATE_PREP_SCRIPT_NAMES.map(name=>[name,sourcePackageJson.scripts?.[name]]))};return`${JSON.stringify(baselinePackageJson,null,2)}\n`}
const ACCEPTED_G0_SHA = "01245feb51b50ec838cb405a67bcafd1b194eeae";
const ACCEPTED_G0_C1_SHA = "f27442d159d7f9d6ef273128797be6085bbd8f9d";
const ACCEPTED_G0_C2_SHA = "e15b59b1eef9165501d534a183577617512df5d3";
const ACCEPTED_G0_C3_SHA = "81f567d4fb61765c9a5d407dae04011d08d5aa19";
const ACCEPTED_G0_C4_SHA = "e020fb07d6279de5544ed15962b2a82d820a8247";
const ACCEPTED_G0_C5_SHA = "056a8d28910c765c9887a245e2dc4269859e5ec2";
const G0_C1_AUTHORITY_ADR = "docs/adr/rp-02b2a2-authority-claim-budget.md";
const CORRECTION_SOURCE_FILES = new Set();
function copyGatePrepFile(repoPath,file,sourcePackageJson){
  if(file==="package.json") return write(repoPath,file,gatePrepPackageJson(sourcePackageJson));
  const content=CORRECTION_SOURCE_FILES.has(file)
    ? readFileSync(resolve(ROOT,file))
    : sh(ROOT,["git","show",`${ACCEPTED_G0_SHA}:${file}`],{encoding:null});
  write(repoPath,file,content);
}
function copyCorrectionFile(repoPath,file){
  const content = sh(
    ROOT,
    ["git", "show", `${ACCEPTED_G0_C1_SHA}:${file}`],
    { encoding: null },
  );
  write(repoPath,file,content);
}
function copyTestLayerFile(repoPath, file, sourceRef) {
  const content = sourceRef
    ? sh(ROOT, ["git", "show", `${sourceRef}:${file}`], { encoding: null })
    : readFileSync(resolve(ROOT, file));
  write(repoPath, file, content);
}
function addEvidenceReceiptTriggers(text) {
  const lines = EVIDENCE_RECEIPT_PATHS.map((path) => `      - '${path}'`).join("\n");
  for (const event of ["push", "pull_request"]) {
    const pattern = new RegExp(`(^  ${event}:\\n    paths:\\n      - '[^']+'\\n)`, "m");
    assert.match(text, pattern, `missing ${event} paths fixture`);
    text = text.replace(pattern, `$1${lines}\n`);
  }
  return text;
}
function addC5AdrTrigger(text) {
  const anchor = `      - '${A2_SCOPE_ADR}'\n`;
  assert.ok(text.includes(anchor), "C5 baseline must contain the historical C4 ADR trigger");
  assert.ok(text.includes("    timeout-minutes: 20"), "C5 baseline must retain the historical 20-minute RP-01C timeout");
  return text
    .replace(anchor, `${anchor}      - '${A2_SCOPE_V5_ADR}'\n`)
    .replace("    timeout-minutes: 20", "    timeout-minutes: 45");
}
function mutateWorkflowEventPath(text, event, path, replacement = "") {
  const eventPattern = new RegExp(`(^  ${event}:\\n[\\s\\S]*?)(?=^  [a-z_]+:|^permissions:)`, "m");
  const eventMatch = eventPattern.exec(text);
  assert.ok(eventMatch, `missing ${event} workflow block`);
  const line = `      - '${path}'`;
  assert.ok(eventMatch[1].includes(line), `${event} is missing ${path}`);
  const changedBlock = eventMatch[1].replace(line, replacement);
  return `${text.slice(0, eventMatch.index)}${changedBlock}${text.slice(eventMatch.index + eventMatch[1].length)}`;
}
function copyA2ScopeV5File(repoPath, file) {
  if (file === GATE_SCRIPT) {
    return write(repoPath, file, readFileSync(resolve(ROOT, file)));
  }
  if (file === "scripts/rp02b2a-package-gate.test.mjs") {
    return write(repoPath, file, sh(ROOT, ["git", "show", `${ACCEPTED_G0_C5_SHA}:${file}`], { encoding: null }));
  }
  const baseline = sh(ROOT, ["git", "show", `${A2_SCOPE_V5_BASELINE}:${file}`], { encoding: null });
  const content = file === ".github/workflows/rp01a-e2e.yml" || file === ".github/workflows/rp01b-dom.yml"
    ? addEvidenceReceiptTriggers(baseline.toString("utf8"))
    : file === ".github/workflows/rp01c-fixtures.yml"
      ? addC5AdrTrigger(baseline.toString("utf8"))
      : baseline;
  write(repoPath, file, content);
}
function addCorrectionSibling(repoPath,label,mutateWorkflow=(text)=>text){
  const [manifestId,adrPath,hardMaxFiles,hardMaxNetAdditions]=ORACLE[CORRECTION_ID];
  sh(repoPath,["git","checkout","-q","--detach",CORRECTION_BASELINE]);
  for(const file of MANIFESTS[CORRECTION_ID].filter(item=>item!==adrPath))copyCorrectionFile(repoPath,file);
  const workflowPath=".github/workflows/rp01c-fixtures.yml";
  write(repoPath,workflowPath,mutateWorkflow(readFileSync(resolve(repoPath,workflowPath),"utf8")));
  const verificationPath="docs/reviews/rp-02b2a2-g0-ci-compat-correction-verification-2026-07-18.md";
  write(repoPath,verificationPath,`${readFileSync(resolve(repoPath,verificationPath),"utf8")}\nBootstrap fixture: ${label}\n`);
  const render=(files,net)=>adr({status:"ready",package_id:CORRECTION_ID,manifest_id:manifestId,baseline_sha:CORRECTION_BASELINE,hard_max_files:hardMaxFiles,hard_max_net_additions:hardMaxNetAdditions,actual_files:files,actual_net_additions:net});
  write(repoPath,adrPath,render(0,0));
  const actual=stats(repoPath,CORRECTION_BASELINE);
  write(repoPath,adrPath,render(actual.files,actual.net));
  return commit(repoPath,`correction sibling ${label}`);
}
function mutateCorrectionCandidateFile(file, transform) {
  const item = prepare(CORRECTION_ID), adrPath = CORRECTION_ADR;
  const changed = transform(readFileSync(resolve(item.repo, file), "utf8"));
  assert.notEqual(changed, readFileSync(resolve(item.repo, file), "utf8"), `${file} mutation did not change fixture`);
  write(item.repo, file, changed);
  const reset = readFileSync(resolve(item.repo, adrPath), "utf8")
    .replace(/^actual_files:.*$/m, "actual_files: 0")
    .replace(/^actual_net_additions:.*$/m, "actual_net_additions: 0");
  write(item.repo, adrPath, reset);
  const actual = stats(item.repo, CORRECTION_BASELINE);
  write(item.repo, adrPath, reset
    .replace("actual_files: 0", `actual_files: ${actual.files}`)
    .replace("actual_net_additions: 0", `actual_net_additions: ${actual.net}`));
  sh(item.repo, ["git", "add", "--", file, adrPath]);
  sh(item.repo, ["git", "commit", "-q", "--amend", "--no-edit"]);
  item.head = sh(item.repo, ["git", "rev-parse", "HEAD"]).trim();
  return item;
}
function mutateEvidenceTriggerCandidateFile(file, transform) {
  const item = prepare(EVIDENCE_TRIGGER_ID), adrPath = EVIDENCE_TRIGGER_ADR;
  const original = readFileSync(resolve(item.repo, file), "utf8");
  const changed = transform(original);
  assert.notEqual(changed, original, `${file} mutation did not change fixture`);
  write(item.repo, file, changed);
  const reset = readFileSync(resolve(item.repo, adrPath), "utf8")
    .replace(/^actual_files:.*$/m, "actual_files: 0")
    .replace(/^actual_net_additions:.*$/m, "actual_net_additions: 0");
  write(item.repo, adrPath, reset);
  const actual = stats(item.repo, EVIDENCE_TRIGGER_BASELINE);
  write(item.repo, adrPath, reset
    .replace("actual_files: 0", `actual_files: ${actual.files}`)
    .replace("actual_net_additions: 0", `actual_net_additions: ${actual.net}`));
  sh(item.repo, ["git", "add", "--", file, adrPath]);
  sh(item.repo, ["git", "commit", "-q", "--amend", "--no-edit"]);
  item.head = sh(item.repo, ["git", "rev-parse", "HEAD"]).trim();
  return item;
}
function mutateA2ScopeV5CandidateFile(file, transform) {
  const item = prepare(A2_SCOPE_V5_ID), adrPath = A2_SCOPE_V5_ADR;
  const original = readFileSync(resolve(item.repo, file), "utf8");
  const changed = transform(original);
  assert.notEqual(changed, original, `${file} mutation did not change fixture`);
  write(item.repo, file, changed);
  const reset = readFileSync(resolve(item.repo, adrPath), "utf8")
    .replace(/^actual_files:.*$/m, "actual_files: 0")
    .replace(/^actual_net_additions:.*$/m, "actual_net_additions: 0");
  write(item.repo, adrPath, reset);
  const actual = stats(item.repo, A2_SCOPE_V5_BASELINE);
  write(item.repo, adrPath, reset
    .replace("actual_files: 0", `actual_files: ${actual.files}`)
    .replace("actual_net_additions: 0", `actual_net_additions: ${actual.net}`));
  sh(item.repo, ["git", "add", "--", file, adrPath]);
  sh(item.repo, ["git", "commit", "-q", "--amend", "--no-edit"]);
  item.head = sh(item.repo, ["git", "rev-parse", "HEAD"]).trim();
  return item;
}
it("freezes temporary gate-prep package scripts when the outer candidate contains A2 scripts",()=>{const sourcePackageJson=JSON.parse(readFileSync(resolve(ROOT,"package.json"),"utf8"));sourcePackageJson.scripts={...sourcePackageJson.scripts,...B2A2_SCRIPTS};const frozen=JSON.parse(gatePrepPackageJson(sourcePackageJson));for(const name of Object.keys(B2A2_SCRIPTS))assert.equal(frozen.scripts[name],void 0);for(const name of GATE_PREP_SCRIPT_NAMES)assert.equal(frozen.scripts[name],sourcePackageJson.scripts[name])});
it("freezes the accepted G0-C1 authority template when the outer candidate marks A2 ready",()=>{const path=repo(CORRECTION_BASELINE);copyCorrectionFile(path,G0_C1_AUTHORITY_ADR);const fixture=readFileSync(resolve(path,G0_C1_AUTHORITY_ADR),"utf8"),accepted=sh(ROOT,["git","show",`${ACCEPTED_G0_C1_SHA}:${G0_C1_AUTHORITY_ADR}`]);assert.equal(fixture,accepted);assert.match(fixture,/^status: template_not_authorized$/m);assert.match(fixture,/^baseline_sha: not_authorized$/m);assert.doesNotMatch(fixture,/^status: ready$/m)});
function copyCurrentFiles(repoPath,files){for(const file of files)copyGatePrepFile(repoPath,file)}function addMinimalB2a2Candidate(repoPath,base){const[manifestId,adrPath,hardMaxFiles,hardMaxNetAdditions]=ORACLE["RP-02B2a2"];for(const file of select("RP-02B2a2").filter(item=>item!==adrPath))write(repoPath,file,`${file}
`);writeB2a2PackageJson(repoPath);const render=(files,net)=>adr({status:"ready",package_id:"RP-02B2a2",manifest_id:manifestId,baseline_sha:base,hard_max_files:hardMaxFiles,hard_max_net_additions:hardMaxNetAdditions,actual_files:files,actual_net_additions:net});write(repoPath,adrPath,render(0,0));const actual=stats(repoPath,base);write(repoPath,adrPath,render(actual.files,actual.net));return commit(repoPath,"minimal B2a2 candidate after governance remediation")}function createB2a2CommandHarness(item){
const packageJson=JSON.parse(sh(item.repo,["git","show",`${item.head}:package.json`])),scripts=packageJson.scripts,directory=mkdtempSync(resolve(tmpdir(),"rp02b2a2-command-")),shim=resolve(directory,"npm-shim.mjs"),npm=resolve(directory,"npm"),log=resolve(directory,"stages.log"),canary="RP02B2A2_ENV_CANARY",canaries=Object.fromEntries(["DATABASE_URL","DEEPSEEK_API_KEY","DEEPSEEK_BASE_URL","DEEPSEEK_MODEL","DEEPSEEK_STRUCTURE_MODEL","DEEPSEEK_REASONER_MODEL","DEEPSEEK_TIMEOUT_MS","DEEPSEEK_MAX_RE\
TRIES","DEPLOYMENT_ACTOR_TENANT_ID","DEPLOYMENT_ACTOR_USER_ID"].map(key=>[key,canary]));writeFileSync(shim,`#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
const record = (stage) => appendFileSync(process.env.RP02B2A2_STAGE_LOG, stage + "\\n");
const fail = (stage) => {
  if (process.env.RP02B2A2_FAIL_STAGE === stage) process.exit(17);
};
if (args[0] === "run" && ["test:rp02b2a2:env-probe", "test:rp02b2a2:core"].includes(args[1])) {
  const stage = args[1].endsWith(":core") ? "core" : "env-probe";
  record(stage);
  fail(stage);
  const packageJson = JSON.parse(readFileSync(process.env.RP02B2A2_PACKAGE_JSON, "utf8"));
  const child = spawnSync("/bin/sh", ["-c", packageJson.scripts[args[1]]], {
    env: process.env,
    stdio: "inherit",
  });
  process.exit(child.status ?? 1);
}
let stage;
if (args[0] === "run" && args[1] === "test:rp01c") stage = "rp01c";
else if (args[0] === "run" && args[1] === "test:rp02b2a1") stage = "predecessor";
else if (args[0] === "run" && args[1] === "build") stage = "build";
else if (args[0] === "run" && args[1] === "prisma:generate") stage = "prisma";
else if (args[0] === "exec" && args.includes("--test")) stage = "tests";
else stage = "unexpected:" + args.join(" ");
record(stage);
fail(stage);
process.exit(stage.startsWith("unexpected:") ? 64 : 0);
`);chmodSync(shim,493);symlinkSync(shim,npm);const runScript=(name,failStage)=>{writeFileSync(log,"");const result=spawnSync("/bin/sh",["-c",scripts[name]],{cwd:item.repo,encoding:"utf8",env:{...process.env,...canaries,RP02B2A2_ENV_CANARY:canary,RP02B2A2_FAIL_STAGE:failStage??"",RP02B2A2_PACKAGE_JSON:resolve(item.repo,"package.json"),RP02B2A2_STAGE_LOG:log,PATH:`${directory}:${process.env.PATH}`}});const stages=readFileSync(log,"utf8").split("\n").filter(Boolean);return{...result,stages}};return{
canary,runScript}}function workflow(path=WORKFLOW,args=[]){return run(ROOT,["--verify-workflow",path,...args])}function trustedWorkflow(){return run(ROOT,["--verify-admission-workflow",".github/workflows/rp02b2a-admission.yml"])}function mutateTrustedWorkflow(change,label="trusted workflow mutation must change fixture"){const path=repo(),original=readFileSync(ADMISSION_WORKFLOW,"utf8"),changed=change(original);assert.notEqual(changed,original,label);write(path,".github/workflows/rp02b2a-admission.yml",changed);return run(path,["--verify-admission-workflow",".github/workflows/rp02b2a-admission.yml"])}function mutate(change,label="workflow mutation must change fixture"){const path=resolve(mkdtempSync(resolve(tmpdir(),"rp02b2a-yaml-")),"workflow.yml");const original=readFileSync(WORKFLOW,"utf8");const changed=change(original);assert.notEqual(changed,original,label);writeFileSync(path,changed);return workflow(path)}function aliasPaths(text,name="gate_paths"){return text.replace("      base_sha:\n        description: Explicit base SHA for package gate\n        required: true\n      head_sha:\n        description: Explicit head SHA for package gate\n        required: true",`      base_sha: &gate_paths\n        description: Explicit base SHA for package gate\n        required: true\n      head_sha: *${name}`)}function expectRejected(result,pattern,message){const context=message??`${result.stdout}\n${result.stderr}`;assert.ok(Number.isInteger(result.status)&&result.status!==0,context);assert.equal(result.signal,null,context);assert.match(result.stderr,pattern,message)}function fail(overrides,pattern){expectRejected(gate(prepare("RP-02B2a1",A1_FILES,{overrides})),pattern)}function addPackage(repoPath,packageId,base,{status="ready",includeAdr=true}={}){const[manifestId,adrPath,hardMaxFiles,hardMaxNetAdditions]=ORACLE[packageId],files=select(packageId),render=(count,net)=>adr({status,package_id:packageId,manifest_id:manifestId,baseline_sha:["range-base",VERIFIED_GATE_PREP].includes(BASELINES[packageId])?base:BASELINES[packageId],hard_max_files:hardMaxFiles,hard_max_net_additions:hardMaxNetAdditions,actual_files:count,actual_net_additions:net});
for(const file of files.filter(item=>item!==adrPath)){if(GOVERNANCE_REMEDIATION_FILES.includes(file))write(repoPath,file,readFileSync(resolve(ROOT,file)));else write(repoPath,file,file===EXCLUSIVE[packageId]?`${packageId}:${file}\\n`:`${file}\\n`)}if(BUSINESS_PACKAGE_SEQUENCE.includes(packageId))writeBusinessPackageJson(repoPath,packageId);if(includeAdr){write(repoPath,adrPath,render(0,0));const actual=stats(repoPath,base);write(repoPath,adrPath,render(actual.files,actual.net))}else try{unlinkSync(resolve(repoPath,adrPath))}catch(error){if(error?.code!=="ENOENT")throw error}return commit(repoPath,`${packageId} ${status}`)}function damagePackage(repoPath,packageId,mode){const adrPath=ORACLE[packageId][1];write(repoPath,EXCLUSIVE[packageId],`${packageId} ${mode}
`);if(mode==="missing")unlinkSync(resolve(repoPath,adrPath));else write(repoPath,adrPath,readFileSync(resolve(repoPath,adrPath),"utf8").replace("status: ready",`status: ${mode}`));return commit(repoPath,`${packageId} ${mode}`)}function forceBefore(repoPath,landed,head){sh(repoPath,["git","checkout","-q","--detach",landed]);sh(repoPath,["git","commit","-q","--allow-empty","-m","unreachable force before"]);const before=sh(repoPath,["git","rev-parse","HEAD"]).trim();sh(repoPath,["git","checkout","-\
q","--detach",head]);return before}function pushRange(repoPath,baseRef,before,head){return run(repoPath,["--print-range","--event","push","--push-base-ref",baseRef,"--push-before",before,"--push-head",head])}function assertOracle(definitions){assert.deepEqual(Object.keys(definitions).sort(),Object.keys(ORACLE).sort());for(const[id,tuple]of Object.entries(ORACLE)){const def=definitions[id];assert.deepEqual([def.manifestId,def.adrPath,def.hardMaxFiles,def.hardMaxNetAdditions,def.testCommand,def.baselinePolicy],[...tuple,COMMANDS[id],BASELINES[id]]);assert.deepEqual([...def.
manifest].sort(),MANIFESTS[id]);assert.deepEqual([...def.requiredCategories].sort(),[...REQUIRED_CATEGORIES[id]].sort())}}describe("RP-02B2a package gate production script",()=>{it("passes through the production script in a fixed-baseline temporary repo",()=>{const result=gate(prepare());assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/package gate passed/)});it("matches the independent frozen package oracle",()=>assertOracle(PACKAGE_DEFINITIONS));it("rejects non-script package drift and contaminated G0 ancestry",()=>{const mutateMetadata=item=>{const packageJson=JSON.parse(readFileSync(resolve(item.repo,"package.json"),"utf8"));packageJson.version=`${packageJson.version}-tampered`;write(item.repo,"package.json",`${JSON.stringify(packageJson,null,2)}\n`);item.head=commit(item.repo,"tamper package metadata");return item};const gatePrep=mutateMetadata(prepare(GATE_PREP_ID));expectRejected(gate(gatePrep),/cannot modify non-script package\.json fields/);const contaminatedBase=gatePrep.head,candidate=addMinimalB2a2Candidate(gatePrep.repo,contaminatedBase);expectRejected(gate({repo:gatePrep.repo,base:contaminatedBase,head:candidate}),/manifest_id mismatch|must branch directly from the accepted G0 code head|must be one atomic direct child commit/);const a2=mutateMetadata(prepare("RP-02B2a2"));expectRejected(gate(a2),/cannot modify non-script package\.json fields/)});it("detects every A1-A5 allowlist and baseline-policy mutation",()=>{for(const id of Object.keys(ORACLE)){const def2=PACKAGE_DEFINITIONS[id];
assert.throws(()=>assertOracle({...PACKAGE_DEFINITIONS,[id]:{...def2,manifest:new Set([...def2.manifest,`outside/${id}.ts`])}}));assert.throws(()=>assertOracle({...PACKAGE_DEFINITIONS,[id]:{...def2,baselinePolicy:"self-reported"}}))}const def=PACKAGE_DEFINITIONS["RP-02B2a1"],manifest2=new Set(def.manifest);manifest2.delete("packages/shared/src/novels.ts");manifest2.add("apps/api/src/modules/novels/providers/deepseekNovelProvider.test.ts");assert.throws(()=>assertOracle({...PACKAGE_DEFINITIONS,"R\
P-02B2a1":{...def,manifest:manifest2}}))});it("clears external env canaries through gate, core, and composite prefixes",()=>{const scripts=JSON.parse(readFileSync(resolve("package.json"),"utf8")).scripts,canaries=Object.fromEntries(["DATABASE_URL","DEEPSEEK_API_KEY","DEEPSEEK_BASE_URL","DEEPSEEK_MODEL","DEEPSEEK_STRUCTURE_MODEL","DEEPSEEK_REASONER_MODEL","DEEPSEEK_TIMEOUT_MS","DEEPSEEK_MAX_RETRIES","DEPLOYMENT_ACTOR_TENANT_ID","DEPLOYMENT_ACTOR_USER_ID"].map(key=>[key,"leak"]));for(const name of["test:rp02b2a1:gate","test:rp02b2a1:core","test:rp02b2a\
1"]){const[prefix]=scripts[name].split(" sh -c "),child=spawnSync("sh",["-c",`${prefix} npm run test:rp02b2a1:env-probe`],{cwd:ROOT,encoding:"utf8",env:{...process.env,...canaries}});assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/RP02B2A_ENV_CLEAN/)}});it("live-spawns the committed A2 probe, core, and composite with env isolation and fail-fast ordering",()=>{const item=prepare("RP-02B2a2"),harness=createB2a2CommandHarness(item),directProbe=harness.runScript("test:rp02b2a2:e\
nv-probe");assert.notEqual(directProbe.status,0);assert.deepEqual(directProbe.stages,[]);for(const[name,expectedStages]of[["test:rp02b2a2:core",["env-probe","build","prisma","tests"]],["test:rp02b2a2",["env-probe","rp01c","predecessor","core","env-probe","build","prisma","tests"]]]){const passed=harness.runScript(name);assert.equal(passed.status,0,passed.stderr);assert.deepEqual(passed.stages,expectedStages);assert.match(passed.stdout,/RP02B2A2_ENV_CLEAN/);assert.doesNotMatch(`${passed.stdout}
${passed.stderr}`,new RegExp(harness.canary))}for(const[failedStage,expectedStages]of[["rp01c",["env-probe","rp01c"]],["predecessor",["env-probe","rp01c","predecessor"]],["build",["env-probe","rp01c","predecessor","core","env-probe","build"]],["prisma",["env-probe","rp01c","predecessor","core","env-probe","build","prisma"]]]){const failed=harness.runScript("test:rp02b2a2",failedStage);assert.equal(failed.status,17,`${failedStage}: ${failed.stderr}`);assert.deepEqual(failed.stages,expectedStages,`${failedStage} failure must stop before every downstream stage`)}});it("executes the gate script committed in the candidate HEAD",()=>{const path=repo(),base=sh(path,["git","rev-parse","HEAD"]).trim(),marker="CANDIDATE_HEAD_GATE_EXECUTED";write(path,GATE_SCRIPT,`console.error(${JSON.stringify(marker)}); process.exitCode = 23;
`);const result=gate({repo:path,base,head:commit(path,"candidate-owned gate script")});assert.equal(result.status,23);expectRejected(result,new RegExp(marker))});it("fails closed for ADR field and category drift",()=>{for(const[overrides,pattern]of[[{status:"draft"},/status mismatch/],[{package_id:"RP-02B2a2"},/package_id mismatch/],[{manifest_id:"wrong"},/manifest_id mismatch/],[{baseline_sha:"1".repeat(40)},/baseline_sha mismatch/],[{actual_files:2},/actual_files mismatch/],[{actual_net_additions:3},
/actual_net_additions mismatch/]])fail(overrides,pattern);const path=repo(true);write(path,A1_ADR,adr({status:"ready",package_id:"RP-02B2a1",manifest_id:"RP-02B2a1-v1",baseline_sha:BASELINE,hard_max_files:18,hard_max_net_additions:1900,actual_files:1,actual_net_additions:0}));expectRejected(gate({repo:path,base:BASELINE,head:commit(path,"adr only")}),/missing required production/)});it("fixes A1 and gate-prep baselines, binds B2a2 to verified G0, and keeps A3-A5 range-bound",()=>{const path=repo(),
base=sh(path,["git","rev-parse","HEAD"]).trim();write(path,A1_FILES[0],"production\n");write(path,A1_FILES[1],"test\n");write(path,A1_ADR,adr({status:"ready",package_id:"RP-02B2a1",manifest_id:"RP-02B2a1-v1",baseline_sha:base,hard_max_files:18,hard_max_net_additions:1900,actual_files:3,actual_net_additions:11}));expectRejected(gate({repo:path,base,head:commit(path,"random A1")}),/requires fixed baseline/);const b2a2=prepare("RP-02B2a2");assert.notEqual(b2a2.base,B2A2_BASELINE);assert.equal(
sh(b2a2.repo,["git","rev-parse",`${b2a2.base}^`]).trim(),A2_SCOPE_V5_BASELINE);const b2a2Result=gate(b2a2);assert.equal(b2a2Result.status,0,b2a2Result.stderr);expectRejected(gate({...b2a2,base:B2A2_BASELINE}),/requires exactly one changed ADR, got [23]|cannot batch RP-02B2a2-G0-E1 publication evidence/);for(const id of RANGE_PACKAGES){const item=prepare(id),result=gate(item);assert.notEqual(item.base,BASELINE);assert.equal(result.status,0,`${id}: ${result.stderr}`);expectRejected(gate(prepare(id,void 0,{overrides:{baseline_sha:"f".repeat(40)}})),/baseline_sha mismatch/)}});it("requires the\
 candidate HEAD B2a2 env-probe, core, and composite commands",async()=>{const valid=prepare("RP-02B2a2"),passed=gate(valid);assert.equal(passed.status,0,passed.stderr);writeB2a2PackageJson(valid.repo,scripts=>({...scripts,"test:rp02b2a2":"true"}));assert.equal(gate(valid).status,0,"the gate must read the committed candidate HEAD, not the dirty worktree");const cases=[scripts=>({...scripts,"test:rp02b2a2:env-probe":"true"}),scripts=>({...scripts,"test:rp02b2a2:core":`${CLEAN_ENV} sh -c ''`}),scripts=>({
...scripts,"test:rp02b2a2:core":`${scripts["test:rp02b2a2:core"]} || true`}),scripts=>({...scripts,"test:rp02b2a2:core":scripts["test:rp02b2a2:core"].replace("env -u DATABASE_URL ","env ")}),scripts=>({...scripts,"test:rp02b2a2:core":scripts["test:rp02b2a2:core"].replace("-u DEPLOYMENT_ACTOR_TENANT_ID ","")}),scripts=>({...scripts,"test:rp02b2a2:core":scripts["test:rp02b2a2:core"].replace("env-probe && npm run build","env-probe; npm run build")}),scripts=>({...scripts,"test:rp02b2a2:core":scripts["test:rp02b2a2:core"].replace("npm run build -w @ai-shortvideo/shared && npm run prisma:generate","npm run build -w @ai-shortvideo/shared; npm run prisma:generate")}),scripts=>({...scripts,"test:rp02b2a2:core":scripts["test:rp02b2a2:core"].replace("test/rp02b2a/authority-claim.test.ts ","")}),scripts=>({...scripts,"test:rp02b2a2:core":scripts["test:rp02b2a2:core"].replace("test/rp02b2a/repository-authority-hardening.test.ts ","")}),scripts=>({...scripts,"test:rp02b2a2:core":scripts["\
test:rp02b2a2:core"].replace(" src/modules/novels/novelRoutes.test.ts","")}),scripts=>({...scripts,"test:rp02b2a2":scripts["test:rp02b2a2"].replace("npm run test:rp01c && ","")}),scripts=>({...scripts,"test:rp02b2a2":scripts["test:rp02b2a2"].replace("npm run test:rp02b2a1 && ","")}),scripts=>({...scripts,"test:rp02b2a2":scripts["test:rp02b2a2"].replace("env-probe && npm run test:rp01c","env-probe; npm run test:rp01c")})];const items=cases.map(mutateScripts=>prepare("RP-02B2a2",void 0,{mutateScripts}));await mapWithConcurrency(items,6,async item=>expectRejected(await gateAsync(item),/script test:rp02b2a2.*env-clean fail-fast contract/))});it("preserves historical A2 v4 documentation while the v5 oracle adds RP-01C",()=>{const document=readFileSync(resolve("docs/modules/rp-02b2-dispatcher-transport-implementation-package.md"),"utf8"),block=/B2a2 在 `package\.json`[\s\S]*?```json\n([\s\S]*?)\n```/.exec(document);assert.ok(block,"missing documented B2a2 JSON script contract");const historical={...B2A2_SCRIPTS,"test:rp02b2a2":B2A2_SCRIPTS["test:rp02b2a2"].replace(" && npm run test:rp01c","")};assert.deepEqual(JSON.parse(block[1]),historical);assert.match(B2A2_SCRIPTS["test:rp02b2a2"],/npm run test:rp01c/)});it("rejects inherited script rewrites and root lifecycle hooks",()=>{expectRejected(gate(prepare("RP-02B2a2",void 0,{mutateScripts:scripts=>({...scripts,"test:rp02b2a1":"true"})})),/cannot rewrite inherited package\.json script test:rp02b2a1/);for(const lifecycle of["preinstall","install","postinstall","prepare"])expectRejected(gate(prepare("RP-02B2a2",void 0,{mutateScripts:scripts=>({...scripts,[lifecycle]:"true"})})),new RegExp(`rejects root npm lifecycle script ${lifecycle}`))});it("freezes gate-prep A1 actor-clean scripts and all other inherited scripts",()=>{const reject=mutate=>{const item=prepare(GATE_PREP_ID),packageJson=JSON.parse(readFileSync(resolve(item.repo,"package.json"),"utf8"));packageJson.scripts=mutate({...packageJson.scripts});write(item.repo,"package.json",`${JSON.stringify(packageJson,null,2)}\n`);item.head=commit(item.repo,"invalid gate-prep package scripts");return gate(item)};for(const mutate of[scripts=>({...scripts,"test:rp02b2a1:env-probe":scripts["test:rp02b2a1:env-probe"].replace(",\'DEPLOYMENT_ACTOR_USER_ID\'","")}),scripts=>({...scripts,"test:rp02b2a1:gate":scripts["test:rp02b2a1:gate"].replace("-u DEPLOYMENT_ACTOR_TENANT_ID ","")}),scripts=>({...scripts,"test:rp02b2a1:core":"true"}),scripts=>({...scripts,"test:governance":"true"}),scripts=>({...scripts,"test:unapproved":"true"}),scripts=>({...scripts,prepare:"true"})])expectRejected(reject(mutate),/cannot rewrite inherited package\.json script|cannot add package\.json script|rejects root npm lifecycle script|does not match the actor-clean contract/)});it("rejects the obsolete 15-file A2 template when it becomes a candidate contract",()=>expectRejected(gate(prepare("RP-02B2a2",void 0,{overrides:{hard_max_files:15}})),/hard_max_files mismatch/));it("admits t\
he current governance remediation only through the separately owned gate-prep package",()=>{const path=repo(B2A2_BASELINE);copyCurrentFiles(path,GOVERNANCE_REMEDIATION_FILES);const render=(files,net)=>adr({status:"ready",package_id:GATE_PREP_ID,manifest_id:"RP-02B2a2-G0-v1",baseline_sha:B2A2_BASELINE,hard_max_files:16,hard_max_net_additions:2e3,actual_files:files,actual_net_additions:net});write(path,GATE_PREP_ADR,render(0,0));const actual=stats(path,B2A2_BASELINE);write(path,GATE_PREP_ADR,render(
actual.files,actual.net));const head=commit(path,"governance remediation gate-prep package"),result=gate({repo:path,base:B2A2_BASELINE,head});assert.equal(result.status,0,`${result.stdout}
${result.stderr}`);assert.match(result.stdout,/RP-02B2a2-G0 package gate passed/)});it("binds governance remediation plus a minimal B2a2 candidate to the verified gate-prep commit",()=>{const item=prepare("RP-02B2a2"),result=gate(item);assert.equal(result.status,0,`${result.stdout}
${result.stderr}`);assert.match(result.stdout,/RP-02B2a2 package gate passed/);expectRejected(gate({...item,base:B2A2_BASELINE}),/requires exactly one changed ADR, got [23]|cannot batch RP-02B2a2-G0-E1 publication evidence/)});it("reads commit ADR from selected HEAD instead of the dirty worktree",()=>{const bad=prepare(),correct=readFileSync(resolve(bad.repo,A1_ADR),"utf8");write(bad.repo,A1_ADR,correct.replace("status: ready","status: draft"));bad.head=commit(bad.repo,
"bad HEAD ADR");write(bad.repo,A1_ADR,correct);expectRejected(gate(bad),/status mismatch/);const good=prepare(),clean=readFileSync(resolve(good.repo,A1_ADR),"utf8");write(good.repo,A1_ADR,clean.replace("status: ready","status: draft"));const committed=gate(good);assert.equal(committed.status,0,committed.stderr);expectRejected(run(good.repo,["--base",good.base,"--head",good.head,"--worktree"]),/status mismatch/)});it("bypasses ordinary API diffs but rejects missing, extra, and unsupport\
ed ADRs",()=>{const ordinary=repo(),base=sh(ordinary,["git","rev-parse","HEAD"]).trim();write(ordinary,"apps/api/src/modules/health/ordinary.ts","export {};\n");const fallback=run(ordinary,["--github-output","--base",base,"--head",commit(ordinary,"ordinary API")]);assert.equal(fallback.status,0,fallback.stderr);assert.match(fallback.stdout,/package_id=RP-01C.*test_command=test:rp02b1/s);const missing=prepare("RP-02B2a1",A1_FILES.slice(0,2),{includeAdr:false});expectRejected(gate(missing),/exactly one changed ADR/);
const extra=prepare();write(extra.repo,ORACLE["RP-02B2a2"][1],"status: ready\n");extra.head=commit(extra.repo,"extra ADR");expectRejected(gate(extra),/exactly one changed ADR/);const old=repo(true);write(old,A1_FILES[0],"production\n");write(old,"docs/adr/rp-02b2a-execution-core-budget.md","status: ready\n");expectRejected(gate({repo:old,base:BASELINE,head:commit(old,"old ADR")}),/unsupported ADR/)});it("rejects base-only, head-only, env-only, zero, unparseable, identical, and mismatch\
ed worktree SHAs",()=>{const item=prepare(),zero="0".repeat(40);for(const[args,pattern,env]of[[["--worktree","--base",item.base],/explicit HEAD/],[["--worktree","--head",item.head],/explicit BASE/],[["--worktree"],/explicit BASE/,{BASE_SHA:item.base,HEAD_SHA:item.head}],[["--base",zero,"--head",item.head],/zero BASE/],[["--base","HEAD~1","--head",item.head],/unparseable BASE/],[["--base",item.base,"--head","bad"],/unparseable HEAD/],[["--base",item.base,"--head",item.base],/identical BASE\/HEAD/],
[["--worktree","--base",item.base,"--head",item.base],/does not match current checkout HEAD/]])expectRejected(run(item.repo,args,env),pattern)});it("resolves ordinary PR, push, and manual ranges while rejecting zero-before pushes",()=>{const path=repo();const base=sh(path,["git","rev-parse","HEAD"]).trim();const branch=sh(path,["git","branch","--show-current"]).trim();const zero="0".repeat(40);sh(path,["git","checkout","-q","-b","feature"]);write(path,"feature.txt","x\n");const head=commit(
path,"feature");for(const args of[["--event","pull_request","--pr-base-ref",branch,"--pr-head",head],["--event","push","--push-before",base,"--push-head",head],["--event","workflow_dispatch","--manual-base",base,"--manual-head",head],["--event","push","--push-before",base,"--push-head",head,"--authorized-package-id","NOT_AUTHORIZED","--authorized-predecessor-sha","not_authorized"]]){const result=run(path,["--print-range",...args]);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,new RegExp(`base=${base}\\nhead=${head}`))}expectRejected(run(path,["--print-range","--event","push","--push-before",zero,"--push-head",head]),
/rejects zero PUSH_BEFORE/);assert.match(run(path,["--github-output","--base",base,"--head",head]).stdout,/package_id=RP-01C/)});it("rejects the explicit push and manual zero, unparseable, unreachable, and non-ancestor matrix",()=>{const path=repo(),base=sh(path,["git","rev-parse","HEAD"]).trim();write(path,"ordinary.txt","x\n");const head=commit(path,"range head"),forced=forceBefore(path,base,head),zero="0".repeat(40),unreachable="f".repeat(40),cases=[["push",["--event","push","--push-base-ref","main","--push-before",zero,"--push-head",head],/zero PUSH_BEFORE/],["push",["--event","push","--push-base-ref","main","--push-before","bad","--push-head",head],/unparseable PUSH_BEFORE/],["push",["--event","push","--push-base-ref","main","--push-before",unreachable,"--push-head",head],/unreachable PUSH_BEFORE/],["push",["--event","push","--push-base-ref","main","--push-before",forced,"--push-head",head],/not an ancestor/],["manual",["--event","workflow_dispatch","--manual-base",zero,"--manual-head",head],/zero MANUAL_BASE/],["manual",["--event","workflow_dispatch","--manual-base","bad","--manual-head",head],/unparseable MANUAL_BASE/],["manual",["--event","workflow_dispatch","--manual-base",unreachable,"--manual-head",head],/unreachable MANUAL_BASE/],["manual",["--event","workflow_dispatch","--manual-base",forced,"--manual-head",head],/manual base that is not an ancestor/]];assert.equal(cases.length,8);for(const[,args,pattern]of cases)expectRejected(run(path,["--print-range",...args]),pattern)});it("returns damaged landed A1 to B0 only for an ancestral push range",()=>{for(const mode of["draft","failed","missing"]){const item=prepare(),landed=item.head,ref=`landed-a1-${mode}`;sh(item.repo,["git","branch",ref,landed]);const failed=damagePackage(item.repo,"RP-02B2a1",mode);write(item.repo,"apps/api/src/modules/health/ordinary.ts","export {};\n");const head=commit(
item.repo,"ordinary after damaged A1"),forced=forceBefore(item.repo,landed,head);const range=pushRange(item.repo,ref,failed,head);assert.equal(range.status,0,range.stderr);assert.match(range.stdout,new RegExp(`base=${BASELINE}\\nhead=${head}`),mode);expectRejected(pushRange(item.repo,ref,forced,head),/not an ancestor/);expectRejected(pushRange(item.repo,ref,"0".repeat(40),head),/zero PUSH_BEFORE/);assert.notEqual(gate({repo:item.repo,base:BASELINE,head}).status,0)}});it("keeps unlanded\
 draft, failed, and missing-ready A1 cumulative on ancestral ranges",()=>{for(const options of[{status:"draft"},{status:"failed"},{includeAdr:false}]){const path=repo(true);sh(path,["git","branch","default-base",BASELINE]);const failed=addPackage(path,"RP-02B2a1",BASELINE,options);write(path,"apps/api/src/modules/health/ordinary.ts","export {};\n");const head=commit(path,"ordinary after unlanded A1"),forced=forceBefore(path,BASELINE,head);assert.match(pushRange(path,"default-base",failed,head).stdout,
new RegExp(`base=${BASELINE}\\nhead=${head}`));expectRejected(pushRange(path,"default-base",forced,head),/not an ancestor/);expectRejected(pushRange(path,"default-base","0".repeat(40),head),/zero PUSH_BEFORE/);assert.notEqual(gate({repo:path,base:BASELINE,head}).status,0)}});it("releases direct ordinary increments after A1 lands",()=>{const item=prepare(),landed=item.head;sh(item.repo,["git","branch","landed-a1",landed]);write(item.repo,"apps/api/src/modules/health/ordinary.ts","export\
 {};\n");const head=commit(item.repo,"ordinary after landed A1");const range=pushRange(item.repo,"ignored-main",landed,head);assert.match(range.stdout,new RegExp(`base=${landed}\\nhead=${head}`));assert.match(run(item.repo,["--github-output","--base",landed,"--head",head]).stdout,/package_id=RP-01C/);const newBranch=pushRange(item.repo,"ignored-main","0".repeat(40),head);expectRejected(newBranch,/zero PUSH_BEFORE/)});it("binds B2a2 push and PR ranges to the verified gate-prep predecessor",()=>{
const item=prepare("RP-02B2a2");const forced=forceBefore(item.repo,B2A2_BASELINE,item.head),direct=pushRange(item.repo,"ignored-main",item.base,item.head);assert.equal(direct.status,0,direct.stderr);assert.match(direct.stdout,new RegExp(`base=${item.base}\\nhead=${item.head}`));for(const before of[B2A2_BASELINE,STALE_B2A2_BASELINE])expectRejected(pushRange(item.repo,"ignored-main",before,item.head),/accepted G0 code head to be independently landed/);for(const[before,pattern]of[[forced,/not an ancestor/],["0".repeat(40),/zero PUSH_BEFORE/]])expectRejected(pushRange(item.repo,"ignored-main",before,item.head),pattern);sh(item.repo,["git","branch","accepted-g0-base",item.base]);const pullRequest=run(item.repo,["--print-range","--event","pull_request","--pr-base-ref","accepted-g0-base","--pr-head",item.head]);assert.match(pullRequest.stdout,new RegExp(`base=${item.base}\\nhead=${item.head}`));sh(item.repo,["git","branch","stale-pr-base",STALE_B2A2_BASELINE]);expectRejected(run(item.repo,["--print-range","--event","pull_request","--pr-base-ref","stale-pr-base","--pr-head",item.head]),/accepted G0 code head to be independently landed/);const manual=run(item.repo,["--print-range","--event","workflow_dispatch","--manual-base",item.base,"--manual-head",item.head]);assert.equal(manual.status,0,manual.stderr);assert.match(manual.stdout,new RegExp(`base=${item.base}\\nhead=${item.head}`));expectRejected(run(item.repo,["--print-range","--event","workflow_dispatch","--manual-base",STALE_B2A2_BASELINE,"--manual-head",item.head]),/accepted G0 code head to be independently landed/);const rejectedManual=run(item.repo,["--print-range","--event","workflow_dispatch","--manual-base",forced,"--manual-head",item.head]);expectRejected(rejectedManual,/manual base that is not an ancestor/);expectRejected(gate({...item,base:STALE_B2A2_BASELINE}),/BASE that is not an ancestor|requires exactly one changed ADR|requires a verified RP-02B2a2-G0 ancestor|cannot batch RP-02B2a2-G0-E1 publication evidence/);assert.equal(gate(item).status,0)});it("returns damaged B2a2 histories to gate-prep only for ancestral ranges",()=>{for(const mode of["draft","failed","missing"]){const item=prepare(
"RP-02B2a2");const landed=item.head;const failed=damagePackage(item.repo,"RP-02B2a2",mode);write(item.repo,"apps/api/src/modules/health/ordinary.ts","export {};\n");const head=commit(item.repo,`ordinary after damaged B2a2 ${mode}`);const forced=forceBefore(item.repo,landed,head);const range=pushRange(item.repo,"ignored-main",failed,head);assert.equal(range.status,0,range.stderr);assert.match(range.stdout,new RegExp(`base=${item.base}\\nhead=${head}`),mode);expectRejected(pushRange(item.repo,"ignor\
ed-main",forced,head),/not an ancestor/);expectRejected(pushRange(item.repo,"ignored-main","0".repeat(40),head),/zero PUSH_BEFORE/);assert.notEqual(gate({repo:item.repo,base:item.base,head}).status,0)}});it("uses before/after for ordinary pushes after B2a2 lands",()=>{const item=prepare("RP-02B2a2");const landed=item.head;write(item.repo,"apps/api/src/modules/health/ordinary.ts","export {};\n");const head=commit(item.repo,"ordinary after landed B2a2");const range=pushRange(item.repo,
"ignored-main",landed,head);assert.match(range.stdout,new RegExp(`base=${landed}\\nhead=${head}`));assert.match(run(item.repo,["--github-output","--base",landed,"--head",head]).stdout,/package_id=RP-01C/)});it("keeps A3-A5 on the explicit before/after range",()=>{for(const id of RANGE_PACKAGES){const item=prepare(id);const range=pushRange(item.repo,"ignored-main",item.base,item.head);assert.equal(range.status,0,range.stderr);assert.match(range.stdout,new RegExp(`base=${item.base}\\nhead=${item.head}`),
id);assert.equal(gate(item).status,0,id)}});it("releases landed A1 ordinary pushes while keeping A1 and force-push safety",()=>{const item=prepare(),first=item.head,zero="0".repeat(40);sh(item.repo,["git","branch","landed-a1",first]);write(item.repo,"apps/api/src/modules/health/ordinary.ts","export {};\n");const second=commit(item.repo,"ordinary after A1"),fixed=(before,head2)=>run(item.repo,["--print-range","--event","push","--push-base-ref","landed-a1","--push-before",before,"--push-head",head2]);
for(const before of[first]){const ordinaryRange2=fixed(before,second);assert.match(ordinaryRange2.stdout,new RegExp(`base=${first}\\nhead=${second}`));assert.match(run(item.repo,["--github-output","--base",first,"--head",second]).stdout,/package_id=RP-01C/)}expectRejected(fixed(zero,second),/zero PUSH_BEFORE/);write(item.repo,A1_FILES[0],"second A1 push\n");const third=commit(item.repo,"second A1 push");const thirdRange=fixed(second,third);assert.match(thirdRange.stdout,new RegExp(`base=${BASELINE}\\nhead=${third}`),thirdRange.stderr);
sh(item.repo,["git","checkout","-q","--detach",BASELINE]);write(item.repo,A1_FILES[0],"force push\n");write(item.repo,A1_ADR,"status: ready\n");const forced=commit(item.repo,"force push");write(item.repo,GATE_SCRIPT,readFileSync(resolve(ROOT,GATE_SCRIPT)));sh(item.repo,["git","branch","forced",forced]);for(const ref of sh(item.repo,["git","for-each-ref","--format=%(refname)","refs/remotes"]).trim().split("\n").filter(Boolean))sh(item.repo,["git","update-ref","-d",ref]);const checkout=mkdtempSync(resolve(tmpdir(),"rp02b2a-checkout-"));sh(tmpdir(),["git","clone","-\
q","--depth=2","--single-branch","--no-tags","--branch","forced",`file://${item.repo}`,checkout]);write(checkout,GATE_SCRIPT,readFileSync(resolve(ROOT,GATE_SCRIPT)));sh(checkout,["git","branch","default-base",BASELINE]);assert.notEqual(spawnSync("git",["cat-file","-e",`${second}^{commit}`],{cwd:checkout}).status,0);expectRejected(run(checkout,["--print-range","--event","push","--push-base-ref","default-base","--push-before",second,"--push-head",forced]),/unreachable PUSH_BEFORE/);const ordinaryRepo=repo(
true);sh(ordinaryRepo,["git","branch","default-base",BASELINE]);unlinkSync(resolve(ordinaryRepo,GATE_SCRIPT));write(ordinaryRepo,"ordinary.txt","ordinary\n");const ordinary=commit(ordinaryRepo,"unrelated push");write(ordinaryRepo,GATE_SCRIPT,readFileSync(resolve(ROOT,GATE_SCRIPT)));const ordinaryRange=run(ordinaryRepo,["--print-range","--event","push","--push-base-ref","default-base","--push-before",second,"--push-head",ordinary]);expectRejected(ordinaryRange,/unreachable PUSH_BEFORE/);assert.match(run(ordinaryRepo,["--github-output","--base",BASELINE,"--head",ordinary]).stdout,/package_id=RP-01C/);sh(ordinaryRepo,["git",
"checkout","-q","--detach",BASELINE]);unlinkSync(resolve(ordinaryRepo,GATE_SCRIPT));write(ordinaryRepo,A1_ADR,"status: ready\n");write(ordinaryRepo,"outside/evil.ts","evil\n");const malicious=commit(ordinaryRepo,"malicious push");write(ordinaryRepo,GATE_SCRIPT,readFileSync(resolve(ROOT,GATE_SCRIPT)));const maliciousRange=run(ordinaryRepo,["--print-range","--event","push","--push-base-ref","default-base","--push-before",second,"--push-head",malicious]);expectRejected(maliciousRange,/unreachable PUSH_BEFORE/);expectRejected(gate({repo:ordinaryRepo,base:BASELINE,head:malicious}),/manifest violation/);const head=forced;
for(const[args,pattern,env]of[[["--push-before",head,"--push-head",head],/unsupported event: <missing>/,{GITHUB_EVENT_NAME:"push"}],[["--event","workflow_dispatch","--manual-base","","--manual-head",head],/explicit MANUAL_BASE/],[["--event","push","--push-head",head],/explicit PUSH_BEFORE/],[["--event","push","--push-base-ref","landed-a1","--push-before","HEAD~1","--push-head",head],/unparseable PUSH_BEFORE/]])expectRejected(run(item.repo,["--print-range",...args],env),pattern)});it("fails \
closed for manifest, budget, and missing categories",()=>{const outside=prepare();write(outside.repo,"apps/admin-web/src/outside.ts","x\n");outside.head=commit(outside.repo,"outside");expectRejected(gate(outside),/manifest violation/);const budget=prepare("RP-02B2a1",A1_FILES,{overrides:{actual_net_additions:3e3}});write(budget.repo,A1_FILES[0],"line\n".repeat(3e3));budget.head=commit(budget.repo,"budget");expectRejected(gate(budget),/budget exceeded/);expectRejected(gate(prepare("RP-02B\
2a1",[A1_FILES[1],A1_ADR])),/net additions budget exceeded|missing required production/);expectRejected(gate(prepare("RP-02B2a1",[A1_FILES[0],A1_ADR])),/missing required test/);const a2Production=EXCLUSIVE["RP-02B2a2"],a2Test="apps/api/test/rp02b2a/authority-claim.test.ts",a2Adr=ORACLE["RP-02B2a2"][1];expectRejected(gate(prepare("RP-02B2a2",[a2Test,a2Adr])),/RP-02B2a2 missing required production category/);expectRejected(gate(prepare("RP-02B2a2",[a2Production,a2Adr])),/RP-02B2a2 missing required test category/)});it("rejects gate-only and test-only production diffs",()=>{expectRejected(gate(prepare("RP-02B2a1",["scripts/rp02b2a-package-gate.mjs","scripts/rp02b2a-package-gate.test.mjs",".github/workflows/rp01c-fixtures.yml",A1_ADR])),/missing required production/);expectRejected(gate(prepare("RP-02B2a1",[A1_FILES[1],
A1_ADR])),/missing required production/)});it("does not truncate TAB paths",()=>{const path=repo(true);write(path,"packages/shared/src/api.ts	outside","x\n");write(path,A1_FILES[1],"test\n");write(path,A1_ADR,"status: ready\n");const result=gate({repo:path,base:BASELINE,head:commit(path,"TAB")});expectRejected(result,/manifest violation: packages\/shared\/src\/api\.ts\s+outside/)});it("rejects late NUL, C0/C1 bounds, and invalid UTF-8 in tracked and untracked content",()=>{const lateNul=Buffer.
concat([Buffer.alloc(9001,97),Buffer.from([0]),Buffer.from("tail")]);for(const[bytes,pattern,attributes]of[[lateNul,/control U\+0000/,true],[Buffer.from([31]),/control U\+001f/,false],[Buffer.from([194,128]),/control U\+0080/,false],[Buffer.from([194,159]),/control U\+009f/,false],[Buffer.from([195,40]),/invalid UTF-8/,false]]){const tracked=repo(true);if(attributes)write(tracked,".gitattributes","packages/shared/src/api.ts diff\n");write(tracked,"packages/shared/src/api.ts",bytes);expectRejected(
gate({repo:tracked,base:BASELINE,head:commit(tracked,"invalid tracked text")}),pattern);const untracked=repo(true);write(untracked,A1_FILES[0],bytes);expectRejected(run(untracked,["--base",BASELINE,"--head",BASELINE,"--worktree"]),pattern)}});it("rejects symlink manifest paths in worktree and commit modes",()=>{const path=repo(true),file="packages/shared/src/api.ts";unlinkSync(resolve(path,file));symlinkSync("novels.ts",resolve(path,file));expectRejected(run(path,["--base",BASELINE,"--\
head",BASELINE,"--worktree"]),/non-regular worktree path/);expectRejected(gate({repo:path,base:BASELINE,head:commit(path,"symlink manifest path")}),/non-regular commit path/)});it("includes both rename/copy paths and fails across manifest boundaries",()=>{const inside=repo(true);sh(inside,["git","mv","packages/shared/src/api.ts",A1_FILES[0]]);write(inside,A1_FILES[1],"test\n");write(inside,A1_ADR,adr({status:"ready",package_id:"RP-02B2a1",manifest_id:"RP-02B2a1-v1",baseline_sha:BASELINE,
hard_max_files:18,hard_max_net_additions:1900,actual_files:5,actual_net_additions:0}));const net=stats(inside,BASELINE).net;write(inside,A1_ADR,readFileSync(resolve(inside,A1_ADR),"utf8").replace("actual_net_additions: 0",`actual_net_additions: ${net}`));const insideResult=gate({repo:inside,base:BASELINE,head:commit(inside,"inside rename")});assert.equal(insideResult.status,0,insideResult.stderr);for(const[source,target,pattern]of[["README.md",A1_FILES[0],/README\.md/],["packages/shared/src/api.\
ts","outside/renamed.ts",/outside\/renamed\.ts/]]){const path=repo(true);mkdirSync(dirname(resolve(path,target)),{recursive:true});sh(path,["git","mv",source,target]);write(path,A1_FILES[1],"test\n");write(path,A1_ADR,"status: ready\n");expectRejected(gate({repo:path,base:BASELINE,head:commit(path,"cross rename")}),pattern)}const copy=repo(true);write(copy,A1_FILES[0],readFileSync(resolve(copy,"README.md")));write(copy,A1_FILES[1],"test\n");write(copy,A1_ADR,"status: ready\n");expectRejected(
		gate({repo:copy,base:BASELINE,head:commit(copy,"cross copy")}),/README\.md/)});it("uses whole-package max(0,total added-total deleted)",()=>{const path=repo(true),base=BASELINE;write(path,"packages/shared/src/novels.ts","new\n");write(path,A1_FILES[1],"test\n");write(path,A1_ADR,adr({status:"ready",package_id:"\
		RP-02B2a1",manifest_id:"RP-02B2a1-v1",baseline_sha:base,hard_max_files:18,hard_max_net_additions:1900,actual_files:4,actual_net_additions:0}));const result=gate({repo:path,base,head:commit(path,"aggregate")});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/netAdditions=0/)});it("keeps worktree and commit numstat counts identical",()=>{const path=repo(true),render=net=>adr({status:"ready",package_id:"RP-02B2a1",manifest_id:"RP-02B2a1-v1",baseline_sha:BASELINE,hard_max_files:18,
hard_max_net_additions:1900,actual_files:4,actual_net_additions:net});write(path,A1_FILES[0],"alpha	beta\r\ngamma\n");write(path,A1_FILES[1],"test\n");write(path,A1_ADR,render(-1));const probe=run(path,["--base",BASELINE,"--head",BASELINE,"--worktree"]),match=/actual_net_additions mismatch: -1 != (\d+)/.exec(probe.stderr);assert.ok(match,probe.stderr);write(path,A1_ADR,render(match[1]));const worktree=run(path,["--base",BASELINE,"--head",BASELINE,"--worktree"]);assert.equal(worktree.status,0,worktree.
stderr);expectRejected(run(path,["--base",BASELINE,"--head",BASELINE,"--worktree","--github-output"]),/rejects --worktree with --github-output/);const committed=gate({repo:path,base:BASELINE,head:commit(path,"same numstat")});assert.equal(committed.status,0,committed.stderr);assert.match(worktree.stdout,new RegExp(`netAdditions=${match[1]}`));assert.match(committed.stdout,new RegExp(`netAdditions=${match[1]}`))});it("binds all package commands and ADR contracts",async()=>{const commandCases=Object.entries(COMMANDS).map(([id,command])=>({id,command,item:prepare(id)}));await mapWithConcurrency(commandCases,6,async({id,command,item})=>{const[passed,output]=await Promise.all([gateAsync(item),githubOutputAsync(item)]);
assert.equal(passed.status,0,`${id}: ${passed.stderr}`);assert.match(output.stdout,new RegExp(`package_id=${id}.*test_command=${command}`,"s"))});for(const[field,value,pattern]of[["package_id","wrong",/package_id mismatch/],["manifest_id","wrong",/manifest_id mismatch/],["hard_max_files",999,/hard_max_files mismatch/],["hard_max_net_additions",999,/hard_max_net_additions mismatch/]])expectRejected(gate(prepare("RP-02B2a2",void 0,{overrides:{[field]:value}})),pattern);const duplicate=prepare("RP-02B2a2"),duplicateAdr=ORACLE["RP-02B2a2"][1];write(duplicate.repo,duplicateAdr,`${readFileSync(resolve(duplicate.repo,duplicateAdr),"utf8")}status: ready\n`);duplicate.head=commit(duplicate.repo,"duplicate ADR status");expectRejected(gate(duplicate),/ADR duplicate field: status/);const unknown=prepare("RP-02B2a2"),unknownAdr=ORACLE["RP-02B2a2"][1];write(unknown.repo,unknownAdr,`${readFileSync(resolve(unknown.repo,unknownAdr),"utf8")}authorization: approved\n`);unknown.head=commit(unknown.repo,"unknown ADR authorization");expectRejected(gate(unknown),/ADR unsupported field: authorization/);const unauthorized=prepare("RP-02B2a2");unauthorized.authorizedPackageId="";expectRejected(gate(unauthorized),/trusted admission package mismatch/)});it("expands YAML aliase\
s and rejects unknown or cyclic aliases",()=>{const positive=mutate(text=>aliasPermissions(text));assert.equal(positive.status,0,positive.stderr);for(const[change,pattern]of[[text=>aliasPermissions(text,"missing"),/unknown YAML alias/],[text=>text.replace("permissions:\n  actions: read\n  contents: read","permissions: &workflow_permissions\n  actions: read\n  contents: read\n  cycle: *workflow_permissions"),/cyclic YAML alias/]]){const result=mutate(change);assert.notEqual(result.status,0);expectRejected(result,pattern)}});it("parses and enforces the structured workflow c\
	ontract",()=>{const trusted=trustedWorkflow();assert.equal(trusted.status,0,trusted.stderr);assert.match(trusted.stdout,new RegExp(`canonical_sha256=${TRUSTED_WORKFLOW_ORACLE_SHA256}`));for(const change of[text=>text.replace("    if: needs.admission.outputs.admission_kind == 'business'\n",""),text=>text.replace("needs.admission.outputs.admission_kind == 'business'","always()"),text=>text.replace("needs.admission.outputs.admission_kind == 'business'","needs.admission.outputs.admission_kind == 'closeout'")])expectRejected(mutateTrustedWorkflow(change),/candidate job must run only for business admission/);for(const change of[text=>text.replace("pull_request_target:","pull_request:"),text=>text.replace("  actions: read\n",""),text=>text.replace("      - synchronize\n","      - synchronize\n      - closed\n"),text=>text.replace("actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5","actions/checkout@v4"),text=>text.replace("actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020","actions/setup-node@v4"),text=>text.replace("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02","actions/upload-artifact@v4"),text=>text.replace("          fetch-depth: 0","          fetch-depth: 1")]){const result=mutateTrustedWorkflow(change);assert.notEqual(result.status,0);expectRejected(result,/trusted (?:admission|workflow)/)}assert.equal(workflow().status,0);assert.equal(workflow(WORKFLOW,["--package-id","RP-01C","--test-command","test:rp02b1"]).status,0);for(const file of[A1_ADR,A2_SCOPE_ADR,"scripts/rp02b2a-package-gate.mjs",A1_FILES[1],".github/workflows/rp01a-e2e.yml",".github/workflows/rp01b-dom.yml",".github/workflows/remediation-governance.yml"])assert.equal(workflow(WORKFLOW,["--trigger-file",file]).status,0,file);for(const args of[["--package-id","RP-02B2a1","--test-command","wrong"],["--package-id","wrong","--test-command","test:rp02b2a1"]])assert.notEqual(workflow(WORKFLOW,args).status,0);const clean=CLEAN_ENV;const resolver=`${clean}\
 node scripts/rp02b2a-package-gate.mjs --github-output --base "$B2A_BASE_SHA" --head "$B2A_HEAD_SHA" --policy-source "$B2A_POLICY_SOURCE_SHA" --gate-source "$B2A_GATE_SOURCE_SHA" --g0-evidence-sha "$B2A_G0_EVIDENCE_SHA" --authorized-package-id "$B2A_AUTHORIZED_PACKAGE_ID" --authorized-predecessor-sha "$B2A_AUTHORIZED_PREDECESSOR_SHA" >> "$GITHUB_OUTPUT"`,selected=`${clean} npm run "$B2A_TEST_COMMAND"`,selfCheck=`${clean} node scripts/rp02b2a-package-gate.mjs --verify-workflow .github/workflows/rp01c-fixtures.yml --package-id "$B2A_PACKAGE_ID" --test-command "$B2A_TEST_COMMAND"`;const changes=[[text=>text.replace("      - rp02b2a_replay","      - untrusted_replay"),/repository_dispatch type/],[text=>text.replace("      - main\n    paths: &rp02b2a_paths","      - feature\n    paths: &rp02b2a_paths"),/push branches must be exactly main/],[text=>text.replace("  pull_request:\n    paths: *rp02b2a_paths\n",""),/workflow triggers keys mismatch/],[text=>text.replace("    paths: *rp02b2a_paths","    paths:\n      - 'package.json'"),/pull request paths must match main push paths|workflow pull_request missing required path/],[text=>text.replace("      - 'docs/adr/rp-02b2a2-g0-a2-scope-correction-budget.md'\n",""),/workflow push missing required path/],[text=>text.replace("      - 'scripts/rp02b2a-package-gate.*'\n",""),/missing required path/],[text=>text.replace("WORKFLOW_SHA: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}","WORKFLOW_SHA: ${{ github.sha }}"),/range resolver env binding mismatch/],[text=>text.replace("PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}","PR_BASE_SHA: ${{ github.event.pull_request.head.sha }}"),/range resolver env binding mismatch/],[text=>text.replace('PR_MERGE_BASE="$(git merge-base "$PR_BASE_SHA" "$PR_HEAD_SHA")"','PR_MERGE_BASE="$PR_BASE_SHA"'),/range resolver shell semantics mismatch/],[text=>text.replace(`          ${selected}`,"          echo selected-package-command-disabled"),/selected package command/],[text=>text.replace(
"      - name: Resolve B2a package command","      - name: Resolve B2a package command\n        continue-on-error: true"),/step 4 keys mismatch|required step is disabled/],[text=>text.replace("        id: b2a-package\n","        id: b2a-package\n        shell: bash\n"),/step 4 keys mismatch|custom shell/],[text=>text.replace("      - env:\n          B2A_TEST_COMMAND: ${{ steps.b2a-package.outputs.test_command }}","      - shell: bash\n        env:\n          B2A_TEST_COMMAND: ${{ steps.b2a-package.outputs.test_command }}"),/step [0-9]+ keys mismatch|custom shell/],
[text=>text.replace("\njobs:\n","\ndefaults:\n  run:\n    shell: bash\n\njobs:\n"),/workflow defaults\.run\.shell/],[text=>text.replace("  rp01c-fixtures:\n","  rp01c-fixtures:\n    defaults:\n      run:\n        shell: bash\n"),/job defaults\.run\.shell/],[text=>text.replace("--push-before","--before-missing"),/shell semantics mismatch/],[text=>text.replace("--push-head","--head-missing"),/shell semantics mismatch/],[text=>text.replace("--manual-base","--manual-base-missing"),/shell semantics mismatch/],
[text=>text.replace("--manual-head","--manual-head-missing"),/shell semantics mismatch/],[text=>text.replace(" || github.event.after }}"," || github.sha }}"),/checkout ref/],[text=>text.replace("Resolve B2a package gate range","Resolve B2a1 package gate range"),/step named Resolve B2a package gate range/],[text=>text.replace("id: b2a-range","id: b2a1-range"),/dynamic package step ids mismatch/],[text=>text.replace("id: b2a-package","id: static-package"),/dynamic package step ids mismatch/],[text=>text.
replace(`${clean} node scripts/rp02b2a-package-gate.mjs --print-range`,"node scripts/rp02b2a-package-gate.mjs --print-range"),/shell semantics mismatch/],[text=>text.replace(`          ${resolver}`,`          # ${resolver}`),/shell semantics mismatch/],[text=>text.replace(`          ${selfCheck}`,`          echo '${selfCheck}'`),/shell semantics mismatch/],[text=>text.replace(`          ${selected}`,`          printf '%s\\n' '${selected}'`),/shell semantics mismatch/],[text=>text.
replace(`          ${resolver}`,`          cat <<'EOF'
          ${resolver}
          EOF`),/shell semantics mismatch/],[text=>text.replace(selected,`${selected} || true`),/shell semantics mismatch/],[text=>text.replace(`          ${resolver}`,`          if false; then
          ${resolver}
          fi`),/shell semantics mismatch/],[text=>text.replace(`          ${resolver}`,'          echo "package_id=RP-02B2a1" >> "$GITHUB_OUTPUT"\n          echo "test_command=test:rp02b2a1" >> "$GITHUB_OUTPUT"'),/shell semantics mismatch/]];for(const[index,[change,pattern]]of changes.entries()){const result=mutate(change,`workflow mutation ${index} did not change fixture`);assert.notEqual(result.status,0,`workflow mutation ${index} passed`);expectRejected(result,pattern,`workflow mutation ${index}`)}})});
describe("RP-02B2a2 PM-C2 and E3 closeout policy", () => {
  it("admits PM-C2 only as the fixed-baseline exact five-file direct child", () => {
    const candidate = prepare(CLOSEOUT_POLICY_CORRECTION_ID), passed = gate(candidate);
    assert.equal(passed.status, 0, passed.stderr);
    assert.equal(sh(candidate.repo, ["git", "rev-parse", `${candidate.head}^`]).trim(), CLOSEOUT_POLICY_CORRECTION_BASELINE);
    for (const missing of MANIFESTS[CLOSEOUT_POLICY_CORRECTION_ID]) {
      const incomplete = prepare(CLOSEOUT_POLICY_CORRECTION_ID);
      const existsAtBase = spawnSync("git", ["cat-file", "-e", `${incomplete.base}:${missing}`], { cwd: incomplete.repo }).status === 0;
      if (existsAtBase) sh(incomplete.repo, ["git", "checkout", incomplete.base, "--", missing]);
      else unlinkSync(resolve(incomplete.repo, missing));
      sh(incomplete.repo, ["git", "add", "-A"]);
      sh(incomplete.repo, ["git", "commit", "-q", "--amend", "--no-edit"]);
      incomplete.head = sh(incomplete.repo, ["git", "rev-parse", "HEAD"]).trim();
      expectRejected(gate(incomplete), /manifest violation|requires exactly (?:one changed ADR|the 5 frozen manifest files)|found unsupported ADR/);
    }
    const extra = prepare(CLOSEOUT_POLICY_CORRECTION_ID);
    write(extra.repo, "docs/adr/unapproved-pm-c2.md", "status: unapproved\n");
    sh(extra.repo, ["git", "add", "-A"]);
    sh(extra.repo, ["git", "commit", "-q", "--amend", "--no-edit"]);
    extra.head = sh(extra.repo, ["git", "rev-parse", "HEAD"]).trim();
    expectRejected(gate(extra), /manifest violation|requires exactly one changed ADR/);
  });
  it("freezes the E3 exact manifest and line budgets", () => {
    const input = { files: [...A2_CLOSEOUT_EVIDENCE_FILES], addedLines: 80, deletedLines: 20, netAdditions: 60, adrTextByPath: {}, base: "a".repeat(40), head: "b".repeat(40) };
    assert.equal(analyzePackageGate(input).packageId, A2_CLOSEOUT_EVIDENCE_ID);
    assert.throws(() => analyzePackageGate({ ...input, files: input.files.slice(1) }), /exactly the five frozen/);
    assert.throws(() => analyzePackageGate({ ...input, files: [...input.files, "docs/reviews/extra.md"] }), /exactly the five frozen/);
    assert.throws(() => analyzePackageGate({ ...input, addedLines: 181, netAdditions: 161 }), /additions budget exceeded/);
    assert.throws(() => analyzePackageGate({ ...input, deletedLines: 81 }), /deletions budget exceeded/);
    assert.throws(() => analyzePackageGate({ ...input, addedLines: 180, deletedLines: 0, netAdditions: 181 }), /net additions budget exceeded/);
  });
  it("admits a valid E3 direct child as closeout without business authorization", () => {
    const item = prepareCloseoutEvidence(), admitted = closeoutAdmission(item);
    assert.equal(admitted.status, 0, admitted.stderr);
    assert.match(admitted.stdout, new RegExp(`package_id=${A2_CLOSEOUT_EVIDENCE_ID}.*test_command=${A2_CLOSEOUT_EVIDENCE_COMMAND}.*admission_kind=closeout.*event_base_sha=${item.base}.*candidate_sha=${item.head}.*manifest_digest=[a-f0-9]{64}`, "s"));
    assert.doesNotMatch(admitted.stdout, /gate_source_sha=|g0_evidence_sha=|authorized_predecessor_sha=/);
    const explicit = run(item.repo, ["--github-output", "--base", item.base, "--head", item.head, "--policy-source", item.policySource]);
    assert.equal(explicit.status, 0, explicit.stderr);
    assert.match(explicit.stdout, /admission_kind=closeout/);
    expectRejected(run(item.repo, ["--github-output", "--base", item.base, "--head", item.head]), /requires an explicit repository-controlled policy source/);
  });
  it("fails closed on missing, unreachable, mismatched, or non-direct policy authority", () => {
    const item = prepareCloseoutEvidence();
    expectRejected(closeoutAdmission(item, { policySource: null }), /repository-controlled package\/predecessor tuple/);
    expectRejected(closeoutAdmission(item, { policySource: "f".repeat(40) }), /unreachable POLICY_SOURCE/);
    expectRejected(closeoutAdmission(item, { eventBase: CLOSEOUT_POLICY_CORRECTION_BASELINE }), /pull request base and merge-base/);
    const multi = prepareCloseoutEvidence({ secondCommit: true });
    expectRejected(closeoutAdmission(multi), /must be one direct child commit/);
  });
  it("rejects a forged receipt in each E3 evidence document", () => {
    const mutations = new Map([
      [A2_CLOSEOUT_EVIDENCE_VERIFICATION, text => text.replace("issue_closed_count: 9/42 unchanged", "issue_closed_count: 42/42 unchanged")],
      ["docs/reviews/main-control-event-ledger.md", text => text.replace("accepted_candidate: e8e37cd892570e3abee961374ec3512a373f6400", "accepted_candidate: forged")],
      ["docs/reviews/main-control-status.md", text => text.replaceAll("总账 9/42、RMD-TASK-002=partial、RMD-TASK-003=open", "总账 42/42、RMD-TASK-002=closed、RMD-TASK-003=closed")],
      ["docs/remediation/issue-ledger.md", text => text.replace(/^\| RMD-TASK-002 \|[^\n]*\| partial \|.*$/gm, "| RMD-TASK-002 | fixture | closed |")],
      ["docs/remediation/acceptance-matrix.md", text => text.replaceAll("`RMD-TASK-003=open`", "`RMD-TASK-003=closed`")],
    ]);
    for (const [path, change] of mutations) {
      const item = prepareCloseoutEvidence({ mutate: (candidatePath, text) => candidatePath === path ? change(text) : text });
      expectRejected(closeoutAdmission(item), new RegExp(`${A2_CLOSEOUT_EVIDENCE_ID} .*missing or conflicts|cannot close|contradict the frozen`), path);
    }
  });
  it("rejects additive authorization and contradictory closeout claims", () => {
    const additions = [
      "g0_evidence_a2_authorization: authorized",
      "RP-02B2a3 已授权开始研发",
      "总账已关闭 42/42",
      "RMD-TASK-002: closed\nRMD-TASK-003: completed",
    ];
    for (const addition of additions) {
      const item = prepareCloseoutEvidence({ mutate: (path, text) => path === A2_CLOSEOUT_EVIDENCE_VERIFICATION ? `${text}\n${addition}\n` : text });
      expectRejected(closeoutAdmission(item), /cannot mint or rewrite G0 evidence|cannot authorize A2-A5|contradict the frozen 9\/42 total|cannot close RMD-TASK-002 or RMD-TASK-003/, addition);
    }
  });
  it("allows E3 push delivery only as the policy-source to main transition", () => {
    const item = prepareCloseoutEvidence(), args = ["--print-range", "--event", "push", "--push-before", item.base, "--push-head", item.head, "--policy-source", item.policySource];
    const main = run(item.repo, [...args, "--push-ref", "refs/heads/main"]);
    assert.equal(main.status, 0, main.stderr);
    assert.match(main.stdout, /admission_kind=closeout/);
    expectRejected(run(item.repo, [...args, "--push-ref", "refs/heads/feature"]), /push delivery requires refs\/heads\/main/);
    expectRejected(run(item.repo, ["--print-range", "--event", "push", "--push-before", "0".repeat(40), "--push-head", item.head, "--push-created", "true", "--push-ref", "refs/heads/main", "--policy-source", item.policySource]), /cannot be admitted from a newly created ref/);
  });
  it("limits the legacy trusted-workflow digest to frozen historical heads", () => {
    const historical = run(ROOT, ["--verify-admission-workflow", ".github/workflows/rp02b2a-admission.yml", "--head", CLOSEOUT_POLICY_CORRECTION_BASELINE]);
    assert.equal(historical.status, 0, historical.stderr);
    const arbitrary = resolve(mkdtempSync(resolve(tmpdir(), "rp02b2a-legacy-successor-")), "repo");
    sh(tmpdir(), ["git", "clone", "-q", "--shared", "--no-checkout", ROOT, arbitrary]);
    sh(arbitrary, ["git", "config", "user.email", "rp02b2a@example.test"]);
    sh(arbitrary, ["git", "config", "user.name", "RP02B2a Gate"]);
    sh(arbitrary, ["git", "checkout", "-q", "--detach", CLOSEOUT_POLICY_CORRECTION_BASELINE]);
    write(arbitrary, "unrelated.txt", "arbitrary successor\n");
    const successor = commit(arbitrary, "arbitrary legacy successor");
    write(arbitrary, GATE_SCRIPT, readFileSync(resolve(ROOT, GATE_SCRIPT)));
    expectRejected(run(arbitrary, ["--verify-admission-workflow", ".github/workflows/rp02b2a-admission.yml", "--head", successor]), /candidate job must run only for business admission|canonical contract mismatch/);
    const policy = prepare(CLOSEOUT_POLICY_CORRECTION_ID);
    const current = run(policy.repo, ["--verify-admission-workflow", ".github/workflows/rp02b2a-admission.yml", "--head", policy.head]);
    assert.equal(current.status, 0, current.stderr);
    assert.match(current.stdout, new RegExp(`canonical_sha256=${TRUSTED_WORKFLOW_ORACLE_SHA256}`));
  });
  it("requires every E3 evidence path in RP-01C triggers", () => {
    for (const path of A2_CLOSEOUT_EVIDENCE_FILES) {
      const result = mutate((text) => text.replace(`      - '${path}'\n`, ""), `RP-01C trigger fixture missing ${path}`);
      expectRejected(result, /workflow push missing required path/, path);
    }
  });
});
it("binds repository replay to a durable authorized candidate tag", () => {
  assert.equal(workflow().status, 0);
  const mutations = [
    [text => text.replace("          B2A_AUTHORIZED_CANDIDATE_REF: ${{ vars.RP02B2A_AUTHORIZED_CANDIDATE_REF }}\n", ""), /range resolver env binding mismatch/],
    [text => text.replace("refs\/tags\/rp02b2a-admitted-", "refs\/heads\/rp02b2a-admitted-"), /range resolver shell semantics mismatch/],
    [text => text.replace("git fetch --no-tags --force origin", "git fetch --tags origin"), /range resolver shell semantics mismatch/],
    [text => text.replace('= "$B2A_AUTHORIZED_CANDIDATE_SHA"', '= "$B2A_AUTHORIZED_CANDIDATE_TREE"'), /range resolver shell semantics mismatch/],
  ];
  for (const [change, pattern] of mutations) expectRejected(mutate(change), pattern);
});
it("keeps candidate-owned gate, test, and oracle out of the trusted G0 checkout", () => {
  const candidate = prepare("RP-02B2a2"), gateMarker = "CANDIDATE_GATE_REPLACED_TRUSTED_G0", oracleMarker = "CANDIDATE_TEST_ORACLE_EXECUTED";
  write(candidate.repo, GATE_SCRIPT, `console.error(${JSON.stringify(gateMarker)}); process.exit(0);\n`);
  write(candidate.repo, "scripts/rp02b2a-package-gate.test.mjs", `console.error(${JSON.stringify(oracleMarker)}); process.exit(0);\n`);
  candidate.head = commit(candidate.repo, "candidate-owned gate test oracle");
  const candidateOwned = gate(candidate);
  assert.equal(candidateOwned.status, 0, candidateOwned.stderr);
  assert.match(candidateOwned.stderr, new RegExp(gateMarker));
  const trusted = trustedCheckoutGate(candidate);
  expectRejected(trusted, /manifest violation:.*scripts\/rp02b2a-package-gate\.mjs.*scripts\/rp02b2a-package-gate\.test\.mjs/s);
  assert.doesNotMatch(`${trusted.stdout}\n${trusted.stderr}`, new RegExp(`${gateMarker}|${oracleMarker}`));
  const trustedContext = runTrustedContextWorkflowShell();
  assert.equal(trustedContext.status, 0, `${trustedContext.stdout}\n${trustedContext.stderr}`);
  assert.match(trustedContext.githubOutput, /run_id=50000001.*workflow_id=40000001.*candidate_sha=b{40}/s);
  for (const [options, pattern] of [
    [{ apiRunId: "50000002" }, /current run API identity/],
    [{ apiRunAttempt: "3" }, /current run API identity/],
    [{ path: ".github/workflows/wrong.yml@refs/heads/main" }, /workflow path/],
    [{ event: "push" }, /event or candidate revision/],
    [{ head: "9".repeat(40) }, /event or candidate revision/],
    [{ workflowRef: "example/repo/.github/workflows/rp02b2a-admission.yml@refs/heads/other" }, /workflow_ref/],
    [{ defaultBranch: "develop" }, /repository default branch/],
    [{ prBaseRef: "release" }, /repository default branch/],
    [{ eventRef: "refs/heads/release", workflowRef: "example/repo/.github/workflows/rp02b2a-admission.yml@refs/heads/release" }, /repository default branch/], [{ gateSourceSha: "0cfcbd19bb998bd84faa72cf4549eca17e5ab190" }, /revoked G0 lineage/], [{ g0EvidenceSha: "3ad4c16be3053aeacc84144cbfe954da328b453a" }, /revoked G0 lineage/],
  ]) expectRejected(runTrustedContextWorkflowShell(options), pattern);
  const liveAdmission = runAdmissionEvidenceWorkflowShell();
  assert.equal(liveAdmission.status, 0, `${liveAdmission.stdout}\n${liveAdmission.stderr}`);
  assert.match(liveAdmission.githubOutput, /candidate_sha=b{40}.*manifest_digest=2{64}/s);
  assert.equal(JSON.parse(readFileSync(liveAdmission.artifactPath, "utf8")).manifest_digest, "2".repeat(64));
  const closeoutAdmission = runAdmissionEvidenceWorkflowShell({
    admissionKind: "closeout",
    packageId: A2_CLOSEOUT_EVIDENCE_ID,
    testCommand: A2_CLOSEOUT_EVIDENCE_COMMAND,
    gateG0EvidenceSha: "",
    g0EvidenceDigest: "",
  });
  assert.equal(closeoutAdmission.status, 0, `${closeoutAdmission.stdout}\n${closeoutAdmission.stderr}`);
  assert.match(closeoutAdmission.githubOutput, new RegExp(`package_id=${A2_CLOSEOUT_EVIDENCE_ID}.*test_command=${A2_CLOSEOUT_EVIDENCE_COMMAND}.*admission_kind=closeout`, "s"));
  const closeoutArtifact = JSON.parse(readFileSync(closeoutAdmission.artifactPath, "utf8"));
  assert.equal(closeoutArtifact.schema, "rp02b2a-admission/v2");
  for (const field of ["gate_source_sha", "g0_evidence_sha", "g0_evidence_digest", "authorized_package_id", "authorized_predecessor_sha"]) assert.equal(closeoutArtifact[field], null, field);
  assert.deepEqual(closeoutArtifact.repository_context, {
    gate_source_sha: "f".repeat(40),
    g0_evidence_sha: "c".repeat(40),
    authorized_package_id: "RP-02B2a2",
    authorized_predecessor_sha: "d".repeat(40),
  });
  for (const field of ["gate_source_sha", "g0_evidence_sha", "authorized_package_id", "authorized_predecessor_sha"]) assert.match(closeoutAdmission.githubOutput, new RegExp(`^${field}=$`, "m"), field);
  for (const [options, pattern] of [
    [{ liveNumber: "43" }, /no longer the open admission target/],
    [{ liveState: "closed" }, /no longer the open admission target/],
    [{ liveBaseRef: "release" }, /stale pull_request_target snapshot/],
    [{ liveBase: "8".repeat(40) }, /stale pull_request_target snapshot/],
    [{ liveHead: "9".repeat(40) }, /stale pull_request_target snapshot/],
  ]) expectRejected(runAdmissionEvidenceWorkflowShell(options), pattern);
  const digestCandidate = prepare("RP-02B2a2"), originalHead = digestCandidate.head;
  const originalAdmission = authoritativeGate(digestCandidate);
  assert.equal(originalAdmission.status, 0, originalAdmission.stderr);
  const originalDigest = /^manifest_digest=([a-f0-9]{64})$/m.exec(originalAdmission.stdout)?.[1];
  assert.ok(originalDigest, originalAdmission.stdout);
  mutateCandidateBlob(digestCandidate);
  const changedAdmission = authoritativeGate(digestCandidate);
  assert.equal(changedAdmission.status, 0, changedAdmission.stderr);
  const changedDigest = /^manifest_digest=([a-f0-9]{64})$/m.exec(changedAdmission.stdout)?.[1];
  assert.ok(changedDigest, changedAdmission.stdout);
  assert.notEqual(changedDigest, originalDigest, "candidate manifest blob mutation must change manifest_digest");
  const staleDigestAdmission = runAdmissionEvidenceWorkflowShell({ prHead: originalHead, liveHead: digestCandidate.head, manifestDigest: originalDigest });
  expectRejected(staleDigestAdmission, /stale pull_request_target snapshot/);
  assert.doesNotMatch(staleDigestAdmission.githubOutput, /manifest_digest=/, "stale candidate digest must not be published");
});

it("fail-closes authoritative pull_request_target admission before candidate execution",()=>{const admitted=prepare("RP-02B2a2"),authoritative=authoritativeGate(admitted);assert.equal(authoritative.status,0,authoritative.stderr);assert.match(authoritative.stdout,new RegExp(`event_base_sha=${admitted.base}.*gate_source_sha=${admitted.gateSource}.*g0_evidence_sha=${admitted.g0EvidenceSha}.*g0_evidence_digest=[a-f0-9]{64}.*manifest_digest=[a-f0-9]{64}`,"s"));assert.equal(/^manifest_digest=([a-f0-9]{64})$/m.exec(authoritative.stdout)?.[1],expectedManifestDigest(admitted));const missing=run(admitted.repo,["--github-output","--event","pull_request_target","--event-base",admitted.base,"--event-head",admitted.head]);expectRejected(missing,/requires the repository-controlled package\/predecessor tuple/);expectRejected(authoritativeGate(admitted,{g0EvidenceSha:""}),/requires explicit G0_EVIDENCE/);expectRejected(authoritativeGate(admitted,{g0EvidenceSha:"f".repeat(40)}),/rejects unreachable G0_EVIDENCE/);const wrongParent=sh(admitted.repo,["git","commit-tree",`${admitted.gateSource}^{tree}`,"-p",admitted.gateSource,"-m","wrong evidence parent"]).trim(),wrongEvidence=sh(admitted.repo,["git","commit-tree",`${admitted.g0EvidenceSha}^{tree}`,"-p",wrongParent,"-m","wrong-parent E1"]).trim();expectRejected(authoritativeGate(admitted,{g0EvidenceSha:wrongEvidence}),/must be one direct child commit/);expectRejected(authoritativeGate(admitted,{authorizedPackageId:"RP-02B2a3"}),/trusted admission package mismatch/);expectRejected(authoritativeGate(admitted,{authorizedPredecessorSha:"0".repeat(40)}),/zero AUTHORIZED_PREDECESSOR/);expectRejected(authoritativeGate(admitted,{extra:["--base",admitted.base]}),/rejects caller-selected base\/head/);

const advanced=prepare("RP-02B2a2"),advancedBase=forceBefore(advanced.repo,advanced.base,advanced.head),advancedAdmission=authoritativeGate(advanced,{eventBase:advancedBase});assert.equal(advancedAdmission.status,0,advancedAdmission.stderr);assert.match(advancedAdmission.stdout,new RegExp(`event_base_sha=${advancedBase}`));const skipped=prepare("RP-02B2a3");expectRejected(authoritativeGate(skipped,{authorizedPackageId:"RP-02B2a2"}),/trusted admission package mismatch/);expectRejected(authoritativeGate(skipped,{authorizedPredecessorSha:skipped.gateSource}),/merge-base must equal the authorized predecessor/);const unrelatedBase=sh(admitted.repo,["git","commit-tree",`${admitted.head}^{tree}`,"-m","unrelated event base"]).trim();expectRejected(authoritativeGate(admitted,{eventBase:unrelatedBase}),/workflow base must descend from the accepted G0/);expectRejected(run(admitted.repo,["--base",admitted.base,"--head",admitted.head,"--authorized-g0",admitted.gateSource]),/retired --authorized-g0/)});

const GATE_PREP_EVIDENCE_ID = "RP-02B2a2-G0-E1";
const GATE_PREP_EVIDENCE_COMMAND = "test:governance";
const GATE_TEST_COUNT = readFileSync(resolve(ROOT, "scripts/rp02b2a-package-gate.test.mjs"), "utf8").match(/\bit\s*\(/g)?.length ?? 0;
const GATE_PREP_EVIDENCE_FILES = EVIDENCE_RECEIPT_PATHS;
const GATE_PREP_EVIDENCE_RUNS = Object.freeze({
  g0_evidence_rp01a_run: "30000001",
  g0_evidence_rp01b_run: "30000002",
  g0_evidence_rp01c_run: "30000003",
  g0_evidence_governance_run: "30000004",
});
function evidenceText(parent, overrides = {}) {
  return Object.entries({
    g0_evidence_parent_sha: parent,
    ...GATE_PREP_EVIDENCE_RUNS,
    g0_evidence_a2_authorization: "not_authorized",
    g0_evidence_issue_closed_count: "9/42",
    g0_evidence_rmd_task_002: "partial",
    g0_evidence_rmd_task_003: "open",
    ...overrides,
  }).map(([field, value]) => `${field}: ${value}`).join("\n") + "\n";
}
function finalEvidenceText(file, existing, parent, packageFiles, net, fields, gateCount = `${GATE_TEST_COUNT}/${GATE_TEST_COUNT}`) {
  const short = parent.slice(0, 7), runs = GATE_PREP_EVIDENCE_RUNS;
  existing = existing.replace(/^g0_evidence_[a-z0-9_]+:[^\n]*(?:\n|$)/gm, '').trimEnd();
  if (file === GATE_PREP_EVIDENCE_FILES[1]) return existing
    .replace(/^当前整改包\s+.*$/m, `当前整改包    RP-02B2a2-G0 accepted code head ${short}，四路远程 CI 已通过；E1 发布关闭证据，B2a2 业务实现仍未授权`)
    .replace(/^当前状态\s+.*$/m, `当前状态      G0 accepted code head ${short}，远程 runs ${Object.values(runs).join("/")} 均 success；B2a2 仍 not_authorized`)
    .replace(/^\| RP-02B2a2-G0 整改后最终复核 \|.*$/m, `| RP-02B2a2-G0 整改后最终复核 | 已完成 | accepted code head \`${short}\`；${packageFiles} files / ${net} net additions；package gate ${gateCount}；四路远程 CI completed/success；B2a2 保持 not_authorized |`)
    .replace(/^1\. .*RP-02B2a2-G0.*$/m, `1. RP-02B2a2-G0 accepted code head \`${short}\` 与四路远程 CI 已完成；E1 只发布关闭证据。B2a2 继续 \`not_authorized\`。`) + `\n\n${fields}`;
  if (file === GATE_PREP_EVIDENCE_FILES[0]) return `${existing.replace(/\n### MCE-RP02B2A2-G0-E1-REMOTE-ACCEPTED[\s\S]*$/, '')}\n\n### MCE-RP02B2A2-G0-E1-REMOTE-ACCEPTED\n\n\`\`\`text\nevent_type: governance_bootstrap_remote_accepted\npackage_id: ${GATE_PREP_EVIDENCE_ID}\naccepted_code_head: ${parent}\n${fields.trimEnd()}\nmc_decision: RP-02B2a2-G0 关闭；B2a2 继续 not_authorized。\n\`\`\`\n`;
  return `${existing.replace(/\n### 7\.3 G0 accepted code head 与远程关闭证据[\s\S]*$/, '')}\n\n### 7.3 G0 accepted code head 与远程关闭证据\n\n| 证据项 | 固定结果 |\n| --- | --- |\n| accepted_code_head | \`${parent}\` |\n| accepted_code_package | ${packageFiles} files / ${net} net additions；package gate ${gateCount} |\n| remote_rp01a | run \`${runs.g0_evidence_rp01a_run}\` |\n| remote_rp01b | run \`${runs.g0_evidence_rp01b_run}\` |\n| remote_rp01c | run \`${runs.g0_evidence_rp01c_run}\` |\n| remote_governance | run \`${runs.g0_evidence_governance_run}\` |\n| authorization | B2a2 继续 \`not_authorized\` |\n\n${fields}`;
}
function publishEvidence(gatePrep, { files = GATE_PREP_EVIDENCE_FILES, common = {}, perFile = {}, extraByFile = {}, transformByFile = {}, extraFile, appendOnly = false, gateCount } = {}) {
  const packageStats = stats(gatePrep.repo, gatePrep.base);
  const gateTestText = sh(gatePrep.repo, ["git", "show", `${gatePrep.head}:scripts/rp02b2a-package-gate.test.mjs`]);
  const gateTestCount = gateTestText.match(/\bit\s*\(/g)?.length ?? 0;
  const effectiveGateCount = gateCount ?? `${gateTestCount}/${gateTestCount}`;
  for (const file of files) {
    const existing = readFileSync(resolve(gatePrep.repo, file), "utf8");
    const fields = evidenceText(gatePrep.head, { ...common, ...perFile[file] });
    const body = appendOnly ? `${existing.trimEnd()}\n\n${fields}` : finalEvidenceText(file, existing, gatePrep.head, packageStats.files, packageStats.net, fields, effectiveGateCount);
    const transformed = transformByFile[file]?.(body) ?? body;
    write(gatePrep.repo, file, `${transformed}${extraByFile[file] ?? ""}`);
  }
  if (extraFile) write(gatePrep.repo, extraFile, "outside evidence scope\n");
  return { repo: gatePrep.repo, base: gatePrep.head, head: commit(gatePrep.repo, GATE_PREP_EVIDENCE_ID) };
}
function prepareEvidence(options) {
  return publishEvidence(prepare(A2_SCOPE_V5_ID), options);
}
function evidenceResult(options) { const item = prepareEvidence(options); return { item, result: gate(item) }; }
function moveMarkdownSectionBodyLater(text, heading, laterHeading) {
  const headingMatch = new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]*$`, "m").exec(text);
  assert.ok(headingMatch, `missing section to move: ${heading}`);
  const bodyStart = headingMatch.index + headingMatch[0].length, level = /^#+/.exec(heading)?.[0].length;
  assert.ok(level, `invalid markdown heading: ${heading}`);
  const remainder = text.slice(bodyStart), next = new RegExp(`^#{1,${level}}[ \\t]+`, "m").exec(remainder), bodyEnd = bodyStart + (next?.index ?? remainder.length);
  return `${text.slice(0, bodyStart)}\n\n${laterHeading}${text.slice(bodyStart, bodyEnd)}${text.slice(bodyEnd)}`;
}
function prepareCombinedGatePrepEvidence() {
  const path = repo(CORRECTION_BASELINE), base = sh(path, ["git", "rev-parse", "HEAD"]).trim();
  const [manifestId, adrPath, hardMaxFiles, hardMaxNetAdditions] = ORACLE[CORRECTION_ID];
  for (const file of select(CORRECTION_ID).filter((item) => item !== adrPath)) copyCorrectionFile(path, file);
  for (const file of GATE_PREP_EVIDENCE_FILES) write(path, file, `${readFileSync(resolve(path, file), "utf8").trimEnd()}\n\n${evidenceText(base)}`);
  const render = (files, net) => adr({ status: "ready", package_id: CORRECTION_ID, manifest_id: manifestId, baseline_sha: CORRECTION_BASELINE, hard_max_files: hardMaxFiles, hard_max_net_additions: hardMaxNetAdditions, actual_files: files, actual_net_additions: net });
  write(path, adrPath, render(0, 0));
  const actual = stats(path, base);
  write(path, adrPath, render(actual.files, actual.net));
  return { repo: path, base, head: commit(path, "combined G0 and E1") };
}
function appendGatePrepRevision(gatePrep) {
  const file = "docs/modules/rp-02b2-dispatcher-transport-implementation-package.md";
  write(gatePrep.repo, file, `${readFileSync(resolve(gatePrep.repo, file), "utf8").trimEnd()}\n\nIncremental G0 revision must be rejected.\n`);
  const adrPath = GATE_PREP_ADR;
  const reset = readFileSync(resolve(gatePrep.repo, adrPath), "utf8").replace(/^actual_files:.*$/m, "actual_files: 0").replace(/^actual_net_additions:.*$/m, "actual_net_additions: 0");
  write(gatePrep.repo, adrPath, reset);
  const actual = stats(gatePrep.repo, B2A2_BASELINE);
  write(gatePrep.repo, adrPath, reset.replace("actual_files: 0", `actual_files: ${actual.files}`).replace("actual_net_additions: 0", `actual_net_additions: ${actual.net}`));
  return { repo: gatePrep.repo, base: B2A2_BASELINE, head: commit(gatePrep.repo, "incremental G0 revision") };
}
function namedWorkflowShell(workflowPath, stepName) {
  const lines = readFileSync(workflowPath, "utf8").split(/\r?\n/);
  const named = lines.findIndex((line) => line.trim() === `- name: ${stepName}`);
  const nextStep = lines.findIndex((line, index) => index > named && line.trim().startsWith("- name: "));
  const runLine = lines.findIndex((line, index) => index > named && (nextStep < 0 || index < nextStep) && line.trim() === "run: |");
  assert.ok(named >= 0 && runLine > named, `${stepName} workflow shell not found`);
  const indent = lines[runLine].match(/^\s*/)[0].length + 2, body = [];
  for (let index = runLine + 1; index < lines.length; index += 1) {
    const line = lines[index], width = line.match(/^\s*/)[0].length;
    if (line.trim() && width < indent) break;
    body.push(line.trim() ? line.slice(indent) : "");
  }
  return body.join("\n");
}
function evidenceWorkflowShell() { return namedWorkflowShell(WORKFLOW, "Verify G0 evidence parent runs"); }
function runEvidenceWorkflowShell({ mutateField = "", mutateValue = "", repository = "example/repo" } = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), "rp02b2a-evidence-gh-")), fakeGh = resolve(directory, "gh"), gitRepo = resolve(directory, "repo");
  mkdirSync(gitRepo);
  sh(gitRepo, ["git", "init", "-q"]);
  sh(gitRepo, ["git", "config", "user.email", "rp02b2a@example.test"]);
  sh(gitRepo, ["git", "config", "user.name", "RP02B2a Evidence"]);
  for (const file of [".github/workflows/rp01a-e2e.yml", ".github/workflows/rp01b-dom.yml", ".github/workflows/rp01c-fixtures.yml", ".github/workflows/remediation-governance.yml"]) write(gitRepo, file, `name: ${file}\n`);
  const parent = commit(gitRepo, "accepted G0");
  sh(gitRepo, ["git", "commit", "-q", "--allow-empty", "-m", "E1 evidence"]);
  const head = sh(gitRepo, ["git", "rev-parse", "HEAD"]).trim();
  writeFileSync(fakeGh, `#!/usr/bin/env node
const args = process.argv.slice(2);
const runJq = "[.name,.path,.workflow_id,.event,.head_sha,.head_branch,.status,.conclusion] | @tsv";
const workflowJq = "[.id,.path] | @tsv";
const runPrefix = "repos/example/repo/actions/runs/";
const workflowPrefix = "repos/example/repo/actions/workflows/";
const names = {30000001:"RP-01A backend E2E",30000002:"RP-01B admin DOM tests",30000003:"RP-01C deterministic fixtures",30000004:"Remediation governance"};
const paths = {30000001:".github/workflows/rp01a-e2e.yml",30000002:".github/workflows/rp01b-dom.yml",30000003:".github/workflows/rp01c-fixtures.yml",30000004:".github/workflows/remediation-governance.yml"};
const workflowIds = {"rp01a-e2e.yml":"40000001","rp01b-dom.yml":"40000002","rp01c-fixtures.yml":"40000003","remediation-governance.yml":"40000004"};
if (args.length !== 4 || args[0] !== "api" || args[2] !== "--jq") { console.error("fake gh request shape mismatch"); process.exit(40); }
if (!args[1]?.startsWith("repos/example/repo/")) { console.error("fake gh repository mismatch"); process.exit(42); }
if (args[1]?.startsWith(workflowPrefix) && args[3] === workflowJq) {
  const file = args[1].slice(workflowPrefix.length), id = workflowIds[file];
  if (!id) { console.error("fake gh workflow lookup mismatch"); process.exit(41); }
  const repositoryPath = file === "rp01b-dom.yml" && process.env.FAKE_GH_MUTATE_FIELD === "repository_path" ? process.env.FAKE_GH_MUTATE_VALUE : ".github/workflows/" + file;
  process.stdout.write([id, repositoryPath].join("\\t") + "\\n");
  process.exit(0);
}
const id = args[1]?.startsWith(runPrefix) ? args[1].slice(runPrefix.length) : "";
if (!/^[1-9][0-9]+$/.test(id) || args[3] !== runJq) { console.error("fake gh run schema mismatch"); process.exit(40); }
if (!names[id]) { console.error("fake gh unknown run"); process.exit(41); }
const file = paths[id].split("/").at(-1);
const values = {name:names[id],path:paths[id] + "@refs/heads/main",workflow_id:workflowIds[file],event:"push",head_branch:"main",head_sha:process.env.FAKE_GH_PARENT,status:"completed",conclusion:"success"};
if (id === "30000002" && process.env.FAKE_GH_MUTATE_FIELD) values[process.env.FAKE_GH_MUTATE_FIELD] = process.env.FAKE_GH_MUTATE_VALUE;
process.stdout.write([values.name,values.path,values.workflow_id,values.event,values.head_sha,values.head_branch,values.status,values.conclusion].join("\\t") + "\\n");
`);
  chmodSync(fakeGh, 0o755);
  return spawnSync("bash", ["-c", evidenceWorkflowShell()], { cwd: gitRepo, encoding: "utf8", env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, GH_TOKEN: "test", GITHUB_REPOSITORY: repository, B2A_BASE_SHA: parent, B2A_HEAD_SHA: head, EVIDENCE_PARENT: parent, EVIDENCE_RUNS: "rp01a:30000001,rp01b:30000002,rp01c:30000003,governance:30000004", FAKE_GH_PARENT: parent, FAKE_GH_MUTATE_FIELD: mutateField, FAKE_GH_MUTATE_VALUE: mutateValue } });
}
function runTrustedContextWorkflowShell(overrides = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), "rp02b2a-current-run-gh-")), fakeGh = resolve(directory, "gh"), trusted = resolve(directory, "trusted"), output = resolve(directory, "github-output");
  mkdirSync(trusted);
  sh(trusted, ["git", "init", "-q"]);
  sh(trusted, ["git", "config", "user.email", "rp02b2a@example.test"]);
  sh(trusted, ["git", "config", "user.name", "RP02B2a Admission"]);
  write(trusted, "trusted.txt", "trusted\n");
  const gateSource = commit(trusted, "trusted gate source"), workflowPath = ".github/workflows/rp02b2a-admission.yml", eventRef = overrides.eventRef ?? "refs/heads/main";
  writeFileSync(output, "");
  writeFileSync(fakeGh, `#!/usr/bin/env node
const args = process.argv.slice(2), runJq = "[.id,.run_attempt,.workflow_id,.path,.event,.head_sha] | @tsv";
if (args.length === 4 && args[0] === "api" && args[1] === "repos/example/repo" && args[2] === "--jq" && args[3] === ".default_branch") {
  process.stdout.write(process.env.FAKE_DEFAULT_BRANCH + "\\n");
} else if (args.length === 4 && args[0] === "api" && args[1] === "repos/example/repo/actions/runs/50000001" && args[2] === "--jq" && args[3] === runJq) {
  process.stdout.write([process.env.FAKE_RUN_ID,process.env.FAKE_RUN_ATTEMPT,process.env.FAKE_WORKFLOW_ID,process.env.FAKE_WORKFLOW_PATH,process.env.FAKE_EVENT,process.env.FAKE_HEAD].join("\\t") + "\\n");
} else {
  console.error("fake trusted-context gh request mismatch");
  process.exit(40);
}
`);
  chmodSync(fakeGh, 0o755);
  const env = {
    ...process.env,
    PATH: `${directory}:${process.env.PATH}`,
    GH_TOKEN: "test",
    GITHUB_OUTPUT: output,
    GITHUB_REPOSITORY: overrides.repository ?? "example/repo",
    RUN_ID: "50000001",
    RUN_ATTEMPT: "2",
    EVENT_NAME: "pull_request_target",
    WORKFLOW_PATH: workflowPath,
    WORKFLOW_SHA: gateSource,
    POLICY_SOURCE_SHA: overrides.policySourceSha ?? gateSource,
    WORKFLOW_REF: overrides.workflowRef ?? `example/repo/${workflowPath}@${eventRef}`,
    EVENT_REF: eventRef,
    PR_NUMBER: "42",
    PR_BASE_REF: overrides.prBaseRef ?? "main",
    PR_BASE_SHA: "a".repeat(40),
    PR_HEAD_SHA: "b".repeat(40),
    GATE_SOURCE_SHA: overrides.gateSourceSha ?? gateSource,
    G0_EVIDENCE_SHA: overrides.g0EvidenceSha ?? "c".repeat(40),
    AUTHORIZED_PACKAGE_ID: "RP-02B2a2",
    AUTHORIZED_PREDECESSOR_SHA: "d".repeat(40),
    FAKE_RUN_ID: overrides.apiRunId ?? "50000001",
    FAKE_RUN_ATTEMPT: overrides.apiRunAttempt ?? "2",
    FAKE_WORKFLOW_ID: overrides.workflowId ?? "40000001",
    FAKE_WORKFLOW_PATH: overrides.path ?? `${workflowPath}@${eventRef}`,
    FAKE_EVENT: overrides.event ?? "pull_request_target",
    FAKE_HEAD: overrides.head ?? "b".repeat(40),
    FAKE_DEFAULT_BRANCH: overrides.defaultBranch ?? "main",
  };
  const result = spawnSync("bash", ["-c", namedWorkflowShell(ADMISSION_WORKFLOW, "Validate trusted event context")], { cwd: directory, encoding: "utf8", env });
  return { ...result, githubOutput: readFileSync(output, "utf8") };
}
function runAdmissionEvidenceWorkflowShell(overrides = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), "rp02b2a-live-pr-gh-")), fakeGh = resolve(directory, "gh"), output = resolve(directory, "github-output"), runnerTemp = resolve(directory, "runner");
  const prBase = overrides.prBase ?? "a".repeat(40), prHead = overrides.prHead ?? "b".repeat(40);
  mkdirSync(runnerTemp);
  writeFileSync(output, "");
  writeFileSync(fakeGh, `#!/usr/bin/env node
const args = process.argv.slice(2), jq = "[.number,.state,.base.ref,.base.sha,.head.sha] | @tsv";
if (args.length !== 4 || args[0] !== "api" || args[1] !== "repos/example/repo/pulls/42" || args[2] !== "--jq" || args[3] !== jq) { console.error("fake live-PR gh request mismatch"); process.exit(40); }
process.stdout.write([process.env.FAKE_PR_NUMBER,process.env.FAKE_PR_STATE,process.env.FAKE_BASE_REF,process.env.FAKE_BASE,process.env.FAKE_HEAD].join("\\t") + "\\n");
`);
  chmodSync(fakeGh, 0o755);
  const env = {
    ...process.env,
    PATH: `${directory}:${process.env.PATH}`,
    GH_TOKEN: "test",
    GITHUB_OUTPUT: output,
    RUNNER_TEMP: runnerTemp,
    GITHUB_REPOSITORY: "example/repo",
    RUN_ID: "50000001",
    RUN_ATTEMPT: "2",
    EVENT_NAME: "pull_request_target",
    WORKFLOW_PATH: ".github/workflows/rp02b2a-admission.yml",
    WORKFLOW_ID: "40000001",
    WORKFLOW_SHA: "e".repeat(40),
    POLICY_SOURCE_SHA: overrides.policySourceSha ?? "e".repeat(40),
    PR_NUMBER: "42",
    PR_BASE_REF: "main",
    PR_BASE_SHA: prBase,
    PR_HEAD_SHA: prHead,
    GATE_SOURCE_SHA: overrides.gateSourceSha ?? "f".repeat(40),
    G0_EVIDENCE_SHA: overrides.g0EvidenceSha ?? "c".repeat(40),
    AUTHORIZED_PACKAGE_ID: overrides.authorizedPackageId ?? "RP-02B2a2",
    AUTHORIZED_PREDECESSOR_SHA: overrides.authorizedPredecessorSha ?? "d".repeat(40),
    CANDIDATE_SHA: prHead,
    PACKAGE_ID: overrides.packageId ?? "RP-02B2a2",
    ADMISSION_KIND: overrides.admissionKind ?? "business",
    GATE_G0_EVIDENCE_SHA: overrides.gateG0EvidenceSha ?? "c".repeat(40),
    G0_EVIDENCE_DIGEST: overrides.g0EvidenceDigest ?? "1".repeat(64),
    MANIFEST_DIGEST: overrides.manifestDigest ?? "2".repeat(64),
    GATE_EVENT_BASE_SHA: prBase,
    TEST_COMMAND: overrides.testCommand ?? "test:rp02b2a2",
    FAKE_PR_NUMBER: overrides.liveNumber ?? "42",
    FAKE_PR_STATE: overrides.liveState ?? "open",
    FAKE_BASE_REF: overrides.liveBaseRef ?? "main",
    FAKE_BASE: overrides.liveBase ?? prBase,
    FAKE_HEAD: overrides.liveHead ?? prHead,
  };
  const result = spawnSync("bash", ["-c", namedWorkflowShell(ADMISSION_WORKFLOW, "Bind admission evidence")], { cwd: directory, encoding: "utf8", env });
  return { ...result, githubOutput: readFileSync(output, "utf8"), artifactPath: resolve(runnerTemp, "rp02b2a-admission/admission.json") };
}
function mutateCandidateBlob(item, path = "packages/shared/src/api.ts") {
  write(item.repo, path, `${readFileSync(resolve(item.repo, path), "utf8").trimEnd()}\nmutated candidate blob\n`);
  const adrPath = ORACLE[item.packageId][1];
  for (let pass = 0; pass < 2; pass += 1) {
    const actual = stats(item.repo, item.base), text = readFileSync(resolve(item.repo, adrPath), "utf8")
      .replace(/^actual_files:.*$/m, `actual_files: ${actual.files}`)
      .replace(/^actual_net_additions:.*$/m, `actual_net_additions: ${actual.net}`);
    write(item.repo, adrPath, text);
  }
  item.head = commit(item.repo, "mutate candidate manifest blob");
  return item;
}

describe("RP-02B2a2 G0 evidence publication gate", () => {
  it("accepts exactly one direct three-document E1 and binds its parent runs", () => {
    const item = prepareEvidence(), passed = gate(item);
    assert.equal(passed.status, 0, passed.stderr);
    assert.match(passed.stdout, /RP-02B2a2-G0-E1 package gate passed: files=3/);
    const output = run(item.repo, ["--github-output", "--base", item.base, "--head", item.head]);
    assert.equal(output.status, 0, output.stderr);
    assert.match(output.stdout, /package_id=RP-02B2a2-G0-E1/);
    assert.match(output.stdout, /test_command=test:governance/);
    assert.match(output.stdout, new RegExp(`evidence_parent=${item.base}`));
    assert.match(output.stdout, /evidence_runs=rp01a:30000001,rp01b:30000002,rp01c:30000003,governance:30000004/);
    const range = pushRange(item.repo, "ignored-main", item.base, item.head);
    assert.equal(range.status, 0, range.stderr);
    assert.match(range.stdout, new RegExp(`base=${item.base}\\nhead=${item.head}`));
    assert.equal(workflow(WORKFLOW, ["--package-id", GATE_PREP_EVIDENCE_ID, "--test-command", GATE_PREP_EVIDENCE_COMMAND]).status, 0);
  });
  it("rejects incomplete, expanded, inconsistent, forged, stale, or topologically invalid E1 evidence", async () => {
    const analysis = { files: GATE_PREP_EVIDENCE_FILES, adrTextByPath: {}, base: "a".repeat(40), head: "b".repeat(40) };
    assert.equal(analyzePackageGate({ ...analysis, addedLines: 64, deletedLines: 0, netAdditions: 64 }).packageId, GATE_PREP_EVIDENCE_ID);
    assert.equal(analyzePackageGate({ ...analysis, addedLines: 64, deletedLines: 48, netAdditions: 16 }).packageId, GATE_PREP_EVIDENCE_ID);
    assert.throws(() => analyzePackageGate({ ...analysis, addedLines: 65, deletedLines: 1, netAdditions: 64 }), /additions budget exceeded/);
    assert.throws(() => analyzePackageGate({ ...analysis, addedLines: 64, deletedLines: 49, netAdditions: 15 }), /deletions budget exceeded/);
    assert.throws(() => analyzePackageGate({ ...analysis, addedLines: 64, deletedLines: 0, netAdditions: 65 }), /net additions budget exceeded/);
    const cases = [
      [{ files: GATE_PREP_EVIDENCE_FILES.slice(0, 2) }, /requires exactly the three frozen evidence files/],
      [{ extraFile: "outside/evidence.md" }, /requires exactly the three frozen evidence files/],
      [{ appendOnly: true }, /nine-field whitelist|must replace the current progress block|must remove residual pending or stale G0 counts|requires exactly one .* section/],
      [{ common: { g0_evidence_parent_sha: "1".repeat(40) } }, /g0_evidence_parent_sha must equal/],
      [{ common: { g0_evidence_a2_authorization: "authorized" } }, /must preserve A2 not_authorized|contradictory A2 authorization/],
      [{ common: { g0_evidence_issue_closed_count: "10/42" } }, /must preserve ledger 9\/42/],
      [{ common: { g0_evidence_rmd_task_002: "closed" } }, /must preserve ledger 9\/42/],
      [{ common: { g0_evidence_rmd_task_003: "closed" } }, /must preserve ledger 9\/42/],
      [{ common: { g0_evidence_rp01b_run: "30000001" } }, /four unique numeric parent run ids/],
      [{ common: { g0_evidence_rp01c_run: "12" } }, /four unique numeric parent run ids/],
      [{ perFile: { [GATE_PREP_EVIDENCE_FILES[0]]: { g0_evidence_governance_run: "39999999" } } }, /evidence fields must match/],
      [{ perFile: { [GATE_PREP_EVIDENCE_FILES[1]]: { g0_evidence_rp01a_run: "\n30000001" } } }, /non-empty same-line g0_evidence_rp01a_run/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "g0_evidence_rp01a_run: 39999999\n" } }, /nine-field whitelist|exactly one g0_evidence_rp01a_run/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "g0_evidence_e1_run: 39999999\n" } }, /nine-field whitelist/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "g0_evidence_e1_run = 39999999\n" } }, /nine-field whitelist/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "\n## 8. Outside evidence section\ng0_evidence_e1_run: 39999999\n" } }, /nine-field whitelist/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "g0_evidence_unlisted:\n" } }, /nine-field whitelist/],
      [{ gateCount: `${GATE_TEST_COUNT - 1}/${GATE_TEST_COUNT - 1}` }, /final package counts|stale G0 counts/],
      [{ transformByFile: { [GATE_PREP_EVIDENCE_FILES[0]]: text => moveMarkdownSectionBodyLater(text, "### MCE-RP02B2A2-G0-E1-REMOTE-ACCEPTED", "### Unrelated later event\n") } }, /evidence field set|non-empty same-line|remote-accepted event|required.*section/i],
      [{ transformByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: text => moveMarkdownSectionBodyLater(text, "## 7. 当前唯一推荐动作", "## 8. Unrelated later status\n") } }, /evidence field set|non-empty same-line|numbered-action|required.*section/i],
      [{ transformByFile: { [GATE_PREP_EVIDENCE_FILES[2]]: text => moveMarkdownSectionBodyLater(text, "### 7.3 G0 accepted code head 与远程关闭证据", "### 7.4 Unrelated later verification\n") } }, /evidence field set|non-empty same-line|final G0 evidence section|required.*section/i],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已授权；not_authorized 是旧字段。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "已授权 A2，可进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2\n授权通过，允许进入业务实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "`A2` **已经获得授权**，但字段保持 not_authorized。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "授权 A2 开始实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 授权生效，可以开工。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已放行，可以进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已解禁，可以进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 可开工。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已授<!-- inline review -->权，可进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A<!-- split subject -->2 已授权，可进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已授&ZeroWidthSpace;权，可进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已授&ZeroWidthNonJoiner;权。\n" } }, /unsupported named HTML entity|contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已授<wbr>权，可进入实现。\n" } }, /unsupported rendered HTML|contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已授&#60;wbr&#62;权。\n" } }, /unsupported decoded HTML|contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已解&#x3c;wbr&#x3e;禁。\n" } }, /unsupported decoded HTML|contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已授&shy;权，可进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已授\u034F权，可进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已授\u200B权，可进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已\u202E授\u202C权，可进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 &#x5df2;&#x6388;&#x6743;，可进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 &#24050;&#25480;&#26435;，可进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 approved for implementation.\n" } }, /contradictory A2 authorization statement/],
    ];
    await mapWithConcurrency(cases, 6, async ([options, pattern]) => {
      const item = prepareEvidence(options);
      const result = await gateAsync(item);
      expectRejected(result, pattern, `negative E1 case mismatch: ${JSON.stringify(options)}`);
    });
    expectRejected(gate(prepareCombinedGatePrepEvidence()), /cannot batch RP-02B2a2-G0-E1 publication evidence/);
    const initialG0 = prepare(GATE_PREP_ID), revisedG0 = appendGatePrepRevision(initialG0);
    expectRejected(gate(revisedG0), /must be one atomic direct child commit/);
    const revisedEvidence = publishEvidence({ repo: revisedG0.repo, base: revisedG0.base, head: revisedG0.head });
    expectRejected(gate(revisedEvidence), /requires its verified G0 commit as the direct base|atomic direct child/);
    const first = prepareEvidence();
    for (const file of GATE_PREP_EVIDENCE_FILES) write(first.repo, file, readFileSync(resolve(first.repo, file), "utf8").replace("g0_evidence_governance_run: 30000004", "g0_evidence_governance_run: 30000005"));
    const second = commit(first.repo, "second evidence publication");
    expectRejected(gate({ repo: first.repo, base: first.head, head: second }), /requires its verified G0 commit as the direct base|must be one direct child commit/);
    const evidenceBase = prepareEvidence(), a2OnEvidence = addMinimalB2a2Candidate(evidenceBase.repo, evidenceBase.head);
    expectRejected(gate({ repo: evidenceBase.repo, base: evidenceBase.head, head: a2OnEvidence, gateSource: evidenceBase.base, g0EvidenceSha: evidenceBase.head, authorizedPackageId: "RP-02B2a2", authorizedPredecessorSha: evidenceBase.head }), /must branch directly from the accepted G0 code head|authorized predecessor must equal the accepted G0/);
    const mergedEvidence = prepareEvidence();
    sh(mergedEvidence.repo, ["git", "checkout", "-q", "--detach", mergedEvidence.base]);
    addMinimalB2a2Candidate(mergedEvidence.repo, mergedEvidence.base);
    sh(mergedEvidence.repo, ["git", "merge", "-q", "-s", "ours", "--no-edit", mergedEvidence.head]);
    const mergedHead = sh(mergedEvidence.repo, ["git", "rev-parse", "HEAD"]).trim();
    expectRejected(gate({ repo: mergedEvidence.repo, base: mergedEvidence.base, head: mergedHead, gateSource: mergedEvidence.base, g0EvidenceSha: mergedEvidence.head, authorizedPackageId: "RP-02B2a2", authorizedPredecessorSha: mergedEvidence.base }), /history cannot touch, delete, inherit, or merge RP-02B2a2-G0-E1|must replace the G0 final-review row/);
    const revertedEvidence = prepareEvidence();
    sh(revertedEvidence.repo, ["git", "checkout", "-q", "--detach", revertedEvidence.head]);
    sh(revertedEvidence.repo, ["git", "checkout", revertedEvidence.base, "--", ...GATE_PREP_EVIDENCE_FILES]);
    commit(revertedEvidence.repo, "revert E1 evidence before A2");
    const revertedA2 = addMinimalB2a2Candidate(revertedEvidence.repo, revertedEvidence.base);
    expectRejected(gate({ repo: revertedEvidence.repo, base: revertedEvidence.base, head: revertedA2, gateSource: revertedEvidence.base, g0EvidenceSha: revertedEvidence.head, authorizedPackageId: "RP-02B2a2", authorizedPredecessorSha: revertedEvidence.base }), /history cannot touch, delete, inherit, or merge RP-02B2a2-G0-E1/);
    const touchedEvidence = prepare(A2_SCOPE_V5_ID), acceptedTouchedEvidence = publishEvidence(touchedEvidence).head, touchedPath = GATE_PREP_EVIDENCE_FILES[1];
    sh(touchedEvidence.repo, ["git", "checkout", "-q", "--detach", touchedEvidence.head]);
    write(touchedEvidence.repo, touchedPath, `${readFileSync(resolve(touchedEvidence.repo, touchedPath), "utf8")}\nTemporary evidence-file touch without E1 markers.\n`);
    commit(touchedEvidence.repo, "touch evidence file without markers");
    sh(touchedEvidence.repo, ["git", "checkout", touchedEvidence.head, "--", touchedPath]);
    commit(touchedEvidence.repo, "restore evidence file before A2");
    const touchedA2 = addMinimalB2a2Candidate(touchedEvidence.repo, touchedEvidence.head);
    expectRejected(gate({ repo: touchedEvidence.repo, base: touchedEvidence.head, head: touchedA2, gateSource: touchedEvidence.head, g0EvidenceSha: acceptedTouchedEvidence, authorizedPackageId: "RP-02B2a2", authorizedPredecessorSha: touchedEvidence.head }), /history cannot touch, delete, inherit, or merge RP-02B2a2-G0-E1/);
    const noG0 = repo(false);
    for (const file of GATE_PREP_EVIDENCE_FILES) write(noG0, file, evidenceText(sh(noG0, ["git", "rev-parse", "HEAD"]).trim()));
    const base = sh(noG0, ["git", "rev-parse", "HEAD"]).trim(), head = commit(noG0, "evidence without G0");
    expectRejected(gate({ repo: noG0, base, head }), /requires a verified RP-02B2a2-G0-C5 ancestor/);
  });
  it("rejects evidence workflow permission, binding, command, ordering, and remote-run drift", () => {
    const mutations = [
      [text => text.replace("  actions: read", "  actions: write"), /permissions must be exactly/],
      [text => text.replace("      - name: Verify G0 evidence parent runs", "      - name: Disabled G0 evidence parent runs"), /step named Verify G0 evidence parent runs/],
      [text => text.replace("if: steps.b2a-package.outputs.package_id == 'RP-02B2a2-G0-E1'", "if: always()"), /evidence step condition/],
      [text => text.replace("          EVIDENCE_PARENT: ${{ steps.b2a-package.outputs.evidence_parent }}", "          EVIDENCE_PARENT: ${{ github.sha }}"), /evidence parent runs env binding/],
      [text => text.replace('          test "$status" = "completed"', '          test "$status" = "queued"'), /evidence parent runs shell semantics/],
      [text => text.replace("      - run: npm ci\n", "").replace("      - name: Verify G0 evidence parent runs", "      - run: npm ci\n      - name: Verify G0 evidence parent runs"), /step sequence contains missing, extra, or reordered execution|evidence verification must complete before npm ci/],
      [text => text.replace("    runs-on: ubuntu-latest", "    if: false\n    runs-on: ubuntu-latest"), /job keys mismatch/],
      [text => text.replace("    runs-on: ubuntu-latest", "    continue-on-error: true\n    runs-on: ubuntu-latest"), /job keys mismatch/],
      [text => text.replace("      - run: npm ci", "      - run: echo unexpected\n      - run: npm ci"), /step sequence contains missing, extra, or reordered execution/],
      [text => `${text}\n  bypass-job:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n`, /workflow jobs keys mismatch/],
    ];
    for (const [index, [change, pattern]] of mutations.entries()) {
      const result = mutate(change, `E1 workflow mutation ${index} did not change fixture`);
      assert.notEqual(result.status, 0, `E1 workflow mutation ${index} passed`);
      expectRejected(result, pattern, `E1 workflow mutation ${index}`);
    }
    const success = runEvidenceWorkflowShell();
    assert.equal(success.status, 0, `${success.stdout}\n${success.stderr}`);
    expectRejected(runEvidenceWorkflowShell({ repository: "other/repo" }), /repository mismatch/i);
    for (const [field, value, pattern] of [
      ["repository_path", ".github/workflows/wrong.yml", /repository.*path|workflow.*repository path/i],
      ["name", "Wrong workflow", /workflow name/i],
      ["path", ".github/workflows/wrong.yml@refs/heads/main", /workflow path/i],
      ["workflow_id", "49999999", /workflow id/i],
      ["event", "pull_request", /event/i],
      ["head_branch", "codex/forged", /workflow branch/i],
      ["head_sha", "b".repeat(40), /head/i],
      ["status", "queued", /status/i],
      ["conclusion", "failure", /conclusion/i],
    ]) expectRejected(runEvidenceWorkflowShell({ mutateField: field, mutateValue: value }), pattern, `fake gh ${field} drift`);
  });
  it("accepts a direct-child amend worktree but rejects incremental G0 worktree history", () => {
    const item = prepare(GATE_PREP_ID);
    const implementationPath = "docs/modules/rp-02b2-dispatcher-transport-implementation-package.md";
    const implementation = readFileSync(resolve(item.repo, implementationPath), "utf8");
    write(item.repo, implementationPath, implementation.replace("当前未提交差异为", "当前待冻结差异为"));
    const amendWorktree = run(item.repo, ["--base", B2A2_BASELINE, "--head", item.head, "--worktree"]);
    assert.equal(amendWorktree.status, 0, amendWorktree.stderr);
    const incrementalHead = commit(item.repo, "incremental G0 worktree");
    expectRejected(
      run(item.repo, ["--base", B2A2_BASELINE, "--head", incrementalHead, "--worktree"]),
      /worktree preparation must be at fixed baseline .* or its single direct child pending atomic amend/
    );
  });
  it("separates an admitted sibling candidate from its exact main-branch squash delivery", () => {
    const item = prepare("RP-02B2a2");
    const candidateFiles = sh(item.repo, ["git", "diff", "--name-only", item.base, item.head]).trim().split("\n").filter(Boolean);
    const existingCandidateFile = candidateFiles.find((file) => spawnSync("git", ["cat-file", "-e", `${item.head}:${file}`], { cwd: item.repo }).status === 0);
    assert.ok(existingCandidateFile, "A2 fixture must include an existing candidate file");
    const regularCandidateFile = candidateFiles.find((file) => sh(item.repo, ["git", "ls-tree", item.head, "--", file]).startsWith("100644"));
    assert.ok(regularCandidateFile, "A2 fixture must include a regular non-executable candidate file");
    const landCandidate = (deliveryBase, label, { extraFile, mutateFile, executableFile } = {}) => {
      sh(item.repo, ["git", "checkout", "-q", "--detach", deliveryBase]);
      for (const file of candidateFiles) {
        if (spawnSync("git", ["cat-file", "-e", `${item.head}:${file}`], { cwd: item.repo }).status === 0)
          sh(item.repo, ["git", "checkout", item.head, "--", file]);
        else if (spawnSync("test", ["-e", resolve(item.repo, file)]).status === 0)
          unlinkSync(resolve(item.repo, file));
      }
      if (extraFile) write(item.repo, extraFile, "unexpected\n");
      if (mutateFile) write(item.repo, mutateFile, "delivery content drift\n");
      if (executableFile) chmodSync(resolve(item.repo, executableFile), 0o755);
      return commit(item.repo, label);
    };
    const deliveryBase = item.g0EvidenceSha;
    const deliveryHead = landCandidate(deliveryBase, "squash admitted A2");
    const receipt = admittedCandidateArgs(item);
    const range = run(item.repo, [
      "--print-range", "--event", "push", "--push-ref", "refs/heads/main", "--push-created", "false",
      "--push-before", deliveryBase, "--push-head", deliveryHead, ...receipt,
    ]);
    assert.equal(range.status, 0, range.stderr);
    assert.match(range.stdout, new RegExp(`base=${item.base}\\nhead=${item.head}\\ndelivery_base=${deliveryBase}\\ndelivery_head=${deliveryHead}\\nrange_mode=trusted_squash_post_merge`));
    const verified = run(item.repo, [
      "--github-output", "--base", item.base, "--head", item.head,
      "--delivery-base", deliveryBase, "--delivery-head", deliveryHead,
      "--gate-source", item.gateSource, "--g0-evidence-sha", item.g0EvidenceSha,
      ...receipt,
    ]);
    assert.equal(verified.status, 0, verified.stderr);
    assert.match(verified.stdout, new RegExp(`range_mode=trusted_squash_post_merge.*delivery_base_sha=${deliveryBase}.*delivery_head_sha=${deliveryHead}.*candidate_sha=${item.head}`, "s"));

    const replay = run(item.repo, [
      "--print-range", "--event", "repository_dispatch", "--event-ref", "refs/heads/main",
      "--manual-base", deliveryBase, "--manual-head", deliveryHead, ...receipt,
    ]);
    assert.equal(replay.status, 0, replay.stderr);
    assert.match(replay.stdout, new RegExp(`base=${item.base}\\nhead=${item.head}\\ndelivery_base=${deliveryBase}\\ndelivery_head=${deliveryHead}\\nrange_mode=trusted_squash_post_merge`));

    const durableSource = repo(false);
    sh(durableSource, ["git", "branch", "-M", "main"]);
    sh(durableSource, ["git", "checkout", "-q", "-b", "candidate-sibling"]);
    write(durableSource, "candidate-receipt.txt", "candidate\n");
    const durableCandidate = commit(durableSource, "admitted sibling candidate");
    const durableTag = `rp02b2a-admitted-${durableCandidate}`;
    sh(durableSource, ["git", "tag", durableTag, durableCandidate]);
    sh(durableSource, ["git", "checkout", "-q", "main"]);
    const mainOnlyRoot = mkdtempSync(resolve(tmpdir(), "rp02b2a-main-only-"));
    const mainOnly = resolve(mainOnlyRoot, "repo");
    sh(mainOnlyRoot, ["git", "clone", "-q", "--no-tags", "--single-branch", "--branch", "main", `file://${durableSource}`, mainOnly]);
    const absentCandidate = spawnSync("git", ["cat-file", "-e", `${durableCandidate}^{commit}`], { cwd: mainOnly, encoding: "utf8" });
    assert.notEqual(absentCandidate.status, 0, "main-only checkout unexpectedly contains the sibling candidate");
    sh(mainOnly, ["git", "fetch", "-q", "--no-tags", "--force", "origin", `refs/tags/${durableTag}:refs/remotes/origin/rp02b2a-admitted-candidate`]);
    assert.equal(sh(mainOnly, ["git", "rev-parse", "refs/remotes/origin/rp02b2a-admitted-candidate^{commit}"]).trim(), durableCandidate);

    for (const ref of ["refs/heads/feature/a2", "refs/tags/main"]) expectRejected(run(item.repo, [
      "--print-range", "--event", "push", "--push-ref", ref, "--push-created", "false",
      "--push-before", deliveryBase, "--push-head", deliveryHead, ...receipt,
    ]), /only on refs\/heads\/main/);
    expectRejected(run(item.repo, [
      "--print-range", "--event", "repository_dispatch", "--event-ref", "refs/heads/feature/a2",
      "--manual-base", deliveryBase, "--manual-head", deliveryHead, ...receipt,
    ]), /requires refs\/heads\/main workflow context/);
    expectRejected(run(item.repo, [
      "--print-range", "--event", "workflow_dispatch", "--manual-base", deliveryBase, "--manual-head", deliveryHead, ...receipt,
    ]), /requires trusted default-branch repository_dispatch/);
    expectRejected(run(item.repo, [
      "--print-range", "--event", "repository_dispatch", "--event-ref", "refs/heads/main", "--manual-base", deliveryBase, "--manual-head", deliveryHead,
      ...admittedCandidateArgs(item, { tree: "f".repeat(40) }),
    ]), /candidate tree mismatch/);
    expectRejected(run(item.repo, [
      "--print-range", "--event", "repository_dispatch", "--event-ref", "refs/heads/main", "--manual-base", deliveryBase, "--manual-head", deliveryHead,
      ...admittedCandidateArgs(item, { digest: "f".repeat(64) }),
    ]), /manifest digest mismatch/);
    expectRejected(run(item.repo, [
      "--print-range", "--event", "repository_dispatch", "--event-ref", "refs/heads/main", "--manual-base", deliveryBase, "--manual-head", deliveryHead,
      ...receipt.slice(0, -2),
    ]), /incomplete admitted candidate SHA\/tree\/manifest receipt/);
    expectRejected(run(item.repo, [
      "--print-range", "--event", "repository_dispatch", "--event-ref", "refs/heads/main", "--manual-base", deliveryBase, "--manual-head", deliveryHead,
      ...receipt.slice(0, 8),
    ]), /requires a complete admitted candidate receipt/);
    expectRejected(run(item.repo, [
      "--print-range", "--event", "repository_dispatch", "--event-ref", "refs/heads/main", "--manual-base", deliveryBase, "--manual-head", deliveryHead,
      ...admittedCandidateArgs(item, { candidate: "f".repeat(40) }),
    ]), /unreachable AUTHORIZED_CANDIDATE/);
    sh(item.repo, ["git", "checkout", "-q", "--detach", deliveryBase]);
    const unrelatedCandidate = sh(item.repo, ["git", "commit-tree", `${item.head}^{tree}`, "-m", "unrelated candidate receipt"]).trim();
    expectRejected(run(item.repo, [
      "--print-range", "--event", "repository_dispatch", "--event-ref", "refs/heads/main", "--manual-base", deliveryBase, "--manual-head", deliveryHead,
      ...admittedCandidateArgs(item, { candidate: unrelatedCandidate, tree: sh(item.repo, ["git", "rev-parse", `${unrelatedCandidate}^{tree}`]).trim() }),
    ]), /predecessor that is not an ancestor of HEAD/);
    const wrongPredecessor = sh(item.repo, ["git", "rev-parse", `${item.base}^`]).trim();
    expectRejected(run(item.repo, [
      "--print-range", "--event", "repository_dispatch", "--event-ref", "refs/heads/main", "--manual-base", deliveryBase, "--manual-head", deliveryHead,
      ...admittedCandidateArgs(item, { predecessor: wrongPredecessor, digest: expectedManifestDigest(item, wrongPredecessor) }),
    ]), /authorized predecessor must equal the accepted G0 gate source/);

    const extraHead = landCandidate(deliveryBase, "squash with extra path", { extraFile: "outside/extra.ts" });
    expectRejected(run(item.repo, [
      "--print-range", "--event", "repository_dispatch", "--event-ref", "refs/heads/main", "--manual-base", deliveryBase, "--manual-head", extraHead, ...receipt,
    ]), /changed-path set/);
    const blobDriftHead = landCandidate(deliveryBase, "squash with blob drift", { mutateFile: existingCandidateFile });
    expectRejected(run(item.repo, [
      "--print-range", "--event", "repository_dispatch", "--event-ref", "refs/heads/main", "--manual-base", deliveryBase, "--manual-head", blobDriftHead, ...receipt,
    ]), /delivery content differs from candidate/);
    const modeDriftHead = landCandidate(deliveryBase, "squash with mode drift", { executableFile: regularCandidateFile });
    expectRejected(run(item.repo, [
      "--print-range", "--event", "repository_dispatch", "--event-ref", "refs/heads/main", "--manual-base", deliveryBase, "--manual-head", modeDriftHead, ...receipt,
    ]), /delivery content differs from candidate/);

    sh(item.repo, ["git", "checkout", "-q", "--detach", deliveryHead]);
    sh(item.repo, ["git", "commit", "-q", "--allow-empty", "-m", "grandchild delivery"]);
    const grandchildHead = sh(item.repo, ["git", "rev-parse", "HEAD"]).trim();
    expectRejected(run(item.repo, [
      "--print-range", "--event", "repository_dispatch", "--event-ref", "refs/heads/main", "--manual-base", deliveryBase, "--manual-head", grandchildHead, ...receipt,
    ]), /must be one direct child/);
    sh(item.repo, ["git", "checkout", "-q", "--detach", deliveryBase]);
    sh(item.repo, ["git", "commit", "-q", "--allow-empty", "-m", "side parent"]);
    const sideParent = sh(item.repo, ["git", "rev-parse", "HEAD"]).trim();
    sh(item.repo, ["git", "checkout", "-q", "--detach", deliveryHead]);
    sh(item.repo, ["git", "merge", "-q", "--no-ff", sideParent, "-m", "multi-parent delivery"]);
    const mergeHead = sh(item.repo, ["git", "rev-parse", "HEAD"]).trim();
    expectRejected(run(item.repo, [
      "--print-range", "--event", "repository_dispatch", "--event-ref", "refs/heads/main", "--manual-base", deliveryBase, "--manual-head", mergeHead, ...receipt,
    ]), /must be one direct child/);

    sh(item.repo, ["git", "checkout", "-q", "--detach", deliveryBase]);
    write(item.repo, candidateFiles[0], "sibling-owned drift\n");
    const contaminatedBase = commit(item.repo, "sibling modifies candidate path");
    const contaminatedHead = landCandidate(contaminatedBase, "squash over contaminated sibling");
    expectRejected(run(item.repo, [
      "--print-range", "--event", "repository_dispatch", "--event-ref", "refs/heads/main", "--manual-base", contaminatedBase, "--manual-head", contaminatedHead, ...receipt,
    ]), /delivery base must equal the accepted G0-E1 evidence SHA/);
  });
  it("accepts zero-before only for a created ref with a complete authorized range", () => {
    const item = prepare("RP-02B2a2"), zero = "0".repeat(40);
    const accepted = run(item.repo, [
      "--print-range", "--event", "push", "--push-created", "true",
      "--push-before", zero, "--push-head", item.head,
      "--authorized-package-id", "RP-02B2a2",
      "--authorized-predecessor-sha", item.base
    ]);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stdout, new RegExp(`base=${item.base}\\nhead=${item.head}`));
    expectRejected(run(item.repo, [
      "--print-range", "--event", "push", "--push-created", "true",
      "--push-before", zero, "--push-head", item.head
    ]), /without a complete repository-authorized package\/predecessor tuple/);
    expectRejected(run(item.repo, [
      "--print-range", "--event", "push", "--push-created", "false",
      "--push-before", zero, "--push-head", item.head,
      "--authorized-package-id", "RP-02B2a2",
      "--authorized-predecessor-sha", item.base
    ]), /unless GitHub marks a newly created ref/);
    expectRejected(run(item.repo, [
      "--print-range", "--event", "push", "--push-created", "true",
      "--push-before", item.base, "--push-head", item.head,
      "--authorized-package-id", "RP-02B2a2",
      "--authorized-predecessor-sha", item.base
    ]), /inconsistent created push/);
  });
  it("bootstraps only an independently valid fixed-baseline G0 correction range", () => {
    const item = prepare(CORRECTION_ID), zero = "0".repeat(40);
    const staleA2 = [
      "--authorized-package-id", "RP-02B2a2",
      "--authorized-predecessor-sha", ACCEPTED_G0_SHA
    ];
    const expectCorrectionRange = (result) => {
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, new RegExp(`base=${CORRECTION_BASELINE}\\nhead=${item.head}`));
    };
    expectCorrectionRange(run(item.repo, [
      "--print-range", "--event", "workflow_dispatch",
      "--manual-base", CORRECTION_BASELINE, "--manual-head", item.head,
      ...staleA2
    ]));
    expectCorrectionRange(run(item.repo, [
      "--print-range", "--event", "pull_request",
      "--pr-base-ref", CORRECTION_BASELINE, "--pr-head", item.head,
      ...staleA2
    ]));
    expectCorrectionRange(run(item.repo, [
      "--print-range", "--event", "push", "--push-created", "true",
      "--push-before", zero, "--push-head", item.head,
      ...staleA2
    ]));
    expectCorrectionRange(run(item.repo, [
      "--print-range", "--event", "push", "--push-created", "false",
      "--push-before", CORRECTION_BASELINE, "--push-head", item.head,
      ...staleA2
    ]));

    const prior = item.head, sibling = addCorrectionSibling(item.repo, "force-with-lease");
    const replacement = run(item.repo, [
      "--print-range", "--event", "push", "--push-created", "false",
      "--push-before", prior, "--push-head", sibling,
      ...staleA2
    ]);
    assert.equal(replacement.status, 0, replacement.stderr);
    assert.match(replacement.stdout, new RegExp(`base=${CORRECTION_BASELINE}\\nhead=${sibling}`));

    for (const [label, mutateWorkflow, pattern] of [
      ["permissions", (text) => text.replace("  actions: read\n", "  actions: write\n"), /permissions must be exactly/],
      ["range-shell", (text) => text.replace("--push-before", "--before-missing"), /range resolver shell semantics mismatch/],
      ["push-created", (text) => text.replace("PUSH_CREATED: ${{ github.event.created }}", "PUSH_CREATED: ${{ github.event.deleted }}"), /range resolver env binding mismatch/],
    ]) {
      const malformedBefore = addCorrectionSibling(item.repo, `malformed-old-${label}`, mutateWorkflow);
      expectRejected(run(item.repo, [
        "--print-range", "--event", "push", "--push-created", "false",
        "--push-before", malformedBefore, "--push-head", sibling,
        ...staleA2
      ]), pattern, label);
    }

    expectRejected(run(item.repo, [
      "--print-range", "--event", "push", "--push-created", "false",
      "--push-before", zero, "--push-head", sibling
    ]), /unless GitHub marks a newly created ref/);
    expectRejected(run(item.repo, [
      "--print-range", "--event", "workflow_dispatch",
      "--manual-base", ACCEPTED_G0_SHA, "--manual-head", sibling,
      ...staleA2
    ]), /manual replay requires fixed base/);

    const arbitraryBefore = forceBefore(item.repo, CORRECTION_BASELINE, sibling);
    expectRejected(run(item.repo, [
      "--print-range", "--event", "push", "--push-created", "false",
      "--push-before", arbitraryBefore, "--push-head", sibling
    ]), /replacement push requires the fixed baseline or a separately valid correction candidate/);

    const malformed = prepare(CORRECTION_ID, undefined, { overrides: { manifest_id: "malformed" } });
    expectRejected(run(malformed.repo, [
      "--print-range", "--event", "push", "--push-created", "true",
      "--push-before", zero, "--push-head", malformed.head
    ]), /manifest_id mismatch/);
  });
  it("requires every frozen G0 correction manifest file", () => {
    const files = select(CORRECTION_ID);
    assert.equal(files.length, 14);
    for (const missing of files) {
      const reduced = files.filter((file) => file !== missing);
      const candidate = missing === CORRECTION_ADR
        ? prepare(CORRECTION_ID, reduced, { includeAdr: false })
        : prepare(CORRECTION_ID, reduced);
      if (missing === GATE_SCRIPT) {
        sh(candidate.repo, ["git", "checkout", candidate.base, "--", GATE_SCRIPT]);
        sh(candidate.repo, ["git", "commit", "-q", "--amend", "--no-edit"]);
        candidate.head = sh(candidate.repo, ["git", "rev-parse", "HEAD"]).trim();
      }
      const pattern = missing === CORRECTION_ADR
        ? /requires exactly one changed ADR/
        : /requires exactly the 14 frozen manifest files/;
      const result = spawnSync(process.execPath, [
        realpathSync(resolve(ROOT, GATE_SCRIPT)),
        "--base", candidate.base,
        "--head", candidate.head,
      ], { cwd: candidate.repo, encoding: "utf8" });
      expectRejected(result, pattern, missing);
    }
  });
  it("requires natural main-push triggers for RP-01B and governance", () => {
    const rp01b = mutateCorrectionCandidateFile(
      ".github/workflows/rp01b-dom.yml",
      (text) => text.replace("      - '.github/workflows/rp02b2a-admission.yml'\n", ""),
    );
    expectRejected(gate(rp01b), /rp01b-dom\.yml must add only the frozen G0 admission and package-gate push paths/);
    const governance = mutateCorrectionCandidateFile(
      ".github/workflows/remediation-governance.yml",
      (text) => text.replace("      - main\n", "      - release\n"),
    );
    expectRejected(gate(governance), /remediation-governance\.yml must add only the default main push branch/);
  });
  it("rejects drift in the original E1 and A2 authority contracts", () => {
    const e1Budget = mutateCorrectionCandidateFile(
      "docs/adr/rp-02b2a2-gate-prep-budget.md",
      (text) => text.replace("deletions <= 48 / net additions <= 64", "deletions <= 16 / net additions <= 64"),
    );
    expectRejected(gate(e1Budget), /original E1 authority contract must freeze 3\/64\/48\/64 and head_branch=main/);

    const a2Budget = mutateCorrectionCandidateFile(
      "docs/adr/rp-02b2a2-authority-claim-budget.md",
      (text) => text.replace("hard_max_net_additions: 3250", "hard_max_net_additions: 1900"),
    );
    expectRejected(gate(a2Budget), /A2 authority template hard_max_net_additions mismatch/);

    const implementation = mutateCorrectionCandidateFile(
      "docs/modules/rp-02b2-dispatcher-transport-implementation-package.md",
      (text) => text.replace("最终修正包冻结为 14 个精确文件", "最终修正包冻结为 12 个精确文件"),
    );
    expectRejected(gate(implementation), /implementation contract must freeze the 14-file correction and A2 v3 20\/3250 template/);
  });
  it("accepts only the fixed-baseline five-file C3 evidence-trigger correction", () => {
    const valid = prepare(EVIDENCE_TRIGGER_ID), passed = gate(valid);
    assert.equal(passed.status, 0, passed.stderr);
    assert.match(passed.stdout, /RP-02B2a2-G0-C3 package gate passed: files=5/);
    const files = select(EVIDENCE_TRIGGER_ID);
    assert.equal(files.length, 5);
    for (const missing of files) {
      const reduced = files.filter((file) => file !== missing);
      const candidate = missing === EVIDENCE_TRIGGER_ADR
        ? prepare(EVIDENCE_TRIGGER_ID, reduced, { includeAdr: false })
        : prepare(EVIDENCE_TRIGGER_ID, reduced);
      const rejected = currentGate(candidate);
      expectRejected(
        rejected,
        /requires exactly the 5 frozen manifest files|requires exactly one changed ADR|unsupported ADR/,
        `${missing}:\n${rejected.stdout}\n${rejected.stderr}`,
      );
    }
    write(valid.repo, "outside/c3.txt", "outside manifest\n");
    valid.head = commit(valid.repo, "expand C3 manifest");
    expectRejected(gate(valid), /manifest violation|requires exactly the 5 frozen manifest files/);
    const second = prepare(EVIDENCE_TRIGGER_ID);
    sh(second.repo, ["git", "commit", "-q", "--allow-empty", "-m", "second C3 commit"]);
    second.head = sh(second.repo, ["git", "rev-parse", "HEAD"]).trim();
    expectRejected(gate(second), /direct child|fixed baseline/);
  });
  it("requires exact symmetric RP-01A and RP-01C C3 trigger contracts", () => {
    for (const token of [
      "      - '.github/workflows/rp01c-fixtures.yml'\n",
      "      - '.github/workflows/rp02b2a-admission.yml'\n",
      "      - 'scripts/rp02b2a-package-gate.*'\n",
      "      - 'docs/adr/rp-02b2a2-g0-*.md'\n",
    ]) {
      const firstOnly = mutateEvidenceTriggerCandidateFile(
        ".github/workflows/rp01a-e2e.yml",
        (text) => text.replace(token, ""),
      );
      expectRejected(gate(firstOnly), /rp01a-e2e\.yml must add only the frozen G0 evidence-parent push paths/, token);
    }
    const broad = mutateEvidenceTriggerCandidateFile(
      ".github/workflows/rp01a-e2e.yml",
      (text) => text.replace("scripts/rp02b2a-package-gate.*", "scripts/**"),
    );
    expectRejected(gate(broad), /rp01a-e2e\.yml must add only the frozen G0 evidence-parent push paths/);
    const rp01c = mutateEvidenceTriggerCandidateFile(
      ".github/workflows/rp01c-fixtures.yml",
      (text) => text.replace(`      - '${EVIDENCE_TRIGGER_ADR}'\n`, ""),
    );
    expectRejected(gate(rp01c), /rp01c-fixtures\.yml must add only the C3 ADR trigger|requires exactly the 5 frozen manifest files/);
  });
  it("rejects C2 as the current E1 parent or A2 gate source", () => {
    const staleGate = prepare(TEST_LAYER_ID);
    const staleEvidence = publishEvidence(staleGate);
    expectRejected(currentGate(staleEvidence), /requires accepted G0 package RP-02B2a2-G0-C5|candidate job must run only for business admission/);
    sh(staleGate.repo, ["git", "checkout", "-q", "--detach", staleGate.head]);
    const staleA2 = addMinimalB2a2Candidate(staleGate.repo, staleGate.head);
    expectRejected(currentGate({
      repo: staleGate.repo,
      base: staleGate.head,
      head: staleA2,
      gateSource: staleGate.head,
      g0EvidenceSha: staleGate.head,
      authorizedPackageId: "RP-02B2a2",
      authorizedPredecessorSha: staleGate.head,
    }), /requires accepted G0 package RP-02B2a2-G0-C5|candidate job must run only for business admission/);
  });
  it("accepts only the fixed-E1 four-file C4 scope correction", () => {
    const valid = prepare(A2_SCOPE_ID), passed = gate(valid);
    assert.equal(passed.status, 0, passed.stderr);
    assert.match(passed.stdout, /RP-02B2a2-G0-C4 package gate passed: files=4/);
    assert.equal(valid.base, A2_SCOPE_BASELINE);
    assert.equal(sh(valid.repo, ["git", "rev-parse", `${valid.head}^`]).trim(), A2_SCOPE_BASELINE);
    const actual = stats(valid.repo, valid.base);
    assert.equal(actual.files, 4);
    assert.ok(actual.net <= 500, `C4 net additions ${actual.net} exceed 500`);
    for (const missing of select(A2_SCOPE_ID)) {
      const reduced = select(A2_SCOPE_ID).filter((file) => file !== missing);
      const candidate = missing === A2_SCOPE_ADR
        ? prepare(A2_SCOPE_ID, reduced, { includeAdr: false })
        : prepare(A2_SCOPE_ID, reduced);
      expectRejected(currentGate(candidate), /requires exactly the 4 frozen manifest files|requires exactly one changed ADR|unsupported ADR/);
    }
    write(valid.repo, "outside/c4.txt", "outside manifest\n");
    valid.head = commit(valid.repo, "expand C4 manifest");
    expectRejected(currentGate(valid), /manifest violation|requires exactly the 4 frozen manifest files/);
    const second = prepare(A2_SCOPE_ID);
    sh(second.repo, ["git", "commit", "-q", "--allow-empty", "-m", "second C4 commit"]);
    second.head = sh(second.repo, ["git", "rev-parse", "HEAD"]).trim();
    expectRejected(currentGate(second), /direct child|fixed baseline/);
    const oversized = prepare(A2_SCOPE_ID);
    write(oversized.repo, GATE_SCRIPT, `${readFileSync(resolve(oversized.repo, GATE_SCRIPT), "utf8")}\n${"// C4 budget fence\n".repeat(600)}`);
    oversized.head = commit(oversized.repo, "exceed C4 budget");
    expectRejected(currentGate(oversized), /net additions budget exceeded/);
  });
  it("accepts only the E2-based six-file C5 scope correction", () => {
    const valid = prepare(A2_SCOPE_V5_ID), passed = gate(valid);
    assert.equal(passed.status, 0, passed.stderr);
    assert.match(passed.stdout, /RP-02B2a2-G0-C5 package gate passed: files=6/);
    assert.equal(valid.base, A2_SCOPE_V5_BASELINE);
    assert.equal(valid.base, "b22db8e15eb648220e6c8cfab1829ed184ab59da");
    assert.equal(sh(valid.repo, ["git", "rev-parse", `${valid.head}^`]).trim(), A2_SCOPE_V5_BASELINE);
    const actual = stats(valid.repo, valid.base);
    assert.equal(actual.files, 6);
    assert.ok(actual.net <= 900, `C5 net additions ${actual.net} exceed 900`);
    for (const missing of select(A2_SCOPE_V5_ID)) {
      const reduced = select(A2_SCOPE_V5_ID).filter((file) => file !== missing);
      const candidate = missing === A2_SCOPE_V5_ADR
        ? prepare(A2_SCOPE_V5_ID, reduced, { includeAdr: false })
        : prepare(A2_SCOPE_V5_ID, reduced);
      expectRejected(currentGate(candidate), /requires exactly the 6 frozen manifest files|requires exactly one changed ADR|unsupported ADR/);
    }
    write(valid.repo, "outside/c5.txt", "outside manifest\n");
    valid.head = commit(valid.repo, "expand C5 manifest");
    expectRejected(currentGate(valid), /manifest violation|requires exactly the 6 frozen manifest files/);
    const second = prepare(A2_SCOPE_V5_ID);
    sh(second.repo, ["git", "commit", "-q", "--allow-empty", "-m", "second C5 commit"]);
    second.head = sh(second.repo, ["git", "rev-parse", "HEAD"]).trim();
    expectRejected(currentGate(second), /direct child|fixed baseline/);
    const oversized = prepare(A2_SCOPE_V5_ID);
    write(oversized.repo, GATE_SCRIPT, `${readFileSync(resolve(oversized.repo, GATE_SCRIPT), "utf8")}\n${"// C5 budget fence\n".repeat(1000)}`);
    oversized.head = commit(oversized.repo, "exceed C5 budget");
    expectRejected(currentGate(oversized), /net additions budget exceeded/);
  });
  it("requires all three evidence receipt paths in RP-01A and RP-01B push and PR triggers", async () => {
    const cases = [];
    for (const workflowPath of [".github/workflows/rp01a-e2e.yml", ".github/workflows/rp01b-dom.yml"]) {
      for (const event of ["push", "pull_request"]) {
        for (const evidencePath of EVIDENCE_RECEIPT_PATHS) {
          cases.push([
            mutateA2ScopeV5CandidateFile(
              workflowPath,
              (text) => mutateWorkflowEventPath(text, event, evidencePath),
            ),
            /must include exact evidence trigger|may add only the three exact evidence receipt triggers/,
          ]);
        }
      }
      cases.push([
        mutateA2ScopeV5CandidateFile(
          workflowPath,
          (text) => mutateWorkflowEventPath(text, "push", EVIDENCE_RECEIPT_PATHS[0], `      - '${EVIDENCE_RECEIPT_PATHS[0]}'\n      - '${EVIDENCE_RECEIPT_PATHS[0]}'`),
        ),
        /must include exact evidence trigger|may add only the three exact evidence receipt triggers/,
      ]);
      cases.push([
        mutateA2ScopeV5CandidateFile(
          workflowPath,
          (text) => mutateWorkflowEventPath(text, "pull_request", EVIDENCE_RECEIPT_PATHS[2], "      - 'docs/reviews/**'"),
        ),
        /must include exact evidence trigger|may add only the three exact evidence receipt triggers/,
      ]);
    }
    await mapWithConcurrency(cases, 6, async ([item, pattern]) => {
      expectRejected(await gateAsync(item), pattern);
    });
  });
  it("requires RP-01C to add only the C5 ADR trigger and exact timeout correction", async () => {
    const cases = [
      [
        mutateA2ScopeV5CandidateFile(
          ".github/workflows/rp01c-fixtures.yml",
          (text) => text.replace(`      - '${A2_SCOPE_V5_ADR}'\n`, ""),
        ),
        /must include the C5 ADR trigger exactly once|requires exactly the 6 frozen manifest files/,
      ],
      [
        mutateA2ScopeV5CandidateFile(
          ".github/workflows/rp01c-fixtures.yml",
          (text) => text.replace(`      - '${A2_SCOPE_V5_ADR}'\n`, `      - '${A2_SCOPE_V5_ADR}'\n      - '${A2_SCOPE_V5_ADR}'\n`),
        ),
        /must include the C5 ADR trigger exactly once/,
      ],
      [
        mutateA2ScopeV5CandidateFile(
          ".github/workflows/rp01c-fixtures.yml",
          (text) => text.replace(`      - '${A2_SCOPE_V5_ADR}'`, "      - 'docs/adr/**'"),
        ),
        /must include the C5 ADR trigger exactly once|may add only the C5 ADR trigger/,
      ],
    ];
    for (const timeout of ["20", "46"]) {
      cases.push([
        mutateA2ScopeV5CandidateFile(
          ".github/workflows/rp01c-fixtures.yml",
          (text) => text.replace("    timeout-minutes: 45", `    timeout-minutes: ${timeout}`),
        ),
        /must raise the RP-01C timeout exactly from 20 to 45 minutes|workflow job runner or timeout mismatch/,
      ]);
    }
    await mapWithConcurrency(cases, 5, async ([item, pattern]) => {
      expectRejected(await gateAsync(item), pattern);
    });
  });
  it("accepts the exact A2 v5 22-file manifest with RP-01C and rejects a 23rd file", () => {
    const accepted = prepare("RP-02B2a2", MANIFESTS["RP-02B2a2"]), passed = gate(accepted);
    assert.equal(MANIFESTS["RP-02B2a2"].length, 22);
    assert.ok(MANIFESTS["RP-02B2a2"].includes("apps/api/test/rp02a/rp02a.test.ts"));
    assert.ok(MANIFESTS["RP-02B2a2"].includes("apps/api/test/rp01c/fixtureFactory.test.ts"));
    assert.equal(BUSINESS_PREDECESSOR["RP-02B2a2"], A2_SCOPE_V5_ID);
    assert.equal(accepted.gateSource, accepted.base);
    assert.equal(sh(accepted.repo, ["git", "rev-parse", `${accepted.base}^`]).trim(), A2_SCOPE_V5_BASELINE);
    assert.match(B2A2_SCRIPTS["test:rp02b2a2"], /npm run test:rp01c/);
    assert.equal(passed.status, 0, passed.stderr);
    write(accepted.repo, "apps/api/test/rp02b2a/outside-scope.test.ts", "outside scope\n");
    accepted.head = commit(accepted.repo, "add 23rd A2 file");
    expectRejected(gate(accepted), /manifest violation|file budget exceeded/);
  });
  it("rejects the historical A2 v4 21/3900 contract under C5", () => {
    const item = prepare("RP-02B2a2", MANIFESTS["RP-02B2a2"]), adrPath = ORACLE["RP-02B2a2"][1];
    const historical = readFileSync(resolve(item.repo, adrPath), "utf8")
      .replace("manifest_id: RP-02B2a2-v5", "manifest_id: RP-02B2a2-v4")
      .replace("hard_max_files: 22", "hard_max_files: 21");
    write(item.repo, adrPath, historical);
    item.head = commit(item.repo, "restore historical A2 v4 budget");
    expectRejected(gate(item), /manifest_id mismatch|hard_max_files mismatch/);
  });
  it("rejects historical C3 as the direct A2 gate source", () => {
    const path = repo(ACCEPTED_G0_C3_SHA);
    sh(path, ["git", "checkout", ACCEPTED_G0_C3_SHA, "--", GATE_SCRIPT]);
    const head = addMinimalB2a2Candidate(path, ACCEPTED_G0_C3_SHA);
    expectRejected(currentGate({
      repo: path,
      base: ACCEPTED_G0_C3_SHA,
      head,
      gateSource: ACCEPTED_G0_C3_SHA,
      g0EvidenceSha: A2_SCOPE_BASELINE,
      authorizedPackageId: "RP-02B2a2",
      authorizedPredecessorSha: ACCEPTED_G0_C3_SHA,
    }), /requires accepted G0 package RP-02B2a2-G0-C5/);
  });
});
