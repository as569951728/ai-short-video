-- P9b-L1 migration draft: add versioned video artifacts for narration_script.
-- This migration is reviewable support only in this package; it has not been
-- executed against a real MySQL database by the development session.
-- The current Prisma schema models video tables without explicit relation
-- fields, so this table follows the project convention of indexed reference IDs
-- rather than adding foreign keys in this draft.

CREATE TABLE `video_artifact` (
  `id` VARCHAR(32) NOT NULL,
  `tenant_id` VARCHAR(32) NOT NULL,
  `video_project_id` VARCHAR(32) NOT NULL,
  `video_unit_id` VARCHAR(32) NOT NULL,
  `video_reference_id` VARCHAR(32) NOT NULL,
  `artifact_type` VARCHAR(50) NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'candidate',
  `version_no` INTEGER NOT NULL,
  `is_current` BOOLEAN NOT NULL DEFAULT false,
  `source_version_refs` JSON NOT NULL,
  `provider_summary` JSON NOT NULL,
  `provider_route_id` VARCHAR(120) NOT NULL,
  `strategy_version` VARCHAR(120) NOT NULL,
  `quality_mode` VARCHAR(50) NOT NULL,
  `content_text` TEXT NOT NULL,
  `hook` VARCHAR(500) NOT NULL,
  `first_screen_subtitle` VARCHAR(500) NOT NULL,
  `ending_hook` VARCHAR(500) NOT NULL,
  `estimated_duration_seconds` INTEGER NOT NULL DEFAULT 0,
  `word_count` INTEGER NOT NULL DEFAULT 0,
  `risk_tags_json` JSON NULL,
  `recommendation_reason` TEXT NULL,
  `score` INTEGER NOT NULL DEFAULT 0,
  `quality_summary` TEXT NULL,
  `rejected_reason` TEXT NULL,
  `confirmed_by` VARCHAR(32) NULL,
  `confirmed_at` DATETIME(3) NULL,
  `created_by` VARCHAR(32) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `metadata` JSON NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `video_artifact_tenant_project_type_version_uq` (`tenant_id`, `video_project_id`, `artifact_type`, `version_no`),
  KEY `video_artifact_project_status_idx` (`tenant_id`, `video_project_id`, `artifact_type`, `status`),
  KEY `video_artifact_unit_current_idx` (`tenant_id`, `video_unit_id`, `artifact_type`, `is_current`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
