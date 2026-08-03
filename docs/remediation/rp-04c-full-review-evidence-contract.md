# RP-04C 全书审稿证据合同
## 1. 定位
| 字段 | 内容 |
| --- | --- |
| package/issue/acceptance | `RP-04C` / `RMD-NOV-REVIEW-001` / `NOV-REVIEW-QUALITY-01` |
| target evidence | E5 受控真实模型 canary + E3 确定性回归 |
| user result | 全书审稿基于完整、可追溯证据发现跨章冲突，而非只读章节元数据 |
本文冻结输入证据、失败语义、付费幂等、E5 和隐私边界；不是研发授权或关闭证据，只有全部验收项通过并取得独立 TEST、PRODUCT、QUALITY 结论后才可申请关闭。
## 2. 权威证据与覆盖
1. 正式目录每个计划章节必须且只能出现一次，章节号连续，并指向当前正式正文、feature card、单章 review 与覆盖最终正文的长期 memory；每类对象均绑定稳定 ID、revision/version、hash 和章节号。
2. `coverageManifest` 至少包含 tenant/novel、chapter plan、policy、chapterCount/coveredChapterNos、各章三类当前对象引用、memory 引用和规范化 `manifestHash`；provider、task authority、result provenance 与关闭证据引用同一 hash。
3. 每章证据包含目标、起止状态、事件、承接点、人物/关系/地点/时间/物件/数量/承诺/伏笔事实和章内最小片段；按确定性规则形成阶段与全书摘要，禁止拼接全文后截断。
4. 达到上下文上限时只能减少冗余或分阶段审稿；任一章节未进入最终上下文即 `coverage_incomplete`。Feature/review/memory 只能补充，不能替代正文证据。
## 3. Provider 前门禁与一次付费
| 场景 | 结果 | provider/task-result/asset 增量 |
| --- | --- | --- |
| 缺正文、feature、review 或 memory | `coverage_incomplete/evidence_incomplete/memory_stale` | 0/0/0 |
| 章节号、对象或版本重复 | `coverage_duplicate` | 0/0/0 |
| 来源变化或 manifest/authority 不一致 | `source_stale` | 0/0/0 |
| 截断导致未覆盖 | `coverage_incomplete` | 0/0/0 |
| 同 key 绑定不同 manifest/policy/route | `idempotency_conflict` | 0/0/0 |
claim 前及 provider 前均须从权威仓储验证；禁止默认值、跳章、旧 memory 或元数据降级。调用身份为 tenant/user/novel/action/key/manifest/policy/provider route；首次有效请求最多一次，waiting/processing/terminal 重放复用 taskId，未知结果不得自动付费重试。
## 4. 固定冲突与 E5
固定 12 章 fixture 必须含：人物明确死亡后无替身、梦境、假死、复活或时间回溯解释地再次出现；同一事件互斥日期；同一合同金额等关键事实冲突；另有相似但不冲突的对照。三类均须以正确 dimension、blocking 状态和精确章节集合命中，对照不得误报。
E5 前置：固定 fixture/model/prompt/policy；`maxCalls=1`，明确输入/输出/总 token 与费用上限；密钥仅安全注入；自动 retry=0；deterministic 与负向门禁全绿。第二次调用必须在真实 client 前被拒绝。
E5 安全摘要：Git SHA、fixture、manifestHash、model、promptVersion、run/request ID、evidence/result hash、provider route、覆盖、usage、耗时、调用/token/费用上限及保守费用上界、命中/漏报/误报、gate/failure/provenance；不保存正文或 raw response。
## 5. 隐私与验收
普通日志、错误、任务列表、浏览器与 artifact 禁止 API Key/认证头/token、完整 prompt/正文/feature/review/memory/raw response 或可还原正文的大段片段；只允许安全 ID/hash、错误码、token、耗时、调用数和脱敏摘要。
关闭前必须同时满足：12 章与四类证据完整唯一；payload 非元数据列表；缺失/重复/stale/截断均 provider=0；三类冲突精确命中且对照不误报；刷新/多标签/重放调用为 1；E5 在预算内且 schema/引用/隐私通过；blocking 未解决时不能完结；TEST/PRODUCT/QUALITY approved 且关闭条件不在 `not_proven`。
## 6. 非目标
不包含 Prisma/MySQL 完本 E2E、`RMD-NOV-DB-001`/`RMD-TASK-*` 关闭、worker/restart/retry child/HTTP 202、正文 checkpoint/续跑/字数/memory 算法、UI/候选状态机重做、视频生产发布、无上限批量模型调用，亦不得用 mock/loading/标题断言替代 E5 与独立验收。
