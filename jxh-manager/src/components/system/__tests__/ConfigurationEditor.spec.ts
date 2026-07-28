import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AdminApiError } from '@/api/client'
import type { components } from '@/api/schema'
import { systemApi } from '@/api/system'
import ConfigurationEditor from '../ConfigurationEditor.vue'

type SystemConfiguration = components['schemas']['SystemConfiguration']

const configuration: SystemConfiguration = {
  yaml: 'ai:\n  api_key: __JXH_SECRET_UNCHANGED__\n  model: gpt-test\n',
  version: 7,
  masked_fields: ['ai.api_key', 'wps.share_url'],
  environment_overrides: ['ai.model'],
  restart_required: true,
}

function mountEditor(canWrite = true) {
  return mount(ConfigurationEditor, { props: { canWrite } })
}

describe('ConfigurationEditor', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(systemApi, 'getConfiguration').mockResolvedValue({ ...configuration })
  })

  it('loads masked YAML and reports masked and environment-overridden fields', async () => {
    const wrapper = mountEditor()
    await flushPromises()

    expect((wrapper.get('[data-test=config-yaml]').element as HTMLTextAreaElement).value).toBe(configuration.yaml)
    expect(wrapper.text()).toContain('__JXH_SECRET_UNCHANGED__')
    expect(wrapper.text()).toContain('ai.api_key')
    expect(wrapper.text()).toContain('wps.share_url')
    expect(wrapper.text()).toContain('ai.model')
    expect(wrapper.text()).toContain('重启后生效')
    expect(wrapper.text()).not.toContain('real-secret')
  })

  it('is read-only without config:write', async () => {
    const wrapper = mountEditor(false)
    await flushPromises()

    expect(wrapper.get('[data-test=config-yaml]').attributes('readonly')).toBeDefined()
    expect(wrapper.find('[data-test=save-configuration]').exists()).toBe(false)
  })

  it('saves the current draft with the loaded version', async () => {
    const update = vi.spyOn(systemApi, 'updateConfiguration').mockResolvedValue({
      ...configuration,
      yaml: 'ai:\n  enabled: false\n',
      version: 8,
    })
    const wrapper = mountEditor()
    await flushPromises()

    await wrapper.get('[data-test=config-yaml]').setValue('ai:\n  enabled: false\n')
    await wrapper.get('[data-test=save-configuration]').trigger('click')
    await flushPromises()

    expect(update).toHaveBeenCalledWith('ai:\n  enabled: false\n', 7)
    expect(wrapper.text()).toContain('配置文件已保存')
    expect(wrapper.text()).toContain('版本 8')
  })

  it('preserves the local draft after a conflict and can load the server version', async () => {
    vi.spyOn(systemApi, 'getConfiguration')
      .mockResolvedValueOnce({ ...configuration })
      .mockResolvedValueOnce({ ...configuration, yaml: 'ai:\n  model: server-version\n', version: 8 })
    vi.spyOn(systemApi, 'updateConfiguration').mockRejectedValue(new AdminApiError(409, {
      code: 'resource_version_conflict',
      message: '配置文件已更新。',
      request_id: 'request-1',
      fields: {},
      retryable: false,
    }))
    const wrapper = mountEditor()
    await flushPromises()

    await wrapper.get('[data-test=config-yaml]').setValue('ai:\n  model: local-draft\n')
    await wrapper.get('[data-test=save-configuration]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('本地草稿已保留')
    expect((wrapper.get('[data-test=config-yaml]').element as HTMLTextAreaElement).value).toContain('local-draft')
    await wrapper.get('[data-test=reload-configuration]').trigger('click')
    await flushPromises()
    expect((wrapper.get('[data-test=config-yaml]').element as HTMLTextAreaElement).value).toContain('server-version')
  })

  it('does not report success when the save connection is interrupted', async () => {
    vi.spyOn(systemApi, 'updateConfiguration').mockRejectedValue(new TypeError('network interrupted'))
    const wrapper = mountEditor()
    await flushPromises()

    await wrapper.get('[data-test=config-yaml]').setValue('ai:\n  enabled: false\n')
    await wrapper.get('[data-test=save-configuration]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('保存结果未知')
    expect(wrapper.text()).not.toContain('配置文件已保存')
  })
})
