import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AppTabBar from '../AppTabBar.vue'

const options = [
  { value: 'users', label: '管理账号', dataTest: 'users-tab' },
  { value: 'sessions', label: '登录会话', dataTest: 'sessions-tab' },
]

describe('AppTabBar', () => {
  it('uses one shared highlight and emits clicked tabs', async () => {
    const wrapper = mount(AppTabBar, {
      props: { modelValue: 'users', options, accessibleName: '账号管理视图' },
    })

    expect(wrapper.get('[role=tablist]').attributes('aria-label')).toBe('账号管理视图')
    expect(wrapper.findAll('[data-test=tab-highlight]')).toHaveLength(1)
    expect(wrapper.get('[data-test=users-tab]').attributes('aria-selected')).toBe('true')

    await wrapper.get('[data-test=sessions-tab]').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]).toEqual(['sessions'])
    expect(wrapper.emitted('change')?.slice(-1)[0]).toEqual(['sessions'])
  })

  it('supports arrow, home and end navigation', async () => {
    const wrapper = mount(AppTabBar, {
      props: { modelValue: 'users', options, accessibleName: '账号管理视图' },
    })

    await wrapper.get('[data-test=users-tab]').trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(wrapper.emitted('change')?.slice(-1)[0]).toEqual(['sessions'])

    await wrapper.get('[data-test=users-tab]').trigger('keydown', { key: 'End' })
    expect(wrapper.emitted('change')?.slice(-1)[0]).toEqual(['sessions'])

    await wrapper.get('[data-test=sessions-tab]').trigger('keydown', { key: 'Home' })
    expect(wrapper.emitted('change')?.slice(-1)[0]).toEqual(['users'])
  })
})
