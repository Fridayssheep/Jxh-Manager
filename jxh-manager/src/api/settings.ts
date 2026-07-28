import { api, ifMatch, unwrap } from './client'
import type {
  GlobalSettings,
  GlobalSettingsPatch,
  GroupSettings,
  GroupSettingsPatch,
} from './types'

export const settingsApi = {
  async getGlobal(): Promise<GlobalSettings> {
    return unwrap(await api.GET('/settings'))
  },

  async updateGlobal(payload: GlobalSettingsPatch, version: number): Promise<GlobalSettings> {
    return unwrap(
      await api.PATCH('/settings', {
        params: { header: { 'If-Match': ifMatch(version) } },
        body: payload,
      }),
    )
  },

  async getGroup(groupId: string): Promise<GroupSettings> {
    return unwrap(
      await api.GET('/groups/{group_id}/settings', {
        params: { path: { group_id: groupId } },
      }),
    )
  },

  async updateGroup(
    groupId: string,
    payload: GroupSettingsPatch,
    version: number,
  ): Promise<GroupSettings> {
    return unwrap(
      await api.PATCH('/groups/{group_id}/settings', {
        params: {
          path: { group_id: groupId },
          header: { 'If-Match': ifMatch(version) },
        },
        body: payload,
      }),
    )
  },

  async clearGroup(groupId: string, version: number): Promise<void> {
    unwrap<void>(
      await api.DELETE('/groups/{group_id}/settings', {
        params: {
          path: { group_id: groupId },
          header: { 'If-Match': ifMatch(version) },
        },
      }),
    )
  },
}
