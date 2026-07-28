import type { Permission } from '@/api/types'

type RouteSnapshot = {
  name: string | symbol | null | undefined
  fullPath: string
  public?: boolean
  permission?: Permission
}

type AuthSnapshot = {
  authenticated: boolean
  permissions: readonly Permission[]
}

type NavigationDecision =
  | true
  | { name: 'login'; query: { redirect: string } }
  | { name: 'overview' }

export function resolveAuthNavigation(
  route: RouteSnapshot,
  auth: AuthSnapshot,
): NavigationDecision {
  if (route.public) {
    if (auth.authenticated && route.name === 'login') return { name: 'overview' }
    return true
  }

  if (!auth.authenticated) {
    return { name: 'login', query: { redirect: route.fullPath } }
  }

  if (route.permission && !auth.permissions.includes(route.permission)) {
    return { name: 'overview' }
  }

  return true
}
