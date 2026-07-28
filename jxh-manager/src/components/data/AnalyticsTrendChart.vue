<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChartNoAxesCombined, Table2 } from '@lucide/vue'

import type { AnalyticsSeries, AnalyticsUnit } from '@/api/types'

const props = defineProps<{ series: AnalyticsSeries[] }>()
const view = ref<'chart' | 'table'>('chart')
const width = 720
const height = 240
const padding = { left: 42, right: 18, top: 16, bottom: 34 }
const tones = ['brand', 'info', 'success', 'warning'] as const

const buckets = computed(() => {
  const values = new Set<string>()
  props.series.forEach((item) => item.points.forEach((point) => values.add(point.bucket_start)))
  return [...values].sort()
})

const maximum = computed(() => {
  const values = props.series.flatMap((item) =>
    item.points.flatMap((point) => (point.value === null ? [] : [point.value])),
  )
  return Math.max(1, ...values)
})

const chartSeries = computed(() =>
  props.series.slice(0, 4).map((series, seriesIndex) => {
    const points = buckets.value.map((bucket, index) => {
      const source = series.points.find((point) => point.bucket_start === bucket)
      const drawableWidth = width - padding.left - padding.right
      const drawableHeight = height - padding.top - padding.bottom
      return {
        bucket,
        value: source?.value ?? null,
        x: padding.left + (buckets.value.length <= 1
          ? drawableWidth / 2
          : (index / (buckets.value.length - 1)) * drawableWidth),
        y: source?.value === null || source?.value === undefined
          ? null
          : padding.top + drawableHeight - (source.value / maximum.value) * drawableHeight,
      }
    })
    return {
      ...series,
      tone: tones[seriesIndex] ?? 'brand',
      points,
      polyline: points.filter((point) => point.y !== null).map((point) => `${point.x},${point.y}`).join(' '),
    }
  }),
)

const dateFormatter = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' })
const numberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 })

function formatValue(value: number | null, unit: AnalyticsUnit): string {
  if (value === null) return '—'
  if (unit === 'percent') return `${numberFormatter.format(value)}%`
  if (unit === 'milliseconds') return `${numberFormatter.format(value)} ms`
  return numberFormatter.format(value)
}

function valueAt(metric: AnalyticsSeries['metric'], bucket: string): number | null {
  return props.series
    .find((series) => series.metric === metric)
    ?.points.find((point) => point.bucket_start === bucket)?.value ?? null
}
</script>

<template>
  <div class="analytics-trend">
    <div class="trend-toolbar">
      <div class="legend" aria-label="趋势图例">
        <span v-for="item in chartSeries" :key="item.metric" :class="`legend--${item.tone}`">
          <i aria-hidden="true" />{{ item.label }}
        </span>
      </div>
      <div class="view-switch" aria-label="趋势显示方式">
        <button type="button" :class="{ active: view === 'chart' }" aria-label="图表视图" @click="view = 'chart'">
          <ChartNoAxesCombined :size="15" />
        </button>
        <button type="button" :class="{ active: view === 'table' }" aria-label="表格视图" @click="view = 'table'">
          <Table2 :size="15" />
        </button>
      </div>
    </div>

    <svg v-if="view === 'chart' && buckets.length" :viewBox="`0 0 ${width} ${height}`" role="img" aria-label="统计趋势图" preserveAspectRatio="none">
      <line x1="42" y1="206" x2="702" y2="206" class="axis" />
      <line x1="42" y1="16" x2="42" y2="206" class="axis" />
      <line x1="42" y1="111" x2="702" y2="111" class="grid" />
      <g v-for="item in chartSeries" :key="item.metric" :class="`series series--${item.tone}`">
        <polyline v-if="item.polyline" :points="item.polyline" fill="none" vector-effect="non-scaling-stroke" />
        <circle v-for="point in item.points.filter((entry) => entry.y !== null)" :key="point.bucket" :cx="point.x" :cy="point.y!" r="3" vector-effect="non-scaling-stroke">
          <title>{{ item.label }} · {{ dateFormatter.format(new Date(point.bucket)) }} · {{ formatValue(point.value, item.unit) }}</title>
        </circle>
      </g>
      <text x="5" y="22">{{ numberFormatter.format(maximum) }}</text>
      <text x="28" y="210">0</text>
      <text v-if="buckets[0]" x="42" y="232">{{ dateFormatter.format(new Date(buckets[0])) }}</text>
      <text v-if="buckets[buckets.length - 1]" x="702" y="232" text-anchor="end">{{ dateFormatter.format(new Date(buckets[buckets.length - 1]!)) }}</text>
    </svg>
    <div v-else-if="view === 'chart'" class="empty-chart">当前筛选范围暂无趋势数据</div>

    <div v-else class="trend-table-wrap">
      <table aria-label="统计趋势数据">
        <thead><tr><th>日期</th><th v-for="item in chartSeries" :key="item.metric">{{ item.label }}</th></tr></thead>
        <tbody>
          <tr v-for="bucket in buckets" :key="bucket">
            <th>{{ dateFormatter.format(new Date(bucket)) }}</th>
            <td v-for="item in chartSeries" :key="item.metric" class="mono">{{ formatValue(valueAt(item.metric, bucket), item.unit) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.analytics-trend{min-width:0}.trend-toolbar,.legend,.legend span,.view-switch{display:flex;align-items:center}.trend-toolbar{min-height:34px;justify-content:space-between;gap:12px}.legend{min-width:0;flex-wrap:wrap;gap:12px;color:var(--color-text-secondary);font-size:11px}.legend span{gap:5px}.legend i{width:13px;height:3px;background:var(--color-brand-action)}.legend--info i{background:var(--color-info)}.legend--success i{background:var(--color-success)}.legend--warning i{background:var(--color-warning)}.view-switch{flex:0 0 auto;border:1px solid var(--color-border);border-radius:var(--radius-control)}.view-switch button{display:grid;width:31px;height:29px;place-items:center;padding:0;color:var(--color-text-secondary);background:var(--color-surface);border:0}.view-switch button+button{border-left:1px solid var(--color-border)}.view-switch button.active{color:var(--color-brand-action);background:var(--color-brand-surface)}.analytics-trend>svg{width:100%;min-height:240px;aspect-ratio:720/240}.axis,.grid{stroke:var(--color-border);stroke-width:1}.grid{stroke-dasharray:4 5}.series polyline,.series circle{stroke:var(--color-brand-action);stroke-width:2;fill:var(--color-surface)}.series--info polyline,.series--info circle{stroke:var(--color-info)}.series--success polyline,.series--success circle{stroke:var(--color-success)}.series--warning polyline,.series--warning circle{stroke:var(--color-warning)}text{fill:var(--color-text-secondary);font-family:var(--font-mono);font-size:10px}.empty-chart{display:grid;min-height:240px;place-items:center;color:var(--color-text-secondary);background:var(--color-surface-subtle);border:1px dashed var(--color-border-strong)}.trend-table-wrap{max-height:260px;overflow:auto;border:1px solid var(--color-border)}table{width:100%;border-collapse:collapse;font-size:11px;text-align:right}th,td{padding:8px 10px;border-bottom:1px solid var(--color-border)}th:first-child{text-align:left}thead th{position:sticky;top:0;background:var(--color-surface-subtle)}
@media(max-width:620px){.trend-toolbar{align-items:flex-start}.legend{display:grid;grid-template-columns:1fr 1fr}.analytics-trend>svg{min-height:190px;aspect-ratio:390/220}}
</style>
