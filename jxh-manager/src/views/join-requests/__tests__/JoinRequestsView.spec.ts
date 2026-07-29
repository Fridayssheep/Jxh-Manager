import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AdminApiError } from '@/api/client'
import { joinRequestsApi } from '@/api/join-requests'
import OperationNotice from '@/components/feedback/OperationNotice.vue'
import AppSelect from '@/components/form/AppSelect.vue'
import { useAuthStore } from '@/stores/auth'
import { makeAuthContext } from '@/test/auth-fixture'
import {
  makeJoinDecisionResult,
  makeJoinRequest,
  makeJoinRequestSummary,
} from '@/test/join-request-fixture'
import JoinRequestsView from '../JoinRequestsView.vue'

async function selectValue(wrapper: VueWrapper, name: string, value: string): Promise<void> {
  const select = wrapper.findAllComponents(AppSelect).find((item) => item.props('name') === name)
  if (!select) throw new Error(`AppSelect ${name} was not rendered`)
  select.vm.$emit('update:modelValue', value)
  await wrapper.vm.$nextTick()
}

const first = makeJoinRequestSummary()
const sameGroup = makeJoinRequestSummary({ request_id: 'flag-10002', applicant_qq: '13579246', version: 4 })
const otherGroup = makeJoinRequestSummary({
  request_id: 'flag-20001',
  applicant_qq: '99887766',
  group: { group_id: '20002', name: '新生答疑群' },
  version: 2,
})

async function mountView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().acceptContext(
    makeAuthContext(['join_requests:read', 'join_requests:decide', 'join_policies:write']),
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/join-requests', component: JoinRequestsView }],
  })
  await router.push('/join-requests')
  await router.isReady()
  return mount(JoinRequestsView, { global: { plugins: [pinia, router] }, attachTo: document.body })
}

describe('JoinRequestsView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(joinRequestsApi, 'list').mockResolvedValue({
      items: [first, sameGroup, otherGroup],
      next_cursor: null,
      has_more: false,
    })
    vi.spyOn(joinRequestsApi, 'get').mockResolvedValue(makeJoinRequest())
    vi.spyOn(joinRequestsApi, 'listDecisions').mockResolvedValue({
      items: [],
      next_cursor: null,
      has_more: false,
    })
    vi.spyOn(joinRequestsApi, 'getPolicy').mockResolvedValue({
      group_id: '10001',
      enabled: false,
      mode: 'ai_fields_complete',
      required_fields: ['student_id', 'name', 'major'],
      auto_reject: false,
      version: 1,
      updated_at: '2026-07-28T05:00:00Z',
      updated_by: null,
    })
  })

  it('opens the request with AI fields and submits a versioned decision', async () => {
    const decide = vi.spyOn(joinRequestsApi, 'decide').mockResolvedValue(makeJoinDecisionResult())
    const wrapper = await mountView()
    await flushPromises()

    expect(joinRequestsApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ decisionStatus: ['pending'], cursor: null }),
    )
    await wrapper.get('[data-test=request-row-flag-10001]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('计算机科学与技术')
    await wrapper.get('[data-test=approve-request]').trigger('click')
    await wrapper.get('[data-test=decision-reason]').setValue('信息完整')
    await wrapper.get('[data-test=confirm-decision]').trigger('click')
    await flushPromises()

    expect(decide).toHaveBeenCalledWith(
      'flag-10001',
      { action: 'approve', reason: '信息完整' },
      7,
    )
    expect(wrapper.text()).toContain('已确认批准')
  })

  it('keeps request details visible when the group policy does not exist', async () => {
    vi.mocked(joinRequestsApi.getPolicy).mockRejectedValue(
      new AdminApiError(404, {
        code: 'not_found',
        message: 'join request does not exist',
        request_id: 'request-policy-404',
        fields: {},
        retryable: false,
      }),
    )
    const wrapper = await mountView()
    await flushPromises()

    await wrapper.get('[data-test=request-row-flag-10001]').trigger('click')
    await flushPromises()

    const detailText = wrapper.get('[aria-label="申请详情"]').text()
    expect(joinRequestsApi.get).toHaveBeenCalledWith('flag-10001')
    expect(joinRequestsApi.listDecisions).toHaveBeenCalledWith('flag-10001')
    expect(detailText).toContain('计算机科学与技术')
    expect(detailText).toContain('决策时间线')
    expect(wrapper.text()).not.toContain('join request does not exist')
    expect(wrapper.text()).not.toContain('自动批准策略')
    expect(wrapper.find('[data-test=approve-request]').exists()).toBe(true)
  })

  it('limits bulk selection to one group and sends every loaded version', async () => {
    const bulkDecide = vi.spyOn(joinRequestsApi, 'bulkDecide').mockResolvedValue({
      group_id: '10001',
      action: 'approve',
      items: [],
      confirmed_count: 2,
      failed_count: 0,
      unknown_count: 0,
    })
    const wrapper = await mountView()
    await flushPromises()

    await wrapper.get('[data-test=select-flag-10001]').setValue(true)
    expect(wrapper.get('[data-test=select-flag-20001]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-test=select-flag-10002]').setValue(true)
    await wrapper.get('[data-test=bulk-approve]').trigger('click')
    await wrapper.get('[data-test=confirm-decision]').trigger('click')
    await flushPromises()

    expect(bulkDecide).toHaveBeenCalledWith({
      group_id: '10001',
      action: 'approve',
      reason: undefined,
      items: [
        { request_id: 'flag-10001', version: 7 },
        { request_id: 'flag-10002', version: 4 },
      ],
    })
    expect(wrapper.text()).toContain('确认 2，失败 0，未知 0')
  })

  it('submits the observed status and ordering filters', async () => {
    const wrapper = await mountView()
    await flushPromises()

    await selectValue(wrapper, 'observed_status', 'checked')
    await selectValue(wrapper, 'sort', 'requested_at_asc')
    await wrapper.get('[data-test=join-request-filters]').trigger('submit')
    await flushPromises()

    expect(joinRequestsApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        observedStatus: 'checked',
        sort: 'requested_at_asc',
        cursor: null,
      }),
    )
  })

  it('limits a bulk selection to twenty requests', async () => {
    const requests = Array.from({ length: 21 }, (_, index) =>
      makeJoinRequestSummary({
        request_id: `flag-${index + 1}`,
        applicant_qq: `${10000000 + index}`,
      }),
    )
    vi.mocked(joinRequestsApi.list).mockResolvedValue({
      items: requests,
      next_cursor: null,
      has_more: false,
    })
    const wrapper = await mountView()
    await flushPromises()

    for (const request of requests.slice(0, 20)) {
      await wrapper.get(`[data-test=select-${request.request_id}]`).setValue(true)
    }

    expect(wrapper.get('[data-test=select-flag-21]').attributes('disabled')).toBeDefined()
  })

  it('reports an unknown outcome when the decision connection is interrupted', async () => {
    vi.spyOn(joinRequestsApi, 'decide').mockRejectedValue(new TypeError('network interrupted'))
    const wrapper = await mountView()
    await flushPromises()
    await wrapper.get('[data-test=request-row-flag-10001]').trigger('click')
    await flushPromises()

    await wrapper.get('[data-test=approve-request]').trigger('click')
    await wrapper.get('[data-test=confirm-decision]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('处理结果未知')
    expect(wrapper.text()).toContain('不要重复提交')
    expect(wrapper.findComponent(OperationNotice).exists()).toBe(true)
  })
})
