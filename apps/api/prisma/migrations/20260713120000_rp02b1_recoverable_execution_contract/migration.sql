-- RP-02B1 is deliberately retryable after MySQL implicit DDL commits.
SET @rp02b1_schema = DATABASE();
SET @rp02b1_columns = (
  SELECT GROUP_CONCAT(`ddl` ORDER BY `position` SEPARATOR ', ')
  FROM (
    SELECT 1 `position`, 'ADD COLUMN `lease_owner_id` VARCHAR(128) NULL' `ddl`, 'lease_owner_id' `name` UNION ALL
    SELECT 2, 'ADD COLUMN `lease_token` VARCHAR(128) NULL', 'lease_token' UNION ALL
    SELECT 3, 'ADD COLUMN `lease_expires_at` DATETIME(3) NULL', 'lease_expires_at' UNION ALL
    SELECT 4, 'ADD COLUMN `execution_envelope_json` JSON NULL', 'execution_envelope_json' UNION ALL
    SELECT 5, 'ADD COLUMN `model_routing_version` VARCHAR(128) NULL', 'model_routing_version' UNION ALL
    SELECT 6, 'ADD COLUMN `provider_attempt_id` VARCHAR(128) NULL', 'provider_attempt_id' UNION ALL
    SELECT 7, 'ADD COLUMN `provider_attempt_phase` ENUM(''leased'',''prepared'',''provider_call_started'',''provider_result_validated'',''finalizing'') NULL', 'provider_attempt_phase' UNION ALL
    SELECT 8, 'ADD COLUMN `provider_dispatched_at` DATETIME(3) NULL', 'provider_dispatched_at' UNION ALL
    SELECT 9, 'ADD COLUMN `result_receipt_hash` VARCHAR(64) NULL', 'result_receipt_hash' UNION ALL
    SELECT 10, 'ADD COLUMN `result_version_ids_json` JSON NULL', 'result_version_ids_json' UNION ALL
    SELECT 11, 'ADD COLUMN `root_task_id` VARCHAR(32) NULL', 'root_task_id' UNION ALL
    SELECT 12, 'ADD COLUMN `provider_call_budget_max` INTEGER NOT NULL DEFAULT 0', 'provider_call_budget_max' UNION ALL
    SELECT 13, 'ADD COLUMN `provider_call_budget_used` INTEGER NOT NULL DEFAULT 0', 'provider_call_budget_used' UNION ALL
    SELECT 14, 'ADD COLUMN `duration_deadline_at` DATETIME(3) NULL', 'duration_deadline_at' UNION ALL
    SELECT 15, 'ADD COLUMN `cost_budget_micros_max` BIGINT NOT NULL DEFAULT 0', 'cost_budget_micros_max' UNION ALL
    SELECT 16, 'ADD COLUMN `cost_budget_micros_used` BIGINT NOT NULL DEFAULT 0', 'cost_budget_micros_used'
  ) AS `required`
  WHERE NOT EXISTS (
    SELECT 1 FROM `information_schema`.`COLUMNS` `existing`
    WHERE `existing`.`TABLE_SCHEMA` = @rp02b1_schema
      AND `existing`.`TABLE_NAME` = 'generation_task'
      AND `existing`.`COLUMN_NAME` = `required`.`name`
  )
);
SET @rp02b1_sql = IF(@rp02b1_columns IS NULL, 'SELECT 1', CONCAT('ALTER TABLE `generation_task` ', @rp02b1_columns));
PREPARE `rp02b1_stmt` FROM @rp02b1_sql;
EXECUTE `rp02b1_stmt`;
DEALLOCATE PREPARE `rp02b1_stmt`;
UPDATE `generation_task` SET `root_task_id` = `id` WHERE `root_task_id` IS NULL OR `root_task_id` = '';
UPDATE `generation_task` SET `duration_deadline_at` = `created_at` WHERE `duration_deadline_at` IS NULL;
SET @rp02b1_sql = (
  SELECT IF(`IS_NULLABLE` = 'YES', 'ALTER TABLE `generation_task` MODIFY `root_task_id` VARCHAR(32) NOT NULL', 'SELECT 1')
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = @rp02b1_schema AND `TABLE_NAME` = 'generation_task' AND `COLUMN_NAME` = 'root_task_id'
);
PREPARE `rp02b1_stmt` FROM @rp02b1_sql;
EXECUTE `rp02b1_stmt`;
DEALLOCATE PREPARE `rp02b1_stmt`;
SET @rp02b1_sql = (
  SELECT IF(`IS_NULLABLE` = 'YES', 'ALTER TABLE `generation_task` MODIFY `duration_deadline_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'SELECT 1')
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = @rp02b1_schema AND `TABLE_NAME` = 'generation_task' AND `COLUMN_NAME` = 'duration_deadline_at'
);
PREPARE `rp02b1_stmt` FROM @rp02b1_sql;
EXECUTE `rp02b1_stmt`;
DEALLOCATE PREPARE `rp02b1_stmt`;
SET @rp02b1_sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `generation_task` ADD UNIQUE INDEX `generation_task_tenant_id_provider_attempt_id_key` (`tenant_id`, `provider_attempt_id`)',
    'SELECT 1')
  FROM `information_schema`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = @rp02b1_schema AND `TABLE_NAME` = 'generation_task'
    AND `INDEX_NAME` = 'generation_task_tenant_id_provider_attempt_id_key'
);
PREPARE `rp02b1_stmt` FROM @rp02b1_sql;
EXECUTE `rp02b1_stmt`;
DEALLOCATE PREPARE `rp02b1_stmt`;
SET @rp02b1_sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `generation_task` ADD INDEX `generation_task_status_lease_expires_at_created_at_idx` (`status`, `lease_expires_at`, `created_at`)',
    'SELECT 1')
  FROM `information_schema`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = @rp02b1_schema AND `TABLE_NAME` = 'generation_task'
    AND `INDEX_NAME` = 'generation_task_status_lease_expires_at_created_at_idx'
);
PREPARE `rp02b1_stmt` FROM @rp02b1_sql;
EXECUTE `rp02b1_stmt`;
DEALLOCATE PREPARE `rp02b1_stmt`;
