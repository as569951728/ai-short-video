import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Copy,
  DollarSign,
  Download,
  FileText,
  FolderOpen,
  Lightbulb,
  MessageSquare,
  PenLine,
  Play,
  RefreshCw,
  Save,
  Settings,
  Sparkles,
  Trash2,
  User,
  Wand2
} from 'lucide-react';
import './styles.css';

type Screen =
  | 'home'
  | 'wizard'
  | 'editor'
  | 'quality'
  | 'export'
  | 'publish'
  | 'review'
  | 'cases'
  | 'profile'
  | 'revenue'
  | 'settings';

type Platform = '抖音' | '视频号' | '小红书' | 'B站';
type Genre = '都市逆袭' | '悬疑反转' | '情感故事' | '职场复仇' | 'AI 科幻';
type Goal = '故事短视频' | '小说转短视频' | '故事草稿';

interface CreationInput {
  goal: Goal;
  platform: Platform;
  genre: Genre;
  idea: string;
}

interface StoryboardRow {
  scene: string;
  voiceover: string;
  visual: string;
  subtitle: string;
}

interface QualityScore {
  hookStrength: number;
  emotionalDensity: number;
  conflictClarity: number;
  informationGain: number;
  conversationalStyle: number;
  visualExecutability: number;
  platformFit: number;
  samenessRisk: number;
  copyrightRisk: number;
  aiTraceRisk: number;
  recommendations: string[];
}

interface GeneratedPackage {
  hook: string;
  script: string;
  storyboard: StoryboardRow[];
  subtitles: string[];
  titleOptions: string[];
  selectedTitle: string;
  coverCopyOptions: string[];
  selectedCoverCopy: string;
  publishCopy: string;
  score: QualityScore;
}

interface PublishRecord {
  platform: Platform;
  publishedAt: string;
  url: string;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  follows: number;
  notes: string;
}

interface AccountProfile {
  accountName: string;
  targetAudience: string;
  contentStyle: string;
  monetizationGoal: string;
}

type RevenueStatus = '待联系' | '已联系' | '已发样片' | '已报价' | '已体验' | '强意向' | '已付款' | '无效';

interface RevenueLead {
  id: string;
  name: string;
  channel: string;
  need: string;
  offer: string;
  status: RevenueStatus;
  amount: number;
  nextAction: string;
  reply?: string;
  objection?: string;
  followUpAt?: string;
  deliveryNote?: string;
  validationSignal?: string;
  note: string;
  createdAt: string;
}

interface TouchpointSeed {
  name: string;
  channel: string;
  need: string;
  nextAction: string;
}

interface ModelQualityCase {
  name: string;
  input: CreationInput;
  focus: string;
}

interface ModelQualityResult {
  caseName: string;
  idea: string;
  title: string;
  score: number;
  passed: boolean;
  source: string;
  message: string;
  warnings: string[];
}

interface OperatingStep {
  label: string;
  why: string;
  done: boolean;
  actionLabel: string;
  targetScreen: Screen;
}

interface Project {
  id: string;
  input: CreationInput;
  profile?: AccountProfile;
  generated: GeneratedPackage;
  publishRecord?: PublishRecord;
  isShowcase?: boolean;
  createdAt: string;
}

interface VideoPlanSegment {
  index: number;
  start: number;
  end: number;
  duration: number;
  scene: string;
  voiceover: string;
  visual: string;
  subtitle: string;
}

interface VideoPlan {
  title: string;
  coverCopy: string;
  totalDuration: number;
  aspectRatio: string;
  resolution: string;
  segments: VideoPlanSegment[];
  srt: string;
  ffmpegDraft: string;
  renderRoute: string;
}

const platforms: Platform[] = ['抖音', '视频号', '小红书', 'B站'];
const genres: Genre[] = ['都市逆袭', '悬疑反转', '情感故事', '职场复仇', 'AI 科幻'];
const goals: Goal[] = ['故事短视频', '小说转短视频', '故事草稿'];

const defaultInput: CreationInput = {
  goal: '故事短视频',
  platform: '抖音',
  genre: '都市逆袭',
  idea: ''
};

const firstDemoShowcaseProject: Project = {
  id: 'showcase-2026-06-07-ai-automation-project-rescue',
  input: {
    goal: '故事短视频',
    platform: '抖音',
    genre: '职场复仇',
    idea: '程序员被甩锅项目失败，最后用 AI 自动化脚本找出关键数据被人故意隐藏，救回项目也救回自己'
  },
  profile: {
    accountName: 'AIShortvideo 演示账号',
    targetAudience: '想做内容副业但缺脚本和分镜的人',
    contentStyle: '强钩子、短句口语化、冲突清楚、结尾留悬念',
    monetizationGoal: '先用演示案例验证 29 元生成服务和 99 元诊断'
  },
  generated: {
    hook: '项目上线失败，老板让我背锅，可真正被改掉的不是代码，而是数据统计口径，你会怎么查？',
    script: `昨天下午，张总把我叫到办公室。

他把上线报告摔到桌上，说：项目失败，你要负全责。

我当时真的懵了。功能是按时上线的，接口也全都通过了，为什么核心指标会突然掉到谷底？

我回到工位，先没有解释，而是打开系统日志和数据报表。

很快我发现一个奇怪的地方：关键指标不是被清零，而是统计口径被改了。

原来报表只统计工作日白天的数据，晚上和周末的真实转化全被排除掉了。

这不是技术事故，这是有人动了规则。

我用 AI 写了一个自动化脚本，把最近三个月的报表配置、提交记录和权限变更全部扫了一遍。

十分钟后，结果出来了。

统计口径被改动的时间，刚好是在上线前一天晚上。

操作账号来自业务组，而那个组最近正准备把二期预算交给外包团队。

如果这个项目被判失败，内部团队就会被换掉，预算也会重新分配。

我拿着证据去找张总。

这次我没有争辩，只给他看三张图：原始数据、被改后的口径、AI 脚本跑出的变更记录。

会议室安静了很久。

最后张总只说了一句：先把真实数据恢复，项目重新评估。

当天晚上，我用脚本修复了报表，项目指标恢复正常。

我以为事情到这里就结束了。

但整理最后一份日志时，我发现还有一个更早的权限变更记录。

那个账号，不属于业务组，也不属于技术组。

下一集，我才知道，真正想让项目失败的人，比我想象中更近。`,
    storyboard: [
      { scene: '办公室被甩锅', voiceover: '张总把上线报告摔到桌上，说项目失败要我负责。', visual: '会议室，报告被推到桌前，主角沉默。', subtitle: '项目失败，程序员被要求背锅' },
      { scene: '回到工位查日志', voiceover: '我没有解释，而是打开系统日志和数据报表。', visual: '深夜工位，屏幕上日志快速滚动。', subtitle: '先别解释，先查证据' },
      { scene: '发现统计口径异常', voiceover: '关键指标不是被清零，而是统计口径被改了。', visual: '报表筛选条件被放大，显示只统计工作日白天。', subtitle: '真正被改掉的是统计口径' },
      { scene: 'AI 自动化脚本', voiceover: '我用 AI 写脚本，把报表配置和权限变更扫了一遍。', visual: 'AI 工具生成脚本，终端运行，结果输出。', subtitle: 'AI 脚本十分钟扫完三个月记录' },
      { scene: '找到动机', voiceover: '改动来自业务组，而二期预算正准备交给外包团队。', visual: '项目预算表、外包合同草稿、权限记录交叉展示。', subtitle: '项目失败，预算就会重新分配' },
      { scene: '会议室反击', voiceover: '我只给张总看三张图：原始数据、改后口径、变更记录。', visual: '投影上三张图并排出现，会议室安静。', subtitle: '不争辩，只摆证据' },
      { scene: '项目恢复', voiceover: '数据恢复后，项目指标重新正常。', visual: '看板曲线回升，主角松一口气。', subtitle: '项目被重新评估' },
      { scene: '悬念结尾', voiceover: '更早的权限变更记录，来自一个不属于任何项目组的账号。', visual: '屏幕停在陌生账号上，背景音突然降下来。', subtitle: '真正动手的人，还没出现' }
    ],
    subtitles: [
      '项目失败，程序员被要求背锅',
      '先别解释，先查证据',
      '真正被改掉的是统计口径',
      'AI 脚本十分钟扫完三个月记录',
      '项目失败，预算就会重新分配',
      '不争辩，只摆证据',
      '项目被重新评估',
      '真正动手的人，还没出现'
    ],
    titleOptions: [
      '项目失败被甩锅？我用 AI 脚本找出真正问题',
      '程序员被甩锅后，用 AI 查出项目失败真相',
      '一个脚本，让被甩锅的程序员翻了盘',
      '项目失败不是技术问题，而是数据口径被人动了手脚'
    ],
    selectedTitle: '项目失败被甩锅？我用 AI 脚本找出真正问题',
    coverCopyOptions: [
      '项目失败？先查统计口径',
      '一个 AI 脚本，查出甩锅真相',
      '不是代码错了，是数据口径被改了',
      '程序员反击：不争辩，只摆证据'
    ],
    selectedCoverCopy: '项目失败？先查统计口径',
    publishCopy: '这是 AIShortvideo 的一条系统演示案例：从一句“程序员被甩锅”的想法，生成钩子、脚本、分镜、字幕、封面文案和发布文案。它不承诺爆款，只展示系统如何把一个普通技术冲突变成可编辑、可质检、可交付的短视频脚本包。',
    score: {
      hookStrength: 4,
      emotionalDensity: 4,
      conflictClarity: 5,
      informationGain: 5,
      conversationalStyle: 4,
      visualExecutability: 4,
      platformFit: 4,
      samenessRisk: 4,
      copyrightRisk: 5,
      aiTraceRisk: 4,
      recommendations: [
        '对外沟通时说明这是系统演示案例，不承诺播放量或收入。',
        '发布前可以再补一个真实代码/报表截图式细节，降低短剧感。',
        '客户如果是非技术人，可把“统计口径”解释成“报表规则被人改过”。'
      ]
    }
  },
  isShowcase: true,
  createdAt: '2026-06-07T00:00:00.000Z'
};

const modelQualityCases: ModelQualityCase[] = [
  {
    name: '职场逆袭',
    input: {
      goal: '故事短视频',
      platform: '抖音',
      genre: '职场复仇',
      idea: '程序员发现项目失败不是技术问题，而是有人故意隐藏关键数据'
    },
    focus: '强冲突、反击动作、结尾悬念'
  },
  {
    name: '情感故事',
    input: {
      goal: '故事短视频',
      platform: '视频号',
      genre: '情感故事',
      idea: '一个总是退让的人，终于在家庭聚餐上说出真实想法'
    },
    focus: '情绪递进、口语化、真实细节'
  },
  {
    name: '小说转短视频',
    input: {
      goal: '小说转短视频',
      platform: '小红书',
      genre: '悬疑反转',
      idea: '女主每晚都会收到一条来自三年前自己的短信，提醒她不要相信最亲近的人'
    },
    focus: '反转线索、画面可执行、标题吸引力'
  }
];

const lastProjectKey = 'aishortvideo:last-project';
const projectsKey = 'aishortvideo:projects';
const profileKey = 'aishortvideo:account-profile';
const revenueLeadsKey = 'aishortvideo:revenue-leads';
const modelQualityResultsKey = 'aishortvideo:model-quality-results';
const visualDemoTitle = '《凌晨三点的撤回消息》';
const visualDemoVideoUrl = new URL('../outputs/demo-2026-06-09-v2/demo-video.mp4', import.meta.url).href;
const visualDemoNovelUrl = new URL('../outputs/demo-2026-06-09-v2/novel.md', import.meta.url).href;
const visualDemoAssetNote = '样片文件在案例库可直接播放，也可下载后作为附件发送给对方。';

const defaultProfile: AccountProfile = {
  accountName: '',
  targetAudience: '',
  contentStyle: '强钩子、强冲突、短句口语化',
  monetizationGoal: '先验证内容数据，再做系统诊断或试点'
};

const revenueStatuses: RevenueStatus[] = ['待联系', '已联系', '已发样片', '已报价', '已体验', '强意向', '已付款', '无效'];

const objectionOptions = [
  '暂时不需要',
  '不知道发什么',
  '担心没效果',
  '觉得太贵',
  '想先看看案例',
  '没有时间配合',
  '需要和别人商量'
];

const revenueOffers = [
  {
    name: '0 元演示',
    price: 0,
    usage: '给潜在客户看系统如何从一句话生成内容包，换取需求反馈。'
  },
  {
    name: '29 元系统生成服务',
    price: 29,
    usage: '你代客户用系统生成 1 条可发布故事短视频素材包。'
  },
  {
    name: '99 元系统诊断',
    price: 99,
    usage: '基于客户账号或想法，输出 3 条内容方向、1 条样稿和系统改进建议。'
  },
  {
    name: '100 元以上试点定金',
    price: 100,
    usage: '客户愿意参与小范围试点，验证系统是否能持续产出内容。'
  }
];

const touchpointSeeds: TouchpointSeed[] = [
  { name: '小红书“副业/自媒体新手”笔记评论区', channel: '公开评论', need: '很多人想做账号但不知道发什么', nextAction: '先公开留言求反馈，再私信愿意交流的人' },
  { name: '抖音“AI 工具/副业/自媒体”创作者评论区', channel: '公开评论', need: '关注 AI 工具和内容变现，可能愿意看演示', nextAction: '评论演示案例价值，邀请对方给一句话想法' },
  { name: '视频号“职场故事/程序员副业”评论区', channel: '公开评论', need: '对职场故事和技术人内容有兴趣', nextAction: '用程序员演示案例发起反馈请求' },
  { name: 'B站“AI 工具实战”视频评论区', channel: '公开评论', need: '用户愿意讨论 AI 工具落地，不一定会立刻付费', nextAction: '问是否愿意看一次从想法到脚本包的演示' },
  { name: '即刻/知识星球/飞书群里的 AI 工具讨论', channel: '社群互动', need: '人群更懂工具价值，适合验证系统诊断', nextAction: '先发复盘问题，不直接发广告' },
  { name: '微信群“AI 学习/副业/自媒体”公开讨论', channel: '社群互动', need: '有内容生产焦虑，但信任需要慢慢建立', nextAction: '先贡献演示案例截图或摘要，询问反馈' },
  { name: '小红书“小说推文/故事号”账号主页', channel: '平台私信', need: '需要稳定故事钩子、分镜和标题', nextAction: '发 0 元演示邀请，强调不承诺爆款' },
  { name: '抖音“职场故事号”账号主页', channel: '平台私信', need: '需要职场冲突和反转故事素材', nextAction: '用程序员演示案例询问是否愿意试一条' },
  { name: '视频号“情感故事/职场故事”账号主页', channel: '平台私信', need: '需要口播脚本和可复用故事结构', nextAction: '发演示材料摘要，询问是否需要 29 元生成一条' },
  { name: 'B站“剪映/短视频剪辑教程”评论区', channel: '公开评论', need: '会剪辑但可能缺脚本和标题素材', nextAction: '问剪辑前最缺的是脚本、分镜还是标题' },
  { name: '小红书“做账号第 N 天”博主', channel: '平台私信', need: '新手账号常卡在选题和持续更新', nextAction: '邀请用一个真实账号方向换 0 元演示' },
  { name: '抖音“普通人做副业”博主评论区', channel: '公开评论', need: '副业人群多，但付费意愿需要筛选', nextAction: '只筛选愿意提供具体账号方向的人' },
  { name: '公众号“AI 工具/自媒体运营”文章留言区', channel: '公开留言', need: '读者有工具兴趣，也可能需要系统诊断', nextAction: '留言提供演示案例，等待主动回复' },
  { name: '知乎“如何开始做短视频账号”回答区', channel: '公开回答/评论', need: '问题导向强，适合验证痛点', nextAction: '用案例回答，不硬广，邀请私信拿演示材料' },
  { name: '掘金/稀土“AI 编程副业”文章评论区', channel: '公开评论', need: '技术人想看 AI 产品如何落地', nextAction: '发系统落地复盘，邀请看演示案例' },
  { name: '豆瓣/贴吧“写作/网文/短剧”讨论区', channel: '公开互动', need: '有故事改编需求，但转化可能慢', nextAction: '只做反馈收集，不急着报价' },
  { name: '剪映模板作者主页', channel: '平台私信', need: '有剪辑能力，可能缺脚本和标题素材', nextAction: '问是否需要一条脚本包做模板测试' },
  { name: '小型内容代运营团队公开主页', channel: '平台私信', need: '需要批量脚本和交付稳定性', nextAction: '发 99 元诊断或 100 元试点定金选项' },
  { name: '本地商家短视频账号评论区', channel: '公开评论', need: '不会写故事型宣传文案', nextAction: '只挑正在更新但文案弱的账号沟通' },
  { name: 'AI 产品内测/独立开发者社区', channel: '社群互动', need: '愿意评价产品，但未必是付费客户', nextAction: '请求产品可用性反馈，不把它当成交主力' }
];

const visualDemoTouchpointSeeds: TouchpointSeed[] = [
  { name: 'B站“剪映/短视频剪辑教程”评论区', channel: '公开评论', need: '会剪辑但可能缺故事脚本、分镜和标题素材', nextAction: '请求对方看 28 秒剧情可视化样片，判断是否能减少剪辑前准备时间' },
  { name: '剪映模板作者主页', channel: '平台私信', need: '有剪辑能力，可能缺稳定脚本和故事素材', nextAction: '发样片许可请求，询问是否愿意用一条脚本包做模板测试' },
  { name: '小红书“小说推文/故事号”账号主页', channel: '平台私信', need: '需要故事钩子、分镜、字幕和封面文案', nextAction: '发 0 元样片演示邀请，强调不承诺爆款' },
  { name: '小红书“做账号第 N 天”博主', channel: '平台私信', need: '新手账号常卡在选题、脚本和持续更新', nextAction: '邀请对方用一个真实账号方向换 0 元演示' },
  { name: 'B站“AI 工具实战”视频评论区', channel: '公开评论', need: '愿意评价 AI 工具落地价值，适合产品反馈', nextAction: '请对方从产品角度判断样片是否有付费价值' }
];

const defaultRevenueLead: Omit<RevenueLead, 'id' | 'createdAt'> = {
  name: '',
  channel: '',
  need: '',
  offer: '29 元系统生成服务',
  status: '待联系',
  amount: 0,
  nextAction: '',
  reply: '',
  objection: '',
  followUpAt: '',
  deliveryNote: '',
  validationSignal: '',
  note: ''
};

function defaultPublishRecord(platform: Platform = '抖音'): PublishRecord {
  return {
    platform,
    publishedAt: new Date().toISOString().slice(0, 16),
    url: '',
    views: 0,
    likes: 0,
    comments: 0,
    saves: 0,
    follows: 0,
    notes: ''
  };
}

function readRevenueLeads() {
  const raw = localStorage.getItem(revenueLeadsKey);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as RevenueLead[];
  } catch {
    return [];
  }
}

function readModelQualityResults() {
  const raw = localStorage.getItem(modelQualityResultsKey);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as ModelQualityResult[];
  } catch {
    return [];
  }
}

function readStoredProjects() {
  const raw = localStorage.getItem(projectsKey);
  if (!raw) {
    const lastRaw = localStorage.getItem(lastProjectKey);
    if (!lastRaw) return [];

    try {
      return [JSON.parse(lastRaw) as Project];
    } catch {
      return [];
    }
  }

  try {
    return JSON.parse(raw) as Project[];
  } catch {
    return [];
  }
}

function readLastProject() {
  const raw = localStorage.getItem(lastProjectKey);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Project;
  } catch {
    return null;
  }
}

function readStoredProfile() {
  const raw = localStorage.getItem(profileKey);
  if (!raw) return defaultProfile;

  try {
    return { ...defaultProfile, ...(JSON.parse(raw) as AccountProfile) };
  } catch {
    return defaultProfile;
  }
}

function totalScore(score: QualityScore) {
  return (
    score.hookStrength +
    score.emotionalDensity +
    score.conflictClarity +
    score.informationGain +
    score.conversationalStyle +
    score.visualExecutability +
    score.platformFit +
    score.samenessRisk +
    score.copyrightRisk +
    score.aiTraceRisk
  );
}

function evaluateModelQuality(generated: GeneratedPackage) {
  const score = totalScore(generated.score);
  const warnings: string[] = [];
  const compactScriptLength = generated.script.replace(/\s/g, '').length;
  const fullText = `${generated.hook}\n${generated.script}\n${generated.publishCopy}`;

  if (score < 38) warnings.push('质检总分低于 38/50。');
  if (generated.storyboard.length < 5) warnings.push('分镜少于 5 段，剪辑执行信息不足。');
  if (compactScriptLength < 180) warnings.push('脚本正文偏短，可能不能支撑一条完整短视频。');
  if (generated.titleOptions.length < 3) warnings.push('标题候选少于 3 个。');
  if (!/[？?]/.test(generated.hook)) warnings.push('开头钩子缺少明确问题或悬念。');
  if (/作为一个AI|抱歉|无法满足|不能提供/.test(fullText)) warnings.push('内容里出现模型拒答或 AI 身份痕迹。');

  return {
    score,
    passed: warnings.length === 0,
    warnings
  };
}

function buildModelQualityStatus(results: ModelQualityResult[]) {
  if (results.length === 0) return '未测试';

  const passCount = results.filter((result) => result.passed).length;
  return passCount === modelQualityCases.length
    ? '准入通过：3 条测试全部达标，可以进入真实案例生产。'
    : `准入未通过：${passCount}/${modelQualityCases.length} 条达标，暂时不要拿这个模型对外演示。`;
}

function shortText(value: string, maxLength = 30) {
  const clean = value.trim().replace(/[。！？!?]+$/g, '');
  return clean.length > maxLength ? `${clean.slice(0, maxLength)}...` : clean;
}

function inferStoryElements(idea: string, genre: Genre) {
  const cleanIdea = idea.trim();
  const isTechStory = /程序员|代码|自动化|AI|系统|项目|工具/.test(cleanIdea);
  const isWorkplaceStory = /公司|团队|老板|同事|会议|裁员|项目|职场/.test(cleanIdea);

  if (isTechStory || isWorkplaceStory || genre === '职场复仇') {
    return {
      protagonist: isTechStory ? '程序员' : '职场普通人',
      pressure: cleanIdea.includes('裁') ? '公司裁员名单已经快要公布' : '所有人都觉得他已经没有机会',
      weapon: isTechStory ? '自动化工具和关键数据' : '一份被忽略的证据',
      opponent: cleanIdea.includes('裁') ? '准备放弃团队的人' : '一直压制他的人',
      win: cleanIdea.includes('项目') ? '把快要失败的项目重新救回来' : '让局势当场反转',
      twist: isTechStory ? '系统日志里出现了另一个人的操作记录' : '真正的幕后决策人还没有露面',
      scene: isTechStory ? '深夜工位、会议室投影、项目看板快速刷新' : '会议室、工位、走廊里的低声对话'
    };
  }

  if (genre === '情感故事') {
    return {
      protagonist: '关系里一直退让的人',
      pressure: '对方把他的沉默当成理所当然',
      weapon: '一次终于说出口的选择',
      opponent: '最亲近却最伤他的人',
      win: '把关系里的主动权拿回来',
      twist: '对方留下的最后一句话并不是真的告别',
      scene: '餐桌、雨夜街口、未发送的聊天记录'
    };
  }

  if (genre === '悬疑反转') {
    return {
      protagonist: '发现异常细节的人',
      pressure: '所有证据都指向一个看似确定的结论',
      weapon: '一个没人注意到的时间差',
      opponent: '提前布好局的人',
      win: '拆穿最关键的谎言',
      twist: '他以为抓住了凶手，却发现自己才是诱饵',
      scene: '监控画面、空走廊、反复出现的手机铃声'
    };
  }

  return {
    protagonist: '普通人',
    pressure: '他突然被推到一个必须选择的位置',
    weapon: '一个看似不起眼的线索',
    opponent: '想把他踢出局的人',
    win: '用最小的动作完成第一次翻盘',
    twist: '同样的秘密正在被第二个人发现',
    scene: '人群、手机消息、突然安静下来的房间'
  };
}

function inferPlatformFromLead(lead: Pick<RevenueLead, 'channel' | 'name'>): Platform {
  const text = `${lead.channel} ${lead.name}`;
  if (text.includes('小红书')) return '小红书';
  if (text.includes('B站')) return 'B站';
  if (text.includes('视频号')) return '视频号';
  return '抖音';
}

function inferGenreFromLead(lead: Pick<RevenueLead, 'need' | 'name'>): Genre {
  const text = `${lead.need} ${lead.name}`;
  if (/悬疑|反转|小说|推文/.test(text)) return '悬疑反转';
  if (/情感|家庭|关系/.test(text)) return '情感故事';
  if (/职场|程序员|项目|AI|工具/.test(text)) return '职场复仇';
  if (/科幻|未来/.test(text)) return 'AI 科幻';
  return '都市逆袭';
}

function generatePackage(input: CreationInput, profile?: AccountProfile): GeneratedPackage {
  const idea = input.idea.trim() || '一个普通人突然抓住一次翻盘机会';
  const compactIdea = shortText(idea);
  const story = inferStoryElements(idea, input.genre);
  const audienceHint = profile?.targetAudience ? `这条内容默认写给${profile.targetAudience}。` : '';
  const styleHint = profile?.contentStyle ? `整体风格：${profile.contentStyle}。` : '';
  const genreTone: Record<Genre, string> = {
    都市逆袭: '压抑开局、反击升级、结尾留悬念',
    悬疑反转: '异常细节、误导线索、最后反转',
    情感故事: '关系冲突、情绪拉扯、选择代价',
    职场复仇: '不公遭遇、证据反击、局势翻盘',
    'AI 科幻': '技术异变、人性选择、未来后果'
  };
  const platformHint: Record<Platform, string> = {
    抖音: '前三秒直接抛冲突，句子短，节奏快',
    视频号: '叙事清楚，情绪稳，结尾适合转发讨论',
    小红书: '标题更像经历分享，强调代入感和反差',
    B站: '逻辑更完整，允许多一点背景和解释'
  };

  const hook = `${story.pressure}，${story.protagonist}手里只剩${story.weapon}。他应该先救自己，还是先救所有人？`;
  const script = `开头：${hook}

第一段：${story.protagonist}原本只想安稳过完这一天，可${story.pressure}。${audienceHint}${styleHint}他越想装作没事，越发现自己已经被推到了最危险的位置。

第二段：他没有立刻争辩，而是把${story.weapon}藏在手里，先做了一次小范围验证。结果一出来，他知道自己不是在赌气，而是真的抓到了翻盘机会。

第三段：麻烦也从这时候开始。${story.opponent}以为局面已经定了，甚至准备把责任推到他身上。他必须在沉默离开和当场反击之间做选择。

第四段：他没有吵，也没有求情，只是把最关键的一步提前做完。等所有人反应过来时，他已经${story.win}。

结尾：可他刚松一口气，就看见一个新的异常：${story.twist}。下一集，真正的压力才刚刚开始。`;

  const storyboard: StoryboardRow[] = [
    {
      scene: '开头钩子',
      voiceover: hook,
      visual: story.scene,
      subtitle: hook
    },
    {
      scene: '压力落下',
      voiceover: `${story.pressure}，他却只能先装作不知道。`,
      visual: '消息弹窗、会议室沉默、主角盯着屏幕不说话。',
      subtitle: '真正的危机，往往不是突然来的。'
    },
    {
      scene: '找到武器',
      voiceover: `他把${story.weapon}整理出来，先验证，再出手。`,
      visual: '屏幕上数据快速滚动，主角删掉草稿后重新写下计划。',
      subtitle: '他不是冲动，他是在等证据成形。'
    },
    {
      scene: '反击',
      voiceover: `等${story.opponent}以为稳赢时，他把结果摆上了桌。`,
      visual: '会议室投影亮起，对方表情从轻松变成僵住。',
      subtitle: '真正的反击，从不需要大声。'
    },
    {
      scene: '悬念结尾',
      voiceover: `可就在他以为结束时，${story.twist}。`,
      visual: '画面突然安静，只剩一条新消息停在屏幕中央。',
      subtitle: '翻盘之后，才是真正的下一关。'
    }
  ];

  const titleOptions = [
    `${story.protagonist}只用两天，把坏局面改成了翻盘局`,
    `所有人都以为他要出局，直到他拿出${story.weapon}`,
    `${input.genre}故事：${compactIdea}`,
    `他没有吵架，只用一个结果让所有人安静`,
    `如果只剩最后一次机会，你会先救自己吗？`
  ];

  const coverCopyOptions = [
    '最后两天，他开始反击',
    '普通人的第一次翻盘',
    shortText(story.weapon, 12)
  ];

  const score: QualityScore = {
    hookStrength: input.idea.trim().length > 8 ? 4 : 3,
    emotionalDensity: 4,
    conflictClarity: 4,
    informationGain: 4,
    conversationalStyle: 4,
    visualExecutability: 4,
    platformFit: input.platform === 'B站' ? 3 : 4,
    samenessRisk: 3,
    copyrightRisk: 5,
    aiTraceRisk: 3,
    recommendations: [
      `按${input.platform}发布时注意：${platformHint[input.platform]}。`,
      `当前题材应强化：${genreTone[input.genre]}。`,
      profile?.targetAudience ? `账号画像提醒：内容要让${profile.targetAudience}快速代入。` : '建议补充账号目标受众，后续生成会更稳定。',
      '建议人工补充一个更具体的生活细节，降低 AI 套话感。'
    ]
  };

  return {
    hook,
    script,
    storyboard,
    subtitles: storyboard.map((row) => row.subtitle),
    titleOptions,
    selectedTitle: titleOptions[0],
    coverCopyOptions,
    selectedCoverCopy: coverCopyOptions[0],
    publishCopy: `今天用 AIShortvideo 生成了一条${input.genre}故事短视频脚本：${titleOptions[0]}。${profile?.monetizationGoal ? `本账号目标：${profile.monetizationGoal}。` : ''}欢迎评论你会怎么改这个结尾。`,
    score
  };
}

function buildMarkdown(project: Project) {
  const { input, generated } = project;
  return `# ${generated.selectedTitle}

平台：${input.platform}
题材：${input.genre}
目标：${input.goal}

## 开头钩子

${generated.hook}

## 脚本

${generated.script}

## 分镜表

${generated.storyboard
    .map((row, index) => `${index + 1}. ${row.scene}
   旁白：${row.voiceover}
   画面：${row.visual}
   字幕：${row.subtitle}`)
    .join('\n\n')}

## 字幕

${generated.subtitles.join('\n')}

## 标题

${generated.selectedTitle}

## 封面文案

${generated.selectedCoverCopy}

## 发布文案

${generated.publishCopy}

## 发布前质检

总分：${totalScore(generated.score)}/50

${generated.score.recommendations.map((item) => `- ${item}`).join('\n')}

## AI 内容标识提醒

如使用 AI 生成或合成内容，请根据目标平台规则添加必要标识，并避免使用未授权音乐、图片、影视素材、声音或真实人物肖像。
`;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildOutreachMessage(lead: Omit<RevenueLead, 'id' | 'createdAt'>, showcaseProject: Project | null) {
  const targetName = lead.name.trim() || '你好';
  const offer = lead.offer || '29 元系统生成服务';
  const caseLine = showcaseProject
    ? `我现在手里有一条已经人工确认过的系统演示案例：《${showcaseProject.generated.selectedTitle}》，可以给你看从一句话到脚本、分镜、字幕、封面文案和质检的完整过程。`
    : '我还在准备可对外展示的案例。你如果愿意，我可以先用系统现场生成一条演示案例，给你看从一句话到完整素材包的过程。';
  const needLine = lead.need.trim()
    ? `我看你的情况可能是：${lead.need.trim()}。`
    : '我想先了解你现在内容生产最卡的是选题、脚本、分镜，还是发布后的复盘。';

  return `${targetName}，我最近做了一个 AI 短视频/故事内容生成系统，先不做复杂 SaaS，只验证一件事：能不能让没有内容经验的人，从一句话想法生成一条可发布的故事短视频素材包。

${needLine}

${caseLine}

如果你愿意，我可以先给你做一次 0 元演示；如果你觉得有用，也可以按「${offer}」试一条真实内容。目标不是承诺爆款，而是看这个系统能不能帮你更快产出、修改和发布。

你可以直接给我一个账号方向，或者一句话想法，我用系统给你跑一版。`;
}

function buildVisualDemoOutreachMessage(lead: Omit<RevenueLead, 'id' | 'createdAt'>) {
  const targetName = lead.name.trim() || '你好';
  const needLine = lead.need.trim()
    ? `我看你的场景可能是：${lead.need.trim()}。`
    : '我想先请你判断：这种“先把小说、分镜、字幕、视频雏形整理好”的能力，对内容新手是否有用。';

  return `${targetName}，我在做一个 AI 小说/短视频生成系统，现在有一条 28 秒剧情可视化样片：${visualDemoTitle}。

${needLine}

这条样片不是精修大片，重点是验证系统能不能把一段原创小说，整理成：小说正文、分镜、字幕、基础竖屏视频。

${visualDemoAssetNote}

如果你愿意看，我想请你只反馈 3 点：
1. 这个样片是否能让你看懂故事？
2. 如果你做内容，前期最缺的是故事、分镜、字幕，还是封面标题？
3. 如果按你的账号方向生成 1 条完整素材包，29 元试一条，你会不会考虑？

我不承诺爆款，也不承诺播放量，只想验证它能不能减少内容准备时间。`;
}

function buildDemoBrief(showcaseProject: Project | null) {
  if (!showcaseProject) {
    return `# AIShortvideo 演示材料

当前还没有已标记的对外演示案例。

建议先完成：

1. 打开“开始创作”。
2. 输入一个真实故事想法。
3. 生成素材包。
4. 在“案例”页把人工确认过的内容设为演示案例。
5. 回到“收入”页，用演示材料发给第一个潜在客户。`;
  }

  return `# AIShortvideo 演示材料

案例标题：${showcaseProject.generated.selectedTitle}
平台：${showcaseProject.input.platform}
题材：${showcaseProject.input.genre}

## 系统能产出什么

- 标题候选
- 开头钩子
- 口播脚本
- 分镜
- 字幕
- 封面文案
- 发布文案
- 发布前质检

## 演示钩子

${showcaseProject.generated.hook}

## 交付价值

这个系统不是只给 Prompt，而是把一次短视频故事内容生产拆成可操作流程：输入想法、生成内容包、人工编辑、发布前质检、导出、发布记录、复盘和线索收入验证。

边界说明：这是系统能力演示，不承诺爆款、播放量、成交或收入。

## 可报价版本

- 0 元演示：看系统生成过程，换反馈。
- 29 元系统生成服务：交付 1 条完整素材包。
- 99 元系统诊断：给 3 个方向、1 条样稿和建议。
- 100 元以上试点定金：连续试 3 到 5 条内容，记录发布反馈。`;
}

function buildVisualDemoBrief() {
  return `# 剧情可视化样片演示材料

样片标题：${visualDemoTitle}
样片位置：案例库可直接播放，也可下载视频后发给对方。
小说文本：案例库可打开小说原文。

## 当前样片证明什么

- 系统能从原创小说整理出分镜。
- 系统能生成字幕和基础竖屏视频。
- 系统能把“只会写想法”的用户推进到“可展示视频雏形”。

## 当前样片不证明什么

- 不证明能爆款。
- 不证明能自动发布。
- 不证明视频已经达到商业精修质量。
- 不证明客户一定会付费。

## 这一轮要验证什么

- 对方是否愿意看样片。
- 对方是否能看懂故事。
- 对方是否认为脚本/分镜/字幕能减少内容准备时间。
- 对方是否愿意给一句话想法做 0 元演示。
- 对方是否愿意试 29 元单条素材包，或 100 元以上试点。`;
}

function buildTodayContactPlan(todayLeads: RevenueLead[], showcaseProject: Project | null) {
  if (todayLeads.length === 0) {
    return `# 今日联系清单

当前还没有待联系对象。

建议先点击“生成今日 5 个”，系统会从 20 个触点里自动补齐今天要联系的人。`;
  }

  const caseLine = showcaseProject
    ? `演示案例：《${showcaseProject.generated.selectedTitle}》`
    : '演示案例：尚未设置，请先到案例页设置对外演示案例。';

  return `# 今日联系清单

目标：今天先联系 ${todayLeads.length} 个对象，至少拿到 1 个回复。
${caseLine}

${todayLeads.map((lead, index) => `${index + 1}. ${lead.name}
   渠道：${lead.channel || '待补'}
   需求：${lead.need || '待确认'}
   报价：${lead.offer}
   下一步：${lead.nextAction || '发送系统演示话术'}`).join('\n\n')}

执行规则：
- 发出后立刻把状态标为“已联系”。
- 发出样片后标为“已发样片”。
- 发出 29/99/100 元报价后标为“已报价”。
- 对方明确愿意继续试，标为“强意向”。
- 不用等系统更完美，先验证真实反馈。`;
}

function buildQuoteMessage(lead: Omit<RevenueLead, 'id' | 'createdAt'>) {
  const targetName = lead.name.trim() || '你好';
  const offer = lead.offer || '29 元系统生成服务';

  if (offer.includes('99')) {
    return `${targetName}，如果你想更系统地判断账号方向，我这边可以做一次 99 元系统诊断：给你 3 个内容方向，选 1 个方向生成完整样稿，再附一份发布前质检和下一步建议。这个不承诺爆款，只帮你判断账号内容生产哪里最卡。`;
  }

  if (offer.includes('100')) {
    return `${targetName}，如果你想连续验证，我建议先用 100 元以上试点定金做 3 到 5 条素材包。每条都包含故事/脚本、分镜、字幕、封面文案和发布文案，我们只看它是否能稳定减少内容准备时间。`;
  }

  if (offer.includes('0')) {
    return `${targetName}，可以先 0 元演示。你给我一个账号方向或一句话想法，我用系统跑一版素材包，你只需要反馈：能不能看懂、哪里不像你要的、是否值得继续试。`;
  }

  return `${targetName}，如果你觉得刚才的样片方向有参考价值，可以先按 29 元试一条真实内容。我会按你的账号方向交付 1 条完整素材包：标题、钩子、故事脚本、分镜、字幕、封面文案和发布文案。不承诺爆款，只验证能不能减少你前期构思和脚本准备时间。`;
}

function buildPaymentConfirmation(lead: Omit<RevenueLead, 'id' | 'createdAt'>) {
  const targetName = lead.name.trim() || '你好';
  const offer = lead.offer || '29 元系统生成服务';
  const amount = Number(lead.amount) || (offer.includes('99') ? 99 : offer.includes('100') ? 100 : offer.includes('0') ? 0 : 29);
  const need = lead.need.trim() || '你提供一个账号方向或一句话想法';

  if (offer.includes('99')) {
    return `${targetName}，确认一下这次 99 元系统诊断的交付边界：

你需要提供：${need}。

我交付：
1. 3 个可测试的内容方向；
2. 其中 1 个方向的完整样稿；
3. 标题、钩子、脚本、分镜、字幕、封面文案、发布文案；
4. 一份发布前质检和下一步建议。

不包含：
- 不承诺爆款、播放量、涨粉或成交；
- 不代发平台；
- 不做复杂剪辑精修；
- 不使用未授权素材。

金额：¥${amount}。
如果确认，我收到款后开始做，完成后把素材包发你。`;
  }

  if (offer.includes('100')) {
    return `${targetName}，确认一下这次 100 元以上试点的交付边界：

你需要提供：${need}。

我交付：
1. 连续 3 到 5 条故事/短视频素材包；
2. 每条包含标题、钩子、脚本、分镜、字幕、封面文案、发布文案；
3. 每条附发布前质检建议；
4. 根据你的反馈做小范围调整。

不包含：
- 不承诺爆款、播放量、涨粉或收入；
- 不做平台代运营；
- 不负责广告投放；
- 不使用未授权素材。

试点定金：¥${amount} 起。
目标是验证系统能否稳定减少内容准备时间。`;
  }

  if (offer.includes('0')) {
    return `${targetName}，确认一下 0 元演示边界：

你提供：${need}。

我交付：
1. 1 条系统生成素材包演示；
2. 标题、钩子、脚本、分镜、字幕、封面文案、发布文案；
3. 你只需要反馈哪里有用、哪里不像你想要的。

不包含：
- 不承诺爆款、播放量或收入；
- 不做连续多条免费生成；
- 不做复杂剪辑精修。`;
  }

  return `${targetName}，确认一下这次 29 元单条生成服务的交付边界：

你需要提供：${need}。

我交付：
1. 1 条完整故事/短视频素材包；
2. 标题、钩子、故事脚本；
3. 分镜、字幕、封面文案、发布文案；
4. 发布前质检建议。

不包含：
- 不承诺爆款、播放量、涨粉或成交；
- 不代发平台；
- 不做复杂剪辑精修；
- 不使用未授权素材。

金额：¥${amount}。
如果确认，我收到款后开始做，完成后把素材包发你。`;
}

function buildRevenueReport(leads: RevenueLead[]) {
  const paidRevenue = leads.reduce((sum, lead) => sum + (lead.status === '已付款' ? lead.amount : 0), 0);
  const contacted = leads.filter((lead) => ['已联系', '已发样片', '已报价', '已体验', '强意向', '已付款'].includes(lead.status)).length;
  const sampleSent = leads.filter((lead) => ['已发样片', '已报价', '已体验', '强意向', '已付款'].includes(lead.status)).length;
  const quoted = leads.filter((lead) => ['已报价', '强意向', '已付款'].includes(lead.status)).length;
  const replied = leads.filter((lead) => Boolean(lead.reply?.trim())).length;

  return `# AIShortvideo 收入验证复盘

导出时间：${new Date().toLocaleString()}

## 漏斗

- 线索数：${leads.length}
- 已联系：${contacted}
- 已发样片：${sampleSent}
- 已报价：${quoted}
- 真实回复：${replied}
- 强信号：${leads.filter((lead) => lead.status === '强意向' || lead.status === '已付款').length}
- 已收款：¥${paidRevenue}

## 线索明细

${leads.length === 0 ? '暂无线索。' : leads.map((lead, index) => `${index + 1}. ${lead.name}
   渠道：${lead.channel || '未填写'}
   状态：${lead.status}
   报价：${lead.offer}
   金额：¥${lead.amount}
   需求：${lead.need || '未记录'}
   回复：${lead.reply || '未记录'}
   异议：${lead.objection || '未记录'}
   系统建议：${inferLeadNextStep(lead)}
   交付记录：${lead.deliveryNote || '未记录'}
   验证信号：${lead.validationSignal || '未记录'}
   下一步：${lead.nextAction || '未记录'}
   跟进时间：${lead.followUpAt ? lead.followUpAt.replace('T', ' ') : '未设置'}`).join('\n\n')}

## 纠偏判断

- 如果已联系 < 5：先继续触达，不继续做功能。
- 如果已发样片 < 3：先把样片发出去，不继续打磨视频。
- 如果已报价 = 0：优先优化报价动作，不继续做模型能力。
- 如果真实回复 = 0：优先换触达人群或开场话术。
- 如果有人愿意付费或试点：只修影响成交/交付的问题。`;
}

function inferLeadNextStep(lead: RevenueLead) {
  const text = `${lead.reply || ''} ${lead.objection || ''} ${lead.need || ''}`;

  if (lead.status === '已付款') return '已完成付款，下一步是交付并记录对方使用反馈。';
  if (lead.status === '无效') return '无效线索，不继续投入时间。';
  if (/多少钱|价格|收费|报价|怎么卖|费用/.test(text)) return '对方开始问价格，下一步直接发报价话术，并把状态标为“已报价”。';
  if (/可以|发来|看看|样片|案例|链接|视频/.test(text) && lead.status !== '已发样片') return '对方愿意看案例，下一步发送剧情样片，并把状态标为“已发样片”。';
  if (/想试|试试|可以试|给我生成|账号方向|一句话/.test(text)) return '对方愿意试，下一步收集账号方向或一句话想法，优先报价 29 元单条或 0 元演示。';
  if (/太贵|没预算|便宜/.test(text)) return '对方有价格异议，下一步降到 0 元演示或 29 元单条，不推 99 元诊断。';
  if (/担心|没效果|播放|爆款|流量/.test(text)) return '对方担心效果，下一步强调不承诺爆款，只验证能否减少脚本和分镜准备时间。';
  if (lead.status === '待联系') return '下一步先发开场话术，请求许可看 28 秒样片。';
  if (lead.status === '已联系') return '下一步等待回复；如果对方愿意看案例，发送样片。';
  if (lead.status === '已发样片') return '下一步追问 3 个反馈：看懂了吗、最缺什么、是否愿意 29 元试一条。';
  if (lead.status === '已报价') return '下一步设定跟进时间，确认是否接受 29/99/100 元版本。';
  if (lead.status === '强意向') return '下一步明确收款方式和交付边界。';

  return '下一步补充客户回复，再判断是否发样片或报价。';
}

function buildObjectionReply(lead: Omit<RevenueLead, 'id' | 'createdAt'>, showcaseProject: Project | null) {
  const targetName = lead.name.trim() || '你';
  const caseLine = showcaseProject
    ? `我可以先给你看这条已确认演示案例：《${showcaseProject.generated.selectedTitle}》。`
    : '我也可以先现场跑一条演示，让你看系统是不是能产出可改、可发的内容包。';
  const objection = lead.objection || '想先看看案例';

  const replies: Record<string, string> = {
    暂时不需要: `${targetName}，没问题。我不想硬推工具。你现在如果暂时不需要，可以先把一个账号方向或一句话想法丢给我，我免费跑一版演示，你看结果有没有参考价值就行。`,
    不知道发什么: `${targetName}，这正好是系统想解决的问题。你不用先有完整选题，只要给我一个方向，比如“职场逆袭”“情感故事”“AI 工具副业”，系统会先生成标题、钩子、脚本和分镜，再一起挑能发的版本。`,
    担心没效果: `${targetName}，这个担心合理。我也不承诺爆款，所以第一步只做低成本验证：先生成 1 条素材包，看它能不能减少你写脚本和分镜的时间，再决定是否继续。`,
    觉得太贵: `${targetName}，可以先不做 99 元诊断，先用 0 元演示或 29 元单条生成服务试一条。目标是先判断系统产出的内容对你有没有用，不急着做大单。`,
    想先看看案例: `${targetName}，可以。${caseLine} 你主要看三点：脚本是否能读、分镜是否能拍、发布前质检是否能指导修改。`,
    没有时间配合: `${targetName}，不用你深度配合。你只要给一个方向或一句话想法，我先生成一版；你有空时只需要告诉我“哪里不像你想要的”，我再改。`,
    需要和别人商量: `${targetName}，可以。我先发你一份演示材料摘要，里面有系统能交付什么、报价版本和一个案例。你们内部看完后，如果觉得值得试，再从 29 元单条开始。`
  };

  return replies[objection] || replies.想先看看案例;
}

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [input, setInput] = useState<CreationInput>(defaultInput);
  const [projects, setProjects] = useState<Project[]>(readStoredProjects);
  const [project, setProject] = useState<Project | null>(() => readLastProject() ?? readStoredProjects()[0] ?? null);
  const [publishRecord, setPublishRecord] = useState<PublishRecord>(() => defaultPublishRecord(project?.input.platform));
  const [modelStatus, setModelStatus] = useState('未测试');
  const [modelQualityResults, setModelQualityResults] = useState<ModelQualityResult[]>(readModelQualityResults);
  const [modelQualityStatus, setModelQualityStatus] = useState(() => buildModelQualityStatus(readModelQualityResults()));
  const [profileStatus, setProfileStatus] = useState('');
  const [generationStatus, setGenerationStatus] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [videoPlanStatus, setVideoPlanStatus] = useState('');
  const [videoPlan, setVideoPlan] = useState<VideoPlan | null>(null);
  const [profile, setProfile] = useState<AccountProfile>(readStoredProfile);
  const [revenueLeads, setRevenueLeads] = useState<RevenueLead[]>(readRevenueLeads);
  const [revenueFilter, setRevenueFilter] = useState<RevenueStatus | '全部' | '待处理'>('全部');
  const [leadDraft, setLeadDraft] = useState(defaultRevenueLead);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [modelConfig, setModelConfig] = useState({
    baseUrl: '',
    apiKey: '',
    model: ''
  });

  const markdown = useMemo(() => (project ? buildMarkdown(project) : ''), [project]);
  const showcaseProject = useMemo(
    () => projects.find((item) => item.isShowcase) ?? null,
    [projects]
  );
  const outreachMessage = useMemo(() => buildOutreachMessage(leadDraft, showcaseProject), [leadDraft, showcaseProject]);
  const visualDemoOutreachMessage = useMemo(() => buildVisualDemoOutreachMessage(leadDraft), [leadDraft]);
  const demoBrief = useMemo(() => buildDemoBrief(showcaseProject), [showcaseProject]);
  const visualDemoBrief = useMemo(buildVisualDemoBrief, []);
  const quoteMessage = useMemo(() => buildQuoteMessage(leadDraft), [leadDraft]);
  const paymentConfirmation = useMemo(() => buildPaymentConfirmation(leadDraft), [leadDraft]);
  const objectionReply = useMemo(() => buildObjectionReply(leadDraft, showcaseProject), [leadDraft, showcaseProject]);
  const revenueReport = useMemo(() => buildRevenueReport(revenueLeads), [revenueLeads]);
  const paidRevenue = revenueLeads.reduce((sum, lead) => sum + (lead.status === '已付款' ? lead.amount : 0), 0);
  const strongSignalCount = revenueLeads.filter((lead) => lead.status === '强意向' || lead.status === '已付款').length;
  const interviewCount = revenueLeads.filter((lead) => lead.status !== '待联系' && lead.status !== '无效').length;
  const todayContactLeads = revenueLeads.filter((lead) => lead.status === '待联系');
  const todayContactCount = todayContactLeads.length;
  const contactedCount = revenueLeads.filter((lead) => ['已联系', '已发样片', '已报价', '已体验', '强意向', '已付款'].includes(lead.status)).length;
  const sampleSentCount = revenueLeads.filter((lead) => ['已发样片', '已报价', '已体验', '强意向', '已付款'].includes(lead.status)).length;
  const quotedCount = revenueLeads.filter((lead) => ['已报价', '强意向', '已付款'].includes(lead.status)).length;
  const replyCount = revenueLeads.filter((lead) => Boolean(lead.reply?.trim())).length;
  const filteredRevenueLeads = revenueLeads.filter((lead) => {
    if (revenueFilter === '全部') return true;
    if (revenueFilter === '待处理') {
      return lead.status === '待联系' || lead.status === '已联系' || lead.status === '已发样片' || lead.status === '已报价';
    }
    return lead.status === revenueFilter;
  });
  const todayContactPlan = useMemo(() => buildTodayContactPlan(todayContactLeads, showcaseProject), [todayContactLeads, showcaseProject]);
  const modelQualityPassed = modelQualityResults.length === modelQualityCases.length && modelQualityResults.every((result) => result.passed);
  const operatingSteps: OperatingStep[] = [
    {
      label: '补齐账号画像',
      why: '让生成内容有目标受众和变现方向，不只是泛泛故事。',
      done: Boolean(profile.accountName && profile.targetAudience && profile.monetizationGoal),
      actionLabel: '去填写',
      targetScreen: 'profile'
    },
    {
      label: '通过 3 条模型准入测试',
      why: '真实模型未通过前，不拿内容对外演示或收费。',
      done: modelQualityPassed,
      actionLabel: '去测试',
      targetScreen: 'settings'
    },
    {
      label: '生成首个候选案例',
      why: '先有一条完整内容包，才能判断脚本、分镜和质检是否可交付。',
      done: projects.length > 0,
      actionLabel: '开始创作',
      targetScreen: 'wizard'
    },
    {
      label: '设为对外演示案例',
      why: '收入页只引用人工确认过的案例，避免把测试内容发给客户。',
      done: Boolean(showcaseProject),
      actionLabel: '去案例库',
      targetScreen: 'cases'
    },
    {
      label: '准备今日 5 个联系对象',
      why: '赚钱验证必须进入真实沟通，不能只继续做功能。',
      done: todayContactCount >= 5,
      actionLabel: '去收入页',
      targetScreen: 'revenue'
    },
    {
      label: '完成 10 个访谈记录',
      why: '没有访谈数据，就不知道系统到底解决谁的痛点。',
      done: interviewCount >= 10,
      actionLabel: '去记录',
      targetScreen: 'revenue'
    },
    {
      label: '拿到首个 100 元信号',
      why: 'V1 的商业验收是 14 天内拿到真实收入或等价试点。',
      done: paidRevenue >= 100,
      actionLabel: '去跟进',
      targetScreen: 'revenue'
    }
  ];
  const completedOperatingSteps = operatingSteps.filter((step) => step.done).length;

  function persist(nextProject: Project) {
    setProject(nextProject);
    localStorage.setItem(lastProjectKey, JSON.stringify(nextProject));
    setProjects((currentProjects) => {
      const nextProjects = [
        nextProject,
        ...currentProjects.filter((item) => item.id !== nextProject.id)
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      localStorage.setItem(projectsKey, JSON.stringify(nextProjects));
      return nextProjects;
    });
  }

  async function requestModelGeneratedPackage() {
    try {
      const response = await fetch('http://127.0.0.1:8787/api/generate/story-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, profile, modelConfig })
      });
      const result = await response.json();
      if (result.ok && result.generated) {
        setGenerationStatus(result.message);
        return result.generated as GeneratedPackage;
      }
      setGenerationStatus(result.message || '真实模型不可用，已使用本地 Mock 生成。');
      return null;
    } catch {
      setGenerationStatus('本地 API 服务未启动，已使用本地 Mock 生成。');
      return null;
    }
  }

  async function createProject() {
    setGenerationStatus('正在生成...');
    const modelGenerated = await requestModelGeneratedPackage();
    const generated = modelGenerated ?? generatePackage(input, profile);
    const nextProject: Project = {
      id: crypto.randomUUID(),
      input,
      profile,
      generated,
      createdAt: new Date().toISOString()
    };
    persist(nextProject);
    setPublishRecord(defaultPublishRecord(input.platform));
    setScreen('editor');
  }

  function openProject(savedProject: Project) {
    setProject(savedProject);
    localStorage.setItem(lastProjectKey, JSON.stringify(savedProject));
    setPublishRecord(savedProject.publishRecord ?? defaultPublishRecord(savedProject.input.platform));
    setScreen('editor');
  }

  function updateGenerated(partial: Partial<GeneratedPackage>) {
    if (!project) return;
    persist({ ...project, generated: { ...project.generated, ...partial } });
  }

  function markShowcase(targetProject: Project) {
    const nextProjects = projects.map((item) => ({
      ...item,
      isShowcase: item.id === targetProject.id
    }));
    setProjects(nextProjects);
    localStorage.setItem(projectsKey, JSON.stringify(nextProjects));

    const nextProject = { ...targetProject, isShowcase: true };
    setProject(nextProject);
    localStorage.setItem(lastProjectKey, JSON.stringify(nextProject));
  }

  function importFirstDemoShowcase() {
    const nextProject = {
      ...firstDemoShowcaseProject,
      createdAt: new Date().toISOString()
    };
    const nextProjects = [
      nextProject,
      ...projects
        .filter((item) => item.id !== nextProject.id)
        .map((item) => ({ ...item, isShowcase: false }))
    ];

    setProjects(nextProjects);
    setProject(nextProject);
    setPublishRecord(defaultPublishRecord(nextProject.input.platform));
    localStorage.setItem(projectsKey, JSON.stringify(nextProjects));
    localStorage.setItem(lastProjectKey, JSON.stringify(nextProject));
    setScreen('cases');
  }

  function rewriteHook() {
    if (!project) return;
    const story = inferStoryElements(project.input.idea, project.input.genre);
    updateGenerated({
      hook: `他以为自己只是撑过今天，直到${story.pressure}。而他手里唯一能用的，是${story.weapon}。`
    });
  }

  function makeConversational() {
    if (!project) return;
    updateGenerated({
      script: project.generated.script.replaceAll('主角', '他').replaceAll('真正的冲突出现了。', '麻烦也就是从这时候开始的。')
    });
  }

  function savePublishRecord() {
    if (!project) return;
    const nextProject = { ...project, publishRecord };
    persist(nextProject);
    setScreen('review');
  }

  async function testModelConnection() {
    setModelStatus('正在测试连接...');
    try {
      const response = await fetch('http://127.0.0.1:8787/api/model/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modelConfig)
      });
      const result = await response.json();
      setModelStatus(result.ok ? result.message : `${result.message}${result.detail ? ` ${result.detail}` : ''}`);
    } catch {
      setModelStatus('本地 API 服务未启动。请先运行 npm run api。');
    }
  }

  async function requestVideoPlan() {
    if (!project) return;
    setVideoPlanStatus('正在生成自动成片计划...');
    setVideoPlan(null);

    try {
      const response = await fetch('http://127.0.0.1:8787/api/export/video-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project })
      });
      const result = await response.json();
      if (result.ok && result.plan) {
        setVideoPlan(result.plan as VideoPlan);
        setVideoPlanStatus(result.message);
        return;
      }
      setVideoPlanStatus(result.message || '自动成片计划生成失败。');
    } catch {
      setVideoPlanStatus('本地 API 服务未启动。请先运行 npm run api。');
    }
  }

  async function runModelQualityGate() {
    setModelQualityStatus('正在运行 3 条准入测试...');
    setModelQualityResults([]);

    const results: ModelQualityResult[] = [];
    for (const testCase of modelQualityCases) {
      try {
        const response = await fetch('http://127.0.0.1:8787/api/generate/story-package', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: testCase.input, profile, modelConfig })
        });
        const result = await response.json();

        if (result.ok && result.generated) {
          const generated = result.generated as GeneratedPackage;
          const evaluation = evaluateModelQuality(generated);
          results.push({
            caseName: testCase.name,
            idea: testCase.input.idea,
            title: generated.selectedTitle,
            score: evaluation.score,
            passed: evaluation.passed,
            source: '真实模型',
            message: result.message || '真实模型生成完成。',
            warnings: evaluation.warnings
          });
        } else {
          const fallback = generatePackage(testCase.input, profile);
          const evaluation = evaluateModelQuality(fallback);
          results.push({
            caseName: testCase.name,
            idea: testCase.input.idea,
            title: fallback.selectedTitle,
            score: evaluation.score,
            passed: false,
            source: '未通过真实模型',
            message: result.message || '真实模型未完成生成。',
            warnings: [`真实模型未完成生成：${result.message || '未知错误'}`, ...evaluation.warnings]
          });
        }
      } catch {
        results.push({
          caseName: testCase.name,
          idea: testCase.input.idea,
          title: '未生成',
          score: 0,
          passed: false,
          source: '本地 API 不可用',
          message: '本地 API 服务未启动或不可访问。',
          warnings: ['请先运行 npm run api，并配置可用的模型。']
        });
      }
    }

    setModelQualityResults(results);
    localStorage.setItem(modelQualityResultsKey, JSON.stringify(results));
    setModelQualityStatus(buildModelQualityStatus(results));
  }

  function saveProfile() {
    localStorage.setItem(profileKey, JSON.stringify(profile));
    setProfileStatus('账号画像已保存，后续生成会参考这些定位。');
  }

  function saveRevenueLead() {
    const name = leadDraft.name.trim();
    if (!name) return;

    if (editingLeadId) {
      const nextLeads = revenueLeads.map((lead) => (
        lead.id === editingLeadId
          ? {
              ...lead,
              ...leadDraft,
              name,
              amount: Number(leadDraft.amount) || 0
            }
          : lead
      ));
      setRevenueLeads(nextLeads);
      localStorage.setItem(revenueLeadsKey, JSON.stringify(nextLeads));
      setLeadDraft(defaultRevenueLead);
      setEditingLeadId(null);
      setCopyStatus('线索已更新。');
      return;
    }

    const nextLead: RevenueLead = {
      ...leadDraft,
      name,
      amount: Number(leadDraft.amount) || 0,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    const nextLeads = [nextLead, ...revenueLeads];
    setRevenueLeads(nextLeads);
    localStorage.setItem(revenueLeadsKey, JSON.stringify(nextLeads));
    setLeadDraft(defaultRevenueLead);
  }

  function deleteRevenueLead(id: string) {
    const nextLeads = revenueLeads.filter((lead) => lead.id !== id);
    setRevenueLeads(nextLeads);
    localStorage.setItem(revenueLeadsKey, JSON.stringify(nextLeads));
    if (editingLeadId === id) {
      setLeadDraft(defaultRevenueLead);
      setEditingLeadId(null);
    }
  }

  function editRevenueLead(lead: RevenueLead) {
    const { id, createdAt, ...draft } = lead;
    setLeadDraft(draft);
    setEditingLeadId(id);
    setCopyStatus(`正在编辑：${lead.name}`);
  }

  function cancelLeadEditing() {
    setLeadDraft(defaultRevenueLead);
    setEditingLeadId(null);
    setCopyStatus('已取消编辑。');
  }

  function startCreationFromLead(lead: RevenueLead) {
    const idea = lead.need.trim() || lead.reply?.trim() || lead.nextAction.trim() || '根据客户账号方向生成一条故事短视频素材包';
    setInput({
      goal: idea.includes('小说') ? '小说转短视频' : '故事短视频',
      platform: inferPlatformFromLead(lead),
      genre: inferGenreFromLead(lead),
      idea
    });
    setScreen('wizard');
    setCopyStatus(`已把 ${lead.name} 的需求带入创作向导。`);
  }

  function updateRevenueLead(id: string, partial: Partial<RevenueLead>) {
    const nextLeads = revenueLeads.map((lead) => (
      lead.id === id ? { ...lead, ...partial } : lead
    ));
    setRevenueLeads(nextLeads);
    localStorage.setItem(revenueLeadsKey, JSON.stringify(nextLeads));
  }

  function useTouchpoint(seed: TouchpointSeed) {
    setLeadDraft({
      ...defaultRevenueLead,
      name: seed.name,
      channel: seed.channel,
      need: seed.need,
      nextAction: seed.nextAction
    });
  }

  function addTouchpointLead(seed: TouchpointSeed) {
    const exists = revenueLeads.some((lead) => lead.name === seed.name && lead.channel === seed.channel);
    if (exists) {
      setCopyStatus('这个触点已经在线索记录里。');
      return;
    }

    const nextLead: RevenueLead = {
      ...defaultRevenueLead,
      name: seed.name,
      channel: seed.channel,
      need: seed.need,
      nextAction: seed.nextAction,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    const nextLeads = [nextLead, ...revenueLeads];
    setRevenueLeads(nextLeads);
    localStorage.setItem(revenueLeadsKey, JSON.stringify(nextLeads));
    setCopyStatus('已加入今日待联系清单。');
  }

  function generateTodayLeads() {
    const existingKeys = new Set(revenueLeads.map((lead) => `${lead.channel}-${lead.name}`));
    const needCount = Math.max(0, 5 - todayContactCount);
    const seedsToAdd = touchpointSeeds
      .filter((seed) => !existingKeys.has(`${seed.channel}-${seed.name}`))
      .slice(0, needCount);

    if (seedsToAdd.length === 0) {
      setCopyStatus(todayContactCount >= 5 ? '今日待联系已经达到 5 个。' : '没有新的触点可加入。');
      return;
    }

    const newLeads: RevenueLead[] = seedsToAdd.map((seed) => ({
      ...defaultRevenueLead,
      name: seed.name,
      channel: seed.channel,
      need: seed.need,
      nextAction: seed.nextAction,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    }));
    const nextLeads = [...newLeads, ...revenueLeads];
    setRevenueLeads(nextLeads);
    localStorage.setItem(revenueLeadsKey, JSON.stringify(nextLeads));
    setCopyStatus(`已生成 ${newLeads.length} 个今日待联系对象。`);
  }

  function generateVisualDemoLeads() {
    const existingKeys = new Set(revenueLeads.map((lead) => `${lead.channel}-${lead.name}`));
    const seedsToAdd = visualDemoTouchpointSeeds.filter((seed) => !existingKeys.has(`${seed.channel}-${seed.name}`));

    if (seedsToAdd.length === 0) {
      setCopyStatus('剧情样片触达对象已经全部加入线索记录。');
      return;
    }

    const newLeads: RevenueLead[] = seedsToAdd.map((seed) => ({
      ...defaultRevenueLead,
      name: seed.name,
      channel: seed.channel,
      need: seed.need,
      offer: seed.channel === '社群互动' ? '100 元以上试点定金' : '29 元系统生成服务',
      nextAction: seed.nextAction,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    }));
    const nextLeads = [...newLeads, ...revenueLeads];
    setRevenueLeads(nextLeads);
    localStorage.setItem(revenueLeadsKey, JSON.stringify(nextLeads));
    setCopyStatus(`已加入 ${newLeads.length} 个剧情样片触达对象。`);
  }

  async function copyText(value: string, label: string, elementId: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(`${label}已复制，可以直接发送。`);
      return;
    } catch {
      const element = document.getElementById(elementId);
      if (element instanceof HTMLTextAreaElement) {
        element.focus();
        element.select();
      }
      setCopyStatus(`${label}复制失败，已选中文本，请手动复制。`);
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={18} /></div>
          <div>
            <strong>AIShortvideo</strong>
            <span>V1 验证切片</span>
          </div>
        </div>
        <nav>
          <button className={screen === 'home' ? 'active' : ''} onClick={() => setScreen('home')}><Play size={18} />工作台</button>
          <button className={screen === 'wizard' ? 'active' : ''} onClick={() => setScreen('wizard')}><Wand2 size={18} />开始创作</button>
          <button className={screen === 'cases' ? 'active' : ''} onClick={() => setScreen('cases')}><FolderOpen size={18} />案例</button>
          <button className={screen === 'profile' ? 'active' : ''} onClick={() => setScreen('profile')}><User size={18} />账号</button>
          <button className={screen === 'revenue' ? 'active' : ''} onClick={() => setScreen('revenue')}><DollarSign size={18} />收入</button>
          <button className={screen === 'review' ? 'active' : ''} onClick={() => setScreen('review')}><BarChart3 size={18} />复盘</button>
          <button className={screen === 'settings' ? 'active' : ''} onClick={() => setScreen('settings')}><Settings size={18} />设置</button>
        </nav>
        <div className="sidebar-note">
          <strong>纠偏提醒</strong>
          <p>当前只做故事类短视频主线，不做自动发布、自动剪辑、SaaS。</p>
        </div>
      </aside>

      <main className="main">
        {screen !== 'home' && (
          <button className="ghost back" onClick={() => setScreen('home')}><ArrowLeft size={18} />返回工作台</button>
        )}
        {screen === 'home' && (
          <>
            <section className="hero">
              <div>
                <p className="eyebrow">简单易用 + 能赚到钱</p>
                <h1>用系统生成第一条可发布故事短视频</h1>
                <p className="lead">V1 只验证一条主线：一句话想法到脚本、分镜、字幕、标题、封面文案、发布文案、质检和导出。</p>
                <button className="primary large" onClick={() => setScreen('wizard')}><Wand2 size={20} />开始创作</button>
              </div>
              <div className="status-panel">
                <div><span>V1 可用目标</span><strong>30 分钟导出</strong></div>
                <div><span>商业验收</span><strong>14 天 100 元</strong></div>
                <div><span>本地案例</span><strong>{projects.length} 条</strong></div>
                <div><span>收入进度</span><strong>¥{paidRevenue}/100</strong></div>
                <div><span>演示案例</span><strong>{showcaseProject ? '已设置' : '未设置'}</strong></div>
                <div><span>模型准入</span><strong>{modelQualityPassed ? '已通过' : '未通过'}</strong></div>
              </div>
            </section>
            <section className="panel">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">项目推进看板</p>
                  <h2>当前做到 {completedOperatingSteps}/{operatingSteps.length}</h2>
                </div>
                <span className="pill">先做能影响 100 元验证的事</span>
              </div>
              <div className="ops-checklist">
                {operatingSteps.map((step) => (
                  <div className={`ops-step ${step.done ? 'done' : ''}`} key={step.label}>
                    <div className="ops-step-icon">
                      {step.done ? <CheckCircle2 size={18} /> : <ClipboardList size={18} />}
                    </div>
                    <div>
                      <strong>{step.label}</strong>
                      <p>{step.why}</p>
                    </div>
                    <button className={step.done ? 'secondary' : 'primary'} onClick={() => setScreen(step.targetScreen)}>
                      {step.done ? '查看' : step.actionLabel}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {screen === 'wizard' && (
          <section className="panel narrow">
            <h2>开始创作</h2>
            <p className="muted">只填 4 项。不要写 Prompt，系统会按模板生成完整素材包。</p>
            <label>创作目标
              <select value={input.goal} onChange={(event) => setInput({ ...input, goal: event.target.value as Goal })}>
                {goals.map((goal) => <option key={goal}>{goal}</option>)}
              </select>
            </label>
            <label>目标平台
              <select value={input.platform} onChange={(event) => setInput({ ...input, platform: event.target.value as Platform })}>
                {platforms.map((platform) => <option key={platform}>{platform}</option>)}
              </select>
            </label>
            <label>题材
              <select value={input.genre} onChange={(event) => setInput({ ...input, genre: event.target.value as Genre })}>
                {genres.map((genre) => <option key={genre}>{genre}</option>)}
              </select>
            </label>
            <label>一句话想法
              <textarea
                value={input.idea}
                onChange={(event) => setInput({ ...input, idea: event.target.value })}
                placeholder="例如：一个程序员提前知道明天会发生什么，并用这个能力完成第一次反击"
              />
            </label>
            <button className="primary" disabled={!input.idea.trim()} onClick={createProject}><Sparkles size={18} />生成素材包</button>
            {generationStatus && <p className="status-text">{generationStatus}</p>}
          </section>
        )}

        {screen === 'editor' && project && (
          <section className="workspace">
            <header className="section-header">
              <div>
                <p className="eyebrow">{project.input.platform} / {project.input.genre}</p>
                <h2>{project.generated.selectedTitle}</h2>
                {generationStatus && <p className="muted">{generationStatus}</p>}
              </div>
              <button className="primary" onClick={() => setScreen('quality')}><ClipboardList size={18} />发布前质检</button>
            </header>
            <div className="grid two">
              <article className="panel">
                <h3>开头钩子</h3>
                <p className="script-block">{project.generated.hook}</p>
                <button className="secondary" onClick={rewriteHook}><RefreshCw size={16} />开头更吸引人</button>
              </article>
              <article className="panel">
                <h3>标题</h3>
                <div className="option-list">
                  {project.generated.titleOptions.map((title) => (
                    <button
                      key={title}
                      className={title === project.generated.selectedTitle ? 'selected' : ''}
                      onClick={() => updateGenerated({ selectedTitle: title })}
                    >
                      {title}
                    </button>
                  ))}
                </div>
              </article>
            </div>
            <article className="panel">
              <div className="panel-title">
                <h3>脚本</h3>
                <button className="secondary" onClick={makeConversational}><PenLine size={16} />改得更口语</button>
              </div>
              <pre className="script-block">{project.generated.script}</pre>
            </article>
            <article className="panel">
              <h3>分镜和字幕</h3>
              <div className="table">
                {project.generated.storyboard.map((row, index) => (
                  <div className="table-row" key={row.scene}>
                    <strong>{index + 1}. {row.scene}</strong>
                    <span>{row.visual}</span>
                    <span>{row.subtitle}</span>
                  </div>
                ))}
              </div>
            </article>
          </section>
        )}

        {screen === 'quality' && project && (
          <section className="workspace">
            <header className="section-header">
              <div>
                <p className="eyebrow">发布前质检</p>
                <h2>总分 {totalScore(project.generated.score)}/50</h2>
              </div>
              <button className="primary" onClick={() => setScreen('export')}><Download size={18} />导出内容包</button>
            </header>
            <div className="score-grid">
              {[
                ['钩子强度', project.generated.score.hookStrength],
                ['情绪密度', project.generated.score.emotionalDensity],
                ['冲突清晰', project.generated.score.conflictClarity],
                ['信息增量', project.generated.score.informationGain],
                ['口语化', project.generated.score.conversationalStyle],
                ['画面可执行', project.generated.score.visualExecutability],
                ['平台适配', project.generated.score.platformFit],
                ['同质化风险', project.generated.score.samenessRisk],
                ['版权风险', project.generated.score.copyrightRisk],
                ['AI 痕迹', project.generated.score.aiTraceRisk]
              ].map(([label, value]) => (
                <div className="score-item" key={label}>
                  <span>{label}</span>
                  <strong>{value}/5</strong>
                </div>
              ))}
            </div>
            <article className="panel">
              <h3>修改建议</h3>
              <ul className="clean-list">
                {project.generated.score.recommendations.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <button className="secondary" onClick={makeConversational}><Wand2 size={16} />一键降低 AI 味</button>
            </article>
          </section>
        )}

        {screen === 'export' && project && (
          <div className="workspace">
            <section className="panel">
              <header className="section-header">
                <div>
                  <p className="eyebrow">导出内容包</p>
                  <h2>可复制到剪辑和发布流程</h2>
                </div>
                <div className="header-actions">
                  <button className="secondary" onClick={() => downloadTextFile('aishortvideo-content-package.md', markdown)}><Download size={18} />下载 Markdown</button>
                  <button className="primary" onClick={() => navigator.clipboard.writeText(markdown)}><ClipboardList size={18} />复制 Markdown</button>
                </div>
              </header>
              <textarea className="export-box" readOnly value={markdown} />
              <button className="primary" onClick={() => setScreen('publish')}><Save size={18} />发布后记录数据</button>
            </section>

            <section className="panel">
              <header className="section-header">
                <div>
                  <p className="eyebrow">自动成片 MVP</p>
                  <h2>生成 Remotion + FFmpeg 前置计划</h2>
                </div>
                <button className="primary" onClick={requestVideoPlan}><Play size={18} />生成成片计划</button>
              </header>
              <p className="lead">这一步先导出 9:16 视频结构、镜头时长、字幕 SRT 和渲染草稿，不依赖剪映/Canva API。</p>
              {videoPlanStatus && <p className="status-text">{videoPlanStatus}</p>}
              {videoPlan && (
                <div className="video-plan">
                  <div className="grid three compact">
                    <article className="panel metric"><span>比例</span><strong>{videoPlan.aspectRatio}</strong></article>
                    <article className="panel metric"><span>分辨率</span><strong>{videoPlan.resolution}</strong></article>
                    <article className="panel metric"><span>预计时长</span><strong>{videoPlan.totalDuration.toFixed(1)}s</strong></article>
                  </div>
                  <div className="header-actions">
                    <button className="secondary" onClick={() => downloadTextFile('subtitles.srt', videoPlan.srt)}><Download size={18} />下载 SRT</button>
                    <button className="secondary" onClick={() => downloadTextFile('ffmpeg-draft.sh', videoPlan.ffmpegDraft)}><Download size={18} />下载渲染草稿</button>
                    <button className="secondary" onClick={() => navigator.clipboard.writeText(videoPlan.srt)}><Copy size={18} />复制字幕</button>
                  </div>
                  <div className="table-list">
                    {videoPlan.segments.map((segment) => (
                      <article className="table-row video-row" key={segment.index}>
                        <strong>{segment.index}. {segment.scene}</strong>
                        <span>{segment.start.toFixed(1)}s - {segment.end.toFixed(1)}s</span>
                        <span>{segment.subtitle}</span>
                        <span>{segment.visual}</span>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {screen === 'publish' && project && (
          <section className="panel narrow">
            <h2>发布记录</h2>
            <label>平台
              <select value={publishRecord.platform} onChange={(event) => setPublishRecord({ ...publishRecord, platform: event.target.value as Platform })}>
                {platforms.map((platform) => <option key={platform}>{platform}</option>)}
              </select>
            </label>
            <label>发布时间
              <input type="datetime-local" value={publishRecord.publishedAt} onChange={(event) => setPublishRecord({ ...publishRecord, publishedAt: event.target.value })} />
            </label>
            <label>内容链接
              <input value={publishRecord.url} onChange={(event) => setPublishRecord({ ...publishRecord, url: event.target.value })} />
            </label>
            <div className="grid three compact">
              {(['views', 'likes', 'comments', 'saves', 'follows'] as const).map((key) => (
                <label key={key}>{key}
                  <input type="number" min="0" value={publishRecord[key]} onChange={(event) => setPublishRecord({ ...publishRecord, [key]: Number(event.target.value) })} />
                </label>
              ))}
            </div>
            <label>备注
              <textarea value={publishRecord.notes} onChange={(event) => setPublishRecord({ ...publishRecord, notes: event.target.value })} />
            </label>
            <button className="primary" onClick={savePublishRecord}><Save size={18} />保存并查看复盘</button>
          </section>
        )}

        {screen === 'review' && (
          <section className="workspace">
            <header className="section-header">
              <div>
                <p className="eyebrow">简单复盘</p>
                <h2>下一条内容怎么改</h2>
              </div>
              <button className="primary" onClick={() => setScreen('wizard')}><Lightbulb size={18} />继续生成下一条</button>
            </header>
            {!project?.publishRecord ? (
              <article className="panel empty">
                <FileText size={28} />
                <p>还没有发布记录。先导出内容并发布，再回来填写基础数据。</p>
              </article>
            ) : (
              <div className="grid three">
                <article className="panel metric"><span>播放</span><strong>{project.publishRecord.views}</strong></article>
                <article className="panel metric"><span>点赞</span><strong>{project.publishRecord.likes}</strong></article>
                <article className="panel metric"><span>评论</span><strong>{project.publishRecord.comments}</strong></article>
                <article className="panel wide">
                  <h3>建议</h3>
                  <p>下一条优先测试同题材的不同开头钩子。当前目标不是追求爆款，而是验证哪个钩子结构更容易产生互动。</p>
                </article>
              </div>
            )}
          </section>
        )}

        {screen === 'cases' && (
          <section className="workspace">
            <header className="section-header">
              <div>
                <p className="eyebrow">案例库</p>
                <h2>已生成内容包</h2>
              </div>
              <div className="header-actions">
                <button className="secondary" onClick={importFirstDemoShowcase}><Sparkles size={18} />导入首个演示案例</button>
                <button className="primary" onClick={() => setScreen('wizard')}><Wand2 size={18} />生成新案例</button>
              </div>
            </header>
            <article className="panel demo-video-card">
              <div>
                <p className="eyebrow">剧情可视化样片</p>
                <h3>《凌晨三点的撤回消息》</h3>
                <p className="muted">原创悬疑小说，已生成 28 秒竖屏 MP4、分镜和 SRT 字幕。</p>
                <div className="header-actions">
                  <a className="secondary" href={visualDemoNovelUrl} target="_blank" rel="noreferrer"><FileText size={16} />打开小说</a>
                  <a className="secondary" href={visualDemoVideoUrl} download><Download size={16} />下载视频</a>
                </div>
              </div>
              <video className="demo-video-preview" src={visualDemoVideoUrl} controls playsInline preload="metadata" />
            </article>
            {projects.length === 0 ? (
              <article className="panel empty">
                <FolderOpen size={28} />
                <p>还没有案例。先生成一条内容包，再用它做发布和复盘验证。</p>
              </article>
            ) : (
              <div className="case-list">
                {projects.map((item) => (
                  <article className="panel case-item" key={item.id}>
                    <div>
                      <p className="eyebrow">{item.input.platform} / {item.input.genre}</p>
                      <h3>{item.generated.selectedTitle}</h3>
                      <p className="muted">{shortText(item.input.idea, 72)}</p>
                      {item.isShowcase && <p className="status-text">当前对外演示案例</p>}
                    </div>
                    <div className="case-meta">
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                      <span>{item.publishRecord ? '已记录发布数据' : '未发布'}</span>
                    </div>
                    <div className="case-actions">
                      <button className="secondary" onClick={() => openProject(item)}><FolderOpen size={16} />打开</button>
                      <button className="secondary" onClick={() => markShowcase(item)}><Sparkles size={16} />设为演示</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {screen === 'profile' && (
          <section className="panel narrow">
            <h2>账号画像</h2>
            <p className="muted">不填也能生成；填写后会影响钩子、脚本语气和质检建议。</p>
            <label>账号名称
              <input
                value={profile.accountName}
                onChange={(event) => setProfile({ ...profile, accountName: event.target.value })}
                placeholder="例如：程序员逆袭故事"
              />
            </label>
            <label>目标受众
              <input
                value={profile.targetAudience}
                onChange={(event) => setProfile({ ...profile, targetAudience: event.target.value })}
                placeholder="例如：25-35 岁职场技术人"
              />
            </label>
            <label>内容风格
              <select
                value={profile.contentStyle}
                onChange={(event) => setProfile({ ...profile, contentStyle: event.target.value })}
              >
                <option>强钩子、强冲突、短句口语化</option>
                <option>情绪真实、节奏稳、适合转发讨论</option>
                <option>悬疑铺垫、细节反转、结尾强悬念</option>
                <option>经验分享、代入感强、轻故事化</option>
              </select>
            </label>
            <label>变现方向
              <textarea
                value={profile.monetizationGoal}
                onChange={(event) => setProfile({ ...profile, monetizationGoal: event.target.value })}
              />
            </label>
            <button className="primary" onClick={saveProfile}><Save size={18} />保存账号画像</button>
            {profileStatus && <p className="status-text">{profileStatus}</p>}
          </section>
        )}

        {screen === 'revenue' && (
          <section className="workspace">
            <header className="section-header">
              <div>
                <p className="eyebrow">首个 100 元验证</p>
                <h2>用系统产出案例，再换真实付费信号</h2>
              </div>
              <div className="header-actions">
                <button className="secondary" onClick={() => copyText(revenueReport, '收入复盘', 'revenue-report')}><Copy size={18} />复制复盘</button>
                <button className="secondary" onClick={() => downloadTextFile('aishortvideo-revenue-report.md', revenueReport)}><Download size={18} />下载复盘</button>
                <button className="primary" onClick={saveRevenueLead}><Save size={18} />{editingLeadId ? '更新线索' : '保存线索'}</button>
              </div>
            </header>
            <div className="grid three">
              <article className="panel metric"><span>已收款</span><strong>¥{paidRevenue}</strong></article>
              <article className="panel metric"><span>线索</span><strong>{revenueLeads.length}</strong></article>
              <article className="panel metric"><span>强信号</span><strong>{strongSignalCount}</strong></article>
              <article className="panel metric"><span>已联系</span><strong>{contactedCount}</strong></article>
              <article className="panel metric"><span>已发样片</span><strong>{sampleSentCount}</strong></article>
              <article className="panel metric"><span>已报价</span><strong>{quotedCount}</strong></article>
              <article className="panel metric"><span>真实回复</span><strong>{replyCount}</strong></article>
              <article className="panel metric"><span>访谈记录</span><strong>{interviewCount}/10</strong></article>
              <article className="panel metric"><span>今日待联系</span><strong>{todayContactCount}</strong></article>
            </div>
            <article className="panel visual-outreach-card">
              <div>
                <p className="eyebrow">剧情样片触达</p>
                <h3>用《凌晨三点的撤回消息》验证付费信号</h3>
                <p className="muted">当前不要继续打磨视频，先拿 28 秒样片联系 5 个真实对象，至少发出 1 次报价。</p>
                <div className="touchpoint-actions">
                  <button className="primary" onClick={generateVisualDemoLeads}><MessageSquare size={16} />加入 5 个样片触达对象</button>
                  <button className="secondary" onClick={() => copyText(visualDemoOutreachMessage, '样片话术', 'visual-demo-outreach-message')}><Copy size={16} />复制样片话术</button>
                  <button className="secondary" onClick={() => copyText(visualDemoBrief, '样片材料', 'visual-demo-brief')}><ClipboardList size={16} />复制样片材料</button>
                  <a className="secondary" href={visualDemoVideoUrl} target="_blank" rel="noreferrer"><Play size={16} />打开样片</a>
                </div>
              </div>
              <video className="mini-video-preview" src={visualDemoVideoUrl} controls playsInline preload="metadata" />
            </article>
            <div className="grid two">
              <article className="panel">
                <div className="panel-title">
                  <h3>剧情样片话术</h3>
                  <button className="secondary" onClick={() => copyText(visualDemoOutreachMessage, '样片话术', 'visual-demo-outreach-message')}><Copy size={16} />复制</button>
                </div>
                <p className="muted">适合发给剪辑教程、故事号、AI 工具讨论对象。</p>
                <textarea id="visual-demo-outreach-message" className="message-box compact-message" readOnly value={visualDemoOutreachMessage} />
              </article>
              <article className="panel">
                <div className="panel-title">
                  <h3>剧情样片材料</h3>
                  <button className="secondary" onClick={() => copyText(visualDemoBrief, '样片材料', 'visual-demo-brief')}><Copy size={16} />复制</button>
                </div>
                <p className="muted">用于说明样片证明什么、不证明什么，避免过度承诺。</p>
                <textarea id="visual-demo-brief" className="message-box compact-message" readOnly value={visualDemoBrief} />
              </article>
            </div>
            <article className="panel">
              <div className="panel-title">
                <h3>今日执行清单</h3>
                <div className="touchpoint-actions">
                  <button className="secondary" onClick={generateTodayLeads}><Save size={16} />生成今日 5 个</button>
                  <button className="secondary" onClick={() => copyText(todayContactPlan, '今日清单', 'today-contact-plan')}><Copy size={16} />复制清单</button>
                </div>
              </div>
              <p className="muted">先完成 5 个真实联系动作，再讨论要不要继续做功能。</p>
              <textarea id="today-contact-plan" className="message-box compact-message" readOnly value={todayContactPlan} />
            </article>
            <article className="panel">
              <h3>报价版本</h3>
              <div className="offer-list">
                {revenueOffers.map((offer) => (
                  <div className="offer-item" key={offer.name}>
                    <strong>{offer.name}</strong>
                    <span>¥{offer.price}</span>
                    <p>{offer.usage}</p>
                  </div>
                ))}
              </div>
            </article>
            <article className="panel">
              <h3>20 个触点清单</h3>
              <p className="muted">先找有内容生产痛点的人，不从陌生大市场开始。</p>
              <div className="touchpoint-list">
                {touchpointSeeds.map((seed) => (
                  <div className="touchpoint-row" key={`${seed.channel}-${seed.name}`}>
                    <div>
                      <strong>{seed.name}</strong>
                      <span>{seed.channel} / {seed.need}</span>
                    </div>
                    <p>{seed.nextAction}</p>
                    <div className="touchpoint-actions">
                      <button className="secondary" onClick={() => useTouchpoint(seed)}><MessageSquare size={16} />填入线索</button>
                      <button className="secondary" onClick={() => addTouchpointLead(seed)}><Save size={16} />加入今日</button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
            <section className="grid two">
              <article className="panel">
                <div className="panel-title">
                  <h3>{editingLeadId ? '编辑线索' : '新增线索'}</h3>
                  {editingLeadId && <button className="secondary" onClick={cancelLeadEditing}>取消编辑</button>}
                </div>
                <label>客户或账号
                  <input
                    value={leadDraft.name}
                    onChange={(event) => setLeadDraft({ ...leadDraft, name: event.target.value })}
                    placeholder="例如：某内容创业者 / 某社群朋友"
                  />
                </label>
                <label>来源渠道
                  <input
                    value={leadDraft.channel}
                    onChange={(event) => setLeadDraft({ ...leadDraft, channel: event.target.value })}
                    placeholder="例如：朋友圈、小红书、微信群"
                  />
                </label>
                <label>需求
                  <textarea
                    value={leadDraft.need}
                    onChange={(event) => setLeadDraft({ ...leadDraft, need: event.target.value })}
                    placeholder="对方想解决什么内容生产问题"
                  />
                </label>
              </article>
              <article className="panel">
                <h3>成交跟进</h3>
                <label>报价
                  <select value={leadDraft.offer} onChange={(event) => setLeadDraft({ ...leadDraft, offer: event.target.value })}>
                    {revenueOffers.map((offer) => <option key={offer.name}>{offer.name}</option>)}
                  </select>
                </label>
                <label>状态
                  <select value={leadDraft.status} onChange={(event) => setLeadDraft({ ...leadDraft, status: event.target.value as RevenueStatus })}>
                    {revenueStatuses.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
                <label>金额
                  <input
                    type="number"
                    min="0"
                    value={leadDraft.amount}
                    onChange={(event) => setLeadDraft({ ...leadDraft, amount: Number(event.target.value) })}
                  />
                </label>
                <label>下一步
                  <input
                    value={leadDraft.nextAction}
                    onChange={(event) => setLeadDraft({ ...leadDraft, nextAction: event.target.value })}
                    placeholder="例如：今晚发 1 条演示案例"
                  />
                </label>
                <label>客户回复
                  <textarea
                    value={leadDraft.reply}
                    onChange={(event) => setLeadDraft({ ...leadDraft, reply: event.target.value })}
                    placeholder="记录对方真实反馈，不要脑补"
                  />
                </label>
                <label>异议类型
                  <select value={leadDraft.objection} onChange={(event) => setLeadDraft({ ...leadDraft, objection: event.target.value })}>
                    <option value="">未选择</option>
                    {objectionOptions.map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
                <label>下次跟进
                  <input
                    type="datetime-local"
                    value={leadDraft.followUpAt}
                    onChange={(event) => setLeadDraft({ ...leadDraft, followUpAt: event.target.value })}
                  />
                </label>
                <label>交付记录
                  <textarea
                    value={leadDraft.deliveryNote}
                    onChange={(event) => setLeadDraft({ ...leadDraft, deliveryNote: event.target.value })}
                    placeholder="例如：已交付 1 条素材包 / 已发视频样片 / 客户要求改标题"
                  />
                </label>
                <label>验证信号
                  <textarea
                    value={leadDraft.validationSignal}
                    onChange={(event) => setLeadDraft({ ...leadDraft, validationSignal: event.target.value })}
                    placeholder="例如：愿意付费 / 只想免费试 / 认为分镜最有价值 / 觉得视频不够真实"
                  />
                </label>
                <label>备注
                  <textarea value={leadDraft.note} onChange={(event) => setLeadDraft({ ...leadDraft, note: event.target.value })} />
                </label>
              </article>
            </section>
            <section className="grid two">
              <article className="panel">
                <div className="panel-title">
                  <h3>可发送话术</h3>
                  <button className="secondary" onClick={() => copyText(outreachMessage, '话术', 'outreach-message')}><Copy size={16} />复制</button>
                </div>
                <p className="muted">选中触点或填写线索后，这里会自动生成一段可直接私聊的话。</p>
                <textarea id="outreach-message" className="message-box" readOnly value={outreachMessage} />
              </article>
              <article className="panel">
                <div className="panel-title">
                  <h3>演示材料摘要</h3>
                  <button className="secondary" onClick={() => copyText(demoBrief, '演示材料', 'demo-brief')}><Copy size={16} />复制</button>
                </div>
                <p className="muted">用于给潜在客户说明系统交付什么，不讲复杂技术。</p>
                <textarea id="demo-brief" className="message-box" readOnly value={demoBrief} />
              </article>
            </section>
            <article className="panel">
              <div className="panel-title">
                <h3>异议回复话术</h3>
                <button className="secondary" onClick={() => copyText(objectionReply, '异议回复', 'objection-reply')}><Copy size={16} />复制</button>
              </div>
              <p className="muted">根据当前线索的异议类型生成，适合真实沟通后继续跟进。</p>
              <textarea id="objection-reply" className="message-box compact-message" readOnly value={objectionReply} />
            </article>
            <article className="panel">
              <div className="panel-title">
                <h3>报价话术</h3>
                <button className="secondary" onClick={() => copyText(quoteMessage, '报价话术', 'quote-message')}><Copy size={16} />复制</button>
              </div>
              <p className="muted">只有对方愿意看样片、愿意给方向或问价格时，再复制这段报价。</p>
              <textarea id="quote-message" className="message-box compact-message" readOnly value={quoteMessage} />
            </article>
            <article className="panel">
              <div className="panel-title">
                <h3>收款前确认单</h3>
                <button className="secondary" onClick={() => copyText(paymentConfirmation, '收款确认单', 'payment-confirmation')}><Copy size={16} />复制</button>
              </div>
              <p className="muted">对方接受报价后发送，先讲清交付边界，再收款。</p>
              <textarea id="payment-confirmation" className="message-box compact-message" readOnly value={paymentConfirmation} />
            </article>
            <article className="panel">
              <div className="panel-title">
                <h3>收入验证复盘</h3>
                <div className="lead-actions">
                  <button className="secondary" onClick={() => copyText(revenueReport, '收入复盘', 'revenue-report')}><Copy size={16} />复制</button>
                  <button className="secondary" onClick={() => downloadTextFile('aishortvideo-revenue-report.md', revenueReport)}><Download size={16} />下载</button>
                </div>
              </div>
              <p className="muted">每天触达结束后导出一次，判断下一步该修话术、人群、报价还是产品。</p>
              <textarea id="revenue-report" className="message-box compact-message" readOnly value={revenueReport} />
            </article>
            {copyStatus && <p className="status-text">{copyStatus}</p>}
            <article className="panel">
              <div className="panel-title">
                <h3>线索记录</h3>
                <div className="lead-actions">
                  {(['全部', '待处理', ...revenueStatuses] as const).map((status) => (
                    <button
                      className={revenueFilter === status ? 'primary' : 'secondary'}
                      key={status}
                      onClick={() => setRevenueFilter(status)}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
              {revenueLeads.length === 0 ? (
                <div className="empty">
                  <MessageSquare size={28} />
                  <p>还没有线索。今天先记录 5 个可沟通对象，不等系统完美再开始验证。</p>
                </div>
              ) : filteredRevenueLeads.length === 0 ? (
                <div className="empty">
                  <MessageSquare size={28} />
                  <p>当前筛选下没有线索。</p>
                </div>
              ) : (
                <div className="lead-list">
                  {filteredRevenueLeads.map((lead) => (
                    <div className="lead-row" key={lead.id}>
                      <div>
                        <strong>{lead.name}</strong>
                        <span>{lead.channel || '未填写渠道'} / {lead.offer}</span>
                      </div>
                      <span>{lead.status}</span>
                      <span>¥{lead.amount}</span>
                      <p>
                        {lead.reply || lead.objection || lead.nextAction || lead.need || '待补下一步'}
                        {lead.followUpAt ? ` / 下次跟进：${lead.followUpAt.replace('T', ' ')}` : ''}
                        {lead.validationSignal ? ` / 信号：${lead.validationSignal}` : ''}
                      </p>
                      <p className="lead-advice">{inferLeadNextStep(lead)}</p>
                      <div className="lead-actions">
                        <button className="secondary" onClick={() => updateRevenueLead(lead.id, { status: '已联系' })}>已联系</button>
                        <button className="secondary" onClick={() => updateRevenueLead(lead.id, { status: '已发样片' })}>已发样片</button>
                        <button className="secondary" onClick={() => updateRevenueLead(lead.id, { status: '已报价' })}>已报价</button>
                        <button className="secondary" onClick={() => updateRevenueLead(lead.id, { status: '强意向' })}>强意向</button>
                        <button className="secondary" onClick={() => updateRevenueLead(lead.id, { status: '已付款', amount: lead.amount || 29 })}>已付款</button>
                        <button className="secondary" onClick={() => editRevenueLead(lead)}>编辑</button>
                        <button className="secondary" onClick={() => startCreationFromLead(lead)}><Wand2 size={16} />用需求生成</button>
                        <button className="secondary" onClick={() => deleteRevenueLead(lead.id)}><Trash2 size={16} />删除</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>
        )}

        {screen === 'settings' && (
          <section className="settings-stack">
            <article className="panel narrow">
              <h2>模型连接设置</h2>
              <p className="muted">这里只给管理员使用。主流程不展示模型复杂度，API Key 不保存到浏览器。</p>
              <label>供应商
                <input value="OpenAI-compatible" readOnly />
              </label>
              <label>Base URL
                <input
                  value={modelConfig.baseUrl}
                  onChange={(event) => setModelConfig({ ...modelConfig, baseUrl: event.target.value })}
                  placeholder="可留空，优先读取 .env.local"
                />
              </label>
              <label>API Key
                <input
                  type="password"
                  value={modelConfig.apiKey}
                  onChange={(event) => setModelConfig({ ...modelConfig, apiKey: event.target.value })}
                  placeholder="可留空，优先读取 .env.local"
                />
              </label>
              <label>默认模型
                <input
                  value={modelConfig.model}
                  onChange={(event) => setModelConfig({ ...modelConfig, model: event.target.value })}
                  placeholder="可留空，优先读取 .env.local"
                />
              </label>
              <button className="primary" onClick={testModelConnection}><CheckCircle2 size={18} />测试连接</button>
              <p className="status-text">{modelStatus}</p>
            </article>

            <article className="panel narrow">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">模型替换闸门</p>
                  <h2>3 条生成质量准入测试</h2>
                </div>
                <button className="primary" onClick={runModelQualityGate}><RefreshCw size={18} />运行测试</button>
              </div>
              <p className="muted">任何模型都先跑同一批样例。真实模型生成失败、结构不完整或质量低于阈值，都不要拿去对外演示。</p>
              <div className="quality-case-list">
                {modelQualityCases.map((testCase) => (
                  <div className="quality-case" key={testCase.name}>
                    <strong>{testCase.name}</strong>
                    <span>{testCase.focus}</span>
                    <p>{testCase.input.idea}</p>
                  </div>
                ))}
              </div>
              <p className="status-text">{modelQualityStatus}</p>
              {modelQualityResults.length > 0 && (
                <div className="gate-results">
                  {modelQualityResults.map((result) => (
                    <div className={`gate-result ${result.passed ? 'pass' : 'fail'}`} key={result.caseName}>
                      <div>
                        <strong>{result.caseName}</strong>
                        <span>{result.source} / {result.score}/50</span>
                      </div>
                      <p>{result.title}</p>
                      <small>{result.message}</small>
                      {result.warnings.length > 0 && (
                        <ul>
                          {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>
        )}
      </main>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
