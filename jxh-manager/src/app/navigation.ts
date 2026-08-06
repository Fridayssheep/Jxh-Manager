import type { Component } from 'vue'
import {
  BookOpen,
  ChartNoAxesCombined,
  ClipboardCheck,
  DatabaseZap,
  Clock3,
  LayoutDashboard,
  ScrollText,
  Settings,
  SquareTerminal,
  UserCog,
  UsersRound,
} from '@lucide/vue'

import type { Permission } from '@/api/types'

export type NavigationItem = {
  label: string
  to: string
  icon: Component
  permissions: Permission[]
  exact?: boolean
  badgeKey?: 'pending_join_requests'
}

export const primaryNavigation: NavigationItem[] = [
  {
    label: '总览',
    to: '/',
    icon: LayoutDashboard,
    permissions: ['overview:read'],
    exact: true,
  },
  {
    label: '群与设置',
    to: '/groups',
    icon: UsersRound,
    permissions: ['groups:read', 'settings:read'],
  },
  {
    label: '入群审批',
    to: '/join-requests',
    icon: ClipboardCheck,
    permissions: ['join_requests:read'],
    badgeKey: 'pending_join_requests',
  },
  {
    label: '审批规则与证据',
    to: '/join-request-rules',
    icon: DatabaseZap,
    permissions: ['join_requests:read'],
  },
  {
    label: '自定义命令',
    to: '/commands',
    icon: SquareTerminal,
    permissions: ['commands:read'],
  },
  {
    label: '定时任务',
    to: '/scheduled-jobs',
    icon: Clock3,
    permissions: ['scheduled_jobs:read'],
  },
  {
    label: '知识库',
    to: '/knowledge',
    icon: BookOpen,
    permissions: ['knowledge:read'],
  },
  {
    label: '统计分析',
    to: '/analytics',
    icon: ChartNoAxesCombined,
    permissions: ['analytics:read'],
  },
]

export const managementNavigation: NavigationItem[] = [
  {
    label: '审计日志',
    to: '/audit-logs',
    icon: ScrollText,
    permissions: ['audit:read'],
  },
  {
    label: '账号与权限',
    to: '/users',
    icon: UserCog,
    permissions: ['users:manage'],
  },
  {
    label: '系统设置',
    to: '/system',
    icon: Settings,
    permissions: ['system:read'],
  },
]

export function canAccessNavigation(
  item: NavigationItem,
  permissions: readonly Permission[],
): boolean {
  return item.permissions.some((permission) => permissions.includes(permission))
}
