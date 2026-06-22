import { RiskLevel, type QualityScoringDTO } from '@ai-shortvideo/shared';
import type {
  ChapterFeatureCardRecord,
  NovelChapterRecord,
  NovelPreferencesRecord,
  NovelRecord,
  ReviewReportRecord,
  TrialChapterCandidateDraft,
  TrialFollowupChapterDraft,
  TrialReviewDraft
} from '../domain/novelDomain.js';

export interface TrialProvider {
  generateChapterOneCandidates(input: {
    novel: NovelRecord;
    preferences: NovelPreferencesRecord;
    chapters: NovelChapterRecord[];
    chapterCount: number;
  }): Promise<TrialChapterCandidateDraft[]>;
  generateFollowup(input: {
    novel: NovelRecord;
    selectedCandidate: TrialChapterCandidateDraftLike;
    chapters: NovelChapterRecord[];
  }): Promise<{
    chapters: TrialFollowupChapterDraft[];
    review: TrialReviewDraft;
  }>;
}

export interface TrialChapterCandidateDraftLike {
  id: string;
  content: string;
  summary: string | null;
  reviewScore: number | null;
  metadata: unknown;
}

const OPENING_SCORE_VERSION = 'trial-opening-score-v1';
const CHAPTER_SCORE_VERSION = 'trial-chapter-score-v1';

export class MockTrialProvider implements TrialProvider {
  async generateChapterOneCandidates(input: {
    novel: NovelRecord;
    preferences: NovelPreferencesRecord;
    chapters: NovelChapterRecord[];
    chapterCount: number;
  }) {
    const chapter = input.chapters[0];
    const requestedCount = Math.max(2, Math.min(5, input.chapterCount || 3));
    const scores = requestedCount === 2 ? [86, 72] : requestedCount === 5 ? [88, 82, 73, 68, 79] : [88, 74, 82];

    return scores.map((score, index) => {
      const variant = index + 1;
      const riskTags = score < 75 ? ['开篇节奏有风险', '人物代入需要加强'] : ['节奏稳定', '钩子清晰'];
      const content = createChapterBody(input.novel.title, chapter, variant, score);
      const scoring = createScoring({
        score,
        version: OPENING_SCORE_VERSION,
        hardFailure: false,
        evidencePrefix: `第1章候选${variant}`
      });

      return {
        chapterId: chapter.id,
        chapterNo: chapter.chapterNo,
        title: chapter.title,
        content,
        summary: `候选${variant}围绕${chapter.title}展开，强调低谷压迫、首次反击和结尾线索。`,
        openingStrategy: variant === 1 ? '强压迫开场，三段内给出反击线索' : variant === 2 ? '先人物情绪，再给外部危机' : '悬念短信切入，快速转入对抗',
        openingHighlight: variant === 1 ? '第一屏直接展示失控局面和主角忍耐边界。' : variant === 2 ? '人物内心更细，但进入爽点稍慢。' : '钩子更早出现，短视频口播开头更清晰。',
        firstSentence: firstSentence(content),
        first300Summary: content.slice(0, 300),
        endingHook: '陌生短信指向旧码头仓库，暗示母亲公司旧案还有关键证据。',
        riskLevel: score < 75 ? RiskLevel.Medium : RiskLevel.Low,
        riskTags,
        aiRecommendedReason: score >= 85 ? '综合分最高，压迫、反击和结尾钩子更均衡。' : score < 75 ? '有差异化表达，但节奏和人物一致性需要谨慎确认。' : '可作为备选，节奏稳但爆点略弱。',
        isAiRecommended: score === Math.max(...scores),
        scoring
      } satisfies TrialChapterCandidateDraft;
    });
  }

  async generateFollowup(input: {
    novel: NovelRecord;
    selectedCandidate: TrialChapterCandidateDraftLike;
    chapters: NovelChapterRecord[];
  }) {
    const selectedScore = input.selectedCandidate.reviewScore ?? 80;
    const hardFail = input.novel.title.includes('硬失败');
    const riskyRun = selectedScore < 75 || input.novel.title.includes('风险继续');
    const followup: TrialFollowupChapterDraft[] = [];

    const chapterOne = input.chapters[0];
    followup.push(createFollowupChapter({
      novel: input.novel,
      chapter: chapterOne,
      chapterNo: 1,
      score: selectedScore,
      content: input.selectedCandidate.content,
      summary: input.selectedCandidate.summary ?? '第1章试写候选已选中，进入连续试写。',
      hardFailureReasons: []
    }));

    const chapterTwo = input.chapters[1];
    const chapterTwoScore = hardFail ? 58 : riskyRun ? 72 : 84;
    followup.push(createFollowupChapter({
      novel: input.novel,
      chapter: chapterTwo,
      chapterNo: 2,
      score: chapterTwoScore,
      content: createChapterBody(input.novel.title, chapterTwo, 2, chapterTwoScore),
      summary: hardFail ? '第2章承接第1章不足，主线连续性和人物一致性低于硬门槛。' : '第2章承接第1章证据线，推动第一次公开反击。',
      hardFailureReasons: hardFail ? ['综合分低于硬门槛', '承接第1章不足', '主线连续性不足', '人物一致性不足'] : []
    }));

    if (!hardFail) {
      const chapterThree = input.chapters[2];
      const chapterThreeScore = riskyRun ? 76 : 83;
      followup.push(createFollowupChapter({
        novel: input.novel,
        chapter: chapterThree,
        chapterNo: 3,
        score: chapterThreeScore,
        content: createChapterBody(input.novel.title, chapterThree, 3, chapterThreeScore),
        summary: '第3章完成第一次阶段反击，并把旧码头线索延展到新的对手。',
        hardFailureReasons: []
      }));
    }

    const review = createTrialReview(followup, { hardFail, riskyRun });

    return { chapters: followup, review };
  }
}

function createFollowupChapter(input: {
  novel: NovelRecord;
  chapter: NovelChapterRecord;
  chapterNo: number;
  score: number;
  content: string;
  summary: string;
  hardFailureReasons: string[];
}): TrialFollowupChapterDraft {
  const hardFailed = input.hardFailureReasons.length > 0;
  const scoring = createScoring({
    score: input.score,
    version: CHAPTER_SCORE_VERSION,
    hardFailure: hardFailed,
    evidencePrefix: `第${input.chapterNo}章`
  });
  const featureCard = createFeatureCardDraft(input.chapter, input.summary);
  const review = createReviewDraft({
    score: input.score,
    hardFailed,
    hardFailureReasons: input.hardFailureReasons,
    summary: input.summary
  });

  return {
    chapter: input.chapter,
    content: input.content,
    summary: input.summary,
    openingStrategy: input.chapterNo === 1 ? '沿用用户选择的第1章开篇策略' : '承接前章事实，控制新增设定数量',
    openingHighlight: input.chapterNo === 1 ? '已选开篇版本作为连续试写基准。' : '先回收上一章钩子，再推进新的反击目标。',
    firstSentence: firstSentence(input.content),
    first300Summary: input.content.slice(0, 300),
    endingHook: input.chapterNo === 2 ? '对手发现旧码头线索被触发，派人抢先封口。' : '第一轮反击成功，但真正幕后人露出身份尾巴。',
    riskLevel: input.score < 75 ? RiskLevel.Medium : RiskLevel.Low,
    riskTags: input.score < 75 ? ['连续性风险', '节奏风险'] : ['连续性稳定'],
    aiRecommendedReason: hardFailed ? '该章不建议继续，需要回到上游或重写第2章。' : '章节连续性和爽点兑现基本达标。',
    scoring,
    featureCard,
    review,
    hardFailed,
    hardFailureReasons: input.hardFailureReasons
  };
}

function createTrialReview(chapters: TrialFollowupChapterDraft[], flags: { hardFail: boolean; riskyRun: boolean }): TrialReviewDraft {
  const totalScore = Math.round(chapters.reduce((sum, item) => sum + item.scoring.totalScore, 0) / chapters.length);
  if (flags.hardFail) {
    return {
      totalScore,
      trialResult: 'blocked',
      summary: '第2章硬门槛未通过，暂停试写，不能继续生成第3章。',
      strengths: ['第1章开篇钩子可以保留'],
      problems: ['第2章承接第1章不足', '主线连续性和人物一致性低于硬门槛'],
      suggestions: ['回到章节目录或第2章生成策略，重新生成第2章'],
      recommendedAction: '返回上游调整第2章承接',
      allowNextStep: false,
      requiresRiskConfirmation: false,
      chapterScores: chapters.map(toChapterScore)
    };
  }

  if (flags.riskyRun || totalScore < 80) {
    return {
      totalScore,
      trialResult: 'pass_with_suggestions',
      summary: '前三章可以继续，但存在节奏和人物代入风险，进入后续正文前需要用户确认。',
      strengths: ['差异化表达明显', '结尾钩子可延展'],
      problems: ['第1章节奏略慢', '第2-3章需要加强人物一致性复审'],
      suggestions: ['后续批量正文继承更强节奏约束', '加强连续性和人物一致性复审'],
      recommendedAction: '确认风险后生成正文策略快照',
      allowNextStep: true,
      requiresRiskConfirmation: true,
      chapterScores: chapters.map(toChapterScore)
    };
  }

  return {
    totalScore,
    trialResult: 'pass',
    summary: '前三章试写通过，开篇压迫、反击和连续性均达到批量正文前置要求。',
    strengths: ['开篇压迫足', '主线连续清楚', '结尾钩子可持续'],
    problems: ['中段仍需避免反派压迫重复'],
    suggestions: ['批量正文阶段保持每章钩子和复审规则'],
    recommendedAction: '生成正文策略快照',
    allowNextStep: true,
    requiresRiskConfirmation: false,
    chapterScores: chapters.map(toChapterScore)
  };
}

function createScoring(input: {
  score: number;
  version: string;
  hardFailure: boolean;
  evidencePrefix: string;
}): QualityScoringDTO {
  const dimensions = [
    { key: 'opening_hook', label: '开篇钩子', weight: 0.22, delta: 2 },
    { key: 'continuity', label: '连续性', weight: 0.2, delta: input.hardFailure ? -18 : 0 },
    { key: 'character', label: '人物一致性', weight: 0.18, delta: input.hardFailure ? -14 : -1 },
    { key: 'mainline', label: '主线推进', weight: 0.16, delta: input.hardFailure ? -13 : 1 },
    { key: 'emotion', label: '情绪张力', weight: 0.14, delta: input.score < 75 ? -6 : 1 },
    { key: 'risk_control', label: '风险控制', weight: 0.1, delta: input.score < 75 ? -5 : 0 }
  ].map((dimension) => ({
    key: dimension.key,
    label: dimension.label,
    score: Math.max(50, Math.min(95, input.score + dimension.delta)),
    weight: dimension.weight,
    evidence: `${input.evidencePrefix}${dimension.label}有可检查证据。`,
    penaltyPoints: Math.max(0, -dimension.delta)
  }));
  const gateResult = input.hardFailure ? 'hard_fail' : input.score < 78 ? 'warning' : 'pass';

  return {
    scoringStrategyVersion: input.version,
    totalScore: input.score,
    gateResult,
    gateResultText: gateResult === 'hard_fail' ? '硬门槛未通过' : gateResult === 'warning' ? '有风险，需确认' : '通过',
    dimensions,
    weights: Object.fromEntries(dimensions.map((dimension) => [dimension.key, dimension.weight])),
    evidence: dimensions.map((dimension) => dimension.evidence),
    penalties: dimensions.filter((dimension) => dimension.penaltyPoints > 0).map((dimension) => `${dimension.label}扣 ${dimension.penaltyPoints} 分`),
    hardFailure: input.hardFailure,
    hardFailureReasons: input.hardFailure ? ['综合分低于硬门槛', '承接第1章不足', '主线连续性不足', '人物一致性不足'] : []
  };
}

function createFeatureCardDraft(chapter: NovelChapterRecord, summary: string): TrialFollowupChapterDraft['featureCard'] {
  return {
    chapterId: chapter.id,
    oneLineSummary: summary,
    coreTask: `完成${chapter.title}的主线推进`,
    mainConflict: '主角围绕旧线索与对手正面交锋',
    appealPoint: '压迫后反击，保留短视频口播钩子',
    emotionKeywords: ['压迫', '反击', '悬念'],
    characterChanges: ['主角从被动承受到主动验证线索'],
    relationshipChanges: ['主角与潜在盟友建立初步信任'],
    keyInformation: ['旧码头线索', '母亲公司旧案', '对手封口动作'],
    foreshadowingOperation: '保留旧码头仓库作为后续连续钩子',
    endingHook: '真正幕后人开始露出尾巴',
    factsCannotChange: ['母亲公司线索真实存在', '主角没有万能能力'],
    featuresToStrengthen: ['每章结尾钩子', '人物一致性复审'],
    metadata: {}
  };
}

function createReviewDraft(input: {
  score: number;
  hardFailed: boolean;
  hardFailureReasons: string[];
  summary: string;
}): TrialFollowupChapterDraft['review'] {
  const issueSeverity = input.hardFailed ? 'blocking' : input.score < 75 ? 'warning' : 'info';

  return {
    reviewLevel: 'chapter',
    totalScore: input.score,
    subScores: {
      scoringStrategyVersion: CHAPTER_SCORE_VERSION
    },
    rating: input.hardFailed ? 'blocked' : input.score < 75 ? 'warning' : 'pass',
    summary: input.summary,
    strengths: ['开篇目标明确', '结尾保留后续钩子'],
    problems: input.hardFailed ? input.hardFailureReasons : input.score < 75 ? ['节奏略慢，需要加强承接'] : ['局部表达可继续打磨'],
    suggestions: input.hardFailed ? ['暂停后续生成，优先重写第2章'] : ['后续生成继承当前事实源并加强连续性'],
    issueCards: [
      {
        severity: issueSeverity,
        dimension: input.hardFailed ? 'continuity' : 'rhythm',
        message: input.hardFailed ? '章节硬门槛未通过，不能继续向后生成。' : '章节可继续，但需要在后续复审关注节奏。',
        suggestion: input.hardFailed ? '重新生成或回到章节目录调整。' : '批量正文阶段加强节奏和人物一致性检查。'
      }
    ],
    actionOptions: ['continue_review', 'optimize_chapter'],
    recommendedAction: input.hardFailed ? '暂停并调整第2章' : '纳入试写总评',
    allowNextStep: !input.hardFailed,
    blockingIssueCount: input.hardFailed ? 1 : 0,
    resolvedStatus: 'open',
    promptTemplateVersionId: null,
    policyProfileVersionId: null,
    metadata: {
      scoringStrategyVersion: CHAPTER_SCORE_VERSION
    }
  };
}

function createChapterBody(novelTitle: string, chapter: NovelChapterRecord, variant: number, score: number) {
  const paragraphs = [
    `《${novelTitle}》${chapter.title}开场，会议室的灯白得刺眼。主角站在人群最前面，所有人的目光都在等她低头，前夫阵营把协议推到她面前，仿佛只要她签字，过去所有委屈就能被一句“到此为止”轻轻抹掉。`,
    `她没有立刻反驳，而是把母亲留下的旧文件夹按在掌心。系统提示只给出一行冷静建议：先确认对手最怕被公开的证据。她抬头看向主位，第一次没有躲开那些轻蔑的眼神。`,
    `协议落笔的瞬间，律师刚要收走文件，她却拿出一份授权书。纸页边角已经泛黄，印章却清清楚楚。会议室里的笑声停了，前夫脸色骤变，因为那正是他们想彻底掩埋的母亲公司旧案入口。`,
    `她没有把话说满，只把授权书拍在桌面上：“既然要算清楚，那就从这家公司开始。”门外传来急促脚步声，对手的人显然也收到消息，想在她开口前把证据带走。`,
    `手机忽然震动，一条陌生短信跳出来：今晚八点，旧码头仓库。如果你还想知道你母亲当年留下了什么，一个人来。她合上文件夹，终于明白，今天的离婚只是第一扇门，真正的反击才刚刚开始。`
  ];

  if (variant === 2 || score < 75) {
    paragraphs.splice(1, 0, '她短暂想起母亲临终前的话，情绪几乎压过理智。这个版本人物情绪更细，但反击动作出现稍晚，因此需要后续确认节奏风险。');
  }

  return paragraphs.join('\n\n');
}

function firstSentence(content: string) {
  return content.split(/[。！？]/)[0] ? `${content.split(/[。！？]/)[0]}。` : content.slice(0, 80);
}

function toChapterScore(chapter: TrialFollowupChapterDraft) {
  return {
    chapterNo: chapter.chapter.chapterNo,
    score: chapter.scoring.totalScore,
    hardFailed: chapter.hardFailed
  };
}
