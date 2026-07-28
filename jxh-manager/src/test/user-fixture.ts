import type { AdminSession, AdminUser, PasswordResetResult, SessionRevokeResult } from '@/api/types'

export function makeAdminUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    user_id: 'user-2', username: 'maintainer', display_name: '值班维护员', role: 'maintainer',
    qq_user_id: '10002', enabled: true, last_login_at: '2026-07-28T04:00:00Z',
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-28T04:00:00Z', version: 4,
    ...overrides,
  }
}

export function makeAdminSession(overrides: Partial<AdminSession> = {}): AdminSession {
  return {
    session_id: 'session-2', user_id: 'user-2', status: 'active', current: false,
    ip_address: '127.0.0.2', user_agent: 'Chrome 140 / Windows',
    created_at: '2026-07-28T03:00:00Z', last_seen_at: '2026-07-28T06:00:00Z',
    expires_at: '2026-07-28T12:00:00Z', revoked_at: null, ...overrides,
  }
}

export function makePasswordResetResult(): PasswordResetResult {
  return { user: makeAdminUser({ version: 5 }), revoked_session_count: 2, completed_at: '2026-07-28T06:10:00Z' }
}

export function makeSessionRevokeResult(overrides: Partial<SessionRevokeResult> = {}): SessionRevokeResult {
  return { user_id: 'user-2', session_id: 'session-2', revoked_count: 1, revoked_at: '2026-07-28T06:12:00Z', ...overrides }
}
