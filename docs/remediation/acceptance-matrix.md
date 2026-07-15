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
| TASK-PRECLAIM-01 | 分阶段验收：RP-02A 证明 provider 前原子创建/复用 task；B2a0 风险参数同步前置校验由 `2da6d31` 固定；B2a1 registry/strict ABI 与公开 retry freeze 已由 accepted head `4817abc` 和 `docs/reviews/remediation-rmd-task-002-003-rp-02b2a1-verification-2026-07-15.md` 提供 E3 阶段证据，`0a583c8` 因最终质量 P1 已拒绝且不得引用为通过证据，不外推 authority claim；B2a2 按 `TASK-B2A2-ACTOR-REPLAY-01`、`TASK-B2A2-AUTHORITY-01`、`TEST-B2A2-COMMAND-01` 证明 authenticated resolver actor、persisted requestedAt T0/T1 replay、canonical envelope、action-specific sourceVersionRefs 和 provider 前 authority gate，禁止把 capability、lease、finalize、202 或 E6 误归 B2a2。B2a3-B2a5 只补 checkpoint/finalize。B2b 必须让 capability、POST、task/events poll 使用同一 trusted actor，在 claim 前重新计算并校验权威 scope/revision/expiry，且新 claim 精确返回 `202 queued`、同键 waiting/terminal existing 精确返回 `200`；B2c 保存真实 taskId，在客户端 POST 前执行第二次 capability gate，并用原子 intent CAS 阻断 TOCTOU | RP-02A/B1/B2a0/B2a1-B2a5/B2b/B2c E3 + 最终 E6 | 默认 context 创建 B2 envelope；调用方 raw entity/source refs/clock 冒充权威；actor 与 task/envelope 身份不一致；authority 缺失/变化仍调用 provider或留下任一副作用；风险确认在 provider 后校验；B2a2 越权声称 capability/lease/finalize/202/E6；B2b 未在 claim 前重算权威 capability；B2c 本地假 taskId、二次 gate 后仍发生 TOCTOU POST；fire-and-forget；202 后误报完成 |
| TASK-B2A2-ACTOR-REPLAY-01 | `buildApp` 显式注入 authenticated `RequestContextResolver`，生产 `main.ts` 只能从服务端校验 deployment actor 配置构造 resolver，缺失时 fail closed；15 个 provider-backed route 每请求只解析一次且 resolver 是唯一 actor 来源。覆盖同 tenant 的 user A/user B、tenant A/tenant B、resolver 未注入/null/抛错/空身份、body/header/cookie 伪造身份、resolver actor 与 novel tenant 不一致；逐字段断言 task/envelope tenant/user 与 resolver完全一致，交叉 actor 不命中 actor-scoped idempotency lookup。公开 task/events actor 可见性留给 B2b。ManualClock 固定 T0 首次 claim、推进到 T1 后同 actor/action/object/key/request 重放：taskId、persisted requestedAt=T0、canonical envelope bytes、requestHash、authority snapshot 全部不变，八类重放增量全 0；T1/caller requestedAt 变异必须红 | RP-02B2a2 deterministic mock E3；实现包 3.1/3.2 | 生产 actor 依赖客户端值或默认 fallback；同 tenant 不同 user 或双 tenant 串用；伪造身份进入 hash/payload；task/envelope actor 不一致；只断言复用 taskId；越权修改 task/events API；声称 capability、lease、finalize、202、真实环境或 E6 |
| TASK-B2A2-AUTHORITY-01 | 对 authority matrix 全部 15 action 分别执行 `missing`/`changed`，并分别停在 claim 前、claim 后/provider 前两个 deterministic barrier；每例必须走真实 `NovelService -> taskClaim -> registry -> repository authority loader`，精确断言八类增量 `task/event/provider/asset/receipt/current/operation-log/child=0` 且 provider spy 未 entered。claim 后变异不得先提交再删除。legacy replay fixture 初始精确存在 1 条 task，只走同步 replay/parser；覆盖 actor/envelope 缺失、null、空对象、空白、默认占位及 tenant/novelId 错配，typed fail closed 后 task 总数仍为 1、八类增量全 0 | RP-02B2a2 deterministic mock E3；实现包 4.1 | 只抽一个 action；只测一种变异或一个 barrier；只断言 provider/asset；claim 可见后再删除；legacy 绝对 task=0 假断言、进入 lease/worker或自动升级；任何 capability、checkpoint、finalize、receipt 写链、202、真实 DB/provider 或 E6 外推 |
| TASK-CONCURRENCY-01 | B2a2 证明 provider 前 authority gate、同 tenant 不同 user、双租户与 T0/T1 authoritative replay，身份/authority 变异均按八类副作用精确为 0；B2a3 证明 expectedPhase/attempt fencing 且两种 repository 普通 leased provider=0；B2a4 仅 InMemory capability 放行并证明第二 stale gate/原子 finalize；B2a5 Prisma 9 enabled/6 unsupported lock/CAS。B2b 用 barrier 证明 lease/settlement 竞争；B2c 用 IndexedDB readwrite CAS、submissionId+revision、scope suspend/resume 和 capability 二次读取证明两标签只一次 POST；B3 才证明 recovery 竞争 | RP-02A/B1/B2a1-B2a5/B2b/B2c/B3 E3 + 最终 E6 | B2a2 用默认/伪造 actor、真实 timer、顺序请求或单 action 冒充隔离/并发 oracle；finalize 未就绪却先调用 provider；客户端/env/instanceof 推断 capability；matcher 后 authority 可变；重复 provider/asset/receipt/POST；跨 tenant/user/scope 复用；InMemory/static Prisma 外推真实 DB |
| TASK-WORKER-01 | B2a1-B2a5 必须依次证明：15-action registry/strict ABI/公开 retry freeze；权威重载与 provider 前 stale；lease-CAS/attempt/fail-safe/历史 retry child fencing；repository-owned capability 仅放行 InMemory 15 action；Prisma 9 enabled/6 unsupported。B2a1 子阶段已由 accepted head `4817abc`、正式验收 192/192、QUALITY P1/P2=0/0 和独立 clean checkout 证明，范围仅限 registry/ABI/freeze，不证明 worker lifecycle；B2a2 也只证明 authenticated claim/envelope 和 provider 前 gate，不得借 `worker` 命名认领 lease/finalize/lifecycle。新增 leased path 在 B2a1-B2a3 对 public HTTP/Admin/task DTO 不可达，B2a4 leased result 仅 harness 可见，B2a5 仍不新增 transport。每包测试与生产能力同包，远程按 B1→B2a0→已完成子包 fail-fast；B2b 才新增 worker lifecycle/202，B2c 才改 Admin transport | B2a1-B2a5/B2b/B2c 独立 E3；真实 HTTP latency、DB 事务和独立 worker 进程留 E6 | raw entity/cast；标题测试；B2a2 越权声称 lease/finalize/lifecycle/202；B2a3 正常 leased provider 非零；A4 误放行 Prisma或公开候选；旧 finalize 后补 receipt；过期 owner写入；retry child 调 provider；unsupported 先排队；跨包脏 diff |
| TASK-RESTART-01 | B2a3 只证明 checkpoint/lease fencing、错误 owner/过期 owner 零写；B2a4/B2a5 只证明 deterministic fenced finalize。heartbeat、防接管和 graceful shutdown 让 lease 自然过期只归 B2b；grace timeout 后本地 execution=abandoned，迟到 resolve/reject/abort 即使 lease 尚有效也 repository 零写。recovery CAS、restart、unknown outcome 只归 B3；真实 kill/restart 归 E6 | B2a3-B2a5 E3 + B2b E3 + B3 E3 + E6 | B2a 误称 heartbeat/recovery；无 owner/token/expiry；abandoned 回调写 fail/finalize；shutdown 立即 requeue；盲目重放 provider |
| TASK-RETRY-01 | B2a1 已由 accepted head `4817abc` 固定 provider-backed retry 的 `409 RETRY_NOT_AVAILABLE`、`retryable=false`、受控失败原因、disabled 下一步和 mutation/event/log/child=0，且 freeze 优先于 stale/conflict；阶段证据见 `docs/reviews/remediation-rmd-task-002-003-rp-02b2a1-verification-2026-07-15.md`。B2a2 以后持续回归。B2a3 只把历史 queued/processing retry child 在 lease/provider 前原子终态 fencing；B3 才实现 tenant+parent+token 原子 child、预算/stale/active claim/lineage与真实消费 | B2a1 route DTO/409/文案/八类零副作用 + B2a2-B2c 回归 + B2a3 existing-child fence + B3 E3/E6 | freeze 优先级晚于 stale；公开 raw error；retry 409 创建 event/log/child；既存 child 调 provider；多个 active child；unknown 自动重试 |
| TASK-CANCEL-01 | 区分停止本页等待、取消任务、放弃结果、重新生成；迟到结果不成为 current | E4/E6 | 文案和后端状态不一致 |
| TASK-SURFACE-01 | 主卡片、最近任务、抽屉、路由和刷新后任务 ID/状态一致；B2c capability reasonCode 唯一优先级矩阵、checking/unavailable/ready、重新检查零提交、绑定前后 receipt 恢复、A→B→A 同 submission/key 的 `scope_suspended` 恢复和 scope 隔离必须确定；旧 capability 在 B 期间过期/轮换后，回 A 只刷新同 scope transport attestation 并保持 submission/key/request/hash 不变；完整任务表面只由 RP-02C 关闭，B2c 最小 transport 不计为本项通过 | E4 | policy enabled 且 environment supported 时安全上下文缺失却降级旧同步；组合条件返回非唯一 reasonCode；重新检查自动提交；capability 过期清除已绑定 task；旧 attestation 过期导致永久悬挂；新 scope 退休未知结果或产生新 key；scope 串用；任一表面显示旧状态；用 B2c transport 冒充完整任务投影 |

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
| TEST-B2A2-COMMAND-01 | 最终 G0 以固定 `6eaf60af4155a8b95ff77d53261f5896d3a8f77d` 为唯一父提交，原子落地 15-file manifest、gate/workflow/test、四路父 workflow action 完整 SHA、根级只读 permissions、checkout `persist-credentials: false` 与 A1 四条 actor 环境清理；禁止在旧 G0 后追加 incremental G0，也禁止 G0+E1 合批。A2 base 必须被同一 production gate 机器证明为 accepted G0 code head，且 A2 从该 head 新建 sibling 实现分支，不得以 E1 为父。gate 从 candidate HEAD（仅 `--worktree` 读当前 worktree）的真实 `package.json` 逐字符断言 G0 A1 四条安全命令和 A2 三条新增命令，冻结其余继承脚本并拒绝新增脚本/root npm lifecycle；candidate 临时仓库必须执行自己的 gate。live spawn 证明 direct env-probe 遇 DB/provider/actor canary 必败，core/composite 清理后通过；逐个拒绝空壳、吞错、环境缺失、script 依赖改写、zero/unreachable push、非祖先 manual、shell expression 注入及 synthetic predecessor/build/Prisma exit 17 后下游启动数非 0 | RP-02B2a2-G0 + A2 deterministic command E3；实现包通用 gate/第 11 节 | G0 非固定基线的原子直接子提交；旧 G0 后追加修订；G0 含 E1 字段/事件/7.3；candidate 执行 reviewer worktree gate；误读 dirty worktree；A2 从 E1 起步；继承脚本或 lifecycle 可空壳；零 SHA/force/manual 隐藏累计 diff；npm ci 早于 gate；shell 注入；环境泄漏；前序失败仍继续；连接真实 DB/provider 或越界能力 |
| TEST-B2A2-G0-E1-01 | G0 同头 RP-01A/RP-01B/RP-01C/governance 四路成功后，在专用 evidence 分支以 accepted G0 为唯一父提交创建唯一原子 `RP-02B2a2-G0-E1`。E1 只修改三份固定 evidence docs；分别证明 `additions=64`、`deletions=16`、`net=64` 边界可通过且任一维度超限失败。三文档各自且仅一次记录精确九个 `g0_evidence_*` 白名单字段，拒绝 `:`/`=` 伪字段、重复字段及任何额外 self/publication/E1 run 字段。`main-control-status.md` 原位更新总体进度块、G0 最终复核行和唯一推荐动作，绑定 accepted code head、四路成功、最终 `15 files / <final actual_net_additions> net additions` 与从 accepted G0 测试源实际推导的 package gate `<final actual gate count>`；event ledger 恰好追加一个 `### MCE-RP02B2A2-G0-E1-REMOTE-ACCEPTED`；verification 恰好新增一个 `### 7.3 G0 accepted code head 与远程关闭证据`。每个 A2/B2a2 正向授权语句独立失败，不能被同句或其他位置的 `not_authorized` 掩蔽，Unicode format/HTML entity/raw or numeric-entity-decoded HTML tag/解禁/放行/可编码写法也必须拒绝。测试自有 oracle 独立冻结每包 required categories，并覆盖 A2 缺 production 与缺 test。fake `gh` 分别证明父 run name/repository workflow path/精确或受限 `path@ref`/workflow id/event/head/status/conclusion 错配均失败；authoritative admission 另证明事件与 live PR 的 `base.ref` 都等于 repository default branch，workflow SHA/PR/base/candidate 身份逐项失败；另覆盖 G0+E1、incremental G0、direct-child pending amend worktree、`E1 -> A2` 误拓扑。A2-A5 admission 缺失或伪造 repository-controlled E1 SHA 必须 provider/install=0 失败，合法 sibling E1 通过后才可生成绑定策略与 candidate blob 的 manifest digest，并产出可下载 JSON artifact。同包 canonical digest/mutation test 只证明实现与当前审阅语义一致，G0 独立 bootstrap oracle 仍由固定基线直接子提交、冻结差异、四席复核和远程 clean-checkout 提供 | RP-02B2a2-G0-E1 production gate + Git topology fixtures + fake `gh` matrix + trusted/candidate double-checkout | 边界值失败或超限放行；字段缺失/重复/额外；只追加字段；状态页保留 pending/旧计数；事件/7.3 缺失或重复；正向授权被隐藏字符、raw/decoded HTML tag 或 `not_authorized` 掩蔽；required categories 与生产定义同源漂移；非默认分支 PR 获得 authoritative admission；父 run name/repository path/run path/id/event/head/status/conclusion 或 authoritative admission workflow SHA/PR/base/candidate 任一错配放行；把同包 hash/test 绿灯冒充独立 bootstrap 验收；缺失/伪造 E1 仍准入；无耐久 JSON；worktree 接受两层以上 incremental G0；merge、多提交、第二个 E1、G0+E1、incremental G0、与 A2 合批或 `E1 -> A2` |
| TEST-MYSQL-01 | 安全授权后执行 migrate、seed、并发、rollback、restart；输出脱敏摘要 | E6 | 只验证 SQL 文本或 DATABASE_URL_MISSING |
| TEST-EVIDENCE-LEVEL-01 | 验收模板强制分列 contract/unit/API/DB/browser/provider/media 与 not_proven | E1 + template regression | 结论只写“通过” |

## 8. 工程与治理

| 验收 ID | 核心操作与断言 | 最低证据 | 阻塞条件 |
| --- | --- | --- | --- |
| GOV-GIT-01 | 每包独立 commit/push；全局 20/2,000 之外还必须执行包级 hard budget/manifest。B2a1 accepted head `4817abc` 从固定基线 `501a3cf` 通过单一累计门禁：18 files / 1,898 net additions，ADR actual count 一致；不再接受拆分门禁或 test-only 回退解释。accepted head 的治理、RP-01A/B/C 四路远程 run `29405557756`/`29405557734`/`29405557763`/`29405557764` 均成功且 upstream 对齐，production workflow contract `required_files=35`；该证据不自动覆盖后续包。B2a2-B2a5 ADR 仍须在各自实现 diff 中改为 `status=ready`，机器字段记录 package/manifest/baseline/hard budget/actual count；远程 CI 按 PR merge-base、push before/head 或 manual 显式 SHA 的同一 BASE/HEAD，NUL-safe 发现唯一 changed ADR并调用生产 package gate | E1 + Git hook/CI check | 预先存在但本包未修改或旧 superseded ADR；status 非 ready；零/缺失/不可解析 SHA；无参/HEAD~1 fallback；多/缺 ADR；package/manifest/baseline 不匹配；manifest 外或 required 类别缺失；包级超限却被全局绿灯放行；实际计数不符；跨两个已验收包累计 |
| GOV-B2A2-G0-E1-01 | G0、E1、A2 使用固定双分支拓扑：最终 G0 是 `6eaf60af4155a8b95ff77d53261f5896d3a8f77d` 的唯一原子直接子提交；E1 在专用 evidence 分支作为该 lineage 唯一的 E1 原子提交，且直接父提交为 accepted G0；A2 经 MC 显式授权后从 accepted G0 新建 sibling 实现分支，绝不继承 E1。G0 保持 15-file manifest，并固定四路父 workflow action 完整 SHA、根级只读 permissions 与 checkout `persist-credentials: false`，E1 只做三文件最终状态迁移并保持总账 `9/42`、`RMD-TASK-002=partial`、`RMD-TASK-003=open`、`A2=not_authorized`。外部 Git/GitHub 元数据绑定 E1 自身；状态页原位收口、唯一 remote-accepted 事件和唯一 verification 7.3 共同构成关闭证据 | G0/E1/A2 commit graph + production gate output + three-file final-state evidence + four parent run receipts | incremental G0；G0 合批 E1；E1 非专用 evidence 分支或父提交不是 accepted G0；A2 从 E1 起步；E1 自我引用或用第二个 E1 补证；总账/RMD 提前关闭；E1 被解释为 A2 自动授权或允许开始业务实现 |
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
