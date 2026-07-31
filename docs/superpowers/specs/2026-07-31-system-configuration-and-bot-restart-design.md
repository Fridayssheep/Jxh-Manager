# 系统设置结构化配置与 Bot 受控重启设计

## 背景

当前 `/system` 同时展示依赖健康、SSE 状态、后台服务、NapCat 重启和整份
`config.yaml` 编辑器。页面职责混杂，超级管理员必须直接修改 YAML，而且后端允许
整份配置写入，无法从安全边界上阻止 `admin`、数据库和 OneBot 等部署配置被修改。

本设计将 `/system` 收敛为纯设置页。页面只管理适合由超级管理员维护的业务集成
配置；部署级配置继续由配置文件和环境变量在部署阶段管理。设置保存后写入
`config.yaml`，Bot 在受控重启后加载新值。

## 目标与边界

### 目标

- 用按分类的结构化表单替代原始 YAML 编辑器。
- 后端使用字段白名单，未开放的部署配置既不返回也不能通过伪造请求修改。
- 保留配置版本、`If-Match`、原子写入、敏感值不回显和冲突保护。
- 明确区分配置文件值与环境变量托管值；环境变量托管字段只读。
- 保存后准确显示是否存在尚未加载的配置版本。
- 支持超级管理员请求 Bot 优雅退出，并由 Docker 或 systemd 等进程管理器重新拉起。
- 持久化容器内配置，保证 Bot 重启和容器重建不会丢失面板修改。

### 非目标

- 不实现 AI、WPS、引用图客户端的运行时热替换。
- 不把现有全局/按群功能开关迁入系统设置。
- 不删除系统健康、NapCat 重启或 SSE 的后端能力；只从 `/system` 页面移除。
- 不允许面板修改 Admin、数据库连接、OneBot 连接、监听地址或宿主机路径。
- 不让 Bot 在进程内派生并接管一个新进程；重启必须由外部进程管理器完成。

## 页面设计

### 信息架构

`/system` 保留“系统设置”名称，页面只包含以下分类：

| 分类 | 字段 |
| --- | --- |
| WPS | 分享地址、SID、工作表、请求超时 |
| AI | 供应商、Base URL、API Key、模型、请求超时、问题长度上限 |
| 引用图 | 服务地址、请求超时 |
| 时间设置 | 应用时区、调度时区 |
| 数据保留 | 词条触发日志保留天数 |

`ai.enabled` 不在此页出现。`/ai`、引用图等功能是否对全局或某个群启用，继续由
现有 `/settings` 和群设置控制并即时生效；本页只配置进程启动时使用的服务参数。

桌面端使用左侧分类导航和右侧紧凑设置行，移动端改为可横向滚动的分类标签。
分类是页面内导航，不为每个字段创建卡片，也不嵌套卡片。设置行使用与现有
`FeatureSettingsForm` 一致的标签、说明、控件和错误布局。

页面删除以下内容及其页面级请求、订阅和状态：

- 就绪度条和“刷新状态”按钮；
- NapCat、MySQL、WPS、AI、引用图和 SSE 状态卡片；
- worker、scheduler、telemetry 后台服务表格；
- NapCat 重启弹窗和操作记录；
- 原始 YAML 文本编辑器、敏感路径列表和环境变量路径列表。

系统健康仍由总览消费。总览中语义为“查看系统详情”且指向 `/system` 的链接移除，
避免把状态问题错误地导向设置页。

### 编辑、保存与重启反馈

- 所有拥有 `system:read` 的角色可只读查看；只有 `config:write` 可编辑和保存。
- 页面使用 resource/draft/baseline 模型，支持脏状态、字段级校验和放弃修改。
- 底部固定保存栏显示未保存修改、保存中、保存失败和版本冲突。
- 保存成功后，若磁盘版本与当前进程加载版本不同，页面持续显示“重启 Bot 后生效”。
- 拥有 `bot:restart` 且部署支持受控重启时，提示中提供“重启 Bot”按钮。
- 重启确认框要求输入小写 ASCII `restart`，并显示短暂不可用影响。
- 重启请求被接受后显示阻断式“正在重新连接”，轮询认证端点；服务恢复后整页刷新，
  重新取得 CSRF token 和已应用配置。
- 90 秒内未恢复时停止自动轮询，显示“重启结果未知”和手动重试按钮，不重复提交。

### 敏感字段

`wps.share_url`、`wps.sid` 和 `ai.api_key` 只返回是否已配置以及值来源，不返回原值或
固定占位字符串。表单显示“已配置/未配置”，并提供独立的“更换”和“清除”操作：

- 未操作：PATCH 中省略，保留原值；
- 更换：发送 `replace` 和新值；
- 清除：发送 `clear`；
- 环境变量托管：禁用更换和清除，只显示“由部署管理”。

## 配置契约

### 可编辑白名单

| 配置路径 | 规则 |
| --- | --- |
| `wps.share_url` | 敏感；可为空；替换值为绝对 HTTP(S) URL，最长 2048 |
| `wps.sid` | 敏感；可为空；最长 4096 |
| `wps.sheet` | 去除首尾空白后非空，最长 128 |
| `wps.timeout_sec` | 1 到 600 |
| `ai.provider` | `openai` 或 `ark` |
| `ai.base_url` | 可为空；非空时为无 userinfo 的绝对 HTTP(S) URL，最长 2048 |
| `ai.api_key` | 敏感；可为空；最长 8192 |
| `ai.model` | 可为空；最长 255 |
| `ai.timeout_sec` | 1 到 600 |
| `ai.max_question_chars` | 1 到 10000 |
| `quote.base_url` | 可为空；非空时为无 userinfo 的绝对 HTTP(S) URL，最长 2048 |
| `quote.timeout_sec` | 1 到 120 |
| `app.timezone` | `time.LoadLocation` 可识别的 IANA 时区，最长 64 |
| `scheduler.timezone` | `time.LoadLocation` 可识别的 IANA 时区，最长 64 |
| `database.trigger_log_retention_days` | 0 到 3650；0 表示关闭自动清理 |

以下内容不属于 API 白名单：整个 `admin`、整个 `onebot`、数据库连接及连接池字段、
`wps.cache_file` 和其他文件路径。后端按白名单映射字段，不接受任意配置路径或原始
YAML，因此客户端无法越权修改这些内容。

### GET `/api/admin/v1/system/configuration`

响应直接返回结构化配置资源：

```json
{
  "wps": {
    "share_url": { "configured": true, "source": "file" },
    "sid": { "configured": true, "source": "environment" },
    "sheet": "release",
    "timeout_sec": 120
  },
  "ai": {
    "provider": "openai",
    "base_url": "https://api.openai.com/v1",
    "api_key": { "configured": true, "source": "file" },
    "model": "gpt-4.1-mini",
    "timeout_sec": 30,
    "max_question_chars": 500
  },
  "quote": {
    "base_url": "http://quote:5000",
    "timeout_sec": 10
  },
  "time": {
    "app_timezone": "Asia/Shanghai",
    "scheduler_timezone": "Asia/Shanghai"
  },
  "retention": {
    "trigger_log_retention_days": 180
  },
  "environment_overrides": ["wps.sid"],
  "version": 102,
  "applied_version": 101,
  "restart_required": true,
  "restart_supported": true
}
```

`source` 仅用于敏感字段，取值为 `default`、`file` 或 `environment`。普通字段的
环境变量接管状态由 `environment_overrides` 表示；前端按路径禁用对应控件。普通字段
返回当前进程实际采用的有效值，因此环境变量已接管时不会展示一个实际不生效的
磁盘旧值；API 不另行暴露该字段的磁盘值。
`version` 是磁盘配置版本，`applied_version` 是当前进程启动时加载的版本。两者不同
时 `restart_required=true`，Bot 重启并成功加载当前文件后恢复为 `false`。

### PATCH `/api/admin/v1/system/configuration`

PATCH 继续要求 CSRF、Origin 和 `If-Match`。请求是分类化的部分更新；省略字段表示
不变。敏感字段使用显式操作：

```json
{
  "wps": {
    "sheet": "release",
    "sid": { "operation": "replace", "value": "new-secret" }
  },
  "ai": {
    "api_key": { "operation": "clear" },
    "timeout_sec": 45
  }
}
```

后端在当前 YAML AST 上执行路径级更新，保留未开放字段、字段顺序和注释；随后执行
严格解码、白名单语义校验、版本复查和同目录原子替换。进程内互斥锁之外，编辑器
使用配置目录中的 sidecar advisory lock 协调共享同一配置目录的 Bot 实例，并在替换
前再次校验文件摘要。更新是全有或全无；不遵守 advisory lock 的外部编辑器仍由最后
一次摘要校验和下一次 `If-Match` 冲突检测兜底。

环境变量托管字段出现在 PATCH 中时返回 `409
configuration_field_managed_externally`，并在错误 `fields` 中列出字段路径。其他错误：

- 缺少 `If-Match`：`428 precondition_required`；
- 磁盘版本冲突：`409 resource_version_conflict`；
- 字段格式、范围或跨字段校验失败：`400 bad_request`，返回字段错误；
- 文件不可读、不可锁定或原子替换失败：`503 dependency_unavailable`；
- 网络中断导致结果未知：前端保留草稿，重新读取服务器版本后再决定。

配置更新写入审计日志，但只记录变更字段路径、操作者和版本，不记录旧值、新值或
敏感占位符。成功后发布配置变更事件；事件不包含字段值。

## Bot 受控重启

### 部署能力

新增部署级环境变量 `JXH_BOT_RESTART_MODE`：

- `disabled`：默认值，适用于直接运行二进制且没有进程管理器的环境；
- `supervised_exit`：允许管理 API 请求 Bot 优雅退出，要求 Docker、systemd 或其他
  进程管理器负责重新拉起。

仓库的 Docker Compose 为 bot 显式设置 `supervised_exit`，并继续使用
`restart: unless-stopped`。管理端根据 `restart_supported` 决定是否显示重启按钮；
不支持时只提示管理员手动重启。

### POST `/api/admin/v1/system/bot/restart`

新动作端点仅允许 `bot:restart`，该权限只授予超级管理员。请求要求 CSRF、Origin、
`Idempotency-Key`，请求体为：

```json
{
  "confirmation": "restart",
  "configuration_version": 102
}
```

`configuration_version` 必须与磁盘当前版本一致，防止管理员保存后又有其他人更新，
却重启到非预期版本。成功响应为 `202`：

```json
{
  "operation_id": "operation-id",
  "status": "accepted",
  "requested_at": "2026-07-31T12:00:00Z"
}
```

服务先在数据库事务中预留幂等键、记录操作和审计，再写出响应并通知进程级重启
协调器。协调器取消根运行上下文，现有应用框架按既定顺序停止 HTTP、SSE、任务、
NapCat 连接、遥测和数据库。优雅关闭完成后进程使用专用退出码 `75` 退出；普通
`SIGTERM` 关机仍返回 `0`。Docker 的 `unless-stopped` 和配置了
`Restart=on-failure` 的 systemd 均会重新拉起退出码为 `75` 的进程。

新进程启动时将已接受但未完成的 `bot_restart` 操作标记为成功，并发布系统事件。
如果退出前失败或超过关闭超时，记录 `failed` 或 `unknown`，不得在同一请求中再次
触发退出。重启模式禁用返回 `409 bot_restart_not_supported`；版本不匹配返回
`409 resource_version_conflict`。

### 配置持久化

当前镜像把示例配置复制到 `/app/config.yaml`，Compose 未挂载该文件。新部署改为：

- 镜像只提供只读配置模板；
- Compose 将宿主机 `./data/config` 挂载到容器 `/app/config`；
- Bot 和 migrate 均使用 `/app/config/config.yaml`；
- entrypoint 在文件不存在时从模板初始化，并为运行用户设置目录写权限；
- 必须挂载目录而不是单个文件，使同目录临时文件加 `rename` 的原子写入继续有效。

已有直接运行二进制的开发流程仍可使用仓库根目录的 `config.yaml`。部署文档需说明
首次迁移前备份现有配置，并把它放入持久化目录；不得静默覆盖已有文件。

## 权限与兼容性

- `system:read`：读取结构化、已脱敏配置；保留当前三种角色的只读能力。
- `config:write`：修改白名单配置；继续只授予超级管理员。
- `bot:restart`：请求 Bot 受控重启；新增并只授予超级管理员。
- `/settings` 与群设置的权限、存储和热生效行为不变。
- `GET /system/health` 和 `POST /system/napcat/restart` 保留在 OpenAPI 和后端，防止
  破坏现有调用方；管理面板的 `/system` 页面不再调用或展示它们。
- `/system/configuration` 是有意的契约变更：由原始 YAML 资源改为结构化白名单资源，
  同步更新 OpenAPI、生成的 TypeScript 类型和契约测试。

## 测试与验收

### 后端

- GET 只返回白名单字段，敏感值永不出现在响应、错误、事件或审计日志中。
- PATCH 能更新每个允许字段，同时逐字节保留未开放配置的语义和秘密。
- 伪造 `admin`、`onebot`、数据库连接、任意路径或未知字段均失败且不写文件。
- 环境变量托管字段拒绝写入；未托管字段仍可更新。
- 覆盖敏感字段保持、更换、清除，URL、时区、枚举和数值边界校验。
- 覆盖缺少版本、版本冲突、跨进程文件锁、原子替换失败和并发更新。
- 启动版本与磁盘版本一致时无待重启；保存后待重启；重启加载后清除待重启。
- Bot 重启覆盖权限、确认文本、配置版本、幂等重放、禁用模式和优雅关闭顺序。
- Compose 与 entrypoint 静态测试确认配置目录挂载、首次初始化和不覆盖已有文件。

### 前端

- 页面只出现五个配置分类，不渲染任何健康、SSE、后台服务或 NapCat 操作内容。
- 普通角色只读，超级管理员可编辑；环境变量字段禁用并正确标识。
- 敏感字段不回显，保持、更换和清除生成正确 PATCH。
- 字段校验、脏状态、放弃修改、保存成功、未知结果和 409 草稿保留均可恢复。
- 保存后显示待重启；不支持受控重启时不出现可执行按钮。
- 重启确认只接受小写 ASCII `restart`，提交携带版本和幂等键。
- 重启期间进入重新连接状态，恢复后刷新；超时不重复提交。
- 桌面分类导航、移动标签和固定保存栏在目标视口无重叠或溢出。

### 端到端验收

1. 超级管理员修改一个非敏感字段并保存，磁盘文件更新，部署字段保持不变。
2. 页面显示待重启，Bot 仍使用旧值。
3. 确认重启后请求返回 `202`，浏览器进入重新连接状态。
4. Docker 拉起 Bot，新进程读取持久化配置，页面恢复且不再显示待重启。
5. 重建容器后配置仍存在。
6. 观察员和维护员能查看脱敏设置，但无法保存、清除密钥或重启 Bot。
