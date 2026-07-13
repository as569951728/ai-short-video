# RP-02B Worker、租约恢复与真实 Retry 实现包

状态：`approved_for_implementation_rp02b1_only`

问题：`RMD-TASK-002`、`RMD-TASK-003`，并承接 `RMD-TASK-001` 的 RP-02B 阶段

验收：`TASK-PRECLAIM-01`、`TASK-WORKER-01`、`TASK-RESTART-01`、`TASK-RETRY-01`

依赖：`RP-02A`

## 1. 主控裁决

RP-02B 不作为单个 15 文件大包直接实现，拆为三个顺序子包：

1. `RP-02B1`：可恢复执行合同、lease/fencing 字段和仓储原语。
2. `RP-02B2`：worker dispatcher、HTTP 快速返回、heartbeat、幂等 finalize、stale 双门禁和前端最小 transport 适配。
3. `RP-02B3`：restart recovery、真实 retry、poison/unknown outcome、预算和 deterministic 故障注入。

每个子包独立满足：需求复核、实现、自测、独立 TEST/QUALITY、commit/push、远程 clean-checkout CI。三个子包均完成 E3 后，`RMD-TASK-002/003` 最多进入 `implemented_pending_verification`；真实 MySQL、多进程和进程 kill/restart 的 E6 仍依赖 `RP-01D`，不得提前关闭。

## 2. 冻结状态机

```text
none -> queued
queued -> processing
queued -> cancelled
processing -> waiting_confirmation
processing -> completed
processing -> failed
processing -> cancelled
processing(expired lease) -> failed
failed -> new queued retry task
```

- HTTP 原子 claim 的新任务初态为 `queued`，不得在请求线程调用 provider。
- worker 获取有效 lease 后才能 `queued -> processing`。
- lease 过期且尚未 dispatch provider 的 `processing` 任务进入 `failed/WORKER_LEASE_EXPIRED`；已 dispatch 但无 result receipt 的任务进入 `failed/PROVIDER_OUTCOME_UNKNOWN`。两者都不自动重放 provider。
- provider 前 source stale：`failed/SOURCE_STALE`、providerCalls=0；finalize 事务内 stale：同样 failed，result receipt/candidate/report/current 均为 0。两个分支各只写一个终态事件，并释放 lease/activeClaimKey；通用 retry 拒绝并引导重新生成。
- `waiting_confirmation` 和所有 terminal 状态释放 `activeClaimKey`、lease owner、lease token、lease expiry。
- RP-02B 不启用 `waiting_confirmation -> processing`。
- 完整“停止本页等待/取消任务/放弃结果/重新生成”产品语义仍归 RP-02C；RP-02B 必须先保证 cancelled/lease-lost worker 零业务写入。

## 3. 可恢复执行合同

任务新增内部 `ExecutionEnvelopeV1`，仅用于 worker 从持久状态重建业务调用：

```ts
interface ExecutionEnvelopeBaseV1 {
  schemaVersion: 1;
  action: NovelProviderAction;
  objectType: string;
  objectId: string;
  sourceVersionRefs: Record<string, unknown>;
  policyProfileVersionId: string | null;
  modelRoutingVersion: string;
}
```

实际合同必须是以 `action` 为判别字段的 15 分支 strict union，禁止保留开放 `Record<string, unknown>`。每个分支的 `effectiveRequest` 必须使用 shared schema 校验，`additionalProperties=false`；同一规范化 envelope 同时用于持久化和 `requestHash`。worker 消费时再次验证 envelope 的 action/object/source/policy/model routing 与 task 列和 requestHash 一致，不一致进入不可重试 `failed/WORKER_PAYLOAD_UNSUPPORTED`。

### 3.1 白名单

- `direction_generate`：`regenerateReason?`。
- `direction_fuse`：`versionIds[2..20]`、`reason?`。
- `direction_optimize`：`versionId`、`instruction?`。
- `setting_generate`、`outline_generate`、`stage_outline_generate`、`chapter_plan_generate`：固定 `objectType` 和上游 asset version IDs。
- `trial_chapter_one_generate`：`chapterPlanVersionId`、`chapterCount[2..5]`。
- `trial_followup_generate`：`selectedCandidateVersionId`、`chapterPlanVersionId`。
- `body_batch_generate`：`startChapter`、`endChapter`、`batchSize[1..20]`、`strategySnapshotId`。
- `chapter_body_generate`：`chapterId`、`strategySnapshotId`、`enhancedReview?`。
- `chapter_rewrite`：`chapterId`、`currentContentVersionId`、`instruction`。
- `chapter_impact_assess`：`chapterId`、`currentContentVersionId`、`instruction?`。
- `chapter_adopt_impact_assess`：`chapterId`、`candidateVersionId`、`currentContentVersionId`、`reason`。
- `novel_full_review`：`policyProfileVersionId` 和结构化 source refs。

通用限制：ID 1-128 字符；reason 最大 500；instruction 最大 2,000；数组最多 100 项且去重排序；规范化 envelope 最大 32 KiB；所有未知字段拒绝。

worker 必须通过 ID 重新加载权威资产；source 在 provider 前和 finalize 事务内各校验一次。

### 3.2 禁止持久化

- API key、Authorization、Cookie、DATABASE_URL、provider request body/header。
- 完整 system/user prompt、编译后的 messages、provider raw response/reasoning。
- 完整章节正文或全书正文；只保存 ID、结构化摘要和受限参数。
- 函数、闭包、进程内对象、原 HTTP IP/UA。

未知 schema/action 或反序列化失败必须进入稳定 `failed/WORKER_PAYLOAD_UNSUPPORTED`，不得循环重新入队。

## 4. Lease 与 Fencing 合同

正式任务领域和 Prisma 合同必须包含：

- `leaseOwnerId: string | null`
- `leaseToken: string | null`
- `leaseExpiresAt: Date | null`
- `lastHeartbeatAt: Date | null`
- `retryCount: number`
- `maxRetries: number`
- `executionEnvelopeJson: Json | null`
- `providerAttemptId: string | null`
- `providerAttemptPhase: leased | prepared | provider_call_started | provider_result_validated | finalizing | null`
- `providerDispatchedAt: Date | null`
- `resultReceiptHash: string | null`
- `rootTaskId: string`
- `providerCallBudgetMax/Used: number`
- `durationDeadlineAt: Date`
- `costBudgetMicrosMax/Used: bigint`

仓储原语：

```ts
leaseNextQueuedTask(workerId, leaseToken, now, leaseUntil)
heartbeatTask(tenantId, taskId, leaseOwnerId, leaseToken, now, leaseUntil)
finalizeLeasedTask(tenantId, taskId, leaseOwnerId, leaseToken, authoritativeNow, result)
failLeasedTask(tenantId, taskId, leaseOwnerId, leaseToken, authoritativeNow, failure)
recoverExpiredTask(observedTaskLease, authoritativeNow)
```

- `activeClaimKey` 是业务互斥，不得兼作 worker lease。
- heartbeat、fail、finalize、result receipt 和业务资产写入事务都必须满足 `tenantId + taskId + status=processing + leaseOwnerId + leaseToken + leaseExpiresAt>authoritativeNow`。过期 owner 即使 recovery 尚未扫描，也不能续租、失败落账或 finalize。E3 使用统一 ManualClock；E6 使用数据库权威时间。
- recovery 必须使用扫描时观察到的 `tenantId + taskId + leaseOwnerId + leaseToken + leaseExpiresAt` 做条件更新，并要求 `status=processing AND leaseExpiresAt<=authoritativeNow`。只有 affectedRows=1 才写失败事件、释放 activeClaimKey/lease 和设置 finishedAt；已续租任务必须 count=0。
- 同一 task 只能生成一份有效 result receipt；旧 owner、重复 finalize、cancelled task 必须零 candidate/report/current 写入。
- `resultReceiptHash` 固定为经过业务 schema 校验后的结果身份摘要（taskId、attemptId、result object/version IDs、canonical safe summary）的 canonical JSON SHA-256；不得包含 provider raw response。Prisma 以 tenant/task/attempt 或等价约束保证唯一有效 receipt。
- worker context 从已 claim task 的可信 `tenantId/createdBy` 构造，并生成新的 worker requestId；不得使用默认租户或伪造原 HTTP 上下文。

## 5. HTTP 与前端最小适配

HTTP 内允许：schema、权限、业务 gate、provider 配置可用性检查、参数规范化、source snapshot、原子 claim。

HTTP 内禁止：provider 调用、prepare 副作用、候选保存、轮询等待、fire-and-forget。

- 新建或复用 `queued/processing`：返回 `202 { taskId, status, reused, pollUrl }`。
- 复用 terminal/waiting_confirmation：返回 `200` 和原 task 摘要，不隐式 retry。
- 同 token 异指纹、同冲突域不同 token：保持 `409`。
- `POST /tasks/:id/retry` 必须要求幂等键。

`RP-02B2` 必须同时提供 admin 最小 transport 适配：POST 返回 `202` 时只显示“任务已受理/排队或执行中”，保留 pending taskId 并进入现有任务轮询；不得显示“候选已生成/任务已完成”或清除等待状态。任务抽屉、取消文案和全表面统一投影仍归 RP-02C。

## 6. Worker、恢复与 Retry

### 6.1 Worker

- worker dispatcher 覆盖 15 个 `NOVEL_PROVIDER_ACTIONS`；未知 handler 安全失败。
- dispatcher 注册不代表 repository 已获得写能力。`assertProviderActionSupported(taskType)` 必须在 HTTP claim 前和 worker provider 前各执行一次；Prisma 不支持的正文/重写/影响/全书审稿必须 task=0、provider=0、asset=0。
- paused scheduler 测试必须证明 HTTP 返回时 provider call 为 0。
- graceful shutdown：停止领取新任务；在宽限期内维持在途 heartbeat；超时后让 lease 自然过期，不批量立即 requeue。

### 6.2 Recovery

- worker 启动及每轮 dequeue 前扫描过期 `processing`。
- 过期任务依据持久 dispatch checkpoint/result receipt 分类：未 dispatch 为 `WORKER_LEASE_EXPIRED`；已 dispatch 且无 receipt 为 `PROVIDER_OUTCOME_UNKNOWN`。两类均写事件、finishedAt 并释放冲突位。
- queued 任务可在 worker 重启后继续获取。
- 每次 provider 外部调用前，worker 必须先用当前 lease CAS 持久化新的 `providerAttemptId`、`providerAttemptPhase=provider_call_started`、`providerDispatchedAt` 并原子预占调用预算。没有 dispatch checkpoint 的过期任务归 `WORKER_LEASE_EXPIRED`；已有 dispatch、但无持久 `resultReceiptHash` 的任务归 `PROVIDER_OUTCOME_UNKNOWN` 并停止自动重放。

### 6.3 Retry

- retry 创建新 queued child，原 failed task 不变，`retryOfTaskId` 形成 lineage。
- retry 唯一身份固定为 `tenantId + retryOfTaskId + retryIdempotencyToken`：同键同 hash 复用，同键异 hash 返回 `IDEMPOTENCY_CONFLICT`。
- 原子 retry 事务同时完成 source/stale/预算校验、ExecutionEnvelope 复制、active conflict 裁决、`activeClaimKey` 唯一占位、child/首事件/operation log/lineage 创建。不同 key 针对同一 parent 或业务冲突域并发，只允许一个 child；其余返回 `CONFLICT_TASK_EXISTS`，providerCalls=0。`retryCount=parent.retryCount+1`，原任务不修改。
- worker 必须真实消费 retry child，provider 再失败也落在 child。
- 预算来自服务端策略快照并在 root lineage 持久累计，child 不得重置。`maxRetries` 只表示 child 数量，与 provider 调用预算分离；每次真实外部请求、transport retry、再次调用模型的 JSON repair 和 unknown attempt 都计一次 provider call，纯本地 JSON parse/repair 不计。每次调用前原子预占预算，耗尽则 `failed/RETRY_BUDGET_EXHAUSTED`。
- transient 仅限明确 timeout、连接失败、429 和可重试 5xx；配置/权限/validation/source stale/unsupported/poison/schema repair 失败/provider outcome unknown 均为 non-transient。RP-02B3 不由 worker 自动创建 retry child；显式 retry API 才创建 child，worker 只在单次 execution 内执行受预算约束的 transport/model repair。
- source refs 变化时拒绝通用 retry，引导回原业务入口基于最新版本生成。

## 7. 子包写集

### RP-02B1：合同与仓储原语

- 目标：ExecutionEnvelope、领域字段、Prisma/migration 草案、in-memory/Prisma lease CAS 原语、安全序列化。
- 硬上限：12 files / 1,400 net additions。
- 不切换 HTTP 行为，不启动 worker，不改前端。

### RP-02B2：Dispatcher 与快速返回

- 目标：worker dispatcher、paused scheduler、HTTP 202、heartbeat、stale 双门禁、幂等 finalize、graceful shutdown、admin 最小 transport 适配。
- 硬上限：15 files / 1,700 net additions。
- 不实现完整 RP-02C 任务投影与取消产品语义。

### RP-02B3：Recovery 与真实 Retry

- 目标：expired lease recovery、retry child 原子幂等、provider unknown/poison/budget、确定性故障注入。
- 硬上限：12 files / 1,500 net additions。
- 不连接真实 MySQL/provider，不补 RP-03 Prisma 正文写链。

任一子包超限必须先拆包，不得用 ADR 常态放行。

## 8. Deterministic E3 验收

测试必须使用 `ManualClock`、`PausedScheduler`、`DeferredProvider`、`CrashableWorker(A/B)`、`LeaseRepositoryProbe`、`AssetSinkProbe` 和可序列化 fixture，禁止固定 sleep。

最低场景：

1. `http_returns_before_worker`
2. `queued_processing_success`
3. `queued_processing_failed`
4. `ten_workers_one_claim`，barrier 竞争 20 轮
5. `heartbeat_prevents_takeover`
6. `lease_expiry_marks_failed`
7. `old_worker_late_result_fenced`
8. `queued_survives_worker_restart`
9. `failed_retry_consumed_success`
10. `failed_retry_consumed_failed_again`
11. `duplicate_retry_one_child`
12. `cancel_queued_no_provider`
13. `cancel_processing_late_result_zero_write`
14. `stale_before_provider_and_finalize`
15. `unknown_payload_poison_failed_once`
16. `provider_outcome_unknown_no_auto_replay`
17. `retry_budget_exhausted`
18. `execution_envelope_secret_canary`
19. `expired_owner_finalize_before_recovery_scan_zero_write`
20. `expired_owner_heartbeat_cannot_revive`
21. `heartbeat_renewal_races_recovery_zero_false_expiry`
22. `retry_races_fresh_claim_one_active_task`
23. `prisma_unsupported_action_zero_task_zero_provider`
24. `legacy_active_task_without_envelope_fails_safe_provider_zero`
25. `legacy_terminal_task_remains_unchanged`

## 9. E3 / E6 边界

E3 可证明：HTTP/provider 解耦、状态机、单进程 deterministic lease/heartbeat、模拟重启恢复、mock provider worker 消费、fencing 零写入、retry lineage/预算、安全 envelope。

必须留给 `RP-01D` 或后续 E6：

- migration 实际执行与中断恢复。
- MySQL 唯一约束、事务、数据库时钟和 P2002。
- 两个独立 worker 进程竞争与进程 kill/restart。
- 跨进程 lease/fencing CAS、并发 retry 和中途回滚。
- 真实 provider 的请求幂等、unknown outcome 和成本行为。

## 10. 禁止越界

- 不连接真实 MySQL、真实 DeepSeek、媒体或发布平台。
- 不修改完整任务抽屉、取消文案和 RP-02C 用户语义。
- 不补 Prisma 正文/重写/影响/全书审稿写链。
- 不新增任务主状态；poison/unknown outcome 使用 failureCategory/errorCode。
- 不把 in-memory E3 表述为真实多进程 E6。
- `heartbeatInterval < leaseDuration / 3`；具体 duration、recovery batch、退避上限和 jitter 来源必须来自服务端策略快照，不得散落常量。
- 本文“真实 Retry”仅表示 queued retry child 被 worker 实际消费，不表示真实 DeepSeek/provider 已验收。

## 11. 开工门禁

RP-02B1 只有在以下条件满足后才能派发：

1. 后端架构、TEST、QUALITY 对本文复核为 approved，P0/P1 为 0。
2. 验收矩阵和整改计划同步分阶段口径。
3. 需求资产 commit/push 且治理 CI 成功。
4. 实现会话明确只执行 B1，不自动进入 B2/B3。
