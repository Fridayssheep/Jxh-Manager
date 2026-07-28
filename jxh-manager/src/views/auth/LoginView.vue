<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, KeyRound, LoaderCircle, UserRound } from '@lucide/vue'

import { getLoginErrorMessage } from '@/api/auth'
import logoAvatar from '@/assets/logo-avatar.webp'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const form = reactive({ username: '', password: '' })
const errors = reactive({ username: '', password: '', form: '' })
const submitting = ref(false)

function validate(): boolean {
  errors.username = form.username.trim() ? '' : '请输入账号'
  errors.password = form.password ? '' : '请输入密码'
  errors.form = ''
  return !errors.username && !errors.password
}

async function submit(): Promise<void> {
  if (!validate()) return

  submitting.value = true
  try {
    await auth.login(form.username.trim(), form.password)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect.startsWith('/') ? redirect : '/')
  } catch (error) {
    errors.form = getLoginErrorMessage(error)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="brand-panel" aria-label="精小弘管理端">
      <div class="brand-track" aria-hidden="true" />
      <div class="brand-identity">
        <img :src="logoAvatar" width="72" height="72" alt="精小弘" />
        <div>
          <strong>精小弘</strong>
          <span>JXH MANAGER</span>
        </div>
      </div>
      <p>内部管理控制台</p>
      <div class="brand-index" aria-hidden="true">01 / ADMIN</div>
    </section>

    <section class="login-workspace">
      <div class="login-form-wrap">
        <header>
          <span class="login-kicker">安全会话</span>
          <h1>登录管理端</h1>
          <p>使用管理员分配的本地账号。</p>
        </header>

        <form novalidate @submit.prevent="submit">
          <label for="username">账号</label>
          <div class="input-wrap" :class="{ 'input-wrap--error': errors.username }">
            <UserRound :size="18" aria-hidden="true" />
            <input
              id="username"
              v-model="form.username"
              name="username"
              type="text"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              aria-describedby="username-error"
            />
          </div>
          <span id="username-error" class="field-error" aria-live="polite">{{ errors.username }}</span>

          <label for="password">密码</label>
          <div class="input-wrap" :class="{ 'input-wrap--error': errors.password }">
            <KeyRound :size="18" aria-hidden="true" />
            <input
              id="password"
              v-model="form.password"
              name="password"
              type="password"
              autocomplete="current-password"
              aria-describedby="password-error"
            />
          </div>
          <span id="password-error" class="field-error" aria-live="polite">{{ errors.password }}</span>

          <div v-if="errors.form" class="form-error" role="alert">{{ errors.form }}</div>

          <button class="login-button" type="submit" :disabled="submitting">
            <LoaderCircle v-if="submitting" class="spin" :size="18" aria-hidden="true" />
            <ArrowRight v-else :size="18" aria-hidden="true" />
            <span>{{ submitting ? '正在验证' : '登录' }}</span>
          </button>
        </form>

        <footer>会话由服务器安全管理</footer>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  min-height: 100vh;
  grid-template-columns: minmax(300px, 38%) minmax(420px, 1fr);
  background: var(--color-surface);
}

.brand-panel {
  position: relative;
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  padding: 56px 52px 44px 64px;
  overflow: hidden;
  color: var(--color-brand-ink);
  background-color: var(--color-brand-surface);
  background-image:
    linear-gradient(var(--color-brand-border) 1px, transparent 1px),
    linear-gradient(90deg, var(--color-brand-border) 1px, transparent 1px);
  background-size: 48px 48px;
}

.brand-panel::after {
  position: absolute;
  right: -64px;
  bottom: 64px;
  width: 220px;
  height: 220px;
  content: '';
  border: 1px solid var(--color-brand-border);
  border-radius: 50%;
}

.brand-track {
  position: absolute;
  inset: 0 auto 0 0;
  width: 8px;
  background: var(--color-brand-500);
}

.brand-identity {
  display: flex;
  align-items: center;
  gap: 16px;
}

.brand-identity img {
  border-radius: var(--radius-overlay);
}

.brand-identity div {
  display: grid;
}

.brand-identity strong {
  font-size: 22px;
  font-weight: 700;
}

.brand-identity span {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
}

.brand-panel > p {
  margin-top: auto;
  font-size: 20px;
  font-weight: 600;
}

.brand-index {
  margin-top: 12px;
  font-family: var(--font-mono);
  font-size: 11px;
}

.login-workspace {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 48px;
}

.login-form-wrap {
  width: min(100%, 388px);
}

.login-form-wrap header {
  margin-bottom: 30px;
}

.login-kicker {
  display: block;
  margin-bottom: 8px;
  color: var(--color-brand-action);
  font-size: 12px;
  font-weight: 700;
}

.login-form-wrap h1 {
  font-size: 28px;
  line-height: 38px;
}

.login-form-wrap header p {
  margin-top: 6px;
  color: var(--color-text-secondary);
}

form {
  display: grid;
}

label {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
}

.input-wrap {
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
}

.input-wrap:focus-within {
  color: var(--color-brand-action);
  border-color: var(--color-brand-action);
  box-shadow: var(--focus-ring);
}

.input-wrap--error {
  border-color: var(--color-danger);
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

footer {
  margin-top: 20px;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-align: center;
}

@media (max-width: 820px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .brand-panel {
    min-height: auto;
    padding: 20px 20px 20px 28px;
    background-image: none;
  }

  .brand-panel > p,
  .brand-index,
  .brand-panel::after {
    display: none;
  }

  .brand-identity img {
    width: 48px;
    height: 48px;
  }

  .brand-identity strong {
    font-size: 18px;
  }

  .login-workspace {
    min-height: 0;
    place-items: start center;
    padding: 48px 24px;
  }
}
</style>
