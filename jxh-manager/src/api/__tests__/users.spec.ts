import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/api/client'
import { usersApi } from '@/api/users'
import {
  makeAdminSession,
  makeAdminUser,
  makePasswordResetResult,
  makeSessionRevokeResult,
} from '@/test/user-fixture'

describe('usersApi mutation boundaries', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('lists accounts with filters and cursor pagination', async () => {
    const get = vi.spyOn(api, 'GET').mockResolvedValue({
      data: { items: [makeAdminUser()], next_cursor: 'next-users', has_more: true },
      response: new Response('{}', { status: 200 }),
    } as never)

    await usersApi.list({ query: 'maintainer', role: 'maintainer', enabled: true, cursor: 'cursor-1' })

    expect(get).toHaveBeenCalledWith('/users', { params: { query: {
      query: 'maintainer', role: 'maintainer', enabled: true, cursor: 'cursor-1', limit: 30,
    } } })
  })

  it('creates and reads an account using the resource contract', async () => {
    const user = makeAdminUser()
    const post = vi.spyOn(api, 'POST').mockResolvedValue({
      data: user, response: new Response('{}', { status: 201 }),
    } as never)
    const get = vi.spyOn(api, 'GET').mockResolvedValue({
      data: user, response: new Response('{}', { status: 200 }),
    } as never)
    const payload = {
      username: 'maintainer', display_name: '值班维护员', role: 'maintainer' as const,
      qq_user_id: '10002', password: 'initial-password-value',
    }

    await usersApi.create(payload)
    await usersApi.get('user-2')

    expect(post).toHaveBeenCalledWith('/users', { body: payload })
    expect(get).toHaveBeenCalledWith('/users/{user_id}', {
      params: { path: { user_id: 'user-2' } },
    })
  })

  it('updates an account with its loaded version', async () => {
    const patch = vi.spyOn(api, 'PATCH').mockResolvedValue({
      data: makeAdminUser(), response: new Response('{}', { status: 200 }),
    } as never)
    await usersApi.update('user-2', { role: 'observer' }, 4)
    expect(patch).toHaveBeenCalledWith('/users/{user_id}', {
      params: { path: { user_id: 'user-2' }, header: { 'If-Match': '"4"' } },
      body: { role: 'observer' },
    })
  })

  it('resets a password with version and one idempotency key', async () => {
    const post = vi.spyOn(api, 'POST').mockResolvedValue({
      data: makePasswordResetResult(), response: new Response('{}', { status: 200 }),
    } as never)
    await usersApi.resetPassword('user-2', 'new-password-value', 4)
    expect(post).toHaveBeenCalledWith('/users/{user_id}/password-reset', {
      params: { path: { user_id: 'user-2' }, header: {
        'If-Match': '"4"', 'Idempotency-Key': expect.stringMatching(/^[A-Za-z0-9._:-]+$/),
      } },
      body: { new_password: 'new-password-value' },
    })
  })

  it('revokes one session with an idempotency key', async () => {
    const post = vi.spyOn(api, 'POST').mockResolvedValue({
      data: makeSessionRevokeResult(), response: new Response('{}', { status: 200 }),
    } as never)
    await usersApi.revokeSession('session-2')
    expect(post).toHaveBeenCalledWith('/sessions/{session_id}/revoke', {
      params: { path: { session_id: 'session-2' }, header: {
        'Idempotency-Key': expect.stringMatching(/^[A-Za-z0-9._:-]+$/),
      } },
    })
  })

  it('revokes all user sessions with one idempotency key', async () => {
    const post = vi.spyOn(api, 'POST').mockResolvedValue({
      data: makeSessionRevokeResult({ session_id: null, revoked_count: 3 }),
      response: new Response('{}', { status: 200 }),
    } as never)

    await usersApi.revokeUserSessions('user-2')

    expect(post).toHaveBeenCalledWith('/users/{user_id}/sessions/revoke', {
      params: { path: { user_id: 'user-2' }, header: {
        'Idempotency-Key': expect.stringMatching(/^[A-Za-z0-9._:-]+$/),
      } },
    })
  })

  it('lists sessions with explicit filters and cursor pagination', async () => {
    const get = vi.spyOn(api, 'GET').mockResolvedValue({
      data: { items: [makeAdminSession()], next_cursor: null, has_more: false },
      response: new Response('{}', { status: 200 }),
    } as never)

    await usersApi.listSessions({
      userId: 'user-2', status: 'active', current: false, cursor: 'session-cursor',
    })

    expect(get).toHaveBeenCalledWith('/sessions', { params: { query: {
      user_id: 'user-2', status: 'active', current: false,
      cursor: 'session-cursor', limit: 30,
    } } })
  })
})
