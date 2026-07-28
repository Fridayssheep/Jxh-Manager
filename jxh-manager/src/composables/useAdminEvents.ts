import { onBeforeUnmount, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

import type { AdminEvent, EventTopic, EventType } from '@/api/types'

export type AdminEventStatus = 'connecting' | 'connected' | 'disconnected'

const EVENT_TYPES: EventType[] = [
  'overview.updated',
  'group.updated',
  'settings.updated',
  'join_request.created',
  'join_request.updated',
  'command.updated',
  'command.run_completed',
  'scheduled_job.updated',
  'scheduled_job.run_completed',
  'knowledge.reload_completed',
  'system.health_changed',
  'stream.reset',
  'auth.session_revoked',
]

const subscribers = new Set<(event: AdminEvent) => void>()

function eventStreamUrl(topics: readonly EventTopic[]): string {
  const baseUrl = import.meta.env.VITE_ADMIN_API_BASE_URL ?? '/api/admin/v1'
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/events`, globalThis.location?.origin ?? 'http://localhost')
  topics.forEach((topic) => url.searchParams.append('topic', topic))
  return url.toString()
}

export function subscribeToAdminEvents(subscriber: (event: AdminEvent) => void): () => void {
  subscribers.add(subscriber)
  return () => subscribers.delete(subscriber)
}

export function createAdminEventStream(options: {
  topics: readonly EventTopic[]
  EventSourceImpl?: typeof EventSource
  onStatus: (status: AdminEventStatus) => void
  onEvent: (event: AdminEvent) => void
}): { source: EventSource; close: () => void } {
  const EventSourceImpl = options.EventSourceImpl ?? globalThis.EventSource
  options.onStatus('connecting')
  const source = new EventSourceImpl(eventStreamUrl(options.topics), { withCredentials: true })

  source.onopen = () => options.onStatus('connected')
  source.onerror = () => options.onStatus('disconnected')

  EVENT_TYPES.forEach((eventType) => {
    source.addEventListener(eventType, (message) => {
      if (!(message instanceof MessageEvent) || typeof message.data !== 'string') return
      try {
        options.onEvent(JSON.parse(message.data) as AdminEvent)
      } catch {
        // A malformed frame is ignored; the next valid invalidation event remains usable.
      }
    })
  })

  return { source, close: () => source.close() }
}

export function useAdminEvents(options: {
  topics: readonly EventTopic[]
  enabled: MaybeRefOrGetter<boolean>
  onEvent?: (event: AdminEvent) => void
}): { status: Ref<AdminEventStatus> } {
  const status = ref<AdminEventStatus>('disconnected')
  let stream: ReturnType<typeof createAdminEventStream> | null = null

  function stop(): void {
    stream?.close()
    stream = null
    status.value = 'disconnected'
  }

  watch(
    () => toValue(options.enabled),
    (enabled) => {
      stop()
      if (!enabled || typeof globalThis.EventSource === 'undefined') return

      stream = createAdminEventStream({
        topics: options.topics,
        onStatus: (nextStatus) => (status.value = nextStatus),
        onEvent: (event) => {
          options.onEvent?.(event)
          subscribers.forEach((subscriber) => subscriber(event))
        },
      })
    },
    { immediate: true },
  )

  onBeforeUnmount(stop)
  return { status }
}
