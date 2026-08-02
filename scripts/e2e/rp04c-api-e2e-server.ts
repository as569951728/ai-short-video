import type { FastifyInstance } from 'fastify';
import { LlmProviderError } from '../../apps/api/src/modules/ai/llmClient.js';
import type { FullReviewDraft } from '../../apps/api/src/modules/novels/domain/novelDomain.js';
import type { FullReviewProvider } from '../../apps/api/src/modules/novels/providers/mockFullReviewProvider.js';
import type { NovelProviderActionInputFor } from '../../apps/api/src/modules/novels/services/actionExecutionPlan.js';

const FORBIDDEN_ENV_KEYS = [
  'DATABASE_URL',
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY',
  'KIMI_API_KEY',
  'TTS_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'COS_SECRET_ID',
  'COS_SECRET_KEY',
  'MEDIA_STORAGE_URL',
  'STORAGE_ENDPOINT'
];

assertSafeE2eEnv(process.env);
void main();

function assertSafeE2eEnv(env: NodeJS.ProcessEnv) {
  const present = FORBIDDEN_ENV_KEYS.filter((key) => Boolean(env[key]));
  if (present.length > 0) {
    throw new Error(`RP-04C E2E refuses real environment variables: ${present.join(', ')}`);
  }
  if (env.E2E_PROFILE !== 'rp04c-local-inmemory') {
    throw new Error('RP-04C E2E requires E2E_PROFILE=rp04c-local-inmemory');
  }
  if (env.AI_PROVIDER_MODE && env.AI_PROVIDER_MODE !== 'mock') {
    throw new Error('RP-04C E2E only allows AI_PROVIDER_MODE=mock');
  }
}

async function main() {
  const [{ buildApp }, { createInMemoryNovelRepository }, { createInMemoryVideoRepository }] = await Promise.all([
    import('../../apps/api/src/app.js'),
    import('../../apps/api/src/modules/novels/repositories/inMemoryNovelRepository.js'),
    import('../../apps/api/src/modules/videos/repositories/inMemoryVideoRepository.js')
  ]);

  const delayMs = Math.max(45_000, Number(process.env.RP04C_PROVIDER_DELAY_MS ?? 45_000));
  const observer = createObserver(delayMs);
  const novelRepository = createInMemoryNovelRepository();
  const app: FastifyInstance = await buildApp({
    logger: false,
    enableAcceptanceSeeds: true,
    novelRepository,
    videoRepository: createInMemoryVideoRepository(),
    aiProviderEnv: { AI_PROVIDER_MODE: 'mock' },
    fullReviewProvider: createRp04cFullReviewProvider(delayMs, observer),
    requestContextResolver: async (request) => ({
      tenantId: 'tenant_rp04c_e2e',
      userId: 'user_rp04c_e2e',
      requestId: request.id,
      ip: request.ip,
      userAgent: request.headers['user-agent']
    })
  });

  app.get('/__e2e/rp04c/state', async () => ({
    success: true,
    data: {
      ...observer,
      fullReviewTasks: novelRepository.getGenerationTasks()
        .filter((task) => task.taskType === 'novel_full_review')
        .map((task) => ({
          id: task.id,
          status: task.status,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString()
        }))
    },
    requestId: 'rp04c-safe-observer'
  }));
  app.post('/__e2e/rp04c/fail-next-output-parse', async () => {
    observer.failNextOutputParse = true;
    return { success: true, data: { armed: true }, requestId: 'rp04c-safe-observer' };
  });

  const port = Number(process.env.PORT ?? 0);
  await app.listen({ host: '127.0.0.1', port });
  console.log(`RP-04C API ready on ${port}; deterministic provider delay ${delayMs}ms`);

  async function close() {
    await app.close();
  }
  process.once('SIGTERM', () => close().finally(() => process.exit(0)));
  process.once('SIGINT', () => close().finally(() => process.exit(0)));
}

type FullReviewInput = NovelProviderActionInputFor<'novel_full_review'>;

interface Rp04cObserver {
  fixtureVersion: 'rp04c-browser-12ch-v1';
  modelRouteSafeName: 'deterministic-delay-provider';
  providerDelayMs: number;
  providerCallCount: number;
  outputParseFailureCallCount: number;
  failNextOutputParse: boolean;
  providerActive: boolean;
  providerCompleted: boolean;
  chapterCount: number;
  coveredChapterNos: number[];
  contentEvidenceCount: number;
  featureEvidenceCount: number;
  reviewEvidenceCount: number;
  memoryEvidenceCount: number;
  manifestHash: string | null;
  evidenceHash: string | null;
}

function createObserver(delayMs: number): Rp04cObserver {
  return {
    fixtureVersion: 'rp04c-browser-12ch-v1',
    modelRouteSafeName: 'deterministic-delay-provider',
    providerDelayMs: delayMs,
    providerCallCount: 0,
    outputParseFailureCallCount: 0,
    failNextOutputParse: false,
    providerActive: false,
    providerCompleted: false,
    chapterCount: 0,
    coveredChapterNos: [],
    contentEvidenceCount: 0,
    featureEvidenceCount: 0,
    reviewEvidenceCount: 0,
    memoryEvidenceCount: 0,
    manifestHash: null,
    evidenceHash: null
  };
}

function createRp04cFullReviewProvider(delayMs: number, observer: Rp04cObserver): FullReviewProvider {
  return {
    async generateFullReview(input): Promise<FullReviewDraft> {
      if (observer.failNextOutputParse) {
        observer.failNextOutputParse = false;
        observer.outputParseFailureCallCount += 1;
        throw new LlmProviderError('output_parse_failed', 'schema invalid RP04C_RAW_MODEL_CANARY', {
          outputKind: 'schema_invalid',
          reason: 'schema_invalid'
        });
      }
      recordAndAssertEvidence(input, observer);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const chapterId = (chapterNo: number) => {
        const id = input.chapterEvidence.find((item) => item.chapter.chapterNo === chapterNo)?.chapter.id;
        if (!id) throw new Error(`RP-04C fixture missing chapter ${chapterNo}`);
        return id;
      };

      const result: FullReviewDraft = {
        totalScore: 68,
        rating: 'C',
        gateResult: 'blocked',
        summary: '检测到三类跨章节一致性冲突，必须处理或记录强制通过原因。',
        strengths: ['12 章正文、单章审稿和长期记忆证据覆盖完整'],
        problems: ['人物状态冲突', '时间线冲突', '关键事实冲突'],
        suggestions: ['按问题卡定位章节并修复后重新审稿'],
        dimensionScores: [
          { key: 'stage_continuity', label: '阶段连续性', score: 70, weight: 1 / 6, evidence: '十二章阶段目标证据完整', penaltyPoints: 10 },
          { key: 'character_continuity', label: '人物状态连续性', score: 60, weight: 1 / 6, evidence: '第 2 章与第 8 章人物状态冲突', penaltyPoints: 18 },
          { key: 'timeline_continuity', label: '时间线连续性', score: 68, weight: 1 / 6, evidence: '第 4 章与第 9 章事件顺序冲突', penaltyPoints: 12 },
          { key: 'fact_consistency', label: '关键事实一致性', score: 76, weight: 1 / 6, evidence: '第 6 章与第 11 章合同金额冲突', penaltyPoints: 8 },
          { key: 'foreshadowing', label: '伏笔回收', score: 68, weight: 1 / 6, evidence: '十二章伏笔证据已覆盖', penaltyPoints: 12 },
          { key: 'evidence_grounding', label: '证据定位', score: 66, weight: 1 / 6, evidence: '每个问题均定位到权威章节', penaltyPoints: 14 }
        ],
        issues: [
          createBlockingIssue('rp04c-character', '人物状态冲突', '角色在前文确认死亡，后文却无解释重新出现。', [chapterId(2), chapterId(8)], 'character_continuity'),
          createBlockingIssue('rp04c-timeline', '时间线冲突', '相邻事件日期顺序与已建立时间线矛盾。', [chapterId(4), chapterId(9)], 'timeline_continuity'),
          createBlockingIssue('rp04c-fact', '关键事实冲突', '同一合同金额在前后章节出现互斥数值。', [chapterId(6), chapterId(11)], 'fact_consistency')
        ],
        videoSuggestion: '先解决全书一致性阻断，再进入待视频化检查。',
        firstVideoSuggestion: {
          chapterRange: '第 1-3 章',
          openingSlice: '主角在低谷中发现第一条翻盘线索。',
          narrationHook: '他以为自己失去了一切，却在旧合同里发现了逆转证据。',
          firstScreenSubtitle: '破产当天，他看见了未来。',
          titleHook: '一份旧合同，改写了他的结局',
          endingSuspense: '真正的幕后人还没有现身。',
          suggestedFormat: '旁白音频 + 字幕 + 循环背景视频',
          riskTips: ['全书一致性阻断未解除前不得确认完成。']
        },
        platformRisks: [],
        originalityRisks: [],
        aiFlavorRisks: ['跨章节一致性需人工复核'],
        lowScoreContinueRisks: ['强制通过会把已知连续性错误带入后续视频化。'],
        reviewPolicyVersionId: input.coverageManifest.policyProfileVersionId!
      };
      observer.providerActive = false;
      observer.providerCompleted = true;
      return result;
    }
  };
}

function recordAndAssertEvidence(input: FullReviewInput, observer: Rp04cObserver) {
  observer.providerCallCount += 1;
  observer.providerActive = true;
  observer.providerCompleted = false;
  observer.chapterCount = input.coverageManifest.chapterCount;
  observer.coveredChapterNos = [...input.coverageManifest.coveredChapterNos];
  observer.contentEvidenceCount = input.chapterEvidence.filter((item) => Boolean(item.content.contentVersionId && item.content.contentHash)).length;
  observer.featureEvidenceCount = input.chapterEvidence.filter((item) => Boolean(item.featureCard.featureCardVersionId && item.featureCard.featureCardHash)).length;
  observer.reviewEvidenceCount = input.chapterEvidence.filter((item) => Boolean(item.review.reviewReportId && item.review.reviewHash)).length;
  observer.memoryEvidenceCount = input.memory.memoryId && input.memory.memoryHash ? 1 : 0;
  observer.manifestHash = input.coverageManifest.manifestHash;
  observer.evidenceHash = input.evidenceHash;

  const expected = Array.from({ length: 12 }, (_, index) => index + 1);
  const uniqueChapterNos = new Set(observer.coveredChapterNos);
  if (observer.providerCallCount !== 1) throw new Error('RP-04C E2E provider was called more than once');
  if (observer.chapterCount !== 12 || input.chapterEvidence.length !== 12) throw new Error('RP-04C E2E requires exactly 12 chapters');
  if (uniqueChapterNos.size !== 12 || expected.some((chapterNo, index) => observer.coveredChapterNos[index] !== chapterNo)) {
    throw new Error('RP-04C E2E chapter coverage must be unique and ordered 1-12');
  }
  if ([observer.contentEvidenceCount, observer.featureEvidenceCount, observer.reviewEvidenceCount].some((count) => count !== 12)) {
    throw new Error('RP-04C E2E requires content, feature, and review evidence for every chapter');
  }
  if (observer.memoryEvidenceCount !== 1 || !observer.manifestHash || !observer.evidenceHash) {
    throw new Error('RP-04C E2E requires memory and evidence hashes');
  }
}

function createBlockingIssue(
  issueId: string,
  title: string,
  plainDescription: string,
  scopeRefs: string[],
  dimension: string
) {
  return {
    issueId,
    title,
    plainDescription,
    severity: 'blocking' as const,
    scopeType: 'chapter' as const,
    scopeRefs,
    dimension,
    blocking: true,
    recommendedTarget: 'chapter',
    recommendedAction: '修复涉及章节后重新执行全书审稿。',
    status: 'open' as const,
    acceptedReason: null
  };
}
