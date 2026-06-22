export type ActionTarget = 'drawer' | 'dialog' | 'page' | 'task'

export type RecommendedAction = {
  label: string
  reason: string
  intent: 'primary' | 'warning' | 'danger' | 'info'
  target: ActionTarget
}

export type Novel = {
  id: string
  title: string
  genre: string
  hotspot: string
  stage: string
  status: string
  chapterProgress: string
  pendingChapters: number
  qualityScore: number
  marketScore: number
  videoStatus: string
  taskStatus: string
  updatedAt: string
  action: RecommendedAction
  topIssues: string[]
}

export type Chapter = {
  id: string
  no: number
  title: string
  status: string
  note: string
  score: number
  wordCount: number
  videoReferenced: boolean
}

export type VideoProject = {
  id: string
  title: string
  novelTitle: string
  chapters: string
  status: string
  audioStatus: string
  subtitleStatus: string
  renderStatus: string
  publishStatus: string
  dataStatus: string
  referenceStatus: string
  action: RecommendedAction
}

export type TaskItem = {
  id: string
  name: string
  object: string
  status: string
  progress: number
  step: string
  failedReason?: string
}
