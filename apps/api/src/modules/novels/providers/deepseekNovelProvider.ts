import {
  RiskLevel,
  type ChapterSummaryCompareDTO,
  type FirstVideoSuggestionDTO,
  type FullReviewGateResult,
  type QualityScoringDTO,
  type ScoringDimensionDTO,
  type StructureAssetContentDTO,
  type StructureAssetType
} from '@ai-shortvideo/shared';
import { LlmProviderError, type LlmClient } from '../../ai/llmClient.js';
import { requestJsonOutput } from '../../ai/jsonOutput.js';
import type {
  BodyChapterDraft,
  ChapterContentVersionRecord,
  DirectionCandidateDraft,
  FullReviewDraft,
  ImpactAssessmentDraft,
  NovelChapterRecord,
  NovelPreferencesRecord,
  NovelRecord,
  StructureAssetDraft,
  TrialChapterCandidateDraft,
  TrialFollowupChapterDraft,
  TrialReviewDraft
} from '../domain/novelDomain.js';
import type { BodyProvider } from './mockBodyProvider.js';
import type { DirectionProvider } from './mockDirectionProvider.js';
import type { FullReviewProvider } from './mockFullReviewProvider.js';
import type { StructureProvider } from './mockStructureProvider.js';
import type { TrialChapterCandidateDraftLike, TrialProvider } from './mockTrialProvider.js';

interface DeepSeekNovelProviderOptions {
  client: LlmClient;
  model?: string;
  structureModel?: string;
  reasonerModel?: string;
}

export class DeepSeekNovelProvider implements DirectionProvider, StructureProvider, TrialProvider, BodyProvider, FullReviewProvider {
  private readonly model: string;
  private readonly structureModel: string;
  private readonly reasonerModel: string;

  constructor(private readonly options: DeepSeekNovelProviderOptions) {
    this.model = options.model ?? 'deepseek-v4-pro';
    this.structureModel = options.structureModel ?? this.model;
    this.reasonerModel = options.reasonerModel ?? this.model;
  }

  async generateCandidates(input: { novel: NovelRecord; preferences: NovelPreferencesRecord }): Promise<DirectionCandidateDraft[]> {
    return requestJsonOutput(this.options.client, {
      taskName: 'novel_direction_generate',
      model: this.model,
      messages: createMessages('生成 3-4 个小说方向候选，只返回 JSON。', input.novel, input.preferences, M1_OUTPUT_SCHEMA_HINT.direction),
      validate: (value) => readArray(value, 'candidates').map(toDirectionDraft)
    });
  }

  async fuseCandidates(input: { sources: DirectionCandidateDraft[]; reason?: string | null }): Promise<DirectionCandidateDraft> {
    return requestJsonOutput(this.options.client, {
      taskName: 'novel_direction_fuse',
      model: this.model,
      messages: createMessages('融合多个方向候选，只返回 JSON。', null, {
        sources: input.sources,
        reason: input.reason
      }, M1_OUTPUT_SCHEMA_HINT.direction),
      validate: (value) => toDirectionDraft(readObject(value, 'candidate') ?? value)
    });
  }

  async optimizeCandidate(input: { source: DirectionCandidateDraft; instruction?: string | null }): Promise<DirectionCandidateDraft> {
    return requestJsonOutput(this.options.client, {
      taskName: 'novel_direction_optimize',
      model: this.model,
      messages: createMessages('优化一个方向候选，只返回 JSON。', null, {
        source: input.source,
        instruction: input.instruction
      }, M1_OUTPUT_SCHEMA_HINT.direction),
      validate: (value) => toDirectionDraft(readObject(value, 'candidate') ?? value)
    });
  }

  async generateAsset(input: {
    objectType: StructureAssetType;
    novel: NovelRecord;
    preferences: NovelPreferencesRecord;
    currentAssets: Record<string, unknown>;
  }): Promise<StructureAssetDraft> {
    if (input.objectType === 'chapter_plan') {
      return this.generateChapterPlanAsset(input);
    }

    return requestJsonOutput(this.options.client, {
      taskName: `novel_structure_${input.objectType}`,
      model: this.getStructureTaskModel(input.objectType),
      messages: createMessages(getStructureInstruction(input.objectType), input.novel, {
        preferences: input.preferences,
        currentAssets: summarizeCurrentAssets(input.currentAssets)
      }, getStructureSchemaHint(input.objectType)),
      maxTokens: getStructureMaxTokens(input.objectType),
      validate: (value) => toStructureDraft(input.objectType, unwrapPayload(value, ['candidate', 'asset', input.objectType, 'result']))
    });
  }

  private async generateChapterPlanAsset(input: {
    objectType: StructureAssetType;
    novel: NovelRecord;
    preferences: NovelPreferencesRecord;
    currentAssets: Record<string, unknown>;
  }): Promise<StructureAssetDraft> {
    const currentAssets = summarizeCurrentAssets(input.currentAssets);
    const chapterCount = Math.max(1, Math.min(input.novel.chapterLimit, 1000));
    const batchSize = 10;
    const chapters: StructureAssetContentDTO['chapters'] = [];

    for (let start = 1; start <= chapterCount; start += batchSize) {
      const end = Math.min(chapterCount, start + batchSize - 1);
      const wordTargetPolicy = createWordTargetPolicy(input.novel);
      const chunk = await requestJsonOutput(this.options.client, {
        taskName: `novel_structure_chapter_plan_${start}_${end}`,
        model: this.structureModel,
        messages: createMessages(getChapterPlanChunkInstruction(start, end, chapterCount, wordTargetPolicy), input.novel, {
          preferences: input.preferences,
          currentAssets,
          chapterRange: { start, end },
          requiredChapterNumbers: Array.from({ length: end - start + 1 }, (_, index) => start + index),
          wordTargetPolicy
        }, M1_OUTPUT_SCHEMA_HINT.chapterPlanChunk),
        maxTokens: 2200,
        validate: (value) => readArray(value, 'chapters').map((chapter, index) => toStructureChapterDraft(chapter, start + index, '章节推进主线。', wordTargetPolicy.defaultTarget))
      });
      chapters.push(...chunk);
    }

    return createChapterPlanStructureDraft(input.novel, currentAssets, chapters.slice(0, chapterCount));
  }

  private getStructureTaskModel(objectType: StructureAssetType): string {
    return this.structureModel;
  }

  async generateChapterOneCandidates(input: {
    novel: NovelRecord;
    preferences: NovelPreferencesRecord;
    chapters: NovelChapterRecord[];
    chapterCount: number;
  }): Promise<TrialChapterCandidateDraft[]> {
    const firstChapter = input.chapters[0];
    if (!firstChapter) {
      throw new Error('chapter one is required');
    }

    const expectedCount = Math.max(2, Math.min(5, input.chapterCount || 3));
    let actualCount = 0;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const candidates = await requestJsonOutput(this.options.client, {
        taskName: 'novel_trial_chapter_one',
        model: this.structureModel,
        messages: createMessages('生成第1章试写候选，只返回 JSON。每个候选的 content 控制在 900-1200 个中文字符，用于开篇方向比较；不要扩写成完整长章。', input.novel, {
          preferences: input.preferences,
          chapterCount: expectedCount,
          requiredCandidateCount: expectedCount,
          retryReason: attempt > 0 ? '上一轮返回候选数量不足，请补齐到要求数量。' : undefined,
          chapter: pickChapter(firstChapter)
        }, M1_OUTPUT_SCHEMA_HINT.trialChapterOne),
        maxTokens: 4200,
        validate: (value) => readArray(value, 'candidates').map((item, index) => toTrialCandidateDraft(item, firstChapter, index === 0))
      });

      actualCount = candidates.length;
      if (actualCount >= expectedCount) {
        return candidates.slice(0, expectedCount);
      }
    }

    throw new LlmProviderError('output_parse_failed', '模型返回的第1章候选数量不足，请重试。', {
      taskName: 'novel_trial_chapter_one',
      expectedCount,
      actualCount
    });
  }

  async generateFollowup(input: {
    novel: NovelRecord;
    selectedCandidate: TrialChapterCandidateDraftLike;
    chapters: NovelChapterRecord[];
  }): Promise<{ chapters: TrialFollowupChapterDraft[]; review: TrialReviewDraft }> {
    return requestJsonOutput(this.options.client, {
      taskName: 'novel_trial_followup',
      model: this.model,
      messages: createMessages('基于已选第1章生成第2-3章试写和试写总评，只返回 JSON。', input.novel, {
        selectedCandidate: summarizeSelectedCandidate(input.selectedCandidate),
        chapters: input.chapters.map(pickChapter)
      }, M1_OUTPUT_SCHEMA_HINT.trialFollowup),
      validate: (value) => {
        const payload = asRecord(value);
        const generatedChapters = readArray(payload, 'chapters').map((item) => {
          const chapterNo = readNumber(item, 'chapterNo');
          const chapter = input.chapters.find((candidate) => candidate.chapterNo === chapterNo) ?? input.chapters[chapterNo - 1];
          return toFollowupDraft(item, chapter);
        });
        const chapterOne = input.chapters[0];
        const chapters = chapterOne
          ? [toSelectedChapterOneFollowup(input.selectedCandidate, chapterOne), ...generatedChapters.filter((item) => item.chapter.chapterNo !== 1)]
          : generatedChapters;
        return {
          chapters,
          review: toTrialReviewDraft(readObject(payload, 'review'))
        };
      }
    });
  }

  async generateBodyChapter(input: {
    novel: NovelRecord;
    chapter: NovelChapterRecord;
    strategySnapshot: unknown;
    previousContent: ChapterContentVersionRecord | null;
    previousMemory: unknown;
    previousBatchNotes: string[];
    enhancedReview: boolean;
  }): Promise<BodyChapterDraft> {
    const wordTargetPolicy = createWordTargetPolicy(input.novel, input.chapter.wordTarget ?? undefined);
    return requestJsonOutput(this.options.client, {
      taskName: 'novel_body_chapter_generate',
      model: this.model,
      messages: createMessages('生成单章正文、特性卡、单章审稿和长篇记忆摘要，只返回 JSON。', input.novel, {
        chapter: pickChapter(input.chapter),
        wordTargetPolicy,
        strategySnapshotId: (input.strategySnapshot as { id?: string })?.id,
        previousContentSummary: input.previousContent?.summary,
        previousBatchNotes: input.previousBatchNotes,
        enhancedReview: input.enhancedReview
      }, M1_OUTPUT_SCHEMA_HINT.body),
      maxTokens: getBodyChapterMaxTokens(wordTargetPolicy.target),
      validate: (value) => toBodyDraft(value, input.novel, input.chapter)
    });
  }

  async rewriteChapter(input: {
    novel: NovelRecord;
    chapter: NovelChapterRecord;
    currentContent: ChapterContentVersionRecord;
    instruction: string;
  }): Promise<{ candidate: BodyChapterDraft; summaryCompare: ChapterSummaryCompareDTO }> {
    return requestJsonOutput(this.options.client, {
      taskName: 'novel_chapter_rewrite',
      model: this.model,
      messages: createMessages('生成章节重写候选和摘要对比，只返回 JSON。', input.novel, {
        chapter: pickChapter(input.chapter),
        instruction: input.instruction,
        currentSummary: input.currentContent.summary
      }, M1_OUTPUT_SCHEMA_HINT.body),
      validate: (value) => {
        const payload = asRecord(value);
        const candidateSource = readObject(payload, 'candidate') ?? payload;
        const candidate = toBodyDraft(candidateSource, input.novel, input.chapter);
        return {
          candidate,
          summaryCompare: toSummaryCompare(readObject(payload, 'summaryCompare'), input.currentContent.summary, candidate.summary)
        };
      }
    });
  }

  async assessImpact(input: {
    novel: NovelRecord;
    chapter: NovelChapterRecord;
    oldContent: ChapterContentVersionRecord | null;
    newContent: ChapterContentVersionRecord;
    instruction?: string | null;
  }): Promise<ImpactAssessmentDraft> {
    return requestJsonOutput(this.options.client, {
      taskName: 'novel_impact_assess',
      model: this.reasonerModel,
      messages: createMessages('评估章节改写对后续内容的影响，只返回 JSON。', input.novel, {
        chapter: pickChapter(input.chapter),
        oldSummary: input.oldContent?.summary,
        newSummary: input.newContent.summary,
        instruction: input.instruction
      }, M1_OUTPUT_SCHEMA_HINT.impact),
      validate: toImpactDraft
    });
  }

  async generateFullReview(input: { novel: NovelRecord; chapters: NovelChapterRecord[]; sourceVersionRefs: unknown }): Promise<FullReviewDraft> {
    return requestJsonOutput(this.options.client, {
      taskName: 'novel_full_review',
      model: this.reasonerModel,
      messages: createMessages('生成全书审稿报告、门禁结论和首条视频建议，只返回 JSON。', input.novel, {
        chapters: input.chapters.map(pickChapter),
        sourceVersionRefs: input.sourceVersionRefs
      }, M1_OUTPUT_SCHEMA_HINT.fullReview),
      validate: toFullReviewDraft
    });
  }
}

function createMessages(instruction: string, novel: NovelRecord | null, payload: unknown, outputSchemaHint: string) {
  return [
    {
      role: 'system' as const,
      content: '你是小说创作系统的结构化 JSON 输出模型。只输出满足约定的 JSON，不输出解释。'
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        instruction,
        outputSchemaHint,
        novel: novel ? { id: novel.id, title: novel.title, genres: novel.genres, chapterLimit: novel.chapterLimit } : null,
        payload
      })
    }
  ];
}

const M1_OUTPUT_SCHEMA_HINT = {
  direction:
    '方向任务返回 {"candidates":[{"title","summary","content":{"title","logline","coreHook","audienceAppeal","videoPotential","sellingPoints":[],"riskTags":[],"recommendation"},"score":0-100,"marketScore":0-100,"riskLevel":"low|medium|high|blocking","riskTags":[],"recommendedReason"}]}',
  structure:
    '结构任务返回 {"title","summary","content":{"title","summary","sections":[{"title","body","items":[]}],"stages":[{"stageIndex","title","chapterRange","goal","conflict","payoff"}],"chapters":[{"chapterNo","stageIndex","title","wordTarget","goal","conflict","hook"}],"riskTags":[],"recommendation"},"score":0-100,"riskLevel":"low|medium|high","riskTags":[],"recommendedReason"}',
  chapterPlanChunk:
    '章节目录分块只返回 {"chapters":[{"chapterNo","stageIndex","title","wordTarget","goal","conflict","hook"}]}。不得返回说明、Markdown、额外字段或缺失章节。',
  trialChapterOne:
    '第1章试写返回 {"candidates":[{"title","content","summary","openingStrategy","openingHighlight","firstSentence","first300Summary","endingHook","riskLevel","riskTags":[],"aiRecommendedReason","isAiRecommended":true/false,"scoring":{"totalScore":0-100,"dimensions":[{"key","label","score","weight","evidence","penaltyPoints"}]}}]}。每个 content 900-1200 中文字符，候选数量必须等于 requiredCandidateCount。',
  trialFollowup:
    '第2-3章试写返回 {"chapters":[{"chapterNo":2,"title","content","summary","openingStrategy","openingHighlight","firstSentence","first300Summary","endingHook","riskLevel","riskTags":[],"aiRecommendedReason","scoring":{"totalScore","dimensions":[]},"featureCard":{},"review":{"totalScore","issues":[],"suggestions":[],"riskLevel"},"hardFailed":false,"hardFailureReasons":[]}],"review":{"totalScore","trialResult":"pass|pass_with_suggestions|blocked|return_upstream","summary","strengths":[],"problems":[],"suggestions":[],"recommendedAction","allowNextStep":true,"requiresRiskConfirmation":false,"chapterScores":[{"chapterNo","score","hardFailed":false}]}}',
  body:
    '正文/重写返回 {"title","content","summary","openingStrategy","openingHighlight","firstSentence","first300Summary","endingHook","riskLevel","riskTags":[],"aiRecommendedReason","scoring":{"totalScore","dimensions":[]},"featureCard":{},"review":{"totalScore","issues":[],"suggestions":[],"riskLevel"},"memory":{"summary","facts":[],"foreshadows":[]},"hardFailed":false,"hardFailureReasons":[]}',
  impact:
    '影响评估返回 {"impactLevel":"none|minor|medium|severe","summary","changedFacts":[],"affectedChapterIds":[],"affectedVideoReferenceIds":[],"recommendedHandling","suggestedActions":[],"blocksFullReview":false}',
  fullReview:
    '全书审稿返回 {"totalScore":0-100,"rating":"A|B|C","gateResult":"pass|warning|blocked","summary","strengths":[],"problems":[],"suggestions":[],"dimensionScores":[{"key","label","score","weight","evidence","penaltyPoints"}],"issues":[],"videoSuggestion","firstVideoSuggestion":{"chapterRange","openingSlice","narrationHook","firstScreenSubtitle","titleHook","endingSuspense","suggestedFormat","riskTips":[]},"platformRisks":[],"originalityRisks":[],"aiFlavorRisks":[],"lowScoreContinueRisks":[],"reviewPolicyVersionId"}'
};

function toDirectionDraft(value: unknown): DirectionCandidateDraft {
  const item = asRecord(value);
  const title = readString(item, 'title');
  const summary = readString(item, 'summary');
  const contentValue = item.content;
  const content =
    typeof contentValue === 'object' && contentValue !== null
      ? asRecord(contentValue)
      : {
          title,
          logline: summary,
          coreHook: summary,
          audienceAppeal: summary,
          videoPotential: summary,
          sellingPoints: readStringArray(item, 'sellingPoints', [summary]),
          riskTags: readStringArray(item, 'riskTags'),
          recommendation: readOptionalString(item, 'recommendedReason') ?? summary
        };

  return {
    title,
    summary,
    content: {
      title: readOptionalString(content, 'title') ?? title,
      logline: readOptionalString(content, 'logline') ?? summary,
      coreHook: readOptionalString(content, 'coreHook') ?? summary,
      audienceAppeal: readOptionalString(content, 'audienceAppeal') ?? summary,
      videoPotential: readOptionalString(content, 'videoPotential') ?? summary,
      sellingPoints: readStringArray(content, 'sellingPoints', readStringArray(item, 'sellingPoints', [summary])),
      riskTags: readStringArray(content, 'riskTags', readStringArray(item, 'riskTags')),
      recommendation: readOptionalString(content, 'recommendation') ?? readOptionalString(item, 'recommendedReason') ?? summary
    },
    score: readNumber(item, 'score'),
    marketScore: readOptionalNumber(item, 'marketScore') ?? readNumber(item, 'score'),
    riskLevel: readRiskLevel(item, 'riskLevel'),
    riskTags: readStringArray(item, 'riskTags'),
    recommendedReason: readString(item, 'recommendedReason')
  };
}

function toStructureDraft(objectType: StructureAssetType, value: unknown): StructureAssetDraft {
  const item = asRecord(value);
  const rawContent = asRecord(item.content ?? {});
  const title = readOptionalString(item, 'title') ?? readOptionalString(rawContent, 'title') ?? getStructureAssetLabel(objectType);
  const summary = readOptionalString(item, 'summary') ?? readOptionalString(rawContent, 'summary') ?? readOptionalString(item, 'description') ?? `${title} 已生成。`;
  const content: StructureAssetContentDTO = {
    title: readOptionalString(rawContent, 'title') ?? title,
    summary: readOptionalString(rawContent, 'summary') ?? summary,
    sections: readPlainArray(rawContent, 'sections').map((section, index) => {
      const record = asRecord(section);
      return {
        title: readOptionalString(record, 'title') ?? `结构段落 ${index + 1}`,
        body: readOptionalString(record, 'body') ?? readOptionalString(record, 'summary') ?? summary,
        items: readStringArray(record, 'items', [])
      };
    }),
    stages: readPlainArray(rawContent, 'stages').map((stage, index) => {
      const record = asRecord(stage);
      return {
        stageIndex: readOptionalNumber(record, 'stageIndex') ?? index + 1,
        title: readOptionalString(record, 'title') ?? `阶段 ${index + 1}`,
        chapterRange: readOptionalString(record, 'chapterRange') ?? '1-5',
        goal: readOptionalString(record, 'goal') ?? readOptionalString(record, 'summary') ?? summary,
        conflict: readOptionalString(record, 'conflict') ?? '主角与外部压力升级',
        payoff: readOptionalString(record, 'payoff') ?? '阶段反击兑现'
      };
    }),
    chapters: readPlainArray(rawContent, 'chapters').map((chapter, index) => {
      return toStructureChapterDraft(chapter, index + 1, summary);
    }),
    riskTags: readStringArray(rawContent, 'riskTags', readStringArray(item, 'riskTags')),
    recommendation: readOptionalString(rawContent, 'recommendation') ?? readOptionalString(item, 'recommendedReason') ?? summary
  };
  if (content.sections.length === 0) {
    content.sections.push({ title, body: summary, items: [] });
  }
  if (content.stages.length === 0) {
    content.stages.push({ stageIndex: 1, title: '第一阶段', chapterRange: '1-5', goal: summary, conflict: '主线压力升级', payoff: '阶段反击兑现' });
  }
  if (content.chapters.length === 0) {
    content.chapters.push({ chapterNo: 1, stageIndex: 1, title: '第1章', wordTarget: 1200, goal: summary, conflict: '开篇冲突', hook: '结尾钩子' });
  }

  return {
    objectType,
    title,
    summary,
    content,
    score: readOptionalNumber(item, 'score') ?? 80,
    riskLevel: readRiskLevel(item, 'riskLevel'),
    riskTags: readStringArray(item, 'riskTags'),
    recommendedReason: readOptionalString(item, 'recommendedReason') ?? summary
  };
}

function unwrapPayload(value: unknown, fields: string[]): unknown {
  let current = value;
  for (let depth = 0; depth < 2; depth += 1) {
    const record = asRecord(current);
    const nextField = fields.find((field) => typeof record[field] === 'object' && record[field] !== null);
    if (!nextField) {
      return current;
    }
    current = record[nextField];
  }
  return current;
}

function getStructureAssetLabel(objectType: StructureAssetType): string {
  const labels: Record<StructureAssetType, string> = {
    setting: '设定档案',
    outline: '全书大纲',
    stage_outline: '阶段大纲',
    chapter_plan: '章节目录'
  };
  return labels[objectType];
}

function getStructureInstruction(objectType: StructureAssetType): string {
  const label = getStructureAssetLabel(objectType);
  const objectGuidance: Record<StructureAssetType, string> = {
    setting: '聚焦人物设定、关系、世界规则和禁忌边界。sections 控制在 3-4 个，每段 body 不超过 80 字、items 不超过 4 条；stages 和 chapters 必须返回空数组，不展开全书章节。',
    outline: '聚焦全书主线、结局和关键转折。只返回 sections 3 个，每段 body 不超过 80 字、items 不超过 3 条；stages 和 chapters 必须返回空数组，阶段和章节由后续步骤生成。',
    stage_outline: '聚焦阶段目标、冲突递进和爽点兑现。sections 控制在 1-2 个；stages 给 3-4 个阶段；chapters 必须返回空数组，章节由后续步骤生成。',
    chapter_plan: '聚焦章节目录。chapters 给完整章节规划，但每章 goal/conflict/hook 不超过 35 字；sections 和 stages 只做简要说明。'
  };
  return `生成 ${label} 候选，只返回 JSON。${objectGuidance[objectType]}`;
}

function getChapterPlanChunkInstruction(start: number, end: number, total: number, wordTargetPolicy: WordTargetPolicy): string {
  return `生成章节目录第 ${start}-${end} 章，共 ${total} 章。只返回一个完整 JSON 对象，不要 Markdown，不要解释，不要省略闭合括号；根字段只能是 chapters。chapters 必须按 chapterNo 从 ${start} 到 ${end} 连续返回；每章 goal/conflict/hook 不超过 24 个汉字；title 不超过 14 个汉字；wordTarget 使用 ${wordTargetPolicy.min}-${wordTargetPolicy.max} 的整数，常规章节靠近 ${wordTargetPolicy.defaultTarget}，高潮或关键转折章节可接近上限。`;
}

function getStructureSchemaHint(objectType: StructureAssetType): string {
  if (objectType === 'outline') {
    return '全书大纲返回 {"title","summary","content":{"title","summary","sections":[{"title","body","items":[]}],"stages":[],"chapters":[],"riskTags":[],"recommendation"},"score":0-100,"riskLevel":"low|medium|high","riskTags":[],"recommendedReason"}';
  }
  if (objectType === 'stage_outline') {
    return '阶段大纲返回 {"title","summary","content":{"title","summary","sections":[{"title","body","items":[]}],"stages":[{"stageIndex","title","chapterRange","goal","conflict","payoff"}],"chapters":[],"riskTags":[],"recommendation"},"score":0-100,"riskLevel":"low|medium|high","riskTags":[],"recommendedReason"}';
  }
  if (objectType === 'chapter_plan') {
    return '章节目录返回 {"title","summary","content":{"title","summary","sections":[{"title","body","items":[]}],"stages":[{"stageIndex","title","chapterRange","goal","conflict","payoff"}],"chapters":[{"chapterNo","stageIndex","title","wordTarget","goal","conflict","hook"}],"riskTags":[],"recommendation"},"score":0-100,"riskLevel":"low|medium|high","riskTags":[],"recommendedReason"}';
  }
  return M1_OUTPUT_SCHEMA_HINT.structure;
}

function getStructureMaxTokens(objectType: StructureAssetType): number {
  const limits: Record<StructureAssetType, number> = {
    setting: 2000,
    outline: 1600,
    stage_outline: 2200,
    chapter_plan: 3800
  };
  return limits[objectType];
}

function summarizeCurrentAssets(assets: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(assets).map(([key, value]) => [key, summarizeAssetValue(value)]));
}

function summarizeAssetValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  const record = asRecord(value);
  const directionContent = readOptionalString(record, 'content');
  if (directionContent) {
    return {
      title: readOptionalString(record, 'title'),
      summary: truncateText(readOptionalString(record, 'summary'), 160),
      content: truncateText(directionContent, 260),
      score: readOptionalNumber(record, 'score'),
      riskLevel: readOptionalString(record, 'riskLevel'),
      recommendedReason: truncateText(readOptionalString(record, 'recommendedReason'), 160)
    };
  }
  const content = asRecord(record.content ?? {});
  const sections = readPlainArray(content, 'sections').slice(0, 4).map((section) => {
    const item = asRecord(section);
    return {
      title: readOptionalString(item, 'title'),
      body: truncateText(readOptionalString(item, 'body') ?? readOptionalString(item, 'summary'), 120),
      items: readStringArray(item, 'items').slice(0, 4).map((entry) => truncateText(entry, 80))
    };
  });
  const stages = readPlainArray(content, 'stages').slice(0, 5).map((stage) => {
    const item = asRecord(stage);
    return {
      stageIndex: readOptionalNumber(item, 'stageIndex'),
      title: readOptionalString(item, 'title'),
      goal: truncateText(readOptionalString(item, 'goal') ?? readOptionalString(item, 'summary'), 100)
    };
  });
  const chapters = readPlainArray(content, 'chapters').slice(0, 8).map((chapter) => {
    const item = asRecord(chapter);
    return {
      chapterNo: readOptionalNumber(item, 'chapterNo'),
      title: readOptionalString(item, 'title'),
      goal: truncateText(readOptionalString(item, 'goal') ?? readOptionalString(item, 'summary'), 100)
    };
  });

  return {
    title: readOptionalString(record, 'title') ?? readOptionalString(content, 'title'),
    summary: truncateText(readOptionalString(record, 'summary') ?? readOptionalString(content, 'summary'), 180),
    score: readOptionalNumber(record, 'score'),
    riskLevel: readOptionalString(record, 'riskLevel'),
    logline: truncateText(readOptionalString(content, 'logline'), 120),
    coreHook: truncateText(readOptionalString(content, 'coreHook'), 120),
    sections,
    stages,
    chapters
  };
}

function truncateText(value: string | undefined | null, maxLength: number): string | undefined {
  if (!value) return undefined;
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function toStructureChapterDraft(value: unknown, fallbackChapterNo: number, summary = '章节推进主线。', fallbackWordTarget = 1200): StructureAssetContentDTO['chapters'][number] {
  const record = asRecord(value);
  const chapterNo = readOptionalNumber(record, 'chapterNo') ?? fallbackChapterNo;
  return {
    chapterNo,
    stageIndex: readOptionalNumber(record, 'stageIndex') ?? Math.max(1, Math.ceil(chapterNo / 20)),
    title: truncateText(readOptionalString(record, 'title') ?? `第${chapterNo}章`, 24) ?? `第${chapterNo}章`,
    wordTarget: readOptionalNumber(record, 'wordTarget') ?? fallbackWordTarget,
    goal: truncateText(readOptionalString(record, 'goal') ?? readOptionalString(record, 'summary') ?? summary, 80) ?? summary,
    conflict: truncateText(readOptionalString(record, 'conflict') ?? '主角继续反击', 80) ?? '主角继续反击',
    hook: truncateText(readOptionalString(record, 'hook') ?? '留下下一章钩子', 80) ?? '留下下一章钩子'
  };
}

function createChapterPlanStructureDraft(
  novel: NovelRecord,
  currentAssets: Record<string, unknown>,
  chapters: StructureAssetContentDTO['chapters']
): StructureAssetDraft {
  const stageOutline = asRecord(currentAssets.stageOutline ?? currentAssets.stage_outline ?? {});
  const stageSummary = readOptionalString(stageOutline, 'summary') ?? `${novel.title} 章节目录已生成。`;
  const stages = readPlainArray(stageOutline, 'stages').map((stage, index) => {
    const record = asRecord(stage);
    return {
      stageIndex: readOptionalNumber(record, 'stageIndex') ?? index + 1,
      title: readOptionalString(record, 'title') ?? `阶段 ${index + 1}`,
      chapterRange: readOptionalString(record, 'chapterRange') ?? createStageChapterRange(index + 1, chapters.length),
      goal: readOptionalString(record, 'goal') ?? stageSummary,
      conflict: readOptionalString(record, 'conflict') ?? '主线压力升级',
      payoff: readOptionalString(record, 'payoff') ?? '阶段爽点兑现'
    };
  });

  return {
    objectType: 'chapter_plan',
    title: '章节目录',
    summary: `已规划 ${chapters.length} 章，按阶段推进主线、冲突和章末钩子。`,
    content: {
      title: '章节目录',
      summary: `已规划 ${chapters.length} 章，按阶段推进主线、冲突和章末钩子。`,
      sections: [{ title: '章节规划原则', body: stageSummary, items: ['章节号连续', '每章保留目标、冲突和钩子', '采用后生成正式章节清单'] }],
      stages: stages.length > 0 ? stages : createFallbackStages(chapters.length),
      chapters,
      riskTags: [],
      recommendation: '可采用章节目录，进入试写调试。'
    },
    score: 82,
    riskLevel: RiskLevel.Low,
    riskTags: [],
    recommendedReason: '章节目标、冲突和钩子已按范围生成。'
  };
}

function createFallbackStages(chapterCount: number): StructureAssetContentDTO['stages'] {
  const stageCount = Math.max(1, Math.min(4, Math.ceil(chapterCount / 20)));
  return Array.from({ length: stageCount }, (_, index) => ({
    stageIndex: index + 1,
    title: `阶段 ${index + 1}`,
    chapterRange: createStageChapterRange(index + 1, chapterCount, stageCount),
    goal: '推进主角成长和商业反击',
    conflict: '外部压力持续升级',
    payoff: '阶段性胜利兑现'
  }));
}

function createStageChapterRange(stageIndex: number, chapterCount: number, stageCount = Math.max(1, Math.min(4, Math.ceil(chapterCount / 20)))) {
  const perStage = Math.ceil(chapterCount / stageCount);
  const start = (stageIndex - 1) * perStage + 1;
  const end = Math.min(chapterCount, stageIndex * perStage);
  return `${start}-${end}`;
}

function toTrialCandidateDraft(value: unknown, chapter: NovelChapterRecord, recommendedFallback: boolean): TrialChapterCandidateDraft {
  const item = asRecord(value);
  const content = readString(item, 'content');
  return {
    chapterId: chapter.id,
    chapterNo: chapter.chapterNo,
    title: readOptionalString(item, 'title') ?? chapter.title,
    content,
    summary: readOptionalString(item, 'summary') ?? readOptionalString(item, 'first300Summary') ?? content.slice(0, 120),
    openingStrategy: readOptionalString(item, 'openingStrategy') ?? '强冲突开场',
    openingHighlight: readOptionalString(item, 'openingHighlight') ?? '开篇钩子清晰',
    firstSentence: readOptionalString(item, 'firstSentence') ?? firstSentence(content),
    first300Summary: readOptionalString(item, 'first300Summary') ?? content.slice(0, 300),
    endingHook: readOptionalString(item, 'endingHook') ?? '结尾留下下一章钩子',
    riskLevel: readRiskLevel(item, 'riskLevel'),
    riskTags: readStringArray(item, 'riskTags'),
    aiRecommendedReason: readOptionalString(item, 'aiRecommendedReason') ?? '结构和节奏较稳定。',
    isAiRecommended: readOptionalBoolean(item, 'isAiRecommended') ?? recommendedFallback,
    scoring: toScoring(item.scoring, 'trial-opening-score-v1')
  };
}

function toFollowupDraft(value: unknown, chapter: NovelChapterRecord): TrialFollowupChapterDraft {
  return {
    ...toBodyDraft(value, null, chapter),
    chapter
  };
}

function toSelectedChapterOneFollowup(candidate: TrialChapterCandidateDraftLike, chapter: NovelChapterRecord): TrialFollowupChapterDraft {
  const content = candidate.content;
  const summary = candidate.summary ?? content.slice(0, 120);
  const score = candidate.reviewScore ?? 82;
  return {
    chapter,
    content,
    summary,
    openingStrategy: '沿用用户选择的第1章开篇策略',
    openingHighlight: '已选第1章作为连续试写基准',
    firstSentence: firstSentence(content),
    first300Summary: content.slice(0, 300),
    endingHook: '承接第1章结尾钩子继续试写',
    riskLevel: score >= 75 ? RiskLevel.Low : RiskLevel.Medium,
    riskTags: score >= 75 ? ['连续性稳定'] : ['需关注承接风险'],
    aiRecommendedReason: '用户已选择该候选继续试写。',
    scoring: toScoring({}, 'trial-chapter-score-v1', score, false),
    featureCard: toFeatureCard({}, chapter, summary),
    review: toChapterReview({}, null, score, summary, false),
    hardFailed: false,
    hardFailureReasons: []
  };
}

function toBodyDraft(value: unknown, novel: NovelRecord | null, chapter: NovelChapterRecord): BodyChapterDraft {
  const item = asRecord(value);
  const content = readString(item, 'content');
  const hardFailed = readOptionalBoolean(item, 'hardFailed') ?? false;
  const score = readOptionalNumber(asRecord(item.scoring ?? {}), 'totalScore') ?? readOptionalNumber(item, 'score') ?? 80;
  const summary = readOptionalString(item, 'summary') ?? content.slice(0, 120);

  return {
    chapter,
    content,
    summary,
    openingStrategy: readOptionalString(item, 'openingStrategy') ?? '承接上一章钩子',
    openingHighlight: readOptionalString(item, 'openingHighlight') ?? '延续主线推进',
    firstSentence: readOptionalString(item, 'firstSentence') ?? firstSentence(content),
    first300Summary: readOptionalString(item, 'first300Summary') ?? content.slice(0, 300),
    endingHook: readOptionalString(item, 'endingHook') ?? '结尾留下后续悬念',
    riskLevel: readRiskLevel(item, 'riskLevel'),
    riskTags: readStringArray(item, 'riskTags'),
    aiRecommendedReason: readOptionalString(item, 'aiRecommendedReason') ?? '符合当前策略快照。',
    scoring: toScoring(item.scoring, 'body-chapter-score-v1', score, hardFailed),
    featureCard: toFeatureCard(item.featureCard, chapter, summary),
    review: toChapterReview(item.review, novel, score, summary, hardFailed),
    memory: toMemory(item.memory, summary),
    hardFailed,
    hardFailureReasons: readStringArray(item, 'hardFailureReasons')
  };
}

function toTrialReviewDraft(value: unknown): TrialReviewDraft {
  const item = asRecord(value);
  const totalScore = readNumber(item, 'totalScore');
  return {
    totalScore,
    trialResult: readEnum(item, 'trialResult', ['pass', 'pass_with_suggestions', 'return_upstream', 'blocked'], 'pass'),
    summary: readString(item, 'summary'),
    strengths: readStringArray(item, 'strengths'),
    problems: readStringArray(item, 'problems'),
    suggestions: readStringArray(item, 'suggestions'),
    recommendedAction: readOptionalString(item, 'recommendedAction') ?? 'confirm_trial',
    allowNextStep: readOptionalBoolean(item, 'allowNextStep') ?? totalScore >= 70,
    requiresRiskConfirmation: readOptionalBoolean(item, 'requiresRiskConfirmation') ?? totalScore < 80,
    chapterScores: readPlainArray(item, 'chapterScores').map((score) => {
      const record = asRecord(score);
      return {
        chapterNo: readNumber(record, 'chapterNo'),
        score: readNumber(record, 'score'),
        hardFailed: readOptionalBoolean(record, 'hardFailed') ?? false
      };
    })
  };
}

function toImpactDraft(value: unknown): ImpactAssessmentDraft {
  const item = asRecord(value);
  return {
    impactLevel: readEnum(item, 'impactLevel', ['none', 'minor', 'medium', 'severe'], 'minor'),
    summary: readString(item, 'summary'),
    changedFacts: readStringArray(item, 'changedFacts'),
    affectedChapterIds: readStringArray(item, 'affectedChapterIds'),
    affectedVideoReferenceIds: readStringArray(item, 'affectedVideoReferenceIds'),
    recommendedHandling: readOptionalString(item, 'recommendedHandling') ?? '人工确认影响范围',
    suggestedActions: readStringArray(item, 'suggestedActions'),
    blocksFullReview: readOptionalBoolean(item, 'blocksFullReview') ?? false
  };
}

function toFullReviewDraft(value: unknown): FullReviewDraft {
  const item = asRecord(value);
  return {
    totalScore: readNumber(item, 'totalScore'),
    rating: readString(item, 'rating'),
    gateResult: readEnum(item, 'gateResult', ['pass', 'warning', 'blocked', 'forced_pass'], 'blocked') as FullReviewGateResult,
    summary: readString(item, 'summary'),
    strengths: readStringArray(item, 'strengths'),
    problems: readStringArray(item, 'problems'),
    suggestions: readStringArray(item, 'suggestions'),
    dimensionScores: readPlainArray(item, 'dimensionScores').map((dimension, index) => toDimension(dimension, index)),
    issues: readPlainArray(item, 'issues') as FullReviewDraft['issues'],
    videoSuggestion: readString(item, 'videoSuggestion'),
    firstVideoSuggestion: toFirstVideoSuggestion(readObject(item, 'firstVideoSuggestion')),
    platformRisks: readStringArray(item, 'platformRisks'),
    originalityRisks: readStringArray(item, 'originalityRisks'),
    aiFlavorRisks: readStringArray(item, 'aiFlavorRisks'),
    lowScoreContinueRisks: readStringArray(item, 'lowScoreContinueRisks'),
    reviewPolicyVersionId: readOptionalString(item, 'reviewPolicyVersionId') ?? 'deepseek-full-review-v1'
  };
}

function toScoring(value: unknown, version: string, fallbackScore?: number, hardFailure = false): QualityScoringDTO {
  const item = asRecord(value ?? {});
  const totalScore = readOptionalNumber(item, 'totalScore') ?? fallbackScore ?? 80;
  const dimensions = readPlainArray(item, 'dimensions').map((dimension, index) => toDimension(dimension, index));
  if (dimensions.length === 0) {
    dimensions.push({
      key: 'overall',
      label: '综合表现',
      score: totalScore,
      weight: 1,
      evidence: '模型结构化评分',
      penaltyPoints: Math.max(0, 80 - totalScore)
    });
  }

  return {
    scoringStrategyVersion: readOptionalString(item, 'scoringStrategyVersion') ?? version,
    totalScore,
    gateResult: hardFailure ? 'hard_fail' : totalScore >= 70 ? 'pass' : 'warning',
    gateResultText: hardFailure ? '硬失败' : totalScore >= 70 ? '通过' : '需关注',
    dimensions,
    weights: Object.fromEntries(dimensions.map((dimension) => [dimension.key, dimension.weight])),
    evidence: dimensions.map((dimension) => dimension.evidence),
    penalties: readStringArray(item, 'penalties', dimensions.filter((dimension) => dimension.penaltyPoints > 0).map((dimension) => `${dimension.label}扣分`)),
    hardFailure,
    hardFailureReasons: readStringArray(item, 'hardFailureReasons')
  };
}

function toDimension(value: unknown, index: number): ScoringDimensionDTO {
  const item = asRecord(value);
  const score = readOptionalNumber(item, 'score') ?? 80;
  return {
    key: readOptionalString(item, 'key') ?? `dimension_${index + 1}`,
    label: readOptionalString(item, 'label') ?? `维度 ${index + 1}`,
    score,
    weight: readOptionalNumber(item, 'weight') ?? 1,
    evidence: readOptionalString(item, 'evidence') ?? '模型结构化证据',
    penaltyPoints: readOptionalNumber(item, 'penaltyPoints') ?? Math.max(0, 80 - score)
  };
}

function toFeatureCard(value: unknown, chapter: NovelChapterRecord, summary: string) {
  const item = asRecord(value ?? {});
  return {
    chapterId: chapter.id,
    oneLineSummary: readOptionalString(item, 'oneLineSummary') ?? summary,
    coreTask: readOptionalString(item, 'coreTask') ?? `完成${chapter.title}正文推进`,
    mainConflict: readOptionalString(item, 'mainConflict') ?? '主角围绕证据线与对手攻防',
    appealPoint: readOptionalString(item, 'appealPoint') ?? '压迫后反击',
    emotionKeywords: readStringArray(item, 'emotionKeywords', readStringArray(item, 'highlights', ['压迫', '反击'])),
    characterChanges: readStringArray(item, 'characterChanges', readStringArray(item, 'characters', ['主角更主动'])),
    relationshipChanges: readStringArray(item, 'relationshipChanges', []),
    keyInformation: readStringArray(item, 'keyInformation', readStringArray(item, 'plotPoints', [])),
    foreshadowingOperation: readOptionalString(item, 'foreshadowingOperation') ?? '保留下一章悬念',
    endingHook: readOptionalString(item, 'endingHook') ?? '留下下一章钩子',
    factsCannotChange: readStringArray(item, 'factsCannotChange', []),
    featuresToStrengthen: readStringArray(item, 'featuresToStrengthen', readStringArray(item, 'risks', [])),
    metadata: {}
  };
}

function toChapterReview(value: unknown, novel: NovelRecord | null, score: number, summary: string, hardFailed: boolean) {
  const item = asRecord(value ?? {});
  return {
    reviewLevel: 'chapter',
    totalScore: readOptionalNumber(item, 'totalScore') ?? score,
    subScores: { scoringStrategyVersion: 'deepseek-chapter-review-v1' },
    rating: hardFailed ? 'blocked' : score >= 70 ? 'pass' : 'warning',
    summary: readOptionalString(item, 'summary') ?? summary,
    strengths: readStringArray(item, 'strengths', ['主线承接清楚']),
    problems: readStringArray(item, 'problems', readStringArray(item, 'issues', [])),
    suggestions: readStringArray(item, 'suggestions'),
    issueCards: readPlainArray(item, 'issueCards').map((issue) => {
      const record = asRecord(issue);
      return {
        severity: readEnum(record, 'severity', ['info', 'warning', 'blocking'], hardFailed ? 'blocking' : 'info'),
        dimension: readOptionalString(record, 'dimension') ?? 'quality',
        message: readOptionalString(record, 'message') ?? summary,
        suggestion: readOptionalString(record, 'suggestion') ?? '继续观察'
      };
    }),
    actionOptions: hardFailed ? ['rewrite_chapter'] : ['continue_batch'],
    recommendedAction: hardFailed ? '进入章节详情处理' : '继续下一章',
    allowNextStep: !hardFailed,
    blockingIssueCount: hardFailed ? 1 : 0,
    resolvedStatus: hardFailed ? 'open' : 'resolved',
    promptTemplateVersionId: null,
    policyProfileVersionId: novel?.policyProfileVersionId ?? null,
    metadata: {}
  };
}

function toMemory(value: unknown, summary: string) {
  const item = asRecord(value ?? {});
  return {
    previousSummary: readOptionalString(item, 'summary') ?? summary,
    characterStates: readStringArray(item, 'characterStates', readStringArray(item, 'facts', [])),
    relationshipStates: readStringArray(item, 'relationshipStates', []),
    locations: readStringArray(item, 'locations', []),
    organizations: readStringArray(item, 'organizations', []),
    items: readStringArray(item, 'items', readStringArray(item, 'facts', [])),
    plantedForeshadowing: readStringArray(item, 'plantedForeshadowing', readStringArray(item, 'foreshadows', [])),
    resolvedForeshadowing: readStringArray(item, 'resolvedForeshadowing', []),
    unresolvedConflicts: readStringArray(item, 'unresolvedConflicts', []),
    newSettings: readStringArray(item, 'newSettings', []),
    factsCannotContradict: readStringArray(item, 'factsCannotContradict', []),
    metadata: {}
  };
}

function toSummaryCompare(value: unknown, currentSummary: string | null, candidateSummary: string): ChapterSummaryCompareDTO {
  const item = asRecord(value ?? {});
  return {
    currentSummary: readOptionalString(item, 'currentSummary') ?? currentSummary ?? '当前正文摘要',
    candidateSummary: readOptionalString(item, 'candidateSummary') ?? candidateSummary,
    benefit: readOptionalString(item, 'benefit') ?? '候选版本强化表达和钩子。',
    newRisks: readStringArray(item, 'newRisks'),
    possibleImpact: readOptionalString(item, 'possibleImpact') ?? '主要影响本章表达。',
    aiSuggestion: readOptionalString(item, 'aiSuggestion') ?? '采用前请查看影响评估。'
  };
}

function toFirstVideoSuggestion(value: unknown): FirstVideoSuggestionDTO {
  const item = asRecord(value);
  return {
    chapterRange: readString(item, 'chapterRange'),
    openingSlice: readOptionalString(item, 'openingSlice') ?? readOptionalString(item, 'firstThreeSecondVoiceover') ?? '',
    narrationHook: readOptionalString(item, 'narrationHook') ?? readOptionalString(item, 'firstThreeSecondVoiceover') ?? '',
    firstScreenSubtitle: readString(item, 'firstScreenSubtitle'),
    titleHook: readString(item, 'titleHook'),
    endingSuspense: readString(item, 'endingSuspense'),
    suggestedFormat: readOptionalString(item, 'suggestedFormat') ?? '旁白音频 + 字幕 + 循环背景视频',
    riskTips: readStringArray(item, 'riskTips')
  };
}

function summarizeSelectedCandidate(candidate: TrialChapterCandidateDraftLike) {
  return {
    id: candidate.id,
    summary: candidate.summary,
    reviewScore: candidate.reviewScore,
    contentPreview: candidate.content.slice(0, 300)
  };
}

function pickChapter(chapter: NovelChapterRecord) {
  return {
    id: chapter.id,
    chapterNo: chapter.chapterNo,
    title: chapter.title,
    wordTarget: chapter.wordTarget,
    statusNote: chapter.statusNote
  };
}

interface WordTargetPolicy {
  min: number;
  max: number;
  defaultTarget: number;
  target: number;
  lowerBound: number;
  upperBound: number;
  instruction: string;
}

function createWordTargetPolicy(novel: NovelRecord, chapterTarget?: number): WordTargetPolicy {
  const min = clampInteger(novel.chapterWordMin ?? 1800, 100, 30000);
  const max = clampInteger(Math.max(novel.chapterWordMax ?? 2600, min), min, 30000);
  const defaultTarget = Math.round((min + max) / 2);
  const target = clampInteger(chapterTarget ?? defaultTarget, min, max);
  const lowerBound = Math.max(100, Math.floor(target * 0.9));
  const upperBound = Math.ceil(target * 1.15);

  return {
    min,
    max,
    defaultTarget,
    target,
    lowerBound,
    upperBound,
    instruction: `本章目标 ${target} 字，允许范围 ${lowerBound}-${upperBound} 字。content 正文字数不得低于 ${lowerBound} 字；如果剧情不足，请补充动作、对话、心理、场景和冲突推进，不要用提纲或说明凑数。`
  };
}

function getBodyChapterMaxTokens(target: number): number {
  return Math.max(3600, Math.min(9000, Math.ceil(target * 2.4)));
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function firstSentence(content: string): string {
  return content.split(/[。！？\n]/).find(Boolean)?.trim() ?? content.slice(0, 40);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('object is required');
  }
  return value as Record<string, unknown>;
}

function readObject(value: unknown, field: string): Record<string, unknown> {
  const record = asRecord(value);
  return asRecord(record[field]);
}

function readArray(value: unknown, field: string): unknown[] {
  const array = readPlainArray(asRecord(value), field);
  if (array.length === 0) {
    throw new Error(`${field} is required`);
  }
  return array;
}

function readPlainArray(record: Record<string, unknown>, field: string): unknown[] {
  const value = record[field];
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown, field: string): string {
  const result = readOptionalString(asRecord(value), field);
  if (!result) {
    throw new Error(`${field} is required`);
  }
  return result;
}

function readOptionalString(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown, field: string): number {
  const result = readOptionalNumber(asRecord(value), field);
  if (result === null) {
    throw new Error(`${field} is required`);
  }
  return result;
}

function readOptionalNumber(record: Record<string, unknown>, field: string): number | null {
  const value = record[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readOptionalBoolean(record: Record<string, unknown>, field: string): boolean | null {
  const value = record[field];
  return typeof value === 'boolean' ? value : null;
}

function readStringArray(record: Record<string, unknown>, field: string, fallback: string[] = []): string[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function readRiskLevel(record: Record<string, unknown>, field: string): RiskLevel {
  return readEnum(record, field, Object.values(RiskLevel), RiskLevel.Low);
}

function readEnum<T extends string>(record: Record<string, unknown>, field: string, values: readonly T[], fallback: T): T {
  const value = record[field];
  return typeof value === 'string' && values.includes(value as T) ? (value as T) : fallback;
}
