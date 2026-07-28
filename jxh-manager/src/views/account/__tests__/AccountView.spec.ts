import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { makeAuthContext } from '@/test/auth-fixture'
import AccountView from '../AccountView.vue'

describe('AccountView', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('accepts the rotated auth context after changing the password', async () => {
    const pinia = createPinia(); setActivePinia(pinia)
    const auth = useAuthStore()
    auth.acceptContext(makeAuthContext(['overview:read']))
    const rotated = makeAuthContext(['overview:read', 'audit:read'])
    vi.spyOn(authApi, 'changePassword').mockResolvedValue(rotated)
    const wrapper = mount(AccountView, { global: { plugins: [pinia] } })

    await wrapper.get('input[name=current_password]').setValue('current-password')
    await wrapper.get('input[name=new_password]').setValue('new-password-value')
    await wrapper.get('input[name=confirm_password]').setValue('new-password-value')
    await wrapper.get('[data-test=change-password]').trigger('submit')
    await flushPromises()

    expect(authApi.changePassword).toHaveBeenCalledWith('current-password', 'new-password-value')
    expect(auth.permissions).toContain('audit:read')
    expect(wrapper.text()).toContain('密码已更新')
  })

  it('does not submit when the password confirmation differs', async () => {
    const pinia = createPinia(); setActivePinia(pinia)
    const auth = useAuthStore()
    auth.acceptContext(makeAuthContext(['overview:read']))
    const changePassword = vi.spyOn(authApi, 'changePassword')
    const wrapper = mount(AccountView, { global: { plugins: [pinia] } })

    await wrapper.get('input[name=current_password]').setValue('current-password')
    await wrapper.get('input[name=new_password]').setValue('new-password-value')
    await wrapper.get('input[name=confirm_password]').setValue('different-password-value')
    await wrapper.get('[data-test=change-password]').trigger('submit')

    expect(changePassword).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('两次输入的新密码不一致')
  })
})
