# RP-04C 全书审稿浏览器证据（2026-08-02）

## 1. 结论

| 项目 | 结论 |
| --- | --- |
| package_id | `RP-04C` |
| target_issue_id | `RMD-NOV-REVIEW-001` |
| acceptance_id | `RP-04C_BROWSER_ACCEPTANCE_M01_M11` |
| browser_result | `candidate_for_independent_review` |
| failing_step | 无，M-01 至 M-11 与 R-01 全部 `PASS` |
| real_model_e5 | `PENDING`（本轮浏览器运行未调用） |
| e6 | `NOT_PROVEN` |
| package_result | `blocked` |
| approval | `NOT_ISSUED` |
| ledger_action | 不关闭、不调整总账进度；ADR 文件数与净增量由主控更新 |

指定安全摘要显示 Playwright 1/1 通过，M-01 至 M-11 与失败刷新恢复 R-01 全部 `PASS`，`failures=[]`。浏览器结论为 `candidate_for_independent_review`；该结论只覆盖本地内存仓储与确定性 provider，不替代 E5 或独立批准。

## 2. 运行身份与安全边界

| 字段 | 值 |
| --- | --- |
| run_id | `rp04c-2026-08-03T00-41-10-512Z` |
| git_sha | `3e184fdb42b82bb159f008b567c84146c034fd3f` |
| git_tree | `d1ff9a7881c2bd8109aa1d78d0bda2c3174353f2` |
| worktree_dirty | `false` |
| executable_scope_hash | `acdbcaa7669a7e1091c14db0394a2da6c4f71b9b9e88334dacaae4b0ef64f263` |
| fixture_version | `rp04c-browser-12ch-v1` |
| provider | `deterministic-delay-provider`，45 秒延迟 |
| evidence_hash | `eff557551bf5eb1154e2e129676173ac0547654f8df88e01dad454c551b83b9c` |
| safe_summary_sha256 | `166b91c7f8b912dd7211413c132531513d01059cbea1c8f6d5cc825295d00517` |
| safe_summary | `output/playwright/rp-04c/rp04c-2026-08-03T00-41-10-512Z/safe-evidence.json` |

说明：安全摘要明确记录 `worktree.dirty=false`，并绑定上述 `git_sha`、`git_tree` 与 `executable_scope_hash`。该身份只证明本次本地确定性浏览器运行对应的干净候选，不替代远程 checks、E5 或独立复核。证据不包含文件正文或 diff。

运行使用随机本地端口、in-memory repository 和确定性 provider。启动器拒绝或移除数据库、真实模型、对象存储与媒体密钥；本轮未调用真实 MySQL、真实模型、对象存储、TTS、视频渲染或发布接口。

## 3. M-01 至 M-11 结果

| 编号 | 结果 | 安全证据摘要 |
| --- | --- | --- |
| M-01 | PASS | 后端 fixture 加载成功；正式章节 12；完结入口禁用。 |
| M-02 | PASS | 取消确认后 full-review POST 为 0；确认框显示 12 章且明确不会自动完结。 |
| M-03 | PASS | 单次确认只产生 1 个 full-review POST；请求字段仅 `expectedNovelVersion`、`idempotencyKey`；长任务最终响应为 HTTP 200。 |
| M-04 | PASS | 0/5/15 秒均显示生成中、不定进度与 1-3 分钟提示；未出现伪造百分比。 |
| M-05 | PASS | 运行中后端 task 为 `task_000175`；任务详情与事件接口可用，事件数 1。 |
| M-06 | PASS | 五个采样点均为 `task_000175 / processing`，provider 全程 active，POST 与 provider 调用均为 1；同页刷新、第二标签页、第二标签页再次刷新后的发起入口均为 disabled。 |
| M-07 | PASS | 报告 `review_000177`、gate `fullGate_000178` 到达；问题数 3，没有 completion decision，视频化状态为 `not_ready`。 |
| M-08 | PASS | 人物 2/8、时间线 4/9、关键事实 6/11 章 scope 正确；固定对照误报为 0。 |
| M-09 | PASS | `allowCompletion=false`、blocking 数 3；完结入口禁用，completion POST 为 0。 |
| M-10 | PASS | 终态刷新后 task/report/gate ID 稳定，没有重复 POST 或重复资产。 |
| M-11 | PASS | 源正文 canary 已确认存在，DOM、Console、local/sessionStorage、Cookie、相关 Network JSON 的 canary/敏感命中均为 0；页面错误为 0。 |
| R-01 | PASS | 输出格式失败持久为 `output_parse_failed / PROVIDER_ERROR`；刷新后仍显示安全原因与重新发起入口，未写入报告，raw canary 未泄漏。 |

## 4. 本轮覆盖与隐私摘要

- `coveredChapterNos` 为 1 至 12，连续、无重复。
- 正文版本、feature card、单章 review 证据计数均为 12；长期 memory 计数为 1。
- `manifestHash=43108c3ee5dcb5d7253206bf00c1bbb2dc9a3a8965b8783da6aba1f59888d951`。
- 浏览器 full-review POST 为 2：成功链 HTTP 200 且 task 始终为 `task_000175`，R-01 受控失败 HTTP 500 且 task 为 `task_000358`；completion POST 为 0。
- M-06 四个 `startActionDisabled*` 均为 `true`，五个 task 状态均为 `processing`，`providerActiveThroughout=true`，`providerCallCount=1`。
- M-11 在源正文和 raw model canary 均已确认的前提下扫描 50 个相关 Network JSON；DOM/Console/Storage/Cookie/Network 敏感命中和页面错误均为 0。
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

### 已验证修复：R-01 失败刷新恢复

输出格式错误绑定指定小说后只调用 provider 一次；任务持久为 `output_parse_failed / PROVIDER_ERROR`。页面刷新后仍显示安全原因与重新发起入口，且没有审稿报告、完成决定或 raw canary 泄漏。

浏览器证据只达到 `candidate_for_independent_review`。本轮已绑定干净候选 SHA/tree；后续仍需取得同一最终候选的远程 checks、独立复核与 E5，才能改变整包结论。

## 6. 非 UI 边界
本轮仍未证明或仍被阻塞：

- `E5`：受控真实模型 canary 为 `PENDING`，本轮浏览器运行未调用真实模型；它是 RP-04C 的包门禁。
- `E6`：仍为 `NOT_PROVEN`，归属独立的 `RMD-NOV-DB-001`，不得由本轮证据替代，也不是 RP-04C 的包门禁。
- `N-01`：多版本候选报告池与采用/废弃治理。
- `N-05`：真实付费 provider 调用数和费用记录数。
- `N-06`：固定真实模型 E5。本轮没有付费调用。
- `N-08`：直接 API/并发/真实仓储层完结阻断。
- `N-09`：进程重启、worker 恢复和未知 provider 结果下的去重。
- 本轮未连接 MySQL，不能证明数据库持久化和服务重启恢复。

浏览器步骤虽已全绿，RP-04C 仍不得批准或关闭，直至 E5、远程 checks 和独立 TEST/PRODUCT/QUALITY 证据齐备。E6 与真实数据库边界继续在 `RMD-NOV-DB-001` 下保持开放。

## 7. 复现命令

```bash
npm run e2e:rp04c
```

当前结果：M-01 至 M-11 与 R-01 全部 `PASS`；安全摘要中 `failures=[]`、`browserConclusion=candidate_for_independent_review`、`approval=NOT_ISSUED`。
