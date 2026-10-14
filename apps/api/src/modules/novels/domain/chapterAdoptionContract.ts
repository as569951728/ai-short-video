import { StaleLevel, VersionStatus } from '@ai-shortvideo/shared';
import { evaluateChapterLength } from './chapterLengthPolicy.js';
import type { ChapterContentVersionRecord, NovelChapterRecord } from './novelDomain.js';

export function matchesChapterAdoptionContract(
  chapter: NovelChapterRecord | null | undefined,
  current: ChapterContentVersionRecord | null | undefined,
  candidate: ChapterContentVersionRecord | null | undefined,
  pageVersionSnapshot?: unknown
): boolean {
  if (!chapter || !current || !candidate || chapter.deletedAt
    || chapter.currentContentVersionId !== current.id
    || current.chapterId !== chapter.id || candidate.chapterId !== chapter.id
    || current.tenantId !== chapter.tenantId || candidate.tenantId !== chapter.tenantId
    || current.novelId !== chapter.novelId || candidate.novelId !== chapter.novelId
    || current.status !== VersionStatus.Current || current.staleLevel !== StaleLevel.None
    || candidate.id === current.id || candidate.status !== VersionStatus.Candidate
    || candidate.staleLevel !== StaleLevel.None) return false;
  const refs = record(candidate.sourceVersionRefs);
  if ((Object.hasOwn(refs, 'currentContentVersionId') && refs.currentContentVersionId !== current.id)
    || record(candidate.metadata).reviewRequired === true || candidate.sourceType?.startsWith('ai_overlength_')) return false;
  const length = evaluateChapterLength(candidate.content, chapter.wordTarget);
  if (length.status !== 'pass' || candidate.wordCount !== length.actual) return false;
  if (pageVersionSnapshot !== undefined && pageVersionSnapshot !== null
    && (typeof pageVersionSnapshot !== 'object' || Array.isArray(pageVersionSnapshot)
      || JSON.stringify(pageVersionSnapshot).length > 4096)) return false;
  const snapshot = record(pageVersionSnapshot);
  return (!Object.hasOwn(snapshot, 'currentContentVersionId') || snapshot.currentContentVersionId === current.id)
    && (!Object.hasOwn(snapshot, 'candidateVersionId') || snapshot.candidateVersionId === candidate.id)
    && (!Object.hasOwn(snapshot, 'seenCandidateVersionId') || snapshot.seenCandidateVersionId === candidate.id);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
