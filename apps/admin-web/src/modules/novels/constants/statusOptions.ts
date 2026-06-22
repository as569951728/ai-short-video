import { enumOptions } from '@ai-shortvideo/shared'

export const creationStageOptions = enumOptions.novelCreationStage
export const lifecycleStatusOptions = enumOptions.novelLifecycleStatus
export const stageStatusOptions = enumOptions.stageStatus
export const taskStatusOptions = enumOptions.taskStatus
export const impactLevelOptions = enumOptions.impactLevel

export const videoReferenceStatusOptions = [
  { label: '未准备', value: 'not_referenced' },
  { label: '可被引用', value: 'ready' },
  { label: '已引用', value: 'referenced' },
  { label: '引用异常', value: 'exception' },
]
