import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AppOverlayTransition from '../AppOverlayTransition.vue'

describe('AppOverlayTransition', () => {
  it.each([
    ['dialog', 'app-dialog'],
    ['drawer', 'app-drawer'],
  ] as const)('uses the %s motion contract', (variant, transitionName) => {
    const wrapper = mount(AppOverlayTransition, {
      props: { show: true, variant },
      slots: { default: '<div class="overlay-content">content</div>' },
    })

    expect(wrapper.get('transition-stub').attributes('name')).toBe(transitionName)
    expect(wrapper.get('.overlay-content').text()).toBe('content')
  })

  it('removes overlay content when closed', async () => {
    const wrapper = mount(AppOverlayTransition, {
      props: { show: true },
      slots: { default: '<div class="overlay-content">content</div>' },
    })

    await wrapper.setProps({ show: false })

    expect(wrapper.find('.overlay-content').exists()).toBe(false)
  })
})
