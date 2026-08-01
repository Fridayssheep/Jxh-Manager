import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { commandsApi } from '@/api/commands'
import { groupsApi } from '@/api/groups'
import OperationNotice from '@/components/feedback/OperationNotice.vue'
import AppSelect from '@/components/form/AppSelect.vue'
import AppOverlayTransition from '@/components/motion/AppOverlayTransition.vue'
import { useAuthStore } from '@/stores/auth'
import { makeAuthContext } from '@/test/auth-fixture'
import { makeCommand, makeCommandRun, makeCommandValidationResult } from '@/test/command-fixture'
import CommandEditorView from '../CommandEditorView.vue'

async function mountEditor(path: string, role: 'super_admin' | 'maintainer' = 'super_admin') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const context = makeAuthContext(['commands:read', 'commands:write'])
  context.user.role = role
  useAuthStore().acceptContext(context)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/commands', component: { template: '<div />' } },
      { path: '/commands/:commandId', component: CommandEditorView },
    ],
  })
  await router.push(path)
  await router.isReady()
  return {
    wrapper: mount(CommandEditorView, { global: { plugins: [pinia, router] } }),
    router,
  }
}

describe('CommandEditorView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(groupsApi, 'list').mockResolvedValue({ items: [], next_cursor: null, has_more: false })
  })

  it('validates a new draft without side effects and creates it disabled', async () => {
    const validation = makeCommandValidationResult()
    const validate = vi.spyOn(commandsApi, 'validateDraft').mockResolvedValue(validation)
    const create = vi.spyOn(commandsApi, 'create').mockResolvedValue(makeCommand())
    const { wrapper, router } = await mountEditor('/commands/new')
    await flushPromises()

    await wrapper.get('[data-test=command-name]').setValue('/welcome')
    await wrapper.get('[data-test=command-display-name]').setValue('欢迎成员')
    await wrapper.get('[data-test=command-description]').setValue('发送欢迎文本')
    await wrapper.get('[data-test=add-reply-action]').trigger('click')
    await wrapper.get('[data-test=reply-template-0]').setValue('欢迎加入本群')
    await wrapper.get('[data-test=sample-group]').setValue('10001')
    await wrapper.get('[data-test=sample-sender]').setValue('24680135')
    await wrapper.get('[data-test=sample-message]').setValue('/welcome')
    await wrapper.get('[data-test=validate-draft]').trigger('click')
    await flushPromises()

    expect(validate).toHaveBeenCalledWith(
      expect.objectContaining({
        definition: expect.objectContaining({
          name: '/welcome',
          actions: [{ type: 'reply_text', template: '欢迎加入本群' }],
        }),
      }),
    )
    expect(wrapper.text()).toContain('欢迎加入本群')

    await wrapper.get('[data-test=save-command]').trigger('click')
    await flushPromises()
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: '/welcome' }))
    expect(router.currentRoute.value.fullPath).toBe('/commands/cmd-1')
  })

  it('shows redacted runs and deletes an existing command with its version', async () => {
    vi.spyOn(commandsApi, 'get').mockResolvedValue(makeCommand())
    vi.spyOn(commandsApi, 'listRuns').mockResolvedValue({
      items: [makeCommandRun()],
      next_cursor: null,
      has_more: false,
    })
    const remove = vi.spyOn(commandsApi, 'delete').mockResolvedValue()
    const { wrapper, router } = await mountEditor('/commands/cmd-1')
    await flushPromises()

    expect(wrapper.text()).toContain('执行记录')
    expect(wrapper.text()).toContain('24680135')
    expect(wrapper.text()).not.toContain('自由文本原文')

    await wrapper.get('[data-test=delete-command]').trigger('click')
    await wrapper.get('[data-test=confirm-delete]').trigger('click')
    await flushPromises()

    expect(remove).toHaveBeenCalledWith('cmd-1', 7)
    expect(router.currentRoute.value.fullPath).toBe('/commands')
  })

  it('animates deletion confirmation layers', async () => {
    vi.spyOn(commandsApi, 'get').mockResolvedValue(makeCommand())
    vi.spyOn(commandsApi, 'listRuns').mockResolvedValue({
      items: [],
      next_cursor: null,
      has_more: false,
    })
    const { wrapper } = await mountEditor('/commands/cmd-1')
    await flushPromises()

    expect(wrapper.findComponent(AppOverlayTransition).props('variant')).toBe('dialog')
    expect(wrapper.findComponent(OperationNotice).exists()).toBe(true)
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.findAllComponents(AppSelect).length).toBeGreaterThanOrEqual(6)
  })
})
