import { beforeEach, describe, expect, it, vi } from 'vitest'

import { analyticsApi } from '@/api/analytics'
import { api } from '@/api/client'
import { makeAnalyticsSummary } from '@/test/analytics-fixture'

const commonQuery = {
  from: '2026-07-01T00:00:00Z',
  to: '2026-07-28T00:00:00Z',
  groupIds: ['10001', '10002'],
  featureKeys: ['ai_qa', 'quote'] as const,
  results: ['success', 'fallback'] as const,
  timezone: 'Asia/Shanghai',
}

describe('analyticsApi', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('preserves repeated analytics filters in summary requests', async () => {
    const get = vi.spyOn(api, 'GET').mockResolvedValue({
      data: makeAnalyticsSummary(),
      response: new Response('{}', { status: 200 }),
    } as never)

    await analyticsApi.getSummary(commonQuery)

    expect(get).toHaveBeenCalledWith('/analytics/summary', {
      params: {
        query: {
          from: commonQuery.from,
          to: commonQuery.to,
          group_id: ['10001', '10002'],
          feature_key: ['ai_qa', 'quote'],
          result: ['success', 'fallback'],
          timezone: 'Asia/Shanghai',
        },
      },
    })
  })

  it('downloads exports with credentials and the server filename', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('group_id,value\n10001,8420', {
        status: 200,
        headers: {
          'Content-Disposition': "attachment; filename*=UTF-8''jxh-analytics.csv",
          'Content-Type': 'text/csv',
          'X-Export-Row-Count': '42',
        },
      }),
    )

    const result = await analyticsApi.exportData({
      ...commonQuery,
      dataset: 'rankings',
      format: 'csv',
      granularity: 'day',
      metric: 'group_message_count',
      dimension: 'group',
    })

    const request = fetchSpy.mock.calls[0]?.[0] as Request
    expect(request.credentials).toBe('include')
    expect(new URL(request.url).searchParams.getAll('group_id')).toEqual(['10001', '10002'])
    expect(result).toMatchObject({ filename: 'jxh-analytics.csv', rowCount: 42 })
    expect(await result.blob.text()).toContain('10001,8420')
  })
})
