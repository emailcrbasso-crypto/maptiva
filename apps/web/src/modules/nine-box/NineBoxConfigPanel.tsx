/**
 * NineBoxConfigPanel
 *
 * Configuração do Nine Box por ciclo: ativação, fonte de cada eixo
 * (Desempenho × Potencial) e thresholds das 3 faixas.
 *
 * Default de produto: Potencial = score do 360 (overall); Desempenho = manual.
 */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  type NineBoxConfig,
  type AxisSource,
  normalizeConfig,
  AXIS_SOURCE_LABEL,
} from '@/lib/nineBox'

interface CompetencyRow { id: string; name: string }

const SOURCES: AxisSource[] = ['overall', 'derived', 'manual']

export function NineBoxConfigPanel({
  cycleId,
  onSaved,
}: {
  cycleId: string
  onSaved?: (cfg: NineBoxConfig) => void
}) {
  const [cfg,          setCfg]          = useState<NineBoxConfig | null>(null)
  const [competencies, setCompetencies] = useState<CompetencyRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [success,      setSuccess]      = useState(false)
  const [open,         setOpen]         = useState(false)

  // ── Load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data } = await supabase.rpc('get_nine_box_config', { p_cycle_id: cycleId })
      const normalized = normalizeConfig((data ?? {}) as Record<string, unknown>)
      setCfg(normalized)
      if (!normalized.enabled) setOpen(true)

      // Competências do ciclo (mesma lógica do painel de pesos)
      const { data: snapData } = await supabase
        .from('score_snapshots')
        .select('competency_id')
        .eq('cycle_id', cycleId)
        .not('competency_id', 'is', null)
      const compIds = [...new Set((snapData ?? []).map((s: { competency_id: string }) => s.competency_id))]

      if (compIds.length === 0) {
        const { data: cycleRow } = await supabase
          .from('cycles').select('template_id').eq('id', cycleId).single()
        if (cycleRow?.template_id) {
          const { data: compData } = await supabase
            .from('competencies').select('id, name').eq('template_id', cycleRow.template_id)
          setCompetencies((compData ?? []) as CompetencyRow[])
        }
      } else {
        const { data: compData } = await supabase
          .from('competencies').select('id, name').in('id', compIds)
        setCompetencies((compData ?? []) as CompetencyRow[])
      }
      setLoading(false)
    }
    load()
  }, [cycleId])

  function patch(p: Partial<NineBoxConfig>) {
    setCfg((c) => (c ? { ...c, ...p } : c))
  }

  async function handleSave() {
    if (!cfg) return
    setSaving(true)
    const { data, error } = await supabase.rpc('set_nine_box_config', {
      p_cycle_id: cycleId,
      p_config: {
        enabled:             cfg.enabled,
        perf_label:          cfg.perf_label,
        perf_source:         cfg.perf_source,
        perf_competency_ids: cfg.perf_competency_ids,
        perf_low_max:        cfg.perf_low_max,
        perf_high_min:       cfg.perf_high_min,
        pot_label:           cfg.pot_label,
        pot_source:          cfg.pot_source,
        pot_competency_ids:  cfg.pot_competency_ids,
        pot_low_max:         cfg.pot_low_max,
        pot_high_min:        cfg.pot_high_min,
      },
    })
    if (error) {
      alert(`Erro ao salvar configuração: ${error.message}`)
    } else {
      const saved = normalizeConfig((data ?? {}) as Record<string, unknown>)
      setCfg(saved)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      onSaved?.(saved)
    }
    setSaving(false)
  }

  if (loading || !cfg) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-base">⚙️</span>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900">Configuração do Nine Box</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {cfg.enabled
                ? `${cfg.pot_label} = ${AXIS_SOURCE_LABEL[cfg.pot_source]} · ${cfg.perf_label} = ${AXIS_SOURCE_LABEL[cfg.perf_source]}`
                : 'Desativado — configure os eixos para ativar'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {cfg.enabled && (
            <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">
              ✓ Ativo
            </span>
          )}
          <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-5 space-y-6">
          {/* Ativação */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={cfg.enabled}
              onChange={(e) => patch({ enabled: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-300"
            />
            <span className="text-sm text-gray-800">
              Ativar Nine Box para este ciclo
            </span>
          </label>

          {/* Eixo Potencial */}
          <AxisEditor
            title="Eixo Vertical — Potencial"
            label={cfg.pot_label}
            source={cfg.pot_source}
            competencyIds={cfg.pot_competency_ids}
            lowMax={cfg.pot_low_max}
            highMin={cfg.pot_high_min}
            competencies={competencies}
            onChange={(p) => patch({
              pot_label:          p.label          ?? cfg.pot_label,
              pot_source:         p.source         ?? cfg.pot_source,
              pot_competency_ids: p.competencyIds  ?? cfg.pot_competency_ids,
              pot_low_max:        p.lowMax         ?? cfg.pot_low_max,
              pot_high_min:       p.highMin        ?? cfg.pot_high_min,
            })}
          />

          {/* Eixo Desempenho */}
          <AxisEditor
            title="Eixo Horizontal — Desempenho"
            label={cfg.perf_label}
            source={cfg.perf_source}
            competencyIds={cfg.perf_competency_ids}
            lowMax={cfg.perf_low_max}
            highMin={cfg.perf_high_min}
            competencies={competencies}
            onChange={(p) => patch({
              perf_label:          p.label         ?? cfg.perf_label,
              perf_source:         p.source        ?? cfg.perf_source,
              perf_competency_ids: p.competencyIds ?? cfg.perf_competency_ids,
              perf_low_max:        p.lowMax        ?? cfg.perf_low_max,
              perf_high_min:       p.highMin       ?? cfg.perf_high_min,
            })}
          />

          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Salvando…' : 'Salvar configuração'}
            </button>
            {success && <span className="text-sm text-green-600">✓ Salvo</span>}
            <p className="text-xs text-gray-400 ml-auto">
              Após salvar, use <strong>"Recalcular posições"</strong> no grid.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-editor de um eixo ─────────────────────────────────────────────

interface AxisPatch {
  label?: string
  source?: AxisSource
  competencyIds?: string[]
  lowMax?: number
  highMin?: number
}

function AxisEditor({
  title, label, source, competencyIds, lowMax, highMin, competencies, onChange,
}: {
  title: string
  label: string
  source: AxisSource
  competencyIds: string[]
  lowMax: number
  highMin: number
  competencies: CompetencyRow[]
  onChange: (p: AxisPatch) => void
}) {
  function toggleComp(id: string) {
    const next = competencyIds.includes(id)
      ? competencyIds.filter((x) => x !== id)
      : [...competencyIds, id]
    onChange({ competencyIds: next })
  }

  return (
    <div className="rounded-lg border border-gray-100 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-gray-500 w-20">Rótulo</label>
        <input
          type="text"
          value={label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-44 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <label className="text-xs text-gray-500">Fonte</label>
        <select
          value={source}
          onChange={(e) => onChange({ source: e.target.value as AxisSource })}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          {SOURCES.map((s) => (
            <option key={s} value={s}>{AXIS_SOURCE_LABEL[s]}</option>
          ))}
        </select>
      </div>

      {/* Seleção de competências quando derivado */}
      {source === 'derived' && (
        <div>
          <p className="text-xs text-gray-500 mb-2">
            Competências que compõem este eixo (média das selecionadas):
          </p>
          {competencies.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhuma competência disponível ainda.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {competencies.map((c) => {
                const on = competencyIds.includes(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleComp(c.id)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      on
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {on ? '✓ ' : ''}{c.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {source === 'manual' && (
        <p className="text-xs text-gray-400">
          Os valores deste eixo serão digitados por participante no grid (ex.: nota de
          metas/resultados fora do 360).
        </p>
      )}

      {/* Thresholds */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <span className="text-xs text-gray-500 w-20">Faixas</span>
        <span className="text-xs text-gray-400">Baixo &lt;</span>
        <input
          type="number" step={0.1} min={0} value={lowMax}
          onChange={(e) => onChange({ lowMax: parseFloat(e.target.value) || 0 })}
          className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <span className="text-xs text-gray-400">≤ Médio &lt;</span>
        <input
          type="number" step={0.1} min={0} value={highMin}
          onChange={(e) => onChange({ highMin: parseFloat(e.target.value) || 0 })}
          className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <span className="text-xs text-gray-400">≤ Alto</span>
      </div>
    </div>
  )
}
