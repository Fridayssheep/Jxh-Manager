import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/api/client'
import { knowledgeApi } from '@/api/knowledge'

describe('knowledgeApi action boundaries', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('starts one idempotent reload operation', async () => {
    const operation = { operation_id: 'reload-1', status: 'accepted' as const, started_at: '2026-07-28T05:00:00Z', completed_at: null, error_code: null }
    const post = vi.spyOn(api, 'POST').mockResolvedValue({ data: operation, response: new Response('{}', { status: 202 }) })

    await knowledgeApi.reload()

    expect(post).toHaveBeenCalledWith('/knowledge/reload', {
      params: { header: { 'Idempotency-Key': expect.stringMatching(/^[A-Za-z0-9._:-]+$/) } },
    })
  })
})
