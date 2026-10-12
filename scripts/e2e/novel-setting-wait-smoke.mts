import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium, expect } from '@playwright/test';
import { buildApp } from '../../apps/api/src/app.js';
import { createInMemoryNovelRepository } from '../../apps/api/src/modules/novels/repositories/inMemoryNovelRepository.js';
import { createInMemoryVideoRepository } from '../../apps/api/src/modules/videos/repositories/inMemoryVideoRepository.js';
import type { ChatCompletionRequest } from '../../apps/api/src/modules/ai/llmClient.js';

if (process.env.DATABASE_URL || process.env.DEEPSEEK_API_KEY) {
  throw new Error('Novel wait smoke requires an isolated in-memory backend and fake model.');
}
const holdMs = Number(process.env.NOVEL_WAIT_HOLD_MS ?? 5_500);
if (!Number.isInteger(holdMs) || holdMs < 5_500 || holdMs > 300_000) {
  throw new Error('NOVEL_WAIT_HOLD_MS must be an integer between 5500 and 300000.');
}

const repository = createInMemoryNovelRepository();
let settingCalls = 0;
let outlineCalls = 0;
let releaseSetting: (() => void) | undefined;
const settingGate = new Promise<void>((resolve) => { releaseSetting = resolve; });
const llmClient = {
  async chat(request: ChatCompletionRequest) {
    let content: string;
    if (request.taskName === 'novel_direction_generate') {
      content = JSON.stringify({ candidates: [{
        title: '重生后重新出发', summary: '主角重生后重新经营事业。',
        content: '重生主角从职场低谷起步，凭经验逐步翻盘。',
        score: 82, marketScore: 81, riskLevel: 'low', riskTags: [],
        recommendedReason: '目标和冲突清楚。'
      }] });
    } else if (request.taskName === 'novel_structure_setting') {
      settingCalls += 1;
      await settingGate;
      content = JSON.stringify({
        title: '人物设定', summary: '主角与对手的目标明确。', score: 83,
        riskLevel: 'low', riskTags: [], recommendedReason: '人物动机稳定。',
        content: {
          title: '人物设定', summary: '主角与对手的目标明确。',
          sections: [{ title: '人物关系', body: '主角重生后要查明上一世的背叛。', items: ['主角谨慎', '对手隐瞒真相'] }],
          stages: [], chapters: [], riskTags: [], recommendation: '可进入大纲。'
        }
      });
    } else if (request.taskName === 'novel_structure_outline') {
      outlineCalls += 1;
      content = outlineCalls <= 2 ? '{}' : JSON.stringify({
        title: '全书大纲', summary: '主角逐步查明背叛真相。', score: 84,
        riskLevel: 'low', riskTags: [], recommendedReason: '主线与结局清楚。',
        content: {
          title: '全书大纲', summary: '主角逐步查明背叛真相。',
          sections: [{ title: '主线', body: '主角重建事业并揭穿旧友。', items: ['建立新团队'] }],
          stages: [], chapters: [], riskTags: [], recommendation: '可规划阶段。'
        }
      });
    } else {
      throw new Error(`Unexpected fake model task: ${request.taskName}`);
    }
    return { content, model: 'fake-novel-wait', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
  }
};

const app = await buildApp({
  logger: false,
  novelRepository: repository,
  videoRepository: createInMemoryVideoRepository(),
  aiProviderEnv: { AI_PROVIDER_MODE: 'deepseek', DEEPSEEK_API_KEY: 'fake-local-test-key' },
  llmClient,
  requestContextResolver: async (request) => ({
    tenantId: 'tenant_novel_wait_test', userId: 'user_novel_wait_test', requestId: request.id
  })
});
let admin: ChildProcess | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

try {
  const draft = await app.inject({ method: 'POST', url: '/novels/drafts', payload: {
    title: '重生后重新出发', genres: ['都市逆袭'], chapterLimit: 5,
    chapterWordRange: { min: 1800, max: 2600 },
    preferences: { appealPoints: ['低谷翻盘'], targetAudience: '18-35 岁爽文用户' }
  } });
  assert.equal(draft.statusCode, 201);
  const novelId: string = draft.json().data.id;
  const directions = await app.inject({ method: 'POST', url: `/novels/${novelId}/directions/generate`, payload: {} });
  assert.equal(directions.statusCode, 200);
  const candidateId: string = directions.json().data.candidates[0].id;
  const adopted = await app.inject({ method: 'POST', url: `/novels/${novelId}/directions/${candidateId}/adopt`, payload: {
    currentVersionId: null, reason: '等待交互验收', idempotencyKey: 'setting-wait-direction-adopt'
  } });
  assert.equal(adopted.statusCode, 200, JSON.stringify(adopted.json().error ?? {}));

  const apiPort = await freePort();
  const adminPort = await freePort();
  await app.listen({ host: '127.0.0.1', port: apiPort });
  admin = spawn('npm', ['run', 'dev', '-w', 'apps/admin-web', '--', '--host', '127.0.0.1', '--port', String(adminPort), '--strictPort'], {
    cwd: process.cwd(),
    env: { ...process.env, VITE_DATA_SOURCE: 'backend', VITE_API_BASE_URL: `http://127.0.0.1:${apiPort}` },
    stdio: 'ignore'
  });
  await waitForServer(`http://127.0.0.1:${adminPort}`);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${adminPort}/novels/${novelId}?step=setting`);
  await page.getByRole('button', { name: '生成设定', exact: true }).first().click();
  await expect.poll(() => settingCalls).toBe(1);
  await expect.poll(() => repository.getGenerationTasks().find((task) => task.taskType === 'novel_setting_generate')?.status).toBe('processing');
  const taskId = repository.getGenerationTasks().find((task) => task.taskType === 'novel_setting_generate')?.id;
  assert.ok(taskId);

  await expect(page.getByText('设定正在生成中')).toBeVisible();
  await expect(page.getByRole('button', { name: '生成设定', exact: true })).toBeDisabled();
  const secondPage = await context.newPage();
  await secondPage.goto(`http://127.0.0.1:${adminPort}/novels/${novelId}?step=setting`);
  await expect(secondPage.getByText('设定正在生成中')).toBeVisible();
  await secondPage.reload();
  await expect(secondPage.getByText('设定正在生成中')).toBeVisible();
  await secondPage.getByRole('button', { name: '查看任务进度' }).click();
  await expect(secondPage.getByText(taskId)).toBeVisible();
  await secondPage.waitForTimeout(holdMs);
  assert.equal(repository.getGenerationTasks().find((task) => task.id === taskId)?.status, 'processing');
  assert.equal(settingCalls, 1);
  await expect(page.getByText('设定正在生成中')).toBeVisible();

  releaseSetting?.();
  await expect.poll(() => repository.getGenerationTasks().find((task) => task.id === taskId)?.status).toBe('waiting_confirmation');
  await expect(page.getByText('人物设定', { exact: true }).first()).toBeVisible();
  await secondPage.reload();
  await expect(secondPage.getByText('人物设定', { exact: true }).first()).toBeVisible();
  assert.equal(repository.getGenerationTasks().filter((task) => task.taskType === 'novel_setting_generate').length, 1);
  const settingCandidate = repository.getCreativeVersions().findLast((item) => item.objectType === 'setting' && item.novelId === novelId);
  assert.ok(settingCandidate);
  const settingAdopted = await app.inject({ method: 'POST', url: `/novels/${novelId}/settings/${settingCandidate.id}/adopt`, payload: { reason: '等待与异常输出验收' } });
  assert.equal(settingAdopted.statusCode, 200, JSON.stringify(settingAdopted.json().error ?? {}));

  await secondPage.goto(`http://127.0.0.1:${adminPort}/novels/${novelId}?step=outline`);
  await secondPage.getByRole('button', { name: '生成全书大纲', exact: true }).first().click();
  await expect.poll(() => repository.getGenerationTasks().findLast((task) => task.taskType === 'novel_outline_generate')?.status).toBe('failed');
  const failedOutline = repository.getGenerationTasks().findLast((task) => task.taskType === 'novel_outline_generate');
  assert.equal(failedOutline?.failureCategory, 'output_parse_failed');
  assert.equal(repository.getCreativeVersions().filter((item) => item.objectType === 'outline' && item.novelId === novelId).length, 0);
  await secondPage.reload();
  await expect(secondPage.getByRole('button', { name: '生成全书大纲', exact: true }).first()).toBeEnabled();
  await secondPage.getByRole('button', { name: '生成全书大纲', exact: true }).first().click();
  await expect.poll(() => repository.getCreativeVersions().filter((item) => item.objectType === 'outline' && item.novelId === novelId).length).toBe(1);
  assert.equal(outlineCalls, 3);
  console.log(JSON.stringify({ result: 'PASS', scenario: 'setting_wait_and_outline_invalid_output_recovery', taskPersisted: true, settingProviderCalls: settingCalls, failedOutputBlocked: true, retryCandidateCreated: true }));
} finally {
  releaseSetting?.();
  await browser?.close();
  if (admin?.pid) admin.kill('SIGTERM');
  await app.close();
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('No available port'));
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(url: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // The local Vite process may not be ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Admin server did not become ready');
}
