import { api, ifMatch, unwrap } from './client'
import type {
  Command,
  CommandActionType,
  CommandCreateRequest,
  CommandDraftValidationRequest,
  CommandList,
  CommandPatchRequest,
  CommandRunList,
  CommandRunResult,
  CommandStatus,
  CommandTriggerPermission,
  CommandValidationResult,
  CommandValidationSample,
} from './types'

export type CommandListQuery = {
  query: string
  enabled: boolean | null
  status: CommandStatus | ''
  scopeType: 'global' | 'groups' | ''
  groupId: string
  actionType: CommandActionType | ''
  triggerPermission: CommandTriggerPermission | ''
  cursor: string | null
  limit?: number
}

export type CommandRunListQuery = {
  result: CommandRunResult | ''
  from: string
  to: string
  cursor: string | null
  limit?: number
}

export const commandsApi = {
  async list(query: CommandListQuery): Promise<CommandList> {
    return unwrap(
      await api.GET('/commands', {
        params: {
          query: {
            query: query.query || undefined,
            enabled: query.enabled ?? undefined,
            status: query.status || undefined,
            scope_type: query.scopeType || undefined,
            group_id: query.groupId || undefined,
            action_type: query.actionType || undefined,
            trigger_permission: query.triggerPermission || undefined,
            cursor: query.cursor ?? undefined,
            limit: query.limit ?? 30,
          },
        },
      }),
    )
  },

  async create(payload: CommandCreateRequest): Promise<Command> {
    return unwrap(await api.POST('/commands', { body: payload }))
  },

  async get(commandId: string): Promise<Command> {
    return unwrap(
      await api.GET('/commands/{command_id}', {
        params: { path: { command_id: commandId } },
      }),
    )
  },

  async update(
    commandId: string,
    payload: CommandPatchRequest,
    version: number,
  ): Promise<Command> {
    return unwrap(
      await api.PATCH('/commands/{command_id}', {
        params: {
          path: { command_id: commandId },
          header: { 'If-Match': ifMatch(version) },
        },
        body: payload,
      }),
    )
  },

  async archive(commandId: string, version: number): Promise<void> {
    return unwrap(
      await api.DELETE('/commands/{command_id}', {
        params: {
          path: { command_id: commandId },
          header: { 'If-Match': ifMatch(version) },
        },
      }),
    )
  },

  async validateDraft(payload: CommandDraftValidationRequest): Promise<CommandValidationResult> {
    return unwrap(await api.POST('/commands/validate', { body: payload }))
  },

  async validateStored(
    commandId: string,
    sample: CommandValidationSample,
  ): Promise<CommandValidationResult> {
    return unwrap(
      await api.POST('/commands/{command_id}/validate', {
        params: { path: { command_id: commandId } },
        body: sample,
      }),
    )
  },

  async listRuns(commandId: string, query: CommandRunListQuery): Promise<CommandRunList> {
    return unwrap(
      await api.GET('/commands/{command_id}/runs', {
        params: {
          path: { command_id: commandId },
          query: {
            result: query.result || undefined,
            from: query.from || undefined,
            to: query.to || undefined,
            cursor: query.cursor ?? undefined,
            limit: query.limit ?? 30,
          },
        },
      }),
    )
  },
}
