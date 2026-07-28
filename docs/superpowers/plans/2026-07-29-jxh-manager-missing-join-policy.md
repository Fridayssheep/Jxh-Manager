# Jxh Manager 缺失入群策略降级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当历史入群申请所属群没有持久化策略时，审批页继续展示申请详情和决策历史，同时隐藏策略控制。

**Architecture:** 在 `JoinRequestsView.vue` 的消费边界增加一个局部可选策略加载函数。它只把 `AdminApiError` 的 `404 + resource_not_found` 转换为 `null`，其余异常继续交给现有详情错误处理；API 客户端、后端契约和数据库均不修改。

**Tech Stack:** Vue 3、TypeScript、Vitest、Vue Test Utils

---

### Task 1: 将缺失策略与申请详情解耦

**Files:**
- Modify: `jxh-manager/src/views/join-requests/JoinRequestsView.vue:171-194`
- Test: `jxh-manager/src/views/join-requests/__tests__/JoinRequestsView.spec.ts`

- [ ] **Step 1: 写入失败的回归测试**

在测试文件中导入 `AdminApiError`：

```ts
import { AdminApiError } from '@/api/client'
```

在 `JoinRequestsView` 测试组中增加用例：

```ts
it('keeps request details visible when the group policy does not exist', async () => {
  vi.mocked(joinRequestsApi.getPolicy).mockRejectedValue(
    new AdminApiError(404, {
      code: 'resource_not_found',
      message: 'join request does not exist',
      request_id: 'request-policy-404',
      fields: {},
      retryable: false,
    }),
  )
  const wrapper = await mountView()
  await flushPromises()

  await wrapper.get('[data-test=request-row-flag-10001]').trigger('click')
  await flushPromises()

  expect(joinRequestsApi.get).toHaveBeenCalledWith('flag-10001')
  expect(joinRequestsApi.listDecisions).toHaveBeenCalledWith('flag-10001')
  expect(wrapper.text()).toContain('计算机科学与技术')
  expect(wrapper.text()).toContain('决策时间线')
  expect(wrapper.text()).not.toContain('join request does not exist')
  expect(wrapper.text()).not.toContain('自动批准策略')
  expect(wrapper.find('[data-test=approve-request]').exists()).toBe(true)
})
```

- [ ] **Step 2: 运行定向测试并确认按预期失败**

Run: `npm run test:unit -- --run src/views/join-requests/__tests__/JoinRequestsView.spec.ts`

Expected: 新用例失败，页面不包含 `计算机科学与技术`，并显示 `join request does not exist`；既有用例保持通过。

- [ ] **Step 3: 实现最小的可选策略读取**

在 `openRequest` 前增加局部函数：

```ts
async function loadOptionalPolicy(groupId: string): Promise<JoinRequestPolicy | null> {
  try {
    return await joinRequestsApi.getPolicy(groupId)
  } catch (reason) {
    if (
      reason instanceof AdminApiError &&
      reason.status === 404 &&
      reason.code === 'resource_not_found'
    ) {
      return null
    }
    throw reason
  }
}
```

将 `openRequest` 中第三个并行请求替换为：

```ts
loadOptionalPolicy(item.group.group_id),
```

- [ ] **Step 4: 运行定向测试并确认通过**

Run: `npm run test:unit -- --run src/views/join-requests/__tests__/JoinRequestsView.spec.ts`

Expected: `JoinRequestsView.spec.ts` 全部通过，且无错误或警告。

- [ ] **Step 5: 执行完整前端验证**

Run: `npm run test:unit -- --run`

Expected: 全量 Vitest 测试通过。

Run: `npm run type-check`

Expected: `vue-tsc --build` 退出码为 0。

Run: `npm run build`

Expected: 类型检查和 Vite 生产构建退出码均为 0。

- [ ] **Step 6: 在迁移数据库上执行浏览器回归**

使用当前运行的前端 `http://127.0.0.1:5173` 和管理 API `http://127.0.0.1:8090` 登录，打开旧群申请。确认详情和决策请求返回 200、策略请求返回 404，并验证页面仍显示 AI 提取信息、决策时间线和审批按钮，不显示策略开关或资源不存在错误。

- [ ] **Step 7: 提交修复**

```bash
git add -- jxh-manager/src/views/join-requests/JoinRequestsView.vue jxh-manager/src/views/join-requests/__tests__/JoinRequestsView.spec.ts
git commit -m "fix: 兼容缺少策略的入群申请"
```
