import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authApi } from '@/api/auth'
import { systemApi } from '@/api/system'
import type { Permission, SystemConfiguration, SystemOperation } from '@/api/types'
import { reloadApplication } from '@/app/reload'
import { makeAuthContext } from '@/test/auth-fixture'
import { useAuthStore } from '@/stores/auth'
import SystemView from '../SystemView.vue'

vi.mock('@/app/reload', () => ({
  reloadApplication: vi.fn(),
}))

const configuration: SystemConfiguration = {
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
}

function makeOperation(): SystemOperation {
  return {
    operation_id: 'operation-1',
    type: 'bot_restart',
    status: 'accepted',
    requested_at: '2026-07-31T08:22:00Z',
    completed_at: null,
    error_code: null,
  }
}

async function mountView(permissions: Permission[] = ['system:read']) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().acceptContext(makeAuthContext(permissions))
  return mount(SystemView, { global: { plugins: [pinia] }, attachTo: document.body })
}

describe('SystemView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.spyOn(systemApi, 'getConfiguration').mockResolvedValue(configuration)
  })

  it('renders only the structured system settings surface', async () => {
    const getHealth = vi.spyOn(systemApi, 'getHealth')
    const wrapper = await mountView()
    await flushPromises()

    expect(wrapper.get('[data-test=system-page-title]').text()).toContain('系统设置')
    expect(wrapper.find('[data-test=restart-napcat]').exists()).toBe(false)
    expect(wrapper.find('[data-test=config-section-wps]').exists()).toBe(true)
    expect(wrapper.find('[data-test=config-section-ai]').exists()).toBe(true)
    expect(wrapper.find('[data-test=config-section-quote]').exists()).toBe(true)
    expect(wrapper.find('[data-test=config-section-time]').exists()).toBe(true)
    expect(wrapper.find('[data-test=config-section-retention]').exists()).toBe(true)
    expect(getHealth).not.toHaveBeenCalled()
  })

  it('shows Bot restart only when the user has permission and the configuration supports it', async () => {
    const withoutPermission = await mountView(['system:read', 'config:write'])
    await flushPromises()
    expect(withoutPermission.find('[data-test=restart-bot]').exists()).toBe(false)
    withoutPermission.unmount()

    const withPermission = await mountView(['system:read', 'config:write', 'bot:restart'])
    await flushPromises()
    expect(withPermission.get('[data-test=restart-bot]').attributes('type')).toBe('button')
  })

  it('restarts the bot with the loaded configuration version and reloads after auth returns', async () => {
    vi.useFakeTimers()
    vi.spyOn(authApi, 'me')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeAuthContext(['system:read', 'config:write', 'bot:restart']))
    const restart = vi.spyOn(systemApi, 'restartBot').mockResolvedValue(makeOperation())
    const wrapper = await mountView(['system:read', 'config:write', 'bot:restart'])
    await flushPromises()

    await wrapper.get('[data-test=restart-bot]').trigger('click')
    await wrapper.get('[data-test=restart-confirmation]').setValue('restart')
    await wrapper.get('[data-test=confirm-bot-restart]').trigger('click')
    await flushPromises()

    expect(restart).toHaveBeenCalledWith(7)
    expect(wrapper.get('[data-test=reconnect-overlay]').isVisible()).toBe(true)

    await vi.advanceTimersByTimeAsync(1500)
    await flushPromises()
    await vi.advanceTimersByTimeAsync(1500)
    await flushPromises()

    expect(reloadApplication).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
