# RMD-NOV-REVIEW-001 整改关闭记录

## 1. 基本信息

| 字段 | 内容 |
| --- | --- |
| issue_id | RMD-NOV-REVIEW-001 |
| package_id | RP-04C |
| issue_class | PB |
| severity | P0 |
| owner | DEV + PRODUCT + TEST + QUALITY |
| dev_thread | 当前需求主控目标与隔离实现工作树 |
| test_thread | PRODUCT `019fc326-272e-7312-ac46-9b5a7abbc249`；TEST `019fc326-6a92-7d32-be1a-e17c51cdd7df`；QUALITY `019fc326-a5e2-7b63-a98c-1182063e9d01` |
| acceptance_ids | NOV-REVIEW-QUALITY-01 |
| environment | 真实 DeepSeek 单次 E5 调用；真实 Vue/Fastify 浏览器与 API transport；in-memory repository；GitHub Actions clean checkout |
| target_evidence_level | E5 |
| actual_evidence_level | E5 |

## 2. 原始问题

- 用户目标：全书审稿必须读取完整章节正文和连续性记忆，给出可定位、可阻断完结、刷新后可恢复的可信审稿结论。
- 原始现象：全书审稿 payload 只有章节元数据，没有章节正文、特征摘要或连续性记忆，模型无法可靠发现跨章人物、时间线和事实冲突。
- 用户影响：低质量或自相矛盾的小说可能被错误标记为可完结，审稿结果不能作为质量门禁。
- 首次证据：二次复盘 15.1、`deepseekNovelProvider.ts` 旧 payload 与 `RMD-NOV-REVIEW-001` 总账行。
- 直接原因：全书审稿 provider contract 未绑定权威正文快照、覆盖清单、记忆和结果定位。
- 系统根因：审稿动作缺少从 source authority、provider request、结果持久化到完成门禁的端到端证据合同。
- 原状态：open。

## 3. 修复范围

- 修改内容：将 12 章权威正文、章节特征和连续性记忆装入受预算约束的全书审稿请求；固定 source manifest、request hash、provider route、覆盖清单和 result refs；持久化可定位问题与 completion gate；补刷新、多标签、重复点击、失败恢复和敏感信息回归。
- 修改文件：PR #63 的 28 个 shared、API、admin、脚本、测试和证据文件；预算 ADR 为 `docs/adr/rp-04c-full-review-evidence-budget.md`。
- migration：N/A；本 issue 不修改 Prisma schema 或 migration。
- 配置变化：真实模型只使用已有安全配置；单次调用、禁用自动付费重试、费用上限和脱敏门禁固定在 E5 smoke。
- 数据兼容：旧审稿记录保留；新报告绑定完整 source manifest，不静默覆盖正式资产。
- 安全影响：不保存完整 prompt、正文、模型原始响应、密钥或认证头；证据只保存可复算脱敏摘要。
- 明确未修改：真实 MySQL/Prisma 写入、多进程并发、进程重启、严格预付 token 隔离、真实媒体链；这些不作为本 issue 关闭条件。

## 4. 研发证据

| 证据桶 | 命令/证据 | 结果 | not_proven |
| --- | --- | --- | --- |
| contract | shared/API full-review contract 与 12 章 authority manifest 回归 | passed | 无 |
| unit | PR #63 targeted suites 与根级单测；调用次数与总预算拒绝回归 | passed | `promptCharacters` 与 `maxTokens` 两项各自的 provider call=0 聚焦负例缺独立单测 |
| API | Fastify full-review transport、任务恢复、报告和 completion gate | passed | 真实 MySQL transport |
| DB/MySQL/Prisma | N/A；本 issue 的目标证据为 E5 provider + browser/API，数据库完本链由 `RMD-NOV-DB-001` 承担 | 不适用 | E6/真实 MySQL/Prisma 仍未证明 |
| browser | `npm run e2e:rp04c`；M-01..M-11 + R-01 | 1/1 passed，12/12 章，刷新/跨标签/失败恢复通过 | 跨进程恢复 |
| provider | 真实 DeepSeek E5，`full-review-e5-summary-v2` | 单次调用成功，retry=0，三类冲突命中、对照误报 0 | 严格预付 token/cost 隔离 |
| media | N/A；全书审稿不产生媒体 | 不适用 | 视频媒体链 |
| typecheck | PR #63 required checks | passed | 无 |
| build | PR #63 admin/backend clean-checkout required checks | passed | 独立生产部署 |
| failure injection | output parse failure、incomplete/stale authority、阻断完结、失败后刷新重发 | passed | provider unknown outcome 后进程重启 |
| concurrency/restart | 双刷新、多标签、重复点击保持同一任务和单一资产 | passed at E5 browser/API | 直接 API 并发、多进程与进程重启 |

研发自测结论：

```text
user_goal_status: passed
environment: real DeepSeek E5 plus real browser/API transport with in-memory repository
evidence_level: E5
not_proven: E6/MySQL/Prisma; direct API concurrency; process restart; strict prepaid token/cost isolation
```

## 5. 独立测试证据

- 执行 acceptance ids：NOV-REVIEW-QUALITY-01。
- environment：最终候选 `4b1361231484646fd84e33d26ac565a5ac931b37` / tree `315e8e9ad11864a542065d371d200397cf51caa2`；真实 DeepSeek E5；真实浏览器/Fastify transport + in-memory repository。
- evidence_level：E5。
- 命令：PR #63 required checks 5/5；PR #64 required checks 6/6；main@`f98f532` 四路 required checks 全绿。
- fixture：`rp-04c-e5-conflicts-v1`、`rp-04c-browser-12ch-v1`；12 章包含人物死亡后复活、时间线、合同金额冲突和无关对照。
- contract：12/12 coverage、source manifest、request/result hash、provider route、issue scope refs、completion gate 全部绑定。
- unit：shared/API/admin 与 targeted full-review suites 通过。
- API：任务只创建一次；processing、terminal、failure、refresh 和 report/gate transport 通过。
- 浏览器 trace：run `rp04c-2026-08-03T08-13-45-744Z`，M-01..M-11 + R-01 全部 PASS，`failures=[]`。
- DB/MySQL/Prisma：N/A；独立验收未将 in-memory 结果解释为 E6，真实写路径继续由 `RMD-NOV-DB-001` 跟踪。
- API 请求/响应安全摘要：`fb72a9c84d9b112824d56e90ffd0ba81bc0f498bb2b3c9aee406d6662595b141`，可由证据文档中的完整脱敏 JSON 独立复算。
- 数据库证据：无真实数据库动态证据；明确为 not_proven。
- provider 证据：`deepseek-v4-pro`，12/12 coverage，18553 prompt + 3217 completion = 21770 tokens，53104 ms，`callCount=1/maxCalls=1`，retry=0，保守费用上界 1249350/5000000 micros。
- 媒体文件证据：N/A。
- 刷新/多标签/重复点击：0/5/15 秒、跨标签和双刷新均保持同一 processing task；终态刷新 ID 稳定，无重复 POST/资产。
- 失败/取消/重试/重启：受控 parse failure 持久化安全原因并提供重发；进程重启未证明。
- 回归范围：shared、API、admin、浏览器、真实 provider、治理预算与远端 required checks。

测试结论：

```text
conclusion: approved
user_goal_status: passed
environment: real DeepSeek E5 plus real browser/API transport with in-memory repository
evidence_level: E5
not_proven: E6/MySQL/Prisma; direct API concurrency; process restart; strict prepaid token/cost isolation
```

## 6. 产品与质量复核

产品复核：

- 原问题场景是否可理解：是；用户能看到审稿任务、进度状态、结果定位和完结阻断原因。
- 结果是否可见：是；跨章问题绑定章节 scope refs，刷新后报告和 gate 保持一致。
- 下一动作是否明确：是；存在阻断问题时不能完结，失败时显示安全原因和重新发起入口。
- 是否仍有误导性能力表述：未发现 P0/P1；界面不宣称真实数据库或进程恢复已完成。

质量复核：

- 范围是否越界：否；未进入真实 MySQL、媒体生成、发布或后续包。
- 真实环境边界：真实 provider E5 已证明；E6/MySQL 明确保留给 `RMD-NOV-DB-001`。
- 租户/权限/敏感信息：证据隐私扫描通过；未保存 raw response、正文、prompt、密钥或认证头。
- Git 和工作树：PR #63 正常 squash 合并；PR #64 正常 squash 修复 main delivery budget gate；均未使用 admin bypass。
- 是否存在未归因文件：否。

独立结论：PRODUCT、TEST、QUALITY 对最终候选均为 `P0=0/P1=0`，全部批准合并和关闭；非阻断 P2 为 `promptCharacters/maxTokens` 各自的 provider call=0 聚焦负例、固定金丝雀预算保守性及记忆直接标记人物冲突。

## 7. Git 与远程

| 字段 | 内容 |
| --- | --- |
| branch | implementation `codex/rp-04c-full-review-evidence-20260802`；closure `codex/rp04c-ledger-close-20260803` |
| commit | PR #63 merge `5e42d5f32de308dff4e3c9531aed428c815bd279`；PR #64 merge `f98f53245ce3382b93d10938e2d82d745031a4e4` |
| upstream | `origin/main@f98f53245ce3382b93d10938e2d82d745031a4e4` |
| changed_files | implementation 28；governance correction 3；closure assets 8 |
| diff_check | passed |
| worktree_remaining | 0 after closure commit |

PR #63 最终 required checks 5/5；PR #64 最终 required checks 6/6。main@`f98f532` 的 RP-01A `30801863814`、Remediation governance `30801863047`、RP-01B `30801863058`、RP-01C `30801863049` 全部 success。

## 8. 关闭裁决

```text
issue_id: RMD-NOV-REVIEW-001
final_status: closed
closed_acceptance_ids: NOV-REVIEW-QUALITY-01
residual_risks: E6/MySQL/Prisma; direct API concurrency; process restart; strict prepaid token/cost isolation; focused promptCharacters/maxTokens provider-call-zero tests
reopen_conditions: full review skips authoritative chapters/evidence; provider is called with incomplete or stale authority; conflict fixture misses or control false-positive appears; duplicate paid call occurs; completion gate allows blocking issues; safe summary exposes raw content or secrets
decided_by: MC after independent PRODUCT, TEST and QUALITY approval
decided_at: 2026-08-03 CST
```

关闭解释：本 issue 的用户结果是“全书审稿真正读取完整正文并能可靠阻断错误完结”，目标证据为 E5。真实 DeepSeek、真实浏览器/API transport、独立三方验收和 main required checks 已共同证明该结果；in-memory repository 未被用于证明真实数据库。E6/MySQL/Prisma 完本链仍是 `RMD-NOV-DB-001` 的独立 P0，不能由本关闭记录替代。
