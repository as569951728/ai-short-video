import type { NovelAsyncTransportAction } from '@ai-shortvideo/shared';

export const ISOLATED_E1_ACTIONS = [
  'direction_generate', 'direction_fuse', 'direction_optimize', 'setting_generate', 'outline_generate', 'stage_outline_generate',
  'trial_chapter_one_generate', 'trial_followup_generate', 'chapter_overlength_revise', 'novel_full_review'
] as const satisfies readonly NovelAsyncTransportAction[];

export const ISOLATED_E1_TASK_TYPES = new Set([
  'novel_direction_generate', 'novel_direction_fuse', 'novel_direction_optimize', 'novel_setting_generate', 'novel_outline_generate',
  'stage_outline_generate', 'trial_writing_generate', 'trial_followup_generate',
  'chapter_overlength_revise', 'novel_full_review'
]);

export function resolveIsolatedNovelAsyncEnabled(input: {
  flag: string;
  runtimeEnvironment: string;
  providerMode: string;
  databaseUrl?: string;
  smokeUrl?: string;
}): boolean {
  if (input.flag !== 'true') return false;
  if (input.runtimeEnvironment !== 'development' || input.providerMode !== 'mock'
    || !input.databaseUrl || input.databaseUrl !== input.smokeUrl) {
    throw new Error('Isolated E1 async dispatch requires development, mock, and matching test database URLs.');
  }
  let target: URL;
  try {
    target = new URL(input.databaseUrl);
  } catch {
    throw new Error('Isolated E1 async dispatch requires a valid test database URL.');
  }
  if (target.protocol !== 'mysql:' || !['127.0.0.1', 'localhost'].includes(target.hostname)
    || !target.port || target.port === '3306' || target.search || target.hash
    || !/^\/ai_shortvideo_e1_[a-z0-9_]+$/.test(target.pathname)
    || !/^e1_[a-z0-9_]+$/.test(target.username) || !target.password) {
    throw new Error('Isolated E1 async dispatch requires a dedicated loopback schema and account.');
  }
  return true;
}
