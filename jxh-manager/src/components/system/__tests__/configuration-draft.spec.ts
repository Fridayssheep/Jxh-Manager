import { describe, expect, it } from 'vitest'

import type { components } from '@/api/schema'
import {
  cloneSystemConfigurationDraft,
  isSystemConfigurationDraftDirty,
  toSystemConfigurationPatch,
  validateSystemConfigurationDraft,
} from '../configuration-draft'

type SystemConfiguration = components['schemas']['SystemConfiguration']

function makeConfiguration(): SystemConfiguration {
  return {
    wps: {
      share_url: { configured: true, source: 'file' },
      sid: { configured: true, source: 'environment' },
      sheet: '知识库',
      timeout_sec: 45,
    },
    ai: {
      provider: 'openai',
      base_url: 'https://api.openai.test/v1',
      api_key: { configured: true, source: 'file' },
      model: 'gpt-4.1-mini',
      timeout_sec: 30,
      max_question_chars: 1200,
    },
    quote: {
      base_url: 'https://quote.example.test',
      timeout_sec: 20,
    },
    time: {
      app_timezone: 'Asia/Shanghai',
      scheduler_timezone: 'Asia/Shanghai',
    },
    retention: {
      trigger_log_retention_days: 180,
    },
    environment_overrides: ['ai.model', 'wps.sid'],
    version: 7,
    applied_version: 6,
    restart_required: true,
    restart_supported: true,
  }
}

describe('configuration draft helpers', () => {
  it('clones a structured draft without exposing secret values', () => {
    const draft = cloneSystemConfigurationDraft(makeConfiguration())

    expect(draft.wps.share_url.operation).toBe('keep')
    expect(draft.wps.sid.operation).toBe('keep')
    expect(draft.ai.api_key.operation).toBe('keep')
    expect(draft.ai.model).toBe('gpt-4.1-mini')
    expect(JSON.stringify(draft)).not.toContain('configured')
  })

  it('serializes only editable changes and ignores environment-managed fields', () => {
    const configuration = makeConfiguration()
    const draft = cloneSystemConfigurationDraft(configuration)

    draft.wps.share_url = { operation: 'replace', value: 'https://example.test/updated.xlsx' }
    draft.wps.sid = { operation: 'replace', value: 'ignored-by-env' }
    draft.ai.api_key = { operation: 'clear' }
    draft.ai.model = 'tampered-model'
    draft.quote.timeout_sec = '30'
    draft.retention.trigger_log_retention_days = '365'

    expect(toSystemConfigurationPatch(configuration, draft)).toEqual({
      wps: {
        share_url: { operation: 'replace', value: 'https://example.test/updated.xlsx' },
      },
      ai: {
        api_key: { operation: 'clear' },
      },
      quote: {
        timeout_sec: 30,
      },
      retention: {
        trigger_log_retention_days: 365,
      },
    })
  })

  it('validates ranges, URLs, timezones and enums', () => {
    const configuration = makeConfiguration()
    const draft = cloneSystemConfigurationDraft(configuration)

    draft.wps.sheet = '   '
    draft.wps.timeout_sec = '0'
    draft.wps.share_url = { operation: 'replace', value: 'ftp://example.test/invalid' }
    draft.ai.provider = 'unknown' as never
    draft.ai.base_url = 'https://user:pass@example.test/v1'
    draft.ai.timeout_sec = '601'
    draft.ai.max_question_chars = '10001'
    draft.quote.base_url = 'https://user:pass@example.test'
    draft.quote.timeout_sec = '121'
    draft.time.app_timezone = 'Mars/Olympus'
    draft.retention.trigger_log_retention_days = '-1'

    const issues = validateSystemConfigurationDraft(configuration, draft)

    expect(issues['wps.sheet']).toBeDefined()
    expect(issues['wps.timeout_sec']).toBeDefined()
    expect(issues['wps.share_url']).toBeDefined()
    expect(issues['ai.provider']).toBeDefined()
    expect(issues['ai.base_url']).toBeDefined()
    expect(issues['ai.timeout_sec']).toBeDefined()
    expect(issues['ai.max_question_chars']).toBeDefined()
    expect(issues['quote.base_url']).toBeDefined()
    expect(issues['quote.timeout_sec']).toBeDefined()
    expect(issues['app.timezone']).toBeDefined()
    expect(issues['database.trigger_log_retention_days']).toBeDefined()
  })

  it('tracks dirty state for editable values only', () => {
    const configuration = makeConfiguration()
    const draft = cloneSystemConfigurationDraft(configuration)

    expect(isSystemConfigurationDraftDirty(configuration, draft)).toBe(false)

    draft.quote.base_url = 'https://quote.example.test/updated'
    expect(isSystemConfigurationDraftDirty(configuration, draft)).toBe(true)

    draft.quote.base_url = configuration.quote.base_url
    draft.ai.model = 'tampered-model'
    expect(isSystemConfigurationDraftDirty(configuration, draft)).toBe(false)
  })
})
