<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  CalendarClock, FilterX,
  FlaskConical, LoaderCircle, Pause, Pencil, Play, Plus, RefreshCw, Send, Trash2, X,
} from '@lucide/vue'

import { AdminApiError } from '@/api/client'
import { groupsApi } from '@/api/groups'
import { scheduledJobsApi, type ScheduledJobListQuery } from '@/api/scheduled-jobs'
import type {
  Group, RunResult, ScheduledJob, ScheduledJobCreateRequest, ScheduledJobRun,
  ScheduledJobStatus, ScheduledJobType,
} from '@/api/types'
import OperationNotice from '@/components/feedback/OperationNotice.vue'
import ResourceState from '@/components/feedback/ResourceState.vue'
import AppSelect, { type AppSelectOption } from '@/components/form/AppSelect.vue'
import AppOverlayTransition from '@/components/motion/AppOverlayTransition.vue'
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
const loadingDetailId = ref<string | null>(null)
const editorOpen = ref(false)
const editingJob = ref<ScheduledJob | null>(null)
const saving = ref(false)
const confirmMode = ref<'test' | 'delete' | null>(null)
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
  active: '运行中', paused: '已暂停', completed: '已完成',
}
const resultLabels: Record<RunResult, string> = {
  success: '成功', failed: '失败', unknown: '结果未知', skipped: '已跳过',
}
const typeOptions: readonly AppSelectOption[] = [
  { value: '', label: '全部类型' },
  { value: 'daily', label: '每日' },
  { value: 'once', label: '单次' },
]
const statusOptions: readonly AppSelectOption[] = [
  { value: '', label: '全部状态' },
  ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
]
const resultOptions: readonly AppSelectOption[] = [
  { value: '', label: '全部结果' },
  ...Object.entries(resultLabels).map(([value, label]) => ({ value, label })),
]
const jobStatusOptions: readonly AppSelectOption[] = [
  { value: 'active', label: '运行中' },
  { value: 'paused', label: '暂停' },
]

const availableGroups = computed(() => {
  const result = [...groups.value]
  const current = editingJob.value?.group
  if (current && !result.some((group) => group.group_id === current.group_id)) {
    result.unshift({ ...current } as Group)
  }
  return result
})
const groupOptions = computed<readonly AppSelectOption[]>(() => [
  { value: '', label: '请选择' },
  ...availableGroups.value.map((group) => ({
    value: group.group_id,
    label: `${group.name} · ${group.group_id}`,
  })),
])

function displayTime(value: string | null): string {
  return value ? value.replace('T', ' ').replace('Z', '').slice(0, 16) : '尚无'
}

function listQuery(cursor: string | null): ScheduledJobListQuery {
  return { groupId: filters.groupId.trim(), type: filters.type, status: filters.status, runResult: filters.runResult, cursor }
}

function setTypeFilter(value: string): void { filters.type = value as ScheduledJobType | '' }
function setStatusFilter(value: string): void { filters.status = value as ScheduledJobStatus | '' }
function setResultFilter(value: string): void { filters.runResult = value as RunResult | '' }
function setGroupId(value: string): void { form.groupId = value }
function setJobStatus(value: string): void { form.status = value as 'active' | 'paused' }

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
  loadingDetailId.value = job.job_id
  operationResult.value = null
  try {
    const detail = await scheduledJobsApi.get(job.job_id)
    editingJob.value = detail
    Object.assign(form, {
      name: detail.name, groupId: detail.group.group_id, message: detail.message,
      scheduleType: detail.schedule.type,
      dailyTime: detail.schedule.type === 'daily' ? detail.schedule.local_time.slice(0, 5) : '09:00',
      runAt: detail.schedule.type === 'once' ? localDateTime(detail.schedule.run_at) : '',
      status: detail.status === 'paused' ? 'paused' : 'active', enabled: detail.status === 'active',
    })
    editorOpen.value = true
    runsLoading.value = true
    loadingDetailId.value = null

    try {
      const page = await scheduledJobsApi.listRuns(detail.job_id, { kind: '', result: '', from: '', to: '', cursor: null })
      runs.value = page.items
    } catch {
      runs.value = []
    }
  } catch (reason) {
    operationTone.value = 'danger'
    operationResult.value = reason instanceof AdminApiError ? reason.message : '任务详情读取失败，未打开编辑器。'
  } finally {
    loadingDetailId.value = null
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

function askConfirm(mode: 'test' | 'delete', job: ScheduledJob): void {
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
      await scheduledJobsApi.delete(job.job_id, job.version)
      jobs.value = jobs.value.filter((item) => item.job_id !== job.job_id)
      if (editingJob.value?.job_id === job.job_id) editorOpen.value = false
      operationTone.value = 'success'
      operationResult.value = `${job.name} 已删除。`
    }
  } catch (reason) {
    if (mode === 'test' && reason instanceof TypeError) {
      operationTone.value = 'unknown'
      operationResult.value = '测试发送结果未知。连接已中断，请不要重复提交，先刷新执行记录。'
    } else {
      operationTone.value = reason instanceof AdminApiError && reason.status === 409 ? 'warning' : 'danger'
      operationResult.value = reason instanceof AdminApiError ? reason.message : `${mode === 'test' ? '测试发送' : '删除'}失败。`
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
      <div><h1>定时任务</h1></div>
      <button v-if="auth.hasPermission('scheduled_jobs:write')" class="primary-action" type="button" @click="openNew"><Plus :size="17" aria-hidden="true" />新建任务</button>
    </header>

    <form class="filter-bar" @submit.prevent="load()">
      <label><span class="sr-only">群号</span><input v-model="filters.groupId" placeholder="完整群号" /></label>
      <label><span class="sr-only">任务类型</span><AppSelect :model-value="filters.type" :options="typeOptions" accessible-name="任务类型" data-test="jobs-type-filter" @update:model-value="setTypeFilter" /></label>
      <label><span class="sr-only">任务状态</span><AppSelect :model-value="filters.status" :options="statusOptions" accessible-name="任务状态" data-test="jobs-status-filter" @update:model-value="setStatusFilter" /></label>
      <label><span class="sr-only">最近结果</span><AppSelect :model-value="filters.runResult" :options="resultOptions" accessible-name="最近结果" data-test="jobs-result-filter" @update:model-value="setResultFilter" /></label>
      <button class="filter-submit" type="submit">应用筛选</button>
      <button class="icon-button" type="button" title="清除筛选" aria-label="清除筛选" @click="resetFilters"><FilterX :size="16" aria-hidden="true" /></button>
    </form>

    <OperationNotice :message="operationResult ?? ''" :tone="operationTone" :revision="operationResult" @close="operationResult = null" />

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
          <button :data-test="`edit-job-${job.job_id}`" type="button" title="查看或编辑" :disabled="loadingDetailId === job.job_id" @click="openEdit(job)"><LoaderCircle v-if="loadingDetailId === job.job_id" class="spin" :size="15" /><Pencil v-else :size="15" /></button>
        </div>
      </article>
    </section>
    <button v-if="hasMore" class="load-more" type="button" :disabled="loadingMore" @click="load(false)"><RefreshCw :class="{ spin: loadingMore }" :size="16" />{{ loadingMore ? '正在读取' : '加载更多任务' }}</button>

    <AppOverlayTransition :show="editorOpen" variant="drawer">
      <div class="drawer-layer" role="presentation" @mousedown.self="editorOpen = false">
        <section class="job-editor" role="dialog" aria-modal="true" aria-labelledby="job-editor-title">
        <header><div><h2 id="job-editor-title">{{ editingJob ? '编辑任务' : '新建任务' }}</h2><p>{{ editingJob ? `版本 ${editingJob.version}` : '填写任务信息' }}</p></div><button type="button" aria-label="关闭" @click="editorOpen = false"><X :size="17" /></button></header>
        <div class="editor-body">
          <label><span>任务名称</span><input v-model="form.name" data-test="job-name" maxlength="100" /></label>
          <label><span>目标群</span><AppSelect :model-value="form.groupId" :options="groupOptions" accessible-name="目标群" data-test="job-group" @update:model-value="setGroupId" /></label>
          <label><span>发送消息</span><textarea v-model="form.message" rows="5" maxlength="2000" /></label>
          <fieldset><legend>调度类型</legend><label><input v-model="form.scheduleType" type="radio" value="daily" />每日</label><label><input v-model="form.scheduleType" type="radio" value="once" />单次</label></fieldset>
          <label v-if="form.scheduleType === 'daily'"><span>每天时间</span><input v-model="form.dailyTime" type="time" /></label>
          <label v-else><span>执行时间</span><input v-model="form.runAt" type="datetime-local" /></label>
          <label v-if="editingJob" class="status-field"><span>任务状态</span><AppSelect :model-value="form.status" :options="jobStatusOptions" accessible-name="任务状态" data-test="job-status" @update:model-value="setJobStatus" /></label>
          <label v-else class="check-field"><input v-model="form.enabled" type="checkbox" /><span>创建后立即启用</span></label>
          <section v-if="editingJob" class="history-section"><h3>执行记录</h3><p v-if="runsLoading">正在读取...</p><p v-else-if="!runs.length">暂无记录</p><article v-for="run in runs" :key="run.run_id"><span :class="`run-result--${run.result}`">{{ run.kind === 'test' ? '测试' : '正式' }} · {{ resultLabels[run.result] }}</span><time class="mono">{{ displayTime(run.started_at) }}</time><small>{{ run.duration_ms }} ms{{ run.error_message ? ` · ${run.error_message}` : '' }}</small></article></section>
        </div>
        <footer><button v-if="editingJob && auth.hasPermission('scheduled_jobs:write')" data-test="delete-job" class="delete-action" type="button" @click="askConfirm('delete', editingJob)"><Trash2 :size="15" />删除</button><span /><button type="button" @click="editorOpen = false">取消</button><button v-if="auth.hasPermission('scheduled_jobs:write')" data-test="save-job" class="save-action" type="button" :disabled="saving" @click="saveJob"><LoaderCircle v-if="saving" class="spin" :size="15" /><Send v-else :size="15" />保存任务</button></footer>
        </section>
      </div>
    </AppOverlayTransition>

    <AppOverlayTransition :show="Boolean(confirmMode)" variant="dialog">
      <div class="dialog-layer" role="presentation" @mousedown.self="confirmMode = null">
        <section class="confirm-dialog" role="dialog" aria-modal="true"><header><component :is="confirmMode === 'test' ? FlaskConical : Trash2" :size="19" /><div><h2>{{ confirmMode === 'test' ? '测试发送' : '删除任务' }}</h2><p>{{ pendingJob?.name }} · {{ pendingJob?.group.name }}</p></div></header><p>{{ confirmMode === 'test' ? '立即发送一次，但不会修改正式任务的上次运行和下次运行时间。' : '删除后任务及其执行记录会被永久移除，无法恢复。' }}</p><footer><button type="button" :disabled="confirming" @click="confirmMode = null">取消</button><button :data-test="confirmMode === 'test' ? 'confirm-test-send' : 'confirm-delete-job'" :class="confirmMode === 'delete' ? 'danger-action' : 'save-action'" type="button" :disabled="confirming" @click="confirmAction">确认{{ confirmMode === 'test' ? '发送' : '删除' }}</button></footer></section>
      </div>
    </AppOverlayTransition>
  </main>
</template>

<style scoped>
.job-editor>footer .delete-action{color:var(--color-danger);border-color:var(--color-danger)}
.jobs-page{display:grid;gap:16px}.page-header,.primary-action,.filter-bar,.operation-result,.row-actions,.load-more,.job-editor>header,.job-editor>footer,.confirm-dialog header,.confirm-dialog footer,.check-field,.history-section article{display:flex;align-items:center}.page-header{justify-content:space-between;gap:16px}.page-header h1{font-size:24px;line-height:34px}.page-header p{color:var(--color-text-secondary);font-size:13px}.primary-action{min-height:38px;gap:7px;padding:0 12px;color:white;font-weight:600;background:var(--color-brand-action);border:1px solid var(--color-brand-action);border-radius:var(--radius-control)}.filter-bar{display:grid;grid-template-columns:minmax(180px,1.2fr) repeat(3,minmax(120px,.7fr)) auto 38px;gap:8px}.filter-bar input,.filter-bar select{width:100%;height:38px;padding:0 9px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.filter-submit,.icon-button,.load-more{height:38px;justify-content:center;padding:0 11px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.filter-submit{color:var(--color-brand-action);font-weight:600;border-color:var(--color-brand-border)}.icon-button{width:38px;padding:0}.operation-result{min-height:42px;gap:8px;padding:8px 11px;font-size:12px;border-left:3px solid currentcolor}.operation-result span{min-width:0;flex:1}.operation-result button{display:grid;width:28px;height:28px;place-items:center;padding:0;background:transparent;border:0}.operation-result--success{color:var(--color-success);background:var(--color-success-surface)}.operation-result--warning{color:var(--color-warning);background:var(--color-warning-surface)}.operation-result--danger{color:var(--color-danger);background:var(--color-danger-surface)}.operation-result--unknown{color:var(--color-unknown);background:var(--color-unknown-surface)}.job-directory{min-width:0;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-panel)}.job-grid{display:grid;grid-template-columns:minmax(230px,1.3fr) 70px 82px minmax(150px,.9fr) minmax(145px,.8fr) 122px;gap:12px;align-items:center}.job-heading{min-height:38px;padding:0 14px;color:var(--color-text-secondary);font-size:11px;background:var(--color-surface-subtle);border-bottom:1px solid var(--color-border)}.job-row{min-height:76px;padding:10px 14px;font-size:12px;border-bottom:1px solid var(--color-border)}.job-row:last-child{border-bottom:0}.job-identity{display:grid;min-width:0;grid-template-columns:18px minmax(0,1fr);gap:9px;align-items:center;color:var(--color-brand-ink)}.job-identity div,.job-row>div[data-label]{display:grid;min-width:0}.job-identity strong{overflow:hidden;color:var(--color-text-primary);text-overflow:ellipsis;white-space:nowrap}.job-identity span,.job-row small{color:var(--color-text-secondary);font-size:10px}.job-identity b{font-weight:400}.status-badge{width:fit-content;padding:2px 6px;color:var(--color-unknown);background:var(--color-unknown-surface);border-radius:8px}.status-badge--active{color:var(--color-success);background:var(--color-success-surface)}.status-badge--paused{color:var(--color-warning);background:var(--color-warning-surface)}.run-result--success{color:var(--color-success)}.run-result--failed{color:var(--color-danger)}.run-result--unknown{color:var(--color-unknown)}.run-result--skipped{color:var(--color-text-secondary)}.row-actions{justify-content:flex-end;gap:5px}.row-actions button{display:grid;width:34px;height:34px;place-items:center;padding:0;color:var(--color-brand-action);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.load-more{justify-self:center;gap:7px;color:var(--color-text-secondary)}.drawer-layer,.dialog-layer{position:fixed;z-index:80;inset:0;background:rgb(34 37 36/36%)}.drawer-layer{display:flex;justify-content:flex-end;overflow:hidden}.job-editor{display:grid;width:min(560px,100%);height:100%;max-height:100dvh;min-height:0;grid-template-rows:max-content minmax(0,1fr) max-content;overflow:hidden;background:var(--color-surface);box-shadow:-12px 0 36px rgb(34 37 36/16%)}.job-editor>header,.job-editor>footer{justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid var(--color-border)}.job-editor>header h2{font-size:17px}.job-editor>header p{color:var(--color-text-secondary);font-size:11px}.job-editor>header button{display:grid;width:34px;height:34px;place-items:center;padding:0;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.editor-body{display:grid;min-height:0;align-content:start;gap:13px;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;padding:16px}.editor-body label{display:grid;gap:5px}.editor-body label>span,.editor-body legend{color:var(--color-text-secondary);font-size:11px;font-weight:600}.editor-body input,.editor-body select,.editor-body textarea{width:100%;padding:0 9px;background:var(--color-surface);border:1px solid var(--color-border-strong);border-radius:var(--radius-control)}.editor-body input,.editor-body select{height:38px}.editor-body textarea{padding-block:8px;resize:vertical}.editor-body fieldset{display:flex;min-height:42px;align-items:center;gap:18px;padding:5px 10px;border:1px solid var(--color-border);border-radius:var(--radius-control)}.editor-body fieldset label,.check-field{display:flex;align-items:center;gap:6px}.editor-body fieldset input,.check-field input{width:16px;height:16px}.history-section{display:grid;gap:7px;padding-top:12px;border-top:1px solid var(--color-border)}.history-section h3{font-size:13px}.history-section>p{color:var(--color-text-secondary);font-size:12px}.history-section article{display:grid;grid-template-columns:auto 1fr auto;gap:8px;padding:8px;background:var(--color-surface-raised);border:1px solid var(--color-border);border-radius:var(--radius-control);font-size:11px}.history-section article time{justify-self:end}.history-section article small{grid-column:1/-1;color:var(--color-text-secondary)}.job-editor>footer{border-top:1px solid var(--color-border);border-bottom:0}.job-editor>footer span{flex:1}.job-editor>footer button,.confirm-dialog footer button{min-height:36px;padding:0 10px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-control)}.job-editor>footer button{flex:0 0 auto;white-space:nowrap}.job-editor>footer .save-action,.confirm-dialog .save-action{color:white;background:var(--color-brand-action);border-color:var(--color-brand-action)}.dialog-layer{display:grid;place-items:center;padding:20px}.confirm-dialog{width:min(440px,100%);padding:18px;background:var(--color-surface);border-radius:var(--radius-overlay);box-shadow:0 16px 44px rgb(34 37 36/18%)}.confirm-dialog header{gap:10px;color:var(--color-brand-action)}.confirm-dialog header h2{color:var(--color-text-primary);font-size:16px}.confirm-dialog header p,.confirm-dialog>p{color:var(--color-text-secondary);font-size:12px}.confirm-dialog>p{margin-top:14px}.confirm-dialog footer{justify-content:flex-end;gap:8px;margin-top:18px}.confirm-dialog .danger-action{color:white;background:var(--color-danger);border-color:var(--color-danger)}.spin{animation:spin 700ms linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:900px){.job-grid{grid-template-columns:minmax(210px,1.2fr) 75px minmax(145px,.8fr) 122px}.job-heading span:nth-child(2),.job-row>span[data-label="类型"],.job-heading span:nth-child(5),.job-row>div[data-label="最近结果"]{display:none}}
@media(max-width:680px){.page-header{align-items:stretch;flex-direction:column}.primary-action{justify-content:center}.filter-bar{grid-template-columns:1fr 1fr}.icon-button{justify-self:end}.job-heading{display:none}.job-directory{background:transparent;border:0}.job-row,.job-grid{grid-template-columns:1fr auto}.job-row{gap:9px 12px;margin-bottom:8px;padding:12px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-panel)}.job-identity{grid-column:1/-1}.job-row>div[data-label],.job-row>span[data-label="类型"]{display:grid}.job-row>[data-label]::before{color:var(--color-text-secondary);content:attr(data-label);font-size:10px}.row-actions{align-self:end}.job-editor{width:100%}}
</style>
