# 小说创作来源研发派发包

## 1. 状态

- 需求合同：`docs/modules/novel-creation-source-contract.md`。
- 多 Agent 评审：产品、架构、测试已确认；`HotspotReferenceGateway` 与开工包补充也已由三方复核为 `confirmed`。
- 当前仅完成开工准备，未经用户授权不得修改业务代码。

## 2. 目标

让创建小说页面的来源选择成为真实、可校验、可持久化、可回显的业务事实；同时在当前没有热点模块的情况下提供诚实的不可用状态，不制造静态热点或假选择器。

## 3. 开工前基线

研发必须先记录 `git status --short`，并阅读：

- `AGENTS.md`
- `docs/architecture.md` 的数据库、后端和前端规范
- `docs/backend-implementation-checklist.md`
- `docs/frontend-implementation-checklist.md`
- `docs/modules/novel-creation-source-contract.md`
- `docs/reviews/worktree-attribution-checkpoint-2026-07-11.md`

共享工作树已经包含小说、M1、P8-P9 和治理改动。禁止 reset、checkout、clean、stash、覆盖或顺手重构既有变更。

## 4. CS-R0 共享合同

预计范围：

- `packages/shared/src/novels.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/contracts.test.ts`

交付：

- 新增 `NovelCreationSourceType`：请求使用三种新来源，响应兼容 `legacy_unknown`。
- `CreateNovelDraftRequest` 过渡期允许缺省；新前端必须显式提交。
- `CreateNovelPreferencesDTO` 和小说列表安全摘要返回来源。
- 固定 DB 大写枚举与 API 小写机器值映射。
- 覆盖枚举、请求/响应和 legacy 映射测试。

禁止：复用 `channel`、增加来源效果分析字段、修改 P10 DTO。

## 5. CS-R1 后端与持久化

预计范围：

- `apps/api/prisma/schema.prisma`
- 新增独立 migration 草案
- `apps/api/src/modules/novels/domain/novelDomain.ts`
- `apps/api/src/modules/novels/routes/novelRoutes.ts`
- `apps/api/src/modules/novels/services/novelService.ts`
- `apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts`
- `apps/api/src/modules/novels/repositories/prismaNovelRepository.ts`
- 新增 `apps/api/src/modules/novels/integrations/hotspotReferenceGateway.ts` 或符合现有分层的等价路径
- 相关 API/domain/repository 测试

交付：

- `CreateNovelPreferences.creationSourceType` 为唯一权威来源。
- migration 历史行使用 DB 枚举 `LEGACY_UNKNOWN`；DTO 映射为 `legacy_unknown`。
- 系统推荐、手动想法、热点引用按合同做字段互斥和字段级错误。
- 默认 `HotspotReferenceGateway` 明确返回 capability unavailable；不访问外部服务。
- 测试注入 fake gateway，验证合法、缺失、跨租户、机会点归属错误。
- create/detail/list/in-memory/Prisma 映射一致。
- 操作日志只保存安全来源摘要。

禁止：硬编码热点、建立热点表/管理页、读取 `.env`、运行真实 MySQL、修改 P10/P12、扩大创建幂等范围。

## 6. CS-R2 前端闭环

预计范围：

- `apps/admin-web/src/pages/NovelCreateWizard.vue`
- `apps/admin-web/src/modules/novels/services/novelService.ts`
- `apps/admin-web/src/modules/novels/model/*`
- 小说列表/详情中最小来源摘要位置
- 对应单测

交付：

- radio 使用共享机器值，不再保存中文文案作为业务值。
- 系统推荐显式提交，补充想法可选。
- 手动想法显示“核心想法”、必填且不少于 6 个字符。
- 引用热点在当前运行态禁用并显示原因，不展示硬编码下拉选项。
- payload 只携带当前来源允许字段。
- 创建成功后列表、详情、刷新回显一致；历史数据显示“未记录来源”。
- 文案明确来源只是方向生成参考，不代表自动生成后续资产。

禁止：假热点数据、页面裸请求、把来源标签做成主状态、调整小说生成流程其他步骤。

## 7. 研发自测

至少运行：

- `npm run typecheck`
- shared 相关测试
- API novels 相关测试
- admin-web novel service/model/create wizard 相关测试
- `npm run build:budget -w apps/admin-web`
- `git diff --check`

研发汇报必须按 shared / api / prisma / admin / tests / docs 分组列出文件，并声明：

- 未运行真实 MySQL/Prisma live smoke。
- 未实现热点管理或真实热点查询。
- 未实现 P10/P12。
- 当前工作树新增文件的归因。

## 8. CS-R3 独立验收包

研发完成后由测试会话执行，研发不能自验代替正式验收。

测试必须覆盖：

1. Network payload 能证明三种来源合同真实进入 API。
2. create/detail/list/刷新后的来源一致。
3. 系统推荐补充想法可空，热点字段冲突被拒绝。
4. 手动想法空白、过短、携带热点字段被拒绝。
5. 默认热点 gateway 不可用时，UI 禁用且 API 拒绝。
6. fake gateway 下合法热点通过，缺失、跨租户、归属错误被拒绝。
7. 历史数据显示 `legacy_unknown` / “未记录来源”。
8. migration/static、内存和 Prisma 映射一致。
9. 页面无热点管理、P10、P12、真实 provider 或真实 DB 越界。

阻塞标准直接采用 `docs/modules/novel-creation-source-contract.md` 第 9 节。

## 9. CS-L1 边界

真实 MySQL/Prisma live smoke 不属于普通研发/验收。只有获得安全数据库环境和主控明确授权后才能单独执行；此前最多声明 shared/API/in-memory/Prisma static/browser 通过。
