<script setup lang="ts">
import { computed } from 'vue'

import type { OverviewTrendPoint } from '@/api/types'

const props = defineProps<{ points: OverviewTrendPoint[] }>()

const width = 720
const height = 220
const padding = { left: 30, right: 16, top: 18, bottom: 32 }
const palette = ['brand', 'info', 'success'] as const
const seriesLabels: Record<string, string> = {
  command_runs: '命令调用',
  join_requests: '入群申请',
  group_messages: '群消息',
  ai_requests: 'AI 请求',
}

const seriesKeys = computed(() => {
  const keys = new Set<string>()
  props.points.forEach((point) => Object.keys(point.values).forEach((key) => keys.add(key)))
  return [...keys].slice(0, 3)
})

const maximum = computed(() => {
  const values = props.points.flatMap((point) =>
    seriesKeys.value.map((key) => point.values[key] ?? 0),
  )
  return Math.max(1, ...values)
})

const lines = computed(() =>
  seriesKeys.value.map((key, seriesIndex) => {
    const points = props.points.map((point, index) => {
      const drawableWidth = width - padding.left - padding.right
      const drawableHeight = height - padding.top - padding.bottom
      const x =
        padding.left +
        (props.points.length <= 1 ? drawableWidth / 2 : (index / (props.points.length - 1)) * drawableWidth)
      const y = padding.top + drawableHeight - ((point.values[key] ?? 0) / maximum.value) * drawableHeight
      return { x, y, value: point.values[key] ?? 0 }
    })
    return {
      key,
      label: seriesLabels[key] ?? key,
      color: palette[seriesIndex] ?? 'brand',
      points,
      polyline: points.map((point) => `${point.x},${point.y}`).join(' '),
    }
  }),
)

const firstPoint = computed(() => props.points[0])
const lastPoint = computed(() => props.points[props.points.length - 1])
const dateFormatter = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' })
</script>

<template>
  <div class="trend-chart">
    <div v-if="lines.length" class="chart-legend" aria-label="图例">
      <span v-for="line in lines" :key="line.key" :class="`legend-${line.color}`">
        <i aria-hidden="true" />{{ line.label }}
      </span>
    </div>
    <svg
      v-if="points.length"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      aria-label="最近趋势"
      preserveAspectRatio="none"
    >
      <line x1="30" y1="188" x2="704" y2="188" class="axis" />
      <line x1="30" y1="18" x2="30" y2="188" class="axis" />
      <line x1="30" y1="103" x2="704" y2="103" class="grid-line" />
      <g v-for="line in lines" :key="line.key" :class="`series series--${line.color}`">
        <polyline :points="line.polyline" fill="none" vector-effect="non-scaling-stroke" />
        <circle
          v-for="point in line.points"
          :key="`${point.x}-${point.y}`"
          :cx="point.x"
          :cy="point.y"
          r="3"
          vector-effect="non-scaling-stroke"
        />
      </g>
      <text x="4" y="24">{{ maximum }}</text>
      <text x="18" y="192">0</text>
      <text v-if="firstPoint" x="30" y="212">{{ dateFormatter.format(new Date(firstPoint.bucket_start)) }}</text>
      <text v-if="lastPoint" x="704" y="212" text-anchor="end">
        {{ dateFormatter.format(new Date(lastPoint.bucket_start)) }}
      </text>
    </svg>
    <div v-else class="chart-empty">当前范围暂无趋势数据</div>

    <table class="sr-only" aria-label="最近趋势数据">
      <thead>
        <tr>
          <th>日期</th>
          <th v-for="key in seriesKeys" :key="key">{{ seriesLabels[key] ?? key }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="point in points" :key="point.bucket_start">
          <th>{{ dateFormatter.format(new Date(point.bucket_start)) }}</th>
          <td v-for="key in seriesKeys" :key="key">{{ point.values[key] ?? 0 }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.trend-chart {
  min-width: 0;
}

.chart-legend {
  display: flex;
  min-height: 28px;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.chart-legend span {
  display: flex;
  align-items: center;
  gap: 6px;
}

.chart-legend i {
  width: 14px;
  height: 3px;
  background: var(--color-brand-action);
}

.chart-legend .legend-info i {
  background: var(--color-info);
}

.chart-legend .legend-success i {
  background: var(--color-success);
}

svg {
  width: 100%;
  min-height: 220px;
  aspect-ratio: 720 / 220;
  overflow: visible;
}

.axis,
.grid-line {
  stroke: var(--color-border);
  stroke-width: 1;
}

.grid-line {
  stroke-dasharray: 4 5;
}

.series polyline,
.series circle {
  stroke: var(--color-brand-action);
  stroke-width: 2;
  fill: var(--color-surface);
}

.series--info polyline,
.series--info circle {
  stroke: var(--color-info);
}

.series--success polyline,
.series--success circle {
  stroke: var(--color-success);
}

text {
  fill: var(--color-text-secondary);
  font-family: var(--font-mono);
  font-size: 10px;
}

.chart-empty {
  display: grid;
  min-height: 220px;
  place-items: center;
  color: var(--color-text-secondary);
  background: var(--color-surface-subtle);
  border: 1px dashed var(--color-border-strong);
}
</style>
