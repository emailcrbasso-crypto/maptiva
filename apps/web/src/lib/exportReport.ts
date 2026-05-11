/**
 * exportReport.ts
 * Generates Excel workbooks from cycle report data.
 * Keep all export/business logic here — out of UI components.
 */

import * as XLSX from 'xlsx'

// ─── Types (mirror ReportPage interfaces) ─────────────────────────────────────

export interface ParticipantSummary {
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
  status: string
  report_release_at: string | null
  total_assignments: number
  completed_assignments: number
  participants: ParticipantSummary[]
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

// ─── Excel export ─────────────────────────────────────────────────────────────

/**
 * exportCycleReportExcel
 * Generates and triggers download of an .xlsx file with:
 *   - Sheet "Resumo"       → cycle-level stats
 *   - Sheet "Participantes"→ one row per participant with all scores
 */
export function exportCycleReportExcel(summary: CycleSummary): void {
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

  // Header style via column widths
  wsParticipants['!cols'] = [
    { wch: 28 }, // Participante
    { wch: 10 }, // Overall
    { wch: 14 }, // Autoavaliação
    { wch: 10 }, // Gestor
    { wch: 10 }, // Pares
    { wch: 14 }, // Subordinados
    { wch: 14 }, // Pontos Cegos
    { wch: 14 }, // Forças Ocultas
    { wch: 16 }, // Status
  ]

  XLSX.utils.book_append_sheet(wb, wsParticipants, 'Participantes')

  // ── Trigger download ───────────────────────────────────────────────────────
  const safeName = summary.cycle_name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')
  const fileName = `Relatorio_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`

  XLSX.writeFile(wb, fileName)
}
