# RMD-GOV-STATUS-001 整改关闭记录

draft_status: pending_independent_verification

## 1. 基本信息

| 字段 | 内容 |
| --- | --- |
| issue_id | RMD-GOV-STATUS-001 |
| package_id | RP-00A |
| issue_class | QG |
| severity | P1 |
| owner | MC + QUALITY |
| dev_thread | 019ed4ee-441a-7fa2-894d-393c7d4c527b |
| test_thread | 待主控派发 |
| acceptance_ids | GOV-STATUS-01 |
| environment | docs-only / no service / no DB / no provider |
| target_evidence_level | E1 + consistency check |
| actual_evidence_level | pending TEST review |

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
| contract | `main-control-status.md` 状态单源规则 | 已补 | 待独立验收 |
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
user_goal_status: partial
environment: docs-only
evidence_level: E1 draft
not_proven: 独立测试尚未按 GOV-STATUS-01 复核；事件账本后续是否被持续使用尚未证明。
```

## 5. 独立测试证据

- 执行 acceptance ids：GOV-STATUS-01
- environment：待 TEST 填写
- evidence_level：待 TEST 填写
- 命令：待 TEST 填写
- fixture：N/A
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
- 回归范围：当前状态、事件账本、issue ledger 职责边界

测试结论：

```text
conclusion: pending
user_goal_status: partial
environment: pending
evidence_level: pending
not_proven: 独立验收未执行。
```

## 6. 产品与质量复核

产品复核：

- 原问题场景是否可理解：待 MC/PRODUCT 判断。
- 结果是否可见：待 TEST 验证。
- 下一动作是否明确：待 TEST 验证。
- 是否仍有误导性能力表述：待 QUALITY 复核。

质量复核：

- 范围是否越界：草稿声明为 docs-only。
- 真实环境边界：未触发真实环境。
- 租户/权限/敏感信息：未涉及。
- Git 和工作树：待 MC/QUALITY 填写。
- 是否存在未归因文件：`apps/api/tsconfig.testrun.json` 属 RP-00B，本包未处理。

## 7. Git 与远程

| 字段 | 内容 |
| --- | --- |
| branch | codex/aishortvideo-checkpoint-20260711 |
| commit | 待 commit |
| upstream | 待 push |
| changed_files | 待 MC 填写 |
| diff_check | 待执行 |
| worktree_remaining | `apps/api/tsconfig.testrun.json` 保持未处理 |

## 8. 关闭裁决

```text
issue_id: RMD-GOV-STATUS-001
final_status: partial
closed_acceptance_ids:
residual_risks: 独立验收、持续使用事件账本和 MC 总账更新尚未完成。
reopen_conditions: 后续状态再次由旧巡检/旧验收覆盖，或 main-control-status 继续承载长篇历史事件。
decided_by: pending MC
decided_at: pending
```
