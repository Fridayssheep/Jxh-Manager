<script setup lang="ts">
import { computed } from 'vue'

import type { AnalyticsRankings, AnalyticsUnit } from '@/api/types'

const props = withDefaults(
  defineProps<{ rankings: AnalyticsRankings | null; showKey?: boolean; emptyLabel?: string }>(),
  { showKey: true, emptyLabel: '当前范围暂无排行数据' },
)
const maximum = computed(() =>
  Math.max(1, ...(props.rankings?.items.map((item) => item.value) ?? [])),
)
const formatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 })

function formatValue(value: number, unit: AnalyticsUnit): string {
  if (unit === 'percent') return `${formatter.format(value)}%`
  if (unit === 'milliseconds') return `${formatter.format(value)} ms`
  return formatter.format(value)
}
</script>

<template>
  <div v-if="rankings?.items.length" class="ranking-table" role="table" aria-label="统计排行">
    <div class="ranking-heading" role="row">
      <span>排名</span><span>对象</span><span>数值</span>
    </div>
    <div v-for="item in rankings.items" :key="item.key" class="ranking-row" role="row">
      <strong class="rank mono">{{ String(item.rank).padStart(2, '0') }}</strong>
      <div class="ranking-identity">
        <strong>{{ item.display_name }}</strong>
        <span v-if="showKey && item.key !== item.display_name" class="mono">{{ item.key }}</span>
        <i aria-hidden="true"><b :style="{ width: `${(item.value / maximum) * 100}%` }" /></i>
      </div>
      <strong class="ranking-value mono">{{ formatValue(item.value, rankings.unit) }}</strong>
    </div>
  </div>
  <div v-else class="ranking-empty">{{ emptyLabel }}</div>
</template>

<style scoped>
.ranking-table {
  border-top: 1px solid var(--color-border);
}
.ranking-heading,
.ranking-row {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}
.ranking-heading {
  min-height: 34px;
  color: var(--color-text-secondary);
  font-size: 10px;
}
.ranking-row {
  min-height: 58px;
  border-top: 1px solid var(--color-border);
}
.rank {
  color: var(--color-brand-action);
  font-size: 12px;
}
.ranking-identity {
  display: grid;
  min-width: 0;
}
.ranking-identity > strong {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ranking-identity > span {
  color: var(--color-text-secondary);
  font-size: 9px;
}
.ranking-identity i {
  height: 3px;
  margin-top: 5px;
  overflow: hidden;
  background: var(--color-surface-subtle);
}
.ranking-identity b {
  display: block;
  height: 100%;
  background: var(--color-brand-500);
}
.ranking-value {
  font-size: 12px;
  text-align: right;
}
.ranking-empty {
  display: grid;
  min-height: 180px;
  place-items: center;
  color: var(--color-text-secondary);
}
</style>
