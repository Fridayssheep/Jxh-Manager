import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import { makeAuthContext } from '@/test/auth-fixture'
import AppShell from '../AppShell.vue'

describe('AppShell', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows only navigation allowed by the current permissions', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.acceptContext(makeAuthContext(['overview:read', 'groups:read', 'system:read']))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/groups', component: { template: '<div />' } },
        { path: '/system', component: { template: '<div />' } },
        { path: '/account', component: { template: '<div />' } },
      ],
    })
    await router.push('/')
    await router.isReady()

    const wrapper = mount(AppShell, {
      global: { plugins: [pinia, router] },
      slots: { default: '<main>页面内容</main>' },
    })

    expect(wrapper.get('[data-test=app-sidebar]').attributes('aria-label')).toBe('主导航')
    expect(wrapper.text()).toContain('总览')
    expect(wrapper.text()).toContain('群与设置')
    expect(wrapper.text()).toContain('系统设置')
    expect(wrapper.text()).not.toContain('账号与权限')
    expect(wrapper.text()).not.toContain('入群审批')
    expect(wrapper.find('[data-test=app-topbar]').exists()).toBe(true)
    expect(wrapper.get('[data-test=account-link]').attributes('href')).toBe('/account')
    expect(wrapper.findAll('[data-test=navigation-highlight]')).toHaveLength(1)
    for (const [href, label] of [
      ['/', '总览'],
      ['/groups', '群与设置'],
      ['/system', '系统设置'],
    ]) {
      const link = wrapper.get(`.navigation-item[href="${href}"]`)
      expect(link.attributes('aria-label')).toBe(label)
      expect(link.attributes('title')).toBe(label)
    }
    expect(wrapper.text()).not.toContain('实时同步')
    expect(wrapper.text()).not.toContain('等待实时连接')
    expect(wrapper.text()).not.toContain('服务状态待同步')
    expect(warn.mock.calls.flat().join(' ')).not.toContain(
      'No match found for location with path "/account"',
    )
  })

  it('realigns the navigation highlight after the sidebar layout changes', async () => {
    let notifyResize: ResizeObserverCallback | undefined
    const observe = vi.fn<(target: Element, options?: ResizeObserverOptions) => void>()
    const disconnect = vi.fn<() => void>()
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = callback
      }

      observe = observe
      disconnect = disconnect
      unobserve = vi.fn<(target: Element) => void>()
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)

    let activeTop = 518.4
    const makeRect = (top: number, left: number, width: number, height: number): DOMRect =>
      ({
        x: left,
        y: top,
        top,
        right: left + width,
        bottom: top + height,
        left,
        width,
        height,
        toJSON: () => ({}),
      }) as DOMRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.matches('[data-test=app-sidebar]')) return makeRect(0, 0, 224, 662)
      if (this.matches('.navigation-item.router-link-active')) {
        return makeRect(activeTop, 16, 195.2, 40)
      }
      return makeRect(0, 0, 0, 0)
    })

    const pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore().acceptContext(makeAuthContext(['analytics:read', 'audit:read']))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/analytics', component: { template: '<div />' } },
        { path: '/audit-logs', component: { template: '<div />' } },
        { path: '/account', component: { template: '<div />' } },
      ],
    })
    await router.push('/audit-logs')
    await router.isReady()

    const wrapper = mount(AppShell, { global: { plugins: [pinia, router] } })
    await nextTick()
    await nextTick()
    expect(wrapper.get('[data-test=navigation-highlight]').attributes('style')).toContain(
      'translate3d(16px, 518.4px, 0)',
    )

    activeTop = 503.2
    expect(notifyResize).toBeTypeOf('function')
    notifyResize?.([], {} as ResizeObserver)
    await nextTick()
    await nextTick()

    expect(wrapper.get('[data-test=navigation-highlight]').attributes('style')).toContain(
      'translate3d(16px, 503.2px, 0)',
    )
    expect(observe).toHaveBeenCalledWith(wrapper.get('[data-test=app-sidebar]').element)
    wrapper.unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })
})
