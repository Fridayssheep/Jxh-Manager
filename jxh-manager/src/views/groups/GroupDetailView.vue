<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft, Check, Save, Trash2, UsersRound } from '@lucide/vue'

import { AdminApiError } from '@/api/client'
import { groupsApi } from '@/api/groups'
import { settingsApi } from '@/api/settings'
import type { Group, GroupSettings } from '@/api/types'
import ResourceState from '@/components/feedback/ResourceState.vue'
import VersionConflict from '@/components/feedback/VersionConflict.vue'
import FeatureSettingsForm from '@/components/settings/FeatureSettingsForm.vue'
import {
  cloneGroupDraft,
  findUnknownTemplateVariables,
  toGroupSettingsPatch,
  type FeatureSettingsDraft,
} from '@/components/settings/feature-settings'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const auth = useAuthStore()
const groupId = computed(() => String(route.params.groupId))
const group = ref<Group | null>(null)
const resource = ref<GroupSettings | null>(null)
const draft = ref<FeatureSettingsDraft | null>(null)
const initialDraft = ref('')
const loading = ref(false)
const saving = ref(false)
const comparing = ref(false)
const clearing = ref(false)
const confirmClear = ref(false)
const error = ref<unknown>(null)
const saveError = ref<string | null>(null)
const saved = ref(false)
const conflict = ref(false)
const serverCopy = ref<GroupSettings | null>(null)

const dirty = computed(() => Boolean(draft.value && JSON.stringify(draft.value) !== initialDraft.value))
const unknownVariables = computed(() =>
  draft.value ? findUnknownTemplateVariables(draft.value.welcome.messageTemplate) : [],
)
const overrideCount = computed(() =>
  resource.value ? Object.keys(resource.value.overrides).length : 0,
)

const roleLabels = { owner: '群主', admin: '管理员', member: '普通成员', unknown: '未知角色' }
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function acceptSettings(value: GroupSettings): void {
  resource.value = value
  draft.value = cloneGroupDraft(value)
  initialDraft.value = JSON.stringify(draft.value)
  conflict.value = false
  serverCopy.value = null
  confirmClear.value = false
  saved.value = false
}

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const [nextGroup, nextSettings] = await Promise.all([
      groupsApi.get(groupId.value),
      settingsApi.getGroup(groupId.value),
    ])
    group.value = nextGroup
    acceptSettings(nextSettings)
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
    acceptSettings(
      await settingsApi.updateGroup(
        groupId.value,
        toGroupSettingsPatch(draft.value),
        resource.value.version,
      ),
    )
    saved.value = true
  } catch (reason) {
    if (reason instanceof AdminApiError && reason.status === 409) conflict.value = true
    else saveError.value = reason instanceof AdminApiError ? reason.message : '群级设置保存失败。'
  } finally {
    saving.value = false
  }
}

async function compareWithServer(): Promise<void> {
  comparing.value = true
  try {
    serverCopy.value = await settingsApi.getGroup(groupId.value)
  } catch (reason) {
    saveError.value = reason instanceof AdminApiError ? reason.message : '无法读取服务器版本。'
  } finally {
    comparing.value = false
  }
}

async function clearOverrides(): Promise<void> {
  if (!resource.value) return
  clearing.value = true
  saveError.value = null
  try {
    await settingsApi.clearGroup(groupId.value, resource.value.version)
    acceptSettings(await settingsApi.getGroup(groupId.value))
    saved.value = true
  } catch (reason) {
    if (reason instanceof AdminApiError && reason.status === 409) conflict.value = true
    else saveError.value = reason instanceof AdminApiError ? reason.message : '清除覆盖失败。'
  } finally {
    clearing.value = false
  }
}

onMounted(load)
</script>

<template>
  <main class="group-detail-page">
    <RouterLink class="back-link" to="/groups"><ArrowLeft :size="16" aria-hidden="true" />返回群目录</RouterLink>

    <ResourceState
      v-if="loading && !resource"
      state="loading"
      title="正在读取群详情"
      description="同时读取群快照和有效功能设置。"
    />
    <ResourceState
      v-else-if="error && !resource"
      state="error"
      title="群详情读取失败"
      description="群可能已退出，或管理服务暂时不可用。"
      @retry="load"
    />

    <template v-else-if="group && resource && draft">
      <header class="group-header">
        <div class="group-title">
          <div class="group-icon"><UsersRound :size="20" aria-hidden="true" /></div>
          <div>
            <h1>{{ group.name }}</h1>
            <span class="mono">群号 {{ group.group_id }}</span>
          </div>
        </div>
        <div class="group-facts">
          <div><span>成员</span><strong class="mono">{{ group.member_count }} / {{ group.max_member_count }}</strong></div>
          <div><span>Bot 角色</span><strong>{{ roleLabels[group.bot_role] }}</strong></div>
          <div><span>快照</span><strong :class="group.snapshot_state === 'stale' ? 'warning' : 'success'">{{ group.snapshot_state === 'stale' ? '陈旧' : '最新' }}</strong></div>
        </div>
      </header>

      <div v-if="group.snapshot_state === 'stale'" class="stale-warning" role="status">
        当前展示最后一次成功快照，成功同步时间为 {{ timeFormatter.format(new Date(group.last_synced_at)) }}。
      </div>

      <VersionConflict
        v-if="conflict"
        :loaded-version="resource.version"
        :server-version="serverCopy?.version"
        :comparing="comparing"
        @compare="compareWithServer"
        @reload="load"
      />

      <section class="settings-workspace">
        <header class="section-header">
          <div>
            <h2>群级功能覆盖</h2>
            <p>“继承”实时使用全局值；只有明确启用或停用时才写入群级覆盖。</p>
          </div>
          <div class="settings-meta">
            <span>{{ overrideCount }} 项覆盖</span>
            <span class="mono">版本 {{ resource.version }} · 全局 {{ resource.global_version }}</span>
          </div>
        </header>

        <FeatureSettingsForm
          v-model="draft"
          mode="group"
          :effective="resource.effective"
          :disabled="saving || clearing || !auth.hasPermission('settings:write')"
        />

        <footer class="save-bar">
          <div>
            <span v-if="saved" class="save-success" role="status"><Check :size="15" aria-hidden="true" />设置已更新</span>
            <span v-else-if="saveError" class="save-error" role="alert">{{ saveError }}</span>
            <span v-else-if="unknownVariables.length" class="save-error" role="alert">修正未知模板变量后才能保存。</span>
            <span v-else-if="dirty" class="save-hint">保存将更新 {{ group.name }} 的运行时快照。</span>
            <span v-else class="save-hint">当前没有未保存修改。</span>
          </div>
          <div v-if="auth.hasPermission('settings:write')" class="save-actions">
            <template v-if="confirmClear">
              <span>确认恢复全部全局默认值？</span>
              <button class="cancel-button" type="button" @click="confirmClear = false">取消</button>
              <button class="clear-confirm" type="button" :disabled="clearing" @click="clearOverrides">
                {{ clearing ? '正在清除' : '清除全部覆盖' }}
              </button>
            </template>
            <button
              v-else-if="overrideCount"
              class="clear-button"
              type="button"
              @click="confirmClear = true"
            >
              <Trash2 :size="15" aria-hidden="true" />清除覆盖
            </button>
            <button
              data-test="save-settings"
              class="save-button"
              type="button"
              :disabled="saving || !dirty || Boolean(unknownVariables.length)"
              @click="save"
            >
              <Save :size="16" aria-hidden="true" />{{ saving ? '正在保存' : '保存群级设置' }}
            </button>
          </div>
        </footer>
      </section>
    </template>
  </main>
</template>

<style scoped>
.group-detail-page {
  display: grid;
  gap: 16px;
}

.back-link {
  display: flex;
  width: fit-content;
  align-items: center;
  gap: 5px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.back-link:hover {
  color: var(--color-brand-action);
}

.group-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.group-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 11px;
}

.group-icon {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--color-brand-ink);
  background: var(--color-brand-surface);
  border-radius: var(--radius-panel);
}

.group-title h1 {
  overflow: hidden;
  font-size: 24px;
  line-height: 32px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-title span,
.group-facts span {
  color: var(--color-text-secondary);
  font-size: 11px;
}

.group-facts {
  display: flex;
  gap: 24px;
}

.group-facts div,
.settings-meta {
  display: grid;
}

.group-facts strong {
  font-size: 13px;
}

.success { color: var(--color-success); }
.warning { color: var(--color-warning); }

.stale-warning {
  padding: 9px 12px;
  color: var(--color-warning);
  font-size: 12px;
  background: var(--color-warning-surface);
  border-left: 3px solid var(--color-warning);
}

.settings-workspace {
  padding: 18px 20px 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.section-header,
.save-bar,
.save-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-header {
  align-items: flex-start;
  padding-bottom: 14px;
}

.section-header h2 {
  font-size: 16px;
}

.section-header p,
.settings-meta span,
.save-hint,
.save-error,
.save-success {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.settings-meta {
  text-align: right;
}

.save-bar {
  min-height: 64px;
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

.save-actions > span {
  color: var(--color-warning);
  font-size: 12px;
}

.save-actions button {
  display: flex;
  height: 36px;
  align-items: center;
  gap: 6px;
  padding: 0 11px;
  font-size: 12px;
  font-weight: 600;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}

.save-actions .save-button {
  color: white;
  background: var(--color-brand-action);
  border-color: var(--color-brand-action);
}

.save-actions .save-button:disabled {
  color: var(--color-text-disabled);
  background: var(--color-surface-subtle);
  border-color: var(--color-border);
}

.save-actions .clear-button,
.save-actions .clear-confirm {
  color: var(--color-danger);
  border-color: var(--color-danger);
}

.save-actions .clear-confirm {
  color: white;
  background: var(--color-danger);
}

@media (max-width: 760px) {
  .group-header,
  .section-header,
  .save-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .group-facts {
    justify-content: space-between;
    gap: 12px;
  }

  .settings-meta {
    text-align: left;
  }

  .settings-workspace {
    padding: 14px 14px 0;
  }

  .save-bar {
    padding: 12px 0 14px;
  }

  .save-actions {
    flex-wrap: wrap;
  }

  .save-actions .save-button {
    margin-left: auto;
  }
}
</style>
