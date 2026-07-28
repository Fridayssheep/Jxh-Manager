import type {
  Command,
  CommandRun,
  CommandValidationResult,
} from '@/api/types'

export function makeCommand(overrides: Partial<Command> = {}): Command {
  return {
    command_id: 'cmd-1',
    name: '/welcome',
    display_name: '欢迎成员',
    description: '在指定群发送欢迎文本',
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
    ],
    actions: [
      { type: 'mention', target: 'parameter', member_parameter: 'member' },
      { type: 'reply_text', template: '欢迎加入本群' },
    ],
    enabled: false,
    status: 'draft',
    version: 7,
    created_at: '2026-07-28T00:00:00Z',
    updated_at: '2026-07-28T08:00:00Z',
    updated_by: {
      type: 'admin_user',
      user_id: 'user-1',
      qq_user_id: null,
      display_name: '值班维护员',
    },
    ...overrides,
  }
}

export function makeCommandValidationResult(): CommandValidationResult {
  return {
    valid: true,
    issues: [],
    warnings: [],
    parsed_arguments: [{ name: 'member', type: 'member', display_value: '@24680135' }],
    rendered_actions: [{ index: 0, type: 'reply_text', preview: '欢迎加入本群' }],
  }
}

export function makeCommandRun(overrides: Partial<CommandRun> = {}): CommandRun {
  return {
    run_id: 'run-1',
    command_id: 'cmd-1',
    command_name: '/welcome',
    group_id: '10001',
    triggered_by_qq: '24680135',
    result: 'success',
    action_steps: [
      { index: 0, type: 'reply_text', result: 'success', duration_ms: 12, error_code: null },
    ],
    duration_ms: 12,
    error_code: null,
    occurred_at: '2026-07-28T08:30:00Z',
    ...overrides,
  }
}
