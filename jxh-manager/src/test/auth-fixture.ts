import type { AuthContext, Permission } from '@/api/types'

export function makeAuthContext(permissions: Permission[] = ['overview:read']): AuthContext {
  return {
    user: {
      user_id: 'user-1',
      username: 'operator',
      display_name: '值班维护员',
      role: 'maintainer',
      qq_user_id: '10001',
      enabled: true,
      last_login_at: '2026-07-28T04:00:00Z',
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-28T04:00:00Z',
      version: 1,
    },
    session: {
      session_id: 'session-1',
      user_id: 'user-1',
      status: 'active',
      current: true,
      ip_address: '127.0.0.1',
      user_agent: 'Vitest',
      created_at: '2026-07-28T04:00:00Z',
      last_seen_at: '2026-07-28T04:00:00Z',
      expires_at: '2026-07-28T12:00:00Z',
      revoked_at: null,
    },
    permissions,
    csrf_token: 'csrf-token-with-at-least-thirty-two-characters',
  }
}
