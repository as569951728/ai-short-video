# RP-04C 全书审稿浏览器证据（2026-08-02）

## 1. 结论

| 项目 | 结论 |
| --- | --- |
| package_id | `RP-04C` |
| target_issue_id | `RMD-NOV-REVIEW-001` |
| acceptance_id | `RP-04C_BROWSER_ACCEPTANCE_M01_M11` |
| browser_result | `candidate_for_independent_review` |
| failing_step | 无，M-01 至 M-11 全部 `PASS` |
| real_model_e5 | `BLOCKED`（本轮未执行） |
| e6 | `NOT_PROVEN` |
| package_result | `blocked` |
| approval | `NOT_ISSUED` |
| ledger_action | 不关闭、不调整总账进度；ADR 文件数与净增量由主控更新 |

指定安全摘要显示 Playwright 1/1 通过，M-01 至 M-11 全部 `PASS`，`failures=[]`。浏览器结论提升为 `candidate_for_independent_review`；该结论只覆盖本地内存仓储与确定性 provider 的浏览器旅程，不替代 E5/E6，也不形成整包批准。

## 2. 运行身份与安全边界

| 字段 | 值 |
| --- | --- |
| run_id | `rp04c-2026-08-02T22-01-40-932Z` |
| git_sha | `3252a937b3daedc0f775354b3d22fdffe85db0f7` |
| git_tree | `a4cea5eb0d649ec147b3183a3452bb35d493203e` |
| worktree_dirty | `true` |
| executable_scope_hash | `afa98622575ead7d20da2dd17ee4529406d61688b5a239f486c5d46c906757e3` |
| fixture_version | `rp04c-browser-12ch-v1` |
| provider | `deterministic-delay-provider`，45 秒延迟 |
| evidence_hash | `bca65468c69bef51359acb70f0ba67039955c87542e7ba41c60a7c54b1d6b90f` |
| safe_summary | `output/playwright/rp-04c/rp04c-2026-08-02T22-01-40-932Z/safe-evidence.json` |

说明：安全摘要明确记录 `worktree.dirty=true`。`git_sha` 与 `git_tree` 仅表示运行时 HEAD 身份，不得作为最终候选或干净树声明；`executable_scope_hash` 绑定本次浏览器验收可执行资产。证据不包含文件正文或 diff。

运行使用随机本地端口、in-memory repository 和确定性 provider。启动器拒绝或移除数据库、真实模型、对象存储与媒体密钥；本轮未调用真实 MySQL、真实模型、对象存储、TTS、视频渲染或发布接口。

## 3. M-01 至 M-11 结果

| 编号 | 结果 | 安全证据摘要 |
| --- | --- | --- |
| M-01 | PASS | 后端 fixture 加载成功；正式章节 12；完结入口禁用。 |
| M-02 | PASS | 取消确认后 full-review POST 为 0；确认框显示 12 章且明确不会自动完结。 |
| M-03 | PASS | 单次确认只产生 1 个 full-review POST；请求字段仅 `expectedNovelVersion`、`idempotencyKey`。 |
| M-04 | PASS | 0/5/15 秒均显示生成中、不定进度与 1-3 分钟提示；未出现伪造百分比。 |
| M-05 | PASS | 运行中后端 task 为 `task_000175`；任务详情与事件接口可用，事件数 1。 |
| M-06 | PASS | 五个采样点均为 `task_000175 / processing`，provider 全程 active，POST 仍为 1；同页刷新、第二标签页、第二标签页再次刷新后的发起入口均为 disabled。 |
| M-07 | PASS | 报告 `review_000177`、gate `fullGate_000178` 到达；问题数 3，没有 completion decision，视频化状态为 `not_ready`。 |
| M-08 | PASS | 人物 2/8、时间线 4/9、关键事实 6/11 章 scope 正确；固定对照误报为 0。 |
| M-09 | PASS | `allowCompletion=false`、blocking 数 3；完结入口禁用，completion POST 为 0。 |
| M-10 | PASS | 终态刷新后 task/report/gate ID 稳定，没有重复 POST 或重复资产。 |
| M-11 | PASS | DOM、Console、local/sessionStorage、Cookie、相关 Network JSON 敏感命中均为 0；页面错误为 0。 |

## 4. 本轮覆盖与隐私摘要

- `coveredChapterNos` 为 1 至 12，连续、无重复。
- 正文版本、feature card、单章 review 证据计数均为 12；长期 memory 计数为 1。
- `manifestHash=d2264571b0e14ecbd8d396946a5d3f62fec587683dcf0db23d759e172eb4c3d9`。
- 浏览器 full-review POST 为 1，completion POST 为 0；同一 task ID 始终为 `task_000175`。
- M-06 三个 `startActionDisabled*` 均为 `true`，五个 task 状态均为 `processing`，`providerActiveThroughout=true`。
- M-11 扫描 41 个相关 Network JSON 对象；DOM/Console/Storage/Cookie/Network 敏感命中和页面错误均为 0。
- 未保存 HAR、trace、截图、视频、完整 prompt、完整正文、raw response、认证头或密钥。
- `rawArtifactsSaved=false`、`harSaved=false`、`traceSaved=false`；安全摘要文本禁止内容命中为 0。

## 5. 浏览器结论

### 已验证修复：M-06 authoritative server task in-flight

独立证据：

1. 发起全书审稿并确认后端已持久化 `task_000175`，状态 `processing`。
2. 同页刷新、新开第二标签页、第二标签页再次刷新均恢复同一 task。
3. 五个采样点均为 `processing`，provider 全程 active。
4. 三个恢复场景的“全书 AI 审稿”入口均为 disabled，累计 POST 为 1。

### 已验证修复：M-07 终态报告链路

确定性 provider 维度契约修正后，终态报告、gate 与问题列表均成功进入页面和 latest API，M-07 至 M-11 全部通过。浏览器路径当前没有剩余 M 级失败项。

浏览器证据只达到 `candidate_for_independent_review`。由于运行来自 dirty worktree，后续形成最终候选时仍需由主控绑定干净候选 SHA/tree 并重新执行相应准入检查。

## 6. 非 UI 边界

本轮仍未证明或仍被阻塞：

- `E5`：受控真实模型 canary 仍为 `BLOCKED`，本轮未调用真实模型。
- `E6`：仍为 `NOT_PROVEN`，不得由本轮确定性浏览器证据替代。
- `N-01`：多版本候选报告池与采用/废弃治理。
- `N-05`：真实付费 provider 调用数和费用记录数。
- `N-06`：固定真实模型 E5。既有 E5 仍为 `BLOCKED`，本轮没有重新付费调用。
- `N-08`：直接 API/并发/真实仓储层完结阻断。
- `N-09`：进程重启、worker 恢复和未知 provider 结果下的去重。
- 本轮未连接 MySQL，不能证明数据库持久化和服务重启恢复。

浏览器步骤虽已全绿，RP-04C 仍不得批准或关闭，直至 E5、E6、真实数据库边界和独立 TEST/PRODUCT/QUALITY 证据齐备。

## 7. 复现命令

```bash
npm run e2e:rp04c
```

当前结果：M-01 至 M-11 全部 `PASS`；安全摘要中 `failures=[]`、`browserConclusion=candidate_for_independent_review`、`approval=NOT_ISSUED`。
