// ─── Domain types (mirrors public schema) ────────────────────────────────────

export type MemberRole = 'owner' | 'admin' | 'manager' | 'participant'
export type CycleStatus = 'draft' | 'active' | 'closed' | 'archived'
export type AssignmentStatus = 'pending' | 'invited' | 'completed' | 'expired' | 'cancelled'
export type VisibilityStatus = 'visible' | 'hidden'

export interface Tenant {
  id: string
  name: string
  slug: string
}

export interface TenantMembership {
  id: string
  tenant_id: string
  user_id: string
  role: MemberRole
  status: string
}

export interface Cycle {
  id: string
  tenant_id: string
  template_id: string
  name: string
  status: CycleStatus
  start_at: string | null
  deadline_at: string | null
  report_release_at: string | null
  allow_admin_raw_read: boolean
  created_at: string
}

export interface CycleParticipant {
  id: string
  cycle_id: string
  person_id: string
  manager_person_id: string | null
}

export interface Person {
  id: string
  tenant_id: string
  name: string
  email: string
  department: string | null
  job_title: string | null
}

export interface Assignment {
  id: string
  cycle_id: string
  evaluated_cycle_participant_id: string
  relationship_code: string
  status: AssignmentStatus
  completed_at: string | null
}

export interface ScoreSnapshot {
  relationship_code: string
  competency_id: string
  dimension_code: string | null
  score_avg: number
  response_count: number
}

export interface ParticipantProfile {
  overall_score: number | null
  self_score: number | null
  manager_score: number | null
  peer_score: number | null
  subordinate_score: number | null
  blind_spot_count: number
  hidden_strength_count: number
  generated_at: string
}

export interface MyReportResult {
  cycle: { id: string; name: string; status: string }
  profile: ParticipantProfile | null
  snapshots: ScoreSnapshot[]
}

export interface CycleSummaryParticipant {
  cycle_participant_id: string
  person_name: string
  has_profile: boolean
  overall_score: number | null
  self_score: number | null
  manager_score: number | null
  peer_score: number | null
  subordinate_score: number | null
  blind_spot_count: number
  hidden_strength_count: number
}

export interface CycleSummary {
  cycle_id: string
  cycle_name: string
  status: CycleStatus
  report_release_at: string | null
  total_assignments: number
  completed_assignments: number
  participants: CycleSummaryParticipant[]
}
