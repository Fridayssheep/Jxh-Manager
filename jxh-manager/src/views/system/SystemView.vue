<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  AlertTriangle, CheckCircle2, Database, KeyRound,
  Power, Radio, RefreshCw, ServerCog, Settings2, ShieldAlert, X, Zap,
} from '@lucide/vue'

import { AdminApiError } from '@/api/client'
import { systemApi } from '@/api/system'
import type {
  DependencyHealth, DependencyKey, DependencyStatus, SystemHealth, SystemOperation,
  SystemOperationStatus,
} from '@/api/types'
import ResourceState from '@/components/feedback/ResourceState.vue'
import { subscribeToAdminEvents } from '@/composables/useAdminEvents'
import { useAuthStore } from '@/stores/auth'
import { useRuntimeStore } from '@/stores/runtime'

const auth = useAuthStore()
const runtime = useRuntimeStore()
const health = ref<SystemHealth | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const restartOpen = ref(false)
const restartConfirmation = ref('')
const restartReason = ref('')
const restartPending = ref(false)
const operation = ref<SystemOperation | null>(null)
const operationResult = ref<string | null>(null)
const operationTone = ref<'success' | 'danger' | 'warning' | 'unknown'>('success')

const primaryKeys: DependencyKey[] = ['napcat', 'mysql', 'wps', 'ai', 'quote']
const secondaryKeys: DependencyKey[] = ['worker', 'scheduler', 'telemetry']
const dependencyLabels: Record<DependencyKey, string> = {
  napcat: 'NapCat', mysql: 'MySQL', wps: 'WPS', ai: 'AI 服务', quote: '引用图',
  worker: '后台任务', scheduler: '调度器', telemetry: '统计管线',
}
const statusLabels: Record<DependencyStatus, string> = {
  healthy: '健康', degraded: '降级', unavailable: '不可用',
  not_configured: '未配置', unknown: '未知',
}
const operationStatusLabels: Record<SystemOperationStatus, string> = {
  accepted: '已受理', running: '执行中', succeeded: '已完成', failed: '失败', unknown: '结果未知',
}
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
})

const dependencyMap = computed(() => new Map(health.value?.dependencies.map((item) => [item.key, item]) ?? []))
const primaryDependencies = computed(() => primaryKeys.map((key) => dependencyMap.value.get(key) ?? missingDependency(key)))
const secondaryDependencies = computed(() => secondaryKeys.map((key) => dependencyMap.value.get(key) ?? missingDependency(key)))
const restartConfirmationValid = computed(() => restartConfirmation.value === 'restart')
const liveStatusLabel = computed(() => {
  if (runtime.liveStatus === 'connected') return '实时连接正常'
  if (runtime.liveStatus === 'connecting') return '正在建立连接'
  return '实时连接中断'
})
const liveStatusTone = computed<DependencyStatus>(() => runtime.liveStatus === 'connected' ? 'healthy' : runtime.liveStatus === 'connecting' ? 'unknown' : 'degraded')

function missingDependency(key: DependencyKey): DependencyHealth {
  return {
    key, status: 'unknown', configured: false, required: false, latency_ms: null,
    last_checked_at: null, last_success_at: null, last_error_at: null, message: '后端未返回该依赖状态',
  }
}

function displayTime(value: string | null): string {
  return value ? timeFormatter.format(new Date(value)) : '尚无记录'
}

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    health.value = await systemApi.getHealth()
  } catch (reason) {
    error.value = reason
  } finally {
    loading.value = false
  }
}

function openRestart(): void {
  restartConfirmation.value = ''
  restartReason.value = ''
  restartOpen.value = true
}

async function restartNapCat(): Promise<void> {
  if (!restartConfirmationValid.value) return
  restartPending.value = true
  operationResult.value = null
  try {
    operation.value = await systemApi.restartNapCat(restartReason.value)
    operationTone.value = operation.value.status === 'unknown' ? 'unknown' : 'success'
    operationResult.value = operation.value.status === 'unknown'
      ? '重启结果未知，请通过健康状态和操作记录确认。'
      : '重启请求已受理，系统会通过实时事件更新后续状态。'
    restartOpen.value = false
  } catch (reason) {
    if (reason instanceof TypeError) {
      operationTone.value = 'unknown'
      operationResult.value = '重启结果未知。连接已中断，请不要重复提交，先刷新系统健康状态。'
    } else {
      operationTone.value = reason instanceof AdminApiError && reason.status === 409 ? 'warning' : 'danger'
      operationResult.value = reason instanceof AdminApiError ? reason.message : 'NapCat 重启请求未能完成。'
    }
    restartOpen.value = false
  } finally {
    restartPending.value = false
  }
}

const unsubscribe = subscribeToAdminEvents((event) => {
  if (event.event === 'system.health_changed' || event.event === 'stream.reset') void load()
})
onMounted(() => { void load() })
onBeforeUnmount(unsubscribe)
</script>

<template>
  <main class="system-page">
    <header class="page-header">
      <div><h1>系统设置</h1><p>查看依赖健康、新鲜度和受控的运行时操作。</p></div>
      <button class="refresh-action" type="button" :disabled="loading" @click="load"><RefreshCw :class="{ spin: loading }" :size="16" />刷新状态</button>
    </header>

    <ResourceState v-if="loading && !health" state="loading" title="正在读取系统健康" description="正在汇总运行状态和最近探测结果。" />
    <ResourceState v-else-if="error && !health" state="error" title="系统健康读取失败" description="没有可展示的快照，可以直接重试。" @retry="load" />

    <template v-else-if="health">
      <section class="readiness-strip" aria-label="系统就绪状态">
        <div><span>进程存活</span><strong><CheckCircle2 :size="15" />正常</strong></div>
        <div><span>管理服务就绪度</span><strong :class="`tone--${health.readiness}`"><AlertTriangle v-if="health.readiness !== 'healthy'" :size="15" /><CheckCircle2 v-else :size="15" />{{ statusLabels[health.readiness] }}</strong></div>
        <div><span>快照生成时间</span><strong class="mono">{{ displayTime(health.generated_at) }}</strong></div>
      </section>

      <div v-if="operationResult" :class="['operation-result', `operation-result--${operationTone}`]" :role="operationTone === 'success' ? 'status' : 'alert'">
        <CheckCircle2 v-if="operationTone === 'success'" :size="17" /><AlertTriangle v-else :size="17" /><span>{{ operationResult }}</span><button type="button" aria-label="关闭提示" @click="operationResult = null"><X :size="15" /></button>
      </div>

      <section class="dependency-section">
        <header><div><h2>关键依赖</h2><p>固定顺序便于值班时快速比较；配置状态不包含任何密钥值。</p></div><ServerCog :size="19" /></header>
        <div class="dependency-grid">
          <article v-for="dependency in primaryDependencies" :key="dependency.key" :class="['dependency', `dependency--${dependency.status}`]">
            <header>
              <Database v-if="dependency.key === 'mysql'" :size="18" />
              <Zap v-else-if="dependency.key === 'napcat'" :size="18" />
              <Settings2 v-else :size="18" />
              <div><h3>{{ dependencyLabels[dependency.key] }}</h3><span>{{ dependency.required ? '必要依赖' : '可选依赖' }}</span></div>
              <span class="status-badge">{{ statusLabels[dependency.status] }}</span>
            </header>
            <dl>
              <div><dt>配置</dt><dd>{{ dependency.configured ? '已配置' : '未配置' }}</dd></div>
              <div><dt>延迟</dt><dd class="mono">{{ dependency.latency_ms === null ? '—' : `${dependency.latency_ms} ms` }}</dd></div>
              <div><dt>最近成功</dt><dd>{{ displayTime(dependency.last_success_at) }}</dd></div>
              <div><dt>状态摘要</dt><dd>{{ dependency.message || '无补充信息' }}</dd></div>
            </dl>
            <footer v-if="dependency.key === 'napcat' && auth.hasPermission('napcat:restart')"><button data-test="restart-napcat" type="button" @click="openRestart"><Power :size="14" />重启 NapCat</button></footer>
          </article>

          <article :class="['dependency', `dependency--${liveStatusTone}`]">
            <header><Radio :size="18" /><div><h3>SSE 实时事件</h3><span>浏览器连接</span></div><span class="status-badge">{{ runtime.liveStatus === 'connected' ? '健康' : runtime.liveStatus === 'connecting' ? '连接中' : '已断开' }}</span></header>
            <dl><div><dt>状态</dt><dd>{{ liveStatusLabel }}</dd></div><div><dt>凭据</dt><dd>Cookie 会话</dd></div><div class="wide"><dt>降级策略</dt><dd>连接中断时保留手动刷新，浏览器继续自动重连。</dd></div></dl>
          </article>
        </div>
      </section>

      <section class="service-section">
        <header><div><h2>后台服务</h2><p>执行队列、调度和统计管线的最近检查。</p></div></header>
        <div class="service-table">
          <div class="service-heading" aria-hidden="true"><span>服务</span><span>状态</span><span>最近检查</span><span>最近错误</span><span>摘要</span></div>
          <div v-for="dependency in secondaryDependencies" :key="dependency.key" class="service-row">
            <strong>{{ dependencyLabels[dependency.key] }}</strong><span :class="`service-status service-status--${dependency.status}`">{{ statusLabels[dependency.status] }}</span><time>{{ displayTime(dependency.last_checked_at) }}</time><time>{{ displayTime(dependency.last_error_at) }}</time><span>{{ dependency.message || '无补充信息' }}</span>
          </div>
        </div>
      </section>

      <section v-if="operation" class="operation-card" aria-labelledby="operation-title">
        <header><div><span class="eyebrow">LATEST OPERATION</span><h2 id="operation-title">NapCat 重启操作</h2></div><span :class="`operation-status operation-status--${operation.status}`">{{ operationStatusLabels[operation.status] }}</span></header>
        <dl><div><dt>操作 ID</dt><dd class="mono">{{ operation.operation_id }}</dd></div><div><dt>请求时间</dt><dd>{{ displayTime(operation.requested_at) }}</dd></div><div><dt>完成时间</dt><dd>{{ displayTime(operation.completed_at) }}</dd></div><div><dt>错误代码</dt><dd class="mono">{{ operation.error_code || '—' }}</dd></div></dl>
      </section>
    </template>

    <div v-if="restartOpen" class="dialog-layer" role="presentation">
      <section class="restart-dialog" role="alertdialog" aria-modal="true" aria-labelledby="restart-title">
        <header><ShieldAlert :size="22" /><div><span class="eyebrow">DANGEROUS OPERATION</span><h2 id="restart-title">重启 NapCat</h2><p>重启期间依赖 OneBot 的审批、发送和群操作会暂时不可用。</p></div></header>
        <label><span>确认文本</span><input v-model="restartConfirmation" data-test="restart-confirmation" autocomplete="off" spellcheck="false" /><small>请输入小写 ASCII：<code>restart</code></small></label>
        <label><span>操作原因（可选）</span><textarea v-model="restartReason" data-test="restart-reason" rows="3" maxlength="500" /></label>
        <footer><button type="button" @click="restartOpen = false">取消</button><button data-test="confirm-restart" class="danger-action" type="button" :disabled="!restartConfirmationValid || restartPending" @click="restartNapCat"><KeyRound :size="14" />{{ restartPending ? '正在提交' : '确认重启' }}</button></footer>
      </section>
    </div>
  </main>
</template>

<style scoped>
.system-page{display:grid;gap:16px}.page-header,.refresh-action,.readiness-strip,.readiness-strip strong,.operation-result,.dependency-section>header,.dependency header,.dependency footer button,.service-section>header,.operation-card>header,.restart-dialog header,.restart-dialog footer,.restart-dialog footer button{display:flex;align-items:center}.page-header{justify-content:space-between;gap:16px}.page-header h1{font-size:24px;line-height:34px}.page-header p,.dependency-section>header p,.service-section>header p{color:var(--color-text-secondary);font-size:12px}.refresh-action{min-height:36px;gap:7px;padding:0 10px;color:var(--color-brand-action);background:var(--color-surface);border:1px solid var(--color-brand-border);border-radius:var(--radius-control)}.readiness-strip{display:grid;grid-template-columns:1fr 1fr 1.2fr;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-panel)}.readiness-strip>div{display:grid;gap:2px;padding:11px 13px;border-right:1px solid var(--color-border)}.readiness-strip>div:last-child{border-right:0}.readiness-strip span{color:var(--color-text-secondary);font-size:10px}.readiness-strip strong{gap:6px;color:var(--color-success);font-size:12px}.readiness-strip .tone--degraded{color:var(--color-warning)}.readiness-strip .tone--unavailable{color:var(--color-danger)}.operation-result{gap:8px;padding:9px 11px;font-size:11px;border:1px solid;border-radius:var(--radius-control)}.operation-result span{flex:1}.operation-result button{padding:3px;background:transparent;border:0}.operation-result--success{color:var(--color-success);background:var(--color-success-surface);border-color:var(--color-success)}.operation-result--danger{color:var(--color-danger);background:var(--color-danger-surface);border-color:var(--color-danger)}.operation-result--warning{color:var(--color-warning);background:var(--color-warning-surface);border-color:var(--color-warning)}.operation-result--unknown{color:var(--color-unknown);background:var(--color-unknown-surface);border-color:var(--color-border-strong)}.dependency-section,.service-section{display:grid;gap:10px}.dependency-section>header,.service-section>header{justify-content:space-between}.dependency-section h2,.service-section h2,.operation-card h2{font-size:15px}.dependency-section>header>svg{color:var(--color-brand-action)}.dependency-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.dependency{display:flex;min-width:0;min-height:210px;flex-direction:column;background:var(--color-surface);border:1px solid var(--color-border);border-top:3px solid var(--color-unknown);border-radius:var(--radius-panel)}.dependency--healthy{border-top-color:var(--color-success)}.dependency--degraded{border-top-color:var(--color-warning)}.dependency--unavailable{border-top-color:var(--color-danger)}.dependency header{gap:8px;padding:11px 12px;border-bottom:1px solid var(--color-border)}.dependency header>svg{color:var(--color-info)}.dependency header div{display:grid;min-width:0}.dependency h3{font-size:13px}.dependency header div span{color:var(--color-text-secondary);font-size:9px}.status-badge{margin-left:auto;padding:2px 6px;color:var(--color-unknown);font-size:9px;background:var(--color-unknown-surface);border-radius:8px}.dependency--healthy .status-badge{color:var(--color-success);background:var(--color-success-surface)}.dependency--degraded .status-badge{color:var(--color-warning);background:var(--color-warning-surface)}.dependency--unavailable .status-badge{color:var(--color-danger);background:var(--color-danger-surface)}.dependency dl{display:grid;grid-template-columns:1fr 1fr;margin:0}.dependency dl div{min-width:0;padding:8px 11px;border-right:1px solid var(--color-border);border-bottom:1px solid var(--color-border)}.dependency dl div:nth-child(2n){border-right:0}.dependency dl .wide{grid-column:1/-1;border-right:0}.dependency dt,.operation-card dt{color:var(--color-text-secondary);font-size:9px}.dependency dd,.operation-card dd{margin:1px 0 0;overflow-wrap:anywhere;font-size:10px}.dependency footer{margin-top:auto;padding:8px 11px}.dependency footer button{min-height:32px;gap:6px;padding:0 9px;color:var(--color-danger);background:var(--color-danger-surface);border:1px solid var(--color-danger);border-radius:var(--radius-control)}.service-table{background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-panel)}.service-heading,.service-row{display:grid;grid-template-columns:minmax(110px,.7fr) 90px 150px 150px minmax(160px,1.2fr);gap:12px;align-items:center;padding:0 13px}.service-heading{min-height:34px;color:var(--color-text-secondary);font-size:9px;background:var(--color-surface-subtle);border-bottom:1px solid var(--color-border)}.service-row{min-height:52px;font-size:10px;border-bottom:1px solid var(--color-border)}.service-row:last-child{border-bottom:0}.service-row strong{font-size:11px}.service-status{width:fit-content;padding:2px 6px;color:var(--color-unknown);background:var(--color-unknown-surface);border-radius:8px}.service-status--healthy{color:var(--color-success);background:var(--color-success-surface)}.service-status--degraded{color:var(--color-warning);background:var(--color-warning-surface)}.service-status--unavailable{color:var(--color-danger);background:var(--color-danger-surface)}.operation-card{background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-panel)}.operation-card>header{justify-content:space-between;padding:11px 13px;border-bottom:1px solid var(--color-border)}.eyebrow{color:var(--color-brand-ink);font-size:9px;font-weight:700}.operation-status{padding:2px 7px;color:var(--color-info);font-size:10px;background:var(--color-info-surface);border-radius:8px}.operation-status--failed{color:var(--color-danger);background:var(--color-danger-surface)}.operation-status--unknown{color:var(--color-unknown);background:var(--color-unknown-surface)}.operation-card dl{display:grid;grid-template-columns:repeat(4,1fr);margin:0}.operation-card dl div{padding:9px 13px;border-right:1px solid var(--color-border)}.operation-card dl div:last-child{border-right:0}.dialog-layer{position:fixed;z-index:90;inset:0;display:grid;place-items:center;padding:20px;background:rgb(34 37 36/36%)}.restart-dialog{width:min(480px,100%);padding:18px;background:var(--color-surface);border-radius:var(--radius-overlay);box-shadow:0 16px 44px rgb(34 37 36/18%)}.restart-dialog header{align-items:flex-start;gap:10px;color:var(--color-danger)}.restart-dialog h2{color:var(--color-text-primary);font-size:17px}.restart-dialog header p{margin-top:3px;color:var(--color-text-secondary);font-size:11px}.restart-dialog label{display:grid;gap:5px;margin-top:14px}.restart-dialog label>span{color:var(--color-text-secondary);font-size:11px;font-weight:600}.restart-dialog input,.restart-dialog textarea{width:100%;padding:0 9px;background:var(--color-surface);border:1px solid var(--color-border-strong);border-radius:var(--radius-control)}.restart-dialog input{height:39px;font-family:var(--font-mono)}.restart-dialog textarea{padding-block:8px;resize:vertical}.restart-dialog small{color:var(--color-text-secondary);font-size:10px}.restart-dialog code{color:var(--color-danger);font-family:var(--font-mono);font-weight:700}.restart-dialog footer{justify-content:flex-end;gap:8px;margin-top:18px}.restart-dialog footer button{min-height:36px;gap:6px;padding:0 10px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.restart-dialog footer .danger-action{color:white;background:var(--color-danger);border-color:var(--color-danger)}.restart-dialog footer .danger-action:disabled{color:var(--color-text-disabled);background:var(--color-surface-subtle);border-color:var(--color-border)}.spin{animation:spin 700ms linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:1050px){.dependency-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.service-heading,.service-row{grid-template-columns:minmax(110px,.7fr) 90px 140px minmax(160px,1.2fr)}.service-heading>*:nth-child(4),.service-row>*:nth-child(4){display:none}}
@media(max-width:680px){.page-header{align-items:stretch;flex-direction:column}.refresh-action{justify-content:center}.readiness-strip{grid-template-columns:1fr}.readiness-strip>div{border-right:0;border-bottom:1px solid var(--color-border)}.readiness-strip>div:last-child{border-bottom:0}.dependency-grid{grid-template-columns:1fr}.dependency{min-height:0}.service-heading{display:none}.service-table{background:transparent;border:0}.service-row{grid-template-columns:1fr auto;gap:5px 10px;margin-bottom:8px;padding:10px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-panel)}.service-row>*:nth-child(3),.service-row>*:nth-child(5){grid-column:1/-1}.service-row>*:nth-child(3)::before{color:var(--color-text-secondary);content:'最近检查 ';font-size:9px}.operation-card dl{grid-template-columns:1fr 1fr}.operation-card dl div{border-bottom:1px solid var(--color-border)}.operation-card dl div:nth-child(2n){border-right:0}}
</style>
