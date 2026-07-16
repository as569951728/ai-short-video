# RP-02B2a3 Lease Phase CAS And Existing Retry Child Fence 预算 ADR

status: template_not_authorized
package_id: RP-02B2a3
manifest_id: RP-02B2a3-v1
baseline_sha: not_authorized
hard_max_files: 14
hard_max_net_additions: 1800
exceeded_budget: package_specific_budget
actual_files: 0
actual_net_additions: 0
split_reason: Expected-phase CAS, attempt creation timing, atomic fail-safe terminal state, and the historical retry child fence share the same lease fence and side-effect oracle; the public retry freeze remains owned by A1 and is regression-only here.
owner: MC
valid_until: 2026-08-31

硬预算为 `14 files / 1,800 net additions`。授权前 `baseline_sha` 保持 `not_authorized`；实现提交必须填入前一 clean commit并更新真实计数，持续回归 A1 公开 retry freeze，并证明历史 retry child 在 provider 前原子终态和八类零副作用。

安全中间态固定为：正常 leased action `provider=0`。本 ADR 不允许在 B2a4/B2a5 finalize 就绪前启用正常 provider，也不授权 HTTP 202、Admin transport、真实 DB/provider/media 或 E6。
