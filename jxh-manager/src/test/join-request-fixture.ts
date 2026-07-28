import type {
  JoinDecision,
  JoinDecisionResult,
  JoinRequest,
  JoinRequestSummary,
} from '@/api/types'

export function makeJoinRequestSummary(
  overrides: Partial<JoinRequestSummary> = {},
): JoinRequestSummary {
  return {
    request_id: 'flag-10001',
    group: { group_id: '10001', name: '精弘网络维护群' },
    applicant_qq: '24680135',
    applicant_nickname: '小弘同学',
    verification_message: '姓名：张三，学号：20260001，专业：计算机科学与技术',
    sub_type: 'add',
    source: 'event',
    observed_status: 'pending',
    decision_status: 'pending',
    decision_source: null,
    ai_parse: {
      status: 'succeeded',
      fields: {
        student_id: '20260001',
        name: '张三',
        major: '计算机科学与技术',
        valid: true,
        validation_errors: [],
      },
      error_code: null,
      completed_at: '2026-07-28T05:01:00Z',
    },
    requested_at: '2026-07-28T05:00:00Z',
    overdue: false,
    version: 7,
    last_decision_id: null,
    ...overrides,
  }
}

export function makeJoinRequest(overrides: Partial<JoinRequest> = {}): JoinRequest {
  return {
    ...makeJoinRequestSummary(),
    comment: null,
    first_observed_at: '2026-07-28T05:00:00Z',
    last_observed_at: '2026-07-28T05:02:00Z',
    ...overrides,
  }
}

export function makeJoinDecision(overrides: Partial<JoinDecision> = {}): JoinDecision {
  return {
    decision_id: 'decision-1',
    request_id: 'flag-10001',
    action: 'approve',
    source: 'manual',
    status: 'confirmed',
    actor: {
      type: 'admin_user',
      user_id: 'user-1',
      qq_user_id: null,
      display_name: '值班维护员',
    },
    reason: '信息完整',
    rule_version: null,
    field_snapshot: null,
    started_at: '2026-07-28T05:03:00Z',
    completed_at: '2026-07-28T05:03:01Z',
    error_code: null,
    trace_id: 'trace-1',
    ...overrides,
  }
}

export function makeJoinDecisionResult(): JoinDecisionResult {
  return {
    join_request: makeJoinRequest({
      decision_status: 'approved',
      decision_source: 'manual',
      version: 8,
      last_decision_id: 'decision-1',
    }),
    decision: makeJoinDecision(),
  }
}
