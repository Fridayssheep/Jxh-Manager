<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LoaderCircle, ShieldAlert, X } from '@lucide/vue'

import AppOverlayTransition from '@/components/motion/AppOverlayTransition.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    configurationVersion: number | null
    busy?: boolean
  }>(),
  { busy: false },
)

const emit = defineEmits<{ cancel: []; confirm: [] }>()

const confirmation = ref('')
const normalizedConfirmation = computed(() => confirmation.value.trim())
const canConfirm = computed(() => !props.busy && props.configurationVersion !== null && normalizedConfirmation.value === 'restart')

watch(
  () => props.open,
  (open) => {
    if (open) confirmation.value = ''
  },
)

function confirm(): void {
  if (!canConfirm.value) return
  emit('confirm')
}
</script>

<template>
  <AppOverlayTransition :show="open" variant="dialog">
    <div class="dialog-layer" role="presentation" @mousedown.self="emit('cancel')">
      <section
        data-test="bot-restart-dialog"
        class="restart-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bot-restart-title"
      >
        <header>
          <div class="dialog-icon">
            <ShieldAlert :size="20" aria-hidden="true" />
          </div>
          <div>
            <h2 id="bot-restart-title">重启 Bot</h2>
            <p>
              当前配置版本
              <span class="mono">{{ configurationVersion ?? '未知' }}</span>
              将作为本次受控重启的版本校验。
            </p>
          </div>
          <button class="dialog-close" type="button" aria-label="关闭" :disabled="busy" @click="emit('cancel')">
            <X :size="18" aria-hidden="true" />
          </button>
        </header>

        <div class="restart-notice">
          提交后 Bot 会退出并由容器/守护进程自动拉起。页面会在重新登录后恢复。
        </div>

        <label class="confirm-field">
          <span>
            确认文本
            <small>必须输入小写 ASCII `restart`</small>
          </span>
          <input
            v-model="confirmation"
            data-test="restart-confirmation"
            autocomplete="off"
            spellcheck="false"
            :disabled="busy"
          />
        </label>

        <footer>
          <button data-test="cancel-bot-restart" class="cancel-button" type="button" :disabled="busy" @click="emit('cancel')">
            取消
          </button>
          <button
            data-test="confirm-bot-restart"
            class="confirm-button"
            type="button"
            :disabled="!canConfirm"
            @click="confirm"
          >
            <LoaderCircle v-if="busy" class="spin" :size="16" aria-hidden="true" />
            {{ busy ? '正在提交' : '确认重启' }}
          </button>
        </footer>
      </section>
    </div>
  </AppOverlayTransition>
</template>

<style scoped>
.dialog-layer {
  position: fixed;
  z-index: 95;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(34 37 36 / 36%);
}

.restart-dialog {
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

.dialog-icon {
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

.restart-notice {
  margin-top: 16px;
  padding: 9px 10px;
  color: var(--color-warning);
  font-size: 12px;
  background: var(--color-warning-surface);
  border-left: 3px solid var(--color-warning);
}

.confirm-field {
  display: grid;
  gap: 6px;
  margin-top: 16px;
}

.confirm-field > span {
  font-size: 13px;
  font-weight: 600;
}

.confirm-field small {
  color: var(--color-text-secondary);
  font-weight: 400;
}

input {
  width: 100%;
  height: 40px;
  padding: 0 10px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-control);
}

input:disabled {
  color: var(--color-text-disabled);
  background: var(--color-surface-subtle);
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

.confirm-button {
  color: white;
  background: var(--color-danger);
  border: 1px solid var(--color-danger);
}

.confirm-button:disabled {
  color: var(--color-text-disabled);
  background: var(--color-surface-subtle);
  border-color: var(--color-border);
}

.spin {
  animation: spin 700ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
