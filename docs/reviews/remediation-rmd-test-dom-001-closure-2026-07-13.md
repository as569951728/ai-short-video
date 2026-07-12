# RMD-TEST-DOM-001 整改关闭记录

## 1. 基本信息

| 字段 | 内容 |
| --- | --- |
| issue_id | RMD-TEST-DOM-001 |
| package_id | RP-01B |
| issue_class | QG |
| severity | P1 |
| owner | DEV + TEST |
| dev_thread | `019ed4ee-441a-7fa2-894d-393c7d4c527b` |
| test_thread | 待主控正式派发 |
| acceptance_ids | TEST-DOM-01 |
| environment | local Node 24.14.0 / admin-web Vitest DOM / happy-dom 20.10.6 |
| target_evidence_level | E2 + DOM runner |
| actual_evidence_level | E2 local DEV, pending independent test |

## 2. 原始问题

- 用户目标：让 admin-web 具备真实 Vue DOM/event 回归能力，覆盖 click 参数、disabled、dialog、focus 和 scroll target。
- 原始现象：admin-web 只有 `tsx --test src/**/*.test.ts` 的 Node 纯逻辑测试，无法捕获真实组件 DOM 交互。
- 用户影响：事件参数、禁用按钮、弹窗焦点和结果定位等页面问题只能靠手工验收或事后返工发现。
- 首次证据：`docs/remediation/issue-ledger.md` 中 `RMD-TEST-DOM-001`。
- 直接原因：缺少 Vue 组件 DOM runner 和生产组件交互测试。
- 系统根因：前端测试分层长期偏向 service/model，缺少组件事件语义门禁。
- 原状态：open。

## 3. 修复范围

- 修改内容：
  - 为 admin-web 增加 Vitest + Vue Test Utils + happy-dom DOM runner。
  - 新增根单命令 `npm run test:dom:admin`，命令内先构建 shared，再运行旧 admin Node tests 和 DOM tests，避免 clean checkout 依赖本地 `packages/shared/dist`。
  - 直接 mount 现有生产 SFC，不新增测试专用生产组件。
  - 新增 DOM 测试覆盖 emit 参数、disabled/loading 不触发、dialog 打开/确认/取消、Element Plus 默认焦点管理、scroll target。
  - 修正真实 DOM 点击会把 MouseEvent 传入可选参数的绑定：小说详情刷新显式调用 `loadDetail()`，视频旁白/TTS/字幕/渲染生成显式调用生成函数。
  - 针对独立 TEST 对 `95a62d4` 的 needs_revision：视频四个生成入口改为完整 payload key 集和值断言，仅允许 `idempotencyToken` 使用动态字符串 matcher；小说 `adoptDirection` 改为完整请求对象断言；dialog 关闭断言按 Element Plus `destroy-on-close=false` 语义验证 `modelValue=false`、组件不可见、body modal lock 已清除，不要求物理删除 `.el-dialog`。
  - 新增 RP-01B CI workflow，Node 固定 `24.14.0`，只调用根 `npm run test:dom:admin`。
- 修改文件：以最终 git diff 为准。
- migration：N/A，本包不涉及数据库。
- 配置变化：新增 `apps/admin-web/vitest.dom.config.ts` 与 DOM setup。
- 数据兼容：N/A。
- 安全影响：不读取真实 DB/provider/media，不上传 DOM artifacts。
- 明确未修改：不改业务接口、状态机、Prisma、真实 provider、媒体链路、RP-01C/RP-01D。

## 4. 研发证据

| 证据桶 | 命令/证据 | 结果 | not_proven |
| --- | --- | --- | --- |
| contract | `docs/remediation/acceptance-matrix.md` TEST-DOM-01 | DOM runner 覆盖 click 参数、disabled、dialog、focus、scroll target | 独立验收待执行 |
| unit | `npm run test:dom:admin` | shared build passed; old admin Node tests 77 passed; DOM tests 3 files / 10 tests passed | 独立验收待执行 |
| API | N/A | N/A | 本包不触 API |
| DB/MySQL/Prisma | N/A | N/A | 本包不触真实 DB |
| browser | DOM runner 使用 happy-dom，不是 Playwright 浏览器 | 真实 Vue DOM/event runner passed | 真实浏览器 E2E 不属于 RP-01B |
| provider | N/A | N/A | 本包不触 provider |
| media | N/A | N/A | 本包不触媒体 |
| typecheck | `npm run typecheck` | passed | 独立验收待执行 |
| build | `npm run build -w admin-web`; `npm run build:budget -w admin-web` | passed; budget passed; existing vueuse annotation and large chunk warnings remain | 独立验收待执行 |
| failure injection | DOM 负向断言：disabled/loading 不触发、四个视频生成入口完整 payload 无 MouseEvent 额外字段、小说采用请求完整对象、dialog 确认/取消后不保持可见 modal 状态、scroll/focus 不是空断言 | passed | 焦点恢复到触发按钮未在 happy-dom 中稳定证明 |
| concurrency/restart | N/A | N/A | 本包不涉及后端任务 |

研发自测结论：

```text
user_goal_status: partial
environment: local Node 24 / admin-web DOM runner
evidence_level: E2 local DEV
not_proven: independent TEST, remote CI, Element Plus dialog close focus restoration to trigger button in happy-dom
```

## 5. 独立测试证据

- 执行 acceptance ids：TEST-DOM-01
- 最新独立 TEST 反馈：`95a62d4` 返回 needs_revision / P1；本草稿仅记录 DEV 定向返工，正式 TEST 字段仍待主控再次派发后填写。
- environment：待 TEST 填写
- evidence_level：待 TEST 填写
- 命令：待 TEST 填写
- fixture：生产组件 DOM 测试
- contract：待 TEST 填写
- unit：待 TEST 填写
- API：N/A
- 浏览器 trace：N/A，RP-01B 是 Vue DOM runner
- DB/MySQL/Prisma：N/A
- API 请求/响应安全摘要：N/A
- 数据库证据：N/A
- provider 证据：N/A
- 媒体文件证据：N/A
- 刷新/多标签/重复点击：N/A
- 失败/取消/重试/重启：N/A
- 回归范围：admin-web DOM runner、旧 admin Node 测试、typecheck、治理预算

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
| upstream | `origin/codex/aishortvideo-checkpoint-20260711` |
| changed_files | 3 worktree files after TEST needs_revision rework; `npm run governance:git-budget -- --worktree` reported files=3, netAdditions=94 |
| diff_check | `git diff --check` passed |
| worktree_remaining | RP-01B uncommitted files only; no commit/push performed |

## 8. 关闭裁决

```text
issue_id: RMD-TEST-DOM-001
final_status: partial
closed_acceptance_ids:
residual_risks: independent TEST and remote CI pending
reopen_conditions: DOM runner removed; tests no longer cover TEST-DOM-01 required interactions; workflow no longer runs on admin source/config/package changes
decided_by: pending MC
decided_at: pending
```
