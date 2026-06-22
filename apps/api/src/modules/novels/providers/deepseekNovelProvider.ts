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
  reasonerModel?: string;
}

export class DeepSeekNovelProvider implements DirectionProvider, StructureProvider, TrialProvider, BodyProvider, FullReviewProvider {
  private readonly model: string;
  private readonly reasonerModel: string;

  constructor(private readonly options: DeepSeekNovelProviderOptions) {
    this.model = options.model ?? 'deepseek-v4-pro';
    this.reasonerModel = options.reasonerModel ?? this.model;
  }

  async generateCandidates(input: { novel: NovelRecord; preferences: NovelPreferencesRecord }): Promise<DirectionCandidateDraft[]> {
    return requestJsonOutput(this.options.client, {
      taskName: 'novel_direction_generate',
      model: this.model,
      messages: createMessages('生成 3-4 个小说方向候选，只返回 JSON。', input.novel, input.preferences),
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
      }),
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
      }),
      validate: (value) => toDirectionDraft(readObject(value, 'candidate') ?? value)
    });
  }

  async generateAsset(input: {
    objectType: StructureAssetType;
    novel: NovelRecord;
    preferences: NovelPreferencesRecord;
    currentAssets: Record<string, unknown>;
  }): Promise<StructureAssetDraft> {
    return requestJsonOutput(this.options.client, {
      taskName: `novel_structure_${input.objectType}`,
      model: this.model,
      messages: createMessages(`生成 ${input.objectType} 结构资产候选，只返回 JSON。`, input.novel, {
        preferences: input.preferences,
        currentAssets: input.currentAssets
      }),
      validate: (value) => toStructureDraft(input.objectType, unwrapPayload(value, ['candidate', 'asset', input.objectType, 'result']))
    });
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
        model: this.model,
        messages: createMessages('生成第1章试写候选，只返回 JSON。', input.novel, {
          preferences: input.preferences,
          chapterCount: expectedCount,
          requiredCandidateCount: expectedCount,
          retryReason: attempt > 0 ? '上一轮返回候选数量不足，请补齐到要求数量。' : undefined,
          chapter: pickChapter(firstChapter)
        }),
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
      }),
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
    return requestJsonOutput(this.options.client, {
      taskName: 'novel_body_chapter_generate',
      model: this.model,
      messages: createMessages('生成单章正文、特性卡、单章审稿和长篇记忆摘要，只返回 JSON。', input.novel, {
        chapter: pickChapter(input.chapter),
        strategySnapshotId: (input.strategySnapshot as { id?: string })?.id,
        previousContentSummary: input.previousContent?.summary,
        previousBatchNotes: input.previousBatchNotes,
        enhancedReview: input.enhancedReview
      }),
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
      }),
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
      }),
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
      }),
      validate: toFullReviewDraft
    });
  }
}

function createMessages(instruction: string, novel: NovelRecord | null, payload: unknown) {
  return [
    {
      role: 'system' as const,
      content: '你是小说创作系统的结构化 JSON 输出模型。只输出满足约定的 JSON，不输出解释。'
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        instruction,
        outputSchemaHint: M1_OUTPUT_SCHEMA_HINT,
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
  trialChapterOne:
    '第1章试写返回 {"candidates":[{"title","content","summary","openingStrategy","openingHighlight","firstSentence","first300Summary","endingHook","riskLevel","riskTags":[],"aiRecommendedReason","isAiRecommended":true/false,"scoring":{"totalScore":0-100,"dimensions":[{"key","label","score","weight","evidence","penaltyPoints"}]}}]}',
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
      const record = asRecord(chapter);
      return {
        chapterNo: readOptionalNumber(record, 'chapterNo') ?? index + 1,
        stageIndex: readOptionalNumber(record, 'stageIndex') ?? 1,
        title: readOptionalString(record, 'title') ?? `第${index + 1}章`,
        wordTarget: readOptionalNumber(record, 'wordTarget') ?? 1200,
        goal: readOptionalString(record, 'goal') ?? readOptionalString(record, 'summary') ?? summary,
        conflict: readOptionalString(record, 'conflict') ?? '主角继续反击',
        hook: readOptionalString(record, 'hook') ?? '留下下一章钩子'
      };
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
    statusNote: chapter.statusNote
  };
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
