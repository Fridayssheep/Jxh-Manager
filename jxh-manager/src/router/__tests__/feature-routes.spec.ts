import { describe, expect, it } from 'vitest'

import router from '../index'

describe('feature routes', () => {
  it('exposes scheduled jobs and knowledge with their read permissions', () => {
    const scheduledJobMatches = router.resolve('/scheduled-jobs').matched
    const knowledgeMatches = router.resolve('/knowledge').matched

    expect(scheduledJobMatches[scheduledJobMatches.length - 1]?.meta.permission).toBe(
      'scheduled_jobs:read',
    )
    expect(knowledgeMatches[knowledgeMatches.length - 1]?.meta.permission).toBe('knowledge:read')
  })
})
