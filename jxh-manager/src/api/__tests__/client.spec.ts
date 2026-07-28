import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AdminApiError,
  createAdminFetch,
  createIdempotencyKey,
  ifMatch,
  setCsrfToken,
  setUnauthorizedHandler,
  unwrap,
} from '../client'

describe('admin API client', () => {
  beforeEach(() => {
    setCsrfToken(null)
    setUnauthorizedHandler(null)
  })

  it('adds the in-memory csrf token and cookies to mutation requests', async () => {
    setCsrfToken('csrf-1')
    const fetchSpy = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
    const adminFetch = createAdminFetch(fetchSpy)

    await adminFetch('/api/admin/v1/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

    const request = fetchSpy.mock.calls[0]?.[0]
    expect(request).toBeInstanceOf(Request)
    expect((request as Request).credentials).toBe('include')
    expect((request as Request).headers.get('X-CSRF-Token')).toBe('csrf-1')
  })

  it('does not add csrf to safe reads', async () => {
    setCsrfToken('csrf-1')
    const fetchSpy = vi.fn<typeof fetch>(async () => Response.json({ items: [] }))
    const adminFetch = createAdminFetch(fetchSpy)

    await adminFetch('/api/admin/v1/groups', { method: 'GET' })

    const request = fetchSpy.mock.calls[0]?.[0] as Request
    expect(request.headers.has('X-CSRF-Token')).toBe(false)
  })

  it('notifies the auth store when a protected request becomes unauthorized', async () => {
    const onUnauthorized = vi.fn<() => void>()
    setUnauthorizedHandler(onUnauthorized)
    const adminFetch = createAdminFetch(async () =>
      Response.json(
        {
          error: {
            code: 'authentication_required',
            message: '需要登录',
            request_id: 'req-1',
            fields: {},
            retryable: false,
          },
        },
        { status: 401 },
      ),
    )

    await adminFetch('/api/admin/v1/overview')

    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('formats resource versions and creates request-safe idempotency keys', () => {
    expect(ifMatch(7)).toBe('"7"')

    const key = createIdempotencyKey()
    expect(key.length).toBeGreaterThanOrEqual(8)
    expect(key).toMatch(/^[A-Za-z0-9._:-]+$/)
  })

  it('maps the API error envelope to a stable typed error', () => {
    expect(() =>
      unwrap({
        response: new Response(null, { status: 409 }),
        error: {
          error: {
            code: 'resource_version_conflict',
            message: '资源已更新',
            request_id: 'req-2',
            fields: { version: ['请刷新后重试'] },
            retryable: false,
          },
        },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<AdminApiError>>({
        code: 'resource_version_conflict',
        status: 409,
        requestId: 'req-2',
      }),
    )
  })
})
