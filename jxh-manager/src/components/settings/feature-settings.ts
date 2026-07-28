import type {
  FeatureKey,
  FeatureSettings,
  GlobalSettingsPatch,
  GroupSettings,
  GroupSettingsPatch,
} from '@/api/types'

export type FeatureMode = 'inherit' | 'enabled' | 'disabled'

export type FeatureDraftItem = {
  mode: FeatureMode
  messageTemplate: string
  messageInherited: boolean
}

export type FeatureSettingsDraft = Record<FeatureKey, FeatureDraftItem>

export const FEATURE_KEYS: FeatureKey[] = [
  'keyword_reply',
  'ai_qa',
  'quote',
  'link_cleaner',
  'welcome',
  'custom_commands',
]

export const FEATURE_META: Record<FeatureKey, { label: string; description: string }> = {
  keyword_reply: { label: '关键词回复', description: '根据知识库中的精确关键词回复消息。' },
  ai_qa: { label: 'AI 问答', description: '允许群成员使用 /ai 检索知识库。' },
  quote: { label: '引用图', description: '允许使用 /q 生成消息引用图。' },
  link_cleaner: { label: '链接净化', description: '自动处理受支持平台的分享链接。' },
  welcome: { label: '欢迎语', description: '新成员入群后发送受控模板消息。' },
  custom_commands: { label: '自定义命令', description: '执行管理端创建的受控命令。' },
}

const ALLOWED_TEMPLATE_VARIABLES = new Set(['member_qq', 'member_name', 'group_name'])

export function cloneGlobalDraft(settings: FeatureSettings): FeatureSettingsDraft {
  return Object.fromEntries(
    FEATURE_KEYS.map((key) => [
      key,
      {
        mode: settings[key].enabled ? 'enabled' : 'disabled',
        messageTemplate: key === 'welcome' ? settings.welcome.message_template : '',
        messageInherited: false,
      },
    ]),
  ) as FeatureSettingsDraft
}

export function cloneGroupDraft(settings: GroupSettings): FeatureSettingsDraft {
  return Object.fromEntries(
    FEATURE_KEYS.map((key) => {
      const override = settings.overrides[key]
      const enabled = override?.enabled
      const welcomeOverride = key === 'welcome' ? settings.overrides.welcome : undefined
      return [
        key,
        {
          mode: enabled === undefined ? 'inherit' : enabled ? 'enabled' : 'disabled',
          messageTemplate:
            key === 'welcome'
              ? (welcomeOverride?.message_template ?? settings.effective.welcome.message_template)
              : '',
          messageInherited: key === 'welcome' && welcomeOverride?.message_template === undefined,
        },
      ]
    }),
  ) as FeatureSettingsDraft
}

export function toGlobalSettingsPatch(draft: FeatureSettingsDraft): GlobalSettingsPatch {
  return {
    features: {
      keyword_reply: { enabled: draft.keyword_reply.mode === 'enabled' },
      ai_qa: { enabled: draft.ai_qa.mode === 'enabled' },
      quote: { enabled: draft.quote.mode === 'enabled' },
      link_cleaner: { enabled: draft.link_cleaner.mode === 'enabled' },
      welcome: {
        enabled: draft.welcome.mode === 'enabled',
        message_template: draft.welcome.messageTemplate,
      },
      custom_commands: { enabled: draft.custom_commands.mode === 'enabled' },
    },
  }
}

export function toGroupSettingsPatch(draft: FeatureSettingsDraft): GroupSettingsPatch {
  const features: GroupSettingsPatch['features'] = {}
  FEATURE_KEYS.forEach((key) => {
    const item = draft[key]
    if (key === 'welcome') {
      features.welcome =
        item.mode === 'inherit' && item.messageInherited
          ? null
          : {
              enabled: item.mode === 'inherit' ? null : item.mode === 'enabled',
              message_template: item.messageInherited ? null : item.messageTemplate,
            }
      return
    }
    features[key] = item.mode === 'inherit' ? null : { enabled: item.mode === 'enabled' }
  })
  return { features }
}

export function findUnknownTemplateVariables(template: string): string[] {
  const variables = [...template.matchAll(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g)].map(
    (match) => match[1] ?? '',
  )
  return [...new Set(variables.filter((variable) => !ALLOWED_TEMPLATE_VARIABLES.has(variable)))]
}
