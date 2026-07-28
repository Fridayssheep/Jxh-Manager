import { describe, expect, it, vi } from 'vitest'

import { auditApi } from '@/api/audit'
import { api } from '@/api/client'
import { makeAuditLogSummary } from '@/test/audit-fixture'

describe('auditApi', () => {
  it('submits every audit filter with the opaque cursor', async () => {
    const get = vi.spyOn(api, 'GET').mockResolvedValue({
      data: { items: [makeAuditLogSummary()], next_cursor: 'cursor-2', has_more: true },
      response: new Response('{}', { status: 200 }),
    } as never)

    await auditApi.list({
      actorUserId: 'user-1', actorType: 'admin_user', action: 'settings.update',
      targetType: 'group_settings', targetId: '10001', result: 'success',
      from: '2026-07-01T00:00:00Z', to: '2026-07-28T23:59:59Z', cursor: 'cursor-1', limit: 30,
    })

    expect(get).toHaveBeenCalledWith('/audit-logs', { params: { query: {
      actor_user_id: 'user-1', actor_type: 'admin_user', action: 'settings.update',
      target_type: 'group_settings', target_id: '10001', result: 'success',
      from: '2026-07-01T00:00:00Z', to: '2026-07-28T23:59:59Z', cursor: 'cursor-1', limit: 30,
    } } })
  })
})
