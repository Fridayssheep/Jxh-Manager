import type { ApiSchemas } from '@/api/types'

export function makeOverview(): ApiSchemas['Overview'] {
  return {
    generated_at: '2026-07-28T05:00:00Z',
    range: '7d',
    group_id: null,
    metrics: [
      {
        key: 'pending_join_requests',
        label: '待审批',
        available: true,
        value: 7,
        change_percent: null,
      },
      {
        key: 'command_runs_today',
        label: '命令调用',
        available: true,
        value: 2319,
        change_percent: 8.4,
      },
      {
        key: 'active_groups',
        label: '活跃群',
        available: true,
        value: 23,
        change_percent: -2.1,
      },
      {
        key: 'healthy_dependencies',
        label: '健康依赖',
        available: true,
        value: 6,
        change_percent: null,
      },
      {
        key: 'automatic_approvals_today',
        label: '今日自动批准',
        available: true,
        value: 3,
        change_percent: null,
      },
      {
        key: 'enabled_scheduled_jobs',
        label: '启用任务',
        available: false,
        value: null,
        change_percent: null,
      },
    ],
    pending_items: [
      { key: 'join_requests', label: '等待处理的入群申请', count: 7, severity: 'warning' },
      { key: 'failed_jobs', label: '最近执行失败的任务', count: 2, severity: 'critical' },
    ],
    dependencies: [
      { key: 'napcat', status: 'healthy', last_success_at: '2026-07-28T04:59:50Z' },
      { key: 'mysql', status: 'healthy', last_success_at: '2026-07-28T04:59:58Z' },
      { key: 'wps', status: 'degraded', last_success_at: '2026-07-28T04:40:00Z' },
      { key: 'ai', status: 'not_configured', last_success_at: null },
    ],
    trend: [
      {
        bucket_start: '2026-07-22T00:00:00Z',
        values: { command_runs: 220, join_requests: 4 },
      },
      {
        bucket_start: '2026-07-23T00:00:00Z',
        values: { command_runs: 280, join_requests: 7 },
      },
      {
        bucket_start: '2026-07-24T00:00:00Z',
        values: { command_runs: 245, join_requests: 5 },
      },
    ],
  }
}
