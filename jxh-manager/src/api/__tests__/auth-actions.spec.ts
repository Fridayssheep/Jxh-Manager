import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authApi } from '@/api/auth'
import { api } from '@/api/client'
import { makeAuthContext } from '@/test/auth-fixture'

describe('authApi account actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('changes the current password with an idempotency key', async () => {
    const context = makeAuthContext()
    const post = vi.spyOn(api, 'POST').mockResolvedValue({
      data: context, response: new Response('{}', { status: 200 }),
    } as never)

    const result = await authApi.changePassword('current-password', 'new-password-value')

    expect(result).toEqual(context)
    expect(post).toHaveBeenCalledWith('/auth/change-password', {
      params: { header: { 'Idempotency-Key': expect.stringMatching(/^[A-Za-z0-9._:-]+$/) } },
      body: { current_password: 'current-password', new_password: 'new-password-value' },
    })
  })
})
