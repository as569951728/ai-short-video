# P10-R1 人工发布记录与冻结快照实施包

状态：多会话评审通过，尚未授权研发

## 1. 目标

P10-R1 在 P9e 已确认导出记录之上实现人工发布事实的后端最小闭环：

`读取当前可发布链路 -> 校验门禁 -> 登记人工发布 -> 冻结版本快照 -> 同事务建立 24h/48h 节点 -> 可查询、可更正、可撤销`

本包不提供指标回填写入、下一步决策或前端页面。R2 负责 metric snapshot、样本不足和决策；R3 才提供 UI。

## 2. 开工门禁

- P10-R0 已正式验收并远程收口，shared 合同为唯一基线。
- 用户尚未授权 P10-R1；本文档和多 Agent 评审不等于研发授权。
- 产品、后端架构、独立测试已评审通过；工程质量提出的“准入包必须纳入远程基线”是授权前版本管理门禁。
- 当前分支为 `codex/aishortvideo-checkpoint-20260711`，P10-R0 远程检查点为 `68957be`。
- `apps/api/tsconfig.testrun.json` 是既有一次性未跟踪文件，不删除、不忽略、不纳管。
- 真实 MySQL/Prisma live smoke、平台 API、token、自动上传、P12 均未授权。

## 3. R1 范围

### 3.1 必须实现

- 独立 publishing 子域、service、repository interface、in-memory repository、Prisma repository 和 routes。
- 创建、列表、详情、更正、撤销人工发布记录。
- 不可变发布冻结快照。
- 创建发布记录时在同一事务建立 h24/h48 两个回填节点；R1 只查询节点，不提供回填接口。
- 幂等 receipt、业务重复识别、乐观锁、租户隔离和 operation log。
- Prisma schema 与 migration draft；只做 static validate/test，不连接真实数据库。
- shared/API/domain/repository/route 测试和 fake policy provider fixture。

### 3.2 明确不做

- 指标回填写入、更正、样本不足和下一步决策。
- admin-web 页面、发布抽屉、列表发布列。
- 平台账号中心、平台 API、token、Cookie、授权、上传或同步。
- cron、定时器、后台自动抓数。
- P12 复盘、来源自动回流、真实数据库或真实外部 provider。
- 物理删除发布记录、冻结快照、修订历史或回填节点。

## 4. R0 合同前置校正

R1 实现前允许在同一包内做以下最小 shared 校正，并必须独立测试：

1. `VideoExportDTO / VideoExportRecord / VideoExport` 增加 `versionNo`；创建新导出时按租户和视频项目递增。
2. `VideoUnitDTO / VideoUnitRecord / VideoUnit` 增加 `versionNo`；既有默认单元迁移为版本 1。
3. `VideoPublishFreezeSnapshotDTO` 使用明确语义字段：
   - `videoTitle`：视频项目标题
   - `firstThreeSecondHook`：已确认旁白钩子
   - `firstScreenSubtitle`
   - `endingSuspense`
   删除含义重叠的 `titleHook / firstThreeSecondVoiceover`。
4. `VideoMetricBackfillNodeDTO` 增加 `policyVersion`，冻结生成 `dueAt / overdueAt` 时使用的策略版本。

这些校正只为满足已冻结的版本和安全语义，不得扩成 R2/R3 功能。

## 5. 架构边界

现有 `videoDomain.ts`、`videoService.ts` 和 `prismaVideoRepository.ts` 已承载 P8-P9，不继续把完整 publishing 实现堆入大文件。

建议文件：

- `apps/api/src/modules/videos/publishing/domain/videoPublishingDomain.ts`
- `apps/api/src/modules/videos/publishing/services/videoPublishingService.ts`
- `apps/api/src/modules/videos/publishing/repositories/videoPublishingRepository.ts`
- `apps/api/src/modules/videos/publishing/repositories/inMemoryVideoPublishingRepository.ts`
- `apps/api/src/modules/videos/publishing/repositories/prismaVideoPublishingRepository.ts`
- `apps/api/src/modules/videos/publishing/routes/videoPublishingRoutes.ts`
- 对应测试文件

Publishing service 同时依赖：

- 既有 `VideoRepository`：只读项目、reference、unit、artifacts、render、export 的当前状态。
- 新 `VideoPublishingRepository`：发布记录、修订、冻结快照、回填节点、receipt 和 operation log 的事务写入与查询。
- `VideoPublishingPolicyProvider`：按 tenant 返回经过校验的回填窗口策略。
- 注入式 `now: () => Date`：保证时间边界可测试。

route 只做 schema、请求上下文和响应包装；service 负责门禁/幂等/事务输入；repository 负责租户过滤和原子持久化。

## 6. 策略合同

定义 `VideoPublishingPolicyProvider`：

- 返回 `policyVersion`。
- h24/h48 分别包含 `dueAfterMinutes` 和 `overdueGraceMinutes`。
- h24 的 due 窗口必须为 24 小时，h48 必须为 48 小时；grace 由策略给出，不能写死在 service。
- 创建节点时冻结 `policyVersion / dueAt / overdueAt`，后续策略变化不能改历史节点。
- 默认 provider 为 unavailable；没有策略时返回 `CONFIG_MISSING`，且必须在任何写入前失败。
- 自动化使用 fake provider；不新增策略管理 UI，不读取真实密钥或平台配置。

错误优先级固定为：

- 请求自身存在 reference blocking、版本冲突或其他发布门禁失败时，返回对应门禁错误，且所有发布对象零写入。
- 仅当发布门禁均通过、但 tenant 无可用策略时，返回 `CONFIG_MISSING`，且 publish record、revision、freeze snapshot、h24/h48 node、receipt、operation log 全部零写入。
- 测试必须分别构造这两类样本，不能只用一个混合失败样本证明零写入。

## 7. 发布记录与修订历史

`VideoPublishRecord` 保存当前可查询状态；所有创建、更正和撤销都追加 `VideoPublishRecordRevision`：

- revision 保存 `versionNo`、平台展示字段、规范化 URL、状态、原因、操作人和时间。
- 更正使用 `expectedVersionNo`，成功后 record `versionNo + 1`，旧 revision 不覆盖。
- 撤销使用 `expectedVersionNo`，状态变为 `withdrawn` 并追加 revision。
- 发布冻结快照创建后不可修改；更正发布元数据不能改变 snapshot 或 sourceVersionRefs。
- operation log 只保存 R0 allowlist 安全摘要和版本 refs，不保存原始请求、token、完整文案或 query。

## 8. 冻结快照

创建时从同一当前链路冻结：

- project title、reference/version、unit/version
- export/version、render/version
- narration/TTS/subtitle/visual plan 的 artifact ID 与 versionNo
- 章节 content version refs
- fileName/fileKey 的安全引用
- `videoTitle / firstThreeSecondHook / firstScreenSubtitle / endingSuspense`
- 风险安全摘要

冻结快照不得保存完整章节正文、完整旁白、完整字幕、prompt、provider payload、API key、DB URL 或下载 URL query。

## 9. 发布门禁

登记前必须同时满足：

- 项目存在、属于当前 tenant、未停止/归档/删除。
- reference 不是 blocking，`expectedReferenceVersion` 与当前版本一致。
- unit 属于项目和 reference，`videoUnitId/versionNo` 与当前一致。
- render 属于项目/unit/reference，状态 confirmed、isCurrent=true、previewStatus=confirmed_exportable，版本一致。
- export 属于同一项目/unit/reference/render，状态 created，版本一致，且是当前可用导出。
- narration、TTS、subtitle、visual plan 都是 render.sourceVersionRefs 指向的已确认当前版本。
- 章节 content version refs 与当前 reference snapshot 一致。
- `platformWorkId / platformUrl` 至少一个有效。

任一版本不一致返回 `VERSION_CONFLICT` 或 `PUBLISH_GATE_BLOCKED`；reference blocking 返回 `VIDEO_REFERENCE_BLOCKING`。失败发生在 policy 读取和所有事务写入之前。

## 10. 幂等与业务重复

- request hash 排除 `idempotencyToken`，覆盖 videoId、unit、版本预期、平台和发布事实字段。
- 同 tenant + action + token + 同 hash：返回首次结果并标记 `reusedExisting=true`。
- 同 token + 不同 hash：`IDEMPOTENCY_CONFLICT`。
- 业务 identity 使用服务端规范化后计算的 hash：`platform + normalizedAccountLabel + normalized(platformWorkId or platformUrl)`。
- `platformWorkId` 存在时优先作为作品身份；否则使用去 credentials/query/hash 后的规范化 URL。
- 同 tenant 的同一平台作品事实不能登记到多个视频项目；撤销后也不允许以相同 identity 重复创建，需走更正或新平台作品。
- 同一视频不同平台、同平台不同作品允许独立记录，互不覆盖。

## 11. 原子事务

创建登记一次事务写入：

1. `VideoPublishRecord`（version 1）
2. `VideoPublishRecordRevision`（version 1）
3. `VideoPublishFreezeSnapshot`
4. h24/h48 `VideoMetricBackfillNode`（version 1）
5. `VideoActionReceipt`
6. `VideoOperationLog`

任何一步失败全部回滚。in-memory repository 也必须先构造完整结果再一次提交数组，不能留下半成品。

更正/撤销事务必须原子更新 record、追加 revision、receipt 和 operation log；不得修改 freeze snapshot。

## 12. Prisma draft

### 12.1 既有表补强

- `video_unit.version_no`：历史行回填 1。
- `video_export.version_no`：历史数据按 tenant/videoProject 的 `createdAt + id` 稳定排序回填；新增唯一索引。

### 12.2 新表

- `video_publish_record`
- `video_publish_record_revision`
- `video_publish_freeze_snapshot`
- `video_metric_backfill_node`

关键约束：

- 所有表带 `tenant_id`，所有查询与唯一约束包含 tenant。
- publish record 保存 `business_identity_hash`；`tenant_id + business_identity_hash` 唯一。
- revision：`tenant_id + publish_record_id + version_no` 唯一。
- freeze snapshot：`tenant_id + publish_record_id` 唯一且不可更新。
- metric node：`tenant_id + publish_record_id + window_type` 唯一。
- 不创建 platform account、credential、token、upload、sync、P12 表。

Migration 只能作为 draft/static 验证；不得运行真实 MySQL。

## 13. API 范围

- `GET /videos/:videoId/publishing`
- `POST /videos/:videoId/publish-records`
- `GET /videos/:videoId/publish-records`
- `GET /videos/:videoId/publish-records/:publishId`
- `POST /videos/:videoId/publish-records/:publishId/correct`
- `POST /videos/:videoId/publish-records/:publishId/withdraw`

R1 不注册 metric snapshot、decision、upload、sync 或 platform auth 路由。

## 14. 测试 fixture 与验收矩阵

### 14.1 必须 fixture

- publishable current export
- unconfirmed render / missing export / stale export
- blocking reference
- multi-platform publish
- duplicate by work ID / duplicate by normalized URL / cross-project duplicate
- same-token reuse / different-hash conflict
- policy unavailable / malformed policy
- publish gate failed while policy is unavailable（断言门禁错误优先且零写入）
- publish gate passed while policy is unavailable（断言 `CONFIG_MISSING` 且零写入）
- correction / version conflict / withdraw
- transaction failure rollback
- cross-tenant read/write attempt

### 14.2 必须证明

- 成功登记同时得到 record、revision、immutable snapshot、h24/h48 nodes、receipt、log。
- 所有冻结 refs 与当前 P9 链路一致，后续改动不改变历史 snapshot。
- grace 由 fake policy 提供并在节点冻结；无定时器。
- policy/config、门禁、版本和重复错误在写入前发生。
- 门禁失败与策略缺失的错误优先级符合第 6 节，且两类失败都证明六类发布对象零写入。
- 幂等重复不新增任何对象；业务重复与 token 重复使用不同错误码。
- 更正/撤销保留 revision 历史和原因，snapshot 不变。
- DTO/log/storage 不暴露 token、Cookie、完整 URL query、prompt、provider raw payload 或正文。
- Prisma schema、migration 和 repository 字段一致。
- 原有 P8-P9 API/shared/admin tests、typecheck 和 build budget 不回归。

## 15. 正式阻塞标准

- 在没有策略、门禁失败或版本冲突时产生任何发布写入。
- 发布登记没有同步创建两个节点，或需要定时器才能显示 due/overdue。
- 更正/撤销覆盖历史而没有 revision。
- freeze snapshot 可被后续修改，或保存完整正文/prompt/raw payload。
- 同 token 同请求不复用，同 token 不同请求不冲突。
- 同平台同作品业务重复未阻断，或误阻断不同平台/不同作品。
- tenant 过滤缺失，或唯一约束不含 tenant。
- migration 修改/删除 P8-P9 历史资产，或真实数据库被执行。
- 出现平台 token、API、上传、sync、cron、P12 或前端 UI。

## 16. 交付顺序

建议在一个用户授权的 P10-R1 内按内部里程碑执行：

1. R1-preflight：R0 最小合同校正与测试。
2. R1-domain：publishing domain、policy provider、service 门禁与请求 hash。
3. R1-memory：in-memory repository、routes 和 API tests。
4. R1-prisma：schema/migration draft、Prisma repository 和 static/fake client tests。
5. R1-acceptance：独立自动化、API live in-memory、边界和归因验收。

任一里程碑失败先修复，不跳到后续；完成 R1 后停下，未经授权不进入 R2。
