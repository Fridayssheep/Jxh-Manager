# Jxh-Manager

Jxh QQ bot 管理面板及其后端管理能力的设计与实现仓库。

## 设计文档

- [管理面板总体设计](docs/superpowers/specs/2026-07-27-jxh-manager-design.md)：产品目标、页面范围、角色模型与分阶段交付。
- [后端改造与重构设计](docs/superpowers/specs/2026-07-27-jxh-manager-backend-refactor-design.md)：对 `Resource/Jxh-Go` 的现状审阅、阻塞项、目标架构、数据模型与实施顺序。
- [前后端 API 设计](docs/superpowers/specs/2026-07-27-jxh-manager-api-design.md)：鉴权、权限、并发、幂等、分页、错误与接口目录。
- [OpenAPI 3.1 契约](docs/api/jxh-manager-openapi.yaml)：前后端接口的机器可读真源。

Bot 后端位于 [`Resource/Jxh-Go`](Resource/Jxh-Go)。当前 57 条管理端接口均已实现；实际契约与后续变更仍以 OpenAPI operation 的 `x-status` 为准。
