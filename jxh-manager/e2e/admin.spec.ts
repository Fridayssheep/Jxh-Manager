import { expect, test, type Page, type TestInfo } from '@playwright/test'

import { installAdminApi, type RecordedAdminRequest } from './fixtures/admin-api'

function expectCsrf(request: RecordedAdminRequest): void {
  expect(request.headers['x-csrf-token']).toBe('csrf-token-with-at-least-thirty-two-characters')
}

function expectIdempotencyKey(request: RecordedAdminRequest): void {
  expect(request.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const sizes = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth)
}

async function expectNamedControls(page: Page): Promise<void> {
  const unnamedControls = await page
    .locator('button:visible, a[href]:visible, input:visible, select:visible, textarea:visible')
    .evaluateAll((elements) => elements.flatMap((element) => {
      const control = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      const hasLabel = Array.from(control.labels ?? []).some((label) => label.textContent?.trim())
      const hasName = Boolean(
        element.textContent?.trim()
        || element.getAttribute('aria-label')
        || element.getAttribute('title')
        || element.getAttribute('alt')
        || ('value' in control && control.value)
        || hasLabel,
      )
      return hasName ? [] : [element.outerHTML.slice(0, 180)]
    }))

  expect(unnamedControls).toEqual([])
}

async function expectResponsiveShell(page: Page, projectName: string): Promise<void> {
  if (projectName === 'chromium') {
    await expect(page.locator('[data-test="app-sidebar"]')).toHaveCSS('width', '224px')
    await expect(page.getByAltText('精小弘')).toBeVisible()
    return
  }

  if (projectName === 'chromium-tablet') {
    await expect(page.locator('[data-test="app-sidebar"]')).toHaveCSS('width', '64px')
    await expect(page.getByAltText('精小弘')).toBeVisible()
    return
  }

  await page.getByRole('button', { name: '打开导航' }).click()
  const sidebar = page.locator('[data-test="app-sidebar"]')
  await expect(sidebar).toBeVisible()
  await expect(sidebar.getByAltText('精小弘')).toBeVisible()
  await page.getByRole('button', { name: '关闭导航' }).click()
  await expect(sidebar).toBeHidden()
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

test.describe('管理端核心流程', { tag: '@desktop' }, () => {
  test('keeps the navigation highlight aligned after route layout settles', async ({ page }) => {
    await installAdminApi(page)
    await page.setViewportSize({ width: 1339, height: 662 })
    await page.goto('/knowledge')
    await expect(page.locator('[data-test="reload-knowledge"]')).toBeVisible()

    await page.locator('.navigation-item[href="/audit-logs"]').click()
    await expect(page.locator('[data-test="audit-row-audit-1"]')).toBeVisible()

    await expect
      .poll(() =>
        page.evaluate(() => {
          const activeRect = document
            .querySelector('.navigation-item.router-link-active')
            ?.getBoundingClientRect()
          const highlightRect = document
            .querySelector('[data-test="navigation-highlight"]')
            ?.getBoundingClientRect()
          if (!activeRect || !highlightRect) return false
          return (
            Math.abs(activeRect.top - highlightRect.top) < 0.5 &&
            Math.abs(activeRect.height - highlightRect.height) < 0.5
          )
        }),
      )
      .toBe(true)
  })

  test('登录后进入总览且 CSRF 只保留在内存', async ({ page }) => {
    const api = await installAdminApi(page, { authenticated: false })
    await page.goto('/')
    await expect(page).toHaveURL(/\/login\?redirect=/)
    api.consoleErrors.length = 0

    await page.getByLabel('账号').fill('root')
    await page.getByLabel('密码').fill('correct-password')
    await page.getByRole('button', { name: '登录' }).click()

    await expect(page.getByRole('heading', { name: '总览' })).toBeVisible()
    const login = api.findRequest('POST', '/auth/login')
    expect(login?.body).toEqual({ username: 'root', password: 'correct-password' })
    const persistedValues = await page.evaluate(() => [
      ...Object.values(localStorage),
      ...Object.values(sessionStorage),
    ])
    expect(persistedValues).not.toContain('csrf-token-with-at-least-thirty-two-characters')
    expect(api.consoleErrors).toEqual([])
  })

  test('总览同时呈现待处理和系统健康', async ({ page }) => {
    const api = await installAdminApi(page)
    await page.goto('/')

    await expect(page.getByRole('heading', { name: '总览' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '需要处理' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '系统健康' })).toBeVisible()
    await expect(page.getByText('等待处理的入群申请')).toBeVisible()
    expect(api.consoleErrors).toEqual([])
  })

  test('群级设置保存携带加载版本', async ({ page }) => {
    const api = await installAdminApi(page)
    await page.goto('/groups/10001')
    await expect(page.getByRole('heading', { name: '精弘网络维护群' })).toBeVisible()

    await page.locator('[data-test="feature-ai_qa-inherit"]').click()
    await page.locator('[data-test="save-settings"]').click()
    await expect(page.getByText('设置已更新')).toBeVisible()

    const request = api.findRequest('PATCH', '/groups/10001/settings')!
    expectCsrf(request)
    expect(request.headers['if-match']).toBe('"3"')
    expect(request.body).toMatchObject({ features: { ai_qa: null } })
  })

  test('入群批准携带资源版本和幂等键', async ({ page }) => {
    const api = await installAdminApi(page)
    await page.goto('/join-requests')
    await page.locator('[data-test="request-row-flag-10001"]').click()
    await expect(page.getByLabel('申请详情').getByText('计算机科学与技术', { exact: true })).toBeVisible()

    await page.locator('[data-test="approve-request"]').click()
    await page.locator('[data-test="decision-reason"]').fill('信息完整')
    await page.locator('[data-test="confirm-decision"]').click()
    await expect(page.getByText('已确认批准')).toBeVisible()

    const request = api.findRequest('POST', '/join-requests/flag-10001/decisions')!
    expectCsrf(request); expectIdempotencyKey(request)
    expect(request.headers['if-match']).toBe('"7"')
    expect(request.body).toEqual({ action: 'approve', reason: '信息完整' })
  })

  test('命令草稿验证只调用无副作用端点', async ({ page }) => {
    const api = await installAdminApi(page)
    await page.goto('/commands/new')
    await page.locator('[data-test="command-name"]').fill('/welcome')
    await page.locator('[data-test="command-display-name"]').fill('欢迎成员')
    await page.locator('[data-test="command-description"]').fill('发送欢迎文本')
    await page.locator('[data-test="add-reply-action"]').click()
    await page.locator('[data-test="reply-template-0"]').fill('欢迎加入本群')
    await page.locator('[data-test="sample-group"]').fill('10001')
    await page.locator('[data-test="sample-sender"]').fill('24680135')
    await page.locator('[data-test="sample-message"]').fill('/welcome')
    await page.locator('[data-test="validate-draft"]').first().click()

    await expect(page.getByText('验证完成，未执行任何 NapCat 外部动作。')).toBeVisible()
    const request = api.findRequest('POST', '/commands/validate')!
    expectCsrf(request)
    expect(request.body).toMatchObject({ definition: { name: '/welcome', actions: [{ type: 'reply_text', template: '欢迎加入本群' }] } })
    expect(api.requests.filter((item) => item.method !== 'GET' && item.path !== '/commands/validate')).toEqual([])
  })

  test('定时任务测试发送携带版本和幂等键', async ({ page }) => {
    const api = await installAdminApi(page)
    await page.goto('/scheduled-jobs')
    await page.locator('[data-test="test-send-job-1"]').click()
    await page.locator('[data-test="confirm-test-send"]').click()
    await expect(page.getByText(/测试发送成功/)).toBeVisible()

    const request = api.findRequest('POST', '/scheduled-jobs/job-1/test-send')!
    expectCsrf(request); expectIdempotencyKey(request)
    expect(request.headers['if-match']).toBe('"7"')
  })

  test('编辑定时任务使用详情版本提交更新', async ({ page }) => {
    const api = await installAdminApi(page)
    await page.goto('/scheduled-jobs')
    await page.locator('[data-test="edit-job-job-1"]').click()

    await expect(page.getByRole('heading', { name: '编辑任务' })).toBeVisible()
    await expect(page.locator('[data-test="job-name"]')).toHaveValue('详情中的每日提醒')
    await page.locator('[data-test="job-name"]').fill('更新后的每日提醒')
    await page.locator('[data-test="save-job"]').click()
    await expect(page.getByText('更新后的每日提醒 已保存，版本 13。')).toBeVisible()

    expect(api.findRequest('GET', '/scheduled-jobs/job-1')).toBeDefined()
    const request = api.findRequest('PATCH', '/scheduled-jobs/job-1')!
    expectCsrf(request)
    expect(request.headers['if-match']).toBe('"12"')
    expect(request.body).toMatchObject({ name: '更新后的每日提醒' })
  })

  test('知识库重载显示已受理操作并携带幂等键', async ({ page }) => {
    const api = await installAdminApi(page)
    await page.goto('/knowledge')
    await page.locator('[data-test="reload-knowledge"]').click()
    await page.locator('[data-test="confirm-reload"]').click()

    const operation = page.locator('.reload-operation')
    await expect(operation.getByText('reload-1', { exact: true })).toBeVisible()
    await expect(operation).toContainText('重载操作 · 已接受')
    const request = api.findRequest('POST', '/knowledge/reload')!
    expectCsrf(request); expectIdempotencyKey(request)
  })

  test('统计导出使用当前筛选并生成下载', async ({ page }) => {
    const api = await installAdminApi(page)
    await page.goto('/analytics?from=2026-07-01T00:00:00Z&to=2026-07-28T00:00:00Z&group_id=10001&metric=group_message_count&result=success&dimension=group')
    await expect(page.getByText('12,840')).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-test="export-analytics"]').click(),
    ])
    expect(download.suggestedFilename()).toBe('analytics.csv')
    const request = api.findRequest('GET', '/analytics/export')!
    expect(request.url).toContain('group_id=10001')
    expect(request.url).toContain('metric=group_message_count')
  })

  test('撤销单个会话必须确认并携带幂等键', async ({ page }) => {
    const api = await installAdminApi(page)
    await page.goto('/users')
    await page.locator('[data-test="sessions-tab"]').click()
    await page.locator('[data-test="revoke-session-session-2"]').click()
    await page.locator('[data-test="confirm-user-action"]').click()
    await expect(page.getByText('会话已撤销。')).toBeVisible()

    const request = api.findRequest('POST', '/sessions/session-2/revoke')!
    expectCsrf(request); expectIdempotencyKey(request)
  })

  test('编辑管理账号使用详情版本提交更新', async ({ page }) => {
    const api = await installAdminApi(page)
    await page.goto('/users')
    await page.locator('[data-test="edit-user-user-2"]').click()

    await expect(page.getByRole('heading', { name: '编辑管理账号' })).toBeVisible()
    await expect(page.locator('[data-test="user-display-name"]')).toHaveValue('详情维护员')
    await page.locator('[data-test="user-display-name"]').fill('更新后的详情维护员')
    await page.locator('[data-test="save-user"]').click()
    await expect(page.getByText('更新后的详情维护员 已保存，版本 10。')).toBeVisible()

    expect(api.findRequest('GET', '/users/user-2')).toBeDefined()
    const request = api.findRequest('PATCH', '/users/user-2')!
    expectCsrf(request)
    expect(request.headers['if-match']).toBe('"9"')
    expect(request.body).toMatchObject({ display_name: '更新后的详情维护员' })
  })

  test('Bot 配置文件保存携带资源版本和 CSRF', async ({ page }) => {
    const api = await installAdminApi(page)
    await page.goto('/system')

    const editor = page.locator('[data-test="config-yaml"]')
    await expect(editor).toHaveValue(/timezone: "Asia\/Shanghai"/)
    await editor.fill('app:\n  timezone: "Asia/Tokyo"\n')
    await page.locator('[data-test="save-configuration"]').click()
    await expect(page.getByText('配置文件已保存，重启 Bot 后生效。')).toBeVisible()

    const request = api.findRequest('PATCH', '/system/configuration')!
    expectCsrf(request)
    expect(request.headers['if-match']).toBe('"7"')
    expect(request.body).toEqual({ yaml: 'app:\n  timezone: "Asia/Tokyo"\n' })
    await expect(page.getByText('版本 8')).toBeVisible()
    expect(api.consoleErrors).toEqual([])
  })

  test('NapCat 仅接受小写 restart 并提交受控重启', async ({ page }) => {
    const api = await installAdminApi(page)
    await page.goto('/system')
    await page.locator('[data-test="restart-napcat"]').click()
    await page.locator('[data-test="restart-confirmation"]').fill('RESTART')
    await expect(page.locator('[data-test="confirm-restart"]')).toBeDisabled()
    await page.locator('[data-test="restart-confirmation"]').fill('restart')
    await page.locator('[data-test="restart-reason"]').fill('维护窗口')
    await page.locator('[data-test="confirm-restart"]').click()

    await expect(page.getByText('重启请求已受理，系统会通过实时事件更新后续状态。')).toBeVisible()
    const request = api.findRequest('POST', '/system/napcat/restart')!
    expectCsrf(request); expectIdempotencyKey(request)
    expect(request.body).toEqual({ confirmation: 'restart', reason: '维护窗口' })
  })
})

test('应用壳和关键页面适配当前 viewport', async ({ page }, testInfo) => {
  const api = await installAdminApi(page)
  await page.goto('/')
  await expect(page.locator('.vue-devtools__anchor')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '总览' })).toBeVisible()
  await expect(page.locator('[data-test="app-topbar"]')).toHaveCSS('height', '52px')
  const trendChart = page.getByRole('img', { name: '最近趋势' })
  await expect(trendChart).toBeVisible()
  expect(await trendChart.locator('polyline').count()).toBeGreaterThan(0)
  await expectResponsiveShell(page, testInfo.project.name)
  await expectNoHorizontalOverflow(page)
  await attachScreenshot(page, testInfo, `overview-${testInfo.project.name}`)

  const routes = [
    { path: '/', heading: '总览', ready: 'main' },
    { path: '/groups', heading: '群与设置', ready: '[data-test="group-filters"]' },
    { path: '/settings', heading: '群与设置', ready: '[data-test="save-settings"]' },
    { path: '/groups/10001', heading: '精弘网络维护群', ready: '[data-test="save-settings"]' },
    { path: '/join-requests', heading: '入群审批', ready: '[data-test="request-row-flag-10001"]' },
    { path: '/commands', heading: '自定义命令', ready: '[data-test="command-filters"]' },
    { path: '/commands/new', heading: '新建自定义命令', ready: '[data-test="command-name"]' },
    { path: '/scheduled-jobs', heading: '定时任务', ready: '[data-test="test-send-job-1"]' },
    { path: '/knowledge', heading: '知识库', ready: '[data-test="reload-knowledge"]' },
    { path: '/analytics', heading: '统计分析', ready: '[data-test="analytics-filters"]' },
    { path: '/audit-logs', heading: '审计日志', ready: '[data-test="audit-row-audit-1"]' },
    { path: '/users', heading: '账号与会话', ready: '[data-test="user-filters"]' },
    { path: '/account', heading: '个人账号', ready: '[data-test="change-password"]' },
    { path: '/system', heading: '系统设置', ready: '[data-test="restart-napcat"]' },
  ]

  for (const route of routes) {
    await page.goto(route.path)
    await expect(page.getByRole('heading', { name: route.heading, exact: true })).toBeVisible()
    await expect(page.locator(route.ready)).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await expectNamedControls(page)
  }

  await page.goto('/audit-logs')
  await page.locator('[data-test="audit-row-audit-1"]').click()
  await expect(page.getByLabel('审计详情')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await expectNamedControls(page)
  await page.getByRole('button', { name: '关闭详情' }).click()

  await page.goto('/system')
  await page.locator('[data-test="restart-napcat"]').click()
  await expect(page.getByRole('alertdialog', { name: '重启 NapCat' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await expectNamedControls(page)
  await page.getByRole('alertdialog').getByRole('button', { name: '取消' }).click()

  expect(api.consoleErrors).toEqual([])
  await attachScreenshot(page, testInfo, `system-${testInfo.project.name}`)
})
