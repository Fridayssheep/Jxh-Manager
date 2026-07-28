<script setup lang="ts">
import { ArrowDown, ArrowUp, Plus, Trash2 } from '@lucide/vue'

import type { CommandParameter, CommandParameterType } from '@/api/types'

withDefaults(defineProps<{ readonly?: boolean }>(), { readonly: false })
const parameters = defineModel<CommandParameter[]>({ required: true })

const typeLabels: Record<CommandParameterType, string> = {
  text: '文本',
  integer: '整数',
  duration: '正时长',
  member: 'QQ 成员',
  fixed_option: '固定选项',
}

function makeParameter(type: CommandParameterType, index: number): CommandParameter {
  const common = {
    name: `param_${index + 1}`,
    display_name: `参数 ${index + 1}`,
    required: true,
  }
  switch (type) {
    case 'text':
      return { ...common, type, min_length: 0, max_length: 200 }
    case 'integer':
      return { ...common, type, minimum: 0, maximum: 100 }
    case 'duration':
      return { ...common, type, minimum_seconds: 60, maximum_seconds: 3600 }
    case 'member':
      return { ...common, type, allow_triggerer: false }
    case 'fixed_option':
      return { ...common, type, options: [{ value: 'option_1', label: '选项一' }] }
  }
}

function addParameter(): void {
  parameters.value = [...parameters.value, makeParameter('text', parameters.value.length)]
}

function changeType(index: number, type: CommandParameterType): void {
  const current = parameters.value[index]
  if (!current) return
  const replacement = makeParameter(type, index)
  replacement.name = current.name
  replacement.display_name = current.display_name
  replacement.required = current.required
  parameters.value.splice(index, 1, replacement)
}

function move(index: number, offset: -1 | 1): void {
  const target = index + offset
  if (target < 0 || target >= parameters.value.length) return
  const next = [...parameters.value]
  ;[next[index], next[target]] = [next[target]!, next[index]!]
  parameters.value = next
}

function remove(index: number): void {
  parameters.value = parameters.value.filter((_, itemIndex) => itemIndex !== index)
}

function addOption(parameter: Extract<CommandParameter, { type: 'fixed_option' }>): void {
  const nextIndex = parameter.options.length + 1
  parameter.options.push({ value: `option_${nextIndex}`, label: `选项${nextIndex}` })
}
</script>

<template>
  <div class="parameter-editor">
    <div class="editor-toolbar">
      <p>参数按消息中的出现顺序解析，参数名仅允许小写 ASCII 字母、数字和下划线。</p>
      <button type="button" :disabled="readonly" @click="addParameter">
        <Plus :size="15" aria-hidden="true" />添加参数
      </button>
    </div>

    <p v-if="!parameters.length" class="empty-copy">此命令不接收参数。</p>
    <article v-for="(parameter, index) in parameters" :key="index" class="parameter-item">
      <header>
        <span class="item-index mono">{{ index + 1 }}</span>
        <strong>{{ parameter.display_name || `参数 ${index + 1}` }}</strong>
        <div class="item-actions">
          <button type="button" title="上移参数" :disabled="readonly || index === 0" @click="move(index, -1)">
            <ArrowUp :size="15" aria-hidden="true" />
          </button>
          <button type="button" title="下移参数" :disabled="readonly || index === parameters.length - 1" @click="move(index, 1)">
            <ArrowDown :size="15" aria-hidden="true" />
          </button>
          <button class="remove-action" type="button" title="删除参数" :disabled="readonly" @click="remove(index)">
            <Trash2 :size="15" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div class="parameter-grid">
        <label>
          <span>参数名</span>
          <input v-model="parameter.name" :disabled="readonly" maxlength="32" spellcheck="false" />
        </label>
        <label>
          <span>显示名称</span>
          <input v-model="parameter.display_name" :disabled="readonly" maxlength="100" />
        </label>
        <label>
          <span>类型</span>
          <select :value="parameter.type" :disabled="readonly" @change="changeType(index, ($event.target as HTMLSelectElement).value as CommandParameterType)">
            <option v-for="(label, value) in typeLabels" :key="value" :value="value">{{ label }}</option>
          </select>
        </label>
        <label class="check-field">
          <input v-model="parameter.required" type="checkbox" :disabled="readonly" />
          <span>必填参数</span>
        </label>
      </div>

      <div v-if="parameter.type === 'text'" class="boundary-grid">
        <label><span>最小长度</span><input v-model.number="parameter.min_length" type="number" min="0" :disabled="readonly" /></label>
        <label><span>最大长度</span><input v-model.number="parameter.max_length" type="number" min="1" :disabled="readonly" /></label>
      </div>
      <div v-else-if="parameter.type === 'integer'" class="boundary-grid">
        <label><span>最小值</span><input v-model.number="parameter.minimum" type="number" :disabled="readonly" /></label>
        <label><span>最大值</span><input v-model.number="parameter.maximum" type="number" :disabled="readonly" /></label>
      </div>
      <div v-else-if="parameter.type === 'duration'" class="boundary-grid">
        <label><span>最短秒数</span><input v-model.number="parameter.minimum_seconds" type="number" min="1" :disabled="readonly" /></label>
        <label><span>最长秒数</span><input v-model.number="parameter.maximum_seconds" type="number" min="1" :disabled="readonly" /></label>
      </div>
      <label v-else-if="parameter.type === 'member'" class="check-field member-option">
        <input v-model="parameter.allow_triggerer" type="checkbox" :disabled="readonly" />
        <span>允许省略时使用触发者本人</span>
      </label>
      <div v-else-if="parameter.type === 'fixed_option'" class="fixed-options">
        <div v-for="(option, optionIndex) in parameter.options" :key="optionIndex">
          <input v-model="option.value" aria-label="选项值" :disabled="readonly" maxlength="32" spellcheck="false" />
          <input v-model="option.label" aria-label="选项标签" :disabled="readonly" maxlength="100" />
          <button type="button" title="删除选项" :disabled="readonly || parameter.options.length === 1" @click="parameter.options.splice(optionIndex, 1)">
            <Trash2 :size="14" aria-hidden="true" />
          </button>
        </div>
        <button type="button" :disabled="readonly" @click="addOption(parameter)"><Plus :size="14" aria-hidden="true" />添加选项</button>
      </div>
    </article>
  </div>
</template>

<style scoped>
.parameter-editor,
.parameter-item,
.fixed-options {
  display: grid;
  gap: 10px;
}

.editor-toolbar,
.parameter-item header,
.item-actions,
.fixed-options > div,
.fixed-options > button,
.editor-toolbar button {
  display: flex;
  align-items: center;
}

.editor-toolbar {
  justify-content: space-between;
  gap: 16px;
}

.editor-toolbar p,
.empty-copy {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.editor-toolbar button,
.fixed-options > button {
  min-height: 34px;
  justify-content: center;
  gap: 6px;
  padding: 0 10px;
  color: var(--color-brand-action);
  font-weight: 600;
  background: var(--color-surface);
  border: 1px solid var(--color-brand-border);
  border-radius: var(--radius-control);
}

.parameter-item {
  padding: 12px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.parameter-item header {
  gap: 8px;
}

.parameter-item header strong {
  flex: 1;
  font-size: 13px;
}

.item-index {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  color: var(--color-brand-ink);
  font-size: 11px;
  background: var(--color-brand-surface);
  border-radius: var(--radius-control);
}

.item-actions {
  gap: 4px;
}

.item-actions button,
.fixed-options > div button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  padding: 0;
  color: var(--color-text-secondary);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}

.item-actions .remove-action {
  color: var(--color-danger);
}

.parameter-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
  gap: 9px;
  align-items: end;
}

label {
  display: grid;
  gap: 5px;
  min-width: 0;
}

label > span {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 600;
}

input,
select {
  width: 100%;
  height: 36px;
  min-width: 0;
  padding: 0 9px;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-control);
}

.check-field {
  display: flex;
  min-height: 36px;
  align-items: center;
  gap: 6px;
}

.check-field input {
  width: 16px;
  height: 16px;
}

.check-field span {
  white-space: nowrap;
}

.boundary-grid {
  display: grid;
  max-width: 420px;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

.member-option {
  justify-self: start;
}

.fixed-options > div {
  max-width: 620px;
  gap: 7px;
}

.fixed-options > div input {
  flex: 1;
}

.fixed-options > button {
  justify-self: start;
}

@media (max-width: 760px) {
  .editor-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .parameter-grid,
  .boundary-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 480px) {
  .parameter-grid,
  .boundary-grid {
    grid-template-columns: 1fr;
  }

  .fixed-options > div {
    flex-wrap: wrap;
  }
}
</style>
