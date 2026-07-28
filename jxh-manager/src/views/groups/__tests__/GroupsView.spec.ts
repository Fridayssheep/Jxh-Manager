import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import { groupsApi } from '@/api/groups'
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
    },
  ],
  next_cursor: null,
  has_more: false,
}

async function mountGroups() {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().acceptContext(makeAuthContext(['groups:read', 'groups:sync', 'settings:read']))
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
  })
})
