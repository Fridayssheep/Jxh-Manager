import type {
  CommandAction,
  CommandDefinitionInput,
  CommandParameter,
  ValidationIssue,
} from '@/api/types'

const COMMAND_NAME_PATTERN = /^\/[a-z][a-z0-9_-]{0,31}$/
const PARAMETER_NAME_PATTERN = /^[a-z][a-z0-9_]{0,31}$/
const FIXED_OPTION_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/

function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message }
}

function serializeParameter(parameter: CommandParameter): CommandParameter {
  const common = {
    name: parameter.name.trim(),
    display_name: parameter.display_name.trim(),
    required: parameter.required,
  }
  switch (parameter.type) {
    case 'text':
      return { ...common, type: 'text', min_length: parameter.min_length, max_length: parameter.max_length }
    case 'integer':
      return { ...common, type: 'integer', minimum: parameter.minimum, maximum: parameter.maximum }
    case 'duration':
      return {
        ...common,
        type: 'duration',
        minimum_seconds: parameter.minimum_seconds,
        maximum_seconds: parameter.maximum_seconds,
      }
    case 'member':
      return { ...common, type: 'member', allow_triggerer: parameter.allow_triggerer }
    case 'fixed_option':
      return {
        ...common,
        type: 'fixed_option',
        options: parameter.options.map((option) => ({
          value: option.value.trim(),
          label: option.label.trim(),
        })),
      }
  }
}

function serializeAction(action: CommandAction): CommandAction {
  switch (action.type) {
    case 'reply_text':
      return { type: 'reply_text', template: action.template.trim() }
    case 'mention':
      return {
        type: 'mention',
        target: action.target,
        member_parameter: action.target === 'parameter' ? action.member_parameter : null,
      }
    case 'mute_member':
      return {
        type: 'mute_member',
        member_parameter: action.member_parameter.trim(),
        duration:
          action.duration.type === 'FixedDurationSource'
            ? { type: 'FixedDurationSource', seconds: action.duration.seconds }
            : {
                type: 'ParameterDurationSource',
                parameter: action.duration.parameter.trim(),
              },
      }
    case 'send_group_text':
      return {
        type: 'send_group_text',
        target_group_ids: [...new Set(action.target_group_ids.map((groupId) => groupId.trim()))]
          .filter(Boolean),
        template: action.template.trim(),
      }
  }
}

export function validateCommandDefinition(
  definition: CommandDefinitionInput,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!COMMAND_NAME_PATTERN.test(definition.name)) {
    issues.push(issue('name', 'invalid_command_name', '命令名必须以 / 开头，且仅包含小写 ASCII 字母、数字、下划线和连字符。'))
  }
  if (!definition.display_name.trim()) {
    issues.push(issue('display_name', 'display_name_required', '请填写命令显示名称。'))
  }
  if (!definition.description.trim()) {
    issues.push(issue('description', 'description_required', '请填写命令用途说明。'))
  }
  if (definition.scope.type === 'groups' && !definition.scope.group_ids.length) {
    issues.push(issue('scope.group_ids', 'scope_groups_required', '指定群范围至少需要选择一个群。'))
  }
  if (definition.scope.type === 'global' && definition.scope.group_ids.length) {
    issues.push(issue('scope.group_ids', 'global_scope_groups_forbidden', '全局命令不能携带群范围。'))
  }

  const parameterNames = new Set<string>()
  const parameterTypes = new Map<string, CommandParameter['type']>()
  definition.parameters.forEach((parameter, index) => {
    const path = `parameters.${index}`
    if (!PARAMETER_NAME_PATTERN.test(parameter.name)) {
      issues.push(issue(`${path}.name`, 'invalid_parameter_name', '参数名仅允许小写 ASCII 字母、数字和下划线。'))
    }
    if (parameterNames.has(parameter.name)) {
      issues.push(issue(`${path}.name`, 'duplicate_parameter_name', '参数名不能重复。'))
    }
    parameterNames.add(parameter.name)
    parameterTypes.set(parameter.name, parameter.type)
    if (!parameter.display_name.trim()) {
      issues.push(issue(`${path}.display_name`, 'parameter_display_name_required', '请填写参数显示名称。'))
    }
    if (parameter.type === 'text' && parameter.min_length > parameter.max_length) {
      issues.push(issue(path, 'invalid_text_range', '文本最小长度不能大于最大长度。'))
    }
    if (parameter.type === 'integer' && parameter.minimum > parameter.maximum) {
      issues.push(issue(path, 'invalid_integer_range', '整数下限不能大于上限。'))
    }
    if (
      parameter.type === 'duration' &&
      parameter.minimum_seconds > parameter.maximum_seconds
    ) {
      issues.push(issue(path, 'invalid_duration_range', '时长下限不能大于上限。'))
    }
    if (parameter.type === 'fixed_option') {
      const optionValues = new Set<string>()
      if (!parameter.options.length) {
        issues.push(issue(`${path}.options`, 'fixed_options_required', '固定选项参数至少需要一个选项。'))
      }
      parameter.options.forEach((option, optionIndex) => {
        if (!FIXED_OPTION_PATTERN.test(option.value) || optionValues.has(option.value)) {
          issues.push(issue(`${path}.options.${optionIndex}.value`, 'invalid_fixed_option', '选项值必须安全且不能重复。'))
        }
        optionValues.add(option.value)
      })
    }
  })

  if (!definition.actions.length) {
    issues.push(issue('actions', 'actions_required', '至少需要配置一个受控动作。'))
  }
  let hasRiskyAction = false
  definition.actions.forEach((action, index) => {
    const path = `actions.${index}`
    if (action.type === 'reply_text' && !action.template.trim()) {
      issues.push(issue(`${path}.template`, 'template_required', '回复文本不能为空。'))
    }
    if (action.type === 'mention' && action.target === 'parameter') {
      if (!action.member_parameter || parameterTypes.get(action.member_parameter) !== 'member') {
        issues.push(issue(`${path}.member_parameter`, 'member_parameter_required', '请选择成员参数。'))
      }
    }
    if (action.type === 'mute_member') {
      hasRiskyAction = true
      if (parameterTypes.get(action.member_parameter) !== 'member') {
        issues.push(issue(`${path}.member_parameter`, 'member_parameter_required', '禁言动作必须引用成员参数。'))
      }
      if (
        action.duration.type === 'ParameterDurationSource' &&
        parameterTypes.get(action.duration.parameter) !== 'duration'
      ) {
        issues.push(issue(`${path}.duration.parameter`, 'duration_parameter_required', '请选择时长参数。'))
      }
      if (action.duration.type === 'FixedDurationSource' && action.duration.seconds <= 0) {
        issues.push(issue(`${path}.duration.seconds`, 'positive_duration_required', '固定禁言时长必须大于 0。'))
      }
    }
    if (action.type === 'send_group_text') {
      hasRiskyAction = true
      if (!action.target_group_ids.length) {
        issues.push(issue(`${path}.target_group_ids`, 'fixed_targets_required', '跨群发送必须在保存时固定选择目标群。'))
      }
      if (!action.template.trim()) {
        issues.push(issue(`${path}.template`, 'template_required', '跨群消息文本不能为空。'))
      }
    }
  })
  if (hasRiskyAction && definition.trigger_permission === 'everyone') {
    issues.push(issue('trigger_permission', 'unsafe_trigger_permission', '禁言和跨群发送不能允许所有成员触发。'))
  }
  return issues
}

export function serializeCommandDefinition(
  definition: CommandDefinitionInput,
): CommandDefinitionInput {
  return {
    name: definition.name.trim(),
    display_name: definition.display_name.trim(),
    description: definition.description.trim(),
    scope: {
      type: definition.scope.type,
      group_ids:
        definition.scope.type === 'global'
          ? []
          : [...new Set(definition.scope.group_ids.map((groupId) => groupId.trim()))].filter(Boolean),
    },
    trigger_permission: definition.trigger_permission,
    parameters: definition.parameters.map(serializeParameter),
    actions: definition.actions.map(serializeAction),
  }
}
