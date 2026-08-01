import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/api/client'
import { commandsApi } from '@/api/commands'
import type { Command } from '@/api/types'

const command = {
  command_id: 'cmd-1',
  name: '/welcome',
  display_name: '欢迎成员',
  description: '发送欢迎消息',
  scope: { type: 'global', group_ids: [] },
  trigger_permission: 'group_admin',
  parameters: [],
  actions: [{ type: 'reply_text', template: '欢迎加入' }],
  enabled: false,
  status: 'draft',
  version: 7,
  created_at: '2026-07-28T00:00:00Z',
  updated_at: '2026-07-28T00:00:00Z',
  updated_by: {
    type: 'admin_user',
    user_id: 'user-1',
    qq_user_id: null,
    display_name: '维护员',
  },
} satisfies Command

describe('commandsApi mutation boundaries', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('sends the loaded version when updating a command', async () => {
    const patch = vi.spyOn(api, 'PATCH').mockResolvedValue({
      data: command,
      response: new Response(JSON.stringify(command), { status: 200 }),
    })

    await commandsApi.update('cmd-1', { enabled: true }, 7)

    expect(patch).toHaveBeenCalledWith(
      '/commands/{command_id}',
      expect.objectContaining({
        params: {
          path: { command_id: 'cmd-1' },
          header: { 'If-Match': '"7"' },
        },
      }),
    )
  })

  it('sends the loaded version when deleting a command', async () => {
    const remove = vi.spyOn(api, 'DELETE').mockResolvedValue({
      data: undefined,
      response: new Response(null, { status: 204 }),
    })

    await commandsApi.delete('cmd-1', 7)

    expect(remove).toHaveBeenCalledWith('/commands/{command_id}', {
      params: {
        path: { command_id: 'cmd-1' },
        header: { 'If-Match': '"7"' },
      },
    })
  })
})
