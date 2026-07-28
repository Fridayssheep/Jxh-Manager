import { api, createIdempotencyKey, ifMatch, unwrap } from './client'
import type { SystemConfiguration, SystemHealth, SystemOperation } from './types'

export const systemApi = {
  async getHealth(): Promise<SystemHealth> {
    return unwrap(await api.GET('/system/health'))
  },

  async getConfiguration(): Promise<SystemConfiguration> {
    return unwrap(await api.GET('/system/configuration'))
  },

  async updateConfiguration(yaml: string, version: number): Promise<SystemConfiguration> {
    return unwrap(await api.PATCH('/system/configuration', {
      params: { header: { 'If-Match': ifMatch(version) } },
      body: { yaml },
    }))
  },

  async restartNapCat(reason: string): Promise<SystemOperation> {
    return unwrap(await api.POST('/system/napcat/restart', {
      params: { header: { 'Idempotency-Key': createIdempotencyKey() } },
      body: { confirmation: 'restart', reason: reason.trim() || undefined },
    }))
  },
}
