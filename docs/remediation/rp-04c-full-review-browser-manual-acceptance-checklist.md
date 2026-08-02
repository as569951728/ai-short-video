# RP-04C 全书审稿浏览器人工验收清单

## 1. 文档定位

| 字段 | 内容 |
| --- | --- |
| package_id | RP-04C |
| contract | `docs/remediation/rp-04c-full-review-evidence-contract.md` |
| target_issue_id | RMD-NOV-REVIEW-001 |
| acceptance_surface | 现有管理端 UI、浏览器 Network、Console、Storage |
| execution_mode | 人工清单 + 可重复 Playwright（本地内存仓储、确定性延迟 provider） |
| current_status | `candidate_for_independent_review` |

本文只把已冻结的 RP-04C 证据合同转换成可执行的浏览器验收步骤，不修改代码，不扩大本包范围，也不形成 `approved` 结论。浏览器验收只能证明浏览器可观察到的行为；合同要求但当前 UI 无法证明的内容必须保留为 `NOT_PROVEN`，由 API、确定性测试、provider spy、受控真实模型 canary 或独立复核补证。

## 2. 结论词汇

每个步骤只能使用以下结果：

- `PASS`：本步骤所有可观察断言均有证据。
- `FAIL`：行为或证据与预期不一致。
- `BLOCKED`：环境、账号、fixture 或模型能力不可用，未执行到断言点。
- `NOT_PROVEN`：当前 UI 和浏览器证据天然无法证明，不能降级写成通过。
- `NOT_RUN`：尚未执行。

整包浏览器验收结束时只允许给出 `needs_revision`、`blocked` 或 `candidate_for_independent_review`。本文执行者不得使用 `approved`；`approved` 留给独立 TEST、PRODUCT、QUALITY 在浏览器证据与非 UI 证据全部齐备后分别给出。

## 3. 执行变量与前置条件

执行前由主控填写：

```text
ADMIN_ORIGIN=http://localhost:5173
API_ORIGIN=http://localhost:3001
NOVEL_ID=<受控 RP-04C fixture 小说 ID>
FULL_REVIEW_URL=${ADMIN_ORIGIN}/novels/${NOVEL_ID}?step=fullReview
FIXTURE_VERSION=<固定 fixture 版本>
EXPECTED_CHAPTER_COUNT=<至少 12>
EXPECTED_CHAPTER_RANGE=1-<EXPECTED_CHAPTER_COUNT>
EXPECTED_CONFLICTS=人物状态冲突,时间线冲突,关键事实冲突
SAFE_BODY_CANARY=<正文中只用于泄露扫描的短标记，不记录完整正文>
MODEL_ROUTE=<受控真实模型路由或 deterministic provider>
MAX_PAID_CALLS=1
```

必须满足以下前置条件，否则本轮记为 `BLOCKED`：

1. 管理端和 API 均可访问，使用有小说查看、审稿和完结确认权限的测试账号。
2. `NOVEL_ID` 指向固定、可重置的 RP-04C fixture；正式目录至少 12 章且章节连续。
3. fixture 已采用正式章节目录、正式正文、feature card、单章 review 和长期 memory。
4. fixture 内含合同规定的三类固定冲突和至少一个相似但不冲突的对照事实。
5. 本轮若使用真实模型，已固定模型、prompt 版本、策略版本和费用上限，且禁止自动付费重试。
6. fixture 初始状态未完结，并且没有其他互斥小说任务正在运行。
7. 能识别本轮 provider 调用计数和费用记录；这两项不是 UI 证据，但必须留给后续非 UI 补证。

### 3.1 可重复自动化入口

在仓库根目录执行：

```bash
npm run e2e:rp04c
```

该命令必须满足以下边界：

1. 启动独立随机端口的 API 与 Admin，不复用开发者已有服务。
2. API 使用本地 in-memory repository 与 deterministic delay provider；禁止连接真实 MySQL、真实模型、对象存储或媒体服务。
3. 串行执行 M-01 至 M-11，任一断言失败时进程非零退出。
4. 不生成 HAR、trace、截图或视频；只写入 `output/playwright/rp-04c/<runId>/safe-evidence.json`。
5. 安全摘要只包含 Git 身份、fixture 版本、计数、ID、hash、状态与隐私命中数，不包含正文、prompt、raw response、认证头或密钥。
6. 自动化全通过时浏览器结论最高为 `candidate_for_independent_review`；真实 E5、真实数据库与独立复核仍按非 UI 边界单独验收。

最新成功运行 `rp04c-2026-08-02T22-08-55-173Z` 使用 45 秒确定性延迟 provider，Playwright 1/1 通过，M-01 至 M-11 全部 `PASS`。安全摘要记录 `worktree.dirty=false`，并绑定候选 SHA `e49857ba99299a0a943bd95de52c42de5bec0bd4` 与 tree `57c798b0b10a025966ca1568914f93ee24f1151d`；本轮浏览器结论最高仍为 `candidate_for_independent_review`。E5 仍为 `BLOCKED`，E6 仍为 `NOT_PROVEN`，`approval=NOT_ISSUED`。安全摘要与边界见 `docs/remediation/rp-04c-full-review-browser-evidence-20260802.md`。

## 4. 浏览器证据采集约束

### 4.1 允许保存

- 当前 URL、页面步骤名、按钮状态和安全截图。
- Network 的方法、路径、状态码、耗时和安全字段名。
- `taskId`、`requestId`、`reviewReportId`、`fullReviewGateId`、版本 ID 和安全错误码。
- 状态变化时间点、刷新前后任务 ID、报告 ID 和 gate 结果。
- 三类固定冲突的标题、严重级别、涉及章节号和最小必要安全摘要。

### 4.2 禁止保存

- API Key、认证头、Cookie、Bearer token。
- 完整 prompt、完整正文、完整 feature/review/memory。
- 完整 provider 原始响应或可还原正文的大段片段。
- 含上述内容的 HAR、trace、console dump、失败截图或附件。

Playwright 执行时不要无筛选保存全量 HAR 或 response body。敏感扫描只记录“匹配项名称、出现位置类别、是否命中”，不得把命中的秘密或正文原文写入报告。

## 5. 本包必须

以下步骤按顺序执行。步骤中的“查看响应”只允许检查字段、计数、ID 和安全摘要，不允许把完整响应复制进验收产物。

### M-01 进入全书审稿并核对前置状态

- URL：`${FULL_REVIEW_URL}`
- 动作：
  1. 新建干净浏览器上下文并登录。
  2. 直接打开 URL，不从其他步骤绕行。
  3. 等待小说详情首屏和“全书质检/全书审稿”步骤稳定。
  4. 在 Network 中确认小说详情请求来自 `${API_ORIGIN}`，状态为 200。
- 预期：
  - 页面显示目标 fixture 小说，不是另一部小说或静态示例。
  - 当前步骤为全书审稿，页面无全局错误。
  - “全书 AI 审稿”入口存在；满足前置条件时可点击。
  - “确认小说完成”在新报告允许前不可直接完成小说。
  - 页面不展示完整正文、API Key、prompt 或 provider 原始响应。
- 失败判定：目标小说不一致、入口缺失、页面依赖 mock 静态数据、完结可绕过审稿，均为 `FAIL`。
- 证据：安全首屏截图、详情请求方法/路径/状态、小说 ID、当前阶段。

### M-02 发起前确认和取消无副作用

- URL：`${FULL_REVIEW_URL}`
- 动作：
  1. 点击“全书 AI 审稿”。
  2. 记录确认弹窗内的小说、小说版本、正式章节数和当前阶段。
  3. 首次点击“取消”。
  4. 观察 Network 5 秒。
- 预期：
  - 弹窗明确说明：基于全部正式正文生成审稿报告、问题和 gate；不会自动完结或自动进入视频化。
  - 章节数等于 `EXPECTED_CHAPTER_COUNT`，不能是 0、部分章节数或仅当前页章节数。
  - 取消后不产生 `POST /novels/${NOVEL_ID}/full-review`。
  - 取消后不创建新任务、不改变完结状态。
- 失败判定：章节数错误、取消仍发起请求、文案暗示自动完结，均为 `FAIL`。
- 证据：不含正文的确认弹窗截图、取消后 POST 请求计数 0。

### M-03 单次确认发起

- URL：`${FULL_REVIEW_URL}`
- 动作：
  1. 再次点击“全书 AI 审稿”。
  2. 在确认弹窗中点击确认一次，之后不重复点击。
  3. 从点击前开始监听 `POST /novels/${NOVEL_ID}/full-review`。
  4. 只检查请求字段名和安全值，不保存认证头或完整 body。
- 预期：
  - 只产生 1 个 POST。
  - 请求包含幂等键和预期小说版本等安全并发控制字段。
  - 浏览器请求体不包含完整正文、API Key、prompt、messages 或 provider 原始字段。
  - 页面立即进入可理解的等待状态，而不是只有按钮 spinner。
  - 发起后审稿按钮不可再次触发第二个请求。
- 失败判定：一次确认产生多个 POST、可连续重复发起、请求携带完整正文或秘密，均为 `FAIL`。
- 证据：POST 次数、路径、状态、耗时、请求安全字段名、等待态截图。

### M-04 长耗时任务状态

- URL：`${FULL_REVIEW_URL}`
- 动作：
  1. 在请求尚未完成时持续观察页面至少 15 秒。
  2. 每 5 秒记录一次状态文本、当前步骤、耗时和进度表现。
  3. 观察详情轮询请求，但不手动重复发起审稿。
- 预期：
  - 页面显示“生成中/处理中”等明确状态、当前动作和已耗时。
  - 页面提示模型调用可能需要较长时间，允许用户稍后回来。
  - 未知真实进度时使用不定进度，不伪造 12%、38% 等确定百分比。
  - 页面仍可使用“刷新”和“任务详情”等安全操作。
  - 轮询不会产生第二个 full-review POST。
- 失败判定：只有 spinner、伪造精确百分比、无状态说明、轮询导致重复付费请求，均为 `FAIL`。
- 证据：两个不同时间点的等待态截图、状态时间线、full-review POST 累计次数。

### M-05 运行中任务详情

- URL：`${FULL_REVIEW_URL}`
- 动作：
  1. 在任务仍运行时点击“任务详情”或“查看详情”。
  2. 记录抽屉或详情区显示的 task ID、request ID、状态和事件时间线。
  3. 监听 `GET /tasks/:taskId` 和 `GET /tasks/:taskId/events`。
- 预期：
  - 后端已创建任务时，任务 ID 不是 `local-*`，详情请求成功。
  - 状态、当前步骤和事件顺序可理解，事件没有重复或倒序。
  - 详情只展示安全错误和安全摘要，不展示完整正文、prompt、API Key、认证头或 raw response。
  - 若当前只存在 `local-*` 合成任务，页面可以说明客户端等待，但“后端任务已持久化”必须记为 `NOT_PROVEN`，不能把本步骤写成完整通过。
- 失败判定：详情按钮无效果、后端 task ID 存在但详情失败、详情泄露敏感内容，均为 `FAIL`。
- 证据：安全任务详情截图、task ID、request ID、任务/事件请求状态。

### M-06 刷新恢复与多标签幂等

- URL：`${FULL_REVIEW_URL}`
- 动作：
  1. 在任务仍为 waiting/processing 时执行浏览器硬刷新。
  2. 页面恢复后等待最多 10 秒，记录任务状态和 task ID。
  3. 用同一浏览器上下文新开第二个标签页并访问相同 URL。
  4. 两个标签页各观察 10 秒，不点击重新生成。
  5. 统计整个过程的 full-review POST 数。
- 预期：
  - 刷新后仍停留在 `step=fullReview`。
  - 等待状态被恢复，不重新显示为“可发起”并诱导重复付费。
  - 若后端 task ID 已出现，刷新前、刷新后和第二标签页看到同一个 task ID。
  - 两个标签页都不产生新的 full-review POST。
  - 刷新不会把小说标记完成，也不会清空已经生成的候选报告。
- 失败判定：刷新丢失任务、出现第二个 task ID、累计 POST 超过 1、第二标签可重复发起，均为 `FAIL`。
- 证据：刷新前后及第二标签页的 task ID/状态、POST 累计次数、恢复时间。

### M-07 候选报告到达且不自动完结

- URL：`${FULL_REVIEW_URL}`
- 动作：
  1. 等待本轮任务到 terminal；受控真实模型最多等待本轮规定的超时时间。
  2. 点击页面“刷新”或等待自动刷新。
  3. 记录最新审稿报告 ID、版本、总分、评级、摘要、gate 和问题数。
  4. 如页面提供“查看结果”，点击并确认滚动或定位到报告区域。
- 预期：
  - 页面出现本轮生成的最新报告，而不是旧报告或空白成功态。
  - 报告至少显示总分/评级、摘要、gate 结论和问题列表。
  - 本轮报告 ID 与刷新后详情/latest 接口返回的最新报告一致。
  - 生成报告后小说仍未自动完结，也未自动进入视频化。
  - 报告是待用户处理的审稿结果；生成成功不等于审稿通过或小说完结。
- 失败判定：任务成功但无报告、报告属于旧任务、生成后自动完结/视频化，均为 `FAIL`。
- 证据：安全报告截图、report ID、版本、问题数、gate、任务 ID。

> 当前页面只展示一个 `latestFullReview`，没有可见的多版本候选池、历史列表或“采用报告”状态机。因此本步骤只能证明“新报告可见且未自动完结”，不能证明完整候选报告版本治理；该限制必须同时登记在 N-01。

### M-08 固定冲突与正文证据最小展示

- URL：`${FULL_REVIEW_URL}`
- 动作：
  1. 展开或逐条查看问题列表。
  2. 按 fixture 基准寻找人物状态、时间线、关键事实三类冲突。
  3. 对每类只记录问题标题、严重级别、涉及章节号和最小必要建议摘要。
  4. 检查相似但不冲突的对照事实未被标成 blocking。
- 预期：
  - 三类固定冲突均有对应问题。
  - 人物状态冲突为 blocking，且关联正确的前后章节。
  - 时间线与关键事实冲突关联正确章节并给出可执行修复建议。
  - 对照事实不被误判为 blocking。
  - UI 不展示完整章节正文；允许的证据片段必须是定位冲突所需的最小片段。
- 失败判定：任一固定冲突漏报、章节定位错误、对照事实误报 blocking、展示完整正文，均为 `FAIL`。
- 证据：三类冲突核对表、安全问题截图、误报/漏报计数。

> 如果当前 UI 不显示问题的 `scopeRefs` 或章节号，则“页面看见冲突”可以检查，但“正确定位章节”必须记为 `NOT_PROVEN`，不能从描述文字猜测。可在 Network 中安全核对 `issues[].scopeRefs` 后将其列为浏览器/API 联合证据，但仍要记录 UI 缺口。

### M-09 Blocking gate 与完结阻断

- URL：`${FULL_REVIEW_URL}`
- 动作：
  1. 保持 blocking 问题未解决，不点击“接受风险”或“强制通过”。
  2. 查看 gate 文案、blocking 数量和“确认小说完成”状态。
  3. 尝试通过正常 UI 操作触发完结；不要用 DevTools 修改 DOM，不直接伪造 API 请求。
  4. 监听 `POST /novels/${NOVEL_ID}/completion/confirm`。
- 预期：
  - gate 明确显示阻断，`allowCompletion=false`。
  - blocking 问题使用明确的危险/阻断状态，而不是普通提示。
  - “确认小说完成”不可点击，或点击后被明确阻断并说明原因。
  - 过程中 completion/confirm POST 数为 0。
  - 页面不因为审稿任务完成而把小说显示为“已完结”。
- 失败判定：存在 blocking 仍可确认完结、产生 completion POST、只显示模糊失败无阻断原因，均为 `FAIL`。
- 证据：gate 与禁用按钮同屏截图、`allowCompletion`、blocking 数量、completion POST 计数 0。

### M-10 终态任务详情和刷新稳定性

- URL：`${FULL_REVIEW_URL}`
- 动作：
  1. 打开本轮任务详情，记录终态、事件和安全结果摘要。
  2. 关闭详情并硬刷新页面。
  3. 再次打开报告和任务详情。
  4. 比较刷新前后的 task ID、report ID、gate ID、版本和 blocking 数量。
- 预期：
  - 任务终态与报告存在相互一致，不出现“任务失败但报告成功”或相反状态。
  - 事件时间线可解释从发起到终态的过程。
  - 刷新前后 task/report/gate ID 和版本保持一致。
  - blocking gate 和完结阻断在刷新后继续生效。
  - 刷新不重放 POST、不产生新报告、不增加任务。
- 失败判定：身份或版本漂移、刷新后 gate 消失、重复生成报告，均为 `FAIL`。
- 证据：刷新前后 ID 对照表、终态详情截图、POST 累计次数。

### M-11 浏览器侧敏感信息与正文泄露扫描

- URL：`${FULL_REVIEW_URL}`
- 动作：
  1. 扫描页面可见文本和 DOM 属性。
  2. 扫描 Console 的 log/warn/error。
  3. 扫描 localStorage、sessionStorage 和非 HttpOnly Cookie 的键名与安全摘要。
  4. 对以下请求的请求/响应 JSON 递归扫描字段名和短标记：小说详情、full-review、full-review/latest、task、task events、completion confirm。
  5. 使用禁止模式：`apiKey`、`authorization`、`Bearer`、`DEEPSEEK_API_KEY`、`rawResponse`、`providerResponse`、`providerBody`、`prompt`、`messages`、`SAFE_BODY_CANARY`。
- 预期：
  - 页面、Console、Storage 中不出现 API Key、认证头、完整 prompt、完整正文或 raw provider response。
  - 普通浏览器 API 响应不包含完整正文、完整 provider 请求/响应或密钥。
  - 任务详情和错误提示只包含安全错误码与脱敏摘要。
  - 如问题证据包含正文片段，只能是最小必要片段，不能构成整章或大段正文。
- 失败判定：任一秘密、认证信息、完整正文、完整 prompt 或 raw response 出现在上述浏览器表面，均为 `FAIL`，并立即停止保存更多 artifact。
- 证据：各表面“命中 0/非零”的统计和命中的字段名类别；禁止记录命中原文。

### M-12 浏览器验收汇总但不提前批准

- URL：不适用。
- 动作：
  1. 汇总 M-01 至 M-11 的状态与证据链接。
  2. 单独列出所有 `NOT_PROVEN` 和 `BLOCKED`。
  3. 核对 N-01 至 N-09 是否已由其他证据拥有者补证。
- 预期：
  - 任一 MUST 步骤为 `FAIL`，整包结论为 `needs_revision`。
  - 任一合同关闭条件仍为 `NOT_PROVEN/BLOCKED`，整包不得写 `approved`。
  - 全部浏览器步骤通过但非 UI 证据未齐时，最高只能写 `candidate_for_independent_review`。
- 证据：第 8 节结果模板。

## 6. 非目标

以下内容本轮浏览器清单不执行，也不得借结果宣称完成：

1. 修复或重做全书审稿 UI、候选状态机、任务系统或完结流程。
2. 解决 Prisma/MySQL 全书审稿写路径和完结确认真实数据库 E2E。
3. 验证独立 worker、heartbeat、进程重启恢复、retry child 或 HTTP 202 transport。
4. 点击“标记解决”“接受风险”或“填写原因强制通过”来清空本轮 blocking fixture。
5. 自动完结小说、生成正文、进入视频化、生成语音/字幕/媒体或发布。
6. 使用无限费用、自动付费重试、批量真实模型调用或生产流量。
7. 用 mock、静态 JSON、页面 loading、绿色 toast 或任务 `completed` 标签替代合同证据。
8. 修改 DOM、绕过 disabled、直接伪造 completion API 来测试未授权攻击面。
9. 审批 RP-04C、关闭总账问题或更新 issue ledger。

## 7. 当前 UI 无法证明

以下项目即使 M-01 至 M-12 全部表现正常，也必须保留为非 UI 补证，不能写成浏览器通过：

| ID | 当前 UI 无法证明的合同条件 | 所需补充证据 |
| --- | --- | --- |
| N-01 | 多版本候选报告池、候选历史、采用/废弃治理 | API/仓储测试或后续 UI；当前仅有 `latestFullReview` |
| N-02 | 全部计划章节在 `coverageManifest` 中恰好一次、四类证据计数一致 | manifest 结构断言、固定 fixture 测试和安全摘要 |
| N-03 | provider payload 确实包含正文分层证据、feature/review/memory 和同一 `manifestHash` | provider spy 或受控请求摘要；不得保存完整 payload |
| N-04 | 缺失、重复、stale、memory 过期和上下文截断在 provider 前 fail closed，provider 增量为 0 | 确定性负向测试、provider spy、task/result/asset 增量断言 |
| N-05 | 刷新、多标签、网络重放下真实付费 provider 调用数和费用记录数均为 1 | provider 调用计数、费用记录、task/asset/event 计数；浏览器只能证明 POST 数 |
| N-06 | 使用的确为固定真实模型而非 mock，E5 canary 满足 token、费用、schema 和证据引用要求 | E5 安全摘要、模型路由、promptVersion、调用次数和独立复核 |
| N-07 | API Key、完整正文、prompt、raw response 未进入服务端普通日志或测试 artifact | 服务端日志扫描、artifact 扫描和隐私审计；浏览器只能证明客户端表面 |
| N-08 | 完结阻断在直接 API、并发和仓储事务层同样 fail closed | service/route/仓储并发测试及真实数据库证据 |
| N-09 | 任务在进程重启、worker 恢复和未知 provider 结果下不重复付费 | 任务恢复专项合同与测试，不属于 RP-04C 浏览器 UI 证据 |

## 8. Playwright 执行结果模板

主控稍后执行时，每一步填写一行，不得省略失败截图或把 `NOT_PROVEN` 改写为通过：

```text
RP-04C_BROWSER_ACCEPTANCE
git_sha:
fixture_version:
novel_id:
model_route_safe_name:
started_at:
finished_at:

M-01: NOT_RUN | evidence=
M-02: NOT_RUN | full_review_post_count_after_cancel=
M-03: NOT_RUN | task_id= | full_review_post_count=
M-04: NOT_RUN | observed_states= | fake_exact_percent_seen=
M-05: NOT_RUN | backend_task_id= | task_detail_safe=
M-06: NOT_RUN | task_id_before= | task_id_after= | second_tab_task_id= | post_count=
M-07: NOT_RUN | report_id= | report_version= | gate_id= | issue_count=
M-08: NOT_RUN | person_conflict= | timeline_conflict= | fact_conflict= | control_false_positive=
M-09: NOT_RUN | allow_completion= | blocking_count= | completion_post_count=
M-10: NOT_RUN | ids_stable_after_refresh= | duplicate_post_or_asset=
M-11: NOT_RUN | dom_hits= | console_hits= | storage_hits= | network_hits=
M-12: NOT_RUN

NOT_PROVEN:
- N-01 ...

BLOCKED:
- none

FAILURES:
- none

browser_conclusion: needs_revision | blocked | candidate_for_independent_review
approval: NOT_ISSUED
```

## 9. 最终判定规则

1. M-01 至 M-11 任一项 `FAIL`：返回研发修复，浏览器结论为 `needs_revision`。
2. 关键环境或受控 fixture 不可用：浏览器结论为 `blocked`，不得用其他小说临时替代。
3. M-01 至 M-11 全部 `PASS`：只说明现有 UI 用户旅程具备候选资格，结论最多为 `candidate_for_independent_review`。
4. N-02 至 N-08 中任何合同关闭条件没有补证：RP-04C 仍然不能申请关闭。
5. 只有浏览器证据、确定性测试、provider/费用证据、E5 canary、日志隐私检查全部齐备，并获得独立 TEST、PRODUCT、QUALITY 结论后，才可由主控另行发起审批；本文永不提前给出 `approved`。
