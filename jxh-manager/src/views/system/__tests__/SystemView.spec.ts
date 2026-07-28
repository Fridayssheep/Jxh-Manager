import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { systemApi } from '@/api/system'
import { useAuthStore } from '@/stores/auth'
import { useRuntimeStore } from '@/stores/runtime'
import { makeAuthContext } from '@/test/auth-fixture'
import { makeSystemHealth, makeSystemOperation } from '@/test/system-fixture'
import SystemView from '../SystemView.vue'

async function mountView() {
  const pinia = createPinia(); setActivePinia(pinia)
  useAuthStore().acceptContext(makeAuthContext(['system:read', 'napcat:restart']))
  useRuntimeStore().liveStatus = 'connected'
  return mount(SystemView, { global: { plugins: [pinia] }, attachTo: document.body })
}

describe('SystemView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(systemApi, 'getHealth').mockResolvedValue(makeSystemHealth())
  })

  it('shows dependencies and SSE in the fixed operational order', async () => {
    const wrapper = await mountView(); await flushPromises()
    const text = wrapper.text()

    const positions = ['NapCat', 'MySQL', 'WPS', 'AI 服务', '引用图', 'SSE 实时事件']
      .map((label) => text.indexOf(label))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((left, right) => left - right))
    expect(text).toContain('实时连接正常')
    expect(text).toContain('未配置')
  })

  it('only enables restart for the exact lowercase ASCII confirmation', async () => {
    const restart = vi.spyOn(systemApi, 'restartNapCat').mockResolvedValue(makeSystemOperation())
    const wrapper = await mountView(); await flushPromises()

    await wrapper.get('[data-test=restart-napcat]').trigger('click')
    const confirm = wrapper.get('[data-test=confirm-restart]')
    await wrapper.get('[data-test=restart-confirmation]').setValue('RESTART')
    expect(confirm.attributes('disabled')).toBeDefined()
    await wrapper.get('[data-test=restart-confirmation]').setValue('restart')
    await wrapper.get('[data-test=restart-reason]').setValue('维护窗口')
    expect(confirm.attributes('disabled')).toBeUndefined()
    await confirm.trigger('click'); await flushPromises()

    expect(restart).toHaveBeenCalledWith('维护窗口')
    expect(wrapper.text()).toContain('operation-1')
    expect(wrapper.text()).toContain('重启请求已受理')
  })

  it('reports an unknown outcome when the restart connection is interrupted', async () => {
    vi.spyOn(systemApi, 'restartNapCat').mockRejectedValue(new TypeError('network interrupted'))
    const wrapper = await mountView(); await flushPromises()

    await wrapper.get('[data-test=restart-napcat]').trigger('click')
    await wrapper.get('[data-test=restart-confirmation]').setValue('restart')
    await wrapper.get('[data-test=confirm-restart]').trigger('click'); await flushPromises()

    expect(wrapper.text()).toContain('重启结果未知')
    expect(wrapper.text()).toContain('不要重复提交')
  })
})
