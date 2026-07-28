<script setup lang="ts">
import { ref, watch } from 'vue'
import { CheckCircle2, LoaderCircle, X, XCircle } from '@lucide/vue'

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

watch(
  () => props.open,
  (open) => {
    if (open) reason.value = ''
  },
)

function confirm(): void {
  emit('confirm', reason.value.trim() || undefined)
}
</script>

<template>
  <div v-if="open" class="dialog-layer" role="presentation" @mousedown.self="emit('cancel')">
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
        <span>处理原因 <small>选填</small></span>
        <textarea
          v-model="reason"
          data-test="decision-reason"
          rows="3"
          maxlength="500"
          placeholder="用于审计记录，不会发送给申请人"
          :disabled="busy"
        />
      </label>

      <footer>
        <button class="cancel-button" type="button" :disabled="busy" @click="emit('cancel')">取消</button>
        <button
          data-test="confirm-decision"
          :class="['confirm-button', `confirm-button--${action}`]"
          type="button"
          :disabled="busy"
          @click="confirm"
        >
          <LoaderCircle v-if="busy" class="spin" :size="16" aria-hidden="true" />
          {{ busy ? '正在提交' : action === 'approve' ? `批准 ${count} 条申请` : `拒绝 ${count} 条申请` }}
        </button>
      </footer>
    </section>
  </div>
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

textarea {
  width: 100%;
  padding: 9px 10px;
  resize: vertical;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-control);
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
