import { NovelCreationStage, NovelLifecycleStatus, RiskLevel, StaleLevel, StageStatus, TaskStatus, VersionStatus } from '@ai-shortvideo/shared';
import type { ChatCompletionRequest, ChatCompletionResult, LlmClient } from '../../src/modules/ai/llmClient.js';
import {
  DEFAULT_TENANT_ID,
  DEFAULT_USER_ID,
  type CreativeVersionRecord,
  type GenerationTaskEventRecord,
  type GenerationTaskRecord,
  type NovelRecord,
  type NovelRepository
} from '../../src/modules/novels/domain/novelDomain.js';

export type Rp01cScenarioKind = 'valid_state' | 'counterexample';
export type Rp01cScenarioId =
  | 'processing'
  | 'failed_timeout'
  | 'failed_malformed_json'
  | 'stale_source'
  | 'active_conflict'
  | 'restart_boundary'
  | 'chapter_plan_chunk_failure'
  | 'save_failure_after_provider'
  | 'late_result_after_cancel'
  | 'duplicate_current';

export interface Rp01cScenarioDefinition {
  id: Rp01cScenarioId;
  kind: Rp01cScenarioKind;
  category: string;
}

export interface Rp01cFixtureSnapshot {
  scenario: Rp01cScenarioDefinition;
  runId: string;
  generatedAt: Date;
  novels: NovelRecord[];
  tasks: GenerationTaskRecord[];
  events: GenerationTaskEventRecord[];
  versions: CreativeVersionRecord[];
  idempotencyClaims: Array<{
    tenantId: string;
    novelId: string;
    taskId: string;
    taskType: string;
    idempotencyToken: string;
    requestHash: string;
  }>;
  replayInput: Record<string, unknown>;
  detectors: {
    duplicateCurrentVersionIds: string[];
    lateResultRisk: boolean;
  };
}

export interface Rp01cInjectionPlan {
  scenarioId: Rp01cScenarioId;
  steps: Array<{
    target: 'llm' | 'repository' | 'late_result';
    callIndex: number;
    outcome: 'timeout' | 'malformed_json' | 'save_failed' | 'released_after_cancel';
    providerCompleted: boolean;
    safeSummary: string;
  }>;
}

export interface Rp01cInjectionProbeResult {
  scenarioId: Rp01cScenarioId;
  chatCalls: number;
  saveCalls: number;
  providerCompleted: boolean;
  rejected: boolean;
  parseFailed: boolean;
  cancelledBeforeRelease: boolean;
  lateResultReleased: boolean;
  writesAttempted: boolean;
  records: string[];
}

export const RP01C_BASE_TIME_ISO = '2026-07-13T00:00:00.000Z';
export const RP01C_SCENARIOS: readonly Rp01cScenarioDefinition[] = Object.freeze([
  { id: 'processing', kind: 'valid_state', category: 'processing' },
  { id: 'failed_timeout', kind: 'valid_state', category: 'failed' },
  { id: 'failed_malformed_json', kind: 'valid_state', category: 'failed' },
  { id: 'stale_source', kind: 'valid_state', category: 'stale' },
  { id: 'active_conflict', kind: 'valid_state', category: 'conflict' },
  { id: 'restart_boundary', kind: 'valid_state', category: 'restart' },
  { id: 'chapter_plan_chunk_failure', kind: 'valid_state', category: 'chunk_failure' },
  { id: 'save_failure_after_provider', kind: 'valid_state', category: 'save_failure' },
  { id: 'late_result_after_cancel', kind: 'counterexample', category: 'late_result' },
  { id: 'duplicate_current', kind: 'counterexample', category: 'duplicate_current' }
]);

export function createRp01cFixture(scenarioId: Rp01cScenarioId, tenantId = DEFAULT_TENANT_ID): Rp01cFixtureSnapshot {
  const scenario = { ...getScenario(scenarioId) };
  const novel = createNovel(scenarioId, tenantId);
  const task = createTask(scenario, novel);
  const versions = createVersions(scenario, novel);
  const snapshot: Rp01cFixtureSnapshot = {
    scenario,
    runId: `rp01c_run_${scenario.id}`,
    generatedAt: time(0),
    novels: [novel],
    tasks: [task],
    events: createEvents(task),
    versions,
    idempotencyClaims: [
      {
        tenantId,
        novelId: novel.id,
        taskId: task.id,
        taskType: task.taskType,
        idempotencyToken: `rp01c-idem-${scenario.id}`,
        requestHash: `rp01c-hash-${scenario.id}`
      },
      {
        tenantId: 'tenant_other',
        novelId: 'rp01c_other_novel',
        taskId: 'rp01c_other_task',
        taskType: task.taskType,
        idempotencyToken: `rp01c-idem-${scenario.id}`,
        requestHash: `rp01c-other-hash-${scenario.id}`
      }
    ],
    replayInput: {
      fixtureOnly: true,
      scenarioId: scenario.id,
      requestId: `rp01c-request-${scenario.id}`,
      idempotencyToken: `rp01c-idem-${scenario.id}`,
      sourceVersionRefs: createSourceRefs()
    },
    detectors: {
      duplicateCurrentVersionIds: detectDuplicateCurrent(versions),
      lateResultRisk: scenario.id === 'late_result_after_cancel'
    }
  };

  return deepFreeze(snapshot);
}

export function createRp01cRepository(snapshot: Rp01cFixtureSnapshot): NovelRepository {
  const data = deepClone(snapshot);
  const repository = {
    async findById(tenantId: string, novelId: string) {
      return cloneOrNull(data.novels.find((novel) => novel.tenantId === tenantId && novel.id === novelId));
    },
    async findTaskById(tenantId: string, taskId: string) {
      return cloneOrNull(data.tasks.find((task) => task.tenantId === tenantId && task.id === taskId));
    },
    async listTaskEvents(tenantId: string, taskId: string) {
      return deepClone(data.events.filter((event) => event.tenantId === tenantId && event.taskId === taskId));
    },
    async listRecentTasksForNovel(tenantId: string, novelId: string, limit: number) {
      return deepClone(data.tasks.filter((task) => task.tenantId === tenantId && task.novelId === novelId).slice(0, limit));
    },
    async findActiveTaskByConflict(tenantId: string, conflictScope: string, conflictKey: string) {
      return cloneOrNull(data.tasks.find((task) =>
        task.tenantId === tenantId &&
        task.conflictScope === conflictScope &&
        task.conflictKey === conflictKey &&
        [TaskStatus.Queued, TaskStatus.Processing, TaskStatus.WaitingConfirmation].includes(task.status)
      ));
    }
  };

  return repository as unknown as NovelRepository;
}

export function resolveRp01cIdempotency(
  snapshot: Rp01cFixtureSnapshot,
  input: { tenantId: string; taskType: string; idempotencyToken: string; requestHash: string }
) {
  const existing = snapshot.idempotencyClaims.find((claim) =>
    claim.tenantId === input.tenantId &&
    claim.taskType === input.taskType &&
    claim.idempotencyToken === input.idempotencyToken
  );
  if (!existing) return { decision: 'create_new' as const };
  if (existing.requestHash !== input.requestHash) return { decision: 'idempotency_conflict' as const, taskId: existing.taskId };
  return { decision: 'reuse_existing' as const, taskId: existing.taskId };
}

export function createRp01cInjectionPlan(scenarioId: Rp01cScenarioId): Rp01cInjectionPlan {
  const planByScenario: Partial<Record<Rp01cScenarioId, Rp01cInjectionPlan>> = {
    failed_timeout: {
      scenarioId,
      steps: [{ target: 'llm', callIndex: 1, outcome: 'timeout', providerCompleted: false, safeSummary: '第 1 次模型调用超时。' }]
    },
    failed_malformed_json: {
      scenarioId,
      steps: [{ target: 'llm', callIndex: 1, outcome: 'malformed_json', providerCompleted: false, safeSummary: '第 1 次模型调用返回 malformed JSON。' }]
    },
    chapter_plan_chunk_failure: {
      scenarioId,
      steps: [{ target: 'llm', callIndex: 2, outcome: 'malformed_json', providerCompleted: false, safeSummary: '第 2 个章节目录分块解析失败。' }]
    },
    save_failure_after_provider: {
      scenarioId,
      steps: [{ target: 'repository', callIndex: 1, outcome: 'save_failed', providerCompleted: true, safeSummary: 'provider 成功后第 1 次仓储保存失败。' }]
    },
    late_result_after_cancel: {
      scenarioId,
      steps: [{ target: 'late_result', callIndex: 1, outcome: 'released_after_cancel', providerCompleted: true, safeSummary: '取消后受控 release 迟到输入，仅作 counterexample 证据。' }]
    }
  };
  const plan = planByScenario[scenarioId];
  if (!plan) throw new Error(`RP-01C scenario has no injection plan: ${scenarioId}`);
  return deepFreeze(plan);
}

export function applyRp01cInjectionOverlay(snapshot: Rp01cFixtureSnapshot, plan: Rp01cInjectionPlan): Rp01cFixtureSnapshot {
  return deepFreeze({
    ...deepClone(snapshot),
    replayInput: {
      ...deepClone(snapshot.replayInput),
      injectionPlan: deepClone(plan)
    }
  });
}

export async function executeRp01cInjectionProbe(scenarioId: Rp01cScenarioId): Promise<Rp01cInjectionProbeResult> {
  const plan = createRp01cInjectionPlan(scenarioId);
  const records: string[] = [];
  let saveCalls = 0;
  let providerCompleted = false;
  let rejected = false;
  let parseFailed = false;
  let cancelledBeforeRelease = false;
  let lateResultReleased = false;
  let writesAttempted = false;

  if (scenarioId === 'failed_timeout') {
    const client = createScriptedLlmClient([new Error('rp01c timeout')]);
    try {
      await client.chat(createProbeRequest('failed_timeout'));
    } catch {
      rejected = true;
      records.push('chat_call_1_rejected_timeout');
    }
    return { scenarioId, chatCalls: client.callCount(), saveCalls, providerCompleted, rejected, parseFailed, cancelledBeforeRelease, lateResultReleased, writesAttempted, records };
  }

  if (scenarioId === 'failed_malformed_json') {
    const client = createScriptedLlmClient([{ content: '{malformed', model: 'rp01c-mock' }]);
    const response = await client.chat(createProbeRequest('failed_malformed_json'));
    try {
      JSON.parse(response.content);
    } catch {
      parseFailed = true;
      records.push('chat_call_1_returned_malformed_json');
    }
    return { scenarioId, chatCalls: client.callCount(), saveCalls, providerCompleted, rejected, parseFailed, cancelledBeforeRelease, lateResultReleased, writesAttempted, records };
  }

  if (scenarioId === 'chapter_plan_chunk_failure') {
    const client = createScriptedLlmClient([
      { content: '{"chunk":1}', model: 'rp01c-mock' },
      { content: '{chunk:2', model: 'rp01c-mock' }
    ]);
    JSON.parse((await client.chat(createProbeRequest('chapter_plan_chunk_1'))).content);
    try {
      JSON.parse((await client.chat(createProbeRequest('chapter_plan_chunk_2'))).content);
    } catch {
      parseFailed = true;
      records.push('chat_call_2_returned_malformed_json');
    }
    return { scenarioId, chatCalls: client.callCount(), saveCalls, providerCompleted, rejected, parseFailed, cancelledBeforeRelease, lateResultReleased, writesAttempted, records };
  }

  if (scenarioId === 'save_failure_after_provider') {
    const client = createScriptedLlmClient([{ content: '{"provider":"completed"}', model: 'rp01c-mock' }]);
    JSON.parse((await client.chat(createProbeRequest('save_failure_after_provider'))).content);
    providerCompleted = true;
    records.push('provider_completed_before_save');
    try {
      await saveProbe();
    } catch {
      rejected = true;
      records.push('save_call_1_rejected');
    }
    return { scenarioId, chatCalls: client.callCount(), saveCalls, providerCompleted, rejected, parseFailed, cancelledBeforeRelease, lateResultReleased, writesAttempted, records };
  }

  if (scenarioId === 'late_result_after_cancel') {
    const deferred = createDeferred<{ released: boolean }>();
    cancelledBeforeRelease = true;
    records.push('cancel_marked_before_release');
    const lateResult = deferred.promise.then((value) => {
      lateResultReleased = value.released;
      providerCompleted = value.released;
      records.push('late_input_released_after_cancel');
    });
    deferred.release({ released: true });
    await lateResult;
    return { scenarioId, chatCalls: 0, saveCalls, providerCompleted, rejected, parseFailed, cancelledBeforeRelease, lateResultReleased, writesAttempted, records };
  }

  throw new Error(`RP-01C scenario has no executable probe: ${scenarioId}`);

  async function saveProbe() {
    saveCalls += 1;
    writesAttempted = true;
    throw new Error('rp01c repository save failed');
  }
}

export function createDeferred<T>() {
  let release!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

function createProbeRequest(taskName: string): ChatCompletionRequest {
  return {
    taskName,
    model: 'rp01c-mock',
    messages: [{ role: 'user', content: 'RP-01C safe probe input' }]
  };
}

export function createScriptedLlmClient(responses: Array<ChatCompletionResult | Error | (() => Promise<ChatCompletionResult>)>): LlmClient & { callCount(): number } {
  let calls = 0;
  return {
    async chat(_request: ChatCompletionRequest) {
      const next = responses[calls++];
      if (next instanceof Error) throw next;
      if (typeof next === 'function') return next();
      if (!next) throw new Error('rp01c scripted llm exhausted');
      return next;
    },
    callCount() {
      return calls;
    }
  };
}

function getScenario(id: Rp01cScenarioId) {
  const scenario = RP01C_SCENARIOS.find((item) => item.id === id);
  if (!scenario) throw new Error(`Unknown RP-01C scenario: ${id}`);
  return scenario;
}

function createNovel(scenarioId: Rp01cScenarioId, tenantId: string): NovelRecord {
  const stale = scenarioId === 'stale_source' || scenarioId === 'late_result_after_cancel';
  return {
    id: `rp01c_novel_${scenarioId}`,
    tenantId,
    ownerId: DEFAULT_USER_ID,
    title: `RP01C ${scenarioId}`,
    channel: 'novel',
    genres: ['fixture'],
    lifecycleStatus: NovelLifecycleStatus.Active,
    creationStage: NovelCreationStage.Body,
    stageStatus: StageStatus.Processing,
    currentDirectionVersionId: stale ? 'rp01c_dir_v2' : 'rp01c_dir_v1',
    currentSettingVersionId: 'rp01c_setting_v1',
    currentOutlineVersionId: 'rp01c_outline_v1',
    currentStageOutlineVersionId: 'rp01c_stage_outline_v1',
    currentChapterPlanVersionId: 'rp01c_chapter_plan_v1',
    hotspotReportId: null,
    policyProfileVersionId: 'policy_default_v1',
    chapterLimit: 12,
    chapterWordMin: 1800,
    chapterWordMax: 2600,
    summary: 'RP-01C safe fixture summary',
    videoReferenceStatus: 'not_referenced',
    createdBy: DEFAULT_USER_ID,
    updatedBy: DEFAULT_USER_ID,
    createdAt: time(1),
    updatedAt: time(2),
    deletedAt: null
  };
}

function createTask(scenario: Rp01cScenarioDefinition, novel: NovelRecord): GenerationTaskRecord {
  const failed = scenario.id.startsWith('failed_') || scenario.id === 'chapter_plan_chunk_failure' || scenario.id === 'save_failure_after_provider' || scenario.id === 'stale_source';
  const cancelled = scenario.id === 'late_result_after_cancel';
  return {
    id: `rp01c_task_${scenario.id}`,
    tenantId: novel.tenantId,
    novelId: novel.id,
    taskType: scenario.id === 'chapter_plan_chunk_failure' ? 'novel_chapter_plan_generate' : 'body_batch_generate',
    objectType: scenario.id === 'chapter_plan_chunk_failure' ? 'chapter_plan' : 'body_batch',
    objectId: `${novel.id}_object`,
    status: cancelled ? TaskStatus.Cancelled : failed ? TaskStatus.Failed : TaskStatus.Processing,
    statusNote: getStatusNote(scenario.id),
    progress: failed || cancelled ? 60 : scenario.id === 'active_conflict' ? 25 : 40,
    currentStep: getCurrentStep(scenario.id),
    triggerSource: 'rp01c_fixture',
    sourceVersionRefs: createSourceRefs(),
    conflictScope: scenario.id === 'active_conflict' ? 'novel_body_batch' : null,
    conflictKey: scenario.id === 'active_conflict' ? novel.id : null,
    inputSummary: 'RP-01C deterministic fixture input summary.',
    outputSummary: null,
    resultVersionIds: [],
    retryOfTaskId: null,
    failureCategory: getFailureCategory(scenario.id),
    errorCode: getErrorCode(scenario.id),
    errorMessage: getErrorMessage(scenario.id),
    resultObjectType: null,
    resultObjectId: null,
    userAcceptedResult: false,
    cancelRequestedAt: cancelled ? time(8) : null,
    cancelReason: cancelled ? 'RP-01C cancelled before late result release' : null,
    startedAt: time(3),
    finishedAt: failed || cancelled ? time(9) : null,
    createdBy: DEFAULT_USER_ID,
    createdAt: time(2),
    updatedAt: time(9),
    metadata: {
      requestId: `rp01c-request-${scenario.id}`,
      idempotencyKey: `rp01c-idem-${scenario.id}`,
      requestHash: `rp01c-hash-${scenario.id}`,
      safeSummary: 'rp01c safe deterministic task metadata'
    }
  };
}

function createEvents(task: GenerationTaskRecord): GenerationTaskEventRecord[] {
  return ['task_created', 'preparing_context', 'calling_model'].map((eventType, index) => ({
    id: `rp01c_event_${task.id}_${index + 1}`,
    tenantId: task.tenantId,
    taskId: task.id,
    status: task.status,
    eventType,
    message: eventType === 'calling_model' ? '正在调用受控测试模型。' : 'RP-01C fixture event.',
    progress: index * 20,
    payload: { requestId: `rp01c-event-request-${index + 1}` },
    createdAt: time(10 + index)
  }));
}

function createVersions(scenario: Rp01cScenarioDefinition, novel: NovelRecord): CreativeVersionRecord[] {
  const base = createVersion(novel, 'rp01c_dir_v1', VersionStatus.Current, 1);
  if (scenario.id !== 'duplicate_current') return [base];
  return [base, createVersion(novel, 'rp01c_dir_v2', VersionStatus.Current, 2)];
}

function createVersion(novel: NovelRecord, id: string, status: VersionStatus, versionNo: number): CreativeVersionRecord {
  return {
    id,
    tenantId: novel.tenantId,
    novelId: novel.id,
    objectType: 'direction',
    objectId: novel.id,
    versionNo,
    status,
    staleLevel: StaleLevel.None,
    sourceType: 'rp01c_fixture',
    sourceTaskId: null,
    sourceVersionRefs: createSourceRefs(),
    changeReason: 'RP-01C deterministic fixture',
    content: { safeSummary: 'direction summary only' },
    summary: 'direction summary only',
    score: 80,
    riskLevel: RiskLevel.Low,
    decisionRecordId: null,
    createdBy: DEFAULT_USER_ID,
    createdAt: time(4 + versionNo),
    metadata: { fixtureOnly: true }
  };
}

function createSourceRefs() {
  return {
    currentDirectionVersionId: 'rp01c_dir_v1',
    currentSettingVersionId: 'rp01c_setting_v1',
    currentOutlineVersionId: 'rp01c_outline_v1',
    currentStageOutlineVersionId: 'rp01c_stage_outline_v1',
    currentChapterPlanVersionId: 'rp01c_chapter_plan_v1'
  };
}

function detectDuplicateCurrent(versions: CreativeVersionRecord[]) {
  const currentByKey = new Map<string, string[]>();
  for (const version of versions) {
    if (version.status !== VersionStatus.Current) continue;
    const key = `${version.novelId}:${version.objectType}`;
    currentByKey.set(key, [...(currentByKey.get(key) ?? []), version.id]);
  }
  return [...currentByKey.values()].filter((ids) => ids.length > 1).flat();
}

function getStatusNote(id: Rp01cScenarioId) {
  if (id === 'failed_timeout') return '模型调用超时，请稍后重试。';
  if (id === 'failed_malformed_json') return '模型输出结构异常，未写入正式资产。';
  if (id === 'save_failure_after_provider') return '正文保存失败，请查看原因后重试。';
  if (id === 'stale_source') return '上游内容已经变化，旧任务不能直接重试。';
  return '任务处于 RP-01C 可重放状态。';
}

function getCurrentStep(id: Rp01cScenarioId) {
  if (id === 'chapter_plan_chunk_failure') return '第 2 个章节目录分块解析失败';
  if (id === 'save_failure_after_provider') return '模型完成后保存失败';
  if (id === 'restart_boundary') return '可序列化快照重建中';
  return 'RP-01C fixture step';
}

function getFailureCategory(id: Rp01cScenarioId) {
  if (id === 'failed_timeout') return 'timeout';
  if (id === 'failed_malformed_json' || id === 'chapter_plan_chunk_failure') return 'output_parse_failed';
  if (id === 'save_failure_after_provider') return 'save_failed';
  if (id === 'stale_source') return 'source_stale';
  return null;
}

function getErrorCode(id: Rp01cScenarioId) {
  if (id === 'failed_timeout') return 'TIMEOUT';
  if (id === 'failed_malformed_json' || id === 'chapter_plan_chunk_failure') return 'OUTPUT_PARSE_FAILED';
  if (id === 'save_failure_after_provider') return 'SAVE_FAILED';
  return null;
}

function getErrorMessage(id: Rp01cScenarioId) {
  if (id === 'failed_timeout') return '模型调用超时。';
  if (id === 'failed_malformed_json') return '模型输出不是可用 JSON。';
  if (id === 'chapter_plan_chunk_failure') return '章节目录分块输出解析失败。';
  if (id === 'save_failure_after_provider') return '仓储保存阶段失败。';
  return null;
}

function time(offsetMs: number) {
  return new Date(Date.parse(RP01C_BASE_TIME_ISO) + offsetMs);
}

function cloneOrNull<T>(value: T | undefined | null): T | null {
  return value == null ? null : deepClone(value);
}

function deepClone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((item) => deepClone(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepClone(item)])) as T;
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}
