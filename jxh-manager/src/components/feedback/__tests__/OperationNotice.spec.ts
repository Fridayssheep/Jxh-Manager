import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import OperationNotice from '../OperationNotice.vue'

const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate')

function fakeAnimation(): Animation {
  return {
    cancel: vi.fn<() => void>(),
    oncancel: null,
    onfinish: null,
  } as unknown as Animation
}

afterEach(() => {
  if (originalAnimate) {
    Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate)
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'animate')
  }
})

describe('OperationNotice', () => {
  it('uses semantic roles and exposes a stable long-message container', () => {
    const message = 'NapCatUnavailableBecauseTheConnectionEndpointDidNotRespond'
    const wrapper = mount(OperationNotice, {
      props: { message, tone: 'danger', revision: 1 },
    })

    expect(wrapper.get('[role=alert]').classes()).toContain('operation-notice--danger')
    expect(wrapper.get('.operation-notice__message').text()).toBe(message)
    expect(wrapper.get('transition-stub').attributes('appear')).toBe('true')
  })

  it('emits close and rises when the message revision changes', async () => {
    const animate = vi.fn<
      (
        keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
        options?: number | KeyframeAnimationOptions,
      ) => Animation
    >(() => fakeAnimation())
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animate,
    })
    const wrapper = mount(OperationNotice, {
      props: { message: '旧提示', tone: 'warning', revision: 1 },
    })

    await wrapper.setProps({ message: '新提示', revision: 2 })
    await wrapper.get('[data-test=close-operation-notice]').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(
      animate.mock.calls.some(([keyframes]) =>
        JSON.stringify(keyframes).includes('translateY(8px)'),
      ),
    ).toBe(true)
  })
})
