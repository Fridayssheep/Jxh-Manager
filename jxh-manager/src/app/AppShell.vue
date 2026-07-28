<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { LogOut, Menu, Radio, RefreshCw, X } from '@lucide/vue'

import logoAvatar from '@/assets/logo-avatar.webp'
import { useAuthStore } from '@/stores/auth'
import {
  canAccessNavigation,
  managementNavigation,
  primaryNavigation,
} from './navigation'

const props = withDefaults(
  defineProps<{
    pendingJoinRequests?: number
    liveStatus?: 'connecting' | 'connected' | 'disconnected'
  }>(),
  {
    pendingJoinRequests: 0,
    liveStatus: 'connecting',
  },
)

const emit = defineEmits<{ refresh: [] }>()
const auth = useAuthStore()
const router = useRouter()
const mobileMenuOpen = ref(false)
const refreshPending = ref(false)

const visiblePrimaryNavigation = computed(() =>
  primaryNavigation.filter((item) => canAccessNavigation(item, auth.permissions)),
)
const visibleManagementNavigation = computed(() =>
  managementNavigation.filter((item) => canAccessNavigation(item, auth.permissions)),
)
const liveStatusLabel = computed(() => {
  if (props.liveStatus === 'connected') return '实时同步'
  if (props.liveStatus === 'disconnected') return '实时连接中断'
  return '等待实时连接'
})

function closeMobileMenu(): void {
  mobileMenuOpen.value = false
}

async function refresh(): Promise<void> {
  refreshPending.value = true
  emit('refresh')
  await new Promise((resolve) => window.setTimeout(resolve, 320))
  refreshPending.value = false
}

async function logout(): Promise<void> {
  await auth.logout()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--menu-open': mobileMenuOpen }">
    <div class="mobile-scrim" aria-hidden="true" @click="closeMobileMenu" />

    <aside data-test="app-sidebar" class="sidebar" aria-label="主导航">
      <div class="brand-rail" aria-hidden="true" />
      <div class="brand-block">
        <img :src="logoAvatar" class="brand-avatar" width="40" height="40" alt="精小弘" />
        <div class="brand-copy">
          <strong>精小弘</strong>
          <span>JXH MANAGER</span>
        </div>
        <button class="sidebar-close" type="button" aria-label="关闭导航" @click="closeMobileMenu">
          <X :size="18" aria-hidden="true" />
        </button>
      </div>

      <nav class="sidebar-navigation" aria-label="工作台">
        <span class="navigation-label">工作台</span>
        <RouterLink
          v-for="item in visiblePrimaryNavigation"
          :key="item.to"
          :to="item.to"
          class="navigation-item"
          :class="{ 'navigation-item--exact': item.exact }"
          @click="closeMobileMenu"
        >
          <component :is="item.icon" :size="18" :stroke-width="1.8" aria-hidden="true" />
          <span>{{ item.label }}</span>
          <span
            v-if="item.badgeKey && pendingJoinRequests > 0"
            class="navigation-badge"
            aria-label="待审批数量"
          >
            {{ pendingJoinRequests > 99 ? '99+' : pendingJoinRequests }}
          </span>
        </RouterLink>
      </nav>

      <nav v-if="visibleManagementNavigation.length" class="sidebar-management" aria-label="管理">
        <span class="navigation-label">管理</span>
        <RouterLink
          v-for="item in visibleManagementNavigation"
          :key="item.to"
          :to="item.to"
          class="navigation-item"
          @click="closeMobileMenu"
        >
          <component :is="item.icon" :size="18" :stroke-width="1.8" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-health" role="status">
        <span class="health-dot" />
        <div>
          <strong>服务状态待同步</strong>
          <span>NapCat · MySQL · WPS · SSE</span>
        </div>
      </div>
    </aside>

    <div class="workspace">
      <header data-test="app-topbar" class="topbar">
        <button
          class="mobile-menu-button"
          type="button"
          aria-label="打开导航"
          @click="mobileMenuOpen = true"
        >
          <Menu :size="20" aria-hidden="true" />
        </button>

        <div class="scope-indicator" aria-label="当前范围">
          <span>当前范围</span>
          <strong>全部群</strong>
        </div>

        <div class="topbar-actions">
          <span class="live-status" :class="`live-status--${liveStatus}`">
            <Radio :size="15" aria-hidden="true" />
            {{ liveStatusLabel }}
          </span>
          <button
            class="icon-button"
            type="button"
            title="刷新当前页面"
            aria-label="刷新当前页面"
            :disabled="refreshPending"
            @click="refresh"
          >
            <RefreshCw :size="17" :class="{ spin: refreshPending }" aria-hidden="true" />
          </button>
          <RouterLink
            to="/account"
            class="account-link"
            aria-label="当前账号"
            data-test="account-link"
          >
            <span class="account-avatar">{{ auth.currentUser?.display_name.slice(0, 1) }}</span>
            <span class="account-name">{{ auth.currentUser?.display_name }}</span>
          </RouterLink>
          <button class="icon-button" type="button" title="退出登录" aria-label="退出登录" @click="logout">
            <LogOut :size="17" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div class="page-viewport">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: var(--color-canvas);
}

.sidebar {
  position: fixed;
  z-index: 30;
  inset: 0 auto 0 0;
  display: flex;
  width: var(--sidebar-width);
  flex-direction: column;
  overflow: hidden;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
}

.brand-rail {
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--color-brand-500);
}

.brand-block {
  position: relative;
  display: flex;
  min-height: 76px;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 12px 20px;
  border-bottom: 1px solid var(--color-border);
}

.brand-avatar {
  flex: 0 0 auto;
  border-radius: var(--radius-panel);
  object-fit: cover;
}

.brand-copy {
  display: grid;
  min-width: 0;
}

.brand-copy strong {
  font-size: 16px;
  font-weight: 650;
}

.brand-copy span {
  color: var(--color-brand-ink);
  font-size: 10px;
  font-weight: 600;
}

.sidebar-close,
.mobile-menu-button {
  display: none;
}

.sidebar-navigation,
.sidebar-management {
  display: grid;
  gap: 4px;
  padding: 12px 12px 0 16px;
}

.sidebar-management {
  margin-top: auto;
}

.navigation-label {
  padding: 0 8px 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.navigation-item {
  position: relative;
  display: grid;
  min-height: 40px;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  color: var(--color-text-secondary);
  border-radius: var(--radius-control);
  transition:
    color var(--duration-fast) ease,
    background-color var(--duration-fast) ease;
}

.navigation-item:hover {
  color: var(--color-text-primary);
  background: var(--color-surface-subtle);
}

.navigation-item.router-link-active,
.navigation-item--exact.router-link-exact-active {
  color: var(--color-brand-ink);
  font-weight: 600;
  background: var(--color-brand-surface);
}

.navigation-item.router-link-active::before,
.navigation-item--exact.router-link-exact-active::before {
  position: absolute;
  inset: 8px auto 8px -12px;
  width: 3px;
  content: '';
  background: var(--color-brand-500);
  border-radius: 0 2px 2px 0;
}

.navigation-badge {
  min-width: 22px;
  padding: 1px 5px;
  color: var(--color-warning);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  background: var(--color-warning-surface);
  border-radius: 9px;
}

.sidebar-health {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 12px 12px 14px 16px;
  padding: 9px 10px;
  background: var(--color-surface-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.health-dot {
  width: 7px;
  height: 7px;
  margin-top: 5px;
  background: var(--color-unknown);
  border-radius: 50%;
}

.sidebar-health div {
  display: grid;
  min-width: 0;
}

.sidebar-health strong {
  font-size: 11px;
  font-weight: 600;
}

.sidebar-health div span {
  overflow: hidden;
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace {
  min-width: 0;
  min-height: 100vh;
  margin-left: var(--sidebar-width);
}

.topbar {
  position: sticky;
  z-index: 20;
  top: 0;
  display: flex;
  height: var(--topbar-height);
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--page-gutter);
  background: rgb(255 255 255 / 96%);
  border-bottom: 1px solid var(--color-border);
}

.scope-indicator {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.scope-indicator span {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.scope-indicator strong {
  font-size: 13px;
  font-weight: 600;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.live-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 8px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.live-status--connected {
  color: var(--color-success);
}

.live-status--disconnected {
  color: var(--color-warning);
}

.icon-button,
.mobile-menu-button,
.sidebar-close {
  width: 36px;
  height: 36px;
  padding: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}

.icon-button {
  display: grid;
  place-items: center;
}

.icon-button:hover:not(:disabled) {
  color: var(--color-brand-action);
  border-color: var(--color-brand-border);
  background: var(--color-brand-surface);
}

.account-link {
  display: flex;
  min-height: 36px;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 4px;
  border-radius: var(--radius-control);
}

.account-link:hover {
  background: var(--color-surface-subtle);
}

.account-avatar {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  color: var(--color-brand-ink);
  font-weight: 700;
  background: var(--color-brand-surface);
  border: 1px solid var(--color-brand-border);
  border-radius: 50%;
}

.account-name {
  max-width: 120px;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-viewport {
  min-width: 0;
  min-height: calc(100vh - var(--topbar-height));
  padding: 24px var(--page-gutter) 40px;
}

.spin {
  animation: spin 700ms linear infinite;
}

.mobile-scrim {
  display: none;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1279px) {
  .sidebar {
    width: var(--sidebar-collapsed-width);
  }

  .brand-block {
    min-height: 64px;
    padding: 12px;
  }

  .brand-avatar {
    width: 40px;
    height: 40px;
  }

  .brand-copy,
  .navigation-label,
  .navigation-item span,
  .sidebar-health {
    display: none;
  }

  .sidebar-navigation,
  .sidebar-management {
    padding: 10px 8px 0;
  }

  .navigation-item {
    grid-template-columns: 1fr;
    justify-items: center;
    padding: 0;
  }

  .navigation-item.router-link-active::before {
    inset: 8px auto 8px -8px;
  }

  .workspace {
    margin-left: var(--sidebar-collapsed-width);
  }
}

@media (max-width: 767px) {
  .sidebar {
    width: min(280px, calc(100vw - 48px));
    visibility: hidden;
    transform: translateX(-100%);
    transition:
      transform var(--duration-overlay) ease,
      visibility 0s linear var(--duration-overlay);
  }

  .app-shell--menu-open .sidebar {
    visibility: visible;
    transform: translateX(0);
    transition-delay: 0s;
  }

  .app-shell--menu-open .mobile-scrim {
    position: fixed;
    z-index: 25;
    inset: 0;
    display: block;
    background: rgb(34 37 36 / 36%);
  }

  .brand-block {
    min-height: 68px;
    padding: 12px 12px 12px 20px;
  }

  .brand-copy,
  .navigation-label,
  .navigation-item span,
  .sidebar-health {
    display: grid;
  }

  .sidebar-close {
    display: grid;
    margin-left: auto;
    place-items: center;
  }

  .sidebar-navigation,
  .sidebar-management {
    padding: 10px 12px 0 16px;
  }

  .navigation-item {
    grid-template-columns: 18px minmax(0, 1fr) auto;
    justify-items: stretch;
    padding: 0 10px;
  }

  .navigation-item.router-link-active::before {
    inset: 8px auto 8px -12px;
  }

  .workspace {
    margin-left: 0;
  }

  .topbar {
    gap: 10px;
    padding: 0 12px;
  }

  .mobile-menu-button {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
  }

  .scope-indicator {
    min-width: 0;
    margin-right: auto;
  }

  .scope-indicator span,
  .live-status,
  .account-name {
    display: none;
  }

  .account-link {
    padding-right: 4px;
  }

  .page-viewport {
    padding: 20px 16px 32px;
  }
}
</style>
