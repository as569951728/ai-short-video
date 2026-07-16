# RP-02B2a4 InMemory Action-specific Fenced Finalize 预算 ADR

status: template_not_authorized
package_id: RP-02B2a4
manifest_id: RP-02B2a4-v1
baseline_sha: not_authorized
hard_max_files: 12
hard_max_net_additions: 1900
exceeded_budget: package_specific_budget
actual_files: 0
actual_net_additions: 0
split_reason: The second stale gate, action asset, canonical receipt, task terminal state, event, operation log, and five rollback fault points are one InMemory transactional acceptance unit.
owner: MC
valid_until: 2026-08-31

硬预算为 `12 files / 1,900 net additions`。授权前 `baseline_sha` 保持 `not_authorized`；实现提交必须填入前一 clean commit并更新真实计数，覆盖 15 action、repository capability、同步 HTTP 200 回归和五个事务故障点，并逐项证明八类副作用计数。

本 ADR 只证明 deterministic/InMemory E3，不授权 Prisma 生产能力、HTTP 202、Admin transport、真实 DB/provider/media 或 E6。
