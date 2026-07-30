import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import GroupJoinPolicyControls from '../GroupJoinPolicyControls.vue'

describe('GroupJoinPolicyControls', () => {
  it('shows independent approval and rejection values and emits minimal patches', async () => {
    const wrapper = mount(GroupJoinPolicyControls, {
      props: {
        groupName: 'Operations Group',
        enabled: false,
        autoReject: true,
        disabled: false,
        busy: false,
      },
    })

    const approval = wrapper.get<HTMLInputElement>('[data-test=join-policy-enabled]')
    const rejection = wrapper.get<HTMLInputElement>('[data-test=join-policy-auto-reject]')
    expect(approval.element.checked).toBe(false)
    expect(rejection.element.checked).toBe(true)

    await approval.setValue(true)
    await rejection.setValue(false)

    expect(wrapper.emitted('change')).toEqual([[{ enabled: true }], [{ auto_reject: false }]])
  })

  it('disables the complete control for read-only and busy states', async () => {
    const wrapper = mount(GroupJoinPolicyControls, {
      props: {
        groupName: 'Operations Group',
        enabled: true,
        autoReject: false,
        disabled: true,
        busy: false,
      },
    })

    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined()
    expect(wrapper.get('fieldset').attributes('aria-busy')).toBe('false')

    await wrapper.setProps({ disabled: false, busy: true })
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined()
    expect(wrapper.get('fieldset').attributes('aria-busy')).toBe('true')
  })
})
