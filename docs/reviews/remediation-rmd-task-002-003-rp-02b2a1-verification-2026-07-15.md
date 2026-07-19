# RMD-TASK-002/003 / RP-02B2a1 阶段验收记录

## 1. 基本信息

| 字段 | 内容 |
| --- | --- |
| issue_id | RMD-TASK-002、RMD-TASK-003 |
| package_id | RP-02B2a1 |
| issue_class | PB、RB |
| severity | P0、P1 |
| owner | MC + DEV + TEST + QUALITY |
| initial_implementation_commit | `eee55689ef5f071c8cb7e15b718aa95d1843efe4` |
| compatibility_commit | `ec8278ee53c252faa4cc658e1e0dc161ae8ecf84` |
| rejected_candidate | `0a583c8c270c16d7e2a36c644a3ee2798ec5da22`，最终 QUALITY 发现两个 P1 后 rejected/superseded |
| hardening_chain | `072b9beb7541c5446b619898748093e1362ef449 -> f3422979e7506ba72ebaed07f41175514b9c092b -> 4817abc67cf916772b317aff027403b97ab4df76` |
| accepted_code_head_sha | `4817abc67cf916772b317aff027403b97ab4df76` |
| accepted_code_tree_sha | `ad3d36cb128989080289b5842a115d3d92776314` |
| evidence_publication_commit | `6eaf60af4155a8b95ff77d53261f5896d3a8f77d`；仅发布治理证据，不改写 accepted code head |
| evidence_publication_ref_at_run | `origin/codex/rp-02b2a1-registry-abi-20260714` 在 run `29410503391` 时指向 `6eaf60af4155a8b95ff77d53261f5896d3a8f77d`；证据身份绑定 commit/run，不把可移动 ref 当永久事实 |
| evidence_remote_governance | GitHub Actions run `29410503391`，head `6eaf60a`，`completed/success` |
| final_review | TEST、QUALITY、独立 clean checkout 均 `APPROVED` |
| remote_ci_status | accepted code head 四路 `completed/success` |
| acceptance_ids | TASK-PRECLAIM-01、TASK-WORKER-01、TASK-RETRY-01、GOV-GIT-01 的 RP-02B2a1 阶段 |
| environment | Node 24；mock provider；in-memory/deterministic fixtures；Prisma mock schema/static contract；GitHub Actions clean checkout |
| target_evidence_level | E3 |
| actual_evidence_level | E3 |

## 2. 阶段目标与边界

- 以单一 15-action registry 接管现有同步 `NovelService -> provider` 调用，未知 action 安全失败。
- provider public ABI 固定为逐 action 严格 DTO；调用点不得向 provider 透传 raw entity、富对象或 cast 绕过。
- 15 action 同步 HTTP 继续返回 `200`，本包不新增 leased execution、`202 queued`、worker lifecycle 或 Admin transport。
- provider-backed task 的公开 projection 固定 `retryable=false`、受控失败原因和 disabled 下一步；retry API 固定 `409 RETRY_NOT_AVAILABLE`，且 mutation/event/log/child 为零。
- 本包不证明 B2a2 authority claim/stale gate、B2a3 lease/attempt fence、B2a4/B2a5 fenced finalize，也不证明真实 DB/provider/media 或 E6。

## 3. 拒绝与返工历史

1. 初始实现 `eee5568` 和兼容修复 `ec8278e` 建立 registry、strict ABI、同步调用点覆盖和公开 retry freeze。
2. 候选头 `0a583c8` 曾取得四路远程绿灯，但最终独立 QUALITY 发现两个 P1，因此该头不能作为 accepted 证据：
   - package resolver 可在普通提交后丢失 damaged package 的累计范围，使固定包门禁被绕过；
   - RP-02A AST oracle 可被 `if (0)`、`this` alias、解构赋值和动态 computed access 绕过。
3. `072b9be` 修复累计 package gate；`f342297` 补强 fail-closed 与 AST oracle；`4817abc` 关闭剩余 A1-A5 和 AST 绕过。
4. 最终 accepted code head 固定为 `4817abc`。治理证据发布提交只承载文档，不替代或改写这一代码验收头。

## 4. 最终验收证据

| 证据桶 | 命令/证据 | 最终结果 | not_proven |
| --- | --- | --- | --- |
| RP-02B2a1 composite | `npm run test:rp02b2a1` | `APPROVED`，192/192（13 + 58 + 17 + 6 + 29 + 69） | 真实 worker 进程、真实 provider |
| RP-01C regression | `npm run test:rp01c` | 13/13 | 真实 provider |
| API full suite | API 全量测试 | 119/119 | 真实 MySQL/多进程 |
| RP-02A root guard | 根 `npm run test:rp02a` | 11/11 | E6 |
| AST negative mutations | 14 个绕过变异 | 14/14 均被拒绝 | 新语法仍需持续维护 oracle |
| quality | 独立 QUALITY | `APPROVED`，P1/P2=0/0 | 真实 DB/provider/media |
| clean checkout | 独立临时 clean checkout | `APPROVED`，同 tree、同测试结果 | 真实环境仍未授权 |
| typecheck/build | `npm run typecheck`；`npm run build` | passed | N/A |
| Prisma contract | Prisma generate + validate | passed | migration apply、真实事务/行锁 |
| diff | `git diff --check` | passed | N/A |
| package gate | 固定基线 `501a3cf..4817abc` 单一累计门禁 | 18 files / 1,898 net additions，未使用拆分门禁或 test-only 回退解释 | N/A |
| workflow contract | RP-02B2a1 production workflow contract | passed，`required_files=35` | 不外推远程运行环境或 E6 |
| remote governance | GitHub Actions run `29405557756` | `completed/success`，head `4817abc` | 不替代真实环境 |
| remote RP-01A | GitHub Actions run `29405557734` | `completed/success`，head `4817abc` | 不替代真实 DB |
| remote RP-01B | GitHub Actions run `29405557763` | `completed/success`，head `4817abc` | 不替代真实媒体 |
| remote RP-01C | GitHub Actions run `29405557764` | `completed/success`，head `4817abc` | 不替代真实 provider |
| evidence publication | GitHub Actions run `29410503391` | `completed/success`，head `6eaf60a` | 只证明治理证据已发布，不授权后续包或真实环境 |

## 5. Acceptance ID 阶段映射

| acceptance_id | RP-02B2a1 已证明 | 仍未证明 |
| --- | --- | --- |
| TASK-PRECLAIM-01 | registry/strict ABI 已进入现有同步生产调用点；公开 retry freeze 在任何 leased 能力前生效 | B2a2 的可信 actor、权威重载、canonical envelope 和 provider 前 stale gate |
| TASK-WORKER-01 | 15-action registry、严格 provider DTO、unknown action 安全失败；同步 HTTP 保持 200 | leased execution、worker loop、heartbeat、shutdown、202 transport、fenced finalize |
| TASK-RETRY-01 | provider-backed retry 固定 409、`retryable=false`、受控文案和零副作用 | 真实 retry child、预算/lineage、消费者执行、unknown outcome/restart |
| GOV-GIT-01 | accepted code head、固定累计 package gate、workflow contract 和四路同头远程 CI 均已固定 | 后续包独立基线、独立验收和独立 Git/CI 证据 |

## 6. 阶段裁决

```text
issue_ids: RMD-TASK-002, RMD-TASK-003
package_id: RP-02B2a1
package_status: completed
RMD-TASK-002: partial
RMD-TASK-003: open
issue_closed_count: 9/42 unchanged
approved_scope: 15-action registry; strict provider ABI; exact call-site coverage; public provider-backed retry freeze; package/workflow gate E3 evidence
not_proven: authoritative claim/reload; provider-before stale gate; lease/attempt CAS; fenced finalize; HTTP 202; Admin transport; worker lifecycle; heartbeat/shutdown; retry child consumption; restart/unknown outcome; real MySQL/provider/media; E6
next_package: none automatically authorized; RP-02B2a2 and later packages require separate MC decision
reopen_conditions: raw entity or cast reaches provider; unknown action dispatches; public retry becomes available or creates side effects; sync route changes to queued/202; package/workflow gate is weakened
accepted_code_head_sha: 4817abc67cf916772b317aff027403b97ab4df76
accepted_code_tree_sha: ad3d36cb128989080289b5842a115d3d92776314
evidence_publication_commit: 6eaf60af4155a8b95ff77d53261f5896d3a8f77d
evidence_remote_head_sha: 6eaf60af4155a8b95ff77d53261f5896d3a8f77d
evidence_governance_run: 29410503391 completed/success
decided_by: MC based on independent TEST, QUALITY, clean-checkout and remote CI evidence
decided_at: 2026-07-15
```

RP-02B2a1 阶段通过不等于 `RMD-TASK-002` 或 `RMD-TASK-003` 关闭，不授权 RP-02B2a2-B2a5、B2b、B2c、B3，也不把 mock/static 证据外推为真实数据库、真实模型、真实媒体或 E6。

## 7. RP-02B2a2 四路准入记录

| 准入路由 | 结论 | 阻塞计数 | 主控解释 |
| --- | --- | --- | --- |
| 后端合同 | `APPROVED` | `P0=0/P1=0/P2=2` | 只表示合同路由通过，不单独构成研发授权 |
| 独立 TEST | `REJECTED` | `P0=0/P1=3/P2=1` | 测试准入未清零 |
| QUALITY（当前实现） | `REJECTED` | `P0=3/P1=2/P2=1` | 当前实现不能作为 B2a2 通过证据 |
| 治理 | `REJECTED` | `P0=0/P1=3/P2=1` | 治理准入未清零 |

四路未全部批准，因此 RP-02B2a2 继续 `not_authorized`。本记录不授权 B2a2 实现，不改变 9/42、`RMD-TASK-002=partial`、`RMD-TASK-003=open`，真实 DB/provider/media/E6 继续冻结。

### 7.1 G0 首轮整改复核

首轮 gate/合同整改仍为 4/4 rejected：TEST `P0/P1/P2=0/2/0`、后端架构 `0/3/3`、QUALITY `0/5/1`、治理 `0/3/1`。共同阻塞包括治理文件没有独立 package 归属、candidate 未执行自身 gate、zero/unreachable push 与非祖先 manual 未 fail closed、A2 命令依赖可空壳、workflow expression 进入 shell、生产 actor 来源与 legacy 计数不明确。整改改由固定 `6eaf60a` 的 `RP-02B2a2-G0` 十文件治理包承载；G0 清零、提交、推送和远程 CI 前，A2 业务实现仍不授权。

### 7.2 G0 旧复核快照作废与当前复核前置

| 复核路由 | 旧快照 | 当前结论 | 重新准入前置 |
| --- | --- | --- | --- |
| 独立 TEST | 40/40 下的 `APPROVED` | 旧 G0 组合缺陷使既有批准作废；替代 G0 当前 16 files / 1,999 net additions；前次 `REJECTED P1=4` 的 16-file 契约和提前证据已修复，本地 package gate 47/47 与工程矩阵全绿 | 文档冻结后重跑 47-case 绑定，再对同一冻结差异独立复核 |
| 后端架构 | 旧差异下的 `APPROVED` | 第五轮同一 15-file 差异已 `APPROVED P0=0/P1=0`，但尚未与后续修复差异重新绑定 | 最终差异冻结后复核 package canonical、E1 文档合同和 A2 交接边界 |
| QUALITY | 10/418 下的 `APPROVED` | 已作废；第三轮未形成有效独立通过结论 | 第四轮重新复核坏 SHA、继承脚本、workflow、权限、凭证与越权边界 |
| 治理 | 10/418、40/40 下的 `APPROVED` | 已作废；替代 G0 当前 16 files / 1,999 net additions；前次 QUALITY `REJECTED P1=3/P2=1` 的空授权哨兵和旧 G0 anti-rollback 已进入机器阻断，本地 47/47 与工程矩阵全绿 | QUALITY 按最终同一冻结差异复核机器计数、workflow、anti-rollback 与授权边界 |

旧 `10 files / 418 net additions` 与 package gate 40/40 只绑定已经变化的历史差异，不能再写成当前机器口径、最终 diff 或当前 `APPROVED`。旧 G0 曾取得 package gate 46/46，但组合回归证明其 gate-prep 会复制合法 A2 scripts 并导致累积包自我拒绝，因此旧 G0 与全部批准已撤权并仅保留审计。替代 G0 从固定 `6eaf60a` 基线重建，当前累计差异为 `16 files / 1,999 net additions`；修复后 package gate 47/47，定向 15/15、actor-clean 69/69、governance 15/15、RP-01C 13/13、API 119/119、Admin 77/77、DOM 12/12、E2E 13/13 及 typecheck/build/Prisma 全绿。文档冻结后必须重跑同差异 47-case 绑定，再由独立 TEST/QUALITY 复核；通过前不得提交、推送或授权 A2，B2a2 保持 `not_authorized`。总账仍为 9/42，`RMD-TASK-002=partial`、`RMD-TASK-003=open`，真实 DB/provider/media/E6 继续冻结。

### 7.3 G0 accepted code head 与远程关闭证据

| 证据 | 结果 |
| --- | --- |
| accepted_code_head | `81f567d4fb61765c9a5d407dae04011d08d5aa19` |
| G0 package | 5 files / 191 net additions |
| final gate | package gate 56/56；governance 15/15；typecheck passed |
| RP-01A | run `29679243165` completed/success，`head_branch=main` |
| RP-01B | run `29679243180` completed/success，`head_branch=main` |
| RP-01C | run `29679243168` push completed/success，`head_branch=main` |
| Governance | run `29679243184` completed/success，`head_branch=main` |
| 授权边界 | B2a2 继续 `not_authorized` |
g0_evidence_parent_sha: 81f567d4fb61765c9a5d407dae04011d08d5aa19
g0_evidence_rp01a_run: 29679243165
g0_evidence_rp01b_run: 29679243180
g0_evidence_rp01c_run: 29679243168
g0_evidence_governance_run: 29679243184
g0_evidence_a2_authorization: not_authorized
g0_evidence_issue_closed_count: 9/42
g0_evidence_rmd_task_002: partial
g0_evidence_rmd_task_003: open
