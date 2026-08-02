<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'

type PageToken = number | 'start-gap' | 'end-gap'

const props = defineProps<{
  pageNumber: number
  totalPages: number
  totalItems: number
  busy: boolean
}>()

const emit = defineEmits<{ page: [pageNumber: number] }>()

const pageTokens = computed<PageToken[]>(() => {
  const total = Math.max(0, props.totalPages)
  const current = Math.min(Math.max(1, props.pageNumber), Math.max(1, total))
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, 'end-gap', total]
  if (current >= total - 3) {
    return [1, 'start-gap', total - 4, total - 3, total - 2, total - 1, total]
  }
  return [1, 'start-gap', current - 1, current, current + 1, 'end-gap', total]
})

function goTo(pageNumber: number): void {
  if (
    props.busy ||
    pageNumber < 1 ||
    pageNumber > props.totalPages ||
    pageNumber === props.pageNumber
  ) {
    return
  }
  emit('page', pageNumber)
}
</script>

<template>
  <nav data-test="cursor-pager" class="cursor-pager" aria-label="分页导航">
    <p class="page-summary mono" aria-live="polite">
      <span v-if="totalPages">第 {{ pageNumber }} / {{ totalPages }} 页</span>
      <span v-else>共 0 页</span>
      <small>共 {{ totalItems }} 条</small>
    </p>

    <div class="page-controls">
      <button
        data-test="page-previous"
        class="page-arrow"
        type="button"
        title="上一页"
        aria-label="上一页"
        :disabled="busy || pageNumber <= 1"
        @click="goTo(pageNumber - 1)"
      >
        <ChevronLeft :size="16" aria-hidden="true" />
      </button>

      <template v-for="token in pageTokens" :key="token">
        <span v-if="typeof token !== 'number'" class="page-gap" aria-hidden="true">…</span>
        <button
          v-else
          :data-test="`page-${token}`"
          class="page-number mono"
          :class="{ 'page-number--active': token === pageNumber }"
          type="button"
          :aria-label="`第 ${token} 页`"
          :aria-current="token === pageNumber ? 'page' : undefined"
          :disabled="busy || token === pageNumber"
          @click="goTo(token)"
        >
          {{ token }}
        </button>
      </template>

      <button
        data-test="page-next"
        class="page-arrow"
        type="button"
        title="下一页"
        aria-label="下一页"
        :disabled="busy || totalPages === 0 || pageNumber >= totalPages"
        @click="goTo(pageNumber + 1)"
      >
        <ChevronRight :size="16" aria-hidden="true" />
      </button>
    </div>
  </nav>
</template>

<style scoped>
.cursor-pager {
  display: flex;
  min-height: 52px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 10px;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
}

.page-summary {
  display: grid;
  min-width: 92px;
  color: var(--color-text-primary);
  font-size: 10px;
  line-height: 1.35;
  white-space: nowrap;
}

.page-summary small {
  color: var(--color-text-secondary);
  font-size: 9px;
}

.page-controls {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

.page-controls button {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  place-items: center;
  padding: 0;
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 600;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  transition:
    color var(--duration-fast) ease,
    background-color var(--duration-fast) ease,
    border-color var(--duration-fast) ease,
    transform var(--duration-fast) ease;
}

.page-controls button:hover:not(:disabled) {
  color: var(--color-brand-action);
  background: var(--color-brand-surface);
  border-color: var(--color-brand-border);
  transform: translateY(-1px);
}

.page-controls .page-number--active {
  color: white;
  background: var(--color-brand-action);
  border-color: var(--color-brand-action);
}

.page-controls button:disabled:not(.page-number--active) {
  color: var(--color-text-disabled);
  background: var(--color-surface-subtle);
}

.page-gap {
  display: grid;
  width: 18px;
  height: 32px;
  flex: 0 0 18px;
  place-items: center;
  color: var(--color-text-secondary);
  font-size: 11px;
}

@media (max-width: 520px) {
  .cursor-pager {
    align-items: stretch;
    flex-direction: column;
    gap: 6px;
  }

  .page-summary {
    display: flex;
    justify-content: space-between;
  }

  .page-controls {
    justify-content: center;
  }

  .page-controls button {
    width: 30px;
    height: 30px;
    flex-basis: 30px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .page-controls button { transition-duration: 0.01ms; }
}
</style>
