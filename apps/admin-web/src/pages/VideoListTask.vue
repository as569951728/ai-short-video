<template>
  <section class="page-stack">
    <div class="page-heading">
      <div>
        <h1>{{ isTaskMode ? '任务中心' : '视频列表' }}</h1>
        <p>{{ isTaskMode ? '集中查看 AI 生成、审稿、视频渲染等长任务。' : '早期视频只做小说承接、简单生成、人工发布记录和数据回填。' }}</p>
      </div>
      <div class="heading-actions">
        <el-button v-if="!isTaskMode" type="primary" @click="createVideoDialog = true">新建视频</el-button>
        <el-button @click="router.push(isTaskMode ? '/videos' : '/tasks')">{{ isTaskMode ? '查看视频列表' : '查看任务中心' }}</el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="视频列表" name="videos">
        <el-card shadow="never" class="filter-panel">
          <el-form inline label-width="76px">
            <el-form-item label="视频名称"><el-input placeholder="请输入视频名称" /></el-form-item>
            <el-form-item label="视频状态">
              <el-select placeholder="全部">
                <el-option label="可发布" value="可发布" />
                <el-option label="引用异常" value="引用异常" />
              </el-select>
            </el-form-item>
            <el-form-item><el-button type="primary">搜索</el-button><el-button>重置</el-button></el-form-item>
          </el-form>
        </el-card>

        <el-card shadow="never">
          <el-table :data="videos" border stripe>
            <el-table-column type="expand">
              <template #default="{ row }">
                <div class="row-expansion">
                  <div><h3>引用摘要</h3><p>{{ row.novelTitle }} / {{ row.chapters }} / 快照版本已冻结。</p></div>
                  <div><h3>发布数据</h3><p>{{ row.dataStatus }}，下一步建议：{{ row.action.reason }}</p></div>
                  <div><h3>钩子</h3><p>前 3 秒旁白：她签下离婚协议的那一刻，真正的反击才刚开始。</p></div>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="title" label="视频项目" min-width="210" />
            <el-table-column label="引用小说" min-width="220">
              <template #default="{ row }">
                <div>{{ row.novelTitle }}</div>
                <div class="muted-line">{{ row.chapters }}</div>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="视频状态" width="110" />
            <el-table-column label="产物状态" width="210">
              <template #default="{ row }">
                <el-tag size="small" effect="plain">{{ row.audioStatus }}</el-tag>
                <el-tag size="small" effect="plain">{{ row.subtitleStatus }}</el-tag>
                <el-tag size="small" effect="plain">{{ row.renderStatus }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="publishStatus" label="发布状态" width="110" />
            <el-table-column prop="dataStatus" label="数据状态" width="120" />
            <el-table-column label="引用异常" width="120">
              <template #default="{ row }">
                <el-tag :type="row.referenceStatus.includes('异常') ? 'danger' : 'success'" effect="plain">{{ row.referenceStatus }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="当前推荐动作" width="170" fixed="right">
              <template #default="{ row }">
                <el-button :type="row.action.intent === 'warning' ? 'warning' : 'primary'" size="small" @click="handleVideoAction(row)">{{ row.action.label }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="任务中心" name="tasks">
        <el-card shadow="never">
          <el-table :data="tasks" border stripe>
            <el-table-column prop="name" label="任务名称" min-width="180" />
            <el-table-column prop="object" label="绑定对象" min-width="220" />
            <el-table-column prop="status" label="状态" width="100" />
            <el-table-column label="进度" width="180">
              <template #default="{ row }"><el-progress :percentage="row.progress" /></template>
            </el-table-column>
            <el-table-column prop="step" label="当前步骤" min-width="180" />
            <el-table-column prop="failedReason" label="失败原因" min-width="180" />
            <el-table-column label="操作" width="160" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="openTask(row)">查看详情</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="createVideoDialog" title="新建视频项目" width="560px">
      <el-form label-width="96px">
        <el-form-item label="引用小说">
          <el-select model-value="玄门小师妹直播算命爆红"><el-option label="玄门小师妹直播算命爆红" value="玄门小师妹直播算命爆红" /></el-select>
        </el-form-item>
        <el-form-item label="引用范围"><el-input model-value="系统推荐第 1-2 章" /></el-form-item>
        <el-form-item label="生成模式"><el-radio-group model-value="解压背景循环"><el-radio-button label="解压背景循环" /></el-radio-group></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVideoDialog = false">取消</el-button>
        <el-button type="primary" @click="createVideoDialog = false">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="publishDialog" title="标记发布" width="560px">
      <el-form label-width="112px">
        <el-form-item label="发布平台"><el-input placeholder="抖音 / 快手 / 视频号" /></el-form-item>
        <el-form-item label="作品链接"><el-input placeholder="粘贴作品链接" /></el-form-item>
        <el-form-item label="发布时间"><el-date-picker type="datetime" /></el-form-item>
        <el-form-item label="标题钩子"><el-input model-value="她签下离婚协议后，真正的反击开始了" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="publishDialog = false">取消</el-button>
        <el-button type="primary" @click="publishDialog = false">保存发布记录</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="dataDialog" title="24/48 小时数据回填" width="560px">
      <el-form label-width="112px">
        <el-form-item label="播放量"><el-input-number :min="0" /></el-form-item>
        <el-form-item label="完播率"><el-input placeholder="例如 21%" /></el-form-item>
        <el-form-item label="新增关注"><el-input-number :min="0" /></el-form-item>
        <el-form-item label="下一步决策">
          <el-select model-value="继续同方向">
            <el-option label="继续同方向" value="继续同方向" />
            <el-option label="优化开篇" value="优化开篇" />
            <el-option label="换标题钩子" value="换标题钩子" />
            <el-option label="样本不足，继续观察" value="样本不足，继续观察" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dataDialog = false">取消</el-button>
        <el-button type="primary" @click="dataDialog = false">保存数据</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="taskDrawer" title="任务详情" size="440px">
      <div class="drawer-stack">
        <el-alert :title="selectedTask?.step || '任务详情'" type="info" show-icon :closable="false" />
        <el-progress :percentage="selectedTask?.progress || 0" />
        <p>任务失败时会说明是否阻塞主流程，并提供重试、取消或回到业务页面的入口。</p>
        <el-button type="primary" @click="taskDrawer = false">关闭</el-button>
      </div>
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { tasks, videos } from '../mock/prototypeData'
import type { TaskItem, VideoProject } from '../types/prototype'

const route = useRoute()
const router = useRouter()
const activeTab = ref('videos')
const createVideoDialog = ref(false)
const publishDialog = ref(false)
const dataDialog = ref(false)
const taskDrawer = ref(false)
const selectedTask = ref<TaskItem>()
const isTaskMode = computed(() => route.path.startsWith('/tasks'))

watchEffect(() => {
  activeTab.value = isTaskMode.value ? 'tasks' : 'videos'
})

function handleVideoAction(row: VideoProject) {
  if (row.action.label === '标记发布') {
    publishDialog.value = true
    return
  }
  if (row.dataStatus.includes('已填')) {
    dataDialog.value = true
    return
  }
  selectedTask.value = tasks[0]
  taskDrawer.value = true
}

function openTask(row: TaskItem) {
  selectedTask.value = row
  taskDrawer.value = true
}
</script>
