<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterView, useRouter } from 'vue-router'

import AppShell from '@/app/AppShell.vue'
import { useAdminEvents } from '@/composables/useAdminEvents'
import { useAuthStore } from '@/stores/auth'
import { useOverviewStore } from '@/stores/overview'

const refreshRevision = ref(0)
const auth = useAuthStore()
const overview = useOverviewStore()
const router = useRouter()
const { status: liveStatus } = useAdminEvents({
  topics: ['overview', 'join_requests', 'scheduled_jobs', 'knowledge', 'system', 'auth'],
  enabled: computed(() => auth.isAuthenticated && auth.hasPermission('events:read')),
  onEvent: (event) => {
    if (event.event === 'auth.session_revoked') {
      auth.clearSession()
      void router.replace({ name: 'login' })
    }
  },
})
</script>

<template>
  <RouterView v-slot="{ Component, route }">
    <component :is="Component" v-if="route.meta.public" />
    <AppShell
      v-else
      :pending-join-requests="overview.pendingJoinRequests"
      :live-status="liveStatus"
      @refresh="refreshRevision += 1"
    >
      <component :is="Component" :key="`${route.fullPath}:${refreshRevision}`" />
    </AppShell>
  </RouterView>
</template>
