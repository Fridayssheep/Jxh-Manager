<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { AlertCircle, ArrowUpRight, CheckCircle2, CircleHelp, Clock3 } from '@lucide/vue'

import MetricStrip from '@/components/data/MetricStrip.vue'
import TrendChart from '@/components/data/TrendChart.vue'
import ResourceState from '@/components/feedback/ResourceState.vue'
import AppSelect, { type AppSelectOption } from '@/components/form/AppSelect.vue'
import { subscribeToAdminEvents } from '@/composables/useAdminEvents'
import { useOverviewStore } from '@/stores/overview'

const overview = useOverviewStore()

const primaryMetrics = computed(() => overview.data?.metrics.slice(0, 4) ?? [])
const secondaryMetrics = computed(() => overview.data?.metrics.slice(4) ?? [])
const rangeOptions: readonly AppSelectOption[] = [
  { value: '7d', label: '最近 7 天' },
  { value: '30d', label: '最近 30 天' },
]

function setRange(value: string): void {
  overview.range = value as '7d' | '30d'
}

const pendingLinks = {
  join_requests: '/join-requests?decision_status=pending',
  failed_jobs: '/scheduled-jobs?result=failed',
  knowledge_conflicts: '/knowledge?tab=conflicts',
  degraded_dependencies: '/system',
}

const dependencyLabels = {
  mysql: 'MySQL',
  napcat: 'NapCat',
  wps: 'WPS',
  ai: 'AI',
  quote: '引用图',
  worker: '后台任务',
  scheduler: '调度器',
  telemetry: '统计管线',
}

const dependencyStatusLabels = {
  healthy: '健康',
  degraded: '降级',
  unavailable: '不可用',
  not_configured: '未配置',
  unknown: '未知',
}

const numberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 })
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function load(): void {
  void overview.load({ range: overview.range, groupId: overview.groupId })
}

const unsubscribe = subscribeToAdminEvents((event) => {
  if (
    event.event === 'overview.updated' ||
    event.event === 'join_request.created' ||
    event.event === 'join_request.updated' ||
    event.event === 'system.health_changed' ||
    event.event === 'stream.reset'
  ) {
    load()
  }
})

onMounted(load)
onBeforeUnmount(unsubscribe)
</script>

<template>
  <main class="overview-page">
    <header class="page-header">
      <div>
        <h1>总览</h1>
        <p>关注待处理事项、运行健康度与最近活动。</p>
      </div>
      <label class="range-control">
        <span class="sr-only">统计范围</span>
        <AppSelect
          :model-value="overview.range"
          :options="rangeOptions"
          accessible-name="统计范围"
          name="range"
          data-test="overview-range"
          @update:model-value="setRange"
          @change="load"
        />
      </label>
    </header>

    <ResourceState
      v-if="overview.loading && !overview.data"
      state="loading"
      title="正在读取总览"
      description="正在汇总审批、任务和依赖状态。"
    />
    <ResourceState
      v-else-if="overview.error && !overview.data"
      state="error"
      title="总览读取失败"
      description="现有数据未被替换，可以重新尝试读取。"
      @retry="load"
    />

    <template v-else-if="overview.data">
      <MetricStrip :metrics="primaryMetrics" />

      <section class="overview-workspace">
        <div class="trend-section overview-card">
          <header class="section-header">
            <div>
              <h2>最近趋势</h2>
              <p>按自然日聚合，不包含消息正文。</p>
            </div>
            <div v-if="secondaryMetrics.length" class="secondary-metrics">
              <div v-for="metric in secondaryMetrics" :key="metric.key">
                <span>{{ metric.label }}</span>
                <strong class="mono">
                  {{ metric.available && metric.value !== null ? numberFormatter.format(metric.value) : '—' }}
                </strong>
              </div>
            </div>
          </header>
          <TrendChart :points="overview.data.trend" />
        </div>

        <section class="pending-section overview-card">
          <header class="section-header">
            <div>
              <h2>需要处理</h2>
              <p>按影响程度排序的管理事项。</p>
            </div>
          </header>
          <div v-if="overview.data.pending_items.length" class="pending-list">
            <RouterLink
              v-for="item in overview.data.pending_items"
              :key="item.key"
              :to="pendingLinks[item.key]"
              class="pending-row"
              :class="`pending-row--${item.severity}`"
            >
              <AlertCircle v-if="item.severity === 'critical'" :size="18" aria-hidden="true" />
              <Clock3 v-else :size="18" aria-hidden="true" />
              <span>{{ item.label }}</span>
              <strong class="mono">{{ item.count }}</strong>
              <ArrowUpRight :size="16" aria-hidden="true" />
            </RouterLink>
          </div>
          <div v-else class="pending-empty">
            <CheckCircle2 :size="20" aria-hidden="true" />
            当前没有需要处理的事项
          </div>
        </section>
      </section>

      <section class="health-section overview-card">
        <header class="section-header">
          <div>
            <h2>系统健康</h2>
            <p>依赖状态来自最近一次服务端检查。</p>
          </div>
          <RouterLink to="/system">查看系统详情 <ArrowUpRight :size="15" aria-hidden="true" /></RouterLink>
        </header>
        <div class="dependency-grid">
          <article
            v-for="dependency in overview.data.dependencies"
            :key="dependency.key"
            :class="`dependency dependency--${dependency.status}`"
          >
            <CheckCircle2 v-if="dependency.status === 'healthy'" :size="18" aria-hidden="true" />
            <AlertCircle v-else-if="dependency.status === 'degraded' || dependency.status === 'unavailable'" :size="18" aria-hidden="true" />
            <CircleHelp v-else :size="18" aria-hidden="true" />
            <div>
              <strong>{{ dependencyLabels[dependency.key] }}</strong>
              <span v-if="dependency.last_success_at">
                最近成功 {{ timeFormatter.format(new Date(dependency.last_success_at)) }}
              </span>
              <span v-else>暂无成功记录</span>
            </div>
            <span class="status-label">{{ dependencyStatusLabels[dependency.status] }}</span>
          </article>
        </div>
      </section>

      <footer class="generated-time">
        数据生成于 {{ timeFormatter.format(new Date(overview.data.generated_at)) }}
        <span v-if="overview.loading"> · 正在更新</span>
      </footer>
    </template>
  </main>
</template>

<style scoped>
.overview-page {
  display: grid;
  gap: 18px;
}

.page-header,
.section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.page-header h1 {
  font-size: 24px;
  line-height: 34px;
}

.page-header p,
.section-header p {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.range-control select {
  height: 36px;
  padding: 0 32px 0 11px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}

.overview-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(300px, 0.85fr);
  gap: 12px;
}

.overview-card {
  min-width: 0;
  padding: var(--space-card);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.section-header h2 {
  font-size: 16px;
  line-height: 24px;
}

.secondary-metrics {
  display: flex;
  gap: 18px;
}

.secondary-metrics div {
  display: grid;
  text-align: right;
}

.secondary-metrics span {
  color: var(--color-text-secondary);
  font-size: 11px;
}

.secondary-metrics strong {
  font-size: 16px;
}

.pending-list {
  display: grid;
  margin-top: 14px;
  border-top: 1px solid var(--color-border);
}

.pending-row {
  display: grid;
  min-height: 48px;
  grid-template-columns: 18px minmax(0, 1fr) auto 16px;
  align-items: center;
  gap: 9px;
  color: var(--color-warning);
  border-bottom: 1px solid var(--color-border);
}

.pending-row:hover {
  background: var(--color-warning-surface);
}

.pending-row--critical {
  color: var(--color-danger);
}

.pending-row--critical:hover {
  background: var(--color-danger-surface);
}

.pending-row > span {
  color: var(--color-text-primary);
}

.pending-empty {
  display: flex;
  min-height: 128px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-success);
}

.health-section .section-header a {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--color-brand-action);
  font-size: 12px;
  font-weight: 600;
}

.dependency-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 12px;
  border-top: 1px solid var(--color-border);
  border-left: 1px solid var(--color-border);
}

.dependency {
  display: grid;
  min-width: 0;
  min-height: 70px;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 11px 12px;
  color: var(--color-unknown);
  border-right: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}

.dependency--healthy {
  color: var(--color-success);
}

.dependency--degraded {
  color: var(--color-warning);
}

.dependency--unavailable {
  color: var(--color-danger);
}

.dependency div {
  display: grid;
  min-width: 0;
}

.dependency strong {
  color: var(--color-text-primary);
  font-size: 13px;
}

.dependency div span {
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-label {
  padding: 2px 5px;
  font-size: 10px;
  background: var(--color-unknown-surface);
  border-radius: 8px;
}

.dependency--healthy .status-label {
  background: var(--color-success-surface);
}

.dependency--degraded .status-label {
  background: var(--color-warning-surface);
}

.dependency--unavailable .status-label {
  background: var(--color-danger-surface);
}

.generated-time {
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
  font-size: 10px;
  text-align: right;
}

@media (max-width: 1100px) {
  .overview-workspace {
    grid-template-columns: 1fr;
  }

  .dependency-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .page-header,
  .section-header {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .range-control select {
    width: 100%;
  }

  .secondary-metrics {
    justify-content: flex-start;
  }

  .secondary-metrics div {
    text-align: left;
  }

  .dependency-grid {
    grid-template-columns: 1fr;
  }
}
</style>
