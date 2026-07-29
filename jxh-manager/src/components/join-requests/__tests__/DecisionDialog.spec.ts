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

  it('requires a rejection message and emits its trimmed value', async () => {
    const wrapper = mount(DecisionDialog, {
      props: {
        open: true,
        action: 'reject',
        count: 2,
        groupName: '精弘网络维护群',
        busy: false,
      },
    })

    expect(wrapper.text()).toContain('拒绝消息')
    expect(wrapper.text()).toContain('通过 NapCat 发送给申请人')
    expect(wrapper.get('[data-test=confirm-decision]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-test=decision-reason]').setValue('   ')
    expect(wrapper.text()).toContain('拒绝消息不能为空')
    expect(wrapper.get('[data-test=confirm-decision]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-test=decision-reason]').setValue('拒'.repeat(501))
    expect(wrapper.text()).toContain('处理原因不能超过 500 个字符')
    expect(wrapper.get('[data-test=confirm-decision]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-test=decision-reason]').setValue('  资料不完整，请重试。  ')
    await wrapper.get('[data-test=confirm-decision]').trigger('click')

    expect(wrapper.emitted('confirm')).toEqual([['资料不完整，请重试。']])
  })

  it('keeps an approval reason optional and audit-only', async () => {
    const wrapper = mount(DecisionDialog, {
      props: {
        open: true,
        action: 'approve',
        count: 1,
        groupName: '精弘网络维护群',
        busy: false,
      },
    })

    expect(wrapper.text()).toContain('处理原因')
    expect(wrapper.text()).toContain('选填')
    expect(wrapper.get('[data-test=decision-reason]').attributes('placeholder')).toContain('审计')
    expect(wrapper.get('[data-test=confirm-decision]').attributes('disabled')).toBeUndefined()

    await wrapper.get('[data-test=confirm-decision]').trigger('click')

    expect(wrapper.emitted('confirm')).toEqual([[undefined]])
  })
})
