/**
 * SegmentFilters — barra de filtros e de agrupamento dos resultados de uma
 * pesquisa segmentada (empresa, base, área, perfil). A lógica (opções, mínimo
 * de respondentes, regra de um perfil por vez) vive em lib/segments.
 */

import { useMemo } from 'react'
import {
  segmentOptions,
  perfilBloqueado,
  type SegmentDef,
  type SegmentFilters as Filters,
  type SegmentRow,
} from '@/lib/segments'

interface Props {
  defs:      SegmentDef[]
  /** Todas as linhas (antes de filtrar): as opções saem delas. */
  rows:      SegmentRow[]
  filtros:   Filters
  onChange:  (next: Filters) => void
  agrupar:   string
  onAgrupar: (id: string) => void
  nMin:      number
  /** Respondentes dentro do recorte atual. */
  exibindo:  number
}

export function SegmentFilters({ defs, rows, filtros, onChange, agrupar, onAgrupar, nMin, exibindo }: Props) {
  const opcoes = useMemo(
    () => Object.fromEntries(defs.map((d) => [d.id, segmentOptions(rows, defs, filtros, d, nMin)])),
    [defs, rows, filtros, nMin],
  )
  const ativos = defs.filter((d) => filtros[d.id]).length

  function set(id: string, valor: string) {
    const next = { ...filtros }
    if (valor) next[id] = valor
    else delete next[id]
    // Mudar um filtro pode tornar inválido outro que dependia dele (ex.: empresa → área).
    for (const d of defs) {
      if (d.id === id || !next[d.id]) continue
      const ainda = segmentOptions(rows, defs, next, d, nMin).some((o) => o.valor === next[d.id])
      if (!ainda) delete next[d.id]
    }
    onChange(next)
  }

  const select = 'text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {defs.map((d) => {
          const bloqueado = perfilBloqueado(defs, filtros, d)
          return (
            <label key={d.id} className="flex flex-col gap-1 text-xs text-gray-500">
              {d.label}
              <select
                value={filtros[d.id] ?? ''}
                onChange={(e) => set(d.id, e.target.value)}
                disabled={bloqueado}
                title={bloqueado ? 'Só um filtro de perfil pessoal por vez, para proteger o anonimato' : undefined}
                className={select}
              >
                <option value="">Todos</option>
                {(opcoes[d.id] ?? []).map((o) => (
                  <option key={o.valor} value={o.valor}>{o.valor} ({o.n.toLocaleString('pt-BR')})</option>
                ))}
              </select>
            </label>
          )
        })}

        <label className="flex flex-col gap-1 text-xs text-gray-500">
          Ver resultados por
          <select value={agrupar} onChange={(e) => onAgrupar(e.target.value)} className={select}>
            {defs.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>

        {ativos > 0 && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="text-xs text-gray-500 hover:text-gray-800 underline pb-2"
          >
            Limpar filtros
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400">
        {ativos > 0
          ? `Recorte com ${exibindo.toLocaleString('pt-BR')} respondentes. `
          : `${exibindo.toLocaleString('pt-BR')} respondentes. `}
        Grupos com menos de {nMin} respondentes não são exibidos, para proteger o anonimato.
        Só aparecem valores de filtro que atingem esse mínimo.
      </p>
    </div>
  )
}
