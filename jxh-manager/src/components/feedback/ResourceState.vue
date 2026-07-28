<script setup lang="ts">
import { AlertTriangle, Inbox, LoaderCircle, RefreshCw } from '@lucide/vue'

withDefaults(
  defineProps<{
    state: 'loading' | 'error' | 'empty'
    title?: string
    description?: string
  }>(),
  {
    title: '',
    description: '',
  },
)

const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="resource-state" :class="`resource-state--${state}`" role="status">
    <LoaderCircle v-if="state === 'loading'" class="spin" :size="22" aria-hidden="true" />
    <AlertTriangle v-else-if="state === 'error'" :size="22" aria-hidden="true" />
    <Inbox v-else :size="22" aria-hidden="true" />
    <strong>{{ title || (state === 'loading' ? '正在读取数据' : state === 'error' ? '读取失败' : '暂无数据') }}</strong>
    <p v-if="description">{{ description }}</p>
    <button v-if="state === 'error'" type="button" @click="emit('retry')">
      <RefreshCw :size="16" aria-hidden="true" />
      重试
    </button>
  </div>
</template>

<style scoped>
.resource-state {
  display: grid;
  min-height: 220px;
  place-items: center;
  align-content: center;
  gap: 8px;
  padding: 32px;
  color: var(--color-text-secondary);
  text-align: center;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.resource-state--error > svg {
  color: var(--color-danger);
}

.resource-state strong {
  color: var(--color-text-primary);
  font-size: 15px;
}

.resource-state p {
  max-width: 520px;
  font-size: 13px;
}

.resource-state button {
  display: flex;
  height: 36px;
  align-items: center;
  gap: 7px;
  margin-top: 6px;
  padding: 0 12px;
  color: var(--color-brand-action);
  font-weight: 600;
  background: var(--color-surface);
  border: 1px solid var(--color-brand-border);
  border-radius: var(--radius-control);
}
</style>
