<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  AlertTriangle, BookOpen, CheckCircle2, ChevronRight, Database, FilterX,
  LoaderCircle, RefreshCw, Search, ShieldCheck, TriangleAlert,
} from '@lucide/vue'

import { AdminApiError } from '@/api/client'
import {
  knowledgeApi, type KnowledgeConflictListQuery, type KnowledgeEntryListQuery,
} from '@/api/knowledge'
import type {
  KnowledgeConflict, KnowledgeEntry, KnowledgeEntrySummary, KnowledgeEntryType,
  KnowledgeReloadOperation, KnowledgeState, KnowledgeStatus,
} from '@/api/types'
import OperationNotice from '@/components/feedback/OperationNotice.vue'
import ResourceState from '@/components/feedback/ResourceState.vue'
import AppSelect, { type AppSelectOption } from '@/components/form/AppSelect.vue'
import AppOverlayTransition from '@/components/motion/AppOverlayTransition.vue'
import AppTabBar, { type AppTabOption } from '@/components/navigation/AppTabBar.vue'
import { subscribeToAdminEvents } from '@/composables/useAdminEvents'
import { vRiseOnChange } from '@/directives/motion'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const status = ref<KnowledgeStatus | null>(null)
const statusLoading = ref(false)
const statusError = ref<unknown>(null)
const entries = ref<KnowledgeEntrySummary[]>([])
const entriesLoading = ref(false)
const entriesError = ref<unknown>(null)
const entriesCursor = ref<string | null>(null)
const entriesHasMore = ref(false)
const conflicts = ref<KnowledgeConflict[]>([])
const conflictsLoading = ref(false)
const conflictsCursor = ref<string | null>(null)
const conflictsHasMore = ref(false)
const activeTab = ref<'entries' | 'conflicts'>('entries')
const detail = ref<KnowledgeEntry | null>(null)
const detailLoading = ref(false)
const reloadOpen = ref(false)
const reloading = ref(false)
const acceptedOperation = ref<KnowledgeReloadOperation | null>(null)
const operationResult = ref<string | null>(null)
const operationTone = ref<'success' | 'warning' | 'danger' | 'unknown'>('success')

const entryFilters = reactive({
  query: '', category: '', entryType: '' as KnowledgeEntryType | '',
  enabled: '' as '' | 'true' | 'false', exactReply: '' as '' | 'true' | 'false',
  aiEnabled: '' as '' | 'true' | 'false', hasConflict: '' as '' | 'true' | 'false',
})
const conflictFilters = reactive({ query: '', conflictType: '' as '' | 'source_key' | 'keyword' | 'alias' })

const stateLabels: Record<KnowledgeState, string> = {
  ready: '索引就绪', reloading: '正在重载', degraded: '降级运行',
  unavailable: '不可用', not_configured: '未配置',
}
const typeLabels: Record<KnowledgeEntryType, string> = {
  exact_reply: '仅精确回复', ai_knowledge: '仅 AI 检索', hybrid: '精确回复 + AI 检索',
}
const operationLabels = { accepted: '已接受', running: '执行中', succeeded: '已完成', failed: '失败' }
const conflictLabels = { source_key: '来源键', keyword: '关键词', alias: '别名' }
const entryTypeOptions: readonly AppSelectOption[] = [
  { value: '', label: '全部类型' },
  ...Object.entries(typeLabels).map(([value, label]) => ({ value, label })),
]
const enabledOptions: readonly AppSelectOption[] = [
  { value: '', label: '全部启停' },
  { value: 'true', label: '已启用' },
  { value: 'false', label: '已停用' },
]
const conflictStateOptions: readonly AppSelectOption[] = [
  { value: '', label: '全部冲突' },
  { value: 'true', label: '存在冲突' },
  { value: 'false', label: '无冲突' },
]
const conflictTypeOptions: readonly AppSelectOption[] = [
  { value: '', label: '全部冲突类型' },
  ...Object.entries(conflictLabels).map(([value, label]) => ({ value, label })),
]
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})

const currentOperation = computed(() => acceptedOperation.value ?? status.value?.current_operation ?? null)
const tabOptions = computed<readonly AppTabOption[]>(() => [
  { value: 'entries', label: '词条', icon: BookOpen },
  {
    value: 'conflicts',
    label: `冲突 ${status.value?.conflict_count ?? conflicts.value.length}`,
    icon: TriangleAlert,
  },
])

function selectTab(value: string): void {
  activeTab.value = value as typeof activeTab.value
}

function setEntryType(value: string): void { entryFilters.entryType = value as KnowledgeEntryType | '' }
function setEnabled(value: string): void { entryFilters.enabled = value as '' | 'true' | 'false' }
function setHasConflict(value: string): void { entryFilters.hasConflict = value as '' | 'true' | 'false' }
function setConflictType(value: string): void {
  conflictFilters.conflictType = value as typeof conflictFilters.conflictType
}

function boolFilter(value: '' | 'true' | 'false'): boolean | null {
  return value === '' ? null : value === 'true'
}

function entryQuery(cursor: string | null): KnowledgeEntryListQuery {
  return {
    query: entryFilters.query.trim(), category: entryFilters.category.trim(), entryType: entryFilters.entryType,
    enabled: boolFilter(entryFilters.enabled), exactReply: boolFilter(entryFilters.exactReply),
    aiEnabled: boolFilter(entryFilters.aiEnabled), hasConflict: boolFilter(entryFilters.hasConflict), cursor,
  }
}

function conflictQuery(cursor: string | null): KnowledgeConflictListQuery {
  return { query: conflictFilters.query.trim(), conflictType: conflictFilters.conflictType, cursor }
}

function displayTime(value: string | null): string {
  return value ? timeFormatter.format(new Date(value)) : '尚无记录'
}

async function loadStatus(): Promise<void> {
  statusLoading.value = true
  statusError.value = null
  try {
    status.value = await knowledgeApi.getStatus()
    if (status.value.current_operation) acceptedOperation.value = status.value.current_operation
  } catch (reason) {
    statusError.value = reason
  } finally {
    statusLoading.value = false
  }
}

async function loadEntries(reset = true): Promise<void> {
  entriesLoading.value = true
  entriesError.value = null
  try {
    const page = await knowledgeApi.listEntries(entryQuery(reset ? null : entriesCursor.value))
    entries.value = reset ? page.items : [...entries.value, ...page.items]
    entriesCursor.value = page.next_cursor
    entriesHasMore.value = page.has_more
    if (reset && detail.value && !entries.value.some((entry) => entry.entry_id === detail.value?.entry_id)) detail.value = null
  } catch (reason) {
    entriesError.value = reason
  } finally {
    entriesLoading.value = false
  }
}

async function loadConflicts(reset = true): Promise<void> {
  conflictsLoading.value = true
  try {
    const page = await knowledgeApi.listConflicts(conflictQuery(reset ? null : conflictsCursor.value))
    conflicts.value = reset ? page.items : [...conflicts.value, ...page.items]
    conflictsCursor.value = page.next_cursor
    conflictsHasMore.value = page.has_more
  } catch (reason) {
    operationTone.value = 'danger'
    operationResult.value = reason instanceof AdminApiError ? reason.message : '冲突列表读取失败。'
  } finally {
    conflictsLoading.value = false
  }
}

async function openEntry(entry: KnowledgeEntrySummary): Promise<void> {
  detailLoading.value = true
  try {
    detail.value = await knowledgeApi.getEntry(entry.entry_id)
  } catch (reason) {
    operationTone.value = 'danger'
    operationResult.value = reason instanceof AdminApiError ? reason.message : '词条详情读取失败。'
  } finally {
    detailLoading.value = false
  }
}

function resetEntryFilters(): void {
  Object.assign(entryFilters, { query: '', category: '', entryType: '', enabled: '', exactReply: '', aiEnabled: '', hasConflict: '' })
  void loadEntries()
}

async function confirmReload(): Promise<void> {
  reloading.value = true
  operationResult.value = null
  try {
    acceptedOperation.value = await knowledgeApi.reload()
    operationTone.value = 'success'
    operationResult.value = `重载操作 ${acceptedOperation.value.operation_id} 已接受；旧索引在成功切换前继续有效。`
    reloadOpen.value = false
    await loadStatus()
  } catch (reason) {
    reloadOpen.value = false
    if (reason instanceof TypeError) {
      operationTone.value = 'unknown'
      operationResult.value = '重载请求结果未知。请先刷新知识库状态，不要重复触发。'
    } else {
      operationTone.value = reason instanceof AdminApiError && reason.status === 409 ? 'warning' : 'danger'
      operationResult.value = reason instanceof AdminApiError ? reason.message : '知识库重载启动失败。'
    }
  } finally {
    reloading.value = false
  }
}

const unsubscribe = subscribeToAdminEvents((event) => {
  if (event.event.startsWith('knowledge.')) {
    void loadStatus()
    if (event.event === 'knowledge.reload_completed') void Promise.all([loadEntries(), loadConflicts()])
  }
})

onMounted(() => { void Promise.all([loadStatus(), loadEntries(), loadConflicts()]) })
onBeforeUnmount(unsubscribe)
</script>

<template>
  <main class="knowledge-page">
    <header class="page-header">
      <div><h1>知识库</h1><p>查看 WPS 唯一数据源生成的只读索引、词条和解析冲突。</p></div>
      <button v-if="auth.hasPermission('knowledge:reload')" data-test="reload-knowledge" class="primary-action" type="button" :disabled="reloading" @click="reloadOpen = true"><RefreshCw :class="{ spin: reloading }" :size="17" />手动重载</button>
    </header>

    <ResourceState v-if="statusLoading && !status" state="loading" title="正在读取知识库状态" description="不会返回 WPS SID 或分享链接。" />
    <ResourceState v-else-if="statusError && !status" state="error" title="知识库状态读取失败" description="词条列表仍可独立重试。" @retry="loadStatus" />
    <section v-else-if="status" class="status-strip" aria-label="知识库状态">
      <div class="state-cell" data-test="knowledge-source"><Database :size="19" /><span>WPS 知识源<strong :class="`state--${status.state}`">{{ stateLabels[status.state] }}</strong></span></div>
      <div><span>有效词条</span><strong class="mono">{{ status.entry_count }}</strong></div>
      <div><span>解析冲突</span><strong :class="{ danger: status.conflict_count > 0 }" class="mono">{{ status.conflict_count }}</strong></div>
      <div><span>索引版本</span><strong class="mono">{{ status.active_index_version || '尚无' }}</strong></div>
      <div><span>最近成功</span><strong class="mono">{{ displayTime(status.last_success_at) }}</strong></div>
    </section>

    <section v-if="currentOperation" class="reload-operation">
      <LoaderCircle v-if="['accepted','running'].includes(currentOperation.status)" class="spin" :size="18" /><CheckCircle2 v-else-if="currentOperation.status === 'succeeded'" :size="18" /><AlertTriangle v-else :size="18" />
      <div><strong>重载操作 · {{ operationLabels[currentOperation.status] }}</strong><span class="mono">{{ currentOperation.operation_id }}</span></div>
      <dl><div><dt>接受时间</dt><dd class="mono">{{ displayTime(currentOperation.started_at) }}</dd></div><div><dt>完成时间</dt><dd class="mono">{{ displayTime(currentOperation.completed_at) }}</dd></div></dl>
    </section>

    <OperationNotice :message="operationResult ?? ''" :tone="operationTone" :revision="operationResult" @close="operationResult = null" />

    <AppTabBar :model-value="activeTab" :options="tabOptions" accessible-name="知识库视图" @update:model-value="selectTab" />

    <div v-rise-on-change="activeTab" class="tab-content">
      <template v-if="activeTab === 'entries'">
      <form class="filter-bar" @submit.prevent="loadEntries()">
        <label class="search-field"><span class="sr-only">搜索词条</span><Search :size="16" /><input v-model="entryFilters.query" placeholder="搜索标题、关键词或别名" /></label>
        <label><span class="sr-only">分类</span><input v-model="entryFilters.category" placeholder="分类" /></label>
        <label><span class="sr-only">词条类型</span><AppSelect :model-value="entryFilters.entryType" :options="entryTypeOptions" accessible-name="词条类型" data-test="knowledge-entry-type" @update:model-value="setEntryType" /></label>
        <label><span class="sr-only">启用状态</span><AppSelect :model-value="entryFilters.enabled" :options="enabledOptions" accessible-name="启用状态" data-test="knowledge-enabled" @update:model-value="setEnabled" /></label>
        <label><span class="sr-only">冲突状态</span><AppSelect :model-value="entryFilters.hasConflict" :options="conflictStateOptions" accessible-name="冲突状态" data-test="knowledge-conflict-state" @update:model-value="setHasConflict" /></label>
        <button class="filter-submit" type="submit">应用筛选</button><button class="icon-button" type="button" title="清除筛选" aria-label="清除筛选" @click="resetEntryFilters"><FilterX :size="16" /></button>
      </form>

      <section class="entry-workspace">
        <div class="entry-list-pane">
          <ResourceState v-if="entriesLoading && !entries.length" state="loading" title="正在读取词条" description="读取 WPS 索引快照中的只读摘要。" />
          <ResourceState v-else-if="entriesError" state="error" title="词条读取失败" description="筛选条件已保留。" @retry="loadEntries()" />
          <ResourceState v-else-if="!entries.length" state="empty" title="没有符合条件的词条" description="调整筛选条件后重试。" />
          <article v-for="entry in entries" :key="entry.entry_id" :data-test="`knowledge-entry-${entry.entry_id}`" :class="{ active: detail?.entry_id === entry.entry_id }" tabindex="0" @click="openEntry(entry)" @keydown.enter="openEntry(entry)">
            <div><strong>{{ entry.title }}</strong><span>{{ entry.category }} · {{ typeLabels[entry.entry_type] }}</span></div><span v-if="entry.has_conflict" class="conflict-badge">冲突</span><ChevronRight :size="16" />
            <p>{{ [...entry.keywords, ...entry.aliases].join(' · ') || '无关键词' }}</p>
          </article>
          <button v-if="entriesHasMore" class="load-more" type="button" :disabled="entriesLoading" @click="loadEntries(false)">加载更多词条</button>
        </div>

        <aside class="entry-detail" aria-label="词条详情">
          <ResourceState v-if="detailLoading" state="loading" title="正在读取词条详情" description="仅从管理 API 获取只读内容。" />
          <div v-else-if="!detail" class="detail-empty"><BookOpen :size="24" /><strong>选择词条查看只读详情</strong><span>来源键、问题、答案和索引状态会显示在这里。</span></div>
          <template v-else>
            <header><div><span class="eyebrow">{{ detail.category }}</span><h2>{{ detail.title }}</h2></div><span :class="['enabled-badge', { disabled: !detail.enabled }]">{{ detail.enabled ? '已启用' : '已停用' }}</span></header>
            <dl class="source-meta"><div><dt>来源键</dt><dd class="mono">{{ detail.source_key }}</dd></div><div><dt>词条 ID</dt><dd class="mono">{{ detail.entry_id }}</dd></div><div><dt>索引时间</dt><dd class="mono">{{ displayTime(detail.indexed_at) }}</dd></div><div><dt>来源更新时间</dt><dd class="mono">{{ displayTime(detail.source_updated_at) }}</dd></div></dl>
            <section><h3>问题</h3><p>{{ detail.question }}</p></section><section><h3>答案</h3><p class="answer-text">{{ detail.answer }}</p></section>
            <section><h3>关键词与别名</h3><div class="tag-list"><span v-for="keyword in detail.keywords" :key="`k-${keyword}`">{{ keyword }}</span><span v-for="alias in detail.aliases" :key="`a-${alias}`" class="alias">{{ alias }}</span></div></section>
            <footer><ShieldCheck :size="16" /><span>只读来源：所有修改必须在 WPS 中完成，再通过重载生成新索引。</span></footer>
          </template>
        </aside>
      </section>
      </template>

      <template v-else>
      <form class="conflict-filter" @submit.prevent="loadConflicts()"><label class="search-field"><Search :size="16" /><input v-model="conflictFilters.query" placeholder="搜索冲突键或词条 ID" /></label><AppSelect :model-value="conflictFilters.conflictType" :options="conflictTypeOptions" accessible-name="冲突类型" data-test="knowledge-conflict-type" @update:model-value="setConflictType" /><button class="filter-submit" type="submit">应用筛选</button></form>
      <ResourceState v-if="conflictsLoading && !conflicts.length" state="loading" title="正在读取解析冲突" description="冲突不会自动覆盖任一词条。" />
      <ResourceState v-else-if="!conflicts.length" state="empty" title="当前没有解析冲突" description="关键词、别名和来源键均保持唯一。" />
      <section v-else class="conflict-list"><article v-for="conflict in conflicts" :key="conflict.conflict_id"><TriangleAlert :size="18" /><div><strong>{{ conflictLabels[conflict.type] }}冲突 · {{ conflict.key }}</strong><span class="mono">{{ conflict.conflict_id }}</span></div><div class="entry-ids"><span v-for="id in conflict.entry_ids" :key="id" class="mono">{{ id }}</span></div><time class="mono">{{ displayTime(conflict.detected_at) }}</time></article></section>
      <button v-if="conflictsHasMore" class="load-more" type="button" :disabled="conflictsLoading" @click="loadConflicts(false)">加载更多冲突</button>
      </template>
    </div>

    <AppOverlayTransition :show="reloadOpen" variant="dialog">
      <div class="dialog-layer" role="presentation" @mousedown.self="reloadOpen = false"><section class="reload-dialog" role="dialog" aria-modal="true"><header><RefreshCw :size="19" /><div><h2>重载知识库索引</h2><p>从已配置的 WPS 数据源重新下载并构建索引。</p></div></header><div class="reload-notice"><ShieldCheck :size="17" /><span>下载为空、解析失败或没有有效词条时，当前有效索引不会被替换。</span></div><footer><button type="button" :disabled="reloading" @click="reloadOpen = false">取消</button><button data-test="confirm-reload" class="primary-action" type="button" :disabled="reloading" @click="confirmReload">确认重载</button></footer></section></div>
    </AppOverlayTransition>
  </main>
</template>

<style scoped>
.tab-content{display:grid;gap:14px}
.knowledge-page{display:grid;gap:14px}.page-header,.primary-action,.status-strip,.state-cell,.reload-operation,.operation-result,.view-tabs,.view-tabs button,.search-field,.entry-list-pane article,.entry-detail>header,.entry-detail footer,.dialog-layer,.reload-dialog header,.reload-notice,.reload-dialog footer{display:flex;align-items:center}.page-header{justify-content:space-between;gap:16px}.page-header h1{font-size:24px;line-height:34px}.page-header p{color:var(--color-text-secondary);font-size:13px}.primary-action{min-height:38px;gap:7px;padding:0 12px;color:white;font-weight:600;background:var(--color-brand-action);border:1px solid var(--color-brand-action);border-radius:var(--radius-control)}.status-strip{display:grid;grid-template-columns:minmax(180px,1.2fr) repeat(4,minmax(130px,1fr));background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-panel)}.status-strip>div{display:grid;min-height:68px;align-content:center;gap:3px;padding:10px 14px;border-right:1px solid var(--color-border)}.status-strip>div:last-child{border-right:0}.status-strip span{color:var(--color-text-secondary);font-size:10px}.status-strip strong{overflow:hidden;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.status-strip .state-cell{display:flex;gap:9px;color:var(--color-brand-ink)}.state-cell span{display:grid}.state--ready{color:var(--color-success)}.state--reloading{color:var(--color-brand-action)}.state--degraded{color:var(--color-warning)}.state--unavailable,.danger{color:var(--color-danger)}.reload-operation{display:grid;grid-template-columns:18px minmax(190px,1fr) auto;gap:9px;padding:10px 12px;color:var(--color-brand-ink);background:var(--color-brand-surface);border-left:3px solid var(--color-brand-500)}.reload-operation>div{display:grid}.reload-operation span{color:var(--color-text-secondary);font-size:10px}.reload-operation dl{display:flex;gap:20px;margin:0}.reload-operation dl div{display:grid}.reload-operation dt{color:var(--color-text-secondary);font-size:10px}.reload-operation dd{margin:0;font-size:11px}.operation-result{min-height:42px;gap:8px;padding:8px 11px;font-size:12px;border-left:3px solid currentcolor}.operation-result>span{min-width:0;flex:1}.operation-result button{display:grid;width:28px;height:28px;place-items:center;padding:0;background:transparent;border:0}.operation-result--success{color:var(--color-success);background:var(--color-success-surface)}.operation-result--warning{color:var(--color-warning);background:var(--color-warning-surface)}.operation-result--danger{color:var(--color-danger);background:var(--color-danger-surface)}.operation-result--unknown{color:var(--color-unknown);background:var(--color-unknown-surface)}.view-tabs{gap:4px;border-bottom:1px solid var(--color-border)}.view-tabs button{min-height:38px;gap:6px;padding:0 10px;color:var(--color-text-secondary);background:transparent;border:0;border-bottom:2px solid transparent}.view-tabs button.active{color:var(--color-brand-action);font-weight:600;border-color:var(--color-brand-action)}.view-tabs button span{padding:1px 5px;font-size:10px;background:var(--color-surface-subtle);border-radius:8px}.filter-bar{display:grid;grid-template-columns:minmax(220px,1.4fr) 120px repeat(3,minmax(110px,.7fr)) auto 38px;gap:7px}.filter-bar input,.filter-bar select,.conflict-filter input,.conflict-filter select{width:100%;height:38px;padding:0 9px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.search-field{display:grid;grid-template-columns:16px minmax(0,1fr);gap:7px;padding:0 10px;color:var(--color-text-secondary);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.search-field input{min-width:0;padding:0;background:transparent;border:0;outline:0}.filter-submit,.icon-button,.load-more{height:38px;justify-content:center;padding:0 11px;color:var(--color-brand-action);font-weight:600;background:var(--color-surface);border:1px solid var(--color-brand-border);border-radius:var(--radius-control)}.icon-button{width:38px;padding:0;color:var(--color-text-secondary);border-color:var(--color-border)}.entry-workspace{display:grid;min-width:0;grid-template-columns:minmax(360px,.85fr) minmax(500px,1.15fr);gap:12px;align-items:start}.entry-list-pane,.entry-detail{min-width:0;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-panel)}.entry-list-pane article{display:grid;min-height:78px;grid-template-columns:minmax(0,1fr) auto 16px;gap:7px 9px;padding:11px 12px;cursor:pointer;border-bottom:1px solid var(--color-border)}.entry-list-pane article:hover{background:var(--color-surface-raised)}.entry-list-pane article.active{background:var(--color-brand-surface);box-shadow:inset 3px 0 var(--color-brand-500)}.entry-list-pane article>div{display:grid;min-width:0}.entry-list-pane article strong{overflow:hidden;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.entry-list-pane article div span,.entry-list-pane article p{color:var(--color-text-secondary);font-size:10px}.entry-list-pane article p{grid-column:1/-1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.conflict-badge{padding:2px 6px;color:var(--color-danger);font-size:10px;background:var(--color-danger-surface);border-radius:8px}.entry-list-pane .load-more{display:block;width:calc(100% - 24px);margin:12px}.detail-empty{display:grid;min-height:430px;place-items:center;align-content:center;gap:7px;padding:28px;color:var(--color-text-secondary);text-align:center}.detail-empty strong{color:var(--color-text-primary)}.detail-empty span{max-width:340px;font-size:12px}.entry-detail>header{justify-content:space-between;gap:10px;padding:16px 18px;border-bottom:1px solid var(--color-border)}.eyebrow{color:var(--color-brand-ink);font-size:10px;font-weight:600}.entry-detail h2{font-size:18px}.enabled-badge{padding:2px 6px;color:var(--color-success);font-size:10px;background:var(--color-success-surface);border-radius:8px}.enabled-badge.disabled{color:var(--color-warning);background:var(--color-warning-surface)}.source-meta{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:0;padding:14px 18px;background:var(--color-surface-subtle);border-bottom:1px solid var(--color-border)}.source-meta div{display:grid}.source-meta dt{color:var(--color-text-secondary);font-size:10px}.source-meta dd{overflow-wrap:anywhere;margin:0;font-size:11px}.entry-detail>section{display:grid;gap:7px;padding:14px 18px;border-bottom:1px solid var(--color-border)}.entry-detail h3{font-size:12px}.entry-detail section p{font-size:13px;white-space:pre-wrap}.answer-text{line-height:1.7}.tag-list{display:flex;flex-wrap:wrap;gap:5px}.tag-list span{padding:3px 7px;color:var(--color-brand-ink);font-size:10px;background:var(--color-brand-surface);border-radius:8px}.tag-list span.alias{color:var(--color-info);background:var(--color-info-surface)}.entry-detail footer{gap:7px;padding:10px 18px;color:var(--color-text-secondary);font-size:11px;background:var(--color-surface-subtle)}.conflict-filter{display:grid;grid-template-columns:minmax(220px,1fr) 160px auto;gap:8px}.conflict-list{display:grid;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-panel)}.conflict-list article{display:grid;grid-template-columns:18px minmax(180px,1fr) minmax(240px,1fr) auto;gap:10px;align-items:center;min-height:64px;padding:10px 13px;color:var(--color-danger);border-bottom:1px solid var(--color-border)}.conflict-list article:last-child{border-bottom:0}.conflict-list article>div{display:grid}.conflict-list article strong{color:var(--color-text-primary);font-size:12px}.conflict-list article div>span,.conflict-list time{color:var(--color-text-secondary);font-size:10px}.entry-ids{display:flex!important;flex-wrap:wrap;gap:5px}.entry-ids span{padding:2px 5px;background:var(--color-surface-subtle);border-radius:6px}.dialog-layer{position:fixed;z-index:80;inset:0;justify-content:center;padding:20px;background:rgb(34 37 36/36%)}.reload-dialog{width:min(470px,100%);padding:18px;background:var(--color-surface);border-radius:var(--radius-overlay);box-shadow:0 16px 44px rgb(34 37 36/18%)}.reload-dialog header{gap:10px;color:var(--color-brand-action)}.reload-dialog header h2{color:var(--color-text-primary);font-size:16px}.reload-dialog header p{color:var(--color-text-secondary);font-size:12px}.reload-notice{gap:8px;margin-top:16px;padding:9px 10px;color:var(--color-success);font-size:12px;background:var(--color-success-surface);border-left:3px solid var(--color-success)}.reload-dialog footer{justify-content:flex-end;gap:8px;margin-top:18px}.reload-dialog footer button{min-height:36px;padding:0 11px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.reload-dialog footer .primary-action{color:white;background:var(--color-brand-action);border-color:var(--color-brand-action)}.spin{animation:spin 700ms linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:1050px){.status-strip{grid-template-columns:repeat(3,1fr)}.status-strip>div:nth-child(3){border-right:0}.status-strip>div:nth-child(n+4){border-top:1px solid var(--color-border)}.filter-bar{grid-template-columns:minmax(220px,1.4fr) repeat(2,minmax(110px,.7fr)) auto 38px}.filter-bar label:nth-of-type(4),.filter-bar label:nth-of-type(5){display:none}.entry-workspace{grid-template-columns:minmax(320px,.8fr) minmax(420px,1.2fr)}}
@media(max-width:720px){.page-header{align-items:stretch;flex-direction:column}.primary-action{justify-content:center}.status-strip{grid-template-columns:1fr 1fr}.status-strip>div{border-top:1px solid var(--color-border);border-right:1px solid var(--color-border)}.status-strip>div:nth-child(even){border-right:0}.status-strip>div:first-child{grid-column:1/-1;border-top:0;border-right:0}.reload-operation{grid-template-columns:18px 1fr}.reload-operation dl{grid-column:1/-1}.filter-bar{grid-template-columns:1fr 1fr}.search-field{grid-column:1/-1}.filter-bar label:nth-of-type(2){display:none}.icon-button{justify-self:end}.entry-workspace{grid-template-columns:1fr}.entry-detail{order:-1}.detail-empty{min-height:220px}.source-meta{grid-template-columns:1fr}.conflict-filter{grid-template-columns:1fr}.conflict-list article{grid-template-columns:18px 1fr}.entry-ids,.conflict-list time{grid-column:2}.dialog-layer{align-items:center}.reload-dialog{align-self:center}}
</style>
