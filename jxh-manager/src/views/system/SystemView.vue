<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { Bot, CheckCircle2, CircleHelp, LoaderCircle, Power, RefreshCw, ShieldCheck } from '@lucide/vue'

import { AdminApiError } from '@/api/client'
import { authApi } from '@/api/auth'
import { systemApi } from '@/api/system'
import type { SystemConfiguration, SystemOperation } from '@/api/types'
import { reloadApplication } from '@/app/reload'
import OperationNotice from '@/components/feedback/OperationNotice.vue'
import BotRestartDialog from '@/components/system/BotRestartDialog.vue'
import SystemConfigurationForm from '@/components/system/SystemConfigurationForm.vue'
import { useAuthStore } from '@/stores/auth'

const RECONNECT_INTERVAL_MS = 1500
const RECONNECT_MAX_ATTEMPTS = 60

const auth = useAuthStore()
const configuration = ref<SystemConfiguration | null>(null)
const restartDialogOpen = ref(false)
const restartPending = ref(false)
const reconnecting = ref(false)
const reconnectTimedOut = ref(false)
const reconnectAttempts = ref(0)
const operation = ref<SystemOperation | null>(null)
const noticeMessage = ref('')
const noticeTone = ref<'success' | 'warning' | 'danger' | 'unknown' | 'info'>('info')

let reconnectTimer: ReturnType<typeof setInterval> | null = null
let reconnectChecking = false

const configurationVersion = computed(() => configuration.value?.version ?? null)
const canRestartBot = computed(() =>
  Boolean(configuration.value?.restart_supported && auth.hasPermission('bot:restart')),
)
const restartDisabled = computed(() => restartPending.value || reconnecting.value)
const appliedStatusLabel = computed(() => {
  if (!configuration.value) return '等待载入'
  if (configuration.value.restart_required) return '已保存，等待重启生效'
  return '当前配置已生效'
})

const operationStatusLabels: Record<SystemOperation['status'], string> = {
  accepted: '已受理',
  running: '执行中',
  succeeded: '已完成',
  failed: '失败',
  unknown: '结果未知',
}

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function formatTime(value: string | null): string {
  return value ? timeFormatter.format(new Date(value)) : '—'
}

function acceptConfiguration(value: SystemConfiguration): void {
  configuration.value = value
}

function clearReconnectTimer(): void {
  if (!reconnectTimer) return
  clearInterval(reconnectTimer)
  reconnectTimer = null
}

function stopReconnect(): void {
  clearReconnectTimer()
  reconnecting.value = false
  reconnectChecking = false
}

async function checkAuthAfterRestart(): Promise<void> {
  if (reconnectChecking) return

  reconnectChecking = true
  reconnectAttempts.value += 1
  try {
    const context = await authApi.me()
    if (context) {
      auth.acceptContext(context)
      stopReconnect()
      reloadApplication()
      return
    }
  } catch {
    // 重启窗口中后端短暂不可用是预期情况，继续等待下一次探测。
  } finally {
    reconnectChecking = false
  }

  if (reconnectAttempts.value >= RECONNECT_MAX_ATTEMPTS) {
    clearReconnectTimer()
    reconnecting.value = false
    reconnectTimedOut.value = true
    noticeTone.value = 'warning'
    noticeMessage.value = 'Bot 重启请求已提交，但 90 秒内未恢复登录状态。请稍后手动刷新页面。'
  }
}

function startReconnectPolling(): void {
  clearReconnectTimer()
  reconnecting.value = true
  reconnectTimedOut.value = false
  reconnectAttempts.value = 0
  reconnectChecking = false
  reconnectTimer = setInterval(() => {
    void checkAuthAfterRestart()
  }, RECONNECT_INTERVAL_MS)
}

function openRestartDialog(): void {
  if (!canRestartBot.value || restartDisabled.value) return
  restartDialogOpen.value = true
}

async function restartBot(): Promise<void> {
  const version = configurationVersion.value
  if (version === null || restartPending.value) return

  restartPending.value = true
  noticeMessage.value = ''
  try {
    operation.value = await systemApi.restartBot(version)
    noticeTone.value = operation.value.status === 'unknown' ? 'unknown' : 'success'
    noticeMessage.value = operation.value.status === 'unknown'
      ? 'Bot 重启结果未知，页面会继续等待登录状态恢复。'
      : 'Bot 重启请求已受理，正在等待服务重新登录。'
    restartDialogOpen.value = false
    startReconnectPolling()
  } catch (reason) {
    restartDialogOpen.value = false
    if (reason instanceof TypeError) {
      noticeTone.value = 'unknown'
      noticeMessage.value = 'Bot 重启请求结果未知。请稍后刷新页面确认当前状态，避免重复提交。'
    } else {
      noticeTone.value = reason instanceof AdminApiError && reason.status === 409 ? 'warning' : 'danger'
      noticeMessage.value = reason instanceof AdminApiError ? reason.message : 'Bot 重启请求未能完成。'
    }
  } finally {
    restartPending.value = false
  }
}

onBeforeUnmount(stopReconnect)
</script>

<template>
  <main class="system-page">
    <header class="page-header">
      <div>
        <h1 data-test="system-page-title">系统设置</h1>
        <p>按分类修改配置文件中的运行设置；系统环境变量仍只在部署阶段生效。</p>
      </div>
      <button
        v-if="canRestartBot"
        data-test="restart-bot"
        class="restart-action"
        type="button"
        :disabled="restartDisabled"
        @click="openRestartDialog"
      >
        <Power :size="16" aria-hidden="true" />
        重启 Bot
      </button>
    </header>

    <section v-if="configuration" class="apply-card" aria-label="配置生效方式">
      <div class="apply-status">
        <ShieldCheck v-if="!configuration.restart_required" :size="18" aria-hidden="true" />
        <RefreshCw v-else :size="18" aria-hidden="true" />
        <div>
          <strong>{{ appliedStatusLabel }}</strong>
          <span>
            当前版本 {{ configuration.version }} · 已应用版本 {{ configuration.applied_version }}
          </span>
        </div>
      </div>
      <p v-if="configuration.restart_supported">
        修改配置文件后需要通过受控 Bot 重启让运行进程重新加载；确认文本固定为小写 ASCII
        <code>restart</code>。
      </p>
      <p v-else>
        当前部署方式不支持从管理端重启 Bot，请在部署平台执行重启。
      </p>
    </section>

    <OperationNotice
      :message="noticeMessage"
      :tone="noticeTone"
      :revision="noticeMessage"
      @close="noticeMessage = ''"
    />

    <section v-if="operation" class="operation-card" aria-labelledby="bot-operation-title">
      <header>
        <div>
          <span class="eyebrow">BOT OPERATION</span>
          <h2 id="bot-operation-title">Bot 重启操作</h2>
        </div>
        <span :class="`operation-status operation-status--${operation.status}`">
          {{ operationStatusLabels[operation.status] }}
        </span>
      </header>
      <dl>
        <div>
          <dt>操作 ID</dt>
          <dd class="mono">{{ operation.operation_id }}</dd>
        </div>
        <div>
          <dt>请求时间</dt>
          <dd>{{ formatTime(operation.requested_at) }}</dd>
        </div>
        <div>
          <dt>完成时间</dt>
          <dd>{{ formatTime(operation.completed_at) }}</dd>
        </div>
        <div>
          <dt>错误代码</dt>
          <dd class="mono">{{ operation.error_code || '—' }}</dd>
        </div>
      </dl>
    </section>

    <SystemConfigurationForm
      :can-write="auth.hasPermission('config:write')"
      @loaded="acceptConfiguration"
      @saved="acceptConfiguration"
    />

    <BotRestartDialog
      :open="restartDialogOpen"
      :configuration-version="configurationVersion"
      :busy="restartPending"
      @cancel="restartDialogOpen = false"
      @confirm="restartBot"
    />

    <div v-if="reconnecting || reconnectTimedOut" data-test="reconnect-overlay" class="reconnect-overlay" role="status">
      <section class="reconnect-card">
        <div class="reconnect-icon">
          <LoaderCircle v-if="reconnecting" class="spin" :size="24" aria-hidden="true" />
          <CircleHelp v-else :size="24" aria-hidden="true" />
        </div>
        <div>
          <h2>{{ reconnecting ? '正在等待 Bot 恢复登录' : '等待登录恢复超时' }}</h2>
          <p v-if="reconnecting">
            管理端每 1.5 秒检查一次登录状态，恢复后会自动刷新页面。
          </p>
          <p v-else>
            后端可能仍在启动或容器守护未拉起进程，请稍后手动刷新。
          </p>
          <span class="mono">尝试 {{ reconnectAttempts }} / {{ RECONNECT_MAX_ATTEMPTS }}</span>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.system-page {
  display: grid;
  gap: 16px;
}

.page-header,
.restart-action,
.apply-status,
.operation-card > header {
  display: flex;
  align-items: center;
}

.page-header {
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

.restart-action {
  min-height: 38px;
  gap: 7px;
  padding: 0 12px;
  color: white;
  font-weight: 700;
  background: var(--color-danger);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-control);
}

.restart-action:disabled {
  color: var(--color-text-disabled);
  cursor: not-allowed;
  background: var(--color-surface-subtle);
  border-color: var(--color-border);
}

.apply-card,
.operation-card,
.reconnect-card {
  min-width: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.apply-card {
  display: grid;
  grid-template-columns: minmax(260px, 0.8fr) minmax(280px, 1.2fr);
  gap: 14px;
  align-items: center;
  padding: 14px 16px;
}

.apply-status {
  gap: 10px;
  color: var(--color-brand-action);
}

.apply-status > div {
  display: grid;
  min-width: 0;
}

.apply-status strong {
  color: var(--color-text-primary);
  font-size: 14px;
}

.apply-status span,
.apply-card p {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.apply-card code {
  color: var(--color-danger);
  font-family: var(--font-mono);
  font-weight: 700;
}

.operation-card > header {
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);
}

.eyebrow {
  color: var(--color-brand-ink);
  font-size: 10px;
  font-weight: 700;
}

.operation-card h2 {
  font-size: 15px;
}

.operation-status {
  padding: 2px 7px;
  color: var(--color-info);
  font-size: 10px;
  background: var(--color-info-surface);
  border-radius: 8px;
}

.operation-status--failed {
  color: var(--color-danger);
  background: var(--color-danger-surface);
}

.operation-status--unknown {
  color: var(--color-unknown);
  background: var(--color-unknown-surface);
}

.operation-card dl {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
}

.operation-card dl div {
  min-width: 0;
  padding: 10px 14px;
  border-right: 1px solid var(--color-border);
}

.operation-card dl div:last-child {
  border-right: 0;
}

.operation-card dt {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.operation-card dd {
  margin: 2px 0 0;
  overflow-wrap: anywhere;
  font-size: 11px;
}

.reconnect-overlay {
  position: fixed;
  z-index: 100;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(34 37 36 / 42%);
}

.reconnect-card {
  display: grid;
  width: min(460px, 100%);
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 12px;
  padding: 18px;
  box-shadow: 0 18px 48px rgb(34 37 36 / 22%);
}

.reconnect-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  color: var(--color-brand-action);
  background: var(--color-brand-surface);
  border-radius: var(--radius-control);
}

.reconnect-card h2 {
  font-size: 16px;
}

.reconnect-card p {
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.reconnect-card span {
  display: inline-block;
  margin-top: 8px;
  color: var(--color-text-secondary);
  font-size: 10px;
}

.spin {
  animation: spin 700ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .page-header {
    align-items: stretch;
    flex-direction: column;
  }

  .restart-action {
    justify-content: center;
  }

  .apply-card,
  .operation-card dl,
  .reconnect-card {
    grid-template-columns: minmax(0, 1fr);
  }

  .operation-card dl div {
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
  }

  .operation-card dl div:last-child {
    border-bottom: 0;
  }
}
</style>
