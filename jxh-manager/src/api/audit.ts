import { api, unwrap } from './client'
import type { AuditActorType, AuditLog, AuditLogList, AuditResult } from './types'

export type AuditLogListQuery = {
  actorUserId: string
  actorType: AuditActorType | ''
  action: string
  targetType: string
  targetId: string
  result: AuditResult | ''
  from: string
  to: string
  cursor: string | null
  limit?: number
}

export const auditApi = {
  async list(query: AuditLogListQuery): Promise<AuditLogList> {
    return unwrap(await api.GET('/audit-logs', { params: { query: {
      actor_user_id: query.actorUserId || undefined,
      actor_type: query.actorType || undefined,
      action: query.action || undefined,
      target_type: query.targetType || undefined,
      target_id: query.targetId || undefined,
      result: query.result || undefined,
      from: query.from || undefined,
      to: query.to || undefined,
      cursor: query.cursor ?? undefined,
      limit: query.limit ?? 30,
    } } }))
  },

  async get(auditLogId: string): Promise<AuditLog> {
    return unwrap(await api.GET('/audit-logs/{audit_log_id}', {
      params: { path: { audit_log_id: auditLogId } },
    }))
  },
}
