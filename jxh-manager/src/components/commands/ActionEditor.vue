<script setup lang="ts">
import { computed } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  AtSign,
  Clock3,
  MessageSquareText,
  Send,
  Trash2,
} from '@lucide/vue'

import type { CommandAction, CommandParameter, Group } from '@/api/types'
import AppSelect, { type AppSelectOption } from '@/components/form/AppSelect.vue'

const props = withDefaults(
  defineProps<{
    parameters: CommandParameter[]
    groups: Group[]
    canConfigureCrossGroup: boolean
    readonly?: boolean
  }>(),
  { readonly: false },
)
const actions = defineModel<CommandAction[]>({ required: true })

const memberParameters = computed(() =>
  props.parameters.filter((parameter) => parameter.type === 'member'),
)
const durationParameters = computed(() =>
  props.parameters.filter((parameter) => parameter.type === 'duration'),
)
const mentionTargetOptions: readonly AppSelectOption[] = [
  { value: 'triggerer', label: '命令触发者' },
  { value: 'parameter', label: '成员参数' },
]
const durationModeOptions: readonly AppSelectOption[] = [
  { value: 'fixed', label: '固定秒数' },
  { value: 'parameter', label: '时长参数' },
]
const memberParameterOptions = computed<readonly AppSelectOption[]>(() => [
  { value: '', label: '请选择' },
  ...memberParameters.value.map((parameter) => ({
    value: parameter.name,
    label: `${parameter.display_name} (${parameter.name})`,
  })),
])
const durationParameterOptions = computed<readonly AppSelectOption[]>(() => [
  { value: '', label: '请选择' },
  ...durationParameters.value.map((parameter) => ({
    value: parameter.name,
    label: `${parameter.display_name} (${parameter.name})`,
  })),
])

function add(action: CommandAction): void {
  actions.value = [...actions.value, action]
}

function addReply(): void {
  add({ type: 'reply_text', template: '' })
}

function addMention(): void {
  add({ type: 'mention', target: 'triggerer', member_parameter: null })
}

function addMute(): void {
  add({
    type: 'mute_member',
    member_parameter: memberParameters.value[0]?.name ?? '',
    duration: { type: 'FixedDurationSource', seconds: 600 },
  })
}

function addSend(): void {
  if (!props.canConfigureCrossGroup) return
  add({ type: 'send_group_text', target_group_ids: [], template: '' })
}

function move(index: number, offset: -1 | 1): void {
  const target = index + offset
  if (target < 0 || target >= actions.value.length) return
  const next = [...actions.value]
  ;[next[index], next[target]] = [next[target]!, next[index]!]
  actions.value = next
}

function remove(index: number): void {
  actions.value = actions.value.filter((_, itemIndex) => itemIndex !== index)
}

function setMentionTarget(action: Extract<CommandAction, { type: 'mention' }>, target: 'triggerer' | 'parameter'): void {
  action.target = target
  action.member_parameter = target === 'parameter' ? memberParameters.value[0]?.name ?? null : null
}

function setMentionParameter(action: Extract<CommandAction, { type: 'mention' }>, value: string): void {
  action.member_parameter = value || null
}

function setMuteMemberParameter(action: Extract<CommandAction, { type: 'mute_member' }>, value: string): void {
  action.member_parameter = value
}

function setDurationParameter(action: Extract<CommandAction, { type: 'mute_member' }>, value: string): void {
  if (action.duration.type === 'ParameterDurationSource') action.duration.parameter = value
}

function setDurationMode(
  action: Extract<CommandAction, { type: 'mute_member' }>,
  mode: 'fixed' | 'parameter',
): void {
  action.duration =
    mode === 'fixed'
      ? { type: 'FixedDurationSource', seconds: 600 }
      : { type: 'ParameterDurationSource', parameter: durationParameters.value[0]?.name ?? '' }
}

function toggleGroup(
  action: Extract<CommandAction, { type: 'send_group_text' }>,
  groupId: string,
  checked: boolean,
): void {
  action.target_group_ids = checked
    ? [...new Set([...action.target_group_ids, groupId])]
    : action.target_group_ids.filter((value) => value !== groupId)
}

const actionMeta = {
  reply_text: { label: '回复文本', icon: MessageSquareText },
  mention: { label: '@成员', icon: AtSign },
  mute_member: { label: '禁言成员', icon: Clock3 },
  send_group_text: { label: '发送到指定群', icon: Send },
}
</script>

<template>
  <div class="action-editor">
    <div class="editor-toolbar">
      <p>注意：动作任一步失败后，后续动作将不会继续</p>
      <div class="add-actions">
        <button data-test="add-reply-action" type="button" :disabled="readonly" @click="addReply">
          <MessageSquareText :size="15" aria-hidden="true" />回复文本
        </button>
        <button type="button" :disabled="readonly" @click="addMention"><AtSign :size="15" aria-hidden="true" />@成员</button>
        <button type="button" :disabled="readonly" @click="addMute"><Clock3 :size="15" aria-hidden="true" />禁言</button>
        <button type="button" :disabled="readonly || !canConfigureCrossGroup" @click="addSend">
          <Send :size="15" aria-hidden="true" />指定群发送
        </button>
      </div>
    </div>

    <p v-if="!canConfigureCrossGroup" class="permission-note">操作失败了喵：跨群目标只能由超级管理员新增或修改</p>
    <p v-if="!actions.length" class="empty-copy">尚未配置动作，请至少添加一个受控动作喵</p>

    <article v-for="(action, index) in actions" :key="index" class="action-item">
      <header>
        <span class="item-index mono">{{ index + 1 }}</span>
        <component :is="actionMeta[action.type].icon" :size="16" aria-hidden="true" />
        <strong>{{ actionMeta[action.type].label }}</strong>
        <div class="item-actions">
          <button type="button" title="上移动作" :disabled="readonly || index === 0" @click="move(index, -1)"><ArrowUp :size="15" aria-hidden="true" /></button>
          <button type="button" title="下移动作" :disabled="readonly || index === actions.length - 1" @click="move(index, 1)"><ArrowDown :size="15" aria-hidden="true" /></button>
          <button class="remove-action" type="button" title="删除动作" :disabled="readonly" @click="remove(index)"><Trash2 :size="15" aria-hidden="true" /></button>
        </div>
      </header>

      <label v-if="action.type === 'reply_text'" class="wide-field">
        <span>回复模板</span>
        <textarea v-model="action.template" :data-test="`reply-template-${index}`" rows="3" maxlength="2000" :disabled="readonly" placeholder="可引用已定义参数，例如 {{member}}" />
      </label>

      <div v-else-if="action.type === 'mention'" class="field-grid">
        <label>
          <span>目标来源</span>
          <AppSelect :model-value="action.target" :options="mentionTargetOptions" accessible-name="目标来源" :data-test="`mention-target-${index}`" :disabled="readonly" @update:model-value="setMentionTarget(action, $event as 'triggerer' | 'parameter')" />
        </label>
        <label v-if="action.target === 'parameter'">
          <span>成员参数</span>
          <AppSelect :model-value="action.member_parameter ?? ''" :options="memberParameterOptions" accessible-name="成员参数" :data-test="`mention-parameter-${index}`" :disabled="readonly" @update:model-value="setMentionParameter(action, $event)" />
        </label>
      </div>

      <div v-else-if="action.type === 'mute_member'" class="field-grid">
        <label>
          <span>成员参数</span>
          <AppSelect :model-value="action.member_parameter" :options="memberParameterOptions" accessible-name="成员参数" :data-test="`mute-member-parameter-${index}`" :disabled="readonly" @update:model-value="setMuteMemberParameter(action, $event)" />
        </label>
        <label>
          <span>时长来源</span>
          <AppSelect :model-value="action.duration.type === 'FixedDurationSource' ? 'fixed' : 'parameter'" :options="durationModeOptions" accessible-name="时长来源" :data-test="`mute-duration-mode-${index}`" :disabled="readonly" @update:model-value="setDurationMode(action, $event as 'fixed' | 'parameter')" />
        </label>
        <label v-if="action.duration.type === 'FixedDurationSource'">
          <span>禁言秒数</span>
          <input v-model.number="action.duration.seconds" type="number" min="1" :disabled="readonly" />
        </label>
        <label v-else>
          <span>时长参数</span>
          <AppSelect :model-value="action.duration.parameter" :options="durationParameterOptions" accessible-name="时长参数" :data-test="`mute-duration-parameter-${index}`" :disabled="readonly" @update:model-value="setDurationParameter(action, $event)" />
        </label>
      </div>

      <template v-else-if="action.type === 'send_group_text'">
        <div class="target-groups">
          <span>固定目标群</span>
          <label v-for="group in groups" :key="group.group_id">
            <input
              type="checkbox"
              :checked="action.target_group_ids.includes(group.group_id)"
              :disabled="readonly || !canConfigureCrossGroup"
              @change="toggleGroup(action, group.group_id, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ group.name }} <small class="mono">{{ group.group_id }}</small></span>
          </label>
          <p v-if="!groups.length">群目录暂不可用，无法新增跨群目标</p>
        </div>
        <label class="wide-field">
          <span>发送模板</span>
          <textarea v-model="action.template" rows="3" maxlength="2000" :disabled="readonly || !canConfigureCrossGroup" />
        </label>
      </template>
    </article>
  </div>
</template>

<style scoped>
.action-editor,
.action-item,
.target-groups {
  display: grid;
  gap: 10px;
}

.editor-toolbar,
.add-actions,
.add-actions button,
.action-item header,
.item-actions,
.target-groups label {
  display: flex;
  align-items: center;
}

.editor-toolbar {
  justify-content: space-between;
  gap: 16px;
}

.editor-toolbar p,
.empty-copy,
.target-groups p {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.add-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.add-actions button {
  min-height: 34px;
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

.permission-note {
  padding: 8px 10px;
  color: var(--color-warning);
  font-size: 12px;
  background: var(--color-warning-surface);
  border-left: 3px solid var(--color-warning);
}

.action-item {
  padding: 12px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.action-item header {
  gap: 8px;
}

.action-item header strong {
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

.item-actions button {
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

.field-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
}

label {
  display: grid;
  gap: 5px;
  min-width: 0;
}

label > span,
.target-groups > span {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 600;
}

input,
select,
textarea {
  width: 100%;
  min-width: 0;
  padding: 0 9px;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-control);
}

input,
select {
  height: 36px;
}

textarea {
  padding-block: 8px;
  resize: vertical;
}

.target-groups {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.target-groups > span,
.target-groups p {
  grid-column: 1 / -1;
}

.target-groups label {
  min-height: 38px;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 7px;
  padding: 7px 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}

.target-groups label input {
  width: 16px;
  height: 16px;
}

.target-groups label small {
  color: var(--color-text-secondary);
  font-size: 10px;
}

@media (max-width: 760px) {
  .editor-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .add-actions {
    justify-content: flex-start;
  }

  .field-grid,
  .target-groups {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 480px) {
  .field-grid,
  .target-groups {
    grid-template-columns: 1fr;
  }
}
</style>
