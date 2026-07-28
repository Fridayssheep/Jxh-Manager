import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { overviewApi, type OverviewQuery } from '@/api/overview'
import type { Overview } from '@/api/types'

export const useOverviewStore = defineStore('overview', () => {
  const data = ref<Overview | null>(null)
  const loading = ref(false)
  const error = ref<unknown>(null)
  const range = ref<OverviewQuery['range']>('7d')
  const groupId = ref<string | null>(null)
  let requestSequence = 0

  const pendingJoinRequests = computed(() => {
    const item = data.value?.pending_items.find((pending) => pending.key === 'join_requests')
    return item?.count ?? 0
  })

  async function load(query?: Partial<OverviewQuery>): Promise<void> {
    if (query?.range) range.value = query.range
    if (query && 'groupId' in query) groupId.value = query.groupId ?? null

    const sequence = ++requestSequence
    loading.value = true
    error.value = null
    try {
      const result = await overviewApi.get({ range: range.value, groupId: groupId.value })
      if (sequence === requestSequence) data.value = result
    } catch (reason) {
      if (sequence === requestSequence) error.value = reason
    } finally {
      if (sequence === requestSequence) loading.value = false
    }
  }

  return {
    data,
    loading,
    error,
    range,
    groupId,
    pendingJoinRequests,
    load,
  }
})
