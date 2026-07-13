# RP-02B2a5 Prisma Nine/Six Fenced Finalize And Closure 预算 ADR

status: template_not_authorized
package_id: RP-02B2a5
manifest_id: RP-02B2a5-v1
baseline_sha: not_authorized
hard_max_files: 10
hard_max_net_additions: 1900
exceeded_budget: package_specific_budget
actual_files: 0
actual_net_additions: 0
split_reason: Prisma transaction/CAS for nine supported actions, preclaim zero-provider fencing for six unsupported actions, and the final B2a composite gate must land as one closure candidate.
owner: MC
valid_until: 2026-08-31

硬预算为 `10 files / 1,900 net additions`。授权前 `baseline_sha` 保持 `not_authorized`；实现提交必须填入前一 clean commit并更新真实计数。E3 必须使用可注入 deterministic Prisma transaction/CAS fixture，而不是 prototype 静态函数或真实环境外推。

本 ADR 不授权真实 MySQL 行锁/事务时钟/P2002、多进程、真实 provider、HTTP 202、Admin transport、media 或 E6。
