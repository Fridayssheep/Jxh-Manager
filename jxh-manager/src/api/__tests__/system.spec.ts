import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/api/client'
import type { SystemConfigurationPatch, SystemOperation } from '@/api/types'
import { systemApi } from '@/api/system'

const patch: SystemConfigurationPatch = {
  wps: {
    share_url: { operation: 'replace', value: 'https://example.test/knowledge.xlsx' },
    sheet: '知识库',
    timeout_sec: 45,
  },
  ai: {
    provider: 'ark',
    base_url: 'https://ark.example.test/v1',
    api_key: { operation: 'clear' },
    model: 'next-model',
    timeout_sec: 60,
    max_question_chars: 900,
  },
  quote: {
    base_url: 'https://quote.example.test',
    timeout_sec: 20,
  },
  time: {
    app_timezone: 'Asia/Shanghai',
    scheduler_timezone: 'Asia/Shanghai',
  },
  retention: {
    trigger_log_retention_days: 365,
  },
}

describe('systemApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('reads the structured system configuration', async () => {
    const configuration = {
      wps: {
        share_url: { configured: true, source: 'file' },
        sid: { configured: false, source: 'default' },
        sheet: '知识库',
        timeout_sec: 45,
      },
      ai: {
        provider: 'openai',
        base_url: 'https://api.openai.test/v1',
        api_key: { configured: true, source: 'file' },
        model: 'gpt-4.1-mini',
        timeout_sec: 30,
        max_question_chars: 1200,
      },
      quote: {
        base_url: 'https://quote.example.test',
        timeout_sec: 20,
      },
      time: {
        app_timezone: 'Asia/Shanghai',
        scheduler_timezone: 'Asia/Shanghai',
      },
      retention: {
        trigger_log_retention_days: 180,
      },
      environment_overrides: ['ai.model', 'wps.sid'],
      version: 7,
      applied_version: 6,
      restart_required: true,
      restart_supported: true,
    }

    const get = vi.spyOn(api, 'GET').mockResolvedValue({
      data: configuration,
      response: new Response('{}', { status: 200 }),
    } as never)

    await expect(systemApi.getConfiguration()).resolves.toEqual(configuration)
    expect(get).toHaveBeenCalledWith('/system/configuration')
  })

  it('patches the structured configuration with If-Match', async () => {
    const updated = {
      ...patch,
      wps: {
        ...patch.wps,
        sid: { configured: true, source: 'file' },
      },
      version: 8,
      applied_version: 6,
      restart_required: true,
      restart_supported: true,
    }

    const patchRequest = vi.spyOn(api, 'PATCH').mockResolvedValue({
      data: updated,
      response: new Response('{}', { status: 200 }),
    } as never)

    await expect(systemApi.updateConfiguration(patch, 7)).resolves.toEqual(updated)
    expect(patchRequest).toHaveBeenCalledWith('/system/configuration', {
      params: { header: { 'If-Match': '"7"' } },
      body: patch,
    })
  })

  it('restarts the bot with a single idempotency key and configuration version', async () => {
    const operation: SystemOperation = {
      operation_id: 'operation-1',
      type: 'bot_restart',
      status: 'accepted',
      requested_at: '2026-07-31T08:22:00Z',
      completed_at: null,
      error_code: null,
    }

    const post = vi.spyOn(api, 'POST').mockResolvedValue({
      data: operation,
      response: new Response('{}', { status: 202 }),
    } as never)

    await expect(systemApi.restartBot(7)).resolves.toEqual(operation)
    expect(post).toHaveBeenCalledWith('/system/bot/restart', {
      params: { header: { 'Idempotency-Key': expect.stringMatching(/^[A-Za-z0-9._:-]+$/) } },
      body: { confirmation: 'restart', configuration_version: 7 },
    })
  })
})
