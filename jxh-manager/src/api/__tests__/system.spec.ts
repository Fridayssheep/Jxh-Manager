import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/api/client'
import { systemApi } from '@/api/system'
import { makeSystemHealth, makeSystemOperation } from '@/test/system-fixture'

describe('systemApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('66666666-6666-4666-8666-666666666666')
  })

  it('reads the system health snapshot', async () => {
    const health = makeSystemHealth()
    const get = vi.spyOn(api, 'GET').mockResolvedValue({
      data: health, response: new Response('{}', { status: 200 }),
    } as never)

    await expect(systemApi.getHealth()).resolves.toEqual(health)
    expect(get).toHaveBeenCalledWith('/system/health')
  })

  it('restarts NapCat with the exact confirmation and one idempotency key', async () => {
    const operation = makeSystemOperation()
    const post = vi.spyOn(api, 'POST').mockResolvedValue({
      data: operation, response: new Response('{}', { status: 202 }),
    } as never)

    await expect(systemApi.restartNapCat('维护窗口')).resolves.toEqual(operation)
    expect(post).toHaveBeenCalledWith('/system/napcat/restart', {
      params: { header: { 'Idempotency-Key': '66666666-6666-4666-8666-666666666666' } },
      body: { confirmation: 'restart', reason: '维护窗口' },
    })
  })
})
