# 小说系统接口契约 v1

## 文档目的

本文档定义小说系统首期研发的接口边界、动作语义、幂等要求和返回结构。它用于指导 Fastify route、schema、service 方法和前端 service 封装。

接口风格必须遵守：

- 所有写接口必须有输入 schema。
- 所有响应使用统一响应结构。
- 长耗时动作返回任务摘要，不直接等待完整生成结果。
- 高风险动作必须显式表达业务动作，不提供任意字段 PATCH 核心资产。
- 业务动作接口必须重新校验门禁、版本和冲突任务，不能信任前端传回的状态摘要。

## 统一响应结构

```text
ApiResponse<T>
  success
  data
  error
    code
    message
    details
  requestId
```

分页：

```text
PagedResult<T>
  items[]
  page
  pageSize
  total
```

任务动作返回：

```text
ActionResult
  novelId
  statusSummary
  task
  candidate
  affectedObjects[]
  nextAction
```

## 通用请求头和幂等

写接口建议支持：

```text
Idempotency-Key
X-Request-Id
```

高风险动作体内还需要：

```text
confirm
reason
pageVersionSnapshot
currentVersionId
```

幂等语义：

- 同一 `Idempotency-Key` + 相同请求参数，返回已有任务或已有动作结果。
- 同一 `Idempotency-Key` + 不同请求参数，返回 `IDEMPOTENCY_CONFLICT`。
- 重复点击生成、确认、取消、重试不能产生重复任务或重复版本切换。

## 通用错误码

| 错误码 | 含义 |
| --- | --- |
| `VALIDATION_ERROR` | 请求参数不合法 |
| `NOT_FOUND` | 对象不存在 |
| `PERMISSION_DENIED` | 无权限 |
| `LIFECYCLE_NOT_ACTIVE` | 小说已暂停、归档或删除 |
| `INVALID_STAGE` | 当前阶段不允许该动作 |
| `GATE_BLOCKED` | 门禁阻塞 |
| `CONFLICT_TASK_EXISTS` | 存在冲突任务 |
| `VERSION_CONFLICT` | 页面版本或当前版本已变化 |
| `CANDIDATE_STALE` | 候选已过期 |
| `IDEMPOTENCY_CONFLICT` | 幂等键对应不同请求 |
| `CONFIG_MISSING` | 模型、策略或模板配置缺失 |
| `TASK_NOT_RETRYABLE` | 当前失败不可重试 |
| `CONTENT_RISK_BLOCKING` | 内容安全强阻塞 |
| `VIDEO_REFERENCE_BLOCKING` | 视频引用异常阻塞 |

## 查询接口

### 获取创建选项

```text
GET /novels/create-options
```

返回：

- 默认题材。
- 爽点选项。
- 章节数和字数建议。
- 默认策略版本。
- 可用热点机会点摘要。

### 小说列表

```text
GET /novels?page=&pageSize=&keyword=&lifecycleStatus=&creationStage=&videoReferenceStatus=
```

返回 `NovelListItemDTO[]`：

- 小说基础信息。
- `statusSummary`。
- 评分摘要。
- 章节进度。
- 视频引用摘要。
- 最近任务摘要。

列表主动作仍为“详情”。列表不直接承载复杂生成、采用和创建视频动作。

### 小说详情

```text
GET /novels/:novelId
```

返回 `NovelDetailDTO`：

- 小说基础信息。
- `statusSummary`。
- 当前方向、设定、大纲、章节目录摘要。
- 章节统计。
- 最新试写批次 `latestTrialRun`。
- 正文生成策略快照 `bodyStrategySnapshot`。
- 最近任务。
- 阻塞原因。
- 视频化摘要。

### 列表行展开摘要

```text
GET /novels/:novelId/summary
```

返回：

- 最近任务。
- 最近审稿摘要。
- 待处理章节。
- 风险提示。
- 推荐动作说明。

### 章节详情

```text
GET /novels/:novelId/chapters/:chapterId
```

返回 `ChapterWorkbenchDTO`：

- 章节基础信息。
- 当前正文/试写版本。
- 当前特性卡。
- 审稿报告。
- 候选版本列表。
- 审稿问题列表。
- 最近任务。
- 推荐动作。

### 任务详情

```text
GET /tasks/:taskId
GET /tasks/:taskId/events
```

返回：

- 主状态。
- 当前步骤。
- 进度。
- 失败分类。
- 可重试建议。
- 关联产物。
- 事件列表。

## 创建小说与方向接口

### 创建草稿

```text
POST /novels/drafts
```

请求：

```text
hotspotReportId
hotspotOpportunityId
preferences
chapterLimit
chapterWordRange
```

结果：

- 创建 `Novel(lifecycleStatus=active, creationStage=draft, stageStatus=not_started)`。
- 保存 `CreateNovelPreferences`。
- 返回小说详情和状态摘要。

### 生成方向

```text
POST /novels/:novelId/directions/generate
```

规则：

- 校验小说处于 `draft` 或 `direction`。
- 无方向冲突任务。
- 创建 `novel_direction_generate` 任务。
- 返回任务摘要。

### 融合或优化方向

```text
POST /novels/:novelId/directions/fuse
POST /novels/:novelId/directions/:versionId/optimize
```

规则：

- 结果进入方向候选版本。
- 不直接替换当前方向。

### 确认方向

```text
POST /novels/:novelId/directions/:versionId/adopt
```

请求：

```text
reason
confirmLowScore
pageVersionSnapshot
```

规则：

- 走统一资产采用服务。
- 当前方向切换为该版本。
- 旧设定、大纲、章节目录候选按规则过期。
- 小说进入 `creationStage=setting`。
- 返回新的 `statusSummary`。

## 设定、大纲、章节目录接口

### 生成设定

```text
POST /novels/:novelId/settings/generate
```

创建 `novel_setting_generate` 任务。

### 采用设定

```text
POST /novels/:novelId/settings/:versionId/adopt
```

规则：

- 当前方向必须有效。
- 设定候选字段完整。
- 高风险采用必须填原因。
- 采用后进入 `outline`。

### 生成全书大纲

```text
POST /novels/:novelId/outlines/generate
```

创建 `novel_outline_generate` 任务。

### 采用全书大纲

```text
POST /novels/:novelId/outlines/:versionId/adopt
```

采用后允许生成阶段大纲，仍归于 `outline` 阶段。

### 生成阶段大纲

```text
POST /novels/:novelId/stage-outlines/generate
```

创建 `stage_outline_generate` 任务。

### 采用阶段大纲

```text
POST /novels/:novelId/stage-outlines/:versionId/adopt
```

采用后进入 `chapter_plan`。

### 生成章节目录

```text
POST /novels/:novelId/chapter-plans/generate
```

创建 `chapter_plan_generate` 任务。

### 采用章节目录

```text
POST /novels/:novelId/chapter-plans/:versionId/adopt
```

规则：

- 创建或刷新 `NovelChapter`。
- 已有正文时必须生成影响提示，不静默清空。
- 采用后进入 `trial`。

## 试写与正文接口

### 生成试写

```text
POST /novels/:novelId/trial/generate
```

请求：

```text
chapterCount
trialRunId
selectedCandidateId
```

规则：

- 章节目录当前版本有效。
- 不带 `trialRunId` 时创建 `trial_writing_generate` 任务，默认生成 3 个完整第 1 章候选，可支持 2/3/5。
- 第 1 章候选包含完整正文、开篇看点、首句、前 300 字摘要、结尾钩子、评分、风险、AI 推荐理由。
- AI 推荐候选只高亮，不自动选择。
- 带 `trialRunId` 和 `selectedCandidateId` 时，标记第 1 章候选为试写选中版本，再生成第 2-3 章、章节特性卡、单章审稿和试写总评。
- 选择第 1 章候选前，不能生成第 2-3 章。
- 第 2 章硬门槛失败时试写批次进入阻塞，不生成第 3 章。
- 评分需要返回 `scoringStrategyVersion`、维度分、权重、证据、扣分点和门禁结论。

### 确认试写通过

```text
POST /novels/:novelId/trial/confirm
```

请求：

```text
trialRunId
decision
reason
confirmRisk
```

规则：

- 试写总评通过或用户确认风险。
- 写入试写决策。
- 风险继续必须带 `confirmRisk=true` 和原因。
- 生成版本化 `BodyGenerationStrategySnapshot`，当前实现通过 `CreativeVersion.objectType=body_strategy_snapshot` 承载。
- 小说进入 `body`。

### 批量生成正文

```text
POST /novels/:novelId/chapters/batch-generate
```

请求：

```text
strategySnapshotId
expectedStrategySnapshotVersion
startChapterNo?
endChapterNo?
idempotencyKey?
```

规则：

- 只能读取已确认、未过期、来源版本一致的 `BodyGenerationStrategySnapshot`。
- 请求体不能接受前端传入的任意 `strategy` 对象。
- 默认 5 章一批，不能一键无门禁生成全书。
- 第 1-3 章试写版本未正式化为当前正文时阻塞。
- 创建父任务 `body_batch_generate`，任务事件记录当前章节、失败/暂停和批次总结。
- 每章生成 `ChapterContentVersion`、`ChapterFeatureCard`、单章 `ReviewReport` 和 `LongTermMemory`。
- 硬失败时保留已完成章节，后续章节不继续生成。
- 全部正文章节完成后只把状态提示推进到“待全书审稿”，不创建正式全书审稿任务。

### 生成或重写单章

```text
POST /novels/:novelId/chapters/:chapterId/generate
POST /novels/:novelId/chapters/:chapterId/rewrite
```

单章生成请求：

```text
strategySnapshotId
expectedStrategySnapshotVersion
reason?
```

重写请求：

```text
instruction
reason
currentContentVersionId
```

规则：

- 绑定章节级冲突键。
- 重写结果默认进入候选正文版本。
- 不直接覆盖当前正文。

### 采用章节正文候选

```text
POST /novels/:novelId/chapters/:chapterId/content-versions/:versionId/adopt
```

请求：

```text
reason
currentContentVersionId
pageVersionSnapshot
```

规则：

- 走统一资产采用服务。
- 触发章节复审、长篇记忆同步和影响评估。
- 被视频引用时生成或更新引用异常。

### 保存手动编辑

```text
POST /novels/:novelId/chapters/:chapterId/manual-edits
```

规则：

- 保存为新的候选或当前版本，具体由请求 `saveMode` 决定。
- 若 `saveMode=current`，必须走高风险确认和副作用处理。

## 审稿、影响和完成接口

### 章节审稿

```text
POST /novels/:novelId/chapters/:chapterId/review
```

创建 `chapter_review` 任务，报告自动保存。

### 影响评估

```text
POST /novels/:novelId/chapters/:chapterId/impact-assessments
GET /novels/:novelId/impact-cases/:impactCaseId
POST /novels/:novelId/impact-cases/:impactCaseId/resolve
```

规则：

- 中等或严重影响未关闭时阻塞全书审稿和待视频化。
- 手动确认无影响必须填原因。
- 用户可见状态统一为 `assessing`、`waiting_decision`、`handling`、`resolved`、`ignored`、`cancelled`。

### 全书审稿

```text
POST /novels/:novelId/full-review
```

规则：

- 所有计划章节有当前正文和摘要。
- 无待处理章节。
- 无未关闭中等或严重影响。
- 创建 `novel_full_review` 任务。

### 确认小说完成

```text
POST /novels/:novelId/completion/confirm
```

请求：

```text
reviewReportId
fullReviewGateId
decision
reason
confirmRisk
```

规则：

- 全书审稿有效。
- 完成门禁允许。
- 写 `CompletionDecisionRecord`。
- 小说进入或保持 `completion_confirm`，并触发待视频化检查。

## 待视频化和视频引用接口

### 获取待视频化检查

```text
GET /novels/:novelId/video-readiness
```

返回：

- 检查清单。
- 阻塞项。
- 可引用章节范围。
- 首条视频建议。
- 最近快照。

### 重新检查待视频化

```text
POST /novels/:novelId/video-readiness/recheck
```

创建 `video_readiness_check` 任务或同步检查记录。

### 确认待视频化

```text
POST /novels/:novelId/video-readiness/confirm
```

请求：

```text
completionDecisionId
checkVersion
reason
confirmRisk
```

规则：

- 生成 `VideoReadinessSnapshot`。
- 小说进入 `creationStage=video_ready`。
- 返回视频模块可引用入口。

### 创建视频项目

```text
POST /videos
```

请求：

```text
novelId
videoReadinessSnapshotId
chapterRange
title
```

规则：

- 只从视频模块发起。
- 校验小说处于可视频化。
- 保存 `VideoReference`。
- 不修改小说正文。

### 重新检查视频引用

```text
POST /videos/:videoId/reference/recheck
```

返回引用异常和建议动作。

## 生命周期接口

### 暂停、恢复、归档、恢复归档、删除

```text
POST /novels/:novelId/pause
POST /novels/:novelId/resume
POST /novels/:novelId/archive
POST /novels/:novelId/unarchive
DELETE /novels/:novelId
```

规则：

- 都必须写操作日志。
- 暂停和归档不改变 `creationStage`。
- 删除优先软删除。
- 已被视频引用或已发布的小说删除前必须强提醒。

## 任务控制接口

```text
POST /tasks/:taskId/retry
POST /tasks/:taskId/cancel
```

规则：

- 重试创建新任务，原失败任务保持 `failed`。
- 取消需要记录原因。
- 任务状态变化后重新计算小说状态摘要。

## 前端 service 分层

前端必须通过模块 service 调用接口：

```text
modules/novels/services/novelService.ts
modules/novels/services/chapterService.ts
modules/novels/services/taskService.ts
modules/videos/services/videoService.ts
```

页面不能直接调用裸 `fetch` 或 `axios`。

## 接口验收重点

- 每个写接口有 schema。
- 每个任务创建接口支持幂等。
- 每个高风险动作校验页面版本或当前版本。
- 每个动作返回新的 `statusSummary`。
- 每个失败返回用户可理解原因和下一步建议。
- 任务接口不返回完整提示词、完整模型响应和密钥。
