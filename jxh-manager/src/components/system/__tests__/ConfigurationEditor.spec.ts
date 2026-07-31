import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AdminApiError } from '@/api/client'
import type { SystemConfiguration } from '@/api/types'
import { systemApi } from '@/api/system'
import SystemConfigurationForm from '../SystemConfigurationForm.vue'

function makeConfiguration(overrides: Partial<SystemConfiguration> = {}): SystemConfiguration {
  return {
    wps: {
      share_url: { configured: true, source: 'file' },
      sid: { configured: true, source: 'environment' },
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
    ...overrides,
  }
}

function mountForm(canWrite = true) {
  return mount(SystemConfigurationForm, {
    props: { canWrite },
  })
}

describe('SystemConfigurationForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(systemApi, 'getConfiguration').mockResolvedValue(makeConfiguration())
  })

  it('renders the five structured categories and never echoes secret placeholders', async () => {
    const wrapper = mountForm()
    await flushPromises()

    expect(
      wrapper.findAll('[data-test^=config-section-]').map((node) => node.attributes('data-test')),
    ).toEqual([
      'config-section-wps',
      'config-section-ai',
      'config-section-quote',
      'config-section-time',
      'config-section-retention',
    ])
    expect(wrapper.get('[data-test=config-ai-model]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test=config-wps-sid-replace]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).not.toContain('__JXH_SECRET_UNCHANGED__')
    expect(wrapper.text()).not.toContain('real-secret')
    expect(wrapper.find('[data-test=config-ai-api-key-value]').exists()).toBe(false)
  })

  it('is read-only without write permission', async () => {
    const wrapper = mountForm(false)
    await flushPromises()

    expect(wrapper.get('[data-test=config-ai-base-url]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test=config-wps-sheet]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test=save-configuration]').exists()).toBe(false)
  })

  it('saves a structured patch with the loaded version', async () => {
    const update = vi.spyOn(systemApi, 'updateConfiguration').mockResolvedValue(
      makeConfiguration({
        ai: {
          ...makeConfiguration().ai,
          provider: 'ark',
          base_url: 'https://ark.example.test/v1',
        },
        quote: { ...makeConfiguration().quote, timeout_sec: 30 },
        retention: { trigger_log_retention_days: 365 },
        version: 8,
      }),
    )
    const wrapper = mountForm()
    await flushPromises()

    await wrapper.get('[data-test=config-ai-provider]').setValue('ark')
    await wrapper.get('[data-test=config-ai-base-url]').setValue('https://ark.example.test/v1')
    await wrapper.get('[data-test=config-quote-timeout-sec]').setValue('30')
    await wrapper.get('[data-test=config-retention-trigger-log-retention-days]').setValue('365')
    await wrapper.get('[data-test=config-ai-api-key-replace]').trigger('click')
    await wrapper.get('[data-test=config-ai-api-key-value]').setValue('new-api-key')
    await wrapper.get('[data-test=save-configuration]').trigger('click')
    await flushPromises()

    expect(update).toHaveBeenCalledWith({
      ai: {
        provider: 'ark',
        base_url: 'https://ark.example.test/v1',
        api_key: { operation: 'replace', value: 'new-api-key' },
      },
      quote: { timeout_sec: 30 },
      retention: { trigger_log_retention_days: 365 },
    }, 7)
  })

  it('preserves the local draft after a version conflict and can reload the server version', async () => {
    vi.spyOn(systemApi, 'getConfiguration')
      .mockResolvedValueOnce(makeConfiguration())
      .mockResolvedValueOnce(makeConfiguration({
        quote: { base_url: 'https://quote.example.test', timeout_sec: 40 },
        version: 8,
      }))
    vi.spyOn(systemApi, 'updateConfiguration').mockRejectedValue(new AdminApiError(409, {
      code: 'resource_version_conflict',
      message: 'configuration changed',
      request_id: 'request-1',
      fields: {},
      retryable: false,
    }))
    const wrapper = mountForm()
    await flushPromises()

    await wrapper.get('[data-test=config-quote-timeout-sec]').setValue('30')
    await wrapper.get('[data-test=save-configuration]').trigger('click')
    await flushPromises()

    expect((wrapper.get('[data-test=config-quote-timeout-sec]').element as HTMLInputElement).value).toBe('30')
    await wrapper.get('[data-test=reload-configuration]').trigger('click')
    await flushPromises()
    expect((wrapper.get('[data-test=config-quote-timeout-sec]').element as HTMLInputElement).value).toBe('40')
  })
})
