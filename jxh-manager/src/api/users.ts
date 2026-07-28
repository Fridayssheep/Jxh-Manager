import { api, createIdempotencyKey, ifMatch, unwrap } from './client'
import type {
  AdminRole,
  AdminSessionList,
  AdminUser,
  AdminUserCreateRequest,
  AdminUserList,
  AdminUserPatchRequest,
  PasswordResetResult,
  SessionRevokeResult,
  SessionStatus,
} from './types'

export type AdminUserListQuery = {
  query: string
  role: AdminRole | ''
  enabled: boolean | null
  cursor: string | null
  limit?: number
}

export type AdminSessionListQuery = {
  userId: string
  status: SessionStatus | ''
  current: boolean | null
  cursor: string | null
  limit?: number
}

export const usersApi = {
  async list(query: AdminUserListQuery): Promise<AdminUserList> {
    return unwrap(await api.GET('/users', { params: { query: {
      query: query.query || undefined,
      role: query.role || undefined,
      enabled: query.enabled ?? undefined,
      cursor: query.cursor ?? undefined,
      limit: query.limit ?? 30,
    } } }))
  },

  async create(payload: AdminUserCreateRequest): Promise<AdminUser> {
    return unwrap(await api.POST('/users', { body: payload }))
  },

  async get(userId: string): Promise<AdminUser> {
    return unwrap(await api.GET('/users/{user_id}', {
      params: { path: { user_id: userId } },
    }))
  },

  async update(userId: string, patch: AdminUserPatchRequest, version: number): Promise<AdminUser> {
    return unwrap(await api.PATCH('/users/{user_id}', {
      params: { path: { user_id: userId }, header: { 'If-Match': ifMatch(version) } },
      body: patch,
    }))
  },

  async resetPassword(userId: string, newPassword: string, version: number): Promise<PasswordResetResult> {
    return unwrap(await api.POST('/users/{user_id}/password-reset', {
      params: { path: { user_id: userId }, header: {
        'If-Match': ifMatch(version), 'Idempotency-Key': createIdempotencyKey(),
      } },
      body: { new_password: newPassword },
    }))
  },

  async revokeUserSessions(userId: string): Promise<SessionRevokeResult> {
    return unwrap(await api.POST('/users/{user_id}/sessions/revoke', {
      params: { path: { user_id: userId }, header: {
        'Idempotency-Key': createIdempotencyKey(),
      } },
    }))
  },

  async listSessions(query: AdminSessionListQuery): Promise<AdminSessionList> {
    return unwrap(await api.GET('/sessions', { params: { query: {
      user_id: query.userId || undefined,
      status: query.status || undefined,
      current: query.current ?? undefined,
      cursor: query.cursor ?? undefined,
      limit: query.limit ?? 30,
    } } }))
  },

  async revokeSession(sessionId: string): Promise<SessionRevokeResult> {
    return unwrap(await api.POST('/sessions/{session_id}/revoke', {
      params: { path: { session_id: sessionId }, header: {
        'Idempotency-Key': createIdempotencyKey(),
      } },
    }))
  },
}
