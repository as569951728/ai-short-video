# RMD-GOV-TEMP-001 整改关闭记录

draft_status: pending_independent_verification

## 1. 基本信息

| 字段 | 内容 |
| --- | --- |
| issue_id | RMD-GOV-TEMP-001 |
| package_id | RP-00B |
| issue_class | DEBT |
| severity | P1 |
| owner | QUALITY + DEV |
| dev_thread | 019ed4ee-441a-7fa2-894d-393c7d4c527b |
| test_thread | 待主控派发 |
| acceptance_ids | GOV-TEMP-01 |
| environment | docs/scripts-only / no service / no DB / no provider |
| target_evidence_level | E1 + clean-worktree check |
| actual_evidence_level | pending TEST review |

## 2. 原始问题

- 用户目标：工作树不能长期保留无 owner、无期限、无处理决策的临时文件。
- 原始现象：`apps/api/tsconfig.testrun.json` 长期未跟踪。
- 用户影响：无法判断它是源码资产、临时产物还是安全风险。
- 首次证据：`docs/remediation/issue-ledger.md` 中 RMD-GOV-TEMP-001；`docs/reviews/worktree-attribution-checkpoint-2026-07-11.md`。
- 直接原因：一次性测试配置未在完成后清理。
- 系统根因：治理包之前没有临时文件生命周期决策。
- 原状态：open。

## 3. 修复范围

- 修改内容：全仓引用核对后确认无脚本引用；文件 `outDir=/tmp/apidist2` 且排除 `deepseekNovelProvider.test.ts`，归因为一次性辅助配置；按 RP-00B 决策使用 `apply_patch` 删除，不加入 `.gitignore`，未使用 `git clean/reset/checkout`。
- 修改文件：删除 `apps/api/tsconfig.testrun.json`；更新归因文档、状态文档和关闭草稿。
- migration：N/A。
- 配置变化：删除一次性未跟踪 tsconfig，不影响正式 npm scripts。
- 数据兼容：N/A。
- 安全影响：未读取 `.env`、DATABASE_URL 或 key。
- 明确未修改：未改正式 tsconfig、业务代码、Prisma、真实环境。

## 4. 研发证据

| 证据桶 | 命令/证据 | 结果 | not_proven |
| --- | --- | --- | --- |
| contract | `docs/reviews/worktree-attribution-checkpoint-2026-07-11.md` 更新决策 | 已更新 RP-00B 删除决策 | 待独立验收 |
| unit | N/A | 未涉及 | N/A |
| API | N/A | 未涉及 | N/A |
| DB/MySQL/Prisma | N/A | 未涉及 | N/A |
| browser | N/A | 未涉及 | N/A |
| provider | N/A | 未涉及 | N/A |
| media | N/A | 未涉及 | N/A |
| typecheck | N/A | 未改代码 | N/A |
| build | N/A | 未改代码 | N/A |
| failure injection | 删除前 `rg tsconfig.testrun\|apidist2\|deepseekNovelProvider.test` 引用核对；删除后 `find apps/api -maxdepth 1 -name tsconfig.testrun.json` 与 `git status --short` | 删除前无脚本引用；删除后 `find` 无输出，`git status --short` 不再出现该文件；未使用 `git clean/reset/checkout` | 待独立验收 |
| concurrency/restart | N/A | 未涉及 | N/A |

研发自测结论：

```text
user_goal_status: partial
environment: docs/scripts-only
evidence_level: E1 + local reference scan
not_proven: TEST/QUALITY 尚未独立核对删除后工作树；MC 尚未更新 issue ledger。
```

## 5. 独立测试证据

- 执行 acceptance ids：GOV-TEMP-01
- environment：待 TEST 填写
- evidence_level：待 TEST 填写
- 命令：待 TEST 填写
- fixture：`apps/api/tsconfig.testrun.json`
- contract：待 TEST 填写
- unit：N/A
- API：N/A
- 浏览器 trace：N/A
- DB/MySQL/Prisma：N/A
- API 请求/响应安全摘要：N/A
- 数据库证据：N/A
- provider 证据：N/A
- 媒体文件证据：N/A
- 刷新/多标签/重复点击：N/A
- 失败/取消/重试/重启：N/A
- 回归范围：临时文件归因与工作树清洁度

测试结论：

```text
conclusion: pending
user_goal_status: partial
environment: pending
evidence_level: pending
not_proven: 独立验收未执行。
```

## 8. 关闭裁决

```text
issue_id: RMD-GOV-TEMP-001
final_status: partial
closed_acceptance_ids:
residual_risks: 独立验收和 MC 总账更新尚未完成。
reopen_conditions: 再次出现无 owner/无期限/无决策的未跟踪临时配置。
decided_by: pending MC
decided_at: pending
```
