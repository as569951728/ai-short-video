<template>
  <div class="task-progress-panel">
    <el-empty v-if="!summary && !detail && !loading" description="暂无任务记录" />

    <template v-else>
      <div class="task-progress-head">
        <div>
          <span class="muted">任务状态</span>
          <strong>{{ displayTask?.statusText || '读取中' }}</strong>
        </div>
        <div class="task-progress-actions">
          <el-tag v-if="displayTask" :type="taskTagType(displayTask.status)" effect="plain">{{ displayTask.statusText }}</el-tag>
          <el-button size="small" :loading="loading" @click="$emit('refresh')">刷新</el-button>
          <el-button v-if="resultPlacement" size="small" type="success" @click="$emit('viewResult', resultPlacement.stepKey)">{{ resultPlacement.actionLabel }}</el-button>
          <el-button v-if="summary && !detail" size="small" type="primary" @click="$emit('view')">查看详情</el-button>
        </div>
      </div>

      <div class="task-progress-row">
        <el-progress
          class="task-progress-bar"
          :percentage="progressPercentage"
          :status="progressStatus"
          :indeterminate="isProcessing"
          :duration="1.6"
          :show-text="!isProcessing"
        />
        <span v-if="isProcessing" class="task-progress-label">生成中</span>
      </div>
      <p v-if="isProcessing" class="task-progress-hint">阶段进度：正在调用模型或保存结果，当前不展示精确百分比。</p>
      <p class="task-progress-step">{{ displayTask?.currentStep || '等待任务状态更新' }}</p>
      <div v-if="displayTask" class="task-progress-meta">
        <span>状态 {{ displayTask.status }}</span>
        <span v-if="taskStartedAt">开始 {{ formatDateTime(taskStartedAt) }}</span>
        <span v-if="elapsedText">已耗时 {{ elapsedText }}</span>
      </div>

      <el-alert
        v-if="isProcessing"
        title="正在调用模型生成内容，可能需要 1-3 分钟，可以稍后回来查看"
        type="info"
        show-icon
        :closable="false"
      />

      <el-alert
        v-if="resultPlacement"
        :title="resultPlacement.summary"
        type="success"
        show-icon
        :closable="false"
      />

      <el-alert
        v-if="visibleFailureReason"
        :title="visibleFailureReason"
        :type="displayTask?.status === TaskStatus.Cancelled ? 'info' : 'error'"
        show-icon
        :closable="false"
      />

      <div v-if="detail" class="task-trace-grid">
        <div><span>Task ID</span><strong>{{ detail.trace.taskId }}</strong></div>
        <div><span>Request ID</span><strong>{{ detail.trace.requestId || '-' }}</strong></div>
        <div><span>失败分类</span><strong>{{ detail.failureCategoryText || '-' }}</strong></div>
      </div>

      <div v-if="detail" class="task-detail-actions">
        <el-button v-if="detail.retryable" type="primary" :loading="actionLoading" @click="$emit('retry')">重试任务</el-button>
        <el-button v-if="detail.cancellable" :loading="actionLoading" @click="$emit('cancel')">取消任务</el-button>
        <span class="muted">{{ detail.nextAction.reasonText }}</span>
      </div>

      <el-timeline v-if="detail?.events.length" class="task-event-list">
        <el-timeline-item v-for="event in detail.events" :key="event.id" :timestamp="formatDateTime(event.createdAt)">
          <strong>{{ event.eventTypeText }}</strong>
          <p>{{ event.message }}</p>
          <small>{{ formatEventProgress(event.progress, event.status) }} / Request {{ event.requestId || '-' }}</small>
        </el-timeline-item>
      </el-timeline>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { TaskStatus, type RecentTaskSummaryDTO, type TaskDetailDTO } from '@ai-shortvideo/shared'
import { getTaskResultPlacement, type NovelWorkbenchStepKey } from '../model/novelDetailView'

const props = defineProps<{
  summary?: RecentTaskSummaryDTO | null
  detail?: TaskDetailDTO | null
  loading?: boolean
  actionLoading?: boolean
}>()

defineEmits<{
  view: []
  viewResult: [stepKey: NovelWorkbenchStepKey]
  retry: []
  cancel: []
  refresh: []
}>()

const displayTask = computed(() => props.detail ?? props.summary ?? null)
const resultPlacement = computed(() => getTaskResultPlacement(displayTask.value))
const nowMs = ref(Date.now())
let elapsedTimer: ReturnType<typeof window.setInterval> | undefined

const taskStartedAt = computed(() => {
  const task = displayTask.value as (RecentTaskSummaryDTO & { createdAt?: string; startedAt?: string }) | null
  return task?.createdAt ?? task?.startedAt ?? null
})
const elapsedText = computed(() => {
  if (!taskStartedAt.value) return ''
  const startedMs = Date.parse(taskStartedAt.value)
  if (!Number.isFinite(startedMs)) return ''

  return formatDuration(Math.max(0, nowMs.value - startedMs))
})
const isProcessing = computed(() => displayTask.value?.status === TaskStatus.Queued || displayTask.value?.status === TaskStatus.Processing)
const progressPercentage = computed(() => {
  if (!displayTask.value) return 0
  if (isProcessing.value) return 100
  return displayTask.value.progress ?? 0
})
const progressStatus = computed(() => {
  if (displayTask.value?.status === TaskStatus.Failed) return 'exception'
  if (displayTask.value?.status === TaskStatus.Completed || displayTask.value?.status === TaskStatus.WaitingConfirmation) return 'success'
  return undefined
})
const visibleFailureReason = computed(() => {
  if (!displayTask.value) return ''
  if (props.detail?.userFailureReason) return props.detail.userFailureReason
  if (displayTask.value.status === TaskStatus.Failed) {
    return displayTask.value.errorMessage ?? displayTask.value.currentStep ?? '任务失败，请查看详情后重试。'
  }
  if (displayTask.value.status === TaskStatus.Cancelled) {
    return props.detail?.cancelReason ?? displayTask.value.currentStep ?? '任务已取消。'
  }
  return ''
})

onMounted(() => {
  elapsedTimer = window.setInterval(() => {
    nowMs.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (elapsedTimer !== undefined) window.clearInterval(elapsedTimer)
})

function taskTagType(status: TaskStatus | string) {
  if (status === TaskStatus.Failed) return 'danger'
  if (status === TaskStatus.Cancelled) return 'info'
  if (status === TaskStatus.Completed || status === TaskStatus.WaitingConfirmation) return 'success'
  return 'warning'
}

function formatDateTime(value: string) {
  return value.replace('T', ' ').slice(0, 16)
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) return `${seconds} 秒`
  return `${minutes} 分 ${seconds} 秒`
}

function formatEventProgress(progress: number | null | undefined, status: TaskStatus | string) {
  if (status === TaskStatus.Queued || status === TaskStatus.Processing) return '阶段进度：进行中'
  return `进度 ${progress ?? '-'}`
}
</script>

<style scoped>
.task-progress-panel {
  display: grid;
  gap: 12px;
}

.task-progress-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.task-progress-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.task-progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.task-progress-bar {
  flex: 1;
  min-width: 0;
}

.task-progress-label {
  flex: 0 0 auto;
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 600;
}

.task-progress-hint {
  margin: -4px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.task-progress-step {
  margin: 0;
  color: var(--el-text-color-primary);
}

.task-progress-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.task-trace-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.task-trace-grid div {
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.task-trace-grid span,
.muted {
  display: block;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.task-trace-grid strong {
  display: block;
  overflow-wrap: anywhere;
}

.task-detail-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.task-event-list {
  margin-top: 8px;
}
</style>
