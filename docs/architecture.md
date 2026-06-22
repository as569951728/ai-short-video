# 项目架构规划

## 技术栈

### 前端

- 前端框架：Vue 3。
- UI 组件库：Element Plus 最新稳定版。
- 路由：Vue Router。
- 构建工具：Vite。
- 语言：TypeScript 优先。

### 后端

- 运行时：Node.js。
- 语言：TypeScript。
- API 框架：Fastify。
- 数据库：MySQL。
- 数据访问：Prisma，后续通过 Prisma schema 管理模型和迁移。

## 设计范围与当前模块

需求设计和原型设计先按完整产品形态展开，尽量把完整流程、页面、状态、异常和运营闭环想清楚。实现阶段再根据资源拆 MVP、第一期和后续版本。

系统级模块边界、上下游关系和跨模块衔接节点见 `docs/modules/system-module-boundaries.md`。当前先围绕热点分析系统和小说系统整理能力边界：

- 热点分析系统模块目录。
- 小说列表模块目录。
- 创建小说向导模块目录。
- 小说详情工作台模块目录。
- 章节详情工作台模块目录。
- 视频列表模块目录。
- 视频详情模块目录。

系统级边界和完整产品形态的 P2 能力也已经独立落文档：

- 系统模块边界与模块衔接节点：`docs/modules/system-module-boundaries.md`。
- 小说系统研发契约：`docs/modules/novel-development-contract.md`。
- 小说系统核心数据契约：`docs/modules/novel-core-data-contract.md`。
- 小说系统接口契约：`docs/modules/novel-api-contract.md`。
- 小说系统首批研发任务包：`docs/modules/novel-first-iteration-development-plan.md`。
- 小说系统验收测试矩阵：`docs/modules/novel-acceptance-test-matrix.md`。
- 热点系统服务化：`docs/modules/hotspot-service-system.md`。
- 系统自我成长：`docs/modules/system-self-growth.md`。
- AI 配置管理后台：`docs/modules/ai-config-management.md`。
- 权限与租户：`docs/modules/auth-tenant-system.md`。
- 视频详情与发布运营：`docs/modules/video-detail-publishing-operations.md`。

其中 P2 能力文档用于保留完整产品方向，不代表首期都要研发。以下能力继续后置：AI 分镜和剧情画面生成、自动发布、平台 API 数据同步、完整 AI 配置后台、完整权限租户、自我成长大屏、热点系统对外服务化。早期只保留必要数据口子，例如策略版本、人工发布记录、24/48 小时数据回填、用户决策记录和操作日志。

当前需求和原型重点是“小说列表之后、视频设计之前”的小说创作闭环：从列表行推荐动作进入设定生成、大纲生成、章节目录、试写、AI 审稿、章节重写、批量正文、全书审稿和待视频化确认。

小说详情工作台、章节详情工作台、视频详情页都可以在完整原型里先设计清楚。实施分期时，可以先做列表驱动和轻量章节详情，视频模块也可以先做视频列表和视频引用状态，不急着实现复杂视频生产能力。

当前原型设计入口见 `docs/prototypes/README.md`，小说系统页面流程总图见 `docs/prototypes/novel-system-page-flow.md`。完整低保真页面原型已拆到 `docs/prototypes/admin-layout-prototype.md`、`docs/prototypes/novel-list-prototype.md`、`docs/prototypes/novel-create-wizard-prototype.md`、`docs/prototypes/novel-detail-workbench-prototype.md`、`docs/prototypes/chapter-detail-workbench-prototype.md` 和 `docs/prototypes/video-list-task-prototype.md`。

## 路由规划

- `/hotspots`：热点分析报告列表。
- `/hotspots/:reportId`：热点分析报告详情。
- `/hotspots/manual`：临时热点素材分析。
- `/novels`：小说列表。
- `/novels/new`：创建新小说。
- `/novels/:novelId`：小说详情工作台。
- `/novels/:novelId/chapters/:chapterId`：章节详情工作台。
- `/tasks`：生成任务列表。
- `/tasks/:taskId`：生成任务详情。
- `/videos`：视频项目列表。
- `/videos/:videoId`：视频项目详情。
- `/settings/model-providers`：模型供应商配置。
- `/settings/models`：模型列表。
- `/settings/task-model-mapping`：任务模型映射。
- `/settings/policy-profiles`：策略与程度配置。
- `/settings/prompt-templates`：提示词模板列表。
- `/settings/prompt-templates/:templateId`：提示词模板详情。
- `/settings/output-schemas`：输出结构校验。
- `/settings/content-safety`：内容安全规则。
- 其他路径默认跳转到 `/novels`。

## 目录结构

```text
AIShortvideo/
  docs/
    product-requirements.md
    architecture.md
    modules/
      admin-web-system.md
      hotspot-analysis-system.md
      novel-system.md
      video-system.md
  apps/
    admin-web/
      package.json
      index.html
      vite.config.ts
      tsconfig.json
      src/
        main.ts
        App.vue
        router/
        layout/
        modules/
          hotspots/
          novels/
            pages/
            components/
            services/
            model/
          videos/
        shared/
          components/
          constants/
          utils/
          styles/
    api/
      package.json
      tsconfig.json
      prisma/
        schema.prisma
      src/
        main.ts
        app.ts
        config/
        infrastructure/
          database/
        modules/
          hotspots/
          novels/
          videos/
          generation/
        shared/
  packages/
    shared/
```

## 数据模型草案

这里是需求级数据模型草案，用于指导后续 Prisma schema 和接口设计，不等于最终数据库字段。后续实现时可以根据性能、查询和迁移成本拆分或合并表。

通用字段建议：

- `id`：主键。
- `tenantId`：租户 ID，近期可为空或使用默认租户，后续售卖时用于数据隔离。
- `ownerId`：所属用户。
- `createdBy` / `updatedBy`：创建人和更新人。
- `createdAt` / `updatedAt`：创建和更新时间。
- `deletedAt`：软删除时间，高风险数据优先软删除。
- `metadata`：扩展 JSON，用于承载低频、不稳定字段。

### Novel

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
displayStatus
currentStep
completedSteps[]
recommendedActionSnapshot
videoReferenceStatus
policyProfileId
policyProfileVersionId
hotspotReportId
selectedDirectionId
settingId
outlineId
chapterProgress
chapterLimit
chapterWordRange
marketScore
qualityScore
archiveReason
pauseReason
completionReviewId
updatedAt
summary
```

小说状态字段以 `docs/modules/novel-state-gate-action-contract.md` 为准。`displayStatus`、`currentStep`、`completedSteps`、`recommendedActionSnapshot` 只用于展示或缓存，不作为业务事实源；关键业务动作必须重新根据核心状态、任务、版本、审稿、章节和视频引用校验门禁。

### NovelDirection

```text
id
novelId
sourceHotspotReportId
title
score
tags[]
logline
targetAudience
protagonistOpening
protagonistDesire
coreConflict
antagonistOrObstacle
firstThreeChapters
longFormPotential
trafficReason
risk
isAiRecommended
sourceDirectionIds[]
versionId
status
selectedAt
createdAt
```

### CreateNovelPreferences

```text
id
novelId
appealPoints[]
genres[]
openingState
blockedElements[]
targetAudience
chapterLimit
chapterWordRange
stageCount
customIdea
style
videoAdaptationPreference
createdAt
```

### NovelSetting

```text
id
novelId
directionId
versionId
title
genre
targetAudience
coreSellingPoint
style
forbiddenElements[]
protagonistProfile
antagonistProfile
supportingCharacters[]
worldRules
mainGoals
appealPointDesign
foreshadowingDesign
videoReserve
status
confirmedAt
createdAt
```

### NovelOutline

```text
id
novelId
settingId
versionId
mainline
opening
protagonistEndpoint
coreConflict
mainAntagonist
longForeshadowing
midpointReversal
finalClimax
endingDirection
targetChapterCount
stageCount
reviewReportId
status
confirmedAt
createdAt
```

大纲三层结构完整规则见 `docs/modules/novel-outline-structure.md`。后续实现时建议将全书大纲、阶段大纲和章节目录都版本化，避免调整阶段数量或局部重写时覆盖正式结构。

### NovelOutlineVersion

```text
id
tenantId
novelId
settingVersionId
versionNo
status
mainline
opening
protagonistStartState
protagonistEndState
coreConflict
mainAntagonist
appealUpgradePlan
longForeshadowing
midpointReversal
finalClimax
endingDirection
targetChapterCount
recommendedStageCount
reviewReportId
sourceTaskId
score
riskLevel
versionStatus
staleLevel
decisionRecordId
createdBy
createdAt
```

全书大纲版本是阶段大纲和章节目录的上游版本。确认后才允许生成阶段大纲。

### StageOutlineVersion

```text
id
tenantId
novelId
outlineVersionId
versionNo
status
stageCount
stages[]
reviewReportId
sourceTaskId
score
riskLevel
versionStatus
staleLevel
decisionRecordId
createdBy
createdAt
```

`stages[]` 中每个阶段至少包含阶段序号、阶段名称、章节范围、阶段目标、核心冲突、主要人物、反派/阻力、爽点、结尾钩子、伏笔计划和下一阶段衔接。

### NovelStageOutline

```text
id
novelId
outlineId
stageIndex
stageName
chapterStart
chapterEnd
stageGoal
coreConflict
mainCharacters[]
stageAntagonist
appealPoints[]
endingHook
foreshadowingPlan
nextStageBridge
status
```

### ChapterPlanVersion

```text
id
tenantId
novelId
outlineVersionId
stageOutlineVersionId
versionNo
status
targetChapterCount
items[]
reviewReportId
sourceTaskId
score
riskLevel
versionStatus
staleLevel
decisionRecordId
createdBy
createdAt
```

`items[]` 中每章至少包含章节序号、标题、所属阶段、字数目标、剧情目标、核心冲突、爽点、出场人物、关键场景、结尾钩子、伏笔操作和不能改变的事实。

### NovelChapter

```text
id
novelId
stageOutlineId
chapterNo
title
wordTarget
wordCount
mainStatus
statusNote
impactLevel
score
hasContent
hasReview
videoReferenceStatus
currentCardId
currentContentVersionId
currentReviewId
lastGenerationTaskId
recommendedAction
updatedAt
```

章节主状态只保存简化值：

- `normal`
- `pending`
- `processing`
- `resolved`

`statusNote` 用于保存备注，例如轻微影响、受影响未调整、审稿分数低、正文缺失。章节重新变为正常时，当前备注可以清空，历史原因进入审稿、影响评估和版本记录。

### ChapterFeatureCard

```text
id
novelId
chapterId
versionId
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
createdFrom
versionStatus
staleLevel
decisionRecordId
createdAt
```

### ChapterContentVersion

```text
id
novelId
chapterId
versionNo
sourceType
sourceTaskId
rewriteReason
content
wordCount
summary
reviewScore
versionStatus
staleLevel
decisionRecordId
createdBy
createdAt
```

### LongTermMemory

```text
id
novelId
chapterId
sourceVersionId
previousSummary
characterStates
relationshipStates
locations[]
organizations[]
items[]
plantedForeshadowing[]
resolvedForeshadowing[]
unresolvedConflicts[]
newSettings[]
factsCannotContradict[]
versionStatus
staleLevel
decisionRecordId
createdAt
```

### TrialRun

```text
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
```

试写批次完整规则见 `docs/modules/novel-trial-writing-loop.md`。试写通过或用户确认风险后，小说才允许进入批量正文生成。

### TrialChapterResult

```text
id
trialRunId
chapterId
contentVersionId
featureCardId
reviewReportId
score
status
createdAt
```

试写批次内每章都要能追溯正文版本、摘要卡和章节审稿报告。

### ReviewReport

```text
id
tenantId
novelId
objectType
objectId
objectVersionId
reviewLevel
modelProvider
modelName
promptTemplateVersionId
policyProfileVersionId
totalScore
subScores
rating
summary
strengths[]
problems[]
suggestions[]
issueCards[]
actionOptions[]
recommendedAction
allowNextStep
blockingIssueCount
resolvedStatus
userAccepted
createdAt
```

`objectType` 可指向方向、设定、大纲、章节、全书等对象。这样审稿报告可以统一管理。

### FullReviewGate

```text
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
```

全书审稿完成门禁完整规则见 `docs/modules/novel-full-review-gate.md`。全书审稿报告自动保存，但小说完成确认需要用户决策。

### CompletionDecisionRecord

```text
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

用户确认完成、低分强制通过或返回优化，都需要记录决策。

### ReviewActionRecord

```text
id
tenantId
novelId
reviewReportId
issueKey
issueType
severity
actionType
actionLabel
targetObjectType
targetObjectId
beforeVersionId
afterVersionId
sourceTaskId
scoreBefore
scoreAfter
status
userAccepted
acceptedReason
createdBy
createdAt
```

审稿动作记录用于追踪“哪个问题触发了哪个优化动作、生成了哪个候选版本、评分是否提升、用户是否采用”。这类数据后续可以复盘哪些调试动作真的有效。

### LearningSignal

```text
id
tenantId
novelId
sourceType
sourceObjectType
sourceObjectId
signalType
label
genre
issueType
actionType
scoreDelta
metricName
metricValue
confidence
summary
createdAt
```

学习信号用于统一记录系统可学习的数据来源，例如用户采用/放弃、审稿分数变化、归档原因、视频播放表现、手动标记效果好/差。它不直接自动改写系统规则，而是先进入复盘和建议。

该对象属于后续数据复盘和系统学习模块。实施首期不一定要完整建表和开发页面，但当前生成任务、审稿报告、调试动作、操作日志、归档原因和视频反馈需要能在后续抽取成学习信号。

### CreativeExperienceCase

```text
id
tenantId
sourceNovelId
sourceObjectType
sourceObjectId
caseType
genre
appealTags[]
issueTags[]
summary
reusablePattern
avoidPattern
sourceMetrics
enabled
createdFromSignalId
createdAt
```

创作经验案例用于沉淀成功模式和失败模式。成功案例可以作为后续生成的结构参考，失败案例用于提醒避坑；案例库不能直接复制原文，必须以摘要、结构和经验方式参与生成。

该对象属于完整产品能力。前期可以先通过人工标记、归档原因、调试动作记录和视频反馈积累素材，等小说主流程稳定后再设计经验库管理和引用机制。

### ImpactAssessment

```text
id
novelId
sourceChapterId
sourceOldVersionId
sourceNewVersionId
impactLevel
affectedChapterIds[]
reasons[]
recommendedHandling
blocksCompletion
status
createdTaskId
createdAt
```

中等和严重影响会把受影响章节置为 `pending`，备注写入 `statusNote`，并阻止小说完成。

### ChapterImpactCase

```text
id
tenantId
novelId
sourceChapterId
impactAssessmentId
impactLevel
status
handlingChoice
affectedChapterCount
blocksCompletion
videoReferenceImpact
decisionReason
createdBy
createdAt
resolvedAt
```

章节重写影响处理完整规则见 `docs/modules/chapter-rewrite-impact-handling.md`。影响案例管理中等和严重影响的用户决策、处理进度和关闭条件。

### ChapterImpactItem

```text
id
impactCaseId
chapterId
impactReason
affectedFacts[]
recommendedAction
status
handledBy
handledAt
confirmReason
```

受影响章节明细用于支撑列表筛选、批量处理、逐章处理和手动确认无影响。

### CreativeVersion

```text
id
novelId
objectType
objectId
versionNo
sourceType
sourceTaskId
changeReason
modelProvider
modelName
promptTemplateVersionId
policyProfileVersionId
inputSummary
outputSummary
reviewScore
status
staleLevel
decisionRecordId
createdBy
createdAt
```

通用版本表用于记录方向、设定、大纲、章节卡片、审稿报告等关键对象的版本。章节正文内容较长，正文内容建议仍保存在 `ChapterContentVersion`。

版本状态统一使用 `status + staleLevel + decisionRecordId` 表达，不能只依赖 `isCurrent`、`isAccepted` 这类布尔字段。`status` 建议包含 `candidate`、`current`、`historical`、`discarded`、`stale`；`staleLevel` 建议包含 `soft_stale`、`hard_stale`、`risk_stale`。同一 `objectType + objectId` 同一时间只能有一个 `current`。

### GenerationTask

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
modelProvider
modelName
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
resultVersionId
userAcceptedResult
startedAt
finishedAt
lastHeartbeatAt
cancelRequestedAt
cancelReason
createdAt
```

任务状态：

- `queued`
- `processing`
- `waiting_confirmation`
- `completed`
- `failed`
- `cancelled`

任务生命周期完整规则见 `docs/modules/generation-task-lifecycle.md`。主状态保持克制；重试中、等待模型、解析失败、上下文过长等信息通过 `currentStep`、`statusNote`、`failureCategory` 和 `GenerationTaskEvent` 表达。

### GenerationTaskEvent

```text
id
taskId
eventType
message
payload
createdAt
```

用于记录任务状态变化、失败原因、自动重试、用户确认等过程日志。

### HotspotReport

```text
id
tenantId
title
period
sourceType
sourceItems[]
hotGenres[]
hotAppealPoints[]
openingHooks[]
targetAudiences[]
opportunities[]
risks[]
recommendedDirections[]
createdAt
```

### HotspotOpportunity

```text
id
reportId
title
targetAudience
genre
appealPoint
openingHook
reason
risk
usedByNovelIds[]
```

### AiModelProvider

```text
id
tenantId
name
apiBaseUrl
apiKeyEnvName
enabled
timeoutMs
maxRetries
concurrencyLimit
costRule
lastTestStatus
lastTestAt
remark
```

### AiModel

```text
id
providerId
name
enabled
taskTags[]
contextLength
maxOutputTokens
supportsLongText
supportsStructuredOutput
recommendedTemperature
recommendedTopP
costEstimate
qualityNotes
riskNotes
```

### TaskModelMapping

```text
id
tenantId
taskType
primaryModelId
fallbackModelId
retryModelId
reviewModelId
defaultStrategy
defaultParams
allowAdvancedOverride
updatedAt
```

### PolicyProfile

```text
id
tenantId
name
scene
description
status
isSystemDefault
currentVersionId
createdBy
createdAt
updatedAt
```

策略方案用于承载“标准创作策略、严格质量策略、快速试错策略、短视频爽点策略”等可切换配置。

策略配置管理后台属于完整产品能力，实施时可以后排期。实施首期可以先通过种子数据或默认配置创建系统策略，但生成任务和审稿报告仍应记录 `policyProfileVersionId`，避免后续无法解释历史结果。

### PolicyProfileVersion

```text
id
tenantId
profileId
versionNo
status
degreeSettings
reviewThresholds
reviewWeights
blockingRules
overrideRules
lowScoreActions
safetySettings
originalitySettings
rewriteSettings
marketSettings
videoSettings
autoHandlingSettings
changeReason
createdBy
publishedAt
```

策略版本保存每个程度档位背后的阈值、权重、阻塞规则和推荐动作。AI 审稿、重写影响评估、内容安全检查和视频化前检查都需要记录当时使用的策略版本。

### ConfigurableDegree

```text
id
tenantId
key
category
name
description
levels
defaultLevel
enabled
updatedAt
```

可配置程度项用于定义 AI 审稿严格程度、内容安全严格程度、原创化严格程度、重写强度、市场导向程度、视频化倾向程度和自动处理程度。具体阈值仍以策略版本为准。

### PromptTemplate

```text
id
tenantId
name
taskType
status
currentVersionId
description
createdAt
updatedAt
```

### PromptTemplateVersion

```text
id
templateId
versionNo
status
roleDefinition
taskGoal
contextDefinition
constraints
outputSchema
qualityRules
riskRules
inputVariables[]
exampleInput
exampleOutput
changeReason
createdBy
publishedAt
```

### OutputSchemaRule

```text
id
taskType
schemaDefinition
requiredFields[]
repairTemplateId
enabled
updatedAt
```

### ModelEffectMetric

```text
id
tenantId
modelId
promptTemplateVersionId
policyProfileVersionId
taskType
genre
avgScore
acceptanceRate
rewriteRate
failureRate
formatErrorRate
avgDurationMs
avgCost
aiFlavorIssueRate
consistencyIssueRate
sampleSize
period
```

### ContentSafetyRule

```text
id
tenantId
ruleType
genre
keyword
description
severity
enabled
triggerCount
updatedAt
```

### VideoProject

```text
id
tenantId
novelId
title
referencedChapterIds[]
referencedChapterRangeText
sourceNovelUpdatedAtSnapshot
referenceStatus
referenceIssueReason
videoStatus
audioStatus
subtitleStatus
renderStatus
durationSeconds
sourceAudioTaskId
sourceSubtitleTaskId
sourceRenderTaskId
outputAudioFileId
outputSubtitleFileId
outputVideoFileId
publishStatus
publishedPlatform
publishedUrl
publishedAt
recommendedActionSnapshot
createdAt
updatedAt
```

视频系统不是当前核心，但完整设计需要包含视频列表，能引用小说和章节、展示生成状态、记录发布状态和提示引用异常；实施首期可以先做引用状态承接。

### VideoReadinessSnapshot

```text
id
tenantId
novelId
fullReviewGateId
completionDecisionId
status
checkItems
chapterCount
totalWordCount
estimatedAudioMinutes
riskSummary
referableChapterIds[]
referableChapterVersionIds[]
createdBy
createdAt
```

待视频化判定完整规则见 `docs/modules/novel-video-readiness.md`。小说进入待视频化时需要保存检查清单和内容快照，避免视频项目只依赖实时正文。

### VideoReferenceIssue

```text
id
tenantId
videoProjectId
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

小说被视频引用后发生正文、摘要、审稿或章节范围变化时，生成引用异常记录。已发布视频不被自动覆盖。

### OperationLog

```text
id
tenantId
userId
action
objectType
objectId
beforeSnapshot
afterSnapshot
reason
requiresConfirmation
confirmed
createdAt
```

高风险操作必须写入操作日志，例如删除小说、清空后续章节、发布提示词模板、停用模型供应商。

### CostUsageRecord

```text
id
tenantId
userId
novelId
taskId
providerId
modelId
taskType
inputTokens
outputTokens
estimatedCost
actualCost
createdAt
```

成本统计页可以基于生成任务和成本记录汇总。

### User / Tenant 预留

权限可以后续研发，但核心表建议预留用户和租户字段。

```text
Tenant
- id
- name
- status
- licenseStatus
- expiredAt
- createdAt

User
- id
- tenantId
- name
- role
- status
- createdAt
```

近期单用户模式下，可以使用默认租户和默认 owner 用户。

## 数据库设计与 SQL 标准

本系统的数据库设计需要借鉴 nurse-crm 的治理方式：数据库不只是存结果，还要能还原“谁在什么时候、基于什么原因、把哪个版本改成了什么、影响了哪些后续内容”。这些标准用于指导后续 Prisma schema、migration、索引和接口实现。

### 结构变更流程

- Prisma schema 和 migration 先视为结构设计草案，不能把本地生成 SQL 直接等同于已完成数据库设计。
- 每次新增表、改字段、加索引前，需要补齐业务背景、字段说明、枚举字典、核心查询场景、索引原因、回滚方案和测试数据清理方案。
- 结构变更先在开发库验证，再进入正式环境；正式环境变更必须有备份、回滚和 smoke 检查。
- 种子数据、演示数据和测试数据必须可识别、可清理，建议在核心表预留 `isTestData` 或通过统一 seed 记录管理。

### 命名与字段语义

- 数据库表名使用小写下划线风格。若系统独立使用一个库，可以按模块命名，例如 `novel_project`、`novel_chapter`、`generation_task`；若未来与其他系统共库，统一增加系统前缀。
- Prisma model 可以使用 PascalCase，数据库表和字段通过映射保持 snake_case。
- 枚举字段不能只写字符串，必须在文档或数据字典中说明含义、取值范围、流转规则和是否阻塞流程。
- 字段命名要表达业务语义，避免只有技术含义的字段。比如章节状态要区分 `mainStatus`、`statusNote`、`impactLevel`，不能只用一个模糊的 `status` 承载所有信息。
- 重要字段需要有备注说明，尤其是状态、版本、审稿分数、影响范围、归档原因、视频引用状态、任务触发来源。

### 主键与业务 ID

- 表可以使用数据库主键 `id`，但对外流转和跨模块引用要保留稳定业务 ID 口径，避免把内部自增 ID 暴露成长期业务标识。
- 小说、章节、生成任务、审稿报告、版本、视频项目等核心对象需要有唯一约束，避免重复创建。
- 高风险动作需要 `idempotencyToken` 和 `requestHash`，用于处理重复点击、接口重试和任务回放。

### 通用字段与数据隔离

- 核心业务表建议统一预留 `tenantId`、`ownerId`、`createdBy`、`updatedBy`、`createdAt`、`updatedAt`、`deletedAt`。
- 当前可以使用默认租户和默认 owner，但查询、列表和统计接口要尽量按未来多租户隔离口径设计。
- 软删除数据默认不能出现在普通列表和候选项中，查询条件需要明确过滤。
- 高风险数据优先软删除或归档，避免误删后无法复盘。

### 候选、正式与版本

- AI 生成结果默认先作为候选结果或新版本保存，用户确认后才成为当前正式版本。
- AI 产物确认完整规则见 `docs/modules/ai-artifact-confirmation.md`，不同产物需要区分自动记录、自动成为当前版本、候选待确认和高风险确认。
- 重要创作资产不能原地覆盖，必须追加版本并通过统一资产采用服务切换 `versionStatus=current`，例如小说方向、设定、大纲、章节特性卡、章节正文、审稿报告、提示词模板。
- 正式内容修改需要记录旧版本、新版本、修改原因、触发任务、操作者和审稿结果。
- 章节正文、AI 原始输出、长上下文、审稿细节等大字段应从主列表表中拆开，列表表只保留摘要、状态、分数和当前版本引用。
- 对于大 JSON 或长文本字段，优先保存结构化摘要和必要正文；原始提示词、原始模型响应、外部素材全文不应无节制塞进主业务表。

### ArtifactDecisionRecord

```text
id
tenantId
novelId
taskId
objectType
objectId
artifactType
candidateVersionId
currentVersionIdBefore
currentVersionIdAfter
decision
decisionReason
decisionNote
scoreBefore
scoreAfter
riskLevel
impactLevel
isForced
isStaleCandidate
createdBy
createdAt
```

产物决策记录用于追踪用户对 AI 产物的采用、放弃、继续优化、重新生成、强制继续或返回上游修改。低风险自动保存结果可以不写决策记录，但高风险确认必须同时写入操作日志。

### NovelSettingVersion

```text
id
tenantId
novelId
directionVersionId
versionNo
status
summary
basicInfo
protagonist
antagonists
supportingCharacters
worldBackground
mainPlot
appealDesign
foreshadowing
styleGuide
videoAdaptation
reviewReportId
sourceTaskId
score
marketScore
longFormScore
videoScore
riskLevel
versionStatus
staleLevel
decisionRecordId
createdBy
createdAt
```

设定档案完整规则见 `docs/modules/novel-setting-profile.md`。设定版本必须记录基于哪个方向版本生成，确认后才成为当前正式设定；已确认设定发生关键事实修改时，需要评估对大纲、章节和视频引用的影响。

### 审计、影响快照与安全边界

- 所有高风险操作必须写 `OperationLog`，包括删除小说、归档小说、清空后续章节、批量重写、确认低分结果、发布提示词模板、停用模型供应商、切换任务模型。
- 发布策略版本、提高阻塞阈值、关闭内容安全规则、允许低分自动通过等策略类修改，也属于高风险操作。
- 操作日志至少回答：谁操作、什么时候操作、操作对象、操作前状态、操作后状态、原因、影响范围、是否需要确认、是否已经确认。
- 涉及章节重写、清空后续章节、视频已引用章节修改时，需要保存影响快照，便于回滚、审稿和后续复盘。
- AI、规则任务和定时任务不能绕过确认直接改写正式创作资产；它们只能生成候选版本、审稿结论、建议动作或待确认任务。
- API Key、密钥、下载令牌、外部平台凭证不能进入数据库日志、提示词、任务输入输出摘要或前端响应。

### SQL 与索引规范

- 查询必须明确分页或限制数量，不能默认返回超大结果集。
- 列表查询只选择需要展示的字段，避免把章节正文、长审稿内容、大 JSON 一起查出。
- 禁止在常规查询中使用前缀模糊查询，例如 `like '%关键词'`；需要搜索时后续单独设计搜索能力。
- 避免循环查库、超大 `IN`、无控制批量更新、无必要 `OR`、无必要 `UNION`。
- 手写 SQL 或复杂 Prisma 查询上线前需要看执行计划，确认没有明显全表扫描、回表过重或索引失效。
- 索引必须围绕真实页面和任务路径设计，例如：
  - 小说列表：`tenantId + lifecycleStatus + creationStage + stageStatus + updatedAt`。
  - 小说待处理筛选：`tenantId + recommendedActionSnapshot + updatedAt`、`tenantId + lifecycleStatus + updatedAt`。
  - 视频列表：`tenantId + videoStatus + updatedAt`、`tenantId + publishStatus + updatedAt`、`tenantId + referenceStatus + updatedAt`。
  - 章节列表：`novelId + chapterNo`。
  - 待处理章节：`novelId + mainStatus + updatedAt`。
  - 生成任务：`tenantId + status + createdAt`、`novelId + taskType + status`。
  - 版本查询：`objectType + objectId + versionStatus`，查询当前版本时固定 `versionStatus=current`。
  - 审稿报告：`objectType + objectId + createdAt`。
  - 审稿动作记录：`reviewReportId + createdAt`、`novelId + issueType + actionType`。
  - 学习信号：`tenantId + signalType + createdAt`、`novelId + sourceType + createdAt`。
  - 创作经验案例：`tenantId + caseType + genre + enabled`。
  - 成本统计：`tenantId + taskType + createdAt`、`modelId + createdAt`。

### 数据访问分层

- 后端服务层负责业务编排、状态流转、日志和权限判断；数据访问层只负责明确的数据读写入口。
- 不建议在业务服务中到处散落 Prisma 原始调用。后续实现时，每个模块应沉淀 repository/data-access 方法，例如 `findNovelList`、`markChaptersPendingByImpact`、`createChapterContentVersion`。
- 写接口要优先表达业务动作，而不是暴露通用更新能力。例如使用“确认章节版本”“归档小说”“处理影响章节”，不要让前端随意传任意字段 patch 核心表。

## 前端设计原则

- 默认小白模式，不把专业创作概念暴露给用户。
- 选择优先，输入补充。
- 每一步都有“帮我推荐”。
- 后台页面偏工具型，信息密度适中，不做营销式落地页。
- 模型、提示词、任务日志、成本统计和安全规则属于高级/管理员配置入口，不进入小白创作主流程。
- 权限系统可以后续研发，当前可按单用户 owner 模式运行，但菜单和高风险操作要预留角色边界。
- 小说状态和视频引用状态分开管理。
- 热点分析系统独立成入口，但在创建小说时可以一键引用热点报告。
- 后续接入后端时，页面组件尽量保持只依赖数据接口，不直接耦合 AI 调用逻辑。

## 前端研发规范

本系统前端使用 Vue 3 + Vite + TypeScript + Element Plus。前端项目初始化必须使用 Vite 官方脚手架生成 Vue + TypeScript 基础项目，再在脚手架结果上安装和配置 Element Plus、Vue Router、Pinia 等依赖；不要手工拼装 `package.json`、`index.html`、`vite.config.ts`、`tsconfig` 和入口文件。

推荐初始化方式：

```bash
npm create vite@latest apps/admin-web -- --template vue-ts
cd apps/admin-web
npm install
npm install element-plus @element-plus/icons-vue vue-router pinia
```

如果 `apps/admin-web` 已经存在但不是 Vite 官方脚手架生成，进入正式前端实现前应重新用 Vite 脚手架初始化或对照脚手架输出修正，不继续沿用手工组装的前端壳。

研发规范可以借鉴 `hk/fe-backend-recruit` 的后台项目经验：列表页配置化、请求层统一、路由元信息统一、菜单/权限可扩展、页面状态有标准生命周期。但不要照搬旧项目的 Vue 2、Vuex 动态模块、mixin、旧版 Element UI、微前端 iframe 等实现方式。

后续进入前端实现时，需要同步对照 `docs/frontend-implementation-checklist.md`。

### 目录组织

前端按模块组织，每个业务模块保持清晰边界：

```text
modules/
  novels/
    pages/
    components/
    services/
    model/
    constants/
    composables/
  hotspots/
    pages/
    components/
    services/
    model/
    constants/
    composables/
shared/
  components/
  services/
  constants/
  composables/
  utils/
  styles/
```

- `pages` 放路由页面。
- `components` 放模块内组件。
- `services` 放模块接口封装，不在页面里直接写 `fetch` 或 `axios`。
- `model` 放 TypeScript 类型、页面视图模型、接口 DTO 转换。
- `constants` 放模块枚举、状态文案、颜色和动作配置。
- `composables` 放页面逻辑复用，例如列表查询、任务轮询、创建向导、列表行推荐动作。
- `shared` 只放跨模块稳定复用能力，避免把单个页面需求过早抽成全局组件。

### 页面类型

前端页面按类型设计，避免所有页面使用同一种抽象：

- 管理列表页：适合配置化，例如小说列表、热点报告列表、生成任务列表、模型配置列表、提示词模板列表。
- 创建向导页：需要手写交互和步骤状态，例如创建小说页面，不能为了配置化牺牲小白引导体验。
- 详情工作台页：小说详情工作台和章节详情工作台都进入完整原型范围；实施首期可裁剪为轻量版本。
- 配置表单页：适合统一表单组件和字段 schema，例如模型配置、内容安全规则、归档原因。
- 结果审阅页：需要突出 AI 评分、问题、建议动作和确认按钮，例如方向审稿、章节审稿、全书审稿。

### 列表页规范

借鉴旧项目的 `searchFields`、`dataFields`、`formFields` 拆分方式，但在本项目中用 TypeScript 类型约束：

- 搜索条件定义为 `searchSchema`。
- 表格列定义为 `tableColumns`。
- 行操作定义为 `rowActions`。
- 批量操作定义为 `batchActions`。
- 表单字段定义为 `formSchema`。
- 页面逻辑用 `useListPage` 管理加载、分页、筛选、排序、重置、刷新。

列表页需要默认支持：

- 加载状态。
- 空状态。
- 分页。
- 筛选和重置。
- 行级主操作和更多操作。
- 高风险操作二次确认。
- 状态标签和推荐动作展示。
- 查询条件和分页参数与后端统一。

### 创建向导、列表驱动与完整工作台

完整设计采用“列表驱动 + 工作台承接”的结构。列表驱动不是只做列表 CRUD，而是以小说列表作为入口，承载从小说方向确认后到待视频化前的核心创作链路；小说详情工作台用于完整查看、编辑、审稿、调试和复盘。

- 创建小说页使用明确 step：选择来源和偏好、生成小说方向、方向选择/融合、确认创建。
- 每一步都要显示当前目标、系统推荐动作、失败原因和下一步。
- 高级设置默认折叠。
- 创建小说需要允许用户不填专业内容，默认使用系统推荐热点、题材、爽点、主角开局和基础生成参数。
- 方向生成是异步任务。为了保存任务和方向结果，后端可以在生成方向前创建草稿小说项目，确认后再转为正式推进状态。
- 小说列表需要展示核心概览：创作状态、当前步骤、章节进度、质量分、市场分、视频引用状态、推荐动作。
- 小说列表行的主按钮直接执行当前推荐动作，例如生成设定、试写前三章、查看审稿建议。
- 小说列表之后到视频设计之前的动作都属于本阶段重点，包括生成设定、生成全书大纲、生成阶段大纲、生成章节目录、试写前三章、章节审稿、章节重写、影响评估、批量生成正文、全书审稿和确认待视频化。
- 常见推进动作可以通过列表展开、抽屉或弹窗展示摘要；复杂编辑、版本对比和项目级复盘进入小说详情工作台。
- 小说列表接口只返回列表摘要，不返回章节正文、完整审稿报告、完整提示词或大 JSON。
- 小说列表行需要由后端或共享规则给出 `recommendedAction`，前端只负责展示和触发，避免多个页面各自判断下一步。
- 行展开区可以单独请求摘要接口，例如最近任务、最近审稿摘要、章节状态统计、风险提示。
- 小说详情工作台在完整原型中承载完整流程 step、方向方案、设定、大纲、章节、审稿、版本、任务、关联视频和项目级复盘。
- 章节详情工作台在完整原型中承载章节正文、章节摘要、AI 审稿问题、重写优化、候选版本、版本对比和影响评估。
- 章节详情工作台完整规则见 `docs/modules/novel-chapter-workbench.md`，采用候选版本后必须触发影响评估，中等和严重影响需要明确后续章节处理方式。
- 视频列表优先做下游承接，展示待视频化、引用状态、生成状态、人工发布记录和 24/48 小时基础数据回填；视频详情、AI 分镜、自动发布、平台 API 同步和高级运营看板可以在完整蓝图中保留，但实施时再排期。
- 生成任务进度不能只靠按钮 loading，需要有任务状态、进度、失败原因和重试入口。

建议列表相关接口：

- `GET /novels/create-options`：获取创建小说页面选项和系统推荐默认值。
- `POST /novels/drafts`：创建草稿小说项目，保存热点来源、偏好和生成参数。
- `POST /novels/:novelId/directions/generate`：为草稿小说生成方向，返回任务 ID。
- `POST /novels/:novelId/directions/:directionId/select`：选择一个方向。
- `POST /novels/:novelId/directions/fuse`：融合多个方向，返回任务 ID 或候选方向。
- `POST /novels/:novelId/confirm-creation`：确认创建小说项目，进入待生成设定状态。
- `GET /novels`：分页查询小说列表摘要。
- `GET /novels/:novelId/summary`：查询列表行展开摘要。
- `POST /novels/:novelId/actions/:actionType`：触发当前推荐动作或明确动作，返回任务 ID 或待确认结果。
- `POST /novels/:novelId/archive`：归档小说，必须填写原因。
- `POST /novels/:novelId/restore`：恢复归档小说。

建议视频列表相关接口：

- `GET /videos`：分页查询视频项目列表摘要。
- `GET /videos/:videoId/summary`：查询视频列表行展开摘要。
- `POST /videos`：从小说和章节范围创建视频项目。
- `POST /videos/:videoId/actions/:actionType`：触发生成音频、生成字幕、渲染视频、重试失败步骤、标记发布等动作。
- `POST /videos/:videoId/mark-published`：记录人工发布信息。

### 请求层与接口封装

- 统一封装 `shared/services/http.ts`，处理 baseURL、headers、错误提示、登录失效、请求 ID、取消请求和超时。
- 每个模块在自己的 `services` 中导出 typed API 方法，例如 `novelService.listNovels()`，不要在页面中通过字符串 apiName 调用。
- 接口返回统一适配，页面只消费稳定的视图模型。
- GET 查询需要避免缓存问题；长耗时生成操作不直接等待完整结果，而是返回任务 ID。
- 上传、下载、流式任务、轮询任务要独立封装，不能把特殊逻辑散在页面里。

### 路由、菜单与页面缓存

- 路由需要配置 meta：`title`、`module`、`menuKey`、`keepAlive`、`permissionCodes`、`breadcrumb`。
- 权限当前可以后置研发，但路由和按钮要预留权限字段。
- 页面标题、面包屑和菜单选中应由路由 meta 驱动。
- 早期不做复杂多标签页；如果小说详情、章节详情后续需要保留编辑现场，再引入轻量页签或缓存策略。
- 不引入旧项目的微前端 iframe 和跨系统 tab 通信。

### 状态、枚举与字典

- 前端状态文案、颜色、推荐动作需要统一配置，不能散落在页面模板中。
- 小说状态、章节状态、任务状态、审稿评级、影响等级等必须从共享枚举或后端元数据接口获取。
- 状态标签需要同时表达机器状态和小白可理解文案。
- 枚举新增或修改时，需要同步更新后端、前端和文档。

### 组件抽象边界

可以优先沉淀以下共享组件：

- `AdminPage`：后台页面外壳。
- `SearchPanel`：列表筛选区。
- `DataTable`：表格、加载、空状态、分页。
- `StatusTag`：统一状态标签。
- `ActionBar`：主操作和批量操作。
- `ConfirmAction`：高风险操作确认。
- `StepProgress`：流程 step。
- `TaskProgress`：生成任务状态。
- `ReviewScoreCard`：AI 审稿评分卡。
- `VersionList` / `VersionCompare`：版本查看和对比。

不要过早把创建小说向导、小说详情工作台和章节详情工作台抽成通用配置渲染器。它们是小说质量的核心交互，需要优先手写清楚。

### 用户体验与小白引导

- 页面首屏应该直接进入可操作状态，不做营销式首页。
- 每个关键页面都要给出“当前状态”和“下一步建议”。
- 表格字段不追求越多越好，要优先展示状态、分数、风险、推荐动作。
- 高级配置入口要和小白主流程隔离。
- 错误提示要告诉用户下一步怎么处理，而不只是展示技术错误。
- 对 AI 生成失败、审稿低分、章节受影响等情况，要提供明确重试、优化或人工确认入口。

### 不直接照搬的点

- 不照搬 Vue 2、Vuex、mixin 和旧版 Element UI 写法。
- 不照搬旧项目基于字符串 apiName 的请求调用方式，改用 TypeScript typed service。
- 不照搬微前端、iframe、多系统菜单和复杂 tab 通信。
- 不把所有页面都做成配置化，核心创作流程优先手写体验。
- 不把全局状态做得过重；能用页面局部状态和 composable 解决的，不先引入复杂 store。

## 后端设计原则

- 后端使用模块化结构，热点、小说、视频、生成任务分开管理。
- MySQL 是主数据存储，小说项目、章节、生成任务、视频引用关系都应落库。
- AI 调用、视频合成、发布任务属于可异步执行的生成任务，不直接阻塞普通 CRUD API。
- `modules/hotspots` 负责热点素材、热点报告、趋势总结、机会点沉淀和对外热点服务。
- `modules/novels` 负责小说项目、方向、设定、大纲、章节。
- `modules/videos` 负责视频项目、小说引用、生成状态、发布状态。
- `modules/generation` 负责 AI 生成任务编排、任务状态、重试和日志。
- `modules/ai-config` 负责模型供应商配置、模型配置、任务模型映射、策略与程度配置、提示词模板版本、输出结构校验、成本统计、内容安全规则和模型效果复盘；如果不单独成模块，也必须在 generation 内保持独立边界。
- `modules/insights` 或 `modules/review-analytics` 负责学习信号、创作经验案例、小说质量复盘、模型/提示词效果复盘；前期可以先作为数据复盘子模块存在。
- `modules/auth` 和多租户能力可以后续研发，但核心数据表建议预留 createdBy、updatedBy、ownerId、tenantId 等归属字段。
- `infrastructure/database` 只放数据库连接和持久化基础设施，不写业务规则。
- 共享状态枚举优先沉淀到 `packages/shared`，避免前后端各写一份。

## 后端研发规范

本系统后端使用 Node.js + TypeScript + Fastify，但研发规范可以借鉴 recruitment 的 Java 后端做法：入口层要薄，业务编排要集中，外部系统要隔离，数据访问要显式，异常和日志要统一。不要照搬 Java 技术栈，但要复用它的工程边界意识。

后续进入后端实现时，需要同步对照 `docs/backend-implementation-checklist.md`，把本节规范转成每个接口、任务和数据写入的检查项。

### 分层口径

后端建议按以下职责组织：

- `routes` / `controllers`：对应 recruitment 的 Open 层，只负责路由注册、请求校验、权限上下文、响应包装，不直接写复杂业务。
- `services`：对应应用服务层，负责业务编排、状态流转、事务边界、任务调度、操作日志和跨模块协作。
- `domain`：放领域枚举、状态机、规则判断、值对象和纯业务函数，例如章节状态流转、审稿评分规则、任务状态流转。
- `repositories` / `data-access`：负责 Prisma 数据访问，提供明确方法，不让 service 到处散落原始 Prisma 调用。
- `providers` / `clients` / `integrations`：对应 Manager 层，封装外部系统调用，例如大模型、TTS、视频生成工具、对象存储、短视频平台、Redis。
- `workers` / `tasks`：负责异步任务、重试、生成进度、事件处理，不直接承载页面 CRUD 逻辑。
- `shared`：放响应格式、错误码、分页模型、通用枚举、工具函数和跨模块类型。

### API 入口规范

- 每个接口必须声明输入 schema，Fastify 层完成基础参数校验。
- 接口返回统一结构，至少包含 `success`、`data`、`errorCode`、`message`、`requestId`。
- 列表接口统一分页结构，避免每个接口自定义 `page`、`limit`、`total` 字段。
- route 层不写长业务逻辑。超过少量校验、参数转换和 service 调用，就应该下沉到 service。
- 高风险接口必须显式表达业务动作，例如 `confirmChapterVersion`、`archiveNovel`、`clearFollowingChapters`，避免提供任意字段 patch 核心资产。

### 异常与错误码

- 后端使用统一 `BusinessError` 表达可预期业务错误，例如参数非法、状态不允许、资源不存在、重复提交、模型调用失败。
- Fastify 全局 `errorHandler` 统一把错误转成标准响应，不能把原始异常堆栈返回给前端。
- 参数错误、业务错误、外部服务错误、系统未知错误要区分错误码。
- 外部服务异常由 provider/client 层转换成业务可识别的错误，service 不直接依赖第三方原始异常。
- 日志中可以记录错误上下文，但不能记录 API Key、密钥、完整提示词、完整模型响应、外部平台 token。

### 业务编排与事务

- service 是业务编排中心，负责决定“能不能做、做哪些写入、写入顺序、失败怎么处理”。
- 数据库事务由 service 发起，repository 不主动开启跨业务事务。
- 同一个业务动作内涉及多张核心表写入时，必须明确事务边界，例如确认章节版本、章节重写影响处理、归档小说。
- 不建议在数据库事务里执行长时间外部调用。AI、TTS、视频渲染、平台发布应先落生成任务，再由 worker 异步处理。
- 写入正式创作资产前，要先检查当前状态、版本号和影响范围，避免旧页面或重复请求覆盖新数据。

### 外部系统与 Provider

- 大模型、TTS、视频生成、对象存储、短视频平台、Redis 都视作外部能力，必须通过 provider/client 封装。
- provider/client 负责参数组装、超时、重试、错误转换、调用日志摘要和敏感信息脱敏。
- service 只关心业务结果，例如“生成章节成功/失败”“TTS 任务已提交”“视频渲染排队中”，不关心供应商 SDK 细节。
- 外部能力要支持替换，尤其是大模型供应商、TTS 服务和视频生成工具。
- provider 返回的数据进入业务库前必须做结构校验和字段裁剪，避免把不可控大对象直接落库。

### 幂等、防重复与并发

- 用户点击类高风险动作需要防重复，例如生成章节、确认版本、清空后续章节、提交视频渲染。
- 请求级幂等优先使用 `idempotencyToken + actionType + requestHash`。
- 短时间重复点击可以用 Redis 锁或数据库唯一约束兜底。
- 对同一小说、同一章节、同一任务对象，同一时间只能有一个冲突任务执行。
- 重要写入需要校验版本号，例如 `currentContentVersionId`、`versionNo`、`updatedAt`，避免并发覆盖。

### 枚举与字典

- 状态、类型、来源、任务类型、审稿评级、影响等级必须用统一枚举定义。
- 枚举需要包含机器值、中文显示名、说明、是否终态、是否阻塞下一步等信息。
- 前端展示枚举时优先从共享类型或元数据接口获取，不要前后端各维护一份。
- 枚举值不能随意复用旧含义；新增或废弃取值要同步修改文档、接口和数据迁移策略。

### 日志与操作记录

- 普通运行日志用于排查问题，操作日志用于业务复盘，两者不能混在一起。
- service 层在关键业务动作记录结构化日志，例如 novelId、chapterId、taskId、operatorId、action、result、duration。
- `OperationLog` 记录用户可理解的业务动作和原因，不能只存技术日志。
- 生成任务日志要记录步骤、模型、提示词版本、输入摘要、输出摘要、耗时、token、成本和失败原因。
- 开发环境可以开启 SQL 调试，正式环境默认关闭完整 SQL 输出，避免泄露敏感内容和造成日志噪音。

### 异步任务与事件处理

- AI 生成、审稿、影响评估、TTS、视频渲染、发布都按任务处理。
- worker 处理逻辑按 `taskType` 分发，类似 recruitment 里按 topic/tag 分发消息处理器。
- 每个任务处理器只处理一种清晰任务，输入输出结构固定。
- 任务失败要落库，支持重试、取消、换模型重试和失败原因展示。
- worker 不直接越权修改正式资产；需要用户确认的结果进入候选版本或待确认状态。

### 测试规范

- provider/client 层优先写单元测试，重点验证参数组装、错误转换、超时和重试。
- service 层测试重点覆盖状态流转、版本切换、幂等、防重复、审稿阻塞和高风险操作。
- repository 层测试重点覆盖关键查询、分页、过滤、软删除和唯一约束。
- AI 真实调用不作为普通自动化测试默认依赖，可以通过 mock provider、录制样例或单独 smoke 脚本验证。
- 每条核心闭环至少要有一组可重复验证的接口级用例，例如创建小说、生成方向、确认方向、生成章节、章节审稿、章节重写影响处理。

### 不直接照搬的点

- 不把 recruitment 里较大的 service 类照搬过来；我们的小说、章节、审稿、生成任务要拆成更小的 service。
- 不照搬 Java 的 Dubbo、AOP、MyBatis 写法；Node 中用 Fastify hook、schema、errorHandler、Prisma transaction、provider 封装实现同等边界。
- 不把完整模型输入输出、外部素材全文和敏感配置写入运行日志。
- 不为了“规范感”过早引入复杂 DDD 目录；先保持轻量分层，等模块变复杂后再拆 domain service。

## 后续扩展方向

- 热点分析报告 API。
- 热点机会点推荐 API。
- 小说方向生成 API。
- 小说设定生成 API。
- 大纲和章节生成 API。
- 章节调试和重写版本管理。
- 视频项目引用小说章节。
- 发布任务和数据看板。
