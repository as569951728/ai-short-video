<template>
  <section class="page-stack">
    <div class="list-title-row">
      <span class="title-accent"></span>
      <h1>小说列表</h1>
    </div>

    <el-alert
      v-if="apiError"
      :title="apiError"
      type="error"
      show-icon
      :closable="true"
      @close="apiError = ''"
    />

    <div class="status-block">
      <span class="status-block-title">小说状态</span>
      <div class="status-tabs">
        <div v-for="metric in novelMetrics" :key="metric.label" class="status-tab">
          <span>{{ metric.label }}</span>
          <strong>({{ metric.value }})</strong>
        </div>
      </div>
    </div>

    <el-card shadow="never" class="filter-panel">
      <el-form label-width="84px">
        <div class="filter-grid">
          <div class="filter-fields">
            <el-form-item label="小说名称">
              <el-input v-model="filters.keyword" placeholder="请输入小说名称" clearable />
            </el-form-item>
            <el-form-item label="创作阶段">
              <el-select v-model="filters.creationStage" placeholder="全部" clearable>
                <el-option
                  v-for="option in creationStageOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="是否待处理">
              <el-select v-model="filters.needAction" placeholder="全部" clearable>
                <el-option label="待处理" value="yes" />
                <el-option label="正常" value="no" />
              </el-select>
            </el-form-item>
            <el-form-item label="题材">
              <el-select v-model="filters.genre" placeholder="全部" clearable>
                <el-option label="都市逆袭" value="都市逆袭" />
                <el-option label="女频爽文" value="女频爽文" />
                <el-option label="玄学直播" value="玄学直播" />
                <el-option label="职场商战" value="职场商战" />
              </el-select>
            </el-form-item>
            <el-form-item label="视频引用">
              <el-select v-model="filters.videoStatus" placeholder="全部" clearable>
                <el-option
                  v-for="option in videoReferenceStatusOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </el-form-item>
          </div>
          <div class="filter-side">
            <div class="filter-buttons">
              <el-button type="primary" :icon="Search" :loading="loading" @click="loadNovels">搜索</el-button>
              <el-button @click="resetFilters">重置</el-button>
            </div>
            <div class="data-count">
              {{ sourceLabel }} / 共 <strong>{{ total }}</strong> 条数据
            </div>
          </div>
        </div>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-card">
      <div class="table-toolbar">
        <div class="toolbar-actions">
          <el-button type="primary" :icon="Plus" @click="router.push('/novels/new')">创建小说</el-button>
          <el-button :loading="loading" @click="loadNovels">刷新</el-button>
        </div>
      </div>
      <el-table v-loading="loading" :data="filteredNovels" row-key="id" border stripe>
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="row-expansion">
              <div>
                <h3>创作概况</h3>
                <p>当前阶段：{{ row.stage }}</p>
                <p>章节进度：{{ row.chapterProgress }}</p>
              </div>
              <div>
                <h3>待处理数据</h3>
                <p>待处理章节：{{ row.pendingChapters }} 章</p>
                <p>最近任务：{{ row.taskStatus }}</p>
              </div>
              <div>
                <h3>详情操作</h3>
                <el-button size="small" type="primary" @click="router.push(`/novels/${row.id}`)">进入小说详情</el-button>
                <el-button size="small" :disabled="!row.recentTaskId" @click="openDrawer(row, 'task')">查看任务</el-button>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="小说名称" min-width="230">
          <template #default="{ row }">
            <button class="link-button title-link" type="button" @click="router.push(`/novels/${row.id}`)">{{ row.title }}</button>
            <div class="muted-line">{{ row.genre }} / {{ row.creationSourceText }}</div>
          </template>
        </el-table-column>
        <el-table-column label="小说状态" min-width="160">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)">{{ row.status }}</el-tag>
            <div class="muted-line">{{ row.stage }}</div>
          </template>
        </el-table-column>
        <el-table-column label="章节进度" width="126">
          <template #default="{ row }">
            <strong>{{ row.chapterProgress }}</strong>
            <div class="muted-line">待处理 {{ row.pendingChapters }}</div>
          </template>
        </el-table-column>
        <el-table-column label="评分" width="150">
          <template #default="{ row }">
            <div class="score-line">质量 {{ row.qualityScore }}</div>
            <div class="score-line market">受欢迎度 {{ row.marketScore }}</div>
          </template>
        </el-table-column>
        <el-table-column label="视频引用状态" width="150">
          <template #default="{ row }">
            <el-tag :type="row.videoStatus.includes('异常') ? 'danger' : 'info'" effect="plain">{{ row.videoStatus }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="下一步" min-width="220">
          <template #default="{ row }">
            <strong>{{ row.action.label }}</strong>
            <div class="muted-line">{{ row.action.reason }}</div>
          </template>
        </el-table-column>
        <el-table-column label="最近任务" min-width="150" prop="taskStatus" />
        <el-table-column label="任务进度" width="120">
          <template #default="{ row }">
            <span v-if="row.recentTaskProgress !== null">{{ row.recentTaskProgress }}%</span>
            <span v-else class="muted-line">-</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="150" prop="updatedAt" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button type="primary" size="small" @click="router.push(`/novels/${row.id}`)">{{ row.primaryAction.label }}</el-button>
              <el-button text size="small" :disabled="!row.recentTaskId" @click="openDrawer(row, 'task')">查看任务</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-drawer v-model="drawer.open" :title="drawer.title" size="520px">
      <div class="drawer-stack">
        <el-alert v-if="drawer.error" :title="drawer.error" type="error" show-icon :closable="false" />
        <TaskProgressPanel
          :detail="drawer.task"
          :loading="drawer.loading"
          :action-loading="drawer.actionLoading"
          @refresh="loadDrawerTask"
          @retry="handleRetryTask"
          @cancel="handleCancelTask"
        />
      </div>
    </el-drawer>

  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import type { TaskDetailDTO } from '@ai-shortvideo/shared'
import { ApiClientError } from '../shared/services/http'
import { getApiMode } from '../shared/services/apiMode'
import TaskProgressPanel from '../modules/novels/components/TaskProgressPanel.vue'
import { creationStageOptions, videoReferenceStatusOptions } from '../modules/novels/constants/statusOptions'
import { listNovels } from '../modules/novels/services/novelService'
import { cancelTask as cancelGenerationTask, getTaskDetail, retryTask as retryGenerationTask } from '../modules/novels/services/taskService'
import type { NovelListRow } from '../modules/novels/model/novelTypes'

const router = useRouter()
const filters = reactive({ keyword: '', creationStage: '', needAction: '', genre: '', videoStatus: '' })
const drawer = reactive({
  open: false,
  title: '任务详情',
  taskId: '',
  task: null as TaskDetailDTO | null,
  loading: false,
  actionLoading: false,
  error: '',
})
const novelRows = ref<NovelListRow[]>([])
const total = ref(0)
const loading = ref(false)
const apiError = ref('')
const sourceMode = getApiMode()
const sourceLabel = computed(() => (sourceMode === 'mock' ? 'Mock 数据' : '后端接口'))

const filteredNovels = computed(() =>
  novelRows.value.filter((novel) => {
    const keywordMatched = !filters.keyword || novel.title.includes(filters.keyword)
    const stageMatched = !filters.creationStage || novel.creationStage === filters.creationStage
    const actionMatched = !filters.needAction || (filters.needAction === 'yes' ? novel.pendingChapters > 0 || novel.status.includes('需') : novel.pendingChapters === 0)
    const genreMatched = !filters.genre || novel.genre === filters.genre
    const videoMatched = !filters.videoStatus || novel.videoReferenceStatus === filters.videoStatus
    return keywordMatched && stageMatched && actionMatched && genreMatched && videoMatched
  }),
)

const novelMetrics = computed(() => {
  const list = filteredNovels.value
  return [
    { label: '全部', value: list.length },
    { label: '待处理', value: list.filter((novel) => novel.pendingChapters > 0 || novel.status.includes('需') || novel.status.includes('待处理')).length },
    { label: '生成中', value: list.filter((novel) => novel.status.includes('生成中') || novel.taskStatus.includes('/')).length },
    { label: '待视频化', value: list.filter((novel) => novel.status.includes('待视频化')).length },
  ]
})

function resetFilters() {
  filters.keyword = ''
  filters.creationStage = ''
  filters.needAction = ''
  filters.genre = ''
  filters.videoStatus = ''
  loadNovels()
}

async function openDrawer(row: NovelListRow, target: string) {
  drawer.open = true
  drawer.title = target === 'task' ? '任务进度' : row.action.label
  drawer.taskId = row.recentTaskId ?? ''
  drawer.task = null
  drawer.error = ''

  if (!drawer.taskId) {
    drawer.error = '暂无可查看的任务记录'
    return
  }

  await loadDrawerTask()
}

async function loadDrawerTask() {
  if (!drawer.taskId) return

  drawer.loading = true
  drawer.error = ''

  try {
    drawer.task = await getTaskDetail(drawer.taskId)
  } catch (error) {
    drawer.error = formatApiError(error)
  } finally {
    drawer.loading = false
  }
}

async function handleRetryTask() {
  if (!drawer.task) return

  drawer.actionLoading = true
  drawer.error = ''

  try {
    const result = await retryGenerationTask(drawer.task.id, { reason: '从小说列表任务抽屉重试' })
    drawer.taskId = result.newTask.id
    drawer.task = result.newTask
    ElMessage.success('已创建重试任务')
    await loadNovels()
  } catch (error) {
    drawer.error = formatApiError(error)
  } finally {
    drawer.actionLoading = false
  }
}

async function handleCancelTask() {
  if (!drawer.task) return

  drawer.actionLoading = true
  drawer.error = ''

  try {
    const result = await cancelGenerationTask(drawer.task.id, { reason: '从小说列表任务抽屉取消' })
    drawer.task = result.task
    ElMessage.success('任务已取消')
    await loadNovels()
  } catch (error) {
    drawer.error = formatApiError(error)
  } finally {
    drawer.actionLoading = false
  }
}

function statusTagType(status: string) {
  if (status.includes('待处理') || status.includes('需')) return 'warning'
  if (status.includes('生成中')) return 'primary'
  if (status.includes('待视频化')) return 'success'
  return 'info'
}

async function loadNovels() {
  loading.value = true
  apiError.value = ''

  try {
    const result = await listNovels({
      page: 1,
      pageSize: 20,
      keyword: filters.keyword,
      creationStage: filters.creationStage,
      videoReferenceStatus: filters.videoStatus,
    })
    novelRows.value = result.items
    total.value = result.total
  } catch (error) {
    novelRows.value = []
    total.value = 0
    apiError.value = formatApiError(error)
  } finally {
    loading.value = false
  }
}

function formatApiError(error: unknown) {
  if (error instanceof ApiClientError) {
    const requestText = error.requestId ? `（请求 ID：${error.requestId}）` : ''
    return `${error.message}${requestText}`
  }

  return error instanceof Error ? error.message : '请求失败，请稍后重试'
}

onMounted(() => {
  loadNovels()
})

</script>
