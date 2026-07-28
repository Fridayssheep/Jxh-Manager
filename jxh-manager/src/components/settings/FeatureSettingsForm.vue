<script setup lang="ts">
import { computed } from 'vue'
import { Bot, Image, Link2, MessageSquareReply, TerminalSquare, UserRoundPlus } from '@lucide/vue'

import type { FeatureKey, FeatureSettings } from '@/api/types'
import {
  FEATURE_KEYS,
  FEATURE_META,
  findUnknownTemplateVariables,
  type FeatureMode,
  type FeatureSettingsDraft,
} from './feature-settings'

const props = defineProps<{
  mode: 'global' | 'group'
  modelValue: FeatureSettingsDraft
  effective?: FeatureSettings
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: FeatureSettingsDraft] }>()

const icons = {
  keyword_reply: MessageSquareReply,
  ai_qa: Bot,
  quote: Image,
  link_cleaner: Link2,
  welcome: UserRoundPlus,
  custom_commands: TerminalSquare,
}

const unknownVariables = computed(() =>
  findUnknownTemplateVariables(props.modelValue.welcome.messageTemplate),
)

function updateItem(key: FeatureKey, patch: Partial<FeatureSettingsDraft[FeatureKey]>): void {
  emit('update:modelValue', {
    ...props.modelValue,
    [key]: { ...props.modelValue[key], ...patch },
  })
}

function updateGlobalEnabled(key: FeatureKey, event: Event): void {
  updateItem(key, {
    mode: (event.target as HTMLInputElement).checked ? 'enabled' : 'disabled',
  })
}

function setMode(key: FeatureKey, mode: FeatureMode): void {
  updateItem(key, { mode })
}
</script>

<template>
  <div class="feature-settings">
    <section v-for="key in FEATURE_KEYS" :key="key" class="feature-row">
      <div class="feature-icon" aria-hidden="true">
        <component :is="icons[key]" :size="18" :stroke-width="1.8" />
      </div>
      <div class="feature-copy">
        <strong>{{ FEATURE_META[key].label }}</strong>
        <span>{{ FEATURE_META[key].description }}</span>
        <span v-if="mode === 'group' && effective" class="effective-value">
          全局当前值：{{ effective[key].enabled ? '启用' : '停用' }}
        </span>
      </div>

      <label v-if="mode === 'global'" class="switch-control">
        <input
          type="checkbox"
          :data-test="`feature-${key}`"
          :aria-label="`${FEATURE_META[key].label}：${modelValue[key].mode === 'enabled' ? '已启用' : '已停用'}`"
          :checked="modelValue[key].mode === 'enabled'"
          :disabled="disabled"
          @change="updateGlobalEnabled(key, $event)"
        />
        <span aria-hidden="true" />
        <b>{{ modelValue[key].mode === 'enabled' ? '已启用' : '已停用' }}</b>
      </label>

      <div v-else class="segmented-control" :aria-label="`${FEATURE_META[key].label}覆盖设置`">
        <button
          v-for="option in (['inherit', 'enabled', 'disabled'] as FeatureMode[])"
          :key="option"
          type="button"
          :data-test="`feature-${key}-${option}`"
          :class="{ active: modelValue[key].mode === option }"
          :disabled="disabled"
          @click="setMode(key, option)"
        >
          {{ option === 'inherit' ? '继承' : option === 'enabled' ? '启用' : '停用' }}
        </button>
      </div>

      <div v-if="key === 'welcome'" class="welcome-template">
        <div v-if="mode === 'group'" class="template-source">
          <label>
            <input
              type="radio"
              name="welcome-template-source"
              :checked="modelValue.welcome.messageInherited"
              :disabled="disabled"
              @change="updateItem('welcome', { messageInherited: true })"
            />
            继承全局文案
          </label>
          <label>
            <input
              type="radio"
              name="welcome-template-source"
              :checked="!modelValue.welcome.messageInherited"
              :disabled="disabled"
              @change="updateItem('welcome', { messageInherited: false })"
            />
            自定义文案
          </label>
        </div>
        <label class="template-field">
          <span>欢迎语模板</span>
          <textarea
            :value="modelValue.welcome.messageTemplate"
            :disabled="disabled || (mode === 'group' && modelValue.welcome.messageInherited)"
            rows="3"
            data-test="welcome-template"
            @input="updateItem('welcome', { messageTemplate: ($event.target as HTMLTextAreaElement).value })"
          />
        </label>
        <p class="template-help">
          可用变量：<code v-pre>{{ member_qq }}</code>、<code v-pre>{{ member_name }}</code>、<code v-pre>{{ group_name }}</code>
        </p>
        <p v-if="unknownVariables.length" class="template-error" role="alert">
          未知模板变量：{{ unknownVariables.join('、') }}
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.feature-settings {
  border-top: 1px solid var(--color-border);
}

.feature-row {
  display: grid;
  grid-template-columns: 36px minmax(220px, 1fr) auto;
  gap: 12px;
  align-items: center;
  min-height: 76px;
  padding: 14px 0;
  border-bottom: 1px solid var(--color-border);
}

.feature-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  color: var(--color-brand-ink);
  background: var(--color-brand-surface);
  border-radius: var(--radius-control);
}

.feature-copy {
  display: grid;
  min-width: 0;
}

.feature-copy strong {
  font-size: 14px;
}

.feature-copy > span {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.feature-copy .effective-value {
  margin-top: 2px;
  color: var(--color-info);
}

.switch-control {
  display: grid;
  grid-template-columns: 36px auto;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.switch-control input {
  position: absolute;
  opacity: 0;
}

.switch-control > span {
  position: relative;
  width: 36px;
  height: 20px;
  background: var(--color-border-strong);
  border-radius: 10px;
}

.switch-control > span::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  content: '';
  background: var(--color-surface);
  border-radius: 50%;
  transition: transform var(--duration-fast) ease;
}

.switch-control input:checked + span {
  background: var(--color-brand-action);
}

.switch-control input:checked + span::after {
  transform: translateX(16px);
}

.switch-control input:focus-visible + span {
  box-shadow: var(--focus-ring);
}

.switch-control b {
  min-width: 42px;
  font-size: 12px;
  font-weight: 600;
}

.segmented-control {
  display: grid;
  grid-template-columns: repeat(3, 58px);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-control);
}

.segmented-control button {
  height: 34px;
  padding: 0 8px;
  color: var(--color-text-secondary);
  background: var(--color-surface);
  border: 0;
  border-right: 1px solid var(--color-border);
}

.segmented-control button:last-child {
  border-right: 0;
}

.segmented-control button.active {
  color: var(--color-brand-ink);
  font-weight: 600;
  background: var(--color-brand-surface);
}

.welcome-template {
  grid-column: 2 / -1;
  display: grid;
  gap: 8px;
  padding-top: 4px;
}

.template-source {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.template-source label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.template-field {
  display: grid;
  gap: 5px;
}

.template-field > span {
  font-size: 12px;
  font-weight: 600;
}

textarea {
  width: 100%;
  padding: 9px 10px;
  resize: vertical;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-control);
}

.template-help,
.template-error {
  color: var(--color-text-secondary);
  font-size: 11px;
}

.template-help code {
  color: var(--color-info);
  font-family: var(--font-mono);
}

.template-error {
  color: var(--color-danger);
}

@media (max-width: 720px) {
  .feature-row {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  .switch-control,
  .segmented-control,
  .welcome-template {
    grid-column: 2;
    justify-self: stretch;
  }

  .segmented-control {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
