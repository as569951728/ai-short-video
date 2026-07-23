# RP-02B2a2 closeout policy correction budget

status: ready
package_id: RP-02B2a2-PM-C2
manifest_id: RP-02B2a2-PM-C2-v1
baseline_sha: 9f04986469a3e409b3ce887390e8830cbdfe9493
hard_max_files: 5
hard_max_net_additions: 1500
actual_files: 5
actual_net_additions: 483
exceeded_budget: false
split_reason: Land trusted closeout policy before evaluating the separately submitted A2 evidence package.
owner: main-control
valid_until: 2026-08-31

## Decision

RP-02B2a2 closeout uses two independently landed stages. This correction is the
trusted policy source and changes only the package gate, its frozen test oracle,
the RP-01C trigger, the trusted admission workflow, and this ADR. The later
`RP-02B2a2-E3` closeout package must be one direct child of the repository-owned
`RP02B2A_POLICY_SOURCE_SHA`, contain exactly the five frozen closeout documents,
and preserve the accepted candidate, delivered squash, manifest, trusted replay,
independent review, and open-boundary receipts.

`RP02B2A_POLICY_SOURCE_SHA` selects the code that is allowed to interpret closeout
evidence. `RP02B2A_GATE_SOURCE_SHA` remains the historical business authorization
root. A closeout package cannot mint G0 business evidence, cannot execute candidate
code, and cannot authorize RP-02B2a3 or later packages. Business A2-A5 admission
continues to require the existing gate source, G0 evidence, authorized package,
predecessor, candidate, tree, and manifest checks.

This correction does not authorize a real database, a paid model provider, real
media processing, export, publication, or data backfill. Those remain separately
gated even after A2 evidence closes.
