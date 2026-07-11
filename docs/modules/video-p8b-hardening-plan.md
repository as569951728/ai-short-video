# P8b Hardening：视频承接合同对齐和真实库补验

时间：2026-06-23

本文档承接 P8b 收口后的工程质量巡检。P8b 已按可接受风险收口，但在进入 P9 视频生成工作台前，需要关闭或明确跟踪两个 P1 风险。

## 背景

P8b 已完成视频承接后端持久化和接口接入，测试会话结论为可接受风险。工程质量会话在 2026-06-23 14:42 复巡后确认：

- 未发现新增 P9/P10 或真实视频生产链路越界。
- 未发现密钥、完整提示词、完整模型响应或完整章节正文泄露。
- 仍存在两个 P1 风险：真实 MySQL migrate / live smoke 未补验；P8b route schema 与 shared DTO / 文档存在合同漂移。

## P8b-H1：接口合同对齐

优先级：P1，P9 前必须关闭。

状态：已通过测试会话正式复验，已收口。

修复记录（2026-06-23）：

- `POST /videos` route schema 已与 shared / 文档对齐，`projectType` 仅接受 `first_test | chapter_range | full_book_seed`，不再接受未记录的 `standard`。
- `POST /videos` route schema 已显式声明 `duplicatePolicy=return_existing | create_distinct`，非法值返回统一 `VALIDATION_ERROR`。
- `GET /videos` query schema 已移除未共享的 `lifecycleStatus=draft`。
- `POST /videos/:videoId/reference/issues/:issueId/resolve` route schema 已移除 `return_to_novel`；该值仅保留为前端推荐/导航动作，不作为后端写动作。
- 已补 API 合同测试覆盖合法/非法 projectType、duplicatePolicy、lifecycleStatus=draft 和 return_to_novel resolve action。

复验记录（2026-06-23）：

- 测试会话正式复验结论：通过。
- 验证通过：合法 projectType、非法 `standard`、合法/非法 `duplicatePolicy`、`lifecycleStatus=draft` 拒绝、resolve `return_to_novel` 拒绝。
- 回归通过：shared、api、admin-web 测试、typecheck、build、Prisma validate。
- 边界通过：未发现 P8b-L1、P9/P10 或真实视频生产链路越界。

目标：

- 统一 `packages/shared/src/videos.ts`、`apps/api/src/modules/videos/routes/videoRoutes.ts` 和 P8b 文档里的枚举与请求字段。
- 补合同测试，避免后续 P9 基于错误接口继续扩展。

需要修正：

1. `projectType`
   - shared / 文档合法值：`first_test | chapter_range | full_book_seed`。
   - route schema 不应再接受未记录的 `standard`。
   - route schema 必须接受 `chapter_range` 和 `full_book_seed`。

2. `duplicatePolicy`
   - `CreateVideoProjectRequest` 已声明：`return_existing | create_distinct`。
   - route schema 必须显式声明该字段，或 shared/docs 删除该字段。
   - 当前口径：保留并显式声明该字段。

3. `lifecycleStatus`
   - shared / 文档合法值：`active | stopped | archived`。
   - route query schema 不应接受未共享的 `draft`。

4. `resolve issue action`
   - shared 的 `ResolveVideoReferenceIssueRequest.action` 已排除 `return_to_novel`。
   - route schema 不应在处理接口接受 `return_to_novel`。
   - `return_to_novel` 只保留为前端推荐动作或导航动作，不作为后端处理写动作。

验收标准：

- `POST /videos` 接受 `first_test`、`chapter_range`、`full_book_seed`。
- `POST /videos` 拒绝 `standard`。
- `POST /videos` schema 显式支持 `duplicatePolicy=return_existing/create_distinct`。
- `GET /videos` 拒绝或不声明 `draft` lifecycle filter。
- `POST /videos/:videoId/reference/issues/:issueId/resolve` 拒绝 `return_to_novel`。
- shared、api、admin-web 相关测试、typecheck、build 通过。
- 不新增任何 P9/P10 可执行入口。

## P8b-L1：真实 MySQL / Prisma live smoke

优先级：P1，P9 前或准生产前必须补验。

状态：待环境。P8b-L1a 已通过正式验收并收口；P8b-L1b 仍待安全本地 / 测试 / smoke MySQL 环境、结构准备策略和显式授权。测试会话未执行真实库写入。

待环境记录（2026-06-23）：

- `apps/api/.env` 存在，但 `DATABASE_URL` 不存在。
- `apps/api/prisma` 下未发现 `migrations` 目录。
- 测试会话按安全边界停止，未执行 migrate、db push、seed 或任何真实库写入。
- 当前不能声明真实 MySQL / Prisma 写路径通过。

后续拆分：

- P8b-L1a：研发补安全 smoke 脚本、环境拒绝保护、迁移/建表策略说明和最小可复验入口。已完成并通过测试会话正式验收。
- P8b-L1b：测试在明确本地/测试/烟测数据库准备好后，再执行真实 MySQL / Prisma live smoke。当前仍待环境。

目标：

- 在受控 MySQL 环境跑一次 P8b 最小真实写路径。
- 将“Prisma schema validate 通过”和“真实 MySQL 写路径通过”分开记录。

建议覆盖：

- migrate / seed。
- `GET /videos/sources`。
- `POST /videos` 创建项目、引用快照、章节快照和默认视频单元。
- 同 idempotency token 同请求复用。
- 同 idempotency token 不同请求冲突。
- `GET /videos/:videoId/reference`。
- `POST /videos/:videoId/reference/recheck`。
- issue 处理和停止项目。

当前处理：

- 本项不阻塞 P8b 当前收口。
- 当前仓库未发现 `apps/api/prisma/migrations` 目录，测试不得对不明数据库运行会生成迁移或破坏数据的命令。
- 只允许在明确的本地/测试库上执行写入 smoke；若 `DATABASE_URL` 不存在、指向非本地/非测试库、或迁移条件不足，必须停下来汇报，不得自行绕过。

## P8b-L1a：安全 smoke 脚本和迁移策略支撑

状态：已通过测试会话正式验收，已收口。

目标：

- 提供一个可复验的 P8b MySQL smoke 入口，但默认拒绝执行。
- 只有在显式本地/测试/烟测库、显式允许写入、且结构准备方式明确时才执行。
- 不打印 `DATABASE_URL` 完整值、用户名、密码或密钥。

研发要求：

1. 新增安全环境检查工具或脚本：
   - 只输出 `DATABASE_URL` 是否存在。
   - 只输出 host 是否本地、database 名是否包含 dev/test/smoke 等安全标识。
   - 不输出完整 URL、用户名、密码。
   - 非安全环境直接失败。

2. 新增 P8b smoke 脚本：
   - 建议命名：`npm run smoke:p8b:mysql -w @ai-shortvideo/api`。
   - 必须要求显式开关，例如 `ALLOW_P8B_SMOKE_DB_WRITE=1`。
   - 必须拒绝非本地/非测试/非 smoke 数据库。
   - 必须覆盖：sources、create、幂等复用、幂等冲突、reference detail、recheck、issue 或 stop。
   - 输出只允许是状态、ID、数量、错误码和耗时，不输出完整正文、连接串、prompt、模型响应或密钥。

3. 明确结构准备策略：
   - 优先补可审查的 migration。
   - 如果暂不补 migration，必须在文档中写清：测试只能在一次性 smoke 库上使用临时建表方式，且需要主控/用户显式授权。
   - 不允许脚本自行对不明数据库执行 `migrate dev`、`db push` 或 destructive reset。

验收标准：

- 无 `DATABASE_URL` 时，脚本安全失败。
- 有非本地/非测试库时，脚本安全失败。
- 未设置显式允许写入开关时，脚本安全失败。
- 安全失败不泄露连接串、用户名、密码或密钥。
- 文档写清如何准备 smoke 数据库和如何运行。
- 不进入 P9/P10。

实现记录（2026-06-23）：

- 新增脚本入口：`npm run smoke:p8b:mysql -w @ai-shortvideo/api`。
- 新增安全门禁模块：`apps/api/src/modules/videos/p8bMysqlSmoke.ts`。
- 自动化测试覆盖：
  - 无数据库连接配置时安全失败。
  - 非本地 host 安全失败。
  - 数据库名不包含 `dev` / `test` / `smoke` / `local` 时安全失败。
  - 未设置 `ALLOW_P8B_SMOKE_DB_WRITE=1` 时安全失败。
  - 安全摘要不包含完整连接串、用户名或密码。

脚本安全行为：

- 脚本启动后先执行安全检查，未通过则直接退出，不创建 API app，不连接 Prisma，不写库。
- 安全摘要只输出：
  - 是否配置数据库连接。
  - host 是否为本地。
  - database 名是否符合安全命名。
  - 是否设置显式写入授权。
- 脚本不输出完整 `DATABASE_URL`、用户名、密码、API Key、完整提示词、完整模型响应或完整章节正文。
- 脚本不会自动执行 `prisma migrate dev`、`prisma db push`、`prisma migrate reset` 或 `db:seed`。

P8b-L1b 执行前置：

1. 由主控或测试准备一次性本地 / 测试 / smoke 数据库。
2. `DATABASE_URL` 必须指向 `localhost` / `127.0.0.1` / `::1`。
3. database 名必须包含 `dev` / `test` / `smoke` / `local` 中至少一个安全标记。
4. 运行前必须显式设置 `ALLOW_P8B_SMOKE_DB_WRITE=1`。
5. 结构准备方式必须先被主控确认：
   - 优先使用已审查的 Prisma migrations。
   - 当前仓库暂未提供 `apps/api/prisma/migrations` 目录，因此测试不得对不明库直接运行迁移、db push 或 reset。
   - 若本阶段需要临时 `db push` 准备一次性 smoke 库，必须由主控确认数据库是可丢弃的本地/测试/烟测库，并在执行记录中单独说明。
6. smoke 样本需要至少包含一个 `video_ready` 小说和当前待视频化快照，否则脚本会在 `GET /videos/sources` 后安全失败并说明未覆盖原因。

P8b-L1b 预期覆盖：

- `GET /videos/sources`。
- `POST /videos` 创建视频项目、引用快照、章节快照和默认视频单元。
- 同 `idempotencyToken` + 同请求复用同一项目。
- 同 `idempotencyToken` + 不同请求返回 `IDEMPOTENCY_CONFLICT`。
- `GET /videos/:videoId/reference`。
- `POST /videos/:videoId/reference/recheck`。
- 若重检产生 open issue，则处理 issue；否则停止本次 smoke 创建的视频项目，作为操作日志和写路径覆盖。

后续状态：

- P8b-L1a 已提供安全脚本和拒绝路径测试，并已通过测试会话正式验收。
- P8b-L1b 仍待环境准备后由测试会话执行，不在本轮研发中声明真实 MySQL 写路径通过。

正式验收记录（2026-06-24）：

- 测试会话结论：通过，允许 P8b-L1a 收口。
- 回归通过：api 65/65、shared 4/4、admin-web 45/45、typecheck、build、Prisma validate。
- 安全拒绝路径通过：
  - 无 `DATABASE_URL` 安全失败。
  - 非本地 host 安全失败。
  - 非安全 dbName 安全失败。
  - 缺少 `ALLOW_P8B_SMOKE_DB_WRITE=1` 安全失败。
- 脚本输出未泄露完整连接串、用户名、密码、API Key 或密钥。
- 验收未执行真实 MySQL 写入、migrate、db push、reset、seed。
- 未进入 P8b-L1b、P9 或 P10。
