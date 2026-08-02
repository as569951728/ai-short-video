import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LlmProviderError, type ChatCompletionRequest, type LlmClient } from '../ai/llmClient.js';
import { hashCanonicalJson } from './domain/executionContract.js';
import { DeepSeekNovelProvider } from './providers/deepseekNovelProvider.js';
import {
  FULL_REVIEW_CANONICAL_DIMENSION_KEYS,
  type FullReviewEvidenceProviderInputV1
} from './services/actionExecutionPlan.js';

describe('DeepSeek full-review evidence boundary', () => {
  it('does not call the client when a chapter has no substantive body evidence', async () => {
    let clientCalls = 0;
    const provider = new DeepSeekNovelProvider({
      client: {
        async chat() {
          clientCalls += 1;
          throw new Error('client must not be called');
        }
      }
    });
    const input = createFullReviewInput(1);
    input.chapterEvidence[0].content = {
      ...input.chapterEvidence[0].content,
      summary: '',
      excerpts: { opening: '', middle: '', ending: '' }
    };
    refreshEvidenceHashes(input, 0);

    await assert.rejects(
      () => provider.generateFullReview(input),
      (error) => {
        assert.ok(error instanceof LlmProviderError);
        assert.equal(error.details?.code, 'evidence_incomplete');
        return true;
      }
    );
    assert.equal(clientCalls, 0);
  });

  it('sends all 45 chapters exactly once with the coverage manifest in one bounded request', async () => {
    const requests: ChatCompletionRequest[] = [];
    const provider = new DeepSeekNovelProvider({
      reasonerModel: 'deepseek-reasoner-test',
      client: {
        async chat(request) {
          requests.push(request);
          return { content: JSON.stringify(createFullReviewResponse()), model: request.model };
        }
      }
    });
    const input = createFullReviewInput(45);

    const result = await provider.generateFullReview(input);

    assert.equal(result.gateResult, 'pass');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].model, 'deepseek-reasoner-test');
    assert.equal(requests[0].maxTokens, 7_000);
    const prompt = JSON.parse(requests[0].messages[1].content);
    assert.match(prompt.instruction, /scopeChapterNos 必须列出冲突涉及的全部章节号整数/);
    assert.deepEqual(
      prompt.chapterIdCatalog,
      input.chapterEvidence.map((item) => ({ id: item.chapter.id, chapterNo: item.chapter.chapterNo }))
    );
    assert.deepEqual(prompt.payload.coverageManifest, input.coverageManifest);
    assert.equal(prompt.payload.chapterEvidence.length, 45);
    assert.deepEqual(
      prompt.payload.chapterEvidence.map((item: { chapter: { chapterNo: number } }) => item.chapter.chapterNo),
      Array.from({ length: 45 }, (_, index) => index + 1)
    );
    assert.equal(new Set(prompt.payload.chapterEvidence.map((item: { chapter: { id: string } }) => item.chapter.id)).size, 45);
    for (let chapterNo = 1; chapterNo <= 45; chapterNo += 1) {
      const marker = `BODY_EVIDENCE_${chapterNo}_END`;
      assert.equal(countOccurrences(requests[0].messages[1].content, marker), 1, marker);
    }
  });

  it('fails closed before the client when the bounded single-request capacity is exceeded', async () => {
    let clientCalls = 0;
    const provider = new DeepSeekNovelProvider({
      client: {
        async chat() {
          clientCalls += 1;
          throw new Error('client must not be called');
        }
      }
    });

    await assert.rejects(
      () => provider.generateFullReview(createFullReviewInput(81)),
      (error) => {
        assert.ok(error instanceof LlmProviderError);
        assert.equal(error.details?.code, 'request_capacity_exceeded');
        return true;
      }
    );
    assert.equal(clientCalls, 0);
  });

  it('rejects a blocking issue that cites a non-authoritative chapter number', async () => {
    const response: any = createFullReviewResponse();
    response.gateResult = 'blocked';
    response.issues = [createModelIssue({
      issueId: 'unknown-scope',
      title: '引用了不存在的章节',
      plainDescription: '模型返回的章节引用不属于本次权威证据。',
      scopeChapterNos: [99],
      recommendedTarget: 'chapter-not-in-manifest'
    })];
    let clientCalls = 0;
    const provider = new DeepSeekNovelProvider({
      client: {
        async chat(request) {
          clientCalls += 1;
          return { content: JSON.stringify(response), model: request.model };
        }
      }
    });

    await assert.rejects(
      () => provider.generateFullReview(createFullReviewInput(1)),
      (error) => {
        assert.ok(error instanceof LlmProviderError);
        assert.equal(error.category, 'output_parse_failed');
        assert.doesNotMatch(error.message, /99/);
        return true;
      }
    );
    assert.equal(clientCalls, 1);
  });

  it('rejects ambiguous or model-authored scope identities and inconsistent blocking gates', async () => {
    const invalidCases: Array<{ label: string; issue: Record<string, unknown>; gateResult?: string }> = [
      { label: 'duplicate chapter number', issue: createModelIssue({ scopeChapterNos: [1, 1] }) },
      { label: 'fractional chapter number', issue: createModelIssue({ scopeChapterNos: [1.5] }) },
      { label: 'string chapter number', issue: createModelIssue({ scopeChapterNos: ['1'] }) },
      { label: 'empty chapter numbers', issue: createModelIssue({ scopeChapterNos: [] }) },
      { label: 'non-chapter scope', issue: createModelIssue({ scopeType: 'novel' }) },
      { label: 'model-authored scopeRefs', issue: createModelIssue({ scopeRefs: ['chapter-1'] }) },
      { label: 'model-authored status', issue: createModelIssue({ status: 'resolved' }) },
      { label: 'blocking issue with pass gate', issue: createModelIssue(), gateResult: 'pass' }
    ];

    for (const invalidCase of invalidCases) {
      let clientCalls = 0;
      const response: any = createFullReviewResponse();
      response.gateResult = invalidCase.gateResult ?? 'blocked';
      response.issues = [invalidCase.issue];
      const provider = new DeepSeekNovelProvider({
        client: {
          async chat(request) {
            clientCalls += 1;
            return { content: JSON.stringify(response), model: request.model };
          }
        }
      });
      await assert.rejects(
        () => provider.generateFullReview(createFullReviewInput(1)),
        (error) => error instanceof LlmProviderError && error.category === 'output_parse_failed',
        invalidCase.label
      );
      assert.equal(clientCalls, 1, invalidCase.label);
    }
  });

  it('rejects missing, extra, aliased, and invalid fields at every full-review output layer', async () => {
    const cases: Array<{ label: string; mutate: (response: any) => void }> = [
      { label: 'missing top-level field', mutate: (response) => { delete response.gateResult; } },
      { label: 'extra top-level field', mutate: (response) => { response.explanation = 'not allowed'; } },
      { label: 'invalid top-level enum', mutate: (response) => { response.gateResult = 'forced_pass'; } },
      { label: 'provider policy alias', mutate: (response) => { response.reviewPolicyVersionId = 'deepseek-full-review-v1'; } },
      { label: 'missing dimension field', mutate: (response) => { delete response.dimensionScores[0].evidence; } },
      { label: 'extra dimension field', mutate: (response) => { response.dimensionScores[0].rawEvidence = 'not allowed'; } },
      { label: 'invalid dimension score', mutate: (response) => { response.dimensionScores[0].score = 101; } },
      { label: 'aliased first-video field', mutate: (response) => {
        delete response.firstVideoSuggestion.narrationHook;
        response.firstVideoSuggestion.firstThreeSecondVoiceover = 'alias is forbidden';
      } },
      { label: 'extra first-video field', mutate: (response) => { response.firstVideoSuggestion.debug = true; } },
      { label: 'invalid string list item', mutate: (response) => { response.strengths = ['']; } },
      { label: 'missing issue field', mutate: (response) => {
        response.gateResult = 'blocked'; response.totalScore = 60; response.rating = 'C';
        response.dimensionScores = [{ key: 'fact_consistency', label: '事实一致性', score: 60, weight: 1, evidence: '第1章事实证据', penaltyPoints: 20 }];
        response.issues = [createModelIssue()]; delete response.issues[0].recommendedAction;
      } },
      { label: 'extra issue field', mutate: (response) => {
        response.gateResult = 'blocked'; response.totalScore = 60; response.rating = 'C';
        response.dimensionScores = [{ key: 'fact_consistency', label: '事实一致性', score: 60, weight: 1, evidence: '第1章事实证据', penaltyPoints: 20 }];
        response.issues = [createModelIssue({ scopeRefs: ['chapter-1'] })];
      } }
    ];

    for (const testCase of cases) {
      const response: any = createFullReviewResponse();
      testCase.mutate(response);
      const provider = new DeepSeekNovelProvider({
        client: { async chat(request) { return { content: JSON.stringify(response), model: request.model }; } }
      });
      await assert.rejects(
        () => provider.generateFullReview(createFullReviewInput(1)),
        (error) => error instanceof LlmProviderError
          && error.category === 'output_parse_failed'
          && error.details?.outputKind === 'schema_invalid',
        testCase.label
      );
    }
  });

  it('does not write sensitive prompts or a complete invalid model response to logs or errors', async () => {
    const sensitiveResponse = 'FULL_MODEL_RESPONSE_SECRET_7H3X';
    const sensitivePromptEvidence = 'PRIVATE_NOVEL_EVIDENCE_9K2Q';
    const logLines: string[] = [];
    let clientCalls = 0;
    const client: LlmClient = {
      async chat() {
        clientCalls += 1;
        return { content: sensitiveResponse, model: 'deepseek-test' };
      }
    };
    const provider = new DeepSeekNovelProvider({ client });
    const input = createFullReviewInput(1);
    input.chapterEvidence[0].content.summary = sensitivePromptEvidence;
    refreshEvidenceHashes(input, 0);
    const originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error
    };
    const capture = (...values: unknown[]) => logLines.push(values.map(String).join(' '));
    console.log = capture;
    console.info = capture;
    console.warn = capture;
    console.error = capture;

    try {
      await assert.rejects(
        () => provider.generateFullReview(input),
        (error) => {
          assert.ok(error instanceof LlmProviderError);
          assert.equal(error.category, 'output_parse_failed');
          assert.doesNotMatch(error.message, new RegExp(sensitiveResponse));
          assert.doesNotMatch(JSON.stringify(error.details ?? {}), new RegExp(sensitiveResponse));
          assert.doesNotMatch(JSON.stringify(error.details ?? {}), new RegExp(sensitivePromptEvidence));
          return true;
        }
      );
    } finally {
      console.log = originalConsole.log;
      console.info = originalConsole.info;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
    }

    assert.equal(clientCalls, 1);
    assert.doesNotMatch(logLines.join('\n'), new RegExp(sensitiveResponse));
    assert.doesNotMatch(logLines.join('\n'), new RegExp(sensitivePromptEvidence));
  });
});

function createFullReviewInput(chapterCount: number): FullReviewEvidenceProviderInputV1 {
  const chapters = Array.from({ length: chapterCount }, (_, index) => {
    const chapterNo = index + 1;
    return {
      id: `chapter-${chapterNo}`,
      chapterNo,
      title: `第${chapterNo}章`,
      wordTarget: 2_000,
      statusNote: null
    };
  });
  const chapterContentVersionIds = chapters.map((chapter) => `content-version-${chapter.chapterNo}`);
  const novel = {
    id: 'novel-full-review-evidence',
    title: '全书审稿证据测试',
    genres: ['都市逆袭'],
    chapterLimit: chapterCount,
    chapterWordMin: 1_800,
    chapterWordMax: 2_200,
    policyProfileVersionId: 'policy-full-review-v1'
  };
  const chapterEvidence = chapters.map((chapter) => {
    const contentHash = hashCanonicalJson({ chapterNo: chapter.chapterNo, contentVersionId: `content-version-${chapter.chapterNo}` });
    const featureCore = {
      featureCardVersionId: `feature-version-${chapter.chapterNo}`,
      revision: 1,
      oneLineSummary: `第${chapter.chapterNo}章摘要`,
      coreTask: '推进主线',
      mainConflict: '主角与对手冲突',
      appealPoint: '逆袭',
      emotionKeywords: ['紧张'],
      characterChanges: [`人物变化-${chapter.chapterNo}`],
      relationshipChanges: [],
      keyInformation: [`关键信息-${chapter.chapterNo}`],
      foreshadowingOperation: '埋下伏笔',
      endingHook: '下章悬念',
      factsCannotChange: [`事实-${chapter.chapterNo}`],
      featuresToStrengthen: []
    };
    const reviewCore = {
      reviewReportId: `review-${chapter.chapterNo}`,
      revision: `content-version-${chapter.chapterNo}`,
      totalScore: 86,
      rating: 'A',
      summary: '单章审稿通过',
      problems: [],
      suggestions: [],
      issues: [],
      recommendedAction: '继续',
      allowNextStep: true,
      blockingIssueCount: 0,
      resolvedStatus: 'resolved',
      policyProfileVersionId: 'policy-full-review-v1'
    };
    const excerpts = {
      opening: `开端证据-${chapter.chapterNo}`,
      middle: `中段证据-${chapter.chapterNo}`,
      ending: `结尾证据-${chapter.chapterNo}`
    };
    const excerptLocations = (['opening', 'middle', 'ending'] as const).map((kind) => ({
      kind,
      startChar: kind === 'opening' ? 0 : kind === 'middle' ? 500 : 1_000,
      endChar: (kind === 'opening' ? 0 : kind === 'middle' ? 500 : 1_000) + excerpts[kind].length,
      excerptHash: hashCanonicalJson({
        kind,
        startChar: kind === 'opening' ? 0 : kind === 'middle' ? 500 : 1_000,
        excerpt: excerpts[kind]
      })
    }));
    const chapterCore = {
      chapter,
      content: {
        contentVersionId: `content-version-${chapter.chapterNo}`,
        revision: 1,
        wordCount: 2_000,
        summary: `第${chapter.chapterNo}章目标、关键事件与结尾状态 BODY_EVIDENCE_${chapter.chapterNo}_END`,
        excerpts,
        contentHash
      },
      featureCard: { ...featureCore, featureCardHash: hashCanonicalJson(featureCore) },
      review: { ...reviewCore, reviewHash: hashCanonicalJson(reviewCore) },
      continuity: {
        stage: {
          stageIndex: 1,
          isStageOpening: chapter.chapterNo === 1,
          isStageEnding: chapter.chapterNo === chapterCount,
          previousChapterId: chapter.chapterNo === 1 ? null : `chapter-${chapter.chapterNo - 1}`,
          nextChapterId: chapter.chapterNo === chapterCount ? null : `chapter-${chapter.chapterNo + 1}`
        },
        characterArc: { characterChanges: [...featureCore.characterChanges], relationshipChanges: [] },
        timeline: { chapterNo: chapter.chapterNo, factAnchors: [...featureCore.keyInformation, ...featureCore.factsCannotChange] },
        foreshadowing: { operation: featureCore.foreshadowingOperation, endingHook: featureCore.endingHook },
        excerptLocations
      }
    };
    return { ...chapterCore, evidenceHash: hashCanonicalJson(chapterCore) };
  });
  const memoryCore = {
    memoryId: 'memory-1',
    revision: chapterContentVersionIds.at(-1)!,
    sourceContentVersionId: chapterContentVersionIds.at(-1)!,
    previousSummary: '全书长期记忆摘要',
    characterStates: ['主角完成逆袭'],
    relationshipStates: [],
    locations: [],
    organizations: [],
    items: [],
    plantedForeshadowing: [],
    resolvedForeshadowing: [],
    unresolvedConflicts: [],
    newSettings: [],
    factsCannotContradict: []
  };
  const memory = { ...memoryCore, memoryHash: hashCanonicalJson(memoryCore) };
  const manifestCore = {
    manifestVersion: 1 as const,
    tenantId: 'tenant-test',
    novelId: novel.id,
    chapterPlanVersionId: 'chapter-plan-version-1',
    policyProfileVersionId: 'policy-full-review-v1',
    chapterCount,
    coveredChapterNos: chapters.map((chapter) => chapter.chapterNo),
    chapters: chapterEvidence.map((item) => ({
      chapterId: item.chapter.id,
      chapterNo: item.chapter.chapterNo,
      contentVersionId: item.content.contentVersionId,
      contentRevision: item.content.revision,
      contentHash: item.content.contentHash,
      featureCardVersionId: item.featureCard.featureCardVersionId,
      featureCardRevision: item.featureCard.revision,
      featureCardHash: item.featureCard.featureCardHash,
      reviewReportId: item.review.reviewReportId,
      reviewRevision: item.review.revision,
      reviewHash: item.review.reviewHash
    })),
    memory: {
      memoryId: memory.memoryId,
      memoryRevision: memory.revision,
      memoryHash: memory.memoryHash
    }
  };
  const coverageManifest = { ...manifestCore, manifestHash: hashCanonicalJson(manifestCore) };
  const inputCore = {
    action: 'novel_full_review' as const,
    novel,
    coverageManifest,
    chapterEvidence,
    memory,
    sourceVersionRefs: {
      directionVersionId: 'direction-version-1',
      settingVersionId: 'setting-version-1',
      outlineVersionId: 'outline-version-1',
      stageOutlineVersionId: 'stage-outline-version-1',
      chapterPlanVersionId: 'chapter-plan-version-1',
      bodyStrategySnapshotId: 'body-strategy-version-1',
      chapterContentVersionIds
    }
  };
  return {
    ...inputCore,
    evidenceHash: hashCanonicalJson(inputCore)
  };
}

function refreshEvidenceHashes(input: ReturnType<typeof createFullReviewInput>, chapterIndex: number): void {
  const chapter = input.chapterEvidence[chapterIndex];
  const { evidenceHash: _chapterHash, ...chapterCore } = chapter;
  input.chapterEvidence[chapterIndex] = { ...chapterCore, evidenceHash: hashCanonicalJson(chapterCore) };
  const { evidenceHash: _inputHash, ...inputCore } = input;
  input.evidenceHash = hashCanonicalJson(inputCore);
}

function createFullReviewResponse() {
  return {
    totalScore: 88,
    rating: 'A',
    gateResult: 'pass',
    summary: '全书连续性通过。',
    strengths: ['主线稳定'],
    problems: [],
    suggestions: [],
    dimensionScores: FULL_REVIEW_CANONICAL_DIMENSION_KEYS.map((key, index) => ({
      key,
      label: `审稿维度 ${index + 1}`,
      score: 88,
      weight: index < 2 ? 0.16 : 0.17,
      evidence: `第1章 ${key} 结构证据完整。`,
      penaltyPoints: 0
    })),
    issues: [],
    videoSuggestion: '从第1章切入。',
    firstVideoSuggestion: {
      chapterRange: '1-1',
      openingSlice: '开场片段',
      narrationHook: '旁白钩子',
      firstScreenSubtitle: '首屏字幕',
      titleHook: '标题钩子',
      endingSuspense: '结尾悬念',
      suggestedFormat: '旁白加字幕',
      riskTips: []
    },
    platformRisks: [],
    originalityRisks: [],
    aiFlavorRisks: [],
    lowScoreContinueRisks: [],
    reviewPolicyVersionId: 'policy-full-review-v1'
  };
}

function createModelIssue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    issueId: 'blocking-issue-1',
    title: '跨章事实冲突',
    plainDescription: '两个章节对同一事实的描述互斥。',
    severity: 'blocking',
    scopeChapterNos: [1],
    dimension: 'fact_consistency',
    recommendedTarget: '第1章',
    recommendedAction: '统一事实后重新审稿',
    ...overrides
  };
}

function countOccurrences(value: string, marker: string): number {
  return value.split(marker).length - 1;
}
