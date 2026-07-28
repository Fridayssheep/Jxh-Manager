import { api, createIdempotencyKey, unwrap } from './client'
import type {
  KnowledgeConflictList,
  KnowledgeEntry,
  KnowledgeEntryList,
  KnowledgeEntryType,
  KnowledgeReloadOperation,
  KnowledgeStatus,
} from './types'

export type KnowledgeEntryListQuery = {
  query: string
  category: string
  entryType: KnowledgeEntryType | ''
  enabled: boolean | null
  exactReply: boolean | null
  aiEnabled: boolean | null
  hasConflict: boolean | null
  cursor: string | null
  limit?: number
}

export type KnowledgeConflictListQuery = {
  query: string
  conflictType: 'source_key' | 'keyword' | 'alias' | ''
  cursor: string | null
  limit?: number
}

export const knowledgeApi = {
  async getStatus(): Promise<KnowledgeStatus> {
    return unwrap(await api.GET('/knowledge/status'))
  },

  async reload(): Promise<KnowledgeReloadOperation> {
    return unwrap(await api.POST('/knowledge/reload', {
      params: { header: { 'Idempotency-Key': createIdempotencyKey() } },
    }))
  },

  async listEntries(query: KnowledgeEntryListQuery): Promise<KnowledgeEntryList> {
    return unwrap(await api.GET('/knowledge/entries', { params: { query: {
      query: query.query || undefined,
      category: query.category || undefined,
      entry_type: query.entryType || undefined,
      enabled: query.enabled ?? undefined,
      exact_reply: query.exactReply ?? undefined,
      ai_enabled: query.aiEnabled ?? undefined,
      has_conflict: query.hasConflict ?? undefined,
      cursor: query.cursor ?? undefined,
      limit: query.limit ?? 30,
    } } }))
  },

  async getEntry(entryId: string): Promise<KnowledgeEntry> {
    return unwrap(await api.GET('/knowledge/entries/{entry_id}', {
      params: { path: { entry_id: entryId } },
    }))
  },

  async listConflicts(query: KnowledgeConflictListQuery): Promise<KnowledgeConflictList> {
    return unwrap(await api.GET('/knowledge/conflicts', { params: { query: {
      query: query.query || undefined,
      conflict_type: query.conflictType || undefined,
      cursor: query.cursor ?? undefined,
      limit: query.limit ?? 30,
    } } }))
  },
}
