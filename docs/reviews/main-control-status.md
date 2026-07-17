# AIShortvideo 主控统一状态

更新时间：2026-07-17 15:08 CST

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
| 整改计划 | RP-00A、RP-00B、RP-01A、RP-01B、RP-01C 已正式关闭；RP-02A、RP-02B1、RP-02B2a0、RP-02B2a1 限定阶段完成；replacement G0/E1/default-branch bridge 已闭合 | 唯一总账仍关闭 9/42；RMD-TASK-002 为 partial、003 为 open；当前只授权 `RP-02B2a2-A2` 从精确 G0 开工，A3-A5/B2b/B2c/B3 均未授权 |
| 测试 | RP-02B2a1 accepted head `4817abc` 的最终 TEST 与 clean-checkout 均 `APPROVED`，复合链 192/192；四路远程 CI 同头全绿 | 只证明 E3 registry/ABI/public retry freeze；仍不能外推真实 DB/provider/media/E6 |
| 工程质量 | `review / high` | 最终 QUALITY `APPROVED`，P1/P2=0/0，14/14 负向变异被拒绝；小说真实完本与全书审稿 2 个既有 P0 仍未关闭 |
| 本地服务 | 未运行 | `5173`、`3001` 当前无监听；用户需要浏览器验收时按需启动 |
| 真实环境 | 冻结/待授权 | P8b-L1b、真实 DeepSeek/provider、外部渲染/云存储均无当前授权 |

### 1.1 复盘整改进度

总体关闭进度只统计 `docs/remediation/issue-ledger.md` 中已经具备正式关闭证据的 `closed` 项；准入评审、需求修订、开发完成或自测通过均不提前计入。

```text
总体关闭进度  [████░░░░░░░░░░░░░░░░]  9 / 42（21%）
剩余问题      33
当前整改包    RP-02B2a2-A2 authority claim：replacement G0/E1/default-branch bridge 已闭合，仓库变量只授权 A2；旧 17-file 草稿审计发现 8 个 P1，待迁移到精确 G0 sibling 分支后返工
拆包准入进度  [████████████████████]  7 / 7（100%）：第六轮四角色全部 approved，P0/P1=0
研发交付进度  [████░░░░░░░░░░░░░░░░]  1 / 5（20%）：仅 B2a1 限定阶段完成
当前状态      G0 `52549d7`、E1 `39d48a6` 和 main bridge `9b320a5` 已完成；G0/E1 远程 runs 与 main recovery run `29559215753` 均 success。仓库变量已设为 `RP-02B2a2-A2` + predecessor `52549d7`，只表示允许 A2 开工，不表示实现、验收或总账关闭；A2 尚未迁移返工，当前仍为 9/42
```

当前包阶段：

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| 基线与拆包 | 拆包准入 | RP-02B1/B2a0 已收口；原 B2a 单包失效，现拆为 B2a1-B2a5；B2b/B2c/B3 冻结 |
| 七轮多 Agent 准入 | 已完成 | 后端 approved；产品/TEST/QUALITY rejected，角色报告 P0=0、P1=7，去重为 6 个唯一阻塞合同 |
| 八轮多 Agent 准入 | 已完成 | TEST approved；后端/产品/QUALITY rejected，角色报告 P0=0、P1=4、P2=1，去重为 3 个唯一阻塞合同 |
| 第八轮拒绝项修订 | 已完成 | reasonCode 唯一优先级、scope/revision/expiry 服务端权威绑定和 B2a 失败即停复合命令已进入第九轮稿；`git diff --check` 与 15/15 governance 通过 |
| 第九轮拒绝项修订 | 已完成 | 3 路 approved；QUALITY 的 attestation 过期恢复 P1 已进入第十轮稿；`git diff --check` 与 15/15 governance 通过 |
| 第十轮拒绝项修订 | 已完成 | 3 路 approved；TEST 的 202/200 宽松断言 P1 已拆成第十一轮两个精确子例；`git diff --check` 与 15/15 governance 通过 |
| 四路 P0/P1 清零 | 已完成 | 第十一轮后端/产品/TEST/QUALITY 均 approved，四路 P0/P1/P2=0 |
| 需求提交与远程治理 | 已完成 | 需求合同 `42a3f18` 已推送；Remediation governance run `29246455165` success |
| RP-02B2a0 研发 | 已完成 | 实现提交 `2da6d31`；严格 8 files / 319 net additions；未进入 B2a+ |
| 独立验收 | 已完成 | TEST 与 QUALITY 最终均 approved，P0/P1/P2=0；四类 canary 与日志/DOM 返工闭合 |
| 关闭证据与总账更新 | 已完成 | 阶段证据已形成；`RMD-TASK-002` 保持 partial，总体关闭数仍为 9/42 |
| RP-02B2a 第一轮单包授权审计 | 已完成 | 后端 approved 0/0/1、QUALITY approved 0/0/0、产品 rejected 0/2/0、TEST rejected 0/1/0；去重为 route 回归写集、retry 用户文案、远程 CI 3 个 P1 |
| RP-02B2a 第一轮拒绝项修订 | 已完成 | manifest 改为 22 个实现/测试/CI 文件 + 同 diff ADR，补 route retry 精确回归、固定失败文案和远程 B1+B2a 串行命令 |
| RP-02B2a 第二轮单包授权复核 | 已完成 | 产品/TEST approved 0/0/0；后端 rejected 0/2/0、QUALITY rejected 0/1/0；去重为远程 budget/ADR ready 门禁和顶部授权口径 2 类 P1 |
| RP-02B2a 第二轮拒绝项修订 | 已完成 | 补 PR/push BASE/HEAD、NUL-safe ADR discovery、显式 `--adr`、`status=ready` 机器门禁，并修正最新授权上限；本地 governance 15/15、diff check 通过 |
| RP-02B2a 第三轮单包授权复核 | 已完成 | 后端/产品/TEST/QUALITY 均 approved，四路 P0/P1/P2=0；授权合同首次清零，不等于研发授权 |
| RP-02B2a 授权资产提交与远程治理 | 已完成 | 提交 `48bbac7` 已推送；远程 Remediation governance run `29269395271` completed/success |
| RP-02B2a MC 最终裁决 | 已完成 | 只授权 B2a 按 23 files / 2,000 net additions 开工；B2b/B2c/B3、202/Admin transport、真实环境继续冻结 |
| RP-02B2a 原单包研发与正式验收 | 已拒绝 | 13 paths/约 733 net additions；正式 QUALITY P0=2/P1=4，生产 registry、authority、phase CAS、原子 finalize 与强测试证据未闭合；未提交 |
| RP-02B2a 初始拆包复审 | 已完成 | 产品/TEST/QUALITY 拒绝原单包；旧后端席位未返回有效报告，仅用于形成五包草案，不构成准入 |
| RP-02B2a1-B2a5 首轮正式资产复核 | 已拒绝 4/4 | 产品 `0/4/2`、后端 `0/4/3`、TEST `0/4/2`、QUALITY `0/3/1`；P0=0，P1 去重为 6 类，全部角色均 rejected |
| 首轮拒绝项整改 | 已完成 | retry 前移 A1、leased result 公开门禁、逐包命令、package gate/机器预算、上位矩阵/父包、repository capability gate 已进入第二轮稿 |
| RP-02B2a1-B2a5 第二轮四路准入 | 已拒绝 3/4 | 产品 `0/0/2` approved；后端 `0/1/2`、TEST `0/2/1`、QUALITY `0/1/1` rejected；P0=0，去重为 4 类 P1 |
| 第二轮拒绝项整改 | 已完成 | A1 gate 命令、production workflow wiring、24 场景逐包归属、A2/B2b/B2c 权责矩阵已修订；`git diff --check`、governance 15/15 和 worktree budget 通过 |
| RP-02B2a1-B2a5 第三轮四路准入 | 已拒绝 1/4 | 后端、TEST、QUALITY approved 0/0/2；产品 rejected 0/1/1；唯一 P1 为当前轮次与授权状态指针不一致 |
| 第三轮拒绝项整改 | 已完成 | 当前轮次、3/4 角色结论、五包未授权和第四轮前置已统一；diff check、governance 15/15、逐项合同核对和预算预检通过 |
| RP-02B2a1-B2a5 第四轮四路准入 | 已拒绝 1/4 | 产品、TEST、QUALITY approved；后端 rejected 0/1/1；唯一 P1 为实现包与“当前唯一推荐动作”仍停在旧轮次 |
| 第四轮拒绝项整改 | 已完成 | 两处当前动作与证据卫生 P2 已修正；diff check、governance 15/15、预算预检与陈旧状态检查通过 |
| RP-02B2a1-B2a5 第五轮四路准入 | 已拒绝 4/4 | 四角色均 rejected P0=0/P1=1；唯一 P1 为“当前唯一推荐动作”仍使用整改进行态并称第五轮尚未开始 |
| 第五轮拒绝项整改 | 已完成 | 当前唯一推荐动作当轮已改为 P1 修订完成并进入第六轮；diff check、governance 15/15、预算预检和精确陈旧状态检查通过 |
| RP-02B2a1-B2a5 第六轮四路准入 | 已完成 | 后端 approved 0/0/2、产品 0/0/1、TEST 0/0/1、QUALITY 0/0/1；四路 P0/P1=0，合同无回退 |
| 拆包资产提交与 B2a1 独立实施 | 已完成 | B2a1 从 clean 基线 `501a3cf` 独立实施；不联动授权后续包 |
| RP-02B2a1 实现与远程验收 | 已完成 | 早期 `0a583c8` 因两个最终质量 P1 被拒绝；修复链 `072b9be -> f342297 -> 4817abc` 已推送，固定基线单一累计门禁为 18 files / 1,898 net additions，accepted code head 四路远程 CI 全绿 |
| RP-02B2a1 最终 TEST/QUALITY/clean checkout | 已完成 | TEST/QUALITY/clean-checkout 均 `APPROVED`；复合链 192/192、API 119/119、RP-01C 13/13、根 RP-02A 11/11、14/14 负向变异拒绝，P1/P2=0/0 |
| RP-02B2a1 阶段证据与总账同步 | 已完成 | accepted code head `4817abc` 与 immutable evidence publication head `6eaf60a` 分离绑定；Remediation governance run `29410503391` completed/success；`RMD-TASK-002=partial`、`RMD-TASK-003=open`，总览仍为 9/42 |
| RP-02B2a2 四路准入（历史） | 已被 replacement G0 supersede | 旧实现快照曾被后端/TEST/QUALITY/治理拒绝；该结论仅保留为历史审计，不再代表当前授权状态。当前有效边界见 replacement G0/E1 与 A2-only 授权事件 |
| RP-02B2a2-G0 首轮独立复核 | 已拒绝 4/4 | TEST `0/2/0`、后端架构 `0/3/3`、QUALITY `0/5/1`、治理 `0/3/1`；共同 P1 为治理文件无独立 package 归属、range/命令/workflow 假绿及 actor/legacy 合同越界。当时按固定 `6eaf60a` 的 10-file G0 包整改，业务实现未启动 |
| RP-02B2a2-G0 replacement / E1 / main bridge | 已完成 | G0 `52549d7` 以 16 files / 1,999 net additions 通过 package gate 47/47、完整工程矩阵、独立 TEST/QUALITY 与四路远程 push；E1 `39d48a6` 完成不可变证据发布；PR #25 以 merge commit 接入 main `9b320a5`，recovery run `29559215753` success。当前仅授权 A2 从精确 G0 开工 |

## 2. 小说模块

### 已确认关闭（限定范围）

- 小说从方向、设定、大纲、章节目录、试写到正文批次的多个已知交互问题已完成定向修复；若干项仍是“实现待验”，不能整体表述为产品闭环已关闭。
- `body_batch_generate` 已具备任务预占、同幂等复用、冲突阻断和保存失败固定状态回归证据。
- Prisma 正文真实写路径未实现时会在 provider 调用前明确阻断，不先消耗模型。
- 创建向导复合 radio 可访问性问题已通过。

### 当前阻塞

- P0：Prisma 正文批量、重写、正文采用、全书审稿和完结确认未形成真实 MySQL 完整链路。
- P0：全书审稿只接收章节元数据，没有章节正文、分层摘要或连续性记忆，当前审稿结果不可作为质量门禁。
- P0/P1：小说 provider-backed action 已完成 RP-02A preclaim、RP-02B1 ExecutionEnvelope/lease 仓储原语、RP-02B2a1 15-action registry/strict provider ABI/public retry freeze E3，以及 RP-02B2a2 replacement G0/E1/main bridge；A2 authority claim 已获开工授权但尚未迁移返工或验收，authority reload/stale gate、快速返回、dispatcher、worker loop、restart/retry child 和真实 MySQL/多进程仍未实现或未证明。
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
- `RP-02B1`、`RP-02B2a0` 与 `RP-02B2a1` 限定阶段已完成；replacement G0/E1/default-branch bridge 已闭合。当前只授权 `RP-02B2a2-A2` 从精确 G0 开工，A3-A5/B2b/B2c/B3 不得按编号自动继续，真实 MySQL 继续等待独立授权。

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

- 全栈研发：`RP-02B1`、`RP-02B2a0` 与 `RP-02B2a1` 实现链已按限定阶段推送；`RP-02B2a2-G0` replacement accepted code head 为 `52549d7`，E1 immutable evidence 为 `39d48a6`。PR #25 以 merge commit 将 G0 ancestry bridge 接入默认分支 `9b320a5`，主分支树和 trusted workflow blob 均与 G0 一致，E1 未混入。MC 现在只授权 A2 authority-claim 子包从精确 G0 创建 sibling 分支；A3-A5/B2b/B2c/B3 均不得自动继续。
- 独立测试/质量 agent：最终 TEST/QUALITY/clean-checkout 均 `APPROVED`；复合链 192/192，QUALITY P1/P2=0/0，14/14 负向变异拒绝。真实 MySQL、多进程、dispatcher/worker loop、restart/真实 retry 仍为 not_proven。
- `P10-R1` 验收准备保留，但当前不是推荐开工项。
- 五类专业复盘与二次复盘已完成；执行状态以 `docs/remediation/issue-ledger.md` 为唯一事实源。
- 每个研发包完成后必须由测试会话独立验收，研发自测不能替代正式结论。
- 浏览器验收必须检查真实 Network/API 状态与刷新恢复，不能只看按钮 loading 或页面 banner。

## 5. 工程质量与工作树

- 最新工程质量：二次复盘归并 42 项 PB/RB/QG/DEBT 和专项验证缺口；`RP-00A`、`RP-00B`、`RP-01A`、`RP-01B`、`RP-01C` 已关闭 8 项 QG 和 1 项 DEBT，当前关闭 9/42。
- `.playwright-cli/` 已安全忽略；源码、migration、测试和文档未被 ignore。
- 已创建并推送检查点分支 `codex/aishortvideo-checkpoint-20260711`；P10-R0 检查点 `68957be` 及后续 R1 准入文档均纳入该远程分支。
- RP-00B 的 `Remediation governance` 已在远程 push runs `29196618102`、`29196969050` 成功执行，Git 预算与 SLA 门禁不再只有本地证据。
- RP-01A 已在远程 clean checkout runs `29202209121`、`29202209111` 通过治理与真实 backend E2E；关闭提交 `ee0b1a2` 的治理 run `29202693061` 也已成功。guard 13/13，远程 artifact 仅含 4 个安全摘要文本且敏感模式 0 命中。
- RP-01B 已在实现/返工提交 `95a62d4`、`efd3851` 建立 Vue DOM/event runner；远程 runs `29205130421`、`29205130419` 在 clean checkout 下通过治理、shared build、旧 admin 77/77 和 DOM 10/10，关闭提交 `ae5c2c8` 的治理 run `29205701139` 也已成功。独立 TEST/QUALITY 对 `efd3851` 均 approved，焦点恢复到触发按钮仍明确为 not_proven。
- RP-01C 已在实现/返工提交 `12d77da` 至 `dc1991a` 建立 10 类确定性失败 fixture 和完整命令链环境隔离；远程 run `29208828449` 通过 targeted 13/API 108/RP-01A 13/governance 15/typecheck/build/budget，独立 TEST/QUALITY 对 `1406878` 均 approved，关闭提交 `bdfa814` 的治理 run `29209311021` 也已成功。
- RP-02A 已在 `b2b374a` 建立统一 provider 前 preclaim，并在独立验收发现 3 个 P1 后以 `76dabd8` 完成模型路由指纹、阶段推进后终态 replay 和可重入 migration 返工；最终 RP-02A 11/API 110/RP-01C 13/E2E 13/governance 15 与 typecheck/build/Prisma 全绿，远程 runs `29214449969`、`29214450023`、`29214450008` 成功。RMD-TASK-001 仍为 partial。
- RP-02B1 已在 `415d03a` 建立 shared 15-action ExecutionEnvelope、显式 source refs 禁止合成/跨字段一致、lease/fencing/recovery CAS、安全回执与多结果 Prisma 合同；独立 TEST/QUALITY 最终 P0/P1/P2 = 0，干净检出 13/13，远程 runs `29220634159`、`29220634162`、`29220634178`、`29220634187` 成功。worker 权威重载和 stale 双门禁未证明；RMD-TASK-002 为 partial、003 为 open，E6 未证明。
- RP-02B2a1 的 registry/ABI 实现已闭合。`RP-02B2a2-G0` replacement 以 16 files / 1,999 net additions 通过 package gate 47/47、actor-clean 69/69、完整工程矩阵和独立 TEST/QUALITY；四路 push runs `29550266898`、`29550266912`、`29550266923`、`29550266905` 均成功，G0 对应的 E1 不可变证据 runs `29552245971`、`29552245974` 也已成功。PR #25 合并后 `merge-base(main,G0)=G0`，当前 main 恢复验证 run `29559215753` success。A2 只获开工授权，旧 17-file 草稿经只读审计仍有 8 个 P1，必须迁移后返工；authority claim、worker lifecycle、真实 retry child 与真实 DB/provider/media/E6 仍未证明，RMD-TASK-002 仍为 partial、003 仍为 open，总账保持 9/42。
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
- `docs/reviews/remediation-rmd-test-dom-001-closure-2026-07-13.md`
- `docs/reviews/remediation-rp-01b-dispatch-receipt-2026-07-13.md`
- `docs/reviews/remediation-rmd-test-fixture-001-closure-2026-07-13.md`
- `docs/reviews/remediation-rp-01c-dispatch-receipt-2026-07-13.md`
- `docs/reviews/remediation-rmd-task-001-rp-02a-verification-2026-07-13.md`
- `docs/reviews/remediation-rmd-task-002-003-rp-02b1-verification-2026-07-13.md`
- `docs/reviews/remediation-rmd-task-002-rp-02b2a0-verification-2026-07-13.md`
- `docs/reviews/remediation-rmd-task-002-003-rp-02b2a1-verification-2026-07-15.md`
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

1. MC 只授权 `RP-02B2a2` 的 A2 authority-claim 子包：必须从 `52549d7` 创建 sibling 分支，保持 `merge-base(main,A2)=52549d7`，不得从 main、integration commit、E1 或旧 `0cfcbd1` 草稿分支延伸。先迁移旧草稿并关闭只读审计发现的 8 个 P1，再执行 authoritative admission、独立 TEST/QUALITY 和关闭证据；A3-A5、B2b、B2c、B3、真实 DB/provider/media/E6 继续冻结。
2. `RP-01D` 涉及真实 MySQL，只能在安全环境和用户独立授权后执行；管理分组不得整体派发。每个子包独立研发、测试、关闭、commit 和 push。
3. 小说真实完本金丝雀通过后，再执行 P9-real；P10-R1 只在 `RP-10` 重新决策。
4. 继续保持真实 DB/provider、外部媒体和平台发布的独立授权门禁。

不得提前执行尚未满足依赖的子包、`P9-real`、`P10-R1`、CS-L1、真实 MySQL/provider 或外部发布能力。
