import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { analyticsApi } from '@/api/analytics'
import AnalyticsMetricBoard from '@/components/data/AnalyticsMetricBoard.vue'
import { useAuthStore } from '@/stores/auth'
import {
  makeAnalyticsRankings,
  makeAnalyticsSummary,
  makeAnalyticsTimeseries,
} from '@/test/analytics-fixture'
import { makeAuthContext } from '@/test/auth-fixture'
import AnalyticsView from '../AnalyticsView.vue'

async function mountView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().acceptContext(makeAuthContext(['analytics:read', 'analytics:export']))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/analytics', component: AnalyticsView }],
  })
  await router.push(
    '/analytics?from=2026-07-01T00:00:00Z&to=2026-07-28T00:00:00Z&group_id=10001&metric=group_message_count&result=success&dimension=group',
  )
  await router.isReady()
  return {
    wrapper: mount(AnalyticsView, { global: { plugins: [pinia, router] } }),
    router,
  }
}

describe('AnalyticsView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(analyticsApi, 'getSummary').mockResolvedValue(makeAnalyticsSummary())
    vi.spyOn(analyticsApi, 'getTimeseries').mockResolvedValue(makeAnalyticsTimeseries())
    vi.spyOn(analyticsApi, 'getRankings').mockResolvedValue(makeAnalyticsRankings())
  })

  it('keeps the time window, group, metric and result in the URL', async () => {
    const { wrapper, router } = await mountView()
    await flushPromises()

    expect(analyticsApi.getSummary).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('12,840')
    await wrapper.get('input[name=group_id]').setValue('10002')
    await wrapper.get('select[name=metric]').setValue('ai_request_count')
    await wrapper.get('select[name=result]').setValue('failed')
    await wrapper.get('[data-test=analytics-filters]').trigger('submit')
    await flushPromises()

    expect(router.currentRoute.value.query).toMatchObject({
      from: '2026-07-01T00:00:00Z',
      to: '2026-07-28T00:00:00Z',
      group_id: '10002',
      metric: 'ai_request_count',
      result: 'failed',
      dimension: 'group',
    })
    expect(analyticsApi.getTimeseries).toHaveBeenLastCalledWith(
      expect.objectContaining({ metrics: ['ai_request_count'], groupIds: ['10002'] }),
    )
    expect(analyticsApi.getSummary).toHaveBeenCalledTimes(2)
  })

  it('keeps local analysis controls out of the summary request lifecycle', async () => {
    const summaryRequest = vi.mocked(analyticsApi.getSummary)
    const timeseriesRequest = vi.mocked(analyticsApi.getTimeseries)
    const rankingsRequest = vi.mocked(analyticsApi.getRankings)
    const { wrapper, router } = await mountView()
    await flushPromises()

    expect(summaryRequest).toHaveBeenCalledTimes(1)
    await wrapper.get('select[name=metric]').setValue('quote_failure_count')
    await flushPromises()

    expect(router.currentRoute.value.query.metric).toBe('quote_failure_count')
    expect(summaryRequest).toHaveBeenCalledTimes(1)
    expect(timeseriesRequest).toHaveBeenCalledTimes(2)
    expect(rankingsRequest).toHaveBeenCalledTimes(2)
  })

  it('uses the grouped metric board and independent analysis cards', async () => {
    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.findComponent(AnalyticsMetricBoard).exists()).toBe(true)
    expect(wrapper.findAll('.analytics-card')).toHaveLength(2)
    expect(wrapper.get('.trend-section').classes()).toContain('analytics-card')
    expect(wrapper.get('.ranking-section').classes()).toContain('analytics-card')
    expect(wrapper.find('.metric-grid').exists()).toBe(false)
  })

  it('exports the active filter set', async () => {
    const exportData = vi.spyOn(analyticsApi, 'exportData').mockResolvedValue({
      blob: new Blob(['rank,value']),
      filename: 'analytics.csv',
      rowCount: 2,
    })
    const createObjectUrl = vi.fn<(value: Blob | MediaSource) => string>(() => 'blob:analytics')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectUrl, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn<(url: string) => void>(),
      configurable: true,
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const { wrapper } = await mountView()
    await flushPromises()

    await wrapper.get('[data-test=export-analytics]').trigger('click')
    await flushPromises()

    expect(exportData).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '2026-07-01T00:00:00Z',
        to: '2026-07-28T00:00:00Z',
        groupIds: ['10001'],
        metric: 'group_message_count',
        dimension: 'group',
      }),
    )
    expect(createObjectUrl).toHaveBeenCalledOnce()
  })
})
