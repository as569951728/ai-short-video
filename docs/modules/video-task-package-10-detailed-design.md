# 任务包 10：人工发布记录与数据回填详细设计

## 1. 定位

P10 承接 P9e 的已确认导出记录，形成最小人工运营闭环：

`确认导出 -> 用户到平台手动发布 -> 回系统登记发布事实 -> 手动回填 24h/48h 数据 -> 记录下一步决策`

P10 不是自动发布系统，也不是 P12 运营复盘看板。导出、发布、发布登记、数据回填必须保持为四个独立动作。

## 2. 开工前门禁

1. 先以独立 P10-preflight 包关闭小说创建 `creationSource` 合同缺口：创建页的“系统推荐 / 引用热点 / 手动想法”必须进入 shared DTO、API schema、持久化和详情返回。正式合同见 `docs/modules/novel-creation-source-contract.md`；该缺口不并入 P10 业务代码。
2. 刷新工作树归因检查点，明确 P8/P9 关键 DTO、migration、video module 和页面基线；禁止通过 reset、checkout 或 clean 获得干净状态。
3. P8b-L1b 未获得安全数据库环境和主控授权前，P10 只能声明 mock/local、in-memory、schema/static、API contract 通过，不能声明真实 MySQL/Prisma 写路径通过。
4. P9e 的当前导出必须是已确认、未过期、可导出的当前版本；导出记录本身不等于发布记录。

## 3. 本期范围

### 3.1 必须实现

- 人工发布记录：平台、账号展示名、作品链接或作品 ID、发布时间、发布标题、发布文案、备注。
- 发布冻结快照：冻结当时使用的 export、render、旁白、音频、字幕、视觉方案、标题、前三秒钩子、首屏字幕、结尾悬念和引用版本。
- 支持同一视频多平台、多次人工发布；每次发布是独立记录，不能覆盖历史。
- 创建发布记录时同步创建 24h、48h 待回填节点。
- 24h/48h 手动数据回填：播放、完播率、平均观看时长、点赞、评论、收藏、分享、关注增长、主观备注和数据来源。
- 样本不足、数据不完整、回填逾期和下一步决策。
- 数据更正、发布记录撤销或作废必须保留历史和原因。
- 视频列表和详情页展示发布状态、最紧急待办和下一动作。

### 3.2 本期不做

- 自动上传或半自动上传平台。
- 平台 API、账号授权、token、Cookie、登录态或自动同步。
- cron、定时器或后台自动抓数。
- P12 运营复盘看板、跨作品 A/B 分析、热点或小说策略自动回流。
- AI 分镜、外部视频生成、真实外部渲染或云存储。
- 自动判断爆款或失败。
- 发布后自动修改小说、旁白、字幕、音频、视频或平台内容。

## 4. 产品流程

1. P9e 创建导出记录后，页面显示“已导出，可手动发布”。
2. 用户下载文件并在外部平台手动发布。
3. 用户回系统点击“登记发布结果”，填写平台、账号、链接或作品 ID、发布时间、标题和备注。
4. 保存前展示本次将冻结的版本摘要；保存后创建不可覆盖的发布记录与 24h/48h 回填节点。
5. 24h 节点到期后，用户手动回填数据；数据太少时标记“样本不足”。
6. 48h 节点到期后，用户回填数据并选择下一步决策。
7. 视频列表显示最紧急状态；视频详情发布记录抽屉展示每个平台的独立状态和冻结版本。

关键文案：

- `导出完成，不代表已发布。请手动发布后回到系统登记。`
- `这里只记录发布事实，不会上传视频，也不会连接平台账号。`
- `已发布版本不会被后续重新渲染或小说修改自动覆盖。`

## 5. 数据合同

### 5.1 VideoPublishRecord

- `id / tenantId / videoProjectId / videoUnitId / videoReferenceId`
- `exportId / renderId / freezeSnapshotId`
- `platform`：固定枚举加 `other`
- `platformAccountLabel`：自由文本展示名，不是平台账号凭据
- `platformWorkId / platformUrl`：至少填写一个
- `publishedAt / publishTitle / publishCaption / notes`
- `publishMethod = manual_record`
- `status = active | withdrawn | superseded`
- `sourceVersionRefs`：登记发布时校验并保存 export、render、reference、narration、audio、subtitle、visualPlan 的版本引用摘要
- `idempotencyToken / requestHash`
- `createdBy / createdAt / updatedAt`

### 5.2 VideoPublishFreezeSnapshot

冻结以下版本 ID 和安全摘要：

- export、render、旁白、音频、字幕、视觉方案
- 文件名、文件 key 或下载记录引用
- 标题、前三秒钩子、首屏字幕、结尾悬念
- 小说章节引用版本和安全风险摘要
- `sourceVersionRefs` 必须来自当前 export/render 链路，只保存安全版本 ID 和 versionNo

禁止保存完整章节正文、prompt、provider 原始请求/响应、密钥、连接串或调试 payload。

### 5.3 VideoMetricBackfillNode

- `windowType = h24 | h48`
- `dueAt = publishedAt + window`
- 持久状态：`pending | completed | waived`
- 派生状态：`waiting | due | overdue`
- `completedAt / waivedReason`

创建发布记录时同步创建两个节点，不使用定时器。查询列表或详情时，根据 `publishedAt`、`dueAt` 和当前时间惰性计算 waiting/due/overdue。

### 5.4 PlatformMetricSnapshot

- `publishRecordId / backfillNodeId / windowType / versionNo / isCurrent`
- `collectedAt / dataSource = manual`
- `playCount / completionRate / avgWatchSeconds`
- `likeCount / commentCount / favoriteCount / shareCount / followerGain`
- `sampleSizeLevel = insufficient | normal`
- `subjectiveRating = good | average | bad | insufficient`
- `notes / createdBy / createdAt`

更正数据必须创建新版本或更正记录，不能静默覆盖。

### 5.5 VideoPublishDecisionRecord

- `nextDecision = continue | optimize_title | optimize_narration | change_chapter | redo_video | pause_project`
- `reason / confidence = low | normal`
- `sourceMetricSnapshotIds / createdBy / createdAt`

样本不足时只能保存低置信决策，不允许输出“题材失败”等强结论。

## 6. 状态与推荐动作

发布记录持久状态、回填节点状态和页面聚合状态分开管理。

页面聚合状态：

- `exported_unpublished`
- `published_waiting_24h`
- `published_24h_overdue`
- `published_waiting_48h`
- `published_48h_overdue`
- `data_incomplete`
- `sample_insufficient`
- `reviewed`
- `version_stale_after_publish`

同一视频存在多条发布记录时，列表展示最紧急待办，详情查看每条记录。

推荐动作必须明确为：登记发布、填写 24h 数据、填写 48h 数据、查看逾期、标记样本不足、填写下一步决策、查看发布记录。

## 7. 业务门禁

- 仅当前、已确认、未过期、可导出的 render/export 可登记发布。
- 引用状态为 blocking 时禁止登记新发布，历史发布记录仍可查看和回填。
- 同平台、同账号、同作品 ID 或规范化链接不得重复创建相同发布事实。
- 同一视频可在不同平台或同平台不同作品中多次发布，每次创建独立记录。
- 已发布记录不可被新 render/export 覆盖；更正、撤销只改变记录状态并新增审计记录。
- 已发布后上游引用变化只标记异常，不自动修改平台内容。
- 删除或归档已有发布记录的视频项目必须二次确认并保存原因，不能物理删除发布历史和指标。

## 8. 幂等与审计

所有写接口必须携带 `idempotencyToken`：

- 同 token + 同 requestHash：返回首次结果。
- 同 token + 不同 requestHash：返回 `IDEMPOTENCY_CONFLICT`。
- 发布登记事务写入 PublishRecord、FreezeSnapshot、24h/48h 节点、ActionReceipt 和 OperationLog。

必须审计：登记发布、数据回填、更正、撤销、样本不足判断、下一步决策、删除或归档保护。审计保存操作人、租户、原因、前后值安全摘要和冻结版本 refs。

## 9. API 合同草案

- `GET /videos/:videoId/publishing`
- `POST /videos/:videoId/publish-records`
- `GET /videos/:videoId/publish-records`
- `GET /videos/:videoId/publish-records/:publishId`
- `POST /videos/:videoId/publish-records/:publishId/correct`
- `POST /videos/:videoId/publish-records/:publishId/withdraw`
- `GET /videos/:videoId/publish-records/:publishId/metric-nodes`
- `POST /videos/:videoId/publish-records/:publishId/metric-snapshots`
- `POST /videos/:videoId/publish-records/:publishId/review-decision`

route 只做 schema 和上下文转换；service 负责门禁、状态和事务编排；repository 负责租户隔离和持久化；不得让页面直接拼接发布对象。

删除/归档保护不新增物理删除能力。若复用既有视频项目归档或停止接口，P10 必须补测试：存在 active publish record 时，归档或删除动作必须二次确认、填写原因并写 OperationLog；不得物理删除发布记录、冻结快照和指标数据。

## 10. 安全与脱敏

- 平台链接只允许 http/https 或明确作品 ID；显示和日志中移除敏感 query 参数。
- 账号只保存公开展示名或用户自定义别名，不保存 token、Cookie、授权信息。
- 平台、账号、链接、标题、文案、备注都必须有长度、格式和控制字符校验。
- 延续 P9 sanitizer：密钥、DB URL、prompt、provider raw payload、完整章节正文不得进入 API metadata、任务摘要、普通日志、前端 storage。
- 所有查询和唯一约束必须带 tenantId。

## 11. 页面信息架构

视频详情：

- 导出区：当前确认版本、导出记录、下载入口。
- 发布区：登记发布、发布记录列表、冻结版本摘要。
- 数据区：24h/48h 回填卡片、逾期和数据不完整提示。
- 决策区：下一步选项、备注和低置信提示。

视频列表：

- 发布状态列、数据回填状态列、最紧急推荐动作。
- 筛选：可发布、已发布、待 24h、待 48h、回填逾期、样本不足。

## 12. 分包顺序

1. `P10-preflight`：关闭小说 `creationSource` 合同缺口，刷新工作树检查点。
2. `P10-R0`：冻结 shared DTO、状态、错误码、脱敏、审计和无定时器计算口径。
3. `P10-R1`：发布记录、冻结快照、幂等、门禁、in-memory 和 Prisma migration draft。
4. `P10-R2`：24h/48h 回填节点、metric snapshot、更正、样本不足和决策。
5. `P10-R3`：视频详情与列表的人工发布/回填 UI。
6. `P10-R4`：跨层测试、浏览器验收、边界扫描和收口。
7. `P10-L1`：仅在安全数据库环境和主控明确授权后执行真实 MySQL/Prisma live smoke。

## 13. 验收 fixture

- `video-publishable-001`：已有 confirmed_exportable render 和有效 export，可登记发布。
- `video-unexportable-001`：未预览确认或缺 export，登记发布应阻断。
- `video-stale-export-001`：旁白、音频、字幕、视觉方案或引用版本已变化，旧 export stale。
- `video-multi-platform-001`：同一 export 已在一个平台发布，可登记第二平台。
- `video-duplicate-business-001`：同平台、同账号、同作品 ID 或规范化链接已存在，业务重复应阻断。
- `video-published-overdue-001`：24h/48h 到期未填，读侧派生 overdue。
- `video-low-sample-001`：播放量低于样本阈值，只能低置信决策。
- `video-reference-warning-001` / `video-reference-blocking-001`：发布前后引用异常处理。
- `video-published-delete-protected-001`：已有发布记录，删除或归档必须二次确认并保留历史。

## 14. 核心验收矩阵

- 未确认、过期或不可导出的版本不能登记发布。
- blocking 引用不能登记新发布。
- 发布登记创建冻结快照和 24h/48h 节点。
- 幂等同请求复用，不同请求冲突。
- 多平台、多次发布互不覆盖；业务重复被阻止。
- 后续重新渲染不改变历史发布快照。
- 24h/48h 到期与逾期在无定时器下正确派生。
- 数据更正保留历史和原因。
- 样本不足只产生低置信决策。
- 已发布后的引用异常不自动修改平台内容。
- 页面明确“导出不等于发布”，不存在自动上传、平台 token、平台 API 或 P12 看板。
- mock/in-memory 通过不能被表述为真实 MySQL/Prisma 写路径通过。

## 15. 阻塞标准

- 未确认、过期、stale 或不可导出的 export/render 仍能登记发布。
- 发布记录未冻结具体 export、render、旁白、音频、字幕、视觉方案和引用版本。
- 同 token 同请求未复用，或同 token 不同请求未返回 `IDEMPOTENCY_CONFLICT`。
- 多平台或多次发布覆盖旧记录，或同平台同账号同作品的业务重复未被阻断。
- 24h/48h 节点未创建，或 due/overdue 依赖定时器才能正确显示。
- 数据更正、撤销、样本不足或下一步决策无原因、无历史或无审计。
- 样本不足仍输出高置信结论。
- 已发布后引用异常自动覆盖平台内容或历史发布快照。
- 已发布项目可被物理删除，或删除/归档无二次确认和原因。
- 页面或 API 出现自动上传、平台 token、平台 API、cron 自动同步或 P12 复盘看板。
- mock/in-memory 通过被表述为真实 MySQL/Prisma 写路径通过。
