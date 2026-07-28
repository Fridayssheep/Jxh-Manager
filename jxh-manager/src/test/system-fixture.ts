import type { DependencyHealth, SystemHealth, SystemOperation } from '@/api/types'

export function makeDependency(
  key: DependencyHealth['key'],
  overrides: Partial<DependencyHealth> = {},
): DependencyHealth {
  return {
    key,
    status: 'healthy',
    configured: true,
    required: ['mysql', 'napcat'].includes(key),
    latency_ms: 18,
    last_checked_at: '2026-07-28T08:20:00Z',
    last_success_at: '2026-07-28T08:20:00Z',
    last_error_at: null,
    message: '连接正常',
    ...overrides,
  }
}

export function makeSystemHealth(overrides: Partial<SystemHealth> = {}): SystemHealth {
  return {
    generated_at: '2026-07-28T08:20:00Z',
    liveness: 'healthy',
    readiness: 'degraded',
    dependencies: [
      makeDependency('telemetry'),
      makeDependency('quote', { status: 'unknown', last_error_at: '2026-07-28T07:00:00Z', message: '等待下一次探测' }),
      makeDependency('ai', { configured: false, status: 'not_configured', last_success_at: null, message: '未配置' }),
      makeDependency('wps', { status: 'degraded', message: '最近同步延迟' }),
      makeDependency('mysql'),
      makeDependency('napcat'),
      makeDependency('scheduler'),
      makeDependency('worker'),
    ],
    ...overrides,
  }
}

export function makeSystemOperation(overrides: Partial<SystemOperation> = {}): SystemOperation {
  return {
    operation_id: 'operation-1',
    type: 'napcat_restart',
    status: 'accepted',
    requested_at: '2026-07-28T08:22:00Z',
    completed_at: null,
    error_code: null,
    ...overrides,
  }
}
