# RP-02B2 Dispatcher、Fenced Finalize 与异步 Transport 实现包

## G0-C1 CI 兼容修正（2026-07-18）

`RP-02B2a2-G0-C1` 以 `59cedaf7150029fcbde03d2779662659727e8b4e` 为固定基线，独立修正 trusted admission、RP-01A 本地内存 E2E actor、RP-01C 新分支 push range、correction bootstrap 与 package-gate fixture 性能。最终修正包为 9 files / 326 additions / 62 deletions / 264 net additions，固定矩阵在 554.02 秒内 49/49 通过。correction bootstrap 只识别该固定基线的单个原子直接子提交，并在校验完整 G0-C1 ADR、exact manifest、预算和 workflow 合同后，允许 PR range、显式 workflow dispatch、新建 ref、基线直推及两个独立有效 correction sibling 间的 force-with-lease 替换统一回放 `<59cedaf>..<candidate>`；它不授权任何 A2-A5 业务包。该包不包含 A2 业务实现；修正提交落地并产生新的远程 E1 证据后，A2 必须重新授权并迁移，旧授权不得复用。A2-v3 冻结为 20-file exact manifest 和 `20 / 3,250` 上限；当前集成候选 `07b04c5` 相对旧 provisional G0 `01245feb51b50ec838cb405a67bcafd1b194eeae` 为 3,591 additions、395 deletions、3,196 net additions，并显式包含 `apps/api/src/modules/tasks/routes/taskRoutes.ts` 与 `apps/api/test/rp02b2a/repository-authority-hardening.test.ts`。

状态：`rp02b2a0_completed_b2a_single_package_superseded_split_round6_approved_asset_submission_pending_b2b_b2c_b3_frozen`

问题：`RMD-TASK-002`，承接 `RMD-TASK-001` 的异步执行阶段；`RMD-TASK-003` 继续冻结到 `RP-02B3`

验收：`TASK-PRECLAIM-01`、`TASK-CONCURRENCY-01`、`TASK-WORKER-01`、`TASK-RETRY-01`；heartbeat/graceful shutdown 只属于 B2b，restart/recovery/unknown outcome 只属于 B3。`TASK-SURFACE-01` 完整保留给 RP-02C

依赖：`RP-02B1` 提交 `415d03a` 和阶段证据 `e2c6196`

## 1. 主控裁决

四路初审均拒绝原 RP-02B2 大包。共同原因是：原包混入 B3 recovery/retry、缺少逐 action 权威来源合同、缺少业务资产与 receipt 的同事务 fenced finalize、缺少 provider dispatch checkpoint、HTTP/admin 不能区分 `202 accepted` 与 `200 existing`，且 `15 files / 1,700 additions` 不足以诚实承载全部范围。

原 RP-02B2a 重拆为五个顺序包；连同已完成的 B2a0 和后续 B2b/B2c，当前完整实施顺序共八个阶段：

1. `RP-02B2a0`：高风险试写选择前置修复。只修复 `confirmRisk/selectionReason` 从 Admin 到同步 route/service 的真实透传和 provider 前校验，不改 transport 或 worker。
2. `RP-02B2a1`：Registry、严格 provider ABI 与公开 retry 冻结。让 15-action registry 接管现有同步调用，清除 provider public ABI 的 raw entity/cast，并在任何 leased 能力出现前先关闭误导性的公开重试入口。
3. `RP-02B2a2`：权威 claim 与 provider 前门禁。由可信 actor 和权威仓储构造 canonical envelope，并在 provider 前执行同一 matcher。
4. `RP-02B2a3`：lease phase CAS 与历史 retry child fence。修正 attempt 时机、单向 phase CAS、原子安全失败与既存 retry child；正常 leased action 仍保持 provider=0。
5. `RP-02B2a4`：InMemory action-specific fenced finalize。为 deterministic/InMemory 执行核心补齐第二 stale gate 与资产、receipt、task、event、operation log 原子提交。
6. `RP-02B2a5`：Prisma 9/6 fenced finalize 与 B2a 阶段收口。支持 9 action，后 6 action provider 前零副作用阻断；不外推真实 MySQL。
7. `RP-02B2b`：API 传输与生命周期。把 claim 初态切为 queued、提供 HTTP 202、in-process worker loop/heartbeat/graceful shutdown 和 API E3 回归。
8. `RP-02B2c`：Admin transport。保存真实 taskId、稳定幂等键、精确轮询、刷新/多标签恢复和不会误报完成的 DOM 回归。

只有前一包独立实现、验收、commit/push 后才能授权下一包。B2a1-B2a5 是原 B2a 目标的可验证实施顺序，不缩小最终合同。B2a0/B2a1-B2a5/B2b/B2c 都不实现 recovery scan、真实 retry child、provider outcome unknown、poison orchestration或真实数据库/多进程/provider。

## 2. 冻结范围

### 2.1 RP-02B2a0

- high/blocking 试写候选的 `confirmRisk/selectionReason` 从 Admin 请求到 shared schema、route 和 NovelService 同步路径完整透传。
- 缺失确认或空原因必须在现有同步 provider 前失败，task/provider/asset=0；普通风险候选保持当前同步行为。
- 不新增 ExecutionEnvelope、dispatcher、worker、capability、202 或 submission intent；不改变其他生成入口。
- API route、Admin service 与 Vue DOM 使用独立命令 `test:rp02b2a0` 形成完整回归。

### 2.2 RP-02B2a1-B2a5

- shared `ExecutionEnvelopeV1` 补齐 worker finalize 所需的严格审计字段。
- 单一 action-discriminated `ActionExecutionPlan` registry 同时服务现有同步路径和 worker dispatcher；禁止维护第二份 provider/finalize 映射，未知 handler 安全失败。
- worker 按 ID 重载权威资产，provider 前 stale gate，provider 返回后在 finalize 事务内再次 stale gate。
- typed `checkpointLeasedTask`，所有 phase 迁移都要求有效 lease。
- `finalizeLeasedAction`：stale recheck、业务资产、result receipt、task 终态和唯一 terminal event 同事务提交。
- in-memory 与 Prisma 的同合同实现；Prisma 只允许当前支持的 9 action，后 6 action 在 claim 前稳定零副作用阻断。
- B2a1 起，provider-backed task 的公开 projection 固定 `retryable=false`、受控失败原因和 disabled 下一步；retry API 稳定返回 `409 RETRY_NOT_AVAILABLE`，mutation/event/log/child=0。该冻结优先于 stale/conflict 分支。B2a3 只负责把历史遗留 queued/processing retry child 在 lease/provider 前原子置为受控终态。
- 承接 B2a0 已验收的风险参数；将其继续写入 envelope/receipt/log，禁止重复定义另一份 route/Admin 映射。
- B2a1-B2a5 各自拥有精确 core 命令和累计 fail-fast 包命令；`test:rp02b2a:core` 只能是五个精确 core 的显式串行别名，`test:rp02b2a` 只能指向通过全部前序回归的 B2a5 复合命令，禁止目录 glob 或后包测试反向冒充前包证据。
- 拆包只改变交付和验收粒度，不允许减少上述任何能力。B2a1-B2a5 全部独立验收前，`RP-02B2a` 不得标记完成。
- B2a3 只能证明 phase/attempt/fail-safe/retry 合同；B2a4 未完成前，正常 leased action 必须在 provider 前硬阻断。B2a4 只放行 deterministic/InMemory 能力；Prisma action 必须等 B2a5 对应 9/6 能力门禁完成。
- 五包始终保留现有同步 HTTP 200，不切 queued/202，不新增运行时 scheduler/worker loop，不向 Admin 暴露新的任务状态。
- B2a1-B2a3 的新增 leased path 对 public HTTP、Admin 和 task DTO 不可达；B2a4 的 `waiting_confirmation/candidate/resultIds` 仅 deterministic harness 可观察，不得接入 public route/UI。现有同步 HTTP 200 只有在同请求的业务写入成功提交后才能返回候选；stale、fenced 或 rollback 不得返回候选、resultId 或成功文案。B2a5 仍不新增 transport 或 UI 状态。
- repository 必须提供 server-authoritative typed execution capability，dispatcher 在 `prepared -> provider_call_started` 前读取：B2a3 的 InMemory/Prisma 全部 `disabled`；B2a4 仅 InMemory 15 action `enabled`，Prisma 全部 `disabled`；B2a5 的 Prisma 仅 9 action `enabled`、6 action `unsupported`。禁止客户端 flag、环境变量或 `instanceof` 推断。新 claim 遇到 unsupported 必须 task/provider/asset=0；历史已存在的 leased task 遇到 disabled/unsupported 必须经 `failLeasedAction` 原子终态且 provider/asset/receipt/current=0。

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

### 2.5 明确不做

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

interface ExecutionEnvelopeV1_1<TAction extends NovelProviderAction, TRequest, TSourceRefs> {
  schemaVersion: '1.1';
  tenantId: string;
  novelId: string;
  objectType: string;
  objectId: string;
  action: TAction;
  normalizedRequest: TRequest;
  sourceVersionRefs: TSourceRefs;
  policyProfileVersionId: string | null;
  modelRoutingVersion: string;
  auditContext: ExecutionAuditContextV1;
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
- `ExecutionEnvelopeV1_1` 保留 V1 的 `objectType`、`policyProfileVersionId` 与 `modelRoutingVersion`；`effectiveRequest` 仅重命名为 action-specific `normalizedRequest`。迁移不得丢弃或从客户端补写这三个既有执行字段。
- canonical payload 是**不含 `requestHash`** 的完整 `ExecutionEnvelopeV1_1`。服务端对该 payload 做 strict parse、canonical JSON 和 SHA-256，结果仅写入 task 顶层 `requestHash`；匹配时重新 canonicalize envelope 并与 task 顶层 hash 比较。禁止把 hash 放回 envelope 后对自身求 hash。
- envelope 仍受 strict union、32 KiB、安全字段和值 canary、canonical JSON/task 顶层 requestHash 一致性约束。B2 新任务只写 `schemaVersion='1.1'`，`tenantId` 与 `auditContext` 都是基接口必填字段；legacy 缺版本、旧版本或未知版本只能走同步 parser/replay 的 fail-closed 兼容，不得原地升级、补字段或进入 lease/worker。
- 同 key 重放时，服务端必须先按 `tenantId+userId+action+objectId+idempotencyKey` 加载既存 task；身份一致时复用该 task 持久化的 `requestedAt`、服务端 authority snapshot 和规范化 request 重算 canonical envelope/requestHash，禁止使用新的 `now` 或调用方提交的 snapshot。任何 hash/identity 不一致都稳定返回 typed conflict，八类副作用 `task/event/provider/asset/receipt/current/operation-log/child` 全为 0。

### 3.1 B2a2 可信 RequestContext 注入合同

`buildApp` 必须新增可注入的 authenticated `RequestContextResolver`，并原样传给 15 个 provider-backed route；B2a2 不允许 route 或 service 自行创建可信身份。生产 `main.ts` 必须从 `config/env.ts` 已校验的服务端 deployment actor 配置 `DEPLOYMENT_ACTOR_TENANT_ID` 与 `DEPLOYMENT_ACTOR_USER_ID` 显式构造 resolver；该配置不是客户端 header/body，也不是 `tenant_default/user_default`。生产配置缺失或空白时启动 fail closed，不得暴露一个会回退默认身份的 B2 route：

```ts
interface TrustedRequestActor {
  tenantId: string;
  userId: string;
}

type RequestContextResolver = (request: FastifyRequest) => Promise<TrustedRequestActor | null>;
```

- resolver 是 B2 task/envelope 的唯一 actor 来源。每次请求只解析一次，结果规范化后以不可变值同时传给 authority loader、task claim 与 envelope builder；`task.tenantId === envelope.tenantId === actor.tenantId` 且 `task.createdBy === envelope.auditContext.requestedByUserId === actor.userId`。
- 请求 body、query、cookie 及任意 `x-tenant-id`/`x-user-id` 伪造值都不能覆盖 resolver 结果，也不能参与 idempotency scope、authority lookup 或 canonical hash；测试必须带冲突 canary 证明伪造值零命中 task/envelope/provider payload。
- resolver 未注入、返回 `null`/`undefined`、抛错，或返回缺失/空白 tenant/user 时，15 个 B2 入口稳定 fail closed；禁止回退 `createDefaultRequestContext`。`createDefaultRequestContext` 只保留既有 legacy 同步路径，任何由它产生的 `tenant_default/user_default` context 都不得创建、补写或重放 B2 envelope。
- 身份隔离矩阵必须至少覆盖：同一 tenant 的 user A/user B 使用相同 action/object/key 不得互相复用；tenant A/tenant B 使用相同 user/action/object/key 不得互相命中 actor-scoped idempotency lookup；resolver actor 与 novel tenant 不一致必须在 claim 前失败。每例都逐字段断言 task/envelope actor 一致。公开 `/tasks/:id` 与 events 查询的 actor 可见性仍归 RP-02B2b，不得在 A2 越权修改或宣称关闭。
- A2 不迁表：存储层 idempotency token 必须由 `tenantId/userId/action/objectId/rawIdempotencyKey` 的 canonical UTF-8 bytes 计算 SHA-256，并继续落入现有 `tenantId+taskType+idempotencyToken` 唯一约束；禁止直接存 raw key 或只按 tenant/action/key 复用。
- B2a2 的 resolver 只证明 trusted actor 注入与 task/envelope 绑定，不新增 capability endpoint、scope/revision/expiry、lease、worker、finalize 或异步 transport。

### 3.2 B2a2 persisted requestedAt replay oracle

该 oracle 必须使用单一 `ManualClock` 和固定时间点，不接受“两个请求很快发生”或真实 timer 作为替代：

1. `ManualClock.set(T0='2026-07-15T00:00:00.000Z')`，以 trusted actor、固定 action/object/idempotencyKey 和规范化 request 首次 claim。断言 task 持久化的 `executionEnvelopeJson.auditContext.requestedAt` 与 canonical envelope 的 `requestedAt` 都精确等于 T0，并保存 canonical envelope bytes、`requestHash`、authority snapshot 和 taskId；不得为此新增 task 表顶层时间列。
2. `ManualClock.set(T1='2026-07-15T00:05:00.000Z')`，以完全相同 actor/action/object/key/request 重放。实现必须先读取既存 task，再使用持久化 T0、持久化规范化 request 和持久化 authority snapshot 重算；断言 taskId、canonical bytes、`requestHash` 与 T0 全部逐字节相同，`requestedAt !== T1`，返回既有同步结果且不出现 `queued/202`。
3. T1 重放的八类增量 `task/event/provider/asset/receipt/current/operation-log/child` 必须全部为 0，既存 task 总数保持 1；调用方提交 `requestedAt=T1`、伪造 authority snapshot 或 server clock canary 都不得改变结果。
4. 负 oracle 必须把重放实现临时变异为使用 T1 或调用方 `requestedAt`，并证明测试因 canonical bytes/requestHash 改变而失败；只断言“复用了 taskId”不算通过。若 T0 后 authority 已缺失或变化，T1 重放必须走下节 `SOURCE_STALE` 零副作用路径，禁止把新 authority 写回既存 envelope。

## 4. 15-Action Authority Matrix

全阶段的 provider 前 gate 与后续包的 finalize gate 使用同一 action-specific matcher。B2a2 只交付 claim 前和 claim 后/provider 前两次权威检查，不实现或认领 finalize gate。ownership、tenant、novel、状态或版本任一不匹配均为 `SOURCE_STALE`；不得自动替换为最新版本。

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

matcher 输出只能是 `{ ok: true, sources }` 或 `{ ok: false, code: 'SOURCE_STALE', safeReason }`。`SOURCE_STALE` 是 domain 内部 typed code；route 稳定映射为既有公开 `409 VERSION_CONFLICT`。A2 同时在 `packages/shared/src/api.ts` 新增公开错误定义：resolver 缺失/null/空身份稳定映射为 `401 UNAUTHORIZED`，resolver 抛错稳定映射为 `503 DEPENDENCY_UNAVAILABLE`。不得把内部堆栈或 raw reason 放入公开响应；`safeReason` 不包含正文、prompt、provider raw response、密钥或数据库连接信息。

### 4.1 B2a2 两阶段 15-action 零副作用 oracle

`authority-claim.test.ts` 必须对上表全部 15 action 分别运行 `missing` 与 `changed` 两类变异，并在两个 barrier 位置各执行一次；不得用一个代表 action 外推其余 14 个：

| barrier | 注入时机 | 必须断言 |
| --- | --- | --- |
| claim 前 | 构造规范化 request 后、任何 task claim 前，删除一个 required authority 或改变任一 required ID/hash/ownership/tenant/novel/status/version/order/current pointer | typed `SOURCE_STALE`；`task/event/provider/asset/receipt/current/operation-log/child = 0`；provider spy 未 entered |
| claim 后/provider 前 | authority claim 已按 T0 snapshot 组装后、provider 调用前暂停；再删除或改变同一 action 的 required authority，然后恢复执行 | 第二次 matcher 必须发现变化；本次 claim 不得提交可见 task，孤立 fixture 的八类最终绝对计数仍全部为 0；provider spy 未 entered |

- 两阶段都必须使用生产 `NovelService -> taskClaim -> registry -> repository authority loader` 符号和 `MutableAuthorityStore` barrier；probe-only matcher、预先让 schema 失败或只检查返回码不算证据。
- “八类全 0”是逐类精确断言，不允许只写 `no side effects`，也不允许以删除已提交 task 冒充原子零写；claim 后变异必须由同一原子 claim/authority 边界回滚或不提交。
- legacy replay 另设固定矩阵：fixture 初始精确存在 1 条 legacy task；B2 envelope/task actor 字段缺失、`null`、空对象、空白字符串；来自默认 fallback 的 `tenant_default/user_default` 占位身份；task 与 envelope tenant/user 不一致；task/envelope 与 novel tenant 或 novelId 不一致。只走同步 replay/parser，不进入 lease/worker。全部稳定 fail closed 为 `WORKER_PAYLOAD_UNSUPPORTED` 或 shared contract 映射的等价 typed error，既存 task 总数保持 1，八类副作用增量全 0，禁止合成默认身份、自动升级 payload 或调用 provider。
- 本节只证明 deterministic mock E3 的 authoritative claim 与 provider 前 gate；不创建 capability/lease/checkpoint/finalize/receipt 写链，不返回 202，不连接真实 DB/provider/media，也不声称 E6。

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

从 B2a 起，provider-backed failed task 的公开投影固定为：`retryable=false`；`userFailureReason="任务执行失败，未写入新的候选或正式内容。"`；`nextAction.type="disabled"`、`label="暂不支持任务重试"`、`reasonText/disabledReason="当前阶段暂不支持任务重试，请返回业务页面查看当前内容。"`、`target="disabled"`、`disabled=true`、`confirmRequired=false`。公开失败文案不得包含“重试”或“稍后重试”的行动建议；这条限制不改变非 provider-backed task 的既有投影。直接调用 retry API 的公开 message 固定为“当前阶段暂不支持任务重试，未创建新任务。”，且不得回显内部异常、provider response 或请求身份字段。

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

五包命令必须固定为以下精确接口；每个 `:core` 只运行本包列出的测试文件，每个复合命令先串行全部已完成前序包，任一失败立即停止。每个 `:core`、`:gate` 和复合命令必须自己以 `env -u DATABASE_URL -u DEEPSEEK_API_KEY -u DEEPSEEK_BASE_URL -u DEEPSEEK_MODEL -u DEEPSEEK_STRUCTURE_MODEL -u DEEPSEEK_REASONER_MODEL -u DEEPSEEK_TIMEOUT_MS -u DEEPSEEK_MAX_RETRIES -u DEPLOYMENT_ACTOR_TENANT_ID -u DEPLOYMENT_ACTOR_USER_ID NODE_ENV=production AI_PROVIDER_MODE=mock DOTENV_CONFIG_PATH=/dev/null` 清空真实 DB/provider/secret/actor 环境；不得依赖调用方或 workflow 的外部清理：

- `test:rp02b2a1:gate`：真实执行 `scripts/rp02b2a-package-gate.test.mjs`，该测试只通过子进程调用生产 `scripts/rp02b2a-package-gate.mjs`，并读取真实 `.github/workflows/rp01c-fixtures.yml` 与 `.github/workflows/rp02b2a-admission.yml`，不得复制 helper、正则模拟或跳过 YAML wiring。前者只承担 bootstrap/普通 CI/post-merge 回归，后者只有在 accepted G0 进入默认分支后才承担 A2-A5 authoritative admission；候选分支上的任一 workflow/gate 都不能自证准入。
- `test:rp02b2a1:core`：显式运行真实存在的 `apps/api/test/rp02a/rp02a.test.ts` 与 `apps/api/src/modules/novels/novelRoutes.test.ts`，后者承载 A1 registry/strict ABI、同步 200 和 retry freeze 回归；并串行执行 `test:rp02b2a1:gate`。A1 从未交付 `apps/api/test/rp02b2a/registry-provider-abi.test.ts`，不得再把该不存在路径列为测试映射或验收证据；`test:rp02b2a1 = test:rp02b1 -> test:rp02b2a0 -> test:rp02b2a1:core`。
- `test:rp02b2a2:core`：`authority-claim.test.ts`、`repository-authority-hardening.test.ts` 与 A2 同步 200 回归；`test:rp02b2a2 = test:rp02b2a1 -> test:rp02b2a2:core`。
- `test:rp02b2a3:core`：`lease-dispatch-retry.test.ts`；`test:rp02b2a3 = test:rp02b2a2 -> test:rp02b2a3:core`。
- `test:rp02b2a4:core`：`inmemory-fenced-finalize.test.ts` 与 A4 同步 200 回归；`test:rp02b2a4 = test:rp02b2a3 -> test:rp02b2a4:core`。
- `test:rp02b2a5:core`：`prisma-fenced-finalize.test.ts`；`test:rp02b2a5 = test:rp02b2a4 -> test:rp02b2a5:core`。
- `test:rp02b2a:core` 显式串行 A1-A5 五个 core；`test:rp02b2a = test:rp02b2a5`。禁止目录 glob、复制 fixture helper 或依赖全仓测试偶然覆盖。

B2a2 在 `package.json` 中的三个 script value 必须逐字符等于下列合同；`ENV_PREFIX` 不得抽成依赖调用方状态的外部变量：

```json
{
  "test:rp02b2a2:env-probe": "node -e \"const keys=['DATABASE_URL','DEEPSEEK_API_KEY','DEEPSEEK_BASE_URL','DEEPSEEK_MODEL','DEEPSEEK_STRUCTURE_MODEL','DEEPSEEK_REASONER_MODEL','DEEPSEEK_TIMEOUT_MS','DEEPSEEK_MAX_RETRIES','DEPLOYMENT_ACTOR_TENANT_ID','DEPLOYMENT_ACTOR_USER_ID']; if(keys.some((key)=>process.env[key]!==undefined)||process.env.NODE_ENV!=='production'||process.env.AI_PROVIDER_MODE!=='mock'||process.env.DOTENV_CONFIG_PATH!=='/dev/null') process.exit(1); console.log('RP02B2A2_ENV_CLEAN')\"",
  "test:rp02b2a2:core": "env -u DATABASE_URL -u DEEPSEEK_API_KEY -u DEEPSEEK_BASE_URL -u DEEPSEEK_MODEL -u DEEPSEEK_STRUCTURE_MODEL -u DEEPSEEK_REASONER_MODEL -u DEEPSEEK_TIMEOUT_MS -u DEEPSEEK_MAX_RETRIES -u DEPLOYMENT_ACTOR_TENANT_ID -u DEPLOYMENT_ACTOR_USER_ID NODE_ENV=production AI_PROVIDER_MODE=mock DOTENV_CONFIG_PATH=/dev/null sh -c 'npm run test:rp02b2a2:env-probe && npm run build -w @ai-shortvideo/shared && npm run prisma:generate -w @ai-shortvideo/api && npm exec -w @ai-shortvideo/api -- tsx --test test/rp02b2a/authority-claim.test.ts test/rp02b2a/repository-authority-hardening.test.ts src/modules/novels/novelRoutes.test.ts'",
  "test:rp02b2a2": "env -u DATABASE_URL -u DEEPSEEK_API_KEY -u DEEPSEEK_BASE_URL -u DEEPSEEK_MODEL -u DEEPSEEK_STRUCTURE_MODEL -u DEEPSEEK_REASONER_MODEL -u DEEPSEEK_TIMEOUT_MS -u DEEPSEEK_MAX_RETRIES -u DEPLOYMENT_ACTOR_TENANT_ID -u DEPLOYMENT_ACTOR_USER_ID NODE_ENV=production AI_PROVIDER_MODE=mock DOTENV_CONFIG_PATH=/dev/null sh -c 'npm run test:rp02b2a2:env-probe && npm run test:rp02b2a1 && npm run test:rp02b2a2:core'"
}
```

生产 `scripts/rp02b2a-package-gate.mjs` 必须从选定 candidate HEAD（`--worktree` 时才读当前 worktree）读取真实 `package.json` 并对上述三个值做 exact assertion；`scripts/rp02b2a-package-gate.test.mjs` 必须用临时 committed candidate/mutation fixture 执行以下负例。每个负例都必须红，不能只做字符串搜索，也不能误读未提交 dirty `package.json`：

- 把整个 `:core`/复合命令或任一 required segment 替换为 `true`；把 `sh -c` body 置空、只留 `env-probe` 或只 `echo` 的空壳。
- 在前序、build、Prisma generate 或 test segment 后追加 `|| true`，或用 `;`/`set +e` 使失败可继续。
- 分别删掉任一 `env -u`、把三个固定环境值改错，或从外部注入 DB/provider/secret canary；direct `:env-probe` 必须失败，`:core` 与复合命令必须清理后打印 `RP02B2A2_ENV_CLEAN`，测试/provider payload/日志中 canary 零命中。
- 用 exit 17 的 synthetic predecessor 替换 `test:rp02b2a1`，断言复合命令非 0 且 A2 core marker/测试进程启动数为 0；再分别让 build、Prisma generate 失败，后续测试启动数也必须为 0。任何“前序失败但 A2 继续执行”的变体都拒绝。

这些命令只运行 mock/deterministic E3；不得在 B2a2 script 中加入 capability、lease/finalize/202 测试或真实 DB/provider/E6 探测。

authoritative admission workflow 只能从 repository-controlled `RP02B2A_AUTHORIZED_PACKAGE_ID` 选择包，并要求唯一 changed B2aN ADR 与该外部 package id 完全一致；还必须从 repository-controlled `RP02B2A_G0_EVIDENCE_SHA` 验证一个 accepted G0 的合法 sibling E1，不能从候选输入或正文推断。不得由候选 ADR 自行决定本次采用哪组授权规则或复合命令。可信 gate 通过后，独立的零 secret 候选 job 才可 checkout 精确 candidate SHA、执行该包固定复合命令；A1 远程复合命令必须实际包含 `test:rp02b2a1:gate`，因此远程始终固定执行 B1、B2a0、全部已完成前序包和当前包。`test:rp02b1` 必须缩窄到 B1 文件，避免未来污染。A2/A3 的 E3 必须经过真实 `NovelService -> taskClaim -> registry -> repository` 生产符号，不得只测 MutableAuthorityStore/probe。

必须使用显式 `ManualClock.set/advance`、`DeferredProvider.entered/resolve/reject`、`MutableAuthorityStore`、`LeaseRepositoryProbe`、`AssetSinkProbe` 和 barrier；禁止固定 sleep。

1. `dispatcher_all_15_actions_and_unknown_handler`
2. `envelope_reconstructs_provider_and_finalize_inputs`
3. `authority_missing_or_changed_before_claim_all_15_actions_eight_side_effects_zero`
4. `authority_missing_or_changed_after_claim_before_provider_all_15_actions_eight_side_effects_zero`
5. `stale_before_finalize_provider_one_asset_zero`
6. `checkpoint_requires_live_lease_and_monotonic_phase`
7. `provider_dispatch_checkpoint_precedes_provider`
8. `expired_owner_checkpoint_fail_finalize_zero_write`
9. `duplicate_finalize_one_receipt_one_asset`
10. `fenced_finalize_fault_injection_rolls_back_all`
11. `cancelled_task_late_result_zero_write`
12. `prisma_supported_nine_and_unsupported_six_zero_side_effect`
13. `trusted_request_context_same_tenant_two_users_and_two_tenants_no_default_fallback`
14. `worker_error_event_log_secret_canary`
15. `provider_retry_api_frozen_zero_child`
16. `existing_retry_child_is_terminally_fenced_before_provider`
17. `risk_trial_selection_from_b2a0_roundtrips_envelope_receipt_and_audit`
18. `provider_receives_only_authority_projected_input_and_untracked_field_change_is_stale_or_unused`
19. `controlled_terminal_failures_are_atomic_with_event_and_operation_log`
20. `provider_public_abi_uses_exact_action_pick_and_preserves_nullable_word_target`
21. `long_term_memory_identity_uses_source_content_version_and_snapshot_hash`
22. `provider_backed_task_projection_freezes_retry_and_retry_mutation_zero`：除八类副作用精确为 0 外，逐字段断言 `retryable=false`、固定 `userFailureReason`、disabled `nextAction` 和 retry API 的固定 409 message；公开文案不得包含“稍后重试”。
23. `authority_changes_during_finalize_is_locked_or_cas_fenced`
24. `trusted_actor_is_identical_across_claim_and_envelope_no_default_fallback`
25. `persisted_requested_at_replay_uses_t0_after_manual_clock_advances_to_t1`
26. `legacy_envelope_missing_empty_placeholder_wrong_tenant_or_novel_fails_closed`
27. `b2a2_package_scripts_are_exact_env_clean_and_fail_fast`

27 个 deterministic 场景的唯一归属、测试文件与累计回归如下；同一编号除场景 23 的 InMemory/Prisma 两种 repository 证据外不得跨包重复认领，后续包必须运行前序复合命令而不是复制场景：

| 子包 | 场景编号 | 本包测试文件 | 必须累计回归 |
| --- | --- | --- | --- |
| B2a1 | 1、15、20、22；另含 package-gate workflow 正反例 | `apps/api/test/rp02a/rp02a.test.ts`、`apps/api/src/modules/novels/novelRoutes.test.ts`、`scripts/rp02b2a-package-gate.test.mjs` | B1、B2a0；同步 HTTP 200/非 202、公开 retry freeze、固定失败投影与八类零副作用 |
| B2a2 | 2、3、4、13、18、21、24、25、26、27 | `apps/api/test/rp02b2a/authority-claim.test.ts`、`apps/api/test/rp02b2a/repository-authority-hardening.test.ts`、`apps/api/src/modules/novels/novelRoutes.test.ts`、`scripts/rp02b2a-package-gate.test.mjs` | B2a1 全量；T0/T1 replay、可信 actor、action-specific authority/source refs、repository authority、两阶段 15-action 八类零副作用、legacy fail-closed、candidate-HEAD exact/fail-fast 命令、同步 200 |
| B2a3 | 6、8、14、16、19 | `lease-dispatch-retry.test.ts` | B2a2 全量；A1 public retry freeze、A2 authority gate、正常 leased action provider=0 |
| B2a4 | 5、7、9、10、11、17、23（InMemory） | `inmemory-fenced-finalize.test.ts`、`novelRoutes.test.ts` | B2a3 全量；provider dispatch checkpoint 只在 A4 finalize capability 就绪后证明；InMemory 15 action、公开同步 200/非 202、leased result 仅 harness 可见 |
| B2a5 | 12、23（Prisma） | `prisma-fenced-finalize.test.ts` | B2a4 全量；Prisma 9 enabled/6 unsupported、deterministic transaction/CAS、无 transport/UI 扩张 |

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

B2a0/B2a1-B2a5/B2b/B2c E3 可证明：风险参数同步链、单进程 deterministic dispatcher/lease/checkpoint/fencing、mock provider 双 stale gate、in-memory 与可注入 deterministic Prisma repository transaction/CAS contract、Fastify inject 202、Admin store/CAS 算法与 DOM transport。

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

### RP-02B2a 原单包

原 `23 files / 2,000 net additions` 授权在研发交付复核中被撤销，状态固定为 `superseded_before_commit`。当前 13-path partial diff 不得 stage/commit/push，也不得成为任一新包的累计基线。它只保留在原工作树作为隔离参考；新包必须从 `c673eaf` 或前一包已独立验收的 clean commit 逐 hunk 重建。

### RP-02B2a1 Registry, Strict ABI And Public Retry Freeze

- 硬门禁：`18 files / 1,900 net additions`。
- `packages/shared/src/api.ts`
- `apps/api/src/modules/novels/services/actionExecutionPlan.ts`
- `apps/api/src/modules/novels/services/novelService.ts`
- `apps/api/src/modules/tasks/services/taskService.ts`
- `apps/api/src/modules/novels/providers/mockDirectionProvider.ts`
- `apps/api/src/modules/novels/providers/mockStructureProvider.ts`
- `apps/api/src/modules/novels/providers/mockTrialProvider.ts`
- `apps/api/src/modules/novels/providers/mockBodyProvider.ts`
- `apps/api/src/modules/novels/providers/mockFullReviewProvider.ts`
- `apps/api/src/modules/novels/providers/deepseekNovelProvider.ts`
- `apps/api/test/rp01c/fixtureFactory.test.ts`
- `apps/api/test/rp02a/rp02a.test.ts`
- `apps/api/src/modules/novels/novelRoutes.test.ts`
- `scripts/rp02b2a-package-gate.mjs`
- `scripts/rp02b2a-package-gate.test.mjs`
- `.github/workflows/rp01c-fixtures.yml`
- `docs/adr/rp-02b2a1-registry-abi-budget.md`
- `package.json`
- E3：真实 `NovelService -> registry -> provider spy` 覆盖 15 action、unknown action、逐 action exact keys/nullable 字段/raw canary；证据实际位于 `apps/api/src/modules/novels/novelRoutes.test.ts`，RP-02A 兼容/AST 回归位于 `apps/api/test/rp02a/rp02a.test.ts`，不存在独立 `registry-provider-abi.test.ts`。provider public ABI 与调用点 raw entity/cast 扫描为零。15 action 同步 HTTP 保持 `200`，不出现 `202/queued`。provider-backed projection/retry API 固定 `retryable=false + 409 RETRY_NOT_AVAILABLE`，mutation/event/log/child=0。G0 bootstrap/普通 CI 与 default-branch authoritative admission 必须最终调用 accepted G0 的同一 gate 语义；测试执行真实脚本与真实 workflow wiring 的 PR base/candidate、push post-merge、dispatch audit、ADR/manifest/count 失败分支，不得复制 helper。该句描述目标合同，不追加 A1 已验收范围。

### RP-02B2a2-G0 Gate Prep

- 硬门禁：`16 files / 2,000 net additions`，固定基线 `6eaf60af4155a8b95ff77d53261f5896d3a8f77d`。除 `.github/workflows/rp02b2a-admission.yml` 外，manifest 还纳入 `.github/workflows/rp01a-e2e.yml`、`.github/workflows/rp01b-dom.yml`、`.github/workflows/remediation-governance.yml`、`apps/api/test/rp01c/fixtureFactory.test.ts` 与 `apps/admin-web/src/modules/novels/components/TaskProgressPanel.dom.spec.ts`，只允许把 E1 父工作流使用的第三方 action 固定到完整 SHA、根 permissions 收紧为只读，并让 checkout 使用 `persist-credentials: false`；`--worktree` 只接受固定基线或其唯一直接子提交 pending atomic amend，最终 commit-mode 继续强制固定基线的唯一原子直接子提交。当前未提交差异为 `1,999` net additions，main 必须在最终差异冻结后重算回填，净增量上限不因文件数增加而扩大。
- 仅允许上一条冻结 16-file manifest 中的路径：`.github/workflows/rp01a-e2e.yml`、`.github/workflows/rp01b-dom.yml`、`.github/workflows/rp01c-fixtures.yml`、`.github/workflows/remediation-governance.yml`、`.github/workflows/rp02b2a-admission.yml`、`apps/admin-web/src/modules/novels/components/TaskProgressPanel.dom.spec.ts`、`apps/api/test/rp01c/fixtureFactory.test.ts`、本实现包、上位验收矩阵、三份主控/证据文档、`docs/adr/rp-02b2a2-gate-prep-budget.md`、package-gate script/test 及根 `package.json`。根脚本改动只限 A1 `env-probe`、`:gate`、`:core`、复合命令补齐两个 deployment actor 环境清理；可信 gate 必须冻结其余继承脚本、禁止新增脚本和 root lifecycle。
- G0 必须先独立 TEST/QUALITY/治理清零并提交推送。最终 G0 必须经过人工/独立复核，并且是固定基线 `6eaf60af4155a8b95ff77d53261f5896d3a8f77d` 的唯一原子直接子提交；禁止把旧 G0 后续修订累计成新 G0，也禁止在 G0 内出现任一 E1 `g0_evidence_*` 字段、remote-accepted 事件或 verification 7.3。G0 是一次性 bootstrap exception，不能由自己新增的 workflow 或候选 gate 自我验收。A2 必须在 MC 显式授权后，从 accepted G0 code head 新建 sibling 实现分支，不得从 E1 evidence commit 开始；A2 diff 不得重复修改 G0-only 文件。根 `package.json` 是唯一允许的显式重叠文件：A2 只能新增第 443-445 行冻结的三条精确脚本，G0 已固定的 A1 四条安全脚本及其他继承脚本必须逐字不变。G0 不授权业务实现。
- `.github/workflows/rp01c-fixtures.yml` 只承担 G0 bootstrap、普通 CI、G0 远程验收和 post-merge 回归，对 A2-A5 admission 明确为 non-authoritative。只有 accepted G0 已进入默认分支后，默认分支版本的 `.github/workflows/rp02b2a-admission.yml` 才是 A2-A5 唯一 authoritative admission；固定触发 `pull_request_target` 的 `opened/synchronize/reopened/ready_for_review`，并通过 repository API 默认分支、事件 `base.ref`、`github.ref` 与 live PR `base.ref` 双阶段校验拒绝任何非默认分支目标，不得让候选分支 workflow 或同名 status check 替代。
- authoritative workflow 必须先 checkout repository-controlled accepted G0 到可信目录并确认其 SHA/父提交，再只把 `github.event.pull_request.head.sha` 作为 Git object fetch，交给 accepted G0 的可信 gate 静态检查。在 gate 成功前，禁止 checkout 候选工作树、执行候选 Node/script/action、运行 `npm ci`、读取并执行候选 package command、启用 cache 或把 credential/secret 暴露给候选。所有 action 固定完整 commit SHA，权限只允许显式 `contents: read`、`actions: read`，并仅为 live PR 身份校验增加 `pull-requests: read`；候选 job 使用 hosted runner、`persist-credentials: false`、零 secret。
- A2-A5 的唯一授权来源是 repository-controlled 元组 `RP02B2A_AUTHORIZED_PACKAGE_ID` + `RP02B2A_AUTHORIZED_PREDECESSOR_SHA`，并强制绑定 repository-controlled `RP02B2A_G0_EVIDENCE_SHA`；未授权时 package/predecessor 固定 `NOT_AUTHORIZED` / `not_authorized`。前序链严格固定为 `A2 <- accepted G0 code head`、`A3 <- independently accepted A2 code head`、`A4 <- independently accepted A3 code head`、`A5 <- independently accepted A4 code head`。候选 ADR、分支、提交/evidence 文本、workflow dispatch input、caller env 或候选 workflow 均不能自授权、伪造 E1 或选择较后的包绕过较前包。
- 外部 package id 决定唯一允许变化的业务 ADR；外部 predecessor 必须是完整非零 40 位、可解析、可达且为 candidate 的祖先，ADR `baseline_sha` 必须与其逐字相同。比较区间固定为 `<authorized predecessor>..candidate` 的累计区间，禁止 event direct diff 隐藏早期改动。package/ADR 不一致、缺失/错误/陈旧 predecessor、指向 E1、同区间多个业务 ADR、跨包 manifest 或 A2 历史触碰三份 E1 evidence 文件时，必须在候选 install/test 前 fail closed。
- `push` 仅用于 post-merge CI，不能产生 authoritative admission；`workflow_dispatch` 仅用于 replay/audit，不能授权候选。authoritative evidence 必须绑定 workflow path/id、`event=pull_request_target`、`github.workflow_sha`、PR number、PR base SHA、authorized predecessor SHA、accepted G0-E1 SHA/digest、candidate SHA、gate source SHA、package id、绑定策略与 candidate blob 的 manifest digest、固定 test command；任一漂移均拒绝，并输出可下载 JSON artifact。
- 两个 workflow 的根键、job、runner、timeout、permissions、env 和全部步骤都是精确白名单。任一步骤的 `if`、`continue-on-error`、自定义 shell、额外 job/step、步骤重排、触发器/branch filter 扩展、授权变量改绑或 retired 变量复用均视为绕过并拒绝。本节定义待实现和待复验合同，不宣称 workflow、gate、测试或远程验收已经通过。

#### RP-02B2a2-G0-E1 一次性证据发布

- G0 最终代码提交必须先取得同一 HEAD 的 `RP-01A backend E2E`、`RP-01B admin DOM tests`、`RP-01C deterministic fixtures`、`Remediation governance` 四路远程成功。之后仅允许在专用 evidence 分支创建一个 package id 为 `RP-02B2a2-G0-E1` 的原子提交；它是该 evidence lineage 中唯一的 E1 提交，且直接父提交必须为 accepted G0 code head。该提交不得是 merge，不得与 G0 或 A2 合批，也不得存在第二个 E1。A2 实现分支必须从 accepted G0 code head 独立创建，与 E1 evidence 分支互为 sibling；生产 gate 必须显式拒绝 `E1 -> A2`。
- E1 只允许修改 `docs/reviews/main-control-status.md`、`docs/reviews/main-control-event-ledger.md`、`docs/reviews/remediation-rmd-task-002-003-rp-02b2a1-verification-2026-07-15.md`，硬预算为 `3 files / additions <= 64 / deletions <= 16 / net additions <= 64`。这三个文件属于 E1 固定 evidence scope，不扩充或改写 G0 的 16-file manifest。
- 三份 evidence 文档必须各自且仅出现一次并保持完全一致的精确九字段：`g0_evidence_parent_sha`、`g0_evidence_rp01a_run`、`g0_evidence_rp01b_run`、`g0_evidence_rp01c_run`、`g0_evidence_governance_run`、`g0_evidence_a2_authorization`、`g0_evidence_issue_closed_count`、`g0_evidence_rmd_task_002`、`g0_evidence_rmd_task_003`。这是完整白名单；任一字段重复，或新增 self/publication SHA、E1 run 及任何其他 `g0_evidence_*` 字段，均必须 fail closed。每个字段值必须非空并与字段名位于同一行，不能跨行借用下一字段或正文。
- `g0_evidence_parent_sha` 必须是 E1 直接父提交的完整 G0 SHA；四个 run id 必须为互不相同的数字，并分别绑定父提交四个指定 workflow 的成功 run；其余状态字段必须精确为 `g0_evidence_a2_authorization=not_authorized`、`g0_evidence_issue_closed_count=9/42`、`g0_evidence_rmd_task_002=partial`、`g0_evidence_rmd_task_003=open`。E1 不得记录自身 SHA、E1 自身 run id、A2 实现或任何真实 DB/provider/media/E6 证据；三份 evidence 正文也不得正向宣称 A2/B2a2 已授权、授权通过或允许开始/进入业务实现。每个正向授权语句必须独立阻断，同句、邻句或其他位置出现 `not_authorized` 都不能掩蔽它。
- `main-control-status.md` 必须原位更新“总体关闭进度”内的当前整改包和当前状态、`RP-02B2a2-G0 整改后最终复核` 行以及唯一编号 1 推荐动作：三处均绑定 accepted code head 与四路远程成功；最终复核行必须为已完成并记录最终 `16 files / <final actual_net_additions> net additions` 与最终实际 package-gate 计数，推荐动作不得继续出现待提交/pending。最终净增量和 gate 计数只在冻结差异并重新运行完整矩阵后由 main 回填，本合同不预判其值。
- `main-control-event-ledger.md` 必须恰好追加一个标题为 `### MCE-RP02B2A2-G0-E1-REMOTE-ACCEPTED` 的事件，包含 `event_type: governance_bootstrap_remote_accepted`、`package_id: RP-02B2a2-G0-E1`、完整 `accepted_code_head`，并明确 `RP-02B2a2-G0` 已关闭而 B2a2 继续 `not_authorized`。
- verification 文档必须恰好新增一个 `### 7.3 G0 accepted code head 与远程关闭证据` 小节，逐项列出完整 accepted code head、最终 `16 files / <net> net additions`、最终实际 package-gate 计数、四个远程 run 及 B2a2 `not_authorized`。
- E1 只追加九字段、保留任一当前状态为 pending/待提交、保留旧 net 或 gate 计数、缺失上述任一原位替换/唯一事件/唯一 7.3，均必须 fail closed。
- G0 evidence workflow 必须在任何 install/test 前以只读权限和 `gh api` 校验四个 run 的 workflow name、repository workflow path、run path（精确 path 或受限 `path@ref`）、workflow id、event、`head_sha`、`status=completed`、`conclusion=success`；任一 run 不存在、身份错配、不同头、未完成或非成功均 fail closed。future A2-A5 authoritative admission evidence 还必须逐字绑定可信 `workflow_sha`、PR number、PR base、authorized predecessor 与 candidate SHA。fake `gh` 验收必须分别覆盖父 run 的 name/repository path/run path/id/event/head/status/conclusion，以及 authoritative admission 的 workflow SHA/PR/base/candidate 错配。
- E1 通过只完成 G0 外部证据闭环，不自动授权 A2。未来 A2 仍须由 MC 显式授权，并从 accepted G0 code head 新建 sibling 实现分支，独立满足下一节 A2 合同；E1 commit 不得成为 A2 baseline，但 authoritative admission 必须通过独立 repository-controlled SHA 验证该 sibling E1 已合法存在。
- 可执行负例至少覆盖：E1 `additions=64`、`deletions=16`、`net=64` 边界通过及任一维度超限；九字段重复或出现额外字段；G0+E1 合批；旧 G0 后追加 incremental G0；`E1 -> A2` 误拓扑；候选把 gate/workflow 改成 `exit 0` 仍不能获得准入；fake `gh` 的父 run name/repository path/精确或受限 `path@ref`/id/event/head/status/conclusion，以及 authoritative admission 的 workflow SHA/PR/base/candidate 失败矩阵。

### RP-02B2a2 Authoritative Claim And Pre-provider Gate

- 硬门禁：`18 files / 1,900 net additions`。
- `docs/adr/rp-02b2a2-authority-claim-budget.md` 当前 `template_not_authorized` 中的 `15 files` 是未授权旧模板值，不构成有效预算声明，也不得由 G0 跨包改写。未来 A2 必须在同一累计实现 diff 中原子改为 `status=ready`、`hard_max_files=18`、`baseline_sha=<verified G0 commit>` 与真实计数；保留 15 时生产 gate 必须失败。
- `packages/shared/src/api.ts`（新增 `UNAUTHORIZED` 与 `DEPENDENCY_UNAVAILABLE` 的公开错误定义）
- `packages/shared/src/novels.ts`
- `apps/api/src/config/env.ts`
- `apps/api/src/modules/novels/domain/executionContract.ts`
- `apps/api/src/modules/novels/domain/novelDomain.ts`
- `apps/api/test/rp02b/rp02b.test.ts`
- `apps/api/src/modules/novels/services/taskClaim.ts`
- `apps/api/src/modules/novels/services/novelService.ts`
- `apps/api/src/modules/novels/routes/novelRoutes.ts`
- `apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts`
- `apps/api/src/modules/novels/repositories/prismaNovelRepository.ts`
- `apps/api/src/app.ts`
- `apps/api/src/main.ts`
- `apps/api/test/rp02b2a/fixtures.ts`
- `apps/api/test/rp02b2a/authority-claim.test.ts`
- `apps/api/test/rp02b2a/repository-authority-hardening.test.ts`
- `apps/api/src/modules/novels/novelRoutes.test.ts`
- `docs/adr/rp-02b2a2-authority-claim-budget.md`
- `package.json`
- E3：真实 `NovelService -> taskClaim -> registry -> repository authority loader` 使用 `buildApp` 注入的 authenticated `RequestContextResolver`、ManualClock/MutableAuthorityStore 和 deterministic barrier，证明同租户不同 user、双租户、resolver 缺失/失败、伪造身份无效、task/envelope actor 一致、default context 不生成 B2 envelope；生产 `main.ts` 只接受服务端校验 actor 配置，缺失时 fail closed。按 T0 首次 claim、T1 replay 逐字节证明持久化 `requestedAt`/canonical envelope/requestHash 不漂移；对 15 action 的 claim 前及 claim 后/provider 前 authority `missing|changed` 全矩阵逐项断言八类增量为 0；legacy 初始 task=1、八类增量=0。A2 `env-probe/core/composite` 必须等于第 11 节精确命令并通过空壳、环境泄漏和前序失败继续执行的负例。15 action 同步 HTTP 继续 `200` 且非 queued/202；本包不新增 capability、lease、checkpoint、finalize、202、真实 DB/provider/media 或 E6。

### RP-02B2a3 Lease Phase CAS And Existing Retry Child Fence

- 硬门禁：`14 files / 1,800 net additions`。
- `packages/shared/src/api.ts`
- `packages/shared/src/novels.ts`
- `apps/api/src/modules/novels/domain/executionContract.ts`
- `apps/api/src/modules/novels/domain/novelDomain.ts`
- `apps/api/src/modules/novels/services/actionExecutionPlan.ts`
- `apps/api/src/modules/novels/services/taskClaim.ts`
- `apps/api/src/modules/tasks/services/taskService.ts`
- `apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts`
- `apps/api/src/modules/novels/repositories/prismaNovelRepository.ts`
- `apps/api/src/modules/novels/novelRoutes.test.ts`
- `apps/api/test/rp02b2a/fixtures.ts`
- `apps/api/test/rp02b2a/lease-dispatch-retry.test.ts`
- `docs/adr/rp-02b2a3-lease-retry-budget.md`
- `package.json`
- E3：lease 后 attempt 为 null；只有 `prepared -> provider_call_started` CAS 原子生成 attempt/dispatchedAt；错相、过期、cancel、错误 owner与历史 retry child 均受控终态；持续回归 A1 的固定 409/DTO/redaction 与八类副作用精确计数。
- 安全中间态：本包不得为正常 leased action 调用 provider。只有 B2a4/B2a5 对应 finalize 能力完成后，才允许在 deterministic harness 中启用相应 action。

### RP-02B2a4 InMemory Action-specific Fenced Finalize

- 硬门禁：`12 files / 1,900 net additions`。
- `packages/shared/src/novels.ts`
- `apps/api/src/modules/novels/domain/executionContract.ts`
- `apps/api/src/modules/novels/domain/novelDomain.ts`
- `apps/api/src/modules/novels/services/actionExecutionPlan.ts`
- `apps/api/src/modules/novels/services/taskClaim.ts`
- `apps/api/src/modules/novels/services/novelService.ts`
- `apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts`
- `apps/api/test/rp02b2a/fixtures.ts`
- `apps/api/test/rp02b2a/inmemory-fenced-finalize.test.ts`
- `apps/api/src/modules/novels/novelRoutes.test.ts`
- `docs/adr/rp-02b2a4-inmemory-finalize-budget.md`
- `package.json`
- E3：repository-owned capability 只为 InMemory 15 action 放行；Prisma 保持 disabled。15 action 分别覆盖成功、provider 后 authority mutation、重复 finalize/fail、cancel/late result；资产、receipt、task、terminal event、operation log 五个故障点整体回滚；八类副作用逐项精确计数。leased candidate/result 仅 harness 可观察，公开同步 HTTP 继续 200 且非 queued/202。只证明 deterministic/InMemory，不得外推 Prisma 或真实 DB。

### RP-02B2a5 Prisma Nine/Six Fenced Finalize And Closure

- 硬门禁：`10 files / 1,900 net additions`。
- `apps/api/src/modules/novels/domain/executionContract.ts`
- `apps/api/src/modules/novels/domain/novelDomain.ts`
- `apps/api/src/modules/novels/services/actionExecutionPlan.ts`
- `apps/api/src/modules/novels/services/taskClaim.ts`
- `apps/api/src/modules/novels/repositories/prismaNovelRepository.ts`
- `apps/api/src/modules/novels/novelRoutes.test.ts`
- `apps/api/test/rp02b2a/fixtures.ts`
- `apps/api/test/rp02b2a/prisma-fenced-finalize.test.ts`
- `docs/adr/rp-02b2a5-prisma-nine-six-budget.md`
- `package.json`
- E3：repository-owned capability 为 Prisma 9 action 放行、6 action 返回 unsupported；可注入 deterministic Prisma transaction/CAS fixture 证明 9 action 的 authority lock/CAS、资产/receipt/task/event/oplog 原子写，以及 6 unsupported 新 claim 在 preclaim/provider 前 `task/provider/asset=0`、历史 leased task 原子失败且 `provider/asset/receipt/current=0`；最终复合命令按 B1 -> B2a0 -> B2a1 -> B2a2 -> B2a3 -> B2a4 -> B2a5 fail-fast。
- 只有本包经独立 TEST/QUALITY P0/P1=0、commit/push、远程 clean checkout 后，MC 才能判断原 B2a 阶段完成。真实 MySQL 行锁/事务时钟/P2002、多进程 fencing、真实 provider 和 E6 继续为 `not_proven`。

每包的测试必须与对应生产能力同包交付，禁止把断言集中到最后补齐。每包只能从前一包已独立验收并提交的 clean commit 开始，禁止跨包累计 dirty diff。A2-A5 当前全部 `not_authorized`；A1 的既有关闭状态不因本次 G0 合同修订被重写。

### B2a1-B2a5 通用 package gate

- A1 同包新增 `scripts/rp02b2a-package-gate.mjs`；G0 独立承载 A2-A5 准入前的可信 gate、authoritative workflow 与 mutation tests。A2-A5 只能复用 accepted G0 在默认分支上的同一可信脚本与 `.github/workflows/rp02b2a-admission.yml`，不得复制、修改、降级或让候选版本替代判断。可信 gate 必须证明最终 G0 是固定 `6eaf60af4155a8b95ff77d53261f5896d3a8f77d` 的唯一原子直接子提交，并拒绝 incremental G0 与 G0+E1 合批；E1 仅位于 sibling evidence 分支，不能进入 A2 累计 range。gate 不得从 ADR、分支或提交文本推断 accepted predecessor 或授权包。
- A2-A5 外部准入元组固定为 `RP02B2A_AUTHORIZED_PACKAGE_ID` + `RP02B2A_AUTHORIZED_PREDECESSOR_SHA`，并固定绑定 `RP02B2A_G0_EVIDENCE_SHA`；严格顺序为 `A2<-G0`、`A3<-A2`、`A4<-A3`、`A5<-A4`。只有 MC 在前一包独立验收、提交推送、远程 clean-checkout 与关闭证据齐备后才能更新 package/predecessor；缺失、空值、`NOT_AUTHORIZED`、短/零/不可达/非祖先/E1/陈旧 predecessor、缺失/伪造/错误父 G0-E1 或 package 不匹配全部在 candidate install/test 前 fail closed。
- authoritative PR 使用默认分支 `pull_request_target` workflow 的 `github.event.pull_request.base.ref/base.sha` 与 `github.event.pull_request.head.sha`，先确认 `base.ref` 等于 repository API 返回的默认分支并绑定 `github.ref`，再在产出 artifact 前复查 live PR 的 `base.ref/base.sha/head.sha`，同时始终检查 `<authorized predecessor>..candidate` 累计区间。`push` 只做 post-merge CI；`workflow_dispatch` 只做显式 base/head 的 replay/audit，二者都不能输出 authoritative admission。零 SHA、缺 SHA、无法解析、相同 SHA、创建/删除 ref、非祖先、无参或 `HEAD~1...HEAD` fallback 全部 fail closed。
- 同一 authorized predecessor/candidate 以 NUL-safe 路径发现唯一 changed `rp-02b2aN-*` 业务 ADR，且其 package id 必须等于外部授权 package id；旧 superseded ADR、多 ADR、缺 ADR、predecessor/successor ADR、packageId 不匹配、status 非 ready、`baseline_sha` 不等于外部 predecessor、实际计数不符、manifest 外路径或缺少 required 类别全部失败。候选不得以 A3-A5 ADR 包装 A2 重叠生产改动绕过 A2 授权。
- G0 与五个业务 ADR 都使用机器字段 `package_id/manifest_id/baseline_sha/hard_max_files/hard_max_net_additions/actual_files/actual_net_additions`。通用 20/2000 预算通过不能覆盖包级硬预算；例如 A2 出现第 19 个文件必须失败。
- `.github/workflows/rp02b2a-admission.yml` 固定在默认分支上执行，并拒绝目标分支不是 repository default branch 的 PR；所有 action pin 完整 commit SHA，workflow/job 只读权限、hosted runner、零 secret、禁 cache、候选 checkout `persist-credentials: false`。可信 gate 通过前只允许 fetch candidate Git object，不得 checkout 或执行候选代码。workflow contract 必须拒绝 manual input、候选 env、ADR/commit 文本、硬编码值、变量调换或 retired `RP02B2A2_AUTHORIZED_G0_SHA` 作为授权来源。
- authoritative evidence 必须绑定 workflow path/id、`event=pull_request_target`、`github.workflow_sha`、PR number、PR base SHA、authorized predecessor SHA、accepted G0-E1 SHA/digest、candidate SHA、gate source SHA、package id、candidate-bound manifest digest 和固定 test command，并以耐久 JSON artifact 发布。required check 同名、push/manual 成功或候选 workflow 成功都不能替代这些身份字段。
- `workflow_dispatch.inputs.base_sha/head_sha` 在 audit workflow 中必须都为 required；普通 PR/push `paths` 必须覆盖 `scripts/rp02b2a-package-gate.*`、两个 workflow、五个 `docs/adr/rp-02b2a1-*` 至 `rp-02b2a5-*`、`apps/api/test/rp02b2a/**` 以及所有 manifest 生产路径，ADR-only、gate-only、test-only diff 不得跳过普通 CI，但普通 CI 成功不产生准入。
- workflow 在可信 gate 通过后才清空 DB/provider/secret 环境、checkout 精确 candidate SHA、执行由外部 package id 选择的固定复合测试命令。`scripts/rp02b2a-package-gate.test.mjs` 必须读取两个 production workflow，证明默认分支 gate source、PR base/candidate、外部授权元组与固定复合命令全部进入同一可信判断；还必须执行 ADR-only、gate-only、test-only、候选 gate/workflow `exit 0`、零/错误 predecessor、跨包 package/ADR 全排列、incremental push 隐藏早期改动、错误 package-command、伪造旧 ADR ready、错误计数、额外路径、缺 required path、job/step `if` 或 `continue-on-error`、额外 job/step、trigger/filter 漂移、G0+A2 同区间以及 A2 history 触碰 evidence 文件等反例。准入失败时 install/test/candidate marker 必须全为 0；禁止 generic budget、无参 fallback、正则或复制 helper 冒充。

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

每个可派发子包各自独立满足：需求复核 P0/P1=0、实现、自测、独立 TEST/QUALITY、commit/push、远程 clean-checkout CI。任一包不得借用另一个包的未提交改动作为验收前提。

## 15. 开工门禁

截至 2026-07-13 19:45:10 CST，以下四项门禁均已满足，MC 仅授权 `RP-02B2a0` 开工：

1. 后端架构、产品交互、TEST、QUALITY 对本文复核为 approved，P0/P1=0。
2. parent package、remediation program、acceptance matrix、issue ledger 和主控事件同步。
3. 需求资产 commit/push，远程治理 CI 成功。
4. MC 只授权 `RP-02B2a0`；B2a/B2b/B2c/B3、真实 DB/provider/media 继续冻结。

本节不授权任何后续包。B2a0 研发必须遵守第 2.1、11、14 节的范围、验收命令和 `8 files / 700 net additions` 硬预算；交付后仍须独立 TEST/QUALITY 验收和主控关闭证据，才能决定下一道门禁。

## 16. RP-02B2a0 阶段完成门禁

截至 2026-07-13 22:24 CST，`RP-02B2a0` 已满足独立子包完成条件：

1. 实现提交 `2da6d31` 严格为授权 8 文件，净新增 319 行。
2. `test:rp02b2a0` 为 API 50/50、Admin service 17/17、Vue DOM 6/6；typecheck、diff check 和 8/700 预算通过。
3. TEST 与 QUALITY 最终均 `approved`，P0/P1/P2 = 0；四类 canary、High/Blocking、普通日志与浏览器持久化证据闭合。
4. GitHub runs `29256298426`、`29256298444`、`29256298360`、`29256298392` 全部成功；远程干净检出 `2da6d31` 后专属测试再次通过。
5. 阶段证据为 `docs/reviews/remediation-rmd-task-002-rp-02b2a0-verification-2026-07-13.md`。

`RMD-TASK-002` 继续为 `partial`，总体关闭数保持 9/42。本文不自动授权 B2a1-B2a5/B2b/B2c/B3 或真实 DB/provider/media；下一包必须由 MC 重新核对依赖、预算和授权边界后单独裁决。

## 17. RP-02B2a 原单包失效与拆包门禁

截至 2026-07-14 05:29 CST，原 B2a 研发交付在正式生产链复核中被拒绝。TEST 曾给出通过，但 QUALITY 的代码路径证据证明 registry、authority reload、phase CAS、事务 finalize 与测试 oracle 没有进入真实生产链；MC 采用更强证据并拒绝提交。

后续三路独立拆包复审均拒绝继续原单包：产品 `P0=2/P1=4`、TEST `P0=2/P1=5`、QUALITY `P0=2/P1=3`。共同结论是原目标必须保留，但实施改为 B2a1-B2a5；旧授权和旧 ADR 不得复用。第四个后端架构席位本轮未在主控 SLA 内返回有效报告，不计作通过，也不影响继续形成未授权拆包草案。

五包草案首轮四角色正式资产复核全部 rejected；六类唯一 P1 修订后，第二轮产品 approved，后端、TEST、QUALITY rejected，四类唯一 P1 也已修订。第三轮后端、TEST、QUALITY approved，产品以 `P0=0/P1=1/P2=1` 拒绝当前轮次与授权状态指针不一致。第三轮修订后的第四轮由产品、TEST、QUALITY approved，后端以 `P0=0/P1=1/P2=1` 拒绝两处仍停在旧轮次的当前动作。第五轮四角色均以 `P0=0/P1=1` 拒绝主状态“当前唯一推荐动作”仍使用整改进行态；该唯一 P1 修订后，第六轮后端、产品、TEST、QUALITY 全部 approved 且 P0/P1=0。

当前门禁：

1. 原 13-path partial diff 保留在原工作树，禁止 stage/commit/push；治理资产在 `c673eaf` 的 clean worktree 单独修订。
2. B2a1 已完成限定 E3 实现、独立验收、同 SHA 四路远程 CI 和兼容测试跟进；B2a2-B2a5 仍均为 `not_authorized`，不得联动授权后续包。
3. 任一包实现后都必须独立 DEV 自测、TEST、QUALITY、commit/push、远程 CI 与 clean checkout；不得把未提交代码带入下一包。
4. 总账仍为 9/42，`RMD-TASK-002=partial`、`RMD-TASK-003=open`。B2b/B2c/B3、202/Admin transport、真实 DB/provider/media/E6 继续冻结。

## 18. RP-02B2a1 阶段完成门禁

截至 2026-07-15 17:43 CST，`RP-02B2a1` 已满足本实现包要求的独立阶段证据：

1. 初始实现 `eee5568`、兼容修复 `ec8278e` 和结构测试 `0a583c8` 虽曾获得远端绿灯，但最终独立 QUALITY 发现 package resolver 累计范围和 RP02A AST 仍各有一个 P1，因此 `0a583c8` 明确标记为 `rejected/superseded`，不得作为 accepted head。
2. 后续门禁修复链为 `072b9be -> f342297 -> 4817abc`；accepted code head 和远端分支头均为 `4817abc67cf916772b317aff027403b97ab4df76`，code tree 为 `ad3d36cb128989080289b5842a115d3d92776314`。
3. 最终独立 TEST、QUALITY 和临时 clean checkout 均为 `APPROVED`：复合链 192/192、RP-01C 13/13、API 119/119、根 RP02A 11/11；14/14 AST 负向变异被拒绝，QUALITY P1/P2=0/0。
4. typecheck、build、Prisma generate/validate、diff check 全部通过；全程 mock-only，未连接真实 DB/provider/media。
5. 固定基线 `501a3cf..4817abc` 的单一累计 package gate 通过：18 files / 1,898 net additions；不再使用拆分门禁或 test-only 回退包解释。workflow contract 通过，`required_files=35`。
6. 阶段证据为 `docs/reviews/remediation-rmd-task-002-003-rp-02b2a1-verification-2026-07-15.md`。
7. accepted head `4817abc` 的治理 `29405557756`、RP-01A `29405557734`、RP-01B `29405557763`、RP-01C `29405557764` 均为 `completed/success`。

本节只确认 15-action registry、strict provider ABI、同步调用点和公开 retry freeze 的 RP-02B2a1 E3 阶段。`RMD-TASK-002` 继续为 `partial`，`RMD-TASK-003` 继续为 `open`，总体关闭数保持 9/42；本节不自动授权 RP-02B2a2-B2a5/B2b/B2c/B3，不证明真实 DB/provider/media 或 E6。
