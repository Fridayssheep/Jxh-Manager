import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { vRiseOnChange, vSmoothResize } from '../motion'

function fakeAnimation(): Animation {
  return {
    cancel: vi.fn<() => void>(),
    oncancel: null,
    onfinish: null,
  } as unknown as Animation
}

function rect(height: number): DOMRect {
  return { height } as DOMRect
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('motion directives', () => {
  it('animates from the visible height to the updated content height', async () => {
    const wrapper = mount({
      directives: { smoothResize: vSmoothResize },
      data: () => ({ expanded: false }),
      template: '<div v-smooth-resize>{{ expanded ? "expanded" : "collapsed" }}</div>',
    })
    const element = wrapper.get('div').element as HTMLElement
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() =>
      rect(element.textContent === 'expanded' ? 160 : 80),
    )
    const animate = vi.fn<() => Animation>(() => fakeAnimation())
    Object.defineProperty(element, 'animate', { configurable: true, value: animate })

    await wrapper.setData({ expanded: true })

    expect(animate).toHaveBeenCalledWith(
      [{ height: '80px' }, { height: '160px' }],
      expect.objectContaining({
        duration: 220,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      }),
    )
  })

  it('rises only when the bound content revision changes', async () => {
    const wrapper = mount({
      directives: { riseOnChange: vRiseOnChange },
      data: () => ({ revision: 1, label: '旧数据' }),
      template: '<div v-rise-on-change="revision">{{ label }}</div>',
    })
    const element = wrapper.get('div').element as HTMLElement
    const animate = vi.fn<() => Animation>(() => fakeAnimation())
    Object.defineProperty(element, 'animate', { configurable: true, value: animate })

    await wrapper.setData({ revision: 2, label: '新数据' })

    expect(animate).toHaveBeenCalledWith(
      [
        { opacity: 0.25, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      expect.objectContaining({ duration: 220 }),
    )

    animate.mockClear()
    await wrapper.setData({ label: '同一批数据' })
    expect(animate).not.toHaveBeenCalled()
  })

  it('skips motion when reduced motion is requested', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    )
    const wrapper = mount({
      directives: { smoothResize: vSmoothResize, riseOnChange: vRiseOnChange },
      data: () => ({ expanded: false, revision: 1 }),
      template:
        '<div v-smooth-resize v-rise-on-change="revision">{{ expanded ? "expanded" : "collapsed" }}</div>',
    })
    const element = wrapper.get('div').element as HTMLElement
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() =>
      rect(element.textContent === 'expanded' ? 160 : 80),
    )
    const animate = vi.fn<() => Animation>(() => fakeAnimation())
    Object.defineProperty(element, 'animate', { configurable: true, value: animate })

    await wrapper.setData({ expanded: true, revision: 2 })

    expect(animate).not.toHaveBeenCalled()
  })
})
