# RMD-TEST-FIXTURE-001 整改关闭记录

## 1. 基本信息

| 字段 | 内容 |
| --- | --- |
| issue_id | RMD-TEST-FIXTURE-001 |
| package_id | RP-01C |
| issue_class | QG |
| severity | P0 |
| owner | DEV + TEST |
| dev_thread | `019ed4ee-441a-7fa2-894d-393c7d4c527b` |
| test_thread | 待主控正式派发 |
| acceptance_ids | TEST-FIXTURE-01 |
| environment | local Node 24 / API test-only fixture factory |
| target_evidence_level | E2/E3 deterministic factory |
| actual_evidence_level | E2/E3 local DEV, pending independent test |

## 2. 原始问题

- 用户目标：processing、failed、stale、conflict、restart 等失败状态可以单命令确定性重放，不再靠临时手改状态。
- 原始现象：复杂失败状态主要散落在单个 route test 的临时注入、延迟 promise 或手动数组状态中，难以复用成验收 fixture。
- 用户影响：测试会话和主控难以稳定复验失败态、迟到结果、重复 current、保存失败等边界。
- 首次证据：`docs/remediation/issue-ledger.md` 中 `RMD-TEST-FIXTURE-001`。
- 直接原因：缺少独立 test-only fixture factory 与场景目录。
- 系统根因：早期测试更偏单用例行为验证，缺少可归档、可分类、可重放的状态资产。
- 原状态：open。

## 3. 修复范围

- 修改内容：
  - 新增 `apps/api/test/rp01c/fixtureFactory.ts`，只在 test-only 目录提供确定性 snapshot、最小 repository projection、idempotency detector、scripted LLM、deferred 控制和场景化 executable failure injection probes。
  - 场景目录覆盖 valid_state：`processing`、`failed_timeout`、`failed_malformed_json`、`stale_source`、`active_conflict`、`restart_boundary`、`chapter_plan_chunk_failure`、`save_failure_after_provider`。
  - 场景目录覆盖 counterexample：`late_result_after_cancel`、`duplicate_current`；counterexample 不自动归一化，不声称业务已修。
  - 新增 RP-01C 定向测试，覆盖确定性、无全局共享 scenario/source refs/metadata/数组引用、普通对象结构冻结、深拷贝隔离、序列化、引用完整、租户隔离、幂等复用/冲突、场景化 executable failure injection probes、scripted LLM 调用计数、Fastify `/tasks` route 投影。
  - 新增根单命令 `npm run test:rp01c`，命令内先 build shared，再执行 API Prisma Client generate，然后运行 API fixture 测试，保证 clean checkout 自足。
  - 新增 RP-01C workflow，Node 固定 `24.14.0`，运行 targeted fixture、API 全量、RP-01A guards、governance、typecheck、API build。
- 修改文件：以最终 git diff 为准。
- migration：N/A，本包不涉及数据库结构。
- 配置变化：新增 npm script 与 CI workflow。
- 数据兼容：N/A，test-only fixture 不进入生产数据模型。
- 安全影响：不读取 `.env`、真实 DB/provider/media；fixture 内容只含安全摘要，不含完整 prompt、raw provider response、章节正文或密钥。
- 明确未修改：不改 production service/repository/buildApp，不新增 dev/test route，不改 shared 业务 DTO/枚举，不进入 RP-01D/RP-02。

## 4. 研发证据

| 证据桶 | 命令/证据 | 结果 | not_proven |
| --- | --- | --- | --- |
| contract | `apps/api/test/rp01c/fixtureFactory.test.ts` 场景目录断言 | passed; valid_state 8 类、counterexample 2 类完整；scenario/source refs/metadata/数组无全局共享引用；普通结构冻结与 Date/嵌套深拷贝隔离通过 | 独立验收待执行 |
| unit | `npm run test:rp01c` | passed; 11 tests | 独立验收待执行 |
| API | Fastify `/tasks/:taskId`、`/tasks/:taskId/events` 投影 processing/failed/stale/conflict；restart_boundary 关闭 app 后同 scenarioId 重建并投影一致 | passed through existing task routes | counterexample 仅作 fixture/detector，不作 route 支持声明；restart 不证明 worker/进程恢复 |
| DB/MySQL/Prisma | N/A | 本包不触真实 DB/Prisma 写入 | 真实 MySQL/Prisma 未证明 |
| browser | N/A | 本包为 API test support | 浏览器不属于 TEST-FIXTURE-01 |
| provider | N/A | scripted LLM 只验证 test support 调用计数和 release 控制 | 真实 provider 未证明 |
| media | N/A | 本包不触媒体 | 真实媒体未证明 |
| typecheck | `npm run typecheck` | passed | 独立验收待执行 |
| build | `npm run build -w @ai-shortvideo/api` | passed | 独立验收待执行 |
| failure injection | `failed_timeout` 第 1 次 chat reject timeout；`failed_malformed_json` 第 1 次 chat 返回 malformed 且 JSON.parse 失败；`chapter_plan_chunk_failure` 第 1 次 valid、第 2 次 malformed；`save_failure_after_provider` provider 成功后第 1 次 repository save reject；`late_result_after_cancel` cancel 后受控 deferred release 迟到输入 | passed as executable test-only probes | 不证明业务已具备完整 repair/retry/worker 恢复；late_result 仍为 counterexample，不声称生产阻止回写 |
| concurrency/restart | `active_conflict` 同租户 conflict lookup 命中、跨租户不命中；`restart_boundary` app close 后同一 scenarioId 重建 projection 一致 | passed as deterministic fixture/replay input | 不证明真实并发原子 preclaim、worker/retry、进程重启恢复 |

研发自测结论：

```text
user_goal_status: partial
environment: local Node 24 / API test-only fixture factory
evidence_level: E2/E3 local DEV
not_proven: independent TEST, remote CI, real restart recovery, worker/retry, atomic concurrent preclaim, DB current uniqueness, real MySQL/Prisma, real provider, media
```

## 5. 独立测试证据

- 执行 acceptance ids：TEST-FIXTURE-01
- environment：待 TEST 填写
- evidence_level：待 TEST 填写
- 命令：待 TEST 填写
- fixture：RP-01C deterministic fixture factory
- contract：待 TEST 填写
- unit：待 TEST 填写
- API：待 TEST 填写
- 浏览器 trace：N/A，RP-01C 不涉及浏览器
- DB/MySQL/Prisma：N/A，RP-01C 不授权真实 DB
- API 请求/响应安全摘要：待 TEST 填写
- 数据库证据：N/A
- provider 证据：N/A，scripted LLM 是 test support
- 媒体文件证据：N/A
- 刷新/多标签/重复点击：N/A
- 失败/取消/重试/重启：fixture/replay input only，待 TEST 填写
- 回归范围：API fixture factory、task route projection、API 全量、RP-01A guards、governance、typecheck、API build

测试结论：

```text
conclusion: pending
user_goal_status: pending
environment:
evidence_level:
not_proven:
```

## 6. 产品与质量复核

产品复核：

- 原问题场景是否可理解：pending
- 结果是否可见：pending
- 下一动作是否明确：pending
- 是否仍有误导性能力表述：pending

质量复核：

- 范围是否越界：pending
- 真实环境边界：pending
- 租户/权限/敏感信息：pending
- Git 和工作树：pending
- 是否存在未归因文件：pending

## 7. Git 与远程

| 字段 | 内容 |
| --- | --- |
| branch | `codex/aishortvideo-checkpoint-20260711` |
| commit | 未提交 |
| upstream | 待主控确认 |
| remote_ci_regression | commit `12d77da`, run `29207239740` failed because clean checkout lacked generated Prisma Client; commit `7a69c1a`, run `29207557235` then passed targeted 11/API 108/E2E guard 13/governance 15/typecheck/build but failed the final git-budget step because shallow checkout lacked a parent revision. Root `test:rp01c` now generates Prisma Client and RP-01C checkout uses `fetch-depth: 0`; recheck pending |
| changed_files | RP-01C cumulative diff from `4490196`: files=6, netAdditions=1023; current follow-up worktree remains within the RP-00B budget |
| diff_check | `git diff --check` passed |
| worktree_remaining | RP-01C uncommitted files only; no commit/push performed |

## 8. 关闭裁决

```text
issue_id: RMD-TEST-FIXTURE-001
final_status: partial
closed_acceptance_ids:
residual_risks: independent TEST and remote CI pending; not_proven items remain outside RP-01C scope
reopen_conditions: fixture factory removed; scenario catalogue incomplete; failure states again require manual state edits; counterexamples normalized or misreported as fixed
decided_by: pending MC
decided_at: pending
```
