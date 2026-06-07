# V1 数据模型

日期：2026-06-06

## 1. 设计原则

V1 数据模型服务一个闭环：

> 账号画像 -> 内容项目 -> 生成素材包 -> 质检评分 -> 导出 -> 手工发布记录 -> 简单复盘

V1 不做多租户，不做复杂权限，不做自动平台数据抓取。

## 2. AccountProfile

用途：

记录账号、平台和内容方向，帮助系统知道“为谁生成内容”。

字段：

- id。
- name。
- platform。
- audience。
- persona。
- tone。
- content_focus。
- forbidden_topics。
- conversion_goal。
- created_at。
- updated_at。

V1 默认：

- 可以只有 1 个账号画像。
- 用户首次使用时可跳过，系统使用默认画像。

## 3. ContentProject

用途：

一次创作就是一个内容项目。

字段：

- id。
- account_profile_id。
- title。
- goal。
- platform。
- genre。
- idea。
- status。
- selected_template_id。
- created_at。
- updated_at。

状态：

- idea。
- generated。
- editing。
- checked。
- exported。
- published。
- reviewed。

## 4. GeneratedPackage

用途：

保存系统生成的完整短视频素材包。

字段：

- id。
- content_project_id。
- hook。
- script。
- storyboard。
- subtitles。
- title_options。
- selected_title。
- cover_copy_options。
- selected_cover_copy。
- publish_copy。
- quality_score_id。
- model_run_id。
- created_at。

格式要求：

- storyboard 应支持表格结构。
- subtitles 应支持按行拆分。
- title_options 至少 5 个。
- cover_copy_options 至少 3 个。

## 5. QualityScore

用途：

记录发布前质检结果。

字段：

- id。
- generated_package_id。
- hook_strength。
- emotional_density。
- conflict_clarity。
- information_gain。
- conversational_style。
- visual_executability。
- platform_fit。
- sameness_risk。
- copyright_risk。
- ai_trace_risk。
- total_score。
- recommendations。
- created_at。

评分：

- 每项 1 到 5 分。
- 总分满分 50。
- 建议发布阈值 35。

## 6. PublishRecord

用途：

记录用户手工发布后的平台数据。

字段：

- id。
- content_project_id。
- platform。
- published_at。
- content_url。
- views。
- likes。
- comments。
- saves。
- follows。
- notes。
- created_at。
- updated_at。

V1 最低必填：

- platform。
- published_at。
- views。
- likes。
- comments。

## 7. CompetitorSample

用途：

记录竞品或爆款样本，帮助用户学习内容结构。

字段：

- id。
- platform。
- url。
- title。
- opening_hook。
- conflict。
- emotion_point。
- reversal。
- comment_keywords。
- views。
- likes。
- saves。
- comments。
- notes。
- created_at。

V1 只做手工录入。

## 8. Template

用途：

保存系统内置或用户沉淀的创作模板。

字段：

- id。
- name。
- type。
- genre。
- platform。
- description。
- structure。
- example_input。
- example_output。
- created_at。
- updated_at。

V1 模板类型：

- hook。
- script_structure。
- title。
- cover_copy。
- publish_copy。

## 9. ModelConnection

用途：

保存模型连接配置。

字段：

- id。
- provider。
- display_name。
- base_url。
- api_key_reference。
- default_model。
- is_enabled。
- last_test_status。
- last_test_at。
- created_at。
- updated_at。

注意：

- api_key_reference 不应保存明文 API Key。
- 具体密钥存储方案在技术实现阶段确定。

## 10. ModelRun

用途：

记录每次模型调用，方便追踪质量和成本。

字段：

- id。
- content_project_id。
- provider。
- model。
- task_type。
- status。
- input_summary。
- output_summary。
- error_message。
- estimated_cost。
- created_at。

task_type 可选：

- understand_idea。
- generate_hook。
- generate_script。
- generate_storyboard。
- generate_subtitles。
- generate_titles。
- generate_cover_copy。
- generate_publish_copy。
- score_quality。
- rewrite_section。

## 11. CaseStudy

用途：

保存可展示案例，用于后续系统演示和商业验证。

字段：

- id。
- content_project_id。
- title。
- original_idea。
- generated_summary。
- manual_edit_summary。
- publish_result_summary。
- lesson_learned。
- is_demo_ready。
- created_at。
- updated_at。

## 12. CustomerInterview

用途：

记录潜在客户访谈和付费信号。

字段：

- id。
- customer_type。
- contact_channel。
- pain_point。
- current_solution。
- interested_offer。
- budget_signal。
- willingness_status。
- next_action。
- notes。
- created_at。
- updated_at。

willingness_status 可选：

- unknown。
- interested。
- strong_intent。
- paid。
- rejected。

## 13. V1 数据验收

- 每个内容项目都能关联一个生成素材包。
- 每个生成素材包都能关联一次质检评分。
- 每个已发布内容都能记录至少一条发布数据。
- 每个模型调用都能记录 provider、model、task_type 和 status。
- 至少能保存 1 个可展示案例。

