import { RiskLevel, type ScoringDimensionDTO } from '@ai-shortvideo/shared';
import { DEFAULT_POLICY_PROFILE_VERSION_ID, type FullReviewDraft } from '../domain/novelDomain.js';
import type { NovelProviderActionInputFor } from '../services/actionExecutionPlan.js';

type FullReviewProviderInput = NovelProviderActionInputFor<'novel_full_review'>;

export interface FullReviewProvider {
  generateFullReview(input: FullReviewProviderInput): Promise<FullReviewDraft>;
}

export class MockFullReviewProvider implements FullReviewProvider {
  async generateFullReview(input: FullReviewProviderInput): Promise<FullReviewDraft> {
    const lowScore = input.novel.title.includes('低分全书审稿');
    const videoReadinessFail = input.novel.title.includes('视频化检查失败');
    const totalScore = lowScore ? 66 : 84;
    const gateResult = totalScore >= 80 ? 'pass' : totalScore >= 70 ? 'warning' : 'blocked';
    const issues = createIssues(input, lowScore, videoReadinessFail);

    return {
      totalScore,
      rating: totalScore >= 80 ? 'A' : totalScore >= 70 ? 'B' : 'C',
      gateResult,
      summary: lowScore
        ? '全书结构基本完整，但中段爽点衰减和口播切片风险明显，默认不建议直接完成。'
        : '全书正文完整，主线闭环清楚，章节摘要和审稿记录齐备，可以进入完成确认。',
      strengths: ['主线目标清晰', '章节连续性稳定', '前 1-3 章可作为首条视频基础'],
      problems: lowScore ? ['中段爽点重复', '视频化首条钩子需要谨慎包装'] : ['第 5 章节奏略慢，视频化时建议避开长解释段'],
      suggestions: lowScore ? ['先优化中段重复章节', '如强制继续，需要记录低分风险原因'] : ['确认完成后进行待视频化检查'],
      dimensionScores: createDimensions(totalScore, lowScore),
      issues,
      videoSuggestion: videoReadinessFail ? '当前首条视频建议不足，需要先补强开篇切片。' : '建议先使用第 1-3 章作为首条验证视频，再按阶段拆分后续内容。',
      firstVideoSuggestion: {
        chapterRange: '第 1-3 章',
        openingSlice: videoReadinessFail ? '' : '主角被压迫后第一次反击的连续片段',
        narrationHook: videoReadinessFail ? '' : '所有人都以为他输定了，只有他知道反击刚刚开始。',
        firstScreenSubtitle: videoReadinessFail ? '' : '被全城看不起的那一刻，他拿到了翻盘证据',
        titleHook: videoReadinessFail ? '' : '被逼到绝境后，我反手让他们全员破防',
        endingSuspense: videoReadinessFail ? '' : '证据只公开了一半，真正的幕后人还没出现。',
        suggestedFormat: '旁白音频 + 字幕 + 循环背景视频',
        riskTips: videoReadinessFail ? ['首条视频钩子缺失，不能确认待视频化。'] : ['避免直接展示完整长段正文，只保留摘要和引用快照。']
      },
      platformRisks: videoReadinessFail ? ['首条视频建议缺失'] : ['普通平台风险，可在视频化检查中复核'],
      originalityRisks: lowScore ? ['部分冲突表达同质化'] : ['无明显搬运风险'],
      aiFlavorRisks: lowScore ? ['中段解释性文字偏多'] : ['轻微模板化风险'],
      lowScoreContinueRisks: lowScore ? ['低分强制继续可能导致首条视频验证失败'] : [],
      reviewPolicyVersionId: input.coverageManifest.policyProfileVersionId?.trim()
        || input.novel.policyProfileVersionId?.trim()
        || DEFAULT_POLICY_PROFILE_VERSION_ID
    };
  }
}

function createDimensions(totalScore: number, lowScore: boolean): ScoringDimensionDTO[] {
  const items = [
    ['stage_continuity', '阶段连续性', totalScore],
    ['character_continuity', '人物连续性', totalScore + 2],
    ['timeline_continuity', '时间线连续性', totalScore + 1],
    ['fact_consistency', '事实一致性', totalScore],
    ['foreshadowing', '伏笔回收', totalScore - 2],
    ['evidence_grounding', '证据定位', totalScore - 1]
  ] as const;

  return items.map(([key, label, score]) => ({
    key,
    label,
    score,
    weight: 1 / items.length,
    evidence: `${label}评分 ${score}，基于章节摘要、单章审稿和长篇记忆汇总。`,
    penaltyPoints: Math.max(0, 80 - score)
  }));
}

function createIssues(input: FullReviewProviderInput, lowScore: boolean, videoReadinessFail: boolean) {
  const chapterIds = input.coverageManifest.chapters.map((chapter) => chapter.chapterId);
  const primaryChapterId = chapterIds[Math.min(4, chapterIds.length - 1)]!;
  if (!lowScore && !videoReadinessFail) {
    return [
      {
        issueId: 'full-issue-pace-1',
        title: '第 5 章节奏略慢',
        plainDescription: '这一章解释信息偏多，视频化时建议不要作为首条切片。',
        severity: 'warning' as const,
        scopeType: 'chapter' as const,
        scopeRefs: [primaryChapterId],
        dimension: 'stage_continuity',
        blocking: false,
        recommendedTarget: 'chapter',
        recommendedAction: '如做视频，优先选择第 1-3 章。',
        status: 'open' as const,
        acceptedReason: null
      }
    ];
  }

  return [
    {
      issueId: 'full-issue-appeal-1',
      title: videoReadinessFail ? '首条视频建议缺失' : '中段爽点衰减',
      plainDescription: videoReadinessFail ? `${input.novel.title} 缺少可用首条视频钩子。` : '中段几章的反击方式较重复，读者追更动力可能下降。',
      severity: 'blocking' as const,
      scopeType: 'chapter' as const,
      scopeRefs: [primaryChapterId],
      dimension: videoReadinessFail ? 'evidence_grounding' : 'stage_continuity',
      blocking: true,
      recommendedTarget: videoReadinessFail ? 'full_review' : 'chapter',
      recommendedAction: videoReadinessFail ? '补强首条视频建议后重新检查。' : '优化中段重复章节，或填写原因强制通过。',
      status: 'open' as const,
      acceptedReason: null
    }
  ];
}
