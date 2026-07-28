import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import App from '../App.vue'

vi.mock('@/composables/useAdminEvents', () => ({
  useAdminEvents: () => ({ status: ref('connected') }),
}))

describe('App', () => {
  it('uses page-rise and keeps the routed page mounted when only query changes', async () => {
    let mounts = 0
    const Page = defineComponent({
      name: 'TestPage',
      setup() {
        mounts += 1
        return () => h('main', '测试页面')
      },
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/demo', component: Page }],
    })
    await router.push('/demo?tab=one')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
        stubs: {
          AppShell: { template: '<section data-test="shell"><slot /></section>' },
        },
      },
    })
    await flushPromises()

    expect(wrapper.find('transition-stub[name="page-rise"]').exists()).toBe(true)
    expect(mounts).toBe(1)
    await router.push('/demo?tab=two')
    await flushPromises()
    expect(mounts).toBe(1)
  })
})
