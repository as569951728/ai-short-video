# RP-02B2a2 Authoritative Claim And Pre-provider Gate 预算 ADR

status: ready
package_id: RP-02B2a2
manifest_id: RP-02B2a2-v1
baseline_sha: f27442d159d7f9d6ef273128797be6085bbd8f9d
hard_max_files: 18
hard_max_net_additions: 1900
exceeded_budget: false
actual_files: 18
actual_net_additions: 1865
split_reason: Trusted actor, canonical envelope, authoritative reload, and the provider-before stale oracle form one fail-closed capability and must be independently verified before lease execution.
owner: MC
valid_until: 2026-08-31

硬预算为 `18 files / 1,900 net additions`。本次实现绑定已验证 G0 基线并记录真实累计差异。任何 authority 缺失、跨租户或变化都必须在 provider 前零副作用失败。

本 ADR 不允许正常 leased provider、finalize、HTTP 202、Admin transport、真实 DB/provider/media 或 E6。

## A2 测试矩阵

- authority 竞态固定为 `15 actions x 3 phases x 2 mutations = 90 cases`；每个 action 独立注册 missing/changed 与 pre-claim/post-first-read/post-claim 用例，不接受共享模板只断言总数。
- 同一 15-action fixture 逐项验证 HTTP `200`、稳定的三次 authority snapshot、action/object/tenant/novel 绑定、`authoritySnapshotHash` 与 authoritative provider projection hash。
- 每个 action 另有隔离 missing-authority fixture，逐字段断言 `provider/task/intent/event/asset/receipt/current/operation-log/child = 0`；缺少 required source refs 的新任务同样在 authority/provider/claim 前 fail closed。
- 回归项覆盖 stale replay、同 actor legacy raw-token replay、未知 legacy envelope、同 key 跨 user、同 key 双 tenant、可信 resolver 与伪造 header/body 隔离。

## 冻结命令

- `npm run test:rp02b2a2:env-probe`：验证 production/mock 环境及数据库、模型密钥、deployment actor 清空。
- `npm run test:rp02b2a2:core`：构建 shared、生成 Prisma client，并运行 A2 authority 矩阵与 `novelRoutes.test.ts` 回归。
- `npm run test:rp02b2a2`：先完整回归 A1/B2a1，再运行 A2 core；三条命令继续受 `package.json` 的固定 env 清理合同约束。
