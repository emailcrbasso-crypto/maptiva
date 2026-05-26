/**
 * MyReportPage — Relatório individual do participante logado
 *
 * Rota: /cycles/:id/my-report
 *
 * Usa o RPC `get_my_report(cycle_id)` que:
 *   - É automaticamente escopado ao usuário logado (via auth.uid → people)
 *   - Requer relatório liberado (report_release_at set) para não-admin
 *   - Retorna profile + snapshots visíveis (n-minimum aplicado no banco)
 *
 * Também carrega `comments_published` para exibir comentários qualitativos.
 * A view já aplica as regras de anonimato e n-minimum.
 */

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts'
import { getScale, scoreColorClass, scoreBgClass, scoreToPercent, type ScaleDefinition } from '@/lib/scales'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MyReportData {
  cycle: {
    id:     string
    name:   string
    status: string
  }
  profile: {
    overall_score:         number | null
    self_score:            number | null
    manager_score:         number | null
    peer_score:            number | null
    subordinate_score:     number | null
    blind_spot_count:      number
    hidden_strength_count: number
    generated_at:          string | null
  } | null
  snapshots: SnapshotRow[]
}

interface SnapshotRow {
  relationship_code: string
  competency_id:     string | null
  dimension_code:    string | null
  score_avg:         number | null
  response_count:    number
}

interface CompetencyRow {
  id:             string
  name:           string
  dimension_code: string | null
}

interface CommentRow {
  id:                            string
  cycle_id:                      string
  evaluated_cycle_participant_id: string
  relationship_group:            string
  body:                          string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REL_LABEL: Record<string, string> = {
  self:        'Autoavaliação',
  manager:     'Gestor',
  peer:        'Pares',
  subordinate: 'Subordinados',
  client:      'Clientes',
}

const REL_SHORT: Record<string, string> = {
  self:        'Self',
  manager:     'Gestor',
  peer:        'Pares',
  subordinate: 'Subord.',
  client:      'Cliente',
}

// Palette for radar lines — keeps consistent colors per relationship
const RADAR_PALETTE: Record<string, string> = {
  self:        '#6366f1', // indigo
  manager:     '#10b981', // green
  peer:        '#f59e0b', // amber
  subordinate: '#3b82f6', // blue
  client:      '#ec4899', // pink
}

const REL_ORDER = ['self', 'manager', 'peer', 'subordinate', 'client']

// ─── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({
  value, label, scaleId = 'likert_5',
}: {
  value: number | null; label: string; scaleId?: string
}) {
  const scale = getScale(scaleId)
  const color = scoreBgClass(value, scale)

  return (
    <div className={`rounded-xl p-4 text-center ${color}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">
        {value != null ? value.toFixed(2) : '—'}
      </p>
    </div>
  )
}

// ─── Participation panel ──────────────────────────────────────────────────────

function ParticipationPanel({ snapshots }: { snapshots: SnapshotRow[] }) {
  // Use overall snapshots (no competency_id) to get response counts per relationship
  const overallSnaps = snapshots
    .filter((s) => !s.competency_id && s.response_count > 0)
    .sort((a, b) => REL_ORDER.indexOf(a.relationship_code) - REL_ORDER.indexOf(b.relationship_code))

  if (overallSnaps.length === 0) return null

  const totalExternal = overallSnaps
    .filter((r) => r.relationship_code !== 'self')
    .reduce((sum, r) => sum + r.response_count, 0)

  const totalAll = overallSnaps.reduce((sum, r) => sum + r.response_count, 0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Participação na avaliação
      </h2>
      <div className="grid grid-cols-2 gap-8 items-center">
        {/* Table */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-gray-400 font-medium pb-2 text-xs uppercase tracking-wide">
                Perspectiva
              </th>
              <th className="text-center text-gray-400 font-medium pb-2 text-xs uppercase tracking-wide">
                Respostas
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {overallSnaps.map((r) => (
              <tr key={r.relationship_code}>
                <td className="py-2.5 text-gray-700">
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-2"
                    style={{ backgroundColor: RADAR_PALETTE[r.relationship_code] ?? '#9ca3af' }}
                  />
                  {REL_LABEL[r.relationship_code] ?? r.relationship_code}
                </td>
                <td className="py-2.5 text-center">
                  <span className="font-semibold text-gray-900">{r.response_count}</span>
                  <span className="text-gray-400 text-xs ml-1">
                    resposta{r.response_count !== 1 ? 's' : ''}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summary numbers */}
        <div className="flex flex-col items-center gap-4">
          <div className="text-center">
            <p className="text-5xl font-bold text-gray-900">{totalAll}</p>
            <p className="text-sm text-gray-400 mt-1">respostas no total</p>
          </div>
          <div className="w-px h-8 bg-gray-200" />
          <div className="text-center">
            <p className="text-3xl font-bold text-indigo-600">{totalExternal}</p>
            <p className="text-xs text-gray-400 mt-1">avaliadores externos</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Dual radar chart ─────────────────────────────────────────────────────────

function DualRadarSection({
  snapshots,
  competencies,
  scaleId = 'likert_5',
}: {
  snapshots:    SnapshotRow[]
  competencies: CompetencyRow[]
  scaleId?:     string
}) {
  const scale    = getScale(scaleId)
  const scaleMax = scale.max

  const compWithSnaps = competencies.filter((c) =>
    snapshots.some((s) => s.competency_id === c.id && s.score_avg != null)
  )
  if (compWithSnaps.length < 3) return null

  const shorten = (name: string) => name.length > 18 ? name.slice(0, 16) + '…' : name

  // Data for self radar
  const selfData = compWithSnaps.map((c) => ({
    subject: shorten(c.name),
    self: snapshots.find(
      (s) => s.competency_id === c.id && s.relationship_code === 'self'
    )?.score_avg ?? 0,
  }))

  const hasSelf = selfData.some((d) => d.self > 0)

  // External relationships (all except self)
  const externalRels = [
    ...new Set(
      snapshots
        .filter((s) => s.competency_id && s.score_avg != null && s.relationship_code !== 'self')
        .map((s) => s.relationship_code)
    ),
  ].sort((a, b) => REL_ORDER.indexOf(a) - REL_ORDER.indexOf(b))

  const externalData = compWithSnaps.map((c) => {
    const row: Record<string, number | string> = { subject: shorten(c.name) }
    for (const rel of externalRels) {
      const snap = snapshots.find(
        (s) => s.competency_id === c.id && s.relationship_code === rel
      )
      row[rel] = snap?.score_avg ?? 0
    }
    return row
  })

  const hasExternal = externalRels.length > 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
        Roda da liderança
      </h2>
      <p className="text-xs text-gray-400 mb-5">
        Escala de 0 a {scaleMax} — quanto mais próximo da borda, maior o score.
      </p>
      <div className="grid grid-cols-2 gap-4">

        {/* Left: Auto-avaliação */}
        <div>
          <p className="text-xs font-semibold text-center text-indigo-600 mb-2 uppercase tracking-wide">
            Autoavaliação
          </p>
          {hasSelf ? (
            <ResponsiveContainer width="100%" height={270}>
              <RechartsRadarChart data={selfData} margin={{ top: 10, right: 28, bottom: 10, left: 28 }}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                />
                <PolarRadiusAxis
                  domain={[0, scaleMax]}
                  tick={{ fontSize: 8, fill: '#9ca3af' }}
                  tickCount={scaleMax + 1}
                />
                <Radar
                  name="Autoavaliação"
                  dataKey="self"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.18}
                  strokeWidth={2.5}
                  dot={false}
                />
                <Tooltip formatter={(val) => (typeof val === 'number' ? val.toFixed(2) : '—')} />
              </RechartsRadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[270px] flex items-center justify-center text-xs text-gray-400">
              Sem autoavaliação registrada
            </div>
          )}
        </div>

        {/* Right: Avaliadores externos */}
        <div>
          <p className="text-xs font-semibold text-center text-emerald-600 mb-2 uppercase tracking-wide">
            Avaliadores externos
          </p>
          {hasExternal ? (
            <ResponsiveContainer width="100%" height={270}>
              <RechartsRadarChart data={externalData} margin={{ top: 10, right: 28, bottom: 10, left: 28 }}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                />
                <PolarRadiusAxis
                  domain={[0, scaleMax]}
                  tick={{ fontSize: 8, fill: '#9ca3af' }}
                  tickCount={scaleMax + 1}
                />
                {externalRels.map((rel) => (
                  <Radar
                    key={rel}
                    name={REL_LABEL[rel] ?? rel}
                    dataKey={rel}
                    stroke={RADAR_PALETTE[rel] ?? '#94a3b8'}
                    fill={RADAR_PALETTE[rel] ?? '#94a3b8'}
                    fillOpacity={0.08}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Tooltip formatter={(val) => (typeof val === 'number' ? val.toFixed(2) : '—')} />
              </RechartsRadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[270px] flex items-center justify-center text-xs text-gray-400">
              Sem avaliações externas ainda
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── GAP section ──────────────────────────────────────────────────────────────

function GapSection({
  snapshots,
  competencies,
}: {
  snapshots:    SnapshotRow[]
  competencies: CompetencyRow[]
}) {
  const rows = competencies
    .map((c) => {
      const selfSnap = snapshots.find(
        (s) => s.competency_id === c.id && s.relationship_code === 'self'
      )
      const extSnaps = snapshots.filter(
        (s) =>
          s.competency_id === c.id &&
          s.relationship_code !== 'self' &&
          s.score_avg != null
      )
      const selfScore = selfSnap?.score_avg ?? null
      const extAvg =
        extSnaps.length > 0
          ? extSnaps.reduce((sum, s) => sum + s.score_avg!, 0) / extSnaps.length
          : null
      const gap =
        selfScore != null && extAvg != null ? selfScore - extAvg : null

      return { id: c.id, name: c.name, selfScore, extAvg, gap }
    })
    .filter((r) => r.selfScore != null || r.extAvg != null)
    .sort((a, b) => {
      // Sort by abs gap descending — biggest divergences first
      const absA = a.gap != null ? Math.abs(a.gap) : 0
      const absB = b.gap != null ? Math.abs(b.gap) : 0
      return absB - absA
    })

  if (rows.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
        GAP — Autoavaliação × Avaliadores
      </h2>
      <p className="text-xs text-gray-400 mb-4">
        Diferença entre como você se avalia e como os outros te percebem, por competência.
        Ordenado por maior divergência.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-gray-400 font-medium pb-3 min-w-[160px] text-xs uppercase tracking-wide">
                Competência
              </th>
              <th className="text-center text-indigo-500 font-medium pb-3 px-4 text-xs uppercase tracking-wide">
                Auto
              </th>
              <th className="text-center text-emerald-600 font-medium pb-3 px-4 text-xs uppercase tracking-wide">
                Avaliadores
              </th>
              <th className="text-center text-gray-500 font-medium pb-3 px-4 text-xs uppercase tracking-wide">
                GAP
              </th>
              <th className="text-left text-gray-400 font-medium pb-3 px-4 text-xs uppercase tracking-wide">
                Interpretação
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r) => {
              const isBlindSpot     = r.gap != null && r.gap > 0.5
              const isHiddenStrength = r.gap != null && r.gap < -0.5
              const isAligned       = r.gap != null && !isBlindSpot && !isHiddenStrength

              const gapColor = isBlindSpot
                ? 'text-amber-600'
                : isHiddenStrength
                ? 'text-blue-600'
                : isAligned
                ? 'text-gray-500'
                : 'text-gray-300'

              const gapBg = isBlindSpot
                ? 'bg-amber-50'
                : isHiddenStrength
                ? 'bg-blue-50'
                : ''

              const label = isBlindSpot
                ? '⚠️ Ponto cego'
                : isHiddenStrength
                ? '💎 Força oculta'
                : isAligned
                ? '✓ Alinhado'
                : '—'

              const labelColor = isBlindSpot
                ? 'text-amber-600'
                : isHiddenStrength
                ? 'text-blue-600'
                : 'text-gray-400'

              return (
                <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 pr-4 text-gray-700 font-medium">{r.name}</td>
                  <td className="py-3 px-4 text-center font-semibold text-indigo-600">
                    {r.selfScore != null ? r.selfScore.toFixed(2) : '—'}
                  </td>
                  <td className="py-3 px-4 text-center font-semibold text-emerald-600">
                    {r.extAvg != null ? r.extAvg.toFixed(2) : '—'}
                  </td>
                  <td className={`py-3 px-4 text-center font-bold rounded ${gapColor} ${gapBg}`}>
                    {r.gap != null
                      ? r.gap > 0
                        ? `+${r.gap.toFixed(2)}`
                        : r.gap.toFixed(2)
                      : '—'}
                  </td>
                  <td className={`py-3 px-4 text-xs font-medium ${labelColor}`}>
                    {label}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4">
        <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg">
          <span>⚠️</span>
          <span><strong>Ponto cego</strong> — você acredita mais em si do que os outros percebem (GAP &gt; 0,5)</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg">
          <span>💎</span>
          <span><strong>Força oculta</strong> — outros te veem melhor do que você se avalia (GAP &lt; −0,5)</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg">
          <span>✓</span>
          <span><strong>Alinhado</strong> — percepção interna e externa convergentes</span>
        </div>
      </div>
    </div>
  )
}

// ─── Top 5 / Bottom 5 section ─────────────────────────────────────────────────

function Top5Section({
  snapshots,
  competencies,
  scaleId = 'likert_5',
}: {
  snapshots:    SnapshotRow[]
  competencies: CompetencyRow[]
  scaleId?:     string
}) {
  const scale = getScale(scaleId)

  const scored = competencies
    .map((c) => {
      const ext = snapshots.filter(
        (s) =>
          s.competency_id === c.id &&
          s.relationship_code !== 'self' &&
          s.score_avg != null
      )
      const extAvg =
        ext.length > 0
          ? ext.reduce((sum, s) => sum + s.score_avg!, 0) / ext.length
          : null
      return { id: c.id, name: c.name, extAvg }
    })
    .filter((c) => c.extAvg != null)

  if (scored.length < 3) return null

  const sorted  = [...scored].sort((a, b) => b.extAvg! - a.extAvg!)
  const top5    = sorted.slice(0, Math.min(5, scored.length))
  const bottom5 = sorted.slice(-Math.min(5, scored.length)).reverse()

  function ScoreBar({ value, color }: { value: number; color: 'green' | 'amber' }) {
    const pct = (value / scale.max) * 100
    return (
      <div className="h-1.5 bg-gray-100 rounded-full mt-1">
        <div
          className={`h-1.5 rounded-full ${color === 'green' ? 'bg-green-400' : 'bg-amber-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Indicadores das maiores e menores notas
      </h2>
      <div className="grid grid-cols-2 gap-8">

        {/* Top 5 — Pontos Fortes */}
        <div>
          <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-3">
            🏆 {top5.length} maiores notas — Pontos Fortes
          </p>
          <div className="space-y-4">
            {top5.map((c, i) => (
              <div key={c.id}>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-green-400 shrink-0 w-4">{i + 1}.</span>
                    <span className="truncate">{c.name}</span>
                  </span>
                  <span className="text-sm font-bold text-green-600 shrink-0 ml-3">
                    {c.extAvg!.toFixed(2)}
                  </span>
                </div>
                <ScoreBar value={c.extAvg!} color="green" />
              </div>
            ))}
          </div>
        </div>

        {/* Bottom 5 — Oportunidades */}
        <div>
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3">
            🎯 {bottom5.length} menores notas — Oportunidades de Melhoria
          </p>
          <div className="space-y-4">
            {bottom5.map((c, i) => (
              <div key={c.id}>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-amber-400 shrink-0 w-4">{i + 1}.</span>
                    <span className="truncate">{c.name}</span>
                  </span>
                  <span className="text-sm font-bold text-amber-600 shrink-0 ml-3">
                    {c.extAvg!.toFixed(2)}
                  </span>
                </div>
                <ScoreBar value={c.extAvg!} color="amber" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-5">
        Ranking baseado na média das avaliações externas (gestor, pares e subordinados).
      </p>
    </div>
  )
}

// ─── Competency breakdown ─────────────────────────────────────────────────────

function CompetencyBreakdown({
  snapshots,
  competencies,
  scaleId = 'likert_5',
}: {
  snapshots:    SnapshotRow[]
  competencies: CompetencyRow[]
  scaleId?:     string
}) {
  const scale = getScale(scaleId)
  const withComp = snapshots.filter((s) => s.competency_id && s.score_avg != null)
  if (withComp.length === 0) return null

  const compMap = new Map(competencies.map((c) => [c.id, c]))

  // Group by competency_id
  const byComp = new Map<string, SnapshotRow[]>()
  for (const s of withComp) {
    if (!s.competency_id) continue
    if (!byComp.has(s.competency_id)) byComp.set(s.competency_id, [])
    byComp.get(s.competency_id)!.push(s)
  }

  const relationships = [
    ...new Set(withComp.map((s) => s.relationship_code)),
  ].sort((a, b) => REL_ORDER.indexOf(a) - REL_ORDER.indexOf(b))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Avaliação geral por competência
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-gray-500 font-medium pb-3 pr-6 min-w-[180px] text-xs uppercase tracking-wide">
                Competência
              </th>
              {relationships.map((r) => (
                <th key={r} className="text-center text-gray-500 font-medium pb-3 px-4 min-w-[80px] text-xs uppercase tracking-wide">
                  {REL_SHORT[r] ?? r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {[...byComp.entries()].map(([compId, snaps]) => {
              const comp = compMap.get(compId)
              return (
                <tr key={compId} className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 pr-6 text-gray-700 font-medium">
                    {comp?.name ?? '—'}
                  </td>
                  {relationships.map((r) => {
                    const snap = snaps.find((s) => s.relationship_code === r)
                    return (
                      <td key={r} className="py-3 px-4 text-center">
                        {snap?.score_avg != null ? (
                          <span className={`font-semibold ${scoreColorClass(snap.score_avg, scale)}`}>
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

function CommentsSection({ comments }: { comments: CommentRow[] }) {
  // Deduplicate (view may produce duplicates when multiple competency snapshots exist)
  const unique = [...new Map(comments.map((c) => [c.id, c])).values()]
  if (unique.length === 0) return null

  // Group by relationship_group
  const byRel = new Map<string, string[]>()
  for (const c of unique) {
    if (!byRel.has(c.relationship_group)) byRel.set(c.relationship_group, [])
    byRel.get(c.relationship_group)!.push(c.body)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Comentários qualitativos
      </h2>
      <div className="space-y-5">
        {[...byRel.entries()].map(([rel, bodies]) => (
          <div key={rel}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {REL_LABEL[rel] ?? rel}
            </p>
            <div className="space-y-2">
              {bodies.map((body, i) => (
                <p
                  key={i}
                  className="text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-3 leading-relaxed border-l-2 border-gray-200"
                >
                  "{body}"
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-4">
        Os comentários são apresentados de forma anônima e agregada, respeitando o número mínimo de avaliadores por grupo.
      </p>
    </div>
  )
}

// ─── Insights panel ───────────────────────────────────────────────────────────

function InsightsPanel({ profile }: { profile: NonNullable<MyReportData['profile']> }) {
  if (profile.blind_spot_count === 0 && profile.hidden_strength_count === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Insights
      </h2>
      <div className="grid grid-cols-2 gap-4">
        {profile.blind_spot_count > 0 && (
          <div className="bg-amber-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-amber-600">{profile.blind_spot_count}</p>
            <p className="text-sm font-medium text-amber-700 mt-1">
              Ponto{profile.blind_spot_count !== 1 ? 's' : ''} cego{profile.blind_spot_count !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-amber-600/70 mt-1 leading-relaxed">
              Competências onde outros te avaliam abaixo da sua autoavaliação
            </p>
          </div>
        )}
        {profile.hidden_strength_count > 0 && (
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-blue-600">{profile.hidden_strength_count}</p>
            <p className="text-sm font-medium text-blue-700 mt-1">
              Força{profile.hidden_strength_count !== 1 ? 's' : ''} oculta{profile.hidden_strength_count !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-blue-600/70 mt-1 leading-relaxed">
              Competências onde outros te avaliam acima da sua autoavaliação
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Scores by relationship (bar style) ──────────────────────────────────────

function barBgClass(score: number | null, scale: ScaleDefinition): string {
  if (score == null) return 'bg-gray-200'
  const pct = scoreToPercent(score, scale)
  if (pct >= 80) return 'bg-green-500'
  if (pct >= 60) return 'bg-yellow-400'
  return 'bg-red-400'
}

function SnapshotsByRelationship({
  snapshots,
  scaleId = 'likert_5',
}: {
  snapshots: SnapshotRow[]
  scaleId?:  string
}) {
  const scale = getScale(scaleId)
  // Snapshots without competency_id are the overall-per-relationship scores
  const overallSnaps = snapshots
    .filter((s) => !s.competency_id)
    .sort((a, b) => REL_ORDER.indexOf(a.relationship_code) - REL_ORDER.indexOf(b.relationship_code))

  if (overallSnaps.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Scores consolidados por perspectiva
      </h2>
      <div className="space-y-3">
        {overallSnaps.map((s) => (
          <div key={s.relationship_code} className="flex items-center gap-4">
            <span className="text-sm text-gray-600 w-32 shrink-0 flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: RADAR_PALETTE[s.relationship_code] ?? '#9ca3af' }}
              />
              {REL_LABEL[s.relationship_code] ?? s.relationship_code}
            </span>
            <div className="flex-1 bg-gray-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${barBgClass(s.score_avg, scale)}`}
                style={{
                  width: s.score_avg != null
                    ? `${scoreToPercent(s.score_avg, scale)}%`
                    : '0%',
                }}
              />
            </div>
            <span className={`text-sm font-semibold w-10 text-right ${scoreColorClass(s.score_avg, scale)}`}>
              {s.score_avg != null ? s.score_avg.toFixed(2) : '—'}
            </span>
            <span className="text-xs text-gray-400 w-24 text-right">
              {s.response_count} resposta{s.response_count !== 1 ? 's' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function MyReportPage() {
  const { id } = useParams<{ id: string }>()

  const [report,       setReport]       = useState<MyReportData | null>(null)
  const [competencies, setCompetencies] = useState<CompetencyRow[]>([])
  const [comments,     setComments]     = useState<CommentRow[]>([])
  const [scaleId,      setScaleId]      = useState<string>('likert_5')
  const [loading,      setLoading]      = useState(true)
  const [errorCode,    setErrorCode]    = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    async function load() {
      // Get the personal report (scoped to logged-in user via RPC)
      const { data, error } = await supabase.rpc('get_my_report', { p_cycle_id: id })

      if (error) {
        // Map database errcodes to user-friendly messages
        setErrorCode(error.message.includes('report_not_released')
          ? 'not_released'
          : error.message.includes('participant_not_found')
          ? 'not_participant'
          : error.message.includes('cycle_not_found')
          ? 'not_found'
          : 'generic'
        )
        setLoading(false)
        return
      }

      const reportData = data as MyReportData
      setReport(reportData)

      // Load competency names if we have snapshots with competency_ids
      const compIds = [
        ...new Set(
          (reportData.snapshots ?? [])
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

      // Load comments (view is already filtered to this participant + n-minimum applied)
      const { data: commData } = await supabase
        .from('comments_published')
        .select('id, cycle_id, evaluated_cycle_participant_id, relationship_group, body')
        .eq('cycle_id', id)
      setComments((commData ?? []) as CommentRow[])

      // Load template scale_id so report coloring uses the correct proportional range
      const { data: cycleRow } = await supabase
        .from('cycles')
        .select('template_id')
        .eq('id', id)
        .single()
      if (cycleRow?.template_id) {
        const { data: tmplRow } = await supabase
          .from('templates')
          .select('scale_id')
          .eq('id', cycleRow.template_id)
          .single()
        if (tmplRow?.scale_id) setScaleId(tmplRow.scale_id)
      }

      setLoading(false)
    }
    load()
  }, [id])

  // ── Loading / Error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <p className="text-gray-400 text-sm animate-pulse">Carregando seu relatório...</p>
      </div>
    )
  }

  if (errorCode) {
    const messages: Record<string, { title: string; body: string; icon: string }> = {
      not_released: {
        icon: '🔒',
        title: 'Relatório ainda não liberado',
        body: 'O administrador do ciclo ainda não liberou os resultados para os participantes.',
      },
      not_participant: {
        icon: '👤',
        title: 'Você não é participante deste ciclo',
        body: 'Sua conta não está vinculada como participante neste ciclo de avaliação. Entre em contato com o administrador.',
      },
      not_found: {
        icon: '🔍',
        title: 'Ciclo não encontrado',
        body: 'O ciclo de avaliação solicitado não existe ou você não tem acesso.',
      },
      generic: {
        icon: '⚠️',
        title: 'Erro ao carregar relatório',
        body: 'Ocorreu um erro inesperado. Tente novamente mais tarde.',
      },
    }
    const msg = messages[errorCode] ?? messages.generic

    return (
      <div className="max-w-3xl mx-auto">
        <Link to="/cycles" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
          ← Voltar
        </Link>
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-4xl mb-4">{msg.icon}</p>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{msg.title}</h2>
          <p className="text-sm text-gray-500">{msg.body}</p>
        </div>
      </div>
    )
  }

  if (!report) return null

  const profile         = report.profile
  const hasScore        = profile?.overall_score != null
  const hasCompetencies = competencies.length > 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto">
      {/* ── Header ── */}
      <div className="mb-6">
        <Link to="/cycles" className="text-sm text-gray-400 hover:text-gray-600">
          ← Meus ciclos
        </Link>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{report.cycle.name}</h1>
            <p className="text-sm text-gray-400 mt-0.5">Meu relatório individual</p>
          </div>
          {profile?.generated_at && (
            <p className="text-xs text-gray-400">
              Calculado em {new Date(profile.generated_at).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
      </div>

      {/* ── Not yet scored ── */}
      {!profile && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-3xl mb-4">📊</p>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Relatório ainda não gerado
          </h2>
          <p className="text-sm text-gray-500">
            Os scores serão calculados quando o ciclo for encerrado e as pontuações consolidadas.
          </p>
        </div>
      )}

      {profile && (
        <div className="space-y-5">

          {/* 1. Participation summary */}
          <ParticipationPanel snapshots={report.snapshots} />

          {/* 2. Overall scores grid */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Scores consolidados
            </h2>
            <div className="grid grid-cols-5 gap-3">
              <ScoreBadge value={profile.overall_score}     label="Overall"    scaleId={scaleId} />
              <ScoreBadge value={profile.self_score}        label="Autoaval."  scaleId={scaleId} />
              <ScoreBadge value={profile.manager_score}     label="Gestor"     scaleId={scaleId} />
              <ScoreBadge value={profile.peer_score}        label="Pares"      scaleId={scaleId} />
              <ScoreBadge value={profile.subordinate_score} label="Subordin."  scaleId={scaleId} />
            </div>

            {!hasScore && (
              <p className="text-xs text-gray-400 mt-4 text-center">
                Perfil criado mas sem scores calculados. Verifique se as questões têm competências vinculadas.
              </p>
            )}
          </div>

          {/* 3. Insights (blind spots / hidden strengths) */}
          <InsightsPanel profile={profile} />

          {/* 4. Dual radar — Auto vs. Avaliadores */}
          {hasCompetencies && (
            <DualRadarSection
              snapshots={report.snapshots}
              competencies={competencies}
              scaleId={scaleId}
            />
          )}

          {/* 5. GAP — Autoavaliação × Avaliadores */}
          {hasCompetencies && (
            <GapSection snapshots={report.snapshots} competencies={competencies} />
          )}

          {/* 6. Top 5 / Bottom 5 */}
          {hasCompetencies && (
            <Top5Section
              snapshots={report.snapshots}
              competencies={competencies}
              scaleId={scaleId}
            />
          )}

          {/* 7. Scores by relationship (bar chart style) */}
          <SnapshotsByRelationship snapshots={report.snapshots} scaleId={scaleId} />

          {/* 8. Avaliação geral por competência */}
          {hasCompetencies && (
            <CompetencyBreakdown
              snapshots={report.snapshots}
              competencies={competencies}
              scaleId={scaleId}
            />
          )}

          {/* 9. Qualitative comments */}
          {comments.length > 0 && <CommentsSection comments={comments} />}

          {/* 10. Confidentiality notice */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4">
            <p className="text-xs text-blue-700 leading-relaxed">
              <strong>Privacidade e anonimato:</strong> Os resultados são apresentados de forma
              agregada. Scores de grupos com menos de {3} avaliadores não são exibidos individualmente
              para preservar a confidencialidade dos avaliadores.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
