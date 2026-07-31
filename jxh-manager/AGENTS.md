# Jxh Manager 前端代理规范

## 适用范围与优先级

- 本文件适用于 `jxh-manager/` 及其子目录。
- 用户明确要求优先；接口以 [`../docs/api/jxh-manager-openapi.yaml`](../docs/api/jxh-manager-openapi.yaml) 为真源。
- 设计细节引用 [`../docs/superpowers/specs/2026-07-28-jxh-manager-ui-design.md`](../docs/superpowers/specs/2026-07-28-jxh-manager-ui-design.md)；不要在本文件复制第二套规范。

## 技术栈与目录职责

- 使用 Vue 3、TypeScript、Vite、Pinia、Vue Router、OpenAPI Fetch、Vitest 和 Playwright。
- `src/api/` 负责 API 客户端与领域请求；`src/stores/` 负责跨页面状态；`src/views/` 负责路由页面。
- `src/components/` 只承载可复用 UI 或领域组件；`src/assets/` 维护设计 token 和全局样式。
- 通过 `npm run api:generate` 更新 `src/api/schema.d.ts`，生成文件不得手工编辑。

## API、鉴权与权限

- 业务请求必须经 `src/api/`，页面和组件不得散写 `fetch` 或直接拼接管理端点。
- 登录会话由 Pinia 管理；`csrf_token` 只保存在内存，修改请求通过 `X-CSRF-Token` 发送。
- 资源更新必须携带查询得到的 `version` 作为 `If-Match`；版本冲突展示可恢复的刷新/重试路径。
- 审批、测试发送、重载、重启等副作用动作必须携带新的 `Idempotency-Key`。
- 前端权限只用于隐藏或禁用交互；RBAC 和最终授权以服务端响应为准，不能伪造成功状态。
- 统一处理 `{ error: ... }`、401/403、409 和网络失败；危险动作必须有明确确认和进行中状态。

## 视觉与交互规范

- 遵循“珊瑚红事务台”：鲜艳红/粉作为强调色，正文使用中性深色，避免单色铺满、装饰性渐变和营销式 Hero。
- 页面以紧凑、可扫描的工作区为主；不使用卡片墙、嵌套卡片或超过 8px 的大圆角。
- 复用现有 token、全局卡片、按钮、间距和图标；优先使用 `@lucide/vue`，陌生图标提供 tooltip。
- 禁止可见的原生 `<select>`；选项菜单统一使用 `AppSelect`，并覆盖键盘、焦点、空值和加载状态。
- 操作结果统一使用 `OperationNotice`；列表刷新和内容变化使用既有平滑高度与上浮动效，避免布局跳变。
- 页面必须同时处理加载、空数据、错误、权限不足、保存中和保存成功状态。

## 响应式与可访问性

- 验收视口至少覆盖 `1440x1024`、`1024x768` 和 `390x844`；固定格式控件使用稳定尺寸约束。
- 不让文本、按钮、导航指示器或弹层互相遮挡；窄屏优先保证核心操作可达。
- 表单控件有可关联标签、可见焦点和键盘操作；颜色不是传达状态的唯一方式。

## 验证与调试

- 提交前运行：`npm run test:unit -- --run`、`npm run type-check`、`npm run test:e2e`、`npm run build`。
- 代码质量检查：`npx eslint . --cache`、`npx oxlint .`、`git diff --check`。
- E2E 默认使用 Playwright 的真实浏览器；无数据库时只使用仓库现有 fixture/mock，不改变生产 API 契约。
- 本地联调须确认 Vite 可从 `127.0.0.1:5173` 访问；浏览器出现 `about:blank` 时先检查开发服务器和 base URL。

## Git 与工作区保护

- 不要创建新的分支；在 `main` 上直接提交，避免合并冲突。
- 保留用户已有改动；不要重置、覆盖或删除无关文件，尤其是外层和前端的 `package-lock.json`。
- 修改前先查看 `git status`；提交只包含本任务文件及必要变更，并保持提交信息清晰。
- 不为局部修复另建重复规范文件；新增约束先更新本文件并链接对应设计文档。
- 提交时，遵顼查看现有提交风格。当前提交消息以**简短中文** Conventional Commit 为主，例如 `fix: ...`、`feat: ...`、`refactor: ...`。