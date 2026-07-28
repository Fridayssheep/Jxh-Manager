import type { components } from './schema'

export type ApiSchemas = components['schemas']
export type ApiErrorEnvelope = ApiSchemas['ErrorResponse']
export type ApiErrorBody = ApiSchemas['Error']
export type AuthContext = ApiSchemas['AuthContext']
export type AdminUser = ApiSchemas['AdminUser']
export type Permission = ApiSchemas['Permission']
export type Overview = ApiSchemas['Overview']
export type DashboardMetric = ApiSchemas['DashboardMetric']
export type OverviewTrendPoint = ApiSchemas['OverviewTrendPoint']
export type AdminEvent = ApiSchemas['AdminEvent']
export type EventTopic = ApiSchemas['EventTopic']
export type EventType = ApiSchemas['EventType']
