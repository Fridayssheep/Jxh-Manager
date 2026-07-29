import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import CursorPager from '../CursorPager.vue'

describe('CursorPager', () => {
  it('disables unavailable directions and identifies the current cursor page', async () => {
    const wrapper = mount(CursorPager, {
      props: { pageNumber: 1, hasPrevious: false, hasNext: true, busy: false },
    })

    expect(wrapper.get('[data-test=cursor-previous]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test=cursor-next]').attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('第 1 页')

    await wrapper.get('[data-test=cursor-next]').trigger('click')
    expect(wrapper.emitted('next')).toHaveLength(1)
  })

  it('blocks both directions while a page request is running', () => {
    const wrapper = mount(CursorPager, {
      props: { pageNumber: 3, hasPrevious: true, hasNext: true, busy: true },
    })

    expect(wrapper.get('[data-test=cursor-previous]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test=cursor-next]').attributes('disabled')).toBeDefined()
  })
})
