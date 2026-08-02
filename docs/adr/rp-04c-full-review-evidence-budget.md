# RP-04C 全书审稿权威证据闭环预算 ADR

status: ready
package_id: RP-04C
manifest_id: RP-04C-v1
baseline_sha: 97f083903ec9b58cf7ee8ae85d1da7fbfdd8e640
hard_max_files: 28
hard_max_net_additions: 6000
exceeded_budget: changed_files,net_additions
actual_files: 28
actual_net_additions: 5999
split_reason: Full-review evidence loading, authority validation, strict provider and persistence ABI validation, deterministic conflict fixtures, authoritative refresh recovery, replayable browser acceptance, actionable issue location, and privacy evidence form one fail-closed user result chain. Independent PRODUCT/TEST/QUALITY review added the failed-call recovery contract, explicit in-memory seed guard, stale-source rejection, safe E5 summaries, and M-01..M-11 runner; splitting those fixes would allow duplicate paid calls, unsafe acceptance writes, incomplete gates, or an unverified browser success path to land independently.
owner: MC + DEV + PRODUCT + TEST + QUALITY
valid_until: 2026-08-04

## 1. 准入裁决

本包只处理 `RMD-NOV-REVIEW-001 / NOV-REVIEW-QUALITY-01`。目标是让全书审稿读取完整且权威的章节证据，并让用户在长耗时任务结束后看到可定位、可处理、可阻断完结的问题。

| 准入字段 | 冻结值 |
| --- | --- |
| target_issue_id | `RMD-NOV-REVIEW-001` |
| expected_transition | 真实 E5、独立 PRODUCT/TEST/QUALITY 和 required checks 全通过后才可申请关闭 |
| user_result | 12 章权威证据进入审稿；刷新恢复同一任务；问题定位到章；blocking gate 禁止完结 |
| fixed_candidate | 以 PR 最新 SHA/tree 为准；每次修订必须重新独立复核 |

## 2. 为什么不能拆分

仓储、执行计划、task claim、provider schema、scope 映射、刷新恢复、问题定位、privacy scan、fixture、live smoke 和验收文档共同构成权威 source refs 与完整证据 ABI 的 fail-closed 用户结果链，不可拆分落地。

## 3. 硬边界

- 不修改 Prisma schema，不连接真实 MySQL，不宣称 E6。
- 不保存完整 prompt、完整正文或 raw provider response。
- 不自动重试或扩大真实模型费用；当前 E5 `schema_invalid` 必须保持 merge blocker。
- 不关闭 `RMD-NOV-REVIEW-001`，不提高总账进度，不准入第二包。
- 不推进视频、TTS、字幕、渲染、导出、发布或数据回填。

## 4. 退出条件

ADR 只放宽 diff 预算，不放宽产品和质量门禁。PR 仍需 API、Admin、DOM、typecheck、browser M-01..M-11、真实 DeepSeek E5，以及固定 SHA 的 PRODUCT/TEST/QUALITY 独立结论全部通过；任一项阻塞时保持 Draft。
