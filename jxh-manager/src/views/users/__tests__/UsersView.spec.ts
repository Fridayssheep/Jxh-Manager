import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usersApi } from '@/api/users'
import { useAuthStore } from '@/stores/auth'
import { makeAuthContext } from '@/test/auth-fixture'
import {
  makeAdminSession,
  makeAdminUser,
  makePasswordResetResult,
  makeSessionRevokeResult,
} from '@/test/user-fixture'
import UsersView from '../UsersView.vue'

async function mountView() {
  const pinia = createPinia(); setActivePinia(pinia)
  useAuthStore().acceptContext(makeAuthContext(['users:manage', 'sessions:manage']))
  return mount(UsersView, { global: { plugins: [pinia] }, attachTo: document.body })
}

describe('UsersView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(usersApi, 'list').mockResolvedValue({ items: [makeAdminUser()], next_cursor: null, has_more: false })
    vi.spyOn(usersApi, 'listSessions').mockResolvedValue({ items: [makeAdminSession()], next_cursor: null, has_more: false })
  })

  it('updates an account with its loaded version', async () => {
    const update = vi.spyOn(usersApi, 'update').mockResolvedValue(makeAdminUser({ display_name: '夜班维护员', version: 5 }))
    const wrapper = await mountView(); await flushPromises()
    await wrapper.get('[data-test=edit-user-user-2]').trigger('click')
    await wrapper.get('[data-test=user-display-name]').setValue('夜班维护员')
    await wrapper.get('[data-test=save-user]').trigger('click'); await flushPromises()
    expect(update).toHaveBeenCalledWith('user-2', expect.objectContaining({ display_name: '夜班维护员' }), 4)
  })

  it('shows how many sessions a password reset revoked', async () => {
    const reset = vi.spyOn(usersApi, 'resetPassword').mockResolvedValue(makePasswordResetResult())
    const wrapper = await mountView(); await flushPromises()
    await wrapper.get('[data-test=reset-password-user-2]').trigger('click')
    await wrapper.get('[data-test=new-password]').setValue('new-password-value')
    await wrapper.get('[data-test=confirm-user-action]').trigger('click'); await flushPromises()
    expect(reset).toHaveBeenCalledWith('user-2', 'new-password-value', 4)
    expect(wrapper.text()).toContain('已撤销 2 个会话')
  })

  it('creates an account from the account editor', async () => {
    const create = vi.spyOn(usersApi, 'create').mockResolvedValue(makeAdminUser())
    const wrapper = await mountView(); await flushPromises()

    await wrapper.get('[data-test=create-user]').trigger('click')
    await wrapper.get('[data-test=user-username]').setValue('maintainer')
    await wrapper.get('[data-test=user-display-name]').setValue('值班维护员')
    await wrapper.get('[data-test=user-role]').setValue('maintainer')
    await wrapper.get('[data-test=user-qq]').setValue('10002')
    await wrapper.get('[data-test=user-password]').setValue('initial-password-value')
    await wrapper.get('[data-test=save-user]').trigger('click'); await flushPromises()

    expect(create).toHaveBeenCalledWith({
      username: 'maintainer', display_name: '值班维护员', role: 'maintainer',
      qq_user_id: '10002', password: 'initial-password-value',
    })
  })

  it('requires confirmation before disabling an account', async () => {
    const update = vi.spyOn(usersApi, 'update').mockResolvedValue(makeAdminUser({ enabled: false, version: 5 }))
    const wrapper = await mountView(); await flushPromises()

    await wrapper.get('[data-test=disable-user-user-2]').trigger('click')
    expect(update).not.toHaveBeenCalled()
    await wrapper.get('[data-test=confirm-user-action]').trigger('click'); await flushPromises()

    expect(update).toHaveBeenCalledWith('user-2', { enabled: false }, 4)
    expect(wrapper.text()).toContain('账号已停用')
  })

  it('revokes all sessions for one account after confirmation', async () => {
    const revoke = vi.spyOn(usersApi, 'revokeUserSessions').mockResolvedValue(
      makeSessionRevokeResult({ session_id: null, revoked_count: 3 }),
    )
    const wrapper = await mountView(); await flushPromises()

    await wrapper.get('[data-test=revoke-user-sessions-user-2]').trigger('click')
    await wrapper.get('[data-test=confirm-user-action]').trigger('click'); await flushPromises()

    expect(revoke).toHaveBeenCalledWith('user-2')
    expect(wrapper.text()).toContain('已撤销 3 个会话')
  })

  it('filters and revokes a single session from the sessions tab', async () => {
    const revoke = vi.spyOn(usersApi, 'revokeSession').mockResolvedValue(makeSessionRevokeResult())
    const wrapper = await mountView(); await flushPromises()

    await wrapper.get('[data-test=sessions-tab]').trigger('click'); await flushPromises()
    await wrapper.get('select[name=session_status]').setValue('active')
    await wrapper.get('[data-test=session-filters]').trigger('submit'); await flushPromises()
    expect(usersApi.listSessions).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'active', cursor: null }))

    await wrapper.get('[data-test=revoke-session-session-2]').trigger('click')
    await wrapper.get('[data-test=confirm-user-action]').trigger('click'); await flushPromises()
    expect(revoke).toHaveBeenCalledWith('session-2')
  })
})
