import type { Page, Route } from '@playwright/test'

import type { SystemConfiguration } from '../../src/api/types'
import { makeAnalyticsRankings, makeAnalyticsSummary, makeAnalyticsTimeseries } from '../../src/test/analytics-fixture'
import { makeAuditLog, makeAuditLogSummary } from '../../src/test/audit-fixture'
import { makeCommandValidationResult } from '../../src/test/command-fixture'
import { makeJoinDecisionResult, makeJoinRequest, makeJoinRequestSummary } from '../../src/test/join-request-fixture'
import { makeKnowledgeConflict, makeKnowledgeEntrySummary, makeKnowledgeStatus } from '../../src/test/knowledge-fixture'
import { makeOverview } from '../../src/test/overview-fixture'
import { makeScheduledJob, makeScheduledJobRun } from '../../src/test/scheduled-job-fixture'
import { makeSystemHealth, makeSystemOperation } from '../../src/test/system-fixture'
import { makeAdminSession, makeAdminUser, makeSessionRevokeResult } from '../../src/test/user-fixture'

export type RecordedAdminRequest = {
  method: string
  path: string
  url: string
  headers: Record<string, string>
  body: unknown
}

export type AdminApiHarness = {
  requests: RecordedAdminRequest[]
  consoleErrors: string[]
  findRequest: (method: string, path: string) => RecordedAdminRequest | undefined
}

type InstallOptions = { authenticated?: boolean }

const permissions = [
  'overview:read', 'groups:read', 'groups:sync', 'settings:read', 'settings:write',
  'join_requests:read', 'join_requests:decide', 'join_policies:write',
  'commands:read', 'commands:write', 'scheduled_jobs:read', 'scheduled_jobs:write',
  'knowledge:read', 'knowledge:reload', 'analytics:read', 'analytics:export',
  'audit:read', 'users:manage', 'sessions:manage', 'system:read', 'config:write', 'napcat:restart',
] as const

const initialSystemConfiguration: SystemConfiguration = {
  yaml: 'app:\n  timezone: "Asia/Shanghai"\nadmin:\n  session_secret: __JXH_SECRET_UNCHANGED__\n',
  version: 7,
  masked_fields: ['admin.session_secret'],
  environment_overrides: [],
  restart_required: true,
}

const group = {
  group_id: '10001', name: '精弘网络维护群', member_count: 428, max_member_count: 500,
  bot_role: 'admin' as const, snapshot_state: 'fresh' as const,
  last_synced_at: '2026-07-28T05:00:00Z',
  features: [{ key: 'ai_qa' as const, enabled: true, source: 'group_override' as const }],
}

const auditSummary = makeAuditLogSummary({
  request_id: 'request-01HZY8Q9P2R7V4N6M8K1T3W5X7',
  target: {
    type: 'group_settings',
    id: 'group-settings-01HZY8Q9P2R7V4N6M8K1T3W5X7',
    display_name: '精弘网络维护群超长名称用于验证窄屏布局不会横向溢出',
  },
})
const auditDetail = makeAuditLog({
  ...auditSummary,
  user_agent: 'Mozilla/5.0 Chrome/150.0.0.0 管理终端兼容性验收',
})

const features = {
  keyword_reply: { enabled: true }, ai_qa: { enabled: true }, quote: { enabled: true },
  link_cleaner: { enabled: false },
  welcome: { enabled: true, message_template: '欢迎 {{member_qq}} 加入 {{group_name}}' },
  custom_commands: { enabled: true },
}

const authContext = {
  user: {
    user_id: 'user-1', username: 'root', display_name: '超级管理员', role: 'super_admin' as const,
    qq_user_id: '10001', enabled: true, last_login_at: '2026-07-28T04:00:00Z',
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-28T04:00:00Z', version: 3,
  },
  session: {
    session_id: 'session-1', user_id: 'user-1', status: 'active' as const, current: true,
    ip_address: '127.0.0.1', user_agent: 'Chrome 150 / Windows',
    created_at: '2026-07-28T04:00:00Z', last_seen_at: '2026-07-28T08:20:00Z',
    expires_at: '2026-07-28T12:00:00Z', revoked_at: null,
  },
  permissions: [...permissions],
  csrf_token: 'csrf-token-with-at-least-thirty-two-characters',
}

async function recordRequest(route: Route): Promise<RecordedAdminRequest> {
  const request = route.request()
  let body: unknown = null
  if (request.postData()) {
    try { body = request.postDataJSON() } catch { body = request.postData() }
  }
  const url = new URL(request.url())
  return {
    method: request.method(),
    path: url.pathname.replace('/api/admin/v1', ''),
    url: request.url(),
    headers: await request.allHeaders(),
    body,
  }
}

function apiError(code: string, message: string) {
  return { error: { code, message, request_id: 'e2e-request', fields: {}, retryable: false } }
}

export async function installAdminApi(page: Page, options: InstallOptions = {}): Promise<AdminApiHarness> {
  const requests: RecordedAdminRequest[] = []
  const consoleErrors: string[] = []
  let authenticated = options.authenticated ?? true
  let systemConfiguration = { ...initialSystemConfiguration }

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.route('**/api/admin/v1/**', async (route) => {
    const recorded = await recordRequest(route)
    requests.push(recorded)
    const { method, path } = recorded

    if (method === 'GET' && path === '/auth/me') {
      if (!authenticated) {
        await route.fulfill({ status: 401, json: apiError('authentication_required', '请先登录。') })
      } else await route.fulfill({ json: authContext })
      return
    }
    if (method === 'POST' && path === '/auth/login') {
      authenticated = true
      await route.fulfill({ json: authContext })
      return
    }
    if (method === 'POST' && path === '/auth/logout') {
      authenticated = false
      await route.fulfill({ status: 204, body: '' })
      return
    }

    if (method === 'GET' && path === '/overview') {
      await route.fulfill({ json: makeOverview() }); return
    }
    if (method === 'GET' && path === '/groups') {
      await route.fulfill({ json: { items: [group], next_cursor: null, has_more: false } }); return
    }
    if (method === 'POST' && path === '/groups/sync') {
      await route.fulfill({ json: { synced_at: '2026-07-28T08:30:00Z', added_count: 1, updated_count: 2, removed_count: 0, total_count: 23 } }); return
    }
    if (method === 'GET' && path === '/groups/10001/settings') {
      await route.fulfill({ json: {
        group_id: '10001', effective: features, overrides: { ai_qa: { enabled: false } },
        global_version: 7, version: 3, updated_at: '2026-07-28T05:01:00Z', updated_by: null,
      } }); return
    }
    if (method === 'PATCH' && path === '/groups/10001/settings') {
      const patch = recorded.body as { features?: Record<string, unknown> }
      await route.fulfill({ json: {
        group_id: '10001', effective: features,
        overrides: patch.features?.ai_qa ? { ai_qa: patch.features.ai_qa } : {},
        global_version: 7, version: 4, updated_at: '2026-07-28T08:31:00Z', updated_by: null,
      } }); return
    }
    if (method === 'GET' && path === '/groups/10001') {
      await route.fulfill({ json: group }); return
    }
    if (method === 'GET' && path === '/settings') {
      await route.fulfill({ json: { features, version: 7, updated_at: '2026-07-28T05:00:00Z', updated_by: null } }); return
    }
    if (method === 'PATCH' && path === '/settings') {
      await route.fulfill({ json: { features, version: 8, updated_at: '2026-07-28T08:31:00Z', updated_by: null } }); return
    }

    if (method === 'GET' && path === '/join-requests') {
      await route.fulfill({ json: { items: [makeJoinRequestSummary()], next_cursor: null, has_more: false } }); return
    }
    if (method === 'GET' && path === '/join-requests/flag-10001/decisions') {
      await route.fulfill({ json: { items: [], next_cursor: null, has_more: false } }); return
    }
    if (method === 'POST' && path === '/join-requests/flag-10001/decisions') {
      await route.fulfill({ json: makeJoinDecisionResult() }); return
    }
    if (method === 'GET' && path === '/join-requests/flag-10001') {
      await route.fulfill({ json: makeJoinRequest() }); return
    }
    if (method === 'GET' && path === '/groups/10001/join-request-policy') {
      await route.fulfill({ json: {
        group_id: '10001', enabled: false, mode: 'ai_fields_complete',
        required_fields: ['student_id', 'name', 'major'], auto_reject: false,
        version: 1, updated_at: '2026-07-28T05:00:00Z', updated_by: null,
      } }); return
    }

    if (method === 'POST' && path === '/commands/validate') {
      await route.fulfill({ json: makeCommandValidationResult() }); return
    }
    if (method === 'GET' && path === '/commands') {
      await route.fulfill({ json: { items: [], next_cursor: null, has_more: false } }); return
    }

    if (method === 'GET' && path === '/scheduled-jobs') {
      await route.fulfill({ json: { items: [makeScheduledJob()], next_cursor: null, has_more: false } }); return
    }
    if (method === 'GET' && path === '/scheduled-jobs/job-1') {
      await route.fulfill({ json: makeScheduledJob({ name: '详情中的每日提醒', version: 12 }) }); return
    }
    if (method === 'PATCH' && path === '/scheduled-jobs/job-1') {
      const patch = recorded.body as { name?: string }
      await route.fulfill({ json: makeScheduledJob({ name: patch.name ?? '详情中的每日提醒', version: 13 }) }); return
    }
    if (method === 'GET' && path === '/scheduled-jobs/job-1/runs') {
      await route.fulfill({ json: { items: [makeScheduledJobRun()], next_cursor: null, has_more: false } }); return
    }
    if (method === 'POST' && path === '/scheduled-jobs/job-1/test-send') {
      await route.fulfill({ json: makeScheduledJobRun({ kind: 'test', result: 'success' }) }); return
    }

    if (method === 'GET' && path === '/knowledge/status') {
      await route.fulfill({ json: makeKnowledgeStatus() }); return
    }
    if (method === 'GET' && path === '/knowledge/entries') {
      await route.fulfill({ json: { items: [makeKnowledgeEntrySummary()], next_cursor: null, has_more: false } }); return
    }
    if (method === 'GET' && path === '/knowledge/conflicts') {
      await route.fulfill({ json: { items: [makeKnowledgeConflict()], next_cursor: null, has_more: false } }); return
    }
    if (method === 'POST' && path === '/knowledge/reload') {
      await route.fulfill({ status: 202, json: { operation_id: 'reload-1', status: 'accepted', started_at: '2026-07-28T08:40:00Z', completed_at: null, error_code: null } }); return
    }

    if (method === 'GET' && path === '/analytics/summary') {
      await route.fulfill({ json: makeAnalyticsSummary() }); return
    }
    if (method === 'GET' && path === '/analytics/timeseries') {
      await route.fulfill({ json: makeAnalyticsTimeseries() }); return
    }
    if (method === 'GET' && path === '/analytics/rankings') {
      await route.fulfill({ json: makeAnalyticsRankings() }); return
    }
    if (method === 'GET' && path === '/analytics/export') {
      await route.fulfill({
        body: 'rank,name,value\n1,精弘网络维护群,8420',
        contentType: 'text/csv; charset=utf-8',
        headers: { 'Content-Disposition': 'attachment; filename="analytics.csv"', 'X-Export-Row-Count': '1' },
      }); return
    }

    if (method === 'GET' && path === '/audit-logs') {
      await route.fulfill({ json: { items: [auditSummary], next_cursor: null, has_more: false } }); return
    }
    if (method === 'GET' && path === '/audit-logs/audit-1') {
      await route.fulfill({ json: auditDetail }); return
    }

    if (method === 'GET' && path === '/users') {
      await route.fulfill({ json: { items: [makeAdminUser()], next_cursor: null, has_more: false } }); return
    }
    if (method === 'GET' && path === '/users/user-2') {
      await route.fulfill({ json: makeAdminUser({ display_name: '详情维护员', role: 'observer', version: 9 }) }); return
    }
    if (method === 'PATCH' && path === '/users/user-2') {
      const patch = recorded.body as { display_name?: string }
      await route.fulfill({ json: makeAdminUser({ display_name: patch.display_name ?? '详情维护员', role: 'observer', version: 10 }) }); return
    }
    if (method === 'GET' && path === '/sessions') {
      await route.fulfill({ json: { items: [makeAdminSession()], next_cursor: null, has_more: false } }); return
    }
    if (method === 'POST' && path === '/sessions/session-2/revoke') {
      await route.fulfill({ json: makeSessionRevokeResult() }); return
    }

    if (method === 'GET' && path === '/system/health') {
      await route.fulfill({ json: makeSystemHealth() }); return
    }
    if (method === 'GET' && path === '/system/configuration') {
      await route.fulfill({ json: systemConfiguration }); return
    }
    if (method === 'PATCH' && path === '/system/configuration') {
      const patch = recorded.body as { yaml?: string }
      systemConfiguration = {
        ...systemConfiguration,
        yaml: patch.yaml ?? systemConfiguration.yaml,
        version: systemConfiguration.version + 1,
      }
      await route.fulfill({ json: systemConfiguration }); return
    }
    if (method === 'POST' && path === '/system/napcat/restart') {
      await route.fulfill({ status: 202, json: makeSystemOperation() }); return
    }

    await route.fulfill({ status: 404, json: apiError('e2e_route_missing', `${method} ${path} 没有 fixture。`) })
  })

  return {
    requests,
    consoleErrors,
    findRequest: (method, path) => [...requests].reverse().find((request) => request.method === method && request.path === path),
  }
}
