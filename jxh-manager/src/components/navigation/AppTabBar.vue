<script setup lang="ts">
import { nextTick, ref, watch, type Component } from 'vue'

import { useSlidingIndicator } from '@/composables/useSlidingIndicator'

export type AppTabOption = {
  value: string
  label: string
  icon?: Component
  dataTest?: string
  disabled?: boolean
}

const props = defineProps<{
  modelValue: string
  options: readonly AppTabOption[]
  accessibleName: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
}>()

const container = ref<HTMLElement | null>(null)
const tabElements = new Map<string, HTMLButtonElement>()
const { indicatorStyle, updateIndicator } = useSlidingIndicator({
  container,
  target: () => tabElements.get(props.modelValue) ?? null,
})

function setTabElement(value: string, element: unknown): void {
  if (element instanceof HTMLButtonElement) tabElements.set(value, element)
  else tabElements.delete(value)
}

function selectTab(value: string, restoreFocus = false): void {
  const option = props.options.find((item) => item.value === value)
  if (!option || option.disabled) return
  emit('update:modelValue', value)
  emit('change', value)
  if (restoreFocus) void nextTick(() => tabElements.get(value)?.focus())
}

function onKeydown(event: KeyboardEvent, value: string): void {
  const enabled = props.options.filter((option) => !option.disabled)
  const currentIndex = enabled.findIndex((option) => option.value === value)
  if (currentIndex < 0 || !enabled.length) return

  let nextIndex: number | null = null
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    nextIndex = (currentIndex + 1) % enabled.length
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    nextIndex = (currentIndex - 1 + enabled.length) % enabled.length
  } else if (event.key === 'Home') {
    nextIndex = 0
  } else if (event.key === 'End') {
    nextIndex = enabled.length - 1
  }

  if (nextIndex === null) return
  event.preventDefault()
  selectTab(enabled[nextIndex]!.value, true)
}

watch(
  [() => props.modelValue, () => props.options.map((option) => option.value).join('|')],
  () => void updateIndicator(),
  { flush: 'post' },
)
</script>

<template>
  <nav ref="container" class="app-tab-bar" role="tablist" :aria-label="accessibleName">
    <span
      data-test="tab-highlight"
      class="app-tab-bar__highlight"
      :style="indicatorStyle"
      aria-hidden="true"
    />
    <button
      v-for="option in options"
      :key="option.value"
      :ref="(element) => setTabElement(option.value, element)"
      type="button"
      class="app-tab-bar__tab"
      :class="{ 'app-tab-bar__tab--active': option.value === modelValue }"
      role="tab"
      :data-test="option.dataTest"
      :aria-selected="option.value === modelValue"
      :tabindex="option.value === modelValue ? 0 : -1"
      :disabled="option.disabled"
      @click="selectTab(option.value)"
      @keydown="onKeydown($event, option.value)"
    >
      <component :is="option.icon" v-if="option.icon" :size="15" aria-hidden="true" />
      <span>{{ option.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.app-tab-bar {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 40px;
  align-items: flex-end;
  gap: 2px;
  border-bottom: 1px solid var(--color-border);
}

.app-tab-bar__highlight {
  position: absolute;
  z-index: 0;
  top: 0;
  left: 0;
  pointer-events: none;
  background: var(--color-brand-surface);
  border-radius: var(--radius-control) var(--radius-control) 0 0;
  transition:
    width var(--duration-overlay) ease,
    height var(--duration-overlay) ease,
    opacity var(--duration-fast) ease,
    transform var(--duration-overlay) ease;
  will-change: transform;
}

.app-tab-bar__highlight::after {
  position: absolute;
  right: 8px;
  bottom: 0;
  left: 8px;
  height: 2px;
  content: '';
  background: var(--color-brand-500);
  border-radius: 2px 2px 0 0;
}

.app-tab-bar__tab {
  position: relative;
  z-index: 1;
  display: flex;
  min-height: 39px;
  align-items: center;
  gap: 7px;
  padding: 0 11px;
  color: var(--color-text-secondary);
  background: transparent;
  border: 0;
  transition: color var(--duration-fast) ease;
}

.app-tab-bar__tab:hover:not(:disabled) {
  color: var(--color-text-primary);
}

.app-tab-bar__tab--active {
  color: var(--color-brand-ink);
  font-weight: 600;
}

@media (prefers-reduced-motion: reduce) {
  .app-tab-bar__highlight,
  .app-tab-bar__tab {
    transition-duration: 0.01ms;
  }
}
</style>
