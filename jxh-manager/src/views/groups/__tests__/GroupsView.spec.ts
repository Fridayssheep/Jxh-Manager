import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AdminApiError } from '@/api/client'
import { groupsApi } from '@/api/groups'
import { joinRequestsApi } from '@/api/join-requests'
import type { Permission } from '@/api/types'
import OperationNotice from '@/components/feedback/OperationNotice.vue'
import GroupJoinPolicyControls from '@/components/groups/GroupJoinPolicyControls.vue'
import { useAuthStore } from '@/stores/auth'
import { makeAuthContext } from '@/test/auth-fixture'
import GroupsView from '../GroupsView.vue'

const groupPage = {
  items: [
    {
      group_id: '10001',
      name: '精弘网络维护群',
      member_count: 428,
      max_member_count: 500,
      bot_role: 'admin' as const,
      snapshot_state: 'stale' as const,
      last_synced_at: '2026-07-28T05:00:00Z',
      features: [
        { key: 'ai_qa' as const, enabled: true, source: 'group_override' as const },
      ],
      join_request_policy: { enabled: false, auto_reject: false, version: 3 },
    },
  ],
  next_cursor: null,
  has_more: false,
}

async function mountGroups(
  permissions: Permission[] = ['groups:read', 'groups:sync', 'settings:read'],
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().acceptContext(makeAuthContext(permissions))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/groups', component: GroupsView },
      { path: '/groups/:groupId', component: { template: '<div />' } },
      { path: '/settings', component: { template: '<div />' } },
    ],
  })
  await router.push('/groups')
  await router.isReady()
  return mount(GroupsView, { global: { plugins: [pinia, router] } })
}

describe('GroupsView', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('renders stale group snapshots and applies directory filters', async () => {
    const list = vi.spyOn(groupsApi, 'list').mockResolvedValue(groupPage)
    const wrapper = await mountGroups()
    await flushPromises()

    expect(wrapper.text()).toContain('精弘网络维护群')
    expect(wrapper.text()).toContain('陈旧快照')

    await wrapper.get('input[name=query]').setValue('10001')
    await wrapper.get('form[data-test=group-filters]').trigger('submit')
    await flushPromises()

    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: '10001', cursor: null }),
    )
  })

  it('runs an idempotent group sync and refreshes the directory', async () => {
    const list = vi.spyOn(groupsApi, 'list').mockResolvedValue(groupPage)
    list.mockClear()
    const sync = vi.spyOn(groupsApi, 'sync').mockResolvedValue({
      synced_at: '2026-07-28T05:10:00Z',
      added_count: 1,
      updated_count: 2,
      removed_count: 0,
      total_count: 23,
    })
    const wrapper = await mountGroups()
    await flushPromises()

    await wrapper.get('[data-test=sync-groups]').trigger('click')
    await flushPromises()

    expect(sync).toHaveBeenCalledOnce()
    expect(list).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('新增 1，更新 2')
    expect(wrapper.findComponent(OperationNotice).exists()).toBe(true)
  })

  it('updates independent policies with the current server version', async () => {
    vi.spyOn(groupsApi, 'list').mockResolvedValue(structuredClone(groupPage))
    const updatePolicy = vi
      .spyOn(joinRequestsApi, 'updatePolicy')
      .mockResolvedValueOnce({
        group_id: '10001',
        enabled: true,
        mode: 'ai_fields_complete',
        required_fields: ['student_id', 'name', 'major'],
        auto_reject: false,
        updated_at: '2026-07-28T05:01:00Z',
        updated_by: null,
        version: 4,
      })
      .mockResolvedValueOnce({
        group_id: '10001',
        enabled: true,
        mode: 'ai_fields_complete',
        required_fields: ['student_id', 'name', 'major'],
        auto_reject: true,
        updated_at: '2026-07-28T05:02:00Z',
        updated_by: null,
        version: 5,
      })
    const wrapper = await mountGroups([
      'groups:read',
      'settings:read',
      'join_policies:write',
    ])
    await flushPromises()

    await wrapper.get<HTMLInputElement>('[data-test=join-policy-enabled]').setValue(true)
    await flushPromises()
    await wrapper.get<HTMLInputElement>('[data-test=join-policy-auto-reject]').setValue(true)
    await flushPromises()

    expect(updatePolicy).toHaveBeenNthCalledWith(1, '10001', { enabled: true }, 3)
    expect(updatePolicy).toHaveBeenNthCalledWith(2, '10001', { auto_reject: true }, 4)
    expect(wrapper.get<HTMLInputElement>('[data-test=join-policy-enabled]').element.checked).toBe(true)
    expect(wrapper.get<HTMLInputElement>('[data-test=join-policy-auto-reject]').element.checked).toBe(true)
  })

  it('keeps policy controls read-only without write permission', async () => {
    vi.spyOn(groupsApi, 'list').mockResolvedValue(structuredClone(groupPage))
    const wrapper = await mountGroups(['groups:read', 'settings:read'])
    await flushPromises()

    expect(wrapper.getComponent(GroupJoinPolicyControls).get('fieldset').attributes('disabled')).toBeDefined()
  })

  it('marks only the saving group as busy', async () => {
    const secondGroup = structuredClone(groupPage.items[0]!)
    secondGroup.group_id = '10002'
    secondGroup.name = 'Second Group'
    vi.spyOn(groupsApi, 'list').mockResolvedValue({
      ...structuredClone(groupPage),
      items: [structuredClone(groupPage.items[0]!), secondGroup],
    })
    let resolveUpdate!: (value: Awaited<ReturnType<typeof joinRequestsApi.updatePolicy>>) => void
    vi.spyOn(joinRequestsApi, 'updatePolicy').mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve
      }),
    )
    const wrapper = await mountGroups(['groups:read', 'join_policies:write'])
    await flushPromises()

    await wrapper
      .get('[data-group-id="10001"] [data-test=join-policy-enabled]')
      .trigger('change')
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-group-id="10001"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.get('[data-group-id="10002"]').attributes('aria-busy')).toBe('false')

    resolveUpdate({
      group_id: '10001',
      enabled: true,
      mode: 'ai_fields_complete',
      required_fields: ['student_id', 'name', 'major'],
      auto_reject: false,
      updated_at: '2026-07-28T05:01:00Z',
      updated_by: null,
      version: 4,
    })
    await flushPromises()
  })

  it('reloads current filters on conflict and preserves state on other failures', async () => {
    const list = vi.spyOn(groupsApi, 'list').mockResolvedValue(structuredClone(groupPage))
    const updatePolicy = vi.spyOn(joinRequestsApi, 'updatePolicy')
    const wrapper = await mountGroups(['groups:read', 'join_policies:write'])
    await flushPromises()

    await wrapper.get('input[name=query]').setValue('10001')
    await wrapper.get('form[data-test=group-filters]').trigger('submit')
    await flushPromises()

    updatePolicy.mockRejectedValueOnce(
      new AdminApiError(409, {
        code: 'resource_version_conflict',
        message: 'Policy changed',
        request_id: 'request-1',
        fields: {},
        retryable: false,
      }),
    )
    await wrapper.get<HTMLInputElement>('[data-test=join-policy-enabled]').setValue(true)
    await flushPromises()

    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ query: '10001', cursor: null }))
    expect(wrapper.findAllComponents(OperationNotice)[1]!.props('tone')).toBe('warning')

    updatePolicy.mockRejectedValueOnce(new Error('offline'))
    await wrapper.get<HTMLInputElement>('[data-test=join-policy-enabled]').setValue(true)
    await flushPromises()

    expect(wrapper.get<HTMLInputElement>('[data-test=join-policy-enabled]').element.checked).toBe(false)
    expect(wrapper.findAllComponents(OperationNotice)[1]!.props('tone')).toBe('danger')
  })
})
