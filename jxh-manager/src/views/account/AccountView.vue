<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { AlertTriangle, CheckCircle2, KeyRound, ShieldCheck, UserRound } from '@lucide/vue'

import { authApi } from '@/api/auth'
import { AdminApiError } from '@/api/client'
import type { AdminRole } from '@/api/types'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const pending = ref(false)
const feedback = ref<string | null>(null)
const feedbackTone = ref<'success' | 'danger'>('success')
const form = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })

const roleLabels: Record<AdminRole, string> = {
  super_admin: '超级管理员',
  maintainer: '维护员',
  observer: '观察员',
}
const currentUser = computed(() => auth.currentUser)
const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})

function displayTime(value: string | null | undefined): string {
  return value ? dateFormatter.format(new Date(value)) : '尚无记录'
}

async function changePassword(): Promise<void> {
  feedback.value = null
  if (!form.currentPassword || !form.newPassword) {
    feedbackTone.value = 'danger'
    feedback.value = '请完整填写当前密码和新密码。'
    return
  }
  if (form.newPassword !== form.confirmPassword) {
    feedbackTone.value = 'danger'
    feedback.value = '两次输入的新密码不一致。'
    return
  }

  pending.value = true
  try {
    const context = await authApi.changePassword(form.currentPassword, form.newPassword)
    auth.acceptContext(context)
    Object.assign(form, { currentPassword: '', newPassword: '', confirmPassword: '' })
    feedbackTone.value = 'success'
    feedback.value = '密码已更新，其他会话已撤销，当前会话已安全轮换。'
  } catch (reason) {
    feedbackTone.value = 'danger'
    feedback.value = reason instanceof AdminApiError ? reason.message : '密码更新失败，请稍后重试。'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <main class="account-page">
    <header class="page-header">
      <div><h1>个人账号</h1><p>查看当前身份并更新自己的登录密码。</p></div>
      <UserRound :size="22" aria-hidden="true" />
    </header>

    <div class="account-layout">
      <section class="identity-panel" aria-labelledby="identity-title">
        <header>
          <span class="identity-avatar">{{ currentUser?.display_name.slice(0, 1) }}</span>
          <div><span class="eyebrow">CURRENT ACCOUNT</span><h2 id="identity-title">{{ currentUser?.display_name }}</h2><p class="mono">@{{ currentUser?.username }}</p></div>
        </header>
        <dl>
          <div><dt>角色</dt><dd><ShieldCheck :size="14" />{{ currentUser ? roleLabels[currentUser.role] : '未知' }}</dd></div>
          <div><dt>QQ 维护身份</dt><dd class="mono">{{ currentUser?.qq_user_id || '未绑定' }}</dd></div>
          <div><dt>最近登录</dt><dd>{{ displayTime(currentUser?.last_login_at) }}</dd></div>
          <div><dt>账号状态</dt><dd><span :class="['status-dot', { disabled: !currentUser?.enabled }]" />{{ currentUser?.enabled ? '正常' : '已停用' }}</dd></div>
        </dl>
      </section>

      <section class="password-panel" aria-labelledby="password-title">
        <header><KeyRound :size="18" /><div><h2 id="password-title">修改密码</h2><p>提交后会撤销其他登录会话，并轮换当前会话。</p></div></header>
        <div v-if="feedback" :class="['feedback', `feedback--${feedbackTone}`]" :role="feedbackTone === 'success' ? 'status' : 'alert'">
          <CheckCircle2 v-if="feedbackTone === 'success'" :size="16" /><AlertTriangle v-else :size="16" />{{ feedback }}
        </div>
        <form data-test="change-password" @submit.prevent="changePassword">
          <label><span>当前密码</span><input v-model="form.currentPassword" name="current_password" type="password" autocomplete="current-password" /></label>
          <label><span>新密码</span><input v-model="form.newPassword" name="new_password" type="password" autocomplete="new-password" /></label>
          <label><span>确认新密码</span><input v-model="form.confirmPassword" name="confirm_password" type="password" autocomplete="new-password" /></label>
          <button type="submit" :disabled="pending"><KeyRound :size="15" />{{ pending ? '正在更新' : '更新密码' }}</button>
        </form>
      </section>
    </div>
  </main>
</template>

<style scoped>
.account-page{display:grid;gap:18px}.page-header,.identity-panel>header,.password-panel>header,.password-panel button,.feedback,.identity-panel dd{display:flex;align-items:center}.page-header{justify-content:space-between;gap:16px}.page-header h1{font-size:24px;line-height:34px}.page-header p,.password-panel header p{color:var(--color-text-secondary);font-size:12px}.page-header>svg{color:var(--color-brand-action)}.account-layout{display:grid;grid-template-columns:minmax(260px,.75fr) minmax(400px,1.25fr);gap:16px;align-items:start}.identity-panel,.password-panel{background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-panel)}.identity-panel>header{gap:12px;padding:18px;border-bottom:1px solid var(--color-border)}.identity-avatar{display:grid;width:46px;height:46px;flex:0 0 auto;place-items:center;color:var(--color-brand-ink);font-size:18px;font-weight:700;background:var(--color-brand-surface);border:1px solid var(--color-brand-border);border-radius:50%}.identity-panel h2,.password-panel h2{font-size:16px}.eyebrow{color:var(--color-brand-ink);font-size:9px;font-weight:700}.identity-panel header p{color:var(--color-text-secondary);font-size:11px}.identity-panel dl{display:grid;margin:0}.identity-panel dl div{display:grid;grid-template-columns:100px 1fr;gap:12px;padding:11px 18px;border-bottom:1px solid var(--color-border)}.identity-panel dl div:last-child{border-bottom:0}.identity-panel dt{color:var(--color-text-secondary);font-size:11px}.identity-panel dd{gap:6px;margin:0;font-size:12px}.status-dot{width:7px;height:7px;background:var(--color-success);border-radius:50%}.status-dot.disabled{background:var(--color-danger)}.password-panel>header{gap:10px;padding:16px 18px;border-bottom:1px solid var(--color-border)}.password-panel>header>svg{color:var(--color-brand-action)}.feedback{gap:7px;margin:14px 18px 0;padding:9px 10px;font-size:11px;border:1px solid;border-radius:var(--radius-control)}.feedback--success{color:var(--color-success);background:var(--color-success-surface);border-color:var(--color-success)}.feedback--danger{color:var(--color-danger);background:var(--color-danger-surface);border-color:var(--color-danger)}.password-panel form{display:grid;gap:13px;padding:18px}.password-panel label{display:grid;gap:5px}.password-panel label span{color:var(--color-text-secondary);font-size:11px;font-weight:600}.password-panel input{width:100%;height:40px;padding:0 10px;background:var(--color-surface);border:1px solid var(--color-border-strong);border-radius:var(--radius-control)}.password-panel button{width:fit-content;min-height:38px;justify-content:center;gap:7px;margin-top:2px;padding:0 12px;color:white;font-weight:600;background:var(--color-brand-action);border:1px solid var(--color-brand-action);border-radius:var(--radius-control)}
@media(max-width:800px){.account-layout{grid-template-columns:1fr}}
@media(max-width:560px){.identity-panel dl div{grid-template-columns:1fr;gap:3px}.password-panel button{width:100%}}
</style>
