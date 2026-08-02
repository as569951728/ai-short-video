# RP-04C 全书审稿浏览器证据（2026-08-02）

## 1. 结论

| 项目 | 结论 |
| --- | --- |
| package_id | `RP-04C` |
| target_issue_id | `RMD-NOV-REVIEW-001` |
| browser_result | `PASS` |
| deterministic_result | `PASS` |
| real_model_e5 | `BLOCKED` |
| package_result | `blocked` |
| ledger_action | 不关闭、不调整总账进度 |

浏览器和确定性 provider 已证明：全书审稿使用 12 章权威证据、任务刷新可恢复、付费入口单次触发、固定冲突可定位、blocking gate 不允许完结，并且页面不暴露整章正文或敏感字段。受控真实 DeepSeek E5 第三次安全失败为 `llm_output_parse_failed / schema_invalid`，因此本包仍然阻塞，不得以 mock 或浏览器成功替代真实模型证据。

## 2. 受控环境

- Admin：`http://127.0.0.1:5184`
- API：`http://127.0.0.1:3014`
- 数据：本地 in-memory acceptance seed，不连接 MySQL。
- Provider：deterministic local provider，45 秒延迟；不连接真实模型。
- Fixture：12 章正式正文，固定冲突为人物状态 2/8 章、时间线 4/9 章、关键事实 6/11 章。
- 安全边界：启动脚本拒绝数据库、模型、对象存储和媒体密钥环境变量。

## 3. 浏览器必须项

| 编号 | 结果 | 安全证据摘要 |
| --- | --- | --- |
| M-01 | PASS | 后端 fixture 正确加载；12/12 正文完成；完结入口禁用。 |
| M-02 | PASS | 确认框明确只生成报告、问题卡和 gate；取消后未创建审稿任务。 |
| M-03 | PASS | 单次确认只产生一个 full-review POST；请求字段仅为 `idempotencyKey`、`expectedNovelVersion`。 |
| M-04 | PASS | 运行中显示不定进度、当前动作和 1–3 分钟提示，不伪造精确百分比。 |
| M-05 | PASS | 运行中任务详情为真实 `task_000175`，显示 request ID 和事件时间线。 |
| M-06 | PASS | 运行中刷新和第二标签页均恢复 `task_000175`；任务总数仍为 1。 |
| M-07 | PASS | 终态为报告 `review_000177`、68/C、blocked；未自动完结或进入视频化。 |
| M-08 | PASS | 页面显示人物 2/8、时间线 4/9、关键事实 6/11 章，并给出处理动作；无对照误报。 |
| M-09 | PASS | `allowCompletion=false`；完结按钮禁用；未产生 completion POST。 |
| M-10 | PASS | 刷新和双标签页保持同一 task/report/gate 终态，没有重放 POST。 |
| M-11 | PASS | DOM、Console、localStorage、sessionStorage 无密钥、认证头或 raw response；12 章详情行不携带正文。 |

## 4. 非浏览器证据边界

- API provider spy、权威版本引用、完整覆盖 manifest、hash、stale fail-closed 和模型 scope 到权威 chapter ID 的服务端映射由确定性测试覆盖。
- 浏览器详情响应约 65 KB，包含结构、试写和任务摘要；`chapters[]`、`bodyGeneration`、`latestFullReview` 不携带本 fixture 的整章正式正文。
- 页面只展示冲突所需的标题、最小摘要、处理建议和章节号，不展示 provider 输入证据或完整原始响应。
- 本轮未连接 MySQL，不能证明服务重启后的数据库恢复；该证据仍属于后续 E6。

## 5. 真实模型 E5 阻塞

受控真实模型最多三次、禁止自动重试：

1. 第一次返回可解析 JSON，但固定冲突 scope 未全部命中。
2. 第二次输出未通过解析/校验。
3. 第三次安全失败：`llm_output_parse_failed`，`outputKind=schema_invalid`，`validationCode=schema_invalid`。

未保存完整 prompt、完整正文或 raw provider response。当前不得继续付费重试，不得关闭 `RMD-NOV-REVIEW-001`；下一次真实模型调用必须先调整 schema 可靠性方案并重新取得明确的费用调用决策。

## 6. 候选状态

本实现可进入固定 SHA 的 PRODUCT/TEST/QUALITY 独立复核，但复核结论最高只能是 `blocked` 或 `needs_revision`。只有真实模型 E5、独立复核和 required checks 全部通过后，才可申请合并并关闭总账项。
