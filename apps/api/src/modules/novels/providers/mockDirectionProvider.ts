import { RiskLevel, type DirectionCandidateContentDTO } from '@ai-shortvideo/shared';
import type { DirectionCandidateDraft } from '../domain/novelDomain.js';
import type { NovelProviderActionInputFor } from '../services/actionExecutionPlan.js';

type DirectionGenerateInput = NovelProviderActionInputFor<'direction_generate'>;
type DirectionFuseInput = NovelProviderActionInputFor<'direction_fuse'>;
type DirectionOptimizeInput = NovelProviderActionInputFor<'direction_optimize'>;

export interface DirectionProvider {
  generateCandidates(input: DirectionGenerateInput): Promise<DirectionCandidateDraft[]>;
  fuseCandidates(input: DirectionFuseInput): Promise<DirectionCandidateDraft>;
  optimizeCandidate(input: DirectionOptimizeInput): Promise<DirectionCandidateDraft>;
}

export class MockDirectionProvider implements DirectionProvider {
  async generateCandidates(input: DirectionGenerateInput) {
    const genre = input.novel.genres[0] ?? '都市逆袭';
    const appeal = input.preferences.appealPoints[0] ?? '低谷翻盘';
    const audience = input.preferences.targetAudience ?? '18-35 岁爽文用户';

    return [
      createCandidate({
        title: `${genre}：低谷系统翻盘线`,
        logline: `主角在最低谷获得可解释的成长系统，用 ${appeal} 把压迫逐步反打回去。`,
        coreHook: '前三章先给强压迫，再用第一次公开反击制造爽感。',
        audienceAppeal: audience,
        videoPotential: '适合拆成“被看轻-反击-身份反转”的口播短视频。',
        sellingPoints: ['反击节奏明确', '系统能力可持续升级', '短视频钩子清晰'],
        riskTags: ['系统设定需避免万能'],
        recommendation: '优先推荐，适合作为设定阶段输入。',
        score: 86,
        marketScore: 88,
        riskLevel: RiskLevel.Low,
        recommendedReason: '题材、爽点和视频化表达都比较稳。'
      }),
      createCandidate({
        title: `${genre}：身份反转复仇线`,
        logline: '主角被亲近关系误判后，用隐藏身份和资源完成连续反击。',
        coreHook: '离场即反转，第一集就给身份悬念。',
        audienceAppeal: audience,
        videoPotential: '身份反转适合做强标题，但需要控制狗血密度。',
        sellingPoints: ['身份悬念强', '情绪冲突直接', '适合连续短剧式切片'],
        riskTags: ['同质化风险', '关系冲突需克制'],
        recommendation: '可作为备选，适合更强情绪向。',
        score: 78,
        marketScore: 82,
        riskLevel: RiskLevel.Medium,
        recommendedReason: '吸引力强，但需要后续设定阶段压住套路感。'
      }),
      createCandidate({
        title: `${genre}：职场逆袭成长线`,
        logline: '主角从被边缘化的普通员工开始，靠专业判断和关键选择逐步翻盘。',
        coreHook: '从一次背锅事件切入，用证据链完成第一轮反击。',
        audienceAppeal: audience,
        videoPotential: '适合知识型口播和情绪爽点结合。',
        sellingPoints: ['现实感较强', '成长路径可信', '适合长篇持续升级'],
        riskTags: ['开篇爆点偏弱'],
        recommendation: '适合稳健长篇，但要强化开篇钩子。',
        score: 72,
        marketScore: 70,
        riskLevel: RiskLevel.Low,
        recommendedReason: '可信度高，市场爆发力略弱。'
      }),
      createCandidate({
        title: `${genre}：冷门实验反差线`,
        logline: '主角以反常识方式破局，前期制造强反差，后期靠连续实验升级。',
        coreHook: '第一集用“所有人都看不懂”的动作制造争议。',
        audienceAppeal: audience,
        videoPotential: '有话题性，但转化不稳定。',
        sellingPoints: ['差异化明显', '话题反差强', '可做测试内容'],
        riskTags: ['理解成本高', '爽点兑现慢'],
        recommendation: '低分候选，仅建议在明确测试目的下采用。',
        score: 62,
        marketScore: 58,
        riskLevel: RiskLevel.High,
        recommendedReason: '差异化强但小白读者理解成本偏高。'
      })
    ];
  }

  async fuseCandidates(input: DirectionFuseInput) {
    const [first, second] = input.sources;

    return createCandidate({
      title: `融合方向：${first.title} + ${second?.title ?? '强化钩子'}`,
      logline: `${first.content.logline} 同时吸收 ${second?.content.coreHook ?? '更强视频钩子'}。`,
      coreHook: input.reason || '保留强反击开篇，并把身份悬念提前到第一集。',
      audienceAppeal: first.content.audienceAppeal,
      videoPotential: '融合后更适合先做 1-3 集短视频测试。',
      sellingPoints: [...first.content.sellingPoints.slice(0, 2), ...(second?.content.sellingPoints.slice(0, 1) ?? ['钩子更集中'])],
      riskTags: Array.from(new Set([...first.riskTags, ...(second?.riskTags ?? [])])).slice(0, 3),
      recommendation: '融合候选，采用前建议确认设定阶段能承接。',
      score: Math.min(90, Math.round(((first.score + (second?.score ?? first.score)) / 2) + 4)),
      marketScore: Math.min(92, Math.round(((first.marketScore + (second?.marketScore ?? first.marketScore)) / 2) + 5)),
      riskLevel: RiskLevel.Medium,
      recommendedReason: '融合了更稳的长篇承接和更强的视频钩子。'
    });
  }

  async optimizeCandidate(input: DirectionOptimizeInput) {
    return createCandidate({
      title: `${input.source.title}（优化版）`,
      audienceAppeal: input.source.content.audienceAppeal,
      videoPotential: input.source.content.videoPotential,
      sellingPoints: input.source.content.sellingPoints,
      riskTags: input.source.riskTags,
      coreHook: input.instruction || '强化开局压迫、首次反击和视频前三秒钩子。',
      logline: `${input.source.content.logline} 优化后更早兑现第一次反击。`,
      recommendation: '优化候选，适合再次比较后采用。',
      score: Math.min(95, input.source.score + 5),
      marketScore: Math.min(95, input.source.marketScore + 4),
      riskLevel: input.source.riskLevel === RiskLevel.High ? RiskLevel.Medium : input.source.riskLevel,
      recommendedReason: '优化后开篇目标更明确，适合进入设定阶段。'
    });
  }
}

function createCandidate(input: {
  title: string;
  logline: string;
  coreHook: string;
  audienceAppeal: string;
  videoPotential: string;
  sellingPoints: string[];
  riskTags: string[];
  recommendation: string;
  score: number;
  marketScore: number;
  riskLevel: RiskLevel;
  recommendedReason: string;
}): DirectionCandidateDraft {
  const content: DirectionCandidateContentDTO = {
    title: input.title,
    logline: input.logline,
    coreHook: input.coreHook,
    audienceAppeal: input.audienceAppeal,
    videoPotential: input.videoPotential,
    sellingPoints: input.sellingPoints,
    riskTags: input.riskTags,
    recommendation: input.recommendation
  };

  return {
    title: input.title,
    summary: input.logline,
    content,
    score: input.score,
    marketScore: input.marketScore,
    riskLevel: input.riskLevel,
    riskTags: input.riskTags,
    recommendedReason: input.recommendedReason
  };
}
