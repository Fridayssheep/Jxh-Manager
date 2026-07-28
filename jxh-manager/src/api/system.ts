import { api, createIdempotencyKey, unwrap } from './client'
import type { SystemHealth, SystemOperation } from './types'

export const systemApi = {
  async getHealth(): Promise<SystemHealth> {
    return unwrap(await api.GET('/system/health'))
  },

  async restartNapCat(reason: string): Promise<SystemOperation> {
    return unwrap(await api.POST('/system/napcat/restart', {
      params: { header: { 'Idempotency-Key': createIdempotencyKey() } },
      body: { confirmation: 'restart', reason: reason.trim() || undefined },
    }))
  },
}
