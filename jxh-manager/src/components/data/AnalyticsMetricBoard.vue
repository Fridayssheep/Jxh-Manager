<script setup lang="ts">
import { computed } from 'vue'
import {
  Bot,
  BookOpenCheck,
  MessageSquareText,
  ShieldCheck,
  UserRoundPlus,
  UsersRound,
} from '@lucide/vue'

import type { AnalyticsMetric, AnalyticsMetricKey } from '@/api/types'
import { vRiseOnChange } from '@/directives/motion'

const props = withDefaults(defineProps<{ metrics: AnalyticsMetric[]; revision?: number }>(), {
  revision: 0,
})

const numberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 })
const integerFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 })

const metricMap = computed(
  () =>
    new Map<AnalyticsMetricKey, AnalyticsMetric>(
      props.metrics.map((metric) => [metric.key, metric]),
    ),
)

const kpiDefinitions = [
  { key: 'group_message_count', label: '群消息', icon: MessageSquareText, tone: 'brand' },
  { key: 'active_user_count', label: '活跃用户', icon: UsersRound, tone: 'info' },
  { key: 'keyword_reply_count', label: '关键词回复', icon: BookOpenCheck, tone: 'success' },
  { key: 'ai_request_count', label: 'AI 请求', icon: Bot, tone: 'warning' },
  { key: 'join_request_count', label: '入群申请', icon: UserRoundPlus, tone: 'info' },
] as const

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
  <section
    class="analytics-core-metrics"
    data-test="analytics-core-metrics"
    aria-label="核心统计指标"
  >
    <article
      v-for="definition in kpiDefinitions"
      :key="definition.key"
      class="analytics-kpi"
      :class="`analytics-kpi--${definition.tone}`"
      :data-test="`analytics-kpi-${definition.key}`"
    >
      <div v-rise-on-change="revision" class="analytics-kpi__content">
        <header>
          <span>{{ definition.label }}</span>
          <component :is="definition.icon" :size="17" :stroke-width="1.8" aria-hidden="true" />
        </header>
        <strong class="analytics-kpi__value mono">{{
          formatValue(metricMap.get(definition.key))
        }}</strong>
        <footer :class="{ negative: (metricMap.get(definition.key)?.change_percent ?? 0) < 0 }">
          {{ formatChange(metricMap.get(definition.key)) }}
        </footer>
      </div>
    </article>

    <article
      class="analytics-kpi analytics-kpi--approval"
      data-test="analytics-kpi-automatic_approval_share"
    >
      <div v-rise-on-change="revision" class="analytics-kpi__content">
        <header>
          <span>自动审批占比</span>
          <ShieldCheck :size="17" :stroke-width="1.8" aria-hidden="true" />
        </header>
        <strong class="analytics-kpi__value mono">
          {{
            automaticApprovalShare === null
              ? '—'
              : `${numberFormatter.format(automaticApprovalShare)}%`
          }}
        </strong>
        <footer>{{ automaticApprovalDetail }}</footer>
      </div>
    </article>
  </section>
</template>

<style scoped>
.analytics-core-metrics {
  display: grid;
  grid-template-columns: repeat(6, minmax(128px, 1fr));
  gap: 10px;
}

.analytics-kpi {
  position: relative;
  display: grid;
  min-width: 0;
  height: 108px;
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

.analytics-kpi--info::before {
  background: var(--color-info);
}

.analytics-kpi--success::before {
  background: var(--color-success);
}

.analytics-kpi--warning::before,
.analytics-kpi--approval::before {
  background: var(--color-warning);
}

.analytics-kpi__content {
  display: grid;
  height: 100%;
  align-content: space-between;
}

.analytics-kpi header,
.analytics-kpi footer {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.analytics-kpi header span,
.analytics-kpi footer {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.analytics-kpi footer:not(.negative) {
  color: var(--color-success);
}

.analytics-kpi--approval footer {
  color: var(--color-text-secondary);
}

.analytics-kpi footer.negative {
  color: var(--color-warning);
}

.analytics-kpi__value {
  overflow: hidden;
  font-size: 23px;
  font-weight: 650;
  line-height: 30px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1180px) {
  .analytics-core-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .analytics-core-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 380px) {
  .analytics-core-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
