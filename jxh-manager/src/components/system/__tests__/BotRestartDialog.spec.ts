import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BotRestartDialog from '../BotRestartDialog.vue'

describe('BotRestartDialog', () => {
  it('only enables confirmation for the exact lowercase restart phrase', async () => {
    const wrapper = mount(BotRestartDialog, {
      props: {
        open: true,
        configurationVersion: 7,
      },
    })

    await flushPromises()

    const confirm = wrapper.get('[data-test=confirm-bot-restart]')
    expect(confirm.attributes('disabled')).toBeDefined()

    await wrapper.get('[data-test=restart-confirmation]').setValue('RESTART')
    expect(confirm.attributes('disabled')).toBeDefined()

    await wrapper.get('[data-test=restart-confirmation]').setValue('restart')
    expect(confirm.attributes('disabled')).toBeUndefined()

    await confirm.trigger('click')
    expect(wrapper.emitted('confirm')).toEqual([[]])
  })

  it('shows the loaded configuration version and emits cancel', async () => {
    const wrapper = mount(BotRestartDialog, {
      props: {
        open: true,
        configurationVersion: 19,
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('19')
    await wrapper.get('[data-test=cancel-bot-restart]').trigger('click')
    expect(wrapper.emitted('cancel')).toEqual([[]])
  })
})
