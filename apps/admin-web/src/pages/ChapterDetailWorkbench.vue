<template>
  <section class="page-stack chapter-workbench">
    <div class="workbench-hero">
      <div>
        <el-button text @click="router.push(`/novels/${novelId}`)">返回小说详情</el-button>
        <h1>{{ titleText }}</h1>
        <p>{{ workbench?.recommendedAction.reasonText || '读取章节状态、正文、特性卡和审稿问题。' }}</p>
      </div>
      <div class="hero-actions">
        <el-tag :type="statusTagType">{{ workbench?.chapter.statusNote || '加载中' }}</el-tag>
        <el-button :disabled="!currentContent" :loading="actionLoading" @click="handleRewriteChapter">生成重写候选</el-button>
        <el-button :disabled="!currentContent" :loading="actionLoading" @click="handleCreateImpactAssessment">影响评估</el-button>
        <el-button :loading="loading" @click="loadWorkbench">刷新</el-button>
      </div>
    </div>

    <el-alert v-if="apiError" :title="apiError" type="error" show-icon :closable="true" @close="apiError = ''" />

    <el-card shadow="never">
      <div class="section-title">
        <div>
          <h2>任务进度</h2>
          <p class="muted">章节生成、审稿和试写相关任务会在这里显示最近状态。</p>
        </div>
      </div>
      <TaskProgressPanel :summary="workbench?.recentTask || null" :loading="loading" @refresh="loadWorkbench" />
    </el-card>

    <div class="chapter-right-columns">
      <main class="chapter-content">
        <el-card shadow="never" class="novel-text-card">
          <div class="section-title">
            <div>
              <h2>当前正文</h2>
              <p class="muted">{{ currentContent?.versionLabel || '暂无正文版本' }} / 评分 {{ currentContent?.scoreText || '-' }}</p>
            </div>
            <el-button v-if="currentContent" @click="openContent(currentContent)">看全文</el-button>
          </div>
          <el-empty v-if="!currentContent" description="当前章节还没有正式正文" />
          <template v-else>
            <p v-for="paragraph in currentContentParagraphs" :key="paragraph" class="novel-text">{{ paragraph }}</p>
          </template>
        </el-card>

        <el-card shadow="never">
          <div class="section-title">
            <div>
              <h2>候选版本</h2>
              <p class="muted">历史候选会保留，采用或确认动作不会静默覆盖。</p>
            </div>
          </div>
          <el-empty v-if="candidateRows.length === 0" description="暂无候选版本" />
          <div v-else class="trial-result-grid">
            <article v-for="candidate in candidateRows" :key="candidate.id" class="trial-result-card">
              <div class="direction-card-head">
                <h3>{{ candidate.versionLabel }}</h3>
                <el-tag>{{ candidate.statusText }}</el-tag>
              </div>
              <p>评分 {{ candidate.scoreText }} / {{ candidate.gateText }}</p>
              <p class="muted">{{ candidate.first300Summary }}</p>
              <el-alert
                v-if="candidateCompareById[candidate.id]"
                :title="candidateCompareById[candidate.id].benefit"
                :description="candidateCompareById[candidate.id].possibleImpact"
                type="info"
                show-icon
                :closable="false"
              />
              <div class="split-actions">
                <el-button size="small" @click="openContent(candidate)">看全文</el-button>
                <el-button v-if="candidate.canSelect" size="small" type="primary" :loading="actionLoading" @click="handleAdoptCandidate(candidate)">采用候选</el-button>
              </div>
            </article>
          </div>
        </el-card>
      </main>

      <aside class="decision-panel">
        <el-card shadow="never">
          <div class="section-title">
            <h2>章节特性卡</h2>
            <el-tag type="info" effect="plain">{{ workbench?.featureCard ? '已生成' : '暂无' }}</el-tag>
          </div>
          <el-empty v-if="!workbench?.featureCard" description="暂无章节特性卡" />
          <el-descriptions v-else border :column="1">
            <el-descriptions-item label="一句话">{{ workbench.featureCard.oneLineSummary }}</el-descriptions-item>
            <el-descriptions-item label="核心任务">{{ workbench.featureCard.coreTask }}</el-descriptions-item>
            <el-descriptions-item label="主要冲突">{{ workbench.featureCard.mainConflict }}</el-descriptions-item>
            <el-descriptions-item label="爽点">{{ workbench.featureCard.appealPoint }}</el-descriptions-item>
            <el-descriptions-item label="结尾钩子">{{ workbench.featureCard.endingHook }}</el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-card shadow="never">
          <div class="section-title">
            <h2>审稿问题</h2>
            <el-tag :type="workbench?.reviewIssues.length ? 'warning' : 'success'" effect="plain">{{ workbench?.reviewIssues.length || 0 }} 个</el-tag>
          </div>
          <el-empty v-if="!workbench?.reviewIssues.length" description="暂无审稿问题" />
          <div v-else class="issue-list vertical">
            <el-alert
              v-for="issue in workbench.reviewIssues"
              :key="`${issue.dimension}-${issue.message}`"
              :title="issue.message"
              :description="issue.suggestion"
              :type="issue.severity === 'blocking' ? 'error' : issue.severity === 'warning' ? 'warning' : 'info'"
              show-icon
              :closable="false"
            />
          </div>
        </el-card>

        <el-card shadow="never">
          <div class="section-title">
            <h2>长篇记忆</h2>
            <el-tag :type="workbench?.longTermMemory ? 'success' : 'info'" effect="plain">{{ workbench?.longTermMemory ? '已同步' : '暂无' }}</el-tag>
          </div>
          <el-empty v-if="!workbench?.longTermMemory" description="暂无长篇记忆摘要" />
          <el-descriptions v-else border :column="1">
            <el-descriptions-item label="摘要">{{ workbench.longTermMemory.summary }}</el-descriptions-item>
            <el-descriptions-item label="不可矛盾事实">{{ workbench.longTermMemory.factsCannotContradict.join('、') || '-' }}</el-descriptions-item>
            <el-descriptions-item label="未解决冲突">{{ workbench.longTermMemory.unresolvedConflicts.join('、') || '-' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-card shadow="never">
          <div class="section-title">
            <h2>影响评估</h2>
            <el-tag :type="openImpactCases.length ? 'warning' : 'success'" effect="plain">{{ openImpactCases.length ? '待处理' : '无阻塞' }}</el-tag>
          </div>
          <el-empty v-if="!workbench?.impactCases.length" description="暂无影响案例" />
          <div v-else class="issue-list vertical">
            <el-alert
              v-for="impact in workbench.impactCases"
              :key="impact.id"
              :title="`${impact.impactLevelText} / ${impact.statusText}`"
              :description="impact.summary"
              :type="impact.blocksFullReview ? 'warning' : 'success'"
              show-icon
              :closable="false"
            >
              <template #default>
                <div class="split-actions">
                  <el-button v-if="impact.blocksFullReview" size="small" :loading="actionLoading" @click="handleResolveImpact(impact.id)">关闭影响</el-button>
                </div>
              </template>
            </el-alert>
          </div>
        </el-card>
      </aside>
    </div>

    <el-drawer v-model="contentDrawer.open" :title="contentDrawer.title" size="620px">
      <div class="drawer-stack">
        <p v-for="paragraph in drawerParagraphs" :key="paragraph" class="novel-text">{{ paragraph }}</p>
      </div>
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { ChapterWorkbenchDTO } from '@ai-shortvideo/shared'
import { ApiClientError } from '../shared/services/http'
import TaskProgressPanel from '../modules/novels/components/TaskProgressPanel.vue'
import {
  adoptChapterContentVersion,
  createImpactAssessment,
  getChapterWorkbench,
  resolveImpactCase,
  rewriteChapter,
  toTrialCandidateRow,
} from '../modules/novels/services/novelService'
import type { TrialCandidateRow } from '../modules/novels/model/novelTypes'

const route = useRoute()
const router = useRouter()
const novelId = computed(() => String(route.params.novelId || ''))
const chapterId = computed(() => String(route.params.chapterId || ''))
const workbench = ref<ChapterWorkbenchDTO | null>(null)
const loading = ref(false)
const actionLoading = ref(false)
const apiError = ref('')
const contentDrawer = reactive({
  open: false,
  title: '',
  content: '',
})

const titleText = computed(() => {
  if (!workbench.value) return '章节详情'
  return `第 ${workbench.value.chapter.chapterNo} 章：${workbench.value.chapter.title}`
})
const currentContent = computed(() => workbench.value?.currentContent ? toTrialCandidateRow(workbench.value.currentContent) : null)
const candidateRows = computed(() => (workbench.value?.candidateVersions ?? []).map(toTrialCandidateRow))
const candidateCompareById = computed(() => workbench.value?.candidateCompares ?? {})
const openImpactCases = computed(() => (workbench.value?.impactCases ?? []).filter((impact) => impact.blocksFullReview))
const currentContentParagraphs = computed(() => (currentContent.value?.content ?? '').split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean).slice(0, 4))
const drawerParagraphs = computed(() => contentDrawer.content.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean))
const statusTagType = computed(() => {
  const status = workbench.value?.chapter.mainStatus
  if (status === 'blocked') return 'danger'
  if (status === 'trial_written' || status === 'completed') return 'success'
  return 'info'
})

async function loadWorkbench() {
  loading.value = true
  apiError.value = ''

  try {
    workbench.value = await getChapterWorkbench(novelId.value, chapterId.value)
  } catch (error) {
    apiError.value = formatApiError(error)
  } finally {
    loading.value = false
  }
}

async function handleRewriteChapter() {
  const currentVersionId = workbench.value?.chapter.currentContentVersionId
  if (!currentVersionId) {
    apiError.value = '当前章节没有正式正文，不能生成重写候选'
    return
  }
  const instruction = window.prompt('请输入重写方向。结果会先生成候选版本，不会直接覆盖正式正文。', '强化结尾钩子，并检查是否影响后续旧码头线索。')
  if (!instruction?.trim()) return

  actionLoading.value = true
  apiError.value = ''
  try {
    await rewriteChapter(novelId.value, chapterId.value, {
      instruction,
      reason: '从章节详情生成重写候选',
      currentContentVersionId: currentVersionId,
    })
    ElMessage.success('已生成重写候选')
    await loadWorkbench()
  } catch (error) {
    apiError.value = formatApiError(error)
  } finally {
    actionLoading.value = false
  }
}

async function handleAdoptCandidate(candidate: TrialCandidateRow) {
  const currentVersionId = workbench.value?.chapter.currentContentVersionId
  const reason = window.prompt('采用候选会写入决策记录并触发影响评估；如可能影响后续，请说明原因。', '采用该候选强化结尾钩子，接受影响评估后再继续。')
  if (!reason?.trim()) {
    apiError.value = '采用章节候选必须填写原因'
    return
  }

  actionLoading.value = true
  apiError.value = ''
  try {
    await adoptChapterContentVersion(novelId.value, chapterId.value, candidate.id, {
      reason,
      currentContentVersionId: currentVersionId,
      pageVersionSnapshot: {
        seenCandidateVersionId: candidate.id,
        seenAt: new Date().toISOString(),
      },
    })
    ElMessage.success('候选已采用，影响评估已记录')
    await loadWorkbench()
  } catch (error) {
    apiError.value = formatApiError(error)
  } finally {
    actionLoading.value = false
  }
}

async function handleCreateImpactAssessment() {
  const currentVersionId = workbench.value?.chapter.currentContentVersionId
  if (!currentVersionId) {
    apiError.value = '当前章节没有正式正文，不能发起影响评估'
    return
  }
  const reason = window.prompt('请输入发起影响评估的原因。', '检查本章改动是否影响后续章节和长篇记忆。')
  if (!reason?.trim()) return

  actionLoading.value = true
  apiError.value = ''
  try {
    await createImpactAssessment(novelId.value, chapterId.value, { reason, currentContentVersionId: currentVersionId })
    ElMessage.success('影响评估已生成')
    await loadWorkbench()
  } catch (error) {
    apiError.value = formatApiError(error)
  } finally {
    actionLoading.value = false
  }
}

async function handleResolveImpact(impactCaseId: string) {
  const reason = window.prompt('请填写关闭或忽略该影响案例的原因。', '已人工确认影响处理完成。')
  if (!reason?.trim()) {
    apiError.value = '关闭影响案例必须填写原因'
    return
  }

  actionLoading.value = true
  apiError.value = ''
  try {
    await resolveImpactCase(novelId.value, impactCaseId, {
      resolution: 'resolved',
      reason,
      handlingChoice: 'mark_resolved',
    })
    ElMessage.success('影响案例已关闭')
    await loadWorkbench()
  } catch (error) {
    apiError.value = formatApiError(error)
  } finally {
    actionLoading.value = false
  }
}

function openContent(candidate: TrialCandidateRow) {
  contentDrawer.open = true
  contentDrawer.title = `${candidate.title} ${candidate.versionLabel}`
  contentDrawer.content = candidate.content
}

function formatApiError(error: unknown) {
  if (error instanceof ApiClientError) {
    const requestText = error.requestId ? `（请求 ID：${error.requestId}）` : ''
    return `${error.message}${requestText}`
  }

  return error instanceof Error ? error.message : '请求失败，请稍后重试'
}

onMounted(() => {
  loadWorkbench()
})
</script>
