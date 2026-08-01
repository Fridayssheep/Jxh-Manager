import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { auditApi } from '@/api/audit'
import AppSelect from '@/components/form/AppSelect.vue'
import AppOverlayTransition from '@/components/motion/AppOverlayTransition.vue'
import { useAuthStore } from '@/stores/auth'
import { makeAuditLog, makeAuditLogSummary } from '@/test/audit-fixture'
import { makeAuthContext } from '@/test/auth-fixture'
import AuditLogsView from '../AuditLogsView.vue'

async function selectValue(wrapper: VueWrapper, name: string, value: string): Promise<void> {
  const select = wrapper.findAllComponents(AppSelect).find((item) => item.props('name') === name)
  if (!select) throw new Error(`AppSelect ${name} was not rendered`)
  select.vm.$emit('update:modelValue', value)
  await wrapper.vm.$nextTick()
}

async function mountView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().acceptContext(makeAuthContext(['audit:read']))
  return mount(AuditLogsView, { global: { plugins: [pinia] }, attachTo: document.body })
}

describe('AuditLogsView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(auditApi, 'list').mockResolvedValue({
      items: [makeAuditLogSummary()], next_cursor: null, has_more: false,
    })
    vi.spyOn(auditApi, 'get').mockResolvedValue(makeAuditLog())
  })

  it('shows a redacted structured diff without mutation actions', async () => {
    const wrapper = await mountView()
    await flushPromises()
    await wrapper.get('[data-test=audit-row-audit-1]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('welcome.enabled')
    expect(wrapper.text()).toContain('[redacted]')
    expect(wrapper.findAll('button').map((button) => button.text()).join('')).not.toMatch(/恢复|撤销|重放/)
  })

  it('applies actor, target and result filters', async () => {
    const wrapper = await mountView()
    await flushPromises()
    await wrapper.get('input[name=actor_user_id]').setValue('user-2')
    await wrapper.get('input[name=target_id]').setValue('10002')
    await selectValue(wrapper, 'result', 'failed')
    await wrapper.get('[data-test=audit-filters]').trigger('submit')
    await flushPromises()

    expect(auditApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ actorUserId: 'user-2', targetId: '10002', result: 'failed', cursor: null }),
    )
  })

  it('animates the audit detail drawer', async () => {
    const wrapper = await mountView()
    await flushPromises()

    expect(wrapper.findComponent(AppOverlayTransition).props('variant')).toBe('drawer')
  })
})
