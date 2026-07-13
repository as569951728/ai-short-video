# RMD-TASK-001 / RP-02A 阶段验收记录

## 1. 基本信息

| 字段 | 内容 |
| --- | --- |
| issue_id | RMD-TASK-001 |
| package_id | RP-02A |
| issue_class | PB |
| severity | P0 |
| owner | MC + DEV + TEST + QUALITY |
| dev_thread | 主控直接整合，预审 TEST `019f586d-cd56-7a50-a8e0-ba211997d37f`、QUALITY `019f586d-2f3d-7e13-a0db-c62530f673ef` |
| final_test_thread | `019f58b1-6973-74c0-8212-6b9cf6cc6c3f` |
| final_quality_thread | `019f58b2-0775-7472-b3be-9d619b137d46` |
| acceptance_ids | TASK-PRECLAIM-01、TASK-CONCURRENCY-01 的 RP-02A E3 阶段 |
| environment | Node 24；mock provider；in-memory/deterministic repository；GitHub Actions clean checkout |
| target_evidence_level | E3 |
| actual_evidence_level | E3 |

## 2. 原始问题与阶段目标

- 原始问题：小说 AI 动作没有统一持久任务 SSOT；部分动作在 provider 返回后才建任务，重复点击可能造成重复模型调用、多个候选和状态漂移。
- RP-02A 目标：在当前请求内执行 provider 的架构下，先原子 claim 正式 `processing` task，再调用 provider；统一幂等、活跃冲突、租户隔离、终态重放、取消和迟到结果保护。
- 阶段边界：不实现 worker、heartbeat、restart/recovery、快速返回 taskId，也不以单进程证据证明真实 MySQL 或多实例原子性。
- 原状态：`partial`。

## 3. 实现与返工

- 正式任务字段：`idempotencyToken`、`requestHash`、`activeClaimKey`，并增加 tenant-scoped 唯一合同。
- 15 个 provider action 统一进入 `executeClaimedGeneration`；claim 发生在 provider 前。
- 同 token/同指纹复用原 task；同 token/异指纹返回 `IDEMPOTENCY_CONFLICT`；同域不同 token 活跃冲突返回 `CONFLICT_TASK_EXISTS`。
- provider/save 失败固定到原 task；取消释放 active claim；迟到 finalize/fail 不覆盖非 processing 终态。
- rewrite、impact、adopt、trial、full-review、body batch 补终态重放和显式 null/异指纹回归。
- 独立验收首轮发现并关闭 3 个 P1：真实模型路由未进入指纹、方向阶段推进后终态重放被门禁拦截、migration 部分 DDL 提交后不可重跑。
- migration 改为 preflight 后通过 `information_schema + PREPARE` 条件执行列与索引 DDL；先创建新唯一索引，再条件删除旧索引。
- 安全边界：token/hash 不进入 DTO、普通日志或错误详情；模型路由只以安全版本参与 hash，不保存 API Key。

## 4. 研发与 CI 证据

| 证据桶 | 命令/证据 | 结果 | not_proven |
| --- | --- | --- | --- |
| contract | `npm run test:rp02a` | 11/11 | 真实 MySQL DDL 执行 |
| unit/API | `npm test -w @ai-shortvideo/api` | 110/110 | 真实 provider |
| fixture | `npm run test:rp01c` | 13/13 | worker/restart |
| E2E guards | `npm run test:e2e:rp01a` | 13/13 | RP-02A 浏览器全链 |
| governance | `npm run test:governance` | 15/15 | N/A |
| typecheck | `npm run typecheck` | passed | N/A |
| build | `npm run build -w @ai-shortvideo/api` | passed | N/A |
| Prisma contract | `npm run prisma:validate -w @ai-shortvideo/api` | passed | migration apply/live concurrency |
| diff/budget | `git diff --check`；返修 6 files / 158 net additions | passed | N/A |
| clean-checkout CI | runs `29214449969`、`29214450023`、`29214450008` | completed/success | Node action deprecation warning only |

实现提交：

- `b2b374a feat(api): add RP-02A task preclaim`
- `76dabd8 fix(api): close RP-02A replay gaps`

## 5. 独立验收

### TEST

- 首轮结论：`needs_revision`，P1 1；发现模型路由常量未绑定实际 general/structure/reasoner 配置。
- 返工后结论：`approved`，P0/P1/P2 = 0。
- 复核证据：路由变化同 token 返回幂等冲突，provider 不二次调用；RP-02A 11/11、API 110/110 及完整回归通过。

### QUALITY

- 首轮结论：`needs_revision`，P1 2；发现方向终态 replay 被 mutable stage gate 拦截、migration 不可重入。
- 返工后结论：`approved`，P0/P1/P2 = 0。
- 复核证据：采用后终态 replay API 通过；条件 DDL 静态设计支持部分提交后重跑；模型路由版本进入 request hash。

## 6. 阶段裁决

```text
issue_id: RMD-TASK-001
package_id: RP-02A
package_status: completed
final_status: partial
approved_acceptance_scope: TASK-PRECLAIM-01 and TASK-CONCURRENCY-01 at E3
issue_closed_count: 9/42 unchanged
not_proven: real MySQL migration and interruption recovery; P2002 live race; multi-process concurrency; worker; heartbeat; restart/recovery; real retry; real provider; browser/media
next_package: RP-02B
reopen_conditions: provider-backed action bypasses preclaim; same token calls provider twice; terminal replay is blocked by mutable stage; token/hash leaks; late result overwrites terminal state
decided_by: MC
decided_at: 2026-07-13 08:03 CST
```

RP-02A 阶段通过不等于 RMD-TASK-001 关闭。该问题必须在 RP-02B 完成 worker/restart/retry，并由 RP-01D 或后续安全真实库门禁补齐 E6 后重新裁决。
