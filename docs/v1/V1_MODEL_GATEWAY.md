# V1 模型网关方案

日期：2026-06-07

## 1. V1 目标

V1 要证明“大模型可替换”，但不追求一次接入所有供应商。

V1 只需要跑通：

1. 一个高质量主模型。
2. 一个低成本或备用模型。
3. 一个 OpenAI-compatible 自定义接口。

## 2. 用户侧隐藏复杂度

普通用户主流程中不出现：

- Prompt。
- token。
- temperature。
- 模型路由。
- 备用模型。
- 上下文窗口。
- 模型评测。

用户只看到：

- 生成中。
- 正在优化。
- 生成失败，可重试。
- 内容已保存。

## 3. 管理员可配置项

管理员设置页支持：

- 供应商。
- 展示名称。
- Base URL。
- API Key。
- 默认模型。
- 是否启用。
- 连接测试。
- 最近测试结果。

## 4. V1 任务接口

业务层只调用任务接口，不直接调用具体模型。

任务接口：

```text
understandIdea(input)
generateHook(input)
generateScript(input)
generateStoryboard(input)
generateSubtitles(input)
generateTitleOptions(input)
generateCoverCopy(input)
generatePublishCopy(input)
scoreQuality(input)
rewriteSection(input)
```

## 5. 任务路由

V1 推荐路由：

- understandIdea：低成本模型。
- generateHook：高质量主模型。
- generateScript：高质量主模型。
- generateStoryboard：高质量主模型。
- generateSubtitles：低成本模型。
- generateTitleOptions：低成本模型。
- generateCoverCopy：低成本模型。
- generatePublishCopy：低成本模型。
- scoreQuality：评审模型或高质量主模型。
- rewriteSection：高质量主模型。

## 6. 失败处理

如果某一步失败：

1. 保存已完成步骤。
2. 记录 ModelRun。
3. 展示用户可理解错误。
4. 提供“重试当前步骤”。
5. 如果配置了备用模型，提供“使用备用模型”。

不得因为某一步失败而清空整个生成结果。

## 7. 连接测试

连接测试需要验证：

- Base URL 可访问。
- API Key 可用。
- 默认模型可调用。
- 能返回一段简单文本。

测试失败时展示：

- 供应商不可访问。
- API Key 无效。
- 模型名称错误。
- 网络或超时问题。

## 8. 成本记录

V1 可以先记录估算成本。

ModelRun 记录：

- provider。
- model。
- task_type。
- status。
- estimated_cost。
- error_message。

后续版本再做完整成本看板。

## 9. 模型准入

候选模型不能直接作为默认模型。

V1 最小准入测试：

1. 生成 3 个故事短视频脚本。
2. 生成 3 组标题。
3. 对 3 条脚本进行质检评分。
4. 人工判断是否可用。

通过标准：

- 输出字段完整。
- 中文表达自然。
- 钩子明确。
- 脚本不明显跑题。
- 结构化输出稳定。

## 10. V1 验收

- 管理员能配置至少 1 个模型连接。
- 管理员能完成连接测试。
- 生成流程能调用模型生成完整素材包。
- 失败时不丢失已生成内容。
- 每次调用都有 ModelRun 记录。
- 普通用户不需要理解模型配置。

## 11. 当前实现状态

日期：2026-06-06

已完成：

- 新增本地 API 服务：`server/index.mjs`。
- 新增运行命令：`npm run api`。
- 新增环境变量示例：`.env.example`。
- 支持健康检查：`GET http://127.0.0.1:8787/api/health`。
- 支持连接测试：`POST http://127.0.0.1:8787/api/model/test`。
- 支持故事内容包生成：`POST http://127.0.0.1:8787/api/generate/story-package`。
- 设置页已接入本地连接测试 API。
- 前端生成流程已接入本地模型网关；缺配置、超时、接口错误或结构不完整时回退本地 Mock。
- 设置页已增加 3 条模型生成质量准入测试。
- 模型生成请求已增加 `response_format: { type: "json_object" }` 和 `max_tokens`，降低 JSON 结构不稳定和截断风险。
- 服务端已新增最小 ModelRun 本地记录，保存到 `.runtime/model-runs.jsonl`。

当前连接测试读取顺序：

1. 设置页临时输入。
2. 系统环境变量。
3. `.env.local`。

当前尚未完成：

- 尚未实现备用模型路由。
- 尚未在 UI 中展示 ModelRun 历史。
- 尚未完成真实模型 3 条准入测试。

下一步：

1. 在 `.env.local` 配置 `AI_PROVIDER_BASE_URL`、`AI_PROVIDER_API_KEY`、`AI_STORY_MODEL`。
2. 用设置页完成真实连接测试。
3. 配置真实模型后，运行设置页的 3 条生成质量准入测试。
4. 通过准入后，生成 3 条真实候选内容，人工挑 1 条设为演示案例。
