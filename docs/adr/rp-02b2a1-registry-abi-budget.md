# RP-02B2a1 Registry, Strict ABI And Public Retry Freeze 预算 ADR

status: template_not_authorized
package_id: RP-02B2a1
manifest_id: RP-02B2a1-v1
baseline_sha: not_authorized
hard_max_files: 18
hard_max_net_additions: 1900
exceeded_budget: package_specific_budget
actual_files: 0
actual_net_additions: 0
split_reason: Registry, strict provider ABI, public retry freeze, exact call-site tests, and the reusable workflow package gate must land together so neither user-visible retry nor governance can bypass the same contract.
owner: MC
valid_until: 2026-08-31

硬预算为 `18 files / 1,900 net additions`。开工授权前不得改为 `ready`，`baseline_sha` 必须保持 `not_authorized`。实现提交必须在同一 diff 填入前一 clean commit、更新真实计数，并由生产 workflow 通过 PR merge-base、push before/head 或 manual 显式 SHA 调用真实 package gate 验证。

本 ADR 不授权 authority claim、lease provider execution、finalize、HTTP 202、Admin transport、真实 DB/provider/media 或 E6。公开 retry freeze 是本包发布完整性的一部分，不表示真实 retry 已实现。
