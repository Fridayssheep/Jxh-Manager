<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  AlertTriangle, Archive, CalendarClock, CheckCircle2, FilterX,
  FlaskConical, LoaderCircle, Pause, Pencil, Play, Plus, RefreshCw, Send, X,
} from '@lucide/vue'

import { AdminApiError } from '@/api/client'
import { groupsApi } from '@/api/groups'
import { scheduledJobsApi, type ScheduledJobListQuery } from '@/api/scheduled-jobs'
import type {
  Group, RunResult, ScheduledJob, ScheduledJobCreateRequest, ScheduledJobRun,
  ScheduledJobStatus, ScheduledJobType,
} from '@/api/types'
import ResourceState from '@/components/feedback/ResourceState.vue'
import { subscribeToAdminEvents } from '@/composables/useAdminEvents'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const jobs = ref<ScheduledJob[]>([])
const groups = ref<Group[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<unknown>(null)
const nextCursor = ref<string | null>(null)
const hasMore = ref(false)
const busyIds = ref(new Set<string>())
const editorOpen = ref(false)
const editingJob = ref<ScheduledJob | null>(null)
const saving = ref(false)
const confirmMode = ref<'test' | 'archive' | null>(null)
const pendingJob = ref<ScheduledJob | null>(null)
const confirming = ref(false)
const runs = ref<ScheduledJobRun[]>([])
const runsLoading = ref(false)
const operationResult = ref<string | null>(null)
const operationTone = ref<'success' | 'warning' | 'danger' | 'unknown'>('success')

const filters = reactive<{
  groupId: string; type: ScheduledJobType | ''; status: ScheduledJobStatus | ''; runResult: RunResult | ''
}>({ groupId: '', type: '', status: '', runResult: '' })

const form = reactive({
  name: '', groupId: '', message: '', scheduleType: 'daily' as ScheduledJobType,
  dailyTime: '09:00', runAt: '', status: 'active' as 'active' | 'paused', enabled: true,
})

const statusLabels: Record<ScheduledJobStatus, string> = {
  active: '运行中', paused: '已暂停', completed: '已完成', archived: '已归档',
}
const resultLabels: Record<RunResult, string> = {
  success: '成功', failed: '失败', unknown: '结果未知', skipped: '已跳过',
}

const availableGroups = computed(() => {
  const result = [...groups.value]
  const current = editingJob.value?.group
  if (current && !result.some((group) => group.group_id === current.group_id)) {
    result.unshift({ ...current } as Group)
  }
  return result
})

function displayTime(value: string | null): string {
  return value ? value.replace('T', ' ').replace('Z', '').slice(0, 16) : '尚无'
}

function listQuery(cursor: string | null): ScheduledJobListQuery {
  return { groupId: filters.groupId.trim(), type: filters.type, status: filters.status, runResult: filters.runResult, cursor }
}

async function load(reset = true): Promise<void> {
  if (reset) loading.value = true
  else loadingMore.value = true
  error.value = null
  try {
    const page = await scheduledJobsApi.list(listQuery(reset ? null : nextCursor.value))
    jobs.value = reset ? page.items : [...jobs.value, ...page.items]
    nextCursor.value = page.next_cursor
    hasMore.value = page.has_more
  } catch (reason) {
    error.value = reason
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

async function loadGroups(): Promise<void> {
  try {
    const page = await groupsApi.list({ query: '', botRole: '', snapshotState: '', featureKey: '', featureEnabled: null, cursor: null, limit: 100 })
    groups.value = page.items
  } catch {
    groups.value = []
  }
}

function resetFilters(): void {
  Object.assign(filters, { groupId: '', type: '', status: '', runResult: '' })
  void load()
}

function localDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function openNew(): void {
  editingJob.value = null
  Object.assign(form, {
    name: '', groupId: groups.value[0]?.group_id ?? '', message: '', scheduleType: 'daily',
    dailyTime: '09:00', runAt: '', status: 'active', enabled: true,
  })
  runs.value = []
  editorOpen.value = true
}

async function openEdit(job: ScheduledJob): Promise<void> {
  editingJob.value = job
  Object.assign(form, {
    name: job.name, groupId: job.group.group_id, message: job.message,
    scheduleType: job.schedule.type,
    dailyTime: job.schedule.type === 'daily' ? job.schedule.local_time.slice(0, 5) : '09:00',
    runAt: job.schedule.type === 'once' ? localDateTime(job.schedule.run_at) : '',
    status: job.status === 'paused' ? 'paused' : 'active', enabled: job.status === 'active',
  })
  editorOpen.value = true
  runsLoading.value = true
  try {
    const page = await scheduledJobsApi.listRuns(job.job_id, { kind: '', result: '', from: '', to: '', cursor: null })
    runs.value = page.items
  } catch {
    runs.value = []
  } finally {
    runsLoading.value = false
  }
}

function schedulePayload(): ScheduledJobCreateRequest['schedule'] {
  return form.scheduleType === 'daily'
    ? { type: 'daily', local_time: form.dailyTime.length === 5 ? `${form.dailyTime}:00` : form.dailyTime, timezone: 'Asia/Shanghai' }
    : { type: 'once', run_at: new Date(form.runAt).toISOString() }
}

async function saveJob(): Promise<void> {
  if (!form.name.trim() || !form.groupId || !form.message.trim() || (form.scheduleType === 'once' && !form.runAt)) {
    operationTone.value = 'warning'
    operationResult.value = '请完整填写任务名称、目标群、消息和调度时间。'
    return
  }
  saving.value = true
  try {
    const saved = editingJob.value
      ? await scheduledJobsApi.update(editingJob.value.job_id, {
          name: form.name.trim(), group_id: form.groupId, message: form.message,
          schedule: schedulePayload(), status: form.status,
        }, editingJob.value.version)
      : await scheduledJobsApi.create({
          name: form.name.trim(), group_id: form.groupId, message: form.message,
          schedule: schedulePayload(), enabled: form.enabled,
        })
    const index = jobs.value.findIndex((job) => job.job_id === saved.job_id)
    if (index >= 0) jobs.value.splice(index, 1, saved)
    else jobs.value.unshift(saved)
    editorOpen.value = false
    operationTone.value = 'success'
    operationResult.value = `${saved.name} 已保存，版本 ${saved.version}。`
  } catch (reason) {
    operationTone.value = reason instanceof AdminApiError && reason.status === 409 ? 'warning' : 'danger'
    operationResult.value = reason instanceof AdminApiError ? reason.message : '任务保存失败。'
  } finally {
    saving.value = false
  }
}

function askConfirm(mode: 'test' | 'archive', job: ScheduledJob): void {
  confirmMode.value = mode
  pendingJob.value = job
}

async function confirmAction(): Promise<void> {
  const job = pendingJob.value
  const mode = confirmMode.value
  if (!job || !mode) return
  confirming.value = true
  try {
    if (mode === 'test') {
      const run = await scheduledJobsApi.testSend(job.job_id, job.version)
      if (editingJob.value?.job_id === job.job_id) runs.value = [run, ...runs.value]
      operationTone.value = run.result === 'unknown' ? 'unknown' : run.result === 'success' ? 'success' : 'danger'
      operationResult.value = run.result === 'unknown'
        ? '测试发送结果未知。正式任务状态和运行时间均未改变，请先查看执行记录。'
        : `测试发送${resultLabels[run.result]}，正式任务状态和运行时间未改变。`
    } else {
      await scheduledJobsApi.archive(job.job_id, job.version)
      jobs.value = jobs.value.filter((item) => item.job_id !== job.job_id)
      if (editingJob.value?.job_id === job.job_id) editorOpen.value = false
      operationTone.value = 'success'
      operationResult.value = `${job.name} 已归档。`
    }
  } catch (reason) {
    if (mode === 'test' && reason instanceof TypeError) {
      operationTone.value = 'unknown'
      operationResult.value = '测试发送结果未知。连接已中断，请不要重复提交，先刷新执行记录。'
    } else {
      operationTone.value = reason instanceof AdminApiError && reason.status === 409 ? 'warning' : 'danger'
      operationResult.value = reason instanceof AdminApiError ? reason.message : `${mode === 'test' ? '测试发送' : '归档'}失败。`
    }
  } finally {
    confirming.value = false
    confirmMode.value = null
    pendingJob.value = null
  }
}

function setBusy(id: string, value: boolean): void {
  const next = new Set(busyIds.value)
  if (value) next.add(id)
  else next.delete(id)
  busyIds.value = next
}

async function toggleStatus(job: ScheduledJob): Promise<void> {
  setBusy(job.job_id, true)
  try {
    const saved = await scheduledJobsApi.update(job.job_id, { status: job.status === 'active' ? 'paused' : 'active' }, job.version)
    const index = jobs.value.findIndex((item) => item.job_id === saved.job_id)
    if (index >= 0) jobs.value.splice(index, 1, saved)
  } catch (reason) {
    operationTone.value = 'danger'
    operationResult.value = reason instanceof AdminApiError ? reason.message : '任务状态更新失败。'
  } finally {
    setBusy(job.job_id, false)
  }
}

const unsubscribe = subscribeToAdminEvents((event) => {
  if (event.event.startsWith('scheduled_job.')) void load()
})

onMounted(() => { void Promise.all([load(), loadGroups()]) })
onBeforeUnmount(unsubscribe)
</script>

<template>
  <main class="jobs-page">
    <header class="page-header">
      <div><h1>定时任务</h1><p>管理每日与单次群消息，并区分正式运行和测试发送。</p></div>
      <button v-if="auth.hasPermission('scheduled_jobs:write')" class="primary-action" type="button" @click="openNew"><Plus :size="17" aria-hidden="true" />新建任务</button>
    </header>

    <form class="filter-bar" @submit.prevent="load()">
      <label><span class="sr-only">群号</span><input v-model="filters.groupId" placeholder="完整群号" /></label>
      <label><span class="sr-only">任务类型</span><select v-model="filters.type"><option value="">全部类型</option><option value="daily">每日</option><option value="once">单次</option></select></label>
      <label><span class="sr-only">任务状态</span><select v-model="filters.status"><option value="">全部状态</option><option v-for="(label, value) in statusLabels" :key="value" :value="value">{{ label }}</option></select></label>
      <label><span class="sr-only">最近结果</span><select v-model="filters.runResult"><option value="">全部结果</option><option v-for="(label, value) in resultLabels" :key="value" :value="value">{{ label }}</option></select></label>
      <button class="filter-submit" type="submit">应用筛选</button>
      <button class="icon-button" type="button" title="清除筛选" aria-label="清除筛选" @click="resetFilters"><FilterX :size="16" aria-hidden="true" /></button>
    </form>

    <div v-if="operationResult" :class="['operation-result', `operation-result--${operationTone}`]" :role="operationTone === 'success' ? 'status' : 'alert'">
      <CheckCircle2 v-if="operationTone === 'success'" :size="18" aria-hidden="true" /><AlertTriangle v-else :size="18" aria-hidden="true" /><span>{{ operationResult }}</span><button type="button" aria-label="关闭提示" @click="operationResult = null"><X :size="15" /></button>
    </div>

    <ResourceState v-if="loading" state="loading" title="正在读取定时任务" description="正在获取下一次运行和最近执行结果。" />
    <ResourceState v-else-if="error" state="error" title="任务列表读取失败" description="筛选条件已保留，可以直接重试。" @retry="load()" />
    <ResourceState v-else-if="!jobs.length" state="empty" title="没有符合条件的任务" description="调整筛选或创建一个新的调度任务。" />

    <section v-else class="job-directory" aria-label="定时任务列表">
      <div class="job-heading job-grid" aria-hidden="true"><span>任务</span><span>类型</span><span>状态</span><span>下一次运行</span><span>最近结果</span><span>操作</span></div>
      <article v-for="job in jobs" :key="job.job_id" class="job-row job-grid">
        <div class="job-identity"><CalendarClock :size="18" /><div><strong>{{ job.name }}</strong><span>{{ job.group.name }} · <b class="mono">{{ job.group.group_id }}</b></span></div></div>
        <span data-label="类型">{{ job.type === 'daily' ? '每日' : '单次' }}</span>
        <span :class="['status-badge', `status-badge--${job.status}`]">{{ statusLabels[job.status] }}</span>
        <div data-label="下一次"><strong class="mono">{{ displayTime(job.next_run_at) }}</strong><small v-if="job.schedule.type === 'daily'">{{ job.schedule.local_time.slice(0, 5) }} · {{ job.schedule.timezone }}</small></div>
        <div data-label="最近结果"><span v-if="job.last_run_result" :class="`run-result--${job.last_run_result}`">{{ resultLabels[job.last_run_result] }}</span><small>{{ displayTime(job.last_run_at) }}</small></div>
        <div class="row-actions">
          <button v-if="auth.hasPermission('scheduled_jobs:write') && ['active','paused'].includes(job.status)" type="button" :title="job.status === 'active' ? '暂停任务' : '恢复任务'" :disabled="busyIds.has(job.job_id)" @click="toggleStatus(job)"><Pause v-if="job.status === 'active'" :size="15" /><Play v-else :size="15" /></button>
          <button :data-test="`test-send-${job.job_id}`" type="button" title="测试发送" @click="askConfirm('test', job)"><FlaskConical :size="15" /></button>
          <button :data-test="`edit-job-${job.job_id}`" type="button" title="查看或编辑" @click="openEdit(job)"><Pencil :size="15" /></button>
        </div>
      </article>
    </section>
    <button v-if="hasMore" class="load-more" type="button" :disabled="loadingMore" @click="load(false)"><RefreshCw :class="{ spin: loadingMore }" :size="16" />{{ loadingMore ? '正在读取' : '加载更多任务' }}</button>

    <div v-if="editorOpen" class="drawer-layer" role="presentation" @mousedown.self="editorOpen = false">
      <section class="job-editor" role="dialog" aria-modal="true" aria-labelledby="job-editor-title">
        <header><div><h2 id="job-editor-title">{{ editingJob ? '编辑任务' : '新建任务' }}</h2><p>{{ editingJob ? `版本 ${editingJob.version}` : '创建后按启用状态进入调度器' }}</p></div><button type="button" aria-label="关闭" @click="editorOpen = false"><X :size="17" /></button></header>
        <div class="editor-body">
          <label><span>任务名称</span><input v-model="form.name" data-test="job-name" maxlength="100" /></label>
          <label><span>目标群</span><select v-model="form.groupId"><option value="">请选择</option><option v-for="group in availableGroups" :key="group.group_id" :value="group.group_id">{{ group.name }} · {{ group.group_id }}</option></select></label>
          <label><span>发送消息</span><textarea v-model="form.message" rows="5" maxlength="2000" /></label>
          <fieldset><legend>调度类型</legend><label><input v-model="form.scheduleType" type="radio" value="daily" />每日</label><label><input v-model="form.scheduleType" type="radio" value="once" />单次</label></fieldset>
          <label v-if="form.scheduleType === 'daily'"><span>每天时间</span><input v-model="form.dailyTime" type="time" /></label>
          <label v-else><span>执行时间</span><input v-model="form.runAt" type="datetime-local" /></label>
          <label v-if="editingJob" class="status-field"><span>任务状态</span><select v-model="form.status"><option value="active">运行中</option><option value="paused">暂停</option></select></label>
          <label v-else class="check-field"><input v-model="form.enabled" type="checkbox" /><span>创建后立即启用</span></label>
          <section v-if="editingJob" class="history-section"><h3>执行记录</h3><p v-if="runsLoading">正在读取...</p><p v-else-if="!runs.length">暂无记录</p><article v-for="run in runs" :key="run.run_id"><span :class="`run-result--${run.result}`">{{ run.kind === 'test' ? '测试' : '正式' }} · {{ resultLabels[run.result] }}</span><time class="mono">{{ displayTime(run.started_at) }}</time><small>{{ run.duration_ms }} ms{{ run.error_message ? ` · ${run.error_message}` : '' }}</small></article></section>
        </div>
        <footer><button v-if="editingJob" class="archive-action" type="button" @click="askConfirm('archive', editingJob)"><Archive :size="15" />归档</button><span /><button type="button" @click="editorOpen = false">取消</button><button v-if="auth.hasPermission('scheduled_jobs:write')" data-test="save-job" class="save-action" type="button" :disabled="saving" @click="saveJob"><LoaderCircle v-if="saving" class="spin" :size="15" /><Send v-else :size="15" />保存任务</button></footer>
      </section>
    </div>

    <div v-if="confirmMode" class="dialog-layer" role="presentation" @mousedown.self="confirmMode = null">
      <section class="confirm-dialog" role="dialog" aria-modal="true"><header><component :is="confirmMode === 'test' ? FlaskConical : Archive" :size="19" /><div><h2>{{ confirmMode === 'test' ? '测试发送' : '归档任务' }}</h2><p>{{ pendingJob?.name }} · {{ pendingJob?.group.name }}</p></div></header><p>{{ confirmMode === 'test' ? '立即发送一次，但不会修改正式任务的上次运行和下次运行时间。' : '归档后任务停止调度，历史记录继续保留。' }}</p><footer><button type="button" :disabled="confirming" @click="confirmMode = null">取消</button><button :data-test="confirmMode === 'test' ? 'confirm-test-send' : 'confirm-archive-job'" :class="confirmMode === 'archive' ? 'danger-action' : 'save-action'" type="button" :disabled="confirming" @click="confirmAction">确认{{ confirmMode === 'test' ? '发送' : '归档' }}</button></footer></section>
    </div>
  </main>
</template>

<style scoped>
.jobs-page{display:grid;gap:16px}.page-header,.primary-action,.filter-bar,.operation-result,.row-actions,.load-more,.job-editor>header,.job-editor>footer,.confirm-dialog header,.confirm-dialog footer,.check-field,.history-section article{display:flex;align-items:center}.page-header{justify-content:space-between;gap:16px}.page-header h1{font-size:24px;line-height:34px}.page-header p{color:var(--color-text-secondary);font-size:13px}.primary-action{min-height:38px;gap:7px;padding:0 12px;color:white;font-weight:600;background:var(--color-brand-action);border:1px solid var(--color-brand-action);border-radius:var(--radius-control)}.filter-bar{display:grid;grid-template-columns:minmax(180px,1.2fr) repeat(3,minmax(120px,.7fr)) auto 38px;gap:8px}.filter-bar input,.filter-bar select{width:100%;height:38px;padding:0 9px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.filter-submit,.icon-button,.load-more{height:38px;justify-content:center;padding:0 11px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.filter-submit{color:var(--color-brand-action);font-weight:600;border-color:var(--color-brand-border)}.icon-button{width:38px;padding:0}.operation-result{min-height:42px;gap:8px;padding:8px 11px;font-size:12px;border-left:3px solid currentcolor}.operation-result span{min-width:0;flex:1}.operation-result button{display:grid;width:28px;height:28px;place-items:center;padding:0;background:transparent;border:0}.operation-result--success{color:var(--color-success);background:var(--color-success-surface)}.operation-result--warning{color:var(--color-warning);background:var(--color-warning-surface)}.operation-result--danger{color:var(--color-danger);background:var(--color-danger-surface)}.operation-result--unknown{color:var(--color-unknown);background:var(--color-unknown-surface)}.job-directory{min-width:0;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-panel)}.job-grid{display:grid;grid-template-columns:minmax(230px,1.3fr) 70px 82px minmax(150px,.9fr) minmax(145px,.8fr) 122px;gap:12px;align-items:center}.job-heading{min-height:38px;padding:0 14px;color:var(--color-text-secondary);font-size:11px;background:var(--color-surface-subtle);border-bottom:1px solid var(--color-border)}.job-row{min-height:76px;padding:10px 14px;font-size:12px;border-bottom:1px solid var(--color-border)}.job-row:last-child{border-bottom:0}.job-identity{display:grid;min-width:0;grid-template-columns:18px minmax(0,1fr);gap:9px;align-items:center;color:var(--color-brand-ink)}.job-identity div,.job-row>div[data-label]{display:grid;min-width:0}.job-identity strong{overflow:hidden;color:var(--color-text-primary);text-overflow:ellipsis;white-space:nowrap}.job-identity span,.job-row small{color:var(--color-text-secondary);font-size:10px}.job-identity b{font-weight:400}.status-badge{width:fit-content;padding:2px 6px;color:var(--color-unknown);background:var(--color-unknown-surface);border-radius:8px}.status-badge--active{color:var(--color-success);background:var(--color-success-surface)}.status-badge--paused{color:var(--color-warning);background:var(--color-warning-surface)}.run-result--success{color:var(--color-success)}.run-result--failed{color:var(--color-danger)}.run-result--unknown{color:var(--color-unknown)}.run-result--skipped{color:var(--color-text-secondary)}.row-actions{justify-content:flex-end;gap:5px}.row-actions button{display:grid;width:34px;height:34px;place-items:center;padding:0;color:var(--color-brand-action);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.load-more{justify-self:center;gap:7px;color:var(--color-text-secondary)}.drawer-layer,.dialog-layer{position:fixed;z-index:80;inset:0;background:rgb(34 37 36/36%)}.drawer-layer{display:flex;justify-content:flex-end}.job-editor{display:grid;width:min(560px,100%);height:100%;grid-template-rows:auto 1fr auto;background:var(--color-surface);box-shadow:-12px 0 36px rgb(34 37 36/16%)}.job-editor>header,.job-editor>footer{justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid var(--color-border)}.job-editor>header h2{font-size:17px}.job-editor>header p{color:var(--color-text-secondary);font-size:11px}.job-editor>header button{display:grid;width:34px;height:34px;place-items:center;padding:0;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.editor-body{display:grid;align-content:start;gap:13px;overflow:auto;padding:16px}.editor-body label{display:grid;gap:5px}.editor-body label>span,.editor-body legend{color:var(--color-text-secondary);font-size:11px;font-weight:600}.editor-body input,.editor-body select,.editor-body textarea{width:100%;padding:0 9px;background:var(--color-surface);border:1px solid var(--color-border-strong);border-radius:var(--radius-control)}.editor-body input,.editor-body select{height:38px}.editor-body textarea{padding-block:8px;resize:vertical}.editor-body fieldset{display:flex;min-height:42px;align-items:center;gap:18px;padding:5px 10px;border:1px solid var(--color-border);border-radius:var(--radius-control)}.editor-body fieldset label,.check-field{display:flex;align-items:center;gap:6px}.editor-body fieldset input,.check-field input{width:16px;height:16px}.history-section{display:grid;gap:7px;padding-top:12px;border-top:1px solid var(--color-border)}.history-section h3{font-size:13px}.history-section>p{color:var(--color-text-secondary);font-size:12px}.history-section article{display:grid;grid-template-columns:auto 1fr auto;gap:8px;padding:8px;background:var(--color-surface-raised);border:1px solid var(--color-border);border-radius:var(--radius-control);font-size:11px}.history-section article time{justify-self:end}.history-section article small{grid-column:1/-1;color:var(--color-text-secondary)}.job-editor>footer{border-top:1px solid var(--color-border);border-bottom:0}.job-editor>footer span{flex:1}.job-editor>footer button,.confirm-dialog footer button{min-height:36px;padding:0 10px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.job-editor>footer .archive-action{color:var(--color-danger);border-color:var(--color-danger)}.job-editor>footer .save-action,.confirm-dialog .save-action{color:white;background:var(--color-brand-action);border-color:var(--color-brand-action)}.dialog-layer{display:grid;place-items:center;padding:20px}.confirm-dialog{width:min(440px,100%);padding:18px;background:var(--color-surface);border-radius:var(--radius-overlay);box-shadow:0 16px 44px rgb(34 37 36/18%)}.confirm-dialog header{gap:10px;color:var(--color-brand-action)}.confirm-dialog header h2{color:var(--color-text-primary);font-size:16px}.confirm-dialog header p,.confirm-dialog>p{color:var(--color-text-secondary);font-size:12px}.confirm-dialog>p{margin-top:14px}.confirm-dialog footer{justify-content:flex-end;gap:8px;margin-top:18px}.confirm-dialog .danger-action{color:white;background:var(--color-danger);border-color:var(--color-danger)}.spin{animation:spin 700ms linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:900px){.job-grid{grid-template-columns:minmax(210px,1.2fr) 75px minmax(145px,.8fr) 122px}.job-heading span:nth-child(2),.job-row>span[data-label="类型"],.job-heading span:nth-child(5),.job-row>div[data-label="最近结果"]{display:none}}
@media(max-width:680px){.page-header{align-items:stretch;flex-direction:column}.primary-action{justify-content:center}.filter-bar{grid-template-columns:1fr 1fr}.icon-button{justify-self:end}.job-heading{display:none}.job-directory{background:transparent;border:0}.job-row,.job-grid{grid-template-columns:1fr auto}.job-row{gap:9px 12px;margin-bottom:8px;padding:12px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-panel)}.job-identity{grid-column:1/-1}.job-row>div[data-label],.job-row>span[data-label="类型"]{display:grid}.job-row>[data-label]::before{color:var(--color-text-secondary);content:attr(data-label);font-size:10px}.row-actions{align-self:end}.job-editor{width:100%}}
</style>
