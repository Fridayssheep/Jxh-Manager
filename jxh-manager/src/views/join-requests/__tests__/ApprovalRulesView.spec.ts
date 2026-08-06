import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ApprovalRulesView from '../ApprovalRulesView.vue'
import { AdminApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

const mocks = vi.hoisted(() => ({
  listEvidence: vi.fn<() => Promise<unknown>>(),
  listEvidenceSamples: vi.fn<(query?: unknown) => Promise<unknown>>(),
  getAdmissionRosterStatus: vi.fn<() => Promise<unknown>>(),
  updateEvidenceSample: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  rebuildEvidence: vi.fn<() => Promise<unknown>>(),
  importAdmissionRoster: vi.fn<(file: File) => Promise<unknown>>(),
}))

vi.mock('@/api/join-requests', () => ({ joinRequestsApi: mocks }))

describe('ApprovalRulesView', () => {
  beforeEach(() => {
	vi.clearAllMocks()
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.permissions = ['join_requests:read', 'join_policies:write']
    mocks.listEvidence.mockResolvedValue({
      rule_state: {
        rule_version: 2,
        status: 'ready',
        evidence_version: 3,
        activated_at: '2026-08-07T00:00:00Z',
        rebuilt_at: '2026-08-07T00:00:00Z',
        version: 2,
      },
      rule: {
        student_id_length: 12,
        enrollment_year_offset: 2,
        enrollment_year_length: 4,
        major_code_offset: 6,
        major_code_length: 3,
        current_year: '2026',
        minimum_samples: 3,
      },
      items: [{
        enrollment_year: '2026',
        major_code: '315',
        total_samples: 4,
        major_counts: [{ major: '计算机类', count: 4 }],
      }],
    })
    mocks.getAdmissionRosterStatus.mockResolvedValue({
      configured: false,
      dataset_version: null,
      file_name: null,
      row_count: 0,
      activated_at: null,
    })
    mocks.listEvidenceSamples.mockResolvedValue({ items: [], has_more: false, total_count: 0 })
  })

  it('renders the fixed rule and filters samples by evidence key', async () => {
    const wrapper = mount(ApprovalRulesView)
    await flushPromises()

    expect(wrapper.text()).toContain('12 位数字')
    expect(wrapper.text()).toContain('2026')
    expect(wrapper.text()).toContain('计算机类 4')

    await wrapper.find('tbody tr[tabindex="0"]').trigger('click')
    await flushPromises()

    expect(mocks.listEvidenceSamples).toHaveBeenLastCalledWith(expect.objectContaining({
      enrollmentYear: '2026',
      majorCode: '315',
    }))
  })

  it('updates evidence and shows structured roster validation reports', async () => {
	const sample = {
		sample_id: 1,
		enrollment_year: '2026',
		major_code: '315',
		major: '计算机类',
		approval_source: 'manual' as const,
		source_group_id: '10001',
		active: true,
		version: 1,
		updated_at: '2026-08-07T00:00:00Z',
	}
	mocks.listEvidenceSamples.mockResolvedValue({ items: [sample], has_more: false, total_count: 1 })
	mocks.updateEvidenceSample.mockResolvedValue({ ...sample, major: '计算机科学与技术', version: 2 })
	mocks.importAdmissionRoster.mockRejectedValue(new AdminApiError(400, {
		code: 'bad_request',
		message: '录取名单文件校验失败',
		request_id: 'req-test',
		fields: { student_id: ['第 3 行：学号在文件中重复'] },
		retryable: false,
	}))

	const wrapper = mount(ApprovalRulesView)
	await flushPromises()
	const majorInput = wrapper.get('input[aria-label="样本 1 专业"]')
	await majorInput.setValue('计算机科学与技术')
	await wrapper.get('button[title="保存专业名称"]').trigger('click')
	await flushPromises()
	expect(mocks.updateEvidenceSample).toHaveBeenCalledWith(1, {
		major: '计算机科学与技术',
		active: true,
	}, 1)

	const rosterInput = wrapper.get('input[type="file"]')
	Object.defineProperty(rosterInput.element, 'files', {
		configurable: true,
		value: [new File(['学号,专业\n302026315326,计算机类\n'], 'roster.csv', { type: 'text/csv' })],
	})
	await rosterInput.trigger('change')
	await flushPromises()
	expect(wrapper.text()).toContain('第 3 行：学号在文件中重复')
  })
})
