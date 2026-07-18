# RP-02B2a2 Authoritative Claim And Pre-provider Gate 预算 ADR

status: template_not_authorized
package_id: RP-02B2a2
manifest_id: RP-02B2a2-v3
baseline_sha: not_authorized
hard_max_files: 20
hard_max_net_additions: 3250
exceeded_budget: package_specific_budget
actual_files: 0
actual_net_additions: 0
split_reason: Trusted actor, canonical envelope, authoritative reload, and the provider-before stale oracle form one fail-closed capability and must be independently verified before lease execution.
owner: MC
valid_until: 2026-08-31

G0-C1 v3 冻结的 A2 模板硬预算为 `20 files / 3,250 net additions`。授权前 `status=template_not_authorized`、`baseline_sha=not_authorized`、`actual_files=0`、`actual_net_additions=0` 必须保持不变；只有 accepted G0-C1、合法 sibling E1、独立 TEST/QUALITY 和新的 repository-controlled 授权收据同时成立后，MC 才能把模板实例化为实现 ADR，并回填 accepted G0-C1 clean commit 与真实计数。任何 authority 缺失、跨租户或变化都必须在 provider 前零副作用失败。

本 ADR 不允许正常 leased provider、finalize、HTTP 202、Admin transport、真实 DB/provider/media 或 E6。
