# 任务包 7：全书审稿、完成确认和待视频化详细设计

本文档是任务包 7 的研发和测试总入口。任务包 7 承接任务包 6 的正文完成结果，负责把小说从“待全书审稿”推进到“小说已完成并可被视频模块引用”。

任务包 7 的核心口径是：全书审稿、完成确认、待视频化检查、视频化快照。它收口小说 P0 主链路，但不进入正式视频生产链路。

任务包 7 必须同时对齐：

- `docs/modules/novel-full-review-gate.md`
- `docs/modules/novel-video-readiness.md`
- `docs/modules/novel-state-machine.md`
- `docs/modules/novel-state-gate-action-contract.md`
- `docs/modules/novel-api-contract.md`
- `docs/modules/novel-hit-content-integration-matrix.md`
- `docs/modules/novel-hit-content-planning.md`
- `docs/modules/content-safety-platform-risk.md`
- `docs/modules/generation-task-lifecycle.md`
- `docs/modules/novel-task-concurrency-contract.md`

## 设计原则

- 质量收口：全书审稿必须检查整本小说是否完整、连贯、有追更感、适合视频化。
- 用户决策：全书审稿报告自动保存，但小说完成和进入待视频化都必须由用户确认。
- 两步确认：完成确认和待视频化确认是两个动作，不能合并成一个按钮。
- 门禁可追溯：完成门禁、用户强制继续、待视频化快照都要记录来源版本和用户原因。
- 不绕过强阻塞：缺正文、缺特性卡、影响案例未关闭、内容安全高风险、审稿过期等不能靠“接受风险”跳过。
- 小白可理解：页面不只显示分数，还要告诉用户“能不能完成、为什么不能、下一步处理哪里”。
- 视频只承接：任务包 7 只让小说进入 `video_ready`，不创建视频项目，不做 TTS、字幕、渲染或发布。

## 派发前置

任务包 7 只能在任务包 6 完成正式验收后派发。

派发前必须确认：

- 任务包 6 研发完成，并经过测试会话独立验收。
- 测试结论为通过，或测试结论为可接受风险且需求主控明确接受。
- 如果任务包 6 测试结论为阻塞，必须先完成修复和复验，不能派发任务包 7。
- 小说可以稳定表达“正文批量生成阶段完成，待全书审稿”。
- 批量正文幂等、章节版本、章节特性卡、单章审稿、长篇记忆和影响案例基础数据可追溯。

当前特别注意：如果任务包 6 的批量正文 `idempotencyKey` 阻塞缺陷尚未修复，任务包 7 不能进入研发。

## 范围边界

### 本包做

- 正式全书 AI 审稿入口和门禁。
- 全书审稿异步任务 `novel_full_review`。
- 全书审稿报告 `ReviewReport(reviewLevel=full_novel)`。
- 完成门禁 `FullReviewGate`。
- 全书问题卡片。
- 全书问题处理、接受风险和重新审稿入口。
- 用户强制通过低分全书审稿的原因记录。
- 用户确认小说完成。
- 完成决策记录 `CompletionDecisionRecord`。
- 待视频化检查 `video_readiness_check`。
- 待视频化检查清单。
- 首条视频建议。
- 用户确认进入待视频化。
- 待视频化快照 `VideoReadinessSnapshot`。
- 小说状态进入 `creationStage=video_ready`。
- 小说列表和详情工作台展示待视频化状态、视频化快照和跳转视频列表入口。

### 本包不做

- 不创建视频项目。
- 不生成 TTS。
- 不生成字幕。
- 不渲染视频。
- 不发布平台。
- 不做视频详情页复杂能力。
- 不做视频引用异常处理的完整闭环，引用异常放到任务包 8。
- 不做复杂分镜、镜头脚本或素材编排。
- 不做自动批量重写全书。
- 不做评分自动学习和自动调权重。

## 任务包 6 到任务包 7 的交界

任务包 6 的终点应该是：

- `creationStage=body`
- `stageStatus=completed`
- 页面展示“待全书审稿”
- 主推荐动作是“全书 AI 审稿”

任务包 7 用户触发全书审稿后，才进入：

- `creationStage=full_review`
- `stageStatus=processing`
- 创建 `novel_full_review` 任务

如果任务包 6 只是生成了只读风险预览，不能当作正式全书审稿报告使用。

## 全书审稿前置门禁

发起全书审稿前必须满足：

- 小说生命周期为 `active`。
- 小说处于 `body` 阶段，且正文生成已完成。
- 所有计划章节都有当前正式正文。
- 所有计划章节都有当前章节摘要或特性卡片。
- 所有计划章节都有单章审稿结果或可追溯的章节质量摘要。
- 不存在 `pending` 或 `processing` 章节。
- 不存在未处理的中等或严重影响案例。
- 不存在阻塞性的候选正文版本待确认。
- 不存在冲突任务：批量正文、单章生成、章节重写、候选采用、影响评估、长篇记忆同步、全书审稿、视频化检查。
- 当前方向、设定、全书大纲、阶段大纲、章节目录和正文版本关系未过期。
- 内容安全没有强阻塞风险。

门禁失败时：

- 不创建全书审稿任务。
- 返回统一错误结构。
- 页面展示阻塞来源和推荐动作。
- 如果是章节缺正文，推荐回到正文生成区。
- 如果是未关闭影响案例，推荐进入影响处理。
- 如果是章节特性卡缺失，推荐补齐章节摘要或重新同步章节特性。
- 如果是内容安全高风险，推荐先处理安全风险。

## 全书审稿任务

### 任务类型

任务类型建议为：

```text
novel_full_review
```

任务创建接口：

```text
POST /novels/:novelId/full-review
```

请求至少包含：

```text
idempotencyKey
expectedNovelVersion
expectedContentSnapshotVersion
reviewPolicyVersionId
sourceVersionRefs
```

规则：

- `idempotencyKey` 必填。
- 相同 `idempotencyKey` 和相同请求指纹重复提交，返回已有全书审稿任务。
- 相同 `idempotencyKey` 但请求指纹不同，返回幂等冲突错误。
- 创建任务时锁定审稿输入版本快照。
- 全书审稿期间不能同时启动批量正文、批量重写或视频化检查。

### 审稿输入

全书审稿读取结构化摘要为主，正文片段按策略分段读取。

输入包括：

- 当前方向版本。
- 当前设定档案版本。
- 当前全书大纲版本。
- 当前阶段大纲版本。
- 当前章节目录版本。
- 所有章节当前正文版本。
- 所有章节特性卡片。
- 所有章节审稿摘要。
- 试写总评和用户确认记录。
- 批量正文策略快照。
- 批次总结。
- 长篇记忆。
- 人物状态、关系状态和伏笔状态。
- 章节重写和影响评估历史。
- 内容安全和平台风险策略。
- 爆款内容策划标准和样例标签。

长篇小说不要求一次把全文塞进模型。首期可以采用：

1. 阶段级摘要审稿。
2. 问题章节重点抽样。
3. 全书汇总审稿。

### 审稿输出

全书审稿报告必须包含：

- 总分。
- 评级。
- 完成门禁结果。
- 分项评分。
- 核心优点。
- 主要问题。
- 阻塞问题数量。
- 是否建议完成。
- 是否建议视频化。
- 视频化建议。
- 首条视频建议。
- 平台风险提示。
- 原创化风险。
- AI 味风险。
- 低分继续风险。
- 审稿输入版本快照。
- 审稿策略版本。

分项评分至少包含：

- 全书完成度。
- 开篇吸引力。
- 主线清晰度。
- 长篇连贯性。
- 爽点密度。
- 爽点衰减。
- 节奏控制。
- 人设稳定性。
- 结尾完成度。
- AI 味风险。
- 原创化风险。
- 平台内容风险。
- 视频化适配。
- 首条验证潜力。

## 完成门禁

全书审稿完成后生成 `FullReviewGate`。

默认门禁策略使用 `docs/modules/review-strictness-policy.md` 的 80/70/60 档位：

| 分数 | 门禁结果 | 默认动作 |
| --- | --- | --- |
| 80 分及以上 | `pass` | 可确认完成 |
| 70-79 分 | `warning` | 可确认完成，但需要提示风险 |
| 60-69 分 | `blocked` | 默认阻塞，允许填写原因强制通过 |
| 60 分以下 | `blocked` | 强烈建议返回优化，首期不开放直接进入待视频化 |

完成门禁结果：

| 结果 | 含义 | 页面推荐动作 |
| --- | --- | --- |
| `pass` | 达到完成标准 | 确认小说完成 |
| `warning` | 可完成但有风险 | 查看风险并确认完成 |
| `blocked` | 默认不建议完成 | 优化全书问题 |
| `forced_pass` | 用户接受风险强制继续 | 确认小说完成 |

以下情况不能强制通过：

- 有进行中的主链路任务。
- 有 `pending` 或 `processing` 章节。
- 有未处理的中等或严重影响案例。
- 计划章节缺正文。
- 缺章节摘要或特性卡。
- 全书审稿报告不存在。
- 全书审稿报告已过期。
- 全书审稿基于旧版本。
- 内容安全强风险。
- 审稿任务结果基于过期上游版本。

## 全书问题卡

全书审稿的主要问题必须转成用户可处理的问题卡。

问题卡字段：

```text
issueId
title
plainDescription
severity
scopeType
scopeRefs
dimension
blocking
recommendedTarget
recommendedAction
status
acceptedReason
sourceReviewReportId
```

问题状态：

| 状态 | 含义 |
| --- | --- |
| `open` | 待处理 |
| `accepted_risk` | 用户接受风险 |
| `resolved` | 已处理 |
| `stale` | 问题来源已过期 |

常见问题类型：

- 开篇不够吸引。
- 中段重复或拖沓。
- 主线目标变弱。
- 人物关系前后不一致。
- 伏笔未回收。
- 爽点衰减。
- 结尾仓促。
- AI 味明显。
- 平台风险。
- 原创化风险。
- 视频旁白不顺。

可执行动作：

- 跳到问题章节。
- 进入章节详情重写。
- 返回阶段大纲调整节奏。
- 返回设定修正人物或世界规则。
- 标记风险可接受并填写原因。
- 重新发起全书审稿。

首期不要求自动批量修复问题，但必须能让用户知道问题在哪里、下一步处理什么。

## 全书审稿完成后的状态流转

### 审稿通过或警告

如果 `FullReviewGate` 为 `pass` 或 `warning`：

- `creationStage=completion_confirm`
- `stageStatus=waiting_user`
- 页面展示“待确认完成”
- 主推荐动作是“确认小说完成”

### 审稿阻塞

如果 `FullReviewGate` 为 `blocked` 且未强制通过：

- `creationStage=full_review`
- `stageStatus=blocked`
- 页面展示“全书需优化”
- 主推荐动作是“优化全书问题”

### 技术失败

如果全书审稿任务技术失败：

- `creationStage=full_review`
- `stageStatus=failed`
- 页面展示失败原因。
- 用户可重试全书审稿。
- 重试必须重新校验版本和门禁。

## 强制通过低分审稿

接口：

```text
POST /novels/:novelId/full-review/:reviewId/force-pass
```

请求：

```text
idempotencyKey
fullReviewGateId
expectedReviewReportVersion
reason
confirmRisk
```

规则：

- 仅允许质量分和市场判断类风险强制通过。
- 不能绕过数据完整性、任务冲突、内容安全强风险和版本过期。
- 用户必须填写原因。
- 写入 `AssetDecisionRecord` 或等价决策记录。
- 写入 `OperationLog`。
- `FullReviewGate` 进入 `forced_pass`。
- 小说进入 `completion_confirm/waiting_user`。

首期默认只允许 60-69 分强制通过。60 分以下建议返回优化，不直接开放进入待视频化。

## 确认小说完成

确认完成接口：

```text
POST /novels/:novelId/completion/confirm
```

请求：

```text
idempotencyKey
reviewReportId
fullReviewGateId
expectedReviewReportVersion
expectedNovelVersion
decision
reason
confirmRisk
```

页面确认弹窗展示：

- 小说名称。
- 全书评分和评级。
- 完成门禁结果。
- 是否建议视频化。
- 阻塞问题是否已清零。
- 仍存在的警告风险。
- 章节数。
- 总字数。
- 预计普通语速音频时长。
- 视频化建议范围。
- 用户确认后的后果：小说进入完成确认阶段，系统生成或刷新待视频化检查，但不会自动创建视频项目。

规则：

- `pass` 可直接确认。
- `warning` 必须让用户确认风险。
- `forced_pass` 必须展示强制通过原因和风险。
- `blocked` 且未强制通过时不能确认完成。
- 完成确认写入 `CompletionDecisionRecord`。
- 写入 `OperationLog`。
- 小说保持或进入 `completion_confirm`。
- 完成确认后可以自动创建或刷新 `video_readiness_check`，但必须可追踪。

完成确认不是待视频化。完成确认成功后，用户仍需要看待视频化检查清单并确认进入视频化。

## 待视频化检查

获取检查接口：

```text
GET /novels/:novelId/video-readiness
```

重新检查接口：

```text
POST /novels/:novelId/video-readiness/recheck
```

检查任务类型：

```text
video_readiness_check
```

检查清单：

| 检查项 | 通过要求 |
| --- | --- |
| 完成确认 | 用户已确认小说完成 |
| 审稿有效 | 最新全书审稿基于当前版本 |
| 章节完整 | 所有计划章节有当前正式正文 |
| 章节状态 | 无待处理或处理中章节 |
| 影响处理 | 无未关闭中等或严重影响案例 |
| 内容风险 | 无内容安全强风险 |
| 视频引用 | 当前没有冲突引用，或风险可提示 |
| 内容快照 | 能生成稳定章节引用快照 |
| 首条建议 | 能生成首条视频建议 |

待视频化检查失败时：

- 小说可以保持已确认完成。
- `creationStage` 保持 `completion_confirm`。
- 页面展示阻塞检查项。
- 主推荐动作指向阻塞来源。
- 不允许进入 `video_ready`。
- 不允许视频模块引用正式小说快照。

## 首条视频建议

任务包 7 需要生成首条视频建议，但不创建视频。

首条视频建议包含：

- 推荐章节范围。
- 推荐开篇切片。
- 前 3 秒旁白钩子。
- 首屏字幕钩子。
- 标题钩子。
- 结尾悬念。
- 适合整本、阶段、章节范围还是先做开篇试投。
- 视频化风险提示。

默认建议：

- 优先推荐前 1-3 章中冲突最强、钩子最清楚的片段。
- 如果前 1-3 章全书审稿显示吸引力不足，推荐先优化开篇，不应强推进入视频化。
- 如果中后段更适合做测试视频，可以给出补充推荐，但首条默认仍应解释为什么不选开篇。

## 确认进入待视频化

确认接口：

```text
POST /novels/:novelId/video-readiness/confirm
```

说明：`docs/modules/novel-video-readiness.md` 中出现过 `POST /novels/:novelId/confirm-video-ready` 命名。任务包 7 首期以 `POST /novels/:novelId/video-readiness/confirm` 为统一实现接口，另一个命名只作为同义旧口径，不要求重复实现。

请求：

```text
idempotencyKey
completionDecisionId
readinessCheckId
checkVersion
expectedNovelVersion
reason
confirmRisk
```

确认弹窗展示：

- 小说名称。
- 全书评分和评级。
- 完成确认时间。
- 章节数和总字数。
- 预计音频时长。
- 待视频化检查清单。
- 视频化建议。
- 首条视频建议。
- 低分或强制通过风险。
- 确认后结果：小说进入待视频化，后续可从视频模块发起创建视频项目。

确认成功后：

- 生成 `VideoReadinessSnapshot`。
- 保存引用章节范围和版本快照。
- `creationStage=video_ready`。
- `stageStatus=waiting_user` 或 `stageStatus=completed`，首期推荐使用 `completed` 表示小说主链路完成。
- 小说列表展示“待视频化”。
- 小说详情展示视频化快照。
- 返回视频列表跳转入口。

确认失败时：

- 不生成视频化快照。
- 不进入 `video_ready`。
- 返回阻塞检查项。
- 页面继续展示待处理事项。

## 数据对象

### ReviewReport

用途：保存全书审稿报告。

关键字段：

- `reviewLevel=full_novel`
- `novelId`
- `taskId`
- `totalScore`
- `rating`
- `dimensionScores`
- `summary`
- `strengths`
- `issues`
- `videoSuggestion`
- `firstVideoSuggestion`
- `platformRisks`
- `sourceVersionRefs`
- `reviewPolicyVersionId`
- `staleLevel`
- `createdAt`

### FullReviewGate

用途：保存完成门禁。

关键字段：

- `novelId`
- `reviewReportId`
- `gateResult`
- `blockingIssueCount`
- `warningIssueCount`
- `forcePassAllowed`
- `forcePassReason`
- `sourceVersionRefs`
- `staleLevel`
- `createdAt`

### FullReviewIssue

用途：保存全书问题卡。

可以作为 `ReviewReport` JSON 字段首期实现，也可以后续独立成表。首期必须保证前端可定位、可展示、可记录接受风险。

### CompletionDecisionRecord

用途：保存用户确认小说完成的决策。

关键字段：

- `novelId`
- `reviewReportId`
- `fullReviewGateId`
- `decision`
- `reason`
- `confirmRisk`
- `sourceVersionRefs`
- `wordCount`
- `chapterCount`
- `audioDurationEstimate`
- `createdBy`
- `createdAt`

### VideoReadinessSnapshot

用途：保存小说进入待视频化时的快照。

关键字段：

- `novelId`
- `completionDecisionId`
- `reviewReportId`
- `readinessStatus`
- `checkItems`
- `chapterRefs`
- `chapterVersionRefs`
- `sourceVersionRefs`
- `wordCount`
- `chapterCount`
- `audioDurationEstimate`
- `videoSuggestion`
- `firstVideoSuggestion`
- `riskSummary`
- `createdBy`
- `createdAt`

## 接口清单

任务包 7 后端接口：

- `POST /novels/:novelId/full-review`
- `GET /novels/:novelId/full-review/latest`
- `POST /novels/:novelId/full-review/:reviewId/resolve-issue`
- `POST /novels/:novelId/full-review/:reviewId/force-pass`
- `POST /novels/:novelId/completion/confirm`
- `GET /novels/:novelId/video-readiness`
- `POST /novels/:novelId/video-readiness/recheck`
- `POST /novels/:novelId/video-readiness/confirm`

所有 POST 接口要求：

- 有输入 schema 校验。
- 有统一响应结构。
- 有 `idempotencyKey` 或等价幂等令牌。
- 有版本校验。
- 有冲突任务校验。
- 高风险动作写决策记录和操作日志。

## 前端设计

### 小说列表

列表页展示：

- `待全书审稿`
- `全书审稿中`
- `全书需优化`
- `待确认完成`
- `待视频化检查`
- `待视频化`

列表页主按钮仍优先是“详情”，不直接创建视频项目。

列表行可展示轻量摘要：

- 全书评分。
- 完成门禁结果。
- 待视频化状态。
- 阻塞原因数量。
- 下一步建议。

### 小说详情工作台

任务包 7 在小说详情工作台新增或完善三个区域：

1. 全书审稿区。
2. 完成确认区。
3. 待视频化区。

全书审稿区展示：

- 发起全书审稿按钮。
- 审稿任务进度。
- 审稿报告摘要。
- 总分和评级。
- 分项评分。
- 优点和问题。
- 全书问题卡。
- 重新审稿入口。

完成确认区展示：

- 完成门禁结果。
- 风险提示。
- 确认完成按钮。
- 强制通过原因。
- 完成决策记录。

待视频化区展示：

- 待视频化检查清单。
- 首条视频建议。
- 视频化建议范围。
- 风险摘要。
- 确认进入待视频化按钮。
- 进入待视频化后的“去视频列表”入口。

### 弹窗和确认

确认完成弹窗必须说明：

- 当前小说将被标记为已完成。
- 后续会进入待视频化检查。
- 如果有低分、警告或强制通过，必须填写原因。

确认待视频化弹窗必须说明：

- 小说将允许视频模块引用。
- 系统会保存当前正文和章节版本快照。
- 后续修改小说可能导致视频引用异常。
- 本动作不会自动创建视频项目。

## 状态和推荐动作

任务包 7 需要更新统一状态摘要服务。

推荐展示矩阵：

| 条件 | 展示状态 | 主推荐动作 |
| --- | --- | --- |
| `body` 且全部章节完成 | 待全书审稿 | 全书 AI 审稿 |
| 全书审稿任务进行中 | 全书审稿中 | 查看审稿进度 |
| 全书审稿失败 | 审稿失败 | 重试全书审稿 |
| 全书审稿 blocked | 全书需优化 | 优化全书问题 |
| 全书审稿 pass/warning | 待确认完成 | 确认小说完成 |
| 已完成但视频化检查失败 | 待处理视频化阻塞 | 查看待视频化检查 |
| 已完成且视频化检查通过 | 待确认视频化 | 确认进入视频化 |
| `video_ready` | 待视频化 | 去视频列表 |

说明：

- `video_ready` 不是“已创建视频”。
- 视频引用异常属于任务包 8。
- 任务包 7 不应在列表主按钮上直接显示“创建视频项目”。

## 任务、幂等和并发

### 全书审稿任务

- 任务类型：`novel_full_review`。
- 冲突范围：小说级。
- 冲突任务：批量正文、单章生成、章节重写、影响评估、长篇记忆同步、全书审稿、视频化检查。
- 可取消：queued 或 processing 时可取消。
- 取消后：不生成完成门禁，不允许确认完成。

### 待视频化检查任务

- 任务类型：`video_readiness_check`。
- 可由完成确认后自动触发，但必须显示检查状态。
- 也可由用户手动重新检查。
- 视频化检查期间，如果章节正文变化，检查结果必须过期或取消。

### 幂等规则

所有任务创建和确认动作遵守：

- 同一 `idempotencyKey` + 同一请求指纹：返回已有任务或已有结果。
- 同一 `idempotencyKey` + 不同请求指纹：返回幂等冲突错误。
- 不同 `idempotencyKey` 但冲突范围相同：返回冲突任务摘要。

任务包 6 已暴露过批量正文幂等缺陷。任务包 7 研发时必须把幂等作为强验收项，不能只依赖按钮 loading 防重复。

## 审稿过期和回退

全书审稿报告在以下情况过期：

- 任一章节正式正文变化。
- 章节特性卡关键字段变化。
- 设定、大纲、阶段大纲或章节目录正式版本变化。
- 影响案例重新打开。
- 内容安全策略升级并要求复审。
- 长篇记忆关键版本变化。

过期后：

- 不能确认完成。
- 不能确认待视频化。
- 如果已经进入 `video_ready`，视频准备派生状态应变为不可用或引用异常，完整处理放到任务包 8。

回退规则：

- 完成确认前发现过期：回到 `full_review` 或 `body` 的阻塞态。
- 完成确认后但待视频化前发现过期：保持 `completion_confirm`，推荐重新全书审稿。
- 待视频化后发现过期：暂不删除快照，标记风险，任务包 8 处理引用异常。

## 安全和日志

不得暴露：

- API Key。
- token。
- 数据库连接串。
- 完整提示词。
- 完整模型响应。
- 未裁剪的长正文模型上下文。

允许展示：

- 审稿摘要。
- 分项评分。
- 问题卡。
- 推荐动作。
- 风险摘要。
- 首条视频建议。

日志要求：

- 全书审稿任务记录输入版本摘要，不记录完整正文和完整 prompt。
- 强制通过、确认完成、确认待视频化必须写操作日志。
- 错误响应只返回用户可理解的原因和 requestId，不返回内部堆栈。

## 验收标准

后端验收：

- 没有完成任务包 6 正文闭环时，不能发起全书审稿。
- 缺任一计划章节正文时，不能发起全书审稿。
- 缺章节特性卡时，不能发起全书审稿。
- 存在未关闭中等或严重影响案例时，不能发起全书审稿。
- 有冲突任务时，不能发起全书审稿或视频化检查。
- `POST /novels/:novelId/full-review` 创建 `novel_full_review` 任务。
- 全书审稿成功后生成 `ReviewReport` 和 `FullReviewGate`。
- `pass/warning` 能进入 `completion_confirm/waiting_user`。
- `blocked` 不能直接确认完成。
- 允许强制通过的低分审稿必须填写原因并记录。
- 全书审稿过期后不能确认完成。
- 确认完成写入 `CompletionDecisionRecord`。
- 确认完成后生成或刷新待视频化检查。
- 待视频化检查失败时，小说可保持已确认完成但不能进入 `video_ready`。
- 待视频化检查通过后，用户确认才能生成 `VideoReadinessSnapshot`。
- 确认待视频化后小说进入 `creationStage=video_ready`。
- 所有 POST 接口有 schema、幂等、版本和冲突校验。

前端验收：

- 小说列表能展示“待全书审稿”“全书需优化”“待确认完成”“待视频化”等状态。
- 小说详情能展示全书审稿入口、进度、报告和问题卡。
- 完成确认弹窗展示评分、风险、章节数、字数、音频时长和确认后果。
- 待视频化区展示检查清单、阻塞项、首条视频建议和确认入口。
- 检查失败时用户知道下一步处理哪里。
- 低分或警告确认时必须输入原因。
- 页面不能出现创建视频、TTS、字幕、渲染、发布主动作。
- 进入 `video_ready` 后只展示“去视频列表”或等价承接入口，不直接创建视频项目。

安全验收：

- API 响应、错误响应、任务摘要、普通日志、页面、console、localStorage/sessionStorage 不暴露密钥、完整提示词或完整模型响应。

## 阻塞缺陷标准

以下问题一旦出现，应阻塞任务包 7 验收通过：

- 任务包 6 未验收通过或阻塞未修复，就能进入任务包 7。
- 缺正文、缺特性卡、未关闭影响案例仍能发起全书审稿。
- 全书审稿没有保存报告或门禁。
- 全书审稿结果基于旧版本仍能确认完成。
- `blocked` 且未强制通过仍能确认完成。
- 强制通过没有原因或没有操作日志。
- 内容安全强风险仍能确认完成或进入待视频化。
- 完成确认和待视频化确认被合并成一个动作。
- 待视频化检查失败仍进入 `video_ready`。
- 进入 `video_ready` 没有保存 `VideoReadinessSnapshot`。
- 任务包 7 创建视频项目或出现 TTS、字幕、渲染、发布主流程。
- 重复点击创建多个等价全书审稿或视频化检查任务。
- 敏感信息暴露。

## 可接受风险

以下问题首期可作为可接受风险，不阻塞任务包 7：

- 全书分项评分展示是表格，不做复杂雷达图。
- 全书问题卡只支持接受风险和跳转处理，不做自动批量修复。
- 首条视频建议是结构化文本，不直接生成视频脚本。
- 视频化检查可以是同步轻量检查，只要有检查记录和可追溯结果。
- `FullReviewIssue` 首期不独立建表，存放在 `ReviewReport` 结构化 JSON 中。
- 预计音频时长按字数粗略估算，不做真实 TTS 时长。

## 和任务包 8 的交界

任务包 7 完成后，小说可以进入：

- `creationStage=video_ready`
- 页面展示“待视频化”
- 视频模块可以读取 `VideoReadinessSnapshot`

任务包 8 才开始处理：

- 从 `video_ready` 小说创建视频项目。
- 视频项目引用章节范围。
- 视频引用快照。
- 小说修改后的视频引用异常。
- 已创建视频项目的引用状态。

任务包 7 不负责创建视频，只负责让小说具备被视频系统引用的可信快照。
