<script setup lang="ts">
import { computed } from 'vue'
import { Bot, MessageSquareText, ShieldCheck, UsersRound } from '@lucide/vue'

import type { AnalyticsMetric, AnalyticsMetricKey } from '@/api/types'

const props = defineProps<{ metrics: AnalyticsMetric[] }>()

const numberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 })
const integerFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 })

const metricMap = computed(
  () => new Map<AnalyticsMetricKey, AnalyticsMetric>(props.metrics.map((metric) => [metric.key, metric])),
)

const kpiDefinitions = [
  { key: 'group_message_count', label: '群消息量', icon: MessageSquareText },
  { key: 'active_user_count', label: '活跃用户', icon: UsersRound },
  { key: 'ai_success_rate', label: 'AI 成功率', icon: Bot },
] as const

const metricGroups: { title: string; keys: AnalyticsMetricKey[] }[] = [
  {
    title: '互动触达',
    keys: ['keyword_reply_count', 'ai_request_count', 'command_run_count', 'link_clean_count'],
  },
  {
    title: '审批自动化',
    keys: [
      'join_request_count',
      'automatic_approval_count',
      'manual_approval_count',
      'scheduled_job_run_count',
    ],
  },
  {
    title: '服务质量',
    keys: [
      'ai_duration_ms',
      'quote_success_count',
      'quote_fallback_count',
      'quote_failure_count',
    ],
  },
]

const automaticApproval = computed(() => metricMap.value.get('automatic_approval_count'))
const manualApproval = computed(() => metricMap.value.get('manual_approval_count'))

const automaticApprovalShare = computed<number | null>(() => {
  const automatic = automaticApproval.value
  const manual = manualApproval.value

  if (
    !automatic?.available ||
    !manual?.available ||
    automatic.value === null ||
    manual.value === null
  ) {
    return null
  }

  const total = automatic.value + manual.value
  return total > 0 ? (automatic.value / total) * 100 : null
})

const automaticApprovalDetail = computed(() => {
  const automatic = automaticApproval.value
  const manual = manualApproval.value

  if (
    !automatic?.available ||
    !manual?.available ||
    automatic.value === null ||
    manual.value === null
  ) {
    return '审批数据暂不可用'
  }

  return `${integerFormatter.format(automatic.value)} 自动 / ${integerFormatter.format(manual.value)} 人工`
})

function formatValue(metric: AnalyticsMetric | undefined): string {
  if (!metric?.available || metric.value === null) return '—'
  if (metric.unit === 'percent') return `${numberFormatter.format(metric.value)}%`
  if (metric.unit === 'milliseconds') return `${numberFormatter.format(metric.value)} ms`
  return numberFormatter.format(metric.value)
}

function formatChange(metric: AnalyticsMetric | undefined): string {
  if (!metric?.available) return '暂不可用'
  if (metric.change_percent === null) return '暂无前期数据'
  const prefix = metric.change_percent > 0 ? '+' : ''
  return `较前期 ${prefix}${numberFormatter.format(metric.change_percent)}%`
}
</script>

<template>
  <section class="analytics-metric-board" aria-label="统计指标">
    <div class="analytics-core-metrics" data-test="analytics-core-metrics">
      <article
        v-for="definition in kpiDefinitions"
        :key="definition.key"
        class="analytics-kpi"
        :class="`analytics-kpi--${definition.key}`"
        :data-test="`analytics-kpi-${definition.key}`"
      >
        <header>
          <span>{{ definition.label }}</span>
          <component :is="definition.icon" :size="17" :stroke-width="1.8" aria-hidden="true" />
        </header>
        <strong class="analytics-kpi__value mono">
          {{ formatValue(metricMap.get(definition.key)) }}
        </strong>
        <footer
          :class="{
            negative: (metricMap.get(definition.key)?.change_percent ?? 0) < 0,
          }"
        >
          {{ formatChange(metricMap.get(definition.key)) }}
        </footer>
      </article>

      <article
        class="analytics-kpi analytics-kpi--automatic-approval"
        data-test="analytics-kpi-automatic_approval_share"
      >
        <header>
          <span>自动审批占比</span>
          <ShieldCheck :size="17" :stroke-width="1.8" aria-hidden="true" />
        </header>
        <strong class="analytics-kpi__value mono">
          {{ automaticApprovalShare === null ? '—' : `${numberFormatter.format(automaticApprovalShare)}%` }}
        </strong>
        <footer>{{ automaticApprovalDetail }}</footer>
      </article>
    </div>

    <div class="analytics-metric-groups">
      <section
        v-for="group in metricGroups"
        :key="group.title"
        class="analytics-metric-group"
        data-test="analytics-metric-group"
      >
        <header class="analytics-metric-group__header">
          <h2>{{ group.title }}</h2>
          <span>当前值 / 前期变化</span>
        </header>
        <div class="analytics-metric-list">
          <div
            v-for="key in group.keys"
            :key="key"
            class="analytics-metric-row"
            :data-test="`analytics-metric-row-${key}`"
          >
            <span>{{ metricMap.get(key)?.label ?? key }}</span>
            <strong class="mono">{{ formatValue(metricMap.get(key)) }}</strong>
            <small
              :class="{
                negative: (metricMap.get(key)?.change_percent ?? 0) < 0,
              }"
            >
              {{ formatChange(metricMap.get(key)) }}
            </small>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.analytics-metric-board {
  display: grid;
  gap: 12px;
}

.analytics-core-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.analytics-kpi {
  position: relative;
  display: grid;
  min-width: 0;
  height: 104px;
  align-content: space-between;
  padding: var(--space-card);
  overflow: hidden;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.analytics-kpi::before {
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  content: '';
  background: var(--color-brand-500);
}

.analytics-kpi--active_user_count::before {
  background: var(--color-info);
}

.analytics-kpi--ai_success_rate::before {
  background: var(--color-success);
}

.analytics-kpi--automatic-approval::before {
  background: var(--color-warning);
}

.analytics-kpi header,
.analytics-kpi footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.analytics-kpi header > span,
.analytics-kpi footer {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.analytics-kpi footer:not(.negative) {
  color: var(--color-success);
}

.analytics-kpi footer.negative {
  color: var(--color-warning);
}

.analytics-kpi__value {
  overflow: hidden;
  font-size: 24px;
  font-weight: 650;
  line-height: 30px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.analytics-metric-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.analytics-metric-group {
  min-width: 0;
  padding: var(--space-card);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.analytics-metric-group__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border);
}

.analytics-metric-group__header h2 {
  font-size: 14px;
  line-height: 22px;
}

.analytics-metric-group__header span {
  color: var(--color-text-secondary);
  font-size: 10px;
  white-space: nowrap;
}

.analytics-metric-list {
  display: grid;
}

.analytics-metric-row {
  display: grid;
  min-height: 48px;
  grid-template-columns: minmax(0, 1fr) auto;
  align-content: center;
  column-gap: 12px;
  border-bottom: 1px solid var(--color-border);
}

.analytics-metric-row:last-child {
  border-bottom: 0;
}

.analytics-metric-row > span {
  grid-row: 1 / span 2;
  align-self: center;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.analytics-metric-row strong,
.analytics-metric-row small {
  text-align: right;
}

.analytics-metric-row strong {
  font-size: 13px;
  line-height: 18px;
}

.analytics-metric-row small {
  color: var(--color-success);
  font-size: 10px;
  line-height: 15px;
}

.analytics-metric-row small.negative {
  color: var(--color-warning);
}

@media (max-width: 900px) {
  .analytics-core-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .analytics-core-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
