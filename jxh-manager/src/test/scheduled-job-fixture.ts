import type { ScheduledJob, ScheduledJobRun } from '@/api/types'

export function makeScheduledJob(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
  return {
    job_id: 'job-1',
    name: '每日晚安提醒',
    group: { group_id: '10001', name: '精弘网络维护群' },
    message: '今天辛苦了，早点休息。',
    type: 'daily',
    schedule: { type: 'daily', local_time: '23:00:00', timezone: 'Asia/Shanghai' },
    status: 'active',
    next_run_at: '2026-07-28T15:00:00Z',
    last_run_at: '2026-07-27T15:00:00Z',
    last_run_result: 'success',
    version: 7,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-28T02:00:00Z',
    updated_by: {
      type: 'admin_user', user_id: 'user-1', qq_user_id: null, display_name: '值班维护员',
    },
    ...overrides,
  }
}

export function makeScheduledJobRun(overrides: Partial<ScheduledJobRun> = {}): ScheduledJobRun {
  return {
    run_id: 'job-run-1',
    job_id: 'job-1',
    kind: 'scheduled',
    result: 'success',
    scheduled_for: '2026-07-27T15:00:00Z',
    started_at: '2026-07-27T15:00:00Z',
    completed_at: '2026-07-27T15:00:01Z',
    duration_ms: 350,
    message_id: 'message-1',
    error_code: null,
    error_message: null,
    triggered_by: null,
    ...overrides,
  }
}
