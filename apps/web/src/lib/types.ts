// ─── Domain types (mirrors public schema) ────────────────────────────────────

// ── Panel membership roles ────────────────────────────────────────────────────
// These roles govern access to the Maptiva dashboard only.
// They live in public.tenant_memberships and determine what a logged-in
// user can see and do inside the platform.
//
//   owner   → full control: billing, branding, delete tenant, manage all members
//   admin   → operational: templates, cycles, people, invite admin/manager
//   manager → scoped: views cycles and reports for their direct reports only
//
// ⚠️  DO NOT confuse with RelationshipCode 'manager' below.
export type PanelRole = 'owner' | 'admin' | 'manager'

// Kept as alias for backward compatibility with any existing usages.
// Prefer PanelRole in new code.
export type MemberRole = PanelRole

// ── Assessment relationship codes ────────────────────────────────────────────
// These codes describe who is evaluating whom inside an assessment cycle.
// They live in public.assignments.relationship_code and drive scoring,
// anonymization rules, and report grouping.
//
//   self        → the evaluated person rates themselves
//   manager     → the evaluated person's direct manager rates them
//   peer        → a colleague at the same level rates them
//   subordinate → a direct report of the evaluated person rates them
//   client      → an external client rates them
//
// ⚠️  'manager' here is completely independent from PanelRole 'manager' above.
//     A person can simultaneously:
//       - be a PanelRole 'manager' (dashboard access to see their team)
//       - appear as relationship_code 'manager' in an assignment
//           (meaning they evaluate someone as that person's direct manager)
//     These are two separate facts stored in separate tables.
export type RelationshipCode = 'self' | 'manager' | 'peer' | 'subordinate' | 'client'

// ── Assessment participants vs. panel users ───────────────────────────────────
// Three distinct entities — never conflate them:
//
//   1. Panel user     → auth.users → public.users → tenant_memberships (PanelRole)
//                       Has a login. Can access the dashboard.
//
//   2. Assessment participant (avaliado) → public.people → public.cycle_participants
//                       A data subject. May or may not have a panel account.
//                       If they do, people.user_id links to public.users.id.
//                       No login required to be evaluated.
//
//   3. Respondent / external evaluator  → public.assignments + magic link
//                       Answers questionnaires via /respond/:token.
//                       No Supabase account. No membership. Token-only access.

export type CycleStatus      = 'draft' | 'active' | 'closed' | 'archived'
export type AssignmentStatus = 'pending' | 'invited' | 'completed' | 'expired' | 'cancelled'
export type VisibilityStatus = 'visible' | 'hidden'

export interface Tenant {
  id: string
  name: string
  slug: string
}

export interface TenantMembership {
  id:        string
  tenant_id: string
  user_id:   string
  role:      PanelRole
  status:    string
}

export interface Cycle {
  id:                  string
  tenant_id:           string
  template_id:         string
  name:                string
  status:              CycleStatus
  start_at:            string | null
  deadline_at:         string | null
  report_release_at:   string | null
  allow_admin_raw_read: boolean
  created_at:          string
}

export interface CycleParticipant {
  id:                string
  cycle_id:          string
  person_id:         string
  manager_person_id: string | null
}

export interface Person {
  id:         string
  tenant_id:  string
  name:       string
  email:      string
  department: string | null
  job_title:  string | null
}

export interface Assignment {
  id:                            string
  cycle_id:                      string
  evaluated_cycle_participant_id: string
  relationship_code:             RelationshipCode
  status:                        AssignmentStatus
  completed_at:                  string | null
}

export interface ScoreSnapshot {
  relationship_code: RelationshipCode
  competency_id:     string
  dimension_code:    string | null
  score_avg:         number
  response_count:    number
}

export interface ParticipantProfile {
  overall_score:         number | null
  self_score:            number | null
  manager_score:         number | null
  peer_score:            number | null
  subordinate_score:     number | null
  blind_spot_count:      number
  hidden_strength_count: number
  generated_at:          string
}

export interface MyReportResult {
  cycle:     { id: string; name: string; status: string }
  profile:   ParticipantProfile | null
  snapshots: ScoreSnapshot[]
}

export interface CycleSummaryParticipant {
  cycle_participant_id:  string
  person_name:           string
  has_profile:           boolean
  overall_score:         number | null
  self_score:            number | null
  manager_score:         number | null
  peer_score:            number | null
  subordinate_score:     number | null
  blind_spot_count:      number
  hidden_strength_count: number
}

export interface CycleSummary {
  cycle_id:             string
  cycle_name:           string
  status:               CycleStatus
  report_release_at:    string | null
  total_assignments:    number
  completed_assignments: number
  participants:         CycleSummaryParticipant[]
}
