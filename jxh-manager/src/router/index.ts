import { createRouter, createWebHistory } from 'vue-router'

import { pinia } from '@/stores'
import { useAuthStore } from '@/stores/auth'
import OverviewView from '@/views/overview/OverviewView.vue'
import GroupsView from '@/views/groups/GroupsView.vue'
import GroupDetailView from '@/views/groups/GroupDetailView.vue'
import GlobalSettingsView from '@/views/settings/GlobalSettingsView.vue'
import JoinRequestsView from '@/views/join-requests/JoinRequestsView.vue'
import CommandsView from '@/views/commands/CommandsView.vue'
import CommandEditorView from '@/views/commands/CommandEditorView.vue'
import ScheduledJobsView from '@/views/scheduled-jobs/ScheduledJobsView.vue'
import KnowledgeView from '@/views/knowledge/KnowledgeView.vue'
import AnalyticsView from '@/views/analytics/AnalyticsView.vue'
import AuditLogsView from '@/views/audit/AuditLogsView.vue'
import UsersView from '@/views/users/UsersView.vue'
import AccountView from '@/views/account/AccountView.vue'
import SystemView from '@/views/system/SystemView.vue'
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
    {
      path: '/join-requests',
      name: 'join-requests',
      component: JoinRequestsView,
      meta: { permission: 'join_requests:read', title: '入群审批' },
    },
    {
      path: '/commands',
      name: 'commands',
      component: CommandsView,
      meta: { permission: 'commands:read', title: '自定义命令' },
    },
    {
      path: '/commands/:commandId',
      name: 'command-editor',
      component: CommandEditorView,
      meta: { permission: 'commands:read', title: '命令编辑器' },
    },
    {
      path: '/scheduled-jobs',
      name: 'scheduled-jobs',
      component: ScheduledJobsView,
      meta: { permission: 'scheduled_jobs:read', title: '定时任务' },
    },
    {
      path: '/knowledge',
      name: 'knowledge',
      component: KnowledgeView,
      meta: { permission: 'knowledge:read', title: '知识库' },
    },
    {
      path: '/analytics',
      name: 'analytics',
      component: AnalyticsView,
      meta: { permission: 'analytics:read', title: '统计分析' },
    },
    {
      path: '/audit-logs',
      name: 'audit-logs',
      component: AuditLogsView,
      meta: { permission: 'audit:read', title: '审计日志' },
    },
    {
      path: '/users',
      name: 'users',
      component: UsersView,
      meta: { permission: 'users:manage', title: '账号与权限' },
    },
    {
      path: '/account',
      name: 'account',
      component: AccountView,
      meta: { title: '个人账号' },
    },
    {
      path: '/system',
      name: 'system',
      component: SystemView,
      meta: { permission: 'system:read', title: '系统设置' },
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
