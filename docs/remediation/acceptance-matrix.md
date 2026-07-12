# AIShortvideo 整改验收矩阵

状态：frozen_for_remediation

问题源：`docs/remediation/issue-ledger.md`

## 1. 统一验收输出

每次验收必须先输出：

```text
package_id:
issue_ids:
acceptance_ids:
user_goal_status: passed | failed | partial
evidence_level:
environment:
evidence_buckets:
  contract:
  unit:
  API:
  DB:
  browser:
  provider:
  media:
not_proven:
conclusion: approved | needs_revision | blocked
```

通用阻塞条件：

- 没有可重放命令、trace、请求响应摘要或媒体文件证据。
- 用 mock/in-memory/static 替代要求的真实 provider/DB/media。
- 只证明接口成功，没有证明用户结果可见和可继续。
- 刷新、重复点击、并发、失败或重启后状态不一致。
- 测试通过但工作树、migration、提交或远程状态不清楚。
- 需要的证据桶未逐项填写，或把 `N/A` 用作逃避验证而没有说明原因。

## 2. 小说数据库与版本

| 验收 ID | 前置环境 | 核心操作与断言 | 最低证据 | 阻塞条件 |
| --- | --- | --- | --- | --- |
| NOV-DB-E2E-01 | 受控 MySQL、Prisma、固定小说 fixture | 从创建到方向、设定、大纲、目录、试写、正文、审稿、完结；重启后资产与状态保持 | E6 + browser trace | 任一阶段回退 in-memory、not implemented、数据丢失 |
| NOV-CURRENT-01 | MySQL，并发客户端 | 对同类型两个候选并发采用；事务结束后只能有一个 current，旧版本为 historical | E6 | 两个 current、丢历史、后写静默覆盖 |
| NOV-PROVENANCE-01 | mock 与真实 provider 样本 | 检查 provider/model/promptVersion/inputTokens/outputTokens/sourceVersionRefs；不得把真实结果标为 mock | E5/E6 | provenance 缺失、伪造或泄露敏感原文 |

## 3. 小说 AI 与内容质量

| 验收 ID | 前置环境 | 核心操作与断言 | 最低证据 | 阻塞条件 |
| --- | --- | --- | --- | --- |
| NOV-REVIEW-QUALITY-01 | 含故意冲突正文的完本 fixture | 全书审稿必须接收正文分层摘要、角色记忆和章节审稿；识别预置冲突 | E5 | 只输入元数据、无法识别基准冲突 |
| NOV-JSON-01 | malformed 响应集 | 覆盖代码块、尾随文本、截断、非法转义、缺字段、超长数组；可修复或安全失败 | E2 + E5 抽样 | 暴露内部 taskName/原文；错误资产被采用 |
| NOV-PLAN-RESUME-01 | 60/80 章 fixture、分块失败注入 | 每块持久化；中间块失败只重试该块；最终章节号连续、唯一、完整 | E3 + E5 | 已完成块重算、缺章、重复或整体丢失 |
| NOV-BATCH-RESUME-01 | 正文批次和中断注入 | 每章生成即 checkpoint；中断后从首个未完成章继续 | E3 + E6 | 已生成章节丢失、整批重算 |
| NOV-MEMORY-01 | 有跨章事实的连续性 fixture | 下一章 provider payload 包含更新后的长期记忆；故意冲突能被阻止或发现 | E2 + E5 | memory 未入 payload、连续性基准失败 |
| NOV-LENGTH-01 | 多目标字符数样本 | UI 明确字符数口径；结果落在容差内；过短自动续写或失败 | E2 + E5 | 只校验非空、严重短文可采用 |
| NOV-ERROR-01 | timeout/rate/quota/network/format/config 注入 | 页面显示可理解分类、requestId 和恢复建议；安全详情不含密钥/prompt/raw | E3 + E4 | 笼统失败、内部名或敏感信息泄露 |
| NOV-DEEPSEEK-LIVE-01 | 明确授权的 DeepSeek + MySQL | 固定样本覆盖短 JSON、长 JSON、章节目录、正文、超时和重试；记录耗时与 inputTokens/outputTokens 用量；浏览器验证刷新恢复、失败重试和结果定位 | E5 + E6 + browser E7 | 仅 inject/in-memory；无浏览器 trace 或脱敏报告 |
| TEST-NOVEL-QUALITY-01 | 版本化基准集 | 评估字数、重复率、人物一致性、连续性、爽点和钩子；阈值可解释 | E2 + 人工复核 | 只有 JSON schema，无内容质量判断 |

## 4. 小说候选与交互

| 验收 ID | 核心操作与断言 | 最低证据 | 阻塞条件 |
| --- | --- | --- | --- |
| NOV-CANDIDATE-01 | 编辑候选生成新版本，原版本保留，刷新后内容保持 | E4/E6 | 静默覆盖、刷新丢失 |
| NOV-CANDIDATE-02 | 优化必须填写 instruction；保存 baseVersionId；结果回显目标与差异 | E4 | 空指令可提交、无法追溯来源 |
| NOV-CANDIDATE-03 | 融合返回 resultId；页面自动滚动、高亮并展示来源版本 | E4 | 只 toast/刷新，用户找不到结果 |
| NOV-CANDIDATE-04 | 采用后同类型只有一个 current，旧版历史化 | E4 + NOV-CURRENT-01 | 两个当前版本或视觉混淆 |
| NOV-CANDIDATE-05 | 采用后自动进入正确下一子步骤，刷新后路由与推荐动作一致 | E4 | 成功后无下一步或回到旧阶段 |
| NOV-CANDIDATE-06 | “查看结果”改变 URL/步骤/目标 ID/滚动位置，高亮至少 2 秒 | E4 | 点击无可观察效果 |
| NOV-AI-CTA-01 | 章节目录、生成第 1 章、继续试写等主 CTA 点击后立即出现 taskId/任务态，完成后定位结果并给出下一步 | E4 | 点击无效果、只有本地 loading、完成后无结果/下一步 |
| NOV-PREFERENCE-01 | 题材/爽点可配置或自定义；停用值保留历史；模型读取权威配置 | E3/E4 | 新选项必须改前端代码、历史值损坏 |

## 5. 统一任务平台

| 验收 ID | 核心操作与断言 | 最低证据 | 阻塞条件 |
| --- | --- | --- | --- |
| TASK-PRECLAIM-01 | 请求在 provider 前原子创建/复用 processing task，并快速返回 taskId | E3 | provider 先调用、失败后才建任务 |
| TASK-CONCURRENCY-01 | 10 个相同并发请求只触发一次 provider；不同指纹冲突 | E3/E6 | 重复调用或产生多个候选 |
| TASK-WORKER-01 | HTTP 返回后 worker 执行；状态 queued→processing→terminal | E3 | 请求线程内长期 await、无消费者 |
| TASK-RESTART-01 | processing 时重启 API/worker；任务恢复或明确失败并可重试 | E3/E6 | 永久 processing、状态丢失 |
| TASK-RETRY-01 | failed 任务重试后真实执行并完成/再次失败，关联原任务 | E3 | 只新增 queued 记录 |
| TASK-CANCEL-01 | 区分停止本页等待、取消任务、放弃结果、重新生成；迟到结果不成为 current | E4/E6 | 文案和后端状态不一致 |
| TASK-SURFACE-01 | 主卡片、最近任务、抽屉、路由和刷新后任务 ID/状态一致 | E4 | 任一表面显示旧状态 |

## 6. 视频数据库与媒体

| 验收 ID | 前置环境 | 核心操作与断言 | 最低证据 | 阻塞条件 |
| --- | --- | --- | --- | --- |
| VID-DB-MIGRATE-01 | 空 MySQL | 从零 migrate P8-P9 表，seed、读写、重启恢复 | E6 | 依赖手工旧表、migration 断链 |
| VID-DB-CONCURRENCY-01 | MySQL，并发客户端 | current、version、idempotency、tenant 并发验证 | E6 | 重复 current、版本冲突、跨租户 |
| VID-NARRATION-01 | 授权 provider | 基于来源版本生成旁白候选，记录 provider 和失败恢复 | E5/E6 | repository 固定 mock 文本被当真实结果 |
| VID-AUDIO-01 | TTS provider、浏览器 | 生成真实音频；HTTP MIME、非零大小、时长正确；audio 可播放 | E5 + browser E7 | 只有 URL 字符串或占位提示 |
| VID-SUBTITLE-01 | 真实音频 | 生成带时间戳 SRT/VTT；抽样验证字幕与语音同步 | media E5 | 字符串分行、无时间戳 |
| VID-MP4-01 | render provider、media storage | 生成真实 MP4；video 可播放，时长/分辨率/版本引用正确 | media E5 + browser E7 | mock 路径、无文件 |
| VID-DOWNLOAD-01 | 文件服务 | 下载 200、`video/mp4`、非零文件；hash 与预览产物一致 | media E5 | mock://、不存在 URL |
| VID-P9-REAL-E2E-01 | 真实小说/章节引用、媒体 provider、MySQL、浏览器 | 从待视频化小说进入视频工作台，依次完成旁白、音频、字幕、渲染、播放和下载；刷新与服务重启后仍可取回同一版本 | E5 + E6 + browser E7 | 只能分别证明单项；链路断裂、版本错位或重启丢失 |
| VID-TASK-01 | 持久 VideoTask/worker | 渲染时刷新、取消、重试、重启；旧来源结果不得回写 current | E6/E7 | 同步 terminal 模拟、固定进度 100 |
| VID-CAPABILITY-LABEL-01 | 视频工作台 | 首屏分别标真实/mock/占位；不可用能力无伪请求 | E4 | 用户会把记录理解为媒体文件 |
| P10-ROUTE-DECISION-01 | 小说和 P9-real 已验收 | 比较 P10-R1 用户价值、成本、依赖和风险，形成用户授权记录 | E0 decision | 未有真实 MP4 就自动启动 P10 |

## 7. 测试基础设施

| 验收 ID | 核心操作与断言 | 最低证据 | 阻塞条件 |
| --- | --- | --- | --- |
| TEST-E2E-BOOTSTRAP-01 | 单命令启动 API/admin/fixture，运行至少一条真实 backend 浏览器流程并清理 | E4 + automated script | 依赖手工状态、仅截图无脚本 |
| TEST-DOM-01 | Vue DOM 测试覆盖 click 参数、disabled、dialog、focus 与滚动目标 | E2 + DOM runner | 仍只测 view-model |
| TEST-FIXTURE-01 | fixture 工厂可确定性产生 processing/failed/stale/conflict/restart 等状态 | E2/E3 + deterministic factory | 失败状态靠临时手改 |
| TEST-MYSQL-01 | 安全授权后执行 migrate、seed、并发、rollback、restart；输出脱敏摘要 | E6 | 只验证 SQL 文本或 DATABASE_URL_MISSING |
| TEST-EVIDENCE-LEVEL-01 | 验收模板强制分列 contract/unit/API/DB/browser/provider/media 与 not_proven | E1 + template regression | 结论只写“通过” |

## 8. 工程与治理

| 验收 ID | 核心操作与断言 | 最低证据 | 阻塞条件 |
| --- | --- | --- | --- |
| GOV-GIT-01 | 每包独立 commit/push；超过 20 文件或 2,000 行需 ADR；upstream 对齐 | E1 + Git hook/CI check | 跨两个已验收包继续累积 |
| GOV-STATUS-01 | main-control 只保留当前状态；历史进入事件账本；旧巡检不得覆盖 | E1 + consistency check | 同一文件互相冲突 |
| GOV-SLA-01 | 研发完成 15 分钟内派测试；测试结论 30 分钟内收口/返工；超时留原因 | E1 + dispatch receipts | 用户再次提醒才推进 |
| GOV-TEMP-01 | `tsconfig.testrun.json` 有 owner、处理决定和 Git 证据 | E1 + clean-worktree check | 永久未归因例外 |
| GOV-STAGE-01 | 协作文档明确整改冻结期和重开门禁 | E1 + independent review | 仍写研发前或自动继续下一包 |
| ARCH-SPLIT-01 | 巨型文件按任务/AI/媒体子域定向拆分，依赖方向不倒置，回归通过 | E2 + dependency check + full regression | 无目标全量重构或继续膨胀 |

## 9. 专项审计

| 验收 ID | 必须输出 | 关闭条件 |
| --- | --- | --- |
| AUD-SEC-01 | route/service/repository tenant 与权限矩阵、越权测试、敏感字段扫描 | 所有入口通过或确认缺陷已另立 ID 并关闭 |
| AUD-OPS-01 | 环境矩阵、health、migration 顺序、回滚演练、故障恢复 | 流程可执行且有演练证据 |
| AUD-OBS-01 | 任务 SLI/SLO、日志字段、dashboard/查询、卡死告警 | 能定位失败阶段与关联 taskId |
| AUD-COST-01 | 模型/音频/字幕/渲染/存储单位成本、预算、限流和超额策略 | 真实金丝雀在预算内 |
| AUD-DR-01 | 备份范围、恢复步骤、RPO/RTO、恢复校验 | 完成一次受控恢复演练 |
| AUD-A11Y-01 | 键盘、焦点、screen reader、窄屏和长文本报告 | P0/P1 问题关闭 |
| AUD-SUPPLY-01 | 漏洞、许可证、锁文件、Node/runtime 和可重复构建报告 | 无未处置高危项 |

## 10. 关闭规则

安全记录规则：`tokenUsage`、`inputTokens`、`outputTokens` 仅表示模型用量；任何验收、日志和关闭证据都不得记录 API key、provider token、DATABASE_URL、Cookie、credential 或完整敏感 URL。

1. TEST 输出 approved 不自动修改总账。
2. MC 检查关闭模板、commit、远程和 not_proven 后才更新为 `closed`。
3. 原问题个案通过但系统机制未达到本矩阵时，状态仍为 `partial`。
4. verification gap 审计发现新问题时，先创建唯一 ID，再关闭审计 ID。
5. 任一关闭证据不可复现，问题重新打开。
