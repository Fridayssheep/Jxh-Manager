# Join Request Rejection Reasons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send configurable rejection messages through NapCat for automatic and manual join-request rejections while retaining the exact sent text in decision history.

**Architecture:** Extend the existing versioned global settings document with a join-request section and expose it through the atomic settings runtime. Generalize the existing automatic approval worker into an automatic decision worker that chooses approve or reject from AI validation and the independent group-policy switches. Keep manual decisions on the existing reservation, idempotency, lease, gateway and completion path, adding action-aware reason validation before reservation.

**Tech Stack:** Go 1.25, GORM, MySQL 8, OpenAPI 3.1, Vue 3, TypeScript, Vitest, Vue Test Utils, Vite, NapCat OneBot API

---

### Task 1: Update the OpenAPI contract and generated TypeScript schema

**Files:**
- Modify: `docs/api/jxh-manager-openapi.yaml`
- Modify: `jxh-manager/src/api/schema.d.ts`
- Test: `Resource/Jxh-Go/internal/management/api/openapi_contract_test.go`

- [ ] **Step 1: Add failing contract assertions**

Extend the OpenAPI contract test to assert that `GlobalSettings.join_requests` is required, `auto_reject` is a regular boolean, and reject decision bodies require `reason` through a `oneOf` branch while approve bodies keep it optional.

```go
requireSchemaProperty(t, document, "GlobalSettings", "join_requests")
requireSchemaProperty(t, document, "JoinRequestGlobalSettings", "auto_reject_reason")
requireBooleanWithoutConst(t, document, "JoinRequestPolicy", "auto_reject")
requireRejectReasonCondition(t, document, "JoinDecisionRequest")
requireRejectReasonCondition(t, document, "BulkJoinDecisionRequest")
```

- [ ] **Step 2: Verify the contract test fails for the missing schema**

Run: `go test ./internal/management/api -run OpenAPI -count=1`

Expected: FAIL because `JoinRequestGlobalSettings` and the conditional rejection contracts are absent and `auto_reject` is fixed to `false`.

- [ ] **Step 3: Implement the OpenAPI changes**

Add this schema and connect it to the global settings resource and patch:

```yaml
JoinRequestGlobalSettings:
  type: object
  additionalProperties: false
  required: [auto_reject_reason]
  properties:
    auto_reject_reason:
      type: string
      minLength: 1
      maxLength: 500
```

Make `JoinRequestPolicy.auto_reject` a normal boolean, allow both policy switches in `JoinRequestPolicyPatch`, and express reject-specific reason requirements with OpenAPI 3.1 `oneOf` branches. Preserve the existing action, item, group and `additionalProperties` constraints.

- [ ] **Step 4: Regenerate the frontend schema and verify the contract**

Run: `npm run api:generate`

Working directory: `jxh-manager`

Run: `go test ./internal/management/api -run OpenAPI -count=1`

Expected: both commands exit 0 and generated types expose `join_requests`, `auto_reject: boolean`, and reject/approve request unions.

- [ ] **Step 5: Commit the contract**

```powershell
git add docs/api/jxh-manager-openapi.yaml jxh-manager/src/api/schema.d.ts
git commit -m "feat: define join rejection message contract"
```

Commit the backend contract-test change in `Resource/Jxh-Go` with `git commit -m "test: cover join rejection API contract"`.

### Task 2: Add global automatic-rejection settings to the backend

**Files:**
- Modify: `Resource/Jxh-Go/internal/management/settings/types.go`
- Modify: `Resource/Jxh-Go/internal/management/settings/service.go`
- Modify: `Resource/Jxh-Go/internal/management/settings/runtime.go`
- Modify: `Resource/Jxh-Go/internal/management/settings/service_test.go`
- Modify: `Resource/Jxh-Go/internal/management/settings/runtime_test.go`
- Modify: `Resource/Jxh-Go/internal/management/api/settings_handlers.go`
- Modify: `Resource/Jxh-Go/internal/management/api/settings_handlers_test.go`
- Modify: `Resource/Jxh-Go/internal/platform/storage/manager_core_models.go`
- Modify: `Resource/Jxh-Go/internal/platform/storage/manager_core_settings.go`
- Modify: `Resource/Jxh-Go/internal/platform/storage/manager_core_test.go`
- Modify: `Resource/Jxh-Go/internal/platform/storage/manager_core_integration_test.go`

- [ ] **Step 1: Write failing domain and runtime tests**

Cover the default, normalization, length validation, partial patching and runtime update behavior:

```go
func TestDefaultJoinRequestSettings(t *testing.T) {
    got := DefaultJoinRequestSettings()
    if got.AutoRejectReason != DefaultAutoRejectReason { t.Fatalf("reason = %q", got.AutoRejectReason) }
}

func TestRuntimeUpdatesAutoRejectReasonAtomically(t *testing.T) {
    runtime := NewDefaultRuntime()
    next := testGlobalSettings()
    next.JoinRequests.AutoRejectReason = "  请补充学号和姓名。  "
    next.Version = 2
    if err := runtime.ApplyGlobal(next); err != nil { t.Fatal(err) }
    if got := runtime.AutoRejectReason(); got != "请补充学号和姓名。" { t.Fatalf("got %q", got) }
}
```

Add service tests that reject blank and 501-rune values and verify the store receives a trimmed value.

- [ ] **Step 2: Run settings tests and observe the missing API**

Run: `go test ./internal/management/settings -count=1`

Expected: FAIL because `JoinRequestSettings`, `DefaultAutoRejectReason`, `Global.JoinRequests`, `GlobalPatch.JoinRequests` and `Runtime.AutoRejectReason` do not exist.

- [ ] **Step 3: Implement the settings domain and runtime**

Add focused types and a narrow runtime reader:

```go
const DefaultAutoRejectReason = "申请信息不完整或格式不符合要求，请完善后重新申请。"

type JoinRequestSettings struct { AutoRejectReason string }
type JoinRequestSettingsPatch struct { AutoRejectReason auth.Field[string] }

func (r *Runtime) AutoRejectReason() string {
    return r.load().joinRequests.AutoRejectReason
}
```

Store `JoinRequests` alongside `Features` in `Global` and `runtimeSnapshot`; trim with `strings.TrimSpace`, validate with `utf8.RuneCountInString`, and clone it on all runtime replacement paths.

- [ ] **Step 4: Verify domain and runtime tests pass**

Run: `go test ./internal/management/settings -count=1`

Expected: PASS.

- [ ] **Step 5: Write failing HTTP and storage tests**

Add handler tests for GET and PATCH payloads and storage tests that decode an old JSON document without `join_requests`, patch only the new section, retain features, increment revision, and include the setting in audit snapshots.

```json
{"join_requests":{"auto_reject_reason":"请补充学号后重新申请。"}}
```

The compatibility fixture must omit `join_requests` and still decode to `DefaultAutoRejectReason`.

- [ ] **Step 6: Run HTTP and storage tests and observe missing persistence**

Run: `go test ./internal/management/api ./internal/platform/storage -run 'Settings|ManagerGlobal' -count=1`

Expected: FAIL because DTO decoding, JSON persistence and patch application only handle feature settings.

- [ ] **Step 7: Implement handler and JSON persistence support**

Add `join_requests` to the strict PATCH decoder and response DTO. Extend the settings JSON document with a `join_requests` object, apply defaults when absent, and encode the complete object on the next update. Update before/after audit snapshots using the same complete domain value.

- [ ] **Step 8: Verify settings HTTP and persistence tests pass**

Run: `go test ./internal/management/settings ./internal/management/api ./internal/platform/storage -run 'Settings|ManagerGlobal|Runtime' -count=1`

Expected: PASS.

- [ ] **Step 9: Commit backend global settings**

```powershell
git add internal/management/settings internal/management/api/settings_handlers.go internal/management/api/settings_handlers_test.go internal/platform/storage/manager_core_models.go internal/platform/storage/manager_core_settings.go internal/platform/storage/manager_core_test.go internal/platform/storage/manager_core_integration_test.go
git commit -m "feat: configure automatic join rejection message"
```

### Task 3: Enable the independent group automatic-rejection policy

**Files:**
- Create: `Resource/Jxh-Go/deploy/mysql/migrations/011_enable_automatic_join_rejection.sql`
- Modify: `Resource/Jxh-Go/deploy/mysql/init/001_schema.sql`
- Modify: `Resource/Jxh-Go/internal/platform/database/migrate_test.go`
- Modify: `Resource/Jxh-Go/internal/groups/joinrequests/types.go`
- Modify: `Resource/Jxh-Go/internal/groups/joinrequests/validation.go`
- Modify: `Resource/Jxh-Go/internal/groups/joinrequests/service.go`
- Modify: `Resource/Jxh-Go/internal/groups/joinrequests/service_test.go`
- Modify: `Resource/Jxh-Go/internal/management/api/join_requests_handlers.go`
- Modify: `Resource/Jxh-Go/internal/management/api/join_requests_handlers_test.go`
- Modify: `Resource/Jxh-Go/internal/platform/storage/manager_operations.go`
- Modify: `Resource/Jxh-Go/internal/platform/storage/manager_operations_integration_test.go`

- [ ] **Step 1: Write failing migration and policy tests**

Add tests that migrate a revision-010 database containing an existing policy, verify `auto_reject` remains false, then update it to true. Add domain, handler and storage tests for patches that change either switch independently and retain the untouched switch.

```go
patch := PolicyPatch{AutoReject: auth.Field[bool]{Set: true, Value: true}}
updated, err := service.UpdatePolicy(ctx, principal, "123", 1, patch, request)
if err != nil || !updated.AutoReject || !updated.Enabled { t.Fatalf("updated = %#v, err = %v", updated, err) }
```

- [ ] **Step 2: Run focused tests and verify the constraints fail**

Run: `go test ./internal/groups/joinrequests ./internal/management/api ./internal/platform/storage ./internal/platform/database -run 'Policy|Migration011|ManagerMigration' -count=1`

Expected: FAIL because `PolicyPatch` cannot represent a partial patch and the database rejects `auto_reject=true`.

- [ ] **Step 3: Implement migration 010 and policy patching**

Migration 011 must execute:

```sql
ALTER TABLE `group_join_policies`
  DROP CHECK `chk_group_join_policies_auto_reject`;
```

Remove the same constraint from fresh initialization. Change `PolicyPatch` fields to `auth.Field[bool]`, require at least one field, update only selected columns, and include both values in audit before/after documents. Return and validate both switches.

- [ ] **Step 4: Verify migration and policy tests pass**

Run: `go test ./internal/groups/joinrequests ./internal/management/api ./internal/platform/storage ./internal/platform/database -run 'Policy|Migration011|ManagerMigration' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit migration and policy changes**

```powershell
git add deploy/mysql/migrations/011_enable_automatic_join_rejection.sql deploy/mysql/init/001_schema.sql internal/platform/database internal/groups/joinrequests internal/management/api/join_requests_handlers.go internal/management/api/join_requests_handlers_test.go internal/platform/storage/manager_operations.go internal/platform/storage/manager_operations_integration_test.go
git commit -m "feat: enable automatic join rejection policy"
```

### Task 4: Generalize the automatic decision worker

**Files:**
- Modify: `Resource/Jxh-Go/internal/groups/joinrequests/service.go`
- Modify: `Resource/Jxh-Go/internal/groups/joinrequests/worker.go`
- Modify: `Resource/Jxh-Go/internal/groups/joinrequests/service_test.go`
- Modify: `Resource/Jxh-Go/internal/platform/storage/manager_operations.go`
- Modify: `Resource/Jxh-Go/internal/platform/storage/manager_operations_integration_test.go`
- Modify: `Resource/Jxh-Go/internal/management/backend.go`

- [ ] **Step 1: Write failing worker tests for reject, approve and skip**

Introduce a narrow reason provider fake and assert the exact action and reason passed to both reservation and gateway:

```go
type autoRejectReasonFake struct { value string }
func (f autoRejectReasonFake) AutoRejectReason() string { return f.value }

if approver.approve { t.Fatal("automatic invalid application was approved") }
if approver.reason != "请补充学号后重新申请。" { t.Fatalf("reason = %q", approver.reason) }
if store.begin.Reason == nil || *store.begin.Reason != approver.reason { t.Fatalf("stored reason differs") }
```

Keep separate tests proving valid fields still approve and failed/skipped/pending AI parsing never reserves a decision.

- [ ] **Step 2: Run worker tests and observe rejection is skipped**

Run: `go test ./internal/groups/joinrequests -run 'Auto|Automatic' -count=1`

Expected: FAIL because eligibility requires `policy.Enabled && fields.Valid`, and the service has no reason provider.

- [ ] **Step 3: Implement automatic action selection**

Add this dependency to `Options` and `Service`:

```go
type AutoRejectReasonProvider interface { AutoRejectReason() string }
```

For each succeeded candidate with structured fields, select approve when fields are valid and `Enabled` is true, or reject when fields are invalid and `AutoReject` is true. Use the configured reason for both `BeginMutation.Reason` and `execute`; retain `all_required_ai_fields_valid` as the approval audit reason. Include action in the deterministic idempotency digest so approve and reject operations cannot collide.

Change the storage join predicate to:

```sql
(policy.enabled = TRUE OR policy.auto_reject = TRUE)
```

Wire the existing settings runtime into the service in `internal/management/backend.go`. Rename worker helpers and logs from approval-only terminology to automatic-decision terminology where they describe both actions, retaining compatibility at public call sites only when needed.

- [ ] **Step 4: Verify worker and candidate-query tests pass**

Run: `go test ./internal/groups/joinrequests ./internal/platform/storage -run 'Auto|Automatic|Candidate' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit the automatic worker**

```powershell
git add internal/groups/joinrequests internal/platform/storage/manager_operations.go internal/platform/storage/manager_operations_integration_test.go internal/management/backend.go
git commit -m "feat: automatically reject invalid join requests"
```

### Task 5: Require and normalize manual rejection messages

**Files:**
- Modify: `Resource/Jxh-Go/internal/groups/joinrequests/validation.go`
- Modify: `Resource/Jxh-Go/internal/groups/joinrequests/service.go`
- Modify: `Resource/Jxh-Go/internal/groups/joinrequests/service_test.go`
- Modify: `Resource/Jxh-Go/internal/management/api/join_requests_handlers_test.go`

- [ ] **Step 1: Write failing single and bulk rejection tests**

Cover missing, whitespace-only and 501-rune reject reasons. Add successful single and bulk cases using padded input and assert that one trimmed value reaches `BeginDecisions`, every gateway call and decision history. Confirm approval still accepts no reason.

```go
input := DecisionInput{Action: ActionReject, Reason: "  资料不完整，请重新申请。  "}
_, err := service.Decide(ctx, principal, request.ID, 1, input, "reject-key", mutation)
if err != nil { t.Fatal(err) }
if got := approver.reason; got != "资料不完整，请重新申请。" { t.Fatalf("reason = %q", got) }
```

- [ ] **Step 2: Run the decision tests and observe empty reasons are accepted**

Run: `go test ./internal/groups/joinrequests ./internal/management/api -run 'Reject|Decision|Bulk' -count=1`

Expected: FAIL because reject reasons are optional and the raw value is sent to NapCat after a separately normalized audit value is stored.

- [ ] **Step 3: Normalize once before reservation**

Implement one action-aware helper that trims the input, validates 1-500 runes for reject and 0-500 for approve, and returns the normalized string plus optional pointer. Use that normalized string for `BeginMutation.Reason` and every `execute` call. Return `ErrInvalidInput` before checking or calling NapCat when rejection text is invalid.

- [ ] **Step 4: Verify all manual-decision tests pass**

Run: `go test ./internal/groups/joinrequests ./internal/management/api -run 'Reject|Decision|Bulk' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit manual rejection validation**

```powershell
git add internal/groups/joinrequests internal/management/api/join_requests_handlers_test.go
git commit -m "feat: require manual join rejection messages"
```

### Task 6: Add the global rejection message editor to Vue

**Files:**
- Modify: `jxh-manager/src/components/settings/feature-settings.ts`
- Modify: `jxh-manager/src/views/settings/GlobalSettingsView.vue`
- Modify: `jxh-manager/src/views/groups/__tests__/settings.spec.ts`

- [ ] **Step 1: Write a failing global-settings view test**

Return `join_requests.auto_reject_reason` from the API fixture, edit the textarea, save, and assert the complete patch:

```ts
expect(settingsApi.updateGlobal).toHaveBeenCalledWith(
  expect.objectContaining({
    join_requests: { auto_reject_reason: '请补充学号后重新申请。' },
  }),
  3,
)
```

Also assert blank text disables save and shows a field-level error, and conflict comparison counts a changed rejection message.

- [ ] **Step 2: Run the view test and observe the editor is absent**

Run: `npm run test:unit -- src/views/groups/__tests__/settings.spec.ts --run`

Working directory: `jxh-manager`

Expected: FAIL because the global draft contains only feature settings.

- [ ] **Step 3: Implement the global join-request draft and editor**

Create a global-page draft that contains both `features` and `joinRequests`, trims the message when building the patch, and validates 1-500 Unicode code points. Add an un-nested “入群申请” section with a labeled textarea, character count, disabled state and inline validation. Include the field in dirty detection, conflict comparison and the existing single save operation.

- [ ] **Step 4: Verify global-settings view tests pass**

Run: `npm run test:unit -- src/views/groups/__tests__/settings.spec.ts --run`

Working directory: `jxh-manager`

Expected: PASS.

- [ ] **Step 5: Commit the global settings UI**

```powershell
git add jxh-manager/src/components/settings/feature-settings.ts jxh-manager/src/views/settings/GlobalSettingsView.vue jxh-manager/src/views/groups/__tests__/settings.spec.ts
git commit -m "feat: edit automatic rejection message"
```

### Task 7: Add rejection-aware decision UI and dual policy switches

**Files:**
- Modify: `jxh-manager/src/components/join-requests/DecisionDialog.vue`
- Modify: `jxh-manager/src/components/join-requests/JoinRequestDetail.vue`
- Modify: `jxh-manager/src/views/join-requests/JoinRequestsView.vue`
- Modify: `jxh-manager/src/components/join-requests/__tests__/DecisionDialog.spec.ts`
- Modify: `jxh-manager/src/views/join-requests/__tests__/JoinRequestsView.spec.ts`

- [ ] **Step 1: Write failing dialog and policy interaction tests**

Assert reject mode labels the field “拒绝消息”, states it is sent through NapCat, disables confirmation for trimmed-empty text, and emits trimmed text. Assert approve mode remains optional. Add view tests for independently changing `enabled` and `auto_reject` without overwriting the other value, plus single and bulk reject payloads carrying the entered reason.

```ts
await wrapper.get('[data-test="decision-reason"]').setValue('  资料不完整，请重试。  ')
await wrapper.get('[data-test="confirm-decision"]').trigger('click')
expect(wrapper.emitted('confirm')).toEqual([['资料不完整，请重试。']])
```

- [ ] **Step 2: Run focused UI tests and observe current misleading behavior**

Run: `npm run test:unit -- src/components/join-requests/__tests__/DecisionDialog.spec.ts src/views/join-requests/__tests__/JoinRequestsView.spec.ts --run`

Working directory: `jxh-manager`

Expected: FAIL because rejection is optional, copy says it is not sent, and the detail view exposes only automatic approval.

- [ ] **Step 3: Implement rejection mode and independent policy events**

Make dialog validity action-aware and render inline required feedback. Change the detail event to carry a partial `JoinRequestPolicyPatch`, render two stable toggle rows under “自动处理策略”, and have the view PATCH only the changed field with the current version. Preserve the existing group-without-policy behavior.

- [ ] **Step 4: Verify focused UI tests pass**

Run: `npm run test:unit -- src/components/join-requests/__tests__/DecisionDialog.spec.ts src/views/join-requests/__tests__/JoinRequestsView.spec.ts --run`

Working directory: `jxh-manager`

Expected: PASS.

- [ ] **Step 5: Commit decision and policy UI**

```powershell
git add jxh-manager/src/components/join-requests jxh-manager/src/views/join-requests
git commit -m "feat: send join rejection messages from the panel"
```

### Task 8: Migrate, verify and run the integrated application

**Files:**
- Modify only when a verified integration defect requires a regression test and focused fix.

- [ ] **Step 1: Run backend formatting and full tests**

Run: `gofmt -w` on changed Go files.

Run: `go test ./... -count=1`

Working directory: `Resource/Jxh-Go`

Expected: PASS with zero failing packages.

- [ ] **Step 2: Run frontend generation, unit tests, type-check and build**

Run: `npm run api:generate`

Run: `npm run test:unit -- --run`

Run: `npm run type-check`

Run: `npm run build-only`

Working directory: `jxh-manager`

Expected: all commands exit 0.

- [ ] **Step 3: Back up and migrate the current archived MySQL database**

Identify the running database container and schema with read-only Docker inspection. Create a timestamped `mysqldump --single-transaction --routines --triggers` outside the database data directory, verify the dump is non-empty, then start the backend so migrations advance the schema to revision 011. Query `schema_migrations`, the policy check constraints and existing `auto_reject` values to prove migration success and that no group was enabled implicitly.

- [ ] **Step 4: Start backend and frontend and run browser integration**

Keep services running on available local ports. Log in through the management UI, verify the settings read/update round trip, enable and disable each group policy independently, verify reject confirmation cannot submit blank text, and inspect the decision request payload for the exact trimmed reason. When NapCat is logged in, verify delivery to an applicant; otherwise record the explicit NapCat dependency result and verify no false successful decision is stored.

- [ ] **Step 5: Review the requirement checklist and repository diffs**

Run `git diff --check`, inspect `git status --short`, and compare the implementation against every section in `docs/superpowers/specs/2026-07-29-join-request-rejection-reasons-design.md`. Confirm `Resource/Jxh-Go/data/` remains untracked and untouched.

- [ ] **Step 6: Rebase and fast-forward the parent repository to main**

Fetch no remote changes unless explicitly requested. Rebase the feature branch onto local `main`, switch to `main`, and fast-forward it to the rebased feature commit. Do not create a merge commit. Leave the backend repository on its current branch unless its branch ownership can be proven to belong to this task.
