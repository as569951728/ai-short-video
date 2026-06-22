# 小说系统研发契约 v1

## 文档目的

本文档是小说系统进入研发前的总契约，用于把需求、原型、状态机、任务、版本、接口和测试口径收束成研发会话可以直接执行的范围。

本契约不替代已有细则文档，而是给研发和测试提供入口：

- 系统级模块边界：`docs/modules/system-module-boundaries.md`
- 小说完整状态机：`docs/modules/novel-state-machine.md`
- 状态、门禁、推荐动作：`docs/modules/novel-state-gate-action-contract.md`
- 资产采用与过期：`docs/modules/novel-asset-adoption-staleness-contract.md`
- 任务并发与批量任务：`docs/modules/novel-task-concurrency-contract.md`
- AI 任务生命周期：`docs/modules/generation-task-lifecycle.md`
- 待视频化判定：`docs/modules/novel-video-readiness.md`
- 核心数据契约：`docs/modules/novel-core-data-contract.md`
- 接口契约：`docs/modules/novel-api-contract.md`
- 首批研发任务包：`docs/modules/novel-first-iteration-development-plan.md`
- 验收测试矩阵：`docs/modules/novel-acceptance-test-matrix.md`

## 首期研发目标

首期不是把完整 AI 短视频系统全部做完，而是把小说创作主链路做成可运行、可追踪、可测试的闭环。

首期必须跑通：

1. 从小说列表进入创建小说。
2. 生成或模拟生成 3-5 个方向候选。
3. 确认方向后推进设定。
4. 生成并确认设定、大纲、章节目录。
5. 试写前 1-3 章，形成正文、章节摘要和审稿结果。
6. 处理试写问题后进入批量正文阶段。
7. 生成章节正文，支持章节重写、候选采用和影响评估。
8. 全书审稿，生成完成门禁。
9. 用户确认完成。
10. 待视频化检查通过后生成视频化快照。

首期可以简化：

- AI 生成可以先接一个可替换 provider，必要时支持 mock provider。
- 视频系统先只承接视频列表、引用快照和引用异常，不做复杂视频生产。
- 模型配置后台可以先使用种子配置和默认策略，不做完整后台页面。
- 权限租户可以先用默认租户和默认用户，但核心表必须保留 `tenantId`、`ownerId`、`createdBy`。
- 运营复盘可以先支持人工发布记录和基础数据口子。

首期不能简化掉：

- 核心状态机。
- 生成任务记录和任务进度。
- 关键资产版本化。
- 用户确认后才采用 AI 候选。
- 高风险操作的原因、影响范围和日志。
- 待视频化快照和视频引用版本校验。

## 事实源原则

小说主表只保存三个核心状态：

| 字段 | 含义 | 事实源 |
| --- | --- | --- |
| `lifecycleStatus` | 小说是否仍在创作池 | 是 |
| `creationStage` | 主链路推进到哪一步 | 是 |
| `stageStatus` | 当前阶段处理状态 | 是 |

以下内容不能作为业务放行事实源：

- `displayStatus`
- `currentStep`
- `completedSteps`
- `recommendedActionSnapshot`
- `videoReferenceStatus`

它们可以缓存用于列表性能，但关键业务动作必须重新读取事实数据并执行门禁校验。

## 主链路阶段

首期研发以以下阶段为准：

| 阶段 | 研发含义 | 主要事实数据 |
| --- | --- | --- |
| `draft` | 草稿项目已创建 | 小说、创建偏好、热点来源 |
| `direction` | 方向候选生成和选择 | 方向版本、方向审稿、用户决策 |
| `setting` | 小说设定生成和确认 | 设定版本、风险确认 |
| `outline` | 全书大纲和阶段大纲 | 大纲版本、阶段大纲版本 |
| `chapter_plan` | 章节目录确认 | 章节目录版本、章节计划 |
| `trial` | 前 1-3 章试写调试 | 试写批次、章节正文、审稿 |
| `body` | 批量正文和章节处理 | 章节、正文版本、影响案例 |
| `full_review` | 全书审稿 | 全书审稿报告、完成门禁 |
| `completion_confirm` | 用户确认完成 | 完成决策、待视频化检查 |
| `video_ready` | 可被视频系统引用 | 视频化快照、引用可用范围 |

阶段流转只能由明确业务事件触发，禁止通过通用 PATCH 修改核心状态。

## 研发边界

### 前端边界

前端负责：

- 页面组合、路由参数和用户交互入口。
- 展示后端返回的状态摘要、推荐动作、任务进度、候选版本和阻塞原因。
- 对高风险动作展示二次确认和原因输入。
- 通过服务层调用 typed API。

前端不负责：

- 自行推导能否进入下一阶段。
- 自行判断任务互斥。
- 直接修改核心状态。
- 在本地保存 API Key、完整提示词、完整模型响应。

### 后端边界

后端负责：

- 状态流转、门禁校验、版本采用、任务创建、任务互斥、事务边界和操作日志。
- 统一计算 `statusSummary`。
- 提供业务动作接口，不提供任意字段更新核心资产的接口。
- 确保 worker 不能绕过用户确认直接修改正式创作资产。

后端不负责：

- 把供应商 SDK 细节泄漏到业务服务。
- 在普通日志里保存完整提示词、完整模型响应和密钥。
- 让 route/controller 承担复杂业务编排。

### 任务系统边界

任务系统负责：

- 记录任务、进度、失败、重试、取消、成本和事件。
- 按 `objectType + objectId + conflictScope + conflictKey` 控制冲突。
- 记录 `sourceVersionRefs`，防止旧上下文写入新资产。

任务系统不负责：

- 独立决定正式资产是否采用。
- 绕过小说系统门禁推进阶段。
- 用一个模糊 `generate` 类型承载所有业务任务。

## 服务层建议

后端首期建议至少拆出以下应用服务或等价模块：

| 服务 | 主要职责 |
| --- | --- |
| `NovelStatusService` | 计算状态摘要、门禁、推荐动作 |
| `NovelCreationService` | 创建草稿、方向生成、方向确认 |
| `NovelStructureService` | 设定、大纲、章节目录生成和确认 |
| `NovelChapterService` | 章节正文、重写、审稿、摘要和影响处理 |
| `NovelAssetVersionService` | 候选采用、历史恢复、过期副作用 |
| `GenerationTaskService` | 任务创建、幂等、互斥、状态事件 |
| `NovelReviewService` | 章节审稿、试写总评、全书审稿和完成门禁 |
| `VideoReadinessService` | 待视频化检查、快照、引用异常 |
| `OperationLogService` | 高风险动作日志和决策记录 |

路由层只做 schema 校验、权限上下文、参数转换和响应包装。

## 关键业务动作契约

每个关键动作都必须按以下顺序处理：

1. 校验用户、租户和权限。
2. 校验小说生命周期。
3. 校验核心状态和目标动作门禁。
4. 校验当前版本、候选版本和页面版本号。
5. 校验冲突任务。
6. 对高风险动作记录确认项和原因。
7. 创建任务，或在事务中完成版本采用与状态流转。
8. 写操作日志、任务事件和决策记录。
9. 重新计算 `statusSummary`。
10. 返回用户可理解的下一步动作。

禁止出现：

- 先改状态，后补版本或日志。
- 任务成功后直接覆盖当前正文。
- 前端传哪个状态，后端就写哪个状态。
- 一个接口既做普通保存又做高风险确认。

## 状态摘要返回要求

小说列表、小说详情、章节详情和推荐动作入口都必须使用同一套状态摘要。

```text
statusSummary
  lifecycleStatus
  creationStage
  stageStatus
  displayStatus
  displayStatusText
  currentStep
  completedSteps[]
  blockingReasons[]
  recommendedAction
  videoPreparationStatus
  videoReferenceStatus
  calculatedAt
  calculationVersion
```

`recommendedAction` 至少包含：

```text
type
label
reasonText
target
disabled
disabledReason
confirmRequired
taskType
```

列表行主按钮仍优先为“详情”。推荐动作可以作为摘要、详情默认焦点或任务入口，不把小说列表变成复杂操作台。

## 用户确认与高风险动作

以下动作必须二次确认并记录原因：

- 低分候选仍采用。
- 采用过期候选。
- 修改关键设定。
- 恢复历史版本。
- 清空后续章节。
- 强制通过试写或全书审稿。
- 修改已被视频引用章节。
- 忽略视频引用异常。
- 归档、恢复归档、删除小说。

确认记录必须包含：

- 操作人。
- 操作时间。
- 原因。
- 用户看到的当前版本。
- 影响范围摘要。
- 操作前后版本。
- 相关任务或审稿报告。

## 研发完成定义

一个研发任务只有同时满足以下条件才算完成：

- 前后端页面或接口可运行。
- 关键状态、门禁、任务、版本和日志按文档落库。
- 高风险动作有确认、原因和操作日志。
- 有覆盖成功、失败、重复点击、冲突任务、过期版本的测试。
- 文档中对应接口、字段或规则发生变化时已同步更新。
- 测试会话能按 `docs/modules/novel-acceptance-test-matrix.md` 复验。

## 给研发会话的首条指令基准

后续创建全栈研发会话时，可以把以下内容作为任务说明基础：

```text
你是 AIShortvideo 项目的全栈研发会话。
当前只实现小说系统首期研发任务，不展开新需求。
实现前必须阅读：
- AGENTS.md
- docs/modules/system-module-boundaries.md
- docs/modules/novel-development-contract.md
- docs/modules/novel-core-data-contract.md
- docs/modules/novel-api-contract.md
- docs/modules/novel-first-iteration-development-plan.md
- docs/backend-implementation-checklist.md
- docs/frontend-implementation-checklist.md

研发时遵守：
- 不绕过状态机、任务互斥和资产版本规则。
- 不让 worker 直接覆盖正式创作资产。
- 不在前端或普通日志暴露密钥、完整提示词、完整模型响应。
- 每完成一个任务包，先自测，再把结果交给测试会话验收。
```
