import { ErrorCode } from '@ai-shortvideo/shared';
import { BusinessError } from '../../../shared/errors.js';
import { assertChapterLengthGate } from './chapterLengthPolicy.js';
import type { NovelChapterRecord, TrialFollowupChapterDraft, TrialReviewDraft } from './novelDomain.js';
import type { TrialFollowupChapterProviderDraft } from '../services/actionExecutionPlan.js';

export function bindTrialFollowupChapters(
  chapters: NovelChapterRecord[],
  drafts: TrialFollowupChapterProviderDraft[],
  review: TrialReviewDraft
): TrialFollowupChapterDraft[] {
  const chaptersById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const seenChapterIds = new Set<string>();
  const blocked = review.trialResult === 'blocked';
  const allowsNext = review.trialResult === 'pass' || review.trialResult === 'pass_with_suggestions';
  const failedDrafts = drafts.filter((draft) => draft.hardFailed);
  const failedScores = review.chapterScores.filter((score) => score.hardFailed);
  const failedIndex = blocked && failedDrafts.length === 1
    ? chapters.findIndex((chapter) => chapter.id === failedDrafts[0].chapter.id) : -1;
  const expected = blocked && failedIndex >= 0 ? chapters.slice(0, failedIndex + 1) : chapters;
  const expectedChapterNos = expected.map((chapter) => chapter.chapterNo);
  const scoreChapterNos = review.chapterScores.map((score) => score.chapterNo);
  const scoreChapterSet = new Set(scoreChapterNos);
  const chapterScoresByNo = new Map(review.chapterScores.map((score) => [score.chapterNo, score]));

  if ([review.totalScore, ...review.chapterScores.map((score) => score.score)].some((score) =>
    !Number.isFinite(score) || score < 0 || score > 100)
    || review.totalScore !== Math.round(review.chapterScores.reduce((sum, score) => sum + score.score, 0)
      / review.chapterScores.length)) {
    throw new BusinessError(ErrorCode.ValidationError, '模型试写评分不合法。');
  }
  if (scoreChapterSet.size !== expected.length || scoreChapterNos.length !== expected.length
    || expectedChapterNos.some((chapterNo) => !scoreChapterSet.has(chapterNo))) {
    throw new BusinessError(ErrorCode.ValidationError, '模型试写评分章节集合不完整。');
  }
  if (!['pass', 'pass_with_suggestions', 'return_upstream', 'blocked'].includes(review.trialResult)
    || review.allowNextStep !== allowsNext
    || (blocked && (failedDrafts.length !== 1 || failedScores.length !== 1 || failedIndex < 0
      || failedDrafts[0].chapter.chapterNo !== chapters[failedIndex]?.chapterNo
      || failedScores[0].chapterNo !== chapters[failedIndex]?.chapterNo))
    || (!blocked && (failedDrafts.length > 0 || failedScores.length > 0))) {
    throw new BusinessError(ErrorCode.ValidationError, '模型失败章声明与返回章节不一致。');
  }

  const bound = drafts.map((draft) => {
    const providerChapter = draft.chapter;
    const chapter = chaptersById.get(providerChapter.id);
    if (!chapter || chapter.chapterNo !== providerChapter.chapterNo) {
      throw new BusinessError(ErrorCode.ValidationError, '模型返回了不属于当前试写范围的章节。');
    }
    if (seenChapterIds.has(chapter.id)) {
      throw new BusinessError(ErrorCode.ValidationError, '模型重复返回了同一试写章节。');
    }
    if (draft.featureCard.chapterId !== chapter.id) {
      throw new BusinessError(ErrorCode.ValidationError, '模型返回的章节特性卡与试写章节不一致。');
    }
    assertChapterLengthGate(draft.content, chapter.wordTarget);
    const chapterScore = chapterScoresByNo.get(providerChapter.chapterNo);
    if (!chapterScore || chapterScore.score !== draft.scoring.totalScore
      || draft.scoring.totalScore !== draft.review.totalScore
      || chapterScore.hardFailed !== draft.hardFailed
      || draft.scoring.hardFailure !== draft.hardFailed
      || (typeof draft.review.metadata.hardFailed === 'boolean'
        && draft.review.metadata.hardFailed !== draft.hardFailed)) {
      throw new BusinessError(ErrorCode.ValidationError, '模型试写章节评分或硬失败标记不一致。');
    }
    seenChapterIds.add(chapter.id);
    return constructTrialFollowupChapterDraft(chapter, draft);
  });
  if (bound.length !== expected.length || expected.some((chapter) => !seenChapterIds.has(chapter.id))) {
    throw new BusinessError(ErrorCode.ValidationError, '模型未完整返回当前试写范围章节。');
  }
  return bound;
}

export function constructTrialFollowupChapterDraft(
  chapter: NovelChapterRecord,
  draft: TrialFollowupChapterProviderDraft
): TrialFollowupChapterDraft {
  const score = draft.scoring.totalScore;
  const reviewScore = draft.review.totalScore;
  const reviewHardFailed = draft.review.metadata.hardFailed;
  const scoringReasons = draft.scoring.hardFailureReasons;
  const subScores = Object.values(draft.review.subScores);
  if (!Number.isFinite(score) || score < 0 || score > 100
    || typeof reviewScore !== 'number' || !Number.isFinite(reviewScore) || reviewScore < 0 || reviewScore > 100
    || score !== reviewScore
    || draft.scoring.dimensions.some((dimension) => !Number.isFinite(dimension.score)
      || dimension.score < 0 || dimension.score > 100)
    || subScores.some((subScore) => typeof subScore === 'number'
      && (!Number.isFinite(subScore) || subScore < 0 || subScore > 100))
    || draft.scoring.scoringStrategyVersion !== draft.review.metadata.scoringStrategyVersion
    || draft.review.subScores.scoringStrategyVersion !== draft.scoring.scoringStrategyVersion) {
    throw new BusinessError(ErrorCode.ValidationError, '模型章节评分不一致。');
  }
  if (draft.hardFailed !== draft.scoring.hardFailure
    || (typeof reviewHardFailed === 'boolean' && reviewHardFailed !== draft.hardFailed)
    || !['pass', 'warning', 'hard_fail'].includes(draft.scoring.gateResult)
    || (draft.scoring.gateResult === 'hard_fail') !== draft.hardFailed
    || draft.review.allowNextStep === draft.hardFailed
    || (draft.hardFailureReasons.length > 0) !== draft.hardFailed
    || draft.hardFailureReasons.length !== scoringReasons.length
    || draft.hardFailureReasons.some((reason, index) => reason !== scoringReasons[index])) {
    throw new BusinessError(ErrorCode.ValidationError, '模型章节硬失败语义不一致。');
  }
  return {
    chapter,
    content: draft.content,
    summary: draft.summary,
    openingStrategy: draft.openingStrategy,
    openingHighlight: draft.openingHighlight,
    firstSentence: draft.firstSentence,
    first300Summary: draft.first300Summary,
    endingHook: draft.endingHook,
    riskLevel: draft.riskLevel,
    riskTags: [...draft.riskTags],
    aiRecommendedReason: draft.aiRecommendedReason,
    scoring: draft.scoring,
    featureCard: {
      chapterId: chapter.id,
      oneLineSummary: draft.featureCard.oneLineSummary,
      coreTask: draft.featureCard.coreTask,
      mainConflict: draft.featureCard.mainConflict,
      appealPoint: draft.featureCard.appealPoint,
      emotionKeywords: [...draft.featureCard.emotionKeywords],
      characterChanges: [...draft.featureCard.characterChanges],
      relationshipChanges: [...draft.featureCard.relationshipChanges],
      keyInformation: [...draft.featureCard.keyInformation],
      foreshadowingOperation: draft.featureCard.foreshadowingOperation,
      endingHook: draft.featureCard.endingHook,
      factsCannotChange: [...draft.featureCard.factsCannotChange],
      featuresToStrengthen: [...draft.featureCard.featuresToStrengthen],
      metadata: {
        scoringStrategyVersion: draft.featureCard.metadata.scoringStrategyVersion,
        hardFailed: draft.featureCard.metadata.hardFailed,
        summary: draft.featureCard.metadata.summary
      }
    },
    review: {
      reviewLevel: draft.review.reviewLevel,
      totalScore: draft.review.totalScore,
      subScores: { ...draft.review.subScores },
      rating: draft.review.rating,
      summary: draft.review.summary,
      strengths: [...draft.review.strengths],
      problems: [...draft.review.problems],
      suggestions: [...draft.review.suggestions],
      issueCards: draft.review.issueCards.map((issue) => ({ ...issue })),
      actionOptions: [...draft.review.actionOptions],
      recommendedAction: draft.review.recommendedAction,
      allowNextStep: draft.review.allowNextStep,
      blockingIssueCount: draft.review.blockingIssueCount,
      resolvedStatus: draft.review.resolvedStatus,
      promptTemplateVersionId: draft.review.promptTemplateVersionId,
      policyProfileVersionId: draft.review.policyProfileVersionId,
      metadata: {
        scoringStrategyVersion: draft.review.metadata.scoringStrategyVersion,
        hardFailed: draft.review.metadata.hardFailed,
        summary: draft.review.metadata.summary
      }
    },
    hardFailed: draft.hardFailed,
    hardFailureReasons: [...draft.hardFailureReasons]
  };
}
