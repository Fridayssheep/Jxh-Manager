# Docker Compose 前后端一体化部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Vue 管理面板提供生产前端镜像，并把它加入现有后端 Docker Compose，使浏览器通过同一个入口访问 SPA 和管理 API。

**Architecture:** Node 24 构建 Vue 静态产物，Nginx 运行镜像提供 SPA 并反向代理 `/api/admin/v1` 到仅在 Compose 内部网络暴露的 `bot:8090`。宿主机只发布前端端口；生产 TLS 继续由宿主机反向代理终止。

**Tech Stack:** Docker Compose、Docker 多阶段构建、Node.js 24、Vite、Vue 3、Nginx、Go 管理 API、SSE

---

### Task 1: 构建前端生产镜像

**Files:**
- Create: `jxh-manager/Dockerfile`
- Create: `jxh-manager/.dockerignore`
- Create: `jxh-manager/nginx.conf`

- [ ] **Step 1: 确认生产镜像文件尚不存在**

Run:

```powershell
@('Dockerfile', '.dockerignore', 'nginx.conf') | ForEach-Object { "$_=$(Test-Path $_)" }
```

Expected: 三项均为 `False`。

- [ ] **Step 2: 新增锁文件驱动的多阶段 Dockerfile**

Create `jxh-manager/Dockerfile`:

```dockerfile
FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.28-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
RUN nginx -t

EXPOSE 80
```

- [ ] **Step 3: 排除不属于镜像上下文的本地文件**

Create `jxh-manager/.dockerignore`:

```dockerignore
.git
.gitignore
.vscode
.idea
.env
.env.*
node_modules
dist
coverage
playwright-report
test-results
*.log
```

- [ ] **Step 4: 配置 SPA、API、SSE 与健康检查路由**

Create `jxh-manager/nginx.conf`:

```nginx
map $http_x_forwarded_proto $jxh_forwarded_proto {
    default $http_x_forwarded_proto;
    ""      $scheme;
}

server {
    listen 80;
    server_name _;
    server_tokens off;

    root /usr/share/nginx/html;
    index index.html;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "no-referrer" always;

    location = /healthz {
        access_log off;
        default_type text/plain;
        return 200 "ok\n";
    }

    location = /api/admin/v1/events {
        proxy_pass http://bot:8090;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $jxh_forwarded_proto;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }

    location /api/admin/v1/ {
        proxy_pass http://bot:8090;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $jxh_forwarded_proto;
        proxy_read_timeout 60s;
    }

    location /assets/ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "DENY" always;
        add_header Referrer-Policy "no-referrer" always;
    }

    location / {
        try_files $uri $uri/ /index.html;
        expires -1;
    }
}
```

- [ ] **Step 5: 构建镜像并验证 Nginx 配置**

Run:

```powershell
docker build --tag jxh-manager:deploy-test .
docker run --rm jxh-manager:deploy-test nginx -t
```

Expected: 前端类型检查和 Vite 构建成功，`nginx: configuration file ... test is successful`。

- [ ] **Step 6: 提交前端镜像文件**

```powershell
git add -- Dockerfile .dockerignore nginx.conf
git commit -m "feat: 增加前端容器镜像"
```

### Task 2: 把前端接入后端 Compose

**Files:**
- Modify: `Resource/Jxh-Go/docker-compose.yaml`

- [ ] **Step 1: 记录当前 Compose 不包含前端且发布 8090 的基线**

Run:

```powershell
$compose = docker compose --env-file .env.example config --format json | ConvertFrom-Json
$compose.services.PSObject.Properties.Name
$compose.services.bot.ports
```

Expected: 服务列表不含 `frontend`，`bot` 包含宿主端口 `8090`。

- [ ] **Step 2: 将 bot 管理端口改为内部暴露**

Replace the `bot` port and origin configuration with:

```yaml
    expose:
      - "8090"
    environment:
      JXH_ADMIN_ADDR: ":8090"
      JXH_ADMIN_PUBLIC_ORIGIN: ${JXH_ADMIN_PUBLIC_ORIGIN:-http://localhost:${WEB_PORT:-8080}}
```

Keep the remaining environment entries unchanged, and add:

```yaml
    networks:
      - default
      - manager
```

- [ ] **Step 3: 新增 frontend 服务和内部管理网络**

Append the service before the top-level networks block:

```yaml
  frontend:
    build:
      context: ../../jxh-manager
      dockerfile: Dockerfile
    image: jxh-manager:latest
    container_name: jxh-manager
    restart: unless-stopped
    depends_on:
      bot:
        condition: service_healthy
    ports:
      - "${WEB_PORT:-8080}:80"
    networks:
      - manager
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 5s

networks:
  manager:
    internal: true
```

- [ ] **Step 4: 验证展开后的服务、端口、依赖与网络**

Run:

```powershell
docker compose --env-file .env.example config --quiet
$compose = docker compose --env-file .env.example config --format json | ConvertFrom-Json
$compose.services.frontend.ports[0].published
$compose.services.frontend.depends_on.bot.condition
$compose.services.bot.PSObject.Properties.Name -contains 'ports'
$compose.networks.manager.internal
```

Expected: 依次输出 `8080`、`service_healthy`、`False`、`True`。

- [ ] **Step 5: 构建 Compose 中的 frontend 服务**

Run:

```powershell
docker compose --env-file .env.example build frontend
```

Expected: `jxh-manager:latest` 构建成功。

- [ ] **Step 6: 提交 Compose 改动**

```powershell
git add -- docker-compose.yaml
git commit -m "feat: 接入前后端容器网络"
```

### Task 3: 更新环境示例和部署文档

**Files:**
- Modify: `Resource/Jxh-Go/.env.example`
- Modify: `Resource/Jxh-Go/README.md`

- [ ] **Step 1: 查找旧端口和旧访问方式**

Run:

```powershell
rg -n "ADMIN_PORT|localhost:8090|管理 API 默认监听|MySQL、NapCat、quote 和 bot|完整 compose" .env.example README.md
```

Expected: 命中 `ADMIN_PORT=8090`、旧 Origin 和旧服务列表。

- [ ] **Step 2: 更新 `.env.example` 的前端入口配置**

Replace the admin port block with:

```dotenv
# Browser-facing manager port published by the frontend container.
WEB_PORT=8080

# Generate a unique value with at least 32 random bytes before starting bot.
JXH_ADMIN_SESSION_SECRET=replace-with-at-least-32-random-bytes
# Must match the exact browser origin. Use https://manager.example.com in production.
JXH_ADMIN_PUBLIC_ORIGIN=http://localhost:8080
# Set true when the manager is served through HTTPS in production.
JXH_ADMIN_COOKIE_SECURE=false
# Optional comma-separated CIDRs for explicitly trusted reverse proxies.
JXH_ADMIN_TRUSTED_PROXIES=
```

- [ ] **Step 3: 更新 README 快速开始与环境变量说明**

Make these concrete documentation changes:

- Compose 服务列表加入 `frontend`。
- 默认入口写为 `http://localhost:8080`，说明 `/api/admin/v1` 由 Nginx 同源转发且 `8090` 不发布。
- 首个超级管理员命令改为：

```bash
printf '%s\n' 'replace-with-a-strong-password' | docker compose exec -T bot \
  jxh-admin-bootstrap -config /app/config/config.yaml \
  -username admin -display-name 管理员 -password-stdin
```

- 增加本地 HTTP 与生产 HTTPS 的 `.env` 示例，并说明 `WEB_PORT` 改动时必须同步实际 Origin。
- 环境变量表加入 `WEB_PORT`、`JXH_ADMIN_PUBLIC_ORIGIN`、`JXH_ADMIN_COOKIE_SECURE`、`JXH_ADMIN_TRUSTED_PROXIES`。
- 项目结构中的 Compose 描述加入前端，新增 `../../jxh-manager/Dockerfile` 与 `../../jxh-manager/nginx.conf` 说明。

- [ ] **Step 4: 检查文档不再宣称管理 API 直接发布 8090**

Run:

```powershell
rg -n "ADMIN_PORT|localhost:8090" .env.example README.md
rg -n "WEB_PORT|localhost:8080|jxh-admin-bootstrap|frontend|JXH_ADMIN_TRUSTED_PROXIES" .env.example README.md
```

Expected: 第一条无输出；第二条命中新增部署说明。

- [ ] **Step 5: 提交部署文档**

```powershell
git add -- .env.example README.md
git commit -m "docs: 更新前后端部署说明"
```

### Task 4: 运行容器级联通验证

**Files:**
- Verify only; no source files should change.

- [ ] **Step 1: 创建隔离验证网络和模拟 bot 后端**

Run:

```powershell
$checkNetwork = 'jxh-manager-deploy-check-net'
$backendContainer = 'jxh-manager-deploy-check-bot'
$frontendContainer = 'jxh-manager-deploy-check-frontend'
$checkPort = 18080

foreach ($container in @($backendContainer, $frontendContainer)) {
  docker container inspect $container *> $null
  if ($LASTEXITCODE -eq 0) { throw "verification container already exists: $container" }
}
docker network inspect $checkNetwork *> $null
if ($LASTEXITCODE -eq 0) { throw "verification network already exists: $checkNetwork" }
if (Get-NetTCPConnection -LocalPort $checkPort -State Listen -ErrorAction SilentlyContinue) {
  throw "verification port is already in use: $checkPort"
}

$mockServer = @'
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/admin/v1/events":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()
            time.sleep(3)
            self.wfile.write(b": heartbeat\n\n")
            self.wfile.flush()
            return
        payload = json.dumps({
            "path": self.path,
            "host": self.headers.get("Host"),
            "origin": self.headers.get("Origin"),
            "cookie": self.headers.get("Cookie"),
            "csrf": self.headers.get("X-CSRF-Token"),
            "forwarded_proto": self.headers.get("X-Forwarded-Proto"),
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        return

ThreadingHTTPServer(("0.0.0.0", 8090), Handler).serve_forever()
'@

docker network create --internal $checkNetwork
docker run --detach --name $backendContainer --network $checkNetwork --network-alias bot `
  python:3.13-alpine python -u -c $mockServer
```

Expected: network and mock backend container IDs are returned; no existing resource is replaced.

- [ ] **Step 2: 启动前端镜像到空闲宿主端口**

Run:

```powershell
docker run --detach --name $frontendContainer --network $checkNetwork `
  --publish "127.0.0.1:${checkPort}:80" jxh-manager:latest

$healthy = $false
foreach ($attempt in 1..30) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$checkPort/healthz"
    if ($response.StatusCode -eq 200 -and $response.Content.Trim() -eq 'ok') {
      $healthy = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 1
  }
}
if (-not $healthy) { throw 'frontend health check did not become ready' }
```

Expected: health endpoint returns `200` with body `ok`.

- [ ] **Step 3: 验证静态路由和 API 原样代理**

Run:

```powershell
$index = (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$checkPort/").Content
$route = (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$checkPort/groups").Content
if ($index -ne $route -or $index -notmatch '<div id="app"></div>') {
  throw 'SPA history fallback did not return index.html'
}

$api = Invoke-RestMethod -Headers @{
  Origin = 'http://manager.example.test'
  Cookie = 'jxh_admin_session=session-probe'
  'X-CSRF-Token' = 'csrf-probe'
  'X-Forwarded-Proto' = 'https'
} "http://127.0.0.1:$checkPort/api/admin/v1/auth/me"

if ($api.path -ne '/api/admin/v1/auth/me' -or
    $api.origin -ne 'http://manager.example.test' -or
    $api.cookie -ne 'jxh_admin_session=session-probe' -or
    $api.csrf -ne 'csrf-probe' -or
    $api.forwarded_proto -ne 'https') {
  throw "API proxy changed path, authentication headers, or forwarded protocol: $($api | ConvertTo-Json -Compress)"
}
```

Expected: SPA root and history route match; API path, Cookie, Origin, CSRF and forwarded protocol reach the mock backend unchanged.

- [ ] **Step 4: 验证 SSE 首帧不被缓冲**

Run:

```powershell
$sse = curl.exe --silent --no-buffer --max-time 1 "http://127.0.0.1:$checkPort/api/admin/v1/events" 2>$null
if (($sse -join "`n") -notmatch ': connected') {
  throw 'SSE connected frame was buffered longer than the one-second client deadline'
}
```

Expected: curl times out before the delayed heartbeat but has already received `: connected`.

- [ ] **Step 5: 清理隔离验证容器和网络**

Run:

```powershell
foreach ($container in @($frontendContainer, $backendContainer)) {
  $actualName = docker container inspect --format '{{.Name}}' $container
  if ($LASTEXITCODE -ne 0 -or $actualName.TrimStart('/') -ne $container) {
    throw "refusing to remove unverified container: $container"
  }
}
$actualNetwork = docker network inspect --format '{{.Name}}' $checkNetwork
if ($LASTEXITCODE -ne 0 -or $actualNetwork -ne $checkNetwork) {
  throw "refusing to remove unverified network: $checkNetwork"
}

docker container rm --force $frontendContainer $backendContainer
docker network rm $checkNetwork
```

Expected: only the two explicitly verified temporary containers and the isolated network are removed; no volume is created or removed.

### Task 5: 完整回归与完成审计

**Files:**
- Verify: all task-owned files

- [ ] **Step 1: 验证前端**

Run:

```powershell
npm run test:unit -- --run
npm run type-check
npm run build
```

Expected: 全部通过。

- [ ] **Step 2: 验证后端与 Compose**

Run:

```powershell
go test ./...
go build ./...
docker compose --env-file .env.example config --quiet
docker compose --env-file .env.example build frontend
```

Expected: 全部通过。

- [ ] **Step 3: 验证改动范围和空白**

Run from repository root:

```powershell
git diff --check HEAD~3..HEAD
git status --short
```

Expected: 本任务提交无空白错误；工作树只保留用户原有的无关前端改动。

- [ ] **Step 4: 对照设计完成最终审计**

Confirm every item in `docs/superpowers/specs/2026-07-31-compose-frontend-deployment-design.md` section 9 has direct command or runtime evidence. Do not claim that real login or SSE is verified unless the corresponding runtime request succeeded.
