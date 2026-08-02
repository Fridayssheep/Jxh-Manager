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
  makeJoinDecision,
  makeJoinDecisionResult,
  makeJoinRequest,
  makeJoinRequestSummary,
} from '@/test/join-request-fixture'
import JoinRequestsView from '../JoinRequestsView.vue'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

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
      expect.objectContaining({ decisionStatus: ['pending'], cursor: null, limit: 10 }),
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

  it('sends the trimmed rejection message for one request', async () => {
    const decide = vi.spyOn(joinRequestsApi, 'decide').mockResolvedValue(makeJoinDecisionResult())
    const wrapper = await mountView()
    await flushPromises()

    await wrapper.get('[data-test=request-row-flag-10001]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test=reject-request]').trigger('click')
    await wrapper.get('[data-test=decision-reason]').setValue('  信息不完整，请重新申请。  ')
    await wrapper.get('[data-test=confirm-decision]').trigger('click')
    await flushPromises()

    expect(decide).toHaveBeenCalledWith(
      'flag-10001',
      { action: 'reject', reason: '信息不完整，请重新申请。' },
      7,
    )
  })

  it('updates automatic approval and rejection independently', async () => {
    const updatePolicy = vi.spyOn(joinRequestsApi, 'updatePolicy')
    updatePolicy
      .mockResolvedValueOnce({
        group_id: '10001',
        enabled: true,
        mode: 'ai_fields_complete',
        required_fields: ['student_id', 'name', 'major'],
        auto_reject: false,
        version: 2,
        updated_at: '2026-07-29T09:00:00Z',
        updated_by: null,
      })
      .mockResolvedValueOnce({
        group_id: '10001',
        enabled: true,
        mode: 'ai_fields_complete',
        required_fields: ['student_id', 'name', 'major'],
        auto_reject: true,
        version: 3,
        updated_at: '2026-07-29T09:01:00Z',
        updated_by: null,
      })
    const wrapper = await mountView()
    await flushPromises()

    await wrapper.get('[data-test=request-row-flag-10001]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('自动处理策略')

    await wrapper.get('[data-test=policy-enabled]').setValue(true)
    await flushPromises()
    expect(updatePolicy).toHaveBeenNthCalledWith(1, '10001', { enabled: true }, 1)

    await wrapper.get('[data-test=policy-auto-reject]').setValue(true)
    await flushPromises()
    expect(updatePolicy).toHaveBeenNthCalledWith(2, '10001', { auto_reject: true }, 2)
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

  it('uses one required rejection message for a bulk decision', async () => {
    const bulkDecide = vi.spyOn(joinRequestsApi, 'bulkDecide').mockResolvedValue({
      group_id: '10001',
      action: 'reject',
      items: [],
      confirmed_count: 2,
      failed_count: 0,
      unknown_count: 0,
    })
    const wrapper = await mountView()
    await flushPromises()

    await wrapper.get('[data-test=select-flag-10001]').setValue(true)
    await wrapper.get('[data-test=select-flag-10002]').setValue(true)
    await wrapper.get('[data-test=bulk-reject]').trigger('click')
    await wrapper.get('[data-test=decision-reason]').setValue('  请完善验证信息后重新申请。  ')
    await wrapper.get('[data-test=confirm-decision]').trigger('click')
    await flushPromises()

    expect(bulkDecide).toHaveBeenCalledWith({
      group_id: '10001',
      action: 'reject',
      reason: '请完善验证信息后重新申请。',
      items: [
        { request_id: 'flag-10001', version: 7 },
        { request_id: 'flag-10002', version: 4 },
      ],
    })
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

  it('replaces cursor pages and clears page-bound selection and detail state', async () => {
    const pageTwo = makeJoinRequestSummary({
      request_id: 'flag-page-2',
      applicant_qq: '11223344',
      version: 2,
    })
    vi.mocked(joinRequestsApi.list).mockImplementation(async (query) => {
      if (query.cursor === 'cursor-2') {
        return { items: [pageTwo], next_cursor: null, has_more: false }
      }
      return { items: [first], next_cursor: 'cursor-2', has_more: true }
    })
    const wrapper = await mountView()
    await flushPromises()

    await wrapper.get('[data-test=select-flag-10001]').setValue(true)
    await wrapper.get('[data-test=request-row-flag-10001]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test=bulk-approve]').exists()).toBe(true)
    expect(wrapper.text()).toContain('计算机科学与技术')

    await wrapper.get('[data-test=cursor-next]').trigger('click')
    await flushPromises()

    expect(joinRequestsApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'cursor-2', limit: 10 }),
    )
    expect(wrapper.find('[data-test=request-row-flag-10001]').exists()).toBe(false)
    expect(wrapper.find('[data-test=request-row-flag-page-2]').exists()).toBe(true)
    expect(wrapper.find('[data-test=bulk-approve]').exists()).toBe(false)
    expect(wrapper.get('[aria-label="申请详情"]').text()).not.toContain('计算机科学与技术')

    await wrapper.get('[data-test=cursor-previous]').trigger('click')
    await flushPromises()

    expect(joinRequestsApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: null, limit: 10 }),
    )
    expect(wrapper.find('[data-test=request-row-flag-10001]').exists()).toBe(true)
    expect(wrapper.find('[data-test=request-row-flag-page-2]').exists()).toBe(false)
  })

  it('ignores an older list response that arrives after the latest refresh', async () => {
    const older = deferred<Awaited<ReturnType<typeof joinRequestsApi.list>>>()
    const latest = deferred<Awaited<ReturnType<typeof joinRequestsApi.list>>>()
    const olderItem = makeJoinRequestSummary({
      request_id: 'flag-older-response',
      applicant_qq: '11112222',
    })
    const latestItem = makeJoinRequestSummary({
      request_id: 'flag-latest-response',
      applicant_qq: '33334444',
    })
    vi.mocked(joinRequestsApi.list)
      .mockReset()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(latest.promise)

    const wrapper = await mountView()
    expect(joinRequestsApi.list).toHaveBeenCalledTimes(1)
    await wrapper.get('[data-test=join-request-filters]').trigger('submit')
    expect(joinRequestsApi.list).toHaveBeenCalledTimes(2)

    latest.resolve({ items: [latestItem], next_cursor: null, has_more: false })
    await flushPromises()
    expect(wrapper.find('[data-test=request-row-flag-latest-response]').exists()).toBe(true)

    older.resolve({ items: [olderItem], next_cursor: null, has_more: false })
    await flushPromises()
    expect(wrapper.find('[data-test=request-row-flag-latest-response]').exists()).toBe(true)
    expect(wrapper.find('[data-test=request-row-flag-older-response]').exists()).toBe(false)
  })

  it('requests the default page size and never subscribes to the event stream', async () => {
    const wrapper = await mountView()
    await flushPromises()

    expect(joinRequestsApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: null, limit: 10 }),
    )
    expect(wrapper.find('[data-test=join-request-page-size]').exists()).toBe(true)
  })

  it('reloads the first page with the selected page size', async () => {
    const wrapper = await mountView()
    await flushPromises()
    await wrapper.get('[data-test=cursor-next]').trigger('click')
    await flushPromises()

    const pageSize = wrapper
      .findAllComponents(AppSelect)
      .find((item) => item.props('dataTest') === 'join-request-page-size')
    if (!pageSize) throw new Error('page size select was not rendered')
    pageSize.vm.$emit('update:modelValue', '20')
    await flushPromises()

    expect(joinRequestsApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: null, limit: 20 }),
    )
  })

  it('keeps the current page size when the same option is chosen again', async () => {
    const wrapper = await mountView()
    await flushPromises()
    const callsAfterMount = vi.mocked(joinRequestsApi.list).mock.calls.length

    const pageSize = wrapper
      .findAllComponents(AppSelect)
      .find((item) => item.props('dataTest') === 'join-request-page-size')
    if (!pageSize) throw new Error('page size select was not rendered')
    pageSize.vm.$emit('update:modelValue', '10')
    await flushPromises()

    expect(vi.mocked(joinRequestsApi.list).mock.calls).toHaveLength(callsAfterMount)
  })

  it('keeps the queue in an internal scroll region with one sliding active highlight', async () => {
    const wrapper = await mountView()
    await flushPromises()

    expect(wrapper.find('[data-test=request-scroll]').exists()).toBe(true)
    expect(wrapper.find('[data-test=request-row-highlight]').exists()).toBe(true)
    expect(wrapper.find('[data-test=cursor-pager]').exists()).toBe(true)

    await wrapper.get('[data-test=request-row-flag-10001]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-test=request-row-highlight]').attributes('style')).toContain('opacity: 1')
  })
})
