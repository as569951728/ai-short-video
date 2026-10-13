import { assertChapterLengthGate, evaluateChapterLength } from './chapterLengthPolicy.js';
import { constructTrialFollowupChapterDraft } from './trialFollowupBinding.js';
import type { BodyChapterDraft, NovelChapterRecord } from './novelDomain.js';
import type { BodyChapterProviderDraft } from '../services/actionExecutionPlan.js';
import { BusinessError } from '../../../shared/errors.js';
import { ErrorCode } from '@ai-shortvideo/shared';

export function bindGeneratedBodyChapter(
  chapter: NovelChapterRecord,
  draft: BodyChapterProviderDraft,
  allowHardFailedLengthViolation = false
): BodyChapterDraft {
  const providerChapter = draft.chapter;
  if (providerChapter.id !== chapter.id || providerChapter.chapterNo !== chapter.chapterNo) {
    throw new BusinessError(ErrorCode.ValidationError, '模型返回的章节标识与请求章节不一致。');
  }
  if (draft.featureCard.chapterId !== chapter.id) {
    throw new BusinessError(ErrorCode.ValidationError, '模型返回的章节特性卡与请求章节不一致。');
  }
  const lengthGate = allowHardFailedLengthViolation && draft.hardFailed
    ? evaluateChapterLength(draft.content, chapter.wordTarget)
    : assertChapterLengthGate(draft.content, chapter.wordTarget);
  return {
    ...constructTrialFollowupChapterDraft(chapter, draft),
    lengthGate,
    memory: {
      previousSummary: draft.memory.previousSummary,
      characterStates: [...draft.memory.characterStates],
      relationshipStates: [...draft.memory.relationshipStates],
      locations: [...draft.memory.locations],
      organizations: [...draft.memory.organizations],
      items: [...draft.memory.items],
      plantedForeshadowing: [...draft.memory.plantedForeshadowing],
      resolvedForeshadowing: [...draft.memory.resolvedForeshadowing],
      unresolvedConflicts: [...draft.memory.unresolvedConflicts],
      newSettings: [...draft.memory.newSettings],
      factsCannotContradict: [...draft.memory.factsCannotContradict],
      metadata: {
        scoringStrategyVersion: draft.memory.metadata.scoringStrategyVersion,
        hardFailed: draft.memory.metadata.hardFailed,
        summary: draft.memory.metadata.summary
      }
    }
  };
}
