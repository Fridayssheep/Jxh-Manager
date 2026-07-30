# Group List Join Policy Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return each managed group's automatic join-policy summary in the group resource and expose independent automatic approval and rejection switches directly in the group directory.

**Architecture:** Extend the OpenAPI `Group` contract with a required policy summary, load all policy rows for a group page in one storage query, and keep writes on the existing versioned join-policy PATCH endpoint. The Vue group directory renders a focused compact control per row, tracks busy state by group ID, and only replaces state from the server response.

**Tech Stack:** Go 1.24, GORM/MySQL, OpenAPI 3.1, Vue 3, Pinia, TypeScript, Vitest, Playwright

---

### Task 1: Add the group policy summary contract

**Files:**
- Modify: `resource/Jxh-Go/internal/management/api/openapi_rejection_contract_test.go`
- Modify: `docs/api/jxh-manager-openapi.yaml:2796`
- Regenerate: `jxh-manager/src/api/schema.d.ts`

- [ ] **Step 1: Write the failing OpenAPI contract test**

Extend `TestOpenAPIJoinRejectionContracts` after it has unmarshaled the repository document, and assert the required summary shape:

```go
group := requireOpenAPISchema(t, spec.Components.Schemas, "Group")
requireOpenAPIRequired(t, group, "join_request_policy")
property := requireOpenAPIProperty(t, group, "join_request_policy")
if property["$ref"] != "#/components/schemas/JoinRequestPolicySummary" {
	t.Fatalf("Group.join_request_policy ref = %v", property["$ref"])
}
summary := requireOpenAPISchema(t, spec.Components.Schemas, "JoinRequestPolicySummary")
for _, field := range []string{"enabled", "auto_reject", "version"} {
	requireOpenAPIRequired(t, summary, field)
	requireOpenAPIProperty(t, summary, field)
}
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
go test ./internal/management/api -run TestOpenAPIJoinRejectionContracts -count=1
```

Expected: FAIL because `Group.join_request_policy` and `JoinRequestPolicySummary` do not exist.

- [ ] **Step 3: Add the OpenAPI schema**

Add the required property to `Group` and define the summary next to `JoinRequestPolicy`:

```yaml
    JoinRequestPolicySummary:
      type: object
      additionalProperties: false
      required: [enabled, auto_reject, version]
      properties:
        enabled:
          type: boolean
          default: false
        auto_reject:
          type: boolean
          default: false
        version:
          type: integer
          minimum: 1
```

```yaml
    Group:
      required:
        - join_request_policy
      properties:
        join_request_policy:
          $ref: '#/components/schemas/JoinRequestPolicySummary'
```

- [ ] **Step 4: Regenerate TypeScript and verify GREEN**

Run:

```powershell
go test ./internal/management/api -run TestOpenAPIJoinRejectionContracts -count=1
npm run api:generate
```

Expected: Go test PASS and generated `Group` exposes required `join_request_policy`.

- [ ] **Step 5: Commit the contract**

```powershell
git add docs/api/jxh-manager-openapi.yaml resource/Jxh-Go/internal/management/api/openapi_rejection_contract_test.go jxh-manager/src/api/schema.d.ts
git commit -m "feat: expose group join policy summaries"
```

### Task 2: Populate summaries in group list and detail responses

**Files:**
- Modify: `resource/Jxh-Go/internal/groups/service.go`
- Modify: `resource/Jxh-Go/internal/groups/service_test.go`
- Modify: `resource/Jxh-Go/internal/platform/storage/manager_core_groups.go`
- Modify: `resource/Jxh-Go/internal/platform/storage/manager_core_integration_test.go`
- Modify: `resource/Jxh-Go/internal/management/api/groups_handlers.go`
- Modify: `resource/Jxh-Go/internal/management/api/groups_handlers_test.go`

- [ ] **Step 1: Write failing domain and HTTP tests**

Add the summary to fixtures and assert the response fields:

```go
JoinRequestPolicy: groups.JoinRequestPolicySummary{
	Enabled: true, AutoReject: false, Version: 7,
},
```

```go
for _, expected := range []string{
	`"join_request_policy":{"enabled":true,"auto_reject":false,"version":7}`,
} {
	if !strings.Contains(response.Body.String(), expected) {
		t.Fatalf("body missing %s: %s", expected, response.Body.String())
	}
}
```

Add a storage integration assertion that two managed groups return their own policy values without crossing group IDs.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
go test ./internal/groups ./internal/management/api -run "Group|JoinRequestPolicy" -count=1
```

Expected: FAIL because `groups.Group` has no policy summary and the DTO omits it.

- [ ] **Step 3: Add the domain summary and validation**

Add:

```go
type JoinRequestPolicySummary struct {
	Enabled    bool
	AutoReject bool
	Version    uint64
}

type Group struct {
	// existing fields
	JoinRequestPolicy JoinRequestPolicySummary
}
```

Extend `validateGroup` with `group.JoinRequestPolicy.Version >= 1`. The summary contains values, not slices or pointers, so existing clone behavior remains sufficient.

- [ ] **Step 4: Batch-load policy rows in storage**

Add a transaction-local loader that performs one `IN` query for the page:

```go
func loadManagerJoinPolicySummaries(
	tx *gorm.DB,
	models []managerManagedGroup,
) (map[int64]groups.JoinRequestPolicySummary, error) {
	ids := make([]int64, len(models))
	for index, model := range models { ids[index] = model.GroupID }
	var rows []joinPolicyManagerRow
	if len(ids) > 0 {
		if err := tx.Where("group_id IN ?", ids).Find(&rows).Error; err != nil { return nil, err }
	}
	result := make(map[int64]groups.JoinRequestPolicySummary, len(rows))
	for _, row := range rows {
		if row.Revision == 0 { return nil, errManagerInvalidState }
		result[row.GroupID] = groups.JoinRequestPolicySummary{
			Enabled: row.Enabled, AutoReject: row.AutoReject, Version: row.Revision,
		}
	}
	if len(result) != len(models) { return nil, errManagerInvalidState }
	return result, nil
}
```

Call it once from `ListGroups`; call it with the single model from `GetGroup`. Pass the matching summary into `managerGroupFromModel` and assign `JoinRequestPolicy` on the domain object.

- [ ] **Step 5: Map the API DTO**

Add:

```go
type groupJoinRequestPolicyDTO struct {
	Enabled    bool   `json:"enabled"`
	AutoReject bool   `json:"auto_reject"`
	Version    uint64 `json:"version"`
}
```

Add `JoinRequestPolicy groupJoinRequestPolicyDTO` to `groupDTO` and populate it from `value.JoinRequestPolicy` in `mapGroup`.

- [ ] **Step 6: Run backend tests and verify GREEN**

Run:

```powershell
go test ./internal/groups ./internal/management/api ./internal/platform/storage -count=1
```

Expected: PASS. If MySQL-tagged integration tests are excluded by the default build, run the repository's documented integration target during final verification.

- [ ] **Step 7: Commit backend behavior**

```powershell
git add resource/Jxh-Go/internal/groups resource/Jxh-Go/internal/platform/storage/manager_core_groups.go resource/Jxh-Go/internal/platform/storage/manager_core_integration_test.go resource/Jxh-Go/internal/management/api/groups_handlers.go resource/Jxh-Go/internal/management/api/groups_handlers_test.go
git commit -m "feat: include join policies in group resources"
```

### Task 3: Add row-scoped policy controls to the Vue directory

**Files:**
- Create: `jxh-manager/src/components/groups/GroupJoinPolicyControls.vue`
- Create: `jxh-manager/src/components/groups/__tests__/GroupJoinPolicyControls.spec.ts`
- Modify: `jxh-manager/src/views/groups/GroupsView.vue`
- Modify: `jxh-manager/src/views/groups/__tests__/GroupsView.spec.ts`

- [ ] **Step 1: Write failing component and view tests**

The control test mounts mixed state and asserts independent checked values and disabled behavior. The view test grants `join_policies:write`, mocks `joinRequestsApi.updatePolicy`, and asserts minimal patches:

```ts
expect(updatePolicy).toHaveBeenNthCalledWith(1, '10001', { enabled: true }, 3)
expect(updatePolicy).toHaveBeenNthCalledWith(2, '10001', { auto_reject: true }, 4)
```

Add separate tests for a read-only user, row-scoped busy state, successful version replacement, and `409 resource_version_conflict` reloading the existing filtered query.

- [ ] **Step 2: Run focused unit tests and verify RED**

Run:

```powershell
npm run test:unit -- --run src/components/groups/__tests__/GroupJoinPolicyControls.spec.ts src/views/groups/__tests__/GroupsView.spec.ts
```

Expected: FAIL because the component and row behavior do not exist.

- [ ] **Step 3: Implement the compact binary control**

Create a semantic fieldset with two labels:

```vue
<fieldset
  class="join-policy-controls"
  :disabled="disabled || busy"
  :aria-busy="busy"
  :aria-label="`${groupName}自动审核`"
>
  <label>
    <span>批准</span>
    <input
      type="checkbox"
      :checked="enabled"
      :aria-label="`${groupName}自动批准`"
      @change="$emit('change', { enabled: ($event.target as HTMLInputElement).checked })"
    />
    <i aria-hidden="true" />
  </label>
  <label>
    <span>拒绝</span>
    <input
      type="checkbox"
      :checked="autoReject"
      :aria-label="`${groupName}自动拒绝`"
      @change="$emit('change', { auto_reject: ($event.target as HTMLInputElement).checked })"
    />
    <i aria-hidden="true" />
  </label>
</fieldset>
```

Use fixed switch dimensions, existing brand tokens, visible `:focus-visible`, disabled opacity, and no viewport-scaled text.

- [ ] **Step 4: Implement row-scoped save state**

In `GroupsView.vue`, import `joinRequestsApi`, `JoinRequestPolicyPatch`, and the new component. Track busy IDs with immutable Set replacement:

```ts
const policyBusyIds = ref<Set<string>>(new Set())

function setPolicyBusy(groupId: string, busy: boolean): void {
  const next = new Set(policyBusyIds.value)
  if (busy) next.add(groupId)
  else next.delete(groupId)
  policyBusyIds.value = next
}
```

Implement `updateJoinPolicy(group, patch)` without optimistic state mutation. On success, replace only that group's summary from the full policy response. On 409, call `load()` with current filters and show a warning. On other failures, preserve the current summary and show the API message. Always clear only that group's busy ID.

- [ ] **Step 5: Add the directory column and responsive card row**

Add “自动审核” between feature summary and actions. Render `GroupJoinPolicyControls` with:

```vue
:disabled="!auth.hasPermission('join_policies:write')"
:busy="policyBusyIds.has(group.group_id)"
@change="updateJoinPolicy(group, $event)"
```

Desktop uses an independent 170px track. At the tablet breakpoint, hide feature summary but retain the policy track. At `max-width: 720px`, assign the control `grid-column: 1 / -1` so it occupies its own card row.

Add a separate `OperationNotice` for policy success/warning/error messages so sync feedback remains independent and receives the existing rise motion.

- [ ] **Step 6: Run focused unit tests and verify GREEN**

Run:

```powershell
npm run test:unit -- --run src/components/groups/__tests__/GroupJoinPolicyControls.spec.ts src/views/groups/__tests__/GroupsView.spec.ts
```

Expected: all focused tests PASS.

- [ ] **Step 7: Commit frontend behavior**

```powershell
git add jxh-manager/src/components/groups jxh-manager/src/views/groups/GroupsView.vue jxh-manager/src/views/groups/__tests__/GroupsView.spec.ts
git commit -m "feat: manage join policies from group rows"
```

### Task 4: Cover browser requests and responsive layouts

**Files:**
- Modify: `jxh-manager/e2e/fixtures/admin-api.ts`
- Modify: `jxh-manager/e2e/admin.spec.ts`

- [ ] **Step 1: Write the failing E2E assertions**

Add `join_request_policy` to the group fixture and a mutable policy response. In the desktop flow, switch approval then rejection and assert:

```ts
expect(first.headers['if-match']).toBe('"1"')
expect(first.body).toEqual({ enabled: true })
expect(second.headers['if-match']).toBe('"2"')
expect(second.body).toEqual({ auto_reject: true })
expectCsrf(first)
expectCsrf(second)
```

In the shared viewport test, assert the group policy control is visible and the page has no horizontal overflow.

- [ ] **Step 2: Run the focused E2E and verify RED**

Run:

```powershell
npx playwright test e2e/admin.spec.ts --grep "群列表|viewport"
```

Expected: FAIL because the list has no policy controls and the fixture has no PATCH handler.

- [ ] **Step 3: Extend the API harness**

Maintain a local policy object initialized at version 1. Return its three-field summary in the group resource. For PATCH, merge only the submitted field, increment the version, and return the full existing `JoinRequestPolicy` shape.

- [ ] **Step 4: Run focused E2E and inspect three screenshots**

Run:

```powershell
npx playwright test e2e/admin.spec.ts --grep "群列表|viewport"
```

Inspect `1440x1024`, `1024x768`, and `390x844` artifacts. Verify the desktop/tablet column remains readable and mobile controls occupy their own row without overlap.

- [ ] **Step 5: Commit browser coverage**

```powershell
git add jxh-manager/e2e/admin.spec.ts jxh-manager/e2e/fixtures/admin-api.ts
git commit -m "test: cover group join policy controls"
```

### Task 5: Complete verification and requirement audit

**Files:**
- Review: `docs/superpowers/specs/2026-07-31-group-list-join-policy-controls-design.md`
- Review: all files changed by Tasks 1-4

- [ ] **Step 1: Run backend verification**

```powershell
go test ./...
```

Expected: all Go tests PASS.

- [ ] **Step 2: Run frontend verification**

```powershell
npm run test:unit -- --run
npm run test:e2e
npm run build
npx eslint . --cache
npx oxlint .
```

Expected: all commands exit 0.

- [ ] **Step 3: Run repository checks**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and only intentional files, or a clean tree after commits.

- [ ] **Step 4: Audit every accepted requirement**

Confirm from current sources and runtime evidence that the group response carries one summary per group, no frontend N+1 policy GET occurs, both switches are independent, permissions are read-only for non-writers, busy state is row-scoped, 409 reloads current filters, errors preserve state, mobile uses a separate row, and the original join-request detail controls still work.
