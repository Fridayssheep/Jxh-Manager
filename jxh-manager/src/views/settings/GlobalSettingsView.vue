<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Check, Save } from '@lucide/vue'

import { AdminApiError } from '@/api/client'
import { settingsApi } from '@/api/settings'
import type { GlobalSettings } from '@/api/types'
import ResourceState from '@/components/feedback/ResourceState.vue'
import VersionConflict from '@/components/feedback/VersionConflict.vue'
import FeatureSettingsForm from '@/components/settings/FeatureSettingsForm.vue'
import SettingsAreaNav from '@/components/settings/SettingsAreaNav.vue'
import {
  cloneGlobalDraft,
  findUnknownTemplateVariables,
  toGlobalSettingsPatch,
  type FeatureSettingsDraft,
} from '@/components/settings/feature-settings'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const resource = ref<GlobalSettings | null>(null)
const draft = ref<FeatureSettingsDraft | null>(null)
const initialDraft = ref('')
const loading = ref(false)
const saving = ref(false)
const comparing = ref(false)
const error = ref<unknown>(null)
const saveError = ref<string | null>(null)
const saved = ref(false)
const conflict = ref(false)
const serverCopy = ref<GlobalSettings | null>(null)

const dirty = computed(() => Boolean(draft.value && JSON.stringify(draft.value) !== initialDraft.value))
const unknownVariables = computed(() =>
  draft.value ? findUnknownTemplateVariables(draft.value.welcome.messageTemplate) : [],
)

const changedFeatureCount = computed(() => {
  if (!serverCopy.value || !draft.value) return 0
  const serverDraft = cloneGlobalDraft(serverCopy.value.features)
  return Object.keys(draft.value).filter(
    (key) =>
      JSON.stringify(draft.value?.[key as keyof FeatureSettingsDraft]) !==
      JSON.stringify(serverDraft[key as keyof FeatureSettingsDraft]),
  ).length
})

function acceptResource(value: GlobalSettings): void {
  resource.value = value
  draft.value = cloneGlobalDraft(value.features)
  initialDraft.value = JSON.stringify(draft.value)
  conflict.value = false
  serverCopy.value = null
  saved.value = false
}

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    acceptResource(await settingsApi.getGlobal())
  } catch (reason) {
    error.value = reason
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (!resource.value || !draft.value || unknownVariables.value.length) return
  saving.value = true
  saveError.value = null
  saved.value = false
  try {
    acceptResource(
      await settingsApi.updateGlobal(toGlobalSettingsPatch(draft.value), resource.value.version),
    )
    saved.value = true
  } catch (reason) {
    if (reason instanceof AdminApiError && reason.status === 409) conflict.value = true
    else saveError.value = reason instanceof AdminApiError ? reason.message : '设置保存失败，请检查网络后重试。'
  } finally {
    saving.value = false
  }
}

async function compareWithServer(): Promise<void> {
  comparing.value = true
  saveError.value = null
  try {
    serverCopy.value = await settingsApi.getGlobal()
  } catch (reason) {
    saveError.value = reason instanceof AdminApiError ? reason.message : '无法读取服务器版本。'
  } finally {
    comparing.value = false
  }
}

onMounted(load)
</script>

<template>
  <main class="settings-page">
    <header class="page-header">
      <div>
        <h1>群与设置</h1>
        <p>配置所有群默认继承的功能开关与欢迎文案。</p>
      </div>
      <div v-if="resource" class="version-meta mono">版本 {{ resource.version }}</div>
    </header>

    <SettingsAreaNav />

    <ResourceState
      v-if="loading && !resource"
      state="loading"
      title="正在读取全局设置"
      description="读取完成前不会使用浏览器缓存中的旧值。"
    />
    <ResourceState
      v-else-if="error && !resource"
      state="error"
      title="全局设置读取失败"
      description="请恢复连接后重试。"
      @retry="load"
    />

    <template v-else-if="resource && draft">
      <VersionConflict
        v-if="conflict"
        :loaded-version="resource.version"
        :server-version="serverCopy?.version"
        :comparing="comparing"
        @compare="compareWithServer"
        @reload="load"
      >
        <p v-if="serverCopy">当前草稿与服务器版本有 {{ changedFeatureCount }} 项功能设置不同。</p>
      </VersionConflict>

      <section class="settings-workspace">
        <header class="section-header">
          <div>
            <h2>全局功能默认值</h2>
            <p>群级未设置覆盖时，运行时直接继承这里的值。</p>
          </div>
          <span v-if="dirty" class="dirty-indicator">有未保存修改</span>
        </header>

        <FeatureSettingsForm
          v-model="draft"
          mode="global"
          :disabled="saving || !auth.hasPermission('settings:write')"
        />

        <footer class="save-bar">
          <div>
            <span v-if="saved" class="save-success" role="status"><Check :size="15" aria-hidden="true" />设置已保存</span>
            <span v-else-if="saveError" class="save-error" role="alert">{{ saveError }}</span>
            <span v-else-if="unknownVariables.length" class="save-error" role="alert">修正未知模板变量后才能保存。</span>
            <span v-else class="save-hint">保存后会生成新的运行时设置快照。</span>
          </div>
          <button
            v-if="auth.hasPermission('settings:write')"
            data-test="save-settings"
            class="save-button"
            type="button"
            :disabled="saving || !dirty || Boolean(unknownVariables.length)"
            @click="save"
          >
            <Save :size="16" aria-hidden="true" />
            {{ saving ? '正在保存' : '保存全局设置' }}
          </button>
        </footer>
      </section>
    </template>
  </main>
</template>

<style scoped>
.settings-page {
  display: grid;
  gap: 16px;
}

.page-header,
.section-header,
.save-bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.page-header h1 {
  font-size: 24px;
  line-height: 34px;
}

.page-header p,
.section-header p {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.version-meta {
  padding-top: 9px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.settings-workspace {
  padding: 18px 20px 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.section-header {
  padding-bottom: 14px;
}

.section-header h2 {
  font-size: 16px;
  line-height: 24px;
}

.dirty-indicator {
  padding: 3px 7px;
  color: var(--color-warning);
  font-size: 11px;
  background: var(--color-warning-surface);
  border-radius: 8px;
}

.save-bar {
  min-height: 64px;
  align-items: center;
}

.save-bar > div {
  display: flex;
  min-width: 0;
  align-items: center;
}

.save-hint,
.save-success,
.save-error {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.save-success {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--color-success);
}

.save-error {
  color: var(--color-danger);
}

.save-button {
  display: flex;
  height: 38px;
  align-items: center;
  gap: 7px;
  padding: 0 13px;
  color: white;
  font-weight: 600;
  background: var(--color-brand-action);
  border: 1px solid var(--color-brand-action);
  border-radius: var(--radius-control);
}

.save-button:disabled {
  color: var(--color-text-disabled);
  background: var(--color-surface-subtle);
  border-color: var(--color-border);
}

@media (max-width: 620px) {
  .settings-workspace {
    padding: 14px 14px 0;
  }

  .save-bar {
    align-items: stretch;
    flex-direction: column;
    padding: 12px 0 14px;
  }

  .save-button {
    justify-content: center;
  }
}
</style>
