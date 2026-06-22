# 模型接入小包 M1：DeepSeek Provider 首期接入

## 背景

小说系统主链路已完成 mock / in-memory 产品验收。下一阶段需要把生成和审稿从 mock provider 切到真实大模型，但完整模型配置后台、Agent 模型路由页面、成本统计和灰度发布可以后置。

当前可用模型资源：

- DeepSeek。
- GPT Pro / OpenAI 系列。
- Kimicode / Kimi 相关能力。

阶段性决策：

- 首个真实模型接入优先选择 DeepSeek。
- GPT Pro / OpenAI 系列先作为高价值复审、评分校准和提示词调试模型，不做全量正文默认模型。
- Kimicode 如为编程向能力，优先用于研发辅助；如有 Kimi 通用 API，后续再作为长上下文阅读、长篇记忆和全书一致性检查候选。

## 本包目标

在不实现完整配置后台的前提下，让小说系统可以通过环境变量切换到 DeepSeek 真实模型，并保留 mock fallback。

本包完成后：

- 默认仍使用 mock provider，保证本地开发和自动化测试稳定。
- 配置 `AI_PROVIDER_MODE=deepseek` 且存在 `DEEPSEEK_API_KEY` 时，小说生成和审稿 provider 可以调用 DeepSeek。
- 每次真实模型调用都记录模型快照、用途、耗时、输入/输出摘要和错误类型，但不记录 API Key、完整 prompt 或完整模型响应。
- 输出必须经过结构化校验；失败时返回统一错误，并可回退 mock 或保留失败任务。

## 非目标

- 不做完整模型供应商后台。
- 不做 Agent 模型路由可视化页面。
- 不做用户每次生成时选择模型。
- 不接视频生成、TTS、字幕、渲染或发布模型。
- 不把 ChatGPT Pro 订阅直接当作 API 能力；OpenAI API 后续单独接入。
- 不要求本包完成真实 MySQL 准生产验收。

## 环境变量

建议先用最少环境变量：

```text
AI_PROVIDER_MODE=mock | deepseek
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_REASONER_MODEL=deepseek-v4-pro
DEEPSEEK_TIMEOUT_MS=60000
DEEPSEEK_MAX_RETRIES=1
```

说明：

- `AI_PROVIDER_MODE` 默认 `mock`。
- `DEEPSEEK_API_KEY` 只从环境变量读取，不能入库、不能写日志、不能返回前端。
- 模型名称允许通过环境变量覆盖，避免把供应商模型版本写死。
- 2026-06-18 本地握手确认当前账号可见模型为 `deepseek-v4-flash`、`deepseek-v4-pro`；首期默认使用 `deepseek-v4-pro`，后续可将正文批量任务切到 `deepseek-v4-flash` 做成本优化。
- 如果 `AI_PROVIDER_MODE=deepseek` 但没有 `DEEPSEEK_API_KEY`，服务启动可以成功，但实际调用应返回明确配置错误，不能静默用假数据伪装真实调用。

## 首期固定路由

本包先用代码内置固定路由，后续再迁移到 Agent 模型路由配置。

| 任务类别 | 首期默认模型 | 说明 |
| --- | --- | --- |
| 方向、设定、大纲、章节目录 | `DEEPSEEK_MODEL=deepseek-v4-pro` | 侧重中文创意、结构化 JSON 输出和成本控制 |
| 第 1 章试写、2-3 章试写、批量正文、章节重写 | 首期 `deepseek-v4-pro`；后续批量正文可评估 `deepseek-v4-flash` | 正文调用量最大，先用高质量模型跑真实链路和质量调试，再优化成本 |
| 单章审稿、全书审稿、影响评估 | `DEEPSEEK_REASONER_MODEL=deepseek-v4-pro`，缺省回落 `DEEPSEEK_MODEL` | 审稿和影响评估更重推理、批判和风险分级 |
| 长篇记忆、摘要、伏笔台账 | 首期 `deepseek-v4-pro`；后续可评估 `deepseek-v4-flash` | 要求结构化、稳定、成本可控 |

## Provider 设计

建议新增通用 OpenAI-compatible chat client：

```text
apps/api/src/modules/ai/
  llmClient.ts
  openAiCompatibleClient.ts
  jsonOutput.ts
  modelRouting.ts
```

小说模块新增或替换真实 provider：

```text
apps/api/src/modules/novels/providers/deepseekNovelProvider.ts
```

实现原则：

- 不破坏现有 `DirectionProvider`、`StructureProvider`、`TrialProvider`、`BodyProvider`、`FullReviewProvider` 接口。
- DeepSeek provider 可以一个类实现多个接口，也可以按职责拆分；以最少重复和易测试为准。
- 每个 provider 调用都必须要求结构化 JSON 输出，并用 zod 或现有 DTO 类型做运行时校验。
- 解析失败、格式不合法、缺字段、低质量空文本要归类为 provider_error / schema_error，不能生成半可信资产。
- 普通日志只能记录任务类型、模型 key、耗时、token 摘要、错误码和摘要，不能记录完整 prompt / 完整响应。

## Prompt 与输出约束

首期 prompt 可以作为后端常量实现，但必须满足：

- 每类任务有独立 prompt key / version 标识。
- prompt 内容不写入普通日志、不返回前端。
- prompt 输出结构必须和现有 DTO / draft 类型对齐。
- 模型响应只保存结构化结果和必要摘要，不保存完整原文响应。

最小需要覆盖：

- 方向候选：3-4 个候选，含标题、logline、coreHook、sellingPoints、riskTags、score、marketScore、riskLevel、recommendedReason。
- 结构资产：设定、全书大纲、阶段大纲、章节目录，含 sections / stages / chapters。
- 试写：第 1 章 3 个候选，后续第 2-3 章和总评。
- 批量正文：正文、摘要、评分、特性卡、审稿、长篇记忆。
- 章节重写：候选正文、摘要对比、风险提示。
- 影响评估：影响等级、受影响章节/视频引用、建议动作、是否阻塞全书审稿。
- 全书审稿：总分、评级、问题、优势、建议、视频化建议、首条视频建议、完成门禁。

## 错误和回退策略

首期策略：

- 默认 `AI_PROVIDER_MODE=mock` 时不调用外部模型。
- `AI_PROVIDER_MODE=deepseek` 时调用真实模型。
- DeepSeek 调用失败时，本次任务应失败并展示“生成服务异常 / 模型配置异常 / 输出结构异常”等清晰错误，不自动采用 mock 结果冒充真实结果。
- 本地测试可以注入 fake LLM client，不需要真实 API Key。

后续可扩展：

- 成本优先或调试模式下允许“真实模型失败后回退 mock”，但必须明确标记结果来源为 mock，不得混淆。
- 加入 GPT / Kimi 复审模型后，再支持质量复审和二次评分。

## 验收标准

### 研发自测

- `npm test -w @ai-shortvideo/api`
- `npm test -w admin-web`
- `npm run typecheck`
- `npm run build`

### 必验场景

- 默认无环境变量时，系统仍走 mock provider，现有 38 个后端小说测试和 22 个前端测试保持通过。
- `AI_PROVIDER_MODE=deepseek` 且无 `DEEPSEEK_API_KEY` 时，调用生成类接口返回统一配置错误，不暴露密钥字段。
- 注入 fake DeepSeek client 时，方向、结构、试写、正文、重写、影响评估、全书审稿能从 JSON 响应生成现有 draft / DTO。
- fake client 返回非 JSON / 缺字段 / 空正文时，任务失败并归类为 provider_error / schema_error，不写入正式资产。
- 日志、任务摘要、API 响应、前端页面和 storage 不暴露 API Key、完整 prompt、完整模型响应。

### 长耗时与卡住处理

真实模型接入后，所有生成、审稿、重写、影响评估和待视频化检查都可能明显慢于 mock。M1 必须保证用户不会只看到一个长时间按钮 loading，也不会因为请求卡住而误以为系统死机。

后端要求：

- 真实模型调用必须走任务系统语义，任务至少要有 `queued / processing / completed / failed / cancelled` 状态、`currentStep`、`statusNote`、`progress`、`failureCategory` 和 `errorCode`。
- 调用模型前写入任务事件：`preparing_context`、`calling_model`。
- 模型返回后写入任务事件：`parsing_output`、`quality_checking`、`saving_result`。
- 超过 `DEEPSEEK_TIMEOUT_MS` 必须失败为 `timeout`，不能无限等待。
- 网络错误、5xx、网关错误归类为 `provider_error`；限流归类为 `rate_limited`；余额或额度问题归类为 `quota_insufficient`；结构化解析失败归类为 `output_parse_failed`。
- 自动重试必须有上限，且每次重试写任务事件；自动重试耗尽后转 `failed`，展示可理解原因和推荐动作。
- 用户取消或页面离开不能导致正式资产半写入；若模型已经返回但保存前取消，需要在安全点处理。
- 批量正文必须按章节更新进度，例如“正在生成第 3/5 章”，不能只展示总任务 processing。
- 同一小说、同一章节或同一对象存在运行中的生成任务时，重复点击必须命中幂等或冲突拦截，不能创建多个长跑任务。

前端要求：

- 用户点击生成后，主按钮可以短暂 loading，但必须尽快切换为任务进度展示，不能只靠按钮 loading 等待模型返回。
- 小说列表、小说详情、章节详情至少能看到最近任务状态、当前步骤、已耗时、失败原因和重试入口。
- 长时间处理中要给出通俗文案，例如“正在调用模型生成内容，可能需要 1-3 分钟，可以先停留或稍后回来查看”。
- 如果任务超过前端预期等待时间但后端仍在 processing，页面应显示“仍在生成中”，提供刷新/查看任务详情/取消入口，而不是报错。
- 如果后端超时或失败，页面应展示失败分类、下一步建议和重试按钮；不能停留在 loading 状态。
- 对高成本重试要提示可能再次消耗模型额度。
- 真实 live smoke 验收时必须观察至少一个长耗时任务的任务抽屉或进度区域，确认不是单纯按钮 loading。

阻塞标准：

- 任一真实模型生成动作只靠按钮 loading 且无法查看任务进度。
- 模型调用超时后任务不失败、不提示、不允许重试或取消。
- 用户重复点击导致多个相同长跑任务并发。
- 任务失败后没有失败分类或下一步建议。
- 任务卡住后列表/详情无法恢复到可操作状态。
- 日志、任务详情或页面泄露完整 prompt、完整模型响应或 API Key。

### 端到端流程验收

M1 不能只验 provider 单点。模型配置完成后，必须验证小说主流程是否仍能顺畅进行。

无真实 Key 的自动化验收：

- 使用 fake DeepSeek client 跑完整短小说 E2E，用来验证路由、JSON 解析、状态机、资产版本、任务摘要和前端服务封装不会因为真实 provider 接入而断裂。
- 覆盖链路：
  - 创建 5-8 章短小说草稿。
  - 生成方向候选并采用。
  - 生成并采用设定、全书大纲、阶段大纲、章节目录。
  - 生成第 1 章候选，选择候选后生成第 2-3 章试写和试写总评。
  - 确认试写并生成正文策略快照。
  - 批量生成正文至章节完成。
  - 发起全书审稿。
  - 确认小说完成。
  - 获取待视频化检查并确认待视频化。
  - 最终小说进入 `video_ready`，推荐动作是“去视频列表”。
- fake E2E 必须验证全链路 API 响应为统一结构，且任务摘要、错误摘要和页面 DTO 不包含完整 prompt / 完整模型响应。

真实 Key live 验收：

- 如果用户已经配置 `DEEPSEEK_API_KEY`，M1 正式完成前必须跑一个小章数真实模型 live smoke。
- 建议使用 5 章样本，控制成本和时长，但要覆盖完整闭环：
  - 小说列表/创建草稿。
  - 方向生成和采用。
  - 结构资产生成和采用。
  - 第 1 章试写、2-3 章试写和试写确认。
  - 批量正文生成。
  - 全书审稿。
  - 完成确认。
  - 待视频化检查和确认。
  - 最终列表和详情能打开，状态可理解，下一步动作清晰。
- live smoke 只判断真实模型连通性、JSON 结构、主流程顺畅度、基础质量和错误处理，不作为最终小说质量定论。
- 如果真实模型输出质量不理想但结构和流程通过，结论可以是“可接受风险”，并进入后续提示词/评分调试。
- 如果真实模型无法稳定输出合法 JSON、导致主流程中断、或者暴露密钥/完整 prompt/完整响应，则 M1 阻塞。

## 后续任务

- GPT / OpenAI 复审 provider。
- Kimi 长上下文阅读 provider。
- Agent 模型路由 seed 化。
- 模型配置后台。
- 成本统计、token 统计和质量对比报表。
- 提示词模板版本后台和 A/B 测试。
