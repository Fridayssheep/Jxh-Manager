import { describe, expect, it, vi } from 'vitest'

import type { ApiSchemas } from '@/api/types'
import { createAdminEventStream } from '../useAdminEvents'

class FakeEventSource {
  readonly url: string
  readonly withCredentials: boolean
  readonly listeners = new Map<string, EventListener>()
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false

  constructor(url: string | URL, options?: EventSourceInit) {
    this.url = url.toString()
    this.withCredentials = options?.withCredentials ?? false
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.set(type, listener as EventListener)
  }

  close(): void {
    this.closed = true
  }
}

describe('createAdminEventStream', () => {
  it('subscribes with cookies, reports state and parses typed events', () => {
    const statuses: string[] = []
    const onEvent = vi.fn<(event: ApiSchemas['AdminEvent']) => void>()
    const stream = createAdminEventStream({
      topics: ['overview', 'system'],
      EventSourceImpl: FakeEventSource as unknown as typeof EventSource,
      onStatus: (status) => statuses.push(status),
      onEvent,
    })
    const source = stream.source as unknown as FakeEventSource

    expect(source.url).toContain('/api/admin/v1/events')
    expect(source.url).toContain('topic=overview')
    expect(source.url).toContain('topic=system')
    expect(source.withCredentials).toBe(true)

    source.onopen?.()
    source.listeners.get('overview.updated')?.(
      new MessageEvent('overview.updated', {
        data: JSON.stringify({
          event_id: 'evt-1',
          event: 'overview.updated',
          occurred_at: '2026-07-28T05:00:00Z',
          resource: { type: 'overview', id: null, version: 2 },
          reason: 'aggregate_changed',
        }),
      }),
    )

    expect(statuses).toEqual(['connecting', 'connected'])
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ event: 'overview.updated' }))

    stream.close()
    expect(source.closed).toBe(true)
  })
})
