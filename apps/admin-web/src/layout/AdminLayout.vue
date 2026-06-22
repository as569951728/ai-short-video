<template>
  <el-container class="admin-shell">
    <el-header class="topbar" height="52px">
      <div class="brand" @click="router.push('/novels')">
        <div class="brand-mark">AI</div>
        <div>
          <div class="brand-title">短视频小说系统</div>
          <div class="brand-subtitle">AI Novel Studio</div>
        </div>
      </div>

      <el-menu class="top-menu" mode="horizontal" :ellipsis="false" :default-active="activeTop">
        <el-menu-item index="novels" @click="router.push('/novels')">小说系统</el-menu-item>
        <el-menu-item index="videos" @click="router.push('/videos')">视频系统</el-menu-item>
        <el-menu-item index="tasks" @click="router.push('/tasks')">任务中心</el-menu-item>
        <el-menu-item index="hotspots" disabled>热点分析</el-menu-item>
        <el-menu-item index="settings" disabled>系统配置</el-menu-item>
      </el-menu>

      <div class="top-actions">
        <el-input v-model="keyword" class="global-search" size="small" placeholder="搜索小说 / 视频 / 任务" clearable>
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-badge :value="3" class="notice-badge">
          <el-button :icon="Bell" circle />
        </el-badge>
        <el-dropdown>
          <el-button text>gadmin</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item>个人设置</el-dropdown-item>
              <el-dropdown-item>退出</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </el-header>

    <div class="tab-strip">
      <el-tag v-for="tab in tabs" :key="tab.path" :type="tab.path === route.path ? 'primary' : 'info'" effect="plain" @click="router.push(tab.path)">
        {{ tab.title }}
      </el-tag>
    </div>

    <el-container class="workspace">
      <el-aside width="208px" class="sidebar">
        <el-menu :default-active="activeMenu" router>
          <el-sub-menu index="novels">
            <template #title>
              <el-icon><Notebook /></el-icon>
              <span>小说系统</span>
            </template>
            <el-menu-item index="/novels">小说列表</el-menu-item>
            <el-menu-item index="/novels/new">创建小说</el-menu-item>
          </el-sub-menu>
          <el-menu-item index="/videos">
            <el-icon><VideoCamera /></el-icon>
            <span>视频列表</span>
          </el-menu-item>
          <el-menu-item index="/tasks">
            <el-icon><Operation /></el-icon>
            <span>生成任务</span>
          </el-menu-item>
          <el-sub-menu index="settings">
            <template #title>
              <el-icon><Setting /></el-icon>
              <span>系统配置</span>
            </template>
            <el-menu-item index="/settings/providers" disabled>模型供应商</el-menu-item>
            <el-menu-item index="/settings/strategies" disabled>策略配置</el-menu-item>
            <el-menu-item index="/settings/prompts" disabled>提示词模板</el-menu-item>
          </el-sub-menu>
        </el-menu>
      </el-aside>

      <el-main class="main-panel">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bell, Notebook, Operation, Search, Setting, VideoCamera } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const keyword = ref('')

const activeTop = computed(() => String(route.meta.menu || 'novels'))
const activeMenu = computed(() => {
  if (route.path.startsWith('/videos')) return '/videos'
  if (route.path.startsWith('/tasks')) return '/tasks'
  if (route.path === '/novels/new') return '/novels/new'
  return '/novels'
})

const tabs = computed(() => [
  { title: '小说列表', path: '/novels' },
  ...(route.path !== '/novels' ? [{ title: String(route.meta.title || '当前页面'), path: route.path }] : []),
])
</script>
