<template>
  <section class="page-stack">
    <template v-if="isTaskMode">
      <div class="page-heading">
        <div>
          <h1>任务中心</h1>
          <p>集中查看 AI 生成、审稿和后续视频长任务。视频 P8 当前不创建生成任务。</p>
        </div>
        <div class="heading-actions">
          <el-button @click="router.push('/videos')">查看视频列表</el-button>
        </div>
      </div>

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
    </template>

    <template v-else>
      <div class="page-heading step-workbench-hero">
        <div>
          <h1>视频模块 P8</h1>
          <p>先承接已待视频化小说，管理视频项目、引用快照和引用异常。当前数据源：{{ isBackendMode ? '后端接口' : 'mock 演示' }}。生成、配音、字幕、渲染、发布和数据回填仍是后续能力。</p>
        </div>
        <div class="heading-actions">
          <el-button @click="setActiveView('list')">视频列表</el-button>
          <el-button type="primary" @click="setActiveView('create')">新建视频项目</el-button>
        </div>
      </div>

      <div class="task-summary-grid">
        <div class="task-summary-item">
          <span>视频项目</span>
          <strong>{{ metrics.total }}</strong>
        </div>
        <div class="task-summary-item">
          <span>引用正常</span>
          <strong>{{ metrics.normal }}</strong>
        </div>
        <div class="task-summary-item">
          <span>需关注</span>
          <strong>{{ metrics.attention }}</strong>
        </div>
        <div class="task-summary-item danger">
          <span>阻塞异常</span>
          <strong>{{ metrics.blocking }}</strong>
        </div>
      </div>

      <div class="major-stepper-panel video-p8-stepper">
        <button
          v-for="step in p8Steps"
          :key="step.key"
          class="major-step"
          :class="getMajorStepClass(step.key)"
          @click="setActiveView(step.key)"
        >
          <span class="major-step-index">{{ step.index }}</span>
          <strong>{{ step.label }}</strong>
          <small>{{ step.description }}</small>
        </button>
      </div>

      <el-alert
        v-if="activeView === 'generation'"
        title="P8 只做视频承接层。后续生成能力在 P9 原型确认后再研发。"
        type="warning"
        show-icon
        :closable="false"
      />

      <el-alert
        v-if="pageLoading"
        title="正在加载视频承接数据..."
        type="info"
        show-icon
        :closable="false"
      />

      <section v-if="activeView === 'overview'" class="overview-grid">
        <el-card shadow="never" class="overview-main-card">
          <div class="overview-eyebrow">当前推荐</div>
          <h2>先处理 1 个 blocking 引用异常，再创建新的首条测试项目</h2>
          <p class="muted">视频模块第一阶段像一个承接驾驶舱：从小说待视频化进入，创建视频项目，保存引用快照，再处理引用异常。它不承担视频生产。</p>
          <div class="overview-actions">
            <el-button type="danger" @click="setActiveView('issue')">处理阻塞异常</el-button>
            <el-button @click="setActiveView('source')">查看待视频化小说</el-button>
            <el-button type="primary" @click="setActiveView('create')">新建视频项目</el-button>
          </div>
        </el-card>

        <div class="overview-side">
          <el-card shadow="never">
            <h3>视频列表定位</h3>
            <p class="muted">参考小说列表：每行只给一个主动作，让用户看懂引用小说、章节范围、快照版本和异常状态。</p>
            <div class="tag-row mt-16">
              <el-tag effect="plain">列表驾驶舱</el-tag>
              <el-tag type="success" effect="plain">引用快照</el-tag>
              <el-tag type="warning" effect="plain">异常处理</el-tag>
            </div>
          </el-card>
          <el-card shadow="never">
            <h3>P8 不做什么</h3>
            <p class="muted">不提供可点击的生成视频、配音、字幕、渲染、发布和数据回填主动作，避免研发边界混乱。</p>
          </el-card>
        </div>
      </section>

      <section v-else-if="activeView === 'source'">
        <el-card shadow="never">
          <template #header>
            <div class="section-title">
              <div>
                <h2>步骤 1：小说已待视频化</h2>
                <p>确认哪些小说已经完成全书审稿、完成确认和待视频化检查。</p>
              </div>
            </div>
          </template>
          <div class="sub-stepper-panel">
            <button class="sub-step-card active"><strong>读取小说</strong><span>只看 video_ready</span></button>
            <button class="sub-step-card done"><strong>查看快照</strong><span>读取待视频化检查</span></button>
            <button class="sub-step-card done"><strong>判断可引用</strong><span>确认章节正文</span></button>
            <button class="sub-step-card locked"><strong>进入创建</strong><span>选择章节范围</span></button>
          </div>
          <el-table :data="videoReadyNovels" border stripe>
            <el-table-column prop="title" label="小说" min-width="220" />
            <el-table-column prop="status" label="状态" width="130">
              <template #default="{ row }"><el-tag type="success" effect="plain">{{ row.status }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="snapshot" label="待视频化快照" min-width="180" />
            <el-table-column prop="range" label="推荐首条范围" width="160" />
              <el-table-column label="动作" width="180" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" size="small" @click="startCreateFromNovel(row)">用它创建视频项目</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </section>

      <section v-else-if="activeView === 'list'">
        <el-card shadow="never" class="filter-panel">
          <div class="filter-grid">
            <div class="filter-fields">
              <el-input v-model="filters.keyword" placeholder="视频项目名称" clearable />
              <el-select v-model="filters.referenceStatus" placeholder="引用状态">
                <el-option label="全部引用状态" value="all" />
                <el-option label="normal" value="normal" />
                <el-option label="warning" value="warning" />
                <el-option label="blocking" value="blocking" />
                <el-option label="resolved" value="resolved" />
              </el-select>
              <el-select v-model="filters.lifecycleStatus" placeholder="生命周期">
                <el-option label="全部生命周期" value="all" />
                <el-option label="active" value="active" />
                <el-option label="stopped" value="stopped" />
                <el-option label="archived" value="archived" />
              </el-select>
            </div>
            <div class="filter-side">
              <div class="filter-buttons">
                <el-button type="primary" @click="applyFilters">筛选</el-button>
                <el-button @click="resetFilters">重置</el-button>
              </div>
              <div class="data-count">共 <strong>{{ filteredProjects.length }}</strong> 个视频项目</div>
            </div>
          </div>
        </el-card>

        <el-alert v-if="listNotice" :title="listNotice" type="success" show-icon :closable="false" />

        <el-card shadow="never" class="table-card">
          <el-table :data="filteredProjects" border stripe>
            <el-table-column type="expand">
              <template #default="{ row }">
                <div class="row-expansion video-reference-expansion">
                  <div>
                    <h3>引用摘要</h3>
                    <p>{{ row.novelTitle }} / {{ row.chapterRangeText }} / {{ row.referenceVersionText }}</p>
                  </div>
                  <div>
                    <h3>引用状态</h3>
                    <p>{{ row.referenceIssueSummary }}</p>
                  </div>
                  <div>
                    <h3>下一步</h3>
                    <p>{{ row.recommendedActionReason }}</p>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="视频项目" min-width="220">
              <template #default="{ row }">
                <button class="link-button title-link" type="button" @click="openVideoWorkbench(row)">{{ row.title }}</button>
                <div class="muted-line">{{ row.typeText }} · {{ row.lifecycleStatusText }}</div>
              </template>
            </el-table-column>
            <el-table-column label="引用小说" min-width="200">
              <template #default="{ row }">
                <div>{{ row.novelTitle }}</div>
                <div class="muted-line">{{ row.novelStageText }}</div>
              </template>
            </el-table-column>
            <el-table-column label="引用章节" width="150">
              <template #default="{ row }">
                {{ row.chapterRangeText }}
                <div class="muted-line">{{ row.chapterCount }} 章</div>
              </template>
            </el-table-column>
            <el-table-column label="引用快照" min-width="190">
              <template #default="{ row }">
                {{ row.referenceVersionText }}
                <div class="muted-line">{{ row.referenceSnapshotAt }}</div>
              </template>
            </el-table-column>
            <el-table-column label="引用状态" width="130">
              <template #default="{ row }">
                <el-tag :type="getReferenceStatusTagType(row.referenceStatus)" effect="plain">{{ row.referenceStatusText }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="productionStatusText" label="生产状态" width="150" />
            <el-table-column label="当前推荐动作" width="190" fixed="right">
              <template #default="{ row }">
                <el-button
                  :type="getActionButtonType(getVideoP8PrimaryAction(row).intent)"
                  size="small"
                  :disabled="getVideoP8PrimaryAction(row).disabled"
                  @click="handleVideoAction(row)"
                >
                  {{ getVideoP8PrimaryAction(row).label }}
                </el-button>
                <div v-if="getVideoP8PrimaryAction(row).disabledReason" class="muted-line">{{ getVideoP8PrimaryAction(row).disabledReason }}</div>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </section>

      <section v-else-if="activeView === 'create'">
        <el-card shadow="never">
          <template #header>
            <div class="section-title">
              <div>
                <h2>步骤 2：创建视频项目</h2>
                <p>4 步向导：选择小说、确认范围、创建前检查、创建完成。创建后只保存引用快照。</p>
              </div>
            </div>
          </template>

          <div class="sub-stepper-panel">
            <button
              v-for="step in createSteps"
              :key="step.index"
              class="sub-step-card"
              :class="{ active: createStep === step.index, done: createStep > step.index, locked: isCreateStepLocked(step.index) }"
              :disabled="isCreateStepLocked(step.index)"
              :title="isCreateStepLocked(step.index) ? '请先完成前置步骤' : ''"
              @click="requestCreateStep(step.index)"
            >
              <strong>{{ step.label }}</strong>
              <span>{{ step.description }}</span>
            </button>
          </div>

          <el-alert v-if="createWizardNotice" :title="createWizardNotice" type="warning" show-icon :closable="false" class="mt-16" />

          <div class="step-content-grid mt-16">
            <div class="step-main-content">
              <el-card v-if="createStep === 1" shadow="never">
                <h3>选择小说</h3>
                <p class="muted">从小说详情进入时会自动带入小说；也可以切换为其他待视频化小说。</p>
                <el-descriptions :column="3" border class="mt-16">
                  <el-descriptions-item label="引用小说">{{ createDraft.novelTitle }}</el-descriptions-item>
                  <el-descriptions-item label="状态"><el-tag type="success">video_ready</el-tag></el-descriptions-item>
                  <el-descriptions-item label="快照">{{ createDraft.snapshotId }}</el-descriptions-item>
                </el-descriptions>
              </el-card>

              <el-card v-else-if="createStep === 2" shadow="never">
                <h3>确认引用范围</h3>
                <p class="muted">系统默认推荐首条范围，用户可以切换，但必须保证章节有正式正文和可引用快照。</p>
                <div class="video-range-grid">
                  <button
                    v-for="range in rangeOptions"
                    :key="range.value"
                    class="video-range-card"
                    :class="{ selected: createDraft.range === range.value }"
                    @click="createDraft.range = range.value"
                  >
                    <strong>{{ range.label }}</strong>
                    <span>{{ range.description }}</span>
                    <el-tag :type="range.recommended ? 'success' : 'warning'" effect="plain">{{ range.recommended ? '推荐' : '备选' }}</el-tag>
                  </button>
                </div>
              </el-card>

              <el-card v-else-if="createStep === 3" shadow="never">
                <h3>创建前检查</h3>
                <p class="muted">这里明确告诉用户：创建只保存引用快照，不生成视频。</p>
                <div class="check-list mt-16">
                  <div class="check-item passed"><strong>小说状态</strong><span>video_ready，通过</span></div>
                  <div class="check-item passed"><strong>章节正文</strong><span>3/3 章均有正式正文版本</span></div>
                  <div class="check-item passed"><strong>幂等保护</strong><span>idempotencyToken 已生成，同请求可复用结果</span></div>
                  <div class="check-item"><strong>后续能力</strong><span>P9 才开放旁白、配音、字幕、渲染和导出</span></div>
                </div>
              </el-card>

              <el-card v-else shadow="never">
                <h3>创建完成</h3>
                <p class="muted">项目已创建，引用快照已保存。主动作是查看快照，而不是生成视频。</p>
                <el-result icon="success" title="视频项目已创建" sub-title="VideoProject、VideoReference 和默认 VideoUnit 已生成。">
                  <template #extra>
                    <el-button type="primary" @click="openSnapshot(selectedProject)">查看引用快照</el-button>
                    <el-button @click="setActiveView('list')">回视频列表</el-button>
                  </template>
                </el-result>
              </el-card>

              <div class="split-actions">
                <el-button :disabled="createStep === 1" @click="createStep -= 1">上一步</el-button>
                <el-button type="primary" :loading="actionLoading" @click="nextCreateStep">{{ getCreateWizardNextLabel(createStep) }}</el-button>
              </div>
            </div>

            <aside class="step-side-panel">
              <el-card shadow="never">
                <h3>右侧摘要</h3>
                <div class="mini-list">
                  <div class="mini-item"><strong>全书评分</strong><span>92</span></div>
                  <div class="mini-item"><strong>视频化结论</strong><span>可引用</span></div>
                  <div class="mini-item"><strong>推荐范围</strong><span>{{ createDraft.rangeText }}</span></div>
                  <div class="mini-item"><strong>预计时长</strong><span>58-72 秒</span></div>
                  <div class="mini-item"><strong>当前风险</strong><span>低风险</span></div>
                </div>
              </el-card>
              <el-alert title="创建项目不会调用模型，也不会生成旁白、配音、字幕或视频文件。" type="warning" show-icon :closable="false" />
            </aside>
          </div>
        </el-card>
      </section>

      <section v-else-if="activeView === 'snapshot'">
        <el-card shadow="never">
          <template #header>
            <div class="section-title">
              <div>
                <h2>步骤 3：引用快照详情</h2>
                <p>看清这个视频项目引用了哪本小说、哪些章节、哪些正式版本。</p>
              </div>
              <div class="heading-actions">
                <el-button @click="setActiveView('list')">回视频列表</el-button>
                <el-button type="primary" :loading="actionLoading" @click="recheckReference">重新检测引用状态</el-button>
              </div>
            </div>
          </template>

          <el-alert v-if="snapshotNotice" :title="snapshotNotice" type="success" show-icon :closable="false" class="mb-16" />

          <div class="step-content-grid">
            <div>
              <div class="sub-stepper-panel mb-16">
                <button class="sub-step-card active"><strong>来源小说</strong><span>{{ selectedProject.novelTitle }}</span></button>
                <button class="sub-step-card done"><strong>章节版本</strong><span>{{ selectedProject.referenceVersionText }}</span></button>
                <button class="sub-step-card done"><strong>检查摘要</strong><span>{{ selectedProject.referenceStatusText }}</span></button>
                <button class="sub-step-card locked"><strong>操作日志</strong><span>P8 记录动作</span></button>
              </div>
              <el-table :data="chapterSnapshots" border stripe>
                <el-table-column prop="title" label="章节" min-width="180" />
                <el-table-column prop="referenceVersion" label="引用时正文版本" width="160" />
                <el-table-column prop="currentVersion" label="当前正式版本" width="160" />
                <el-table-column label="状态" width="120">
                  <template #default="{ row }"><el-tag :type="row.status === '一致' ? 'success' : 'danger'" effect="plain">{{ row.status }}</el-tag></template>
                </el-table-column>
                <el-table-column prop="summary" label="摘要" min-width="260" />
              </el-table>
            </div>

            <aside class="step-side-panel">
              <el-card shadow="never">
                <h3>引用快照摘要</h3>
                <div class="mini-list">
                  <div class="mini-item"><strong>VideoReference</strong><span>{{ selectedProject.referenceVersionText }}</span></div>
                  <div class="mini-item"><strong>小说</strong><span>{{ selectedProject.novelTitle }}</span></div>
                  <div class="mini-item"><strong>章节范围</strong><span>{{ selectedProject.chapterRangeText }}</span></div>
                  <div class="mini-item">
                    <strong>引用状态</strong>
                    <el-tag :type="getReferenceStatusTagType(selectedProject.referenceStatus)" effect="plain">{{ selectedProject.referenceStatus }}</el-tag>
                  </div>
                </div>
              </el-card>
              <el-card shadow="never">
                <h3>可做动作</h3>
                <p class="muted">重新检测引用状态、返回小说详情、查看异常历史。不能直接生成视频。</p>
                <div class="action-row">
                  <el-button @click="setActiveView('issue')">查看异常历史</el-button>
                  <el-button @click="setActiveView('generation')">查看后续生成入口</el-button>
                </div>
              </el-card>
            </aside>
          </div>
        </el-card>
      </section>

      <section v-else-if="activeView === 'issue'">
        <el-card shadow="never">
          <template #header>
            <div class="section-title">
              <div>
                <h2>步骤 4：引用异常处理</h2>
                <p>小说或章节变化后，视频项目不能被静默污染，必须展示异常等级、原因和处理动作。</p>
              </div>
              <div class="heading-actions">
                <el-button @click="setActiveView('list')">回视频列表</el-button>
                <el-button type="primary" :loading="actionLoading" @click="resolveIssue">确认已处理</el-button>
              </div>
            </div>
          </template>

          <el-alert :title="issueNotice" :type="issueNoticeType" show-icon :closable="false" class="mb-16" />

          <div class="step-content-grid">
            <div>
              <div class="sub-stepper-panel mb-16">
                <button class="sub-step-card active"><strong>查看异常</strong><span>异常等级和原因</span></button>
                <button class="sub-step-card done"><strong>判断影响</strong><span>影响章节和项目</span></button>
                <button class="sub-step-card done"><strong>选择处理</strong><span>回小说或停止</span></button>
                <button class="sub-step-card locked"><strong>处理结果</strong><span>记录日志</span></button>
              </div>
              <div class="flow-card-grid">
                <div class="flow-card">
                  <div class="flow-card-head"><strong>异常等级</strong><el-tag type="danger">blocking</el-tag></div>
                  <p>{{ currentOpenIssue?.issueReason || '当前暂无开放异常。' }}</p>
                </div>
                <div class="flow-card">
                  <div class="flow-card-head"><strong>影响范围</strong><el-tag type="warning">{{ currentOpenIssue?.affectedChapterIds?.join('、') || '待确认' }}</el-tag></div>
                  <p>影响视频项目：{{ selectedProject.title }}。P9 生成入口必须锁定。</p>
                </div>
                <div class="flow-card">
                  <div class="flow-card-head"><strong>推荐动作</strong><el-tag>回小说处理</el-tag></div>
                  <p>修复小说正文后重新检测，或者停止当前视频项目。</p>
                </div>
              </div>

              <el-card shadow="never" class="mt-16">
                <h3>处理动作</h3>
                <p class="muted">blocking 未处理前，后续生成入口保持灰态。忽略或停止必须填写原因。</p>
                <el-input v-model="issueReason" type="textarea" :rows="4" class="reason-input" placeholder="填写处理原因，例如：小说侧已决定保留当前引用版本，或该项目暂停投放。" />
                <div class="action-row">
                  <el-button type="primary" @click="returnToNovel">回小说处理</el-button>
                  <el-button :loading="actionLoading" @click="ignoreIssue">确认忽略 warning</el-button>
                  <el-button type="danger" :loading="actionLoading" @click="stopProject">停止视频项目</el-button>
                </div>
              </el-card>
            </div>

            <aside class="step-side-panel">
              <el-card shadow="never">
                <h3>处理记录</h3>
                <div class="mini-list">
                  <div v-for="log in issueLogs" :key="log.time + log.text" class="mini-item">
                    <strong>{{ log.time }}</strong>
                    <span>{{ log.text }}</span>
                  </div>
                </div>
              </el-card>
              <el-alert title="已发布视频后续不会被自动覆盖；P8 只记录风险和处理动作。" type="warning" show-icon :closable="false" />
            </aside>
          </div>
        </el-card>
      </section>

      <section v-else-if="activeView === 'generation'">
        <el-card shadow="never">
          <template #header>
            <div class="section-title">
              <div>
                <h2>步骤 5：待进入生成</h2>
                <p>这是 P9 的预留入口，当前只展示后续会做什么，不允许点击生成。</p>
              </div>
            </div>
          </template>
          <el-alert title="P8 验收时，这里必须保持灰态。研发不会实现旁白、TTS、字幕、渲染、预览、导出、发布和数据回填。" type="warning" show-icon :closable="false" />
          <div class="stage-overview-grid mt-16">
            <div class="stage-overview-card locked">
              <h3>旁白稿</h3>
              <p>P9 处理候选、编辑和确认。</p>
              <el-tag effect="plain">后续</el-tag>
            </div>
            <div class="stage-overview-card locked">
              <h3>配音</h3>
              <p>P9 接入 TTS、试听和确认。</p>
              <el-tag effect="plain">后续</el-tag>
            </div>
            <div class="stage-overview-card locked">
              <h3>字幕与渲染</h3>
              <p>P9 处理字幕、时间轴、简单循环背景和导出。</p>
              <el-tag effect="plain">后续</el-tag>
            </div>
            <div class="stage-overview-card locked">
              <h3>发布与回填</h3>
              <p>P10+ 后续规划，不进入任务包 8。</p>
              <el-tag effect="plain">后续</el-tag>
            </div>
          </div>
        </el-card>
      </section>
    </template>

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
import type { VideoReferenceDetailDTO } from '@ai-shortvideo/shared'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { tasks, videos } from '../mock/prototypeData'
import type { TaskItem } from '../types/prototype'
import {
  createVideoP8Metrics,
  createVideoP8ProjectDraft,
  createVideoP8RouteQuery,
  getCreateWizardNextLabel,
  getReferenceStatusTagType,
  getReferenceIssueActionState,
  getStepState,
  getVideoP8PrimaryAction,
  mapVideoProjectDtoToP8Project,
  mapVideoReferenceDetailToChapterRows,
  mapVideoSourceDtoToP8Source,
  resolveCreateWizardStepRequest,
  resolveVideoP8InitialView,
  resolveVideoP8ReferenceIssue,
  type VideoP8Project,
  type VideoP8Source,
  type VideoP8ViewKey,
} from '../modules/videos/model/videoP8View'
import {
  createVideoProject,
  getVideoReference,
  listVideoProjects,
  listVideoSources,
  recheckVideoReference,
  resolveVideoReferenceIssue,
  stopVideoProject,
} from '../modules/videos/services/videoService'
import { getApiMode } from '../shared/services/apiMode'

const route = useRoute()
const router = useRouter()
const isTaskMode = computed(() => route.path.startsWith('/tasks'))
const sourceMode = getApiMode()
const isBackendMode = sourceMode === 'backend'

const projects = ref<VideoP8Project[]>(videos.map((video) => ({ ...video })))
const selectedProject = ref<VideoP8Project>(projects.value[0])
const selectedReferenceDetail = ref<VideoReferenceDetailDTO | null>(null)
const activeView = ref<VideoP8ViewKey>(resolveVideoP8InitialView(route.query as Record<string, unknown>))
const taskDrawer = ref(false)
const selectedTask = ref<TaskItem>()
const listNotice = ref('')
const snapshotNotice = ref('')
const pageLoading = ref(false)
const actionLoading = ref(false)
const createStep = ref(2)
const createProjectCommitted = ref(false)
const createIdempotencyToken = ref(createClientToken('create-video'))
const createWizardNotice = ref('')
const issueReason = ref('')
const issueNotice = ref('第 5 章正式正文已清空，当前视频项目引用快照与小说当前版本不一致。P9 生成入口必须锁定。')
const issueNoticeType = ref<'success' | 'warning' | 'error'>('error')
const issueLogs = ref([
  { time: '07:20', text: '系统检测到 blocking 引用异常' },
  { time: '07:21', text: '推荐动作：回小说处理或停止项目' },
])

const filters = reactive({
  keyword: '',
  referenceStatus: 'all',
  lifecycleStatus: 'all',
})

const createDraft = reactive({
  novelId: 'novel_000001',
  novelTitle: '化学大秦',
  snapshotId: 'snapshot_mock_003',
  chapterIds: ['chapter_mock_001', 'chapter_mock_002', 'chapter_mock_003'],
  range: 'first',
  rangeText: '第 1-3 章',
})

const p8Steps: Array<{ key: VideoP8ViewKey; index: number; label: string; description: string }> = [
  { key: 'source', index: 1, label: '小说已待视频化', description: '从小说完成后承接' },
  { key: 'create', index: 2, label: '创建视频项目', description: '选择小说和章节范围' },
  { key: 'snapshot', index: 3, label: '保存引用快照', description: '冻结章节版本' },
  { key: 'issue', index: 4, label: '引用状态检查', description: '处理风险和阻塞' },
  { key: 'generation', index: 5, label: '待进入生成', description: 'P9 后续灰态入口' },
]

const createSteps = [
  { index: 1, label: '选择小说', description: '确认 video_ready' },
  { index: 2, label: '确认范围', description: '选择章节范围' },
  { index: 3, label: '创建前检查', description: '状态、版本、风险' },
  { index: 4, label: '创建完成', description: '查看引用快照' },
]

const videoReadyNovels = ref<VideoP8Source[]>([
  {
    id: 'novel_000001',
    title: '化学大秦',
    status: 'video_ready',
    snapshot: 'snapshot v3 · 2026-06-22 09:30',
    snapshotId: 'snapshot_mock_003',
    range: '第 1-3 章',
    chapterIds: ['chapter_mock_001', 'chapter_mock_002', 'chapter_mock_003'],
  },
  {
    id: 'novel-003',
    title: '玄门小师妹直播算命爆红',
    status: 'video_ready',
    snapshot: 'snapshot v2 · 2026-06-21 18:06',
    snapshotId: 'snapshot_mock_002',
    range: '第 1-2 章',
    chapterIds: ['chapter_mock_101', 'chapter_mock_102'],
  },
])

const rangeOptions = [
  { value: 'first', label: '推荐首条', description: '第 1-3 章，预计 58-72 秒。钩子强，适合首条验证。', recommended: true },
  { value: 'short', label: '短首条', description: '第 1-2 章，适合强钩子轻量试投。', recommended: true },
  { value: 'climax', label: '高潮片段', description: '第 8-10 章，冲突更强，但依赖前文理解。', recommended: false },
  { value: 'long', label: '整段试投', description: '第 1-6 章，时长偏长，当前不建议作为首条。', recommended: false },
]

const chapterSnapshots = computed(() => {
  if (selectedReferenceDetail.value) return mapVideoReferenceDetailToChapterRows(selectedReferenceDetail.value)

  return [
    { title: '第 1 章 盐场醒来', referenceVersion: 'body_v12', currentVersion: 'body_v12', status: '一致', summary: '穿越秦朝盐场，现代化学知识开始发挥作用。' },
    { title: '第 2 章 炼盐反转', referenceVersion: 'body_v8', currentVersion: 'body_v8', status: '一致', summary: '炼盐失败被质疑，主角用知识完成反转。' },
    { title: '第 3 章 黑火药惊世', referenceVersion: 'body_v7', currentVersion: 'body_v7', status: '一致', summary: '黑火药概念亮相，形成第一条视频高光。' },
  ]
})

const currentOpenIssue = computed(() => selectedReferenceDetail.value?.issues.find((issue) => issue.status === 'open') ?? null)

const metrics = computed(() => createVideoP8Metrics(projects.value))
const filteredProjects = computed(() =>
  projects.value.filter((project) => {
    const matchesKeyword = !filters.keyword || project.title.includes(filters.keyword) || project.novelTitle.includes(filters.keyword)
    const matchesReference = filters.referenceStatus === 'all' || project.referenceStatus === filters.referenceStatus
    const matchesLifecycle = filters.lifecycleStatus === 'all' || project.lifecycleStatus === filters.lifecycleStatus
    return matchesKeyword && matchesReference && matchesLifecycle
  }),
)

watch(
  () => route.query,
  (query) => {
    if (isTaskMode.value) return
    activeView.value = resolveVideoP8InitialView(query as Record<string, unknown>)
  },
  { immediate: true },
)

onMounted(() => {
  void loadVideoData()
})

watch(
  () => createDraft.range,
  (range) => {
    createDraft.rangeText = range === 'first' ? '第 1-3 章' : range === 'short' ? '第 1-2 章' : range === 'climax' ? '第 8-10 章' : '第 1-6 章'
  },
)

function setActiveView(view: VideoP8ViewKey) {
  activeView.value = view
  if (isTaskMode.value) return

  const novelId = typeof route.query.novelId === 'string' ? route.query.novelId : undefined
  const query = createVideoP8RouteQuery(view, novelId)
  const search = new URLSearchParams(query).toString()
  void router.push(search ? `/videos?${search}` : '/videos').catch(() => undefined)
}

async function loadVideoData() {
  if (!isBackendMode) return

  pageLoading.value = true
  try {
    const [sourceResult, projectResult] = await Promise.all([
      listVideoSources({ page: 1, pageSize: 20 }, sourceMode),
      listVideoProjects({ page: 1, pageSize: 50 }, sourceMode),
    ])
    videoReadyNovels.value = sourceResult.items.map(mapVideoSourceDtoToP8Source)
    projects.value = projectResult.items.map(mapVideoProjectDtoToP8Project)
    if (projects.value.length > 0) {
      selectedProject.value = projects.value[0]
    }
    const novelId = typeof route.query.novelId === 'string' ? route.query.novelId : undefined
    const matchedSource = videoReadyNovels.value.find((source) => source.id === novelId) ?? videoReadyNovels.value[0]
    if (matchedSource) applySourceToCreateDraft(matchedSource)
  } catch (error) {
    const message = error instanceof Error ? error.message : '视频数据加载失败'
    listNotice.value = `后端视频数据加载失败：${message}`
    ElMessage.error(listNotice.value)
  } finally {
    pageLoading.value = false
  }
}

function getMajorStepClass(step: VideoP8ViewKey) {
  const state = getStepState({
    step,
    activeView: activeView.value,
    hasCreatedProject: projects.value.length > 0,
    hasSnapshot: true,
    hasBlockingIssue: metrics.value.blocking > 0,
  })

  return {
    done: state === 'done',
    active: state === 'active',
    issue: state === 'issue',
    locked: state === 'locked',
  }
}

function getActionButtonType(intent: string) {
  if (intent === 'danger') return 'danger'
  if (intent === 'warning') return 'warning'
  if (intent === 'primary') return 'primary'
  return 'default'
}

function handleVideoAction(project: VideoP8Project) {
  const action = getVideoP8PrimaryAction(project)
  selectedProject.value = project
  if (action.target === 'snapshot') setActiveView('snapshot')
  else if (action.target === 'issue') setActiveView('issue')
  else if (action.target === 'record') {
    setActiveView('issue')
    issueNotice.value = '该项目已有处理记录，可查看原因和处理人。'
    issueNoticeType.value = 'success'
  }
}

async function openSnapshot(project: VideoP8Project) {
  selectedProject.value = project
  snapshotNotice.value = ''
  if (isBackendMode) {
    actionLoading.value = true
    try {
      selectedReferenceDetail.value = await getVideoReference(project.id, sourceMode)
      selectedProject.value = mapVideoProjectDtoToP8Project(selectedReferenceDetail.value.project)
      updateProject(selectedProject.value)
    } catch (error) {
      const message = error instanceof Error ? error.message : '引用快照加载失败'
      snapshotNotice.value = message
      ElMessage.error(message)
    } finally {
      actionLoading.value = false
    }
  }
  setActiveView('snapshot')
}

function openVideoWorkbench(project: VideoP8Project) {
  void router.push(`/videos/${project.id}`).catch(() => undefined)
}

function startCreateFromNovel(novel: VideoP8Source) {
  applySourceToCreateDraft(novel)
  createStep.value = 1
  createProjectCommitted.value = false
  createIdempotencyToken.value = createClientToken('create-video')
  createWizardNotice.value = ''
  setActiveView('create')
}

function applySourceToCreateDraft(novel: VideoP8Source) {
  createDraft.novelId = novel.id
  createDraft.novelTitle = novel.title
  createDraft.snapshotId = novel.snapshotId
  createDraft.chapterIds = novel.chapterIds
  createDraft.range = novel.chapterIds.length === 2 ? 'short' : 'first'
  createDraft.rangeText = novel.range
}

async function createVideoProjectFromDraft() {
  if (isBackendMode) {
    actionLoading.value = true
    try {
      const result = await createVideoProject(
        {
          novelId: createDraft.novelId,
          videoReadinessSnapshotId: createDraft.snapshotId,
          projectType: 'first_test',
          title: `${createDraft.novelTitle}：${createDraft.rangeText}`,
          chapterRange: {
            mode: createDraft.range === 'first' ? 'first_recommended' : 'custom',
            chapterIds: createDraft.range === 'first' ? [] : createDraft.chapterIds,
          },
          idempotencyToken: createIdempotencyToken.value,
        },
        sourceMode,
      )
      const project = mapVideoProjectDtoToP8Project(result.project)
      projects.value = [project, ...projects.value.filter((item) => item.id !== project.id)]
      selectedProject.value = project
      selectedReferenceDetail.value = result.reference
      createProjectCommitted.value = true
      listNotice.value = result.reusedExisting ? '已复用同一幂等请求创建的视频项目。' : '视频项目已创建，并已保存引用快照和默认视频单元。'
      snapshotNotice.value = '新项目引用快照已创建。'
    } catch (error) {
      const message = error instanceof Error ? error.message : '视频项目创建失败'
      createWizardNotice.value = message
      ElMessage.error(message)
      throw error
    } finally {
      actionLoading.value = false
    }
    return
  }

  const project = createVideoP8ProjectDraft({
    existingCount: projects.value.length,
    novelId: createDraft.novelId,
    novelTitle: createDraft.novelTitle,
    chapterRangeText: createDraft.rangeText,
    chapterCount: createDraft.rangeText === '第 1-2 章' ? 2 : createDraft.rangeText === '第 1-6 章' ? 6 : 3,
    createdAt: formatMinute(new Date()),
  })

  projects.value = [project, ...projects.value]
  selectedProject.value = project
  createProjectCommitted.value = true
  listNotice.value = '视频项目已创建，并已保存引用快照和默认视频单元。'
  snapshotNotice.value = '新项目引用快照已创建。'
}

function formatMinute(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function applyFilters() {
  listNotice.value = `筛选已应用：当前展示 ${filteredProjects.value.length} 个匹配的视频项目。`
}

function resetFilters() {
  filters.keyword = ''
  filters.referenceStatus = 'all'
  filters.lifecycleStatus = 'all'
  listNotice.value = '筛选已清空。'
}

async function nextCreateStep() {
  if (createStep.value < 4) {
    if (createStep.value === 3) {
      await createVideoProjectFromDraft()
    }
    createStep.value += 1
    createWizardNotice.value = ''
    return
  }

  snapshotNotice.value = '已从创建向导进入引用快照详情。'
  setActiveView('snapshot')
}

function requestCreateStep(step: number) {
  const result = resolveCreateWizardStepRequest({
    currentStep: createStep.value,
    requestedStep: step,
    hasCreatedProject: createProjectCommitted.value,
  })

  createStep.value = result.nextStep
  createWizardNotice.value = result.message ?? ''
  if (!result.allowed && result.message) {
    ElMessage.warning(result.message)
  }
}

function isCreateStepLocked(step: number) {
  return !resolveCreateWizardStepRequest({
    currentStep: createStep.value,
    requestedStep: step,
    hasCreatedProject: createProjectCommitted.value,
  }).allowed
}

async function recheckReference() {
  if (isBackendMode) {
    actionLoading.value = true
    try {
      const detail = await recheckVideoReference(
        selectedProject.value.id,
        {
          expectedReferenceVersion: selectedReferenceDetail.value?.versionNo ?? 1,
          reason: '用户在视频承接工作台重新检测引用状态',
          idempotencyToken: createClientToken('recheck-video-ref'),
        },
        sourceMode,
      )
      selectedReferenceDetail.value = detail
      selectedProject.value = mapVideoProjectDtoToP8Project(detail.project)
      updateProject(selectedProject.value)
      snapshotNotice.value = detail.issues.some((issue) => issue.status === 'open')
        ? '引用状态已重新检测：发现引用异常，请进入异常处理。'
        : '引用状态已重新检测：当前小说版本与快照一致。'
      ElMessage.success('引用状态已重新检测')
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : '引用状态重检失败'
      snapshotNotice.value = message
      ElMessage.error(message)
    } finally {
      actionLoading.value = false
    }
    return
  }

  snapshotNotice.value = '引用状态已重新检测：当前小说版本与快照一致。'
  selectedProject.value = {
    ...selectedProject.value,
    referenceStatus: 'normal',
    referenceStatusText: '引用正常',
  }
  updateProject(selectedProject.value)
  ElMessage.success('引用状态已重新检测')
}

function returnToNovel() {
  issueReason.value = '已返回小说侧处理章节正文问题'
  issueLogs.value.push({ time: '刚刚', text: '用户选择回小说处理' })
  ElMessage.info('已记录：回小说处理')
}

async function ignoreIssue() {
  const actionState = getReferenceIssueActionState(selectedProject.value.referenceStatus, 'ignore')
  if (!actionState.allowed) {
    issueNotice.value = actionState.message
    issueNoticeType.value = 'warning'
    ElMessage.warning(actionState.message)
    return
  }
  if (!requireIssueReason('确认忽略')) return
  if (isBackendMode) {
    await resolveBackendIssue('ignore', '已记录忽略原因')
    return
  }
  resolveSelectedProject('ignore', '已处理')
}

async function stopProject() {
  if (!requireIssueReason('停止项目')) return
  if (isBackendMode) {
    actionLoading.value = true
    try {
      const result = await stopVideoProject(
        selectedProject.value.id,
        {
          idempotencyToken: createClientToken('stop-video-project'),
          reason: issueReason.value,
        },
        sourceMode,
      )
      selectedReferenceDetail.value = result.reference
      selectedProject.value = mapVideoProjectDtoToP8Project(result.project)
      updateProject(selectedProject.value)
      issueLogs.value.push({ time: '刚刚', text: `项目已停止：${issueReason.value}` })
      issueNotice.value = '视频项目已停止，后续生成入口关闭。'
      issueNoticeType.value = 'success'
      ElMessage.success('视频项目已停止')
    } catch (error) {
      const message = error instanceof Error ? error.message : '停止项目失败'
      issueNotice.value = message
      issueNoticeType.value = 'warning'
      ElMessage.error(message)
    } finally {
      actionLoading.value = false
    }
    return
  }

  selectedProject.value = resolveVideoP8ReferenceIssue(selectedProject.value, { action: 'stop', reason: issueReason.value })
  updateProject(selectedProject.value)
  issueLogs.value.push({ time: '刚刚', text: `项目已停止：${issueReason.value}` })
  issueNotice.value = '视频项目已停止，后续生成入口关闭。'
  issueNoticeType.value = 'success'
  ElMessage.success('视频项目已停止')
}

async function resolveIssue() {
  if (!requireIssueReason('完成异常处理')) return
  if (isBackendMode) {
    await resolveBackendIssue('resolve', '已处理')
    return
  }
  resolveSelectedProject('resolve', '已处理')
}

async function resolveBackendIssue(action: 'ignore' | 'resolve', successText: string) {
  const issue = currentOpenIssue.value
  if (!issue) {
    issueNotice.value = '暂无待处理引用异常。'
    issueNoticeType.value = 'warning'
    ElMessage.warning(issueNotice.value)
    return
  }

  actionLoading.value = true
  try {
    const detail = await resolveVideoReferenceIssue(
      selectedProject.value.id,
      issue.id,
      {
        action,
        reason: issueReason.value,
        idempotencyToken: createClientToken('resolve-video-issue'),
      },
      sourceMode,
    )
    selectedReferenceDetail.value = detail
    selectedProject.value = mapVideoProjectDtoToP8Project(detail.project)
    updateProject(selectedProject.value)
    issueLogs.value.push({ time: '刚刚', text: `${successText}：${issueReason.value}` })
    issueNotice.value = selectedProject.value.referenceIssueSummary
    issueNoticeType.value = 'success'
    ElMessage.success(successText)
  } catch (error) {
    const message = error instanceof Error ? error.message : '处理引用异常失败'
    issueNotice.value = message
    issueNoticeType.value = 'warning'
    ElMessage.error(message)
  } finally {
    actionLoading.value = false
  }
}

function resolveSelectedProject(action: 'ignore' | 'resolve', referenceStatusText: string) {
  selectedProject.value = resolveVideoP8ReferenceIssue(selectedProject.value, { action, reason: issueReason.value })
  updateProject(selectedProject.value)
  issueLogs.value.push({ time: '刚刚', text: `${referenceStatusText}：${issueReason.value}` })
  issueNotice.value = selectedProject.value.referenceIssueSummary
  issueNoticeType.value = 'success'
  ElMessage.success(referenceStatusText)
}

function requireIssueReason(action: string) {
  if (issueReason.value.trim().length < 4) {
    issueNotice.value = `${action}前必须填写原因。`
    issueNoticeType.value = 'warning'
    return false
  }
  return true
}

function updateProject(project: VideoP8Project) {
  projects.value = projects.value.map((item) => (item.id === project.id ? project : item))
}

function openTask(row: TaskItem) {
  selectedTask.value = row
  taskDrawer.value = true
}

function createClientToken(prefix: string) {
  return `${prefix}-${Date.now()}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2)}`
}
</script>

<style scoped>
.video-p8-stepper {
  grid-template-columns: repeat(5, minmax(136px, 1fr));
}

.video-reference-expansion {
  grid-template-columns: 1fr 1.4fr 1fr;
}

.video-range-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.video-range-card {
  display: grid;
  gap: 10px;
  min-height: 150px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #fff;
  color: inherit;
  text-align: left;
}

.video-range-card.selected {
  border-color: #409eff;
  background: #ecf5ff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.12);
}

.video-range-card span {
  color: var(--muted);
  line-height: 1.6;
}

@media (max-width: 1280px) {
  .video-range-grid {
    grid-template-columns: 1fr;
  }
}
</style>
