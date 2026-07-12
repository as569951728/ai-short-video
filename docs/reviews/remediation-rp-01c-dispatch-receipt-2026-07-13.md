# RP-01C 派发 SLA 收据

```text
package_id: RP-01C
issue_ids: RMD-TEST-FIXTURE-001
acceptance_ids: TEST-FIXTURE-01
dev_completed_at: 2026-07-13 05:00:48 CST
test_dispatched_at: 2026-07-13 05:04:03 CST
test_completed_at: 2026-07-13 05:12:40 CST
mc_decided_at: 2026-07-13 05:13:43 CST
dev_to_test_elapsed: 3m15s
test_to_mc_elapsed: 1m03s
dev_to_test_sla_result: passed
test_to_mc_sla_result: passed
timeout_reason: N/A
```

说明：

- `dev_completed_at` 取第二轮独立复核 needs_revision 后，完整命令链环境隔离返工提交 `dc1991a` 的完成时间。
- `test_dispatched_at` 取关闭证据提交、远程治理成功后，主控创建全新 TEST/QUALITY 最终复验的时间。
- TEST agent `019f5825-8839-7172-8439-3a063fd022a3` 与 QUALITY agent `019f5824-ea77-7cc2-b798-a0bfbcb22dc6` 均 approved，P0/P1 为 0。
- 本收据只证明派发和裁决时效；验收范围、历史返工、残余风险和关闭结论以 RMD-TEST-FIXTURE-001 正式关闭记录为准。
