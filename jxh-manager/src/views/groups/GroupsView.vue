<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowRight, CheckCircle2, RefreshCw, RotateCw, Search, UsersRound, X } from '@lucide/vue'

import { AdminApiError } from '@/api/client'
import { groupsApi, type GroupListQuery } from '@/api/groups'
import type { FeatureKey, Group, GroupRole, GroupSyncResult } from '@/api/types'
import ResourceState from '@/components/feedback/ResourceState.vue'
import SettingsAreaNav from '@/components/settings/SettingsAreaNav.vue'
import { FEATURE_META } from '@/components/settings/feature-settings'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const groups = ref<Group[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<unknown>(null)
const nextCursor = ref<string | null>(null)
const hasMore = ref(false)
const syncing = ref(false)
const syncResult = ref<GroupSyncResult | null>(null)
const syncError = ref<string | null>(null)

const filters = reactive<{
  query: string
  botRole: GroupRole | ''
  snapshotState: 'fresh' | 'stale' | ''
  featureKey: FeatureKey | ''
  featureEnabled: '' | 'true' | 'false'
}>({
  query: '',
  botRole: '',
  snapshotState: '',
  featureKey: '',
  featureEnabled: '',
})

const roleLabels: Record<GroupRole, string> = {
  owner: '群主',
  admin: '管理员',
  member: '成员',
  unknown: '未知',
}

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function query(cursor: string | null): GroupListQuery {
  return {
    query: filters.query.trim(),
    botRole: filters.botRole,
    snapshotState: filters.snapshotState,
    featureKey: filters.featureKey,
    featureEnabled: filters.featureEnabled === '' ? null : filters.featureEnabled === 'true',
    cursor,
  }
}

async function load(reset = true): Promise<void> {
  if (reset) loading.value = true
  else loadingMore.value = true
  error.value = null
  try {
    const result = await groupsApi.list(query(reset ? null : nextCursor.value))
    groups.value = reset ? result.items : [...groups.value, ...result.items]
    nextCursor.value = result.next_cursor
    hasMore.value = result.has_more
  } catch (reason) {
    error.value = reason
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function resetFilters(): void {
  Object.assign(filters, {
    query: '',
    botRole: '',
    snapshotState: '',
    featureKey: '',
    featureEnabled: '',
  })
  void load()
}

async function syncGroups(): Promise<void> {
  syncing.value = true
  syncError.value = null
  syncResult.value = null
  try {
    syncResult.value = await groupsApi.sync()
    await load()
  } catch (reason) {
    syncError.value = reason instanceof AdminApiError ? reason.message : '无法连接群目录同步服务。'
  } finally {
    syncing.value = false
  }
}

onMounted(() => load())
</script>

<template>
  <main class="groups-page">
    <header class="page-header">
      <div>
        <h1>群与设置</h1>
        <p>查看 NapCat 群快照，并进入群级功能覆盖。</p>
      </div>
      <button
        v-if="auth.hasPermission('groups:sync')"
        data-test="sync-groups"
        class="primary-action"
        type="button"
        :disabled="syncing"
        @click="syncGroups"
      >
        <RotateCw :size="17" :class="{ spin: syncing }" aria-hidden="true" />
        {{ syncing ? '正在同步' : '同步群目录' }}
      </button>
    </header>

    <SettingsAreaNav />

    <form data-test="group-filters" class="filter-bar" @submit.prevent="load()">
      <label class="search-field">
        <span class="sr-only">搜索群名或群号</span>
        <Search :size="16" aria-hidden="true" />
        <input name="query" v-model="filters.query" placeholder="搜索群名或完整群号" />
      </label>
      <label>
        <span class="sr-only">Bot 群角色</span>
        <select v-model="filters.botRole" name="bot_role">
          <option value="">全部角色</option>
          <option value="owner">群主</option>
          <option value="admin">管理员</option>
          <option value="member">成员</option>
          <option value="unknown">未知</option>
        </select>
      </label>
      <label>
        <span class="sr-only">快照状态</span>
        <select v-model="filters.snapshotState" name="snapshot_state">
          <option value="">全部快照</option>
          <option value="fresh">最新快照</option>
          <option value="stale">陈旧快照</option>
        </select>
      </label>
      <label>
        <span class="sr-only">功能</span>
        <select v-model="filters.featureKey" name="feature_key">
          <option value="">全部功能</option>
          <option v-for="(meta, key) in FEATURE_META" :key="key" :value="key">{{ meta.label }}</option>
        </select>
      </label>
      <label>
        <span class="sr-only">功能状态</span>
        <select v-model="filters.featureEnabled" name="feature_enabled" :disabled="!filters.featureKey">
          <option value="">全部状态</option>
          <option value="true">已启用</option>
          <option value="false">已停用</option>
        </select>
      </label>
      <button class="filter-submit" type="submit">应用筛选</button>
      <button class="icon-action" type="button" title="清除筛选" aria-label="清除筛选" @click="resetFilters">
        <X :size="16" aria-hidden="true" />
      </button>
    </form>

    <div v-if="syncResult" class="operation-result operation-result--success" role="status">
      <CheckCircle2 :size="18" aria-hidden="true" />
      <span>同步完成：新增 {{ syncResult.added_count }}，更新 {{ syncResult.updated_count }}，移除 {{ syncResult.removed_count }}。</span>
      <small class="mono">总计 {{ syncResult.total_count }}</small>
    </div>
    <div v-else-if="syncError" class="operation-result operation-result--error" role="alert">
      {{ syncError }}
    </div>

    <ResourceState
      v-if="loading"
      state="loading"
      title="正在读取群目录"
      description="正在获取最近一次成功同步的群快照。"
    />
    <ResourceState
      v-else-if="error"
      state="error"
      title="群目录读取失败"
      description="现有筛选未被清除，可以直接重试。"
      @retry="load()"
    />
    <ResourceState
      v-else-if="!groups.length"
      state="empty"
      title="没有符合条件的群"
      description="调整筛选条件，或在 NapCat 可用后同步群目录。"
    />

    <section v-else class="group-directory" aria-label="群目录">
      <div class="directory-heading group-grid" aria-hidden="true">
        <span>群</span>
        <span>成员</span>
        <span>Bot 角色</span>
        <span>快照</span>
        <span>功能</span>
        <span>操作</span>
      </div>
      <article v-for="group in groups" :key="group.group_id" class="group-row group-grid">
        <div class="group-identity">
          <UsersRound :size="18" aria-hidden="true" />
          <div>
            <strong>{{ group.name }}</strong>
            <span class="mono">{{ group.group_id }}</span>
          </div>
        </div>
        <span class="member-count mono" data-label="成员">{{ group.member_count }} / {{ group.max_member_count }}</span>
        <span class="role-label">{{ roleLabels[group.bot_role] }}</span>
        <div data-label="快照">
          <span :class="['status-badge', `status-badge--${group.snapshot_state}`]">
            {{ group.snapshot_state === 'fresh' ? '最新快照' : '陈旧快照' }}
          </span>
          <small class="snapshot-time mono">{{ timeFormatter.format(new Date(group.last_synced_at)) }}</small>
        </div>
        <div class="feature-summary">
          <span>{{ group.features.filter((feature) => feature.enabled).length }} / {{ group.features.length }} 启用</span>
          <small v-if="group.features.some((feature) => feature.source === 'group_override')">含群级覆盖</small>
        </div>
        <RouterLink :to="`/groups/${group.group_id}`" class="row-action">
          查看详情 <ArrowRight :size="15" aria-hidden="true" />
        </RouterLink>
      </article>
    </section>

    <button v-if="hasMore" class="load-more" type="button" :disabled="loadingMore" @click="load(false)">
      <RefreshCw :size="16" :class="{ spin: loadingMore }" aria-hidden="true" />
      {{ loadingMore ? '正在读取' : '加载更多' }}
    </button>
  </main>
</template>

<style scoped>
.groups-page {
  display: grid;
  gap: 16px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.page-header h1 {
  font-size: 24px;
  line-height: 34px;
}

.page-header p {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.primary-action,
.filter-submit,
.load-more,
.icon-action {
  display: flex;
  height: 38px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 12px;
  border-radius: var(--radius-control);
}

.primary-action {
  color: white;
  font-weight: 600;
  background: var(--color-brand-action);
  border: 1px solid var(--color-brand-action);
}

.primary-action:hover:not(:disabled) {
  background: var(--color-brand-action-hover);
}

.filter-bar {
  display: grid;
  grid-template-columns: minmax(220px, 1.4fr) repeat(4, minmax(120px, 0.65fr)) auto 38px;
  gap: 8px;
  align-items: center;
}

.filter-bar select,
.search-field {
  width: 100%;
  height: 38px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}

.filter-bar select {
  padding: 0 28px 0 9px;
}

.search-field {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 7px;
  align-items: center;
  padding: 0 10px;
  color: var(--color-text-secondary);
}

.search-field input {
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
}

.filter-submit {
  color: var(--color-brand-action);
  font-weight: 600;
  background: var(--color-surface);
  border: 1px solid var(--color-brand-border);
}

.icon-action {
  width: 38px;
  padding: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.operation-result {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 42px;
  padding: 8px 12px;
  font-size: 12px;
  border-left: 3px solid currentcolor;
}

.operation-result--success {
  color: var(--color-success);
  background: var(--color-success-surface);
}

.operation-result--error {
  color: var(--color-danger);
  background: var(--color-danger-surface);
}

.group-directory {
  min-width: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.group-grid {
  display: grid;
  grid-template-columns: minmax(220px, 1.5fr) 120px 100px 140px minmax(110px, 0.7fr) 92px;
  gap: 14px;
  align-items: center;
}

.directory-heading {
  min-height: 38px;
  padding: 0 14px;
  color: var(--color-text-secondary);
  font-size: 11px;
  background: var(--color-surface-subtle);
  border-bottom: 1px solid var(--color-border);
}

.group-row {
  min-height: 64px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--color-border);
}

.group-row:last-child {
  border-bottom: 0;
}

.group-row:hover {
  background: var(--color-surface-raised);
}

.group-identity {
  display: grid;
  min-width: 0;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 9px;
  align-items: center;
  color: var(--color-brand-ink);
}

.group-identity div,
.feature-summary,
.group-row > div:nth-child(4) {
  display: grid;
  min-width: 0;
}

.group-identity strong {
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-identity span,
.snapshot-time,
.feature-summary small {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.member-count,
.role-label,
.feature-summary {
  font-size: 12px;
}

.status-badge {
  width: fit-content;
  padding: 2px 6px;
  color: var(--color-success);
  font-size: 10px;
  background: var(--color-success-surface);
  border-radius: 8px;
}

.status-badge--stale {
  color: var(--color-warning);
  background: var(--color-warning-surface);
}

.row-action {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  color: var(--color-brand-action);
  font-size: 12px;
  font-weight: 600;
}

.load-more {
  justify-self: center;
  color: var(--color-text-secondary);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.spin {
  animation: spin 700ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1180px) {
  .filter-bar {
    grid-template-columns: minmax(220px, 1fr) repeat(2, minmax(120px, 0.5fr)) auto 38px;
  }

  .filter-bar label:nth-of-type(4),
  .filter-bar label:nth-of-type(5) {
    display: none;
  }

  .group-grid {
    grid-template-columns: minmax(220px, 1fr) 110px 100px 140px 92px;
  }

  .directory-heading span:nth-child(5),
  .feature-summary {
    display: none;
  }
}

@media (max-width: 720px) {
  .page-header {
    flex-direction: column;
  }

  .primary-action {
    width: 100%;
  }

  .filter-bar {
    grid-template-columns: 1fr 1fr 38px;
  }

  .search-field {
    grid-column: 1 / -1;
  }

  .filter-bar label:nth-of-type(3) {
    display: block;
  }

  .filter-bar label:nth-of-type(2),
  .filter-bar label:nth-of-type(4),
  .filter-bar label:nth-of-type(5) {
    display: none;
  }

  .directory-heading.group-grid {
    display: none;
  }

  .group-directory {
    background: transparent;
    border: 0;
  }

  .group-row,
  .group-grid {
    display: grid;
    grid-template-columns: 1fr auto;
  }

  .group-row {
    gap: 10px 12px;
    margin-bottom: 8px;
    padding: 12px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
  }

  .group-identity {
    grid-column: 1 / -1;
  }

  .group-row > [data-label]::before {
    display: block;
    color: var(--color-text-secondary);
    content: attr(data-label);
    font-size: 10px;
  }

  .role-label,
  .feature-summary {
    display: none;
  }

  .row-action {
    align-self: end;
  }
}
</style>
