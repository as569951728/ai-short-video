# RP-02B2a2 A2 最终纠正血缘开工授权回执

receipt_status: prepared_pending_repository_activation
mc_decision_at: 2026-07-19 10:35:01 CST
authorized_package_id: RP-02B2a2
authorized_stage: A2 authority-claim
authorized_predecessor_sha: f27442d159d7f9d6ef273128797be6085bbd8f9d
immutable_evidence_sha: 397b9a17968dd70566dce3d7e35a8314ae78a248
default_branch_before_receipt: 397b9a17968dd70566dce3d7e35a8314ae78a248
superseded_receipt: docs/reviews/rp-02b2a2-a2-authorization-receipt-2026-07-18.md
issue_ledger_closed_count: 9/42 unchanged

## 1. 授权结论

MC 批准 `RP-02B2a2` 的 A2 authority-claim 阶段从最终 accepted G0-C1 重新开工。该授权来自用户对整改范围内代码、测试、提交、推送和合并的持续执行授权，不等于实现完成、独立验收通过或问题关闭；`RMD-TASK-002` 保持 `partial`，`RMD-TASK-003` 保持 `open`。

A2 必须从精确 G0-C1 `f27442d159d7f9d6ef273128797be6085bbd8f9d` 创建 sibling 分支。不得从 E1 `397b9a17968dd70566dce3d7e35a8314ae78a248`、默认分支、旧 G0、旧授权回执或旧 A2 草稿 HEAD 直接延伸；E1 仅作为 repository-controlled 远程证据。

## 2. 前置证据

- accepted G0-C1：14 files / 441 net additions；package gate 52/52；独立 TEST/QUALITY `LOCAL_ACCEPTED 0/0/0`。
- G0-C1 `main` push runs：RP-01A `29668083767`、RP-01B `29668083766`、RP-01C `29668083777`、Governance `29668083784`，均为 `completed/success`，head 为 `f27442d159d7f9d6ef273128797be6085bbd8f9d`。
- E1：PR #38 已以 squash + admin bypass 合并；merge commit `397b9a17968dd70566dce3d7e35a8314ae78a248` 是 G0-C1 的单父直接子提交，tree 为 `0c3598bf738787e41e12ff44548ffdafec0bf048`。
- E1 候选 `77ba5910c303db58747cb185ed9c09909a36263c` 的 RP-01A `29670208841`、RP-01B `29670209990`、RP-01C `29669289648` 和 Governance `29669435143` 均成功；分支保护已恢复 `enforce_admins=true` 与原四项 required checks。
- repository-controlled gate tuple 已切换到 `GATE_SOURCE_SHA=f27442d159d7f9d6ef273128797be6085bbd8f9d`、`G0_EVIDENCE_SHA=397b9a17968dd70566dce3d7e35a8314ae78a248`；授权二元组在本回执合并前继续保持关闭。

## 3. 两阶段激活

本回执合并期间，repository-controlled tuple 必须保持：

```text
RP02B2A_AUTHORIZED_PACKAGE_ID=NOT_AUTHORIZED
RP02B2A_AUTHORIZED_PREDECESSOR_SHA=not_authorized
```

回执合并后，MC 执行原子激活：

```text
RP02B2A_AUTHORIZED_PACKAGE_ID=RP-02B2a2
RP02B2A_AUTHORIZED_PREDECESSOR_SHA=f27442d159d7f9d6ef273128797be6085bbd8f9d
```

只有远端再次读取到完整且匹配的二元组后，A2 才视为已激活。任一值缺失、不完整或不匹配时必须 fail closed，不得创建候选任务、调用 provider 或继续后续包。

## 4. A2 必修项

旧 A2 工作树只作迁移素材，必须迁移到最终 G0-C1 后重新验收。正式接受前必须证明：

1. stale replay 不得在 authority reload 前复用。
2. provider input hash 必须从权威 T1 projection 重建。
3. 第二次 authority validation 与 claim 必须消除 TOCTOU。
4. 15 个 provider-backed action 必须逐项执行完整 authority 匹配。
5. 不存在隐式默认、旧版或合成 actor fallback。
6. authority 竞态矩阵必须逐 action、逐 phase、逐 mutation 验证。
7. 缺少 required source refs 的新任务必须在 authority/provider/claim 前失败，并断言绝对零副作用。
8. stale replay、legacy、双 tenant、15-action HTTP 200、repository rollback 和 provider projection 验收矩阵全部通过。

## 5. 冻结边界

- A3-A5、B2b、B2c、B3 不因本回执自动激活，必须按 accepted predecessor 顺序推进。
- 真实 MySQL/Prisma 与真实模型可在隔离环境、写入范围、费用上限和密钥日志检查完成后进入独立联调；真实媒体、外部导出和发布在产生外部副作用前保留最后安全检查。
- 不新增需求，不推进未纳入整改总账的新业务研发。
- 总账继续保持 9/42；只有实现迁移、独立验收、远程 trusted admission、关闭证据和总账裁决全部完成后，才允许更新对应问题状态。
