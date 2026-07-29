<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CheckCircle2, LoaderCircle, X, XCircle } from '@lucide/vue'

import AppOverlayTransition from '@/components/motion/AppOverlayTransition.vue'

import type { JoinDecisionAction } from '@/api/types'

const props = defineProps<{
  open: boolean
  action: JoinDecisionAction
  count: number
  groupName: string
  busy?: boolean
}>()

const emit = defineEmits<{ cancel: []; confirm: [reason: string | undefined] }>()
const reason = ref('')
const normalizedReason = computed(() => reason.value.trim())
const normalizedReasonLength = computed(() => [...normalizedReason.value].length)
const reasonError = computed(() => {
  if (props.action === 'reject' && !normalizedReason.value) return '拒绝消息不能为空'
  if (normalizedReasonLength.value > 500) return '处理原因不能超过 500 个字符'
  return null
})
const canConfirm = computed(() => !props.busy && !reasonError.value)

watch(
  () => props.open,
  (open) => {
    if (open) reason.value = ''
  },
)

function confirm(): void {
  if (!canConfirm.value) return
  emit('confirm', normalizedReason.value || undefined)
}
</script>

<template>
  <AppOverlayTransition :show="open" variant="dialog">
    <div class="dialog-layer" role="presentation" @mousedown.self="emit('cancel')">
      <section class="decision-dialog" role="dialog" aria-modal="true" aria-labelledby="decision-title">
      <header>
        <div :class="['dialog-icon', `dialog-icon--${action}`]">
          <CheckCircle2 v-if="action === 'approve'" :size="20" aria-hidden="true" />
          <XCircle v-else :size="20" aria-hidden="true" />
        </div>
        <div>
          <h2 id="decision-title">{{ action === 'approve' ? '批准入群申请' : '拒绝入群申请' }}</h2>
          <p>{{ groupName }} · {{ count }} 条申请</p>
        </div>
        <button class="dialog-close" type="button" aria-label="关闭" :disabled="busy" @click="emit('cancel')">
          <X :size="18" aria-hidden="true" />
        </button>
      </header>

      <div class="decision-notice">
        提交后将调用 NapCat。连接中断时结果可能未知，请先刷新申请状态，不要直接重复提交。
      </div>

      <label class="reason-field">
        <span>
          {{ action === 'reject' ? '拒绝消息' : '处理原因' }}
          <small>{{ action === 'reject' ? '必填' : '选填' }}</small>
        </span>
        <textarea
          v-model="reason"
          data-test="decision-reason"
          rows="3"
          :placeholder="action === 'reject' ? '填写发送给申请人的拒绝原因' : '用于审计记录，不会发送给申请人'"
          :disabled="busy"
          :required="action === 'reject'"
          :aria-invalid="Boolean(reasonError)"
          aria-describedby="decision-reason-hint"
        />
        <span
          id="decision-reason-hint"
          class="reason-hint reason-guidance"
        >
          <span>{{ action === 'reject' ? '将通过 NapCat 发送给申请人' : '仅写入决策审计记录' }}</span>
          <span class="mono">{{ normalizedReasonLength }}/500</span>
        </span>
        <span
          class="reason-hint reason-hint--error"
          :class="{ 'reason-hint--visible': reasonError }"
          :aria-hidden="!reasonError"
          role="alert"
        >
          {{ reasonError || '&nbsp;' }}
        </span>
      </label>

      <footer>
        <button class="cancel-button" type="button" :disabled="busy" @click="emit('cancel')">取消</button>
        <button
          data-test="confirm-decision"
          :class="['confirm-button', `confirm-button--${action}`]"
          type="button"
          :disabled="!canConfirm"
          @click="confirm"
        >
          <LoaderCircle v-if="busy" class="spin" :size="16" aria-hidden="true" />
          {{ busy ? '正在提交' : action === 'approve' ? `批准 ${count} 条申请` : `拒绝 ${count} 条申请` }}
        </button>
      </footer>
      </section>
    </div>
  </AppOverlayTransition>
</template>

<style scoped>
.dialog-layer {
  position: fixed;
  z-index: 80;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(34 37 36 / 36%);
}

.decision-dialog {
  width: min(480px, 100%);
  padding: 18px;
  background: var(--color-surface);
  border-radius: var(--radius-overlay);
  box-shadow: 0 16px 44px rgb(34 37 36 / 18%);
}

header {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 36px;
  gap: 10px;
  align-items: center;
}

.dialog-icon,
.dialog-close {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: var(--radius-control);
}

.dialog-icon--approve {
  color: var(--color-success);
  background: var(--color-success-surface);
}

.dialog-icon--reject {
  color: var(--color-danger);
  background: var(--color-danger-surface);
}

header h2 {
  font-size: 16px;
}

header p {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.dialog-close {
  padding: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.decision-notice {
  margin-top: 16px;
  padding: 9px 10px;
  color: var(--color-warning);
  font-size: 12px;
  background: var(--color-warning-surface);
  border-left: 3px solid var(--color-warning);
}

.reason-field {
  display: grid;
  gap: 6px;
  margin-top: 16px;
}

.reason-field > span {
  font-size: 13px;
  font-weight: 600;
}

.reason-field small {
  color: var(--color-text-secondary);
  font-weight: 400;
}

.reason-hint {
  min-height: 18px;
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 400;
}

.reason-hint--error {
  color: var(--color-danger);
  visibility: hidden;
}

.reason-hint--visible {
  visibility: visible;
}

.reason-guidance {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

textarea {
  width: 100%;
  padding: 9px 10px;
  resize: vertical;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-control);
}

textarea[aria-invalid='true'] {
  border-color: var(--color-danger);
}

.confirm-button:disabled {
  color: var(--color-text-disabled);
  background: var(--color-surface-subtle);
  border-color: var(--color-border);
}

footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 18px;
}

footer button {
  display: flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 13px;
  font-weight: 600;
  border-radius: var(--radius-control);
}

.cancel-button {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.confirm-button--approve {
  color: white;
  background: var(--color-success);
  border: 1px solid var(--color-success);
}

.confirm-button--reject {
  color: white;
  background: var(--color-danger);
  border: 1px solid var(--color-danger);
}

.spin {
  animation: spin 700ms linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }
</style>
