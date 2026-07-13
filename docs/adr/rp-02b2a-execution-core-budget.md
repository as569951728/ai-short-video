# RP-02B2a 执行核心单包预算 ADR

status: template_pending_implementation_counts
package_id: RP-02B2a
exceeded_budget: changed_files
actual_files: 23
actual_net_additions: 2000
split_reason: Execution core, existing retry route regression, and its remote CI are one atomic acceptance unit; splitting either verification path would permit an unverified retry semantic or dispatcher delivery.
owner: MC
valid_until: 2026-08-31

本文件是 `RP-02B2a` 实现提交的同 diff ADR 模板。授权资产提交只冻结字段和理由，不构成对未来实际计数的提前批准。

研发在暂存实现前必须把 `status` 改为 `ready`，并把 `actual_files`、`actual_net_additions` 更新为相对授权基线的真实计数；若超过 `23 files / 2,000 net additions`，必须停工并由 MC 重新拆包裁决。实现 diff 必须实际修改本文件，否则不得作为治理放行证据。专属远程 workflow 必须按 PR/push 的同一 `BASE/HEAD` NUL-safe 发现并传入本 ADR，同时机器验证 `status: ready`；无参 budget、fallback diff、未传 ADR、非 ready 状态或计数不符都必须失败。

该 ADR 只允许以下不可分割增项：

1. `apps/api/src/modules/novels/novelRoutes.test.ts`：固定 provider-backed retry 投影、409 和零副作用回归。
2. `.github/workflows/rp01c-fixtures.yml`：让 B2a fixture 和 B2a0 Admin/DOM 回归在远程 clean checkout 可达。
3. 本 ADR 自身。

不得借此加入 B2b/B2c/B3、HTTP 202、Admin transport、真实 DB/provider/media 或其他业务范围。
