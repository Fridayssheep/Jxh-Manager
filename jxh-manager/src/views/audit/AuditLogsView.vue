<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  FilterX,
  LockKeyhole,
  Search,
  ShieldCheck,
  X,
} from '@lucide/vue'

import { auditApi, type AuditLogListQuery } from '@/api/audit'
import type { AuditLog, AuditLogSummary, RedactedAuditValue } from '@/api/types'
import ResourceState from '@/components/feedback/ResourceState.vue'
import AppSelect, { type AppSelectOption } from '@/components/form/AppSelect.vue'
import AppOverlayTransition from '@/components/motion/AppOverlayTransition.vue'

type FlatAuditValue = Record<string, string>
type AuditDiffRow = { path: string; before: string; after: string; changed: boolean }

const logs = ref<AuditLogSummary[]>([])
const detail = ref<AuditLog | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const detailLoading = ref(false)
const error = ref<unknown>(null)
const nextCursor = ref<string | null>(null)
const hasMore = ref(false)
const filter = reactive({
  actorUserId: '', actorType: '' as AuditLogListQuery['actorType'], action: '',
  targetType: '', targetId: '', result: '' as AuditLogListQuery['result'], from: '', to: '',
})

const resultLabels = { success: '成功', failed: '失败', unknown: '未知' }
const actorTypeLabels = { admin_user: '管理账号', qq_user: 'QQ 用户', system: '系统' }
const actorTypeOptions: readonly AppSelectOption[] = [
  { value: '', label: '全部操作者' },
  ...Object.entries(actorTypeLabels).map(([value, label]) => ({ value, label })),
]
const resultOptions: readonly AppSelectOption[] = [
  { value: '', label: '全部结果' },
  ...Object.entries(resultLabels).map(([value, label]) => ({ value, label })),
]
const sourceLabels = { web: '管理端', qq: 'QQ', system: '系统' }
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
})

function listQuery(cursor: string | null): AuditLogListQuery {
  return {
    ...filter,
    from: filter.from ? `${filter.from}T00:00:00Z` : '',
    to: filter.to ? `${filter.to}T23:59:59Z` : '',
    cursor,
    limit: 30,
  }
}

function setActorType(value: string): void {
  filter.actorType = value as AuditLogListQuery['actorType']
}

function setResult(value: string): void {
  filter.result = value as AuditLogListQuery['result']
}

async function load(reset = true): Promise<void> {
  if (reset) loading.value = true
  else loadingMore.value = true
  error.value = null
  try {
    const page = await auditApi.list(listQuery(reset ? null : nextCursor.value))
    logs.value = reset ? page.items : [...logs.value, ...page.items]
    nextCursor.value = page.next_cursor
    hasMore.value = page.has_more
  } catch (reason) {
    error.value = reason
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

async function openDetail(log: AuditLogSummary): Promise<void> {
  detailLoading.value = true
  try {
    detail.value = await auditApi.get(log.audit_log_id)
  } finally {
    detailLoading.value = false
  }
}

function resetFilters(): void {
  Object.assign(filter, { actorUserId: '', actorType: '', action: '', targetType: '', targetId: '', result: '', from: '', to: '' })
  void load()
}

function flattenAuditValue(value: unknown, path = '', output: FlatAuditValue = {}): FlatAuditValue {
  if (value === null || typeof value !== 'object') {
    output[path || '$'] = value === null ? 'null' : typeof value === 'string' ? value : JSON.stringify(value)
    return output
  }
  if (Array.isArray(value)) {
    if (!value.length) output[path || '$'] = '[]'
    value.forEach((item, index) => flattenAuditValue(item, `${path}[${index}]`, output))
    return output
  }
  const entries = Object.entries(value as RedactedAuditValue)
  if (!entries.length) output[path || '$'] = '{}'
  entries.forEach(([key, item]) => flattenAuditValue(item, path ? `${path}.${key}` : key, output))
  return output
}

const diffRows = computed<AuditDiffRow[]>(() => {
  if (!detail.value) return []
  const before = flattenAuditValue(detail.value.before)
  const after = flattenAuditValue(detail.value.after)
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().map((path) => ({
    path,
    before: before[path] ?? '—',
    after: after[path] ?? '—',
    changed: before[path] !== after[path],
  }))
})

const metadataRows = computed(() => detail.value ? Object.entries(flattenAuditValue(detail.value.metadata)) : [])
onMounted(() => { void load() })
</script>

<template>
  <main class="audit-page">
    <header class="page-header">
      <div><h1>审计日志</h1><p>查看操作日志</p></div>
      <ShieldCheck :size="22" aria-hidden="true" />
    </header>

    <form data-test="audit-filters" class="audit-filters" @submit.prevent="load()">
      <label class="search-field"><Search :size="15" /><span class="sr-only">操作者账号 ID</span><input v-model.trim="filter.actorUserId" name="actor_user_id" placeholder="操作者账号 ID" /></label>
      <label><span class="sr-only">操作者类型</span><AppSelect :model-value="filter.actorType" :options="actorTypeOptions" accessible-name="操作者类型" name="actor_type" data-test="audit-actor-type" @update:model-value="setActorType" /></label>
      <label><span class="sr-only">动作</span><input v-model.trim="filter.action" name="action" placeholder="动作，如 settings.update" /></label>
      <label><span class="sr-only">目标类型</span><input v-model.trim="filter.targetType" name="target_type" placeholder="目标类型" /></label>
      <label><span class="sr-only">目标 ID</span><input v-model.trim="filter.targetId" name="target_id" placeholder="目标 ID" /></label>
      <label><span class="sr-only">结果</span><AppSelect :model-value="filter.result" :options="resultOptions" accessible-name="结果" name="result" data-test="audit-result" @update:model-value="setResult" /></label>
      <label><span class="sr-only">开始日期</span><input v-model="filter.from" name="from" type="date" title="开始日期" /></label>
      <label><span class="sr-only">结束日期</span><input v-model="filter.to" name="to" type="date" title="结束日期" /></label>
      <button class="filter-submit" type="submit">应用筛选</button>
      <button class="filter-reset" type="button" aria-label="清除筛选" @click="resetFilters"><FilterX :size="16" /></button>
    </form>

    <ResourceState v-if="loading && !logs.length" state="loading" title="正在读取审计日志" description="正在加载最近的管理动作。" />
    <ResourceState v-else-if="error && !logs.length" state="error" title="审计日志读取失败" description="筛选条件已保留，可以重新尝试。" @retry="load()" />
    <ResourceState v-else-if="!logs.length" state="empty" title="没有符合条件的日志" description="调整操作者、动作、目标或时间范围。" />

    <section v-else class="audit-directory" aria-label="审计日志列表">
      <div class="audit-heading audit-grid" aria-hidden="true"><span>时间</span><span>操作者</span><span>动作与目标</span><span>结果</span><span>请求 ID</span><span /></div>
      <article v-for="log in logs" :key="log.audit_log_id" :data-test="`audit-row-${log.audit_log_id}`" class="audit-row audit-grid" tabindex="0" @click="openDetail(log)" @keydown.enter="openDetail(log)">
        <time class="mono">{{ timeFormatter.format(new Date(log.occurred_at)) }}</time>
        <div class="actor"><strong>{{ log.actor.display_name }}</strong><span>{{ actorTypeLabels[log.actor.type] }}</span></div>
        <div class="action"><strong class="mono">{{ log.action }}</strong><span>{{ log.target.display_name || log.target.type }}<b v-if="log.target.id" class="mono"> · {{ log.target.id }}</b></span></div>
        <span :class="`result result--${log.result}`"><CheckCircle2 v-if="log.result === 'success'" :size="14" /><AlertTriangle v-else-if="log.result === 'failed'" :size="14" /><CircleHelp v-else :size="14" />{{ resultLabels[log.result] }}</span>
        <span class="request-id mono">{{ log.request_id }}</span>
        <ChevronRight :size="16" aria-hidden="true" />
      </article>
      <button v-if="hasMore" class="load-more" type="button" :disabled="loadingMore" @click="load(false)">{{ loadingMore ? '正在加载' : '加载更多' }}</button>
    </section>

    <AppOverlayTransition :show="Boolean(detail || detailLoading)" variant="drawer">
      <div class="drawer-layer" @click.self="detail = null">
        <aside class="audit-detail" role="dialog" aria-modal="true" aria-label="审计详情">
        <header><div><span class="eyebrow">AUDIT DETAIL</span><h2>{{ detail?.action || '正在读取详情' }}</h2><p class="mono">{{ detail?.audit_log_id }}</p></div><button type="button" aria-label="关闭详情" @click="detail = null"><X :size="17" /></button></header>
        <ResourceState v-if="detailLoading" state="loading" title="正在读取审计详情" description="正在加载脱敏字段变化。" />
        <template v-else-if="detail">
          <dl class="audit-meta">
            <div><dt>时间</dt><dd class="mono">{{ timeFormatter.format(new Date(detail.occurred_at)) }}</dd></div><div><dt>来源</dt><dd>{{ sourceLabels[detail.source] }}</dd></div>
            <div><dt>操作者</dt><dd>{{ detail.actor.display_name }}</dd></div><div><dt>结果</dt><dd>{{ resultLabels[detail.result] }}</dd></div>
            <div><dt>目标</dt><dd>{{ detail.target.display_name || detail.target.type }}</dd></div><div><dt>请求 ID</dt><dd class="mono">{{ detail.request_id }}</dd></div>
            <div><dt>IP</dt><dd class="mono">{{ detail.ip_address || '—' }}</dd></div><div><dt>User-Agent</dt><dd class="truncate">{{ detail.user_agent || '—' }}</dd></div>
          </dl>
          <section class="diff-section"><header><h3>字段变化</h3><span>{{ diffRows.filter((row) => row.changed).length }} 项变化</span></header><div class="diff-table"><div class="diff-heading"><span>字段</span><span>之前</span><span>之后</span></div><div v-for="row in diffRows" :key="row.path" :class="['diff-row', { changed: row.changed }]"><strong class="mono">{{ row.path }}</strong><span data-label="之前">{{ row.before }}</span><span data-label="之后">{{ row.after }}</span></div></div></section>
          <section class="metadata-section"><h3>元数据</h3><dl><div v-for="[path, value] in metadataRows" :key="path"><dt class="mono">{{ path }}</dt><dd>{{ value }}</dd></div></dl></section>
        </template>
        </aside>
      </div>
    </AppOverlayTransition>
  </main>
</template>

<style scoped>
.audit-page{display:grid;gap:15px}.page-header,.search-field,.filter-submit,.filter-reset,.result,.load-more,.audit-detail>header,.redacted-notice,.diff-section>header{display:flex;align-items:center}.page-header{justify-content:space-between;gap:16px}.page-header h1{font-size:24px;line-height:34px}.page-header p{color:var(--color-text-secondary);font-size:12px}.page-header>svg{color:var(--color-brand-action)}.audit-filters{display:grid;grid-template-columns:minmax(160px,1.1fr) 120px minmax(150px,1fr) 120px 120px 105px 130px 130px auto 38px;gap:7px;padding:11px 0;border-top:1px solid var(--color-border);border-bottom:1px solid var(--color-border)}.audit-filters input,.audit-filters select,.filter-submit,.filter-reset{width:100%;height:36px;padding:0 8px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.search-field{display:grid;grid-template-columns:15px minmax(0,1fr);gap:6px;padding:0 9px;color:var(--color-text-secondary);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.search-field input{min-width:0;padding:0;border:0;outline:0}.filter-submit,.filter-reset{justify-content:center;color:var(--color-brand-action);font-weight:600;border-color:var(--color-brand-border)}.filter-reset{width:38px;padding:0}.audit-directory{min-width:0;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-panel)}.audit-grid{display:grid;grid-template-columns:150px minmax(120px,.8fr) minmax(230px,1.5fr) 90px minmax(120px,.8fr) 16px;gap:12px;align-items:center}.audit-heading{min-height:36px;padding:0 13px;color:var(--color-text-secondary);font-size:10px;background:var(--color-surface-subtle);border-bottom:1px solid var(--color-border)}.audit-row{min-height:68px;padding:9px 13px;cursor:pointer;border-bottom:1px solid var(--color-border)}.audit-row:hover{background:var(--color-surface-raised)}.audit-row:last-of-type{border-bottom:0}.audit-row time,.request-id{overflow:hidden;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.actor,.action{display:grid;min-width:0}.actor strong,.action strong{overflow:hidden;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.actor span,.action span{overflow:hidden;color:var(--color-text-secondary);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.action b{font-weight:400}.result{width:fit-content;gap:5px;padding:2px 6px;color:var(--color-unknown);font-size:10px;background:var(--color-unknown-surface);border-radius:8px}.result--success{color:var(--color-success);background:var(--color-success-surface)}.result--failed{color:var(--color-danger);background:var(--color-danger-surface)}.load-more{height:38px;justify-content:center;margin:10px auto;padding:0 12px;color:var(--color-text-secondary);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.drawer-layer{position:fixed;z-index:80;inset:0;display:flex;justify-content:flex-end;background:rgb(34 37 36/36%)}.audit-detail{width:min(720px,100%);height:100%;overflow:auto;background:var(--color-surface);box-shadow:-12px 0 36px rgb(34 37 36/16%)}.audit-detail>header{position:sticky;z-index:2;top:0;justify-content:space-between;gap:12px;padding:14px 16px;background:var(--color-surface);border-bottom:1px solid var(--color-border)}.audit-detail>header h2{font-size:17px}.audit-detail>header p,.eyebrow{color:var(--color-text-secondary);font-size:9px}.eyebrow{color:var(--color-brand-ink);font-weight:700}.audit-detail>header button{display:grid;width:34px;height:34px;place-items:center;padding:0;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.redacted-notice{gap:9px;padding:10px 16px;color:var(--color-warning);background:var(--color-warning-surface);border-bottom:1px solid var(--color-border)}.redacted-notice span{display:grid;font-size:10px}.redacted-notice strong{font-size:12px}.audit-meta{display:grid;grid-template-columns:1fr 1fr;gap:0;margin:0;background:var(--color-surface-subtle);border-bottom:1px solid var(--color-border)}.audit-meta div{display:grid;min-width:0;padding:9px 16px;border-right:1px solid var(--color-border);border-bottom:1px solid var(--color-border)}.audit-meta dt,.metadata-section dt{color:var(--color-text-secondary);font-size:9px}.audit-meta dd,.metadata-section dd{min-width:0;margin:0;font-size:11px}.diff-section,.metadata-section{padding:16px}.diff-section>header{justify-content:space-between}.diff-section h3,.metadata-section h3{font-size:13px}.diff-section header span{color:var(--color-text-secondary);font-size:10px}.diff-table{margin-top:9px;border:1px solid var(--color-border)}.diff-heading,.diff-row{display:grid;grid-template-columns:minmax(130px,.8fr) minmax(0,1fr) minmax(0,1fr);gap:0}.diff-heading{color:var(--color-text-secondary);font-size:9px;background:var(--color-surface-subtle)}.diff-heading span,.diff-row>*{min-width:0;padding:7px 9px;border-right:1px solid var(--color-border);border-bottom:1px solid var(--color-border)}.diff-heading span:last-child,.diff-row>*:last-child{border-right:0}.diff-row:last-child>*{border-bottom:0}.diff-row{font-size:10px}.diff-row.changed{box-shadow:inset 3px 0 var(--color-brand-500)}.diff-row strong,.diff-row span{overflow-wrap:anywhere}.diff-row.changed>span:last-child{color:var(--color-brand-ink);background:var(--color-brand-surface)}.metadata-section{border-top:1px solid var(--color-border)}.metadata-section dl{display:grid;grid-template-columns:1fr 1fr;margin:9px 0 0;border-top:1px solid var(--color-border);border-left:1px solid var(--color-border)}.metadata-section dl div{display:grid;padding:7px 9px;border-right:1px solid var(--color-border);border-bottom:1px solid var(--color-border)}
@media(max-width:1500px){.audit-filters{grid-template-columns:repeat(4,minmax(120px,1fr)) auto 38px}.audit-grid{grid-template-columns:140px minmax(120px,.8fr) minmax(220px,1.5fr) 90px 16px}.audit-heading span:nth-child(5),.request-id{display:none}}
@media(max-width:680px){.audit-filters{grid-template-columns:1fr 1fr}.audit-filters label:nth-of-type(4),.audit-filters label:nth-of-type(7),.audit-filters label:nth-of-type(8){display:none}.filter-reset{justify-self:end}.audit-heading{display:none}.audit-directory{background:transparent;border:0}.audit-row,.audit-grid{grid-template-columns:1fr auto}.audit-row{gap:7px 10px;margin-bottom:8px;padding:11px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-panel)}.audit-row time,.action{grid-column:1/-1}.actor{grid-column:1}.result{grid-column:2;grid-row:2}.audit-row>svg{grid-column:2;grid-row:1;justify-self:end}.audit-meta{grid-template-columns:1fr}.diff-heading{display:none}.diff-row{grid-template-columns:1fr}.diff-row>*{border-right:0}.diff-row strong{background:var(--color-surface-subtle)}.diff-row span::before{display:block;color:var(--color-text-secondary);content:attr(data-label);font-size:9px}.audit-detail{width:100%}}
</style>
