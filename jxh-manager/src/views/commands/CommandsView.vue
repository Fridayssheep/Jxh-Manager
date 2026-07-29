<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  ArrowRight,
  FilterX,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SquareTerminal,
} from '@lucide/vue'

import { AdminApiError } from '@/api/client'
import { commandsApi, type CommandListQuery } from '@/api/commands'
import type {
  Command,
  CommandStatus,
  CommandTriggerPermission,
} from '@/api/types'
import OperationNotice from '@/components/feedback/OperationNotice.vue'
import ResourceState from '@/components/feedback/ResourceState.vue'
import AppSelect, { type AppSelectOption } from '@/components/form/AppSelect.vue'
import { subscribeToAdminEvents } from '@/composables/useAdminEvents'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const commands = ref<Command[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<unknown>(null)
const nextCursor = ref<string | null>(null)
const hasMore = ref(false)
const busyIds = ref(new Set<string>())
const operationResult = ref<string | null>(null)
const operationTone = ref<'success' | 'warning' | 'danger'>('success')

const filters = reactive<{
  query: string
  enabled: '' | 'true' | 'false'
  status: CommandStatus | ''
  scopeType: 'global' | 'groups' | ''
  triggerPermission: CommandTriggerPermission | ''
}>({
  query: '',
  enabled: '',
  status: '',
  scopeType: '',
  triggerPermission: '',
})

const statusLabels: Record<CommandStatus, string> = {
  draft: '草稿',
  active: '已启用',
  disabled: '已停用',
  archived: '已归档',
}

const permissionLabels: Record<CommandTriggerPermission, string> = {
  everyone: '所有成员',
  group_admin: '群主与管理员',
  maintenance_allowlist: '维护名单',
}
const statusOptions: readonly AppSelectOption[] = [
  { value: '', label: '全部状态' },
  ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
]
const enabledOptions: readonly AppSelectOption[] = [
  { value: '', label: '全部启停' },
  { value: 'true', label: '已启用' },
  { value: 'false', label: '已停用' },
]
const scopeOptions: readonly AppSelectOption[] = [
  { value: '', label: '全部范围' },
  { value: 'global', label: '全局' },
  { value: 'groups', label: '指定群' },
]
const permissionOptions: readonly AppSelectOption[] = [
  { value: '', label: '全部权限' },
  ...Object.entries(permissionLabels).map(([value, label]) => ({ value, label })),
]

const actionLabels = {
  reply_text: '回复',
  mention: '@成员',
  mute_member: '禁言',
  send_group_text: '指定群发送',
}

function listQuery(cursor: string | null): CommandListQuery {
  return {
    query: filters.query.trim(),
    enabled: filters.enabled === '' ? null : filters.enabled === 'true',
    status: filters.status,
    scopeType: filters.scopeType,
    groupId: '',
    actionType: '',
    triggerPermission: filters.triggerPermission,
    cursor,
  }
}

function setStatus(value: string): void { filters.status = value as CommandStatus | '' }
function setEnabled(value: string): void { filters.enabled = value as '' | 'true' | 'false' }
function setScopeType(value: string): void { filters.scopeType = value as 'global' | 'groups' | '' }
function setTriggerPermission(value: string): void { filters.triggerPermission = value as CommandTriggerPermission | '' }

async function load(reset = true): Promise<void> {
  if (reset) loading.value = true
  else loadingMore.value = true
  error.value = null
  try {
    const result = await commandsApi.list(listQuery(reset ? null : nextCursor.value))
    commands.value = reset ? result.items : [...commands.value, ...result.items]
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
    enabled: '',
    status: '',
    scopeType: '',
    triggerPermission: '',
  })
  void load()
}

function setBusy(commandId: string, busy: boolean): void {
  const next = new Set(busyIds.value)
  if (busy) next.add(commandId)
  else next.delete(commandId)
  busyIds.value = next
}

async function toggleCommand(command: Command): Promise<void> {
  setBusy(command.command_id, true)
  operationResult.value = null
  try {
    const updated = await commandsApi.update(
      command.command_id,
      { enabled: !command.enabled },
      command.version,
    )
    const index = commands.value.findIndex((item) => item.command_id === updated.command_id)
    if (index >= 0) commands.value.splice(index, 1, updated)
    operationTone.value = 'success'
    operationResult.value = `${updated.name} 已${updated.enabled ? '启用' : '停用'}。`
  } catch (reason) {
    operationTone.value = reason instanceof AdminApiError && reason.status === 409 ? 'warning' : 'danger'
    operationResult.value =
      reason instanceof AdminApiError && reason.status === 409
        ? `${command.name} 已被其他管理员修改，请刷新列表后重试。`
        : reason instanceof AdminApiError
          ? reason.message
          : '命令状态更新失败。'
  } finally {
    setBusy(command.command_id, false)
  }
}

function uniqueActionLabels(command: Command): string[] {
  return [...new Set(command.actions.map((action) => actionLabels[action.type]))]
}

const unsubscribe = subscribeToAdminEvents((event) => {
  if (event.event.startsWith('command.')) void load()
})

onMounted(() => load())
onBeforeUnmount(unsubscribe)
</script>

<template>
  <main class="commands-page">
    <header class="page-header">
      <div>
        <h1>自定义命令</h1>
        <p>通过受控参数和动作模板扩展群内能力，所有定义均由后端再次校验。</p>
      </div>
      <RouterLink v-if="auth.hasPermission('commands:write')" class="primary-action" to="/commands/new">
        <Plus :size="17" aria-hidden="true" />新建命令
      </RouterLink>
    </header>

    <form class="filter-bar" data-test="command-filters" @submit.prevent="load()">
      <label class="search-field">
        <span class="sr-only">搜索命令</span>
        <Search :size="16" aria-hidden="true" />
        <input v-model="filters.query" name="query" placeholder="搜索命令名或显示名称" />
      </label>
      <label>
        <span class="sr-only">命令状态</span>
        <AppSelect :model-value="filters.status" :options="statusOptions" accessible-name="命令状态" name="status" data-test="commands-status" @update:model-value="setStatus" />
      </label>
      <label>
        <span class="sr-only">启用状态</span>
        <AppSelect :model-value="filters.enabled" :options="enabledOptions" accessible-name="启用状态" name="enabled" data-test="commands-enabled" @update:model-value="setEnabled" />
      </label>
      <label>
        <span class="sr-only">作用范围</span>
        <AppSelect :model-value="filters.scopeType" :options="scopeOptions" accessible-name="作用范围" name="scope_type" data-test="commands-scope" @update:model-value="setScopeType" />
      </label>
      <label>
        <span class="sr-only">触发权限</span>
        <AppSelect :model-value="filters.triggerPermission" :options="permissionOptions" accessible-name="触发权限" name="trigger_permission" data-test="commands-permission" @update:model-value="setTriggerPermission" />
      </label>
      <button class="filter-submit" type="submit">应用筛选</button>
      <button class="filter-reset" type="button" title="清除筛选" aria-label="清除筛选" @click="resetFilters">
        <FilterX :size="16" aria-hidden="true" />
      </button>
    </form>

    <OperationNotice :message="operationResult ?? ''" :tone="operationTone" :revision="operationResult" @close="operationResult = null" />

    <ResourceState v-if="loading" state="loading" title="正在读取自定义命令" description="正在获取命令定义与最新版本。" />
    <ResourceState v-else-if="error" state="error" title="命令列表读取失败" description="筛选条件已保留，可以直接重试。" @retry="load()" />
    <ResourceState v-else-if="!commands.length" state="empty" title="没有符合条件的命令" description="调整筛选，或创建一个默认停用的命令草稿。" />

    <section v-else class="command-directory" aria-label="自定义命令列表">
      <div class="directory-heading command-grid" aria-hidden="true">
        <span>命令</span><span>状态</span><span>范围</span><span>触发权限</span><span>动作</span><span>操作</span>
      </div>
      <article v-for="command in commands" :key="command.command_id" class="command-row command-grid">
        <div class="command-identity">
          <SquareTerminal :size="18" aria-hidden="true" />
          <div><strong class="mono">{{ command.name }}</strong><span>{{ command.display_name }}</span></div>
        </div>
        <span :class="['status-badge', `status-badge--${command.status}`]">{{ statusLabels[command.status] }}</span>
        <span data-label="范围">{{ command.scope.type === 'global' ? '全局' : `${command.scope.group_ids.length} 个群` }}</span>
        <span class="permission-label" data-label="权限"><ShieldCheck :size="14" aria-hidden="true" />{{ permissionLabels[command.trigger_permission] }}</span>
        <div class="action-summary" data-label="动作"><span v-for="label in uniqueActionLabels(command)" :key="label">{{ label }}</span></div>
        <div class="row-actions">
          <button
            v-if="auth.hasPermission('commands:write') && command.status !== 'archived'"
            :data-test="`toggle-command-${command.command_id}`"
            type="button"
            :disabled="busyIds.has(command.command_id)"
            @click="toggleCommand(command)"
          >
            <LoaderCircle v-if="busyIds.has(command.command_id)" class="spin" :size="14" aria-hidden="true" />
            {{ command.enabled ? '停用' : '启用' }}
          </button>
          <RouterLink :to="`/commands/${command.command_id}`">编辑 <ArrowRight :size="14" aria-hidden="true" /></RouterLink>
        </div>
      </article>
    </section>

    <button v-if="hasMore" class="load-more" type="button" :disabled="loadingMore" @click="load(false)">
      <RefreshCw :size="16" :class="{ spin: loadingMore }" aria-hidden="true" />{{ loadingMore ? '正在读取' : '加载更多命令' }}
    </button>
  </main>
</template>

<style scoped>
.commands-page { display: grid; gap: 16px; }
.page-header, .primary-action, .filter-bar, .search-field, .operation-result, .permission-label, .row-actions, .row-actions a, .load-more { display: flex; align-items: center; }
.page-header { justify-content: space-between; gap: 16px; }
.page-header h1 { font-size: 24px; line-height: 34px; }
.page-header p { color: var(--color-text-secondary); font-size: 13px; }
.primary-action { min-height: 38px; gap: 7px; padding: 0 12px; color: white; font-weight: 600; background: var(--color-brand-action); border-radius: var(--radius-control); }
.filter-bar { display: grid; grid-template-columns: minmax(220px, 1.4fr) repeat(4, minmax(120px, .7fr)) auto 38px; gap: 8px; }
.filter-bar select, .search-field { width: 100%; height: 38px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-control); }
.filter-bar select { padding: 0 28px 0 9px; }
.search-field { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 7px; padding: 0 10px; color: var(--color-text-secondary); }
.search-field input { min-width: 0; background: transparent; border: 0; outline: 0; }
.filter-submit, .filter-reset, .load-more { height: 38px; justify-content: center; padding: 0 11px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-control); }
.filter-submit { color: var(--color-brand-action); font-weight: 600; border-color: var(--color-brand-border); }
.filter-reset { width: 38px; padding: 0; }
.operation-result { min-height: 42px; gap: 8px; padding: 8px 11px; font-size: 12px; border-left: 3px solid currentcolor; }
.operation-result span { min-width: 0; flex: 1; }
.operation-result button { width: 28px; height: 28px; padding: 0; background: transparent; border: 0; }
.operation-result--success { color: var(--color-success); background: var(--color-success-surface); }
.operation-result--warning { color: var(--color-warning); background: var(--color-warning-surface); }
.operation-result--danger { color: var(--color-danger); background: var(--color-danger-surface); }
.command-directory { min-width: 0; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-panel); }
.command-grid { display: grid; grid-template-columns: minmax(220px, 1.4fr) 90px 90px minmax(130px, .8fr) minmax(170px, 1fr) 150px; gap: 12px; align-items: center; }
.directory-heading { min-height: 38px; padding: 0 14px; color: var(--color-text-secondary); font-size: 11px; background: var(--color-surface-subtle); border-bottom: 1px solid var(--color-border); }
.command-row { min-height: 70px; padding: 10px 14px; font-size: 12px; border-bottom: 1px solid var(--color-border); }
.command-row:last-child { border-bottom: 0; }
.command-row:hover { background: var(--color-surface-raised); }
.command-identity { display: grid; min-width: 0; grid-template-columns: 18px minmax(0, 1fr); gap: 9px; align-items: center; color: var(--color-brand-ink); }
.command-identity div { display: grid; min-width: 0; }
.command-identity strong { overflow: hidden; color: var(--color-text-primary); text-overflow: ellipsis; white-space: nowrap; }
.command-identity span { color: var(--color-text-secondary); font-size: 11px; }
.status-badge { width: fit-content; padding: 2px 6px; color: var(--color-unknown); background: var(--color-unknown-surface); border-radius: 8px; }
.status-badge--active { color: var(--color-success); background: var(--color-success-surface); }
.status-badge--disabled { color: var(--color-warning); background: var(--color-warning-surface); }
.status-badge--archived { color: var(--color-text-secondary); background: var(--color-surface-subtle); }
.permission-label { gap: 5px; }
.action-summary { display: flex; min-width: 0; flex-wrap: wrap; gap: 4px; }
.action-summary span { padding: 2px 6px; color: var(--color-brand-ink); background: var(--color-brand-surface); border-radius: 8px; }
.row-actions { justify-content: flex-end; gap: 7px; }
.row-actions button, .row-actions a { min-height: 32px; gap: 5px; padding: 0 8px; color: var(--color-brand-action); font-weight: 600; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-control); }
.row-actions button { color: var(--color-text-primary); }
.load-more { justify-self: center; gap: 7px; color: var(--color-text-secondary); }
.spin { animation: spin 700ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1120px) {
  .filter-bar { grid-template-columns: minmax(220px, 1fr) repeat(2, minmax(120px, .6fr)) auto 38px; }
  .filter-bar label:nth-of-type(4), .filter-bar label:nth-of-type(5) { display: none; }
  .command-grid { grid-template-columns: minmax(210px, 1.4fr) 90px 90px minmax(150px, 1fr) 150px; }
  .directory-heading span:nth-child(4), .permission-label { display: none; }
}
@media (max-width: 720px) {
  .page-header { align-items: stretch; flex-direction: column; }
  .primary-action { justify-content: center; }
  .filter-bar { grid-template-columns: 1fr 1fr; }
  .search-field { grid-column: 1 / -1; }
  .filter-bar label:nth-of-type(3) { display: block; }
  .filter-bar label:nth-of-type(4), .filter-bar label:nth-of-type(5) { display: none; }
  .filter-reset { justify-self: end; }
  .directory-heading { display: none; }
  .command-directory { background: transparent; border: 0; }
  .command-row, .command-grid { grid-template-columns: 1fr auto; }
  .command-row { gap: 9px 12px; margin-bottom: 8px; padding: 12px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-panel); }
  .command-identity { grid-column: 1 / -1; }
  .command-row > [data-label]::before { display: block; color: var(--color-text-secondary); content: attr(data-label); font-size: 10px; }
  .permission-label { display: none; }
  .action-summary { grid-column: 1 / -1; }
  .row-actions { grid-column: 1 / -1; }
}
</style>
