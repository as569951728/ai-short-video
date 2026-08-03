# RP-04B-L1 小说正文字数门禁契约

## 1. 冻结身份

| 字段 | 冻结值 |
| --- | --- |
| package_id | `RP-04B-L1` |
| target_issue_id | `RMD-NOV-QUALITY-001` |
| acceptance_id | `NOV-LENGTH-01` |
| user_result | 用户设定的章节目标字数成为可见、可验证、不可绕过的正文质量门禁 |
| expected_ledger_transition | 独立验收通过并正常合并后，才可由主控申请 `RMD-NOV-QUALITY-001: open -> closed` |
| ledger_status | 本文不修改问题总账状态 |

本契约只冻结 RP-04B-L1 的产品、实现和验收边界，不构成研发完成、独立验收通过、合并批准或总账关闭证据。

## 2. 字符数权威口径

正文字符数按以下顺序计算，前后端、provider 校验、持久层采用校验和测试必须复用同一纯函数与同一 `countMode` 版本：

1. 输入必须是字符串；先执行 Unicode NFC 归一化。
2. 删除所有符合 Unicode `White_Space` 属性的 code point，包括普通空格、换行、制表符和不换行空格。
3. 对剩余字符串按 Unicode code point 计数，不得使用 UTF-16 code unit 的 `string.length` 直接计数。
4. 汉字、标点、数字、拉丁字符、emoji 等非空白 code point 均计入字符数；不做中文分词，也不按 token 计数。
5. `countMode` 固定为 `unicode_code_point_non_whitespace_nfc_v1`。

设章节目标字符数为正整数 `T`：

- 下限 `L = ceil(T * 90 / 100)`。
- 上限 `U = floor(T * 115 / 100)`。
- 实际字符数 `A` 满足 `L <= A <= U` 时为 `qualified`。
- `A < L` 时为 `too_short`；`A > U` 时为 `too_long`。

目标值必须来自当前权威章节目录/章节记录，不得信任 provider 回显、前端计算或旧候选 metadata。目标缺失、非法或来源版本陈旧时须在 provider 调用前 fail closed，provider/task-result/asset 增量均为 0。

## 3. 门禁覆盖范围

以下五类动作全部属于正文门禁，不允许把“试写”“重写”或“批量”解释为例外：

| 动作 | 门禁对象 | 目标来源 |
| --- | --- | --- |
| 第 1 章候选 | 每一个第 1 章正文候选 | 当前权威章节目录中的第 1 章 `wordTarget` |
| 第 2-3 章试写 | 第 2、3 章各自正文 | 对应章节的当前权威 `wordTarget` |
| 批量正文 | 批次内每一章正文 | 对应章节的当前权威 `wordTarget` |
| 单章生成 | 本次生成的单章正文 | 当前章节的权威 `wordTarget` |
| 重写 | 本次重写候选正文 | 当前章节的权威 `wordTarget` |

门禁执行顺序固定为：

1. provider 返回结构化结果。
2. 服务端完成 schema 校验和正文字符数计算。
3. 在创建候选、正文版本、feature/review/memory、result receipt 或任何正式/候选资产之前执行长度门禁。
4. 任一受检正文不合格时，本次动作安全失败；不得先写入再删除，也不得留下可采用候选。
5. 候选采用前必须从权威仓储重新读取当前目标和候选正文，再执行同一门禁；不得信任生成时保存的计数或前端状态。

批量和多候选动作在本包内维持当前原子语义：任一正文不合格时，本次动作的生成资产增量为 0。本包不借字数门禁实现逐章 checkpoint。

## 4. 历史候选与采用

- 本契约生效前产生的历史候选同样受采用前门禁约束。
- 历史短候选、历史超长候选、目标来源缺失或 stale 的候选均不得采用。
- 前端 disabled 不是安全边界；直接 API 调用也必须由服务端拒绝，正式 current、历史状态、decision record 和 operation log 不得发生采用副作用。
- 已经成为正式 current 的历史正文不自动撤销、不静默覆盖；页面可提示其字数状态，并引导用户显式重写。本包不批量回写历史正式正文。

## 5. 失败、费用与恢复

长度不合格不得触发自动续写、自动 repair、自动 retry 或隐藏的第二次模型调用。

安全公共失败至少包含：

- 稳定错误码 `NOVEL_CONTENT_LENGTH_OUT_OF_RANGE`。
- `lengthStatus`: `too_short | too_long`。
- `countMode`、`targetCount`、`actualCount`、`lowerBound`、`upperBound`。
- 可追踪的 `taskId`、`requestId`（存在时）。

错误响应、任务摘要、任务事件和日志不得包含完整正文、prompt、raw provider response、API key、认证头或可还原正文的大段片段。已授权的候选正文读取接口可以返回正文，这是产品功能，不属于错误链路泄露；provider 内部 taskName 不得作为用户错误文案。

页面必须提供显式“重新生成”动作，并在确认文案中说明：

- 这是新的模型调用，可能产生新费用。
- 上一次不合格结果不会被采用或自动续写。
- 取消确认零副作用。
- 同一 task 仍为 `pending/processing` 时入口禁用，刷新或新标签页不得重复发起。

## 6. UI 结果合同

正文候选、任务结果和采用确认区域必须展示：

- 目标字符数 `T`。
- 实际字符数 `A`。
- 合格区间 `L-U`。
- 状态：`合格`、`偏短` 或 `偏长`。
- 不合格时的下一步：显式重新生成；历史正式正文则引导显式重写。

页面用语必须写“字符数”，并说明口径为“忽略空白、含标点”；不得继续以含义不明的“字数达标”替代。UI 计算只用于展示，服务端结果是权威门禁。

## 7. E0-E6 证据目标

| 等级 | 本包目标 | 允许结论 | Not proven |
| --- | --- | --- | --- |
| E0 | 冻结字符口径、容差、动作范围、失败和费用边界 | 契约已定义 | 功能已实现 |
| E1 | 共享长度判定合同、安全错误 DTO、动作到门禁映射一致 | 静态合同已冻结 | API/页面可用 |
| E2 | 纯函数、五类动作、持久化前门禁和采用前二次门禁的 deterministic 测试通过 | 纯逻辑与 fake provider 通过 | 真实 provider 稳定 |
| E3 | in-memory API 证明合格结果可保存、不合格结果资产增量为 0、历史短候选不可采用 | 内存 API 链路通过 | MySQL/Prisma 可用 |
| E4 | 本地浏览器证明目标/实际/区间/状态、失败恢复、刷新防重复和采用阻断 | mock/local 用户链可操作 | 真实模型输出达标 |
| E5 | 一个固定样本、一个固定目标、一次真实模型调用、自动 retry=0；输出须命中区间并形成脱敏可复算摘要 | 指定 provider canary 通过 | 长流程稳定、不同题材普遍达标 |
| E6 | `not_proven`，不连接真实 MySQL/Prisma，不作为本包关闭门禁 | 无 | 真实数据库持久化、并发、重启和回滚 |

E5 最多允许一个固定样本的一次付费调用。调用前必须冻结 model/prompt/目标、`maxCalls=1`、token 上限、费用上限和零自动重试；失败即 E5 失败，不得在同一验收中再次付费尝试。安全摘要只保存 Git SHA、模型/提示词版本、目标/实际/区间/状态、token、耗时、费用上界、callCount、request/run ID 和结果 hash，不保存正文或 raw response。

## 8. 测试矩阵

| 编号 | 场景 | 必须断言 |
| --- | --- | --- |
| L-01 | NFC：预组合字符与分解序列 | NFC 后按 code point 得到相同结果 |
| L-02 | Unicode code point：emoji/辅助平面字符 | 每个 code point 计 1，不按 UTF-16 code unit 计 2 |
| L-03 | Unicode 空白 | 空格、换行、制表符、不换行空格均不计数 |
| L-04 | 标点、数字、拉丁字符 | 所有非空白 code point 均计数 |
| L-05 | 容差边界 | `L-1/L/U/U+1` 分别为短/合格/合格/长，取整与契约一致 |
| L-06 | 第 1 章多个候选 | 每个候选分别校验；任一不合格时本次生成资产增量为 0 |
| L-07 | 第 2-3 章试写 | 两章分别使用自己的当前目标，禁止复用第 1 章或平均目标 |
| L-08 | 批量正文 | 每章分别校验；失败章可定位，整次动作无候选/正文资产增量 |
| L-09 | 单章生成与重写 | 合格结果可进入候选；短/长结果安全失败且无写入 |
| L-10 | 持久化顺序 spy | 长度判定发生在 candidate/version/feature/review/memory/receipt 写入之前 |
| L-11 | 历史候选采用 | 当前目标重算后不合格时 API 拒绝，current/history/decision/oplog 零变化 |
| L-12 | stale/缺失目标 | provider=0、task-result=0、asset=0，返回安全业务错误 |
| L-13 | UI 展示与恢复 | 展示目标/实际/区间/状态；显式重生成确认；取消零副作用；刷新不重复调用 |
| L-14 | 隐私 | 错误 DOM、console、storage、失败 network response、task DTO 和日志无正文/prompt/raw/key/auth 泄露；授权正文读取响应仅返回用户有权查看的正文 |
| L-15 | E5 canary | 固定样本一次调用、callCount=1、retry=0、结果合格、预算内、摘要可复算 |

## 9. 包预算与变更门禁

- hard max changed files：`20`。
- hard max net additions：`2000`。
- 预算包含生产代码、测试、浏览器证据脚本和本契约；生成产物不得通过 ignore 规避计数。
- 主控将预算从 `14/1200` 调整为全局硬上限 `20/2000`：五条生成链路必须保留短/长双侧、零隐藏重试、零资产副作用、刷新回读和浏览器费用确认回归；不以删减负向验收换取较小 diff。Prisma 读取不在本包实现，E6 仍为 `not_proven`。
- 超过任一上限时不得继续堆叠实现，必须缩小范围或由主控重新批准新的预算 ADR。
- 本包只能影响 `RMD-NOV-QUALITY-001`；不得顺带修改其他总账状态。

## 10. 明确非目标

- 不实现自动付费续写、自动模型重试或多次 E5 抽样。
- 不实现正文 batch checkpoint、失败段续跑或长期记忆算法；这些仍归 `RMD-NOV-BATCH-001`。
- 不实现通用 JSON repair/分段恢复；这些仍归 `RMD-NOV-AI-001`。
- 不实现真实 MySQL/Prisma、migration、current 唯一性、并发、重启或回滚；E6 保持 `not_proven`。
- 不关闭或推进 `RMD-NOV-DB-001`、`RMD-NOV-VERSION-001`、`RMD-NOV-PROVIDER-001`、`RMD-NOV-ERROR-001` 或 `RMD-TEST-CONTENT-001`。
- 不修改题材/爽点偏好、章节目录生成策略或用户已有目标字数编辑能力。
- 不评估重复率、人物一致性、连续性、爽点、钩子、原创性或内容安全；本包只处理正文字符数。
- 不生成、修改或发布 TTS、字幕、渲染、云存储、MP4、下载或平台发布能力。
- 不自动撤销、覆盖或批量重写既有正式正文。
- 不修改 `docs/remediation/issue-ledger.md` 或任何现有账本状态。

## 11. 2026-08-03 验收运行记录

本节记录当前候选实现的真实结果，不提升本包或总账状态。

| 证据 | 结果 | 可得结论 | 边界 |
| --- | --- | --- | --- |
| E2/E3 API focused | `105/105 PASS` | 纯函数、五类生成动作、权威 target 透传、单次 provider 调用、持久化前 fail-closed 与失败刷新回归通过 | 2026-08-03 本轮候选重跑；`5 JSON + 5 transport + 81 routes + 14 provider`；in-memory/fake provider |
| E2 admin unit | `80/80 PASS` | DTO 映射、刷新稳定 QA 夹具与缺失门禁 fail-closed 通过 | 既有验收记录；本轮后端限定写范围未重跑 admin |
| E2 admin DOM | `32/32 PASS` | 缺失/短候选 fail-closed、目标变化后旧门禁不覆盖、费用确认 cancel=0/confirm=1、批量正文恢复入口通过 | `npm run test:dom -w apps/admin-web`，happy-dom |
| E4 local browser | `PASS` | 可见实际/目标/区间/状态；偏少候选采用禁用；刷新后权限保持；重新生成先展示新调用/费用/不自动续写/取消零调用文案 | `VITE_DATA_SOURCE=mock`；不证明真实模型或数据库；调用次数由同场 DOM spy 证据补强 |
| E5 real DeepSeek | `FAIL` | 单次真实调用被门禁正确识别为偏长；没有隐藏 retry | 固定目标 800；实际 972；修正后区间 720-920；callCount=1；retryCount=0；耗时 54105ms；resultHash=`3f215f5868a1f50d898e60b8c98b9881826b26679ab8a7951659f7b5494e7009` |
| E6 MySQL/Prisma | `not_proven` | 无 | 未连接真实数据库 |

E5 首次运行暴露两个问题并已进入候选修正：

1. `floor(T * 1.15)` 受 IEEE-754 浮点误差影响，`T=800` 曾错误得到 919；实现已改为整数比例计算，正确上界为 920，并增加 `L-1/L/U/U+1` 回归。
2. provider 仅给出宽区间时，真实模型输出 972，超过修正后上界 52；prompt 已增加优选区间、自检与压缩指令，但依照冻结预算，本次验收不进行第二次付费调用。

本轮后端修复的可复算证据为：

1. `npm run typecheck -w @ai-shortvideo/api`：通过。
2. `npm exec -w @ai-shortvideo/api -- tsx --test src/modules/ai/jsonOutput.test.ts src/modules/ai/openAiCompatibleClient.test.ts src/modules/novels/novelRoutes.test.ts src/modules/novels/providers/deepseekNovelProvider.test.ts`：`105/105 PASS`。
3. 全仓 `npm test --workspaces --if-present`：`277/277 PASS`；`npm run typecheck`、`npm run build` 与 `git diff --check` 均通过；build 仅保留仓库已知的 VueUse annotation 与主入口 chunk 警告。
4. 五类生成动作的短/长双侧回归均断言 provider `callCount=1`，且正文版本、feature card、review、memory、body batch、decision、operation log 和章节 current 指针无增量/无变化。
5. 长度失败任务持久化为 `content_length_out_of_range / NOVEL_CONTENT_LENGTH_OUT_OF_RANGE`，并通过 `GET /tasks/:taskId` 刷新回读一致性断言；详情仅包含可理解的实际字符数与合格区间，不包含正文、prompt 或 key。
6. 上述代码回归证明门禁和费用边界的实现正确，不改变 E5 真实模型样本仍为 `FAIL`的事实；本轮未发起新的付费调用。

E4 可复跑步骤：

1. 启动：`VITE_DATA_SOURCE=mock npm run dev -w apps/admin-web -- --host 127.0.0.1 --port 5191 --strictPort`。
2. 打开：`http://127.0.0.1:5191/novels/qa-length-gate?step=trial`。
3. 断言 v2 展示 `实际 1420 / 目标 2200 / 合格区间 1980-2530 / 字符数偏少`，且“选这个继续试写”禁用。
4. 刷新页面，重复断言状态和权限不变，不自动发起生成。
5. 点击“重新生成字符数合格候选”，断言先出现“确认重新生成试写候选”，文案包含新的模型调用、可能产生新的模型费用、旧结果不会被采用或自动续写、取消不产生新调用。
6. 自动化补强：`NovelDetailWorkbench.dom.spec.ts` 断言取消时 `generateTrial=0`，确认时 `generateTrial=1`；同文件还断言缺失 gate 阻止采用、当前章节目标变化后旧批次 gate 不再覆盖、正文不合格提供“重写本章”。
7. 本次浏览器会话未保存 network trace 或截图，不得据此声称真实 provider、真实费用、真实数据库或新标签并发已经通过。

因此当前候选只允许表述为：`E2/E3/E4 通过，E5 失败后修正待新验收运行，E6 not_proven`。在新的独立 E5 运行成功、独立复核通过和正常合并前，不得关闭 `RMD-NOV-QUALITY-001`。
