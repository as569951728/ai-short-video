# creationSource 正式验收收口

时间：2026-07-11 17:48:20 CST

## 结论

- 任务包：`CS-R0` 至 `CS-R3`
- 正式结论：通过
- `ready_to_close_creationSource`：`yes`
- 验收环境：API in-memory/mock + admin-web backend/mock 浏览器模式
- 未覆盖环境：真实 MySQL/Prisma live、真实模型 provider、热点查询服务

本次收口确认小说创建来源已经从前端选择贯通到 shared DTO、API 校验、权威持久化位置、列表/详情回显和刷新恢复。历史无来源记录保持 `legacy_unknown`，不会被误标为用户明确选择的系统推荐。

## 验收证据

### 自动化门禁

- shared：12/12 通过。
- API novels：108/108 通过。
- admin-web novels：初验 76/76 通过；条件项修复后相关测试 77 项通过。
- `npm run typecheck`：通过。
- `npm run build:budget -w apps/admin-web`：通过；entry 约 1000.89 kB，路由 chunk 在预算内。
- Prisma schema validate：通过。
- `git diff --check`：通过。

### API 与仓储

- 新客户端系统推荐显式提交 `system_recommendation`。
- 旧客户端省略来源时按兼容合同默认 `system_recommendation`。
- 手动想法空白、过短和来源字段冲突返回字段级校验错误。
- 默认 `HotspotReferenceGateway` 明确不可用；fake gateway 测试覆盖合法、缺失、跨租户和机会点归属错误。
- `CreateNovelPreferences.creationSourceType` 是唯一权威来源，`Novel` 不双写来源类型。
- migration 草案只修改 `create_novel_preferences`：历史行标记为 `legacy_unknown`，新记录默认 `system_recommendation`。

### 浏览器

- `/novels/new` 系统推荐 Network body 显式携带 `creationSourceType: system_recommendation`，不携带热点字段。
- 手动想法空白和过短不会发出创建请求；有效输入提交 `manual_idea`，不携带热点字段。
- 列表显示“系统推荐”与“手动想法”来源摘要。
- 详情页显示来源摘要，直接重载后保持。
- “引用热点”保持禁用，默认状态直接显示不可用原因，不依赖 hover 或先选择。
- 页面无硬编码热点选项、热点管理、P10/P12、发布、上传或平台回填入口。
- console 0 error / 0 warning；清理测试记录器后 storage 未发现密钥、DB URL、prompt 或模型响应泄露。

## 条件项复验

初次 `CS-R3` 为有条件通过，唯一条件项是禁用的“引用热点”缺少可见不可用说明。研发最小修复后，测试独立复验确认：

- 默认系统推荐状态下说明直接可见。
- 文案明确当前暂无可用热点数据或热点引用能力，不能选择。
- 热点入口仍为 disabled。
- 未新增硬编码热点、热点管理、P10/P12 或真实环境越界。

因此条件项关闭，`creationSource` 前置包正式收口。

## 保留风险

- 未执行真实 MySQL/Prisma live smoke，相关结论继续受 P8b-L1b 环境与授权门禁约束。
- 未接真实热点查询模块；生产默认 gateway 继续不可用。
- 未运行真实模型 provider。
- P10 仅完成需求设计，仍需用户单独授权后才能派发研发。
