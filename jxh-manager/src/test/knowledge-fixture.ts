import type { KnowledgeConflict, KnowledgeEntry, KnowledgeEntrySummary, KnowledgeStatus } from '@/api/types'

export function makeKnowledgeStatus(overrides: Partial<KnowledgeStatus> = {}): KnowledgeStatus {
  return {
    state: 'ready', source_configured: true, active_index_version: 'index-20260728-1',
    entry_count: 128, conflict_count: 2, last_attempt_at: '2026-07-28T05:00:00Z',
    last_success_at: '2026-07-28T05:00:00Z', last_error_code: null, current_operation: null,
    ...overrides,
  }
}

export function makeKnowledgeEntrySummary(overrides: Partial<KnowledgeEntrySummary> = {}): KnowledgeEntrySummary {
  return {
    entry_id: 'entry-1', title: '校园网报修', category: '网络服务', entry_type: 'hybrid',
    keywords: ['校园网', '报修'], aliases: ['网络故障'], enabled: true, exact_reply: true,
    ai_enabled: true, has_conflict: false, source_updated_at: '2026-07-28T04:00:00Z',
    indexed_at: '2026-07-28T05:00:00Z', ...overrides,
  }
}

export function makeKnowledgeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    ...makeKnowledgeEntrySummary(), source_key: 'wps-row-42', question: '校园网无法使用怎么办？',
    answer: '请先确认设备已完成认证，再通过报修入口提交故障信息。', ...overrides,
  }
}

export function makeKnowledgeConflict(overrides: Partial<KnowledgeConflict> = {}): KnowledgeConflict {
  return {
    conflict_id: 'conflict-1', type: 'keyword', key: '报修', entry_ids: ['entry-1', 'entry-2'],
    detected_at: '2026-07-28T05:00:00Z', ...overrides,
  }
}
