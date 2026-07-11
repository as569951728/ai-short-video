import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LlmProviderError, type ChatCompletionRequest, type LlmClient } from '../../ai/llmClient.js';
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
      client: createQueueClient([
        '{"candidates":[{"title":"缺正文","content":"FULL_MODEL_RESPONSE_SHOULD_NOT_LEAK"}]}',
        '{"candidates":[{"title":"缺正文","content":"FULL_MODEL_RESPONSE_SHOULD_NOT_LEAK"}]}'
      ])
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

  it('uses the lightweight structure model, schema hint, and token cap for setting generation', async () => {
    const requests: ChatCompletionRequest[] = [];
    const provider = new DeepSeekNovelProvider({
      model: 'deepseek-v4-pro',
      structureModel: 'deepseek-v4-flash',
      client: {
        async chat(request) {
          requests.push(request);
          return {
            content: JSON.stringify({
              title: '设定档案',
              summary: '人物和规则清晰。',
              content: {
                title: '设定档案',
                summary: '人物和规则清晰。',
                sections: [{ title: '人物关系', body: '主角和反派目标清楚。', items: ['主角要逆袭', '反派制造阻力'] }],
                stages: [],
                chapters: [],
                riskTags: [],
                recommendation: '可进入大纲。'
              },
              score: 86,
              riskLevel: 'low',
              riskTags: [],
              recommendedReason: '结构稳定。'
            }),
            model: request.model,
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
          };
        }
      }
    });

    const result = await provider.generateAsset({ objectType: 'setting', novel: createNovel(), preferences: [], currentAssets: {} });
    const request = requests[0];
    const userPayload = JSON.parse(request.messages[1].content);

    assert.equal(result.title, '设定档案');
    assert.equal(request.model, 'deepseek-v4-flash');
    assert.equal(request.maxTokens, 2000);
    assert.match(userPayload.instruction, /聚焦人物设定/);
    assert.match(userPayload.outputSchemaHint, /结构任务返回/);
    assert.doesNotMatch(userPayload.outputSchemaHint, new RegExp('第1章试写返回|正文/重写返回|全书审稿返回'));
  });

  it('summarizes upstream structure context and uses the structure model for outline generation', async () => {
    const requests: ChatCompletionRequest[] = [];
    const provider = new DeepSeekNovelProvider({
      model: 'deepseek-v4-pro',
      structureModel: 'deepseek-v4-flash',
      client: {
        async chat(request) {
          requests.push(request);
          return {
            content: JSON.stringify({
              title: '全书大纲',
              summary: '全书主线稳定。',
              content: {
                title: '全书大纲',
                summary: '全书主线稳定。',
                sections: [{ title: '主线', body: '主角高考后布局商业帝国。', items: [] }],
                stages: [{ stageIndex: 1, title: '起势', chapterRange: '1-5', goal: '拿到第一桶金', conflict: '家人与对手质疑', payoff: '首战成名' }],
                chapters: [{ chapterNo: 1, stageIndex: 1, title: '第1章', wordTarget: 2000, goal: '发现重生机会', conflict: '资源不足', hook: '第一笔机会出现' }],
                riskTags: [],
                recommendation: '可进入阶段大纲。'
              },
              score: 86,
              riskLevel: 'low',
              riskTags: [],
              recommendedReason: '主线清晰。'
            }),
            model: request.model,
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
          };
        }
      }
    });

    await provider.generateAsset({
      objectType: 'outline',
      novel: createNovel(),
      preferences: [],
      currentAssets: {
        setting: {
          title: '设定档案',
          summary: '人物关系稳定。',
          content: {
            summary: '人物关系稳定。',
            sections: [{ title: '人物', body: '很长的设定正文'.repeat(60), items: ['很长的条目'.repeat(40)] }]
          }
        }
      }
    });

    const request = requests[0];
    const userPayload = JSON.parse(request.messages[1].content);
    const serializedAssets = JSON.stringify(userPayload.payload.currentAssets);
    const section = userPayload.payload.currentAssets.setting.sections[0];

    assert.equal(request.model, 'deepseek-v4-flash');
    assert.equal(request.maxTokens, 1600);
    assert.match(userPayload.instruction, /关键转折/);
    assert.match(userPayload.outputSchemaHint, /\"stages\":\[\]/);
    assert.match(userPayload.outputSchemaHint, /\"chapters\":\[\]/);
    assert.ok(serializedAssets.length < 1000);
    assert.ok(section.body.length <= 123);
    assert.ok(section.body.endsWith('...'));
    assert.ok(section.items[0].length <= 83);
  });

  it('generates long chapter plans in chunks and merges them into one structure asset', async () => {
    const requests: ChatCompletionRequest[] = [];
    const provider = new DeepSeekNovelProvider({
      model: 'deepseek-v4-pro',
      structureModel: 'deepseek-v4-flash',
      client: {
        async chat(request) {
          requests.push(request);
          const payload = JSON.parse(request.messages[1].content);
          const start = payload.payload.chapterRange.start;
          const end = payload.payload.chapterRange.end;
          return {
            content: JSON.stringify({
              chapters: Array.from({ length: end - start + 1 }, (_, index) => {
                const chapterNo = start + index;
                return {
                  chapterNo,
                  stageIndex: Math.ceil(chapterNo / 20),
                  title: `第${chapterNo}章`,
                  wordTarget: 1200,
                  goal: `目标${chapterNo}`,
                  conflict: `冲突${chapterNo}`,
                  hook: `钩子${chapterNo}`
                };
              })
            }),
            model: request.model,
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
          };
        }
      }
    });

    const result = await provider.generateAsset({
      objectType: 'chapter_plan',
      novel: { ...createNovel(), chapterLimit: 45 },
      preferences: [],
      currentAssets: {
        stageOutline: {
          title: '阶段大纲',
          summary: '三阶段推进。',
          content: {
            stages: [
              { stageIndex: 1, title: '起势', chapterRange: '1-15', goal: '第一桶金', conflict: '质疑', payoff: '翻身' }
            ]
          }
        }
      }
    });

    assert.equal(requests.length, 5);
    assert.equal(result.objectType, 'chapter_plan');
    assert.equal(result.content.chapters.length, 45);
    assert.deepEqual(result.content.chapters.map((chapter) => chapter.chapterNo).slice(0, 3), [1, 2, 3]);
    assert.equal(result.content.chapters.at(-1)?.chapterNo, 45);
    assert.equal(requests[0].taskName, 'novel_structure_chapter_plan_1_10');
    assert.equal(requests[1].taskName, 'novel_structure_chapter_plan_11_20');
    assert.equal(requests[2].taskName, 'novel_structure_chapter_plan_21_30');
    assert.equal(requests[3].taskName, 'novel_structure_chapter_plan_31_40');
    assert.equal(requests[4].taskName, 'novel_structure_chapter_plan_41_45');
    assert.equal(requests[0].model, 'deepseek-v4-flash');
    assert.equal(requests[0].maxTokens, 2200);
    const firstPayload = JSON.parse(requests[0].messages[1].content);
    assert.match(firstPayload.outputSchemaHint, /章节目录分块/);
    assert.deepEqual(firstPayload.payload.requiredChapterNumbers.slice(0, 3), [1, 2, 3]);
  });

  it('uses the novel chapter word range for chapter plan targets and fallback values', async () => {
    const requests: ChatCompletionRequest[] = [];
    const provider = new DeepSeekNovelProvider({
      model: 'deepseek-v4-pro',
      client: {
        async chat(request) {
          requests.push(request);
          return {
            content: JSON.stringify({
              chapters: [
                {
                  chapterNo: 1,
                  stageIndex: 1,
                  title: '第一桶金',
                  goal: '拿到第一笔启动资金',
                  conflict: '亲友质疑',
                  hook: '订单突然翻倍'
                }
              ]
            }),
            model: request.model,
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
          };
        }
      }
    });

    const result = await provider.generateAsset({
      objectType: 'chapter_plan',
      novel: { ...createNovel(), chapterLimit: 1, chapterWordMin: 2200, chapterWordMax: 3200 },
      preferences: [],
      currentAssets: {}
    });

    const payload = JSON.parse(requests[0].messages[1].content);
    assert.match(payload.instruction, /2200-3200/);
    assert.doesNotMatch(payload.instruction, /1000-1800/);
    assert.equal(result.content.chapters[0].wordTarget, 2700);
  });

  it('sends chapter word target constraints when generating a body chapter', async () => {
    const requests: ChatCompletionRequest[] = [];
    const provider = new DeepSeekNovelProvider({
      model: 'deepseek-v4-pro',
      client: {
        async chat(request) {
          requests.push(request);
          return {
            content: JSON.stringify({
              title: '第4章 订单翻倍',
              content: '正文内容。'.repeat(300),
              summary: '主角拿到关键订单。',
              riskLevel: 'low',
              riskTags: [],
              aiRecommendedReason: '承接主线。',
              scoring: { totalScore: 86, dimensions: [] },
              featureCard: {},
              review: { totalScore: 86, issues: [], suggestions: [], riskLevel: 'low' },
              memory: { summary: '订单线推进。', facts: [], foreshadows: [] },
              hardFailed: false,
              hardFailureReasons: []
            }),
            model: request.model,
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
          };
        }
      }
    });

    await provider.generateBodyChapter({
      novel: { ...createNovel(), chapterWordMin: 2200, chapterWordMax: 3200 },
      chapter: { ...createChapter(4), wordTarget: 2600 },
      strategySnapshot: {},
      previousContent: null,
      previousMemory: null,
      previousBatchNotes: [],
      enhancedReview: false
    });

    const payload = JSON.parse(requests[0].messages[1].content);
    assert.equal(payload.payload.chapter.wordTarget, 2600);
    assert.match(payload.payload.wordTargetPolicy.instruction, /2600/);
    assert.match(payload.payload.wordTargetPolicy.instruction, /低于/);
  });

  it('summarizes adopted direction context before setting generation', async () => {
    const requests: ChatCompletionRequest[] = [];
    const provider = new DeepSeekNovelProvider({
      model: 'deepseek-v4-pro',
      structureModel: 'deepseek-v4-flash',
      client: {
        async chat(request) {
          requests.push(request);
          return {
            content: JSON.stringify({
              title: '系统逆袭设定',
              summary: '主角、反派和返还系统边界清晰。',
              content: {
                title: '系统逆袭设定',
                summary: '主角、反派和返还系统边界清晰。',
                sections: [{ title: '人物关系', body: '主角靠系统翻盘，反派不断设局。', items: ['系统返还有冷却', '反派掌握旧公司资源'] }],
                stages: [],
                chapters: [],
                riskTags: [],
                recommendation: '可进入大纲。'
              },
              score: 86,
              riskLevel: 'low',
              riskTags: [],
              recommendedReason: '设定可支撑后续结构。'
            }),
            model: request.model,
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
          };
        }
      }
    });

    await provider.generateAsset({
      objectType: 'setting',
      novel: createNovel(),
      preferences: [],
      currentAssets: {
        direction: {
          title: '财富返还系统：从亏空亿万开始',
          summary: '前世公司亏空，被陷害入狱。',
          content: '前世公司亏空，被陷害入狱，重生后绑定商业返还系统，任何消费双倍返现。'.repeat(8),
          score: 88,
          riskLevel: 'low',
          recommendedReason: '商业逆袭主线清晰。'.repeat(10)
        },
        setting: null
      }
    });

    const userPayload = JSON.parse(requests[0].messages[1].content);
    const direction = userPayload.payload.currentAssets.direction;

    assert.equal(direction.title, '财富返还系统：从亏空亿万开始');
    assert.ok(direction.content.length <= 263);
    assert.ok(direction.content.endsWith('...'));
    assert.equal(userPayload.payload.currentAssets.setting, null);
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

  it('uses the faster structure model and bounded output for trial chapter-one candidates', async () => {
    let capturedRequest: Parameters<LlmClient['chat']>[0] | null = null;
    const provider = new DeepSeekNovelProvider({
      model: 'deepseek-v4-pro',
      structureModel: 'deepseek-v4-flash',
      client: {
        async chat(request) {
          capturedRequest = request;
          return {
            content: JSON.stringify({
              candidates: [createTrialCandidateJson('候选 A'), createTrialCandidateJson('候选 B'), createTrialCandidateJson('候选 C')]
            }),
            model: request.model,
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
          };
        }
      }
    });

    await provider.generateChapterOneCandidates({
      novel: createNovel(),
      preferences: [],
      chapters: [createChapter(1)],
      chapterCount: 3
    });

    assert.equal(capturedRequest?.model, 'deepseek-v4-flash');
    assert.equal(capturedRequest?.maxTokens, 4200);
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
