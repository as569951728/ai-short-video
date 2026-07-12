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

ALTER TABLE `generation_task`
  ADD COLUMN `active_claim_key` VARCHAR(64) NULL;

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

ALTER TABLE `generation_task`
  -- These unique indexes are the refusal gate: MySQL aborts this migration
  -- instead of silently reconciling duplicate idempotency or active claims.
  DROP INDEX `generation_task_tenant_id_idempotency_token_key`,
  ADD UNIQUE INDEX `generation_task_tenant_id_task_type_idempotency_token_key`
    (`tenant_id`, `task_type`, `idempotency_token`),
  ADD UNIQUE INDEX `generation_task_tenant_id_active_claim_key_key`
    (`tenant_id`, `active_claim_key`);
