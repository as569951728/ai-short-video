<template>
  <section class="page-stack novel-step-workbench">
    <div class="workbench-hero step-workbench-hero">
      <div>
        <el-button text @click="workbenchMode === 'step' ? goOverview() : router.push('/novels')">
          {{ workbenchMode === 'step' ? '返回小说概览' : '返回小说列表' }}
        </el-button>
        <h1>{{ detail?.title || '小说详情' }}</h1>
        <p>{{ genreText }} / {{ workbenchMode === 'step' ? activeStep.name : '小说创作概览' }}</p>
      </div>
      <div class="hero-actions">
        <el-tag :type="statusTagType">{{ detail?.statusSummary.displayStatusText || '加载中' }}</el-tag>
        <el-button :loading="loading" @click="loadDetail()">刷新</el-button>
        <el-button @click="router.push('/novels')">小说列表</el-button>
        <el-button
          v-if="primaryGenerateAction && workbenchMode === 'overview'"
          type="primary"
          :loading="primaryGenerateAction.loading"
          :disabled="primaryGenerateAction.disabled"
          @click="openStep(suggestedStepKey)"
        >
          进入{{ suggestedStepName }}
        </el-button>
        <el-button v-else-if="workbenchMode === 'overview'" type="primary" @click="openStep(suggestedStepKey)">
          继续当前步骤
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="apiError"
      :title="apiError"
      type="error"
      show-icon
      :closable="true"
      @close="apiError = ''"
    />

    <div v-if="workbenchMode === 'overview'" class="overview-shell">
      <div class="overview-grid">
        <el-card class="overview-main-card" shadow="never">
          <p class="overview-eyebrow">小说创作概览</p>
          <h2>{{ detail?.title || '小说详情' }}</h2>
          <p class="muted">
            这里不再铺开所有创作模块，只展示全局状态、质量风险、最近任务和下一步建议。
            具体编辑、优化、采用确认进入对应步骤详情页处理。
          </p>
          <div class="overview-actions">
            <el-button type="primary" @click="openStep(suggestedStepKey)">
              进入{{ suggestedStepName }}
            </el-button>
            <el-button :disabled="!activeRecentTask" @click="openTaskDrawer(activeRecentTask?.id)">
              {{ activeRecentTask ? '查看最近任务' : '暂无任务' }}
            </el-button>
          </div>
        </el-card>

        <div class="summary-grid">
          <div class="summary-item"><span>创作阶段</span><strong>{{ detail?.statusSummary.displayStatusText || '-' }}</strong></div>
          <div class="summary-item"><span>章节目标</span><strong>{{ detail?.chapterProgress.text || '-' }}</strong></div>
          <div class="summary-item"><span>结构候选</span><strong>{{ structureRows.length }}</strong></div>
          <div class="summary-item"><span>视频引用</span><strong>{{ detail?.videoReferenceSummary.statusText || '-' }}</strong></div>
          <div class="summary-item"><span>创作来源</span><strong>{{ detail?.creationSource.label || '-' }}</strong></div>
        </div>
      </div>

      <section class="major-stepper-panel">
        <button
          v-for="(step, index) in workbenchSteps"
          :key="step.key"
          :class="['major-step', step.state, { active: step.key === suggestedStepKey }]"
          type="button"
          @click="openStep(step.key)"
        >
          <span class="major-step-index">{{ index + 1 }}</span>
          <strong>{{ step.name }}</strong>
          <small>{{ step.stateText }}</small>
        </button>
      </section>

      <div class="overview-content-grid">
        <el-card shadow="never">
          <div class="section-title">
            <div>
              <h2>创作流程</h2>
              <p class="muted">点击大步骤进入独立详情页；每个详情页内还有子步骤条提示该确认什么。</p>
            </div>
          </div>
          <div class="stage-overview-grid">
            <button
              v-for="step in workbenchSteps"
              :key="step.key"
              :class="['stage-overview-card', step.state]"
              type="button"
              @click="openStep(step.key)"
            >
              <div class="direction-card-head">
                <el-tag :type="step.tagType" effect="plain">{{ step.stateText }}</el-tag>
                <span>{{ step.key === suggestedStepKey ? '建议处理' : step.progressText }}</span>
              </div>
              <h3>{{ step.name }}</h3>
              <p>{{ step.description }}</p>
              <p><strong>下一步：</strong>{{ step.nextAction }}</p>
            </button>
          </div>
        </el-card>

        <aside class="overview-side">
          <el-card shadow="never">
            <div class="side-stack">
              <div>
                <h2>下一步建议</h2>
                <p class="muted">{{ detail?.statusSummary.recommendedAction.reasonText || '正在读取小说状态和下一步动作。' }}</p>
              </div>
              <el-button type="primary" @click="openStep(suggestedStepKey)">
                进入{{ suggestedStepName }}
              </el-button>
            </div>
          </el-card>

          <el-card shadow="never">
            <div class="section-title">
              <div>
                <h2>最近任务</h2>
                <p class="muted">生成任务进度、失败原因和重试入口。</p>
              </div>
            </div>
            <TaskProgressPanel
              :summary="activeRecentTask"
              :loading="loading"
              @view="openTaskDrawer(activeRecentTask?.id)"
              @view-result="openTaskResult"
              @refresh="loadDetail"
            />
          </el-card>
        </aside>
      </div>
    </div>

    <div v-else class="step-detail-shell">
      <el-card shadow="never">
        <div class="section-title step-detail-title">
          <div>
            <div class="breadcrumb-line">
              <el-button text @click="goOverview">小说概览</el-button>
              <span>/</span>
              <el-tag :type="activeStep.tagType" effect="plain">{{ activeStep.stateText }}</el-tag>
            </div>
            <h2>{{ activeStep.name }}</h2>
            <p class="muted">{{ activeStep.description }}</p>
          </div>
          <div class="task-notice-actions">
            <div class="step-action-stack">
              <div class="step-action-row">
                <el-button :disabled="!activeRecentTask" @click="openTaskDrawer(activeRecentTask?.id)">
                  {{ activeRecentTask ? '任务详情' : '暂无任务' }}
                </el-button>
                <el-button
                  v-if="activeStep.primaryAction"
                  type="primary"
                  :loading="activeStep.primaryLoading"
                  :disabled="activeStep.primaryDisabled"
                  @click="activeStep.primaryAction"
                >
                  {{ activeStep.primaryActionLabel }}
                </el-button>
              </div>
              <p v-if="activeStep.primaryDisabled" class="step-disabled-reason">{{ activeStep.disabledReason }}</p>
            </div>
          </div>
        </div>
      </el-card>

      <section class="major-stepper-panel compact">
        <button
          v-for="(step, index) in workbenchSteps"
          :key="step.key"
          :class="['major-step', step.state, { active: step.key === activeStep.key }]"
          type="button"
          @click="openStep(step.key)"
        >
          <span class="major-step-index">{{ index + 1 }}</span>
          <strong>{{ step.name }}</strong>
          <small>{{ step.key === activeStep.key ? '当前步骤' : step.stateText }}</small>
        </button>
      </section>

      <section class="sub-stepper-panel">
        <button
          v-for="(subStep, index) in activeStep.subSteps"
          :key="subStep.key"
          :class="['sub-step-card', subStep.state, { active: subStep.key === activeSubStep.key }]"
          type="button"
          :disabled="!canInteractWithSubStep(subStep.state)"
          :title="canInteractWithSubStep(subStep.state) ? subStep.hint : '完成前置步骤后解锁'"
          @click="setActiveSubStep(subStep.key)"
        >
          <strong>{{ index + 1 }}. {{ subStep.name }}</strong>
          <span>{{ subStep.hint }}</span>
        </button>
      </section>

      <div class="step-content-grid">
        <main class="step-main-content">
          <el-card shadow="never">
            <div class="section-title">
              <div>
                <h2>{{ activeSubStep.name }}</h2>
                <p class="muted">{{ activeSubStep.hint }}</p>
              </div>
              <div class="tag-row">
                <el-tag :type="activeSubStep.tagType" effect="plain">{{ activeSubStep.stateText }}</el-tag>
                <el-tag effect="plain">{{ activeStep.stateText }}</el-tag>
              </div>
            </div>

            <template v-if="activeStep.key === 'direction'">
              <div class="task-notice step-inline-notice">
                <div>
                  <strong>方向候选只会进入候选池</strong>
                  <p>融合会生成一个新的候选方向，用来综合多个候选的爽点；它不会自动成为正式方向，仍需要你查看并点击“采用”。</p>
                </div>
                <div class="task-notice-actions">
                  <el-button :disabled="selectedCandidateIds.length < 2" :loading="fusing" @click="openFuseDialog">融合所选方向</el-button>
                </div>
              </div>

              <el-empty v-if="!loading && directionRows.length === 0" description="暂无方向候选">
                <el-button type="primary" :loading="generatingDirection" @click="handleGenerateDirection">生成 3-5 个方向候选</el-button>
              </el-empty>

              <div v-else class="direction-grid">
                <article
                  v-for="candidate in directionRows"
                  :key="candidate.id"
                  :class="['direction-card', { selected: selectedCandidateIds.includes(candidate.id) }]"
                >
                  <div class="direction-card-head">
                    <h3>{{ candidate.title }}</h3>
                    <el-checkbox :model-value="selectedCandidateIds.includes(candidate.id)" @change="toggleCandidate(candidate.id)" />
                  </div>
                  <div class="tag-row">
                    <el-tag effect="plain">{{ candidate.versionLabel }}</el-tag>
                    <el-tag :type="candidate.lowScoreRequiresConfirm ? 'warning' : 'success'" effect="plain">评分 {{ candidate.scoreText }}</el-tag>
                    <el-tag :type="candidate.riskLevelText.includes('高') ? 'danger' : 'info'" effect="plain">{{ candidate.riskLevelText }}</el-tag>
                  </div>
                  <dl>
                    <dt>一句话方向</dt>
                    <dd>{{ candidate.logline }}</dd>
                    <dt>前三秒钩子</dt>
                    <dd>{{ candidate.coreHook }}</dd>
                    <dt>推荐理由</dt>
                    <dd>{{ candidate.primaryReason }}</dd>
                    <dt>视频化表达</dt>
                    <dd>{{ candidate.videoPotential }}</dd>
                  </dl>
                  <div class="issue-list">
                    <el-tag v-for="tag in candidate.riskTags" :key="tag" type="warning" effect="plain">{{ tag }}</el-tag>
                  </div>
                  <div class="split-actions">
                    <el-button size="small" @click="openDirectionDetail(candidate)">详情</el-button>
                    <el-button size="small" @click="openEditDirectionDialog(candidate)">编辑</el-button>
                    <el-button size="small" :disabled="!candidate.canAdopt" :loading="adoptingDirectionId === candidate.id" @click="openAdoptDialog(candidate)">采用</el-button>
                    <el-button size="small" :loading="optimizingId === candidate.id" @click="openOptimizeDialog(candidate)">按要求优化</el-button>
                  </div>
                </article>
              </div>
            </template>

            <template v-else-if="activeStep.key === 'setting'">
              <div class="asset-status-grid">
                <div v-for="asset in currentAssetCards.slice(0, 2)" :key="asset.key" class="asset-status-item">
                  <span>{{ asset.label }}</span>
                  <strong>{{ asset.title }}</strong>
                  <p>{{ asset.summary }}</p>
                </div>
              </div>
              <el-empty v-if="settingRows.length === 0" description="暂无设定候选">
                <div class="empty-action-stack">
                  <div v-if="settingGenerationPending" class="empty-pending-panel">
                    <div class="empty-pending-head">
                      <strong>设定正在生成中</strong>
                      <el-tag type="warning" effect="plain">生成中</el-tag>
                    </div>
                    <p>刷新或新开页面后会继续保留等待状态。生成结果会进入设定候选池，点击“采用”后才会成为正式设定。</p>
                    <div class="empty-pending-actions">
                      <el-button @click="cancelLocalPendingWait">取消等待</el-button>
                      <el-button type="warning" plain @click="restartStructureGeneration('setting')">重新生成</el-button>
                    </div>
                  </div>
                  <div v-else class="empty-generate-panel">
                    <p>方向采用后可生成设定候选，生成结果不会自动覆盖正式设定。</p>
                    <el-button
                      :disabled="!canGenerateSetting || hasLocalPendingWait"
                      :loading="structureGeneratingType === 'setting'"
                      type="primary"
                      @click="handleGenerateStructure('setting')"
                    >
                      生成设定
                    </el-button>
                  </div>
                </div>
              </el-empty>
              <div v-else class="structure-grid" data-result-section="setting">
                <article v-for="asset in settingRows" :id="`structure-candidate-${asset.id}`" :key="asset.id" :class="['structure-card', { 'result-focus-card': focusedStructureCandidateId === asset.id }]">
                  <div class="direction-card-head">
                    <h3>{{ asset.title }}</h3>
                    <el-tag effect="plain">{{ asset.typeText }}</el-tag>
                  </div>
                  <div class="tag-row">
                    <el-tag effect="plain">{{ asset.versionLabel }}</el-tag>
                    <el-tag :type="asset.highRiskRequiresConfirm ? 'danger' : 'success'" effect="plain">评分 {{ asset.scoreText }}</el-tag>
                    <el-tag :type="asset.status.includes('过期') ? 'danger' : 'info'" effect="plain">{{ asset.status }}</el-tag>
                  </div>
                  <p class="structure-summary">{{ asset.summary }}</p>
                  <dl>
                    <dt>推荐理由</dt>
                    <dd>{{ asset.primaryReason }}</dd>
                    <dt>结构内容</dt>
                    <dd>{{ asset.sections[0]?.body || '暂无结构摘要' }}</dd>
                  </dl>
                  <div class="issue-list">
                    <el-tag v-for="tag in asset.riskTags" :key="tag" type="warning" effect="plain">{{ tag }}</el-tag>
                  </div>
                  <p v-if="isCurrentStructureAsset(asset)" class="structure-card-note success">这是当前正式版本，后续生成会基于它继续推进。</p>
                  <p v-else-if="isArchivedStructureAsset(asset)" class="structure-card-note">这是历史版本，仅用于追溯，不会参与后续生成。</p>
                  <div class="split-actions">
                    <template v-if="isCandidateStructureAsset(asset)">
                      <el-button size="small" @click="openEditStructureDialog(asset)">编辑</el-button>
                      <el-button size="small" :loading="structureAdoptingId === asset.id" @click="openStructureAdoptDialog(asset)">采用</el-button>
                      <el-button size="small" :loading="structureGeneratingType === asset.objectType" @click="handleContinueOptimize(asset)">继续优化</el-button>
                      <el-button size="small" @click="handleDiscardCandidate(asset)">放弃</el-button>
                    </template>
                    <template v-else-if="isCurrentStructureAsset(asset)">
                      <el-button size="small" type="primary" plain @click="openStep('outline')">进入大纲</el-button>
                      <el-button size="small" :loading="structureGeneratingType === asset.objectType" @click="handleContinueOptimize(asset)">基于当前继续优化</el-button>
                    </template>
                    <span v-else class="muted">历史版本不支持采用操作</span>
                  </div>
                </article>
              </div>
            </template>

            <template v-else-if="activeStep.key === 'outline'">
              <div class="asset-status-grid">
                <div v-for="asset in currentAssetCards.slice(2, 4)" :key="asset.key" class="asset-status-item">
                  <span>{{ asset.label }}</span>
                  <strong>{{ asset.title }}</strong>
                  <p>{{ asset.summary }}</p>
                </div>
              </div>
              <div v-if="activeSubStep.key === 'stages' && detail?.currentAssets.outline && !detail.currentAssets.stageOutline && stageOutlineRows.length === 0" class="task-notice step-inline-notice">
                <div>
                  <strong>全书大纲已采用</strong>
                  <p>下一步需要生成阶段大纲，确认阶段目标和冲突推进后，才会进入章节目录规划。</p>
                </div>
                <div class="task-notice-actions">
                  <el-button
                    type="primary"
                    :disabled="!canGenerateStageOutline || hasLocalPendingWait"
                    :loading="structureGeneratingType === 'stage_outline' || isNovelActionRunning('stage_outline_generate')"
                    @click="handleGenerateStructure('stage_outline')"
                  >
                    生成阶段大纲
                  </el-button>
                </div>
              </div>
              <div v-else-if="activeSubStep.key === 'stages' && detail?.currentAssets.outline && !detail.currentAssets.stageOutline && stageOutlineRows.length > 0" class="task-notice step-inline-notice">
                <div>
                  <strong>阶段大纲候选待确认</strong>
                  <p>新阶段大纲已进入候选池，请查看内容，必要时编辑或继续优化，确认后点击“采用”。</p>
                </div>
              </div>
              <div v-else-if="activeSubStep.key === 'stages' && detail?.currentAssets.stageOutline" class="task-notice step-inline-notice">
                <div>
                  <strong>阶段大纲已采用</strong>
                  <p>大纲设计已完成，下一步进入章节目录，生成每章标题、摘要、钩子和目标字数。</p>
                </div>
                <div class="task-notice-actions">
                  <el-button type="primary" @click="openStep('chapterPlan')">进入章节目录</el-button>
                </div>
              </div>
              <el-alert
                v-if="activeSubStep.key === 'stages' && !detail?.currentAssets.outline"
                title="需要先在“全书主线”里采用一个全书大纲，才能生成阶段大纲。"
                type="info"
                show-icon
                :closable="false"
              />
              <el-empty v-if="visibleOutlineRows.length === 0" :description="activeSubStep.key === 'stages' ? '暂无阶段大纲候选' : '暂无全书大纲候选'">
                <div class="task-notice-actions">
                  <el-button
                    v-if="activeSubStep.key !== 'stages'"
                    :disabled="!canGenerateOutline || hasLocalPendingWait"
                    :loading="structureGeneratingType === 'outline' || isNovelActionRunning('outline_generate')"
                    @click="handleGenerateStructure('outline')"
                  >
                    生成全书大纲
                  </el-button>
                  <el-button
                    v-else
                    :disabled="!canGenerateStageOutline || hasLocalPendingWait"
                    :loading="structureGeneratingType === 'stage_outline' || isNovelActionRunning('stage_outline_generate')"
                    @click="handleGenerateStructure('stage_outline')"
                  >
                    生成阶段大纲
                  </el-button>
                </div>
              </el-empty>
              <div v-else class="structure-grid" data-result-section="outline">
                <article v-for="asset in visibleOutlineRows" :id="`structure-candidate-${asset.id}`" :key="asset.id" :class="['structure-card', { 'result-focus-card': focusedStructureCandidateId === asset.id }]">
                  <div class="direction-card-head">
                    <h3>{{ asset.title }}</h3>
                    <el-tag effect="plain">{{ asset.typeText }}</el-tag>
                  </div>
                  <div class="tag-row">
                    <el-tag effect="plain">{{ asset.versionLabel }}</el-tag>
                    <el-tag :type="asset.highRiskRequiresConfirm ? 'danger' : 'success'" effect="plain">评分 {{ asset.scoreText }}</el-tag>
                    <el-tag :type="asset.status.includes('过期') ? 'danger' : 'info'" effect="plain">{{ asset.status }}</el-tag>
                  </div>
                  <p class="structure-summary">{{ asset.summary }}</p>
                  <dl>
                    <dt>推荐理由</dt>
                    <dd>{{ asset.primaryReason }}</dd>
                    <dt>结构内容</dt>
                    <dd>{{ asset.sections[0]?.body || asset.stages[0]?.goal || '暂无结构摘要' }}</dd>
                  </dl>
                  <div class="issue-list">
                    <el-tag v-for="tag in asset.riskTags" :key="tag" type="warning" effect="plain">{{ tag }}</el-tag>
                  </div>
                  <p v-if="isCurrentStructureAsset(asset)" class="structure-card-note success">这是当前正式版本，后续生成会基于它继续推进。</p>
                  <p v-else-if="isArchivedStructureAsset(asset)" class="structure-card-note">这是历史版本，仅用于追溯，不会参与后续生成。</p>
                  <div class="split-actions">
                    <template v-if="isCandidateStructureAsset(asset)">
                      <el-button size="small" @click="openEditStructureDialog(asset)">编辑</el-button>
                      <el-button size="small" :loading="structureAdoptingId === asset.id" @click="openStructureAdoptDialog(asset)">采用</el-button>
                      <el-button size="small" :loading="structureGeneratingType === asset.objectType" @click="handleContinueOptimize(asset)">继续优化</el-button>
                      <el-button size="small" @click="handleDiscardCandidate(asset)">放弃</el-button>
                    </template>
                    <template v-else-if="isCurrentStructureAsset(asset)">
                      <el-button
                        v-if="asset.objectType === 'outline'"
                        size="small"
                        type="primary"
                        plain
                        @click="setActiveSubStep('stages')"
                      >
                        进入阶段大纲
                      </el-button>
                      <el-button v-else-if="asset.objectType === 'stage_outline'" size="small" type="primary" plain @click="openStep('chapterPlan')">进入章节目录</el-button>
                      <el-button size="small" :loading="structureGeneratingType === asset.objectType" @click="handleContinueOptimize(asset)">基于当前继续优化</el-button>
                    </template>
                    <span v-else class="muted">历史版本不支持采用操作</span>
                  </div>
                </article>
              </div>
            </template>

            <template v-else-if="activeStep.key === 'chapterPlan'">
              <div v-if="detail?.currentAssets.chapterPlan" class="task-notice step-inline-notice">
                <div>
                  <strong>章节目录已采用</strong>
                  <p>章节规划已成为正式目录，下一步进入试写调试，先验证第 1-3 章的文风、爽点和连续性。</p>
                </div>
                <div class="task-notice-actions">
                  <el-button type="primary" @click="openStep('trial')">进入试写调试</el-button>
                </div>
              </div>
              <div v-if="!detail?.currentAssets.chapterPlan" class="task-notice step-inline-notice">
                <div>
                  <strong v-if="isChapterPlanGenerating">章节目录正在生成中</strong>
                  <strong v-else-if="chapterPlanGenerationFailed">章节目录生成失败</strong>
                  <strong v-else>{{ chapterPlanRows.length > 0 ? '章节目录候选待确认' : '生成章节目录' }}</strong>
                  <p v-if="isChapterPlanGenerating">模型正在生成章节表、单章摘要、章节钩子和目标字数；刷新或新开页面后会继续保留任务状态。</p>
                  <p v-else-if="chapterPlanGenerationFailed">{{ chapterPlanFailureReason || '本次生成失败，请查看任务详情后重试。' }}</p>
                  <p v-else>基于已采用的阶段大纲生成章节表、单章摘要、章节钩子和目标字数。生成结果会进入候选池，只有点击“采用”后才会成为正式章节目录。</p>
                </div>
                <div class="task-notice-actions">
                  <el-button
                    v-if="chapterPlanGenerationTask"
                    :type="chapterPlanGenerationFailed ? 'primary' : 'default'"
                    @click="openTaskDrawer(chapterPlanGenerationTask.id)"
                  >
                    查看详情
                  </el-button>
                  <el-button
                    type="primary"
                    :disabled="!canGenerateChapterPlan || isChapterPlanGenerating"
                    :loading="isChapterPlanGenerating"
                    @click="handleGenerateStructure('chapter_plan')"
                  >
                    {{ chapterPlanGenerationFailed ? '重新生成章节目录' : chapterPlanRows.length > 0 ? '再生成一版目录候选' : '生成章节目录' }}
                  </el-button>
                </div>
              </div>
              <div v-if="chapterPlanRows.length > 0 && chapterRows.length === 0" class="structure-grid" data-result-section="chapterPlan">
                <article v-for="asset in chapterPlanRows" :id="`structure-candidate-${asset.id}`" :key="asset.id" :class="['structure-card', { 'result-focus-card': focusedStructureCandidateId === asset.id }]">
                  <div class="direction-card-head">
                    <h3>{{ asset.title }}</h3>
                    <el-tag effect="plain">{{ asset.typeText }}</el-tag>
                  </div>
                  <div class="tag-row">
                    <el-tag effect="plain">{{ asset.versionLabel }}</el-tag>
                    <el-tag :type="asset.highRiskRequiresConfirm ? 'danger' : 'success'" effect="plain">评分 {{ asset.scoreText }}</el-tag>
                    <el-tag type="info" effect="plain">{{ asset.chapterCount }} 章</el-tag>
                    <el-tag :type="asset.status.includes('过期') ? 'danger' : 'info'" effect="plain">{{ asset.status }}</el-tag>
                  </div>
                  <p class="structure-summary">{{ asset.summary }}</p>
                  <dl>
                    <dt>推荐理由</dt>
                    <dd>{{ asset.primaryReason }}</dd>
                    <dt>章节规划</dt>
                    <dd>{{ asset.sections[0]?.body || asset.stages[0]?.goal || `已生成 ${asset.chapterCount} 章目录候选` }}</dd>
                  </dl>
                  <p v-if="isCurrentStructureAsset(asset)" class="structure-card-note success">这是当前正式版本，后续试写会基于它继续推进。</p>
                  <p v-else-if="isArchivedStructureAsset(asset)" class="structure-card-note">这是历史版本，仅用于追溯，不会参与后续生成。</p>
                  <div class="split-actions">
                    <template v-if="isCandidateStructureAsset(asset)">
                      <el-button size="small" @click="openEditStructureDialog(asset)">编辑</el-button>
                      <el-button size="small" :loading="structureAdoptingId === asset.id" @click="openStructureAdoptDialog(asset)">采用</el-button>
                      <el-button size="small" :loading="structureGeneratingType === asset.objectType" @click="handleContinueOptimize(asset)">继续优化</el-button>
                      <el-button size="small" @click="handleDiscardCandidate(asset)">放弃</el-button>
                    </template>
                    <template v-else-if="isCurrentStructureAsset(asset)">
                      <el-button size="small" type="primary" plain @click="openStep('trial')">进入试写</el-button>
                      <el-button size="small" :loading="structureGeneratingType === asset.objectType" @click="handleContinueOptimize(asset)">基于当前继续优化</el-button>
                    </template>
                    <span v-else class="muted">历史版本不支持采用操作</span>
                  </div>
                </article>
              </div>
              <el-empty v-else-if="chapterRows.length === 0" description="尚未确认章节目录" />
              <template v-else>
                <div class="chapter-word-target-toolbar">
                  <div>
                    <strong>目标字数</strong>
                    <span>默认 {{ detail?.preferences.chapterWordMin }}-{{ detail?.preferences.chapterWordMax }} 字/章，当前平均 {{ chapterWordTargetSummary.average || '-' }} 字，预计 {{ chapterWordTargetSummary.total || '-' }} 字</span>
                    <small>只影响后续生成；已生成正文需要在章节详情中扩写或重写。</small>
                  </div>
                  <div class="chapter-word-target-actions">
                    <el-input-number v-model="batchWordTarget" :min="100" :max="30000" :step="100" :precision="0" step-strictly controls-position="right" />
                    <el-button :loading="updatingChapterWordTargets" :disabled="hasLocalPendingWait" @click="handleApplyBatchWordTarget">批量调整</el-button>
                  </div>
                </div>
                <el-table :data="chapterRows" border>
                  <el-table-column prop="chapterNo" label="章序" width="80" />
                  <el-table-column prop="stageIndex" label="阶段" width="80" />
                  <el-table-column prop="title" label="章节标题" min-width="220" />
                  <el-table-column prop="wordTarget" label="目标字数" width="110" />
                  <el-table-column prop="statusText" label="正文状态" width="110" />
                  <el-table-column label="正文版本" width="110">
                    <template #default="{ row }">
                      <el-tag :type="row.hasCurrentContent ? 'success' : 'info'" effect="plain">{{ row.hasCurrentContent ? '已有正文' : '未生成' }}</el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column prop="impactLevelText" label="影响" width="110" />
                  <el-table-column prop="statusNote" label="说明" min-width="220" />
                  <el-table-column label="操作" width="120">
                    <template #default="{ row }">
                      <el-button size="small" @click="router.push(`/novels/${novelId}/chapters/${row.id}`)">详情</el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </template>
            </template>

            <template v-else-if="activeStep.key === 'trial'">
              <div class="section-title nested-title">
                <div>
                  <h3>试写与开篇调试</h3>
                  <p class="muted">先比较第 1 章候选，选定后才继续生成第 2-3 章和试写总评。</p>
                </div>
                <div class="task-notice-actions">
                  <el-button v-if="showTrialAuthoringActions" :disabled="!canGenerateTrial" :loading="generatingTrial" @click="() => handleGenerateTrial()">重新生成 3 个</el-button>
                </div>
              </div>

              <el-alert
                v-if="!canGenerateTrial && !detail?.latestTrialRun"
                title="章节目录确认后才能进入试写。"
                type="info"
                show-icon
                :closable="false"
              />

              <el-empty v-else-if="!detail?.latestTrialRun" description="暂无试写候选">
                <el-button v-if="showTrialAuthoringActions" type="primary" :disabled="!canGenerateTrial" :loading="generatingTrial" @click="() => handleGenerateTrial()">生成第 1 章候选</el-button>
              </el-empty>

              <template v-else>
                <div class="trial-status-row">
                  <el-tag type="success" effect="plain">{{ detail.latestTrialRun.statusText }}</el-tag>
                  <span>{{ detail.latestTrialRun.currentStep }}</span>
                  <el-tag v-if="detail.latestTrialRun.blockingReason" type="danger">{{ detail.latestTrialRun.blockingReason }}</el-tag>
                </div>

                <el-alert
                  v-if="selectingTrialCandidateId"
                  class="step-inline-notice"
                  :title="trialFollowupPendingTitle"
                  type="info"
                  show-icon
                  :closable="false"
                />

                <div class="trial-candidate-grid">
                  <article v-for="candidate in trialCandidateRows" :key="candidate.id" :class="['trial-candidate-card', { recommended: candidate.isAiRecommended, selected: candidate.isSelected }]">
                    <div class="direction-card-head">
                      <h3>{{ candidate.title }}</h3>
                      <el-tag v-if="candidate.isAiRecommended" type="success">AI 推荐</el-tag>
                    </div>
                    <div class="tag-row">
                      <el-tag effect="plain">{{ candidate.versionLabel }}</el-tag>
                      <el-tag :type="candidate.requiresRiskConfirm ? 'warning' : 'success'" effect="plain">评分 {{ candidate.scoreText }}</el-tag>
                      <el-tag :type="candidate.requiresRiskConfirm ? 'warning' : 'info'" effect="plain">{{ candidate.gateText }}</el-tag>
                      <el-tag effect="plain">{{ candidate.statusText }}</el-tag>
                    </div>
                    <dl>
                      <dt>开篇策略</dt>
                      <dd>{{ candidate.openingStrategy }}</dd>
                      <dt>首句</dt>
                      <dd>{{ candidate.firstSentence }}</dd>
                      <dt>前 300 字摘要</dt>
                      <dd>{{ candidate.first300Summary }}</dd>
                      <dt>结尾钩子</dt>
                      <dd>{{ candidate.endingHook }}</dd>
                    </dl>
                    <div class="issue-list">
                      <el-tag v-for="tag in candidate.riskTags" :key="tag" type="warning" effect="plain">{{ tag }}</el-tag>
                    </div>
                    <p class="muted">{{ candidate.aiRecommendedReason }}</p>
                    <div class="split-actions">
                      <el-button size="small" @click="openTrialContent(candidate)">看全文</el-button>
                      <el-button
                        v-if="showTrialCandidateAction(candidate)"
                        size="small"
                        :loading="selectingTrialCandidateId === candidate.id"
                        @click="handleSelectTrialCandidate(candidate)"
                      >
                        选这个继续试写
                      </el-button>
                      <el-button v-if="showTrialAuthoringActions" size="small" :loading="generatingTrial" @click="handleGenerateTrial(`基于 ${candidate.versionLabel} 优化开篇`)">基于此版优化</el-button>
                    </div>
                  </article>
                </div>

                <div v-if="trialChapterResultRows.length > 0" class="trial-result-grid">
                  <article v-for="result in trialChapterResultRows" :key="result.id" class="trial-result-card">
                    <div class="direction-card-head">
                      <h3>第 {{ result.chapterNo }} 章：{{ result.title }}</h3>
                      <el-tag :type="result.hardFailed ? 'danger' : 'success'">{{ result.statusText }}</el-tag>
                    </div>
                    <p>评分 {{ result.scoreText }} / 问题 {{ result.issueCount }} 个</p>
                    <p class="muted">{{ result.summary }}</p>
                    <div class="issue-list">
                      <el-tag v-for="reason in result.hardFailureReasons" :key="reason" type="danger" effect="plain">{{ reason }}</el-tag>
                    </div>
                    <el-button size="small" @click="router.push(`/novels/${novelId}/chapters/${result.chapterId}`)">章节详情</el-button>
                  </article>
                </div>

                <div v-if="detail.latestTrialRun.trialReview" class="trial-review-card">
                  <div class="section-title">
                    <div>
                      <h3>试写总评：{{ detail.latestTrialRun.trialReview.trialResultText }}</h3>
                      <p class="muted">{{ detail.latestTrialRun.trialReview.recommendedAction }}</p>
                    </div>
                    <el-tag :type="detail.latestTrialRun.trialReview.requiresRiskConfirmation ? 'warning' : 'success'">总分 {{ detail.latestTrialRun.trialReview.totalScore }}</el-tag>
                  </div>
                  <div class="asset-status-grid">
                    <div class="asset-status-item">
                      <span>优势</span>
                      <strong>{{ detail.latestTrialRun.trialReview.strengths.join('、') || '-' }}</strong>
                    </div>
                    <div class="asset-status-item">
                      <span>关键问题</span>
                      <strong>{{ detail.latestTrialRun.trialReview.problems.join('、') || '-' }}</strong>
                    </div>
                    <div class="asset-status-item">
                      <span>建议</span>
                      <strong>{{ detail.latestTrialRun.trialReview.suggestions.join('、') || '-' }}</strong>
                    </div>
                  </div>
                  <div class="split-actions">
                    <el-button
                      v-if="showTrialReviewConfirmAction"
                      type="primary"
                      :disabled="!detail.latestTrialRun.trialReview.allowNextStep"
                      :loading="confirmingTrial"
                      @click="openTrialConfirmDialog"
                    >
                      确认试写并生成策略快照
                    </el-button>
                  </div>
                </div>

                <div v-if="detail.bodyStrategySnapshot" class="strategy-snapshot">
                  <h3>正文生成策略快照 v{{ detail.bodyStrategySnapshot.versionNo }}</h3>
                  <el-descriptions border :column="2">
                    <el-descriptions-item label="写法">{{ detail.bodyStrategySnapshot.writingStyle }}</el-descriptions-item>
                    <el-descriptions-item label="节奏">{{ detail.bodyStrategySnapshot.rhythm }}</el-descriptions-item>
                    <el-descriptions-item label="冲突">{{ detail.bodyStrategySnapshot.conflictGuidance }}</el-descriptions-item>
                    <el-descriptions-item label="复审规则">{{ detail.bodyStrategySnapshot.enhancedReviewRules.join('、') }}</el-descriptions-item>
                  </el-descriptions>
                </div>
              </template>
            </template>

            <template v-else-if="activeStep.key === 'body'">
              <div class="task-notice-actions mb-16">
                <el-button
                  type="primary"
                  :disabled="!canStartBodyBatch"
                  :loading="generatingBodyBatch"
                  @click="handleGenerateBodyBatch"
                >
                  {{ bodyGeneration?.recommendedAction.label || '开始本批生成' }}
                </el-button>
                <el-button :disabled="!latestBodyBatch" @click="bodySummaryDrawer.open = true">查看批次总结</el-button>
              </div>

              <el-alert
                v-if="!bodyGeneration?.strategySnapshot"
                title="没有已确认且未过期的正文生成策略快照，不能批量正文。"
                type="info"
                show-icon
                :closable="false"
              />

              <div v-else class="body-status-grid">
                <div class="body-status-card">
                  <span>策略快照</span>
                  <strong>v{{ bodyGeneration.strategySnapshot.versionNo }}</strong>
                  <p>{{ bodyGeneration.strategySnapshot.summary }}</p>
                </div>
                <div class="body-status-card">
                  <span>下一批范围</span>
                  <strong>{{ bodyGeneration.nextBatchRange.text }}</strong>
                  <p>{{ bodyGeneration.recommendedAction.reasonText }}</p>
                </div>
                <div class="body-status-card">
                  <span>章节进度</span>
                  <strong>{{ bodyGeneration.chapterProgress.text }}</strong>
                  <p>待处理 {{ bodyGeneration.chapterProgress.pendingChapterCount }} 章</p>
                </div>
              </div>

              <div v-if="bodyGeneration?.blockingReasons.length" class="issue-list vertical mt-16">
                <el-alert
                  v-for="reason in bodyGeneration.blockingReasons"
                  :key="reason"
                  :title="reason"
                  type="warning"
                  show-icon
                  :closable="false"
                />
              </div>

              <div v-if="bodyGeneration?.openImpactCases.length" class="impact-case-list">
                <article v-for="impact in bodyGeneration.openImpactCases" :key="impact.id" class="impact-case-card">
                  <div class="direction-card-head">
                    <h3>{{ impact.impactLevelText }}：{{ impact.statusText }}</h3>
                    <el-tag type="warning">{{ impact.statusText }}</el-tag>
                  </div>
                  <p>{{ impact.summary }}</p>
                  <div class="issue-list">
                    <el-tag v-for="chapterId in impact.affectedChapterIds" :key="chapterId" type="warning" effect="plain">{{ chapterId }}</el-tag>
                  </div>
                </article>
              </div>

              <div v-if="latestBodyBatch" class="batch-summary-card">
                <div class="section-title">
                  <div>
                    <h3>最近批次：{{ latestBodyBatch.statusText }}</h3>
                    <p class="muted">{{ latestBodyBatch.summary.conclusion }}</p>
                  </div>
                  <el-tag :type="latestBodyBatch.status === 'paused' ? 'danger' : 'success'">
                    第 {{ latestBodyBatch.startChapterNo }}-{{ latestBodyBatch.endChapterNo }} 章
                  </el-tag>
                </div>
                <el-table :data="latestBodyBatch.summary.chapterResults" border>
                  <el-table-column prop="chapterNo" label="章序" width="80" />
                  <el-table-column prop="title" label="章节" min-width="180" />
                  <el-table-column prop="statusText" label="结果" width="110" />
                  <el-table-column prop="score" label="评分" width="90" />
                  <el-table-column prop="recommendedAction" label="建议动作" min-width="180" />
                </el-table>
              </div>
            </template>

            <template v-else-if="activeStep.key === 'fullReview'">
              <div class="task-notice-actions mb-16">
                <el-button v-if="!videoReadyEntryAction" type="primary" :disabled="!canStartFullReview" :loading="startingFullReview" @click="handleStartFullReview">全书 AI 审稿</el-button>
                <el-button v-if="!videoReadyEntryAction" :disabled="!canConfirmCompletion" :loading="confirmingCompletion" @click="handleConfirmCompletion">确认小说完成</el-button>
              </div>

              <el-empty v-if="!latestFullReview" description="正文完成后可发起正式全书审稿" />
              <template v-else>
                <div class="body-status-grid">
                  <div class="body-status-card">
                    <span>全书评分</span>
                    <strong>{{ latestFullReview.totalScore }} / {{ latestFullReview.rating }}</strong>
                    <p>{{ latestFullReview.summary }}</p>
                  </div>
                  <div class="body-status-card">
                    <span>门禁结论</span>
                    <strong>{{ latestFullReview.gate.gateResultText }}</strong>
                    <p>{{ latestFullReview.gate.forcePassReason || latestFullReview.suggestions.join('；') }}</p>
                  </div>
                  <div class="body-status-card">
                    <span>首条视频建议</span>
                    <strong>{{ latestFullReview.firstVideoSuggestion.chapterRange || '-' }}</strong>
                    <p>{{ latestFullReview.firstVideoSuggestion.narrationHook || latestFullReview.videoSuggestion }}</p>
                  </div>
                </div>

                <div class="issue-list vertical mt-16">
                  <article v-for="(issue, issueIndex) in latestFullReview.issues" :key="issue.issueId" class="impact-case-card">
                    <div class="direction-card-head">
                      <h3>{{ issue.title || `质检问题 ${issueIndex + 1}` }}</h3>
                      <el-tag :type="issue.blocking ? 'danger' : 'warning'">{{ issue.status }}</el-tag>
                    </div>
                    <p>{{ issue.plainDescription || '审稿返回了待处理项，但没有提供详细说明。' }}</p>
                    <p class="muted">{{ issue.recommendedAction || '请查看章节内容并决定标记解决或接受风险。' }}</p>
                    <div class="task-notice-actions">
                      <el-button size="small" :loading="resolvingFullReviewIssueId === issue.issueId" @click="handleResolveFullReviewIssue(issue.issueId, 'resolve')">标记解决</el-button>
                      <el-button size="small" :loading="resolvingFullReviewIssueId === issue.issueId" @click="handleResolveFullReviewIssue(issue.issueId, 'accept_risk')">接受风险</el-button>
                    </div>
                  </article>
                </div>

                <el-alert
                  v-if="latestFullReview.gate.forcePassAllowed"
                  class="mt-16"
                  title="全书评分处于 60-69，默认阻塞；如业务上仍要继续，必须填写原因强制通过。"
                  type="warning"
                  show-icon
                  :closable="false"
                >
                  <template #default>
                    <el-button type="warning" size="small" @click="handleForcePassFullReview">填写原因强制通过</el-button>
                  </template>
                </el-alert>
              </template>
            </template>

            <template v-else-if="activeStep.key === 'videoReady'">
              <div class="task-notice-actions mb-16">
                <el-button v-if="!videoReadyEntryAction" :disabled="!canConfirmVideoReady" :loading="confirmingVideoReady" type="primary" @click="handleConfirmVideoReady">确认进入待视频化</el-button>
                <el-button v-if="videoReadyEntryAction" type="primary" @click="router.push(videoReadyEntryAction.route)">
                  {{ videoReadyEntryAction.label }}
                </el-button>
                <el-button :loading="recheckingVideoReadiness" @click="handleRecheckVideoReadiness">重新检查</el-button>
              </div>
              <el-empty v-if="!videoReadiness" description="小说完成确认后生成待视频化检查" />
              <div v-else class="batch-summary-card">
                <div class="section-title">
                  <div>
                    <h3>待视频化检查：{{ videoReadiness.statusText }}</h3>
                    <p class="muted">{{ videoReadiness.recommendedAction.reasonText }}</p>
                  </div>
                </div>
                <el-table :data="videoReadiness.checkItems" border>
                  <el-table-column prop="label" label="检查项" min-width="160" />
                  <el-table-column label="结果" width="100">
                    <template #default="{ row }">
                      <el-tag :type="row.passed ? 'success' : 'danger'">{{ row.passed ? '通过' : '未通过' }}</el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column prop="message" label="说明" min-width="220" />
                  <el-table-column prop="nextAction" label="下一步" min-width="200" />
                </el-table>
                <div v-if="videoReadiness.firstVideoSuggestion" class="first-video-card">
                  <h3>首条视频建议</h3>
                  <p><strong>推荐范围：</strong>{{ videoReadiness.firstVideoSuggestion.chapterRange }}</p>
                  <p><strong>前三秒旁白：</strong>{{ videoReadiness.firstVideoSuggestion.narrationHook }}</p>
                  <p><strong>首屏字幕：</strong>{{ videoReadiness.firstVideoSuggestion.firstScreenSubtitle }}</p>
                  <p><strong>标题钩子：</strong>{{ videoReadiness.firstVideoSuggestion.titleHook }}</p>
                  <p><strong>结尾悬念：</strong>{{ videoReadiness.firstVideoSuggestion.endingSuspense }}</p>
                </div>
              </div>
            </template>
          </el-card>
        </main>

        <aside class="step-side-panel">
          <el-card shadow="never">
            <h2>本步骤确认标准</h2>
            <p class="muted">{{ activeStep.gateText }}</p>
          </el-card>
          <el-card shadow="never">
            <h2>当前子步骤</h2>
            <p class="muted">{{ activeSubStep.name }}：{{ activeSubStep.hint }}</p>
          </el-card>
          <el-card shadow="never">
            <h2>最近任务</h2>
            <TaskProgressPanel
              :summary="activeRecentTask"
              :loading="loading"
              @view="openTaskDrawer(activeRecentTask?.id)"
              @view-result="openTaskResult"
              @refresh="loadDetail"
            />
          </el-card>
        </aside>
      </div>
    </div>

    <el-dialog v-model="adoptDialog.open" title="采用方向" width="560px">
      <el-alert
        :title="adoptDialog.lowScore ? '该方向评分偏低，采用前必须填写原因。' : '采用后该方向会成为正式方向，小说进入设定阶段。'"
        :type="adoptDialog.lowScore ? 'warning' : 'info'"
        show-icon
        :closable="false"
      />
      <el-input
        v-model="adoptDialog.reason"
        class="reason-input"
        type="textarea"
        :rows="4"
        :placeholder="adoptDialog.lowScore ? '请说明为什么仍采用低分方向' : '可填写采用理由，便于后续复盘'"
      />
      <template #footer>
        <el-button @click="adoptDialog.open = false">取消</el-button>
        <el-button type="primary" :loading="adoptingDirectionId === adoptDialog.candidateId" @click="confirmAdopt">确认采用</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="structureAdoptDialog.open" title="采用结构资产" width="560px">
      <el-alert
        :title="structureAdoptDialog.highRisk ? '该候选风险偏高，采用前必须填写原因。' : '采用后会成为当前正式结构资产，并按规则让下游候选过期。'"
        :type="structureAdoptDialog.highRisk ? 'warning' : 'info'"
        show-icon
        :closable="false"
      />
      <el-input
        v-model="structureAdoptDialog.reason"
        class="reason-input"
        type="textarea"
        :rows="4"
        :placeholder="structureAdoptDialog.highRisk ? '请说明为什么仍采用高风险候选' : '填写采用理由，便于后续复盘'"
      />
      <template #footer>
        <el-button @click="structureAdoptDialog.open = false">取消</el-button>
        <el-button type="primary" :loading="structureAdoptingId === structureAdoptDialog.assetId" @click="confirmStructureAdopt">确认采用</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="fuseDialog.open" title="融合所选方向" width="620px">
      <el-alert
        title="融合会生成一个新的方向候选，不会自动采用，也不会覆盖现有候选。"
        type="info"
        show-icon
        :closable="false"
      />
      <div class="dialog-section">
        <span class="muted">已选择候选</span>
        <ul class="compact-list">
          <li v-for="candidate in selectedDirectionCandidates" :key="candidate.id">{{ candidate.title }} · {{ candidate.versionLabel }}</li>
        </ul>
      </div>
      <el-input
        v-model="fuseDialog.reason"
        class="reason-input"
        type="textarea"
        :rows="4"
        placeholder="告诉 AI 融合重点，例如：保留重生复仇爽点，弱化商业术语，增强前三秒钩子和短视频节奏"
      />
      <p class="muted">融合完成后会回到候选池，请对比新候选，再决定是否采用为正式方向。</p>
      <template #footer>
        <el-button @click="fuseDialog.open = false">取消</el-button>
        <el-button type="primary" :loading="fusing" @click="confirmFuseDirections">生成融合候选</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="optimizeDialog.open" title="按要求优化方向" width="620px">
      <el-alert
        title="优化会基于当前候选生成一个新候选，不会直接修改或采用原候选。"
        type="info"
        show-icon
        :closable="false"
      />
      <div v-if="optimizeDialog.candidate" class="dialog-section">
        <span class="muted">当前候选</span>
        <strong>{{ optimizeDialog.candidate.title }}</strong>
        <p>{{ optimizeDialog.candidate.logline }}</p>
      </div>
      <el-input
        v-model="optimizeDialog.instruction"
        class="reason-input"
        type="textarea"
        :rows="5"
        placeholder="必须填写优化目标，例如：开头压迫感更强；主角反击更快；减少商业术语；增强女频情绪；改成更适合短视频前三秒"
      />
      <template #footer>
        <el-button @click="optimizeDialog.open = false">取消</el-button>
        <el-button type="primary" :disabled="!optimizeDialog.instruction.trim()" :loading="optimizingId === optimizeDialog.candidate?.id" @click="confirmOptimizeDirection">生成优化候选</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="directionDetailDialog.open" title="方向候选详情" width="660px">
      <template v-if="directionDetailDialog.candidate">
        <div class="dialog-section">
          <h3>{{ directionDetailDialog.candidate.title }}</h3>
          <div class="tag-row">
            <el-tag effect="plain">{{ directionDetailDialog.candidate.versionLabel }}</el-tag>
            <el-tag effect="plain">评分 {{ directionDetailDialog.candidate.scoreText }}</el-tag>
            <el-tag effect="plain">{{ directionDetailDialog.candidate.riskLevelText }}</el-tag>
          </div>
        </div>
        <dl class="detail-dl">
          <dt>一句话方向</dt>
          <dd>{{ directionDetailDialog.candidate.logline }}</dd>
          <dt>前三秒钩子</dt>
          <dd>{{ directionDetailDialog.candidate.coreHook }}</dd>
          <dt>推荐理由</dt>
          <dd>{{ directionDetailDialog.candidate.primaryReason }}</dd>
          <dt>视频化表达</dt>
          <dd>{{ directionDetailDialog.candidate.videoPotential }}</dd>
        </dl>
        <el-alert
          title="如果方向不准，先点击“按要求优化”写清楚想改哪里；如果两个以上候选各有优点，再勾选后融合。最终只有“采用”才会进入小说设定。"
          type="info"
          show-icon
          :closable="false"
        />
      </template>
      <template #footer>
        <el-button @click="directionDetailDialog.open = false">关闭</el-button>
        <el-button v-if="directionDetailDialog.candidate" @click="openEditDirectionDialog(directionDetailDialog.candidate)">编辑</el-button>
        <el-button v-if="directionDetailDialog.candidate" @click="openOptimizeDialog(directionDetailDialog.candidate)">按要求优化</el-button>
        <el-button v-if="directionDetailDialog.candidate" type="primary" :disabled="!directionDetailDialog.candidate.canAdopt" @click="openAdoptDialog(directionDetailDialog.candidate)">采用</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editDirectionDialog.open" title="编辑方向候选" width="720px">
      <el-alert
        title="保存后会生成一个新的方向候选版本，不会覆盖原候选，也不会自动采用。"
        type="info"
        show-icon
        :closable="false"
      />
      <div class="edit-form-grid">
        <label>
          <span>标题</span>
          <el-input v-model="editDirectionDialog.form.title" maxlength="120" show-word-limit />
        </label>
        <label>
          <span>一句话方向</span>
          <el-input v-model="editDirectionDialog.form.logline" type="textarea" :rows="2" maxlength="300" show-word-limit />
        </label>
        <label>
          <span>前三秒钩子</span>
          <el-input v-model="editDirectionDialog.form.coreHook" type="textarea" :rows="2" maxlength="300" show-word-limit />
        </label>
        <label>
          <span>目标读者</span>
          <el-input v-model="editDirectionDialog.form.audienceAppeal" type="textarea" :rows="2" maxlength="300" show-word-limit />
        </label>
        <label>
          <span>视频化表达</span>
          <el-input v-model="editDirectionDialog.form.videoPotential" type="textarea" :rows="2" maxlength="300" show-word-limit />
        </label>
        <label>
          <span>卖点（每行一个）</span>
          <el-input v-model="editDirectionDialog.form.sellingPointsText" type="textarea" :rows="3" />
        </label>
        <label>
          <span>风险标签（每行一个，可为空）</span>
          <el-input v-model="editDirectionDialog.form.riskTagsText" type="textarea" :rows="2" />
        </label>
        <label>
          <span>推荐理由</span>
          <el-input v-model="editDirectionDialog.form.recommendation" type="textarea" :rows="2" maxlength="300" show-word-limit />
        </label>
        <label>
          <span>编辑原因</span>
          <el-input v-model="editDirectionDialog.form.reason" type="textarea" :rows="2" maxlength="500" show-word-limit />
        </label>
      </div>
      <template #footer>
        <el-button @click="editDirectionDialog.open = false">取消</el-button>
        <el-button type="primary" :disabled="!canSubmitDirectionEdit" :loading="editingDirectionId === editDirectionDialog.candidate?.id" @click="confirmEditDirection">保存为新候选</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editStructureDialog.open" :title="`编辑${editStructureDialog.asset?.typeText || '结构'}候选`" width="720px">
      <el-alert
        title="保存后会生成一个新的结构候选版本，不会覆盖原候选，也不会自动采用。"
        type="info"
        show-icon
        :closable="false"
      />
      <div class="edit-form-grid">
        <label>
          <span>标题</span>
          <el-input v-model="editStructureDialog.form.title" maxlength="160" show-word-limit />
        </label>
        <label>
          <span>摘要</span>
          <el-input v-model="editStructureDialog.form.summary" type="textarea" :rows="3" maxlength="1000" show-word-limit />
        </label>
        <label>
          <span>结构标题</span>
          <el-input v-model="editStructureDialog.form.sectionTitle" maxlength="160" show-word-limit />
        </label>
        <label>
          <span>结构内容</span>
          <el-input v-model="editStructureDialog.form.sectionBody" type="textarea" :rows="6" maxlength="4000" show-word-limit />
        </label>
        <label>
          <span>结构要点（每行一个）</span>
          <el-input v-model="editStructureDialog.form.sectionItemsText" type="textarea" :rows="3" />
        </label>
        <label>
          <span>风险标签（每行一个，可为空）</span>
          <el-input v-model="editStructureDialog.form.riskTagsText" type="textarea" :rows="2" />
        </label>
        <label>
          <span>推荐理由</span>
          <el-input v-model="editStructureDialog.form.recommendation" type="textarea" :rows="2" maxlength="1000" show-word-limit />
        </label>
        <label>
          <span>编辑原因</span>
          <el-input v-model="editStructureDialog.form.reason" type="textarea" :rows="2" maxlength="500" show-word-limit />
        </label>
      </div>
      <template #footer>
        <el-button @click="editStructureDialog.open = false">取消</el-button>
        <el-button type="primary" :disabled="!canSubmitStructureEdit" :loading="editingStructureId === editStructureDialog.asset?.id" @click="confirmEditStructure">保存为新候选</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="structureOptimizeDialog.open" :title="`继续优化${structureOptimizeDialog.asset?.typeText || '结构'}候选`" width="620px">
      <el-alert
        title="优化会生成一个新的结构候选，不会覆盖当前候选，也不会自动采用。"
        type="info"
        show-icon
        :closable="false"
      />
      <div v-if="structureOptimizeDialog.asset" class="dialog-section">
        <span class="muted">当前候选</span>
        <strong>{{ structureOptimizeDialog.asset.title }}</strong>
        <p>{{ structureOptimizeDialog.asset.summary }}</p>
      </div>
      <el-input
        v-model="structureOptimizeDialog.instruction"
        class="reason-input"
        type="textarea"
        :rows="5"
        placeholder="必须填写优化目标，例如：强化阶段冲突；减少系统万能感；把结局伏笔提前；增强短视频前三秒钩子"
      />
      <template #footer>
        <el-button @click="structureOptimizeDialog.open = false">取消</el-button>
        <el-button type="primary" :disabled="!structureOptimizeDialog.instruction.trim()" :loading="structureGeneratingType === structureOptimizeDialog.asset?.objectType" @click="confirmStructureOptimize">生成优化候选</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="taskDrawer.open" title="任务详情" size="540px">
      <div class="drawer-stack">
        <el-alert v-if="taskDrawer.error" :title="taskDrawer.error" type="error" show-icon :closable="false" />
        <TaskProgressPanel
          :detail="taskDrawer.task"
          :loading="taskDrawer.loading"
          :action-loading="taskDrawer.actionLoading"
          @refresh="loadTaskDrawer"
          @view-result="openTaskResult"
          @retry="handleRetryTask"
          @cancel="handleCancelTask"
        />
      </div>
    </el-drawer>

    <el-drawer v-model="trialContentDrawer.open" :title="trialContentDrawer.title" size="620px">
      <div class="drawer-stack">
        <p v-for="paragraph in trialContentParagraphs" :key="paragraph" class="novel-text">{{ paragraph }}</p>
      </div>
    </el-drawer>

    <el-drawer v-model="bodySummaryDrawer.open" title="批次总结" size="620px">
      <div class="drawer-stack">
        <el-empty v-if="!latestBodyBatch" description="暂无批次总结" />
        <template v-else>
          <el-alert :title="latestBodyBatch.summary.conclusion" :type="latestBodyBatch.status === 'paused' ? 'warning' : 'success'" show-icon :closable="false" />
          <el-descriptions border :column="1">
            <el-descriptions-item label="风险趋势">{{ latestBodyBatch.summary.riskTrend }}</el-descriptions-item>
            <el-descriptions-item label="下一批注意事项">{{ latestBodyBatch.summary.nextBatchNotes.join('；') }}</el-descriptions-item>
          </el-descriptions>
          <el-table :data="latestBodyBatch.summary.chapterResults" border>
            <el-table-column prop="chapterNo" label="章序" width="80" />
            <el-table-column prop="title" label="章节" min-width="180" />
            <el-table-column prop="statusText" label="结果" width="110" />
            <el-table-column prop="score" label="评分" width="90" />
            <el-table-column label="操作" width="110">
              <template #default="{ row }">
                <el-button size="small" @click="router.push(`/novels/${novelId}/chapters/${row.chapterId}`)">章节详情</el-button>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </div>
    </el-drawer>

    <el-dialog v-model="trialConfirmDialog.open" title="确认试写结果" width="560px">
      <el-alert
        :title="trialConfirmDialog.requiresRisk ? '本次试写存在低分或风险，继续前必须填写原因。' : '确认后会生成正文策略快照，供后续批量正文任务使用。'"
        :type="trialConfirmDialog.requiresRisk ? 'warning' : 'info'"
        show-icon
        :closable="false"
      />
      <el-input
        v-model="trialConfirmDialog.reason"
        class="reason-input"
        type="textarea"
        :rows="4"
        :placeholder="trialConfirmDialog.requiresRisk ? '请说明为什么仍确认风险继续' : '可填写确认理由'"
      />
      <template #footer>
        <el-button @click="trialConfirmDialog.open = false">取消</el-button>
        <el-button type="primary" :loading="confirmingTrial" @click="confirmTrialResult">确认</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { NovelCreationStage, StageStatus, TaskStatus, VersionStatus, type StructureAssetType, type TaskDetailDTO } from '@ai-shortvideo/shared'
import { ApiClientError } from '../shared/services/http'
import TaskProgressPanel from '../modules/novels/components/TaskProgressPanel.vue'
import {
  adoptChapterPlan,
  adoptDirection,
  adoptOutline,
  adoptSetting,
  adoptStageOutline,
  confirmCompletion,
  confirmVideoReadiness,
  editDirectionCandidate,
  editStructureAsset,
  fuseDirections,
  forcePassFullReview,
  generateBodyBatch,
  generateChapterPlan,
  generateDirections,
  generateOutline,
  generateSetting,
  generateStageOutline,
  generateTrial,
  getNovelDetail,
  optimizeDirection,
  recheckVideoReadiness,
  resolveFullReviewIssue,
  startFullReview,
  confirmTrial as confirmTrialApi,
  toDirectionCandidateRow,
  toNovelChapterPlanRow,
  toStructureAssetRow,
  toTrialCandidateRow,
  toTrialChapterResultRow,
  updateChapterWordTargets,
} from '../modules/novels/services/novelService'
import { cancelTask as cancelGenerationTask, getTaskDetail, retryTask as retryGenerationTask } from '../modules/novels/services/taskService'
import type { DirectionCandidateRow, StructureAssetRow, TrialCandidateRow } from '../modules/novels/model/novelTypes'
import {
  canInteractWithSubStep,
  createNovelActionPendingTask,
  createLocalPendingTaskDetail,
  getDirectionDraftSubStepState,
  getVideoReadyEntryAction,
  getWorkbenchStepLockedReason,
  resolveNovelWorkbenchLocation,
  resolveTaskSummaryForAction,
  resolveVisibleTaskSummary,
  shouldShowTrialAuthoringAction,
  shouldShowTrialCandidateAction,
  shouldShowTrialReviewConfirmAction,
  type LocalPendingTaskSummary,
  type NovelLongRunningAction,
  type NovelWorkbenchMode,
  type NovelWorkbenchStepState,
  type NovelWorkbenchStepKey,
} from '../modules/novels/model/novelDetailView'
import {
  formatHighRiskConfirmationMessage,
  normalizeConfirmationReason,
  type HighRiskConfirmationDetail,
} from '../modules/novels/model/highRiskConfirmation'
import type { NovelDetailDTO } from '@ai-shortvideo/shared'

const route = useRoute()
const router = useRouter()
const novelId = computed(() => String(route.params.novelId || ''))
const LOCAL_PENDING_TASK_STORAGE_PREFIX = 'ai-shortvideo:novel-pending-task:'
const LOCAL_PENDING_TASK_MAX_AGE_MS = 30 * 60 * 1000
const detail = ref<NovelDetailDTO | null>(null)
const loading = ref(false)
const generatingDirection = ref(false)
const fusing = ref(false)
const optimizingId = ref('')
const editingDirectionId = ref('')
const editingStructureId = ref('')
const adoptingDirectionId = ref('')
const structureGeneratingType = ref('')
const structureAdoptingId = ref('')
const generatingTrial = ref(false)
const generatingBodyBatch = ref(false)
const startingFullReview = ref(false)
const confirmingCompletion = ref(false)
const recheckingVideoReadiness = ref(false)
const confirmingVideoReady = ref(false)
const resolvingFullReviewIssueId = ref('')
const selectingTrialCandidateId = ref('')
const confirmingTrial = ref(false)
const apiError = ref('')
const selectedCandidateIds = ref<string[]>([])
const focusedStructureCandidateId = ref('')
const bodyBatchIdempotencyKey = ref('')
const batchWordTarget = ref(2200)
const updatingChapterWordTargets = ref(false)
const fuseDialog = reactive({
  open: false,
  reason: '',
})
const optimizeDialog = reactive<{
  open: boolean
  candidate: DirectionCandidateRow | null
  instruction: string
}>({
  open: false,
  candidate: null,
  instruction: '',
})
const directionDetailDialog = reactive<{
  open: boolean
  candidate: DirectionCandidateRow | null
}>({
  open: false,
  candidate: null,
})
const editDirectionDialog = reactive<{
  open: boolean
  candidate: DirectionCandidateRow | null
  form: {
    title: string
    logline: string
    coreHook: string
    audienceAppeal: string
    videoPotential: string
    sellingPointsText: string
    riskTagsText: string
    recommendation: string
    reason: string
  }
}>({
  open: false,
  candidate: null,
  form: {
    title: '',
    logline: '',
    coreHook: '',
    audienceAppeal: '',
    videoPotential: '',
    sellingPointsText: '',
    riskTagsText: '',
    recommendation: '',
    reason: '',
  },
})
const editStructureDialog = reactive<{
  open: boolean
  asset: StructureAssetRow | null
  form: {
    title: string
    summary: string
    sectionTitle: string
    sectionBody: string
    sectionItemsText: string
    riskTagsText: string
    recommendation: string
    reason: string
  }
}>({
  open: false,
  asset: null,
  form: {
    title: '',
    summary: '',
    sectionTitle: '',
    sectionBody: '',
    sectionItemsText: '',
    riskTagsText: '',
    recommendation: '',
    reason: '',
  },
})
const structureOptimizeDialog = reactive<{
  open: boolean
  asset: StructureAssetRow | null
  instruction: string
}>({
  open: false,
  asset: null,
  instruction: '',
})
const adoptDialog = reactive({
  open: false,
  candidateId: '',
  lowScore: false,
  reason: '',
})
const structureAdoptDialog = reactive({
  open: false,
  assetId: '',
  objectType: 'setting' as StructureAssetType,
  highRisk: false,
  reason: '',
})
const taskDrawer = reactive({
  open: false,
  taskId: '',
  task: null as TaskDetailDTO | null,
  loading: false,
  actionLoading: false,
  error: '',
})
const pendingTask = ref<LocalPendingTaskSummary | null>(null)
const trialContentDrawer = reactive({
  open: false,
  title: '',
  content: '',
})
const trialConfirmDialog = reactive({
  open: false,
  requiresRisk: false,
  reason: '',
})
const bodySummaryDrawer = reactive({
  open: false,
})
let taskPollTimer: ReturnType<typeof window.setInterval> | undefined

type StepState = NovelWorkbenchStepState

interface SubStepView {
  key: string
  name: string
  hint: string
  state: StepState
  stateText: string
  tagType: '' | 'success' | 'warning' | 'danger' | 'info'
}

interface WorkbenchStepView {
  key: NovelWorkbenchStepKey
  name: string
  description: string
  gateText: string
  nextAction: string
  disabledReason: string
  primaryActionLabel: string
  primaryAction: (() => unknown) | null
  primaryLoading: boolean
  primaryDisabled: boolean
  progress: number
  progressText: string
  state: StepState
  stateText: string
  tagType: '' | 'success' | 'warning' | 'danger' | 'info'
  subSteps: SubStepView[]
}

const workbenchMode = ref<NovelWorkbenchMode>('overview')
const activeStepKey = ref<NovelWorkbenchStepKey>('direction')
const activeSubStepKey = ref('')

const directionRows = computed(() => (detail.value?.directionCandidates ?? []).map(toDirectionCandidateRow))
const selectedDirectionCandidates = computed(() => directionRows.value.filter((candidate) => selectedCandidateIds.value.includes(candidate.id)))
const structureRows = computed(() => (detail.value?.structureCandidates ?? []).map(toStructureAssetRow))
const settingRows = computed(() => structureRows.value.filter((asset) => asset.objectType === 'setting'))
const outlineRows = computed(() => structureRows.value.filter((asset) => asset.objectType === 'outline' || asset.objectType === 'stage_outline'))
const fullOutlineRows = computed(() => structureRows.value.filter((asset) => asset.objectType === 'outline'))
const stageOutlineRows = computed(() => structureRows.value.filter((asset) => asset.objectType === 'stage_outline'))
const visibleOutlineRows = computed(() => (activeSubStep.value.key === 'stages' ? stageOutlineRows.value : fullOutlineRows.value))
const chapterPlanRows = computed(() => structureRows.value.filter((asset) => asset.objectType === 'chapter_plan'))
const chapterRows = computed(() => (detail.value?.chapters ?? []).map(toNovelChapterPlanRow))
const chapterWordTargetSummary = computed(() => {
  const numericTargets = (detail.value?.chapters ?? []).map((chapter) => chapter.wordTarget ?? 0).filter((target) => target > 0)
  const average = numericTargets.length ? Math.round(numericTargets.reduce((sum, target) => sum + target, 0) / numericTargets.length) : 0
  const total = numericTargets.reduce((sum, target) => sum + target, 0)
  return { average, total }
})
const trialCandidateRows = computed(() => (detail.value?.latestTrialRun?.chapterOneCandidates ?? []).map(toTrialCandidateRow))
const trialChapterResultRows = computed(() => (detail.value?.latestTrialRun?.chapterResults ?? []).map(toTrialChapterResultRow))
const selectingTrialCandidate = computed(() => trialCandidateRows.value.find((candidate) => candidate.id === selectingTrialCandidateId.value) ?? null)
const trialFollowupPendingTitle = computed(() => {
  const candidateTitle = selectingTrialCandidate.value?.title
  return candidateTitle
    ? `已选择「${candidateTitle}」，正在生成第 2-3 章和试写总评。`
    : '已选择第 1 章候选，正在生成第 2-3 章和试写总评。'
})
const trialContentParagraphs = computed(() => trialContentDrawer.content.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean))
const bodyGeneration = computed(() => detail.value?.bodyGeneration ?? null)
const latestBodyBatch = computed(() => bodyGeneration.value?.latestBatch ?? null)
const latestFullReview = computed(() => detail.value?.latestFullReview ?? null)
const videoReadiness = computed(() => detail.value?.videoReadiness ?? null)
const videoReadyEntryAction = computed(() => getVideoReadyEntryAction(detail.value))
const showTrialAuthoringActions = computed(() => shouldShowTrialAuthoringAction(detail.value))
const showTrialReviewConfirmAction = computed(() => shouldShowTrialReviewConfirmAction(detail.value))
const canStartBodyBatch = computed(() => Boolean(
  bodyGeneration.value?.strategySnapshot &&
  bodyGeneration.value.nextBatchRange.startChapterNo &&
  bodyGeneration.value.nextBatchRange.endChapterNo &&
  !bodyGeneration.value.recommendedAction.disabled &&
  bodyGeneration.value.openImpactCases.length === 0,
))
const canStartFullReview = computed(() => detail.value?.creationStage === NovelCreationStage.Body && detail.value.stageStatus === StageStatus.Completed)
const canConfirmCompletion = computed(() => Boolean(latestFullReview.value?.gate.allowCompletion && detail.value?.creationStage === NovelCreationStage.CompletionConfirm && detail.value.stageStatus === StageStatus.WaitingUser))
const canConfirmVideoReady = computed(() => Boolean(videoReadiness.value?.check && videoReadiness.value.status === 'candidate' && detail.value?.completionDecision))
const activeRecentTask = computed(() => resolveVisibleTaskSummary(pendingTask.value, detail.value))
const chapterPlanGenerationTask = computed(() => resolveTaskSummaryForAction(pendingTask.value, detail.value, 'chapter_plan_generate'))
const isChapterPlanGenerating = computed(() =>
  structureGeneratingType.value === 'chapter_plan' ||
  chapterPlanGenerationTask.value?.status === TaskStatus.Queued ||
  chapterPlanGenerationTask.value?.status === TaskStatus.Processing
)
const chapterPlanGenerationFailed = computed(() => chapterPlanGenerationTask.value?.status === TaskStatus.Failed)
const chapterPlanFailureReason = computed(() => chapterPlanGenerationTask.value?.errorMessage ?? chapterPlanGenerationTask.value?.currentStep ?? '')
const genreText = computed(() => detail.value?.genres.join('、') || '未选择题材')
watch(
  () => [chapterWordTargetSummary.value.average, detail.value?.preferences.chapterWordMin, detail.value?.preferences.chapterWordMax] as const,
  ([average, min = 1800, max = 2600]) => {
    if (updatingChapterWordTargets.value) return
    batchWordTarget.value = average || Math.round((min + max) / 2)
  },
  { immediate: true },
)
const canGenerateDirection = computed(() => {
  const stage = detail.value?.creationStage
  return !detail.value || stage === NovelCreationStage.Draft || stage === NovelCreationStage.Direction
})
const canGenerateSetting = computed(() => Boolean(detail.value?.currentAssets.direction))
const canGenerateOutline = computed(() => Boolean(detail.value?.currentAssets.setting))
const canGenerateStageOutline = computed(() => Boolean(detail.value?.currentAssets.outline))
const canGenerateChapterPlan = computed(() => Boolean(detail.value?.currentAssets.stageOutline))
const canGenerateTrial = computed(() => Boolean(detail.value?.currentAssets.chapterPlan) && detail.value?.creationStage === NovelCreationStage.Trial)
const pendingAction = computed(() => pendingTask.value?.action ?? '')
const hasLocalPendingWait = computed(() => Boolean(pendingTask.value && activeRecentTask.value?.id === pendingTask.value.id))
const settingGenerationPending = computed(() => isNovelActionRunning('setting_generate'))
watch(
  activeRecentTask,
  (task) => {
    if (!pendingTask.value || !task || task.id === pendingTask.value.id) return
    if ([TaskStatus.Completed, TaskStatus.WaitingConfirmation, TaskStatus.Failed, TaskStatus.Cancelled].includes(task.status as TaskStatus)) {
      clearLocalPendingTask(pendingTask.value.id)
    }
  },
  { immediate: true },
)
const canSubmitDirectionEdit = computed(() =>
  Boolean(editDirectionDialog.candidate) &&
  editDirectionDialog.form.title.trim().length > 0 &&
  editDirectionDialog.form.logline.trim().length > 0 &&
  editDirectionDialog.form.coreHook.trim().length > 0 &&
  editDirectionDialog.form.audienceAppeal.trim().length > 0 &&
  editDirectionDialog.form.videoPotential.trim().length > 0 &&
  splitTextLines(editDirectionDialog.form.sellingPointsText).length > 0 &&
  editDirectionDialog.form.recommendation.trim().length > 0 &&
  editDirectionDialog.form.reason.trim().length > 0
)
const canSubmitStructureEdit = computed(() =>
  Boolean(editStructureDialog.asset) &&
  editStructureDialog.form.title.trim().length > 0 &&
  editStructureDialog.form.summary.trim().length > 0 &&
  editStructureDialog.form.sectionTitle.trim().length > 0 &&
  editStructureDialog.form.sectionBody.trim().length > 0 &&
  editStructureDialog.form.recommendation.trim().length > 0 &&
  editStructureDialog.form.reason.trim().length > 0
)

function showTrialCandidateAction(candidate: TrialCandidateRow) {
  return shouldShowTrialCandidateAction(detail.value, candidate.canSelect)
}

function isCurrentStructureAsset(asset: StructureAssetRow) {
  return asset.statusKey === VersionStatus.Current
}

function isCandidateStructureAsset(asset: StructureAssetRow) {
  return asset.statusKey === VersionStatus.Candidate && asset.canAdopt
}

function isArchivedStructureAsset(asset: StructureAssetRow) {
  return !isCurrentStructureAsset(asset) && !isCandidateStructureAsset(asset)
}

const statusTagType = computed(() => {
  const status = detail.value?.creationStage
  if (status === NovelCreationStage.Trial) return 'success'
  if (status === NovelCreationStage.Setting || status === NovelCreationStage.Outline || status === NovelCreationStage.ChapterPlan) return 'success'
  if (status === NovelCreationStage.Direction) return 'warning'
  return 'info'
})
const primaryGenerateAction = computed(() => {
  if (!detail.value) {
    return {
      label: '生成方向',
      loading: generatingDirection.value || isNovelActionRunning('direction_generate'),
      disabled: hasLocalPendingWait.value,
      run: handleGenerateDirection,
    }
  }

  if (canGenerateDirection.value && !detail.value.currentAssets.direction) {
    return {
      label: '生成方向',
      loading: generatingDirection.value || isNovelActionRunning('direction_generate'),
      disabled: hasLocalPendingWait.value,
      run: handleGenerateDirection,
    }
  }

  if (detail.value.creationStage === NovelCreationStage.Setting && detail.value.stageStatus === StageStatus.NotStarted) {
    return {
      label: '生成设定',
      loading: structureGeneratingType.value === 'setting' || isNovelActionRunning('setting_generate'),
      disabled: !canGenerateSetting.value || hasLocalPendingWait.value,
      run: () => handleGenerateStructure('setting'),
    }
  }

  if (detail.value.creationStage === NovelCreationStage.Outline && detail.value.stageStatus === StageStatus.NotStarted && !detail.value.currentAssets.outline) {
    return {
      label: '生成全书大纲',
      loading: structureGeneratingType.value === 'outline' || isNovelActionRunning('outline_generate'),
      disabled: !canGenerateOutline.value || hasLocalPendingWait.value,
      run: () => handleGenerateStructure('outline'),
    }
  }

  if (detail.value.creationStage === NovelCreationStage.Outline && detail.value.stageStatus === StageStatus.NotStarted && detail.value.currentAssets.outline) {
    return {
      label: '生成阶段大纲',
      loading: structureGeneratingType.value === 'stage_outline' || isNovelActionRunning('stage_outline_generate'),
      disabled: !canGenerateStageOutline.value || hasLocalPendingWait.value,
      run: () => handleGenerateStructure('stage_outline'),
    }
  }

  if (detail.value.creationStage === NovelCreationStage.ChapterPlan && detail.value.stageStatus === StageStatus.NotStarted) {
    return {
      label: '生成章节目录',
      loading: structureGeneratingType.value === 'chapter_plan' || isNovelActionRunning('chapter_plan_generate'),
      disabled: !canGenerateChapterPlan.value || hasLocalPendingWait.value,
      run: () => handleGenerateStructure('chapter_plan'),
    }
  }

  if (detail.value.creationStage === NovelCreationStage.Trial && detail.value.stageStatus === StageStatus.NotStarted) {
    return {
      label: '生成试写',
      loading: generatingTrial.value || isNovelActionRunning('trial_generate'),
      disabled: !canGenerateTrial.value || hasLocalPendingWait.value,
      run: () => handleGenerateTrial(),
    }
  }

  if (detail.value.creationStage === NovelCreationStage.Body && detail.value.stageStatus !== StageStatus.Completed) {
    return {
      label: detail.value.bodyGeneration?.recommendedAction.label ?? '开始本批生成',
      loading: generatingBodyBatch.value,
      disabled: !canStartBodyBatch.value,
      run: handleGenerateBodyBatch,
    }
  }

  return null
})
const currentAssetCards = computed(() => {
  const assets = detail.value?.currentAssets

  return [
    {
      key: 'direction',
      label: '正式方向',
      title: assets?.direction?.title ?? '未采用',
      summary: assets?.direction?.summary ?? '先生成并采用一个小说方向。',
    },
    {
      key: 'setting',
      label: '正式设定',
      title: assets?.setting?.title ?? '未采用',
      summary: assets?.setting?.summary ?? '方向采用后生成设定。',
    },
    {
      key: 'outline',
      label: '全书大纲',
      title: assets?.outline?.title ?? '未采用',
      summary: assets?.outline?.summary ?? '设定采用后生成全书大纲。',
    },
    {
      key: 'stageOutline',
      label: '阶段大纲',
      title: assets?.stageOutline?.title ?? '未采用',
      summary: assets?.stageOutline?.summary ?? '全书大纲采用后生成阶段大纲。',
    },
    {
      key: 'chapterPlan',
      label: '章节目录',
      title: assets?.chapterPlan?.title ?? '未采用',
      summary: assets?.chapterPlan?.summary ?? '阶段大纲采用后生成章节目录。',
    },
  ]
})

const workbenchSteps = computed<WorkbenchStepView[]>(() => {
  const assets = detail.value?.currentAssets
  const hasDirection = Boolean(assets?.direction)
  const hasSetting = Boolean(assets?.setting)
  const hasOutline = Boolean(assets?.outline)
  const hasStageOutline = Boolean(assets?.stageOutline)
  const hasStageOutlineCandidate = stageOutlineRows.value.some(isCandidateStructureAsset)
  const hasChapterPlan = Boolean(assets?.chapterPlan)
  const hasTrialStrategy = Boolean(detail.value?.bodyStrategySnapshot)
  const hasBodyReady = Boolean(
    detail.value?.creationStage === NovelCreationStage.FullReview ||
    detail.value?.creationStage === NovelCreationStage.CompletionConfirm ||
    detail.value?.creationStage === NovelCreationStage.VideoReady ||
    (detail.value?.creationStage === NovelCreationStage.Body && detail.value.stageStatus === StageStatus.Completed),
  )
  const hasCompletion = Boolean(detail.value?.completionDecision)
  const hasVideoReady = detail.value?.creationStage === NovelCreationStage.VideoReady
  const hasVideoReadinessCandidate = hasCompletion && Boolean(videoReadiness.value)

  return [
    createStep({
      key: 'direction',
      name: '方向确认',
      description: '确认题材卖点、目标读者、前三秒钩子和视频化表达。',
      gateText: '采用一个正式方向后，小说设定才会解锁。',
      nextAction: hasDirection ? '方向已确认，可进入小说设定。' : directionRows.value.length > 0 ? '比较候选，必要时优化后采用。' : '先生成 3-5 个方向候选。',
      primaryActionLabel: directionRows.value.length > 0 ? '处理方向候选' : '生成方向候选',
      primaryAction: directionRows.value.length > 0 ? null : handleGenerateDirection,
      primaryLoading: generatingDirection.value || isNovelActionRunning('direction_generate'),
      primaryDisabled: hasLocalPendingWait.value,
      state: stateWithIssue(hasDirection ? 'done' : 'active', [NovelCreationStage.Draft, NovelCreationStage.Direction]),
      progress: hasDirection ? 100 : directionRows.value.length > 0 ? 70 : 20,
      subSteps: createSubSteps([
        ['draft', '草稿输入', '整理初始方向', getDirectionDraftSubStepState({ hasDirection, hasCandidates: directionRows.value.length > 0 })],
        ['candidates', '候选生成', '生成并比较方向候选', directionRows.value.length > 0 || hasDirection],
        ['edit', '编辑优化', '手动微调或 AI 优化', hasDirection ? true : directionRows.value.length > 0 ? 'active' : false],
        ['adopt', '采用确认', '记录原因并成为正式方向', hasDirection],
      ]),
    }),
    createStep({
      key: 'setting',
      name: '小说设定',
      description: '沉淀人物、世界观、爽点规则和安全边界。',
      gateText: hasSetting ? '正式设定已采用，后续大纲可使用该事实源。' : hasDirection ? '生成并采用正式设定后，大纲设计才会解锁。' : '需要先采用正式方向。',
      nextAction: hasSetting ? '设定已成为事实源。' : hasDirection ? '生成设定候选，并确认采用。' : '先完成方向确认。',
      primaryActionLabel: '生成设定',
      primaryAction: () => handleGenerateStructure('setting'),
      primaryLoading: structureGeneratingType.value === 'setting' || isNovelActionRunning('setting_generate'),
      primaryDisabled: !canGenerateSetting.value || hasLocalPendingWait.value,
      state: stateWithIssue(hasSetting ? 'done' : hasDirection ? 'active' : 'locked', [NovelCreationStage.Setting]),
      progress: hasSetting ? 100 : hasDirection ? 38 : 0,
      subSteps: createSubSteps([
        ['characters', '人物设定', '主角、反派与人物关系', hasSetting ? true : hasDirection ? 'active' : false],
        ['world', '世界规则', '时代背景、技术边界和限制', hasSetting],
        ['appeal', '爽点禁忌', '爽点规则与风险边界', hasSetting],
        ['adopt', '采用确认', '成为后续大纲事实源', hasSetting],
      ]),
    }),
    createStep({
      key: 'outline',
      name: '大纲设计',
      description: '规划全书主线、阶段目标、反转和节奏。',
      gateText: hasStageOutline ? '阶段大纲已采用，下一步进入章节目录规划。' : hasStageOutlineCandidate ? '阶段大纲候选已生成，请查看后采用。' : hasOutline ? '需要采用阶段大纲，才会进入章节目录规划。' : '需要先采用小说设定。',
      nextAction: hasStageOutline ? '全书大纲和阶段大纲已确认。' : hasStageOutlineCandidate ? '查看阶段大纲候选，确认是否采用。' : hasOutline ? '生成并采用阶段大纲。' : hasSetting ? '生成全书大纲并采用。' : '先完成小说设定。',
      primaryActionLabel: hasStageOutlineCandidate ? '查看阶段大纲候选' : hasOutline ? '生成阶段大纲' : '生成全书大纲',
      primaryAction: hasStageOutlineCandidate ? () => setActiveSubStep('stages') : () => handleGenerateStructure(hasOutline ? 'stage_outline' : 'outline'),
      primaryLoading: structureGeneratingType.value === 'outline' || structureGeneratingType.value === 'stage_outline' || isNovelActionRunning('outline_generate') || isNovelActionRunning('stage_outline_generate'),
      primaryDisabled: hasStageOutlineCandidate ? false : hasLocalPendingWait.value || (hasOutline ? !canGenerateStageOutline.value : !canGenerateOutline.value),
      state: stateWithIssue(hasStageOutline ? 'done' : hasSetting ? 'active' : 'locked', [NovelCreationStage.Outline]),
      progress: hasStageOutline ? 100 : hasStageOutlineCandidate ? 78 : hasOutline ? 62 : hasSetting ? 28 : 0,
      subSteps: createSubSteps([
        ['mainline', '全书主线', '主线、终局和关键转折', hasStageOutline || hasOutline ? true : hasSetting ? 'active' : false],
        ['stages', '阶段大纲', '阶段目标与冲突推进', hasStageOutline ? true : hasOutline ? 'active' : false],
        ['rhythm', '节奏检查', '爽点密度和反转节奏', hasStageOutline],
        ['adopt', '采用确认', '进入章节目录规划', hasStageOutline],
      ]),
    }),
    createStep({
      key: 'chapterPlan',
      name: '章节目录',
      description: '确认章节标题、摘要、目标字数和每章钩子。',
      gateText: hasChapterPlan ? '章节目录已采用，试写调试已解锁。' : hasStageOutline ? '生成并采用章节目录后，试写调试才会解锁。' : '需要先采用全书大纲和阶段大纲。',
      nextAction: hasChapterPlan ? '章节计划已创建。' : hasStageOutline ? '生成并采用章节目录。' : '先完成大纲设计。',
      primaryActionLabel: '生成章节目录',
      primaryAction: () => handleGenerateStructure('chapter_plan'),
      primaryLoading: structureGeneratingType.value === 'chapter_plan' || isNovelActionRunning('chapter_plan_generate'),
      primaryDisabled: !canGenerateChapterPlan.value || hasLocalPendingWait.value,
      state: stateWithIssue(hasChapterPlan ? 'done' : hasStageOutline ? 'active' : 'locked', [NovelCreationStage.ChapterPlan]),
      progress: hasChapterPlan ? 100 : hasStageOutline ? 36 : 0,
      subSteps: createSubSteps([
        ['table', '章节表', '标题、顺序和阶段归属', hasChapterPlan ? true : hasStageOutline ? 'active' : false],
        ['summary', '单章摘要', '目标字数与章节钩子', hasChapterPlan],
        ['batchAdjust', '批量调整', '节奏、字数和顺序调整', hasChapterPlan],
        ['adopt', '采用目录', '进入试写调试', hasChapterPlan],
      ]),
    }),
    createStep({
      key: 'trial',
      name: '试写调试',
      description: '先试写 1-3 章，确认文风、爽点和可持续性。',
      gateText: hasTrialStrategy ? '试写策略快照已生成，批量正文已解锁。' : hasChapterPlan ? '完成第 1-3 章试写并确认总评后，批量正文才会解锁。' : '需要先采用章节目录。',
      nextAction: hasTrialStrategy ? '试写策略已确认。' : hasChapterPlan ? '生成第 1 章候选，并继续 2-3 章试写。' : '先确认章节目录。',
      primaryActionLabel: '生成试写',
      primaryAction: () => handleGenerateTrial(),
      primaryLoading: generatingTrial.value || isNovelActionRunning('trial_generate'),
      primaryDisabled: !canGenerateTrial.value || hasLocalPendingWait.value,
      state: stateWithIssue(hasTrialStrategy ? 'done' : hasChapterPlan ? 'active' : 'locked', [NovelCreationStage.Trial]),
      progress: hasTrialStrategy ? 100 : detail.value?.latestTrialRun?.trialReview ? 82 : detail.value?.latestTrialRun ? 52 : hasChapterPlan ? 20 : 0,
      subSteps: createSubSteps([
        ['chapterOne', '第 1 章候选', '默认 3 个开篇候选', hasTrialStrategy || Boolean(detail.value?.latestTrialRun) ? true : hasChapterPlan ? 'active' : false],
        ['continue', '2-3 章试写', '检查连续性和文风稳定性', hasTrialStrategy || trialChapterResultRows.value.length > 1],
        ['review', '试写总评', '评分、风险和继续建议', hasTrialStrategy || Boolean(detail.value?.latestTrialRun?.trialReview)],
        ['strategy', '策略快照', '进入批量正文的生成策略', hasTrialStrategy],
      ]),
    }),
    createStep({
      key: 'body',
      name: '批量正文',
      description: '按批次生成正文，处理失败章节、重写和影响评估。',
      gateText: hasBodyReady ? '正文批量生成已完成，全书质检已解锁。' : hasTrialStrategy ? '完成全部正文批次后，全书质检才会解锁。' : '需要先确认试写策略快照。',
      nextAction: hasBodyReady ? '正文已进入后续质检阶段。' : hasTrialStrategy ? bodyGeneration.value?.recommendedAction.reasonText ?? '生成下一批正文。' : '先确认试写策略快照。',
      primaryActionLabel: bodyGeneration.value?.recommendedAction.label ?? '开始本批生成',
      primaryAction: handleGenerateBodyBatch,
      primaryLoading: generatingBodyBatch.value || isNovelActionRunning('body_batch_generate'),
      primaryDisabled: !canStartBodyBatch.value || hasLocalPendingWait.value,
      state: stateWithIssue(hasBodyReady ? 'done' : hasTrialStrategy ? 'active' : 'locked', [NovelCreationStage.Body]),
      progress: hasBodyReady ? 100 : hasTrialStrategy ? Math.max(32, detail.value?.chapterProgress.completedChapterCount ? 58 : 32) : 0,
      subSteps: createSubSteps([
        ['generate', '批量生成', '按批生成章节正文', hasBodyReady || Boolean(latestBodyBatch.value) ? true : hasTrialStrategy ? 'active' : false],
        ['issues', '章节问题', '失败、低分和待处理章节', hasBodyReady || Boolean(latestBodyBatch.value)],
        ['impact', '重写影响', '章节重写后的影响范围', hasBodyReady || Boolean(bodyGeneration.value?.openImpactCases.length)],
        ['confirm', '批次确认', '确认正文进入全书质检', hasBodyReady],
      ]),
    }),
    createStep({
      key: 'fullReview',
      name: '全书质检',
      description: '检查全书质量、结构、风险和视频化准备度。',
      gateText: hasCompletion ? '小说完成确认已记录，待视频化检查已解锁。' : latestFullReview.value ? '处理阻塞问题或确认完成后，进入待视频化检查。' : '需要正文批量生成完成且无阻塞章节。',
      nextAction: hasCompletion ? '小说已完成确认。' : latestFullReview.value ? '处理 Top 问题并确认小说完成。' : hasBodyReady ? '发起全书 AI 审稿。' : '先完成批量正文。',
      primaryActionLabel: latestFullReview.value ? '确认小说完成' : '全书 AI 审稿',
      primaryAction: latestFullReview.value ? handleConfirmCompletion : handleStartFullReview,
      primaryLoading: latestFullReview.value ? confirmingCompletion.value : (startingFullReview.value || isNovelActionRunning('full_review')),
      primaryDisabled: hasLocalPendingWait.value || (latestFullReview.value ? !canConfirmCompletion.value : !canStartFullReview.value),
      state: stateWithIssue(hasCompletion ? 'done' : hasBodyReady || latestFullReview.value ? 'active' : 'locked', [NovelCreationStage.FullReview, NovelCreationStage.CompletionConfirm]),
      progress: hasCompletion ? 100 : latestFullReview.value ? 76 : hasBodyReady ? 30 : 0,
      subSteps: createSubSteps([
        ['summary', '总评', '综合分、评级和结论', hasCompletion || Boolean(latestFullReview.value) ? true : hasBodyReady ? 'active' : false],
        ['issues', 'Top 问题', '阻塞问题与处理入口', hasCompletion || Boolean(latestFullReview.value?.issues.length)],
        ['actions', '处理建议', '重写、接受风险或强制通过', hasCompletion || Boolean(latestFullReview.value)],
        ['confirm', '完成确认', '确认进入待视频化检查', hasCompletion],
      ]),
    }),
    createStep({
      key: 'videoReady',
      name: '待视频化',
      description: '形成视频引用快照和首条视频建议。',
      gateText: hasVideoReady ? '小说已进入待视频化，可被视频模块引用。' : hasVideoReadinessCandidate ? '确认后生成视频引用快照，小说进入待视频化。' : '需要全书质检通过或接受风险。',
      nextAction: hasVideoReady ? '小说已可被视频模块引用。' : hasVideoReadinessCandidate ? '确认进入待视频化，生成引用快照。' : '先完成小说完成确认。',
      primaryActionLabel: videoReadyEntryAction.value?.label ?? '确认进入待视频化',
      primaryAction: videoReadyEntryAction.value ? () => router.push(videoReadyEntryAction.value!.route) : handleConfirmVideoReady,
      primaryLoading: confirmingVideoReady.value || isNovelActionRunning('video_readiness_confirm'),
      primaryDisabled: videoReadyEntryAction.value ? false : !canConfirmVideoReady.value || hasLocalPendingWait.value,
      state: stateWithIssue(hasVideoReady ? 'done' : hasVideoReadinessCandidate ? 'active' : 'locked', [NovelCreationStage.VideoReady]),
      progress: hasVideoReady ? 100 : hasVideoReadinessCandidate ? 64 : 0,
      subSteps: createSubSteps([
        ['checks', '检查清单', '章节、风险和可引用范围', hasVideoReady || hasVideoReadinessCandidate ? true : false],
        ['suggestion', '视频建议', '首条短视频建议', hasVideoReady || Boolean(videoReadiness.value?.firstVideoSuggestion)],
        ['snapshot', '引用快照', '冻结小说版本供视频引用', hasVideoReady],
        ['videos', '去视频列表', '进入视频模块承接', hasVideoReady],
      ]),
    }),
  ]
})

const suggestedStepKey = computed<NovelWorkbenchStepKey>(() => workbenchSteps.value.find((step) => step.state === 'active' || step.state === 'issue' || step.state === 'ready')?.key ?? 'direction')
const suggestedStepName = computed(() => workbenchSteps.value.find((step) => step.key === suggestedStepKey.value)?.name ?? '当前步骤')
const activeStep = computed<WorkbenchStepView>(() => workbenchSteps.value.find((step) => step.key === activeStepKey.value) ?? workbenchSteps.value[0])
const activeSubStep = computed<SubStepView>(() => activeStep.value.subSteps.find((subStep) => subStep.key === activeSubStepKey.value) ?? activeStep.value.subSteps.find((subStep) => subStep.state === 'active' || subStep.state === 'ready') ?? activeStep.value.subSteps[0])

function createStep(input: Omit<WorkbenchStepView, 'stateText' | 'tagType' | 'progressText' | 'disabledReason'> & { disabledReason?: string }): WorkbenchStepView {
  const stateText = getStepStateText(input.state)
  return {
    ...input,
    disabledReason: input.primaryDisabled && input.state !== 'done' ? input.disabledReason || getWorkbenchStepLockedReason(input.key) : input.disabledReason ?? '',
    stateText,
    tagType: getStepTagType(input.state),
    progressText: stateText,
  }
}

function createSubSteps(items: Array<[string, string, string, boolean | StepState]>): SubStepView[] {
  return items.map(([key, name, hint, stateInput]) => {
    const state: StepState = stateInput === true ? 'done' : stateInput === false ? 'locked' : stateInput

    return {
      key,
      name,
      hint,
      state,
      stateText: getStepStateText(state),
      tagType: getStepTagType(state),
    }
  })
}

function stateWithIssue(baseState: StepState, activeStages: NovelCreationStage[]): StepState {
  if (!detail.value) return baseState
  if (!activeStages.includes(detail.value.creationStage)) return baseState
  if (detail.value.stageStatus === StageStatus.Blocked || detail.value.stageStatus === StageStatus.Failed) return 'issue'
  if (detail.value.stageStatus === StageStatus.WaitingUser) return baseState === 'locked' ? 'ready' : baseState
  return baseState
}

function getStepStateText(state: StepState) {
  if (state === 'done') return '已完成'
  if (state === 'active') return '当前处理'
  if (state === 'ready') return '待确认'
  if (state === 'issue') return '有问题'
  return '待解锁'
}

function getStepTagType(state: StepState): '' | 'success' | 'warning' | 'danger' | 'info' {
  if (state === 'done') return 'success'
  if (state === 'active' || state === 'ready') return 'warning'
  if (state === 'issue') return 'danger'
  return 'info'
}

function applyWorkbenchLocationFromRoute() {
  const location = resolveNovelWorkbenchLocation(route.query.step)
  workbenchMode.value = location.mode
  activeStepKey.value = location.stepKey
  if (location.mode === 'overview') {
    activeSubStepKey.value = ''
    return
  }
  syncActiveSubStep(location.stepKey)
}

function syncActiveSubStep(stepKey: NovelWorkbenchStepKey) {
  const step = workbenchSteps.value.find((item) => item.key === stepKey)
  const suggestedSubStep = step?.subSteps.find((subStep) => subStep.state === 'active' || subStep.state === 'ready') ?? step?.subSteps[0]
  activeSubStepKey.value = suggestedSubStep?.key ?? ''
}

function openStep(stepKey: NovelWorkbenchStepKey) {
  activeStepKey.value = stepKey
  syncActiveSubStep(stepKey)
  workbenchMode.value = 'step'
  router.push({
    path: route.path,
    query: {
      ...route.query,
      step: stepKey,
    },
  })
}

async function openTaskResult(stepKey: NovelWorkbenchStepKey) {
  taskDrawer.open = false
  openStep(stepKey)
  await nextTick()
  focusFirstResultCandidate(stepKey)
}

function focusFirstResultCandidate(stepKey: NovelWorkbenchStepKey) {
  const structureRowsByStep: Partial<Record<NovelWorkbenchStepKey, StructureAssetRow[]>> = {
    setting: settingRows.value,
    outline: outlineRows.value,
    chapterPlan: chapterPlanRows.value,
  }
  const firstStructure = structureRowsByStep[stepKey]?.[0]
  if (firstStructure) {
    focusStructureCandidate(firstStructure.id)
    return
  }

  const section = document.querySelector(`[data-result-section="${stepKey}"]`)
  section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function focusStructureCandidate(candidateId: string) {
  focusedStructureCandidateId.value = candidateId
  document.getElementById(`structure-candidate-${candidateId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  window.setTimeout(() => {
    if (focusedStructureCandidateId.value === candidateId) focusedStructureCandidateId.value = ''
  }, 2200)
}

function setActiveSubStep(subStepKey: string) {
  activeSubStepKey.value = subStepKey
}

function goOverview() {
  workbenchMode.value = 'overview'
  activeStepKey.value = suggestedStepKey.value
  activeSubStepKey.value = ''
  const { step, ...restQuery } = route.query
  router.push({
    path: route.path,
    query: restQuery,
  })
}

async function loadDetail(silent = false) {
  if (!silent) loading.value = true
  if (!silent) apiError.value = ''

  try {
    detail.value = await getNovelDetail(novelId.value)
    syncTaskPolling()
  } catch (error) {
    apiError.value = formatApiError(error)
  } finally {
    if (!silent) loading.value = false
  }
}

function getLocalPendingTaskStorageKey() {
  return `${LOCAL_PENDING_TASK_STORAGE_PREFIX}${novelId.value}`
}

function isStoredPendingTask(value: unknown): value is LocalPendingTaskSummary {
  if (!value || typeof value !== 'object') return false
  const task = value as Partial<LocalPendingTaskSummary>
  return (
    task.isLocalPending === true &&
    typeof task.id === 'string' &&
    typeof task.taskType === 'string' &&
    typeof task.action === 'string' &&
    typeof task.startedAt === 'string' &&
    typeof task.statusNote === 'string'
  )
}

function isPendingTaskFresh(task: LocalPendingTaskSummary) {
  const startedAt = Date.parse(task.startedAt)
  if (!Number.isFinite(startedAt)) return false
  return Date.now() - startedAt < LOCAL_PENDING_TASK_MAX_AGE_MS
}

function readStoredPendingTask(): LocalPendingTaskSummary | null {
  const rawValue = window.localStorage.getItem(getLocalPendingTaskStorageKey())
  if (!rawValue) return null

  try {
    const parsedValue: unknown = JSON.parse(rawValue)
    if (!isStoredPendingTask(parsedValue) || !isPendingTaskFresh(parsedValue)) {
      window.localStorage.removeItem(getLocalPendingTaskStorageKey())
      return null
    }
    return parsedValue
  } catch {
    window.localStorage.removeItem(getLocalPendingTaskStorageKey())
    return null
  }
}

function persistLocalPendingTask(task: LocalPendingTaskSummary) {
  window.localStorage.setItem(getLocalPendingTaskStorageKey(), JSON.stringify(task))
}

function restoreLocalPendingTask() {
  pendingTask.value = readStoredPendingTask()
  syncTaskPolling()
}

function removeStoredPendingTask(taskId?: string) {
  const storageKey = getLocalPendingTaskStorageKey()
  if (!taskId) {
    window.localStorage.removeItem(storageKey)
    return
  }

  const storedTask = readStoredPendingTask()
  if (!storedTask || storedTask.id === taskId) {
    window.localStorage.removeItem(storageKey)
  }
}

function handleLocalPendingStorageChange(event: StorageEvent) {
  if (event.key !== getLocalPendingTaskStorageKey()) return
  restoreLocalPendingTask()
}

function syncTaskPolling() {
  stopTaskPolling()
  const task = activeRecentTask.value
  if (!task || ![TaskStatus.Queued, TaskStatus.Processing].includes(task.status as TaskStatus)) return

  taskPollTimer = window.setInterval(() => {
    loadDetail(true)
  }, 5000)
}

function stopTaskPolling() {
  if (taskPollTimer !== undefined) {
    window.clearInterval(taskPollTimer)
    taskPollTimer = undefined
  }
}

function startNovelActionPendingTask(action: NovelLongRunningAction) {
  const task = createNovelActionPendingTask(action)
  pendingTask.value = task
  persistLocalPendingTask(task)
  syncTaskPolling()
}

function clearLocalPendingTask(taskId = pendingTask.value?.id) {
  pendingTask.value = null
  removeStoredPendingTask(taskId)
  syncTaskPolling()
}

function isNovelActionRunning(action: NovelLongRunningAction) {
  return hasLocalPendingWait.value && pendingAction.value === action
}

function cancelLocalPendingWait() {
  clearLocalPendingTask()
  ElMessage.info('已取消本地等待状态；如果旧模型请求稍后返回，请刷新查看候选池。')
}

async function restartStructureGeneration(objectType: StructureAssetType) {
  if (structureGeneratingType.value) {
    ElMessage.info('当前页面仍在等待模型返回，请先等待或刷新后再操作。')
    return
  }

  try {
    await ElMessageBox.confirm(
      '这只会放弃当前页面的等待状态，不能保证中止已经发出的模型请求。新的生成结果仍会进入候选池，最终需要手动采用。',
      '放弃等待并重新生成？',
      {
        confirmButtonText: '重新生成',
        cancelButtonText: '先不处理',
        type: 'warning',
      },
    )
  } catch {
    return
  }
  clearLocalPendingTask()
  await handleGenerateStructure(objectType, '用户放弃等待后重新生成')
}

async function openTaskDrawer(taskId?: string | null) {
  taskDrawer.open = true
  taskDrawer.taskId = taskId ?? ''
  taskDrawer.task = null
  taskDrawer.error = ''

  if (pendingTask.value && taskDrawer.taskId === pendingTask.value.id) {
    taskDrawer.task = createLocalPendingTaskDetail({
      novelId: novelId.value,
      task: pendingTask.value,
    })
    return
  }

  if (!taskDrawer.taskId) {
    taskDrawer.error = '暂无可查看的任务记录'
    return
  }

  await loadTaskDrawer()
}

async function loadTaskDrawer() {
  if (!taskDrawer.taskId) return

  if (pendingTask.value && taskDrawer.taskId === pendingTask.value.id) {
    taskDrawer.task = createLocalPendingTaskDetail({
      novelId: novelId.value,
      task: pendingTask.value,
    })
    return
  }

  taskDrawer.loading = true
  taskDrawer.error = ''

  try {
    taskDrawer.task = await getTaskDetail(taskDrawer.taskId)
  } catch (error) {
    taskDrawer.error = formatApiError(error)
  } finally {
    taskDrawer.loading = false
  }
}

async function handleRetryTask() {
  if (!taskDrawer.task) return

  taskDrawer.actionLoading = true
  taskDrawer.error = ''

  try {
    const result = await retryGenerationTask(taskDrawer.task.id, { reason: '从小说详情工作台重试' })
    taskDrawer.taskId = result.newTask.id
    taskDrawer.task = result.newTask
    ElMessage.success('已创建重试任务')
    await loadDetail(true)
  } catch (error) {
    taskDrawer.error = formatApiError(error)
  } finally {
    taskDrawer.actionLoading = false
  }
}

async function handleCancelTask() {
  if (!taskDrawer.task) return

  taskDrawer.actionLoading = true
  taskDrawer.error = ''

  try {
    const result = await cancelGenerationTask(taskDrawer.task.id, { reason: '从小说详情工作台取消' })
    taskDrawer.task = result.task
    ElMessage.success('任务已取消')
    await loadDetail(true)
  } catch (error) {
    taskDrawer.error = formatApiError(error)
  } finally {
    taskDrawer.actionLoading = false
  }
}

async function handleGenerateDirection() {
  if (hasLocalPendingWait.value) {
    ElMessage.info('已有生成任务在等待中，请先查看最近任务或取消等待。')
    return
  }

  generatingDirection.value = true
  apiError.value = ''
  startNovelActionPendingTask('direction_generate')
  const pendingTaskId = pendingTask.value?.id

  try {
    await generateDirections(novelId.value)
    ElMessage.success('方向候选已生成')
    await loadDetail()
  } catch (error) {
    apiError.value = formatApiError(error)
    await loadDetail(true)
  } finally {
    generatingDirection.value = false
    clearLocalPendingTask(pendingTaskId)
  }
}

async function handleGenerateStructure(objectType: StructureAssetType, regenerateReason?: string) {
  if (hasLocalPendingWait.value) {
    ElMessage.info('已有生成任务在等待中，请先查看最近任务或取消等待。')
    return false
  }

  structureGeneratingType.value = objectType
  apiError.value = ''
  startNovelActionPendingTask(getStructurePendingAction(objectType))
  const pendingTaskId = pendingTask.value?.id

  try {
    const request = regenerateReason ? { regenerateReason } : {}
    if (objectType === 'setting') await generateSetting(novelId.value, request)
    if (objectType === 'outline') await generateOutline(novelId.value, request)
    if (objectType === 'stage_outline') await generateStageOutline(novelId.value, request)
    if (objectType === 'chapter_plan') await generateChapterPlan(novelId.value, request)
    ElMessage.success(`${getStructureAssetTypeText(objectType)}候选已生成`)
    await loadDetail()
    return true
  } catch (error) {
    apiError.value = formatApiError(error)
    await loadDetail(true)
    return false
  } finally {
    structureGeneratingType.value = ''
    clearLocalPendingTask(pendingTaskId)
  }
}

async function handleApplyBatchWordTarget() {
  if (!detail.value?.currentAssets.chapterPlan || chapterRows.value.length === 0) {
    ElMessage.info('需要先采用章节目录后再调整目标字数')
    return
  }
  const wordTarget = Number(batchWordTarget.value)
  if (!Number.isInteger(wordTarget) || wordTarget < 100) {
    apiError.value = '目标字数必须是大于 100 的整数'
    return
  }

  try {
    await ElMessageBox.confirm(
      `将当前 ${chapterRows.value.length} 章的目标字数统一调整为 ${wordTarget} 字。已生成正文不会被覆盖，后续生成会按新目标执行。`,
      '确认批量调整目标字数',
      { type: 'warning', confirmButtonText: '确认调整', cancelButtonText: '取消' },
    )
  } catch {
    return
  }

  updatingChapterWordTargets.value = true
  apiError.value = ''
  try {
    await updateChapterWordTargets(novelId.value, {
      updates: chapterRows.value.map((chapter) => ({
        chapterNo: Number(chapter.chapterNo),
        wordTarget,
      })),
      reason: `批量调整章节目标字数为 ${wordTarget}`,
      currentChapterPlanVersionId: detail.value.currentAssets.chapterPlan.id,
    })
    ElMessage.success('章节目标字数已更新')
    await loadDetail()
  } catch (error) {
    apiError.value = formatApiError(error)
    await loadDetail(true)
  } finally {
    updatingChapterWordTargets.value = false
  }
}

async function handleGenerateTrial(regenerateReason?: string) {
  if (hasLocalPendingWait.value) {
    ElMessage.info('已有生成任务在等待中，请先查看最近任务或取消等待。')
    return
  }

  generatingTrial.value = true
  apiError.value = ''
  startNovelActionPendingTask('trial_generate')
  const pendingTaskId = pendingTask.value?.id

  try {
    await generateTrial(novelId.value, {
      chapterCount: 3,
      regenerateReason,
    })
    ElMessage.success('试写候选已生成')
    await loadDetail()
  } catch (error) {
    apiError.value = formatApiError(error)
    await loadDetail(true)
  } finally {
    generatingTrial.value = false
    clearLocalPendingTask(pendingTaskId)
  }
}

async function handleSelectTrialCandidate(candidate: TrialCandidateRow) {
  if (hasLocalPendingWait.value) {
    ElMessage.info('已有生成任务在等待中，请先查看最近任务或取消等待。')
    return
  }

  const trialRun = detail.value?.latestTrialRun
  if (!trialRun) return
  if (candidate.requiresRiskConfirm) {
    const reason = await promptHighRiskReason({
      title: '确认低分或风险候选继续试写',
      message: '该第 1 章候选评分或门禁存在风险。继续后只会基于该候选生成第 2-3 章和试写总评，不会自动进入批量正文或视频生产链路。',
      details: [
        { label: '候选对象', value: `${candidate.title} ${candidate.versionLabel}` },
        { label: '候选版本', value: candidate.id },
        { label: '评分', value: candidate.scoreText },
        { label: '门禁', value: candidate.gateText },
        { label: '风险', value: candidate.riskLevelText },
      ],
      inputPlaceholder: '请说明为什么仍选择该候选继续试写',
      confirmButtonText: '填写原因并继续',
    })
    if (reason === null) return
    if (!reason) {
      apiError.value = '低分或风险候选继续试写必须填写原因'
      return
    }
  }

  selectingTrialCandidateId.value = candidate.id
  apiError.value = ''
  startNovelActionPendingTask('trial_followup_generate')
  const pendingTaskId = pendingTask.value?.id
  ElMessage.info(`已选择「${candidate.title}」，正在生成第 2-3 章和试写总评。`)

  try {
    await generateTrial(novelId.value, {
      trialRunId: trialRun.id,
      selectedCandidateId: candidate.id,
    })
    ElMessage.success('已选择第 1 章候选，继续生成第 2-3 章')
    await loadDetail()
    activeSubStepKey.value = 'review'
  } catch (error) {
    apiError.value = formatApiError(error)
    ElMessage.error(apiError.value)
    await loadDetail(true)
  } finally {
    selectingTrialCandidateId.value = ''
    clearLocalPendingTask(pendingTaskId)
  }
}

function openTrialContent(candidate: TrialCandidateRow) {
  trialContentDrawer.open = true
  trialContentDrawer.title = `${candidate.title} ${candidate.versionLabel}`
  trialContentDrawer.content = candidate.content
}

function openTrialConfirmDialog() {
  const review = detail.value?.latestTrialRun?.trialReview
  if (!review) return
  const requiresRisk = isTrialReviewRiskContinue(review)
  trialConfirmDialog.open = true
  trialConfirmDialog.requiresRisk = requiresRisk
  trialConfirmDialog.reason = requiresRisk ? '' : '试写表现达标，生成正文策略快照。'
}

async function confirmTrialResult() {
  const trialRun = detail.value?.latestTrialRun
  const review = trialRun?.trialReview
  if (!trialRun || !review) return

  const requiresRisk = isTrialReviewRiskContinue(review)
  if (requiresRisk && !trialConfirmDialog.reason.trim()) {
    apiError.value = '低分或风险试写继续必须填写原因'
    return
  }

  confirmingTrial.value = true
  apiError.value = ''

  try {
    await confirmTrialApi(novelId.value, {
      trialRunId: trialRun.id,
      decision: requiresRisk ? 'force_pass' : 'confirm_pass',
      confirmRisk: requiresRisk,
      reason: trialConfirmDialog.reason,
    })
    ElMessage.success('已确认试写并生成策略快照')
    trialConfirmDialog.open = false
    await loadDetail()
  } catch (error) {
    apiError.value = formatApiError(error)
  } finally {
    confirmingTrial.value = false
  }
}

function isTrialReviewRiskContinue(review: NonNullable<NonNullable<NovelDetailDTO['latestTrialRun']>['trialReview']>) {
  return review.requiresRiskConfirmation || review.trialResult !== 'pass'
}

async function confirmHighRiskAction(options: {
  title: string
  message: string
  details?: HighRiskConfirmationDetail[]
  confirmButtonText?: string
  type?: 'warning' | 'error' | 'info' | 'success'
}): Promise<boolean> {
  try {
    await ElMessageBox.confirm(
      formatHighRiskConfirmationMessage(options.message, options.details),
      options.title,
      {
        confirmButtonText: options.confirmButtonText ?? '确认继续',
        cancelButtonText: '取消',
        type: options.type ?? 'warning',
        closeOnClickModal: false,
        closeOnPressEscape: true,
        distinguishCancelAndClose: false,
      },
    )
    return true
  } catch {
    return false
  }
}

async function promptHighRiskReason(options: {
  title: string
  message: string
  details?: HighRiskConfirmationDetail[]
  inputPlaceholder?: string
  inputValue?: string
  confirmButtonText?: string
  type?: 'warning' | 'error' | 'info' | 'success'
}) {
  try {
    const result = await ElMessageBox.prompt(
      formatHighRiskConfirmationMessage(options.message, options.details),
      options.title,
      {
        confirmButtonText: options.confirmButtonText ?? '确认提交',
        cancelButtonText: '取消',
        inputPlaceholder: options.inputPlaceholder ?? '请填写原因',
        inputValue: options.inputValue ?? '',
        inputType: 'textarea',
        inputPattern: /\S+/,
        inputErrorMessage: '请填写原因或处理说明',
        type: options.type ?? 'warning',
        closeOnClickModal: false,
        closeOnPressEscape: true,
        distinguishCancelAndClose: false,
      },
    )
    return normalizeConfirmationReason(result.value)
  } catch {
    return null
  }
}

async function handleGenerateBodyBatch() {
  if (hasLocalPendingWait.value) {
    ElMessage.info('已有生成任务在等待中，请先查看最近任务或取消等待。')
    return
  }

  const state = bodyGeneration.value
  const snapshot = state?.strategySnapshot
  if (!state || !snapshot || !state.nextBatchRange.startChapterNo || !state.nextBatchRange.endChapterNo) {
    apiError.value = '没有可生成的正文批次，请先确认试写总评并生成策略快照。'
    return
  }

  const confirmed = await confirmHighRiskAction({
    title: '确认开始本批正文生成',
    message: '将基于已确认的正文策略快照生成下一批正式正文。生成任务不会进入全书审稿、待视频化或视频生产链路；如果取消或硬失败，已完成章节会保留，未开始章节不会写入正式正文。',
    details: [
      { label: '策略快照', value: `v${snapshot.versionNo}` },
      { label: '策略快照 ID', value: snapshot.id },
      { label: '批次范围', value: state.nextBatchRange.text },
      { label: '当前章节进度', value: state.chapterProgress.text },
    ],
    confirmButtonText: '确认生成本批',
  })
  if (!confirmed) return

  if (!bodyBatchIdempotencyKey.value) {
    bodyBatchIdempotencyKey.value = createBodyBatchIdempotencyKey()
  }
  const idempotencyKey = bodyBatchIdempotencyKey.value
  generatingBodyBatch.value = true
  apiError.value = ''
  startNovelActionPendingTask('body_batch_generate')
  const pendingTaskId = pendingTask.value?.id

  try {
    await generateBodyBatch(novelId.value, {
      strategySnapshotId: snapshot.id,
      expectedStrategySnapshotVersion: snapshot.versionNo,
      startChapterNo: state.nextBatchRange.startChapterNo,
      endChapterNo: state.nextBatchRange.endChapterNo,
      idempotencyKey,
    })
    ElMessage.success('本批正文任务已完成，批次总结已生成')
    bodyBatchIdempotencyKey.value = ''
    await loadDetail()
  } catch (error) {
    apiError.value = formatApiError(error)
    await loadDetail(true)
  } finally {
    generatingBodyBatch.value = false
    clearLocalPendingTask(pendingTaskId)
  }
}

async function handleStartFullReview() {
  if (!detail.value) return
  if (hasLocalPendingWait.value) {
    ElMessage.info('已有生成任务在等待中，请先查看最近任务或取消等待。')
    return
  }

  const confirmed = await confirmHighRiskAction({
    title: '确认发起全书 AI 审稿',
    message: '将基于当前全部正式正文创建全书审稿任务。审稿只生成报告、问题卡和门禁结论，不会自动确认完成，也不会进入待视频化或视频生产链路。',
    details: [
      { label: '小说对象', value: detail.value.title },
      { label: '小说版本', value: detail.value.updatedAt },
      { label: '计划章节数', value: chapterRows.value.length },
      { label: '当前阶段', value: detail.value.statusSummary.displayStatusText },
    ],
    confirmButtonText: '确认发起审稿',
  })
  if (!confirmed) return

  startingFullReview.value = true
  apiError.value = ''
  startNovelActionPendingTask('full_review')
  const pendingTaskId = pendingTask.value?.id

  try {
    await startFullReview(novelId.value, {
      idempotencyKey: createActionIdempotencyKey('full-review'),
      expectedNovelVersion: detail.value.updatedAt,
    })
    ElMessage.success('全书审稿已完成，报告已生成')
    await loadDetail()
  } catch (error) {
    apiError.value = formatApiError(error)
    await loadDetail(true)
  } finally {
    startingFullReview.value = false
    clearLocalPendingTask(pendingTaskId)
  }
}

async function handleResolveFullReviewIssue(issueId: string, action: 'resolve' | 'accept_risk') {
  const review = latestFullReview.value
  if (!review) return
  const issue = review.issues.find((item) => item.issueId === issueId)
  const reason = await promptHighRiskReason({
    title: action === 'accept_risk' ? '确认接受全书审稿问题风险' : '确认标记全书审稿问题已解决',
    message: action === 'accept_risk'
      ? '接受风险会记录该问题的人工决策原因，但不会修改章节正文、不会自动确认小说完成，也不会进入视频生产链路。'
      : '标记解决会记录处理说明并更新该问题状态；如果问题仍影响完成门禁，后端会继续按门禁规则拦截。',
    details: [
      { label: '审稿报告', value: `v${review.version}` },
      { label: '问题 ID', value: issueId },
      { label: '问题标题', value: issue?.title },
      { label: '问题级别', value: issue?.severity },
      { label: '是否阻塞', value: issue?.blocking ? '阻塞' : '非阻塞' },
      { label: '推荐动作', value: issue?.recommendedAction },
    ],
    inputPlaceholder: action === 'accept_risk' ? '请说明为什么接受该问题风险' : '请填写处理说明',
    inputValue: action === 'resolve' ? '已处理该问题。' : '',
    confirmButtonText: action === 'accept_risk' ? '记录原因并接受风险' : '提交处理说明',
  })
  if (reason === null) return
  if (!reason) {
    apiError.value = action === 'accept_risk' ? '接受风险必须填写原因' : '处理问题需要填写说明'
    return
  }

  resolvingFullReviewIssueId.value = issueId
  apiError.value = ''

  try {
    await resolveFullReviewIssue(novelId.value, review.id, {
      issueId,
      action,
      reason,
    })
    ElMessage.success(action === 'accept_risk' ? '已记录风险接受原因' : '已标记问题解决')
    await loadDetail()
  } catch (error) {
    apiError.value = formatApiError(error)
  } finally {
    resolvingFullReviewIssueId.value = ''
  }
}

async function handleForcePassFullReview() {
  const review = latestFullReview.value
  if (!review) return
  const reason = await promptHighRiskReason({
    title: '确认低分全书审稿强制通过',
    message: '该操作会记录强制通过原因并更新全书审稿门禁，但不会修改正文、不会直接进入待视频化，也不会创建视频生产任务。数据门禁和安全门禁仍由后端拦截。',
    details: [
      { label: '审稿报告', value: `v${review.version}` },
      { label: '审稿报告 ID', value: review.id },
      { label: '综合分', value: review.totalScore },
      { label: '评级', value: review.rating },
      { label: '当前门禁', value: review.gate.gateResultText },
      { label: '门禁 ID', value: review.gate.id },
    ],
    inputPlaceholder: '请说明为什么允许低分或风险审稿继续',
    confirmButtonText: '填写原因并强制通过',
    type: 'error',
  })
  if (reason === null) return
  if (!reason) {
    apiError.value = '强制通过必须填写原因'
    return
  }

  startingFullReview.value = true
  apiError.value = ''

  try {
    await forcePassFullReview(novelId.value, review.id, {
      idempotencyKey: createActionIdempotencyKey('full-review-force-pass'),
      fullReviewGateId: review.gate.id,
      expectedReviewReportVersion: review.version,
      reason,
      confirmRisk: true,
    })
    ElMessage.success('已记录强制通过原因')
    await loadDetail()
  } catch (error) {
    apiError.value = formatApiError(error)
  } finally {
    startingFullReview.value = false
  }
}

async function handleConfirmCompletion() {
  const review = latestFullReview.value
  if (!review || !detail.value) return
  const requiresRiskReason = review.gate.gateResult === 'forced_pass' || review.gate.gateResult === 'warning'
  const reason = requiresRiskReason
    ? await promptHighRiskReason({
        title: '确认带风险完成小说',
        message: '该全书审稿存在风险继续记录。确认完成会写入完成决策，并解锁待视频化检查；不会直接进入视频生产链路。',
        details: [
          { label: '审稿报告', value: `v${review.version}` },
          { label: '审稿报告 ID', value: review.id },
          { label: '综合分', value: review.totalScore },
          { label: '当前门禁', value: review.gate.gateResultText },
          { label: '门禁 ID', value: review.gate.id },
          { label: '计划章节数', value: chapterRows.value.length },
        ],
        inputPlaceholder: '请说明为什么仍确认小说完成',
        confirmButtonText: '填写原因并确认完成',
      })
    : await (async () => {
        const confirmed = await confirmHighRiskAction({
          title: '确认小说完成',
          message: '确认后会写入完成决策，并生成待视频化检查。该操作不会创建视频项目，也不会进入 TTS、字幕、渲染或发布链路。',
          details: [
            { label: '审稿报告', value: `v${review.version}` },
            { label: '审稿报告 ID', value: review.id },
            { label: '综合分', value: review.totalScore },
            { label: '当前门禁', value: review.gate.gateResultText },
            { label: '门禁 ID', value: review.gate.id },
            { label: '计划章节数', value: chapterRows.value.length },
          ],
          confirmButtonText: '确认小说完成',
          type: 'info',
        })
        return confirmed ? '全书审稿通过，确认小说完成。' : null
      })()
  if (reason === null) return
  if (!reason) {
    apiError.value = '完成确认需要填写原因'
    return
  }

  confirmingCompletion.value = true
  apiError.value = ''

  try {
    await confirmCompletion(novelId.value, {
      idempotencyKey: createActionIdempotencyKey('completion-confirm'),
      reviewReportId: review.id,
      fullReviewGateId: review.gate.id,
      expectedReviewReportVersion: review.version,
      expectedNovelVersion: detail.value.updatedAt,
      reason,
      confirmRisk: review.gate.gateResult === 'forced_pass' || review.gate.gateResult === 'warning',
    })
    ElMessage.success('已确认小说完成，待视频化检查已生成')
    await loadDetail()
  } catch (error) {
    apiError.value = formatApiError(error)
  } finally {
    confirmingCompletion.value = false
  }
}

async function handleRecheckVideoReadiness() {
  if (hasLocalPendingWait.value) {
    ElMessage.info('已有生成任务在等待中，请先查看最近任务或取消等待。')
    return
  }

  recheckingVideoReadiness.value = true
  apiError.value = ''
  startNovelActionPendingTask('video_readiness_recheck')
  const pendingTaskId = pendingTask.value?.id

  try {
    await recheckVideoReadiness(novelId.value, {
      idempotencyKey: createActionIdempotencyKey('video-readiness-recheck'),
    })
    ElMessage.success('待视频化检查已刷新')
    await loadDetail()
  } catch (error) {
    apiError.value = formatApiError(error)
    await loadDetail(true)
  } finally {
    recheckingVideoReadiness.value = false
    clearLocalPendingTask(pendingTaskId)
  }
}

async function handleConfirmVideoReady() {
  const readiness = videoReadiness.value
  const completion = detail.value?.completionDecision
  if (!readiness?.check || !completion || !detail.value) return
  if (hasLocalPendingWait.value) {
    ElMessage.info('已有生成任务在等待中，请先查看最近任务或取消等待。')
    return
  }

  const confirmed = await confirmHighRiskAction({
    title: '确认进入待视频化',
    message: '确认后会生成视频化引用快照，小说进入待视频化/可被视频模块引用状态。这里不创建视频项目，不进入 TTS、字幕、渲染或发布链路。',
    details: [
      { label: '完成决策 ID', value: completion.id },
      { label: '检查 ID', value: readiness.check.id },
      { label: '检查版本', value: readiness.check.version },
      { label: '检查状态', value: readiness.check.statusText },
      { label: '小说版本', value: detail.value.updatedAt },
    ],
    confirmButtonText: '确认进入待视频化',
    type: 'info',
  })
  if (!confirmed) return

  confirmingVideoReady.value = true
  apiError.value = ''
  startNovelActionPendingTask('video_readiness_confirm')
  const pendingTaskId = pendingTask.value?.id

  try {
    await confirmVideoReadiness(novelId.value, {
      idempotencyKey: createActionIdempotencyKey('video-readiness-confirm'),
      completionDecisionId: completion.id,
      readinessCheckId: readiness.check.id,
      checkVersion: readiness.check.version,
      expectedNovelVersion: detail.value.updatedAt,
      reason: '确认进入待视频化',
      confirmRisk: false,
    })
    ElMessage.success('小说已进入待视频化，可被视频模块引用')
    await loadDetail()
  } catch (error) {
    apiError.value = formatApiError(error)
    await loadDetail(true)
  } finally {
    confirmingVideoReady.value = false
    clearLocalPendingTask(pendingTaskId)
  }
}

function createBodyBatchIdempotencyKey() {
  const randomValue = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

  return `body-batch-${randomValue}`
}

function createActionIdempotencyKey(prefix: string) {
  const randomValue = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

  return `${prefix}-${randomValue}`
}

function openFuseDialog() {
  fuseDialog.open = true
  fuseDialog.reason = selectedDirectionCandidates.value.length
    ? '融合所选方向的核心爽点、人物动机和短视频前三秒钩子，生成一个新的候选方向。'
    : ''
}

async function confirmFuseDirections() {
  if (selectedCandidateIds.value.length < 2) {
    ElMessage.warning('请至少选择两个方向候选再融合。')
    return
  }
  if (hasLocalPendingWait.value) {
    ElMessage.info('已有生成任务在等待中，请先查看最近任务或取消等待。')
    return
  }

  fusing.value = true
  apiError.value = ''
  startNovelActionPendingTask('direction_fuse')
  const pendingTaskId = pendingTask.value?.id

  try {
    await fuseDirections(novelId.value, {
      versionIds: selectedCandidateIds.value,
      reason: fuseDialog.reason.trim() || '融合所选方向的爽点和视频化钩子',
    })
    ElMessage.success('融合候选已生成，请在候选池中对比后再采用')
    fuseDialog.open = false
    selectedCandidateIds.value = []
    await loadDetail()
  } catch (error) {
    apiError.value = formatApiError(error)
    await loadDetail(true)
  } finally {
    fusing.value = false
    clearLocalPendingTask(pendingTaskId)
  }
}

function openOptimizeDialog(candidate: DirectionCandidateRow) {
  directionDetailDialog.open = false
  optimizeDialog.open = true
  optimizeDialog.candidate = candidate
  optimizeDialog.instruction = ''
}

function openEditDirectionDialog(candidate: DirectionCandidateRow) {
  directionDetailDialog.open = false
  editDirectionDialog.open = true
  editDirectionDialog.candidate = candidate
  editDirectionDialog.form = {
    title: candidate.title,
    logline: candidate.logline,
    coreHook: candidate.coreHook,
    audienceAppeal: candidate.audienceAppeal,
    videoPotential: candidate.videoPotential,
    sellingPointsText: candidate.sellingPoints.join('\n'),
    riskTagsText: candidate.riskTags.join('\n'),
    recommendation: candidate.primaryReason,
    reason: '手动微调方向候选，保存为新版本后再对比采用。',
  }
}

async function confirmEditDirection() {
  const candidate = editDirectionDialog.candidate
  if (!candidate || !canSubmitDirectionEdit.value) {
    ElMessage.warning('请先补全标题、方向、钩子、卖点和编辑原因。')
    return
  }
  if (hasLocalPendingWait.value) {
    ElMessage.info('已有生成任务在等待中，请先查看最近任务或取消等待。')
    return
  }

  editingDirectionId.value = candidate.id
  apiError.value = ''

  try {
    await editDirectionCandidate(novelId.value, candidate.id, {
      title: editDirectionDialog.form.title.trim(),
      logline: editDirectionDialog.form.logline.trim(),
      coreHook: editDirectionDialog.form.coreHook.trim(),
      audienceAppeal: editDirectionDialog.form.audienceAppeal.trim(),
      videoPotential: editDirectionDialog.form.videoPotential.trim(),
      sellingPoints: splitTextLines(editDirectionDialog.form.sellingPointsText),
      riskTags: splitTextLines(editDirectionDialog.form.riskTagsText),
      recommendation: editDirectionDialog.form.recommendation.trim(),
      reason: editDirectionDialog.form.reason.trim(),
    })
    ElMessage.success('已保存为新的方向候选，请在候选池中对比后再采用')
    editDirectionDialog.open = false
    await loadDetail()
  } catch (error) {
    apiError.value = formatApiError(error)
    await loadDetail(true)
  } finally {
    editingDirectionId.value = ''
  }
}

function openEditStructureDialog(asset: StructureAssetRow) {
  const firstSection = asset.sections[0]
  editStructureDialog.open = true
  editStructureDialog.asset = asset
  editStructureDialog.form = {
    title: asset.title,
    summary: asset.summary,
    sectionTitle: firstSection?.title || asset.typeText,
    sectionBody: firstSection?.body || asset.stages[0]?.goal || asset.summary,
    sectionItemsText: firstSection?.items.join('\n') || '',
    riskTagsText: asset.riskTags.join('\n'),
    recommendation: asset.primaryReason,
    reason: `手动微调${asset.typeText}候选，保存为新版本后再对比采用。`,
  }
}

async function confirmEditStructure() {
  const asset = editStructureDialog.asset
  if (!asset || !canSubmitStructureEdit.value) {
    ElMessage.warning('请先补全标题、摘要、结构内容、推荐理由和编辑原因。')
    return
  }
  if (hasLocalPendingWait.value) {
    ElMessage.info('已有生成任务在等待中，请先查看最近任务或取消等待。')
    return
  }

  editingStructureId.value = asset.id
  apiError.value = ''

  try {
    const result = await editStructureAsset(novelId.value, asset.objectType, asset.id, {
      title: editStructureDialog.form.title.trim(),
      summary: editStructureDialog.form.summary.trim(),
      sectionTitle: editStructureDialog.form.sectionTitle.trim(),
      sectionBody: editStructureDialog.form.sectionBody.trim(),
      sectionItems: splitTextLines(editStructureDialog.form.sectionItemsText),
      riskTags: splitTextLines(editStructureDialog.form.riskTagsText),
      recommendation: editStructureDialog.form.recommendation.trim(),
      reason: editStructureDialog.form.reason.trim(),
    })
    ElMessage.success(`已保存为新的${asset.typeText}候选，请对比后再采用`)
    editStructureDialog.open = false
    await loadDetail()
    await nextTick()
    const candidateId = result.candidate?.id
    if (candidateId) focusStructureCandidate(candidateId)
  } catch (error) {
    apiError.value = formatApiError(error)
    await loadDetail(true)
  } finally {
    editingStructureId.value = ''
  }
}

async function confirmOptimizeDirection() {
  const candidate = optimizeDialog.candidate
  const instruction = optimizeDialog.instruction.trim()
  if (!candidate || !instruction) {
    ElMessage.warning('请先写清楚希望 AI 优化什么。')
    return
  }

  const versionId = candidate.id
  if (hasLocalPendingWait.value) {
    ElMessage.info('已有生成任务在等待中，请先查看最近任务或取消等待。')
    return
  }

  optimizingId.value = versionId
  apiError.value = ''
  startNovelActionPendingTask('direction_optimize')
  const pendingTaskId = pendingTask.value?.id

  try {
    await optimizeDirection(novelId.value, versionId, {
      instruction,
    })
    ElMessage.success('优化候选已生成，请在候选池中对比后再采用')
    optimizeDialog.open = false
    await loadDetail()
  } catch (error) {
    apiError.value = formatApiError(error)
    await loadDetail(true)
  } finally {
    optimizingId.value = ''
    clearLocalPendingTask(pendingTaskId)
  }
}

function openDirectionDetail(candidate: DirectionCandidateRow) {
  directionDetailDialog.open = true
  directionDetailDialog.candidate = candidate
}

function splitTextLines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
}

function handleContinueOptimize(asset: StructureAssetRow) {
  structureOptimizeDialog.open = true
  structureOptimizeDialog.asset = asset
  structureOptimizeDialog.instruction = `基于《${asset.title}》继续优化：强化冲突层次、提升短视频钩子，并保留评分较高的核心设定。`
}

async function confirmStructureOptimize() {
  const asset = structureOptimizeDialog.asset
  const instruction = structureOptimizeDialog.instruction.trim()
  if (!asset || !instruction) {
    ElMessage.warning('请先填写优化目标。')
    return
  }

  const generated = await handleGenerateStructure(asset.objectType, `基于候选「${asset.title}」继续优化：${instruction}`)
  if (generated) structureOptimizeDialog.open = false
}

function handleDiscardCandidate(asset: StructureAssetRow) {
  ElMessage.info(`${asset.typeText}候选已暂不采用，可继续生成新候选。`)
}

function openAdoptDialog(candidate: DirectionCandidateRow) {
  adoptDialog.open = true
  adoptDialog.candidateId = candidate.id
  adoptDialog.lowScore = candidate.lowScoreRequiresConfirm
  adoptDialog.reason = candidate.lowScoreRequiresConfirm ? '' : '采用该方向作为后续设定输入。'
}

function openStructureAdoptDialog(asset: StructureAssetRow) {
  structureAdoptDialog.open = true
  structureAdoptDialog.assetId = asset.id
  structureAdoptDialog.objectType = asset.objectType
  structureAdoptDialog.highRisk = asset.highRiskRequiresConfirm
  structureAdoptDialog.reason = asset.highRiskRequiresConfirm ? '' : `采用该${asset.typeText}作为后续创作事实源。`
}

async function confirmAdopt() {
  if (adoptDialog.lowScore && !adoptDialog.reason.trim()) {
    apiError.value = '低分方向采用必须填写原因'
    return
  }

  adoptingDirectionId.value = adoptDialog.candidateId
  apiError.value = ''

  try {
    await adoptDirection(novelId.value, adoptDialog.candidateId, {
      confirmLowScore: adoptDialog.lowScore,
      reason: adoptDialog.reason,
      pageVersionSnapshot: {
        seenCandidateVersionId: adoptDialog.candidateId,
        seenAt: new Date().toISOString(),
      },
      currentVersionId: detail.value?.currentAssets.direction?.id ?? null,
    })
    ElMessage.success('方向已采用，小说进入设定阶段')
    adoptDialog.open = false
    await loadDetail()
  } catch (error) {
    apiError.value = formatApiError(error)
  } finally {
    adoptingDirectionId.value = ''
  }
}

async function confirmStructureAdopt() {
  if (structureAdoptDialog.highRisk && !structureAdoptDialog.reason.trim()) {
    apiError.value = '高风险候选采用必须填写原因'
    return
  }

  structureAdoptingId.value = structureAdoptDialog.assetId
  apiError.value = ''

  try {
    const payload = {
      confirmHighRisk: structureAdoptDialog.highRisk,
      reason: structureAdoptDialog.reason,
      pageVersionSnapshot: {
        seenCandidateVersionId: structureAdoptDialog.assetId,
        seenAt: new Date().toISOString(),
      },
      currentVersionId: getCurrentStructureVersionId(structureAdoptDialog.objectType),
    }

    if (structureAdoptDialog.objectType === 'setting') await adoptSetting(novelId.value, structureAdoptDialog.assetId, payload)
    if (structureAdoptDialog.objectType === 'outline') await adoptOutline(novelId.value, structureAdoptDialog.assetId, payload)
    if (structureAdoptDialog.objectType === 'stage_outline') await adoptStageOutline(novelId.value, structureAdoptDialog.assetId, payload)
    if (structureAdoptDialog.objectType === 'chapter_plan') await adoptChapterPlan(novelId.value, structureAdoptDialog.assetId, payload)

    ElMessage.success(`${getStructureAssetTypeText(structureAdoptDialog.objectType)}已采用`)
    structureAdoptDialog.open = false
    await loadDetail()
    navigateAfterStructureAdopt(structureAdoptDialog.objectType)
  } catch (error) {
    apiError.value = formatApiError(error)
  } finally {
    structureAdoptingId.value = ''
  }
}

function navigateAfterStructureAdopt(objectType: StructureAssetType) {
  if (objectType === 'setting') {
    openStep('outline')
    return
  }

  if (objectType === 'outline') {
    openStep('outline')
    return
  }

  if (objectType === 'stage_outline') {
    openStep('chapterPlan')
    return
  }

  openStep('trial')
}

function toggleCandidate(candidateId: string) {
  if (selectedCandidateIds.value.includes(candidateId)) {
    selectedCandidateIds.value = selectedCandidateIds.value.filter((id) => id !== candidateId)
    return
  }

  selectedCandidateIds.value = [...selectedCandidateIds.value, candidateId]
}

function getCurrentStructureVersionId(objectType: StructureAssetType) {
  if (objectType === 'setting') return detail.value?.currentAssets.setting?.id ?? null
  if (objectType === 'outline') return detail.value?.currentAssets.outline?.id ?? null
  if (objectType === 'stage_outline') return detail.value?.currentAssets.stageOutline?.id ?? null
  return detail.value?.currentAssets.chapterPlan?.id ?? null
}

function getStructureAssetTypeText(type: StructureAssetType) {
  if (type === 'setting') return '设定'
  if (type === 'outline') return '全书大纲'
  if (type === 'stage_outline') return '阶段大纲'
  return '章节目录'
}

function getStructurePendingAction(type: StructureAssetType): NovelLongRunningAction {
  if (type === 'setting') return 'setting_generate'
  if (type === 'outline') return 'outline_generate'
  if (type === 'stage_outline') return 'stage_outline_generate'
  return 'chapter_plan_generate'
}

function formatApiError(error: unknown) {
  if (error instanceof ApiClientError) {
    const requestText = error.requestId ? `（请求 ID：${error.requestId}）` : ''
    return `${error.message}${requestText}`
  }

  return error instanceof Error ? error.message : '请求失败，请稍后重试'
}

onMounted(() => {
  restoreLocalPendingTask()
  window.addEventListener('storage', handleLocalPendingStorageChange)
  loadDetail()
})

watch(
  () => route.query.step,
  () => {
    applyWorkbenchLocationFromRoute()
  },
  { immediate: true },
)

watch(
  workbenchSteps,
  () => {
    if (workbenchMode.value === 'step') syncActiveSubStep(activeStepKey.value)
  },
)

onBeforeUnmount(() => {
  stopTaskPolling()
  window.removeEventListener('storage', handleLocalPendingStorageChange)
})
</script>

<style scoped>
.edit-form-grid {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

.edit-form-grid label {
  display: grid;
  gap: 6px;
  color: #4b5563;
  font-size: 13px;
}

.chapter-word-target-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  margin-bottom: 12px;
  border: 1px solid #dbeafe;
  border-radius: 6px;
  background: #eff6ff;
}

.chapter-word-target-toolbar strong {
  display: block;
  color: #1f2937;
  font-size: 14px;
}

.chapter-word-target-toolbar span {
  display: block;
  color: #64748b;
  font-size: 13px;
}

.chapter-word-target-toolbar small {
  display: block;
  margin-top: 4px;
  color: #64748b;
  font-size: 12px;
}

.chapter-word-target-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>
