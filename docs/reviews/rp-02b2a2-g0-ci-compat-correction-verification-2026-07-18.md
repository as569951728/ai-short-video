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
5. A correction bootstrap range exists only for an independently valid `RP-02B2a2-G0-C1` atomic direct child of `59cedaf7150029fcbde03d2779662659727e8b4e`. It validates the full ADR, exact manifest, budget and workflow contracts before ignoring stale A2 repository variables. Created-ref, direct push, PR and manual replay all resolve to the fixed baseline; force-with-lease replacement additionally requires both old and new heads to be independently valid correction siblings.

## Remote bootstrap model

- PR #32 trusted-admission run `29638601104` is an expected bootstrap false reject from the old default-branch workflow: its API `head_sha` is the candidate while its workflow source SHA is main, so the old equality comparison can never safely admit a correction candidate. Candidate workflow code cannot self-certify or rewrite that historical result.
- RP-01C push run `29638568701` is an expected stale-authorization failure: repository variables still select A2 and predecessor `01245feb51b50ec838cb405a67bcafd1b194eeae`, so the old resolver analyzes a mixed G0-C1/A2 range.
- The corrected branch must remain one amended direct-child commit. Updating PR #32 with `git push --force-with-lease` is a branch replacement, not a force merge; the new resolver accepts it only if the remote-before and replacement-after commits each independently validate as G0-C1 siblings, then replays `59cedaf..replacement`.
- The existing default-branch RP-01C `workflow_dispatch` is the independent remote proof path: dispatch with explicit `base_sha=59cedaf7150029fcbde03d2779662659727e8b4e` and `head_sha=<amended-candidate>` checks out the explicit candidate under read-only permissions and cleared DB/provider/actor env. The candidate gate may validate the correction package, but it cannot grant authoritative A2 admission.
- The old trusted-admission red check remains visible and PR #32 remains unmerged. Under the stated constraints there is no honest way to make that old check green before a corrected workflow exists on the default branch; remote RP-01C green evidence is therefore necessary correction proof, not permission to merge red.

## Timing evidence

- Historical accepted input: 47 cases, about 61 minutes total, up to 118 seconds for one case.
- Original fixed-diff result `65873cd0be9ee2091a1d35894e691dafd0ceda71eb2bfd32c05aa7f2872e9482`: 48/48 passed in 641.99 seconds. Final non-concurrent bootstrap snapshot: 49/49 passed in 554.02 seconds (about 9 minutes 14 seconds, 6.6x faster / 85.0% lower wall time than the historical 61-minute suite); the preserved E1 topology matrix and the new correction bootstrap matrix remain below the 20-minute remote job limit.

## A2 reauthorization boundary

The frozen A2-v3 authorization contract is an exact 20-file manifest with a `20 / 3,250` ceiling. Current integrated candidate `07b04c5`, measured from provisional old G0 `01245feb51b50ec838cb405a67bcafd1b194eeae`, is 3,591 additions, 395 deletions, and 3,196 net additions. The manifest explicitly includes `apps/api/src/modules/tasks/routes/taskRoutes.ts` and `apps/api/test/rp02b2a/repository-authority-hardening.test.ts`; the exact core command runs the authority-claim, repository-authority-hardening, and synchronous route suites. The candidate reports 195/195 core tests plus typecheck green. It must be migrated onto accepted G0-C1, retain its own exact `actual_*` ADR values, and receive a new repository-controlled authorization receipt; neither the bootstrap resolver nor any pre-correction A2 receipt authorizes it.
