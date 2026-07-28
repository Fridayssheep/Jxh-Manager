import { describe, expect, it } from 'vitest'

import router from '../index'

describe('feature routes', () => {
  it('exposes operations pages with their read permissions', () => {
    const scheduledJobMatches = router.resolve('/scheduled-jobs').matched
    const knowledgeMatches = router.resolve('/knowledge').matched
    const analyticsMatches = router.resolve('/analytics').matched
    const auditMatches = router.resolve('/audit-logs').matched
    const usersMatches = router.resolve('/users').matched
    const accountMatches = router.resolve('/account').matched

    expect(scheduledJobMatches[scheduledJobMatches.length - 1]?.meta.permission).toBe(
      'scheduled_jobs:read',
    )
    expect(knowledgeMatches[knowledgeMatches.length - 1]?.meta.permission).toBe('knowledge:read')
    expect(analyticsMatches[analyticsMatches.length - 1]?.meta.permission).toBe('analytics:read')
    expect(auditMatches[auditMatches.length - 1]?.meta.permission).toBe('audit:read')
    expect(usersMatches[usersMatches.length - 1]?.meta.permission).toBe('users:manage')
    expect(accountMatches[accountMatches.length - 1]?.meta.public).not.toBe(true)
  })
})
