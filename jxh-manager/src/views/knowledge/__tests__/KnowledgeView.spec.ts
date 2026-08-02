import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { knowledgeApi } from '@/api/knowledge'
import OperationNotice from '@/components/feedback/OperationNotice.vue'
import AppSelect from '@/components/form/AppSelect.vue'
import AppOverlayTransition from '@/components/motion/AppOverlayTransition.vue'
import AppTabBar from '@/components/navigation/AppTabBar.vue'
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
    vi.spyOn(knowledgeApi, 'listEntries').mockResolvedValue({ items: [makeKnowledgeEntrySummary()], next_cursor: null, has_more: false, total_count: 1 })
    vi.spyOn(knowledgeApi, 'listConflicts').mockResolvedValue({ items: [makeKnowledgeConflict()], next_cursor: null, has_more: false, total_count: 1 })
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
    const entryType = wrapper.findAllComponents(AppSelect)
      .find((select) => select.props('dataTest') === 'knowledge-entry-type')
    expect(entryType?.props('options')).toContainEqual({ value: 'ai_knowledge', label: '仅 AI 检索' })
    expect(wrapper.find('select').exists()).toBe(false)
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

  it('animates the reload confirmation', async () => {
    const wrapper = await mountView()
    await flushPromises()

    expect(wrapper.findComponent(AppOverlayTransition).props('variant')).toBe('dialog')
  })

  it('uses shared sliding tabs, content motion and operation feedback', async () => {
    const wrapper = await mountView()
    await flushPromises()
    const content = wrapper.get('.tab-content').element as HTMLElement
    const animation = {
      cancel: vi.fn<() => void>(),
      onfinish: null,
      oncancel: null,
    } as unknown as Animation
    const animate = vi.fn<() => Animation>(() => animation)
    Object.defineProperty(content, 'animate', { configurable: true, value: animate })

    expect(wrapper.findComponent(AppTabBar).props('modelValue')).toBe('entries')
    expect(wrapper.findComponent(OperationNotice).exists()).toBe(true)

    wrapper.findComponent(AppTabBar).vm.$emit('update:modelValue', 'conflicts')
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent(AppTabBar).props('modelValue')).toBe('conflicts')
    expect(animate).toHaveBeenCalled()
  })

  it('jumps directly between entry pages instead of appending rows', async () => {
    const second = makeKnowledgeEntrySummary({ entry_id: 'entry-2', title: '第二页词条' })
    vi.mocked(knowledgeApi.listEntries).mockImplementation(async (query) =>
      query.page === 2
        ? { items: [second], next_cursor: null, has_more: false, total_count: 11 }
        : { items: [makeKnowledgeEntrySummary()], next_cursor: 'entry-cursor-2', has_more: true, total_count: 11 },
    )
    const wrapper = await mountView()
    await flushPromises()

    expect(knowledgeApi.listEntries).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, cursor: null, limit: 10 }),
    )
    await wrapper.get('[data-test=page-2]').trigger('click')
    await flushPromises()

    // The previous page is replaced, not accumulated.
    expect(wrapper.find('[data-test=knowledge-entry-entry-2]').exists()).toBe(true)
    expect(wrapper.find('[data-test=knowledge-entry-entry-1]').exists()).toBe(false)

    await wrapper.get('[data-test=page-1]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test=knowledge-entry-entry-1]').exists()).toBe(true)
    expect(wrapper.find('[data-test=knowledge-entry-entry-2]').exists()).toBe(false)
  })

  it('reloads entries from the first page with the selected page size', async () => {
    const wrapper = await mountView()
    await flushPromises()

    const pageSize = wrapper
      .findAllComponents(AppSelect)
      .find((select) => select.props('dataTest') === 'knowledge-entry-page-size')
    if (!pageSize) throw new Error('entry page size select was not rendered')
    pageSize.vm.$emit('update:modelValue', '20')
    await flushPromises()

    expect(knowledgeApi.listEntries).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, cursor: null, limit: 20 }),
    )
  })

  it('pages conflicts with their own page size', async () => {
    const wrapper = await mountView()
    await flushPromises()
    wrapper.findComponent(AppTabBar).vm.$emit('update:modelValue', 'conflicts')
    await flushPromises()

    const pageSize = wrapper
      .findAllComponents(AppSelect)
      .find((select) => select.props('dataTest') === 'knowledge-conflict-page-size')
    if (!pageSize) throw new Error('conflict page size select was not rendered')
    pageSize.vm.$emit('update:modelValue', '5')
    await flushPromises()

    expect(knowledgeApi.listConflicts).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, cursor: null, limit: 5 }),
    )
    // The entry list keeps its own page size.
    expect(knowledgeApi.listEntries).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 10 }),
    )
  })

  it('refreshes on demand and never subscribes to the event stream', async () => {
    const wrapper = await mountView()
    await flushPromises()
    expect(knowledgeApi.getStatus).toHaveBeenCalledTimes(1)

    await wrapper.get('[data-test=refresh-knowledge]').trigger('click')
    await flushPromises()

    expect(knowledgeApi.getStatus).toHaveBeenCalledTimes(2)
    expect(knowledgeApi.listEntries).toHaveBeenCalledTimes(2)
    expect(knowledgeApi.listConflicts).toHaveBeenCalledTimes(2)
  })

  it('scrolls overflowing rows inside each list card', async () => {
    const wrapper = await mountView()
    await flushPromises()

    expect(wrapper.find('[data-test=knowledge-entry-scroll]').exists()).toBe(true)
    wrapper.findComponent(AppTabBar).vm.$emit('update:modelValue', 'conflicts')
    await flushPromises()
    expect(wrapper.find('[data-test=knowledge-conflict-scroll]').exists()).toBe(true)
  })
})
