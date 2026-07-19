# RP-02B2a2 G0 A2 scope correction budget

status: ready
package_id: RP-02B2a2-G0-C4
manifest_id: RP-02B2a2-G0-C4-v1
baseline_sha: f243595d32f555f1f98162f2f9ddebce0a1f8528
hard_max_files: 4
hard_max_net_additions: 500
exceeded_budget: false
actual_files: 4
actual_net_additions: 140
owner: G0-A2-scope-correction

## Decision

This governance-only correction supersedes the historical A2 v3 `20 files / 3,250 net additions` template with the bounded A2 v4 `21 files / 3,900 net additions` contract. The only added manifest path is `apps/api/test/rp02a/rp02a.test.ts`; the 650-line net budget increase is reserved for the authority TOCTOU dispatch/finalize fence and its negative tests.

C4 is the only valid gate source and direct predecessor for A2. C3 remains immutable historical evidence but cannot directly admit A2. C4 must be one atomic direct child of accepted E1 `f243595d32f555f1f98162f2f9ddebce0a1f8528`, and that E1 must remain the direct child of accepted C3 `81f567d4fb61765c9a5d407dae04011d08d5aa19`.

The four-file C4 manifest is exact: the RP-01C workflow trigger contract, the production package gate, its independent negative oracle, and this ADR. The existing RP-01C push path list must include this C4 ADR; its `workflow_dispatch + push` event surface and main-push evidence receipt contract remain unchanged. C4 does not publish evidence. A fresh E1 receipt must be a separate direct child of C4 before A2 admission.

This correction changes no business code, provider behavior, database behavior, trusted workflow permissions, remote-run evidence contract, media processing, export, or publication authorization.
