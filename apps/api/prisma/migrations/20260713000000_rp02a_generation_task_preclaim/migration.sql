DROP TEMPORARY TABLE IF EXISTS `rp02a_generation_task_preflight`;
CREATE TEMPORARY TABLE `rp02a_generation_task_preflight` (
  `guard_key` TINYINT NOT NULL PRIMARY KEY
);

INSERT INTO `rp02a_generation_task_preflight` (`guard_key`) VALUES (1);
INSERT INTO `rp02a_generation_task_preflight` (`guard_key`)
SELECT 1
FROM (
  SELECT `tenant_id`, `task_type`, `idempotency_token`
  FROM `generation_task`
  WHERE `idempotency_token` IS NOT NULL
  GROUP BY `tenant_id`, `task_type`, `idempotency_token`
  HAVING COUNT(*) > 1
  LIMIT 1
) AS `duplicate_idempotency_identity`;

DELETE FROM `rp02a_generation_task_preflight`;
INSERT INTO `rp02a_generation_task_preflight` (`guard_key`) VALUES (1);
INSERT INTO `rp02a_generation_task_preflight` (`guard_key`)
SELECT 1
FROM (
  SELECT `tenant_id`, `conflict_scope`, `conflict_key`
  FROM `generation_task`
  WHERE `status` IN ('queued', 'processing')
    AND `conflict_scope` IS NOT NULL
    AND `conflict_key` IS NOT NULL
  GROUP BY `tenant_id`, `conflict_scope`, `conflict_key`
  HAVING COUNT(*) > 1
  LIMIT 1
) AS `duplicate_active_claim`;

DROP TEMPORARY TABLE `rp02a_generation_task_preflight`;

SET @rp02a_schema_name = DATABASE();
SET @rp02a_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `generation_task` ADD COLUMN `active_claim_key` VARCHAR(64) NULL',
    'SELECT 1'
  )
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = @rp02a_schema_name
    AND `TABLE_NAME` = 'generation_task'
    AND `COLUMN_NAME` = 'active_claim_key'
);
PREPARE `rp02a_stmt` FROM @rp02a_sql;
EXECUTE `rp02a_stmt`;
DEALLOCATE PREPARE `rp02a_stmt`;

UPDATE `generation_task`
SET `active_claim_key` = SHA2(
  CONCAT(
    '{"conflictKey":', JSON_QUOTE(`conflict_key`),
    ',"conflictScope":', JSON_QUOTE(`conflict_scope`),
    '}'
  ),
  256
)
WHERE `status` IN ('queued', 'processing')
  AND `conflict_scope` IS NOT NULL
  AND `conflict_key` IS NOT NULL;

-- These unique indexes are the refusal gate: MySQL aborts this migration
-- instead of silently reconciling duplicate idempotency or active claims.
-- Each DDL is conditional so a failure after an earlier implicit commit can be retried.
SET @rp02a_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `generation_task` ADD UNIQUE INDEX `generation_task_tenant_id_task_type_idempotency_token_key` (`tenant_id`, `task_type`, `idempotency_token`)',
    'SELECT 1'
  )
  FROM `information_schema`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = @rp02a_schema_name
    AND `TABLE_NAME` = 'generation_task'
    AND `INDEX_NAME` = 'generation_task_tenant_id_task_type_idempotency_token_key'
);
PREPARE `rp02a_stmt` FROM @rp02a_sql;
EXECUTE `rp02a_stmt`;
DEALLOCATE PREPARE `rp02a_stmt`;

SET @rp02a_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `generation_task` ADD UNIQUE INDEX `generation_task_tenant_id_active_claim_key_key` (`tenant_id`, `active_claim_key`)',
    'SELECT 1'
  )
  FROM `information_schema`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = @rp02a_schema_name
    AND `TABLE_NAME` = 'generation_task'
    AND `INDEX_NAME` = 'generation_task_tenant_id_active_claim_key_key'
);
PREPARE `rp02a_stmt` FROM @rp02a_sql;
EXECUTE `rp02a_stmt`;
DEALLOCATE PREPARE `rp02a_stmt`;

SET @rp02a_sql = (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE `generation_task` DROP INDEX `generation_task_tenant_id_idempotency_token_key`',
    'SELECT 1'
  )
  FROM `information_schema`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = @rp02a_schema_name
    AND `TABLE_NAME` = 'generation_task'
    AND `INDEX_NAME` = 'generation_task_tenant_id_idempotency_token_key'
);
PREPARE `rp02a_stmt` FROM @rp02a_sql;
EXECUTE `rp02a_stmt`;
DEALLOCATE PREPARE `rp02a_stmt`;
