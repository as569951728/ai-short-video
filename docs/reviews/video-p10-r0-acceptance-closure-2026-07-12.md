# P10-R0 shared 合同冻结正式验收收口

时间：2026-07-12 12:45:54 CST

## 结论

- 任务包：`P10-R0`
- 正式结论：通过
- `ready_to_close_P10_R0`：`yes`
- 覆盖范围：shared DTO、枚举、错误码、安全摘要、脱敏规则、无定时器纯时间函数和合同测试
- 未覆盖范围：API、service、repository、Prisma、前端 UI、真实数据库、平台 API、自动上传和 P12

R0 只冻结后续 R1-R4 的共享合同，不代表人工发布记录或数据回填业务已经可以运行。

## 多视角开工终审

用户明确授权 R0 后，主控再次组织产品、测试和工程质量视角终审，并在实现前关闭两项歧义：

1. 回填节点同时冻结 `dueAt` 与 `overdueAt`；仅 `pending` 节点派生 `waiting / due / overdue`，`completed / waived` 保持终态。`overdueAt` 由后续策略计算，R0 不写死宽限小时数。
2. R0 只定义 shared 合同和审计字段口径，不实现 route、service、repository、Prisma 或 UI。

产品提出修订后复核为 `confirmed`；测试和工程质量确认方案可验收且无安全越界。

## 冻结合同

- 人工发布平台枚举加 `other`、`manual_record` 发布方式、发布记录状态。
- `VideoPublishRecordDTO`、`VideoPublishFreezeSnapshotDTO`、`VideoMetricBackfillNodeDTO`、`PlatformMetricSnapshotDTO`、`VideoPublishDecisionRecordDTO` 和 publishing overview。
- reference、unit、export、render、narration、TTS、subtitle、visual plan、chapter 的安全 ID 与 `versionNo` 引用。
- 创建、更正、撤销、回填和决策请求的幂等与乐观锁字段。
- 可见发布记录不回显 `idempotencyToken`。
- 审计前后值使用明确白名单 DTO，不允许任意对象透传。
- URL 仅允许 http/https，显示和审计摘要移除 credentials、query、hash，非法或超长 URL 被拒绝。
- `PUBLISH_GATE_BLOCKED`、`PUBLISH_DUPLICATE`、`METRIC_BACKFILL_INVALID` 错误码。
- 无定时器时间派生函数及非法时间窗口的明确 `RangeError` 合同。

## 验收过程

首次正式验收发现唯一阻塞项：聚合状态类型使用 `decision_recorded`，但缺少运行时常量和完整合同测试，正式设计还残留 `reviewed`。主控决定统一为 `decision_recorded`，表示“已记录下一步决策”，不暗示 P12 复盘。

研发补齐 `VIDEO_PUBLISHING_AGGREGATE_STATUSES` 和负断言后，测试任务独立定向复验通过：

- 类型、运行时常量、合同测试和正式设计完全一致。
- 常量包含九个聚合状态，包含 `decision_recorded`，不包含 `reviewed`。
- `reviewed` 仅保留在测试的“不允许出现”负断言中。

## 命令证据

- `npm test -w @ai-shortvideo/shared`：21/21 通过。
- `npm run build -w @ai-shortvideo/shared`：通过。
- `npm run typecheck`：通过；只执行 Prisma client generate，未连接真实数据库。
- `git diff --check`：通过。
- 禁止目录扫描：`apps/api/src`、`apps/api/prisma`、`apps/admin-web` 无本包 diff。

## 保留风险与门禁

- `P10-R1` 未授权，不得自动开始。
- R0 没有 API、持久化或页面，因此不需要也未宣称浏览器流程通过。
- P8b-L1b 真实 MySQL/Prisma live smoke 继续待安全环境和单独授权。
- 平台账号授权、token、Cookie、平台 API、自动上传、cron、P12 和真实外部能力仍明确禁止。
