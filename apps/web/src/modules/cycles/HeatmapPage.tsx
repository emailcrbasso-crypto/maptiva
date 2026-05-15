/**
 * HeatmapPage — Heatmap Executivo
 *
 * Rota: /cycles/:id/heatmap
 *
 * Cruza departamentos (linhas) × competências (colunas).
 * Cada célula mostra a média das avaliações externas
 * (manager + peer + subordinate) para os participantes
 * daquele departamento naquela competência.
 *
 * Cor: vermelho (baixo) → amarelo → verde (alto) numa escala 0-5.
 */

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/modules/auth/TenantContext'
import * as XLSX from 'xlsx'
import { exportHeatmapPdf } from '@/lib/exportHeatmapPdf'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SnapshotRow {
  cycle_participant_id: string
  competency_id:        string | null
  relationship_code:    string
  score_avg:            number | null
  visibility_status:    string
}

interface CompetencyRow {
  id:   string
  name: string
}

interface CpPeopleRow {
  cp_id:      string
  department: string | null
}

// ─── Color scale 0–5 ─────────────────────────────────────────────────────────

/**
 * Returns a hex color interpolated between red(0) → yellow(3) → green(5).
 * Uses HSL for smooth gradient.
 */
function heatColor(value: number | null): string {
  if (value == null) return '#f3f4f6' // gray-100 = no data
  // Clamp 0–5
  const v = Math.max(0, Math.min(5, value))
  // Map to hue: 0 → 0° (red), 5 → 120° (green)
  const hue = (v / 5) * 120
  const sat  = v < 0.5 ? 30 : 65
  const lig  = 40
  return `hsl(${hue},${sat}%,${lig}%)`
}

function textColor(value: number | null): string {
  if (value == null) return '#9ca3af'
  const v = Math.max(0, Math.min(5, value))
  return v >= 2 ? '#ffffff' : '#374151'
}

// ─── Export ───────────────────────────────────────────────────────────────────

function exportHeatmapExcel(
  cycleName: string,
  departments: string[],
  competencies: CompetencyRow[],
  cellValues: Map<string, Map<string, number | null>>
) {
  const headers = ['Departamento', ...competencies.map((c) => c.name)]
  const rows = departments.map((dept) => {
    const compMap = cellValues.get(dept)
    return [
      dept,
      ...competencies.map((c) => {
        const v = compMap?.get(c.id)
        return v != null ? Number(v.toFixed(2)) : null
      }),
    ]
  })

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = [{ wch: 24 }, ...competencies.map(() => ({ wch: 14 }))]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Heatmap')

  const safe = cycleName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')
  XLSX.writeFile(wb, `Heatmap_${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function HeatmapPage() {
  const { id }       = useParams<{ id: string }>()
  const { branding } = useTenant()

  const [cycleName,    setCycleName]    = useState('')
  const [snapshots,    setSnapshots]    = useState<SnapshotRow[]>([])
  const [competencies, setCompetencies] = useState<CompetencyRow[]>([])
  const [cpPeople,     setCpPeople]     = useState<CpPeopleRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)

  // Filter state
  const [filterRel, setFilterRel] = useState<'external' | 'all'>('external')

  useEffect(() => {
    if (!id) return
    async function load() {
      const [cycleRes, snapRes, cpRes] = await Promise.all([
        supabase.from('cycles').select('name').eq('id', id).single(),
        supabase
          .from('score_snapshots')
          .select('cycle_participant_id, competency_id, relationship_code, score_avg, visibility_status')
          .eq('cycle_id', id)
          .eq('visibility_status', 'visible'),
        supabase
          .from('cycle_participants')
          .select('id, people!person_id(department)')
          .eq('cycle_id', id),
      ])

      if (cycleRes.error) { setError(cycleRes.error.message); setLoading(false); return }
      setCycleName((cycleRes.data as { name: string }).name)

      const snapRows = (snapRes.data ?? []) as SnapshotRow[]
      setSnapshots(snapRows)

      // Build cp → department map
      // PostgREST returns the related object as an array for many-to-one; cast through unknown.
      const cpRows = (cpRes.data ?? []) as unknown as Array<{
        id: string
        people: { department: string | null } | null
      }>
      setCpPeople(
        cpRows.map((row) => ({
          cp_id:      row.id,
          department: row.people?.department ?? null,
        }))
      )

      // Load competency names
      const compIds = [
        ...new Set(snapRows.map((s) => s.competency_id).filter(Boolean) as string[]),
      ]
      if (compIds.length > 0) {
        const { data: compData } = await supabase
          .from('competencies')
          .select('id, name')
          .in('id', compIds)
          .order('name')
        setCompetencies((compData ?? []) as CompetencyRow[])
      }

      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <p className="text-gray-400 text-sm">Carregando heatmap...</p>
  if (error)   return <p className="text-red-500 text-sm">{error}</p>

  if (competencies.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <Link to={`/cycles/${id}/report`} className="text-sm text-gray-400 hover:text-gray-600">
          ← Relatório geral
        </Link>
        <div className="mt-8 bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-3xl mb-4">📊</p>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Sem dados de competências</h2>
          <p className="text-sm text-gray-500">
            Nenhuma competência com scores calculados. Verifique se o ciclo foi fechado
            e se as questões estão vinculadas a competências.
          </p>
        </div>
      </div>
    )
  }

  // ── Build cell values ────────────────────────────────────────────────────

  const cpMap = new Map(cpPeople.map((p) => [p.cp_id, p.department ?? 'Sem departamento']))

  // Filter relationships
  const EXTERNAL_RELS = ['manager', 'peer', 'subordinate', 'client']
  const relevantSnaps = snapshots.filter(
    (s) =>
      s.competency_id &&
      (filterRel === 'external'
        ? EXTERNAL_RELS.includes(s.relationship_code)
        : true)
  )

  // Group: dept → compId → [score_avg values]
  const accumulator = new Map<string, Map<string, number[]>>()
  for (const snap of relevantSnaps) {
    if (!snap.competency_id || snap.score_avg == null) continue
    const dept = cpMap.get(snap.cycle_participant_id) ?? 'Sem departamento'
    if (!accumulator.has(dept)) accumulator.set(dept, new Map())
    const compAcc = accumulator.get(dept)!
    if (!compAcc.has(snap.competency_id)) compAcc.set(snap.competency_id, [])
    compAcc.get(snap.competency_id)!.push(snap.score_avg)
  }

  // Average: dept → compId → avg
  const cellValues = new Map<string, Map<string, number | null>>()
  for (const [dept, compAccMap] of accumulator.entries()) {
    const compAvgMap = new Map<string, number | null>()
    for (const [compId, vals] of compAccMap.entries()) {
      compAvgMap.set(compId, vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null)
    }
    cellValues.set(dept, compAvgMap)
  }

  const departments = [...accumulator.keys()].sort((a, b) => {
    if (a === 'Sem departamento') return 1
    if (b === 'Sem departamento') return -1
    return a.localeCompare(b)
  })

  // Overall averages per competency (for the footer row)
  const compOverall = new Map<string, number | null>()
  for (const comp of competencies) {
    const allVals = departments
      .map((d) => cellValues.get(d)?.get(comp.id) ?? null)
      .filter((v): v is number => v != null)
    compOverall.set(comp.id, allVals.length > 0 ? allVals.reduce((s, v) => s + v, 0) / allVals.length : null)
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* ── Header ── */}
      <div className="mb-6">
        <Link to={`/cycles/${id}/report`} className="text-sm text-gray-400 hover:text-gray-600">
          ← Relatório geral
        </Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{cycleName}</h1>
            <p className="text-sm text-gray-400 mt-0.5">Heatmap executivo — Departamentos × Competências</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Relationship filter */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              <button
                onClick={() => setFilterRel('external')}
                className={`px-3 py-1.5 transition-colors ${
                  filterRel === 'external'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Externo
              </button>
              <button
                onClick={() => setFilterRel('all')}
                className={`px-3 py-1.5 transition-colors ${
                  filterRel === 'all'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Todos
              </button>
            </div>
            <button
              onClick={() => exportHeatmapExcel(cycleName, departments, competencies, cellValues)}
              className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ↓ Excel
            </button>
            <button
              onClick={async () => {
                setExportingPdf(true)
                await exportHeatmapPdf(
                  cycleName,
                  departments,
                  competencies,
                  cellValues,
                  compOverall,
                  filterRel,
                  {
                    companyName:  branding.name,
                    logoUrl:      branding.logoUrl,
                    primaryColor: branding.primaryColor,
                    footerText:   branding.pdfFooterText,
                    hideMaptiva:  branding.hideMaptiva,
                  },
                )
                setExportingPdf(false)
              }}
              disabled={exportingPdf}
              className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {exportingPdf ? 'Gerando...' : '↓ PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Heatmap table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            {/* Header row — competencies */}
            <thead>
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium border-b border-gray-200 bg-gray-50 min-w-[180px] sticky left-0 z-10">
                  Departamento
                </th>
                {competencies.map((c) => (
                  <th
                    key={c.id}
                    className="px-3 py-3 text-gray-500 font-medium border-b border-gray-200 bg-gray-50 text-center min-w-[100px] max-w-[130px]"
                    title={c.name}
                  >
                    <span className="block truncate max-w-[120px]">
                      {c.name.length > 16 ? c.name.slice(0, 14) + '…' : c.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {departments.map((dept) => {
                const compAvgMap = cellValues.get(dept)
                return (
                  <tr key={dept} className="border-b border-gray-100 last:border-0">
                    {/* Department label */}
                    <td className="px-4 py-3 font-medium text-gray-800 bg-white sticky left-0 z-10 border-r border-gray-100">
                      {dept}
                    </td>

                    {/* Competency cells */}
                    {competencies.map((c) => {
                      const val = compAvgMap?.get(c.id) ?? null
                      return (
                        <td
                          key={c.id}
                          className="text-center py-3 px-3 border-r border-gray-100 last:border-0"
                          style={{ backgroundColor: heatColor(val) }}
                          title={val != null ? `${dept} — ${c.name}: ${val.toFixed(2)}` : 'Sem dados'}
                        >
                          <span
                            className="font-semibold text-xs"
                            style={{ color: textColor(val) }}
                          >
                            {val != null ? val.toFixed(2) : '—'}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}

              {/* Footer: overall average per competency */}
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td className="px-4 py-3 font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10 border-r border-gray-200">
                  Média geral
                </td>
                {competencies.map((c) => {
                  const val = compOverall.get(c.id) ?? null
                  return (
                    <td
                      key={c.id}
                      className="text-center py-3 px-3 border-r border-gray-200 last:border-0"
                    >
                      <span className={`font-bold text-xs ${
                        val == null ? 'text-gray-300'
                        : val >= 4  ? 'text-green-700'
                        : val >= 3  ? 'text-yellow-700'
                        : 'text-red-600'
                      }`}>
                        {val != null ? val.toFixed(2) : '—'}
                      </span>
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Color scale legend ── */}
      <div className="mt-4 flex items-center gap-3">
        <span className="text-xs text-gray-500">Escala de cores:</span>
        <div className="flex h-4 flex-1 max-w-xs rounded overflow-hidden">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 h-full"
              style={{ backgroundColor: heatColor((i / 19) * 5) }}
            />
          ))}
        </div>
        <span className="text-xs text-gray-400">0.0</span>
        <span className="text-xs text-gray-400">→</span>
        <span className="text-xs text-gray-400">5.0</span>
        <span className="text-xs text-gray-400 ml-2">
          Baseado em: {filterRel === 'external' ? 'avaliações externas (gestor + pares + subordinados)' : 'todas as perspectivas'}
        </span>
      </div>

      {/* ── Footer note ── */}
      <p className="mt-3 text-xs text-gray-400">
        Células em cinza indicam dados insuficientes (n-mínimo não atingido ou sem avaliações para esse grupo).
      </p>
    </div>
  )
}
