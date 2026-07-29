<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  FlaskConical,
  History,
  LoaderCircle,
  RefreshCw,
  Save,
  ShieldAlert,
} from '@lucide/vue'

import { AdminApiError } from '@/api/client'
import { commandsApi } from '@/api/commands'
import { groupsApi } from '@/api/groups'
import type {
  Command,
  CommandDefinitionInput,
  CommandRun,
  CommandRunResult,
  CommandTriggerPermission,
  CommandValidationResult,
  Group,
  ValidationIssue,
} from '@/api/types'
import ActionEditor from '@/components/commands/ActionEditor.vue'
import ParameterEditor from '@/components/commands/ParameterEditor.vue'
import OperationNotice from '@/components/feedback/OperationNotice.vue'
import ResourceState from '@/components/feedback/ResourceState.vue'
import AppOverlayTransition from '@/components/motion/AppOverlayTransition.vue'
import { useAuthStore } from '@/stores/auth'
import { serializeCommandDefinition, validateCommandDefinition } from './command-draft'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const commandId = computed(() => String(route.params.commandId ?? 'new'))
const isNew = computed(() => commandId.value === 'new')

function emptyDefinition(): CommandDefinitionInput {
  return {
    name: '',
    display_name: '',
    description: '',
    scope: { type: 'global', group_ids: [] },
    trigger_permission: 'group_admin',
    parameters: [],
    actions: [],
  }
}

const command = ref<Command | null>(null)
const draft = ref<CommandDefinitionInput>(emptyDefinition())
const enabled = ref(false)
const groups = ref<Group[]>([])
const loading = ref(false)
const loadError = ref<unknown>(null)
const saving = ref(false)
const validating = ref(false)
const storedValidating = ref(false)
const archiveBusy = ref(false)
const archiveOpen = ref(false)
const operationResult = ref<string | null>(null)
const operationTone = ref<'success' | 'warning' | 'danger'>('success')
const versionConflict = ref(false)
const localIssues = ref<ValidationIssue[]>([])
const validation = ref<CommandValidationResult | null>(null)
const runs = ref<CommandRun[]>([])
const runsLoading = ref(false)
const runsNextCursor = ref<string | null>(null)
const runsHasMore = ref(false)
const runResultFilter = ref<CommandRunResult | ''>('')

const sample = reactive({
  group_id: '',
  sender_qq: '',
  sender_role: 'member' as 'owner' | 'admin' | 'member',
  message: '',
})

const permissionLabels: Record<CommandTriggerPermission, string> = {
  everyone: '所有成员',
  group_admin: '当前群群主与管理员',
  maintenance_allowlist: '维护 QQ 名单',
}

const runLabels: Record<CommandRunResult, string> = {
  success: '成功',
  denied: '权限拒绝',
  parse_error: '解析失败',
  failed: '执行失败',
  partial: '部分成功',
  unknown: '结果未知',
}

const actionLabels = {
  reply_text: '回复文本',
  mention: '@成员',
  mute_member: '禁言成员',
  send_group_text: '指定群发送',
}

const canWrite = computed(() => auth.hasPermission('commands:write'))
const canConfigureCrossGroup = computed(() => auth.currentUser?.role === 'super_admin')
const hasCrossGroupAction = computed(() =>
  draft.value.actions.some((action) => action.type === 'send_group_text'),
)
const definitionLocked = computed(
  () => !canWrite.value || (!canConfigureCrossGroup.value && hasCrossGroupAction.value),
)

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

async function loadGroups(): Promise<void> {
  try {
    const result = await groupsApi.list({
      query: '',
      botRole: '',
      snapshotState: '',
      featureKey: '',
      featureEnabled: null,
      cursor: null,
      limit: 100,
    })
    groups.value = result.items
  } catch {
    groups.value = []
  }
}

async function loadCommand(): Promise<void> {
  if (isNew.value) {
    command.value = null
    draft.value = emptyDefinition()
    enabled.value = false
    return
  }
  loading.value = true
  loadError.value = null
  versionConflict.value = false
  try {
    const loaded = await commandsApi.get(commandId.value)
    command.value = loaded
    draft.value = serializeCommandDefinition(loaded)
    enabled.value = loaded.enabled
    sample.message = loaded.name
    sample.group_id = loaded.scope.group_ids[0] ?? ''
    await loadRuns(true)
  } catch (reason) {
    loadError.value = reason
  } finally {
    loading.value = false
  }
}

async function loadRuns(reset = true): Promise<void> {
  if (isNew.value) return
  runsLoading.value = true
  try {
    const result = await commandsApi.listRuns(commandId.value, {
      result: runResultFilter.value,
      from: '',
      to: '',
      cursor: reset ? null : runsNextCursor.value,
    })
    runs.value = reset ? result.items : [...runs.value, ...result.items]
    runsNextCursor.value = result.next_cursor
    runsHasMore.value = result.has_more
  } catch (reason) {
    operationTone.value = 'danger'
    operationResult.value = reason instanceof AdminApiError ? reason.message : '执行记录读取失败。'
  } finally {
    runsLoading.value = false
  }
}

function payload(): CommandDefinitionInput {
  return serializeCommandDefinition(draft.value)
}

function prepareValidation(): CommandDefinitionInput | null {
  const definition = payload()
  localIssues.value = validateCommandDefinition(definition)
  validation.value = null
  if (localIssues.value.length) {
    operationTone.value = 'warning'
    operationResult.value = `请先处理 ${localIssues.value.length} 个定义问题。`
    return null
  }
  if (!sample.group_id.trim() || !sample.sender_qq.trim() || !sample.message.trim()) {
    operationTone.value = 'warning'
    operationResult.value = '无副作用测试需要完整填写样例群、发送者 QQ 和消息。'
    return null
  }
  return definition
}

async function validateDraft(): Promise<void> {
  const definition = prepareValidation()
  if (!definition) return
  validating.value = true
  operationResult.value = null
  try {
    validation.value = await commandsApi.validateDraft({
      definition,
      sample: { ...sample },
    })
    operationTone.value = validation.value.valid ? 'success' : 'warning'
    operationResult.value = validation.value.valid
      ? '验证完成，未执行任何 NapCat 外部动作。'
      : '验证完成，请处理返回的问题。'
  } catch (reason) {
    operationTone.value = 'danger'
    operationResult.value = reason instanceof AdminApiError ? reason.message : '命令验证失败。'
  } finally {
    validating.value = false
  }
}

async function validateStored(): Promise<void> {
  if (isNew.value || !command.value) return
  if (!sample.group_id.trim() || !sample.sender_qq.trim() || !sample.message.trim()) {
    operationTone.value = 'warning'
    operationResult.value = '请完整填写样例输入。'
    return
  }
  storedValidating.value = true
  try {
    validation.value = await commandsApi.validateStored(command.value.command_id, { ...sample })
    operationTone.value = validation.value.valid ? 'success' : 'warning'
    operationResult.value = '已按服务端保存版本完成无副作用验证。'
  } catch (reason) {
    operationTone.value = 'danger'
    operationResult.value = reason instanceof AdminApiError ? reason.message : '保存版本验证失败。'
  } finally {
    storedValidating.value = false
  }
}

async function save(): Promise<void> {
  const definition = payload()
  localIssues.value = validateCommandDefinition(definition)
  if (localIssues.value.length || definitionLocked.value) {
    operationTone.value = 'warning'
    operationResult.value = definitionLocked.value
      ? '当前账号不能修改此命令定义。'
      : `请先处理 ${localIssues.value.length} 个定义问题。`
    return
  }
  saving.value = true
  operationResult.value = null
  versionConflict.value = false
  try {
    const saved = isNew.value
      ? await commandsApi.create(definition)
      : await commandsApi.update(commandId.value, { ...definition, enabled: enabled.value }, command.value!.version)
    command.value = saved
    draft.value = serializeCommandDefinition(saved)
    enabled.value = saved.enabled
    operationTone.value = 'success'
    operationResult.value = `${saved.name} 已保存，当前版本 ${saved.version}。`
    if (isNew.value) await router.replace(`/commands/${saved.command_id}`)
  } catch (reason) {
    if (reason instanceof AdminApiError && reason.status === 409) {
      versionConflict.value = true
      operationTone.value = 'warning'
      operationResult.value = '命令已被其他管理员修改。当前编辑内容仍保留，请重新读取后比较。'
    } else {
      operationTone.value = 'danger'
      operationResult.value = reason instanceof AdminApiError ? reason.message : '命令保存失败。'
    }
  } finally {
    saving.value = false
  }
}

async function archiveCommand(): Promise<void> {
  if (!command.value) return
  archiveBusy.value = true
  try {
    await commandsApi.archive(command.value.command_id, command.value.version)
    archiveOpen.value = false
    await router.push('/commands')
  } catch (reason) {
    archiveOpen.value = false
    operationTone.value = reason instanceof AdminApiError && reason.status === 409 ? 'warning' : 'danger'
    operationResult.value =
      reason instanceof AdminApiError && reason.status === 409
        ? '命令版本已经变化，请重新读取后再归档。'
        : reason instanceof AdminApiError
          ? reason.message
          : '命令归档失败。'
  } finally {
    archiveBusy.value = false
  }
}

function setScope(type: 'global' | 'groups'): void {
  draft.value.scope = { type, group_ids: type === 'global' ? [] : draft.value.scope.group_ids }
}

function toggleScopeGroup(groupId: string, checked: boolean): void {
  draft.value.scope.group_ids = checked
    ? [...new Set([...draft.value.scope.group_ids, groupId])]
    : draft.value.scope.group_ids.filter((value) => value !== groupId)
}

onMounted(async () => {
  await Promise.all([loadGroups(), loadCommand()])
})
</script>

<template>
  <main class="command-editor-page">
    <header class="page-header">
      <div class="title-block">
        <RouterLink to="/commands" class="back-link" aria-label="返回命令列表"><ArrowLeft :size="17" aria-hidden="true" /></RouterLink>
        <div>
          <h1>{{ isNew ? '新建自定义命令' : command?.name || '命令编辑器' }}</h1>
          <p>{{ isNew ? '创建后保持停用草稿，验证通过后再明确启用。' : `资源版本 ${command?.version ?? '-'}` }}</p>
        </div>
      </div>
      <div class="page-actions">
        <button data-test="validate-draft" class="secondary-action" type="button" :disabled="validating || loading" @click="validateDraft">
          <LoaderCircle v-if="validating" class="spin" :size="16" aria-hidden="true" /><FlaskConical v-else :size="16" aria-hidden="true" />
          {{ validating ? '正在验证' : '验证当前草稿' }}
        </button>
        <button v-if="canWrite" data-test="save-command" class="primary-action" type="button" :disabled="saving || loading || definitionLocked" @click="save">
          <LoaderCircle v-if="saving" class="spin" :size="16" aria-hidden="true" /><Save v-else :size="16" aria-hidden="true" />
          {{ saving ? '正在保存' : '保存命令' }}
        </button>
      </div>
    </header>

    <ResourceState v-if="loading" state="loading" title="正在读取命令定义" description="同时获取可选群和脱敏执行记录。" />
    <ResourceState v-else-if="loadError" state="error" title="命令读取失败" description="请恢复连接后重试。" @retry="loadCommand" />

    <template v-else>
      <OperationNotice :message="operationResult ?? ''" :tone="operationTone" :revision="operationResult" @close="operationResult = null" />

      <div v-if="versionConflict" class="version-conflict" role="alert">
        <div><AlertTriangle :size="18" aria-hidden="true" /><span><strong>版本冲突</strong> 当前输入未被清除。重新读取会以服务端版本替换编辑器内容。</span></div>
        <button type="button" @click="loadCommand"><RefreshCw :size="15" aria-hidden="true" />重新读取</button>
      </div>

      <div v-if="definitionLocked" class="locked-notice">
        <ShieldAlert :size="18" aria-hidden="true" />
        <span>此命令包含已批准的跨群发送动作。维护员可以查看或启停，但不能改动定义和目标群。</span>
      </div>

      <section class="editor-section">
        <header><span class="section-number mono">01</span><div><h2>基础信息</h2><p>命令名必须完整包含 `/`，并且只能使用小写 ASCII 安全字符。</p></div></header>
        <div class="basic-grid">
          <label><span>命令名</span><input v-model="draft.name" data-test="command-name" maxlength="33" :disabled="definitionLocked" placeholder="/welcome" spellcheck="false" /></label>
          <label><span>显示名称</span><input v-model="draft.display_name" data-test="command-display-name" maxlength="100" :disabled="definitionLocked" /></label>
          <label class="description-field"><span>用途说明</span><textarea v-model="draft.description" data-test="command-description" rows="2" maxlength="500" :disabled="definitionLocked" /></label>
          <label v-if="!isNew" class="enabled-field"><input v-model="enabled" type="checkbox" :disabled="!canWrite" /><span>保存时{{ enabled ? '启用' : '停用' }}此命令</span></label>
        </div>
      </section>

      <section class="editor-section">
        <header><span class="section-number mono">02</span><div><h2>参数</h2><p>按顺序声明文本、整数、时长、成员或固定选项。</p></div></header>
        <ParameterEditor v-model="draft.parameters" :readonly="definitionLocked" />
      </section>

      <section class="editor-section">
        <header><span class="section-number mono">03</span><div><h2>权限与范围</h2><p>限制谁能触发命令，以及命令在哪些群中生效。</p></div></header>
        <div class="permission-grid">
          <label><span>触发权限</span><select v-model="draft.trigger_permission" :disabled="definitionLocked"><option v-for="(label, value) in permissionLabels" :key="value" :value="value">{{ label }}</option></select></label>
          <fieldset>
            <legend>作用范围</legend>
            <label><input type="radio" name="scope" value="global" :checked="draft.scope.type === 'global'" :disabled="definitionLocked" @change="setScope('global')" />全局</label>
            <label><input type="radio" name="scope" value="groups" :checked="draft.scope.type === 'groups'" :disabled="definitionLocked" @change="setScope('groups')" />指定群</label>
          </fieldset>
        </div>
        <div v-if="draft.scope.type === 'groups'" class="group-picker">
          <label v-for="group in groups" :key="group.group_id"><input type="checkbox" :checked="draft.scope.group_ids.includes(group.group_id)" :disabled="definitionLocked" @change="toggleScopeGroup(group.group_id, ($event.target as HTMLInputElement).checked)" /><span>{{ group.name }} <small class="mono">{{ group.group_id }}</small></span></label>
          <p v-if="!groups.length">群目录暂不可用，无法选择作用群。</p>
        </div>
      </section>

      <section class="editor-section">
        <header><span class="section-number mono">04</span><div><h2>动作序列</h2><p>只允许回复、@成员、禁言和固定目标群发送四类内置动作。</p></div></header>
        <ActionEditor v-model="draft.actions" :parameters="draft.parameters" :groups="groups" :can-configure-cross-group="canConfigureCrossGroup" :readonly="definitionLocked" />
      </section>

      <section class="editor-section validation-section">
        <header><span class="section-number mono">05</span><div><h2>无副作用测试</h2><p>仅解析样例参数并渲染动作预览，不调用 NapCat，也不写执行记录。</p></div></header>
        <div class="sample-grid">
          <label><span>样例群号</span><input v-model="sample.group_id" data-test="sample-group" maxlength="64" /></label>
          <label><span>发送者 QQ</span><input v-model="sample.sender_qq" data-test="sample-sender" maxlength="32" /></label>
          <label><span>发送者角色</span><select v-model="sample.sender_role"><option value="member">成员</option><option value="admin">管理员</option><option value="owner">群主</option></select></label>
          <label class="sample-message"><span>完整样例消息</span><input v-model="sample.message" data-test="sample-message" maxlength="2000" placeholder="/welcome @24680135" /></label>
        </div>
        <div class="validation-actions">
          <button data-test="validate-draft" type="button" :disabled="validating" @click="validateDraft"><FlaskConical :size="15" aria-hidden="true" />验证当前草稿</button>
          <button v-if="!isNew" type="button" :disabled="storedValidating" @click="validateStored"><History :size="15" aria-hidden="true" />验证已保存版本</button>
        </div>
        <div v-if="localIssues.length" class="issue-list"><strong>本地定义问题</strong><ul><li v-for="item in localIssues" :key="`${item.path}-${item.code}`"><code>{{ item.path }}</code>{{ item.message }}</li></ul></div>
        <div v-if="validation" class="validation-result">
          <div v-if="validation.issues.length" class="issue-list"><strong>服务端问题</strong><ul><li v-for="item in validation.issues" :key="`${item.path}-${item.code}`"><code>{{ item.path }}</code>{{ item.message }}</li></ul></div>
          <div class="preview-grid">
            <div><strong>解析参数</strong><p v-if="!validation.parsed_arguments.length">无参数</p><dl v-else><template v-for="item in validation.parsed_arguments" :key="item.name"><dt class="mono">{{ item.name }}</dt><dd>{{ item.display_value }}</dd></template></dl></div>
            <div><strong>动作预览</strong><p v-if="!validation.rendered_actions.length">无动作</p><ol v-else><li v-for="item in validation.rendered_actions" :key="item.index"><span>{{ actionLabels[item.type] }}</span>{{ item.preview }}</li></ol></div>
          </div>
        </div>
      </section>

      <section v-if="!isNew" class="editor-section runs-section">
        <header><span class="section-number mono">06</span><div><h2>执行记录</h2><p>仅展示结果与步骤元数据，不保存自由文本参数内容。</p></div></header>
        <div class="run-toolbar"><select v-model="runResultFilter" aria-label="执行结果" @change="loadRuns(true)"><option value="">全部结果</option><option v-for="(label, value) in runLabels" :key="value" :value="value">{{ label }}</option></select></div>
        <p v-if="runsLoading && !runs.length" class="runs-empty">正在读取执行记录...</p>
        <p v-else-if="!runs.length" class="runs-empty">暂无执行记录。</p>
        <div v-else class="run-list">
          <article v-for="run in runs" :key="run.run_id">
            <div><strong :class="`run-result--${run.result}`">{{ runLabels[run.result] }}</strong><span class="mono">{{ run.run_id }}</span></div>
            <dl><div><dt>群</dt><dd class="mono">{{ run.group_id }}</dd></div><div><dt>触发者</dt><dd class="mono">{{ run.triggered_by_qq }}</dd></div><div><dt>耗时</dt><dd>{{ run.duration_ms }} ms</dd></div><div><dt>时间</dt><dd class="mono">{{ timeFormatter.format(new Date(run.occurred_at)) }}</dd></div></dl>
            <div class="step-list"><span v-for="step in run.action_steps" :key="step.index">{{ step.index + 1 }}. {{ actionLabels[step.type] }} · {{ step.result }}</span></div>
          </article>
        </div>
        <button v-if="runsHasMore" class="load-runs" type="button" :disabled="runsLoading" @click="loadRuns(false)"><RefreshCw :size="15" aria-hidden="true" />加载更多记录</button>
      </section>

      <section v-if="!isNew && canWrite" class="danger-zone">
        <div><h2>归档命令</h2><p>归档是软删除；命令名与历史记录会继续保留。</p></div>
        <button data-test="archive-command" type="button" @click="archiveOpen = true"><Archive :size="16" aria-hidden="true" />归档</button>
      </section>
    </template>

    <AppOverlayTransition :show="archiveOpen" variant="dialog">
      <div class="dialog-layer" role="presentation" @mousedown.self="archiveOpen = false">
        <section class="archive-dialog" role="dialog" aria-modal="true" aria-labelledby="archive-title">
        <header><Archive :size="19" aria-hidden="true" /><div><h2 id="archive-title">归档 {{ command?.name }}</h2><p>该命令将停止触发，历史记录不会删除。</p></div></header>
        <footer><button type="button" :disabled="archiveBusy" @click="archiveOpen = false">取消</button><button data-test="confirm-archive" class="danger-action" type="button" :disabled="archiveBusy" @click="archiveCommand">确认归档</button></footer>
        </section>
      </div>
    </AppOverlayTransition>
  </main>
</template>

<style scoped>
.command-editor-page { display: grid; gap: 14px; max-width: 1180px; margin: 0 auto; }
.page-header, .title-block, .page-actions, .back-link, .page-actions button, .operation-result, .version-conflict > div, .version-conflict button, .locked-notice, .editor-section > header, .enabled-field, .permission-grid fieldset, .permission-grid fieldset label, .group-picker label, .validation-actions, .validation-actions button, .danger-zone, .danger-zone button, .archive-dialog header, .archive-dialog footer { display: flex; align-items: center; }
.page-header { justify-content: space-between; gap: 16px; }
.title-block { gap: 10px; }
.back-link { width: 36px; height: 36px; justify-content: center; color: var(--color-text-secondary); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-control); }
.page-header h1 { font-size: 22px; line-height: 30px; }
.page-header p { color: var(--color-text-secondary); font-size: 12px; }
.page-actions { gap: 8px; }
.page-actions button { min-height: 38px; justify-content: center; gap: 7px; padding: 0 11px; font-weight: 600; border-radius: var(--radius-control); }
.secondary-action { color: var(--color-brand-action); background: var(--color-surface); border: 1px solid var(--color-brand-border); }
.primary-action { color: white; background: var(--color-brand-action); border: 1px solid var(--color-brand-action); }
.operation-result { min-height: 42px; gap: 8px; padding: 8px 11px; font-size: 12px; border-left: 3px solid currentcolor; }
.operation-result span { min-width: 0; flex: 1; }
.operation-result button { display: grid; width: 28px; height: 28px; place-items: center; padding: 0; background: transparent; border: 0; }
.operation-result--success { color: var(--color-success); background: var(--color-success-surface); }
.operation-result--warning { color: var(--color-warning); background: var(--color-warning-surface); }
.operation-result--danger { color: var(--color-danger); background: var(--color-danger-surface); }
.version-conflict { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; color: var(--color-warning); background: var(--color-warning-surface); border-left: 3px solid var(--color-warning); }
.version-conflict > div { gap: 8px; }
.version-conflict span { display: grid; font-size: 12px; }
.version-conflict button { min-height: 34px; gap: 6px; padding: 0 9px; color: var(--color-warning); white-space: nowrap; background: var(--color-surface); border: 1px solid currentcolor; border-radius: var(--radius-control); }
.locked-notice { gap: 8px; padding: 9px 11px; color: var(--color-warning); font-size: 12px; background: var(--color-warning-surface); border-left: 3px solid var(--color-warning); }
.editor-section { display: grid; gap: 14px; padding: 18px 0; border-top: 1px solid var(--color-border); }
.editor-section > header { align-items: flex-start; gap: 10px; }
.editor-section > header h2 { font-size: 16px; }
.editor-section > header p { color: var(--color-text-secondary); font-size: 12px; }
.section-number { display: grid; width: 30px; height: 24px; place-items: center; color: var(--color-brand-ink); font-size: 10px; background: var(--color-brand-surface); border-radius: var(--radius-control); }
.basic-grid { display: grid; grid-template-columns: minmax(180px, .7fr) minmax(220px, 1fr) auto; gap: 10px; align-items: end; }
label { display: grid; min-width: 0; gap: 5px; }
label > span, legend { color: var(--color-text-secondary); font-size: 11px; font-weight: 600; }
input, select, textarea { width: 100%; min-width: 0; padding: 0 9px; background: var(--color-surface); border: 1px solid var(--color-border-strong); border-radius: var(--radius-control); }
input, select { height: 38px; }
textarea { padding-block: 8px; resize: vertical; }
.description-field { grid-column: 1 / 3; }
.enabled-field { min-height: 38px; gap: 6px; }
.enabled-field input { width: 16px; height: 16px; }
.enabled-field span { color: var(--color-text-primary); white-space: nowrap; }
.permission-grid { display: grid; grid-template-columns: minmax(240px, .8fr) minmax(320px, 1.2fr); gap: 16px; }
.permission-grid fieldset { min-height: 38px; gap: 16px; padding: 0 10px; border: 1px solid var(--color-border); border-radius: var(--radius-control); }
.permission-grid legend { padding: 0 4px; }
.permission-grid fieldset label { display: flex; gap: 6px; }
.permission-grid fieldset input, .group-picker input { width: 16px; height: 16px; }
.group-picker { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
.group-picker label { min-height: 42px; grid-template-columns: 16px minmax(0, 1fr); gap: 7px; align-items: center; padding: 7px 8px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-control); }
.group-picker label span { color: var(--color-text-primary); }
.group-picker small { color: var(--color-text-secondary); font-size: 10px; }
.group-picker p, .runs-empty { color: var(--color-text-secondary); font-size: 12px; }
.sample-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
.sample-message { grid-column: 1 / -1; }
.validation-actions { gap: 7px; }
.validation-actions button { min-height: 36px; gap: 6px; padding: 0 10px; color: var(--color-brand-action); font-weight: 600; background: var(--color-surface); border: 1px solid var(--color-brand-border); border-radius: var(--radius-control); }
.issue-list { padding: 10px 12px; color: var(--color-danger); font-size: 12px; background: var(--color-danger-surface); border-left: 3px solid var(--color-danger); }
.issue-list ul { display: grid; gap: 5px; margin: 7px 0 0; padding-left: 18px; }
.issue-list code { margin-right: 7px; color: inherit; }
.validation-result, .preview-grid { display: grid; gap: 10px; }
.preview-grid { grid-template-columns: 1fr 1fr; }
.preview-grid > div { padding: 12px; background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--radius-panel); }
.preview-grid strong { font-size: 12px; }
.preview-grid p { margin-top: 7px; color: var(--color-text-secondary); font-size: 12px; }
.preview-grid dl { display: grid; grid-template-columns: auto 1fr; gap: 5px 10px; margin-top: 8px; font-size: 12px; }
.preview-grid dd { margin: 0; }
.preview-grid ol { display: grid; gap: 6px; margin: 8px 0 0; padding-left: 20px; font-size: 12px; }
.preview-grid li span { margin-right: 7px; color: var(--color-brand-ink); font-weight: 600; }
.run-toolbar { display: flex; justify-content: flex-end; }
.run-toolbar select { width: 160px; }
.run-list { display: grid; gap: 7px; }
.run-list article { display: grid; gap: 8px; padding: 11px 12px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-panel); }
.run-list article > div:first-child { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.run-list article > div:first-child span { color: var(--color-text-secondary); font-size: 10px; }
.run-result--success { color: var(--color-success); }
.run-result--failed, .run-result--partial { color: var(--color-danger); }
.run-result--unknown { color: var(--color-unknown); }
.run-list dl { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 0; }
.run-list dl div { display: grid; }
.run-list dt { color: var(--color-text-secondary); font-size: 10px; }
.run-list dd { margin: 0; font-size: 11px; }
.step-list { display: flex; flex-wrap: wrap; gap: 5px; }
.step-list span { padding: 3px 6px; color: var(--color-text-secondary); font-size: 10px; background: var(--color-surface-subtle); border-radius: 8px; }
.load-runs { justify-self: center; min-height: 34px; padding: 0 10px; color: var(--color-brand-action); background: var(--color-surface); border: 1px solid var(--color-brand-border); border-radius: var(--radius-control); }
.danger-zone { justify-content: space-between; gap: 16px; padding: 16px 0; border-top: 1px solid var(--color-danger-border, var(--color-border)); }
.danger-zone h2 { font-size: 15px; }
.danger-zone p { color: var(--color-text-secondary); font-size: 12px; }
.danger-zone button { min-height: 36px; gap: 6px; padding: 0 10px; color: var(--color-danger); background: var(--color-surface); border: 1px solid var(--color-danger); border-radius: var(--radius-control); }
.dialog-layer { position: fixed; z-index: 80; inset: 0; display: grid; place-items: center; padding: 20px; background: rgb(34 37 36 / 36%); }
.archive-dialog { width: min(440px, 100%); padding: 18px; background: var(--color-surface); border-radius: var(--radius-overlay); box-shadow: 0 16px 44px rgb(34 37 36 / 18%); }
.archive-dialog header { align-items: flex-start; gap: 10px; color: var(--color-danger); }
.archive-dialog h2 { color: var(--color-text-primary); font-size: 16px; }
.archive-dialog p { color: var(--color-text-secondary); font-size: 12px; }
.archive-dialog footer { justify-content: flex-end; gap: 8px; margin-top: 18px; }
.archive-dialog footer button { min-height: 36px; padding: 0 11px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-control); }
.archive-dialog footer .danger-action { color: white; background: var(--color-danger); border-color: var(--color-danger); }
.spin { animation: spin 700ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 760px) {
  .page-header { align-items: stretch; flex-direction: column; }
  .page-actions { display: grid; grid-template-columns: 1fr 1fr; }
  .basic-grid, .permission-grid, .sample-grid, .preview-grid { grid-template-columns: 1fr; }
  .description-field, .sample-message { grid-column: auto; }
  .group-picker { grid-template-columns: 1fr 1fr; }
  .run-list dl { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 480px) {
  .page-actions { grid-template-columns: 1fr; }
  .group-picker { grid-template-columns: 1fr; }
  .version-conflict, .danger-zone { align-items: stretch; flex-direction: column; }
}
</style>
