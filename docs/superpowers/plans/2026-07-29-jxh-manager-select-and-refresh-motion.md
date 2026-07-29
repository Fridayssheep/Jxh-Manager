# Jxh Manager Select And Refresh Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every native select on the analytics page with one accessible branded listbox and animate analytics card height and successful content refreshes without fixed dimensions.

**Architecture:** Add a focused `AppSelect` form component that owns listbox accessibility, keyboard interaction, Teleport positioning, and visual styling. Add two small Vue directives that use the Web Animations API for measured height interpolation and revision-driven content rise. `AnalyticsView` remains responsible for route and request state, while `AnalyticsMetricBoard` only receives a summary revision for presentation motion.

**Tech Stack:** Vue 3, TypeScript, Vue Router, Lucide Vue, Web Animations API, Vitest, Vue Test Utils, Playwright

---

### Task 1: Build the branded select component

**Files:**
- Create: `jxh-manager/src/components/form/AppSelect.vue`
- Create: `jxh-manager/src/components/form/__tests__/AppSelect.spec.ts`

- [ ] **Step 1: Write failing listbox tests**

Create tests that mount the desired component API and verify selection plus keyboard behavior:

```ts
const options = [
  { value: 'messages', label: '群消息量' },
  { value: 'requests', label: 'AI 请求量' },
]

const wrapper = mount(AppSelect, {
  attachTo: document.body,
  props: {
    modelValue: 'messages',
    options,
    accessibleName: '指标',
    name: 'metric',
    dataTest: 'metric-select',
  },
})

expect(wrapper.find('select').exists()).toBe(false)
expect(wrapper.get('[data-test="metric-select"]').attributes('aria-expanded')).toBe('false')
await wrapper.get('[data-test="metric-select"]').trigger('click')
expect(document.body.querySelector('[role="listbox"]')).not.toBeNull()
document.body.querySelector<HTMLElement>('[role="option"][data-value="requests"]')!.click()
expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['requests'])
expect(wrapper.emitted('change')?.at(-1)).toEqual(['requests'])
```

Add a second test that opens with `ArrowDown`, navigates with another `ArrowDown`, confirms with `Enter`, then verifies `Escape` closes an open menu and restores trigger focus. Clean up Teleports with `wrapper.unmount()` after each test.

- [ ] **Step 2: Run the component test and verify RED**

Run:

```powershell
cd D:\code\Jxh-Manager\jxh-manager
npm run test:unit -- src/components/form/__tests__/AppSelect.spec.ts --run
```

Expected: FAIL because `AppSelect.vue` does not exist.

- [ ] **Step 3: Implement `AppSelect.vue`**

Define this public interface:

```ts
export type AppSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  modelValue: string
  options: readonly AppSelectOption[]
  accessibleName: string
  name?: string
  dataTest?: string
  size?: 'default' | 'compact'
  disabled?: boolean
}>(), {
  name: undefined,
  dataTest: undefined,
  size: 'default',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
}>()
```

Render a button trigger plus a hidden form input. Teleport the open menu to `body` with `role="listbox"`; each enabled row uses `role="option"`, `data-value`, `aria-selected`, and a Lucide `Check` for the current value. Use `ChevronDown` in the trigger.

Implement `openMenu`, `closeMenu`, `selectOption`, and keyboard handlers for `ArrowUp`, `ArrowDown`, `Home`, `End`, `Enter`, space, and `Escape`. On close after a choice or Escape, focus the trigger. Register document `pointerdown` plus window `resize` and capture-phase `scroll`; remove every listener on unmount.

Position the Teleported menu from `trigger.getBoundingClientRect()`. Clamp it to an 8px viewport inset, use at least the trigger width, cap height at 320px, and place above the trigger when the space below is smaller than both 200px and the space above.

Style the trigger with existing control tokens. Style the menu with a white surface, gray border, 6px radius, overlay shadow, pink selected surface, red selected ink, internal scrolling, and a 140ms opacity/4px-rise transition. Add explicit `prefers-reduced-motion` rules.

- [ ] **Step 4: Run tests and verify GREEN**

Run the Task 1 test command.

Expected: one file passes with the pointer and keyboard interaction tests.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- jxh-manager/src/components/form/AppSelect.vue jxh-manager/src/components/form/__tests__/AppSelect.spec.ts
git commit -m "feat: add branded select component"
```

### Task 2: Add measured resize and content-rise directives

**Files:**
- Create: `jxh-manager/src/directives/motion.ts`
- Create: `jxh-manager/src/directives/__tests__/motion.spec.ts`

- [ ] **Step 1: Write failing directive tests**

Mount small test components with the desired directives. Stub `HTMLElement.prototype.animate` and make `getBoundingClientRect()` return `80` when content is collapsed and `160` when expanded:

```ts
const wrapper = mount({
  directives: { smoothResize: vSmoothResize },
  data: () => ({ expanded: false }),
  template: '<div v-smooth-resize>{{ expanded ? "expanded" : "collapsed" }}</div>',
})
const element = wrapper.get('div').element as HTMLElement
vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() =>
  ({ height: element.textContent === 'expanded' ? 160 : 80 }) as DOMRect,
)
const animate = vi.fn(() => fakeAnimation())
Object.defineProperty(element, 'animate', { value: animate })

await wrapper.setData({ expanded: true })
expect(animate).toHaveBeenCalledWith(
  [{ height: '80px' }, { height: '160px' }],
  expect.objectContaining({ duration: 220 }),
)
```

Add content-rise assertions for keyframes containing `translateY(8px)` and a test where `matchMedia('(prefers-reduced-motion: reduce)')` returns `matches: true`, expecting no animation.

- [ ] **Step 2: Run directive tests and verify RED**

Run:

```powershell
npm run test:unit -- src/directives/__tests__/motion.spec.ts --run
```

Expected: FAIL because `src/directives/motion.ts` does not exist.

- [ ] **Step 3: Implement motion directives**

Export:

```ts
export const vSmoothResize: ObjectDirective<MotionElement>
export const vRiseOnChange: ObjectDirective<MotionElement, unknown>
```

`vSmoothResize.beforeUpdate` records the current visible height and cancels any prior resize animation. Its `updated` hook reads the final height and animates between exact pixel values with duration from `--duration-overlay` (fallback 220) and `cubic-bezier(0.2, 0.8, 0.2, 1)`. Temporarily set `overflow: clip`, restore it on finish/cancel, and skip equal heights.

`vRiseOnChange.updated` compares `binding.value` and `binding.oldValue`; when different, animate from `{ opacity: 0.25, transform: 'translateY(8px)' }` to `{ opacity: 1, transform: 'translateY(0)' }` with the same duration/easing. Cancel an active rise animation before starting the next one.

Both directives skip work when `matchMedia('(prefers-reduced-motion: reduce)').matches`, when `element.animate` is unavailable, or on initial mount.

- [ ] **Step 4: Run directive tests and verify GREEN**

Run the Task 2 test command.

Expected: height, rise, unchanged-revision, and reduced-motion tests pass.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- jxh-manager/src/directives/motion.ts jxh-manager/src/directives/__tests__/motion.spec.ts
git commit -m "feat: add analytics refresh motion directives"
```

### Task 3: Integrate custom selects and refresh motion into analytics

**Files:**
- Modify: `jxh-manager/src/views/analytics/AnalyticsView.vue`
- Modify: `jxh-manager/src/views/analytics/__tests__/AnalyticsView.spec.ts`
- Modify: `jxh-manager/src/components/data/AnalyticsMetricBoard.vue`
- Modify: `jxh-manager/src/components/data/__tests__/AnalyticsMetricBoard.spec.ts`

- [ ] **Step 1: Write failing integration tests**

In `AnalyticsView.spec.ts`, import `AppSelect` and assert after load:

```ts
const selects = wrapper.findAllComponents(AppSelect)
expect(selects).toHaveLength(7)
expect(wrapper.findAll('select')).toHaveLength(0)
expect(selects.map((select) => select.props('name'))).toEqual([
  undefined,
  undefined,
  'feature_key',
  'result',
  'metric',
  'granularity',
  'dimension',
])
```

Update the local-analysis test to find the `AppSelect` with `name === 'metric'`, emit `update:modelValue` and `change` with `quote_failure_count`, then retain the existing URL and request-count assertions.

In `AnalyticsMetricBoard.spec.ts`, mount with `revision: 1`, update metrics plus `revision: 2`, stub `animate`, and assert at least one content-rise keyframe is requested.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npm run test:unit -- src/views/analytics/__tests__/AnalyticsView.spec.ts src/components/data/__tests__/AnalyticsMetricBoard.spec.ts --run
```

Expected: FAIL because native selects remain and the metric board has no revision motion.

- [ ] **Step 3: Add option metadata and response revisions**

In `AnalyticsView.vue`, import `AppSelect`, `vSmoothResize`, and `vRiseOnChange`. Add arrays for export datasets, formats, features, results, dimensions, and granularities using the current option values and labels.

Add:

```ts
const summaryRevision = ref(0)
const analysisRevision = ref(0)
```

Increment `summaryRevision` only when the current summary request succeeds. Increment `analysisRevision` only after both current analysis requests succeed and their data is installed. Do not increment either value on request start, stale response, or failure.

- [ ] **Step 4: Replace all seven analytics selects**

Replace every visible `<select>` in `AnalyticsView.vue` with `AppSelect`. Use default size for export and global filters, compact size for metric/granularity/dimension, and preserve existing accessible names and field names. Add narrow typed setter functions such as:

```ts
function setMetric(value: string): void {
  analysisFilter.metric = value as AnalyticsMetricKey
}
```

For local controls, handle `update:modelValue` with the setter and `change` with `applyAnalysisFilters`. Preserve export, reset, route hydration, and global form submission behavior.

Remove CSS that targets native analytics selects and replace it with root sizing rules for `AppSelect`. Keep the desktop and mobile grid dimensions unchanged.

- [ ] **Step 5: Apply measured resize and rise motion**

Apply `v-smooth-resize` to both `.analytics-card` sections. Wrap each chart/ranking content region in an element with `v-rise-on-change="analysisRevision"`; keep the loading and error strips inside the card so their insertion/removal participates in measured height animation.

Pass `:revision="summaryRevision"` to `AnalyticsMetricBoard`. Add an optional numeric `revision` prop, apply `v-rise-on-change="revision"` to KPI content and each group list, and apply `v-smooth-resize` to metric group cards. Keep the KPI cards at their approved stable 104px height.

- [ ] **Step 6: Run focused tests and build**

Run:

```powershell
npm run test:unit -- src/components/form/__tests__/AppSelect.spec.ts src/directives/__tests__/motion.spec.ts src/components/data/__tests__/AnalyticsMetricBoard.spec.ts src/views/analytics/__tests__/AnalyticsView.spec.ts --run
npm run build
```

Expected: all focused tests and the production build pass.

- [ ] **Step 7: Commit Task 3**

```powershell
git add -- jxh-manager/src/views/analytics/AnalyticsView.vue jxh-manager/src/views/analytics/__tests__/AnalyticsView.spec.ts jxh-manager/src/components/data/AnalyticsMetricBoard.vue jxh-manager/src/components/data/__tests__/AnalyticsMetricBoard.spec.ts
git commit -m "feat: animate analytics refresh interactions"
```

### Task 4: Add browser regressions and complete verification

**Files:**
- Modify: `jxh-manager/e2e/admin.spec.ts`

- [ ] **Step 1: Extend the analytics E2E with custom menu assertions**

In the existing operational dashboard test, click `[data-test="metric-select"]`, assert one visible `[role="listbox"]`, assert the selected option has `aria-selected="true"`, and select `[role="option"][data-value="quote_failure_count"]`. Retain URL, request count, and no-overflow assertions.

Before navigation, install a small `Element.prototype.animate` recorder with `page.addInitScript`. After the metric response, poll the recorder for one height keyframe and one `translateY(8px)` keyframe. This verifies the real page invokes both directives without depending on a screenshot timing race.

- [ ] **Step 2: Run the targeted browser test**

Run:

```powershell
npx playwright test e2e/admin.spec.ts --project=chromium --grep "operational dashboard"
```

Expected: the analytics browser regression passes.

- [ ] **Step 3: Inspect desktop and mobile rendering**

Use the live frontend at `http://127.0.0.1:5173/analytics` with the real backend. Verify at `1440x1024` and `390x844` that the menu uses the branded surface, selected/check state, does not clip at the viewport, cards resize without a jump, refreshed content rises, and no visible native menu remains.

- [ ] **Step 4: Run all quality gates**

Run:

```powershell
npm run test:unit -- --run
npm run test:e2e
npm run build
npx eslint . --cache
npx oxlint .
git -C .. diff --check
```

Expected: all unit and E2E tests pass, build and type-check exit 0, both linters exit 0, and Git whitespace validation reports no errors.

- [ ] **Step 5: Commit Task 4**

```powershell
git add -- jxh-manager/e2e/admin.spec.ts
git commit -m "test: cover analytics select and refresh motion"
```
