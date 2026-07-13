# RP-02B2a 执行核心单包预算 ADR

status: superseded_before_commit
package_id: RP-02B2a
exceeded_budget: changed_files
actual_files: 23
actual_net_additions: 2000
split_reason: Execution core, existing retry route regression, and its remote CI are one atomic acceptance unit; splitting either verification path would permit an unverified retry semantic or dispatcher delivery.
owner: MC
valid_until: 2026-08-31

本文件曾是 `RP-02B2a` 原 23/2000 单包的同 diff ADR 模板。正式生产链复核证明单包无法在预算内诚实完成，MC 已撤销原授权；当前 13-path partial diff 不得提交，本 ADR 不得作为任何后续实现的治理 override。

后续实现只允许使用 `rp-02b2a1-*` 至 `rp-02b2a5-*` 的独立 ADR。任何流程把本文件重新改为 `ready`、传给 package gate 或用其 23/2000 计数放行，都必须失败。

以下内容仅是已撤销单包的历史记录，不是当前允许写集：当时曾计划加入 retry route 回归、远程 workflow 和本 ADR。该计划未通过生产链复核，任何工具或人员不得从这些历史文字恢复授权。

本文件只用于证明旧授权已失效。不得借此放行任何代码、B2b/B2c/B3、HTTP 202、Admin transport、真实 DB/provider/media 或其他业务范围。
