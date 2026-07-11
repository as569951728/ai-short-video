import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(process.cwd(), 'prisma/migrations/20260626000000_add_video_artifact/migration.sql');
const ttsMigrationPath = join(process.cwd(), 'prisma/migrations/20260627000000_add_video_tts_artifact_fields/migration.sql');
const renderExportMigrationPath = join(process.cwd(), 'prisma/migrations/20260710000000_add_video_render_export/migration.sql');

describe('P9b video artifact migration draft', () => {
  it('creates the video_artifact table with fields used by the narration repository', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    assert.match(sql, /CREATE TABLE `video_artifact`/);
    for (const column of [
      'tenant_id',
      'video_project_id',
      'video_unit_id',
      'video_reference_id',
      'artifact_type',
      'version_no',
      'is_current',
      'source_version_refs',
      'provider_summary',
      'provider_route_id',
      'strategy_version',
      'quality_mode',
      'content_text',
      'risk_tags_json',
      'confirmed_at',
      'metadata'
    ]) {
      assert.match(sql, new RegExp(`\\\`${column}\\\``));
    }
  });

  it('keeps version uniqueness and common workbench lookup indexes reviewable', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    assert.match(sql, /UNIQUE KEY `video_artifact_tenant_project_type_version_uq`/);
    assert.match(sql, /KEY `video_artifact_project_status_idx`/);
    assert.match(sql, /KEY `video_artifact_unit_current_idx`/);
    assert.doesNotMatch(sql, /DATABASE_URL|DEEPSEEK_API_KEY|api_key/i);
  });
});

describe('P9c video TTS artifact migration draft', () => {
  it('adds audio-specific fields for mock/local TTS artifacts without exposing secrets', () => {
    const sql = readFileSync(ttsMigrationPath, 'utf8');

    for (const column of [
      'duration_seconds',
      'file_key',
      'preview_url',
      'voice_id',
      'voice_name',
      'speed',
      'emotion',
      'volume'
    ]) {
      assert.match(sql, new RegExp(`\\\`${column}\\\``));
    }
    assert.match(sql, /video_artifact_project_type_current_idx/);
    assert.doesNotMatch(sql, /DATABASE_URL|DEEPSEEK_API_KEY|api_key|password/i);
  });
});

describe('P9e video render and export migration draft', () => {
  it('adds render and export tables without creating publish records or leaking secrets', () => {
    const sql = readFileSync(renderExportMigrationPath, 'utf8');

    assert.match(sql, /CREATE TABLE `video_render`/);
    assert.match(sql, /CREATE TABLE `video_export`/);
    for (const column of [
      'preview_status',
      'preview_url',
      'file_key',
      'render_mode',
      'quality_issues_json',
      'safe_summary',
      'source_version_refs',
      'render_version_id',
      'download_url'
    ]) {
      assert.match(sql, new RegExp(`\\\`${column}\\\``));
    }
    assert.match(sql, /video_render_tenant_id_video_project_id_version_no_key/);
    assert.match(sql, /video_export_tenant_id_render_version_id_idx/);
    assert.doesNotMatch(sql, /CREATE TABLE `publish|platform|upload/i);
    assert.doesNotMatch(sql, /DATABASE_URL|DEEPSEEK_API_KEY|api_key|password/i);
  });
});
