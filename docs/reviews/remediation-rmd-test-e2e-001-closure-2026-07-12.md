# RMD-TEST-E2E-001 整改关闭记录

draft_status: pending_independent_verification

## 1. 基本信息

| 字段 | 内容 |
| --- | --- |
| issue_id | RMD-TEST-E2E-001 |
| package_id | RP-01A |
| issue_class | QG |
| severity | P0 |
| owner | TEST + DEV |
| dev_thread | 019ed4ee-441a-7fa2-894d-393c7d4c527b |
| test_thread | 待主控派发 |
| acceptance_ids | TEST-E2E-BOOTSTRAP-01 |
| environment | local mock/in-memory API + admin-web + Playwright Chromium 1.56.1 |
| target_evidence_level | E4 automated browser |
| actual_evidence_level | pending TEST review |

## 2. 原始问题

- 用户目标：至少有一条可重复、连接真实本地 backend 的浏览器 E2E，不再只靠截图或 mock route。
- 原始现象：项目没有纳管 Playwright backend E2E 启动、seed/reset、health 等基础设施。
- 用户影响：页面验收需要手工启动和手工状态，无法稳定复现用户动作、刷新和失败路径。
- 首次证据：`docs/remediation/issue-ledger.md` 中 RMD-TEST-E2E-001；`docs/remediation/acceptance-matrix.md` 的 TEST-E2E-BOOTSTRAP-01。
- 原状态：open。

## 3. 修复范围

- 修改内容：新增 Playwright 固定配置、单命令 `npm run e2e:rp01a`、E2E 专用 API in-memory/mock server、生命周期 runner、浏览器流程、runner guard 测试和 CI 缓存工作流。
- 固定浏览器版本：根依赖固定 `@playwright/test@1.56.1`，runner 直接调用仓库本地 `node_modules/.bin/playwright`，项目配置为 Chromium。
- 启动/ready：runner 动态分配或读取端口，启动前检测占用；API `/health` 和 admin HTML ready 后才运行浏览器。
- seed/reset：每次运行启动全新的 in-memory repository，run id 写入创建小说标题；不读取/写入真实数据库，不依赖手工页面状态。
- 安全 profile：拒绝 `DATABASE_URL`、provider key、media/storage 配置；强制 `AI_PROVIDER_MODE=mock` 和 `E2E_PROFILE=rp01a-local-inmemory`。
- 浏览器流程：打开 `/novels`，确认真实 `/novels` API；通过页面创建小说草稿，确认 `/novels/drafts` 真实 API 成功；回到列表定位结果；刷新后仍可定位。
- 失败注入：health timeout、端口占用、API 启动失败、浏览器断言失败均应非零退出并清理子进程。
- trace/log：固定输出 `output/playwright/rp-01a/<runId>`；日志写入前脱敏 Authorization、Cookie、DATABASE_URL、key/token/secret、prompt/raw/model/provider response 字段；输出目录已加入 `.gitignore`。
- CI 支撑：`.github/workflows/rp01a-e2e.yml` 使用 Node 24、npm cache 与 `~/.cache/ms-playwright` Chromium cache；API/admin/shared 源码变更会触发回归；仅上传 `sanitized-upload` 中的脱敏文本产物。
- clean clone 修复：首次远程 CI run `29199259463` 失败于 `Cannot find node_modules/@ai-shortvideo/shared/dist/index.js`，原因是本地 `typecheck` 曾生成 shared dist 掩盖了 clean clone 缺失；已将 `npm run build -w @ai-shortvideo/shared` 前置进根 `npm run e2e:rp01a` 单命令，workflow 继续复用该单命令。本地已移走 `packages/shared/dist` 后复跑 `npm run e2e:rp01a` 通过；后续新远程 run 待 TEST/CI 验证。
- Prisma Client 修复：第二次远程 CI run `29200061517` 在 shared build 通过后失败于 `Cannot find apps/api/src/generated/prisma/client.js`，原因是本地 `typecheck/prisma generate` 留下的忽略产物再次掩盖 clean clone 缺失；已将 `npm run prisma:generate -w @ai-shortvideo/api` 加入根 `npm run e2e:rp01a`，位于 shared build 之后、runner 启动之前。该步骤只生成 Prisma Client，不连接、迁移或写入数据库；后续新远程 run 待 TEST/CI 验证。
- QUALITY 复审修复：2026-07-13 01:02:49 QUALITY 对独立 TEST approved 后提出 needs_revision，P1-1 为失败 trace/artifact 未脱敏且 workflow `always()` 上传范围过宽，P1-2 为 readiness fetch 无 AbortSignal、遇到 accept 但不响应的服务可能挂到 workflow timeout。已改为 runner 生成 `sanitized-upload` 文本白名单目录，CI 仅上传 `api.log`、`admin.log`、`playwright.log`、`summary.txt` 的脱敏副本，不上传 trace.zip/截图/DOM/network 原始产物；readiness 每次 fetch 使用受控 AbortSignal timeout；后续新远程 run 待 TEST/CI 验证。

明确未修改：

- 未改业务代码、Prisma、真实 DB、真实 provider、媒体、发布能力。
- 未进入 RP-01B/01C/01D。

## 4. 研发证据

| 证据桶 | 命令/证据 | 结果 | not_proven |
| --- | --- | --- | --- |
| contract | `playwright.config.mjs`、`scripts/e2e/run-playwright-backend-e2e.mjs` | 已纳管固定配置和生命周期 runner | 待独立验收 |
| unit | `npm run test:e2e:rp01a` | 通过；覆盖安全 profile、JSON/文本日志脱敏、端口占用、health timeout、stall server timeout、本地 Playwright binary guard、CI path/upload allowlist guard、shared build + Prisma generate 单命令 guard | 待独立验收 |
| API | `npm run e2e:rp01a` 中 `/health`、`GET /novels`、`POST /novels/drafts` | 通过；真实本地 API 返回统一响应并创建草稿；移走 shared dist 和 Prisma Client 后，单命令先 build shared、generate Prisma Client 再通过 | 待独立验收 |
| DB/MySQL/Prisma | 安全 profile 拒绝 `DATABASE_URL` | 不触碰真实 DB | TEST-DB-001 不在本包 |
| browser | `tests/e2e/novel-backend.spec.mjs` | 通过；页面加载、用户创建草稿、刷新后仍可定位 | 待独立验收 |
| provider | 安全 profile 拒绝 provider key，强制 mock | 不触碰真实 provider | 真实 provider E2E 不在本包 |
| media | N/A | 未涉及 | N/A |
| failure injection | `--failure health-timeout`、`port-conflict`、`api-start-failure`、`browser-failure` | 均非零退出；错误分别覆盖 health timeout、端口占用、API 启动失败、浏览器断言失败 | 待独立验收 |
| CI/cache | `.github/workflows/rp01a-e2e.yml` | 已定义缓存和上传脱敏文本 allowlist；PR path 覆盖 E2E 基础设施、API、admin、shared 源码和相关 manifest/config；工作流使用本地 `./node_modules/.bin/playwright` 安装 Chromium | 远程 CI 尚未实际执行 |

研发自测结论：

```text
user_goal_status: partial
environment: local mock/in-memory + Playwright
evidence_level: E4 local automated browser
not_proven: 远程 CI 缓存/上传策略尚未实际运行；TEST 尚未独立复核。
```

## 5. 独立测试证据

- 执行 acceptance ids：TEST-E2E-BOOTSTRAP-01
- environment：待 TEST 填写
- evidence_level：待 TEST 填写
- 命令：待 TEST 填写
- browser trace：待 TEST 填写
- API 请求/响应安全摘要：待 TEST 填写
- 失败注入：待 TEST 填写

测试结论：

```text
conclusion: pending
user_goal_status: partial
environment: pending
evidence_level: pending
not_proven: 独立验收未执行。
```

## 8. 关闭裁决

```text
issue_id: RMD-TEST-E2E-001
final_status: partial
closed_acceptance_ids:
residual_risks: 独立验收、远程 CI 实跑和后续更多业务 fixture 尚未完成。
reopen_conditions: E2E 依赖手工状态、mock page.route、真实密钥/数据库，或失败时无法清理进程。
decided_by: pending MC
decided_at: pending
```
