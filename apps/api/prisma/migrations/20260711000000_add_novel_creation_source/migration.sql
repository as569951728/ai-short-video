-- CS-R1 migration draft: persist novel creation source in create_novel_preferences.
-- This migration has not been executed against a real MySQL database by this
-- development session. Existing rows are explicitly marked as legacy_unknown so
-- historical data is not misrepresented as a user-selected system recommendation.

ALTER TABLE `create_novel_preferences`
  ADD COLUMN `creation_source_type` ENUM('system_recommendation', 'hotspot_reference', 'manual_idea', 'legacy_unknown') NOT NULL DEFAULT 'legacy_unknown' AFTER `novel_id`,
  ADD COLUMN `hotspot_title` VARCHAR(200) NULL AFTER `hotspot_opportunity_id`,
  ADD COLUMN `hotspot_opportunity_title` VARCHAR(200) NULL AFTER `hotspot_title`;

UPDATE `create_novel_preferences`
SET `creation_source_type` = 'legacy_unknown'
WHERE `creation_source_type` = 'legacy_unknown';

ALTER TABLE `create_novel_preferences`
  ALTER COLUMN `creation_source_type` SET DEFAULT 'system_recommendation';

CREATE INDEX `create_novel_preferences_tenant_source_idx`
  ON `create_novel_preferences` (`tenant_id`, `creation_source_type`);
