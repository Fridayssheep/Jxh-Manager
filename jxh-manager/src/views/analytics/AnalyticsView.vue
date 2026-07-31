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
  AnalyticsMetricKey,
  AnalyticsRankings,
  AnalyticsSummary,
  AnalyticsTimeseries,
  FeatureKey,
} from '@/api/types'
import AnalyticsMetricBoard from '@/components/data/AnalyticsMetricBoard.vue'
import AnalyticsTrendChart from '@/components/data/AnalyticsTrendChart.vue'
import RankingTable from '@/components/data/RankingTable.vue'
import OperationNotice from '@/components/feedback/OperationNotice.vue'
import ResourceState from '@/components/feedback/ResourceState.vue'
import AppSelect, { type AppSelectOption } from '@/components/form/AppSelect.vue'
import { vRiseOnChange, vSmoothResize } from '@/directives/motion'
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
const exportTone = ref<'success' | 'danger'>('success')
const summaryRevision = ref(0)
const analysisRevision = ref(0)
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
const exportDatasetOptions: readonly AppSelectOption[] = [
  { value: 'summary', label: '指标汇总' },
  { value: 'timeseries', label: '趋势明细' },
  { value: 'rankings', label: '排行' },
  { value: 'join_requests', label: '入群申请' },
  { value: 'scheduled_job_runs', label: '任务运行' },
]
const exportFormatOptions: readonly AppSelectOption[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'xlsx', label: 'XLSX' },
]
const featureOptions: readonly AppSelectOption[] = [
  { value: '', label: '全部功能' },
  { value: 'ai_qa', label: 'AI 问答' },
  { value: 'quote', label: '引用图' },
  { value: 'link_cleaner', label: '链接净化' },
  { value: 'custom_commands', label: '自定义命令' },
]
const resultOptions: readonly AppSelectOption[] = [
  { value: '', label: '全部结果' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'fallback', label: '降级' },
  { value: 'denied', label: '拒绝' },
  { value: 'unknown', label: '未知' },
  { value: 'skipped', label: '跳过' },
]
const granularityOptions: readonly AppSelectOption[] = [
  { value: 'day', label: '按日' },
  { value: 'hour', label: '按小时' },
]
const dimensionOptions: readonly AppSelectOption[] = [
  { value: 'group', label: '群' },
  { value: 'command', label: '命令' },
  { value: 'knowledge_entry', label: '知识词条' },
]
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
    if (requestId === summaryRequestId) {
      summary.value = nextSummary
      summaryRevision.value += 1
    }
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
      analysisRevision.value += 1
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

function setExportDataset(value: string): void {
  exportOptions.dataset = value as AnalyticsDataset
}

function setExportFormat(value: string): void {
  exportOptions.format = value as AnalyticsExportFormat
}

function setFeatureKey(value: string): void {
  globalFilter.featureKey = value as FeatureKey | ''
}

function setResult(value: string): void {
  globalFilter.result = value as AnalyticsResultFilter | ''
}

function setMetric(value: string): void {
  analysisFilter.metric = value as AnalyticsMetricKey
}

function setGranularity(value: string): void {
  analysisFilter.granularity = value as AnalyticsGranularity
}

function setDimension(value: string): void {
  analysisFilter.dimension = value as AnalyticsDimension
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
    exportTone.value = 'success'
    exportResult.value = result.rowCount === null ? `已导出 ${result.filename}` : `已导出 ${result.rowCount} 行 · ${result.filename}`
  } catch (reason) {
    exportTone.value = 'danger'
    exportResult.value = reason instanceof AdminApiError ? reason.message : '统计数据导出失败。'
  } finally {
    exporting.value = false
  }
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
      <div><h1>统计分析</h1><p>查看或下载当前筛选范围的数据</p></div>
      <div v-if="auth.hasPermission('analytics:export')" class="export-tools">
        <AppSelect
          :model-value="exportOptions.dataset"
          :options="exportDatasetOptions"
          accessible-name="导出数据集"
          @update:model-value="setExportDataset"
        />
        <AppSelect
          :model-value="exportOptions.format"
          :options="exportFormatOptions"
          accessible-name="导出格式"
          @update:model-value="setExportFormat"
        />
        <button data-test="export-analytics" type="button" :disabled="exporting" @click="exportAnalytics"><Download :class="{ spin: exporting }" :size="17" />{{ exporting ? '导出中' : '导出' }}</button>
      </div>
    </header>

    <OperationNotice :message="exportResult" :tone="exportTone" :revision="exportResult" @close="exportResult = ''" />

    <form data-test="analytics-filters" class="analytics-filters" @submit.prevent="applyFilters">
      <div class="filter-field filter-field--date-range">
        <span>日期范围</span>
        <div class="date-range-inputs">
          <label><span class="sr-only">开始日期</span><input v-model="globalFilter.from" name="from" type="date" required /></label>
          <i aria-hidden="true">至</i>
          <label><span class="sr-only">结束日期</span><input v-model="globalFilter.to" name="to" type="date" required /></label>
        </div>
      </div>
      <label class="filter-field"><span>群号</span><input v-model.trim="globalFilter.groupId" name="group_id" inputmode="numeric" placeholder="全部群" /></label>
      <label class="filter-field">
        <span>功能</span>
        <AppSelect
          :model-value="globalFilter.featureKey"
          :options="featureOptions"
          accessible-name="功能"
          name="feature_key"
          @update:model-value="setFeatureKey"
        />
      </label>
      <label class="filter-field">
        <span>结果</span>
        <AppSelect
          :model-value="globalFilter.result"
          :options="resultOptions"
          accessible-name="结果"
          name="result"
          @update:model-value="setResult"
        />
      </label>
      <div class="filter-actions">
        <button class="filter-submit" type="submit">应用筛选</button>
        <button class="filter-reset" type="button" aria-label="清除筛选" title="清除筛选" @click="resetFilters"><FilterX :size="16" /></button>
      </div>
    </form>

    <ResourceState v-if="summaryLoading && !summary" state="loading" title="正在汇总统计" description="正在读取指标、趋势和排行……" />
    <ResourceState v-else-if="summaryError && !summary" state="error" title="统计读取失败" @retry="reloadAll" />

    <template v-else-if="summary">
      <div v-if="summaryError" class="stale-state"><RefreshCw :size="15" />刷新失败，未更改上一次数据</div>
      <AnalyticsMetricBoard :metrics="summary.metrics" :revision="summaryRevision" />

      <section class="analytics-workspace">
        <section v-smooth-resize class="trend-section analytics-card">
          <header>
            <div><h2>趋势</h2><p>{{ metricOptions.find((item) => item.value === analysisFilter.metric)?.label }} · {{ analysisFilter.granularity === 'day' ? '按日' : '按小时' }}</p></div>
            <div class="analysis-controls">
              <label>
                <span>指标</span>
                <AppSelect
                  :model-value="analysisFilter.metric"
                  :options="metricOptions"
                  accessible-name="指标"
                  name="metric"
                  data-test="metric-select"
                  size="compact"
                  @update:model-value="setMetric"
                  @change="applyAnalysisFilters"
                />
              </label>
              <label>
                <span>粒度</span>
                <AppSelect
                  :model-value="analysisFilter.granularity"
                  :options="granularityOptions"
                  accessible-name="粒度"
                  name="granularity"
                  size="compact"
                  @update:model-value="setGranularity"
                  @change="applyAnalysisFilters"
                />
              </label>
              <TrendingUp :size="18" aria-hidden="true" />
            </div>
          </header>
          <div v-rise-on-change="analysisRevision" class="analysis-content">
            <div v-if="analysisError" class="analysis-state analysis-state--error"><span>分析数据刷新失败。</span><button type="button" @click="loadAnalysis">重试</button></div>
            <div v-else-if="analysisLoading" class="analysis-state"><RefreshCw :size="14" aria-hidden="true" />正在更新趋势</div>
            <AnalyticsTrendChart :series="timeseries?.series ?? []" />
          </div>
        </section>
        <section v-smooth-resize class="ranking-section analytics-card">
          <header>
            <div><h2>排行</h2><p>{{ analysisFilter.dimension === 'group' ? '群' : analysisFilter.dimension === 'command' ? '命令' : '知识词条' }}维度前 10</p></div>
            <div class="analysis-controls">
              <label>
                <span>维度</span>
                <AppSelect
                  :model-value="analysisFilter.dimension"
                  :options="dimensionOptions"
                  accessible-name="维度"
                  name="dimension"
                  size="compact"
                  @update:model-value="setDimension"
                  @change="applyAnalysisFilters"
                />
              </label>
            </div>
          </header>
          <div v-rise-on-change="analysisRevision" class="analysis-content">
            <div v-if="analysisError" class="analysis-state analysis-state--error"><span>排行数据刷新失败。</span><button type="button" @click="loadAnalysis">重试</button></div>
            <div v-else-if="analysisLoading" class="analysis-state"><RefreshCw :size="14" aria-hidden="true" />正在更新排行</div>
            <RankingTable :rankings="rankings" />
          </div>
        </section>
      </section>

      <footer class="data-freshness">数据更新于 {{ timeFormatter.format(new Date(summary.data_fresh_at)) }}<span v-if="summaryLoading || analysisLoading"> · 正在刷新</span></footer>
    </template>
  </main>
</template>

<style scoped>
.analytics-page {
  display: grid;
  min-width: 0;
  gap: 16px;
}

.page-header,
.export-tools,
.export-tools button,
.stale-state,
.trend-section > header,
.ranking-section > header,
.filter-actions,
.date-range-inputs,
.analysis-controls,
.analysis-state {
  display: flex;
  align-items: center;
}

.page-header {
  justify-content: space-between;
  gap: 16px;
}

.page-header h1 {
  font-size: 24px;
  line-height: 34px;
}

.page-header p,
.trend-section header p,
.ranking-section header p {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.export-tools {
  flex: 0 0 auto;
  gap: 7px;
}

.export-tools .app-select,
.export-tools button {
  height: 36px;
}

.export-tools .app-select:first-child {
  width: 126px;
}

.export-tools .app-select:nth-child(2) {
  width: 86px;
}

.export-tools button {
  gap: 6px;
  color: white;
  font-weight: 600;
  background: var(--color-brand-action);
  border: 1px solid var(--color-brand-action);
  border-radius: var(--radius-control);
}

.export-tools button:hover:not(:disabled) {
  background: var(--color-brand-action-hover);
  border-color: var(--color-brand-action-hover);
}

.stale-state {
  padding: 9px 11px;
  font-size: 11px;
  border-left: 3px solid var(--color-success);
}

.stale-state {
  gap: 7px;
  color: var(--color-warning);
  background: var(--color-warning-surface);
  border-color: var(--color-warning);
}

.analytics-filters {
  display: grid;
  grid-template-columns: minmax(280px, 1.5fr) repeat(3, minmax(120px, 0.75fr)) auto;
  align-items: end;
  gap: 8px;
  padding: 12px 0;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}

.filter-field,
.filter-field--date-range {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.filter-field > span,
.filter-field--date-range > span,
.analysis-controls label span {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.date-range-inputs {
  min-width: 0;
  gap: 7px;
}

.date-range-inputs label {
  min-width: 0;
  flex: 1 1 0;
}

.date-range-inputs i {
  flex: 0 0 auto;
  color: var(--color-text-secondary);
  font-size: 10px;
  font-style: normal;
}

.analytics-filters input,
.filter-submit,
.filter-reset {
  width: 100%;
  height: 36px;
  min-width: 0;
  padding: 0 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}

.filter-actions {
  gap: 7px;
}

.filter-submit,
.filter-reset {
  color: var(--color-brand-action);
  font-weight: 600;
  border-color: var(--color-brand-border);
}

.filter-submit {
  width: auto;
  min-width: 78px;
  padding-inline: 12px;
}

.filter-reset {
  display: grid;
  width: 38px;
  flex: 0 0 38px;
  place-items: center;
  padding: 0;
}

.filter-submit:hover,
.filter-reset:hover {
  background: var(--color-brand-surface);
}

.analytics-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(300px, 0.85fr);
  gap: 12px;
}

.analytics-card {
  min-width: 0;
  padding: var(--space-card);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.trend-section > header,
.ranking-section > header {
  min-height: 46px;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.trend-section h2,
.ranking-section h2 {
  font-size: 16px;
  line-height: 24px;
}

.analysis-controls {
  flex: 0 1 auto;
  align-items: flex-end;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 7px;
}

.analysis-controls label {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.analysis-controls .app-select {
  width: 100%;
  min-width: 92px;
  max-width: 170px;
}

.analysis-content {
  min-width: 0;
}

.analysis-controls svg {
  align-self: center;
  color: var(--color-brand-action);
}

.analysis-state {
  min-height: 32px;
  gap: 7px;
  margin: 8px 0;
  padding: 6px 8px;
  color: var(--color-text-secondary);
  font-size: 11px;
  background: var(--color-surface-subtle);
}

.analysis-state--error {
  justify-content: space-between;
  color: var(--color-warning);
  background: var(--color-warning-surface);
}

.analysis-state button {
  padding: 2px 7px;
  color: var(--color-brand-action);
  background: var(--color-surface);
  border: 1px solid var(--color-brand-border);
  border-radius: var(--radius-control);
}

.data-freshness {
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
  font-size: 10px;
  text-align: right;
}

@media (max-width: 1100px) {
  .analytics-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .filter-field--date-range {
    grid-column: 1 / -1;
  }

  .filter-actions {
    align-self: end;
    justify-content: flex-end;
  }

  .analytics-workspace {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .page-header {
    align-items: stretch;
    flex-direction: column;
  }

  .export-tools {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 82px auto;
  }

  .export-tools .app-select {
    width: 100%;
  }

  .analytics-filters {
    grid-template-columns: minmax(0, 1fr);
  }

  .filter-field--date-range {
    grid-column: auto;
  }

  .filter-actions {
    justify-content: stretch;
  }

  .filter-submit {
    flex: 1 1 auto;
  }

  .trend-section > header,
  .ranking-section > header {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .analysis-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(92px, 0.55fr) auto;
    justify-content: stretch;
  }

  .ranking-section .analysis-controls {
    grid-template-columns: minmax(0, 1fr);
  }

  .analysis-controls .app-select {
    max-width: none;
  }

  .data-freshness {
    text-align: left;
  }
}

@media (max-width: 420px) {
  .export-tools {
    grid-template-columns: minmax(0, 1fr) 82px;
  }

  .export-tools button {
    grid-column: 1 / -1;
    justify-content: center;
  }

  .date-range-inputs {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .date-range-inputs i {
    display: none;
  }

  .analysis-controls {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .analysis-controls svg {
    display: none;
  }
}
</style>
