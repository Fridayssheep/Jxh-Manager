import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/api/client'
import type { components } from '@/api/schema'
import { systemApi } from '@/api/system'
import { makeSystemHealth, makeSystemOperation } from '@/test/system-fixture'

type SystemConfiguration = components['schemas']['SystemConfiguration']

const configuration: SystemConfiguration = {
  yaml: 'ai:\n  api_key: __JXH_SECRET_UNCHANGED__\n',
  version: 7,
  masked_fields: ['ai.api_key'],
  environment_overrides: ['ai.model'],
  restart_required: true,
}

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

  it('reads and updates the Bot configuration with the resource version', async () => {
    const get = vi.spyOn(api, 'GET').mockResolvedValue({
      data: configuration, response: new Response('{}', { status: 200 }),
    } as never)
    const patch = vi.spyOn(api, 'PATCH').mockResolvedValue({
      data: { ...configuration, version: 8 }, response: new Response('{}', { status: 200 }),
    } as never)

    await expect(systemApi.getConfiguration()).resolves.toEqual(configuration)
    await expect(systemApi.updateConfiguration('ai:\n  enabled: false\n', 7)).resolves.toEqual({
      ...configuration,
      version: 8,
    })
    expect(get).toHaveBeenCalledWith('/system/configuration')
    expect(patch).toHaveBeenCalledWith('/system/configuration', {
      params: { header: { 'If-Match': '"7"' } },
      body: { yaml: 'ai:\n  enabled: false\n' },
    })
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
