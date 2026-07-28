<script setup lang="ts">
import { computed } from 'vue'
import { Activity, Bot, HeartPulse, MessageSquareText, UserRoundCheck, UsersRound } from '@lucide/vue'

import type { DashboardMetric } from '@/api/types'

const props = defineProps<{ metrics: DashboardMetric[] }>()

const icons = {
  pending_join_requests: UserRoundCheck,
  automatic_approvals_today: Bot,
  command_runs_today: MessageSquareText,
  active_groups: UsersRound,
  enabled_scheduled_jobs: Activity,
  healthy_dependencies: HeartPulse,
}

const primaryMetrics = computed(() => props.metrics.slice(0, 4))
const formatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 })

function formatValue(metric: DashboardMetric): string {
  return metric.available && metric.value !== null ? formatter.format(metric.value) : '—'
}
</script>

<template>
  <div class="metric-strip" aria-label="关键指标">
    <article
      v-for="metric in primaryMetrics"
      :key="metric.key"
      class="metric-item"
      :class="`metric-item--${metric.key}`"
    >
      <header>
        <span>{{ metric.label }}</span>
        <component :is="icons[metric.key]" :size="17" :stroke-width="1.8" aria-hidden="true" />
      </header>
      <div class="metric-value mono">{{ formatValue(metric) }}</div>
      <footer>
        <span v-if="!metric.available">暂不可用</span>
        <span v-else-if="metric.change_percent !== null" :class="{ negative: metric.change_percent < 0 }">
          {{ metric.change_percent > 0 ? '+' : '' }}{{ metric.change_percent }}%
        </span>
        <span v-else>当前值</span>
      </footer>
    </article>
  </div>
</template>

<style scoped>
.metric-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.metric-item {
  position: relative;
  display: grid;
  min-width: 0;
  height: 104px;
  align-content: space-between;
  padding: 13px 14px 12px;
  overflow: hidden;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.metric-item::before {
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  content: '';
  background: var(--color-brand-500);
}

.metric-item--pending_join_requests::before {
  background: var(--color-warning);
}

.metric-item--healthy_dependencies::before {
  background: var(--color-success);
}

.metric-item--active_groups::before {
  background: var(--color-info);
}

.metric-item header,
.metric-item footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.metric-item header > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-value {
  overflow: hidden;
  font-size: 24px;
  font-weight: 650;
  line-height: 30px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-item footer span:first-child:not(.negative) {
  color: var(--color-success);
}

.metric-item footer .negative {
  color: var(--color-warning);
}

@media (max-width: 900px) {
  .metric-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .metric-strip {
    grid-template-columns: 1fr;
  }
}
</style>
