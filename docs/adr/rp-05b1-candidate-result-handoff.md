# RP-05B1 小说候选动作结果承接闭环 ADR

status: ready
package_id: RP-05B1
manifest_id: RP-05B1-v2
baseline_sha: 058071861598f58dbe33e1c4f4d2e3df8f2a55de
hard_max_files: 29
hard_max_net_additions: 3200
actual_files: 29
actual_net_additions: 2403
exceeded_budget: changed_files,net_additions
split_reason: Candidate result handoff, authority enforcement, exact-result UI behavior, and their regression evidence form one user-visible vertical closure package.
owner: MC + DEV + PRODUCT + TEST + QUALITY
valid_until: 2026-08-31

## 1. 准入裁决

本包是 `execution_reset` 后选择的第一条用户结果链，只处理小说候选动作完成后的结果承接，不扩展到偏好配置、长章节恢复、真实数据库或真实模型。

| 准入字段 | 冻结值 |
| --- | --- |
| target_issue_ids | `RMD-NOV-UX-001` |
| expected_ledger_transition | 独立 E4 验收全部通过后 `implemented_pending_verification -> closed`；任一原事故未通过则保持原状态 |
| user_result | 用户执行生成、融合、按要求优化、手动编辑、继续优化或查看任务结果后，页面进入正确步骤并定位、高亮精确新候选；候选展示非敏感来源和变更原因；采用后进入正确下一步 |
| evidence_buckets | shared contract、admin mapping/unit、API integration、browser DOM、independent PRODUCT/TEST/QUALITY |
| fixed_candidate | code SHA `d09b9aae6cef1e98bd2fb84cee30455278685fac` / tree `26dfd802b667e38fed6c6aade7d474ab254f5a99`；后续只允许验收记录、候选绑定修正和账本证据提交 |

## 2. 实现合同

1. 方向候选 DTO 只暴露 `sourceVersionIds` 与 `changeReason` 等非敏感来源信息；不得暴露完整提示词、模型响应、密钥或 provider 原始内容。
2. 方向生成、融合、优化和手动编辑必须返回新候选 ID；前端必须使用动作返回的精确 ID，而不是默认选择列表第一项。
3. 结构生成和“继续优化”同样使用动作返回的精确候选 ID；继续优化还必须把所选候选、优化意见和来源版本纳入权威任务合同并传给 provider，不能只把意见保存为展示文案。
4. “查看结果”优先使用最近任务的 `resultVersionIds`，切换到对应步骤后滚动至目标并高亮至少 2 秒；无精确结果 ID 时才降级到结果区域。
5. 采用动作完成后进入该资产对应的下一步骤或子步骤，并以服务端详情刷新后的正式版本为准。
6. 页面刷新后候选来源、变更原因、当前/历史状态和推荐动作必须保持一致。

## 3. 验收映射

| 验收 ID | 本包证明内容 | 明确不外推 |
| --- | --- | --- |
| NOV-CANDIDATE-01 | 编辑创建新候选、旧候选保留、刷新可见 | MySQL 并发唯一性 |
| NOV-CANDIDATE-02 | 优化必须有 instruction，返回并展示来源与变更原因 | 真实 provider 输出质量 |
| NOV-CANDIDATE-03 | 融合返回并定位精确候选，展示多个来源版本 | 真实模型融合质量 |
| NOV-CANDIDATE-UI-01 | 页面同一资产只展示一个正式 current，旧版历史化且不再提供误导动作 | API/数据库唯一 current 的 `NOV-CANDIDATE-04 + NOV-CURRENT-01` E6 约束仍由 `RMD-NOV-VERSION-001` 承担 |
| NOV-CANDIDATE-05 | 采用后进入正确下一步骤，刷新后状态一致 | 后续步骤内容质量 |
| NOV-CANDIDATE-06 | 查看结果改变步骤并滚动、高亮精确目标至少 2 秒 | 跨设备恢复 |
| NOV-AI-CTA-01 | 章节目录/试写动作沿用可观察任务和精确结果承接合同 | 长任务 checkpoint、真实 provider 稳定性 |

## 4. 允许变更清单与预算

产品预审发现原 v1 未覆盖结构优化 provider 权威链和试写精确候选承接；第四轮 QUALITY 又发现方向采用缺少锁内 CAS 和成功重放；第五轮 QUALITY 进一步发现内存仓储的采用前审计快照被可变小说引用污染；第六轮 PRODUCT 发现成功重放会被后续活动任务冲突错误拦截。对应锁内重读、CAS、幂等重放优先级、前态冻结和动态审计断言均属于同一采用权威边界。为修复这些 P1，范围从 24 个文件强制扩展为不超过 29 个文件、净新增仍不超过 3,200 行。新增文件只用于同步已有调用方和治理回归：

- `docs/adr/rp-05b1-candidate-result-handoff.md`
- `docs/reviews/rp-05b1-candidate-result-handoff-acceptance-2026-08-02.md`
- `packages/shared/src/novels.ts`
- `packages/shared/src/contracts.test.ts`
- `apps/api/src/modules/novels/services/novelService.ts`
- `apps/api/src/modules/novels/domain/novelDomain.ts`
- `apps/api/src/modules/novels/deepseekLiveSmoke.ts`
- `apps/api/src/modules/novels/services/actionExecutionPlan.ts`
- `apps/api/src/modules/novels/services/taskClaim.ts`
- `apps/api/src/modules/novels/routes/novelRoutes.ts`
- `apps/api/src/modules/novels/providers/mockStructureProvider.ts`
- `apps/api/src/modules/novels/providers/deepseekNovelProvider.ts`
- `apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts`
- `apps/api/src/modules/novels/repositories/prismaNovelRepository.ts`
- `apps/api/src/modules/tasks/services/taskService.ts`
- `apps/api/src/modules/novels/novelRoutes.test.ts`
- `apps/api/test/rp02b/rp02b.test.ts`
- `apps/api/test/rp02a/rp02a.test.ts`
- `apps/api/test/rp02b2a/authority-claim.test.ts`
- `apps/api/test/rp02b2a/fixtures.ts`
- `apps/admin-web/src/modules/novels/model/novelTypes.ts`
- `apps/admin-web/src/modules/novels/model/novelDetailView.ts`
- `apps/admin-web/src/modules/novels/model/novelDetailView.test.ts`
- `apps/admin-web/src/modules/novels/components/TaskProgressPanel.dom.spec.ts`
- `apps/admin-web/src/modules/novels/services/novelService.ts`
- `apps/admin-web/src/modules/novels/services/novelService.test.ts`
- `apps/admin-web/src/pages/NovelDetailWorkbench.vue`
- `apps/admin-web/src/pages/NovelDetailWorkbench.dom.spec.ts`
- `apps/admin-web/src/style.css`

## 5. 硬边界

- 不修改 Prisma schema，不宣称关闭 `RMD-NOV-VERSION-001`。
- 不连接真实 MySQL、真实模型、真实媒体服务，不产生模型费用。
- 不启动 `RP-05C/RP-05D`、`RP-04A` 或后续视频业务包。
- 独立 PRODUCT、TEST、QUALITY 对同一冻结候选未全部清零 P0/P1 前，不得提交关闭证据或更新 RB 关闭数。
