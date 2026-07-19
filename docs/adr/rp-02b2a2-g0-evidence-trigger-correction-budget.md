# RP-02B2a2 G0 evidence trigger correction budget

status: ready
package_id: RP-02B2a2-G0-C3
manifest_id: RP-02B2a2-G0-C3-v1
baseline_sha: e15b59b1eef9165501d534a183577617512df5d3
hard_max_files: 5
hard_max_net_additions: 500
exceeded_budget: false
actual_files: 5
actual_net_additions: 191
owner: G0-evidence-trigger-correction

## Decision

This governance-only correction makes the RP-01A parent run reachable for a governance package whose accepted `main` push would otherwise be excluded by path filters. RP-01A now observes changes to the package gate, trusted admission workflow, RP-01C workflow, and G0 correction ADRs. The existing E1 contract remains fail-closed: all four evidence runs must still be distinct `push` runs on the same accepted `main` parent SHA with `completed/success` conclusions.

The five-file manifest is exact: the RP-01A trigger workflow, RP-01C trigger workflow, production package gate, independent gate oracle, and this ADR. C3 must be one atomic direct child of the accepted C2 merge and publish fresh sibling E1 evidence before A2 can be reauthorized.

This correction does not authorize A2-A5 business behavior, a real database, a paid model provider, real media processing, export, or publication.
