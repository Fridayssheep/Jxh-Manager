<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2, Lock, Pencil, Trash2 } from '@lucide/vue'

import type { ConfiguredSecret } from '@/api/types'
import type { SecretDraft } from './configuration-draft'

const props = defineProps<{
  id: string
  label: string
  status: ConfiguredSecret
  modelValue: SecretDraft
  disabled?: boolean
  error?: string | null
}>()

const emit = defineEmits<{ 'update:modelValue': [value: SecretDraft] }>()

const sourceLabels: Record<ConfiguredSecret['source'], string> = {
  default: '默认值',
  file: '配置文件',
  environment: '环境变量',
}

const locked = computed(() => Boolean(props.disabled || props.status.source === 'environment'))
const statusLabel = computed(() =>
  `${props.status.configured ? '已配置' : '未配置'} · ${sourceLabels[props.status.source]}`,
)
const replacementValue = computed({
  get: () => props.modelValue.operation === 'replace' ? props.modelValue.value : '',
  set: (value: string) => emit('update:modelValue', { operation: 'replace', value }),
})

function keep(): void {
  emit('update:modelValue', { operation: 'keep' })
}

function replace(): void {
  emit('update:modelValue', { operation: 'replace', value: '' })
}

function clear(): void {
  emit('update:modelValue', { operation: 'clear' })
}
</script>

<template>
  <div class="secret-setting" :data-test="id">
    <div class="secret-heading">
      <span class="field-label">{{ label }}</span>
      <span class="secret-status" :data-test="`${id}-status`">
        <Lock v-if="status.source === 'environment'" :size="13" aria-hidden="true" />
        {{ statusLabel }}
      </span>
    </div>

    <div class="secret-actions" role="group" :aria-label="`${label} 更新方式`">
      <button
        type="button"
        :data-test="`${id}-keep`"
        :class="{ active: modelValue.operation === 'keep' }"
        :disabled="disabled"
        title="保留当前值"
        @click="keep"
      >
        <CheckCircle2 :size="14" aria-hidden="true" />
        保持
      </button>
      <button
        type="button"
        :data-test="`${id}-replace`"
        :class="{ active: modelValue.operation === 'replace' }"
        :disabled="locked"
        title="输入新值并替换当前配置"
        @click="replace"
      >
        <Pencil :size="14" aria-hidden="true" />
        替换
      </button>
      <button
        type="button"
        :data-test="`${id}-clear`"
        :class="{ active: modelValue.operation === 'clear' }"
        :disabled="locked"
        title="清除配置文件中的值"
        @click="clear"
      >
        <Trash2 :size="14" aria-hidden="true" />
        清除
      </button>
    </div>

    <input
      v-if="modelValue.operation === 'replace'"
      v-model="replacementValue"
      class="secret-value"
      type="password"
      autocomplete="new-password"
      spellcheck="false"
      :aria-label="`${label} 新值`"
      :data-test="`${id}-value`"
      :disabled="locked"
    />
    <p v-if="error" class="field-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.secret-setting {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.secret-heading,
.secret-status,
.secret-actions,
.secret-actions button {
  display: flex;
  align-items: center;
}

.secret-heading {
  justify-content: space-between;
  gap: 10px;
}

.field-label {
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: 700;
}

.secret-status {
  min-height: 22px;
  gap: 5px;
  padding: 0 7px;
  color: var(--color-info);
  font-size: 10px;
  font-weight: 700;
  background: var(--color-info-surface);
  border-radius: var(--radius-control);
}

.secret-actions {
  width: fit-content;
  overflow: hidden;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-control);
}

.secret-actions button {
  min-width: 66px;
  height: 34px;
  justify-content: center;
  gap: 5px;
  padding: 0 9px;
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 700;
  background: var(--color-surface);
  border: 0;
  border-right: 1px solid var(--color-border);
}

.secret-actions button:last-child {
  border-right: 0;
}

.secret-actions button.active {
  color: var(--color-brand-ink);
  background: var(--color-brand-surface);
}

.secret-actions button:disabled {
  color: var(--color-text-disabled);
  cursor: not-allowed;
  background: var(--color-surface-subtle);
}

.secret-value {
  width: min(420px, 100%);
  height: 40px;
  padding: 0 10px;
  color: var(--color-text-primary);
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-control);
}

.secret-value:disabled {
  color: var(--color-text-disabled);
  background: var(--color-surface-subtle);
}

.field-error {
  color: var(--color-danger);
  font-size: 11px;
}
</style>
