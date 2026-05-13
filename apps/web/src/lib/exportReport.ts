/**
 * exportReport.ts
 * Generates Excel workbooks from cycle report data.
 * Keep all export/business logic here — out of UI components.
 */

import * as XLSX from 'xlsx'

// ─── Types (mirror ReportPage interfaces) ─────────────────────────────────────

export interface ParticipantSummary {
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
  cycle_id:              string
  cycle_name:            string
  status:                string
  report_release_at:     string | null
  total_assignments:     number
  completed_assignments: number
  participants:          ParticipantSummary[]
}

export interface SnapshotExport {
  cycle_participant_id: string
  competency_id:        string | null
  relationship_code:    string
  score_avg:            number | null
  visibility_status:    string
}

export interface CompetencyExport {
  id:   string
  name: string
}

export interface CommentExport {
  id:                             string
  evaluated_cycle_participant_id: string
  relationship_group:             string
  body:                           string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(value: number | null): string | number {
  if (value == null) return '—'
  return Number(value.toFixed(2))
}

function ptBrDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

const REL_LABEL: Record<string, string> = {
  self:        'Autoavaliação',
  manager:     'Gestor',
  peer:        'Pares',
  subordinate: 'Subordinados',
  client:      'Clientes',
}

// ─── Excel export ─────────────────────────────────────────────────────────────

/**
 * exportCycleReportExcel
 * Generates and triggers download of an .xlsx file with:
 *   - Sheet "Resumo"          → cycle-level stats
 *   - Sheet "Participantes"   → one row per participant with all scores
 *   - Sheet "Competências"    → one row per participant × competency × relationship
 *   - Sheet "Comentários"     → anonymized qualitative comments
 */
export function exportCycleReportExcel(
  summary:      CycleSummary,
  snapshots?:   SnapshotExport[],
  competencies?: CompetencyExport[],
  comments?:    CommentExport[],
): void {
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Resumo ────────────────────────────────────────────────────────
  const completionPct =
    summary.total_assignments > 0
      ? Math.round((summary.completed_assignments / summary.total_assignments) * 100)
      : 0

  const resumoRows = [
    ['Ciclo',                summary.cycle_name],
    ['Status',               summary.status],
    ['Relatório liberado',   ptBrDate(summary.report_release_at)],
    [],
    ['Total de participantes', summary.participants.length],
    ['Com scores calculados',  summary.participants.filter((p) => p.has_profile).length],
    ['Total avaliações',       summary.total_assignments],
    ['Avaliações concluídas',  summary.completed_assignments],
    ['Percentual de resposta', `${completionPct}%`],
  ]

  const wsResumo = XLSX.utils.aoa_to_sheet(resumoRows)
  wsResumo['!cols'] = [{ wch: 28 }, { wch: 32 }]
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo')

  // ── Sheet 2: Participantes ─────────────────────────────────────────────────
  const headers = [
    'Participante',
    'Overall',
    'Autoavaliação',
    'Gestor',
    'Pares',
    'Subordinados',
    'Pontos Cegos',
    'Forças Ocultas',
    'Status',
  ]

  const rows = summary.participants.map((p) => [
    p.person_name,
    fmt(p.overall_score),
    fmt(p.self_score),
    fmt(p.manager_score),
    fmt(p.peer_score),
    fmt(p.subordinate_score),
    p.blind_spot_count,
    p.hidden_strength_count,
    p.has_profile ? 'Calculado' : 'Sem avaliações',
  ])

  const wsParticipants = XLSX.utils.aoa_to_sheet([headers, ...rows])
  wsParticipants['!cols'] = [
    { wch: 28 }, { wch: 10 }, { wch: 14 }, { wch: 10 },
    { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
  ]
  XLSX.utils.book_append_sheet(wb, wsParticipants, 'Participantes')

  // ── Sheet 3: Competências (if data available) ──────────────────────────────
  if (snapshots && snapshots.length > 0 && competencies && competencies.length > 0) {
    const compMap = new Map(competencies.map((c) => [c.id, c.name]))
    const cpNameMap = new Map(summary.participants.map((p) => [p.cycle_participant_id, p.person_name]))

    // Only include visible competency-level snapshots
    const compSnaps = snapshots.filter(
      (s) => s.competency_id && s.visibility_status === 'visible' && s.score_avg != null
    )

    const compHeaders = ['Participante', 'Competência', 'Perspectiva', 'Score']
    const compRows = compSnaps.map((s) => [
      cpNameMap.get(s.cycle_participant_id) ?? s.cycle_participant_id,
      compMap.get(s.competency_id!) ?? s.competency_id,
      REL_LABEL[s.relationship_code] ?? s.relationship_code,
      fmt(s.score_avg),
    ])

    if (compRows.length > 0) {
      const wsComp = XLSX.utils.aoa_to_sheet([compHeaders, ...compRows])
      wsComp['!cols'] = [{ wch: 28 }, { wch: 28 }, { wch: 16 }, { wch: 10 }]
      XLSX.utils.book_append_sheet(wb, wsComp, 'Competências')
    }
  }

  // ── Sheet 4: Comentários (if data available) ───────────────────────────────
  if (comments && comments.length > 0) {
    const cpNameMap = new Map(summary.participants.map((p) => [p.cycle_participant_id, p.person_name]))

    // Deduplicate
    const unique = [...new Map(comments.map((c) => [c.id, c])).values()]

    const commHeaders = ['Avaliado', 'Perspectiva', 'Comentário']
    const commRows = unique.map((c) => [
      cpNameMap.get(c.evaluated_cycle_participant_id) ?? c.evaluated_cycle_participant_id,
      REL_LABEL[c.relationship_group] ?? c.relationship_group,
      c.body,
    ])

    const wsComm = XLSX.utils.aoa_to_sheet([commHeaders, ...commRows])
    wsComm['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 80 }]
    XLSX.utils.book_append_sheet(wb, wsComm, 'Comentários')
  }

  // ── Trigger download ───────────────────────────────────────────────────────
  const safeName = summary.cycle_name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')
  const fileName = `Relatorio_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`

  XLSX.writeFile(wb, fileName)
}
