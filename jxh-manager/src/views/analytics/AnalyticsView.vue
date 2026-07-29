<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Download, FilterX, RefreshCw, TrendingUp } from '@lucide/vue'

import {
  analyticsApi,
  type AnalyticsDataset,
  type AnalyticsDimension,
  type AnalyticsExportFormat,
  type AnalyticsGranularity,
  type AnalyticsResultFilter,
} from '@/api/analytics'
import { AdminApiError } from '@/api/client'
import type {
  AnalyticsMetric,
  AnalyticsMetricKey,
  AnalyticsRankings,
  AnalyticsSummary,
  AnalyticsTimeseries,
  FeatureKey,
} from '@/api/types'
import AnalyticsTrendChart from '@/components/data/AnalyticsTrendChart.vue'
import RankingTable from '@/components/data/RankingTable.vue'
import ResourceState from '@/components/feedback/ResourceState.vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const summary = ref<AnalyticsSummary | null>(null)
const timeseries = ref<AnalyticsTimeseries | null>(null)
const rankings = ref<AnalyticsRankings | null>(null)
const summaryLoading = ref(false)
const analysisLoading = ref(false)
const summaryError = ref<unknown>(null)
const analysisError = ref<unknown>(null)
const exporting = ref(false)
const exportResult = ref('')
const globalFilter = reactive({
  from: '',
  to: '',
  groupId: '',
  featureKey: '' as FeatureKey | '',
  result: '' as AnalyticsResultFilter | '',
})
const appliedScope = reactive({ ...globalFilter })
const analysisFilter = reactive({
  metric: 'group_message_count' as AnalyticsMetricKey,
  dimension: 'group' as AnalyticsDimension, granularity: 'day' as AnalyticsGranularity,
})
const exportOptions = reactive({ dataset: 'rankings' as AnalyticsDataset, format: 'csv' as AnalyticsExportFormat })
let summaryRequestId = 0
let analysisRequestId = 0
let previousScopeKey: string | null = null

const metricOptions: { value: AnalyticsMetricKey; label: string }[] = [
  { value: 'keyword_reply_count', label: '关键词回复' },
  { value: 'ai_request_count', label: 'AI 请求量' },
  { value: 'ai_success_rate', label: 'AI 成功率' },
  { value: 'ai_duration_ms', label: 'AI 平均耗时' },
  { value: 'join_request_count', label: '入群申请' },
  { value: 'manual_approval_count', label: '人工审批' },
  { value: 'automatic_approval_count', label: '自动审批' },
  { value: 'scheduled_job_run_count', label: '定时任务运行' },
  { value: 'group_message_count', label: '群消息量' },
  { value: 'command_run_count', label: '命令运行量' },
  { value: 'active_user_count', label: '活跃用户' },
  { value: 'link_clean_count', label: '链接净化' },
  { value: 'quote_success_count', label: '引用图成功' },
  { value: 'quote_fallback_count', label: '引用图回退' },
  { value: 'quote_failure_count', label: '引用图失败' },
]
const numberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 })
const timeFormatter = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

function queryString(value: unknown): string {
  return Array.isArray(value) ? String(value[0] ?? '') : typeof value === 'string' ? value : ''
}

function defaultDates(): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - 6)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

function routeState(): typeof globalFilter & typeof analysisFilter {
  const defaults = defaultDates()
  return {
    from: (queryString(route.query.from) || `${defaults.from}T00:00:00Z`).slice(0, 10),
    to: (queryString(route.query.to) || `${defaults.to}T23:59:59Z`).slice(0, 10),
    groupId: queryString(route.query.group_id),
    featureKey: queryString(route.query.feature_key) as FeatureKey | '',
    result: queryString(route.query.result) as AnalyticsResultFilter | '',
    metric: (queryString(route.query.metric) || 'group_message_count') as AnalyticsMetricKey,
    dimension: (queryString(route.query.dimension) || 'group') as AnalyticsDimension,
    granularity: (queryString(route.query.granularity) || 'day') as AnalyticsGranularity,
  }
}

function scopeKey(state: typeof globalFilter): string {
  return JSON.stringify([
    state.from,
    state.to,
    state.groupId,
    state.featureKey,
    state.result,
  ])
}

const commonQuery = computed(() => ({
  from: `${appliedScope.from}T00:00:00Z`,
  to: `${appliedScope.to}T00:00:00Z`,
  groupIds: appliedScope.groupId ? [appliedScope.groupId] : [],
  featureKeys: appliedScope.featureKey ? [appliedScope.featureKey] : [],
  results: appliedScope.result ? [appliedScope.result] : [],
  timezone: 'Asia/Shanghai',
}))

async function loadSummary(): Promise<void> {
  const requestId = ++summaryRequestId
  summaryLoading.value = true
  summaryError.value = null
  try {
    const nextSummary = await analyticsApi.getSummary(commonQuery.value)
    if (requestId === summaryRequestId) summary.value = nextSummary
  } catch (reason) {
    if (requestId === summaryRequestId) summaryError.value = reason
  } finally {
    if (requestId === summaryRequestId) summaryLoading.value = false
  }
}

async function loadAnalysis(): Promise<void> {
  const requestId = ++analysisRequestId
  analysisLoading.value = true
  analysisError.value = null
  try {
    const [nextTimeseries, nextRankings] = await Promise.all([
      analyticsApi.getTimeseries({
        ...commonQuery.value,
        granularity: analysisFilter.granularity,
        metrics: [analysisFilter.metric],
      }),
      analyticsApi.getRankings({
        ...commonQuery.value,
        dimension: analysisFilter.dimension,
        metric: analysisFilter.metric,
        limit: 10,
      }),
    ])
    if (requestId === analysisRequestId) {
      timeseries.value = nextTimeseries
      rankings.value = nextRankings
    }
  } catch (reason) {
    if (requestId === analysisRequestId) analysisError.value = reason
  } finally {
    if (requestId === analysisRequestId) analysisLoading.value = false
  }
}

function reloadAll(): void {
  void loadSummary()
  void loadAnalysis()
}

async function applyFilters(): Promise<void> {
  await router.replace({ query: {
    from: `${globalFilter.from}T00:00:00Z`,
    to: `${globalFilter.to}T00:00:00Z`,
    group_id: globalFilter.groupId || undefined,
    feature_key: globalFilter.featureKey || undefined,
    result: globalFilter.result || undefined,
    metric: analysisFilter.metric,
    dimension: analysisFilter.dimension,
    granularity: analysisFilter.granularity,
  } })
}

async function applyAnalysisFilters(): Promise<void> {
  await router.replace({
    query: {
      ...route.query,
      metric: analysisFilter.metric,
      dimension: analysisFilter.dimension,
      granularity: analysisFilter.granularity,
    },
  })
}

async function resetFilters(): Promise<void> {
  await router.replace({ query: {} })
}

async function exportAnalytics(): Promise<void> {
  exporting.value = true
  exportResult.value = ''
  try {
    const result = await analyticsApi.exportData({
      ...commonQuery.value,
      dataset: exportOptions.dataset,
      format: exportOptions.format,
      granularity: analysisFilter.granularity,
      metric: analysisFilter.metric,
      dimension: analysisFilter.dimension,
    })
    const url = URL.createObjectURL(result.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = result.filename
    link.click()
    URL.revokeObjectURL(url)
    exportResult.value = result.rowCount === null ? `已导出 ${result.filename}` : `已导出 ${result.rowCount} 行 · ${result.filename}`
  } catch (reason) {
    exportResult.value = reason instanceof AdminApiError ? reason.message : '统计数据导出失败。'
  } finally {
    exporting.value = false
  }
}

function formatMetric(metric: AnalyticsMetric): string {
  if (!metric.available || metric.value === null) return '—'
  if (metric.unit === 'percent') return `${numberFormatter.format(metric.value)}%`
  if (metric.unit === 'milliseconds') return `${numberFormatter.format(metric.value)} ms`
  return numberFormatter.format(metric.value)
}

watch(
  () => route.fullPath,
  () => {
    const state = routeState()
    const nextScopeKey = scopeKey(state)
    const scopeChanged = nextScopeKey !== previousScopeKey

    Object.assign(appliedScope, {
      from: state.from,
      to: state.to,
      groupId: state.groupId,
      featureKey: state.featureKey,
      result: state.result,
    })
    if (scopeChanged) Object.assign(globalFilter, appliedScope)
    Object.assign(analysisFilter, {
      metric: state.metric,
      dimension: state.dimension,
      granularity: state.granularity,
    })
    previousScopeKey = nextScopeKey

    if (scopeChanged) void loadSummary()
    void loadAnalysis()
  },
  { immediate: true },
)
</script>

<template>
  <main class="analytics-page">
    <header class="page-header">
      <div><h1>统计分析</h1><p>对比业务趋势、群与自动化排行，并下载当前筛选范围的数据。</p></div>
      <div v-if="auth.hasPermission('analytics:export')" class="export-tools">
        <select v-model="exportOptions.dataset" aria-label="导出数据集">
          <option value="summary">指标汇总</option><option value="timeseries">趋势明细</option><option value="rankings">排行</option><option value="join_requests">入群申请</option><option value="scheduled_job_runs">任务运行</option>
        </select>
        <select v-model="exportOptions.format" aria-label="导出格式"><option value="csv">CSV</option><option value="xlsx">XLSX</option></select>
        <button data-test="export-analytics" type="button" :disabled="exporting" @click="exportAnalytics"><Download :size="16" />{{ exporting ? '导出中' : '导出' }}</button>
      </div>
    </header>

    <p v-if="exportResult" class="export-result" role="status">{{ exportResult }}</p>

    <form data-test="analytics-filters" class="analytics-filters" @submit.prevent="applyFilters">
      <label><span>开始日期</span><input v-model="globalFilter.from" name="from" type="date" required /></label>
      <label><span>结束日期</span><input v-model="globalFilter.to" name="to" type="date" required /></label>
      <label><span>群号</span><input v-model.trim="globalFilter.groupId" name="group_id" inputmode="numeric" placeholder="全部群" /></label>
      <label><span>功能</span><select v-model="globalFilter.featureKey" name="feature_key"><option value="">全部功能</option><option value="ai_qa">AI 问答</option><option value="quote">引用图</option><option value="link_cleaner">链接净化</option><option value="custom_commands">自定义命令</option></select></label>
      <label><span>结果</span><select v-model="globalFilter.result" name="result"><option value="">全部结果</option><option value="success">成功</option><option value="failed">失败</option><option value="fallback">降级</option><option value="denied">拒绝</option><option value="unknown">未知</option><option value="skipped">跳过</option></select></label>
      <button class="filter-submit" type="submit">应用筛选</button>
      <button class="filter-reset" type="button" aria-label="清除筛选" @click="resetFilters"><FilterX :size="16" /></button>
    </form>

    <ResourceState v-if="summaryLoading && !summary" state="loading" title="正在汇总统计" description="正在读取指标、趋势和排行。" />
    <ResourceState v-else-if="summaryError && !summary" state="error" title="统计读取失败" description="筛选条件已保留，可以重新尝试。" @retry="reloadAll" />

    <template v-else-if="summary">
      <div v-if="summaryError" class="stale-state"><RefreshCw :size="15" />刷新失败，当前仍显示上一次成功数据。</div>
      <section class="metric-grid" aria-label="统计指标">
        <article v-for="(metric, index) in summary.metrics" :key="metric.key" :class="`metric metric--${index % 4}`">
          <span>{{ metric.label }}</span><strong class="mono">{{ formatMetric(metric) }}</strong>
          <small v-if="!metric.available">暂不可用</small>
          <small v-else-if="metric.change_percent !== null" :class="{ negative: metric.change_percent < 0 }">较前周期 {{ metric.change_percent > 0 ? '+' : '' }}{{ metric.change_percent }}%</small>
          <small v-else>暂无前周期比较</small>
        </article>
      </section>

      <section class="analytics-workspace">
        <section class="trend-section">
          <header>
            <div><h2>趋势</h2><p>{{ metricOptions.find((item) => item.value === analysisFilter.metric)?.label }} · {{ analysisFilter.granularity === 'day' ? '按日' : '按小时' }}</p></div>
            <div class="analysis-controls">
              <label><span>指标</span><select v-model="analysisFilter.metric" name="metric" @change="applyAnalysisFilters"><option v-for="item in metricOptions" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
              <label><span>粒度</span><select v-model="analysisFilter.granularity" name="granularity" @change="applyAnalysisFilters"><option value="day">按日</option><option value="hour">按小时</option></select></label>
              <TrendingUp :size="18" aria-hidden="true" />
            </div>
          </header>
          <div v-if="analysisError" class="analysis-state analysis-state--error"><span>分析数据刷新失败。</span><button type="button" @click="loadAnalysis">重试</button></div>
          <div v-else-if="analysisLoading" class="analysis-state"><RefreshCw :size="14" aria-hidden="true" />正在更新趋势</div>
          <AnalyticsTrendChart :series="timeseries?.series ?? []" />
        </section>
        <section class="ranking-section">
          <header>
            <div><h2>排行</h2><p>{{ analysisFilter.dimension === 'group' ? '群' : analysisFilter.dimension === 'command' ? '命令' : '知识词条' }}维度前 10</p></div>
            <div class="analysis-controls">
              <label><span>维度</span><select v-model="analysisFilter.dimension" name="dimension" @change="applyAnalysisFilters"><option value="group">群</option><option value="command">命令</option><option value="knowledge_entry">知识词条</option></select></label>
            </div>
          </header>
          <div v-if="analysisError" class="analysis-state analysis-state--error"><span>排行数据刷新失败。</span><button type="button" @click="loadAnalysis">重试</button></div>
          <div v-else-if="analysisLoading" class="analysis-state"><RefreshCw :size="14" aria-hidden="true" />正在更新排行</div>
          <RankingTable :rankings="rankings" />
        </section>
      </section>

      <footer class="data-freshness">数据更新于 {{ timeFormatter.format(new Date(summary.data_fresh_at)) }}<span v-if="summaryLoading || analysisLoading"> · 正在刷新</span></footer>
    </template>
  </main>
</template>

<style scoped>
.analytics-page{display:grid;gap:16px}.page-header,.export-tools,.export-tools button,.stale-state,.trend-section>header,.ranking-section>header{display:flex;align-items:center}.page-header{justify-content:space-between;gap:16px}.page-header h1{font-size:24px;line-height:34px}.page-header p,.trend-section header p,.ranking-section header p{color:var(--color-text-secondary);font-size:12px}.export-tools{gap:7px}.export-tools select,.export-tools button{height:36px;padding:0 9px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.export-tools button{gap:6px;color:white;font-weight:600;background:var(--color-brand-action);border-color:var(--color-brand-action)}.export-result,.stale-state{padding:9px 11px;font-size:11px;border-left:3px solid var(--color-success)}.export-result{color:var(--color-success);background:var(--color-success-surface)}.analytics-filters{display:grid;grid-template-columns:repeat(2,minmax(128px,.75fr)) minmax(130px,.8fr) repeat(5,minmax(120px,.8fr)) auto 38px;gap:7px;padding:12px 0;border-top:1px solid var(--color-border);border-bottom:1px solid var(--color-border)}.analytics-filters label{display:grid;gap:4px}.analytics-filters label span{color:var(--color-text-secondary);font-size:10px}.analytics-filters input,.analytics-filters select,.filter-submit,.filter-reset{width:100%;height:36px;padding:0 8px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.filter-submit,.filter-reset{align-self:end;color:var(--color-brand-action);font-weight:600;border-color:var(--color-brand-border)}.filter-reset{display:grid;width:38px;place-items:center;padding:0}.stale-state{gap:7px;color:var(--color-warning);background:var(--color-warning-surface);border-color:var(--color-warning)}.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.metric{position:relative;display:grid;min-width:0;height:96px;align-content:space-between;padding:12px 13px;overflow:hidden;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-panel)}.metric:before{position:absolute;inset:0 auto 0 0;width:3px;content:'';background:var(--color-brand-500)}.metric--1:before{background:var(--color-info)}.metric--2:before{background:var(--color-success)}.metric--3:before{background:var(--color-warning)}.metric>span,.metric small{overflow:hidden;color:var(--color-text-secondary);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.metric strong{font-size:22px}.metric small{color:var(--color-success)}.metric small.negative{color:var(--color-warning)}.analytics-workspace{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(300px,.7fr);border-top:1px solid var(--color-border);border-bottom:1px solid var(--color-border)}.trend-section,.ranking-section{min-width:0;background:var(--color-surface)}.trend-section{padding:16px 18px 14px 0;border-right:1px solid var(--color-border)}.ranking-section{padding:16px 0 14px 18px}.trend-section>header,.ranking-section>header{min-height:38px;justify-content:space-between}.trend-section h2,.ranking-section h2{font-size:16px}.trend-section>header>svg{color:var(--color-brand-action)}.data-freshness{color:var(--color-text-secondary);font-family:var(--font-mono);font-size:10px;text-align:right}
.analysis-controls{display:flex;align-items:flex-end;gap:7px}.analysis-controls label{display:grid;gap:3px}.analysis-controls label span{color:var(--color-text-secondary);font-size:10px}.analysis-controls select{height:32px;min-width:92px;padding:0 8px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.analysis-controls svg{align-self:center;color:var(--color-brand-action)}.analysis-state{display:flex;min-height:32px;align-items:center;gap:7px;margin-top:8px;padding:6px 8px;color:var(--color-text-secondary);font-size:11px;background:var(--color-surface-subtle)}.analysis-state--error{justify-content:space-between;color:var(--color-warning);background:var(--color-warning-surface)}.analysis-state button{padding:2px 7px;color:var(--color-brand-action);background:var(--color-surface);border:1px solid var(--color-brand-border);border-radius:var(--radius-control)}
@media(max-width:1279px){.analytics-filters{grid-template-columns:repeat(4,minmax(120px,1fr)) auto 38px}.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.analytics-workspace{grid-template-columns:1fr}.trend-section{padding-right:0;border-right:0;border-bottom:1px solid var(--color-border)}.ranking-section{padding-left:0}}
@media(max-width:680px){.page-header{align-items:stretch;flex-direction:column}.export-tools{display:grid;grid-template-columns:1fr 82px auto}.analytics-filters{grid-template-columns:1fr 1fr}.analytics-filters label:nth-of-type(4),.analytics-filters label:nth-of-type(7),.analytics-filters label:nth-of-type(8){display:none}.filter-reset{justify-self:end}.metric-grid{grid-template-columns:1fr 1fr}.metric{height:88px}.metric strong{font-size:18px}.trend-section,.ranking-section{padding-block:14px}.data-freshness{text-align:left}}
@media(max-width:380px){.export-tools{grid-template-columns:1fr 1fr}.export-tools button{grid-column:1/-1;justify-content:center}.metric-grid{grid-template-columns:1fr}}
</style>
