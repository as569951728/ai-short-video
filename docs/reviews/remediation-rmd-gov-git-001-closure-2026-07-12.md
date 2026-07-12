# RMD-GOV-GIT-001 整改关闭记录

draft_status: pending_independent_verification

## 1. 基本信息

| 字段 | 内容 |
| --- | --- |
| issue_id | RMD-GOV-GIT-001 |
| package_id | RP-00B |
| issue_class | QG |
| severity | P0 |
| owner | MC + DEV + QUALITY |
| dev_thread | 019ed4ee-441a-7fa2-894d-393c7d4c527b |
| test_thread | 待主控派发 |
| acceptance_ids | GOV-GIT-01 |
| environment | docs/scripts-only / no service / no DB / no provider |
| target_evidence_level | E1 + Git hook/CI check |
| actual_evidence_level | pending TEST review |

## 2. 原始问题

- 用户目标：每个整改包必须可审查、可回滚、可 bisect。
- 原始现象：曾跨包累积并一次纳管 89 文件。
- 用户影响：难以判断哪个包引入回归，也难以安全回滚。
- 首次证据：`docs/remediation/issue-ledger.md` 中 RMD-GOV-GIT-001。
- 直接原因：没有可执行的文件数/净新增行数门禁。
- 系统根因：包级提交纪律缺少脚本和 CI 约束。
- 原状态：partial。

## 3. 修复范围

- 修改内容：新增仓库级 Git budget 脚本、测试、npm scripts 和 GitHub Actions；使用 `git diff --numstat -z` 做 NUL 安全解析；支持 staged、worktree、显式 base/head；CI PR 路径 fetch 后用 merge-base，并从 base..head diff 中用 `git diff --name-only -z` 自动发现本次 diff 内 `docs/adr/*.md` 传入门禁；本地无参数回退 `HEAD~1...HEAD` 并输出 degraded；超过 20 文件或 2,000 净新增行必须使用有效 ADR。
- 修改文件：`package.json`、`scripts/remediation-governance.mjs`、`scripts/remediation-governance.test.mjs`、`.github/workflows/remediation-governance.yml`、`docs/adr/rp-00b-test-override.md`、相关治理文档。
- migration：N/A。
- 配置变化：新增 npm scripts：`governance:git-budget`、`governance:sla`、`test:governance`。
- 数据兼容：N/A。
- 安全影响：不读取 `.env`、DATABASE_URL、API key。
- 明确未修改：未改业务代码、Prisma、真实环境。

## 4. 研发证据

| 证据桶 | 命令/证据 | 结果 | not_proven |
| --- | --- | --- | --- |
| contract | `docs/development-coordination.md`、`docs/remediation/remediation-program.md` | 已补 Git budget 规则 | 待独立验收 |
| unit | `npm run test:governance` | 15 tests passed；覆盖预算内自动发现 ADR 被忽略、20/21 文件、2000/2001 行、ADR 字段与实际 diff mismatch、过期、wrong commit、超限类型不匹配、NUL numstat 空格/rename/binary/deletion、staged-only、workflow ADR 自动发现、SLA 超时/时区/逆序/未来时间 | 待独立验收 |
| API | N/A | 未涉及 | N/A |
| DB/MySQL/Prisma | N/A | 未涉及 | N/A |
| browser | N/A | 未涉及 | N/A |
| provider | N/A | 未涉及 | N/A |
| media | N/A | 未涉及 | N/A |
| typecheck | N/A | docs/scripts-only | N/A |
| build | N/A | docs/scripts-only | N/A |
| failure injection | `npm run governance:git-budget -- --worktree`；`--max-files 1`；`--max-files 1 --adr docs/adr/rp-00b-test-override.md`；`--staged`；无参数 degraded 回退 | worktree 16 文件/1189 净新增通过；低阈值失败；ADR 放行且 ADR actual_files/actual_net_additions 必须匹配当前 diff；staged 空集通过；无参数输出 degraded | 待独立验收 |
| concurrency/restart | N/A | 未涉及 | N/A |

研发自测结论：

```text
user_goal_status: partial
environment: docs/scripts-only
evidence_level: E1 + local script/unit
not_proven: TEST/QUALITY 尚未独立验证；CI 尚未在远程 PR/push 实际运行。
```

## 5. 独立测试证据

- 执行 acceptance ids：GOV-GIT-01
- environment：待 TEST 填写
- evidence_level：待 TEST 填写
- 命令：待 TEST 填写
- fixture：20/21 文件、2000/2001 行、ADR 放行
- contract：待 TEST 填写
- unit：待 TEST 填写
- API：N/A
- 浏览器 trace：N/A
- DB/MySQL/Prisma：N/A
- API 请求/响应安全摘要：N/A
- 数据库证据：N/A
- provider 证据：N/A
- 媒体文件证据：N/A
- 刷新/多标签/重复点击：N/A
- 失败/取消/重试/重启：N/A
- 回归范围：包级 Git 门禁

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
issue_id: RMD-GOV-GIT-001
final_status: partial
closed_acceptance_ids:
residual_risks: 独立验收、远程 CI 运行和 MC 总账更新尚未完成。
reopen_conditions: 后续包绕过规模门禁，或超限包无 ADR 仍被派发/合入。
decided_by: pending MC
decided_at: pending
```
