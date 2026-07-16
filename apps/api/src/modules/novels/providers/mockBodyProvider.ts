import { RiskLevel, type ChapterSummaryCompareDTO, type QualityScoringDTO } from '@ai-shortvideo/shared';
import type { ImpactAssessmentDraft } from '../domain/novelDomain.js';
import type {
  BodyChapterProviderDraft,
  ChapterContentProviderInputV1,
  ChapterProviderInputV1,
  NovelProviderActionInputFor,
  NovelProviderInputV1
} from '../services/actionExecutionPlan.js';

type BodyGenerateInput = NovelProviderActionInputFor<'body_batch_generate' | 'chapter_body_generate'>;
type BodyRewriteInput = NovelProviderActionInputFor<'chapter_rewrite'>;
type BodyImpactInput = NovelProviderActionInputFor<'chapter_impact_assess' | 'chapter_adopt_impact_assess'>;

export interface BodyProvider {
  generateBodyChapter(input: BodyGenerateInput): Promise<BodyChapterProviderDraft>;
  rewriteChapter(input: BodyRewriteInput): Promise<{
    candidate: BodyChapterProviderDraft;
    summaryCompare: ChapterSummaryCompareDTO;
  }>;
  assessImpact(input: BodyImpactInput): Promise<ImpactAssessmentDraft>;
}

const BODY_SCORE_VERSION = 'body-chapter-score-v1';

export class MockBodyProvider implements BodyProvider {
  async generateBodyChapter(input: BodyGenerateInput): Promise<BodyChapterProviderDraft> {
    const hardFailed = input.novel.title.includes('批量正文暂停') && input.chapter.chapterNo === 6;
    const ordinaryRisk = !hardFailed && (input.chapter.chapterNo === 5 || input.chapter.chapterNo === 9);
    const score = hardFailed ? 56 : ordinaryRisk ? 66 : input.enhancedReview ? 82 : 84;
    const summary = hardFailed
      ? `第${input.chapter.chapterNo}章与既有策略冲突，主线连续性和人物一致性低于硬门槛。`
      : `第${input.chapter.chapterNo}章承接前文线索，推进${input.chapter.title}，并留下下一章可追踪钩子。`;

    return createBodyDraft({
      novel: input.novel,
      chapter: input.chapter,
      content: createBodyContent(input.novel, input.chapter, input.previousContent, ordinaryRisk, hardFailed),
      summary,
      score,
      riskLevel: hardFailed ? RiskLevel.Blocking : ordinaryRisk ? RiskLevel.Medium : RiskLevel.Low,
      riskTags: hardFailed ? ['硬失败', '主线连续性不足'] : ordinaryRisk ? ['普通风险', '节奏偏慢'] : ['连续性稳定'],
      hardFailed,
      hardFailureReasons: hardFailed ? ['综合分低于 60', '主线连续性低于 60', '人物一致性低于 60'] : [],
      memoryPrefix: input.previousMemory?.previousSummary ?? '前三章试写事实已确认'
    });
  }

  async rewriteChapter(input: BodyRewriteInput) {
    const changesLater = /影响后续|旧码头|关键事实|伏笔/.test(input.instruction);
    const score = changesLater ? 86 : 84;
    const candidate = createBodyDraft({
      novel: input.novel,
      chapter: input.chapter,
      content: `${input.currentContent.content}\n\n【改稿补强】${input.instruction || '强化本章反击和结尾钩子'}。主角在结尾主动留下反制证据，让下一章的追击更清晰。`,
      summary: `候选改稿强化${input.chapter.title}的结尾钩子和反击证据。`,
      score,
      riskLevel: changesLater ? RiskLevel.Medium : RiskLevel.Low,
      riskTags: changesLater ? ['可能影响后续线索', '需要影响评估'] : ['表达增强'],
      hardFailed: false,
      hardFailureReasons: [],
      memoryPrefix: '基于当前正式正文生成候选改稿'
    });
    const summaryCompare: ChapterSummaryCompareDTO = {
      currentSummary: input.currentContent.summary ?? `${input.chapter.title}当前正文推进主线。`,
      candidateSummary: candidate.summary,
      benefit: '候选版本加强了结尾反击动作和短视频口播钩子。',
      newRisks: changesLater ? ['改动旧码头线索，可能影响后续章节承接。'] : ['需复审表达是否过度强化。'],
      possibleImpact: changesLater ? '可能影响后续章节的旧码头线索、伏笔兑现和长篇记忆。' : '主要影响本章表达，预计不破坏后续章节。',
      aiSuggestion: changesLater ? '推荐采用后先完成影响评估，再继续下一批正文。' : '可采用，采用后仍需同步摘要和记忆。'
    };

    return { candidate, summaryCompare };
  }

  async assessImpact(input: BodyImpactInput): Promise<ImpactAssessmentDraft> {
    const text = `${input.instruction ?? ''} ${input.newContent.summary ?? ''} ${input.newContent.content.slice(-300)}`;
    const severe = /清空后续|推翻主线|严重影响|严重内容安全/.test(text);
    const medium = severe || /影响后续|旧码头|关键事实|伏笔/.test(text);
    const impactLevel = severe ? 'severe' : medium ? 'medium' : 'minor';
    const affectedChapterIds = medium ? [`after_${input.chapter.chapterNo}`] : [];

    return {
      impactLevel,
      summary:
        impactLevel === 'severe'
          ? '当前章改动会破坏后续主线，需要选择清空后续、逐章处理或回改当前候选。'
          : impactLevel === 'medium'
            ? '当前章改动会影响后续章节承接，关闭影响前不能进入正式全书审稿。'
            : '当前章改动只影响表达和摘要，系统可同步记忆后继续。',
      changedFacts: medium ? ['旧码头线索的触发方式发生变化'] : ['表达和节奏增强'],
      affectedChapterIds,
      affectedVideoReferenceIds: [],
      recommendedHandling: impactLevel === 'minor' ? '自动同步摘要和长篇记忆' : '逐章确认受影响章节，必要时生成调整候选',
      suggestedActions:
        impactLevel === 'severe'
          ? ['清空当前章之后的正文', '逐章处理受影响章节', '返回修改当前候选版本']
          : impactLevel === 'medium'
            ? ['生成调整方案', '逐章处理', '手动确认无影响']
            : ['同步摘要和长篇记忆'],
      blocksFullReview: impactLevel === 'medium' || impactLevel === 'severe'
    };
  }
}

function createBodyDraft(input: {
  novel: NovelProviderInputV1;
  chapter: ChapterProviderInputV1;
  content: string;
  summary: string;
  score: number;
  riskLevel: RiskLevel;
  riskTags: string[];
  hardFailed: boolean;
  hardFailureReasons: string[];
  memoryPrefix: string;
}): BodyChapterProviderDraft {
  const scoring = createScoring(input.score, input.hardFailed);

  return {
    chapter: { id: input.chapter.id, chapterNo: input.chapter.chapterNo },
    content: input.content,
    summary: input.summary,
    openingStrategy: '承接上一章钩子，先回收事实，再推进本章目标。',
    openingHighlight: '开头一句话说明上一章留下的压力，并快速转入本章动作。',
    firstSentence: firstSentence(input.content),
    first300Summary: input.content.slice(0, 300),
    endingHook: '结尾留下下一章必须处理的新证据和追击压力。',
    riskLevel: input.riskLevel,
    riskTags: input.riskTags,
    aiRecommendedReason: input.hardFailed ? '不建议继续生成，需要先进入章节详情处理。' : '可作为当前正文继续推进，并保留审稿记录。',
    scoring,
    featureCard: {
      chapterId: input.chapter.id,
      oneLineSummary: input.summary,
      coreTask: `完成${input.chapter.title}的正文推进`,
      mainConflict: '主角围绕证据线与对手展开正面攻防',
      appealPoint: '压迫后反击，结尾留钩子',
      emotionKeywords: ['压迫', '反击', '悬念'],
      characterChanges: ['主角更主动地掌握证据节奏'],
      relationshipChanges: ['潜在盟友对主角信任增强'],
      keyInformation: ['旧码头线索', `第${input.chapter.chapterNo}章新增证据`],
      foreshadowingOperation: '保留下一章追击和封口压力',
      endingHook: '对手抢先封锁新证据',
      factsCannotChange: ['前三章试写确认的主角能力边界', '母亲公司旧案真实存在'],
      featuresToStrengthen: ['连续性复审', '人物一致性复审'],
      metadata: {}
    },
    review: {
      reviewLevel: 'chapter',
      totalScore: input.score,
      subScores: {
        scoringStrategyVersion: BODY_SCORE_VERSION
      },
      rating: input.hardFailed ? 'blocked' : input.score < 70 ? 'warning' : 'pass',
      summary: input.summary,
      strengths: input.hardFailed ? ['失败前已保留上游章节'] : ['主线承接清楚', '结尾钩子可继续'],
      problems: input.hardFailed ? input.hardFailureReasons : input.score < 70 ? ['节奏偏慢，普通风险需纳入批次总结'] : ['局部表达可继续打磨'],
      suggestions: input.hardFailed ? ['进入章节详情生成重写候选'] : ['下一批继续沿用本章事实和长篇记忆'],
      issueCards: [
        {
          severity: input.hardFailed ? 'blocking' : input.score < 70 ? 'warning' : 'info',
          dimension: input.hardFailed ? 'quality_gate' : 'continuity',
          message: input.hardFailed ? '硬失败章节不能继续作为后续上下文。' : '章节可继续，风险已记录。',
          suggestion: input.hardFailed ? '处理本章后再继续批量正文。' : '后续批次继续关注节奏和人物一致性。'
        }
      ],
      actionOptions: input.hardFailed ? ['rewrite_chapter'] : ['continue_batch', 'optimize_later'],
      recommendedAction: input.hardFailed ? '进入章节详情处理' : '继续下一章',
      allowNextStep: !input.hardFailed,
      blockingIssueCount: input.hardFailed ? 1 : 0,
      resolvedStatus: input.hardFailed ? 'open' : 'resolved',
      promptTemplateVersionId: null,
      policyProfileVersionId: input.novel.policyProfileVersionId,
      metadata: {
        scoringStrategyVersion: BODY_SCORE_VERSION,
        hardFailed: input.hardFailed
      }
    },
    memory: {
      previousSummary: `${input.memoryPrefix}；第${input.chapter.chapterNo}章新增：${input.summary}`,
      characterStates: ['主角保持主动取证状态'],
      relationshipStates: ['盟友信任度上升'],
      locations: ['旧码头仓库'],
      organizations: ['母亲旧公司'],
      items: [`第${input.chapter.chapterNo}章证据`],
      plantedForeshadowing: ['对手封口动作'],
      resolvedForeshadowing: [],
      unresolvedConflicts: ['幕后人身份仍未完全公开'],
      newSettings: [],
      factsCannotContradict: ['主角不能使用万能能力', '旧码头线索是连续主线'],
      metadata: {
        summary: input.summary
      }
    },
    hardFailed: input.hardFailed,
    hardFailureReasons: input.hardFailureReasons
  };
}

function createBodyContent(
  novel: NovelProviderInputV1,
  chapter: ChapterProviderInputV1,
  previousContent: ChapterContentProviderInputV1 | null,
  ordinaryRisk: boolean,
  hardFailed: boolean
) {
  const previousHook = previousContent?.summary ?? '前三章试写留下的旧码头线索';
  const paragraphs = [
    `《${novel.title}》${chapter.title}开始时，主角没有急着宣告胜利，而是把${previousHook}重新摊在桌上。她知道对手真正害怕的不是一份证据，而是证据被所有人看见的那一刻。`,
    `她沿着旧码头仓库的记录往下查，发现封口的人并不是临时起意。每一个签名、每一笔异常转账，都像提前埋好的钉子，等着她只要走错一步就被反咬。`,
    `对手很快递来新的条件：只要她放弃追查，就能拿回表面上的体面。她看着那份条件，反而确认了方向。真正的弱点已经暴露，对方越急，越说明旧案里还有更深的账。`,
    `她没有选择退让，而是把证据分成三份，一份交给律师，一份交给曾经被压下去的老员工，最后一份只留下编号。她要让对手知道，封住她一个人已经没用。`,
    `夜色压到旧码头时，陌生号码再次响起：你找到的只是第一层。仓库后门的监控今晚会被清空。她抬头看向远处亮起的车灯，终于明白，下一章的追击已经开始。`
  ];

  if (ordinaryRisk) {
    paragraphs.splice(2, 0, '这一段解释略多，节奏比推荐策略慢一些，但没有破坏主线连续性，因此作为普通风险进入批次总结。');
  }
  if (hardFailed) {
    paragraphs.splice(1, 1, '本章突然让主角放弃旧码头线索，转而追查无关支线，导致策略快照中的主线承接被破坏。');
  }

  return paragraphs.join('\n\n');
}

function createScoring(score: number, hardFailed: boolean): QualityScoringDTO {
  const dimensions = [
    { key: 'overall', label: '综合质量', weight: 0.24, score },
    { key: 'continuity', label: '主线连续性', weight: 0.22, score: hardFailed ? 55 : Math.min(92, score + 2) },
    { key: 'character', label: '人物一致性', weight: 0.2, score: hardFailed ? 54 : Math.min(90, score + 1) },
    { key: 'rhythm', label: '节奏爽点', weight: 0.18, score: score < 70 ? 66 : Math.min(90, score) },
    { key: 'safety', label: '风险控制', weight: 0.16, score: hardFailed ? 62 : 86 }
  ].map((dimension) => ({
    ...dimension,
    evidence: `${dimension.label}已在章节正文和审稿摘要中留有证据。`,
    penaltyPoints: Math.max(0, 80 - dimension.score)
  }));

  return {
    scoringStrategyVersion: BODY_SCORE_VERSION,
    totalScore: score,
    gateResult: hardFailed ? 'hard_fail' : score < 70 ? 'warning' : 'pass',
    gateResultText: hardFailed ? '硬门槛未通过' : score < 70 ? '普通风险' : '通过',
    dimensions,
    weights: Object.fromEntries(dimensions.map((dimension) => [dimension.key, dimension.weight])),
    evidence: dimensions.map((dimension) => dimension.evidence),
    penalties: dimensions.filter((dimension) => dimension.penaltyPoints > 0).map((dimension) => `${dimension.label}扣 ${dimension.penaltyPoints} 分`),
    hardFailure: hardFailed,
    hardFailureReasons: hardFailed ? ['综合分低于 60', '主线连续性低于 60', '人物一致性低于 60'] : []
  };
}

function firstSentence(content: string) {
  return content.split(/[。！？]/)[0] ? `${content.split(/[。！？]/)[0]}。` : content.slice(0, 80);
}
