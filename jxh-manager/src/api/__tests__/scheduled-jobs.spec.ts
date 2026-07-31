import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/api/client'
import { scheduledJobsApi } from '@/api/scheduled-jobs'
import { makeScheduledJob, makeScheduledJobRun } from '@/test/scheduled-job-fixture'

describe('scheduledJobsApi mutation boundaries', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uses If-Match when updating a task', async () => {
    const job = makeScheduledJob()
    const patch = vi.spyOn(api, 'PATCH').mockResolvedValue({ data: job, response: new Response('{}', { status: 200 }) })

    await scheduledJobsApi.update('job-1', { name: '新的名称' }, 7)

    expect(patch).toHaveBeenCalledWith('/scheduled-jobs/{job_id}', expect.objectContaining({
      params: { path: { job_id: 'job-1' }, header: { 'If-Match': '"7"' } },
    }))
  })

  it('uses version and one idempotency key for a test send', async () => {
    const run = makeScheduledJobRun({ kind: 'test' })
    const post = vi.spyOn(api, 'POST').mockResolvedValue({ data: run, response: new Response('{}', { status: 200 }) })

    await scheduledJobsApi.testSend('job-1', 7)

    expect(post).toHaveBeenCalledWith('/scheduled-jobs/{job_id}/test-send', {
      params: { path: { job_id: 'job-1' }, header: {
        'If-Match': '"7"', 'Idempotency-Key': expect.stringMatching(/^[A-Za-z0-9._:-]+$/),
      } },
    })
  })
})
