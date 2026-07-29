import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

import AppTabBar from '@/components/navigation/AppTabBar.vue'
import SettingsAreaNav from '../SettingsAreaNav.vue'

async function mountNav(path = '/groups') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/groups', component: { template: '<div />' } },
      { path: '/settings', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  return { router, wrapper: mount(SettingsAreaNav, { global: { plugins: [router] } }) }
}

describe('SettingsAreaNav', () => {
  it('uses the shared sliding tab bar and follows the active route', async () => {
    const { router, wrapper } = await mountNav()

    expect(wrapper.findComponent(AppTabBar).props('modelValue')).toBe('/groups')
    wrapper.findComponent(AppTabBar).vm.$emit('update:modelValue', '/settings')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/settings')
    expect(wrapper.findComponent(AppTabBar).props('modelValue')).toBe('/settings')
  })
})
