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
  cloneGlobalSettingsDraft,
  findUnknownTemplateVariables,
  toGlobalSettingsPatch,
  type GlobalSettingsDraft,
} from '@/components/settings/feature-settings'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const resource = ref<GlobalSettings | null>(null)
const draft = ref<GlobalSettingsDraft | null>(null)
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
  draft.value ? findUnknownTemplateVariables(draft.value.features.welcome.messageTemplate) : [],
)

const autoRejectReasonError = computed(() => {
  const reason = draft.value?.autoRejectReason.trim() ?? ''
  if (!reason) return '拒绝消息不能为空'
  if ([...reason].length > 500) return '拒绝消息不能超过 500 个字符'
  return null
})

const autoRejectReasonLength = computed(() => [...(draft.value?.autoRejectReason.trim() ?? '')].length)

const changedSettingCount = computed(() => {
  if (!serverCopy.value || !draft.value) return 0
  const serverDraft = cloneGlobalSettingsDraft(serverCopy.value)
  const changedFeatures = Object.keys(draft.value.features).filter(
    (key) =>
      JSON.stringify(draft.value?.features[key as keyof GlobalSettingsDraft['features']]) !==
      JSON.stringify(serverDraft.features[key as keyof GlobalSettingsDraft['features']]),
  ).length
  return changedFeatures + Number(draft.value.autoRejectReason !== serverDraft.autoRejectReason)
})

function acceptResource(value: GlobalSettings): void {
  resource.value = value
  draft.value = cloneGlobalSettingsDraft(value)
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
  if (!resource.value || !draft.value || unknownVariables.value.length || autoRejectReasonError.value) return
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
        <p v-if="serverCopy">当前草稿与服务器版本有 {{ changedSettingCount }} 项设置不同。</p>
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
          v-model="draft.features"
          mode="global"
          :disabled="saving || !auth.hasPermission('settings:write')"
        />

        <section class="join-request-settings">
          <header>
            <div>
              <h3>入群申请</h3>
              <p>AI 自动拒绝消息</p>
            </div>
            <span class="scope-label">全局</span>
          </header>
          <label class="reject-reason-field">
            <span>拒绝消息</span>
            <textarea
              v-model="draft.autoRejectReason"
              data-test="auto-reject-reason"
              rows="3"
              maxlength="500"
              :disabled="saving || !auth.hasPermission('settings:write')"
              :aria-invalid="Boolean(autoRejectReasonError)"
            />
          </label>
          <div class="field-meta">
            <span v-if="autoRejectReasonError" class="field-error" role="alert">{{ autoRejectReasonError }}</span>
            <span v-else>通过 NapCat 发送给申请人</span>
            <span class="mono">{{ autoRejectReasonLength }}/500</span>
          </div>
        </section>

        <footer class="save-bar">
          <div>
            <span v-if="saved" class="save-success" role="status"><Check :size="15" aria-hidden="true" />设置已保存</span>
            <span v-else-if="saveError" class="save-error" role="alert">{{ saveError }}</span>
            <span v-else-if="unknownVariables.length" class="save-error" role="alert">修正未知模板变量后才能保存。</span>
            <span v-else-if="autoRejectReasonError" class="save-error" role="alert">{{ autoRejectReasonError }}</span>
            <span v-else class="save-hint">保存后会生成新的运行时设置快照。</span>
          </div>
          <button
            v-if="auth.hasPermission('settings:write')"
            data-test="save-settings"
            class="save-button"
            type="button"
            :disabled="saving || !dirty || Boolean(unknownVariables.length) || Boolean(autoRejectReasonError)"
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

.join-request-settings {
  display: grid;
  gap: 12px;
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--color-border);
}

.join-request-settings > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.join-request-settings h3 {
  font-size: 15px;
  line-height: 22px;
}

.join-request-settings header p,
.field-meta {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.scope-label {
  padding: 3px 7px;
  color: var(--color-brand-action);
  font-size: 11px;
  background: var(--color-brand-surface);
  border-radius: 8px;
}

.reject-reason-field {
  display: grid;
  gap: 6px;
}

.reject-reason-field > span {
  font-size: 13px;
  font-weight: 600;
}

.reject-reason-field textarea {
  width: 100%;
  min-height: 82px;
  padding: 9px 10px;
  resize: vertical;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-control);
}

.reject-reason-field textarea[aria-invalid='true'] {
  border-color: var(--color-danger);
}

.field-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  min-height: 18px;
}

.field-error {
  color: var(--color-danger);
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
