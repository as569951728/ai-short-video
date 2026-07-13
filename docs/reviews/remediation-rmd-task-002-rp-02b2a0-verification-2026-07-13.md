# RMD-TASK-002 / RP-02B2a0 阶段验收记录

## 1. 基本信息

| 字段 | 内容 |
| --- | --- |
| issue_id | RMD-TASK-002 |
| package_id | RP-02B2a0 |
| issue_class | PB |
| severity | P0 |
| owner | MC + DEV + TEST + QUALITY |
| dev_thread | `019ed4ee-441a-7fa2-894d-393c7d4c527b` |
| test_thread | `019ed4ee-b33b-7621-b71c-3aa3d9e7b26e` |
| quality_thread | `019f5988-59da-7323-9a13-38fab6a61e2b` |
| acceptance_ids | TASK-PRECLAIM-01、TASK-WORKER-01 的 RP-02B2a0 风险参数前置子集 |
| environment | Node 24；mock provider；in-memory repository；Vue jsdom；GitHub Actions clean checkout |
| target_evidence_level | E3 |
| actual_evidence_level | E3 |

## 2. 阶段目标与边界

- high/blocking 试写候选的 `confirmRisk/selectionReason` 从 Admin 页面进入 shared DTO、API route 和 NovelService 现有同步路径。
- 缺 `confirmRisk=true`、`selectionReason` trim 后为空或原因包含凭据形态时，必须在 task/provider/资产写入前受控失败。
- API key、Authorization/Bearer、Cookie、token 四类 canary 不得进入错误响应、Fastify/Pino 普通日志、页面文本、localStorage 或 sessionStorage。
- 本包不修改 ExecutionEnvelope、dispatcher、worker、HTTP 202、retry/restart、真实数据库、真实 provider 或媒体链路。

## 3. 实现与质量返工

- shared `GenerateTrialRequest`、route schema、Admin service/UI 增加 `confirmRisk/selectionReason`，route 继续禁止 unknown 字段。
- NovelService 在 `executeClaimedGeneration` 前读取候选风险级别，执行 trim、敏感信息检测和 high/blocking 双条件门禁。
- 首轮 TEST 为 `approved` 但记录 P2：High/Blocking 未分别覆盖缺确认、空原因和 secret canary；研发扩成完整风险等级矩阵，TEST 复验 P0/P1/P2 清零。
- 首轮 QUALITY 发现 P1：只覆盖 Authorization/Bearer，且 `logger:false` 不能证明普通日志零泄漏；研发只修改测试，增加四类 canary、内存 `Writable` 日志 sink 和 DOM 四类零持久化证据。
- 最终 TEST 与 QUALITY 均为 `approved`，P0/P1/P2 = 0。

## 4. 验收与远程证据

| 证据桶 | 命令/证据 | 结果 | not_proven |
| --- | --- | --- | --- |
| API/Admin/DOM | `npm run test:rp02b2a0` | API 50/50；Admin service 17/17；Vue DOM 6/6 | 真实 provider、真实浏览器 E4 |
| contract | shared DTO + route schema + service provider 前门禁 | passed | B2a envelope/receipt/log 持久化 |
| security | 4 canary x High/Blocking；response/log/page/storage 零命中 | passed | 真实生产日志基础设施 |
| zero side effects | task/event/provider/asset/receipt/current/oplog/child 前后精确不变 | passed | 真实 MySQL 事务 |
| typecheck | `npm run typecheck` | passed | N/A |
| diff/budget | `git diff --check`；8 files / 319 net additions | passed | N/A |
| implementation | `2da6d31 fix(novels): enforce RP-02B2a0 trial risk gate` | pushed | N/A |
| remote CI | runs `29256298426`、`29256298444`、`29256298360`、`29256298392` | completed/success | E6 |
| clean checkout | 远程分支 detached `2da6d31`；`npm ci --ignore-scripts`；`npm run test:rp02b2a0` | 50/50 + 17/17 + 6/6 | npm audit 3 个既有 moderate 项未在本包处置 |

## 5. 独立验收

### TEST

- 最终结论：`APPROVED`，P0/P1/P2 = 0。
- High/Blocking 分别覆盖缺确认、trim 空原因和四类 secret canary；每例 provider 调用与全部副作用精确为零。
- 合法原因、普通候选同步路径、重复幂等键和 DOM 持久化回归通过。

### QUALITY

- 首轮结论：`NEEDS_REVISION`，P0/P1/P2 = 0/1/0；阻塞项为凭据形态与普通日志证据不完整。
- 返工后结论：`APPROVED`，P0/P1/P2 = 0。
- 内存 `Writable` 真实注入 Fastify/Pino logger；四类 canary 在 response、累计日志、页面与两种 storage 中均零命中。

## 6. 阶段裁决

```text
issue_id: RMD-TASK-002
package_id: RP-02B2a0
package_status: completed
RMD-TASK-002: partial
issue_closed_count: 9/42 unchanged
approved_scope: high/blocking trial confirmRisk/selectionReason Admin-to-service synchronous propagation; provider-precheck risk and secret gate; E3 API/Admin/DOM and log canary evidence
not_proven: ExecutionEnvelope propagation; receipt/operation-log persistence of legal reason; dispatcher; HTTP 202; worker lifecycle; heartbeat; retry/restart; real MySQL/provider/media; E4 browser; E6
next_package: RP-02B2a remains frozen until separate MC authorization
reopen_conditions: risk input bypasses provider-precheck; secret reaches response/log/page/storage; rejected request creates task/event/asset/receipt/current/oplog/child; ordinary candidate regresses; manifest or gate is weakened
implementation_commit: 2da6d318c2aaf5295d792a4843b572a9f41ba43c
decided_by: MC
decided_at: 2026-07-13 22:24 CST
```

RP-02B2a0 完成不等于 `RMD-TASK-002` 关闭，也不授权 B2a/B2b/B2c/B3。真实数据库、真实模型供应商和真实媒体链路继续执行独立安全授权门禁。
