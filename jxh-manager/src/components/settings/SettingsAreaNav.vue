<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppTabBar, { type AppTabOption } from '@/components/navigation/AppTabBar.vue'

const route = useRoute()
const router = useRouter()
const options: readonly AppTabOption[] = [
  { value: '/groups', label: '群目录' },
  { value: '/settings', label: '全局设置' },
]
const activeRoute = computed(() => (route.path === '/settings' ? '/settings' : '/groups'))

function navigate(value: string): void {
  if (value !== route.path) void router.push(value)
}
</script>

<template>
  <AppTabBar
    class="settings-area-nav"
    :model-value="activeRoute"
    :options="options"
    accessible-name="群与设置"
    @update:model-value="navigate"
  />
</template>

<style scoped>
.settings-area-nav { width: 100%; }
</style>
