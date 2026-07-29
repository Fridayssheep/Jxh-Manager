# Jxh Manager Analytics Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 15-card analytics wall with four operational KPIs, three compact metric groups, scoped filters, and overview-style trend/ranking cards.

**Architecture:** Add a focused `AnalyticsMetricBoard` that owns metric-key lookup, grouping, formatting, and the derived automatic-approval share. Keep route state, API loading, export, and analysis controls in `AnalyticsView`, but split summary and analysis request lifecycles so local controls do not reload the summary. Reuse the existing design tokens and chart/ranking components without changing the API contract.

**Tech Stack:** Vue 3, TypeScript, Vue Router, Vitest, Vue Test Utils, Playwright, existing OpenAPI client and CSS design tokens

---

### Task 1: Build the operational metric board

**Files:**
- Create: `jxh-manager/src/components/data/AnalyticsMetricBoard.vue`
- Create: `jxh-manager/src/components/data/__tests__/AnalyticsMetricBoard.spec.ts`
- Modify: `jxh-manager/src/test/analytics-fixture.ts`

- [ ] **Step 1: Expand the analytics summary fixture to all 15 API metrics**

Replace the two-item `metrics` array in `makeAnalyticsSummary()` with values for every `AnalyticsMetricKey`. Use stable values including:

```ts
{ key: 'keyword_reply_count', label: '关键词回复', unit: 'count', available: true, value: 820, previous_value: 760, change_percent: 7.9 },
{ key: 'ai_request_count', label: 'AI 请求', unit: 'count', available: true, value: 3280, previous_value: 3000, change_percent: 9.3 },
{ key: 'ai_success_rate', label: 'AI 成功率', unit: 'percent', available: true, value: 96.4, previous_value: 95.1, change_percent: 1.4 },
{ key: 'ai_duration_ms', label: 'AI 平均耗时', unit: 'milliseconds', available: true, value: 820, previous_value: 860, change_percent: -4.7 },
{ key: 'join_request_count', label: '入群申请', unit: 'count', available: true, value: 428, previous_value: 420, change_percent: 1.9 },
{ key: 'manual_approval_count', label: '人工审批', unit: 'count', available: true, value: 120, previous_value: 132, change_percent: -9.1 },
{ key: 'automatic_approval_count', label: '自动审批', unit: 'count', available: true, value: 308, previous_value: 288, change_percent: 6.9 },
{ key: 'scheduled_job_run_count', label: '定时任务运行', unit: 'count', available: true, value: 86, previous_value: 82, change_percent: 4.9 },
{ key: 'group_message_count', label: '群消息量', unit: 'count', available: true, value: 12840, previous_value: 11900, change_percent: 7.9 },
{ key: 'command_run_count', label: '命令运行', unit: 'count', available: true, value: 1460, previous_value: 1340, change_percent: 9 },
{ key: 'active_user_count', label: '活跃用户', unit: 'count', available: true, value: 2146, previous_value: 2060, change_percent: 4.2 },
{ key: 'link_clean_count', label: '链接净化', unit: 'count', available: true, value: 842, previous_value: 800, change_percent: 5.3 },
{ key: 'quote_success_count', label: '引用成功', unit: 'count', available: true, value: 612, previous_value: 600, change_percent: 2 },
{ key: 'quote_fallback_count', label: '引用回退', unit: 'count', available: true, value: 24, previous_value: 30, change_percent: -20 },
{ key: 'quote_failure_count', label: '引用失败', unit: 'count', available: true, value: 8, previous_value: 10, change_percent: -20 },
```

- [ ] **Step 2: Write failing component tests**

Create `AnalyticsMetricBoard.spec.ts` with these assertions:

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { makeAnalyticsSummary } from '@/test/analytics-fixture'
import AnalyticsMetricBoard from '../AnalyticsMetricBoard.vue'

describe('AnalyticsMetricBoard', () => {
  it('shows four operational KPIs and groups every remaining raw metric once', () => {
    const metrics = [...makeAnalyticsSummary().metrics].reverse()
    const wrapper = mount(AnalyticsMetricBoard, { props: { metrics } })

    expect(wrapper.findAll('[data-test^="analytics-kpi-"]')).toHaveLength(4)
    expect(wrapper.get('[data-test="analytics-kpi-group_message_count"]').text()).toContain('12,840')
    expect(wrapper.get('[data-test="analytics-kpi-active_user_count"]').text()).toContain('2,146')
    expect(wrapper.get('[data-test="analytics-kpi-ai_success_rate"]').text()).toContain('96.4%')
    expect(wrapper.get('[data-test="analytics-kpi-automatic_approval_share"]').text()).toContain('72%')
    expect(wrapper.get('[data-test="analytics-kpi-automatic_approval_share"]').text()).toContain('308 自动 / 120 人工')
    expect(wrapper.findAll('[data-test^="analytics-metric-row-"]')).toHaveLength(12)
    expect(wrapper.findAll('[data-test="analytics-metric-group"]')).toHaveLength(3)
  })

  it('does not invent an automatic approval share without a valid denominator', () => {
    const metrics = makeAnalyticsSummary().metrics.map((metric) =>
      metric.key === 'automatic_approval_count' || metric.key === 'manual_approval_count'
        ? { ...metric, value: 0 }
        : metric,
    )
    const wrapper = mount(AnalyticsMetricBoard, { props: { metrics } })

    expect(wrapper.get('[data-test="analytics-kpi-automatic_approval_share"]').text()).toContain('—')
  })
})
```

- [ ] **Step 3: Run the component test and verify RED**

Run:

```bash
cd jxh-manager
npm run test:unit -- src/components/data/__tests__/AnalyticsMetricBoard.spec.ts --run
```

Expected: FAIL because `AnalyticsMetricBoard.vue` does not exist.

- [ ] **Step 4: Implement `AnalyticsMetricBoard.vue`**

Define immutable group metadata for the 12 non-core keys and derive values by key rather than array order:

```ts
const metricMap = computed(() => new Map(props.metrics.map((metric) => [metric.key, metric])))
const metricGroups = [
  { key: 'engagement', label: '互动触达', metrics: ['keyword_reply_count', 'ai_request_count', 'command_run_count', 'link_clean_count'] },
  { key: 'automation', label: '审批自动化', metrics: ['join_request_count', 'automatic_approval_count', 'manual_approval_count', 'scheduled_job_run_count'] },
  { key: 'quality', label: '服务质量', metrics: ['ai_duration_ms', 'quote_success_count', 'quote_fallback_count', 'quote_failure_count'] },
] as const
```

Calculate the derived share only when both source metrics are available, non-null, and their sum is greater than zero:

```ts
const approvalShare = computed(() => {
  const automatic = metricMap.value.get('automatic_approval_count')
  const manual = metricMap.value.get('manual_approval_count')
  const available = Boolean(
    automatic?.available && manual?.available && automatic.value !== null && manual.value !== null,
  )
  const total = available ? automatic!.value! + manual!.value! : 0
  return {
    available: available && total > 0,
    value: total > 0 ? (automatic!.value! / total) * 100 : null,
    detail: available ? `${numberFormatter.format(automatic!.value!)} 自动 / ${numberFormatter.format(manual!.value!)} 人工` : '暂不可用',
  }
})
```

Render four `.analytics-kpi` articles and three `.analytics-metric-group` articles. Apply the same geometry as the overview cards:

```css
.analytics-kpi,
.analytics-metric-group {
  min-width: 0;
  padding: var(--space-card);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}
```

Use a three-pixel semantic accent only on the four KPI cards. Group rows use internal dividers, not nested cards. Add `@media (max-width: 900px)` for two KPI columns and `@media (max-width: 520px)` for one column; use `repeat(auto-fit, minmax(240px, 1fr))` for groups.

- [ ] **Step 5: Run the component test and verify GREEN**

Run the command from Step 3.

Expected: 1 file and 2 tests pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add jxh-manager/src/components/data/AnalyticsMetricBoard.vue jxh-manager/src/components/data/__tests__/AnalyticsMetricBoard.spec.ts jxh-manager/src/test/analytics-fixture.ts
git commit -m "feat: add grouped analytics metric board"
```

### Task 2: Split global scope from local analysis controls

**Files:**
- Modify: `jxh-manager/src/views/analytics/AnalyticsView.vue`
- Modify: `jxh-manager/src/views/analytics/__tests__/AnalyticsView.spec.ts`

- [ ] **Step 1: Write failing view tests for request scope**

Add a test that records initial calls, changes the local metric, and verifies that only analysis endpoints reload:

```ts
it('keeps local analysis controls out of the summary request lifecycle', async () => {
  const summaryRequest = vi.mocked(analyticsApi.getSummary)
  const timeseriesRequest = vi.mocked(analyticsApi.getTimeseries)
  const rankingsRequest = vi.mocked(analyticsApi.getRankings)
  const { wrapper, router } = await mountView()
  await flushPromises()

  expect(summaryRequest).toHaveBeenCalledTimes(1)
  await wrapper.get('select[name=metric]').setValue('quote_failure_count')
  await flushPromises()

  expect(router.currentRoute.value.query.metric).toBe('quote_failure_count')
  expect(summaryRequest).toHaveBeenCalledTimes(1)
  expect(timeseriesRequest).toHaveBeenCalledTimes(2)
  expect(rankingsRequest).toHaveBeenCalledTimes(2)
})
```

Extend the existing URL test to change `group_id`, submit `[data-test=analytics-filters]`, and expect `getSummary` to be called a second time.

- [ ] **Step 2: Run the view tests and verify RED**

Run:

```bash
cd jxh-manager
npm run test:unit -- src/views/analytics/__tests__/AnalyticsView.spec.ts --run
```

Expected: FAIL because the current route watcher reloads summary for every metric change and the local selector is still in the global form.

- [ ] **Step 3: Split loading, errors, and request generations**

Replace `loading` and `error` with:

```ts
const summaryLoading = ref(false)
const analysisLoading = ref(false)
const summaryError = ref<unknown>(null)
const analysisError = ref<unknown>(null)
let summaryRequestId = 0
let analysisRequestId = 0
```

Implement independent loaders with stale-response protection:

```ts
async function loadSummary(): Promise<void> {
  const requestId = ++summaryRequestId
  summaryLoading.value = true
  summaryError.value = null
  try {
    const nextSummary = await analyticsApi.getSummary(commonQuery.value)
    if (requestId === summaryRequestId) summary.value = nextSummary
  } catch (reason) {
    if (requestId === summaryRequestId) summaryError.value = reason
  } finally {
    if (requestId === summaryRequestId) summaryLoading.value = false
  }
}

async function loadAnalysis(): Promise<void> {
  const requestId = ++analysisRequestId
  analysisLoading.value = true
  analysisError.value = null
  try {
    const [nextTimeseries, nextRankings] = await Promise.all([
      analyticsApi.getTimeseries({ ...commonQuery.value, granularity: filter.granularity, metrics: [filter.metric] }),
      analyticsApi.getRankings({ ...commonQuery.value, dimension: filter.dimension, metric: filter.metric, limit: 10 }),
    ])
    if (requestId === analysisRequestId) {
      timeseries.value = nextTimeseries
      rankings.value = nextRankings
    }
  } catch (reason) {
    if (requestId === analysisRequestId) analysisError.value = reason
  } finally {
    if (requestId === analysisRequestId) analysisLoading.value = false
  }
}
```

Track a serialized common-query key in the route watcher. On first load or a changed common key, call both loaders; otherwise call only `loadAnalysis()`.

- [ ] **Step 4: Move controls to their correct scopes**

Keep only `from`, `to`, `group_id`, `feature_key`, and `result` in `[data-test=analytics-filters]`. Render metric and granularity selects in the trend header and dimension in the ranking header. Each local select uses `@change="applyFilters"` so URL state remains canonical.

Expand `metricOptions` to all 15 schema keys, using the same Chinese labels as the metric board. Keep `applyFilters()` writing all global and local values so deep links and exports retain the complete state.

- [ ] **Step 5: Update loading and error rendering**

Use `summaryLoading`/`summaryError` for the page-level `ResourceState`. Show stale summary warning only when `summaryError && summary`. Inside trend and ranking cards, render a stable `.analysis-state` for loading and errors; the retry button calls `loadAnalysis`. The footer shows “正在刷新” when either loading flag is true.

- [ ] **Step 6: Run the view tests and verify GREEN**

Run the command from Step 2.

Expected: all `AnalyticsView.spec.ts` tests pass.

- [ ] **Step 7: Commit Task 2**

```bash
git add jxh-manager/src/views/analytics/AnalyticsView.vue jxh-manager/src/views/analytics/__tests__/AnalyticsView.spec.ts
git commit -m "refactor: separate analytics scope and analysis controls"
```

### Task 3: Apply the approved dashboard layout and shared card geometry

**Files:**
- Modify: `jxh-manager/src/views/analytics/AnalyticsView.vue`
- Modify: `jxh-manager/src/views/analytics/__tests__/AnalyticsView.spec.ts`

- [ ] **Step 1: Write failing structure tests**

Add assertions after `flushPromises()`:

```ts
expect(wrapper.findComponent(AnalyticsMetricBoard).exists()).toBe(true)
expect(wrapper.findAll('.analytics-card')).toHaveLength(2)
expect(wrapper.get('.trend-section').classes()).toContain('analytics-card')
expect(wrapper.get('.ranking-section').classes()).toContain('analytics-card')
expect(wrapper.find('.metric-grid').exists()).toBe(false)
```

- [ ] **Step 2: Run the view test and verify RED**

Run the Task 2 test command.

Expected: FAIL because the page still renders `.metric-grid` and the analysis sections are joined by border bands.

- [ ] **Step 3: Replace the card wall and analysis bands**

Import and render:

```vue
<AnalyticsMetricBoard :metrics="summary.metrics" />
```

Replace the old `metric-grid` section. Add `analytics-card` to trend and ranking sections. Use the overview geometry exactly:

```css
.analytics-card {
  min-width: 0;
  padding: var(--space-card);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}

.analytics-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(300px, 0.85fr);
  gap: 12px;
}
```

Remove the joined top/bottom borders, cross-card divider, and asymmetric zero-edge padding.

- [ ] **Step 4: Make the global filter grid responsive without hidden controls**

Use a date-range wrapper and a desktop grid with a minimum 250px date field. At `max-width: 1100px`, switch to two columns; at `max-width: 680px`, switch to one column. Delete all `nth-of-type` rules that hide filters. Keep action buttons at stable 36–38px heights.

At `max-width: 1100px`, stack trend and ranking. At `max-width: 620px`, stack page header/export controls and use one-column analysis controls. Do not add horizontal scrolling to the page or cards.

- [ ] **Step 5: Run focused tests and build**

Run:

```bash
cd jxh-manager
npm run test:unit -- src/components/data/__tests__/AnalyticsMetricBoard.spec.ts src/views/analytics/__tests__/AnalyticsView.spec.ts --run
npm run build
```

Expected: focused tests pass and the production build exits 0.

- [ ] **Step 6: Commit Task 3**

```bash
git add jxh-manager/src/views/analytics/AnalyticsView.vue jxh-manager/src/views/analytics/__tests__/AnalyticsView.spec.ts
git commit -m "style: redesign analytics dashboard layout"
```

### Task 4: Add browser regression coverage and complete verification

**Files:**
- Modify: `jxh-manager/e2e/admin.spec.ts`

- [ ] **Step 1: Write the failing desktop analytics layout E2E**

Add a desktop-tagged test after installing the mocked API:

```ts
test('presents analytics as an operational dashboard instead of a card wall', async ({ page }) => {
  await installAdminApi(page)
  await page.setViewportSize({ width: 1339, height: 662 })
  await page.goto('/analytics')
  await expect(page.locator('[data-test="analytics-core-metrics"]')).toBeVisible()
  await expect(page.locator('[data-test^="analytics-kpi-"]')).toHaveCount(4)
  await expect(page.locator('[data-test="analytics-metric-group"]')).toHaveCount(3)
  await expect(page.locator('[data-test^="analytics-metric-row-"]')).toHaveCount(12)
  await expect(page.locator('.analytics-card')).toHaveCount(2)
  await expectNoHorizontalOverflow(page)
})
```

Add a local-control assertion that selecting `quote_failure_count` updates `metric` in the URL and records new `/analytics/timeseries` and `/analytics/rankings` requests without a second `/analytics/summary` request.

- [ ] **Step 2: Run the targeted E2E and verify RED**

Run:

```bash
cd jxh-manager
npx playwright test e2e/admin.spec.ts --project=chromium --grep "operational dashboard"
```

Expected: FAIL because the new data-test structure does not exist before Tasks 1–3 are applied to the E2E fixture and page.

- [ ] **Step 3: Run the targeted E2E and verify GREEN**

Run the command from Step 2.

Expected: one test passes.

- [ ] **Step 4: Verify all supported viewports and quality gates**

Run:

```bash
cd jxh-manager
npm run test:unit -- --run
npm run test:e2e
npm run build
npx eslint . --cache
npx oxlint .
git -C .. diff --check
```

Expected:

- all unit tests pass;
- all desktop, tablet, and mobile E2E tests pass;
- build and type-check exit 0;
- ESLint, Oxlint, and `git diff --check` exit 0.

Use the real integration browser at `1440×1024`, `1024×768`, and `390×844`. Confirm core metrics, grouped rows, filters, chart/table toggle, ranking, and export remain visible without text overlap or horizontal page overflow. Save screenshots under `jxh-manager/output/playwright/` only when needed for failure diagnosis.

- [ ] **Step 5: Commit Task 4**

```bash
git add jxh-manager/e2e/admin.spec.ts
git commit -m "test: cover analytics dashboard hierarchy"
```
