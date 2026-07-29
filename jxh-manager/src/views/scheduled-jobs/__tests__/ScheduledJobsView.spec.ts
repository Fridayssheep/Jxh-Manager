import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { groupsApi } from '@/api/groups'
import { scheduledJobsApi } from '@/api/scheduled-jobs'
import OperationNotice from '@/components/feedback/OperationNotice.vue'
import AppOverlayTransition from '@/components/motion/AppOverlayTransition.vue'
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
    vi.spyOn(scheduledJobsApi, 'get').mockResolvedValue(makeScheduledJob())
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

  it('loads the latest task detail before opening the editor', async () => {
    vi.mocked(scheduledJobsApi.get).mockResolvedValue(
      makeScheduledJob({ name: '详情中的任务', message: '完整消息', version: 12 }),
    )
    const update = vi.spyOn(scheduledJobsApi, 'update').mockResolvedValue(
      makeScheduledJob({ name: '详情中的任务', version: 13 }),
    )
    const wrapper = await mountView(); await flushPromises()

    await wrapper.get('[data-test=edit-job-job-1]').trigger('click'); await flushPromises()

    expect(scheduledJobsApi.get).toHaveBeenCalledWith('job-1')
    expect((wrapper.get('[data-test=job-name]').element as HTMLInputElement).value).toBe('详情中的任务')
    await wrapper.get('[data-test=save-job]').trigger('click'); await flushPromises()
    expect(update).toHaveBeenCalledWith('job-1', expect.any(Object), 12)
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

  it('animates both the task drawer and secondary confirmation', async () => {
    const wrapper = await mountView()
    await flushPromises()

    expect(
      wrapper.findAllComponents(AppOverlayTransition).map((overlay) => overlay.props('variant')),
    ).toEqual(['drawer', 'dialog'])
    expect(wrapper.findComponent(OperationNotice).exists()).toBe(true)
  })
})
