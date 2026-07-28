<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
} from '@lucide/vue'

import { AdminApiError } from '@/api/client'
import { systemApi } from '@/api/system'
import type { SystemConfiguration } from '@/api/types'
import ResourceState from '@/components/feedback/ResourceState.vue'

const props = defineProps<{ canWrite: boolean }>()

const resource = ref<SystemConfiguration | null>(null)
const draft = ref('')
const baseline = ref('')
const loading = ref(false)
const saving = ref(false)
const error = ref<unknown>(null)
const saveError = ref<string | null>(null)
const saved = ref(false)
const conflict = ref(false)

const dirty = computed(() => Boolean(resource.value && draft.value !== baseline.value))

function accept(value: SystemConfiguration): void {
  resource.value = value
  draft.value = value.yaml
  baseline.value = value.yaml
  saved.value = false
  saveError.value = null
  conflict.value = false
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
  if (!props.canWrite || !resource.value || !dirty.value || conflict.value) return
  saving.value = true
  saveError.value = null
  saved.value = false
  try {
    accept(await systemApi.updateConfiguration(draft.value, resource.value.version))
    saved.value = true
  } catch (reason) {
    if (reason instanceof AdminApiError && reason.status === 409) {
      conflict.value = true
    } else if (reason instanceof TypeError) {
      saveError.value = '保存结果未知，连接已中断。请先重新读取服务器版本。'
    } else {
      saveError.value = reason instanceof AdminApiError ? reason.message : '配置文件保存失败。'
    }
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <section data-test="system-configuration" class="configuration-section" aria-labelledby="configuration-title">
    <header class="section-header">
      <div>
        <h2 id="configuration-title"><FileCode2 :size="18" aria-hidden="true" />Bot 配置文件</h2>
        <p>磁盘中的 config.yaml；环境变量覆盖项不会被写回文件。</p>
      </div>
      <span v-if="resource?.restart_required" class="restart-badge">
        <RefreshCw :size="13" aria-hidden="true" />重启后生效
      </span>
    </header>

    <ResourceState
      v-if="loading && !resource"
      state="loading"
      title="正在读取 Bot 配置"
      description="服务器正在生成脱敏后的 YAML。"
    />
    <ResourceState
      v-else-if="error && !resource"
      state="error"
      title="Bot 配置读取失败"
      description="配置源不可用或当前无法连接服务器。"
      @retry="load"
    />

    <template v-else-if="resource">
      <div v-if="conflict" class="conflict-banner" role="alert">
        <AlertTriangle :size="18" aria-hidden="true" />
        <div>
          <strong>服务器配置已经更新</strong>
          <p>本地草稿已保留。加载服务器版本会放弃当前草稿。</p>
        </div>
        <button data-test="reload-configuration" type="button" :disabled="loading" @click="load">
          <RotateCcw :size="15" aria-hidden="true" />加载服务器版本
        </button>
      </div>

      <div class="configuration-workspace">
        <div class="editor-pane">
          <div class="editor-toolbar">
            <span class="mono">config.yaml</span>
            <span :class="['dirty-state', { 'dirty-state--active': dirty }]">
              {{ dirty ? '有未保存修改' : '与服务器一致' }}
            </span>
          </div>
          <textarea
            v-model="draft"
            data-test="config-yaml"
            aria-label="Bot YAML 配置"
            :readonly="!canWrite"
            :spellcheck="false"
          />
        </div>

        <aside class="configuration-context" aria-label="配置文件状态">
          <div class="context-block">
            <span>资源版本</span>
            <strong class="mono">版本 {{ resource.version }}</strong>
          </div>
          <div class="context-block">
            <span><ShieldCheck :size="14" aria-hidden="true" />敏感字段</span>
            <code>__JXH_SECRET_UNCHANGED__</code>
            <ul>
              <li v-for="field in resource.masked_fields" :key="field" class="mono">{{ field }}</li>
            </ul>
          </div>
          <div class="context-block">
            <span>环境变量覆盖</span>
            <ul v-if="resource.environment_overrides.length">
              <li v-for="field in resource.environment_overrides" :key="field" class="mono">{{ field }}</li>
            </ul>
            <p v-else>当前没有环境变量覆盖项。</p>
          </div>
        </aside>

        <footer class="save-bar">
          <div>
            <span v-if="saved" class="save-success" role="status">
              <CheckCircle2 :size="15" aria-hidden="true" />配置文件已保存，重启 Bot 后生效。
            </span>
            <span v-else-if="saveError" class="save-error" role="alert">
              <AlertTriangle :size="15" aria-hidden="true" />{{ saveError }}
            </span>
            <span v-else-if="!canWrite" class="save-hint">当前账号拥有脱敏只读权限。</span>
            <span v-else class="save-hint">未修改的敏感字段占位符会保留原密钥。</span>
          </div>
          <button
            v-if="canWrite"
            data-test="save-configuration"
            class="save-button"
            type="button"
            :disabled="saving || !dirty || conflict"
            @click="save"
          >
            <Save :size="16" aria-hidden="true" />{{ saving ? '正在保存' : '保存配置文件' }}
          </button>
        </footer>
      </div>
    </template>
  </section>
</template>

<style scoped>
.configuration-section {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.section-header,
.section-header h2,
.restart-badge,
.conflict-banner,
.conflict-banner button,
.editor-toolbar,
.context-block > span,
.save-bar,
.save-success,
.save-error,
.save-button {
  display: flex;
  align-items: center;
}

.section-header,
.editor-toolbar,
.save-bar {
  justify-content: space-between;
}

.section-header {
  gap: 16px;
}

.section-header h2 {
  gap: 7px;
  font-size: 15px;
}

.section-header h2 svg {
  color: var(--color-brand-action);
}

.section-header p {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.restart-badge {
  flex: 0 0 auto;
  gap: 5px;
  padding: 4px 7px;
  color: var(--color-warning);
  font-size: 10px;
  font-weight: 700;
  background: var(--color-warning-surface);
  border: 1px solid color-mix(in srgb, var(--color-warning) 35%, transparent);
  border-radius: var(--radius-control);
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

.conflict-banner button,
.save-button {
  min-height: 34px;
  gap: 6px;
  padding: 0 10px;
  font-weight: 700;
  border-radius: var(--radius-control);
}

.conflict-banner button {
  color: var(--color-warning);
  background: var(--color-surface);
  border: 1px solid currentcolor;
}

.configuration-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 270px;
  overflow: hidden;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.editor-pane {
  display: grid;
  grid-template-rows: 37px minmax(420px, 56vh);
  min-width: 0;
  border-right: 1px solid var(--color-border);
}

.editor-toolbar {
  padding: 0 12px;
  color: var(--color-text-secondary);
  font-size: 10px;
  background: var(--color-surface-subtle);
  border-bottom: 1px solid var(--color-border);
}

.dirty-state::before {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 6px;
  content: '';
  background: var(--color-success);
  border-radius: 50%;
}

.dirty-state--active {
  color: var(--color-warning);
}

.dirty-state--active::before {
  background: var(--color-warning);
}

textarea {
  width: 100%;
  min-width: 0;
  min-height: 0;
  padding: 14px 16px;
  resize: vertical;
  color: var(--color-text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.65;
  tab-size: 2;
  background: var(--color-surface-raised);
  border: 0;
  border-radius: 0;
  outline-offset: -2px;
}

textarea[readonly] {
  color: var(--color-text-secondary);
  background: var(--color-surface-subtle);
}

.configuration-context {
  min-width: 0;
  background: var(--color-surface-raised);
}

.context-block {
  display: grid;
  gap: 7px;
  padding: 13px;
  border-bottom: 1px solid var(--color-border);
}

.context-block:last-child {
  border-bottom: 0;
}

.context-block > span {
  gap: 5px;
  color: var(--color-text-secondary);
  font-size: 10px;
  font-weight: 700;
}

.context-block strong {
  font-size: 12px;
}

.context-block code {
  overflow-wrap: anywhere;
  color: var(--color-brand-ink);
  font-family: var(--font-mono);
  font-size: 9px;
}

.context-block ul {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.context-block li {
  overflow-wrap: anywhere;
  color: var(--color-text-primary);
  font-size: 10px;
}

.context-block p {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.save-bar {
  grid-column: 1 / -1;
  min-height: 52px;
  gap: 14px;
  padding: 8px 12px;
  border-top: 1px solid var(--color-border);
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
  font-size: 10px;
}

.save-button {
  flex: 0 0 auto;
  color: white;
  background: var(--color-brand-action);
  border: 1px solid var(--color-brand-action);
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
  .configuration-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .editor-pane {
    grid-template-rows: 37px minmax(360px, 52vh);
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
  }

  .configuration-context {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .context-block {
    border-right: 1px solid var(--color-border);
    border-bottom: 0;
  }

  .context-block:last-child {
    border-right: 0;
  }
}

@media (max-width: 560px) {
  .section-header,
  .conflict-banner,
  .save-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .restart-badge {
    width: fit-content;
  }

  .conflict-banner button,
  .save-button {
    justify-content: center;
  }

  .editor-pane {
    grid-template-rows: 37px minmax(420px, 58vh);
  }

  .configuration-context {
    grid-template-columns: minmax(0, 1fr);
  }

  .context-block {
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
  }
}
</style>
