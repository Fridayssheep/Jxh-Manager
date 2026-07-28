import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import { makeAuthContext } from '@/test/auth-fixture'
import AppShell from '../AppShell.vue'

describe('AppShell', () => {
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
    expect(wrapper.text()).not.toContain('实时同步')
    expect(wrapper.text()).not.toContain('等待实时连接')
    expect(wrapper.text()).not.toContain('服务状态待同步')
    expect(warn.mock.calls.flat().join(' ')).not.toContain('No match found for location with path "/account"')
  })
})
