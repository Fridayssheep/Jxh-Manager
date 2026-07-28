import { createRouter, createWebHistory } from 'vue-router'

import { pinia } from '@/stores'
import { useAuthStore } from '@/stores/auth'
import OverviewView from '@/views/overview/OverviewView.vue'
import GroupsView from '@/views/groups/GroupsView.vue'
import GroupDetailView from '@/views/groups/GroupDetailView.vue'
import GlobalSettingsView from '@/views/settings/GlobalSettingsView.vue'
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
    {
      path: '/groups',
      name: 'groups',
      component: GroupsView,
      meta: { permission: 'groups:read', title: '群与设置' },
    },
    {
      path: '/groups/:groupId',
      name: 'group-detail',
      component: GroupDetailView,
      meta: { permission: 'groups:read', title: '群详情' },
    },
    {
      path: '/settings',
      name: 'global-settings',
      component: GlobalSettingsView,
      meta: { permission: 'settings:read', title: '全局设置' },
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
