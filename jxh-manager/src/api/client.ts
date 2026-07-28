import createClient from 'openapi-fetch'

import type { paths } from './schema'
import type { ApiErrorBody, ApiErrorEnvelope } from './types'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

let csrfToken: string | null = null
let unauthorizedHandler: (() => void) | null = null

export class AdminApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string | null
  readonly fields: Record<string, string[]>
  readonly retryable: boolean

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.name = 'AdminApiError'
    this.status = status
    this.code = body.code
    this.requestId = body.request_id
    this.fields = body.fields
    this.retryable = body.retryable
  }
}

export function setCsrfToken(value: string | null): void {
  csrfToken = value
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

export function createAdminFetch(fetchImplementation: typeof fetch = globalThis.fetch): typeof fetch {
  return async (input, init) => {
    const requestInput =
      typeof input === 'string' || input instanceof URL
        ? new URL(input.toString(), globalThis.location?.origin ?? 'http://localhost')
        : input
    const request = new Request(requestInput, { ...init, credentials: 'include' })
    const headers = new Headers(request.headers)

    if (!SAFE_METHODS.has(request.method.toUpperCase()) && csrfToken) {
      headers.set('X-CSRF-Token', csrfToken)
    }

    const authenticatedRequest = new Request(request, { headers })
    const response = await fetchImplementation(authenticatedRequest)

    if (response.status === 401 && !new URL(authenticatedRequest.url).pathname.endsWith('/auth/login')) {
      unauthorizedHandler?.()
    }

    return response
  }
}

export const api = createClient<paths>({
  baseUrl: import.meta.env.VITE_ADMIN_API_BASE_URL ?? '/api/admin/v1',
  fetch: createAdminFetch(),
})

export function ifMatch(version: number): string {
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new RangeError('version must be a non-negative safe integer')
  }

  return `"${version}"`
}

export function createIdempotencyKey(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('secure random UUID generation is unavailable')
  }

  return globalThis.crypto.randomUUID()
}

type ApiResult<T> = {
  data?: T
  error?: unknown
  response: Response
}

function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (!value || typeof value !== 'object' || !('error' in value)) return false

  const error = (value as { error?: unknown }).error
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      'message' in error &&
      'request_id' in error &&
      'fields' in error &&
      'retryable' in error,
  )
}

export function unwrap<T>(result: ApiResult<T>): T {
  if (result.response.ok) return result.data as T

  if (isApiErrorEnvelope(result.error)) {
    throw new AdminApiError(result.response.status, result.error.error)
  }

  throw new AdminApiError(result.response.status, {
    code: 'unknown_api_error',
    message: '请求未能完成，请稍后重试。',
    request_id: 'unknown',
    fields: {},
    retryable: result.response.status >= 500,
  })
}
