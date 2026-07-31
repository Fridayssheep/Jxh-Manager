import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import { overviewApi } from '@/api/overview'
import AppSelect from '@/components/form/AppSelect.vue'
import { makeOverview } from '@/test/overview-fixture'
import OverviewView from '../OverviewView.vue'

describe('OverviewView', () => {
  it('renders metrics, pending work, health and an accessible trend', async () => {
    vi.spyOn(overviewApi, 'get').mockResolvedValue(makeOverview())
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: OverviewView },
        { path: '/join-requests', component: { template: '<div />' } },
        { path: '/scheduled-jobs', component: { template: '<div />' } },
        { path: '/system', component: { template: '<div />' } },
      ],
    })
    await router.push('/')
    await router.isReady()

    const wrapper = mount(OverviewView, { global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('总览')
    expect(wrapper.text()).toContain('2,319')
    expect(wrapper.text()).toContain('需要处理')
    expect(wrapper.text()).toContain('等待处理的入群申请')
    expect(wrapper.text()).toContain('系统健康')
    expect(wrapper.find('a[href="/system"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('WPS')
    expect(wrapper.text()).toContain('未配置')
    expect(wrapper.find('svg[aria-label="最近趋势"]').exists()).toBe(true)
    expect(wrapper.get('table[aria-label="最近趋势数据"]').classes()).toContain('sr-only')
    expect(wrapper.get('.trend-section').classes()).toContain('overview-card')
    expect(wrapper.get('.pending-section').classes()).toContain('overview-card')
    expect(wrapper.get('.health-section').classes()).toContain('overview-card')
  })

  it('reloads the selected range', async () => {
    const getOverview = vi.spyOn(overviewApi, 'get').mockResolvedValue(makeOverview())
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: OverviewView }],
    })
    await router.push('/')
    await router.isReady()
    const wrapper = mount(OverviewView, { global: { plugins: [pinia, router] } })
    await flushPromises()

    wrapper.getComponent(AppSelect).vm.$emit('update:modelValue', '30d')
    wrapper.getComponent(AppSelect).vm.$emit('change', '30d')
    await flushPromises()

    expect(getOverview).toHaveBeenLastCalledWith({ range: '30d', groupId: null })
    expect(wrapper.find('select').exists()).toBe(false)
  })
})
