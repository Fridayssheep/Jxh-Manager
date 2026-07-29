import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { makeAnalyticsSummary } from '@/test/analytics-fixture'
import AnalyticsMetricBoard from '../AnalyticsMetricBoard.vue'

describe('AnalyticsMetricBoard', () => {
  it('shows four operational KPIs and groups every remaining raw metric once', () => {
    const metrics = [...makeAnalyticsSummary().metrics]
      .reverse()
      .map((metric) => ({ ...metric, label: `Backend label: ${metric.key}` }))
    const wrapper = mount(AnalyticsMetricBoard, { props: { metrics } })

    expect(wrapper.findAll('[data-test^="analytics-kpi-"]')).toHaveLength(4)
    expect(wrapper.get('[data-test="analytics-kpi-group_message_count"]').text()).toContain(
      '12,840',
    )
    expect(wrapper.get('[data-test="analytics-kpi-active_user_count"]').text()).toContain('2,146')
    expect(wrapper.get('[data-test="analytics-kpi-ai_success_rate"]').text()).toContain('96.4%')
    expect(wrapper.get('[data-test="analytics-kpi-automatic_approval_share"]').text()).toContain(
      '72%',
    )
    expect(wrapper.get('[data-test="analytics-kpi-automatic_approval_share"]').text()).toContain(
      '308 自动 / 120 人工',
    )
    expect(wrapper.findAll('[data-test^="analytics-metric-row-"]')).toHaveLength(12)
    expect(wrapper.findAll('[data-test="analytics-metric-group"]')).toHaveLength(3)
    expect(wrapper.get('[data-test="analytics-metric-row-keyword_reply_count"]').text()).toContain(
      '关键词回复',
    )
    expect(wrapper.text()).not.toContain('Backend label:')
  })

  it('does not invent an automatic approval share without a valid denominator', () => {
    const metrics = makeAnalyticsSummary().metrics.map((metric) =>
      metric.key === 'automatic_approval_count' || metric.key === 'manual_approval_count'
        ? { ...metric, value: 0 }
        : metric,
    )
    const wrapper = mount(AnalyticsMetricBoard, { props: { metrics } })

    expect(wrapper.get('[data-test="analytics-kpi-automatic_approval_share"]').text()).toContain(
      '—',
    )
  })
})
