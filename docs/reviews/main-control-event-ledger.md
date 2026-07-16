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

### MCE-20260712-RP00A-DEV-RESULT

```text
event_id: MCE-20260712-RP00A-DEV-RESULT
occurred_at: 2026-07-12 20:19:02 CST
event_type: dev_result
source_thread: 019ed4ee-441a-7fa2-894d-393c7d4c527b
package_id: RP-00A
issue_ids: RMD-TEST-EVIDENCE-001, RMD-GOV-STATUS-001, RMD-GOV-STAGE-001
acceptance_ids: TEST-EVIDENCE-LEVEL-01, GOV-STATUS-01, GOV-STAGE-01
summary: DEV 完成 9 个 docs-only 文件，新增状态事件账本、一致性清单和三份待验收关闭记录；未改业务代码或真实环境。
evidence: implementation commit 056f60a; git diff --check passed
mc_decision: 接受研发交付并派发独立测试、产品与质量定点复核。
next_action: 等待三方结论。
```

### MCE-20260712-RP00A-TEST-RESULT

```text
event_id: MCE-20260712-RP00A-TEST-RESULT
occurred_at: 2026-07-12 20:33:12 CST
event_type: test_result
source_thread: 019ed4ee-b33b-7621-b71c-3aa3d9e7b26e
package_id: RP-00A
issue_ids: RMD-TEST-EVIDENCE-001, RMD-GOV-STATUS-001, RMD-GOV-STAGE-001
acceptance_ids: TEST-EVIDENCE-LEVEL-01, GOV-STATUS-01, GOV-STAGE-01
summary: TEST 于 2026-07-12 20:30:05 CST 派发/启动，三个 acceptance id 全部 approved；写集为 9 个治理文档，三项未提前 closed，真实 DB/provider/media 未运行。
evidence: TEST thread formal result; git status/diff/rg consistency checks; git diff --check passed
mc_decision: TEST 门禁通过。
next_action: 等待 PRODUCT/QUALITY 复核与远程证据。
```

### MCE-20260712-RP00A-PRODUCT-REVIEW

```text
event_id: MCE-20260712-RP00A-PRODUCT-REVIEW
occurred_at: 2026-07-12 20:46 CST
event_type: product_review
source_thread: 019f4aeb-773c-7821-876f-3a5c8e13a130
package_id: RP-00A
issue_ids: RMD-TEST-EVIDENCE-001, RMD-GOV-STATUS-001, RMD-GOV-STAGE-001
acceptance_ids: TEST-EVIDENCE-LEVEL-01, GOV-STATUS-01, GOV-STAGE-01
summary: PRODUCT approved；用户可辨认冻结期、当前动作和重开条件，实现完成与正式关闭区分清楚。
evidence: PRODUCT review approved
mc_decision: 产品复核门禁通过。
next_action: 等待 QUALITY 复核与远程证据。
```

### MCE-20260712-RP00A-QUALITY-REVIEW

```text
event_id: MCE-20260712-RP00A-QUALITY-REVIEW
occurred_at: 2026-07-12 20:46 CST
event_type: quality_review
source_thread: 019edb3a-a972-75e2-bbb1-774b5ddb6d88
package_id: RP-00A
issue_ids: RMD-TEST-EVIDENCE-001, RMD-GOV-STATUS-001, RMD-GOV-STAGE-001
acceptance_ids: TEST-EVIDENCE-LEVEL-01, GOV-STATUS-01, GOV-STAGE-01
summary: QUALITY approved；状态单源、证据门禁、Git 写集和真实环境边界无 P0/P1。
evidence: QUALITY review approved; git diff --check passed
mc_decision: 质量复核门禁通过。
next_action: 推送实现基线并由 MC 最终裁决。
```

### MCE-20260712-RP00A-MC-CLOSE

```text
event_id: MCE-20260712-RP00A-MC-CLOSE
occurred_at: 2026-07-12 20:46 CST
event_type: mc_decision
source_thread: 019ed4a5-a2f5-7d13-86d0-0c28381af555
package_id: RP-00A
issue_ids: RMD-TEST-EVIDENCE-001, RMD-GOV-STATUS-001, RMD-GOV-STAGE-001
acceptance_ids: TEST-EVIDENCE-LEVEL-01, GOV-STATUS-01, GOV-STAGE-01
summary: 实现基线 056f60a 已推送；TEST/PRODUCT/QUALITY 全部 approved；MC 将三项 QG 更新为 closed。
evidence: docs/reviews/remediation-rmd-*-closure-2026-07-12.md; origin/codex/aishortvideo-checkpoint-20260711 @ 056f60a
mc_decision: RP-00A closed，允许按依赖进入 RP-00B；真实 DB/provider/media 门禁不变。
next_action: 完成关闭提交并推送后派发 RP-00B。
```

### MCE-20260712-RP00B-DISPATCH

```text
event_id: MCE-20260712-RP00B-DISPATCH
occurred_at: 2026-07-12 20:46:00 CST
event_type: dispatch
source_thread: 019ed4a5-a2f5-7d13-86d0-0c28381af555
package_id: RP-00B
issue_ids: RMD-GOV-GIT-001, RMD-GOV-SLA-001, RMD-GOV-TEMP-001
acceptance_ids: GOV-GIT-01, GOV-SLA-01, GOV-TEMP-01
summary: 主控正式派发 Git 门禁、派发 SLA、临时文件归因包；禁止业务代码、Prisma、真实 DB/provider/media。
evidence: docs/remediation/issue-ledger.md; docs/remediation/remediation-program.md; docs/remediation/acceptance-matrix.md; docs/reviews/remediation-rp-00a-dispatch-receipt-2026-07-12.md
mc_decision: 允许新增仓库级治理脚本、SLA 收据模板、RP-00A 收据、RP-00B 关闭草稿，并在确认无引用后删除 apps/api/tsconfig.testrun.json。
next_action: DEV 完成 RP-00B 后，MC 派 TEST 按 GOV-GIT-01/GOV-SLA-01/GOV-TEMP-01 独立验收。
```

### MCE-20260712-RP00B-TEMP-DECISION

```text
event_id: MCE-20260712-RP00B-TEMP-DECISION
occurred_at: 2026-07-12 20:46:00 CST
event_type: temp_file_decision
source_thread: 019ed4a5-a2f5-7d13-86d0-0c28381af555
package_id: RP-00B
issue_ids: RMD-GOV-TEMP-001
acceptance_ids: GOV-TEMP-01
summary: apps/api/tsconfig.testrun.json 经全仓引用核对后归因为一次性测试辅助文件；RP-00B 使用 apply_patch 删除，不加入 .gitignore。
evidence: 删除前 rg tsconfig.testrun/apidist2/deepseekNovelProvider.test 无脚本引用；删除后 find apps/api -maxdepth 1 -name tsconfig.testrun.json 无输出，git status 不再出现该文件。
mc_decision: 临时文件不纳管、不 ignore、不保留；由 TEST/QUALITY 独立复核删除证据。
next_action: 若后续仍需要临时测试 tsconfig，必须在派发包内声明 owner、用途、有效期和清理方式。
```
