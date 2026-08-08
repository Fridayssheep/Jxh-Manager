<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Check, KeyRound, LoaderCircle, UserRound, WifiOff } from '@lucide/vue'

import { getLoginErrorMessage } from '@/api/auth'
import { playLoginTransition } from '@/app/login-transition'
import loginArtwork from '@/assets/login.webp'
import logoAvatar from '@/assets/logo-avatar.webp'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const form = reactive({ username: '', password: '' })
const errors = reactive({ username: '', password: '', form: '' })
const submitting = ref(false)
const authFeedback = ref<'idle' | 'success' | 'error'>('idle')

function reducedMotionPreferred(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function waitForFieldFeedback(): Promise<void> {
  return new Promise((resolve) =>
    globalThis.setTimeout(resolve, reducedMotionPreferred() ? 20 : 500),
  )
}

function validate(): boolean {
  errors.username = form.username.trim() ? '' : '请输入账号'
  errors.password = form.password ? '' : '请输入密码'
  errors.form = ''
  return !errors.username && !errors.password
}

async function submit(): Promise<void> {
  if (!validate()) return

  authFeedback.value = 'idle'
  await nextTick()
  submitting.value = true
  try {
    await auth.login(form.username.trim(), form.password)
  } catch (error) {
    authFeedback.value = 'error'
    errors.form = getLoginErrorMessage(error)
    submitting.value = false
    return
  }

  authFeedback.value = 'success'
  try {
    await waitForFieldFeedback()
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await playLoginTransition(() => router.replace(redirect.startsWith('/') ? redirect : '/'))
  } finally {
    submitting.value = false
  }
}

watch(
  () => [form.username, form.password],
  () => {
    if (submitting.value || authFeedback.value === 'idle') return
    authFeedback.value = 'idle'
    errors.form = ''
  },
)
</script>

<template>
  <main class="login-page">
    <div class="login-shell">
      <section class="brand-panel" aria-label="精小弘管理端">
        <img
          :src="loginArtwork"
          class="login-artwork"
          data-test="login-artwork"
          alt=""
          aria-hidden="true"
        />
        <div class="brand-identity">
          <img :src="logoAvatar" width="48" height="48" alt="精小弘" />
          <div>
            <strong>精小弘</strong>
            <span>JXH MANAGER</span>
          </div>
        </div>
      </section>

      <section class="login-workspace">
        <div class="login-form-wrap">
          <header>
            <h1>登录管理端</h1>
          </header>

          <div v-if="auth.bootstrapError" class="service-warning" role="status">
            <WifiOff :size="18" aria-hidden="true" />
            <div>
              <strong>管理服务暂时不可用</strong>
              <span>可以检查网络后再次登录。</span>
            </div>
          </div>

          <form
            novalidate
            :aria-busy="submitting"
            :data-auth-feedback="authFeedback"
            @submit.prevent="submit"
          >
            <label for="username">账号</label>
            <div
              class="input-wrap"
              :class="{
                'input-wrap--error': errors.username,
                'input-wrap--auth-success': authFeedback === 'success',
                'input-wrap--auth-error': authFeedback === 'error',
              }"
            >
              <UserRound :size="18" aria-hidden="true" />
              <input
                id="username"
                v-model="form.username"
                name="username"
                type="text"
                autocomplete="username"
                autocapitalize="none"
                spellcheck="false"
                :disabled="submitting"
                :aria-invalid="Boolean(errors.username) || authFeedback === 'error'"
                aria-describedby="username-error"
              />
            </div>
            <span id="username-error" class="field-error" aria-live="polite">{{
              errors.username
            }}</span>

            <label for="password">密码</label>
            <div
              class="input-wrap"
              :class="{
                'input-wrap--error': errors.password,
                'input-wrap--auth-success': authFeedback === 'success',
                'input-wrap--auth-error': authFeedback === 'error',
              }"
            >
              <KeyRound :size="18" aria-hidden="true" />
              <input
                id="password"
                v-model="form.password"
                name="password"
                type="password"
                autocomplete="current-password"
                :disabled="submitting"
                :aria-invalid="Boolean(errors.password) || authFeedback === 'error'"
                aria-describedby="password-error"
              />
            </div>
            <span id="password-error" class="field-error" aria-live="polite">{{
              errors.password
            }}</span>

            <div v-if="errors.form" class="form-error" role="alert">{{ errors.form }}</div>

            <button class="login-button" type="submit" :disabled="submitting">
              <Check v-if="authFeedback === 'success'" :size="18" aria-hidden="true" />
              <LoaderCircle v-else-if="submitting" class="spin" :size="18" aria-hidden="true" />
              <ArrowRight v-else :size="18" aria-hidden="true" />
              <span>{{
                authFeedback === 'success' ? '验证通过' : submitting ? '正在验证' : '登录'
              }}</span>
            </button>
          </form>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.login-page {
  position: relative;
  display: grid;
  min-height: 100dvh;
  place-items: center;
  padding: 40px 48px;
  overflow: hidden;
  background: var(--color-surface);
  isolation: isolate;
}

.login-page::before {
  position: absolute;
  z-index: -1;
  inset: 0 45% 0 0;
  content: '';
  background: var(--color-brand-500);
  clip-path: polygon(0 0, 78% 0, 100% 100%, 0 100%);
}

.login-shell {
  display: grid;
  width: min(1120px, calc(100vw - 96px));
  height: min(720px, calc(100dvh - 80px));
  min-height: 560px;
  grid-template-columns: minmax(300px, 43%) minmax(0, 1fr);
  overflow: hidden;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-overlay);
  box-shadow: 0 24px 64px rgb(34 37 36 / 18%);
  animation: login-shell-enter 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.brand-panel {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  color: var(--color-brand-ink);
  background-color: var(--color-brand-surface);
}

.login-artwork {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.brand-identity {
  position: absolute;
  z-index: 1;
  top: 24px;
  left: 24px;
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--color-brand-ink);
}

.brand-identity img {
  width: 48px;
  height: 48px;
  background: var(--color-surface);
  border: 1px solid rgb(255 255 255 / 84%);
  border-radius: var(--radius-overlay);
  box-shadow: 0 6px 20px rgb(123 32 54 / 14%);
}

.brand-identity div {
  display: grid;
  padding: 4px 7px;
  background: rgb(255 255 255 / 82%);
  border: 1px solid rgb(255 255 255 / 84%);
  border-left: 3px solid var(--color-brand-500);
  border-radius: var(--radius-control);
}

.brand-identity strong {
  font-size: 18px;
  font-weight: 700;
}

.brand-identity span {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
}

.login-workspace {
  display: grid;
  min-width: 0;
  min-height: 0;
  place-items: center;
  padding: 48px clamp(40px, 6vw, 80px);
  background: var(--color-surface);
}

.login-form-wrap {
  width: min(100%, 388px);
  animation: login-form-enter 360ms 70ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.login-form-wrap header {
  margin-bottom: 30px;
}

.login-form-wrap h1 {
  font-size: 28px;
  line-height: 38px;
}

form {
  display: grid;
}

.service-warning {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 9px;
  margin-bottom: 18px;
  padding: 10px 11px;
  color: var(--color-warning);
  background: var(--color-warning-surface);
  border-left: 3px solid var(--color-warning);
}

.service-warning div {
  display: grid;
}

.service-warning strong {
  color: var(--color-text-primary);
  font-size: 13px;
}

.service-warning span {
  color: var(--color-text-secondary);
  font-size: 12px;
}

label {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
}

.input-wrap {
  position: relative;
  display: grid;
  height: 42px;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  color: var(--color-text-secondary);
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-control);
  overflow: hidden;
  transition:
    color var(--duration-fast) ease,
    border-color var(--duration-fast) ease,
    box-shadow var(--duration-fast) ease;
}

.input-wrap::before {
  position: absolute;
  inset: 0;
  content: '';
  background: transparent;
  transform: scaleX(0);
  transform-origin: left center;
  pointer-events: none;
}

.input-wrap > * {
  position: relative;
  z-index: 1;
}

.input-wrap:focus-within {
  color: var(--color-brand-action);
  border-color: var(--color-brand-action);
  box-shadow: var(--focus-ring);
}

.input-wrap--error {
  border-color: var(--color-danger);
}

.input-wrap--auth-success {
  color: var(--color-success);
  border-color: var(--color-success);
}

.input-wrap--auth-success:focus-within {
  color: var(--color-success);
  border-color: var(--color-success);
  box-shadow:
    0 0 0 2px var(--color-surface),
    0 0 0 4px rgb(18 111 75 / 42%);
}

.input-wrap--auth-success::before {
  background: rgb(18 111 75 / 18%);
  animation: login-field-fill 460ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.input-wrap--auth-error {
  color: var(--color-danger);
  border-color: var(--color-danger);
}

.input-wrap--auth-error:focus-within {
  color: var(--color-danger);
  border-color: var(--color-danger);
  box-shadow:
    0 0 0 2px var(--color-surface),
    0 0 0 4px rgb(159 37 37 / 36%);
}

.input-wrap--auth-error::before {
  background: rgb(159 37 37 / 18%);
  animation: login-field-fill 460ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

input {
  width: 100%;
  min-width: 0;
  height: 100%;
  padding: 0;
  background: transparent;
  border: 0;
  outline: 0;
}

.field-error {
  min-height: 22px;
  padding-top: 3px;
  color: var(--color-danger);
  font-size: 12px;
}

.form-error {
  margin: 2px 0 14px;
  padding: 9px 10px;
  color: var(--color-danger);
  font-size: 13px;
  background: var(--color-danger-surface);
  border-left: 3px solid var(--color-danger);
}

.login-button {
  display: grid;
  width: 100%;
  height: 42px;
  grid-template-columns: 18px auto;
  place-content: center;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  color: white;
  font-weight: 650;
  background: var(--color-brand-action);
  border: 1px solid var(--color-brand-action);
  border-radius: var(--radius-control);
}

.login-button:hover:not(:disabled) {
  background: var(--color-brand-action-hover);
  border-color: var(--color-brand-action-hover);
}

.login-button:disabled {
  opacity: 0.72;
}

@keyframes login-shell-enter {
  from {
    opacity: 0;
    transform: translateY(12px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes login-form-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes login-field-fill {
  from {
    transform: scaleX(0);
  }

  to {
    transform: scaleX(1);
  }
}

@media (max-width: 820px) {
  .login-page {
    padding: 20px;
  }

  .login-page::before {
    inset: 0 0 56% 0;
    clip-path: polygon(0 0, 100% 0, 100% 76%, 0 100%);
  }

  .login-shell {
    width: min(480px, 100%);
    height: auto;
    min-height: 0;
    grid-template-columns: minmax(0, 1fr);
  }

  .brand-panel {
    min-height: 72px;
    padding: 14px 18px;
    background: var(--color-brand-surface);
    border-bottom: 1px solid var(--color-brand-border);
  }

  .login-artwork {
    display: none;
  }

  .brand-identity {
    position: relative;
    inset: auto;
    gap: 10px;
  }

  .brand-identity img {
    width: 42px;
    height: 42px;
    box-shadow: none;
  }

  .brand-identity div {
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 0;
  }

  .brand-identity strong {
    font-size: 16px;
  }

  .login-workspace {
    min-height: 0;
    padding: 36px 28px 32px;
  }
}

@media (max-width: 420px) {
  .login-page {
    padding: 12px;
  }

  .login-workspace {
    padding: 28px 20px 24px;
  }

  .login-form-wrap header {
    margin-bottom: 24px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .input-wrap--auth-success::before,
  .input-wrap--auth-error::before {
    animation-duration: 0.01ms;
  }
}
</style>
