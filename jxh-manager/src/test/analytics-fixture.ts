import type {
  AnalyticsRankings,
  AnalyticsSummary,
  AnalyticsTimeseries,
} from '@/api/types'

export function makeAnalyticsSummary(): AnalyticsSummary {
  return {
    window: {
      from: '2026-07-01T00:00:00Z',
      to: '2026-07-28T00:00:00Z',
      timezone: 'Asia/Shanghai',
    },
    metrics: [
      {
        key: 'group_message_count',
        label: '群消息',
        unit: 'count',
        available: true,
        value: 12840,
        previous_value: 11900,
        change_percent: 7.9,
      },
      {
        key: 'ai_success_rate',
        label: 'AI 成功率',
        unit: 'percent',
        available: true,
        value: 96.4,
        previous_value: 95.1,
        change_percent: 1.4,
      },
    ],
    data_fresh_at: '2026-07-28T06:00:00Z',
  }
}

export function makeAnalyticsTimeseries(): AnalyticsTimeseries {
  return {
    window: makeAnalyticsSummary().window,
    granularity: 'day',
    series: [
      {
        metric: 'group_message_count',
        label: '群消息',
        unit: 'count',
        points: [
          { bucket_start: '2026-07-27T00:00:00Z', value: 480 },
          { bucket_start: '2026-07-28T00:00:00Z', value: 520 },
        ],
      },
    ],
    data_fresh_at: '2026-07-28T06:00:00Z',
  }
}

export function makeAnalyticsRankings(): AnalyticsRankings {
  return {
    window: makeAnalyticsSummary().window,
    dimension: 'group',
    metric: 'group_message_count',
    unit: 'count',
    items: [
      { key: '10001', display_name: '精弘网络维护群', value: 8420, rank: 1 },
      { key: '10002', display_name: '新生答疑群', value: 4420, rank: 2 },
    ],
    data_fresh_at: '2026-07-28T06:00:00Z',
  }
}
