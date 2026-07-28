import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { authApi } from '@/api/auth'
import { setCsrfToken, setUnauthorizedHandler } from '@/api/client'
import type { AdminUser, AuthContext, Permission } from '@/api/types'

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref<AdminUser | null>(null)
  const permissions = ref<Permission[]>([])
  const ready = ref(false)
  const pending = ref(false)
  const bootstrapError = ref<unknown>(null)
  let bootstrapPromise: Promise<void> | null = null

  const isAuthenticated = computed(() => currentUser.value !== null)

  function acceptContext(context: AuthContext): void {
    currentUser.value = context.user
    permissions.value = [...context.permissions]
    setCsrfToken(context.csrf_token)
    ready.value = true
  }

  function clearSession(): void {
    currentUser.value = null
    permissions.value = []
    setCsrfToken(null)
    ready.value = true
  }

  function hasPermission(permission: Permission): boolean {
    return permissions.value.includes(permission)
  }

  async function bootstrap(): Promise<void> {
    if (ready.value) return
    if (bootstrapPromise) return bootstrapPromise

    bootstrapPromise = (async () => {
      pending.value = true
      bootstrapError.value = null
      try {
        const context = await authApi.me()
        if (context) acceptContext(context)
        else clearSession()
      } catch (reason) {
        bootstrapError.value = reason
        clearSession()
      } finally {
        pending.value = false
        ready.value = true
        bootstrapPromise = null
      }
    })()

    return bootstrapPromise
  }

  async function login(username: string, password: string): Promise<void> {
    pending.value = true
    bootstrapError.value = null
    try {
      acceptContext(await authApi.login(username, password))
    } finally {
      pending.value = false
    }
  }

  async function logout(): Promise<void> {
    pending.value = true
    try {
      await authApi.logout()
    } finally {
      pending.value = false
      clearSession()
    }
  }

  setUnauthorizedHandler(clearSession)

  return {
    currentUser,
    permissions,
    ready,
    pending,
    bootstrapError,
    isAuthenticated,
    acceptContext,
    clearSession,
    hasPermission,
    bootstrap,
    login,
    logout,
  }
})
