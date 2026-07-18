# RP-02B2a2 A2 纠正血缘开工授权回执

receipt_status: prepared_pending_repository_activation
mc_decision_at: 2026-07-18 10:14:17 CST
authorized_package_id: RP-02B2a2
authorized_stage: A2 authority-claim
authorized_predecessor_sha: 01245feb51b50ec838cb405a67bcafd1b194eeae
immutable_evidence_sha: c7ae53cca939286e8c1aabf20e06b9fd29b9195a
default_branch_before_receipt: 13d198560a37466a96e212ca969ad5b8bdca248f
superseded_receipt: docs/reviews/rp-02b2a2-a2-authorization-receipt-2026-07-17.md
issue_ledger_closed_count: 9/42 unchanged

## 1. 授权结论

MC 只批准 `RP-02B2a2` 的 A2 authority-claim 阶段从纠正后的 G0 重新开工。授权不等于实现完成、独立验收通过或问题关闭；`RMD-TASK-002` 保持 `partial`，`RMD-TASK-003` 保持 `open`。

A2 必须从精确 G0 `01245feb51b50ec838cb405a67bcafd1b194eeae` 创建 sibling 分支。不得从默认分支、PR #29 bridge merge、E1 `c7ae53c`、旧 G0 `52549d7`、旧授权回执或旧 A2 草稿 HEAD 延伸。

2026-07-17 回执绑定的 `52549d7/39d48a6` 血缘已被替代，继续保留为历史审计，但不得再作为当前授权依据。

## 2. 前置证据

- replacement G0：16 files / 1,999 net additions；package gate 47/47；独立 TEST/QUALITY `APPROVED P0/P1/P2=0/0/0`。
- G0 同头 push runs：RP-01A `29608314069`、RP-01B `29608314153`、RP-01C `29608314165`、Governance `29608314134`，均为 `completed/success`，head 为 `01245fe`。
- E1：3 files / 56 net additions；E1 package gate 通过；RP-01C push run `29626217029`、Governance push run `29626217021` 均为 `completed/success`，head 为 `c7ae53c`。
- 默认分支桥接：PR #29 以 merge commit `13d1985` 合入；bridge head `6ca57e0` 的 tree 为 `3003a1c`，16/16 frozen G0 manifest blobs 与 accepted E1/G0 tree 一致。
- bridge recovery run：RP-01C workflow_dispatch `29626473406` 成功，覆盖 RP-01C、RP-02A、API 全测、E2E、typecheck、build、Prisma validate、governance 和 git budget。
- repository-controlled gate tuple 已切换到 `GATE_SOURCE_SHA=01245fe`、`G0_EVIDENCE_SHA=c7ae53c`；授权二元组仍保持关闭。

## 3. 两阶段激活

本回执合并期间，repository-controlled tuple 必须保持：

```text
RP02B2A_AUTHORIZED_PACKAGE_ID=NOT_AUTHORIZED
RP02B2A_AUTHORIZED_PREDECESSOR_SHA=not_authorized
```

回执合并后，MC 才执行原子激活：

```text
RP02B2A_AUTHORIZED_PACKAGE_ID=RP-02B2a2
RP02B2A_AUTHORIZED_PREDECESSOR_SHA=01245feb51b50ec838cb405a67bcafd1b194eeae
```

只有远端再次读取到完整且匹配的二元组后，A2 才视为已激活。任一值缺失、不完整或不匹配时必须 fail closed，不得创建候选任务、调用 provider 或继续后续包。

## 4. A2 必修项

旧 A2 工作树只作迁移素材，必须迁移到新 G0 后重新验收。正式关闭前必须证明：

1. stale replay 不得在 authority reload 前复用。
2. provider input hash 必须从权威 T1 projection 重建。
3. 第二次 authority validation 与 claim 必须消除 TOCTOU。
4. 15 个 provider-backed action 必须逐项执行完整 authority 匹配。
5. 不存在隐式默认 actor fallback。
6. 60-case 测试必须按 action 验证，不得只做共享模板计数。
7. provider/task/intent/side-effect 必须在隔离 fixture 中断言绝对为 0。
8. stale replay、legacy、双 tenant、15-action HTTP 200 和 provider projection 验收矩阵全部通过。

## 5. 冻结边界

- A3-A5、B2b、B2c、B3 不得联动授权或自动继续。
- 真实 MySQL/Prisma、真实 DeepSeek/provider、真实媒体、外部发布与 E6 继续等待独立安全授权。
- 不新增需求，不推进 P9-real 或 P10-R1。
- 总账继续保持 9/42；只有 A2 实现迁移、独立验收、远程 trusted admission、关闭证据和总账裁决全部完成后，才允许更新对应问题状态。
