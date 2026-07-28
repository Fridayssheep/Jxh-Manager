import type { components } from './schema'

export type ApiSchemas = components['schemas']
export type ApiErrorEnvelope = ApiSchemas['ErrorResponse']
export type ApiErrorBody = ApiSchemas['Error']
export type AuthContext = ApiSchemas['AuthContext']
export type AdminUser = ApiSchemas['AdminUser']
export type Permission = ApiSchemas['Permission']
