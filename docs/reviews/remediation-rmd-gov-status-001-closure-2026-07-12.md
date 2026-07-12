# RMD-GOV-STATUS-001 整改关闭记录

draft_status: closed

## 1. 基本信息

| 字段 | 内容 |
| --- | --- |
| issue_id | RMD-GOV-STATUS-001 |
| package_id | RP-00A |
| issue_class | QG |
| severity | P1 |
| owner | MC + QUALITY |
| dev_thread | 019ed4ee-441a-7fa2-894d-393c7d4c527b |
| test_thread | 019ed4ee-b33b-7621-b71c-3aa3d9e7b26e |
| acceptance_ids | GOV-STATUS-01 |
| environment | docs-only / no service / no DB / no provider |
| target_evidence_level | E1 + consistency check |
| actual_evidence_level | E1 + consistency check |

## 2. 原始问题

- 用户目标：主控状态不能被旧巡检、旧验收或追加式文档互相覆盖。
- 原始现象：当前状态、历史事件和旧巡检口径曾混在多个文档里。
- 用户影响：用户和各会话可能误判当前授权、当前能力边界或下一步优先级。
- 首次证据：`docs/remediation/issue-ledger.md` 中 RMD-GOV-STATUS-001。
- 直接原因：没有独立历史事件账本，`main-control-status.md` 同时承载当前状态和历史解释。
- 系统根因：状态单源、事件账本和 issue ledger 的职责边界不够硬。
- 原状态：partial。

## 3. 修复范围

- 修改内容：`main-control-status.md` 增加状态单源规则；新增 `main-control-event-ledger.md`；协作文档补充状态与证据规则；新增机械核对清单。
- 修改文件：`docs/reviews/main-control-status.md`、`docs/reviews/main-control-event-ledger.md`、`docs/development-coordination.md`、`docs/remediation/rp-00a-consistency-checklist.md`。
- migration：N/A。
- 配置变化：N/A。
- 数据兼容：N/A。
- 安全影响：N/A。
- 明确未修改：未改 issue ledger 状态，未改业务代码。

## 4. 研发证据

| 证据桶 | 命令/证据 | 结果 | not_proven |
| --- | --- | --- | --- |
| contract | `main-control-status.md` 状态单源规则 | TEST/PRODUCT/QUALITY approved | 后续持续执行纪律按 reopen 条件监督 |
| unit | N/A | docs-only | N/A |
| API | N/A | 未涉及 | N/A |
| DB/MySQL/Prisma | N/A | 未涉及 | N/A |
| browser | N/A | 未涉及 | N/A |
| provider | N/A | 未涉及 | N/A |
| media | N/A | 未涉及 | N/A |
| typecheck | N/A | 未涉及 | N/A |
| build | N/A | 未涉及 | N/A |
| failure injection | N/A | 未涉及 | N/A |
| concurrency/restart | N/A | 未涉及 | N/A |

研发自测结论：

```text
user_goal_status: passed
environment: docs-only
evidence_level: E1 + consistency check
not_proven: 不证明任何业务能力；事件账本的后续持续使用按 reopen 条件监督。
```

## 5. 独立测试证据

- 执行 acceptance ids：GOV-STATUS-01
- environment：docs-only；无服务、DB、provider 或 media
- evidence_level：E1 + consistency check
- 命令：`git status --short --untracked-files=all`、`git diff --name-only`、`git diff --stat`、`git diff --check`、状态单源与事件账本 `rg` 检查
- fixture：N/A
- contract：当前状态入口、事件账本、唯一问题总账职责边界一致
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
- 回归范围：当前状态、事件账本、issue ledger 职责边界

测试结论：

```text
conclusion: approved
user_goal_status: passed
environment: docs-only
evidence_level: E1 + consistency check
not_proven: 不证明业务功能；若旧巡检再次覆盖当前状态则重新打开。
```

## 6. 产品与质量复核

产品复核：

- 原问题场景是否可理解：PRODUCT approved。
- 结果是否可见：当前状态入口与历史事件入口已经分离且互相引用。
- 下一动作是否明确：当前唯一动作仍为关闭 RP-00A 后进入 RP-00B。
- 是否仍有误导性能力表述：QUALITY approved，未发现 P0/P1。

质量复核：

- 范围是否越界：QUALITY approved，变更保持 docs-only。
- 真实环境边界：未触发真实环境。
- 租户/权限/敏感信息：未涉及。
- Git 和工作树：`056f60a` 已推送，upstream 对齐；`apps/api/tsconfig.testrun.json` 未纳入。
- 是否存在未归因文件：`apps/api/tsconfig.testrun.json` 属 RP-00B，本包未处理。

## 7. Git 与远程

| 字段 | 内容 |
| --- | --- |
| branch | codex/aishortvideo-checkpoint-20260711 |
| commit | 056f60a |
| upstream | origin/codex/aishortvideo-checkpoint-20260711 @ 056f60a |
| changed_files | 9 个 RP-00A 文档文件 |
| diff_check | passed |
| worktree_remaining | `apps/api/tsconfig.testrun.json` 保持未处理 |

## 8. 关闭裁决

```text
issue_id: RMD-GOV-STATUS-001
final_status: closed
closed_acceptance_ids: GOV-STATUS-01
residual_risks: 后续主控必须继续追加事件账本，并保持当前状态入口精简。
reopen_conditions: 后续状态再次由旧巡检/旧验收覆盖，或 main-control-status 继续承载长篇历史事件。
decided_by: MC 019ed4a5-a2f5-7d13-86d0-0c28381af555
decided_at: 2026-07-12 20:46 CST
```
