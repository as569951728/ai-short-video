# 工作树归因与检查点治理清单

时间：2026-07-11 11:50:39 CST
基线：`main` / `1447095`

本文档只记录当前共享工作树的归因与检查点治理建议，不代表业务验收结论，不移动、不删除、不暂存任何现有改动。

## 盘点命令

- `git status --short`
- `git diff --name-only`
- `git ls-files --others --exclude-standard`
- `sed -n '1,120p' .gitignore`
- 读取验收和治理证据：`docs/reviews/engineering-quality-watch.md`、`docs/reviews/video-p8-acceptance-closure-2026-06-23.md`、`docs/reviews/video-p8b-acceptance-closure-2026-06-23.md`、`docs/reviews/video-p9e-acceptance-closure-2026-07-10.md`

## 盘点统计

| 项目 | 数量 | 说明 |
| --- | ---: | --- |
| `git status --short` 条目 | 64 | 盘点时包含 40 个 tracked modified、24 个 folded untracked 条目 |
| tracked modified 文件 | 40 | 主要集中在小说/M1/API/shared/docs/admin 页面 |
| file-level untracked 文件 | 69 | 其中 38 个为 `.playwright-cli/` 浏览器 smoke 产物 |
| 关键 untracked 源码/迁移/测试/文档 | 31 | 视频 P8/P9、novel 高风险确认夹具、Prisma migration、shared video DTO 等 |

已做最小 ignore 治理：新增 `.playwright-cli/`，仅忽略浏览器 smoke 的 console log 和 page yaml 产物，不隐藏源码、迁移、测试或文档。

## 按模块归因表

| 模块/任务线 | 文件范围 | 当前状态 | 证据来源 | 归因判断 |
| --- | --- | --- | --- | --- |
| 小说正文任务 / trial-body 修复 | `apps/api/src/modules/novels/domain/novelDomain.ts`、`novelRoutes.test.ts`、`repositories/inMemoryNovelRepository.ts`、`repositories/prismaNovelRepository.ts`、`routes/novelRoutes.ts`、`services/novelService.ts`、`apps/api/src/modules/tasks/services/taskService.ts` | tracked modified | 当前 diff 名称；工程质量记录中 `trial_followup_generate`、body batch 预占任务和 typecheck/API 测试记录 | 可归入小说任务生命周期与正文批次修复线，需后续按小说包拆出检查点 |
| 小说前端工作台 / 高风险确认 / QA fixture | `apps/admin-web/src/pages/NovelDetailWorkbench.vue`、`ChapterDetailWorkbench.vue`、`TaskProgressPanel.vue`、`prototypeData.ts`、`novelDetailView.*`、`novelService.*`、`novelTypes.ts`、untracked `highRiskConfirmation.ts`、`highRiskConfirmation.test.ts`、`createOptions.ts` | tracked modified + untracked | 工程质量记录 P1-HR1、P2-QA1 已验收；当前文件名与 fixture 路径 | 大部分可归入小说高风险确认和步骤式工作台治理；`createOptions.ts` 需主控确认是否属于创建向导常量抽取 |
| M1 DeepSeek / AI provider | `apps/api/src/modules/ai/*`、`apps/api/src/modules/novels/providers/deepseekNovelProvider.*`、`providerFactory.ts`、`docs/modules/model-integration-m1-deepseek-provider.md` | tracked modified | M1 文档与工程质量记录真实模型/长耗时治理 | 可归入 M1 模型接入与 provider 测试线 |
| 视频 P8 前端承接 | `apps/admin-web/src/pages/VideoListTask.vue`、`docs/prototypes/video-p8-step-workbench-clickable-prototype.html`、`docs/prototypes/README.md`、`docs/reviews/video-p8-acceptance-closure-2026-06-23.md` | tracked modified + untracked | P8 验收收口复盘：P8 是前端 mock/view-model 承接层 | 可归入视频 P8，源码和验收文档应纳入版本管理 |
| 视频 P8b 后端持久化/API | `packages/shared/src/videos.ts`、`apps/api/src/modules/videos/**`、`apps/admin-web/src/modules/videos/services/*`、`apps/admin-web/src/modules/videos/model/*`、`docs/modules/video-task-package-8b-detailed-design.md`、`docs/modules/video-p8b-hardening-plan.md`、`docs/superpowers/plans/2026-06-23-video-p8b-backend-persistence.md`、`docs/reviews/video-p8b-acceptance-closure-2026-06-23.md` | mostly untracked | P8b 验收收口复盘：shared DTO、videos module、routes、repositories、Prisma schema/API 已通过可接受风险 | 关键已验收资产仍未跟踪，进入下一检查点前应优先纳入审查 |
| 视频 P9a-P9e 工作台 | `apps/admin-web/src/pages/VideoDetailWorkbench.vue`、`apps/admin-web/src/router/index.ts`、`apps/admin-web/src/style.css`、`docs/modules/video-task-package-9-detailed-design.md`、`apps/api/prisma/migrations/20260626000000_add_video_artifact/migration.sql`、`20260627000000_add_video_tts_artifact_fields/migration.sql`、`20260710000000_add_video_render_export/migration.sql`、`apps/api/prisma/video-artifact-migration.test.ts`、`docs/superpowers/plans/2026-06-26-p9b-l1-narration-migration-task-failures.md`、`docs/superpowers/plans/2026-06-27-p9c-video-tts-workbench.md`、`docs/reviews/video-p9e-acceptance-closure-2026-07-10.md` | tracked modified + untracked | P9e 验收收口复盘：P9e 已通过，仍为 mock/local 渲染预览和导出记录，不进入 P10 | 可归入 P9a-P9e；migration 草案和 `VideoDetailWorkbench.vue` 是关键未跟踪资产 |
| Shared 契约 | `packages/shared/src/index.ts`、`contracts.test.ts`、`novels.ts`、untracked `videos.ts` | tracked modified + untracked | P8b/P9e 收口复盘均声明 shared DTO 接入；当前 shared 测试文件修改 | `videos.ts` 是关键契约资产，不能忽略；`novels.ts` 归入小说任务和 M1 契约变更 |
| Prisma / migrations | `apps/api/prisma/schema.prisma`、untracked migrations、`video-artifact-migration.test.ts` | tracked modified + untracked | P8b/P9e 收口复盘均声明 schema/migration 草案；P8b-L1b 仍待真实 MySQL 环境 | 必须纳入版本管理或由主控明确暂存策略；不得以 ignore 隐藏 |
| 文档 / 验收记录 | `docs/modules/*`、`docs/reviews/*`、`docs/superpowers/plans/*` | tracked modified + untracked | 对应验收收口文档和 engineering-quality-watch 最新 P1 | 属于可审计证据链，应纳入检查点；部分混合修改需拆包审查 |
| 生成物 / 临时文件 | `.playwright-cli/**` | untracked | 文件名为 browser smoke console/page snapshot；不属于源码/迁移/测试/文档 | 已加入 `.gitignore`，后续可由主控另派安全清理，不在本包删除 |
| 无法可靠归因 | `apps/api/tsconfig.testrun.json` | untracked | 当前仅能判断为测试运行辅助配置，未在验收文档中直接定位 | RP-00B 已完成归因：一次性辅助配置，删除且不加入 ignore |

## 关键未跟踪资产表

| 路径 | 类型 | 重要性 | 当前证据 | 建议 |
| --- | --- | --- | --- | --- |
| `packages/shared/src/videos.ts` | shared DTO | P8b/P9 共享合同核心 | P8b 收口复盘声明 shared DTO 已接入 | 必须纳入版本管理 |
| `apps/api/src/modules/videos/domain/videoDomain.ts` | 后端 domain | 视频状态/规则地基 | P8b 收口复盘声明 videos module 已覆盖 domain | 必须纳入版本管理 |
| `apps/api/src/modules/videos/routes/videoRoutes.ts` | 后端 route | P8b/P9 API 入口 | P8b 收口复盘声明 routes/API 已通过 | 必须纳入版本管理 |
| `apps/api/src/modules/videos/services/videoService.ts` | 后端 service | 视频业务编排 | P8b/P9e 收口复盘 | 必须纳入版本管理 |
| `apps/api/src/modules/videos/repositories/inMemoryVideoRepository.ts` | 后端 repository | in-memory 验收路径 | P8b/P9e 自动化和 smoke 证据 | 必须纳入版本管理 |
| `apps/api/src/modules/videos/repositories/prismaVideoRepository.ts` | 后端 repository | Prisma 写路径地基 | P8b 收口复盘和真实 MySQL 待环境风险 | 必须纳入版本管理，并标注真实库未验收 |
| `apps/api/src/modules/videos/videoRoutes.test.ts` | API 测试 | 合同和幂等回归 | P8b/P9e 测试证据 | 必须纳入版本管理 |
| `apps/api/src/modules/videos/p8bMysqlSmoke.ts`、`p8bMysqlSmoke.test.ts` | 安全 smoke | P8b-L1a 真实库前置保护 | P8b 收口复盘记录 P8b-L1a 通过 | 必须纳入版本管理 |
| `apps/admin-web/src/modules/videos/services/videoService.ts`、`videoService.test.ts` | 前端 service | `/videos` 和详情工作台 API 封装 | P8/P8b/P9e 页面 smoke 和 tests | 必须纳入版本管理 |
| `apps/admin-web/src/modules/videos/model/videoP8View.ts`、`videoP8View.test.ts` | 前端 view model | 步骤式工作台映射 | P8/P9a-P9e 页面验收 | 必须纳入版本管理 |
| `apps/admin-web/src/pages/VideoDetailWorkbench.vue` | 前端页面 | P9a-P9e 主工作台 | P9e 收口复盘和 P9e-L1 后续治理 | 必须纳入版本管理 |
| `apps/api/prisma/migrations/20260626000000_add_video_artifact/migration.sql` | migration | P9b 旁白产物草案 | P9b-L1 / P9e 收口复盘提到 migration 草案 | 必须纳入版本管理，真实 DB 执行另行授权 |
| `apps/api/prisma/migrations/20260627000000_add_video_tts_artifact_fields/migration.sql` | migration | P9c 配音字段草案 | P9c/P9e 收口链路 | 必须纳入版本管理，真实 DB 执行另行授权 |
| `apps/api/prisma/migrations/20260710000000_add_video_render_export/migration.sql` | migration | P9e 渲染/导出草案 | P9e 收口复盘 | 必须纳入版本管理，真实 DB 执行另行授权 |
| `apps/api/prisma/video-artifact-migration.test.ts` | migration 测试 | schema/migration 一致性 | P9b-L1/P9e 验收风险 | 必须纳入版本管理 |
| `docs/reviews/video-p8-acceptance-closure-2026-06-23.md` | 验收文档 | P8 收口证据 | 文档本身 | 必须纳入版本管理 |
| `docs/reviews/video-p8b-acceptance-closure-2026-06-23.md` | 验收文档 | P8b 收口证据 | 文档本身 | 必须纳入版本管理 |
| `docs/reviews/video-p9e-acceptance-closure-2026-07-10.md` | 验收文档 | P9e 收口证据 | 文档本身 | 必须纳入版本管理 |
| `docs/superpowers/plans/*.md` | 研发计划 | P8b/P9b-L1/P9c 实施证据 | 当前未跟踪但被任务派发引用 | 主控决定保留原路径并纳入版本管理 |
| `apps/admin-web/src/modules/novels/model/highRiskConfirmation.ts`、`.test.ts` | 前端交互 helper/test | P1-HR1 高风险确认弹窗 | 工程质量记录 P1-HR1/P2-QA1 | 必须纳入版本管理 |
| `apps/admin-web/src/modules/novels/constants/createOptions.ts` | 前端常量 | 小说创建页配置抽取 | `NovelCreateWizard.vue` 已直接导入两组默认选项 | 归入小说创建向导并纳入版本管理 |

## 可忽略产物建议

- 已加入 ignore：`.playwright-cli/`，因为其内容是页面 smoke 产生的 console log 和 page yaml，属于本地运行产物。
- 已有 ignore 继续保留：`node_modules/`、`dist/`、`coverage/`、`.env*`、`apps/api/src/generated/prisma/`、`.superpowers/`。
- 不应 ignore：`apps/api/prisma/migrations/`、`packages/shared/src/videos.ts`、`apps/api/src/modules/videos/**`、`apps/admin-web/src/modules/videos/**`、`docs/reviews/**`、`docs/modules/**`、`docs/superpowers/plans/**`。这些是源码、契约、迁移、测试或审计证据。
- `apps/api/tsconfig.testrun.json` 不加入 ignore，也不纳入检查点：当前无脚本引用，输出目录指向 `/tmp/apidist2`，并单独排除一项测试，按一次性测试辅助文件处理；RP-00B 已执行独立安全删除，后续若需要类似配置必须纳管或生成后清理。

## 无法归因项与主控决策项

| 项目 | 风险 | 建议主控决策 |
| --- | --- | --- |
| `apps/api/tsconfig.testrun.json` | 无脚本引用，输出到 `/tmp`，且排除单项测试，属于一次性测试辅助 | RP-00B 决策删除；不纳入检查点、不加入 ignore |
| `docs/modules/novel-first-iteration-development-plan.md` | tracked modified 且跨多个小说包，单看文件名无法确认每段归属 | 保留文档；提交时按逻辑包审查 diff，无法安全拆分时以检查点整体纳入并附归因说明 |
| `docs/modules/video-task-package-8-detailed-design.md`、`video-task-package-9-detailed-design.md` | tracked modified，跨 P8/P9 多包演进 | 保留并纳入对应 P8/P9 检查点，提交说明中标明跨包演进 |
| `docs/superpowers/plans/*` | `.superpowers/` 被忽略，但 `docs/superpowers/plans` 不被忽略 | 保留原路径并纳入版本管理，作为实施计划和验收追溯证据 |
| `.playwright-cli/**` 历史产物 | 已被 ignore，但文件仍留在工作树磁盘上 | 本包不删除；如需清理，另派安全清理任务，禁止混入业务包 |
| mixed tracked modified 文件 | 多轮已验收任务共用同一文件，难以从当前 diff 自动拆出每包改动 | 后续采用“检查点 commit 或包级 patch 说明”策略，避免继续堆叠 |

## 后续研发包最小交付规则

### 2026-07-11 P10-preflight 补充检查点

主控在原检查点后新增了下一阶段需求与治理文档，均属于可审计资产，不是临时生成物：

- `docs/modules/novel-creation-source-contract.md`
- `docs/modules/novel-creation-source-implementation-package.md`
- `docs/modules/video-task-package-10-detailed-design.md`
- `docs/reviews/p10-preflight-creation-source-multi-agent-review-2026-07-11.md`
- `docs/reviews/p10-requirements-multi-agent-review-2026-07-11.md`
- `docs/reviews/main-control-status.md`
- `docs/development-coordination.md` 的长期目标跟进与需求多 Agent 评审门禁修订

补充盘点时共有 74 个 `git status --short` 顶层条目、44 个 tracked modified 文件和 38 个未忽略的 untracked 文件。新增文档已完成归因但仍未暂存/提交；不得把“已归因”表述为“已纳入版本管理”。

### 2026-07-11 creationSource 收口补充

`CS-R3` 与条件项定向复验已经通过，以下资产归入 creationSource 前置包并必须纳入检查点：

- `apps/admin-web/src/modules/novels/constants/createOptions.ts`
- `apps/admin-web/src/modules/novels/constants/createOptions.test.ts`
- `apps/admin-web/src/pages/NovelCreateWizard.vue`
- `apps/admin-web/src/pages/NovelList.vue`
- `apps/admin-web/src/pages/NovelDetailWorkbench.vue`
- `apps/admin-web/src/modules/novels/model/novelTypes.ts`
- `apps/admin-web/src/modules/novels/services/novelService.ts`
- `apps/admin-web/src/modules/novels/services/novelService.test.ts`
- `packages/shared/src/novels.ts`
- `packages/shared/src/contracts.test.ts`
- `apps/api/src/modules/novels/integrations/hotspotReferenceGateway.ts`
- `apps/api/src/modules/novels/domain/novelDomain.ts`
- `apps/api/src/modules/novels/services/novelService.ts`
- `apps/api/src/modules/novels/routes/novelRoutes.ts`
- `apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts`
- `apps/api/src/modules/novels/repositories/prismaNovelRepository.ts`
- `apps/api/src/modules/novels/novelRoutes.test.ts`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260711000000_add_novel_creation_source/migration.sql`
- `apps/api/prisma/novel-creation-source-migration.test.ts`
- `docs/modules/novel-creation-source-contract.md`
- `docs/modules/novel-creation-source-implementation-package.md`
- `docs/reviews/p10-preflight-creation-source-multi-agent-review-2026-07-11.md`
- `docs/reviews/creation-source-acceptance-closure-2026-07-11.md`

条件项修复仅增加可见不可用说明和对应前端测试，未接热点管理、P10/P12、真实数据库或真实 provider。`apps/api/tsconfig.testrun.json` 后续在 RP-00B 完成归因并删除，不纳入检查点。

### 2026-07-11 检查点落地结果

- 分支：`codex/aishortvideo-checkpoint-20260711`
- 远程：`origin/codex/aishortvideo-checkpoint-20260711`
- 提交：`26f1bc9 feat: checkpoint novel and video workbenches`
- 纳管范围：89 个已验收/已归因文件，共 31,784 行新增、595 行删除。
- 提交前门禁：shared 12/12、API 108/108、admin-web 77/77、typecheck、build budget、Prisma validate、staged diff check 全部通过。
- 排除项：`apps/api/tsconfig.testrun.json` 在本检查点阶段继续保持未跟踪、未忽略、未纳管；后续 RP-00B 已独立删除；未使用 reset、clean、stash 或覆盖式整理。

本文前半部分“未纳入版本管理”和“未执行 git add/commit/push”描述的是最初归因盘点阶段；本节是最新状态，发生冲突时以本节和 `docs/reviews/main-control-status.md` 为准。

### 2026-07-12 P10-R0 收口补充

P10-R0 的研发业务 diff 严格限制为：

- `packages/shared/src/videos.ts`
- `packages/shared/src/api.ts`
- `packages/shared/src/contracts.test.ts`

主控同步修改正式需求、评审和状态文档，并新增 `docs/reviews/video-p10-r0-acceptance-closure-2026-07-12.md`。独立验收确认 `apps/api/src`、`apps/api/prisma`、`apps/admin-web` 无本包 diff；`apps/api/tsconfig.testrun.json` 当时仍是既有一次性未跟踪文件，不纳入 R0 检查点，后续由 RP-00B 删除。

每个研发包完成时，至少交付以下检查点，避免再次出现已验收资产未归因：

1. 开始前记录 `git status --short`，说明哪些文件是前置脏状态。
2. 汇报中按 `backend / frontend / shared / prisma / docs / tests / generated` 分组列出实际改动文件。
3. 对新增 untracked 源码、迁移、测试、文档逐项标明“必须纳入版本管理”或“可忽略产物”，不得只写目录。
4. 如修改已脏文件，尽量说明本包新增改动和前置改动的边界；无法拆分时明确写“混合变更，待主控审查”。
5. 迁移文件、shared DTO、route schema、service/repository、页面工作台和验收文档必须作为关键资产显式列出。
6. 验证证据至少包含命令、结果、失败是否为既有风险；前端包如涉及页面，需要补 smoke 摘要。
7. 不把 `.env`、真实数据库、真实 provider、P10 发布/上传/回填等越界内容混入普通研发包。
8. 不使用 `git reset`、`checkout`、`clean`、`stash` 处理共享工作树；如需清理，单独派治理任务。
9. 新增 ignore 规则前必须证明其只覆盖构建/运行产物，不会隐藏源码、迁移、测试或文档。
10. 包收口前再次运行 `git status --short`，确认新增文件都已归因。

## 本次治理边界

- 未修改小说或视频业务代码。
- 未修改 API、状态机、测试语义或 Prisma schema。
- 未读取 `.env`、API Key 或数据库连接串。
- 未运行真实 MySQL、真实 provider、发布、上传、平台回填或 P10 相关流程。
- 未执行 `git add`、`commit`、`push`、`reset`、`checkout`、`clean`、`stash`。
