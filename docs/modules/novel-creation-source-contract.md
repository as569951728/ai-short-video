# 小说创作来源合同

## 1. 目的

创建小说页面已经向用户提供“系统推荐 / 引用热点 / 手动想法”三种来源，但当前选择只改变前端选中态，没有进入请求、持久化和详情回显。本合同用于关闭页面承诺与后端事实不一致的问题，并作为 P10 开工前的独立前置项。

本合同只定义创作来源，不实现热点管理、运营归因、P10 发布记录或 P12 复盘看板。

## 2. 来源枚举

新建请求可提交：

- `system_recommendation`：系统按题材、爽点和默认策略推荐方向。
- `hotspot_reference`：用户明确选择一个可访问的热点报告或机会点作为创作依据。
- `manual_idea`：用户提供核心想法，系统围绕该想法扩展方向。

响应额外允许：

- `legacy_unknown`：历史数据没有可信来源，不能伪装成用户曾选择“系统推荐”。

`channel` 继续表示业务频道，不能复用为创作来源。

## 3. 请求与字段规则

`CreateNovelDraftRequest` 新增 `creationSourceType`。新前端必须提交；为兼容旧客户端，API schema 在过渡期允许缺省，服务端仅对新创建请求缺省为 `system_recommendation`。数据库历史行缺少来源时按 `legacy_unknown` 展示，不做静默事实迁移。

| 来源 | 必填 | 可选 | 禁止 |
| --- | --- | --- | --- |
| 系统推荐 | `creationSourceType` | `customIdea` 作为补充想法 | `hotspotReportId`、`hotspotOpportunityId` |
| 引用热点 | `creationSourceType`、可验证的 `hotspotReportId` | `hotspotOpportunityId`、`customIdea` 补充偏好 | 无真实可选热点时提交 |
| 手动想法 | `creationSourceType`、去空格后不少于 6 个字符的 `customIdea` | 题材、爽点、读者和其他偏好 | `hotspotReportId`、`hotspotOpportunityId` |

冲突字段必须返回字段级 `VALIDATION_ERROR`，不能静默丢弃或反推来源。

## 4. 热点能力边界

“引用热点”只有在系统能提供真实、当前租户可访问的只读热点选项时才可用：

- 页面展示热点报告选择器；有机会点时可进一步选择机会点。
- 没有热点能力或没有可选数据时，入口禁用并解释原因，建议改用系统推荐或手动想法。
- 后端校验报告存在、租户一致且可引用；选择机会点时还要校验其属于所选报告。
- 热点不存在、已删除、跨租户或不可访问时，拒绝创建并提示重新选择。
- 不允许保存 `unverified_service_unavailable` 作为一次有效热点引用，也不允许用户手填任意热点 ID。

P10-preflight 可以接只读最小查询合同或受控 fixture，但不建设热点管理页、不生成热点报告。

当前仓库没有热点查询模块，热点分析菜单也处于禁用状态。因此本前置包采用以下落地方式：

- 后端定义最小 `HotspotReferenceGateway` 合同，只负责“能力是否可用、报告/机会点是否存在、租户与归属是否有效”。
- 默认运行实现返回“热点引用能力不可用”，前端据此禁用“引用热点”，后端也拒绝 `hotspot_reference`。
- 自动化测试可以注入受控 fake gateway，覆盖合法热点、缺失、跨租户和归属错误；fake 只存在于测试，不进入生产页面或持久化默认数据。
- 后续热点模块提供真实只读 gateway 后，入口才能变为可用；不得在本包硬编码静态热点选项。

## 5. 持久化与响应

- `CreateNovelPreferences` 是来源事实的权威记录，新增 `creationSourceType`。
- `Novel` 不重复保存该字段，避免双写漂移；列表查询通过偏好关联或安全投影返回来源摘要。
- `CreateNovelPreferencesDTO` 返回 `creationSourceType`、展示文案和安全的热点摘要。
- `NovelDetailDTO` 必须能回显来源及对应字段。
- 小说列表可展示轻量来源标签，但来源不能抢占“当前阶段 / 下一步动作”的主信息。
- 操作日志保存来源类型和安全引用 ID，不保存完整热点正文、完整模型响应或敏感配置。

迁移只提交静态 Prisma schema/migration 草案。没有安全数据库环境和主控明确授权时，不能声明真实 MySQL/Prisma 写路径通过。

## 6. 页面交互

- 默认选中“系统推荐”，补充想法标记为可选。
- 切换“引用热点”时展示真实选择器；无数据时展示空状态且不能提交。
- 切换“手动想法”时将输入名称改为“核心想法”并标记必填。
- 切换来源时保留用户已输入内容供返回编辑，但提交请求只能携带当前来源允许的字段。
- 创建成功后的列表和详情显示来源；文案说明来源只影响后续方向生成参考，不代表已生成设定、大纲、正文或视频。
- 编辑或刷新草稿时恢复来源选中态、热点选择和想法内容。
- 历史数据显示“未记录来源”；若根据旧字段推断，仅可显示“历史数据推断”，不得静默回写。

## 7. 验收 fixture

- `novel-source-system-basic`：系统推荐，无补充想法。
- `novel-source-system-note`：系统推荐，带补充想法。
- `novel-source-hotspot-valid`：同租户有效报告和机会点。
- `novel-source-hotspot-missing`：报告不存在。
- `novel-source-hotspot-cross-tenant`：报告跨租户。
- `novel-source-hotspot-empty-capability`：没有可选热点。
- `novel-source-manual-valid`：手动想法满足长度。
- `novel-source-manual-empty`：手动想法为空或过短。
- `novel-source-conflict`：手动/系统来源携带热点字段。
- `novel-source-legacy-unknown`：历史数据无来源字段。

## 8. 验收矩阵

### API 与领域自动化

- 三种新来源请求进入领域校验、仓储和 DTO 映射。
- 系统推荐可不填想法；热点字段冲突时拒绝。
- 引用热点必须经过存在、租户和归属校验。
- 默认 gateway 不可用时拒绝热点来源；注入受控 fake gateway 时合法热点请求可通过。
- 手动想法为空、过短或携带热点字段时拒绝。
- 详情和列表返回保存后的来源，刷新后不丢失。
- 旧客户端缺省行为和历史 `legacy_unknown` 行为分别有测试，不得混为一谈。

### Repository 与 Prisma 静态检查

- 内存仓储和 Prisma 仓储字段、映射和默认行为一致。
- migration 对历史行写入数据库枚举 `LEGACY_UNKNOWN`；shared/API DTO 层统一映射为 `legacy_unknown`，不回填为系统推荐。
- `prisma validate`、migration 静态审查和类型检查通过。

### 浏览器人工验收

- 三种来源的条件展示、必填提示、禁用态和字段级错误可理解。
- 引用热点无数据时不能形成假提交。
- 当前运行态热点入口显示不可用原因；页面和 Network 中都不存在硬编码热点选项。
- 创建后列表、详情和刷新回显一致。
- 页面明确说明创作来源不是自动生成结果。

## 9. 阻塞标准

以下任一情况存在即不能通过：

- 来源仍只改变 UI，没有进入请求或持久化。
- 页面允许没有真实选择对象的“引用热点”。
- 跨租户、已删除或不存在热点可创建成功。
- 手动想法为空仍可创建，或系统推荐被错误要求必填想法。
- 冲突字段被静默保存或静默丢弃。
- 刷新后来源丢失，或列表/详情无法回显。
- 历史数据被伪装成用户明确选择的系统推荐。
- mock/in-memory 通过被表述为真实 MySQL/Prisma live smoke 通过。
- 顺带实现热点管理、运营归因、P10 发布或 P12 看板。

## 10. 分包建议

1. `CS-R0`：shared 枚举、请求/响应 DTO、校验矩阵和 fixture。
2. `CS-R1`：领域校验、`HotspotReferenceGateway`、内存/Prisma 仓储、migration 草案、操作日志与 API 测试。
3. `CS-R2`：创建页条件交互、热点能力不可用状态、列表/详情回显和前端测试。
4. `CS-R3`：测试会话独立执行 API、静态、浏览器和边界验收。
5. `CS-L1`：真实 MySQL/Prisma smoke，必须单独获得安全环境和主控授权。

当前状态：需求成稿，尚未授权实现。
