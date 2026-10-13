import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ErrorCode, RiskLevel, type BodyBatchChapterResultDTO } from '@ai-shortvideo/shared';
import type { BodyBatchGenerationInput, BodyBatchTaskCreationInput } from '../domain/novelDomain.js';
import { PrismaNovelRepository } from './prismaNovelRepository.js';

type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key];
    if (expected && typeof expected === 'object' && !(expected instanceof Date) && !Array.isArray(expected)) {
      if ('in' in expected) return expected.in.includes(actual);
      if ('not' in expected) return actual !== expected.not;
      if ('gte' in expected && actual < expected.gte) return false;
      if ('lte' in expected && actual > expected.lte) return false;
      if ('gt' in expected && actual <= expected.gt) return false;
      return true;
    }
    return actual === expected;
  });
}

function fakePrisma(tables: Tables) {
  const controls = { failCreate: null as { model: string; call: number } | null, createCalls: {} as Record<string, number> };
  const client = {
    tables,
    controls,
    async $transaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
      const draft = structuredClone(this.tables);
      const tx = delegates(draft, this.controls);
      const result = await work(tx);
      this.tables = draft;
      Object.assign(this, delegates(draft, this.controls));
      return result;
    },
    ...delegates(tables, controls)
  };
  return client;
}

function delegates(tables: Tables, controls: { failCreate: { model: string; call: number } | null; createCalls: Record<string, number> }): Row {
  return Object.fromEntries(Object.keys(tables).map((model) => [model, {
    findFirst: async ({ where = {}, orderBy, select }: Row = {}) => {
      let rows = tables[model].filter((row) => matches(row, where));
      if (orderBy) {
        const [key, direction] = Object.entries(orderBy)[0] as [string, unknown];
        rows = rows.sort((left, right) => direction === 'desc' ? Number(right[key] > left[key]) - Number(right[key] < left[key]) : Number(left[key] > right[key]) - Number(left[key] < right[key]));
      }
      const found = rows[0] ?? null;
      return found && select ? Object.fromEntries(Object.keys(select).map((key) => [key, found[key]])) : found;
    },
    findFirstOrThrow: async (query: Row) => {
      const found = await (delegates(tables, controls)[model] as Row).findFirst(query);
      if (!found) throw new Error(`${model} missing`);
      return found;
    },
    findMany: async ({ where = {}, orderBy, select }: Row = {}) => {
      let rows = tables[model].filter((row) => matches(row, where));
      if (orderBy) {
        const [key, direction] = Object.entries(orderBy)[0] as [string, unknown];
        rows = rows.sort((left, right) => direction === 'desc' ? Number(right[key] > left[key]) - Number(right[key] < left[key]) : Number(left[key] > right[key]) - Number(left[key] < right[key]));
      }
      return select ? rows.map((row) => Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]))) : rows;
    },
    count: async ({ where = {} }: Row) => tables[model].filter((row) => matches(row, where)).length,
    updateMany: async ({ where, data }: Row) => {
      const rows = tables[model].filter((row) => matches(row, where));
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    },
    update: async ({ where, data }: Row) => {
      const row = tables[model].find((item) => matches(item, where));
      if (!row) throw new Error(`${model} update missing`);
      Object.assign(row, data);
      return row;
    },
    create: async ({ data }: Row) => {
      controls.createCalls[model] = (controls.createCalls[model] ?? 0) + 1;
      if (controls.failCreate?.model === model && controls.failCreate.call === controls.createCalls[model]) {
        controls.failCreate = null;
        throw new Error('injected database write failure');
      }
      const row = { id: data.id ?? `${model}-${tables[model].length + 1}`, ...data };
      tables[model].push(row);
      return row;
    }
  }]));
}

function fixture() {
  const now = new Date('2026-10-13T00:00:00Z');
  const refs = {
    currentDirectionVersionId: 'direction-1', currentSettingVersionId: 'setting-1',
    currentOutlineVersionId: 'outline-1', currentStageOutlineVersionId: 'stage-1',
    currentChapterPlanVersionId: 'plan-1', trialRunId: 'trial-1', selectedChapterOneCandidateId: 'trial-chapter-1',
    strategySnapshotId: 'strategy-1', strategySnapshotVersion: 1, creationStage: 'body'
  };
  const novel: Row = {
    id: 'novel-1', tenantId: 'tenant-a', ownerId: 'user-1', title: '小说', channel: 'novel', genresJson: [],
    lifecycleStatus: 'ACTIVE', creationStage: 'BODY', stageStatus: 'NOT_STARTED',
    currentDirectionVersionId: refs.currentDirectionVersionId, currentSettingVersionId: refs.currentSettingVersionId,
    currentOutlineVersionId: refs.currentOutlineVersionId, currentStageOutlineVersionId: refs.currentStageOutlineVersionId,
    currentChapterPlanVersionId: refs.currentChapterPlanVersionId, currentTrialRunId: refs.trialRunId,
    currentFullReviewReportId: null, currentFullReviewGateId: null, currentCompletionDecisionId: null,
    currentVideoReadinessSnapshotId: null, policyProfileVersionId: 'policy-1', hotspotReportId: null,
    chapterLimit: 6, chapterWordMin: 1800, chapterWordMax: 2600, summary: null, pauseReason: null,
    archiveReason: null, displayStatus: null, currentStep: null, completedStepsJson: null,
    recommendedActionSnapshot: null, videoReferenceStatus: null, createdBy: 'user-1', updatedBy: 'user-1',
    createdAt: now, updatedAt: now, deletedAt: null, metadata: {}
  };
  const task: Row = {
    id: 'task-1', tenantId: 'tenant-a', novelId: novel.id, taskType: 'body_batch_generate', objectType: 'body_batch', objectId: novel.id,
    status: 'PROCESSING', statusNote: null, progress: 0, currentStep: null, triggerSource: 'manual', sourceVersionRefs: refs,
    conflictScope: 'novel_body_batch', conflictKey: novel.id, idempotencyToken: 'body-key-0001', requestHash: 'hash-1',
    activeClaimKey: 'claim-1', policyProfileVersionId: 'policy-1', modelRoutingVersion: 'mock', inputSummary: null,
    outputSummary: null, resultVersionId: null, resultVersionIdsJson: null, retryOfTaskId: null, failureCategory: null,
    errorCode: null, errorMessage: null, resultObjectType: null, resultObjectId: null, userAcceptedResult: false,
    cancelRequestedAt: null, cancelReason: null, startedAt: now, finishedAt: null, createdBy: 'user-1',
    createdAt: now, updatedAt: now, metadata: {}, leaseOwnerId: null, leaseToken: null, leaseExpiresAt: null,
    lastHeartbeatAt: null, retryCount: 0, maxRetries: 2, executionEnvelopeJson: null, providerAttemptId: null,
    providerAttemptPhase: null, providerDispatchedAt: null, resultReceiptHash: null, rootTaskId: 'task-1',
    providerCallBudgetMax: 0, providerCallBudgetUsed: 0, durationDeadlineAt: now,
    costBudgetMicrosMax: 0n, costBudgetMicrosUsed: 0n
  };
  const chapters = [4, 5].map((chapterNo) => ({
    id: `chapter-${chapterNo}`, tenantId: 'tenant-a', novelId: novel.id, chapterNo, stageIndex: 1,
    title: `第 ${chapterNo} 章`, wordTarget: 2000, wordCount: 0, mainStatus: 'pending', statusNote: null,
    impactLevel: 'NONE', currentFeatureCardVersionId: null, currentContentVersionId: null,
    currentReviewReportId: null, lastGenerationTaskId: null, createdAt: now, updatedAt: now, deletedAt: null, metadata: {}
  }));
  const tables: Tables = Object.fromEntries([
    'generationTask', 'generationTaskEvent', 'novel', 'creativeVersion', 'novelChapter',
    'chapterContentVersion', 'chapterFeatureCard', 'reviewReport', 'longTermMemory', 'trialRun'
  ].map((name) => [name, []]));
  tables.generationTask.push(task);
  tables.novel.push(novel);
  tables.trialRun.push({ id: refs.trialRunId, tenantId: novel.tenantId, novelId: novel.id,
    status: 'confirmed', metadata: { bodyStrategySnapshotId: refs.strategySnapshotId } });
  tables.creativeVersion.push({ id: 'strategy-1', tenantId: 'tenant-a', novelId: novel.id,
    objectType: 'body_strategy_snapshot', versionNo: 1, status: 'CURRENT', staleLevel: 'NONE', sourceVersionRefs: refs });
  tables.novelChapter.push(...chapters);
  const client = fakePrisma(tables);
  const repository = Object.create(PrismaNovelRepository.prototype) as PrismaNovelRepository;
  Object.defineProperty(repository, 'prisma', { value: client });
  const base = {
    novel, task, strategySnapshot: { id: 'strategy-1', versionNo: 1 }, idempotencyKey: 'body-key-0001',
    requestFingerprint: { range: [4, 5] }, startChapterNo: 4, endChapterNo: 5, sourceVersionRefs: refs,
    context: { tenantId: 'tenant-a', userId: 'user-1', requestId: 'request-1' }, now
  } as unknown as BodyBatchTaskCreationInput;
  return { repository, client, base, chapters, now };
}

function draft(chapter: Row, hardFailed = false): BodyBatchGenerationInput['chapters'][number] {
  return {
    chapter, content: '正'.repeat(2000), summary: '摘要', openingStrategy: '开场', openingHighlight: '亮点',
    firstSentence: '第一句', first300Summary: '前三百字', endingHook: '钩子', riskLevel: RiskLevel.Low,
    riskTags: [], aiRecommendedReason: '建议', scoring: { totalScore: 85 },
    featureCard: { oneLineSummary: '一句话', coreTask: '任务', mainConflict: '冲突', appealPoint: '爽点',
      emotionKeywords: [], characterChanges: [], relationshipChanges: [], keyInformation: [],
      foreshadowingOperation: '伏笔', endingHook: '钩子', factsCannotChange: [], featuresToStrengthen: [], metadata: {} },
    review: { reviewLevel: 'chapter', totalScore: 85, subScores: {}, rating: 'pass', summary: '审稿',
      strengths: [], problems: [], suggestions: [], issueCards: [], actionOptions: [], recommendedAction: '继续',
      allowNextStep: true, blockingIssueCount: 0, resolvedStatus: 'open', promptTemplateVersionId: null,
      policyProfileVersionId: 'policy-1', metadata: {} },
    memory: { previousSummary: '前情', characterStates: [], relationshipStates: [], locations: [],
      organizations: [], items: [], plantedForeshadowing: [], resolvedForeshadowing: [],
      unresolvedConflicts: [], newSettings: [], factsCannotContradict: [], metadata: {} },
    hardFailed, hardFailureReasons: hardFailed ? ['质量不合格'] : []
  } as BodyBatchGenerationInput['chapters'][number];
}

describe('Prisma body batch repository', () => {
  it('persists two chapters and their four assets, with replay-safe batch lookup', async () => {
    const { repository, client, base, chapters } = fixture();
    const prepared = await repository.createBodyBatchTask(base);
    assert.equal(prepared.reused, false);
    const generated = await repository.generateBodyBatch({ ...base, chapters: chapters.map((chapter) => draft(chapter)), previousBatchSummary: null });
    assert.equal(generated.batch.status, 'completed');
    assert.equal(generated.batch.completedCount, 2);
    for (const model of ['chapterContentVersion', 'chapterFeatureCard', 'reviewReport', 'longTermMemory']) assert.equal(client.tables[model].length, 2);
    assert.equal(client.tables.novelChapter[0].currentContentVersionId, generated.batch.chapterResults[0].contentVersionId);
    assert.equal((await repository.findBodyBatchByIdempotencyKey('tenant-a', 'novel-1', 'body-key-0001'))?.id, generated.batch.id);
    assert.equal(await repository.findBodyBatchByIdempotencyKey('tenant-b', 'novel-1', 'body-key-0001'), null);
    assert.equal((await repository.findLatestBodyBatch('tenant-a', 'novel-1'))?.id, generated.batch.id);
    assert.equal((await repository.findLatestLongTermMemory('tenant-a', 'novel-1'))?.sourceContentVersionId, generated.batch.chapterResults[1].contentVersionId);
  });

  it('retains completed chapter and pauses at hard failure without writing later assets', async () => {
    const { repository, client, base, chapters } = fixture();
    await repository.createBodyBatchTask(base);
    const result = await repository.generateBodyBatch({ ...base, chapters: [draft(chapters[0]), draft(chapters[1], true)], previousBatchSummary: null });
    assert.equal(result.batch.status, 'paused');
    assert.equal(result.batch.completedCount, 1);
    assert.equal(result.batch.failedChapterNo, 5);
    assert.equal(client.tables.chapterContentVersion.length, 1);
    assert.equal(client.tables.novelChapter[1].currentContentVersionId, null);
    assert.equal(client.tables.generationTask[0].status, 'FAILED');
  });

  it('rejects overlength content and changed targets before formal writes', async () => {
    const { repository, client, base, chapters } = fixture();
    await repository.createBodyBatchTask(base);
    const overlong = draft(chapters[0]);
    overlong.content = '长'.repeat(2301);
    await assert.rejects(
      () => repository.generateBodyBatch({ ...base, chapters: [overlong, draft(chapters[1])], previousBatchSummary: null }),
      (error: unknown) => (error as { code?: string }).code === ErrorCode.GateBlocked
    );
    assert.equal(client.tables.chapterContentVersion.length, 0);
    assert.equal(client.tables.generationTask[0].metadata.bodyBatchProgress.chapterResults.length, 0);
    client.tables.novelChapter[0].wordTarget = 2100;
    await assert.rejects(
      () => repository.generateBodyBatch({ ...base, chapters: chapters.map((chapter) => draft(chapter)), previousBatchSummary: null }),
      (error: unknown) => (error as { code?: string }).code === ErrorCode.CandidateStale
    );
    assert.equal(client.tables.chapterContentVersion.length, 0);
  });

  it('rolls back an interrupted chapter but retains and reuses the prior chapter checkpoint', async () => {
    const { repository, client, base, chapters } = fixture();
    await repository.createBodyBatchTask(base);
    client.controls.failCreate = { model: 'chapterFeatureCard', call: 2 };
    const generation = { ...base, chapters: chapters.map((chapter) => draft(chapter)), previousBatchSummary: null };
    await assert.rejects(() => repository.generateBodyBatch(generation), /injected database write failure/);
    assert.equal(client.tables.chapterContentVersion.length, 1);
    assert.equal(client.tables.chapterFeatureCard.length, 1);
    assert.equal(client.tables.reviewReport.length, 1);
    assert.equal(client.tables.longTermMemory.length, 1);
    assert.equal(client.tables.novelChapter[1].currentContentVersionId, null);
    assert.equal(client.tables.generationTask[0].metadata.bodyBatchProgress.chapterResults.length, 1);
    const resumed = await repository.generateBodyBatch(generation);
    assert.equal(resumed.batch.completedCount, 2);
    assert.equal(client.tables.chapterContentVersion.length, 2);
    assert.equal(client.tables.chapterFeatureCard.length, 2);
  });

  it('fences stale claim, foreign tenant, and existing formal content', async () => {
    const { repository, client, base } = fixture();
    await assert.rejects(() => repository.createBodyBatchTask({ ...base, context: { ...base.context, tenantId: 'tenant-b' } }), (error: unknown) => (error as { code?: string }).code === ErrorCode.GateBlocked);
    client.tables.novelChapter[0].currentContentVersionId = 'existing-version';
    await assert.rejects(() => repository.createBodyBatchTask(base), (error: unknown) => (error as { code?: string }).code === ErrorCode.GateBlocked);
    assert.equal(client.tables.generationTask[0].metadata.bodyBatchProgress, undefined);
    client.tables.novelChapter[0].currentContentVersionId = null;
    client.tables.generationTask[0].activeClaimKey = null;
    await assert.rejects(() => repository.createBodyBatchTask(base), (error: unknown) => (error as { code?: string }).code === ErrorCode.GateBlocked);
  });

  it('rejects stale upstream references before any body asset write', async () => {
    const { repository, client, base } = fixture();
    client.tables.novel[0].currentChapterPlanVersionId = 'new-plan';
    await assert.rejects(() => repository.createBodyBatchTask(base), (error: unknown) => (error as { code?: string }).code === ErrorCode.CandidateStale);
    assert.equal(client.tables.chapterContentVersion.length, 0);
    assert.equal(client.tables.generationTask[0].metadata.bodyBatchProgress, undefined);
  });

  it('does not return candidate or stale-current memory as chapter context', async () => {
    const { repository, client, base, chapters } = fixture();
    client.tables.novelChapter[0].currentContentVersionId = 'version-current';
    client.tables.chapterContentVersion.push({ id: 'version-current', tenantId: 'tenant-a', novelId: 'novel-1', chapterId: chapters[0].id, status: 'CURRENT' });
    client.tables.novelChapter[1].currentContentVersionId = 'candidate-pointer';
    client.tables.chapterContentVersion.push({ id: 'candidate-pointer', tenantId: 'tenant-a', novelId: 'novel-1', chapterId: chapters[1].id, status: 'CANDIDATE' });
    client.tables.longTermMemory.push(
      { id: 'valid', tenantId: 'tenant-a', novelId: 'novel-1', chapterId: chapters[0].id, sourceContentVersionId: 'version-current', status: 'CURRENT', staleLevel: 'NONE', createdAt: base.now },
      { id: 'candidate', tenantId: 'tenant-a', novelId: 'novel-1', chapterId: chapters[0].id, sourceContentVersionId: 'version-candidate', status: 'CANDIDATE', staleLevel: 'NONE', createdAt: new Date(base.now.getTime() + 1) },
      { id: 'stale-current', tenantId: 'tenant-a', novelId: 'novel-1', chapterId: chapters[0].id, sourceContentVersionId: 'old-version', status: 'CURRENT', staleLevel: 'NONE', createdAt: new Date(base.now.getTime() + 2) },
      { id: 'hard-stale-current', tenantId: 'tenant-a', novelId: 'novel-1', chapterId: chapters[0].id, sourceContentVersionId: 'version-current', status: 'CURRENT', staleLevel: 'HARD_STALE', createdAt: new Date(base.now.getTime() + 3) },
      { id: 'candidate-pointer-memory', tenantId: 'tenant-a', novelId: 'novel-1', chapterId: chapters[1].id, sourceContentVersionId: 'candidate-pointer', status: 'CURRENT', staleLevel: 'NONE', createdAt: new Date(base.now.getTime() + 3) }
    );
    assert.equal((await repository.findLatestLongTermMemory('tenant-a', 'novel-1', chapters[0].id))?.id, 'valid');
    assert.equal((await repository.findLatestLongTermMemory('tenant-a', 'novel-1'))?.id, 'valid');
    assert.equal(await repository.findLatestLongTermMemory('tenant-b', 'novel-1'), null);
  });

  it('prefers the highest current chapter over a newer earlier memory and binds both lookups to their chapters', async () => {
    const { repository, client, base, chapters } = fixture();
    for (const chapter of chapters) {
      chapter.currentContentVersionId = `version-${chapter.chapterNo}`;
      client.tables.chapterContentVersion.push({ id: chapter.currentContentVersionId, tenantId: 'tenant-a',
        novelId: 'novel-1', chapterId: chapter.id, status: 'CURRENT' });
    }
    client.tables.longTermMemory.push(
      { id: 'later-chapter', tenantId: 'tenant-a', novelId: 'novel-1', chapterId: chapters[1].id,
        sourceContentVersionId: chapters[1].currentContentVersionId, status: 'CURRENT', staleLevel: 'NONE', createdAt: base.now },
      { id: 'newer-earlier-chapter', tenantId: 'tenant-a', novelId: 'novel-1', chapterId: chapters[0].id,
        sourceContentVersionId: chapters[0].currentContentVersionId, status: 'CURRENT', staleLevel: 'NONE', createdAt: new Date(base.now.getTime() + 1000) },
      { id: 'wrong-chapter-version', tenantId: 'tenant-a', novelId: 'novel-1', chapterId: chapters[1].id,
        sourceContentVersionId: chapters[0].currentContentVersionId, status: 'CURRENT', staleLevel: 'NONE', createdAt: new Date(base.now.getTime() + 2000) }
    );
    assert.equal((await repository.findLatestLongTermMemory('tenant-a', 'novel-1'))?.id, 'later-chapter');
    assert.equal((await repository.findLatestLongTermMemory('tenant-a', 'novel-1', chapters[0].id))?.id, 'newer-earlier-chapter');
    assert.equal((await repository.findLatestLongTermMemory('tenant-a', 'novel-1', chapters[1].id))?.id, 'later-chapter');
  });
});
