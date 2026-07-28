# Jxh Manager Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `jxh-manager/` 中交付完整、可访问、可测试的管理端 SPA，覆盖 OpenAPI 中全部 57 个操作，并与“珊瑚红事务台”Figma 基准一致。

**Architecture:** 应用采用 Vue Router 分区、Pinia 管理会话与全局群范围、`openapi-fetch` 消费生成的 OpenAPI 类型。业务页面按资源组织，共享 API 错误、游标分页、版本冲突、幂等动作、SSE、确认对话框和数据状态组件；浏览器只使用 HttpOnly Cookie，会话中的 CSRF Token 仅保存在内存。

**Tech Stack:** Vue 3、TypeScript、Vue Router、Pinia、openapi-fetch、openapi-typescript、Lucide Vue、Vitest、Vue Test Utils、Playwright、CSS Custom Properties

---

## 1. 权威来源与冲突顺序

1. 业务能力、角色权限和非目标：`docs/superpowers/specs/2026-07-27-jxh-manager-design.md`。
2. 路径、字段、枚举、响应和错误：`docs/api/jxh-manager-openapi.yaml`。
3. 视觉、交互、响应式和可访问性：`docs/superpowers/specs/2026-07-28-jxh-manager-ui-design.md`。
4. 公共应用壳、密度和尺寸：Figma `01 Overview / Dashboard / Desktop`。
5. 后端当前实现差异：以 OpenAPI 为前端契约；未上线能力显示可理解的不可用状态，不在前端伪造成功。

## 2. 文件结构

```text
jxh-manager/src/
  api/
    client.ts                 # Cookie、CSRF、统一错误和 typed openapi-fetch 客户端
    schema.d.ts               # 从 OpenAPI 生成的类型
    types.ts                  # 常用 schema 别名
  app/
    AppShell.vue              # 224px 侧栏、52px 顶栏、移动抽屉
    navigation.ts             # 导航、权限和待办计数映射
  components/
    data/                     # DataTable、CursorPager、MetricStrip、TrendChart
    feedback/                 # AppToast、ConfirmDialog、ResourceState、VersionConflict
    ui/                       # Button、Field、Select、StatusBadge、Drawer、Tabs
  composables/
    useAsyncResource.ts       # loading/error/stale/refetch
    useCursorList.ts          # 游标栈与筛选重置
    useAdminEvents.ts         # SSE 重连和事件分发
  stores/
    auth.ts                   # 当前账号、权限、CSRF 和登录/退出
    scope.ts                  # 当前群范围
    notifications.ts         # 操作回执
  views/
    auth/LoginView.vue
    overview/OverviewView.vue
    groups/GroupsView.vue
    groups/GroupDetailView.vue
    settings/GlobalSettingsView.vue
    join-requests/JoinRequestsView.vue
    commands/CommandsView.vue
    commands/CommandEditorView.vue
    scheduled-jobs/ScheduledJobsView.vue
    knowledge/KnowledgeView.vue
    analytics/AnalyticsView.vue
    audit/AuditLogsView.vue
    users/UsersView.vue
    account/AccountView.vue
    system/SystemView.vue
```

页面测试和纯函数测试与源码同目录放入 `__tests__/`；跨页面主流程放入 `e2e/admin.spec.ts`，网络契约桩放入 `e2e/fixtures/admin-api.ts`。

## 3. OpenAPI 覆盖矩阵

| 页面/基础设施 | 必须消费的 operationId |
| --- | --- |
| 鉴权与个人账号 | `loginAdmin`、`getCurrentAdmin`、`logoutAdmin`、`changeOwnPassword` |
| 总览与实时状态 | `getOverview`、`subscribeAdminEvents` |
| 群与设置 | `listGroups`、`syncGroups`、`getGroup`、`getGlobalSettings`、`updateGlobalSettings`、`getGroupSettings`、`updateGroupSettings`、`deleteGroupSettings` |
| 入群审批 | `getJoinRequestPolicy`、`updateJoinRequestPolicy`、`listJoinRequests`、`getJoinRequest`、`listJoinRequestDecisions`、`decideJoinRequest`、`bulkDecideJoinRequests` |
| 自定义命令 | `listCommands`、`createCommand`、`getCommand`、`updateCommand`、`archiveCommand`、`validateCommandDraft`、`validateStoredCommand`、`listCommandRuns` |
| 定时任务 | `listScheduledJobs`、`createScheduledJob`、`getScheduledJob`、`updateScheduledJob`、`archiveScheduledJob`、`testSendScheduledJob`、`listScheduledJobRuns` |
| 知识库 | `getKnowledgeStatus`、`reloadKnowledge`、`listKnowledgeEntries`、`getKnowledgeEntry`、`listKnowledgeConflicts` |
| 统计 | `getAnalyticsSummary`、`getAnalyticsTimeseries`、`getAnalyticsRankings`、`exportAnalytics` |
| 审计 | `listAuditLogs`、`getAuditLog` |
| 账号与会话 | `listAdminUsers`、`createAdminUser`、`getAdminUser`、`updateAdminUser`、`resetAdminUserPassword`、`revokeAdminUserSessions`、`listAdminSessions`、`revokeAdminSession` |
| 系统 | `getSystemHealth`、`restartNapCat` |

## 4. 提交与验证约定

- 每个任务先运行指定测试观察预期失败，再写生产代码并观察通过。
- 每个功能提交前运行受影响单测、`npm run type-check`、`npm run lint` 和 `git diff --check`。
- `lint` 脚本带自动修复；提交前再次查看 diff，避免把无关文件纳入提交。
- 功能提交使用 `feat: ...`，测试基础使用 `test: ...`，工程或生成配置使用 `chore: ...`，文档使用 `docs: ...`。
- 完整交付前运行全量单测、生产构建、Chromium 桌面与移动 E2E，并检查截图和 canvas 像素。

### Task 1: 工程基础、API 类型与设计系统

**Files:**
- Modify: `jxh-manager/package.json`
- Modify: `jxh-manager/vite.config.ts`
- Create: `jxh-manager/src/api/schema.d.ts`
- Create: `jxh-manager/src/api/client.ts`
- Create: `jxh-manager/src/api/types.ts`
- Replace: `jxh-manager/src/assets/base.css`
- Replace: `jxh-manager/src/assets/main.css`
- Test: `jxh-manager/src/api/__tests__/client.spec.ts`

- [x] **Step 1: 写失败测试**

```ts
it('adds the in-memory csrf token to mutation requests', async () => {
  setCsrfToken('csrf-1')
  await request('/settings', { method: 'PATCH', body: {} })
  expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-1' })
})
```

- [x] **Step 2: 运行红灯**

Run: `npm run test:unit -- src/api/__tests__/client.spec.ts --run`

Expected: FAIL，因为 `setCsrfToken` 与 `request` 尚不存在。

- [x] **Step 3: 生成类型并实现客户端**

```ts
let csrfToken: string | null = null
export const setCsrfToken = (value: string | null) => { csrfToken = value }
export const api = createClient<paths>({ baseUrl: '/api/admin/v1', credentials: 'include' })
```

客户端中统一映射 `{ error }`、401、网络失败、`409 resource_version_conflict`，但由资源写操作显式传入 `If-Match`，由审批、重载、测试发送和重启动作显式传入 `Idempotency-Key`。

- [x] **Step 4: 实现视觉令牌并验证绿灯**

将规范中的字体、品牌色、中性色、语义色、4/6/8px 圆角、焦点和 reduced motion 写入 CSS；运行单测、类型检查和 lint。

- [x] **Step 5: 提交**

```bash
git commit -m "feat: 建立前端设计系统与 API 基础"
```

### Task 2: 鉴权、权限路由与应用壳

**Files:**
- Replace: `jxh-manager/src/App.vue`
- Modify: `jxh-manager/src/router/index.ts`
- Create: `jxh-manager/src/stores/auth.ts`
- Create: `jxh-manager/src/app/navigation.ts`
- Create: `jxh-manager/src/app/AppShell.vue`
- Create: `jxh-manager/src/views/auth/LoginView.vue`
- Test: `jxh-manager/src/stores/__tests__/auth.spec.ts`
- Test: `jxh-manager/src/app/__tests__/AppShell.spec.ts`

- [x] **Step 1: 写登录和权限导航失败测试**

```ts
it('keeps csrf only in memory after login', async () => {
  await store.login('operator', 'secret')
  expect(store.currentUser?.username).toBe('operator')
  expect(localStorage.length).toBe(0)
})
```

- [x] **Step 2: 运行红灯后实现 Pinia 会话**

启动时调用 `getCurrentAdmin`；登录成功写入当前用户、权限与内存 CSRF；退出清理状态。路由守卫只控制交互可达性，后端仍是权限真源。

- [x] **Step 3: 实现应用壳**

桌面严格使用 224px 侧栏、4px 品牌轨道、52px 顶栏、24px 内容边距；导航按权限显示，总览待办计数不改变行宽；窄屏切为抽屉。

- [x] **Step 4: 验证并提交**

```bash
git commit -m "feat: 实现管理端鉴权与应用壳"
```

### Task 3: 总览、健康状态与 SSE

**Files:**
- Create: `jxh-manager/src/views/overview/OverviewView.vue`
- Create: `jxh-manager/src/components/data/MetricStrip.vue`
- Create: `jxh-manager/src/components/data/TrendChart.vue`
- Create: `jxh-manager/src/composables/useAdminEvents.ts`
- Test: `jxh-manager/src/views/overview/__tests__/OverviewView.spec.ts`
- Test: `jxh-manager/src/composables/__tests__/useAdminEvents.spec.ts`

- [x] **Step 1: 写总览状态失败测试**

断言四项 KPI、需要处理、系统健康同时出现；SSE 断开时显示低干扰状态且保留显式刷新。

- [x] **Step 2: 运行红灯并实现总览**

`getOverview` 支持范围和群筛选；KPI 104px 高，趋势提供文本数值，待处理项链接保留筛选参数。

- [x] **Step 3: 实现 SSE 重连**

订阅审批、系统、任务和知识库主题；指数退避，事件只触发相关资源刷新，不整页闪烁。

- [x] **Step 4: 验证并提交**

```bash
git commit -m "feat: 实现总览与实时运行状态"
```

### Task 4: 群、全局设置与群级覆盖

**Files:**
- Create: `jxh-manager/src/views/groups/GroupsView.vue`
- Create: `jxh-manager/src/views/groups/GroupDetailView.vue`
- Create: `jxh-manager/src/views/settings/GlobalSettingsView.vue`
- Create: `jxh-manager/src/components/settings/FeatureSettingsForm.vue`
- Test: `jxh-manager/src/views/groups/__tests__/settings.spec.ts`

- [x] **Step 1: 写继承和版本冲突失败测试**

```ts
it('sends the loaded version through If-Match', async () => {
  await wrapper.get('[data-test=save]').trigger('click')
  expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ version: '7' }))
})
```

- [x] **Step 2: 实现群列表、同步与详情**

支持游标、搜索、健康/角色筛选、陈旧快照提示和群同步动作；详情显示有效设置、覆盖来源、审批策略、任务和近期状态。

- [x] **Step 3: 实现全局和群级设置**

覆盖 `keyword_reply`、`ai_qa`、`quote`、`link_cleaner`、`welcome`、`custom_commands`；群级使用继承/启用/停用三段控件，欢迎模板显示允许变量并阻止未知变量提交。

- [x] **Step 4: 处理 409 并提交**

冲突时保留编辑内容，显示重新读取与比较入口。

```bash
git commit -m "feat: 实现群管理与功能设置"
```

### Task 5: 入群审批与幂等决策

**Files:**
- Create: `jxh-manager/src/views/join-requests/JoinRequestsView.vue`
- Create: `jxh-manager/src/components/join-requests/JoinRequestDetail.vue`
- Create: `jxh-manager/src/components/join-requests/DecisionDialog.vue`
- Test: `jxh-manager/src/views/join-requests/__tests__/JoinRequestsView.spec.ts`

- [x] **Step 1: 写决策请求失败测试**

断言单条决策同时发送资源版本和稳定幂等键；超时显示结果未知，不报告失败或成功。

- [x] **Step 2: 实现游标列表和详情**

筛选群、决策、观察、AI、来源、逾期和排序；详情展示原始验证消息、AI 字段、解析状态和决策时间线。

- [x] **Step 3: 实现单条、批量和策略动作**

批准、拒绝分别使用成功和危险语义；批量限同群、提交前显示影响数量；自动审批策略显示确定性必填字段。

- [x] **Step 4: 验证并提交**

```bash
git commit -m "feat: 实现入群申请审批工作流"
```

### Task 6: 自定义命令与受控动作编辑器

**Files:**
- Create: `jxh-manager/src/views/commands/CommandsView.vue`
- Create: `jxh-manager/src/views/commands/CommandEditorView.vue`
- Create: `jxh-manager/src/components/commands/ParameterEditor.vue`
- Create: `jxh-manager/src/components/commands/ActionEditor.vue`
- Test: `jxh-manager/src/views/commands/__tests__/command-payload.spec.ts`

- [x] **Step 1: 写命令 payload 失败测试**

断言命令名仅小写 ASCII、安全参数名、固定跨群目标以及 `reply_text`、`mention`、`mute_member`、`send_group_text` 的联合类型序列化。

- [x] **Step 2: 实现命令列表和编辑器**

支持状态、范围、权限和搜索筛选；编辑器按基础信息、参数、权限与范围、动作序列、无副作用测试分区。

- [x] **Step 3: 实现验证、运行记录和归档**

草稿验证显示逐字段问题、解析参数和渲染动作；已保存命令可再次验证并查看不含自由文本原文的执行记录。

- [x] **Step 4: 验证并提交**

```bash
git commit -m "feat: 实现受控自定义命令管理"
```

### Task 7: 定时任务和知识库

**Files:**
- Create: `jxh-manager/src/views/scheduled-jobs/ScheduledJobsView.vue`
- Create: `jxh-manager/src/views/knowledge/KnowledgeView.vue`
- Test: `jxh-manager/src/views/scheduled-jobs/__tests__/ScheduledJobsView.spec.ts`
- Test: `jxh-manager/src/views/knowledge/__tests__/KnowledgeView.spec.ts`

- [x] **Step 1: 写任务版本与知识库只读失败测试**

断言任务修改发送 `If-Match`，测试发送使用幂等键且不改变任务状态；知识库页面不存在保存词条按钮。

- [x] **Step 2: 实现任务 CRUD、测试发送和运行历史**

每天/单次调度使用明确表单；列表突出下次执行、最近结果和启停；归档与测试发送均有确认及未知结果状态。

- [x] **Step 3: 实现知识库状态、词条、冲突和重载**

词条和冲突使用游标分页；只读详情展示来源与状态；重载显示操作 ID、接受时间和后续状态刷新。

- [x] **Step 4: 验证并提交**

```bash
git commit -m "feat: 实现定时任务与知识库管理"
```

### Task 8: 统计与导出

**Files:**
- Create: `jxh-manager/src/views/analytics/AnalyticsView.vue`
- Create: `jxh-manager/src/components/data/RankingTable.vue`
- Test: `jxh-manager/src/views/analytics/__tests__/AnalyticsView.spec.ts`

- [x] **Step 1: 写筛选同步与导出失败测试**

断言窗口、群、指标和结果进入 URL query；导出通过带 Cookie 的 fetch 下载 Blob，并从 `Content-Disposition` 获取文件名。

- [x] **Step 2: 实现摘要、趋势和排行**

图表系列使用品牌、信息、成功、警告等独立语义色，并提供图例、数值、表格替代和空状态。

- [x] **Step 3: 验证并提交**

```bash
git commit -m "feat: 实现运营统计与数据导出"
```

### Task 9: 审计、账号、会话与系统动作

**Files:**
- Create: `jxh-manager/src/views/audit/AuditLogsView.vue`
- Create: `jxh-manager/src/views/users/UsersView.vue`
- Create: `jxh-manager/src/views/account/AccountView.vue`
- Create: `jxh-manager/src/views/system/SystemView.vue`
- Test: `jxh-manager/src/views/system/__tests__/SystemView.spec.ts`
- Test: `jxh-manager/src/views/users/__tests__/UsersView.spec.ts`

- [x] **Step 1: 写角色与危险动作失败测试**

断言观察员只能查看脱敏审计，维护员看不到账号管理，超级管理员重启 NapCat 前必须输入确认文本且请求使用幂等键。

- [x] **Step 2: 实现审计和账号管理**

审计详情用结构化前后差异；账号支持创建、角色/状态修改、密码重置、撤销用户全部会话；会话列表支持撤销单条。

- [x] **Step 3: 实现个人密码和系统页**

个人页提供改密；系统页按固定顺序显示 NapCat、MySQL、WPS、AI、quote、SSE 的状态、最近成功和错误摘要，不显示密钥值。

- [x] **Step 4: 验证并提交**

```bash
git commit -m "feat: 实现审计账号与系统管理"
```

### Task 10: 全量 E2E、响应式与视觉验收

**Files:**
- Replace: `jxh-manager/e2e/vue.spec.ts`
- Create: `jxh-manager/e2e/admin.spec.ts`
- Create: `jxh-manager/e2e/fixtures/admin-api.ts`
- Modify: `jxh-manager/playwright.config.ts`
- Modify: `jxh-manager/README.md`

- [x] **Step 1: 写端到端失败测试**

覆盖登录、总览、群设置版本保存、审批幂等决策、命令草稿验证、任务测试发送、知识库重载、统计导出、账号会话撤销和 NapCat 重启确认。

- [x] **Step 2: 完成桌面、平板和移动布局**

在 1440x1024、1024x768、390x844 三个视口检查导航、筛选、表格、抽屉、对话框、最长中文和标识符；移动宽表切摘要列表，不水平压扁正文。

- [x] **Step 3: 运行完整验证**

```bash
npm run test:unit -- --run
npm run type-check
npm run lint
npm run build
npx playwright test --project=chromium
git diff --check
```

- [x] **Step 4: 截图与像素验收**

生成桌面与移动截图；确认页面非空、Logo 正确、侧栏/顶栏尺寸符合基准、无重叠、图表具有非背景像素、总览包含“需要处理”和“系统健康”。

- [x] **Step 5: 提交**

```bash
git commit -m "test: 完成管理端全流程验收"
```
