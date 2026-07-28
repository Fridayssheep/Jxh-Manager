import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authApi } from '@/api/auth'
import { makeAuthContext } from '@/test/auth-fixture'
import { useAuthStore } from '../auth'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('keeps the csrf token and authenticated user in memory after login', async () => {
    vi.spyOn(authApi, 'login').mockResolvedValue(makeAuthContext(['overview:read', 'groups:read']))
    const store = useAuthStore()

    await store.login('operator', 'a-secure-password')

    expect(store.currentUser?.username).toBe('operator')
    expect(store.hasPermission('groups:read')).toBe(true)
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('clears the local identity when the API reports an expired session', async () => {
    vi.spyOn(authApi, 'login').mockResolvedValue(makeAuthContext())
    const store = useAuthStore()
    await store.login('operator', 'a-secure-password')

    store.clearSession()

    expect(store.currentUser).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('clears authentication only when the revoked session is the current session', () => {
    const store = useAuthStore()
    store.acceptContext(makeAuthContext())

    expect(store.currentSessionId).toBe('session-1')
    expect(store.clearSessionIfCurrent('session-other')).toBe(false)
    expect(store.isAuthenticated).toBe(true)

    expect(store.clearSessionIfCurrent('session-1')).toBe(true)
    expect(store.currentSessionId).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('treats an unauthenticated bootstrap as a ready signed-out state', async () => {
    vi.spyOn(authApi, 'me').mockResolvedValue(null)
    const store = useAuthStore()

    await store.bootstrap()

    expect(store.ready).toBe(true)
    expect(store.isAuthenticated).toBe(false)
  })

  it('keeps routing usable when the authentication service is offline', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValue(new TypeError('network offline'))
    const store = useAuthStore()

    await expect(store.bootstrap()).resolves.toBeUndefined()

    expect(store.ready).toBe(true)
    expect(store.isAuthenticated).toBe(false)
    expect(store.bootstrapError).toBeInstanceOf(TypeError)
  })
})
