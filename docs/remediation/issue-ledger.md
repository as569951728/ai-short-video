# AIShortvideo 整改唯一问题总账

更新时间：2026-07-12

状态：frozen_for_remediation

本文件是整改问题状态的唯一事实源。历史复盘、验收记录和工程质量文档只提供证据，不再单独改变问题状态。

## 1. 固定责任席位

| 角色 | 责任 | 会话 |
| --- | --- | --- |
| MC | 范围、依赖、授权、优先级、最终收口 | 当前需求主控会话 |
| DEV | 实现、研发自测、变更清单、提交 | `019ed4ee-441a-7fa2-894d-393c7d4c527b` |
| TEST | 独立验收、复现、回归、阻塞结论 | `019ed4ee-b33b-7621-b71c-3aa3d9e7b26e` |
| PRODUCT | 用户旅程、交互和结果可理解性验收 | `019f4aeb-773c-7821-876f-3a5c8e13a130` |
| QUALITY | 安全、边界、Git、真实环境与证据等级 | `019edb3a-a972-75e2-bbb1-774b5ddb6d88` |

## 2. 规则

- `status` 只能是：`open`、`implemented_pending_verification`、`partial`、`verification_gap`、`closed`。
- PB/RB/QG/DEBT 定义见二次复盘。
- `closed` 必须引用 `docs/remediation/closure-evidence-template.md` 形成的关闭记录。
- 不允许把一个问题拆成多个状态互相覆盖；新增发现应关联现有 ID，只有根因和关闭条件不同才创建新 ID。
- 本总账所有非 `closed` 项关闭前，不进入新需求设计和业务研发。

## 3. 小说与 AI

| ID | 类别/级别 | 问题与影响 | 状态 | 主要证据 | Owner | 整改包 | 验收 ID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RMD-NOV-DB-001 | PB/P0 | Prisma 模式的正文批量、重写、正文采用、全书审稿和完结确认未实现，真实数据库无法完本 | open | `prismaNovelRepository.ts` 未实现路径；二次复盘 15.1 | DEV | RP-03B, RP-03C, RP-03D | NOV-DB-E2E-01 |
| RMD-NOV-REVIEW-001 | PB/P0 | 全书审稿未输入章节正文，连贯性和风险结论不可信 | open | `deepseekNovelProvider.ts` 全书审稿 payload；二次复盘 15.1 | DEV | RP-04C | NOV-REVIEW-QUALITY-01 |
| RMD-NOV-AI-001 | RB/P0 | 长输出只有顺序分块和一次通用 repair，没有持久 checkpoint、失败段续跑和完整性校验 | partial | `jsonOutput.ts`、`deepseekNovelProvider.ts`；N-08/N-09/N-16/N-17 | DEV | RP-04A | NOV-JSON-01, NOV-PLAN-RESUME-01 |
| RMD-NOV-BATCH-001 | RB/P1 | 批量正文全部生成后才保存，中断会浪费结果；`previousMemory` 未进入模型 payload | open | `novelService.ts`、`deepseekNovelProvider.ts`；二次复盘 15.2 | DEV | RP-04B | NOV-BATCH-RESUME-01, NOV-MEMORY-01 |
| RMD-NOV-QUALITY-001 | RB/P1 | 目标字数只在 prompt，结果只校验非空，短章节仍可通过 | open | N-19；`deepseekNovelProvider.ts` 长度校验 | DEV + PRODUCT | RP-04B | NOV-LENGTH-01 |
| RMD-NOV-VERSION-001 | RB/P1 | current 唯一性缺数据库强约束，真实产物来源可能仍记为 `mock_ai` | partial | `prismaNovelRepository.ts`；N-14 | DEV + QUALITY | RP-03A, RP-03D | NOV-CURRENT-01, NOV-PROVENANCE-01 |
| RMD-NOV-UX-001 | RB/P1 | 候选的编辑、优化、融合、结果定位、采用后导航和历史版本交互不统一；章节目录与试写主 CTA 也曾出现交互不一致或点击无效果 | implemented_pending_verification | N-02 至 N-05、N-10 至 N-15、N-18 | DEV + PRODUCT | RP-05A, RP-05B, RP-05D | NOV-CANDIDATE-01, NOV-CANDIDATE-02, NOV-CANDIDATE-03, NOV-CANDIDATE-04, NOV-CANDIDATE-05, NOV-CANDIDATE-06, NOV-AI-CTA-01 |
| RMD-NOV-PREF-001 | RB/P2 | 题材方向和爽点偏好仍为硬编码常量，没有管理或自定义机制 | open | `createOptions.ts`；N-20 | PRODUCT + DEV | RP-05C, RP-05D | NOV-PREFERENCE-01 |
| RMD-NOV-ERROR-001 | QG/P1 | 用户错误可能暴露内部 taskName，配置、超时、格式、额度和网络分类仍不完整 | partial | N-08/N-09；`jsonOutput.ts` | DEV + TEST | RP-04D | NOV-ERROR-01 |
| RMD-NOV-PROVIDER-001 | RB/P1 | 真实 DeepSeek 只具备代码和 in-memory smoke，没有 Prisma、浏览器和长文本稳定证据 | implemented_pending_verification | `deepseekLiveSmoke.ts`；API 测试强制 mock | DEV + TEST + QUALITY | RP-06A, RP-06B, RP-06C | NOV-DEEPSEEK-LIVE-01 |

## 4. 统一任务平台

| ID | 类别/级别 | 问题与影响 | 状态 | 主要证据 | Owner | 整改包 | 验收 ID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RMD-TASK-001 | PB/P0 | AI 动作没有统一持久任务 SSOT；部分动作在 provider 返回后才建任务，存在重复调用竞态 | partial | `novelService.ts`；N-06/N-07；N-AI-01 | DEV | RP-02A | TASK-PRECLAIM-01, TASK-CONCURRENCY-01 |
| RMD-TASK-002 | PB/P0 | 请求内 await 长 provider，没有独立 worker、心跳和进程重启恢复 | open | T-03；`novelService.ts` | DEV | RP-02B | TASK-WORKER-01, TASK-RESTART-01 |
| RMD-TASK-003 | RB/P1 | 通用重试只创建 queued 记录，没有消费者实际重新执行 | open | `taskService.ts`；N-AI-03 | DEV + TEST | RP-02B | TASK-RETRY-01 |
| RMD-TASK-004 | RB/P1 | “停止本页等待”“取消后端任务”“放弃并重生成”语义与状态不一致 | partial | N-06/N-07/N-21 | PRODUCT + DEV | RP-02C | TASK-CANCEL-01 |
| RMD-TASK-005 | QG/P1 | 主卡片、最近任务、任务抽屉、本地 pending 与阶段状态缺统一投影 | implemented_pending_verification | N-07；试写阶段旧任务案例 | DEV + TEST | RP-02C | TASK-SURFACE-01 |

## 5. 视频系统

| ID | 类别/级别 | 问题与影响 | 状态 | 主要证据 | Owner | 整改包 | 验收 ID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RMD-VID-DB-001 | RB/P0 | P8 核心表缺完整空库 baseline migration，关系、唯一 current 和版本并发未证明 | open | Prisma schema/migrations；V-DB-01 | DEV + QUALITY | RP-07A, RP-07B, RP-07C, RP-07D | VID-DB-MIGRATE-01, VID-DB-CONCURRENCY-01 |
| RMD-VID-NARRATION-001 | RB/P1 | 旁白文本由仓储固定构造，没有 narration provider 与真实模型证据 | partial | P9b；Prisma repository mock 文本 | DEV | RP-08A | VID-NARRATION-01 |
| RMD-VID-AUDIO-001 | PB/P1 | P9c 没有 MP3/WAV、静态文件服务或 audio 播放器，原“可试听”目标未达到 | open | V-AUD-01；P9 设计标准 | DEV + PRODUCT | RP-08B | VID-AUDIO-01 |
| RMD-VID-SUB-001 | PB/P1 | 字幕只是字符串分行和摘要时间线，没有真实时间戳、SRT/VTT 或音画同步 | open | V-SUB-01；P9d | DEV + TEST | RP-08C | VID-SUBTITLE-01 |
| RMD-VID-MEDIA-001 | PB/P1 | 渲染只写 mock 路径，导出只写记录，没有 MP4、播放器、文件服务和下载文件，也缺从小说引用到 MP4 的完整用户旅程 | open | V-REN-01/V-EXP-01；P9e | DEV + TEST + PRODUCT | RP-08D, RP-08F | VID-MP4-01, VID-DOWNLOAD-01, VID-P9-REAL-E2E-01 |
| RMD-VID-TASK-001 | RB/P1 | 视频任务是请求内同步状态模拟，没有持久 VideoTask、worker、取消和重启恢复 | open | V-TASK-01；`videoService.ts` | DEV | RP-08E | VID-TASK-01 |
| RMD-VID-CAPABILITY-001 | QG/P1 | 页面动作名称容易把占位状态流理解成真实试听、预览和导出 | partial | V-01/V-02/V-03；P9e 收口边界 | PRODUCT + DEV | RP-08F | VID-CAPABILITY-LABEL-01 |
| RMD-P10-001 | QG/P1 | P10-R0 仅合同、R1 未实现；没有真实 MP4 前继续 R1 会绕过核心价值缺口 | open | P10 R0/R1 文档 | MC | RP-10B | P10-ROUTE-DECISION-01 |

## 6. 测试与验收

| ID | 类别/级别 | 问题与影响 | 状态 | 主要证据 | Owner | 整改包 | 验收 ID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RMD-TEST-E2E-001 | QG/P0 | 没有纳管 Playwright backend E2E，按钮、结果定位、刷新、多标签和布局无法稳定回归 | open | T-01；无 Playwright 配置/用例 | TEST + DEV | RP-01A | TEST-E2E-BOOTSTRAP-01 |
| RMD-TEST-DOM-001 | QG/P1 | admin 测试没有真实 Vue DOM/event runner，无法捕获事件参数、disabled、弹窗和焦点问题 | open | `apps/admin-web/package.json`；T-02 | TEST + DEV | RP-01B | TEST-DOM-01 |
| RMD-TEST-FIXTURE-001 | QG/P0 | 缺 processing、timeout、脏 JSON、迟到结果、重复 current、分块失败和重启 fixture | open | T-04；现有 outline/trial seed | TEST + DEV | RP-01C | TEST-FIXTURE-01 |
| RMD-TEST-DB-001 | QG/P0 | migration 测试多为 SQL 正则，真实 MySQL migrate/write/concurrency/restart 未执行 | open | T-05；P8b-L1b | TEST + QUALITY | RP-01D, RP-03D, RP-07D | TEST-MYSQL-01 |
| RMD-TEST-CONTENT-001 | QG/P1 | 没有小说字数、重复率、连续性、人物一致性、爽点和钩子质量基准集 | open | T-08；provider 手写 JSON | TEST + PRODUCT | RP-04D | TEST-NOVEL-QUALITY-01 |
| RMD-TEST-EVIDENCE-001 | QG/P1 | 验收结论未强制分列 contract/unit/API/DB/browser/provider/media | closed | `056f60a`；独立 TEST/PRODUCT/QUALITY approved；关闭记录 | TEST + MC | RP-00A | TEST-EVIDENCE-LEVEL-01 |

## 7. 工程、主控与协作

| ID | 类别/级别 | 问题与影响 | 状态 | 主要证据 | Owner | 整改包 | 验收 ID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RMD-GOV-GIT-001 | QG/P0 | 曾跨包累积并一次纳管 89 文件，无法逐包审查、回滚和 bisect | partial | `26f1bc9`；工作树归因文档 | MC + DEV + QUALITY | RP-00B | GOV-GIT-01 |
| RMD-GOV-STATUS-001 | QG/P1 | 当前状态、历史事件和追加式文档曾互相冲突，巡检口径滞后 | closed | `056f60a`；状态单源与事件账本；独立 TEST/PRODUCT/QUALITY approved | MC + QUALITY | RP-00A | GOV-STATUS-01 |
| RMD-GOV-SLA-001 | QG/P1 | 研发完成到测试派发曾依赖用户提醒，没有可追踪 SLA | open | 用户提醒“工程进度卡着” | MC | RP-00B | GOV-SLA-01 |
| RMD-GOV-TEMP-001 | DEBT/P1 | `apps/api/tsconfig.testrun.json` 长期无 owner、期限和处理决策 | open | 当前 git status | QUALITY + DEV | RP-00B | GOV-TEMP-01 |
| RMD-ARCH-SIZE-001 | DEBT/P1 | 小说/视频核心 service、repository、workbench 和 shared 文件过大，回归半径持续扩大 | open | 首次复盘代码体量表 | DEV + QUALITY | RP-09H1, RP-09H2 | ARCH-SPLIT-01 |
| RMD-GOV-STAGE-001 | QG/P1 | 协作文档原先仍称“研发前设计阶段”，当前已修改为整改冻结期并完成独立验收 | closed | `056f60a`；独立 TEST/PRODUCT/QUALITY approved；关闭记录 | MC | RP-00A | GOV-STAGE-01 |

## 8. 专项验证缺口

| ID | 类别/级别 | 需要验证的范围 | 状态 | Owner | 整改包 | 验收 ID |
| --- | --- | --- | --- | --- | --- | --- |
| RMD-AUD-SEC-001 | QG/P1 | 权限、租户、越权、引用和日志敏感信息矩阵 | verification_gap | QUALITY + TEST | RP-09A | AUD-SEC-01 |
| RMD-AUD-OPS-001 | QG/P1 | 部署、环境配置、health、migration 顺序、回滚和故障恢复 | verification_gap | QUALITY + DEV | RP-09B | AUD-OPS-01 |
| RMD-AUD-OBS-001 | QG/P1 | 任务 latency、成功率、失败分类、卡死检测、告警与 taskId 关联 | verification_gap | QUALITY + DEV | RP-09C | AUD-OBS-01 |
| RMD-AUD-COST-001 | QG/P1 | 模型 tokenUsage、并发、TTS、渲染、存储和下载成本预算 | verification_gap | MC + QUALITY | RP-09D | AUD-COST-01 |
| RMD-AUD-DR-001 | QG/P1 | 创作资产、版本、任务和媒体的备份恢复 | verification_gap | QUALITY + DEV | RP-09E | AUD-DR-01 |
| RMD-AUD-A11Y-001 | QG/P2 | 键盘、焦点、屏幕阅读器、窄屏和长文本可用性 | verification_gap | PRODUCT + TEST | RP-09F | AUD-A11Y-01 |
| RMD-AUD-SUPPLY-001 | QG/P2 | 依赖漏洞、许可证、锁文件和构建可复现性 | verification_gap | QUALITY | RP-09G | AUD-SUPPLY-01 |

## 9. 汇总

| 类别 | 数量 | 当前关闭 |
| --- | ---: | ---: |
| PB | 7 | 0 |
| RB | 12 | 0 |
| QG | 21 | 3 |
| DEBT | 2 | 0 |
| 合计 | 42 | 3 |

数量只用于确认总账覆盖，不作为完成度指标。每次更新必须重新核对实际分类数量。
