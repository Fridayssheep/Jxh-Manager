import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import LoginView from '../LoginView.vue'

async function mountLogin() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: LoginView },
      { path: '/', component: { template: '<div>overview</div>' } },
    ],
  })
  await router.push('/login')
  await router.isReady()
  const wrapper = mount(LoginView, { global: { plugins: [pinia, router] } })

  return { wrapper, router, auth: useAuthStore() }
}

describe('LoginView', () => {
  it('validates required credentials before calling the API', async () => {
    const { wrapper, auth } = await mountLogin()
    const login = vi.spyOn(auth, 'login')

    await wrapper.get('form').trigger('submit')

    expect(login).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请输入账号')
    expect(wrapper.text()).toContain('请输入密码')
  })

  it('logs in and returns to the requested page', async () => {
    const { wrapper, router, auth } = await mountLogin()
    vi.spyOn(auth, 'login').mockResolvedValue()

    await wrapper.get('input[name=username]').setValue('operator')
    await wrapper.get('input[name=password]').setValue('a-secure-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(auth.login).toHaveBeenCalledWith('operator', 'a-secure-password')
    expect(router.currentRoute.value.path).toBe('/')
  })
})
