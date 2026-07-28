# Jxh Manager UI 与配置编辑优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一管理面板的字体、卡片、间距和页面动效，将知识库明确收敛为唯一 WPS 来源，并允许有权限的管理员从前端安全修改 Bot 实际加载的 `config.yaml`。

**Architecture:** 前端继续使用现有 Vue 3、Pinia、Vue Router 和 OpenAPI client；全局动效放在应用壳与设计令牌层，总览和知识库只调整各自视图。后端在 `platform/config` 提供带版本、敏感字段掩码和原子写入的 YAML 文件编辑器，由 `management/system` 完成权限检查并通过 `/api/admin/v1/system/configuration` 暴露；文件保存不热更新进程，响应明确标记需要重启，环境变量继续覆盖文件值。

**Tech Stack:** Vue 3, TypeScript, Vitest, Vue Test Utils, Go 1.25, `gopkg.in/yaml.v3`, OpenAPI 3.1, Playwright

---

### Task 1: 统一字体与总览卡片

**Files:**
- Modify: `jxh-manager/src/assets/base.css`
- Modify: `jxh-manager/src/assets/__tests__/tokens.spec.ts`
- Modify: `jxh-manager/src/components/data/MetricStrip.vue`
- Modify: `jxh-manager/src/views/overview/OverviewView.vue`
- Modify: `jxh-manager/src/views/overview/__tests__/OverviewView.spec.ts`

- [ ] **Step 1: 写失败测试**

  在令牌测试中要求 `--font-ui` 使用系统 UI 字体栈，并在总览测试中要求 KPI、最近趋势、需要处理和系统健康均具有统一的 `overview-card` 边界类。

- [ ] **Step 2: 验证测试按预期失败**

  Run: `npm run test:unit -- src/assets/__tests__/tokens.spec.ts src/views/overview/__tests__/OverviewView.spec.ts --run`

  Expected: 字体栈和下方三块 `overview-card` 断言失败。

- [ ] **Step 3: 实现统一几何与间距**

  将 UI 字体改为 `system-ui`、Apple/Windows 系统字体和 `Noto Sans SC` 回退；增加统一卡片内边距令牌。总览工作区改为有间隙的卡片网格，趋势、待处理和健康区统一使用灰色边框、`var(--radius-panel)` 圆角和一致内边距；顶部 KPI 使用同一组边框、圆角和内边距令牌。

- [ ] **Step 4: 运行测试与构建**

  Run: `npm run test:unit -- src/assets/__tests__/tokens.spec.ts src/views/overview/__tests__/OverviewView.spec.ts --run`

  Expected: PASS。

- [ ] **Step 5: 提交**

  ```bash
  git add jxh-manager/src/assets/base.css jxh-manager/src/assets/__tests__/tokens.spec.ts jxh-manager/src/components/data/MetricStrip.vue jxh-manager/src/views/overview/OverviewView.vue jxh-manager/src/views/overview/__tests__/OverviewView.spec.ts
  git commit -m "style: 统一总览卡片与字体"
  ```

### Task 2: 明确唯一 WPS 知识来源

**Files:**
- Modify: `jxh-manager/src/views/knowledge/KnowledgeView.vue`
- Modify: `jxh-manager/src/views/knowledge/__tests__/KnowledgeView.spec.ts`

- [ ] **Step 1: 写失败测试**

  要求页面只渲染一个 `data-test="knowledge-source"`，名称为“WPS 知识源”；词条类型改写为“精确回复/AI 检索用途”，不得呈现第二个知识库来源。

- [ ] **Step 2: 验证测试失败**

  Run: `npm run test:unit -- src/views/knowledge/__tests__/KnowledgeView.spec.ts --run`

  Expected: 缺少唯一来源标识。

- [ ] **Step 3: 实现单来源呈现**

  将状态首格改为唯一 WPS 来源身份和当前索引状态；保留词条/冲突只读视图，但把 `entry_type` 解释为同一 WPS 词条的消费方式，不再使用容易误解为独立“AI 知识库”的文案。

- [ ] **Step 4: 验证并提交**

  Run: `npm run test:unit -- src/views/knowledge/__tests__/KnowledgeView.spec.ts --run`

  ```bash
  git add jxh-manager/src/views/knowledge/KnowledgeView.vue jxh-manager/src/views/knowledge/__tests__/KnowledgeView.spec.ts
  git commit -m "fix: 收敛知识库为 WPS 单一来源"
  ```

### Task 3: 实现安全的 config.yaml 文件编辑器

**Files:**
- Modify: `Resource/Jxh-Go/internal/platform/config/config.go`
- Create: `Resource/Jxh-Go/internal/platform/config/editor.go`
- Create: `Resource/Jxh-Go/internal/platform/config/editor_test.go`
- Modify: `Resource/Jxh-Go/internal/management/system/service.go`
- Modify: `Resource/Jxh-Go/internal/management/system/service_test.go`
- Modify: `Resource/Jxh-Go/internal/management/backend.go`
- Modify: `Resource/Jxh-Go/internal/management/api/system_handlers.go`
- Modify: `Resource/Jxh-Go/internal/management/api/system_handlers_test.go`

- [ ] **Step 1: 写平台层失败测试**

  覆盖：读取后敏感路径 `admin.session_secret`、`onebot.access_token`、`wps.sid`、`database.password`、`database.dsn`、`ai.api_key` 被固定占位符替换；保存未修改占位符时原密钥保留；新密钥可替换；未知字段/非法 YAML 不写文件；过期版本返回冲突；成功写入后版本变化。

- [ ] **Step 2: 验证平台测试失败**

  Run: `go test ./internal/platform/config -run 'TestFileEditor'`

  Expected: `FileEditor` 尚不存在。

- [ ] **Step 3: 实现文件编辑器**

  `Config` 增加 `SourcePath string \`yaml:"-"\``，`Load` 保存实际来源路径。`FileEditor` 使用 YAML AST 掩码/恢复敏感标量，使用严格字段解码验证单一 YAML 文档，基于原始字节 SHA-256 生成 JavaScript 安全整数版本，并在同目录写临时文件后替换原文件；文件权限沿用原文件且不宽于 `0600`。

- [ ] **Step 4: 写管理服务与 HTTP 失败测试**

  覆盖 `system:read` 可读取、`settings:write` 可修改、观察者不能修改；GET/PATCH 路由、`If-Match`、409 `resource_version_conflict`、400 非法文档和 503 配置文件不可用。

- [ ] **Step 5: 实现服务与路由**

  扩展 `SystemOperations`：

  ```go
  Configuration(context.Context, auth.Principal) (system.Configuration, error)
  UpdateConfiguration(context.Context, auth.Principal, uint64, string) (system.Configuration, error)
  ```

  新增 `GET/PATCH /api/admin/v1/system/configuration`。响应包含 `yaml`、`masked_fields`、`environment_overrides`、`restart_required: true` 和 `version`；任何响应和日志均不包含真实敏感值。

- [ ] **Step 6: 验证并提交**

  Run: `gofmt -w internal/platform/config/config.go internal/platform/config/editor.go internal/platform/config/editor_test.go internal/management/system/service.go internal/management/system/service_test.go internal/management/backend.go internal/management/api/system_handlers.go internal/management/api/system_handlers_test.go`

  Run: `go test ./internal/platform/config ./internal/management/system ./internal/management/api`

  ```bash
  git add Resource/Jxh-Go/internal/platform/config Resource/Jxh-Go/internal/management/system Resource/Jxh-Go/internal/management/backend.go Resource/Jxh-Go/internal/management/api/system_handlers.go Resource/Jxh-Go/internal/management/api/system_handlers_test.go
  git commit -m "feat: 支持安全编辑 Bot 配置文件"
  ```

### Task 4: 更新 OpenAPI 与前端配置编辑器

**Files:**
- Modify: `docs/api/jxh-manager-openapi.yaml`
- Modify: `jxh-manager/src/api/schema.d.ts` (generated)
- Modify: `jxh-manager/src/api/types.ts`
- Modify: `jxh-manager/src/api/system.ts`
- Modify: `jxh-manager/src/api/__tests__/system.spec.ts`
- Create: `jxh-manager/src/components/system/ConfigurationEditor.vue`
- Create: `jxh-manager/src/components/system/__tests__/ConfigurationEditor.spec.ts`
- Modify: `jxh-manager/src/views/system/SystemView.vue`
- Modify: `jxh-manager/src/views/system/__tests__/SystemView.spec.ts`

- [ ] **Step 1: 先定义契约并生成类型**

  为 `/system/configuration` 增加 GET/PATCH、`SystemConfiguration` 和 `SystemConfigurationPatch`，沿用 CSRF、Origin 与 `If-Match` 规则；标记 `x-stage: phase_1`、`x-status: implemented`。

- [ ] **Step 2: 写前端失败测试**

  API 测试要求 PATCH 发送 `If-Match`；组件测试要求加载 YAML、显示掩码和环境变量提示、无权限时只读、修改后保存、409 时保留草稿并允许重载服务器版本。

- [ ] **Step 3: 验证测试失败**

  Run: `npm run api:generate && npm run test:unit -- src/api/__tests__/system.spec.ts src/components/system/__tests__/ConfigurationEditor.spec.ts --run`

- [ ] **Step 4: 实现配置编辑器**

  在系统页增加独立全宽配置区域，使用固定尺寸等宽 textarea 编辑服务端返回的 YAML。保存按钮仅对 `settings:write` 开放；显示敏感字段占位规则、环境变量覆盖列表、版本号和“重启后生效”状态；网络中断不宣称保存成功，409 不覆盖本地草稿。

- [ ] **Step 5: 验证并提交**

  Run: `npm run test:unit -- src/api/__tests__/system.spec.ts src/components/system/__tests__/ConfigurationEditor.spec.ts src/views/system/__tests__/SystemView.spec.ts --run`

  Run: `npm run type-check`

  ```bash
  git add docs/api/jxh-manager-openapi.yaml jxh-manager/src/api jxh-manager/src/components/system jxh-manager/src/views/system
  git commit -m "feat: 增加 Bot 配置文件编辑界面"
  ```

### Task 5: 页面与导航动效、冗余状态清理

**Files:**
- Modify: `jxh-manager/src/App.vue`
- Modify: `jxh-manager/src/app/AppShell.vue`
- Modify: `jxh-manager/src/app/__tests__/AppShell.spec.ts`
- Modify: `jxh-manager/src/assets/main.css`

- [ ] **Step 1: 写失败测试**

  应用壳测试要求顶部不存在“实时同步/等待实时连接”，侧栏不存在“服务状态待同步”，并存在单一可移动的 `data-test="navigation-highlight"`；App 渲染测试要求路由内容位于 `page-rise` Transition 中。

- [ ] **Step 2: 实现动效**

  删除顶部实时同步标签和侧栏底部状态块。应用壳通过链接几何位置驱动一个绝对定位的导航高亮层，在当前路由变化时用 `transform` 平移；页面路由使用 `page-rise` 过渡，页面一级元素以 40ms 递增延迟从下方 10px 上浮并淡入。`prefers-reduced-motion` 下继续由现有全局规则关闭动画。

- [ ] **Step 3: 验证并提交**

  Run: `npm run test:unit -- src/app/__tests__/AppShell.spec.ts --run`

  ```bash
  git add jxh-manager/src/App.vue jxh-manager/src/app/AppShell.vue jxh-manager/src/app/__tests__/AppShell.spec.ts jxh-manager/src/assets/main.css
  git commit -m "style: 增加页面与导航切换动效"
  ```

### Task 6: 全量验证与真实联调

**Files:**
- Modify only when verification exposes a regression.

- [ ] **Step 1: 前端静态验证**

  Run: `npm run test:unit -- --run`

  Run: `npm run type-check`

  Run: `npm run build`

- [ ] **Step 2: 后端静态验证**

  Run: `go test ./...`

  Run: `go build ./...`

  Run: `go vet ./...`

  Run: `go mod tidy -diff`

- [ ] **Step 3: 启动前后端并验证接口**

  使用仓库现有 MySQL/NapCat 环境启动后端和 Vite；登录后读取 `/system/configuration`，确认返回 YAML 中不含真实密钥；修改一个可恢复的非敏感字段并保存，直接读取磁盘 `config.yaml` 证明已写入，再恢复原值并证明版本冲突保护有效。

- [ ] **Step 4: Playwright 视觉与交互验收**

  在至少 `1440x1024`、`1024x768` 和 `390x844` 检查：总览卡片边框/圆角/内边距一致；知识库只有 WPS 来源；系统配置编辑可用；页面元素切换时上浮且无重叠；侧栏高亮在不同菜单间平移；冗余文案已删除。截图保存在 `jxh-manager/output/playwright/`。

- [ ] **Step 5: 最终提交（仅在联调产生修复时）**

  ```bash
  git add <仅联调修复文件>
  git commit -m "fix: 修复管理面板配置联调问题"
  ```
