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
import { ElMessage, ElMessageBox } from 'element-plus'
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
  const instruction = await promptChapterActionReason({
    title: '生成章节重写候选',
    message: '请输入本次重写方向。结果只会生成新的候选版本，不会直接覆盖当前正式正文；后续仍需要人工采用，并可继续做影响评估。',
    details: [
      { label: '章节对象', value: titleText.value },
      { label: '当前正文版本', value: currentVersionId },
      { label: '影响范围', value: '生成候选版本；不覆盖正式正文，不进入视频生产链路。' },
    ],
    inputPlaceholder: '例如：强化结尾钩子，并检查是否影响后续旧码头线索。',
    inputValue: '强化结尾钩子，并检查是否影响后续旧码头线索。',
    confirmButtonText: '生成候选',
  })
  if (!instruction) return

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
  const reason = await promptChapterActionReason({
    title: '采用章节候选',
    message: '采用后会写入决策记录，并触发影响评估；请说明为什么采用这个候选，以及是否接受后续影响检查。',
    details: [
      { label: '章节对象', value: titleText.value },
      { label: '候选版本', value: `${candidate.versionLabel} / 评分 ${candidate.scoreText} / ${candidate.gateText}` },
      { label: '当前正文版本', value: currentVersionId || '暂无正式正文版本' },
      { label: '影响范围', value: '会成为当前章节正式正文；会保留历史候选并生成影响评估。' },
    ],
    inputPlaceholder: '请填写采用原因',
    inputValue: '采用该候选强化结尾钩子，接受影响评估后再继续。',
    confirmButtonText: '确认采用',
  })
  if (!reason) return

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
  const reason = await promptChapterActionReason({
    title: '发起章节影响评估',
    message: '影响评估会检查本章改动对后续章节、长篇记忆和已知伏笔的影响；结果会进入影响案例，不会直接改写正文。',
    details: [
      { label: '章节对象', value: titleText.value },
      { label: '当前正文版本', value: currentVersionId },
      { label: '影响范围', value: '只生成影响评估记录；不覆盖正文，不进入视频生产链路。' },
    ],
    inputPlaceholder: '请输入发起影响评估的原因',
    inputValue: '检查本章改动是否影响后续章节和长篇记忆。',
    confirmButtonText: '发起评估',
  })
  if (!reason) return

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
  const reason = await promptChapterActionReason({
    title: '关闭影响案例',
    message: '关闭后会记录人工处理决策。请确认该影响已处理或可接受，避免后续全书审稿误判。',
    details: [
      { label: '章节对象', value: titleText.value },
      { label: '影响案例', value: impactCaseId },
      { label: '影响范围', value: '写入影响案例处理记录；不改写正文，不进入视频生产链路。' },
    ],
    inputPlaceholder: '请填写关闭或忽略该影响案例的原因',
    inputValue: '已人工确认影响处理完成。',
    confirmButtonText: '确认关闭',
  })
  if (!reason) return

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

async function promptChapterActionReason(options: {
  title: string
  message: string
  details: Array<{ label: string; value: string }>
  inputPlaceholder: string
  inputValue?: string
  confirmButtonText: string
}) {
  try {
    const result = await ElMessageBox.prompt(
      formatChapterActionMessage(options.message, options.details),
      options.title,
      {
        confirmButtonText: options.confirmButtonText,
        cancelButtonText: '取消',
        inputPlaceholder: options.inputPlaceholder,
        inputValue: options.inputValue ?? '',
        inputType: 'textarea',
        inputPattern: /\S+/,
        inputErrorMessage: '请填写原因或处理说明',
        type: 'warning',
        closeOnClickModal: false,
        closeOnPressEscape: true,
        distinguishCancelAndClose: false,
      },
    )
    return result.value.trim()
  } catch {
    return null
  }
}

function formatChapterActionMessage(message: string, details: Array<{ label: string; value: string }>) {
  return [
    message,
    '',
    ...details.map((detail) => `${detail.label}：${detail.value}`),
  ].join('\n')
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
