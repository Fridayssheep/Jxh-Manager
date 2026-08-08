import { api, createIdempotencyKey, unwrap } from './client'
import type {
  KnowledgeConflictList,
  KnowledgeEntry,
  KnowledgeEntryList,
  KnowledgeReloadOperation,
  KnowledgeStatus,
} from './types'

export type KnowledgeEntryListQuery = {
  query: string
  page: number
  cursor: string | null
  limit?: number
}

export type KnowledgeConflictListQuery = {
  query: string
  conflictType: 'source_key' | 'keyword' | 'alias' | ''
  page: number
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
      page: query.page,
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
      page: query.page,
      cursor: query.cursor ?? undefined,
      limit: query.limit ?? 30,
    } } }))
  },
}
