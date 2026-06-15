/**
 * NineBoxPage — Grid de talent review (Nine Box) por ciclo.
 * Rota: /cycles/:id/nine-box  (admin/owner)
 *
 * Fluxo:
 *   1. Configurar eixos (NineBoxConfigPanel)
 *   2. (se algum eixo for manual) digitar valores por participante
 *   3. Recalcular posições → compute_nine_box
 *   4. Visualizar grid 3×3 e calibrar (mover de célula)
 */

import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { NineBoxConfigPanel } from './NineBoxConfigPanel'
import {
  type NineBoxConfig,
  type NineBoxParticipant,
  type Band,
  normalizeConfig,
  NINE_BOX_CELLS,
  POT_BANDS_TOP_DOWN,
  PERF_BANDS_LEFT_RIGHT,
  BAND_LABEL,
} from '@/lib/nineBox'

export function NineBoxPage() {
  const { id } = useParams<{ id: string }>()

  const [cycleName,  setCycleName]  = useState('')
  const [cfg,        setCfg]        = useState<NineBoxConfig | null>(null)
  const [grid,       setGrid]       = useState<NineBoxParticipant[]>([])
  const [loading,    setLoading]    = useState(true)
  const [computing,  setComputing]  = useState(false)
  const [selected,   setSelected]   = useState<string | null>(null)
  const [manualDraft, setManualDraft] = useState<Record<string, { perf?: number; pot?: number }>>({})
  const [savingManual, setSavingManual] = useState(false)

  const loadGrid = useCallback(async () => {
    if (!id) return
    const { data } = await supabase.rpc('get_nine_box_grid', { p_cycle_id: id })
    setGrid(Array.isArray(data) ? (data as NineBoxParticipant[]) : [])
  }, [id])

  useEffect(() => {
    if (!id) return
    async function load() {
      const { data: cycleRow } = await supabase
        .from('cycles').select('name').eq('id', id).single()
      setCycleName(cycleRow?.name ?? '')

      const { data: cfgData } = await supabase.rpc('get_nine_box_config', { p_cycle_id: id })
      setCfg(normalizeConfig((cfgData ?? {}) as Record<string, unknown>))

      await loadGrid()
      setLoading(false)
    }
    load()
  }, [id, loadGrid])

  async function handleCompute() {
    if (!id) return
    setComputing(true)
    const { error } = await supabase.rpc('compute_nine_box', { p_cycle_id: id })
    if (error) {
      alert(
        error.message.includes('nine_box_not_configured')
          ? 'Configure e salve os eixos antes de recalcular.'
          : `Erro ao recalcular: ${error.message}`,
      )
    } else {
      await loadGrid()
    }
    setComputing(false)
  }

  async function handleCalibrate(cpId: string, potBand: Band, perfBand: Band) {
    if (!id) return
    const { error } = await supabase.rpc('calibrate_participant', {
      p_cycle_id: id, p_cp_id: cpId,
      p_perf_band: perfBand, p_pot_band: potBand, p_notes: null,
    })
    if (error) { alert(`Erro ao calibrar: ${error.message}`); return }
    setSelected(null)
    await loadGrid()
  }

  async function handleResetCalibration(cpId: string) {
    if (!id) return
    const { error } = await supabase.rpc('calibrate_participant', {
      p_cycle_id: id, p_cp_id: cpId,
      p_perf_band: 0, p_pot_band: 0, p_notes: null,
    })
    if (error) { alert(`Erro: ${error.message}`); return }
    await loadGrid()
  }

  async function handleSaveManual() {
    if (!id) return
    setSavingManual(true)
    const entries = Object.entries(manualDraft)
    for (const [cpId, vals] of entries) {
      await supabase.rpc('set_participant_nine_box_manual', {
        p_cycle_id: id, p_cp_id: cpId,
        p_perf_manual: vals.perf ?? null,
        p_pot_manual:  vals.pot  ?? null,
      })
    }
    setManualDraft({})
    await handleCompute()
    setSavingManual(false)
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <p className="text-gray-400 text-sm animate-pulse">Carregando Nine Box…</p>
      </div>
    )
  }

  const perfManual = cfg?.perf_source === 'manual'
  const potManual  = cfg?.pot_source  === 'manual'
  const needsManual = perfManual || potManual

  const positioned   = grid.filter((p) => p.pot_band && p.perf_band)
  const unpositioned = grid.filter((p) => !p.pot_band || !p.perf_band)

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link to={`/cycles/${id}`} className="text-sm text-gray-400 hover:text-gray-600">
          ← Voltar ao ciclo
        </Link>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Nine Box</h1>
            <p className="text-sm text-gray-400 mt-0.5">{cycleName}</p>
          </div>
          <button
            onClick={handleCompute}
            disabled={computing}
            className="text-sm px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors disabled:opacity-50"
          >
            {computing ? '⏳ Recalculando…' : '🔄 Recalcular posições'}
          </button>
        </div>
      </div>

      {/* Config */}
      {id && (
        <NineBoxConfigPanel
          cycleId={id}
          onSaved={(c) => setCfg(c)}
        />
      )}

      {!cfg?.enabled ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-3xl mb-4">🎯</p>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Nine Box desativado</h2>
          <p className="text-sm text-gray-500">
            Ative o Nine Box e configure os eixos no painel acima para começar.
          </p>
        </div>
      ) : (
        <>
          {/* Entrada manual */}
          {needsManual && (
            <ManualEntry
              grid={grid}
              perfManual={perfManual}
              potManual={potManual}
              perfLabel={cfg.perf_label}
              potLabel={cfg.pot_label}
              draft={manualDraft}
              setDraft={setManualDraft}
              saving={savingManual}
              onSave={handleSaveManual}
            />
          )}

          {/* Grid 3×3 */}
          {grid.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <p className="text-sm text-gray-500">
                Nenhuma posição calculada ainda. Clique em <strong>"Recalcular posições"</strong>.
              </p>
            </div>
          ) : (
            <NineBoxGrid
              perfLabel={cfg.perf_label}
              potLabel={cfg.pot_label}
              positioned={positioned}
              selected={selected}
              onSelect={(cpId) => setSelected((s) => (s === cpId ? null : cpId))}
              onMoveToCell={handleCalibrate}
              onResetCalibration={handleResetCalibration}
            />
          )}

          {/* Não posicionados */}
          {unpositioned.length > 0 && (
            <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">
                Não posicionados ({unpositioned.length})
              </h3>
              <p className="text-xs text-gray-400 mb-3">
                Faltam valores para um dos eixos
                {needsManual ? ' (preencha a entrada manual e recalcule)' : ''}.
              </p>
              <div className="flex flex-wrap gap-2">
                {unpositioned.map((p) => (
                  <span key={p.cycle_participant_id}
                    className="text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">
                    {p.person_name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Grid 3×3 ──────────────────────────────────────────────────────────

function NineBoxGrid({
  perfLabel, potLabel, positioned, selected, onSelect, onMoveToCell, onResetCalibration,
}: {
  perfLabel: string
  potLabel: string
  positioned: NineBoxParticipant[]
  selected: string | null
  onSelect: (cpId: string) => void
  onMoveToCell: (cpId: string, pot: Band, perf: Band) => void
  onResetCalibration: (cpId: string) => void
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {selected && (
        <div className="mb-4 text-xs bg-indigo-50 text-indigo-700 px-3 py-2 rounded-lg">
          Pessoa selecionada — clique em uma célula para movê-la (calibração manual).
        </div>
      )}
      <div className="flex">
        {/* Eixo Y label */}
        <div className="flex items-center justify-center w-8 shrink-0">
          <span className="text-xs font-medium text-gray-500 -rotate-90 whitespace-nowrap">
            {potLabel} →
          </span>
        </div>

        <div className="flex-1">
          {/* Linhas: potencial alto no topo */}
          {POT_BANDS_TOP_DOWN.map((pot) => (
            <div key={pot} className="grid grid-cols-3 gap-2 mb-2">
              {PERF_BANDS_LEFT_RIGHT.map((perf) => {
                const meta = NINE_BOX_CELLS[`${pot}-${perf}`]
                const people = positioned.filter(
                  (p) => p.pot_band === pot && p.perf_band === perf,
                )
                return (
                  <div
                    key={perf}
                    onClick={() => {
                      if (selected) onMoveToCell(selected, pot as Band, perf as Band)
                    }}
                    className={`min-h-28 rounded-lg border ${meta.bg} ${meta.border} p-2 ${
                      selected ? 'cursor-pointer hover:ring-2 hover:ring-indigo-300' : ''
                    }`}
                  >
                    <p className="text-[11px] font-semibold text-gray-700">{meta.title}</p>
                    <p className="text-[10px] text-gray-400 leading-tight mb-1.5">{meta.desc}</p>
                    <div className="flex flex-wrap gap-1">
                      {people.map((p) => (
                        <button
                          key={p.cycle_participant_id}
                          onClick={(e) => { e.stopPropagation(); onSelect(p.cycle_participant_id) }}
                          title={p.calibrated ? 'Posição calibrada manualmente' : undefined}
                          className={`text-[11px] px-2 py-0.5 rounded-full border transition-all ${
                            selected === p.cycle_participant_id
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white/80 text-gray-700 border-gray-200 hover:border-indigo-300'
                          }`}
                        >
                          {p.calibrated ? '✎ ' : ''}{p.person_name}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          {/* Eixo X labels */}
          <div className="grid grid-cols-3 gap-2 mt-1">
            {PERF_BANDS_LEFT_RIGHT.map((perf) => (
              <div key={perf} className="text-center text-[10px] text-gray-400">
                {BAND_LABEL[perf as Band]}
              </div>
            ))}
          </div>
          <p className="text-center text-xs font-medium text-gray-500 mt-1">{perfLabel} →</p>
        </div>
      </div>

      {/* Reset calibração da pessoa selecionada */}
      {selected && (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => onResetCalibration(selected)}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            ↺ Remover calibração (voltar à posição automática)
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Entrada manual de eixo ────────────────────────────────────────────

function ManualEntry({
  grid, perfManual, potManual, perfLabel, potLabel, draft, setDraft, saving, onSave,
}: {
  grid: NineBoxParticipant[]
  perfManual: boolean
  potManual: boolean
  perfLabel: string
  potLabel: string
  draft: Record<string, { perf?: number; pot?: number }>
  setDraft: React.Dispatch<React.SetStateAction<Record<string, { perf?: number; pot?: number }>>>
  saving: boolean
  onSave: () => void
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <h3 className="text-sm font-semibold text-gray-800 mb-1">Valores manuais</h3>
      <p className="text-xs text-gray-400 mb-4">
        Digite os valores dos eixos manuais por participante. Ao salvar, as posições são recalculadas.
      </p>
      <div className="space-y-2">
        {grid.map((p) => (
          <div key={p.cycle_participant_id} className="flex items-center gap-3">
            <span className="text-sm text-gray-700 flex-1 truncate">{p.person_name}</span>
            {potManual && (
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-400">{potLabel}</label>
                <input
                  type="number" step={0.1} min={0}
                  defaultValue={p.pot_manual ?? undefined}
                  onChange={(e) => {
                    const v = e.target.value === '' ? undefined : parseFloat(e.target.value)
                    setDraft((d) => ({ ...d, [p.cycle_participant_id]: { ...d[p.cycle_participant_id], pot: v } }))
                  }}
                  className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            )}
            {perfManual && (
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-400">{perfLabel}</label>
                <input
                  type="number" step={0.1} min={0}
                  defaultValue={p.perf_manual ?? undefined}
                  onChange={(e) => {
                    const v = e.target.value === '' ? undefined : parseFloat(e.target.value)
                    setDraft((d) => ({ ...d, [p.cycle_participant_id]: { ...d[p.cycle_participant_id], perf: v } }))
                  }}
                  className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={onSave}
          disabled={saving || Object.keys(draft).length === 0}
          className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Salvando…' : 'Salvar valores e recalcular'}
        </button>
      </div>
    </div>
  )
}
