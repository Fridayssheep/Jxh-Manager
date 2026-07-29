# Jxh Manager Interaction Consistency and Join Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify overlay, tab, select, notice and refresh motion behavior across the admin UI, and replace the unbounded join-request queue with cursor pagination inside a scrolling card.

**Architecture:** Add small shared primitives for overlay transitions, sliding indicators, tab bars and operation notices. Migrate existing pages without changing API semantics, then refactor the join-request view to replace page data using cursor history rather than appending it.

**Tech Stack:** Vue 3, TypeScript, Vue Test Utils, Vitest, Playwright, Web Animations API, CSS transitions.

---

### Task 1: Shared Overlay Transition

**Files:**
- Create: `jxh-manager/src/components/motion/AppOverlayTransition.vue`
- Create: `jxh-manager/src/components/motion/__tests__/AppOverlayTransition.spec.ts`
- Modify: `jxh-manager/src/assets/main.css`

- [ ] Write failing tests that mount centered and drawer overlays and assert the shared Transition name and motion variant.
- [ ] Run `npm run test:unit -- src/components/motion/__tests__/AppOverlayTransition.spec.ts --run` and confirm failure because the component does not exist.
- [ ] Implement the transition wrapper with `show`, `variant` and default slot props; add global 220ms overlay, centered-panel and drawer-panel classes plus reduced-motion overrides.
- [ ] Re-run the focused test and confirm it passes.
- [ ] Commit with `feat: add shared overlay transitions`.

### Task 2: Sliding Indicator and Tab Bar

**Files:**
- Create: `jxh-manager/src/composables/useSlidingIndicator.ts`
- Create: `jxh-manager/src/composables/__tests__/useSlidingIndicator.spec.ts`
- Create: `jxh-manager/src/components/navigation/AppTabBar.vue`
- Create: `jxh-manager/src/components/navigation/__tests__/AppTabBar.spec.ts`
- Modify: `jxh-manager/src/app/AppShell.vue`

- [ ] Write failing tests for measured indicator width/height/transform, post-layout refresh, arrow-key navigation, `aria-selected`, and emitted tab values.
- [ ] Run both focused specs and confirm failure because the composable and component do not exist.
- [ ] Extract the sidebar measurement lifecycle into `useSlidingIndicator`, preserving ResizeObserver and resize handling.
- [ ] Implement `AppTabBar` with a single animated highlight and icon-capable options.
- [ ] Refactor `AppShell` to use the composable and run `src/app/__tests__/AppShell.spec.ts` with the new component tests.
- [ ] Commit with `feat: add sliding selection indicators`.

### Task 3: Operation Notice and Stable Filter Actions

**Files:**
- Create: `jxh-manager/src/components/feedback/OperationNotice.vue`
- Create: `jxh-manager/src/components/feedback/__tests__/OperationNotice.spec.ts`
- Modify: `jxh-manager/src/assets/main.css`

- [ ] Write failing tests for success/error ARIA roles, close events, long unbroken messages and `vRiseOnChange` revision updates.
- [ ] Run the focused spec and confirm failure because the component does not exist.
- [ ] Implement `OperationNotice` with semantic icons, close control, `overflow-wrap: anywhere`, `min-width: 0`, `vSmoothResize` and `vRiseOnChange`.
- [ ] Add high-specificity global rules for stable `.filter-submit` and icon-only `.filter-reset`, `.icon-action`, `.icon-button` controls.
- [ ] Re-run focused tests and the CSS token tests.
- [ ] Commit with `feat: unify operation feedback and filter actions`.

### Task 4: Overlay, Tab and Notice Migration

**Files:**
- Modify: `jxh-manager/src/components/join-requests/DecisionDialog.vue`
- Modify: `jxh-manager/src/components/settings/SettingsAreaNav.vue`
- Modify: `jxh-manager/src/views/audit/AuditLogsView.vue`
- Modify: `jxh-manager/src/views/commands/CommandEditorView.vue`
- Modify: `jxh-manager/src/views/knowledge/KnowledgeView.vue`
- Modify: `jxh-manager/src/views/scheduled-jobs/ScheduledJobsView.vue`
- Modify: `jxh-manager/src/views/system/SystemView.vue`
- Modify: `jxh-manager/src/views/users/UsersView.vue`
- Modify: `jxh-manager/src/views/audit/__tests__/AuditLogsView.spec.ts`
- Modify: `jxh-manager/src/views/commands/__tests__/CommandEditorView.spec.ts`
- Modify: `jxh-manager/src/views/knowledge/__tests__/KnowledgeView.spec.ts`
- Modify: `jxh-manager/src/views/scheduled-jobs/__tests__/ScheduledJobsView.spec.ts`
- Modify: `jxh-manager/src/views/system/__tests__/SystemView.spec.ts`
- Modify: `jxh-manager/src/views/users/__tests__/UsersView.spec.ts`

- [ ] Add failing view tests that require overlay transition wrappers, sliding tab bars and operation notices.
- [ ] Run the focused view specs and verify expected structural failures.
- [ ] Migrate all overlay roots to `AppOverlayTransition`, selecting centered or drawer variants.
- [ ] Replace users, knowledge and settings-area tabs with `AppTabBar`; key content panels and apply rise-on-change.
- [ ] Replace dynamic result blocks in the affected pages with `OperationNotice` or bind the shared rise/resize directives when the layout needs custom content.
- [ ] Re-run the focused view tests and commit with `refactor: unify admin interaction motion`.

### Task 5: Global AppSelect Migration

**Files:**
- Modify: `jxh-manager/src/components/commands/ActionEditor.vue`
- Modify: `jxh-manager/src/components/commands/ParameterEditor.vue`
- Modify: `jxh-manager/src/views/audit/AuditLogsView.vue`
- Modify: `jxh-manager/src/views/commands/CommandEditorView.vue`
- Modify: `jxh-manager/src/views/commands/CommandsView.vue`
- Modify: `jxh-manager/src/views/groups/GroupsView.vue`
- Modify: `jxh-manager/src/views/join-requests/JoinRequestsView.vue`
- Modify: `jxh-manager/src/views/knowledge/KnowledgeView.vue`
- Modify: `jxh-manager/src/views/overview/OverviewView.vue`
- Modify: `jxh-manager/src/views/scheduled-jobs/ScheduledJobsView.vue`
- Modify: `jxh-manager/src/views/users/UsersView.vue`
- Modify: `jxh-manager/src/views/audit/__tests__/AuditLogsView.spec.ts`
- Modify: `jxh-manager/src/views/commands/__tests__/CommandEditorView.spec.ts`
- Modify: `jxh-manager/src/views/commands/__tests__/CommandsView.spec.ts`
- Modify: `jxh-manager/src/views/groups/__tests__/GroupsView.spec.ts`
- Modify: `jxh-manager/src/views/join-requests/__tests__/JoinRequestsView.spec.ts`
- Modify: `jxh-manager/src/views/knowledge/__tests__/KnowledgeView.spec.ts`
- Modify: `jxh-manager/src/views/overview/__tests__/OverviewView.spec.ts`
- Modify: `jxh-manager/src/views/scheduled-jobs/__tests__/ScheduledJobsView.spec.ts`
- Modify: `jxh-manager/src/views/users/__tests__/UsersView.spec.ts`

- [ ] Add failing structural tests asserting zero visible native `<select>` elements and the expected `AppSelect` names/data-test hooks; `CommandEditorView.spec.ts` must cover `ActionEditor` and `ParameterEditor` descendants.
- [ ] Run the affected component and view specs and confirm failures against current native selects.
- [ ] Define typed option arrays and setter functions, then replace every visible native select while preserving change/submit timing and disabled behavior.
- [ ] Update test interactions to emit `update:modelValue` and `change` through `AppSelect`.
- [ ] Run all affected unit tests and commit with `refactor: reuse branded selects across admin pages`.

### Task 6: Join Request Cursor Pager and Scrolling Queue

**Files:**
- Create: `jxh-manager/src/components/navigation/CursorPager.vue`
- Create: `jxh-manager/src/components/navigation/__tests__/CursorPager.spec.ts`
- Modify: `jxh-manager/src/views/join-requests/JoinRequestsView.vue`
- Modify: `jxh-manager/src/views/join-requests/__tests__/JoinRequestsView.spec.ts`

- [ ] Write failing pager tests for disabled previous/next states and emitted navigation events.
- [ ] Add failing view tests proving `limit: 10`, page replacement, cursor history, previous-page reuse, and selection/detail clearing.
- [ ] Run the focused specs and confirm current append/load-more behavior fails them.
- [ ] Implement `CursorPager` and replace join-request append state with `pageIndex`, `cursorHistory`, current `nextCursor` and a successful-data revision.
- [ ] Convert the queue to a stable grid with an internally scrolling list and fixed pager footer.
- [ ] Add a single measured active-row highlight using `useSlidingIndicator`; apply rise and resize directives to queue and detail content.
- [ ] Re-run focused specs and commit with `feat: paginate the join request queue`.

### Task 7: Cross-Viewport E2E and Final Verification

**Files:**
- Modify: `jxh-manager/e2e/admin.spec.ts`

- [ ] Add E2E assertions for overlay enter/leave keyframes or transition styles, tab/highlight alignment, zero visible native selects, stable filter button bounds, readable long errors, and join-request cursor paging.
- [ ] Run the new tests first and confirm they fail on any unimplemented behavior.
- [ ] Complete remaining page-level responsive adjustments revealed by 1440x1024, 1024x768 and 390x844 screenshots.
- [ ] Run `npm run test:unit -- --run` and require zero failures.
- [ ] Run `npm run test:e2e` and require zero failures across all projects.
- [ ] Run `npm run build`, `npx eslint . --cache`, `npx oxlint .`, and `git -C .. diff --check`.
- [ ] Commit with `test: cover global interaction consistency`.
