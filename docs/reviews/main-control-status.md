# AIShortvideo 主控统一状态

更新时间：2026-07-13 01:43 CST

本文件是需求主控的当前状态入口。历史过程和详细证据仍保留在各模块设计、验收和工程质量文档中；发生冲突时，以当前代码、最新正式验收结论和本文件列出的证据为准。

主控采用长期目标驱动，在会话恢复或收到研发、测试、验收、质量进展时更新；不使用定时器。

## 0. 状态单源规则

- 本文件只记录当前主控状态、当前唯一推荐动作、当前环境边界和当前证据入口；不再追加长篇历史过程。
- 历史过程、派发、验收、返工和收口事件进入独立事件账本：`docs/reviews/main-control-event-ledger.md`。
- `docs/remediation/issue-ledger.md` 是整改问题状态唯一事实源；本文件不得单独把问题改写为 `closed`。
- 旧巡检、旧验收、旧复盘和旧状态文档只作为证据来源；当它们与本文件或 issue ledger 冲突时，不能覆盖当前状态，必须先由 MC 形成新的事件账本记录和总账更新。
- 主控收口必须同时引用：当前状态、事件账本事件、唯一问题总账行、验收矩阵 acceptance id、关闭证据草稿或正式关闭记录。

## 1. 总体判断

| 维度 | 当前状态 | 主控判断 |
| --- | --- | --- |
| 小说核心流程 | mock/in-memory 主流程可演示，已知个案已定向修复 | 已有创建草稿 backend 浏览器 E2E 基线，但不是全链；真实 Prisma 后半程未实现、全书审稿未输入正文，仍有 2 个未关闭 P0 |
| 视频 P8-P9 | 工作台状态流与版本流程按限定范围验收 | P9c 无可播放音频，P9e 无真实 MP4/下载文件；不能称为真实视频生成闭环 |
| P10-preflight | 已正式收口 | `creationSource` 的 shared/API/仓储/migration/admin 与浏览器链路通过 `CS-R3` 及条件项复验 |
| P10 | `P10-R0` 已正式收口；R1 准入设计通过 | R1 准入文档已纳入当前远程分支；尚未授权，未启动业务代码 |
| 整改计划 | RP-00A、RP-00B、RP-01A 已正式关闭 | 唯一总账已关闭 7/42；下一步按依赖进入 RP-01B，全部关闭前不进入新需求 |
| 测试 | 206 项低层自动化、typecheck 与 RP-01A E4 浏览器基线通过 | 已纳管首条真实本地 backend 浏览器 E2E；仍不能外推真实 DB/provider/media |
| 工程质量 | `review / high` | 发现小说真实完本与全书审稿 2 个 P0；检查点已止血，包级提交防复发机制未关闭 |
| 本地服务 | 未运行 | `5173`、`3001` 当前无监听；用户需要浏览器验收时按需启动 |
| 真实环境 | 冻结/待授权 | P8b-L1b、真实 DeepSeek/provider、外部渲染/云存储均无当前授权 |

## 2. 小说模块

### 已确认关闭（限定范围）

- 小说从方向、设定、大纲、章节目录、试写到正文批次的多个已知交互问题已完成定向修复；若干项仍是“实现待验”，不能整体表述为产品闭环已关闭。
- `body_batch_generate` 已具备任务预占、同幂等复用、冲突阻断和保存失败固定状态回归证据。
- Prisma 正文真实写路径未实现时会在 provider 调用前明确阻断，不先消耗模型。
- 创建向导复合 radio 可访问性问题已通过。

### 当前阻塞

- P0：Prisma 正文批量、重写、正文采用、全书审稿和完结确认未形成真实 MySQL 完整链路。
- P0：全书审稿只接收章节元数据，没有章节正文、分层摘要或连续性记忆，当前审稿结果不可作为质量门禁。
- P1：方向生成和首次试写仍可能在 provider 调用前缺少原子任务预占；通用重试没有 worker 消费。
- P1：章节目录只有顺序分块，没有持久 checkpoint 和失败段续跑。
- P1：正文目标字数、长期记忆和真实 DeepSeek 稳定性未形成质量门禁。

### 已完成资产

- `creationSource` 已完成：UI、请求、校验、权威持久化、列表/详情回显和刷新恢复已贯通。
- 正式合同：`docs/modules/novel-creation-source-contract.md`。
- 开工包：`docs/modules/novel-creation-source-implementation-package.md`。
- 正式验收：`docs/reviews/creation-source-acceptance-closure-2026-07-11.md`。
- 当前没有热点查询模块，因此生产运行态继续禁用引用热点并直接显示不可用原因；不得硬编码假数据。

### 下一触发动作

- 暂缓 `P10-R1`，不得按编号自动继续。
- `RP-00A`、`RP-00B`、`RP-01A` 已完成独立复核、主控裁决和远程推送；下一步按依赖推进 `RP-01B`，真实 MySQL 所属 `RP-01D` 继续等待独立授权。

## 3. 视频模块

### 已确认关闭（限定范围）

- P8/P8b/P9a-P9e 的 shared、API、in-memory/mock、前端工作台和静态 Prisma/migration 合同已按各包限定口径验收。
- P9e-L1 可访问性和路由懒加载已通过。
- P9e-L2 已建立 admin build budget：entry <= 1.10 MB、route chunk <= 200 kB，并精确管控已知第三方 warning 指纹。
- P9 内容暴露与脱敏合同已在 shared/API/admin 三层补强；旁白和字幕 `contentText` 仅作为用户可编辑业务资产保留。

### 当前边界

- P9b 只完成旁白版本工作台；P9c 没有真实或 mock 可播放音频；P9d 没有真实时间戳、SRT/VTT 或音画对齐；P9e 没有真实 MP4、播放器、文件服务或下载文件。
- 当前只能称“状态流与占位记录”，不能称“mock/local 媒体生成闭环”。
- 没有真实外部 TTS、字幕工具、渲染、云存储、上传或平台发布。
- P10 只设计人工发布事实记录、冻结快照和手动 24h/48h 回填，不做自动上传、平台 API/token、定时器或 P12 看板。

### 下一触发动作

- `creationSource` 与 `P10-R0` 均已正式验收收口。
- R0 已冻结 shared DTO、枚举、错误码、安全摘要、脱敏规则、纯时间函数与合同测试；没有实现 route/service/repository/Prisma/UI。
- 正式验收：`docs/reviews/video-p10-r0-acceptance-closure-2026-07-12.md`。
- `P10-R1` 已完成产品、后端架构、独立测试和工程质量多会话只读评审，当前未授权、未实现；准入包为 `docs/modules/video-p10-r1-implementation-package.md`，评审记录为 `docs/reviews/p10-r1-multi-agent-review-2026-07-12.md`。
- 没有真实 MP4 前，主控不建议启动 `P10-R1`；小说 P0 关闭后优先评估 P9-real 单视频金丝雀。

## 4. 测试与验收

- 全栈研发会话：`RP-01A` 四轮定向返修已完成，当前 idle。
- 独立测试/质量 agent：`TEST-E2E-BOOTSTRAP-01` 最终均 approved，P0/P1 为 0。
- `P10-R1` 验收准备保留，但当前不是推荐开工项。
- 五类专业复盘与二次复盘已完成；执行状态以 `docs/remediation/issue-ledger.md` 为唯一事实源。
- 每个研发包完成后必须由测试会话独立验收，研发自测不能替代正式结论。
- 浏览器验收必须检查真实 Network/API 状态与刷新恢复，不能只看按钮 loading 或页面 banner。

## 5. 工程质量与工作树

- 最新工程质量：二次复盘归并 42 项 PB/RB/QG/DEBT 和专项验证缺口；`RP-00A`、`RP-00B`、`RP-01A` 已关闭 6 项 QG 和 1 项 DEBT，当前关闭 7/42。
- `.playwright-cli/` 已安全忽略；源码、migration、测试和文档未被 ignore。
- 已创建并推送检查点分支 `codex/aishortvideo-checkpoint-20260711`；P10-R0 检查点 `68957be` 及后续 R1 准入文档均纳入该远程分支。
- RP-00B 的 `Remediation governance` 已在远程 push runs `29196618102`、`29196969050` 成功执行，Git 预算与 SLA 门禁不再只有本地证据。
- RP-01A 已在远程 clean checkout runs `29202209121`、`29202209111` 通过治理与真实 backend E2E；guard 13/13，远程 artifact 仅含 4 个安全摘要文本且敏感模式 0 命中。
- 工程质量任务已对远程检查点执行一次性只读复核：本地与 upstream 同步，未发现敏感信息、浏览器产物、一次性配置或 P10/P12 可执行越界误纳管，结论为 `passed`，无 P0/P1。
- 一次性 `apps/api/tsconfig.testrun.json` 已由 RP-00B 完成归因和安全删除，未加入 ignore；独立 TEST/QUALITY 已复核。`.playwright-cli/` 继续作为本地浏览器运行产物忽略。
- `docs/modules/video-p10-r1-implementation-package.md` 与多会话评审记录已安全归因并纳入远程基线；它们是需求资产，不是已授权业务实现。
- 禁止在共享工作树使用 reset、checkout、clean、stash 或覆盖式整理。

证据：

- `docs/reviews/full-project-retrospective-v2-2026-07-12.md`
- `docs/remediation/issue-ledger.md`
- `docs/remediation/remediation-program.md`
- `docs/remediation/acceptance-matrix.md`
- `docs/reviews/engineering-quality-watch.md`
- `docs/reviews/main-control-event-ledger.md`
- `docs/reviews/remediation-rmd-test-evidence-001-closure-2026-07-12.md`
- `docs/reviews/remediation-rmd-gov-status-001-closure-2026-07-12.md`
- `docs/reviews/remediation-rmd-gov-stage-001-closure-2026-07-12.md`
- `docs/reviews/remediation-rmd-gov-git-001-closure-2026-07-12.md`
- `docs/reviews/remediation-rmd-gov-sla-001-closure-2026-07-12.md`
- `docs/reviews/remediation-rmd-gov-temp-001-closure-2026-07-12.md`
- `docs/reviews/remediation-rp-00b-dispatch-receipt-2026-07-12.md`
- `docs/reviews/remediation-rmd-test-e2e-001-closure-2026-07-12.md`
- `docs/reviews/remediation-rp-01a-dispatch-receipt-2026-07-13.md`
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

1. `RP-00A`、`RP-00B`、`RP-01A` 已正式关闭；下一步按依赖派发 `RP-01B Vue DOM/event runner`。
2. `RP-01D` 涉及真实 MySQL，只能在安全环境和用户独立授权后执行；管理分组不得整体派发。每个子包独立研发、测试、关闭、commit 和 push。
3. 小说真实完本金丝雀通过后，再执行 P9-real；P10-R1 只在 `RP-10` 重新决策。
4. 继续保持真实 DB/provider、外部媒体和平台发布的独立授权门禁。

不得提前执行尚未满足依赖的子包、`P9-real`、`P10-R1`、CS-L1、真实 MySQL/provider 或外部发布能力。
