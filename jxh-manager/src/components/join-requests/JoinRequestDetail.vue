<script setup lang="ts">
import { computed } from 'vue'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  History,
  ShieldCheck,
  UserRound,
  XCircle,
} from '@lucide/vue'

import type { JoinDecision, JoinRequest, JoinRequestPolicy } from '@/api/types'
import ResourceState from '@/components/feedback/ResourceState.vue'

const props = defineProps<{
  request: JoinRequest | null
  decisions: JoinDecision[]
  policy: JoinRequestPolicy | null
  loading: boolean
  policyBusy?: boolean
  canDecide: boolean
  canManagePolicy: boolean
}>()

const emit = defineEmits<{
  approve: []
  reject: []
  policyChange: [enabled: boolean]
}>()

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
  running: '正在解析',
  succeeded: '解析完成',
  failed: '解析失败',
  skipped: '未解析',
}

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const canAct = computed(
  () => props.canDecide && props.request?.decision_status === 'pending',
)
</script>

<template>
  <aside class="request-detail" aria-label="申请详情">
    <ResourceState
      v-if="loading"
      state="loading"
      title="正在读取申请详情"
      description="同时读取 AI 解析结果与决策时间线。"
    />
    <div v-else-if="!request" class="detail-placeholder">
      <UserRound :size="24" aria-hidden="true" />
      <strong>选择一条申请查看详情</strong>
      <span>验证消息、AI 提取字段和处理记录会显示在这里。</span>
    </div>

    <template v-else>
      <header class="detail-header">
        <div>
          <span class="eyebrow">{{ request.group.name }}</span>
          <h2>{{ request.applicant_nickname || '未提供昵称' }}</h2>
          <span class="mono">QQ {{ request.applicant_qq }}</span>
        </div>
        <span :class="['status-badge', `status-badge--${request.decision_status}`]">
          {{ decisionLabels[request.decision_status] ?? request.decision_status }}
        </span>
      </header>

      <section class="detail-section verification-section">
        <header>
          <h3>申请验证消息</h3>
          <span class="mono">{{ timeFormatter.format(new Date(request.requested_at)) }}</span>
        </header>
        <blockquote>{{ request.verification_message || '申请人未填写验证消息。' }}</blockquote>
        <p v-if="request.comment">NapCat 备注：{{ request.comment }}</p>
      </section>

      <section class="detail-section ai-section">
        <header>
          <div class="section-title"><Bot :size="17" aria-hidden="true" /><h3>AI 提取信息</h3></div>
          <span :class="['ai-status', `ai-status--${request.ai_parse.status}`]">
            {{ aiLabels[request.ai_parse.status] ?? request.ai_parse.status }}
          </span>
        </header>
        <div v-if="request.ai_parse.fields" class="ai-fields">
          <div><span>学号</span><strong class="mono">{{ request.ai_parse.fields.student_id || '未提取' }}</strong></div>
          <div><span>姓名</span><strong>{{ request.ai_parse.fields.name || '未提取' }}</strong></div>
          <div><span>专业</span><strong>{{ request.ai_parse.fields.major || '未提取' }}</strong></div>
        </div>
        <div
          v-if="request.ai_parse.fields"
          :class="['validation-state', request.ai_parse.fields.valid ? 'validation-state--valid' : 'validation-state--invalid']"
        >
          <CheckCircle2 v-if="request.ai_parse.fields.valid" :size="16" aria-hidden="true" />
          <AlertTriangle v-else :size="16" aria-hidden="true" />
          <span>{{ request.ai_parse.fields.valid ? '字段完整且格式有效' : request.ai_parse.fields.validation_errors.join('；') }}</span>
        </div>
        <p v-else class="ai-empty">当前没有可展示的结构化字段。</p>
      </section>

      <section v-if="policy" class="detail-section policy-section">
        <header>
          <div class="section-title"><ShieldCheck :size="17" aria-hidden="true" /><h3>自动批准策略</h3></div>
          <label class="policy-switch">
            <input
              type="checkbox"
              :checked="policy.enabled"
              :disabled="!canManagePolicy || policyBusy"
              :aria-label="`自动批准：${policy.enabled ? '已启用' : '已停用'}`"
              @change="emit('policyChange', ($event.target as HTMLInputElement).checked)"
            />
            <span aria-hidden="true" />
            <b>{{ policy.enabled ? '已启用' : '已停用' }}</b>
          </label>
        </header>
        <p>仅当学号、姓名、专业均完整且格式有效时自动批准。系统绝不自动拒绝申请。</p>
      </section>

      <section class="detail-section timeline-section">
        <header>
          <div class="section-title"><History :size="17" aria-hidden="true" /><h3>决策时间线</h3></div>
          <span>{{ decisions.length }} 条记录</span>
        </header>
        <div v-if="decisions.length" class="timeline">
          <article v-for="decision in decisions" :key="decision.decision_id">
            <CheckCircle2 v-if="decision.status === 'confirmed'" :size="16" aria-hidden="true" />
            <XCircle v-else-if="decision.status === 'failed'" :size="16" aria-hidden="true" />
            <Clock3 v-else :size="16" aria-hidden="true" />
            <div>
              <strong>{{ decision.action === 'approve' ? '批准' : '拒绝' }} · {{ decision.status }}</strong>
              <span>{{ decision.actor?.display_name || '系统' }} · {{ decision.source }}</span>
              <p v-if="decision.reason">{{ decision.reason }}</p>
            </div>
            <time class="mono">{{ timeFormatter.format(new Date(decision.started_at)) }}</time>
          </article>
        </div>
        <p v-else class="timeline-empty">尚无决策记录。</p>
      </section>

      <footer v-if="canDecide" class="decision-actions">
        <span v-if="!canAct">当前状态不能再次处理。</span>
        <button data-test="reject-request" class="reject-button" type="button" :disabled="!canAct" @click="emit('reject')">
          <XCircle :size="17" aria-hidden="true" />拒绝申请
        </button>
        <button data-test="approve-request" class="approve-button" type="button" :disabled="!canAct" @click="emit('approve')">
          <CheckCircle2 :size="17" aria-hidden="true" />批准入群
        </button>
      </footer>
    </template>
  </aside>
</template>

<style scoped>
.request-detail {
  min-width: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.detail-placeholder {
  display: grid;
  min-height: 420px;
  place-items: center;
  align-content: center;
  gap: 7px;
  padding: 32px;
  color: var(--color-text-secondary);
  text-align: center;
}

.detail-placeholder strong {
  color: var(--color-text-primary);
}

.detail-placeholder span {
  max-width: 340px;
  font-size: 12px;
}

.detail-header,
.detail-section,
.decision-actions {
  padding: 16px 18px;
}

.detail-header,
.detail-section > header,
.policy-switch,
.decision-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.eyebrow,
.detail-header .mono,
.detail-section header > span,
.timeline-empty,
.ai-empty {
  color: var(--color-text-secondary);
  font-size: 11px;
}

.detail-header h2 {
  font-size: 18px;
  line-height: 25px;
}

.status-badge,
.ai-status {
  padding: 3px 7px;
  color: var(--color-unknown);
  font-size: 10px;
  background: var(--color-unknown-surface);
  border-radius: 8px;
}

.status-badge--pending,
.status-badge--processing {
  color: var(--color-warning);
  background: var(--color-warning-surface);
}

.status-badge--approved {
  color: var(--color-success);
  background: var(--color-success-surface);
}

.status-badge--rejected {
  color: var(--color-danger);
  background: var(--color-danger-surface);
}

.detail-section {
  border-top: 1px solid var(--color-border);
}

.detail-section h3 {
  font-size: 14px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--color-brand-ink);
}

blockquote {
  margin: 12px 0 0;
  padding: 11px 12px;
  font-size: 13px;
  line-height: 21px;
  white-space: pre-wrap;
  background: var(--color-surface-subtle);
  border-left: 3px solid var(--color-brand-border);
}

.verification-section > p,
.policy-section > p {
  margin-top: 8px;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.ai-status--succeeded {
  color: var(--color-success);
  background: var(--color-success-surface);
}

.ai-status--failed {
  color: var(--color-danger);
  background: var(--color-danger-surface);
}

.ai-fields {
  display: grid;
  grid-template-columns: 1fr 0.8fr 1.4fr;
  gap: 1px;
  margin-top: 12px;
  overflow: hidden;
  background: var(--color-border);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}

.ai-fields div {
  display: grid;
  min-width: 0;
  padding: 9px 10px;
  background: var(--color-surface);
}

.ai-fields span {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.ai-fields strong {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.validation-state {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 11px;
}

.validation-state--valid { color: var(--color-success); }
.validation-state--invalid { color: var(--color-danger); }

.policy-switch {
  justify-content: flex-end;
  cursor: pointer;
}

.policy-switch input {
  position: absolute;
  opacity: 0;
}

.policy-switch > span {
  position: relative;
  width: 34px;
  height: 19px;
  background: var(--color-border-strong);
  border-radius: 10px;
}

.policy-switch > span::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 13px;
  height: 13px;
  content: '';
  background: white;
  border-radius: 50%;
}

.policy-switch input:checked + span {
  background: var(--color-brand-action);
}

.policy-switch input:checked + span::after {
  transform: translateX(15px);
}

.policy-switch input:focus-visible + span {
  box-shadow: var(--focus-ring);
}

.policy-switch b {
  font-size: 11px;
}

.timeline {
  display: grid;
  margin-top: 10px;
}

.timeline article {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  gap: 8px;
  padding: 9px 0;
  color: var(--color-unknown);
  border-bottom: 1px solid var(--color-border);
}

.timeline article:last-child {
  border-bottom: 0;
}

.timeline article > div {
  display: grid;
}

.timeline strong {
  color: var(--color-text-primary);
  font-size: 12px;
}

.timeline span,
.timeline p,
.timeline time {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.decision-actions {
  justify-content: flex-end;
  min-height: 64px;
  border-top: 1px solid var(--color-border);
}

.decision-actions > span {
  margin-right: auto;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.decision-actions button {
  display: flex;
  height: 38px;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  font-weight: 600;
  border-radius: var(--radius-control);
}

.reject-button {
  color: var(--color-danger);
  background: var(--color-surface);
  border: 1px solid var(--color-danger);
}

.approve-button {
  color: white;
  background: var(--color-success);
  border: 1px solid var(--color-success);
}

@media (max-width: 620px) {
  .detail-header,
  .detail-section,
  .decision-actions {
    padding: 14px;
  }

  .ai-fields {
    grid-template-columns: 1fr;
  }

  .decision-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .decision-actions > span {
    margin-right: 0;
  }

  .decision-actions button {
    justify-content: center;
  }
}
</style>
