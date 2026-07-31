import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { systemApi } from '@/api/system'
import type { Permission, SystemConfiguration } from '@/api/types'
import OperationNotice from '@/components/feedback/OperationNotice.vue'
import AppOverlayTransition from '@/components/motion/AppOverlayTransition.vue'
import { useAuthStore } from '@/stores/auth'
import { useRuntimeStore } from '@/stores/runtime'
import { makeAuthContext } from '@/test/auth-fixture'
import { makeSystemHealth, makeSystemOperation } from '@/test/system-fixture'
import SystemView from '../SystemView.vue'

const configuration: SystemConfiguration = {
  wps: {
    share_url: { configured: true, source: 'file' },
    sid: { configured: true, source: 'environment' },
    sheet: '知识库',
    timeout_sec: 45,
  },
  ai: {
    provider: 'openai',
    base_url: 'https://api.openai.test/v1',
    api_key: { configured: true, source: 'file' },
    model: 'gpt-4.1-mini',
    timeout_sec: 30,
    max_question_chars: 1200,
  },
  quote: {
    base_url: 'https://quote.example.test',
    timeout_sec: 20,
  },
  time: {
    app_timezone: 'Asia/Shanghai',
    scheduler_timezone: 'Asia/Shanghai',
  },
  retention: {
    trigger_log_retention_days: 180,
  },
  environment_overrides: [],
  version: 7,
  applied_version: 6,
  restart_required: true,
  restart_supported: true,
}

async function mountView(permissions: Permission[] = ['system:read', 'napcat:restart']) {
  const pinia = createPinia(); setActivePinia(pinia)
  useAuthStore().acceptContext(makeAuthContext(permissions))
  useRuntimeStore().liveStatus = 'connected'
  return mount(SystemView, { global: { plugins: [pinia] }, attachTo: document.body })
}

describe('SystemView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(systemApi, 'getHealth').mockResolvedValue(makeSystemHealth())
    vi.spyOn(systemApi, 'getConfiguration').mockResolvedValue(configuration)
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

  it('shows Bot configuration read-only unless config:write is granted', async () => {
    const readOnly = await mountView()
    await flushPromises()
    expect(readOnly.find('[data-test=system-configuration]').exists()).toBe(true)
    expect(readOnly.get('[data-test=config-ai-base-url]').attributes('disabled')).toBeDefined()
    expect(readOnly.find('[data-test=save-configuration]').exists()).toBe(false)
    readOnly.unmount()

    const writable = await mountView(['system:read', 'config:write'])
    await flushPromises()
    expect(writable.get('[data-test=save-configuration]').attributes('type')).toBe('button')
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

  it('animates the NapCat restart confirmation', async () => {
    const wrapper = await mountView()
    await flushPromises()

    expect(wrapper.findComponent(AppOverlayTransition).props('variant')).toBe('dialog')
    expect(wrapper.findComponent(OperationNotice).exists()).toBe(true)
  })
})
