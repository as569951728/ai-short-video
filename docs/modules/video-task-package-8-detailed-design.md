# 任务包 8：视频引用承接层详细设计

本文档是任务包 8 的研发和测试总入口。任务包 8 承接任务包 7 的 `video_ready` 小说，负责把小说稳定交给视频系统，但不进入旁白、配音、字幕、渲染、发布和数据回填。

任务包 8 的核心口径是：视频列表、创建视频项目、引用快照、引用异常、默认视频单元。它是视频系统地基，不能做成一次性的简单列表 CRUD。

任务包 8 必须同时对齐：

- `docs/modules/video-system.md`
- `docs/modules/video-reference-exceptions.md`
- `docs/modules/novel-video-readiness.md`
- `docs/modules/novel-core-data-contract.md`
- `docs/modules/novel-state-gate-action-contract.md`
- `docs/prototypes/video-system-page-flow.md`
- `docs/prototypes/video-module-core-prototype.md`
- `docs/prototypes/video-list-prototype.md`
- `docs/prototypes/video-create-project-prototype.md`

## 设计原则

- 承接清晰：小说进入 `video_ready` 后，视频项目只能在视频模块创建，小说模块只提供跳转和引用状态。
- 快照优先：视频项目引用小说时必须保存版本快照，后续小说修改不能静默污染视频项目。
- 完整地基：P8 不生成视频，但要保留 `VideoProject`、`VideoReference`、`VideoUnit`、`VideoReferenceIssue` 等完整对象结构。
- 小白可理解：用户在视频列表能看懂“这个视频引用了哪本小说、哪些章节、当前有没有风险、下一步点哪里”。
- 不越界：P8 页面不能把旁白、TTS、字幕、渲染、发布和数据回填做成可用主动作。
- 可追溯：创建、重检、忽略异常、停止项目等动作必须有操作日志。
- 安全脱敏：前端、任务摘要和普通日志不得暴露完整正文、完整提示词、完整模型响应、API Key、平台 token。

## 前置条件

任务包 8 派发前必须满足：

- 任务包 7 已完成正式验收，或测试结论为可接受风险且需求主控明确接受。
- 小说主链路产品验收节奏已确认，不再把小说环节的交互问题混入 P8。
- `Novel.creationStage=video_ready` 和 `VideoReadinessSnapshot` 可稳定读取。
- 小说详情和小说列表已有“去视频列表”或“可被视频引用”的承接文案。
- 如果 M1 真实模型接入仍在验收中，P8 不能依赖真实视频生成能力；P8 只读已存在的视频化快照。

## 范围边界

### 本包做

- 视频列表 `/videos`。
- 从小说详情跳转视频列表，并带入 `novelId` 打开创建抽屉。
- 创建视频项目。
- 保存视频引用快照。
- 创建默认视频单元。
- 展示引用小说、章节范围、引用版本、引用状态。
- 引用重新检测。
- 引用异常识别、展示、确认忽略、返回小说处理、停止项目。
- 视频项目的基础状态、推荐动作和操作日志。
- P8 的接口、DTO、前端服务、基础测试和验收矩阵。

### 本包不做

- 不生成旁白稿。
- 不生成配音。
- 不生成字幕。
- 不选择视觉方案。
- 不渲染视频。
- 不做视频预览播放器。
- 不做导出、发布、数据回填。
- 不做短视频单元拆分、系列、标题封面候选。
- 不做平台账号、素材库、外部视频工具。

## 全局命名和数据口径

P8 研发前必须统一以下命名，避免建出两套表或 DTO：

- `VideoReference` 是唯一落库实体，它本身就是引用快照；产品文案可以叫“引用快照”，但数据库和接口不使用 `VideoReferenceSnapshot`。
- `VideoReferenceChapterSnapshot` 是 `VideoReference` 子表，用来保存每个引用章节的版本、摘要和风险快照，不使用 `chapterIds[]` 与 `chapterContentVersionIds[]` 平行数组作为唯一事实源。
- `VideoProject` 状态拆为 `lifecycleStatus`、`referenceStatus`、`productionStatus`，不能把 `reference_normal` 等引用状态混进项目生命周期。
- 写接口统一使用 `idempotencyToken + actionType + requestHash`，前端字段也跟随；不要在不同文档和接口中混用 `idempotencyKey/requestFingerprint`。

对象关系：

```text
VideoProject
  -> VideoReference
    -> VideoReferenceChapterSnapshot[]
  -> VideoUnit[]
```

P8 不创建 `VideoArtifact`、`VideoRender`、`VideoExport`，但要预留 P9 使用这些对象的外键和状态扩展空间。

## 模块 1：视频列表驾驶舱

视频列表是视频系统主入口，样式和交互参考小说列表，但信息重点不同。

页面目标：

- 管理视频项目。
- 快速识别引用异常。
- 看清视频项目引用的小说和章节范围。
- 给出单一推荐动作，避免一行塞多个主按钮。

P8 视频列表采用“视频承接概览 + 承接步骤条 + 行级推荐动作”的结构，参考小说详情新交互中“概览页 + 大步骤条 + 步骤详情”的原则。列表页不能只是项目表格，也不能把所有引用细节一次性堆满。

承接步骤条：

| 步骤 | 用户看到的名称 | 完成条件 | 当前可执行动作 |
| --- | --- | --- | --- |
| 1 | 小说已待视频化 | 存在 `video_ready` 小说和有效 `VideoReadinessSnapshot` | 选择小说 |
| 2 | 创建视频项目 | 已填写项目名称、类型和引用范围 | 创建项目 |
| 3 | 保存引用快照 | `VideoReference` 已保存章节版本和快照摘要 | 查看快照 |
| 4 | 引用状态检查 | 引用状态为 normal/info/warning/blocking/resolved | 重新检测或处理异常 |
| 5 | 待进入生成 | 引用不阻塞，项目可被 P9 生成链路承接 | 灰态提示“后续进入视频生成” |

交互规则：

- 顶部步骤条只表达 P8 的承接进度，不表达旁白、TTS、字幕、渲染和发布。
- 步骤 5 在 P8 必须是灰态或“后续能力”，不能成为可点击生成入口；P9 开启后，该节点才变为“进入生成工作台”，路由到 `/videos/:videoId?focus=currentRecommendedStep`。
- 用户从小说详情进入时，步骤条默认停在“创建视频项目”，并自动打开创建抽屉。
- 用户从视频列表直接进入时，步骤条默认展示全局状态，提示先选择可视频化小说。
- 如果存在 blocking 引用异常，步骤条高亮“引用状态检查”，并提示必须先处理异常。

列表顶部：

- 总项目数。
- 引用正常数量。
- 需要关注数量。
- 阻塞异常数量。
- 已停止数量。
- 主按钮：新建视频项目。
- 次按钮：刷新引用状态。

筛选项：

- 视频项目名称。
- 引用小说。
- 引用状态：normal、info、warning、blocking、resolved。
- 项目生命周期：active、stopped、archived。
- 生产状态：not_started、ready_for_generation、generation_locked。
- 更新时间。

表格字段：

- 视频项目：名称、类型。
- 引用小说：小说名、小说当前创作状态。
- 引用章节：章节范围、章节数。
- 引用快照：快照时间、章节版本摘要。
- 引用状态：统一标签和一句话说明。
- 视频生产状态：P8 固定为“未开始”或“待后续生成能力”。
- 最近变化：小说或引用最近更新时间。
- 推荐动作：查看快照、查看异常、重新检测、回小说处理、停止项目。

行级引导：

- 每行展示一个小型状态路径：已创建、已保存快照、引用正常/异常、待后续生成。
- 推荐动作只保留一个主按钮，其他动作放入更多菜单或详情抽屉。
- 点击已完成状态节点打开摘要；点击未解锁节点只展示解锁条件，不跳转或执行。
- 如果行主按钮禁用，按钮旁必须展示原因，例如“引用阻塞，需先处理第 2 章变化”。
- 禁用按钮统一采用“按钮旁短原因 + 详情 tooltip/抽屉 + 可执行替代动作”的展示方式，不能只有灰色按钮。
- 没有最近任务时，不显示可点击“任务详情”；展示“暂无引用检测任务”。

P8 列表不能出现可点击的“生成视频”“生成配音”“生成字幕”“渲染”“发布”“回填数据”主动作。

空状态：

| 场景 | 页面文案 | 主动作 |
| --- | --- | --- |
| 没有视频项目，但存在可视频化小说 | 当前还没有视频项目，可以从已待视频化小说创建第一个项目 | 新建视频项目 |
| 没有可视频化小说 | 暂无可创建视频项目的小说，需要先完成小说全书审稿和待视频化确认 | 去小说列表 |
| 筛选无结果 | 没有符合筛选条件的视频项目 | 清空筛选 |
| 全部项目阻塞 | 当前有引用异常阻塞，建议先处理异常项目 | 查看阻塞异常 |

## 模块 2：创建视频项目向导

入口：

- 视频列表点击“新建视频项目”。
- 小说详情待视频化区点击“去视频列表”，跳转 `/videos?create=1&novelId=xxx` 并自动打开抽屉。
- 视频列表空状态点击“从待视频化小说创建”。

创建抽屉采用 4 步向导，不使用一个长表单。每一步都要明确告诉用户“这一步确认什么”。

| 步骤 | 名称 | 用户要确认什么 | 主动作 |
| --- | --- | --- | --- |
| 1 | 选择小说 | 这本小说是否已经完成并可被视频引用 | 下一步：确认范围 |
| 2 | 确认引用范围 | 引用哪些章节，是否使用系统推荐首条范围 | 下一步：创建前检查 |
| 3 | 创建前检查 | 章节正文、快照版本、风险和重复项目是否可用 | 创建视频项目 |
| 4 | 创建完成 | 项目已创建、引用快照已保存、下一步只能查看快照 | 查看引用快照 |

步骤 1：选择小说

- 从小说详情带入时，小说字段只读展示，允许“更换小说”作为次操作。
- 从视频列表新建时，先选择 `video_ready` 小说。
- 如果小说不是 `video_ready`，展示阻塞原因和“回小说详情处理”。
- 右侧展示待视频化快照摘要、全书评分、首条建议和风险标签。

步骤 2：确认引用范围

- 默认选中系统推荐首条范围。
- 章节范围用章节号、章节标题、正文状态、风险标签展示。
- 用户修改范围后，预计旁白时长和风险摘要实时刷新。
- 如果选择了无正式正文或 blocking 风险章节，下一步按钮禁用并说明原因。

步骤 3：创建前检查

- 用检查清单展示：小说状态、快照版本、章节正文、章节风险、重复项目、幂等保护。
- 每项检查显示通过、需关注、阻塞三种状态。
- 阻塞项存在时，主按钮禁用；需关注项允许继续但要提示影响。
- 这里明确提示：创建后只保存引用快照，不会开始生成视频。

步骤 4：创建完成

- 展示新项目名称、引用小说、章节范围、引用快照时间和默认视频单元。
- 主按钮是“查看引用快照”。
- 次按钮是“回视频列表”。
- 灰态提示“视频生成、预览和导出将在后续生成工作台处理”。

表单字段：

| 字段 | 控件 | 规则 |
| --- | --- | --- |
| 引用小说 | 远程搜索/只读带入 | 只能选择 `video_ready` 小说 |
| 视频类型 | 单选 | P8 默认“首条测试”，预留章节范围、阶段系列、整本短视频集 |
| 引用章节范围 | 章节范围选择 | 默认使用待视频化快照推荐首条范围 |
| 项目名称 | 输入框 | 默认“小说名 + 章节范围”，可编辑 |
| 创建说明 | 文本框 | 可选，用于记录运营目的 |

右侧摘要：

- 小说当前状态。
- 全书评分和待视频化结论。
- 首条视频建议。
- 推荐章节范围。
- 引用章节数。
- 预计旁白时长区间。
- 内容安全和平台风险摘要。
- 当前是否存在阻塞风险。

创建前校验：

- 小说必须是 `video_ready`。
- 必须存在有效 `VideoReadinessSnapshot`。
- 引用章节必须有正式正文版本。
- 引用章节范围不能包含 blocking 风险。
- 当前没有同一小说、同一章节范围、同一快照版本的冲突创建请求。
- `idempotencyToken` 必填；同 token 同 `actionType/requestHash` 复用已有创建结果，同 token 不同 `requestHash` 返回幂等冲突。

创建成功后：

- 创建 `VideoProject`。
- 创建 `VideoReference`。
- 创建默认 `VideoUnit`。
- 写入 `OperationLog`。
- 回到视频列表并高亮新项目。
- 主动作是“查看引用快照”，不是“生成视频”。

创建失败交互：

| 失败原因 | 页面展示 | 推荐动作 |
| --- | --- | --- |
| 小说状态变化 | 这本小说当前已不能创建正式视频项目 | 回小说详情 |
| 快照过期 | 待视频化快照已过期，需要重新检查 | 回小说详情重新检查 |
| 章节范围非法 | 当前范围包含不可引用章节 | 重新选择范围 |
| 重复项目 | 已存在相同小说和章节范围的视频项目 | 查看已有项目 |
| 幂等冲突 | 本次提交内容和上次不同，请刷新后重试 | 刷新抽屉 |
| 服务失败 | 暂时不能保存引用快照 | 重试或稍后再试 |

## 模块 3：VideoProject 基础对象

`VideoProject` 是视频模块一级对象。

建议字段：

```text
id
tenantId
name
type
novelId
referenceId
lifecycleStatus
referenceStatus
productionStatus
generationMode
currentUnitId
currentRenderId
publishStatus
createdBy
createdAt
updatedAt
stoppedAt
stoppedReason
```

P8 状态：

| 状态维度 | 状态 | 含义 | 推荐动作 |
| --- | --- | --- | --- |
| `lifecycleStatus` | `active` | 项目可继续处理 | 看引用或进入后续生成 |
| `lifecycleStatus` | `stopped` | 项目停止 | 查看记录 |
| `lifecycleStatus` | `archived` | 项目归档 | 查看记录 |
| `referenceStatus` | `normal` | 引用正常 | 查看引用快照 |
| `referenceStatus` | `info` | 轻微变化 | 查看差异 |
| `referenceStatus` | `warning` | 有风险但不强阻塞 | 查看异常 |
| `referenceStatus` | `blocking` | 引用阻塞 | 处理异常 |
| `referenceStatus` | `resolved` | 异常已处理 | 查看处理记录 |
| `productionStatus` | `not_started` | 尚未生成 | P8 灰态，P9 进入生成 |
| `productionStatus` | `generation_locked` | 被引用异常阻塞 | 处理异常 |

P8 不启用 `generating`、`generated`、`exported`、`published`，这些从 P9/P10 开始。

## 模块 4：默认 VideoUnit

`VideoUnit` 是单条可生成视频的单位。P8 只创建默认单元，不做拆条和系列。

建议字段：

```text
id
tenantId
videoProjectId
unitNo
chapterIds[]
chapterRangeLabel
summary
hookText
firstScreenSubtitle
estimatedDurationSeconds
status
currentStep
createdAt
updatedAt
```

规则：

- 创建视频项目时自动创建一个默认 `VideoUnit`。
- 默认单元引用项目选择的章节范围。
- `hookText`、`firstScreenSubtitle`、`estimatedDurationSeconds` 可以来自 `VideoReadinessSnapshot.firstVideoSuggestionJson`。
- P8 只展示默认单元摘要，不提供“生成旁白”或“拆成多条”入口。
- 后续 P11 做短视频单元和系列时，基于这个对象扩展，不重建数据模型。

## 模块 5：VideoReference 引用快照

`VideoReference` 用于锁定视频项目引用的小说版本。

建议字段：

```text
id
tenantId
videoProjectId
novelId
videoReadinessSnapshotId
chapterIds[]
reviewReportId
riskSummary
firstVideoSuggestionSummary
status
createdBy
createdAt
```

规则：

- 创建视频项目时保存引用快照。
- 视频系统不能直接用实时正文替代引用快照。
- 小说后续修改不能自动改写 `VideoReference`。
- 引用快照展示摘要，不在前端展示完整正文。
- 渲染、导出、发布等后续产物必须能追溯到 `VideoReference`。
- `chapterIds[]` 只作为列表和查询摘要缓存；章节版本、正文 hash、特性卡版本和风险摘要必须以 `VideoReferenceChapterSnapshot` 为事实源。

### VideoReferenceChapterSnapshot

`VideoReferenceChapterSnapshot` 保存每个引用章节的版本快照。

建议字段：

```text
id
tenantId
videoReferenceId
chapterId
chapterNo
chapterTitle
contentVersionId
featureCardVersionId
contentHash
summarySnapshot
riskSnapshot
createdAt
```

规则：

- 每个被引用章节必须保存一条快照记录。
- 引用重检用该表和当前章节版本、正文 hash、特性卡版本、风险摘要做对比。
- 列表和抽屉展示版本摘要，不展示完整正文。

引用快照抽屉展示：

- 引用小说。
- 引用章节范围。
- 每章版本摘要。
- 待视频化检查摘要。
- 全书审稿摘要。
- 首条视频建议。
- 创建时间、创建人。
- 重新检测入口。

引用快照抽屉也需要使用子步骤式阅读结构，避免用户不知道要看哪里。

| 子步骤 | 名称 | 展示重点 | 可用动作 |
| --- | --- | --- | --- |
| 1 | 引用来源 | 来自哪本小说、哪个待视频化快照、谁创建 | 回小说详情 |
| 2 | 章节版本 | 引用了哪些章节和正文版本 | 查看章节摘要 |
| 3 | 视频建议 | 首条视频建议、钩子、首屏字幕、风险标签 | 复制摘要 |
| 4 | 引用状态 | 当前是否和小说最新版本一致 | 重新检测 |

交互规则：

- 当前引用正常时，抽屉底部主按钮为“重新检测引用状态”。
- 当前存在异常时，抽屉底部主按钮为“查看引用异常”。
- 章节版本只展示摘要和版本号，不展示完整正文。
- 如果用户点击“后续生成”相关提示，展示说明“当前阶段只维护引用快照，生成链路在 P9 开启”。

## 模块 6：VideoReferenceIssue 引用异常

引用异常负责识别“视频项目引用的小说内容”和“小说当前内容”之间的变化。

建议字段：

```text
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
resolutionAction
resolutionReason
createdAt
resolvedAt
resolvedBy
```

异常等级：

| 等级 | 含义 | P8 默认处理 |
| --- | --- | --- |
| `info` | 轻微变化，不强阻塞 | 查看差异或确认忽略 |
| `warning` | 引用章节或审稿摘要有变化 | 返回小说处理、确认继续或重新检测 |
| `blocking` | 引用正文失效、章节待处理或风险升高 | 禁止后续生成、渲染、确认当前视频和导出，必须处理到 `normal/resolved` |

触发场景：

- 被引用章节正式正文变化。
- 被引用章节摘要或特性卡关键变化。
- 被引用章节被清空、重写或进入待处理。
- 全书审稿报告过期。
- 待视频化快照过期。
- 内容安全或平台风险升高。
- 小说从 `video_ready` 回退到正文处理或全书质量处理。

P8 处理动作：

- 查看异常详情。
- 重新检测。
- 返回小说详情处理。
- 确认忽略，必须填写原因；只适用于 `info/warning`，不适用于 `blocking`。
- 停止视频项目，必须填写原因。

引用异常抽屉采用 4 步处理流，不用普通 tab。每一步都要告诉用户当前判断和下一步。

| 步骤 | 名称 | 用户要确认什么 | 主动作 |
| --- | --- | --- | --- |
| 1 | 查看异常 | 哪些章节或快照发生变化，异常等级是什么 | 下一步：看影响 |
| 2 | 判断影响 | 是否影响已有产物、是否阻塞后续生成 | 下一步：选择处理 |
| 3 | 选择处理 | 回小说处理、重新检测、确认忽略、停止项目 | 执行处理 |
| 4 | 处理结果 | 处理人、时间、原因和当前状态 | 回列表 |

步骤 1：查看异常

- 顶部用一句话说明异常，例如“第 2 章正式正文已变化，当前视频引用可能过期”。
- 展示异常等级、触发对象、受影响章节、触发时间。
- warning 和 blocking 使用醒目但不夸张的风险样式。

步骤 2：判断影响

- 展示“当前是否已有旁白/音频/字幕/视频/发布记录”。P8 默认多为未生成，但字段要预留。
- 展示“如果继续不处理，后续会有什么风险”。
- blocking 必须显示“当前不能进入视频生成”。

步骤 3：选择处理

- `info`：查看差异、确认忽略。
- `warning`：返回小说处理、确认继续、重新检测。
- `blocking`：返回小说处理、重新选择引用范围或停止项目。
- 确认忽略和停止项目必须弹出原因输入。
- `blocking` 不能靠填写原因继续；必须返回小说修复、重新选择引用范围、停止项目，或由重检证明异常已解除。
- 执行动作前展示影响范围，避免用户误以为会自动修改小说或视频。

步骤 4：处理结果

- 展示处理结果、原因、处理人和时间。
- 如果异常已解决，行状态回到 resolved 或 normal。
- 如果用户选择回小说处理，保留返回入口和待处理提示。

异常状态枚举：

| 状态 | 含义 |
| --- | --- |
| `open` | 待处理 |
| `resolved` | 已通过修复、重新选择范围或重检解除 |
| `ignored` | 已对 `info/warning` 记录原因并继续 |
| `stopped` | 已停止项目 |

处理动作枚举：

| 动作 | 适用等级 | 含义 |
| --- | --- | --- |
| `return_to_novel` | warning/blocking | 回小说处理正文、审稿或待视频化问题 |
| `reselect_reference_range` | blocking | 重新选择可引用章节范围 |
| `recheck_reference` | info/warning/blocking | 重新检测引用状态 |
| `confirm_continue` | info/warning | 记录原因后继续 |
| `stop_project` | warning/blocking | 停止当前视频项目 |

`blocking` 的处理结果必须是 `resolved` 或 `stopped`；不能进入 `ignored`，也不能仅靠 `resolutionReason` 解锁后续生成。

P8 不做：

- 不重新生成旁白、音频、字幕、渲染。
- 不创建新发布版本。
- 不自动覆盖任何已导出或已发布内容。

## 模块 7：小说模块联动

小说侧只提供承接入口和引用状态，不承载视频创建细节。

小说详情：

- `video_ready` 后展示待视频化快照摘要。
- 展示“去视频列表”入口。
- 如果已有视频引用，展示引用项目数量和异常摘要。
- 不出现 TTS、字幕、渲染、发布等视频生产主动作。

小说列表：

- 视频引用列展示：未引用、可被引用、已引用、引用异常。
- 主操作仍是“详情”。
- 不在小说列表直接创建视频项目。

章节详情：

- 如果章节已被视频引用，修改正文或摘要时提示可能产生引用异常。
- 保存修改后触发引用异常检测或标记需要重新检测。

## 模块 8：接口契约

P8 建议接口：

```text
GET /videos
GET /videos/create-options
POST /videos/create-check
POST /videos
GET /videos/:videoId
GET /videos/:videoId/reference
POST /videos/:videoId/reference/recheck
POST /videos/:videoId/reference/issues/:issueId/ignore
POST /videos/:videoId/stop
```

`GET /videos/create-options` 用于创建抽屉初始化：

- 返回可选 `video_ready` 小说、待视频化快照摘要、系统推荐引用范围和已存在视频项目摘要。
- 不返回完整正文、完整提示词和完整模型响应。

`POST /videos/create-check` 用于创建前检查：

- 接收小说、快照、章节范围和视频类型。
- 返回小说状态、章节正文、风险、重复项目、引用快照可创建性和推荐处理动作。
- 重复项目默认推荐“查看已有项目”；如果用户仍要创建独立项目，必须填写创建说明并产生不同 `requestHash`。

`POST /videos` 请求：

```text
idempotencyToken
actionType
requestHash
novelId
videoReadinessSnapshotId
videoType
chapterIds[]
name
description
expectedNovelStage
expectedVideoReadinessSnapshotVersion
```

`POST /videos` 规则：

- `idempotencyToken`、`actionType`、`requestHash` 必填。
- 同 token 同 actionType 同 requestHash 返回已有项目。
- 同 token 同 actionType 不同 requestHash 返回 `IDEMPOTENCY_CONFLICT`。
- 小说不是 `video_ready` 返回门禁错误。
- 快照过期返回版本错误。
- 章节范围非法返回校验错误。

`POST /videos/:videoId/reference/recheck` 规则：

- 可同步返回轻量结果，也可创建异步任务；如果检查涉及多章节 diff，优先异步任务。
- 同一视频项目同一时间只能有一个引用重检任务。
- 重检只更新引用状态和异常记录，不修改引用快照。

`POST /videos/:videoId/reference/issues/:issueId/ignore` 请求：

```text
idempotencyToken
actionType
requestHash
reason
expectedIssueStatus
```

规则：

- 忽略原因必填。
- `blocking` 异常不能忽略，返回 `VIDEO_REFERENCE_BLOCKING`。
- `info/warning` 才允许确认忽略或确认继续。
- 已处理异常不能重复处理。

## 模块 9：任务、并发和幂等

P8 任务类型：

- `video_reference_recheck`
- `video_reference_issue_create`，可作为内部事件或任务。

冲突规则：

- 同一小说、同一章节范围、同一快照版本的创建请求需要幂等保护。
- 所有写接口都必须包含 `idempotencyToken + actionType + requestHash` 和必要的 expected version；缺失任一项应判定为研发阻塞。
- 同一视频项目不能并发执行多个引用重检任务。
- 引用状态为 `blocking` 时，后续生成入口必须禁用；P8 虽未实现生成，也要在推荐动作中体现禁用原因。
- 小说侧章节修改不能直接改视频项目，只能触发异常。

任务展示：

- 视频列表能展示最近引用重检任务。
- 任务失败时显示通俗原因和下一步。
- 任务重试不能绕过版本校验。

## 模块 10：前端交互

P8 页面至少包含：

- `/videos` 视频列表。
- 创建视频项目抽屉。
- 引用快照抽屉。
- 引用异常抽屉。
- 任务详情抽屉复用任务组件。

交互要求：

- 视频列表样式参考小说列表，保持筛选、标签、表格、行展开、抽屉的一致性。
- 每行只保留一个主推荐动作。
- 后续能力只做灰态提示，不做可点击主按钮。
- 创建抽屉要告诉用户“这里只保存引用，不会开始生成视频”。
- 引用异常抽屉要告诉用户“为什么异常、影响什么、下一步做什么”。
- 长任务不能只显示按钮 loading，需要复用任务进度组件。
- 所有失败都要有通俗文案和下一步建议。

## 模块 11：数据、安全和审计

必须记录：

- 创建视频项目。
- 创建引用快照。
- 重新检测引用。
- 确认忽略异常。
- 停止视频项目。

不能记录到普通日志或前端：

- 完整小说正文。
- 完整提示词。
- 完整模型响应。
- API Key。
- 平台 token。
- 数据库连接串。

审计要求：

- 高风险动作必须有 `OperationLog`。
- 忽略异常和停止项目必须有原因。
- 所有接口返回使用统一响应结构和统一错误码。
- 所有写接口必须有输入 schema 校验。

## 验收标准

P8 完成后，测试会话至少验证：

1. 视频列表可打开，能展示项目、引用小说、章节范围、引用状态和推荐动作。
2. 从小说详情 `video_ready` 入口能跳转视频列表并打开创建抽屉。
3. 创建视频项目只能选择 `video_ready` 小说。
4. 创建项目时 `idempotencyToken/actionType/requestHash` 必填，同 token 同 actionType 同 hash 复用结果，同 token 同 actionType 不同 hash 返回冲突。
5. 创建成功后保存 `VideoProject`、`VideoReference`、默认 `VideoUnit`。
6. 创建成功后不自动进入旁白、TTS、字幕或渲染。
7. 引用快照能展示章节范围、版本摘要、待视频化摘要和首条视频建议。
8. 修改被引用章节后，视频项目能产生或展示引用异常。
9. 引用异常有等级、原因、影响范围和推荐动作。
10. 确认忽略异常必须填写原因并写入操作日志。
11. blocking 异常下，后续生成入口不可用或明确提示不能继续。
12. 停止项目必须填写原因。
13. 页面不暴露密钥、token、完整提示词、完整模型响应。
14. P8 页面不出现可用的视频生成、发布、数据回填主动作。
15. 创建前检查能识别重复项目，并默认推荐查看已有项目；如仍创建独立项目，必须填写原因并形成不同 `requestHash`。
16. `blocking` 引用异常不能通过“确认忽略”或只填写原因解锁。
17. 引用异常等级、状态、处理动作和处理结果都能被接口和前端一致展示。

## 阻塞标准

出现以下情况，P8 验收应判定阻塞：

- 非 `video_ready` 小说可以创建正式视频项目。
- 创建视频项目没有保存章节版本快照。
- 重复提交会创建不可控重复项目，或幂等冲突判断错误。
- 任一写接口缺少 `idempotencyToken/actionType/requestHash` 或必要 expected version。
- 小说修改会静默改写视频引用快照。
- 被引用章节变化后无法产生或展示引用异常。
- 用户可以在 P8 页面直接触发配音、字幕、渲染、发布或数据回填。
- 忽略异常不要求原因。
- `blocking` 异常可以被忽略、确认继续，或只填写原因后继续。
- 前端或日志暴露密钥、完整提示词、完整模型响应。

## 可接受风险

以下情况可以记录为非阻塞风险，但需要进入后续修复或 P9 计划：

- P8 只做摘要级差异，不做逐字 diff。
- P8 引用重检先用同步轻量实现，后续再升级为长任务。
- P8 只有默认单元，不支持复杂拆条。
- P8 不做视频详情完整工作台，只用列表抽屉承载引用信息。
- P8 的真实 MySQL 复杂写路径如果环境不足，可先以核心单测和受控 live smoke 证明，但需要记录未覆盖范围。

## 交付物

后端：

- 数据模型和迁移。
- `VideoProject`、`VideoReference`、`VideoUnit`、`VideoReferenceIssue` 领域规则。
- 视频项目创建服务。
- 引用快照服务。
- 引用异常检测服务。
- P8 接口和 schema。
- 幂等、并发、操作日志。
- 单元测试和接口测试。

前端：

- 视频列表页。
- 创建视频项目抽屉。
- 引用快照抽屉。
- 引用异常抽屉。
- 小说详情跳转视频列表入口联动。
- API service、model、constants、composable。
- 任务进度组件复用。
- 页面 smoke 和关键交互测试。

文档：

- 如实际接口、状态或字段与本文档不同，研发必须同步更新本文档和相关总纲。
