# RMD-GOV-TYPECHECK-001 整改关闭记录

draft_status: closed

## 1. 基本信息

| 字段 | 内容 |
| --- | --- |
| issue_id | RMD-GOV-TYPECHECK-001 |
| package_id | RP-00A |
| issue_class | QG |
| severity | P1 |
| owner | DEV + QUALITY |
| acceptance_ids | GOV-TYPECHECK-01 |
| environment | isolated Git worktree / workspace-local npm install / no DB / no provider |
| target_evidence_level | E1 + 根级 typecheck + independent QUALITY |
| actual_evidence_level | E1 + dependency-resolution evidence + 根级 typecheck + independent QUALITY |

## 2. 原始问题与根因

2026-08-01 在隔离工作树首次执行根级 `npm run typecheck` 时，shared 和 admin-web 通过，API 报 20 个 execution-envelope、actor helper 与 ErrorCode 不一致错误。当时将其登记为主干 shared 合同漂移。

复核发现隔离工作树没有自己的 `node_modules`。Node/TypeScript 向父目录查找依赖，命中了共享脏工作树中的旧 workspace 链接和生成产物，因此把两个不同工作树的源码/产物组合在同一次编译中。错误不是当前候选的源码合同缺陷。

## 3. 修复与防回归

- 在隔离工作树执行锁文件约束的 `npm ci`，建立仅指向当前工作树的 workspace 链接。
- 不修改 execution-envelope、actor helper、ErrorCode 或任何业务代码来迎合污染环境。
- 将 `GOV-TYPECHECK-01` 补充为：clean worktree 必须先完成 workspace-local install，并确认链接没有逃逸到父工作树。

## 4. 验证证据

| 证据 | 结果 |
| --- | --- |
| `npm ci` | 当前隔离工作树安装 357 packages；未连接数据库、provider 或媒体服务 |
| `realpath node_modules/@ai-shortvideo/shared` | 解析到当前隔离工作树的 `packages/shared` |
| `npm ls @ai-shortvideo/shared --depth=0` | API、admin-web 与根 workspace 均指向当前工作树的 `./packages/shared` |
| `npm run typecheck` | shared build/typecheck、admin-web `vue-tsc -b`、API Prisma generate/typecheck 全部退出 0 |
| 业务源码变更 | 0；未通过改 DTO、删检查或使用旧 dist 规避错误 |
| independent QUALITY | 独立只读复验 workspace links 与根级 typecheck，APPROVED，P0/P1/P2 = 0/0/0 |

## 5. 边界与结论

- 本记录关闭的是“主干类型合同失败”的错误判断和其环境根因，只增加一个 QG 关闭项。
- `npm ci` 报告的依赖审计项不在本问题范围，仍由 supply-chain 专项验证处理。
- 本记录不证明小说、视频、真实 MySQL、真实 provider 或媒体链路。

```text
conclusion: approved
user_goal_status: achieved
evidence_level: E1 + workspace-local dependency resolution + root typecheck + independent QUALITY
not_proven: product business outcomes and real environments
```
