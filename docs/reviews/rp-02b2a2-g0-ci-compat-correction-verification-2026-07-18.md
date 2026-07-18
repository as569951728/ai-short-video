# RP-02B2a2 G0 CI compatibility correction verification

## Scope

- Baseline: `59cedaf7150029fcbde03d2779662659727e8b4e`.
- No real database, provider, media, TTS, render, export, or publish calls. Independent RP-01A verification passed under production/mock and cleared secret/database env with artifact `output/playwright/rp-01a/rp01a-2026-07-18T06-17-40-110Z`; the first attempt only lacked the worktree dependency install, and `node_modules/` plus `output/` remain untracked.
- G0 and A2 remain separate auditable commits.

## Frozen corrections

1. `pull_request_target` compares Actions API `head_sha` with `PR_HEAD_SHA`; workflow source is independently bound by `workflow_ref`, fetched `WORKFLOW_SHA`, and byte comparison against the trusted gate source.
2. `rp01a-local-inmemory` alone injects a fixed test-only request actor; production routes remain fail-closed and do not trust tenant/user headers.
3. A push with zero `before` is accepted only when `github.event.created` is true and a complete repository-authorized package/predecessor tuple resolves to an ancestor of `after`.
4. The package-gate test matrix keeps all negative cases while cloning reusable prepared fixtures rather than recursively rebuilding the same G0/A2 chain for every case.
5. A correction bootstrap range exists only for an independently valid `RP-02B2a2-G0-C1` atomic direct child of `59cedaf7150029fcbde03d2779662659727e8b4e`. It validates the full ADR, exact manifest, budget and workflow contracts before ignoring stale A2 repository variables. Created-ref, direct push, PR and manual replay all resolve to the fixed baseline; force-with-lease replacement additionally requires both old and new heads to be independently valid correction siblings, with each sibling's RP-01C workflow parsed from that sibling commit.
6. Exact-manifest validation is bidirectional: files outside the frozen fourteen are rejected, and a negative matrix removes each required file in turn to prove that a reduced correction package cannot be admitted. The added files are limited to RP-01B `main` push path anchors, governance `main` push binding, acceptance-matrix synchronization, and the two original E1/A2 authority ADR synchronizations.
7. E1 parent-run receipts must identify `head_branch=main` in addition to workflow identity, event, head SHA, status and conclusion. The correction also restores a natural `main` push trigger for all four parent workflows; branch-only or path-filtered runs from a feature branch cannot satisfy E1.
8. E1 deletion budget is synchronized at 48 lines across code and contract. A measured compliant fixture needs 39 deletions because all three baseline documents already carry the prior five mutable identity fields and status sections; a 16-line ceiling would reject every legitimate migration. Exact 3-file scope, 64-line additions/net ceilings, nine-field whitelist and unique-section validation remain unchanged.

## Remote bootstrap model

- PR #32 was closed as superseded after its old candidate SHA became unreachable. PR #33 trusted-admission run `29645573593` is the same expected bootstrap false reject from the old default-branch workflow: its API `head_sha` is the candidate while its workflow source SHA is main, so the old equality comparison can never safely admit a correction candidate. Candidate workflow code cannot self-certify or rewrite that historical result.
- Explicit remote RP-01C dispatch run `29646147270` replayed `59cedaf7150029fcbde03d2779662659727e8b4e..61378677e18f00c6dec661a0520ed5f82073e890` under read-only permissions and passed the package command, workflow contract, RP-01C, RP-02A, API tests, backend E2E, governance, typecheck, API build, Prisma validate, diff check, and budget checks in about 3 minutes 55 seconds.
- The corrected branch must remain one amended direct-child commit. Any candidate SHA change is published on a fresh branch and PR so historical check identity is not reused. A force-with-lease replacement is not accepted as authoritative evidence merely because an earlier candidate was green.
- The existing default-branch RP-01C `workflow_dispatch` is the independent remote proof path: dispatch with explicit `base_sha=59cedaf7150029fcbde03d2779662659727e8b4e` and `head_sha=<amended-candidate>` checks out the explicit candidate under read-only permissions and cleared DB/provider/actor env. The candidate gate may validate the correction package, but it cannot grant authoritative A2 admission.
- The old trusted-admission red check remains visible and PR #33 remains unmerged. Under the stated constraints there is no honest way to make that old check green before a corrected workflow exists on the default branch; remote RP-01C green evidence is therefore necessary correction proof, not permission to merge red. A separately authorized one-time squash break-glass is still required after the final independent review; direct push and merge-commit paths remain prohibited.

## Timing evidence

- Historical accepted input: 47 cases, about 61 minutes total, up to 118 seconds for one case.
- Historical snapshots reached 48/48, 49/49 and 50/50 before the final main-push and E1 branch-binding review. Those counts are superseded for admission. The amended 14-file candidate must publish a fresh non-concurrent full matrix and fresh remote runs for its final SHA; historical run `29646147270` remains diagnostic only and cannot establish current remote timeout compliance.

## A2 reauthorization boundary

The frozen A2-v3 authorization contract is an exact 20-file manifest with a `20 / 3,250` ceiling. Current integrated candidate `934d380`, measured from provisional old G0 `01245feb51b50ec838cb405a67bcafd1b194eeae`, is 3,627 additions, 395 deletions, and 3,232 net additions. The manifest explicitly includes `apps/api/src/modules/tasks/routes/taskRoutes.ts` and `apps/api/test/rp02b2a/repository-authority-hardening.test.ts`; the exact core command runs the authority-claim, repository-authority-hardening, and synchronous route suites. The candidate reports 195/195 core tests plus typecheck green. It must be migrated onto accepted G0-C1, retain its own exact `actual_*` ADR values, and receive a new repository-controlled authorization receipt; neither the bootstrap resolver nor any pre-correction A2 receipt authorizes it.
