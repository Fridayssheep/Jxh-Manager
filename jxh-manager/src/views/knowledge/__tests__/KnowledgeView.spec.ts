import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { knowledgeApi } from '@/api/knowledge'
import { useAuthStore } from '@/stores/auth'
import { makeAuthContext } from '@/test/auth-fixture'
import { makeKnowledgeConflict, makeKnowledgeEntry, makeKnowledgeEntrySummary, makeKnowledgeStatus } from '@/test/knowledge-fixture'
import KnowledgeView from '../KnowledgeView.vue'

async function mountView() {
  const pinia = createPinia(); setActivePinia(pinia)
  useAuthStore().acceptContext(makeAuthContext(['knowledge:read', 'knowledge:reload']))
  return mount(KnowledgeView, { global: { plugins: [pinia] }, attachTo: document.body })
}

describe('KnowledgeView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(knowledgeApi, 'getStatus').mockResolvedValue(makeKnowledgeStatus())
    vi.spyOn(knowledgeApi, 'listEntries').mockResolvedValue({ items: [makeKnowledgeEntrySummary()], next_cursor: null, has_more: false })
    vi.spyOn(knowledgeApi, 'listConflicts').mockResolvedValue({ items: [makeKnowledgeConflict()], next_cursor: null, has_more: false })
    vi.spyOn(knowledgeApi, 'getEntry').mockResolvedValue(makeKnowledgeEntry())
  })

  it('keeps WPS entries read-only while exposing source details', async () => {
    const wrapper = await mountView(); await flushPromises()
    await wrapper.get('[data-test=knowledge-entry-entry-1]').trigger('click'); await flushPromises()

    expect(wrapper.text()).toContain('校园网无法使用怎么办？')
    expect(wrapper.text()).toContain('wps-row-42')
    expect(wrapper.findAll('button').map((button) => button.text()).join('')).not.toMatch(/保存词条|编辑词条/)
  })

  it('presents WPS as the only knowledge source', async () => {
    const wrapper = await mountView(); await flushPromises()

    const sources = wrapper.findAll('[data-test=knowledge-source]')
    expect(sources).toHaveLength(1)
    expect(sources[0]?.text()).toContain('WPS 知识源')
    expect(wrapper.text()).not.toMatch(/本地知识库|AI 知识库|手动知识库/)
    expect(wrapper.get('select').text()).toContain('仅 AI 检索')
  })

  it('renders the last successful reload in the browser local timezone', async () => {
    const lastSuccessAt = '2026-07-28T11:51:00Z'
    vi.mocked(knowledgeApi.getStatus).mockResolvedValue(makeKnowledgeStatus({ last_success_at: lastSuccessAt }))
    const expected = new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(new Date(lastSuccessAt))

    const wrapper = await mountView(); await flushPromises()

    expect(wrapper.get('[aria-label="知识库状态"]').text()).toContain(expected)
  })

  it('shows the accepted reload operation for later status refresh', async () => {
    const reload = vi.spyOn(knowledgeApi, 'reload').mockResolvedValue({
      operation_id: 'reload-1', status: 'accepted', started_at: '2026-07-28T06:00:00Z', completed_at: null, error_code: null,
    })
    const wrapper = await mountView(); await flushPromises()

    await wrapper.get('[data-test=reload-knowledge]').trigger('click')
    await wrapper.get('[data-test=confirm-reload]').trigger('click'); await flushPromises()

    expect(reload).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('reload-1')
    expect(wrapper.text()).toContain('已接受')
  })
})
