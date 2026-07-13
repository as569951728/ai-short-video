# RP-02B2a2 Authoritative Claim And Pre-provider Gate 预算 ADR

status: template_not_authorized
package_id: RP-02B2a2
manifest_id: RP-02B2a2-v1
baseline_sha: not_authorized
hard_max_files: 15
hard_max_net_additions: 1900
exceeded_budget: package_specific_budget
actual_files: 0
actual_net_additions: 0
split_reason: Trusted actor, canonical envelope, authoritative reload, and the provider-before stale oracle form one fail-closed capability and must be independently verified before lease execution.
owner: MC
valid_until: 2026-08-31

硬预算为 `15 files / 1,900 net additions`。授权前 `baseline_sha` 保持 `not_authorized`；实现提交必须填入前一 clean commit并更新真实计数。任何 authority 缺失、跨租户或变化都必须在 provider 前零副作用失败。

本 ADR 不允许正常 leased provider、finalize、HTTP 202、Admin transport、真实 DB/provider/media 或 E6。
