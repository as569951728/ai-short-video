# RMD-GOV-STATUS-001 回归关闭记录

状态：pending_independent_review

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
| candidate SHA | pending commit |
| candidate tree | pending commit |
| `npm run governance:progress` | second candidate passed；ledger 43、closed 8、PB 0/7、RB 0/12、mode execution_reset |
| `npm run test:governance` | 29/29 passed；覆盖删除 PR、伪造 closure、交换 PR/SHA、活动包、百分比、汇总和用户结果篡改 |
| `git diff --check` | passed |
| independent QUALITY | APPROVED；P0/P1/P2 = 0/0/0；三轮复核关闭首轮 4 P1 与二轮 1 P1/1 P2 |
| remote required checks | pending |
| root `npm run typecheck` | baseline failed in API with 20 TS errors；已独立登记 `RMD-GOV-TYPECHECK-001=open`，不冒充本包通过 |

## 4. 边界

- 本记录不增加总账关闭数，只重新证明既有治理问题在回归修复后满足关闭条件。
- 本记录不证明任何 PB/RB 问题关闭，不证明小说、视频、真实 MySQL、真实 provider 或媒体链路。
- 共享工作树的 15 条未提交状态已完成只读归因：2 条 UI 意图保留待独立迁移，13 条旧任务平台草案不得迁移；本包不修改或清理原工作树。

## 5. 结论

等待固定候选、独立 QUALITY 和远程 required checks 后裁决。
