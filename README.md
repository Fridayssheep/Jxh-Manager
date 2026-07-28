# Jxh-Manager

Jxh QQ bot 管理面板及其后端管理能力的设计与实现仓库。

## 设计文档

- [管理面板总体设计](docs/superpowers/specs/2026-07-27-jxh-manager-design.md)：产品目标、页面范围、角色模型与分阶段交付。
- [UI 视觉与交互规范](docs/superpowers/specs/2026-07-28-jxh-manager-ui-design.md)：
  珊瑚红事务台、设计令牌、布局、组件状态与可访问性。
- [后端改造与重构设计](docs/superpowers/specs/2026-07-27-jxh-manager-backend-refactor-design.md)：对 `Resource/Jxh-Go` 的现状审阅、阻塞项、目标架构、数据模型与实施顺序。
- [前后端 API 设计](docs/superpowers/specs/2026-07-27-jxh-manager-api-design.md)：鉴权、权限、并发、幂等、分页、错误与接口目录。
- [OpenAPI 3.1 契约](docs/api/jxh-manager-openapi.yaml)：前后端接口的机器可读真源。

## 仓库结构

| 路径 | 职责 |
| --- | --- |
| `docs/api/` | 前后端共享的 OpenAPI 契约 |
| `docs/superpowers/specs/` | 产品、API 和后端架构设计 |
| `docs/superpowers/plans/` | 实施计划、覆盖矩阵与验收证据 |
| `Resource/Jxh-Go/` | 使用独立 Git 历史维护的 Bot 与管理后端 |

Bot 后端的 `internal/` 已按 management、automation、groups、knowledge、messaging、bot、ai 和 platform 八个功能边界组织，具体职责见 [`Resource/Jxh-Go/internal/README.md`](Resource/Jxh-Go/internal/README.md)。当前 57 条管理端接口均已实现；实际契约与后续变更仍以 OpenAPI operation 的 `x-status` 为准。
