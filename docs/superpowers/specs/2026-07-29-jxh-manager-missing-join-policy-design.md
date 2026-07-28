# Jxh Manager 旧群缺少入群策略时的详情降级设计

- 日期：2026-07-29
- 状态：已确认方案，待实现
- 范围：`jxh-manager` 入群审批页

## 问题

历史 `group_join_requests` 可以引用尚未同步进 `managed_groups` 的群。此时：

- `GET /join-requests/{request_id}` 返回 200；
- `GET /join-requests/{request_id}/decisions` 返回 200；
- `GET /groups/{group_id}/join-request-policy` 按当前后端实现返回 404 `not_found`。

审批页当前用一个 `Promise.all` 同时读取三项数据。策略 404 会让整个读取失败，导致已经成功返回的申请详情和决策历史被清空，并误显示“join request does not exist”。

## 方案比较

### 方案 A：前端将策略 404 视为缺省状态（采用）

审批页仅对策略请求的 `404 + not_found` 返回 `null`，继续展示申请详情和决策历史。现有详情组件已经支持 `policy: null`，此时不显示策略开关。

优点是保持后端和 OpenAPI 的真实资源语义，不伪造可修改版本，也不修改历史数据。缺点是浏览器开发者工具仍会记录一次预期的 404。

### 方案 B：后端返回临时默认策略（不采用）

读取不存在的策略时返回 200 和默认值。该对象没有真实持久化版本，后续 PATCH 的版本语义不成立，容易让前端展示无法保存的开关。

### 方案 C：迁移时回填群和策略（不采用）

从历史申请推导 `managed_groups` 和策略。历史申请不包含可靠的群名称、Bot 角色和同步状态，回填会制造不可信群快照。

## 详细设计

在 `JoinRequestsView.vue` 内增加局部的可选策略读取函数：

1. 正常返回时保留 `JoinRequestPolicy`。
2. 仅当错误是 `AdminApiError`，且状态为 404、错误码为 `not_found` 时返回 `null`。OpenAPI 的通用 404 响应使用 `resource_not_found` 作为示例，但 `Error.code` 没有枚举约束；当前后端统一使用 `not_found`，本次按真实响应实现且不修改 API 契约。
3. 403、409、5xx、网络错误及未知错误继续抛出，由现有详情失败提示处理。
4. `openRequest` 继续并行读取申请、决策历史和可选策略。
5. 策略为 `null` 时详情与决策操作保持可用，策略区和策略修改入口保持隐藏。

不修改 API 客户端的 `getPolicy` 返回类型，因为资源不存在仍是该接口对其他调用者有意义的错误；降级规则只属于审批详情这个消费场景。

## 测试与验收

在 `JoinRequestsView.spec.ts` 增加回归测试：

- 列表正常返回申请；
- 申请详情和决策历史正常返回；
- 策略读取拒绝并携带 `404 + not_found`；
- 点击申请后仍显示详情中的 AI 提取字段；
- 页面不显示“join request does not exist”错误；
- 策略开关不出现。

实现后运行该单元测试、前端全量单元测试、类型检查和构建，并用当前迁移数据库重新执行真实浏览器联调。浏览器验收要求三个请求仍分别返回 200、200、404，但页面显示申请详情且没有错误提示。
