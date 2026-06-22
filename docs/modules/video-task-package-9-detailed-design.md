# 任务包 9：视频生成工作台、预览调试和导出详细设计

本文档是任务包 9 的研发和测试总入口。任务包 9 承接任务包 8 的视频项目、引用快照和默认视频单元，负责跑通首版“可控的视频生成闭环”。

任务包 9 的核心口径是：视频详情工作台、旁白稿、配音（TTS）、字幕、视觉方案、渲染、系统内预览、不满意回退、确认当前视频和导出。它可以先生成简单内容，但系统能力不能是简单的一键文件生成。

任务包 9 必须同时对齐：

- `docs/modules/video-system.md`
- `docs/modules/video-task-package-8-detailed-design.md`
- `docs/modules/video-reference-exceptions.md`
- `docs/modules/generation-task-lifecycle.md`
- `docs/modules/novel-task-concurrency-contract.md`
- `docs/modules/ai-config-management.md`
- `docs/modules/model-integration-m1-deepseek-provider.md`
- `docs/prototypes/video-detail-workbench-prototype.md`
- `docs/prototypes/video-simple-generation-prototype.md`
- `docs/prototypes/video-module-core-prototype.md`

## 设计原则

- 生成可控：用户能看见每一步产物，不接受黑盒一键生成。
- 预览优先：生成的视频必须能在系统内预览，用户满意后才确认和导出。
- 不满意可回退：用户不满意时能明确回到旁白、音频、字幕、视觉或渲染步骤修正。
- 版本不覆盖：旁白、音频、字幕、视觉方案和渲染文件都必须版本化。
- 依赖可见：上游变化后，下游产物必须标记过期，不能静默复用。
- 任务可见：旁白、TTS、字幕、渲染等长任务必须展示进度、失败原因、重试和取消。
- 简单内容，完整结构：P9 默认使用循环背景视频，但保留视觉方案和后续分镜、模板、外部视频工具扩展点。
- 不越界：P9 不做自动发布、平台账号、数据回填、短视频系列和运营复盘。

## 前置条件

任务包 9 派发前必须满足：

- 任务包 8 已完成正式验收，或测试结论为可接受风险且需求主控明确接受。
- 视频项目存在有效 `VideoReference`。
- 视频项目至少有一个默认 `VideoUnit`。
- 引用状态必须不是 `blocking`；历史 `blocking` 必须已处理到 `normal/resolved`。只填写原因不能解锁生成。
- 任务系统、幂等、版本校验和任务进度组件可复用。
- 模型/Provider 路由已有首期约定：旁白和字幕可先使用已接入的大模型 provider；TTS 和渲染 provider 可先 mock 或本地简化实现，但接口必须按 provider 封装。

## 范围边界

### 本包做

- 视频详情工作台 `/videos/:videoId`。
- 生成步骤条和步骤详情。
- 引用检查和生成前引用重检。
- 默认视频单元的生成工作区。
- 旁白稿候选、编辑、确认、重新生成。
- 配音（TTS）生成、试听、音色/语速参数、确认、重新生成。
- 字幕生成、编辑、首屏字幕、时间轴摘要、确认。
- 视觉方案选择：P9 默认循环背景素材、画面比例、字幕样式。
- 渲染任务：循环背景 + 音频 + 字幕合成。
- 视频预览播放器。
- 不满意原因记录和返回对应步骤。
- 当前视频确认。
- 导出已确认且未过期的视频文件。
- 视频产物版本、过期规则、任务进度、失败处理。

### 本包不做

- 不做自动发布。
- 不做人工发布记录和 24/48 小时数据回填。
- 不做短视频单元拆分和系列管理。
- 不做复杂镜头级分镜。
- 不做 AI 图片/视频生成。
- 不做平台账号、平台 API、自动上传。
- 不做运营复盘看板。
- 不做复杂富文本字幕时间轴编辑器；首期只做可理解的时间轴摘要和基础编辑。

## P9 内部分段

P9 可以一次性设计，但研发可拆为 5 个内部分段：

| 分段 | 名称 | 核心交付 |
| --- | --- | --- |
| P9a | 视频详情工作台地基 | 步骤条、引用检查、默认单元、产物版本、任务和过期框架 |
| P9b | 旁白调试 | 旁白候选、编辑、确认、重新生成、不满意原因 |
| P9c | 配音调试 | 音色/语速、生成、试听、确认、重新生成 |
| P9d | 字幕调试 | 字幕生成、编辑、首屏字幕、时间轴摘要、确认 |
| P9e | 渲染预览导出 | 视觉方案、循环背景渲染、播放器预览、确认当前视频、导出 |

研发可以按 9a-9e 顺序交付，但产品验收时必须验证完整闭环。

## 模块 1：视频详情工作台

视频详情工作台参考小说步骤式工作台：不是所有模块长页面铺开，而是“顶部状态 + 大步骤条 + 当前步骤详情 + 侧边任务/版本/风险”。

布局：

- 顶部状态栏：视频项目、引用小说、引用状态、当前视频状态、当前推荐动作。
- 大步骤条：引用检查、旁白稿、配音、字幕、视觉方案、渲染、预览确认、导出。
- 左侧摘要：引用快照、默认视频单元、当前产物版本。
- 中间工作区：当前步骤的编辑、候选、确认和预览。
- 右侧辅助：任务进度、依赖版本、风险、操作记录。

大步骤：

| 步骤 | 用户看到的名称 | 完成条件 | 下一步 |
| --- | --- | --- | --- |
| 1 | 引用检查 | 引用不是 blocking，并记录本次生成前检查结果 | 生成旁白 |
| 2 | 旁白稿 | 当前旁白稿已确认 | 生成配音 |
| 3 | 配音 | 当前配音已生成并确认 | 生成字幕 |
| 4 | 字幕 | 当前字幕已确认且配音未过期 | 选择视觉方案 |
| 5 | 视觉方案 | 背景素材、画面比例、字幕样式已确认 | 渲染视频 |
| 6 | 渲染 | 渲染视频文件已生成 | 预览确认 |
| 7 | 预览确认 | 用户确认当前视频为可导出版本 | 导出或回退修改 |
| 8 | 导出 | 已导出当前确认版本 | 后续发布记录，P10 |

交互规则：

- 顶部同一时间只显示一个主动作。
- 未满足前置条件的步骤可以查看说明，但不能执行跳过式操作。
- 点击已完成步骤展示产物摘要和版本，不自动修改。
- 点击过期步骤提示过期原因和需要重做的下游范围。
- 引用 `blocking` 时，旁白、音频、字幕和渲染主动作全部禁用。

## 模块 2：默认视频单元

P9 只处理 P8 创建的默认 `VideoUnit`，不做多单元拆条。

展示内容：

- 单元序号。
- 引用章节范围。
- 单元摘要。
- 前 3 秒钩子。
- 首屏字幕建议。
- 预计时长。
- 当前生成步骤。

规则：

- P9 不允许调整视频单元章节范围；如果用户需要调整，提示回 P8 新建项目或后续 P11 单元能力。
- 如果后端已允许调整范围，调整后必须让旁白、音频、字幕、视觉方案和渲染全部过期。
- 默认单元的钩子和首屏字幕可以作为旁白生成输入，但不能自动成为确认产物。

建议补充当前指针字段，避免把“历史候选”和“当前使用版本”混在一起：

```text
currentNarrationArtifactId
currentAudioArtifactId
currentSubtitleArtifactId
currentVisualPlanArtifactId
currentRenderId
previewStatus
```

`previewStatus` 取值：

| 状态 | 含义 | 是否解锁导出 |
| --- | --- | --- |
| `preview_pending` | 已渲染，等待用户预览判断 | 否 |
| `confirmed_exportable` | 用户确认当前视频可导出 | 是 |
| `rejected_pending_revision` | 用户不满意，等待回退修改 | 否 |

## 模块 3：VideoArtifact 产物版本

P9 必须落统一产物版本概念。

产物类型：

```text
narration_script
tts_audio
subtitle
subtitle_style
visual_plan
```

统一字段建议：

```text
id
tenantId
videoProjectId
videoUnitId
artifactType
version
lifecycleStatus
isCurrent
sourceTaskId
sourceVersionRefs
strategyVersion
providerSummary
providerRouteId
metadata
contentText
fileKey
previewUrl
rejectedReason
confirmedBy
confirmedAt
createdAt
updatedAt
```

状态：

| 状态 | 含义 |
| --- | --- |
| `draft` | 用户编辑草稿 |
| `candidate` | AI 或系统生成候选 |
| `confirmed` | 用户确认版本 |
| `stale` | 上游变化导致过期 |
| `rejected` | 用户不采用 |
| `archived` | 历史归档 |

规则：

- AI 输出默认是 `candidate`。
- 用户确认后才成为 `confirmed`，并由 `isCurrent=true` 或 `VideoUnit.current*ArtifactId` 指向当前使用版本。
- 手动编辑保存为新草稿或新候选，不直接覆盖确认版本。
- 重生成和重新渲染都创建新版本。
- 导出只能基于已确认、未过期且 `previewStatus=confirmed_exportable` 的 `VideoRender`。

### VideoRender

`VideoRender` 是合成后的可播放视频版本，不放在 `VideoArtifact` 里。

建议字段：

```text
id
tenantId
videoProjectId
videoUnitId
version
lifecycleStatus
isCurrent
previewStatus
sourceTaskId
sourceVersionRefs
narrationArtifactId
audioArtifactId
subtitleArtifactId
visualPlanArtifactId
providerSummary
providerRouteId
metadata
fileKey
previewUrl
durationSeconds
resolution
failureCategory
rejectedReasonCode
rejectedReasonText
confirmedBy
confirmedAt
createdAt
updatedAt
```

规则：

- 重新渲染创建新的 `VideoRender`，不覆盖旧文件。
- 用户预览前是 `preview_pending`。
- 标记不满意后是 `rejected_pending_revision`，不能导出。
- 用户确认后是 `confirmed_exportable`，并可设为 `isCurrent=true`。

### VideoExport

`VideoExport` 是导出记录，不等于发布记录。

建议字段：

```text
id
tenantId
videoProjectId
videoUnitId
renderId
exportFormat
resolution
fileKey
downloadUrl
sourceVersionRefs
createdBy
createdAt
```

规则：

- 导出记录必须引用具体 `VideoRender`。
- 重新导出创建新记录，不覆盖旧导出。
- 导出后不创建发布记录，不触发平台发布或数据回填。

## 模块 4：旁白稿

旁白是 P9 的第一核心产物。它决定视频节奏、TTS、字幕和渲染。

子步骤：

| 子步骤 | 用户要确认什么 | 动作 |
| --- | --- | --- |
| 1 | 生成候选 | 基于引用章节生成 1-3 个旁白候选 |
| 2 | 编辑优化 | 用户可手动改稿或要求 AI 优化 |
| 3 | 节奏检查 | 检查时长、钩子、结尾悬念、平台风险 |
| 4 | 确认旁白 | 确认当前旁白作为配音生成输入 |

展示：

- 当前旁白版本。
- 预计朗读时长。
- 字数。
- 前 3 秒钩子。
- 首屏字幕建议。
- 结尾悬念。
- 口语化程度。
- 过期状态。
- 评分或风险摘要。

动作：

- 生成旁白候选。
- 重新生成候选。
- 手动编辑。
- AI 优化。
- 确认旁白稿。
- 标记不采用。
- 查看版本历史。

规则：

- 引用 `blocking` 时不能生成旁白。
- 旁白候选不自动成为当前旁白。
- 旁白确认后才能生成配音（TTS）。
- 修改已确认旁白后，音频、字幕、视觉方案、渲染和导出全部标记过期。
- 确认低质量或高风险旁白需要填写原因。

旁白生成输入：

- `VideoReference` 摘要。
- 默认 `VideoUnit` 引用章节。
- 待视频化快照中的首条视频建议。
- 小说风格、平台风险、目标时长。
- 模型路由策略版本。

旁白输出至少包含：

- 完整旁白稿。
- 前 3 秒钩子。
- 首屏字幕建议。
- 结尾悬念。
- 预计时长。
- 风险标签。
- 推荐理由。

## 模块 5：配音（TTS）

配音（TTS）把已确认旁白转为可试听音频。P9 可以先用 mock 或本地简化 provider，但必须按真实 provider 接口封装。

子步骤：

| 子步骤 | 用户要确认什么 | 动作 |
| --- | --- | --- |
| 1 | 选择声音参数 | 音色、语速、情绪、音量 |
| 2 | 生成配音 | 异步生成配音音频 |
| 3 | 试听检查 | 试听是否有错读、太快、太慢、情绪不合适 |
| 4 | 确认配音 | 确认当前音频作为字幕输入 |

展示：

- 当前音频版本。
- 音色名称。
- TTS provider 摘要。
- 语速、情绪、音量。
- 音频时长。
- 试听播放器。
- 生成任务进度。
- 失败原因。
- 成本/耗时轻量提示。

动作：

- 生成配音。
- 重新生成。
- 换音色。
- 调语速。
- 试听。
- 确认配音。
- 标记不采用。

规则：

- 未确认旁白不能生成配音。
- 旁白过期时不能生成配音。
- 音频生成必须是异步任务。
- 音频变更后，字幕和渲染标记过期。
- 页面不得展示 TTS 密钥、完整供应商请求和完整原始响应。
- 音频确认前允许多版本试听。

## 模块 6：字幕

字幕承接已确认音频和旁白稿，首期目标是生成可读、可编辑、能用于渲染的字幕。

子步骤：

| 子步骤 | 用户要确认什么 | 动作 |
| --- | --- | --- |
| 1 | 生成字幕 | 基于音频和旁白切分字幕 |
| 2 | 编辑字幕 | 调整断句、错字、首屏字幕 |
| 3 | 检查时间轴 | 查看音频匹配、过长字幕、首屏弱提示 |
| 4 | 确认字幕 | 确认当前字幕用于渲染 |

展示：

- 字幕版本。
- 首屏字幕。
- 字幕分句预览。
- 时间轴摘要。
- 音频匹配状态。
- 字幕过长、断句差、首屏弱等风险。

动作：

- 生成字幕。
- 重新生成字幕。
- 手动编辑。
- 优化首屏字幕。
- 确认字幕。
- 标记不采用。

规则：

- 音频未确认不能生成字幕。
- 音频过期时字幕必须标记过期。
- 字幕变化后，渲染标记过期。
- P9 不要求逐帧复杂时间轴编辑，但必须能改文本、首屏字幕和基础断句。

## 模块 7：视觉方案

P9 默认使用“循环背景视频 + 字幕样式 + 画面比例”的简单视觉方案，但要按完整视觉产物建模。

子步骤：

| 子步骤 | 用户要确认什么 | 动作 |
| --- | --- | --- |
| 1 | 选择生成模式 | P9 默认简单循环背景模式 |
| 2 | 选择背景素材 | 选择系统内置或 mock 背景素材 |
| 3 | 设置画面和字幕样式 | 比例、分辨率、字幕位置、字号、描边 |
| 4 | 确认视觉方案 | 确认当前视觉方案用于渲染 |

展示：

- 生成模式：简单循环背景。
- 背景素材名称和预览。
- 画面比例：默认 9:16。
- 分辨率：默认 1080x1920 或首期受限分辨率。
- 字幕样式：位置、字号、颜色、描边、阴影。
- 平台风险提示，例如字幕过小、画面主体遮挡。

动作：

- 选择背景素材。
- 调整画面比例。
- 调整字幕样式。
- 确认视觉方案。
- 标记不采用。

规则：

- 视觉方案变化后，渲染标记过期。
- P9 不接 AI 分镜，不生成复杂画面。
- 视觉方案必须是版本化 `visual_plan`，便于后续 P11/P12 扩展分镜、模板和外部视频工具。

`visual_plan.metadata` 至少保留以下扩展字段，即使 P9 只使用简单循环背景：

```text
mode
materialRefs[]
styleConfig
scenePlanRefs[]
externalTaskRefs[]
licenseSource
costSummary
renderAdapter
```

字段口径：

- `mode`：`loop_background`、`template`、`scene_plan`、`external_video_tool`。
- `materialRefs[]`：背景素材、图片、视频片段或模板引用。
- `styleConfig`：画面比例、字幕位置、字号、描边、色彩和安全区。
- `scenePlanRefs[]`：后续分镜或镜头计划引用，P9 可为空。
- `externalTaskRefs[]`：后续外部视频工具任务引用，P9 可为空。
- `licenseSource`：素材来源和授权说明。
- `costSummary`：生成或素材成本摘要。
- `renderAdapter`：渲染适配器名称和版本。

## 模块 8：渲染

P9 渲染使用已确认的旁白、音频、字幕和视觉方案，生成可预览视频文件。

子步骤：

| 子步骤 | 用户要确认什么 | 动作 |
| --- | --- | --- |
| 1 | 渲染前检查 | 引用、旁白、音频、字幕、视觉方案都可用 |
| 2 | 发起渲染 | 创建渲染任务 |
| 3 | 查看进度 | 展示渲染进度、耗时、失败原因 |
| 4 | 渲染完成 | 生成可预览视频版本 |

渲染前门禁：

- 引用不是 `blocking`。
- 旁白已确认且未过期。
- 音频已确认且未过期。
- 字幕已确认且未过期。
- 视觉方案已确认且未过期。
- 没有冲突中的渲染任务。

渲染完成质量门禁：

| 检查项 | 阻断条件 | 页面提示 |
| --- | --- | --- |
| 视频时长 | 为 0、明显短于音频或超出平台目标范围 | 视频时长异常 |
| 音频 | 无声、音轨缺失、试听不可用 | 音频不可用 |
| 字幕同步 | 字幕时间轴缺失或明显不同步 | 字幕未对齐 |
| 字幕安全区 | 首屏字幕超出安全区、字号过小、对比不足 | 字幕可能看不清 |
| 首屏钩子 | 前 3 秒没有字幕或钩子为空 | 首屏钩子缺失 |
| 画面 | 黑屏、空白、素材不可播放、明显花屏 | 画面异常 |
| 素材来源 | 背景素材缺少来源或授权说明 | 素材来源缺失 |
| 平台风险 | 内容安全或平台风险升高到 blocking | 平台风险阻塞 |

动作：

- 渲染视频。
- 取消渲染。
- 重试渲染。
- 重新渲染。
- 查看渲染日志摘要。

规则：

- 渲染必须是异步任务。
- 渲染前必须重新检查引用异常。
- 重新渲染创建新的 `VideoRender` 版本，不覆盖旧文件。
- 旧渲染视频如果引用的上游产物过期，标记 `stale`，但文件和历史记录保留。
- 渲染失败不影响已确认的旁白、音频、字幕和视觉方案。

## 模块 9：预览确认和不满意闭环

预览确认是 P9 最关键的产品闭环。用户必须能判断视频是否满意，并知道不满意该改哪里。

预览区展示：

- 视频播放器。
- 当前渲染版本。
- 使用的旁白、音频、字幕、视觉方案版本。
- 前 3 秒钩子。
- 首屏字幕。
- 预计时长。
- 画面比例和分辨率。
- 风险摘要。

预览评审面板：

| 评审项 | 用户要判断什么 | 系统辅助 |
| --- | --- | --- |
| 前 3 秒钩子 | 开头是否抓人 | 展示钩子文本和首屏字幕 |
| 声音自然度 | 是否错读、太快、太慢或情绪不对 | 展示音色、语速和音频时长 |
| 字幕清晰度 | 是否看得清、断句是否舒服 | 展示字幕安全区和过长提示 |
| 节奏 | 是否拖沓或过快 | 展示预计完播风险 |
| 背景适配 | 背景是否干扰字幕或题材不搭 | 展示素材来源和样式摘要 |
| 结尾悬念 | 是否有继续看的理由 | 展示结尾悬念文本 |
| 导出准备 | 是否满足导出门禁 | 展示质量门禁结果 |

动作：

- 确认当前视频。
- 标记不满意。
- 回到旁白。
- 回到音频。
- 回到字幕。
- 回到视觉方案。
- 重新渲染。
- 查看版本依赖。

不满意原因：

| 原因码 | 用户看到的原因 | 返回步骤 | 下游影响 |
| --- | --- | --- | --- |
| `narration_hook_weak` | 开头不吸引人 | 旁白稿 | 音频、字幕、渲染过期 |
| `narration_too_long` | 旁白太长或节奏差 | 旁白稿 | 音频、字幕、渲染过期 |
| `tts_misread` | 声音有错读 | 配音 | 字幕、渲染过期 |
| `tts_speed_or_emotion` | 语速或情绪不合适 | 配音 | 字幕、渲染过期 |
| `subtitle_text_error` | 字幕有错字 | 字幕 | 渲染过期 |
| `subtitle_timing_bad` | 字幕不同步或断句差 | 字幕 | 渲染过期 |
| `subtitle_readability_bad` | 字幕样式不清楚 | 视觉方案 | 渲染过期 |
| `visual_material_mismatch` | 背景素材不合适 | 视觉方案 | 渲染过期 |
| `visual_overlay_bad` | 画面遮挡字幕或主体 | 视觉方案 | 渲染过期 |
| `render_black_or_no_audio` | 视频黑屏、无声或文件异常 | 渲染 | 重新渲染 |
| `platform_risk` | 内容或平台风险不放心 | 对应风险来源 | 按来源标记过期 |
| `overall_reject_later` | 暂不修改，先标记不满意 | 预览确认 | 当前渲染标记 rejected |

规则：

- 标记不满意必须填写或选择原因。
- 不满意会让当前渲染版本进入 `rejected` 或保留为非当前版本。
- 返回某个上游步骤修改后，下游产物必须标记过期。
- 标记不满意不算预览步骤完成，不能解锁导出。
- 用户确认当前视频后，当前渲染版本变为 `confirmed` 且 `previewStatus=confirmed_exportable`。
- 未确认的视频不能导出。

## 模块 10：导出

导出是 P9 终点，不等于发布。

导出前门禁：

- 存在已确认且未过期的 `VideoRender`。
- `VideoRender.previewStatus=confirmed_exportable`。
- 视频文件可访问。
- 引用状态不是 `blocking`。
- 导出格式、分辨率和文件名已确认。
- 渲染完成质量门禁全部通过，或非阻断风险已由用户确认并填写原因。

导出内容：

- 视频文件。
- 文件名。
- 导出格式，例如 mp4。
- 分辨率。
- 使用的渲染版本。
- 使用的旁白、音频、字幕、视觉方案版本。
- 导出时间和导出人。
- 导出前检查清单摘要。

动作：

- 导出文件。
- 下载文件。
- 复制导出记录摘要。
- 回视频列表。

规则：

- 导出记录必须引用具体渲染版本。
- 重新导出不覆盖旧导出记录。
- 导出后不自动创建发布记录。
- P10 才做发布记录和数据回填。

## 模块 11：任务、并发和幂等

P9 任务类型：

```text
video_narration_generate
video_tts_generate
video_subtitle_generate
video_render
video_export
```

每个任务必须包含：

- `idempotencyToken`
- `actionType`
- `requestHash`
- `sourceVersionRefs`
- `providerSummary`
- `providerRouteId`
- `strategyVersion`
- `qualityMode`
- `progressEvents`
- `failureCategory`
- `safeSummary`

幂等规则：

- 所有生成、渲染、导出写操作必须要求 `idempotencyToken + actionType + requestHash`。
- 同 token 同 actionType 同 requestHash 复用已有任务或结果。
- 同 token 同 actionType 不同 requestHash 返回 `IDEMPOTENCY_CONFLICT`。
- 上游版本变化后，旧任务不能写入当前产物。
- 每类任务的 `sourceVersionRefs` 必须声明所依赖的引用、旁白、音频、字幕、视觉方案或渲染版本，不能只传对象 ID。

并发规则：

- 同一视频单元同一时刻只能有一个同类型生成任务。
- 旁白生成中不能同时生成配音。
- 配音生成中不能确认字幕。
- 渲染中不能再次渲染同一组版本。
- 引用重检为 blocking 后，后续生成任务不能继续写入 current 产物。

任务展示：

- 当前任务进度。
- 当前处理阶段。
- 已耗时。
- 失败原因。
- 重试入口。
- 取消入口。
- 版本过期时的禁用原因。

`sourceVersionRefs` 示例：

| 任务 | 必须包含的版本引用 |
| --- | --- |
| 旁白生成 | `videoReferenceId`、`videoReferenceVersion`、`videoUnitId`、`videoReadinessSnapshotId`、引用章节快照版本 |
| 配音 | 已确认旁白 `artifactId/version`、TTS 参数版本、providerRouteId |
| 字幕生成 | 已确认旁白、已确认音频、字幕策略版本 |
| 视觉方案确认 | 背景素材版本、字幕样式版本、画面比例 |
| 渲染 | 已确认旁白、音频、字幕、视觉方案、引用重检结果 |
| 导出 | 已确认 `VideoRender`、导出格式、分辨率 |

## 模块 12：接口契约

建议接口：

```text
GET /videos/:videoId
GET /videos/:videoId/workbench
POST /videos/:videoId/reference/recheck
POST /videos/:videoId/units/:unitId/narrations/generate
POST /videos/:videoId/units/:unitId/narrations/:artifactId/save-draft
POST /videos/:videoId/units/:unitId/narrations/:artifactId/confirm
POST /videos/:videoId/units/:unitId/tts/generate
POST /videos/:videoId/units/:unitId/tts/:artifactId/confirm
POST /videos/:videoId/units/:unitId/subtitles/generate
POST /videos/:videoId/units/:unitId/subtitles/:artifactId/save-draft
POST /videos/:videoId/units/:unitId/subtitles/:artifactId/confirm
POST /videos/:videoId/units/:unitId/visual-plans
POST /videos/:videoId/units/:unitId/visual-plans/:artifactId/confirm
POST /videos/:videoId/units/:unitId/renders
POST /videos/:videoId/units/:unitId/renders/:renderId/reject
POST /videos/:videoId/units/:unitId/renders/:renderId/confirm
POST /videos/:videoId/units/:unitId/exports
```

通用写请求必须包含：

```text
idempotencyToken
actionType
requestHash
expectedVideoProjectVersion
expectedVideoUnitVersion
sourceVersionRefs
```

生成类请求还需要：

```text
strategyVersion
providerRouteId
qualityMode
```

确认类请求还需要：

```text
expectedArtifactStatus
reason
```

拒绝/不满意请求：

```text
reasonCode
reasonText
returnStep
```

## 模块 13：前端交互细节

P9 交互需要延续小说步骤式工作台。

要求：

- 视频详情默认进入当前推荐步骤，不铺满所有模块。
- 大步骤条显示状态：未开始、生成中、待确认、已确认、已过期、失败、阻塞。
- 每个步骤详情内部用子步骤条说明确认点。
- 右侧任务/版本/风险区常驻或可折叠，但当前任务和失败原因必须可见。
- 所有按钮 loading 旁边必须有任务进度入口。
- 禁用按钮必须说明原因。
- 过期产物必须标出“为什么过期”和“需要重新生成哪些下游产物”。
- 预览页必须把“不满意回退”做成一等入口。

小白默认文案：

- “先确认旁白，再生成声音。”
- “声音变了，字幕需要重新对齐。”
- “字幕改了，视频需要重新渲染。”
- “当前只是导出文件，不会自动发布到平台。”
- “引用小说已变化，先处理引用异常再继续生成。”

## 模块 14：失败处理

| 失败点 | 页面提示 | 用户动作 |
| --- | --- | --- |
| 引用重检失败 | 暂时无法确认小说引用是否仍有效 | 重试检测 |
| 旁白生成失败 | 旁白生成失败，旧版本不受影响 | 重试 / 手动编辑 |
| 配音失败 | 配音生成失败，可能是供应商异常或文本过长 | 重试 / 换音色 / 缩短旁白 |
| 字幕失败 | 字幕生成失败或音频无法对齐 | 重试 / 手动编辑 |
| 渲染失败 | 渲染失败，旧视频文件不受影响 | 重试渲染 |
| 导出失败 | 文件导出失败，已确认视频不受影响 | 重试导出 |

失败规则：

- 失败不覆盖旧产物。
- 失败任务保留事件和安全摘要。
- 重试必须重新校验上游版本。
- 如果上游版本已变，旧任务只能查看，不能作为原任务重试写入当前产物。

## 模块 15：模型和 Provider 路由

P9 涉及多个 Agent/Provider：

| 能力 | Agent/Provider | 首期建议 |
| --- | --- | --- |
| 旁白稿 | 旁白 Agent | 使用当前大模型 provider，优先 DeepSeek/GPTPro 质量模式 |
| 字幕切分 | 字幕 Agent | 可用大模型或规则切分，先保留 providerRoute |
| 配音 | TTS Provider | 首期可 mock，本地文件或后续真实 TTS |
| 渲染 | Render Provider | 首期可本地简化渲染或 mock 文件，接口按 provider 封装 |
| 视觉方案 | 视觉 Agent/素材 Provider | P9 使用内置循环背景素材 |

规则：

- Provider 路由不能写死在页面组件里。
- 每个产物记录 `providerSummary`、`providerRouteId`、`strategyVersion` 和必要 metadata。
- 前端只展示 provider 摘要，不展示 API Key、完整请求、完整响应。
- 如果真实 Provider 未接入，P9 可以用 mock，但必须在验收报告里标记能力边界。

`qualityMode` 枚举：

| 模式 | 含义 | 默认用途 |
| --- | --- | --- |
| `fast` | 低成本快速生成，适合草稿预览 | 旁白候选、字幕草稿 |
| `standard` | 成本和质量平衡 | P9 默认 |
| `high_quality` | 更高质量和成本，适合最终确认前重生成 | 用户手动选择 |

Mock Provider 要求：

- mock TTS 必须产出可试听音频文件、时长、`fileKey`、`previewUrl`、`failureCategory` 和 provider metadata。
- mock render 必须产出可播放视频文件、时长、分辨率、`fileKey`、`previewUrl`、`failureCategory` 和 provider metadata。
- mock 输出必须在 `metadata.isMockOutput=true` 中标记，前端以“模拟能力”轻量提示，验收报告必须写清边界。
- 即使是 mock，也不能跳过异步任务、进度、失败、重试、取消和版本校验。
- `provider` 原始请求、原始响应、密钥和 token 不进入前端响应、普通日志和任务摘要。

## 模块 16：数据、安全和审计

必须记录：

- 生成旁白。
- 保存旁白草稿。
- 确认旁白。
- 生成配音。
- 确认配音。
- 生成/编辑/确认字幕。
- 确认视觉方案。
- 渲染。
- 不满意/拒绝渲染版本。
- 确认当前视频。
- 导出。

不能暴露：

- API Key。
- TTS token。
- 外部平台 token。
- 完整提示词。
- 完整模型响应。
- 供应商完整原始响应。
- 数据库连接串。

审计要求：

- 确认低质量、高风险或过期产物必须填写原因。
- 不满意和拒绝版本必须记录原因。
- 导出记录必须可追溯到具体渲染版本。
- 所有写接口必须有 schema 校验、版本校验和操作日志。

## 验收标准

P9 完成后，测试会话至少验证：

1. 视频详情工作台可打开，能看到步骤条、引用快照、默认视频单元和当前推荐动作。
2. 引用 `blocking` 时不能生成旁白、音频、字幕或渲染。
3. 旁白候选不会自动成为当前旁白，确认后才能生成配音。
4. 旁白修改后，音频、字幕、视觉方案、渲染和导出状态会过期或需要重做。
5. 配音生成是异步任务，能看到进度、失败、重试和取消。
6. 音频变更后字幕和渲染过期。
7. 字幕可生成、可编辑、可确认，字幕变更后渲染过期。
8. 视觉方案可选择循环背景、画面比例和字幕样式，变更后渲染过期。
9. 渲染前会重新检查引用状态，引用 blocking 时渲染被阻断。
10. 渲染生成新视频版本，不覆盖旧版本。
11. 系统内能预览视频，并展示使用的旁白、音频、字幕、视觉方案和渲染版本。
12. 用户不满意时能选择原因并返回对应步骤。
13. 标记不满意后不能导出，必须回退修改或重新确认；确认当前视频后才能导出。
14. 导出不自动创建发布记录，也不出现平台数据回填主动作。
15. 所有写操作有 `idempotencyToken/actionType/requestHash`、`sourceVersionRefs` 和版本校验。
16. 旧异步任务在上游版本变化或引用变成 blocking 后，不能写入 current 产物。
17. mock TTS/mock render 产物可试听或可播放，并在 metadata 和验收报告中明确标记模拟能力。
18. 导出不会创建 `PublishRecord`，也不会调用平台发布或数据回填 API。
19. 页面、日志和任务摘要不暴露密钥、完整提示词或完整模型响应。

## 阻塞标准

出现以下情况，P9 验收应判定阻塞：

- 引用 `blocking` 仍可继续生成或渲染。
- 未确认旁白可以生成配音。
- 修改旁白后下游产物没有过期。
- 重新生成或重新渲染覆盖旧版本。
- 用户无法预览视频。
- 用户不满意时没有回退编辑路径。
- 标记不满意后仍可导出。
- 未确认或已过期视频可以导出。
- 导出触发自动发布或平台数据流程。
- 幂等缺失导致重复提交产生不可控重复产物。
- 任一写接口缺少 `idempotencyToken/actionType/requestHash`、`sourceVersionRefs` 或必要 expected version。
- 旧异步任务在引用 blocking、上游产物过期或用户已确认新版本后仍写入 current。
- mock provider 未标记，或 mock 音频/视频不可实际试听/播放。
- 前端或日志暴露密钥、完整提示词、完整模型响应。

## 可接受风险

以下情况可以记录为非阻塞风险，但要进入后续计划：

- TTS 首期使用 mock 或本地简化音频。
- 渲染首期使用 mock 文件或本地简化循环背景合成。
- 字幕时间轴只做摘要级，不做逐帧高级编辑。
- 视觉方案只有内置循环背景素材。
- 只支持一个默认视频单元，不支持拆条和系列。
- 浏览器内预览只覆盖主流格式，移动端适配后续加强。

## 交付物

后端：

- `VideoArtifact` / `VideoRender` / `VideoExport` 或等价数据模型。
- 旁白、音频、字幕、视觉方案、渲染、导出服务。
- 产物依赖过期规则。
- P9 接口和 schema。
- Provider 封装。
- 任务、幂等、版本校验、操作日志。
- 单元测试、接口测试、关键 live smoke。

前端：

- 视频详情工作台。
- 生成步骤条和子步骤条。
- 旁白编辑/候选/确认区。
- 配音试听/确认区。
- 字幕编辑/确认区。
- 视觉方案区。
- 渲染任务和预览区。
- 不满意回退交互。
- 导出入口。
- API service、model、constants、composable。
- 页面 smoke 和关键交互测试。

文档：

- 如实际 Provider、接口、状态或字段与本文档不同，研发必须同步更新本文档和相关总纲。
