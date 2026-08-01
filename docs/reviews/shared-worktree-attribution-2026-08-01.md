# 共享工作树未提交状态归因

状态：classified_no_mutation

日期：2026-08-01

## 1. 快照

- 工作树：`/Users/chenzhaowen/AIShortvideo`
- 分支：`codex/aishortvideo-checkpoint-20260711`
- HEAD：`c673eaf`
- 远端最新主干：`8940d6d`
- 状态：13 个未暂存修改、2 个未跟踪条目，暂存区为空
- 审计操作：只读；未修改、暂存、提交、清理、切换或覆盖任何文件

## 2. 保留迁移篮子

以下 2 个文件没有被远端替代，可在未来单独授权 UI 包后从最新 main 手工迁移，并执行桌面、窄屏和全局样式回归：

| 文件 | 主题 | 当前裁决 |
| --- | --- | --- |
| `apps/admin-web/src/layout/AdminLayout.vue` | 后台布局优化 | 保留意图，禁止混入任务平台整改包 |
| `apps/admin-web/src/style.css` | 全局视觉密度与列表布局 | 保留意图，迁移前必须做浏览器视觉回归 |

## 3. 不迁移篮子

以下 13 个条目属于已经被远端替代的旧实现、已撤销的单包授权或尚未授权的 A3-A5 草案，不得提交或整包迁移：

- `.github/workflows/rp01c-fixtures.yml`
- `apps/api/src/modules/novels/domain/novelDomain.ts`
- `apps/api/src/modules/novels/novelRoutes.test.ts`
- `apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts`
- `apps/api/src/modules/novels/repositories/prismaNovelRepository.ts`
- `apps/api/src/modules/novels/services/taskClaim.ts`
- `apps/api/src/modules/tasks/services/taskService.ts`
- `docs/adr/rp-02b2a-execution-core-budget.md`
- `package.json`
- `packages/shared/src/api.ts`
- `packages/shared/src/novels.ts`
- `apps/api/src/modules/novels/services/actionExecutionPlan.ts`
- `apps/api/test/rp02b2a/rp02b2a.test.ts`

其中测试草案只能作为未来 A3-A5 场景参考；后续必须按最新接口和独立包合同重新编写，不能复制为通过证据。

## 4. 恢复边界

1. 不在共享工作树执行 reset、checkout、clean、stash 或覆盖式 pull。
2. 本次结果进度整改只在基于 `main@8940d6d` 的独立干净工作树提交。
3. UI 两文件需要单独授权和单独候选；旧任务平台 13 条在用户明确授权清理前保持原状。
4. 任何后续实现包必须从最新 main 创建，不得以该共享工作树作为基线。
