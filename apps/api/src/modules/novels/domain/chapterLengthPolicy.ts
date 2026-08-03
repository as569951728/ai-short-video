import type { ChapterLengthGateDTO } from '@ai-shortvideo/shared';

export const CHAPTER_LENGTH_COUNT_METRIC = 'unicode_code_point_non_whitespace_nfc_v1' as const;

const UNICODE_WHITESPACE_PATTERN = /^\p{White_Space}$/u;

export function countChapterLength(content: string): number {
  let count = 0;
  for (const codePoint of content.normalize('NFC')) {
    if (!UNICODE_WHITESPACE_PATTERN.test(codePoint)) count += 1;
  }
  return count;
}

export function evaluateChapterLength(
  content: string,
  target: number | null | undefined
): ChapterLengthGateDTO {
  const actual = countChapterLength(content);
  const normalizedTarget = Number.isInteger(target) && Number(target) > 0 ? Number(target) : null;

  if (normalizedTarget === null) {
    return {
      metric: CHAPTER_LENGTH_COUNT_METRIC,
      target: null,
      lowerBound: null,
      upperBound: null,
      actual,
      status: 'unconfigured',
      statusText: '本章未配置有效的目标字符数，不能生成或采用正文。',
      canAdopt: false
    };
  }

  const lowerBound = Math.ceil((normalizedTarget * 90) / 100);
  const upperBound = Math.floor((normalizedTarget * 115) / 100);
  const status = actual < lowerBound ? 'too_short' : actual > upperBound ? 'too_long' : 'pass';

  return {
    metric: CHAPTER_LENGTH_COUNT_METRIC,
    target: normalizedTarget,
    lowerBound,
    upperBound,
    actual,
    status,
    statusText:
      status === 'too_short'
        ? `正文字符数不足：实际 ${actual}，允许范围 ${lowerBound}-${upperBound}。`
        : status === 'too_long'
          ? `正文字符数超出范围：实际 ${actual}，允许范围 ${lowerBound}-${upperBound}。`
          : `正文字符数符合要求：实际 ${actual}，允许范围 ${lowerBound}-${upperBound}。`,
    canAdopt: status === 'pass'
  };
}
