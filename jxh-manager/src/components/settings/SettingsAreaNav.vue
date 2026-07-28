<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <nav class="settings-area-nav" aria-label="群与设置">
    <RouterLink to="/groups">群目录</RouterLink>
    <RouterLink to="/settings">全局设置</RouterLink>
  </nav>
</template>

<style scoped>
.settings-area-nav {
  display: flex;
  min-height: 40px;
  gap: 4px;
  align-items: flex-end;
  border-bottom: 1px solid var(--color-border);
}

.settings-area-nav a {
  position: relative;
  min-width: 88px;
  padding: 9px 12px 10px;
  color: var(--color-text-secondary);
  font-size: 13px;
  text-align: center;
}

.settings-area-nav a:hover {
  color: var(--color-text-primary);
}

.settings-area-nav a.router-link-exact-active {
  color: var(--color-brand-ink);
  font-weight: 600;
}

.settings-area-nav a.router-link-exact-active::after {
  position: absolute;
  inset: auto 8px -1px;
  height: 2px;
  content: '';
  background: var(--color-brand-500);
}
</style>
