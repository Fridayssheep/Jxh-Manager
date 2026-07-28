import { describe, expect, it } from 'vitest'

import { resolveAuthNavigation } from '../guard'

describe('resolveAuthNavigation', () => {
  it('sends signed-out users to login with the original path', () => {
    expect(
      resolveAuthNavigation(
        { name: 'groups', fullPath: '/groups?status=online', public: false },
        { authenticated: false, permissions: [] },
      ),
    ).toEqual({ name: 'login', query: { redirect: '/groups?status=online' } })
  })

  it('sends signed-in users away from the login page', () => {
    expect(
      resolveAuthNavigation(
        { name: 'login', fullPath: '/login', public: true },
        { authenticated: true, permissions: ['overview:read'] },
      ),
    ).toEqual({ name: 'overview' })
  })

  it('returns to overview when a permission is missing', () => {
    expect(
      resolveAuthNavigation(
        { name: 'users', fullPath: '/users', public: false, permission: 'users:manage' },
        { authenticated: true, permissions: ['overview:read'] },
      ),
    ).toEqual({ name: 'overview' })
  })

  it('allows a permitted route', () => {
    expect(
      resolveAuthNavigation(
        { name: 'groups', fullPath: '/groups', public: false, permission: 'groups:read' },
        { authenticated: true, permissions: ['overview:read', 'groups:read'] },
      ),
    ).toBe(true)
  })
})
