# RMD-TASK-002/003 / RP-02B2a2 阶段验收记录

## 1. 基本信息

| 字段 | 值 |
| --- | --- |
| issue_id | RMD-TASK-002、RMD-TASK-003 |
| package_id | RP-02B2a2 |
| evidence_level | E3，deterministic mock / in-memory + Prisma repository contract |
| authorized_base | `056a8d28910c765c9887a245e2dc4269859e5ec2` |
| admitted_candidate | `e8e37cd892570e3abee961374ec3512a373f6400` |
| admitted_candidate_tree | `749fe41f42285dc9115351ddcbc675e77d428cb7` |
| admitted_manifest_digest | `11e82805b419a97f598c5b4a9595eb897584c92add2e9d0071184ff9e414c1ba` |
| durable_candidate_ref | `refs/tags/rp02b2a-admitted-e8e37cd892570e3abee961374ec3512a373f6400` |
| squash_delivery_base | `50d5839fd4d965b2c6fc40213be32beaf6f6cfb2` |
| squash_delivery_head | `dc193dbbd3ac1970f571fd618f12902a4033994c` |
| post_merge_gate_head | `9f04986469a3e409b3ce887390e8830cbdfe9493` |
| pull_requests | `#51` A2 delivery；`#53` post-merge range correction |
| final_review | ARCH/SECURITY `APPROVED P0=0/P1=0/P2=1`；TEST/QUALITY `APPROVED P0=0/P1=0/P2=0` |

## 2. 阶段目标与边界

本阶段只关闭 RP-02B2a2 的 E3 子包，不关闭 `RMD-TASK-002` 或 `RMD-TASK-003`：

- 生产请求 actor 只能来自服务端注入的 authenticated `RequestContextResolver`，每请求只解析一次；默认、空白、占位、legacy、mock 或客户端伪造 actor 均 fail closed。
- 15 个 provider-backed action 使用 action-specific authoritative source refs、canonical envelope、稳定 `requestHash` 和持久 `requestedAt`。
- authority 缺失、跨 tenant/user/object、在 claim 前变化、首次读取后变化或 claim 后/provider 前变化时，provider 与八类仓储副作用均为零。
- legacy task 只允许同步解析并安全失败，不会被占位 refs 包装成可执行 envelope，也不会进入 lease、worker 或 recovery。
- 本包不启用正常 leased provider、checkpoint/finalize、HTTP `202`、Admin transport、heartbeat/shutdown、retry child 消费或 restart recovery。
- 真实 MySQL、真实付费 provider、真实媒体和 E6 不在本记录的通过范围内。

## 3. 候选与交付身份

候选实现采用 sibling admission，不能用 squash 后的单提交 diff 代替原始授权区间：

1. 原始授权区间为 `056a8d2..e8e37cd`，候选为 22 files / 3,891 net additions。
2. GitHub PR #51 将候选内容 squash 交付为 `50d5839..dc193d`；该交付提交是 delivery base 的唯一直接子提交。
3. PR #53 以 `dc193d..9f04986` 落地双区间修正；`9f04986` 的 tree 与修正候选 `6e34fa2` 完全一致，父提交精确为 `dc193d`。
4. `repository_dispatch` replay 从受信主分支 `9f04986` 检出 workflow，精确 fetch admission tag，并同时验证候选 SHA/tree/digest、候选路径、delivery 路径、base blob/mode 和 delivered blob/mode。
5. replay 实际输出绑定：analysis `056a8d2..e8e37cd`，delivery `50d5839..dc193d`，不存在把交付提交误当授权候选或把历史 sibling candidate 包装成 main ancestor 的情况。

## 4. 最终机器证据

| 证据桶 | 命令/证据 | 结果 | not_proven |
| --- | --- | --- | --- |
| A2 core | `npm run test:rp02b2a2:core` | 272/272 | 真实 DB/provider、多进程 |
| closeout clean install replay | 独立 worktree 执行 `npm ci` 后 `npm run test:rp02b2a2:core` | 272/272；0 failed / 0 skipped | 不把父工作树依赖解析当代码证据 |
| A2 composite | `npm run test:rp02b2a2` | passed，先完整回归 B2a1/A1 再运行 A2 core | E6 |
| A2 package gate | `056a8d2..e8e37cd` | 22 files / 3,891 net additions；ADR ready 与 exact manifest 匹配 | 后续包 |
| post-merge package gate | `npm run test:rp02b2a1:gate` | 65/65 | 不替代独立验收 |
| RP-01C | `npm run test:rp01c` | 13/13 | 真实 provider |
| governance | `npm run test:governance` | 15/15 | 真实运行环境 |
| typecheck | `npm run typecheck` | shared/admin/api passed | runtime smoke |
| workflow contract | trusted replay run | `required_files=60` | 不外推 E6 |
| candidate admission | run `29965011647` | Trusted admission + Admitted candidate completed/success | squash delivery replay |
| candidate clean push | run `29972477016` | RP-01C completed/success at admitted tag | main delivery identity |
| correction main push | runs `29977676415` / `29977676443` / `29977676404` / `29977676439` | RP-01A/RP-01B/RP-01C/governance completed/success | A2 replay |
| trusted replay | run `29977969717` | completed/success；65/65 gate、272/272 A2 core、API/E2E/governance/typecheck/build/Prisma/diff/budget 全绿 | real MySQL/provider/media |
| diff hygiene | `git diff --check` | passed | N/A |

## 5. 关键负向矩阵

- 15 actions x 3 authority phases x 2 mutations = 90 个逐 action 用例，覆盖 `missing` / `changed` 与 pre-claim / post-first-read / post-claim barriers。
- 15 action 均覆盖 authoritative HTTP `200` projection、两次 service snapshot 与 repository commit recheck，不以共享模板总数替代逐项断言。
- required source refs 缺失时在 authority/provider/claim 前失败；不生成 `legacy-null-version-ref`、`objectId-a`、`objectId-b` 或其他合成 refs。
- isolated missing-authority fixture 对 provider/task/intent/event/asset/receipt/current/operation-log/child 逐项断言绝对零增量。
- resolver missing/null/blank/throw 分别映射受控 `401`/`503`，header/body/cookie 伪造不能覆盖可信 actor。
- 同 tenant 不同 user、tenant A/B、novel/object mismatch、stale replay 和 T0/T1 replay 均保持 actor-scoped idempotency 与原始 persisted `requestedAt`。
- InMemory/Prisma 均覆盖 post-claim rollback、active-claim authority write fence、V1.1 lease/recovery 仅接受同一 authoritative envelope/actor；正常 leased provider 和 finalize 仍由后续包控制。
- ARCH/SECURITY 记录 1 个非阻断 P2：当前“每请求 resolver 只解析一次”由所有 handler 调用点静态核对，尚缺 invocation counter 动态断言；该补强不得被解释为后续包已授权。

## 6. Acceptance ID 阶段映射

| acceptance_id | RP-02B2a2 已证明 | 仍未证明 |
| --- | --- | --- |
| TASK-PRECLAIM-01 | authenticated actor、canonical envelope、authoritative source refs、T0/T1 replay 与 provider 前 stale gate | 独立 worker、HTTP 202、真实 DB 事务 |
| TASK-B2A2-ACTOR-REPLAY-01 | resolver 单次解析、跨 user/tenant 隔离、伪造身份无效、persisted requestedAt 和 hash/envelope 重放稳定 | task/events 公开 actor 可见性留 B2b |
| TASK-B2A2-AUTHORITY-01 | 15 action、三 barrier、两 mutation、八类零副作用、legacy fail closed | checkpoint/finalize、真实 provider |
| TASK-CONCURRENCY-01 | provider 前 authority gate 与 repository active-claim fencing | lease settlement 竞争、worker lifecycle、多进程 |
| TASK-WORKER-01 | authority claim/reload 和 worker/recovery 前 fail closed | 正常 leased execution、heartbeat、shutdown、202 |
| TASK-RETRY-01 | 继续回归公开 retry freeze，legacy/历史任务不进入 provider | 真实 retry child、预算/lineage、消费者执行、unknown outcome |
| GOV-GIT-01 | exact candidate、durable tag、squash delivery、受信 replay 和四路 main push 均有远端证据 | 后续包独立 Git/CI |

## 7. 阶段裁决

```text
package_id: RP-02B2a2
package_status: completed
accepted_candidate_sha: e8e37cd892570e3abee961374ec3512a373f6400
accepted_candidate_tree: 749fe41f42285dc9115351ddcbc675e77d428cb7
squash_delivery_head: dc193dbbd3ac1970f571fd618f12902a4033994c
post_merge_gate_head: 9f04986469a3e409b3ce887390e8830cbdfe9493
trusted_replay_run: 29977969717 completed/success
arch_security_review: APPROVED P0=0/P1=0/P2=1
test_quality_review: APPROVED P0=0/P1=0/P2=0
RMD-TASK-002: partial
RMD-TASK-003: open
issue_closed_count: 9/42 unchanged
next_package: not automatically authorized
not_proven: normal leased provider; finalize; HTTP 202; Admin transport; worker heartbeat/shutdown; retry child consumption; restart recovery; real MySQL/provider/media; E6
```

主控据两路独立批准、候选/交付身份、可信 replay 和本地 clean-install 复跑，裁定 RP-02B2a2 在限定 E3 范围完成。该结论不关闭 `RMD-TASK-002/003`，不授权后续包，也不授权真实媒体或平台能力。
