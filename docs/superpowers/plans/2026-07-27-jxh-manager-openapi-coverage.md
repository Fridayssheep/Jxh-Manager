# Jxh Manager OpenAPI 覆盖矩阵

- 契约真源：`../../api/jxh-manager-openapi.yaml`
- Bot 分支：`Resource/Jxh-Go:newmanager`
- 初始基线：`c581408`
- 初始状态：57 个 operation 均未实现，OpenAPI 均为 `x-status: planned`
- 当前状态（2026-07-28）：57 个 operation 均已实现，OpenAPI 均为 `x-status: implemented`
- 当前 Bot 证据提交：`d2c3330`
- 自动校验：`Resource/Jxh-Go/internal/adminapi/management_test.go` 会核对 57 个 operation 的 method/path、唯一 operationId、状态和实际注册路由。

只有同时具备路由、鉴权/权限、输入校验、应用服务、持久化或外部副作用、契约测试六类证据的 operation 才能标记为 `implemented`。仅复用旧 QQ 命令或旧 Store 方法记为 `partial`，不能修改 OpenAPI 状态。

| 阶段 | 方法 | 路径 | operationId | 当前覆盖 | 实现证据 |
| --- | --- | --- | --- | --- | --- |
| 1 | POST | `/auth/login` | `loginAdmin` | implemented | 见下方证据索引 |
| 1 | GET | `/auth/me` | `getCurrentAdmin` | implemented | 见下方证据索引 |
| 1 | POST | `/auth/logout` | `logoutAdmin` | implemented | 见下方证据索引 |
| 1 | POST | `/auth/change-password` | `changeOwnPassword` | implemented | 见下方证据索引 |
| 1 | GET | `/overview` | `getOverview` | implemented | 见下方证据索引 |
| 1 | GET | `/groups` | `listGroups` | implemented | 见下方证据索引 |
| 1 | POST | `/groups/sync` | `syncGroups` | implemented | 见下方证据索引 |
| 1 | GET | `/groups/{group_id}` | `getGroup` | implemented | 见下方证据索引 |
| 1 | GET | `/settings` | `getGlobalSettings` | implemented | 见下方证据索引 |
| 1 | PATCH | `/settings` | `updateGlobalSettings` | implemented | 见下方证据索引 |
| 1 | GET | `/groups/{group_id}/settings` | `getGroupSettings` | implemented | 见下方证据索引 |
| 1 | PATCH | `/groups/{group_id}/settings` | `updateGroupSettings` | implemented | 见下方证据索引 |
| 1 | DELETE | `/groups/{group_id}/settings` | `deleteGroupSettings` | implemented | 见下方证据索引 |
| 1 | GET | `/audit-logs` | `listAuditLogs` | implemented | 见下方证据索引 |
| 1 | GET | `/audit-logs/{audit_log_id}` | `getAuditLog` | implemented | 见下方证据索引 |
| 1 | GET | `/users` | `listAdminUsers` | implemented | 见下方证据索引 |
| 1 | POST | `/users` | `createAdminUser` | implemented | 见下方证据索引 |
| 1 | GET | `/users/{user_id}` | `getAdminUser` | implemented | 见下方证据索引 |
| 1 | PATCH | `/users/{user_id}` | `updateAdminUser` | implemented | 见下方证据索引 |
| 1 | POST | `/users/{user_id}/password-reset` | `resetAdminUserPassword` | implemented | 见下方证据索引 |
| 1 | POST | `/users/{user_id}/sessions/revoke` | `revokeAdminUserSessions` | implemented | 见下方证据索引 |
| 1 | GET | `/sessions` | `listAdminSessions` | implemented | 见下方证据索引 |
| 1 | POST | `/sessions/{session_id}/revoke` | `revokeAdminSession` | implemented | 见下方证据索引 |
| 1 | GET | `/system/health` | `getSystemHealth` | implemented | 见下方证据索引 |
| 1 | POST | `/system/napcat/restart` | `restartNapCat` | implemented | 见下方证据索引 |
| 1 | GET | `/events` | `subscribeAdminEvents` | implemented | 见下方证据索引 |
| 2 | GET | `/groups/{group_id}/join-request-policy` | `getJoinRequestPolicy` | implemented | 见下方证据索引 |
| 2 | PATCH | `/groups/{group_id}/join-request-policy` | `updateJoinRequestPolicy` | implemented | 见下方证据索引 |
| 2 | GET | `/join-requests` | `listJoinRequests` | implemented | 见下方证据索引 |
| 2 | POST | `/join-requests/bulk-decisions` | `bulkDecideJoinRequests` | implemented | 见下方证据索引 |
| 2 | GET | `/join-requests/{request_id}` | `getJoinRequest` | implemented | 见下方证据索引 |
| 2 | GET | `/join-requests/{request_id}/decisions` | `listJoinRequestDecisions` | implemented | 见下方证据索引 |
| 2 | POST | `/join-requests/{request_id}/decisions` | `decideJoinRequest` | implemented | 见下方证据索引 |
| 2 | GET | `/scheduled-jobs` | `listScheduledJobs` | implemented | 见下方证据索引 |
| 2 | POST | `/scheduled-jobs` | `createScheduledJob` | implemented | 见下方证据索引 |
| 2 | GET | `/scheduled-jobs/{job_id}` | `getScheduledJob` | implemented | 见下方证据索引 |
| 2 | PATCH | `/scheduled-jobs/{job_id}` | `updateScheduledJob` | implemented | 见下方证据索引 |
| 2 | DELETE | `/scheduled-jobs/{job_id}` | `archiveScheduledJob` | implemented | 见下方证据索引 |
| 2 | POST | `/scheduled-jobs/{job_id}/test-send` | `testSendScheduledJob` | implemented | 见下方证据索引 |
| 2 | GET | `/scheduled-jobs/{job_id}/runs` | `listScheduledJobRuns` | implemented | 见下方证据索引 |
| 2 | GET | `/knowledge/status` | `getKnowledgeStatus` | implemented | 见下方证据索引 |
| 2 | POST | `/knowledge/reload` | `reloadKnowledge` | implemented | 见下方证据索引 |
| 2 | GET | `/knowledge/entries` | `listKnowledgeEntries` | implemented | 见下方证据索引 |
| 2 | GET | `/knowledge/entries/{entry_id}` | `getKnowledgeEntry` | implemented | 见下方证据索引 |
| 2 | GET | `/knowledge/conflicts` | `listKnowledgeConflicts` | implemented | 见下方证据索引 |
| 2 | GET | `/analytics/summary` | `getAnalyticsSummary` | implemented | 见下方证据索引 |
| 2 | GET | `/analytics/timeseries` | `getAnalyticsTimeseries` | implemented | 见下方证据索引 |
| 2 | GET | `/analytics/rankings` | `getAnalyticsRankings` | implemented | 见下方证据索引 |
| 2 | GET | `/analytics/export` | `exportAnalytics` | implemented | 见下方证据索引 |
| 3 | GET | `/commands` | `listCommands` | implemented | 见下方证据索引 |
| 3 | POST | `/commands` | `createCommand` | implemented | 见下方证据索引 |
| 3 | POST | `/commands/validate` | `validateCommandDraft` | implemented | 见下方证据索引 |
| 3 | GET | `/commands/{command_id}` | `getCommand` | implemented | 见下方证据索引 |
| 3 | PATCH | `/commands/{command_id}` | `updateCommand` | implemented | 见下方证据索引 |
| 3 | DELETE | `/commands/{command_id}` | `archiveCommand` | implemented | 见下方证据索引 |
| 3 | POST | `/commands/{command_id}/validate` | `validateStoredCommand` | implemented | 见下方证据索引 |
| 3 | GET | `/commands/{command_id}/runs` | `listCommandRuns` | implemented | 见下方证据索引 |

## 实现证据索引

- 路由与协议：`internal/adminapi` 注册完整的 57 条路由，统一执行会话认证、RBAC、CSRF、Origin、请求体限制、错误格式和请求 ID；各 handler 测试覆盖成功、未认证、无权限与关键输入边界。
- 认证与审计：`internal/auth`、`internal/audit` 和 `internal/storage/manager_auth.go` 实现账号、会话、密码变更、管理员管理、审计、稳定游标和持久化幂等；真实 MySQL 测试覆盖并发与事务回滚。
- 核心资源：`internal/groups`、`internal/settings`、`internal/overview`、`internal/system` 及 `manager_core_*.go` 实现群目录、全局/群设置、总览和系统健康/重启；设置热更新不进入消息热路径查询数据库。
- 运营资源：`internal/joinrequests`、`internal/scheduledjobs`、`internal/customcommand`、`internal/telemetry`、`internal/analytics` 及 `manager_operations.go` 实现审批状态机、定时任务、受控命令、批量遥测、统计与流式导出。
- 外部副作用：审批、测试发送、群同步、NapCat 重启和知识库重载均先持久化请求与幂等状态，再执行外部调用；超时/断线结果进入 unknown 或 failed，并在启动时恢复中断状态。
- 运行时：`internal/management` 组合全部服务，`cmd/bot` 接入 Admin HTTP、自动审批、命令 Registry、Telemetry 与维护循环；Docker 启动前执行迁移，并提供独立管理员引导命令。

## 通用完成门槛

- 所有列表使用契约规定的稳定排序、游标分页与 `limit` 边界。
- 所有资源 ID、QQ、群号和 NapCat flag 在 API 层使用字符串。
- 所有 mutation 执行 RBAC、CSRF、审计；有 revision 的 mutation 强制 `If-Match`。
- 所有外部副作用动作校验 `Idempotency-Key`，未知结果不盲目重试。
- 所有错误使用统一 `error.code/message/request_id/fields/retryable`，不泄露静态密钥或上游原文。
- 所有 operation 有成功、认证失败、权限失败和关键边界的 handler 测试；数据库和外部副作用另有集成或 fake 测试。
- 只有上述证据全部存在，才把对应 OpenAPI `x-status` 从 `planned` 改为 `implemented`。

## 2026-07-28 验收快照

- 真实 MySQL：`go test -race -count=1 ./internal/database` 与 `go test -race -count=1 ./internal/storage` 全部通过；测试后两类临时 schema 残留数均为 0。
- 全仓门禁：`go test -race -count=1 ./...`、`go build ./...`、`go build ./cmd/bot ./cmd/migrate ./cmd/admin-bootstrap`、`go vet ./...`、`go mod tidy -diff`、`docker compose config --quiet`、`git diff --check` 全部退出 0。
- 部署证据：Docker 镜像内 migration 目录及 SQL 对运行用户只读，Compose 强制迁移成功后启动 Bot；OpenAPI 57/57 operation 的状态、路径和路由注册由测试自动一致性校验。
- 外部边界：真实 QQ/NapCat、WPS、AI 与 quote 服务未在本地执行带业务副作用的成功联调；相关 operation 的完成证据来自持久化状态机、幂等/恢复测试、契约测试与 fake gateway，部署验收仍应补充真实环境 smoke test。
