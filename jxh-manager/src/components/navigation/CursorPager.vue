<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'

defineProps<{
  pageNumber: number
  hasPrevious: boolean
  hasNext: boolean
  busy: boolean
}>()

const emit = defineEmits<{ previous: []; next: [] }>()
</script>

<template>
  <nav data-test="cursor-pager" class="cursor-pager" aria-label="游标分页">
    <button
      data-test="cursor-previous"
      type="button"
      :disabled="busy || !hasPrevious"
      @click="emit('previous')"
    >
      <ChevronLeft :size="16" aria-hidden="true" />
      上一页
    </button>
    <span class="mono" aria-live="polite">第 {{ pageNumber }} 页</span>
    <button
      data-test="cursor-next"
      type="button"
      :disabled="busy || !hasNext"
      @click="emit('next')"
    >
      下一页
      <ChevronRight :size="16" aria-hidden="true" />
    </button>
  </nav>
</template>

<style scoped>
.cursor-pager {
  display: grid;
  min-height: 48px;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
}

.cursor-pager > span {
  color: var(--color-text-secondary);
  font-size: 10px;
  white-space: nowrap;
}

.cursor-pager button {
  display: flex;
  width: fit-content;
  min-width: 88px;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 9px;
  color: var(--color-brand-action);
  font-size: 12px;
  font-weight: 600;
  background: var(--color-surface);
  border: 1px solid var(--color-brand-border);
  border-radius: var(--radius-control);
}

.cursor-pager button:last-child { justify-self: end; }

.cursor-pager button:disabled {
  color: var(--color-text-disabled);
  background: var(--color-surface-subtle);
  border-color: var(--color-border);
}

@media (max-width: 420px) {
  .cursor-pager { gap: 6px; padding-inline: 8px; }
  .cursor-pager button { min-width: 76px; padding-inline: 7px; }
}
</style>
