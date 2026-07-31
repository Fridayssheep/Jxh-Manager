# 系统设置结构化配置与 Bot 重启实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 用结构化白名单设置页替换混合状态/YAML 页面，并交付可审计、可持久化、由 Docker/systemd 托管的 Bot 重启流程。

**架构：** OpenAPI 是公共契约；`platform/config` 负责有效值、来源、校验、YAML AST 路径更新和原子替换，`management/system` 负责权限、审计、版本与重启操作。Vue 只消费强类型资源；进程级重启协调器把已受理动作转成优雅关闭和退出码 75。

**技术栈：** Go 1.25、MySQL 8/GORM、gopkg.in/yaml.v3、OpenAPI 3.1、Vue 3、TypeScript、Vitest、Vue Test Utils、Playwright、Docker Compose

---

### 任务 1：定义结构化 OpenAPI 契约

**文件：**
- 新建：`Resource/Jxh-Go/internal/management/api/openapi_system_configuration_contract_test.go`
- 修改：`docs/api/jxh-manager-openapi.yaml`
- 修改：`jxh-manager/src/api/schema.d.ts`（生成文件）

- [ ] **步骤 1：编写失败的契约测试**

测试必须断言 `SystemConfiguration` 必需包含 `wps`、`ai`、`quote`、`time`、`retention`、`environment_overrides`、`version`、`applied_version`、`restart_required`、`restart_supported`，并且不存在 `yaml`。

```go
func TestOpenAPISystemConfigurationIsStructured(t *testing.T) {
    root := loadOpenAPIRoot(t)
    schema := requireOpenAPISchema(t, root, "SystemConfiguration")
    for _, field := range []string{"wps", "ai", "quote", "time", "retention", "environment_overrides", "version", "applied_version", "restart_required", "restart_supported"} {
        requireOpenAPIRequired(t, schema, field)
    }
    if _, ok := requireOpenAPIProperties(t, schema)["yaml"]; ok {
        t.Fatal("SystemConfiguration must not expose raw yaml")
    }
}
```

同时断言 `SystemConfigurationPatch` 只有五个允许分类；`SecretUpdate` 仅允许 `replace|clear`；`POST /system/bot/restart` 存在并要求小写 `restart`、数字 `configuration_version` 和 `bot:restart`。

- [ ] **步骤 2：验证测试失败**

```bash
cd Resource/Jxh-Go
go test ./internal/management/api -run TestOpenAPISystemConfigurationIsStructured -count=1
```

预期：FAIL，当前契约仍暴露 YAML 且没有 Bot 重启端点。

- [ ] **步骤 3：更新 OpenAPI**

新增 `ConfigurationSource`、`ConfiguredSecret`、`SecretUpdate`、五个分类资源及其 Patch schema。所有对象使用 `additionalProperties: false`。新增 `bot:restart` 权限枚举和 `POST /system/bot/restart`，先标记 `x-status: planned`，响应复用 `SystemOperation`。

```yaml
ConfiguredSecret:
  type: object
  additionalProperties: false
  required: [configured, source]
  properties:
    configured: { type: boolean }
    source: { type: string, enum: [default, file, environment] }
```

- [ ] **步骤 4：生成类型并验证**

```bash
cd jxh-manager
npm run api:generate
cd ../Resource/Jxh-Go
go test ./internal/management/api -run TestOpenAPISystemConfigurationIsStructured -count=1
```

预期：生成成功，契约测试 PASS。

- [ ] **步骤 5：提交契约**

```bash
cd ../..
git add docs/api/jxh-manager-openapi.yaml Resource/Jxh-Go/internal/management/api/openapi_system_configuration_contract_test.go jxh-manager/src/api/schema.d.ts
git commit -m "feat: define structured system configuration contract"
```

### 任务 2：实现配置白名单编辑器

**文件：**
- 修改：`Resource/Jxh-Go/go.mod`
- 修改：`Resource/Jxh-Go/go.sum`
- 修改：`Resource/Jxh-Go/internal/platform/config/config.go`
- 新建：`Resource/Jxh-Go/internal/platform/config/settings.go`
- 修改：`Resource/Jxh-Go/internal/platform/config/editor.go`
- 修改：`Resource/Jxh-Go/internal/platform/config/config_test.go`
- 修改：`Resource/Jxh-Go/internal/platform/config/editor_test.go`

- [ ] **步骤 1：编写失败测试**

新增以下测试并使用包含唯一部署字段和秘密的临时 YAML：

```go
func TestFileEditorReadsOnlyEffectiveEditableSettings(t *testing.T) {}
func TestFileEditorPatchesAllowedPathsAndPreservesDeploymentConfig(t *testing.T) {}
func TestFileEditorRejectsEnvironmentManagedFields(t *testing.T) {}
func TestFileEditorSecretKeepReplaceAndClear(t *testing.T) {}
func TestFileEditorValidatesURLsTimezonesEnumsAndRanges(t *testing.T) {}
func TestFileEditorDetectsVersionConflictAcrossInstances(t *testing.T) {}
func TestLoadRecordsSourceVersionAndRestartMode(t *testing.T) {}
```

保存后解码文件，逐项断言 `admin`、`onebot`、数据库连接/连接池、`wps.cache_file` 未改变；响应、错误和审计输入中不得出现种子秘密。

- [ ] **步骤 2：验证测试失败**

```bash
cd Resource/Jxh-Go
go test ./internal/platform/config -run "Test(FileEditor|LoadRecords)" -count=1
```

- [ ] **步骤 3：定义结构化类型与严格校验**

在 `settings.go` 定义 `Source`、`SecretState`、`SecretUpdate`、五类 `Settings`、显式 presence Patch 和字段路径错误。实现设计文档中的 URL、时区、枚举和数值范围。

```go
type SecretUpdate struct {
    Operation SecretOperation
    Value string
}
type Settings struct {
    WPS WPSSettings
    AI AISettings
    Quote QuoteSettings
    Time TimeSettings
    Retention RetentionSettings
    EnvironmentOverrides []string
    Version uint64
}
```

- [ ] **步骤 4：记录启动文件版本与重启模式**

为 `Config` 增加 `SourceVersion uint64` 和非 YAML 的 `BotRestartMode`。`Load` 使用编辑器同一 JS-safe 哈希算法记录原始文件版本；解析 `JXH_BOT_RESTART_MODE=disabled|supervised_exit`，未知值直接报错。

- [ ] **步骤 5：替换原始 YAML 编辑流程**

编辑器接口改为：

```go
Read(context.Context) (Settings, error)
Update(context.Context, uint64, SettingsPatch) (Settings, []string, error)
```

读取时返回环境变量后的普通字段有效值，秘密只返回 configured/source。更新时拒绝空 Patch 和环境托管路径；使用现有互斥锁加 `github.com/gofrs/flock` sidecar lock；按固定 YAML 路径更新 AST；替换前再次比较摘要；严格解码、语义校验后同目录原子替换。删除公开的占位符、`YAML` 和 `MaskedFields` 语义。

- [ ] **步骤 6：验证并提交**

```bash
gofmt -w internal/platform/config
go test -race ./internal/platform/config -count=1
go vet ./internal/platform/config
git add go.mod go.sum internal/platform/config
git commit -m "feat: add allowlisted configuration editor"
```

### 任务 3：接入管理服务、审计和结构化 HTTP

**文件：**
- 修改：`Resource/Jxh-Go/internal/management/system/service.go`
- 修改：`Resource/Jxh-Go/internal/management/system/service_test.go`
- 修改：`Resource/Jxh-Go/internal/platform/storage/manager_core_system.go`
- 修改：`Resource/Jxh-Go/internal/platform/storage/manager_core_test.go`
- 修改：`Resource/Jxh-Go/internal/management/backend.go`
- 修改：`Resource/Jxh-Go/internal/management/events/hub.go`
- 修改：`Resource/Jxh-Go/internal/management/events/hub_test.go`
- 修改：`Resource/Jxh-Go/internal/management/api/system_handlers.go`
- 修改：`Resource/Jxh-Go/internal/management/api/system_handlers_test.go`

- [ ] **步骤 1：编写失败测试**

覆盖结构化 GET、有效值、`applied_version`、精确 `restart_required`、mutation context、未知 JSON 字段、环境托管冲突、版本冲突，以及审计只记录字段路径/版本。

```go
func TestConfigurationReturnsStructuredEffectiveValuesAndAppliedVersion(t *testing.T) {}
func TestUpdateConfigurationPassesPatchVersionAndMutationContext(t *testing.T) {}
func TestUpdateConfigurationRecordsOnlyChangedPathsInAudit(t *testing.T) {}
func TestConfigurationHTTPNeverAcceptsRawYAMLOrDeploymentFields(t *testing.T) {}
```

- [ ] **步骤 2：验证测试失败**

```bash
cd Resource/Jxh-Go
go test ./internal/management/system ./internal/management/api ./internal/platform/storage -run "Test(Configuration|UpdateConfiguration)" -count=1
```

- [ ] **步骤 3：替换服务模型**

`system.Configuration` 包含结构化 settings、`AppliedVersion`、`RestartRequired`、`RestartSupported`。`system.Options` 接收启动版本和重启支持能力，`RestartRequired = diskVersion != appliedVersion`。

- [ ] **步骤 4：增加配置变更审计**

文件写入前持久化 `system.configuration.update` 的 unknown/requested 审计，内容仅包含操作者、请求上下文、预期版本和排序后的字段路径。原子写入后更新为 success 和新版本；最终审计失败使用有界后台重试，不重复写文件。任何秘密值不得进入 JSON、错误或日志。

- [ ] **步骤 5：实现严格 DTO 与错误映射**

HTTP 解码拒绝未知字段，继续要求 `If-Match`、CSRF 和 Origin。映射：非法字段 400；环境托管 409 `configuration_field_managed_externally`；版本冲突 409；缺少版本 428；文件或锁不可用 503。ETag 使用返回的磁盘版本。

- [ ] **步骤 6：发布无值事件**

新增 `system.configuration_changed`，resource ID 使用新版本字符串，reason 为 `configuration_updated`，SSE 不包含字段路径和值。

- [ ] **步骤 7：验证并提交**

```bash
gofmt -w internal/management/system internal/management/api internal/management/backend.go internal/management/events internal/platform/storage
go test -race ./internal/management/system ./internal/management/api ./internal/management/events ./internal/platform/storage -count=1
git add internal/management/system internal/management/api/system_handlers.go internal/management/api/system_handlers_test.go internal/management/backend.go internal/management/events internal/platform/storage
git commit -m "feat: expose structured system settings"
```

### 任务 4：实现持久化 Bot 重启动作与权限

**文件：**
- 修改：`Resource/Jxh-Go/internal/management/auth/types.go`
- 修改：`Resource/Jxh-Go/internal/management/auth/permissions.go`
- 修改：`Resource/Jxh-Go/internal/management/auth/permissions_test.go`
- 修改：`Resource/Jxh-Go/internal/management/system/service.go`
- 修改：`Resource/Jxh-Go/internal/management/system/service_test.go`
- 修改：`Resource/Jxh-Go/internal/platform/storage/manager_core_system.go`
- 修改：`Resource/Jxh-Go/internal/platform/storage/manager_core_test.go`
- 新建：`Resource/Jxh-Go/deploy/mysql/migrations/012_support_bot_restart_operations.sql`
- 修改：`Resource/Jxh-Go/deploy/mysql/init/001_schema.sql`
- 修改：`Resource/Jxh-Go/internal/platform/database/migrate_test.go`
- 修改：`Resource/Jxh-Go/internal/platform/database/migrate_mysql_integration_test.go`
- 修改：`Resource/Jxh-Go/internal/management/api/system_handlers.go`
- 修改：`Resource/Jxh-Go/internal/management/api/system_handlers_test.go`
- 修改：`Resource/Jxh-Go/internal/management/api/management_test.go`
- 修改：`docs/api/jxh-manager-openapi.yaml`

- [ ] **步骤 1：编写失败的权限、服务、路由和迁移测试**

只有超级管理员拥有 `bot:restart`。动作必须校验精确 `restart`、当前配置版本、部署支持、mutation context 和幂等键；幂等重放返回同一 operation 且不重复调度。迁移测试要求 `system_operations.type` 同时允许既有类型和 `bot_restart`。

- [ ] **步骤 2：验证测试失败**

```bash
cd Resource/Jxh-Go
go test ./internal/management/auth ./internal/management/system ./internal/management/api ./internal/platform/database -run "Test.*(BotRestart|Permission|Migration)" -count=1
```

- [ ] **步骤 3：增加权限和迁移 012**

新增 `PermissionBotRestart = "bot:restart"`，只加入 super admin 全量权限。迁移安全替换 type check constraint，并把最终约束同步到 `001_schema.sql`。

- [ ] **步骤 4：实现受理、幂等和恢复**

新增：

```go
type BotRestartInput struct {
    Confirmation string
    ConfigurationVersion uint64
}
func (s *Service) AcceptBotRestart(ctx context.Context, principal auth.Principal, input BotRestartInput, key string, request auth.MutationContext) (Operation, bool, error)
```

受理前比较磁盘版本并检查 restart mode。请求哈希使用独立域 `jxh-admin/bot-restart/v1`。新进程启动时把遗留的 accepted/running `bot_restart` 标为 succeeded；NapCat 中断操作仍保持 unknown 语义。

- [ ] **步骤 5：实现端点并标记契约已实现**

handler 顺序固定为：校验、受理、写 202、仅 fresh 时调度、返回。disabled 映射 409 `bot_restart_not_supported`，旧版本映射 409 `resource_version_conflict`。将 OpenAPI operation 改为 `x-status: implemented` 并更新路由计数。

- [ ] **步骤 6：验证并提交**

```bash
gofmt -w internal/management/auth internal/management/system internal/management/api internal/platform/storage internal/platform/database
go test -race ./internal/management/auth ./internal/management/system ./internal/management/api ./internal/platform/storage -count=1
go test ./internal/platform/database -run "Test.*Migration" -count=1
git add internal/management/auth internal/management/system internal/management/api internal/platform/storage internal/platform/database deploy/mysql ../../docs/api/jxh-manager-openapi.yaml
git commit -m "feat: add persisted Bot restart action"
```

### 任务 5：接入优雅退出与配置目录持久化

**文件：**
- 新建：`Resource/Jxh-Go/internal/platform/app/restart.go`
- 新建：`Resource/Jxh-Go/internal/platform/app/restart_test.go`
- 修改：`Resource/Jxh-Go/cmd/bot/main.go`
- 修改：`Resource/Jxh-Go/cmd/bot/main_test.go`
- 新建：`Resource/Jxh-Go/cmd/bot/deployment_test.go`
- 修改：`Resource/Jxh-Go/internal/management/backend.go`
- 修改：`Resource/Jxh-Go/Dockerfile`
- 修改：`Resource/Jxh-Go/docker-compose.yaml`
- 修改：`Resource/Jxh-Go/scripts/entrypoint.sh`
- 修改：`Resource/Jxh-Go/README.md`

- [ ] **步骤 1：编写失败测试**

```go
func TestRestartCoordinatorSchedulesOnlyOnce(t *testing.T) {}
func TestMainResultReturns75AfterSupervisedRestart(t *testing.T) {}
func TestMainResultReturnsZeroForSignalShutdown(t *testing.T) {}
func TestDeploymentPersistsConfigurationDirectory(t *testing.T) {}
```

部署测试读取 Dockerfile、Compose 和 entrypoint，要求目录挂载 `/app/config`、配置路径 `/app/config/config.yaml`、Bot 的 `supervised_exit`、`restart: unless-stopped`、仅缺失时初始化模板，且不存在单文件 bind mount。

- [ ] **步骤 2：验证测试失败**

```bash
cd Resource/Jxh-Go
go test ./internal/platform/app ./cmd/bot -run "Test(RestartCoordinator|MainResult|Deployment)" -count=1
```

- [ ] **步骤 3：实现一次性重启协调器**

协调器只接受第一个 operation ID。main 从 signal context 派生 cancel-cause context；收到重启请求时以 `ErrRestartRequested` 取消，让现有 app 框架完成有界关闭。重启返回 75，普通 SIGTERM 返回 0，真实错误返回 1。协调器经 management options 注入 system service。

- [ ] **步骤 4：持久化整个配置目录**

镜像把模板放到只读 `/usr/local/share/jxh/config.example.yaml`。Bot 和 migrate 都使用 `/app/config/config.yaml`；Compose 挂载 `./data/config:/app/config`。entrypoint 仅在文件不存在时复制模板，再设置运行用户目录写权限和文件 0600；不得覆盖已有配置。

- [ ] **步骤 5：验证并提交**

```bash
gofmt -w internal/platform/app cmd/bot internal/management/backend.go
go test -race ./internal/platform/app ./cmd/bot ./internal/management -count=1
docker compose config --quiet
git add internal/platform/app cmd/bot internal/management/backend.go Dockerfile docker-compose.yaml scripts/entrypoint.sh README.md
git commit -m "feat: support supervised Bot restart"
```

### 任务 6：实现前端类型、草稿和分类表单

**文件：**
- 修改：`jxh-manager/src/api/types.ts`
- 修改：`jxh-manager/src/api/system.ts`
- 修改：`jxh-manager/src/api/__tests__/system.spec.ts`
- 新建：`jxh-manager/src/components/system/configuration-draft.ts`
- 新建：`jxh-manager/src/components/system/__tests__/configuration-draft.spec.ts`
- 新建：`jxh-manager/src/components/system/SecretSettingInput.vue`
- 新建：`jxh-manager/src/components/system/SystemConfigurationForm.vue`
- 替换：`jxh-manager/src/components/system/__tests__/ConfigurationEditor.spec.ts`
- 删除：`jxh-manager/src/components/system/ConfigurationEditor.vue`

- [ ] **步骤 1：编写失败的 API、草稿和组件测试**

覆盖结构化 PATCH + `If-Match`、Bot 重启幂等键/版本、秘密 keep/replace/clear、环境字段省略、所有字段校验、只读模式和秘密不回显。

- [ ] **步骤 2：验证测试失败**

```bash
cd jxh-manager
npm run test:unit -- src/api/__tests__/system.spec.ts src/components/system/__tests__/configuration-draft.spec.ts src/components/system/__tests__/ConfigurationEditor.spec.ts --run
```

- [ ] **步骤 3：更新 API 边界**

导出新 schema 类型。实现 `updateConfiguration(patch, version)` 和 `restartBot(configurationVersion)`；前者设置 `If-Match`，后者只生成一个 `Idempotency-Key`。从 SPA API 删除未再消费的 `getHealth`、`restartNapCat`，后端兼容端点保留。

- [ ] **步骤 4：实现不可变草稿与 Patch**

`configuration-draft.ts` 定义 SecretDraft 的 keep/replace/clear 联合类型，实现 clone、字段校验、脏状态和 `toConfigurationPatch`。路径必须与后端完全一致；环境托管字段即使草稿被篡改也不得进入 Patch。

- [ ] **步骤 5：实现秘密控件和五类表单**

秘密控件只显示 configured/source，使用带 tooltip 的更换、取消、清除图标按钮，不把占位符写入 input。分类表单固定 WPS、AI、引用图、时间、数据保留顺序，并为每个字段提供稳定的 `data-test`。

- [ ] **步骤 6：验证并提交**

```bash
npm run test:unit -- src/api/__tests__/system.spec.ts src/components/system --run
npm run type-check
git add src/api src/components/system
git commit -m "feat: add structured system settings form"
```

### 任务 7：重建系统页与重启交互

**文件：**
- 修改：`jxh-manager/src/views/system/SystemView.vue`
- 修改：`jxh-manager/src/views/system/__tests__/SystemView.spec.ts`
- 新建：`jxh-manager/src/components/system/BotRestartDialog.vue`
- 新建：`jxh-manager/src/components/system/__tests__/BotRestartDialog.spec.ts`
- 修改：`jxh-manager/src/views/overview/OverviewView.vue`
- 修改：`jxh-manager/src/views/overview/__tests__/OverviewView.spec.ts`
- 删除：`jxh-manager/src/test/system-fixture.ts`（确认无引用后）
- 修改：`jxh-manager/e2e/fixtures/admin-api.ts`
- 修改：`jxh-manager/e2e/admin.spec.ts`

- [ ] **步骤 1：用设置页测试替换旧测试**

断言只渲染五类设置；不请求/显示健康、SSE、后台服务和 NapCat 操作；普通角色只读；409 保留草稿；仅 disk/applied 不同时提示重启；仅 `bot:restart + restart_supported` 显示按钮；恢复后刷新，超时不重复提交。

- [ ] **步骤 2：验证测试失败**

```bash
cd jxh-manager
npm run test:unit -- src/views/system/__tests__/SystemView.spec.ts src/views/overview/__tests__/OverviewView.spec.ts --run
```

- [ ] **步骤 3：重建 SystemView**

复用 `ResourceState`、`VersionConflict`、`OperationNotice`、auth store 和 overlay transition。删除 runtime store、系统 SSE 订阅、健康请求、依赖映射与 NapCat 状态。桌面使用 190px sticky 分类栏；移动端使用可横向滚动标签；底部固定保存栏放弃/保存/待重启。

- [ ] **步骤 4：实现 Bot 重启与重连**

确认框只接受精确 `restart`。202 后显示重连遮罩，每 1500ms 探测 `/auth/me`，最多 90 秒；首次成功整页 reload。网络失败视为正常停机；超时显示结果未知和手动探测，不再次提交重启动作。

- [ ] **步骤 5：更新总览和 E2E**

移除总览“查看系统详情”到 `/system` 的错误链接。E2E fixture 改为结构化资源；PATCH 仅合并提交分类并递增 disk version；Bot 重启提供可控认证停机序列。覆盖请求头、秘密禁用、精确确认和桌面/移动无重叠截图。

- [ ] **步骤 6：验证并提交**

```bash
npm run test:unit -- src/api/__tests__/system.spec.ts src/components/system src/views/system src/views/overview --run
npm run type-check
npm run build
npm run test:e2e -- --grep "系统设置|Bot 重启"
git add src/views/system src/views/overview src/components/system src/test/system-fixture.ts e2e
git commit -m "feat: rebuild system settings page"
```

### 任务 8：全量验证与真实部署烟测

**文件：** 只有验证暴露回归时才修改对应实现文件；禁止顺手重构。

- [ ] **步骤 1：运行前端全量验证**

```bash
cd jxh-manager
npm run test:unit -- --run
npm run type-check
npm run build
npm run test:e2e
```

- [ ] **步骤 2：运行后端全量验证**

```bash
cd Resource/Jxh-Go
go test -race ./...
go test ./...
go vet ./...
go build ./...
```

- [ ] **步骤 3：验证契约和仓库卫生**

```bash
cd jxh-manager
npm run api:generate
git diff --exit-code -- src/api/schema.d.ts
cd ..
git diff --check
git status --short
```

预期：生成类型无漂移、无空白错误，工作区只剩用户原有的无关文件。

- [ ] **步骤 4：执行 Docker 烟测**

备份 `Resource/Jxh-Go/data/config/config.yaml` 后启动 Compose：GET 记录 disk/applied version；PATCH 一个可恢复非敏感字段；确认待重启；POST Bot restart；观察容器重启和会话恢复；确认版本已应用；重建 Bot 容器确认配置仍在；通过 API 恢复原值并再次重启。API、日志和审计均不得出现秘密。

- [ ] **步骤 5：提交验证修复**

若验证暴露回归，回到对应任务的文件范围补失败测试、修复并使用该任务约定的精确 `git add` 路径提交；若无代码变化则不创建空提交。
