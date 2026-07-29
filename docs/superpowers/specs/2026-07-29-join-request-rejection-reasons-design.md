# 入群申请拒绝消息与 AI 自动拒绝设计

- 日期：2026-07-29
- 状态：已确认，待实施
- 范围：`jxh-manager`、`Resource/Jxh-Go`、管理 API 与数据库迁移

## 目标

NapCat 的 `set_group_add_request` 在拒绝申请时支持 `reason`。管理端需要完整暴露这一能力：

1. AI 自动拒绝使用一条全局可配置的拒绝消息。
2. 人工单条和批量拒绝在每次操作时单独填写拒绝消息。
3. 拒绝消息同时发送给申请人并写入决策记录，便于审计。

## 现状

- NapCat 网关已经支持最多 500 个 Unicode 字符的拒绝原因。
- 人工决策 API 已有可选 `reason`，服务也会传给 NapCat，但前端错误地提示“不会发送给申请人”。
- `group_join_policies.auto_reject` 已存在，但 OpenAPI、领域校验和数据库约束均将其固定为 `false`。
- 自动决策 Worker 只处理 AI 字段有效的自动批准，不处理自动拒绝。
- 全局设置已有版本控制、审计和内存运行时，适合承载全局拒绝消息。

## 产品语义

### 全局 AI 拒绝消息

`GET /settings` 返回顶层 `join_requests.auto_reject_reason`，默认值为：

> 申请信息不完整或格式不符合要求，请完善后重新申请。

该消息必须在去除首尾空白后包含 1–500 个 Unicode 字符。全局设置页提供文本框编辑，并与其他全局设置使用同一个 `version`、`If-Match` 和保存操作。

### 群级自动处理策略

`JoinRequestPolicy.enabled` 继续表示“自动批准有效申请”，`auto_reject` 改为独立的“自动拒绝无效申请”开关。两者可以分别开启，也可以同时开启。

群策略不保存拒绝消息。所有开启自动拒绝的群在执行时读取全局设置运行时中的最新消息。

### 自动拒绝条件

Worker 只处理 `sub_type=add`、状态为 `pending` 且 AI 解析状态为 `succeeded` 的申请：

- AI 字段有效且 `enabled=true`：自动批准。
- AI 字段无效且 `auto_reject=true`：自动拒绝并发送全局拒绝消息。
- AI 解析失败、跳过、未完成或缺少结构化字段：保持人工处理。

自动拒绝复用现有决策预留、幂等键、处理租约、结果完成、事件和遥测链路。决策来源为 `automatic`，记录字段快照、规则版本和实际发送的拒绝消息。

### 人工拒绝

单条和批量拒绝都要求填写拒绝消息。前端去除首尾空白后提交 1–500 个字符，后端再次执行同样的条件校验和规范化，不能依赖前端校验。

拒绝弹窗显示“拒绝消息”，明确该文本将通过 NapCat 发送给申请人。批准操作的原因仍为选填审计备注。

批量拒绝对本批申请发送同一条拒绝消息。

## API 契约

### 全局设置

新增模型：

```yaml
JoinRequestGlobalSettings:
  type: object
  additionalProperties: false
  required: [auto_reject_reason]
  properties:
    auto_reject_reason:
      type: string
      minLength: 1
      maxLength: 500
```

`GlobalSettings` 增加必填字段 `join_requests`。`GlobalSettingsPatch` 允许提交 `features`、`join_requests` 中至少一项；现有客户端只提交 `features` 仍然有效。

### 群策略

`JoinRequestPolicy.auto_reject` 从常量 `false` 改为普通布尔值。`JoinRequestPolicyPatch` 支持可选 `enabled` 和 `auto_reject`，至少提交一项。

### 决策

`JoinDecisionRequest` 和 `BulkJoinDecisionRequest` 增加条件约束：`action=reject` 时 `reason` 必填且规范化后长度为 1–500；`action=approve` 时保持选填。

## 后端边界

全局设置领域增加 `JoinRequestSettings` 及运行时只读方法 `AutoRejectReason()`。自动决策服务通过一个窄接口读取该值，避免依赖管理 API 或存储实现。

自动候选查询改为选择 `policy.enabled=true OR policy.auto_reject=true` 的策略。Worker 根据 AI 字段有效性决定动作，并在自动拒绝时把全局消息同时写入 `Decision.Reason` 和 NapCat 网关参数。

人工拒绝原因在服务入口规范化；持久化和外部调用必须使用同一个规范化值，避免审计内容与实际发送内容不同。

## 数据库迁移

新增迁移 `010_enable_automatic_join_rejection.sql`：

- 删除 `chk_group_join_policies_auto_reject` 约束。
- 保留所有现有记录的 `auto_reject=false`，迁移本身不会启用任何自动拒绝。
- 更新全新数据库初始化定义，使 `auto_reject` 为普通布尔值。

全局拒绝消息存储在现有全局 `feature_settings.settings_json` 中。旧文档缺少字段时由解码器补入默认值；下一次全局设置保存会写入完整字段，因此无需新增列或破坏已有 JSON。

## 错误处理

- 人工拒绝缺少原因：返回 400 `invalid_request`，不预留决策、不调用 NapCat。
- 自动拒绝原因运行时状态无效：设置加载或更新失败，旧的有效运行时快照继续使用。
- 策略版本冲突：沿用 409 `resource_version_conflict`。
- NapCat 明确失败：决策记录失败并按现有状态机恢复人工处理。
- NapCat 超时、断连或传输结果不明：标记 `unknown`，不盲目重试。

## 前端设计

全局设置页在功能默认值之后增加无嵌套卡片的“入群申请”区域，使用一个最多 500 字的文本框编辑全局 AI 拒绝消息，并纳入现有脏状态、冲突比较、权限禁用和统一保存。

申请详情的策略区更名为“自动处理策略”，显示两个独立开关。无策略的历史群继续隐藏该区域。

决策弹窗根据动作切换语义：

- 批准：处理原因，选填，仅作审计备注。
- 拒绝：拒绝消息，必填，发送给申请人；空值时确认按钮不可用并显示字段错误。

## 测试与验收

- 数据库：009 到 010 迁移、重复迁移保护、全新初始化和已有策略数据保持关闭。
- 设置：默认消息、全局读写、版本冲突、JSON 向后读取、运行时原子更新和审计快照。
- 策略：读写 `auto_reject`、权限、版本冲突和候选查询。
- Worker：有效字段自动批准、无效字段自动拒绝、解析失败不处理、全局消息进入决策与网关。
- 人工决策：单条和批量拒绝缺少原因均失败；规范化原因进入数据库和 NapCat。
- 前端：全局消息编辑、策略双开关、拒绝必填、批准选填、单条与批量请求载荷。
- 契约：重新生成 TypeScript schema 并执行 OpenAPI 覆盖测试。
- 联调：迁移当前归档数据库，启动前后端；NapCat 登录可用时验证申请人收到拒绝消息，未登录时至少验证请求载荷、错误状态和数据库记录。

## 非目标

- 不为不同群配置不同的自动拒绝消息。
- 不对 AI 解析失败、跳过或未完成的申请自动拒绝。
- 不增加自动重试未知结果。
- 不修改 NapCat 协议或 SDK。
