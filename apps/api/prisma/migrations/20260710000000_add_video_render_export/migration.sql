CREATE TABLE `video_render` (
  `id` VARCHAR(32) NOT NULL,
  `tenant_id` VARCHAR(32) NOT NULL,
  `video_project_id` VARCHAR(32) NOT NULL,
  `video_unit_id` VARCHAR(32) NOT NULL,
  `video_reference_id` VARCHAR(32) NOT NULL,
  `version_no` INTEGER NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'candidate',
  `is_current` BOOLEAN NOT NULL DEFAULT false,
  `preview_status` VARCHAR(50) NOT NULL DEFAULT 'preview_pending',
  `preview_url` VARCHAR(1000) NOT NULL,
  `file_key` VARCHAR(500) NOT NULL,
  `duration_seconds` INTEGER NOT NULL DEFAULT 0,
  `render_mode` VARCHAR(80) NOT NULL DEFAULT 'mock_loop_background',
  `quality_mode` VARCHAR(50) NOT NULL DEFAULT 'standard',
  `quality_issues_json` JSON NULL,
  `safe_summary` TEXT NOT NULL,
  `provider_summary` JSON NOT NULL,
  `provider_route_id` VARCHAR(120) NOT NULL,
  `strategy_version` VARCHAR(120) NOT NULL,
  `source_version_refs` JSON NOT NULL,
  `rejected_reason` TEXT NULL,
  `confirmed_by` VARCHAR(32) NULL,
  `confirmed_at` DATETIME(3) NULL,
  `created_by` VARCHAR(32) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `metadata` JSON NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `video_render_tenant_id_video_project_id_version_no_key`
ON `video_render`(`tenant_id`, `video_project_id`, `version_no`);

CREATE INDEX `video_render_tenant_id_video_project_id_status_idx`
ON `video_render`(`tenant_id`, `video_project_id`, `status`);

CREATE INDEX `video_render_tenant_id_video_unit_id_is_current_idx`
ON `video_render`(`tenant_id`, `video_unit_id`, `is_current`);

CREATE INDEX `video_render_tenant_id_video_project_id_is_current_idx`
ON `video_render`(`tenant_id`, `video_project_id`, `is_current`);

CREATE TABLE `video_export` (
  `id` VARCHAR(32) NOT NULL,
  `tenant_id` VARCHAR(32) NOT NULL,
  `video_project_id` VARCHAR(32) NOT NULL,
  `video_unit_id` VARCHAR(32) NOT NULL,
  `video_reference_id` VARCHAR(32) NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'created',
  `file_key` VARCHAR(500) NOT NULL,
  `download_url` VARCHAR(1000) NOT NULL,
  `file_name` VARCHAR(200) NOT NULL,
  `render_version_id` VARCHAR(32) NOT NULL,
  `render_version_no` INTEGER NOT NULL,
  `safe_summary` TEXT NOT NULL,
  `created_by` VARCHAR(32) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `metadata` JSON NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `video_export_tenant_id_video_project_id_status_idx`
ON `video_export`(`tenant_id`, `video_project_id`, `status`);

CREATE INDEX `video_export_tenant_id_render_version_id_idx`
ON `video_export`(`tenant_id`, `render_version_id`);
