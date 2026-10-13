import { ErrorCode, type ChapterLengthGateDTO } from '@ai-shortvideo/shared';
import { BusinessError } from '../../../shared/errors.js';

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

  const lowerBound = Math.ceil((normalizedTarget * 85) / 100);
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

export function assertChapterLengthGate(content: string, target: number | null): ChapterLengthGateDTO {
  const lengthGate = evaluateChapterLength(content, target);
  if (!lengthGate.canAdopt) {
    const reasonCode = lengthGate.status === 'unconfigured'
      ? 'NOVEL_CONTENT_LENGTH_TARGET_MISSING'
      : 'NOVEL_CONTENT_LENGTH_OUT_OF_RANGE';
    throw new BusinessError(
      ErrorCode.GateBlocked,
      lengthGate.status === 'unconfigured'
        ? lengthGate.statusText
        : `${lengthGate.statusText} 本次结果未保存，请调整生成要求后重新生成。`,
      { reasonCode, lengthStatus: lengthGate.status, countMode: lengthGate.metric, targetCount: lengthGate.target,
        actualCount: lengthGate.actual, lowerBound: lengthGate.lowerBound, upperBound: lengthGate.upperBound, lengthGate }
    );
  }
  return lengthGate;
}

export function sanitizeChapterLengthGate(value: unknown): ChapterLengthGateDTO | null {
  const gate = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  if (!gate || gate.metric !== CHAPTER_LENGTH_COUNT_METRIC
    || (gate.target !== null && !Number.isInteger(gate.target))
    || (gate.lowerBound !== null && !Number.isInteger(gate.lowerBound))
    || (gate.upperBound !== null && !Number.isInteger(gate.upperBound))
    || !Number.isInteger(gate.actual)
    || !['unconfigured', 'pass', 'too_short', 'too_long'].includes(String(gate.status))
    || typeof gate.statusText !== 'string' || typeof gate.canAdopt !== 'boolean') return null;
  return {
    metric: CHAPTER_LENGTH_COUNT_METRIC,
    target: gate.target as number | null, lowerBound: gate.lowerBound as number | null,
    upperBound: gate.upperBound as number | null, actual: gate.actual as number,
    status: gate.status as ChapterLengthGateDTO['status'], statusText: gate.statusText, canAdopt: gate.canAdopt
  };
}
