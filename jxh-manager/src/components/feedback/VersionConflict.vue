<script setup lang="ts">
import { GitCompareArrows, RefreshCw, TriangleAlert } from '@lucide/vue'

withDefaults(
  defineProps<{
    loadedVersion: number
    serverVersion?: number | null
    comparing?: boolean
  }>(),
  { serverVersion: null, comparing: false },
)

const emit = defineEmits<{ compare: []; reload: [] }>()
</script>

<template>
  <section class="version-conflict" role="alert">
    <TriangleAlert :size="20" aria-hidden="true" />
    <div>
      <strong>设置已被其他管理员更新</strong>
      <p>你的未提交内容仍保留。读取服务器版本进行比较，或放弃草稿并重新载入。</p>
      <p class="version-line mono">
        已载入版本 {{ loadedVersion }}<template v-if="serverVersion !== null"> · 服务器版本 {{ serverVersion }}</template>
      </p>
      <slot />
      <div class="conflict-actions">
        <button data-test="compare-settings" type="button" :disabled="comparing" @click="emit('compare')">
          <GitCompareArrows :size="16" aria-hidden="true" />
          {{ comparing ? '正在读取' : '读取服务器版本' }}
        </button>
        <button type="button" @click="emit('reload')">
          <RefreshCw :size="16" aria-hidden="true" />
          放弃草稿并重新载入
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.version-conflict {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 10px;
  padding: 12px 14px;
  color: var(--color-warning);
  background: var(--color-warning-surface);
  border-left: 3px solid var(--color-warning);
}

.version-conflict strong {
  color: var(--color-text-primary);
  font-size: 14px;
}

.version-conflict p {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.version-line {
  font-size: 10px;
}

.conflict-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.conflict-actions button {
  display: flex;
  min-height: 34px;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  color: var(--color-warning);
  font-size: 12px;
  font-weight: 600;
  background: var(--color-surface);
  border: 1px solid currentcolor;
  border-radius: var(--radius-control);
}
</style>
