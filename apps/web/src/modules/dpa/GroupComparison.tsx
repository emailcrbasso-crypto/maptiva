/**
 * GroupComparison — navegação por grupos dos resultados: trilha (caminho onde
 * a pessoa está), seletor da dimensão comparada (empresa, base, área) e tabela
 * comparativa clicável. Clicar em um grupo entra nele; a trilha permite voltar.
 * A lógica (mínimo de respondentes, cálculo por grupo) vive em lib/segments.
 */

import { fmtPct } from '@/lib/insights'
import {
  type GroupComparisonResult,
  type SegmentDef,
  type SegmentFilters,
} from '@/lib/segments'

export interface ParticipationInfo {
  respondidos: number
  total:       number
}

interface Props {
  /** Dimensões de atributo do participante (empresa, base, área), na ordem de navegação. */
  dimensoes:  SegmentDef[]
  /** Dimensão que está sendo comparada agora. */
  atual:      SegmentDef | null
  filtros:    SegmentFilters
  resultado:  GroupComparisonResult | null
  /** Participação por grupo (opcional: depende da função de agregados no banco). */
  participacao?: Map<string, ParticipationInfo> | null
  nMin:       number
  rotuloRaiz: string
  /** Esconde a trilha (quando a página já a mostra no topo). */
  semTrilha?: boolean
  /** Notas que contam como favoráveis, para o texto da legenda (ex.: 'notas 5 e 6'). */
  textoFavoravel?: string
  onTrocarDimensao: (id: string) => void
  onEntrar:         (def: SegmentDef, valor: string) => void
  onSair:           (id: string) => void
  onLimpar:         () => void
}

function cellColor(pct: number | null): string {
  if (pct === null) return 'bg-gray-50 text-gray-300'
  if (pct >= 70) return 'bg-green-100 text-green-800'
  if (pct >= 50) return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-800'
}

export function Trilha({ dimensoes, filtros, rotuloRaiz, onSair, onLimpar }: {
  dimensoes:  SegmentDef[]
  filtros:    SegmentFilters
  rotuloRaiz: string
  onSair:     (id: string) => void
  onLimpar:   () => void
}) {
  const ativos = dimensoes.filter((d) => filtros[d.id])
  return (
      <nav aria-label="Recorte atual" className="flex flex-wrap items-center gap-1.5 text-sm">
        <button
          type="button"
          onClick={onLimpar}
          disabled={ativos.length === 0}
          className={ativos.length === 0 ? 'font-semibold text-gray-900 cursor-default' : 'text-gray-500 hover:text-gray-900 underline'}
        >
          {rotuloRaiz}
        </button>
        {ativos.map((d) => (
          <span key={d.id} className="flex items-center gap-1.5">
            <span className="text-gray-300" aria-hidden="true">›</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-900 text-white pl-3 pr-1.5 py-0.5 text-xs">
              <span className="opacity-70">{d.label}:</span> {filtros[d.id]}
              <button
                type="button"
                onClick={() => onSair(d.id)}
                aria-label={`Remover filtro ${d.label}`}
                className="ml-1 rounded-full w-4 h-4 leading-none text-[11px] hover:bg-white/20"
              >
                ×
              </button>
            </span>
          </span>
        ))}
      </nav>
  )
}

export function GroupComparison({
  dimensoes, atual, filtros, resultado, participacao, nMin, rotuloRaiz, semTrilha, textoFavoravel = 'notas 4 e 5',
  onTrocarDimensao, onEntrar, onSair, onLimpar,
}: Props) {
  const disponiveis = dimensoes.filter((d) => !filtros[d.id])

  return (
    <div id="sec-comparativo" className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 scroll-mt-16">
      {!semTrilha && (
        <Trilha dimensoes={dimensoes} filtros={filtros} rotuloRaiz={rotuloRaiz} onSair={onSair} onLimpar={onLimpar} />
      )}

      {/* Dimensão comparada */}
      {disponiveis.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-gray-500">Comparar por</span>
          <div role="tablist" aria-label="Comparar por" className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
            {disponiveis.map((d) => (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={atual?.id === d.id}
                onClick={() => onTrocarDimensao(d.id)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  atual?.id === d.id ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400">Clique em uma linha para ver só aquele grupo.</span>
        </div>
      ) : (
        <p className="text-xs text-gray-500">
          Você chegou ao nível mais detalhado. Use a trilha acima para voltar a um nível anterior.
        </p>
      )}

      {/* Tabela */}
      {atual && resultado && (
        resultado.grupos.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nenhum grupo de {atual.label.toLowerCase()} tem pelo menos {nMin} respondentes neste recorte.
          </p>
        ) : (
          <>
          <ul className="md:hidden divide-y divide-gray-100 border border-gray-100 rounded-lg">
            <li className="flex items-center gap-3 px-3 py-3 bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{resultado.total.grupo}</p>
                <p className="text-xs text-gray-500">{resultado.total.n.toLocaleString('pt-BR')} respondentes</p>
              </div>
              <span className={`text-sm font-semibold rounded px-2 py-1 ${cellColor(resultado.total.geral)}`}>{fmtPct(resultado.total.geral)}%</span>
            </li>
            {resultado.grupos.map((g) => {
              const part = participacao?.get(g.grupo)
              const pct = part && part.total > 0 ? Math.round((part.respondidos / part.total) * 100) : null
              return (
                <li key={g.grupo}>
                  <button
                    type="button"
                    onClick={() => onEntrar(atual, g.grupo)}
                    className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-gray-50 active:bg-gray-100"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{g.grupo}</p>
                      <p className="text-xs text-gray-500">
                        {g.n.toLocaleString('pt-BR')} respondentes{pct !== null ? ` · participação ${fmtPct(pct)}%` : ''}
                      </p>
                    </div>
                    <span className={`text-sm font-semibold rounded px-2 py-1 ${cellColor(g.geral)}`}>{fmtPct(g.geral)}%</span>
                    <span className="text-gray-300" aria-hidden="true">›</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="hidden md:block overflow-x-auto -mx-1">
            <table className="text-xs border-separate border-spacing-y-1 border-spacing-x-1 min-w-full">
              <thead>
                <tr>
                  <th className="text-left font-medium text-gray-500 px-2 py-1 sticky left-0 bg-white min-w-[170px]">{atual.label}</th>
                  <th className="font-medium text-gray-500 px-1 py-1 min-w-[88px]">Respondentes</th>
                  {participacao && <th className="font-medium text-gray-500 px-1 py-1 min-w-[64px]">Participação</th>}
                  <th className="font-semibold text-gray-700 px-1 py-1 min-w-[64px]">Geral</th>
                  {resultado.blocos.map((b) => (
                    <th key={b} className="font-medium text-gray-500 px-1 py-1 align-bottom min-w-[76px]" title={b}>
                      <span className="block leading-tight">{b}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Linha de referência: o recorte inteiro */}
                <tr className="font-semibold">
                  <td className="px-2 py-1.5 sticky left-0 bg-white text-gray-900">{resultado.total.grupo}</td>
                  <td className="text-center tabular-nums text-gray-700">{resultado.total.n.toLocaleString('pt-BR')}</td>
                  {participacao && <td />}
                  <td className={`text-center rounded px-1 py-1.5 ${cellColor(resultado.total.geral)}`}>{fmtPct(resultado.total.geral)}%</td>
                  {resultado.blocos.map((b) => (
                    <td key={b} className={`text-center rounded px-1 py-1.5 ${cellColor(resultado.total.blocos[b] ?? null)}`}>
                      {resultado.total.blocos[b] != null ? `${fmtPct(resultado.total.blocos[b])}%` : '–'}
                    </td>
                  ))}
                </tr>
                {resultado.grupos.map((g) => {
                  const part = participacao?.get(g.grupo)
                  const pct = part && part.total > 0 ? Math.round((part.respondidos / part.total) * 100) : null
                  return (
                    <tr
                      key={g.grupo}
                      tabIndex={0}
                      role="button"
                      aria-label={`Ver só ${atual.label}: ${g.grupo}`}
                      onClick={() => onEntrar(atual, g.grupo)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEntrar(atual, g.grupo) } }}
                      className="cursor-pointer group"
                    >
                      <td className="px-2 py-1.5 sticky left-0 bg-white text-gray-800 group-hover:text-gray-900 group-hover:font-medium whitespace-nowrap">
                        {g.grupo} <span className="text-gray-300 group-hover:text-gray-500" aria-hidden="true">›</span>
                      </td>
                      <td className="text-center tabular-nums text-gray-600">{g.n.toLocaleString('pt-BR')}</td>
                      {participacao && (
                        <td className="text-center tabular-nums text-gray-600">{pct !== null ? `${fmtPct(pct)}%` : '–'}</td>
                      )}
                      <td className={`text-center font-semibold rounded px-1 py-1.5 ${cellColor(g.geral)}`}>{fmtPct(g.geral)}%</td>
                      {resultado.blocos.map((b) => (
                        <td key={b} className={`text-center font-semibold rounded px-1 py-1.5 ${cellColor(g.blocos[b] ?? null)}`}>
                          {g.blocos[b] != null ? `${fmtPct(g.blocos[b])}%` : '–'}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="text-[11px] text-gray-400 mt-2 px-1">
              % de respostas favoráveis ({textoFavoravel}). Verde 70% ou mais, amarelo de 50% a 69%, vermelho abaixo de 50%.
              {resultado.omitidos > 0 && ` ${resultado.omitidos} ${resultado.omitidos > 1 ? 'grupos não aparecem' : 'grupo não aparece'} por ter menos de ${nMin} respondentes, para proteger o anonimato.`}
            </p>
          </div>
          <p className="md:hidden text-[11px] text-gray-400">
            Verde 70% ou mais, amarelo de 50% a 69%, vermelho abaixo de 50%. Toque em um grupo para ver só ele.
            {resultado.omitidos > 0 && ` ${resultado.omitidos} ${resultado.omitidos > 1 ? 'grupos não aparecem' : 'grupo não aparece'} por ter menos de ${nMin} respondentes.`}
          </p>
          </>
        )
      )}
    </div>
  )
}
