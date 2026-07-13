# RP-02B2 多 Agent 准入复核记录

日期：2026-07-13

评审对象：原 `docs/modules/rp-02b-worker-recovery-implementation-package.md` 中的 RP-02B2

当前结论：`rp02b2a_single_package_superseded_split_round6_approved_asset_submission_pending`。`RP-02B2a0` 已以 `2da6d31` 完成；原 B2a 23-file/2,000-net-additions 授权因正式生产链验收出现 P0/P1 而撤销。B2a1-B2a5 拆包资产第六轮四角色全部 approved 且 P0/P1=0，当前只进入治理资产提交与远程治理；五包均未授权。`RMD-TASK-002` 仍为 `partial`；总账 9/42；B2b/B2c/B3、真实 DB/provider/media 继续冻结。

版本说明：第 1-25 节只记录历史事实；当前以专属实现包第 17 节、上位矩阵和本文第 26 节为准。旧授权资产、远程治理成功和原单包 green tests 不能覆盖后续正式 QUALITY 反证。

## 1. 评审边界

- 只读评审需求、现状代码、验收和安全边界，不修改业务代码。
- 不连接真实 MySQL/provider/media，不执行 E6，不启动 B3 recovery/retry。
- RP-02B1 13/13 通过只作为稳定基线，不构成 B2 证据。

## 2. 初审会话

| 角色 | Agent | 初始结论 | P0/P1/P2 | 主控处理 |
| --- | --- | --- | --- | --- |
| 后端架构 | `019f5987-1d1f-75a3-952e-4a03ac2e96b1` | rejected | 3/5/2 | 接受；补 envelope 审计字段、原子 finalize、retry 冻结、拆 B2a/B2b |
| 产品交互 | `019f5986-7e35-7862-afea-cae01c798616` | rejected | 4 个 P0、6 个 P1 | 接受；补真实 taskId、202/200 判别、刷新/多标签/transport unknown 和状态文案 |
| 独立 TEST | `019f5987-bb3c-7f92-be64-e38a38887bc1` | rejected | 2/4/0 | 接受；拆 B2/B3 场景、独立命令、ManualClock/PausedScheduler/Barrier/DOM 证据 |
| QUALITY/安全 | `019f5988-59da-7323-9a13-38fab6a61e2b` | rejected | 3/6/1 | 接受；补 transaction asset sink、dispatch CAS、15-action authority、tenant/secret/shutdown/capability 和预算拆分 |

## 3. 初审共同阻塞

1. 业务资产、receipt、task 终态和 event 没有同事务 fenced finalize。
2. provider 调用前没有持久 lease-CAS checkpoint。
3. 15 action 没有逐项定义 authoritative reload 与两次 stale 比较。
4. ExecutionEnvelope 不能完整重建结构、试写、重写、adopt-impact 的审计/finalize 输入。
5. retry API 已能创建不完整 queued child；启动 B2 worker 会越界消费，必须先冻结。
6. HTTP/admin 没有 `202 accepted | 200 existing` 判别合同；页面会误报完成并清 pending。
7. 页面使用本地假 taskId，无法刷新、多标签和重复点击收敛。
8. 原 25 场景混合 B1/B2/B3/E6，且没有显式 deterministic phase 控制。
9. 原 `15 files / 1,700 additions` 对完整范围不现实。

## 4. 历史首版修订结果

主控建立 B2 专属包并冻结：

- `RP-02B2a`：ExecutionEnvelope V1.1、15-action matrix、checkpoint、dispatcher、双 stale gate、原子 fenced finalize、capability/retry gate。
- `RP-02B2b`：queued claim、202 contract、worker lifecycle/heartbeat/shutdown。
- `RP-02B2c`：admin 真实 taskId、稳定幂等键、精确轮询、刷新/多标签恢复和 DOM transport。
- `RP-02B3`：recovery/restart/retry/unknown/poison/预算，继续冻结。
- B2a/B2b/B2c 的唯一有效路径 manifest 与预算以专属实现包第 14 节为准；初审记录中的旧预算全部失效。
- B2a/B2b/B2c 分别有独立目录、命令、deterministic 场景、TEST/QUALITY、commit/push 和远程 CI。

## 5. 历史首版复审门禁

必须把修订稿重新发送给四名原评审：

- product_review = approved
- architecture_review = approved
- test_review = approved
- quality_review = approved
- P0 = 0
- P1 = 0

当时复审门禁已被第五轮后的 B2a0 拆包替代，不可再执行。当前只允许按本文开头的版本说明和最新复审节判断授权。

## 6. 第二轮复审

第二轮仍为 rejected，主控继续接受并修订：

- authority snapshot 扩展到 preferences、有序试写章节、正文前序内容、长期记忆和上一批摘要；未纳入 identity 的持久值禁止传 provider。
- finalize 删除 caller-controlled expected hash，只从锁定 task 的 envelope 派生并在事务内重算。
- providerAttemptId 在 dispatch checkpoint 必填，B2 只允许 single-attempt mock provider。
- 既存 `retryOfTaskId != null` child 同样 provider=0 安全失败。
- risk trial followup 增加 confirmRisk/selectionReason 全链审计。
- public DTO 删除 idempotency key；admin 使用单调版本 submission intent，同 key 同 request 重放找回 taskId。
- B2b async gate 默认关闭，B2c 完成后才允许 development+mock 激活，避免中间提交破坏现有 Admin。
- 三个子包均改为精确路径级 write-set manifest；parent 的旧 25 场景正式失效。

第二轮尚未形成 P0/P1=0，修订稿必须再次发送原评审复核。

## 7. 第三轮复审

| 角色 | 结论 | P0/P1/P2 | 尚未关闭的主要门禁 |
| --- | --- | --- | --- |
| 后端架构 | rejected | 1/5/3 | receipt 必须由 repository 在资产 ID 产生后事务内构造；requestedAt 重放；原子 intent CAS；gate-off 兼容；单一 execution registry 与真实 manifest |
| 产品交互 | rejected | 0/3/2 | 隐藏既有 retry/cancel/重新生成入口；关键合同进入 deterministic 场景；上位预算和产品准入门禁统一 |
| 独立 TEST | rejected | 0/3/2 | 保存规范化重放请求；既存 retry child 前置终态；唯一预算来源与 operation-log 原子断言 |
| QUALITY/安全 | rejected | 0/5/0 | risk selection route/service 全链；B2b claim outcome；可重放 intent；过期 heartbeat 不得复活；跨文档冲突 |

主控接受并执行第四轮前修订：

- `finalizeLeasedAction` 删除 caller-provided receipt；repository 在同一事务写资产、取得真实 IDs、构造 canonical receipt，再写 task/operation log/event。
- checkpoint 改为 phase-discriminated union，`provider_call_started` 强制 attemptId/dispatchedAt。
- 同 key replay 先加载既存 task，复用持久 requestedAt 和服务端 snapshot；admin 保存 strict、secret-free、限长的 `normalizedReplayRequest` 并在重放前校验 hash。
- admin intent 通过 `SubmissionIntentStore.compareAndSet` 原子写入；增加双标签 barrier、旧 revision、transport unknown 同 key 同 payload 的 deterministic 场景。
- B2a manifest 纳入 shared schema、route、NovelService 和单一 `ActionExecutionPlan` registry；B2b manifest 纳入 NovelService 显式传播 claim outcome。
- B2c 在 15 类 provider-backed task 隐藏既有 retry/cancel/取消本地等待/重新生成入口，mutation API 调用必须为 0；这些语义继续留给 RP-02C。
- 补过期 owner heartbeat 不得复活 lease、risk reason roundtrip、既存 retry child provider 前终态、gate-off 同步兼容与 production/non-mock gate 拒绝场景。
- parent/review 删除重复预算，program/matrix 同步 retry child、operation log 和 TASK-SURFACE 边界。

上述修订已进入第四轮独立复核；第四轮结果与后续修订见下节。

## 8. 第四轮复审

| 角色 | 结论 | P0/P1/P2 | 尚未关闭的主要门禁 |
| --- | --- | --- | --- |
| 后端架构 | rejected | 0/3/2 | `RETRY_NOT_AVAILABLE` 缺 shared typed error；首 checkpoint 应为 leased；B2b 缺 repository 写集；capability 不得由环境猜测 |
| 产品交互 | rejected | 0/5/0 | leased phase；high-risk reason 在 Admin 丢失；服务端 capability；跨标签真正原子 intent；失败终态 event/log 同事务 |
| 独立 TEST | rejected | 0/3/2 | shared typed error；leased phase；novel/chapter provider-visible 输入未形成确定性 identity；B2c retry 冻结与真实跨标签边界 |
| QUALITY/安全 | rejected | 0/4/1 | leased phase；shared typed error；风险原因透传；submission intent secret canary；retry 文案精确化 |

第四轮汇总为 `P0=0、P1=15、P2=5`，继续拒绝实现授权。主控接受并形成第五轮前修订：

- checkpoint 首相位统一为既存持久枚举 `leased`；claim 不写 attemptId，只有 `prepared -> provider_call_started` 原子创建 attempt。
- `packages/shared/src/api.ts` 纳入 B2a，新增正式 `409 RETRY_NOT_AVAILABLE`，禁止字符串或强制 cast。
- 定义严格 `NovelProviderInputV1/ChapterProviderInputV1` 白名单和 canonical hash；raw repository entity 不得传 provider，关键小说/章节字段变更必须 stale 或证明未使用。
- 所有 lease-held 受控失败统一进入 repository `failLeasedAction`，task 终态、lease/active claim 释放、唯一 terminal event 和 required operation log 同事务；增加 event/log 故障注入。
- B2a 纳入 high/blocking 试写 `confirmRisk/selectionReason` 的 Admin 同步透传和 DOM/service 回归，但不提前切异步 transport。
- B2b 纳入 in-memory/Prisma repository 写集和服务端 `NovelAsyncTransportCapabilityV1`；Admin 只认服务端 capability，不从 DEV/PROD 推断，gate-on 才禁止 inline provider。
- B2c 使用服务端 opaque `submissionScopeId`，以 `apiOrigin+scope+novel+action+object` 分区；权威 CAS 使用 IndexedDB readwrite transaction 或 Web Locks + IndexedDB，localStorage/BroadcastChannel 仅通知；能力或原子 store 未知时 POST=0。
- 增加 `admin_submission_intent_secret_canary`，自由文本中的 key/Authorization/Cookie/token 形态使 intent/receipt/storage/log 零落盘且 POST=0。
- B2a/B2b/B2c 精确 manifest 调整为 `16/12/18 files`，对应净新增预算 `2200/1800/2100`；真实浏览器跨标签投递仍明确 not_proven。

第五轮仍必须发送给原四名评审。只有四路 `approved` 且 P0/P1=0，才进入需求资产 commit/push 与远程治理；该门禁本身仍不等于研发或关闭证据。

## 9. 第五轮复审

| 角色 | 结论 | P0/P1/P2 | 主要阻塞 |
| --- | --- | --- | --- |
| 后端架构 | rejected | 0/3/2 | provider strict projection 与现有 public ABI/写集不闭合；可信 actor/scope HMAC 来源未冻结；shutdown grace 后迟到回调仍有写入歧义 |
| 产品交互 | rejected | 0/3/0 | capability checking/failure/expired/scope change 缺完整用户旅程；retry 冻结与 gate-off 同步动作冲突；拆包预算超过全局硬门禁 |
| 独立 TEST | rejected | 0/3/2 | `test:rp02b2a` 未覆盖 Admin 风险全链；B2b/B2c capability 场景归属混杂；provider nullable/长期记忆 identity 与 shutdown deterministic fixture 不完整 |
| QUALITY/安全 | rejected | 0/4/0 | raw repository entity 仍可能进入 provider；capability 可被默认 context 误启用；B2a/B2c 超过 2,000 行；异步动作隐藏规则会破坏 gate-off 同步路径 |

第五轮角色报告合计 `P0=0、P1=13、P2=4`；意见存在重叠，主控合并为 8 个唯一阻塞合同，不把重复角色意见冒充 13 个独立问题：

1. 新增前置包 `RP-02B2a0`，只修 high/blocking 试写风险参数同步全链；顺序改为 `B2a0 → B2a → B2b → B2c → B3`，各包独立验收/提交。
2. B2a provider public signature 直接使用 action-specific strict `Pick<>`，字段名对齐现有 ABI 的 `id`；`wordTarget` 保留 nullable，六个 provider 文件进入精确 manifest，raw entity/cast 禁止。
3. capability 冻结为 `GET /novels/async-transport-capability` 判别联合；只有注入的可信 `RequestContextResolver + scopeSecret + apiAudience` 可启用，scope 使用服务端 HMAC，默认 context 永远 disabled。
4. Admin 增加 capability checking、disabled、failure/unknown/expired/scope-change 明确旅程；失败只允许重新检查且 POST=0，缓存 TTL/过期和旧 scope intent 退休规则固定。
5. grace timeout 后本地 execution=`abandoned`；迟到 resolve/reject/abort 即使 lease 尚有效也不得 checkpoint/fail/finalize 或产生 repository 写入。
6. B2a 起 provider-backed task projection 固定 `retryable=false`；B2c 只在 gate-on 已关联异步 task 时隐藏 cancel/本地等待/重新生成，gate-off 旧同步动作保持不变。
7. `test:rp02b2a0` 精确覆盖 API+Admin service+DOM；`test:rp02b2a` 必须复跑该回归。B2b 只测服务端 capability，client unknown/expired/scope changed 归 B2c。
8. 预算修订为 B2a0 `8/700`、B2a `19/2,000`、B2b `12/1,800`、B2c `18/2,000`；B2b deterministic fixture 固定 ManualClock/PausedScheduler/DeferredProvider/10-worker barrier，gate-on smoke 才禁止 inline provider。

第六轮仍必须由原四名评审独立复核。只有四路 `approved` 且 P0/P1=0，才能提交/push 需求资产并运行远程治理；随后 MC 最多单独授权 `RP-02B2a0`，不得联动授权 B2a/B2b/B2c/B3 或真实环境。

## 10. 第六轮复审

| 角色 | 结论 | P0/P1/P2 | 主要阻塞 |
| --- | --- | --- | --- |
| 后端架构 | rejected | 0/3/0 | finalize authority 行 TOCTOU；HMAC 裸拼接碰撞；shutdown grace 与 settlement 缺原子仲裁 |
| 产品交互 | rejected | 0/2/0 | capability 重新检查成功后的终点不确定；taskId 绑定前后异步动作冻结/恢复不完整 |
| 独立 TEST | rejected | 0/3/1 | trusted actor 未覆盖 submit/poll 全链；HMAC 碰撞；B2c 缺生产 IDB deterministic fixture |
| QUALITY/安全 | rejected | 0/4/0 | trusted actor 未进入 B2 envelope/POST；HMAC 碰撞；B2a0 缺 secret canary；历史授权语句冲突 |

第六轮角色报告合计 `P0=0、P1=12、P2=1`；合并为 8 个唯一阻塞合同：

1. finalize 在同事务内锁定全部 authority 行或执行等价 identity CAS，并增加 authority 变化 barrier。
2. scope HMAC 改用 dedicated >=32-byte secret 与 canonical JSON/base64url，覆盖裸拼接碰撞和 Unicode 反例。
3. execution 用 `running -> settling | abandoned` 原子状态机仲裁，双方各自胜出的 barrier 都需证明。
4. 同一 authenticated RequestContextResolver 贯穿 B2 envelope、capability、15 POST、task/events poll 和 mutation；B2a 增列 `app.ts`，B2b 增列 `taskRoutes.ts`。
5. capability “重新检查”只更新缓存并进入 ready；不会自动创建 intent/POST，用户必须重新点击生成。
6. submitting/transport_unknown 和未终态 receipt 全程冻结异步 lifecycle 动作；已绑定 task 不受 capability 后续过期影响，scope 往返按旧 scope 恢复。
7. B2c production SubmissionIntentStore 使用 ManualClock、TwoTabBarrier、可注入 IDBFactory、transaction probe 和 deterministic bus，禁止 sleep/Map 替代。
8. B2a0 增加 selectionReason secret canary；历史节明确失效，唯一授权目标保持 B2a0。

第七轮仍必须由原四名评审独立复核。只有四路 `approved` 且 P0/P1=0，才能提交/push 需求资产并运行远程治理；随后 MC 最多单独授权 `RP-02B2a0`，不得联动授权后续包或真实环境。

## 11. 第七轮复审

| 角色 | 结论 | P0/P1/P2 | 主要阻塞 |
| --- | --- | --- | --- |
| 后端架构 | approved | 0/0/0 | 无；该角色准入 P0/P1 已清零 |
| 产品交互 | rejected | 0/1/0 | A scope 的 transport unknown 在切到 B 后被退休，无法回 A 使用同 key 核对 |
| 独立 TEST | rejected | 0/3/1 | B2a/B2b 场景边界、enabled=false 原因矩阵、CAS 后 capability TOCTOU 和命令精确性 |
| QUALITY/安全 | rejected | 0/3/0 | enabled=false 原因矩阵、POST 的 scope 服务端绑定、CAS identity 与分区单调 revision |

第七轮角色报告合计 `P0=0、P1=7、P2=1`；主控去重为 6 个唯一阻塞合同，不把重复角色意见冒充新问题：

1. scope A 中未绑定 taskId 的 `submitting/transport_unknown` 在切到 B 时转 `scope_suspended`；B 下零展示/POST/poll，回 A 后使用同 key/request/hash 继续核对。
2. B2a 场景 24 只证明 claim/envelope actor 一致且无默认回退；capability→POST→task/events poll 全链 actor/scope 证明只属于 B2b。
3. `enabled=false` 按 reasonCode 准确分流：只有 policy/environment 走旧同步；trusted context/secret/audience 缺失必须 fail closed，POST/task/provider/intent=0。
4. intent 保存 capability revision/scope/expiry 快照；CAS 后 POST 前必须重校验。所有 gate-on POST 携带 `expectedSubmissionScopeId`，服务端在 claim 前重算并 constant-time compare。
5. intent CAS 同时匹配 `expectedSubmissionId+expectedRevision`；revision 在同一分区跨 retired/新 submission 严格单调，旧标签不能覆盖新记录。
6. 独立命令固定为 `test:rp02b2a:core`；复合 `test:rp02b2a` 精确执行 core + B2a0。

上述合同已进入第八轮稿。只有原四名评审全部 `approved` 且 P0/P1=0，才能把当前包门禁从 `3/8` 推进到需求提交阶段；总问题关闭数仍为 `9/42`。

## 12. 第八轮复审

| 角色 | 结论 | P0/P1/P2 | 主要阻塞 |
| --- | --- | --- | --- |
| 后端架构 | rejected | 0/1/0 | 多个 disabled 条件同时成立时 reasonCode 求值优先级未冻结 |
| 产品交互 | rejected | 0/1/0 | 总览仍把 `test:rp02b2a` 写成 core-only，与详细 manifest 冲突 |
| 独立 TEST | approved | 0/0/1 | P0/P1 清零；P2 为第 11 节的旧命令措辞 |
| QUALITY/安全 | rejected | 0/2/0 | POST 未服务端绑定 revision/expiry；命令职责冲突 |

第八轮角色报告合计 `P0=0、P1=4、P2=1`；主控去重为 3 个唯一阻塞合同：

1. capability endpoint 必须按 `POLICY_DISABLED -> UNSUPPORTED_ENVIRONMENT -> TRUSTED_CONTEXT_MISSING -> SCOPE_SECRET_MISSING -> API_AUDIENCE_MISSING -> enabled` 唯一顺序求值；B2b 用组合条件笛卡尔场景证明。
2. 所有 gate-on POST 必须携带 scope/revision/expiry 三元快照；服务端 claim 前重读权威 policy snapshot，使用 authoritative clock 校验 expiry，任一变化均 409 且零 claim。
3. execution-core 唯一独立命令为 `test:rp02b2a:core`；包级 `test:rp02b2a` 必须按失败即停顺序执行 core 和 B2a0，任一失败则整体失败。

第九轮仍必须由原四名评审独立复核。四路全部 `approved` 且 P0/P1=0 前，当前包门禁保持 `3/8`，总问题关闭数保持 `9/42`。

## 13. 第九轮复审

| 角色 | 结论 | P0/P1/P2 | 主要阻塞 |
| --- | --- | --- | --- |
| 后端架构 | approved | 0/0/0 | 无；确认 policy snapshot 在 revision 生命周期内稳定，三元门禁可实现 |
| 产品交互 | approved | 0/0/0 | 无；reasonCode、提交竞态与命令合同在用户旅程上闭合 |
| 独立 TEST | approved | 0/0/0 | 无；主合同、反例场景与 acceptance matrix 三层一致 |
| QUALITY/安全 | rejected | 0/1/0 | A→B→A 期间旧 capability 过期或轮换后，原 submission 不能刷新 attestation，可能永久悬挂 |

第九轮角色报告合计 `P0=0、P1=1、P2=0`；主控确认只有 1 个唯一阻塞合同：

1. `submissionScopeId/submissionId/idempotencyKey/requestHash` 是不可变 submission 身份；`capabilityRevision/expiresAt` 是可刷新 transport attestation。返回原可信 scope 后，允许通过 `expectedSubmissionId+expectedRevision` 受限 CAS 只刷新 attestation 与 intent revision/updatedAt，其他身份和规范化请求字段必须不变；随后二次复核 capability 后携带新三元快照和原 submission 请求重放。scope 不同则继续 suspended。B2c 增加 `A -> B -> 旧 capability 过期/轮换 -> A` deterministic 场景，证明同 submission/key/request/hash、最多一个 task/provider 且可恢复到 202/200。

第十轮仍必须由原四名评审独立复核。四路全部 `approved` 且 P0/P1=0 前，当前包门禁保持 `3/8`，总问题关闭数保持 `9/42`。

## 14. 第十轮复审

| 角色 | 结论 | P0/P1/P2 | 主要阻塞 |
| --- | --- | --- | --- |
| 后端架构 | approved | 0/0/0 | 无；不可变 submission 身份与可刷新 attestation 分层可实现 |
| 产品交互 | approved | 0/0/0 | 无；A→B→A 恢复旅程与多标签动作闭合 |
| 独立 TEST | rejected | 0/1/0 | 场景 22 使用“恢复到 202/200”宽松并集断言，无法证明两条 HTTP 合同都实现 |
| QUALITY/安全 | approved | 0/0/0 | 无；受限 CAS、二次门禁和服务端权威校验闭合 |

第十轮角色报告合计 `P0=0、P1=1、P2=0`；主控确认只有 1 个唯一阻塞合同：

1. 场景 22 必须拆成两个 deterministic 子例：queued 固定精确返回 `202 accepted, reused=true` 且 task=1/provider=0；waiting/terminal 固定精确返回 `200 existing, reused=true` 且 task=1、重放新增 provider=0、provider 总数最多 1。两个子例都要逐字段证明不可变 submission 身份和请求，只允许 attestation/revision/updatedAt 变化。

第十一轮仍必须由原四名评审独立复核。四路全部 `approved` 且 P0/P1=0 前，当前包门禁保持 `3/8`，总问题关闭数保持 `9/42`。

## 15. 第十一轮复审

| 角色 | 结论 | P0/P1/P2 | 主要阻塞 |
| --- | --- | --- | --- |
| 后端架构 | approved | 0/0/0 | 无；两个 replay 子例的前置 task 状态、HTTP 分支与 provider 计数均确定 |
| 产品交互 | approved | 0/0/0 | 无；queued 与 waiting/terminal 恢复状态及用户反馈一致 |
| 独立 TEST | approved | 0/0/0 | 无；禁止宽松并集断言，两条恢复路径均有精确 oracle |
| QUALITY/安全 | approved | 0/0/0 | 无；不可变 submission 身份、受限 attestation CAS 与精确副作用计数闭合 |

第十一轮四路报告合计 `P0=0、P1=0、P2=0`，准入评审首次清零。该结论只允许进入需求资产 commit/push 与远程治理，不代表研发授权、实现完成或问题关闭。总问题关闭数继续保持 `9/42`；当前包门禁进入第 4/8 阶段。远程治理通过后，主控仍须单独裁决是否授权 `RP-02B2a0`，不得联动授权 B2a/B2b/B2c/B3 或真实环境。

## 16. RP-02B2a 第一轮单包授权审计

`RP-02B2a0` 在 `2da6d31` 完成实现、双独立验收、远程 CI 和 clean checkout 后，MC 于 `c4ae04f` 基线单独发起 B2a 开工审计。该轮不复用第十一轮对整份需求合同的结论，而是核对当前代码、实际写集、预算、既有回归和远程可达性。

| 角色 | 结论 | P0/P1/P2 | 主要阻塞 |
| --- | --- | --- | --- |
| 后端架构 | approved | 0/0/1 | 无 P0/P1；P2 为状态头仍停留在 B2a0 authorized |
| 产品交互 | rejected | 0/2/0 | provider-backed retry 会使既有 route 回归与 20-file manifest 冲突；隐藏 retry 后仍可能展示“稍后重试”误导文案 |
| 独立 TEST | rejected | 0/1/0 | 新 `test/rp02b2a/**` 不在远程 workflow path/command 中，且 workflow 不在 20-file manifest |
| QUALITY/安全 | approved | 0/0/0 | 无；要求实现后以 detached clean checkout 单独证明 B2a，不得用普通 CI 冒充 |

角色报告合计 `P0=0、P1=3、P2=1`，去重后仍为 3 个授权阻塞：

1. `novelRoutes.test.ts` 必须进入 B2a manifest，把 provider-backed failed task 改为 `retryable=false`、retry POST 精确 409 且八类副作用无新增；不得缩窄 B2a0 回归。
2. provider-backed failed task 必须使用固定、非行动诱导的失败原因和 disabled 下一步；不得隐藏按钮后继续显示“请稍后重试”。
3. `.github/workflows/rp01c-fixtures.yml` 必须进入 manifest，path 纳入 B2a fixture，并在 B1 后执行完整 `test:rp02b2a`；远程 clean checkout 固定串行 B1+B2a。

为保持执行核心、既有 route 语义和远程验收不可分割，B2a manifest 修订为 22 个实现/测试/CI 文件，并增加 1 个实现同 diff ADR，总上限 `23 files / 2,000 net additions`。ADR 必须在实现提交前更新为实际计数，不得用预先存在且本包未修改的 ADR 放行。该修订不扩大业务范围，不切换 202，不修改 Admin transport，也不进入 B2b/B2c/B3 或真实环境。

第二轮仍由原四名评审独立复核。四路全部 `approved` 且 P0/P1=0 前，B2a 不得授权研发，总账继续保持 `9/42`。

## 17. RP-02B2a 第二轮单包授权复核

第一轮 3 个唯一 P1 修订后，原四名评审以当前未提交工作树为权威再次独立复核。该轮只验证 manifest/retry/CI/ADR 修订，不扩大 B2a 或重新打开 B2b/B2c/B3。

| 角色 | 结论 | P0/P1/P2 | 主要阻塞 |
| --- | --- | --- | --- |
| 后端架构 | rejected | 0/2/0 | 专属 workflow 的裸 budget 命令不能消费同 diff ADR；本文顶部仍把最新授权上限写成 B2a0 |
| 产品交互 | approved | 0/0/0 | 无；23-file manifest、固定 retry 投影/文案和 route 零副作用合同闭合 |
| 独立 TEST | approved | 0/0/0 | 无；B1→完整 B2a、core→B2a0、route 回归及同 diff ADR 合同闭合 |
| QUALITY/安全 | rejected | 0/1/0 | 专属 workflow 未按实现 diff 传 ADR，也未机器阻断 `status != ready` |

角色报告合计 `P0=0、P1=3、P2=0`，去重后为 2 类授权阻塞：

1. `.github/workflows/rp01c-fixtures.yml` 必须按 PR/push 的同一 `BASE/HEAD`、NUL-safe 收集 changed ADR，显式传入 `--adr`，并在预算检查前机器验证 `status=ready`；裸命令、fallback diff、ADR 未修改/未传入、非 ready 或真实计数不匹配必须失败。
2. 本文顶部当前授权口径必须从已完成的 B2a0 切换为：第三轮四路清零、授权资产提交推送和远程治理通过后，MC 最多单独授权 B2a。

上述修订只影响已在授权写集中的 workflow 和当前治理资产，不扩大 23-file manifest，不授权业务实现。修订通过本地 governance/diff check 后，必须由原四名评审执行第三轮复核；四路全部 `approved` 且 P0/P1=0 前，总账保持 `9/42`，B2a 不得派发研发。

## 18. RP-02B2a 第三轮单包授权复核

第二轮 2 类治理 P1 修订并通过本地 governance/diff check 后，原四名评审只读复核同一未提交工作树。四路均确认 workflow/ADR 失败门禁、最新授权口径和第一轮已闭合合同没有回退。

| 角色 | 结论 | P0/P1/P2 | 主要判断 |
| --- | --- | --- | --- |
| 后端架构 | approved | 0/0/0 | workflow/ADR 合同可在既有 23-file manifest 内实现，最新授权口径无矛盾 |
| 产品交互 | approved | 0/0/0 | retry 冻结、状态与授权表述一致，无提前授权或行动误导 |
| 独立 TEST | approved | 0/0/0 | BASE/HEAD、ADR discovery/ready/count 失败 oracle 与 B1→B2a→B2a0 回归链可执行 |
| QUALITY/安全 | approved | 0/0/0 | 同 diff ADR、`status=ready`、真实计数与禁止 fallback 的治理闭环完整 |

第三轮报告合计 `P0=0、P1=0、P2=0`，B2a 单包开工授权合同首次清零，剩余必须修复项为 0。该结论只允许进入授权资产 commit/push 与远程治理，不代表 B2a 已获研发授权、实现完成或问题关闭。远程治理通过后仍须由 MC 单独裁决；总账继续保持 `9/42`，B2b/B2c/B3、真实 DB/provider/media 继续冻结。

## 19. RP-02B2a 授权资产治理与 MC 裁决

- 授权资产提交：`48bbac7e26854bbae999ef5eacc748d3e6deaa81`。
- 本地门禁：governance `15/15`、Git budget `6 files / 136 net additions`、tracked 与新增 ADR whitespace check 均通过。
- 远端分支：`origin/codex/aishortvideo-checkpoint-20260711` 与本地授权资产提交一致。
- 远程治理：Remediation governance run `29269395271`，`completed/success`。

上述证据满足第三轮复核冻结的授权前置条件。MC 最终裁决：**只授权 `RP-02B2a` 开工**，研发必须严格遵守实现包中的 23-file manifest、2,000 net additions、同 diff ready ADR、24 个 core 场景、route/B2a0 回归和远程 B1→完整 B2a 证据链。该裁决不表示实现、验收或问题关闭；B2b/B2c/B3、HTTP 202/Admin transport、真实 DB/provider/media/E6 继续冻结，总账保持 `9/42`。

## 20. RP-02B2a 正式交付拒绝与拆包重裁决

研发在原授权下形成 13-path/约 733-net-additions partial diff。DEV 和首次 TEST 报告为绿色，但主控与正式 QUALITY 沿真实生产调用链复核后确认：registry 仍是元数据、provider 仍接 raw entity、task claim 仍信任调用方 closure/source refs、checkpoint 无 expected phase、attempt 提前生成、finalize 接调用方 receipt 且没有 authority/asset/receipt/task/event/oplog 同事务。MC 因此采用更强证据，拒绝交付并禁止提交。

正式 QUALITY 结论为 `needs_revision`，`P0=2/P1=4`。其后拆包复审结果：

| 角色 | 结论 | P0/P1/P2 | 拆包建议 |
| --- | --- | --- | --- |
| 产品交互 | rejected | 2/4/0 | 3 包；强调同步状态不误导、候选只在安全 finalize 后暴露 |
| 独立 TEST | rejected | 2/5/0 | 5 包；authority、lease、InMemory、Prisma 证据分别随生产能力交付 |
| QUALITY/安全 | rejected_as_single_package | 2/3/0 | 4 包；finalize 未完成前正常 leased provider 必须为 0，禁止测试尾包 |
| 后端架构 | no_valid_report_within_review_sla | N/A | 不计作批准；拆包资产仍须重新四路复核 |

MC 合并裁决采用五包，吸收 QUALITY 的安全中间态：

1. `RP-02B2a1` Registry And Strict ABI。
2. `RP-02B2a2` Authoritative Claim And Pre-provider Gate。
3. `RP-02B2a3` Lease Phase CAS And Retry Freeze；正常 leased action 仍 `provider=0`。
4. `RP-02B2a4` InMemory Action-specific Fenced Finalize。
5. `RP-02B2a5` Prisma Nine/Six Fenced Finalize And Closure。

该拆分不缩小原 B2a 目标，只把可证明的生产能力和测试 oracle 同步切开。原 13-path diff 保留在旧工作树作为隔离参考，不得 stage/commit/push；原 ADR 状态改为 `superseded_before_commit`。治理资产从 clean `c673eaf` 重建。

当前五包全部 `not_authorized`。只有后端、产品、TEST、QUALITY 对修订资产全部 approved 且 P0/P1=0，且资产 commit/push 和远程 governance 成功后，MC 才能最多单独授权 B2a1；不得联动授权 B2a2-B2a5/B2b/B2c/B3 或真实环境。总账保持 9/42。

## 21. RP-02B2a1-B2a5 拆包资产首轮正式复核

四个角色对 clean `c673eaf` 治理工作树进行首次正式准入复核。该轮不是复用原单包拆包建议，而是检查五包的中间态安全、逐包可执行命令、机器预算、上位矩阵与授权口径。

| 角色 | 结论 | P0/P1/P2 | 主要阻塞 |
| --- | --- | --- | --- |
| 产品交互 | rejected | 0/4/2 | 公开 retry 到 A3 才冻结；leased candidate 暴露门禁不权威；逐包命令缺失；矩阵混入 heartbeat/recovery |
| 后端架构 | rejected | 0/4/3 | package gate 未真实覆盖 PR/push/manual；命令与真实生产符号绑定冲突；上位 B2b/B2c 验收被缩小；当前动作仍指旧 B2a |
| 独立 TEST | rejected | 0/4/2 | 包身份/授权冲突；逐包 deterministic 命令缺失；子预算未形成机器 oracle；heartbeat/recovery 混入 B2a |
| QUALITY/安全 | rejected | 0/3/1 | parent/current action 仍指旧 B2a；逐包命令和通用远程 gate 未闭合；A3/A4/A5 repository capability 缺权威生产判定 |

四路均确认：原目标没有缩小，原 13-path diff 已隔离，五包测试随生产能力交付，同步 HTTP 200 保留，B2b/B2c/B3/202/Admin/真实环境继续冻结。主控合并为 6 类唯一 P1：

1. 公开 retry projection/API 冻结前移到 B2a1；B2a3 只处理历史 retry child 的 provider 前终态 fencing。
2. 新 leased result 的公开门禁写入权威合同：A1-A3 public 不可达，A4 只允许 harness 观察，A5 仍不新增 transport/UI。
3. 定义 A1-A5 精确 core 与累计 fail-fast 命令，并绑定真实生产符号和同步 200/非 202 回归。
4. A1 建立五包通用生产 package gate：PR merge-base、push before/head、manual 显式 SHA、唯一 ADR、机器 hard budget/manifest、真实负例与无 fallback。
5. 同步 parent、program、matrix、status：恢复 B2b/B2c 的 actor/scope/revision/expiry/TOCTOU/202/200 精确验收，heartbeat/shutdown 只归 B2b，recovery 只归 B3，当前最多在清零后裁决 A1。
6. 定义 repository-owned typed capability：A3 两种仓储全 disabled；A4 仅 InMemory 15 enabled；A5 Prisma 9 enabled/6 unsupported，禁止 client/env/instanceof 推断。

首轮整改只修改治理资产，不触业务代码、不提交、不授权。完成本地治理和一致性检查后，必须由同四角色执行第二轮复核；四路 P0/P1=0、资产 commit/push 和远程治理成功前，B2a1-B2a5 全部保持 `not_authorized`，总账保持 `9/42`。

## 22. RP-02B2a1-B2a5 拆包资产第二轮正式复核

首轮 6 类唯一 P1 修订、本地 governance 15/15、diff check 和机器 manifest/ADR 预算检查通过后，原四名评审对同一 clean 治理工作树执行第二轮只读复核。

| 角色 | 结论 | P0/P1/P2 | 主要阻塞或意见 |
| --- | --- | --- | --- |
| 产品交互 | approved | 0/0/2 | 用户状态与同步 200 边界闭合；P2 为 A3 split_reason 精确化和治理 diff 计数复算 |
| 后端架构 | rejected | 0/1/2 | production workflow 的 required SHA、paths 和事件到 gate/复合命令 wiring 尚未形成机器合同；另有 Prisma evidence 与 A3 retry 归属措辞 |
| 独立 TEST | rejected | 0/2/1 | A1 package-gate test 未进入可执行命令；24 个 deterministic 场景没有逐包/测试文件/累计回归映射；治理 diff 计数需复算 |
| QUALITY/安全 | rejected | 0/1/1 | TASK-PRECLAIM 把 capability scope/revision/expiry 错归 A2，B2b/B2c 权责被缩小；治理 diff 计数需复算 |

角色报告合计 `P0=0、P1=4、P2=6`，去重后为 4 类唯一 P1：

1. A1 定义并实际运行 `test:rp02b2a1:gate`，A1 core/复合/远程命令都必须覆盖生产 gate 测试且自行清空 DB/provider/secret 环境。
2. production workflow 必须机器约束 manual required base/head SHA、PR/push/manual 同一 gate wiring 和 ADR-only/gate-only/test-only path 可达性，禁止 generic budget 或 fallback。
3. 24 个 deterministic 场景逐项绑定唯一子包、真实测试文件和累计回归；场景 7 归 A4，场景 23 分别提供 InMemory 与 Prisma repository 证据。
4. TASK-PRECLAIM 明确 A2 只拥有 trusted actor/canonical envelope/action-specific source refs/provider-before authority；B2b 重算权威 capability 并提供 202/200，B2c 承担客户端二次 gate、TOCTOU 阻断和真实 taskId。

第二轮 P2 同步修正为：A3 仅拥有历史 retry child fence 并持续回归 A1 public freeze；Prisma 证据必须是可注入 deterministic repository transaction/CAS，禁止 static 外推；治理资产当前实际差异按 tracked 200 net additions + 五个新 ADR 90 lines 复算为 `14 files / 290 net additions`，提交前仍以 production package gate 结果为准。

第二轮整改仍只修改 clean 治理资产，不触业务代码、不提交、不授权。完成本地治理、预算、文档一致性与负例合同检查后，必须由同四角色执行第三轮复核；四路 P0/P1=0、资产 commit/push 和远程治理成功前，B2a1-B2a5 全部保持 `not_authorized`，总账保持 `9/42`。

## 23. RP-02B2a1-B2a5 拆包资产第三轮正式复核

第二轮四类唯一 P1 修订并通过逐项合同核对、governance 15/15、diff check 和预算预检后，原四名评审对同一 clean 治理工作树执行第三轮只读复核。

| 角色 | 结论 | P0/P1/P2 | 主要阻塞或意见 |
| --- | --- | --- | --- |
| 产品交互 | rejected | 0/1/1 | 专属实现包与主状态仍残留“第二轮/第三轮进行中”，和第三轮实际结果、第四轮前仍未授权的事实冲突 |
| 后端架构 | approved | 0/0/2 | 五包合同可实现；P2 为未暂存 worktree 预算预览的尾换行计数偏差和当前轮次文字更新 |
| 独立 TEST | approved | 0/0/2 | gate/命令/24 场景/权责可执行；P2 为实现包和主状态的当前轮次文字更新 |
| QUALITY/安全 | approved | 0/0/2 | 中间态与冻结边界闭合；P2 为当前节指针和提交前 staged BASE/HEAD 权威预算证据 |

第三轮角色报告合计 `P0=0、P1=1、P2=7`，去重后只有 1 类 P1：当前权威资产必须一致表达“第三轮 3/4 approved、产品 rejected 0/1/1、五包仍 not_authorized、修正后进入第四轮复核”。重复的 `2.4` 标题同步改为 `2.5`；未暂存 worktree 的尾换行计数只作为 P2 记录，提交前必须 stage 全部治理资产并以真实 `BASE/HEAD` package gate 结果作为预算权威证据。

第三轮整改仍只修改治理状态，不触业务代码、不提交、不授权。完成本地治理与一致性检查后，必须由同四角色执行第四轮复核；四路全部 approved 且 P0/P1=0 后才允许提交推送治理资产。远程治理成功后 MC 也只能最多单独裁决 B2a1；B2a2-B2a5/B2b/B2c/B3、202/Admin、真实 DB/provider/media/E6 继续冻结，总账保持 `9/42`。

## 24. RP-02B2a1-B2a5 拆包资产第四轮正式复核

第三轮唯一状态指针 P1 修订并通过本地门禁后，原四名评审对同一 clean 治理工作树执行第四轮只读复核。

| 角色 | 结论 | P0/P1/P2 | 主要阻塞或意见 |
| --- | --- | --- | --- |
| 产品交互 | approved | 0/0/2 | 当前状态与授权边界一致；P2 为主状态泛化措辞和未暂存预算快照漂移 |
| 后端架构 | rejected | 0/1/1 | 实现包第 17 节仍要求继续整改第三轮状态；主状态“当前唯一推荐动作”仍停在最早拆包复核口径 |
| 独立 TEST | approved | 0/0/2 | 命令、24 场景、失败 oracle、权责和冻结边界无回退；P2 为预算快照和临时合同核对不可重放 |
| QUALITY/安全 | approved | 0/0/2 | 中间态、授权冻结和事件顺序闭合；P2 同为预算快照与临时合同核对证据卫生 |

第四轮角色报告合计 `P0=0、P1=1、P2=7`，去重后只有 1 类 P1：实现包第 17 节与主状态“当前唯一推荐动作”必须明确第四轮 3/4 approved、后端 rejected 0/1/1、唯一 P1 修订后进入第五轮、五包仍未授权。既有五包生产能力边界、repository capability、24 场景、TASK-PRECLAIM 权责、同步 200 和冻结范围均无回退。

关联 P2 同步处理：主状态去除泛化的“重新修订/首轮当前动作”；临时逐项合同核对不再表述为独立机器门禁；未暂存预算数字不作为关闭证据，提交前必须 stage 全部治理资产并以显式 `BASE/HEAD` production gate 输出为唯一权威计数。

第四轮整改仍只修改治理资产，不触业务代码、不提交、不授权。两处当前动作和关联证据卫生 P2 已修正，diff check、governance 15/15、预算预检与陈旧状态检查通过；当前由同四角色执行第五轮复核。四路全部 approved 且 P0/P1=0 后才允许提交推送治理资产。远程治理成功前 B2a1-B2a5 全部 `not_authorized`，总账保持 `9/42`。

## 25. RP-02B2a1-B2a5 拆包资产第五轮正式复核

第四轮两处当前动作 P1 修订并通过本地门禁后，原四名评审对同一 clean 治理工作树执行第五轮只读复核。四个角色均发现主状态“当前唯一推荐动作”仍使用整改进行态并称第五轮尚未开始，与顶部及阶段表的完成态矛盾。

| 角色 | 结论 | P0/P1/P2 | 主要阻塞或意见 |
| --- | --- | --- | --- |
| 产品交互 | rejected | 0/1/0 | 当前唯一推荐动作仍停在第五轮前，事件账本的零命中声明不可复现 |
| 后端架构 | rejected | 0/1/1 | 同一状态指针 P1；P2 为未跟踪尾换行预算预览偏差 |
| 独立 TEST | rejected | 0/1/0 | 精确反例检查仍命中主状态当前动作；其余命令、场景和失败 oracle 无回退 |
| QUALITY/安全 | rejected | 0/1/0 | 同一当前权威动作矛盾；中间态、授权冻结和事件顺序无其他回退 |

第五轮角色报告合计 `P0=0、P1=4、P2=1`，去重后只有 1 类 P1，仍属于第四轮状态指针残留而非新增生产合同问题。主状态“当前唯一推荐动作”必须明确：第五轮四角色因该残留拒绝；唯一 P1 已修订并通过本地门禁；当前第六轮复核中；第六轮清零后只能提交治理资产，远程治理成功后 MC 最多单独裁决 B2a1。

第五轮整改后必须执行评审给出的精确反例检查；四个陈旧模式记录为 `P1[[:space:]]正在修订`、`修订通[过].*进入第五轮`、`首轮拆包四角色复核为[ ]rejected`、`当前只允许修正第[三]轮`，在当前权威四文件中全部零命中。随后由同四角色执行第六轮复核；四路全部 approved 且 P0/P1=0 前不提交、不授权，总账保持 `9/42`。

## 26. RP-02B2a1-B2a5 拆包资产第六轮正式复核

第五轮唯一状态 P1 修订、精确陈旧模式零命中且本地门禁通过后，原四名评审对同一 clean 治理工作树执行第六轮只读复核。

| 角色 | 结论 | P0/P1/P2 | 主要意见 |
| --- | --- | --- | --- |
| 产品交互 | approved | 0/0/1 | 当前状态、产品表面与授权顺序一致；P2 为事件账物理顺序 |
| 后端架构 | approved | 0/0/2 | 命令、capability、场景与冻结边界无回退；P2 为事件顺序和未跟踪尾换行预算预览 |
| 独立 TEST | approved | 0/0/1 | 精确旧模式零命中，失败 oracle 无回退；P2 为事件顺序 |
| QUALITY/安全 | approved | 0/0/1 | fail-closed 与未授权边界闭合；P2 为事件顺序 |

第六轮四角色全部 approved，合计 `P0=0、P1=0、P2=5`；拆包治理合同准入清零。共同 P2 不阻塞准入：本轮新增事件在未提交账本中的物理顺序需按 `occurred_at` 调整；worktree 预览对五个未跟踪 ADR 各多计一个尾换行，提交前必须以全量 staged、显式 `BASE/HEAD` 的 production gate 输出为唯一权威预算证据。

该批准只允许进入治理资产 commit/push 与远程治理，不等于 B2a1 获得研发授权、实现完成或问题关闭。远程治理成功后仍须由 MC 单独裁决；总账保持 `9/42`，B2a2-B2a5/B2b/B2c/B3、202/Admin、真实 DB/provider/media/E6 继续冻结。
