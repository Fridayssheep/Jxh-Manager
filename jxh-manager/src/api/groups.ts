import { api, createIdempotencyKey, unwrap } from './client'
import type { FeatureKey, Group, GroupList, GroupRole, GroupSyncResult } from './types'

export type GroupListQuery = {
  query: string
  botRole: GroupRole | ''
  snapshotState: 'fresh' | 'stale' | ''
  featureKey: FeatureKey | ''
  featureEnabled: boolean | null
  cursor: string | null
  limit?: number
}

export const groupsApi = {
  async list(query: GroupListQuery): Promise<GroupList> {
    return unwrap(
      await api.GET('/groups', {
        params: {
          query: {
            query: query.query || undefined,
            bot_role: query.botRole || undefined,
            snapshot_state: query.snapshotState || undefined,
            feature_key: query.featureKey || undefined,
            feature_enabled: query.featureEnabled ?? undefined,
            cursor: query.cursor ?? undefined,
            limit: query.limit ?? 30,
          },
        },
      }),
    )
  },

  async get(groupId: string): Promise<Group> {
    return unwrap(
      await api.GET('/groups/{group_id}', {
        params: { path: { group_id: groupId } },
      }),
    )
  },

  async sync(): Promise<GroupSyncResult> {
    return unwrap(
      await api.POST('/groups/sync', {
        params: { header: { 'Idempotency-Key': createIdempotencyKey() } },
      }),
    )
  },
}
