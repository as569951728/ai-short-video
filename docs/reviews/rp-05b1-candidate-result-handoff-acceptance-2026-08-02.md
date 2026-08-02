# RP-05B1 小说候选动作结果承接验收记录

status: implementation_verified_pending_independent_re_review
package_id: RP-05B1
manifest_id: RP-05B1-v2
baseline_sha: 058071861598f58dbe33e1c4f4d2e3df8f2a55de
fixed_candidate_sha: 01c9f949e51c800fdfdbd40e1cff85de3fc77327
fixed_candidate_tree: 9cae8dc92e6e10d2135745f18423ad47199a4d54
target_issue: RMD-NOV-UX-001

## 1. 结论边界

本包已完成共享合同、API、内存仓储、Prisma 实现、管理端交互和真实浏览器原事故复验。首轮独立 PRODUCT/TEST 门禁发现 3 个 P1；第二轮 PRODUCT 又发现“上游方向变更后旧下游待确认任务仍提供无效入口”这个 P1，两个候选均未获准入。对应修复和负向回归已完成，等待第三个固定候选的独立复验。远端 required checks 和正常合并尚未完成，因此总账保持 `10/43`、`PB 0/7`、`RB 0/12`，不得提前关闭 `RMD-NOV-UX-001`。

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

## 6. 真实浏览器原事故复验

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

## 7. 预算与未覆盖项

- 当前变更文件数：24，等于 `hard_max_files=24`，未超出冻结清单。
- 当前净新增：`2150 - 231 = 1919` 行，低于 `hard_max_net_additions=3200`。
- 未连接真实 MySQL，因此不关闭 `RMD-NOV-VERSION-001`，也不外推数据库并发唯一性。
- 未调用真实模型，因此不证明真实 provider 输出质量、时延或费用表现。
- 未执行跨设备恢复、长章节 checkpoint 或后续视频业务包。

## 8. 待完成门禁

1. 冻结候选 SHA/tree。
2. 独立 PRODUCT、TEST、QUALITY 对同一候选清零 P0/P1。
3. 推送分支并创建 PR，远端 required checks 全绿。
4. 正常 squash 合并；禁止 admin bypass。
5. 合并后再按证据决定是否更新 issue ledger；未满足以上条件时账本保持不变。
