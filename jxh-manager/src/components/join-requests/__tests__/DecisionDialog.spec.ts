import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AppOverlayTransition from '@/components/motion/AppOverlayTransition.vue'
import DecisionDialog from '../DecisionDialog.vue'

describe('DecisionDialog', () => {
  it('uses the shared centered overlay transition', () => {
    const wrapper = mount(DecisionDialog, {
      props: {
        open: true,
        action: 'approve',
        count: 1,
        groupName: '精弘网络维护群',
        busy: false,
      },
    })

    expect(wrapper.findComponent(AppOverlayTransition).props('variant')).toBe('dialog')
  })
})
