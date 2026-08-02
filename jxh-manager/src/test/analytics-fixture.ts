import type { AnalyticsRankings, AnalyticsSummary, AnalyticsTimeseries } from '@/api/types'

export function makeAnalyticsSummary(): AnalyticsSummary {
  return {
    window: {
      from: '2026-07-01T00:00:00Z',
      to: '2026-07-28T00:00:00Z',
      timezone: 'Asia/Shanghai',
    },
    metrics: [
      {
        key: 'keyword_reply_count',
        label: '关键词回复',
        unit: 'count',
        available: true,
        value: 820,
        previous_value: 760,
        change_percent: 7.9,
      },
      {
        key: 'knowledge_trigger_count',
        label: '知识命中',
        unit: 'count',
        available: true,
        value: 1496,
        previous_value: 1380,
        change_percent: 8.4,
      },
      {
        key: 'ai_request_count',
        label: 'AI 请求',
        unit: 'count',
        available: true,
        value: 3280,
        previous_value: 3000,
        change_percent: 9.3,
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
      {
        key: 'ai_duration_ms',
        label: 'AI 平均耗时',
        unit: 'milliseconds',
        available: true,
        value: 820,
        previous_value: 860,
        change_percent: -4.7,
      },
      {
        key: 'join_request_count',
        label: '入群申请',
        unit: 'count',
        available: true,
        value: 428,
        previous_value: 420,
        change_percent: 1.9,
      },
      {
        key: 'manual_approval_count',
        label: '人工审批',
        unit: 'count',
        available: true,
        value: 120,
        previous_value: 132,
        change_percent: -9.1,
      },
      {
        key: 'automatic_approval_count',
        label: '自动审批',
        unit: 'count',
        available: true,
        value: 308,
        previous_value: 288,
        change_percent: 6.9,
      },
      {
        key: 'scheduled_job_run_count',
        label: '定时任务运行',
        unit: 'count',
        available: true,
        value: 86,
        previous_value: 82,
        change_percent: 4.9,
      },
      {
        key: 'group_message_count',
        label: '群消息量',
        unit: 'count',
        available: true,
        value: 12840,
        previous_value: 11900,
        change_percent: 7.9,
      },
      {
        key: 'command_run_count',
        label: '命令运行',
        unit: 'count',
        available: true,
        value: 1460,
        previous_value: 1340,
        change_percent: 9,
      },
      {
        key: 'active_user_count',
        label: '活跃用户',
        unit: 'count',
        available: true,
        value: 2146,
        previous_value: 2060,
        change_percent: 4.2,
      },
      {
        key: 'link_clean_count',
        label: '链接净化',
        unit: 'count',
        available: true,
        value: 842,
        previous_value: 800,
        change_percent: 5.3,
      },
      {
        key: 'quote_success_count',
        label: '引用成功',
        unit: 'count',
        available: true,
        value: 612,
        previous_value: 600,
        change_percent: 2,
      },
      {
        key: 'quote_fallback_count',
        label: '引用回退',
        unit: 'count',
        available: true,
        value: 24,
        previous_value: 30,
        change_percent: -20,
      },
      {
        key: 'quote_failure_count',
        label: '引用失败',
        unit: 'count',
        available: true,
        value: 8,
        previous_value: 10,
        change_percent: -20,
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
    total_count: 2,
    items: [
      { key: '10001', display_name: '精弘网络维护群', value: 8420, rank: 1 },
      { key: '10002', display_name: '新生答疑群', value: 4420, rank: 2 },
    ],
    data_fresh_at: '2026-07-28T06:00:00Z',
  }
}

export function makeKnowledgeRankings(): AnalyticsRankings {
  return {
    window: makeAnalyticsSummary().window,
    dimension: 'knowledge_entry',
    metric: 'knowledge_trigger_count',
    unit: 'count',
    total_count: 2,
    items: [
      { key: '菜单', display_name: '菜单', value: 384, rank: 1 },
      { key: '校历', display_name: '校历', value: 216, rank: 2 },
    ],
    data_fresh_at: '2026-07-28T06:00:00Z',
  }
}
