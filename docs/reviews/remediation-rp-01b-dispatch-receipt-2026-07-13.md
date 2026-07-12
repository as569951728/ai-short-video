# RP-01B 派发 SLA 收据

```text
package_id: RP-01B
issue_ids: RMD-TEST-DOM-001
acceptance_ids: TEST-DOM-01
dev_completed_at: 2026-07-13 03:03:15 CST
test_dispatched_at: 2026-07-13 03:06:42 CST
test_completed_at: 2026-07-13 03:13:52 CST
mc_decided_at: 2026-07-13 03:16:39 CST
dev_to_test_elapsed: 3m27s
test_to_mc_elapsed: 2m47s
dev_to_test_sla_result: passed
test_to_mc_sla_result: passed
timeout_reason: N/A
```

说明：

- `dev_completed_at` 取独立 TEST 首轮 needs_revision 后定向返工的最终完成时间；早期实现不作为最终完成时间。
- `test_dispatched_at` 取返工提交和远程门禁启动后，主控创建最终独立 TEST/QUALITY 复验的时间。
- TEST 于 2026-07-13 03:13:52 CST 完成并给出 `approved`；QUALITY 于 03:14:05 CST 完成并给出 `approved`，P0/P1 均为 0。
- 本收据只证明派发和裁决时效；验收范围、残余风险和关闭结论以 RMD-TEST-DOM-001 正式关闭记录为准。
