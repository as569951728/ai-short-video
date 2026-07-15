import { RiskLevel, type StructureAssetContentDTO } from '@ai-shortvideo/shared';
import type { StructureAssetDraft } from '../domain/novelDomain.js';
import type { NovelPreferencesProviderInputV1, NovelProviderActionInputFor, NovelProviderInputV1 } from '../services/actionExecutionPlan.js';

type StructureProviderInput = NovelProviderActionInputFor<'setting_generate' | 'outline_generate' | 'stage_outline_generate' | 'chapter_plan_generate'>;

export interface StructureProvider {
  generateAsset(input: StructureProviderInput): Promise<StructureAssetDraft>;
}

export class MockStructureProvider implements StructureProvider {
  async generateAsset(input: StructureProviderInput) {
    if (input.objectType === 'setting') return createSettingAsset(input.novel, input.preferences);
    if (input.objectType === 'outline') return createOutlineAsset(input.novel, input.preferences);
    if (input.objectType === 'stage_outline') return createStageOutlineAsset(input.novel, input.preferences);
    return createChapterPlanAsset(input.novel, input.preferences);
  }
}

function createSettingAsset(novel: NovelProviderInputV1, preferences: NovelPreferencesProviderInputV1): StructureAssetDraft {
  const genre = novel.genres[0] ?? '都市逆袭';
  const appeal = preferences.appealPoints[0] ?? '低谷翻盘';
  const title = `${genre}设定档：${appeal}成长线`;
  const content: StructureAssetContentDTO = {
    title,
    summary: `围绕 ${appeal} 建立主角、对手、世界规则和短视频钩子，作为后续大纲事实源。`,
    sections: [
      {
        title: '主角与起点',
        body: '主角从被误解和资源不足的低谷起步，核心优势是能把失败复盘成可执行的成长路径。',
        items: ['初始身份弱', '目标明确', '成长能力可解释']
      },
      {
        title: '世界规则',
        body: '系统能力只提供提示和训练方向，关键胜利必须依赖主角选择，避免万能外挂。',
        items: ['能力有限制', '反击有代价', '每次升级带来新压力']
      },
      {
        title: '爽点设计',
        body: '前三章用强压迫建立情绪，再通过公开反击、证据反转和身份刷新持续兑现爽点。',
        items: ['被看轻', '证据反击', '身份反转', '阶段性胜利']
      }
    ],
    stages: [],
    chapters: [],
    riskTags: ['系统设定需避免万能', '反派压迫不能过度重复'],
    recommendation: '设定要优先保持事实稳定，后续大纲和章节目录都基于该版本。'
  };

  return {
    objectType: 'setting',
    title,
    summary: content.summary,
    content,
    score: 84,
    riskLevel: RiskLevel.Low,
    riskTags: content.riskTags,
    recommendedReason: '人物动机、世界规则和爽点承接完整，适合进入全书大纲。'
  };
}

function createOutlineAsset(novel: NovelProviderInputV1, preferences: NovelPreferencesProviderInputV1): StructureAssetDraft {
  const stageCount = preferences.stageCount ?? 4;
  const title = `${novel.title} 全书大纲`;
  const content: StructureAssetContentDTO = {
    title,
    summary: `以 ${stageCount} 个阶段推进，从低谷翻盘到公开胜利，支撑 ${novel.chapterLimit} 章长篇展开。`,
    sections: [
      {
        title: '主线目标',
        body: '主角从被迫背锅切入，逐步拿到证据、建立队友、拆解反派资源链，最终完成身份与事业双反转。',
        items: ['低谷开局', '首次反击', '资源升级', '终局清算']
      },
      {
        title: '阶段节奏',
        body: '每个阶段都要有一个可视化胜利和一个新危机，避免只有升级没有冲突。',
        items: ['阶段目标清晰', '阶段末必须有反转', '伏笔跨阶段回收']
      }
    ],
    stages: createStageItems(stageCount, novel.chapterLimit),
    chapters: [],
    riskTags: ['中段节奏需防重复'],
    recommendation: '全书大纲可采用，下一步拆成更细的阶段大纲。'
  };

  return {
    objectType: 'outline',
    title,
    summary: content.summary,
    content,
    score: 82,
    riskLevel: RiskLevel.Low,
    riskTags: content.riskTags,
    recommendedReason: '主线、阶段目标和长篇承接关系清楚。'
  };
}

function createStageOutlineAsset(novel: NovelProviderInputV1, preferences: NovelPreferencesProviderInputV1): StructureAssetDraft {
  const stageCount = preferences.stageCount ?? 4;
  const title = `${novel.title} 阶段大纲`;
  const stages = createStageItems(stageCount, novel.chapterLimit);
  const content: StructureAssetContentDTO = {
    title,
    summary: `将全书拆成 ${stages.length} 个创作阶段，每阶段明确目标、冲突和阶段钩子。`,
    sections: stages.map((stage) => ({
      title: stage.title,
      body: `${stage.goal} ${stage.conflict} 阶段收束点：${stage.payoff}`,
      items: [stage.chapterRange, stage.goal, stage.conflict, stage.payoff]
    })),
    stages,
    chapters: [],
    riskTags: ['阶段衔接需要在章节目录中继续细化'],
    recommendation: '阶段大纲可采用，下一步生成逐章目录。'
  };

  return {
    objectType: 'stage_outline',
    title,
    summary: content.summary,
    content,
    score: 80,
    riskLevel: RiskLevel.Medium,
    riskTags: content.riskTags,
    recommendedReason: '阶段边界清晰，可以支撑章节目录生成。'
  };
}

function createChapterPlanAsset(novel: NovelProviderInputV1, preferences: NovelPreferencesProviderInputV1): StructureAssetDraft {
  const title = `${novel.title} 章节目录`;
  const stages = createStageItems(preferences.stageCount ?? 4, novel.chapterLimit);
  const chapters = Array.from({ length: novel.chapterLimit }, (_, index) => {
    const chapterNo = index + 1;
    const stageIndex = Math.min(stages.length, Math.floor(index / Math.ceil(novel.chapterLimit / stages.length)) + 1);
    const wordTarget = Math.round((novel.chapterWordMin + novel.chapterWordMax) / 2);

    return {
      chapterNo,
      stageIndex,
      title: `第${chapterNo}章 ${getChapterTitle(chapterNo, stageIndex)}`,
      wordTarget,
      goal: getChapterGoal(chapterNo, stageIndex),
      conflict: getChapterConflict(chapterNo, stageIndex),
      hook: getChapterHook(chapterNo, stageIndex)
    };
  });
  const content: StructureAssetContentDTO = {
    title,
    summary: `生成 ${chapters.length} 章目录，每章包含目标、冲突和结尾钩子；仅作为试写前结构计划。`,
    sections: [
      {
        title: '章节目录说明',
        body: '本版本只创建章节计划，不生成正文。采用后章节会进入待试写状态。',
        items: ['章节目标', '核心冲突', '结尾钩子', '目标字数']
      }
    ],
    stages,
    chapters,
    riskTags: ['目录需要在试写后按反馈微调'],
    recommendation: '章节目录完整，可采用进入试写前置状态。'
  };

  return {
    objectType: 'chapter_plan',
    title,
    summary: content.summary,
    content,
    score: 81,
    riskLevel: RiskLevel.Low,
    riskTags: content.riskTags,
    recommendedReason: '章节计划字段完整，能够创建 NovelChapter 计划。'
  };
}

function createStageItems(stageCount: number, chapterLimit: number) {
  const count = Math.max(1, stageCount);
  const chaptersPerStage = Math.ceil(chapterLimit / count);

  return Array.from({ length: count }, (_, index) => {
    const stageIndex = index + 1;
    const start = index * chaptersPerStage + 1;
    const end = Math.min(chapterLimit, (index + 1) * chaptersPerStage);

    return {
      stageIndex,
      title: `第${stageIndex}阶段：${getStageTitle(stageIndex)}`,
      chapterRange: `${start}-${end}章`,
      goal: getStageGoal(stageIndex),
      conflict: getStageConflict(stageIndex),
      payoff: getStagePayoff(stageIndex)
    };
  });
}

function getStageTitle(stageIndex: number) {
  return ['低谷破局', '资源升级', '正面交锋', '终局反转'][stageIndex - 1] ?? `阶段${stageIndex}`;
}

function getStageGoal(stageIndex: number) {
  return ['建立压迫与第一次反击', '获得关键资源并扩大优势', '揭开反派布局并公开对抗', '完成证据闭环和身份反转'][stageIndex - 1] ?? '推进主线目标';
}

function getStageConflict(stageIndex: number) {
  return ['主角被误解且缺少信任', '新资源带来更强对手', '反派开始主动围剿', '最终选择需要承担代价'][stageIndex - 1] ?? '阶段冲突升级';
}

function getStagePayoff(stageIndex: number) {
  return ['公开完成第一次反击', '拿到核心盟友或资源', '反派真实目的曝光', '主角获得终局胜利'][stageIndex - 1] ?? '阶段胜利兑现';
}

function getChapterTitle(chapterNo: number, stageIndex: number) {
  if (chapterNo === 1) return '背锅开局';
  if (chapterNo % 10 === 0) return '阶段反击';
  return `${getStageTitle(stageIndex)}节点`;
}

function getChapterGoal(chapterNo: number, stageIndex: number) {
  return chapterNo === 1 ? '用强压迫建立主角低谷处境' : `${getStageTitle(stageIndex)}阶段推进一个可见目标`;
}

function getChapterConflict(chapterNo: number, stageIndex: number) {
  return chapterNo % 5 === 0 ? '反派制造公开危机，迫使主角选择' : `${getStageConflict(stageIndex)}的具体章节化冲突`;
}

function getChapterHook(chapterNo: number, stageIndex: number) {
  return chapterNo % 8 === 0 ? '结尾抛出新证据或身份反转' : `${getStagePayoff(stageIndex)}前留下下一章钩子`;
}
