import { api, createIdempotencyKey, ifMatch, unwrap } from './client'
import type {
  AIParseStatus,
  BulkJoinDecisionRequest,
  BulkJoinDecisionResult,
  JoinDecisionList,
  JoinDecisionRequest,
  JoinDecisionResult,
  JoinDecisionSource,
  JoinDecisionStatus,
  JoinRequest,
  JoinRequestList,
  JoinRequestPolicy,
  JoinRequestPolicyPatch,
} from './types'

export type JoinRequestListQuery = {
  groupId: string
  decisionStatus: JoinDecisionStatus[]
  observedStatus: 'pending' | 'checked' | ''
  aiParseStatus: AIParseStatus | ''
  subType: 'add' | 'invite' | ''
  source: 'event' | 'system' | ''
  decisionSource: JoinDecisionSource | ''
  requestedFrom: string
  requestedTo: string
  overdue: boolean | null
  query: string
  sort: 'requested_at_desc' | 'requested_at_asc'
  cursor: string | null
  limit?: number
}

export const joinRequestsApi = {
  async list(query: JoinRequestListQuery): Promise<JoinRequestList> {
    return unwrap(
      await api.GET('/join-requests', {
        params: {
          query: {
            group_id: query.groupId || undefined,
            decision_status: query.decisionStatus.length ? query.decisionStatus : undefined,
            observed_status: query.observedStatus || undefined,
            ai_parse_status: query.aiParseStatus || undefined,
            sub_type: query.subType || undefined,
            source: query.source || undefined,
            decision_source: query.decisionSource || undefined,
            requested_from: query.requestedFrom || undefined,
            requested_to: query.requestedTo || undefined,
            overdue: query.overdue ?? undefined,
            query: query.query || undefined,
            sort: query.sort,
            cursor: query.cursor ?? undefined,
            limit: query.limit ?? 30,
          },
        },
      }),
    )
  },

  async get(requestId: string): Promise<JoinRequest> {
    return unwrap(
      await api.GET('/join-requests/{request_id}', {
        params: { path: { request_id: requestId } },
      }),
    )
  },

  async listDecisions(requestId: string, cursor: string | null = null): Promise<JoinDecisionList> {
    return unwrap(
      await api.GET('/join-requests/{request_id}/decisions', {
        params: {
          path: { request_id: requestId },
          query: { cursor: cursor ?? undefined, limit: 30 },
        },
      }),
    )
  },

  async decide(
    requestId: string,
    payload: JoinDecisionRequest,
    version: number,
  ): Promise<JoinDecisionResult> {
    return unwrap(
      await api.POST('/join-requests/{request_id}/decisions', {
        params: {
          path: { request_id: requestId },
          header: {
            'If-Match': ifMatch(version),
            'Idempotency-Key': createIdempotencyKey(),
          },
        },
        body: payload,
      }),
    )
  },

  async bulkDecide(payload: BulkJoinDecisionRequest): Promise<BulkJoinDecisionResult> {
    return unwrap(
      await api.POST('/join-requests/bulk-decisions', {
        params: { header: { 'Idempotency-Key': createIdempotencyKey() } },
        body: payload,
      }),
    )
  },

  async getPolicy(groupId: string): Promise<JoinRequestPolicy> {
    return unwrap(
      await api.GET('/groups/{group_id}/join-request-policy', {
        params: { path: { group_id: groupId } },
      }),
    )
  },

  async updatePolicy(
    groupId: string,
    payload: JoinRequestPolicyPatch,
    version: number,
  ): Promise<JoinRequestPolicy> {
    return unwrap(
      await api.PATCH('/groups/{group_id}/join-request-policy', {
        params: {
          path: { group_id: groupId },
          header: { 'If-Match': ifMatch(version) },
        },
        body: payload,
      }),
    )
  },
}
