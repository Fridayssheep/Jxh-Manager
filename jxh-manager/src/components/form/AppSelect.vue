<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { Check, ChevronDown } from '@lucide/vue'

export type AppSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: readonly AppSelectOption[]
    accessibleName: string
    name?: string
    dataTest?: string
    size?: 'default' | 'compact'
    disabled?: boolean
  }>(),
  {
    size: 'default',
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
}>()

const instanceId = `app-select-${useId()}`
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const open = ref(false)
const highlightedIndex = ref(-1)
const menuPosition = ref({
  left: 8,
  top: 8,
  width: 180,
  maxHeight: 320,
  placement: 'below' as 'above' | 'below',
})

const selectedOption = computed(() =>
  props.options.find((option) => option.value === props.modelValue),
)

const activeDescendant = computed(() => {
  if (!open.value || highlightedIndex.value < 0) return undefined
  return optionId(highlightedIndex.value)
})

const menuStyle = computed(() => ({
  left: `${menuPosition.value.left}px`,
  top: `${menuPosition.value.top}px`,
  width: `${menuPosition.value.width}px`,
  maxHeight: `${menuPosition.value.maxHeight}px`,
}))

function optionId(index: number): string {
  const value = props.options[index]?.value.replace(/[^a-zA-Z0-9_-]/g, '-') ?? String(index)
  return `${instanceId}-option-${value}`
}

function firstEnabledIndex(): number {
  return props.options.findIndex((option) => !option.disabled)
}

function lastEnabledIndex(): number {
  for (let index = props.options.length - 1; index >= 0; index -= 1) {
    if (!props.options[index]?.disabled) return index
  }
  return -1
}

function selectedIndex(): number {
  const index = props.options.findIndex(
    (option) => option.value === props.modelValue && !option.disabled,
  )
  return index >= 0 ? index : firstEnabledIndex()
}

function scrollHighlightedIntoView(): void {
  void nextTick(() => {
    const option = menuRef.value?.querySelector<HTMLElement>(
      `[data-option-index="${highlightedIndex.value}"]`,
    )
    option?.scrollIntoView?.({ block: 'nearest' })
  })
}

function setHighlighted(index: number): void {
  if (index < 0 || props.options[index]?.disabled) return
  highlightedIndex.value = index
  scrollHighlightedIntoView()
}

function moveHighlight(direction: 1 | -1): void {
  if (!props.options.length) return
  let index = highlightedIndex.value
  for (let attempts = 0; attempts < props.options.length; attempts += 1) {
    index = (index + direction + props.options.length) % props.options.length
    if (!props.options[index]?.disabled) {
      setHighlighted(index)
      return
    }
  }
}

function updatePosition(): void {
  if (!open.value || !triggerRef.value) return
  const rect = triggerRef.value.getBoundingClientRect()
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight
  const inset = 8
  const gap = 4
  const estimatedHeight = Math.min(props.options.length * 34 + 8, 320)
  const belowSpace = viewportHeight - rect.bottom - gap - inset
  const aboveSpace = rect.top - gap - inset
  const placeAbove = belowSpace < Math.min(estimatedHeight, 200) && aboveSpace > belowSpace
  const availableHeight = placeAbove ? aboveSpace : belowSpace
  const maxHeight = Math.max(96, Math.min(320, availableHeight))
  const width = Math.min(Math.max(rect.width, 180), Math.max(180, viewportWidth - inset * 2))
  const left = Math.min(
    Math.max(inset, rect.left),
    Math.max(inset, viewportWidth - width - inset),
  )
  const visibleHeight = Math.min(estimatedHeight, maxHeight)
  const top = placeAbove
    ? Math.max(inset, rect.top - gap - visibleHeight)
    : Math.min(viewportHeight - inset, rect.bottom + gap)

  menuPosition.value = {
    left,
    top,
    width,
    maxHeight,
    placement: placeAbove ? 'above' : 'below',
  }
}

function openMenu(initial: 'selected' | 'first' | 'last' = 'selected'): void {
  if (props.disabled || !props.options.length) return
  open.value = true
  highlightedIndex.value =
    initial === 'first'
      ? firstEnabledIndex()
      : initial === 'last'
        ? lastEnabledIndex()
        : selectedIndex()
  void nextTick(() => {
    updatePosition()
    menuRef.value?.focus()
    scrollHighlightedIntoView()
  })
}

function closeMenu(restoreFocus = true): void {
  if (!open.value) return
  open.value = false
  highlightedIndex.value = -1
  if (restoreFocus) void nextTick(() => triggerRef.value?.focus())
}

function toggleMenu(): void {
  if (open.value) closeMenu()
  else openMenu()
}

function chooseOption(option: AppSelectOption): void {
  if (option.disabled) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
  closeMenu()
}

function chooseHighlighted(): void {
  const option = props.options[highlightedIndex.value]
  if (option) chooseOption(option)
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (props.disabled) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    openMenu('selected')
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    openMenu('last')
  } else if (event.key === 'Home') {
    event.preventDefault()
    openMenu('first')
  } else if (event.key === 'End') {
    event.preventDefault()
    openMenu('last')
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    toggleMenu()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closeMenu()
  }
}

function onMenuKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveHighlight(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveHighlight(-1)
  } else if (event.key === 'Home') {
    event.preventDefault()
    setHighlighted(firstEnabledIndex())
  } else if (event.key === 'End') {
    event.preventDefault()
    setHighlighted(lastEnabledIndex())
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    chooseHighlighted()
  } else if (event.key === 'Escape' || event.key === 'Tab') {
    if (event.key === 'Escape') event.preventDefault()
    closeMenu(event.key === 'Escape')
  }
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return
  if (rootRef.value?.contains(target) || menuRef.value?.contains(target)) return
  closeMenu(false)
}

function onViewportChange(): void {
  if (open.value) updatePosition()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})

watch(
  () => props.modelValue,
  () => {
    if (open.value) highlightedIndex.value = selectedIndex()
  },
)

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) closeMenu(false)
  },
)
</script>

<template>
  <div
    ref="rootRef"
    class="app-select"
    :class="[
      `app-select--${size}`,
      { 'app-select--open': open, 'app-select--disabled': disabled },
    ]"
  >
    <input v-if="name" type="hidden" :name="name" :value="modelValue" />
    <button
      ref="triggerRef"
      type="button"
      class="app-select__trigger"
      :data-test="dataTest"
      :aria-label="accessibleName"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="open ? instanceId : undefined"
      :disabled="disabled"
      @click="toggleMenu"
      @keydown="onTriggerKeydown"
    >
      <span>{{ selectedOption?.label ?? '请选择' }}</span>
      <ChevronDown :size="15" :stroke-width="1.9" aria-hidden="true" />
    </button>

    <Teleport to="body">
      <Transition name="app-select-menu">
        <div
          v-if="open"
          :id="instanceId"
          ref="menuRef"
          class="app-select__menu"
          :class="`app-select__menu--${menuPosition.placement}`"
          :style="menuStyle"
          role="listbox"
          :aria-label="accessibleName"
          :aria-activedescendant="activeDescendant"
          tabindex="-1"
          @keydown="onMenuKeydown"
        >
          <button
            v-for="(option, index) in options"
            :id="optionId(index)"
            :key="option.value"
            type="button"
            class="app-select__option"
            :class="{
              'app-select__option--selected': option.value === modelValue,
              'app-select__option--highlighted': index === highlightedIndex,
            }"
            role="option"
            :data-value="option.value"
            :data-option-index="index"
            :aria-selected="option.value === modelValue"
            :aria-disabled="option.disabled || undefined"
            :disabled="option.disabled"
            tabindex="-1"
            @pointerenter="setHighlighted(index)"
            @click="chooseOption(option)"
          >
            <span>{{ option.label }}</span>
            <Check
              v-if="option.value === modelValue"
              :size="15"
              :stroke-width="2"
              aria-hidden="true"
            />
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.app-select {
  min-width: 0;
}

.app-select__trigger {
  display: grid;
  width: 100%;
  height: 36px;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) 15px;
  align-items: center;
  gap: 8px;
  padding: 0 9px;
  color: var(--color-text-primary);
  text-align: left;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  transition:
    color var(--duration-fast) ease,
    border-color var(--duration-fast) ease,
    background-color var(--duration-fast) ease;
}

.app-select--compact .app-select__trigger {
  height: 32px;
}

.app-select__trigger > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-select__trigger svg {
  color: var(--color-text-secondary);
  transition: transform var(--duration-fast) ease;
}

.app-select--open .app-select__trigger {
  color: var(--color-brand-ink);
  background: var(--color-brand-surface);
  border-color: var(--color-brand-action);
}

.app-select--open .app-select__trigger svg {
  color: var(--color-brand-action);
  transform: rotate(180deg);
}

.app-select--disabled {
  opacity: 0.58;
}

.app-select__menu {
  position: fixed;
  z-index: 120;
  padding: 4px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-panel);
  box-shadow: 0 10px 28px rgb(34 37 36 / 16%);
}

.app-select__option {
  display: grid;
  width: 100%;
  min-height: 34px;
  grid-template-columns: minmax(0, 1fr) 15px;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  color: var(--color-text-primary);
  font-size: 13px;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 3px;
}

.app-select__option > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-select__option--highlighted {
  background: var(--color-surface-subtle);
}

.app-select__option--selected {
  color: var(--color-brand-ink);
  font-weight: 600;
  background: var(--color-brand-surface);
}

.app-select__option--selected.app-select__option--highlighted {
  background: var(--color-brand-border);
}

.app-select__option svg {
  color: var(--color-brand-action);
}

.app-select__option:disabled {
  color: var(--color-text-disabled);
  cursor: not-allowed;
}

.app-select-menu-enter-active,
.app-select-menu-leave-active {
  transition:
    opacity var(--duration-fast) ease,
    transform var(--duration-fast) ease;
}

.app-select-menu-enter-from,
.app-select-menu-leave-to {
  opacity: 0;
}

.app-select__menu--below.app-select-menu-enter-from,
.app-select__menu--below.app-select-menu-leave-to {
  transform: translateY(-4px);
}

.app-select__menu--above.app-select-menu-enter-from,
.app-select__menu--above.app-select-menu-leave-to {
  transform: translateY(4px);
}

@media (prefers-reduced-motion: reduce) {
  .app-select__trigger,
  .app-select__trigger svg,
  .app-select-menu-enter-active,
  .app-select-menu-leave-active {
    transition-duration: 0.01ms;
  }
}
</style>
