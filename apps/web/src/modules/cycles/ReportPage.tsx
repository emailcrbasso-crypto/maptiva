import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { exportCycleReportExcel } from '@/lib/exportReport'
import type { CycleSummary } from '@/lib/exportReport'
import { exportCycleReportPdf, type PdfSnapshotRow, type PdfCompetencyRow } from '@/lib/exportReportPdf'
import { useTenant } from '@/modules/auth/TenantContext'
import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SnapshotRow {
  cycle_participant_id: string
  competency_id: string | null
  relationship_code: string
  score_avg: number | null
  response_count: number
  visibility_status: string
}

interface CompetencyRow {
  id: string
  name: string
  dimension_code: string | null
}

interface CommentRow {
  id: string
  cycle_id: string
  evaluated_cycle_participant_id: string
  relationship_group: string
  body: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REL_SHORT: Record<string, string> = {
  self: 'Self', manager: 'Gestor', peer: 'Pares',
  subordinate: 'Subord.', client: 'Cliente',
}

const REL_LABEL: Record<string, string> = {
  self: 'Autoavaliação', manager: 'Gestor', peer: 'Pares',
  subordinate: 'Subordinados', client: 'Clientes',
}

const RADAR_PALETTE: Record<string, string> = {
  self:        '#6366f1',
  manager:     '#10b981',
  peer:        '#f59e0b',
  subordinate: '#3b82f6',
  client:      '#ec4899',
}

// ─── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ value, label }: { value: number | null; label: string }) {
  const color = value == null
    ? 'bg-gray-50 text-gray-300'
    : value >= 4 ? 'bg-green-50 text-green-700'
    : value >= 3 ? 'bg-yellow-50 text-yellow-700'
    : 'bg-red-50 text-red-600'

  return (
    <div className={`rounded-xl p-3 text-center ${color}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-xl font-bold">
        {value != null ? value.toFixed(2) : '—'}
      </p>
    </div>
  )
}

// ─── Mini radar per participant ────────────────────────────────────────────────

function ParticipantRadar({
  cpId,
  snapshots,
  competencies,
}: {
  cpId:         string
  snapshots:    SnapshotRow[]
  competencies: CompetencyRow[]
}) {
  const mySnaps = snapshots.filter(
    (s) =>
      s.cycle_participant_id === cpId &&
      s.competency_id &&
      s.visibility_status === 'visible' &&
      s.score_avg != null
  )
  if (mySnaps.length === 0) return null

  const compIds = [...new Set(mySnaps.map((s) => s.competency_id))]
  if (compIds.length < 3) return null

  const relationships = [...new Set(mySnaps.map((s) => s.relationship_code))].sort()

  const data = compIds.map((cId) => {
    const comp = competencies.find((c) => c.id === cId)
    const row: Record<string, number | string> = {
      subject: comp
        ? comp.name.length > 18 ? comp.name.slice(0, 16) + '…' : comp.name
        : '—',
    }
    for (const rel of relationships) {
      const snap = mySnaps.find(
        (s) => s.competency_id === cId && s.relationship_code === rel
      )
      row[rel] = snap?.score_avg ?? 0
    }
    return row
  })

  return (
    <div className="mt-4 pt-3 border-t border-gray-100">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
        Radar de competências
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <RechartsRadarChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#6b7280' }} />
          <PolarRadiusAxis domain={[0, 5]} tick={{ fontSize: 9, fill: '#9ca3af' }} tickCount={6} />
          {relationships.map((rel) => (
            <Radar
              key={rel}
              name={REL_LABEL[rel] ?? rel}
              dataKey={rel}
              stroke={RADAR_PALETTE[rel] ?? '#94a3b8'}
              fill={RADAR_PALETTE[rel] ?? '#94a3b8'}
              fillOpacity={0.08}
              strokeWidth={1.5}
              dot={false}
            />
          ))}
          <Tooltip formatter={(val) => (typeof val === 'number' ? val.toFixed(2) : '—')} />
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Competency breakdown ─────────────────────────────────────────────────────

function CompetencyBreakdown({
  cpId,
  snapshots,
  competencies,
}: {
  cpId: string
  snapshots: SnapshotRow[]
  competencies: CompetencyRow[]
}) {
  const mySnaps = snapshots.filter(
    (s) => s.cycle_participant_id === cpId && s.competency_id && s.visibility_status === 'visible'
  )
  if (mySnaps.length === 0) return null

  const compMap = new Map(competencies.map((c) => [c.id, c]))

  // Group by competency_id
  const byComp = new Map<string, SnapshotRow[]>()
  for (const s of mySnaps) {
    if (!s.competency_id) continue
    if (!byComp.has(s.competency_id)) byComp.set(s.competency_id, [])
    byComp.get(s.competency_id)!.push(s)
  }

  const relationships = [...new Set(mySnaps.map((s) => s.relationship_code))].sort()

  return (
    <div className="mt-4 pt-3 border-t border-gray-100">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        Por competência
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left text-gray-500 font-medium pb-2 pr-4 min-w-[140px]">
                Competência
              </th>
              {relationships.map((r) => (
                <th key={r} className="text-center text-gray-500 font-medium pb-2 px-2 min-w-[60px]">
                  {REL_SHORT[r] ?? r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {[...byComp.entries()].map(([compId, snaps]) => {
              const comp = compMap.get(compId)
              return (
                <tr key={compId}>
                  <td className="py-1.5 pr-4 text-gray-700 font-medium">
                    {comp?.name ?? '—'}
                  </td>
                  {relationships.map((r) => {
                    const snap = snaps.find((s) => s.relationship_code === r)
                    return (
                      <td key={r} className="py-1.5 px-2 text-center">
                        {snap?.score_avg != null ? (
                          <span className={`font-semibold ${
                            snap.score_avg >= 4 ? 'text-green-600'
                            : snap.score_avg >= 3 ? 'text-yellow-600'
                            : 'text-red-500'
                          }`}>
                            {snap.score_avg.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Comments section ─────────────────────────────────────────────────────────

function CommentsSection({ cpId, comments }: { cpId: string; comments: CommentRow[] }) {
  const mine = comments.filter((c) => c.evaluated_cycle_participant_id === cpId)
  // Deduplicate by id (view may produce duplicates when multiple competency snapshots exist)
  const unique = [...new Map(mine.map((c) => [c.id, c])).values()]
  if (unique.length === 0) return null

  // Group by relationship_group
  const byRel = new Map<string, string[]>()
  for (const c of unique) {
    if (!byRel.has(c.relationship_group)) byRel.set(c.relationship_group, [])
    byRel.get(c.relationship_group)!.push(c.body)
  }

  return (
    <div className="mt-4 pt-3 border-t border-gray-100">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        Comentários qualitativos
      </p>
      <div className="space-y-3">
        {[...byRel.entries()].map(([rel, bodies]) => (
          <div key={rel}>
            <p className="text-xs font-medium text-gray-500 mb-1.5">
              {REL_LABEL[rel] ?? rel}
            </p>
            <div className="space-y-1.5">
              {bodies.map((body, i) => (
                <p key={i} className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
                  "{body}"
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ReportPage() {
  const { id }       = useParams<{ id: string }>()
  const { branding } = useTenant()

  const [summary,      setSummary]      = useState<CycleSummary | null>(null)
  const [snapshots,    setSnapshots]    = useState<SnapshotRow[]>([])
  const [competencies, setCompetencies] = useState<CompetencyRow[]>([])
  const [comments,     setComments]     = useState<CommentRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [releasing,    setReleasing]    = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)

  useEffect(() => {
    if (!id) return
    async function load() {
      const [sumRes, snapRes, commentRes] = await Promise.all([
        supabase.rpc('get_cycle_summary', { p_cycle_id: id }),
        supabase
          .from('score_snapshots')
          .select('cycle_participant_id, competency_id, relationship_code, score_avg, response_count, visibility_status')
          .eq('cycle_id', id),
        supabase
          .from('comments_published')
          .select('id, cycle_id, evaluated_cycle_participant_id, relationship_group, body')
          .eq('cycle_id', id),
      ])

      if (sumRes.error) { setError(sumRes.error.message); setLoading(false); return }

      setSummary(sumRes.data as CycleSummary)
      setSnapshots((snapRes.data ?? []) as SnapshotRow[])
      setComments((commentRes.data ?? []) as CommentRow[])

      // Load competency names for any competency_ids found
      const compIds = [
        ...new Set(
          ((snapRes.data ?? []) as SnapshotRow[])
            .map((s) => s.competency_id)
            .filter(Boolean) as string[]
        ),
      ]
      if (compIds.length > 0) {
        const { data: compData } = await supabase
          .from('competencies')
          .select('id, name, dimension_code')
          .in('id', compIds)
        setCompetencies((compData ?? []) as CompetencyRow[])
      }

      setLoading(false)
    }
    load()
  }, [id])

  async function handleRelease() {
    if (!id || !confirm('Liberar relatórios para os participantes?')) return
    setReleasing(true)
    const { error: err } = await supabase.rpc('release_reports', { p_cycle_id: id })
    if (err) { alert(err.message); setReleasing(false); return }
    const { data } = await supabase.rpc('get_cycle_summary', { p_cycle_id: id })
    if (data) setSummary(data as CycleSummary)
    setReleasing(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <p className="text-gray-400 text-sm">Carregando relatório...</p>
  if (error)   return <p className="text-red-500 text-sm">{error}</p>
  if (!summary) return null

  const completionPct = summary.total_assignments > 0
    ? Math.round((summary.completed_assignments / summary.total_assignments) * 100)
    : 0

  const withProfile    = summary.participants.filter((p) => p.has_profile)
  const withoutProfile = summary.participants.filter((p) => !p.has_profile)
  const hasCompetencies = competencies.length > 0

  return (
    <div className="max-w-4xl mx-auto">
      {/* ── Header ── */}
      <div className="mb-6">
        <Link to={`/cycles/${summary.cycle_id}`} className="text-sm text-gray-400 hover:text-gray-600">
          ← Voltar ao ciclo
        </Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{summary.cycle_name}</h1>
            <p className="text-sm text-gray-400 mt-0.5">Relatório de resultados</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Exports */}
            <button
              onClick={() => exportCycleReportExcel(summary, snapshots, competencies, comments)}
              className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ↓ Excel
            </button>
            <button
              onClick={async () => {
                setExportingPdf(true)
                await exportCycleReportPdf(
                  summary,
                  {
                    companyName:  branding.name,
                    logoUrl:      branding.logoUrl,
                    primaryColor: branding.primaryColor,
                    footerText:   branding.pdfFooterText,
                    hideMaptiva:  branding.hideMaptiva,
                  },
                  snapshots as PdfSnapshotRow[],
                  competencies as PdfCompetencyRow[],
                )
                setExportingPdf(false)
              }}
              disabled={exportingPdf}
              className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {exportingPdf ? 'Gerando...' : '↓ PDF'}
            </button>

            {/* Release / badge */}
            {summary.status === 'closed' && !summary.report_release_at && (
              <button
                onClick={handleRelease}
                disabled={releasing}
                className="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {releasing ? 'Liberando...' : 'Liberar para participantes'}
              </button>
            )}
            {summary.report_release_at && (
              <span className="text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-full">
                ✓ Liberado em {new Date(summary.report_release_at).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{summary.participants.length}</p>
          <p className="text-xs text-gray-400 mt-1">Participantes</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">
            {summary.completed_assignments}/{summary.total_assignments}
          </p>
          <p className="text-xs text-gray-400 mt-1">Respostas ({completionPct}%)</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{withProfile.length}</p>
          <p className="text-xs text-gray-400 mt-1">Com scores calculados</p>
        </div>
      </div>

      {/* ── Links para relatórios analíticos ── */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link
          to={`/cycles/${id}/team-report`}
          className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-400 hover:shadow-sm transition-all flex items-center gap-3"
        >
          <span className="text-2xl">👥</span>
          <div>
            <p className="text-sm font-semibold text-gray-900">Relatório da Equipe</p>
            <p className="text-xs text-gray-400 mt-0.5">Ranking consolidado por departamento</p>
          </div>
          <span className="ml-auto text-gray-300">→</span>
        </Link>
        <Link
          to={`/cycles/${id}/heatmap`}
          className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-400 hover:shadow-sm transition-all flex items-center gap-3"
        >
          <span className="text-2xl">🗺️</span>
          <div>
            <p className="text-sm font-semibold text-gray-900">Heatmap Executivo</p>
            <p className="text-xs text-gray-400 mt-0.5">Departamentos × competências</p>
          </div>
          <span className="ml-auto text-gray-300">→</span>
        </Link>
      </div>

      {/* ── Participants with scores ── */}
      {withProfile.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Resultados por participante
          </h2>
          <div className="space-y-4">
            {withProfile.map((p) => (
              <div key={p.cycle_participant_id} className="bg-white rounded-xl border border-gray-200 p-5">
                {/* Name + badges */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900">{p.person_name}</h3>
                  <div className="flex gap-2 text-xs">
                    {p.blind_spot_count > 0 && (
                      <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                        {p.blind_spot_count} ponto{p.blind_spot_count !== 1 ? 's' : ''} cego{p.blind_spot_count !== 1 ? 's' : ''}
                      </span>
                    )}
                    {p.hidden_strength_count > 0 && (
                      <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        {p.hidden_strength_count} força{p.hidden_strength_count !== 1 ? 's' : ''} oculta{p.hidden_strength_count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Score grid */}
                <div className="grid grid-cols-5 gap-2">
                  <ScoreBadge value={p.overall_score}     label="Overall" />
                  <ScoreBadge value={p.self_score}        label="Autoaval." />
                  <ScoreBadge value={p.manager_score}     label="Gestor" />
                  <ScoreBadge value={p.peer_score}        label="Pares" />
                  <ScoreBadge value={p.subordinate_score} label="Subordin." />
                </div>

                {/* Mini radar */}
                {hasCompetencies && (
                  <ParticipantRadar
                    cpId={p.cycle_participant_id}
                    snapshots={snapshots}
                    competencies={competencies}
                  />
                )}

                {/* Competency breakdown */}
                {hasCompetencies && (
                  <CompetencyBreakdown
                    cpId={p.cycle_participant_id}
                    snapshots={snapshots}
                    competencies={competencies}
                  />
                )}

                {/* Comments */}
                <CommentsSection
                  cpId={p.cycle_participant_id}
                  comments={comments}
                />

                {/* No scores warning */}
                {p.overall_score == null && (
                  <p className="text-xs text-gray-400 mt-3 text-center">
                    Perfil criado mas sem scores — verifique se as perguntas têm competências vinculadas.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Participants without profile ── */}
      {withoutProfile.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Sem avaliações concluídas
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {withoutProfile.map((p) => (
              <div key={p.cycle_participant_id} className="px-5 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-700">{p.person_name}</span>
                <span className="text-xs text-gray-400">Nenhum avaliador concluiu</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {summary.participants.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-gray-400 text-sm">Nenhum participante neste ciclo.</p>
        </div>
      )}
    </div>
  )
}
