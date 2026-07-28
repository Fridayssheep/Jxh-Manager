<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterView, useRouter } from 'vue-router'

import AppShell from '@/app/AppShell.vue'
import { useAdminEvents } from '@/composables/useAdminEvents'
import { useAuthStore } from '@/stores/auth'
import { useOverviewStore } from '@/stores/overview'
import { useRuntimeStore } from '@/stores/runtime'

const refreshRevision = ref(0)
const auth = useAuthStore()
const overview = useOverviewStore()
const runtime = useRuntimeStore()
const router = useRouter()
const { status: liveStatus } = useAdminEvents({
  topics: ['overview', 'join_requests', 'scheduled_jobs', 'knowledge', 'system', 'auth'],
  enabled: computed(() => auth.isAuthenticated && auth.hasPermission('events:read')),
  onEvent: (event) => {
    if (event.event === 'auth.session_revoked' && event.resource?.type === 'session') {
      auth.clearSessionIfCurrent(event.resource.id)
    }
  },
})

watch(
  liveStatus,
  (status) => {
    runtime.liveStatus = status
  },
  { immediate: true },
)
watch(
  () => auth.isAuthenticated,
  (authenticated, wasAuthenticated) => {
    if (authenticated || !wasAuthenticated || router.currentRoute.value.meta.public) return

    void router.replace({
      name: 'login',
      query: { redirect: router.currentRoute.value.fullPath },
    })
  },
)
</script>

<template>
  <RouterView v-slot="{ Component, route }">
    <component :is="Component" v-if="route.meta.public" />
    <AppShell
      v-else
      :pending-join-requests="overview.pendingJoinRequests"
      @refresh="refreshRevision += 1"
    >
      <Transition name="page-rise" mode="out-in">
        <component :is="Component" :key="`${route.path}:${refreshRevision}`" />
      </Transition>
    </AppShell>
  </RouterView>
</template>
