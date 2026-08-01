# RMD-GOV-STATUS-001 回归关闭记录

状态：implemented_pending_remote_verification

日期：2026-08-01

## 1. 回归

PR #56 已完成 E3 closeout、PR #57 已完成 RP-01C candidate/delivery 触发拆分，但主控状态仍保留“closeout 待提交”的旧动作；问题总账更新时间滞后，并把仅用于正式关闭计数的 `9/42` 转换成项目完成百分比。

这属于 `RMD-GOV-STATUS-001` 的同根回归，不创建重复问题 ID。

## 2. 修复

- 新增 `docs/remediation/result-oriented-progress-contract.md`，把总账关闭、研发交付、独立验收和用户结果分开。
- 新增 `docs/remediation/execution-scoreboard.json`，投影当前原始计数、停工阈值和唯一决策。
- 新增 `docs/remediation/execution-flow-events.json`，记录最近一次总账关闭后的合并 PR；门禁从该事件源复算停工计数，并与追加式事件账交叉校验。
- 新增 `scripts/remediation-progress-gate.mjs`，从 issue ledger 复算问题与用户结果、校验汇总表，并校验主控状态和执行方案。
- `test:governance` 纳入进度门禁回归；过期 closeout、百分比进度、快照漂移和达到停工阈值仍有活动实现包都会失败。
- 事件账补记 PR #55/#56/#57，并把瞬时本地端口状态移出版本化事实。

## 3. 固定证据

| 证据 | 结果 |
| --- | --- |
| implementation candidate SHA | `f27aa765b9447e55d42659ac32d343ffd1e123c9` |
| implementation candidate tree | `c0b3260809cbf8da70a977fb0b3e0fa0de55c828` |
| `npm run governance:progress` | passed；ledger 43、closed 9、PB 0/7、RB 0/12、mode execution_reset |
| `npm run test:governance` | 29/29 passed；覆盖删除 PR、伪造 closure、交换 PR/SHA、活动包、百分比、汇总和用户结果篡改 |
| `git diff --check` | passed |
| independent QUALITY | 原治理候选 APPROVED；本轮 CI/typecheck correction 首轮发现 frozen G0-E1 marker fallback P1，修复后复验 APPROVED，P0/P1/P2 = 0/0/0 |
| remote required checks | PR #58：governance/admin-dom/backend-e2e passed；rp01c-fixtures failed before tests because ordinary governance diff was misclassified as frozen RP-02B2a2 package |
| trusted admission | failed as non-required side check because every PR is treated as an RP-02B2a authorized candidate |
| root `npm run typecheck` | 原 baseline 的 20 个 API 错误来自隔离工作树缺少本地依赖后向上解析父工作树旧 workspace 链接；本工作树执行 `npm ci` 后，workspace 链接解析到本工作树，shared/admin/api 全部通过；详见 `RMD-GOV-TYPECHECK-001` 关闭记录 |

## 4. 边界

- 本记录不增加总账关闭数，只重新证明既有治理问题在回归修复后满足关闭条件。
- 本记录不证明任何 PB/RB 问题关闭，不证明小说、视频、真实 MySQL、真实 provider 或媒体链路。
- 共享工作树的 15 条未提交状态已完成只读归因：2 条 UI 意图保留待独立迁移，13 条旧任务平台草案不得迁移；本包不修改或清理原工作树。

## 5. 结论

固定实现候选和独立 QUALITY 已满足；根级 typecheck 假阻塞已经校正，CI 分流修复也已进入当前候选。`RMD-GOV-STATUS-001` 仍需等待 PR #58 的远端 required checks 全绿后才能重新关闭，不得用本地门禁替代远端证据。
