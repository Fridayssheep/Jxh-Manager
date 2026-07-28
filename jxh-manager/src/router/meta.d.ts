import 'vue-router'

import type { Permission } from '@/api/types'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    permission?: Permission
    title?: string
  }
}

export {}
