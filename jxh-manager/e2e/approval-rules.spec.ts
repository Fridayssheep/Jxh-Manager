import { expect, test } from '@playwright/test'

const now = '2026-08-07T00:00:00Z'

test('审批规则页展示证据、名单和响应式布局', async ({ page }) => {
  let sampleQuery = ''
  await page.route('**/api/admin/v1/auth/me', (route) => route.fulfill({
    json: {
      user: { user_id: 'usr_test', username: 'admin', display_name: '管理员', role: 'super_admin', qq_user_id: null, enabled: true, last_login_at: now, created_at: now, updated_at: now, version: 1 },
      session: { session_id: 'ses_test', user_id: 'usr_test', status: 'active', current: true, ip_address: '127.0.0.1', user_agent: 'playwright', created_at: now, last_seen_at: now, expires_at: '2026-08-08T00:00:00Z', revoked_at: null },
      permissions: ['join_requests:read', 'join_policies:write'],
      csrf_token: 'csrf_test',
    },
  }))
  await page.route('**/api/admin/v1/join-request-evidence/major-codes', (route) => route.fulfill({
    json: {
      rule_state: { rule_version: 2, status: 'ready', evidence_version: 5, activated_at: now, rebuilt_at: now, version: 2 },
      rule: { student_id_length: 12, enrollment_year_offset: 2, enrollment_year_length: 4, major_code_offset: 6, major_code_length: 3, current_year: '2026', minimum_samples: 3 },
      items: [{ enrollment_year: '2026', major_code: '315', total_samples: 4, major_counts: [{ major: '计算机类', count: 4 }] }],
    },
  }))
  await page.route('**/api/admin/v1/join-request-evidence/samples**', (route) => {
    sampleQuery = new URL(route.request().url()).search
    return route.fulfill({ json: { items: [], has_more: false, total_count: 0 } })
  })
  await page.route('**/api/admin/v1/admission-roster/status', (route) => route.fulfill({
    json: { configured: false, dataset_version: null, file_name: null, row_count: 0, activated_at: null },
  }))
  await page.route('**/api/admin/v1/events**', (route) => route.abort())

  // Reach the page the way a user does, so a missing or misgated sidebar entry fails here
  // rather than staying invisible behind a direct URL visit.
  await page.goto('/')
  // On mobile viewports the nav is collapsed into a drawer, so open it first.
  const navToggle = page.getByRole('button', { name: '打开导航' })
  if (await navToggle.isVisible()) {
    await navToggle.click()
  }
  const navigationLink = page.getByRole('link', { name: '审批规则与证据' })
  await expect(navigationLink).toBeVisible()
  await navigationLink.click()
  await expect(page).toHaveURL(/\/join-request-rules$/)
  await expect(page.getByRole('heading', { name: '审批规则与证据' })).toBeVisible()
  await expect(page.getByText('12 位数字')).toBeVisible()
  await expect(page.getByText('计算机类 4')).toBeVisible()
  await expect(page.getByText('未配置', { exact: true })).toBeVisible()

  await page.locator('tbody tr[tabindex="0"]').press('Enter')
  await expect.poll(() => sampleQuery).toContain('enrollment_year=2026')
  await expect.poll(() => sampleQuery).toContain('major_code=315')

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(hasHorizontalOverflow).toBe(false)
})
