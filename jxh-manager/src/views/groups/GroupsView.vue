<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowRight, BellRing, RefreshCw, Search, Send, UsersRound, X } from '@lucide/vue'

import { AdminApiError, createIdempotencyKey } from '@/api/client'
import { groupsApi, type GroupListQuery } from '@/api/groups'
import { joinRequestsApi } from '@/api/join-requests'
import type {
  FeatureKey,
  Group,
  GroupNoticePublishItemStatus,
  GroupNoticePublishResult,
  GroupRole,
  JoinRequestPolicyPatch,
} from '@/api/types'
import OperationNotice from '@/components/feedback/OperationNotice.vue'
import ResourceState from '@/components/feedback/ResourceState.vue'
import AppMultiSelect, { type AppMultiSelectOption } from '@/components/form/AppMultiSelect.vue'
import AppSelect, { type AppSelectOption } from '@/components/form/AppSelect.vue'
import GroupJoinPolicyControls from '@/components/groups/GroupJoinPolicyControls.vue'
import AppOverlayTransition from '@/components/motion/AppOverlayTransition.vue'
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
const directoryRefreshing = ref(false)
const refreshError = ref<string | null>(null)
const policyBusyIds = ref<Set<string>>(new Set())
const policyNotice = ref<string | null>(null)
const policyNoticeTone = ref<'success' | 'warning' | 'danger'>('success')
const noticeGroups = ref<Group[]>([])
const noticeGroupsError = ref<string | null>(null)
const noticeEditorOpen = ref(false)
const publishing = ref(false)
const publicationUncertain = ref(false)
const publicationKey = ref('')
const publicationPayload = ref<{ group_ids: string[]; content: string } | null>(null)
const publicationResult = ref<GroupNoticePublishResult | null>(null)
const publicationNotice = ref<string | null>(null)
const publicationTone = ref<'success' | 'warning' | 'danger' | 'unknown'>('success')
const noticeForm = reactive({ groupIds: [] as string[], content: '' })

const filters = reactive<{
  query: string
  botRole: GroupRole | ''
  featureKey: FeatureKey | ''
  featureEnabled: '' | 'true' | 'false'
}>({
  query: '',
  botRole: '',
  featureKey: '',
  featureEnabled: '',
})

const roleLabels: Record<GroupRole, string> = {
  owner: '群主',
  admin: '管理员',
  member: '成员',
  unknown: '未知',
}
const roleOptions: readonly AppSelectOption[] = [
  { value: '', label: '全部角色' },
  ...Object.entries(roleLabels).map(([value, label]) => ({ value, label })),
]
const featureOptions: readonly AppSelectOption[] = [
  { value: '', label: '全部功能' },
  ...Object.entries(FEATURE_META).map(([value, meta]) => ({ value, label: meta.label })),
]
const enabledOptions: readonly AppSelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'true', label: '已启用' },
  { value: 'false', label: '已停用' },
]

const noticeOptions = computed<readonly AppMultiSelectOption[]>(() =>
  noticeGroups.value.map((group) => {
    const allowed = group.bot_role === 'owner' || group.bot_role === 'admin'
    return {
      value: group.group_id,
      label: group.name,
      description: group.group_id,
      meta: roleLabels[group.bot_role],
      disabled: !allowed,
      disabledReason: allowed ? undefined : '精小弘必须是群主或管理员才能发布公告',
    }
  }),
)
const publishableGroupCount = computed(
  () =>
    noticeGroups.value.filter((group) => group.bot_role === 'owner' || group.bot_role === 'admin')
      .length,
)
const noticeContentLength = computed(() => Array.from(noticeForm.content).length)
const canPublish = computed(
  () =>
    noticeForm.groupIds.length > 0 &&
    noticeForm.groupIds.length <= 50 &&
    noticeForm.content.trim().length > 0 &&
    noticeContentLength.value <= 5000 &&
    !publishing.value,
)

const publicationStatusLabels: Record<GroupNoticePublishItemStatus, string> = {
  success: '已发布',
  denied: '权限不足',
  failed: '发布失败',
  unknown: '结果未知',
}

function query(cursor: string | null): GroupListQuery {
  return {
    query: filters.query.trim(),
    botRole: filters.botRole,
    featureKey: filters.featureKey,
    featureEnabled: filters.featureEnabled === '' ? null : filters.featureEnabled === 'true',
    cursor,
  }
}

function setBotRole(value: string): void {
  filters.botRole = value as GroupRole | ''
}
function setFeatureKey(value: string): void {
  filters.featureKey = value as FeatureKey | ''
  if (!value) filters.featureEnabled = ''
}
function setFeatureEnabled(value: string): void {
  filters.featureEnabled = value as '' | 'true' | 'false'
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
    featureKey: '',
    featureEnabled: '',
  })
  void load()
}

async function loadNoticeGroups(): Promise<void> {
  noticeGroupsError.value = null
  try {
    const items: Group[] = []
    let cursor: string | null = null
    let pageCount = 0
    do {
      const page = await groupsApi.list({
        query: '',
        botRole: '',
        featureKey: '',
        featureEnabled: null,
        cursor,
        limit: 100,
      })
      items.push(...page.items)
      cursor = page.has_more ? page.next_cursor : null
      pageCount += 1
    } while (cursor && pageCount < 50)
    noticeGroups.value = items
  } catch (reason) {
    noticeGroupsError.value = reason instanceof AdminApiError ? reason.message : '群列表读取失败。'
    if (!noticeGroups.value.length) noticeGroups.value = [...groups.value]
  }
}

async function initializePage(): Promise<void> {
  directoryRefreshing.value = true
  refreshError.value = null
  if (auth.hasPermission('groups:sync')) {
    try {
      await groupsApi.sync()
    } catch (reason) {
      refreshError.value =
        reason instanceof AdminApiError ? reason.message : '无法连接群目录同步服务。'
    }
  }
  await load()
  await loadNoticeGroups()
  directoryRefreshing.value = false
}

function openNoticeEditor(): void {
  if (publicationUncertain.value && publicationPayload.value) {
    noticeForm.groupIds = [...publicationPayload.value.group_ids]
    noticeForm.content = publicationPayload.value.content
    publicationNotice.value ??= '发布结果尚未确认，请使用原目标群和内容继续确认。'
  } else {
    noticeForm.groupIds = []
    noticeForm.content = ''
    publicationKey.value = createIdempotencyKey()
    publicationPayload.value = null
    publicationUncertain.value = false
  }
  noticeEditorOpen.value = true
  if (!noticeGroups.value.length) void loadNoticeGroups()
}

function resetPublicationAttempt(): void {
  if (publicationUncertain.value) return
  publicationPayload.value = null
  publicationKey.value = createIdempotencyKey()
}

function updateNoticeGroupIds(value: string[]): void {
  resetPublicationAttempt()
  noticeForm.groupIds = value
}

function closeNoticeEditor(): void {
  if (publishing.value) return
  noticeEditorOpen.value = false
}

function noticeErrorMessage(code?: string): string {
  const labels: Record<string, string> = {
    bot_not_group_admin: '精小弘不再是群主或管理员',
    dependency_unavailable: 'NapCat 当前不可用',
    upstream_timeout: 'NapCat 响应超时',
    request_canceled: '请求已取消',
    invalid_group_id: '群号无效',
    role_lookup_failed: '无法确认精小弘的群角色',
  }
  return code ? (labels[code] ?? code) : ''
}

function applyPublicationRoles(result: GroupNoticePublishResult): void {
  const roles = new Map(result.items.map((item) => [item.group.group_id, item.bot_role]))
  const apply = (items: Group[]) =>
    items.map((group) => {
      const role = roles.get(group.group_id)
      return role ? { ...group, bot_role: role } : group
    })
  groups.value = apply(groups.value)
  noticeGroups.value = apply(noticeGroups.value)
}

function summarizePublication(result: GroupNoticePublishResult): string {
  return `公告发布完成：成功 ${result.published_count}，权限不足 ${result.denied_count}，失败 ${result.failed_count}，结果未知 ${result.unknown_count}。`
}

async function publishNotice(): Promise<void> {
  if (!canPublish.value && !publicationUncertain.value) return
  if (!publicationPayload.value) {
    publicationPayload.value = {
      group_ids: [...noticeForm.groupIds],
      content: noticeForm.content.trim(),
    }
  }
  publishing.value = true
  publicationNotice.value = null
  try {
    const result = await groupsApi.publishNotices(publicationPayload.value, publicationKey.value)
    publicationResult.value = result
    publicationUncertain.value = false
    applyPublicationRoles(result)
    publicationTone.value =
      result.status === 'success'
        ? 'success'
        : result.status === 'partial'
          ? 'warning'
          : result.status === 'unknown'
            ? 'unknown'
            : 'danger'
    publicationNotice.value = summarizePublication(result)
    noticeEditorOpen.value = false
  } catch (reason) {
    if (reason instanceof TypeError) {
      publicationUncertain.value = true
      publicationTone.value = 'unknown'
      publicationNotice.value =
        '连接已中断，发布结果未知。请保持目标群和内容不变，再次确认发布结果。'
    } else {
      const isInProgress =
        reason instanceof AdminApiError && reason.status === 409 && reason.retryable
      if (isInProgress) publicationUncertain.value = true
      publicationTone.value = isInProgress ? 'warning' : 'danger'
      publicationNotice.value =
        reason instanceof AdminApiError ? reason.message : '群公告发布失败。'
    }
  } finally {
    publishing.value = false
  }
}

function setPolicyBusy(groupId: string, busy: boolean): void {
  const next = new Set(policyBusyIds.value)
  if (busy) next.add(groupId)
  else next.delete(groupId)
  policyBusyIds.value = next
}

function restorePolicyView(groupId: string): void {
  groups.value = groups.value.map((group) =>
    group.group_id === groupId
      ? { ...group, join_request_policy: { ...group.join_request_policy } }
      : group,
  )
}

async function updateJoinPolicy(group: Group, patch: JoinRequestPolicyPatch): Promise<void> {
  if (!auth.hasPermission('join_policies:write') || policyBusyIds.value.has(group.group_id)) return

  setPolicyBusy(group.group_id, true)
  policyNotice.value = null
  try {
    const updated = await joinRequestsApi.updatePolicy(
      group.group_id,
      patch,
      group.join_request_policy.version,
    )
    groups.value = groups.value.map((item) =>
      item.group_id === group.group_id
        ? {
            ...item,
            join_request_policy: {
              enabled: updated.enabled,
              auto_reject: updated.auto_reject,
              version: updated.version,
            },
          }
        : item,
    )
    policyNoticeTone.value = 'success'
    const policyName = 'enabled' in patch ? '自动批准' : '自动拒绝'
    const enabled = 'enabled' in patch ? patch.enabled : patch.auto_reject
    policyNotice.value = `已${enabled ? '启用' : '停用'} ${group.name}的${policyName}。`
  } catch (reason) {
    if (reason instanceof AdminApiError && reason.status === 409) {
      policyNoticeTone.value = 'warning'
      policyNotice.value = '该群自动审核策略已被其他管理员修改，已重新加载。'
      await load()
    } else {
      policyNoticeTone.value = 'danger'
      policyNotice.value =
        reason instanceof AdminApiError ? reason.message : '自动审核策略保存失败。'
      restorePolicyView(group.group_id)
    }
  } finally {
    setPolicyBusy(group.group_id, false)
  }
}

onMounted(() => {
  void initializePage()
})
</script>

<template>
  <main class="groups-page">
    <header class="page-header">
      <div>
        <h1>群与设置</h1>
      </div>
      <button
        v-if="auth.hasPermission('group_notices:write')"
        data-test="publish-group-notice"
        class="primary-action"
        type="button"
        :disabled="directoryRefreshing"
        @click="openNoticeEditor"
      >
        <BellRing :size="17" aria-hidden="true" />
        发布公告
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
        <AppSelect
          :model-value="filters.botRole"
          :options="roleOptions"
          accessible-name="Bot 群角色"
          name="bot_role"
          data-test="groups-bot-role"
          @update:model-value="setBotRole"
        />
      </label>
      <label>
        <span class="sr-only">功能</span>
        <AppSelect
          :model-value="filters.featureKey"
          :options="featureOptions"
          accessible-name="功能"
          name="feature_key"
          data-test="groups-feature"
          @update:model-value="setFeatureKey"
        />
      </label>
      <label>
        <span class="sr-only">功能状态</span>
        <AppSelect
          :model-value="filters.featureEnabled"
          :options="enabledOptions"
          accessible-name="功能状态"
          name="feature_enabled"
          data-test="groups-feature-enabled"
          :disabled="!filters.featureKey"
          @update:model-value="setFeatureEnabled"
        />
      </label>
      <button class="filter-submit" type="submit">应用筛选</button>
      <button
        class="icon-action"
        type="button"
        title="清除筛选"
        aria-label="清除筛选"
        @click="resetFilters"
      >
        <X :size="16" aria-hidden="true" />
      </button>
    </form>

    <OperationNotice
      :message="
        refreshError ? `群目录自动刷新失败，当前显示上次成功同步的数据：${refreshError}` : ''
      "
      tone="warning"
      :revision="refreshError"
      @close="refreshError = null"
    />
    <OperationNotice
      :message="policyNotice ?? ''"
      :tone="policyNoticeTone"
      :revision="policyNotice"
      @close="policyNotice = null"
    />
    <OperationNotice
      :message="publicationNotice ?? ''"
      :tone="publicationTone"
      :revision="publicationResult?.publication_id ?? publicationNotice"
      @close="publicationNotice = null"
    />

    <section v-if="publicationResult" class="publication-result" aria-label="最近一次公告发布结果">
      <header>
        <div>
          <h2>最近一次公告发布</h2>
          <span class="mono">{{ publicationResult.publication_id }}</span>
        </div>
        <span :class="['publication-status', `publication-status--${publicationResult.status}`]">
          {{ publicationResult.published_count }} / {{ publicationResult.requested_count }} 已发布
        </span>
      </header>
      <div class="publication-result__heading publication-result__grid" aria-hidden="true">
        <span>群</span>
        <span>精小弘角色</span>
        <span>结果</span>
      </div>
      <div
        v-for="item in publicationResult.items"
        :key="item.group.group_id"
        class="publication-result__item publication-result__grid"
      >
        <span class="publication-result__group">
          <strong>{{ item.group.name }}</strong>
          <small class="mono">{{ item.group.group_id }}</small>
        </span>
        <span>{{ roleLabels[item.bot_role] }}</span>
        <span>
          <b :class="`item-status item-status--${item.status}`">{{
            publicationStatusLabels[item.status]
          }}</b>
          <small v-if="item.error_code">{{ noticeErrorMessage(item.error_code) }}</small>
        </span>
      </div>
    </section>

    <ResourceState
      v-if="loading"
      state="loading"
      title="正在读取群目录"
      description="正在获取最新群信息。"
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
      description="调整筛选条件后重新查询。"
    />

    <section v-else class="group-directory" aria-label="群目录">
      <div class="directory-heading group-grid" aria-hidden="true">
        <span>群</span>
        <span>成员</span>
        <span>Bot 角色</span>
        <span>功能</span>
        <span>自动审核</span>
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
        <span class="member-count mono" data-label="成员"
          >{{ group.member_count }} / {{ group.max_member_count }}</span
        >
        <span class="role-label">{{ roleLabels[group.bot_role] }}</span>
        <div class="feature-summary">
          <span
            >{{ group.features.filter((feature) => feature.enabled).length }} /
            {{ group.features.length }} 启用</span
          >
          <small v-if="group.features.some((feature) => feature.source === 'group_override')"
            >含群级覆盖</small
          >
        </div>
        <GroupJoinPolicyControls
          class="join-policy-cell"
          :data-group-id="group.group_id"
          :group-name="group.name"
          :enabled="group.join_request_policy.enabled"
          :auto-reject="group.join_request_policy.auto_reject"
          :disabled="!auth.hasPermission('join_policies:write')"
          :busy="policyBusyIds.has(group.group_id)"
          @change="updateJoinPolicy(group, $event)"
        />
        <RouterLink :to="`/groups/${group.group_id}`" class="row-action">
          查看详情 <ArrowRight :size="15" aria-hidden="true" />
        </RouterLink>
      </article>
    </section>

    <button
      v-if="hasMore"
      class="load-more"
      type="button"
      :disabled="loadingMore"
      @click="load(false)"
    >
      <RefreshCw :size="16" :class="{ spin: loadingMore }" aria-hidden="true" />
      {{ loadingMore ? '正在读取' : '加载更多' }}
    </button>

    <AppOverlayTransition :show="noticeEditorOpen" variant="drawer">
      <div class="drawer-layer" role="presentation" @mousedown.self="closeNoticeEditor">
        <section
          class="notice-editor"
          role="dialog"
          aria-modal="true"
          aria-labelledby="notice-editor-title"
        >
          <header>
            <div class="notice-editor__title">
              <BellRing :size="19" aria-hidden="true" />
              <div>
                <h2 id="notice-editor-title">发布群公告</h2>
                <p>可发布 {{ publishableGroupCount }} 个群 · 单次最多 50 个</p>
              </div>
            </div>
            <button
              type="button"
              title="关闭"
              aria-label="关闭发布公告窗口"
              :disabled="publishing"
              @click="closeNoticeEditor"
            >
              <X :size="17" aria-hidden="true" />
            </button>
          </header>

          <form id="group-notice-form" class="notice-editor__body" @submit.prevent="publishNotice">
            <label>
              <span>发布群</span>
              <AppMultiSelect
                :model-value="noticeForm.groupIds"
                :options="noticeOptions"
                accessible-name="选择公告发布群"
                placeholder="请选择一个或多个群"
                data-test="notice-group-select"
                :max-selected="50"
                :disabled="publishing || publicationUncertain"
                @update:model-value="updateNoticeGroupIds"
              />
            </label>
            <p v-if="noticeGroupsError" class="field-error">{{ noticeGroupsError }}</p>

            <label>
              <span>公告内容</span>
              <textarea
                v-model="noticeForm.content"
                data-test="notice-content"
                rows="12"
                placeholder="输入群公告内容"
                :disabled="publishing || publicationUncertain"
                :aria-invalid="noticeContentLength > 5000"
                @input="resetPublicationAttempt"
              ></textarea>
              <small :class="{ 'character-count--invalid': noticeContentLength > 5000 }">
                {{ noticeContentLength }} / 5000
              </small>
            </label>

            <OperationNotice
              v-if="publicationUncertain"
              :message="publicationNotice ?? ''"
              :tone="publicationTone"
              :revision="publicationNotice"
              :closable="false"
            />
          </form>

          <footer>
            <span>{{ noticeForm.groupIds.length }} 个目标群</span>
            <button type="button" :disabled="publishing" @click="closeNoticeEditor">取消</button>
            <button
              form="group-notice-form"
              data-test="confirm-publish-group-notice"
              type="submit"
              class="save-action"
              :disabled="(!canPublish && !publicationUncertain) || publishing"
            >
              <Send :size="16" aria-hidden="true" />
              {{ publishing ? '正在发布' : publicationUncertain ? '确认发布结果' : '发布公告' }}
            </button>
          </footer>
        </section>
      </div>
    </AppOverlayTransition>
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
  grid-template-columns: minmax(220px, 1.4fr) repeat(3, minmax(120px, 0.65fr)) auto 38px;
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

.group-directory {
  min-width: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.group-grid {
  display: grid;
  grid-template-columns: minmax(220px, 1.5fr) 120px 100px minmax(110px, 0.7fr) 170px 92px;
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
.feature-summary {
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
.feature-summary small {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.member-count,
.role-label,
.feature-summary {
  font-size: 12px;
}

.join-policy-cell {
  justify-self: start;
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

.publication-result {
  min-width: 0;
  overflow: hidden;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.publication-result > header {
  display: flex;
  min-height: 52px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--color-border);
}

.publication-result > header div,
.publication-result__group,
.publication-result__item > span:last-child {
  display: grid;
  min-width: 0;
}

.publication-result h2 {
  font-size: 13px;
}

.publication-result header .mono,
.publication-result__group small,
.publication-result__item > span:last-child small {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.publication-status,
.item-status {
  width: fit-content;
  font-size: 10px;
  font-weight: 600;
}

.publication-status {
  padding: 3px 7px;
  color: var(--color-success);
  background: var(--color-success-surface);
  border-radius: 8px;
}

.publication-status--partial {
  color: var(--color-warning);
  background: var(--color-warning-surface);
}

.publication-status--failed {
  color: var(--color-danger);
  background: var(--color-danger-surface);
}

.publication-status--unknown {
  color: var(--color-unknown);
  background: var(--color-unknown-surface);
}

.publication-result__grid {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 120px minmax(160px, 0.7fr);
  gap: 14px;
  align-items: center;
}

.publication-result__heading {
  min-height: 32px;
  padding: 0 14px;
  color: var(--color-text-secondary);
  font-size: 10px;
  background: var(--color-surface-subtle);
  border-bottom: 1px solid var(--color-border);
}

.publication-result__item {
  min-height: 48px;
  padding: 6px 14px;
  font-size: 11px;
  border-bottom: 1px solid var(--color-border);
}

.publication-result__item:last-child {
  border-bottom: 0;
}

.publication-result__group strong {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-status--success {
  color: var(--color-success);
}

.item-status--denied,
.item-status--failed {
  color: var(--color-danger);
}

.item-status--unknown {
  color: var(--color-unknown);
}

.drawer-layer {
  position: fixed;
  z-index: 80;
  display: flex;
  justify-content: flex-end;
  overflow: hidden;
  background: rgb(34 37 36 / 36%);
  inset: 0;
}

.notice-editor {
  display: grid;
  width: min(560px, 100%);
  height: 100%;
  max-height: 100dvh;
  min-height: 0;
  grid-template-rows: max-content minmax(0, 1fr) max-content;
  overflow: hidden;
  background: var(--color-surface);
  box-shadow: -12px 0 36px rgb(34 37 36 / 16%);
}

.notice-editor > header,
.notice-editor > footer,
.notice-editor__title,
.notice-editor .save-action {
  display: flex;
  align-items: center;
}

.notice-editor > header,
.notice-editor > footer {
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border);
}

.notice-editor__title {
  gap: 10px;
  color: var(--color-brand-action);
}

.notice-editor__title div {
  display: grid;
}

.notice-editor__title h2 {
  color: var(--color-text-primary);
  font-size: 17px;
}

.notice-editor__title p {
  color: var(--color-text-secondary);
  font-size: 11px;
}

.notice-editor > header > button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  padding: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}

.notice-editor__body {
  display: grid;
  min-height: 0;
  align-content: start;
  gap: 13px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px;
}

.notice-editor__body > label {
  display: grid;
  gap: 5px;
}

.notice-editor__body > label > span {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 600;
}

.notice-editor textarea {
  width: 100%;
  min-height: 220px;
  padding: 9px 10px;
  line-height: 1.65;
  resize: vertical;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-control);
}

.notice-editor textarea[aria-invalid='true'] {
  border-color: var(--color-danger);
}

.notice-editor__body label > small {
  justify-self: end;
  color: var(--color-text-secondary);
  font-size: 10px;
}

.notice-editor__body .character-count--invalid,
.field-error {
  color: var(--color-danger);
}

.field-error {
  margin-top: -7px;
  font-size: 11px;
}

.notice-editor > footer {
  border-top: 1px solid var(--color-border);
  border-bottom: 0;
}

.notice-editor > footer > span {
  flex: 1;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.notice-editor > footer button {
  display: flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 11px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  white-space: nowrap;
}

.notice-editor > footer .save-action {
  color: white;
  background: var(--color-brand-action);
  border-color: var(--color-brand-action);
}

.notice-editor > footer .save-action:disabled {
  cursor: not-allowed;
  opacity: 0.46;
}

.spin {
  animation: spin 700ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1180px) {
  .group-grid {
    grid-template-columns: minmax(220px, 1fr) 110px 100px 170px 92px;
  }

  .directory-heading span:nth-child(4),
  .feature-summary {
    display: none;
  }
}

@media (max-width: 980px) {
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

  .join-policy-cell {
    grid-column: 1 / -1;
    justify-self: stretch;
  }

  .row-action {
    align-self: end;
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

  .filter-bar label:nth-of-type(3),
  .filter-bar label:nth-of-type(4) {
    display: none;
  }

  .publication-result__heading {
    display: none;
  }

  .publication-result__grid {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .publication-result__item > span:first-child {
    grid-column: 1 / -1;
  }

  .notice-editor {
    width: 100%;
  }
}
</style>
