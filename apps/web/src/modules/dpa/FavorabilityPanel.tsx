/**
 * FavorabilidadePanel — resultados de uma pesquisa de clima por favorabilidade:
 * visão geral e por bloco, prioridades (importância × favorabilidade), riscos
 * psicossociais, ranking completo de perguntas e cruzamento bloco × unidade
 * (com N-mínimo). Só renderiza quando o projeto liga `config.favorabilidade`;
 * o cálculo vive em lib/favorability.
 */

import { useMemo, useState } from 'react'
import {
  favorabilityByBlock,
  favorabilityByQuestion,
  favorabilityByUnitAndBlock,
  favorabilityPooled,
  favorabilityPooledByUnit,
  compareBlocks,
  compareQuestions,
  compareUnits,
  deltaDirection,
  importanceByBlock,
  priorityMatrix,
  riskQuestions,
  topQuestions,
  bottomQuestions,
  type FavorabilityDelta,
  type PriorityQuadrant,
  type QuestionFavorability,
  type QuestionRef,
  type RespondentRow,
} from '@/lib/favorability'

interface Props {
  perguntas:    QuestionRef[]
  respondentes: RespondentRow[]
  labelUnidade: string
  nMin:         number
  /** Pergunta de múltipla escolha cujas opções são os blocos ("escolha os 4 mais importantes"). */
  importanciaPerguntaId?: string
  /** Edição anterior da mesma pesquisa, para o comparativo (mesmas perguntas e blocos). */
  anterior?: { rotulo: string; respondentes: RespondentRow[] }
  /** Pesquisas segmentadas: mostra em destaque a favorabilidade por dimensão escolhida (empresa, base, área). */
  mostrarPorDimensao?: boolean
}

const QUADRANT_STYLE: Record<PriorityQuadrant, { label: string; color: string }> = {
  prioridade:     { label: 'Prioridade de ação', color: '#dc2626' },
  manter:         { label: 'Manter',             color: '#16a34a' },
  monitorar:      { label: 'Monitorar',          color: '#6b7280' },
  menor_urgencia: { label: 'Menor urgência',     color: '#2563eb' },
}

function StackedBar({ fav, neu, des }: { fav: number; neu: number; des: number }) {
  return (
    <div
      className="flex h-2.5 w-full rounded-full overflow-hidden bg-gray-100"
      role="img"
      aria-label={`Favorável ${fav}%, neutro ${neu}%, desfavorável ${des}%`}
    >
      <div className="bg-green-500" style={{ width: `${fav}%` }} />
      <div className="bg-gray-300" style={{ width: `${neu}%` }} />
      <div className="bg-red-400" style={{ width: `${des}%` }} />
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
      <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Favorável: notas 4 e 5</span>
      <span><span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1" />Neutro: nota 3</span>
      <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />Desfavorável: notas 1 e 2</span>
    </div>
  )
}

function Trio({ fav, neu, des }: { fav: number; neu: number; des: number }) {
  return (
    <span className="tabular-nums whitespace-nowrap text-xs">
      <span className="font-semibold text-green-700">{fav}%</span>
      <span className="text-gray-300"> · </span>
      <span className="text-gray-500">{neu}%</span>
      <span className="text-gray-300"> · </span>
      <span className="text-red-600">{des}%</span>
    </span>
  )
}

function cellColor(pct: number | null): string {
  if (pct === null) return 'bg-gray-50 text-gray-300'
  if (pct >= 70) return 'bg-green-100 text-green-800'
  if (pct >= 50) return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-800'
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-gray-900">{children}</h3>
      {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
    </div>
  )
}

function QuestionList({ title, items, tone }: {
  title: string
  items: QuestionFavorability[]
  tone: 'good' | 'bad'
}) {
  return (
    <div className="flex-1 min-w-0">
      <h4 className="text-xs font-semibold text-gray-700 mb-2">{title}</h4>
      <ul className="space-y-2">
        {items.map((q) => (
          <li key={q.id} className="flex items-start gap-2 text-xs">
            <span className={`shrink-0 w-11 text-right font-semibold ${tone === 'good' ? 'text-green-700' : 'text-red-600'}`}>
              {q.favoravel}%
            </span>
            <span className="text-gray-700 leading-snug">{q.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function DeltaBadge({ delta }: { delta: number }) {
  const dir = deltaDirection(delta)
  const style = dir === 'up' ? 'text-green-700 bg-green-50'
    : dir === 'down' ? 'text-red-700 bg-red-50' : 'text-gray-600 bg-gray-100'
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '►'
  const sign = delta > 0 ? '+' : ''
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums whitespace-nowrap ${style}`}
      title={dir === 'stable' ? 'Variação dentro da margem de estabilidade (±2 p.p.)' : undefined}
    >
      <span aria-hidden="true">{arrow}</span>{sign}{delta.toString().replace('.', ',')} p.p.
    </span>
  )
}

function DeltaList({ title, items }: { title: string; items: FavorabilityDelta[] }) {
  return (
    <div className="flex-1 min-w-0">
      <h4 className="text-xs font-semibold text-gray-700 mb-2">{title}</h4>
      <ul className="space-y-2">
        {items.map((q) => (
          <li key={q.chave} className="flex items-start gap-2 text-xs">
            <span className="shrink-0 w-28"><DeltaBadge delta={q.delta} /></span>
            <span className="text-gray-700 leading-snug">
              {q.rotulo} <span className="text-gray-400">· {q.anterior}% → {q.atual}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PriorityChart({ pontos, corteFavoravel, corteImportancia }: ReturnType<typeof priorityMatrix>) {
  const W = 640, H = 340, L = 52, R = 16, T = 16, B = 40
  const xs = pontos.map((p) => p.favoravel)
  const ys = pontos.map((p) => p.importancia)
  const xMin = Math.max(0, Math.floor(Math.min(...xs, corteFavoravel) / 10) * 10 - 5)
  const xMax = Math.min(100, Math.ceil(Math.max(...xs, corteFavoravel) / 10) * 10 + 5)
  const yMin = Math.max(0, Math.floor(Math.min(...ys, corteImportancia) / 10) * 10 - 5)
  const yMax = Math.min(100, Math.ceil(Math.max(...ys, corteImportancia) / 10) * 10 + 5)
  const sx = (v: number) => L + ((v - xMin) / Math.max(1, xMax - xMin)) * (W - L - R)
  const sy = (v: number) => H - B - ((v - yMin) / Math.max(1, yMax - yMin)) * (H - T - B)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
      aria-label="Gráfico de favorabilidade por importância dos blocos">
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="none" stroke="#e5e7eb" />
      <line x1={sx(corteFavoravel)} x2={sx(corteFavoravel)} y1={T} y2={H - B} stroke="#9ca3af" strokeDasharray="4 3" />
      <line x1={L} x2={W - R} y1={sy(corteImportancia)} y2={sy(corteImportancia)} stroke="#9ca3af" strokeDasharray="4 3" />
      <text x={L + 6} y={T + 14} fontSize="11" fill="#dc2626">Prioridade de ação</text>
      <text x={W - R - 6} y={T + 14} fontSize="11" fill="#16a34a" textAnchor="end">Manter</text>
      <text x={L + 6} y={H - B - 8} fontSize="11" fill="#6b7280">Monitorar</text>
      <text x={W - R - 6} y={H - B - 8} fontSize="11" fill="#2563eb" textAnchor="end">Menor urgência</text>
      <text x={(L + W - R) / 2} y={H - 8} fontSize="11" fill="#6b7280" textAnchor="middle">Favorabilidade (%)</text>
      <text x={14} y={(T + H - B) / 2} fontSize="11" fill="#6b7280" textAnchor="middle"
        transform={`rotate(-90 14 ${(T + H - B) / 2})`}>Importância (%)</text>
      {pontos.map((p, i) => (
        <g key={p.bloco}>
          <circle cx={sx(p.favoravel)} cy={sy(p.importancia)} r="6" fill={QUADRANT_STYLE[p.quadrante].color} fillOpacity="0.85" />
          <text
            x={sx(p.favoravel) + (i % 2 === 0 ? 9 : -9)}
            y={sy(p.importancia) + 4}
            fontSize="10.5"
            fill="#374151"
            textAnchor={i % 2 === 0 ? 'start' : 'end'}
          >{p.bloco.length > 22 ? `${p.bloco.slice(0, 21)}…` : p.bloco}</text>
        </g>
      ))}
    </svg>
  )
}

export function FavorabilityPanel({ perguntas, respondentes, labelUnidade, nMin, importanciaPerguntaId, anterior, mostrarPorDimensao }: Props) {
  const [blocoFiltro, setBlocoFiltro] = useState<string>('')
  const [ordem, setOrdem] = useState<'desc' | 'asc'>('desc')

  const dados = useMemo(() => {
    const blocos = favorabilityByBlock(perguntas, respondentes)
    const perguntasFav = favorabilityByQuestion(perguntas, respondentes)
    const matriz = favorabilityByUnitAndBlock(perguntas, respondentes, nMin)
    const geralPorBase = favorabilityPooledByUnit(perguntas, respondentes, nMin)
    const totalN = blocos.reduce((s, b) => s + b.n, 0)
    const weigh = (key: 'favoravel' | 'neutro' | 'desfavoravel') =>
      totalN === 0 ? 0 : Math.round((blocos.reduce((s, b) => s + b[key] * b.n, 0) / totalN) * 10) / 10

    const riscoPerguntas = riskQuestions(perguntas)
    const riscoGeral = riscoPerguntas.length > 0 ? favorabilityPooled(riscoPerguntas, respondentes) : null
    const riscoPorBase = riscoPerguntas.length > 0
      ? favorabilityPooledByUnit(riscoPerguntas, respondentes, nMin) : null
    const riscoIds = new Set(riscoPerguntas.map((p) => p.id))
    const riscoItens = perguntasFav.filter((q) => riscoIds.has(q.id))

    const prioridades = importanciaPerguntaId
      ? priorityMatrix(blocos, importanceByBlock(importanciaPerguntaId, blocos.map((b) => b.bloco), respondentes))
      : null

    const geral = { favoravel: weigh('favoravel'), neutro: weigh('neutro'), desfavoravel: weigh('desfavoravel') }

    let comparativo: {
      geralDelta: number
      geralAnterior: number
      blocos: FavorabilityDelta[]
      melhoras: FavorabilityDelta[]
      pioras: FavorabilityDelta[]
      unidades: FavorabilityDelta[]
      respondentesAnterior: number
    } | null = null
    if (anterior && anterior.respondentes.length > 0) {
      const blocosAnt = favorabilityByBlock(perguntas, anterior.respondentes)
      const totalAnt = blocosAnt.reduce((s, b) => s + b.n, 0)
      const geralAnt = totalAnt === 0 ? 0
        : Math.round((blocosAnt.reduce((s, b) => s + b.favoravel * b.n, 0) / totalAnt) * 10) / 10
      const perguntasAnt = favorabilityByQuestion(perguntas, anterior.respondentes)
      const deltasPerg = compareQuestions(perguntasFav, perguntasAnt)
      comparativo = {
        geralDelta: Math.round((geral.favoravel - geralAnt) * 10) / 10,
        geralAnterior: geralAnt,
        blocos: compareBlocks(blocos, blocosAnt),
        melhoras: [...deltasPerg].filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5),
        pioras: [...deltasPerg].filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5),
        unidades: compareUnits(
          geralPorBase.unidades,
          favorabilityPooledByUnit(perguntas, anterior.respondentes, nMin).unidades,
        ),
        respondentesAnterior: anterior.respondentes.length,
      }
    }

    return {
      blocos, perguntasFav, matriz, geralPorBase, riscoGeral, riscoPorBase, riscoItens, prioridades, geral, comparativo,
    }
  }, [perguntas, respondentes, nMin, importanciaPerguntaId, anterior])

  const { blocos, perguntasFav, matriz, geralPorBase, riscoGeral, riscoPorBase, riscoItens, prioridades, geral, comparativo } = dados

  const ranking = useMemo(() => {
    const itens = perguntasFav.filter((q) => q.n > 0 && (!blocoFiltro || q.bloco === blocoFiltro))
    return itens.sort((a, b) => ordem === 'desc' ? b.favoravel - a.favoravel : a.favoravel - b.favoravel)
  }, [perguntasFav, blocoFiltro, ordem])

  if (blocos.length === 0 || respondentes.length === 0) return null

  const geralPorBaseMap = new Map(geralPorBase.unidades.map((u) => [u.unidade, u.favoravel]))
  const card = 'bg-white rounded-xl border border-gray-200 p-6'

  return (
    <div className="space-y-5">
      {/* Geral + blocos */}
      <div className={`${card} space-y-8`}>
        <div>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <h3 className="text-sm font-semibold text-gray-900">Favorabilidade geral</h3>
            <span className="flex items-baseline gap-2">
              {comparativo && <DeltaBadge delta={comparativo.geralDelta} />}
              <span className="text-2xl font-semibold text-gray-900">{geral.favoravel}%</span>
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Percentual de respostas 4 e 5 (concordo e concordo totalmente) em {respondentes.length.toLocaleString('pt-BR')} respondentes.
          </p>
          <StackedBar fav={geral.favoravel} neu={geral.neutro} des={geral.desfavoravel} />
          <div className="flex gap-4 mt-2 text-[11px] text-gray-500">
            <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Favorável {geral.favoravel}%</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1" />Neutro {geral.neutro}%</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />Desfavorável {geral.desfavoravel}%</span>
          </div>
        </div>

        <div>
          <SectionTitle hint="Clique em um bloco para ver suas perguntas no ranking abaixo.">
            Favorabilidade por bloco
          </SectionTitle>
          <div className="space-y-1">
            {[...blocos].sort((a, b) => b.favoravel - a.favoravel).map((b) => (
              <button
                key={b.bloco}
                type="button"
                onClick={() => setBlocoFiltro((cur) => (cur === b.bloco ? '' : b.bloco))}
                className={`w-full flex items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors ${
                  blocoFiltro === b.bloco ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}
              >
                <span className="text-xs text-gray-700 w-48 shrink-0 truncate" title={b.bloco}>{b.bloco}</span>
                <div className="flex-1"><StackedBar fav={b.favoravel} neu={b.neutro} des={b.desfavoravel} /></div>
                <span className="w-36 text-right shrink-0"><Trio fav={b.favoravel} neu={b.neutro} des={b.desfavoravel} /></span>
              </button>
            ))}
          </div>
          <div className="mt-3"><Legend /></div>
        </div>
      </div>

      {/* Favorabilidade pela dimensão escolhida em "Ver resultados por" */}
      {mostrarPorDimensao && (
        <div className={card}>
          <SectionTitle hint={`Favorabilidade geral (% de notas 4 e 5) de cada ${labelUnidade.toLowerCase()}. Grupos com menos de ${nMin} respondentes não aparecem, para proteger o anonimato.`}>
            Favorabilidade por {labelUnidade.toLowerCase()}
          </SectionTitle>
          {geralPorBase.unidades.length === 0 ? (
            <p className="text-sm text-gray-500">
              Não há grupos de {labelUnidade.toLowerCase()} com pelo menos {nMin} respondentes neste recorte.
              Se esta dimensão deveria ter dados, confira se os participantes foram carregados com ela.
            </p>
          ) : (
            <div className="space-y-1.5">
              {geralPorBase.unidades.map((u) => (
                <div key={u.unidade} className="flex items-center gap-3">
                  <span className="text-xs text-gray-700 w-52 shrink-0 truncate" title={u.unidade}>{u.unidade}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-green-500" style={{ width: `${u.favoravel}%` }} />
                  </div>
                  <span className="w-28 text-right text-xs tabular-nums shrink-0">
                    <span className="font-semibold text-green-700">{u.favoravel}%</span>
                    <span className="text-gray-400"> · {u.respondentes.toLocaleString('pt-BR')} resp.</span>
                  </span>
                </div>
              ))}
              {geralPorBase.omitidas > 0 && (
                <p className="text-[11px] text-gray-400 pt-1">
                  {geralPorBase.omitidas} {geralPorBase.omitidas > 1 ? 'grupos omitidos' : 'grupo omitido'} por ter menos de {nMin} respondentes.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Evolução em relação à edição anterior */}
      {comparativo && anterior && (
        <div className={`${card} space-y-6`}>
          <SectionTitle hint={`Favorabilidade (% de notas 4 e 5) de ${anterior.rotulo} para esta edição. Variações de até 2 p.p. contam como estabilidade.`}>
            Evolução em relação a {anterior.rotulo}
          </SectionTitle>
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
            <span>Geral: <strong>{comparativo.geralAnterior}%</strong> → <strong>{geral.favoravel}%</strong></span>
            <DeltaBadge delta={comparativo.geralDelta} />
            <span className="text-xs text-gray-400">
              {comparativo.respondentesAnterior.toLocaleString('pt-BR')} respondentes na edição anterior
            </span>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Por bloco</h4>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-1.5 pr-3 font-medium">Bloco</th>
                  <th className="py-1.5 px-2 font-medium text-right w-20">{anterior.rotulo}</th>
                  <th className="py-1.5 px-2 font-medium text-right w-20">Atual</th>
                  <th className="py-1.5 pl-2 font-medium text-right w-32">Variação</th>
                </tr>
              </thead>
              <tbody>
                {[...comparativo.blocos].sort((a, b) => b.delta - a.delta).map((b) => (
                  <tr key={b.chave} className="border-b border-gray-100">
                    <td className="py-2 pr-3 text-gray-800">{b.rotulo}</td>
                    <td className="py-2 px-2 text-right text-gray-500 tabular-nums">{b.anterior}%</td>
                    <td className="py-2 px-2 text-right font-semibold text-gray-900 tabular-nums">{b.atual}%</td>
                    <td className="py-2 pl-2 text-right"><DeltaBadge delta={b.delta} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col md:flex-row gap-6">
            <DeltaList title="Maiores melhoras (perguntas)" items={comparativo.melhoras} />
            <DeltaList title="Maiores quedas (perguntas)" items={comparativo.pioras} />
          </div>

          {comparativo.unidades.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 mb-2">Por {labelUnidade.toLowerCase()}</h4>
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {[...comparativo.unidades].sort((a, b) => b.delta - a.delta).map((u) => (
                  <li key={u.chave} className="flex items-center gap-2 text-xs">
                    <span className="w-36 truncate text-gray-700" title={u.rotulo}>{u.rotulo}</span>
                    <span className="text-gray-400 tabular-nums">{u.anterior}% → {u.atual}%</span>
                    <span className="ml-auto"><DeltaBadge delta={u.delta} /></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Prioridades */}
      {prioridades && prioridades.pontos.length > 0 && (
        <div className={card}>
          <SectionTitle hint="Cruza o que as pessoas dizem que mais importa com como a empresa está avaliada. Os cortes são as médias dos blocos.">
            Prioridades de ação
          </SectionTitle>
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 min-w-0"><PriorityChart {...prioridades} /></div>
            <div className="lg:w-60 shrink-0 space-y-2">
              {(['prioridade', 'manter', 'monitorar', 'menor_urgencia'] as PriorityQuadrant[]).map((q) => {
                const itens = prioridades.pontos.filter((p) => p.quadrante === q)
                  .sort((a, b) => b.importancia - a.importancia)
                if (itens.length === 0) return null
                return (
                  <div key={q}>
                    <p className="text-xs font-semibold" style={{ color: QUADRANT_STYLE[q].color }}>{QUADRANT_STYLE[q].label}</p>
                    <ul className="text-xs text-gray-700 space-y-0.5 mt-0.5">
                      {itens.map((p) => (
                        <li key={p.bloco}>{p.bloco} <span className="text-gray-400">· {p.favoravel}% fav. · {p.importancia}% importância</span></li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Riscos psicossociais */}
      {riscoGeral && riscoGeral.n > 0 && (
        <div className={`${card} space-y-6`}>
          <div>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <h3 className="text-sm font-semibold text-gray-900">Riscos psicossociais</h3>
              <span className="text-2xl font-semibold text-gray-900">{riscoGeral.favoravel}%</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Favorabilidade das {riscoItens.length} perguntas ligadas a carga, pressão, apoio, assédio e segurança psicológica,
              que atravessam vários blocos. Quanto menor, maior o risco.
            </p>
            <StackedBar fav={riscoGeral.favoravel} neu={riscoGeral.neutro} des={riscoGeral.desfavoravel} />
          </div>
          <div className="flex flex-col md:flex-row gap-6">
            <QuestionList
              title="10 maiores riscos"
              items={[...riscoItens].filter((q) => q.n > 0).sort((a, b) => a.favoravel - b.favoravel).slice(0, 10)}
              tone="bad"
            />
            {riscoPorBase && riscoPorBase.unidades.length > 0 && (
              <div className="md:w-72 shrink-0">
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Por {labelUnidade.toLowerCase()}</h4>
                <ul className="space-y-1.5">
                  {[...riscoPorBase.unidades].sort((a, b) => a.favoravel - b.favoravel).map((u) => (
                    <li key={u.unidade} className="flex items-center gap-2 text-xs">
                      <span className="w-32 truncate text-gray-700" title={u.unidade}>{u.unidade}</span>
                      <span className={`ml-auto rounded px-1.5 py-0.5 font-semibold ${cellColor(u.favoravel)}`}>{u.favoravel}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mais e menos favoráveis */}
      <div className={`${card} flex flex-col md:flex-row gap-6`}>
        <QuestionList title="10 mais favoráveis" items={topQuestions(perguntasFav, 10)} tone="good" />
        <QuestionList title="10 menos favoráveis" items={bottomQuestions(perguntasFav, 10)} tone="bad" />
      </div>

      {/* Ranking completo */}
      <div className={card}>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <SectionTitle hint={`${ranking.length} perguntas${blocoFiltro ? ` em "${blocoFiltro}"` : ''}.`}>
            Ranking de perguntas
          </SectionTitle>
          <div className="flex items-center gap-2">
            <select
              value={blocoFiltro}
              onChange={(e) => setBlocoFiltro(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5"
              aria-label="Filtrar por bloco"
            >
              <option value="">Todos os blocos</option>
              {blocos.map((b) => <option key={b.bloco} value={b.bloco}>{b.bloco}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setOrdem((o) => (o === 'desc' ? 'asc' : 'desc'))}
              className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 hover:bg-gray-50"
            >
              {ordem === 'desc' ? 'Maior favorabilidade primeiro' : 'Menor favorabilidade primeiro'}
            </button>
          </div>
        </div>
        <div className="mb-2"><Legend /></div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-1.5 pr-2 w-8 font-medium">#</th>
                <th className="py-1.5 pr-3 font-medium">Pergunta</th>
                <th className="py-1.5 pr-3 font-medium hidden md:table-cell">Bloco</th>
                <th className="py-1.5 px-2 font-medium w-36">Distribuição</th>
                <th className="py-1.5 pl-2 font-medium w-14 text-right text-green-700">Fav.</th>
                <th className="py-1.5 pl-2 font-medium w-14 text-right">Neutro</th>
                <th className="py-1.5 pl-2 font-medium w-14 text-right text-red-600">Desfav.</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((q, i) => (
                <tr key={q.id} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                  <td className="py-2 pr-3 text-gray-800 leading-snug">{q.texto}</td>
                  <td className="py-2 pr-3 text-gray-500 hidden md:table-cell">{q.bloco}</td>
                  <td className="py-2 px-2"><StackedBar fav={q.favoravel} neu={q.neutro} des={q.desfavoravel} /></td>
                  <td className="py-2 pl-2 text-right font-semibold text-green-700 tabular-nums">{q.favoravel}%</td>
                  <td className="py-2 pl-2 text-right text-gray-500 tabular-nums">{q.neutro}%</td>
                  <td className="py-2 pl-2 text-right text-red-600 tabular-nums">{q.desfavoravel}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bloco × unidade */}
      {matriz.unidades.length > 0 && (
        <div className={card}>
          <SectionTitle hint={`Grupos com menos de ${nMin} respondentes não aparecem, para proteger o anonimato.`}>
            Favorabilidade por bloco e {labelUnidade.toLowerCase()}
          </SectionTitle>
          <div className="overflow-x-auto -mx-2">
            <table className="text-xs border-separate border-spacing-1 min-w-full">
              <thead>
                <tr>
                  <th className="text-left font-medium text-gray-500 px-2 py-1 sticky left-0 bg-white">{labelUnidade}</th>
                  <th className="font-semibold text-gray-700 px-1 py-1 align-bottom min-w-[64px]">Geral</th>
                  {matriz.blocos.map((b) => (
                    <th key={b} className="font-medium text-gray-500 px-1 py-1 align-bottom min-w-[72px]">
                      <span className="block leading-tight">{b}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matriz.unidades.map((u) => {
                  const g = geralPorBaseMap.get(u) ?? null
                  return (
                    <tr key={u}>
                      <td className="text-gray-700 px-2 py-1 whitespace-nowrap sticky left-0 bg-white">{u}</td>
                      <td className={`text-center font-semibold rounded px-1 py-1.5 ${cellColor(g)}`}>{g !== null ? `${g}%` : '–'}</td>
                      {matriz.blocos.map((b) => {
                        const c = matriz.celulas[u]?.[b]
                        return (
                          <td key={b} className={`text-center font-semibold rounded px-1 py-1.5 ${cellColor(c?.favoravel ?? null)}`}>
                            {c?.favoravel !== null && c?.favoravel !== undefined ? `${c.favoravel}%` : '–'}
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
      )}
    </div>
  )
}
