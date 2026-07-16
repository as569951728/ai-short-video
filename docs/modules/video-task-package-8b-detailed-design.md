# 任务包 8b：视频承接后端持久化和接口接入

本文档承接 P8 收口复盘。P8 已完成 `/videos` 前端步骤式承接工作台和 mock/view-model 产品闭环；P8b 的目标是把这套承接能力接成真实后端数据和接口。

P8b 仍然不做旁白、TTS、字幕、渲染、导出、发布和数据回填。它只负责让视频模块能稳定保存“哪个视频项目引用了哪本小说、哪些章节、引用了哪些版本、当前引用是否异常”。

## 研发落地记录（2026-06-23）

- 已新增共享契约 `packages/shared/src/videos.ts`，前后端统一使用 `VideoReadySourceDTO`、`VideoProjectDTO`、`VideoReferenceDetailDTO` 和写动作请求 DTO。
- 已新增后端 `videos` 模块：domain / in-memory repository / Prisma repository / service / Fastify routes。
- 已接入接口：`GET /videos/sources`、`GET /videos`、`POST /videos`、`GET /videos/:videoId/reference`、`POST /videos/:videoId/reference/recheck`、`POST /videos/:videoId/reference/issues/:issueId/resolve`、`POST /videos/:videoId/stop`。
- 已补 Prisma 模型：`VideoProject`、`VideoReferenceChapterSnapshot`、`VideoUnit`、`VideoActionReceipt`、`VideoOperationLog`，并扩展 `VideoReference` / `VideoReferenceIssue` 字段。
- `/videos` 页面在 `VITE_DATA_SOURCE=backend` 时优先走 `videoService` 调用真实 API；`VITE_DATA_SOURCE=mock` 仍保留 P8 原型兜底。
- P8b 只创建引用承接项目和默认视频单元，不触发旁白、TTS、字幕、渲染、发布或平台回填。

## 验收收口状态（2026-06-23）

- 测试会话已完成 P8b 正式独立验收，结论为可接受风险。
- 需求主控接受该风险并收口，收口复盘见 `docs/reviews/video-p8b-acceptance-closure-2026-06-23.md`。
- 已通过范围：共享 DTO、Prisma schema validate、后端 API 自动化、前端 API/mock smoke、页面边界和安全脱敏检查。
- 已接受风险：真实 MySQL migrate / live smoke 未覆盖，需要在 P9 前或准生产前安排轻量技术补验。
- 工程质量复巡新增 P1：route schema 与 shared DTO / 文档存在合同漂移。该项已通过 P8b-H1 小包修正并完成测试会话正式复验，结论为通过，记录见 `docs/modules/video-p8b-hardening-plan.md`。
- 当前仍不启动旁白、TTS、字幕、渲染、导出、发布和数据回填；P9/P10 必须等待用户明确确认。

## 目标

- 视频列表读取真实 `VideoProject` 数据，不再只依赖前端 mock。
- 从 `video_ready` 小说创建视频项目时，真实保存 `VideoProject`、`VideoReference`、`VideoReferenceChapterSnapshot` 和默认 `VideoUnit`。
- 创建、重检、异常处理、停止项目都有幂等、防重复和操作日志。
- 引用快照能对照小说当前章节版本识别 `normal / info / warning / blocking / resolved`。
- 前端 P8 工作台优先使用 API，失败时给出明确错误和下一步建议。

## 范围

### 本包做

- 新增视频模块共享 DTO 和请求类型。
- 新增视频模块后端 domain / repository / service / routes。
- 新增或补齐 Prisma 数据模型和迁移。
- 前端新增 `videoService`，把 `/videos` 页面从本地 mock 切到 API 优先。
- 保留 mock 模式作为原型兜底，但真实 API 模式必须可完成主流程。
- 覆盖接口测试、前端 service / view-model 测试和页面 smoke。

### 本包不做

- 不创建旁白稿、音频、字幕、视觉方案、渲染产物、导出文件。
- 不接 TTS、视频渲染工具、对象存储、短视频平台。
- 不做视频详情生产工作台。
- 不做短视频单元拆分和系列管理；只创建默认 `VideoUnit`。
- 不做逐字 diff；只做章节版本、章节范围和摘要级差异。

## 数据模型

P8b 需要补齐以下模型。字段命名以 Prisma schema 为准，中文说明用于研发对齐。

### VideoProject

视频项目主表。

关键字段：

- `id`
- `tenantId`
- `novelId`
- `videoReadinessSnapshotId`
- `title`
- `projectType`: `first_test | chapter_range | full_book_seed`
- `lifecycleStatus`: `active | stopped | archived`
- `referenceStatus`: `normal | info | warning | blocking | resolved`
- `productionStatus`: `not_started | ready_for_generation | generation_locked`
- `currentVideoReferenceId`
- `defaultVideoUnitId`
- `chapterRangeText`
- `chapterCount`
- `createdBy`
- `updatedBy`
- `createdAt`
- `updatedAt`
- `deletedAt`
- `metadata`

索引：

- `tenantId + lifecycleStatus + updatedAt`
- `tenantId + novelId + createdAt`
- `tenantId + referenceStatus + updatedAt`

### VideoReference

引用快照主表。已有模型需要补字段，不要另起 `VideoReferenceSnapshot`。

补齐字段：

- `versionNo`
- `sourceVersionRefs`
- `referenceSummary`
- `chapterRangeText`
- `chapterCount`
- `status`
- `createdBy`
- `updatedAt`
- `metadata`

保留 `chapterIdsJson` 和 `chapterContentVersionIdsJson` 作为摘要字段，但唯一事实源应是 `VideoReferenceChapterSnapshot`。

### VideoReferenceChapterSnapshot

每个引用章节的版本快照。

关键字段：

- `id`
- `tenantId`
- `videoReferenceId`
- `novelId`
- `chapterId`
- `chapterNo`
- `chapterTitle`
- `contentVersionId`
- `chapterUpdatedAt`
- `wordCount`
- `summary`
- `riskLevel`
- `createdAt`

索引：

- `tenantId + videoReferenceId + chapterNo`
- `tenantId + novelId + chapterId`

### VideoUnit

默认视频单元。P8b 只创建 1 条默认单元，不做拆条。

关键字段：

- `id`
- `tenantId`
- `videoProjectId`
- `videoReferenceId`
- `unitNo`
- `unitType`: `first_test`
- `title`
- `chapterRangeText`
- `chapterIdsJson`
- `status`: `reference_ready`
- `productionStatus`: `not_started`
- `createdAt`
- `updatedAt`
- `metadata`

### VideoReferenceIssue

已有模型需要补处理字段。

补齐字段：

- `issueType`: `chapter_version_changed | chapter_removed | snapshot_missing | readiness_changed`
- `issueLevel`: `info | warning | blocking`
- `resolutionAction`: `ignore | resolve | stop_project`
- `resolutionReason`
- `resolvedBy`
- `updatedAt`

规则：

- `return_to_novel` 只作为前端推荐动作或导航动作，不能作为后端异常处理写动作。
- `blocking` 不能被 `ignore` 直接解锁。
- `ignore / resolve / stop_project` 都必须写原因。
- 处理后需要写 `OperationLog`。

### VideoActionReceipt

同步写动作的幂等收据，避免把 `OperationLog` 当唯一约束表使用。

关键字段：

- `id`
- `tenantId`
- `videoProjectId`
- `actionType`
- `idempotencyToken`
- `requestHash`
- `resultObjectType`
- `resultObjectId`
- `createdBy`
- `createdAt`
- `metadata`

唯一约束：

- `tenantId + actionType + idempotencyToken`

规则：

- 同 `tenantId + actionType + idempotencyToken` 且同 `requestHash`：复用已有结果。
- 同 `tenantId + actionType + idempotencyToken` 但不同 `requestHash`：返回 `IDEMPOTENCY_CONFLICT`。

## 接口

所有接口使用统一响应结构。所有写接口必须有 JSON schema，必须带 `idempotencyToken`。

### GET /videos/sources

用途：读取可创建视频项目的小说来源。

查询参数：

- `page`
- `pageSize`
- `keyword`

只返回 `creationStage=video_ready` 且有 `currentVideoReadinessSnapshotId` 的小说。

返回：`VideoReadySourceListDTO`。

### GET /videos

用途：读取视频项目列表。

查询参数：

- `page`
- `pageSize`
- `keyword`
- `novelId`
- `referenceStatus`
- `lifecycleStatus`
- `productionStatus`

返回：`VideoProjectListDTO`。

### POST /videos

用途：创建视频项目、保存引用快照、创建默认视频单元。

请求：

```json
{
  "idempotencyToken": "create-video-20260623-001",
  "novelId": "novel_000001",
  "videoReadinessSnapshotId": "vrs_000001",
  "title": "化学大秦：第 1-3 章",
  "projectType": "first_test",
  "chapterRange": {
    "mode": "first_recommended",
    "chapterIds": []
  },
  "duplicatePolicy": "return_existing"
}
```

规则：

- 小说必须是 `video_ready`。
- `videoReadinessSnapshotId` 必须等于小说当前待视频化快照，除非明确允许创建历史快照项目；P8b 默认不允许历史快照。
- `duplicatePolicy=return_existing` 时，如果同一小说、同一章节范围已有 active 项目，返回已有项目并提示用户。
- 创建成功后写入 `VideoProject`、`VideoReference`、`VideoReferenceChapterSnapshot`、默认 `VideoUnit`、`VideoActionReceipt`、`OperationLog`。
- 不创建任何视频生成任务。

### GET /videos/:videoId/reference

用途：查看引用快照详情。

返回：`VideoReferenceDetailDTO`，包含项目、引用快照、章节快照、引用异常和下一步推荐动作。

### POST /videos/:videoId/reference/recheck

用途：重新检测引用状态。

请求：

```json
{
  "idempotencyToken": "recheck-video-ref-20260623-001",
  "expectedReferenceVersion": 1
}
```

规则：

- 根据 `VideoReferenceChapterSnapshot.contentVersionId` 对比小说当前章节正文版本。
- 只有版本不一致、章节被删除、待视频化快照缺失等情况才生成 issue。
- 没有异常时，项目 `referenceStatus=normal`。
- 有 `warning/blocking` 时，项目同步更新引用状态。
- recheck 是 P8b 同步轻量动作，不创建长任务；后续数据量变大再升级为任务。

### POST /videos/:videoId/reference/issues/:issueId/resolve

用途：处理引用异常。

请求：

```json
{
  "idempotencyToken": "resolve-video-issue-20260623-001",
  "action": "resolve",
  "reason": "已回小说处理并重新确认章节版本。"
}
```

规则：

- `ignore` 只能处理 `info/warning`，不能处理 `blocking`。
- `resolve` 需要重新检测后才允许把项目恢复为 `normal` 或 `resolved`。
- `stop_project` 会把项目 `lifecycleStatus=stopped`，`productionStatus=generation_locked`。
- 所有动作必须写 `VideoActionReceipt` 和 `OperationLog`。

### POST /videos/:videoId/stop

用途：停止视频项目。

请求：

```json
{
  "idempotencyToken": "stop-video-20260623-001",
  "reason": "引用小说方向已调整，停止当前项目。"
}
```

规则：

- 必须填写原因。
- 停止后不能进入 P9 生成链路。

## 前端交互

- `/videos` 页面保持 P8 的步骤式工作台结构。
- API 模式下优先调用 `videoService`。
- 加载状态需要区分：加载来源、加载列表、创建中、重检中、异常处理中。
- 创建项目成功后：
  - 列表出现真实项目。
  - 自动跳转到“引用快照”步骤。
  - 展示 `VideoReference vN`、章节快照和默认视频单元。
- 幂等复用已有项目时：
  - 明确提示“已复用刚才创建的视频项目”。
  - 不重复新增列表行。
- 幂等冲突时：
  - 展示“同一幂等令牌绑定了不同请求，请刷新后重新提交”。
  - 不修改当前页面已有项目。
- 引用 blocking 时：
  - 后续生成步骤保持灰态。
  - 主动作变为“处理异常”。

## 验收标准

测试会话至少验证：

1. `GET /videos/sources` 只返回 `video_ready` 小说。
2. `POST /videos` 能从 `video_ready` 小说创建真实视频项目。
3. 创建成功后真实保存 `VideoProject`、`VideoReference`、章节快照、默认 `VideoUnit`。
4. 同 `idempotencyToken` + 同请求重复提交复用同一项目。
5. 同 `idempotencyToken` + 不同请求返回 `IDEMPOTENCY_CONFLICT`。
6. 非 `video_ready` 小说不能创建项目。
7. 重复项目默认返回已有项目或提示重复，不产生不可控重复数据。
8. `GET /videos` 能分页、筛选、展示引用小说、章节范围、引用状态和推荐动作。
9. `GET /videos/:videoId/reference` 能展示章节快照和引用异常。
10. `POST /videos/:videoId/reference/recheck` 能识别章节版本变化并生成 issue。
11. `blocking` issue 不能通过 `ignore` 解锁。
12. `ignore / resolve / stop_project / stop` 必须填写原因并写入操作日志。
13. `/videos` 前端 API 模式主流程可用，mock 模式仍能打开。
14. 页面仍然没有可执行的旁白、TTS、字幕、渲染、发布、数据回填入口。
15. 普通日志、前端响应和任务摘要不暴露密钥、完整提示词、完整模型响应或完整章节正文。

## 阻塞标准

出现以下情况，P8b 应判定阻塞：

- 非 `video_ready` 小说可以创建视频项目。
- 创建项目没有保存章节版本快照。
- 重复提交创建重复项目或幂等冲突判断错误。
- 写接口缺少 `idempotencyToken` 或缺少 `VideoActionReceipt`。
- 引用重检不能识别章节版本变化。
- `blocking` 异常能被忽略或绕过。
- 停止项目不要求原因。
- 前端出现可点击的视频生成、字幕、渲染、发布或数据回填主动作。
- 接口返回完整章节正文、完整提示词、完整模型响应或密钥。

## 后续关系

- P8b 通过后，可以进入 P9 视频生成工作台。
- P9 不需要重做视频项目/引用快照地基，只在 P8b 的 `VideoProject` 和 `VideoUnit` 上扩展生成产物。
- 如果 P8b 因数据库环境限制无法完成真实 MySQL 验收，必须至少完成 in-memory 接口验收、Prisma schema 迁移检查和明确风险记录，不能直接跳 P9。
