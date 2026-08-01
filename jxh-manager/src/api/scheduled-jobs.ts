import { api, createIdempotencyKey, ifMatch, unwrap } from './client'
import type {
  RunResult,
  ScheduledJob,
  ScheduledJobCreateRequest,
  ScheduledJobList,
  ScheduledJobPatchRequest,
  ScheduledJobRun,
  ScheduledJobRunList,
  ScheduledJobStatus,
  ScheduledJobType,
} from './types'

export type ScheduledJobListQuery = {
  groupId: string
  type: ScheduledJobType | ''
  status: ScheduledJobStatus | ''
  runResult: RunResult | ''
  cursor: string | null
  limit?: number
}

export type ScheduledJobRunListQuery = {
  kind: 'scheduled' | 'test' | ''
  result: RunResult | ''
  from: string
  to: string
  cursor: string | null
  limit?: number
}

export const scheduledJobsApi = {
  async list(query: ScheduledJobListQuery): Promise<ScheduledJobList> {
    return unwrap(await api.GET('/scheduled-jobs', { params: { query: {
      group_id: query.groupId || undefined,
      type: query.type || undefined,
      status: query.status || undefined,
      run_result: query.runResult || undefined,
      cursor: query.cursor ?? undefined,
      limit: query.limit ?? 30,
    } } }))
  },

  async create(payload: ScheduledJobCreateRequest): Promise<ScheduledJob> {
    return unwrap(await api.POST('/scheduled-jobs', { body: payload }))
  },

  async get(jobId: string): Promise<ScheduledJob> {
    return unwrap(await api.GET('/scheduled-jobs/{job_id}', { params: { path: { job_id: jobId } } }))
  },

  async update(jobId: string, patch: ScheduledJobPatchRequest, version: number): Promise<ScheduledJob> {
    return unwrap(await api.PATCH('/scheduled-jobs/{job_id}', {
      params: { path: { job_id: jobId }, header: { 'If-Match': ifMatch(version) } },
      body: patch,
    }))
  },

  async delete(jobId: string, version: number): Promise<void> {
    return unwrap(await api.DELETE('/scheduled-jobs/{job_id}', {
      params: { path: { job_id: jobId }, header: { 'If-Match': ifMatch(version) } },
    }))
  },

  async testSend(jobId: string, version: number): Promise<ScheduledJobRun> {
    return unwrap(await api.POST('/scheduled-jobs/{job_id}/test-send', {
      params: { path: { job_id: jobId }, header: {
        'If-Match': ifMatch(version), 'Idempotency-Key': createIdempotencyKey(),
      } },
    }))
  },

  async listRuns(jobId: string, query: ScheduledJobRunListQuery): Promise<ScheduledJobRunList> {
    return unwrap(await api.GET('/scheduled-jobs/{job_id}/runs', { params: {
      path: { job_id: jobId },
      query: {
        kind: query.kind || undefined,
        result: query.result || undefined,
        from: query.from || undefined,
        to: query.to || undefined,
        cursor: query.cursor ?? undefined,
        limit: query.limit ?? 30,
      },
    } }))
  },
}
