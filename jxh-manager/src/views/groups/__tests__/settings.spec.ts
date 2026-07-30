import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import { AdminApiError } from '@/api/client'
import { groupsApi } from '@/api/groups'
import { settingsApi } from '@/api/settings'
import { useAuthStore } from '@/stores/auth'
import { makeAuthContext } from '@/test/auth-fixture'
import GlobalSettingsView from '@/views/settings/GlobalSettingsView.vue'
import GroupDetailView from '../GroupDetailView.vue'

const features = {
  keyword_reply: { enabled: true },
  ai_qa: { enabled: true },
  quote: { enabled: true },
  link_cleaner: { enabled: false },
  welcome: { enabled: true, message_template: '欢迎 {{member_qq}} 加入 {{group_name}}' },
  custom_commands: { enabled: true },
}

const globalSettings = {
  features,
  join_requests: { auto_reject_reason: 'Please complete your student ID and apply again.' },
  version: 7,
  updated_at: '2026-07-28T05:00:00Z',
  updated_by: null,
}

const group = {
  group_id: '10001',
  name: '精弘网络维护群',
  member_count: 428,
  max_member_count: 500,
  bot_role: 'admin' as const,
  snapshot_state: 'fresh' as const,
  last_synced_at: '2026-07-28T05:00:00Z',
  features: [],
  join_request_policy: { enabled: false, auto_reject: false, version: 1 },
}

async function mountWithRouter(component: typeof GlobalSettingsView | typeof GroupDetailView, path: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().acceptContext(makeAuthContext(['groups:read', 'settings:read', 'settings:write']))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/groups', component: { template: '<div />' } },
      { path: '/groups/:groupId', component: GroupDetailView },
      { path: '/settings', component: GlobalSettingsView },
    ],
  })
  await router.push(path)
  await router.isReady()
  return mount(component, { global: { plugins: [pinia, router] } })
}

describe('feature settings', () => {
  it('sends the loaded global version through the update boundary', async () => {
    vi.spyOn(settingsApi, 'getGlobal').mockResolvedValue(globalSettings)
    const update = vi.spyOn(settingsApi, 'updateGlobal').mockResolvedValue({
      ...globalSettings,
      version: 8,
    })
    const wrapper = await mountWithRouter(GlobalSettingsView, '/settings')
    await flushPromises()

    expect(wrapper.get('[data-test=feature-ai_qa]').attributes('aria-label')).toBe('AI 问答：已启用')
    await wrapper.get('[data-test=feature-ai_qa]').setValue(false)
    await wrapper.get('[data-test=save-settings]').trigger('click')
    await flushPromises()

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ features: expect.objectContaining({ ai_qa: { enabled: false } }) }),
      7,
    )
  })

  it('serializes inherited group values as an explicit null override', async () => {
    vi.spyOn(groupsApi, 'get').mockResolvedValue(group)
    vi.spyOn(settingsApi, 'getGroup').mockResolvedValue({
      group_id: '10001',
      effective: features,
      overrides: { ai_qa: { enabled: false } },
      global_version: 7,
      version: 3,
      updated_at: '2026-07-28T05:01:00Z',
      updated_by: null,
    })
    const update = vi.spyOn(settingsApi, 'updateGroup').mockImplementation(async (_id, payload) => ({
      group_id: '10001',
      effective: features,
      overrides: payload.features.ai_qa ? { ai_qa: { enabled: true } } : {},
      global_version: 7,
      version: 4,
      updated_at: '2026-07-28T05:02:00Z',
      updated_by: null,
    }))
    const wrapper = await mountWithRouter(GroupDetailView, '/groups/10001')
    await flushPromises()

    await wrapper.get('[data-test=feature-ai_qa-inherit]').trigger('click')
    await wrapper.get('[data-test=save-settings]').trigger('click')
    await flushPromises()

    expect(update).toHaveBeenCalledWith(
      '10001',
      expect.objectContaining({ features: expect.objectContaining({ ai_qa: null }) }),
      3,
    )
  })

  it('preserves the draft and offers comparison after a version conflict', async () => {
    vi.spyOn(settingsApi, 'getGlobal').mockResolvedValue(globalSettings)
    vi.spyOn(settingsApi, 'updateGlobal').mockRejectedValue(
      new AdminApiError(409, {
        code: 'resource_version_conflict',
        message: '资源版本已变化。',
        request_id: 'request-1',
        fields: {},
        retryable: false,
      }),
    )
    const wrapper = await mountWithRouter(GlobalSettingsView, '/settings')
    await flushPromises()

    await wrapper.get('[data-test=feature-ai_qa]').setValue(false)
    await wrapper.get('[data-test=save-settings]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('设置已被其他管理员更新')
    expect((wrapper.get('[data-test=feature-ai_qa]').element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.get('[data-test=compare-settings]').attributes('type')).toBe('button')
  })
})
