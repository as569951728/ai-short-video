# AIShortvideo 结果导向进度合同

状态：active

更新时间：2026-08-01

## 1. 目的

整改进度不再使用单一百分比。主控必须分别报告问题关闭、研发交付、独立验收和用户结果，避免把子包、PR 或测试通过解释为产品完成。

## 2. 四层进度

| 层级 | 唯一口径 | 允许状态 | 禁止替代证据 |
| --- | --- | --- | --- |
| 总账关闭 | `docs/remediation/issue-ledger.md` 中正式 `closed` 的问题数及 PB/RB/QG/DEBT 分类 | `x/y` 原始计数 | 百分比、PR 数、测试数、代码行数 |
| 研发交付 | 当前唯一实现包及其目标问题、预期状态迁移、固定候选 SHA | `not_started/in_progress/delivered` | “正在处理”、拆包轮次、Agent 数量 |
| 独立验收 | TEST/PRODUCT/QUALITY 对同一候选的正式结论 | `not_started/in_progress/accepted/rejected` | 研发自测、页面 loading、远程绿灯截图 |
| 用户结果 | 对目标用户旅程和真实环境边界的可验收结论 | `not_proven/partial/proven` | mock/in-memory/static 外推、文档收口 |

## 3. 包准入字段

每个新实现包在授权前必须声明：

- `target_issue_ids`：本包直接影响的总账 ID。
- `expected_ledger_transition`：验收通过后每个 ID 的预期状态变化。
- `user_result`：用户能新增完成或验证的结果。
- `evidence_buckets`：contract/unit/API/DB/browser/provider/media 中适用的证据。
- `fixed_candidate`：独立验收绑定的 SHA；研发中可以先标 `pending`。

缺少上述任一字段时，包状态只能是 `not_authorized`。

## 4. 流量控制

1. 同一时间最多一个实现包处于 `in_progress`；只读审计可以并行。
2. 连续两个合并 PR 没有带来任何总账状态前进时，执行模式必须切换为 `execution_reset`，活动实现包必须清空。
3. `execution_reset` 期间只允许归因脏工作树、校准状态单源、修复门禁和选择下一条结果链，不允许按编号自动启动后续包。
4. 下一包必须优先选择能够关闭或明确推进 PB/P0、RB/P0/P1 的纵向链路；纯治理包必须说明它阻断的具体结果。
5. 真实数据库和付费模型仍按隔离、回滚、费用上限、密钥脱敏和禁止自动付费重试执行；授权不能替代安全前置。

## 5. 机器快照

`docs/remediation/execution-scoreboard.json` 是当前四层进度的机器可读投影，不改变 issue ledger 的问题状态。停工计数必须从 `docs/remediation/execution-flow-events.json` 中最近一次总账关闭事件之后的合并 PR 复算，并与追加式主控事件账交叉校验，不允许由 scoreboard 自报。`npm run governance:progress` 必须验证这些资产一致，并阻止过期状态、百分比进度、用户结果伪造和停工阈值绕过。
