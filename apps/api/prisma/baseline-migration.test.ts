import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

const migrationsUrl = new URL('./migrations/', import.meta.url);
const baselineName = '20260622000000_initial_schema';
const migrationNames = readdirSync(migrationsUrl, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^\d{14}_/.test(entry.name))
  .map((entry) => entry.name)
  .sort();

function migrationSql(name: string): string {
  return readFileSync(new URL(`./migrations/${name}/migration.sql`, import.meta.url), 'utf8');
}

function createdTables(sql: string): string[] {
  return [...sql.matchAll(/\bCREATE TABLE `([^`]+)`/g)].map((match) => match[1]);
}

describe('historical Prisma baseline migration', () => {
  it('runs before every incremental migration and contains their prerequisite tables', () => {
    assert.equal(migrationNames[0], baselineName);
    const baseline = migrationSql(baselineName);
    const tables = new Set(createdTables(baseline));

    assert.equal(tables.size, 27);
    for (const table of [
      'create_novel_preferences',
      'generation_task',
      'novel',
      'novel_chapter',
      'review_report',
      'full_review_gate',
      'completion_decision_record'
    ]) {
      assert.ok(tables.has(table), `baseline is missing ${table}`);
    }

    for (const name of migrationNames.slice(1)) {
      const sql = migrationSql(name);
      for (const [, table] of sql.matchAll(/\bALTER TABLE `([^`]+)`/g)) {
        assert.ok(tables.has(table), `${name} alters missing table ${table}`);
      }
      for (const table of createdTables(sql)) {
        assert.ok(!tables.has(table), `${name} recreates table ${table}`);
        tables.add(table);
      }
    }
  });

  it('leaves later additive columns and tables to their existing migrations', () => {
    const baseline = migrationSql(baselineName);
    assert.doesNotMatch(baseline, /`creation_source_type`|`active_claim_key`|`lease_owner_id`/);
    assert.doesNotMatch(baseline, /CREATE TABLE `(video_artifact|video_render|video_export)`/);
  });
});
