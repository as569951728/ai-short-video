# RP-02B2a2 G0 A2 scope v5 correction budget

status: ready
package_id: RP-02B2a2-G0-C5
manifest_id: RP-02B2a2-G0-C5-v1
baseline_sha: b22db8e15eb648220e6c8cfab1829ed184ab59da
hard_max_files: 6
hard_max_net_additions: 900
exceeded_budget: false
actual_files: 6
actual_net_additions: 424
owner: G0-A2-scope-v5-correction

## Exact manifest

The C5 manifest contains exactly these six files:

1. `.github/workflows/rp01a-e2e.yml`
2. `.github/workflows/rp01b-dom.yml`
3. `.github/workflows/rp01c-fixtures.yml`
4. `scripts/rp02b2a-package-gate.mjs`
5. `scripts/rp02b2a-package-gate.test.mjs`
6. `docs/adr/rp-02b2a2-g0-a2-scope-v5-correction-budget.md`

## Count receipt

The direct diff from baseline `b22db8e15eb648220e6c8cfab1829ed184ab59da` contains exactly the six manifest files above and 424 net additions. Both counts remain within the frozen 6-file / 900-line budget.

## Decision

This governance-only correction makes the three E3 evidence receipt documents observable by both RP-01A and RP-01B on `push` and `pull_request`, and makes this C5 ADR observable by the RP-01C `push` trigger. No other workflow event surface or path contract changes in this package.

The RP-01C job timeout is raised exactly from 20 to 45 minutes because the complete sequential fixture, package, E2E, governance, typecheck, build, Prisma, and budget matrix was cancelled by the former 20-minute ceiling. The C5 gate accepts only that timeout correction plus the C5 ADR trigger and rejects any other RP-01C workflow drift. Per-run immutable Git and workflow caches plus bounded concurrency for independent negative fixtures preserve all 63 scenarios; the final local regression passed 63/63 in 1698.37 seconds. The workflow remains mock-only with database and paid-provider credentials removed from the selected-package command.

C5 must be one atomic direct child of accepted E2 `b22db8e15eb648220e6c8cfab1829ed184ab59da`. Historical C1-C4 and E1-E2 governance artifacts remain immutable. C5 does not publish evidence and does not itself authorize A2; a separate fresh E3 receipt is required before A2 admission.

This correction changes no business code, provider behavior, database behavior, trusted workflow permissions, media processing, export, or publication authorization.
