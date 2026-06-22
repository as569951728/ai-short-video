# 小说系统核心数据契约 v1

## 文档目的

本文档把小说系统首期研发需要落库和传输的核心对象收束成数据契约。它用于指导 Prisma schema、repository、接口 DTO 和测试造数。

本文档仍是需求级契约，不等于最终数据库字段。后端实现时必须同时对照：

- `docs/architecture.md` 的数据模型草案。
- `docs/modules/novel-development-contract.md`
- `docs/modules/novel-state-gate-action-contract.md`
- `docs/modules/novel-asset-adoption-staleness-contract.md`
- `docs/modules/novel-task-concurrency-contract.md`
- `docs/backend-implementation-checklist.md`

## 数据设计原则

- 数据库要能还原“谁在什么时候、基于什么版本、为什么做了什么、影响了哪些内容”。
- 核心状态必须少，展示状态可以推导或缓存。
- AI 产物默认先进入候选、报告或快照，用户确认后才成为正式资产。
- 重要创作资产不能原地覆盖，必须追加版本。
- 任务和版本必须记录输入版本摘要，防止旧上下文写入新资产。
- 高风险操作必须有决策记录和操作日志。
- API Key、密钥、完整提示词、完整模型响应不能进入普通日志、任务摘要或前端响应。

## 首期实体分层

### P0 必建实体

| 实体 | 作用 |
| --- | --- |
| `Novel` | 小说项目主表，只保存核心状态和当前引用 |
| `CreateNovelPreferences` | 创建偏好、热点来源和初始约束 |
| `CreativeVersion` | 通用创作资产版本，承载方向、设定、大纲、章节目录等候选和当前版本 |
| `NovelChapter` | 章节计划和章节当前状态 |
| `ChapterFeatureCard` | 章节摘要/特性卡片版本 |
| `ChapterContentVersion` | 章节正文版本 |
| `ReviewReport` | 方向、设定、大纲、章节、全书等审稿报告 |
| `GenerationTask` | 异步任务主记录 |
| `GenerationTaskEvent` | 任务事件和进度记录 |
| `AssetDecisionRecord` | 候选采用、放弃、强制继续、历史恢复等决策 |
| `OperationLog` | 高风险操作日志 |
| `ImpactCase` | 章节重写或上游变化产生的影响案例 |
| `LongTermMemory` | 长篇记忆和事实约束摘要 |
| `BodyBatch` / 批次总结 | 批量正文父任务、章节结果和批次总结；首期可随任务 metadata 或 in-memory 聚合承载，真实 MySQL 验收前再决定是否拆独立表 |
| `TrialRun` | 试写批次和试写总评 |
| `TrialChapterResult` | 试写章节结果引用 |
| `FullReviewGate` | 全书审稿后的完成门禁 |
| `CompletionDecisionRecord` | 用户确认完成或强制完成记录 |
| `VideoReadinessSnapshot` | 待视频化检查和可引用内容快照 |
| `VideoReference` | 视频项目引用小说章节的版本快照 |
| `VideoReferenceIssue` | 小说修改后产生的视频引用异常 |

### P0 可简化实体

| 实体 | 简化口径 |
| --- | --- |
| `HotspotReport` | 可先只保存标题、来源、机会点和风险标签 |
| `ModelProvider` / `ModelConfig` | 可先用种子数据或环境配置 |
| `PromptTemplateVersion` | 可先保存模板 key、版本号和摘要 |
| `PolicyProfileVersion` | 可先保存默认阈值和策略 JSON |
| `CostRecord` | 可先挂在任务上，后续拆独立表 |

### 后续扩展实体

| 实体 | 后续能力 |
| --- | --- |
| `PublishRecord` | 平台发布、链接、发布时间和 24/48 小时数据 |
| `LearningSignal` | 成功/失败案例、用户决策和策略复盘 |
| `Tenant` / `UserRole` / `Permission` | 完整售卖、团队和 SaaS 权限 |
| `VideoAsset` | 音频、字幕、渲染文件、素材引用 |

## 通用字段

核心表默认保留：

```text
id
tenantId
createdBy
updatedBy
createdAt
updatedAt
deletedAt
metadata
```

业务归属表额外保留：

```text
ownerId
novelId
```

版本和任务表额外保留：

```text
sourceTaskId
sourceVersionRefs
promptTemplateVersionId
policyProfileVersionId
```

## Novel

小说主表是状态和当前资产引用的入口，不保存正文和大字段。

```text
id
tenantId
ownerId
title
channel
genres[]
lifecycleStatus
creationStage
stageStatus
currentDirectionVersionId
currentSettingVersionId
currentOutlineVersionId
currentStageOutlineVersionId
currentChapterPlanVersionId
currentTrialRunId
currentFullReviewReportId
currentFullReviewGateId
currentCompletionDecisionId
currentVideoReadinessSnapshotId
policyProfileVersionId
hotspotReportId
chapterLimit
chapterWordMin
chapterWordMax
summary
pauseReason
archiveReason
deletedAt
createdAt
updatedAt
```

事实源字段：

- `lifecycleStatus`
- `creationStage`
- `stageStatus`
- 当前资产版本引用。

可缓存字段：

- `displayStatus`
- `currentStep`
- `completedSteps`
- `recommendedActionSnapshot`
- `videoReferenceStatus`

缓存字段可以放在主表或独立摘要表，但不能作为业务动作放行依据。

## CreativeVersion

通用版本表用于方向、设定、大纲、阶段大纲、章节目录等结构化资产。

```text
id
tenantId
novelId
objectType
objectId
versionNo
status
staleLevel
sourceType
sourceTaskId
sourceVersionRefs
changeReason
contentJson
summary
score
riskLevel
reviewReportId
promptTemplateVersionId
policyProfileVersionId
decisionRecordId
createdBy
createdAt
```

`objectType` 建议包含：

- `direction`
- `setting`
- `outline`
- `stage_outline`
- `chapter_plan`
- `chapter_feature_card`
- `video_readiness_check`

`status` 统一为：

- `candidate`
- `current`
- `historical`
- `discarded`
- `stale`

`staleLevel` 统一为：

- `none`
- `soft_stale`
- `risk_stale`
- `hard_stale`

约束：

- 同一 `novelId + objectType + objectId` 同一时间只能有一个 `current`。
- 候选采用必须写 `decisionRecordId`。
- `contentJson` 只保存结构化产物，不保存完整模型响应。

## CreateNovelPreferences

创建偏好用于复现方向生成上下文。

```text
id
tenantId
novelId
hotspotReportId
hotspotOpportunityId
appealPoints[]
genres[]
openingState
blockedElements[]
targetAudience
chapterLimit
chapterWordMin
chapterWordMax
stageCount
customIdea
style
videoAdaptationPreference
createdBy
createdAt
```

## NovelChapter

章节表保存章节顺序、当前版本引用和处理状态。

```text
id
tenantId
novelId
chapterNo
stageIndex
title
wordTarget
wordCount
mainStatus
statusNote
impactLevel
currentFeatureCardVersionId
currentContentVersionId
currentReviewReportId
lastGenerationTaskId
createdAt
updatedAt
```

`mainStatus` 只保留：

- `normal`
- `pending`
- `processing`
- `resolved`

章节是否有正文、是否有审稿、是否被视频引用，优先通过当前版本、审稿报告和引用快照推导。

## ChapterFeatureCard

章节摘要/特性卡片可以作为独立表，也可以用 `CreativeVersion.objectType=chapter_feature_card` 保存。首期推荐独立表，便于章节列表和生成上下文快速读取。

```text
id
tenantId
novelId
chapterId
versionNo
status
staleLevel
oneLineSummary
coreTask
mainConflict
appealPoint
emotionKeywords[]
characterChanges[]
relationshipChanges[]
keyInformation[]
foreshadowingOperation
endingHook
factsCannotChange[]
featuresToStrengthen[]
sourceTaskId
decisionRecordId
createdAt
```

## ChapterContentVersion

章节正文必须独立保存，不能塞进主表。

```text
id
tenantId
novelId
chapterId
versionNo
status
staleLevel
sourceType
sourceTaskId
sourceVersionRefs
rewriteReason
content
wordCount
summary
reviewScore
decisionRecordId
createdBy
createdAt
```

约束：

- 同一章节只能有一个 `current` 正文版本。
- 重写、手动编辑、历史恢复都追加新版本。
- 正文版本变化后必须让章节审稿、长篇记忆、全书审稿和视频化快照按规则过期。

## ReviewReport

审稿报告统一承载方向、设定、大纲、章节、试写、全书和视频化检查的评审结果。

```text
id
tenantId
novelId
objectType
objectId
objectVersionId
reviewLevel
totalScore
subScoresJson
rating
summary
strengthsJson
problemsJson
suggestionsJson
issueCardsJson
actionOptionsJson
recommendedAction
allowNextStep
blockingIssueCount
resolvedStatus
promptTemplateVersionId
policyProfileVersionId
sourceTaskId
createdAt
```

报告自动保存，但不能直接替用户确认完成或采用候选。

## GenerationTask

任务表是所有长耗时动作的统一入口。

```text
id
tenantId
novelId
taskType
objectType
objectId
parentTaskId
batchId
status
statusNote
progress
currentStep
triggerSource
sourceVersionRefs
conflictScope
conflictKey
promptTemplateVersionId
policyProfileVersionId
inputSummary
outputSummary
inputTokens
outputTokens
estimatedCost
actualCost
retryCount
maxRetries
failureCategory
errorCode
errorMessage
retryOfTaskId
idempotencyToken
requestHash
resultObjectType
resultObjectId
resultVersionId
userAcceptedResult
startedAt
finishedAt
lastHeartbeatAt
cancelRequestedAt
cancelReason
createdAt
```

任务状态只允许：

- `queued`
- `processing`
- `waiting_confirmation`
- `completed`
- `failed`
- `cancelled`

活跃任务：

- `queued`
- `processing`
- `waiting_confirmation`

同一 `conflictScope + conflictKey` 下只能存在一个改变事实源的活跃任务。

## AssetDecisionRecord

候选采用、放弃、继续优化、强制继续和历史恢复都写决策记录。

```text
id
tenantId
novelId
actionType
objectType
objectId
candidateVersionId
currentVersionIdBefore
currentVersionIdAfter
decisionReason
isForced
riskSummary
impactSummary
pageVersionSnapshot
sourceTaskId
createdBy
createdAt
```

`actionType` 建议包含：

- `adopt_candidate`
- `discard_candidate`
- `force_adopt`
- `restore_history`
- `continue_optimize`
- `confirm_no_impact`
- `clear_following_chapters`

## ImpactCase

影响案例用于记录章节重写、上游资产变化、长篇记忆变化对后续章节和视频引用的影响。

```text
id
tenantId
novelId
sourceObjectType
sourceObjectId
sourceOldVersionId
sourceNewVersionId
impactLevel
status
affectedChapterIds[]
affectedVideoReferenceIds[]
summary
suggestedActionsJson
decisionRecordId
sourceTaskId
createdAt
resolvedAt
```

`impactLevel`：

- `none`
- `minor`
- `medium`
- `severe`

`status`：

- `open`
- `processing`
- `resolved`
- `ignored`

中等和严重影响未关闭时，不能进入全书审稿或待视频化。

## LongTermMemory

长篇记忆用于后续章节生成和全书审稿，不面向小白用户直接展示全部细节。

```text
id
tenantId
novelId
chapterId
sourceContentVersionId
previousSummary
characterStatesJson
relationshipStatesJson
locationsJson
organizationsJson
itemsJson
plantedForeshadowingJson
resolvedForeshadowingJson
unresolvedConflictsJson
newSettingsJson
factsCannotContradictJson
status
staleLevel
sourceTaskId
createdAt
```

## TrialRun 与 TrialChapterResult

试写是从章节目录进入批量正文前的门禁。

任务包 5 首版约定：

- 第 1 章多候选正文使用 `ChapterContentVersion` 承载，候选评分证据放在版本 `metadata.scoring` 和审稿报告中。
- 用户选择的第 1 章候选在展示契约中标记为 `selected_for_trial`，未选候选保留为历史。
- 第 2-3 章试写正文、章节特性卡和单章审稿分别使用 `ChapterContentVersion`、`ChapterFeatureCard`、`ReviewReport` 承载。
- 试写总评使用 `ReviewReport.objectType=trial_run` 承载。
- 试写通过或用户确认风险继续后，正文生成策略快照使用 `CreativeVersion.objectType=body_strategy_snapshot` 承载，不新增独立表。

```text
TrialRun
  id
  tenantId
  novelId
  chapterPlanVersionId
  trialChapterCount
  status
  totalScore
  trialResult
  reviewReportId
  policyProfileVersionId
  sourceTaskId
  confirmedAt
  confirmedBy
  forceReason
  createdAt
  updatedAt

TrialChapterResult
  id
  tenantId
  trialRunId
  chapterId
  contentVersionId
  featureCardVersionId
  reviewReportId
  score
  status
  createdAt
```

## FullReviewGate 与 CompletionDecisionRecord

全书审稿自动生成报告，用户确认完成必须单独记录。

```text
FullReviewGate
  id
  tenantId
  novelId
  reviewReportId
  gateResult
  allowCompletion
  allowVideoReady
  blockingIssueCount
  warningIssueCount
  isStale
  staleReason
  policyProfileVersionId
  createdAt

CompletionDecisionRecord
  id
  tenantId
  novelId
  reviewReportId
  fullReviewGateId
  decision
  decisionReason
  isForced
  score
  riskSummary
  createdBy
  createdAt
```

## VideoReadinessSnapshot

待视频化快照是视频系统引用小说的稳定边界。

```text
id
tenantId
novelId
fullReviewGateId
completionDecisionId
status
checkItemsJson
chapterCount
totalWordCount
estimatedAudioMinutes
riskSummary
referableChapterIds[]
referableChapterVersionIds[]
firstVideoSuggestionJson
createdBy
createdAt
```

确认待视频化后：

- `Novel.creationStage=video_ready`
- `Novel.currentVideoReadinessSnapshotId` 指向当前快照。
- 视频系统只能基于该快照创建引用，不直接读实时正文。

## VideoReference 与 VideoReferenceIssue

首期视频系统只需要支持引用快照和异常识别。

```text
VideoReference
  id
  tenantId
  videoProjectId
  novelId
  videoReadinessSnapshotId
  chapterIds[]
  chapterContentVersionIds[]
  reviewReportId
  riskSummary
  status
  createdAt

VideoReferenceIssue
  id
  tenantId
  videoProjectId
  videoReferenceId
  novelId
  issueLevel
  issueReason
  affectedChapterIds[]
  sourceChangeObjectType
  sourceChangeObjectId
  status
  createdAt
  resolvedAt
```

小说修改后不能自动改视频项目，只能生成引用异常并提示处理。

## OperationLog

操作日志用于审计高风险动作。

```text
id
tenantId
userId
novelId
action
objectType
objectId
beforeSnapshot
afterSnapshot
reason
impactSummary
sourceTaskId
requestId
ip
userAgent
createdAt
```

普通日志不能替代操作日志。高风险操作必须写结构化记录。

## 索引与唯一约束建议

首期至少考虑：

- 小说列表：`tenantId + ownerId + lifecycleStatus + updatedAt`
- 小说阶段筛选：`tenantId + creationStage + stageStatus + updatedAt`
- 章节列表：`tenantId + novelId + chapterNo`
- 章节当前状态：`tenantId + novelId + mainStatus + updatedAt`
- 正文版本：`tenantId + chapterId + status`
- 通用版本：`tenantId + novelId + objectType + objectId + status`
- 任务列表：`tenantId + status + createdAt`
- 小说任务：`tenantId + novelId + taskType + status`
- 活跃任务互斥：`tenantId + conflictScope + conflictKey + status`
- 幂等记录：`tenantId + idempotencyToken`
- 审稿报告：`tenantId + novelId + objectType + objectId + createdAt`
- 操作日志：`tenantId + novelId + action + createdAt`

如果数据库无法直接对“活跃状态子集”建唯一约束，后端必须用事务或锁保证同一冲突键下不会创建多个活跃任务。

## DTO 分层

前端不要直接消费数据库实体。建议至少分三类 DTO：

| DTO | 用途 |
| --- | --- |
| `NovelListItemDTO` | 小说列表行，包含状态摘要和轻量评分 |
| `NovelDetailDTO` | 小说详情工作台，包含当前资产摘要、章节统计、任务和视频引用摘要 |
| `ChapterDetailDTO` | 章节工作台，包含正文、摘要卡、审稿、候选版本和影响案例 |
| `TaskDTO` | 任务状态、进度、失败原因和下一步 |
| `CandidateVersionDTO` | 候选版本摘要、评分、风险和可采用状态 |
| `VideoReadinessDTO` | 待视频化检查、快照和阻塞项 |

DTO 可以包含用户可读文案，但业务判断必须以后端门禁和动作接口为准。
