# Jxh Manager Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为全部管理 API 建立可升级数据库、完整运行配置、受控生命周期和单连接 NapCat Gateway，同时保持现有 QQ bot 行为不变。

**Architecture:** 管理端继续与 bot 运行在同一 Go 进程。`internal/platform/database` 独立负责 DSN、连接池、探测、关闭和版本迁移；`internal/platform/napcat.Gateway` 原子持有当前 SDK client 并向消息管线和后续应用服务提供小型能力；`internal/platform/app` 成为组合根。迁移通过独立 `jxh-migrate` 命令在 bot 启动前执行，运行时禁止 `AutoMigrate`。

**Tech Stack:** Go 1.25.7、标准库 `database/sql`/`net/http`/`sync/atomic`、GORM 1.31、MySQL driver 1.10、NapCat SDK 1.0.2、Docker Compose、Go `testing`。

---

## 实施状态（2026-07-28）

- Tasks 1-6 已全部落地。运行时使用独立 `jxh-migrate`、连续且不可变的 001-009 migration manifest、数据库锁和 checksum ledger；Bot 运行连接禁用 multi-statements，且代码中不存在 `AutoMigrate`。
- 真实 MySQL 8.4 完整验证已通过：`go test -race -count=1 ./internal/platform/database`（363.694s）覆盖空库、历史 schema 采纳、部分 ledger、失败恢复、锁竞争、漂移拒绝、原始 init baseline 与 009；`go test -race -count=1 ./internal/platform/storage`（126.328s）覆盖全部管理持久化实现。两组测试结束后 `jxh_migration_test_*` 与 `jxh_manager_*_test_*` 残留 schema 均为 0。
- Docker 镜像构建和权限检查已通过：`/app/migrations` 为 `root:root 0555`，SQL 文件为 `root:root 0444`，运行用户只读；`docker compose config --quiet` 通过，Bot 由 one-shot migrate service 成功后才启动。
- 最终门禁通过：`go test -race -count=1 ./...`、`go build ./...`、三个命令二进制构建、`go vet ./...`、`go mod tidy -diff`、`docker compose config --quiet`、`git diff --check`。
- 关键完成提交包括 `0d04320`（迁移链）、`4ab0e5f`/`642650d`（数据库生命周期与单次受限探测）、`400a3c1`（NapCat 会话任务退出）、`7b7c282`（组件健康）、`49fdd3c`（迁移只读权限）和 `1280da1`（009 恢复场景）。
- 真实 QQ/NapCat 连接及外部 WPS、AI、quote 服务调用仍属于部署环境联调范围，不作为 foundation 本地完成证据。

## File Map

- `internal/platform/config/config.go`: 管理监听、会话和数据库池配置及环境变量。
- `internal/platform/config/config_test.go`: 默认值、归一化和环境覆盖测试。
- `internal/platform/database/config.go`: 安全构建运行 DSN 与迁移 DSN。
- `internal/platform/database/database.go`: 打开、Ping、连接池和 Close。
- `internal/platform/database/migrate.go`: 迁移 manifest、校验和、数据库锁和顺序执行。
- `internal/platform/database/*_test.go`: 无数据库纯函数测试；真实 MySQL 集成测试由环境变量显式启用。
- `cmd/migrate/main.go`: 独立迁移 CLI。
- `deploy/mysql/migrations/*.sql`: 001-007 历史链、008 管理平台 schema 与 009 知识库重载操作扩展。
- `deploy/mysql/init/001_schema.sql`: 当前完整空库 schema 和 migration 版本基线。
- `internal/platform/napcat/gateway.go`: 并发安全 client、连接状态和能力入口。
- `internal/platform/napcat/gateway_test.go`: 连接切换、离线错误和快照测试。
- `internal/platform/napcat/adapter.go`: Server 连接建立/断开时挂载 Gateway。
- `internal/platform/app/app.go`: 进程组件的启动、关闭和状态。
- `internal/platform/health/service.go`: 存活/就绪与依赖快照。
- `cmd/bot/main.go`: 仅解析参数、加载配置、构建 App 和运行。
- `Dockerfile`, `docker-compose.yaml`, `Makefile`, `config.example.yaml`: 构建及部署迁移流程。

### Task 1: 管理端与数据库运行配置

**Files:**
- Modify: `Resource/Jxh-Go/internal/platform/config/config.go`
- Create: `Resource/Jxh-Go/internal/platform/config/config_test.go`
- Modify: `Resource/Jxh-Go/config.example.yaml`

- [x] **Step 1: Write failing default and environment tests**

```go
func TestDefaultIncludesAdminAndDatabasePool(t *testing.T) {
    cfg := Default()
    if cfg.Admin.Addr != "127.0.0.1:8090" || cfg.Admin.SessionTTLSeconds != 43200 {
        t.Fatalf("unexpected admin defaults: %+v", cfg.Admin)
    }
    if cfg.Database.MaxOpenConns != 20 || cfg.Database.MaxIdleConns != 10 {
        t.Fatalf("unexpected pool defaults: %+v", cfg.Database)
    }
}

func TestLoadAppliesAdminEnvironment(t *testing.T) {
    t.Setenv("JXH_ADMIN_ADDR", ":9090")
    t.Setenv("JXH_ADMIN_COOKIE_SECURE", "false")
    cfg, err := Load("")
    if err != nil { t.Fatal(err) }
    if cfg.Admin.Addr != ":9090" || cfg.Admin.CookieSecure { t.Fatalf("%+v", cfg.Admin) }
}
```

- [x] **Step 2: Run the focused test and confirm RED**

Run: `go test ./internal/platform/config -run 'Test(DefaultIncludesAdmin|LoadAppliesAdmin)' -count=1`

Expected: compile failure because `Config.Admin`, `AdminConfig`, and pool fields do not exist.

- [x] **Step 3: Add normalized typed configuration**

Add `AdminConfig` with `Addr`, `PublicOrigin`, `CookieSecure`, `SessionTTLSeconds`, `SessionIdleTimeoutSeconds`, `LoginWindowSeconds`, `LoginMaxAttempts`, and `TrustedProxies`; extend `DatabaseConfig` with `MaxOpenConns`, `MaxIdleConns`, `ConnMaxLifetimeSeconds`, `ConnMaxIdleTimeSeconds`, and `PingTimeoutSeconds`. Runtime constructors convert these explicit second values to `time.Duration`. Do not put the session HMAC secret, telemetry HMAC secret, passwords, or OneBot token into API-visible runtime settings.

- [x] **Step 4: Run focused and package tests**

Run: `go test ./internal/platform/config -count=1`

Expected: PASS.

- [x] **Step 5: Verify and commit configuration**

Run: `gofmt -w internal/platform/config/config.go internal/platform/config/config_test.go; go test ./...; go build ./...; go vet ./...; git diff --check`

Commit: `feat: 增加管理端基础配置`

### Task 2: 版本化迁移 manifest 与 CLI

**Files:**
- Create: `Resource/Jxh-Go/internal/platform/database/migrate.go`
- Create: `Resource/Jxh-Go/internal/platform/database/migrate_test.go`
- Create: `Resource/Jxh-Go/cmd/migrate/main.go`
- Create: `Resource/Jxh-Go/deploy/mysql/migrations/001_create_core_schema.sql`
- Restore: `Resource/Jxh-Go/deploy/mysql/migrations/002_add_run_date_to_scheduled_jobs.sql`
- Restore: `Resource/Jxh-Go/deploy/mysql/migrations/003_expand_group_request_flag.sql`
- Restore: `Resource/Jxh-Go/deploy/mysql/migrations/004_use_binary_collation_for_identifiers.sql`
- Restore: `Resource/Jxh-Go/deploy/mysql/migrations/005_automate_group_request_processing.sql`
- Restore: `Resource/Jxh-Go/deploy/mysql/migrations/006_reparse_group_request_applicants.sql`
- Create: `Resource/Jxh-Go/deploy/mysql/migrations/007_remove_group_request_system_request_id.sql`
- Create: `Resource/Jxh-Go/deploy/mysql/migrations/008_create_manager_schema.sql`
- Create: `Resource/Jxh-Go/deploy/mysql/migrations/009_support_knowledge_reload_operations.sql`
- Modify: `Resource/Jxh-Go/deploy/mysql/init/001_schema.sql`
- Modify: `Resource/Jxh-Go/.gitattributes`

- [x] **Step 1: Write failing manifest validation tests**

```go
func TestLoadMigrationsRequiresContiguousImmutableVersions(t *testing.T) {
    dir := t.TempDir()
    writeMigration(t, dir, "001_first.sql", "SELECT 1;")
    writeMigration(t, dir, "003_gap.sql", "SELECT 3;")
    _, err := LoadMigrations(dir)
    if !errors.Is(err, ErrMigrationSequence) { t.Fatalf("got %v", err) }
}

func TestLoadMigrationsComputesStableSHA256(t *testing.T) {
    dir := t.TempDir()
    writeMigration(t, dir, "001_first.sql", "SELECT 1;\n")
    migrations, err := LoadMigrations(dir)
    if err != nil { t.Fatal(err) }
    if migrations[0].Version != 1 || len(migrations[0].Checksum) != 64 { t.Fatalf("%+v", migrations[0]) }
}
```

- [x] **Step 2: Run the test and confirm RED**

Run: `go test ./internal/platform/database -run TestLoadMigrations -count=1`

Expected: compile failure because `LoadMigrations` and `ErrMigrationSequence` do not exist.

- [x] **Step 3: Implement manifest loading and runner**

Use filename pattern `^[0-9]{3}_[a-z0-9_]+\.sql$`, require versions start at 1 and are contiguous, reject empty scripts, and calculate lowercase SHA-256. `Runner.Apply` must acquire `GET_LOCK('jxh_manager_migrations', timeout)`, create `schema_migrations(version, name, checksum, applied_at)`, reject checksum/name drift, execute pending scripts in order, record each version only after successful execution, and always release the lock. Migration connections enable `multiStatements=true`; bot runtime connections do not. Add `*.sql text eol=lf` before freezing checksums so Windows and Linux load identical bytes.

If `schema_migrations` is absent or exists with zero rows but core bot tables already exist, the runner must not execute 001-007 blindly. Under the same database lock, inspect `information_schema` and adopt only a conservatively proven historical baseline. At minimum, recognize the `c581408` post-007 schema used by the immediately preceding release; for the structurally indistinguishable 005/006 pair, adopt 005 and re-run the idempotent data cleanup in 006. Write all adopted 001..N ledger rows in one `sql.Tx` on the locked connection so a failed insert cannot leave a partial baseline. A non-empty partial ledger is validated strictly and never auto-completed. Partial, ambiguous, or unknown schemas fail closed with a typed legacy-schema error and execute no business DDL.

- [x] **Step 4: Restore legacy history and add manager schema**

`001` creates the original three core tables. Restore 002-006 byte-for-byte from Git history. Migration 007 must verify that every non-empty `system_request_id` agrees byte-for-byte with the corresponding `flag`, does not identify another row, and that flags remain non-empty and unique; any anomaly raises `SIGNAL` before it drops the parallel index and column. Make 008 create/extend: `admin_users`, `admin_sessions`, `admin_audit_logs`, `managed_groups`, `feature_settings`, `custom_commands`, `custom_command_runs`, `group_join_decisions`, `scheduled_job_runs`, `bot_operation_events`, `bot_operation_daily`, plus revision/status columns required by the OpenAPI schemas. Migration 009 extends the durable system operation type constraint for knowledge reloads. Use binary collation for opaque IDs and unique idempotency constraints.

- [x] **Step 5: Add CLI and empty-schema baseline**

`cmd/migrate` accepts `-config` and `-dir`, loads config, opens a migration connection, applies all files, prints only version/name (never DSN), and exits non-zero on lock, checksum, legacy-schema, or SQL error. Update `001_schema.sql` to the final schema and insert versions 1-9 with the exact checksums so MySQL entrypoint initialization and the runner agree. Tests must compare the init baseline metadata with the loaded manifest rather than duplicating unchecked checksum literals.

- [x] **Step 6: Verify migration behavior**

Run: `go test ./internal/platform/database -count=1; go test ./...; go build ./cmd/migrate ./cmd/bot; go vet ./...; git diff --check`

When Docker is available, additionally run empty-database and legacy-upgrade integration tests with `JXH_MYSQL_INTEGRATION_DSN` and `JXH_MYSQL_INTEGRATION_CONTAINER`; otherwise record that external MySQL execution remains unverified.

- [x] **Step 7: Commit migration chain**

Commit: `feat: 建立数据库版本迁移链`

### Task 3: 数据库连接生命周期

**Files:**
- Create: `Resource/Jxh-Go/internal/platform/database/config.go`
- Create: `Resource/Jxh-Go/internal/platform/database/config_test.go`
- Create: `Resource/Jxh-Go/internal/platform/database/database.go`
- Create: `Resource/Jxh-Go/internal/platform/database/database_test.go`
- Modify: `Resource/Jxh-Go/cmd/bot/main.go`

- [x] **Step 1: Write failing DSN safety tests**

```go
func TestRuntimeDSNPreservesEscapedLocationWithoutMultiStatements(t *testing.T) {
    dsn, err := RuntimeDSN(config.DatabaseConfig{Host:"db", Port:3306, User:"u", Password:"p", Name:"jxh", Charset:"utf8mb4", ParseTime:true, Loc:"Asia/Shanghai"})
    if err != nil { t.Fatal(err) }
    parsed, err := mysql.ParseDSN(dsn)
    if err != nil { t.Fatal(err) }
    if parsed.MultiStatements || parsed.Loc.String() != "Asia/Shanghai" { t.Fatalf("%+v", parsed) }
}

func TestRuntimeDSNPreservesCompleteDSNSemantics(t *testing.T) {
    dsn, err := RuntimeDSN(config.DatabaseConfig{DSN:"u:p@unix(/var/run/mysql.sock)/jxh?charset=utf8mb4&loc=Asia%2FShanghai&multiStatements=true&timeout=3s"})
    if err != nil { t.Fatal(err) }
    parsed, err := mysql.ParseDSN(dsn)
    if err != nil { t.Fatal(err) }
    if parsed.MultiStatements || parsed.Net != "unix" || parsed.Addr != "/var/run/mysql.sock" || parsed.Timeout != 3*time.Second { t.Fatalf("unexpected runtime DSN semantics") }
}
```

- [x] **Step 2: Confirm RED**

Run: `go test ./internal/platform/database -run TestRuntimeDSN -count=1`

Expected: compile failure because `RuntimeDSN` does not exist.

- [x] **Step 3: Implement `database.Open` and `DB.Close`**

Use one package-private driver-config builder for split fields and complete DSNs. Complete DSNs go through `mysql.ParseDSN`; `RuntimeDSN` always forces `MultiStatements=false` and the migration helper always forces it to true, while preserving Unix sockets, TLS, charset, location, timeouts and custom parameters semantically. Split fields use `net.JoinHostPort` and `mysql.Config.Apply(mysql.Charset(...))` so IPv6, escaped passwords and the driver's charset behavior remain correct.

`Open(ctx, cfg)` creates `*sql.DB`, opens GORM with `mysql.Config{Conn: sqlDB, SkipInitializeWithVersion:true}` and `gorm.Config{DisableAutomaticPing:true}`, sets all four pool values, and performs exactly one bounded `PingContext`. On GORM initialization or Ping failure it closes the pool. `DB` exposes `GORM()`, `Ping(ctx)`, `Stats()`, and concurrent idempotent `Close()`. Reject duration values that overflow `time.Duration`. Errors preserve `context.Canceled`/`DeadlineExceeded` but never include the DSN, password or raw driver error text.

- [x] **Step 4: Replace `main.openDB`**

Move all DSN and pool logic out of `cmd/bot/main.go`; close the database on every path after a successful open. Replace post-open `log.Fatalf` calls with returned errors or logged returns because `os.Exit` skips deferred `Close`. Keep the current schema-first rule and never call `AutoMigrate`; full process composition remains Task 5.

- [x] **Step 5: Verify and commit**

Run: `gofmt -w internal/platform/database/*.go cmd/bot/main.go; go test ./...; go build ./...; go vet ./...; git diff --check`

Commit: `refactor: 收敛数据库生命周期`

### Task 4: 并发安全 NapCat Gateway

**Files:**
- Create: `Resource/Jxh-Go/internal/platform/napcat/gateway.go`
- Create: `Resource/Jxh-Go/internal/platform/napcat/gateway_test.go`
- Modify: `Resource/Jxh-Go/internal/platform/napcat/adapter.go`
- Modify: `Resource/Jxh-Go/internal/bot/pipeline.go`
- Modify: `Resource/Jxh-Go/cmd/bot/main.go`

- [x] **Step 1: Write failing state transition tests**

```go
func TestGatewayAttachDetachAndUnavailable(t *testing.T) {
    g := NewGateway()
    if _, err := g.Client(); !errors.Is(err, ErrUnavailable) { t.Fatalf("got %v", err) }
    fake := newFakeClient()
    generation := g.Attach(fake, time.Unix(10, 0))
    if !g.Snapshot().Connected { t.Fatal("expected connected") }
    g.Detach(generation, errors.New("closed"), time.Unix(20, 0))
    if g.Snapshot().Connected { t.Fatal("expected disconnected") }
}
```

- [x] **Step 2: Confirm RED**

Run: `go test ./internal/platform/napcat -run TestGateway -count=1`

Expected: compile failure because Gateway does not exist.

- [x] **Step 3: Implement atomic client and status snapshot**

Gateway uses an immutable atomic state containing generation, current client, connected/connected-at/disconnected-at/last-event-at and a sanitized last-error summary. Detach only clears the matching generation so a stale connection cannot disconnect a newer client. Every operation snapshots one client and returns typed `ErrUnavailable` before network I/O when disconnected.

- [x] **Step 4: Move existing NapCat capabilities behind Gateway**

Gateway implements current message, flash file, quote history, member lookup, group moderation and restart behavior without changing outputs. Add group list and group-request decision primitives required by later services. Keep small consumer-side interfaces; do not expand `bot.Sender` with manager-only methods.

- [x] **Step 5: Wire Server connection lifecycle**

`Server` receives one Gateway. On each successful SDK connection it attaches the client before consuming events, records event timestamps, and detaches on session end. `Pipeline.SetSender` receives the stable Gateway once at composition rather than a transient `SDKSender` per reconnect.

- [x] **Step 6: Verify and commit**

Run: `gofmt -w internal/platform/napcat/*.go internal/bot/pipeline.go cmd/bot/main.go; go test -race ./internal/platform/napcat ./internal/bot; go test ./...; go build ./...; go vet ./...; git diff --check`

Commit: `refactor: 建立共享 NapCat Gateway`

### Task 5: App 生命周期与健康快照

**Files:**
- Create: `Resource/Jxh-Go/internal/platform/health/service.go`
- Create: `Resource/Jxh-Go/internal/platform/health/service_test.go`
- Create: `Resource/Jxh-Go/internal/platform/app/app.go`
- Create: `Resource/Jxh-Go/internal/platform/app/app_test.go`
- Modify: `Resource/Jxh-Go/cmd/bot/main.go`

- [x] **Step 1: Write failing readiness tests**

```go
func TestReadinessSeparatesLivenessFromDependencies(t *testing.T) {
    svc := NewService()
    svc.SetDatabase(ComponentStatus{Available:true, CheckedAt:time.Unix(1,0)})
    svc.SetNapCat(ComponentStatus{Available:false, Code:"napcat_unavailable"})
    snapshot := svc.Snapshot()
    if !snapshot.Live || snapshot.Ready { t.Fatalf("%+v", snapshot) }
}
```

- [x] **Step 2: Confirm RED**

Run: `go test ./internal/platform/health -count=1`

Expected: package/type missing failure.

- [x] **Step 3: Implement immutable health state**

Track MySQL, NapCat, WPS, AI, quote, scheduler and workers with status code, safe summary, last success/error and latency. `/healthz` remains liveness-only; later `/api/admin/v1/system/health` reads the full snapshot. Status updates never include secrets or raw upstream payloads.

- [x] **Step 4: Introduce `app.App` composition and shutdown**

`App.Run(ctx)` starts health HTTP, NapCat, scheduler, group request parser, purge loops and later admin HTTP using one root context. It captures worker exits, distinguishes fatal startup from degradable runtime failure, and closes HTTP servers, workers, NapCat and DB in deterministic order. `cmd/bot/main.go` becomes flag/config/signal plus `app.New(...).Run(ctx)`.

- [x] **Step 5: Verify shutdown and existing behavior**

Run: `gofmt -w internal/platform/app/*.go internal/platform/health/*.go cmd/bot/main.go; go test -race ./internal/platform/app ./internal/platform/health; go test ./...; go build ./...; go vet ./...; git diff --check`

- [x] **Step 6: Commit lifecycle refactor**

Commit: `refactor: 拆分应用生命周期`

### Task 6: Deployment migration gate and foundation audit

**Files:**
- Modify: `Resource/Jxh-Go/Dockerfile`
- Modify: `Resource/Jxh-Go/docker-compose.yaml`
- Modify: `Resource/Jxh-Go/Makefile`
- Modify: `Resource/Jxh-Go/README.md`
- Update: `docs/superpowers/plans/2026-07-27-jxh-manager-openapi-coverage.md`

- [x] **Step 1: Build both binaries in the image**

Build `jxh-bot` and `jxh-migrate` with `CGO_ENABLED=0`; copy migrations read-only into `/app/migrations`.

- [x] **Step 2: Add one-shot migrate service**

Compose starts `migrate` after MySQL health succeeds, and bot depends on `migrate: condition: service_completed_successfully`. A failed migration prevents bot startup. Do not let bot silently continue against an old schema.

- [x] **Step 3: Add operator commands and documentation**

Add `make migrate`, `make migration-status`, database backup/rollback notes, and explain that SQL migrations are immutable after release.

- [x] **Step 4: Run complete foundation verification**

Run: `go test -race ./...; go build ./...; go vet ./...; go mod tidy -diff; git diff --check; docker compose config --quiet`

Expected: all commands exit 0, except the pre-existing `go.sum` line-ending-only diff must first be normalized in its own maintenance commit if still present.

- [x] **Step 5: Commit deployment gate**

Commit: `build: 在启动前执行数据库迁移`

- [x] **Step 6: Review foundation against design**

Confirm no `AutoMigrate`, no secret logging, one NapCat client owner, stable liveness endpoint, deterministic shutdown, current QQ behavior preserved, and both empty-schema and upgrade-schema paths have evidence. Do not mark any OpenAPI operation implemented in this phase; foundation supplies dependencies but no complete Admin handler yet.
