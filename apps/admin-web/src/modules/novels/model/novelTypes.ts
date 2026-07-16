import type { NovelCreationStage, NovelCreationSourceType, NovelLifecycleStatus, PagedResult, StageStatus, VersionStatus } from '@ai-shortvideo/shared'
import type { RecommendedAction } from '../../../types/prototype'

export interface NovelListQuery {
  page?: number
  pageSize?: number
  keyword?: string
  creationStage?: string
  lifecycleStatus?: string
  videoReferenceStatus?: string
}

export interface NovelListRow {
  id: string
  title: string
  genre: string
  hotspot: string
  creationSourceType: NovelCreationSourceType
  creationSourceText: string
  stage: string
  status: string
  creationStage: NovelCreationStage
  lifecycleStatus: NovelLifecycleStatus
  stageStatus: StageStatus
  chapterProgress: string
  pendingChapters: number
  qualityScore: string
  marketScore: string
  videoReferenceStatus: string
  videoStatus: string
  taskStatus: string
  recentTaskId: string | null
  recentTaskProgress: number | null
  updatedAt: string
  action: RecommendedAction
  primaryAction: {
    label: string
    target: 'detail'
  }
  topIssues: string[]
}

export type NovelListResult = PagedResult<NovelListRow>

export interface DirectionCandidateRow {
  id: string
  title: string
  versionLabel: string
  statusKey: VersionStatus | string
  status: string
  scoreText: string
  marketScoreText: string
  riskLevelText: string
  riskTags: string[]
  logline: string
  coreHook: string
  audienceAppeal: string
  videoPotential: string
  sellingPoints: string[]
  primaryReason: string
  lowScoreRequiresConfirm: boolean
  canAdopt: boolean
}

export interface StructureAssetRow {
  id: string
  objectType: 'setting' | 'outline' | 'stage_outline' | 'chapter_plan'
  typeText: string
  title: string
  versionLabel: string
  statusKey: VersionStatus | string
  status: string
  scoreText: string
  riskLevelText: string
  riskTags: string[]
  summary: string
  sections: Array<{
    title: string
    body: string
    items: string[]
  }>
  stages: Array<{
    stageIndex: number
    title: string
    chapterRange: string
    goal: string
    conflict: string
    payoff: string
  }>
  chapterCount: number
  primaryReason: string
  canAdopt: boolean
  highRiskRequiresConfirm: boolean
}

export interface NovelChapterPlanRow {
  id: string
  chapterNo: number
  stageIndex: number | null
  title: string
  wordTarget: string
  wordCount: string
  statusText: string
  statusNote: string
  impactLevelText: string
  hasCurrentContent: boolean
}

export interface TrialCandidateRow {
  id: string
  chapterId: string
  title: string
  versionLabel: string
  statusText: string
  scoreText: string
  gateText: string
  riskLevelText: string
  riskTags: string[]
  openingStrategy: string
  openingHighlight: string
  firstSentence: string
  first300Summary: string
  endingHook: string
  aiRecommendedReason: string
  isAiRecommended: boolean
  isSelected: boolean
  canSelect: boolean
  requiresRiskConfirm: boolean
  evidence: string[]
  penalties: string[]
  content: string
}

export interface TrialChapterResultRow {
  id: string
  chapterId: string
  chapterNo: number
  title: string
  statusText: string
  scoreText: string
  hardFailed: boolean
  hardFailureReasons: string[]
  summary: string
  issueCount: number
}
