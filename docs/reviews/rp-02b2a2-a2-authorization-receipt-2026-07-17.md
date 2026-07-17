# RP-02B2a2 A2 开工授权回执

receipt_status: prepared_pending_repository_activation
mc_decision_at: 2026-07-17 16:49:22 CST
authorized_package_id: RP-02B2a2
authorized_stage: A2 authority-claim
authorized_predecessor_sha: 52549d73823c911b69c97dad8d4d8a799154f065
immutable_evidence_sha: 39d48a6fa3c49c67a99261eb06ef329b1c739fde
default_branch_before_receipt: 9b320a5da43b0d677ab81626e9f6c8b8d5bd3096
issue_ledger_closed_count: 9/42 unchanged

## 1. 授权结论

MC 只批准 `RP-02B2a2` 的 A2 authority-claim 阶段开工。授权不等于实现完成、独立验收通过或问题关闭；`RMD-TASK-002` 保持 `partial`，`RMD-TASK-003` 保持 `open`。

A2 必须从精确 G0 `52549d73823c911b69c97dad8d4d8a799154f065` 创建 sibling 分支。不得从默认分支、PR #25 integration merge、E1、旧 G0 `0cfcbd1` 或旧 A2 草稿 HEAD 延伸。

## 2. 前置证据

- replacement G0：16 files / 1,999 net additions；package gate 47/47、actor-clean 69/69、governance 15/15、RP-01C 13/13、API 119/119、Admin 77/77、DOM 12/12、E2E 13/13、typecheck、build 与 Prisma validate 全部通过。
- G0 远程 runs：`29550266898`、`29550266912`、`29550266923`、`29550266905`，均为 success。
- E1 远程 runs：`29552245971`、`29552245974`，均为 success。
- 默认分支桥接：PR #25 以 merge commit 合入；`merge-base(main,G0)=G0`，main tree 与 trusted workflow blob 和 G0 一致，E1 未进入 main 祖先链。
- main recovery run：`29559215753` success。
- 授权差异独立复核：TEST `APPROVED P0/P1/P2=0/0/0`；QUALITY `APPROVED`，无阻塞 P0/P1。远端门禁随后发现 package id 必须使用 `RP-02B2a2` 而非子步骤标签，变量合同已按 `scripts/rp02b2a-package-gate.mjs` 修正。

## 3. 两阶段激活

本回执合并期间，repository-controlled tuple 必须保持：

```text
RP02B2A_AUTHORIZED_PACKAGE_ID=NOT_AUTHORIZED
RP02B2A_AUTHORIZED_PREDECESSOR_SHA=not_authorized
```

这是为了防止 trusted admission 把治理回执 PR 误识别为 A2 业务候选。回执合并后，MC 才执行原子激活：

```text
RP02B2A_AUTHORIZED_PACKAGE_ID=RP-02B2a2
RP02B2A_AUTHORIZED_PREDECESSOR_SHA=52549d73823c911b69c97dad8d4d8a799154f065
```

只有远端再次读取到完整且匹配的二元组后，A2 才视为已激活。任一值缺失、不完整或不匹配时必须 fail closed，不得创建候选任务、调用 provider 或继续后续包。

`docs/reviews/main-control-status.md` 与 `docs/reviews/main-control-event-ledger.md` 属于 accepted G0 的冻结 16-file manifest；本次不得追加修改，否则会重新打开 G0 累计差异并超过其 2,000-net 硬预算。因此本回执单独保存授权决策和激活顺序，不改写冻结证据。

## 4. A2 必修项

旧 17-file 草稿只作迁移素材，不能原样提交。实现与独立验收前必须关闭以下 8 个 P1：

1. stale replay 不得在 authority reload 前复用。
2. provider input hash 必须从权威 T1 projection 重建。
3. 第二次 authority validation 与 claim 必须消除 TOCTOU。
4. 15 个 provider-backed action 必须逐项执行完整 authority 匹配。
5. 删除隐式默认 actor fallback。
6. 60-case 测试必须按 action 验证，不得只做共享模板计数。
7. provider/task/intent/side-effect 必须在隔离 fixture 中断言绝对为 0。
8. 补 stale replay、legacy、双 tenant、15-action HTTP 200 和 provider projection 验收矩阵。

## 5. 冻结边界

- A3-A5、B2b、B2c、B3 不得联动授权或自动继续。
- 真实 MySQL/Prisma、真实 DeepSeek/provider、真实媒体、外部发布与 E6 继续等待独立安全授权。
- 不新增需求，不推进 P9-real 或 P10-R1。
- 总账继续保持 9/42；只有 A2 实现、独立验收、远程 admission、关闭证据和总账裁决全部完成后，才允许更新对应问题状态。
