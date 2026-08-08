<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  Database,
  FileUp,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
} from '@lucide/vue'

import { AdminApiError } from '@/api/client'
import { joinRequestsApi } from '@/api/join-requests'
import type {
  AdmissionRosterStatus,
  MajorCodeEvidenceIndex,
  MajorCodeEvidenceSample,
} from '@/api/types'
import OperationNotice from '@/components/feedback/OperationNotice.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const evidence = ref<MajorCodeEvidenceIndex | null>(null)
const roster = ref<AdmissionRosterStatus | null>(null)
const samples = ref<MajorCodeEvidenceSample[]>([])
const selectedKey = ref<{ year: string; code: string } | null>(null)
const loading = ref(false)
const samplesLoading = ref(false)
const busy = ref(false)
const samplePage = ref(1)
const sampleHasMore = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const notice = reactive({ message: '', tone: 'success' as 'success' | 'warning' | 'danger' | 'info' })
const draftMajors = reactive<Record<number, string>>({})

const canWrite = computed(() => auth.hasPermission('join_policies:write'))
const selectedTitle = computed(() =>
  selectedKey.value ? `${selectedKey.value.year} · ${selectedKey.value.code}` : '全部证据样本',
)

function failureMessage(reason: unknown, fallback: string): string {
  if (!(reason instanceof AdminApiError)) return fallback
  const details = Object.values(reason.fields).flat().filter(Boolean)
  return details.length ? `${reason.message}：${details.join('；')}` : reason.message
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const [nextEvidence, nextRoster] = await Promise.all([
      joinRequestsApi.listEvidence(),
      joinRequestsApi.getAdmissionRosterStatus(),
    ])
    evidence.value = nextEvidence
    roster.value = nextRoster
  } catch (reason) {
    notice.tone = 'danger'
    notice.message = failureMessage(reason, '审批规则读取失败。')
  } finally {
    loading.value = false
  }
}

async function loadSamples(page = 1): Promise<void> {
  samplesLoading.value = true
  try {
    const result = await joinRequestsApi.listEvidenceSamples({
      enrollmentYear: selectedKey.value?.year,
      majorCode: selectedKey.value?.code,
      page,
      limit: 50,
    })
    samples.value = result.items
    samplePage.value = page
    sampleHasMore.value = result.has_more
    for (const sample of result.items) draftMajors[sample.sample_id] = sample.major
  } catch (reason) {
    notice.tone = 'danger'
    notice.message = failureMessage(reason, '证据样本读取失败。')
  } finally {
    samplesLoading.value = false
  }
}

async function selectEvidence(year: string, code: string): Promise<void> {
  selectedKey.value = { year, code }
  await loadSamples()
}

async function saveSample(sample: MajorCodeEvidenceSample, active = sample.active): Promise<void> {
  if (!canWrite.value || busy.value) return
  busy.value = true
  try {
    const updated = await joinRequestsApi.updateEvidenceSample(
      sample.sample_id,
      { major: draftMajors[sample.sample_id]?.trim() || sample.major, active },
      sample.version,
    )
    const index = samples.value.findIndex((item) => item.sample_id === sample.sample_id)
    if (index >= 0) samples.value.splice(index, 1, updated)
    draftMajors[updated.sample_id] = updated.major
    notice.tone = 'success'
    notice.message = '证据样本已更新，新的证据版本将在后续判断中生效。'
    await load()
  } catch (reason) {
    notice.tone = reason instanceof AdminApiError && reason.status === 409 ? 'warning' : 'danger'
    notice.message = failureMessage(reason, '证据样本更新失败。')
  } finally {
    busy.value = false
  }
}

async function rebuild(): Promise<void> {
  if (!canWrite.value || busy.value) return
  busy.value = true
  try {
    const result = await joinRequestsApi.rebuildEvidence()
    notice.tone = 'success'
    notice.message = `证据重建完成，当前有 ${result.sample_count} 条有效样本。`
    await Promise.all([load(), loadSamples(samplePage.value)])
  } catch (reason) {
    notice.tone = 'danger'
    notice.message = failureMessage(reason, '证据重建失败。')
  } finally {
    busy.value = false
  }
}

async function importRoster(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file || !canWrite.value || busy.value) return
  busy.value = true
  try {
    roster.value = await joinRequestsApi.importAdmissionRoster(file)
    notice.tone = 'success'
    notice.message = `录取名单已启用，共 ${roster.value.row_count} 条记录。`
  } catch (reason) {
    notice.tone = 'danger'
    notice.message = failureMessage(reason, '录取名单导入失败，请检查文件表头和学号格式。')
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  await load()
  await loadSamples()
})
</script>

<template>
  <main class="approval-rules-page">
    <header class="page-header">
      <div>
        <h1>审批规则与证据</h1>
        <p>自动审批 v2 · 仅处理规则激活后的新申请</p>
      </div>
      <button class="icon-command" type="button" title="刷新" :disabled="loading" @click="load">
        <RefreshCw :size="17" :class="{ spin: loading }" aria-hidden="true" />
        <span>刷新</span>
      </button>
    </header>

    <OperationNotice
      v-if="notice.message"
      :message="notice.message"
      :tone="notice.tone"
      @close="notice.message = ''"
    />

    <section class="rule-band" aria-labelledby="rule-title">
      <div class="section-heading">
        <ShieldCheck :size="18" aria-hidden="true" />
        <div><h2 id="rule-title">固定校验</h2><p>格式与年份由后端确定性判断，不交给模型推测。</p></div>
        <span :class="['state', evidence?.rule_state.status ?? 'building']">{{ evidence?.rule_state.status === 'ready' ? '已就绪' : '准备中' }}</span>
      </div>
      <dl v-if="evidence" class="rule-metrics">
        <div><dt>学号长度</dt><dd>{{ evidence.rule.student_id_length }} 位数字</dd></div>
        <div><dt>入学年份</dt><dd>第 {{ evidence.rule.enrollment_year_offset + 1 }}–{{ evidence.rule.enrollment_year_offset + evidence.rule.enrollment_year_length }} 位 · {{ evidence.rule.current_year }}</dd></div>
        <div><dt>专业代码</dt><dd>第 {{ evidence.rule.major_code_offset + 1 }}–{{ evidence.rule.major_code_offset + evidence.rule.major_code_length }} 位</dd></div>
        <div><dt>最低证据</dt><dd>{{ evidence.rule.minimum_samples }} 条有效样本</dd></div>
      </dl>
    </section>

    <section class="workspace-grid">
      <div class="workspace-section evidence-section">
        <div class="section-heading">
          <Database :size="18" aria-hidden="true" />
          <div><h2>专业代码证据</h2><p>按入学年份和代码跨群聚合，模型只接收下列计数。</p></div>
          <button v-if="canWrite" class="secondary-command" type="button" :disabled="busy" @click="rebuild">
            <RotateCcw :size="15" aria-hidden="true" />重建
          </button>
        </div>
        <div class="table-scroll">
          <table>
            <thead><tr><th>入学年份</th><th>代码</th><th>有效样本</th><th>专业分布</th></tr></thead>
            <tbody>
              <tr
                v-for="item in evidence?.items ?? []"
                :key="`${item.enrollment_year}-${item.major_code}`"
                :class="{ selected: selectedKey?.year === item.enrollment_year && selectedKey?.code === item.major_code }"
                tabindex="0"
                @click="selectEvidence(item.enrollment_year, item.major_code)"
                @keydown.enter="selectEvidence(item.enrollment_year, item.major_code)"
              >
                <td>{{ item.enrollment_year }}</td><td><code>{{ item.major_code }}</code></td><td>{{ item.total_samples }}</td>
                <td><span v-for="major in item.major_counts" :key="major.major" class="distribution">{{ major.major }} {{ major.count }}</span></td>
              </tr>
              <tr v-if="!loading && !(evidence?.items.length)"><td colspan="4" class="empty">尚无有效批准样本</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="workspace-section roster-section">
        <div class="section-heading">
          <FileUp :size="18" aria-hidden="true" />
          <div><h2>录取名单</h2><p>导入后以完整学号精确检索；未配置时继续使用历史证据。</p></div>
        </div>
        <dl class="roster-status">
          <div><dt>状态</dt><dd>{{ roster?.configured ? '已启用' : '未配置' }}</dd></div>
          <div><dt>文件</dt><dd>{{ roster?.file_name ?? '—' }}</dd></div>
          <div><dt>记录数</dt><dd>{{ roster?.row_count ?? 0 }}</dd></div>
          <div><dt>版本</dt><dd>{{ roster?.dataset_version ?? '—' }}</dd></div>
        </dl>
        <input ref="fileInput" class="sr-only" type="file" accept=".csv,.xlsx" @change="importRoster" />
        <button v-if="canWrite" class="primary-command" type="button" :disabled="busy" @click="fileInput?.click()">
          <FileUp :size="16" aria-hidden="true" />导入 CSV / XLSX
        </button>
      </div>
    </section>

    <section class="workspace-section samples-section">
      <div class="section-heading">
        <Database :size="18" aria-hidden="true" />
        <div><h2>{{ selectedTitle }}</h2><p>可更正专业名称或停用异常样本，来源年份和代码不可修改。</p></div>
        <button v-if="selectedKey" class="secondary-command" type="button" @click="selectedKey = null; loadSamples()">查看全部</button>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>年份 / 代码</th><th>专业</th><th>批准来源</th><th>来源群</th><th>状态</th><th aria-label="操作"></th></tr></thead>
          <tbody>
            <tr v-for="sample in samples" :key="sample.sample_id">
              <td>{{ sample.enrollment_year }} / <code>{{ sample.major_code }}</code></td>
              <td><input v-model="draftMajors[sample.sample_id]" :disabled="!canWrite || busy" maxlength="128" :aria-label="`样本 ${sample.sample_id} 专业`" /></td>
              <td>{{ sample.approval_source === 'manual' ? '人工批准' : '自动批准' }}</td>
              <td>{{ sample.source_group_id }}</td>
              <td><label class="sample-toggle"><input type="checkbox" :checked="sample.active" :disabled="!canWrite || busy" @change="saveSample(sample, ($event.target as HTMLInputElement).checked)" /><span>{{ sample.active ? '有效' : '已停用' }}</span></label></td>
              <td><button v-if="canWrite" class="save-command" type="button" title="保存专业名称" :disabled="busy || !draftMajors[sample.sample_id]?.trim()" @click="saveSample(sample)"><Save :size="15" aria-hidden="true" /></button></td>
            </tr>
            <tr v-if="!samplesLoading && !samples.length"><td colspan="6" class="empty">当前筛选没有证据样本</td></tr>
          </tbody>
        </table>
      </div>
      <footer class="sample-pager">
        <button type="button" :disabled="samplesLoading || samplePage <= 1" @click="loadSamples(samplePage - 1)">上一页</button>
        <span>第 {{ samplePage }} 页</span>
        <button type="button" :disabled="samplesLoading || !sampleHasMore" @click="loadSamples(samplePage + 1)">下一页</button>
      </footer>
    </section>
  </main>
</template>

<style scoped>
.approval-rules-page { display: grid; width: 100%; max-width: 100%; gap: 14px; min-width: 0; overflow: hidden; }
.page-header, .section-heading { display: flex; align-items: center; gap: 10px; }
.page-header { justify-content: space-between; }
h1, h2, p { margin: 0; }
h1 { font-size: 22px; letter-spacing: 0; }
h2 { font-size: 14px; letter-spacing: 0; }
.page-header p, .section-heading p { margin-top: 2px; color: var(--color-text-secondary); font-size: 11px; }
.rule-band, .workspace-section { min-width: 0; max-width: 100%; padding: 15px; overflow: hidden; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-panel); }
.section-heading > div { min-width: 0; flex: 1; }
.section-heading > svg { flex: 0 0 auto; color: var(--color-brand-action); }
.state { padding: 3px 7px; font-size: 10px; border-radius: 4px; }
.state.ready { color: var(--color-success); background: var(--color-success-surface); }
.state.building { color: var(--color-warning); background: var(--color-warning-surface); }
.rule-metrics, .roster-status { display: grid; gap: 1px; margin: 14px 0 0; background: var(--color-border); }
.rule-metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.rule-metrics div, .roster-status div { min-width: 0; padding: 10px; background: var(--color-surface); }
dt { color: var(--color-text-secondary); font-size: 10px; }
dd { margin: 4px 0 0; overflow-wrap: anywhere; font-size: 12px; font-weight: 600; }
.workspace-grid { display: grid; min-width: 0; max-width: 100%; grid-template-columns: minmax(0, 1.7fr) minmax(280px, .8fr); gap: 14px; }
.roster-status { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.primary-command, .secondary-command, .icon-command { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 34px; padding: 0 10px; border-radius: var(--radius-control); }
.primary-command { width: 100%; margin-top: 13px; color: white; background: var(--color-brand-action); border: 1px solid var(--color-brand-action); }
.secondary-command, .icon-command { color: var(--color-text-primary); background: var(--color-surface); border: 1px solid var(--color-border-strong); }
.table-scroll { width: 100%; max-width: 100%; min-width: 0; margin-top: 12px; overflow-x: auto; }
table { width: 100%; min-width: 640px; border-collapse: collapse; font-size: 11px; }
th { color: var(--color-text-secondary); font-size: 10px; font-weight: 600; text-align: left; background: var(--color-surface-subtle); }
th, td { padding: 9px 10px; border-bottom: 1px solid var(--color-border); }
.evidence-section tbody tr { cursor: pointer; }
tbody tr:hover, tbody tr.selected { background: var(--color-brand-surface); }
code { font-family: var(--font-mono); font-size: 11px; }
.distribution { display: inline-block; margin: 2px 6px 2px 0; padding: 2px 5px; color: var(--color-text-secondary); background: var(--color-surface-subtle); border-radius: 3px; }
.empty { padding: 24px; color: var(--color-text-secondary); text-align: center; }
.samples-section input[type='text'], .samples-section td > input { width: min(220px, 100%); min-width: 120px; height: 30px; padding: 0 8px; color: var(--color-text-primary); background: var(--color-surface); border: 1px solid var(--color-border-strong); border-radius: var(--radius-control); }
.sample-toggle { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.save-command { display: grid; width: 30px; height: 30px; place-items: center; padding: 0; color: var(--color-brand-action); background: transparent; border: 1px solid var(--color-border); border-radius: var(--radius-control); }
.sample-pager { display: flex; align-items: center; justify-content: flex-end; gap: 9px; margin-top: 10px; font-size: 11px; }
.sample-pager button { min-height: 30px; padding: 0 9px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-control); }
.spin { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 900px) { .workspace-grid { grid-template-columns: 1fr; } .rule-metrics { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 520px) { .page-header { align-items: flex-start; } .page-header p { max-width: 210px; } .icon-command span { display: none; } .rule-metrics { grid-template-columns: 1fr; } .rule-band, .workspace-section { padding: 12px; } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
