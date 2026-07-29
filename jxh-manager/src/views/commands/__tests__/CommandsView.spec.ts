import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { commandsApi } from '@/api/commands'
import OperationNotice from '@/components/feedback/OperationNotice.vue'
import { useAuthStore } from '@/stores/auth'
import { makeAuthContext } from '@/test/auth-fixture'
import { makeCommand } from '@/test/command-fixture'
import CommandsView from '../CommandsView.vue'

async function mountView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().acceptContext(makeAuthContext(['commands:read', 'commands:write']))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/commands', component: CommandsView },
      { path: '/commands/:commandId', component: { template: '<div />' } },
    ],
  })
  await router.push('/commands')
  await router.isReady()
  return mount(CommandsView, { global: { plugins: [pinia, router] } })
}

describe('CommandsView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(commandsApi, 'list').mockResolvedValue({
      items: [makeCommand()],
      next_cursor: null,
      has_more: false,
    })
  })

  it('filters the cursor list by status, scope, permission and search', async () => {
    const wrapper = await mountView()
    await flushPromises()

    await wrapper.get('input[name=query]').setValue('welcome')
    await wrapper.get('select[name=status]').setValue('draft')
    await wrapper.get('select[name=scope_type]').setValue('groups')
    await wrapper.get('select[name=trigger_permission]').setValue('group_admin')
    await wrapper.get('[data-test=command-filters]').trigger('submit')
    await flushPromises()

    expect(commandsApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: 'welcome',
        status: 'draft',
        scopeType: 'groups',
        triggerPermission: 'group_admin',
        cursor: null,
      }),
    )
  })

  it('uses the loaded version when enabling a command', async () => {
    const update = vi.spyOn(commandsApi, 'update').mockResolvedValue(
      makeCommand({ enabled: true, status: 'active', version: 8 }),
    )
    const wrapper = await mountView()
    await flushPromises()

    await wrapper.get('[data-test=toggle-command-cmd-1]').trigger('click')
    await flushPromises()

    expect(update).toHaveBeenCalledWith('cmd-1', { enabled: true }, 7)
    expect(wrapper.text()).toContain('已启用')
    expect(wrapper.findComponent(OperationNotice).exists()).toBe(true)
  })
})
