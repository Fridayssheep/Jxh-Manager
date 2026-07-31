import { api, createIdempotencyKey, ifMatch, unwrap } from './client'
import type {
  BotRestartRequest,
  SystemConfiguration,
  SystemConfigurationPatch,
  SystemHealth,
  SystemOperation,
  NapCatRestartRequest,
} from './types'

export const systemApi = {
  async getHealth(): Promise<SystemHealth> {
    return unwrap(await api.GET('/system/health'))
  },

  async getConfiguration(): Promise<SystemConfiguration> {
    return unwrap(await api.GET('/system/configuration'))
  },

  async updateConfiguration(patch: SystemConfigurationPatch, version: number): Promise<SystemConfiguration> {
    return unwrap(await api.PATCH('/system/configuration', {
      params: { header: { 'If-Match': ifMatch(version) } },
      body: patch,
    }))
  },

  async restartBot(configurationVersion: number): Promise<SystemOperation> {
    const body: BotRestartRequest = {
      confirmation: 'restart',
      configuration_version: configurationVersion,
    }

    return unwrap(await api.POST('/system/bot/restart', {
      params: { header: { 'Idempotency-Key': createIdempotencyKey() } },
      body,
    }))
  },

  async restartNapCat(reason: string): Promise<SystemOperation> {
    const body: NapCatRestartRequest = {
      confirmation: 'restart',
      reason: reason.trim() || undefined,
    }

    return unwrap(await api.POST('/system/napcat/restart', {
      params: { header: { 'Idempotency-Key': createIdempotencyKey() } },
      body,
    }))
  },
}
