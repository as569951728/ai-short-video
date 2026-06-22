import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LlmProviderError, type LlmClient } from '../../ai/llmClient.js';
import { DeepSeekNovelProvider } from './deepseekNovelProvider.js';

describe('DeepSeek novel provider', () => {
  it('maps fake DeepSeek JSON into direction, structure, trial, body, impact, and full-review drafts', async () => {
    const provider = new DeepSeekNovelProvider({
      client: createQueueClient([
        JSON.stringify({
          candidates: [
            {
              title: '逆风第一案',
              summary: '主角从误解中翻身，第一案证明自己。',
              content: '主角被全网误解后，用一次关键救援重建信任。',
              score: 88,
              marketScore: 86,
              riskLevel: 'low',
              riskTags: ['节奏可控'],
              recommendedReason: '开篇冲突直接，视频钩子明确。'
            }
          ]
        }),
        JSON.stringify({
          title: '设定档案',
          summary: '主角、对手和世界规则清晰。',
          content: { protagonist: '林舟', antagonist: '旧公司', rules: ['每章一个反击点'] },
          score: 84,
          riskLevel: 'low',
          riskTags: ['设定稳定'],
          recommendedReason: '可支撑后续章节。'
        }),
        JSON.stringify({
          candidates: [
            {
              title: '第1章 误解爆发',
              content: '这是第1章完整正文。'.repeat(80),
              openingStrategy: '强冲突开场',
              openingHighlight: '主角被错怪却抓住反击机会',
              firstSentence: '所有人都以为林舟完了。',
              first300Summary: '林舟被公开误解，仍然发现破局证据。',
              endingHook: '真正的监控备份出现了。',
              riskLevel: 'low',
              riskTags: ['无'],
              aiRecommendedReason: '冲突直接。',
              isAiRecommended: true,
              scoring: {
                totalScore: 87,
                gateConclusion: 'pass',
                dimensions: [{ key: 'opening', label: '开篇', score: 88, weight: 0.4, evidence: '开场清楚', deductions: [] }]
              }
            },
            {
              title: '第1章 证据暗涌',
              content: '这是第1章第二候选完整正文。'.repeat(80),
              openingStrategy: '悬念开场',
              openingHighlight: '主角发现证据但暂时不能公开',
              firstSentence: '林舟在最安静的角落里看见了那段备份。',
              first300Summary: '林舟发现关键备份，决定先引出真正的陷害者。',
              endingHook: '备份里出现了一个不该出现的人。',
              riskLevel: 'low',
              riskTags: ['无'],
              aiRecommendedReason: '悬念更强。',
              isAiRecommended: false,
              scoring: {
                totalScore: 84,
                gateConclusion: 'pass',
                dimensions: [{ key: 'opening', label: '开篇', score: 84, weight: 0.4, evidence: '悬念明确', deductions: [] }]
              }
            },
            {
              title: '第1章 公开反击',
              content: '这是第1章第三候选完整正文。'.repeat(80),
              openingStrategy: '反击开场',
              openingHighlight: '主角当众拿出第一份证据',
              firstSentence: '林舟没有解释，只把屏幕转向所有人。',
              first300Summary: '林舟在公开质疑中直接反击，拿出第一份证据。',
              endingHook: '真正的幕后人终于坐不住了。',
              riskLevel: 'low',
              riskTags: ['无'],
              aiRecommendedReason: '爽点直接。',
              isAiRecommended: false,
              scoring: {
                totalScore: 83,
                gateConclusion: 'pass',
                dimensions: [{ key: 'opening', label: '开篇', score: 83, weight: 0.4, evidence: '反击清楚', deductions: [] }]
              }
            }
          ]
        }),
        JSON.stringify({
          chapters: [
            {
              chapterNo: 2,
              title: '第2章 证据反转',
              content: '这是第2章完整正文。'.repeat(80),
              summary: '林舟拿出第一份证据。',
              hardFailed: false,
              hardFailureReasons: [],
              scoring: { totalScore: 82, gateConclusion: 'pass', dimensions: [] },
              featureCard: { highlights: ['证据出现'], characters: ['林舟'], plotPoints: ['反转'], risks: [] },
              review: { totalScore: 82, issues: [], suggestions: ['保持节奏'], riskLevel: 'low' }
            }
          ],
          review: {
            totalScore: 83,
            trialResult: 'pass',
            summary: '前三章方向清楚。',
            strengths: ['开篇直接'],
            problems: [],
            suggestions: ['继续强化反击'],
            recommendedAction: 'confirm_trial',
            allowNextStep: true,
            requiresRiskConfirmation: false,
            chapterScores: [{ chapterNo: 2, score: 82 }]
          }
        }),
        JSON.stringify({
          title: '第4章 新证人',
          content: '这是第4章完整正文。'.repeat(100),
          summary: '新证人带来关键线索。',
          riskLevel: 'low',
          riskTags: ['无'],
          scoring: { totalScore: 85, gateConclusion: 'pass', dimensions: [] },
          featureCard: { highlights: ['新证人'], characters: ['林舟'], plotPoints: ['线索升级'], risks: [] },
          review: { totalScore: 85, issues: [], suggestions: ['保持悬念'], riskLevel: 'low' },
          memory: { summary: '林舟获得新证人线索。', facts: ['证人出现'], foreshadows: ['旧公司隐瞒资料'] },
          hardFailed: false,
          hardFailureReasons: []
        }),
        JSON.stringify({
          impactLevel: 'minor',
          summary: '只影响当前章表达。',
          changedFacts: ['证据展示顺序变化'],
          affectedChapterIds: [],
          affectedVideoReferenceIds: [],
          recommendedHandling: '同步摘要即可',
          suggestedActions: ['更新章节摘要'],
          blocksFullReview: false
        }),
        JSON.stringify({
          totalScore: 86,
          rating: 'A',
          gateResult: 'pass',
          summary: '全书主线完整。',
          strengths: ['节奏稳定'],
          problems: [],
          suggestions: ['视频化时突出前三秒冲突'],
          dimensionScores: [{ key: 'continuity', label: '连续性', score: 86, weight: 0.4 }],
          issues: [],
          videoSuggestion: '适合从第1章冲突切入。',
          firstVideoSuggestion: {
            chapterRange: '1-1',
            firstThreeSecondVoiceover: '所有人都以为他完了。',
            firstScreenSubtitle: '全网误解后，他用证据翻盘',
            titleHook: '被误解的他，反手拿出证据',
            endingSuspense: '备份里还有更大的秘密'
          },
          platformRisks: [],
          originalityRisks: [],
          aiFlavorRisks: [],
          lowScoreContinueRisks: [],
          reviewPolicyVersionId: 'policy-full-review-v1'
        })
      ])
    });

    const novel = createNovel();
    const direction = await provider.generateCandidates({ novel, preferences: [] });
    assert.equal(direction[0].title, '逆风第一案');
    assert.equal(direction[0].score, 88);

    const structure = await provider.generateAsset({ objectType: 'setting', novel, preferences: [], currentAssets: {} });
    assert.equal(structure.title, '设定档案');
    assert.equal(structure.content.sections[0].title, '设定档案');

    const trial = await provider.generateChapterOneCandidates({ novel, preferences: [], chapters: [createChapter(1)], chapterCount: 3 });
    assert.equal(trial[0].isAiRecommended, true);
    assert.ok(trial[0].content.length > 100);

    const followup = await provider.generateFollowup({
      novel,
      selectedCandidate: { ...trial[0], id: 'trial-candidate-1' } as any,
      chapters: [createChapter(1), createChapter(2)]
    });
    assert.equal(followup.review.trialResult, 'pass');
    assert.equal(followup.chapters[0].chapter.chapterNo, 1);
    assert.equal(followup.chapters[1].chapter.chapterNo, 2);

    const body = await provider.generateBodyChapter({
      novel,
      chapter: createChapter(4),
      strategySnapshot: { id: 'strategy-1', metadata: {} } as any,
      previousContent: null,
      previousMemory: null,
      previousBatchNotes: [],
      enhancedReview: false
    });
    assert.equal(body.chapter.chapterNo, 4);
    assert.equal(body.hardFailed, false);

    const impact = await provider.assessImpact({
      novel,
      chapter: createChapter(4),
      oldContent: null,
      newContent: { id: 'content-2' } as any
    });
    assert.equal(impact.impactLevel, 'minor');

    const review = await provider.generateFullReview({ novel, chapters: [createChapter(1)], sourceVersionRefs: {} });
    assert.equal(review.gateResult, 'pass');
    assert.equal(review.firstVideoSuggestion.titleHook, '被误解的他，反手拿出证据');
  });

  it('rejects invalid fake model JSON without leaking the raw response', async () => {
    const provider = new DeepSeekNovelProvider({
      client: createQueueClient(['{"candidates":[{"title":"缺正文","content":"FULL_MODEL_RESPONSE_SHOULD_NOT_LEAK"}]}'])
    });

    await assert.rejects(
      () => provider.generateCandidates({ novel: createNovel(), preferences: [] }),
      (error) => {
        assert.ok(error instanceof LlmProviderError);
        assert.equal(error.category, 'output_parse_failed');
        assert.doesNotMatch(error.message, /FULL_MODEL_RESPONSE_SHOULD_NOT_LEAK/);
        assert.doesNotMatch(JSON.stringify(error.details ?? {}), /FULL_MODEL_RESPONSE_SHOULD_NOT_LEAK/);
        return true;
      }
    );
  });

  it('retries once when the trial chapter-one candidate count is lower than requested', async () => {
    let callCount = 0;
    const provider = new DeepSeekNovelProvider({
      client: {
        async chat() {
          callCount += 1;
          return {
            content: JSON.stringify({
              candidates:
                callCount === 1
                  ? [createTrialCandidateJson('候选 A'), createTrialCandidateJson('候选 B')]
                  : [createTrialCandidateJson('候选 A'), createTrialCandidateJson('候选 B'), createTrialCandidateJson('候选 C')]
            }),
            model: 'deepseek-fake',
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
          };
        }
      }
    });

    const result = await provider.generateChapterOneCandidates({
      novel: createNovel(),
      preferences: [],
      chapters: [createChapter(1)],
      chapterCount: 3
    });

    assert.equal(callCount, 2);
    assert.equal(result.length, 3);
    assert.equal(result[0].isAiRecommended, true);
  });

  it('fails as output_parse_failed when retry still returns too few trial candidates', async () => {
    const provider = new DeepSeekNovelProvider({
      client: createQueueClient([
        JSON.stringify({ candidates: [createTrialCandidateJson('候选 A'), createTrialCandidateJson('候选 B')] }),
        JSON.stringify({ candidates: [createTrialCandidateJson('候选 A'), createTrialCandidateJson('候选 B')] })
      ])
    });

    await assert.rejects(
      () =>
        provider.generateChapterOneCandidates({
          novel: createNovel(),
          preferences: [],
          chapters: [createChapter(1)],
          chapterCount: 3
        }),
      (error) => {
        assert.ok(error instanceof LlmProviderError);
        assert.equal(error.category, 'output_parse_failed');
        assert.equal(error.details?.expectedCount, 3);
        assert.equal(error.details?.actualCount, 2);
        return true;
      }
    );
  });
});

function createQueueClient(responses: string[]): LlmClient {
  return {
    async chat() {
      const content = responses.shift();
      if (content === undefined) {
        throw new Error('No fake LLM response left');
      }
      return {
        content,
        model: 'deepseek-fake',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      };
    }
  };
}

function createTrialCandidateJson(title: string) {
  return {
    title,
    content: `${title}完整正文。`.repeat(90),
    openingStrategy: '强冲突开场',
    openingHighlight: `${title}开篇冲突清晰`,
    firstSentence: '所有人都以为林舟完了。',
    first300Summary: '林舟被公开误解，仍然发现破局证据。',
    endingHook: '真正的监控备份出现了。',
    riskLevel: 'low',
    riskTags: ['无'],
    aiRecommendedReason: '冲突直接。',
    isAiRecommended: true,
    scoring: {
      totalScore: 86,
      gateConclusion: 'pass',
      dimensions: [{ key: 'opening', label: '开篇', score: 86, weight: 0.4, evidence: '开场清楚', deductions: [] }]
    }
  };
}

function createNovel(): any {
  return {
    id: 'novel-1',
    title: '测试短小说',
    genres: ['都市逆袭'],
    chapterLimit: 5,
    chapterWordRange: { min: 800, max: 1200 }
  };
}

function createChapter(chapterNo: number): any {
  return {
    id: `chapter-${chapterNo}`,
    chapterNo,
    title: `第${chapterNo}章`
  };
}
