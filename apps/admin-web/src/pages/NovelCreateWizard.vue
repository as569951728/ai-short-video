<template>
  <section class="page-stack">
    <div class="page-heading">
      <div>
        <h1>创建小说草稿</h1>
        <p>先保存创作方向和基础偏好，回到列表后从详情继续推进。</p>
      </div>
      <el-button @click="router.push('/novels')">返回列表</el-button>
    </div>

    <el-alert
      v-if="apiError"
      :title="apiError"
      type="error"
      show-icon
      :closable="true"
      @close="apiError = ''"
    />

    <el-card shadow="never" class="wizard-panel">
      <div class="wizard-grid">
        <div>
          <h2>草稿信息</h2>
          <p class="muted">标题和题材先不用完美，草稿创建后不会生成正文，也不会自动采用任何 AI 结果。</p>
          <el-form label-width="104px" class="form-stack">
            <el-form-item label="小说标题" required>
              <el-input v-model="form.title" placeholder="例如：重生后我靠系统逆袭" maxlength="80" show-word-limit />
            </el-form-item>
            <div class="composite-form-row">
              <span id="novel-create-source-label" class="composite-form-label">创作来源</span>
              <div class="composite-form-content">
                <el-radio-group
                  v-model="form.source"
                  class="source-radio-group"
                  aria-labelledby="novel-create-source-label"
                >
                  <el-radio-button
                    v-for="option in creationSourceOptions"
                    :key="option.value"
                    :value="option.value"
                    :disabled="option.disabled"
                  >
                    {{ option.label }}
                  </el-radio-button>
                </el-radio-group>
                <p class="field-hint source-hint">{{ sourceHintText }}</p>
                <p class="field-hint source-unavailable-hint">{{ hotspotUnavailableReason }}</p>
              </div>
            </div>
            <el-form-item label="题材方向">
              <div class="tag-picker">
                <el-select v-model="form.genres" multiple placeholder="从常用题材中选择">
                  <el-option v-for="genre in genreOptions" :key="genre" :label="genre" :value="genre" />
                </el-select>
                <el-input
                  v-model="genreInput"
                  placeholder="手写新题材，例如：末世经营"
                  maxlength="40"
                  clearable
                  @keyup.enter="addGenre"
                >
                  <template #append>
                    <el-button @click="addGenre">添加</el-button>
                  </template>
                </el-input>
              </div>
              <p class="field-hint">可以手选常用题材，也可以手写新增；创建后会随草稿偏好保存。</p>
            </el-form-item>
            <el-form-item label="爽点偏好">
              <div class="tag-picker">
                <el-select v-model="form.appealPoints" multiple placeholder="从常用爽点中选择">
                  <el-option v-for="appeal in appealOptions" :key="appeal" :label="appeal" :value="appeal" />
                </el-select>
                <el-input
                  v-model="appealInput"
                  placeholder="手写新爽点，例如：幕后反杀"
                  maxlength="40"
                  clearable
                  @keyup.enter="addAppealPoint"
                >
                  <template #append>
                    <el-button @click="addAppealPoint">添加</el-button>
                  </template>
                </el-input>
              </div>
              <p class="field-hint">可以手选常用爽点，也可以手写新增；不是输入过滤，添加后会成为已选标签。</p>
            </el-form-item>
            <el-form-item label="目标读者">
              <el-input v-model="form.targetAudience" placeholder="例如：18-35 岁爽文用户" />
            </el-form-item>
            <el-form-item :label="ideaFieldLabel" :required="form.source === 'manual_idea'">
              <el-input v-model="form.customIdea" type="textarea" :rows="4" :placeholder="ideaPlaceholder" />
              <p class="field-hint">{{ ideaFieldHint }}</p>
            </el-form-item>
            <el-form-item label="视频化倾向">
              <el-select v-model="form.videoAdaptationPreference">
                <el-option label="适合口播短视频" value="适合口播短视频" />
                <el-option label="先保证小说质量" value="先保证小说质量" />
              </el-select>
            </el-form-item>
          </el-form>
        </div>

        <aside class="side-note">
          <h3>创建后状态</h3>
          <p>新项目会进入“草稿已创建”，列表会提示下一步需要进入详情准备生成小说方向。</p>
          <el-collapse>
            <el-collapse-item title="高级设置">
              <el-form label-width="96px">
                <el-form-item label="章节数">
                  <el-input-number v-model="form.chapterLimit" :min="1" :max="1000" :precision="0" step-strictly controls-position="right" />
                </el-form-item>
                <el-form-item label="每章下限">
                  <el-input-number v-model="form.chapterWordMin" :min="100" :max="20000" :step="100" :precision="0" step-strictly controls-position="right" />
                </el-form-item>
                <el-form-item label="每章上限">
                  <el-input-number v-model="form.chapterWordMax" :min="100" :max="30000" :step="100" :precision="0" step-strictly controls-position="right" />
                </el-form-item>
              </el-form>
            </el-collapse-item>
          </el-collapse>
        </aside>
      </div>

      <el-alert
        class="mt-16"
        title="本步骤只创建草稿，创作来源只作为后续方向生成参考，不生成方向候选、不生成设定或正文。"
        type="info"
        show-icon
        :closable="false"
      />

      <div class="footer-actions">
        <el-button @click="router.push('/novels')">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitDraft">创建草稿</el-button>
      </div>
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { NovelCreationSourceRequestType } from '@ai-shortvideo/shared'
import { ApiClientError } from '../shared/services/http'
import {
  DEFAULT_NOVEL_APPEAL_OPTIONS,
  DEFAULT_NOVEL_GENRE_OPTIONS,
  HOTSPOT_SOURCE_UNAVAILABLE_REASON,
  NOVEL_CREATION_SOURCE_OPTIONS,
} from '../modules/novels/constants/createOptions'
import { createNovelDraft } from '../modules/novels/services/novelService'

const router = useRouter()
const submitting = ref(false)
const apiError = ref('')
const genreInput = ref('')
const appealInput = ref('')
const genreOptions = DEFAULT_NOVEL_GENRE_OPTIONS
const appealOptions = DEFAULT_NOVEL_APPEAL_OPTIONS
const creationSourceOptions = NOVEL_CREATION_SOURCE_OPTIONS
const hotspotUnavailableReason = HOTSPOT_SOURCE_UNAVAILABLE_REASON

const form = reactive({
  title: '重生后我靠系统逆袭',
  source: 'system_recommendation' as NovelCreationSourceRequestType,
  genres: ['都市逆袭'],
  appealPoints: ['低谷翻盘'],
  targetAudience: '18-35 岁爽文用户',
  customIdea: '',
  videoAdaptationPreference: '适合口播短视频',
  chapterLimit: 80,
  chapterWordMin: 1800,
  chapterWordMax: 2600,
})

const sourceHintText = computed(() => {
  if (form.source === 'manual_idea') {
    return NOVEL_CREATION_SOURCE_OPTIONS.find((option) => option.value === 'manual_idea')?.reason ?? ''
  }

  if (form.source === 'hotspot_reference') {
    return hotspotUnavailableReason
  }

  return NOVEL_CREATION_SOURCE_OPTIONS.find((option) => option.value === 'system_recommendation')?.reason ?? ''
})

const ideaFieldLabel = computed(() => (form.source === 'manual_idea' ? '核心想法' : '补充想法'))
const ideaPlaceholder = computed(() => (
  form.source === 'manual_idea'
    ? '请写清楚主角开局、核心冲突或想要的反转，不少于 6 个字符'
    : '可选：简单写一个开局、反击点或想避开的雷区'
))
const ideaFieldHint = computed(() => (
  form.source === 'manual_idea'
    ? '手动想法会作为创建来源保存；为空或少于 6 个字符时不能创建。'
    : '补充想法只作为参考，不代表已生成方向、设定或正文。'
))

async function submitDraft() {
  apiError.value = ''

  if (!form.title.trim()) {
    apiError.value = '请先填写小说标题'
    return
  }

  if (form.chapterWordMin > form.chapterWordMax) {
    apiError.value = '每章字数下限不能大于上限'
    return
  }

  const customIdea = form.customIdea.trim()
  if (form.source === 'hotspot_reference') {
    apiError.value = hotspotUnavailableReason
    return
  }

  if (form.source === 'manual_idea' && customIdea.length < 6) {
    apiError.value = '手动想法需要填写不少于 6 个字符的核心想法'
    return
  }

  submitting.value = true

  try {
    const genres = normalizeTagValues(form.genres)
    const appealPoints = normalizeTagValues(form.appealPoints)
    const draft = await createNovelDraft({
      title: form.title,
      channel: 'novel',
      creationSourceType: form.source,
      genres,
      preferences: {
        appealPoints,
        targetAudience: form.targetAudience,
        customIdea: customIdea || null,
        videoAdaptationPreference: form.videoAdaptationPreference,
      },
      chapterLimit: form.chapterLimit,
      chapterWordRange: {
        min: form.chapterWordMin,
        max: form.chapterWordMax,
      },
    })

    ElMessage.success('草稿已创建，已回到小说列表')
    router.push({ path: '/novels', query: { created: draft.id } })
  } catch (error) {
    apiError.value = formatApiError(error)
  } finally {
    submitting.value = false
  }
}

function formatApiError(error: unknown) {
  if (error instanceof ApiClientError) {
    const requestText = error.requestId ? `（请求 ID：${error.requestId}）` : ''
    return `${error.message}${requestText}`
  }

  return error instanceof Error ? error.message : '创建草稿失败，请稍后重试'
}

function addGenre() {
  addTagValue(form.genres, genreInput)
}

function addAppealPoint() {
  addTagValue(form.appealPoints, appealInput)
}

function addTagValue(target: string[], input: { value: string }) {
  const value = input.value.trim()
  if (!value) {
    return
  }

  if (!target.includes(value)) {
    target.push(value)
  }

  input.value = ''
}

function normalizeTagValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 12)
}
</script>

<style scoped>
.composite-form-row {
  display: flex;
  align-items: center;
  min-height: 32px;
}

.composite-form-label {
  box-sizing: border-box;
  flex: 0 0 104px;
  padding: 0 12px 0 0;
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 32px;
  text-align: right;
}

.composite-form-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
}

.tag-picker {
  display: grid;
  width: 100%;
  gap: 8px;
}

.field-hint {
  width: 100%;
  margin: 6px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.source-hint {
  max-width: 560px;
}

.source-unavailable-hint {
  max-width: 560px;
  color: var(--el-color-warning);
}
</style>
