import { api, unwrap } from './client'
import type { Overview } from './types'

export type OverviewQuery = {
  range: '7d' | '30d'
  groupId: string | null
}

export const overviewApi = {
  async get(query: OverviewQuery): Promise<Overview> {
    return unwrap(
      await api.GET('/overview', {
        params: {
          query: {
            range: query.range,
            group_id: query.groupId ?? undefined,
          },
        },
      }),
    )
  },
}
