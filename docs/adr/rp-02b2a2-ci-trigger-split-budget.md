# RP-02B2a2 CI trigger split budget

status: ready
package_id: RP-02B2a2-PM-C3
manifest_id: RP-02B2a2-PM-C3-v1
baseline_sha: 0ff9107bbfbf95983ae8c21391754520f4374711
hard_max_files: 4
hard_max_net_additions: 1200
actual_files: 4
actual_net_additions: 69
exceeded_budget: false
split_reason: Separate pull request validation from main-branch delivery checks without weakening either gate.
owner: main-control
valid_until: 2026-08-31

## Decision

RP-01C validates pull request candidates against the merge base supplied by
GitHub. Push delivery remains restricted to `main` and keeps the existing
repository-controlled authorization and replay receipts.

The required `rp01c-fixtures` context remains unchanged. Feature branch pushes
no longer invoke a delivery-only gate, while pull requests still execute the
same workflow contract and selected package tests before merge.

This correction does not change package authorization, accepted evidence,
candidate manifests, or business behavior.
