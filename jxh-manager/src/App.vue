<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterView, useRouter } from 'vue-router'

import AppShell from '@/app/AppShell.vue'
import { loginTransitionPhase } from '@/app/login-transition'
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

  <div
    v-if="loginTransitionPhase !== 'idle'"
    class="login-screen-transition"
    :class="`login-screen-transition--${loginTransitionPhase}`"
    data-test="login-screen-transition"
    aria-hidden="true"
  />
</template>

<style scoped>
.login-screen-transition {
  position: fixed;
  z-index: 1000;
  inset: 0;
  pointer-events: auto;
  background: var(--color-brand-500);
  transform-origin: left center;
  will-change: opacity, transform;
}

.login-screen-transition--sweeping {
  animation: login-screen-sweep 540ms cubic-bezier(0.76, 0, 0.24, 1) both;
}

.login-screen-transition--fading {
  animation: login-screen-fade 300ms ease-out both;
}

@keyframes login-screen-sweep {
  from {
    transform: scaleX(0);
  }

  to {
    transform: scaleX(1);
  }
}

@keyframes login-screen-fade {
  from {
    opacity: 1;
  }

  to {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .login-screen-transition--sweeping,
  .login-screen-transition--fading {
    animation-duration: 0.01ms;
  }
}
</style>
