# RP-00A 文档一致性机械核对清单

状态：active

本清单用于 RP-00A 的轻量 regression。它不启动服务、不读取密钥、不连接真实数据库或 provider，只检查整改冻结期的治理文档是否自洽。

## 适用范围

- `docs/reviews/main-control-status.md`
- `docs/reviews/main-control-event-ledger.md`
- `docs/development-coordination.md`
- `docs/remediation/issue-ledger.md`
- `docs/remediation/remediation-program.md`
- `docs/remediation/acceptance-matrix.md`
- `docs/remediation/closure-evidence-template.md`
- `docs/reviews/remediation-rmd-test-evidence-001-closure-2026-07-12.md`
- `docs/reviews/remediation-rmd-gov-status-001-closure-2026-07-12.md`
- `docs/reviews/remediation-rmd-gov-stage-001-closure-2026-07-12.md`

## 机械核对项

1. `main-control-status.md` 必须声明只记录当前状态，历史事件进入 `main-control-event-ledger.md`。
2. `main-control-event-ledger.md` 必须存在，并声明旧巡检/旧验收不得覆盖当前状态。
3. `issue-ledger.md` 中 `RMD-TEST-EVIDENCE-001`、`RMD-GOV-STATUS-001`、`RMD-GOV-STAGE-001` 的状态不得被本包改成 `closed`。
4. `development-coordination.md` 必须声明当前是整改冻结期，不是研发前设计阶段。
5. `development-coordination.md` 和 `remediation-program.md` 必须声明 `RP-00` 至 `RP-10` 是管理分组，不得整体派发，只能派发可派发子包。
6. `acceptance-matrix.md` 的统一验收输出必须包含 `contract/unit/API/DB/browser/provider/media` 七个证据桶、`environment`、`evidence_level`、`not_proven`。
7. `closure-evidence-template.md` 的研发证据和独立测试证据必须强制分列七个证据桶；不适用项必须写 `N/A` 和原因。
8. 三份关闭草稿必须标注 `draft_status: pending_independent_verification`，且不得写 `final_status: closed`。
9. 三份关闭草稿必须分别绑定：
   - `TEST-EVIDENCE-LEVEL-01`
   - `GOV-STATUS-01`
   - `GOV-STAGE-01`
10. 本包不得修改业务代码、Prisma schema、前端页面、后端服务、API route 或 `apps/api/tsconfig.testrun.json`。

## 推荐只读命令

```bash
git status --short
rg -n "状态单源规则|main-control-event-ledger|旧巡检|整改冻结期|管理分组" docs/reviews/main-control-status.md docs/reviews/main-control-event-ledger.md docs/development-coordination.md docs/remediation/remediation-program.md
rg -n "contract|unit|API|DB|browser|provider|media|environment|evidence_level|not_proven" docs/remediation/acceptance-matrix.md docs/remediation/closure-evidence-template.md
rg -n "RMD-TEST-EVIDENCE-001|RMD-GOV-STATUS-001|RMD-GOV-STAGE-001|closed" docs/remediation/issue-ledger.md docs/reviews/remediation-rmd-*-closure-2026-07-12.md
git diff --check
```

## 通过口径

- 上述 10 项全部满足。
- `git diff --check` 通过。
- `git status --short` 中除本包文件外，既有未跟踪 `apps/api/tsconfig.testrun.json` 保持未处理。
- TEST 独立验收输出 `approved` 后，MC 才能用关闭模板更新总账状态。
