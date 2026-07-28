import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { groupsApi } from '@/api/groups'
import { scheduledJobsApi } from '@/api/scheduled-jobs'
import { useAuthStore } from '@/stores/auth'
import { makeAuthContext } from '@/test/auth-fixture'
import { makeScheduledJob, makeScheduledJobRun } from '@/test/scheduled-job-fixture'
import ScheduledJobsView from '../ScheduledJobsView.vue'

async function mountView() {
  const pinia = createPinia(); setActivePinia(pinia)
  useAuthStore().acceptContext(makeAuthContext(['scheduled_jobs:read', 'scheduled_jobs:write']))
  return mount(ScheduledJobsView, { global: { plugins: [pinia] }, attachTo: document.body })
}

describe('ScheduledJobsView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(scheduledJobsApi, 'list').mockResolvedValue({ items: [makeScheduledJob()], next_cursor: null, has_more: false })
    vi.spyOn(scheduledJobsApi, 'listRuns').mockResolvedValue({ items: [makeScheduledJobRun()], next_cursor: null, has_more: false })
    vi.spyOn(groupsApi, 'list').mockResolvedValue({ items: [], next_cursor: null, has_more: false })
  })

  it('edits a task using its loaded version', async () => {
    const update = vi.spyOn(scheduledJobsApi, 'update').mockResolvedValue(makeScheduledJob({ name: '更新后的提醒', version: 8 }))
    const wrapper = await mountView(); await flushPromises()

    await wrapper.get('[data-test=edit-job-job-1]').trigger('click')
    await wrapper.get('[data-test=job-name]').setValue('更新后的提醒')
    await wrapper.get('[data-test=save-job]').trigger('click'); await flushPromises()

    expect(update).toHaveBeenCalledWith('job-1', expect.objectContaining({ name: '更新后的提醒' }), 7)
  })

  it('reports a test-send result without changing the scheduled task timestamps', async () => {
    const testSend = vi.spyOn(scheduledJobsApi, 'testSend').mockResolvedValue(makeScheduledJobRun({ kind: 'test', result: 'unknown' }))
    const wrapper = await mountView(); await flushPromises()
    const originalTime = makeScheduledJob().last_run_at

    await wrapper.get('[data-test=test-send-job-1]').trigger('click')
    await wrapper.get('[data-test=confirm-test-send]').trigger('click'); await flushPromises()

    expect(testSend).toHaveBeenCalledWith('job-1', 7)
    expect(wrapper.text()).toContain('结果未知')
    expect(wrapper.text()).toContain(originalTime!.slice(0, 10))
  })
})
