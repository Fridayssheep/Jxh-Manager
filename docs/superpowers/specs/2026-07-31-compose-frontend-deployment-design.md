# Docker Compose 前后端一体化部署设计

## 1. 目标

在现有 `Resource/Jxh-Go/docker-compose.yaml` 部署中加入 `jxh-manager` 前端，使浏览器通过同一个 Origin 访问 Vue 管理面板和 `/api/admin/v1` 管理 API。部署完成后，后端管理端口不再直接发布到宿主机。

本次只调整容器构建、反向代理、Compose 编排和部署说明，不改变前后端业务接口，也不在容器内终止生产 TLS。

## 2. 总体架构

```text
浏览器
  |
  | HTTP（本地）或 HTTPS（生产宿主机反向代理终止 TLS）
  v
frontend:80 (Nginx)
  |-- /、/login、/groups/...  -> Vue SPA 静态文件
  `-- /api/admin/v1/...       -> bot:8090
                                      |
                                      `-- 现有管理 API
```

宿主机默认只发布 `${WEB_PORT:-8080}:80`。`bot:8090` 仅在 Compose 内部管理网络中可达；Bot 的 `/healthz` 仍由原有容器健康检查在容器网络内访问。

## 3. 前端镜像

在 `jxh-manager/` 新增以下文件：

- `Dockerfile`：使用 Node 24 Alpine 执行 `npm ci` 和 `npm run build`，再使用 Nginx Alpine 提供 `dist/`。
- `nginx.conf`：提供 SPA fallback、管理 API 代理、SSE 专用配置和静态健康检查。
- `.dockerignore`：排除 `node_modules`、`dist`、测试报告、编辑器文件和本地环境文件。

镜像构建必须使用锁文件安装依赖，构建阶段同时执行现有 TypeScript 检查与 Vite 生产构建。运行镜像只包含 Nginx、配置和构建产物，不携带 Node 运行时或源码。

## 4. Nginx 路由

Nginx 路由按以下优先级处理：

1. `GET /healthz` 返回固定的 `200`，供 Compose 判断前端静态服务是否可用。
2. `/api/admin/v1/events` 代理到 `http://bot:8090`，使用 HTTP/1.1，关闭响应缓冲与缓存，并设置足以覆盖长连接的读取超时。
3. `/api/admin/v1/` 原样代理到 `http://bot:8090`，不重写路径。
4. `/assets/` 使用长期不可变缓存。
5. 其他路径使用 `try_files` 回退到 `/index.html`，保证 Vue Router 的 history 路由刷新可用；入口 HTML 禁止长期缓存。

代理传递 `Host`、`X-Forwarded-For` 和 `X-Forwarded-Proto`。如果宿主机前置 HTTPS 代理已经提供 `X-Forwarded-Proto`，前端 Nginx 保留该值；本地直接访问时使用当前请求协议。

前端继续使用现有相对基址 `/api/admin/v1` 和带凭据请求，不引入运行时 API 地址注入，也不需要 CORS。

## 5. Compose 编排

`docker-compose.yaml` 新增 `frontend` 服务：

- 构建上下文为 `../../jxh-manager`。
- 发布 `${WEB_PORT:-8080}:80`。
- 等待 `bot` 健康后启动。
- 配置独立健康检查和 `restart: unless-stopped`。
- 加入仅承载宿主端口发布的 edge 网络和内部管理网络。

`bot` 服务作以下调整：

- 删除 `${ADMIN_PORT:-8090}:8090` 宿主机映射。
- 使用 `expose: 8090` 表明只供容器网络访问。
- 同时加入原有默认网络和内部管理网络。
- 默认 `JXH_ADMIN_PUBLIC_ORIGIN` 改为前端入口 `http://localhost:${WEB_PORT:-8080}`。

edge 网络只连接 `frontend`，为宿主端口发布提供网关；内部管理网络只连接 `frontend` 与 `bot`，并保持 `internal: true`。MySQL、NapCat、quote 和 migrate 保持在默认后端网络，前端不能通过 Compose 服务发现直接访问这些依赖。

## 6. Origin、Cookie 与代理信任

本地 HTTP 默认配置为：

```dotenv
WEB_PORT=8080
JXH_ADMIN_PUBLIC_ORIGIN=http://localhost:8080
JXH_ADMIN_COOKIE_SECURE=false
```

生产 HTTPS 必须显式配置浏览器实际访问地址：

```dotenv
WEB_PORT=8080
JXH_ADMIN_PUBLIC_ORIGIN=https://manager.example.com
JXH_ADMIN_COOKIE_SECURE=true
```

`JXH_ADMIN_PUBLIC_ORIGIN` 必须只包含 scheme、host 和可选端口，且与浏览器发送的 `Origin` 完全一致。宿主机反向代理把流量转发到 `127.0.0.1:${WEB_PORT}`，证书与 HTTPS 重定向仍由宿主机负责。

后端默认不信任任意 `X-Forwarded-For`，避免内部服务伪造客户端地址。确实需要后端获得真实客户端 IP 时，由部署者通过 `JXH_ADMIN_TRUSTED_PROXIES` 明确列出实际代理 CIDR；本次不预设宽泛私网范围。

## 7. 健康与故障行为

- `frontend` 健康只代表 Nginx 和静态文件可用。
- `bot` 健康继续代表 Bot 进程存活，不与前端健康混合。
- 首次启动时，`frontend` 等待 `bot` 健康；运行中 `bot` 重启不会导致前端容器退出。
- 后端暂时不可用时，Nginx 返回网关错误，现有前端统一错误处理负责提示和重试。
- SSE 连接在后端重启或代理断开后，由浏览器 `EventSource` 按服务端重试提示自动重连。

## 8. 文档与兼容性

更新 `Resource/Jxh-Go/.env.example` 和 `README.md`：

- Compose 服务列表加入前端。
- 默认访问地址改为 `http://localhost:8080`。
- 首个超级管理员通过 Compose 中的 `jxh-admin-bootstrap` 创建，避免要求宿主机安装 Go。
- 说明本地 HTTP 与生产 HTTPS 的环境变量组合。
- 删除 `ADMIN_PORT` 的 Compose 配置说明，明确 `8090` 不再发布到宿主机。

保留 `VITE_ADMIN_API_BASE_URL` 作为非 Compose 场景的开发能力；标准 Compose 部署不设置它。

## 9. 验证标准

实施完成后必须验证：

1. `docker compose config` 能正确展开服务、端口、依赖和网络。
2. 前端镜像可以从干净上下文完成 `npm ci`、类型检查和生产构建。
3. Nginx 配置通过语法检查。
4. `GET /` 返回 SPA，直接请求 `/groups` 等前端路由同样返回 SPA。
5. 从前端入口请求 `/api/admin/v1/auth/me` 能到达后端，而宿主机不能再直接通过 `8090` 访问管理 API。
6. 登录 Cookie、Origin 校验和 CSRF 在同源入口下工作。
7. `/api/admin/v1/events` 可持续接收 SSE 心跳且不被 Nginx 缓冲。
8. 前后端既有单元测试、类型检查和 Go 测试保持通过。

## 10. 非目标

- 不在前端容器中签发或续期 TLS 证书。
- 不增加跨域 API 部署模式。
- 不把后端健康接口暴露为公网运维接口。
- 不修改管理 API 契约或前端业务页面。
- 不顺带实施旧 QQ 内置命令移除等其他功能改造。
