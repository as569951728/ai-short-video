# RMD-NOV-UX-001 整改关闭记录

## 1. 基本信息

| 字段 | 内容 |
| --- | --- |
| issue_id | RMD-NOV-UX-001 |
| package_id | RP-05B1 |
| issue_class | RB |
| severity | P1 |
| owner | DEV + PRODUCT |
| dev_thread | 当前需求主控目标与实现工作树 |
| test_thread | PRODUCT `019fc04a-ade5-7b93-a6d7-070dea2303b8`；TEST `019fc04a-f9fe-7f01-ad33-f9d8d5321a7a`；QUALITY `019fc04b-69cd-7dc3-9dce-8cdbb3b215c4` |
| acceptance_ids | NOV-CANDIDATE-01 至 NOV-CANDIDATE-06；NOV-AI-CTA-01 |
| environment | 真实 Vue 管理端 + Fastify API transport + in-memory repository；GitHub Actions clean checkout |
| target_evidence_level | E4 |
| actual_evidence_level | E4 |

## 2. 原始问题

- 用户目标：候选生成、融合、优化、编辑、采用和长任务完成后，用户能找到精确结果、理解版本关系并明确进入下一步。
- 原始现象：融合后无新方向、候选不可编辑、优化缺少用户指令、查看结果和继续优化无交互、采用后无后续动作、两个版本视觉上同时像已采用、章节目录和试写 CTA 点击无效果或只剩 loading。
- 用户影响：用户无法判断 AI 是否完成、结果在哪里、哪个版本生效以及下一步做什么，且重复点击可能产生冲突任务。
- 首次证据：N-02 至 N-05、N-10 至 N-15、N-18 与用户浏览器标注。
- 直接原因：动作返回值、任务 resultVersionIds、页面步骤、候选定位和正式版本投影未形成统一合同。
- 系统根因：候选资产状态、采用权威边界、幂等重放、审计快照和下游失效分散在多层实现，缺少同一结果链的端到端约束。
- 原状态：implemented_pending_verification。

## 3. 修复范围

- 修改内容：统一候选来源与变更原因 DTO；生成、融合、优化、编辑返回精确候选 ID；查看结果按 resultVersionIds 切换步骤并聚焦；采用后唯一 current、历史化旧版并进入下一步骤；补 actor-scoped 幂等、锁内 CAS、成功重放优先级、审计前后快照和下游 hard-stale。
- 修改文件：PR #61 中 29 个 shared、API、admin、测试与验收文件，完整清单见 RP-05B1 ADR。
- migration：N/A；本包不修改 Prisma schema 或 migration。
- 配置变化：N/A；不新增密钥、provider 或运行配置。
- 数据兼容：旧候选保留为历史；失效结果不再作为当前入口；历史采用事实保留审计语义。
- 安全影响：幂等 token 绑定 tenant/user/action/object，前端不暴露完整 prompt、模型响应、密钥或 provider 原文。
- 明确未修改：真实 MySQL 唯一约束、真实 DeepSeek 输出质量、偏好管理、媒体生成和完整小说生产链。

## 4. 研发证据

| 证据桶 | 命令/证据 | 结果 | not_proven |
| --- | --- | --- | --- |
| contract | `npm test -w @ai-shortvideo/shared` | 23/23 passed | 无 |
| unit | `NODE_ENV=production npm run test:dom:admin` 的 admin unit 部分 | 78/78 passed | 无 |
| API | `npm test -w @ai-shortvideo/api` | 126/126 passed | 真实 MySQL 不在本桶 |
| DB/MySQL/Prisma | Prisma 锁序、CAS 和 repository 静态/单测证据 | 设计与合同通过 | 真实 MySQL 事务隔离、锁等待和并发双请求 |
| browser | 方向生成/优化/采用、设定采用、全书大纲生成/优化/采用的真实浏览器串行复验 | 原事故链 passed | 跨设备恢复 |
| provider | mock provider 仅验证权威输入传递 | 合同 passed | 真实 provider 内容质量、时延、费用 |
| media | N/A；候选交互包不产生媒体 | 不适用 | 视频媒体链 |
| typecheck | `npm run typecheck` | passed | 无 |
| build | GitHub admin DOM/backend E2E clean-checkout workflows | passed | 独立生产部署构建 |
| failure injection | stale page、异指纹重放、active task、失效结果与重复 current 回归 | passed | 真实网络中断 |
| concurrency/restart | actor 隔离、CAS、幂等 replay 与 active claim 回归 | passed at E4 contract/API | 真实 MySQL 并发与进程重启 |

研发自测结论：

```text
user_goal_status: passed
environment: real admin/API transport with in-memory persistence
evidence_level: E4
not_proven: real MySQL concurrency, real provider quality, media, cross-device recovery
```

## 5. 独立测试证据

- 执行 acceptance ids：NOV-CANDIDATE-01 至 06；NOV-AI-CTA-01。
- environment：固定代码候选 `d09b9aa` / tree `26dfd802`；最终包 tree `ae968dcf`。
- evidence_level：E4。
- 命令：shared 23/23；API 126/126；admin 78/78；DOM 21/21；root typecheck；RP-02B1 14/14。
- fixture：in-memory candidate/task/novel fixtures；active setting task after first adoption。
- contract：sourceVersionIds、changeReason、resultVersionIds、currentVersionId、idempotencyKey 全部进入固定合同。
- unit：视图模型、service payload、结果定位和候选动作回归通过。
- API：生成、融合、优化、编辑、采用、成功重放、异指纹冲突、stale page 和下游失效通过。
- 浏览器 trace：真实浏览器完成方向到设定、设定到大纲、精确查看结果、继续优化和唯一正式版本链。
- DB/MySQL/Prisma：未连接真实 MySQL；不用于关闭 RMD-NOV-VERSION-001。
- API 请求/响应安全摘要：只返回非敏感来源、变更原因和候选标识；不返回密钥、完整 prompt 或原始模型响应。
- 数据库证据：Prisma 行锁/CAS 静态与测试证据；无真实数据库动态证据。
- provider 证据：只证明 mock provider ABI 获得权威输入；不证明真实输出质量。
- 媒体文件证据：N/A。
- 刷新/多标签/重复点击：刷新后候选与 current 投影一致；重复采用安全 replay；跨设备未证明。
- 失败/取消/重试/重启：stale/冲突/失效路径通过；进程重启未证明。
- 回归范围：shared、API、admin unit/DOM、typecheck、远端 required checks。

测试结论：

```text
conclusion: approved
user_goal_status: passed
environment: real admin/API transport with in-memory persistence
evidence_level: E4
not_proven: real MySQL concurrency, real provider quality, media, cross-device recovery
```

## 6. 产品与质量复核

产品复核：

- 原问题场景是否可理解：是；动作说明候选池、正式采用和下一步骤。
- 结果是否可见：是；使用精确 resultVersionIds 定位并高亮。
- 下一动作是否明确：是；采用后进入对应下一步骤，历史候选不再提供误导动作。
- 是否仍有误导性能力表述：没有发现 P1；stale-page 弹窗内反馈可继续作为 P2 优化。

质量复核：

- 范围是否越界：否；未进入真实 provider、媒体或后续业务包。
- 真实环境边界：真实 MySQL 未测并明确保留在 RMD-NOV-VERSION-001；本 issue 的 E4 关闭不替代 E6。
- 租户/权限/敏感信息：actor-scoped token 与安全 DTO 通过复核。
- Git 和工作树：PR #61 正常 squash 合并，merge tree 与验收包 tree 一致。
- 是否存在未归因文件：否。

独立结论：PRODUCT `ACCEPT 0/0/2`；TEST `ACCEPT 0/0/1`；QUALITY `ACCEPT 0/0/2`。

## 7. Git 与远程

| 字段 | 内容 |
| --- | --- |
| branch | `codex/rp-05b1-candidate-result-handoff-20260802` |
| commit | PR #61 merge `91751dd1f4d08d3b4eb38971cd2f060836b98cfe` |
| upstream | `origin/main` contains merge tree `ae968dcfe283a5bdd87c1842c2648882bc1b9311` |
| changed_files | 29 |
| diff_check | passed |
| worktree_remaining | 0 for implementation package |

远端 required checks：governance 2/2、admin-dom、backend-e2e、rp01c-fixtures 全部 success；未使用 admin bypass。

## 8. 关闭裁决

```text
issue_id: RMD-NOV-UX-001
final_status: closed
closed_acceptance_ids: NOV-CANDIDATE-01,NOV-CANDIDATE-02,NOV-CANDIDATE-03,NOV-CANDIDATE-04,NOV-CANDIDATE-05,NOV-CANDIDATE-06,NOV-AI-CTA-01
residual_risks: real MySQL concurrency; event dedupe tied to display text; stale-page dialog-local feedback; equal updatedAt ordering
reopen_conditions: any original CTA is inert; exact result cannot be found; more than one formal current is shown; adoption replay duplicates decisions/logs; adoption does not reach the correct next step
decided_by: MC after independent PRODUCT, TEST and QUALITY acceptance
decided_at: 2026-08-02 CST
```

关闭解释：本 issue 的关闭条件是 E4 候选交互和结果承接，不以 mock 页面替代真实浏览器或真实 API transport。in-memory persistence 没有被用于证明真实 MySQL 唯一性；该 E6 风险继续由 `RMD-NOV-VERSION-001` 承担，因此不阻塞本 issue 关闭，也不得被本关闭记录外推。
