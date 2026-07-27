# Jxh Manager 前后端 API 设计

- 日期：2026-07-27
- 状态：已确认
- OpenAPI 真源：`../../api/jxh-manager-openapi.yaml`
- 依赖设计：`2026-07-27-jxh-manager-design.md`
- 后端边界：`2026-07-27-jxh-manager-backend-refactor-design.md`

## 1. 目的与范围

本文定义 Jxh Manager SPA 与 Jxh-Go 管理端之间的 HTTP 契约。完整机器可读定义位于 `docs/api/jxh-manager-openapi.yaml`，采用 OpenAPI 3.1 单文件格式，可直接导入支持 OpenAPI 3.1 的接口文档工具。

首版 API 同时描述三个产品阶段的完整 `/api/admin/v1` 资源。尚未实现的 operation 使用 `x-stage` 和 `x-status: planned` 标记。本文不包含前端视觉设计、Apifox 项目配置、环境变量、脚本或测试账号。

## 2. 设计原则

- 普通数据使用资源 REST；审批、测试发送、重载、密码重置和重启等副作用使用显式动作端点。
- HTTP handler 只处理认证、DTO、错误映射和响应，不直接访问 GORM 或 NapCat SDK。
- 所有写操作由后端执行 RBAC，前端隐藏按钮不构成授权。
- 潜在大列表统一使用游标分页；固定小集合直接返回数组。
- 更新已有资源使用版本和 `If-Match`；不可安全重试的动作使用 `Idempotency-Key`。
- 成功响应直接返回资源或明确结果；只有错误使用统一 `error` 包装。
- 敏感密钥、原始上游响应、完整日志正文和数据库内部模型不进入 API。

## 3. 通用契约

### 3.1 路径和编码

- Base Path：`/api/admin/v1`
- JSON 字段：`snake_case`
- 资源 ID、QQ、群号、NapCat flag：字符串
- revision、数量、页大小：整数
- 时间点：UTC RFC 3339
- 业务日期：`YYYY-MM-DD`
- 配置时长：以 `_seconds` 结尾
- 调用耗时：以 `_duration_ms` 结尾
- 敏感 JSON 响应：`Cache-Control: no-store`

前端不得根据 ID 前缀、长度或编码推导业务含义。知识词条 `entry_id` 是 source key 的 URL-safe 不透明编码，具体算法不属于公开契约。

### 3.2 鉴权与 CSRF

服务端会话通过 `jxh_admin_session` Cookie 传递。Cookie 使用 `HttpOnly`、`Secure` 和 `SameSite=Strict`。登录响应与 `/auth/me` 返回 CSRF Token，前端仅保存在内存中，并通过 `X-CSRF-Token` 提交状态修改请求。

登录、登出、密码修改和会话轮换不会向响应体返回 Session Token。密码字段在 OpenAPI 中标记为 `writeOnly`。

### 3.3 并发控制

可修改资源返回整数 `version`。修改和删除时发送：

```http
If-Match: "7"
```

- 缺少条件头：`428 precondition_required`
- 版本不一致：`409 resource_version_conflict`
- 群设置尚无覆盖时使用 `version=0` 和 `If-Match: "0"`
- 批量审批无法使用单个 `If-Match`，因此每个申请在请求体中携带 `version`

### 3.4 幂等

审批、批量审批、测试发送、WPS 重载、群同步、密码重置、会话撤销和 NapCat 重启要求 `Idempotency-Key`。

同一操作者、operation 和幂等键使用相同参数重试时返回首次结果；参数不一致时返回 `409 idempotency_key_reused`。幂等不能把超时等未知外部结果伪造成成功。

### 3.5 游标分页

列表请求使用 `cursor` 和 `limit`，默认 50，范围 1 至 100。响应统一为：

```json
{
  "items": [],
  "next_cursor": null,
  "has_more": false
}
```

游标绑定创建它的筛选和排序条件。筛选改变后从首游标重新查询。不返回昂贵的精确 total；需要总数时使用总览或统计接口。

### 3.6 错误

```json
{
  "error": {
    "code": "resource_version_conflict",
    "message": "资源已经被其他操作更新",
    "request_id": "req_01...",
    "fields": {},
    "retryable": false
  }
}
```

通用状态码包括 400、401、403、404、409、428、429、502 和 503。错误 message 面向管理端用户，不包含 DSN、绝对路径、密钥或原始上游响应。

## 4. 权限模型

`/auth/login` 和 `/auth/me` 返回后端计算的权限字符串。前端使用权限控制交互，后端仍在每个请求重新鉴权。

| 能力 | 超级管理员 | 维护员 | 观察员 |
| --- | --- | --- | --- |
| 查看总览、群、设置、申请、命令、任务、知识库和统计 | 是 | 是 | 是 |
| 查看完整申请验证信息和 AI 解析 | 是 | 是 | 是 |
| 批准、拒绝和批量处理申请 | 是 | 是 | 否 |
| 修改设置、命令和定时任务 | 是 | 是 | 否 |
| 手动重载 WPS | 是 | 是 | 否 |
| 导出统计 | 是 | 是 | 是 |
| 查看审计 | 是 | 是 | 是，部分详情脱敏 |
| 管理账号和会话 | 是 | 否 | 否 |
| 修改自动批准策略 | 是 | 否 | 否 |
| 新建或修改跨群发送目标 | 是 | 否 | 否 |
| 重启 NapCat | 是 | 否 | 否 |

观察员能读取完整申请，但不能访问任何处理动作。申请正文不得因此进入统计、SSE 或普通日志。

## 5. 接口目录

### 5.1 Auth

- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`
- `POST /auth/change-password`

登录设置 Cookie，并返回用户、当前会话、权限和 CSRF Token。登录失败统一使用 `invalid_credentials`。修改密码成功后撤销其他会话，并轮换当前会话和 CSRF Token。

### 5.2 Overview

- `GET /overview`

返回仪表盘指标、需要处理事项、依赖摘要和趋势。尚不可用的指标返回 `available=false` 和 `value=null`，不能用 0 伪装。

### 5.3 Groups And Settings

- `GET /groups`
- `POST /groups/sync`
- `GET /groups/{group_id}`
- `GET /settings`
- `PATCH /settings`
- `GET /groups/{group_id}/settings`
- `PATCH /groups/{group_id}/settings`
- `DELETE /groups/{group_id}/settings`

群目录是 NapCat 最后成功快照，只读。群设置响应同时提供 `effective`、`overrides`、`global_version` 和群覆盖 `version`。群 PATCH 中 null 表示删除字段覆盖并恢复继承。

自动批准不属于通用功能设置，使用独立策略资源：

- `GET /groups/{group_id}/join-request-policy`
- `PATCH /groups/{group_id}/join-request-policy`

### 5.4 Join Requests

申请资源 ID 直接使用 NapCat 原始 `flag/request_id`，API 允许最多 512 个 Unicode 字符；服务端和客户端都不得截断、哈希、重编码或另建平行 ID。

- `GET /join-requests`
- `GET /join-requests/{request_id}`
- `GET /join-requests/{request_id}/decisions`
- `POST /join-requests/{request_id}/decisions`
- `POST /join-requests/bulk-decisions`

单条决策明确成功返回 200；超时或断连且结果不明确时返回 202，并把申请置为 unknown。调用前发现 NapCat 不可用时返回 503，申请保持 pending。

批量决策一次最多 20 条且必须属于同一个群。服务先原子占用全部记录；外部调用开始后允许部分成功，结果逐条返回。

### 5.5 Commands

- `GET /commands`
- `POST /commands`
- `GET /commands/{command_id}`
- `PATCH /commands/{command_id}`
- `DELETE /commands/{command_id}`
- `POST /commands/validate`
- `POST /commands/{command_id}/validate`
- `GET /commands/{command_id}/runs`

命令名只允许小写 ASCII，规则为：

```text
^/[a-z](?:[a-z0-9_-]{0,31})$
```

中文只出现在显示名称、描述、固定选项 label 和消息模板。验证端点只解析参数和渲染预览，绝不产生 QQ 副作用。

### 5.6 Scheduled Jobs

- `GET /scheduled-jobs`
- `POST /scheduled-jobs`
- `GET /scheduled-jobs/{job_id}`
- `PATCH /scheduled-jobs/{job_id}`
- `DELETE /scheduled-jobs/{job_id}`
- `POST /scheduled-jobs/{job_id}/test-send`
- `GET /scheduled-jobs/{job_id}/runs`

测试发送不修改正式任务的 `last_run_at` 或 `next_run_at`。发送超时且无法确认结果时记录 unknown，不自动重复测试发送。

### 5.7 Knowledge

- `GET /knowledge/status`
- `POST /knowledge/reload`
- `GET /knowledge/entries`
- `GET /knowledge/entries/{entry_id}`
- `GET /knowledge/conflicts`

词条完全只读。手动重载立即返回 202；前端通过 SSE 或重新读取 status 获取结果。失败不替换旧索引和缓存。

### 5.8 Analytics

- `GET /analytics/summary`
- `GET /analytics/timeseries`
- `GET /analytics/rankings`
- `GET /analytics/export`

统计支持时间、群、功能和结果筛选。导出直接流式返回 CSV 或 XLSX，不返回容器文件路径。活跃用户只返回聚合数量，不暴露 HMAC 标识。

### 5.9 Audit

- `GET /audit-logs`
- `GET /audit-logs/{audit_log_id}`

观察员可以读取审计，但账号、会话、安全策略和跨群动作的前后值脱敏。所有角色都不会看到密码、令牌、密钥或完整申请验证信息的审计副本。

### 5.10 Users And Sessions

- `GET /users`
- `POST /users`
- `GET /users/{user_id}`
- `PATCH /users/{user_id}`
- `POST /users/{user_id}/password-reset`
- `POST /users/{user_id}/sessions/revoke`
- `GET /sessions`
- `POST /sessions/{session_id}/revoke`

只有超级管理员可以访问。后端拒绝禁用或降级最后一个有效超级管理员，并拒绝重复用户名或 QQ 绑定。

### 5.11 System And Events

- `GET /system/health`
- `POST /system/napcat/restart`
- `GET /events`

系统状态分别展示 MySQL、NapCat、WPS、AI、quote 和后台 worker，不把不同故障压缩成单一布尔值。NapCat 重启只允许超级管理员。

## 6. SSE 契约

SSE 使用 Cookie 会话，不要求 CSRF。客户端可以按 topic 订阅，并通过 `Last-Event-ID` 恢复：

```text
id: evt_01...
event: join_request.updated
retry: 3000
data: {"event_id":"evt_01...","event":"join_request.updated","occurred_at":"2026-07-27T08:31:01Z","resource":{"type":"join_request","id":"req_01...","version":6},"reason":"decision_confirmed"}
```

事件只承担失效通知和必要摘要，客户端按资源 ID 重新读取详情或列表。服务端每 15 秒发送注释心跳。历史已过期时发送 `stream.reset`，会话被撤销时发送 `auth.session_revoked` 并关闭连接。

## 7. OpenAPI 维护规则

- OpenAPI 使用 3.1.0、单 YAML 文件和内部 `$ref`。
- operationId 全局唯一，并使用稳定动词加资源名。
- 每个 operation 标记 `x-stage: phase_1|phase_2|phase_3` 和 `x-status: planned|implemented|deprecated`。
- OpenAPI 是机器可读真源；本文只解释跨接口规则和业务语义。
- v1 可以增加可选字段、枚举值和新端点；删除字段、改变语义或收紧必填规则需要新版本。
- 前端必须为未知枚举提供降级显示。
- 废弃接口标记 `deprecated: true` 和 `x-status: deprecated`，并由服务返回 Deprecation 与 Sunset Header。

## 8. Apifox 边界

仓库只维护标准 OpenAPI YAML，使其可以被手动导入 Apifox。仓库不包含：

- Apifox 项目文件。
- Apifox 环境、变量或脚本。
- 测试账号或密码。
- 与 Apifox 服务的 CI 集成。

Apifox 是该 OpenAPI 的消费工具，不是 Jxh Manager 的运行时或构建依赖。

## 9. 契约验收

- OpenAPI 3.1 文档通过语法和引用校验。
- operationId 唯一。
- 所有路径位于 `/api/admin/v1` server 下。
- 所有潜在大列表使用统一游标响应。
- 所有可修改资源包含 version，并在写 operation 声明 `If-Match`。
- 所有不可安全重复动作声明 `Idempotency-Key`。
- 所有状态修改请求声明 Cookie 与 CSRF 鉴权。
- 所有 operation 至少定义成功响应和主要错误响应。
- OpenAPI 不包含真实域名凭据、Cookie、Token、WPS SID、AI Key 或数据库信息。
