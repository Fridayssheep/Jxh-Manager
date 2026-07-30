<script setup lang="ts">
import type { JoinRequestPolicyPatch } from '@/api/types'

const props = withDefaults(
  defineProps<{
    groupName: string
    enabled: boolean
    autoReject: boolean
    disabled?: boolean
    busy?: boolean
  }>(),
  {
    disabled: false,
    busy: false,
  },
)

const emit = defineEmits<{ change: [patch: JoinRequestPolicyPatch] }>()

function changeEnabled(event: Event): void {
  const input = event.target as HTMLInputElement
  emit('change', { enabled: input.checked })
  input.checked = props.enabled
}

function changeAutoReject(event: Event): void {
  const input = event.target as HTMLInputElement
  emit('change', { auto_reject: input.checked })
  input.checked = props.autoReject
}
</script>

<template>
  <fieldset
    class="join-policy-controls"
    :disabled="disabled || busy"
    :aria-busy="busy"
    :aria-label="`${groupName}自动审核`"
  >
    <label class="policy-toggle">
      <span>批准</span>
      <input
        data-test="join-policy-enabled"
        type="checkbox"
        :checked="enabled"
        :aria-label="`${groupName}自动批准`"
        @change="changeEnabled"
      />
      <i aria-hidden="true" />
    </label>
    <label class="policy-toggle">
      <span>拒绝</span>
      <input
        data-test="join-policy-auto-reject"
        type="checkbox"
        :checked="autoReject"
        :aria-label="`${groupName}自动拒绝`"
        @change="changeAutoReject"
      />
      <i aria-hidden="true" />
    </label>
  </fieldset>
</template>

<style scoped>
.join-policy-controls {
  display: flex;
  min-width: 0;
  gap: 5px;
  padding: 0;
  margin: 0;
  border: 0;
}

.policy-toggle {
  position: relative;
  display: grid;
  height: 30px;
  grid-template-columns: auto 26px;
  align-items: center;
  gap: 6px;
  padding: 0 7px;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  transition:
    color var(--duration-control) ease,
    background var(--duration-control) ease,
    border-color var(--duration-control) ease;
}

.policy-toggle:hover {
  color: var(--color-text-primary);
  border-color: var(--color-border-strong);
}

.policy-toggle input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
}

.policy-toggle i {
  position: relative;
  width: 26px;
  height: 14px;
  background: var(--color-border-strong);
  border-radius: 7px;
  transition: background var(--duration-control) ease;
}

.policy-toggle i::after {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  content: '';
  background: var(--color-surface);
  border-radius: 50%;
  box-shadow: 0 1px 2px rgb(34 37 36 / 24%);
  transition: transform var(--duration-control) cubic-bezier(0.2, 0.8, 0.2, 1);
}

.policy-toggle:has(input:checked) {
  color: var(--color-brand-ink);
  background: var(--color-brand-surface);
  border-color: var(--color-brand-border);
}

.policy-toggle input:checked + i {
  background: var(--color-brand-action);
}

.policy-toggle input:checked + i::after {
  transform: translateX(12px);
}

.policy-toggle:has(input:focus-visible) {
  outline: 2px solid var(--color-brand-action);
  outline-offset: 2px;
}

.join-policy-controls:disabled {
  opacity: 0.56;
}

.join-policy-controls:disabled .policy-toggle {
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .policy-toggle,
  .policy-toggle i,
  .policy-toggle i::after {
    transition-duration: 0.01ms;
  }
}
</style>
