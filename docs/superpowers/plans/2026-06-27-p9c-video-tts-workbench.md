# P9c 视频配音调试工作台计划

## 范围

- 只开放视频详情工作台的配音步骤。
- 使用 mock/local TTS provider 生成可验收的音频候选摘要和 previewUrl 占位。
- 复用 P9b 的 `VideoArtifact`、`VideoActionReceipt`、幂等、任务可见性和操作日志口径。
- 字幕、视觉方案、渲染、导出和发布继续锁定。

## 步骤

1. 补 shared/API/admin-web 测试，先锁定 P9c 合同和关键门禁。
2. 扩展 shared DTO：`tts_audio` 产物、TTS 参数、任务、请求和返回结构。
3. 扩展 Prisma schema 和 migration 草案，只新增音频产物所需字段，不执行真实 DB 写入。
4. 后端新增 TTS route/service/repository 能力：生成候选、确认、拒绝、失败/取消/重试、幂等冲突、sourceVersionRefs 校验。
5. 前端接入配音步骤：参数控件、候选列表、试听占位、确认、不采用、失败/重试/取消任务态。
6. 更新 P9 文档，运行 shared/api/admin-web 测试、typecheck、build、prisma validate，并做页面/API smoke。

## 边界

- 不调用真实 TTS 或外部对象存储。
- 不生成字幕、不渲染、不导出、不发布。
- 不运行 migrate/db push/reset/seed。
