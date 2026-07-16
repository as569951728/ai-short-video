<template>
  <section class="page-stack video-detail-workbench">
    <div class="page-heading step-workbench-hero">
      <div>
        <h1>{{ workbenchView?.title || '视频详情工作台' }}</h1>
        <p>
          P9e 开放 mock/local 视觉方案、渲染预览、预览确认和导出记录；导出不等于发布，不触发平台链路。
        </p>
      </div>
      <div class="heading-actions">
        <el-button @click="router.push('/videos')">返回视频列表</el-button>
        <el-button type="primary" :loading="actionLoading || narrationLoading || ttsLoading || subtitleLoading || visualLoading || renderLoading || exportLoading" :disabled="!workbenchView" @click="runRecommendedAction">
          {{ workbenchView?.recommendedAction.label || '重新检查引用' }}
        </el-button>
      </div>
    </div>

    <el-alert v-if="pageLoading" title="正在加载视频详情工作台..." type="info" show-icon :closable="false" />
    <el-alert v-if="loadError" :title="loadError" type="error" show-icon :closable="false" />
    <el-alert
      v-if="workbenchView?.reference.status === 'blocking'"
      title="引用存在 blocking 异常，后续视频生产步骤全部锁定。请先处理引用异常。"
      type="error"
      show-icon
      :closable="false"
    />

    <template v-if="workbenchView">
      <div class="task-summary-grid">
        <div class="task-summary-item">
          <span>引用小说</span>
          <strong>{{ workbenchView.novelTitle }}</strong>
        </div>
        <div class="task-summary-item">
          <span>引用状态</span>
          <strong>{{ workbenchView.reference.statusText }}</strong>
        </div>
        <div class="task-summary-item">
          <span>视频状态</span>
          <strong>{{ workbenchView.projectStatusText }}</strong>
        </div>
        <div class="task-summary-item">
          <span>推荐动作</span>
          <strong>{{ workbenchView.recommendedAction.label }}</strong>
        </div>
      </div>

      <div class="major-stepper-panel video-detail-stepper">
        <button
          v-for="step in workbenchView.steps"
          :key="step.key"
          class="major-step"
          :class="getStepClass(step)"
          type="button"
          @click="activeStepKey = step.key"
        >
          <span class="major-step-index">{{ stepIndex(step.key) }}</span>
          <strong>{{ step.label }}</strong>
          <small>{{ step.statusText }}</small>
        </button>
      </div>

      <div class="video-workbench-layout">
        <aside class="video-workbench-side">
          <el-card shadow="never">
            <template #header><strong>引用快照</strong></template>
            <div class="info-list">
              <div><span>快照版本</span><strong>{{ workbenchView.reference.versionText }}</strong></div>
              <div><span>章节范围</span><strong>{{ workbenchView.reference.chapterRangeText }}</strong></div>
              <div><span>引用章节</span><strong>{{ workbenchView.reference.chapters.length }} 章</strong></div>
            </div>
            <p class="muted mt-12">{{ workbenchView.reference.summary }}</p>
          </el-card>

          <el-card shadow="never">
            <template #header><strong>默认视频单元</strong></template>
            <div class="info-list">
              <div><span>单元</span><strong>{{ workbenchView.defaultUnit.title }}</strong></div>
              <div><span>范围</span><strong>{{ workbenchView.defaultUnit.chapterRangeText }}</strong></div>
              <div><span>状态</span><strong>{{ workbenchView.defaultUnit.statusText }}</strong></div>
            </div>
          </el-card>

          <el-card shadow="never">
            <template #header><strong>产物版本占位</strong></template>
            <div class="artifact-placeholder-list">
              <div v-for="artifact in workbenchView.artifacts.placeholders" :key="artifact.type" class="artifact-placeholder">
                <span>{{ artifact.label }}</span>
                <el-tag type="info" effect="plain">{{ artifact.unlockPackage }}</el-tag>
              </div>
              <div class="artifact-placeholder"><span>渲染文件</span><el-tag type="info" effect="plain">P9e</el-tag></div>
              <div class="artifact-placeholder"><span>导出记录</span><el-tag type="info" effect="plain">P9e</el-tag></div>
            </div>
          </el-card>
        </aside>

        <main class="video-workbench-main">
          <el-card shadow="never">
            <template #header>
              <div class="section-title">
                <div>
                  <h2>{{ activeStep?.label }}</h2>
                  <p>{{ activeStep?.description }}</p>
                </div>
                <el-tag :type="activeStep?.status === 'active' ? 'success' : activeStep?.status === 'blocked' ? 'danger' : 'info'" effect="plain">
                  {{ activeStep?.statusText }}
                </el-tag>
              </div>
            </template>

            <section v-if="activeStep?.key === 'reference_check'" class="workbench-section">
              <el-alert
                :title="workbenchView.recommendedAction.reason"
                :type="workbenchView.reference.status === 'blocking' ? 'error' : 'success'"
                show-icon
                :closable="false"
              />
              <el-table :data="workbenchView.reference.chapters" border stripe>
                <el-table-column prop="title" label="引用章节" min-width="200" />
                <el-table-column prop="referenceVersion" label="引用版本" min-width="160" />
                <el-table-column prop="status" label="状态" width="100" />
                <el-table-column prop="summary" label="摘要" min-width="260" />
              </el-table>

              <div v-if="workbenchView.reference.status === 'blocking'" class="issue-card">
                <h3>异常处理建议</h3>
                <p>{{ workbenchView.riskSummary }}</p>
                <el-button type="danger" @click="router.push('/videos?focus=issue')">回视频列表处理异常</el-button>
              </div>
            </section>

            <section v-else-if="activeStep?.key === 'narration'" class="workbench-section">
              <el-alert
                v-if="workbenchView.reference.status === 'blocking'"
                title="引用存在 blocking 异常，不能生成、编辑或确认旁白。请先回引用检查处理异常。"
                type="error"
                show-icon
                :closable="false"
              />
              <template v-else>
                <div class="section-title">
                  <div>
                    <h3>旁白候选与当前版本</h3>
                    <p>候选不会自动成为当前旁白，确认后才会作为 P9c 配音输入。</p>
                  </div>
                  <div class="heading-actions">
                    <el-button :loading="narrationLoading" @click="loadWorkbench">刷新</el-button>
                    <el-button v-if="sourceMode === 'mock'" :loading="narrationLoading" @click="generateNarrationFailureSample">生成失败样本</el-button>
                    <el-button v-if="sourceMode === 'mock'" :loading="narrationLoading" @click="generateNarrationCancelledSample">生成取消样本</el-button>
                    <el-button type="primary" :loading="narrationLoading" @click="generateNarration">
                      {{ workbenchView.artifacts.narration.history.length > 0 ? '重新生成 1-3 个候选' : '生成旁白候选' }}
                    </el-button>
                  </div>
                </div>

                <el-alert
                  :title="workbenchView.artifacts.narration.current ? '旁白已确认；下一步可以生成配音候选。' : '请先生成候选或保存编辑稿，再选择一个版本确认。'"
                  type="info"
                  show-icon
                  :closable="false"
                />

                <div v-if="workbenchView.artifacts.narration.current" class="narration-card current">
                  <div class="section-title">
                    <div>
                      <h3>当前旁白 v{{ workbenchView.artifacts.narration.current.versionNo }}</h3>
                      <p>{{ workbenchView.artifacts.narration.current.qualitySummary }}</p>
                    </div>
                    <el-tag type="success">已确认</el-tag>
                  </div>
                  <p class="narration-hook">{{ workbenchView.artifacts.narration.current.hook }}</p>
                  <p class="muted">{{ workbenchView.artifacts.narration.current.providerSummary.provider }} · {{ workbenchView.artifacts.narration.current.providerSummary.isMockOutput ? '模拟输出' : '真实/人工输出' }}</p>
                </div>

                <div class="narration-grid">
                  <article
                    v-for="artifact in narrationVisibleArtifacts"
                    :key="artifact.id"
                    class="narration-card"
                    :class="{ risky: isNarrationRisky(artifact) }"
                  >
                    <div class="section-title">
                      <div>
                        <h3>v{{ artifact.versionNo }} · {{ getNarrationStatusText(artifact.status) }}</h3>
                        <p>{{ artifact.recommendationReason }}</p>
                      </div>
                      <el-tag :type="artifact.score < 70 ? 'danger' : 'success'">{{ artifact.score }} 分</el-tag>
                    </div>
                    <p class="narration-hook">{{ artifact.hook }}</p>
                    <div class="info-list compact">
                      <div><span>首屏字幕</span><strong>{{ artifact.firstScreenSubtitle }}</strong></div>
                      <div><span>预计时长</span><strong>{{ artifact.estimatedDurationSeconds }} 秒</strong></div>
                      <div><span>字数</span><strong>{{ artifact.wordCount }}</strong></div>
                    </div>
                    <div class="risk-tag-row">
                      <el-tag v-for="tag in artifact.riskTags" :key="tag" size="small" effect="plain">{{ tag }}</el-tag>
                    </div>
                    <p class="muted">{{ artifact.qualitySummary }}</p>
                    <div class="heading-actions">
                      <el-button @click="openNarrationDrawer(artifact)">查看全文/编辑</el-button>
                      <el-button :disabled="artifact.status === 'rejected'" @click="rejectNarrationArtifact(artifact)">不采用</el-button>
                      <el-button type="primary" :disabled="artifact.status === 'rejected'" @click="confirmNarrationArtifact(artifact)">确认此版</el-button>
                    </div>
                  </article>
                </div>

                <el-empty
                  v-if="narrationVisibleArtifacts.length === 0 && !workbenchView.artifacts.narration.current"
                  description="暂无旁白候选。点击“生成旁白候选”开始。"
                />
              </template>
            </section>

            <section v-else-if="activeStep?.key === 'tts'" class="workbench-section">
              <el-alert
                v-if="workbenchView.reference.status === 'blocking'"
                title="引用存在 blocking 异常，不能生成或确认配音。请先回引用检查处理异常。"
                type="error"
                show-icon
                :closable="false"
              />
              <el-alert
                v-else-if="!workbenchView.artifacts.narration.current"
                title="需先确认旁白稿后才能生成配音。"
                type="warning"
                show-icon
                :closable="false"
              />
              <template v-else>
                <div class="section-title">
                  <div>
                    <h3>配音候选与试听</h3>
                    <p>mock/local TTS 只生成试听占位和安全摘要；确认音频后，字幕仍在 P9d 解锁。</p>
                  </div>
                  <div class="heading-actions">
                    <el-button :loading="ttsLoading" @click="loadWorkbench">刷新</el-button>
                    <el-button v-if="sourceMode === 'mock'" :loading="ttsLoading" @click="generateTtsFailureSample">生成失败样本</el-button>
                    <el-button v-if="sourceMode === 'mock'" :loading="ttsLoading" @click="generateTtsCancelledSample">生成取消样本</el-button>
                    <el-button type="primary" :loading="ttsLoading" @click="generateTts">
                      {{ workbenchView.artifacts.tts.history.length > 0 ? '重新生成配音候选' : '生成配音候选' }}
                    </el-button>
                  </div>
                </div>

                <el-form label-position="top" class="tts-control-grid">
                  <el-form-item label="音色">
                    <el-select v-model="ttsForm.voiceId">
                      <el-option label="男声-剧情感" value="mock-male-cinematic" />
                      <el-option label="女声-明亮感" value="mock-female-bright" />
                      <el-option label="中性-冷静感" value="mock-neutral-calm" />
                    </el-select>
                  </el-form-item>
                  <el-form-item>
                    <span :id="sliderLabelIds.ttsSpeed" class="form-field-label">语速</span>
                    <el-slider v-model="ttsForm.speed" aria-label="语速" :min="0.5" :max="2" :step="0.05" />
                  </el-form-item>
                  <el-form-item label="情绪">
                    <el-select v-model="ttsForm.emotion">
                      <el-option label="冷静" value="calm" />
                      <el-option label="悬念" value="suspense" />
                      <el-option label="兴奋" value="excited" />
                      <el-option label="温暖" value="warm" />
                    </el-select>
                  </el-form-item>
                  <el-form-item>
                    <span :id="sliderLabelIds.ttsVolume" class="form-field-label">音量</span>
                    <el-slider v-model="ttsForm.volume" aria-label="音量" :min="0" :max="100" :step="1" />
                  </el-form-item>
                </el-form>

                <el-alert
                  :title="workbenchView.artifacts.tts.current ? '配音已确认；下一步可以生成字幕候选。' : '请生成配音候选，试听后选择一个版本确认。'"
                  type="info"
                  show-icon
                  :closable="false"
                />

                <div v-if="workbenchView.artifacts.tts.current" class="narration-card current">
                  <div class="section-title">
                    <div>
                      <h3>当前配音 v{{ workbenchView.artifacts.tts.current.versionNo }}</h3>
                      <p>{{ workbenchView.artifacts.tts.current.qualitySummary }}</p>
                    </div>
                    <el-tag type="success">已确认</el-tag>
                  </div>
                  <div class="info-list compact">
                    <div><span>音色</span><strong>{{ workbenchView.artifacts.tts.current.voiceName }}</strong></div>
                    <div><span>时长</span><strong>{{ workbenchView.artifacts.tts.current.durationSeconds }} 秒</strong></div>
                    <div><span>来源</span><strong>{{ workbenchView.artifacts.tts.current.providerSummary.provider }}</strong></div>
                  </div>
                </div>

                <div class="narration-grid">
                  <article v-for="artifact in ttsVisibleArtifacts" :key="artifact.id" class="narration-card">
                    <div class="section-title">
                      <div>
                        <h3>v{{ artifact.versionNo }} · {{ getTtsStatusText(artifact.status) }}</h3>
                        <p>{{ artifact.recommendationReason }}</p>
                      </div>
                      <el-tag type="info">{{ artifact.durationSeconds }} 秒</el-tag>
                    </div>
                    <div class="audio-placeholder">
                      <strong>试听占位</strong>
                      <span>{{ artifact.previewUrl }}</span>
                    </div>
                    <div class="info-list compact">
                      <div><span>音色</span><strong>{{ artifact.voiceName }}</strong></div>
                      <div><span>语速</span><strong>{{ artifact.speed }}</strong></div>
                      <div><span>情绪</span><strong>{{ artifact.emotion }}</strong></div>
                      <div><span>音量</span><strong>{{ artifact.volume }}</strong></div>
                    </div>
                    <div class="risk-tag-row">
                      <el-tag v-for="tag in artifact.riskTags" :key="tag" size="small" effect="plain">{{ tag }}</el-tag>
                    </div>
                    <p class="muted">{{ artifact.providerSummary.provider }} · {{ artifact.providerSummary.isMockOutput ? '模拟输出' : '真实/人工输出' }}</p>
                    <div class="heading-actions">
                      <el-button @click="previewTtsArtifact(artifact)">试听占位</el-button>
                      <el-button :disabled="artifact.status === 'rejected'" @click="rejectTtsArtifact(artifact)">不采用</el-button>
                      <el-button type="primary" :disabled="artifact.status === 'rejected'" @click="confirmTtsArtifact(artifact)">确认此版</el-button>
                    </div>
                  </article>
                </div>

                <el-empty
                  v-if="ttsVisibleArtifacts.length === 0 && !workbenchView.artifacts.tts.current"
                  description="暂无配音候选。点击“生成配音候选”开始。"
                />
              </template>
            </section>

            <section v-else-if="activeStep?.key === 'subtitle'" class="workbench-section">
              <el-alert
                v-if="workbenchView.reference.status === 'blocking'"
                title="引用存在 blocking 异常，不能生成或确认字幕。请先回引用检查处理异常。"
                type="error"
                show-icon
                :closable="false"
              />
              <el-alert
                v-else-if="!workbenchView.artifacts.tts.current"
                title="需先确认配音后才能生成字幕。"
                type="warning"
                show-icon
                :closable="false"
              />
              <template v-else>
                <div class="section-title">
                  <div>
                    <h3>字幕候选与分行调试</h3>
                    <p>字幕候选不会自动成为当前字幕，确认后才会作为 P9e 视觉方案输入。</p>
                  </div>
                  <div class="heading-actions">
                    <el-button :loading="subtitleLoading" @click="loadWorkbench">刷新</el-button>
                    <el-button v-if="sourceMode === 'mock'" :loading="subtitleLoading" @click="generateSubtitleFailureSample">生成失败样本</el-button>
                    <el-button v-if="sourceMode === 'mock'" :loading="subtitleLoading" @click="generateSubtitleCancelledSample">生成取消样本</el-button>
                    <el-button type="primary" :loading="subtitleLoading" @click="generateSubtitle">
                      {{ workbenchView.artifacts.subtitle.history.length > 0 ? '重新生成字幕候选' : '生成字幕候选' }}
                    </el-button>
                  </div>
                </div>

                <el-form label-position="top" class="tts-control-grid">
                  <el-form-item label="字幕风格">
                    <el-select v-model="subtitleForm.subtitleStyle">
                      <el-option label="紧凑" value="compact" />
                      <el-option label="均衡" value="balanced" />
                      <el-option label="强钩子" value="dramatic" />
                    </el-select>
                  </el-form-item>
                  <el-form-item>
                    <span :id="sliderLabelIds.subtitleLineLength" class="form-field-label">每行目标字数</span>
                    <el-slider v-model="subtitleForm.lineLength" aria-label="每行目标字数" :min="10" :max="28" :step="1" show-input />
                  </el-form-item>
                  <el-form-item label="生成质量">
                    <el-select v-model="subtitleForm.qualityMode">
                      <el-option label="快速" value="fast" />
                      <el-option label="标准" value="standard" />
                      <el-option label="高质量" value="high_quality" />
                    </el-select>
                  </el-form-item>
                </el-form>

                <el-alert
                  :title="workbenchView.artifacts.subtitle.current ? '字幕已确认；下一步可以配置视觉方案。' : '请生成字幕候选，或编辑保存字幕草稿后确认一个版本。'"
                  type="info"
                  show-icon
                  :closable="false"
                />

                <div v-if="workbenchView.artifacts.subtitle.current" class="narration-card current">
                  <div class="section-title">
                    <div>
                      <h3>当前字幕 v{{ workbenchView.artifacts.subtitle.current.versionNo }}</h3>
                      <p>{{ workbenchView.artifacts.subtitle.current.qualitySummary }}</p>
                    </div>
                    <el-tag type="success">已确认</el-tag>
                  </div>
                  <div class="info-list compact">
                    <div><span>风格</span><strong>{{ workbenchView.artifacts.subtitle.current.subtitleStyle }}</strong></div>
                    <div><span>行数</span><strong>{{ workbenchView.artifacts.subtitle.current.lineCount }}</strong></div>
                    <div><span>预计时长</span><strong>{{ workbenchView.artifacts.subtitle.current.estimatedDurationSeconds }} 秒</strong></div>
                  </div>
                  <pre class="subtitle-preview">{{ workbenchView.artifacts.subtitle.current.contentText }}</pre>
                </div>

                <div class="narration-grid">
                  <article v-for="artifact in subtitleVisibleArtifacts" :key="artifact.id" class="narration-card">
                    <div class="section-title">
                      <div>
                        <h3>v{{ artifact.versionNo }} · {{ getSubtitleStatusText(artifact.status) }}</h3>
                        <p>{{ artifact.recommendationReason }}</p>
                      </div>
                      <el-tag :type="artifact.score < 80 ? 'warning' : 'success'">{{ artifact.score }} 分</el-tag>
                    </div>
                    <div class="info-list compact">
                      <div><span>首屏字幕</span><strong>{{ artifact.firstScreenSubtitle }}</strong></div>
                      <div><span>风格</span><strong>{{ artifact.subtitleStyle }}</strong></div>
                      <div><span>目标行长</span><strong>{{ artifact.lineLength }} 字</strong></div>
                      <div><span>行数</span><strong>{{ artifact.lineCount }}</strong></div>
                    </div>
                    <pre class="subtitle-preview">{{ artifact.contentText }}</pre>
                    <div class="risk-tag-row">
                      <el-tag v-for="tag in artifact.riskTags" :key="tag" size="small" effect="plain">{{ tag }}</el-tag>
                    </div>
                    <p class="muted">{{ artifact.providerSummary.provider }} · {{ artifact.providerSummary.isMockOutput ? '模拟输出' : '真实/人工输出' }}</p>
                    <div class="heading-actions">
                      <el-button @click="openSubtitleDrawer(artifact)">查看/编辑</el-button>
                      <el-button :disabled="artifact.status === 'rejected'" @click="rejectSubtitleArtifact(artifact)">不采用</el-button>
                      <el-button type="primary" :disabled="artifact.status === 'rejected'" @click="confirmSubtitleArtifact(artifact)">确认此版</el-button>
                    </div>
                  </article>
                </div>

                <el-empty
                  v-if="subtitleVisibleArtifacts.length === 0 && !workbenchView.artifacts.subtitle.current"
                  description="暂无字幕候选。点击“生成字幕候选”开始。"
                />
              </template>
            </section>

            <section v-else-if="activeStep?.key === 'visual_plan'" class="workbench-section">
              <el-alert
                v-if="workbenchView.reference.status === 'blocking'"
                title="引用存在 blocking 异常，不能配置视觉方案。请先回引用检查处理异常。"
                type="error"
                show-icon
                :closable="false"
              />
              <el-alert
                v-else-if="!workbenchView.artifacts.subtitle.current"
                title="需先确认字幕后才能配置视觉方案。"
                type="warning"
                show-icon
                :closable="false"
              />
              <template v-else>
                <div class="section-title">
                  <div>
                    <h3>视觉方案候选</h3>
                    <p>首期只支持可控循环背景、画面比例、分辨率、字幕样式和安全区，不接外部素材搜索。</p>
                  </div>
                  <div class="heading-actions">
                    <el-button :loading="visualLoading" @click="loadWorkbench">刷新</el-button>
                    <el-button type="primary" :loading="visualLoading" @click="saveVisualPlan">
                      {{ workbenchView.artifacts.visualPlan.history.length > 0 ? '保存新视觉方案' : '保存视觉方案候选' }}
                    </el-button>
                  </div>
                </div>

                <el-form label-position="top" class="tts-control-grid">
                  <el-form-item label="循环背景">
                    <el-select v-model="visualForm.backgroundAssetId" aria-label="循环背景">
                      <el-option v-for="asset in visualBackgroundAssets" :key="asset.id" :label="asset.name" :value="asset.id" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="画面比例">
                    <el-select v-model="visualForm.aspectRatio" aria-label="画面比例">
                      <el-option label="竖屏 9:16" value="9:16" />
                      <el-option label="横屏 16:9" value="16:9" />
                      <el-option label="方形 1:1" value="1:1" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="分辨率">
                    <el-select v-model="visualForm.resolution" aria-label="分辨率">
                      <el-option label="1080x1920" value="1080x1920" />
                      <el-option label="720x1280" value="720x1280" />
                      <el-option label="1920x1080" value="1920x1080" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="字幕位置">
                    <el-select v-model="visualForm.subtitlePosition" aria-label="字幕位置">
                      <el-option label="底部安全区" value="bottom_safe" />
                      <el-option label="中部" value="middle" />
                      <el-option label="顶部安全区" value="top_safe" />
                    </el-select>
                  </el-form-item>
                  <el-form-item>
                    <span :id="sliderLabelIds.visualFontSize" class="form-field-label">字号</span>
                    <el-slider v-model="visualForm.fontSize" aria-label="视觉方案字幕字号" :min="28" :max="64" :step="2" show-input />
                  </el-form-item>
                  <el-form-item label="安全区">
                    <el-select v-model="visualForm.safeAreaPreset" aria-label="安全区">
                      <el-option label="抖音安全区" value="douyin_safe" />
                      <el-option label="快手安全区" value="kuaishou_safe" />
                      <el-option label="通用安全区" value="wide_safe" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="字幕颜色" :for="visualFieldIds.textColor">
                    <el-input :id="visualFieldIds.textColor" v-model="visualForm.textColor" />
                  </el-form-item>
                  <el-form-item label="描边颜色" :for="visualFieldIds.strokeColor">
                    <el-input :id="visualFieldIds.strokeColor" v-model="visualForm.strokeColor" />
                  </el-form-item>
                  <el-form-item label="阴影">
                    <el-switch v-model="visualForm.shadowEnabled" aria-label="视觉方案阴影" />
                  </el-form-item>
                </el-form>

                <div v-if="workbenchView.artifacts.visualPlan.current" class="narration-card current">
                  <div class="section-title">
                    <div>
                      <h3>当前视觉方案 v{{ workbenchView.artifacts.visualPlan.current.versionNo }}</h3>
                      <p>{{ workbenchView.artifacts.visualPlan.current.qualitySummary }}</p>
                    </div>
                    <el-tag type="success">已确认</el-tag>
                  </div>
                  <div class="visual-plan-preview">
                    <strong>{{ workbenchView.artifacts.visualPlan.current.backgroundName }}</strong>
                    <span>{{ workbenchView.artifacts.visualPlan.current.aspectRatio }} · {{ workbenchView.artifacts.visualPlan.current.resolution }}</span>
                  </div>
                </div>

                <div class="narration-grid">
                  <article v-for="artifact in visualVisibleArtifacts" :key="artifact.id" class="narration-card">
                    <div class="section-title">
                      <div>
                        <h3>v{{ artifact.versionNo }} · {{ getVisualPlanStatusText(artifact.status) }}</h3>
                        <p>{{ artifact.recommendationReason }}</p>
                      </div>
                      <el-tag type="info">{{ artifact.aspectRatio }}</el-tag>
                    </div>
                    <div class="info-list compact">
                      <div><span>背景</span><strong>{{ artifact.backgroundName }}</strong></div>
                      <div><span>分辨率</span><strong>{{ artifact.resolution }}</strong></div>
                      <div><span>字幕位置</span><strong>{{ artifact.subtitlePosition }}</strong></div>
                      <div><span>字号</span><strong>{{ artifact.fontSize }}</strong></div>
                    </div>
                    <div class="risk-tag-row">
                      <el-tag v-for="tag in artifact.riskTags" :key="tag" size="small" effect="plain">{{ tag }}</el-tag>
                    </div>
                    <p class="muted">{{ artifact.providerSummary.provider }} · {{ artifact.providerSummary.isMockOutput ? '模拟输出' : '真实/人工输出' }}</p>
                    <div class="heading-actions">
                      <el-button :disabled="artifact.status === 'rejected'" @click="rejectVisualPlanArtifact(artifact)">不采用</el-button>
                      <el-button type="primary" :disabled="artifact.status === 'rejected'" @click="confirmVisualPlanArtifact(artifact)">确认方案</el-button>
                    </div>
                  </article>
                </div>
              </template>
            </section>

            <section v-else-if="activeStep?.key === 'render'" class="workbench-section">
              <el-alert
                v-if="!workbenchView.artifacts.visualPlan.current"
                title="需先确认视觉方案后才能渲染视频预览。"
                type="warning"
                show-icon
                :closable="false"
              />
              <template v-else>
                <div class="section-title">
                  <div>
                    <h3>mock/local 渲染预览</h3>
                    <p>渲染只生成系统内预览占位和安全摘要，不调用真实外部渲染工具或云存储。</p>
                  </div>
                  <div class="heading-actions">
                    <el-button :loading="renderLoading" @click="loadWorkbench">刷新</el-button>
                    <el-button v-if="sourceMode === 'mock'" :loading="renderLoading" @click="generateRenderFailureSample">生成失败样本</el-button>
                    <el-button v-if="sourceMode === 'mock'" :loading="renderLoading" @click="generateRenderCancelledSample">生成取消样本</el-button>
                    <el-button type="primary" :loading="renderLoading" @click="generateRender">渲染视频预览</el-button>
                  </div>
                </div>
                <el-alert title="渲染候选不会自动成为可导出版本；需要先预览确认当前视频。" type="info" show-icon :closable="false" />
                <div class="narration-grid">
                  <article v-for="render in renderVisibleRecords" :key="render.id" class="narration-card">
                    <div class="section-title">
                      <div>
                        <h3>v{{ render.versionNo }} · {{ getRenderStatusText(render.status) }}</h3>
                        <p>{{ render.safeSummary }}</p>
                      </div>
                      <el-tag :type="render.previewStatus === 'confirmed_exportable' ? 'success' : 'info'">{{ render.previewStatus }}</el-tag>
                    </div>
                    <div class="video-preview-placeholder">
                      <strong>预览占位</strong>
                      <span>{{ render.previewUrl }}</span>
                    </div>
                    <div class="info-list compact">
                      <div><span>时长</span><strong>{{ render.durationSeconds }} 秒</strong></div>
                      <div><span>模式</span><strong>{{ render.renderMode }}</strong></div>
                      <div><span>来源</span><strong>{{ render.providerSummary.provider }}</strong></div>
                    </div>
                    <div class="risk-tag-row">
                      <el-tag v-for="issue in render.qualityIssues" :key="issue" size="small" effect="plain">{{ issue }}</el-tag>
                    </div>
                    <div class="heading-actions">
                      <el-button :disabled="render.status === 'rejected'" @click="rejectRenderRecord(render)">不满意/驳回</el-button>
                      <el-button type="primary" :disabled="render.status === 'rejected'" @click="confirmRenderRecord(render)">预览确认当前视频</el-button>
                    </div>
                  </article>
                </div>
              </template>
            </section>

            <section v-else-if="activeStep?.key === 'preview'" class="workbench-section">
              <el-alert
                v-if="!workbenchView.artifacts.renders.current && workbenchView.artifacts.renders.candidates.length === 0"
                title="还没有可预览的渲染版本，请先生成 mock/local 渲染预览。"
                type="warning"
                show-icon
                :closable="false"
              />
              <template v-else>
                <div class="section-title">
                  <div>
                    <h3>预览确认</h3>
                    <p>确认后该渲染版本才会成为可导出当前视频；不满意会保留历史并锁住导出。</p>
                  </div>
                  <el-button :loading="renderLoading" @click="loadWorkbench">刷新</el-button>
                </div>
                <div v-if="workbenchView.artifacts.renders.current" class="narration-card current">
                  <div class="video-preview-placeholder large">
                    <strong>当前视频预览 v{{ workbenchView.artifacts.renders.current.versionNo }}</strong>
                    <span>{{ workbenchView.artifacts.renders.current.previewUrl }}</span>
                  </div>
                  <p class="muted">{{ workbenchView.artifacts.renders.current.safeSummary }}</p>
                </div>
                <div class="narration-grid">
                  <article v-for="render in workbenchView.artifacts.renders.candidates" :key="render.id" class="narration-card">
                    <div class="video-preview-placeholder">
                      <strong>待确认预览 v{{ render.versionNo }}</strong>
                      <span>{{ render.previewUrl }}</span>
                    </div>
                    <p class="muted">{{ render.qualityIssues.join('；') }}</p>
                    <div class="heading-actions">
                      <el-button @click="rejectRenderRecord(render)">不满意/驳回</el-button>
                      <el-button type="primary" @click="confirmRenderRecord(render)">确认当前视频</el-button>
                    </div>
                  </article>
                </div>
              </template>
            </section>

            <section v-else-if="activeStep?.key === 'export'" class="workbench-section">
              <el-alert title="导出记录只代表系统内文件占位，不等于发布，不上传平台，不回填数据。" type="info" show-icon :closable="false" />
              <el-alert
                v-if="!workbenchView.artifacts.renders.current"
                title="需先预览确认当前视频后才能创建导出记录。"
                type="warning"
                show-icon
                :closable="false"
              />
              <template v-else>
                <div class="section-title">
                  <div>
                    <h3>导出记录</h3>
                    <p>导出会创建新的文件占位记录，保留历史，不创建发布记录。</p>
                  </div>
                  <div class="heading-actions">
                    <el-form-item label="导出文件名" :for="exportFileNameInputId" class="inline-form-item">
                      <el-input :id="exportFileNameInputId" v-model="exportForm.fileName" placeholder="可选文件名，例如 first-test.mp4" style="width: 240px" />
                    </el-form-item>
                    <el-button type="primary" :loading="exportLoading" @click="createExportRecord">创建导出记录</el-button>
                  </div>
                </div>
                <div class="narration-grid">
                  <article v-for="item in workbenchView.artifacts.exports.history" :key="item.id" class="narration-card">
                    <div class="section-title">
                      <div>
                        <h3>{{ item.fileName }}</h3>
                        <p>{{ item.safeSummary }}</p>
                      </div>
                      <el-tag type="success">{{ item.status }}</el-tag>
                    </div>
                    <div class="info-list compact">
                      <div><span>渲染版本</span><strong>v{{ item.renderVersionNo }}</strong></div>
                      <div><span>下载占位</span><strong>{{ item.downloadUrl }}</strong></div>
                      <div><span>创建时间</span><strong>{{ item.createdAt }}</strong></div>
                    </div>
                  </article>
                </div>
              </template>
            </section>

            <section v-else class="locked-production-step">
                <el-alert :title="activeStep?.lockedReason || '该步骤将在后续 P9 分段解锁。'" type="warning" show-icon :closable="false" />
                <div class="locked-empty">
                  <h3>当前缺少前置能力</h3>
                <p>请先完成当前步骤的前置确认；本页不会触发发布、上传或平台数据回填。</p>
                <el-button disabled>{{ activeStep?.action.label }}</el-button>
                <div class="muted-line">{{ activeStep?.action.disabledReason }}</div>
              </div>
            </section>
          </el-card>
        </main>

        <aside class="video-workbench-side">
          <el-card shadow="never">
            <template #header><strong>任务进度</strong></template>
            <el-empty v-if="workbenchView.recentTasks.length === 0" description="暂无进行中的视频生产任务" />
            <div v-for="task in workbenchView.recentTasks" v-else :key="task.id" class="task-mini-card">
              <strong>{{ task.taskType }}</strong>
              <span>{{ task.status }} · {{ task.statusNote }}</span>
              <span v-if="task.currentStep">步骤：{{ task.currentStep }} · 进度 {{ task.progress ?? 0 }}%</span>
              <span v-if="task.failureCategory">失败分类：{{ task.failureCategory }}</span>
              <div v-if="task.status === 'failed' || task.status === 'cancelled'" class="heading-actions">
                <el-button v-if="task.canRetry" size="small" type="primary" :loading="narrationLoading || ttsLoading || subtitleLoading || renderLoading" @click="retryVideoTask(task)">重试生成</el-button>
                <el-button v-if="task.canCancel" size="small" :loading="narrationLoading || ttsLoading || subtitleLoading || renderLoading" @click="cancelVideoTask(task)">取消处理</el-button>
              </div>
            </div>
          </el-card>

          <el-card shadow="never">
            <template #header><strong>依赖版本</strong></template>
            <div class="info-list compact">
              <div><span>引用</span><strong>{{ workbenchView.dependencyRefs.videoReferenceId }}</strong></div>
              <div><span>引用版本</span><strong>v{{ workbenchView.dependencyRefs.videoReferenceVersion }}</strong></div>
              <div><span>默认单元</span><strong>{{ workbenchView.dependencyRefs.videoUnitId }}</strong></div>
            </div>
          </el-card>

          <el-card shadow="never">
            <template #header><strong>风险和操作记录</strong></template>
            <el-alert :title="workbenchView.riskSummary" :type="workbenchView.risks.length > 0 ? 'error' : 'info'" show-icon :closable="false" />
            <el-empty v-if="workbenchView.operationRecords.length === 0" description="暂无视频操作记录" />
          </el-card>
        </aside>
      </div>
    </template>

    <el-drawer v-model="narrationDrawer.visible" title="旁白全文与编辑" size="52%">
      <template v-if="narrationDrawer.artifact">
        <div class="info-list compact">
          <div><span>版本</span><strong>v{{ narrationDrawer.artifact.versionNo }}</strong></div>
          <div><span>状态</span><strong>{{ getNarrationStatusText(narrationDrawer.artifact.status) }}</strong></div>
          <div><span>来源</span><strong>{{ narrationDrawer.artifact.providerSummary.provider }}</strong></div>
        </div>
        <el-form label-position="top" class="mt-12">
          <el-form-item label="前三秒钩子">
            <el-input v-model="narrationEdit.hook" />
          </el-form-item>
          <el-form-item label="首屏字幕建议">
            <el-input v-model="narrationEdit.firstScreenSubtitle" />
          </el-form-item>
          <el-form-item label="结尾悬念">
            <el-input v-model="narrationEdit.endingHook" />
          </el-form-item>
          <el-form-item label="完整旁白稿">
            <el-input v-model="narrationEdit.contentText" type="textarea" :rows="12" />
          </el-form-item>
          <el-form-item label="保存原因">
            <el-input v-model="narrationEdit.reason" placeholder="例如：压缩节奏、弱化风险表达、调整口语化程度" />
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="narrationDrawer.visible = false">关闭</el-button>
        <el-button type="primary" :loading="narrationLoading" :disabled="!narrationDrawer.artifact" @click="saveNarrationDraft">保存为新草稿</el-button>
      </template>
    </el-drawer>

    <el-drawer v-model="subtitleDrawer.visible" title="字幕分行与编辑" size="52%">
      <template v-if="subtitleDrawer.artifact">
        <div class="info-list compact">
          <div><span>版本</span><strong>v{{ subtitleDrawer.artifact.versionNo }}</strong></div>
          <div><span>状态</span><strong>{{ getSubtitleStatusText(subtitleDrawer.artifact.status) }}</strong></div>
          <div><span>来源</span><strong>{{ subtitleDrawer.artifact.providerSummary.provider }}</strong></div>
        </div>
        <el-form label-position="top" class="mt-12">
          <el-form-item label="首屏字幕">
            <el-input v-model="subtitleEdit.firstScreenSubtitle" />
          </el-form-item>
          <el-form-item label="字幕文本">
            <el-input v-model="subtitleEdit.contentText" type="textarea" :rows="14" />
          </el-form-item>
          <el-form-item label="保存原因">
            <el-input v-model="subtitleEdit.reason" placeholder="例如：调整分行、弱化首屏刺激、压缩节奏" />
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="subtitleDrawer.visible = false">关闭</el-button>
        <el-button type="primary" :loading="subtitleLoading" :disabled="!subtitleDrawer.artifact" @click="saveSubtitleDraft">保存为新字幕草稿</el-button>
      </template>
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  VIDEO_VISUAL_BACKGROUND_ASSETS,
  type VideoNarrationArtifactDTO,
  type VideoRenderDTO,
  type VideoSubtitleArtifactDTO,
  type VideoTtsArtifactDTO,
  type VideoVisualPlanArtifactDTO,
  type VideoWorkbenchDTO,
  type VideoWorkbenchStepDTO,
} from '@ai-shortvideo/shared'
import {
  getVideoWorkbenchCurrentStep,
  mapVideoWorkbenchDtoToView,
  type VideoWorkbenchView,
  type VideoWorkbenchViewStep,
} from '../modules/videos/model/videoP8View'
import {
  confirmVideoRender,
  confirmVideoNarration,
  confirmVideoSubtitle,
  confirmVideoTts,
  confirmVideoVisualPlan,
  createVideoExport,
  editVideoNarrationDraft,
  editVideoSubtitleDraft,
  generateVideoRender,
  generateVideoNarrations,
  generateVideoSubtitles,
  generateVideoTts,
  getVideoWorkbench,
  recheckVideoReference,
  rejectVideoRender,
  rejectVideoNarration,
  rejectVideoSubtitle,
  rejectVideoTts,
  rejectVideoVisualPlan,
  saveVideoVisualPlan,
} from '../modules/videos/services/videoService'
import { getApiMode } from '../shared/services/apiMode'

const route = useRoute()
const router = useRouter()
const sourceMode = getApiMode()
const workbenchView = ref<VideoWorkbenchView | null>(null)
const pageLoading = ref(false)
const actionLoading = ref(false)
const loadError = ref('')
const activeStepKey = ref<VideoWorkbenchStepDTO['key']>('reference_check')
const narrationLoading = ref(false)
const ttsLoading = ref(false)
const subtitleLoading = ref(false)
const visualLoading = ref(false)
const renderLoading = ref(false)
const exportLoading = ref(false)
const visualBackgroundAssets = VIDEO_VISUAL_BACKGROUND_ASSETS
const visualFieldIds = {
  backgroundAssetId: 'video-visual-background-asset',
  aspectRatio: 'video-visual-aspect-ratio',
  resolution: 'video-visual-resolution',
  subtitlePosition: 'video-visual-subtitle-position',
  safeAreaPreset: 'video-visual-safe-area',
  textColor: 'video-visual-text-color',
  strokeColor: 'video-visual-stroke-color',
  shadowEnabled: 'video-visual-shadow-enabled',
} as const
const sliderLabelIds = {
  ttsSpeed: 'video-tts-speed-label',
  ttsVolume: 'video-tts-volume-label',
  subtitleLineLength: 'video-subtitle-line-length-label',
  visualFontSize: 'video-visual-font-size-label',
} as const
const exportFileNameInputId = 'video-export-file-name'
const narrationDrawer = ref<{ visible: boolean; artifact: VideoNarrationArtifactDTO | null }>({ visible: false, artifact: null })
const subtitleDrawer = ref<{ visible: boolean; artifact: VideoSubtitleArtifactDTO | null }>({ visible: false, artifact: null })
const narrationEdit = ref({
  contentText: '',
  hook: '',
  firstScreenSubtitle: '',
  endingHook: '',
  reason: '',
})
const subtitleEdit = ref({
  contentText: '',
  firstScreenSubtitle: '',
  reason: '',
})
const ttsForm = ref({
  voiceId: 'mock-male-cinematic',
  speed: 1,
  emotion: 'suspense' as const,
  volume: 90,
})
const subtitleForm = ref({
  subtitleStyle: 'balanced' as const,
  lineLength: 18,
  qualityMode: 'standard' as const,
})
const visualForm = ref({
  backgroundAssetId: 'mock-bg-salt-field',
  aspectRatio: '9:16' as const,
  resolution: '1080x1920' as const,
  subtitlePosition: 'bottom_safe' as const,
  fontSize: 42,
  textColor: '#ffffff',
  strokeColor: '#111827',
  shadowEnabled: true,
  safeAreaPreset: 'douyin_safe' as const,
})
const exportForm = ref({
  fileName: '',
})

const activeStep = computed<VideoWorkbenchViewStep | null>(() => {
  if (!workbenchView.value) return null
  return workbenchView.value.steps.find((step) => step.key === activeStepKey.value) ?? getVideoWorkbenchCurrentStep(workbenchView.value)
})

const narrationVisibleArtifacts = computed(() => {
  if (!workbenchView.value) return []
  const narration = workbenchView.value.artifacts.narration
  return [...narration.candidates, ...narration.drafts, ...narration.history.filter((item) => item.status === 'rejected')].slice(0, 12)
})

const ttsVisibleArtifacts = computed(() => {
  if (!workbenchView.value) return []
  const tts = workbenchView.value.artifacts.tts
  return [...tts.candidates, ...tts.history.filter((item) => item.status === 'rejected')].slice(0, 12)
})

const subtitleVisibleArtifacts = computed(() => {
  if (!workbenchView.value) return []
  const subtitles = workbenchView.value.artifacts.subtitle
  return [...subtitles.candidates, ...subtitles.drafts, ...subtitles.history.filter((item) => item.status === 'rejected')].slice(0, 12)
})

const visualVisibleArtifacts = computed(() => {
  if (!workbenchView.value) return []
  const visualPlans = workbenchView.value.artifacts.visualPlan
  return [...visualPlans.candidates, ...visualPlans.history.filter((item) => item.status === 'rejected')].slice(0, 12)
})

const renderVisibleRecords = computed(() => {
  if (!workbenchView.value) return []
  const renders = workbenchView.value.artifacts.renders
  return [...renders.candidates, ...renders.history.filter((item) => item.status === 'rejected')].slice(0, 12)
})

onMounted(() => {
  void loadWorkbench()
})

async function loadWorkbench() {
  pageLoading.value = true
  loadError.value = ''
  try {
    const data = await getVideoWorkbench(String(route.params.videoId), sourceMode)
    workbenchView.value = mapVideoWorkbenchDtoToView(data)
    activeStepKey.value = data.recommendedAction.stepKey
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '视频详情工作台加载失败'
  } finally {
    pageLoading.value = false
  }
}

async function runRecommendedAction() {
  if (!workbenchView.value) return
  const label = workbenchView.value.recommendedAction.label
  if (label.includes('视觉')) {
    await saveVisualPlan()
    return
  }
  if (label.includes('渲染')) {
    await generateRender()
    return
  }
  if (label.includes('预览')) {
    activeStepKey.value = 'preview'
    return
  }
  if (label.includes('导出')) {
    if (workbenchView.value.artifacts.renders.current) {
      await createExportRecord()
    } else {
      activeStepKey.value = 'export'
    }
    return
  }
  if (label.includes('旁白') || activeStepKey.value === 'narration') {
    await generateNarration()
    return
  }
  if (label.includes('配音') || activeStepKey.value === 'tts') {
    await generateTts()
    return
  }
  if (label.includes('字幕') || activeStepKey.value === 'subtitle') {
    await generateSubtitle()
    return
  }
  if (activeStepKey.value === 'visual_plan') {
    await saveVisualPlan()
    return
  }
  if (activeStepKey.value === 'render') {
    await generateRender()
    return
  }
  if (activeStepKey.value === 'preview') {
    activeStepKey.value = 'preview'
    return
  }
  if (activeStepKey.value === 'export') {
    if (workbenchView.value.artifacts.renders.current) {
      await createExportRecord()
    } else {
      activeStepKey.value = 'export'
    }
    return
  }
  await recheckReference()
}

async function recheckReference() {
  if (!workbenchView.value) return
  actionLoading.value = true
  try {
    const reference = await recheckVideoReference(
      workbenchView.value.videoId,
      {
        expectedReferenceVersion: workbenchView.value.dependencyRefs.videoReferenceVersion,
        idempotencyToken: createClientToken('video-reference-recheck'),
      },
      sourceMode,
    )
    const refreshed = await getVideoWorkbench(workbenchView.value.videoId, sourceMode)
    refreshed.reference = reference
    workbenchView.value = mapVideoWorkbenchDtoToView(refreshed)
    ElMessage.success('引用状态已重新检查')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '引用重新检查失败')
  } finally {
    actionLoading.value = false
  }
}

async function generateNarration(options: { mockTaskOutcome?: 'success' | 'failed' | 'cancelled'; retryOfTaskId?: string } = {}) {
  if (!workbenchView.value) return
  narrationLoading.value = true
  try {
    const result = await generateVideoNarrations(
      workbenchView.value.videoId,
      {
        idempotencyToken: createClientToken('video-narration-generate'),
        expectedReferenceVersion: workbenchView.value.dependencyRefs.videoReferenceVersion,
        videoUnitId: workbenchView.value.dependencyRefs.videoUnitId,
        candidateCount: 3,
        qualityMode: 'standard',
        retryOfTaskId: options.retryOfTaskId,
        mockTaskOutcome: options.mockTaskOutcome,
      },
      sourceMode,
    )
    await loadWorkbench()
    activeStepKey.value = 'narration'
    if (result.task.status === 'failed') {
      ElMessage.warning('旁白生成失败，旧版本不受影响，可重试或手动编辑')
    } else if (result.task.status === 'cancelled') {
      ElMessage.info('旁白生成已取消，未写入候选版本')
    } else {
      ElMessage.success('旁白候选已生成')
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '旁白生成失败')
  } finally {
    narrationLoading.value = false
  }
}

async function generateNarrationFailureSample() {
  await generateNarration({ mockTaskOutcome: 'failed' })
}

async function generateNarrationCancelledSample() {
  await generateNarration({ mockTaskOutcome: 'cancelled' })
}

async function generateTts(options: { mockTaskOutcome?: 'success' | 'failed' | 'cancelled'; retryOfTaskId?: string } = {}) {
  if (!workbenchView.value || !workbenchView.value.artifacts.narration.current) return
  ttsLoading.value = true
  try {
    const currentNarration = workbenchView.value.artifacts.narration.current
    const result = await generateVideoTts(
      workbenchView.value.videoId,
      {
        idempotencyToken: createClientToken('video-tts-generate'),
        expectedReferenceVersion: workbenchView.value.dependencyRefs.videoReferenceVersion,
        videoUnitId: workbenchView.value.dependencyRefs.videoUnitId,
        narrationArtifactId: currentNarration.id,
        expectedNarrationVersionNo: currentNarration.versionNo,
        voiceId: ttsForm.value.voiceId,
        voiceName: getVoiceName(ttsForm.value.voiceId),
        speed: ttsForm.value.speed,
        emotion: ttsForm.value.emotion,
        volume: ttsForm.value.volume,
        qualityMode: 'standard',
        retryOfTaskId: options.retryOfTaskId,
        mockTaskOutcome: options.mockTaskOutcome,
      },
      sourceMode,
    )
    await loadWorkbench()
    activeStepKey.value = 'tts'
    if (result.task.status === 'failed') {
      ElMessage.warning('配音生成失败，当前音频不受影响，可重试或调整音色')
    } else if (result.task.status === 'cancelled') {
      ElMessage.info('配音生成已取消，未写入候选版本')
    } else {
      ElMessage.success('配音候选已生成')
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '配音生成失败')
  } finally {
    ttsLoading.value = false
  }
}

async function generateTtsFailureSample() {
  await generateTts({ mockTaskOutcome: 'failed' })
}

async function generateTtsCancelledSample() {
  await generateTts({ mockTaskOutcome: 'cancelled' })
}

async function generateSubtitle(options: { mockTaskOutcome?: 'success' | 'failed' | 'cancelled'; retryOfTaskId?: string } = {}) {
  if (!workbenchView.value || !workbenchView.value.artifacts.tts.current) return
  subtitleLoading.value = true
  try {
    const currentTts = workbenchView.value.artifacts.tts.current
    const result = await generateVideoSubtitles(
      workbenchView.value.videoId,
      {
        idempotencyToken: createClientToken('video-subtitle-generate'),
        expectedReferenceVersion: workbenchView.value.dependencyRefs.videoReferenceVersion,
        videoUnitId: workbenchView.value.dependencyRefs.videoUnitId,
        ttsArtifactId: currentTts.id,
        expectedTtsVersionNo: currentTts.versionNo,
        subtitleStyle: subtitleForm.value.subtitleStyle,
        lineLength: subtitleForm.value.lineLength,
        qualityMode: subtitleForm.value.qualityMode,
        retryOfTaskId: options.retryOfTaskId,
        mockTaskOutcome: options.mockTaskOutcome,
      },
      sourceMode,
    )
    await loadWorkbench()
    activeStepKey.value = 'subtitle'
    if (result.task.status === 'failed') {
      ElMessage.warning('字幕生成失败，当前字幕不受影响，可重试或手动编辑')
    } else if (result.task.status === 'cancelled') {
      ElMessage.info('字幕生成已取消，未写入候选版本')
    } else {
      ElMessage.success('字幕候选已生成')
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '字幕生成失败')
  } finally {
    subtitleLoading.value = false
  }
}

async function generateSubtitleFailureSample() {
  await generateSubtitle({ mockTaskOutcome: 'failed' })
}

async function generateSubtitleCancelledSample() {
  await generateSubtitle({ mockTaskOutcome: 'cancelled' })
}

async function retryVideoTask(task: VideoWorkbenchDTO['recentTasks'][number]) {
  if (task.taskType === 'video_render_generate') {
    await generateRender({ retryOfTaskId: task.id, mockTaskOutcome: 'success' })
    return
  }
  if (task.taskType === 'video_subtitle_generate') {
    await generateSubtitle({ retryOfTaskId: task.id, mockTaskOutcome: 'success' })
    return
  }
  if (task.taskType === 'video_tts_generate') {
    await generateTts({ retryOfTaskId: task.id, mockTaskOutcome: 'success' })
    return
  }
  await generateNarration({ retryOfTaskId: task.id, mockTaskOutcome: 'success' })
}

async function cancelVideoTask(task: VideoWorkbenchDTO['recentTasks'][number]) {
  if (task.taskType === 'video_render_generate') {
    await generateRender({ retryOfTaskId: task.id, mockTaskOutcome: 'cancelled' })
    return
  }
  if (task.taskType === 'video_subtitle_generate') {
    await generateSubtitle({ retryOfTaskId: task.id, mockTaskOutcome: 'cancelled' })
    return
  }
  if (task.taskType === 'video_tts_generate') {
    await generateTts({ retryOfTaskId: task.id, mockTaskOutcome: 'cancelled' })
    return
  }
  await generateNarration({ retryOfTaskId: task.id, mockTaskOutcome: 'cancelled' })
}

function openNarrationDrawer(artifact: VideoNarrationArtifactDTO) {
  narrationDrawer.value = { visible: true, artifact }
  narrationEdit.value = {
    contentText: artifact.contentText,
    hook: artifact.hook,
    firstScreenSubtitle: artifact.firstScreenSubtitle,
    endingHook: artifact.endingHook,
    reason: '',
  }
}

async function saveNarrationDraft() {
  if (!workbenchView.value || !narrationDrawer.value.artifact) return
  narrationLoading.value = true
  try {
    await editVideoNarrationDraft(
      workbenchView.value.videoId,
      {
        idempotencyToken: createClientToken('video-narration-edit'),
        baseArtifactId: narrationDrawer.value.artifact.id,
        contentText: narrationEdit.value.contentText,
        hook: narrationEdit.value.hook,
        firstScreenSubtitle: narrationEdit.value.firstScreenSubtitle,
        endingHook: narrationEdit.value.endingHook,
        reason: narrationEdit.value.reason || '手动编辑旁白稿',
      },
      sourceMode,
    )
    narrationDrawer.value.visible = false
    await loadWorkbench()
    activeStepKey.value = 'narration'
    ElMessage.success('已保存为新旁白草稿')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存旁白草稿失败')
  } finally {
    narrationLoading.value = false
  }
}

function openSubtitleDrawer(artifact: VideoSubtitleArtifactDTO) {
  subtitleDrawer.value = { visible: true, artifact }
  subtitleEdit.value = {
    contentText: artifact.contentText,
    firstScreenSubtitle: artifact.firstScreenSubtitle,
    reason: '',
  }
}

async function saveSubtitleDraft() {
  if (!workbenchView.value || !subtitleDrawer.value.artifact) return
  subtitleLoading.value = true
  try {
    await editVideoSubtitleDraft(
      workbenchView.value.videoId,
      {
        idempotencyToken: createClientToken('video-subtitle-edit'),
        baseArtifactId: subtitleDrawer.value.artifact.id,
        contentText: subtitleEdit.value.contentText,
        firstScreenSubtitle: subtitleEdit.value.firstScreenSubtitle,
        reason: subtitleEdit.value.reason || '手动编辑字幕分行',
      },
      sourceMode,
    )
    subtitleDrawer.value.visible = false
    await loadWorkbench()
    activeStepKey.value = 'subtitle'
    ElMessage.success('已保存为新字幕草稿')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存字幕草稿失败')
  } finally {
    subtitleLoading.value = false
  }
}

async function confirmNarrationArtifact(artifact: VideoNarrationArtifactDTO) {
  if (!workbenchView.value) return
  let riskContinueReason: string | undefined
  if (isNarrationRisky(artifact)) {
    try {
      const result = await ElMessageBox.prompt('该旁白分数偏低或风险偏高。请填写继续确认原因。', '确认风险旁白', {
        confirmButtonText: '确认此版',
        cancelButtonText: '取消',
        inputPlaceholder: '说明为什么仍采用此版',
        inputPattern: /^.{4,}$/,
        inputErrorMessage: '原因至少 4 个字符',
      })
      riskContinueReason = result.value
    } catch {
      return
    }
  }
  narrationLoading.value = true
  try {
    await confirmVideoNarration(
      workbenchView.value.videoId,
      artifact.id,
      {
        idempotencyToken: createClientToken('video-narration-confirm'),
        expectedVersionNo: artifact.versionNo,
        riskContinueReason,
      },
      sourceMode,
    )
    await loadWorkbench()
    activeStepKey.value = 'tts'
    ElMessage.success('旁白已确认，可以生成配音候选')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '确认旁白失败')
  } finally {
    narrationLoading.value = false
  }
}

async function confirmTtsArtifact(artifact: VideoTtsArtifactDTO) {
  if (!workbenchView.value) return
  ttsLoading.value = true
  try {
    await confirmVideoTts(
      workbenchView.value.videoId,
      artifact.id,
      {
        idempotencyToken: createClientToken('video-tts-confirm'),
        expectedVersionNo: artifact.versionNo,
      },
      sourceMode,
    )
    await loadWorkbench()
    activeStepKey.value = 'subtitle'
    ElMessage.success('配音已确认，可以生成字幕候选')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '确认配音失败')
  } finally {
    ttsLoading.value = false
  }
}

async function rejectTtsArtifact(artifact: VideoTtsArtifactDTO) {
  if (!workbenchView.value) return
  try {
    const result = await ElMessageBox.prompt('请填写不采用该配音的原因。', '不采用配音', {
      confirmButtonText: '标记不采用',
      cancelButtonText: '取消',
      inputPattern: /^.{4,}$/,
      inputErrorMessage: '原因至少 4 个字符',
    })
    ttsLoading.value = true
    await rejectVideoTts(
      workbenchView.value.videoId,
      artifact.id,
      {
        idempotencyToken: createClientToken('video-tts-reject'),
        reason: result.value,
      },
      sourceMode,
    )
    await loadWorkbench()
    activeStepKey.value = 'tts'
    ElMessage.success('已标记为不采用')
  } catch (error) {
    if (error instanceof Error) ElMessage.error(error.message)
  } finally {
    ttsLoading.value = false
  }
}

async function confirmSubtitleArtifact(artifact: VideoSubtitleArtifactDTO) {
  if (!workbenchView.value) return
  subtitleLoading.value = true
  try {
    await confirmVideoSubtitle(
      workbenchView.value.videoId,
      artifact.id,
      {
        idempotencyToken: createClientToken('video-subtitle-confirm'),
        expectedVersionNo: artifact.versionNo,
      },
      sourceMode,
    )
    await loadWorkbench()
    activeStepKey.value = 'visual_plan'
    ElMessage.success('字幕已确认，可以配置视觉方案')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '确认字幕失败')
  } finally {
    subtitleLoading.value = false
  }
}

async function rejectSubtitleArtifact(artifact: VideoSubtitleArtifactDTO) {
  if (!workbenchView.value) return
  try {
    const result = await ElMessageBox.prompt('请填写不采用该字幕的原因。', '不采用字幕', {
      confirmButtonText: '标记不采用',
      cancelButtonText: '取消',
      inputPattern: /^.{4,}$/,
      inputErrorMessage: '原因至少 4 个字符',
    })
    subtitleLoading.value = true
    await rejectVideoSubtitle(
      workbenchView.value.videoId,
      artifact.id,
      {
        idempotencyToken: createClientToken('video-subtitle-reject'),
        reason: result.value,
      },
      sourceMode,
    )
    await loadWorkbench()
    activeStepKey.value = 'subtitle'
    ElMessage.success('已标记为不采用')
  } catch (error) {
    if (error instanceof Error) ElMessage.error(error.message)
  } finally {
    subtitleLoading.value = false
  }
}

async function saveVisualPlan() {
  if (!workbenchView.value || !workbenchView.value.artifacts.subtitle.current) return
  visualLoading.value = true
  try {
    const currentSubtitle = workbenchView.value.artifacts.subtitle.current
    await saveVideoVisualPlan(
      workbenchView.value.videoId,
      {
        idempotencyToken: createClientToken('video-visual-plan-save'),
        expectedReferenceVersion: workbenchView.value.dependencyRefs.videoReferenceVersion,
        videoUnitId: workbenchView.value.dependencyRefs.videoUnitId,
        subtitleArtifactId: currentSubtitle.id,
        expectedSubtitleVersionNo: currentSubtitle.versionNo,
        backgroundAssetId: visualForm.value.backgroundAssetId,
        backgroundName: getBackgroundName(visualForm.value.backgroundAssetId),
        aspectRatio: visualForm.value.aspectRatio,
        resolution: visualForm.value.resolution,
        subtitlePosition: visualForm.value.subtitlePosition,
        fontSize: visualForm.value.fontSize,
        textColor: visualForm.value.textColor,
        strokeColor: visualForm.value.strokeColor,
        shadowEnabled: visualForm.value.shadowEnabled,
        safeAreaPreset: visualForm.value.safeAreaPreset,
        qualityMode: 'standard',
      },
      sourceMode,
    )
    await loadWorkbench()
    activeStepKey.value = 'visual_plan'
    ElMessage.success('视觉方案候选已保存，确认后可渲染预览')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存视觉方案失败')
  } finally {
    visualLoading.value = false
  }
}

async function confirmVisualPlanArtifact(artifact: VideoVisualPlanArtifactDTO) {
  if (!workbenchView.value) return
  visualLoading.value = true
  try {
    await confirmVideoVisualPlan(
      workbenchView.value.videoId,
      artifact.id,
      {
        idempotencyToken: createClientToken('video-visual-plan-confirm'),
        expectedVersionNo: artifact.versionNo,
      },
      sourceMode,
    )
    await loadWorkbench()
    activeStepKey.value = 'render'
    ElMessage.success('视觉方案已确认，可以渲染视频预览')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '确认视觉方案失败')
  } finally {
    visualLoading.value = false
  }
}

async function rejectVisualPlanArtifact(artifact: VideoVisualPlanArtifactDTO) {
  if (!workbenchView.value) return
  try {
    const result = await ElMessageBox.prompt('请填写不采用该视觉方案的原因。', '不采用视觉方案', {
      confirmButtonText: '标记不采用',
      cancelButtonText: '取消',
      inputPattern: /^.{4,}$/,
      inputErrorMessage: '原因至少 4 个字符',
    })
    visualLoading.value = true
    await rejectVideoVisualPlan(
      workbenchView.value.videoId,
      artifact.id,
      {
        idempotencyToken: createClientToken('video-visual-plan-reject'),
        reason: result.value,
      },
      sourceMode,
    )
    await loadWorkbench()
    activeStepKey.value = 'visual_plan'
    ElMessage.success('已标记为不采用')
  } catch (error) {
    if (error instanceof Error) ElMessage.error(error.message)
  } finally {
    visualLoading.value = false
  }
}

async function generateRender(options: { mockTaskOutcome?: 'success' | 'failed' | 'cancelled'; retryOfTaskId?: string } = {}) {
  if (!workbenchView.value || !workbenchView.value.artifacts.visualPlan.current) return
  renderLoading.value = true
  try {
    const currentVisualPlan = workbenchView.value.artifacts.visualPlan.current
    const result = await generateVideoRender(
      workbenchView.value.videoId,
      {
        idempotencyToken: createClientToken('video-render-generate'),
        expectedReferenceVersion: workbenchView.value.dependencyRefs.videoReferenceVersion,
        videoUnitId: workbenchView.value.dependencyRefs.videoUnitId,
        visualPlanArtifactId: currentVisualPlan.id,
        expectedVisualPlanVersionNo: currentVisualPlan.versionNo,
        qualityMode: 'standard',
        retryOfTaskId: options.retryOfTaskId,
        mockTaskOutcome: options.mockTaskOutcome,
      },
      sourceMode,
    )
    await loadWorkbench()
    activeStepKey.value = 'render'
    if (result.task.status === 'failed') {
      ElMessage.warning('渲染预览失败，当前视频不受影响，可重试或调整视觉方案')
    } else if (result.task.status === 'cancelled') {
      ElMessage.info('渲染预览已取消，未写入候选视频')
    } else {
      ElMessage.success('渲染预览已生成，请预览确认')
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '渲染预览失败')
  } finally {
    renderLoading.value = false
  }
}

async function generateRenderFailureSample() {
  await generateRender({ mockTaskOutcome: 'failed' })
}

async function generateRenderCancelledSample() {
  await generateRender({ mockTaskOutcome: 'cancelled' })
}

async function confirmRenderRecord(render: VideoRenderDTO) {
  if (!workbenchView.value) return
  renderLoading.value = true
  try {
    await confirmVideoRender(
      workbenchView.value.videoId,
      render.id,
      {
        idempotencyToken: createClientToken('video-render-confirm'),
        expectedVersionNo: render.versionNo,
      },
      sourceMode,
    )
    await loadWorkbench()
    activeStepKey.value = 'export'
    ElMessage.success('当前视频预览已确认，可以创建导出记录')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '确认当前视频失败')
  } finally {
    renderLoading.value = false
  }
}

async function rejectRenderRecord(render: VideoRenderDTO) {
  if (!workbenchView.value) return
  try {
    const result = await ElMessageBox.prompt('请填写不满意或驳回该渲染版本的原因。', '驳回渲染版本', {
      confirmButtonText: '标记不采用',
      cancelButtonText: '取消',
      inputPattern: /^.{4,}$/,
      inputErrorMessage: '原因至少 4 个字符',
    })
    renderLoading.value = true
    await rejectVideoRender(
      workbenchView.value.videoId,
      render.id,
      {
        idempotencyToken: createClientToken('video-render-reject'),
        reason: result.value,
      },
      sourceMode,
    )
    await loadWorkbench()
    activeStepKey.value = 'render'
    ElMessage.success('已驳回该渲染版本')
  } catch (error) {
    if (error instanceof Error) ElMessage.error(error.message)
  } finally {
    renderLoading.value = false
  }
}

async function createExportRecord() {
  if (!workbenchView.value || !workbenchView.value.artifacts.renders.current) return
  exportLoading.value = true
  try {
    const currentRender = workbenchView.value.artifacts.renders.current
    await createVideoExport(
      workbenchView.value.videoId,
      {
        idempotencyToken: createClientToken('video-export-create'),
        renderVersionId: currentRender.id,
        expectedRenderVersionNo: currentRender.versionNo,
        fileName: exportForm.value.fileName || undefined,
        format: 'mp4',
      },
      sourceMode,
    )
    await loadWorkbench()
    activeStepKey.value = 'export'
    ElMessage.success('导出记录已创建；这不是发布动作')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '创建导出记录失败')
  } finally {
    exportLoading.value = false
  }
}

function previewTtsArtifact(artifact: VideoTtsArtifactDTO) {
  ElMessage.info(`mock 试听占位：${artifact.previewUrl}`)
}

function isNarrationRisky(artifact: VideoNarrationArtifactDTO): boolean {
  return artifact.score < 70 || artifact.riskTags.some((tag) => /高风险|风险偏高|敏感|火药/.test(tag))
}

async function rejectNarrationArtifact(artifact: VideoNarrationArtifactDTO) {
  if (!workbenchView.value) return
  try {
    const result = await ElMessageBox.prompt('请填写不采用该旁白的原因。', '不采用旁白', {
      confirmButtonText: '标记不采用',
      cancelButtonText: '取消',
      inputPattern: /^.{4,}$/,
      inputErrorMessage: '原因至少 4 个字符',
    })
    narrationLoading.value = true
    await rejectVideoNarration(
      workbenchView.value.videoId,
      artifact.id,
      {
        idempotencyToken: createClientToken('video-narration-reject'),
        reason: result.value,
      },
      sourceMode,
    )
    await loadWorkbench()
    activeStepKey.value = 'narration'
    ElMessage.success('已标记为不采用')
  } catch (error) {
    if (error instanceof Error) ElMessage.error(error.message)
  } finally {
    narrationLoading.value = false
  }
}

function getStepClass(step: VideoWorkbenchViewStep) {
  return {
    active: activeStepKey.value === step.key,
    done: step.status === 'completed',
    issue: step.status === 'blocked',
    locked: step.status === 'placeholder_locked' || step.status === 'blocked',
  }
}

function stepIndex(key: VideoWorkbenchStepDTO['key']) {
  const keys: VideoWorkbenchStepDTO['key'][] = ['reference_check', 'narration', 'tts', 'subtitle', 'visual_plan', 'render', 'preview', 'export']
  return keys.indexOf(key) + 1
}

function getNarrationStatusText(status: VideoNarrationArtifactDTO['status']) {
  if (status === 'confirmed') return '已确认'
  if (status === 'draft') return '编辑草稿'
  if (status === 'rejected') return '不采用'
  if (status === 'stale') return '已过期'
  if (status === 'archived') return '历史版本'
  return '候选'
}

function getTtsStatusText(status: VideoTtsArtifactDTO['status']) {
  if (status === 'confirmed') return '已确认'
  if (status === 'rejected') return '不采用'
  if (status === 'stale') return '已过期'
  if (status === 'archived') return '历史版本'
  return '候选'
}

function getSubtitleStatusText(status: VideoSubtitleArtifactDTO['status']) {
  if (status === 'confirmed') return '已确认'
  if (status === 'draft') return '编辑草稿'
  if (status === 'rejected') return '不采用'
  if (status === 'stale') return '已过期'
  if (status === 'archived') return '历史版本'
  return '候选'
}

function getVisualPlanStatusText(status: VideoVisualPlanArtifactDTO['status']) {
  if (status === 'confirmed') return '已确认'
  if (status === 'rejected') return '不采用'
  if (status === 'stale') return '已过期'
  if (status === 'archived') return '历史版本'
  return '候选'
}

function getRenderStatusText(status: VideoRenderDTO['status']) {
  if (status === 'confirmed') return '已确认'
  if (status === 'rejected') return '不采用'
  if (status === 'stale') return '已过期'
  if (status === 'archived') return '历史版本'
  return '候选'
}

function getVoiceName(voiceId: string) {
  if (voiceId === 'mock-female-bright') return '女声-明亮感'
  if (voiceId === 'mock-neutral-calm') return '中性-冷静感'
  return '男声-剧情感'
}

function getBackgroundName(backgroundAssetId: string) {
  return visualBackgroundAssets.find((asset) => asset.id === backgroundAssetId)?.name ?? '默认循环背景'
}

function createClientToken(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
</script>

<style scoped>
.form-field-label {
  display: block;
  margin-bottom: 8px;
  color: #606266;
  font-size: 14px;
  line-height: 22px;
}

.subtitle-preview {
  margin: 12px 0 0;
  padding: 12px;
  max-height: 240px;
  overflow: auto;
  border: 1px solid #d9e2ef;
  border-radius: 6px;
  background: #f8fafc;
  color: #334155;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

.visual-plan-preview,
.video-preview-placeholder {
  display: grid;
  gap: 6px;
  padding: 18px;
  border: 1px solid #d9e2ef;
  border-radius: 6px;
  background: linear-gradient(135deg, #0f172a 0%, #1f2937 48%, #334155 100%);
  color: #f8fafc;
}

.video-preview-placeholder {
  min-height: 120px;
  align-content: center;
  text-align: center;
}

.video-preview-placeholder.large {
  min-height: 220px;
}

.video-preview-placeholder span,
.visual-plan-preview span {
  color: #cbd5e1;
  word-break: break-all;
}
</style>
