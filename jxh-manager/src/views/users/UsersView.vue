<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  AlertTriangle, Ban, FilterX, KeyRound, LogOut,
  Monitor, Pencil, Plus, RefreshCw, Search, ShieldCheck, UserCog, X,
} from '@lucide/vue'

import { AdminApiError } from '@/api/client'
import { usersApi, type AdminSessionListQuery, type AdminUserListQuery } from '@/api/users'
import type {
  AdminRole, AdminSession, AdminUser, AdminUserCreateRequest, AdminUserPatchRequest,
  SessionStatus,
} from '@/api/types'
import OperationNotice from '@/components/feedback/OperationNotice.vue'
import ResourceState from '@/components/feedback/ResourceState.vue'
import AppOverlayTransition from '@/components/motion/AppOverlayTransition.vue'
import AppTabBar, { type AppTabOption } from '@/components/navigation/AppTabBar.vue'
import { vRiseOnChange } from '@/directives/motion'
import { useAuthStore } from '@/stores/auth'

type Tab = 'users' | 'sessions'
type ConfirmAction = 'reset_password' | 'disable_user' | 'enable_user' | 'revoke_user_sessions' | 'revoke_session'

const auth = useAuthStore()
const activeTab = ref<Tab>('users')
const users = ref<AdminUser[]>([])
const sessions = ref<AdminSession[]>([])
const usersLoading = ref(false)
const sessionsLoading = ref(false)
const loadingMore = ref(false)
const error = ref<unknown>(null)
const usersNextCursor = ref<string | null>(null)
const usersHasMore = ref(false)
const sessionsNextCursor = ref<string | null>(null)
const sessionsHasMore = ref(false)
const loadingDetailId = ref<string | null>(null)
const editorOpen = ref(false)
const editingUser = ref<AdminUser | null>(null)
const saving = ref(false)
const confirmAction = ref<ConfirmAction | null>(null)
const pendingUser = ref<AdminUser | null>(null)
const pendingSession = ref<AdminSession | null>(null)
const newPassword = ref('')
const confirming = ref(false)
const operationResult = ref<string | null>(null)
const operationTone = ref<'success' | 'danger' | 'warning' | 'unknown'>('success')

const userFilters = reactive<{ query: string; role: AdminRole | ''; enabled: '' | 'true' | 'false' }>({
  query: '', role: '', enabled: '',
})
const sessionFilters = reactive<{ userId: string; status: SessionStatus | ''; current: '' | 'true' | 'false' }>({
  userId: '', status: '', current: '',
})
const userForm = reactive({ username: '', displayName: '', role: 'maintainer' as AdminRole, qqUserId: '', password: '' })

const roleLabels: Record<AdminRole, string> = {
  super_admin: '超级管理员', maintainer: '维护员', observer: '观察员',
}
const sessionStatusLabels: Record<SessionStatus, string> = {
  active: '活跃', expired: '已过期', revoked: '已撤销',
}
const tabOptions = computed<readonly AppTabOption[]>(() => [
  { value: 'users', label: '管理账号', icon: UserCog, dataTest: 'users-tab' },
  ...(auth.hasPermission('sessions:manage')
    ? [{ value: 'sessions', label: '登录会话', icon: Monitor, dataTest: 'sessions-tab' }]
    : []),
])
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})
const confirmTitle = computed(() => {
  const titles: Record<ConfirmAction, string> = {
    reset_password: '重置账号密码', disable_user: '停用管理账号', enable_user: '重新启用账号',
    revoke_user_sessions: '撤销账号全部会话', revoke_session: '撤销指定会话',
  }
  return confirmAction.value ? titles[confirmAction.value] : ''
})
const confirmDescription = computed(() => {
  if (confirmAction.value === 'reset_password') return `新密码生效后，${pendingUser.value?.display_name} 的全部会话会立即撤销。`
  if (confirmAction.value === 'disable_user') return `${pendingUser.value?.display_name} 将不能继续登录，已有会话仍应单独撤销。`
  if (confirmAction.value === 'enable_user') return `${pendingUser.value?.display_name} 将恢复登录权限。`
  if (confirmAction.value === 'revoke_user_sessions') return `${pendingUser.value?.display_name} 的所有管理端会话都会失效。`
  return '该浏览器会话会立即失效，操作不会影响同账号的其他会话。'
})

function displayTime(value: string | null): string {
  return value ? timeFormatter.format(new Date(value)) : '尚无记录'
}

function userListQuery(cursor: string | null): AdminUserListQuery {
  return {
    query: userFilters.query.trim(), role: userFilters.role,
    enabled: userFilters.enabled === '' ? null : userFilters.enabled === 'true', cursor,
  }
}

function sessionListQuery(cursor: string | null): AdminSessionListQuery {
  return {
    userId: sessionFilters.userId.trim(), status: sessionFilters.status,
    current: sessionFilters.current === '' ? null : sessionFilters.current === 'true', cursor,
  }
}

async function loadUsers(reset = true): Promise<void> {
  if (reset) usersLoading.value = true
  else loadingMore.value = true
  error.value = null
  try {
    const page = await usersApi.list(userListQuery(reset ? null : usersNextCursor.value))
    users.value = reset ? page.items : [...users.value, ...page.items]
    usersNextCursor.value = page.next_cursor
    usersHasMore.value = page.has_more
  } catch (reason) {
    error.value = reason
  } finally {
    usersLoading.value = false
    loadingMore.value = false
  }
}

async function loadSessions(reset = true): Promise<void> {
  if (reset) sessionsLoading.value = true
  else loadingMore.value = true
  error.value = null
  try {
    const page = await usersApi.listSessions(sessionListQuery(reset ? null : sessionsNextCursor.value))
    sessions.value = reset ? page.items : [...sessions.value, ...page.items]
    sessionsNextCursor.value = page.next_cursor
    sessionsHasMore.value = page.has_more
  } catch (reason) {
    error.value = reason
  } finally {
    sessionsLoading.value = false
    loadingMore.value = false
  }
}

function switchTab(tab: Tab): void {
  activeTab.value = tab
  error.value = null
  if (tab === 'sessions' && !sessions.value.length) void loadSessions()
}

function selectTab(value: string): void {
  switchTab(value as Tab)
}

function resetUserFilters(): void {
  Object.assign(userFilters, { query: '', role: '', enabled: '' })
  void loadUsers()
}

function resetSessionFilters(): void {
  Object.assign(sessionFilters, { userId: '', status: '', current: '' })
  void loadSessions()
}

function openNew(): void {
  editingUser.value = null
  Object.assign(userForm, { username: '', displayName: '', role: 'maintainer', qqUserId: '', password: '' })
  editorOpen.value = true
}

async function openEdit(user: AdminUser): Promise<void> {
  loadingDetailId.value = user.user_id
  operationResult.value = null
  try {
    const detail = await usersApi.get(user.user_id)
    editingUser.value = detail
    Object.assign(userForm, {
      username: detail.username, displayName: detail.display_name, role: detail.role,
      qqUserId: detail.qq_user_id ?? '', password: '',
    })
    editorOpen.value = true
  } catch (reason) {
    operationTone.value = 'danger'
    operationResult.value = reason instanceof AdminApiError ? reason.message : '账号详情读取失败，未打开编辑器。'
  } finally {
    loadingDetailId.value = null
  }
}

function replaceUser(saved: AdminUser): void {
  const index = users.value.findIndex((user) => user.user_id === saved.user_id)
  if (index >= 0) users.value.splice(index, 1, saved)
  else users.value.unshift(saved)
}

async function saveUser(): Promise<void> {
  operationResult.value = null
  if (!userForm.displayName.trim() || (!editingUser.value && (!userForm.username.trim() || !userForm.password))) {
    operationTone.value = 'warning'
    operationResult.value = '请完整填写用户名、显示名称和初始密码。'
    return
  }

  saving.value = true
  try {
    let saved: AdminUser
    if (editingUser.value) {
      const patch: AdminUserPatchRequest = {
        display_name: userForm.displayName.trim(), role: userForm.role,
        qq_user_id: userForm.qqUserId.trim() || null,
      }
      saved = await usersApi.update(editingUser.value.user_id, patch, editingUser.value.version)
    } else {
      const payload: AdminUserCreateRequest = {
        username: userForm.username.trim(), display_name: userForm.displayName.trim(),
        role: userForm.role, qq_user_id: userForm.qqUserId.trim() || undefined,
        password: userForm.password,
      }
      saved = await usersApi.create(payload)
    }
    replaceUser(saved)
    editorOpen.value = false
    operationTone.value = 'success'
    operationResult.value = `${saved.display_name} 已保存，版本 ${saved.version}。`
  } catch (reason) {
    operationTone.value = reason instanceof AdminApiError && reason.status === 409 ? 'warning' : 'danger'
    operationResult.value = reason instanceof AdminApiError ? reason.message : '账号保存失败。'
  } finally {
    saving.value = false
  }
}

function askUserAction(action: ConfirmAction, user: AdminUser): void {
  confirmAction.value = action
  pendingUser.value = user
  pendingSession.value = null
  newPassword.value = ''
}

function askSessionRevoke(session: AdminSession): void {
  confirmAction.value = 'revoke_session'
  pendingSession.value = session
  pendingUser.value = null
}

function closeConfirm(): void {
  confirmAction.value = null
  pendingUser.value = null
  pendingSession.value = null
  newPassword.value = ''
}

async function confirmUserAction(): Promise<void> {
  const action = confirmAction.value
  const user = pendingUser.value
  const session = pendingSession.value
  if (!action) return
  if (action === 'reset_password' && !newPassword.value) {
    operationTone.value = 'warning'
    operationResult.value = '请填写新的登录密码。'
    return
  }

  confirming.value = true
  try {
    if (action === 'reset_password' && user) {
      const result = await usersApi.resetPassword(user.user_id, newPassword.value, user.version)
      replaceUser(result.user)
      operationResult.value = `密码已重置，已撤销 ${result.revoked_session_count} 个会话。`
    } else if ((action === 'disable_user' || action === 'enable_user') && user) {
      const enabled = action === 'enable_user'
      replaceUser(await usersApi.update(user.user_id, { enabled }, user.version))
      operationResult.value = enabled ? '账号已启用。' : '账号已停用。'
    } else if (action === 'revoke_user_sessions' && user) {
      const result = await usersApi.revokeUserSessions(user.user_id)
      operationResult.value = `已撤销 ${result.revoked_count} 个会话。`
      if (activeTab.value === 'sessions') await loadSessions()
    } else if (action === 'revoke_session' && session) {
      const result = await usersApi.revokeSession(session.session_id)
      const index = sessions.value.findIndex((item) => item.session_id === session.session_id)
      if (index >= 0) sessions.value.splice(index, 1, { ...sessions.value[index]!, status: 'revoked', revoked_at: result.revoked_at })
      operationResult.value = '会话已撤销。'
    }
    operationTone.value = 'success'
    closeConfirm()
  } catch (reason) {
    if (reason instanceof TypeError) {
      operationTone.value = 'unknown'
      operationResult.value = '操作结果未知。连接已中断，请先刷新列表，不要重复提交。'
    } else {
      operationTone.value = reason instanceof AdminApiError && reason.status === 409 ? 'warning' : 'danger'
      operationResult.value = reason instanceof AdminApiError ? reason.message : '操作未能完成。'
    }
    closeConfirm()
  } finally {
    confirming.value = false
  }
}

onMounted(() => { void loadUsers() })
</script>

<template>
  <main class="users-page">
    <header class="page-header">
      <div><h1>账号与会话</h1><p>管理后台身份、角色、登录状态和浏览器会话。</p></div>
      <button data-test="create-user" class="primary-action" type="button" @click="openNew"><Plus :size="16" />新建账号</button>
    </header>

    <AppTabBar
      :model-value="activeTab"
      :options="tabOptions"
      accessible-name="账号管理视图"
      @update:model-value="selectTab"
    />

    <OperationNotice :message="operationResult ?? ''" :tone="operationTone" :revision="operationResult" @close="operationResult = null" />

    <div v-rise-on-change="activeTab" class="tab-content">
      <template v-if="activeTab === 'users'">
      <form data-test="user-filters" class="filter-bar" @submit.prevent="loadUsers()">
        <label class="search-field"><Search :size="15" /><span class="sr-only">搜索账号</span><input v-model="userFilters.query" placeholder="用户名、显示名称或完整 QQ" /></label>
        <label><span class="sr-only">账号角色</span><select v-model="userFilters.role"><option value="">全部角色</option><option v-for="(label, value) in roleLabels" :key="value" :value="value">{{ label }}</option></select></label>
        <label><span class="sr-only">账号状态</span><select v-model="userFilters.enabled"><option value="">全部状态</option><option value="true">正常</option><option value="false">已停用</option></select></label>
        <button class="filter-submit" type="submit">应用筛选</button>
        <button class="filter-reset" type="button" title="清除筛选" aria-label="清除筛选" @click="resetUserFilters"><FilterX :size="16" /></button>
      </form>

      <ResourceState v-if="usersLoading" state="loading" title="正在读取管理账号" description="正在同步角色、状态和最近登录时间。" />
      <ResourceState v-else-if="error" state="error" title="账号列表读取失败" description="筛选条件已保留，可以直接重试。" @retry="loadUsers()" />
      <ResourceState v-else-if="!users.length" state="empty" title="没有符合条件的账号" description="调整筛选或创建一个新的管理账号。" />
      <section v-else class="directory" aria-label="管理账号列表">
        <div class="user-grid table-heading" aria-hidden="true"><span>账号</span><span>角色</span><span>QQ 身份</span><span>最近登录</span><span>状态</span><span>操作</span></div>
        <article v-for="user in users" :key="user.user_id" class="user-grid table-row">
          <div class="user-identity"><span>{{ user.display_name.slice(0, 1) }}</span><div><strong>{{ user.display_name }}</strong><small class="mono">@{{ user.username }} · {{ user.user_id }}</small></div></div>
          <span data-label="角色" class="role-badge"><ShieldCheck :size="13" />{{ roleLabels[user.role] }}</span>
          <span data-label="QQ 身份" class="mono">{{ user.qq_user_id || '未绑定' }}</span>
          <time data-label="最近登录">{{ displayTime(user.last_login_at) }}</time>
          <span data-label="状态" :class="['status-badge', { disabled: !user.enabled }]">{{ user.enabled ? '正常' : '已停用' }}</span>
          <div class="row-actions">
            <button :data-test="`edit-user-${user.user_id}`" type="button" title="编辑账号" :disabled="loadingDetailId === user.user_id" @click="openEdit(user)"><RefreshCw v-if="loadingDetailId === user.user_id" class="spin" :size="15" /><Pencil v-else :size="15" /></button>
            <button :data-test="`reset-password-${user.user_id}`" type="button" title="重置密码" @click="askUserAction('reset_password', user)"><KeyRound :size="15" /></button>
            <button :data-test="`revoke-user-sessions-${user.user_id}`" type="button" title="撤销全部会话" @click="askUserAction('revoke_user_sessions', user)"><LogOut :size="15" /></button>
            <button v-if="user.enabled" :data-test="`disable-user-${user.user_id}`" class="danger" type="button" title="停用账号" @click="askUserAction('disable_user', user)"><Ban :size="15" /></button>
            <button v-else :data-test="`enable-user-${user.user_id}`" type="button" title="启用账号" @click="askUserAction('enable_user', user)"><RefreshCw :size="15" /></button>
          </div>
        </article>
      </section>
      <button v-if="usersHasMore" class="load-more" type="button" :disabled="loadingMore" @click="loadUsers(false)"><RefreshCw :class="{ spin: loadingMore }" :size="15" />{{ loadingMore ? '正在读取' : '加载更多账号' }}</button>
      </template>

      <template v-else>
      <form data-test="session-filters" class="filter-bar session-filters" @submit.prevent="loadSessions()">
        <label><span class="sr-only">账号 ID</span><input v-model="sessionFilters.userId" placeholder="账号 ID" /></label>
        <label><span class="sr-only">会话状态</span><select v-model="sessionFilters.status" name="session_status"><option value="">全部状态</option><option v-for="(label, value) in sessionStatusLabels" :key="value" :value="value">{{ label }}</option></select></label>
        <label><span class="sr-only">当前会话</span><select v-model="sessionFilters.current"><option value="">全部会话</option><option value="true">仅当前会话</option><option value="false">排除当前会话</option></select></label>
        <button class="filter-submit" type="submit">应用筛选</button>
        <button class="filter-reset" type="button" title="清除筛选" aria-label="清除筛选" @click="resetSessionFilters"><FilterX :size="16" /></button>
      </form>

      <ResourceState v-if="sessionsLoading" state="loading" title="正在读取登录会话" description="不读取 Cookie 或任何会话令牌。" />
      <ResourceState v-else-if="error" state="error" title="会话列表读取失败" description="筛选条件已保留，可以直接重试。" @retry="loadSessions()" />
      <ResourceState v-else-if="!sessions.length" state="empty" title="没有符合条件的会话" description="调整账号、状态或当前会话筛选。" />
      <section v-else class="directory" aria-label="登录会话列表">
        <div class="session-grid table-heading" aria-hidden="true"><span>会话与账号</span><span>客户端</span><span>IP 地址</span><span>最近活动</span><span>状态</span><span>操作</span></div>
        <article v-for="session in sessions" :key="session.session_id" class="session-grid table-row">
          <div class="session-identity"><Monitor :size="17" /><div><strong class="mono">{{ session.session_id }}</strong><small class="mono">{{ session.user_id }}<b v-if="session.current"> · 当前会话</b></small></div></div>
          <span data-label="客户端" class="client">{{ session.user_agent }}</span>
          <span data-label="IP 地址" class="mono">{{ session.ip_address }}</span>
          <time data-label="最近活动">{{ displayTime(session.last_seen_at) }}</time>
          <span data-label="状态" :class="['status-badge', { disabled: session.status !== 'active' }]">{{ sessionStatusLabels[session.status] }}</span>
          <div class="row-actions"><button v-if="session.status === 'active'" :data-test="`revoke-session-${session.session_id}`" class="danger" type="button" title="撤销会话" @click="askSessionRevoke(session)"><LogOut :size="15" /></button><span v-else>—</span></div>
        </article>
      </section>
      <button v-if="sessionsHasMore" class="load-more" type="button" :disabled="loadingMore" @click="loadSessions(false)"><RefreshCw :class="{ spin: loadingMore }" :size="15" />{{ loadingMore ? '正在读取' : '加载更多会话' }}</button>
      </template>
    </div>

    <AppOverlayTransition :show="editorOpen" variant="drawer">
      <div class="drawer-layer" @mousedown.self="editorOpen = false">
        <section class="user-editor" role="dialog" aria-modal="true" aria-labelledby="user-editor-title">
        <header><div><span class="eyebrow">ADMIN IDENTITY</span><h2 id="user-editor-title">{{ editingUser ? '编辑管理账号' : '新建管理账号' }}</h2><p>{{ editingUser ? `资源版本 ${editingUser.version}` : '创建后即可使用后台登录' }}</p></div><button type="button" aria-label="关闭" @click="editorOpen = false"><X :size="17" /></button></header>
        <div class="editor-body">
          <label><span>用户名</span><input v-model="userForm.username" data-test="user-username" :disabled="Boolean(editingUser)" autocomplete="off" /></label>
          <label><span>显示名称</span><input v-model="userForm.displayName" data-test="user-display-name" maxlength="100" /></label>
          <label><span>角色</span><select v-model="userForm.role" data-test="user-role"><option v-for="(label, value) in roleLabels" :key="value" :value="value">{{ label }}</option></select></label>
          <label><span>QQ 维护身份（可选）</span><input v-model="userForm.qqUserId" data-test="user-qq" inputmode="numeric" /></label>
          <label v-if="!editingUser"><span>初始密码</span><input v-model="userForm.password" data-test="user-password" type="password" autocomplete="new-password" /></label>
          <div class="role-note"><ShieldCheck :size="16" /><p><strong>{{ roleLabels[userForm.role] }}</strong><span v-if="userForm.role === 'super_admin'">可管理账号、会话和系统危险动作。</span><span v-else-if="userForm.role === 'maintainer'">可处理日常运营，但不能管理后台账号。</span><span v-else>仅查看授权范围内的脱敏数据。</span></p></div>
        </div>
        <footer><button type="button" @click="editorOpen = false">取消</button><button data-test="save-user" class="save-action" type="button" :disabled="saving" @click="saveUser">{{ saving ? '正在保存' : '保存账号' }}</button></footer>
        </section>
      </div>
    </AppOverlayTransition>

    <AppOverlayTransition :show="Boolean(confirmAction)" variant="dialog">
      <div class="dialog-layer" role="presentation">
        <section class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-user-title">
        <header><AlertTriangle :size="20" /><div><h2 id="confirm-user-title">{{ confirmTitle }}</h2><p>{{ confirmDescription }}</p></div></header>
        <label v-if="confirmAction === 'reset_password'"><span>新密码</span><input v-model="newPassword" data-test="new-password" type="password" autocomplete="new-password" /></label>
        <footer><button type="button" @click="closeConfirm">取消</button><button data-test="confirm-user-action" :class="{ 'danger-action': confirmAction !== 'enable_user' }" type="button" :disabled="confirming" @click="confirmUserAction">{{ confirming ? '正在处理' : '确认操作' }}</button></footer>
        </section>
      </div>
    </AppOverlayTransition>
  </main>
</template>

<style scoped>
.users-page{display:grid;gap:14px}.page-header,.primary-action,.tabs,.tabs button,.operation-result,.search-field,.filter-submit,.filter-reset,.load-more,.user-identity,.role-badge,.session-identity,.row-actions,.user-editor>header,.user-editor>footer,.role-note,.confirm-dialog header,.confirm-dialog footer{display:flex;align-items:center}.page-header{justify-content:space-between;gap:16px}.page-header h1{font-size:24px;line-height:34px}.page-header p{color:var(--color-text-secondary);font-size:12px}.primary-action{min-height:38px;justify-content:center;gap:7px;padding:0 12px;color:white;font-weight:600;background:var(--color-brand-action);border:1px solid var(--color-brand-action);border-radius:var(--radius-control)}.tabs{gap:2px;border-bottom:1px solid var(--color-border)}.tabs button{position:relative;min-height:39px;gap:7px;padding:0 11px;color:var(--color-text-secondary);background:transparent;border:0}.tabs button.active{color:var(--color-brand-ink);font-weight:600}.tabs button.active::after{position:absolute;right:8px;bottom:-1px;left:8px;height:2px;content:'';background:var(--color-brand-action)}.operation-result{gap:8px;padding:9px 11px;font-size:11px;border:1px solid;border-radius:var(--radius-control)}.operation-result span{flex:1}.operation-result button{padding:3px;background:transparent;border:0}.operation-result--success{color:var(--color-success);background:var(--color-success-surface);border-color:var(--color-success)}.operation-result--danger{color:var(--color-danger);background:var(--color-danger-surface);border-color:var(--color-danger)}.operation-result--warning{color:var(--color-warning);background:var(--color-warning-surface);border-color:var(--color-warning)}.operation-result--unknown{color:var(--color-unknown);background:var(--color-unknown-surface);border-color:var(--color-border-strong)}.filter-bar{display:grid;grid-template-columns:minmax(220px,1fr) 140px 120px auto 38px;gap:7px;padding:10px 0;border-bottom:1px solid var(--color-border)}.filter-bar input,.filter-bar select,.filter-submit,.filter-reset{width:100%;height:36px;padding:0 9px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.search-field{display:grid;grid-template-columns:15px minmax(0,1fr);gap:6px;padding:0 9px;color:var(--color-text-secondary);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.search-field input{min-width:0;padding:0;border:0;outline:0}.filter-submit,.filter-reset{justify-content:center;color:var(--color-brand-action);font-weight:600;border-color:var(--color-brand-border)}.filter-reset{width:38px;padding:0}.directory{min-width:0;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-panel)}.user-grid,.session-grid{display:grid;grid-template-columns:minmax(190px,1.25fr) 125px 120px 145px 75px minmax(170px,auto);gap:12px;align-items:center}.session-grid{grid-template-columns:minmax(190px,1fr) minmax(180px,1.2fr) 120px 145px 75px 52px}.table-heading{min-height:36px;padding:0 13px;color:var(--color-text-secondary);font-size:10px;background:var(--color-surface-subtle);border-bottom:1px solid var(--color-border)}.table-row{min-height:67px;padding:9px 13px;border-bottom:1px solid var(--color-border)}.table-row:last-child{border-bottom:0}.user-identity,.session-identity{min-width:0;gap:9px}.user-identity>span{display:grid;width:30px;height:30px;flex:0 0 auto;place-items:center;color:var(--color-brand-ink);font-size:12px;font-weight:700;background:var(--color-brand-surface);border:1px solid var(--color-brand-border);border-radius:50%}.user-identity div,.session-identity div{display:grid;min-width:0}.user-identity strong,.session-identity strong{overflow:hidden;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.user-identity small,.session-identity small{overflow:hidden;color:var(--color-text-secondary);font-size:9px;text-overflow:ellipsis;white-space:nowrap}.session-identity>svg{color:var(--color-info)}.session-identity b{color:var(--color-brand-ink);font-weight:600}.role-badge{width:fit-content;gap:5px;padding:2px 6px;color:var(--color-info);font-size:10px;background:var(--color-info-surface);border-radius:8px}.table-row>span,.table-row>time{overflow:hidden;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.status-badge{width:fit-content;padding:2px 6px;color:var(--color-success);background:var(--color-success-surface);border-radius:8px}.status-badge.disabled{color:var(--color-danger);background:var(--color-danger-surface)}.client{white-space:normal!important}.row-actions{justify-content:flex-end;gap:4px}.row-actions button{display:grid;width:31px;height:31px;place-items:center;padding:0;color:var(--color-text-secondary);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.row-actions button:hover{color:var(--color-brand-action);border-color:var(--color-brand-border);background:var(--color-brand-surface)}.row-actions button.danger:hover{color:var(--color-danger);border-color:var(--color-danger);background:var(--color-danger-surface)}.load-more{height:38px;justify-self:center;gap:7px;padding:0 12px;color:var(--color-text-secondary);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.drawer-layer,.dialog-layer{position:fixed;z-index:80;inset:0;background:rgb(34 37 36/36%)}.drawer-layer{display:flex;justify-content:flex-end}.user-editor{display:flex;width:min(480px,100%);height:100%;flex-direction:column;background:var(--color-surface);box-shadow:-12px 0 36px rgb(34 37 36/16%)}.user-editor>header{justify-content:space-between;gap:12px;padding:15px 17px;border-bottom:1px solid var(--color-border)}.eyebrow{color:var(--color-brand-ink);font-size:9px;font-weight:700}.user-editor h2{font-size:17px}.user-editor header p{color:var(--color-text-secondary);font-size:10px}.user-editor>header button{display:grid;width:34px;height:34px;place-items:center;padding:0;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.editor-body{display:grid;gap:13px;overflow:auto;padding:17px}.editor-body label{display:grid;gap:5px}.editor-body label>span,.confirm-dialog label>span{color:var(--color-text-secondary);font-size:11px;font-weight:600}.editor-body input,.editor-body select,.confirm-dialog input{width:100%;height:39px;padding:0 9px;background:var(--color-surface);border:1px solid var(--color-border-strong);border-radius:var(--radius-control)}.role-note{align-items:flex-start;gap:9px;padding:10px;color:var(--color-info);background:var(--color-info-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.role-note p{display:grid;font-size:10px}.role-note strong{font-size:12px}.user-editor>footer{gap:8px;justify-content:flex-end;margin-top:auto;padding:12px 17px;border-top:1px solid var(--color-border)}.user-editor>footer button,.confirm-dialog footer button{min-height:36px;padding:0 11px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.user-editor>footer .save-action{color:white;background:var(--color-brand-action);border-color:var(--color-brand-action)}.dialog-layer{display:grid;place-items:center;padding:20px}.confirm-dialog{width:min(440px,100%);padding:18px;background:var(--color-surface);border-radius:var(--radius-overlay);box-shadow:0 16px 44px rgb(34 37 36/18%)}.confirm-dialog header{align-items:flex-start;gap:10px;color:var(--color-warning)}.confirm-dialog h2{color:var(--color-text-primary);font-size:16px}.confirm-dialog header p{margin-top:3px;color:var(--color-text-secondary);font-size:11px}.confirm-dialog label{display:grid;gap:5px;margin-top:14px}.confirm-dialog footer{justify-content:flex-end;gap:8px;margin-top:18px}.confirm-dialog footer .danger-action{color:white;background:var(--color-danger);border-color:var(--color-danger)}.spin{animation:spin 700ms linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:1100px){.user-grid{grid-template-columns:minmax(190px,1.25fr) 125px 130px 75px minmax(170px,auto)}.user-grid>*:nth-child(3){display:none}.session-grid{grid-template-columns:minmax(190px,1fr) minmax(180px,1.2fr) 145px 75px 52px}.session-grid>*:nth-child(3){display:none}}
@media(max-width:720px){.page-header{align-items:stretch;flex-direction:column}.filter-bar,.session-filters{grid-template-columns:1fr 1fr}.search-field{grid-column:1/-1}.filter-reset{justify-self:end}.table-heading{display:none}.directory{background:transparent;border:0}.table-row,.user-grid,.session-grid{grid-template-columns:1fr auto}.table-row{gap:8px 12px;margin-bottom:8px;padding:12px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-panel)}.user-identity,.session-identity{grid-column:1/-1}.user-grid>*:nth-child(3),.session-grid>*:nth-child(3){display:initial}.table-row>[data-label]::before{display:block;color:var(--color-text-secondary);content:attr(data-label);font-size:9px}.role-badge{display:flex!important}.row-actions{grid-column:1/-1;justify-content:flex-start;padding-top:3px;border-top:1px solid var(--color-border)}.user-editor{width:100%}}
</style>
