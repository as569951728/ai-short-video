# RP-02B2a2 Gate Prep 预算 ADR

status: ready
package_id: RP-02B2a2-G0
manifest_id: RP-02B2a2-G0-v1
baseline_sha: 6eaf60af4155a8b95ff77d53261f5896d3a8f77d
hard_max_files: 15
hard_max_net_additions: 2000
exceeded_budget: governance_bootstrap_budget
actual_files: 15
actual_net_additions: 1993
split_reason: The package gate, four immutable parent workflows, trusted admission workflow, executable acceptance contract, and governance evidence must form one independently accepted bootstrap before RP-02B2a2 business implementation can use them.
owner: MC
valid_until: 2026-08-31

本包只承载 A2-A5 准入信任根硬化，不实现 authority claim。最终 G0 必须经过独立复核，并且是固定基线 `6eaf60af4155a8b95ff77d53261f5896d3a8f77d` 的唯一原子直接子提交；禁止在旧 G0 后追加修订、用多提交累计成 G0，或把 E1 字段/事件/7.3 合入 G0。15-file manifest 在原 11 个文件上增加 `.github/workflows/rp01a-e2e.yml`、`.github/workflows/rp01b-dom.yml`、`.github/workflows/remediation-governance.yml` 与 `apps/api/test/rp01c/fixtureFactory.test.ts`，确保 E1 所引用的四路父工作流全部固定第三方 action 完整 SHA、根级只读 permissions，并让 checkout 使用 `persist-credentials: false`。`--worktree` 只允许当前 HEAD 为固定基线或其唯一直接子提交 pending atomic amend；最终 commit-mode 仍必须证明该提交是固定基线的唯一原子直接子提交。当前未提交差异为 `1,993` net additions，低于 `2,000` 硬上限；最终冻结前必须重新计算并回填。`package.json` 仅补齐 A1 四条命令的 deployment actor 环境清理并由可信 gate 逐字冻结。A2 必须在 MC 显式授权后，从 accepted G0 code head 新建 sibling 实现分支，不得以 E1 为父提交；A2 不得重复修改 G0-only 文件，`package.json` 是唯一显式重叠文件，A2 只可新增三条冻结的 A2 scripts，A1 四条及其他继承脚本必须逐字不变。

## 可信 admission 架构与外部授权元组

- 现有 `.github/workflows/rp01c-fixtures.yml` 只承担 G0 bootstrap、普通 CI、G0 远程验收和 post-merge 回归；它由候选提交提供，因此对 A2-A5 admission 明确为 **non-authoritative**，其成功不得解释为 A2-A5 已准入。
- 新增 `.github/workflows/rp02b2a-admission.yml`。只有 accepted G0 已独立提交、推送并进入默认分支后，默认分支版本的该 workflow 才是 A2-A5 唯一 authoritative admission 入口；G0 自身仍是一次性 bootstrap exception，必须按固定 manifest、固定基线、原子直接子提交和独立 TEST/QUALITY/治理复核完成，不能自我验收。
- authoritative workflow 固定使用 `pull_request_target` 的 `opened/synchronize/reopened/ready_for_review` 事件。可信 workflow/gate 来源是默认分支 accepted G0；候选身份只能取 `github.event.pull_request.head.sha`，base 只能取 `github.event.pull_request.base.ref/base.sha`。workflow 必须把事件 `base.ref` 与 repository API 的默认分支及 `github.ref` 逐项绑定，并在产出 artifact 前复查 live PR 的 `base.ref/base.sha/head.sha`；任何非默认分支目标必须 fail closed。在可信 gate 成功前，禁止 checkout 候选工作树、执行候选 Node/script/action、运行 `npm ci`、读取候选 `package.json` 后执行命令，或让任何候选代码获得执行机会；只允许以 Git object 方式 fetch 并静态检查精确 candidate SHA。
- workflow 与所有 action 必须固定到完整 commit SHA，权限只允许显式 read-only 的 `contents: read`、`actions: read`；authoritative admission 另允许其 live PR 身份校验必需的 `pull-requests: read`。候选 job 使用 hosted runner、禁用共享 cache 且 `persist-credentials: false`。不得使用 write permission、secret、local action、候选 action 或候选可修改的 gate 作为准入判断器。
- workflow canonical digest 和同包 mutation tests 只用于证明当前实现与已审阅语义一致，不能把 G0 自己变成独立验收者。真正独立的 bootstrap oracle 是固定基线直接子提交、冻结 15-file diff、四席只读复核和后续远程 clean-checkout；任何同包 hash/test 绿灯都不得单独解释为 G0 accepted。
- A2-A5 只认 repository-controlled 外部元组 `RP02B2A_AUTHORIZED_PACKAGE_ID` + `RP02B2A_AUTHORIZED_PREDECESSOR_SHA`，并额外强制绑定 repository-controlled `RP02B2A_G0_EVIDENCE_SHA`。该 evidence SHA 必须是 accepted G0 的唯一单父 E1 子提交，三份证据、四个父 run 与 `not_authorized` 边界都通过生产 gate；缺失、伪造、错误父提交或候选提供的 evidence SHA 一律在 provider/install 前失败。未授权时 package/predecessor 固定为 `NOT_AUTHORIZED` / `not_authorized`；候选 ADR、分支名、提交正文、evidence 正文、dispatch input、调用者 env 或候选 workflow 都不能替代、修改或推断该外部状态。
- 前序链严格固定为 `RP-02B2a2 <- accepted G0 code head`、`RP-02B2a3 <- independently accepted A2 code head`、`RP-02B2a4 <- independently accepted A3 code head`、`RP-02B2a5 <- independently accepted A4 code head`。外部 package id 决定唯一允许变化的业务 ADR 与 manifest；外部 predecessor 必须是完整 40 位、非零、可解析、可达且为 candidate 的祖先，ADR `baseline_sha` 必须与其逐字相同。比较区间始终为 `<authorized predecessor>..candidate` 的累计区间，不能用 event direct diff 隐藏早期改动。
- 只有 MC 在前一包独立实现、TEST/QUALITY P0/P1=0、commit/push、远程 clean-checkout 和关闭证据一致后，才可推进外部元组到下一对。gate 通过、ADR 变更、E1 发布或 workflow 成功都不会自动推进授权。package id 与候选 ADR 不一致、前序缺失/错误/陈旧/指向 E1、同区间出现 predecessor/successor/multiple ADR，或 A2 历史触碰三份 E1 evidence 文件时，必须在候选 install/test 前 fail closed。
- `push` 只用于 post-merge CI，不产生 authoritative admission；`workflow_dispatch` 只用于 replay/audit，不得授权候选或替代 PR admission。push 的 `before/after` 与 dispatch 的显式 base/head 仅可作为审计范围，零 SHA、非祖先、创建/删除 ref、同 SHA 或 workflow revision 不可信时全部 fail closed。
- 每条 authoritative admission evidence 必须绑定不可变的 workflow path、workflow id、`event=pull_request_target`、`github.workflow_sha`、PR number、PR base SHA、authorized predecessor SHA、accepted G0-E1 SHA 与 candidate SHA，并由可信、可下载的 JSON artifact 输出 gate source、G0-E1 SHA/digest、package id、绑定策略和候选 blob 的 manifest digest、固定 test command。workflow path/id/event/workflow_sha/PR/base/candidate/E1 任一漂移都必须拒绝；required check 的同名 job 本身不能替代这组身份核验。
- 两个 workflow 的根键、job、runner、timeout、权限、环境和步骤都必须由可信 gate 精确校验。任一步骤的 `if`、`continue-on-error`、自定义 shell、额外 job/step、步骤重排、触发器/分支过滤扩展或授权变量改绑均视为绕过并拒绝；本合同只定义要求，不宣称对应实现或测试已经验收通过。

## 一次性 E1 证据发布合同

- G0 的 15-file manifest 固定包含新增的 `.github/workflows/rp02b2a-admission.yml` 与四路父工作流的 action 完整 SHA、根级只读 permissions、checkout 非持久化凭证硬化，E1 不得扩充或改写该 manifest。G0 最终代码提交四路同头远程成功后，只允许在专用 evidence 分支创建一个 `RP-02B2a2-G0-E1` 原子提交；它是该 evidence lineage 中唯一的 E1 提交，且直接父提交必须为 accepted G0 code head。禁止 merge、重复 E1、G0+E1 合批或混入 A2。A2 实现分支与 E1 evidence 分支互为 sibling，`E1 -> A2` 拓扑必须拒绝，但每个 A2-A5 admission 都必须通过 repository-controlled SHA 独立验证该 sibling E1 已存在且合法。
- E1 固定只改 `docs/reviews/main-control-status.md`、`docs/reviews/main-control-event-ledger.md`、`docs/reviews/remediation-rmd-task-002-003-rp-02b2a1-verification-2026-07-15.md`，预算为 `3 files / additions <= 64 / deletions <= 16 / net additions <= 64`。
- 三份文档必须各自且仅出现一次、值完全一致地记录以下精确九字段：`g0_evidence_parent_sha`、`g0_evidence_rp01a_run`、`g0_evidence_rp01b_run`、`g0_evidence_rp01c_run`、`g0_evidence_governance_run`、`g0_evidence_a2_authorization`、`g0_evidence_issue_closed_count`、`g0_evidence_rmd_task_002`、`g0_evidence_rmd_task_003`。任何额外 `g0_evidence_*` 字段都必须拒绝，包括 self/publication SHA、E1 run 或同义字段；任一必需字段重复也必须拒绝。字段值必须非空且与字段名位于同一行，禁止跨行借用下一字段或正文。parent 必须是完整 G0 父 SHA；四个 run id 必须唯一且分别对应父提交的四路成功 workflow；状态必须精确保持 `not_authorized`、`9/42`、`partial`、`open`。
- E1 不得记录自身 SHA/run，不得修改 A2 ADR、业务代码或 G0-only 文件；三份 evidence 正文不得正向宣称 A2/B2a2 已授权、授权通过或允许开始/进入业务实现。每个正向授权语句必须独立判定，不能因同句、邻句或文档其他位置出现 `not_authorized` 而被豁免。G0 evidence workflow 必须在任何 install/test 前使用只读权限与 `gh api` 校验四个 run 的 workflow name、repository workflow path、run path（精确 path 或受限 `path@ref`）、workflow id、event、head、completed status 和 success conclusion；任一条件不满足即拒绝证据发布。该 G0 四路证据不等同于未来 A2-A5 authoritative admission evidence。
- `main-control-status.md` 必须原位把总体进度块、G0 最终复核行和唯一编号 1 推荐动作改为 accepted code head、四路远程成功、最终 `15 files / <final actual_net_additions> net additions` 与最终实际 gate 计数；不得残留待提交/pending、旧 `10/11 files` 或旧计数。`<final actual_net_additions>` 与 gate 计数只允许 main 在冻结最终差异并重新运行完整矩阵后回填，本合同不预判其值。
- `main-control-event-ledger.md` 必须恰好追加一个 `### MCE-RP02B2A2-G0-E1-REMOTE-ACCEPTED` 事件，记录 E1 package id、完整 accepted code head，并明确 G0 关闭、B2a2 `not_authorized`。
- verification 文档必须恰好新增一个 `### 7.3 G0 accepted code head 与远程关闭证据`，列出完整 head、最终 `15 files / <final actual_net_additions> net additions`、最终实际 gate 计数、四 run 和 `not_authorized`。
- 生产验收必须覆盖 E1 `additions=64`、`deletions=16`、`net=64` 的边界通过及任一维度超限，重复/额外字段，G0+E1 合批，incremental G0，`E1 -> A2` 误拓扑，候选自改 gate/workflow 不生效，以及 fake `gh` 对父 run 的 name、repository workflow path、精确或受限 `path@ref`、workflow id、event、head、status、conclusion 各自错配的失败矩阵；future authoritative admission 的 `workflow_sha`、PR/base/candidate 身份仍须独立校验。只追加九字段而不完成三份文件的最终状态迁移，或保留任一 pending/旧计数，生产 gate 必须拒绝。

本包不授权 RP-02B2a2 业务实现、B2a3-B2a5、B2b、B2c、B3、真实数据库、真实模型供应商、真实媒体链路或 E6。
