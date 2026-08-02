import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { analyticsApi } from '@/api/analytics'
import AnalyticsMetricBoard from '@/components/data/AnalyticsMetricBoard.vue'
import OperationNotice from '@/components/feedback/OperationNotice.vue'
import { useAuthStore } from '@/stores/auth'
import {
  makeAnalyticsRankings,
  makeAnalyticsSummary,
  makeAnalyticsTimeseries,
  makeKnowledgeRankings,
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
    vi.spyOn(analyticsApi, 'getRankings').mockImplementation(async (query) =>
      query.dimension === 'knowledge_entry' ? makeKnowledgeRankings() : makeAnalyticsRankings(),
    )
  })

  it('uses inclusive Shanghai calendar days and keeps only the date and group in the URL', async () => {
    const { wrapper, router } = await mountView()
    await flushPromises()

    expect(analyticsApi.getSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '2026-06-30T16:00:00.000Z',
        to: '2026-07-28T16:00:00.000Z',
        groupIds: ['10001'],
      }),
    )
    await wrapper.get('input[name=group_id]').setValue('10002')
    await wrapper.get('[data-test=analytics-filters]').trigger('submit')
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({
      from: '2026-07-01',
      to: '2026-07-28',
      group_id: '10002',
    })
    expect(analyticsApi.getSummary).toHaveBeenCalledTimes(2)
  })

  it('renders a fixed business overview without arbitrary metric and dimension controls', async () => {
    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.findComponent(AnalyticsMetricBoard).exists()).toBe(true)
    expect(wrapper.findAll('[data-test^="analytics-kpi-"]')).toHaveLength(6)
    expect(wrapper.findAll('.analytics-card')).toHaveLength(3)
    expect(wrapper.find('input[name=feature_key]').exists()).toBe(false)
    expect(wrapper.find('input[name=result]').exists()).toBe(false)
    expect(wrapper.find('[name=metric]').exists()).toBe(false)
    expect(wrapper.find('[name=dimension]').exists()).toBe(false)

    expect(analyticsApi.getTimeseries).toHaveBeenCalledWith(
      expect.objectContaining({
        metrics: ['group_message_count'],
        granularity: 'day',
      }),
    )
    expect(analyticsApi.getRankings).toHaveBeenCalledTimes(2)
    expect(analyticsApi.getRankings).toHaveBeenCalledWith(
      expect.objectContaining({
        dimension: 'group',
        metric: 'group_message_count',
      }),
    )
    expect(analyticsApi.getRankings).toHaveBeenCalledWith(
      expect.objectContaining({
        dimension: 'knowledge_entry',
        metric: 'knowledge_trigger_count',
      }),
    )
    expect(wrapper.text()).toContain('热门知识词条')
    expect(wrapper.text()).toContain('菜单')
  })

  it('rejects custom ranges longer than the retained knowledge history', async () => {
    const { wrapper, router } = await mountView()
    await flushPromises()

    await wrapper.get('input[name=from]').setValue('2026-06-01')
    await wrapper.get('[data-test=analytics-filters]').trigger('submit')
    await flushPromises()

    expect(router.currentRoute.value.query.from).toBe('2026-07-01T00:00:00Z')
    expect(analyticsApi.getSummary).toHaveBeenCalledTimes(1)
    const notice = wrapper.findComponent(OperationNotice)
    expect(notice.props('tone')).toBe('danger')
    expect(notice.props('message')).toBe('统计概览最多查询连续 30 天。')
  })

  it('does not show empty rankings while their first request is pending', async () => {
    vi.mocked(analyticsApi.getRankings).mockReturnValue(new Promise(() => undefined))
    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('正在更新排行')
    expect(wrapper.text()).not.toContain('当前范围暂无群消息')
    expect(wrapper.text()).not.toContain('当前范围暂无知识命中')
  })

  it('shows ranking totals and pages each ranking independently', async () => {
    vi.mocked(analyticsApi.getRankings).mockImplementation(async (query) => {
      const rankings = query.dimension === 'knowledge_entry'
        ? makeKnowledgeRankings()
        : makeAnalyticsRankings()
      return {
        ...rankings,
        total_count: 12,
        items: query.page === 2
          ? [{ key: 'page-2', display_name: '第二页排行', value: 120, rank: 11 }]
          : rankings.items,
      }
    })
    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('第 1 / 2 页')
    const groupSection = wrapper.findAll('.ranking-section')[0]
    if (!groupSection) throw new Error('group ranking section was not rendered')
    await groupSection.get('[data-test=page-2]').trigger('click')
    await flushPromises()

    expect(analyticsApi.getRankings).toHaveBeenCalledWith(
      expect.objectContaining({ dimension: 'group', page: 2, limit: 10 }),
    )
    expect(groupSection.text()).toContain('第二页排行')
    expect(groupSection.text()).toContain('第 2 / 2 页')
  })

  it('does not retain old metrics after a changed scope fails to load', async () => {
    const { wrapper } = await mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('12,840')

    vi.mocked(analyticsApi.getSummary).mockRejectedValueOnce(new Error('offline'))
    await wrapper.get('input[name=group_id]').setValue('10002')
    await wrapper.get('[data-test=analytics-filters]').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('统计读取失败')
    expect(wrapper.text()).not.toContain('12,840')
  })

  it('exports the current overview as CSV', async () => {
    const exportData = vi.spyOn(analyticsApi, 'exportData').mockResolvedValue({
      blob: new Blob(['metric,value']),
      filename: 'analytics.csv',
      rowCount: 6,
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
        dataset: 'summary',
        format: 'csv',
        groupIds: ['10001'],
      }),
    )
    expect(createObjectUrl).toHaveBeenCalledOnce()
  })

  it('shows export failures as a danger notice', async () => {
    vi.spyOn(analyticsApi, 'exportData').mockRejectedValue(new Error('network unavailable'))
    const { wrapper } = await mountView()
    await flushPromises()

    await wrapper.get('[data-test=export-analytics]').trigger('click')
    await flushPromises()

    const notice = wrapper.findComponent(OperationNotice)
    expect(notice.exists()).toBe(true)
    expect(notice.props('tone')).toBe('danger')
    expect(notice.props('message')).toBe('统计数据导出失败。')
  })
})
