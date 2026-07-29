import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import AppSelect from '../AppSelect.vue'

const options = [
  { value: 'messages', label: '群消息量' },
  { value: 'requests', label: 'AI 请求量' },
  { value: 'success_rate', label: 'AI 成功率' },
]

const mountedWrappers: VueWrapper[] = []

function mountSelect(): VueWrapper {
  const wrapper = mount(AppSelect, {
    attachTo: document.body,
    props: {
      modelValue: 'messages',
      options,
      accessibleName: '指标',
      name: 'metric',
      dataTest: 'metric-select',
    },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

afterEach(() => {
  mountedWrappers.splice(0).forEach((wrapper) => wrapper.unmount())
})

describe('AppSelect', () => {
  it('uses a custom listbox and emits the chosen value', async () => {
    const wrapper = mountSelect()
    const trigger = wrapper.get('[data-test="metric-select"]')

    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.get('input[type="hidden"][name="metric"]').attributes('value')).toBe('messages')
    expect(trigger.text()).toContain('群消息量')
    expect(trigger.attributes('aria-expanded')).toBe('false')

    await trigger.trigger('click')
    await nextTick()

    const listbox = document.body.querySelector<HTMLElement>('[role="listbox"]')
    const selected = document.body.querySelector<HTMLElement>(
      '[role="option"][data-value="messages"]',
    )
    const nextOption = document.body.querySelector<HTMLElement>(
      '[role="option"][data-value="requests"]',
    )
    expect(listbox).not.toBeNull()
    expect(selected?.getAttribute('aria-selected')).toBe('true')

    nextOption!.click()
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]).toEqual(['requests'])
    expect(wrapper.emitted('change')?.slice(-1)[0]).toEqual(['requests'])
    expect(document.body.querySelector('[role="listbox"]')).toBeNull()
    expect(document.activeElement).toBe(trigger.element)
  })

  it('supports keyboard navigation, confirmation and escape', async () => {
    const wrapper = mountSelect()
    const trigger = wrapper.get('[data-test="metric-select"]')

    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await nextTick()

    let listbox = document.body.querySelector<HTMLElement>('[role="listbox"]')
    expect(listbox).not.toBeNull()
    expect(listbox?.getAttribute('aria-activedescendant')).toContain('messages')

    listbox!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    listbox!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await nextTick()

    expect(wrapper.emitted('change')?.slice(-1)[0]).toEqual(['requests'])
    expect(document.activeElement).toBe(trigger.element)

    await trigger.trigger('click')
    await nextTick()
    listbox = document.body.querySelector<HTMLElement>('[role="listbox"]')
    listbox!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()

    expect(document.body.querySelector('[role="listbox"]')).toBeNull()
    expect(document.activeElement).toBe(trigger.element)
  })
})
