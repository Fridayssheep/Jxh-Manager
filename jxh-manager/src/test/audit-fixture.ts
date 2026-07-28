import type { AuditLog, AuditLogSummary } from '@/api/types'

export function makeAuditLogSummary(overrides: Partial<AuditLogSummary> = {}): AuditLogSummary {
  return {
    audit_log_id: 'audit-1',
    occurred_at: '2026-07-28T06:00:00Z',
    actor: {
      type: 'admin_user',
      user_id: 'user-1',
      qq_user_id: null,
      display_name: '值班维护员',
    },
    action: 'settings.update',
    target: { type: 'group_settings', id: '10001', display_name: '精弘网络维护群' },
    result: 'success',
    error_code: null,
    request_id: 'request-1',
    ...overrides,
  }
}

export function makeAuditLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    ...makeAuditLogSummary(),
    source: 'web',
    ip_address: '127.0.0.1',
    user_agent: 'Mozilla/5.0',
    before: { welcome: { enabled: false, template: '[redacted]' } },
    after: { welcome: { enabled: true, template: '[redacted]' } },
    metadata: { version: 8 },
    redacted: true,
    ...overrides,
  }
}
