# V1 技术决策

日期：2026-06-06

## 1. 应用形态

决策：

> V1 先做本地 Web 应用。

原因：

- 开发速度快。
- 方便本机验证。
- 方便演示。
- 后续可升级为部署版或 SaaS。

## 2. 推荐技术栈

建议：

- 前端：React + TypeScript。
- 构建：Vite。
- 后端：Node.js API。
- 数据库：SQLite。
- 模型调用：Provider-agnostic model gateway。

说明：

- SQLite 适合本地 V1。
- 数据模型保持向 PostgreSQL 迁移的兼容性。
- 后续部署版可换 PostgreSQL。

## 3. V1 不做

- 移动 App。
- SaaS 计费。
- 多租户。
- 完整权限系统。
- 自动发布。
- 自动抓取平台数据。
- 自动剪辑。
- 完整视频生成。

## 4. 目录建议

如果采用 Vite + Node：

```text
app/
  src/
    features/
      creation/
      editor/
      quality/
      export/
      publish-records/
      settings/
    shared/
      components/
      types/
      utils/
  server/
    model-gateway/
    data/
    workflows/
  tests/
```

## 5. 模型供应商范围

V1 证明可替换，不追求数量。

最低要求：

- 一个高质量主模型。
- 一个低成本或备用模型。
- 一个 OpenAI-compatible 自定义接口。

验收：

- 管理员能配置 API Key。
- 管理员能配置 Base URL。
- 管理员能测试连接。
- 生成流程能记录 provider 和 model。
- 普通用户主流程不展示模型复杂度。

## 6. 数据存储

V1 使用 SQLite 存：

- AccountProfile。
- ContentProject。
- GeneratedPackage。
- QualityScore。
- PublishRecord。
- CompetitorSample。
- Template。
- ModelConnection。
- ModelRun。
- CaseStudy。
- CustomerInterview。

## 7. 测试策略

V1 至少验证：

- 用户可以完成一次生成流程。
- 生成结果字段完整。
- 质检评分能生成。
- 导出内容包能生成。
- 发布记录能保存。
- 模型连接测试失败时有明确提示。

## 8. 人工验收

每个版本都要手工跑通：

1. 输入一句话想法。
2. 生成完整素材包。
3. 修改开头。
4. 运行质检。
5. 导出 Markdown。
6. 保存发布记录。

