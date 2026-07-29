import { defineComponent, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useSlidingIndicator } from '../useSlidingIndicator'

let notifyResize: ResizeObserverCallback | undefined

class ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) {
    notifyResize = callback
  }

  observe(): void {}
  disconnect(): void {}
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  notifyResize = undefined
})

describe('useSlidingIndicator', () => {
  it('measures the active target relative to its container and realigns after resize', async () => {
    let targetLeft = 42
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('indicator-container')) {
        return { left: 10, top: 20, width: 260, height: 80 } as DOMRect
      }
      if (this.classList.contains('indicator-target')) {
        return { left: targetLeft, top: 28, width: 96, height: 36 } as DOMRect
      }
      return { left: 0, top: 0, width: 0, height: 0 } as DOMRect
    })

    const wrapper = mount(
      defineComponent({
        setup() {
          const container = ref<HTMLElement | null>(null)
          const target = ref<HTMLElement | null>(null)
          const { indicatorStyle, updateIndicator } = useSlidingIndicator({
            container,
            target: () => target.value,
          })
          return { container, target, indicatorStyle, updateIndicator }
        },
        template:
          '<div ref="container" class="indicator-container"><span ref="target" class="indicator-target" /><i :style="indicatorStyle" /></div>',
      }),
    )
    await wrapper.vm.updateIndicator()

    expect(wrapper.get('i').attributes('style')).toContain('width: 96px')
    expect(wrapper.get('i').attributes('style')).toContain('height: 36px')
    expect(wrapper.get('i').attributes('style')).toContain('translate3d(32px, 8px, 0)')

    targetLeft = 74
    notifyResize?.([], {} as ResizeObserver)
    await flushPromises()

    expect(wrapper.get('i').attributes('style')).toContain('translate3d(64px, 8px, 0)')
  })
})
