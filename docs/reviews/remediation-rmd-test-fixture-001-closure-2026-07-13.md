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
| test_thread | independent TEST agent `019f5825-8839-7172-8439-3a063fd022a3` |
| acceptance_ids | TEST-FIXTURE-01 |
| environment | local Node 24 / API test-only fixture factory |
| target_evidence_level | E2/E3 deterministic factory |
| actual_evidence_level | E2/E3 independent local TEST + clean-checkout CI |

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
  - 新增 RP-01C 定向测试，覆盖确定性、冻结场景目录及条目、无全局共享 scenario/source refs/metadata/数组引用、普通对象结构冻结、深拷贝隔离、stale/current 引用完整、租户隔离及自定义租户避碰、幂等复用/冲突、场景化 executable failure injection probes、scripted LLM 调用计数、Fastify `/tasks` route 投影。
  - 新增根单命令 `npm run test:rp01c`，先在完整命令链外层清除 DB/DeepSeek 环境并禁用项目 dotenv，再依次 build shared、生成 API Prisma Client、运行 API fixture 测试，保证 clean checkout 自足且前置步骤也不读取项目 `.env`。
  - 新增 RP-01C workflow，Node 固定 `24.14.0`，运行 targeted fixture、API 全量、RP-01A guards、governance、typecheck、API build。
- 修改文件：以最终 git diff 为准。
- migration：N/A，本包不涉及数据库结构。
- 配置变化：新增 npm script 与 CI workflow。
- 数据兼容：N/A，test-only fixture 不进入生产数据模型。
- 安全影响：官方测试命令固定 `NODE_ENV=production`、`AI_PROVIDER_MODE=mock`、`DOTENV_CONFIG_PATH=/dev/null`，并显式清除 DB/DeepSeek 变量；不读取项目 `.env`，不触真实 DB/provider/media。fixture 内容只含安全摘要，不含完整 prompt、raw provider response、章节正文或密钥。
- 明确未修改：不改 production service/repository/buildApp，不新增 dev/test route，不改 shared 业务 DTO/枚举，不进入 RP-01D/RP-02。

## 4. 研发证据

| 证据桶 | 命令/证据 | 结果 | not_proven |
| --- | --- | --- | --- |
| contract | `apps/api/test/rp01c/fixtureFactory.test.ts` 场景目录断言 | passed; valid_state 8 类、counterexample 2 类完整；目录及条目冻结；scenario/source refs/metadata/数组无全局共享引用；普通结构冻结与 Date/嵌套深拷贝隔离通过；stale/current 引用自洽 | 真实业务恢复能力仍未证明 |
| unit | `npm run test:rp01c` | passed; 13 tests in independent TEST and clean-checkout run `29208828449` | N/A |
| API | Fastify `/tasks/:taskId`、`/tasks/:taskId/events` 投影 processing/failed/stale/conflict；restart_boundary 关闭 app 后同 scenarioId 重建并投影一致 | passed through existing task routes | counterexample 仅作 fixture/detector，不作 route 支持声明；restart 不证明 worker/进程恢复 |
| DB/MySQL/Prisma | N/A | 本包不触真实 DB/Prisma 写入 | 真实 MySQL/Prisma 未证明 |
| browser | N/A | 本包为 API test support | 浏览器不属于 TEST-FIXTURE-01 |
| provider | N/A | scripted LLM 只验证 test support 调用计数和 release 控制 | 真实 provider 未证明 |
| media | N/A | 本包不触媒体 | 真实媒体未证明 |
| typecheck | `npm run typecheck` | passed independently and in clean-checkout run `29208828449` | N/A |
| build | `npm run build -w @ai-shortvideo/api` | passed independently and in clean-checkout run `29208828449` | N/A |
| failure injection | `failed_timeout` 第 1 次 chat reject timeout；`failed_malformed_json` 第 1 次 chat 返回 malformed 且 JSON.parse 失败；`chapter_plan_chunk_failure` 第 1 次 valid、第 2 次 malformed；`save_failure_after_provider` provider 成功后第 1 次 repository save reject；`late_result_after_cancel` cancel 后受控 deferred release 迟到输入 | passed as executable test-only probes | 不证明业务已具备完整 repair/retry/worker 恢复；late_result 仍为 counterexample，不声称生产阻止回写 |
| concurrency/restart | `active_conflict` 同租户 conflict lookup 命中、跨租户不命中；`restart_boundary` app close 后同一 scenarioId 重建 projection 一致 | passed as deterministic fixture/replay input | 不证明真实并发原子 preclaim、worker/retry、进程重启恢复 |

研发自测结论：

```text
user_goal_status: partial
environment: local Node 24 / NODE_ENV=production / AI_PROVIDER_MODE=mock / DOTENV_CONFIG_PATH=/dev/null / API test-only fixture factory
evidence_level: E2/E3 local DEV
not_proven: independent TEST/QUALITY approval, real restart recovery, worker/retry, atomic concurrent preclaim, DB current uniqueness, real MySQL/Prisma, real provider, media
```

## 5. 独立测试证据

- 执行 acceptance ids：TEST-FIXTURE-01
- 首轮独立 TEST：agent `019f5803-feb9-7683-b92a-d88680791af6` 对 `dd346be` 判定 needs_revision；P1 为 `RP01C_SCENARIOS` 条目仍可变并污染后续 fixture。现已逐条冻结并补反例 guard。
- 第二轮独立 TEST：agent `019f5817-4ba7-70f1-ae71-377f83a5a574` 对 `3910a68` 判定 needs_revision；确认 fixture 正确性与 clean-checkout CI 已通过，剩余 P1 为根命令的环境隔离未覆盖 Prisma generate 前置步骤、closure 状态漂移。本次返工将安全环境包裹完整根命令链，待新提交后重新验收。
- 最终独立 TEST：agent `019f5825-8839-7172-8439-3a063fd022a3` 对 `1406878` 判定 approved；P0=0、P1=0，允许关闭 `RMD-TEST-FIXTURE-001` 与 `TEST-FIXTURE-01`。
- environment：local Node `24.14.0`；污染父环境注入假 DB/key；根命令强制 production/mock/`/dev/null`。
- evidence_level：E2/E3 independent local TEST + E2/E3 clean-checkout CI。
- 命令：`npm run test:rp01c`、API 108、RP-01A 13、governance 15、typecheck、API build、git budget、diff check。
- fixture：RP-01C deterministic fixture factory
- contract：8 个 valid states + 2 个 counterexamples；完整命令链环境隔离静态 guard 通过。
- unit：13/13 passed。
- API：108/108 passed；Fastify task/event projection 通过。
- 浏览器 trace：N/A，RP-01C 不涉及浏览器
- DB/MySQL/Prisma：N/A，RP-01C 不授权真实 DB
- API 请求/响应安全摘要：固定 request-id；无 key、DATABASE_URL、prompt/raw provider response 泄露。
- 数据库证据：N/A
- provider 证据：N/A，scripted LLM 是 test support
- 媒体文件证据：N/A
- 刷新/多标签/重复点击：N/A
- 失败/取消/重试/重启：timeout、malformed、分块失败、provider 后保存失败、cancel 后迟到 release 均为可执行 test-only probe；restart 仅证明同 scenario 重建等价投影。
- 回归范围：API fixture factory、task route projection、API 全量、RP-01A guards、governance、typecheck、API build

测试结论：

```text
conclusion: approved
user_goal_status: passed
environment: local Node 24.14.0 / production / mock / dotenv disabled / no real DB-provider-media
evidence_level: E2/E3 independent local TEST + clean-checkout CI
not_proven: real MySQL/Prisma, DB current uniqueness, atomic preclaim, worker/retry/heartbeat, real process restart recovery, production late-result write prevention, real provider, browser, media
```

## 6. 产品与质量复核

产品复核：

- 原问题场景是否可理解：passed；场景目录按 valid_state/counterexample 明确分类。
- 结果是否可见：passed；单命令输出确定性状态和失败注入结果。
- 下一动作是否明确：passed；RP-01C 只提供 fixture，真实任务能力进入 RP-02，真实 DB 进入独立授权的 RP-01D。
- 是否仍有误导性能力表述：passed；restart/late/duplicate 均保留 not_proven 或 counterexample 边界。

质量复核：

- 首轮独立 QUALITY：agent `019f5804-9dbc-7f21-97e2-25995cf59e66` 对 `dd346be` 判定 needs_revision；P1 涉及测试环境未隔离、request-id 随机、stale current 悬空、场景条目可变、自定义租户与固定 other tenant 碰撞及 closure 漂移。相关 fixture 正确性问题已定向修正。
- 第二轮独立 QUALITY：agent `019f5817-e8db-7c80-b77e-b3689db16efe` 对 `3910a68` 判定 needs_revision；确认场景、引用、租户、固定 request-id、production route 边界、范围和远程 CI 通过，剩余 P1 与第二轮 TEST 一致。本次返工仅调整测试命令链和关闭证据，待新提交后重新验收。
- 最终独立 QUALITY：agent `019f5824-ea77-7cc2-b798-a0bfbcb22dc6` 对 `1406878` 判定 approved；P0=0、P1=0，允许关闭。
- 范围是否越界：否；累计 6 文件、1079 净新增，仅 test/workflow/docs/package scripts。
- 真实环境边界：passed；不触真实 MySQL/provider/media，不进入 RP-01D/RP-02。
- 租户/权限/敏感信息：passed；租户隔离和安全摘要 guard 通过，无敏感原文。
- Git 和工作树：passed；复核时 HEAD/upstream/remote 均为 `1406878`，工作树 clean。
- 是否存在未归因文件：否。

## 7. Git 与远程

| 字段 | 内容 |
| --- | --- |
| branch | `codex/aishortvideo-checkpoint-20260711` |
| commit | implementation/follow-up commits `12d77da`, `7a69c1a`, `dd346be`, `3910a68`, `dc1991a`; closure evidence revision is the HEAD containing this document |
| upstream | implementation commit `dc1991a` and reviewed closure-evidence commit `1406878` pushed to `origin/codex/aishortvideo-checkpoint-20260711` |
| remote_ci_regression | run `29207239740` at `12d77da` failed because clean checkout lacked generated Prisma Client; run `29207557235` at `7a69c1a` passed targeted/API/E2E/governance/typecheck/build but failed git-budget because shallow checkout lacked a parent revision; run `29207718875` at `dd346be` passed after adding Prisma generation and `fetch-depth: 0`; run `29208391608` at `3910a68` passed targeted 13/API 108/RP-01A 13/governance 15/typecheck/API build/git-budget; final implementation run `29208828449` at `dc1991a` passed the same complete clean-checkout matrix after wrapping the full command chain in the sanitized environment. Sibling runs `29208828441` governance, `29208828426` RP-01A and `29208828434` RP-01B DOM also passed |
| changed_files | RP-01C cumulative diff from `4490196`: files=6, netAdditions=1079; within the RP-00B budget |
| diff_check | `git diff --check` passed |
| worktree_remaining | final MC ledger/status/receipt closeout only; final closeout commit must be pushed and governance verified |

## 8. 关闭裁决

```text
issue_id: RMD-TEST-FIXTURE-001
final_status: closed
closed_acceptance_ids: TEST-FIXTURE-01
residual_risks: real MySQL/Prisma, DB current uniqueness, atomic preclaim, worker/retry/heartbeat, real process restart recovery, production late-result write prevention, real provider, browser and media remain outside RP-01C scope
reopen_conditions: fixture factory removed; scenario catalogue incomplete; failure states again require manual state edits; counterexamples normalized or misreported as fixed
decided_by: MC `019ed4a5-a2f5-7d13-86d0-0c28381af555`
decided_at: 2026-07-13 05:13:43 CST
```
