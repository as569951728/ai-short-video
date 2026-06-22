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
          <el-button v-if="summary && !detail" size="small" type="primary" @click="$emit('view')">查看详情</el-button>
        </div>
      </div>

      <el-progress :percentage="displayTask?.progress ?? 0" :status="progressStatus" />
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
        v-if="detail?.userFailureReason"
        :title="detail.userFailureReason"
        :type="detail.status === TaskStatus.Cancelled ? 'info' : 'error'"
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
          <small>进度 {{ event.progress ?? '-' }} / Request {{ event.requestId || '-' }}</small>
        </el-timeline-item>
      </el-timeline>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { TaskStatus, type RecentTaskSummaryDTO, type TaskDetailDTO } from '@ai-shortvideo/shared'

const props = defineProps<{
  summary?: RecentTaskSummaryDTO | null
  detail?: TaskDetailDTO | null
  loading?: boolean
  actionLoading?: boolean
}>()

defineEmits<{
  view: []
  retry: []
  cancel: []
  refresh: []
}>()

const displayTask = computed(() => props.detail ?? props.summary ?? null)
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
const progressStatus = computed(() => {
  if (displayTask.value?.status === TaskStatus.Failed) return 'exception'
  if (displayTask.value?.status === TaskStatus.Completed || displayTask.value?.status === TaskStatus.WaitingConfirmation) return 'success'
  return undefined
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
