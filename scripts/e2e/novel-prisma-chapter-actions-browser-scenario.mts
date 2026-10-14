import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import type { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';

// Shared runner owns the isolated database, frozen sources, servers, browser and cleanup.
// E1_BROWSER_ACTION=chapterActions E1_BROWSER_REVISION=working-tree node_modules/.bin/tsx scripts/e2e/novel-prisma-overlength-browser-smoke.mts --run
export async function runChapterActionsScenario(input: {
  page: Page; context: BrowserContext; prisma: PrismaClient;
  fixture: { novelId: string; chapterId: string; formalVersionId: string; seedCandidateId: string };
  apiUrl: string; adminUrl: string; output: () => string; evidence: Record<string, any>;
  save: (name: string, data: unknown) => Promise<void>;
  screenshot: (name: string) => Promise<void>;
  until: (label: string, condition: () => Promise<boolean> | boolean, timeout?: number) => Promise<void>;
}) {
  const { page, context, prisma, fixture, apiUrl, adminUrl, output, evidence, save, screenshot, until } = input;
  const chapterPath = `/novels/${fixture.novelId}/chapters/${fixture.chapterId}`;
  const actions = ['chapter_rewrite', 'chapter_impact_assess', 'chapter_adopt_impact_assess'] as const;
  const formalBefore = await prisma.chapterContentVersion.findUniqueOrThrow({ where: { id: fixture.formalVersionId } });
  const seedBefore = await prisma.chapterContentVersion.findUniqueOrThrow({ where: { id: fixture.seedCandidateId } });
  const pointer = async () => (await prisma.novelChapter.findUniqueOrThrow({ where: { id: fixture.chapterId } })).currentContentVersionId;
  const mockEvents = (stage: 'STARTED' | 'FINISHED', action: string) => output().split('\n')
    .filter((line) => line.startsWith(`E1_CHAPTER_MOCK_${stage}=`))
    .map((line) => JSON.parse(line.slice(line.indexOf('=') + 1)))
    .filter((item) => item.action === action);
  const pointerTransitions: { at: string; versionId: string | null }[] = [];
  const samplePointer = async () => {
    const versionId = await pointer();
    if (pointerTransitions.at(-1)?.versionId !== versionId) pointerTransitions.push({ at: new Date().toISOString(), versionId });
    return versionId;
  };
  await samplePointer();
  const results: Record<string, any>[] = [];
  evidence.actions = results;
  let generatedCandidateId = '';
  let generatedCandidateVersionNo = 0;
  let generatedContentHash = '';
  const allReplays: (() => Promise<void>)[] = [];
  await page.goto(`${adminUrl}${chapterPath}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: '生成重写候选', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '采用候选', exact: true })).toBeEnabled();
  await screenshot('01-chapter-actions-fixture');

  for (const [index, action] of actions.entries()) {
    const prefix = `${index + 2}-${action}`;
    const path = action === 'chapter_rewrite' ? `${chapterPath}/rewrite`
      : action === 'chapter_impact_assess' ? `${chapterPath}/impact-assessments`
        : `${chapterPath}/content-versions/${generatedCandidateId}/adopt`;
    const result: Record<string, any> = { action, outcome: 'RUNNING' };
    results.push(result);
    if (action === 'chapter_rewrite') {
      await page.getByRole('button', { name: '生成重写候选', exact: true }).click();
    } else if (action === 'chapter_impact_assess') {
      await page.getByRole('button', { name: '影响评估', exact: true }).click();
    } else {
      const card = page.locator('#chapter-candidates article').filter({
        has: page.getByRole('heading', { name: `v${generatedCandidateVersionNo}`, exact: true }) });
      await card.getByRole('button', { name: '采用候选', exact: true }).click();
    }
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const reason = action === 'chapter_rewrite' ? '仅优化本章表达，保留已有事实。'
      : action === 'chapter_impact_assess' ? '核对本章表达和既有事实。'
        : '采用新重写候选，已经核对事实并接受评估。';
    await dialog.getByRole('textbox').fill(reason);
    await screenshot(`${prefix}-confirmation`);
    const responsePromise = page.waitForResponse((response) => response.url() === `${apiUrl}${path}`
      && response.request().method() === 'POST', { timeout: 20_000 });
    const submitAt = Date.now();
    await dialog.getByRole('button', { name: action === 'chapter_rewrite' ? '生成候选'
      : action === 'chapter_impact_assess' ? '发起评估' : '确认采用', exact: true }).click();
    const accepted = await responsePromise;
    assert.equal(accepted.status(), 202, `${action} must use the public async route.`);
    const dispatch = (await accepted.json()).data;
    const requestBody = accepted.request().postDataJSON();
    const idempotencyKey = accepted.request().headers()['idempotency-key'];
    const taskId = String(dispatch.taskId);
    result.taskId = taskId;
    result.acceptanceMs = Date.now() - submitAt;
    result.httpStatus = accepted.status();
    assert.ok(result.acceptanceMs < 10_000, 'Acceptance must not wait for the model.');
    assert.equal(dispatch.action, action);
    assert.equal(dispatch.objectId, fixture.chapterId);
    const readTask = () => prisma.generationTask.findUniqueOrThrow({ where: { id: taskId } });
    await until(`${action} model started`, async () => {
      const task = await readTask();
      if (task.status === 'FAILED') throw new Error(`${action} failed before dispatch: ${task.errorCode}`);
      return task.providerCallBudgetUsed === 1 && mockEvents('STARTED', action).length === 1;
    });
    const dispatched = await readTask();
    const envelope = dispatched.executionEnvelopeJson as Record<string, any>;
    assert.equal(envelope.action, action);
    assert.equal(envelope.normalizedRequest.currentContentVersionId, fixture.formalVersionId);
    const immutable = { requestHash: dispatched.requestHash, sourceVersionRefs: dispatched.sourceVersionRefs,
      executionEnvelopeHash: hash(envelope) };
    const pageSnapshot = action === 'chapter_adopt_impact_assess' ? requestBody.pageVersionSnapshot : undefined;
    if (pageSnapshot) {
      assert.equal(pageSnapshot.seenCandidateVersionId, generatedCandidateId);
      assert.ok(pageSnapshot.seenAt);
      assert.deepEqual(envelope.normalizedRequest.pageVersionSnapshot, pageSnapshot);
      result.pageVersionSnapshot = pageSnapshot;
    }
    const replay = async (expectedStatus: number) => {
      // The full flow crosses the five-minute capability window; refresh only its attestation.
      const capabilityResponse = await context.request.get(`${apiUrl}/novels/async-transport-capability`);
      assert.equal(capabilityResponse.status(), 200);
      const capability = (await capabilityResponse.json()).data;
      assert.equal(capability.enabled, true);
      assert.equal(capability.submissionScopeId, requestBody.expectedSubmissionScopeId);
      const response = await context.request.post(`${apiUrl}${path}`, { data: { ...requestBody,
        expectedCapabilityRevision: capability.capabilityRevision,
        expectedCapabilityExpiresAt: capability.expiresAt },
        headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {} });
      assert.equal(response.status(), expectedStatus, `${action} replay returned ${response.status()}`);
      const data = (await response.json()).data;
      assert.equal(data.taskId, taskId);
      assert.equal(data.reused, true);
      return data;
    };
    result.runningReplay = await replay(202);
    await expect(page.getByRole('button', { name: '生成重写候选', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '影响评估', exact: true })).toBeDisabled();
    const startedAt = Date.parse(mockEvents('STARTED', action)[0].at);
    let nextCheckAt = 0;
    await until(`${action} first 65 seconds`, async () => {
      if (Date.now() >= nextCheckAt) {
        assert.equal((await readTask()).status, 'PROCESSING');
        assert.equal(await samplePointer(), fixture.formalVersionId, 'No pointer switch is allowed before the model returns.');
        console.log(`E1_CHAPTER_WAIT=${action} ${Math.floor((Date.now() - startedAt) / 1000)}s budget=1`);
        nextCheckAt = Date.now() + 30_000;
      }
      return Date.now() - startedAt >= 65_000;
    }, 70_000);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: '生成重写候选', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '影响评估', exact: true })).toBeDisabled();
    await expect(page.getByText('正在调用模型生成内容，可能需要 2-5 分钟；若等待过久，请刷新查看任务状态')).toBeVisible();
    await page.getByRole('button', { name: '查看详情', exact: true }).click();
    await expect(page.getByText(taskId, { exact: true })).toBeVisible();
    await screenshot(`${prefix}-refresh-65s`);
    await page.keyboard.press('Escape');
    const resumed = await readTask();
    assert.equal(resumed.status, 'PROCESSING');
    assert.equal(resumed.providerCallBudgetUsed, 1);
    assert.ok(resumed.leaseExpiresAt && resumed.leaseExpiresAt.getTime() > Date.now());
    assert.deepEqual({ requestHash: resumed.requestHash, sourceVersionRefs: resumed.sourceVersionRefs,
      executionEnvelopeHash: hash(resumed.executionEnvelopeJson) }, immutable);
    result.refresh = { elapsedMs: Date.now() - startedAt, sameTaskId: taskId,
      leaseExpiresAt: resumed.leaseExpiresAt, lastHeartbeatAt: resumed.lastHeartbeatAt, pointer: await samplePointer() };
    assert.equal(result.refresh.pointer, fixture.formalVersionId);
    await until(`${action} finalizes`, async () => {
      const task = await readTask();
      await samplePointer();
      if (task.status === 'FAILED') throw new Error(`${action} failed: ${task.errorCode}`);
      if (Date.now() >= nextCheckAt) {
        console.log(`E1_CHAPTER_WAIT=${action} ${Math.floor((Date.now() - startedAt) / 1000)}s budget=${task.providerCallBudgetUsed}`);
        nextCheckAt = Date.now() + 30_000;
      }
      return task.status === (action === 'chapter_rewrite' ? 'WAITING_CONFIRMATION' : 'COMPLETED');
    }, 80_000);
    const finished = await readTask();
    assert.equal(finished.providerCallBudgetUsed, 1);
    assert.equal(finished.providerCallBudgetMax, 1);
    assert.ok(finished.resultReceiptHash);
    assert.deepEqual({ requestHash: finished.requestHash, sourceVersionRefs: finished.sourceVersionRefs,
      executionEnvelopeHash: hash(finished.executionEnvelopeJson) }, immutable);
    assert.equal(mockEvents('STARTED', action).length, 1);
    assert.equal(mockEvents('FINISHED', action).length, 1);
    result.modelDurationMs = Date.parse(mockEvents('FINISHED', action)[0].at) - startedAt;
    assert.ok(result.modelDurationMs >= 120_000);
    const events = await prisma.generationTaskEvent.findMany({ where: { taskId }, orderBy: { createdAt: 'asc' },
      select: { eventType: true, status: true, createdAt: true } });
    assert.equal(events.filter((event) => event.eventType === 'calling_model').length, 1);
    assert.equal(events.filter((event) => event.eventType === 'task_finalized').length, 1);
    await save(`${prefix}-events.json`, events);
    const candidates = await prisma.chapterContentVersion.findMany({ where: { sourceTaskId: taskId } });
    const cases = await prisma.impactCase.findMany({ where: { sourceTaskId: taskId } });
    const decisions = await prisma.assetDecisionRecord.findMany({ where: { sourceTaskId: taskId } });
    if (action === 'chapter_rewrite') {
      assert.equal(candidates.length, 1);
      assert.equal(candidates[0].status, 'CANDIDATE');
      generatedCandidateId = candidates[0].id;
      generatedCandidateVersionNo = candidates[0].versionNo;
      generatedContentHash = hash(candidates[0].content);
      assert.equal(await samplePointer(), fixture.formalVersionId);
      assert.equal(hash(await prisma.chapterContentVersion.findUniqueOrThrow({ where: { id: fixture.formalVersionId } })), hash(formalBefore));
      assert.equal(cases.length, 0);
      assert.equal(decisions.length, 0);
      result.candidate = { id: generatedCandidateId, versionNo: generatedCandidateVersionNo, contentHash: generatedContentHash };
    } else {
      assert.equal(cases.length, 1);
      assert.equal(candidates.length, 0);
      result.impactCase = { id: cases[0].id, status: cases[0].status, impactLevel: cases[0].impactLevel };
      if (action === 'chapter_impact_assess') {
        assert.equal(decisions.length, 0);
        assert.equal(await samplePointer(), fixture.formalVersionId);
        assert.equal(hash(await prisma.chapterContentVersion.findUniqueOrThrow({ where: { id: fixture.formalVersionId } })), hash(formalBefore));
      } else {
        assert.equal(decisions.length, 1);
        const decision = decisions[0];
        assert.equal(decision.currentVersionIdBefore, fixture.formalVersionId);
        assert.equal(decision.currentVersionIdAfter, generatedCandidateId);
        assert.deepEqual(decision.pageVersionSnapshot, pageSnapshot);
        assert.equal(decision.decisionReason, requestBody.reason);
        assert.equal(cases[0].decisionRecordId, decision.id);
        assert.equal(cases[0].sourceOldVersionId, fixture.formalVersionId);
        assert.equal(cases[0].sourceNewVersionId, generatedCandidateId);
        assert.equal(await samplePointer(), generatedCandidateId);
        const formal = await prisma.chapterContentVersion.findUniqueOrThrow({ where: { id: fixture.formalVersionId } });
        assert.equal(formal.status, 'HISTORICAL');
        assert.equal(hash(formal.content), hash(formalBefore.content));
        const adopted = await prisma.chapterContentVersion.findUniqueOrThrow({ where: { id: generatedCandidateId } });
        assert.equal(adopted.status, 'CURRENT');
        assert.equal(hash(adopted.content), generatedContentHash);
        const logs = await prisma.operationLog.findMany({ where: { sourceTaskId: taskId, action: 'adopt_chapter_content' },
          select: { id: true, beforeSnapshot: true, afterSnapshot: true, createdAt: true } });
        assert.equal(logs.length, 1);
        result.decision = { id: decision.id, currentVersionIdBefore: decision.currentVersionIdBefore,
          currentVersionIdAfter: decision.currentVersionIdAfter, pageVersionSnapshot: decision.pageVersionSnapshot };
        await save('adoption-audit.json', logs);
      }
    }
    result.terminalReplay = await replay(200);
    allReplays.push(async () => { await replay(200); });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: '生成重写候选', exact: true })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole('button', { name: '查看详情', exact: true }).click();
    await expect(page.getByText(taskId, { exact: true })).toBeVisible();
    await screenshot(`${prefix}-result`);
    await page.keyboard.press('Escape');
    const response = await context.request.get(`${apiUrl}${chapterPath}`);
    assert.equal(response.status(), 200);
    const workbench = (await response.json()).data;
    assert.equal(workbench.recentTask.id, taskId);
    assert.equal(workbench.currentContent.id, action === 'chapter_adopt_impact_assess' ? generatedCandidateId : fixture.formalVersionId);
    result.status = finished.status;
    result.providerCallBudgetUsed = finished.providerCallBudgetUsed;
    result.resultReceiptHash = finished.resultReceiptHash;
    result.snapshotsUnchanged = true;
    result.outcome = 'PASS';
    await save('action-checkpoints.json', results);
  }
  // Replay all three original requests after adoption changed the formal source version.
  for (const replay of allReplays) await replay();
  assert.equal(await prisma.generationTask.count({ where: { novelId: fixture.novelId } }), 3);
  assert.equal(await prisma.assetDecisionRecord.count({ where: { novelId: fixture.novelId, actionType: 'adopt_chapter_content' } }), 1);
  assert.equal(await prisma.operationLog.count({ where: { novelId: fixture.novelId, action: 'adopt_chapter_content' } }), 1);
  assert.equal(await prisma.impactCase.count({ where: { novelId: fixture.novelId } }), 2);
  assert.equal(await prisma.chapterContentVersion.count({ where: { novelId: fixture.novelId } }), 3);
  assert.equal(hash(await prisma.chapterContentVersion.findUniqueOrThrow({ where: { id: fixture.seedCandidateId } })), hash(seedBefore));
  for (const result of results) {
    assert.equal(mockEvents('STARTED', result.action).length, 1);
    assert.equal((await prisma.generationTask.findUniqueOrThrow({ where: { id: result.taskId } })).providerCallBudgetUsed, 1);
  }
  await samplePointer();
  assert.deepEqual(pointerTransitions.map((item) => item.versionId), [fixture.formalVersionId, generatedCandidateId]);
  evidence.pointerTransitions = pointerTransitions;
  evidence.totalProviderCalls = 3;
  evidence.terminalReplayAfterAdoption = 'all three requests reused their original tasks';
  evidence.formalContentHashBefore = hash(formalBefore.content);
  evidence.formalContentHashAfter = generatedContentHash;
  evidence.seedCandidateUnchanged = true;
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.novel-text-card')).toContainText(`v${generatedCandidateVersionNo}`);
  await screenshot('05-chapter-actions-final-readback');
}

function hash(value: unknown) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}
