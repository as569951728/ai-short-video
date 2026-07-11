import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const migration = readFileSync(
  new URL('./migrations/20260711000000_add_novel_creation_source/migration.sql', import.meta.url),
  'utf8'
);

describe('CS-R1 novel creation source migration draft', () => {
  it('adds creation source fields to create_novel_preferences without touching novel', () => {
    assert.match(migration, /ALTER TABLE `create_novel_preferences`/);
    assert.match(migration, /`creation_source_type` ENUM\('system_recommendation', 'hotspot_reference', 'manual_idea', 'legacy_unknown'\)/);
    assert.match(migration, /`hotspot_title` VARCHAR\(200\) NULL/);
    assert.match(migration, /`hotspot_opportunity_title` VARCHAR\(200\) NULL/);
    assert.doesNotMatch(migration, /ALTER TABLE `novel`/);
  });

  it('marks existing rows as legacy_unknown before setting the new-create default', () => {
    assert.match(migration, /DEFAULT 'legacy_unknown'/);
    assert.match(migration, /UPDATE `create_novel_preferences`\s+SET `creation_source_type` = 'legacy_unknown'/);
    assert.match(migration, /ALTER COLUMN `creation_source_type` SET DEFAULT 'system_recommendation'/);
  });

  it('keeps source lookup index reviewable', () => {
    assert.match(migration, /CREATE INDEX `create_novel_preferences_tenant_source_idx`/);
    assert.match(migration, /`tenant_id`, `creation_source_type`/);
  });
});
