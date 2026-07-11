export const DEFAULT_NOVEL_GENRE_OPTIONS = [
  '都市逆袭',
  '女频爽文',
  '玄学直播',
  '职场商战',
  '重生复仇',
  '系统暴富',
  '甜宠治愈',
  '悬疑推理',
  '修仙升级',
  '短剧改编',
]

export const DEFAULT_NOVEL_APPEAL_OPTIONS = [
  '低谷翻盘',
  '身份反转',
  '当场打脸',
  '强成长',
  '复仇清算',
  '财富逆袭',
  '情绪拉扯',
  '高能反转',
  '悬念追更',
  '爽点密集',
]

export const HOTSPOT_SOURCE_UNAVAILABLE_REASON = '当前暂无可用热点数据或热点引用能力，不能选择“引用热点”。可先使用系统推荐或手动想法。'

export const NOVEL_CREATION_SOURCE_OPTIONS = [
  {
    value: 'system_recommendation',
    label: '系统推荐',
    disabled: false,
    reason: '系统推荐会按题材、爽点和默认策略作为方向生成参考；补充想法可不填。',
  },
  {
    value: 'hotspot_reference',
    label: '引用热点',
    disabled: true,
    reason: HOTSPOT_SOURCE_UNAVAILABLE_REASON,
  },
  {
    value: 'manual_idea',
    label: '手动想法',
    disabled: false,
    reason: '系统会围绕你的核心想法扩展方向；核心想法需要至少 6 个字符。',
  },
] as const
