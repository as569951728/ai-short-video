# RP-04C 全书审稿证据合同

## 1. 合同定位
| 字段 | 内容 |
| --- | --- |
| package_id | RP-04C |
| target_issue_id | RMD-NOV-REVIEW-001 |
| acceptance_id | NOV-REVIEW-QUALITY-01 |
| target_evidence | E5 受控真实模型 canary + E3 确定性回归 |
| user_result | 全书审稿必须基于完整、可追溯的全书证据发现跨章节冲突，不能只读取章节元数据 |

本文冻结 RP-04C 的输入证据、失败语义、付费幂等、真实模型 canary 和隐私边界。本文不是研发授权、关闭证据或总账状态变更；`RMD-NOV-REVIEW-001` 只有在本合同全部验收项通过并取得独立 TEST、PRODUCT、QUALITY 结论后才可申请关闭。

## 2. 核心原则
1. **全章节覆盖**：正式目录中的每个计划章节必须且只能出现一次，章节号连续，且全部指向当前正式正文、当前 feature card 和当前单章 review。
2. **证据优先于结论**：模型输入必须包含正文分层证据、feature/review/memory 证据和 coverage manifest；只有章节标题、字数、状态等元数据时禁止调用 provider。
3. **来源可追溯**：每条送模证据都必须绑定稳定对象 ID、版本或 revision、内容摘要哈希和章节号；审稿报告必须回写同一份 manifest 的摘要引用。
4. **调用前 fail closed**：缺失、重复、顺序异常或 stale 不能降级为部分审稿，必须在 provider 前失败，且 provider 调用增量为 0。
5. **付费调用至多一次**：同一 actor、小说、来源快照、策略版本和幂等键只允许一次真实付费调用；重放只能复用既有任务或结果。
6. **隐私最小化**：完整正文只能进入受控 provider 请求体，不能进入普通日志、错误详情、任务摘要、浏览器响应或测试 artifact。

## 3. 全章节覆盖合同

### 3.1 权威章节集合
权威章节集合以当前已采用章节目录为基准，按 `chapterNo` 升序生成。每章必须同时满足：

- `chapterId` 唯一且属于当前 tenant 和 novel。
- `chapterNo` 唯一、连续并落在正式目录范围内。
- `currentContentVersionId` 存在，正文非空且未 discarded。
- `currentFeatureCardVersionId` 存在，且与该正文版本的事实范围一致。
- `currentReviewReportId` 存在，且审稿对象为该正文版本。
- 正文、feature card、review 三类对象都能生成非空稳定哈希。

计划章节总数、正文总数、feature card 总数、review 总数必须完全相等。任何集合数量不相等、章节映射一对多或多对一，都属于 `coverage_incomplete`，不得调用 provider。

### 3.2 Coverage manifest
每次全书审稿必须先生成不可变 `coverageManifest`，至少包含：

| 层级 | 必需字段 |
| --- | --- |
| 根 | `manifestVersion`, `tenantId`, `novelId`, `chapterPlanVersionId`, `policyProfileVersionId`, `chapterCount`, `coveredChapterNos`, `manifestHash` |
| `chapters[]` | `chapterId`, `chapterNo`, content/feature/review 各自的当前 ID、revision 与 hash |
| `memory` | `memoryId`, `memoryRevision`, `memoryHash` |

`manifestHash` 必须由规范化后的完整 manifest 计算，不能包含当前时间、随机数或请求 ID。provider 输入、任务 authority snapshot、结果 provenance 和关闭证据必须引用同一个 `manifestHash`。

## 4. 正文分层证据合同
每章送模证据必须包含章节身份与正文版本、目标/起止状态/关键事件/承接点摘要、人物/关系/地点/时间线/物件/数量/承诺/伏笔事实断言、带章内定位的最小证据片段，以及原文/摘要字符数、片段数和内容哈希。

全书证据按确定性规则生成章级证据、阶段摘要与事实变化、全书人物弧线/主线/时间线/伏笔闭环，并保留与 manifest 的覆盖映射；禁止简单拼接全文后截断。

达到上下文预算上限时，应减少证据片段冗余或分阶段审稿，不能静默删除尾部章节。任一章节没有进入最终审稿上下文时，整体审稿必须失败为 `coverage_incomplete`。

## 5. Feature、Review 与 Memory 证据
- Feature card 投影核心冲突、人物状态变化、事实变更、伏笔、风险和正文版本绑定，但不得替代正文证据。
- 单章 review 投影评分、问题、级别、证据定位、处理状态和策略版本，并区分已解决与未解决阻塞。
- 长期 memory 覆盖人物、关系、时间线、关键事实、未回收伏笔和已接受风险，必须与当前正文范围匹配且具有稳定 ID、revision 和 hash。

## 6. Provider 前 fail-closed 门禁
以下检查必须发生在真实 provider 调用前，并可用 provider spy 证明调用增量为 0：

| 场景 | 受控结果 | provider 增量 | 资产/结果增量 |
| --- | --- | --- | --- |
| 缺任一计划章节正文 | `coverage_incomplete` | 0 | 0 |
| 缺任一 feature card 或单章 review | `evidence_incomplete` | 0 | 0 |
| 缺失或过期长期 memory | `memory_stale` | 0 | 0 |
| 章节号、对象 ID 或版本引用重复 | `coverage_duplicate` | 0 | 0 |
| manifest 生成后任一来源版本变化 | `source_stale` | 0 | 0 |
| manifestHash 与 authority snapshot 不一致 | `source_stale` | 0 | 0 |
| 上下文预算导致章节未覆盖 | `coverage_incomplete` | 0 | 0 |
| 同幂等键绑定不同 manifest 或策略 | `idempotency_conflict` | 0 | 0 |

门禁至少执行两次：claim 或预占前一次，provider 调用前按权威仓储重新读取并验证一次。失败后禁止通过补默认值、跳过章节、复用旧 memory 或缩减到元数据模式继续调用。

## 7. 单次幂等付费合同
调用身份为 `tenantId + userId + novelId + action + idempotencyKey + manifestHash + reviewPolicyVersionId + providerRouteFingerprint`。首次有效请求最多调用 provider 一次；同身份 waiting/processing/terminal 重放复用 taskId；同键但 manifest/策略/路由变化时返回冲突且不调用 provider。超时、刷新、多标签和网络重放均不得触发第二次付费调用；未知结果不得自动付费重试。测试同时断言 provider 调用、task、审稿资产、事件和费用记录计数。

## 8. 固定冲突 Fixture

正式 fixture 必须版本固定、可重复 seed，并至少包含 12 个连续章节和以下三类预置冲突：

| 冲突类型 | 固定样例 | 通过要求 |
| --- | --- | --- |
| 人物状态冲突 | 某人物在前章明确死亡，后章无解释重新出现 | 报告定位两章并判定为 blocking |
| 时间线冲突 | 同一事件在不同章节出现互斥日期或先后顺序 | 报告定位相关章节并给出统一时间线建议 |
| 关键事实冲突 | 同一合同金额、股权比例或关键物件归属前后不一致 | 报告引用正文证据并给出修复建议 |

fixture 还应包含至少一个相似但不冲突的对照事实，避免模型仅按关键词误报。验收报告必须记录预置冲突命中数、漏报、误报、证据章节正确性和 gateResult；只断言“返回了问题数组”不算通过。

## 9. E5 受控真实模型 Canary

### 9.1 前置条件

- 使用固定 fixture、固定模型路由、固定 prompt/version 和固定审稿策略。
- 明确单次费用上限、最大 input/output tokens 和最大调用次数 1。
- API Key 通过安全环境注入，不写入仓库、命令行回显或 artifact。
- 禁止自动付费重试；timeout、rate limit、quota、network 和 malformed output 均安全失败。
- canary 前先通过相同 manifest 的 deterministic provider 测试和全部 fail-closed 负向测试。

### 9.2 最低 E5 证据

E5 证据只保存安全摘要，至少包括：

- Git SHA、fixture 版本、manifestHash、模型名和 promptVersion。
- 覆盖章节数与章节号范围，不保存完整正文。
- input/output token 数、耗时、费用上限和实际调用次数。
- 三类固定冲突的命中、漏报、误报和证据章节。
- gateResult、失败分类、requestId 安全摘要和结果 provenance。
- 独立 TEST 与 QUALITY 的复核结论。

真实模型输出只有在 schema 校验、证据引用校验和固定冲突基准通过后，才可进入候选审稿报告；不得自动成为完成门禁的正式结论。

## 10. 日志与隐私

普通日志、错误响应、任务列表、浏览器控制台和测试 artifact 禁止记录：

- API Key、认证头和 provider token。
- 完整 prompt、完整正文、完整 feature/review/memory 内容。
- 完整 provider 原始响应。
- 可还原用户正文的大段证据片段。

允许记录的字段仅限 requestId、taskId、novelId、manifestHash、对象版本 ID、安全错误码、token 数、耗时、调用次数和脱敏结果摘要。安全诊断需要原始内容时，只能进入明确授权、限时、访问受控的隔离证据存储，并记录销毁时间。

## 11. 验收清单

RP-04C 申请关闭前必须全部满足：

1. 正向 fixture 的全部计划章节在 manifest 中恰好出现一次，四类证据计数一致。
2. Provider payload 包含正文分层证据、feature/review/memory 证据及 manifestHash，不是章节元数据列表。
3. 缺失、重复、stale 和上下文截断负向用例全部证明 provider/task-result/asset 增量为 0。
4. 固定三类冲突均被识别并定位到正确章节，对照事实不被误判为 blocking。
5. 同一幂等身份在刷新、多标签和网络重放下真实 provider 调用次数为 1。
6. E5 canary 在费用上限内完成，schema、证据引用和隐私检查通过。
7. 阻塞冲突产生 blocked gate；未处理或无强制通过原因时不能确认完结。
8. 独立 TEST、PRODUCT、QUALITY 均为 approved，且 `not_proven` 不包含本合同关闭条件。

## 12. 明确非目标

本合同不包含，也不得借 RP-04C 宣称完成：

- Prisma 全书审稿写路径、完结确认写路径或真实 MySQL 完本 E2E。
- `RMD-NOV-DB-001`、`RMD-TASK-001`、`RMD-TASK-002` 或其他总账问题关闭。
- 独立 worker、heartbeat、restart recovery、真实 retry child 或 HTTP 202 transport。
- 章节正文生成 checkpoint、失败段续跑、目标字数门禁或长期 memory 生成算法重构。
- 全书审稿 UI 重做、候选状态机重做或跨页面交互治理。
- 视频旁白、TTS、字幕、MP4、媒体存储、下载或发布能力。
- 无费用上限的批量真实模型调用、自动付费重试或生产流量放量。
- 用 mock、静态 JSON、标题断言或页面 loading 代替 E5 canary 和独立验收。
