# V1 真实模型选择方案

日期：2026-06-07

## 1. 结论

V1 不追求一次接入所有模型。

当前优先策略：

1. 主力生成候选：DeepSeek 官方当前可调用的高质量 Chat 模型。
2. 低成本批量候选：DeepSeek 官方当前可调用的低成本 Chat 模型。
3. 兼容备选：Gemini 官方当前可调用且支持 OpenAI compatibility 的模型。
4. 质量评审候选：OpenAI 官方当前高质量 Chat / Responses 模型。
5. 后续增强候选：Claude Sonnet / Opus 系列，用于更强文案润色和内容诊断，但不作为 V1 第一接入。

原因：

- 当前系统模型网关已经按 OpenAI-compatible `/chat/completions` 设计。
- DeepSeek 官方支持 OpenAI 格式，Base URL 为 `https://api.deepseek.com`。
- Gemini 官方也支持 OpenAI compatibility，Base URL 为 `https://generativelanguage.googleapis.com/v1beta/openai/`。
- OpenAI 高质量模型支持更强结构化输出和评审能力，但成本通常高于低成本中文模型。
- Claude 文案能力强，但当前系统尚未实现 Anthropic adapter；V1 不应为了它先扩架构。
- 具体模型名必须以供应商控制台和真实连接测试为准，不以本文档示例名为准。

## 2. 推荐配置

### 2.1 首选：DeepSeek 高质量 Chat 模型

适用：

- 生成故事短视频脚本。
- 生成小说转短视频内容包。
- 生成标题、钩子、分镜、字幕、发布文案。
- 跑 3 条模型质量准入测试。

配置：

```env
AI_PROVIDER_BASE_URL=https://api.deepseek.com
AI_STORY_MODEL=<DeepSeek 控制台当前可调用的高质量 Chat 模型名>
```

使用规则：

- 先跑设置页里的 3 条生成质量准入测试。
- 3 条全部通过后，才能拿生成结果沉淀演示案例。
- 如果 JSON 结构不稳定，优先改提示词和校验，不要先扩功能。

### 2.2 低成本备选：DeepSeek 低成本 Chat 模型

适用：

- 批量生成候选标题。
- 批量生成选题草稿。
- 低成本跑 20 条脚本探索。

配置：

```env
AI_PROVIDER_BASE_URL=https://api.deepseek.com
AI_STORY_MODEL=<DeepSeek 控制台当前可调用的低成本 Chat 模型名>
```

限制：

- 如果内容明显偏模板化，不能直接作为演示案例。
- 适合做草稿，不适合直接做高质量收费交付。

### 2.3 兼容备选：Gemini OpenAI-compatible 模型

适用：

- 对比 DeepSeek 生成质量。
- 长上下文小说片段转短视频。
- 需要更强多样化输出时做候选。

配置：

```env
AI_PROVIDER_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_STORY_MODEL=<Google AI Studio 当前可调用的 Gemini 模型名>
```

注意：

- Flash 类模型更适合先做兼容性和成本测试。
- Pro 类模型更适合长上下文、复杂小说转短视频对照。
- Gemini 的 OpenAI compatibility 有兼容边界，V1 可以测试，但不要把它作为唯一依赖。
- 如果接口参数兼容问题影响生成，后续再做 Gemini adapter。

### 2.4 质量评审备选：OpenAI 高质量模型

适用：

- 对 DeepSeek 生成结果做质量评审。
- 改写脚本、降低 AI 痕迹。
- 做更严格的 JSON 结构输出测试。

配置：

```env
AI_PROVIDER_BASE_URL=https://api.openai.com/v1
AI_STORY_MODEL=<OpenAI 平台当前可调用的高质量模型名>
```

限制：

- 成本更高，不适合作为 V1 大量批量生成的默认模型。
- V1 可以用它做少量高质量对照和评审。

### 2.5 暂不优先：Claude Sonnet / Opus

适用：

- 后续做内容诊断、润色、长文改写。
- 作为商业版的高质量模型选项。

暂缓原因：

- 当前系统还没有 Anthropic adapter。
- 直接接入会增加 V1 架构复杂度。
- 当前目标是 2 周内赚到 100 元，优先用 OpenAI-compatible 模型跑通闭环。

## 3. 模型选择规则

不要凭主观感觉换模型。

任何模型必须按以下顺序验证：

1. 设置页连接测试通过。
2. 3 条模型质量准入测试全部通过。
3. 用该模型生成 3 条候选内容。
4. 人工挑 1 条设为演示案例。
5. 用演示案例联系 5 个真实对象。
6. 记录客户回复、异议和是否愿意付费。

如果第 5、6 步没有真实反馈，不要继续换模型。先验证客户是否认这个交付。

## 4. 当前 V1 默认路线

本周建议：

1. 先配置 DeepSeek 官方控制台当前可调用的高质量 Chat 模型。
2. 跑 3 条模型准入测试。
3. 如果通过，用该模型生成 3 条候选内容。
4. 如果不通过，再试 Gemini OpenAI-compatible 模型或 OpenAI 高质量模型。
5. 如果仍不通过，再考虑调整提示词、JSON schema 或引入专门 adapter。

## 5. 信息来源

- DeepSeek API：OpenAI/Anthropic compatible，Base URL 和 V4 Flash / V4 Pro 模型信息来自官方 API 文档。
- Gemini API：模型列表、OpenAI compatibility 和 Base URL 来自 Google AI 官方文档。
- OpenAI API：GPT-5.1 支持 Chat Completions、Structured outputs 和价格来自 OpenAI 官方文档。
- Anthropic API：Claude Sonnet 4.6 / Opus 4.8 价格来自 Anthropic 官方文档。
