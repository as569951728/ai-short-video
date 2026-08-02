import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test } from '@playwright/test';

const API_ORIGIN = process.env.RP04C_API_ORIGIN;
const EVIDENCE_PATH = process.env.RP04C_EVIDENCE_PATH;
const EXPECTED_CHAPTER_NOS = Array.from({ length: 12 }, (_, index) => index + 1);
const SAFE_BODY_CANARY = '仓库后门的监控今晚会被清空';
const SENSITIVE_KEYS = new Set([
  'apikey', 'authorization', 'cookie', 'databaseurl', 'messages', 'password', 'prompt',
  'providerbody', 'providerresponse', 'rawcontent', 'rawresponse', 'secret'
]);
const SENSITIVE_VALUE_PATTERNS = [
  /DEEPSEEK_API_KEY/i,
  /Bearer\s+[A-Za-z0-9._-]+/i,
  /mysql:\/\//i,
  /rawResponse|providerResponse|providerBody/i
];

test('RP-04C M-01..M-11 full-review browser acceptance', async ({ page, context, request }) => {
  test.setTimeout(120_000);
  if (!API_ORIGIN || !EVIDENCE_PATH) throw new Error('RP-04C E2E environment is incomplete');

  const startedAt = new Date().toISOString();
  const runId = process.env.RP04C_RUN_ID ?? 'rp04c-unknown';
  const telemetry = createTelemetry();
  const evidence = createEvidence(runId, startedAt);
  let currentStep = 'M-01';
  attachPageTelemetry(page, telemetry);
  attachNetworkTelemetry(context, telemetry);

  try {
    const seedResponse = await request.post(`${API_ORIGIN}/dev/novels/acceptance-seeds/full-review`, {
      data: { title: `RP-04C 浏览器验收 ${runId.slice(-19)}` }
    });
    expect(seedResponse.status()).toBe(201);
    const seed = unwrap(await seedResponse.json());
    expect(seed.chapterCount).toBe(12);
    expect(seed.pendingChapterCount).toBe(0);
    expect(seed.fullReviewTaskCreated).toBe(false);
    evidence.fixture.novelId = seed.novelId;
    evidence.fixture.chapterCount = seed.chapterCount;

    const fullReviewPath = `/novels/${seed.novelId}?step=fullReview`;
    await page.goto(fullReviewPath);
    await expect(fullReviewButton(page)).toBeVisible();
    await expect(fullReviewButton(page)).toBeEnabled();
    await expect(completionButton(page)).toBeDisabled();
    await expect(page.getByText(seed.title, { exact: true })).toBeVisible();
    const initialDetail = await browserGet(page, `${API_ORIGIN}/novels/${seed.novelId}`);
    expect(initialDetail.status).toBe(200);
    expect(initialDetail.data.chapters).toHaveLength(12);
    expect(initialDetail.data.completionDecision).toBeNull();
    const canaryChapter = initialDetail.data.chapters.find((chapter) => chapter.chapterNo === 4);
    expect(canaryChapter?.id).toBeTruthy();
    const canarySourceResponse = await request.get(`${API_ORIGIN}/novels/${seed.novelId}/chapters/${canaryChapter.id}`);
    expect(canarySourceResponse.status()).toBe(200);
    const canarySource = unwrap(await canarySourceResponse.json());
    expect(canarySource.currentContent.content).toContain(SAFE_BODY_CANARY);
    evidence.fixture.bodyCanaryVerified = true;
    evidence.m['M-01'] = pass({ detailStatus: 200, chapterCount: 12, completionDisabled: true });

    currentStep = 'M-02';
    await fullReviewButton(page).click();
    const confirmation = page.locator('.el-message-box');
    await expect(confirmation).toContainText('确认发起全书 AI 审稿');
    await expect(confirmation).toContainText('计划章节数: 12');
    await expect(confirmation).toContainText('不会自动确认完成');
    await confirmation.getByRole('button', { name: '取消' }).click();
    await page.waitForTimeout(5_000);
    expect(telemetry.fullReviewPosts).toHaveLength(0);
    expect(telemetry.completionPostCount).toBe(0);
    evidence.m['M-02'] = pass({ fullReviewPostCountAfterCancel: 0, chapterCountInConfirmation: 12 });

    currentStep = 'M-03';
    await fullReviewButton(page).click();
    const requestPromise = page.waitForRequest((candidate) => candidate.method() === 'POST' && candidate.url() === `${API_ORIGIN}/novels/${seed.novelId}/full-review`);
    const responsePromise = page.waitForResponse((candidate) => candidate.request().method() === 'POST' && candidate.url() === `${API_ORIGIN}/novels/${seed.novelId}/full-review`);
    await page.locator('.el-message-box').getByRole('button', { name: '确认发起审稿' }).click();
    const [fullReviewRequest, fullReviewResponse] = await Promise.all([requestPromise, responsePromise]);
    expect(fullReviewResponse.status()).toBe(200);
    telemetry.fullReviewResponseStatus = fullReviewResponse.status();
    const requestPayload = fullReviewRequest.postDataJSON();
    expect(Object.keys(requestPayload).sort()).toEqual(['expectedNovelVersion', 'idempotencyKey']);
    expect(requestPayload.idempotencyKey).toBeTruthy();
    await expect(page.locator('.step-side-panel .task-progress-label')).toHaveText('生成中');
    await expect(fullReviewButton(page)).toBeDisabled();
    expect(telemetry.fullReviewPosts).toHaveLength(1);
    evidence.m['M-03'] = pass({ fullReviewPostCount: 1, responseStatus: fullReviewResponse.status(), requestKeys: Object.keys(requestPayload).sort(), waitingStateVisible: true });

    currentStep = 'M-04';
    const processingStartedAt = Date.now();
    const stateSamples = [await processingState(page, processingStartedAt)];
    await page.waitForTimeout(5_200);
    stateSamples.push(await processingState(page, processingStartedAt));

    const processingObserver = await pollObserver(page, (state) =>
      state.providerCallCount === 1 && state.fullReviewTasks?.length === 1 && state.fullReviewTasks[0]?.status === 'processing');
    const taskId = processingObserver.fullReviewTasks[0].id;
    expect(taskId.startsWith('local-')).toBe(false);
    evidence.ids.taskId = taskId;
    const processingDetail = await pollNovelDetail(page, seed.novelId, (detail) =>
      detail.recentTasks?.some((task) => task.id === taskId && task.status === 'processing'));
    expect(processingDetail.recentTasks.filter((task) => task.taskType === 'novel_full_review')).toHaveLength(1);

    currentStep = 'M-05';
    await expect(page.locator('.step-side-panel .task-progress-label')).toHaveText('生成中');
    await page.locator('.step-side-panel').getByRole('button', { name: '查看详情' }).click();
    const drawer = taskDrawer(page);
    await expect(drawer.getByText('Task ID')).toBeVisible();
    await expect(drawer).toContainText(taskId);
    const taskDetail = await browserGet(page, `${API_ORIGIN}/tasks/${taskId}`);
    const taskEvents = await browserGet(page, `${API_ORIGIN}/tasks/${taskId}/events`);
    expect(taskDetail.status).toBe(200);
    expect(taskEvents.status).toBe(200);
    expect(taskDetail.data.trace.taskId).toBe(taskId);
    expect(taskDetail.data.trace.requestId).toBeTruthy();
    expect(taskDetail.data.events.length).toBeGreaterThan(0);
    evidence.ids.requestId = taskDetail.data.trace.requestId;
    evidence.m['M-05'] = pass({ backendTaskId: taskId, taskStatus: taskDetail.data.status, eventCount: taskDetail.data.events.length, taskDetailSafe: true });
    await page.keyboard.press('Escape');

    const remainingToFifteenSeconds = Math.max(0, 15_500 - (Date.now() - processingStartedAt));
    await page.waitForTimeout(remainingToFifteenSeconds);
    stateSamples.push(await processingState(page, processingStartedAt));
    expect(telemetry.fullReviewPosts).toHaveLength(1);
    evidence.m['M-04'] = pass({ observedSeconds: stateSamples.map((sample) => sample.elapsedSeconds), observedStates: stateSamples.map((sample) => sample.status), fakeExactPercentSeen: false });

    currentStep = 'M-06';
    const m06BeforeRefresh = await assertTaskStillProcessing(page, taskId);
    await page.reload();
    await expect(page.locator('.step-side-panel .task-progress-label')).toHaveText('生成中');
    const m06AfterRefresh = await assertTaskStillProcessing(page, taskId);
    const firstReloadStartDisabled = await fullReviewButton(page).isDisabled();
    await expect(completionButton(page)).toBeDisabled();
    await page.locator('.step-side-panel').getByRole('button', { name: '查看详情' }).click();
    await expect(taskDrawer(page)).toContainText(taskId);
    await page.keyboard.press('Escape');
    const secondPage = await context.newPage();
    attachPageTelemetry(secondPage, telemetry);
    await secondPage.goto(fullReviewPath);
    await expect(secondPage.locator('.step-side-panel .task-progress-label')).toHaveText('生成中');
    const m06SecondTab = await assertTaskStillProcessing(secondPage, taskId);
    const secondTabStartDisabled = await fullReviewButton(secondPage).isDisabled();
    await expect(completionButton(secondPage)).toBeDisabled();
    await secondPage.locator('.step-side-panel').getByRole('button', { name: '查看详情' }).click();
    await expect(taskDrawer(secondPage)).toContainText(taskId);
    await secondPage.keyboard.press('Escape');
    const secondBefore = await pollNovelDetail(secondPage, seed.novelId, (detail) =>
      detail.recentTasks?.some((task) => task.id === taskId));
    await secondPage.reload();
    await expect(secondPage.locator('.step-side-panel .task-progress-label')).toHaveText('生成中');
    const m06AfterSecondReload = await assertTaskStillProcessing(secondPage, taskId);
    const secondReloadStartDisabled = await fullReviewButton(secondPage).isDisabled();
    const secondAfter = await pollNovelDetail(secondPage, seed.novelId, (detail) =>
      detail.recentTasks?.some((task) => task.id === taskId));
    await secondPage.waitForTimeout(10_000);
    const m06AfterObservationWindow = await assertTaskStillProcessing(secondPage, taskId);
    expect(telemetry.fullReviewPosts).toHaveLength(1);
    expect(secondPage.url()).toContain('step=fullReview');
    const m06Evidence = {
      taskIdBefore: taskId,
      taskIdAfter: secondAfter.recentTasks.find((task) => task.id === taskId).id,
      secondTabTaskId: secondBefore.recentTasks.find((task) => task.id === taskId).id,
      taskStatuses: [
        m06BeforeRefresh.taskStatus,
        m06AfterRefresh.taskStatus,
        m06SecondTab.taskStatus,
        m06AfterSecondReload.taskStatus,
        m06AfterObservationWindow.taskStatus
      ],
      providerActiveThroughout: [
        m06BeforeRefresh.providerActive,
        m06AfterRefresh.providerActive,
        m06SecondTab.providerActive,
        m06AfterSecondReload.providerActive,
        m06AfterObservationWindow.providerActive
      ].every(Boolean),
      fullReviewPostCount: 1,
      startActionDisabledAfterRefresh: firstReloadStartDisabled,
      startActionDisabledInSecondTab: secondTabStartDisabled,
      startActionDisabledAfterSecondReload: secondReloadStartDisabled
    };
    if (firstReloadStartDisabled && secondTabStartDisabled && secondReloadStartDisabled) {
      evidence.m['M-06'] = pass(m06Evidence);
    } else {
      evidence.m['M-06'] = { status: 'FAIL', evidence: m06Evidence };
      evidence.failures.push('M-06');
    }

    currentStep = 'M-07';
    await expect(secondPage.getByText('68 / C')).toBeVisible({ timeout: 30_000 });
    const terminalDetail = await pollNovelDetail(secondPage, seed.novelId, (detail) => detail.latestFullReview?.gate?.gateResult === 'blocked');
    const latest = await browserGet(secondPage, `${API_ORIGIN}/novels/${seed.novelId}/full-review/latest`);
    const observer = await browserGet(secondPage, `${API_ORIGIN}/__e2e/rp04c/state`);
    expect(latest.status).toBe(200);
    expect(observer.status).toBe(200);
    expect(observer.data.providerCallCount).toBe(1);
    expect(observer.data.chapterCount).toBe(12);
    expect(observer.data.coveredChapterNos).toEqual(EXPECTED_CHAPTER_NOS);
    expect(observer.data.contentEvidenceCount).toBe(12);
    expect(observer.data.featureEvidenceCount).toBe(12);
    expect(observer.data.reviewEvidenceCount).toBe(12);
    expect(observer.data.memoryEvidenceCount).toBe(1);
    expect(observer.data.providerCompleted).toBe(true);
    expect(terminalDetail.completionDecision).toBeNull();
    expect(terminalDetail.videoReadiness.status).toBe('not_ready');
    expect(terminalDetail.videoReadiness.check).toBeNull();
    expect(terminalDetail.videoReadiness.snapshot).toBeNull();
    evidence.fixture.manifestHash = observer.data.manifestHash;
    evidence.fixture.coveredChapterNos = observer.data.coveredChapterNos;
    evidence.fixture.evidenceCounts = { content: 12, feature: 12, review: 12, memory: 1 };
    evidence.ids.reportId = latest.data.fullReview.id;
    evidence.ids.gateId = latest.data.fullReview.gate.id;
    evidence.m['M-07'] = pass({
      reportId: evidence.ids.reportId,
      reportVersion: latest.data.fullReview.version,
      gateId: evidence.ids.gateId,
      issueCount: latest.data.fullReview.issues.length,
      completionDecisionAbsent: true,
      videoReadinessStatus: 'not_ready'
    });

    currentStep = 'M-08';
    const expectedIssues = [
      ['人物状态冲突', /第 2 章.*第 8 章/],
      ['时间线冲突', /第 4 章.*第 9 章/],
      ['关键事实冲突', /第 6 章.*第 11 章/]
    ];
    for (const [title, scopePattern] of expectedIssues) {
      const card = secondPage.locator('.impact-case-card').filter({ hasText: title });
      await expect(card).toBeVisible();
      await expect(card.locator('.full-review-issue-scope')).toHaveText(scopePattern);
      const apiIssue = latest.data.fullReview.issues.find((issue) => issue.title === title);
      expect(apiIssue?.severity).toBe('blocking');
      expect(apiIssue?.blocking).toBe(true);
    }
    const issueTitles = latest.data.fullReview.issues.map((issue) => issue.title);
    expect(issueTitles).toEqual(['人物状态冲突', '时间线冲突', '关键事实冲突']);
    evidence.m['M-08'] = pass({ personConflictScopes: [2, 8], timelineConflictScopes: [4, 9], factConflictScopes: [6, 11], controlFalsePositive: 0 });

    currentStep = 'M-09';
    await expect(completionButton(secondPage)).toBeDisabled();
    expect(latest.data.fullReview.gate.gateResult).toBe('blocked');
    expect(latest.data.fullReview.gate.allowCompletion).toBe(false);
    expect(telemetry.completionPostCount).toBe(0);
    evidence.m['M-09'] = pass({ allowCompletion: false, blockingCount: latest.data.fullReview.gate.blockingIssueCount, completionPostCount: 0 });

    currentStep = 'M-10';
    await secondPage.locator('.step-side-panel').getByRole('button', { name: '查看详情' }).click();
    await expect(taskDrawer(secondPage)).toContainText(taskId);
    await expect(taskDrawer(secondPage)).toContainText('已完成');
    await secondPage.keyboard.press('Escape');
    await secondPage.reload();
    await expect(secondPage.getByText('68 / C')).toBeVisible();
    const afterRefreshDetail = await browserGet(secondPage, `${API_ORIGIN}/novels/${seed.novelId}`);
    const afterRefreshLatest = await browserGet(secondPage, `${API_ORIGIN}/novels/${seed.novelId}/full-review/latest`);
    expect(afterRefreshDetail.data.recentTasks.some((task) => task.id === taskId)).toBe(true);
    expect(afterRefreshLatest.data.fullReview.id).toBe(evidence.ids.reportId);
    expect(afterRefreshLatest.data.fullReview.gate.id).toBe(evidence.ids.gateId);
    expect(telemetry.fullReviewPosts).toHaveLength(1);
    expect(telemetry.completionPostCount).toBe(0);
    evidence.m['M-10'] = pass({ idsStableAfterRefresh: true, duplicatePostOrAsset: false, taskId, reportId: evidence.ids.reportId, gateId: evidence.ids.gateId });

    currentStep = 'M-11';
    await Promise.all(telemetry.pendingNetworkScans);
    const surfaces = await Promise.all([scanBrowserSurfaces(page), scanBrowserSurfaces(secondPage)]);
    const domSensitiveHits = surfaces.reduce((sum, item) => sum + item.domSensitiveHits, 0);
    const storageSensitiveHits = surfaces.reduce((sum, item) => sum + item.storageSensitiveHits, 0);
    const cookieSensitiveHits = await scanCookies(context);
    expect(domSensitiveHits).toBe(0);
    expect(storageSensitiveHits).toBe(0);
    expect(cookieSensitiveHits).toBe(0);
    expect(telemetry.consoleSensitiveHits).toBe(0);
    expect(telemetry.networkSensitiveHits).toBe(0);
    expect(telemetry.pageErrors).toBe(0);
    evidence.privacy = {
      domSensitiveHits,
      consoleSensitiveHits: telemetry.consoleSensitiveHits,
      storageSensitiveHits,
      cookieSensitiveHits,
      networkSensitiveHits: telemetry.networkSensitiveHits,
      pageErrors: telemetry.pageErrors,
      networkJsonObjectsScanned: telemetry.networkJsonObjectsScanned,
      rawArtifactsSaved: false,
      harSaved: false,
      traceSaved: false
    };
    evidence.network = {
      fullReviewPostCount: telemetry.fullReviewPosts.length,
      completionPostCount: telemetry.completionPostCount,
      fullReviewResponseStatus: telemetry.fullReviewResponseStatus,
      taskDetailGetCount: telemetry.taskDetailGetCount,
      taskEventsGetCount: telemetry.taskEventsGetCount
    };
    evidence.m['M-11'] = pass({ bodyCanarySourceVerified: evidence.fixture.bodyCanaryVerified, bodyCanaryLeakHits: 0, domHits: 0, consoleHits: 0, storageHits: 0, cookieHits: 0, networkHits: 0 });
    if (evidence.failures.length > 0) {
      currentStep = 'M-SUMMARY';
      throw new Error(`RP-04C browser acceptance failures: ${evidence.failures.join(', ')}`);
    }
    evidence.browserConclusion = 'candidate_for_independent_review';
  } catch (error) {
    if (evidence.m[currentStep] && evidence.m[currentStep].status !== 'PASS' && evidence.m[currentStep].status !== 'FAIL') {
      evidence.m[currentStep] = { status: 'FAIL', evidence: { safeFailureClass: error instanceof Error ? error.name : 'UnknownFailure' } };
      if (!evidence.failures.includes(currentStep)) evidence.failures.push(currentStep);
    }
    evidence.browserConclusion = 'needs_revision';
    throw error;
  } finally {
    evidence.finishedAt = new Date().toISOString();
    writeSafeEvidence(evidence);
  }
});

function createEvidence(runId, startedAt) {
  return {
    schemaVersion: 1,
    acceptanceId: 'RP-04C_BROWSER_ACCEPTANCE_M01_M11',
    runId,
    gitSha: process.env.RP04C_GIT_SHA ?? 'unknown',
    gitTree: process.env.RP04C_GIT_TREE ?? 'unknown',
    worktree: {
      dirty: process.env.RP04C_WORKTREE_DIRTY === 'true',
      executableScopeHash: process.env.RP04C_EXECUTABLE_SCOPE_HASH ?? 'unknown'
    },
    startedAt,
    finishedAt: null,
    fixture: {
      fixtureVersion: 'rp04c-browser-12ch-v1',
      modelRouteSafeName: 'deterministic-delay-provider',
      novelId: null,
      chapterCount: 0,
      coveredChapterNos: [],
      evidenceCounts: null,
      manifestHash: null,
      bodyCanaryVerified: false
    },
    ids: { taskId: null, requestId: null, reportId: null, gateId: null },
    m: Object.fromEntries(EXPECTED_CHAPTER_NOS.slice(0, 11).map((_, index) => [`M-${String(index + 1).padStart(2, '0')}`, { status: 'NOT_RUN', evidence: {} }])),
    network: null,
    privacy: null,
    notProven: ['N-01', 'N-05-paid-provider-and-cost', 'N-06-real-model', 'N-08-direct-api-concurrency', 'N-09-process-recovery'],
    failures: [],
    browserConclusion: 'blocked',
    approval: 'NOT_ISSUED',
    evidenceHash: null
  };
}

function fullReviewButton(page) {
  return page.locator('main.step-main-content').getByRole('button', { name: '全书 AI 审稿' });
}

function completionButton(page) {
  return page.locator('main.step-main-content').getByRole('button', { name: '确认小说完成' });
}

function taskDrawer(page) {
  return page.getByRole('dialog', { name: '任务详情' });
}

async function assertTaskStillProcessing(page, taskId) {
  const observer = await browserGet(page, `${API_ORIGIN}/__e2e/rp04c/state`);
  expect(observer.status).toBe(200);
  expect(observer.data.providerActive).toBe(true);
  expect(observer.data.providerCompleted).toBe(false);
  const task = observer.data.fullReviewTasks.find((candidate) => candidate.id === taskId);
  expect(task?.status).toBe('processing');
  return { taskStatus: task.status, providerActive: observer.data.providerActive };
}

function createTelemetry() {
  return {
    fullReviewPosts: [],
    fullReviewResponseStatus: null,
    completionPostCount: 0,
    taskDetailGetCount: 0,
    taskEventsGetCount: 0,
    consoleSensitiveHits: 0,
    networkSensitiveHits: 0,
    networkJsonObjectsScanned: 0,
    pageErrors: 0,
    pendingNetworkScans: []
  };
}

function attachPageTelemetry(page, telemetry) {
  page.on('console', (message) => {
    if (sensitiveValueHit(message.text())) telemetry.consoleSensitiveHits += 1;
  });
  page.on('pageerror', () => { telemetry.pageErrors += 1; });
}

function attachNetworkTelemetry(context, telemetry) {
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (request.method() === 'POST' && /\/novels\/[^/]+\/full-review$/.test(url.pathname)) telemetry.fullReviewPosts.push({ request });
    if (request.method() === 'POST' && /\/novels\/[^/]+\/completion\/confirm$/.test(url.pathname)) telemetry.completionPostCount += 1;
    if (request.method() === 'GET' && /\/tasks\/[^/]+$/.test(url.pathname)) telemetry.taskDetailGetCount += 1;
    if (request.method() === 'GET' && /\/tasks\/[^/]+\/events$/.test(url.pathname)) telemetry.taskEventsGetCount += 1;
    if (request.postData()) {
      try {
        telemetry.networkSensitiveHits += scanJson(JSON.parse(request.postData()));
      } catch {
        telemetry.networkSensitiveHits += sensitiveValueHit(request.postData()) ? 1 : 0;
      }
    }
  });
  context.on('response', (response) => {
    const url = new URL(response.url());
    if (response.request().method() === 'POST' && /\/novels\/[^/]+\/full-review$/.test(url.pathname)) {
      telemetry.fullReviewResponseStatus = response.status();
    }
    if (!isRelevantJsonPath(url.pathname)) return;
    const scan = response.json().then((payload) => {
      telemetry.networkJsonObjectsScanned += 1;
      telemetry.networkSensitiveHits += scanJson(payload);
    }).catch(() => undefined);
    telemetry.pendingNetworkScans.push(scan);
  });
}

function isRelevantJsonPath(pathname) {
  return /\/novels\/|\/tasks\/|\/__e2e\/rp04c\/state/.test(pathname);
}

function scanJson(value) {
  let hits = 0;
  const visit = (item) => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (!item || typeof item !== 'object') {
      if (typeof item === 'string' && sensitiveValueHit(item)) hits += 1;
      return;
    }
    for (const [key, child] of Object.entries(item)) {
      if (SENSITIVE_KEYS.has(normalizeKey(key))) hits += 1;
      visit(child);
    }
  };
  visit(value);
  return hits;
}

function normalizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sensitiveValueHit(value) {
  const text = String(value);
  return text.includes(SAFE_BODY_CANARY) || SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(text));
}

async function browserGet(page, url) {
  return page.evaluate(async (target) => {
    const response = await fetch(target);
    const payload = await response.json();
    return { status: response.status, data: payload.data };
  }, url);
}

async function pollNovelDetail(page, novelId, predicate) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const result = await browserGet(page, `${API_ORIGIN}/novels/${novelId}`);
    if (result.status === 200 && predicate(result.data)) return result.data;
    await page.waitForTimeout(500);
  }
  throw new Error('Novel detail polling timed out');
}

async function pollObserver(page, predicate) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const result = await browserGet(page, `${API_ORIGIN}/__e2e/rp04c/state`);
    if (result.status === 200 && predicate(result.data)) return result.data;
    await page.waitForTimeout(250);
  }
  throw new Error('RP-04C safe observer polling timed out');
}

async function processingState(page, startedAt) {
  const panel = page.locator('.step-side-panel .task-progress-panel');
  await expect(panel.locator('.task-progress-label')).toHaveText('生成中');
  await expect(panel).toContainText('当前不展示精确百分比');
  await expect(panel).toContainText('可能需要 1-3 分钟');
  const visibleText = await panel.innerText();
  expect(visibleText).not.toMatch(/\b(?:12|38|65|82)%\b/);
  return { elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000), status: 'processing' };
}

async function scanBrowserSurfaces(page) {
  const result = await page.evaluate(() => ({
    bodyText: document.body.innerText,
    bodyHtml: document.body.innerHTML,
    localStorageEntries: Object.entries(window.localStorage),
    sessionStorageEntries: Object.entries(window.sessionStorage)
  }));
  const domSensitiveHits = [result.bodyText, result.bodyHtml].filter(sensitiveValueHit).length;
  const storageSensitiveHits = [...result.localStorageEntries, ...result.sessionStorageEntries]
    .reduce((hits, [key, value]) => hits + (sensitiveValueHit(key) || sensitiveValueHit(value) || SENSITIVE_KEYS.has(normalizeKey(key)) ? 1 : 0), 0);
  return { domSensitiveHits, storageSensitiveHits };
}

async function scanCookies(context) {
  const cookies = await context.cookies();
  return cookies.reduce((hits, cookie) => hits + (sensitiveValueHit(cookie.name) || sensitiveValueHit(cookie.value) ? 1 : 0), 0);
}

function unwrap(payload) {
  if (!payload?.success) throw new Error('Expected successful API envelope');
  return payload.data;
}

function pass(evidence) {
  return { status: 'PASS', evidence };
}

function writeSafeEvidence(evidence) {
  const hashInput = { ...evidence, evidenceHash: null };
  evidence.evidenceHash = createHash('sha256').update(JSON.stringify(hashInput)).digest('hex');
  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
}
