import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LlmProviderError, type ChatCompletionRequest, type LlmClient } from '../ai/llmClient.js';
import {
  FULL_REVIEW_CONFLICT_FIXTURE_VERSION,
  FULL_REVIEW_CONFLICT_SCOPES,
  FULL_REVIEW_EVIDENCE_PRIVACY_CANARY,
  FullReviewEvidenceSmokeFailure,
  createSafeSmokeErrorSummary,
  createFullReviewConflictFixture,
  executeFullReviewEvidenceSmoke
} from './fullReviewEvidenceLiveSmoke.js';

const RAW_RESPONSE_CANARY = 'RAW_MODEL_RESPONSE_CANARY_RP04C_E5';
const API_KEY_CANARY = 'sk-private-rp04c-e5-canary';

describe('RP-04C E5 full-review conflict evidence', () => {
  it('sends the complete 12-chapter builder fixture once and parses all blocking conflicts without leaking sensitive material', async () => {
    const fixture = createFullReviewConflictFixture();
    const requests: ChatCompletionRequest[] = [];
    const logLines: string[] = [];
    const client: LlmClient = {
      async chat(request) {
        requests.push(request);
        const prompt = JSON.parse(request.messages[1]!.content) as {
          payload: {
            coverageManifest: { manifestHash: string; chapterCount: number; coveredChapterNos: number[] };
            chapterEvidence: Array<{ chapter: { id: string; chapterNo: number } }>;
            evidenceHash: string;
          };
        };

        assert.equal(request.taskName, 'novel_full_review');
        assert.equal(prompt.payload.coverageManifest.manifestHash, fixture.coverageManifest.manifestHash);
        assert.equal(prompt.payload.evidenceHash, fixture.evidenceHash);
        assert.equal(prompt.payload.coverageManifest.chapterCount, 12);
        assert.deepEqual(prompt.payload.coverageManifest.coveredChapterNos, Array.from({ length: 12 }, (_, index) => index + 1));
        assert.deepEqual(
          prompt.payload.chapterEvidence.map((item) => item.chapter.chapterNo),
          Array.from({ length: 12 }, (_, index) => index + 1)
        );
        assert.equal(new Set(prompt.payload.chapterEvidence.map((item) => item.chapter.id)).size, 12);
        assert.match(request.messages[1]!.content, /沈岚在仓库爆炸中确认死亡/);
        assert.match(request.messages[1]!.content, /已经死亡的沈岚无解释地亲自出席签约/);
        assert.match(request.messages[1]!.content, /2026-03-18/);
        assert.match(request.messages[1]!.content, /2026-03-12/);
        assert.match(request.messages[1]!.content, /XH-MAIN-001/);
        assert.match(request.messages[1]!.content, /CG-PURCHASE-010/);
        assert.match(request.messages[1]!.content, /YS-LICENSE-011/);

        return {
          content: JSON.stringify(createBlockingReviewResponse()),
          model: 'deepseek-deterministic-fixture',
          usage: { promptTokens: 2_400, completionTokens: 600, totalTokens: 3_000 }
        };
      }
    };
    let clock = 1_000;

    const summary = await executeFullReviewEvidenceSmoke({
      client,
      env: {
        DEEPSEEK_API_KEY: API_KEY_CANARY,
        DEEPSEEK_MAX_RETRIES: '9'
      },
      gitSha: '0123456789abcdef0123456789abcdef01234567',
      model: 'deepseek-deterministic-fixture',
      now: () => {
        clock += 50;
        return clock;
      },
      writeSummary: (line) => logLines.push(line)
    });

    assert.equal(requests.length, 1);
    assert.equal(summary.success, true);
    assert.equal(summary.fixtureVersion, FULL_REVIEW_CONFLICT_FIXTURE_VERSION);
    assert.equal(summary.manifestHash, fixture.coverageManifest.manifestHash);
    assert.equal(summary.callCount, 1);
    assert.equal(summary.gateResult, 'blocked');
    assert.equal(summary.coverage.complete, true);
    assert.equal(summary.hits.characterDeathResurrection.hit, true);
    assert.deepEqual(summary.hits.characterDeathResurrection.scopeRefs, [...FULL_REVIEW_CONFLICT_SCOPES.characterDeathResurrection]);
    assert.equal(summary.hits.timeline.hit, true);
    assert.deepEqual(summary.hits.timeline.scopeRefs, [...FULL_REVIEW_CONFLICT_SCOPES.timeline]);
    assert.equal(summary.hits.contractAmount.hit, true);
    assert.deepEqual(summary.hits.contractAmount.scopeRefs, [...FULL_REVIEW_CONFLICT_SCOPES.contractAmount]);
    assert.equal(summary.controlFalsePositive, false);
    assert.deepEqual(summary.usage, { promptTokens: 2_400, completionTokens: 600, totalTokens: 3_000 });

    const safeLog = logLines.join('\n');
    assert.doesNotMatch(safeLog, new RegExp(FULL_REVIEW_EVIDENCE_PRIVACY_CANARY));
    assert.doesNotMatch(safeLog, new RegExp(RAW_RESPONSE_CANARY));
    assert.doesNotMatch(safeLog, new RegExp(API_KEY_CANARY));
    assert.doesNotMatch(safeLog, /沈岚在仓库爆炸中确认死亡/);
    assert.doesNotMatch(safeLog, /XH-MAIN-001/);
  });

  it('fails the smoke gate when the non-conflicting amount control is reported as blocking', async () => {
    const response = createBlockingReviewResponse();
    response.issues.push(issue(
      'rp04c-control-false-positive',
      '错误地把不同合同金额判为冲突',
      'fact_consistency',
      FULL_REVIEW_CONFLICT_SCOPES.similarControl
    ));
    const safeLines: string[] = [];

    await assert.rejects(
      () => executeFullReviewEvidenceSmoke({
        client: responseClient(response),
        gitSha: '0123456789abcdef0123456789abcdef01234567',
        model: 'deepseek-deterministic-fixture',
        writeSummary: (line) => safeLines.push(line)
      }),
      (error: unknown) => {
        assert.ok(error instanceof FullReviewEvidenceSmokeFailure);
        assert.equal(error.code, 'full_review_evidence_gate_failed');
        assert.ok(error.failureCodes.includes('control_false_positive'));
        return true;
      }
    );

    assert.equal(JSON.parse(safeLines[0]!).controlFalsePositive, true);
    assert.doesNotMatch(safeLines.join('\n'), new RegExp(RAW_RESPONSE_CANARY));
    assert.doesNotMatch(safeLines.join('\n'), new RegExp(FULL_REVIEW_EVIDENCE_PRIVACY_CANARY));
  });

  it('does not accept a broad issue with an extra chapter or the wrong dimension', async () => {
    const response = createBlockingReviewResponse();
    response.issues[0]!.scopeChapterNos.push(4);
    response.issues[1]!.dimension = 'fact_consistency';

    await assert.rejects(
      () => executeFullReviewEvidenceSmoke({
        client: responseClient(response),
        gitSha: '0123456789abcdef0123456789abcdef01234567',
        model: 'deepseek-deterministic-fixture'
      }),
      (error: unknown) => {
        assert.ok(error instanceof FullReviewEvidenceSmokeFailure);
        assert.ok(error.failureCodes.includes('character_conflict_missing'));
        assert.ok(error.failureCodes.includes('timeline_conflict_missing'));
        return true;
      }
    );
  });

  it('classifies schema failures without exposing provider output or validation values', () => {
    const summary = createSafeSmokeErrorSummary(new LlmProviderError(
      'output_parse_failed',
      `do-not-log-${RAW_RESPONSE_CANARY}`,
      {
        outputKind: 'schema_invalid',
        reason: `full review issue has invalid keys ${FULL_REVIEW_EVIDENCE_PRIVACY_CANARY}`
      }
    ));

    assert.deepEqual(summary, {
      success: false,
      errorCode: 'llm_output_parse_failed',
      outputKind: 'schema_invalid',
      validationCode: 'issue_keys_invalid'
    });
    assert.doesNotMatch(JSON.stringify(summary), new RegExp(RAW_RESPONSE_CANARY));
    assert.doesNotMatch(JSON.stringify(summary), new RegExp(FULL_REVIEW_EVIDENCE_PRIVACY_CANARY));
  });
});

function responseClient(response: ReturnType<typeof createBlockingReviewResponse>): LlmClient {
  return {
    async chat(request) {
      return {
        content: JSON.stringify(response),
        model: request.model,
        usage: { promptTokens: 2_400, completionTokens: 600, totalTokens: 3_000 }
      };
    }
  };
}

function createBlockingReviewResponse() {
  return {
    totalScore: 42,
    rating: 'C',
    gateResult: 'blocked',
    summary: '存在三类跨章硬冲突。',
    strengths: ['证据覆盖完整'],
    problems: ['人物状态、时间线和合同金额冲突'],
    suggestions: ['修复后重新全书审稿'],
    dimensionScores: [],
    issues: [
      issue(
        'rp04c-character-death-resurrection',
        '人物死亡后无解释复活',
        'character_continuity',
        FULL_REVIEW_CONFLICT_SCOPES.characterDeathResurrection
      ),
      issue(
        'rp04c-timeline-exclusive-date',
        '同一董事会日期互斥',
        'timeline_continuity',
        FULL_REVIEW_CONFLICT_SCOPES.timeline
      ),
      issue(
        'rp04c-contract-amount',
        '同一合同金额冲突',
        'fact_consistency',
        FULL_REVIEW_CONFLICT_SCOPES.contractAmount
      )
    ],
    videoSuggestion: '阻断期间不生成视频建议。',
    firstVideoSuggestion: {
      chapterRange: '1-1',
      openingSlice: '冲突修复后再选择开场片段',
      narrationHook: '跨章事实尚未统一',
      firstScreenSubtitle: '全书审稿已阻断',
      titleHook: '先修复三类硬冲突',
      endingSuspense: '修复后重新审稿',
      suggestedFormat: '暂缓视频化',
      riskTips: ['先修复阻断问题']
    },
    platformRisks: [],
    originalityRisks: [],
    aiFlavorRisks: [],
    lowScoreContinueRisks: ['跨章硬冲突未修复'],
    reviewPolicyVersionId: 'policy-full-review-v1',
    rawResponseCanary: RAW_RESPONSE_CANARY
  };
}

function issue(issueId: string, title: string, dimension: string, scopeRefs: readonly string[]) {
  return {
    issueId,
    title,
    plainDescription: title,
    severity: 'blocking',
    scopeChapterNos: scopeRefs.map((scopeRef) => Number(scopeRef.slice(-2))),
    dimension,
    recommendedTarget: scopeRefs.join(','),
    recommendedAction: '统一跨章事实后重新审稿'
  };
}
