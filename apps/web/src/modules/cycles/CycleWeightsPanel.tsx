/**
 * CycleWeightsPanel
 *
 * Painel de configuração de pesos de avaliação por ciclo.
 * Permite definir pesos por tipo de avaliador e por competência.
 *
 * - Sem pesos configurados → compute_scores usa média simples (comportamento padrão)
 * - Com pesos de avaliador → tipos fora da lista têm peso 0 (self excluído por padrão)
 * - Pesos são relativos: 2+1 = 66% e 33%
 */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EvaluatorWeight {
  relationship_code: string
  weight: number
}

interface CompetencyWeight {
  competency_id: string
  weight: number
}

interface CycleWeights {
  evaluator_weights:  EvaluatorWeight[]
  competency_weights: CompetencyWeight[]
}

interface CompetencyRow {
  id:   string
  name: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REL_ROWS: { code: string; label: string }[] = [
  { code: 'self',        label: 'Autoavaliação' },
  { code: 'manager',     label: 'Gestor' },
  { code: 'peer',        label: 'Pares' },
  { code: 'subordinate', label: 'Subordinados' },
  { code: 'client',      label: 'Clientes' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Converte pesos relativos para percentuais exibíveis.
 * Usa o método do maior resto para garantir que a soma seja sempre 100%.
 * Ex: [2, 1, 1, 1, 0.5] → { gestor:'36%', auto:'18%', ... } sempre soma 100.
 */
function toPct(weights: { code: string; weight: number }[]): Record<string, string> {
  const active = weights.filter((w) => w.weight > 0)
  const total  = active.reduce((s, w) => s + w.weight, 0)

  if (total === 0) {
    return Object.fromEntries(weights.map((w) => [w.code, '0%']))
  }

  // Calcula o valor exato e o piso de cada item
  const items = active.map((w) => {
    const exact = (w.weight / total) * 100
    return { code: w.code, exact, floor: Math.floor(exact), remainder: exact - Math.floor(exact) }
  })

  // Quanto falta para chegar em 100 após somar os pisos
  const sumFloors = items.reduce((s, i) => s + i.floor, 0)
  let remaining   = 100 - sumFloors

  // Distribui o restante para os itens de maior fração (maior resto)
  items
    .sort((a, b) => b.remainder - a.remainder)
    .forEach((item) => {
      if (remaining > 0) { item.floor += 1; remaining-- }
    })

  // Monta o mapa final (itens com peso 0 ficam como '0%')
  const result: Record<string, string> = {}
  for (const w of weights) {
    const item = items.find((i) => i.code === w.code)
    result[w.code] = item ? `${item.floor}%` : '0%'
  }
  return result
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CycleWeightsPanel({
  cycleId,
}: {
  cycleId:     string
  cycleStatus?: string
}) {
  // ── State ────────────────────────────────────────────────────────────────
  const [evWeights,   setEvWeights]   = useState<EvaluatorWeight[]>([])
  const [compWeights, setCompWeights] = useState<CompetencyWeight[]>([])
  const [competencies, setCompetencies] = useState<CompetencyRow[]>([])

  const [evDraft,   setEvDraft]   = useState<Record<string, number>>({})
  const [compDraft, setCompDraft] = useState<Record<string, number>>({})

  const [loading,      setLoading]      = useState(true)
  const [savingEv,     setSavingEv]     = useState(false)
  const [savingComp,   setSavingComp]   = useState(false)
  const [successEv,    setSuccessEv]    = useState(false)
  const [successComp,  setSuccessComp]  = useState(false)
  const [open,         setOpen]         = useState(false)

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      // Fetch configured weights
      const { data: wData } = await supabase.rpc('get_cycle_weights', {
        p_cycle_id: cycleId,
      })
      const w = (wData ?? {}) as CycleWeights

      setEvWeights(w.evaluator_weights  ?? [])
      setCompWeights(w.competency_weights ?? [])

      // Initialize drafts from saved values
      const evMap: Record<string, number> = {}
      for (const row of (w.evaluator_weights ?? [])) {
        evMap[row.relationship_code] = row.weight
      }
      setEvDraft(evMap)

      const compMap: Record<string, number> = {}
      for (const row of (w.competency_weights ?? [])) {
        compMap[row.competency_id] = row.weight
      }
      setCompDraft(compMap)

      // Fetch competencies used in this cycle
      const { data: snapData } = await supabase
        .from('score_snapshots')
        .select('competency_id')
        .eq('cycle_id', cycleId)
        .not('competency_id', 'is', null)

      const compIds = [...new Set((snapData ?? []).map((s: { competency_id: string }) => s.competency_id))]

      if (compIds.length === 0) {
        // Fallback: try templates → questions
        const { data: cycleRow } = await supabase
          .from('cycles')
          .select('template_id')
          .eq('id', cycleId)
          .single()
        if (cycleRow?.template_id) {
          const { data: compData } = await supabase
            .from('competencies')
            .select('id, name')
            .eq('template_id', cycleRow.template_id)
          setCompetencies((compData ?? []) as CompetencyRow[])
        }
      } else {
        const { data: compData } = await supabase
          .from('competencies')
          .select('id, name')
          .in('id', compIds)
        setCompetencies((compData ?? []) as CompetencyRow[])
      }

      setLoading(false)
    }
    load()
  }, [cycleId])

  // ── Save evaluator weights ────────────────────────────────────────────────
  async function handleSaveEv() {
    setSavingEv(true)
    const payload = Object.entries(evDraft)
      .filter(([, w]) => w > 0)
      .map(([relationship_code, weight]) => ({ relationship_code, weight }))

    const { error } = await supabase.rpc('set_cycle_weights', {
      p_cycle_id:           cycleId,
      p_evaluator_weights:  payload,
      p_competency_weights: compWeights.length > 0 ? compWeights : [],
    })

    if (error) {
      alert(`Erro ao salvar pesos: ${error.message}`)
    } else {
      setEvWeights(payload)
      setSuccessEv(true)
      setTimeout(() => setSuccessEv(false), 3000)
    }
    setSavingEv(false)
  }

  // ── Save competency weights ───────────────────────────────────────────────
  async function handleSaveComp() {
    setSavingComp(true)
    const payload = Object.entries(compDraft)
      .filter(([, w]) => w > 0)
      .map(([competency_id, weight]) => ({ competency_id, weight }))

    const { error } = await supabase.rpc('set_cycle_weights', {
      p_cycle_id:           cycleId,
      p_evaluator_weights:  evWeights.length > 0 ? evWeights : [],
      p_competency_weights: payload,
    })

    if (error) {
      alert(`Erro ao salvar pesos: ${error.message}`)
    } else {
      setCompWeights(payload)
      setSuccessComp(true)
      setTimeout(() => setSuccessComp(false), 3000)
    }
    setSavingComp(false)
  }

  // ── Clear all weights ─────────────────────────────────────────────────────
  async function handleClearAll() {
    if (!confirm('Remover todos os pesos configurados? O ciclo voltará a usar média simples.')) return
    const { error } = await supabase.rpc('set_cycle_weights', {
      p_cycle_id:           cycleId,
      p_evaluator_weights:  [],
      p_competency_weights: [],
    })
    if (error) {
      alert(`Erro: ${error.message}`)
      return
    }
    setEvWeights([])
    setCompWeights([])
    setEvDraft({})
    setCompDraft({})
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const hasEvWeights   = evWeights.length > 0
  const hasCompWeights = compWeights.length > 0
  const hasAnyWeights  = hasEvWeights || hasCompWeights

  const evDraftRows = REL_ROWS.map((r) => ({
    ...r,
    weight: evDraft[r.code] ?? 0,
  }))
  const evPcts = toPct(evDraftRows)

  if (loading) return null

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-base">⚖️</span>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900">Pesos de avaliação</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {hasAnyWeights
                ? `Pesos configurados${hasEvWeights ? ' por avaliador' : ''}${hasEvWeights && hasCompWeights ? ' e' : ''}${hasCompWeights ? ' por competência' : ''}`
                : 'Usando média simples (sem pesos configurados)'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasAnyWeights && (
            <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">
              ✓ Configurado
            </span>
          )}
          <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Body — collapsible */}
      {open && (
        <div className="border-t border-gray-100 px-5 py-5 space-y-7">

          {/* ── Pesos por avaliador ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Pesos por tipo de avaliador</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Pesos são relativos — 2 e 1 equivalem a 66% e 33%. Peso 0 = excluído do overall.
                </p>
              </div>
              {hasEvWeights && (
                <span className="text-xs bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full font-medium">
                  Ativo
                </span>
              )}
            </div>

            <div className="space-y-2">
              {evDraftRows.map((row) => (
                <div key={row.code} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-32 shrink-0">{row.label}</span>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={evDraft[row.code] ?? 0}
                    onChange={(e) => {
                      const v = Math.max(0, parseFloat(e.target.value) || 0)
                      setEvDraft((prev) => ({ ...prev, [row.code]: v }))
                    }}
                    className="w-24 text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-indigo-400 transition-all"
                      style={{
                        width: evPcts[row.code] ?? '0%',
                      }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-10 text-right">
                    {evPcts[row.code] ?? '0%'}
                  </span>
                  {(evDraft[row.code] ?? 0) === 0 && (
                    <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded">excluído</span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={handleSaveEv}
                disabled={savingEv}
                className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {savingEv ? 'Salvando…' : 'Salvar pesos de avaliadores'}
              </button>
              {successEv && (
                <span className="text-sm text-green-600">✓ Salvo</span>
              )}
              {hasEvWeights && (
                <button
                  onClick={() => {
                    setEvDraft({})
                    setEvWeights([])
                    supabase.rpc('set_cycle_weights', {
                      p_cycle_id:           cycleId,
                      p_evaluator_weights:  [],
                      p_competency_weights: compWeights,
                    })
                  }}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-auto"
                >
                  Remover pesos de avaliadores
                </button>
              )}
            </div>
          </div>

          {/* ── Pesos por competência ── */}
          {competencies.length > 0 && (
            <div className="pt-5 border-t border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">Pesos por competência</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Competências sem peso configurado recebem peso 1 (neutro). Peso mínimo: 0.1.
                  </p>
                </div>
                {hasCompWeights && (
                  <span className="text-xs bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full font-medium">
                    Ativo
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {competencies.map((c) => {
                  const saved    = compWeights.find((cw) => cw.competency_id === c.id)?.weight ?? null
                  const current  = compDraft[c.id] ?? saved ?? 1
                  const isDirty  = compDraft[c.id] !== undefined && compDraft[c.id] !== (saved ?? 1)
                  return (
                    <div key={c.id} className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 flex-1 truncate">{c.name}</span>
                      <input
                        type="number"
                        min={0.1}
                        max={10}
                        step={0.1}
                        value={current}
                        onChange={(e) => {
                          const v = Math.max(0.1, parseFloat(e.target.value) || 1)
                          setCompDraft((prev) => ({ ...prev, [c.id]: v }))
                        }}
                        className={`w-24 text-sm border rounded-lg px-3 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
                          isDirty ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'
                        }`}
                      />
                      {saved !== null && (
                        <span className="text-xs text-gray-400 w-16 text-right">
                          salvo: {saved}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={handleSaveComp}
                  disabled={savingComp}
                  className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {savingComp ? 'Salvando…' : 'Salvar pesos de competências'}
                </button>
                {successComp && (
                  <span className="text-sm text-green-600">✓ Salvo</span>
                )}
                {hasCompWeights && (
                  <button
                    onClick={() => {
                      setCompDraft({})
                      setCompWeights([])
                      supabase.rpc('set_cycle_weights', {
                        p_cycle_id:           cycleId,
                        p_evaluator_weights:  evWeights,
                        p_competency_weights: [],
                      })
                    }}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-auto"
                  >
                    Remover pesos de competências
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Footer ── */}
          {hasAnyWeights && (
            <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                ⚠️ Após alterar pesos, use o botão <strong>"Recalcular scores"</strong> no relatório do ciclo para aplicar as mudanças.
              </p>
              <button
                onClick={handleClearAll}
                className="text-xs text-red-400 hover:text-red-600 transition-colors shrink-0 ml-4"
              >
                Remover todos os pesos
              </button>
            </div>
          )}

          {!hasAnyWeights && (
            <div className="pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Sem pesos configurados, o overall score usa a média simples de todos os grupos de avaliadores com igual peso.
                Configure pesos acima e clique em <strong>"Recalcular scores"</strong> para aplicar.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
