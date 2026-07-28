import { ref } from 'vue'
import { defineStore } from 'pinia'

import type { AdminEventStatus } from '@/composables/useAdminEvents'

export const useRuntimeStore = defineStore('runtime', () => {
  const liveStatus = ref<AdminEventStatus>('disconnected')

  return { liveStatus }
})
