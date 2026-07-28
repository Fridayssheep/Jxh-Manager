# Jxh Manager Integration Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复管理端真实前后端联调发现的开发代理、会话事件、时间展示、SSE 建连、可选知识源启动、历史库迁移恢复和开关点击问题，并重新完成真实服务联调。

**Architecture:** 前端继续使用同源 `/api/admin/v1`、HttpOnly Cookie 与内存 CSRF；开发期由 Vite 代理到独立的 `:8090` 管理 API。后端保持迁移 008 SQL 与 checksum 不变，只对账本停在 007、结构精确匹配已知部分阶段且注释为已知双重编码或已规范化恢复状态的数据库执行受限恢复，随后仍由原迁移最终指纹验收。

**Tech Stack:** Vue 3、Pinia、Vite、Vitest、Playwright、Go 1.26、MySQL 8.4、Server-Sent Events

---

### Task 1: 开发代理与本地说明

**Files:**
- Modify: `jxh-manager/vite.config.ts`
- Modify: `jxh-manager/README.md`
- Test: `jxh-manager/src/app/__tests__/vite-config.spec.ts`

- [x] **Step 1: 写入失败测试**

导入 Vite 配置，断言 `/api/admin/v1` 的开发代理目标为 `http://127.0.0.1:8090`。

- [x] **Step 2: 验证测试因缺少代理失败**

Run: `npm run test:unit -- --run src/app/__tests__/vite-config.spec.ts`

- [x] **Step 3: 添加代理并修正文档端口**

在 `server.proxy` 中配置管理 API 代理；README 的跨源示例端口由 `8080` 改为 `8090`，并说明默认开发方式无需设置跨源 API 地址。

- [x] **Step 4: 验证代理配置测试通过**

Run: `npm run test:unit -- --run src/app/__tests__/vite-config.spec.ts`

### Task 2: 仅响应当前会话撤销事件

**Files:**
- Modify: `jxh-manager/src/stores/auth.ts`
- Modify: `jxh-manager/src/App.vue`
- Test: `jxh-manager/src/stores/__tests__/auth.spec.ts`

- [x] **Step 1: 写入失败测试**

登录上下文写入后，断言撤销其他 session 不清理身份，撤销当前 session 才清理身份；清理时同时移除当前 session ID。

- [x] **Step 2: 验证测试因未保存 session ID 失败**

Run: `npm run test:unit -- --run src/stores/__tests__/auth.spec.ts`

- [x] **Step 3: 实现会话匹配并接入 SSE 事件**

Auth store 保存 `context.session.session_id`，提供只在 ID 相等时清理并返回结果的方法；`App.vue` 仅在事件资源类型为 `session` 且命中当前会话时跳转登录页。

- [x] **Step 4: 验证会话测试通过**

Run: `npm run test:unit -- --run src/stores/__tests__/auth.spec.ts`

### Task 3: 本地时间与开关命中区域

**Files:**
- Modify: `jxh-manager/src/views/knowledge/KnowledgeView.vue`
- Modify: `jxh-manager/src/views/knowledge/__tests__/KnowledgeView.spec.ts`
- Modify: `jxh-manager/src/components/settings/FeatureSettingsForm.vue`
- Modify: `jxh-manager/src/components/join-requests/JoinRequestDetail.vue`

- [x] **Step 1: 写入失败时间测试**

让知识库状态返回固定 UTC 时间，断言页面输出与浏览器 `Intl.DateTimeFormat('zh-CN', ...)` 的本地格式一致，而不是删除 `Z` 后直接显示 UTC。

- [x] **Step 2: 验证测试因原始 UTC 切片失败**

Run: `npm run test:unit -- --run src/views/knowledge/__tests__/KnowledgeView.spec.ts`

- [x] **Step 3: 使用统一 Intl 格式并修复隐藏 checkbox 命中**

知识库时间改用与其他管理页一致的 `Intl.DateTimeFormat`。两个视觉开关让透明原生 checkbox 覆盖轨道并位于装饰 span 上方，使键盘、标签点击与 Playwright `check()` 都命中同一原生控件。

- [x] **Step 4: 验证知识库测试与浏览器 checkbox 操作**

Run: `npm run test:unit -- --run src/views/knowledge/__tests__/KnowledgeView.spec.ts`

### Task 4: SSE 立即发送首帧

**Files:**
- Modify: `Resource/Jxh-Go/internal/management/api/events_handler.go`
- Modify: `Resource/Jxh-Go/internal/management/api/events_handler_test.go`

- [x] **Step 1: 写入失败测试**

在第一次 Flush 后取消请求，断言响应体已经包含 `: connected\n\n`，证明代理无需等待 15 秒心跳即可确认流已打开。

- [x] **Step 2: 验证测试因首次 Flush 没有响应字节失败**

Run: `go test ./internal/management/api -run TestSSEWritesInitialCommentBeforeFirstFlush -count=1`

- [x] **Step 3: 在首次 Flush 前写 SSE comment**

设置流响应头后写入 `: connected\n\n`，再 Flush；事件、心跳与鉴权轮询语义保持不变。

- [x] **Step 4: 验证 SSE 测试通过**

Run: `go test ./internal/management/api -run TestSSE -count=1`

### Task 5: 无 WPS 和缓存时降级启动

**Files:**
- Modify: `Resource/Jxh-Go/cmd/bot/main.go`
- Modify: `Resource/Jxh-Go/cmd/bot/main_test.go`

- [x] **Step 1: 写入失败测试**

使用空 WPS 地址和不存在的缓存路径初始化知识运行时，断言返回空索引、可用 Syncer 且 WPS 健康码为 `not_configured`；配置了来源但同步与缓存都失败时健康码为 `unavailable`。

- [x] **Step 2: 验证测试因当前启动路径返回致命错误失败**

Run: `go test ./cmd/bot -run TestInitializeKnowledge -count=1`

- [x] **Step 3: 提取初始化函数并改为显式降级**

WPS 成功标记 `available`，缓存回退标记 `cache`，无来源标记 `not_configured`，有来源但无可用索引标记 `unavailable`；所有失败都保留空的线程安全索引供管理 API 查看和后续 reload，不再阻止 bot/admin 启动。

- [x] **Step 4: 验证 bot 启动单元测试通过**

Run: `go test ./cmd/bot -run 'TestInitializeKnowledge|TestRunWithDependencies' -count=1`

### Task 6: 历史库迁移 008 部分状态恢复

**Files:**
- Modify: `Resource/Jxh-Go/internal/platform/database/migrate.go`
- Create: `Resource/Jxh-Go/internal/platform/database/migrate_manager_recovery.go`
- Modify: `Resource/Jxh-Go/internal/platform/database/migrate_mysql_integration_test.go`

- [x] **Step 1: 写入失败 MySQL 集成测试**

在临时数据库先执行 001-007，再执行一个在 008 的群申请约束和定时任务列阶段后故意中断的 SQL 变体，并把 22 条历史中文注释变成已知双重编码；随后用未修改的 001-009 manifest 调用 Runner，断言当前实现失败且账本仍停在 007。

- [x] **Step 2: 实现受限恢复前置检查**

只在以下条件全部成立时进入恢复：迁移身份/checksum 精确等于仓库 008；已应用计数为 7；管理表尚未创建；群申请为 stage 2；定时任务为 stage 1；待修注释集合逐项等于已知双重编码值；其他阶段计数精确匹配。任何额外漂移继续返回 `ErrDrift`。

- [x] **Step 3: 规范化元数据并复用原迁移最终验收**

用两个显式 `ALTER TABLE ... MODIFY COLUMN ... COMMENT` 恢复 22 条规范 UTF-8 注释；仅在该恢复路径中把 008 的群申请 stage-2 中间指纹替换为规范化部分状态在 MySQL 8.4 上的已知指纹。恢复准备中断后再次启动时，使用与 008 相同的结构指纹算法区分原始 canonical 状态与已规范化状态。账本仍记录原始 008 checksum，最终 group/scheduled/manager 表和触发器继续由原 SQL 指纹校验。

- [x] **Step 4: 验证恢复与拒绝漂移**

Run: `go test ./internal/platform/database -run 'TestMySQLMigration008RecoversKnownPartialMetadata|TestMySQLMigrations' -count=1`

- [x] **Step 5: 备份并迁移实际 jxh_bot**

先用 `mysqldump --single-transaction` 生成本地恢复备份，再运行迁移器；验证账本为 001-009、`schema_migration_attempts` 为空、管理表与触发器存在、核心业务行计数迁移前后相等。禁止删除或重建 `jxh_bot`。

### Task 7: 全量验证与真实联调

**Files:**
- Verify only

- [x] **Step 1: 前端全量验证**

Run: `npm run test:unit -- --run`

Run: `npm run type-check`

Run: `npm run build`

- [x] **Step 2: 后端全量验证**

Run: `gofmt -w <changed-go-files>`

Run: `go test ./...`

Run: `go build ./...`

Run: `go vet ./...`

Run: `go mod tidy -diff`

- [x] **Step 3: 同源真实浏览器联调**

使用正式 `vite.config.ts` 启动前端，登录真实 `:8090` 管理 API，验证 Cookie/CSRF、设置读取与版本修改、其他会话撤销不退出当前浏览器、知识时间为本地时间、SSE 立即 connected、命令创建归档和当前会话退出。

- [x] **Step 4: 标注外部能力边界**

NapCat 未登录时，群同步、真实审批、定时发送和真实命令动作只能保留为未验证状态；不得把 API fixture 或静态页面结果描述为真实 QQ 联调成功。
