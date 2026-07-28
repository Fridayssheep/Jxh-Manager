# Jxh Manager 前端

精小弘 Bot 的管理端 SPA，覆盖总览、群与功能设置、入群审批、自定义命令、定时任务、知识库、统计、审计、账号会话和系统健康。

## 环境要求

- Node.js `^22.18.0` 或 `>=24.12.0`
- npm
- Google Chrome（Playwright 验收使用本机 Chrome 通道）
- 后端管理 API 默认位于同源 `/api/admin/v1`

本机 Node 版本不满足 `engines` 时，可显式使用 Node 24：

```powershell
npx --yes node@24.12.0 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' install
```

## 本地开发

```powershell
npm install
npm run dev
```

开发服务器默认打开 `http://127.0.0.1:5173`，并将同源 `/api/admin/v1` 代理到本机 `http://127.0.0.1:8090`。如需连接其他管理 API，可设置：

```powershell
$env:VITE_ADMIN_API_BASE_URL='http://127.0.0.1:8090/api/admin/v1'
npm run dev
```

浏览器只使用 HttpOnly Cookie 会话。登录和 `/auth/me` 返回的 CSRF Token 仅保存在 Pinia 内存中，状态修改请求由 API 客户端自动加入 `X-CSRF-Token`。

## 常用命令

```powershell
npm run test:unit -- --run
npm run type-check
npm run lint
npm run build
npm run test:e2e
```

`npm run test:e2e` 使用 API fixture，不依赖真实 QQ、NapCat、MySQL、WPS 或 AI 服务，并覆盖：

- `1440×1024` 桌面、`1024×768` 紧凑桌面和 `390×844` 移动端布局
- 登录与内存 CSRF
- 设置版本、审批决策、任务测试发送和系统重启的并发/幂等请求头
- 命令无副作用验证、知识库重载、统计导出和会话撤销
- 应用壳尺寸、横向溢出、控制台错误和可访问名称

仅运行桌面核心流程：

```powershell
npm run test:e2e -- --project=chromium
```

测试截图和 trace 写入 `output/playwright/`，不会进入 Git。

## OpenAPI 类型

接口契约位于 `../docs/api/jxh-manager-openapi.yaml`。契约更新后重新生成类型：

```powershell
npm run api:generate
npm run type-check
```

业务 API 必须继续通过 `src/api/client.ts` 访问：资源修改显式发送 `If-Match`，审批、重载、测试发送、会话撤销和重启等副作用动作显式生成 `Idempotency-Key`。

## 目录

```text
src/api/          OpenAPI 类型与业务 API 边界
src/app/          应用壳和权限导航
src/components/   数据、设置和反馈组件
src/stores/       会话、范围与运行时状态
src/views/        按管理资源划分的页面
src/test/         单元测试 fixture
e2e/              Playwright 主流程和 API fixture
```

后端仍是权限和业务状态的真源。前端权限只控制交互可达性，不替代后端 RBAC、版本检查、幂等处理或审计。
