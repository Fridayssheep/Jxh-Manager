<script setup lang="ts">
import { ref } from 'vue'
import { RouterView } from 'vue-router'

import AppShell from '@/app/AppShell.vue'

const refreshRevision = ref(0)
</script>

<template>
  <RouterView v-slot="{ Component, route }">
    <component :is="Component" v-if="route.meta.public" />
    <AppShell v-else @refresh="refreshRevision += 1">
      <component :is="Component" :key="`${route.fullPath}:${refreshRevision}`" />
    </AppShell>
  </RouterView>
</template>
