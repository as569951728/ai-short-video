# RP-02B2a2 G0 self-reference correction budget

status: ready
package_id: RP-02B2a2-G0-C2
manifest_id: RP-02B2a2-G0-C2-v1
baseline_sha: 9e0f5fcf30ef78b605f13465458ec19e84a9d8fa
hard_max_files: 5
hard_max_net_additions: 600
exceeded_budget: false
actual_files: 5
actual_net_additions: 527
owner: G0-test-layering-correction

## Decision

This governance-only correction removes a self-reference in the frozen G0-C1 test fixture without reducing predecessor coverage. The A2 composite command remains unchanged: it still runs the complete RP-02B2a1 package before A2 core tests. G0-C1 fixture files are read from the immutable accepted G0-C1 commit instead of the downstream candidate worktree, so an authorized A2 `status: ready` ADR cannot mutate the historical `template_not_authorized` fixture.

The admitted candidate checkout uses full history because the unchanged G0 negative matrix intentionally verifies fixed historical SHAs. The five-file manifest is exact: the RP-01C trigger workflow, trusted admission workflow, production package gate, independent gate oracle, and this ADR. C2 must be one atomic direct child of the recorded baseline, preserve the accepted G0-C1 lineage, and publish fresh sibling evidence before A2 is reauthorized.

This correction does not authorize A2-A5 business behavior, a real database, a paid model provider, real media processing, export, or publication.
