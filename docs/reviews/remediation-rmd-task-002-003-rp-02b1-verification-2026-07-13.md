# RMD-TASK-002/003 / RP-02B1 阶段验收记录

## 1. 基本信息

| 字段 | 内容 |
| --- | --- |
| issue_id | RMD-TASK-002、RMD-TASK-003 |
| package_id | RP-02B1 |
| issue_class | PB、RB |
| severity | P0、P1 |
| owner | MC + DEV + TEST + QUALITY |
| dev_thread | 主控整合；工程质量观察源 `019edb3a-a972-75e2-bbb1-774b5ddb6d88` |
| test_thread | `019f590c-d6df-7a02-b030-3518c9b1286c` |
| quality_thread | `019f593d-a918-7fc1-b067-3e95172177f7` |
| acceptance_ids | TASK-PRECLAIM-01、TASK-WORKER-01、TASK-RESTART-01、TASK-RETRY-01 的 RP-02B1 E3 合同字段阶段；TASK-CONCURRENCY-01 的 lease/CAS E3 补充 |
| environment | Node 24；mock provider；in-memory/deterministic repository；Prisma static contract；GitHub Actions clean checkout |
| target_evidence_level | E3 |
| actual_evidence_level | E3 |

## 2. 阶段目标与边界

- 建立可持久化的 15-action `ExecutionEnvelopeV1` 运行时合同；claim 只接受调用方显式传入的 source IDs，不得从 request/objectId/novel 合成引用。worker 按 ID 重载权威资产及 stale 双门禁留在 B2。
- 建立 lease owner/token/expiry、heartbeat、fencing、provider attempt checkpoint、安全回执、observed lease CAS recovery 与预算字段的仓储原语。
- legacy queued task 缺 envelope 时只允许一次安全失败，不能领取、补造 envelope 或调用 provider。
- RP-02B1 不实现 dispatcher、HTTP `202 + queued`、独立 worker 进程、真实 retry child、前端 transport、真实 MySQL、多进程竞争或真实 provider/media。

## 3. 实现与质量返工

- 严格 envelope parser 迁入 `@ai-shortvideo/shared`，API/后续 worker 共用同一运行时合同；unknown field、越界字段、敏感 key/value 和超过 32 KiB payload 全部拒绝。
- `effectiveRequest` 与 `sourceVersionRefs` 逐 action 做跨字段一致性校验；除首次方向生成允许显式空当前版本外，其余 14 action 缺 refs 均在 task/provider/finalize 前 `GATE_BLOCKED`。
- 去除 `legacy-null-version-ref`、`objectId-a/objectId-b`、request/objectId/novel 回填 source refs 和 full-review `policy_default_v1` 合成；full-review 顶层与 effective policy 必须一致。
- 同 token 的既有请求先完成身份判定，再执行仅属于新任务的 provider/config capability gate，保证异指纹稳定返回 `IDEMPOTENCY_CONFLICT`。
- AWS、GitHub、Google、Slack、JWT、PEM 等 synthetic canary 在 envelope 与 safe receipt 入口拒绝；部分易触发 push protection 的 token family 使用运行时拼接，仓库不包含真实凭据。
- safe receipt 在仓储事务前验证 canonical hash；伪造 hash 在 in-memory/Prisma 均 fenced。完整 `resultVersionIds` 写入 JSON 列并兼容 legacy 单值列；单个版本 ID 限制为 32 字符。
- migration 使用 `information_schema + PREPARE` 条件 DDL，增加 lease/envelope/attempt/receipt/budget/result JSON 字段、tenant+attempt 唯一约束和 lease scan 索引。
- 独立 QUALITY 首轮发现 source ref 回填 P1 后拒绝；返工增加 14-action 负例矩阵并移除全部回填。独立 TEST 发现 receipt ID/legacy 列宽 P2 后收紧边界；最终两路均 P0/P1/P2 = 0。

## 4. 研发与 CI 证据

| 证据桶 | 命令/证据 | 结果 | not_proven |
| --- | --- | --- | --- |
| contract | `npm run test:rp02b1` | 13/13 | 真实 worker 进程 |
| RP-02A regression | `npm run test:rp02a` | 11/11 | 真实 MySQL claim race |
| unit/API | `npm test -w @ai-shortvideo/api` | 110/110 | 真实 provider |
| fixture | `npm run test:rp01c` | 13/13 | process kill/restart |
| E2E guards | `npm run test:e2e:rp01a` | 13/13 | RP-02B2 HTTP/前端链 |
| governance | `npm run test:governance` | 15/15 | N/A |
| typecheck/build | `npm run typecheck`；`npm run build -w @ai-shortvideo/api` | passed | N/A |
| Prisma contract | `npm run prisma:validate -w @ai-shortvideo/api` | passed | migration apply/live transaction |
| diff/budget | `git diff --check`；12 files / 1,397 net additions | passed | N/A |
| clean checkout | detached `415d03a` + `npm ci --ignore-scripts` + `npm run test:rp02b1` | 13/13 | npm audit 3 个既有 moderate 项未在本包处置 |
| remote CI | runs `29220634159`、`29220634162`、`29220634178`、`29220634187` | completed/success | E6 |

实现提交：`415d03a feat(api): add RP-02B1 recoverable task contracts`。

## 5. 独立验收

### TEST

- 最终结论：`APPROVED`，P0/P1/P2 = 0。
- 14 action 缺 refs 全部零副作用；15 action envelope、幂等优先级、policy/source mismatch、credential canary、lease/fence/recovery、安全回执和多结果持久化均通过。
- receipt ID 32/33 字符边界独立复核通过。

### QUALITY

- 首轮结论：`REJECTED`，P1 1、P2 2；发现 `direction_optimize` 仍可能用 `objectId` 合成 source ref，且负例矩阵与凭据 canary 不完整。
- 返工后结论：`APPROVED`，P0/P1/P2 = 0。
- 独立探针确认 `object-id-placeholder` 为 `GATE_BLOCKED` 且 task/provider/finalize = 0/0/0；14 action、六类凭据、legacy 安全失败、hash fencing 和 lease CAS 均通过。

## 6. 阶段裁决

```text
issue_ids: RMD-TASK-002, RMD-TASK-003
package_id: RP-02B1
package_status: completed
RMD-TASK-002: partial
RMD-TASK-003: open
issue_closed_count: 9/42 unchanged
approved_scope: shared ExecutionEnvelope; explicit source-ref shape/no-synthesis/cross-field consistency; lease/fencing/recovery repository primitives; retry lineage/budget contract fields; safe receipt; E3 deterministic/static evidence
not_proven: worker authoritative asset reload; provider-before/finalize stale gates; dispatcher; HTTP 202; independent worker; heartbeat loop; retry child consumption; poison/unknown outcome orchestration; real MySQL migration/transaction/P2002/multi-process CAS; process kill/restart; real provider/media
next_package: RP-02B2 remains frozen until separate MC authorization
reopen_conditions: source refs synthesized; missing refs create task/call provider; expired owner writes; forged receipt reaches transaction; legacy task is replayed; attempt uniqueness or recovery CAS is weakened
decided_by: MC
decided_at: 2026-07-13 11:03 CST
```

RP-02B1 通过不等于 worker/retry 问题关闭，也不等于 E6。B2/B3、真实数据库和真实 provider 继续受独立门禁。
