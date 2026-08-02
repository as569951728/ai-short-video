import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  NovelCreationStage,
  NovelLifecycleStatus,
  StageStatus,
  StaleLevel,
  VersionStatus,
  type FullReviewIssueDTO
} from '@ai-shortvideo/shared';
import {
  createDeepSeekLlmClient,
  resolveDeepSeekConfig,
  type AiProviderEnv
} from '../ai/modelRouting.js';
import { isLlmProviderError, type ChatCompletionUsage, type LlmClient } from '../ai/llmClient.js';
import type {
  ChapterContentVersionRecord,
  ChapterFeatureCardRecord,
  FullReviewDraft,
  LongTermMemoryRecord,
  NovelChapterRecord,
  NovelRecord,
  ReviewReportRecord
} from './domain/novelDomain.js';
import { DeepSeekNovelProvider } from './providers/deepseekNovelProvider.js';
import {
  buildFullReviewEvidenceProviderInput,
  type FullReviewAuthorityFactsV1,
  type FullReviewEvidenceProviderInputV1
} from './services/actionExecutionPlan.js';

export const FULL_REVIEW_CONFLICT_FIXTURE_VERSION = 'rp-04c-e5-conflicts-v1';
export const FULL_REVIEW_PROMPT_VERSION = 'deepseek-full-review-evidence-v3';
export const FULL_REVIEW_EVIDENCE_PRIVACY_CANARY = 'PRIVATE_FULL_REVIEW_BODY_CANARY_RP04C_E5';

export const FULL_REVIEW_CONFLICT_SCOPES = {
  characterDeathResurrection: ['rp04c-chapter-03', 'rp04c-chapter-07'],
  timeline: ['rp04c-chapter-04', 'rp04c-chapter-08'],
  contractAmount: ['rp04c-chapter-05', 'rp04c-chapter-09'],
  similarControl: ['rp04c-chapter-10', 'rp04c-chapter-11']
} as const;

const FULL_REVIEW_CONFLICT_DIMENSIONS = {
  characterDeathResurrection: 'character_continuity',
  timeline: 'timeline_continuity',
  contractAmount: 'fact_consistency',
  similarControl: 'fact_consistency'
} as const;

interface SmokeHit {
  hit: boolean;
  scopeRefs: string[];
}

export interface FullReviewEvidenceSmokeSummary {
  success: boolean;
  gitSha: string;
  fixtureVersion: string;
  manifestHash: string;
  model: string;
  promptVersion: string;
  coverage: {
    chapterCount: number;
    coveredChapterNos: number[];
    complete: boolean;
  };
  usage: ChatCompletionUsage;
  elapsedMs: number;
  callCount: number;
  hits: {
    characterDeathResurrection: SmokeHit;
    timeline: SmokeHit;
    contractAmount: SmokeHit;
  };
  controlFalsePositive: boolean;
  gateResult: FullReviewDraft['gateResult'];
}

export interface FullReviewEvidenceSmokeOptions {
  client?: LlmClient;
  env?: AiProviderEnv;
  gitSha?: string;
  model?: string;
  now?: () => number;
  writeSummary?: (line: string) => void;
}

export class FullReviewEvidenceSmokeFailure extends Error {
  constructor(
    readonly code: string,
    readonly failureCodes: string[] = []
  ) {
    super(code);
    this.name = 'FullReviewEvidenceSmokeFailure';
  }
}

export function createFullReviewConflictFixture(): FullReviewEvidenceProviderInputV1 {
  return buildFullReviewEvidenceProviderInput(createFullReviewConflictAuthorityFacts());
}

export async function executeFullReviewEvidenceSmoke(
  options: FullReviewEvidenceSmokeOptions = {}
): Promise<FullReviewEvidenceSmokeSummary> {
  const forcedEnv: AiProviderEnv = {
    ...(options.env ?? process.env),
    AI_PROVIDER_MODE: 'deepseek',
    DEEPSEEK_MAX_RETRIES: '0'
  };
  const config = resolveDeepSeekConfig(forcedEnv);
  const baseClient = options.client ?? createDeepSeekLlmClient(config);
  if (!baseClient) {
    throw new FullReviewEvidenceSmokeFailure('deepseek_api_key_missing');
  }

  const input = createFullReviewConflictFixture();
  const now = options.now ?? Date.now;
  const model = options.model ?? config.reasonerModel;
  let callCount = 0;
  let usage: ChatCompletionUsage = {};
  let responseModel = model;
  const observingClient: LlmClient = {
    async chat(request) {
      callCount += 1;
      const result = await baseClient.chat(request);
      usage = { ...(result.usage ?? {}) };
      responseModel = result.model || request.model;
      return result;
    }
  };
  const provider = new DeepSeekNovelProvider({
    client: observingClient,
    reasonerModel: model
  });

  const startedAt = now();
  const draft = await provider.generateFullReview(input);
  const elapsedMs = Math.max(0, now() - startedAt);
  const summary = createSafeSmokeSummary({
    input,
    draft,
    gitSha: options.gitSha ?? readGitSha(),
    model: responseModel,
    usage,
    elapsedMs,
    callCount
  });

  options.writeSummary?.(JSON.stringify(summary));
  const failureCodes = evaluateSmokeGate(summary);
  if (failureCodes.length > 0) {
    throw new FullReviewEvidenceSmokeFailure('full_review_evidence_gate_failed', failureCodes);
  }
  return summary;
}

function createSafeSmokeSummary(input: {
  input: FullReviewEvidenceProviderInputV1;
  draft: FullReviewDraft;
  gitSha: string;
  model: string;
  usage: ChatCompletionUsage;
  elapsedMs: number;
  callCount: number;
}): FullReviewEvidenceSmokeSummary {
  const characterIssue = findBlockingIssue(input.draft.issues, FULL_REVIEW_CONFLICT_SCOPES.characterDeathResurrection, FULL_REVIEW_CONFLICT_DIMENSIONS.characterDeathResurrection);
  const timelineIssue = findBlockingIssue(input.draft.issues, FULL_REVIEW_CONFLICT_SCOPES.timeline, FULL_REVIEW_CONFLICT_DIMENSIONS.timeline);
  const amountIssue = findBlockingIssue(input.draft.issues, FULL_REVIEW_CONFLICT_SCOPES.contractAmount, FULL_REVIEW_CONFLICT_DIMENSIONS.contractAmount);
  const controlIssue = findBlockingIssue(input.draft.issues, FULL_REVIEW_CONFLICT_SCOPES.similarControl, FULL_REVIEW_CONFLICT_DIMENSIONS.similarControl);
  const coveredChapterNos = [...input.input.coverageManifest.coveredChapterNos];

  return {
    success: coveredChapterNos.length === 12
      && coveredChapterNos.every((chapterNo, index) => chapterNo === index + 1)
      && Boolean(characterIssue && timelineIssue && amountIssue)
      && !controlIssue
      && input.draft.gateResult === 'blocked'
      && input.callCount === 1,
    gitSha: input.gitSha,
    fixtureVersion: FULL_REVIEW_CONFLICT_FIXTURE_VERSION,
    manifestHash: input.input.coverageManifest.manifestHash,
    model: input.model,
    promptVersion: FULL_REVIEW_PROMPT_VERSION,
    coverage: {
      chapterCount: input.input.coverageManifest.chapterCount,
      coveredChapterNos,
      complete: coveredChapterNos.length === 12
        && coveredChapterNos.every((chapterNo, index) => chapterNo === index + 1)
    },
    usage: { ...input.usage },
    elapsedMs: input.elapsedMs,
    callCount: input.callCount,
    hits: {
      characterDeathResurrection: toSmokeHit(characterIssue),
      timeline: toSmokeHit(timelineIssue),
      contractAmount: toSmokeHit(amountIssue)
    },
    controlFalsePositive: Boolean(controlIssue),
    gateResult: input.draft.gateResult
  };
}

function evaluateSmokeGate(summary: FullReviewEvidenceSmokeSummary): string[] {
  const failures: string[] = [];
  if (!summary.coverage.complete || summary.coverage.chapterCount !== 12) failures.push('coverage_incomplete');
  if (!summary.hits.characterDeathResurrection.hit) failures.push('character_conflict_missing');
  if (!summary.hits.timeline.hit) failures.push('timeline_conflict_missing');
  if (!summary.hits.contractAmount.hit) failures.push('contract_amount_conflict_missing');
  if (summary.controlFalsePositive) failures.push('control_false_positive');
  if (summary.gateResult !== 'blocked') failures.push('gate_not_blocked');
  if (summary.callCount !== 1) failures.push('call_count_not_one');
  return failures;
}

function findBlockingIssue(
  issues: FullReviewIssueDTO[],
  expectedScopeRefs: readonly string[],
  expectedDimension: string
): FullReviewIssueDTO | undefined {
  return issues.find((issue) => issue.blocking
    && issue.severity === 'blocking'
    && issue.status === 'open'
    && issue.dimension === expectedDimension
    && sameStringSet(issue.scopeRefs, expectedScopeRefs));
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && new Set(left).size === left.length
    && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function toSmokeHit(issue: FullReviewIssueDTO | undefined): SmokeHit {
  return {
    hit: Boolean(issue),
    scopeRefs: issue ? [...issue.scopeRefs] : []
  };
}

function createFullReviewConflictAuthorityFacts(): FullReviewAuthorityFactsV1 {
  const now = new Date('2026-08-03T00:00:00.000Z');
  const tenantId = 'tenant-rp04c-e5';
  const novelId = 'novel-rp04c-e5';
  const chapterCount = 12;
  const novel: NovelRecord = {
    id: novelId,
    tenantId,
    ownerId: 'user-rp04c-e5',
    title: '证据冲突金丝雀',
    channel: 'web',
    genres: ['都市商战'],
    lifecycleStatus: NovelLifecycleStatus.Active,
    creationStage: NovelCreationStage.FullReview,
    stageStatus: StageStatus.Processing,
    currentDirectionVersionId: 'direction-rp04c-e5-v1',
    currentSettingVersionId: 'setting-rp04c-e5-v1',
    currentOutlineVersionId: 'outline-rp04c-e5-v1',
    currentStageOutlineVersionId: 'stage-outline-rp04c-e5-v1',
    currentChapterPlanVersionId: 'chapter-plan-rp04c-e5-v1',
    hotspotReportId: null,
    policyProfileVersionId: 'policy-full-review-v1',
    chapterLimit: chapterCount,
    chapterWordMin: 1_800,
    chapterWordMax: 2_200,
    summary: '用于验证全书审稿覆盖与跨章冲突识别。',
    videoReferenceStatus: null,
    createdBy: 'user-rp04c-e5',
    updatedBy: 'user-rp04c-e5',
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  };
  const chapters = Array.from({ length: chapterCount }, (_, index) => createChapter(index + 1, tenantId, novelId, now));
  const contents = chapters.map((chapter) => createContent(chapter, tenantId, novelId, now));
  const featureCards = chapters.map((chapter) => createFeatureCard(chapter, tenantId, novelId, now));
  const reviews = chapters.map((chapter) => createReview(chapter, tenantId, novelId, now));
  const finalChapter = chapters.at(-1)!;
  const finalContent = contents.at(-1)!;
  const memory: LongTermMemoryRecord = {
    id: 'memory-rp04c-e5-v1',
    tenantId,
    novelId,
    chapterId: finalChapter.id,
    sourceContentVersionId: finalContent.id,
    previousSummary: '十二章已完成，沈岚状态、董事会日期与星海主合同金额仍需跨章核验。',
    characterStates: ['林川进入董事会', '沈岚状态存在跨章记录'],
    relationshipStates: ['林川与许青维持合作'],
    locations: ['海城总部'],
    organizations: ['星海集团'],
    items: ['星海主合同', '晨光采购合同', '远山授权合同'],
    plantedForeshadowing: ['旧案证据将在终局公开'],
    resolvedForeshadowing: [],
    unresolvedConflicts: ['董事会日期待统一', '星海主合同金额待统一'],
    newSettings: ['本故事没有时间回溯、梦境或替身机制'],
    factsCannotContradict: ['同一人物死亡后复活必须解释', '同一事件日期必须唯一', '同一合同金额必须唯一'],
    status: VersionStatus.Current,
    staleLevel: StaleLevel.None,
    sourceTaskId: 'task-rp04c-e5-memory',
    createdAt: now,
    metadata: {}
  };

  return {
    tenantId,
    novel,
    chapters,
    contents,
    featureCards,
    reviews,
    memory,
    sourceVersionRefs: {
      directionVersionId: novel.currentDirectionVersionId,
      settingVersionId: novel.currentSettingVersionId,
      outlineVersionId: novel.currentOutlineVersionId,
      stageOutlineVersionId: novel.currentStageOutlineVersionId,
      chapterPlanVersionId: novel.currentChapterPlanVersionId,
      bodyStrategySnapshotId: 'body-strategy-rp04c-e5-v1',
      chapterContentVersionIds: contents.map((content) => content.id)
    }
  };
}

function createChapter(chapterNo: number, tenantId: string, novelId: string, now: Date): NovelChapterRecord {
  return {
    id: chapterId(chapterNo),
    tenantId,
    novelId,
    chapterNo,
    stageIndex: chapterNo <= 4 ? 1 : chapterNo <= 8 ? 2 : 3,
    title: `第 ${chapterNo} 章`,
    wordTarget: 2_000,
    wordCount: 2_000,
    mainStatus: 'completed',
    statusNote: null,
    impactLevel: 'none',
    currentFeatureCardVersionId: featureId(chapterNo),
    currentContentVersionId: contentId(chapterNo),
    currentReviewReportId: reviewId(chapterNo),
    lastGenerationTaskId: `task-rp04c-e5-${pad(chapterNo)}`,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  };
}

function createContent(
  chapter: NovelChapterRecord,
  tenantId: string,
  novelId: string,
  now: Date
): ChapterContentVersionRecord {
  const scenario = CHAPTER_SCENARIOS[chapter.chapterNo - 1]!;
  const bridge = `第${chapter.chapterNo}章的行动按既定计划推进，现场记录、人物对话和后续决策均围绕本章事实展开。`;
  const content = `${scenario.summary}。${bridge.repeat(5)}${scenario.detail}。${bridge.repeat(5)}${scenario.ending}。`;
  return {
    id: contentId(chapter.chapterNo),
    tenantId,
    novelId,
    chapterId: chapter.id,
    versionNo: 1,
    status: VersionStatus.Current,
    staleLevel: StaleLevel.None,
    sourceType: 'deepseek',
    sourceTaskId: `task-rp04c-e5-${pad(chapter.chapterNo)}`,
    sourceVersionRefs: {},
    rewriteReason: null,
    content,
    wordCount: 2_000,
    summary: scenario.summary,
    reviewScore: 86,
    decisionRecordId: null,
    createdBy: 'user-rp04c-e5',
    createdAt: now,
    metadata: {}
  };
}

function createFeatureCard(
  chapter: NovelChapterRecord,
  tenantId: string,
  novelId: string,
  now: Date
): ChapterFeatureCardRecord {
  const scenario = CHAPTER_SCENARIOS[chapter.chapterNo - 1]!;
  return {
    id: featureId(chapter.chapterNo),
    tenantId,
    novelId,
    chapterId: chapter.id,
    versionNo: 1,
    status: VersionStatus.Current,
    staleLevel: StaleLevel.None,
    oneLineSummary: scenario.summary,
    coreTask: '推进商战主线并固化本章事实',
    mainConflict: scenario.detail,
    appealPoint: '证据反转',
    emotionKeywords: ['紧张', '克制'],
    characterChanges: [scenario.characterState],
    relationshipChanges: ['林川与许青继续合作'],
    keyInformation: [scenario.keyInformation],
    foreshadowingOperation: '保留终局证据线索',
    endingHook: scenario.ending,
    factsCannotChange: [scenario.factCannotChange],
    featuresToStrengthen: [],
    sourceTaskId: `task-rp04c-e5-${pad(chapter.chapterNo)}`,
    decisionRecordId: null,
    createdAt: now,
    metadata: {}
  };
}

function createReview(
  chapter: NovelChapterRecord,
  tenantId: string,
  novelId: string,
  now: Date
): ReviewReportRecord {
  return {
    id: reviewId(chapter.chapterNo),
    tenantId,
    novelId,
    objectType: 'chapter',
    objectId: chapter.id,
    objectVersionId: contentId(chapter.chapterNo),
    reviewLevel: 'chapter',
    totalScore: 86,
    subScores: {},
    rating: 'A',
    summary: '单章内部逻辑成立，跨章一致性留待全书审稿。',
    strengths: ['本章事件清楚'],
    problems: [],
    suggestions: ['在全书审稿核验跨章事实'],
    issueCards: [],
    actionOptions: ['continue'],
    recommendedAction: 'continue',
    allowNextStep: true,
    blockingIssueCount: 0,
    resolvedStatus: 'resolved',
    promptTemplateVersionId: 'chapter-review-rp04c-e5-v1',
    policyProfileVersionId: 'policy-full-review-v1',
    sourceTaskId: `task-rp04c-e5-${pad(chapter.chapterNo)}`,
    createdAt: now,
    metadata: {}
  };
}

const CHAPTER_SCENARIOS = [
  scenario('林川取得旧案线索', '林川确认旧案证据仍在海城总部', '旧案证据链开始形成', '证据来源保持唯一', '林川继续追查'),
  scenario('沈岚协助核验旧案', '沈岚本人到场并签署核验记录', '沈岚此时明确存活', '沈岚以本人身份参与核验', '沈岚独自前往仓库'),
  scenario('沈岚在仓库爆炸中确认死亡', '警方和林川共同确认沈岚遗体，故事不存在替身、梦境或时间回溯', '沈岚已经确认死亡', '沈岚于仓库爆炸中确认死亡', '林川领取死亡证明'),
  scenario('星海董事会表决日期被锁定为 2026-03-18', '会议纪要、门禁与直播记录一致证明同一场董事会表决发生在 2026-03-18', '董事会表决唯一日期是 2026-03-18', '同一场董事会表决日期固定为 2026-03-18', '表决结果等待公布'),
  scenario('星海主合同正式金额为 800 万元', '双方签署编号 XH-MAIN-001 的星海主合同，正式总金额明确为 800 万元', 'XH-MAIN-001 金额为 800 万元', '同一份星海主合同金额固定为 800 万元', '合同进入履约'),
  scenario('林川取得表决证据', '林川保存董事会原始录像并交由律师封存', '原始录像未被修改', '表决证据来源保持完整', '对手准备反击'),
  scenario('已经死亡的沈岚无解释地亲自出席签约', '沈岚以本人身份现场签字，正文没有复活、替身、梦境、伪造死亡或时间回溯解释', '沈岚死亡后无解释复活', '沈岚此前确认死亡且没有复活机制', '众人对沈岚出现毫不惊讶'),
  scenario('同一场星海董事会表决改写为 2026-03-12', '正文明确这不是补会、回放或另一场会议，而是同一场董事会表决发生在 2026-03-12', '同一表决日期被写成 2026-03-12', '同一场董事会表决只能有一个日期', '会议纪要出现互斥日期'),
  scenario('同一份星海主合同金额变为 1200 万元', '编号仍为 XH-MAIN-001，正文明确没有补充协议、变更或分期，正式总金额却写为 1200 万元', 'XH-MAIN-001 金额被写成 1200 万元', '同一份合同没有变更时金额必须一致', '财务要求核对合同'),
  scenario('晨光采购合同金额为 800 万元', '合同编号 CG-PURCHASE-010，采购设备总金额 800 万元，与星海主合同不是同一合同', 'CG-PURCHASE-010 金额为 800 万元', '不同合同允许金额相同', '晨光采购合同正常履约'),
  scenario('远山授权合同金额为 1200 万元', '合同编号 YS-LICENSE-011，版权授权总金额 1200 万元，与星海主合同及晨光采购合同均不同', 'YS-LICENSE-011 金额为 1200 万元', '不同合同允许出现不同金额', '远山授权合同正常履约'),
  scenario(`林川公开终局证据 ${FULL_REVIEW_EVIDENCE_PRIVACY_CANARY}`, '林川只公开经过核验的证据摘要，没有新增跨章事实', '旧案证据完成公开', '终局不改变既有事实', '全书等待一致性审稿')
] as const;

function scenario(
  summary: string,
  detail: string,
  keyInformation: string,
  factCannotChange: string,
  ending: string
) {
  return {
    summary,
    detail,
    keyInformation,
    factCannotChange,
    ending,
    characterState: summary
  };
}

function chapterId(chapterNo: number): string {
  return `rp04c-chapter-${pad(chapterNo)}`;
}

function contentId(chapterNo: number): string {
  return `rp04c-content-${pad(chapterNo)}-v1`;
}

function featureId(chapterNo: number): string {
  return `rp04c-feature-${pad(chapterNo)}-v1`;
}

function reviewId(chapterNo: number): string {
  return `rp04c-review-${pad(chapterNo)}-v1`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function readGitSha(): string {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
}

function isDirectExecution(): boolean {
  return Boolean(process.argv[1]) && resolve(process.argv[1]!) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  executeFullReviewEvidenceSmoke({ writeSummary: (line) => console.log(line) }).catch((error: unknown) => {
    const payload = createSafeSmokeErrorSummary(error);
    console.error(JSON.stringify(payload));
    process.exitCode = 1;
  });
}

export function createSafeSmokeErrorSummary(error: unknown): Record<string, unknown> {
  if (error instanceof FullReviewEvidenceSmokeFailure) {
    return { success: false, errorCode: error.code, failureCodes: error.failureCodes };
  }
  if (isLlmProviderError(error)) {
    return {
      success: false,
      errorCode: `llm_${error.category}`,
      outputKind: typeof error.details?.outputKind === 'string' ? error.details.outputKind : null,
      validationCode: classifyValidationFailure(error.details?.reason)
    };
  }
  return { success: false, errorCode: 'unexpected_smoke_failure' };
}

function classifyValidationFailure(reason: unknown): string | null {
  if (typeof reason !== 'string') return null;
  if (reason.includes('invalid keys')) return 'issue_keys_invalid';
  if (reason.includes('scopeChapterNos')) return 'scope_chapter_numbers_invalid';
  if (reason.includes('scopeRefs')) return 'scope_refs_invalid';
  if (reason.includes('blocking')) return 'blocking_gate_invalid';
  if (reason.includes('issueId')) return 'issue_identity_invalid';
  return 'schema_invalid';
}
