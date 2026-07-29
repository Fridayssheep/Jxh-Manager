import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { settingsApi } from '@/api/settings'
import type { GlobalSettings } from '@/api/types'
import { useAuthStore } from '@/stores/auth'
import { makeAuthContext } from '@/test/auth-fixture'
import GlobalSettingsView from '@/views/settings/GlobalSettingsView.vue'

const globalSettings: GlobalSettings = {
  features: {
    keyword_reply: { enabled: true },
    ai_qa: { enabled: true },
    quote: { enabled: true },
    link_cleaner: { enabled: false },
    welcome: { enabled: true, message_template: '欢迎 {{member_qq}}' },
    custom_commands: { enabled: true },
  },
  join_requests: { auto_reject_reason: '申请信息不完整，请重新申请。' },
  version: 3,
  updated_at: '2026-07-29T01:00:00Z',
  updated_by: null,
}

async function mountView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().acceptContext(makeAuthContext(['settings:read', 'settings:write']))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/settings', component: GlobalSettingsView }],
  })
  await router.push('/settings')
  await router.isReady()
  return mount(GlobalSettingsView, { global: { plugins: [pinia, router] } })
}

describe('global join request settings', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('saves the trimmed automatic rejection message with the loaded version', async () => {
    vi.spyOn(settingsApi, 'getGlobal').mockResolvedValue(globalSettings)
    const update = vi.spyOn(settingsApi, 'updateGlobal').mockResolvedValue({
      ...globalSettings,
      join_requests: { auto_reject_reason: '请补充学号后重新申请。' },
      version: 4,
    })
    const wrapper = await mountView()
    await flushPromises()

    const field = wrapper.get('[data-test=auto-reject-reason]')
    expect((field.element as HTMLTextAreaElement).value).toBe('申请信息不完整，请重新申请。')
    await field.setValue('  请补充学号后重新申请。  ')
    await wrapper.get('[data-test=save-settings]').trigger('click')
    await flushPromises()

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        join_requests: { auto_reject_reason: '请补充学号后重新申请。' },
      }),
      3,
    )
  })

  it('prevents saving a blank automatic rejection message', async () => {
    vi.spyOn(settingsApi, 'getGlobal').mockResolvedValue(globalSettings)
    const update = vi.spyOn(settingsApi, 'updateGlobal')
    const wrapper = await mountView()
    await flushPromises()

    await wrapper.get('[data-test=auto-reject-reason]').setValue('   ')

    expect(wrapper.get('[data-test=save-settings]').attributes()).toHaveProperty('disabled')
    expect(wrapper.text()).toContain('拒绝消息不能为空')
    expect(update).not.toHaveBeenCalled()
  })
})
