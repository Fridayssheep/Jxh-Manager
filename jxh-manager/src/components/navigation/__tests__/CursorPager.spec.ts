import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import CursorPager from '../CursorPager.vue'

describe('CursorPager', () => {
  it('shows totals and emits direct page selections', async () => {
    const wrapper = mount(CursorPager, {
      props: { pageNumber: 1, totalPages: 12, totalItems: 113, busy: false },
    })

    expect(wrapper.get('[data-test=page-previous]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test=page-next]').attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('第 1 / 12 页')
    expect(wrapper.text()).toContain('共 113 条')

    await wrapper.get('[data-test=page-5]').trigger('click')
    expect(wrapper.emitted('page')).toEqual([[5]])
  })

  it('keeps the first, current and last pages visible around gaps', () => {
    const wrapper = mount(CursorPager, {
      props: { pageNumber: 6, totalPages: 12, totalItems: 113, busy: false },
    })

    expect(wrapper.find('[data-test=page-1]').exists()).toBe(true)
    expect(wrapper.get('[data-test=page-6]').attributes('aria-current')).toBe('page')
    expect(wrapper.find('[data-test=page-12]').exists()).toBe(true)
    expect(wrapper.findAll('.page-gap')).toHaveLength(2)
  })

  it('blocks every page action while a request is running', () => {
    const wrapper = mount(CursorPager, {
      props: { pageNumber: 3, totalPages: 8, totalItems: 72, busy: true },
    })

    expect(wrapper.get('[data-test=page-previous]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test=page-next]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test=page-5]').attributes('disabled')).toBeDefined()
  })

  it('renders an honest empty total without page buttons', () => {
    const wrapper = mount(CursorPager, {
      props: { pageNumber: 1, totalPages: 0, totalItems: 0, busy: false },
    })

    expect(wrapper.text()).toContain('共 0 页')
    expect(wrapper.find('.pager__page').exists()).toBe(false)
    expect(wrapper.get('[data-test=page-previous]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test=page-next]').attributes('disabled')).toBeDefined()
  })
})
