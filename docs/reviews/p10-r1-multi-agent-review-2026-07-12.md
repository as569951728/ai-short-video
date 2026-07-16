# P10-R1 研发准入包多会话评审记录

日期：2026-07-12

评审对象：`docs/modules/video-p10-r1-implementation-package.md`

当前结论：需求与研发准入设计通过；必须先纳入远程基线，且仍需用户明确授权 `P10-R1`，才可启动业务实现。

## 1. 评审边界

- 本轮只评需求、架构、测试和工程质量，不修改 P10-R1 业务代码。
- 不进入 R2/R3，不接真实 MySQL/provider/平台 API，不新增上传、同步、定时器或 P12。
- 当前代码与 Prisma 只用于验证需求包是否可落地，不把现状误报为 R1 已实现。

## 2. 评审会话

| 角色 | 会话 | 初始结论 | 主控处理 |
| --- | --- | --- | --- |
| 产品与业务规则 | `019f4aeb-773c-7821-876f-3a5c8e13a130` | approved | 接受；R3 继续明确“导出不等于发布、登记只是记录事实、24/48h 手动回填” |
| 后端架构 | `019ed4ee-441a-7fa2-894d-393c7d4c527b` | approved | 接受；R1-preflight 必须先补版本与快照合同，再进入 publishing 子域 |
| 独立测试 | `019ed4ee-b33b-7621-b71c-3aa3d9e7b26e` | approved | 接受；补充门禁失败与策略缺失的独立错误优先级样本 |
| 工程质量与安全 | `019edb3a-a972-75e2-bbb1-774b5ddb6d88` | needs_revision | 接受；准入包与本评审记录必须先提交并推送，临时 `tsconfig.testrun.json` 不纳管 |

质量定向复核：提交 `9c1a286` 推送后，HEAD 与 upstream 一致，提交内容仅包含三个准入文档，临时 `apps/api/tsconfig.testrun.json` 仍未纳管，未出现 R1 业务代码；复核结论 `approved`，原 P1 已关闭，当前无 P0/P1。

## 3. 一致通过的决策

1. R1 内先为 `VideoUnit` 和 `VideoExport` 补自身 `versionNo`，并同步 shared/domain/Prisma/repository/test。
2. 冻结快照字段统一为 `videoTitle / firstThreeSecondHook / firstScreenSubtitle / endingSuspense`。
3. 发布创建、更正、撤销使用 append-only `VideoPublishRecordRevision`，不得覆盖历史。
4. R1 创建人工发布事实时，同事务建立 h24/h48 节点；R2 才写指标、样本判断和下一步决策。
5. 门禁通过但策略不可用时返回 `CONFIG_MISSING`，六类发布对象全部零写入；门禁自身失败时优先返回门禁错误，也必须零写入。
6. 同 tenant 的同平台同作品 identity 永久去重；withdrawn 只是事实状态变化，不能通过重新创建绕过历史。
7. R1 包足以作为用户授权后的研发准入包，但远程纳管与明确授权是两个独立前置条件。

## 4. 当前代码事实

- `VideoUnitDTO/Record/Prisma` 当前没有自身 `versionNo`。
- `VideoExportDTO/Record/Prisma` 当前只有 render version，没有 export 自身 `versionNo`。
- `VideoPublishFreezeSnapshotDTO` 当前仍使用含义重叠的 `titleHook / firstThreeSecondVoiceover`。
- `VideoMetricBackfillNodeDTO` 当前未冻结 `policyVersion`。
- Prisma 当前没有 publish record、revision、freeze snapshot 或 metric backfill node 表。

以上是 R1-preflight 的待实现项，不是现有完成能力。

## 5. 研发与验收硬门禁

- 未经用户明确说出 `授权研发 P10-R1`，研发会话不得写 R1 业务代码。
- R1-preflight 未通过 shared/API/domain/Prisma/static test 前，不得进入 publishing service/repository/routes。
- 成功创建必须原子得到 record、revision、snapshot、h24/h48 nodes、receipt 和 operation log；任一步失败全部回滚。
- Prisma migration 只做 draft/static 验证；不得连接真实 MySQL。
- 正式验收必须由测试会话独立执行，研发自测不能替代。
- R1 完成后停止，不自动进入 R2/R3。

## 6. 准入结论

- product_review: approved
- architecture_review: approved
- test_review: approved
- quality_review: approved
- quality_P1_closed: yes
- ready_for_P10_R1_authorization: yes
- P10_R1_authorized: no
- P10_R1_business_code_started: no
