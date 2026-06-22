import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    redirect: '/novels'
  },
  {
    path: '/novels',
    component: () => import('../modules/novels/pages/NovelListPage.vue')
  },
  {
    path: '/novels/new',
    component: () => import('../modules/novels/pages/NovelCreatePage.vue')
  },
  {
    path: '/novels/:novelId',
    component: () => import('../modules/novels/pages/NovelDetailPage.vue')
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;

