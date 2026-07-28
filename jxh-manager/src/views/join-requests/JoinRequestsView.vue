<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FilterX,
  LoaderCircle,
  RefreshCw,
  Search,
  XCircle,
} from '@lucide/vue'

import { AdminApiError } from '@/api/client'
import { joinRequestsApi, type JoinRequestListQuery } from '@/api/join-requests'
import type {
  BulkJoinDecisionResult,
  JoinDecision,
  JoinDecisionAction,
  JoinRequest,
  JoinRequestPolicy,
  JoinRequestSummary,
} from '@/api/types'
import DecisionDialog from '@/components/join-requests/DecisionDialog.vue'
import JoinRequestDetail from '@/components/join-requests/JoinRequestDetail.vue'
import ResourceState from '@/components/feedback/ResourceState.vue'
import { subscribeToAdminEvents } from '@/composables/useAdminEvents'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const items = ref<JoinRequestSummary[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<unknown>(null)
const nextCursor = ref<string | null>(null)
const hasMore = ref(false)
const activeId = ref<string | null>(null)
const detail = ref<JoinRequest | null>(null)
const detailLoading = ref(false)
const decisions = ref<JoinDecision[]>([])
const policy = ref<JoinRequestPolicy | null>(null)
const policyBusy = ref(false)
const selectedIds = ref(new Set<string>())
const decisionBusy = ref(false)
const operationResult = ref<string | null>(null)
const operationTone = ref<'success' | 'danger' | 'unknown' | 'warning'>('success')

const dialog = reactive<{
  open: boolean
  action: JoinDecisionAction
  scope: 'single' | 'bulk'
}>({ open: false, action: 'approve', scope: 'single' })

const initialDecisionStatus = route.query.decision_status
const filters = reactive<{
  groupId: string
  decisionStatus: string
  observedStatus: string
  aiParseStatus: string
  source: string
  requestedFrom: string
  requestedTo: string
  overdue: boolean
  query: string
  sort: 'requested_at_desc' | 'requested_at_asc'
}>({
  groupId: typeof route.query.group_id === 'string' ? route.query.group_id : '',
  decisionStatus:
    typeof initialDecisionStatus === 'string' ? initialDecisionStatus : 'pending',
  observedStatus: '',
  aiParseStatus: '',
  source: '',
  requestedFrom: '',
  requestedTo: '',
  overdue: false,
  query: '',
  sort: 'requested_at_desc',
})

const decisionLabels = {
  pending: '待处理',
  processing: '处理中',
  approved: '已批准',
  rejected: '已拒绝',
  external_processed: '外部已处理',
  unknown: '结果未知',
}

const aiLabels = {
  pending: '等待解析',
  running: '解析中',
  succeeded: '已解析',
  failed: '解析失败',
  skipped: '未解析',
}

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const selectedItems = computed(() =>
  items.value.filter((item) => selectedIds.value.has(item.request_id)),
)
const selectionGroupId = computed(() => selectedItems.value[0]?.group.group_id ?? null)
const selectionGroupName = computed(() => selectedItems.value[0]?.group.name ?? '')
const dialogCount = computed(() => (dialog.scope === 'bulk' ? selectedItems.value.length : 1))
const dialogGroupName = computed(() =>
  dialog.scope === 'bulk' ? selectionGroupName.value : detail.value?.group.name ?? '',
)

function listQuery(cursor: string | null): JoinRequestListQuery {
  return {
    groupId: filters.groupId.trim(),
    decisionStatus: filters.decisionStatus
      ? [filters.decisionStatus as JoinRequestListQuery['decisionStatus'][number]]
      : [],
    observedStatus: filters.observedStatus as JoinRequestListQuery['observedStatus'],
    aiParseStatus: filters.aiParseStatus as JoinRequestListQuery['aiParseStatus'],
    subType: '',
    source: filters.source as JoinRequestListQuery['source'],
    decisionSource: '',
    requestedFrom: filters.requestedFrom,
    requestedTo: filters.requestedTo,
    overdue: filters.overdue ? true : null,
    query: filters.query.trim(),
    sort: filters.sort,
    cursor,
  }
}

async function load(reset = true): Promise<void> {
  if (reset) loading.value = true
  else loadingMore.value = true
  error.value = null
  try {
    const result = await joinRequestsApi.list(listQuery(reset ? null : nextCursor.value))
    items.value = reset ? result.items : [...items.value, ...result.items]
    nextCursor.value = result.next_cursor
    hasMore.value = result.has_more
    if (reset) selectedIds.value = new Set()
  } catch (reason) {
    error.value = reason
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function resetFilters(): void {
  Object.assign(filters, {
    groupId: '',
    decisionStatus: 'pending',
    observedStatus: '',
    aiParseStatus: '',
    source: '',
    requestedFrom: '',
    requestedTo: '',
    overdue: false,
    query: '',
    sort: 'requested_at_desc',
  })
  void load()
}

async function loadOptionalPolicy(groupId: string): Promise<JoinRequestPolicy | null> {
  try {
    return await joinRequestsApi.getPolicy(groupId)
  } catch (reason) {
    if (
      reason instanceof AdminApiError &&
      reason.status === 404 &&
      reason.code === 'not_found'
    ) {
      return null
    }
    throw reason
  }
}

async function openRequest(item: JoinRequestSummary): Promise<void> {
  activeId.value = item.request_id
  detailLoading.value = true
  detail.value = null
  decisions.value = []
  policy.value = null
  try {
    const [nextDetail, history, nextPolicy] = await Promise.all([
      joinRequestsApi.get(item.request_id),
      joinRequestsApi.listDecisions(item.request_id),
      loadOptionalPolicy(item.group.group_id),
    ])
    if (activeId.value !== item.request_id) return
    detail.value = nextDetail
    decisions.value = history.items
    policy.value = nextPolicy
  } catch (reason) {
    if (activeId.value === item.request_id) {
      operationTone.value = 'danger'
      operationResult.value = reason instanceof AdminApiError ? reason.message : '申请详情读取失败。'
    }
  } finally {
    if (activeId.value === item.request_id) detailLoading.value = false
  }
}

function setSelected(item: JoinRequestSummary, checked: boolean): void {
  const next = new Set(selectedIds.value)
  if (checked) next.add(item.request_id)
  else next.delete(item.request_id)
  selectedIds.value = next
}

function selectionDisabled(item: JoinRequestSummary): boolean {
  return Boolean(
    !selectedIds.value.has(item.request_id) &&
      (selectedIds.value.size >= 20 ||
        (selectionGroupId.value && selectionGroupId.value !== item.group.group_id)),
  )
}

function openDecision(action: JoinDecisionAction, scope: 'single' | 'bulk'): void {
  dialog.action = action
  dialog.scope = scope
  dialog.open = true
}

function replaceSummary(request: JoinRequestSummary): void {
  const index = items.value.findIndex((item) => item.request_id === request.request_id)
  if (index >= 0) items.value.splice(index, 1, request)
}

function showBulkResult(result: BulkJoinDecisionResult): void {
  operationTone.value = result.unknown_count
    ? 'unknown'
    : result.failed_count
      ? 'warning'
      : 'success'
  operationResult.value = `批量处理完成：确认 ${result.confirmed_count}，失败 ${result.failed_count}，未知 ${result.unknown_count}。`
  result.items.forEach((item) => replaceSummary(item.join_request))
}

async function confirmDecision(reason: string | undefined): Promise<void> {
  decisionBusy.value = true
  operationResult.value = null
  try {
    if (dialog.scope === 'single' && detail.value) {
      const result = await joinRequestsApi.decide(
        detail.value.request_id,
        { action: dialog.action, reason },
        detail.value.version,
      )
      detail.value = result.join_request
      decisions.value = [result.decision, ...decisions.value]
      replaceSummary(result.join_request)
      operationTone.value = result.decision.status === 'unknown' ? 'unknown' : 'success'
      operationResult.value =
        result.decision.status === 'unknown'
          ? '处理结果未知，请刷新申请状态后再决定是否重试。'
          : `已确认${dialog.action === 'approve' ? '批准' : '拒绝'}。`
    } else if (dialog.scope === 'bulk' && selectedItems.value.length && selectionGroupId.value) {
      const result = await joinRequestsApi.bulkDecide({
        group_id: selectionGroupId.value,
        action: dialog.action,
        reason,
        items: selectedItems.value.map((item) => ({
          request_id: item.request_id,
          version: item.version,
        })),
      })
      showBulkResult(result)
      selectedIds.value = new Set()
    }
    dialog.open = false
  } catch (reason) {
    dialog.open = false
    if (reason instanceof TypeError) {
      operationTone.value = 'unknown'
      operationResult.value = '处理结果未知。连接在请求过程中中断，请刷新状态，不要重复提交。'
    } else if (reason instanceof AdminApiError && reason.status === 409) {
      operationTone.value = 'warning'
      operationResult.value = '申请状态或版本已经变化，请刷新后重新确认。'
    } else {
      operationTone.value = 'danger'
      operationResult.value = reason instanceof AdminApiError ? reason.message : '处理请求失败。'
    }
  } finally {
    decisionBusy.value = false
  }
}

async function updatePolicy(enabled: boolean): Promise<void> {
  if (!policy.value) return
  policyBusy.value = true
  try {
    policy.value = await joinRequestsApi.updatePolicy(
      policy.value.group_id,
      { enabled },
      policy.value.version,
    )
    operationTone.value = 'success'
    operationResult.value = `自动批准策略已${enabled ? '启用' : '停用'}。`
  } catch (reason) {
    operationTone.value = reason instanceof AdminApiError && reason.status === 409 ? 'warning' : 'danger'
    operationResult.value =
      reason instanceof AdminApiError && reason.status === 409
        ? '自动批准策略已被其他管理员修改，请重新打开申请详情。'
        : reason instanceof AdminApiError
          ? reason.message
          : '策略更新失败。'
  } finally {
    policyBusy.value = false
  }
}

const unsubscribe = subscribeToAdminEvents((event) => {
  if (event.event === 'join_request.created' || event.event === 'join_request.updated') {
    void load()
  }
})

onMounted(() => load())
onBeforeUnmount(unsubscribe)
</script>

<template>
  <main class="join-requests-page">
    <header class="page-header">
      <div>
        <h1>入群审批</h1>
        <p>核对验证消息与 AI 提取字段，并将明确决策提交给 NapCat。</p>
      </div>
      <button class="refresh-button" type="button" :disabled="loading" @click="load()">
        <RefreshCw :size="16" :class="{ spin: loading }" aria-hidden="true" />刷新队列
      </button>
    </header>

    <form class="filter-bar" data-test="join-request-filters" @submit.prevent="load()">
      <label class="search-field">
        <span class="sr-only">搜索 QQ、学号或姓名</span>
        <Search :size="16" aria-hidden="true" />
        <input v-model="filters.query" name="query" placeholder="搜索 QQ、学号或姓名" />
      </label>
      <label class="group-filter">
        <span class="sr-only">群号</span>
        <input v-model="filters.groupId" name="group_id" placeholder="完整群号" />
      </label>
      <label>
        <span class="sr-only">决策状态</span>
        <select v-model="filters.decisionStatus" name="decision_status">
          <option value="">全部决策</option>
          <option v-for="(label, value) in decisionLabels" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <label>
        <span class="sr-only">观察状态</span>
        <select v-model="filters.observedStatus" name="observed_status">
          <option value="">全部观察状态</option>
          <option value="pending">尚未核对</option>
          <option value="checked">已经核对</option>
        </select>
      </label>
      <label>
        <span class="sr-only">AI 解析状态</span>
        <select v-model="filters.aiParseStatus" name="ai_parse_status">
          <option value="">全部 AI 状态</option>
          <option v-for="(label, value) in aiLabels" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <label class="source-filter">
        <span class="sr-only">采集来源</span>
        <select v-model="filters.source" name="source">
          <option value="">全部来源</option>
          <option value="event">实时事件</option>
          <option value="system">系统轮询</option>
        </select>
      </label>
      <label class="sort-filter">
        <span class="sr-only">申请排序</span>
        <select v-model="filters.sort" name="sort">
          <option value="requested_at_desc">最新申请优先</option>
          <option value="requested_at_asc">最早申请优先</option>
        </select>
      </label>
      <label class="date-field">
        <span>从</span><input v-model="filters.requestedFrom" type="date" name="requested_from" />
      </label>
      <label class="date-field">
        <span>至</span><input v-model="filters.requestedTo" type="date" name="requested_to" />
      </label>
      <label class="overdue-field">
        <input v-model="filters.overdue" type="checkbox" />只看逾期
      </label>
      <button class="filter-submit" type="submit">应用筛选</button>
      <button class="filter-reset" type="button" title="清除筛选" aria-label="清除筛选" @click="resetFilters">
        <FilterX :size="16" aria-hidden="true" />
      </button>
    </form>

    <div
      v-if="operationResult"
      :class="['operation-result', `operation-result--${operationTone}`]"
      :role="operationTone === 'success' ? 'status' : 'alert'"
    >
      <CheckCircle2 v-if="operationTone === 'success'" :size="18" aria-hidden="true" />
      <AlertTriangle v-else :size="18" aria-hidden="true" />
      <span>{{ operationResult }}</span>
      <button type="button" aria-label="关闭提示" @click="operationResult = null">×</button>
    </div>

    <div v-if="selectedItems.length" class="bulk-bar">
      <span>已选 {{ selectedItems.length }} 条 · {{ selectionGroupName }}</span>
      <small>批量处理仅限同一群，最多 20 条。</small>
      <button type="button" @click="selectedIds = new Set()">清除选择</button>
      <button data-test="bulk-reject" class="bulk-reject" type="button" @click="openDecision('reject', 'bulk')">
        <XCircle :size="16" aria-hidden="true" />批量拒绝
      </button>
      <button data-test="bulk-approve" class="bulk-approve" type="button" @click="openDecision('approve', 'bulk')">
        <CheckCircle2 :size="16" aria-hidden="true" />批量批准
      </button>
    </div>

    <section class="approval-workspace">
      <div class="request-queue">
        <ResourceState
          v-if="loading"
          state="loading"
          title="正在读取申请队列"
          description="筛选条件和已打开详情保持不变。"
        />
        <ResourceState
          v-else-if="error"
          state="error"
          title="申请队列读取失败"
          description="请恢复连接后重试。"
          @retry="load()"
        />
        <ResourceState
          v-else-if="!items.length"
          state="empty"
          title="没有符合条件的申请"
          description="调整筛选条件，或等待新的入群申请。"
        />

        <div v-else class="request-list" aria-label="入群申请列表">
          <article
            v-for="item in items"
            :key="item.request_id"
            :data-test="`request-row-${item.request_id}`"
            :class="['request-row', { 'request-row--active': activeId === item.request_id }]"
            tabindex="0"
            @click="openRequest(item)"
            @keydown.enter="openRequest(item)"
          >
            <label v-if="auth.hasPermission('join_requests:decide')" class="row-select" @click.stop>
              <input
                type="checkbox"
                :data-test="`select-${item.request_id}`"
                :checked="selectedIds.has(item.request_id)"
                :disabled="selectionDisabled(item) || item.decision_status !== 'pending'"
                :aria-label="`选择 ${item.applicant_qq}`"
                @change="setSelected(item, ($event.target as HTMLInputElement).checked)"
              />
            </label>
            <div class="request-main">
              <header>
                <strong>{{ item.applicant_nickname || item.applicant_qq }}</strong>
                <span class="mono">{{ item.applicant_qq }}</span>
                <span :class="['status-badge', `status-badge--${item.decision_status}`]">
                  {{ decisionLabels[item.decision_status] ?? item.decision_status }}
                </span>
              </header>
              <p>{{ item.verification_message || '未填写验证消息' }}</p>
              <footer>
                <span>{{ item.group.name }}</span>
                <span :class="['ai-label', `ai-label--${item.ai_parse.status}`]">{{ aiLabels[item.ai_parse.status] ?? item.ai_parse.status }}</span>
                <span v-if="item.overdue" class="overdue-label"><Clock3 :size="12" aria-hidden="true" />逾期</span>
                <time class="mono">{{ timeFormatter.format(new Date(item.requested_at)) }}</time>
              </footer>
            </div>
            <ChevronRight :size="17" aria-hidden="true" />
          </article>
        </div>

        <button v-if="hasMore" class="load-more" type="button" :disabled="loadingMore" @click="load(false)">
          <LoaderCircle v-if="loadingMore" class="spin" :size="16" aria-hidden="true" />
          {{ loadingMore ? '正在读取' : '加载更多申请' }}
        </button>
      </div>

      <JoinRequestDetail
        :request="detail"
        :decisions="decisions"
        :policy="policy"
        :loading="detailLoading"
        :policy-busy="policyBusy"
        :can-decide="auth.hasPermission('join_requests:decide')"
        :can-manage-policy="auth.hasPermission('join_policies:write')"
        @approve="openDecision('approve', 'single')"
        @reject="openDecision('reject', 'single')"
        @policy-change="updatePolicy"
      />
    </section>

    <DecisionDialog
      :open="dialog.open"
      :action="dialog.action"
      :count="dialogCount"
      :group-name="dialogGroupName"
      :busy="decisionBusy"
      @cancel="dialog.open = false"
      @confirm="confirmDecision"
    />
  </main>
</template>

<style scoped>
.join-requests-page {
  display: grid;
  gap: 14px;
}

.page-header,
.refresh-button,
.filter-bar,
.search-field,
.date-field,
.overdue-field,
.bulk-bar,
.operation-result,
.request-row header,
.request-row footer,
.load-more {
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

.refresh-button,
.filter-submit,
.filter-reset,
.load-more {
  height: 38px;
  justify-content: center;
  gap: 7px;
  padding: 0 11px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}

.refresh-button {
  color: var(--color-brand-action);
  font-weight: 600;
  border-color: var(--color-brand-border);
}

.filter-bar {
  display: grid;
  grid-template-columns: minmax(180px, 2fr) repeat(5, minmax(100px, 1fr)) 120px;
  gap: 7px;
}

.filter-bar input,
.filter-bar select,
.search-field {
  width: 100%;
  height: 38px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}

.filter-bar > label > input,
.filter-bar select {
  padding: 0 9px;
}

.search-field {
  gap: 7px;
  padding: 0 10px;
  color: var(--color-text-secondary);
}

.search-field input {
  min-width: 0;
  padding: 0;
  background: transparent;
  border: 0;
  outline: 0;
}

.date-field {
  gap: 5px;
  color: var(--color-text-secondary);
  font-size: 10px;
}

.date-field input {
  min-width: 0;
}

.overdue-field {
  gap: 5px;
  white-space: nowrap;
  font-size: 11px;
}

.overdue-field input {
  width: 15px;
  height: 15px;
}

.filter-submit {
  min-width: 78px;
  color: var(--color-brand-action);
  font-weight: 600;
  border-color: var(--color-brand-border);
  white-space: nowrap;
}

.filter-reset {
  width: 38px;
  padding: 0;
}

.operation-result {
  min-height: 42px;
  gap: 8px;
  padding: 8px 11px;
  font-size: 12px;
  border-left: 3px solid currentcolor;
}

.operation-result span {
  min-width: 0;
  flex: 1;
}

.operation-result button {
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: 0;
}

.operation-result--success { color: var(--color-success); background: var(--color-success-surface); }
.operation-result--danger { color: var(--color-danger); background: var(--color-danger-surface); }
.operation-result--warning { color: var(--color-warning); background: var(--color-warning-surface); }
.operation-result--unknown { color: var(--color-unknown); background: var(--color-unknown-surface); }

.bulk-bar {
  min-height: 48px;
  gap: 9px;
  padding: 7px 9px 7px 12px;
  color: var(--color-brand-ink);
  background: var(--color-brand-surface);
  border-left: 3px solid var(--color-brand-500);
}

.bulk-bar > span {
  font-weight: 600;
}

.bulk-bar small {
  flex: 1;
  color: var(--color-text-secondary);
}

.bulk-bar button {
  display: flex;
  height: 34px;
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  font-size: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}

.bulk-bar .bulk-reject { color: var(--color-danger); border-color: var(--color-danger); }
.bulk-bar .bulk-approve { color: white; background: var(--color-success); border-color: var(--color-success); }

.approval-workspace {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(380px, 0.85fr) minmax(520px, 1.15fr);
  gap: 12px;
  align-items: start;
}

.request-queue {
  min-width: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.request-list {
  display: grid;
}

.request-row {
  display: grid;
  min-width: 0;
  min-height: 92px;
  grid-template-columns: 18px minmax(0, 1fr) 17px;
  gap: 9px;
  align-items: center;
  padding: 11px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--color-border);
}

.request-row:hover {
  background: var(--color-surface-raised);
}

.request-row--active {
  background: var(--color-brand-surface);
  box-shadow: inset 3px 0 var(--color-brand-500);
}

.row-select input {
  width: 16px;
  height: 16px;
}

.request-main {
  display: grid;
  min-width: 0;
  gap: 6px;
}

.request-row header {
  min-width: 0;
  gap: 7px;
}

.request-row header strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.request-row header .mono {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.status-badge,
.ai-label,
.overdue-label {
  padding: 2px 6px;
  color: var(--color-unknown);
  font-size: 10px;
  background: var(--color-unknown-surface);
  border-radius: 8px;
}

.status-badge {
  margin-left: auto;
}

.status-badge--pending,
.status-badge--processing { color: var(--color-warning); background: var(--color-warning-surface); }
.status-badge--approved { color: var(--color-success); background: var(--color-success-surface); }
.status-badge--rejected { color: var(--color-danger); background: var(--color-danger-surface); }

.request-row p {
  display: -webkit-box;
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: 12px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.request-row footer {
  min-width: 0;
  gap: 7px;
  color: var(--color-text-secondary);
  font-size: 10px;
}

.request-row footer > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-label--succeeded { color: var(--color-success); background: var(--color-success-surface); }
.ai-label--failed { color: var(--color-danger); background: var(--color-danger-surface); }

.overdue-label {
  display: flex;
  align-items: center;
  gap: 3px;
  color: var(--color-warning);
  background: var(--color-warning-surface);
}

.request-row time {
  margin-left: auto;
  white-space: nowrap;
}

.load-more {
  width: calc(100% - 24px);
  margin: 12px;
}

.spin {
  animation: spin 700ms linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 1280px) {
  .filter-bar {
    grid-template-columns: minmax(180px, 2fr) repeat(4, minmax(105px, 1fr));
  }

  .approval-workspace {
    grid-template-columns: minmax(340px, 0.8fr) minmax(440px, 1.2fr);
  }
}

@media (max-width: 900px) {
  .filter-bar {
    grid-template-columns: repeat(4, minmax(110px, 1fr));
  }

  .search-field {
    grid-column: span 2;
  }

  .date-field,
  .overdue-field {
    display: none;
  }

  .approval-workspace {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 620px) {
  .page-header {
    align-items: stretch;
    flex-direction: column;
  }

  .refresh-button {
    justify-content: center;
  }

  .filter-bar {
    grid-template-columns: 1fr 1fr;
  }

  .search-field {
    grid-column: 1 / -1;
  }

  .group-filter,
  .source-filter,
  .date-field,
  .overdue-field {
    display: none;
  }

  .filter-reset {
    justify-self: end;
  }

  .bulk-bar {
    align-items: stretch;
    flex-wrap: wrap;
  }

  .bulk-bar small {
    flex-basis: 100%;
  }

  .bulk-bar > button:first-of-type {
    margin-left: auto;
  }

  .request-row {
    grid-template-columns: 18px minmax(0, 1fr);
  }

  .request-row > svg {
    display: none;
  }

  .request-row footer {
    flex-wrap: wrap;
  }

  .request-row time {
    margin-left: 0;
  }
}
</style>
