/**
 * reportShared.tsx
 *
 * Shared types, constants, and display components for individual 360 reports.
 * Used by both:
 *   - MyReportPage     (/cycles/:id/my-report)    — participant's own view
 *   - ParticipantReportPage (/cycles/:id/participants/:cpId/report) — admin view
 */

import { useState } from 'react'
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
import {
  getScale,
  scoreColorClass,
  scoreBgClass,
  scoreToPercent,
  type ScaleDefinition,
} from '@/lib/scales'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SnapshotRow {
  relationship_code:  string
  competency_id:      string | null
  dimension_code:     string | null
  score_avg:          number | null
  response_count:     number
  score_distribution: Record<string, number> | null | undefined
}

export interface BenchmarkEntry {
  competency_id:     string | null
  score_avg:         number
  participant_count: number
}

// key = competency_id (uuid string) or '__overall__' for null
export type BenchmarkMap = Record<string, BenchmarkEntry>

export interface QuestionScoreRow {
  question_id:       string
  prompt:            string
  order_index:       number
  competency_id:     string | null
  relationship_code: string
  score_avg:         number
  response_count:    number
}

export interface CompetencyRow {
  id:             string
  name:           string
  dimension_code: string | null
}

export interface CommentRow {
  id:                             string
  cycle_id:                       string
  evaluated_cycle_participant_id: string
  relationship_group:             string
  body:                           string
}

export interface ProfileData {
  overall_score:         number | null
  self_score:            number | null
  manager_score:         number | null
  peer_score:            number | null
  subordinate_score:     number | null
  blind_spot_count:      number
  hidden_strength_count: number
  generated_at:          string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const REL_LABEL: Record<string, string> = {
  self:        'Autoavaliação',
  manager:     'Gestor',
  peer:        'Pares',
  subordinate: 'Subordinados',
  client:      'Clientes',
}

export const REL_SHORT: Record<string, string> = {
  self:        'Self',
  manager:     'Gestor',
  peer:        'Pares',
  subordinate: 'Subord.',
  client:      'Cliente',
}

export const RADAR_PALETTE: Record<string, string> = {
  self:        '#6366f1',
  manager:     '#10b981',
  peer:        '#f59e0b',
  subordinate: '#3b82f6',
  client:      '#ec4899',
}

export const REL_ORDER = ['self', 'manager', 'peer', 'subordinate', 'client']

// ─── Score badge ──────────────────────────────────────────────────────────────

export function ScoreBadge({
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

export function ParticipationPanel({ snapshots }: { snapshots: SnapshotRow[] }) {
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

// ─── Dual radar ───────────────────────────────────────────────────────────────

export function DualRadarSection({
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

  const selfData = compWithSnaps.map((c) => ({
    subject: shorten(c.name),
    self: snapshots.find(
      (s) => s.competency_id === c.id && s.relationship_code === 'self'
    )?.score_avg ?? 0,
  }))
  const hasSelf = selfData.some((d) => d.self > 0)

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
        <div>
          <p className="text-xs font-semibold text-center text-indigo-600 mb-2 uppercase tracking-wide">
            Autoavaliação
          </p>
          {hasSelf ? (
            <ResponsiveContainer width="100%" height={270}>
              <RechartsRadarChart data={selfData} margin={{ top: 10, right: 28, bottom: 10, left: 28 }}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#6b7280' }} />
                <PolarRadiusAxis domain={[0, scaleMax]} tick={{ fontSize: 8, fill: '#9ca3af' }} tickCount={scaleMax + 1} />
                <Radar name="Autoavaliação" dataKey="self" stroke="#6366f1" fill="#6366f1" fillOpacity={0.18} strokeWidth={2.5} dot={false} />
                <Tooltip formatter={(val) => (typeof val === 'number' ? val.toFixed(2) : '—')} />
              </RechartsRadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[270px] flex items-center justify-center text-xs text-gray-400">
              Sem autoavaliação registrada
            </div>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-center text-emerald-600 mb-2 uppercase tracking-wide">
            Avaliadores externos
          </p>
          {hasExternal ? (
            <ResponsiveContainer width="100%" height={270}>
              <RechartsRadarChart data={externalData} margin={{ top: 10, right: 28, bottom: 10, left: 28 }}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#6b7280' }} />
                <PolarRadiusAxis domain={[0, scaleMax]} tick={{ fontSize: 8, fill: '#9ca3af' }} tickCount={scaleMax + 1} />
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

// ─── GAP visual bar chart ─────────────────────────────────────────────────────

export function GapSection({
  snapshots,
  competencies,
  scaleId = 'likert_5',
}: {
  snapshots:    SnapshotRow[]
  competencies: CompetencyRow[]
  scaleId?:     string
}) {
  const scale = getScale(scaleId)

  const rows = competencies
    .map((c) => {
      const selfSnap = snapshots.find(
        (s) => s.competency_id === c.id && s.relationship_code === 'self'
      )
      const extSnaps = snapshots.filter(
        (s) => s.competency_id === c.id && s.relationship_code !== 'self' && s.score_avg != null
      )
      const selfScore = selfSnap?.score_avg ?? null
      const extAvg =
        extSnaps.length > 0
          ? extSnaps.reduce((sum, s) => sum + s.score_avg!, 0) / extSnaps.length
          : null
      const gap = selfScore != null && extAvg != null ? selfScore - extAvg : null
      return { id: c.id, name: c.name, selfScore, extAvg, gap }
    })
    .filter((r) => r.selfScore != null || r.extAvg != null)
    .sort((a, b) => {
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
      <p className="text-xs text-gray-400 mb-5">
        Diferença entre como você se avalia e como os outros te percebem, por competência.
        Ordenado por maior divergência.
      </p>

      <div className="space-y-4">
        {rows.map((r) => {
          const isBlindSpot      = r.gap != null && r.gap > 0.5
          const isHiddenStrength = r.gap != null && r.gap < -0.5

          const selfPct = r.selfScore != null ? (r.selfScore / scale.max) * 100 : 0
          const extPct  = r.extAvg    != null ? (r.extAvg    / scale.max) * 100 : 0

          const badgeCls = isBlindSpot
            ? 'bg-amber-100 text-amber-700 border-amber-200'
            : isHiddenStrength
            ? 'bg-blue-100 text-blue-700 border-blue-200'
            : r.gap != null
            ? 'bg-gray-100 text-gray-500 border-gray-200'
            : 'bg-gray-50 text-gray-300 border-gray-100'

          const gapInterpretation = isBlindSpot
            ? 'Ponto cego'
            : isHiddenStrength
            ? 'Força oculta'
            : r.gap != null
            ? 'Alinhado'
            : ''

          const gapEmoji = isBlindSpot ? '⚠️' : isHiddenStrength ? '💎' : r.gap != null ? '✓' : ''

          return (
            <div key={r.id} className="flex items-center gap-4">
              {/* Competency name */}
              <div className="w-44 shrink-0">
                <p className="text-sm font-medium text-gray-700 leading-tight">{r.name}</p>
              </div>

              {/* Double bar */}
              <div className="flex-1 space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-indigo-500 w-9 shrink-0">Auto</span>
                  <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-2.5 rounded-full bg-indigo-400 transition-all"
                      style={{ width: `${selfPct}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-indigo-600 w-8 text-right shrink-0">
                    {r.selfScore != null ? r.selfScore.toFixed(1) : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-emerald-600 w-9 shrink-0">Aval.</span>
                  <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-2.5 rounded-full bg-emerald-400 transition-all"
                      style={{ width: `${extPct}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-emerald-600 w-8 text-right shrink-0">
                    {r.extAvg != null ? r.extAvg.toFixed(1) : '—'}
                  </span>
                </div>
              </div>

              {/* GAP badge */}
              <div className="w-36 shrink-0 text-right">
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border ${badgeCls}`}>
                  <span>{gapEmoji}</span>
                  <span className="font-bold tabular-nums">
                    {r.gap != null ? (r.gap > 0 ? `+${r.gap.toFixed(2)}` : r.gap.toFixed(2)) : '—'}
                  </span>
                </span>
                {gapInterpretation && (
                  <p className="text-xs text-gray-400 mt-0.5">{gapInterpretation}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-3 mt-5 pt-4 border-t border-gray-50">
        <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg">
          <span>⚠️</span>
          <span><strong>Ponto cego</strong> — Auto &gt; Aval. em mais de 0,5 pontos</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg">
          <span>💎</span>
          <span><strong>Força oculta</strong> — Aval. &gt; Auto em mais de 0,5 pontos</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg">
          <span>✓</span>
          <span><strong>Alinhado</strong> — percepções convergentes</span>
        </div>
      </div>
    </div>
  )
}

// ─── Dimension breakdown — mini-radars per dimension ─────────────────────────

export function DimensionBreakdown({
  snapshots,
  competencies,
  scaleId = 'likert_5',
}: {
  snapshots:    SnapshotRow[]
  competencies: CompetencyRow[]
  scaleId?:     string
}) {
  const scale = getScale(scaleId)

  // Only render if at least some competencies have a dimension_code
  const hasDimensions = competencies.some((c) => c.dimension_code)
  if (!hasDimensions) return null

  // Group competencies by dimension_code (skip ones with null)
  const dimMap = new Map<string, CompetencyRow[]>()
  for (const c of competencies) {
    if (!c.dimension_code) continue
    if (!dimMap.has(c.dimension_code)) dimMap.set(c.dimension_code, [])
    dimMap.get(c.dimension_code)!.push(c)
  }
  if (dimMap.size === 0) return null

  const shorten = (name: string) => name.length > 18 ? name.slice(0, 16) + '…' : name

  // Which relationship groups have data in this dataset
  const activeRels = REL_ORDER.filter((rel) =>
    snapshots.some((s) => s.competency_id && s.score_avg != null && s.relationship_code === rel)
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 print-page-break">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
        Análise por dimensão
      </h2>
      <p className="text-xs text-gray-400 mb-5">
        Competências agrupadas pelas dimensões do modelo de liderança.
      </p>

      <div className="grid grid-cols-2 gap-5">
        {[...dimMap.entries()].map(([dim, comps]) => {
          // Build radar data for this dimension's competencies
          const radarData = comps.map((c) => {
            const row: Record<string, number | string> = { subject: shorten(c.name) }
            for (const rel of activeRels) {
              const snap = snapshots.find(
                (s) => s.competency_id === c.id && s.relationship_code === rel
              )
              row[rel] = snap?.score_avg ?? 0
            }
            return row
          })

          // Need at least 3 competencies for a meaningful radar
          if (radarData.length < 3) {
            // Fall back to a small score list
            return (
              <div key={dim} className="rounded-xl border border-gray-100 p-4">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3 text-center">
                  {dim}
                </p>
                <div className="space-y-2">
                  {comps.map((c) => {
                    const extSnaps = snapshots.filter(
                      (s) => s.competency_id === c.id && s.relationship_code !== 'self' && s.score_avg != null
                    )
                    const extAvg = extSnaps.length > 0
                      ? extSnaps.reduce((sum, s) => sum + s.score_avg!, 0) / extSnaps.length
                      : null
                    return (
                      <div key={c.id} className="flex justify-between items-center text-sm">
                        <span className="text-gray-600 truncate mr-3">{c.name}</span>
                        <span className={`font-semibold shrink-0 ${scoreColorClass(extAvg, scale)}`}>
                          {extAvg != null ? extAvg.toFixed(2) : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          }

          // Determine which rels actually have data for this dimension
          const relsWithData = activeRels.filter((rel) =>
            radarData.some((d) => (d[rel] as number) > 0)
          )

          return (
            <div key={dim} className="rounded-xl border border-gray-100 p-4">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 text-center">
                {dim}
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <RechartsRadarChart data={radarData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: '#6b7280' }} />
                  <PolarRadiusAxis
                    domain={[0, scale.max]}
                    tick={false}
                    axisLine={false}
                    tickCount={scale.max + 1}
                  />
                  {relsWithData.map((rel) => (
                    <Radar
                      key={rel}
                      name={REL_LABEL[rel] ?? rel}
                      dataKey={rel}
                      stroke={RADAR_PALETTE[rel] ?? '#94a3b8'}
                      fill={RADAR_PALETTE[rel] ?? '#94a3b8'}
                      fillOpacity={rel === 'self' ? 0.15 : 0.05}
                      strokeWidth={rel === 'self' ? 2.5 : 1.5}
                      dot={false}
                    />
                  ))}
                  {relsWithData.length > 1 && (
                    <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                  )}
                  <Tooltip
                    formatter={(val) =>
                      typeof val === 'number' && val > 0 ? val.toFixed(2) : '—'
                    }
                  />
                </RechartsRadarChart>
              </ResponsiveContainer>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Top 5 / Bottom 5 ────────────────────────────────────────────────────────

export function Top5Section({
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

// ─── Scores by relationship ───────────────────────────────────────────────────

function barBgClass(score: number | null, scale: ScaleDefinition): string {
  if (score == null) return 'bg-gray-200'
  const pct = scoreToPercent(score, scale)
  if (pct >= 80) return 'bg-green-500'
  if (pct >= 60) return 'bg-yellow-400'
  return 'bg-red-400'
}

export function SnapshotsByRelationship({
  snapshots,
  scaleId = 'likert_5',
}: {
  snapshots: SnapshotRow[]
  scaleId?:  string
}) {
  const scale = getScale(scaleId)
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
                  width: s.score_avg != null ? `${scoreToPercent(s.score_avg, scale)}%` : '0%',
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

// ─── Competency breakdown table ───────────────────────────────────────────────

export function CompetencyBreakdown({
  snapshots,
  competencies,
  scaleId = 'likert_5',
  questionScores = [],
}: {
  snapshots:      SnapshotRow[]
  competencies:   CompetencyRow[]
  scaleId?:       string
  questionScores?: QuestionScoreRow[]
}) {
  const scale    = getScale(scaleId)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const withComp = snapshots.filter((s) => s.competency_id && s.score_avg != null)
  if (withComp.length === 0) return null

  const compMap = new Map(competencies.map((c) => [c.id, c]))
  const byComp  = new Map<string, SnapshotRow[]>()
  for (const s of withComp) {
    if (!s.competency_id) continue
    if (!byComp.has(s.competency_id)) byComp.set(s.competency_id, [])
    byComp.get(s.competency_id)!.push(s)
  }
  const relationships = [
    ...new Set(withComp.map((s) => s.relationship_code)),
  ].sort((a, b) => REL_ORDER.indexOf(a) - REL_ORDER.indexOf(b))

  // Group question scores by competency then by question_id
  const qByComp = new Map<string, Map<string, QuestionScoreRow[]>>()
  for (const q of questionScores) {
    const cKey = q.competency_id ?? '__none__'
    if (!qByComp.has(cKey)) qByComp.set(cKey, new Map())
    const qMap = qByComp.get(cKey)!
    if (!qMap.has(q.question_id)) qMap.set(q.question_id, [])
    qMap.get(q.question_id)!.push(q)
  }

  function toggle(compId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(compId) ? next.delete(compId) : next.add(compId)
      return next
    })
  }

  const hasQuestions = questionScores.length > 0

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
              {hasQuestions && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {[...byComp.entries()].map(([compId, snaps]) => {
              const comp       = compMap.get(compId)
              const isExpanded = expanded.has(compId)
              const qMap       = qByComp.get(compId)
              const hasQ       = hasQuestions && qMap && qMap.size > 0

              // Sort questions by order_index
              const questionEntries = hasQ
                ? [...qMap!.entries()].sort((a, b) => {
                    const oa = a[1][0]?.order_index ?? 0
                    const ob = b[1][0]?.order_index ?? 0
                    return oa - ob
                  })
                : []

              return (
                <>
                  {/* Competency row */}
                  <tr
                    key={compId}
                    className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="py-3 pr-6 text-gray-700 font-medium">{comp?.name ?? '—'}</td>
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
                    {hasQuestions && (
                      <td className="py-3 pl-2">
                        {hasQ && (
                          <button
                            onClick={() => toggle(compId)}
                            className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors font-medium whitespace-nowrap"
                            title={isExpanded ? 'Ocultar questões' : 'Ver questões'}
                          >
                            {isExpanded ? '▲' : '▼'}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>

                  {/* Question drill-down rows */}
                  {isExpanded && questionEntries.map(([qId, qRows]) => {
                    const prompt = qRows[0]?.prompt ?? ''
                    return (
                      <tr key={qId} className="bg-indigo-50/40 border-b border-indigo-50">
                        <td className="py-2 pl-8 pr-6 text-xs text-gray-500 italic leading-snug">
                          {prompt}
                        </td>
                        {relationships.map((r) => {
                          const qRow = qRows.find((q) => q.relationship_code === r)
                          return (
                            <td key={r} className="py-2 px-4 text-center">
                              {qRow ? (
                                <span className={`text-xs font-semibold ${scoreColorClass(qRow.score_avg, scale)}`}>
                                  {qRow.score_avg.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-gray-200 text-xs">—</span>
                              )}
                            </td>
                          )
                        })}
                        {hasQuestions && <td />}
                      </tr>
                    )
                  })}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
      {hasQuestions && (
        <p className="text-xs text-gray-400 mt-3">
          Clique em ▼ para expandir o detalhamento por questão de cada competência.
        </p>
      )}
    </div>
  )
}

// ─── Comments section ─────────────────────────────────────────────────────────

export function CommentsSection({ comments }: { comments: CommentRow[] }) {
  const unique = [...new Map(comments.map((c) => [c.id, c])).values()]
  if (unique.length === 0) return null

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

export function InsightsPanel({ profile }: { profile: ProfileData }) {
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

// ─── Self-awareness index ─────────────────────────────────────────────────────

function calcSelfAwarenessIndex(
  snapshots:    SnapshotRow[],
  competencies: CompetencyRow[],
  scale:        ScaleDefinition,
): number | null {
  const gaps = competencies
    .map((c) => {
      const self = snapshots.find(
        (s) => s.competency_id === c.id && s.relationship_code === 'self'
      )?.score_avg
      const extSnaps = snapshots.filter(
        (s) => s.competency_id === c.id && s.relationship_code !== 'self' && s.score_avg != null
      )
      const ext =
        extSnaps.length > 0
          ? extSnaps.reduce((sum, s) => sum + s.score_avg!, 0) / extSnaps.length
          : null
      if (self == null || ext == null) return null
      return Math.abs(self - ext)
    })
    .filter((g): g is number => g != null)

  if (gaps.length === 0) return null
  const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length
  return Math.max(0, Math.round((1 - avgGap / scale.max) * 100))
}

export function SelfAwarenessIndex({
  snapshots,
  competencies,
  scaleId = 'likert_5',
}: {
  snapshots:    SnapshotRow[]
  competencies: CompetencyRow[]
  scaleId?:     string
}) {
  const scale = getScale(scaleId)
  const index = calcSelfAwarenessIndex(snapshots, competencies, scale)
  if (index == null) return null

  const colorBar  = index >= 85 ? 'bg-green-400'  : index >= 70 ? 'bg-yellow-400'  : 'bg-red-400'
  const colorText = index >= 85 ? 'text-green-600' : index >= 70 ? 'text-yellow-600' : 'text-red-500'
  const label =
    index >= 85 ? 'Percepção muito alinhada com os avaliadores'
    : index >= 70 ? 'Percepção moderadamente alinhada'
    : 'Divergência significativa — vale refletir sobre os gaps'

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Índice de Autoconhecimento
        </p>
        <span className={`text-xl font-bold tabular-nums ${colorText}`}>{index}%</span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-2.5 rounded-full transition-all ${colorBar}`}
          style={{ width: `${index}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 mt-1.5">{label}</p>
    </div>
  )
}

// ─── Score distribution section ───────────────────────────────────────────────

const DIST_COLORS = [
  'bg-red-400',    // 1
  'bg-orange-400', // 2
  'bg-yellow-400', // 3
  'bg-lime-400',   // 4
  'bg-green-500',  // 5
]

function mergeDistributions(distributions: (Record<string, number> | null | undefined)[]): Record<string, number> {
  const merged: Record<string, number> = {}
  for (const dist of distributions) {
    if (!dist) continue
    for (const [k, v] of Object.entries(dist)) {
      merged[k] = (merged[k] ?? 0) + v
    }
  }
  return merged
}

export function ScoreDistributionSection({
  snapshots,
  competencies,
  scaleId = 'likert_5',
}: {
  snapshots:    SnapshotRow[]
  competencies: CompetencyRow[]
  scaleId?:     string
}) {
  const scale = getScale(scaleId)
  const values = Array.from({ length: scale.max - scale.min + 1 }, (_, i) => scale.min + i)

  // Only external evaluators; only competencies that have distribution data
  const rows = competencies
    .map((c) => {
      const extSnaps = snapshots.filter(
        (s) =>
          s.competency_id === c.id &&
          s.relationship_code !== 'self' &&
          s.score_avg != null &&
          s.score_distribution
      )
      if (extSnaps.length === 0) return null
      const dist  = mergeDistributions(extSnaps.map((s) => s.score_distribution))
      const total = Object.values(dist).reduce((s, n) => s + n, 0)
      if (total === 0) return null
      return { id: c.id, name: c.name, dist, total }
    })
    .filter(Boolean) as { id: string; name: string; dist: Record<string, number>; total: number }[]

  if (rows.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
        Distribuição das respostas por competência
      </h2>
      <p className="text-xs text-gray-400 mb-4">
        Como os avaliadores externos distribuíram suas notas — revela consenso ou divergência.
      </p>

      {/* Legend */}
      <div className="flex gap-3 mb-5 flex-wrap">
        {values.map((v, i) => (
          <div key={v} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`inline-block w-3 h-3 rounded-sm ${DIST_COLORS[i] ?? 'bg-gray-300'}`} />
            <span>{v} — {scale.labels.find((l) => l.value === v)?.short ?? v}</span>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3">
            <p className="text-sm text-gray-700 w-44 shrink-0 truncate">{r.name}</p>
            <div className="flex-1 flex h-3.5 rounded-full overflow-hidden gap-px bg-gray-100">
              {values.map((v, i) => {
                const count = r.dist[v.toString()] ?? 0
                const pct   = (count / r.total) * 100
                if (pct === 0) return null
                return (
                  <div
                    key={v}
                    className={`h-full ${DIST_COLORS[i] ?? 'bg-gray-300'} transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${v}: ${count} resposta${count !== 1 ? 's' : ''} (${pct.toFixed(0)}%)`}
                  />
                )
              })}
            </div>
            <span className="text-xs text-gray-400 w-20 text-right shrink-0">
              {r.total} resp.
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Cycle benchmark section ──────────────────────────────────────────────────

export function BenchmarkSection({
  snapshots,
  competencies,
  benchmark,
  scaleId = 'likert_5',
}: {
  snapshots:    SnapshotRow[]
  competencies: CompetencyRow[]
  benchmark:    BenchmarkMap
  scaleId?:     string
}) {
  const scale = getScale(scaleId)

  // For each competency: person's external avg vs. cycle avg
  const rows = competencies
    .map((c) => {
      const bmKey   = c.id
      const bmEntry = benchmark[bmKey]
      if (!bmEntry) return null

      const extSnaps = snapshots.filter(
        (s) => s.competency_id === c.id && s.relationship_code !== 'self' && s.score_avg != null
      )
      const myAvg =
        extSnaps.length > 0
          ? extSnaps.reduce((sum, s) => sum + s.score_avg!, 0) / extSnaps.length
          : null

      if (myAvg == null) return null

      const delta       = myAvg - bmEntry.score_avg
      const absDelta    = Math.abs(delta)
      const myPct       = (myAvg / scale.max) * 100
      const cyclePct    = (bmEntry.score_avg / scale.max) * 100

      return {
        id: c.id, name: c.name,
        myAvg, cycleAvg: bmEntry.score_avg,
        participantCount: bmEntry.participant_count,
        delta, absDelta, myPct, cyclePct,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b!.absDelta - a!.absDelta) as {
      id: string; name: string
      myAvg: number; cycleAvg: number; participantCount: number
      delta: number; absDelta: number; myPct: number; cyclePct: number
    }[]

  if (rows.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
        Comparativo com a média do ciclo
      </h2>
      <p className="text-xs text-gray-400 mb-5">
        Sua média (avaliadores externos) versus a média geral de todos os participantes do ciclo.
        Ordenado pela maior diferença.
      </p>

      <div className="space-y-4">
        {rows.map((r) => {
          const isAbove = r.delta > 0.15
          const isBelow = r.delta < -0.15
          const deltaCls = isAbove
            ? 'bg-green-100 text-green-700 border-green-200'
            : isBelow
            ? 'bg-red-100 text-red-700 border-red-200'
            : 'bg-gray-100 text-gray-500 border-gray-200'
          const deltaLabel = isAbove ? '▲' : isBelow ? '▼' : '≈'

          return (
            <div key={r.id} className="flex items-center gap-4">
              {/* Name */}
              <div className="w-44 shrink-0">
                <p className="text-sm font-medium text-gray-700 truncate">{r.name}</p>
              </div>

              {/* Dual bar */}
              <div className="flex-1 space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-indigo-500 w-9 shrink-0">Você</span>
                  <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-2.5 rounded-full bg-indigo-400 transition-all"
                      style={{ width: `${r.myPct}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-indigo-600 w-8 text-right shrink-0">
                    {r.myAvg.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-400 w-9 shrink-0">Ciclo</span>
                  <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-2.5 rounded-full bg-gray-300 transition-all"
                      style={{ width: `${r.cyclePct}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-gray-500 w-8 text-right shrink-0">
                    {r.cycleAvg.toFixed(1)}
                  </span>
                </div>
              </div>

              {/* Delta badge */}
              <div className="w-28 shrink-0 text-right">
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg border ${deltaCls}`}>
                  <span>{deltaLabel}</span>
                  <span className="tabular-nums">
                    {r.delta > 0 ? `+${r.delta.toFixed(2)}` : r.delta.toFixed(2)}
                  </span>
                </span>
                <p className="text-xs text-gray-400 mt-0.5">
                  {r.participantCount} participantes
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 mt-5 pt-4 border-t border-gray-50">
        ▲ acima da média do ciclo &nbsp;·&nbsp; ▼ abaixo da média &nbsp;·&nbsp; ≈ alinhado com o grupo
      </p>
    </div>
  )
}

// ─── ReportDisplay — main layout used by both pages ──────────────────────────

export interface ReportDisplayProps {
  snapshots:        SnapshotRow[]
  competencies:     CompetencyRow[]
  comments:         CommentRow[]
  profile:          ProfileData
  scaleId:          string
  benchmark?:       BenchmarkMap
  questionScores?:  QuestionScoreRow[]
  evaluatorWeights?: Record<string, number>
}

function MethodologyBanner({ evaluatorWeights }: { evaluatorWeights: Record<string, number> }) {
  const active = Object.entries(evaluatorWeights).filter(([, w]) => w > 0)
  if (active.length === 0) return null
  const total = active.reduce((s, [, w]) => s + w, 0)
  const parts = active
    .sort((a, b) => REL_ORDER.indexOf(a[0]) - REL_ORDER.indexOf(b[0]))
    .map(([code, w]) => `${REL_SHORT[code] ?? code} ${Math.round((w / total) * 100)}%`)
    .join(' · ')
  return (
    <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-3 flex items-center gap-3">
      <span className="text-indigo-500 text-base shrink-0">⚖️</span>
      <div>
        <p className="text-xs font-semibold text-indigo-700">Metodologia de ponderação</p>
        <p className="text-xs text-indigo-600 mt-0.5">{parts}</p>
      </div>
    </div>
  )
}

export function ReportDisplay({
  snapshots,
  competencies,
  comments,
  profile,
  scaleId,
  benchmark,
  questionScores = [],
  evaluatorWeights,
}: ReportDisplayProps) {
  const hasCompetencies   = competencies.length > 0
  const hasBenchmark      = benchmark != null && Object.keys(benchmark).length > 0
  const hasWeights        = evaluatorWeights != null && Object.keys(evaluatorWeights).length > 0

  return (
    <div className="space-y-5">
      {/* 0. Metodologia de ponderação (se houver pesos) */}
      {hasWeights && <MethodologyBanner evaluatorWeights={evaluatorWeights!} />}

      {/* 1. Participation summary */}
      <ParticipationPanel snapshots={snapshots} />

      {/* 2. Overall scores + self-awareness index */}
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
        {profile.overall_score == null && (
          <p className="text-xs text-gray-400 mt-4 text-center">
            Perfil criado mas sem scores calculados. Verifique se as questões têm competências vinculadas.
          </p>
        )}
        {/* Self-awareness index — only when we have competency-level self + external data */}
        {hasCompetencies && (
          <SelfAwarenessIndex snapshots={snapshots} competencies={competencies} scaleId={scaleId} />
        )}
      </div>

      {/* 3. Insights */}
      <InsightsPanel profile={profile} />

      {/* 4. Dual radar */}
      {hasCompetencies && (
        <DualRadarSection snapshots={snapshots} competencies={competencies} scaleId={scaleId} />
      )}

      {/* 5. Dimension breakdown — mini-radars per dimension (conditional) */}
      {hasCompetencies && (
        <DimensionBreakdown snapshots={snapshots} competencies={competencies} scaleId={scaleId} />
      )}

      {/* 6. GAP visual bars */}
      {hasCompetencies && (
        <GapSection snapshots={snapshots} competencies={competencies} scaleId={scaleId} />
      )}

      {/* 7. Top 5 / Bottom 5 */}
      {hasCompetencies && (
        <Top5Section snapshots={snapshots} competencies={competencies} scaleId={scaleId} />
      )}

      {/* 8. Benchmark — participant vs. cycle avg (conditional on data) */}
      {hasCompetencies && hasBenchmark && (
        <BenchmarkSection
          snapshots={snapshots}
          competencies={competencies}
          benchmark={benchmark!}
          scaleId={scaleId}
        />
      )}

      {/* 9. Scores by relationship */}
      <SnapshotsByRelationship snapshots={snapshots} scaleId={scaleId} />

      {/* 10. Score distribution */}
      {hasCompetencies && (
        <ScoreDistributionSection snapshots={snapshots} competencies={competencies} scaleId={scaleId} />
      )}

      {/* 11. Competency breakdown with question drill-down */}
      {hasCompetencies && (
        <CompetencyBreakdown
          snapshots={snapshots}
          competencies={competencies}
          scaleId={scaleId}
          questionScores={questionScores}
        />
      )}

      {/* 12. Comments */}
      {comments.length > 0 && <CommentsSection comments={comments} />}

      {/* 13. Confidentiality notice */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4">
        <p className="text-xs text-blue-700 leading-relaxed">
          <strong>Privacidade e anonimato:</strong> Os resultados são apresentados de forma
          agregada. Scores de grupos com menos de 3 avaliadores não são exibidos individualmente
          para preservar a confidencialidade dos avaliadores.
        </p>
      </div>
    </div>
  )
}
