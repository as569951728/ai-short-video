# 原型设计文档

本目录用于沉淀后台系统原型阶段的页面流程、低保真页面说明、交互边界和验收口径。

当前阶段以 Markdown + Mermaid 文档为主，关键工作台可以补充可点击 HTML 原型帮助确认交互。后续进入前端实现时，`apps/admin-web` 必须通过 Vite 官方脚手架初始化 Vue + TypeScript 项目，再安装 Element Plus。

## 文档索引

- 小说系统页面流程总图：`docs/prototypes/novel-system-page-flow.md`
- 后台布局原型：`docs/prototypes/admin-layout-prototype.md`
- 小说列表原型：`docs/prototypes/novel-list-prototype.md`
- 创建小说向导原型：`docs/prototypes/novel-create-wizard-prototype.md`
- 小说详情工作台原型：`docs/prototypes/novel-detail-workbench-prototype.md`
- 小说步骤式工作台可点击原型：`docs/prototypes/novel-step-workbench-clickable-prototype.html`
- 章节详情工作台原型：`docs/prototypes/chapter-detail-workbench-prototype.md`
- 视频系统页面流程总图：`docs/prototypes/video-system-page-flow.md`
- 视频模块核心原型：`docs/prototypes/video-module-core-prototype.md`
- 视频模块可视化原型：`docs/prototypes/video-module-core-clickable-prototype.html`
- 视频步骤式工作台可点击原型：`docs/prototypes/video-step-workbench-clickable-prototype.html`
- 视频列表原型：`docs/prototypes/video-list-prototype.md`
- 创建视频项目原型：`docs/prototypes/video-create-project-prototype.md`
- 视频详情工作台原型：`docs/prototypes/video-detail-workbench-prototype.md`
- 简单视频生成原型：`docs/prototypes/video-simple-generation-prototype.md`
- 发布记录与数据回填原型，后续规划：`docs/prototypes/video-publish-data-prototype.md`
- 短视频单元与系列原型，后续规划：`docs/prototypes/video-short-unit-series-prototype.md`
- 视频列表与任务辅助早期草案：`docs/prototypes/video-list-task-prototype.md`

## 原型设计原则

- 默认入口优先是小说列表。
- 每个关键页面都要告诉用户当前状态和下一步建议。
- 小说详情默认采用“概览页 + 大步骤详情页 + 子步骤条”，避免把所有创作模块堆成一个长页面。
- 小白默认只看到主动作、Top 3 问题和必要风险。
- 复杂版本、任务日志、模型、提示词、成本和高级配置默认折叠。
- 页面设计先按完整产品形态展开，实现阶段再拆 MVP 和后续版本。
