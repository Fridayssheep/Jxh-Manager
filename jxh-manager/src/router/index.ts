import { createRouter, createWebHistory } from 'vue-router'

import { pinia } from '@/stores'
import { useAuthStore } from '@/stores/auth'
import OverviewView from '@/views/overview/OverviewView.vue'
import { resolveAuthNavigation } from './guard'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/auth/LoginView.vue'),
      meta: { public: true, title: '登录' },
    },
    {
      path: '/',
      name: 'overview',
      component: OverviewView,
      meta: { permission: 'overview:read', title: '总览' },
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore(pinia)
  await auth.bootstrap()

  return resolveAuthNavigation(
    {
      name: to.name,
      fullPath: to.fullPath,
      public: to.meta.public,
      permission: to.meta.permission,
    },
    {
      authenticated: auth.isAuthenticated,
      permissions: auth.permissions,
    },
  )
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · 精小弘管理端` : '精小弘管理端'
})

export default router
