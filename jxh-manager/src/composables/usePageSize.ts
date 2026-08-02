import { computed, ref } from 'vue'

import type { AppSelectOption } from '@/components/form/AppSelect.vue'

export const pageSizes = [5, 10, 20] as const

export type PageSize = (typeof pageSizes)[number]

export const pageSizeOptions: readonly AppSelectOption[] = pageSizes.map((size) => ({
  value: String(size),
  label: `每页 ${size} 条`,
}))

function normalize(value: number): PageSize {
  return (pageSizes as readonly number[]).includes(value) ? (value as PageSize) : 10
}

/**
 * Page size state for cursor paged lists. The value is also exposed as a CSS
 * custom property so a list card can size itself to the requested rows without
 * a fixed viewport height, while narrow screens cap the visible rows instead.
 */
export function usePageSize(initial: PageSize = 10) {
  const pageSize = ref<PageSize>(normalize(initial))

  function setPageSize(value: string): boolean {
    const next = normalize(Number.parseInt(value, 10))
    if (next === pageSize.value) return false
    pageSize.value = next
    return true
  }

  const pageSizeStyle = computed(() => ({ '--page-rows': String(pageSize.value) }))

  return { pageSize, setPageSize, pageSizeStyle, pageSizeOptions }
}
