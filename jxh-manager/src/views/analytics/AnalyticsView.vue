<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  BookOpenCheck,
  Download,
  FilterX,
  MessageSquareText,
  RefreshCw,
  Search,
  TrendingUp,
} from '@lucide/vue'

import { analyticsApi } from '@/api/analytics'
import { AdminApiError } from '@/api/client'
import type { AnalyticsRankings, AnalyticsSummary, AnalyticsTimeseries } from '@/api/types'
import AnalyticsMetricBoard from '@/components/data/AnalyticsMetricBoard.vue'
import AnalyticsTrendChart from '@/components/data/AnalyticsTrendChart.vue'
import RankingTable from '@/components/data/RankingTable.vue'
import OperationNotice from '@/components/feedback/OperationNotice.vue'
import ResourceState from '@/components/feedback/ResourceState.vue'
import CursorPager from '@/components/navigation/CursorPager.vue'
import { clampPage, pageCount } from '@/composables/pagination'
import { vRiseOnChange, vSmoothResize } from '@/directives/motion'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const summary = ref<AnalyticsSummary | null>(null)
const trend = ref<AnalyticsTimeseries | null>(null)
const groupRankings = ref<AnalyticsRankings | null>(null)
const knowledgeRankings = ref<AnalyticsRankings | null>(null)
const summaryLoading = ref(false)
const trendLoading = ref(false)
const groupRankingsLoading = ref(false)
const knowledgeRankingsLoading = ref(false)
const summaryError = ref<unknown>(null)
const trendError = ref<unknown>(null)
const groupRankingsError = ref<unknown>(null)
const knowledgeRankingsError = ref<unknown>(null)
const exporting = ref(false)
const operationResult = ref('')
const operationTone = ref<'success' | 'danger'>('success')
const summaryRevision = ref(0)
const trendRevision = ref(0)
const groupRankingsRevision = ref(0)
const knowledgeRankingsRevision = ref(0)
const groupRankingsPage = ref(1)
const knowledgeRankingsPage = ref(1)
const rankingPageSize = 10
const globalFilter = reactive({ from: '', to: '', groupId: '' })
const appliedScope = reactive({ ...globalFilter })
let summaryRequestId = 0
let trendRequestId = 0
let groupRankingsRequestId = 0
let knowledgeRankingsRequestId = 0
let previousScopeKey: string | null = null

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function queryString(value: unknown): string {
  return Array.isArray(value) ? String(value[0] ?? '') : typeof value === 'string' ? value : ''
}

function calendarDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function shiftCalendarDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10)
}

function dateSpan(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1)
}

function defaultDates(days = 7): { from: string; to: string } {
  const to = calendarDate(new Date())
  return { from: shiftCalendarDate(to, -days + 1), to }
}

function routeDate(value: unknown, fallback: string): string {
  const raw = queryString(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parsed = new Date(raw)
  return raw && !Number.isNaN(parsed.valueOf()) ? calendarDate(parsed) : fallback
}

function routeState(): typeof globalFilter {
  const defaults = defaultDates()
  return {
    from: routeDate(route.query.from, defaults.from),
    to: routeDate(route.query.to, defaults.to),
    groupId: queryString(route.query.group_id),
  }
}

function scopeKey(state: typeof globalFilter): string {
  return JSON.stringify([state.from, state.to, state.groupId])
}

function shanghaiDayStart(value: string): string {
  return new Date(`${value}T00:00:00+08:00`).toISOString()
}

const appliedDays = computed(() => dateSpan(appliedScope.from, appliedScope.to))
const activePreset = computed(() => {
  if (globalFilter.to !== calendarDate(new Date())) return 0
  if (globalFilter.from === shiftCalendarDate(globalFilter.to, -6)) return 7
  if (globalFilter.from === shiftCalendarDate(globalFilter.to, -29)) return 30
  return 0
})
const commonQuery = computed(() => ({
  from: shanghaiDayStart(appliedScope.from),
  to: shanghaiDayStart(shiftCalendarDate(appliedScope.to, 1)),
  groupIds: appliedScope.groupId ? [appliedScope.groupId] : [],
  featureKeys: [],
  results: [],
  timezone: 'Asia/Shanghai',
}))
const groupRankingPages = computed(() =>
  pageCount(groupRankings.value?.total_count ?? 0, rankingPageSize),
)
const knowledgeRankingPages = computed(() =>
  pageCount(knowledgeRankings.value?.total_count ?? 0, rankingPageSize),
)

async function loadSummary(): Promise<void> {
  const requestId = ++summaryRequestId
  summaryLoading.value = true
  summaryError.value = null
  try {
    const next = await analyticsApi.getSummary(commonQuery.value)
    if (requestId === summaryRequestId) {
      summary.value = next
      summaryRevision.value += 1
    }
  } catch (reason) {
    if (requestId === summaryRequestId) summaryError.value = reason
  } finally {
    if (requestId === summaryRequestId) summaryLoading.value = false
  }
}

async function loadTrend(): Promise<void> {
  const requestId = ++trendRequestId
  trendLoading.value = true
  trendError.value = null
  try {
    const next = await analyticsApi.getTimeseries({
      ...commonQuery.value,
      granularity: appliedDays.value <= 2 ? 'hour' : 'day',
      metrics: ['group_message_count'],
    })
    if (requestId === trendRequestId) {
      trend.value = next
      trendRevision.value += 1
    }
  } catch (reason) {
    if (requestId === trendRequestId) trendError.value = reason
  } finally {
    if (requestId === trendRequestId) trendLoading.value = false
  }
}

async function loadGroupRankings(targetPage = groupRankingsPage.value): Promise<void> {
  const requestId = ++groupRankingsRequestId
  groupRankingsLoading.value = true
  groupRankingsError.value = null
  try {
    const next = await analyticsApi.getRankings({
      ...commonQuery.value,
      dimension: 'group',
      metric: 'group_message_count',
      page: targetPage,
      limit: rankingPageSize,
    })
    if (requestId === groupRankingsRequestId) {
      const resolvedPage = clampPage(targetPage, pageCount(next.total_count, rankingPageSize))
      if (resolvedPage !== targetPage) {
        await loadGroupRankings(resolvedPage)
        return
      }
      groupRankings.value = next
      groupRankingsPage.value = resolvedPage
      groupRankingsRevision.value += 1
    }
  } catch (reason) {
    if (requestId === groupRankingsRequestId) groupRankingsError.value = reason
  } finally {
    if (requestId === groupRankingsRequestId) groupRankingsLoading.value = false
  }
}

async function loadKnowledgeRankings(targetPage = knowledgeRankingsPage.value): Promise<void> {
  const requestId = ++knowledgeRankingsRequestId
  knowledgeRankingsLoading.value = true
  knowledgeRankingsError.value = null
  try {
    const next = await analyticsApi.getRankings({
      ...commonQuery.value,
      dimension: 'knowledge_entry',
      metric: 'knowledge_trigger_count',
      page: targetPage,
      limit: rankingPageSize,
    })
    if (requestId === knowledgeRankingsRequestId) {
      const resolvedPage = clampPage(targetPage, pageCount(next.total_count, rankingPageSize))
      if (resolvedPage !== targetPage) {
        await loadKnowledgeRankings(resolvedPage)
        return
      }
      knowledgeRankings.value = next
      knowledgeRankingsPage.value = resolvedPage
      knowledgeRankingsRevision.value += 1
    }
  } catch (reason) {
    if (requestId === knowledgeRankingsRequestId) knowledgeRankingsError.value = reason
  } finally {
    if (requestId === knowledgeRankingsRequestId) knowledgeRankingsLoading.value = false
  }
}

function goToGroupRankingPage(targetPage: number): void {
  if (groupRankingsLoading.value || targetPage === groupRankingsPage.value) return
  void loadGroupRankings(clampPage(targetPage, groupRankingPages.value))
}

function goToKnowledgeRankingPage(targetPage: number): void {
  if (knowledgeRankingsLoading.value || targetPage === knowledgeRankingsPage.value) return
  void loadKnowledgeRankings(clampPage(targetPage, knowledgeRankingPages.value))
}

function reloadAll(): void {
  void loadSummary()
  void loadTrend()
  void loadGroupRankings()
  void loadKnowledgeRankings()
}

async function applyFilters(): Promise<void> {
  if (globalFilter.from > globalFilter.to) {
    operationTone.value = 'danger'
    operationResult.value = '开始日期不能晚于结束日期。'
    return
  }
  if (dateSpan(globalFilter.from, globalFilter.to) > 30) {
    operationTone.value = 'danger'
    operationResult.value = '统计概览最多查询连续 30 天。'
    return
  }
  operationResult.value = ''
  await router.replace({
    query: {
      from: globalFilter.from,
      to: globalFilter.to,
      group_id: globalFilter.groupId || undefined,
    },
  })
}

async function applyPreset(days: number): Promise<void> {
  Object.assign(globalFilter, defaultDates(days))
  await applyFilters()
}

async function resetFilters(): Promise<void> {
  await router.replace({ query: {} })
}

async function exportAnalytics(): Promise<void> {
  exporting.value = true
  operationResult.value = ''
  try {
    const result = await analyticsApi.exportData({
      ...commonQuery.value,
      dataset: 'summary',
      format: 'csv',
    })
    const url = URL.createObjectURL(result.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = result.filename
    link.click()
    URL.revokeObjectURL(url)
    operationTone.value = 'success'
    operationResult.value =
      result.rowCount === null
        ? `已导出 ${result.filename}`
        : `已导出 ${result.rowCount} 行 · ${result.filename}`
  } catch (reason) {
    operationTone.value = 'danger'
    operationResult.value = reason instanceof AdminApiError ? reason.message : '统计数据导出失败。'
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
    Object.assign(appliedScope, state)
    Object.assign(globalFilter, state)
    previousScopeKey = nextScopeKey
    if (scopeChanged) {
      summary.value = null
      trend.value = null
      groupRankings.value = null
      knowledgeRankings.value = null
      groupRankingsPage.value = 1
      knowledgeRankingsPage.value = 1
      reloadAll()
    }
  },
  { immediate: true },
)
</script>

<template>
  <main class="analytics-page">
    <header class="page-header">
      <div>
        <h1>统计概览</h1>
        <p>群聊、知识回复与入群审批的关键数据</p>
      </div>
      <div class="header-actions">
        <button
          type="button"
          class="icon-button"
          aria-label="刷新统计"
          title="刷新统计"
          @click="reloadAll"
        >
          <RefreshCw :class="{ spin: summaryLoading || trendLoading }" :size="17" />
        </button>
        <button
          v-if="auth.hasPermission('analytics:export')"
          data-test="export-analytics"
          type="button"
          class="export-button"
          :disabled="exporting"
          @click="exportAnalytics"
        >
          <Download :class="{ spin: exporting }" :size="17" />
          {{ exporting ? '导出中' : '导出概览' }}
        </button>
      </div>
    </header>

    <OperationNotice
      :message="operationResult"
      :tone="operationTone"
      :revision="operationResult"
      @close="operationResult = ''"
    />

    <form data-test="analytics-filters" class="analytics-filters" @submit.prevent="applyFilters">
      <div class="filter-field filter-field--preset">
        <span>快捷范围</span>
        <div class="range-presets" aria-label="快捷日期范围">
          <button
            data-test="range-preset-7"
            type="button"
            :class="{ active: activePreset === 7 }"
            @click="applyPreset(7)"
          >
            近 7 天
          </button>
          <button
            data-test="range-preset-30"
            type="button"
            :class="{ active: activePreset === 30 }"
            @click="applyPreset(30)"
          >
            近 30 天
          </button>
        </div>
      </div>
      <div class="filter-field filter-field--date-range">
        <span>自定义日期</span>
        <div class="date-range-inputs">
          <label
            ><span class="sr-only">开始日期</span
            ><input v-model="globalFilter.from" name="from" type="date" required
          /></label>
          <i aria-hidden="true">至</i>
          <label
            ><span class="sr-only">结束日期</span
            ><input v-model="globalFilter.to" name="to" type="date" required
          /></label>
        </div>
      </div>
      <label class="filter-field filter-field--group">
        <span>群号</span>
        <input
          v-model.trim="globalFilter.groupId"
          name="group_id"
          inputmode="numeric"
          placeholder="全部群"
        />
      </label>
      <div class="filter-actions">
        <button class="filter-submit" type="submit"><Search :size="16" />查询</button>
        <button
          class="filter-reset"
          type="button"
          aria-label="清除筛选"
          title="清除筛选"
          @click="resetFilters"
        >
          <FilterX :size="16" />
        </button>
      </div>
    </form>

    <ResourceState
      v-if="summaryLoading && !summary"
      state="loading"
      title="正在汇总统计"
      description="正在读取关键业务数据…"
    />
    <ResourceState
      v-else-if="summaryError && !summary"
      state="error"
      title="统计读取失败"
      @retry="reloadAll"
    />

    <template v-else-if="summary">
      <div v-if="summaryError" class="stale-state">
        <RefreshCw :size="15" />刷新失败，继续显示上一次数据
      </div>
      <AnalyticsMetricBoard :metrics="summary.metrics" :revision="summaryRevision" />

      <section v-smooth-resize class="trend-section analytics-card">
        <header>
          <div>
            <h2>群消息趋势</h2>
            <p>{{ trend?.granularity === 'hour' ? '按小时' : '按日' }}汇总当前范围内的群消息</p>
          </div>
          <TrendingUp :size="18" aria-hidden="true" />
        </header>
        <div v-rise-on-change="trendRevision" class="analysis-content">
          <div v-if="trendError" class="analysis-state analysis-state--error">
            <span>趋势数据刷新失败。</span><button type="button" @click="loadTrend">重试</button>
          </div>
          <div v-else-if="trendLoading" class="analysis-state">
            <RefreshCw :size="14" />正在更新趋势
          </div>
          <AnalyticsTrendChart v-if="trend" :series="trend.series" />
        </div>
      </section>

      <section class="ranking-grid" aria-label="业务排行">
        <section v-smooth-resize class="ranking-section analytics-card">
          <header>
            <div>
              <h2>活跃群聊</h2>
              <p>按群消息量排列当前范围内的群聊</p>
            </div>
            <MessageSquareText :size="18" aria-hidden="true" />
          </header>
          <div v-rise-on-change="groupRankingsRevision" class="analysis-content" :class="{ 'analysis-content--loading': groupRankingsLoading && groupRankings }">
            <div v-if="groupRankingsError" class="analysis-state analysis-state--error">
              <span>群聊排行刷新失败。</span
              ><button type="button" @click="() => loadGroupRankings()">重试</button>
            </div>
            <div v-else-if="groupRankingsLoading" class="analysis-state">
              <RefreshCw :size="14" />正在更新排行
            </div>
            <RankingTable
              v-if="groupRankings"
              :rankings="groupRankings"
              empty-label="当前范围暂无群消息"
            />
          </div>
          <CursorPager
            v-if="groupRankings"
            :page-number="groupRankingsPage"
            :total-pages="groupRankingPages"
            :total-items="groupRankings.total_count"
            :busy="groupRankingsLoading"
            @page="goToGroupRankingPage"
          />
        </section>

        <section v-smooth-resize class="ranking-section analytics-card">
          <header>
            <div>
              <h2>热门知识词条</h2>
              <p>按关键词回复与 AI 检索总次数排列</p>
            </div>
            <BookOpenCheck :size="18" aria-hidden="true" />
          </header>
          <div v-rise-on-change="knowledgeRankingsRevision" class="analysis-content" :class="{ 'analysis-content--loading': knowledgeRankingsLoading && knowledgeRankings }">
            <div v-if="knowledgeRankingsError" class="analysis-state analysis-state--error">
              <span>词条排行刷新失败。</span
              ><button type="button" @click="() => loadKnowledgeRankings()">重试</button>
            </div>
            <div v-else-if="knowledgeRankingsLoading" class="analysis-state">
              <RefreshCw :size="14" />正在更新排行
            </div>
            <RankingTable
              v-if="knowledgeRankings"
              :rankings="knowledgeRankings"
              :show-key="false"
              empty-label="当前范围暂无知识命中"
            />
          </div>
          <CursorPager
            v-if="knowledgeRankings"
            :page-number="knowledgeRankingsPage"
            :total-pages="knowledgeRankingPages"
            :total-items="knowledgeRankings.total_count"
            :busy="knowledgeRankingsLoading"
            @page="goToKnowledgeRankingPage"
          />
        </section>
      </section>

      <footer class="data-freshness">
        数据更新于 {{ timeFormatter.format(new Date(summary.data_fresh_at)) }}
        <span
          v-if="summaryLoading || trendLoading || groupRankingsLoading || knowledgeRankingsLoading"
        >
          · 正在刷新</span
        >
      </footer>
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
.header-actions,
.export-button,
.stale-state,
.date-range-inputs,
.filter-actions,
.filter-submit,
.trend-section > header,
.ranking-section > header,
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

.header-actions {
  flex: 0 0 auto;
  gap: 7px;
}

.icon-button,
.export-button {
  height: 36px;
  color: var(--color-brand-action);
  background: var(--color-surface);
  border: 1px solid var(--color-brand-border);
  border-radius: var(--radius-control);
}

.icon-button {
  display: grid;
  width: 38px;
  place-items: center;
  padding: 0;
}

.export-button {
  gap: 6px;
  padding-inline: 11px;
  color: white;
  font-weight: 600;
  background: var(--color-brand-action);
  border-color: var(--color-brand-action);
}

.icon-button:hover:not(:disabled) {
  background: var(--color-brand-surface);
}

.export-button:hover:not(:disabled) {
  background: var(--color-brand-action-hover);
  border-color: var(--color-brand-action-hover);
}

.stale-state {
  gap: 7px;
  padding: 9px 11px;
  color: var(--color-warning);
  font-size: 11px;
  background: var(--color-warning-surface);
  border-left: 3px solid var(--color-warning);
}

.analytics-filters {
  display: grid;
  grid-template-columns: auto minmax(280px, 1fr) minmax(150px, 0.45fr) auto;
  align-items: end;
  gap: 10px;
  padding: 12px 0;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}

.filter-field {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.filter-field > span {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.range-presets {
  display: grid;
  grid-template-columns: repeat(2, auto);
  height: 36px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}

.range-presets button {
  min-width: 70px;
  padding-inline: 10px;
  color: var(--color-text-secondary);
  background: var(--color-surface);
  border: 0;
}

.range-presets button + button {
  border-left: 1px solid var(--color-border);
}

.range-presets button.active {
  color: var(--color-brand-action);
  background: var(--color-brand-surface);
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
  gap: 6px;
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

.trend-section > header > svg,
.ranking-section > header > svg {
  margin-top: 3px;
  color: var(--color-brand-action);
}

.ranking-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.analysis-content {
  min-width: 0;
}

.analysis-content--loading {
  pointer-events: none;
  opacity: 0.62;
  transition: opacity var(--duration-fast) ease;
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

@media (max-width: 1080px) {
  .analytics-filters {
    grid-template-columns: auto minmax(260px, 1fr) auto;
  }

  .filter-field--group {
    grid-column: 1 / 3;
  }
}

@media (max-width: 760px) {
  .page-header {
    align-items: stretch;
    flex-direction: column;
  }

  .header-actions {
    justify-content: flex-end;
  }

  .analytics-filters {
    grid-template-columns: minmax(0, 1fr);
  }

  .filter-field--group {
    grid-column: auto;
  }

  .filter-actions {
    justify-content: stretch;
  }

  .filter-submit {
    flex: 1 1 auto;
    justify-content: center;
  }

  .ranking-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .data-freshness {
    text-align: left;
  }
}

@media (max-width: 420px) {
  .date-range-inputs {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .date-range-inputs i {
    display: none;
  }

  .range-presets,
  .range-presets button {
    width: 100%;
  }
}
</style>
