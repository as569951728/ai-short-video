# RP-02B2a2 post-merge range correction budget

status: ready
package_id: RP-02B2a2-PM-C1
manifest_id: RP-02B2a2-PM-C1-v1
baseline_sha: dc193dbbd3ac1970f571fd618f12902a4033994c
hard_max_files: 5
hard_max_net_additions: 1900
actual_files: 5
actual_net_additions: 304
exceeded_budget: false
split_reason: Separate admitted candidate analysis from the delivered squash range and preserve fail-closed replay evidence.
owner: main-control
valid_until: 2026-08-31

## Decision

The package gate must keep two independently verified ranges:

- the authorization range binds the repository-authorized predecessor to the exact admitted candidate SHA, tree, and manifest digest;
- the delivery range binds the default-branch event base to a single-parent squash result whose changed paths and path descriptors exactly match the admitted candidate.

Manual replay checks out the current trusted default-branch gate while treating the requested base and head only as audited data. Missing receipts, non-main push delivery, sibling edits to candidate-owned paths, extra paths, content drift, force pushes, and multi-parent delivery fail before package tests execute.
