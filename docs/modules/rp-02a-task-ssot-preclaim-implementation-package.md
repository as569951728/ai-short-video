# RP-02A 小说 AI Task SSOT 与原子 Preclaim 实现包

状态：approved_for_implementation

问题：`RMD-TASK-001`

验收：`TASK-PRECLAIM-01`、`TASK-CONCURRENCY-01` 的 RP-02A E3 阶段

依赖：`RP-01C` 已关闭；`RP-01D` 未授权

## 1. 主控裁决

RP-02A 只解决小说 AI 动作在单进程、deterministic repository 下的统一 Task SSOT 和 provider 前 preclaim。它不实现 worker，也不证明真实 MySQL 原子性。

- RP-02A 新任务状态使用 `processing`，provider 仍由当前请求执行。
- RP-02B 才引入首请求快速返回、`queued→processing`、worker、heartbeat、restart 和真实 retry。
- RP-01D 授权后才执行真实 MySQL/migration/多进程并发证明。
- 本包完成后 `RMD-TASK-001` 仍保持 `partial` 或 `implemented_pending_verification`，不得关闭。

## 2. 用户目标

1. 任一小说 AI provider 调用前，系统已经存在唯一、可查询的 processing task。
2. 同租户、同任务类型、同幂等键、同请求指纹只复用原 task，不重复调用 provider。
3. 同幂等键但指纹不同返回可解释冲突；不同幂等键但命中同一活动冲突域也被阻断。
4. provider 或保存失败更新同一 task 为 failed，不在 provider 后补造第二条 task。
5. 租户、请求摘要和日志边界不因统一 task 而退化。

## 3. 必须覆盖的动作

所有现存小说 provider-backed 写动作均进入统一 claim 路径：

- 方向：生成、融合、优化。
- 结构：设定、全书大纲、阶段大纲、章节目录。
- 试写：首章候选、后续章节。
- 正文：正文批次、单章生成、章节重写。
- 影响：显式影响评估、正文采用后的影响评估。
- 审稿：全书审稿。

不能只修方向、结构或正文样板。任何 provider-first 遗留都使本包验收失败。

## 4. 统一合同

### 4.1 Claim API

仓储新增唯一生产入口 `claimGenerationTask(input)`，原子返回：

- `created`：创建 processing task 和首事件，调用方可以执行 provider。
- `reused`：返回已有 task；调用方不得再次执行 provider、写事件或创建候选。
- `idempotency_conflict`：同幂等身份、不同指纹，转换为 `409 IDEMPOTENCY_CONFLICT`。
- `active_conflict`：不同幂等键命中同一活动冲突域，转换为 `409 CONFLICT_TASK_EXISTS`。

禁止继续使用 `findActiveTaskByConflict()` 后再 create 的 check-then-create 流程。

### 4.2 幂等身份与指纹

- 幂等身份：`tenantId + taskType + idempotencyToken`。
- 规范入口：HTTP `Idempotency-Key`，8-120 字符。
- 已有 body `idempotencyKey` 暂作兼容别名；两处同时存在时必须相同，否则 `400 VALIDATION_ERROR`。
- 无 key 的旧调用可临时使用 requestId 映射为非重放 token，保证兼容；该路径不能计入幂等验收。
- `requestHash`：服务端 canonical JSON 后 SHA-256。
- 指纹包含任务类型、novel/object、规范化有效参数、`sourceVersionRefs`、策略和模型路由版本。
- 指纹排除幂等键、requestId、时间、IP/UA、凭证、完整 prompt、provider payload/raw response 和完整正文。

### 4.3 状态与事务

- RP-02A 状态：`none → processing → waiting_confirmation/completed/failed`。
- `activeClaimKey` 仅在 `queued/processing` 持有；进入 `waiting_confirmation` 或 terminal 状态即释放活动冲突占位。
- 同一幂等键与同一请求指纹仍复用原任务；不同幂等键可在已有候选等待确认时创建新的候选任务。
- claim 事务只包含 task、首事件、幂等与冲突裁决；provider 不得位于事务内。
- finalize 使用同一 `taskId` 原子写 task、事件、候选/报告和 `sourceTaskId`。
- provider 异常写 `provider_error`；provider 成功后保存异常写 `save_failed`；均不得永久 processing。

### 4.4 租户和安全

- 所有 claim、reuse、conflict、find、finalize、event 查询以可信 `RequestContext.tenantId` 为第一条件。
- 不新增客户端可伪造的 `X-Tenant-Id`。
- 不同租户允许使用相同 token、scope 和 key，且互不可见、互不冲突。
- API 冲突详情最多返回 existing taskId、taskType、status；不得返回 token、hash 或内部 payload。
- 普通日志、task metadata 和响应不得记录密钥、完整 prompt、完整 provider response 或完整正文。

## 5. Prisma 与兼容边界

- `GenerationTaskRecord`、mapper 和仓储正式读写 `idempotencyToken`、`requestHash` 及活动 claim 标识，但公共 DTO 不暴露内部 token/hash。
- schema/migration 的目标唯一口径是 `(tenantId, taskType, idempotencyToken)` 和 `(tenantId, activeClaimKey)`。
- `activeClaimKey` 仅在活动状态存在，使用稳定的 conflict scope/key 摘要。
- migration 必须检测已有重复活动任务；发现重复直接拒绝，不得静默任选一个保留。
- 本包只生成 schema、增量 migration 和静态合同测试，不执行真实 migration。
- Prisma 正文、重写、影响和全书审稿未实现路径继续在 provider 前安全阻断；不得借 RP-02A 补 RP-03 业务写链。
- 正文旧 metadata 幂等字段允许双读兼容，新写必须使用正式 task 字段。

## 6. 自动验收

### PRE

- deferred provider 尚未 release 时，GET task 已能看到唯一 processing task 和首事件。
- claim 或首事件失败时，provider call count 为 0，且无半条 task。
- provider timeout 和 provider 后保存失败均更新同一 task 为 failed。
- 对第 3 节全部动作做表驱动顺序断言：gate/capability → claim → provider → finalize。

### CONC

- 首请求进入 deferred provider 后，并行发送其余 9 个同 tenant/token/hash 请求；release 前副请求复用同一 taskId，最终 providerCalls=1、task=1、候选集合=1。
- 同 token 改有效参数或 source refs：`IDEMPOTENCY_CONFLICT`，provider/task/candidate 数量不变。
- 不同 token 命中相同活动 conflict：`CONFLICT_TASK_EXISTS`。
- 任务完成或失败后，同 token 重放只返回原 task，不隐式重试。
- 两个 tenant 使用相同 token/conflict key，各自创建一条 task，互不可读。
- 并发测试使用 latch/barrier，不使用固定 sleep；关键组至少连续重放 20 次。

### 回归命令

- 新增安全隔离的 `npm run test:rp02a`，完整命令链清除 `DATABASE_URL` 和 DeepSeek/provider 变量，固定 mock provider。
- `npm run test:rp01c`
- `npm test -w @ai-shortvideo/api`
- `npm run test:e2e:rp01a`
- `npm run test:governance`
- `npm run typecheck`
- `npm run build -w @ai-shortvideo/api`
- `npm run prisma:validate -w @ai-shortvideo/api`
- `npm run governance:git-budget -- --worktree`
- `git diff --check`

## 7. 明确不做

- 不做 worker、队列消费者、heartbeat、restart recovery、真实 retry。
- 不做 cancel、迟到结果、旧版本回写和前端任务表面统一投影。
- 不改任务抽屉、主卡片或最近任务交互；只允许最小幂等键传输适配。
- 不合并视频 Task/VideoActionReceipt，不进入 RP-08E。
- 不改 provider prompt、内容质量、真实 DeepSeek、MySQL、TTS、媒体或发布。
- 不做巨型文件拆分。

## 8. 预算与交付

- 实现与测试硬上限：15 个文件、1,700 净新增行。
- 关闭资产预留：5 个文件、300 净新增行。
- 整包仍受 20 文件/2,000 净新增行门禁；超限必须拆包，不接受为赶进度写 ADR 扩容。
- 必须独立提交、推送、远程 clean-checkout CI、TEST/QUALITY 验收和关闭证据。

## 9. Not Proven

RP-02A 完成后仍明确未证明：

- 首请求快速返回和 `queued→processing`。
- worker、heartbeat、restart、真实 retry/cancel。
- 真实 MySQL migration、唯一约束、行锁、隔离级别、跨进程并发和事务回滚。
- Prisma 小说后半写链、真实租户认证、真实 provider、浏览器完整体验、视频和媒体链路。
