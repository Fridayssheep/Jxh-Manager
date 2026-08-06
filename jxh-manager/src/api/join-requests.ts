import { api, createIdempotencyKey, ifMatch, unwrap } from './client'
import type {
  AIParseStatus,
  AdmissionRosterStatus,
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
  MajorCodeEvidenceIndex,
  MajorCodeEvidenceRebuildResult,
  MajorCodeEvidenceSample,
  MajorCodeEvidenceSampleList,
  MajorCodeEvidenceSamplePatch,
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
  page: number
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
            page: query.page,
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

  async listEvidence(): Promise<MajorCodeEvidenceIndex> {
    return unwrap(await api.GET('/join-request-evidence/major-codes'))
  },

  async listEvidenceSamples(query: {
    enrollmentYear?: string
    majorCode?: string
    active?: boolean
    page?: number
    limit?: number
  } = {}): Promise<MajorCodeEvidenceSampleList> {
    return unwrap(
      await api.GET('/join-request-evidence/samples', {
        params: {
          query: {
            enrollment_year: query.enrollmentYear,
            major_code: query.majorCode,
            active: query.active,
            page: query.page ?? 1,
            limit: query.limit ?? 50,
          },
        },
      }),
    )
  },

  async updateEvidenceSample(
    sampleId: number,
    payload: MajorCodeEvidenceSamplePatch,
    version: number,
  ): Promise<MajorCodeEvidenceSample> {
    return unwrap(
      await api.PATCH('/join-request-evidence/samples/{sample_id}', {
        params: {
          path: { sample_id: sampleId },
          header: { 'If-Match': ifMatch(version) },
        },
        body: payload,
      }),
    )
  },

  async rebuildEvidence(): Promise<MajorCodeEvidenceRebuildResult> {
    return unwrap(
      await api.POST('/join-request-evidence/rebuild', {
        params: { header: { 'Idempotency-Key': createIdempotencyKey() } },
      }),
    )
  },

  async getAdmissionRosterStatus(): Promise<AdmissionRosterStatus> {
    return unwrap(await api.GET('/admission-roster/status'))
  },

  async importAdmissionRoster(file: File): Promise<AdmissionRosterStatus> {
    const form = new FormData()
    form.append('file', file)
    return unwrap(
      await api.POST('/admission-roster/import', {
        params: { header: { 'Idempotency-Key': createIdempotencyKey() } },
        body: form as never,
        bodySerializer: (body) => body as unknown as BodyInit,
      }),
    )
  },
}
