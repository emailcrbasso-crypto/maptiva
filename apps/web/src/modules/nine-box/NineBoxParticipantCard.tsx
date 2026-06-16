/**
 * NineBoxParticipantCard — cartão individual (drawer lateral) do colaborador.
 *
 * Visão interna (admin/RH): posição atual, valores dos eixos, leitura de
 * desenvolvimento associada à célula e trajetória entre ciclos.
 * Não é exposto ao avaliado.
 */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  type NineBoxConfig,
  type NineBoxParticipant,
  type NineBoxHistoryEntry,
  cellFor,
  BAND_LABEL,
} from '@/lib/nineBox'

export function NineBoxParticipantCard({
  cycleId, participant, config, onClose, onResetCalibration, onStartCalibration,
}: {
  cycleId: string
  participant: NineBoxParticipant
  config: NineBoxConfig
  onClose: () => void
  onResetCalibration: (cpId: string) => void
  onStartCalibration: (cpId: string) => void
}) {
  const [history, setHistory] = useState<NineBoxHistoryEntry[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  useEffect(() => {
    let active = true
    setLoadingHistory(true)
    supabase
      .rpc('get_participant_nine_box_history', {
        p_cycle_id: cycleId,
        p_cp_id:    participant.cycle_participant_id,
      })
      .then(({ data }) => {
        if (!active) return
        setHistory(Array.isArray(data) ? (data as NineBoxHistoryEntry[]) : [])
        setLoadingHistory(false)
      })
    return () => { active = false }
  }, [cycleId, participant.cycle_participant_id])

  const cell = cellFor(participant.pot_band, participant.perf_band)
  const fmt = (v: number | null) => (v == null ? '—' : v.toFixed(2))

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />
      {/* Drawer */}
      <aside className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-xl z-50 overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{participant.person_name}</h2>
              <p className="text-sm text-gray-400">
                {participant.job_title || '—'}
                {participant.department ? ` · ${participant.department}` : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 text-xl leading-none"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>

          {/* Posição atual */}
          {cell ? (
            <div className={`rounded-lg border ${cell.border} ${cell.bg} p-4 mb-4`}>
              <div className="flex items-center justify-between">
                <p className="text-base font-semibold text-gray-800">{cell.title}</p>
                {participant.calibrated && (
                  <span className="text-xs bg-white/70 text-gray-600 px-2 py-0.5 rounded-full">
                    ✎ calibrado
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{cell.desc}</p>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 mb-4">
              <p className="text-sm text-gray-500">Sem posição calculada (faltam valores de eixo).</p>
            </div>
          )}

          {/* Valores dos eixos */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <AxisStat
              label={config.pot_label}
              value={fmt(participant.pot_value)}
              band={participant.pot_band}
            />
            <AxisStat
              label={config.perf_label}
              value={fmt(participant.perf_value)}
              band={participant.perf_band}
            />
          </div>

          {/* Leitura de desenvolvimento */}
          {cell && (
            <div className="mb-5">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Leitura de desenvolvimento
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">{cell.development}</p>
            </div>
          )}

          {/* Notas de calibração */}
          {participant.notes && (
            <div className="mb-5">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Notas de calibração
              </h3>
              <p className="text-sm text-gray-700">{participant.notes}</p>
            </div>
          )}

          {/* Trajetória entre ciclos */}
          <div className="mb-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Trajetória
            </h3>
            {loadingHistory ? (
              <p className="text-xs text-gray-400 animate-pulse">Carregando…</p>
            ) : history.length <= 1 ? (
              <p className="text-xs text-gray-400">
                Primeiro ciclo com Nine Box para esta pessoa — sem histórico anterior ainda.
              </p>
            ) : (
              <ol className="space-y-2">
                {history.map((h) => {
                  const hc = cellFor(h.pot_band, h.perf_band)
                  return (
                    <li
                      key={h.cycle_id}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                        h.is_current ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{h.cycle_name}</p>
                        <p className="text-xs text-gray-400">
                          {h.cycle_at ? new Date(h.cycle_at).toLocaleDateString('pt-BR') : ''}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-gray-600 shrink-0">
                        {hc ? hc.title : '—'}
                      </span>
                      {h.is_current && (
                        <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded shrink-0">
                          atual
                        </span>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </div>

          {/* Ações */}
          <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={() => onStartCalibration(participant.cycle_participant_id)}
              className="text-sm px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors self-start"
            >
              ✎ Calibrar (mover de célula)
            </button>
            {participant.calibrated && (
              <button
                onClick={() => onResetCalibration(participant.cycle_participant_id)}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors self-start"
              >
                ↺ Remover calibração (voltar à posição automática)
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}

function AxisStat({
  label, value, band,
}: {
  label: string
  value: string
  band: number | null
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-xl font-semibold text-gray-900 mt-0.5">{value}</p>
      {band ? (
        <p className="text-xs text-gray-500 mt-0.5">{BAND_LABEL[band as 1 | 2 | 3]}</p>
      ) : null}
    </div>
  )
}
