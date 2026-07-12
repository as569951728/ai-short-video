# AIShortvideo 主控统一状态

更新时间：2026-07-12 13:09 CST

本文件是需求主控的当前状态入口。历史过程和详细证据仍保留在各模块设计、验收和工程质量文档中；发生冲突时，以当前代码、最新正式验收结论和本文件列出的证据为准。

主控采用长期目标驱动，在会话恢复或收到研发、测试、验收、质量进展时更新；不使用定时器。

## 1. 总体判断

| 维度 | 当前状态 | 主控判断 |
| --- | --- | --- |
| 小说核心流程 | 已完成既有 mock/local 与真实模型人工验收问题修复链 | 正文批次旧 P1 和 `save_failed` 已关闭；继续由独立小说验收会话接收用户反馈 |
| 视频 P8-P9 | P8/P8b/P9a-P9e mock/local 已验收 | 已停在本地导出记录，不等于真实渲染、上传或发布 |
| P10-preflight | 已正式收口 | `creationSource` 的 shared/API/仓储/migration/admin 与浏览器链路通过 `CS-R3` 及条件项复验 |
| P10 | `P10-R0` 已正式收口；R1 准入设计通过 | R1 准入文档已纳入当前远程分支；尚未授权，未启动业务代码 |
| 测试 | 当前空闲 | R0 正式验收及唯一阻塞项定向复验已通过 |
| 工程质量 | `watch / medium` | 无新增 P0/P1；89 个已验收/已归因文件已纳入远程检查点，仅保留 1 个一次性未归因辅助文件 |
| 本地服务 | 未运行 | `5173`、`3001` 当前无监听；用户需要浏览器验收时按需启动 |
| 真实环境 | 冻结/待授权 | P8b-L1b、真实 DeepSeek/provider、外部渲染/云存储均无当前授权 |

## 2. 小说模块

### 已确认关闭

- 小说从方向、设定、大纲、章节目录、试写到正文批次的关键交互问题已完成多轮人工验收和定向修复。
- `body_batch_generate` 已具备任务预占、同幂等复用、冲突阻断和保存失败固定状态回归证据。
- Prisma 正文真实写路径未实现时会在 provider 调用前明确阻断，不先消耗模型。
- 创建向导复合 radio 可访问性问题已通过。

### 当前研发项

- `creationSource` 已完成：UI、请求、校验、权威持久化、列表/详情回显和刷新恢复已贯通。
- 正式合同：`docs/modules/novel-creation-source-contract.md`。
- 开工包：`docs/modules/novel-creation-source-implementation-package.md`。
- 正式验收：`docs/reviews/creation-source-acceptance-closure-2026-07-11.md`。
- 当前没有热点查询模块，因此生产运行态继续禁用引用热点并直接显示不可用原因；不得硬编码假数据。

### 下一触发动作

- `P10-R0` 已正式验收收口；不得自动继续 `P10-R1`。
- 用户继续人工验收：按需启动前端/API，先恢复可验收 fixture，再进入浏览器。

## 3. 视频模块

### 已确认关闭

- P8/P8b/P9a-P9e 的 shared、API、in-memory/mock、前端工作台和静态 Prisma/migration 合同已按各包口径验收。
- P9e-L1 可访问性和路由懒加载已通过。
- P9e-L2 已建立 admin build budget：entry <= 1.10 MB、route chunk <= 200 kB，并精确管控已知第三方 warning 指纹。
- P9 内容暴露与脱敏合同已在 shared/API/admin 三层补强；旁白和字幕 `contentText` 仅作为用户可编辑业务资产保留。

### 当前边界

- P9 的配音、字幕、渲染和导出仍为 mock/local。
- 没有真实外部 TTS、字幕工具、渲染、云存储、上传或平台发布。
- P10 只设计人工发布事实记录、冻结快照和手动 24h/48h 回填，不做自动上传、平台 API/token、定时器或 P12 看板。

### 下一触发动作

- `creationSource` 与 `P10-R0` 均已正式验收收口。
- R0 已冻结 shared DTO、枚举、错误码、安全摘要、脱敏规则、纯时间函数与合同测试；没有实现 route/service/repository/Prisma/UI。
- 正式验收：`docs/reviews/video-p10-r0-acceptance-closure-2026-07-12.md`。
- P10 各包必须继续使用产品、架构、测试已确认的正式需求和阻塞门禁。
- `P10-R1` 已完成产品、后端架构、独立测试和工程质量多会话只读评审，当前未授权、未实现；准入包为 `docs/modules/video-p10-r1-implementation-package.md`，评审记录为 `docs/reviews/p10-r1-multi-agent-review-2026-07-12.md`。

## 4. 测试与验收

- 全栈研发会话：`P10-R0` 已完成，当前 idle。
- 测试会话：`P10-R0` 正式验收与定向复验已通过，当前 idle。
- 小说验收会话：当前 idle，最近只参与 `creationSource` 产品复核，不存在新的人工验收阻塞。
- 每个研发包完成后必须由测试会话独立验收，研发自测不能替代正式结论。
- 浏览器验收必须检查真实 Network/API 状态与刷新恢复，不能只看按钮 loading 或页面 banner。

## 5. 工程质量与工作树

- 最新工程质量：`status=watch`，`debt_level=medium`，无新增 P0/P1。
- `.playwright-cli/` 已安全忽略；源码、migration、测试和文档未被 ignore。
- 已创建并推送检查点分支 `codex/aishortvideo-checkpoint-20260711`；P10-R0 检查点 `68957be` 及后续 R1 准入文档均纳入该远程分支。
- 工程质量任务已对远程检查点执行一次性只读复核：本地与 upstream 同步，未发现敏感信息、浏览器产物、一次性配置或 P10/P12 可执行越界误纳管，结论为 `passed`，无 P0/P1。
- 一次性 `apps/api/tsconfig.testrun.json` 不纳入检查点；`.playwright-cli/` 继续作为本地浏览器运行产物忽略。
- `docs/modules/video-p10-r1-implementation-package.md` 与多会话评审记录已安全归因并纳入远程基线；它们是需求资产，不是已授权业务实现。
- 禁止在共享工作树使用 reset、checkout、clean、stash 或覆盖式整理。

证据：

- `docs/reviews/engineering-quality-watch.md`
- `docs/reviews/worktree-attribution-checkpoint-2026-07-11.md`
- `docs/reviews/video-p9e-acceptance-closure-2026-07-10.md`

## 6. 环境风险

| 风险 | 状态 | 允许动作 |
| --- | --- | --- |
| P8b-L1b 真实 MySQL/Prisma live smoke | 待安全环境和明确授权 | 保持安全阻断；不能把 static/in-memory 结果当真实写路径 |
| 真实 DeepSeek/provider smoke | 待明确授权和安全密钥边界 | 普通自动化不得读取 `.env` 或真实 key |
| 真实外部 TTS/字幕/渲染/云存储 | 未授权 | 不接入、不执行、不宣称通过 |
| 平台上传/发布/API/token | P10 明确不做 | 仅可设计人工发布记录；不得出现自动执行入口 |
| 本地前端/API 服务 | 当前停止 | 用户要求验收时按需启动并先检查 health/fixture |

## 7. 当前唯一推荐动作

1. 等用户单独授权 `P10-R1` 后，才允许实现发布记录、冻结快照、幂等、门禁、in-memory 和 Prisma migration draft。
2. 继续保持 P8b-L1b、真实 provider、外部渲染和平台发布能力的授权门禁。

不得提前执行 `P10-R1`、CS-L1、真实 MySQL/provider 或外部发布能力。
