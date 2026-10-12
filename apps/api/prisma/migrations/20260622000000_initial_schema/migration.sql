-- Baseline generated from apps/api/prisma/schema.prisma at f7ad798
-- (Git blob 3715e9ed320f749ecd0b1422b59953d749c8e93b).
-- Keep later incremental migrations separate; do not regenerate from the current schema.

-- CreateTable
CREATE TABLE `tenant` (
    `id` VARCHAR(32) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `metadata` JSON NULL,

    UNIQUE INDEX `tenant_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_user` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `display_name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(160) NOT NULL,
    `role` VARCHAR(50) NOT NULL DEFAULT 'owner',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `metadata` JSON NULL,

    INDEX `app_user_tenant_id_role_idx`(`tenant_id`, `role`),
    UNIQUE INDEX `app_user_tenant_id_email_key`(`tenant_id`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hotspot_report` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `source` VARCHAR(50) NOT NULL DEFAULT 'manual',
    `opportunity_json` JSON NULL,
    `risk_tags_json` JSON NULL,
    `created_by` VARCHAR(32) NULL,
    `updated_by` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `metadata` JSON NULL,

    INDEX `hotspot_report_tenant_id_created_at_idx`(`tenant_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `policy_profile_version` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `key` VARCHAR(120) NOT NULL,
    `version_no` INTEGER NOT NULL,
    `status` ENUM('candidate', 'current', 'historical', 'discarded', 'stale') NOT NULL DEFAULT 'candidate',
    `summary` TEXT NOT NULL,
    `config_json` JSON NOT NULL,
    `created_by` VARCHAR(32) NULL,
    `updated_by` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `metadata` JSON NULL,

    INDEX `policy_profile_version_tenant_id_key_status_idx`(`tenant_id`, `key`, `status`),
    UNIQUE INDEX `policy_profile_version_tenant_id_key_version_no_key`(`tenant_id`, `key`, `version_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prompt_template_version` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `template_key` VARCHAR(120) NOT NULL,
    `version_no` INTEGER NOT NULL,
    `status` ENUM('candidate', 'current', 'historical', 'discarded', 'stale') NOT NULL DEFAULT 'candidate',
    `summary` TEXT NOT NULL,
    `input_schema_json` JSON NULL,
    `output_schema_json` JSON NULL,
    `created_by` VARCHAR(32) NULL,
    `updated_by` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `metadata` JSON NULL,

    INDEX `prompt_template_version_tenant_id_template_key_status_idx`(`tenant_id`, `template_key`, `status`),
    UNIQUE INDEX `prompt_template_version_tenant_id_template_key_version_no_key`(`tenant_id`, `template_key`, `version_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `model_provider` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `provider_key` VARCHAR(80) NOT NULL,
    `provider_type` VARCHAR(50) NOT NULL,
    `display_name` VARCHAR(120) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `config_summary` TEXT NOT NULL,
    `created_by` VARCHAR(32) NULL,
    `updated_by` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `metadata` JSON NULL,

    INDEX `model_provider_tenant_id_provider_type_enabled_idx`(`tenant_id`, `provider_type`, `enabled`),
    UNIQUE INDEX `model_provider_tenant_id_provider_key_key`(`tenant_id`, `provider_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `model_config` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `provider_id` VARCHAR(32) NOT NULL,
    `model_key` VARCHAR(120) NOT NULL,
    `display_name` VARCHAR(120) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `usage_scope` VARCHAR(80) NOT NULL,
    `default_params_json` JSON NULL,
    `created_by` VARCHAR(32) NULL,
    `updated_by` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `metadata` JSON NULL,

    INDEX `model_config_tenant_id_provider_id_enabled_idx`(`tenant_id`, `provider_id`, `enabled`),
    UNIQUE INDEX `model_config_tenant_id_model_key_key`(`tenant_id`, `model_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `novel` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `owner_id` VARCHAR(32) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `channel` VARCHAR(80) NOT NULL DEFAULT 'novel',
    `genres_json` JSON NULL,
    `lifecycle_status` ENUM('active', 'paused', 'archived', 'deleted') NOT NULL DEFAULT 'active',
    `creation_stage` ENUM('draft', 'direction', 'setting', 'outline', 'chapter_plan', 'trial', 'body', 'full_review', 'completion_confirm', 'video_ready') NOT NULL DEFAULT 'draft',
    `stage_status` ENUM('not_started', 'processing', 'waiting_user', 'blocked', 'failed', 'completed') NOT NULL DEFAULT 'not_started',
    `current_direction_version_id` VARCHAR(32) NULL,
    `current_setting_version_id` VARCHAR(32) NULL,
    `current_outline_version_id` VARCHAR(32) NULL,
    `current_stage_outline_version_id` VARCHAR(32) NULL,
    `current_chapter_plan_version_id` VARCHAR(32) NULL,
    `current_trial_run_id` VARCHAR(32) NULL,
    `current_full_review_report_id` VARCHAR(32) NULL,
    `current_full_review_gate_id` VARCHAR(32) NULL,
    `current_completion_decision_id` VARCHAR(32) NULL,
    `current_video_readiness_snapshot_id` VARCHAR(32) NULL,
    `policy_profile_version_id` VARCHAR(32) NULL,
    `hotspot_report_id` VARCHAR(32) NULL,
    `chapter_limit` INTEGER NOT NULL DEFAULT 100,
    `chapter_word_min` INTEGER NOT NULL DEFAULT 1800,
    `chapter_word_max` INTEGER NOT NULL DEFAULT 2600,
    `summary` TEXT NULL,
    `pause_reason` TEXT NULL,
    `archive_reason` TEXT NULL,
    `display_status` VARCHAR(80) NULL,
    `current_step` VARCHAR(120) NULL,
    `completed_steps_json` JSON NULL,
    `recommended_action_snapshot` JSON NULL,
    `video_reference_status` VARCHAR(80) NULL,
    `created_by` VARCHAR(32) NULL,
    `updated_by` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `metadata` JSON NULL,

    INDEX `novel_tenant_id_owner_id_lifecycle_status_updated_at_idx`(`tenant_id`, `owner_id`, `lifecycle_status`, `updated_at`),
    INDEX `novel_tenant_id_creation_stage_stage_status_updated_at_idx`(`tenant_id`, `creation_stage`, `stage_status`, `updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `create_novel_preferences` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `novel_id` VARCHAR(32) NOT NULL,
    `hotspot_report_id` VARCHAR(32) NULL,
    `hotspot_opportunity_id` VARCHAR(80) NULL,
    `appeal_points_json` JSON NULL,
    `genres_json` JSON NULL,
    `opening_state` TEXT NULL,
    `blocked_elements_json` JSON NULL,
    `target_audience` VARCHAR(120) NULL,
    `chapter_limit` INTEGER NOT NULL DEFAULT 100,
    `chapter_word_min` INTEGER NOT NULL DEFAULT 1800,
    `chapter_word_max` INTEGER NOT NULL DEFAULT 2600,
    `stage_count` INTEGER NULL,
    `custom_idea` TEXT NULL,
    `style` VARCHAR(120) NULL,
    `video_adaptation_preference` VARCHAR(80) NULL,
    `created_by` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metadata` JSON NULL,

    UNIQUE INDEX `create_novel_preferences_novel_id_key`(`novel_id`),
    INDEX `create_novel_preferences_tenant_id_hotspot_report_id_idx`(`tenant_id`, `hotspot_report_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `creative_version` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `novel_id` VARCHAR(32) NOT NULL,
    `object_type` VARCHAR(80) NOT NULL,
    `object_id` VARCHAR(80) NOT NULL,
    `version_no` INTEGER NOT NULL,
    `status` ENUM('candidate', 'current', 'historical', 'discarded', 'stale') NOT NULL DEFAULT 'candidate',
    `stale_level` ENUM('none', 'soft_stale', 'hard_stale', 'risk_stale') NOT NULL DEFAULT 'none',
    `source_type` VARCHAR(50) NULL,
    `source_task_id` VARCHAR(32) NULL,
    `source_version_refs` JSON NULL,
    `change_reason` TEXT NULL,
    `content_json` JSON NOT NULL,
    `summary` TEXT NULL,
    `score` DECIMAL(5, 2) NULL,
    `risk_level` ENUM('none', 'low', 'medium', 'high', 'blocking') NOT NULL DEFAULT 'none',
    `review_report_id` VARCHAR(32) NULL,
    `prompt_template_version_id` VARCHAR(32) NULL,
    `policy_profile_version_id` VARCHAR(32) NULL,
    `decision_record_id` VARCHAR(32) NULL,
    `created_by` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metadata` JSON NULL,

    INDEX `creative_version_tenant_id_novel_id_object_type_object_id_st_idx`(`tenant_id`, `novel_id`, `object_type`, `object_id`, `status`),
    UNIQUE INDEX `creative_version_tenant_id_novel_id_object_type_object_id_ve_key`(`tenant_id`, `novel_id`, `object_type`, `object_id`, `version_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `novel_chapter` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `novel_id` VARCHAR(32) NOT NULL,
    `chapter_no` INTEGER NOT NULL,
    `stage_index` INTEGER NULL,
    `title` VARCHAR(200) NOT NULL,
    `word_target` INTEGER NULL,
    `word_count` INTEGER NOT NULL DEFAULT 0,
    `main_status` VARCHAR(40) NOT NULL DEFAULT 'pending',
    `status_note` TEXT NULL,
    `impact_level` ENUM('none', 'minor', 'medium', 'severe') NOT NULL DEFAULT 'none',
    `current_feature_card_version_id` VARCHAR(32) NULL,
    `current_content_version_id` VARCHAR(32) NULL,
    `current_review_report_id` VARCHAR(32) NULL,
    `last_generation_task_id` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `metadata` JSON NULL,

    INDEX `novel_chapter_tenant_id_novel_id_main_status_updated_at_idx`(`tenant_id`, `novel_id`, `main_status`, `updated_at`),
    UNIQUE INDEX `novel_chapter_tenant_id_novel_id_chapter_no_key`(`tenant_id`, `novel_id`, `chapter_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chapter_feature_card` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `novel_id` VARCHAR(32) NOT NULL,
    `chapter_id` VARCHAR(32) NOT NULL,
    `version_no` INTEGER NOT NULL,
    `status` ENUM('candidate', 'current', 'historical', 'discarded', 'stale') NOT NULL DEFAULT 'candidate',
    `stale_level` ENUM('none', 'soft_stale', 'hard_stale', 'risk_stale') NOT NULL DEFAULT 'none',
    `one_line_summary` TEXT NULL,
    `core_task` TEXT NULL,
    `main_conflict` TEXT NULL,
    `appeal_point` TEXT NULL,
    `emotion_keywords_json` JSON NULL,
    `character_changes_json` JSON NULL,
    `relationship_changes_json` JSON NULL,
    `key_information_json` JSON NULL,
    `foreshadowing_operation` TEXT NULL,
    `ending_hook` TEXT NULL,
    `facts_cannot_change_json` JSON NULL,
    `features_to_strengthen_json` JSON NULL,
    `source_task_id` VARCHAR(32) NULL,
    `decision_record_id` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metadata` JSON NULL,

    INDEX `chapter_feature_card_tenant_id_novel_id_chapter_id_status_idx`(`tenant_id`, `novel_id`, `chapter_id`, `status`),
    UNIQUE INDEX `chapter_feature_card_tenant_id_chapter_id_version_no_key`(`tenant_id`, `chapter_id`, `version_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chapter_content_version` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `novel_id` VARCHAR(32) NOT NULL,
    `chapter_id` VARCHAR(32) NOT NULL,
    `version_no` INTEGER NOT NULL,
    `status` ENUM('candidate', 'current', 'historical', 'discarded', 'stale') NOT NULL DEFAULT 'candidate',
    `stale_level` ENUM('none', 'soft_stale', 'hard_stale', 'risk_stale') NOT NULL DEFAULT 'none',
    `source_type` VARCHAR(50) NULL,
    `source_task_id` VARCHAR(32) NULL,
    `source_version_refs` JSON NULL,
    `rewrite_reason` TEXT NULL,
    `content` LONGTEXT NOT NULL,
    `word_count` INTEGER NOT NULL DEFAULT 0,
    `summary` TEXT NULL,
    `review_score` DECIMAL(5, 2) NULL,
    `decision_record_id` VARCHAR(32) NULL,
    `created_by` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metadata` JSON NULL,

    INDEX `chapter_content_version_tenant_id_chapter_id_status_idx`(`tenant_id`, `chapter_id`, `status`),
    UNIQUE INDEX `chapter_content_version_tenant_id_chapter_id_version_no_key`(`tenant_id`, `chapter_id`, `version_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `review_report` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `novel_id` VARCHAR(32) NOT NULL,
    `object_type` VARCHAR(80) NOT NULL,
    `object_id` VARCHAR(80) NOT NULL,
    `object_version_id` VARCHAR(32) NULL,
    `review_level` VARCHAR(80) NOT NULL,
    `total_score` DECIMAL(5, 2) NULL,
    `sub_scores_json` JSON NULL,
    `rating` VARCHAR(50) NULL,
    `summary` TEXT NULL,
    `strengths_json` JSON NULL,
    `problems_json` JSON NULL,
    `suggestions_json` JSON NULL,
    `issue_cards_json` JSON NULL,
    `action_options_json` JSON NULL,
    `recommended_action` VARCHAR(120) NULL,
    `allow_next_step` BOOLEAN NOT NULL DEFAULT false,
    `blocking_issue_count` INTEGER NOT NULL DEFAULT 0,
    `resolved_status` VARCHAR(50) NULL,
    `prompt_template_version_id` VARCHAR(32) NULL,
    `policy_profile_version_id` VARCHAR(32) NULL,
    `source_task_id` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metadata` JSON NULL,

    INDEX `review_report_tenant_id_novel_id_object_type_object_id_creat_idx`(`tenant_id`, `novel_id`, `object_type`, `object_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `generation_task` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `novel_id` VARCHAR(32) NULL,
    `task_type` VARCHAR(100) NOT NULL,
    `object_type` VARCHAR(80) NULL,
    `object_id` VARCHAR(80) NULL,
    `parent_task_id` VARCHAR(32) NULL,
    `batch_id` VARCHAR(80) NULL,
    `status` ENUM('queued', 'processing', 'waiting_confirmation', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'queued',
    `status_note` TEXT NULL,
    `progress` INTEGER NOT NULL DEFAULT 0,
    `current_step` VARCHAR(120) NULL,
    `trigger_source` VARCHAR(80) NULL,
    `source_version_refs` JSON NULL,
    `conflict_scope` VARCHAR(80) NULL,
    `conflict_key` VARCHAR(160) NULL,
    `prompt_template_version_id` VARCHAR(32) NULL,
    `policy_profile_version_id` VARCHAR(32) NULL,
    `input_summary` TEXT NULL,
    `output_summary` TEXT NULL,
    `input_units` INTEGER NULL,
    `output_units` INTEGER NULL,
    `estimated_cost` DECIMAL(12, 4) NULL,
    `actual_cost` DECIMAL(12, 4) NULL,
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `max_retries` INTEGER NOT NULL DEFAULT 2,
    `failure_category` VARCHAR(80) NULL,
    `error_code` VARCHAR(80) NULL,
    `error_message` TEXT NULL,
    `retry_of_task_id` VARCHAR(32) NULL,
    `idempotency_token` VARCHAR(120) NULL,
    `request_hash` VARCHAR(128) NULL,
    `result_object_type` VARCHAR(80) NULL,
    `result_object_id` VARCHAR(80) NULL,
    `result_version_id` VARCHAR(32) NULL,
    `user_accepted_result` BOOLEAN NOT NULL DEFAULT false,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `last_heartbeat_at` DATETIME(3) NULL,
    `cancel_requested_at` DATETIME(3) NULL,
    `cancel_reason` TEXT NULL,
    `created_by` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `metadata` JSON NULL,

    INDEX `generation_task_tenant_id_status_created_at_idx`(`tenant_id`, `status`, `created_at`),
    INDEX `generation_task_tenant_id_novel_id_task_type_status_idx`(`tenant_id`, `novel_id`, `task_type`, `status`),
    INDEX `generation_task_tenant_id_conflict_scope_conflict_key_status_idx`(`tenant_id`, `conflict_scope`, `conflict_key`, `status`),
    UNIQUE INDEX `generation_task_tenant_id_idempotency_token_key`(`tenant_id`, `idempotency_token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `generation_task_event` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `task_id` VARCHAR(32) NOT NULL,
    `status` ENUM('queued', 'processing', 'waiting_confirmation', 'completed', 'failed', 'cancelled') NOT NULL,
    `event_type` VARCHAR(80) NOT NULL,
    `message` TEXT NULL,
    `progress` INTEGER NULL,
    `payload_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `generation_task_event_tenant_id_task_id_created_at_idx`(`tenant_id`, `task_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asset_decision_record` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `novel_id` VARCHAR(32) NOT NULL,
    `action_type` VARCHAR(80) NOT NULL,
    `object_type` VARCHAR(80) NOT NULL,
    `object_id` VARCHAR(80) NOT NULL,
    `candidate_version_id` VARCHAR(32) NULL,
    `current_version_id_before` VARCHAR(32) NULL,
    `current_version_id_after` VARCHAR(32) NULL,
    `decision_reason` TEXT NULL,
    `is_forced` BOOLEAN NOT NULL DEFAULT false,
    `risk_summary` TEXT NULL,
    `impact_summary` TEXT NULL,
    `page_version_snapshot` JSON NULL,
    `source_task_id` VARCHAR(32) NULL,
    `created_by` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metadata` JSON NULL,

    INDEX `asset_decision_record_tenant_id_novel_id_action_type_created_idx`(`tenant_id`, `novel_id`, `action_type`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operation_log` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `user_id` VARCHAR(32) NULL,
    `novel_id` VARCHAR(32) NULL,
    `action` VARCHAR(100) NOT NULL,
    `object_type` VARCHAR(80) NULL,
    `object_id` VARCHAR(80) NULL,
    `before_snapshot` JSON NULL,
    `after_snapshot` JSON NULL,
    `reason` TEXT NULL,
    `impact_summary` TEXT NULL,
    `source_task_id` VARCHAR(32) NULL,
    `request_id` VARCHAR(120) NULL,
    `ip` VARCHAR(80) NULL,
    `user_agent` VARCHAR(300) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metadata` JSON NULL,

    INDEX `operation_log_tenant_id_novel_id_action_created_at_idx`(`tenant_id`, `novel_id`, `action`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `impact_case` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `novel_id` VARCHAR(32) NOT NULL,
    `source_object_type` VARCHAR(80) NOT NULL,
    `source_object_id` VARCHAR(80) NOT NULL,
    `source_old_version_id` VARCHAR(32) NULL,
    `source_new_version_id` VARCHAR(32) NULL,
    `impact_level` ENUM('none', 'minor', 'medium', 'severe') NOT NULL DEFAULT 'none',
    `status` VARCHAR(40) NOT NULL DEFAULT 'open',
    `affected_chapter_ids_json` JSON NULL,
    `affected_video_reference_ids_json` JSON NULL,
    `summary` TEXT NULL,
    `suggested_actions_json` JSON NULL,
    `decision_record_id` VARCHAR(32) NULL,
    `source_task_id` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolved_at` DATETIME(3) NULL,
    `metadata` JSON NULL,

    INDEX `impact_case_tenant_id_novel_id_impact_level_status_idx`(`tenant_id`, `novel_id`, `impact_level`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `long_term_memory` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `novel_id` VARCHAR(32) NOT NULL,
    `chapter_id` VARCHAR(32) NULL,
    `source_content_version_id` VARCHAR(32) NULL,
    `previous_summary` TEXT NULL,
    `character_states_json` JSON NULL,
    `relationship_states_json` JSON NULL,
    `locations_json` JSON NULL,
    `organizations_json` JSON NULL,
    `items_json` JSON NULL,
    `planted_foreshadowing_json` JSON NULL,
    `resolved_foreshadowing_json` JSON NULL,
    `unresolved_conflicts_json` JSON NULL,
    `new_settings_json` JSON NULL,
    `facts_cannot_contradict_json` JSON NULL,
    `status` ENUM('candidate', 'current', 'historical', 'discarded', 'stale') NOT NULL DEFAULT 'current',
    `stale_level` ENUM('none', 'soft_stale', 'hard_stale', 'risk_stale') NOT NULL DEFAULT 'none',
    `source_task_id` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metadata` JSON NULL,

    INDEX `long_term_memory_tenant_id_novel_id_chapter_id_status_idx`(`tenant_id`, `novel_id`, `chapter_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trial_run` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `novel_id` VARCHAR(32) NOT NULL,
    `chapter_plan_version_id` VARCHAR(32) NULL,
    `trial_chapter_count` INTEGER NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'created',
    `total_score` DECIMAL(5, 2) NULL,
    `trial_result` VARCHAR(80) NULL,
    `review_report_id` VARCHAR(32) NULL,
    `policy_profile_version_id` VARCHAR(32) NULL,
    `source_task_id` VARCHAR(32) NULL,
    `confirmed_at` DATETIME(3) NULL,
    `confirmed_by` VARCHAR(32) NULL,
    `force_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `metadata` JSON NULL,

    INDEX `trial_run_tenant_id_novel_id_status_idx`(`tenant_id`, `novel_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trial_chapter_result` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `trial_run_id` VARCHAR(32) NOT NULL,
    `chapter_id` VARCHAR(32) NOT NULL,
    `content_version_id` VARCHAR(32) NULL,
    `feature_card_version_id` VARCHAR(32) NULL,
    `review_report_id` VARCHAR(32) NULL,
    `score` DECIMAL(5, 2) NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'created',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metadata` JSON NULL,

    INDEX `trial_chapter_result_tenant_id_trial_run_id_status_idx`(`tenant_id`, `trial_run_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `full_review_gate` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `novel_id` VARCHAR(32) NOT NULL,
    `review_report_id` VARCHAR(32) NOT NULL,
    `gate_result` VARCHAR(80) NOT NULL,
    `allow_completion` BOOLEAN NOT NULL DEFAULT false,
    `allow_video_ready` BOOLEAN NOT NULL DEFAULT false,
    `blocking_issue_count` INTEGER NOT NULL DEFAULT 0,
    `warning_issue_count` INTEGER NOT NULL DEFAULT 0,
    `is_stale` BOOLEAN NOT NULL DEFAULT false,
    `stale_reason` TEXT NULL,
    `policy_profile_version_id` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metadata` JSON NULL,

    INDEX `full_review_gate_tenant_id_novel_id_is_stale_created_at_idx`(`tenant_id`, `novel_id`, `is_stale`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `completion_decision_record` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `novel_id` VARCHAR(32) NOT NULL,
    `review_report_id` VARCHAR(32) NULL,
    `full_review_gate_id` VARCHAR(32) NULL,
    `decision` VARCHAR(80) NOT NULL,
    `decision_reason` TEXT NULL,
    `is_forced` BOOLEAN NOT NULL DEFAULT false,
    `score` DECIMAL(5, 2) NULL,
    `risk_summary` TEXT NULL,
    `created_by` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metadata` JSON NULL,

    INDEX `completion_decision_record_tenant_id_novel_id_created_at_idx`(`tenant_id`, `novel_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `video_readiness_snapshot` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `novel_id` VARCHAR(32) NOT NULL,
    `full_review_gate_id` VARCHAR(32) NULL,
    `completion_decision_id` VARCHAR(32) NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'candidate',
    `check_items_json` JSON NULL,
    `chapter_count` INTEGER NOT NULL DEFAULT 0,
    `total_word_count` INTEGER NOT NULL DEFAULT 0,
    `estimated_audio_minutes` DECIMAL(8, 2) NULL,
    `risk_summary` TEXT NULL,
    `referable_chapter_ids_json` JSON NULL,
    `referable_chapter_version_ids_json` JSON NULL,
    `first_video_suggestion_json` JSON NULL,
    `created_by` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metadata` JSON NULL,

    INDEX `video_readiness_snapshot_tenant_id_novel_id_status_created_a_idx`(`tenant_id`, `novel_id`, `status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `video_reference` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `video_project_id` VARCHAR(32) NOT NULL,
    `novel_id` VARCHAR(32) NOT NULL,
    `video_readiness_snapshot_id` VARCHAR(32) NOT NULL,
    `chapter_ids_json` JSON NULL,
    `chapter_content_version_ids_json` JSON NULL,
    `review_report_id` VARCHAR(32) NULL,
    `risk_summary` TEXT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'normal',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metadata` JSON NULL,

    INDEX `video_reference_tenant_id_novel_id_status_idx`(`tenant_id`, `novel_id`, `status`),
    INDEX `video_reference_tenant_id_video_project_id_idx`(`tenant_id`, `video_project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `video_reference_issue` (
    `id` VARCHAR(32) NOT NULL,
    `tenant_id` VARCHAR(32) NOT NULL,
    `video_project_id` VARCHAR(32) NOT NULL,
    `video_reference_id` VARCHAR(32) NOT NULL,
    `novel_id` VARCHAR(32) NOT NULL,
    `issue_level` ENUM('none', 'minor', 'medium', 'severe') NOT NULL DEFAULT 'minor',
    `issue_reason` TEXT NOT NULL,
    `affected_chapter_ids_json` JSON NULL,
    `source_change_object_type` VARCHAR(80) NULL,
    `source_change_object_id` VARCHAR(80) NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'open',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolved_at` DATETIME(3) NULL,
    `metadata` JSON NULL,

    INDEX `video_reference_issue_tenant_id_novel_id_issue_level_status_idx`(`tenant_id`, `novel_id`, `issue_level`, `status`),
    INDEX `video_reference_issue_tenant_id_video_reference_id_status_idx`(`tenant_id`, `video_reference_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
