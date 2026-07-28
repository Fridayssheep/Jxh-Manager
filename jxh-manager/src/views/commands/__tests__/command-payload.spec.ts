import { describe, expect, it } from 'vitest'

import type { CommandDefinitionInput } from '@/api/types'
import { serializeCommandDefinition, validateCommandDefinition } from '../command-draft'

function makeDefinition(
  overrides: Partial<CommandDefinitionInput> = {},
): CommandDefinitionInput {
  return {
    name: '/welcome',
    display_name: '欢迎成员',
    description: '按顺序执行受控欢迎动作',
    scope: { type: 'groups', group_ids: ['10001'] },
    trigger_permission: 'group_admin',
    parameters: [
      {
        name: 'member',
        display_name: '成员',
        type: 'member',
        required: true,
        allow_triggerer: false,
      },
      {
        name: 'period',
        display_name: '禁言时长',
        type: 'duration',
        required: true,
        minimum_seconds: 60,
        maximum_seconds: 3600,
      },
    ],
    actions: [
      { type: 'reply_text', template: '正在处理 {{member}}' },
      { type: 'mention', target: 'parameter', member_parameter: 'member' },
      {
        type: 'mute_member',
        member_parameter: 'member',
        duration: { type: 'ParameterDurationSource', parameter: 'period' },
      },
      {
        type: 'send_group_text',
        target_group_ids: ['10001', '10002'],
        template: '成员处理完成',
      },
    ],
    ...overrides,
  }
}

describe('command definition payload', () => {
  it('rejects non-lowercase ASCII command and parameter names', () => {
    const issues = validateCommandDefinition(
      makeDefinition({
        name: '/欢迎',
        parameters: [
          {
            name: 'Member-Id',
            display_name: '成员',
            type: 'member',
            required: true,
            allow_triggerer: false,
          },
        ],
        actions: [{ type: 'reply_text', template: '收到' }],
      }),
    )

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'name', code: 'invalid_command_name' }),
        expect.objectContaining({ path: 'parameters.0.name', code: 'invalid_parameter_name' }),
      ]),
    )
  })

  it('serializes all controlled action variants with fixed cross-group targets', () => {
    const definition = makeDefinition()

    expect(serializeCommandDefinition(definition)).toEqual(definition)
    expect(serializeCommandDefinition(definition).actions).toEqual([
      { type: 'reply_text', template: '正在处理 {{member}}' },
      { type: 'mention', target: 'parameter', member_parameter: 'member' },
      {
        type: 'mute_member',
        member_parameter: 'member',
        duration: { type: 'ParameterDurationSource', parameter: 'period' },
      },
      {
        type: 'send_group_text',
        target_group_ids: ['10001', '10002'],
        template: '成员处理完成',
      },
    ])
  })

  it('requires fixed send targets and elevated trigger permissions for risky actions', () => {
    const issues = validateCommandDefinition(
      makeDefinition({
        trigger_permission: 'everyone',
        actions: [
          {
            type: 'send_group_text',
            target_group_ids: [],
            template: '测试',
          },
        ],
      }),
    )

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'actions.0.target_group_ids', code: 'fixed_targets_required' }),
        expect.objectContaining({ path: 'trigger_permission', code: 'unsafe_trigger_permission' }),
      ]),
    )
  })
})
