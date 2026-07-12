# AIShortvideo 主控事件账本

状态：active

本文件记录主控事件流，避免把历史过程继续堆叠到 `docs/reviews/main-control-status.md`。当前状态仍以 `docs/reviews/main-control-status.md` 为入口，整改问题状态仍以 `docs/remediation/issue-ledger.md` 为唯一事实源。

## 规则

1. 本账本只追加事件，不直接改变问题状态。
2. 每条事件必须有事件类型、来源、影响范围、证据文件和主控裁决。
3. 旧巡检或旧验收只能作为证据引用；不得凭旧文档覆盖当前状态。
4. 如事件需要关闭整改问题，必须另行生成 `docs/reviews/remediation-<issue-id>-closure-<yyyy-mm-dd>.md` 并由 MC 更新 issue ledger。
5. 如事件发现新缺陷，必须关联现有 issue；只有根因和关闭条件不同，才由 MC 新建唯一 issue id。

## 事件格式

```text
event_id:
occurred_at:
event_type: dispatch | dev_result | test_result | product_review | quality_review | mc_decision | status_update | regression
source_thread:
package_id:
issue_ids:
acceptance_ids:
summary:
evidence:
mc_decision:
next_action:
```

## 事件

### MCE-20260712-RP00A-DISPATCH

```text
event_id: MCE-20260712-RP00A-DISPATCH
occurred_at: 2026-07-12 20:15 CST
event_type: dispatch
source_thread: 019ed4a5-a2f5-7d13-86d0-0c28381af555
package_id: RP-00A
issue_ids: RMD-TEST-EVIDENCE-001, RMD-GOV-STATUS-001, RMD-GOV-STAGE-001
acceptance_ids: TEST-EVIDENCE-LEVEL-01, GOV-STATUS-01, GOV-STAGE-01
summary: 主控正式派发状态与证据基线治理包，只允许治理/文档整改，不改业务代码，不处理 apps/api/tsconfig.testrun.json。
evidence: docs/remediation/issue-ledger.md; docs/remediation/remediation-program.md; docs/remediation/acceptance-matrix.md
mc_decision: 允许研发补齐状态单源、验收证据格式、整改冻结期口径、文档一致性检查和关闭证据草稿；不得自行改 issue ledger 为 closed。
next_action: DEV 完成 RP-00A 文档整改后，MC 派 TEST 按 TEST-EVIDENCE-LEVEL-01/GOV-STATUS-01/GOV-STAGE-01 独立验收。
```
