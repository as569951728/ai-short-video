# AIShortvideo 整改关闭证据模板

每个问题关闭时复制本模板生成：

`docs/reviews/remediation-<issue-id>-closure-<yyyy-mm-dd>.md`

禁止直接在唯一问题总账中把状态改成 `closed` 后再补证据。

---

# <issue_id> 整改关闭记录

## 1. 基本信息

| 字段 | 内容 |
| --- | --- |
| issue_id | |
| package_id | |
| issue_class | PB / RB / QG / DEBT |
| severity | P0 / P1 / P2 |
| owner | |
| dev_thread | |
| test_thread | |
| acceptance_ids | |
| environment | |
| target_evidence_level | |

## 2. 原始问题

- 用户目标：
- 原始现象：
- 用户影响：
- 首次证据：
- 直接原因：
- 系统根因：
- 原状态：

## 3. 修复范围

- 修改内容：
- 修改文件：
- migration：
- 配置变化：
- 数据兼容：
- 安全影响：
- 明确未修改：

## 4. 研发证据

| 项目 | 结果 |
| --- | --- |
| unit | |
| typecheck | |
| build | |
| API/in-memory | |
| browser | |
| MySQL/Prisma | |
| provider | |
| media | |
| failure injection | |
| concurrency/restart | |

研发自测结论：

```text
user_goal_status:
evidence_level:
not_proven:
```

## 5. 独立测试证据

- 执行 acceptance ids：
- 命令：
- fixture：
- 浏览器 trace：
- API 请求/响应安全摘要：
- 数据库证据：
- provider 证据：
- 媒体文件证据：
- 刷新/多标签/重复点击：
- 失败/取消/重试/重启：
- 回归范围：

测试结论：

```text
conclusion: approved | needs_revision | blocked
user_goal_status: passed | failed | partial
evidence_level:
not_proven:
```

## 6. 产品与质量复核

产品复核：

- 原问题场景是否可理解：
- 结果是否可见：
- 下一动作是否明确：
- 是否仍有误导性能力表述：

质量复核：

- 范围是否越界：
- 真实环境边界：
- 租户/权限/敏感信息：
- Git 和工作树：
- 是否存在未归因文件：

## 7. Git 与远程

| 字段 | 内容 |
| --- | --- |
| branch | |
| commit | |
| upstream | |
| changed_files | |
| diff_check | |
| worktree_remaining | |

## 8. 关闭裁决

```text
issue_id:
final_status: closed | partial | open
closed_acceptance_ids:
residual_risks:
reopen_conditions:
decided_by:
decided_at:
```

MC 只有在以下条件全部满足时可以写 `closed`：

1. 原始问题场景和系统性回归都通过。
2. 达到目标证据等级。
3. TEST 为 approved。
4. PB 必须 PRODUCT approved；不适用时必须写明 N/A 原因并由 MC 确认。
5. RB 或涉及真实 DB/provider/media 的问题必须 QUALITY approved；不适用时必须写明 N/A 原因并由 MC 确认。
6. PB/RB 没有用 mock 替代真实环境。
7. not_proven 不包含本 issue 的关闭条件。
8. commit 已推送且 upstream 对齐。
9. 唯一问题总账和主控状态同步更新。
