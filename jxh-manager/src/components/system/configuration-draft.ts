import type {
  AISettings,
  SecretUpdate,
  SystemConfiguration,
  SystemConfigurationPatch,
} from '@/api/types'

export type SecretDraft =
  | { operation: 'keep' }
  | { operation: 'replace'; value: string }
  | { operation: 'clear' }

export type SystemConfigurationDraft = {
  wps: {
    share_url: SecretDraft
    sid: SecretDraft
    sheet: string
    timeout_sec: string | number
  }
  ai: {
    provider: AISettings['provider']
    base_url: string
    api_key: SecretDraft
    model: string
    timeout_sec: string | number
    max_question_chars: string | number
  }
  quote: {
    base_url: string
    timeout_sec: string | number
  }
  time: {
    app_timezone: string
    scheduler_timezone: string
  }
  retention: {
    trigger_log_retention_days: string | number
  }
}

export type ConfigurationValidationIssues = Record<string, string>

export const CONFIGURATION_FIELD_PATHS = {
  wps: {
    share_url: 'wps.share_url',
    sid: 'wps.sid',
    sheet: 'wps.sheet',
    timeout_sec: 'wps.timeout_sec',
  },
  ai: {
    provider: 'ai.provider',
    base_url: 'ai.base_url',
    api_key: 'ai.api_key',
    model: 'ai.model',
    timeout_sec: 'ai.timeout_sec',
    max_question_chars: 'ai.max_question_chars',
  },
  quote: {
    base_url: 'quote.base_url',
    timeout_sec: 'quote.timeout_sec',
  },
  time: {
    app_timezone: 'app.timezone',
    scheduler_timezone: 'scheduler.timezone',
  },
  retention: {
    trigger_log_retention_days: 'database.trigger_log_retention_days',
  },
} as const

export type ConfigurationFieldPath =
  | typeof CONFIGURATION_FIELD_PATHS.wps[keyof typeof CONFIGURATION_FIELD_PATHS.wps]
  | typeof CONFIGURATION_FIELD_PATHS.ai[keyof typeof CONFIGURATION_FIELD_PATHS.ai]
  | typeof CONFIGURATION_FIELD_PATHS.quote[keyof typeof CONFIGURATION_FIELD_PATHS.quote]
  | typeof CONFIGURATION_FIELD_PATHS.time[keyof typeof CONFIGURATION_FIELD_PATHS.time]
  | typeof CONFIGURATION_FIELD_PATHS.retention[keyof typeof CONFIGURATION_FIELD_PATHS.retention]

function keepSecret(): SecretDraft {
  return { operation: 'keep' }
}

function normalizeText(value: string | number): string {
  return String(value).trim()
}

function charLength(value: string): number {
  return [...value].length
}

function parseInteger(value: string | number): number | null {
  const normalized = normalizeText(value)
  if (!/^-?\d+$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function isHTTPURL(value: string, allowUserinfo: boolean): boolean {
  try {
    const url = new URL(value)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.host) return false
    if (!allowUserinfo && (url.username || url.password)) return false
    return true
  } catch {
    return false
  }
}

function isTimezone(value: string): boolean {
  if (!value || charLength(value) > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

function setIssue(issues: ConfigurationValidationIssues, path: string, code: string): void {
  issues[path] = code
}

function hasKeys(value: object): boolean {
  return Object.keys(value).length > 0
}

export function cloneSystemConfigurationDraft(
  configuration: SystemConfiguration,
): SystemConfigurationDraft {
  return {
    wps: {
      share_url: keepSecret(),
      sid: keepSecret(),
      sheet: configuration.wps.sheet,
      timeout_sec: String(configuration.wps.timeout_sec),
    },
    ai: {
      provider: configuration.ai.provider,
      base_url: configuration.ai.base_url,
      api_key: keepSecret(),
      model: configuration.ai.model,
      timeout_sec: String(configuration.ai.timeout_sec),
      max_question_chars: String(configuration.ai.max_question_chars),
    },
    quote: {
      base_url: configuration.quote.base_url,
      timeout_sec: String(configuration.quote.timeout_sec),
    },
    time: {
      app_timezone: configuration.time.app_timezone,
      scheduler_timezone: configuration.time.scheduler_timezone,
    },
    retention: {
      trigger_log_retention_days: String(configuration.retention.trigger_log_retention_days),
    },
  }
}

export function isSystemConfigurationFieldManaged(
  configuration: SystemConfiguration,
  path: ConfigurationFieldPath,
): boolean {
  if (configuration.environment_overrides.includes(path)) return true

  switch (path) {
    case CONFIGURATION_FIELD_PATHS.wps.share_url:
      return configuration.wps.share_url.source === 'environment'
    case CONFIGURATION_FIELD_PATHS.wps.sid:
      return configuration.wps.sid.source === 'environment'
    case CONFIGURATION_FIELD_PATHS.ai.api_key:
      return configuration.ai.api_key.source === 'environment'
    default:
      return false
  }
}

function isEditable(configuration: SystemConfiguration, path: ConfigurationFieldPath): boolean {
  return !isSystemConfigurationFieldManaged(configuration, path)
}

function validateRange(
  issues: ConfigurationValidationIssues,
  path: ConfigurationFieldPath,
  value: string | number,
  minimum: number,
  maximum: number,
): void {
  const parsed = parseInteger(value)
  if (parsed === null) {
    setIssue(issues, path, 'invalid_number')
    return
  }
  if (parsed < minimum || parsed > maximum) {
    setIssue(issues, path, 'out_of_range')
  }
}

function validateSecret(
  issues: ConfigurationValidationIssues,
  path: ConfigurationFieldPath,
  draft: SecretDraft,
  maximum: number,
  validateURL = false,
): void {
  if (draft.operation === 'keep') return

  if (draft.operation === 'clear') {
    if ('value' in draft && draft.value) {
      setIssue(issues, path, 'value_not_allowed')
    }
    return
  }

  const value = normalizeText(draft.value)
  if (!value || charLength(value) > maximum) {
    setIssue(issues, path, 'invalid_length')
    return
  }
  if (validateURL && !isHTTPURL(value, true)) {
    setIssue(issues, path, 'invalid_url')
  }
}

function validateOptionalHTTPURL(
  issues: ConfigurationValidationIssues,
  path: ConfigurationFieldPath,
  value: string,
): void {
  const normalized = normalizeText(value)
  if (charLength(normalized) > 2048 || (normalized && !isHTTPURL(normalized, false))) {
    setIssue(issues, path, 'invalid_url')
  }
}

export function validateSystemConfigurationDraft(
  configuration: SystemConfiguration,
  draft: SystemConfigurationDraft,
): ConfigurationValidationIssues {
  const issues: ConfigurationValidationIssues = {}
  const paths = CONFIGURATION_FIELD_PATHS

  if (isEditable(configuration, paths.wps.share_url)) {
    validateSecret(issues, paths.wps.share_url, draft.wps.share_url, 2048, true)
  }
  if (isEditable(configuration, paths.wps.sid)) {
    validateSecret(issues, paths.wps.sid, draft.wps.sid, 4096)
  }
  if (isEditable(configuration, paths.wps.sheet)) {
    const sheet = normalizeText(draft.wps.sheet)
    if (!sheet || charLength(sheet) > 128) setIssue(issues, paths.wps.sheet, 'invalid_length')
  }
  if (isEditable(configuration, paths.wps.timeout_sec)) {
    validateRange(issues, paths.wps.timeout_sec, draft.wps.timeout_sec, 1, 600)
  }

  if (isEditable(configuration, paths.ai.provider)
    && draft.ai.provider !== 'openai' && draft.ai.provider !== 'ark') {
    setIssue(issues, paths.ai.provider, 'invalid_enum')
  }
  if (isEditable(configuration, paths.ai.base_url)) {
    validateOptionalHTTPURL(issues, paths.ai.base_url, draft.ai.base_url)
  }
  if (isEditable(configuration, paths.ai.api_key)) {
    validateSecret(issues, paths.ai.api_key, draft.ai.api_key, 8192)
  }
  if (isEditable(configuration, paths.ai.model) && charLength(normalizeText(draft.ai.model)) > 255) {
    setIssue(issues, paths.ai.model, 'invalid_length')
  }
  if (isEditable(configuration, paths.ai.timeout_sec)) {
    validateRange(issues, paths.ai.timeout_sec, draft.ai.timeout_sec, 1, 600)
  }
  if (isEditable(configuration, paths.ai.max_question_chars)) {
    validateRange(issues, paths.ai.max_question_chars, draft.ai.max_question_chars, 1, 10000)
  }

  if (isEditable(configuration, paths.quote.base_url)) {
    validateOptionalHTTPURL(issues, paths.quote.base_url, draft.quote.base_url)
  }
  if (isEditable(configuration, paths.quote.timeout_sec)) {
    validateRange(issues, paths.quote.timeout_sec, draft.quote.timeout_sec, 1, 120)
  }

  if (isEditable(configuration, paths.time.app_timezone)
    && !isTimezone(normalizeText(draft.time.app_timezone))) {
    setIssue(issues, paths.time.app_timezone, 'invalid_timezone')
  }
  if (isEditable(configuration, paths.time.scheduler_timezone)
    && !isTimezone(normalizeText(draft.time.scheduler_timezone))) {
    setIssue(issues, paths.time.scheduler_timezone, 'invalid_timezone')
  }

  if (isEditable(configuration, paths.retention.trigger_log_retention_days)) {
    validateRange(
      issues,
      paths.retention.trigger_log_retention_days,
      draft.retention.trigger_log_retention_days,
      0,
      3650,
    )
  }

  return issues
}

function textChanged(
  configuration: SystemConfiguration,
  path: ConfigurationFieldPath,
  draftValue: string | number,
  originalValue: string,
): boolean {
  return isEditable(configuration, path) && normalizeText(draftValue) !== originalValue
}

function integerChanged(
  configuration: SystemConfiguration,
  path: ConfigurationFieldPath,
  draftValue: string | number,
  originalValue: number,
): boolean {
  if (!isEditable(configuration, path)) return false
  const parsed = parseInteger(draftValue)
  return parsed === null || parsed !== originalValue
}

function secretChanged(
  configuration: SystemConfiguration,
  path: ConfigurationFieldPath,
  draft: SecretDraft,
): boolean {
  return isEditable(configuration, path) && draft.operation !== 'keep'
}

export function isSystemConfigurationDraftDirty(
  configuration: SystemConfiguration,
  draft: SystemConfigurationDraft,
): boolean {
  const paths = CONFIGURATION_FIELD_PATHS

  return (
    secretChanged(configuration, paths.wps.share_url, draft.wps.share_url) ||
    secretChanged(configuration, paths.wps.sid, draft.wps.sid) ||
    textChanged(configuration, paths.wps.sheet, draft.wps.sheet, configuration.wps.sheet) ||
    integerChanged(configuration, paths.wps.timeout_sec, draft.wps.timeout_sec, configuration.wps.timeout_sec) ||
    textChanged(configuration, paths.ai.provider, draft.ai.provider, configuration.ai.provider) ||
    textChanged(configuration, paths.ai.base_url, draft.ai.base_url, configuration.ai.base_url) ||
    secretChanged(configuration, paths.ai.api_key, draft.ai.api_key) ||
    textChanged(configuration, paths.ai.model, draft.ai.model, configuration.ai.model) ||
    integerChanged(configuration, paths.ai.timeout_sec, draft.ai.timeout_sec, configuration.ai.timeout_sec) ||
    integerChanged(configuration, paths.ai.max_question_chars, draft.ai.max_question_chars, configuration.ai.max_question_chars) ||
    textChanged(configuration, paths.quote.base_url, draft.quote.base_url, configuration.quote.base_url) ||
    integerChanged(configuration, paths.quote.timeout_sec, draft.quote.timeout_sec, configuration.quote.timeout_sec) ||
    textChanged(configuration, paths.time.app_timezone, draft.time.app_timezone, configuration.time.app_timezone) ||
    textChanged(configuration, paths.time.scheduler_timezone, draft.time.scheduler_timezone, configuration.time.scheduler_timezone) ||
    integerChanged(
      configuration,
      paths.retention.trigger_log_retention_days,
      draft.retention.trigger_log_retention_days,
      configuration.retention.trigger_log_retention_days,
    )
  )
}

function serializeSecret(
  configuration: SystemConfiguration,
  path: ConfigurationFieldPath,
  draft: SecretDraft,
): SecretUpdate | undefined {
  if (!isEditable(configuration, path) || draft.operation === 'keep') return undefined
  if (draft.operation === 'clear') return { operation: 'clear' }
  return { operation: 'replace', value: normalizeText(draft.value) }
}

function changedTextValue(
  configuration: SystemConfiguration,
  path: ConfigurationFieldPath,
  draftValue: string,
  originalValue: string,
): string | undefined {
  const normalized = normalizeText(draftValue)
  return isEditable(configuration, path) && normalized !== originalValue ? normalized : undefined
}

function changedIntegerValue(
  configuration: SystemConfiguration,
  path: ConfigurationFieldPath,
  draftValue: string | number,
  originalValue: number,
): number | undefined {
  if (!isEditable(configuration, path)) return undefined
  const parsed = parseInteger(draftValue)
  return parsed !== null && parsed !== originalValue ? parsed : undefined
}

export function toSystemConfigurationPatch(
  configuration: SystemConfiguration,
  draft: SystemConfigurationDraft,
): SystemConfigurationPatch {
  const paths = CONFIGURATION_FIELD_PATHS
  const patch: SystemConfigurationPatch = {}
  const wps: NonNullable<SystemConfigurationPatch['wps']> = {}
  const ai: NonNullable<SystemConfigurationPatch['ai']> = {}
  const quote: NonNullable<SystemConfigurationPatch['quote']> = {}
  const time: NonNullable<SystemConfigurationPatch['time']> = {}
  const retention: NonNullable<SystemConfigurationPatch['retention']> = {}

  const wpsShareURL = serializeSecret(configuration, paths.wps.share_url, draft.wps.share_url)
  if (wpsShareURL) wps.share_url = wpsShareURL
  const wpsSID = serializeSecret(configuration, paths.wps.sid, draft.wps.sid)
  if (wpsSID) wps.sid = wpsSID
  const wpsSheet = changedTextValue(configuration, paths.wps.sheet, draft.wps.sheet, configuration.wps.sheet)
  if (wpsSheet !== undefined) wps.sheet = wpsSheet
  const wpsTimeout = changedIntegerValue(configuration, paths.wps.timeout_sec, draft.wps.timeout_sec, configuration.wps.timeout_sec)
  if (wpsTimeout !== undefined) wps.timeout_sec = wpsTimeout
  if (hasKeys(wps)) patch.wps = wps

  const aiProvider = changedTextValue(configuration, paths.ai.provider, draft.ai.provider, configuration.ai.provider)
  if (aiProvider !== undefined) ai.provider = aiProvider as AISettings['provider']
  const aiBaseURL = changedTextValue(configuration, paths.ai.base_url, draft.ai.base_url, configuration.ai.base_url)
  if (aiBaseURL !== undefined) ai.base_url = aiBaseURL
  const aiAPIKey = serializeSecret(configuration, paths.ai.api_key, draft.ai.api_key)
  if (aiAPIKey) ai.api_key = aiAPIKey
  const aiModel = changedTextValue(configuration, paths.ai.model, draft.ai.model, configuration.ai.model)
  if (aiModel !== undefined) ai.model = aiModel
  const aiTimeout = changedIntegerValue(configuration, paths.ai.timeout_sec, draft.ai.timeout_sec, configuration.ai.timeout_sec)
  if (aiTimeout !== undefined) ai.timeout_sec = aiTimeout
  const aiMaxQuestionChars = changedIntegerValue(
    configuration,
    paths.ai.max_question_chars,
    draft.ai.max_question_chars,
    configuration.ai.max_question_chars,
  )
  if (aiMaxQuestionChars !== undefined) ai.max_question_chars = aiMaxQuestionChars
  if (hasKeys(ai)) patch.ai = ai

  const quoteBaseURL = changedTextValue(configuration, paths.quote.base_url, draft.quote.base_url, configuration.quote.base_url)
  if (quoteBaseURL !== undefined) quote.base_url = quoteBaseURL
  const quoteTimeout = changedIntegerValue(configuration, paths.quote.timeout_sec, draft.quote.timeout_sec, configuration.quote.timeout_sec)
  if (quoteTimeout !== undefined) quote.timeout_sec = quoteTimeout
  if (hasKeys(quote)) patch.quote = quote

  const appTimezone = changedTextValue(configuration, paths.time.app_timezone, draft.time.app_timezone, configuration.time.app_timezone)
  if (appTimezone !== undefined) time.app_timezone = appTimezone
  const schedulerTimezone = changedTextValue(
    configuration,
    paths.time.scheduler_timezone,
    draft.time.scheduler_timezone,
    configuration.time.scheduler_timezone,
  )
  if (schedulerTimezone !== undefined) time.scheduler_timezone = schedulerTimezone
  if (hasKeys(time)) patch.time = time

  const retentionDays = changedIntegerValue(
    configuration,
    paths.retention.trigger_log_retention_days,
    draft.retention.trigger_log_retention_days,
    configuration.retention.trigger_log_retention_days,
  )
  if (retentionDays !== undefined) retention.trigger_log_retention_days = retentionDays
  if (hasKeys(retention)) patch.retention = retention

  return patch
}
