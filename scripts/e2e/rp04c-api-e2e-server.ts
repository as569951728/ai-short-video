import type { FastifyInstance } from 'fastify';
import type { FullReviewDraft } from '../../apps/api/src/modules/novels/domain/novelDomain.js';
import type { FullReviewProvider } from '../../apps/api/src/modules/novels/providers/mockFullReviewProvider.js';

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

  const delayMs = Math.max(0, Number(process.env.RP04C_PROVIDER_DELAY_MS ?? 20_000));
  const app: FastifyInstance = await buildApp({
    logger: false,
    novelRepository: createInMemoryNovelRepository(),
    videoRepository: createInMemoryVideoRepository(),
    aiProviderEnv: { AI_PROVIDER_MODE: 'mock' },
    fullReviewProvider: createRp04cFullReviewProvider(delayMs),
    requestContextResolver: async (request) => ({
      tenantId: 'tenant_rp04c_e2e',
      userId: 'user_rp04c_e2e',
      requestId: request.id,
      ip: request.ip,
      userAgent: request.headers['user-agent']
    })
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

function createRp04cFullReviewProvider(delayMs: number): FullReviewProvider {
  return {
    async generateFullReview(input): Promise<FullReviewDraft> {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const chapterId = (chapterNo: number) => {
        const id = input.chapterEvidence.find((item) => item.chapter.chapterNo === chapterNo)?.chapter.id;
        if (!id) throw new Error(`RP-04C fixture missing chapter ${chapterNo}`);
        return id;
      };

      return {
        totalScore: 68,
        rating: 'C',
        gateResult: 'blocked',
        summary: '检测到三类跨章节一致性冲突，必须处理或记录强制通过原因。',
        strengths: ['12 章正文、单章审稿和长期记忆证据覆盖完整'],
        problems: ['人物状态冲突', '时间线冲突', '关键事实冲突'],
        suggestions: ['按问题卡定位章节并修复后重新审稿'],
        dimensionScores: [
          { key: 'continuity', label: '长篇连贯性', score: 62, weight: 0.4, evidence: '三类跨章节冲突', penaltyPoints: 18 },
          { key: 'completion', label: '全书完成度', score: 88, weight: 0.3, evidence: '12 章证据完整', penaltyPoints: 0 },
          { key: 'video_fit', label: '视频化适配', score: 76, weight: 0.3, evidence: '需先解决一致性问题', penaltyPoints: 4 }
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
        reviewPolicyVersionId: 'rp04c-browser-policy-v1'
      };
    }
  };
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
    acceptedReason: null,
    sourceReviewReportId: ''
  };
}
