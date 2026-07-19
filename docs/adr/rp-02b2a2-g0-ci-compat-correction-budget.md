# RP-02B2a2 G0 CI compatibility correction budget

status: ready
package_id: RP-02B2a2-G0-C1
manifest_id: RP-02B2a2-G0-C1-v3
baseline_sha: 59cedaf7150029fcbde03d2779662659727e8b4e
hard_max_files: 14
hard_max_net_additions: 700
actual_files: 14
actual_net_additions: 441
exceeded_budget: false
owner: G0-CI-correction

## Decision

This is an independent governance correction, not an A2 business package. It freezes trusted admission candidate/source identity separation, explicit in-memory E2E actor injection, correction-only bootstrap range authorization, and reusable package-gate fixtures without reducing the negative matrix.

The final amended package is frozen to exactly fourteen manifest files. The added scope is limited to the RP-01B main-push path anchors, governance main-push branch binding, acceptance-matrix synchronization required for the four-route E1 evidence chain, and synchronization of the two original E1/A2 authority ADRs with the already frozen production gate. G0-C1 rejects both files outside the manifest and any candidate missing one of the fourteen frozen files. The `14 / 700` hard ceiling does not authorize any unnamed fifteenth file; any manifest or budget change requires an ADR revision before admission. Final diff counts and the non-concurrent regression count are recalculated from the amended commit before admission; local timing is not used as remote timeout evidence.

The bootstrap resolver may prefer `<59cedaf>..<candidate>` over stale repository A2 variables only when `candidate` independently passes the complete G0-C1 direct-child, ADR, exact-manifest, budget, and workflow-contract checks. A new ref must also be marked created. A force-with-lease replacement is accepted only when both the remote-before and replacement-after commits independently pass that same G0-C1 validation, including parsing the RP-01C workflow from each selected commit rather than the current checkout. No bootstrap path applies to A2-A5, evidence publication, arbitrary descendants, malformed correction commits, or caller-selected trusted admission.

The sibling E1 evidence budget is `3 files / additions <= 64 / deletions <= 48 / net additions <= 64`. The deletion ceiling is intentionally 48 because the current main baseline already contains the prior nine-field evidence sets in all three documents: migrating five stale identity fields per document plus the status/event/table lines cannot fit a 16-line deletion ceiling. This does not broaden scope: exact files, exact nine-field sets, unique sections, authorization wording, topology, and remote-run identity remain independently enforced.

The corrected G0 commit must land and publish fresh remote E1 evidence before A2 is reauthorized. Existing A2 authorization receipts do not authorize a candidate rooted at this correction. A2-v3 is separately frozen at 20 exact files and `20 / 3,250`; its current candidate `934d380` reports 3,627 additions, 395 deletions, and 3,232 net additions, and its own ADR remains responsible for exact actual counts after migration to accepted G0-C1.
