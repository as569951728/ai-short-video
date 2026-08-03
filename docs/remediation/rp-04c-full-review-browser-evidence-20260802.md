# RP-04C 全书审稿浏览器证据（2026-08-02）
## 1. 结论与身份
| 字段 | 值 |
| --- | --- |
| package/issue/acceptance | `RP-04C` / `RMD-NOV-REVIEW-001` / `RP-04C_BROWSER_ACCEPTANCE_M01_M11` |
| browser/package/approval | `candidate_for_independent_review` / `blocked` / `NOT_ISSUED` |
| real_model_e5/e6 | `PASS`（修复候选仅一次调用）/ `NOT_PROVEN` |
| run | `rp04c-2026-08-03T08-13-45-744Z` |
| implementation SHA/tree | `6a73577359338080ca4e229bc8335e993b482a96` / `81cf2fcc30fe6470c4e5bde5d37a40d8409ce63a` |
| dirty/scope hash | `false` / `06076f7e3bbff31a4ab363ce1d37394671271c3a71a9bb91e4b8e6ea5d8f7f2b` |
| fixture/provider | `rp-04c-browser-12ch-v1` / `deterministic-release-provider`（长等待、跨标签与双刷新后一次性释放） |
| evidence/file SHA256 | `08a16b68cdfda8de891a59898e2ff300e0d61ad8371d85e11c1ed259651c691f` / `4d915947e8403cdd6762e02cc059bbe227f92d7fc97c4c13e4f0ad27e27371f0` |
| safe summary | `output/playwright/rp-04c/rp04c-2026-08-03T08-13-45-744Z/safe-evidence.json` |
Playwright 1/1，M-01..M-11 与 R-01 全部 PASS，`failures=[]`。本轮只覆盖随机本地端口、in-memory repository 和确定性 provider；启动器移除数据库、真实模型、对象存储及媒体密钥，不替代 E5、MySQL 或独立批准。
## 2. M-01..M-11 与恢复
| 编号 | 结果 | 安全摘要 |
| --- | --- | --- |
| M-01..02 | PASS | 12 章、完结禁用；取消确认后 POST=0，确认框明确不会自动完结。 |
| M-03..04 | PASS | 确认后成功链 POST=1；字段仅 expected version/key；0/5/15 秒均 processing，无伪百分比。 |
| M-05..06 | PASS | task `task_000175` 可追踪；五个采样、跨标签与双刷新均为同一 processing task，provider active，所有发起入口禁用。 |
| M-07..08 | PASS | report `review_000177`、gate `fullGate_000178`；人物 2/8、时间 4/9、事实 6/11 scope 正确，对照误报 0。 |
| M-09..10 | PASS | blocking=3、allowCompletion=false、completion POST=0；终态刷新 ID 稳定，无重复 POST/资产。 |
| M-11 | PASS | 源正文 canary 存在；DOM/Console/Storage/Cookie/44 个 Network JSON 敏感命中与页面错误均为 0。 |
| R-01 | PASS | 受控 output parse 失败持久为 `output_parse_failed/PROVIDER_ERROR`；刷新仍有安全原因与重发入口，无报告/raw canary。 |
覆盖 1..12 连续无重复；content/feature/review=12，memory=1，manifest `8fb83d9a01fb28d0603e39aa889a57904dd2852f94c35d509a813cafded3ed32`。全局 full-review POST=2（成功 1、失败 1），provider total=2/success=1/failure=1；未保存 HAR/trace/截图/视频/raw artifact。
## 3. E5 真实模型证据
| 字段 | 安全摘要 |
| --- | --- |
| 首次历史失败 | `c0c673f` / prompt v3 / calls=1；人物漏检，时间线与金额命中，对照误报 0；`blocked/character_conflict_missing` |
| success identity | `7d8d706e8e7b501a30a309bea28725099a34c970` / `full-review-e5-summary-v2` / summary SHA256 `fb72a9c84d9b112824d56e90ffd0ba81bc0f498bb2b3c9aee406d6662595b141` |
| fixture/model/route | `rp-04c-e5-conflicts-v1` / `deepseek-v4-pro` / prompt v4 / `deepseek:deepseek-v4-pro:route-v5` |
| manifest/evidence/result | `dbdbd12e...5f31222` / `5946a76c...2c21297` / `fd2db01c...047765` |
| run/request | `rp04c-e5-fba54ffc-90a8-4e4d-8ce0-911b7ec74392` / `rp04c-e5-request-2efe080d-5cea-4a5e-9e0b-c957b32ddba0` |
| coverage/calls | 12/12；`callCount=1/maxCalls=1`；retry=0 |
| usage/budget | 18553 prompt、3217 completion、21770 total；53104 ms；保守费用上界 1249350 / 上限 5000000 micros |
| result | 人物 3/7、时间线 4/8、金额 5/9 精确命中；对照误报 0；`gateResult=blocked`，无 raw response |
E5 已通过，但仍须对该证据取得独立终验与正常合并后才可关闭 package/ledger。
## 4. 非证明边界与复现
`E6` 与 MySQL 属于 `RMD-NOV-DB-001`；多版本报告治理、直接 API 并发、进程恢复、真实费用记录仍未证明。浏览器全绿不能替代这些边界。
```bash
npm run e2e:rp04c
```
