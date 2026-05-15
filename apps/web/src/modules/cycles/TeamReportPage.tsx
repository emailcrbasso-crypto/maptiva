/**
 * TeamReportPage — Relatório Consolidado da Equipe
 *
 * Rota: /cycles/:id/team-report
 *
 * Visão gestora: todos os participantes rankeados por score overall,
 * agrupados por departamento. Mostra distribuição de scores e
 * destaques de pontos cegos e forças ocultas.
 */

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParticipantSummary {
  cycle_participant_id: string
  person_name:          string
  has_profile:          boolean
  overall_score:        number | null
  self_score:           number | null
  manager_score:        number | null
  peer_score:           number | null
  subordinate_score:    number | null
  blind_spot_count:     number
  hidden_strength_count: number
}

interface CycleSummary {
  cycle_id:             string
  cycle_name:           string
  status:               string
  report_release_at:    string | null
  total_assignments:    number
  completed_assignments: number
  participants:         ParticipantSummary[]
}

interface PersonInfo {
  cycle_participant_id: string
  department:           string | null
  job_title:            string | null
}

interface ParticipantWithDept extends ParticipantSummary {
  department: string | null
  job_title:  string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(v: number | null): string {
  if (v == null) return 'text-gray-300'
  if (v >= 4)    return 'text-green-600'
  if (v >= 3)    return 'text-yellow-600'
  return 'text-red-500'
}

// Mini bar — score / 5 as percentage
function ScoreBar({ value }: { value: number | null }) {
  const pct = value != null ? (value / 5) * 100 : 0
  const bar =
    value == null ? 'bg-gray-200'
    : value >= 4  ? 'bg-green-400'
    : value >= 3  ? 'bg-yellow-400'
    : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold w-8 text-right ${scoreColor(value)}`}>
        {value != null ? value.toFixed(2) : '—'}
      </span>
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

function exportTeamExcel(cycleName: string, grouped: [string, ParticipantWithDept[]][]) {
  const wb = XLSX.utils.book_new()

  const headers = [
    'Departamento', 'Participante', 'Cargo', 'Rank', 'Overall',
    'Autoavaliação', 'Gestor', 'Pares', 'Subordinados',
    'Pontos Cegos', 'Forças Ocultas',
  ]

  const rows: (string | number | null)[][] = []
  for (const [dept, members] of grouped) {
    const ranked = [...members]
      .filter((m) => m.has_profile)
      .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0))

    ranked.forEach((m, idx) => {
      rows.push([
        dept,
        m.person_name,
        m.job_title ?? '',
        idx + 1,
        m.overall_score,
        m.self_score,
        m.manager_score,
        m.peer_score,
        m.subordinate_score,
        m.blind_spot_count,
        m.hidden_strength_count,
      ])
    })
  }

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = [
    { wch: 22 }, { wch: 28 }, { wch: 22 }, { wch: 6 },
    { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 14 },
    { wch: 14 }, { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Equipe')

  const safe = cycleName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')
  XLSX.writeFile(wb, `Equipe_${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function TeamReportPage() {
  const { id } = useParams<{ id: string }>()

  const [summary,   setSummary]   = useState<CycleSummary | null>(null)
  const [people,    setPeople]    = useState<PersonInfo[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    async function load() {
      const [sumRes, cpRes] = await Promise.all([
        supabase.rpc('get_cycle_summary', { p_cycle_id: id }),
        supabase
          .from('cycle_participants')
          .select('id, people!person_id(department, job_title)')
          .eq('cycle_id', id),
      ])

      if (sumRes.error) { setError(sumRes.error.message); setLoading(false); return }
      setSummary(sumRes.data as CycleSummary)

      // Build PersonInfo list from cycle_participants join
      // PostgREST returns the related object as an array for many-to-one; cast through unknown.
      const cpRows = (cpRes.data ?? []) as unknown as Array<{
        id: string
        people: { department: string | null; job_title: string | null } | null
      }>
      setPeople(cpRows.map((row) => ({
        cycle_participant_id: row.id,
        department:           row.people?.department ?? null,
        job_title:            row.people?.job_title  ?? null,
      })))

      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <p className="text-gray-400 text-sm">Carregando...</p>
  if (error)   return <p className="text-red-500 text-sm">{error}</p>
  if (!summary) return null

  // Merge department info into participants
  const peopleMap = new Map(people.map((p) => [p.cycle_participant_id, p]))
  const merged: ParticipantWithDept[] = summary.participants.map((p) => ({
    ...p,
    department: peopleMap.get(p.cycle_participant_id)?.department ?? null,
    job_title:  peopleMap.get(p.cycle_participant_id)?.job_title  ?? null,
  }))

  // Group by department (null → "Sem departamento")
  const deptMap = new Map<string, ParticipantWithDept[]>()
  for (const m of merged) {
    const key = m.department ?? 'Sem departamento'
    if (!deptMap.has(key)) deptMap.set(key, [])
    deptMap.get(key)!.push(m)
  }

  // Sort departments alphabetically, "Sem departamento" last
  const grouped = [...deptMap.entries()].sort(([a], [b]) => {
    if (a === 'Sem departamento') return 1
    if (b === 'Sem departamento') return -1
    return a.localeCompare(b)
  })

  const withProfile = merged.filter((m) => m.has_profile)
  const avgOverall =
    withProfile.length > 0
      ? withProfile.reduce((s, m) => s + (m.overall_score ?? 0), 0) / withProfile.length
      : null

  return (
    <div className="max-w-4xl mx-auto">
      {/* ── Header ── */}
      <div className="mb-6">
        <Link
          to={`/cycles/${id}/report`}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← Relatório geral
        </Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{summary.cycle_name}</h1>
            <p className="text-sm text-gray-400 mt-0.5">Relatório consolidado da equipe</p>
          </div>
          <button
            onClick={() => exportTeamExcel(summary.cycle_name, grouped)}
            className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ↓ Excel
          </button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{withProfile.length}</p>
          <p className="text-xs text-gray-400 mt-1">Com scores</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className={`text-2xl font-bold ${scoreColor(avgOverall)}`}>
            {avgOverall != null ? avgOverall.toFixed(2) : '—'}
          </p>
          <p className="text-xs text-gray-400 mt-1">Média geral</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">
            {merged.reduce((s, m) => s + m.blind_spot_count, 0)}
          </p>
          <p className="text-xs text-gray-400 mt-1">Pontos cegos</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">
            {merged.reduce((s, m) => s + m.hidden_strength_count, 0)}
          </p>
          <p className="text-xs text-gray-400 mt-1">Forças ocultas</p>
        </div>
      </div>

      {/* ── Grouped by department ── */}
      <div className="space-y-6">
        {grouped.map(([dept, members]) => {
          const ranked = [...members]
            .filter((m) => m.has_profile)
            .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0))
          const noScore = members.filter((m) => !m.has_profile)

          return (
            <div key={dept} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Department header */}
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">{dept}</h2>
                <span className="text-xs text-gray-400">
                  {members.length} pessoa{members.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Ranked participants */}
              {ranked.length > 0 && (
                <div className="divide-y divide-gray-50">
                  {/* Header row */}
                  <div className="px-5 py-2 grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-3 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    <span>Participante</span>
                    <span className="text-center">Overall</span>
                    <span className="text-center">Self</span>
                    <span className="text-center">Gestor</span>
                    <span className="text-center">Pares</span>
                    <span className="text-center">Insights</span>
                  </div>

                  {ranked.map((m, idx) => (
                    <div
                      key={m.cycle_participant_id}
                      className="px-5 py-3 grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-3 items-center hover:bg-gray-50 transition-colors"
                    >
                      {/* Name + rank */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`text-xs font-bold w-5 shrink-0 ${
                          idx === 0 ? 'text-yellow-500'
                          : idx === 1 ? 'text-gray-400'
                          : idx === 2 ? 'text-amber-700'
                          : 'text-gray-300'
                        }`}>
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {m.person_name}
                          </p>
                          {m.job_title && (
                            <p className="text-xs text-gray-400 truncate">{m.job_title}</p>
                          )}
                        </div>
                      </div>

                      {/* Overall */}
                      <div className="px-1">
                        <ScoreBar value={m.overall_score} />
                      </div>

                      {/* Self */}
                      <p className={`text-xs font-semibold text-center ${scoreColor(m.self_score)}`}>
                        {m.self_score != null ? m.self_score.toFixed(2) : '—'}
                      </p>

                      {/* Manager */}
                      <p className={`text-xs font-semibold text-center ${scoreColor(m.manager_score)}`}>
                        {m.manager_score != null ? m.manager_score.toFixed(2) : '—'}
                      </p>

                      {/* Peer */}
                      <p className={`text-xs font-semibold text-center ${scoreColor(m.peer_score)}`}>
                        {m.peer_score != null ? m.peer_score.toFixed(2) : '—'}
                      </p>

                      {/* Insights badges */}
                      <div className="flex gap-1 justify-center flex-wrap">
                        {m.blind_spot_count > 0 && (
                          <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full">
                            {m.blind_spot_count}🔴
                          </span>
                        )}
                        {m.hidden_strength_count > 0 && (
                          <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">
                            {m.hidden_strength_count}💎
                          </span>
                        )}
                        {m.blind_spot_count === 0 && m.hidden_strength_count === 0 && (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Without scores */}
              {noScore.length > 0 && (
                <div className="px-5 py-2 border-t border-gray-50">
                  <p className="text-xs text-gray-400">
                    Sem scores: {noScore.map((m) => m.person_name).join(', ')}
                  </p>
                </div>
              )}

              {/* Empty */}
              {ranked.length === 0 && noScore.length === 0 && (
                <p className="px-5 py-4 text-xs text-gray-400">Nenhum membro neste departamento.</p>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Legend ── */}
      <div className="mt-6 bg-gray-50 rounded-xl border border-gray-100 px-5 py-4">
        <p className="text-xs text-gray-500 font-medium mb-2">Legenda</p>
        <div className="flex gap-4 text-xs text-gray-400 flex-wrap">
          <span>🔴 = Pontos cegos (avaliação externa &lt; autoavaliação)</span>
          <span>💎 = Forças ocultas (avaliação externa &gt; autoavaliação)</span>
          <span className="text-green-500">■ Verde ≥ 4.0</span>
          <span className="text-yellow-500">■ Amarelo ≥ 3.0</span>
          <span className="text-red-500">■ Vermelho &lt; 3.0</span>
        </div>
      </div>
    </div>
  )
}
