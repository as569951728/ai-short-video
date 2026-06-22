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
            <el-form-item label="创作来源">
              <el-radio-group v-model="form.source">
                <el-radio-button label="系统推荐" />
                <el-radio-button label="引用热点" />
                <el-radio-button label="手动想法" />
              </el-radio-group>
            </el-form-item>
            <el-form-item label="题材方向">
              <el-select v-model="form.genres" multiple placeholder="选择 1-3 个题材">
                <el-option label="都市逆袭" value="都市逆袭" />
                <el-option label="女频爽文" value="女频爽文" />
                <el-option label="玄学直播" value="玄学直播" />
                <el-option label="职场商战" value="职场商战" />
              </el-select>
            </el-form-item>
            <el-form-item label="爽点偏好">
              <el-select v-model="form.appealPoints" multiple placeholder="选择读者最想看的爽点">
                <el-option label="低谷翻盘" value="低谷翻盘" />
                <el-option label="身份反转" value="身份反转" />
                <el-option label="当场打脸" value="当场打脸" />
                <el-option label="强成长" value="强成长" />
              </el-select>
            </el-form-item>
            <el-form-item label="目标读者">
              <el-input v-model="form.targetAudience" placeholder="例如：18-35 岁爽文用户" />
            </el-form-item>
            <el-form-item label="一句话想法">
              <el-input v-model="form.customIdea" type="textarea" :rows="4" placeholder="可以简单写一个开局、反击点或想避开的雷区" />
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
        title="本步骤只创建草稿，不生成方向候选、不生成设定或正文。"
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
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ApiClientError } from '../shared/services/http'
import { createNovelDraft } from '../modules/novels/services/novelService'

const router = useRouter()
const submitting = ref(false)
const apiError = ref('')

const form = reactive({
  title: '重生后我靠系统逆袭',
  source: '系统推荐',
  genres: ['都市逆袭'],
  appealPoints: ['低谷翻盘'],
  targetAudience: '18-35 岁爽文用户',
  customIdea: '',
  videoAdaptationPreference: '适合口播短视频',
  chapterLimit: 80,
  chapterWordMin: 1800,
  chapterWordMax: 2600,
})

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

  submitting.value = true

  try {
    const draft = await createNovelDraft({
      title: form.title,
      channel: 'novel',
      genres: form.genres,
      preferences: {
        appealPoints: form.appealPoints,
        targetAudience: form.targetAudience,
        customIdea: form.customIdea || null,
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
</script>
