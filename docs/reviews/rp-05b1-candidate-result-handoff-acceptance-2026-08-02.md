# RP-05B1 小说候选动作结果承接验收记录

status: accepted_and_merged
package_id: RP-05B1
manifest_id: RP-05B1-v2
baseline_sha: 058071861598f58dbe33e1c4f4d2e3df8f2a55de
fixed_candidate_sha: d09b9aae6cef1e98bd2fb84cee30455278685fac
fixed_candidate_tree: 26dfd802b667e38fed6c6aade7d474ab254f5a99
target_issue: RMD-NOV-UX-001

## 1. 结论边界

本包已完成共享合同、API、内存仓储、Prisma 实现、管理端交互和真实浏览器原事故复验。前六轮独立门禁暴露并拒绝候选输入、权威来源、下游失效、任务结果承接、并发采用 CAS/幂等、内存审计前快照失真，以及成功重放被活动任务冲突错误拦截的问题。第七固定代码候选获 PRODUCT、TEST、QUALITY 三方 `P0=0/P1=0`；ADR 预算声明修正后，PR #61 最终 required checks 全绿并正常 squash 合并为 `91751dd`，merge tree 与验收包 tree `ae968dcf` 一致。`RMD-NOV-UX-001` 达到 E4 关闭条件；真实 MySQL、provider、media 和偏好配置继续由独立问题 ID 承担。

## 2. 验收映射

| 验收 ID | 通过证据 | 结果 |
| --- | --- | --- |
| NOV-CANDIDATE-01 | 方向和结构手动编辑均创建新版本；API 刷新后保留 `sourceVersionIds`、`changeReason`；旧版本不被覆盖 | passed_local |
| NOV-CANDIDATE-02 | 优化请求必须携带明确 instruction；方向与结构新候选展示来源版本、优化目标和差异；provider ABI 收到同一权威输入 | passed_local |
| NOV-CANDIDATE-03 | 融合使用动作返回的精确候选 ID，展示多个来源版本和融合原因；DOM 回归覆盖精确聚焦 | passed_local |
| NOV-CANDIDATE-04 | 采用时只把包含实际采用版本的任务标记为接受；其他批次归档；页面只显示一个正式版本，旧版历史化 | passed_local |
| NOV-CANDIDATE-05 | 方向采用进入设定；设定采用进入全书大纲；全书大纲采用进入阶段大纲；刷新保持一致 | passed_local |
| NOV-CANDIDATE-06 | 最近任务使用 `resultVersionIds` 切换正确步骤并聚焦精确候选；跨步骤路由等待后再恢复子步骤 | passed_local |
| NOV-AI-CTA-01 | 章节目录、试写候选沿用可观察任务和精确结果承接；不以按钮 loading 代替任务状态 | passed_local |

## 3. 自动化证据

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | shared、admin-web、api 全部通过 |
| `npm test -w @ai-shortvideo/shared` | 23/23 passed |
| `npm test -w @ai-shortvideo/api` | 126/126 passed |
| `NODE_ENV=production npm run test:dom:admin` | admin 78/78；DOM 21/21 passed |
| `npm run test:rp02b1` | 14/14 passed；覆盖严格 envelope、legacy shape 与缺失权威引用 fail-closed 合同 |
| `git diff --check` | passed |

扩展命令 `npm run test:rp02b2a2` 进入与本包无关的历史 Git 组合矩阵后耗时异常；主动终止前已通过 58 项、业务失败 0、取消 1。该中止不计为通过，也不替代本包 required checks；本包使用上表定向门禁与远端 required checks 作准入证据。

API 回归额外覆盖：

- 方向或结构多个候选批次中，仅实际采用版本所属任务获得 `userAcceptedResult=true`。
- 已采用任务指向下一步骤，未采用批次归档且不再提供错误聚焦入口。
- 结构继续优化的来源候选、instruction、request hash、source refs、worker claim、provider input 和恢复身份保持一致。
- API 套件动态覆盖 pre-RP-05B1 普通结构任务 replay、lease、recovery，且不改变旧任务身份。
- 新普通结构任务显式写入 `optimization: null`；旧任务缺少该字段时仅走兼容读取，不允许新任务用占位引用伪装成功。
- API 套件动态覆盖 historical、discarded、hard-stale、跨租户、跨小说或类型不匹配来源在任务 claim/provider 调用前失败。

## 4. 首轮独立门禁与修复

首轮固定候选 `5a43a20c378ee3f5b78d5d5a5769bfc0485d2354` / tree `6f5969a09dbc2281c3c948fae3578c4ebb5e0b37` 的独立结论为：PRODUCT `P0=0/P1=2/P2=2`，TEST `P0=0/P1=2/P2=1`，QUALITY `P0=0/P1=0/P2=2`。合并去重后存在 3 个 P1，候选拒绝准入：

1. 方向优化允许省略、`null` 或空白 instruction。
2. historical 结构版本仍可重新进入优化任务和 provider。
3. 更换正式方向后，旧方向生成的设定、大纲和章节目录仍保持 current。

修复后的可重复证据：

- 共享请求、执行 envelope、provider ABI、HTTP schema 和 service 一致要求非空 direction optimization instruction；非法输入 `provider=0/task=0/version=0`。
- 方向融合来源要求唯一；重复版本 ID 在 HTTP/service 双层拒绝。
- direction/structure 的生成 authority 只接受 candidate/current 来源；historical/discarded/hard-stale 以及跨租户、跨小说、类型不匹配来源均在 claim/provider 前失败。
- 更换正式方向时，内存与 Prisma 仓储在同一提交路径中将 setting/outline/stage_outline/chapter_plan 的 candidate/current 标为 hard-stale，并清空小说下游 current 指针。
- 新固定候选必须重新通过 PRODUCT/TEST/QUALITY 的 `P0=0/P1=0` 门禁，首轮结论不得复用为准入结论。

## 5. 第二轮独立门禁与修复

第二轮固定候选 `ed8186db0273ef21599fc9a9d46b0658501cbe1d` / tree `4160af9a1acab24950e85a8b9b864a044e327575` 的独立结论为：PRODUCT `P0=0/P1=1/P2=2`，TEST `P0=0/P1=0/P2=1`，QUALITY `P0=0/P1=0/P2=2`。PRODUCT 门禁拒绝候选准入：

1. 更换正式方向后，旧下游候选虽已 hard-stale，但其 generation task 仍为 `waiting_confirmation`，页面继续提供指向不可用候选的“查看结果”入口。
2. 生成基于当前正式方向的优化候选会立即把小说创作阶段回退到方向阶段，而不是等用户采用后再使下游资产失效。
3. Prisma 采用路径的 `OperationLog.impactSummary` 与内存实现不一致，且正式方向的 `staleLevel` 未显式恢复为 `none`。

第二轮修复后的可重复证据：

- 更换正式方向时，内存与 Prisma 在同一事务语义中归档命中失效下游版本的 `waiting_confirmation` 任务，清空 active claim，保留 `userAcceptedResult=false`，并写入明确的过期归档步骤和事件。
- 已完成且曾被采用的历史任务继续保留 `userAcceptedResult=true`，避免为清理待确认入口而篡改历史审计事实。
- 在已有正式方向时，生成方向候选或优化候选不再回退当前创作阶段；后续阶段采用方向候选时，只允许来源引用包含当前正式方向的候选。
- Prisma 采用路径显式将新正式方向 `staleLevel` 恢复为 `none`，并记录与实际下游失效影响一致的操作摘要。
- API 回归在一条权威链路中同时覆盖阶段保持、合法优化候选采用、下游版本 hard-stale、待确认任务归档和已采用历史任务保真。

第三个固定候选必须重新通过 PRODUCT/TEST/QUALITY 的 `P0=0/P1=0` 门禁，第二轮 TEST/QUALITY 的准入结论不得跨候选复用。

## 6. 第三轮独立门禁与修复

第三轮固定候选 `01c9f949e51c800fdfdbd40e1cff85de3fc77327` / tree `9cae8dc92e6e10d2135745f18423ad47199a4d54` 的独立结论为：PRODUCT `P0=0/P1=1/P2=1`，TEST `P0=0/P1=1/P2=1`，QUALITY `P0=0/P1=0/P2=2`。PRODUCT 和 TEST 均拒绝候选准入：

1. 已因替换正式设定而先进入 hard-stale 的待确认大纲，不在后续方向变更的失效版本 ID 集合中；任务仍停留在 `waiting_confirmation`，继续暴露无效结果入口。
2. 后端归档步骤的真实文案是 `候选因方向变更已过期并归档`，前端只匹配连续字符串 `已归档`，因此无法识别该任务已不可用。
3. 历史任务保留 `userAcceptedResult=true` 是正确审计事实，但其采用结果失效后仍可能被界面解释为当前下一步。

第三轮修复后的可重复证据：

- 方向变更先收集该小说全部 setting/outline/stage_outline/chapter_plan 版本 ID，再只对 candidate/current 版本执行 hard-stale；已先 stale 的版本仍能命中并归档待确认任务。
- 已完成且曾采用的下游任务保留 `userAcceptedResult=true`，同时写入 `历史采用结果已失效（上游方向变更）` 和 `task_result_invalidated` 事件，区分历史事实与当前可用性。
- 管理端对包含 `归档` 或 `已失效` 的任务均不再提供结果承接入口，回归使用后端真实归档文案而非人为简化文案。
- API 回归先通过替换正式设定制造 hard-stale 大纲，再更换方向，证明该任务从 `waiting_confirmation` 转为归档；同时证明两个历史采用任务仍为 accepted，但已显式失效。

第四固定代码候选为 `0d9884fcc62caa7fc6812fb28bc0124d2468e153` / tree `8e140bdcafae8665321d36130da747f4eb6ef73c`。必须重新通过 PRODUCT/TEST/QUALITY 的 `P0=0/P1=0` 门禁，第三轮 QUALITY 的准入结论不得跨候选复用。

## 7. 第四轮独立门禁与修复

第四轮固定候选 `0d9884fcc62caa7fc6812fb28bc0124d2468e153` / tree `8e140bdcafae8665321d36130da747f4eb6ef73c` 的独立结论为：PRODUCT `P0=0/P1=0/P2=2`，TEST `P0=0/P1=0/P2=1`，QUALITY `P0=0/P1=1/P2=2`。QUALITY 拒绝候选准入：

1. direction adopt 在事务外校验 `currentDirectionVersionId`，Prisma 虽锁小说行却继续使用旧 `input.novel`，两个同时基于 D0 的 D1/D2 采用请求可能都成功。
2. 采用动作没有操作者作用域幂等键；第一次成功后候选已不再是 candidate，同一请求重试只能冲突，无法返回原成功结果。
3. 已失效历史采用任务在后续方向再次变化时可能重复追加 `task_result_invalidated` 事件。

第四轮修复后的可重复证据：

- 请求明确携带 `currentVersionId` 和 `idempotencyKey`；前端在每次打开采用对话框时生成一次稳定动作键，同一次确认重试不更换。
- service 生成包含 tenant、user、action、novel 和动作键的不可逆 token，并冻结候选、预期当前版本、确认和原因的 request hash；原始幂等键不写入审计记录。
- Prisma 在小说行 `FOR UPDATE` 后重新读取小说和候选，先处理同 token 重放/指纹冲突，再对锁内当前版本执行 CAS；新键或旧页面版本不能覆盖后来正式版本。
- 同请求且其成功结果仍是 current 时返回原 decision/log，不产生第二次写；正式方向后来变化后，旧重放返回版本冲突，不把状态倒退。
- API 动态回归覆盖同键同指纹重放、同键异指纹冲突、旧页面版本冲突、连续两次方向更换，以及每个历史采用任务只保留一个失效事件。
- 第五固定代码候选为 `54874e50beb46ffd028f9017d56149714762ec6c` / tree `7f23e41eda70d72ccd2bf573f0ecafd7e34da877`；第四轮 PRODUCT/TEST 结论不得跨候选复用。

## 8. 第五轮独立门禁与修复

第五轮固定候选 `54874e50beb46ffd028f9017d56149714762ec6c` / tree `7f23e41eda70d72ccd2bf573f0ecafd7e34da877` 的独立结论为：TEST `P0=0/P1=0/P2=1`，QUALITY `P0=0/P1=1/P2=2`；QUALITY 拒绝候选准入：

1. 内存仓储中的 `storedNovel` 是可变引用，方向采用先调用 `mutateNovel`，随后才从该引用构造 `beforeSnapshot`。
2. 因此采用前真实状态 `direction/waiting_user` 被错误记录为采用后状态 `setting/not_started`，内存与 Prisma 审计语义不一致。

第五轮修复后的可重复证据：

- 在任何 creative version、novel 或 task mutation 前冻结 `currentVersionIdBefore`、`creationStageBefore` 和 `stageStatusBefore`。
- 操作日志只使用冻结前态构造 `beforeSnapshot`，`afterSnapshot` 继续记录采用后的确定状态。
- API 路由回归直接断言采用审计从 `direction/waiting_user/null` 转为 `setting/not_started/<candidateId>`，防止可变引用再次污染前态。
- 第六固定代码候选为 `6daee87c5815ce089bcfc6049c47a4fdc6bce720` / tree `9ced4710a5fcac754993cf1a8032db3c8bd3a97e`；第五轮 TEST 结论不得跨候选复用。

## 9. 第六轮独立门禁与修复

第六轮固定候选 `6daee87c5815ce089bcfc6049c47a4fdc6bce720` / tree `9ced4710a5fcac754993cf1a8032db3c8bd3a97e` 的最终结论为：TEST `P0=0/P1=0/P2=2`，QUALITY `P0=0/P1=0/P2=2`，PRODUCT `P0=0/P1=1/P2=2`；PRODUCT 拒绝候选准入：

1. 内存与 Prisma 仓储均先检查活动任务冲突，再查找已成功的 adoption replay。
2. 首次采用成功并启动设定生成后，同一采用请求重放返回 `409 CONFLICT_TASK_EXISTS`，而不是原 decision/log。

第六轮修复后的可重复证据：

- 内存仓储先读取已持久化小说、候选和 adoption decision；确认不是成功重放后才检查活动任务。
- Prisma 先锁小说权威根，再读取锁内小说、候选和 adoption decision；确认不是成功重放后才查询活动任务，未削弱并发串行化。
- API 动态回归模拟活动生成任务存在时重放原采用请求，断言仍返回 `200`，decision 和 adoption log 均保持 1 条。
- 同 token 异指纹仍优先返回 `IDEMPOTENCY_CONFLICT`；新采用请求在活动任务期间仍返回冲突。
- 第七固定代码候选为 `d09b9aae6cef1e98bd2fb84cee30455278685fac` / tree `26dfd802b667e38fed6c6aade7d474ab254f5a99`；第六轮 TEST/QUALITY 结论不得跨候选复用。

## 10. 真实浏览器原事故复验

环境：`http://127.0.0.1:5183` + mock API `http://127.0.0.1:3011`；测试小说 `novel_000001`，标题 `RP05B1 浏览器验收小说`。

1. 生成 4 个方向候选后，页面直接定位新结果，最近任务显示“有新结果待确认”。
2. 采用方向 v1 后自动进入设定；重新打开方向页时，v1 标记为“正式采用版本”，其余候选标记为“历史版本”。
3. 在已采用方向上点击“基于当前优化”，填写 `强化前三秒冲突，并保留系统能力边界`，生成 v5；页面展示来源 `v1` 和同一变更原因，未覆盖 v1。
4. 采用 v5 后进入设定，正式方向刷新为 v5；生成并采用设定后进入全书大纲。
5. 生成全书大纲 v1，点击“查看大纲候选”后页面滚动并高亮精确卡片，而不是无响应或定位列表第一项。
6. 点击“继续优化”，填写 `把反派资源链提前到第一阶段，并让中段每五章出现一次实质反转`，生成 v2；页面展示来源 v1、原样优化目标以及标题/摘要差异。
7. 采用 v2 后自动进入阶段大纲；返回全书主线时 v2 为唯一“正式采用版本”，v1 为“历史版本”且无采用动作。

截图证据：

- `/tmp/rp05b1-adopted-direction-optimized.png`
- `/tmp/rp05b1-outline-result-focus.png`
- `/tmp/rp05b1-outline-optimized-provenance.png`
- `/tmp/rp05b1-outline-current-history.png`

## 11. 预算与未覆盖项

- 当前变更文件数：29，等于经第四轮 P1 强制扩展后的 `hard_max_files=29`；新增 5 个文件均是现有采用调用方或治理回归，不引入新业务面。
- 当前净新增：`2661 - 258 = 2403` 行，低于 `hard_max_net_additions=3200`。
- 未连接真实 MySQL，因此不关闭 `RMD-NOV-VERSION-001`，也不外推数据库并发唯一性。
- 未调用真实模型，因此不证明真实 provider 输出质量、时延或费用表现。
- 未执行跨设备恢复、长章节 checkpoint 或后续视频业务包。

## 12. 门禁完成记录

1. 固定代码候选 `d09b9aa` / tree `26dfd802`，最终文档 tree `ae968dcf`。
2. PRODUCT、TEST、QUALITY 对同一代码候选均清零 P0/P1。
3. PR #61 最终 required checks 全绿。
4. 已正常 squash 合并为 `91751dd`，未使用 admin bypass。
5. 唯一问题总账按独立关闭记录更新，不外推其他问题状态。

## 13. 第七轮独立门禁与治理修正

- PRODUCT：`ACCEPT / P0=0 / P1=0 / P2=2`。
- TEST：`ACCEPT / P0=0 / P1=0 / P2=1`。
- QUALITY：`ACCEPT / P0=0 / P1=0 / P2=2`。
- 三方共同保留真实 MySQL 事务隔离、锁等待和并发竞争未动态验证的风险；不得据此关闭 `RMD-NOV-VERSION-001`。
- PR #61 在远端最终 tree `566365619b4a6f4a6116803b3efc3123ed2a5a2c` 上的首轮业务检查均通过；治理检查指出 ADR `exceeded_budget` 只声明 `changed_files`，而脚本实际识别 `changed_files,net_additions` 两项默认阈值超限。
- ADR 已按实际治理违规项修正为 `changed_files,net_additions`；未提高 `hard_max_files=29` 或 `hard_max_net_additions=3200`，也未改变代码候选。
