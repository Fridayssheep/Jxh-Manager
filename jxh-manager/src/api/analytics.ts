import { AdminApiError, api, createAdminFetch, unwrap } from './client'
import type {
  AnalyticsMetricKey,
  AnalyticsRankings,
  AnalyticsSummary,
  AnalyticsTimeseries,
  FeatureKey,
} from './types'

export type AnalyticsResultFilter =
  | 'success'
  | 'failed'
  | 'denied'
  | 'unknown'
  | 'fallback'
  | 'skipped'

export type AnalyticsDimension = 'group' | 'command' | 'knowledge_entry'
export type AnalyticsGranularity = 'hour' | 'day'
export type AnalyticsDataset =
  | 'summary'
  | 'timeseries'
  | 'rankings'
  | 'join_requests'
  | 'scheduled_job_runs'
export type AnalyticsExportFormat = 'csv' | 'xlsx'

export type AnalyticsCommonQuery = {
  from: string
  to: string
  groupIds: readonly string[]
  featureKeys: readonly FeatureKey[]
  results: readonly AnalyticsResultFilter[]
  timezone: string
}

export type AnalyticsTimeseriesQuery = AnalyticsCommonQuery & {
  granularity: AnalyticsGranularity
  metrics: readonly AnalyticsMetricKey[]
}

export type AnalyticsRankingQuery = AnalyticsCommonQuery & {
  dimension: AnalyticsDimension
  metric: AnalyticsMetricKey
  limit?: number
}

export type AnalyticsExportQuery = AnalyticsCommonQuery & {
  dataset: AnalyticsDataset
  format: AnalyticsExportFormat
  granularity?: AnalyticsGranularity
  metric?: AnalyticsMetricKey
  dimension?: AnalyticsDimension
}

export type AnalyticsExport = {
  blob: Blob
  filename: string
  rowCount: number | null
}

function commonParams(query: AnalyticsCommonQuery) {
  return {
    from: query.from || undefined,
    to: query.to || undefined,
    group_id: query.groupIds.length ? [...query.groupIds] : undefined,
    feature_key: query.featureKeys.length ? [...query.featureKeys] : undefined,
    result: query.results.length ? [...query.results] : undefined,
    timezone: query.timezone || undefined,
  }
}

function appendCommonParams(params: URLSearchParams, query: AnalyticsCommonQuery): void {
  if (query.from) params.set('from', query.from)
  if (query.to) params.set('to', query.to)
  query.groupIds.forEach((groupId) => params.append('group_id', groupId))
  query.featureKeys.forEach((featureKey) => params.append('feature_key', featureKey))
  query.results.forEach((result) => params.append('result', result))
  if (query.timezone) params.set('timezone', query.timezone)
}

function exportFilename(disposition: string | null, fallback: string): string {
  const extended = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const regular = disposition?.match(/filename="?([^";]+)"?/i)?.[1]
  const decoded = extended ? decodeURIComponent(extended) : regular
  const basename = decoded
    ?.split(/[\\/]/)
    .pop()
    ?.split('')
    .filter((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
    .join('')
    .trim()
  return basename || fallback
}

export const analyticsApi = {
  async getSummary(query: AnalyticsCommonQuery): Promise<AnalyticsSummary> {
    return unwrap(await api.GET('/analytics/summary', { params: { query: commonParams(query) } }))
  },

  async getTimeseries(query: AnalyticsTimeseriesQuery): Promise<AnalyticsTimeseries> {
    return unwrap(await api.GET('/analytics/timeseries', { params: { query: {
      ...commonParams(query), granularity: query.granularity, metric: [...query.metrics],
    } } }))
  },

  async getRankings(query: AnalyticsRankingQuery): Promise<AnalyticsRankings> {
    return unwrap(await api.GET('/analytics/rankings', { params: { query: {
      ...commonParams(query), dimension: query.dimension, metric: query.metric, limit: query.limit ?? 10,
    } } }))
  },

  async exportData(query: AnalyticsExportQuery): Promise<AnalyticsExport> {
    const baseUrl = import.meta.env.VITE_ADMIN_API_BASE_URL ?? '/api/admin/v1'
    const url = new URL(
      `${baseUrl.replace(/\/$/, '')}/analytics/export`,
      globalThis.location?.origin ?? 'http://localhost',
    )
    appendCommonParams(url.searchParams, query)
    url.searchParams.set('dataset', query.dataset)
    url.searchParams.set('format', query.format)
    if (query.granularity) url.searchParams.set('granularity', query.granularity)
    if (query.metric) url.searchParams.set('metric', query.metric)
    if (query.dimension) url.searchParams.set('dimension', query.dimension)

    const response = await createAdminFetch()(url)
    if (!response.ok) {
      throw new AdminApiError(response.status, {
        code: 'analytics_export_failed',
        message: '统计数据导出失败',
        request_id: response.headers.get('X-Request-ID') ?? 'unknown',
        fields: {},
        retryable: response.status >= 500,
      })
    }

    const rowCountHeader = response.headers.get('X-Export-Row-Count')
    const rowCount = rowCountHeader === null ? null : Number.parseInt(rowCountHeader, 10)
    return {
      blob: await response.blob(),
      filename: exportFilename(
        response.headers.get('Content-Disposition'),
        `jxh-analytics.${query.format}`,
      ),
      rowCount: rowCount !== null && Number.isSafeInteger(rowCount) && rowCount >= 0 ? rowCount : null,
    }
  },
}
