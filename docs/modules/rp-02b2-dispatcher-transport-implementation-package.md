# RP-02B2 Dispatcher、Fenced Finalize 与异步 Transport 实现包

状态：`rp02b2a0_authorized_for_implementation_b2a_b2b_b2c_b3_frozen`

问题：`RMD-TASK-002`，承接 `RMD-TASK-001` 的异步执行阶段；`RMD-TASK-003` 继续冻结到 `RP-02B3`

验收：`TASK-PRECLAIM-01`、`TASK-CONCURRENCY-01`、`TASK-WORKER-01`；`TASK-RESTART-01` 仅覆盖 heartbeat/fencing，不覆盖 recovery。`TASK-SURFACE-01` 完整保留给 RP-02C

依赖：`RP-02B1` 提交 `415d03a` 和阶段证据 `e2c6196`

## 1. 主控裁决

四路初审均拒绝原 RP-02B2 大包。共同原因是：原包混入 B3 recovery/retry、缺少逐 action 权威来源合同、缺少业务资产与 receipt 的同事务 fenced finalize、缺少 provider dispatch checkpoint、HTTP/admin 不能区分 `202 accepted` 与 `200 existing`，且 `15 files / 1,700 additions` 不足以诚实承载全部范围。

RP-02B2 继续拆为四个顺序子包：

1. `RP-02B2a0`：高风险试写选择前置修复。只修复 `confirmRisk/selectionReason` 从 Admin 到同步 route/service 的真实透传和 provider 前校验，不改 transport 或 worker。
2. `RP-02B2a`：执行核心。补齐 ExecutionEnvelope、15-action authority matrix、lease-CAS checkpoint、双 stale gate、action-specific fenced finalize、dispatcher registry 和能力门禁。
3. `RP-02B2b`：API 传输与生命周期。把 claim 初态切为 queued、提供 HTTP 202、in-process worker loop/heartbeat/graceful shutdown 和 API E3 回归。
4. `RP-02B2c`：Admin transport。保存真实 taskId、稳定幂等键、精确轮询、刷新/多标签恢复和不会误报完成的 DOM 回归。

只有前一包独立实现、验收、commit/push 后才能授权下一包。B2a0/B2a/B2b/B2c 都不实现 recovery scan、retry child、provider outcome unknown、poison orchestration或真实数据库/多进程/provider。

## 2. 冻结范围

### 2.1 RP-02B2a0

- high/blocking 试写候选的 `confirmRisk/selectionReason` 从 Admin 请求到 shared schema、route 和 NovelService 同步路径完整透传。
- 缺失确认或空原因必须在现有同步 provider 前失败，task/provider/asset=0；普通风险候选保持当前同步行为。
- 不新增 ExecutionEnvelope、dispatcher、worker、capability、202 或 submission intent；不改变其他生成入口。
- API route、Admin service 与 Vue DOM 使用独立命令 `test:rp02b2a0` 形成完整回归。

### 2.2 RP-02B2a

- shared `ExecutionEnvelopeV1` 补齐 worker finalize 所需的严格审计字段。
- 单一 action-discriminated `ActionExecutionPlan` registry 同时服务现有同步路径和 worker dispatcher；禁止维护第二份 provider/finalize 映射，未知 handler 安全失败。
- worker 按 ID 重载权威资产，provider 前 stale gate，provider 返回后在 finalize 事务内再次 stale gate。
- typed `checkpointLeasedTask`，所有 phase 迁移都要求有效 lease。
- `finalizeLeasedAction`：stale recheck、业务资产、result receipt、task 终态和唯一 terminal event 同事务提交。
- in-memory 与 Prisma 的同合同实现；Prisma 只允许当前支持的 9 action，后 6 action 在 claim 前稳定零副作用阻断。
- B2 期间 retry API 对 provider-backed failed task 稳定返回 `RETRY_NOT_AVAILABLE`，不得创建 queued child。
- 承接 B2a0 已验收的风险参数；将其继续写入 envelope/receipt/log，禁止重复定义另一份 route/Admin 映射。
- deterministic execution-core fixture 的独立命令是 `test:rp02b2a:core`；B2a 包级准入命令 `test:rp02b2a` 必须按失败即停顺序执行 core 与 B2a0。

### 2.3 RP-02B2b

- claim 新任务初态从同步 `processing` 切为 `queued`，请求线程不再调用 provider/prepare/finalize。
- shared `TaskDispatchResponseV1`，15 个生成入口声明 `202/200/409` 合同。
- 服务端提供显式 `NovelAsyncTransportCapabilityV1`；Admin 不得从 DEV/PROD、provider 名称或本地环境变量猜测 transport 模式。
- 单进程可注入 worker runtime、PausedScheduler、heartbeat 和 graceful shutdown。
- deterministic transport fixture、Fastify inject 回归和独立命令 `test:rp02b2b`。

### 2.4 RP-02B2c

- admin 保存真实 taskId、稳定 idempotency key、精确轮询 `/tasks/:taskId`、刷新/多标签恢复和不会误报完成的状态文案。
- admin 在第一次 POST 前取得并缓存服务端 capability，使用服务端下发的 opaque `submissionScopeId` 分区 intent；能力未知或原子 store 不可用时 fail closed，POST=0。
- NovelDetail 与 ChapterDetail 当前已有 provider 入口同时适配；不新增新业务入口。
- admin service unit、Vue DOM 回归和独立命令 `test:rp02b2c`。

### 2.4 明确不做

- `RP-02B3`：recovery scan、worker restart、retry child/lineage/预算、unknown outcome、poison、renewal-vs-recovery。
- `RP-02C`：取消任务、停止本页等待、放弃结果、重新生成、完整任务抽屉和所有表面的统一产品投影。
- `RP-01D/E6`：真实 MySQL migration/时钟/事务/P2002、独立多进程 worker、kill/restart。
- 真实 DeepSeek/provider、媒体、发布、平台回填。

## 3. ExecutionEnvelope V1.1 补强

B2a 不允许 worker 读取原 HTTP request、闭包或进程内对象。每个 action 的 envelope 必须独立重建 provider 输入、审计原因和 finalize 输入。

新增严格 `auditContext` 判别分支：

```ts
interface ExecutionAuditContextV1 {
  changeReason: string;
  requestedByUserId: string;
  requestedAt: string;
  confirmRisk?: boolean;
  selectionReason?: string;
  pageVersionSnapshot?: ActionPageVersionSnapshotV1;
}

interface ActionPageVersionSnapshotV1 {
  novelUpdatedAt: string;
  currentDirectionVersionId?: string | null;
  currentSettingVersionId?: string | null;
  currentOutlineVersionId?: string | null;
  currentStageOutlineVersionId?: string | null;
  currentChapterPlanVersionId?: string | null;
  chapterCurrentContentVersionId?: string | null;
}
```

- `changeReason` 由 claim 时的规范化 request 或 action 固定默认值生成并持久化；worker 不再生成默认原因。
- `requestedByUserId` 只能来自已鉴权 context；worker context 使用 task 的 tenant/user，不回退默认租户或默认用户。B2 新任务必须非空；legacy task 缺 tenant/user/envelope 时安全失败 `WORKER_PAYLOAD_UNSUPPORTED`，provider/asset=0。
- `pageVersionSnapshot` 只允许上述白名单字段。现有 `unknown` client payload 必须在 claim 前解析为该结构，未知字段或敏感值拒绝；不得把原对象直接持久化。
- 结构生成补 `regenerateReason?`；trial chapter one 补 `regenerateReason?`；trial followup 固定 `trialRunId/selectedCandidateVersionId/chapterPlanVersionId/confirmRisk/selectionReason`。high/blocking 风险候选必须同时满足 `confirmRisk === true` 与非空 `selectionReason`，并由 shared schema、route、NovelService、ExecutionEnvelope、operation log 全链保留；固定默认原因只允许非风险候选。chapter rewrite 同时保留 `instruction` 与 `reason`；impact assess 使用 `instruction?` 与 `reason?` 的明确映射；adopt-impact 保留 `reason` 和安全 page snapshot。
- envelope 仍受 strict union、32 KiB、安全字段和值 canary、canonical JSON/requestHash 一致性约束。
- 同 key 重放时，服务端必须先按 `tenantId+userId+action+objectId+idempotencyKey` 加载既存 task；身份一致时复用该 task 持久化的 `requestedAt`、服务端 authority snapshot 和规范化 request 重算 canonical envelope/requestHash，禁止使用新的 `now` 或调用方提交的 snapshot。任何 hash/identity 不一致都稳定返回 typed conflict，provider/asset=0。

## 4. 15-Action Authority Matrix

两次 gate 使用同一 action-specific matcher。第一次在 provider 前完成；第二次必须在 `finalizeLeasedAction` 的数据库事务内重新加载并比较。ownership、tenant、novel、状态或版本任一不匹配均为 `failed/SOURCE_STALE`；不得自动替换为最新版本。

authority snapshot 必须覆盖 handler 实际传给 provider 与 finalize 的全部持久事实，未进入 snapshot 的持久值禁止传给 provider：

- direction/structure/trial 纳入全部模型输入字段的 canonical `preferencesSnapshotHash`；preferences 当前没有独立 version 时，以排序、去空、白名单化后的权威字段计算 SHA-256，不持久化原 prompt。
- trial 纳入有序 `chapterRefs[{chapterId, chapterNo, planVersionId, currentContentVersionId?}]` 和 `chapterInputSnapshotHash`。
- body 纳入有序 `targetChapterRefs`、`previousContentVersionId`、`longTermMemoryId/version/hash`、`previousBatchId/summaryHash`、strategy version 和全部 current structure refs。
- full review 继续使用按 chapterNo 排序的完整章节 identity；任何章节增删、顺序或 current ID 变化均 stale。
- 上述 ID/hash 都进入 strict `sourceVersionRefs`、canonical envelope 和 requestHash；provider 前与 finalize 事务内由同一 matcher 重算比较。缺失、无法重载或变化都进入 `failed/SOURCE_STALE`。

所有 provider-visible novel/chapter 输入必须由下列严格白名单投影构造，禁止把 repository 的 `NovelRecord`、`ChapterRecord` 或其他原始实体直接传给 provider：

```ts
interface NovelProviderInputV1 {
  id: string;
  title: string;
  genres: string[];
  chapterLimit: number;
  chapterWordMin: number;
  chapterWordMax: number;
  policyProfileVersionId: string | null;
}

interface ChapterProviderInputV1 {
  id: string;
  chapterNo: number;
  title: string;
  wordTarget: number | null;
  statusNote: string | null;
}
```

- 数组排序、空值归一和字符串上限由 shared canonical schema 固定；投影的 canonical SHA-256 分别写入 `novelProviderInputSnapshotHash`、`chapterProviderInputSnapshotHash` source refs。
- 上述字段名与现有 provider ABI 一致；current pointer、planVersionId 等只进入 `sourceVersionRefs` 权威 identity，不伪装为 provider novel/chapter 字段。`wordTarget=null` 必须在 canonical JSON 中保留为 null，禁止改写为 0 或默认字数。
- 每个 provider public signature 必须直接接收 `Pick<NovelProviderInputV1, ...>` / `Pick<ChapterProviderInputV1, ...>` 或其 action-discriminated strict input；禁止 `NovelRecord`、`NovelChapterRecord`、`as NovelRecord`、`as NovelChapterRecord`。每个 action 用 `Object.keys` 排序后精确等值测试证明既不缺字段也不多字段。
- 实际 action 只引用它所需的投影字段；被 provider 使用的持久字段必须进入 authority identity 并在两次 gate 重算，不使用的字段不得偷偷进入 provider payload。
- novel 的 title/genres/word policy/policy profile，chapter 的 title/wordTarget/statusNote/current pointer 在 claim 后变化时，要么被明确证明该 action 未使用，要么稳定进入 `SOURCE_STALE`；不得继续使用旧实体快照调用 provider。
- body continuity 的长期记忆 identity 固定为 `sourceContentVersionId + snapshotHash`；不得读取不存在或可空的泛化 `version` 字段冒充来源版本。

| action | provider 前与 finalize 内必须重载的权威来源 | 必须保持的条件 | 业务结果 |
| --- | --- | --- | --- |
| `direction_generate` | novel；preferences snapshot | lifecycle active；`currentDirectionVersionId` 与 refs 一致；preferences hash 一致 | direction candidate revision |
| `direction_fuse` | novel；全部 source direction versions；preferences snapshot | 全部属于 tenant/novel；ID 集合完全一致；状态为 candidate/current 且未 discarded；preferences hash 一致 | fused direction candidate |
| `direction_optimize` | novel；source direction version；preferences snapshot | version 属于 tenant/novel；ID 一致；状态为 candidate/current 且未 discarded；preferences hash 一致 | optimized direction candidate |
| `setting_generate` | novel；current direction；preferences snapshot | novel current direction 与 refs/request 一致且 version 为 current；preferences hash 一致 | setting candidate |
| `outline_generate` | novel；current direction/setting；preferences snapshot | 两个 current pointer 与 refs/request 一致；preferences hash 一致 | outline candidate |
| `stage_outline_generate` | novel；current outline；preferences snapshot | current outline 与 refs/request 一致；preferences hash 一致 | stage-outline candidate |
| `chapter_plan_generate` | novel；current outline/stage outline；preferences snapshot | 两个 current pointer 与 refs/request 一致；preferences hash 一致 | chapter-plan candidate |
| `trial_chapter_one_generate` | novel；current chapter plan；preferences；有序 trial chapters | current plan、preferences hash、chapter refs/order/input hash 一致；novel 仍允许试写 | trial run + chapter-one candidates |
| `trial_followup_generate` | novel；trial run；selected candidate；current chapter plan；有序 trial chapters | trial run 仍为 waiting selection；candidate 属于该 run 且可选；plan/candidate/chapter identity 一致；风险原因满足合同 | selected chapter one + followup chapters/review |
| `body_batch_generate` | novel；全部 current structure refs；passed trial run；strategy；有序 target chapters；previous content；long-term memory；previous batch summary | current refs、trial、strategy、targets/order、continuity IDs/hashes 均与 envelope 一致 | body batch result；Prisma B2 零任务阻断 |
| `chapter_body_generate` | novel；chapter；全部 current structure refs；trial/strategy；chapter current pointer；previous content/memory/batch | chapter/strategy/refs/continuity identity 一致；章节仍允许生成 | chapter body candidate；Prisma B2 零任务阻断 |
| `chapter_rewrite` | novel；chapter；current content version | chapter current pointer 等于 refs/request；content 属于 chapter | rewrite candidate；Prisma B2 零任务阻断 |
| `chapter_impact_assess` | novel；chapter；current content version | chapter current pointer 等于 refs/request | impact case；Prisma B2 零任务阻断 |
| `chapter_adopt_impact_assess` | novel；chapter；current content；candidate content | current pointer 一致；candidate 属于 chapter 且仍为 candidate；安全 page snapshot 未冲突 | adopt + impact case；Prisma B2 零任务阻断 |
| `novel_full_review` | novel；五个 current structure refs；按 chapterNo 排序的全部 chapter/current content/feature/review refs；policy profile | current refs、章节集合、每章 current IDs 和 policy version 完全一致 | full review report；Prisma B2 零任务阻断 |

matcher 输出只能是 `{ ok: true, sources }` 或 `{ ok: false, code: 'SOURCE_STALE', safeReason }`。`safeReason` 不包含正文、prompt、provider raw response、密钥或数据库连接信息。

## 5. Worker Handler 与 Checkpoint 合同

每个 handler 固定执行：

```text
parse envelope
-> assert tenant/action capability
-> authoritative reload
-> stale gate before provider
-> checkpoint prepared
-> checkpoint provider_call_started
-> provider call
-> validate business result
-> checkpoint provider_result_validated
-> finalizeLeasedAction transaction
```

新增 phase-discriminated typed 仓储原语：

```ts
type LeasedTaskCheckpoint =
  | { expectedPhase: 'leased'; nextPhase: 'prepared' }
  | {
      expectedPhase: 'prepared';
      nextPhase: 'provider_call_started';
      providerAttemptId: string;
      providerDispatchedAt: string;
    }
  | {
      expectedPhase: 'provider_call_started';
      nextPhase: 'provider_result_validated';
      providerAttemptId: string;
    };

checkpointLeasedTask({ tenantId, taskId, leaseOwnerId, leaseToken, authoritativeNow, checkpoint })

finalizeLeasedAction({
  tenantId, taskId, leaseOwnerId, leaseToken, authoritativeNow,
  providerAttemptId, validatedResult
})
```

- lease claim 只写 `phase=leased`，`providerAttemptId/providerDispatchedAt` 必须为 null；不得在 claim 时提前创建 attempt。每次 checkpoint 都要求 `status=processing`、owner/token 匹配、lease 未过期、phase 合法单向推进；affectedRows 必须为 1。
- `prepared -> provider_call_started` 必须原子写入非空且唯一的 `providerAttemptId` 与 `providerDispatchedAt=authoritativeNow`，再调用 provider；`provider_result_validated` 和 finalize 必须匹配同一 attemptId。affectedRows != 1 时 provider/finalize 均不得执行。
- `finalizeLeasedAction` 不接受调用方可替换的 expected hash 或 `safeReceipt`。事务必须从锁定 task 的持久 ExecutionEnvelope 派生 expected authority identity，并用同一 matcher 重载比较；worker 不能在 provider 返回后用“最新 hash”替换预期来源。repository 写入业务资产并获得真实 result IDs 后，必须在同一事务内构造 canonical safe receipt。
- B2a/B2b worker 只允许显式 single-attempt mock provider；现有 HTTP/client/model repair retry 和真实 provider 全部 provider=0，直到 B3/RP-06 独立授权。B2 不以一个 checkpoint 包装多次外呼。
- checkpoint 失败、lease lost、cancelled 或 shutdown abort 后不得调用 provider；provider 已返回后 checkpoint/finalize 失败，业务资产/receipt/current 写入均为 0。
- handler registry 必须静态覆盖 15 action；缺 handler/未知 action 为 `WORKER_PAYLOAD_UNSUPPORTED`，只允许一个安全终态事件。
- worker failure/event/API/log 只持久化受控 `errorCode/failureCategory/userFailureReason`，禁止传递原 Error、provider body/header/raw response 或 secrets。
- 所有持有 lease 后发生的受控失败，包括 provider 前 stale、unsupported/capability、既存 retry child、provider reject/validation failure，都必须调用 repository 的 `failLeasedAction`；handler 不得分别写 task/event/log 或只清本地状态。

## 6. 原子 Fenced Finalize

`finalizeLeasedAction` 必须在一个 repository transaction 中完成：

1. 按 tenant/task/owner/token/expiry/phase 锁定有效任务。
2. 按固定全局顺序锁定 action authority matrix 涉及的全部 tenant-scoped 可变来源行和持有 current pointer 的 owner 行，再从锁定值计算 snapshot hash；Prisma 可使用 `SELECT ... FOR UPDATE`，或在最终写条件中对全部 authority identity 使用等价 CAS。matcher 后不得留下可由并发更新穿过的 TOCTOU 窗口。
3. snapshot 不一致则只提交 `failed/SOURCE_STALE`、finishedAt、lease/activeClaimKey 释放、required operation log 和唯一 terminal event。
4. snapshot 一致则写入 action-specific business asset，并取得真实 result IDs。
5. repository 基于 task/envelope/providerAttemptId/真实 result IDs 构造并写入唯一 canonical safe receipt；worker 不得提供或覆盖 receipt。
6. 更新 task `waiting_confirmation/completed`、result IDs、finishedAt、lease/activeClaimKey 释放。
7. 写 required operation log 和唯一 terminal/waiting event。

任何来源行缺失、数量/顺序变化或 authority CAS affectedRows != 1，都必须提交受控 `failed/SOURCE_STALE`，业务资产、receipt 和 current 写入为 0。任何其他步骤异常必须整体回滚。禁止“调用旧 finalize 再补 receipt”，禁止 transaction 外先写候选/报告/current。

`failLeasedAction` 必须在同一个 repository transaction 中校验 tenant/task/owner/token/expiry/允许失败的 phase，原子写 task 受控终态与 finishedAt、释放 lease/activeClaimKey、写唯一 terminal event 和 required operation log。任一步失败必须整体回滚；同一 task/error outcome 重放只能得到同一 terminal event/log，不得半终态。

故障注入必须覆盖：资产写后异常、receipt 写后异常、task 写后异常、terminal event 写后异常、operation log 写后异常、重复 finalize、重复 fail、过期 owner、cancelled task；全部断言零孤儿资产、零重复 receipt、零错误 current，且不存在“task 已失败但 lease 未释放”“task 已终态但 event/log 缺失”的半终态。

## 7. Prisma 能力与 Retry 冻结

Prisma B2 可进入 dispatcher 的 9 个 task type：

- `novel_direction_generate`
- `novel_direction_fuse`
- `novel_direction_optimize`
- `novel_setting_generate`
- `novel_outline_generate`
- `stage_outline_generate`
- `chapter_plan_generate`
- `trial_writing_generate`
- `trial_followup_generate`

后 6 action 在 HTTP claim 前稳定 `CONFIG_MISSING`，`task/provider/asset=0`；worker 消费旧任务时再次检查 capability，失败为受控终态且 provider/asset=0。不得为通过测试伪造 Prisma 正文写链。

B2a/B2b/B2c 期间 `POST /tasks/:id/retry` 遇到 provider-backed task，必须在 stale/conflict/repository retry 之前返回 `409 RETRY_NOT_AVAILABLE`；child/event/log/activeClaim/provider 均为 0。dispatcher 对任何 `retryOfTaskId != null` 的既存 queued/processing task 也必须在 provider 前一次性安全失败为 `RETRY_NOT_AVAILABLE`，provider/asset/receipt/current=0。B3 完成 retry 合同后再开放。

`RETRY_NOT_AVAILABLE` 必须作为 `packages/shared/src/api.ts` 的正式 `ErrorCode`，HTTP definition 固定 409；禁止 route/service 通过字符串、强制 cast 或复用 `TASK_NOT_RETRYABLE` 冒充。

## 8. HTTP Dispatch 合同（B2b）

shared 冻结：

```ts
type TaskDispatchResponseV1 =
  | { kind: 'accepted'; taskId: string; action: NovelProviderAction; objectId: string; status: 'queued' | 'processing'; reused: boolean; pollUrl: string }
  | { kind: 'existing'; taskId: string; action: NovelProviderAction; objectId: string; status: 'waiting_confirmation' | 'completed' | 'failed' | 'cancelled'; reused: true; pollUrl: string };

interface TaskDispatchConflictDetailsV1 {
  existingTaskId?: string;
  action: NovelProviderAction;
  objectId: string;
}

type NovelAsyncTransportCapabilityV1 =
  | {
      contractVersion: 'v1';
      enabled: false;
      reasonCode: 'TRUSTED_CONTEXT_MISSING' | 'SCOPE_SECRET_MISSING' | 'API_AUDIENCE_MISSING' | 'POLICY_DISABLED' | 'UNSUPPORTED_ENVIRONMENT';
    }
  | {
      contractVersion: 'v1';
      enabled: true;
      capabilityRevision: string;
      submissionScopeId: string;
      expiresAt: string;
    };
```

| 场景 | HTTP | 合同 |
| --- | --- | --- |
| 新建 queued | 202 | `accepted`, `reused=false` |
| 同 key/同 hash 复用 queued/processing | 202 | `accepted`, `reused=true` |
| 同 key/同 hash 复用 waiting/terminal | 200 | `existing`, `reused=true`；不隐式 retry |
| 同 key/异 hash | 409 | `IDEMPOTENCY_CONFLICT` |
| 同冲突域/不同 key 有 active task | 409 | `CONFLICT_TASK_EXISTS`，返回安全 `existingTaskId` |
| capability 或模型/策略配置缺失 | 500 | `CONFIG_MISSING`，task/provider/asset=0 |
| source/current version gate 或 expected scope 绑定失败 | 409 | `VERSION_CONFLICT`/`CANDIDATE_STALE`/`GATE_BLOCKED`，task/provider/asset=0 |
| provider-backed retry 在 B3 前 | 409 | `RETRY_NOT_AVAILABLE`，child/provider/asset=0 |

HTTP 线程只允许鉴权、schema、capability/config gate、规范化/idempotency、source snapshot 和原子 claim。禁止 provider、prepare 业务写、finalize、等待 scheduler 或 fire-and-forget。

- B2b 冻结唯一只读 endpoint：`GET /novels/async-transport-capability`。只有由 `app.ts` 注入 route options 的 authenticated `RequestContextResolver`、`scopeSecret` 和 `apiAudience` 同时有效，才允许返回 `enabled=true`；现有 `createDefaultRequestContext`、请求 body/header 中的 tenant/user 或 client 自报身份永远不能启用异步能力。
- `submissionScopeId = base64url(HMAC-SHA256(dedicatedScopeSecret, canonicalJson(['rp02b2-scope', 'v1', apiAudience, tenantId, userId])))`。专用 secret 至少 32 bytes；canonical JSON 固定 UTF-8、数组顺序、字符串规范化和输出编码，禁止无分隔字符串拼接。同一可信身份与 audience 稳定，不同 tenant/user/audience 必须不同。响应、intent 和普通日志不得出现原始 tenantId/userId、scopeSecret、HMAC 输入或密钥 canary。
- gate-on 时，capability endpoint、15 个 provider-backed POST、`GET /tasks/:taskId`、`GET /tasks/:taskId/events` 和 task mutation 必须使用同一个注入的 authenticated `RequestContextResolver`；解析失败禁止回退 `createDefaultRequestContext`，task/provider/asset/intent=0。B2a 创建的 task/envelope 从一开始也使用该 resolver；默认 context 只允许明确 gate-off legacy 同步路径，且不得创建 B2 envelope。
- capability GET 本身始终 task/provider/asset=0。`enabled=false + POLICY_DISABLED|UNSUPPORTED_ENVIRONMENT` 才允许 Admin 走旧同步合同且不创建 intent；`TRUSTED_CONTEXT_MISSING|SCOPE_SECRET_MISSING|API_AUDIENCE_MISSING` 必须进入 `capability_unavailable`，生成 POST=0，不得降级为默认身份同步调用。
- capability endpoint 的服务端求值顺序唯一固定为 `POLICY_DISABLED -> UNSUPPORTED_ENVIRONMENT -> TRUSTED_CONTEXT_MISSING -> SCOPE_SECRET_MISSING -> API_AUDIENCE_MISSING -> enabled`。policy disabled 或 environment unsupported 命中后不再求值异步 scope 前置条件，保留 gate-off legacy；只有 policy enabled 且 environment supported 后，resolver、至少 32-byte secret 或 audience 任一无效才 fail closed。禁止由实现者自行调换优先级。
- B2c 在任一用户生成动作前获取 capability：`enabled=true` 才进入 intent/202/poll；请求失败、版本未知、scope 改变或 `expiresAt`/本地 TTL 任一过期时阻断新的异步 POST。缓存有效期取 `min(expiresAt, fetchedAt + policyCapabilityTtl)`。scope 改变时，只有没有在途提交的旧 intent 可退休；`submitting/transport_unknown` 且尚未绑定 taskId 的旧 intent 必须转为 `scope_suspended`，按旧 scope 隔离保留且在新 scope 下 display/POST/poll=0。恢复旧 scope 后必须继续使用原 `submissionId`、idempotency key、`normalizedReplayRequest` 和 `requestHash` 重放，直到绑定 taskId 或收到 200 terminal；禁止生成新 key。`submissionScopeId` 是 submission 身份边界，`capabilityRevision/expiresAt` 只是可刷新 transport attestation：旧 attestation 过期或轮换时，只允许在重新确认当前可信 scope 与 intent 的原 `submissionScopeId` 完全一致后，通过原子 CAS 更新 attestation 字段和 intent revision/updatedAt，其他身份/请求字段逐字节保持不变。
- capability endpoint 与 POST gate 必须调用同一个只读 `CapabilityPolicySnapshotResolver`，返回当前 actor/scope 对应的权威 `{ capabilityRevision, submissionScopeId, expiresAt }`。该 snapshot 在 revision 生命周期内稳定；policy、environment、actor、audience、scope secret 或 expiry 变更必须产生新 revision 或 disabled 结果，不允许 POST 信任客户端自报 expiry。
- 每个 gate-on 的 15 类 provider-backed POST 必须同时携带 `expectedSubmissionScopeId`、`expectedCapabilityRevision` 和 `expectedCapabilityExpiresAt`。服务端必须在 claim 前重读当前权威 policy snapshot：对解码后定长 scope 字节做 constant-time compare，revision 和 expiry 必须与当前 snapshot 完全一致，且 authoritative clock 必须满足 `authoritativeNow < expectedCapabilityExpiresAt`。缺失、不匹配或过期均返回 `409 GATE_BLOCKED`，现有浏览器 intent 只能原子转 blocked/suspended，新 intent/task/provider/asset/receipt/current=0。transport unknown 重放必须先确认当前 capability 的 scope 与原 `submissionScopeId` 一致；若 revision/expiry 已轮换，则按上一条的受限 CAS 刷新 attestation 后携带新三元快照和原 submission/key/request/hash 重放，绝不能用新 snapshot 改写 submission 身份或规范化业务请求。

## 9. Admin 最小 Transport（B2c）

### 9.1 用户旅程

1. 点击生成前先进入 capability checking：显示“正在确认任务提交方式”，禁用本次动作，intent/POST=0。
2. `enabled=false` 必须按 `reasonCode` 分流：`POLICY_DISABLED|UNSUPPORTED_ENVIRONMENT` 才沿用旧同步生成路径且 intent=0；`TRUSTED_CONTEXT_MISSING|SCOPE_SECRET_MISSING|API_AUDIENCE_MISSING` 进入 `capability_unavailable`，显示安全失败原因，POST/task/provider/intent=0。`enabled=true` 才先持久化 submission intent，再显示“正在提交任务”，按钮防双击。
3. capability 请求失败、版本未知、scope 改变或缓存过期：显示“暂时无法确认任务提交方式，任务尚未提交”，只提供“重新检查”，intent/POST=0。“重新检查”本身也只获取 capability；成功后进入 `ready`，显示“提交方式已确认，请重新点击生成”并恢复原动作按钮，仍 intent/POST=0；只有新的明确生成点击才能提交。再次失败则留在 unavailable。
4. `202 accepted`：把 admin 在提交前持久化的 key 与后端返回的 `{taskId, action, objectId, status, reused, pollUrl}` 原子绑定，显示“任务已受理，等待执行”或“已关联到进行中的任务”；后端不回显 key。
5. queued/processing：精确轮询该 taskId；刷新和多标签恢复同一任务。
6. waiting_confirmation：停止轮询，刷新业务数据，提示“结果已生成，待确认后才会成为正式内容”。
7. terminal：停止轮询，保留任务追踪，刷新对应工作台；失败显示受控 userFailureReason。
8. transport unknown：显示“提交结果未确认，正在核对任务状态”，使用相同 submission/key 和完全相同规范化请求自动重放 POST，以 202/200 找回真实 taskId；核对完成前不允许新 key 或用户重复提交。若期间 scope 从 A 切到 B，该 intent 转 `scope_suspended`，B 下零展示/零提交/零轮询；回到 A 后恢复原 submission/key 而不新建 intent。若旧 capability 已过期或 revision 已轮换，只刷新同 scope 的 transport attestation 后重放，业务请求与 hash 不变。

### 9.2 状态与动作

| 状态 | 文案 | 可用动作 |
| --- | --- | --- |
| capability_checking | 正在确认任务提交方式 | 无 |
| capability_unavailable | 暂时无法确认任务提交方式，任务尚未提交 | 重新检查 |
| ready | 提交方式已确认，请重新点击生成 | 原生成动作 |
| submitting | 正在提交任务 | 无 |
| queued | 任务已受理，等待执行 | 查看任务、刷新状态 |
| processing | 任务执行中，可以稍后回来查看 | 查看任务、刷新状态 |
| waiting_confirmation | 结果已生成，待确认后才会成为正式内容 | 查看结果、查看任务 |
| completed | 任务已完成 | 查看最新结果/下一步 |
| failed | 任务失败：安全原因 | 查看任务、刷新状态 |
| cancelled | 任务已取消，未确认新的正式结果 | 查看任务、刷新状态 |
| transport_unknown | 提交结果未确认，正在核对任务状态 | 暂不允许重复提交 |
| scope_suspended | 当前账号或空间已变更，原提交已安全暂停 | 切回原账号/空间后自动继续核对 |

- queued 不得显示“正在调用模型”；processing 才能显示执行中。
- `202` 后不得提示“候选已生成/批次已完成/审稿已完成”，不得清 pending，不得推进步骤。
- public 成功/错误 DTO 不回显 idempotency key、token、requestHash。admin 在发请求前生成并持久化自己的 key。
- `SubmissionIntentV1/PendingTaskReceiptV1` 以 `apiOrigin+submissionScopeId+novelId+action+objectId` 分区，至少包含 `submissionId/idempotencyKey/normalizedReplayRequest/requestHash/taskId?/pollUrl?/state/revision/capabilityRevision/submissionScopeId/capabilityExpiresAt/updatedAt`。不得在浏览器持久化 raw tenantId/userId。`normalizedReplayRequest` 必须是 action-specific strict schema 校验、secret-free、字段和值白名单化且有大小上限的可重放 payload；每次重放前重算 hash，不一致则进入 deterministic conflict 且不得 POST。
- 必须提供可运行的 `SubmissionIntentStore.compareAndSet({ expectedSubmissionId, expectedRevision }, nextIntent)` 原子实现。revision 必须在同一分区内跨 retired/新 submission 严格单调递增，不得因新 submission 重置；新 submission 从已退休记录的 revision+1 开始。权威 CAS 只能使用 IndexedDB `readwrite` transaction，或 Web Locks 包裹的 IndexedDB transaction；`localStorage`、storage event 与 BroadcastChannel 仅作通知/唤醒，不能作为互斥锁或权威记录。原子能力不可用、transaction abort 或 scope 不匹配时 fail closed，POST=0。
- intent CAS 成功后、HTTP POST 前必须重读最新 capability，比对 `capabilityRevision/submissionScopeId/capabilityExpiresAt` 与当前时间。scope 不匹配必须在同一权威 transaction 内转 `scope_suspended`，POST=0；同 scope 下 revision/expiry 轮换时，首次检查仍 POST=0，但允许用 `expectedSubmissionId+expectedRevision` 的受限 CAS 只更新 `capabilityRevision/capabilityExpiresAt/revision/updatedAt`，并逐字段断言 `submissionId/idempotencyKey/normalizedReplayRequest/requestHash/submissionScopeId` 未变。CAS 成功后必须再次重读 capability；只有新 attestation 仍完全匹配且未过期才可携带它与原 submission 请求 POST，CAS 失败或第二次检查变化则继续阻断，不得使用任一旧快照。
- 只有 CAS 成功的标签可以发起提交，失败方重新读取同一 intent/key/taskId；同 submissionId 的响应才可绑定 taskId，旧标签/旧响应不得清除或覆盖新 receipt。
- 每个入口使用该可持久恢复的 idempotency key，不依赖页面内存 ref。waiting/terminal 后 receipt 标记 retired；只有新的明确用户动作才能生成新 key。
- 多标签使用 storage event/BroadcastChannel 同步，但服务端 task 仍为状态 SSOT；transport unknown 只能重放相同规范化 request+key，不创建 resolver 副作用。
- typed service 必须显式判别 `202 accepted`、`200 existing`、`409 IDEMPOTENCY_CONFLICT` 和 `409 CONFLICT_TASK_EXISTS`；`existingTaskId` 引导查看现有任务，页面不得猜原始响应结构。网络异常不能直接开放重新提交。
- 从 B2a 起，15 类 provider-backed task 的 task projection 必须固定 `retryable=false` 并提供安全 reason；`POST /tasks/:id/retry` 仍固定 409，retry mutation=0。现有 `TaskProgressPanel` 已按 `retryable` 隐藏重试，不得另造 UI 判定。
- B2c 的异步动作冻结条件固定为：intent 处于 `submitting/transport_unknown/scope_suspended`，或存在未终态 `PendingTaskReceiptV1`；此时隐藏 cancel、“取消本地等待”和“重新生成”，对应 mutation service 调用为 0。真实 taskId 一经绑定，capability 后续过期/失败只阻断新提交，不得停止该 taskId 轮询、清除 receipt 或恢复旧动作。scope 改变时旧 receipt 和旧在途 intent 按旧 scope 隔离保留且不跨 scope 展示/POST/轮询；恢复原 scope 后继续该任务或同 key 核对。gate-off 必须完整保留现有同步生成、等待与重新生成动作。其他 task type 行为不变；异步 lifecycle 的重新开放只由 RP-02C 定义。

## 10. Worker 拓扑与 Shutdown（B2b）

- E3 拓扑固定为 API 进程内的可注入 worker runtime；生产独立进程不在 B2 声称范围。
- B2b 的 async transport 通过服务端 `novelAsyncDispatchEnabled` gate 落地，默认关闭；关闭时 route、NovelService 与 admin 必须保持现有同步 DTO/状态/交互，不暴露 202，也不得要求 submission intent。B2c admin unit/DOM 在 gate-off 与 gate-on 两种模式全绿后，才允许由服务端显式 policy 在 development+mock 环境开启；production 和非 mock provider 必须拒绝开启。Admin 与 service 不得从 NODE_ENV、URL 或 provider 名称推断能力，只认 capability endpoint。inline provider 禁令只在 gate-on 生效；gate-off 必须保持当前同步 provider 路径可用。
- runtime 参数来自服务端 policy snapshot：workerConcurrency、leaseDuration、heartbeatInterval、pollInterval、shutdownGracePeriod；`heartbeatInterval < leaseDuration / 3`。
- heartbeat 串行执行并防重入；lease lost 后停止 heartbeat、尝试 AbortSignal 中断 provider、禁止 fail/finalize 业务写。
- shutdown：先停止领取新任务；宽限期内维持在途 heartbeat。每个 execution 用单一原子本地状态机在 `running -> settling` 与 `running -> abandoned` 间竞争：provider settlement 在任何 checkpoint/fail/finalize repository 调用前必须 CAS 获得 `settling`；grace 到期只能 CAS 获得 `abandoned`。shutdown 获胜则 abort provider、停止 heartbeat，后续 resolve/reject/abort 即使 lease 尚有效也 repository 零写并等待 lease 自然过期；settlement 已获胜则不得再标记 abandoned，shutdown 必须等待这一段单次 fenced repository critical section 结束。这是“持 lease 的 provider failure 进入原子终态”规则的唯一显式例外。不得立即 requeue、批量失败或启动 recovery。
- `main.ts` 只负责启动/关闭 runtime 和 Fastify；测试必须能不监听 socket 直接注入 PausedScheduler。

## 11. B2a0 与 B2a Deterministic E3

B2a0 使用独立命令 `test:rp02b2a0`，精确运行 API route、Admin service 和 Vue DOM 三类既有文件。必须分别证明：普通候选保持同步生成；high/blocking 候选缺 `confirmRisk` 或空 `selectionReason` 时 provider 前拒绝；合法原因从页面到 route/service 原样但安全地透传；刷新/重复点击不绕过校验。另设 `risk_selection_reason_secret_canary`：API key、Authorization、Cookie、token 形态值在 provider 前稳定拒绝，task/provider/asset/operation-log/普通日志/浏览器持久化全部零命中，错误响应只含受控原因。每个失败场景逐项断言 task/event/provider/asset/receipt/current/operation-log/child 和 browser persistence 计数。

独立目录 `apps/api/test/rp02b2a/`，`test:rp02b2a:core` 只匹配该目录；复合命令 `test:rp02b2a` 必须按失败即停顺序执行 `test:rp02b2a:core` 再执行 `test:rp02b2a0`，任一子命令失败则整体失败；`test:rp02b1` 必须缩窄到 B1 文件，避免未来污染。

必须使用显式 `ManualClock.set/advance`、`DeferredProvider.entered/resolve/reject`、`MutableAuthorityStore`、`LeaseRepositoryProbe`、`AssetSinkProbe` 和 barrier；禁止固定 sleep。

1. `dispatcher_all_15_actions_and_unknown_handler`
2. `envelope_reconstructs_provider_and_finalize_inputs`
3. `source_authority_matrix_all_15_actions`
4. `stale_before_provider_provider_zero_asset_zero`
5. `stale_before_finalize_provider_one_asset_zero`
6. `checkpoint_requires_live_lease_and_monotonic_phase`
7. `provider_dispatch_checkpoint_precedes_provider`
8. `expired_owner_checkpoint_fail_finalize_zero_write`
9. `duplicate_finalize_one_receipt_one_asset`
10. `fenced_finalize_fault_injection_rolls_back_all`
11. `cancelled_task_late_result_zero_write`
12. `prisma_supported_nine_and_unsupported_six_zero_side_effect`
13. `worker_context_two_tenants_no_default_fallback`
14. `worker_error_event_log_secret_canary`
15. `provider_retry_api_frozen_zero_child`
16. `existing_retry_child_is_terminally_fenced_before_provider`
17. `risk_trial_selection_from_b2a0_roundtrips_envelope_receipt_and_audit`
18. `provider_receives_only_authority_projected_input_and_untracked_field_change_is_stale_or_unused`
19. `controlled_terminal_failures_are_atomic_with_event_and_operation_log`
20. `provider_public_abi_uses_exact_action_pick_and_preserves_nullable_word_target`
21. `long_term_memory_identity_uses_source_content_version_and_snapshot_hash`
22. `provider_backed_task_projection_freezes_retry_and_retry_mutation_zero`
23. `authority_changes_during_finalize_is_locked_or_cas_fenced`
24. `trusted_actor_is_identical_across_claim_and_envelope_no_default_fallback`

每个场景必须逐项断言 task/event/provider/asset/receipt/current/operation-log/child 计数，而不是只断言返回值。`existing_retry_child_is_terminally_fenced_before_provider` 必须预置 `retryOfTaskId != null` 的 queued/processing task，只允许一个 `RETRY_NOT_AVAILABLE` 安全终态、一个 terminal event、一个 operation log，provider/asset/receipt/current/new-child 全为 0。风险场景承接 B2a0 的 claim 前校验，并证明合法 reason 在 envelope、provider effective request、receipt 摘要和 operation log 中安全一致。provider 投影场景必须分别突变 novel title/genres/word policy/policy profile 与 chapter title/wordTarget/statusNote/current pointer，断言每个字段要么未进入 action payload，要么 provider 前 `SOURCE_STALE`；逐 action `Object.keys` 必须与声明的 `Pick<>` 完全相等，provider public ABI 和调用点均不得出现 raw entity/cast。

## 12. B2b API E3 与 B2c Admin DOM

API 独立目录和命令：`apps/api/test/rp02b2b/`、`test:rp02b2b`。Admin transport 另用 `test:rp02b2c` 执行 service unit 和 Vue DOM runner。

1. `http_returns_before_worker`：PausedScheduler 下 202 queued，provider/finalize/asset=0。
2. `http_replay_status_matrix`：202/200/409 全矩阵。
3. `queued_processing_success` 与 `queued_processing_failed`。
4. `ten_workers_one_claim`：10 worker barrier，20 轮，每轮唯一 lease/provider/finalize。
5. `heartbeat_extends_lease_and_non_owner_mutations_are_fenced`。
6. `expired_owner_heartbeat_before_recovery_cannot_resurrect_lease`：同 owner/token 在 `leaseExpiresAt <= authoritativeNow` 后 heartbeat affectedRows=0，expiry/heartbeat 不变，provider/finalize/asset/receipt=0。
7. `expired_owner_late_result_before_scan_zero_write`。
8. `graceful_shutdown_keeps_inflight_heartbeat`。
9. `async_gate_default_off_preserves_sync_contract_and_rejects_production_or_non_mock_enable`。
10. `capability_endpoint_default_off_without_trusted_context_secret_or_audience`。
11. `capability_hmac_scope_is_stable_and_separates_tenant_user_and_audience`：必须包含产生相同裸拼接文本的字段边界碰撞对、Unicode 输入和 tenant/user/audience 单字段变化矩阵。
12. `shutdown_abandoned_late_resolve_reject_abort_zero_repository_write`。
13. `shutdown_settlement_and_abandonment_each_win_deterministic_barrier`：settling/abandoned 双方各自先到达一次，并断言 repository critical section/零写计数。
14. `capability_then_dispatch_and_poll_use_same_trusted_actor`：两个 actor 分别 capability→POST→task/events poll 成功，capability scope、task/envelope actor 和 POST/poll actor 必须全部相同；交叉查询不可见，resolver 失败 task/provider/asset=0。
15. `dispatch_expected_scope_recomputed_before_claim`：capability 后在 POST 前分别改变 actor/tenant、audience 或 scope secret，缺失/不匹配 `expectedSubmissionScopeId` 均返回 409 `GATE_BLOCKED`，task/provider/asset/receipt/current=0。
16. `capability_reason_precedence_cartesian_matrix`：遍历 policy/environment/trusted context/secret/audience 单项与组合失效，按唯一优先级断言 reasonCode、legacy call、intent/task/provider 精确计数。
17. `dispatch_revision_or_expiry_changes_after_client_recheck_before_claim`：用 barrier 停在客户端二次检查完成与服务端 claim 之间，分别更新权威 revision 与推进 authoritative clock 越过 expiry，均返 409 且 claim/task/provider/asset/receipt=0。

B2b fixture 必须显式使用 `ManualClock`、`PausedScheduler`、`DeferredProvider` 和可复用 10-worker barrier；禁止 sleep、真实 timer 或依赖调度运气。capability 只验服务端 endpoint、默认关闭和非法启用 provider=0；client 的 unknown/expired/scope-changed POST=0 只属于 B2c。

B2c 必过：

1. `admin_202_preserves_real_task_id_and_no_success_toast`。
2. `admin_refresh_and_multitab_restore_same_task`。
3. `admin_transport_unknown_blocks_duplicate_submit`。
4. `admin_waiting_terminal_refreshes_correct_result`。
5. `admin_queued_not_presented_as_calling_model`。
6. `admin_200_existing_no_new_success`。
7. `admin_409_opens_existing_task`。
8. `admin_failed_cancelled_safe_copy`。
9. `admin_transport_unknown_replays_same_key_same_request_and_monotonic_cas_rejects_stale_response`。
10. `admin_two_tab_submission_barrier_one_submit_wins_and_loser_reuses_receipt`。
11. `admin_gate_on_hides_async_lifecycle_actions_and_gate_off_preserves_sync_actions`。
12. `admin_submission_intent_secret_canary`：在自由文本中放入 API key、Authorization、Cookie、token 形态 canary，intent/receipt/storage/log 全部零命中且 POST=0。
13. `admin_atomic_store_unavailable_or_scope_changed_blocks_post`。
14. `admin_capability_disabled_reason_matrix`：`POLICY_DISABLED|UNSUPPORTED_ENVIRONMENT` 才走旧同步且 intent=0；三类 trusted/secret/audience 缺失均 capability_unavailable，POST/task/provider/intent=0。
15. `admin_capability_checking_failure_unknown_expired_and_scope_change_post_zero`。
16. `admin_capability_cache_uses_minimum_expiry_and_retires_only_non_inflight_old_scope_intent`。
17. `admin_scope_a_to_b_to_a_resumes_same_unknown_submission`：A 提交响应丢失后切 B 再回 A，始终只有同一 submission/key/request/hash，B 下 POST/poll=0，最多一个 task/provider。
18. `admin_capability_changed_after_intent_cas_before_post_blocks_atomically`：用 barrier 在 CAS 后 POST 前改变 revision/scope/expiry，intent 原子阻断且 POST=0。
19. `admin_cas_requires_submission_id_and_monotonic_partition_revision`：退休旧 submission 后新建一条，旧标签使用旧 submissionId/revision 无法覆盖新记录，POST=0。
20. `admin_capability_recheck_success_returns_ready_without_post`。
21. `admin_async_actions_freeze_before_task_id_after_expiry_and_across_scope_roundtrip`。
22. `admin_scope_a_to_b_capability_rotates_then_a_refreshes_attestation_and_resumes`：A 的 transport unknown 切到 B 期间推进 `ManualClock` 使旧 expiry 失效并轮换 revision，再回 A；第一次检查 POST=0，受限 CAS 只改变 capability attestation 与 intent revision/updatedAt，submission/key/request/hash/scope 全部不变。该场景必须拆成两个 deterministic 子例，禁止使用 `202 || 200` 宽松断言：
    - `queued_replay_returns_202`：服务端预置唯一 task=`queued`；第二次 capability 检查后携带新三元快照和原请求重放，精确返回 `202 accepted`、`reused=true`，task 总数=1、provider 总数=0。
    - `waiting_or_terminal_replay_returns_200`：服务端预置同 key/hash task 并固定推进到 `waiting_confirmation` 或指定 terminal fixture；重放精确返回 `200 existing`、`reused=true`，task 总数=1、重放新增 provider=0、provider 总数<=1。
    - 两个子例都逐字段断言 `submissionId/idempotencyKey/normalizedReplayRequest/requestHash/submissionScopeId` 不变，只允许 `capabilityRevision/capabilityExpiresAt/revision/updatedAt` 变化。

B2c fixture 强制使用 `ManualClock`、`TwoTabBarrier`、可注入 `IDBFactory`、`IndexedDbTransactionProbe` 和 deterministic notification bus；禁止 sleep、真实 timer 或用普通 Map 替代生产 `SubmissionIntentStore`。`submissionIntentStore.test.ts` 必须运行生产实现，覆盖 readwrite commit/abort、`expectedSubmissionId+expectedRevision`、分区级单调 revision、scope suspend/resume、CAS 后 capability TOCTOU、TTL 边界和两标签竞争；每步断言 IDB read/write/abort、POST、intent、receipt 和 mutation 的精确计数。

B2b/B2c 每个场景还必须逐项断言 task/event/provider/asset/receipt/current/operation-log/child 和 mutation API 调用计数；gate-off 场景必须证明既有同步响应与旧 admin 交互无回归，gate-on 场景才允许 202/intent/polling。

现有 local acceptance seed/live smoke 在 gate-on 时必须显式 tick/drain/poll；禁止恢复 inline provider 作为异步兼容路径。gate-off 保留现有同步 smoke，不得把 inline provider 禁令误用于旧同步合同。

## 13. E3 / E6 证据边界

B2a0/B2a/B2b/B2c E3 可证明：风险参数同步链、单进程 deterministic dispatcher/lease/checkpoint/fencing、mock provider 双 stale gate、in-memory 与 Prisma static transaction contract、Fastify inject 202、Admin store/CAS 算法与 DOM transport。

仍为 not_proven：真实 MySQL migration/事务/数据库时钟/P2002、两个独立 worker 进程、真实 socket latency、进程 kill/restart、跨进程 heartbeat/fencing、真实 provider 幂等/unknown outcome/成本、真实浏览器跨标签 Web Locks/IndexedDB 调度与 storage/BroadcastChannel 投递、真实媒体。DOM 双 store/barrier 只证明算法合同，不得称真实跨标签 E6/E7。

## 14. 写集与预算

### RP-02B2a0

- 预算与 manifest 均为硬门禁：`8 files / 700 net additions`，任何增项必须先由 MC 修订。
- `packages/shared/src/novels.ts`
- `apps/api/src/modules/novels/services/novelService.ts`
- `apps/api/src/modules/novels/routes/novelRoutes.ts`
- `apps/api/src/modules/novels/novelRoutes.test.ts`
- `apps/admin-web/src/pages/NovelDetailWorkbench.vue`
- `apps/admin-web/src/pages/NovelDetailWorkbench.dom.spec.ts`
- `apps/admin-web/src/modules/novels/services/novelService.test.ts`
- `package.json`
- `test:rp02b2a0` 必须是复合精确命令，只运行上述 API route、Admin service 与 DOM 回归；不得用全仓测试偶然覆盖代替。该包不新增异步任务、provider、worker 或 transport。

### RP-02B2a

- 预算与 manifest 均为硬门禁：`20 files / 2,000 net additions`，任何增项必须先由 MC 修订。
- `packages/shared/src/api.ts`（新增 `RETRY_NOT_AVAILABLE` typed 409）
- `packages/shared/src/novels.ts`
- `apps/api/src/modules/novels/domain/executionContract.ts`
- `apps/api/src/modules/novels/domain/novelDomain.ts`
- `apps/api/src/modules/novels/services/taskClaim.ts`
- `apps/api/src/modules/novels/services/actionExecutionPlan.ts`（new，单一 registry 与 dispatcher）
- `apps/api/src/modules/novels/services/novelService.ts`
- `apps/api/src/modules/novels/routes/novelRoutes.ts`（不切换 transport）
- `apps/api/src/modules/tasks/services/taskService.ts`
- `apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts`
- `apps/api/src/modules/novels/repositories/prismaNovelRepository.ts`
- `apps/api/src/modules/novels/providers/mockDirectionProvider.ts`
- `apps/api/src/modules/novels/providers/mockStructureProvider.ts`
- `apps/api/src/modules/novels/providers/mockTrialProvider.ts`
- `apps/api/src/modules/novels/providers/mockBodyProvider.ts`
- `apps/api/src/modules/novels/providers/mockFullReviewProvider.ts`
- `apps/api/src/modules/novels/providers/deepseekNovelProvider.ts`（只改 strict public ABI；B2 不连接真实 provider）
- `apps/api/src/app.ts`（注入 authenticated RequestContextResolver；不得让 B2 envelope 回退默认 context）
- `apps/api/test/rp02b2a/rp02b2a.test.ts`（new，fixture 合并在本文件）
- `package.json`
- `test:rp02b2a:core` 只运行 B2a execution-core 独立 fixture；复合命令 `test:rp02b2a` 必须按失败即停顺序执行 `test:rp02b2a:core` 和 `test:rp02b2a0`，任一失败则整体失败；不得把 Admin 全链风险回归遗漏在 execution-core 绿灯之外。
- 现有同步 path 与 worker 必须复用同一 `ActionExecutionPlan` registry；不得复制 15-action provider/finalize mapping。不修改 admin transport，不把 HTTP 改为 202。

### RP-02B2b

- 预算与 manifest 均为硬门禁：`13 files / 1,800 net additions`。
- `packages/shared/src/novels.ts`
- `apps/api/src/config/env.ts`
- `apps/api/src/modules/novels/services/taskClaim.ts`
- `apps/api/src/modules/novels/services/novelService.ts`（显式传播 claim outcome，不从业务富 DTO/task 状态猜测 reused）
- `apps/api/src/modules/novels/routes/novelRoutes.ts`
- `apps/api/src/modules/novels/services/workerRuntime.ts`（new）
- `apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts`（queued claim 初态与 lifecycle 原子状态）
- `apps/api/src/modules/novels/repositories/prismaNovelRepository.ts`（queued claim 初态与 lifecycle 原子状态）
- `apps/api/src/app.ts`
- `apps/api/src/main.ts`
- `apps/api/src/modules/tasks/routes/taskRoutes.ts`（同一 trusted actor 用于 task/events poll 与 mutation）
- `apps/api/test/rp02b2b/rp02b2b.test.ts`（new，fixture 合并在本文件）
- `package.json`
- 不修改 admin 页面或组件。

### RP-02B2c

- 预算与 manifest 均为硬门禁：`18 files / 2,000 net additions`。
- `apps/api/src/config/env.ts`（仅 development+mock activation）
- `apps/admin-web/src/shared/services/http.ts`
- `apps/admin-web/src/shared/services/http.test.ts`
- `apps/admin-web/src/modules/novels/services/novelService.ts`
- `apps/admin-web/src/modules/novels/services/novelService.test.ts`
- `apps/admin-web/src/modules/novels/services/submissionIntentStore.ts`（new，IndexedDB/Web Locks CAS）
- `apps/admin-web/src/modules/novels/services/submissionIntentStore.test.ts`（new）
- `apps/admin-web/src/modules/novels/model/novelDetailView.ts`
- `apps/admin-web/src/modules/novels/model/novelDetailView.test.ts`
- `apps/admin-web/src/modules/novels/components/TaskProgressPanel.vue`
- `apps/admin-web/src/modules/novels/components/TaskProgressPanel.dom.spec.ts`
- `apps/admin-web/src/pages/NovelDetailWorkbench.vue`
- `apps/admin-web/src/pages/NovelDetailWorkbench.dom.spec.ts`
- `apps/admin-web/src/pages/ChapterDetailWorkbench.vue`
- `apps/admin-web/src/pages/ChapterDetailWorkbench.dom.spec.ts`（new）
- `apps/admin-web/src/pages/NovelList.vue`
- `apps/admin-web/src/pages/NovelList.dom.spec.ts`（new）
- `package.json`
- 不修改 API worker/repository 或业务路由。

- 任一子包超出对应文件预算，必须先提交精确写集拆分申请；不得用笼统 ADR 放行。

四个子包各自独立满足：需求复核 P0/P1=0、实现、自测、独立 TEST/QUALITY、commit/push、远程 clean-checkout CI。任一包不得借用另一个包的未提交改动作为验收前提。

## 15. 开工门禁

截至 2026-07-13 19:45:10 CST，以下四项门禁均已满足，MC 仅授权 `RP-02B2a0` 开工：

1. 后端架构、产品交互、TEST、QUALITY 对本文复核为 approved，P0/P1=0。
2. parent package、remediation program、acceptance matrix、issue ledger 和主控事件同步。
3. 需求资产 commit/push，远程治理 CI 成功。
4. MC 只授权 `RP-02B2a0`；B2a/B2b/B2c/B3、真实 DB/provider/media 继续冻结。

本节不授权任何后续包。B2a0 研发必须遵守第 2.1、11、14 节的范围、验收命令和 `8 files / 700 net additions` 硬预算；交付后仍须独立 TEST/QUALITY 验收和主控关闭证据，才能决定下一道门禁。
