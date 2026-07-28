# Jxh Manager 后端改造与重构设计

- 日期：2026-07-27
- 状态：已确认审阅结论
- 依赖设计：`2026-07-27-jxh-manager-design.md`
- API 设计：`2026-07-27-jxh-manager-api-design.md`
- 接口真源：`../../api/jxh-manager-openapi.yaml`
- 审阅对象：`Resource/Jxh-Go`
- 审阅分支：`newmanager`
- 审阅基线：Jxh-Go `c581408`

## 1. 目的与结论

本文把管理面板总体设计映射为 Jxh-Go 的后端改造要求。它回答以下问题：

1. 当前实现中哪些边界会阻碍管理端接入。
2. 哪些能力可以直接复用，哪些能力必须先重构。
3. 管理 API、QQ 命令、后台任务和外部适配器应如何共享业务规则。
4. 数据库、并发、鉴权、审计和降级需要达到什么行为标准。
5. 后续实施计划必须遵循什么依赖顺序和验收门槛。

总体结论是：现有后端可以继续演进，不需要重写，也不应拆成微服务；但不能直接在 `cmd/bot/main.go` 上继续堆叠 HTTP handler。开始管理端开发前，必须先补齐数据库迁移、统一授权、NapCat Gateway 和审批状态机四个基础边界。

截至审阅基线，管理端后端尚未开始实现。OpenAPI 中 57 个 operation（阶段一 26 个、阶段二 23 个、阶段三 8 个）均标记为 `x-status: planned`；不能把现有 QQ 命令或存储方法视为已经实现了对应的管理 API。接口路径、DTO、错误码、角色权限、并发与幂等约束以 OpenAPI 为机器可读真源，本文负责说明实现这些契约所需的内部架构和重构边界。

## 2. 审阅范围与基线

本次审阅覆盖：

- `cmd/bot/main.go` 的装配、生命周期和健康服务。
- `internal/bot` 的消息管线、内置命令和权限检查。
- `internal/platform/napcat` 的连接、事件消费和 OneBot API 调用。
- `internal/platform/storage` 的模型和 GORM 数据访问。
- `internal/groups/grouprequest` 的采集、AI 解析、同步与导出。
- `internal/automation/scheduler` 和 `internal/bot/commands` 的定时任务逻辑。
- `internal/knowledge` 的 WPS 同步、解析和内存索引。
- `internal/ai`、`internal/messaging/quote`、`internal/messaging/linkcleaner` 和 `internal/knowledge/triggerstats`。
- `deploy/mysql`、Compose、配置文件和部署说明。

基线验证结果：

- `go test ./...` 通过，但仓库中没有 `*_test.go`，结果只证明包可编译。
- `go build ./...` 通过。
- `go vet ./...` 通过。
- `git diff --check` 通过。
- `go mod tidy -diff` 仅报告 `go.sum` 的 CRLF/LF 全文件行尾差异；删除和新增内容序列一致，不是依赖集合变化。

### 2.1 现状证据索引

| 结论 | 当前实现证据 |
| --- | --- |
| `main.go` 承担组合根和多个生命周期职责 | `cmd/bot/main.go:35-159`、`cmd/bot/main.go:227-239` |
| 健康服务只有固定存活响应 | `cmd/bot/main.go:121-148` |
| NapCat client 是重连循环局部变量 | `internal/platform/napcat/adapter.go:27-87` |
| `bot.Sender` 混合发送、文件、引用、禁言、重启和角色查询 | `internal/bot/pipeline.go:21-30` |
| QQ 群管理员共用全局操作授权路径 | `internal/bot/command_router.go:105-115`、`internal/bot/command_router.go:214-267` |
| 申请只能表示 `pending/processed` | `internal/groups/grouprequest/service.go:21-24`、`internal/groups/grouprequest/service.go:315-360` |
| 申请 upsert 没有决策事务或 revision | `internal/platform/storage/store.go:135-243` |
| AI 与手工申请字段规则不一致 | `internal/ai/applicant.go:79-105`、`internal/groups/grouprequest/service.go:365-406` |
| 调度领域 DTO 位于 QQ 命令包 | `internal/bot/commands/admin.go:27-45`、`internal/platform/storage/store.go:65-99` |
| 欢迎文案和命令帮助硬编码 | `internal/bot/pipeline.go:138-139`、`internal/bot/command_router.go:33-51` |
| WPS 冲突只静默关闭 AI | `internal/knowledge/parser.go:27-61` |
| WPS Syncer 没有状态快照和并发重载保护 | `internal/knowledge/syncer.go:18-84` |
| 词条统计同步写数据库 | `internal/knowledge/triggerstats/service.go:80-95` |
| quote 返回值无法区分 GIF 与 PNG 回退 | `internal/messaging/quote/client.go:44-58` |
| 已有部署迁移目录不存在 | `docker-compose.yaml:13-15`、`README.md:218-220`、`AGENTS.md:10-11` |

## 3. 必须先解决的阻塞项

### 3.1 数据库迁移链缺失

当前 Compose 只把 `deploy/mysql/init/001_schema.sql` 挂载到 MySQL 的首次初始化目录。该脚本只在空数据目录第一次启动时执行。与此同时，README 和 `AGENTS.md` 仍要求已有部署执行 `deploy/mysql/migrations/`，但该目录已经不存在；历史提交 `8e60ccf` 删除了原有迁移文件，文档仍引用 `005`、`006` 和 `007`。

管理端需要新增账号、会话、审计、群快照、设置、命令、决策、执行记录和运营统计等表。如果继续依赖手工判断和初始化 SQL，已有部署无法可靠升级，也无法确认数据库处于哪个版本。

必须建立以下机制：

- 保留 schema-first 原则，继续维护完整的 `deploy/mysql/init/001_schema.sql`。
- 恢复顺序明确、不可变的版本化迁移目录。
- 提供独立迁移命令和一次性迁移容器，不在 bot 启动路径调用 `AutoMigrate`。
- 使用 `schema_migrations` 记录已经执行的版本，并在执行迁移时取得数据库级互斥锁。
- 从 Git 历史恢复现有部署可能使用过的迁移，建立明确的基线版本，不能从新编号假设所有线上库都等同于当前初始化 SQL。
- CI 至少验证“空库初始化”和“上一发布版本升级到当前版本”两条路径。

在迁移机制完成前，不应合入管理端业务表。

### 3.2 QQ 管理命令会绕过 Web RBAC

当前 `internal/bot/command_router.go` 使用同一个 `authorizeNativeAdmin` 判断授权以下操作：

- 当前群禁言。
- 当前群定时任务管理。
- WPS 全局重载。
- NapCat 全局重启。
- 全部群申请和词条统计的本地导出。

这意味着任意一个 bot 所在群的群主或群管理员都可以触发全局运维动作。只给 Web handler 增加超级管理员、维护员和观察员判断，并不能形成真正的权限边界，旧 QQ 命令仍可绕过新角色模型。

后端必须建立统一的操作授权模型：

```text
入口（Web API / QQ 命令 / 后台任务）
  -> Actor + Scope + Action
  -> Policy / RBAC
  -> Application Service
  -> Audit
  -> Storage / NapCat / WPS
```

`Actor` 至少区分 `admin_user`、`qq_user` 和 `system`。`Scope` 明确全局或目标群。Web 与 QQ 入口必须调用同一应用服务，不能各自复制授权规则。

首版权限收敛要求：

- 当前群 owner/admin 可以保留当前群禁言和当前群调度操作。
- NapCat 重启只允许 Web 超级管理员执行。
- WPS 全局重载只允许 Web 超级管理员和维护员执行。
- 全局导出不得继续通过普通群管理员命令触发。
- 若保留内部维护 QQ 命令，使用 `admin_users.qq_user_id` 的可选唯一绑定识别内部维护身份；只有启用状态的超级管理员或维护员账号可以通过该入口执行全局动作。所有操作记录 `qq_user` 审计，不能把群角色当作内部维护身份。

### 3.3 NapCat 连接无法作为共享运行时依赖

`internal/platform/napcat/adapter.go` 在重连循环中创建局部 SDK client，随后把 `SDKSender` 临时写入 `Pipeline.SetSender`。该模型只满足消息管线发送需求，不能稳定支持管理端的连接状态、群目录、人工审批、自动审批和系统操作。

必须引入并发安全的 `napcat.Gateway`：

- 重连循环负责连接和事件消费，并在连接建立或断开时原子替换当前 client。
- Gateway 保存连接状态、连接时间、最近断开时间、最近错误和最近事件时间。
- 没有可用 client 时返回稳定的 `ErrUnavailable`，由管理 API 映射为 HTTP 503。
- Gateway 统一封装 `GetGroupList`、`SetGroupAddRequest`、`SetGroupBan`、`SetRestart`、消息发送、成员查询和引用消息查询。
- 业务服务只依赖小型能力接口，不直接依赖 NapCat SDK client。
- 所有能力提供 fake 实现，以便单元测试不连接真实 QQ。

建议按能力拆分接口，而不是继续扩大当前 `bot.Sender`：

```go
type MessageSender interface { /* 群消息发送 */ }
type FlashFileSender interface { /* 群闪传文件发送 */ }
type GroupDirectory interface { /* 群列表和成员信息 */ }
type GroupRequestDecider interface { /* 批准或拒绝 */ }
type GroupModerator interface { /* 禁言 */ }
type BotController interface { /* NapCat 重启 */ }
type QuoteHistoryReader interface { /* 引用消息历史 */ }
```

这些接口由同一个 Gateway 实现，共享唯一 NapCat 连接。

现有 `internal/messaging/flashfile.Stager`、CQ image/file 安全解析、远程文件暂存限制和 NapCat 闪传响应校验可以继续复用。重构时只移动其装配和调用边界，不把它们改造成管理端可提交任意 URL 的通用下载器，也不把暂存文件绝对路径或源 URL 暴露到 API。

### 3.4 入群审批状态和并发模型不足

当前申请只有 `pending` 和 `processed`。NapCat 系统消息的 `checked=true` 被直接映射为 `processed`，无法区分批准、拒绝、外部处理和结果未知。Store 也没有修订版本、原子占用、幂等键和决策记录。

`group_join_requests` 应保留外部观察状态，并增加独立决策状态：

- `observed_status`：`pending`、`checked`。
- `decision_status`：`pending`、`processing`、`approved`、`rejected`、`external_processed`、`unknown`。
- `version`：乐观并发修订版本。
- `last_decision_id`：最近决策尝试引用。
- `processing_expires_at`：处理占用超时恢复时间。

新增追加式 `group_join_decisions`，至少记录申请、幂等键、决策动作、操作者、来源、字段快照、规则版本、开始和完成时间、NapCat 结果、错误代码与请求 ID。

人工和自动决策都必须经过同一个 Decision Service：

1. 校验操作者、目标群、申请状态和客户端修订版本。
2. 在短事务中以条件更新把 `pending` 原子占用为 `processing`，同时创建唯一幂等决策记录。
3. 提交事务后调用 NapCat，绝不在数据库事务中等待网络请求。
4. 明确成功后写入 `approved` 或 `rejected`。
5. 明确失败时按错误分类恢复 `pending` 或保留失败尝试。
6. 超时、断连等不明确结果写入 `unknown`，先同步 NapCat 状态，不盲目重复外部动作。
7. 发布 SSE 资源更新。

系统轮询只观察到 `checked` 时，不得覆盖已经确认的 `approved` 或 `rejected`。若未知决策只能得到 `checked` 而没有更强证据，也不得伪造成已批准或已拒绝。

## 4. 目标后端架构

目标仍然是一个 Go 进程，但进程内部使用明确的模块和端口：

```text
cmd/bot
  -> internal/platform/app                 组合根、启动、关闭、后台 worker
       -> internal/management/api       HTTP、DTO、middleware、SSE
       -> internal/management/auth           账号、密码、会话、CSRF、RBAC
       -> internal/management/audit          追加式审计
       -> internal/management/settings       全局/群级设置与运行时快照
       -> internal/groupcatalog   NapCat 群目录和最后成功快照
       -> internal/groups/grouprequest   采集、校验、决策、自动批准
       -> internal/automation/scheduler      任务服务和运行时
       -> internal/automation/customcommand  受控命令编译与执行
       -> internal/knowledge      WPS 同步、状态和只读索引
       -> internal/platform/telemetry      异步运营事件和日聚合
       -> internal/platform/health         存活、就绪和依赖状态
       -> internal/platform/napcat         Gateway、事件适配和 OneBot 能力
       -> internal/platform/storage        GORM 持久化实现
```

边界规则：

- HTTP handler 只负责鉴权、输入解码、DTO 校验、调用应用服务、错误映射和输出编码。
- Handler 不直接访问 GORM、NapCat SDK、WPS、AI 或 quote client。
- 应用服务拥有完整业务规则，并同时供 Web、QQ 和后台任务调用。
- 服务包定义所需 Store 或外部能力接口，`internal/platform/storage` 和适配器实现这些接口。
- GORM model 不作为 API response 或领域对象返回。
- 配置和索引的消息热路径读取内存快照，不在每条消息上查询数据库。

## 5. 应用生命周期与数据库

当前 `cmd/bot/main.go` 同时完成配置读取、数据库打开、WPS 同步、AI 初始化、Pipeline 组装、调度启动、健康服务和 NapCat 阻塞运行。新增管理 API 后继续扩展该文件会使启动失败、降级和关闭行为难以推理。

### 5.1 `internal/platform/app`

`app.App` 负责：

- 构造所有长期依赖和应用服务。
- 启动 NapCat、Admin HTTP、健康服务、调度器、申请同步、自动批准、群目录同步、遥测和清理 worker。
- 使用同一个根 `context.Context` 管理取消。
- 记录每个 worker 的最近 tick、错误和退出状态。
- 按确定顺序关闭 HTTP、后台循环、NapCat、数据库和其他资源。
- 区分关键组件退出与可降级组件错误，避免任意 goroutine 静默终止进程功能。

### 5.2 `internal/platform/database`

数据库模块负责：

- 构建 DSN，但不在日志中输出密码或完整 DSN。
- `gorm.Open` 后取得底层 `*sql.DB`，执行带超时的 Ping。
- 配置最大打开连接、最大空闲连接、连接最大生命周期和空闲生命周期。
- 提供健康探测和显式 `Close`。

冷启动仍要求数据库基线可用；运行期间数据库故障时，管理端登录和写操作失败关闭，消息管线继续使用最后有效的设置和知识快照。统计降级不能阻止正常消息响应。

### 5.3 HTTP 服务

- `/healthz` 保持单独的轻量存活检查，不执行慢依赖调用。
- Admin API 使用独立可配置地址，不直接复用当前健康端口作为公网管理入口。
- Admin Server 设置 `ReadHeaderTimeout`、`ReadTimeout`、`WriteTimeout`、`IdleTimeout`、请求体限制和 panic 恢复。
- 生产环境只通过受信任的 HTTPS 反向代理访问；转发头只信任明确配置的代理地址。

## 6. 登录、会话、RBAC 与审计

新增 `internal/management/auth` 和 `internal/management/audit`，不要把认证逻辑散落在路由中。

### 6.1 账号与密码

- 不提供自助注册、默认账号或默认密码。
- 提供一次性 CLI 命令创建首个超级管理员。
- 密码使用 Argon2id、随机盐和版本化参数保存。
- 密码验证使用常量时间比较，并支持登录成功后升级旧参数。
- 登录失败按标准化账号和可信来源地址分别限速，响应保持一致以避免账号枚举。
- `admin_users` 提供可选且唯一的 `qq_user_id`，用于把内部维护 QQ 身份绑定到本地账号；该字段不是登录凭据，也不向普通观察员开放编辑。

### 6.2 服务端会话

- 浏览器只保存高强度随机会话令牌；数据库只保存令牌哈希。
- Cookie 使用 `HttpOnly`、`Secure`、`SameSite=Strict` 和受限 Path。
- 登录成功轮换令牌；退出、停用账号和重置密码撤销该账号全部会话。
- 会话同时具有空闲过期和绝对过期时间。
- 修改请求验证 `Origin` 和每会话 CSRF Token。
- SSE 连接沿用服务端会话鉴权，断线不影响业务提交。

### 6.3 统一审计

审计记录至少包含：

- actor 类型、ID、角色和来源。
- action、target 类型、target ID 和 scope。
- 脱敏后的变更前后值。
- 结果、稳定错误代码、请求 ID 和时间。

设置更新与审计必须在同一数据库事务中提交。审批、重启和跨群发送等外部副作用需要分别记录“已请求”和“最终结果”，不能只在成功时记录。审计不得保存密码、会话令牌、密钥、完整申请验证消息或上游原始响应。

## 7. 群目录与运行时设置

### 7.1 群目录

新增 `internal/groupcatalog`：

- 通过 NapCat Gateway 周期性调用 `GetGroupList`。
- 把最后一次成功结果写入 `managed_groups`，包括群名、群号、成员数、bot 角色和同步时间。
- NapCat 不可用时返回最后成功快照，并显式标记 `stale=true`。
- `managed_groups` 只用于展示、目标选择和可用性校验，不作为 QQ 原生群角色的权限真源。

### 7.2 设置模型

首版功能键保持：

- `keyword_reply`
- `ai_qa`
- `quote`
- `link_cleaner`
- `welcome`
- `custom_commands`

`feature_settings` 使用明确的 scope 和修订版本。全局设置只有一份；群级记录只保存覆盖项。群级启停采用继承、启用、停用三态，不复制完整全局配置。

新增 `internal/management/settings`：

- Store 负责读取和事务化更新设置。
- Validator 校验功能键、可覆盖字段、文案长度和模板变量。
- Resolver 合并全局默认和群级覆盖。
- Snapshot 保存不可变、已经解析完成的运行时设置。
- `atomic.Pointer` 或等价机制一次替换完整快照。

更新流程必须串行保证提交与快照顺序：校验角色和 revision，构建候选快照，在事务内写设置和审计，提交成功后原子替换。任何失败都保留旧快照。

AI provider、模型、API Key、WPS SID、OneBot Token、数据库密码和 quote 地址仍属于静态部署配置。动态设置只能启用已经成功初始化的能力，不能通过面板创建或返回密钥。

## 8. 申请解析与自动批准

### 8.1 统一 Applicant Validator

当前 AI 和手工解析规则不一致：AI 路径接受没有最小长度的纯数字学号和最长 64 字符姓名，手工路径接受 6 至 32 位字母数字学号和最长 16 字符姓名。

应提取唯一的 `ApplicantValidator`，解析器只负责提取候选值，最终是否合法由 Validator 决定。首版自动批准采用两条现有路径规则的安全交集：

- 学号：6 至 32 位数字。
- 姓名：1 至 16 个 Unicode 字符，至少包含一个字母，不包含数字。
- 专业：1 至 128 个 Unicode 字符，至少包含一个字母或数字。
- AI 返回字段仍需确认来自原申请验证文本，不能接受模型凭空补全。

如果真实学校学号格式需要放宽，应先更新 Validator 测试和规则版本，再启用自动批准；不能只修改 AI prompt。

### 8.2 自动批准 worker

自动批准按群默认关闭。Worker 只选择同时满足以下条件的记录：

- `sub_type=add`。
- `decision_status=pending`。
- AI 解析状态为 `completed`。
- 三个字段均通过统一 Validator。
- 所在群自动批准设置明确启用。
- 没有处理中、未知或待核验决策。

Worker 以 `system` Actor 调用同一个 Decision Service，记录规则版本、字段快照和确定性命中原因。系统绝不自动拒绝。未来增加权威名单时，只向该规则集合增加名单匹配条件，不改变页面、状态机或 NapCat 调用边界。

## 9. 调度服务

当前 `ScheduledJobInput` 和 `ScheduledJobView` 位于 `internal/bot/commands`，使 storage 反向依赖 QQ 命令层。应把领域类型、校验和 Store 接口移动到 `internal/automation/scheduler`，让 QQ Router 和 Admin API 都依赖 Scheduler Service。

Scheduler Service 需要支持：

- 稳定分页查询和按群筛选。
- 每天与单次任务的创建、编辑、暂停、恢复和停用。
- `version` 或 `If-Match` 乐观并发控制。
- 测试发送，且不修改正式任务的 `last_run_at`。
- 下次预计执行时间计算。
- `scheduled_job_runs` 执行历史、结果、耗时和错误代码。

运行时继续保持“发送成功后才更新 `last_run_at`，发送失败保持可重试”的语义。由于 QQ 发送是外部副作用，进程可能在发送成功与落库之间崩溃，系统无法提供严格 exactly-once。执行前应先持久化 run attempt；重启后遗留的 `running` 记录标为 `unknown`，不得把未知结果报告为成功。具体是否人工重试由管理端显式触发。

## 10. 知识库管理能力

WPS 继续是唯一数据源，现有原子索引替换和有效缓存回退可以保留。需要补充管理端所需的可观察状态和只读访问。

`ParseRows` 不再只返回 `[]Entry`，而应返回结构化 `ParseResult`：

- 有效词条。
- 无效行数量和原因分类。
- source key 或关键词冲突明细。
- 被禁用或仅关闭 AI 的词条明细。
- 警告摘要。

Syncer 需要：

- 使用 mutex 或 singleflight 防止多个 `/reload` 和后台同步并发覆盖。
- 保存最近尝试、最近成功、来源、sheet、缓存更新时间、词条数、冲突数和安全错误摘要。
- 下载为空、解析失败或无有效词条时保留旧索引和旧缓存。
- 提供不可变状态快照和只读分页搜索接口。
- 不向 API 返回 WPS SID、带敏感 query 的分享地址或原始上游错误。

现有 `Index.Keyword` 对 source key 线性扫描；为统计和预览增加 source key 索引，避免管理端批量解析词条名称时形成重复扫描。

## 11. 自定义命令引擎

新增 `internal/automation/customcommand`，包含四个主要部分：

- Definition Validator：名称、参数、权限、scope、动作和硬限制校验。
- Compiler：把数据库定义编译成不可变运行时 Registry。
- Parser：完整命令名匹配和强类型参数解析。
- Executor：按顺序执行受控动作并记录每一步 Outcome。

首版只实现 `reply_text`、`mention`、`mute_member` 和 `send_group_text`。动作定义必须解析为后端已知的类型，不能把任意 JSON、脚本、SQL 或 HTTP 请求交给执行器。

安全要求：

- 保存时检查内置命令和自定义命令冲突。
- 禁言和跨群发送不能配置为所有成员可触发。
- 跨群目标在定义保存时固定，不能来自自由文本参数。
- 模板只支持白名单变量，保存时拒绝未知变量。
- 动作数量、文本长度、禁言时长、目标数量和总执行时间均有硬上限。
- 部分成功后停止剩余动作，并在 `custom_command_runs` 中保存逐步结果。
- 执行记录不保存自由文本参数原文。

消息顺序保持：内置命令完整匹配、自定义命令完整匹配、链接净化、关键词精确回复。

## 12. 统计、Outcome 与隐私

当前 `triggerstats.Service.record` 在消息处理 goroutine 中同步写 MySQL。保留现有词条统计表，但新增群消息量、活跃用户和命令事件后，不能对每条消息执行同步数据库写入。

新增 `internal/platform/telemetry`：

- 消息热路径非阻塞写入有界内存队列。
- Worker 按数量或时间批量写 `bot_operation_events`。
- 队列满时丢弃低价值遥测并增加 drop counter，不能阻塞 bot。
- 自然日聚合写入 `bot_operation_daily`。
- 明细事件执行有限保留期清理。
- 活跃用户使用服务端密钥 HMAC 后的稳定标识，不保存原始 QQ。

审计、设置、审批决策、账号和会话不是 best-effort telemetry，必须直接事务化持久化。

现有服务需要返回结构化 Outcome，避免统计层根据回复文本猜测结果：

- quote：GIF 成功、PNG 回退、完全失败和耗时。
- AI：成功、无知识、繁忙、禁用、超时、审查拒绝、输出降级和耗时。
- link cleaner：候选数、成功数、失败数和安全错误分类。
- scheduler：发送成功、失败、未知和测试发送。
- custom command：解析失败、权限拒绝、成功、部分成功和执行失败。

事件不得保存完整群消息、AI 问答正文、自由文本参数、申请验证消息副本、Token、Cookie、密钥或上游原始响应。

## 13. Storage 与数据模型

数据访问继续集中在 `internal/platform/storage`，但按聚合拆分文件，避免新增十余张表后继续扩大单个 `store.go`：

- `auth.go`
- `audit.go`
- `settings.go`
- `groups.go`
- `group_requests.go`
- `scheduler.go`
- `commands.go`
- `telemetry.go`

现有业务表继续保留：

- `knowledge_trigger_logs`
- `scheduled_jobs`
- `group_join_requests`

新增业务表：

- `admin_users`，包含可选唯一的 `qq_user_id` 维护身份绑定
- `admin_sessions`
- `admin_audit_logs`
- `managed_groups`
- `feature_settings`
- `custom_commands`
- `custom_command_runs`
- `group_join_decisions`
- `scheduled_job_runs`
- `bot_operation_events`
- `bot_operation_daily`

另外使用 `schema_migrations` 作为迁移基础设施表。`group_join_requests` 增加观察状态、决策状态、修订版本和最后决策引用；`scheduled_jobs` 增加修订版本。历史任务、决策、命令执行和审计均采用停用或追加记录，不物理删除。

所有列表查询必须使用稳定排序和分页。所有写接口需要明确唯一约束、revision 条件和 RowsAffected 检查，不能把零行更新报告为成功。

## 14. Admin API 边界

API 路径保持总体设计中的 `/api/admin/v1`。实现要求：

- 使用标准错误结构和稳定错误代码。
- 每个请求生成 request ID，并贯穿审计、日志和上游调用。
- 列表使用游标或稳定排序分页。
- 写操作携带 revision 或 `If-Match`，冲突返回 409。
- 审批等外部副作用携带幂等键。
- NapCat 未连接时返回可识别的 503，不写入伪成功状态。
- 导出使用授权后的流式响应，不返回容器本地路径。
- 所有输入有长度、数量和枚举限制；请求体使用 `MaxBytesReader` 或等价限制。
- API DTO 不包含数据库密码、OneBot Token、WPS SID、AI Key、会话令牌哈希或原始上游错误。

Go 1.26 的标准 `http.ServeMux` 已支持方法和路径参数，首版没有必要仅为路由引入大型 Web 框架。若后续选择路由库，也不能改变 handler 与应用服务的边界。

## 15. 健康、错误与日志

健康信息分三层：

- Liveness：进程和 HTTP 事件循环仍然存活。
- Readiness：数据库、NapCat 和核心服务是否能执行管理操作。
- Status snapshot：WPS、AI、quote、scheduler、telemetry 等最近成功和错误时间。

外部适配器返回 typed error 和安全摘要。完整 DSN、WPS URL query、NapCat Token、Cookie、quote 原始响应和 AI provider 原始响应不得进入 API 或普通日志。需要诊断的内部细节应先脱敏，并通过 request ID 关联。

数据库不可用、NapCat 离线、WPS 重载失败、quote 降级和 telemetry 丢弃分别是不同状态，不能都压缩成一个 `healthy=false`。

## 16. 测试策略

大规模移动代码前先补特征测试，固定现有正确行为：

- 内置命令完整匹配和路由顺序。
- QQ 当前群管理员鉴权与跨群限制。
- 申请事件和系统消息归一化。
- 调度的每日、单次、失败重试和时区行为。
- NapCat OneBot 数字和消息解码。
- WPS 无有效词条时保留旧索引。

新增能力的单元测试至少覆盖：

- Auth：Argon2id、统一登录错误、限速、会话轮换、撤销、CSRF 和三档 RBAC。
- Settings：继承、覆盖、校验、revision 冲突和 Snapshot 原子替换。
- Approval：并发占用、幂等、批准、拒绝、外部处理、超时未知和自动批准条件。
- Scheduler：CRUD、revision、测试发送、执行历史和进程崩溃后的未知状态。
- Custom command：冲突、参数边界、权限提升防护、动作顺序和部分失败。
- Telemetry：非阻塞入队、批量写、脱敏、HMAC、自然日边界和保留期。
- API：错误代码、分页、敏感字段不返回、导出权限和 503 降级。

MySQL 集成测试覆盖迁移、事务、唯一约束、条件更新和分页。外部能力使用 fake NapCat、fake WPS、fake AI 和 fake quote。真实审批、禁言、跨群发送、重启、WPS 下载和引用图生成只在隔离测试群联调，不能把静态编译描述为真实 QQ 行为已验证。

## 17. 实施顺序与阶段门槛

总体设计仍按三个产品阶段交付，后端实施进一步按依赖拆为以下顺序。

### 17.1 基础零：测试和迁移

- 补关键特征测试。
- 恢复并验证迁移链。
- 修复文档与实际迁移目录不一致。
- 将 `go.sum` 行尾统一作为独立维护变更处理。

门槛：空库和升级库迁移均可重复验证，测试不依赖真实 QQ。

### 17.2 基础一：生命周期和外部边界

- 引入 `internal/platform/app` 和 `internal/platform/database`。
- 引入 NapCat Gateway 和能力接口。
- 拆分 `bot.Sender`，保持现有消息行为不变。
- 增加就绪和依赖状态快照。

门槛：重连、关闭和 NapCat 离线均有测试；现有 bot 功能无行为回归。

### 17.3 产品阶段一：管理平台基础

- Auth、会话、CSRF、RBAC、审计和首个管理员 CLI。
- Admin API 骨架、标准错误、request ID 和 SSE。
- 群目录快照。
- 全局和群级设置及运行时 Snapshot。
- 收敛 QQ 全局管理命令权限。

门槛：三档角色矩阵全部由 API 测试证明；旧 QQ 入口不能绕过全局权限。

### 17.4 产品阶段二：核心运营

- 申请状态迁移、Decision Service、人工和批量决策。
- Applicant Validator 和按群自动批准。
- Scheduler Service、执行历史和测试发送。
- WPS 状态、重载和只读搜索。
- 现有业务统计 API 和流式导出。

门槛：审批并发、幂等和未知结果测试通过；真实 NapCat 操作在隔离群完成联调。

### 17.5 产品阶段三：自动化与运营统计

- 自定义命令编译、执行与逐步记录。
- 异步 telemetry、自然日聚合和保留期。
- 结构化 AI、quote、link cleaner Outcome。
- 总览聚合和需要处理事项。

门槛：消息压力下数据库延迟不会阻塞消息管线；统计不保存禁止的正文和身份信息。

## 18. 不应进行的重构

以下改动不属于管理端前置条件：

- 不拆分独立 Manager 微服务。
- 不替换 NapCat SDK 或自行实现 OneBot WebSocket 协议。
- 不替换 GORM，只调整数据访问边界和迁移机制。
- 不替换 Eino Agent、quote 服务、链接净化器或 WPS 数据源。
- 不把知识库编辑能力写回 WPS。
- 不为未来 HTTP 自定义动作预留任意请求执行器。
- 不把静态密钥迁移到可由管理面板读取的数据库配置。
- 不在基础阶段提前实现复杂插件系统、工作流 DSL 或多租户模型。

重构目标是建立清晰边界并复用现有正确能力，而不是更换技术栈。

## 19. 实施计划输入

后续编写实施计划时，必须把本设计拆为多个可独立审阅和回滚的变更，至少满足：

- 每个变更只跨越一个主要架构边界。
- 数据迁移先于依赖新字段的代码发布。
- 移动领域类型前先补特征测试。
- 新旧 QQ 命令在共享服务迁移期间保持明确的授权行为。
- 外部副作用在 fake 测试通过后，再进入隔离环境联调。
- 每个阶段单独提供回滚方式和数据库兼容说明。

本文不授权直接开始全部实现。下一步应基于第 17 节为“基础零”和“基础一”分别编写实施计划，完成并验收后再进入管理 API 功能开发。

## 20. 实施状态（2026-07-28）

本文仍是架构与行为边界的设计记录；实现状态以 OpenAPI 和覆盖矩阵为准。截至 2026-07-28，基础零、基础一和三个产品阶段的后端代码均已落地：

- 版本化迁移链已扩展到 009，镜像启动前通过一次性 migrate 服务升级数据库；普通运行连接禁止 multi-statements。
- Admin Core 已组装进 Bot 生命周期，57 条 `/api/admin/v1` operation 均已注册并标记为 `implemented`。
- 账号、会话、审计、幂等、群快照、设置、审批、定时任务、知识库操作、命令、Telemetry、统计和系统操作均有 GORM 持久化实现。
- 管理员引导使用数据库级串行化，账号与脱敏审计同事务创建；禁用或软删除账号仍阻止二次引导。
- NapCat 重启、知识库重载、群同步、审批和定时任务测试发送均持久化操作状态，并在启动时恢复中断操作；未知外部结果不会被伪装成成功。
- 设置和自定义命令在启动时编译为不可变运行时快照；Telemetry 使用非阻塞队列、批量写、自然日聚合和保留期清理。
- 自动测试覆盖全仓 race、路由/OpenAPI 对齐、真实 MySQL 8.4 迁移与关键并发事务、构建、vet、Compose 配置和镜像构建。

仍需在部署环境完成的不是代码缺口，而是外部联调验收：真实 NapCat 隔离群中的审批、禁言、跨群发送和重启，真实 WPS 下载/重载，quote 引用图渲染，以及生产 MySQL 备份后的升级演练。完成这些验收前，不把 fake 或静态构建结果描述为生产副作用已经验证。
