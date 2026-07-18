# RP-02B2a2 G0 CI compatibility correction budget

status: ready
package_id: RP-02B2a2-G0-C1
manifest_id: RP-02B2a2-G0-C1-v1
baseline_sha: 59cedaf7150029fcbde03d2779662659727e8b4e
hard_max_files: 10
hard_max_net_additions: 700
actual_files: 9
actual_net_additions: 264
exceeded_budget: false
owner: G0-CI-correction

## Decision

This is an independent governance correction, not an A2 business package. It freezes trusted admission candidate/source identity separation, explicit in-memory E2E actor injection, correction-only bootstrap range authorization, and reusable package-gate fixtures without reducing the negative matrix.

The final amended package remains exactly nine manifest files with 326 additions, 62 deletions, and 264 net additions from the fixed baseline. The `10 / 700` hard ceiling leaves review contingency but does not authorize an unnamed tenth file; any manifest or budget change requires an ADR revision before admission. The non-concurrent fixed regression snapshot passed 49/49 in 554.02 seconds.

The bootstrap resolver may prefer `<59cedaf>..<candidate>` over stale repository A2 variables only when `candidate` independently passes the complete G0-C1 direct-child, ADR, exact-manifest, budget, and workflow-contract checks. A new ref must also be marked created. A force-with-lease replacement is accepted only when both the remote-before and replacement-after commits independently pass that same G0-C1 validation. No bootstrap path applies to A2-A5, evidence publication, arbitrary descendants, malformed correction commits, or caller-selected trusted admission.

The corrected G0 commit must land and publish fresh remote E1 evidence before A2 is reauthorized. Existing A2 authorization receipts do not authorize a candidate rooted at this correction. A2-v3 is separately frozen at 20 exact files and `20 / 3,250`; its current candidate `07b04c5` reports 3,196 net additions, and its own ADR remains responsible for exact actual counts after migration to accepted G0-C1.
