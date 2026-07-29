<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, CheckCircle2, CircleHelp, Info, X } from '@lucide/vue'

import { vRiseOnChange, vSmoothResize } from '@/directives/motion'

type NoticeTone = 'success' | 'warning' | 'danger' | 'unknown' | 'info'

const props = withDefaults(
  defineProps<{
    message: string
    tone?: NoticeTone
    revision?: unknown
    closable?: boolean
  }>(),
  {
    tone: 'success',
    revision: undefined,
    closable: true,
  },
)

const emit = defineEmits<{ close: [] }>()

const icon = computed(() => {
  if (props.tone === 'success') return CheckCircle2
  if (props.tone === 'unknown') return CircleHelp
  if (props.tone === 'info') return Info
  return AlertTriangle
})
const role = computed(() => (props.tone === 'success' || props.tone === 'info' ? 'status' : 'alert'))
const motionRevision = computed(() => props.revision ?? props.message)
</script>

<template>
  <Transition name="operation-notice" appear>
    <div
      v-if="message"
      v-smooth-resize
      v-rise-on-change="motionRevision"
      :class="['operation-notice', `operation-notice--${tone}`]"
      :role="role"
    >
      <component :is="icon" :size="18" aria-hidden="true" />
      <span class="operation-notice__message">{{ message }}</span>
      <button
        v-if="closable"
        data-test="close-operation-notice"
        type="button"
        aria-label="关闭提示"
        @click="emit('close')"
      >
        <X :size="15" aria-hidden="true" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.operation-notice {
  display: grid;
  min-width: 0;
  min-height: 42px;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 8px 11px;
  font-size: 12px;
  border-left: 3px solid currentcolor;
}

.operation-notice__message {
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: normal;
}

.operation-notice button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  padding: 0;
  color: currentcolor;
  background: transparent;
  border: 0;
}

.operation-notice--success {
  color: var(--color-success);
  background: var(--color-success-surface);
}

.operation-notice--warning {
  color: var(--color-warning);
  background: var(--color-warning-surface);
}

.operation-notice--danger {
  color: var(--color-danger);
  background: var(--color-danger-surface);
}

.operation-notice--unknown {
  color: var(--color-unknown);
  background: var(--color-unknown-surface);
}

.operation-notice--info {
  color: var(--color-info);
  background: var(--color-info-surface);
}

.operation-notice-enter-active,
.operation-notice-leave-active {
  transition:
    opacity var(--duration-overlay) ease,
    transform var(--duration-overlay) cubic-bezier(0.2, 0.8, 0.2, 1);
}

.operation-notice-enter-from,
.operation-notice-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (prefers-reduced-motion: reduce) {
  .operation-notice-enter-active,
  .operation-notice-leave-active {
    transition-duration: 0.01ms;
  }

  .operation-notice-enter-from,
  .operation-notice-leave-to {
    transform: none;
  }
}
</style>
