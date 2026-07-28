import { AdminApiError, api, unwrap } from './client'
import type { AuthContext } from './types'

export const authApi = {
  async login(username: string, password: string): Promise<AuthContext> {
    return unwrap(
      await api.POST('/auth/login', {
        body: { username, password },
      }),
    )
  },

  async me(): Promise<AuthContext | null> {
    const result = await api.GET('/auth/me')
    if (result.response.status === 401) return null
    return unwrap(result)
  },

  async logout(): Promise<void> {
    const result = await api.POST('/auth/logout')
    if (result.response.status === 401) return
    unwrap<void>(result)
  },
}

export function getLoginErrorMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.status === 401) return '账号或密码错误。'
    if (error.status === 429) return '尝试次数过多，请稍后再试。'
    if (error.retryable) return '登录服务暂时不可用，请稍后重试。'
    return error.message
  }

  return '无法连接管理服务，请检查网络后重试。'
}
