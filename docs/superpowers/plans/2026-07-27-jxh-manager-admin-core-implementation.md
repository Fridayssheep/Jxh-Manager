# Jxh Manager Admin Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现管理端 HTTP 基础边界、Auth、三档 RBAC、账号与会话管理、统一审计、SSE、系统健康和 NapCat 重启，使对应 17 个 OpenAPI operation 具备完整路由、权限、服务、持久化和契约测试证据。

**Architecture:** `internal/adminapi` 只负责 HTTP、Cookie、DTO 和错误映射；`internal/auth`、`internal/audit`、`internal/idempotency`、`internal/events` 和 `internal/system` 持有业务规则并定义最小 Store/Gateway 接口，`internal/storage` 提供 GORM 实现。所有账号、会话、审计、幂等和系统操作持久化均使用数据库事务；SSE 使用单进程有界 replay ring，未知历史发送 `stream.reset`。

**Tech Stack:** Go 1.25.7、`net/http`、GORM/MySQL 8.4、`golang.org/x/crypto/argon2`、标准库 `crypto/hmac`/`crypto/rand`/`crypto/sha256`、Go `testing` 和现有 fake 风格。

**Prerequisites:** 先完成 foundation plan 的 database、Gateway、health、App 和 deployment tasks。OpenAPI 真源为 `docs/api/jxh-manager-openapi.yaml`；本计划不实现 overview、groups 或 settings 业务 operation。

---

## 实施状态（2026-07-28）

- Tasks 1-13 已全部落地，且后续管理资源阶段已把同一安全边界扩展到 OpenAPI 全部 57 个 operation；路由与 `x-status` 由 `internal/adminapi/management_test.go` 自动核对。
- 认证、账号/会话、审计、幂等、系统操作和运营资源的真实 MySQL 持久化测试已随 `internal/storage` 完整套件通过；迁移与恢复链由 `internal/database` 完整套件通过。
- 安全审查修复已经合入：审计写入前递归脱敏（`e215eea`）、有效会话状态与稳定账号分页（`06197b7`）、提交后认证状态一致（`9ac2f94`）、认证故障和改密限速隔离（`e566549`）、SSE 持续授权校验（`cf2a765`）、按发布时间清理 replay（`82e4136`）、系统操作终态恢复（`5bb2e00`），以及 quote 非 2xx 正文不进入错误和普通日志（`d2c3330`）。
- 最终门禁通过：`go test -race -count=1 ./...`、`go build ./...`、三个命令二进制构建、`go vet ./...`、`go mod tidy -diff`、`docker compose config --quiet`、`git diff --check`。
- 真实 NapCat 重启、QQ 入群审批/发送、WPS 和 quote 上游成功路径仍需部署环境凭据与服务配合；本地完成证据覆盖状态机、幂等、失败/unknown、恢复和 fake gateway 行为，不声称已执行外部副作用。

## Contract Decisions

- 所有 Admin 响应都由 middleware 设置 `X-Request-ID`；错误体使用 OpenAPI `error.code/message/request_id/fields/retryable`，并补齐 404、405、413、415 和 500 的同构错误。
- `system:read` 与 `events:read` 授予三个角色；SSE topic 再按资源读取权限过滤。`napcat:restart`、`users:manage`、`sessions:manage` 仅授予 `super_admin`。
- Argon2id PHC 参数固定为 format version 1、memory 64 MiB、iterations 3、parallelism 2、salt 16 bytes、key 32 bytes；验证旧参数成功后在登录事务内升级。
- 会话 token 和 CSRF token 各使用 32 个随机字节。浏览器只拿 base64url 原值；数据库保存 `HMAC-SHA256(session_secret, domain || token)`。Cookie Path 为 `/api/admin/v1`，不设置 Domain。
- 修改密码的幂等重放通过 deterministic HMAC 派生的新 session/CSRF token、旧 session 的 `replaced_by_session_id` 链和请求 HMAC 完成；数据库不保存密码、原 token 或可逆副本。
- 缺少 `Admin.PublicOrigin` 或不足 32 bytes 的 `SessionSecret` 时只禁用 Admin HTTP 并把依赖状态标为 `misconfigured`；QQ bot 和 `/healthz` 继续运行。生产 `CookieSecure=true`；本地显式配置可关闭。
- 只解析 `X-Forwarded-For`。直接 TCP peer 未命中 `TrustedProxies` 时完全忽略；命中时从右向左剥离可信代理，首个不可信合法 IP 为客户端 IP，格式错误退回 peer。
- 登录限速分别按规范化 username 的 HMAC 和可信 client IP 计数，任一窗口达到阈值即 429；成功清除 username bucket，不清除共享 IP bucket。改密失败按 user ID 使用同一窗口。
- SSE ring 保存最近 2048 条事件且最多 15 分钟；未知或过期 `Last-Event-ID` 先发送 `stream.reset` 后继续当前流。每 15 秒注释心跳，订阅者 buffer 64，持续满载则关闭该订阅。SSE handler 使用 `http.ResponseController.SetWriteDeadline(time.Time{})` 解除普通 30 秒写超时。
- 所有角色都可读健康；MySQL 和 Admin HTTP 决定管理端 readiness，NapCat 只决定依赖 NapCat 的 action 是否可用。重启状态持久化到 `system_operations`，SSE 使用 `system.health_changed` 的 system resource reference 通知刷新。

## File Map

- `internal/auth/types.go`, `permissions.go`: 用户、会话、Principal、Role/Permission 和权限矩阵。
- `internal/auth/password.go`: Argon2id PHC 编码、常量时间校验和参数升级判断。
- `internal/auth/session.go`, `limiter.go`, `service.go`: token 摘要、登录限速、认证、轮换和账号管理规则。
- `internal/audit/types.go`, `redactor.go`, `service.go`: 审计词汇、字段脱敏和事务输入。
- `internal/idempotency/service.go`: actor + operation + key 的并发占位、请求 HMAC 和结果重放。
- `internal/events/hub.go`: 有界 replay、topic 授权、会话撤销和慢订阅者处理。
- `internal/system/service.go`: 健康读取与 NapCat 异步重启状态机。
- `internal/storage/auth.go`, `audit.go`, `idempotency.go`, `system.go`: 对应聚合的 GORM Store。
- `internal/adminapi/server.go`, `router.go`, `middleware.go`, `request.go`, `response.go`, `errors.go`: Admin HTTP 基础设施。
- `internal/adminapi/*_handlers.go`: 17 个 operation 的 handler 和 DTO 映射。
- `cmd/admin-bootstrap/main.go`: 首个超级管理员一次性引导命令。
- `internal/app/app.go`: Admin Server 的启动、依赖注入和关闭。
- `docs/api/jxh-manager-openapi.yaml`: 仅在 operation 完成全部门槛后更新 `x-status`。

### Task 1: 身份类型、权限矩阵和通用协议值

**Files:**
- Create: `Resource/Jxh-Go/internal/auth/types.go`
- Create: `Resource/Jxh-Go/internal/auth/permissions.go`
- Create: `Resource/Jxh-Go/internal/auth/permissions_test.go`
- Create: `Resource/Jxh-Go/internal/adminapi/protocol.go`
- Create: `Resource/Jxh-Go/internal/adminapi/protocol_test.go`

- [x] **Step 1: Write failing permission and protocol tests**

```go
func TestPermissionsMatchRoleMatrix(t *testing.T) {
    if !Allowed(auth.RoleObserver, auth.PermissionAuditRead) { t.Fatal("observer must read redacted audit") }
    if Allowed(auth.RoleMaintainer, auth.PermissionUsersManage) { t.Fatal("maintainer must not manage users") }
    if !Allowed(auth.RoleSuperAdmin, auth.PermissionNapCatRestart) { t.Fatal("super admin must restart NapCat") }
}

func TestParseIfMatchRequiresQuotedPositiveVersion(t *testing.T) {
    version, err := ParseIfMatch(`"7"`)
    if err != nil || version != 7 { t.Fatalf("version=%d err=%v", version, err) }
    if _, err := ParseIfMatch("7"); !errors.Is(err, ErrInvalidIfMatch) { t.Fatalf("got %v", err) }
}
```

- [x] **Step 2: Confirm RED**

Run: `go test ./internal/auth ./internal/adminapi -run 'Test(Permissions|ParseIfMatch)' -count=1`

Expected: packages or symbols are missing.

- [x] **Step 3: Implement exact enums and parsers**

Define all OpenAPI permission strings, `RoleSuperAdmin`, `RoleMaintainer`, `RoleObserver`, immutable permission sets, `Principal.Has`, and `Field[T] struct { Set bool; Value T }` for explicit JSON patch presence. Add strict quoted `If-Match`, `limit` default 50/range 1..100, Idempotency-Key pattern `[A-Za-z0-9._:-]{8,128}`, UTC RFC3339 parsing and opaque string ID validation. Never parse QQ/group/flag identifiers into API-visible numbers.

- [x] **Step 4: Verify and commit**

Run: `gofmt -w internal/auth internal/adminapi; go test ./internal/auth ./internal/adminapi; go vet ./internal/auth ./internal/adminapi; git diff --check`

Commit: `feat: 增加管理端身份与权限模型`

### Task 2: Argon2id password hashing

**Files:**
- Create: `Resource/Jxh-Go/internal/auth/password.go`
- Create: `Resource/Jxh-Go/internal/auth/password_test.go`
- Modify: `Resource/Jxh-Go/go.mod`
- Modify: `Resource/Jxh-Go/go.sum`

- [x] **Step 1: Write failing PHC tests**

```go
func TestPasswordHasherRoundTripAndUpgrade(t *testing.T) {
    h := NewPasswordHasher(DefaultPasswordParams(), bytes.NewReader(bytes.Repeat([]byte{7}, 64)))
    encoded, err := h.Hash([]byte("correct horse battery staple"))
    if err != nil { t.Fatal(err) }
    ok, upgrade, err := h.Verify([]byte("correct horse battery staple"), encoded)
    if err != nil || !ok || upgrade { t.Fatalf("ok=%v upgrade=%v err=%v", ok, upgrade, err) }
    if ok, _, _ := h.Verify([]byte("wrong password"), encoded); ok { t.Fatal("wrong password accepted") }
}

func TestPasswordHasherRejectsHostilePHCParameters(t *testing.T) {
    _, _, err := NewPasswordHasher(DefaultPasswordParams(), rand.Reader).Verify([]byte("x"), "$argon2id$v=19$m=4294967295,t=3,p=2$AA$AA")
    if !errors.Is(err, ErrInvalidPasswordHash) { t.Fatalf("got %v", err) }
}
```

- [x] **Step 2: Confirm RED**

Run: `go test ./internal/auth -run TestPasswordHasher -count=1`

Expected: `NewPasswordHasher` is missing.

- [x] **Step 3: Implement bounded PHC parsing and verification**

Use the fixed parameters from Contract Decisions. Reject malformed base64, unknown algorithm/version, salt outside 16..32 bytes, key outside 16..64 bytes, memory above 256 MiB, iterations above 10 and parallelism above 8 before allocating. Compare derived keys with `subtle.ConstantTimeCompare`; password length enforcement remains service-level OpenAPI validation.

- [x] **Step 4: Verify and commit**

Run: `gofmt -w internal/auth/password.go internal/auth/password_test.go; go test -race ./internal/auth; go mod tidy; go mod tidy -diff; go vet ./internal/auth; git diff --check`

Commit: `feat: 实现 Argon2id 密码哈希与参数升级`

### Task 3: Auth, audit and idempotency persistence

**Files:**
- Create: `Resource/Jxh-Go/internal/storage/auth.go`
- Create: `Resource/Jxh-Go/internal/storage/audit.go`
- Create: `Resource/Jxh-Go/internal/storage/idempotency.go`
- Create: `Resource/Jxh-Go/internal/storage/auth_test.go`
- Create: `Resource/Jxh-Go/internal/auth/store.go`
- Create: `Resource/Jxh-Go/internal/audit/types.go`
- Create: `Resource/Jxh-Go/internal/idempotency/types.go`

- [x] **Step 1: Write failing transaction and conditional-update tests**

```go
func TestUpdateUserProtectsLastEnabledSuperAdmin(t *testing.T) {
    store := openIntegrationStore(t)
    user := seedOnlySuperAdmin(t, store)
    _, err := store.UpdateAdminUser(t.Context(), user.ID, user.Version, auth.UserPatch{Enabled: auth.Field[bool]{Set:true, Value:false}}, audit.Context{RequestID: "req_test"})
    if !errors.Is(err, auth.ErrLastSuperAdmin) { t.Fatalf("got %v", err) }
}

func TestReserveIdempotencyKeyRejectsDifferentRequestHash(t *testing.T) {
    first := idempotency.Reservation{ActorID:"usr_1", Operation:"sessions.revoke", Key:"retry-key", RequestHash:"hash_a"}
    if _, err := store.ReserveIdempotency(t.Context(), first); err != nil { t.Fatal(err) }
    first.RequestHash = "hash_b"
    if _, err := store.ReserveIdempotency(t.Context(), first); !errors.Is(err, idempotency.ErrKeyReused) { t.Fatalf("got %v", err) }
}
```

- [x] **Step 2: Confirm RED**

Run unit fakes first: `go test ./internal/storage -run 'Test(UpdateUser|ReserveIdempotency)' -count=1`

Expected: store methods are missing. Real MySQL tests remain skipped unless `JXH_MYSQL_INTEGRATION_DSN` is set.

- [x] **Step 3: Implement aggregate-specific Store methods**

Use `SELECT ... FOR UPDATE` or one conditional transaction to protect the last enabled super admin. Username is normalized lowercase before insert and remains immutable. Every successful mutation writes its audit row in the same transaction. Session queries never select token or CSRF digests into API DTOs. Idempotency reservation uses the database unique key and reads the winning row after duplicate-key races.

- [x] **Step 4: Verify and commit**

Run: `gofmt -w internal/storage internal/auth/store.go internal/audit internal/idempotency; go test -race ./internal/storage ./internal/auth ./internal/audit ./internal/idempotency; go test ./...; go vet ./...; git diff --check`

Commit: `feat: 增加账号会话审计与幂等持久化`

### Task 4: Login limiter and server-side sessions

**Files:**
- Create: `Resource/Jxh-Go/internal/auth/limiter.go`
- Create: `Resource/Jxh-Go/internal/auth/limiter_test.go`
- Create: `Resource/Jxh-Go/internal/auth/session.go`
- Create: `Resource/Jxh-Go/internal/auth/service.go`
- Create: `Resource/Jxh-Go/internal/auth/service_test.go`

- [x] **Step 1: Write failing login/session tests**

```go
func TestLoginUsesUniformCredentialsErrorAndRotatesSession(t *testing.T) {
    svc, store := newAuthFixture(t)
    _, _, err := svc.Login(t.Context(), LoginInput{Username:"known", Password:"wrong", ClientIP:"192.0.2.1"})
    if !errors.Is(err, ErrInvalidCredentials) { t.Fatalf("got %v", err) }
    context, credentials, err := svc.Login(t.Context(), LoginInput{Username:"known", Password:"valid-password-123", ClientIP:"192.0.2.1"})
    if err != nil || credentials.SessionToken == "" || credentials.CSRFToken == "" { t.Fatalf("context=%+v err=%v", context.User, err) }
    if store.RawTokenPersisted() { t.Fatal("raw token persisted") }
}

func TestAuthenticateEnforcesIdleAndAbsoluteExpiry(t *testing.T) {
    svc := newExpiredSessionFixture(t)
    if _, err := svc.Authenticate(t.Context(), "expired-token"); !errors.Is(err, ErrUnauthenticated) { t.Fatalf("got %v", err) }
}
```

- [x] **Step 2: Confirm RED**

Run: `go test ./internal/auth -run 'Test(Login|Authenticate)' -count=1`

Expected: service methods are missing.

- [x] **Step 3: Implement session and limiter behavior**

Always execute one Argon2 verification using a fixed dummy PHC hash for unknown/disabled users. Count failures in bounded username-HMAC and IP buckets; cap the map and remove expired buckets. Generate independent random session/CSRF tokens, persist only domain-separated HMAC digests, enforce absolute and idle deadlines, and touch `last_seen_at` at most once per minute using a conditional update. Rotation revokes the prior session in the same transaction.

- [x] **Step 4: Verify and commit**

Run: `gofmt -w internal/auth; go test -race ./internal/auth; go test ./...; go vet ./...; git diff --check`

Commit: `feat: 实现登录限速与服务端会话`

### Task 5: First super-admin bootstrap CLI

**Files:**
- Create: `Resource/Jxh-Go/cmd/admin-bootstrap/main.go`
- Create: `Resource/Jxh-Go/cmd/admin-bootstrap/run.go`
- Create: `Resource/Jxh-Go/cmd/admin-bootstrap/run_test.go`

- [x] **Step 1: Write failing non-interactive safety tests**

```go
func TestRunCreatesOnlyTheFirstSuperAdmin(t *testing.T) {
    store := &fakeBootstrapStore{}
    err := run(t.Context(), []string{"-username", "root-admin", "-display-name", "Root"}, strings.NewReader("valid-password-123\n"), io.Discard, store)
    if err != nil { t.Fatal(err) }
    if store.created.Role != auth.RoleSuperAdmin { t.Fatalf("role=%s", store.created.Role) }
    if err := run(t.Context(), nil, strings.NewReader("another-password-123\n"), io.Discard, store); !errors.Is(err, ErrAdminAlreadyExists) { t.Fatalf("got %v", err) }
}
```

- [x] **Step 2: Confirm RED**

Run: `go test ./cmd/admin-bootstrap -count=1`

Expected: package/run function is missing.

- [x] **Step 3: Implement one-time bootstrap**

Read the password from a terminal without echo when interactive or from stdin only when explicitly passed `-password-stdin`; never accept a password flag or log it. Require zero existing admin users in the transaction, create one enabled super admin at version 1, and emit only the new user ID/username.

- [x] **Step 4: Verify and commit**

Run: `gofmt -w cmd/admin-bootstrap; go test ./cmd/admin-bootstrap; go build ./cmd/admin-bootstrap; go vet ./cmd/admin-bootstrap; git diff --check`

Commit: `feat: 增加首个超级管理员引导命令`

### Task 6: User/session administration and audit services

**Files:**
- Create: `Resource/Jxh-Go/internal/auth/admin_service.go`
- Create: `Resource/Jxh-Go/internal/auth/admin_service_test.go`
- Create: `Resource/Jxh-Go/internal/audit/redactor.go`
- Create: `Resource/Jxh-Go/internal/audit/service.go`
- Create: `Resource/Jxh-Go/internal/audit/service_test.go`
- Create: `Resource/Jxh-Go/internal/idempotency/service.go`
- Create: `Resource/Jxh-Go/internal/idempotency/service_test.go`

- [x] **Step 1: Write failing service tests**

```go
func TestObserverAuditRedactionRemovesSecurityValues(t *testing.T) {
    got := audit.RedactForRole(audit.Log{TargetType:"admin_session", Before:map[string]any{"token_digest":"secret","enabled":true}}, auth.RoleObserver)
    if got.Before["token_digest"] != "[redacted]" { t.Fatalf("before=%v", got.Before) }
}

func TestResetPasswordUsesRevisionAndRevokesAllSessions(t *testing.T) {
    svc, store := newAdminServiceFixture(t)
    result, err := svc.ResetPassword(t.Context(), superPrincipal(), "usr_target", 2, "new-valid-password", "idem-reset-1")
    if err != nil { t.Fatal(err) }
    if result.RevokedSessionCount != 2 || store.AuditCount() != 1 { t.Fatalf("result=%+v audits=%d", result, store.AuditCount()) }
}
```

- [x] **Step 2: Confirm RED**

Run: `go test ./internal/auth ./internal/audit ./internal/idempotency -run 'Test(Observer|ResetPassword)' -count=1`

Expected: services are missing.

- [x] **Step 3: Implement exact application rules**

Create/list/get/update users; list/revoke sessions; reset passwords; enforce role permission before Store calls; hash canonical JSON request bodies with HMAC for idempotency; replay only completed safe DTOs; mark interrupted external outcomes unknown. Audit redactor recursively replaces denylisted keys and values with `[redacted]`, truncates safe strings to schema limits, and always removes password, token, digest, secret, key, authorization, cookie, verification message and upstream raw fields.

- [x] **Step 4: Verify and commit**

Run: `gofmt -w internal/auth internal/audit internal/idempotency; go test -race ./internal/auth ./internal/audit ./internal/idempotency; go vet ./...; git diff --check`

Commit: `feat: 实现管理员账号会话与审计服务`

### Task 7: Admin HTTP middleware and server

**Files:**
- Create: `Resource/Jxh-Go/internal/adminapi/server.go`
- Create: `Resource/Jxh-Go/internal/adminapi/router.go`
- Create: `Resource/Jxh-Go/internal/adminapi/middleware.go`
- Create: `Resource/Jxh-Go/internal/adminapi/request.go`
- Create: `Resource/Jxh-Go/internal/adminapi/response.go`
- Create: `Resource/Jxh-Go/internal/adminapi/errors.go`
- Create: `Resource/Jxh-Go/internal/adminapi/middleware_test.go`

- [x] **Step 1: Write failing HTTP boundary tests**

```go
func TestMutatingRouteRejectsUntrustedOriginAndCSRF(t *testing.T) {
    api := newHTTPFixture(t)
    req := httptest.NewRequest(http.MethodPost, "/api/admin/v1/auth/logout", nil)
    req.AddCookie(validSessionCookie(t))
    req.Header.Set("Origin", "https://attacker.example")
    rr := httptest.NewRecorder()
    api.ServeHTTP(rr, req)
    if rr.Code != http.StatusForbidden || decodeError(t, rr).Code != "origin_forbidden" { t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String()) }
}

func TestOversizedBodyUsesErrorEnvelope(t *testing.T) {
    api := newHTTPFixture(t)
    rr := doJSON(t, api, http.MethodPost, "/api/admin/v1/auth/login", strings.Repeat("x", 1025))
    if rr.Code != http.StatusRequestEntityTooLarge || decodeError(t, rr).RequestID == "" { t.Fatalf("status=%d", rr.Code) }
}
```

- [x] **Step 2: Confirm RED**

Run: `go test ./internal/adminapi -run 'Test(Mutating|Oversized)' -count=1`

Expected: HTTP server is missing.

- [x] **Step 3: Implement middleware in fixed order**

Order: recover -> request ID -> security/cache headers -> body limit/content type -> client IP -> authentication -> Origin -> CSRF -> permission -> handler. Generate request IDs from 16 random bytes and never trust inbound IDs. Parse exact configured Origin with scheme/host/normalized port and reject missing, `null`, userinfo, path/query/fragment on browser mutations. Set HTTP server timeouts from `AdminConfig`; panic responses and logs contain request ID but not panic values or request bodies.

- [x] **Step 4: Verify and commit**

Run: `gofmt -w internal/adminapi; go test -race ./internal/adminapi; go test ./...; go vet ./...; git diff --check`

Commit: `feat: 增加管理端 HTTP 安全边界`

### Task 8: Auth HTTP operations

**Files:**
- Create: `Resource/Jxh-Go/internal/adminapi/dto.go`
- Create: `Resource/Jxh-Go/internal/adminapi/auth_handlers.go`
- Create: `Resource/Jxh-Go/internal/adminapi/auth_handlers_test.go`
- Modify: `Resource/Jxh-Go/internal/adminapi/router.go`

- [x] **Step 1: Write failing contract tests for four routes**

```go
func TestLoginSetsStrictCookieWithoutReturningToken(t *testing.T) {
    api := newAuthHTTPFixture(t)
    rr := doJSON(t, api, http.MethodPost, "/api/admin/v1/auth/login", `{"username":"root-admin","password":"valid-password-123"}`)
    if rr.Code != http.StatusOK { t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String()) }
    cookie := rr.Result().Cookies()[0]
    if !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteStrictMode || cookie.Path != "/api/admin/v1" { t.Fatalf("cookie=%+v", cookie) }
    if strings.Contains(rr.Body.String(), "session_token") { t.Fatal("session token leaked") }
}
```

- [x] **Step 2: Confirm RED**

Run: `go test ./internal/adminapi -run 'Test(Login|CurrentAdmin|Logout|ChangePassword)' -count=1`

Expected: routes return 404.

- [x] **Step 3: Implement exact OpenAPI responses**

Register login/me/logout/change-password. Decode one JSON object with unknown fields rejected and no trailing value. Login errors never reveal existence/disabled status. Logout is idempotent for the current authenticated session but still requires CSRF. Change-password uses the idempotency rotation chain; a retry with the replaced old Cookie and identical request reissues the same deterministic new Cookie/AuthContext, while a different request hash returns 409.

- [x] **Step 4: Verify and commit**

Run: `gofmt -w internal/adminapi; go test -race ./internal/adminapi; go test ./...; go vet ./...; git diff --check`

Commit: `feat: 接入管理端认证接口`

### Task 9: Admin user and session HTTP operations

**Files:**
- Create: `Resource/Jxh-Go/internal/adminapi/users_handlers.go`
- Create: `Resource/Jxh-Go/internal/adminapi/users_handlers_test.go`
- Create: `Resource/Jxh-Go/internal/adminapi/sessions_handlers.go`
- Create: `Resource/Jxh-Go/internal/adminapi/sessions_handlers_test.go`
- Modify: `Resource/Jxh-Go/internal/adminapi/router.go`

- [x] **Step 1: Write failing role, revision and idempotency table tests**

```go
func TestUpdateUserRequiresSuperAdminAndIfMatch(t *testing.T) {
    api := newAdminUsersFixture(t)
    rr := doAs(t, api, maintainerPrincipal(), http.MethodPatch, "/api/admin/v1/users/usr_1", `{"enabled":false}`, nil)
    if rr.Code != http.StatusForbidden { t.Fatalf("status=%d", rr.Code) }
    rr = doAs(t, api, superPrincipal(), http.MethodPatch, "/api/admin/v1/users/usr_1", `{"enabled":false}`, nil)
    if rr.Code != http.StatusPreconditionRequired { t.Fatalf("status=%d", rr.Code) }
}
```

- [x] **Step 2: Confirm RED**

Run: `go test ./internal/adminapi -run 'Test(UpdateUser|CreateUser|ListUsers|ResetPassword|RevokeSession)' -count=1`

Expected: routes return 404.

- [x] **Step 3: Implement eight operations**

Implement `/users` GET/POST, `/users/{user_id}` GET/PATCH, password reset, user session revoke, `/sessions` GET and session revoke. Use stable `(created_at,id)` or `(last_seen_at,id)` cursor ordering bound to the normalized filters. Return 428 only for missing/invalid If-Match and 409 for a valid stale version. Self-revocation clears the caller Cookie and publishes `auth.session_revoked`; resetting the caller's own password returns success but leaves no authenticated session.

- [x] **Step 4: Verify and commit**

Run: `gofmt -w internal/adminapi; go test -race ./internal/adminapi; go test ./...; go vet ./...; git diff --check`

Commit: `feat: 接入管理员账号与会话接口`

### Task 10: Audit query HTTP operations

**Files:**
- Create: `Resource/Jxh-Go/internal/adminapi/audit_handlers.go`
- Create: `Resource/Jxh-Go/internal/adminapi/audit_handlers_test.go`
- Modify: `Resource/Jxh-Go/internal/adminapi/router.go`

- [x] **Step 1: Write failing filter and redaction tests**

```go
func TestObserverGetsRedactedAuditDetail(t *testing.T) {
    api := newAuditHTTPFixture(t)
    rr := doAs(t, api, observerPrincipal(), http.MethodGet, "/api/admin/v1/audit-logs/aud_1", "", nil)
    if rr.Code != http.StatusOK { t.Fatalf("status=%d", rr.Code) }
    body := rr.Body.String()
    if strings.Contains(body, "token_digest") || !strings.Contains(body, "[redacted]") { t.Fatalf("body=%s", body) }
}
```

- [x] **Step 2: Confirm RED**

Run: `go test ./internal/adminapi -run TestObserverGetsRedactedAuditDetail -count=1`

Expected: route returns 404.

- [x] **Step 3: Implement list/detail mapping**

Validate all enums and `from <= to`, cap action/target filters, and order by `(occurred_at DESC, audit_log_id DESC)`. Apply redaction at read time using the current role in addition to write-time denylist sanitization. Set `Cache-Control: no-store`; never audit audit-read operations themselves to avoid recursive unbounded writes.

- [x] **Step 4: Verify and commit**

Run: `gofmt -w internal/adminapi; go test -race ./internal/adminapi ./internal/audit; go vet ./...; git diff --check`

Commit: `feat: 接入管理审计查询接口`

### Task 11: Replayable event hub and SSE operation

**Files:**
- Create: `Resource/Jxh-Go/internal/events/hub.go`
- Create: `Resource/Jxh-Go/internal/events/hub_test.go`
- Create: `Resource/Jxh-Go/internal/adminapi/events_handler.go`
- Create: `Resource/Jxh-Go/internal/adminapi/events_handler_test.go`
- Modify: `Resource/Jxh-Go/internal/adminapi/router.go`

- [x] **Step 1: Write failing replay/reset/backpressure tests**

```go
func TestSubscribeResetsExpiredCursorThenContinues(t *testing.T) {
    hub := NewHub(Options{Capacity:2, Retention:15*time.Minute, SubscriberBuffer:64})
    hub.Publish(eventAt("evt_2", time.Unix(2, 0)))
    hub.Publish(eventAt("evt_3", time.Unix(3, 0)))
    sub, state, err := hub.Subscribe(t.Context(), auth.AllowedTopics(observerPrincipal()), nil, "evt_1")
    if err != nil || state != ReplayReset { t.Fatalf("state=%v err=%v", state, err) }
    if got := <-sub.Events(); got.Type != EventStreamReset { t.Fatalf("event=%+v", got) }
}
```

- [x] **Step 2: Confirm RED**

Run: `go test ./internal/events ./internal/adminapi -run 'Test(Subscribe|SSE)' -count=1`

Expected: hub/SSE handler is missing.

- [x] **Step 3: Implement immutable event envelopes and streaming**

Generate opaque event IDs from the injected ID source, copy payload values before publication, enforce topic permissions, replay retained events in order, then join live delivery without a gap under one hub lock. SSE writes `id`, `event`, `retry: 3000`, compact JSON `data`, flushes every frame, sends `: heartbeat` every 15 seconds, and closes on context/session revoke/slow subscriber. Never include application text, applicant message, command arguments or upstream errors.

- [x] **Step 4: Verify and commit**

Run: `gofmt -w internal/events internal/adminapi; go test -race ./internal/events ./internal/adminapi; go vet ./...; git diff --check`

Commit: `feat: 增加可重放的管理事件中心`

### Task 12: System health and asynchronous NapCat restart

**Files:**
- Create: `Resource/Jxh-Go/internal/system/service.go`
- Create: `Resource/Jxh-Go/internal/system/service_test.go`
- Create: `Resource/Jxh-Go/internal/storage/system.go`
- Create: `Resource/Jxh-Go/internal/adminapi/system_handlers.go`
- Create: `Resource/Jxh-Go/internal/adminapi/system_handlers_test.go`
- Modify: `Resource/Jxh-Go/internal/adminapi/router.go`

- [x] **Step 1: Write failing unavailable/unknown restart tests**

```go
func TestRestartReturnsUnavailableBeforeSideEffect(t *testing.T) {
    svc := newSystemFixture(t, gatewayUnavailable())
    _, err := svc.RestartNapCat(t.Context(), superPrincipal(), RestartInput{Confirmation:"restart"}, "restart-key")
    if !errors.Is(err, ErrNapCatUnavailable) { t.Fatalf("got %v", err) }
}

func TestAcceptedRestartPersistsUnknownOnDisconnect(t *testing.T) {
    svc, store := newDisconnectingSystemFixture(t)
    op, err := svc.RestartNapCat(t.Context(), superPrincipal(), RestartInput{Confirmation:"restart"}, "restart-key")
    if err != nil || op.Status != StatusAccepted { t.Fatalf("op=%+v err=%v", op, err) }
    waitFor(t, func() bool { return store.Operation(op.ID).Status == StatusUnknown })
}
```

- [x] **Step 2: Confirm RED**

Run: `go test ./internal/system ./internal/adminapi -run 'Test(Restart|SystemHealth)' -count=1`

Expected: system service/handlers are missing.

- [x] **Step 3: Implement health mapping and restart state machine**

Map every health component independently to OpenAPI `DependencyHealth`; never probe synchronously in the GET handler. Restart validates exact confirmation, reserves idempotency, writes accepted operation and requested audit before launching one bounded worker. Gateway unavailable before invocation returns 503 without accepted state; disconnect/timeout after invocation records unknown; confirmed SDK success records succeeded; sanitized error codes only. Every transition publishes `system.health_changed` and a final audit record.

- [x] **Step 4: Verify and commit**

Run: `gofmt -w internal/system internal/storage/system.go internal/adminapi; go test -race ./internal/system ./internal/adminapi; go test ./...; go vet ./...; git diff --check`

Commit: `feat: 实现管理端健康与 NapCat 重启接口`

### Task 13: App wiring, contract evidence and OpenAPI status

**Files:**
- Modify: `Resource/Jxh-Go/internal/app/app.go`
- Modify: `Resource/Jxh-Go/internal/app/app_test.go`
- Modify: `Resource/Jxh-Go/cmd/bot/main.go`
- Create: `Resource/Jxh-Go/internal/adminapi/openapi_contract_test.go`
- Modify: `docs/api/jxh-manager-openapi.yaml`
- Modify: `docs/superpowers/plans/2026-07-27-jxh-manager-openapi-coverage.md`

- [x] **Step 1: Write failing lifecycle and contract coverage tests**

```go
func TestAppShutsAdminServerBeforeDatabase(t *testing.T) {
    order := runAndCancelApp(t)
    assertBefore(t, order, "admin_http_shutdown", "database_close")
}

func TestImplementedAdminCoreOperationsHaveRoutes(t *testing.T) {
    spec := loadOpenAPI(t)
    for _, id := range adminCoreOperationIDs() {
        requireOperationRouteAndStatus(t, spec, id, "implemented")
    }
}
```

- [x] **Step 2: Confirm RED**

Run: `go test ./internal/app ./internal/adminapi -run 'Test(AppShuts|ImplementedAdminCore)' -count=1`

Expected: Admin server is not wired and operations remain planned.

- [x] **Step 3: Compose services and update only proven operations**

Construct stores/services/router once in `app.New`, start Admin HTTP only when secure config is valid, update its health component, and close listener/subscriptions before DB. Mark exactly these 17 operation IDs implemented: `loginAdmin`, `getCurrentAdmin`, `logoutAdmin`, `changeOwnPassword`, both audit operations, six user/session-scoped operations, two standalone session operations, `getSystemHealth`, `restartNapCat`, `subscribeAdminEvents`. Preserve all other `planned` statuses.

- [x] **Step 4: Run full verification**

Run: `go test -race ./...; go build ./...; go vet ./...; go mod tidy -diff; git diff --check; docker compose config --quiet`

When MySQL is available, also run the environment-gated integration tests for last-super-admin locking, unique username/QQ, session revocation, idempotency races, audit pagination and restart operation persistence. Record unavailable Docker/QQ integration honestly.

- [x] **Step 5: Commit integration and contract evidence**

Commit bot wiring: `refactor: 将管理 HTTP 服务接入应用生命周期`

Commit contract/docs separately: `docs: 标记基础管理接口为已实现`

## Completion Gate

- All 17 operations have route, authentication/permission, input validation, application service, persistence/external effect and contract-test evidence.
- Three roles are exhaustively tested against every permission; all mutations prove CSRF, audit and revision/idempotency behavior where contracted.
- No API/log/audit/test failure output contains password, raw session/CSRF token, digest, static secret, DSN, OneBot token or raw upstream payload.
- SSE replay/reset/heartbeat/session revoke and server shutdown pass under `-race` without leaked goroutines.
- Real MySQL evidence exists for transaction and uniqueness rules; isolated NapCat restart integration remains explicitly external until a real test environment is available.
