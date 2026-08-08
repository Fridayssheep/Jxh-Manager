<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { Check, ChevronDown, LockKeyhole, Search, X } from '@lucide/vue'

export type AppMultiSelectOption = {
  value: string
  label: string
  description?: string
  meta?: string
  disabled?: boolean
  disabledReason?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: readonly string[]
    options: readonly AppMultiSelectOption[]
    accessibleName: string
    placeholder?: string
    searchPlaceholder?: string
    maxSelected?: number
    disabled?: boolean
    dataTest?: string
  }>(),
  {
    placeholder: '请选择',
    searchPlaceholder: '搜索名称或编号',
    maxSelected: 50,
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const instanceId = `app-multi-select-${useId()}`
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)
const open = ref(false)
const searchQuery = ref('')
const menuPosition = ref({ left: 8, top: 8, width: 360, maxHeight: 420 })

const selectedSet = computed(() => new Set(props.modelValue))
const enabledOptions = computed(() => props.options.filter((option) => !option.disabled))
const filteredOptions = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('zh-CN')
  if (!query) return props.options
  return props.options.filter((option) =>
    [option.label, option.description, option.meta]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase('zh-CN').includes(query)),
  )
})
const triggerLabel = computed(() => {
  if (!props.modelValue.length) return props.placeholder
  if (props.modelValue.length === 1) {
    return (
      props.options.find((option) => option.value === props.modelValue[0])?.label ?? '已选择 1 个群'
    )
  }
  return `已选择 ${props.modelValue.length} 个群`
})
const allEnabledSelected = computed(
  () =>
    enabledOptions.value.length > 0 &&
    enabledOptions.value.every((option) => selectedSet.value.has(option.value)),
)
const menuStyle = computed(() => ({
  left: `${menuPosition.value.left}px`,
  top: `${menuPosition.value.top}px`,
  width: `${menuPosition.value.width}px`,
  maxHeight: `${menuPosition.value.maxHeight}px`,
}))

function updatePosition(): void {
  if (!open.value || !triggerRef.value) return
  const rect = triggerRef.value.getBoundingClientRect()
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight
  const inset = 8
  const gap = 5
  const width = Math.min(Math.max(rect.width, 360), Math.max(280, viewportWidth - inset * 2))
  const left = Math.min(Math.max(inset, rect.left), Math.max(inset, viewportWidth - width - inset))
  const belowSpace = viewportHeight - rect.bottom - gap - inset
  const aboveSpace = rect.top - gap - inset
  const placeAbove = belowSpace < 260 && aboveSpace > belowSpace
  const availableHeight = placeAbove ? aboveSpace : belowSpace
  const maxHeight = Math.max(190, Math.min(420, availableHeight))
  const top = placeAbove
    ? Math.max(inset, rect.top - gap - maxHeight)
    : Math.min(viewportHeight - inset, rect.bottom + gap)
  menuPosition.value = { left, top, width, maxHeight }
}

function openMenu(): void {
  if (props.disabled || !props.options.length) return
  searchQuery.value = ''
  open.value = true
  void nextTick(() => {
    updatePosition()
    searchRef.value?.focus()
  })
}

function closeMenu(restoreFocus = false): void {
  if (!open.value) return
  open.value = false
  if (restoreFocus) void nextTick(() => triggerRef.value?.focus())
}

function toggleMenu(): void {
  if (open.value) closeMenu()
  else openMenu()
}

function toggleOption(option: AppMultiSelectOption): void {
  if (option.disabled) return
  if (selectedSet.value.has(option.value)) {
    emit(
      'update:modelValue',
      props.modelValue.filter((value) => value !== option.value),
    )
    return
  }
  if (props.modelValue.length >= props.maxSelected) return
  emit('update:modelValue', [...props.modelValue, option.value])
}

function toggleAll(): void {
  if (allEnabledSelected.value) {
    const enabledValues = new Set(enabledOptions.value.map((option) => option.value))
    emit(
      'update:modelValue',
      props.modelValue.filter((value) => !enabledValues.has(value)),
    )
    return
  }
  const next = new Set(props.modelValue)
  for (const option of enabledOptions.value) {
    if (next.size >= props.maxSelected) break
    next.add(option.value)
  }
  emit('update:modelValue', [...next])
}

function clearSelection(): void {
  emit('update:modelValue', [])
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return
  if (rootRef.value?.contains(target) || menuRef.value?.contains(target)) return
  closeMenu()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.preventDefault()
  closeMenu(true)
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
  () => props.disabled,
  (disabled) => {
    if (disabled) closeMenu()
  },
)
</script>

<template>
  <div ref="rootRef" class="multi-select" :class="{ 'multi-select--open': open }">
    <button
      ref="triggerRef"
      type="button"
      class="multi-select__trigger"
      :data-test="dataTest"
      :aria-label="accessibleName"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="open ? instanceId : undefined"
      :disabled="disabled"
      @click="toggleMenu"
      @keydown="onKeydown"
    >
      <span :class="{ 'multi-select__placeholder': !modelValue.length }">{{ triggerLabel }}</span>
      <ChevronDown :size="16" :stroke-width="1.9" aria-hidden="true" />
    </button>

    <Teleport to="body">
      <Transition name="multi-select-menu">
        <section
          v-if="open"
          :id="instanceId"
          ref="menuRef"
          class="multi-select__menu"
          :style="menuStyle"
          aria-label="群公告发布目标"
          @keydown="onKeydown"
        >
          <div class="multi-select__toolbar">
            <label class="multi-select__search">
              <Search :size="15" aria-hidden="true" />
              <input
                ref="searchRef"
                v-model="searchQuery"
                aria-label="搜索公告发布群"
                :placeholder="searchPlaceholder"
              />
            </label>
            <button
              v-if="modelValue.length"
              type="button"
              class="multi-select__clear"
              title="清空选择"
              aria-label="清空选择"
              @click="clearSelection"
            >
              <X :size="15" aria-hidden="true" />
            </button>
          </div>

          <div class="multi-select__summary">
            <span>已选 {{ modelValue.length }} / {{ maxSelected }}</span>
            <button type="button" @click="toggleAll">
              {{ allEnabledSelected ? '取消全选' : '全选可发布群' }}
            </button>
          </div>

          <div
            class="multi-select__options"
            role="listbox"
            :aria-label="accessibleName"
            aria-multiselectable="true"
          >
            <button
              v-for="option in filteredOptions"
              :key="option.value"
              type="button"
              class="multi-select__option"
              :class="{
                'multi-select__option--selected': selectedSet.has(option.value),
                'multi-select__option--disabled': option.disabled,
              }"
              role="option"
              :aria-selected="selectedSet.has(option.value)"
              :aria-disabled="option.disabled || undefined"
              :aria-label="
                option.disabled && option.disabledReason
                  ? `${option.label} ${option.description ?? ''} ${option.meta ?? ''}，${option.disabledReason}`
                  : undefined
              "
              :title="option.disabled ? option.disabledReason : undefined"
              @click="toggleOption(option)"
            >
              <span class="multi-select__check" aria-hidden="true">
                <LockKeyhole v-if="option.disabled" :size="13" />
                <Check v-else-if="selectedSet.has(option.value)" :size="14" :stroke-width="2.5" />
              </span>
              <span class="multi-select__identity">
                <strong>{{ option.label }}</strong>
                <small v-if="option.description" class="mono">{{ option.description }}</small>
              </span>
              <span v-if="option.meta" class="multi-select__meta">{{ option.meta }}</span>
            </button>

            <p v-if="!filteredOptions.length" class="multi-select__empty">没有匹配的群</p>
          </div>
        </section>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.multi-select,
.multi-select__trigger {
  width: 100%;
}

.multi-select__trigger {
  display: flex;
  height: 40px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 10px;
  color: var(--color-text-primary);
  text-align: left;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-control);
}

.multi-select__trigger span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.multi-select__trigger svg {
  flex: 0 0 auto;
  color: var(--color-text-secondary);
  transition: transform 150ms ease;
}

.multi-select--open .multi-select__trigger {
  border-color: var(--color-brand-action);
  box-shadow: 0 0 0 2px var(--color-brand-surface);
}

.multi-select--open .multi-select__trigger svg {
  transform: rotate(180deg);
}

.multi-select__placeholder {
  color: var(--color-text-secondary);
}

.multi-select__menu {
  position: fixed;
  z-index: 130;
  display: grid;
  min-height: 0;
  grid-template-rows: auto auto minmax(0, 1fr);
  overflow: hidden;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-panel);
  box-shadow: 0 12px 34px rgb(34 37 36 / 18%);
}

.multi-select__toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px;
  padding: 9px;
  border-bottom: 1px solid var(--color-border);
}

.multi-select__search {
  display: grid;
  height: 36px;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 7px;
  align-items: center;
  padding: 0 9px;
  color: var(--color-text-secondary);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}

.multi-select__search input {
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
}

.multi-select__clear {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  padding: 0;
  color: var(--color-text-secondary);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}

.multi-select__summary {
  display: flex;
  min-height: 34px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px;
  color: var(--color-text-secondary);
  font-size: 11px;
  background: var(--color-surface-subtle);
  border-bottom: 1px solid var(--color-border);
}

.multi-select__summary button {
  padding: 4px 0;
  color: var(--color-brand-action);
  font-weight: 600;
  background: transparent;
  border: 0;
}

.multi-select__options {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 5px;
}

.multi-select__option {
  display: grid;
  width: 100%;
  min-height: 48px;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  color: var(--color-text-primary);
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: var(--radius-control);
}

.multi-select__option:hover,
.multi-select__option:focus-visible {
  background: var(--color-surface-raised);
}

.multi-select__option--selected {
  background: var(--color-brand-surface);
}

.multi-select__option--disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.multi-select__check {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  color: var(--color-brand-action);
  border: 1px solid var(--color-border-strong);
  border-radius: 4px;
}

.multi-select__option--selected .multi-select__check {
  color: white;
  background: var(--color-brand-action);
  border-color: var(--color-brand-action);
}

.multi-select__identity {
  display: grid;
  min-width: 0;
}

.multi-select__identity strong {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.multi-select__identity small,
.multi-select__meta {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.multi-select__meta {
  padding-left: 6px;
  white-space: nowrap;
}

.multi-select__empty {
  padding: 24px 10px;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-align: center;
}

.multi-select-menu-enter-active,
.multi-select-menu-leave-active {
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}

.multi-select-menu-enter-from,
.multi-select-menu-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}

@media (prefers-reduced-motion: reduce) {
  .multi-select__trigger svg,
  .multi-select-menu-enter-active,
  .multi-select-menu-leave-active {
    transition: none;
  }
}
</style>
