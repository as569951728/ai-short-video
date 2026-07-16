-- P9c migration draft: extend video_artifact for mock/local TTS audio artifacts.
-- Do not run against an unknown database without the P8b-L1 safety authorization flow.

ALTER TABLE `video_artifact`
  ADD COLUMN `duration_seconds` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `file_key` VARCHAR(500) NULL,
  ADD COLUMN `preview_url` VARCHAR(1000) NULL,
  ADD COLUMN `voice_id` VARCHAR(120) NULL,
  ADD COLUMN `voice_name` VARCHAR(120) NULL,
  ADD COLUMN `speed` DOUBLE NULL,
  ADD COLUMN `emotion` VARCHAR(50) NULL,
  ADD COLUMN `volume` INTEGER NULL;

CREATE INDEX `video_artifact_project_type_current_idx`
  ON `video_artifact`(`tenant_id`, `video_project_id`, `artifact_type`, `is_current`);
