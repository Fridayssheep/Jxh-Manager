import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/api/client'
import { joinRequestsApi } from '@/api/join-requests'
import { makeJoinDecisionResult } from '@/test/join-request-fixture'

describe('joinRequestsApi mutation boundaries', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('sends the resource version and idempotency key for a single decision', async () => {
    const result = makeJoinDecisionResult()
    const post = vi.spyOn(api, 'POST').mockResolvedValue({
      data: result,
      response: new Response(JSON.stringify(result), { status: 200 }),
    })

    await joinRequestsApi.decide('flag-10001', { action: 'approve', reason: '信息完整' }, 7)

    expect(post).toHaveBeenCalledWith(
      '/join-requests/{request_id}/decisions',
      expect.objectContaining({
        params: {
          path: { request_id: 'flag-10001' },
          header: {
            'If-Match': '"7"',
            'Idempotency-Key': expect.stringMatching(/^[A-Za-z0-9._:-]+$/),
          },
        },
      }),
    )
  })

  it('creates one idempotency key for the complete bulk decision', async () => {
    const bulkResult = {
      group_id: '10001',
      action: 'approve' as const,
      items: [],
      confirmed_count: 2,
      failed_count: 0,
      unknown_count: 0,
    }
    const post = vi.spyOn(api, 'POST').mockResolvedValue({
      data: bulkResult,
      response: new Response(JSON.stringify(bulkResult), { status: 200 }),
    })

    await joinRequestsApi.bulkDecide({
      group_id: '10001',
      action: 'approve',
      items: [
        { request_id: 'flag-1', version: 3 },
        { request_id: 'flag-2', version: 4 },
      ],
    })

    expect(post).toHaveBeenCalledWith(
      '/join-requests/bulk-decisions',
      expect.objectContaining({
        params: {
          header: { 'Idempotency-Key': expect.stringMatching(/^[A-Za-z0-9._:-]+$/) },
        },
      }),
    )
  })
})
