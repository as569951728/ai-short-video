# 整改派发 SLA 收据模板

每个整改包研发交付后复制本模板生成：

`docs/reviews/remediation-<package-id>-dispatch-receipt-<yyyy-mm-dd>.md`

本模板只记录派发和收口时效，不替代关闭证据。

```text
package_id:
issue_ids:
acceptance_ids:
dev_completed_at: YYYY-MM-DD HH:mm:ss CST
test_dispatched_at: YYYY-MM-DD HH:mm:ss CST
test_completed_at: YYYY-MM-DD HH:mm:ss CST
mc_decided_at: YYYY-MM-DD HH:mm:ss CST
dev_to_test_elapsed:
test_to_mc_elapsed:
dev_to_test_sla_result: passed | waived | accepted_with_reason
test_to_mc_sla_result: passed | waived | accepted_with_reason
timeout_reason: N/A
```

规则：

1. `dev_to_test_elapsed` 必须等于 `test_dispatched_at - dev_completed_at`，目标不超过 15 分钟。
2. `test_to_mc_elapsed` 必须等于 `mc_decided_at - test_completed_at`，目标不超过 30 分钟。
3. 任一 SLA 超时不能标记 `passed`；必须标记 `waived` 或 `accepted_with_reason`，且 `timeout_reason` 必须写明原因和主控补救动作，不能写 `N/A`。
4. 所有时间必须使用 `YYYY-MM-DD HH:mm:ss CST`，字段完整、时间顺序正确、不得晚于校验时间。
5. 收据必须通过 `npm run governance:sla -- <receipt-file>`。
