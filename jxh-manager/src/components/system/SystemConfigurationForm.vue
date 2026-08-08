<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  Image,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
} from '@lucide/vue'

import { AdminApiError } from '@/api/client'
import { systemApi } from '@/api/system'
import type { SystemConfiguration } from '@/api/types'
import ResourceState from '@/components/feedback/ResourceState.vue'
import AppSelect, { type AppSelectOption } from '@/components/form/AppSelect.vue'
import {
  CONFIGURATION_FIELD_PATHS,
  cloneSystemConfigurationDraft,
  isSystemConfigurationDraftDirty,
  isSystemConfigurationFieldManaged,
  toSystemConfigurationPatch,
  validateSystemConfigurationDraft,
  type ConfigurationFieldPath,
  type SystemConfigurationDraft,
} from './configuration-draft'
import SecretSettingInput from './SecretSettingInput.vue'

const props = defineProps<{ canWrite: boolean }>()
const emit = defineEmits<{
  loaded: [configuration: SystemConfiguration]
  saved: [configuration: SystemConfiguration]
}>()

const resource = ref<SystemConfiguration | null>(null)
const draft = ref<SystemConfigurationDraft | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref<unknown>(null)
const saveError = ref<string | null>(null)
const saved = ref(false)
const conflict = ref(false)

const paths = CONFIGURATION_FIELD_PATHS
const aiProviderOptions: readonly AppSelectOption[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'ark', label: '火山方舟' },
]
const issueMessages: Record<string, string> = {
  invalid_length: '长度为空或超出限制',
  invalid_url: '请输入有效的 http/https URL',
  invalid_enum: '请选择受支持的选项',
  invalid_number: '请输入整数',
  out_of_range: '数值超出允许范围',
  invalid_timezone: '请输入有效的 IANA 时区',
  value_not_allowed: '清除操作不能包含值',
}

const issues = computed(() => (
  resource.value && draft.value
    ? validateSystemConfigurationDraft(resource.value, draft.value)
    : {}
))
const dirty = computed(() => (
  resource.value && draft.value
    ? isSystemConfigurationDraftDirty(resource.value, draft.value)
    : false
))
const hasIssues = computed(() => Object.keys(issues.value).length > 0)
const canSubmit = computed(() =>
  props.canWrite && dirty.value && !hasIssues.value && !saving.value && !conflict.value,
)

function accept(value: SystemConfiguration): void {
  resource.value = value
  draft.value = cloneSystemConfigurationDraft(value)
  saveError.value = null
  saved.value = false
  conflict.value = false
  emit('loaded', value)
}

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    accept(await systemApi.getConfiguration())
  } catch (reason) {
    error.value = reason
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (!resource.value || !draft.value || !canSubmit.value) return

  saving.value = true
  saveError.value = null
  saved.value = false
  try {
    const patch = toSystemConfigurationPatch(resource.value, draft.value)
    const updated = await systemApi.updateConfiguration(patch, resource.value.version)
    accept(updated)
    saved.value = true
    emit('saved', updated)
  } catch (reason) {
    if (reason instanceof AdminApiError && reason.status === 409) {
      conflict.value = true
    } else if (reason instanceof TypeError) {
      saveError.value = '保存结果未知，请重新读取服务器版本。'
    } else {
      saveError.value = reason instanceof AdminApiError ? reason.message : '系统设置保存失败。'
    }
  } finally {
    saving.value = false
  }
}

function fieldManaged(path: ConfigurationFieldPath): boolean {
  return Boolean(resource.value && isSystemConfigurationFieldManaged(resource.value, path))
}

function fieldDisabled(path: ConfigurationFieldPath): boolean {
  return !props.canWrite || saving.value || fieldManaged(path)
}

function fieldError(path: ConfigurationFieldPath): string | null {
  const code = issues.value[path]
  return code ? issueMessages[code] ?? code : null
}

function setAIProvider(value: string): void {
  if (!draft.value || (value !== 'openai' && value !== 'ark')) return
  draft.value.ai.provider = value
}

onMounted(() => { void load() })
</script>

<template>
  <section data-test="system-configuration" class="system-configuration-form" aria-labelledby="system-config-title">
    <header class="configuration-header">
      <div>
        <h2 id="system-config-title"><Settings2 :size="18" aria-hidden="true" />系统设置</h2>
      </div>
      <div v-if="resource" class="configuration-meta">
        <span data-test="config-version" class="mono">版本 {{ resource.version }}</span>
        <span class="mono">已应用 {{ resource.applied_version }}</span>
        <span v-if="resource.restart_required" class="restart-badge">
          <RefreshCw :size="13" aria-hidden="true" />需要重启
        </span>
      </div>
    </header>

    <ResourceState
      v-if="loading && !resource"
      state="loading"
      title="正在读取系统设置"
      description="正在加载配置文件中的可编辑项目。"
    />
    <ResourceState
      v-else-if="error && !resource"
      state="error"
      title="系统设置读取失败"
      description="配置源不可用或当前无法连接服务器。"
      @retry="load"
    />

    <template v-else-if="resource && draft">
      <div v-if="conflict" class="conflict-banner" role="alert">
        <AlertTriangle :size="18" aria-hidden="true" />
        <div>
          <strong>服务器配置已更新</strong>
          <p>本地草稿已保留。重新读取服务器版本会放弃当前草稿。</p>
        </div>
        <button data-test="reload-configuration" type="button" :disabled="loading" @click="load">
          <RotateCcw :size="15" aria-hidden="true" />加载服务器版本
        </button>
      </div>

      <div class="settings-sections">
        <section data-test="config-section-wps" class="configuration-section">
          <header>
            <Database :size="18" aria-hidden="true" />
            <div>
              <h3>WPS</h3>
              <p>知识表来源和 WPS </p>
            </div>
          </header>
          <div class="field-grid">
            <SecretSettingInput
              v-model="draft.wps.share_url"
              id="config-wps-share-url"
              label="分享链接"
              :status="resource.wps.share_url"
              :disabled="fieldDisabled(paths.wps.share_url)"
              :error="fieldError(paths.wps.share_url)"
            />
            <SecretSettingInput
              v-model="draft.wps.sid"
              id="config-wps-sid"
              label="SID"
              :status="resource.wps.sid"
              :disabled="fieldDisabled(paths.wps.sid)"
              :error="fieldError(paths.wps.sid)"
            />
            <label class="setting-field">
              <span>工作表名称 <small v-if="fieldManaged(paths.wps.sheet)">环境托管</small></span>
              <input
                v-model="draft.wps.sheet"
                data-test="config-wps-sheet"
                :disabled="fieldDisabled(paths.wps.sheet)"
              />
              <p v-if="fieldError(paths.wps.sheet)" class="field-error" role="alert">
                {{ fieldError(paths.wps.sheet) }}
              </p>
            </label>
            <label class="setting-field">
              <span>请求超时秒数 <small v-if="fieldManaged(paths.wps.timeout_sec)">环境托管</small></span>
              <input
                v-model="draft.wps.timeout_sec"
                data-test="config-wps-timeout-sec"
                type="number"
                min="1"
                max="600"
                step="1"
                :disabled="fieldDisabled(paths.wps.timeout_sec)"
              />
              <p v-if="fieldError(paths.wps.timeout_sec)" class="field-error" role="alert">
                {{ fieldError(paths.wps.timeout_sec) }}
              </p>
            </label>
          </div>
        </section>

        <section data-test="config-section-ai" class="configuration-section">
          <header>
            <Bot :size="18" aria-hidden="true" />
            <div>
              <h3>AI</h3>
              <p>模型提供商、接口地址和请求限制。</p>
            </div>
          </header>
          <div class="field-grid">
            <label class="setting-field">
              <span>提供商 <small v-if="fieldManaged(paths.ai.provider)">环境托管</small></span>
              <AppSelect
                :model-value="draft.ai.provider"
                :options="aiProviderOptions"
                accessible-name="提供商"
                data-test="config-ai-provider"
                :disabled="fieldDisabled(paths.ai.provider)"
                @update:model-value="setAIProvider"
              />
              <p v-if="fieldError(paths.ai.provider)" class="field-error" role="alert">
                {{ fieldError(paths.ai.provider) }}
              </p>
            </label>
            <label class="setting-field">
              <span>接口地址 <small v-if="fieldManaged(paths.ai.base_url)">环境托管</small></span>
              <input
                v-model="draft.ai.base_url"
                data-test="config-ai-base-url"
                :disabled="fieldDisabled(paths.ai.base_url)"
              />
              <p v-if="fieldError(paths.ai.base_url)" class="field-error" role="alert">
                {{ fieldError(paths.ai.base_url) }}
              </p>
            </label>
            <SecretSettingInput
              v-model="draft.ai.api_key"
              id="config-ai-api-key"
              label="API Key"
              :status="resource.ai.api_key"
              :disabled="fieldDisabled(paths.ai.api_key)"
              :error="fieldError(paths.ai.api_key)"
            />
            <label class="setting-field">
              <span>模型 <small v-if="fieldManaged(paths.ai.model)">环境托管</small></span>
              <input
                v-model="draft.ai.model"
                data-test="config-ai-model"
                :disabled="fieldDisabled(paths.ai.model)"
              />
              <p v-if="fieldError(paths.ai.model)" class="field-error" role="alert">
                {{ fieldError(paths.ai.model) }}
              </p>
            </label>
            <label class="setting-field">
              <span>请求超时秒数 <small v-if="fieldManaged(paths.ai.timeout_sec)">环境托管</small></span>
              <input
                v-model="draft.ai.timeout_sec"
                data-test="config-ai-timeout-sec"
                type="number"
                min="1"
                max="600"
                step="1"
                :disabled="fieldDisabled(paths.ai.timeout_sec)"
              />
              <p v-if="fieldError(paths.ai.timeout_sec)" class="field-error" role="alert">
                {{ fieldError(paths.ai.timeout_sec) }}
              </p>
            </label>
            <label class="setting-field">
              <span>最大问题字符数 <small v-if="fieldManaged(paths.ai.max_question_chars)">环境托管</small></span>
              <input
                v-model="draft.ai.max_question_chars"
                data-test="config-ai-max-question-chars"
                type="number"
                min="1"
                max="10000"
                step="1"
                :disabled="fieldDisabled(paths.ai.max_question_chars)"
              />
              <p v-if="fieldError(paths.ai.max_question_chars)" class="field-error" role="alert">
                {{ fieldError(paths.ai.max_question_chars) }}
              </p>
            </label>
          </div>
        </section>

        <section data-test="config-section-quote" class="configuration-section">
          <header>
            <Image :size="18" aria-hidden="true" />
            <div>
              <h3>引用图</h3>
              <p>引用图服务地址和调用超时。</p>
            </div>
          </header>
          <div class="field-grid">
            <label class="setting-field">
              <span>服务地址 <small v-if="fieldManaged(paths.quote.base_url)">环境托管</small></span>
              <input
                v-model="draft.quote.base_url"
                data-test="config-quote-base-url"
                :disabled="fieldDisabled(paths.quote.base_url)"
              />
              <p v-if="fieldError(paths.quote.base_url)" class="field-error" role="alert">
                {{ fieldError(paths.quote.base_url) }}
              </p>
            </label>
            <label class="setting-field">
              <span>请求超时秒数 <small v-if="fieldManaged(paths.quote.timeout_sec)">环境托管</small></span>
              <input
                v-model="draft.quote.timeout_sec"
                data-test="config-quote-timeout-sec"
                type="number"
                min="1"
                max="120"
                step="1"
                :disabled="fieldDisabled(paths.quote.timeout_sec)"
              />
              <p v-if="fieldError(paths.quote.timeout_sec)" class="field-error" role="alert">
                {{ fieldError(paths.quote.timeout_sec) }}
              </p>
            </label>
          </div>
        </section>

        <section data-test="config-section-time" class="configuration-section">
          <header>
            <Clock3 :size="18" aria-hidden="true" />
            <div>
              <h3>时间</h3>
              <p>应用和调度器使用的 IANA 时区。</p>
            </div>
          </header>
          <div class="field-grid">
            <label class="setting-field">
              <span>应用时区 <small v-if="fieldManaged(paths.time.app_timezone)">环境托管</small></span>
              <input
                v-model="draft.time.app_timezone"
                data-test="config-time-app-timezone"
                :disabled="fieldDisabled(paths.time.app_timezone)"
              />
              <p v-if="fieldError(paths.time.app_timezone)" class="field-error" role="alert">
                {{ fieldError(paths.time.app_timezone) }}
              </p>
            </label>
            <label class="setting-field">
              <span>调度器时区 <small v-if="fieldManaged(paths.time.scheduler_timezone)">环境托管</small></span>
              <input
                v-model="draft.time.scheduler_timezone"
                data-test="config-time-scheduler-timezone"
                :disabled="fieldDisabled(paths.time.scheduler_timezone)"
              />
              <p v-if="fieldError(paths.time.scheduler_timezone)" class="field-error" role="alert">
                {{ fieldError(paths.time.scheduler_timezone) }}
              </p>
            </label>
          </div>
        </section>

        <section data-test="config-section-retention" class="configuration-section">
          <header>
            <Database :size="18" aria-hidden="true" />
            <div>
              <h3>数据保留</h3>
              <p>可清理运行数据的保留窗口。</p>
            </div>
          </header>
          <div class="field-grid">
            <label class="setting-field">
              <span>触发日志保留天数 <small v-if="fieldManaged(paths.retention.trigger_log_retention_days)">环境托管</small></span>
              <input
                v-model="draft.retention.trigger_log_retention_days"
                data-test="config-retention-trigger-log-retention-days"
                type="number"
                min="0"
                max="3650"
                step="1"
                :disabled="fieldDisabled(paths.retention.trigger_log_retention_days)"
              />
              <p v-if="fieldError(paths.retention.trigger_log_retention_days)" class="field-error" role="alert">
                {{ fieldError(paths.retention.trigger_log_retention_days) }}
              </p>
            </label>
          </div>
        </section>
      </div>

      <footer class="save-bar">
        <div>
          <span v-if="saved" class="save-success" role="status">
            <CheckCircle2 :size="15" aria-hidden="true" />设置已保存，重启 Bot 后生效。
          </span>
          <span v-else-if="saveError" class="save-error" role="alert">
            <AlertTriangle :size="15" aria-hidden="true" />{{ saveError }}
          </span>
          <span v-else-if="hasIssues" class="save-error" role="alert">
            <AlertTriangle :size="15" aria-hidden="true" />请修正字段校验错误后再保存。
          </span>
          <span v-else-if="!canWrite" class="save-hint">你没有权限修改修改系统设置。</span>
          <span v-else-if="dirty" class="save-hint">有未保存修改。</span>
          <span v-else class="save-hint">设置已同步</span>
        </div>
        <button
          v-if="canWrite"
          data-test="save-configuration"
          class="save-button"
          type="button"
          :disabled="!canSubmit"
          @click="save"
        >
          <Save :size="16" aria-hidden="true" />{{ saving ? '正在保存' : '保存设置' }}
        </button>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.system-configuration-form {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.configuration-header,
.configuration-header h2,
.configuration-meta,
.restart-badge,
.conflict-banner,
.conflict-banner button,
.save-bar,
.save-success,
.save-error,
.save-button {
  display: flex;
  align-items: center;
}

.configuration-header {
  justify-content: space-between;
  gap: 16px;
}

.configuration-header h2 {
  gap: 7px;
  font-size: 15px;
}

.configuration-header h2 svg {
  color: var(--color-brand-action);
}

.configuration-header p {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.configuration-meta {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.configuration-meta > span {
  min-height: 24px;
  padding: 0 7px;
  color: var(--color-text-secondary);
  font-size: 10px;
  background: var(--color-surface-subtle);
  border-radius: var(--radius-control);
}

.configuration-meta .restart-badge {
  gap: 5px;
  color: var(--color-warning);
  font-weight: 700;
  background: var(--color-warning-surface);
}

.conflict-banner {
  gap: 10px;
  padding: 10px 12px;
  color: var(--color-warning);
  background: var(--color-warning-surface);
  border-left: 3px solid var(--color-warning);
}

.conflict-banner div {
  flex: 1;
  min-width: 0;
}

.conflict-banner strong {
  color: var(--color-text-primary);
  font-size: 12px;
}

.conflict-banner p {
  margin-top: 1px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.conflict-banner button {
  min-height: 34px;
  flex: 0 0 auto;
  gap: 6px;
  padding: 0 10px;
  color: var(--color-warning);
  font-weight: 700;
  background: var(--color-surface);
  border: 1px solid currentcolor;
  border-radius: var(--radius-control);
}

.settings-sections {
  overflow: hidden;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.configuration-section {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
  gap: 18px;
  padding: 18px;
  border-bottom: 1px solid var(--color-border);
}

.configuration-section:last-child {
  border-bottom: 0;
}

.configuration-section > header {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  min-width: 0;
}

.configuration-section > header > svg {
  flex: 0 0 auto;
  margin-top: 2px;
  color: var(--color-brand-ink);
}

.configuration-section h3 {
  font-size: 14px;
}

.configuration-section p {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
  min-width: 0;
}

.setting-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.setting-field > span {
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: 700;
}

.setting-field small {
  margin-left: 5px;
  color: var(--color-info);
  font-size: 10px;
  font-weight: 700;
}

input {
  width: 100%;
  height: 40px;
  min-width: 0;
  padding: 0 10px;
  color: var(--color-text-primary);
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-control);
}

input:disabled {
  color: var(--color-text-disabled);
  cursor: not-allowed;
  background: var(--color-surface-subtle);
}

:deep(.app-select__trigger) {
  height: 40px;
  border-color: var(--color-border-strong);
}

.field-error {
  color: var(--color-danger);
  font-size: 11px;
}

.save-bar {
  min-height: 52px;
  justify-content: space-between;
  gap: 14px;
  padding: 8px 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.save-bar > div {
  min-width: 0;
}

.save-success,
.save-error {
  gap: 6px;
  font-size: 11px;
}

.save-success {
  color: var(--color-success);
}

.save-error {
  color: var(--color-danger);
}

.save-hint {
  color: var(--color-text-secondary);
  font-size: 11px;
}

.save-button {
  min-height: 36px;
  flex: 0 0 auto;
  gap: 6px;
  padding: 0 12px;
  color: white;
  font-weight: 700;
  background: var(--color-brand-action);
  border: 1px solid var(--color-brand-action);
  border-radius: var(--radius-control);
}

.save-button:hover:not(:disabled) {
  background: var(--color-brand-action-hover);
}

.save-button:disabled {
  color: var(--color-text-disabled);
  background: var(--color-surface-subtle);
  border-color: var(--color-border);
}

@media (max-width: 820px) {
  .configuration-header,
  .save-bar,
  .conflict-banner {
    align-items: stretch;
    flex-direction: column;
  }

  .configuration-meta {
    justify-content: flex-start;
  }

  .configuration-section {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
}

@media (max-width: 580px) {
  .field-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .save-button,
  .conflict-banner button {
    justify-content: center;
  }
}
</style>
