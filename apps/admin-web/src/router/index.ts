import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import NovelList from '../pages/NovelList.vue'
import NovelCreateWizard from '../pages/NovelCreateWizard.vue'
import NovelDetailWorkbench from '../pages/NovelDetailWorkbench.vue'
import ChapterDetailWorkbench from '../pages/ChapterDetailWorkbench.vue'
import VideoListTask from '../pages/VideoListTask.vue'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/novels' },
  {
    path: '/novels',
    component: NovelList,
    meta: { title: '小说列表', module: 'novels', menu: 'novels', menuKey: '/novels', keepAlive: true, permissionCodes: [], breadcrumb: ['小说系统', '小说列表'] },
  },
  {
    path: '/novels/new',
    component: NovelCreateWizard,
    meta: { title: '创建小说', module: 'novels', menu: 'novels', menuKey: '/novels/new', keepAlive: false, permissionCodes: [], breadcrumb: ['小说系统', '创建小说'] },
  },
  {
    path: '/novels/:novelId',
    component: NovelDetailWorkbench,
    meta: { title: '小说详情', module: 'novels', menu: 'novels', menuKey: '/novels', keepAlive: false, permissionCodes: [], breadcrumb: ['小说系统', '小说详情'] },
  },
  {
    path: '/novels/:novelId/chapters/:chapterId',
    component: ChapterDetailWorkbench,
    meta: { title: '章节详情', module: 'novels', menu: 'novels', menuKey: '/novels', keepAlive: false, permissionCodes: [], breadcrumb: ['小说系统', '章节详情'] },
  },
  {
    path: '/videos',
    component: VideoListTask,
    meta: { title: '视频列表', module: 'videos', menu: 'videos', menuKey: '/videos', mode: 'videos', keepAlive: true, permissionCodes: [], breadcrumb: ['视频系统', '视频列表'] },
  },
  {
    path: '/tasks',
    component: VideoListTask,
    meta: { title: '任务中心', module: 'generation', menu: 'tasks', menuKey: '/tasks', mode: 'tasks', keepAlive: true, permissionCodes: [], breadcrumb: ['生成任务', '任务中心'] },
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
